/**
 * 问题反馈相关 HTTP 路由，处理用户提交与管理员处理。
 */

import {
  getFeedbackDailyLimitPerUser,
  loadBusinessSettings
} from '../modules/business-settings/runtime.js'

const FEEDBACK_CATEGORY_MAP = Object.freeze({
  account_login: '账号登录问题',
  listing_issue: '商品信息问题',
  order_payment: '订单/支付问题',
  chat_report: '聊天/违规举报',
  feature_suggestion: '功能建议',
  other: '其他问题'
})

const FEEDBACK_STATUS_VALUES = ['pending', 'processing', 'resolved', 'rejected']

function sanitizeKeyword(value) {
  return String(value || '').trim().slice(0, 50)
}

function sanitizeCategoryCode(value) {
  const normalized = String(value || '').trim()
  return Object.prototype.hasOwnProperty.call(FEEDBACK_CATEGORY_MAP, normalized) ? normalized : ''
}

function getCategoryLabel(code) {
  return FEEDBACK_CATEGORY_MAP[sanitizeCategoryCode(code)] || ''
}

function sanitizeDescription(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 1000)
}

function sanitizeAdminNote(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 500)
}

function sanitizeStatus(value, fallback = 'pending') {
  const normalized = String(value || '').trim()
  return FEEDBACK_STATUS_VALUES.includes(normalized) ? normalized : fallback
}

