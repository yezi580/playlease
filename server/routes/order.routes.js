/**
 * 订单相关 HTTP 路由，处理买家、卖家与客服订单操作。 */

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
 * 返回当前登录用户在各订单状态下的数量汇总，用于个人中心顶部统计卡片。 */
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
        SUM(CASE WHEN status = 'deposit_holding' THEN 1 ELSE 0 END) AS deposit_holding,
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
 *   keyword - 关键词搜索（订单号/商品标题/卖家名称） */
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
 * 优先按 seller_id 查询；为兼容旧数据，若 seller_id 为空，则回退匹配 seller_name。 */
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
        SUM(CASE WHEN status = 'deposit_holding' THEN 1 ELSE 0 END) AS deposit_holding,
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
 *   keyword - 关键词搜索（订单号/商品标题/买家名称） */
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
  const buyerContactWechat = String(req.body?.buyer_contact_wechat || '').trim()

  if (!listingId || !Number.isFinite(listingId) || listingId < 1) {
    return res.status(400).json({ message: '请选择要租用的商品' })
  }
  if (!/^[a-zA-Z][-_a-zA-Z0-9]{5,19}$/.test(buyerContactWechat) && !/^1[3-9]\d{9}$/.test(buyerContactWechat)) {
    return res.status(400).json({ message: '请输入正确的微信号或手机号' })
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
      userId: req.auth.userId,
      buyerContactWechat
    })
    res.status(201).json(normalizeOrderMoneyFields(order))
  } catch (error) {
    handleOrderLifecycleError(error, res, '创建订单失败')
  }
})

// 安全说明：不要在此暴露“订单支付确认”路由。订单置为已支付只能由支付服务在
// 渠道回调验签或主动查单成功后通过 orderLifecycleService.payOrder 内部驱动，
// 否则买家可绕过支付直接推进订单状态（免费下单漏洞）。

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
    // 越权防护：结算金额只对买家/卖家/被分配客服可见，防止枚举他人订单金额
    const [accessRows] = await pool.execute(
      `SELECT buyer_id, seller_id, support_assignee_id FROM orders WHERE id = ? LIMIT 1`,
      [orderId]
    )
    const accessOrder = accessRows[0]
    if (!accessOrder) {
      return res.status(404).json({ message: '订单不存在' })
    }
    const currentUserId = Number(req.auth.userId)
    const isBuyerView = currentUserId === Number(accessOrder.buyer_id)
    const isSellerView = currentUserId === Number(accessOrder.seller_id)
    if (
      !isBuyerView
      && !isSellerView
      && currentUserId !== Number(accessOrder.support_assignee_id || 0)
    ) {
      return res.status(403).json({ message: '无权查看此订单结算信息' })
    }
    // mode=frozen 为冻结资金裁决预览（按责任方分账），供客服裁决弹窗使用；
    // 金额按角色过滤规则与普通预览一致，真实执行以 executeSettlement 服务端核算为准
    const previewMode = String(req.query?.mode || '').trim()
    let preview = null
    if (previewMode === 'frozen') {
      const liableParty = String(req.query?.liableParty || 'seller').trim()
      if (!['seller', 'buyer'].includes(liableParty)) {
        return res.status(400).json({ message: '无效的冻结裁决责任方' })
      }
      preview = await orderLifecycleService.buildFrozenFundsSettlementPreview(orderId, liableParty)
    } else {
      preview = await orderLifecycleService.buildSettlementPreview(orderId)
    }
    // 金额按角色过滤：额外物品买家扣款/卖家收益分属两侧，互相不可见（买家侧升价保密），
    // 平台抽成与对方租金仅客服可见
    const baseFields = {
      deposit_amount: normalizeOrderMoneyFields({ amount: 0, deposit_amount: preview.depositAmount }).deposit_amount
    }
    const buyerFields = isBuyerView || !isSellerView
      ? {
          buyer_rent_amount: normalizeOrderMoneyFields({ amount: preview.buyerRentAmount, deposit_amount: 0 }).amount,
          used_items_amount: normalizeOrderMoneyFields({ amount: preview.usedItemsAmount, deposit_amount: 0 }).amount,
          buyer_refund_amount: normalizeOrderMoneyFields({ amount: preview.buyerRefundAmount, deposit_amount: 0 }).amount
        }
      : {}
    const sellerFields = isSellerView || !isBuyerView
      ? {
          rent_amount: normalizeOrderMoneyFields({ amount: preview.rentAmount, deposit_amount: 0 }).amount,
          seller_rent_amount: normalizeOrderMoneyFields({ amount: preview.sellerRentAmount, deposit_amount: 0 }).amount,
          seller_income_amount: normalizeOrderMoneyFields({ amount: preview.sellerIncomeAmount, deposit_amount: 0 }).amount
        }
      : {}
    const supportFields = !isBuyerView && !isSellerView
      ? {
          platform_fee_amount: normalizeOrderMoneyFields({ amount: preview.platformFeeAmount, deposit_amount: 0 }).amount,
          used_items_seller_amount: normalizeOrderMoneyFields({ amount: preview.usedItemsSellerAmount || 0, deposit_amount: 0 }).amount,
          used_items_markup_amount: normalizeOrderMoneyFields({ amount: preview.usedItemsMarkupAmount || 0, deposit_amount: 0 }).amount
        }
      : {}
    res.json({
      ...baseFields,
      ...buyerFields,
      ...sellerFields,
      ...supportFields
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
    // payoutMode='manual' 为手动结单/线下收款：押金仍原路退回买家，卖家结算款由客服线下联系支付，
    // 用于卖家无法完成汇付进件的场景
    const payoutMode = String(req.body?.payoutMode || 'huifu').trim()
    if (!['huifu', 'manual'].includes(payoutMode)) {
      return res.status(400).json({ message: '无效的分账方式' })
    }
    // liableParty 仅冻结资金裁决使用：卖家责任（默认）/买家责任
    const liableParty = String(req.body?.liableParty || 'seller').trim()
    if (!['seller', 'buyer'].includes(liableParty)) {
      return res.status(400).json({ message: '无效的冻结裁决责任方' })
    }
    let manualNote = ''
    if (payoutMode === 'manual') {
      manualNote = String(req.body?.manualNote || '').trim()
      if (!manualNote) {
        return res.status(400).json({ message: '请填写备注，说明线下收款安排' })
      }
      if (manualNote.length > 500) {
        return res.status(400).json({ message: '备注不能超过 500 字' })
      }
    }
    const order = await orderLifecycleService.executeSettlement({
      orderId,
      supportUserId: req.auth.userId,
      payoutMode,
      manualNote,
      liableParty
    })
    res.json(normalizeOrderMoneyFields(order))
  } catch (error) {
    handleOrderLifecycleError(error, res, '执行分账失败')
  }
})

