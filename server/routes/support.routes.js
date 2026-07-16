/**
 * 客服相关 HTTP 路由，处理工作台与工单操作。
 */

export function registerSupportRoutes(deps) {
  const {
    app,
    pool,
    authRequired,
    supportOnly,
    requireStepUpAuth,
    ADMIN_STEP_UP_POLICIES,
    authenticatedReadLimiter,
    orderWriteLimiter,
    normalizeOrderMoneyFields,
    chatModule,
    orderLifecycleService
  } = deps
  const {
    normalizeSupportStatus,
    sanitizeSupportSearchKeyword,
    buildSupportTimeoutMeta,
    getSupportOrderTimeline,
    buildLegacySupportTimeline,
    sanitizeSupportNote,
    getOrderConversationAccess,
    emitSupportEvent
  } = chatModule

app.get('/api/support/orders', authRequired, supportOnly, authenticatedReadLimiter, async (req, res) => {
  const page = Math.max(1, Number(req.query?.page || 1) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(req.query?.pageSize || 20) || 20))
  const offset = (page - 1) * pageSize
  const status = normalizeSupportStatus(req.query?.status || 'handling')
  const keyword = sanitizeSupportSearchKeyword(req.query?.keyword)
  const assigneeScope = 'mine'
  const pendingTimeoutMinutes = 24 * 60

  try {
    const activeStatuses = ['paid', 'support_handling', 'settlement_pending']
    const statusWhereSql = status === 'resolved'
      ? `o.support_status = 'resolved'`
      : `o.support_status = 'handling' AND o.status IN (${activeStatuses.map(() => '?').join(', ')})`
    const statusParams = status === 'resolved' ? [] : activeStatuses
    const keywordWhereSql = keyword
      ? `AND (
          o.order_no LIKE ?
          OR o.listing_title LIKE ?
          OR buyer.username LIKE ?
          OR buyer.phone LIKE ?
          OR seller.username LIKE ?
          OR seller.phone LIKE ?
          OR assignee.username LIKE ?
          OR assignee.phone LIKE ?
          OR o.seller_name LIKE ?
        )`
      : ''
    const keywordParams = keyword
      ? [
          `%${keyword}%`,
          `%${keyword}%`,
          `%${keyword}%`,
          `%${keyword}%`,
          `%${keyword}%`,
          `%${keyword}%`,
          `%${keyword}%`,
          `%${keyword}%`,
          `%${keyword}%`
        ]
      : []

    const [countRows] = await pool.execute(
      `SELECT
          CASE
            WHEN o.support_status = 'resolved' THEN 'resolved'
            ELSE 'handling'
          END AS support_bucket,
          COUNT(*) AS total
       FROM orders o
       JOIN users buyer
         ON buyer.id = o.buyer_id
       LEFT JOIN users seller
         ON seller.id = o.seller_id
       LEFT JOIN users assignee
         ON assignee.id = o.support_assignee_id
       WHERE o.support_assignee_id = ?
         AND (
           (o.support_status = 'handling' AND o.status IN (${activeStatuses.map(() => '?').join(', ')}))
           OR o.support_status = 'resolved'
         )
         ${keywordWhereSql}
       GROUP BY support_bucket`,
      [req.auth.userId, ...activeStatuses, ...keywordParams]
    )

    const counts = {
      pending: 0,
      handling: 0,
      resolved: 0
    }
    countRows.forEach((row) => {
      const key = String(row.support_bucket || 'handling')
      counts[key] = Number(row.total || 0)
    })

    const [[countRow]] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM orders o
       JOIN users buyer
         ON buyer.id = o.buyer_id
       LEFT JOIN users seller
         ON seller.id = o.seller_id
       LEFT JOIN users assignee
         ON assignee.id = o.support_assignee_id
       WHERE o.support_assignee_id = ?
         AND ${statusWhereSql}
         ${keywordWhereSql}`,
      [req.auth.userId, ...statusParams, ...keywordParams]
    )

    const [[statsRow]] = await pool.execute(
      `SELECT
          SUM(
            CASE
              WHEN status = 'settlement_pending'
               AND buyer_item_reported_at IS NOT NULL
               AND TIMESTAMPDIFF(MINUTE, buyer_item_reported_at, NOW()) >= ?
              THEN 1 ELSE 0
            END
          ) AS pending_timeout_total,
          SUM(CASE WHEN support_status = 'handling' AND support_assignee_id = ? THEN 1 ELSE 0 END) AS my_handling_count,
          SUM(CASE WHEN support_status = 'resolved' AND support_assignee_id = ? THEN 1 ELSE 0 END) AS my_resolved_total,
          SUM(
            CASE
              WHEN support_status = 'resolved'
               AND support_assignee_id = ?
               AND DATE(support_resolved_at) = CURDATE()
              THEN 1 ELSE 0
            END
          ) AS my_resolved_today
       FROM orders
       WHERE support_assignee_id = ?
         AND support_status IN ('handling', 'resolved')`,
      [
        pendingTimeoutMinutes,
        req.auth.userId,
        req.auth.userId,
        req.auth.userId,
        req.auth.userId
      ]
    )

    const [rows] = await pool.query(
      `SELECT
          o.id,
          o.order_no,
          o.listing_id,
          o.listing_title,
          o.listing_cover_image,
          o.status,
          o.buyer_id,
          o.seller_id,
          o.seller_name,
          o.support_scene,
          o.support_origin_status,
          o.support_freeze_reason,
          o.buyer_contact_wechat,
          o.buyer_contact_phone,
          o.seller_contact_wechat,
          o.seller_contact_phone,
          o.settlement_status,
          o.seller_item_confirmed_at,
          o.cancel_reason,
          o.cancel_requested_at,
          o.support_requested_at,
          o.support_status,
          o.support_assignee_id,
          o.support_handling_at,
          o.support_note,
          o.support_resolved_at,
          CASE
            WHEN o.status = 'settlement_pending' AND o.buyer_item_reported_at IS NOT NULL
            THEN TIMESTAMPDIFF(MINUTE, o.buyer_item_reported_at, NOW())
            ELSE 0
          END AS elapsed_minutes,
          o.created_at,
          buyer.username AS buyer_username,
          buyer.phone AS buyer_phone,
          seller.username AS seller_username,
          seller.phone AS seller_phone,
          assignee.username AS support_assignee_username,
          assignee.phone AS support_assignee_phone,
          COALESCE(chat_cp.unread_message_count, 0) AS conversation_unread_count
       FROM orders o
       JOIN users buyer
         ON buyer.id = o.buyer_id
       LEFT JOIN users seller
         ON seller.id = o.seller_id
       LEFT JOIN users assignee
         ON assignee.id = o.support_assignee_id
       LEFT JOIN conversations c
         ON c.type = 'order'
        AND c.ref_id = o.id
       LEFT JOIN conversation_participants chat_cp
         ON chat_cp.conversation_id = c.id
        AND chat_cp.user_id = ?
       WHERE o.support_assignee_id = ?
         AND ${statusWhereSql}
         ${keywordWhereSql}
       ORDER BY
         CASE
           WHEN o.support_status = 'resolved' THEN o.support_resolved_at
           WHEN o.support_status = 'handling' THEN COALESCE(o.support_handling_at, o.paid_at, o.created_at)
           ELSE o.paid_at
         END DESC,
         o.id DESC
       LIMIT ${pageSize} OFFSET ${offset}`
      ,
      [req.auth.userId, req.auth.userId, ...statusParams, ...keywordParams]
    )

    res.json({
      total: Number(countRow?.total || 0),
      page,
      pageSize,
      status,
      counts,
      alerts: {
        pending_timeout_total: Number(statsRow?.pending_timeout_total || 0),
        pending_timeout_minutes: pendingTimeoutMinutes
      },
      workload: {
        my_handling_count: Number(statsRow?.my_handling_count || 0),
        my_resolved_total: Number(statsRow?.my_resolved_total || 0),
        my_resolved_today: Number(statsRow?.my_resolved_today || 0)
      },
      keyword,
      assigneeScope,
      list: rows.map((row) => {
        const supportStatus = normalizeSupportStatus(row.support_status)
        const buyerDisplayName = row.buyer_username || `用户 #${Number(row.buyer_id || 0)}`
        const sellerDisplayName = row.seller_username || row.seller_name || '卖家'
        const supportAssigneeDisplayName = row.support_assignee_username || ''
        const issueReason = row.support_scene === 'cancel_request'
          ? '取消订单申请'
          : (row.support_scene === 'settlement_dispute'
              ? '结算争议处理'
              : (row.support_scene === 'fund_frozen' ? '资金冻结处理中' : '订单监督中'))
        const issueNote = row.support_scene === 'cancel_request'
          ? (row.cancel_reason || row.support_note || '')
          : (row.support_scene === 'fund_frozen'
              ? (row.support_freeze_reason || row.support_note || '')
              : (row.support_note || ''))
        const supportRequestedAt = row.support_requested_at || row.cancel_requested_at || row.created_at
        const supportOriginStatus = String(row.support_origin_status || '').trim()
        return {
          id: Number(row.id),
          order_no: row.order_no || '',
          listing_id: Number(row.listing_id || 0),
          listing_title: row.listing_title || '',
          listing_cover_image: row.listing_cover_image || '',
          status: row.status || 'paid',
          status_text: normalizeOrderMoneyFields({ amount: 0, deposit_amount: 0, status: row.status || 'paid' }).status_text,
          buyer_id: Number(row.buyer_id || 0),
          seller_id: Number(row.seller_id || 0),
          buyer_name: row.buyer_phone || buyerDisplayName,
          buyer_username: buyerDisplayName,
          buyer_phone: row.buyer_phone || '',
          buyer_contact_wechat: row.buyer_contact_wechat || '',
          buyer_contact_phone: row.buyer_contact_phone || '',
          seller_name: row.seller_phone || sellerDisplayName,
          seller_username: sellerDisplayName,
          seller_phone: row.seller_phone || '',
          seller_contact_wechat: row.seller_contact_wechat || '',
          seller_contact_phone: row.seller_contact_phone || '',
          issue_reason: issueReason,
          issue_note: issueNote,
          issue_at: supportRequestedAt,
          created_at: row.created_at,
          support_status: supportStatus,
          support_requested_at: supportRequestedAt,
          support_requested_by: 0,
          support_requested_by_name: row.support_scene === 'fund_frozen'
            ? (row.support_assignee_phone || supportAssigneeDisplayName || '客服')
            : (row.buyer_phone || buyerDisplayName || ''),
          support_assignee_id: Number(row.support_assignee_id || 0),
          support_assignee_name: row.support_assignee_phone || supportAssigneeDisplayName,
          support_assignee_username: supportAssigneeDisplayName,
          support_assignee_phone: row.support_assignee_phone || '',
          conversation_unread_count: Number(row.conversation_unread_count || 0),
          support_handling_at: row.support_handling_at,
          support_note: row.support_note || '',
          support_resolved_at: row.support_resolved_at,
          support_scene: row.support_scene || 'none',
          support_origin_status: supportOriginStatus,
          support_origin_status_text: supportOriginStatus
            ? normalizeOrderMoneyFields({ amount: 0, deposit_amount: 0, status: supportOriginStatus }).status_text
            : '',
          support_freeze_reason: row.support_freeze_reason || '',
          settlement_status: row.settlement_status || 'none',
          seller_item_confirmed_at: row.seller_item_confirmed_at || null,
          ...buildSupportTimeoutMeta(supportStatus, row.elapsed_minutes)
        }
      })
    })
  } catch (_error) {
    res.status(500).json({ message: '加载客服订单失败' })
  }
})

