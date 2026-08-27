import crypto from 'crypto'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, '..', '.env') })

const COS_SECRET_ID = String(process.env.COS_SECRET_ID || '').trim()
const COS_SECRET_KEY = String(process.env.COS_SECRET_KEY || '').trim()
const COS_BUCKET = String(process.env.COS_BUCKET || '').trim()
const COS_REGION = String(process.env.COS_REGION || '').trim()
const COS_KEY_PREFIX = String(process.env.COS_KEY_PREFIX || '').trim().replace(/^\/+|\/+$/g, '')
const COS_SIGNED_URL_EXPIRES_SECONDS = Math.max(60, Number(process.env.COS_SIGNED_URL_EXPIRES_SECONDS || 300) || 300)

// ---------------------------------------------------------------------------
// 只读签名 URL:时间窗口对齐 + 自研签名
//
// 背景:SDK getObjectUrl 每次调用都用当前时间重新计算签名,同一对象每次生成
// 不同 URL,浏览器/CDN 按"完整 URL"缓存,导致 Cache-Control 形同虚设、
// 每次浏览都全量重下(外网下行流量被放大数倍)。
//
// 方案:签名起止时间按窗口(默认 24h,UTC 整点对齐)取整 —— 窗口内任何请求
// 生成的 URL 完全一致,浏览器缓存真正命中;总有效期(默认 48h)覆盖窗口滚动,
// 保证缓存中的旧 URL 在下一窗口仍可用。
// ---------------------------------------------------------------------------
const COS_SIGNED_URL_WINDOW_SECONDS = Math.max(0, Number(process.env.COS_SIGNED_URL_WINDOW_SECONDS ?? 86400) || 0)
const COS_SIGNED_URL_TTL_SECONDS = Math.max(
  Number(process.env.COS_SIGNED_URL_TTL_SECONDS ?? 172800) || 172800,
  COS_SIGNED_URL_WINDOW_SECONDS + 7200
)

// 图片处理变体(数据万象 imageMogr2):公网原图直出是流量大头,
// 读图时按变体出 WebP 缩略图。COS_IMAGE_VARIANTS_ENABLED=false 可整体关闭
// (如桶未开通数据万象基础图片处理时)。
const COS_IMAGE_VARIANTS_ENABLED = String(process.env.COS_IMAGE_VARIANTS_ENABLED ?? 'true').trim().toLowerCase() !== 'false'
const IMAGE_VARIANT_PRESETS = Object.freeze({
  thumb: 'format/webp/thumbnail/500x>',
  mid: 'format/webp/thumbnail/1000x>',
  full: 'format/webp/thumbnail/1920x>'
})
const IMAGE_LIKE_KEY_REGEX = /\.(jpe?g|png|webp|bmp)$/i
const COS_MANAGED_ROUTE_REGEX = /^\/api\/uploads\/files\/(listing-images|chat-images|ban-images|ban-videos)\/([A-Za-z0-9._-]+)$/i
const MANAGED_FOLDERS = new Set(['listing-images', 'chat-images', 'ban-images', 'ban-videos'])

let sharedCosClientPromise = null
let hasLoggedCosReady = false
let hasLoggedCosFallback = false

function buildManagedMediaUrl(folderName, fileName) {
  return `/api/uploads/files/${folderName}/${fileName}`
}

function normalizeManagedFolderName(folderName) {
  const normalized = String(folderName || '').trim().toLowerCase()
  return MANAGED_FOLDERS.has(normalized) ? normalized : ''
}

function buildObjectKey(folderName, fileName) {
  const safeFolderName = normalizeManagedFolderName(folderName)
  const safeFileName = String(fileName || '').trim()
  if (!safeFolderName || !safeFileName) {
    return ''
  }
  return [COS_KEY_PREFIX, safeFolderName, safeFileName].filter(Boolean).join('/')
}

