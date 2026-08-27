/**
 * 媒体加载优化工具
 *
 * 1. withMediaVariant — 给托管上传 URL 附加 ?variant=thumb|mid|full,
 *    服务端据此经数据万象出 WebP 缩略图,大幅降低图片下行流量
 *    (500px WebP 缩略 vs 手机原图 3-8MB,通常小 5-10 倍)。
 * 2. handleMediaImageError — 变体请求失败(如桶未开通数据万象)时
 *    自动去掉参数回退原图,只重试一次。
 * 3. compressImageForUpload — JPEG 上传前 canvas 降采样,
 *    从源头减小原始文件体积(PNG 截图/GIF 动图不动)。
 */

const MANAGED_MEDIA_URL_REGEX = /^\/api\/uploads\/files\/(listing-images|ban-images|chat-images)\/([A-Za-z0-9._-]+)$/i

export function isManagedMediaUrl(url) {
  const target = String(url || '').trim()
  return MANAGED_MEDIA_URL_REGEX.test(target.split('?')[0])
}

export function withMediaVariant(url, variant = '') {
  const target = String(url || '').trim()
  const safeVariant = String(variant || '').trim()
  if (!target || !safeVariant) return target
  if (!isManagedMediaUrl(target)) return target
  if (/[?&]variant=/.test(target)) return target
  return `${target}${target.includes('?') ? '&' : '?'}variant=${safeVariant}`
}

export function stripMediaVariant(url) {
  return String(url || '')
    .replace(/([?&])variant=[^&]*/g, '$1')
    .replace(/[?&]+$/, '')
}

export function handleMediaImageError(event) {
  const img = event?.target
  if (!img || img.dataset?.mediaVariantFallback === '1') return
  const src = String(img.getAttribute('src') || '')
  if (!/[?&]variant=/.test(src)) return
  img.dataset.mediaVariantFallback = '1'
  img.src = stripMediaVariant(src)
}

// ---------------------------------------------------------------------------
// 上传端压缩:仅处理 JPEG 照片(手机原图是流量大头);PNG/GIF 原样返回
// ---------------------------------------------------------------------------
const UPLOAD_COMPRESS_MAX_DIMENSION = 2560
const UPLOAD_COMPRESS_QUALITY = 0.85
const UPLOAD_COMPRESS_MIN_SIZE_BYTES = 400 * 1024

export async function compressImageForUpload(file, { maxDimension = UPLOAD_COMPRESS_MAX_DIMENSION, quality = UPLOAD_COMPRESS_QUALITY } = {}) {
  if (!file || file.type !== 'image/jpeg' || file.size < UPLOAD_COMPRESS_MIN_SIZE_BYTES) {
    return file
  }
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    return file
  }

  try {
    const bitmap = await createImageBitmap(file)
    const longestSide = Math.max(bitmap.width, bitmap.height)
    const scale = Math.min(1, maxDimension / longestSide)
    if (scale >= 1 && file.size < 1.5 * 1024 * 1024) {
      bitmap.close?.()
      return file
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob || blob.size >= file.size) {
      return file
    }

    return new File([blob], file.name, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch (_error) {
    return file
  }
}