app.get('/api/support/orders/:id/timeline', authRequired, supportOnly, authenticatedReadLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '订单ID无效' })
  }

  try {
    const [[orderRow]] = await pool.execute(
      `SELECT
          o.id,
          o.status,
          o.support_status,
          o.created_at,
          o.buyer_id,
          o.seller_id,
          o.support_assignee_id,
          o.support_handling_at,
          o.support_note,
          o.support_resolved_at,
          assignee.username AS support_assignee_name
       FROM orders o
       LEFT JOIN users assignee
         ON assignee.id = o.support_assignee_id
       WHERE o.id = ?
       LIMIT 1`,
      [orderId]
    )

    if (!orderRow) {
      return res.status(404).json({ message: '订单不存在' })
    }

    if (Number(orderRow.support_assignee_id || 0) !== Number(req.auth.userId)) {
      return res.status(403).json({ message: '无权查看该订单客服时间线' })
    }
    const supportStatus = normalizeSupportStatus(orderRow.support_status)
    if (supportStatus === 'none') {
      return res.status(400).json({ message: '当前订单暂无客服处理记录' })
    }

    let list = await getSupportOrderTimeline(orderId)
    if (!list.length) {
      list = buildLegacySupportTimeline(orderRow)
    }
    res.json({ orderId, list })
  } catch (_error) {
    res.status(500).json({ message: '加载处理记录时间线失败' })
  }
})

