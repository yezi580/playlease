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
      let balance = null
      if (account?.huifu_id) {
        const balResult = await paymentProvider.queryBalance({ huifuId: account.huifu_id })
        if (balResult.ok) {
          balance = balResult.avlBal || '0.00'
        }
      }
      res.json({
        settlement_account: serializeSettlementAccount(account),
        merchant_portal_url: String(huifuMerchantPortalUrl || '').trim(),
        balance
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

  app.post('/api/settlement-account/register', authRequired, authenticatedWriteLimiter, async (req, res) => {
    try {
      const name = String(req.body?.name || '').trim()
      const certNo = String(req.body?.cert_no || '').trim()
      const mobileNo = String(req.body?.mobile_no || '').trim()
      const certValidityType = String(req.body?.cert_validity_type || '0').trim()
      const certBeginDate = String(req.body?.cert_begin_date || '').trim()
      const certEndDate = String(req.body?.cert_end_date || '').trim()

      if (!name || !certNo || !mobileNo) {
        return res.status(400).json({ message: '姓名、身份证号、手机号不能为空' })
      }

      const result = await paymentProvider.registerPersonalUser({
        name,
        certType: '00',
        certNo,
        certValidityType,
        certBeginDate,
        certEndDate,
        mobileNo
      })

      if (!result.ok) {
        console.error('[huifu register] failed:', JSON.stringify(result, null, 2))
        return res.status(400).json({
          message: result.message || '汇付个人用户开户失败',
          reason: result.reason,
          resp_code: result.respCode,
          raw_response: result.rawResponse?.response_body || null
        })
      }

      const account = await paymentService.upsertSettlementAccount({
        userId: req.auth.userId,
        provider: 'huifu_cashier',
        accountType: 'person',
        bindStatus: 'pending',
        huifuId: result.huifuId,
        accountName: name,
        mobile: mobileNo,
        idCardMasked: certNo.length >= 14 ? certNo.slice(0, 6) + '****' + certNo.slice(-4) : certNo,
        remark: 'API自动开户'
      })

      res.json({
        settlement_account: serializeSettlementAccount(account),
        huifu_id: result.huifuId
      })
    } catch (error) {
      handlePaymentServiceError(error, res, '汇付个人用户开户失败')
    }
  })

  app.post('/api/settlement-account/bind-card', authRequired, authenticatedWriteLimiter, async (req, res) => {
    try {
      const existingAccount = await paymentService.getSettlementAccount({ userId: req.auth.userId })
      const huifuId = String(existingAccount?.huifu_id || '').trim()
      if (!huifuId) {
        return res.status(400).json({ message: '请先完成个人用户开户' })
      }

      const cardName = String(req.body?.card_name || '').trim()
      const cardNo = String(req.body?.card_no || '').trim()
      const provId = String(req.body?.prov_id || '').trim()
      const areaId = String(req.body?.area_id || '').trim()
      if (!cardName || !cardNo) {
        return res.status(400).json({ message: '持卡人姓名和银行卡号不能为空' })
      }

      const certNo = String(req.body?.cert_no || '').trim()
      const certValidityType = String(req.body?.cert_validity_type || '0').trim()
      const certBeginDate = String(req.body?.cert_begin_date || '').trim()
      const certEndDate = String(req.body?.cert_end_date || '').trim()
      const mobileNo = String(req.body?.mobile_no || '').trim()

      const result = await paymentProvider.openUserBusiness({
        huifuId,
        cardName,
        cardNo,
        provId,
        areaId,
        certNo,
        certValidityType,
        certBeginDate,
        certEndDate,
        mobileNo
      })

      if (!result.ok) {
        return res.status(400).json({
          message: result.message || '汇付用户业务入驻失败',
          reason: result.reason,
          resp_code: result.respCode
        })
      }

      const account = await paymentService.upsertSettlementAccount({
        userId: req.auth.userId,
        provider: 'huifu_cashier',
        accountType: 'person',
        bindStatus: 'active',
        huifuId,
        acctId: result.tokenNo || '',
        accountName: cardName,
        mobile: mobileNo || existingAccount?.mobile || '',
        idCardMasked: existingAccount?.id_card_masked || '',
        remark: 'API自动绑卡'
      })

      res.json({
        settlement_account: serializeSettlementAccount(account)
      })
    } catch (error) {
      handlePaymentServiceError(error, res, '汇付用户业务入驻失败')
    }
  })

  app.post('/api/settlement-account/encashment', authRequired, authenticatedWriteLimiter, async (req, res) => {
    try {
      const account = await paymentService.getSettlementAccount({ userId: req.auth.userId })
      const huifuId = String(account?.huifu_id || '').trim()
      const tokenNo = String(account?.acct_id || '').trim()
      if (!huifuId || !tokenNo) {
        return res.status(400).json({ message: '请先完成开户和绑卡' })
      }

      const cashAmt = Number(req.body?.cash_amt || 0)
      if (!cashAmt || cashAmt <= 0) {
        return res.status(400).json({ message: '取现金额必须大于0' })
      }
      const cashAmtStr = cashAmt.toFixed(2)

      const result = await paymentProvider.createEncashment({
        huifuId,
        tokenNo,
        cashAmt: cashAmtStr,
        intoAcctDateType: 'D1'
      })

      if (!result.ok) {
        console.error('[huifu encashment] failed:', JSON.stringify(result, null, 2))
        return res.status(400).json({
          message: result.message || '汇付取现失败',
          reason: result.reason,
          resp_code: result.respCode
        })
      }

      res.json({
        trans_stat: result.transStat,
        hf_seq_id: result.hfSeqId,
        req_seq_id: result.reqSeqId,
        cash_amt: cashAmtStr
      })
    } catch (error) {
      handlePaymentServiceError(error, res, '汇付取现失败')
    }
  })

  app.get('/api/settlement-account/query-huifu', authRequired, async (req, res) => {
    try {
      const account = await paymentService.getSettlementAccount({ userId: req.auth.userId })
      const huifuId = String(account?.huifu_id || '').trim()
      if (!huifuId) {
        return res.status(400).json({ message: '请先完成开户' })
      }
      const result = await paymentProvider.queryUserInfo({ huifuId })
      if (!result.ok) {
        return res.status(400).json({ message: result.message, reason: result.reason })
      }
      const data = result.data || {}
      let tokenNo = ''
      let cashCardList = data.qry_cash_card_info_list
      if (typeof cashCardList === 'string') {
        try { cashCardList = JSON.parse(cashCardList) } catch (_) { cashCardList = [] }
      }
      if (Array.isArray(cashCardList)) {
        for (const card of cashCardList) {
          if (card.token_no) { tokenNo = String(card.token_no).trim(); break }
        }
      }
      if (tokenNo && account.acct_id !== tokenNo) {
        await paymentService.upsertSettlementAccount({
          userId: req.auth.userId,
          provider: 'huifu_cashier',
          accountType: 'person',
          bindStatus: 'active',
          huifuId,
          acctId: tokenNo,
          accountName: account.account_name || '',
          mobile: account.mobile || '',
          idCardMasked: account.id_card_masked || '',
          remark: 'API查询补全token_no'
        })
      }
      res.json({ token_no: tokenNo, raw: data })
    } catch (error) {
      handlePaymentServiceError(error, res, '查询汇付用户信息失败')
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
