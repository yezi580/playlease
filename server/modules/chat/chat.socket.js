/**
 * 聊天消息投递与在线状态相关的 Socket.IO 事件注册。
 */

export function registerChatSocket({
  io,
  authModule,
  chatModule,
  validateAuthSession,
  touchUserPresence,
  markUserDisconnected,
  chatOnlineTtlSeconds = 120
}) {
  const {
    getSocketToken,
    touchAuthSession,
    verifyAuthToken,
    fetchAuthUserById,
    isUserCurrentlyBanned,
    buildBannedUserMessage
  } = authModule
  const {
    getConversationRoomName,
    getUserRoomName,
    logChatEvent,
    consumeSocketMessageQuota,
    serializeConversationRow,
    getConversationForUser,
    createConversationMessage,
    markConversationAsRead,
    emitConversationMessage
  } = chatModule

io.use(async (socket, next) => {
  const token = getSocketToken(socket)
  if (!token) {
    next(new Error('未登录或登录已过期'))
    return
  }

  try {
    const decoded = verifyAuthToken(token)
    const sessionValid = typeof validateAuthSession === 'function'
      ? await validateAuthSession(decoded)
      : true
    if (!sessionValid) {
      next(new Error('登录会话已失效，请重新登录'))
      return
    }
    const authUser = await fetchAuthUserById(decoded.userId)
    if (!authUser) {
      next(new Error('账号不存在或已被删除'))
      return
    }
    if (isUserCurrentlyBanned(authUser)) {
      next(new Error(buildBannedUserMessage(authUser)))
      return
    }
    socket.data.auth = {
      ...decoded,
      userId: authUser.id,
      sessionId: String(decoded?.sid || '').trim(),
      username: authUser.username,
      phone: authUser.phone,
      role: authUser.role,
      bannedUntil: authUser.banned_until || null
    }
    next()
  } catch (_error) {
    next(new Error('无效的登录凭证'))
  }
})

io.on('connection', (socket) => {
  socket.join(getUserRoomName(socket.data.auth.userId))
  const presenceInterval = setInterval(() => {
    void touchUserPresence?.(socket.data.auth.userId, socket.id, chatOnlineTtlSeconds)
    void touchAuthSession?.(socket.data.auth.sessionId, {
      role: socket.data.auth.role,
      authLevel: socket.data.auth.authLevel,
      trustedDevice: socket.data.auth.trustedDevice,
      trustedDeviceId: socket.data.auth.trustedDeviceId,
      amr: socket.data.auth.amr,
      userAgent: String(socket.handshake?.headers?.['user-agent'] || '').trim(),
      ip: String(socket.handshake?.headers?.['x-forwarded-for'] || socket.handshake?.address || '')
        .split(',')[0]
        .trim()
    })
  }, Math.max(15_000, Math.floor(chatOnlineTtlSeconds * 500)))
  void touchUserPresence?.(socket.data.auth.userId, socket.id, chatOnlineTtlSeconds)
  void touchAuthSession?.(socket.data.auth.sessionId, {
    role: socket.data.auth.role,
    authLevel: socket.data.auth.authLevel,
    trustedDevice: socket.data.auth.trustedDevice,
    trustedDeviceId: socket.data.auth.trustedDeviceId,
    amr: socket.data.auth.amr,
    userAgent: String(socket.handshake?.headers?.['user-agent'] || '').trim(),
    ip: String(socket.handshake?.headers?.['x-forwarded-for'] || socket.handshake?.address || '')
      .split(',')[0]
      .trim()
  })

  socket.on('conversation:join', async (payload = {}, callback = () => {}) => {
    const conversationId = Number(payload?.conversationId)

    if (!conversationId || !Number.isFinite(conversationId) || conversationId < 1) {
      callback({ success: false, message: '会话ID无效' })
      return
    }

    try {
      const conversation = await getConversationForUser(conversationId, socket.data.auth.userId)
      if (!conversation) {
        callback({ success: false, message: '无权进入该会话' })
        return
      }

      socket.join(getConversationRoomName(conversationId))
      callback({ success: true, conversation: serializeConversationRow(conversation, socket.data.auth.userId) })
    } catch (error) {
      logChatEvent('error', 'socket:conversation-join', {
        conversationId,
        userId: socket.data.auth.userId,
        message: error.message || 'unknown'
      })
      callback({ success: false, message: '进入会话失败' })
    }
  })

  socket.on('conversation:leave', (payload = {}) => {
    const conversationId = Number(payload?.conversationId)
    if (!conversationId || !Number.isFinite(conversationId) || conversationId < 1) return
    socket.leave(getConversationRoomName(conversationId))
  })

  socket.on('message:send', async (payload = {}, callback = () => {}) => {
    const conversationId = Number(payload?.conversationId)
    const content = payload?.content
    const messageType = String(payload?.messageType || 'text').trim().toLowerCase()
    const mediaUrl = payload?.mediaUrl
    const mediaName = payload?.mediaName
    const mediaSize = payload?.mediaSize

    if (!conversationId || !Number.isFinite(conversationId) || conversationId < 1) {
      callback({ success: false, message: '会话ID无效' })
      return
    }

    const quota = await consumeSocketMessageQuota(socket.data.auth.userId)
    if (!quota.allowed) {
      callback({
        success: false,
        message: `消息发送过于频繁，请 ${Math.ceil(quota.retryAfterMs / 1000)} 秒后再试`
      })
      return
    }

    try {
      const conversation = await getConversationForUser(conversationId, socket.data.auth.userId)
      if (!conversation) {
        callback({ success: false, message: '无权发送该会话消息' })
        return
      }

      const message = await createConversationMessage({
        conversationId,
        senderUserId: socket.data.auth.userId,
        messageType,
        content,
        mediaUrl,
        mediaName,
        mediaSize
      })

      await markConversationAsRead(conversationId, socket.data.auth.userId, message.id)

      await emitConversationMessage(conversation, message, socket.data.auth.userId)
      callback({ success: true, message })
    } catch (error) {
      logChatEvent('error', 'socket:message-send', {
        conversationId,
        userId: socket.data.auth.userId,
        message: error.message || 'unknown'
      })
      callback({ success: false, message: error.message || '发送消息失败' })
    }
  })

  socket.on('disconnect', async () => {
    clearInterval(presenceInterval)
    await markUserDisconnected?.(socket.data.auth.userId, socket.id)
  })
})
}
