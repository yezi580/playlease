//- 作用：支付服务商适配层。
//- 当前支持站内模拟支付，以及汇付统一收银台跳转支付。

import crypto from 'crypto'

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value)
  } catch (_error) {
    return fallback
  }
}

function createUnsupportedPaymentProvider(providerName = 'unknown') {
  return {
    mode: providerName,
    async createPaymentOrder() {
      return {
        ok: false,
        provider: providerName,
        reason: 'provider_not_implemented',
        message: `支付服务商 ${providerName} 尚未接入`
      }
    },
    async queryPaymentOrder() {
      return {
        ok: false,
        provider: providerName,
        reason: 'provider_not_implemented',
        message: `支付服务商 ${providerName} 尚未接入主动查单能力`
      }
    },
    async closePaymentOrder() {
      return {
        ok: false,
        provider: providerName,
        reason: 'provider_not_implemented',
        message: `支付服务商 ${providerName} 尚未接入关单能力`
      }
    },
    async createWithdrawal() {
      return {
        ok: false,
        provider: providerName,
        reason: 'provider_not_implemented',
        message: `代付服务商 ${providerName} 尚未接入`
      }
    }
  }
}

function normalizePemKey(rawValue = '', keyType = 'PRIVATE KEY') {
  const normalizedValue = String(rawValue || '').trim()
  if (!normalizedValue) return ''
  if (normalizedValue.includes('BEGIN')) {
    return normalizedValue
  }
  const wrapped = normalizedValue.match(/.{1,64}/g)?.join('\n') || normalizedValue
  return `-----BEGIN ${keyType}-----\n${wrapped}\n-----END ${keyType}-----`
}

function sortObjectKeys(value = {}) {
  return Object.keys(value || {})
    .sort((left, right) => left.localeCompare(right))
    .reduce((result, key) => {
      const fieldValue = value[key]
      if (typeof fieldValue === 'undefined' || typeof fieldValue === 'function') {
        return result
      }
      result[key] = fieldValue
      return result
    }, {})
}

function stringifyHuifuData(value = {}) {
  return JSON.stringify(sortObjectKeys(value))
}

function signHuifuData(data = {}, privateKey = '') {
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(stringifyHuifuData(data), 'utf8')
  signer.end()
  return signer.sign(normalizePemKey(privateKey, 'PRIVATE KEY'), 'base64')
}

function verifyHuifuData(rawPayload = '', signature = '', publicKey = '', shouldSort = true) {
  const normalizedSignature = String(signature || '').trim()
  const normalizedPayload = typeof rawPayload === 'string'
    ? String(rawPayload || '').trim()
    : stringifyHuifuData(rawPayload)
  if (!normalizedSignature || !normalizedPayload || !publicKey) {
    return false
  }
  const verifier = crypto.createVerify('RSA-SHA256')
  verifier.update(shouldSort ? normalizedPayload : rawPayload, 'utf8')
  verifier.end()
  return verifier.verify(normalizePemKey(publicKey, 'PUBLIC KEY'), normalizedSignature, 'base64')
}

function toCentAmountYuanString(amount = 0) {
  return (Math.max(0, Number(amount || 0) || 0) / 100).toFixed(2)
}

function getReqDateFromTransactionNo(transactionNo = '') {
  const normalized = String(transactionNo || '').trim()
  const matched = normalized.match(/\d{8}/)
  return matched ? matched[0] : new Date().toISOString().slice(0, 10).replace(/-/g, '')
}

function isTruthyFlag(value, defaultValue = false) {
  if (typeof value === 'undefined' || value === null || value === '') return defaultValue
  return !['0', 'false', 'off', 'no'].includes(String(value).trim().toLowerCase())
}

function resolveAbsoluteUrl(url, fallbackBase = '') {
  const normalizedUrl = String(url || '').trim()
  if (!normalizedUrl) return ''
  if (/^https?:\/\//i.test(normalizedUrl)) {
    return normalizedUrl
  }
  const normalizedBase = String(fallbackBase || '').trim()
  if (!normalizedBase) return normalizedUrl
  try {
    return new URL(normalizedUrl, normalizedBase).toString()
  } catch (_error) {
    return normalizedUrl
  }
}

