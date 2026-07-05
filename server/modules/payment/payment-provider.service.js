//- 作用：支付服务商适配层。
//- 当前仅保留站内模拟支付与模拟代付，真实微信支付已停用。

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