async function recordAdminOperationSafely(pool, payload = {}) {
  try {
    await pool.execute(
      `INSERT INTO admin_operation_logs (
        operator_user_id,
        operator_name,
        module,
        action,
        target_type,
        target_id,
        target_label,
        before_snapshot,
        after_snapshot,
        remark
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(payload.operatorUserId || 0) || null,
        String(payload.operatorName || '').trim() || '管理员',
        String(payload.module || '').trim(),
        String(payload.action || '').trim(),
        String(payload.targetType || '').trim(),
        Number(payload.targetId || 0) || null,
        String(payload.targetLabel || '').trim().slice(0, 255),
        payload.beforeSnapshot === undefined ? null : JSON.stringify(payload.beforeSnapshot),
        payload.afterSnapshot === undefined ? null : JSON.stringify(payload.afterSnapshot),
        sanitizeAdminNote(payload.remark)
      ]
    )
  } catch (error) {
    console.error('[feedback] record admin operation failed', error)
  }
}

export function registerFeedbackRoutes(deps) {
  const {
    app,
    pool,
    authRequired,
    adminOnly,
    authenticatedReadLimiter,
    authenticatedWriteLimiter
  } = deps

  app.get('/api/feedback/categories', authRequired, authenticatedReadLimiter, (req, res) => {
    if (String(req.auth?.role || '').trim() === 'admin') {
      return res.status(403).json({ message: '管理员请在后台查看反馈，不支持在前台提交问题反馈' })
    }
    res.json({
      list: Object.entries(FEEDBACK_CATEGORY_MAP).map(([value, label]) => ({ value, label }))
    })
  })

  app.get('/api/feedback/my', authRequired, authenticatedReadLimiter, async (req, res) => {
    if (String(req.auth?.role || '').trim() === 'admin') {
      return res.status(403).json({ message: '管理员请在后台查看反馈，不支持在前台提交问题反馈' })
    }

    const page = Math.max(1, Number(req.query?.page || 1) || 1)
    const pageSize = Math.min(20, Math.max(1, Number(req.query?.pageSize || 10) || 10))
    const offset = (page - 1) * pageSize

    try {
      const [[countRow]] = await pool.execute(
        `SELECT COUNT(*) AS total
         FROM user_feedback
         WHERE user_id = ?`,
        [req.auth.userId]
      )
      const [rows] = await pool.query(
        `SELECT
           id,
           category_code,
           category_label,
           description,
           status,
           admin_note,
           handled_at,
           created_at,
           updated_at
         FROM user_feedback
         WHERE user_id = ?
         ORDER BY id DESC
         LIMIT ${pageSize} OFFSET ${offset}`,
        [req.auth.userId]
      )

      res.json({
        total: Number(countRow?.total || 0),
        page,
        pageSize,
        list: rows
      })
    } catch (error) {
      console.error('[feedback] list my feedback failed', error)
      res.status(500).json({ message: '获取反馈记录失败' })
    }
  })

  app.post('/api/feedback', authRequired, authenticatedWriteLimiter, async (req, res) => {
    if (String(req.auth?.role || '').trim() === 'admin') {
      return res.status(403).json({ message: '管理员请在后台查看反馈，不支持在前台提交问题反馈' })
    }

    const categoryCode = sanitizeCategoryCode(req.body?.category)
    const categoryLabel = getCategoryLabel(categoryCode)
    const description = sanitizeDescription(req.body?.description)

    if (!categoryCode || !categoryLabel) {
      return res.status(400).json({ message: '请选择有效的问题类别' })
    }
    if (!description || description.length < 5) {
      return res.status(400).json({ message: '问题描述至少填写 5 个字' })
    }

    try {
      const businessSettings = await loadBusinessSettings(pool)
      const feedbackDailyLimitPerUser = getFeedbackDailyLimitPerUser(businessSettings)

      const [existingRows] = await pool.execute(
        `SELECT COUNT(*) AS total
         FROM user_feedback
         WHERE user_id = ?
           AND created_at >= CURDATE()
           AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
         LIMIT 1`,
        [req.auth.userId]
      )
      const submittedCountToday = Number(existingRows[0]?.total || 0)
      if (submittedCountToday >= feedbackDailyLimitPerUser) {
        return res.status(429).json({ message: `同一账号每天只能提交 ${feedbackDailyLimitPerUser} 次问题反馈，请明天再试` })
      }

      const [result] = await pool.execute(
        `INSERT INTO user_feedback (
          user_id,
          category_code,
          category_label,
          description
        ) VALUES (?, ?, ?, ?)`,
        [req.auth.userId, categoryCode, categoryLabel, description]
      )

      const [rows] = await pool.execute(
        `SELECT
           id,
           category_code,
           category_label,
           description,
           status,
           admin_note,
           handled_at,
           created_at,
           updated_at
         FROM user_feedback
         WHERE id = ?
         LIMIT 1`,
        [result.insertId]
      )

      res.status(201).json({
        message: '反馈已提交，我们会尽快处理',
        feedback: rows[0] || null
      })
    } catch (error) {
      console.error('[feedback] submit feedback failed', error)
      res.status(500).json({ message: '提交反馈失败' })
    }
  })

  app.get('/api/admin/feedback', authRequired, adminOnly, authenticatedReadLimiter, async (req, res) => {
    const page = Math.max(1, Number(req.query?.page || 1) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query?.pageSize || 20) || 20))
    const offset = (page - 1) * pageSize
    const keyword = sanitizeKeyword(req.query?.keyword)
    const status = sanitizeStatus(req.query?.status, 'all')
    const categoryCode = sanitizeCategoryCode(req.query?.category)

    try {
      const whereParts = []
      const params = []

      if (status !== 'all') {
        whereParts.push('f.status = ?')
        params.push(status)
      }
      if (categoryCode) {
        whereParts.push('f.category_code = ?')
        params.push(categoryCode)
      }
      if (keyword) {
        whereParts.push(`(
          f.category_label LIKE ?
          OR f.description LIKE ?
          OR u.username LIKE ?
          OR u.phone LIKE ?
          OR f.admin_note LIKE ?
        )`)
        params.push(...Array(5).fill(`%${keyword}%`))
      }

      const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : ''

      const [[countRow]] = await pool.execute(
        `SELECT COUNT(*) AS total
         FROM user_feedback f
         JOIN users u ON u.id = f.user_id
         ${whereSql}`,
        params
      )

      const [summaryRows] = await pool.execute(
        `SELECT status, COUNT(*) AS total
         FROM user_feedback
         GROUP BY status`
      )

      const [rows] = await pool.query(
        `SELECT
           f.id,
           f.user_id,
           f.category_code,
           f.category_label,
           f.description,
           f.status,
           f.admin_note,
           f.handled_at,
           f.created_at,
           f.updated_at,
           u.username,
           u.phone,
           handler.username AS handled_by_name
         FROM user_feedback f
         JOIN users u ON u.id = f.user_id
         LEFT JOIN users handler ON handler.id = f.handled_by_user_id
         ${whereSql}
         ORDER BY
           CASE
             WHEN f.status = 'pending' THEN 0
             WHEN f.status = 'processing' THEN 1
             WHEN f.status = 'resolved' THEN 2
             ELSE 3
           END,
           f.id DESC
         LIMIT ${pageSize} OFFSET ${offset}`,
        params
      )

      const summary = {
        pending: 0,
        processing: 0,
        resolved: 0,
        rejected: 0
      }
      summaryRows.forEach((row) => {
        const key = sanitizeStatus(row.status, '')
        if (key) {
          summary[key] = Number(row.total || 0)
        }
      })

      res.json({
        total: Number(countRow?.total || 0),
        page,
        pageSize,
        keyword,
        status,
        category: categoryCode,
        summary,
        categories: Object.entries(FEEDBACK_CATEGORY_MAP).map(([value, label]) => ({ value, label })),
        list: rows
      })
    } catch (error) {
      console.error('[feedback] admin list failed', error)
      res.status(500).json({ message: '获取反馈列表失败' })
    }
  })

  app.put('/api/admin/feedback/:id', authRequired, adminOnly, authenticatedWriteLimiter, async (req, res) => {
    const feedbackId = Number(req.params?.id || 0)
    const nextStatus = sanitizeStatus(req.body?.status, '')
    const adminNote = sanitizeAdminNote(req.body?.adminNote)

    if (!feedbackId) {
      return res.status(400).json({ message: '反馈记录不存在' })
    }
    if (!['processing', 'resolved', 'rejected'].includes(nextStatus)) {
      return res.status(400).json({ message: '仅支持更新为处理中、已解决或已驳回' })
    }

    try {
      const [rows] = await pool.execute(
        `SELECT
           f.id,
           f.user_id,
           f.category_code,
           f.category_label,
           f.description,
           f.status,
           f.admin_note,
           f.handled_at,
           f.created_at,
           u.username,
           u.phone
         FROM user_feedback f
         JOIN users u ON u.id = f.user_id
         WHERE f.id = ?
         LIMIT 1`,
        [feedbackId]
      )
      const currentFeedback = rows[0] || null
      if (!currentFeedback) {
        return res.status(404).json({ message: '反馈记录不存在' })
      }

      await pool.execute(
        `UPDATE user_feedback
         SET status = ?,
             admin_note = ?,
             handled_by_user_id = ?,
             handled_at = NOW()
         WHERE id = ?`,
        [nextStatus, adminNote, req.auth.userId, feedbackId]
      )

      const [updatedRows] = await pool.execute(
        `SELECT
           f.id,
           f.user_id,
           f.category_code,
           f.category_label,
           f.description,
           f.status,
           f.admin_note,
           f.handled_at,
           f.created_at,
           f.updated_at,
           u.username,
           u.phone,
           handler.username AS handled_by_name
         FROM user_feedback f
         JOIN users u ON u.id = f.user_id
         LEFT JOIN users handler ON handler.id = f.handled_by_user_id
         WHERE f.id = ?
         LIMIT 1`,
        [feedbackId]
      )

      const updatedFeedback = updatedRows[0] || null

      await recordAdminOperationSafely(pool, {
        operatorUserId: req.auth.userId,
        operatorName: req.auth.username || '管理员',
        module: 'feedback',
        action: 'update_feedback_status',
        targetType: 'feedback',
        targetId: feedbackId,
        targetLabel: updatedFeedback?.category_label || `反馈 #${feedbackId}`,
        beforeSnapshot: currentFeedback,
        afterSnapshot: updatedFeedback,
        remark: adminNote || `状态更新为 ${nextStatus}`
      })

      res.json({
        message: '反馈处理状态已更新',
        feedback: updatedFeedback
      })
    } catch (error) {
      console.error('[feedback] admin update failed', error)
      res.status(500).json({ message: '更新反馈状态失败' })
    }
  })
}