// 押金保管冷静期：卖家举报买家违规（如开挂导致账号封禁），暂停押金自动退回并转客服裁决
app.post('/api/orders/:id/deposit-hold/report', authRequired, orderWriteLimiter, async (req, res) => {
  const orderId = Number(req.params?.id)

  if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
    return res.status(400).json({ message: '订单ID无效' })
  }

  const reason = String(req.body?.reason || '').trim()
  if (!reason) {
    return res.status(400).json({ message: '请填写举报原因' })
  }
  if (reason.length > 500) {
    return res.status(400).json({ message: '举报原因不能超过 500 字' })
  }

  try {
    const order = await orderLifecycleService.reportDepositViolation({
      orderId,
      sellerUserId: req.auth.userId,
      reason
    })
    res.json(normalizeOrderMoneyFields(order))
  } catch (error) {
    handleOrderLifecycleError(error, res, '举报失败')
  }
})

// 客服押金裁决：verdict=confiscate 没收押金全额赔付卖家 / verdict=reject 驳回举报退回买家
app.put(
  '/api/support/orders/:id/deposit-verdict',
  authRequired,
  supportOnly,
  requireStepUpAuth(ADMIN_STEP_UP_POLICIES.supportExecuteSettlement),
  orderWriteLimiter,
  async (req, res) => {
    const orderId = Number(req.params?.id)

    if (!orderId || !Number.isFinite(orderId) || orderId < 1) {
      return res.status(400).json({ message: '订单ID无效' })
    }

    const verdict = String(req.body?.verdict || '').trim()
    if (!['confiscate', 'reject'].includes(verdict)) {
      return res.status(400).json({ message: '无效的押金裁决结果' })
    }
    const payoutMode = String(req.body?.payoutMode || 'huifu').trim()
    if (!['huifu', 'manual'].includes(payoutMode)) {
      return res.status(400).json({ message: '无效的赔付支付方式' })
    }
    const note = String(req.body?.note || '').trim()
    if (note.length > 500) {
      return res.status(400).json({ message: '裁决备注不能超过 500 字' })
    }

    try {
      const result = await orderLifecycleService.verdictDepositDispute({
        orderId,
        supportUserId: req.auth.userId,
        verdict,
        payoutMode,
        note
      })
      res.json({
        message: result?.finalized ? '押金裁决已完成' : '押金裁决已发起，资金处理结果以支付通道确认为准',
        order: normalizeOrderMoneyFields(result?.order || {})
      })
    } catch (error) {
      handleOrderLifecycleError(error, res, '押金裁决失败')
    }
  }
)

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
