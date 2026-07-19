/**
 * 会话相关 HTTP 路由，处理聊天线程、消息与已读状态。
 */

export function registerConversationRoutes(deps) {
  const {
    app,
    authRequired,
    conversationApiLimiter,
    chatModule,
    io
  } = deps
  const {
    getOrderConversationAccess,
    getPresaleConversationAccess,
    getOrCreatePresaleConversationForUser,
    ensureOrderConversation,
    ensurePresaleConversation,
    ensureSupportConversationParticipant,
    getConversationForUser,
    serializeConversationRow,
    logChatEvent,
    normalizeConversationScope,
    getConversationListForUser,
    getUnreadSummaryForUser,
    getConversationMessages,
    markConversationAsRead,
    getUserRoomName
  } = chatModule

app.post('/api/conversations/order/:orderId', authRequired, conversationApiLimiter, async (req, res) => {
  const orderId = Number(req.params?.orderId)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '订单ID无效' })
  }

  try {
    const order = await getOrderConversationAccess(orderId, req.auth.userId, req.auth.role)
    if (!order) {
      return res.status(403).json({ message: '无权进入该订单会话' })
    }

    const conversationId = await ensureOrderConversation(order)
    if (String(req.auth.role || '') === 'support') {
      await ensureSupportConversationParticipant(conversationId, req.auth.userId)
    }
    const conversation = await getConversationForUser(conversationId, req.auth.userId)

    if (!conversation) {
      return res.status(500).json({ message: '创建会话失败' })
    }

    res.json(serializeConversationRow(conversation, req.auth.userId))
  } catch (error) {
    logChatEvent('error', 'api:create-order-conversation', {
      orderId,
      userId: req.auth?.userId,
      role: req.auth?.role,
      message: error.message || 'unknown'
    })
    res.status(500).json({ message: '获取订单会话失败' })
  }
})

app.post('/api/conversations/presale', authRequired, conversationApiLimiter, async (req, res) => {
  if (String(req.auth?.role || '') === 'support') {
    return res.status(400).json({ message: '客服请从工作台进入指定售前咨询会话' })
  }

  try {
    const conversation = await getOrCreatePresaleConversationForUser(req.auth.userId)
    if (!conversation) {
      return res.status(500).json({ message: '创建售前咨询失败' })
    }
    res.json(serializeConversationRow(conversation, req.auth.userId))
  } catch (error) {
    logChatEvent('error', 'api:create-presale-conversation', {
      userId: req.auth?.userId,
      role: req.auth?.role,
      message: error.message || 'unknown'
    })
    res.status(500).json({ message: error.message || '获取售前咨询失败' })
  }
})

app.post('/api/conversations/presale/:consultationId', authRequired, conversationApiLimiter, async (req, res) => {
  const consultationId = Number(req.params?.consultationId)

  if (!consultationId || !Number.isFinite(consultationId) || consultationId < 1) {
    return res.status(400).json({ message: '售前咨询ID无效' })
  }

  try {
    const consultation = await getPresaleConversationAccess(consultationId, req.auth.userId, req.auth.role)
    if (!consultation) {
      return res.status(403).json({ message: '无权进入该售前咨询会话' })
    }

    const conversationId = await ensurePresaleConversation(consultation)
    if (String(req.auth.role || '') === 'support') {
      await ensureSupportConversationParticipant(conversationId, req.auth.userId)
    }
    const conversation = await getConversationForUser(conversationId, req.auth.userId)

    if (!conversation) {
      return res.status(500).json({ message: '创建售前咨询会话失败' })
    }

    res.json(serializeConversationRow(conversation, req.auth.userId))
  } catch (error) {
    logChatEvent('error', 'api:open-presale-conversation', {
      consultationId,
      userId: req.auth?.userId,
      role: req.auth?.role,
      message: error.message || 'unknown'
    })
    res.status(500).json({ message: '获取售前咨询会话失败' })
  }
})

