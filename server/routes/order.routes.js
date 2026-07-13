/**
 * 订单相关 HTTP 路由，处理买家、卖家与客服订单操作。
 */

import { OrderLifecycleError } from '../modules/order/order-lifecycle.service.js'
import { OrderQueryError } from '../modules/order/order-query.service.js'

export function registerOrdersRoutes(deps) {
  const {
    app,
    pool,
    authRequired,
    supportOnly,
    requireStepUpAuth,
    ADMIN_STEP_UP_POLICIES,
    authenticatedReadLimiter,
    orderWriteLimiter,
    orderLifecycleService,
    orderQueryService,
    buildOrderStatsPayload,
    normalizeOrderMoneyFields,
    BUYER_AGREEMENT_VERSION,
    PAYMENT_AGREEMENT_VERSION
  } = deps

function handleOrderLifecycleError(error, res, fallbackMessage) {
  if (error instanceof OrderLifecycleError) {
    return res.status(error.status).json(error.body)
  }
  return res.status(500).json({ message: fallbackMessage })
}

function handleOrderQueryError(error, res, fallbackMessage) {
  if (error instanceof OrderQueryError) {
    return res.status(error.status).json(error.body)
  }
  return res.status(500).json({ message: fallbackMessage })
}

/**
 * GET /api/orders/stats - 我的订单统计接口
 * 返回当前登录用户在各订单状态下的数量汇总，用于个人中心顶部统计卡片。
 */
app.get('/api/orders/stats', authRequired, authenticatedReadLimiter, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'pending_payment' THEN 1 ELSE 0 END) AS pending_payment,
        SUM(CASE WHEN status IN ('paid', 'support_handling', 'settlement_pending') THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid,
        SUM(CASE WHEN status = 'support_handling' THEN 1 ELSE 0 END) AS support_handling,
        SUM(CASE WHEN status = 'settlement_pending' THEN 1 ELSE 0 END) AS settlement_pending,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
      FROM orders
      WHERE buyer_id = ?`,
      [req.auth.userId]
    )

    res.json(buildOrderStatsPayload(rows[0]))
  } catch (_error) {
    res.status(500).json({ message: '获取订单统计失败' })
  }
})

/**
 * GET /api/orders - 我的订单列表接口
 *
 * 查询参数:
 *   status - 订单状态（all/pending_payment/paid/support_handling/settlement_pending/completed/cancelled）
 *   page/pageSize - 分页控制
 *   keyword - 关键字搜索（订单号/商品标题/卖家名称）
 */
app.get('/api/orders', authRequired, authenticatedReadLimiter, async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1))
  const pageSize = Math.min(20, Math.max(1, Number(req.query.pageSize || 10)))
  const status = String(req.query.status || 'all').trim()
  const keyword = String(req.query.keyword || '').trim()

  try {
    const payload = await orderQueryService.getBuyerOrdersList({
      userId: req.auth.userId,
      page,
      pageSize,
      status,
      keyword
    })
    res.json(payload)
  } catch (_error) {
    res.status(500).json({ message: '获取订单列表失败' })
  }
})

/**
 * GET /api/seller/orders/stats - 我卖出的订单统计接口
 *
 * 优先按 seller_id 查询；为了兼容旧数据，若 seller_id 为空，则回退匹配 seller_name。
 */
app.get('/api/seller/orders/stats', authRequired, authenticatedReadLimiter, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'pending_payment' THEN 1 ELSE 0 END) AS pending_payment,
        SUM(CASE WHEN status IN ('paid', 'support_handling', 'settlement_pending') THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid,
        SUM(CASE WHEN status = 'support_handling' THEN 1 ELSE 0 END) AS support_handling,
        SUM(CASE WHEN status = 'settlement_pending' THEN 1 ELSE 0 END) AS settlement_pending,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
      FROM orders
      WHERE seller_id = ? OR (seller_id IS NULL AND seller_name = ?)`,
      [req.auth.userId, req.auth.username]
    )

    res.json(buildOrderStatsPayload(rows[0]))
  } catch (_error) {
    res.status(500).json({ message: '获取卖家订单统计失败' })
  }
})

/**
 * GET /api/seller/orders - 我卖出的订单列表接口
 *
 * 查询参数:
 *   status - 订单状态（all/pending_payment/paid/support_handling/settlement_pending/completed/cancelled）
 *   page/pageSize - 分页控制
 *   keyword - 关键字搜索（订单号/商品标题/买家名称）
 */
app.get('/api/seller/orders', authRequired, authenticatedReadLimiter, async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1))
  const pageSize = Math.min(20, Math.max(1, Number(req.query.pageSize || 10)))
  const status = String(req.query.status || 'all').trim()
  const keyword = String(req.query.keyword || '').trim()

  try {
    const payload = await orderQueryService.getSellerOrdersList({
      userId: req.auth.userId,
      username: req.auth.username,
      page,
      pageSize,
      status,
      keyword
    })
    res.json(payload)
  } catch (_error) {
    res.status(500).json({ message: '获取卖家订单列表失败' })
  }
})

