/**
 * 客服工作台「商品审核」HTTP 路由。
 *
 * 商品审核作为一种工单：发布/编辑后按最闲客服自动派单（listing-review.service.js），
 * 客服在此处理分配给自己的审核单。与订单售后、售前咨询工单走一致的分配/展示模式。
 *
 * 审核动作（通过/驳回）与管理员后台写同一张 listings 字段、同一张 admin_operation_logs 审计表，
 * 通过 `WHERE review_status = 'pending'` 原子更新实现「先操作者生效」，杜绝并发双审。
 */

import {
  createOperationLogService,
  sanitizeRemark,
  getListingSummaryById
} from '../modules/audit/operation-log.service.js'

const REVIEW_STATUS_OPTIONS = ['all', 'pending', 'approved', 'rejected']
const REVIEW_STATUS_LABELS = Object.freeze({
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回'
})

function sanitizeKeyword(value) {
  return String(value || '').trim().slice(0, 50)
}

function sanitizeReviewStatus(value) {
  const next = String(value || '').trim().toLowerCase()
  return REVIEW_STATUS_OPTIONS.includes(next) ? next : 'pending'
}

function buildListingTitle(row) {
  return String(row?.title || '').trim() || `商品 #${Number(row?.id || 0)}`
}

export function registerSupportListingReviewRoutes(deps) {
  const {
    app,
    pool,
    authRequired,
    supportOnly,
    authenticatedReadLimiter,
    orderWriteLimiter,
    buildListingDetailPayload,
    fetchListingBanImages,
    getListingImagesOrderSql,
    invalidateListingDetailCache,
    createUserNotificationSafely
  } = deps

  const { recordOperationSafely } = createOperationLogService({ pool })

  // ==================== 我的审核工单列表 ====================
  app.get('/api/support/listing-reviews', authRequired, supportOnly, authenticatedReadLimiter, async (req, res) => {
    const page = Math.max(1, Number(req.query?.page || 1) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query?.pageSize || 20) || 20))
    const offset = (page - 1) * pageSize
    const status = sanitizeReviewStatus(req.query?.status)
    const keyword = sanitizeKeyword(req.query?.keyword)

    try {
      const whereParts = ['l.review_assignee_id = ?']
      const params = [req.auth.userId]

      if (status !== 'all') {
        whereParts.push('l.review_status = ?')
        params.push(status)
      }
      if (keyword) {
        whereParts.push(`(
          l.owner_name LIKE ?
          OR owner.phone LIKE ?
          OR owner.username LIKE ?
          OR l.listing_no LIKE ?
          OR l.rank_name LIKE ?
          OR l.login_method LIKE ?
        )`)
        params.push(...Array(6).fill(`%${keyword}%`))
      }
      const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : ''

      const [[countRow]] = await pool.execute(
        `SELECT COUNT(*) AS total
         FROM listings l
         LEFT JOIN users owner ON owner.id = l.owner_user_id
         ${whereSql}`,
        params
      )

      const [[statsRow]] = await pool.execute(
        `SELECT
            SUM(CASE WHEN review_status = 'pending' THEN 1 ELSE 0 END) AS my_pending_count,
            SUM(CASE WHEN review_status = 'approved' THEN 1 ELSE 0 END) AS my_approved_total,
            SUM(CASE WHEN review_status = 'rejected' THEN 1 ELSE 0 END) AS my_rejected_total,
            SUM(
              CASE
                WHEN review_status IN ('approved', 'rejected')
                 AND DATE(reviewed_at) = CURDATE()
                THEN 1 ELSE 0
              END
            ) AS my_resolved_today
         FROM listings
         WHERE review_assignee_id = ?`,
        [req.auth.userId]
      )

      const [rows] = await pool.query(
        `SELECT
           l.id,
           l.listing_no,
           COALESCE(NULLIF(owner.phone, ''), NULLIF(owner.username, ''), l.owner_name) AS owner_name,
           owner.phone AS owner_phone,
           l.listing_status,
           l.review_status,
           l.review_reason,
           l.reviewed_at,
           l.review_assigned_at,
           l.rent_price,
           l.published_at,
           TRIM(
             CONCAT(
               IFNULL(NULLIF(l.rank_name, ''), '未命名商品'),
               ' / ',
               IFNULL(NULLIF(l.login_method, ''), '未知方式')
             )
           ) AS title
         FROM listings l
         LEFT JOIN users owner ON owner.id = l.owner_user_id
         ${whereSql}
         ORDER BY
           CASE
             WHEN l.review_status = 'pending' THEN 0
             WHEN l.review_status = 'rejected' THEN 1
             ELSE 2
           END ASC,
           l.id DESC
         LIMIT ${pageSize} OFFSET ${offset}`,
        params
      )

      res.json({
        total: Number(countRow?.total || 0),
        page,
        pageSize,
        status,
        keyword,
        assigneeScope: 'mine',
        workload: {
          my_pending_count: Number(statsRow?.my_pending_count || 0),
          my_approved_total: Number(statsRow?.my_approved_total || 0),
          my_rejected_total: Number(statsRow?.my_rejected_total || 0),
          my_resolved_today: Number(statsRow?.my_resolved_today || 0)
        },
        list: rows.map((row) => ({
          id: Number(row.id),
          listing_no: row.listing_no || '',
          owner_name: row.owner_name || '',
          owner_phone: row.owner_phone || '',
          listing_status: row.listing_status || 'pending_review',
          review_status: row.review_status || 'pending',
          review_status_label: REVIEW_STATUS_LABELS[String(row.review_status || '').trim()] || '未知状态',
          review_reason: row.review_reason || '',
          reviewed_at: row.reviewed_at || null,
          review_assigned_at: row.review_assigned_at || null,
          rent_price: Number(row.rent_price || 0),
          published_at: row.published_at,
          title: buildListingTitle(row)
        }))
      })
    } catch (error) {
      console.error('[support] listing reviews list failed', error)
      res.status(500).json({ message: '加载审核工单失败' })
    }
  })

  // ==================== 审核工单详情 ====================
  app.get('/api/support/listing-reviews/:id', authRequired, supportOnly, authenticatedReadLimiter, async (req, res) => {
    const listingId = Math.max(0, Number(req.params?.id || 0) || 0)
    if (!listingId) {
      return res.status(400).json({ message: '无效的商品ID' })
    }

    try {
      const [rows] = await pool.execute(
        `SELECT
           l.id, l.listing_no, l.owner_user_id, l.owner_name, owner.phone AS owner_phone,
           l.review_assignee_id,
           l.insurance_level, l.weight_level, l.deposit, l.base_ratio, l.login_method,
           l.energy_level, l.hafu_coin, l.rent_price, l.rent_days, l.login_time_range, l.daily_cost,
           l.secret_kd, l.character_level, l.operator_appearance, l.gold_skin, l.rank_name,
           l.knife_skin, l.weapon_skin, l.region, l.face_verified, l.dive_level, l.decontamination_chamber_level,
           l.listing_status, l.review_status, l.review_reason, l.reviewed_by, l.reviewed_at,
           reviewer.username AS reviewer_name,
           l.remark, l.ban_record, l.ban_video_url, l.published_at, l.created_at
         FROM listings l
         LEFT JOIN users owner ON owner.id = l.owner_user_id
         LEFT JOIN users reviewer ON reviewer.id = l.reviewed_by
         WHERE l.id = ?
         LIMIT 1`,
        [listingId]
      )

      if (!rows.length) {
        return res.status(404).json({ message: '商品不存在' })
      }
      if (Number(rows[0].review_assignee_id || 0) !== Number(req.auth.userId)) {
        return res.status(403).json({ message: '该审核单未分配给你' })
      }

      const [items] = await pool.execute(
        `SELECT item_key, item_name, item_mode, quantity, unit_price, total_price
         FROM listing_items
         WHERE listing_id = ?
         ORDER BY id ASC`,
        [listingId]
      )
      const [images] = await pool.execute(
        `SELECT image_url
         FROM listing_images
         WHERE listing_id = ?
         ORDER BY ${getListingImagesOrderSql()}`,
        [listingId]
      )
      const banImages = await fetchListingBanImages(pool, listingId)
      res.json(buildListingDetailPayload(rows[0], items, images, banImages, { includeBanMedia: true }))
    } catch (error) {
      console.error('[support] listing review detail failed', error)
      res.status(500).json({ message: '获取审核详情失败' })
    }
  })

  // ==================== 审核通过 ====================
  app.put('/api/support/listing-reviews/:id/approve', authRequired, supportOnly, orderWriteLimiter, async (req, res) => {
    const listingId = Math.max(0, Number(req.params?.id || 0) || 0)
    const remark = sanitizeRemark(req.body?.remark)
    if (!listingId) {
      return res.status(400).json({ message: '无效的商品ID' })
    }

    try {
      const currentListing = await getListingSummaryById(pool, listingId)
      if (!currentListing) {
        return res.status(404).json({ message: '商品不存在' })
      }
      if (Number(currentListing.review_assignee_id || 0) !== Number(req.auth.userId)) {
        return res.status(403).json({ message: '该审核单未分配给你' })
      }
      if (['sold_out', 'rented'].includes(String(currentListing.listing_status || ''))) {
        return res.status(400).json({ message: '当前商品状态不支持审核通过' })
      }
      if (currentListing.review_status !== 'pending') {
        return res.status(409).json({ message: '该商品已被处理，请刷新列表' })
      }

      const [result] = await pool.execute(
        `UPDATE listings
         SET listing_status = 'active',
             review_status = 'approved',
             reviewed_by = ?,
             reviewed_at = NOW(),
             review_reason = ?
         WHERE id = ?
           AND review_status = 'pending'`,
        [req.auth.userId, remark || null, listingId]
      )
      if (result.affectedRows === 0) {
        return res.status(409).json({ message: '该商品已被处理，请刷新列表' })
      }
      await invalidateListingDetailCache(listingId)

      const updatedListing = await getListingSummaryById(pool, listingId)
      res.json({ message: '商品审核已通过', listing: updatedListing })
      await recordOperationSafely({
        operatorUserId: req.auth?.userId,
        operatorName: req.auth?.username,
        module: 'review',
        action: 'approve_listing',
        targetType: 'listing',
        targetId: listingId,
        targetLabel: buildListingTitle(updatedListing) || buildListingTitle(currentListing),
        beforeSnapshot: currentListing,
        afterSnapshot: updatedListing,
        remark: remark || '审核通过'
      })
    } catch (error) {
      console.error('[support] approve listing failed', error)
      res.status(500).json({ message: '审核通过失败' })
    }
  })

  // ==================== 驳回商品 ====================
  app.put('/api/support/listing-reviews/:id/reject', authRequired, supportOnly, orderWriteLimiter, async (req, res) => {
    const listingId = Math.max(0, Number(req.params?.id || 0) || 0)
    const reason = sanitizeRemark(req.body?.reason)
    if (!listingId) {
      return res.status(400).json({ message: '无效的商品ID' })
    }
    if (!reason) {
      return res.status(400).json({ message: '请填写驳回原因' })
    }

    try {
      const currentListing = await getListingSummaryById(pool, listingId)
      if (!currentListing) {
        return res.status(404).json({ message: '商品不存在' })
      }
      if (Number(currentListing.review_assignee_id || 0) !== Number(req.auth.userId)) {
        return res.status(403).json({ message: '该审核单未分配给你' })
      }
      if (['sold_out', 'rented'].includes(String(currentListing.listing_status || ''))) {
        return res.status(400).json({ message: '当前商品状态不支持驳回' })
      }
      if (currentListing.review_status !== 'pending') {
        return res.status(409).json({ message: '该商品已被处理，请刷新列表' })
      }

      const [result] = await pool.execute(
        `UPDATE listings
         SET listing_status = 'inactive',
             review_status = 'rejected',
             reviewed_by = ?,
             reviewed_at = NOW(),
             review_reason = ?
         WHERE id = ?
           AND review_status = 'pending'`,
        [req.auth.userId, reason, listingId]
      )
      if (result.affectedRows === 0) {
        return res.status(409).json({ message: '该商品已被处理，请刷新列表' })
      }
      await invalidateListingDetailCache(listingId)

      const updatedListing = await getListingSummaryById(pool, listingId)
      res.json({ message: '商品已驳回', listing: updatedListing })
      await createUserNotificationSafely({
        userId: updatedListing?.owner_user_id || currentListing?.owner_user_id,
        category: 'listing_review',
        title: '商品审核未通过',
        content: `${buildListingTitle(updatedListing) || buildListingTitle(currentListing)} 审核未通过，原因：${reason}。请修改后重新提交审核。`,
        relatedType: 'listing',
        relatedId: listingId
      })
      await recordOperationSafely({
        operatorUserId: req.auth?.userId,
        operatorName: req.auth?.username,
        module: 'review',
        action: 'reject_listing',
        targetType: 'listing',
        targetId: listingId,
        targetLabel: buildListingTitle(updatedListing) || buildListingTitle(currentListing),
        beforeSnapshot: currentListing,
        afterSnapshot: updatedListing,
        remark: reason
      })
    } catch (error) {
      console.error('[support] reject listing failed', error)
      res.status(500).json({ message: '驳回商品失败' })
    }
  })
}
