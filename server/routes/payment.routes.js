import { PaymentServiceError } from '../modules/payment/payment.service.js'

function handlePaymentServiceError(error, res, fallbackMessage) {
  if (error instanceof PaymentServiceError) {
    return res.status(error.status).json(error.body)
  }
  return res.status(500).json({ message: fallbackMessage })
}

function normalizeAmount(normalizeOrderMoneyFields, amount) {
  return normalizeOrderMoneyFields({
    amount: Number(amount || 0),
    deposit_amount: 0
  }).amount
}

function serializePaymentTransaction(normalizeOrderMoneyFields, row) {
  if (!row) return null
  return {
    id: row.id,
    transaction_no: row.transaction_no,
    order_id: row.order_id,
    business_type: row.business_type,
    channel: row.channel,
    provider: row.provider,
    subject: row.subject,
    amount: normalizeAmount(normalizeOrderMoneyFields, row.amount),
    status: row.status,
    business_sync_status: row.businessSyncStatus || row.business_sync_status,
    business_sync_message: row.businessSyncMessage || row.business_sync_message || '',
    provider_trade_no: row.provider_trade_no || '',
    paid_at: row.paid_at || null,
    expires_at: row.expires_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    provider_payload: row.provider_payload || null
  }
}

function serializeWithdrawRequest(normalizeOrderMoneyFields, row) {
  if (!row) return null
  return {
    id: row.id,
    request_no: row.request_no,
    user_id: row.user_id,
    username: row.username || '',
    phone: row.phone || '',
    channel: row.channel,
    provider: row.provider,
    amount: normalizeAmount(normalizeOrderMoneyFields, row.amount),
    fee_amount: normalizeAmount(normalizeOrderMoneyFields, row.fee_amount),
    net_amount: normalizeAmount(normalizeOrderMoneyFields, row.net_amount),
    status: row.status,
    account_name: row.account_name,
    account_no_masked: row.account_no_masked,
    provider_request_id: row.provider_request_id || '',
    remark: row.remark || '',
    failure_reason: row.failure_reason || '',
    reviewed_by_user_id: row.reviewed_by_user_id || null,
    reviewed_at: row.reviewed_at || null,
    paid_at: row.paid_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    provider_payload: row.provider_payload || null
  }
}