function buildReturnUrl(baseUrl = '', payload = {}) {
  const normalizedBaseUrl = String(baseUrl || '').trim()
  if (!normalizedBaseUrl) return ''
  try {
    const url = new URL(normalizedBaseUrl)
    url.searchParams.set('transactionNo', String(payload.transactionNo || '').trim())
    if (payload.orderId) {
      url.searchParams.set('orderId', String(payload.orderId))
    }
    return url.toString()
  } catch (_error) {
    const separator = normalizedBaseUrl.includes('?') ? '&' : '?'
    const transactionPart = `transactionNo=${encodeURIComponent(String(payload.transactionNo || '').trim())}`
    const orderIdPart = payload.orderId ? `&orderId=${encodeURIComponent(String(payload.orderId))}` : ''
    return `${normalizedBaseUrl}${separator}${transactionPart}${orderIdPart}`
  }
}

async function postHuifuJson(url, body = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  const rawText = await response.text()
  const parsed = safeJsonParse(rawText, null)
  return {
    ok: response.ok,
    status: response.status,
    body: parsed,
    rawText
  }
}

function normalizeHuifuPayStatus(value = '') {
  const normalized = String(value || '').trim().toUpperCase()
  if (normalized === 'S') return 'paid'
  if (normalized === 'F') return 'failed'
  if (normalized === 'C') return 'cancelled'
  return 'pending'
}

