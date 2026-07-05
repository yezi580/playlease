/**
 * 通知相关 HTTP 路由，处理列表、未读数量与已读操作。
 */

export function registerNotificationRoutes(deps) {
  const {
    app,
    authRequired,
    authenticatedReadLimiter,
    authenticatedWriteLimiter,
    getUserNotificationList,
    getUnreadNotificationSummary,
    markUserNotificationAsRead
  } = deps

app.get('/api/notifications', authRequired, authenticatedReadLimiter, async (req, res) => {
  const page = Math.max(1, Number(req.query?.page || 1) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(req.query?.pageSize || 20) || 20))

  try {
    const payload = await getUserNotificationList(req.auth.userId, page, pageSize)
    res.json(payload)
  } catch (error) {
    console.error('[notification] get list failed', error)
    res.status(500).json({ message: '加载通知列表失败' })
  }
})

app.get('/api/notifications/unread-summary', authRequired, authenticatedReadLimiter, async (req, res) => {
  try {
    const summary = await getUnreadNotificationSummary(req.auth.userId)
    res.json(summary)
  } catch (error) {
    console.error('[notification] get unread summary failed', error)
    res.status(500).json({ message: '加载通知未读统计失败' })
  }
})

app.put('/api/notifications/:id/read', authRequired, authenticatedWriteLimiter, async (req, res) => {
  const notificationId = Math.max(0, Number(req.params?.id || 0) || 0)

  if (!notificationId) {
    return res.status(400).json({ message: '无效的通知ID' })
  }

  try {
    const notification = await markUserNotificationAsRead(notificationId, req.auth.userId)
    if (!notification) {
      return res.status(404).json({ message: '通知不存在' })
    }
    res.json({
      message: '通知已设为已读',
      notification
    })
  } catch (error) {
    console.error('[notification] mark as read failed', error)
    res.status(500).json({ message: '更新通知状态失败' })
  }
})
}