app.get('/api/conversations', authRequired, conversationApiLimiter, async (req, res) => {
  const page = Number(req.query?.page || 1)
  const pageSize = Number(req.query?.pageSize || 20)
  const scope = normalizeConversationScope(req.query?.scope)

  try {
    const payload = await getConversationListForUser(req.auth.userId, page, pageSize, scope)
    res.json(payload)
  } catch (error) {
    logChatEvent('error', 'api:get-conversation-list', {
      userId: req.auth?.userId,
      page,
      pageSize,
      scope,
      message: error.message || 'unknown'
    })
    res.status(500).json({ message: '加载会话列表失败' })
  }
})

app.get('/api/conversations/unread-summary', authRequired, conversationApiLimiter, async (req, res) => {
  try {
    const summary = await getUnreadSummaryForUser(req.auth.userId)
    res.json(summary)
  } catch (error) {
    logChatEvent('error', 'api:get-unread-summary', {
      userId: req.auth?.userId,
      message: error.message || 'unknown'
    })
    res.status(500).json({ message: '加载未读汇总失败' })
  }
})

app.get('/api/conversations/:id/messages', authRequired, conversationApiLimiter, async (req, res) => {
  const conversationId = Number(req.params?.id)
  const page = Number(req.query?.page || 1)
  const pageSize = Number(req.query?.pageSize || 50)

  if (!conversationId || !Number.isFinite(conversationId) || conversationId < 1) {
    return res.status(400).json({ message: '会话ID无效' })
  }

  try {
    const conversation = await getConversationForUser(conversationId, req.auth.userId)
    if (!conversation) {
      return res.status(403).json({ message: '无权查看该会话' })
    }

    const payload = await getConversationMessages(conversationId, page, pageSize)
    payload.current_user_id = Number(req.auth.userId || 0)
    payload.list = Array.isArray(payload.list)
      ? payload.list.map((message) => ({
          ...message,
          is_self: Number(message?.sender_user_id || 0) === Number(req.auth.userId || 0)
        }))
      : []
    payload.conversation = serializeConversationRow(conversation, req.auth.userId)
    res.json(payload)
  } catch (error) {
    logChatEvent('error', 'api:get-conversation-messages', {
      conversationId,
      userId: req.auth?.userId,
      page,
      pageSize,
      message: error.message || 'unknown'
    })
    res.status(500).json({ message: '加载消息失败' })
  }
})

app.put('/api/conversations/:id/read', authRequired, conversationApiLimiter, async (req, res) => {
  const conversationId = Number(req.params?.id)
  const lastReadMessageId = Number(req.body?.lastReadMessageId || 0)

  if (!conversationId || !Number.isFinite(conversationId) || conversationId < 1) {
    return res.status(400).json({ message: '会话ID无效' })
  }

  try {
    const conversation = await getConversationForUser(conversationId, req.auth.userId)
    if (!conversation) {
      return res.status(403).json({ message: '无权操作该会话' })
    }

    const targetMessageId = await markConversationAsRead(conversationId, req.auth.userId, lastReadMessageId)
    const unreadSummary = await getUnreadSummaryForUser(req.auth.userId)
    io.to(getUserRoomName(req.auth.userId)).emit('message:read', {
      conversation_id: conversationId,
      last_read_message_id: targetMessageId || null,
      unread_summary: {
        conversation_unread_total: Number(unreadSummary?.unread_total || 0),
        regular_conversation_unread_total: Number(unreadSummary?.regular_unread_total || 0),
        support_unread_total: Number(unreadSummary?.support_unread_total || 0),
        support_handling_unread_total: Number(unreadSummary?.support_handling_unread_total || 0)
      }
    })
    res.json({ success: true, last_read_message_id: targetMessageId || null })
  } catch (error) {
    logChatEvent('error', 'api:mark-conversation-read', {
      conversationId,
      userId: req.auth?.userId,
      message: error.message || 'unknown'
    })
    res.status(500).json({ message: '更新已读状态失败' })
  }
})
}