app.put('/api/support/orders/:id/note', authRequired, supportOnly, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)
  const note = sanitizeSupportNote(req.body?.note)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '订单ID无效' })
  }

  try {
    const [[order]] = await pool.execute(
      `SELECT id, listing_id, status, support_status, support_assignee_id
       FROM orders
       WHERE id = ?
       LIMIT 1`,
      [orderId]
    )

    if (!order) {
      return res.status(404).json({ message: '订单不存在' })
    }

    const supportStatus = normalizeSupportStatus(order.support_status)
    const canEditSupportRecord = ['handling', 'resolved'].includes(supportStatus)
    if (!canEditSupportRecord || supportStatus === 'none') {
      return res.status(400).json({ message: '当前订单还没有客服介入记录' })
    }

    if (supportStatus === 'pending') {
      return res.status(400).json({ message: '请先领取工单，再填写内部备注' })
    }

    const assigneeId = Number(order.support_assignee_id || 0)
    if (!assigneeId) {
      return res.status(400).json({ message: '当前工单尚未分配客服，请先领取工单' })
    }
    if (assigneeId !== Number(req.auth.userId)) {
      return res.status(403).json({ message: '该工单已由其他客服领取，当前不可修改备注' })
    }

    await pool.execute(
      `UPDATE orders
       SET support_note = ?
       WHERE id = ?`,
      [note || null, orderId]
    )

    const conversationOrder = await getOrderConversationAccess(orderId, req.auth.userId, req.auth.role)
    await emitSupportEvent({
      orderId,
      actorUserId: req.auth.userId,
      actorRole: 'support',
      actorName: req.auth.username,
      eventType: 'note_updated',
      note,
      conversationOrder
    })

    const [updated] = await pool.execute(
      `SELECT * FROM orders WHERE id = ? LIMIT 1`,
      [orderId]
    )
    res.json(normalizeOrderMoneyFields(updated[0], { includeSensitiveContacts: true }))
  } catch (_error) {
    res.status(500).json({ message: '保存内部备注失败' })
  }
})

