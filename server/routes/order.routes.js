/**
 * 璁㈠崟鐩稿叧 HTTP 璺敱锛屽鐞嗕拱瀹躲€佸崠瀹朵笌瀹㈡湇璁㈠崟鎿嶄綔銆? */

import { OrderLifecycleError } from '../modules/order/order-lifecycle.service.js'
import { OrderQueryError } from '../modules/order/order-query.service.js'

export function registerOrdersRoutes(deps) {
  const {
    app,
    pool,
    authRequired,
    supportOnly,
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
 * GET /api/orders/stats - 鎴戠殑璁㈠崟缁熻鎺ュ彛
 * 杩斿洖褰撳墠鐧诲綍鐢ㄦ埛鍦ㄥ悇璁㈠崟鐘舵€佷笅鐨勬暟閲忔眹鎬伙紝鐢ㄤ簬涓汉涓績椤堕儴缁熻鍗＄墖銆? */
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
    res.status(500).json({ message: '鑾峰彇璁㈠崟缁熻澶辫触' })
  }
})

/**
 * GET /api/orders - 鎴戠殑璁㈠崟鍒楄〃鎺ュ彛
 *
 * 鏌ヨ鍙傛暟:
 *   status - 璁㈠崟鐘舵€侊紙all/pending_payment/paid/support_handling/settlement_pending/completed/cancelled锛? *   page/pageSize - 鍒嗛〉鎺у埗
 *   keyword - 鍏抽敭瀛楁悳绱紙璁㈠崟鍙?鍟嗗搧鏍囬/鍗栧鍚嶇О锛? */
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
    res.status(500).json({ message: '鑾峰彇璁㈠崟鍒楄〃澶辫触' })
  }
})

/**
 * GET /api/seller/orders/stats - 鎴戝崠鍑虹殑璁㈠崟缁熻鎺ュ彛
 *
 * 浼樺厛鎸?seller_id 鏌ヨ锛涗负浜嗗吋瀹规棫鏁版嵁锛岃嫢 seller_id 涓虹┖锛屽垯鍥為€€鍖归厤 seller_name銆? */
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
    res.status(500).json({ message: '鑾峰彇鍗栧璁㈠崟缁熻澶辫触' })
  }
})

/**
 * GET /api/seller/orders - 鎴戝崠鍑虹殑璁㈠崟鍒楄〃鎺ュ彛
 *
 * 鏌ヨ鍙傛暟:
 *   status - 璁㈠崟鐘舵€侊紙all/pending_payment/paid/support_handling/settlement_pending/completed/cancelled锛? *   page/pageSize - 鍒嗛〉鎺у埗
 *   keyword - 鍏抽敭瀛楁悳绱紙璁㈠崟鍙?鍟嗗搧鏍囬/涔板鍚嶇О锛? */
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
    res.status(500).json({ message: '鑾峰彇鍗栧璁㈠崟鍒楄〃澶辫触' })
  }
})

app.post('/api/orders', authRequired, orderWriteLimiter, async (req, res) => {
  const listingId = Number(req.body?.listing_id)
  const acceptBuyerAgreement = Boolean(req.body?.accept_buyer_agreement)
  const acceptPaymentAgreement = Boolean(req.body?.accept_payment_agreement)
  const buyerAgreementVersion = String(req.body?.buyer_agreement_version || '').trim()
  const paymentAgreementVersion = String(req.body?.payment_agreement_version || '').trim()
  const buyerContactWechat = String(req.body?.buyer_contact_wechat || '').trim()

  if (!listingId || !Number.isFinite(listingId) || listingId < 1) {
    return res.status(400).json({ message: '璇烽€夋嫨瑕佺鐢ㄧ殑鍟嗗搧' })
  }
  if (!/^[a-zA-Z][-_a-zA-Z0-9]{5,19}$/.test(buyerContactWechat)) {
    return res.status(400).json({ message: 'Invalid wechat id' })
  }
  if (!acceptBuyerAgreement || !acceptPaymentAgreement) {
    return res.status(400).json({ message: '涓嬪崟鍓嶈鍏堥槄璇诲苟鍚屾剰鏀粯鍓嶅崗璁笌绉熷鍗忚' })
  }
  if (
    buyerAgreementVersion !== BUYER_AGREEMENT_VERSION ||
    paymentAgreementVersion !== PAYMENT_AGREEMENT_VERSION
  ) {
    return res.status(400).json({ message: '鍗忚鐗堟湰宸叉洿鏂帮紝璇烽噸鏂伴槄璇诲苟纭鍚庡啀涓嬪崟' })
  }

  try {
    const order = await orderLifecycleService.createOrder({
      listingId,
      userId: req.auth.userId,
      buyerContactWechat
    })
    res.status(201).json(normalizeOrderMoneyFields(order))
  } catch (error) {
    handleOrderLifecycleError(error, res, '鍒涘缓璁㈠崟澶辫触')
  }
})

app.put('/api/orders/:id/pay', authRequired, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '璁㈠崟ID鏃犳晥' })
  }

  try {
    const order = await orderLifecycleService.payOrder({
      orderId,
      userId: req.auth.userId
    })
    res.json(normalizeOrderMoneyFields(order, { includeSensitiveContacts: true }))
  } catch (error) {
    handleOrderLifecycleError(error, res, '鏀粯纭澶辫触')
  }
})

app.put('/api/orders/:id/cancel', authRequired, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '璁㈠崟ID鏃犳晥' })
  }

  try {
    const order = await orderLifecycleService.cancelOrderByBuyer({
      orderId,
      userId: req.auth.userId
    })
    res.json(normalizeOrderMoneyFields(order))
  } catch (error) {
    handleOrderLifecycleError(error, res, '鍙栨秷璁㈠崟澶辫触')
  }
})

