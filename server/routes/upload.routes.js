import { Readable } from 'stream'

export function registerUploadRoutes(deps) {
  const {
    app,
    fs,
    path,
    pool,
    authRequired,
    getOptionalAuth,
    isSafeUploadFileName,
    toUploadFileUrl,
    buildManagedFileReadUrl,
    uploadManagedFileToCos,
    deleteManagedFileByUrl,
    storageDriver,
    useCosStorage,
    cosEnabled,
    getConversationForUser,
    recordConversationMessageUpload,
    canAccessBanImageByUrl,
    canAccessBanVideoByUrl,
    canAccessConversationImageByUrl,
    BAN_IMAGES_UPLOAD_DIR,
    BAN_VIDEOS_UPLOAD_DIR,
    CHAT_IMAGES_UPLOAD_DIR,
    LISTING_IMAGES_UPLOAD_DIR,
    banImageUploader,
    MAX_BAN_IMAGE_COUNT,
    getUploadErrorMessage,
    listingImageUploader,
    MAX_LISTING_IMAGE_COUNT,
    banVideoUploader,
    chatImageUploader,
    CHAT_IMAGE_UPLOAD_RATE_LIMIT_WINDOW_MS,
    USER_DAILY_UPLOAD_LIMIT_BYTES,
    chatImageUploadRateStore,
    cleanupOrphanUploadedFiles,
    LISTING_IMAGE_UPLOAD_URL_REGEX,
    CHAT_IMAGE_UPLOAD_URL_REGEX,
    BAN_IMAGE_UPLOAD_URL_REGEX,
    BAN_VIDEO_UPLOAD_URL_REGEX
  } = deps

  void useCosStorage

  function isLocalStorage() {
    return storageDriver === 'local'
  }

  function isCosStorage() {
    return storageDriver === 'cos'
  }

  function getUploadedFiles(req) {
    if (Array.isArray(req?.files)) {
      return req.files
    }
    if (req?.file) {
      return [req.file]
    }
    return []
  }

  function getUploadedBytes(files) {
    return (Array.isArray(files) ? files : []).reduce((total, file) => {
      return total + Math.max(0, Number(file?.size || 0))
    }, 0)
  }

  function formatBytes(bytes) {
    const normalizedBytes = Math.max(0, Number(bytes || 0))
    if (normalizedBytes >= 1024 * 1024) {
      return `${(normalizedBytes / (1024 * 1024)).toFixed(0)}MB`
    }
    if (normalizedBytes >= 1024) {
      return `${(normalizedBytes / 1024).toFixed(0)}KB`
    }
    return `${normalizedBytes}B`
  }

  function buildDailyUploadLimitMessage() {
    return `今日上传累计已达上限（${formatBytes(USER_DAILY_UPLOAD_LIMIT_BYTES)}），请明天再试`
  }

  async function reserveChatImageUploadQuota(userId) {
    const safeUserId = Number(userId || 0)
    if (!safeUserId) {
      return { allowed: false, retryAfterMs: CHAT_IMAGE_UPLOAD_RATE_LIMIT_WINDOW_MS, token: 0 }
    }

    if (!chatImageUploadRateStore || typeof chatImageUploadRateStore.consume !== 'function') {
      return { allowed: true, retryAfterMs: 0, token: '' }
    }

    return chatImageUploadRateStore.consume(`user:${safeUserId}`)
  }

  async function rollbackChatImageUploadQuota(userId, token) {
    const safeUserId = Number(userId || 0)
    const safeToken = String(token || '').trim()
    if (!safeUserId || !safeToken) return

    if (!chatImageUploadRateStore || typeof chatImageUploadRateStore.rollback !== 'function') {
      return
    }

    await chatImageUploadRateStore.rollback(`user:${safeUserId}`, safeToken)
  }

  async function reserveDailyUploadQuota(userId, files) {
    const safeUserId = Number(userId || 0)
    const safeFiles = Array.isArray(files) ? files : []
    const totalBytes = getUploadedBytes(safeFiles)
    const fileCount = safeFiles.length

    if (!safeUserId || totalBytes <= 0 || fileCount <= 0 || USER_DAILY_UPLOAD_LIMIT_BYTES <= 0) {
      return {
        allowed: true,
        reservedBytes: 0,
        reservedCount: 0
      }
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await conn.execute(
        `INSERT INTO user_upload_daily_stats (user_id, upload_date, total_bytes, upload_count, last_uploaded_at)
         VALUES (?, CURDATE(), 0, 0, NULL)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
        [safeUserId]
      )

      const [[statsRow]] = await conn.execute(
        `SELECT total_bytes
         FROM user_upload_daily_stats
         WHERE user_id = ?
           AND upload_date = CURDATE()
         LIMIT 1
         FOR UPDATE`,
        [safeUserId]
      )

      const currentBytes = Math.max(0, Number(statsRow?.total_bytes || 0))
      if (currentBytes + totalBytes > USER_DAILY_UPLOAD_LIMIT_BYTES) {
        await conn.rollback()
        return {
          allowed: false,
          reservedBytes: 0,
          reservedCount: 0
        }
      }

      await conn.execute(
        `UPDATE user_upload_daily_stats
         SET total_bytes = total_bytes + ?,
             upload_count = upload_count + ?,
             last_uploaded_at = NOW()
         WHERE user_id = ?
           AND upload_date = CURDATE()`,
        [totalBytes, fileCount, safeUserId]
      )
      await conn.commit()

      return {
        allowed: true,
        reservedBytes: totalBytes,
        reservedCount: fileCount
      }
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }

  async function rollbackDailyUploadQuota(userId, reservedBytes, reservedCount) {
    const safeUserId = Number(userId || 0)
    const safeReservedBytes = Math.max(0, Number(reservedBytes || 0))
    const safeReservedCount = Math.max(0, Number(reservedCount || 0))
    if (!safeUserId || USER_DAILY_UPLOAD_LIMIT_BYTES <= 0 || (safeReservedBytes <= 0 && safeReservedCount <= 0)) {
      return
    }

    await pool.execute(
      `UPDATE user_upload_daily_stats
       SET total_bytes = GREATEST(total_bytes - ?, 0),
           upload_count = GREATEST(upload_count - ?, 0)
       WHERE user_id = ?
         AND upload_date = CURDATE()`,
      [safeReservedBytes, safeReservedCount, safeUserId]
    )
  }

  function ensureStorageReady(res) {
    if (isCosStorage() && !cosEnabled) {
      res.status(503).json({ message: '文件存储服务尚未配置完成，请稍后再试' })
      return false
    }
    return true
  }

  async function redirectToCosFile(res, mediaUrl) {
    const signedUrl = await buildManagedFileReadUrl(mediaUrl)
    if (!signedUrl) {
      return res.status(404).json({ message: '文件不存在或无法访问' })
    }
    return res.redirect(signedUrl)
  }

  async function proxyCosFile(req, res, mediaUrl) {
    const signedUrl = await buildManagedFileReadUrl(mediaUrl)
    if (!signedUrl) {
      return res.status(404).json({ message: '文件不存在或无法访问' })
    }

    const upstreamHeaders = new Headers()
    const headerNames = ['range', 'if-none-match', 'if-modified-since', 'if-range']
    headerNames.forEach((headerName) => {
      const headerValue = req.headers[headerName]
      if (typeof headerValue === 'string' && headerValue.trim()) {
        upstreamHeaders.set(headerName, headerValue)
      }
    })

    const upstreamResponse = await fetch(signedUrl, {
      method: 'GET',
      headers: upstreamHeaders
    })

    if (!upstreamResponse.ok && upstreamResponse.status !== 304) {
      return res.status(upstreamResponse.status || 502).json({ message: '文件不存在或无法访问' })
    }

    const passthroughHeaderNames = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'cache-control',
      'etag',
      'last-modified'
    ]
    passthroughHeaderNames.forEach((headerName) => {
      const headerValue = upstreamResponse.headers.get(headerName)
      if (headerValue) {
        res.setHeader(headerName, headerValue)
      }
    })

    res.status(upstreamResponse.status)
    if (!upstreamResponse.body) {
      return res.end()
    }

    return Readable.fromWeb(upstreamResponse.body).pipe(res)
  }

  function resolveLocalManagedFilePath(folderName, fileName) {
    const safeFolderName = String(folderName || '').trim()
    const safeFileName = String(fileName || '').trim()
    const baseDirMap = {
      'listing-images': LISTING_IMAGES_UPLOAD_DIR,
      'ban-images': BAN_IMAGES_UPLOAD_DIR,
      'ban-videos': BAN_VIDEOS_UPLOAD_DIR,
      'chat-images': CHAT_IMAGES_UPLOAD_DIR
    }
    const baseDir = baseDirMap[safeFolderName]
    if (!baseDir || !safeFileName) return ''
    return path.join(baseDir, safeFileName)
  }

  async function sendLocalManagedFile(res, folderName, fileName) {
    const filePath = resolveLocalManagedFilePath(folderName, fileName)
    if (!filePath) {
      return res.status(404).json({ message: '文件不存在或无法访问' })
    }
    try {
      await fs.promises.access(filePath, fs.constants.R_OK)
      return res.sendFile(filePath)
    } catch (_error) {
      return res.status(404).json({ message: '文件不存在或无法访问' })
    }
  }

  async function cleanupLocalUploadedFile(file) {
    const filePath = String(file?.path || '').trim()
    if (!filePath) return
    try {
      await fs.promises.unlink(filePath)
    } catch (_error) {
      // Ignore cleanup failures for already-removed temp files.
    }
  }

  async function cleanupUploadedFiles(files) {
    if (!isLocalStorage()) return
    await Promise.allSettled((Array.isArray(files) ? files : []).map((file) => cleanupLocalUploadedFile(file)))
  }

  async function uploadManagedFiles(folderName, files, cacheControl) {
    if (!isCosStorage()) {
      return (Array.isArray(files) ? files : []).map((file) => ({
        name: file.originalname,
        url: toUploadFileUrl(folderName, file.filename),
        size: Number(file.size || 0)
      }))
    }

    const uploadedFiles = []
    try {
      for (const file of Array.isArray(files) ? files : []) {
        const uploaded = await uploadManagedFileToCos({
          folderName,
          fileName: file.filename,
          body: file.buffer,
          contentType: file.mimetype,
          cacheControl
        })
        uploadedFiles.push({
          name: file.originalname,
          url: uploaded.url,
          size: Number(file.size || 0)
        })
      }
      return uploadedFiles
    } catch (error) {
      await Promise.allSettled(uploadedFiles.map((file) => deleteManagedFileByUrl(file.url)))
      throw error
    }
  }

  app.get('/api/uploads/files/listing-images/:fileName', async (req, res) => {
    if (!ensureStorageReady(res)) return

    const fileName = String(req.params.fileName || '').trim()
    if (!isSafeUploadFileName(fileName)) {
      return res.status(400).json({ message: '文件地址不合法' })
    }

    if (isLocalStorage()) {
      return sendLocalManagedFile(res, 'listing-images', fileName)
    }

    return redirectToCosFile(res, toUploadFileUrl('listing-images', fileName))
  })

  app.get('/api/uploads/files/ban-images/:fileName', async (req, res) => {
    if (!ensureStorageReady(res)) return

    const fileName = String(req.params.fileName || '').trim()
    if (!isSafeUploadFileName(fileName)) {
      return res.status(400).json({ message: '文件地址不合法' })
    }

    const mediaUrl = toUploadFileUrl('ban-images', fileName)
    const auth = await getOptionalAuth(req)
    if (!auth) {
      return res.status(401).json({ message: '请先登录后查看受保护素材' })
    }

    try {
      const canAccess = await canAccessBanImageByUrl(pool, mediaUrl, auth)
      if (!canAccess) {
        return res.status(403).json({ message: '无权限访问该文件' })
      }

      if (isLocalStorage()) {
        return sendLocalManagedFile(res, 'ban-images', fileName)
      }

      return proxyCosFile(req, res, mediaUrl)
    } catch (_error) {
      return res.status(404).json({ message: '文件不存在或无法访问' })
    }
  })

  app.get('/api/uploads/files/ban-videos/:fileName', async (req, res) => {
    if (!ensureStorageReady(res)) return

    const fileName = String(req.params.fileName || '').trim()
    if (!isSafeUploadFileName(fileName)) {
      return res.status(400).json({ message: '文件地址不合法' })
    }

    const mediaUrl = toUploadFileUrl('ban-videos', fileName)
    const auth = await getOptionalAuth(req)
    if (!auth) {
      return res.status(401).json({ message: '请先登录后查看受保护素材' })
    }

    try {
      const canAccess = await canAccessBanVideoByUrl(pool, mediaUrl, auth)
      if (!canAccess) {
        return res.status(403).json({ message: '无权限访问该文件' })
      }

      if (isLocalStorage()) {
        return sendLocalManagedFile(res, 'ban-videos', fileName)
      }

      return proxyCosFile(req, res, mediaUrl)
    } catch (_error) {
      return res.status(404).json({ message: '文件不存在或无法访问' })
    }
  })

  app.get('/api/uploads/files/chat-images/:fileName', async (req, res) => {
    if (!ensureStorageReady(res)) return

    const fileName = String(req.params.fileName || '').trim()
    if (!isSafeUploadFileName(fileName)) {
      return res.status(400).json({ message: '文件地址不合法' })
    }

    const mediaUrl = toUploadFileUrl('chat-images', fileName)
    const auth = await getOptionalAuth(req)
    if (!auth) {
      return res.status(401).json({ message: '请先登录后查看聊天图片' })
    }

    try {
      const canAccess = await canAccessConversationImageByUrl(pool, mediaUrl, auth)
      if (!canAccess) {
        return res.status(403).json({ message: '无权限访问该聊天图片' })
      }

      if (isLocalStorage()) {
        return sendLocalManagedFile(res, 'chat-images', fileName)
      }

      return proxyCosFile(req, res, mediaUrl)
    } catch (_error) {
      return res.status(404).json({ message: '文件不存在或无法访问' })
    }
  })

  app.post('/api/uploads/ban-images', authRequired, (req, res) => {
    if (!ensureStorageReady(res)) return

    banImageUploader.array('images', MAX_BAN_IMAGE_COUNT)(req, res, async (error) => {
      if (error) {
        return res.status(400).json({ message: getUploadErrorMessage(error, '处罚截图上传失败') })
      }

      const files = getUploadedFiles(req)
      if (!files.length) {
        return res.status(400).json({ message: '请至少上传1张处罚截图' })
      }

      let dailyQuota = { allowed: true, reservedBytes: 0, reservedCount: 0 }
      try {
        dailyQuota = await reserveDailyUploadQuota(req.auth?.userId, files)
        if (!dailyQuota.allowed) {
          await cleanupUploadedFiles(files)
          return res.status(429).json({ message: buildDailyUploadLimitMessage() })
        }

        const uploadedFiles = await uploadManagedFiles('ban-images', files, 'private, max-age=31536000, immutable')
        return res.json({ files: uploadedFiles })
      } catch (_error) {
        await rollbackDailyUploadQuota(req.auth?.userId, dailyQuota.reservedBytes, dailyQuota.reservedCount)
        await cleanupUploadedFiles(files)
        return res.status(500).json({ message: '处罚截图上传失败' })
      }
    })
  })

  app.post('/api/uploads/listing-images', authRequired, (req, res) => {
    if (!ensureStorageReady(res)) return

    listingImageUploader.array('images', MAX_LISTING_IMAGE_COUNT)(req, res, async (error) => {
      if (error) {
        return res.status(400).json({ message: getUploadErrorMessage(error, '商品图片上传失败') })
      }

      const files = getUploadedFiles(req)
      if (!files.length) {
        return res.status(400).json({ message: '请至少上传1张商品图片' })
      }

      let dailyQuota = { allowed: true, reservedBytes: 0, reservedCount: 0 }
      try {
        dailyQuota = await reserveDailyUploadQuota(req.auth?.userId, files)
        if (!dailyQuota.allowed) {
          await cleanupUploadedFiles(files)
          return res.status(429).json({ message: buildDailyUploadLimitMessage() })
        }

        const uploadedFiles = await uploadManagedFiles('listing-images', files, 'public, max-age=31536000, immutable')
        return res.json({ files: uploadedFiles })
      } catch (_error) {
        await rollbackDailyUploadQuota(req.auth?.userId, dailyQuota.reservedBytes, dailyQuota.reservedCount)
        await cleanupUploadedFiles(files)
        return res.status(500).json({ message: '商品图片上传失败' })
      }
    })
  })

  app.post('/api/uploads/ban-video', authRequired, (req, res) => {
    if (!ensureStorageReady(res)) return

    banVideoUploader.single('video')(req, res, async (error) => {
      if (error) {
        return res.status(400).json({ message: getUploadErrorMessage(error, '封禁记录视频上传失败') })
      }

      const files = getUploadedFiles(req)
      if (!files.length) {
        return res.status(400).json({ message: '请上传封禁记录视频' })
      }

      let dailyQuota = { allowed: true, reservedBytes: 0, reservedCount: 0 }
      try {
        dailyQuota = await reserveDailyUploadQuota(req.auth?.userId, files)
        if (!dailyQuota.allowed) {
          await cleanupUploadedFiles(files)
          return res.status(429).json({ message: buildDailyUploadLimitMessage() })
        }

        const [uploadedFile] = await uploadManagedFiles('ban-videos', files, 'private, max-age=31536000, immutable')
        return res.json({ file: uploadedFile })
      } catch (_error) {
        await rollbackDailyUploadQuota(req.auth?.userId, dailyQuota.reservedBytes, dailyQuota.reservedCount)
        await cleanupUploadedFiles(files)
        return res.status(500).json({ message: '封禁记录视频上传失败' })
      }
    })
  })

  app.post('/api/uploads/chat-images', authRequired, async (req, res) => {
    if (!ensureStorageReady(res)) return

    const authUserId = Number(req.auth?.userId || 0)
    const quota = await reserveChatImageUploadQuota(authUserId)
    if (!quota.allowed) {
      return res.status(429).json({
        message: `聊天图片上传过于频繁，请 ${Math.ceil(quota.retryAfterMs / 1000)} 秒后再试`
      })
    }

    chatImageUploader.single('image')(req, res, async (error) => {
      if (error) {
        await rollbackChatImageUploadQuota(authUserId, quota.token)
        return res.status(400).json({ message: getUploadErrorMessage(error, '聊天图片上传失败') })
      }

      const files = getUploadedFiles(req)
      const conversationId = Number(req.body?.conversationId || 0)
      if (!files.length) {
        await rollbackChatImageUploadQuota(authUserId, quota.token)
        return res.status(400).json({ message: '请上传聊天图片' })
      }

      if (!conversationId || !Number.isFinite(conversationId) || conversationId < 1) {
        await rollbackChatImageUploadQuota(authUserId, quota.token)
        await cleanupUploadedFiles(files)
        return res.status(400).json({ message: '会话ID无效' })
      }

      let dailyQuota = { allowed: true, reservedBytes: 0, reservedCount: 0 }
      try {
        const conversation = await getConversationForUser(conversationId, authUserId)
        if (!conversation) {
          await rollbackChatImageUploadQuota(authUserId, quota.token)
          await cleanupUploadedFiles(files)
          return res.status(403).json({ message: '无权向该会话上传图片' })
        }

        dailyQuota = await reserveDailyUploadQuota(authUserId, files)
        if (!dailyQuota.allowed) {
          await rollbackChatImageUploadQuota(authUserId, quota.token)
          await cleanupUploadedFiles(files)
          return res.status(429).json({ message: buildDailyUploadLimitMessage() })
        }

        const [uploadedFile] = await uploadManagedFiles('chat-images', files, 'private, max-age=31536000, immutable')
        await recordConversationMessageUpload({
          conversationId,
          uploaderUserId: authUserId,
          mediaUrl: uploadedFile.url,
          mediaName: files[0].originalname,
          mediaSize: Number(files[0].size || 0)
        })

        return res.json({ file: uploadedFile })
      } catch (_error) {
        await rollbackChatImageUploadQuota(authUserId, quota.token)
        await rollbackDailyUploadQuota(authUserId, dailyQuota.reservedBytes, dailyQuota.reservedCount)
        if (isCosStorage() && files[0]?.filename) {
          await deleteManagedFileByUrl(toUploadFileUrl('chat-images', files[0].filename))
        } else {
          await cleanupUploadedFiles(files)
        }
        return res.status(500).json({ message: '聊天图片上传失败' })
      }
    })
  })

  function normalizeBanRecycleMediaUrls(mediaUrlsPayload) {
    if (!Array.isArray(mediaUrlsPayload)) {
      return null
    }

    return mediaUrlsPayload
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  }

  app.post('/api/uploads/recycle-temp', authRequired, async (req, res) => {
    if (!ensureStorageReady(res)) return

    const mediaUrls = normalizeBanRecycleMediaUrls(req.body?.mediaUrls)
    if (mediaUrls === null) {
      return res.status(400).json({ message: '临时文件地址格式不合法' })
    }

    const invalidUrl = mediaUrls.find((url) => (
      !LISTING_IMAGE_UPLOAD_URL_REGEX.test(url) &&
      !CHAT_IMAGE_UPLOAD_URL_REGEX.test(url) &&
      !BAN_IMAGE_UPLOAD_URL_REGEX.test(url) &&
      !BAN_VIDEO_UPLOAD_URL_REGEX.test(url)
    ))
    if (invalidUrl) {
      return res.status(400).json({ message: '存在不允许回收的文件地址' })
    }

    try {
      await cleanupOrphanUploadedFiles(pool, mediaUrls)
      res.json({ message: '临时文件回收完成' })
    } catch (_error) {
      res.status(500).json({ message: '临时文件回收失败' })
    }
  })
}