app.post('/api/orders', authRequired, orderWriteLimiter, async (req, res) => {
  const listingId = Number(req.body?.listing_id)
  const acceptBuyerAgreement = Boolean(req.body?.accept_buyer_agreement)
  const acceptPaymentAgreement = Boolean(req.body?.accept_payment_agreement)
  const buyerAgreementVersion = String(req.body?.buyer_agreement_version || '').trim()
  const paymentAgreementVersion = String(req.body?.payment_agreement_version || '').trim()

  if (!listingId || !Number.isFinite(listingId) || listingId < 1) {
    return res.status(400).json({ message: '请选择要租用的商品' })
  }
  if (!acceptBuyerAgreement || !acceptPaymentAgreement) {
    return res.status(400).json({ message: '下单前请先阅读并同意支付前协议与租客协议' })
  }
  if (
    buyerAgreementVersion !== BUYER_AGREEMENT_VERSION ||
    paymentAgreementVersion !== PAYMENT_AGREEMENT_VERSION
  ) {
    return res.status(400).json({ message: '协议版本已更新，请重新阅读并确认后再下单' })
  }

  try {
    const order = await orderLifecycleService.createOrder({
      listingId,
      userId: req.auth.userId
    })
    res.status(201).json(normalizeOrderMoneyFields(order))
  } catch (error) {
    handleOrderLifecycleError(error, res, '创建订单失败')
  }
})

app.put('/api/orders/:id/pay', authRequired, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '订单ID无效' })
  }

  try {
    const order = await orderLifecycleService.payOrder({
      orderId,
      userId: req.auth.userId
    })
    res.json(normalizeOrderMoneyFields(order))
  } catch (error) {
    handleOrderLifecycleError(error, res, '支付确认失败')
  }
})

app.put('/api/orders/:id/cancel', authRequired, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '订单ID无效' })
  }

  try {
    const order = await orderLifecycleService.cancelOrderByBuyer({
      orderId,
      userId: req.auth.userId
    })
    res.json(normalizeOrderMoneyFields(order))
  } catch (error) {
    handleOrderLifecycleError(error, res, '取消订单失败')
  }
})

app.put('/api/seller/orders/:id/cancel', authRequired, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '订单ID无效' })
  }

  try {
    const order = await orderLifecycleService.cancelOrderBySeller({
      orderId,
      userId: req.auth.userId
    })
    res.json(normalizeOrderMoneyFields(order))
  } catch (error) {
    handleOrderLifecycleError(error, res, '取消订单失败')
  }
})

app.put('/api/orders/:id/complete', authRequired, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '订单ID无效' })
  }

  try {
    const order = await orderLifecycleService.confirmFinish({
      orderId,
      userId: req.auth.userId
    })
    res.json(normalizeOrderMoneyFields(order))
  } catch (error) {
    handleOrderLifecycleError(error, res, '申请结算失败')
  }
})

app.put('/api/orders/:id/verify', authRequired, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '订单ID无效' })
  }

  try {
    const order = await orderLifecycleService.verifyOrder({
      orderId,
      userId: req.auth.userId
    })
    res.json(normalizeOrderMoneyFields(order))
  } catch (error) {
    handleOrderLifecycleError(error, res, '确认继续履约失败')
  }
})

app.put('/api/orders/:id/item-usage', authRequired, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)
  const items = Array.isArray(req.body?.items) ? req.body.items : []
  const note = String(req.body?.note || '').trim().slice(0, 500)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '订单ID无效' })
  }

  try {
    const order = await orderLifecycleService.submitItemUsageReport({
      orderId,
      userId: req.auth.userId,
      items: items.map((item) => ({
        item_key: String(item?.item_key || '').trim(),
        reported_quantity: Math.max(0, Number(item?.reported_quantity || 0))
      })),
      note
    })
    res.json(normalizeOrderMoneyFields(order))
  } catch (error) {
    handleOrderLifecycleError(error, res, '提交额外物品使用表单失败')
  }
})

app.put('/api/orders/:id/item-usage/confirm', authRequired, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '订单ID无效' })
  }

  try {
    const order = await orderLifecycleService.confirmItemUsageBySeller({
      orderId,
      userId: req.auth.userId
    })
    res.json(normalizeOrderMoneyFields(order))
  } catch (error) {
    handleOrderLifecycleError(error, res, '确认额外物品使用情况失败')
  }
})

app.put('/api/orders/:id/item-usage/reject', authRequired, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)
  const note = String(req.body?.note || '').trim().slice(0, 500)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '订单ID无效' })
  }

  try {
    const order = await orderLifecycleService.rejectItemUsageBySeller({
      orderId,
      userId: req.auth.userId,
      note
    })
    res.json(normalizeOrderMoneyFields(order))
  } catch (error) {
    handleOrderLifecycleError(error, res, '发起结算争议失败')
  }
})

app.put('/api/orders/:id/request-cancel', authRequired, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)
  const reason = String(req.body?.reason || '').trim().slice(0, 500)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '订单ID无效' })
  }

  try {
    const order = await orderLifecycleService.requestCancel({
      orderId,
      userId: req.auth.userId,
      reason
    })
    res.json(normalizeOrderMoneyFields(order))
  } catch (error) {
    handleOrderLifecycleError(error, res, '发起取消申请失败')
  }
})

