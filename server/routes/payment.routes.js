import { PaymentServiceError } from '../modules/payment/payment.service.js'

async function recordAdminOperationSafely(pool, payload = {}) {
  if (!pool) return
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
        payload.operatorUserId || null,
        payload.operatorName || null,
        payload.module || null,
        payload.action || null,
        payload.targetType || null,
        payload.targetId || null,
        payload.targetLabel || null,
        payload.beforeSnapshot ? JSON.stringify(payload.beforeSnapshot) : null,
        payload.afterSnapshot ? JSON.stringify(payload.afterSnapshot) : null,
        payload.remark || null
      ]
    )
  } catch (error) {
    console.error('[payment] record admin operation log failed', error)
  }
}

async function getWithdrawRequestSnapshotById(pool, withdrawRequestId) {
  const safeWithdrawRequestId = Number(withdrawRequestId || 0)
  if (!pool || !safeWithdrawRequestId) return null
  const [rows] = await pool.execute(
    `SELECT
        wr.id,
        wr.request_no,
        wr.user_id,
        u.username,
        u.phone,
        wr.channel,
        wr.provider,
        wr.amount,
        wr.fee_amount,
        wr.net_amount,
        wr.status,
        wr.account_name,
        wr.account_no_masked,
        wr.provider_request_id,
        wr.remark,
        wr.failure_reason,
        wr.reviewed_by_user_id,
        wr.reviewed_at,
        wr.paid_at,
        wr.created_at,
        wr.updated_at
     FROM wallet_withdraw_requests wr
     JOIN users u ON u.id = wr.user_id
     WHERE wr.id = ?
     LIMIT 1`,
    [safeWithdrawRequestId]
  )
  return rows[0] || null
}

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
    pool,
    authRequired,
    adminOnly,
    requireStepUpAuth,
    ADMIN_STEP_UP_POLICIES,
    authenticatedReadLimiter,
    authenticatedWriteLimiter,
    orderWriteLimiter,
    normalizeOrderMoneyFields,
    paymentProvider,
    paymentService,
    yuanToCent,
    createUserNotificationSafely
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
        settlement_account: serializeSettlementAccount(account)
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
      const beforeSnapshot = await getWithdrawRequestSnapshotById(pool, withdrawRequestId)
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
      await recordAdminOperationSafely(pool, {
        operatorUserId: req.auth?.userId,
        operatorName: req.auth?.username,
        module: 'wallet',
        action: action === 'approve' ? 'approve_withdraw' : 'reject_withdraw',
        targetType: 'withdraw',
        targetId: Number(request.id || withdrawRequestId || 0),
        targetLabel: `${request.request_no || `提现申请 #${withdrawRequestId}`}`,
        beforeSnapshot,
        afterSnapshot: request,
        remark: remark || (action === 'approve' ? '审核通过提现申请' : '驳回提现申请')
      })
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
