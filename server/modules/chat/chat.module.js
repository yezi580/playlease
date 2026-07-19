/**
 * 聊天模块工厂，用于组装会话、客服与 Socket 辅助能力。
 */

export function createChatModule(config) {
  const {
    pool,
    io,
    CHAT_SLOW_QUERY_MS,
    SOCKET_MESSAGE_RATE_LIMIT_WINDOW_MS,
    SOCKET_MESSAGE_RATE_LIMIT_MAX,
    socketMessageRateStore,
    CHAT_IMAGE_UPLOAD_URL_REGEX
  } = config

function getConversationRoomName(conversationId) {
  return `conversation:${conversationId}`
}

function getUserRoomName(userId) {
  return `user:${userId}`
}

function logChatEvent(level, event, detail = {}) {
  const logger = level === 'error'
    ? console.error
    : level === 'warn'
      ? console.warn
      : console.log

  try {
    logger(`[chat] ${event}`, JSON.stringify(detail))
  } catch (_error) {
    logger(`[chat] ${event}`, detail)
  }
}

async function runTimedChatDb(kind, label, executor) {
  const startedAt = Date.now()
  try {
    const result = await executor()
    const durationMs = Date.now() - startedAt
    if (durationMs >= CHAT_SLOW_QUERY_MS) {
      logChatEvent('warn', 'slow-query', { kind, label, durationMs })
    }
    return result
  } catch (error) {
    logChatEvent('error', 'db-error', {
      kind,
      label,
      durationMs: Date.now() - startedAt,
      message: error.message || 'unknown'
    })
    throw error
  }
}

function chatExecute(label, sql, params = []) {
  return runTimedChatDb('execute', label, () => pool.execute(sql, params))
}

function chatQuery(label, sql, params = []) {
  return runTimedChatDb('query', label, () => pool.query(sql, params))
}

async function consumeSocketMessageQuota(userId) {
  const safeUserId = Number(userId || 0)
  if (!safeUserId) {
    return { allowed: false, retryAfterMs: SOCKET_MESSAGE_RATE_LIMIT_WINDOW_MS }
  }
  if (!socketMessageRateStore || typeof socketMessageRateStore.consume !== 'function') {
    return { allowed: true, retryAfterMs: 0, token: '' }
  }
  return socketMessageRateStore.consume(`user:${safeUserId}`)
}

function sanitizeConversationMessageContent(content) {
  const normalized = String(content || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim()
  return normalized.slice(0, 2000)
}

function buildConversationPreview(content) {
  const preview = String(content || '').replace(/\s+/g, ' ').trim()
  return preview ? preview.slice(0, 120) : ''
}

function normalizeConversationMessageType(messageType) {
  const normalized = String(messageType || '').trim().toLowerCase()
  return ['text', 'image', 'system'].includes(normalized) ? normalized : 'text'
}

function normalizeConversationType(type) {
  const normalized = String(type || '').trim().toLowerCase()
  return ['order', 'presale'].includes(normalized) ? normalized : 'order'
}

function sanitizeConversationMediaUrl(mediaUrl) {
  const normalized = String(mediaUrl || '').trim()
  if (!normalized) return ''
  if (!CHAT_IMAGE_UPLOAD_URL_REGEX?.test(normalized)) return ''
  return normalized
}

function sanitizeConversationMediaName(mediaName) {
  return String(mediaName || '').trim().slice(0, 255)
}

function sanitizeConversationMediaSize(mediaSize) {
  const parsed = Number(mediaSize || 0)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.round(parsed)
}

function buildConversationMessagePreview(messageType, content) {
  return normalizeConversationMessageType(messageType) === 'image'
    ? '[图片]'
    : buildConversationPreview(content)
}

function sanitizeSupportNote(note) {
  return String(note || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim()
    .slice(0, 500)
}

function normalizeSupportStatus(status) {
  const value = String(status || '').trim()
  return ['pending', 'handling', 'resolved'].includes(value) ? value : 'none'
}

function normalizePresaleSupportStatus(status) {
  const value = String(status || '').trim()
  return value === 'resolved' ? 'resolved' : 'handling'
}

function sanitizeSupportSearchKeyword(keyword) {
  return String(keyword || '').trim().slice(0, 50)
}

function normalizeSupportAssigneeScope(scope) {
  const value = String(scope || '').trim()
  return ['all', 'mine', 'unassigned'].includes(value) ? value : 'all'
}

const SUPPORT_TIMEOUT_RULES = {
  pending: 30
}

function getSupportTimeoutMinutes(status) {
  return Number(SUPPORT_TIMEOUT_RULES[String(status || '').trim()] || 0)
}

function buildSupportTimeoutMeta(status, elapsedMinutes) {
  const normalizedStatus = normalizeSupportStatus(status)
  const safeElapsedMinutes = Math.max(0, Number(elapsedMinutes || 0) || 0)
  const timeoutMinutes = getSupportTimeoutMinutes(normalizedStatus)

  if (!timeoutMinutes || normalizedStatus !== 'pending') {
    return {
      elapsed_minutes: safeElapsedMinutes,
      timeout_minutes: 0,
      is_timeout: false,
      timeout_level: 'normal',
      timeout_label: ''
    }
  }

  const isTimeout = safeElapsedMinutes >= timeoutMinutes
  const timeoutLevel = !isTimeout
    ? 'normal'
    : (safeElapsedMinutes >= timeoutMinutes * 2 ? 'danger' : 'warning')

  return {
    elapsed_minutes: safeElapsedMinutes,
    timeout_minutes: timeoutMinutes,
    is_timeout: isTimeout,
    timeout_level: timeoutLevel,
    timeout_label: isTimeout
      ? `待处理超时 ${safeElapsedMinutes} 分钟`
      : ''
  }
}

function buildSupportOrderFilterParts({ status, keyword, assigneeScope, viewerUserId }) {
  const clauses = [`(o.status IN ('paid', 'support_handling', 'settlement_pending') OR (o.status IN ('completed', 'cancelled') AND o.support_status = 'resolved'))`]
  const params = []

  const normalizedStatus = normalizeSupportStatus(status)
  if (normalizedStatus !== 'none') {
    clauses.push('o.support_status = ?')
    params.push(normalizedStatus)
  } else {
    clauses.push(`o.support_status IN ('pending', 'handling', 'resolved')`)
  }

  const normalizedKeyword = sanitizeSupportSearchKeyword(keyword)
  if (normalizedKeyword) {
    const likeKeyword = `%${normalizedKeyword}%`
    clauses.push(`(
      o.order_no LIKE ?
      OR o.listing_title LIKE ?
      OR buyer.username LIKE ?
      OR seller.username LIKE ?
      OR o.seller_name LIKE ?
    )`)
    params.push(likeKeyword, likeKeyword, likeKeyword, likeKeyword, likeKeyword)
  }

  const normalizedAssigneeScope = normalizeSupportAssigneeScope(assigneeScope)
  if (normalizedAssigneeScope === 'mine') {
    clauses.push('o.support_assignee_id = ?')
    params.push(Number(viewerUserId || 0))
  } else if (normalizedAssigneeScope === 'unassigned') {
    clauses.push('(o.support_assignee_id IS NULL OR o.support_assignee_id = 0)')
  }

  return {
    whereSql: clauses.join(' AND '),
    params,
    keyword: normalizedKeyword,
    assigneeScope: normalizedAssigneeScope
  }
}

function buildSupportEventContent(eventType, {
  actorName = '',
  actorRole = 'support',
  requesterRole = 'buyer',
  note = ''
} = {}) {
  const safeActorName = String(actorName || '').trim()
  const safeNote = sanitizeSupportNote(note)
  const requesterRoleText = requesterRole === 'seller' ? '卖家' : '买家'
  const supportNameText = safeActorName || '客服'

  if (eventType === 'requested') {
    return {
      title: '申请客服介入',
      description: `${requesterRoleText}已申请客服介入，工单进入待处理队列。`,
      publicMessage: `${requesterRoleText}已申请客服介入，订单已进入待处理队列。`
    }
  }

  if (eventType === 'claimed') {
    return {
      title: '领取工单',
      description: `客服 ${supportNameText} 已领取工单，开始跟进处理。`,
      publicMessage: `客服 ${supportNameText} 已领取该工单，开始跟进处理。`
    }
  }

  if (eventType === 'note_updated') {
    if (safeNote) {
      return {
        title: '更新内部备注',
        description: `客服 ${supportNameText} 更新了内部备注：${safeNote}`,
        publicMessage: ''
      }
    }
    return {
      title: '清空内部备注',
      description: `客服 ${supportNameText} 清空了内部备注。`,
      publicMessage: ''
    }
  }

  if (eventType === 'resolved') {
    return {
      title: '标记已完成',
      description: `客服 ${supportNameText} 已将工单标记为已完成。${safeNote ? `内部备注：${safeNote}` : ''}`.trim(),
      publicMessage: '客服已将该售后标记为已完成。'
    }
  }

  if (eventType === 'abnormal_reported') {
    return {
      title: '发起异常处理',
      description: `${requesterRoleText}已发起异常处理，客服工作流继续跟进。${safeNote ? `补充说明：${safeNote}` : ''}`.trim(),
      publicMessage: `${requesterRoleText}已发起异常处理，客服将继续跟进处理。`
    }
  }

  if (eventType === 'cancelled') {
    return {
      title: '取消订单',
      description: `客服 ${supportNameText} 已确认订单取消。${safeNote ? `处理说明：${safeNote}` : ''}`.trim(),
      publicMessage: '客服已确认本订单取消，按规则执行全额退款处理。'
    }
  }

  if (eventType === 'funds_frozen') {
    return {
      title: '冻结资金',
      description: `客服 ${supportNameText} 已冻结本订单资金。${safeNote ? `处理说明：${safeNote}` : ''}`.trim(),
      publicMessage: '客服已临时冻结本订单资金，订单将暂停继续结算或履约，待平台核实后再处理。'
    }
  }

  if (eventType === 'funds_released') {
    return {
      title: '解除冻结',
      description: `客服 ${supportNameText} 已解除本订单资金冻结。${safeNote ? `处理说明：${safeNote}` : ''}`.trim(),
      publicMessage: '客服已解除本订单资金冻结，订单恢复正常流转。'
    }
  }

  return {
    title: '处理记录',
    description: safeNote || '客服已更新工单状态。',
    publicMessage: safeNote || '客服已更新工单状态。'
  }
}

async function createSupportOrderEvent({
  orderId,
  eventType,
  operatorUserId = null,
  operatorRole = 'system',
  operatorName = '',
  title = '',
  description = '',
  publicMessage = '',
  note = ''
}) {
  const safeOrderId = Number(orderId || 0)
  if (!safeOrderId) return null

  const [result] = await pool.execute(
    `INSERT INTO support_order_events (
        order_id,
        event_type,
        operator_user_id,
        operator_role,
        operator_name,
        title,
        description,
        public_message,
        note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      safeOrderId,
      String(eventType || 'requested'),
      Number(operatorUserId || 0) || null,
      String(operatorRole || 'system'),
      String(operatorName || '').trim().slice(0, 100),
      String(title || '').trim().slice(0, 100),
      String(description || '').trim().slice(0, 500),
      String(publicMessage || '').trim().slice(0, 500) || null,
      sanitizeSupportNote(note) || null
    ]
  )

  return Number(result.insertId || 0)
}

async function getSupportOrderTimeline(orderId) {
  const safeOrderId = Number(orderId || 0)
  if (!safeOrderId) return []

  const [rows] = await pool.execute(
    `SELECT
        id,
        order_id,
        event_type,
        operator_user_id,
        operator_role,
        operator_name,
        title,
        description,
        public_message,
        note,
        created_at
     FROM support_order_events
     WHERE order_id = ?
     ORDER BY id DESC`,
    [safeOrderId]
  )

  return rows.map((row) => ({
    id: Number(row.id || 0),
    order_id: Number(row.order_id || 0),
    event_type: String(row.event_type || ''),
    operator_user_id: Number(row.operator_user_id || 0),
    operator_role: String(row.operator_role || 'system'),
    operator_name: row.operator_name || '',
    title: row.title || '处理记录',
    description: row.description || '',
    public_message: row.public_message || '',
    note: row.note || '',
    created_at: row.created_at
  }))
}

function buildLegacySupportTimeline(orderRow) {
  if (!orderRow) return []

  const requesterRole = Number(orderRow.support_requested_by || 0) === Number(orderRow.seller_id || 0) ? 'seller' : 'buyer'
  const supportName = orderRow.support_assignee_name || '客服'
  const timeline = []

  if (orderRow.support_requested_at) {
    const requestedContent = buildSupportEventContent('requested', {
      requesterRole
    })
    timeline.push({
      id: 0,
      order_id: Number(orderRow.id || 0),
      event_type: 'requested',
      operator_user_id: Number(orderRow.support_requested_by || 0),
      operator_role: requesterRole,
      operator_name: orderRow.support_requested_by_name || '',
      title: requestedContent.title,
      description: requestedContent.description,
      public_message: requestedContent.publicMessage,
      note: '',
      created_at: orderRow.support_requested_at
    })
  }

  if (orderRow.support_handling_at) {
    const claimedContent = buildSupportEventContent('claimed', {
      actorName: supportName,
      actorRole: 'support'
    })
    timeline.push({
      id: 0,
      order_id: Number(orderRow.id || 0),
      event_type: 'claimed',
      operator_user_id: Number(orderRow.support_assignee_id || 0),
      operator_role: 'support',
      operator_name: supportName,
      title: claimedContent.title,
      description: claimedContent.description,
      public_message: claimedContent.publicMessage,
      note: '',
      created_at: orderRow.support_handling_at
    })
  }

  if (orderRow.support_note && !orderRow.support_resolved_at) {
    const noteContent = buildSupportEventContent('note_updated', {
      actorName: supportName,
      actorRole: 'support',
      note: orderRow.support_note
    })
    timeline.push({
      id: 0,
      order_id: Number(orderRow.id || 0),
      event_type: 'note_updated',
      operator_user_id: Number(orderRow.support_assignee_id || 0),
      operator_role: 'support',
      operator_name: supportName,
      title: noteContent.title,
      description: noteContent.description,
      public_message: noteContent.publicMessage,
      note: orderRow.support_note || '',
      created_at: orderRow.support_handling_at || orderRow.support_requested_at || orderRow.created_at
    })
  }

  if (orderRow.support_resolved_at) {
    const resolvedContent = buildSupportEventContent('resolved', {
      actorName: supportName,
      actorRole: 'support',
      note: orderRow.support_note || ''
    })
    timeline.push({
      id: 0,
      order_id: Number(orderRow.id || 0),
      event_type: 'resolved',
      operator_user_id: Number(orderRow.support_assignee_id || 0),
      operator_role: 'support',
      operator_name: supportName,
      title: resolvedContent.title,
      description: resolvedContent.description,
      public_message: resolvedContent.publicMessage,
      note: orderRow.support_note || '',
      created_at: orderRow.support_resolved_at
    })
  }

  return timeline
    .filter((item) => item.created_at)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

async function emitSupportEvent({
  orderId,
  actorUserId,
  actorRole,
  actorName,
  eventType,
  note = '',
  requesterRole = 'buyer',
  conversationOrder = null
}) {
  const content = buildSupportEventContent(eventType, {
    actorName,
    actorRole,
    requesterRole,
    note
  })

  await createSupportOrderEvent({
    orderId,
    eventType,
    operatorUserId: actorUserId,
    operatorRole: actorRole,
    operatorName: actorName,
    title: content.title,
    description: content.description,
    publicMessage: content.publicMessage,
    note
  })

  if (!conversationOrder || !content.publicMessage || !actorUserId) {
    return
  }

  const conversationId = await ensureOrderConversation(conversationOrder)
  if (String(actorRole || '') === 'support') {
    await ensureSupportConversationParticipant(conversationId, actorUserId)
  }
  const conversation = await getConversationForUser(conversationId, actorUserId)
  if (!conversation) return

  const systemMessage = await createConversationMessage({
    conversationId,
    senderUserId: actorUserId,
    messageType: 'system',
    content: content.publicMessage
  })
  await emitConversationMessage(conversation, systemMessage, actorUserId)
}

function buildOrderConversationTitle(order) {
  const baseTitle = String(order?.listing_title || '').trim()
  if (baseTitle) return `订单沟通 - ${baseTitle}`
  return `订单沟通 - 订单 #${order?.id || ''}`.trim()
}

function buildPresaleConsultationNo(id, createdAt) {
  const safeId = Number(id || 0)
  const date = createdAt ? new Date(createdAt) : new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `QZ${year}${month}${day}${String(safeId).padStart(6, '0')}`
}

function buildPresaleConversationTitle(consultation) {
  const userName = String(
    consultation?.consultation_user_name
    || consultation?.user_name
    || consultation?.username
    || ''
  ).trim()
  if (userName) return `售前咨询 - ${userName}`
  return `售前咨询 #${consultation?.id || ''}`.trim()
}

function serializeConversationRow(row, viewerUserId) {
  const conversationType = normalizeConversationType(row.type)
  const isPresaleConversation = conversationType === 'presale'
  const currentUserId = Number(viewerUserId || 0)
  const buyerId = Number(row.buyer_id || 0)
  const sellerId = Number(row.seller_id || 0)
  const consultationUserId = Number(row.consultation_user_id || 0)
  const supportAssigneeId = Number(row.consultation_support_assignee_id || row.support_assignee_id || 0)
  const selfRole = isPresaleConversation
    ? (consultationUserId === currentUserId ? 'user' : String(row.participant_role || 'support'))
    : (buyerId === currentUserId ? 'buyer' : (sellerId === currentUserId ? 'seller' : String(row.participant_role || 'buyer')))
  const counterpartName = isPresaleConversation
    ? (selfRole === 'support'
        ? (row.consultation_user_name || '咨询用户')
        : (row.consultation_support_name || '售前客服'))
    : (selfRole === 'buyer'
        ? (row.seller_user_name || row.seller_name || '卖家')
        : (selfRole === 'seller'
            ? (row.buyer_name || '买家')
            : `${row.buyer_name || '买家'} / ${row.seller_user_name || row.seller_name || '卖家'}`))

  return {
    id: Number(row.id),
    type: conversationType,
    ref_id: Number(row.ref_id),
    title: row.title || (isPresaleConversation ? buildPresaleConversationTitle(row) : buildOrderConversationTitle(row)),
    status: row.status,
    order_id: isPresaleConversation ? 0 : Number(row.ref_id),
    order_no: isPresaleConversation ? '' : (row.order_no || ''),
    listing_title: isPresaleConversation ? '' : (row.listing_title || ''),
    consultation_id: isPresaleConversation ? Number(row.ref_id) : 0,
    consultation_no: isPresaleConversation
      ? buildPresaleConsultationNo(row.ref_id, row.consultation_created_at || row.created_at)
      : '',
    support_status: isPresaleConversation
      ? normalizePresaleSupportStatus(row.presale_support_status)
      : normalizeSupportStatus(row.support_status),
    self_role: selfRole,
    counterpart_name: counterpartName,
    buyer_name: isPresaleConversation ? (row.consultation_user_name || '咨询用户') : (row.buyer_name || '买家'),
    seller_name: isPresaleConversation ? '' : (row.seller_user_name || row.seller_name || '卖家'),
    consultation_user_name: row.consultation_user_name || '',
    support_assignee_id: supportAssigneeId,
    support_assignee_name: isPresaleConversation ? (row.consultation_support_name || '') : (row.support_assignee_name || ''),
    last_message_preview: row.last_message_preview || '',
    last_message_at: row.last_message_at,
    updated_at: row.updated_at,
    current_user_id: currentUserId,
    unread_count: Number(row.unread_count || 0)
  }
}

function serializeConversationMessage(row) {
  return {
    id: Number(row.id),
    conversation_id: Number(row.conversation_id),
    sender_user_id: Number(row.sender_user_id),
    sender_name: row.sender_name || '',
    sender_role: row.sender_role || 'buyer',
    message_type: row.message_type,
    content: row.content || '',
    media_url: row.media_url || '',
    media_name: row.media_name || '',
    media_size: Number(row.media_size || 0),
    created_at: row.created_at
  }
}

async function ensureConversationSchema() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS conversations (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '会话唯一ID',
      type ENUM('order', 'presale') NOT NULL DEFAULT 'order' COMMENT '会话类型',
      ref_id INT NOT NULL COMMENT '关联业务ID，当前为订单ID',
      title VARCHAR(255) NOT NULL DEFAULT '' COMMENT '会话标题',
      status ENUM('active', 'closed') NOT NULL DEFAULT 'active' COMMENT '会话状态',
      last_message_preview VARCHAR(255) DEFAULT NULL COMMENT '最后一条消息预览',
      last_message_at DATETIME DEFAULT NULL COMMENT '最后一条消息时间',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
      UNIQUE INDEX uk_conversations_type_ref (type, ref_id),
      INDEX idx_conversations_last_message_at (last_message_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )

  await pool.execute(
    `CREATE TABLE IF NOT EXISTS conversation_participants (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '记录唯一ID',
      conversation_id INT NOT NULL COMMENT '关联会话ID',
      user_id INT NOT NULL COMMENT '参与人用户ID',
      role ENUM('buyer', 'seller', 'support') NOT NULL DEFAULT 'buyer' COMMENT '会话角色',
      last_read_message_id INT DEFAULT NULL COMMENT '最后已读消息ID',
      unread_message_count INT NOT NULL DEFAULT 0 COMMENT '当前未读消息数',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE INDEX uk_conversation_participants_user (conversation_id, user_id),
      INDEX idx_conversation_participants_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )

  await pool.execute(
    `CREATE TABLE IF NOT EXISTS conversation_messages (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '消息唯一ID',
      conversation_id INT NOT NULL COMMENT '关联会话ID',
      sender_user_id INT NOT NULL COMMENT '发送人用户ID',
      message_type ENUM('text', 'image', 'system') NOT NULL DEFAULT 'text' COMMENT '消息类型',
      content TEXT NOT NULL COMMENT '消息内容',
      media_url VARCHAR(500) DEFAULT NULL COMMENT '图片消息URL',
      media_name VARCHAR(255) DEFAULT NULL COMMENT '上传文件名',
      media_size INT NOT NULL DEFAULT 0 COMMENT '文件大小（字节）',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '发送时间',
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_conversation_messages_conversation (conversation_id, id),
      INDEX idx_conversation_messages_sender (sender_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )

  await pool.execute(
    `CREATE TABLE IF NOT EXISTS conversation_message_uploads (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '聊天图片上传记录ID',
      conversation_id INT NOT NULL COMMENT '会话ID',
      uploader_user_id INT NOT NULL COMMENT '上传用户ID',
      media_url VARCHAR(500) NOT NULL COMMENT '图片URL',
      media_name VARCHAR(255) DEFAULT NULL COMMENT '原始文件名',
      media_size INT NOT NULL DEFAULT 0 COMMENT '文件大小（字节）',
      consumed_message_id INT DEFAULT NULL COMMENT '已绑定消息ID',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
      consumed_at DATETIME DEFAULT NULL COMMENT '绑定消息时间',
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (uploader_user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE INDEX uk_conversation_message_uploads_media_url (media_url),
      INDEX idx_conversation_message_uploads_conversation_user (conversation_id, uploader_user_id, consumed_message_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )

  const databaseName = process.env.DB_NAME || 'game_rental'
  const [unreadCountRows] = await pool.execute(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'conversation_participants'
       AND COLUMN_NAME = 'unread_message_count'
     LIMIT 1`,
    [databaseName]
  )
  if (!unreadCountRows.length) {
    await pool.execute(
      `ALTER TABLE conversation_participants
       ADD COLUMN unread_message_count INT NOT NULL DEFAULT 0 COMMENT '当前未读消息数' AFTER last_read_message_id`
    )
  }

  const [messageTypeRows] = await pool.execute(
    `SELECT COLUMN_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'conversation_messages'
       AND COLUMN_NAME = 'message_type'
     LIMIT 1`,
    [databaseName]
  )
  const currentMessageType = String(messageTypeRows[0]?.COLUMN_TYPE || '')
  if (currentMessageType && !currentMessageType.includes("'image'")) {
    await pool.execute(
      `ALTER TABLE conversation_messages
       MODIFY COLUMN message_type ENUM('text', 'image', 'system') NOT NULL DEFAULT 'text' COMMENT '消息类型'`
    )
  }

  const [conversationTypeRows] = await pool.execute(
    `SELECT COLUMN_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'conversations'
       AND COLUMN_NAME = 'type'
     LIMIT 1`,
    [databaseName]
  )
  const currentConversationType = String(conversationTypeRows[0]?.COLUMN_TYPE || '')
  if (currentConversationType && !currentConversationType.includes("'presale'")) {
    await pool.execute(
      `ALTER TABLE conversations
       MODIFY COLUMN type ENUM('order', 'presale') NOT NULL DEFAULT 'order' COMMENT '会话类型'`
    )
  }

  const conversationMessageColumns = [
    {
      name: 'media_url',
      sql: `ALTER TABLE conversation_messages
            ADD COLUMN media_url VARCHAR(500) DEFAULT NULL COMMENT '图片消息URL' AFTER content`
    },
    {
      name: 'media_name',
      sql: `ALTER TABLE conversation_messages
            ADD COLUMN media_name VARCHAR(255) DEFAULT NULL COMMENT '上传文件名' AFTER media_url`
    },
    {
      name: 'media_size',
      sql: `ALTER TABLE conversation_messages
            ADD COLUMN media_size INT NOT NULL DEFAULT 0 COMMENT '文件大小（字节）' AFTER media_name`
    }
  ]

  for (const column of conversationMessageColumns) {
    const [rows] = await pool.execute(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'conversation_messages'
         AND COLUMN_NAME = ?
       LIMIT 1`,
      [databaseName, column.name]
    )
    if (!rows.length) {
      await pool.execute(column.sql)
    }
  }

  await ensureConversationIndexes()
  await syncAllConversationUnreadCounts()
}

async function ensureConversationIndexes() {
  const databaseName = process.env.DB_NAME || 'game_rental'
  const requiredIndexes = [
    {
      tableName: 'conversation_participants',
      indexName: 'idx_conversation_participants_user_conversation_read',
      sql: `CREATE INDEX idx_conversation_participants_user_conversation_read
            ON conversation_participants (user_id, conversation_id, last_read_message_id, unread_message_count)`
    },
    {
      tableName: 'conversation_messages',
      indexName: 'idx_conversation_messages_conversation_sender_id',
      sql: `CREATE INDEX idx_conversation_messages_conversation_sender_id
            ON conversation_messages (conversation_id, sender_user_id, id)`
    }
  ]

  for (const index of requiredIndexes) {
    const [rows] = await pool.execute(
      `SELECT INDEX_NAME
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = ?
         AND INDEX_NAME = ?
       LIMIT 1`,
      [databaseName, index.tableName, index.indexName]
    )
    if (!rows.length) {
      await pool.execute(index.sql)
    }
  }
}

async function syncParticipantUnreadCount(conversationId, userId) {
  const safeConversationId = Number(conversationId || 0)
  const safeUserId = Number(userId || 0)
  if (!safeConversationId || !safeUserId) return

  await chatExecute(
    'syncParticipantUnreadCount',
    `UPDATE conversation_participants cp
     SET unread_message_count = (
       SELECT COUNT(*)
       FROM conversation_messages cm
       WHERE cm.conversation_id = cp.conversation_id
         AND cm.sender_user_id <> cp.user_id
         AND (cp.last_read_message_id IS NULL OR cm.id > cp.last_read_message_id)
     )
     WHERE cp.conversation_id = ? AND cp.user_id = ?`,
    [safeConversationId, safeUserId]
  )
}

async function syncAllConversationUnreadCounts() {
  await chatExecute(
    'syncAllConversationUnreadCounts',
    `UPDATE conversation_participants cp
     LEFT JOIN (
       SELECT
         cp_inner.id AS participant_id,
         COUNT(cm.id) AS unread_total
       FROM conversation_participants cp_inner
       LEFT JOIN conversation_messages cm
         ON cm.conversation_id = cp_inner.conversation_id
        AND cm.sender_user_id <> cp_inner.user_id
        AND (cp_inner.last_read_message_id IS NULL OR cm.id > cp_inner.last_read_message_id)
       GROUP BY cp_inner.id
     ) summary
       ON summary.participant_id = cp.id
     SET cp.unread_message_count = COALESCE(summary.unread_total, 0)`
  )
}

async function ensureUserRoleSchema() {
  const databaseName = process.env.DB_NAME || 'game_rental'
  const [roleRows] = await pool.execute(
    `SELECT COLUMN_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'role'
     LIMIT 1`,
    [databaseName]
  )
  const currentColumnType = String(roleRows[0]?.COLUMN_TYPE || '')
  if (currentColumnType.includes("'support'")) {
    return
  }

  await pool.execute(
    `ALTER TABLE users
     MODIFY COLUMN role ENUM('user','support','admin') NOT NULL DEFAULT 'user' COMMENT '角色：普通用户/客服/管理员'`
  )
}

async function ensureOrderSupportSchema() {
  const databaseName = process.env.DB_NAME || 'game_rental'
  const supportColumns = [
    {
      name: 'support_status',
      sql: `ALTER TABLE orders
            ADD COLUMN support_status ENUM('none', 'pending', 'handling', 'resolved') NOT NULL DEFAULT 'none' COMMENT '客服介入状态' AFTER cancelled_at`
    },
    {
      name: 'support_requested_at',
      sql: `ALTER TABLE orders
            ADD COLUMN support_requested_at DATETIME DEFAULT NULL COMMENT '申请客服介入时间' AFTER support_status`
    },
    {
      name: 'support_requested_by',
      sql: `ALTER TABLE orders
            ADD COLUMN support_requested_by INT DEFAULT NULL COMMENT '申请客服介入的用户ID' AFTER support_requested_at`
    },
    {
      name: 'support_assignee_id',
      sql: `ALTER TABLE orders
            ADD COLUMN support_assignee_id INT DEFAULT NULL COMMENT '当前处理客服用户ID' AFTER support_requested_by`
    },
    {
      name: 'support_handling_at',
      sql: `ALTER TABLE orders
            ADD COLUMN support_handling_at DATETIME DEFAULT NULL COMMENT '客服领取并开始处理时间' AFTER support_assignee_id`
    },
    {
      name: 'support_note',
      sql: `ALTER TABLE orders
            ADD COLUMN support_note VARCHAR(500) DEFAULT NULL COMMENT '客服处理备注' AFTER support_handling_at`
    },
    {
      name: 'support_origin_status',
      sql: `ALTER TABLE orders
            ADD COLUMN support_origin_status VARCHAR(50) DEFAULT NULL COMMENT '客服冻结前原始订单状态' AFTER support_note`
    },
    {
      name: 'support_freeze_reason',
      sql: `ALTER TABLE orders
            ADD COLUMN support_freeze_reason VARCHAR(500) DEFAULT NULL COMMENT '客服冻结资金原因' AFTER support_origin_status`
    },
    {
      name: 'support_resolved_at',
      sql: `ALTER TABLE orders
            ADD COLUMN support_resolved_at DATETIME DEFAULT NULL COMMENT '客服处理完成时间' AFTER support_freeze_reason`
    }
  ]

  for (const column of supportColumns) {
    const [rows] = await pool.execute(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'orders'
         AND COLUMN_NAME = ?
       LIMIT 1`,
      [databaseName, column.name]
    )
    if (!rows.length) {
      await pool.execute(column.sql)
    }
  }
}

async function ensurePresaleSupportSchema() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS presale_consultations (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '售前咨询ID',
      user_id INT NOT NULL COMMENT '发起咨询的用户ID',
      support_assignee_id INT NOT NULL COMMENT '当前负责客服ID',
      support_status ENUM('handling', 'resolved') NOT NULL DEFAULT 'handling' COMMENT '售前咨询处理状态',
      support_note VARCHAR(500) DEFAULT NULL COMMENT '客服内部备注',
      resolved_at DATETIME DEFAULT NULL COMMENT '处理完成时间',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (support_assignee_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_presale_consultations_user_status (user_id, support_status, id),
      INDEX idx_presale_consultations_support_status (support_assignee_id, support_status, id),
      INDEX idx_presale_consultations_updated_at (updated_at, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )
}

async function ensureSupportEventSchema() {
  const databaseName = process.env.DB_NAME || 'game_rental'

  const [eventTypeRows] = await pool.execute(
    `SELECT COLUMN_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'support_order_events'
       AND COLUMN_NAME = 'event_type'
     LIMIT 1`,
    [databaseName]
  )

  await pool.execute(
    `CREATE TABLE IF NOT EXISTS support_order_events (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '客服工单事件ID',
      order_id INT NOT NULL COMMENT '关联订单ID',
      event_type ENUM('requested', 'claimed', 'note_updated', 'resolved', 'abnormal_reported', 'cancelled', 'funds_frozen', 'funds_released') NOT NULL COMMENT '事件类型',
      operator_user_id INT DEFAULT NULL COMMENT '操作人用户ID',
      operator_role ENUM('buyer', 'seller', 'support', 'system') NOT NULL DEFAULT 'system' COMMENT '操作人角色',
      operator_name VARCHAR(100) NOT NULL DEFAULT '' COMMENT '操作人展示名',
      title VARCHAR(100) NOT NULL DEFAULT '' COMMENT '时间线标题',
      description VARCHAR(500) NOT NULL DEFAULT '' COMMENT '时间线描述',
      public_message VARCHAR(500) DEFAULT NULL COMMENT '同步到订单会话的系统消息',
      note VARCHAR(500) DEFAULT NULL COMMENT '本次事件附带备注',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (operator_user_id) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_support_order_events_order_id (order_id, id),
      INDEX idx_support_order_events_operator (operator_user_id, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )

  const currentColumnType = String(eventTypeRows[0]?.COLUMN_TYPE || '')
  if (
    currentColumnType
    && (
      !currentColumnType.includes("'abnormal_reported'")
      || !currentColumnType.includes("'cancelled'")
      || !currentColumnType.includes("'funds_frozen'")
      || !currentColumnType.includes("'funds_released'")
    )
  ) {
    await pool.execute(
      `ALTER TABLE support_order_events
       MODIFY COLUMN event_type ENUM('requested', 'claimed', 'note_updated', 'resolved', 'abnormal_reported', 'cancelled', 'funds_frozen', 'funds_released') NOT NULL COMMENT '事件类型'`
    )
  }
}

async function getOrderConversationAccess(orderId, viewerUserId, viewerRole = 'user') {
  const [rows] = await pool.execute(
    `SELECT
        o.id,
        o.order_no,
        o.status,
        o.support_status,
        o.support_assignee_id,
        o.listing_id,
        o.listing_title,
        o.buyer_id,
        o.seller_id,
        o.seller_name,
        buyer.username AS buyer_name,
        seller.username AS seller_user_name,
        support.username AS support_assignee_name
     FROM orders o
     JOIN users buyer ON buyer.id = o.buyer_id
     LEFT JOIN users seller ON seller.id = o.seller_id
     LEFT JOIN users support ON support.id = o.support_assignee_id
     WHERE o.id = ?
     LIMIT 1`,
    [orderId]
  )

  if (!rows.length) return null

  const order = rows[0]
  const userId = Number(viewerUserId || 0)
  const isBuyer = Number(order.buyer_id) === userId
  const isSeller = Number(order.seller_id || 0) === userId
  const isSupport = String(viewerRole || '') === 'support' && Number(order.support_assignee_id || 0) === userId

  if (!isBuyer && !isSeller) {
    if (isSupport) {
      return {
        ...order,
        participant_role: 'support'
      }
    }
    return null
  }

  return {
    ...order,
    participant_role: isBuyer ? 'buyer' : 'seller'
  }
}

async function assignPresaleSupportUser(executor) {
  const [rows] = await executor.execute(
    `SELECT
        u.id,
        u.username,
        COUNT(pc.id) AS active_consultation_count,
        MAX(pc.created_at) AS last_assigned_at
     FROM users u
     LEFT JOIN presale_consultations pc
       ON pc.support_assignee_id = u.id
      AND pc.support_status = 'handling'
     WHERE u.role = 'support'
     GROUP BY u.id, u.username
     ORDER BY active_consultation_count ASC, COALESCE(last_assigned_at, '1970-01-01 00:00:00') ASC, u.id ASC
     LIMIT 1`
  )

  if (!rows.length) {
    throw new Error('当前暂无可分配的客服，请稍后再试')
  }

  return {
    id: Number(rows[0].id || 0),
    username: rows[0].username || '客服'
  }
}

async function getPresaleConversationAccess(consultationId, viewerUserId, viewerRole = 'user') {
  const [rows] = await pool.execute(
    `SELECT
        pc.id,
        pc.user_id AS consultation_user_id,
        pc.support_assignee_id AS consultation_support_assignee_id,
        pc.support_status AS presale_support_status,
        pc.support_note,
        pc.created_at AS consultation_created_at,
        pc.updated_at AS consultation_updated_at,
        pc.resolved_at AS consultation_resolved_at,
        consultation_user.username AS consultation_user_name,
        support_user.username AS consultation_support_name
     FROM presale_consultations pc
     JOIN users consultation_user
       ON consultation_user.id = pc.user_id
     LEFT JOIN users support_user
       ON support_user.id = pc.support_assignee_id
     WHERE pc.id = ?
     LIMIT 1`,
    [consultationId]
  )

  if (!rows.length) return null

  const consultation = rows[0]
  const userId = Number(viewerUserId || 0)
  const isOwner = Number(consultation.consultation_user_id || 0) === userId
  const isSupport = String(viewerRole || '') === 'support'
    && Number(consultation.consultation_support_assignee_id || 0) === userId

  if (!isOwner && !isSupport) {
    return null
  }

  return {
    ...consultation,
    participant_role: isOwner ? 'user' : 'support'
  }
}

async function ensureOrderConversation(order) {
  const orderId = Number(order?.id || 0)
  if (!orderId) throw new Error('缺少订单信息')

  const [existingRows] = await chatExecute(
    'ensureOrderConversation:findExisting',
    `SELECT *
     FROM conversations
     WHERE type = 'order' AND ref_id = ?
     LIMIT 1`,
    [orderId]
  )

  let conversationId = Number(existingRows[0]?.id || 0)
  const title = buildOrderConversationTitle(order)

  if (!conversationId) {
    const [result] = await chatExecute(
      'ensureOrderConversation:create',
      `INSERT INTO conversations (type, ref_id, title, status)
       VALUES ('order', ?, ?, 'active')`,
      [orderId, title]
    )
    conversationId = Number(result.insertId || 0)
  } else {
    await chatExecute(
      'ensureOrderConversation:updateTitle',
      `UPDATE conversations
       SET title = ?, status = 'active'
       WHERE id = ?`,
      [title, conversationId]
    )
  }

  const participantValues = [
    conversationId, order.buyer_id, 'buyer',
    conversationId, order.seller_id, 'seller'
  ]
  const valuePlaceholders = ['(?, ?, ?)', '(?, ?, ?)']
  if (Number(order.support_assignee_id || 0) > 0) {
    participantValues.push(conversationId, Number(order.support_assignee_id), 'support')
    valuePlaceholders.push('(?, ?, ?)')
  }

  await chatExecute(
    'ensureOrderConversation:upsertParticipants',
    `INSERT INTO conversation_participants (conversation_id, user_id, role)
     VALUES ${valuePlaceholders.join(', ')}
     ON DUPLICATE KEY UPDATE role = VALUES(role)`,
    participantValues
  )

  return conversationId
}

async function ensurePresaleConversation(consultation) {
  const consultationId = Number(consultation?.id || 0)
  if (!consultationId) throw new Error('缺少售前咨询信息')

  const [existingRows] = await chatExecute(
    'ensurePresaleConversation:findExisting',
    `SELECT *
     FROM conversations
     WHERE type = 'presale' AND ref_id = ?
     LIMIT 1`,
    [consultationId]
  )

  let conversationId = Number(existingRows[0]?.id || 0)
  const title = buildPresaleConversationTitle(consultation)

  if (!conversationId) {
    const [result] = await chatExecute(
      'ensurePresaleConversation:create',
      `INSERT INTO conversations (type, ref_id, title, status)
       VALUES ('presale', ?, ?, 'active')`,
      [consultationId, title]
    )
    conversationId = Number(result.insertId || 0)
  } else {
    await chatExecute(
      'ensurePresaleConversation:updateTitle',
      `UPDATE conversations
       SET title = ?, status = 'active'
       WHERE id = ?`,
      [title, conversationId]
    )
  }

  await chatExecute(
    'ensurePresaleConversation:upsertParticipants',
    `INSERT INTO conversation_participants (conversation_id, user_id, role)
     VALUES (?, ?, 'buyer'), (?, ?, 'support')
     ON DUPLICATE KEY UPDATE role = VALUES(role)`,
    [
      conversationId,
      Number(consultation.consultation_user_id || consultation.user_id || 0),
      conversationId,
      Number(consultation.consultation_support_assignee_id || consultation.support_assignee_id || 0)
    ]
  )

  return conversationId
}

async function ensureSupportConversationParticipant(conversationId, supportUserId) {
  const safeConversationId = Number(conversationId || 0)
  const safeSupportUserId = Number(supportUserId || 0)
  if (!safeConversationId || !safeSupportUserId) return

  await chatExecute(
    'ensureSupportConversationParticipant:upsert',
    `INSERT INTO conversation_participants (conversation_id, user_id, role)
     VALUES (?, ?, 'support')
     ON DUPLICATE KEY UPDATE role = VALUES(role)`,
    [safeConversationId, safeSupportUserId]
  )
  await syncParticipantUnreadCount(safeConversationId, safeSupportUserId)
}

async function getOrCreatePresaleConversationForUser(userId) {
  const safeUserId = Number(userId || 0)
  if (!safeUserId) {
    throw new Error('用户ID无效')
  }

  const conn = await pool.getConnection()
  let consultation = null
  let created = false

  try {
    await conn.beginTransaction()

    const [existingRows] = await conn.execute(
      `SELECT
          pc.id,
          pc.user_id AS consultation_user_id,
          pc.support_assignee_id AS consultation_support_assignee_id,
          pc.support_status AS presale_support_status,
          pc.support_note,
          pc.created_at AS consultation_created_at,
          pc.updated_at AS consultation_updated_at,
          pc.resolved_at AS consultation_resolved_at,
          consultation_user.username AS consultation_user_name,
          support_user.username AS consultation_support_name
       FROM presale_consultations pc
       JOIN users consultation_user
         ON consultation_user.id = pc.user_id
       LEFT JOIN users support_user
         ON support_user.id = pc.support_assignee_id
       WHERE pc.user_id = ?
         AND pc.support_status = 'handling'
       ORDER BY pc.id DESC
       LIMIT 1
       FOR UPDATE`,
      [safeUserId]
    )

    consultation = existingRows[0] || null

    if (!consultation) {
      const supportUser = await assignPresaleSupportUser(conn)
      const [insertResult] = await conn.execute(
        `INSERT INTO presale_consultations (
            user_id,
            support_assignee_id,
            support_status,
            support_note,
            resolved_at
          ) VALUES (?, ?, 'handling', NULL, NULL)`,
        [safeUserId, supportUser.id]
      )
      const consultationId = Number(insertResult.insertId || 0)
      const [createdRows] = await conn.execute(
        `SELECT
            pc.id,
            pc.user_id AS consultation_user_id,
            pc.support_assignee_id AS consultation_support_assignee_id,
            pc.support_status AS presale_support_status,
            pc.support_note,
            pc.created_at AS consultation_created_at,
            pc.updated_at AS consultation_updated_at,
            pc.resolved_at AS consultation_resolved_at,
            consultation_user.username AS consultation_user_name,
            support_user.username AS consultation_support_name
         FROM presale_consultations pc
         JOIN users consultation_user
           ON consultation_user.id = pc.user_id
         LEFT JOIN users support_user
           ON support_user.id = pc.support_assignee_id
         WHERE pc.id = ?
         LIMIT 1`,
        [consultationId]
      )
      consultation = createdRows[0] || null
      created = true
    }

    await conn.commit()
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }

  if (!consultation) {
    throw new Error('创建售前咨询失败')
  }

  const conversationId = await ensurePresaleConversation(consultation)

  if (created && Number(consultation.consultation_support_assignee_id || 0) > 0) {
    const systemMessage = await createConversationMessage({
      conversationId,
      senderUserId: Number(consultation.consultation_support_assignee_id || 0),
      messageType: 'system',
      content: `已接入售前客服 ${consultation.consultation_support_name || '客服'}，请详细描述你的咨询问题。`
    })
    const userConversation = await getConversationForUser(conversationId, safeUserId)
    if (userConversation) {
      await emitConversationMessage(userConversation, systemMessage, Number(consultation.consultation_support_assignee_id || 0))
    }
  }

  return getConversationForUser(conversationId, safeUserId)
}

async function getConversationForUser(conversationId, viewerUserId) {
  const [rows] = await chatExecute(
    'getConversationForUser',
    `SELECT
        c.id,
        c.type,
        c.ref_id,
        c.title,
        c.status,
        c.last_message_preview,
        c.last_message_at,
        c.updated_at,
        cp.role AS participant_role,
        cp.unread_message_count,
        cp.last_read_message_id,
        o.order_no,
        o.listing_title,
        o.support_status,
        o.support_assignee_id,
        support.username AS support_assignee_name,
        o.buyer_id,
        o.seller_id,
        o.seller_name,
        buyer.username AS buyer_name,
        seller.username AS seller_user_name,
        pc.user_id AS consultation_user_id,
        pc.support_assignee_id AS consultation_support_assignee_id,
        pc.support_status AS presale_support_status,
        pc.created_at AS consultation_created_at,
        consultation_user.username AS consultation_user_name,
        consultation_support.username AS consultation_support_name
     FROM conversations c
     JOIN conversation_participants cp
       ON cp.conversation_id = c.id
      AND cp.user_id = ?
     LEFT JOIN orders o
       ON c.type = 'order'
      AND c.ref_id = o.id
     LEFT JOIN users support
       ON support.id = o.support_assignee_id
     LEFT JOIN users buyer
       ON buyer.id = o.buyer_id
     LEFT JOIN users seller
       ON seller.id = o.seller_id
     LEFT JOIN presale_consultations pc
       ON c.type = 'presale'
      AND c.ref_id = pc.id
     LEFT JOIN users consultation_user
       ON consultation_user.id = pc.user_id
     LEFT JOIN users consultation_support
       ON consultation_support.id = pc.support_assignee_id
     WHERE c.id = ?
     LIMIT 1`,
    [viewerUserId, conversationId]
  )

  return rows[0] || null
}

async function getConversationMessages(conversationId, page = 1, pageSize = 50) {
  const safePage = Math.max(1, Number(page) || 1)
  const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 50))
  const offset = (safePage - 1) * safePageSize

  const [countRows] = await chatExecute(
    'getConversationMessages:count',
    `SELECT COUNT(*) AS total
     FROM conversation_messages
     WHERE conversation_id = ?`,
    [conversationId]
  )

  const [rows] = await chatQuery(
    'getConversationMessages:list',
    `SELECT
        m.id,
        m.conversation_id,
        m.sender_user_id,
        cp.role AS sender_role,
        u.username AS sender_name,
        m.message_type,
        m.content,
        m.media_url,
        m.media_name,
        m.media_size,
        m.created_at
     FROM conversation_messages m
     JOIN users u
       ON u.id = m.sender_user_id
     LEFT JOIN conversation_participants cp
       ON cp.conversation_id = m.conversation_id
      AND cp.user_id = m.sender_user_id
     WHERE m.conversation_id = ?
     ORDER BY m.id ASC
     LIMIT ${safePageSize} OFFSET ${offset}`,
    [conversationId]
  )

  return {
    total: Number(countRows[0]?.total || 0),
    page: safePage,
    pageSize: safePageSize,
    list: rows.map(serializeConversationMessage)
  }
}

function normalizeConversationScope(scope) {
  const value = String(scope || '').trim().toLowerCase()
  if (value === 'support') return 'support'
  if (value === 'regular') return 'regular'
  return 'all'
}

function buildConversationScopeFilter(scope, columnName = 'role') {
  const normalizedScope = normalizeConversationScope(scope)
  if (normalizedScope === 'support') {
    return {
      scope: normalizedScope,
      sql: ` AND ${columnName} = ?`,
      params: ['support']
    }
  }
  if (normalizedScope === 'regular') {
    return {
      scope: normalizedScope,
      sql: ` AND ${columnName} <> ?`,
      params: ['support']
    }
  }
  return {
    scope: normalizedScope,
    sql: '',
    params: []
  }
}

async function getConversationListForUser(viewerUserId, page = 1, pageSize = 20, scope = 'all') {
  const safePage = Math.max(1, Number(page) || 1)
  const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 20))
  const offset = (safePage - 1) * safePageSize
  const scopeFilter = buildConversationScopeFilter(scope)

  const [countRows] = await chatExecute(
    'getConversationListForUser:count',
    `SELECT COUNT(*) AS total
     FROM conversation_participants
     WHERE user_id = ?${scopeFilter.sql}`,
    [viewerUserId, ...scopeFilter.params]
  )

  const [rows] = await chatQuery(
    'getConversationListForUser:list',
    `SELECT
        c.id,
        c.type,
        c.ref_id,
        c.title,
        c.status,
        c.last_message_preview,
        c.last_message_at,
        c.updated_at,
        cp.role AS participant_role,
        cp.last_read_message_id,
        cp.unread_message_count,
        o.order_no,
        o.listing_title,
        o.support_status,
        o.support_assignee_id,
        support.username AS support_assignee_name,
        o.buyer_id,
        o.seller_id,
        o.seller_name,
        buyer.username AS buyer_name,
        seller.username AS seller_user_name,
        pc.user_id AS consultation_user_id,
        pc.support_assignee_id AS consultation_support_assignee_id,
        pc.support_status AS presale_support_status,
        pc.created_at AS consultation_created_at,
        consultation_user.username AS consultation_user_name,
        consultation_support.username AS consultation_support_name,
        cp.unread_message_count AS unread_count
     FROM conversations c
     JOIN conversation_participants cp
       ON cp.conversation_id = c.id
      AND cp.user_id = ?
      ${scopeFilter.sql.replaceAll('role', 'cp.role').trim()}
     LEFT JOIN orders o
       ON c.type = 'order'
      AND c.ref_id = o.id
     LEFT JOIN users support
       ON support.id = o.support_assignee_id
     LEFT JOIN users buyer
       ON buyer.id = o.buyer_id
     LEFT JOIN users seller
       ON seller.id = o.seller_id
     LEFT JOIN presale_consultations pc
       ON c.type = 'presale'
      AND c.ref_id = pc.id
     LEFT JOIN users consultation_user
       ON consultation_user.id = pc.user_id
     LEFT JOIN users consultation_support
       ON consultation_support.id = pc.support_assignee_id
     ORDER BY COALESCE(c.last_message_at, c.updated_at, c.created_at) DESC, c.id DESC
     LIMIT ${safePageSize} OFFSET ${offset}`,
    [viewerUserId, ...scopeFilter.params]
  )

  return {
    total: Number(countRows[0]?.total || 0),
    page: safePage,
    pageSize: safePageSize,
    list: rows.map((row) => serializeConversationRow(row, viewerUserId))
  }
}

async function getUnreadSummaryForUser(viewerUserId) {
  const safeUserId = Number(viewerUserId || 0)
  const [rows] = await chatExecute(
    'getUnreadSummaryForUser',
    `SELECT
        COALESCE(SUM(cp.unread_message_count), 0) AS unread_total,
        COALESCE(SUM(CASE WHEN cp.role = 'support' THEN cp.unread_message_count ELSE 0 END), 0) AS support_unread_total,
        COALESCE(SUM(CASE WHEN cp.role <> 'support' THEN cp.unread_message_count ELSE 0 END), 0) AS regular_unread_total,
        COALESCE(
          SUM(
            CASE
              WHEN cp.role = 'support'
               AND (
                 (c.type = 'order' AND COALESCE(o.support_status, 'handling') = 'handling')
                 OR (c.type = 'presale' AND COALESCE(pc.support_status, 'handling') = 'handling')
               )
              THEN cp.unread_message_count
              ELSE 0
            END
          ),
          0
        ) AS support_handling_unread_total
     FROM conversation_participants cp
     LEFT JOIN conversations c
       ON c.id = cp.conversation_id
     LEFT JOIN orders o
       ON c.type = 'order'
      AND c.ref_id = o.id
     LEFT JOIN presale_consultations pc
       ON c.type = 'presale'
      AND c.ref_id = pc.id
     WHERE cp.user_id = ?`,
    [safeUserId]
  )

  return {
    unread_total: Number(rows[0]?.unread_total || 0),
    support_unread_total: Number(rows[0]?.support_unread_total || 0),
    regular_unread_total: Number(rows[0]?.regular_unread_total || 0),
    support_handling_unread_total: Number(rows[0]?.support_handling_unread_total || 0)
  }
}

function buildConversationUnreadSocketPayload(summary = {}) {
  return {
    conversation_unread_total: Number(summary?.unread_total || 0),
    regular_conversation_unread_total: Number(summary?.regular_unread_total || 0),
    support_unread_total: Number(summary?.support_unread_total || 0),
    support_handling_unread_total: Number(summary?.support_handling_unread_total || 0)
  }
}

async function markConversationAsRead(conversationId, userId, lastReadMessageId) {
  let targetMessageId = Number(lastReadMessageId || 0)

  if (!targetMessageId) {
    const [rows] = await chatExecute(
      'markConversationAsRead:findLastMessage',
      `SELECT id
       FROM conversation_messages
       WHERE conversation_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [conversationId]
    )
    targetMessageId = Number(rows[0]?.id || 0)
  }

  let remainingUnreadCount = 0
  if (targetMessageId) {
    const [remainingRows] = await chatExecute(
      'markConversationAsRead:remainingUnread',
      `SELECT COUNT(*) AS total
       FROM conversation_messages
       WHERE conversation_id = ?
         AND sender_user_id <> ?
         AND id > ?`,
      [conversationId, userId, targetMessageId]
    )
    remainingUnreadCount = Number(remainingRows[0]?.total || 0)
  }

  await chatExecute(
    'markConversationAsRead:updateParticipant',
    `UPDATE conversation_participants
     SET last_read_message_id = ?,
         unread_message_count = ?
     WHERE conversation_id = ? AND user_id = ?`,
    [targetMessageId || null, remainingUnreadCount, conversationId, userId]
  )

  return targetMessageId
}

async function createConversationMessage({
  conversationId,
  senderUserId,
  messageType = 'text',
  content,
  mediaUrl = '',
  mediaName = '',
  mediaSize = 0
}) {
  const normalizedMessageType = normalizeConversationMessageType(messageType)
  const sanitizedContent = normalizedMessageType === 'image'
    ? ''
    : sanitizeConversationMessageContent(content)
  const sanitizedMediaUrl = sanitizeConversationMediaUrl(mediaUrl)
  const sanitizedMediaName = sanitizeConversationMediaName(mediaName)
  const sanitizedMediaSize = sanitizeConversationMediaSize(mediaSize)

  if (normalizedMessageType === 'image') {
    if (!sanitizedMediaUrl) {
      throw new Error('图片消息地址无效')
    }

    const [uploadRows] = await chatExecute(
      'createConversationMessage:validateUpload',
      `SELECT id
       FROM conversation_message_uploads
       WHERE conversation_id = ?
         AND uploader_user_id = ?
         AND media_url = ?
         AND consumed_message_id IS NULL
       LIMIT 1`,
      [conversationId, senderUserId, sanitizedMediaUrl]
    )
    if (!uploadRows.length) {
      throw new Error('该图片未上传成功或已发送，请重新上传')
    }
  } else if (!sanitizedContent) {
    throw new Error('消息内容不能为空')
  }

  const [result] = await chatExecute(
    'createConversationMessage:insert',
    `INSERT INTO conversation_messages (
        conversation_id,
        sender_user_id,
        message_type,
        content,
        media_url,
        media_name,
        media_size
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      conversationId,
      senderUserId,
      normalizedMessageType,
      sanitizedContent,
      sanitizedMediaUrl || null,
      sanitizedMediaName || null,
      sanitizedMediaSize
    ]
  )

  const messageId = Number(result.insertId || 0)

  if (normalizedMessageType === 'image') {
    await chatExecute(
      'createConversationMessage:consumeUpload',
      `UPDATE conversation_message_uploads
       SET consumed_message_id = ?, consumed_at = NOW()
       WHERE conversation_id = ?
         AND uploader_user_id = ?
         AND media_url = ?
         AND consumed_message_id IS NULL`,
      [messageId, conversationId, senderUserId, sanitizedMediaUrl]
    )
  }

  await chatExecute(
    'createConversationMessage:updateConversationPreview',
    `UPDATE conversations
     SET last_message_preview = ?, last_message_at = NOW()
     WHERE id = ?`,
    [buildConversationMessagePreview(normalizedMessageType, sanitizedContent), conversationId]
  )

  await chatExecute(
    'createConversationMessage:updateUnreadCounters',
    `UPDATE conversation_participants
     SET unread_message_count = CASE
       WHEN user_id = ? THEN unread_message_count
       ELSE unread_message_count + 1
     END
     WHERE conversation_id = ?`,
    [senderUserId, conversationId]
  )

  const [rows] = await chatExecute(
    'createConversationMessage:selectMessage',
    `SELECT
        m.id,
        m.conversation_id,
        m.sender_user_id,
        cp.role AS sender_role,
        u.username AS sender_name,
        m.message_type,
        m.content,
        m.media_url,
        m.media_name,
        m.media_size,
        m.created_at
     FROM conversation_messages m
     JOIN users u
       ON u.id = m.sender_user_id
     LEFT JOIN conversation_participants cp
       ON cp.conversation_id = m.conversation_id
      AND cp.user_id = m.sender_user_id
     WHERE m.id = ?
     LIMIT 1`,
    [messageId]
  )

  return serializeConversationMessage(rows[0] || {
    id: messageId,
    conversation_id: conversationId,
    sender_user_id: senderUserId,
    sender_role: 'buyer',
    sender_name: '',
    message_type: normalizedMessageType,
    content: sanitizedContent,
    media_url: sanitizedMediaUrl,
    media_name: sanitizedMediaName,
    media_size: sanitizedMediaSize,
    created_at: new Date()
  })
}

async function recordConversationMessageUpload({
  conversationId,
  uploaderUserId,
  mediaUrl,
  mediaName = '',
  mediaSize = 0
}) {
  const sanitizedMediaUrl = sanitizeConversationMediaUrl(mediaUrl)
  if (!sanitizedMediaUrl) {
    throw new Error('聊天图片地址无效')
  }

  await chatExecute(
    'recordConversationMessageUpload',
    `INSERT INTO conversation_message_uploads (
        conversation_id,
        uploader_user_id,
        media_url,
        media_name,
        media_size,
        consumed_message_id,
        consumed_at
      ) VALUES (?, ?, ?, ?, ?, NULL, NULL)
      ON DUPLICATE KEY UPDATE
        conversation_id = VALUES(conversation_id),
        uploader_user_id = VALUES(uploader_user_id),
        media_name = VALUES(media_name),
        media_size = VALUES(media_size),
        consumed_message_id = NULL,
        consumed_at = NULL`,
    [
      Number(conversationId || 0),
      Number(uploaderUserId || 0),
      sanitizedMediaUrl,
      sanitizeConversationMediaName(mediaName),
      sanitizeConversationMediaSize(mediaSize)
    ]
  )
}

async function emitConversationMessage(conversation, message, actorUserId) {
  const conversationId = Number(message?.conversation_id || conversation?.id || 0)
  if (!conversationId) return

  io.to(getConversationRoomName(conversationId)).emit('message:new', message)

  const [participantRows] = await chatExecute(
    'emitConversationMessage:getParticipants',
    `SELECT user_id
     FROM conversation_participants
     WHERE conversation_id = ?
       AND user_id <> ?`,
    [conversationId, Number(actorUserId || 0)]
  )

  const participantUserIds = participantRows
    .map((row) => Number(row.user_id || 0))
    .filter((userId) => userId > 0)

  await Promise.all(participantUserIds.map(async (userId) => {
    const unreadSummary = await getUnreadSummaryForUser(userId)
    io.to(getUserRoomName(userId)).emit('message:notify', {
      conversation_id: conversationId,
      message_id: Number(message?.id || 0),
      sender_user_id: Number(message?.sender_user_id || 0),
      unread_summary: buildConversationUnreadSocketPayload(unreadSummary)
    })
  }))
}

  return {
    getConversationRoomName,
    getUserRoomName,
    logChatEvent,
    consumeSocketMessageQuota,
    sanitizeSupportNote,
    normalizeSupportStatus,
    normalizePresaleSupportStatus,
    sanitizeSupportSearchKeyword,
    normalizeSupportAssigneeScope,
    getSupportTimeoutMinutes,
    buildSupportTimeoutMeta,
    buildSupportOrderFilterParts,
    getSupportOrderTimeline,
    buildLegacySupportTimeline,
    emitSupportEvent,
    buildPresaleConsultationNo,
    serializeConversationRow,
    ensureConversationSchema,
    ensureUserRoleSchema,
    ensureOrderSupportSchema,
    ensurePresaleSupportSchema,
    ensureSupportEventSchema,
    getOrderConversationAccess,
    getPresaleConversationAccess,
    ensureOrderConversation,
    ensurePresaleConversation,
    ensureSupportConversationParticipant,
    getOrCreatePresaleConversationForUser,
    getConversationForUser,
    getConversationMessages,
    normalizeConversationScope,
    getConversationListForUser,
    getUnreadSummaryForUser,
    markConversationAsRead,
    recordConversationMessageUpload,
    createConversationMessage,
    emitConversationMessage
  }
}
