/**
 * 客服相关 HTTP 路由，处理工作台与工单操作。
 */

import { getDepositHoldSettings, loadBusinessSettings } from '../modules/business-settings/runtime.js'

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
    orderLifecycleService,
    paymentService
  } = deps
  const {
    normalizeSupportStatus,
    normalizePresaleSupportStatus,
    sanitizeSupportSearchKeyword,
    buildSupportTimeoutMeta,
    getSupportOrderTimeline,
    buildLegacySupportTimeline,
    buildPresaleConsultationNo,
    sanitizeSupportNote,
    getOrderConversationAccess,
    getPresaleConversationAccess,
    ensurePresaleConversation,
    getConversationForUser,
    createConversationMessage,
    emitConversationMessage,
    emitSupportEvent,
    emitSupportDeskUpdate
  } = chatModule

app.get('/api/support/orders', authRequired, supportOnly, authenticatedReadLimiter, async (req, res) => {
  const page = Math.max(1, Number(req.query?.page || 1) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(req.query?.pageSize || 20) || 20))
  const offset = (page - 1) * pageSize
  const status = normalizeSupportStatus(req.query?.status || 'handling')
  const keyword = sanitizeSupportSearchKeyword(req.query?.keyword)
  const assigneeScope = 'mine'
  const pendingTimeoutMinutes = 24 * 60
  // 冻结资金超时告警阈值（小时）：冻结单长期未裁决，买卖双方资金悬置
  const frozenTimeoutHours = Math.max(1, Number(process.env.FROZEN_FUNDS_TIMEOUT_HOURS || 48) || 48)
  // 押金举报超时告警阈值（小时）：来自业务参数配置（冷静期 disputeTimeoutHours）
  const depositDisputeTimeoutHours = getDepositHoldSettings(await loadBusinessSettings(pool)).disputeTimeoutHours

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
          SUM(
            CASE
              WHEN status = 'support_handling'
               AND support_scene = 'fund_frozen'
               AND TIMESTAMPDIFF(HOUR, support_requested_at, NOW()) >= ?
              THEN 1 ELSE 0
            END
          ) AS frozen_timeout_total,
          SUM(
            CASE
              WHEN status = 'support_handling'
               AND support_scene = 'deposit_dispute'
               AND TIMESTAMPDIFF(HOUR, support_requested_at, NOW()) >= ?
               THEN 1 ELSE 0
            END
          ) AS deposit_dispute_timeout_total,
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
        frozenTimeoutHours,
        depositDisputeTimeoutHours,
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
          o.deposit_amount,
          o.buyer_id,
          o.seller_id,
          o.seller_name,
          o.support_scene,
          o.support_origin_status,
          o.support_freeze_reason,
          o.buyer_contact_wechat,
          o.seller_contact_wechat,
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
        pending_timeout_minutes: pendingTimeoutMinutes,
        frozen_timeout_total: Number(statsRow?.frozen_timeout_total || 0),
        frozen_timeout_hours: frozenTimeoutHours,
        deposit_dispute_timeout_total: Number(statsRow?.deposit_dispute_timeout_total || 0),
        deposit_dispute_timeout_hours: depositDisputeTimeoutHours
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
        const sceneReasonMap = {
          cancel_request: '取消订单申请',
          cancel_refund_processing: '取消退款处理中',
          settlement_funds_processing: '结算打款处理中',
          frozen_funds_processing: '冻结资金处理中',
          settlement_dispute: '结算争议处理',
          deposit_dispute: '押金违规举报待裁决',
          deposit_funds_processing: '押金裁决资金处理中',
          fund_frozen: '资金冻结处理中'
        }
        const issueReason = sceneReasonMap[String(row.support_scene || '')] || '订单监督中'
        const issueNote = row.support_scene === 'cancel_request'
          ? (row.cancel_reason || row.support_note || '')
          : row.support_scene === 'cancel_refund_processing'
            ? (row.support_note || '正在等待支付通道确认原路退款结果')
            : row.support_scene === 'settlement_funds_processing'
              ? (row.support_note || '正在等待支付通道确认退款/打款结果')
              : row.support_scene === 'frozen_funds_processing'
                ? (row.support_note || '正在等待支付通道确认冻结资金处理结果')
                : row.support_scene === 'deposit_dispute'
                  ? (row.support_note || '卖家已举报买家违规，请核实证据后作出押金裁决')
                  : row.support_scene === 'deposit_funds_processing'
                    ? (row.support_note || '正在等待支付通道确认押金退款/赔付结果')
                    : row.support_scene === 'fund_frozen'
                      ? (row.support_freeze_reason || row.support_note || '')
                      : (row.support_note || '')
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
          deposit_amount: normalizeOrderMoneyFields({ amount: 0, deposit_amount: row.deposit_amount || 0, status: 'paid' }).deposit_amount,
          buyer_id: Number(row.buyer_id || 0),
          seller_id: Number(row.seller_id || 0),
          buyer_name: row.buyer_phone || buyerDisplayName,
          buyer_username: buyerDisplayName,
          buyer_phone: row.buyer_phone || '',
          buyer_contact_wechat: row.buyer_contact_wechat || '',
          seller_name: row.seller_phone || sellerDisplayName,
          seller_username: sellerDisplayName,
          seller_phone: row.seller_phone || '',
          seller_contact_wechat: row.seller_contact_wechat || '',
          issue_reason: issueReason,
          issue_note: issueNote,
          issue_at: supportRequestedAt,
          created_at: row.created_at,
          support_status: supportStatus,
          support_requested_at: supportRequestedAt,
          support_requested_by: 0,
          support_requested_by_name: row.support_scene === 'fund_frozen'
            ? (row.support_assignee_phone || supportAssigneeDisplayName || '客服')
            : (row.support_scene === 'deposit_dispute'
                ? (row.seller_phone || sellerDisplayName || '卖家')
                : (row.buyer_phone || buyerDisplayName || '')),
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

app.get('/api/support/presale-consultations', authRequired, supportOnly, authenticatedReadLimiter, async (req, res) => {
  const page = Math.max(1, Number(req.query?.page || 1) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(req.query?.pageSize || 20) || 20))
  const offset = (page - 1) * pageSize
  const status = normalizePresaleSupportStatus(req.query?.status || 'handling')
  const keyword = sanitizeSupportSearchKeyword(req.query?.keyword)

  try {
    const keywordWhereSql = keyword
      ? `AND (
          consultation_user.username LIKE ?
          OR support_user.username LIKE ?
          OR CAST(pc.id AS CHAR) LIKE ?
        )`
      : ''
    const keywordParams = keyword
      ? [
          `%${keyword}%`,
          `%${keyword}%`,
          `%${keyword}%`
        ]
      : []

    const [countRows] = await pool.execute(
      `SELECT
          pc.support_status AS support_bucket,
          COUNT(*) AS total
       FROM presale_consultations pc
       JOIN users consultation_user
         ON consultation_user.id = pc.user_id
       LEFT JOIN users support_user
         ON support_user.id = pc.support_assignee_id
       WHERE pc.support_assignee_id = ?
         ${keywordWhereSql}
       GROUP BY pc.support_status`,
      [req.auth.userId, ...keywordParams]
    )

    const counts = {
      handling: 0,
      resolved: 0
    }
    countRows.forEach((row) => {
      const key = normalizePresaleSupportStatus(row.support_bucket)
      counts[key] = Number(row.total || 0)
    })

    const [[countRow]] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM presale_consultations pc
       JOIN users consultation_user
         ON consultation_user.id = pc.user_id
       LEFT JOIN users support_user
         ON support_user.id = pc.support_assignee_id
       WHERE pc.support_assignee_id = ?
         AND pc.support_status = ?
         ${keywordWhereSql}`,
      [req.auth.userId, status, ...keywordParams]
    )

    const [[statsRow]] = await pool.execute(
      `SELECT
          SUM(CASE WHEN support_status = 'handling' AND support_assignee_id = ? THEN 1 ELSE 0 END) AS my_handling_count,
          SUM(CASE WHEN support_status = 'resolved' AND support_assignee_id = ? THEN 1 ELSE 0 END) AS my_resolved_total,
          SUM(
            CASE
              WHEN support_status = 'resolved'
               AND support_assignee_id = ?
               AND DATE(resolved_at) = CURDATE()
              THEN 1 ELSE 0
            END
          ) AS my_resolved_today
       FROM presale_consultations
       WHERE support_assignee_id = ?`,
      [
        req.auth.userId,
        req.auth.userId,
        req.auth.userId,
        req.auth.userId
      ]
    )

    const [rows] = await pool.query(
      `SELECT
          pc.id,
          pc.user_id,
          pc.support_assignee_id,
          pc.support_status,
          pc.support_note,
          pc.created_at,
          pc.updated_at,
          pc.resolved_at,
          consultation_user.username AS consultation_user_name,
          support_user.username AS support_assignee_name,
          COALESCE(chat_cp.unread_message_count, 0) AS conversation_unread_count,
          c.last_message_at
       FROM presale_consultations pc
       JOIN users consultation_user
         ON consultation_user.id = pc.user_id
       LEFT JOIN users support_user
         ON support_user.id = pc.support_assignee_id
       LEFT JOIN conversations c
         ON c.type = 'presale'
        AND c.ref_id = pc.id
       LEFT JOIN conversation_participants chat_cp
         ON chat_cp.conversation_id = c.id
        AND chat_cp.user_id = ?
       WHERE pc.support_assignee_id = ?
         AND pc.support_status = ?
         ${keywordWhereSql}
       ORDER BY COALESCE(c.last_message_at, pc.updated_at, pc.created_at) DESC, pc.id DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      [req.auth.userId, req.auth.userId, status, ...keywordParams]
    )

    res.json({
      total: Number(countRow?.total || 0),
      page,
      pageSize,
      status,
      counts,
      alerts: {
        pending_timeout_total: 0,
        pending_timeout_minutes: 0
      },
      workload: {
        my_handling_count: Number(statsRow?.my_handling_count || 0),
        my_resolved_total: Number(statsRow?.my_resolved_total || 0),
        my_resolved_today: Number(statsRow?.my_resolved_today || 0)
      },
      keyword,
      list: rows.map((row) => ({
        id: Number(row.id || 0),
        consultation_no: buildPresaleConsultationNo(row.id, row.created_at),
        user_id: Number(row.user_id || 0),
        user_name: row.consultation_user_name || `用户 #${Number(row.user_id || 0)}`,
        support_status: normalizePresaleSupportStatus(row.support_status),
        support_note: row.support_note || '',
        support_assignee_id: Number(row.support_assignee_id || 0),
        support_assignee_name: row.support_assignee_name || '客服',
        conversation_unread_count: Number(row.conversation_unread_count || 0),
        created_at: row.created_at,
        updated_at: row.updated_at,
        resolved_at: row.resolved_at,
        last_message_at: row.last_message_at || row.updated_at || row.created_at
      }))
    })
  } catch (_error) {
    res.status(500).json({ message: '加载售前咨询失败' })
  }
})

