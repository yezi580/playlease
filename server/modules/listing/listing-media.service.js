/**
 * 商品、封禁与聊天上传内容的媒体持久化辅助逻辑。
 */

function normalizeListingImagesPayload(imagesPayload) {
  if (imagesPayload === undefined || imagesPayload === null) {
    return []
  }
  if (!Array.isArray(imagesPayload)) {
    return null
  }
  return imagesPayload.map((item) => String(item || '').trim()).filter(Boolean)
}

export function createListingMediaService({
  fs,
  path,
  listingImagesUploadDir,
  banImagesUploadDir,
  banVideosUploadDir,
  chatImagesUploadDir,
  listingImageUploadUrlRegex,
  chatImageUploadUrlRegex,
  banImageUploadUrlRegex,
  banVideoUploadUrlRegex,
  maxListingImageCount,
  hasListingImageSortOrder,
  hasBanImageSortOrder,
  deleteManagedFileByUrl
}) {
  function getListingImagesOrderSql(alias = '') {
    const prefix = alias ? `${alias}.` : ''
    return hasListingImageSortOrder()
      ? `${prefix}sort_order ASC, ${prefix}id ASC`
      : `${prefix}id ASC`
  }

  function getBanImagesOrderSql(alias = '') {
    const prefix = alias ? `${alias}.` : ''
    return hasBanImageSortOrder()
      ? `${prefix}sort_order ASC, ${prefix}id ASC`
      : `${prefix}id ASC`
  }

  function getTrustedBanMediaPayload(payload) {
    const banRecord = String(payload.banRecord || '').trim()
    const banImages = Array.isArray(payload.banImages)
      ? payload.banImages.map((item) => String(item || '').trim()).filter(Boolean)
      : []
    const banVideo = String(payload.banVideo || '').trim()

    if (banRecord === '有') {
      return {
        banImages,
        banVideo: banVideo || null
      }
    }

    return {
      banImages: [],
      banVideo: banVideo || null
    }
  }

  function isManagedUploadUrl(mediaUrl) {
    const normalizedUrl = String(mediaUrl || '').trim()
    return (
      listingImageUploadUrlRegex.test(normalizedUrl) ||
      chatImageUploadUrlRegex.test(normalizedUrl) ||
      banImageUploadUrlRegex.test(normalizedUrl) ||
      banVideoUploadUrlRegex.test(normalizedUrl)
    )
  }

  function resolveManagedUploadPath(mediaUrl) {
    const normalizedUrl = String(mediaUrl || '').trim()
    if (listingImageUploadUrlRegex.test(normalizedUrl)) {
      const fileName = normalizedUrl.replace('/api/uploads/files/listing-images/', '')
      return path.join(listingImagesUploadDir, fileName)
    }

    if (chatImageUploadUrlRegex.test(normalizedUrl)) {
      const fileName = normalizedUrl.replace('/api/uploads/files/chat-images/', '')
      return path.join(chatImagesUploadDir, fileName)
    }

    if (banImageUploadUrlRegex.test(normalizedUrl)) {
      const fileName = normalizedUrl.replace('/api/uploads/files/ban-images/', '')
      return path.join(banImagesUploadDir, fileName)
    }

    if (banVideoUploadUrlRegex.test(normalizedUrl)) {
      const fileName = normalizedUrl.replace('/api/uploads/files/ban-videos/', '')
      return path.join(banVideosUploadDir, fileName)
    }

    return ''
  }

  function getTrustedListingImagesPayload(payload) {
    return normalizeListingImagesPayload(payload.images) || []
  }

  function getObsoleteListingImageUrls(previousImages, payload) {
    const previousUrls = previousImages
      .map((row) => String(row?.image_url || '').trim())
      .filter(Boolean)
    const nextUrls = new Set(getTrustedListingImagesPayload(payload))

    return previousUrls.filter((url) => !nextUrls.has(url))
  }

  function getObsoleteBanMediaUrls(previousBanImages, previousBanVideo, payload) {
    const nextBanMedia = getTrustedBanMediaPayload(payload)
    const previousUrls = [
      ...previousBanImages.map((row) => String(row?.image_url || '').trim()).filter(Boolean),
      String(previousBanVideo || '').trim()
    ].filter(Boolean)
    const nextUrls = new Set([
      ...nextBanMedia.banImages,
      String(nextBanMedia.banVideo || '').trim()
    ].filter(Boolean))

    return previousUrls.filter((url) => !nextUrls.has(url))
  }

  async function isManagedUploadUrlStillReferenced(db, mediaUrl) {
    const normalizedUrl = String(mediaUrl || '').trim()
    if (!normalizedUrl) return false

    const [[listingImageRefRow]] = await db.execute(
      'SELECT COUNT(*) AS total FROM listing_images WHERE image_url = ?',
      [normalizedUrl]
    )
    if (Number(listingImageRefRow?.total || 0) > 0) {
      return true
    }

    const [[chatImageRefRow]] = await db.execute(
      'SELECT COUNT(*) AS total FROM conversation_messages WHERE media_url = ?',
      [normalizedUrl]
    )
    if (Number(chatImageRefRow?.total || 0) > 0) {
      return true
    }

    const [[videoRefRow]] = await db.execute(
      'SELECT COUNT(*) AS total FROM listings WHERE ban_video_url = ?',
      [normalizedUrl]
    )
    if (Number(videoRefRow?.total || 0) > 0) {
      return true
    }

    const [[imageRefRow]] = await db.execute(
      'SELECT COUNT(*) AS total FROM listing_ban_images WHERE image_url = ?',
      [normalizedUrl]
    )
    return Number(imageRefRow?.total || 0) > 0
  }

  async function cleanupOrphanUploadedFiles(db, mediaUrls) {
    for (const mediaUrl of mediaUrls) {
      if (!isManagedUploadUrl(mediaUrl)) continue

      try {
        const isStillReferenced = await isManagedUploadUrlStillReferenced(db, mediaUrl)
        if (isStillReferenced) continue
        if (chatImageUploadUrlRegex.test(String(mediaUrl || '').trim())) {
          await db.execute('DELETE FROM conversation_message_uploads WHERE media_url = ?', [String(mediaUrl || '').trim()])
        }
        if (typeof deleteManagedFileByUrl === 'function') {
          await deleteManagedFileByUrl(mediaUrl)
        } else {
          const filePath = resolveManagedUploadPath(mediaUrl)
          if (!filePath) continue
          await fs.promises.unlink(filePath)
        }
      } catch (error) {
        if (error?.code === 'NoSuchKey' || error?.statusCode === 404 || error?.code === 'ENOENT') continue
        console.error('[uploaded-media-cleanup] failed:', { mediaUrl, message: error.message })
      }
    }
  }

  async function saveListingBanMedia(conn, listingId, payload) {
    const banMedia = getTrustedBanMediaPayload(payload)

    await conn.execute('DELETE FROM listing_ban_images WHERE listing_id = ?', [listingId])
    for (const [index, imageUrl] of banMedia.banImages.entries()) {
      await conn.execute(
        `INSERT INTO listing_ban_images (listing_id, image_url, sort_order)
         VALUES (?, ?, ?)`,
        [listingId, imageUrl, index]
      )
    }

    await conn.execute('UPDATE listings SET ban_video_url = ? WHERE id = ?', [banMedia.banVideo, listingId])
  }

  async function saveListingImages(conn, listingId, payload) {
    const images = getTrustedListingImagesPayload(payload)

    await conn.execute('DELETE FROM listing_images WHERE listing_id = ?', [listingId])
    for (const [index, imageUrl] of images.slice(0, maxListingImageCount).entries()) {
      if (!imageUrl) continue
      await conn.execute(
        `INSERT INTO listing_images (listing_id, image_url, sort_order)
         VALUES (?, ?, ?)`,
        [listingId, imageUrl, index]
      )
    }
  }

  async function fetchListingBanImages(db, listingId) {
    const [rows] = await db.execute(
      `SELECT image_url
       FROM listing_ban_images
       WHERE listing_id = ?
       ORDER BY ${getBanImagesOrderSql()}`,
      [listingId]
    )
    return rows
  }

  return {
    getListingImagesOrderSql,
    getObsoleteListingImageUrls,
    getObsoleteBanMediaUrls,
    cleanupOrphanUploadedFiles,
    saveListingBanMedia,
    saveListingImages,
    fetchListingBanImages
  }
}