app.put('/api/seller/orders/:id/cancel', authRequired, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '璁㈠崟ID鏃犳晥' })
  }

  try {
    const order = await orderLifecycleService.cancelOrderBySeller({
      orderId,
      userId: req.auth.userId
    })
    res.json(normalizeOrderMoneyFields(order))
  } catch (error) {
    handleOrderLifecycleError(error, res, '鍙栨秷璁㈠崟澶辫触')
  }
})

app.put('/api/orders/:id/complete', authRequired, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '璁㈠崟ID鏃犳晥' })
  }

  try {
    const order = await orderLifecycleService.confirmFinish({
      orderId,
      userId: req.auth.userId
    })
    res.json(normalizeOrderMoneyFields(order))
  } catch (error) {
    handleOrderLifecycleError(error, res, '鐢宠缁撶畻澶辫触')
  }
})

app.put('/api/orders/:id/verify', authRequired, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '璁㈠崟ID鏃犳晥' })
  }

  try {
    const order = await orderLifecycleService.verifyOrder({
      orderId,
      userId: req.auth.userId
    })
    res.json(normalizeOrderMoneyFields(order))
  } catch (error) {
    handleOrderLifecycleError(error, res, '纭缁х画灞ョ害澶辫触')
  }
})

app.put('/api/orders/:id/item-usage', authRequired, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)
  const items = Array.isArray(req.body?.items) ? req.body.items : []
  const note = String(req.body?.note || '').trim().slice(0, 500)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '璁㈠崟ID鏃犳晥' })
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
    handleOrderLifecycleError(error, res, '鎻愪氦棰濆鐗╁搧浣跨敤琛ㄥ崟澶辫触')
  }
})

app.put('/api/orders/:id/item-usage/confirm', authRequired, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '璁㈠崟ID鏃犳晥' })
  }

  try {
    const order = await orderLifecycleService.confirmItemUsageBySeller({
      orderId,
      userId: req.auth.userId
    })
    res.json(normalizeOrderMoneyFields(order))
  } catch (error) {
    handleOrderLifecycleError(error, res, '纭棰濆鐗╁搧浣跨敤鎯呭喌澶辫触')
  }
})

app.put('/api/orders/:id/item-usage/reject', authRequired, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)
  const note = String(req.body?.note || '').trim().slice(0, 500)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '璁㈠崟ID鏃犳晥' })
  }

  try {
    const order = await orderLifecycleService.rejectItemUsageBySeller({
      orderId,
      userId: req.auth.userId,
      note
    })
    res.json(normalizeOrderMoneyFields(order))
  } catch (error) {
    handleOrderLifecycleError(error, res, '鍙戣捣缁撶畻浜夎澶辫触')
  }
})

app.put('/api/orders/:id/request-cancel', authRequired, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)
  const reason = String(req.body?.reason || '').trim().slice(0, 500)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '璁㈠崟ID鏃犳晥' })
  }

  try {
    const order = await orderLifecycleService.requestCancel({
      orderId,
      userId: req.auth.userId,
      reason
    })
    res.json(normalizeOrderMoneyFields(order))
  } catch (error) {
    handleOrderLifecycleError(error, res, '鍙戣捣鍙栨秷鐢宠澶辫触')
  }
})

app.put('/api/orders/:id/respond-cancel', authRequired, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)
  const agree = Boolean(req.body?.agree)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '璁㈠崟ID鏃犳晥' })
  }

  try {
    const order = await orderLifecycleService.respondCancel({
      orderId,
      userId: req.auth.userId,
      agree
    })
    res.json(normalizeOrderMoneyFields(order))
  } catch (error) {
    handleOrderLifecycleError(error, res, '鍝嶅簲鍙栨秷鐢宠澶辫触')
  }
})

app.put('/api/orders/:id/report-mismatch', authRequired, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)
  const note = String(req.body?.note || '').trim().slice(0, 500)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '璁㈠崟ID鏃犳晥' })
  }

  try {
    const order = await orderLifecycleService.reportMismatch({
      orderId,
      userId: req.auth.userId,
      note
    })
    res.json(normalizeOrderMoneyFields(order))
  } catch (error) {
    handleOrderLifecycleError(error, res, '鍙戣捣寮傚父澶勭悊澶辫触')
  }
})

app.get('/api/orders/:id/settlement-preview', authRequired, authenticatedReadLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '璁㈠崟ID鏃犳晥' })
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
    handleOrderLifecycleError(error, res, '鍔犺浇缁撶畻棰勮澶辫触')
  }
})

app.put('/api/support/orders/:id/execute-settlement', authRequired, supportOnly, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '璁㈠崟ID鏃犳晥' })
  }

  try {
    const order = await orderLifecycleService.executeSettlement({
      orderId,
      supportUserId: req.auth.userId
    })
    res.json(normalizeOrderMoneyFields(order))
  } catch (error) {
    handleOrderLifecycleError(error, res, '鎵ц鍒嗚处澶辫触')
  }
})

app.get('/api/orders/:id', authRequired, authenticatedReadLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '璁㈠崟ID鏃犳晥' })
  }

  try {
    const payload = await orderQueryService.getOrderDetail({
      orderId,
      userId: req.auth.userId
    })
    res.json(payload)
  } catch (error) {
    handleOrderQueryError(error, res, '鑾峰彇璁㈠崟璇︽儏澶辫触')
  }
})
}