app.put('/api/support/presale-consultations/:id/note', authRequired, supportOnly, orderWriteLimiter, async (req, res) => {
  const consultationId = Number(req.params?.id)
  const note = sanitizeSupportNote(req.body?.note)

  if (!consultationId || !Number.isFinite(consultationId) || consultationId < 1) {
    return res.status(400).json({ message: '售前咨询ID无效' })
  }

  try {
    const [rows] = await pool.execute(
      `SELECT id, user_id, support_assignee_id, support_status, created_at, updated_at, resolved_at
       FROM presale_consultations
       WHERE id = ?
       LIMIT 1`,
      [consultationId]
    )
    const consultation = rows[0]
    if (!consultation) {
      return res.status(404).json({ message: '售前咨询不存在' })
    }
    if (Number(consultation.support_assignee_id || 0) !== Number(req.auth.userId)) {
      return res.status(403).json({ message: '只有当前负责客服可以修改售前备注' })
    }

    await pool.execute(
      `UPDATE presale_consultations
       SET support_note = ?
       WHERE id = ?`,
      [note || null, consultationId]
    )

    const [updatedRows] = await pool.execute(
      `SELECT
          pc.id,
          pc.user_id,
          pc.support_assignee_id,
          pc.support_status,
          pc.support_note,
          pc.created_at,
          pc.updated_at,
          pc.resolved_at,
          consultation_user.username AS consultation_user_name,
          support_user.username AS support_assignee_name
       FROM presale_consultations pc
       JOIN users consultation_user
         ON consultation_user.id = pc.user_id
       LEFT JOIN users support_user
         ON support_user.id = pc.support_assignee_id
       WHERE pc.id = ?
       LIMIT 1`,
      [consultationId]
    )

    const updated = updatedRows[0]
    emitSupportDeskUpdate({
      supportUserId: Number(updated?.support_assignee_id || 0),
      desk: 'presale',
      resourceId: consultationId,
      reason: 'resolved'
    })
    res.json({
      id: Number(updated?.id || 0),
      consultation_no: buildPresaleConsultationNo(updated?.id, updated?.created_at),
      user_id: Number(updated?.user_id || 0),
      user_name: updated?.consultation_user_name || '',
      support_status: normalizePresaleSupportStatus(updated?.support_status),
      support_note: updated?.support_note || '',
      support_assignee_id: Number(updated?.support_assignee_id || 0),
      support_assignee_name: updated?.support_assignee_name || '客服',
      created_at: updated?.created_at || null,
      updated_at: updated?.updated_at || null,
      resolved_at: updated?.resolved_at || null
    })
  } catch (_error) {
    res.status(500).json({ message: '保存售前备注失败' })
  }
})