export function registerPaymentRoutes(deps) {
  const {
    app,
    authRequired,
    adminOnly,
    requireStepUpAuth,
    ADMIN_STEP_UP_POLICIES,
    authenticatedReadLimiter,
    authenticatedWriteLimiter,
    orderWriteLimiter,
    normalizeOrderMoneyFields,
    paymentService,
    yuanToCent,
    createUserNotificationSafely
  } = deps

  app.post('/api/pay/create', authRequired, orderWriteLimiter, async (req, res) => {
    const orderId = Number(req.body?.order_id || 0)
    const channel = String(req.body?.channel || 'online').trim().toLowerCase() || 'online'

    if (!orderId) {
      return res.status(400).json({ message: '订单ID无效' })
    }

    try {
      const transaction = await paymentService.createOrderPayment({
        orderId,
        userId: req.auth.userId,
        channel
      })
      res.status(201).json({
        transaction: serializePaymentTransaction(normalizeOrderMoneyFields, transaction)
      })
    } catch (error) {
      handlePaymentServiceError(error, res, '创建支付订单失败')
    }
  })

  app.get('/api/pay/transactions/:transactionNo', authRequired, authenticatedReadLimiter, async (req, res) => {
    try {
      const transaction = await paymentService.getPaymentTransactionDetail({
        transactionNo: req.params.transactionNo,
        userId: req.auth.userId
      })
      res.json({
        transaction: serializePaymentTransaction(normalizeOrderMoneyFields, transaction)
      })
    } catch (error) {
      handlePaymentServiceError(error, res, '获取支付流水失败')
    }
  })

  app.post('/api/pay/transactions/:transactionNo/close', authRequired, authenticatedWriteLimiter, async (req, res) => {
    try {
      const transaction = await paymentService.closePaymentTransaction({
        transactionNo: req.params.transactionNo,
        userId: req.auth.userId
      })
      res.json({
        transaction: serializePaymentTransaction(normalizeOrderMoneyFields, transaction)
      })
    } catch (error) {
      handlePaymentServiceError(error, res, '关闭支付流水失败')
    }
  })

  app.post('/api/pay/callback/:channel', async (req, res) => {
    const channel = String(req.params.channel || '').trim().toLowerCase()
    try {
      const transaction = await paymentService.handlePaymentCallback({
        channel,
        transactionNo: req.body?.transaction_no,
        providerTradeNo: req.body?.provider_trade_no,
        status: req.body?.status,
        rawPayload: req.body || {}
      })
      res.json({
        success: true,
        transaction: serializePaymentTransaction(normalizeOrderMoneyFields, transaction)
      })
    } catch (error) {
      handlePaymentServiceError(error, res, '处理支付回调失败')
    }
  })

  app.get('/api/wallet/withdraw/list', authRequired, authenticatedReadLimiter, async (req, res) => {
    try {
      const list = await paymentService.getUserWithdrawList({
        userId: req.auth.userId
      })
      res.json({
        list: list.map((item) => serializeWithdrawRequest(normalizeOrderMoneyFields, item))
      })
    } catch (error) {
      handlePaymentServiceError(error, res, '获取提现记录失败')
    }
  })

  app.post('/api/wallet/withdraw/apply', authRequired, authenticatedWriteLimiter, async (req, res) => {
    const amount = yuanToCent(req.body?.amount)
    const channel = String(req.body?.channel || 'bank').trim().toLowerCase() || 'bank'
    const accountName = String(req.body?.account_name || '').trim()
    const accountNo = String(req.body?.account_no || '').trim()
    const remark = String(req.body?.remark || '').trim()

    if (!amount || amount < 100) {
      return res.status(400).json({ message: '提现金额至少 1 元' })
    }

    try {
      const request = await paymentService.applyWithdraw({
        userId: req.auth.userId,
        amount,
        channel,
        accountName,
        accountNo,
        remark
      })
      res.status(201).json({
        withdraw_request: serializeWithdrawRequest(normalizeOrderMoneyFields, request)
      })
    } catch (error) {
      handlePaymentServiceError(error, res, '提交提现申请失败')
    }
  })

  app.get('/api/admin/withdraw-requests', authRequired, adminOnly, authenticatedReadLimiter, async (req, res) => {
    try {
      const list = await paymentService.getAdminWithdrawList({
        status: req.query?.status
      })
      res.json({
        list: list.map((item) => serializeWithdrawRequest(normalizeOrderMoneyFields, item))
      })
    } catch (error) {
      handlePaymentServiceError(error, res, '获取提现审核列表失败')
    }
  })

  app.post(
    '/api/admin/withdraw-requests/:id/review',
    authRequired,
    adminOnly,
    requireStepUpAuth(ADMIN_STEP_UP_POLICIES.reviewWithdraw),
    authenticatedWriteLimiter,
    async (req, res) => {
    const withdrawRequestId = Number(req.params?.id || 0)
    const action = String(req.body?.action || '').trim().toLowerCase()
    const remark = String(req.body?.remark || '').trim()

    if (!withdrawRequestId) {
      return res.status(400).json({ message: '提现申请ID无效' })
    }

    try {
      const request = await paymentService.reviewWithdraw({
        withdrawRequestId,
        adminUserId: req.auth.userId,
        action,
        remark
      })
      if (String(request.status || '').trim() === 'success') {
        await createUserNotificationSafely({
          userId: Number(request.user_id || 0),
          category: 'wallet',
          title: '提现成功',
          content: `你的提现申请 ${request.request_no} 已打款成功，到账金额为 ￥${normalizeAmount(normalizeOrderMoneyFields, request.net_amount)}。`,
          relatedType: 'withdraw',
          relatedId: Number(request.id || 0)
        })
      }
      res.json({
        withdraw_request: serializeWithdrawRequest(normalizeOrderMoneyFields, request)
      })
    } catch (error) {
      handlePaymentServiceError(error, res, '审核提现申请失败')
    }
    }
  )

  app.post('/api/pay/withdraw/callback/:channel', async (req, res) => {
    try {
      const request = await paymentService.handleWithdrawCallback({
        channel: req.params.channel,
        requestNo: req.body?.request_no,
        providerRequestId: req.body?.provider_request_id,
        status: req.body?.status,
        failureReason: req.body?.failure_reason,
        rawPayload: req.body || {}
      })
      if (String(request.status || '').trim() === 'success' && String(request.previous_status || '').trim() !== 'success') {
        await createUserNotificationSafely({
          userId: Number(request.user_id || 0),
          category: 'wallet',
          title: '提现成功',
          content: `你的提现申请 ${request.request_no} 已打款成功，到账金额为 ￥${normalizeAmount(normalizeOrderMoneyFields, request.net_amount)}。`,
          relatedType: 'withdraw',
          relatedId: Number(request.id || 0)
        })
      }
      res.json({
        success: true,
        withdraw_request: serializeWithdrawRequest(normalizeOrderMoneyFields, request)
      })
    } catch (error) {
      handlePaymentServiceError(error, res, '处理提现回调失败')
    }
  })
}
