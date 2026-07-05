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
    enabled: isCosConfigured()
  }
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

export async function buildManagedFileReadUrl(mediaUrl, expiresSeconds = COS_SIGNED_URL_EXPIRES_SECONDS) {
  const client = await getCosClient()
  const target = resolveManagedTargetByUrl(mediaUrl)
  if (!client || !target?.objectKey) {
    return ''
  }

  const result = await callCos(client, 'getObjectUrl', {
    Bucket: COS_BUCKET,
    Region: COS_REGION,
    Key: target.objectKey,
    Sign: true,
    Expires: Math.max(60, Number(expiresSeconds || 0) || COS_SIGNED_URL_EXPIRES_SECONDS)
  })

  return String(result?.Url || result?.url || '').trim()
}