app.put('/api/support/presale-consultations/:id/resolve', authRequired, supportOnly, orderWriteLimiter, async (req, res) => {
  const consultationId = Number(req.params?.id)
  const note = sanitizeSupportNote(req.body?.note)

  if (!consultationId || !Number.isFinite(consultationId) || consultationId < 1) {
    return res.status(400).json({ message: '售前咨询ID无效' })
  }

  try {
    const [rows] = await pool.execute(
      `SELECT id, support_assignee_id, support_status
       FROM presale_consultations
       WHERE id = ?
       LIMIT 1`,
      [consultationId]
    )
    const consultation = rows[0]
    if (!consultation) {
      return res.status(404).json({ message: '售前咨询不存在' })
    }
    if (Number(consultation.support_assignee_id || 0) !== Number(req.auth.userId)) {
      return res.status(403).json({ message: '只有当前负责客服可以完成售前咨询' })
    }
    if (normalizePresaleSupportStatus(consultation.support_status) === 'resolved') {
      return res.status(400).json({ message: '当前售前咨询已完成' })
    }

    await pool.execute(
      `UPDATE presale_consultations
       SET support_status = 'resolved',
           support_note = ?,
           resolved_at = NOW()
       WHERE id = ?`,
      [note || null, consultationId]
    )

    const accessibleConsultation = await getPresaleConversationAccess(consultationId, req.auth.userId, 'support')
    if (accessibleConsultation) {
      const conversationId = await ensurePresaleConversation(accessibleConsultation)
      const conversation = await getConversationForUser(conversationId, req.auth.userId)
      if (conversation) {
        const systemMessage = await createConversationMessage({
          conversationId,
          senderUserId: req.auth.userId,
          messageType: 'system',
          content: `售前咨询已处理完成。${note ? `说明：${note}` : '如有其他问题，可重新发起咨询。'}`
        })
        await emitConversationMessage(conversation, systemMessage, req.auth.userId)
      }
    }

    const [updatedRows] = await pool.execute(
      `SELECT
          pc.id,
          pc.user_id,
          pc.support_assignee_id,
          pc.support_status,
          pc.support_note,
          pc.created_at,
          pc.updated_at,
          pc.resolved_at,
          consultation_user.username AS consultation_user_name,
          support_user.username AS support_assignee_name
       FROM presale_consultations pc
       JOIN users consultation_user
         ON consultation_user.id = pc.user_id
       LEFT JOIN users support_user
         ON support_user.id = pc.support_assignee_id
       WHERE pc.id = ?
       LIMIT 1`,
      [consultationId]
    )

    const updated = updatedRows[0]
    res.json({
      id: Number(updated?.id || 0),
      consultation_no: buildPresaleConsultationNo(updated?.id, updated?.created_at),
      user_id: Number(updated?.user_id || 0),
      user_name: updated?.consultation_user_name || '',
      support_status: normalizePresaleSupportStatus(updated?.support_status),
      support_note: updated?.support_note || '',
      support_assignee_id: Number(updated?.support_assignee_id || 0),
      support_assignee_name: updated?.support_assignee_name || '客服',
      created_at: updated?.created_at || null,
      updated_at: updated?.updated_at || null,
      resolved_at: updated?.resolved_at || null
    })
  } catch (_error) {
    res.status(500).json({ message: '完成售前咨询失败' })
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

app.put('/api/support/orders/:id/cancel', authRequired, supportOnly, requireStepUpAuth(ADMIN_STEP_UP_POLICIES.supportCancelOrder), orderWriteLimiter, async (req, res) => {
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

app.post('/api/support/orders/:id/reconcile-funds', authRequired, supportOnly, requireStepUpAuth(ADMIN_STEP_UP_POLICIES.supportReconcileFunds), orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '订单ID无效' })
  }

  try {
    const result = await paymentService.reconcileOrderFunds({
      orderId,
      supportUserId: req.auth.userId
    })
    res.json({
      finalized: Boolean(result?.finalized),
      order: normalizeOrderMoneyFields(result?.order, { includeSensitiveContacts: true }),
      refund: result?.refund || null,
      payout: result?.payout || null
    })
  } catch (error) {
    console.error('[reconcile-funds] error:', { orderId, errorMessage: error?.body?.message || error?.message || String(error), stack: error?.stack })
    const status = Number(error?.status || 0)
    if (status >= 400 && status < 600) {
      return res.status(status).json(error.body || { message: error.message || '同步资金状态失败' })
    }
    res.status(500).json({ message: '同步资金状态失败' })
  }
})
}
