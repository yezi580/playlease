/**
 * 通知服务辅助逻辑，处理未读数量与消息投递。
 */

function sanitizeNotificationText(value, maxLength = 1000) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function serializeUserNotification(row) {
  return {
    id: Number(row?.id || 0),
    item_type: 'notification',
    category: row?.category || 'system',
    title: row?.title || '平台通知',
    content: row?.content || '',
    preview: row?.content || '',
    related_type: row?.related_type || '',
    related_id: Number(row?.related_id || 0),
    is_read: Boolean(row?.is_read),
    unread_count: row?.is_read ? 0 : 1,
    created_at: row?.created_at,
    updated_at: row?.updated_at || row?.created_at
  }
}

export function createNotificationService({ pool, io = null, getUserRoomName = null }) {
  function emitNotificationEvent(userId, eventName, payload = {}) {
    const safeUserId = Number(userId || 0)
    if (!io || typeof getUserRoomName !== 'function' || !safeUserId || !eventName) return
    io.to(getUserRoomName(safeUserId)).emit(eventName, payload)
  }

  async function buildNotificationUnreadSocketPayload(userId) {
    const summary = await getUnreadNotificationSummary(userId)
    return {
      notification_unread_total: Number(summary?.unread_total || 0)
    }
  }

  async function createUserNotification(payload = {}) {
    const userId = Number(payload.userId || 0)
    if (!userId) {
      throw new Error('缺少通知接收用户')
    }

    const title = sanitizeNotificationText(payload.title, 120)
    const content = sanitizeNotificationText(payload.content, 1000)
    if (!title || !content) {
      throw new Error('通知标题和内容不能为空')
    }

    const [result] = await pool.execute(
      `INSERT INTO user_notifications (user_id, category, title, content, related_type, related_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        sanitizeNotificationText(payload.category, 50) || 'system',
        title,
        content,
        sanitizeNotificationText(payload.relatedType, 50) || null,
        Number(payload.relatedId || 0) || null
      ]
    )

    const [rows] = await pool.execute(
      `SELECT *
       FROM user_notifications
       WHERE id = ?
       LIMIT 1`,
      [result.insertId]
    )

    const notification = serializeUserNotification(rows[0] || {
      id: result.insertId,
      category: payload.category,
      title,
      content,
      related_type: payload.relatedType,
      related_id: payload.relatedId,
      is_read: 0,
      created_at: new Date(),
      updated_at: new Date()
    })

    emitNotificationEvent(userId, 'notification:notify', {
      notification_id: Number(notification.id || 0),
      unread_summary: await buildNotificationUnreadSocketPayload(userId)
    })

    return notification
  }

  async function createUserNotificationSafely(payload = {}) {
    try {
      return await createUserNotification(payload)
    } catch (error) {
      console.error('[notification] create failed', error)
      return null
    }
  }

  async function getUserNotificationList(userId, page = 1, pageSize = 20) {
    const safeUserId = Number(userId || 0)
    const safePage = Math.max(1, Number(page) || 1)
    const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 20))
    const offset = (safePage - 1) * safePageSize

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM user_notifications
       WHERE user_id = ?`,
      [safeUserId]
    )

    const [rows] = await pool.query(
      `SELECT *
       FROM user_notifications
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ${safePageSize} OFFSET ${offset}`,
      [safeUserId]
    )

    return {
      total: Number(countRows[0]?.total || 0),
      page: safePage,
      pageSize: safePageSize,
      list: rows.map(serializeUserNotification)
    }
  }

  async function getUnreadNotificationSummary(userId) {
    const safeUserId = Number(userId || 0)
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS unread_total
       FROM user_notifications
       WHERE user_id = ? AND is_read = 0`,
      [safeUserId]
    )

    return {
      unread_total: Number(rows[0]?.unread_total || 0)
    }
  }

  async function markUserNotificationAsRead(notificationId, userId) {
    const safeNotificationId = Number(notificationId || 0)
    const safeUserId = Number(userId || 0)
    if (!safeNotificationId || !safeUserId) return null

    await pool.execute(
      `UPDATE user_notifications
       SET is_read = 1,
           read_at = COALESCE(read_at, NOW())
       WHERE id = ? AND user_id = ?`,
      [safeNotificationId, safeUserId]
    )

    const [rows] = await pool.execute(
      `SELECT *
       FROM user_notifications
       WHERE id = ? AND user_id = ?
       LIMIT 1`,
      [safeNotificationId, safeUserId]
    )

    const notification = rows[0] ? serializeUserNotification(rows[0]) : null
    if (notification) {
      emitNotificationEvent(safeUserId, 'notification:read', {
        notification_id: Number(notification.id || 0),
        unread_summary: await buildNotificationUnreadSocketPayload(safeUserId)
      })
    }
    return notification
  }

  return {
    createUserNotification,
    createUserNotificationSafely,
    getUserNotificationList,
    getUnreadNotificationSummary,
    markUserNotificationAsRead
  }
}