app.put('/api/orders/:id/respond-cancel', authRequired, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)
  const agree = Boolean(req.body?.agree)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '订单ID无效' })
  }

  try {
    const order = await orderLifecycleService.respondCancel({
      orderId,
      userId: req.auth.userId,
      agree
    })
    res.json(normalizeOrderMoneyFields(order))
  } catch (error) {
    handleOrderLifecycleError(error, res, '响应取消申请失败')
  }
})

app.put('/api/orders/:id/report-mismatch', authRequired, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)
  const note = String(req.body?.note || '').trim().slice(0, 500)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '订单ID无效' })
  }

  try {
    const order = await orderLifecycleService.reportMismatch({
      orderId,
      userId: req.auth.userId,
      note
    })
    res.json(normalizeOrderMoneyFields(order))
  } catch (error) {
    handleOrderLifecycleError(error, res, '发起异常处理失败')
  }
})

app.get('/api/orders/:id/settlement-preview', authRequired, authenticatedReadLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '订单ID无效' })
  }

  try {
    const preview = await orderLifecycleService.buildSettlementPreview(orderId)
    res.json({
      rent_amount: normalizeOrderMoneyFields({ amount: preview.rentAmount, deposit_amount: 0 }).amount,
      seller_rent_amount: normalizeOrderMoneyFields({ amount: preview.sellerRentAmount, deposit_amount: 0 }).amount,
      buyer_rent_amount: normalizeOrderMoneyFields({ amount: preview.buyerRentAmount, deposit_amount: 0 }).amount,
      deposit_amount: normalizeOrderMoneyFields({ amount: 0, deposit_amount: preview.depositAmount }).deposit_amount,
      used_items_amount: normalizeOrderMoneyFields({ amount: preview.usedItemsAmount, deposit_amount: 0 }).amount,
      platform_fee_amount: normalizeOrderMoneyFields({ amount: preview.platformFeeAmount, deposit_amount: 0 }).amount,
      seller_income_amount: normalizeOrderMoneyFields({ amount: preview.sellerIncomeAmount, deposit_amount: 0 }).amount,
      buyer_refund_amount: normalizeOrderMoneyFields({ amount: preview.buyerRefundAmount, deposit_amount: 0 }).amount
    })
  } catch (error) {
    handleOrderLifecycleError(error, res, '加载结算预览失败')
  }
})

app.put('/api/support/orders/:id/execute-settlement', authRequired, supportOnly, requireStepUpAuth(ADMIN_STEP_UP_POLICIES.supportExecuteSettlement), orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '订单ID无效' })
  }

  try {
    const order = await orderLifecycleService.executeSettlement({
      orderId,
      supportUserId: req.auth.userId
    })
    res.json(normalizeOrderMoneyFields(order))
  } catch (error) {
    handleOrderLifecycleError(error, res, '执行分账失败')
  }
})

app.get('/api/wallet', authRequired, authenticatedReadLimiter, async (req, res) => {
  try {
    const [[accountRow]] = await pool.execute(
      `SELECT balance, frozen_balance
       FROM wallet_accounts
       WHERE user_id = ?
       LIMIT 1`,
      [req.auth.userId]
    )
    res.json({
      balance: normalizeOrderMoneyFields({ amount: Number(accountRow?.balance || 0), deposit_amount: 0 }).amount,
      frozen_balance: normalizeOrderMoneyFields({ amount: Number(accountRow?.frozen_balance || 0), deposit_amount: 0 }).amount,
      withdrawable_balance: normalizeOrderMoneyFields({ amount: Number(accountRow?.balance || 0), deposit_amount: 0 }).amount
    })
  } catch (_error) {
    res.status(500).json({ message: '获取钱包余额失败' })
  }
})

app.get('/api/wallet/ledger', authRequired, authenticatedReadLimiter, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, order_id, business_type, direction, amount, balance_before, balance_after, remark, created_at
       FROM wallet_ledger
       WHERE user_id = ?
       ORDER BY id DESC
       LIMIT 100`,
      [req.auth.userId]
    )
    res.json({
      list: rows.map((row) => ({
        ...row,
        amount: normalizeOrderMoneyFields({ amount: row.amount, deposit_amount: 0 }).amount,
        balance_before: normalizeOrderMoneyFields({ amount: row.balance_before, deposit_amount: 0 }).amount,
        balance_after: normalizeOrderMoneyFields({ amount: row.balance_after, deposit_amount: 0 }).amount
      }))
    })
  } catch (_error) {
    res.status(500).json({ message: '获取钱包流水失败' })
  }
})

app.get('/api/orders/:id', authRequired, authenticatedReadLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '订单ID无效' })
  }

  try {
    const payload = await orderQueryService.getOrderDetail({
      orderId,
      userId: req.auth.userId
    })
    res.json(payload)
  } catch (error) {
    handleOrderQueryError(error, res, '获取订单详情失败')
  }
})
}