function resolveManagedTargetByUrl(mediaUrl) {
  const normalizedUrl = String(mediaUrl || '').trim()
  const matched = normalizedUrl.match(COS_MANAGED_ROUTE_REGEX)
  if (!matched) {
    return null
  }

  const folderName = normalizeManagedFolderName(matched[1])
  const fileName = String(matched[2] || '').trim()
  const objectKey = buildObjectKey(folderName, fileName)
  if (!folderName || !fileName || !objectKey) {
    return null
  }

  return {
    folderName,
    fileName,
    objectKey,
    mediaUrl: buildManagedMediaUrl(folderName, fileName)
  }
}

function isCosConfigured() {
  return Boolean(COS_SECRET_ID && COS_SECRET_KEY && COS_BUCKET && COS_REGION)
}

async function createCosClient() {
  if (!isCosConfigured()) {
    return null
  }

  try {
    const { default: COS } = await import('cos-nodejs-sdk-v5')
    const client = new COS({
      SecretId: COS_SECRET_ID,
      SecretKey: COS_SECRET_KEY
    })

    if (!hasLoggedCosReady) {
      hasLoggedCosReady = true
      console.log('[cos] client enabled')
    }

    return client
  } catch (error) {
    if (!hasLoggedCosFallback) {
      hasLoggedCosFallback = true
      console.warn('[cos] unavailable:', error?.message || error)
    }
    return null
  }
}

async function getCosClient() {
  if (!sharedCosClientPromise) {
    sharedCosClientPromise = createCosClient()
  }
  return sharedCosClientPromise
}

function callCos(client, methodName, params) {
  return new Promise((resolve, reject) => {
    client[methodName](params, (error, data) => {
      if (error) {
        reject(error)
        return
      }
      resolve(data)
    })
  })
}

export function getCosRuntimeConfig() {
  return {
    COS_BUCKET,
    COS_REGION,
    COS_KEY_PREFIX,
    COS_SIGNED_URL_EXPIRES_SECONDS,
    COS_SIGNED_URL_WINDOW_SECONDS,
    COS_SIGNED_URL_TTL_SECONDS,
    COS_IMAGE_VARIANTS_ENABLED,
    enabled: isCosConfigured()
  }
}

// ---------------------------------------------------------------------------
// COS XML API 签名实现(仅 GET 读)
// 故意不签 host(header 列表为空):同一签名 URL 在公网/内网域名下均有效,
// 服务端代理可用 cos-internal 域名拉取,内网流量不计外网下行费用。
// ---------------------------------------------------------------------------
function rfc3986Encode(value) {
  return encodeURIComponent(String(value)).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  )
}

function hmacSha1Hex(key, value) {
  return crypto.createHmac('sha1', key).update(value).digest('hex')
}

function sha1Hex(value) {
  return crypto.createHash('sha1').update(value).digest('hex')
}

function getCurrentKeyTimeSpan() {
  const now = Math.floor(Date.now() / 1000)
  if (COS_SIGNED_URL_WINDOW_SECONDS <= 1) {
    return { start: now - 60, end: now + COS_SIGNED_URL_TTL_SECONDS }
  }
  const windowStart = Math.floor(now / COS_SIGNED_URL_WINDOW_SECONDS) * COS_SIGNED_URL_WINDOW_SECONDS
  return {
    start: windowStart - 60,
    end: windowStart + COS_SIGNED_URL_TTL_SECONDS
  }
}

function buildCosHost(endpointKind) {
  const internalSuffix = endpointKind === 'internal' ? '-internal' : ''
  return `${COS_BUCKET}.cos${internalSuffix}.${COS_REGION}.myqcloud.com`
}

export function resolveImageVariant(name) {
  if (!COS_IMAGE_VARIANTS_ENABLED) return ''
  const preset = IMAGE_VARIANT_PRESETS[String(name || '').trim().toLowerCase()]
  return preset || ''
}

// 变体是否适用于该对象(仅静态图片;视频/GIF 不做 imageMogr2 处理)
function resolveImageParamsFor(objectKey, variantName) {
  if (!IMAGE_LIKE_KEY_REGEX.test(objectKey)) return ''
  return resolveImageVariant(variantName)
}