function createHuifuCashierProvider(config = {}) {
  const runtimeConfig = {
    sysId: String(config.huifuSysId || '').trim(),
    productId: String(config.huifuProductId || '').trim(),
    huifuId: String(config.huifuId || '').trim(),
    preOrderUrl: resolveAbsoluteUrl(config.huifuHostingPreOrderUrl, config.huifuGatewayUrl),
    notifyUrl: String(config.huifuNotifyUrl || '').trim(),
    returnUrl: String(config.huifuReturnUrl || '').trim(),
    appName: String(config.appName || 'my-app').trim() || 'my-app',
    defaultProjectTitle: String(config.huifuHostingProjectTitle || '统一收银台支付').trim() || '统一收银台支付',
    h5ProjectId: String(config.huifuHostingProjectIdH5 || '').trim(),
    pcProjectId: String(config.huifuHostingProjectIdPc || '').trim(),
    styleIdH5: String(config.huifuHostingStyleIdH5 || '').trim(),
    styleIdPc: String(config.huifuHostingStyleIdPc || '').trim(),
    merchantPrivateKey: String(config.huifuMerchantPrivateKey || '').trim(),
    huifuPublicKey: String(config.huifuPublicKey || '').trim(),
    verifyResponseSignature: isTruthyFlag(config.huifuVerifyResponseSignature, true)
  }

  function getConfigIssueList() {
    const issues = []
    if (!runtimeConfig.sysId) issues.push('缺少 HUIFU_SYS_ID')
    if (!runtimeConfig.productId) issues.push('缺少 HUIFU_PRODUCT_ID')
    if (!runtimeConfig.huifuId) issues.push('缺少 HUIFU_HUIFU_ID')
    if (!runtimeConfig.preOrderUrl) issues.push('缺少 HUIFU_HOSTING_PREORDER_URL')
    if (!runtimeConfig.merchantPrivateKey) issues.push('缺少 HUIFU_MERCHANT_PRIVATE_KEY')
    if (!runtimeConfig.h5ProjectId && !runtimeConfig.pcProjectId) {
      issues.push('缺少 HUIFU_HOSTING_PROJECT_ID_H5 或 HUIFU_HOSTING_PROJECT_ID_PC')
    }
    if (runtimeConfig.verifyResponseSignature && !runtimeConfig.huifuPublicKey) {
      issues.push('缺少 HUIFU_PUBLIC_KEY')
    }
    return issues
  }

  function getSceneConfig(payload = {}) {
    const scene = String(payload.scene || '').trim().toLowerCase() === 'h5' ? 'h5' : 'pc'
    if (scene === 'h5') {
      return {
        scene,
        projectId: runtimeConfig.h5ProjectId || runtimeConfig.pcProjectId,
        styleId: runtimeConfig.styleIdH5 || runtimeConfig.styleIdPc
      }
    }
    return {
      scene,
      projectId: runtimeConfig.pcProjectId || runtimeConfig.h5ProjectId,
      styleId: runtimeConfig.styleIdPc || runtimeConfig.styleIdH5
    }
  }

  function buildBusinessData(payload = {}) {
    const sceneConfig = getSceneConfig(payload)
    const callbackUrl = buildReturnUrl(payload.returnUrl || runtimeConfig.returnUrl, payload)
    const hostingData = {
      scene: sceneConfig.scene,
      project_id: sceneConfig.projectId,
      project_title: runtimeConfig.defaultProjectTitle,
      order_id: String(payload.orderId || ''),
      payer_user_id: String(payload.payerUserId || '')
    }
    if (callbackUrl) {
      hostingData.callback_url = callbackUrl
    }
    if (sceneConfig.styleId) {
      hostingData.style_id = sceneConfig.styleId
    }

    const businessData = {
      req_date: getReqDateFromTransactionNo(payload.transactionNo),
      req_seq_id: String(payload.transactionNo || '').trim(),
      huifu_id: runtimeConfig.huifuId,
      trans_amt: toCentAmountYuanString(payload.amount),
      goods_desc: String(payload.subject || payload.transactionNo || `${runtimeConfig.appName}支付订单`).trim().slice(0, 128),
      pre_order_type: '1',
      hosting_data: JSON.stringify(hostingData)
    }
    if (runtimeConfig.notifyUrl) {
      businessData.notify_url = runtimeConfig.notifyUrl
    }
    return {
      sceneConfig,
      businessData,
      callbackUrl
    }
  }

  async function createPaymentOrder(payload = {}) {
    const issues = getConfigIssueList()
    if (issues.length) {
      return {
        ok: false,
        provider: 'huifu_cashier',
        reason: 'config_incomplete',
        message: `汇付统一收银台配置不完整：${issues.join('；')}`
      }
    }

    const { sceneConfig, businessData, callbackUrl } = buildBusinessData(payload)
    if (!sceneConfig.projectId) {
      return {
        ok: false,
        provider: 'huifu_cashier',
        reason: 'project_id_missing',
        message: `未找到 ${sceneConfig.scene.toUpperCase()} 场景对应的托管项目号`
      }
    }

    let requestBody
    try {
      requestBody = {
        sys_id: runtimeConfig.sysId,
        product_id: runtimeConfig.productId,
        data: businessData,
        sign: signHuifuData(businessData, runtimeConfig.merchantPrivateKey)
      }
    } catch (error) {
      return {
        ok: false,
        provider: 'huifu_cashier',
        reason: 'sign_failed',
        message: `汇付请求签名失败：${error.message || '未知错误'}`
      }
    }

    try {
      const response = await postHuifuJson(runtimeConfig.preOrderUrl, requestBody)
      const responseBody = response.body || safeJsonParse(response.rawText, {}) || {}
      const responseDataRaw = typeof responseBody.data === 'undefined' ? responseBody.resp_data : responseBody.data
      const responseData = typeof responseDataRaw === 'string'
        ? safeJsonParse(responseDataRaw, null)
        : responseDataRaw

      if (!response.ok) {
        return {
          ok: false,
          provider: 'huifu_cashier',
          reason: 'http_error',
          message: responseBody?.resp_desc || responseBody?.message || `汇付下单请求失败（HTTP ${response.status}）`,
          rawResponse: responseBody || response.rawText
        }
      }

      if (runtimeConfig.verifyResponseSignature && responseBody?.sign && responseDataRaw) {
        const verified = verifyHuifuData(
          typeof responseDataRaw === 'string' ? responseDataRaw : responseData,
          responseBody.sign,
          runtimeConfig.huifuPublicKey,
          typeof responseDataRaw !== 'string'
        )
        if (!verified) {
          return {
            ok: false,
            provider: 'huifu_cashier',
            reason: 'invalid_signature',
            message: '汇付同步返回验签失败',
            rawResponse: responseBody
          }
        }
      }

      const respCode = String(responseBody?.resp_code || responseData?.resp_code || responseData?.sub_resp_code || '').trim()
      const success = ['00000000', '10000'].includes(respCode) || Boolean(responseData?.jump_url)
      if (!success) {
        return {
          ok: false,
          provider: 'huifu_cashier',
          reason: 'provider_rejected',
          message: responseBody?.resp_desc || responseData?.resp_desc || responseData?.sub_resp_desc || '汇付收银台下单失败',
          rawResponse: responseBody
        }
      }

      const jumpUrl = String(responseData?.jump_url || responseBody?.jump_url || '').trim()
      if (!jumpUrl) {
        return {
          ok: false,
          provider: 'huifu_cashier',
          reason: 'missing_jump_url',
          message: '汇付已受理下单，但未返回收银台跳转地址',
          rawResponse: responseBody
        }
      }

      return {
        ok: true,
        provider: 'huifu_cashier',
        channel: String(payload.channel || '').trim().toLowerCase() || `huifu_${sceneConfig.scene}_cashier`,
        transactionNo: String(payload.transactionNo || '').trim(),
        providerTradeNo: String(
          responseData?.hf_seq_id || responseData?.out_ord_id || responseData?.party_order_id || responseData?.bank_order_no || ''
        ).trim(),
        status: 'pending',
        expiresAt: responseData?.time_expire || responseData?.expires_at || null,
        jumpUrl,
        callbackUrl,
        cashierType: 'redirect',
        rawResponse: responseBody
      }
    } catch (error) {
      return {
        ok: false,
        provider: 'huifu_cashier',
        reason: 'network_error',
        message: `请求汇付统一收银台失败：${error.message || '网络异常'}`
      }
    }
  }

  async function parsePaymentCallback(payload = {}) {
    const body = payload.body || {}
    const sign = String(body.sign || '').trim()
    const rawData = typeof body.resp_data === 'string'
      ? body.resp_data
      : (typeof body.data === 'string' ? body.data : '')
    if (!rawData) {
      return null
    }
    if (runtimeConfig.verifyResponseSignature) {
      const verified = verifyHuifuData(rawData, sign, runtimeConfig.huifuPublicKey, false)
      if (!verified) {
        throw new Error('汇付异步通知验签失败')
      }
    }
    const callbackData = safeJsonParse(rawData, null)
    if (!callbackData) {
      throw new Error('汇付异步通知数据格式不正确')
    }

    const transactionNo = String(callbackData.req_seq_id || callbackData.mer_ord_id || '').trim()
    return {
      channel: String(payload.channel || 'huifu').trim().toLowerCase() || 'huifu',
      transactionNo,
      providerTradeNo: String(
        callbackData.hf_seq_id || callbackData.out_ord_id || callbackData.party_order_id || callbackData.bank_order_no || ''
      ).trim(),
      status: normalizeHuifuPayStatus(callbackData.trans_stat),
      rawPayload: {
        ...body,
        parsed_data: callbackData
      },
      callbackResponseText: `RECV_ORD_ID_${transactionNo || callbackData.req_seq_id || callbackData.hf_seq_id || 'UNKNOWN'}`
    }
  }

  return {
    mode: 'huifu_cashier',
    async createPaymentOrder(payload = {}) {
      return createPaymentOrder(payload)
    },
    async createWithdrawal() {
      return {
        ok: false,
        provider: 'huifu_cashier',
        reason: 'provider_not_implemented',
        message: '汇付统一收银台暂未接入代付能力'
      }
    },
    async queryPaymentOrder(payload = {}) {
      const transactionNo = String(payload.transactionNo || '').trim()
      return {
        ok: false,
        provider: 'huifu_cashier',
        reason: 'provider_not_implemented',
        message: transactionNo
          ? `汇付统一收银台主动查单能力待补充（交易号 ${transactionNo}）`
          : '汇付统一收银台主动查单能力待补充'
      }
    },
    async closePaymentOrder() {
      return {
        ok: false,
        provider: 'huifu_cashier',
        reason: 'provider_not_implemented',
        message: '汇付统一收银台关单能力待补充'
      }
    },
    async parsePaymentCallback(payload = {}) {
      return parsePaymentCallback(payload)
    }
  }
}

