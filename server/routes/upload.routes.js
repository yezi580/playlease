import { Readable } from 'stream'

/**
 * 上传相关 HTTP 路由，处理受保护媒体访问与文件操作。
 */

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
    chatImageUploadRateStore,
    cleanupOrphanUploadedFiles,
    LISTING_IMAGE_UPLOAD_URL_REGEX,
    CHAT_IMAGE_UPLOAD_URL_REGEX,
    BAN_IMAGE_UPLOAD_URL_REGEX,
    BAN_VIDEO_UPLOAD_URL_REGEX
  } = deps

  function isLocalStorage() {
    return storageDriver === 'local'
  }

  function isCosStorage() {
    return storageDriver === 'cos'
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

  function ensureStorageReady(res) {
    if (isCosStorage() && !cosEnabled) {
      res.status(503).json({ message: '文件存储服务未配置完成，请稍后再试' })
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
    const headerNames = [
      'range',
      'if-none-match',
      'if-modified-since',
      'if-range'
    ]
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
      // 文件已不存在时忽略清理错误
    }
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

      const files = Array.isArray(req.files) ? req.files : []
      if (!files.length) {
        return res.status(400).json({ message: '请至少上传1张处罚截图' })
      }

      try {
        const uploadedFiles = await uploadManagedFiles('ban-images', files, 'private, max-age=31536000, immutable')
        return res.json({ files: uploadedFiles })
      } catch (_error) {
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

      const files = Array.isArray(req.files) ? req.files : []
      if (!files.length) {
        return res.status(400).json({ message: '请至少上传1张商品图片' })
      }

      try {
        const uploadedFiles = await uploadManagedFiles('listing-images', files, 'public, max-age=31536000, immutable')
        return res.json({ files: uploadedFiles })
      } catch (_error) {
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

      if (!req.file) {
        return res.status(400).json({ message: '请上传封禁记录视频' })
      }

      try {
        const [uploadedFile] = await uploadManagedFiles('ban-videos', [req.file], 'private, max-age=31536000, immutable')
        return res.json({ file: uploadedFile })
      } catch (_error) {
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

      const conversationId = Number(req.body?.conversationId || 0)
      if (!req.file) {
        await rollbackChatImageUploadQuota(authUserId, quota.token)
        return res.status(400).json({ message: '请上传聊天图片' })
      }

      if (!conversationId || !Number.isFinite(conversationId) || conversationId < 1) {
        await rollbackChatImageUploadQuota(authUserId, quota.token)
        if (isLocalStorage()) {
          await cleanupLocalUploadedFile(req.file)
        }
        return res.status(400).json({ message: '会话ID无效' })
      }

      try {
        const conversation = await getConversationForUser(conversationId, authUserId)
        if (!conversation) {
          await rollbackChatImageUploadQuota(authUserId, quota.token)
          if (isLocalStorage()) {
            await cleanupLocalUploadedFile(req.file)
          }
          return res.status(403).json({ message: '无权向该会话上传图片' })
        }

        const [uploadedFile] = await uploadManagedFiles('chat-images', [req.file], 'private, max-age=31536000, immutable')
        await recordConversationMessageUpload({
          conversationId,
          uploaderUserId: authUserId,
          mediaUrl: uploadedFile.url,
          mediaName: req.file.originalname,
          mediaSize: Number(req.file.size || 0)
        })

        return res.json({
          file: uploadedFile
        })
      } catch (_error) {
        await rollbackChatImageUploadQuota(authUserId, quota.token)
        if (isCosStorage() && req.file?.filename) {
          await deleteManagedFileByUrl(toUploadFileUrl('chat-images', req.file.filename))
        } else if (isLocalStorage()) {
          await cleanupLocalUploadedFile(req.file)
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