function buildCosObjectReadUrl(objectKey, { endpointKind = 'public', imageVariant = '' } = {}) {
  const keyTime = getCurrentKeyTimeSpan()
  const keyTimeString = `${keyTime.start};${keyTime.end}`
  const encodedPath = `/${objectKey.split('/').map(rfc3986Encode).join('/')}`

  // httpString = method\npath\nparams\nheaders\n;params/headers 均不签(空)
  const httpString = `get\n${encodedPath}\n\n\n`
  const signKey = hmacSha1Hex(COS_SECRET_KEY, keyTimeString)
  const stringToSign = `sha1\n${keyTimeString}\n${sha1Hex(httpString)}\n`
  const signature = hmacSha1Hex(signKey, stringToSign)

  const query = [
    'q-sign-algorithm=sha1',
    `q-ak=${rfc3986Encode(COS_SECRET_ID)}`,
    `q-sign-time=${keyTimeString}`,
    `q-key-time=${keyTimeString}`,
    'q-header-list=',
    'q-url-param-list=',
    `q-signature=${signature}`
  ]

  // 数据万象参数不参与 COS 签名校验,按官方无等号格式追加在签名之后:
  // ?imageMogr2/format/webp/thumbnail/500x>(实测 876KB PNG → 14KB WebP;
  // 注意 key=value 形式会被 COS 静默忽略,必须是无等号格式)
  const imageParams = resolveImageParamsFor(objectKey, imageVariant)
  if (imageParams) {
    query.push(`imageMogr2/${imageParams.replace(/>/g, '%3E')}`)
  }

  return `https://${buildCosHost(endpointKind)}${encodedPath}?${query.join('&')}`
}

// 302 重定向可缓存的最大秒数:必须保证缓存命中的签名 URL 仍在其有效期内。
// 最坏情况(窗口最后一秒签出)URL 剩余寿命 = TTL - 窗口长度,再留 60s 余量。
export function getCosRedirectMaxAgeSeconds() {
  if (COS_SIGNED_URL_WINDOW_SECONDS <= 1) {
    return 0
  }
  return Math.max(0, COS_SIGNED_URL_TTL_SECONDS - COS_SIGNED_URL_WINDOW_SECONDS - 60)
}

export function buildManagedUploadUrl(folderName, fileName) {
  return buildManagedMediaUrl(folderName, fileName)
}

export function resolveManagedUploadByUrl(mediaUrl) {
  return resolveManagedTargetByUrl(mediaUrl)
}

export async function uploadManagedFileToCos({
  folderName,
  fileName,
  body,
  contentType,
  cacheControl = 'public, max-age=31536000, immutable'
}) {
  const client = await getCosClient()
  const objectKey = buildObjectKey(folderName, fileName)
  if (!client || !objectKey) {
    throw new Error('COS 未配置或对象键无效')
  }

  await callCos(client, 'putObject', {
    Bucket: COS_BUCKET,
    Region: COS_REGION,
    Key: objectKey,
    Body: body,
    ContentType: String(contentType || 'application/octet-stream').trim() || 'application/octet-stream',
    CacheControl: String(cacheControl || '').trim() || undefined
  })

  return {
    fileName,
    key: objectKey,
    url: buildManagedMediaUrl(folderName, fileName)
  }
}

export async function deleteManagedFileByUrl(mediaUrl) {
  const client = await getCosClient()
  const target = resolveManagedTargetByUrl(mediaUrl)
  if (!client || !target?.objectKey) {
    return false
  }

  await callCos(client, 'deleteObject', {
    Bucket: COS_BUCKET,
    Region: COS_REGION,
    Key: target.objectKey
  })
  return true
}

// 生成托管文件的只读签名 URL。
// options.variant: thumb/mid/full 图片变体(非图片对象自动忽略)
// options.endpointKind: 'public'(给浏览器 302 直连) / 'internal'(服务端代理拉取,同地域免外网流量)
export async function buildManagedFileReadUrl(mediaUrl, options = {}) {
  if (!isCosConfigured()) {
    return ''
  }
  const target = resolveManagedTargetByUrl(mediaUrl)
  if (!target?.objectKey) {
    return ''
  }

  return buildCosObjectReadUrl(target.objectKey, {
    endpointKind: options.endpointKind === 'internal' ? 'internal' : 'public',
    imageVariant: String(options.variant || '')
  })
}
