/**
 * 订单查询辅助逻辑，用于列表、详情和汇总响应。
 */

import { normalizeSaleItemRow } from '../../constants/saleItems.js'

export class OrderQueryError extends Error {
  constructor(status, body) {
    super(body?.message || '订单查询失败')
    this.name = 'OrderQueryError'
    this.status = status
    this.body = body
  }
}

function fail(status, body) {
  throw new OrderQueryError(status, body)
}

function buildOrderTimeline(order) {
  const timeline = []
  if (order.created_at) {
    timeline.push({ event: 'created', label: '下单', time: order.created_at })
  }
  if (order.paid_at) {
    timeline.push({ event: 'paid', label: '支付', time: order.paid_at })
  }
  if (order.verified_at) {
    timeline.push({ event: 'verified', label: '确认账号正常，继续履约', time: order.verified_at })
  }
  if (order.settlement_requested_at) {
    timeline.push({ event: 'settlement_requested', label: '申请进入结算中', time: order.settlement_requested_at })
  }
  if (order.buyer_item_reported_at) {
    timeline.push({ event: 'buyer_item_reported', label: '买家填报额外物品', time: order.buyer_item_reported_at })
  }
  if (order.seller_item_confirmed_at) {
    timeline.push({ event: 'seller_item_confirmed', label: '卖家确认额外物品', time: order.seller_item_confirmed_at })
  }
  if (order.settlement_executed_at) {
    timeline.push({ event: 'settlement_executed', label: '客服执行分账', time: order.settlement_executed_at })
  }
  if (order.finished_at) {
    timeline.push({ event: 'finished', label: '完成', time: order.finished_at })
  }
  if (order.cancel_requested_at) {
    timeline.push({ event: 'cancel_requested', label: '发起取消申请', time: order.cancel_requested_at })
  }
  if (order.cancelled_at) {
    timeline.push({ event: 'cancelled', label: '取消', time: order.cancelled_at })
  }
  return timeline
}

function buildOrderDetailListingTitle(order, listing, buildOrderListingTitle) {
  if (!listing) {
    return `出租账号 #${order.listing_id}`
  }

  return buildOrderListingTitle({
    hafuCoin: listing.hafu_coin,
    rentDays: order.rent_days,
    insuranceLevel: listing.insurance_level,
    listingId: order.listing_id
  })
}

function normalizePagination({ page, pageSize }) {
  return {
    page: Math.max(1, Number(page || 1)),
    pageSize: Math.min(20, Math.max(1, Number(pageSize || 10)))
  }
}

function buildOrderStatusFilter(status) {
  const safeStatus = String(status || '').trim()
  if (!safeStatus || safeStatus === 'all') {
    return { sql: '', params: [] }
  }
  if (safeStatus === 'in_progress') {
    return {
      sql: ` AND o.status IN (
        'paid',
        'support_handling',
        'settlement_pending'
      )`,
      params: []
    }
  }
  return {
    sql: ' AND o.status = ?',
    params: [safeStatus]
  }
}

