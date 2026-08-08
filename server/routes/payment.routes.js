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
  const providerPayload = row.provider_payload || null
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
    cashier_type: providerPayload?.cashierType || providerPayload?.cashier_type || '',
    jump_url: providerPayload?.jumpUrl || providerPayload?.jump_url || '',
    callback_url: providerPayload?.callbackUrl || providerPayload?.callback_url || '',
    provider_payload: providerPayload
  }
}

function serializeSettlementAccount(row) {
  if (!row) return null
  return {
    user_id: row.user_id,
    provider: row.provider || '',
    account_type: row.account_type || 'person',
    bind_status: row.bind_status || 'unbound',
    huifu_id: row.huifu_id || '',
    acct_id: row.acct_id || '',
    account_name: row.account_name || '',
    mobile: row.mobile || '',
    id_card_masked: row.id_card_masked || '',
    remark: row.remark || '',
    last_verified_at: row.last_verified_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  }
}

function serializeSettlementPayout(normalizeOrderMoneyFields, row) {
  if (!row) return null
  return {
    id: row.id,
    payout_no: row.payout_no,
    order_id: row.order_id,
    payee_user_id: row.payee_user_id,
    provider: row.provider || '',
    status: row.status || 'pending',
    amount: normalizeAmount(normalizeOrderMoneyFields, row.amount),
    account_name: row.account_name || '',
    payee_huifu_id: row.payee_huifu_id || '',
    payee_acct_id: row.payee_acct_id || '',
    provider_request_id: row.provider_request_id || '',
    remark: row.remark || '',
    failure_reason: row.failure_reason || '',
    completed_at: row.completed_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    provider_payload: row.provider_payload || null
  }
}

export function registerPaymentRoutes(deps) {
  const {
    app,
    authRequired,
    authenticatedReadLimiter,
    authenticatedWriteLimiter,
    orderWriteLimiter,
    normalizeOrderMoneyFields,
    paymentProvider,
    paymentService,
    huifuMerchantPortalUrl
  } = deps

  app.post('/api/pay/create', authRequired, orderWriteLimiter, async (req, res) => {
    const orderId = Number(req.body?.order_id || 0)
    const channel = String(req.body?.channel || 'online').trim().toLowerCase() || 'online'
    const scene = String(req.body?.scene || '').trim().toLowerCase()
    const returnUrl = String(req.body?.return_url || req.body?.return_url_base || '').trim()

    if (!orderId) {
      return res.status(400).json({ message: '订单ID无效' })
    }

    try {
      const transaction = await paymentService.createOrderPayment({
        orderId,
        userId: req.auth.userId,
        channel,
        scene,
        returnUrl
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
      const parsedCallback = typeof paymentProvider?.parsePaymentCallback === 'function'
        ? await paymentProvider.parsePaymentCallback({
          channel,
          headers: req.headers || {},
          body: req.body || {},
          rawBody: req.rawBody || ''
        })
        : null
      const callbackPayload = parsedCallback || {
        channel,
        transactionNo: req.body?.transaction_no,
        providerTradeNo: req.body?.provider_trade_no,
        status: req.body?.status,
        rawPayload: req.body || {}
      }
      const transaction = await paymentService.handlePaymentCallback(callbackPayload)
      if (parsedCallback?.callbackResponseText) {
        return res.type('text/plain').send(parsedCallback.callbackResponseText)
      }
      return res.json({
        success: true,
        transaction: serializePaymentTransaction(normalizeOrderMoneyFields, transaction)
      })
    } catch (error) {
      handlePaymentServiceError(error, res, '处理支付回调失败')
    }
  })

  app.get('/api/settlement-account', authRequired, authenticatedReadLimiter, async (req, res) => {
    try {
      const account = await paymentService.getSettlementAccount({
        userId: req.auth.userId
      })
      res.json({
        settlement_account: serializeSettlementAccount(account),
        merchant_portal_url: String(huifuMerchantPortalUrl || '').trim()
      })
    } catch (error) {
      handlePaymentServiceError(error, res, '获取收款账号配置失败')
    }
  })

  app.put('/api/settlement-account', authRequired, authenticatedWriteLimiter, async (req, res) => {
    try {
      const account = await paymentService.upsertSettlementAccount({
        userId: req.auth.userId,
        provider: req.body?.provider,
        accountType: req.body?.account_type,
        bindStatus: req.body?.bind_status,
        huifuId: req.body?.huifu_id,
        acctId: req.body?.acct_id,
        accountName: req.body?.account_name,
        mobile: req.body?.mobile,
        idCardMasked: req.body?.id_card_masked,
        remark: req.body?.remark
      })
      res.json({
        settlement_account: serializeSettlementAccount(account)
      })
    } catch (error) {
      handlePaymentServiceError(error, res, '保存收款账号配置失败')
    }
  })

  app.get('/api/settlement/payouts', authRequired, authenticatedReadLimiter, async (req, res) => {
    try {
      const list = await paymentService.getUserSettlementPayoutList({
        userId: req.auth.userId
      })
      res.json({
        list: list.map((item) => serializeSettlementPayout(normalizeOrderMoneyFields, item))
      })
    } catch (error) {
      handlePaymentServiceError(error, res, '获取结算打款记录失败')
    }
  })
}