function createMockPaymentProvider(config = {}) {
  const autoSuccessDelaySeconds = Math.max(0, Number(config.mockPaymentAutoSuccessSeconds ?? 3) || 3)
  const paymentExpiresMinutes = Math.max(1, Number(config.mockPaymentExpiresMinutes ?? 15) || 15)
  const withdrawImmediateSuccess = !['0', 'false', 'off', 'no'].includes(
    String(config.mockWithdrawImmediateSuccess ?? 'true').trim().toLowerCase()
  )
  const paymentTransactions = new Map()

  function createMockBusinessNo(prefix = 'MOCK') {
    return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 8)}`.toUpperCase()
  }

  function buildMockCodeUrl(transactionNo) {
    return `mockpay://pay/${encodeURIComponent(transactionNo)}`
  }

  function resolveMockTransactionStatus(record) {
    if (!record) return 'pending'
    if (['paid', 'cancelled', 'failed'].includes(String(record.status || '').trim())) {
      return record.status
    }
    if (record.expiresAt instanceof Date && record.expiresAt.getTime() <= Date.now()) {
      record.status = 'cancelled'
      return record.status
    }
    if (autoSuccessDelaySeconds === 0 || Date.now() - record.createdAt.getTime() >= autoSuccessDelaySeconds * 1000) {
      record.status = 'paid'
      record.providerTradeNo = record.providerTradeNo || createMockBusinessNo('MTP')
      return record.status
    }
    return 'pending'
  }

  return {
    mode: 'mock_payment',
    async createPaymentOrder(payload = {}) {
      const channel = String(payload.channel || 'online').trim().toLowerCase() || 'online'
      const transactionNo = String(payload.transactionNo || '').trim()
      const amount = Math.max(0, Number(payload.amount || 0) || 0)
      const subject = String(payload.subject || transactionNo || '模拟支付订单').trim() || transactionNo
      const expiresAt = new Date(Date.now() + paymentExpiresMinutes * 60 * 1000)
      const record = {
        transactionNo,
        channel,
        amount,
        subject,
        createdAt: new Date(),
        expiresAt,
        status: 'pending',
        providerTradeNo: ''
      }
      paymentTransactions.set(transactionNo, record)

      return {
        ok: true,
        provider: 'mock_payment',
        channel,
        transactionNo,
        providerTradeNo: '',
        status: 'pending',
        amount,
        expiresAt,
        codeUrl: buildMockCodeUrl(transactionNo),
        cashierType: 'mock_qrcode',
        rawResponse: {
          mock: true,
          codeUrl: buildMockCodeUrl(transactionNo),
          cashierType: 'mock_qrcode',
          expiresAt: expiresAt.toISOString(),
          autoSuccessDelaySeconds,
          message: autoSuccessDelaySeconds > 0
            ? `演示环境：支付码展示后约 ${autoSuccessDelaySeconds} 秒自动支付成功`
            : '演示环境：支付码展示后立即支付成功'
        }
      }
    },
    async queryPaymentOrder(payload = {}) {
      const transactionNo = String(payload.transactionNo || '').trim()
      if (!transactionNo) {
        return {
          ok: false,
          provider: 'mock_payment',
          reason: 'invalid_transaction_no',
          message: '支付流水号不能为空'
        }
      }

      const record = paymentTransactions.get(transactionNo)
      if (!record) {
        return {
          ok: false,
          provider: 'mock_payment',
          reason: 'transaction_not_found',
          message: '模拟支付流水不存在'
        }
      }

      const status = resolveMockTransactionStatus(record)
      return {
        ok: true,
        provider: 'mock_payment',
        transactionNo,
        providerTradeNo: record.providerTradeNo || '',
        status,
        rawResponse: {
          mock: true,
          transactionNo,
          status,
          channel: record.channel,
          autoSuccessDelaySeconds,
          expiresAt: record.expiresAt.toISOString()
        }
      }
    },
    async closePaymentOrder(payload = {}) {
      const transactionNo = String(payload.transactionNo || '').trim()
      if (!transactionNo) {
        return {
          ok: false,
          provider: 'mock_payment',
          reason: 'invalid_transaction_no',
          message: '支付流水号不能为空'
        }
      }

      const record = paymentTransactions.get(transactionNo)
      if (!record) {
        return {
          ok: false,
          provider: 'mock_payment',
          reason: 'transaction_not_found',
          message: '模拟支付流水不存在'
        }
      }

      const status = resolveMockTransactionStatus(record)
      if (status === 'paid') {
        return {
          ok: true,
          provider: 'mock_payment',
          transactionNo,
          providerTradeNo: record.providerTradeNo || '',
          status: 'paid',
          rawResponse: {
            mock: true,
            transactionNo,
            status: 'paid'
          }
        }
      }

      record.status = 'cancelled'
      return {
        ok: true,
        provider: 'mock_payment',
        transactionNo,
        providerTradeNo: '',
        status: 'cancelled',
        rawResponse: {
          mock: true,
          transactionNo,
          status: 'cancelled'
        }
      }
    },
    async createWithdrawal(payload = {}) {
      const requestNo = String(payload.requestNo || '').trim()
      const status = withdrawImmediateSuccess ? 'success' : 'processing'
      return {
        ok: true,
        provider: 'mock_payment',
        requestNo,
        providerRequestId: createMockBusinessNo('MWD'),
        status,
        rawResponse: {
          mock: true,
          requestNo,
          status,
          channel: String(payload.channel || 'bank').trim().toLowerCase() || 'bank',
          message: withdrawImmediateSuccess
            ? '演示环境：提现审核通过后立即标记成功'
            : '演示环境：提现审核通过后进入处理中'
        }
      }
    }
  }
}