export function createOrderQueryService({
  pool,
  getListingImagesOrderSql,
  normalizeOrderMoneyFields,
  normalizeListingMoneyFields,
  buildOrderListingTitle,
  fetchListingBanImages,
  buildListingDetailPayload
}) {
  async function getBuyerOrdersList({ userId, page, pageSize, status, keyword }) {
    const pagination = normalizePagination({ page, pageSize })
    const offset = (pagination.page - 1) * pagination.pageSize
    const where = ['o.buyer_id = ?']
    const values = [userId]
    const statusFilter = buildOrderStatusFilter(status)

    if (statusFilter.sql) {
      where.push(statusFilter.sql.replace(/^ AND /, ''))
      values.push(...statusFilter.params)
    }

    if (keyword) {
      where.push('(o.order_no LIKE ? OR o.listing_title LIKE ? OR o.seller_name LIKE ?)')
      values.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
    }

    const whereSql = `WHERE ${where.join(' AND ')}`
    const limitSafe = Number.isFinite(pagination.pageSize) ? pagination.pageSize : 10
    const offsetSafe = Number.isFinite(offset) ? offset : 0

    const [rows] = await pool.execute(
      `SELECT
        o.id,
        o.order_no,
        o.listing_id,
        l.listing_no,
        COALESCE(
          NULLIF(CONCAT(
            COALESCE(CONCAT(NULLIF(l.hafu_coin, ''), 'M'), '未设置'),
            ' / ',
            COALESCE(NULLIF(o.rent_days, ''), '0'),
            ' 天',
            ' / ',
            COALESCE(NULLIF(l.insurance_level, ''), '未设置保险')
          ), ''),
          CONCAT('出租账号 #', o.listing_id)
        ) AS listing_title,
        COALESCE(NULLIF(o.seller_name, ''), l.owner_name, '平台卖家') AS seller_name,
        COALESCE(
          o.listing_cover_image,
          l.cover_image,
          (
            SELECT li.image_url FROM listing_images li
            WHERE li.listing_id = o.listing_id
            ORDER BY ${getListingImagesOrderSql('li')}
            LIMIT 1
          )
        ) AS cover_image,
        o.rent_days,
        o.amount,
        o.seller_rent_amount,
        o.deposit_amount,
        COALESCE(l.compensation_plan, 'basic') AS compensation_plan,
        o.status,
        o.settlement_status,
        o.support_scene,
        o.created_at,
        o.paid_at,
        o.finished_at,
        o.cancelled_at
      FROM orders o
      LEFT JOIN listings l ON l.id = o.listing_id
      ${whereSql}
      ORDER BY o.created_at DESC
      LIMIT ${limitSafe} OFFSET ${offsetSafe}`,
      values
    )

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM orders o
       ${whereSql}`,
      values
    )

    return {
      list: rows.map(normalizeOrderMoneyFields),
      total: Number(countRows[0]?.total || 0),
      page: pagination.page,
      pageSize: pagination.pageSize
    }
  }

  async function getSellerOrdersList({ userId, username, page, pageSize, status, keyword }) {
    const pagination = normalizePagination({ page, pageSize })
    const offset = (pagination.page - 1) * pagination.pageSize
    const where = ['(o.seller_id = ? OR (o.seller_id IS NULL AND o.seller_name = ?))']
    const values = [userId, username]
    const statusFilter = buildOrderStatusFilter(status)

    if (statusFilter.sql) {
      where.push(statusFilter.sql.replace(/^ AND /, ''))
      values.push(...statusFilter.params)
    }

    if (keyword) {
      where.push('(o.order_no LIKE ? OR o.listing_title LIKE ? OR buyer.username LIKE ?)')
      values.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
    }

    const whereSql = `WHERE ${where.join(' AND ')}`
    const limitSafe = Number.isFinite(pagination.pageSize) ? pagination.pageSize : 10
    const offsetSafe = Number.isFinite(offset) ? offset : 0

    const [rows] = await pool.execute(
      `SELECT
        o.id,
        o.order_no,
        o.listing_id,
        COALESCE(
          NULLIF(CONCAT(
            COALESCE(CONCAT(NULLIF(l.hafu_coin, ''), 'M'), '未设置'),
            ' / ',
            COALESCE(NULLIF(o.rent_days, ''), '0'),
            ' 天',
            ' / ',
            COALESCE(NULLIF(l.insurance_level, ''), '未设置保险')
          ), ''),
          CONCAT('出租账号 #', o.listing_id)
        ) AS listing_title,
        l.listing_no,
        COALESCE(buyer.username, CONCAT('用户 #', o.buyer_id)) AS buyer_name,
        COALESCE(
          o.listing_cover_image,
          l.cover_image,
          (
            SELECT li.image_url FROM listing_images li
            WHERE li.listing_id = o.listing_id
            ORDER BY ${getListingImagesOrderSql('li')}
            LIMIT 1
          )
        ) AS cover_image,
        o.rent_days,
        COALESCE(o.amount, l.rent_price) AS amount,
        COALESCE(o.seller_rent_amount, 0) AS seller_rent_amount,
        COALESCE(o.deposit_amount, l.deposit) AS deposit_amount,
        COALESCE(l.compensation_plan, 'basic') AS compensation_plan,
        o.status,
        o.settlement_status,
        o.support_scene,
        o.created_at,
        o.paid_at,
        o.finished_at,
        o.cancelled_at
      FROM orders o
      LEFT JOIN listings l ON l.id = o.listing_id
      LEFT JOIN users buyer ON buyer.id = o.buyer_id
      ${whereSql}
      ORDER BY o.created_at DESC
      LIMIT ${limitSafe} OFFSET ${offsetSafe}`,
      values
    )

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM orders o
       LEFT JOIN users buyer ON buyer.id = o.buyer_id
       ${whereSql}`,
      values
    )

    return {
      list: rows.map(normalizeOrderMoneyFields),
      total: Number(countRows[0]?.total || 0),
      page: pagination.page,
      pageSize: pagination.pageSize
    }
  }

  async function getOrderDetail({ orderId, userId }) {
    const [orders] = await pool.execute(
      `SELECT * FROM orders WHERE id = ? LIMIT 1`,
      [orderId]
    )

    if (!orders.length) {
      fail(404, { message: '订单不存在' })
    }

    const order = orders[0]
    const isBuyer = order.buyer_id === userId
    const isSeller = order.seller_id === userId

    if (!isBuyer && !isSeller) {
      fail(403, { message: '无权查看此订单' })
    }

    const [listings] = await pool.execute(
      `SELECT
        l.id, l.listing_no, l.owner_user_id, l.owner_name, l.insurance_level, l.compensation_plan, l.weight_level,
        l.deposit, l.base_ratio, l.login_method, l.energy_level, l.hafu_coin, l.rent_price,
        l.rent_days, l.login_time_range, l.daily_cost, l.secret_kd, l.character_level,
        l.operator_appearance, l.gold_skin, l.rank_name, l.knife_skin, l.weapon_skin,
        l.region, l.face_verified, l.dive_level, l.seyed_unlocked, l.listing_status,
        l.remark, l.ban_record, l.ban_video_url, l.published_at, l.created_at, l.cover_image
       FROM listings l
       WHERE l.id = ?
       LIMIT 1`,
      [order.listing_id]
    )

    const listing = listings[0] || null

    let items = []
    let images = []
    let banImages = []

    if (listing) {
      const [itemsRows] = await pool.execute(
        `SELECT item_key, item_name, item_mode, quantity, unit_price, total_price
         FROM order_item_snapshots WHERE order_id = ? ORDER BY id ASC`,
        [orderId]
      )
      items = itemsRows.map((row) => normalizeSaleItemRow(row))

      const [imagesRows] = await pool.execute(
        `SELECT image_url FROM listing_images WHERE listing_id = ? ORDER BY ${getListingImagesOrderSql()}`,
        [order.listing_id]
      )
      images = imagesRows
      banImages = await fetchListingBanImages(pool, order.listing_id)
    }

    const [usageRows] = await pool.execute(
      `SELECT item_key, snapshot_quantity, reported_quantity, reported_total_price, buyer_note, buyer_reported_at, seller_confirmed, seller_confirmed_at
       FROM order_item_usage_reports
       WHERE order_id = ?
       ORDER BY id ASC`,
      [orderId]
    )

    const [[settlementRow]] = await pool.execute(
      `SELECT
          rent_amount,
          deposit_amount,
          used_items_amount,
          platform_fee_amount,
          seller_income_amount,
          buyer_refund_amount,
          status,
          executed_at
       FROM order_settlements
       WHERE order_id = ?
       LIMIT 1`,
      [orderId]
    )

    const [[supportRow]] = await pool.execute(
      `SELECT username
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [order.support_assignee_id || 0]
    )

    const [[buyerRow]] = await pool.execute(
      `SELECT username
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [order.buyer_id || 0]
    )

    const [[sellerRow]] = await pool.execute(
      `SELECT username
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [order.seller_id || 0]
    )

    const payload = normalizeOrderMoneyFields(order)
    payload.support_note = ''
    payload.listing = listing
      ? buildListingDetailPayload(listing, items, images, banImages, { includeBanMedia: true })
      : null
    payload.items = items
    payload.images = images
    payload.item_usage_reports = usageRows.map((row) => normalizeOrderMoneyFields({
      ...row,
      amount: row.reported_total_price,
      deposit_amount: 0
    }))
    payload.item_usage_reports = payload.item_usage_reports.map((row) => ({
      ...row,
      reported_total_price: row.amount
    }))
    if (settlementRow) {
      const normalizedSettlement = normalizeOrderMoneyFields({
        amount: settlementRow.rent_amount,
        deposit_amount: settlementRow.deposit_amount
      })
      payload.settlement = {
        rent_amount: normalizedSettlement.amount,
        deposit_amount: normalizedSettlement.deposit_amount,
        used_items_amount: normalizeOrderMoneyFields({ amount: settlementRow.used_items_amount, deposit_amount: 0 }).amount,
        platform_fee_amount: normalizeOrderMoneyFields({ amount: settlementRow.platform_fee_amount, deposit_amount: 0 }).amount,
        seller_income_amount: normalizeOrderMoneyFields({ amount: settlementRow.seller_income_amount, deposit_amount: 0 }).amount,
        buyer_refund_amount: normalizeOrderMoneyFields({ amount: settlementRow.buyer_refund_amount, deposit_amount: 0 }).amount,
        status: settlementRow.status || 'draft',
        executed_at: settlementRow.executed_at || null
      }
    } else {
      payload.settlement = null
    }
    payload.support_assignee_name = supportRow?.username || ''
    payload.buyer_name = buyerRow?.username || payload.buyer_name || `用户 #${order.buyer_id || 0}`
    payload.seller_name = sellerRow?.username || payload.seller_name || listing?.owner_name || '平台卖家'
    payload.timeline = buildOrderTimeline(order)
    payload.listing_title = buildOrderDetailListingTitle(order, listing, buildOrderListingTitle)

    return payload
  }

  return {
    getBuyerOrdersList,
    getSellerOrdersList,
    getOrderDetail
  }
}