app.put('/api/support/orders/:id/cancel', authRequired, supportOnly, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)
  const note = sanitizeSupportNote(req.body?.note)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '订单ID无效' })
  }

  try {
    const order = await orderLifecycleService.cancelOrderBySupport({
      orderId,
      supportUserId: req.auth.userId,
      note
    })
    res.json(normalizeOrderMoneyFields(order, { includeSensitiveContacts: true }))
  } catch (error) {
    const status = Number(error?.status || 0)
    if (status >= 400 && status < 600) {
      return res.status(status).json(error.body || { message: error.message || '客服取消订单失败' })
    }
    res.status(500).json({ message: '客服取消订单失败' })
  }
})

app.put('/api/support/orders/:id/continue', authRequired, supportOnly, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)
  const note = sanitizeSupportNote(req.body?.note)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '订单ID无效' })
  }

  try {
    const order = await orderLifecycleService.continueOrderBySupport({
      orderId,
      supportUserId: req.auth.userId,
      note
    })
    res.json(normalizeOrderMoneyFields(order, { includeSensitiveContacts: true }))
  } catch (error) {
    const status = Number(error?.status || 0)
    if (status >= 400 && status < 600) {
      return res.status(status).json(error.body || { message: error.message || '继续履约失败' })
    }
    res.status(500).json({ message: '继续履约失败' })
  }
})

app.put('/api/support/orders/:id/return-to-settlement', authRequired, supportOnly, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)
  const note = sanitizeSupportNote(req.body?.note)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '订单ID无效' })
  }

  try {
    const order = await orderLifecycleService.returnToSettlementBySupport({
      orderId,
      supportUserId: req.auth.userId,
      note
    })
    res.json(normalizeOrderMoneyFields(order, { includeSensitiveContacts: true }))
  } catch (error) {
    const status = Number(error?.status || 0)
    if (status >= 400 && status < 600) {
      return res.status(status).json(error.body || { message: error.message || '返回结算中失败' })
    }
    res.status(500).json({ message: '返回结算中失败' })
  }
})

app.put('/api/support/orders/:id/freeze-funds', authRequired, supportOnly, requireStepUpAuth(ADMIN_STEP_UP_POLICIES.supportFreezeFunds), orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)
  const freezeReason = sanitizeSupportNote(req.body?.freezeReason)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '订单ID无效' })
  }

  try {
    const order = await orderLifecycleService.freezeFundsBySupport({
      orderId,
      supportUserId: req.auth.userId,
      freezeReason
    })
    res.json(normalizeOrderMoneyFields(order, { includeSensitiveContacts: true }))
  } catch (error) {
    const status = Number(error?.status || 0)
    if (status >= 400 && status < 600) {
      return res.status(status).json(error.body || { message: error.message || '冻结资金失败' })
    }
    res.status(500).json({ message: '冻结资金失败' })
  }
})

app.put('/api/support/orders/:id/release-funds', authRequired, supportOnly, requireStepUpAuth(ADMIN_STEP_UP_POLICIES.supportReleaseFunds), orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)
  const note = sanitizeSupportNote(req.body?.note)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '订单ID无效' })
  }

  try {
    const order = await orderLifecycleService.releaseFrozenFundsBySupport({
      orderId,
      supportUserId: req.auth.userId,
      note
    })
    res.json(normalizeOrderMoneyFields(order, { includeSensitiveContacts: true }))
  } catch (error) {
    const status = Number(error?.status || 0)
    if (status >= 400 && status < 600) {
      return res.status(status).json(error.body || { message: error.message || '解除冻结失败' })
    }
    res.status(500).json({ message: '解除冻结失败' })
  }
})
}