function createProviderByName(providerName = 'mock_payment', config = {}, _scene = 'payment') {
  const normalizedProviderName = String(providerName || 'mock_payment').trim().toLowerCase() || 'mock_payment'
  if (['mock_payment', 'mock', 'fake_payment', 'demo_payment'].includes(normalizedProviderName)) {
    return createMockPaymentProvider(config)
  }
  if (['huifu', 'huifu_cashier', 'huifu_hosting'].includes(normalizedProviderName)) {
    return createHuifuCashierProvider(config)
  }
  return createUnsupportedPaymentProvider(normalizedProviderName)
}

export function createPaymentProvider(config = {}) {
  const paymentProviderName = String(config.paymentProvider || config.provider || 'mock_payment').trim().toLowerCase() || 'mock_payment'
  const withdrawProviderName = String(config.withdrawProvider || paymentProviderName).trim().toLowerCase() || paymentProviderName
  const paymentProvider = createProviderByName(paymentProviderName, config, 'payment')
  const withdrawProvider = createProviderByName(withdrawProviderName, config, 'withdraw')

  return {
    mode: paymentProvider.mode,
    paymentMode: paymentProvider.mode,
    withdrawMode: withdrawProvider.mode,
    async createPaymentOrder(payload = {}) {
      return paymentProvider.createPaymentOrder(payload)
    },
    async createWithdrawal(payload = {}) {
      return withdrawProvider.createWithdrawal(payload)
    },
    async queryPaymentOrder(payload = {}) {
      if (typeof paymentProvider.queryPaymentOrder !== 'function') {
        return {
          ok: false,
          provider: paymentProvider.mode || 'unknown',
          reason: 'provider_not_implemented',
          message: `支付服务商 ${paymentProvider.mode || 'unknown'} 尚未接入主动查单能力`
        }
      }
      return paymentProvider.queryPaymentOrder(payload)
    },
    async closePaymentOrder(payload = {}) {
      if (typeof paymentProvider.closePaymentOrder !== 'function') {
        return {
          ok: false,
          provider: paymentProvider.mode || 'unknown',
          reason: 'provider_not_implemented',
          message: `支付服务商 ${paymentProvider.mode || 'unknown'} 尚未接入关单能力`
        }
      }
      return paymentProvider.closePaymentOrder(payload)
    },
    async parsePaymentCallback(payload = {}) {
      if (typeof paymentProvider.parsePaymentCallback !== 'function') {
        return null
      }
      return paymentProvider.parsePaymentCallback(payload)
    }
  }
}
