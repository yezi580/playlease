//- 作用：短信服务商适配层。
//- 当前仅支持腾讯云短信，业务层统一走 sendVerificationCode / sendNotification 即可。

// 通知类短信场景（非验证码）：模板参数由业务侧直接给定，配置了对应模板 ID 才会启用
const NOTIFICATION_TEMPLATE_ENV_MAP = Object.freeze({
  seller_order_paid: 'TENCENT_SMS_TEMPLATE_ID_SELLER_ORDER_PAID'
})

function createProviderMessageId(prefix = 'sms') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function readPositiveIntEnv(name, fallback) {
  const rawValue = String(process.env[name] || '').trim()
  if (!rawValue) return fallback
  const parsedValue = Number(rawValue)
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return fallback
  }
  return Math.round(parsedValue)
}

function readBooleanLikeEnv(value, fallback = false) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return fallback
  return ['1', 'true', 'yes', 'on'].includes(normalized)
}

function normalizePhoneNumberToE164(phone = '') {
  const normalized = String(phone || '').trim()
  if (!normalized) return ''
  if (normalized.startsWith('+')) return normalized
  if (/^1[3-9]\d{9}$/.test(normalized)) {
    return `+86${normalized}`
  }
  return normalized
}

function buildSessionContext(payload = {}, appName = 'my-app') {
  const context = {
    app: String(appName || 'my-app').trim() || 'my-app',
    scene: String(payload.scene || 'login').trim() || 'login',
    phone: String(payload.phone || '').trim(),
    traceId: createProviderMessageId('smsctx')
  }
  const serialized = JSON.stringify(context)
  return serialized.length <= 512 ? serialized : serialized.slice(0, 512)
}

function normalizeSmsScene(scene = 'login') {
  const normalizedScene = String(scene || 'login').trim().toLowerCase()
  const sceneAliasMap = {
    login: 'login',
    signin: 'login',
    sign_in: 'login',
    register: 'register',
    signup: 'register',
    sign_up: 'register',
    reset_password: 'reset_password',
    resetpassword: 'reset_password',
    forgot_password: 'reset_password',
    forgotpassword: 'reset_password',
    admin_passkey_register: 'admin_passkey_register',
    passkey_register: 'admin_passkey_register',
    adminpasskeyregister: 'admin_passkey_register',
    admin_login: 'login'
  }
  return sceneAliasMap[normalizedScene] || 'login'
}

function resolveTencentTemplateId(scene = 'login', config = {}) {
  const normalizedScene = normalizeSmsScene(scene)
  const defaultTemplateId = String(config.defaultTemplateId || process.env.TENCENT_SMS_TEMPLATE_ID_DEFAULT || '').trim()
  const sceneTemplateMap = {
    login: String(config.loginTemplateId || process.env.TENCENT_SMS_TEMPLATE_ID_LOGIN || defaultTemplateId).trim(),
    register: String(
      config.registerTemplateId ||
      process.env.TENCENT_SMS_TEMPLATE_ID_REGISTER ||
      defaultTemplateId
    ).trim(),
    reset_password: String(
      config.resetPasswordTemplateId ||
      process.env.TENCENT_SMS_TEMPLATE_ID_RESET_PASSWORD ||
      defaultTemplateId
    ).trim(),
    admin_passkey_register: String(
      config.adminPasskeyRegisterTemplateId ||
      process.env.TENCENT_SMS_TEMPLATE_ID_ADMIN_PASSKEY_REGISTER ||
      defaultTemplateId
    ).trim()
  }
  return sceneTemplateMap[normalizedScene] || ''
}

function buildTencentTemplateParams(payload = {}) {
  const scene = normalizeSmsScene(payload.scene)
  const code = String(payload.code || '').trim()
  const ttlSeconds = readPositiveIntEnv('SMS_CODE_TTL_SECONDS', Number(payload.ttlSeconds || 300) || 300)
  const ttlMinutes = String(Math.max(1, Math.ceil(ttlSeconds / 60)))

  if (scene === 'login') {
    return [code, ttlMinutes]
  }
  return [code]
}

function createUnsupportedSmsProvider(providerName = 'unknown') {
  return {
    mode: providerName,
    isEnabled: false,
    async sendVerificationCode() {
      return {
        ok: false,
        provider: providerName,
        reason: 'provider_not_implemented',
        message: `短信服务商 ${providerName} 尚未接入，目前仅支持腾讯云短信`
      }
    },
    async sendNotification() {
      return {
        ok: false,
        provider: providerName,
        reason: 'provider_not_implemented',
        message: `短信服务商 ${providerName} 尚未接入，目前仅支持腾讯云短信`
      }
    }
  }
}

function createTencentSmsProvider(config = {}) {
  const appName = String(config.appName || 'my-app').trim() || 'my-app'
  const secretId = String(config.secretId || process.env.TENCENT_SMS_SECRET_ID || '').trim()
  const secretKey = String(config.secretKey || process.env.TENCENT_SMS_SECRET_KEY || '').trim()
  const smsSdkAppId = String(config.smsSdkAppId || process.env.TENCENT_SMS_SDK_APP_ID || '').trim()
  const signName = String(config.signName || process.env.TENCENT_SMS_SIGN_NAME || '').trim()
  const endpoint = String(config.endpoint || process.env.TENCENT_SMS_ENDPOINT || 'sms.tencentcloudapi.com').trim() || 'sms.tencentcloudapi.com'
  const region = String(config.region || process.env.TENCENT_SMS_REGION || 'ap-guangzhou').trim() || 'ap-guangzhou'
  const reqTimeout = readPositiveIntEnv('TENCENT_SMS_TIMEOUT_SECONDS', 10)
  const extendCode = String(config.extendCode || process.env.TENCENT_SMS_EXTEND_CODE || '').trim()
  const senderId = String(config.senderId || process.env.TENCENT_SMS_SENDER_ID || '').trim()
  const isConfigured = Boolean(secretId && secretKey && smsSdkAppId && signName)
  const strictStartupCheck = readBooleanLikeEnv(process.env.SMS_PROVIDER_STRICT_STARTUP_CHECK, false)
  let cachedClient = null

  async function getClient() {
    if (cachedClient) return cachedClient
    const tencentcloudModule = await import('tencentcloud-sdk-nodejs-sms')
    const tencentcloud = tencentcloudModule.default || tencentcloudModule
    const SmsClient = tencentcloud?.sms?.v20210111?.Client
    if (typeof SmsClient !== 'function') {
      throw new Error('腾讯云短信 SDK 加载失败')
    }

    cachedClient = new SmsClient({
      credential: {
        secretId,
        secretKey
      },
      region,
      profile: {
        signMethod: 'TC3-HMAC-SHA256',
        httpProfile: {
          reqMethod: 'POST',
          reqTimeout,
          endpoint
        }
      }
    })
    return cachedClient
  }

  // 腾讯云发送核心：验证码与通知短信共用，只差模板 ID 与参数集
  async function sendTencentSms({ phone, templateId, templateParamSet, scene, sessionContext }) {
    const client = await getClient()
    const requestPayload = {
      SmsSdkAppId: smsSdkAppId,
      SignName: signName,
      TemplateId: templateId,
      TemplateParamSet: templateParamSet,
      PhoneNumberSet: [normalizePhoneNumberToE164(phone)],
      SessionContext: sessionContext || buildSessionContext({ scene }, appName)
    }
    if (extendCode) {
      requestPayload.ExtendCode = extendCode
    }
    if (senderId) {
      requestPayload.SenderId = senderId
    }

    const response = await client.SendSms(requestPayload)
    const sendStatus = Array.isArray(response?.SendStatusSet) ? response.SendStatusSet[0] : null
    const sendCode = String(sendStatus?.Code || '').trim()
    const sendMessage = String(sendStatus?.Message || '').trim()
    const isAccepted = sendCode === 'Ok'
    return { response, sendStatus, sendCode, sendMessage, isAccepted }
  }

  return {
    mode: 'tencent',
    isEnabled: isConfigured,
    getRuntimeConfig() {
      const templateIds = {
        default: String(config.defaultTemplateId || process.env.TENCENT_SMS_TEMPLATE_ID_DEFAULT || '').trim(),
        login: String(config.loginTemplateId || process.env.TENCENT_SMS_TEMPLATE_ID_LOGIN || '').trim(),
        register: String(config.registerTemplateId || process.env.TENCENT_SMS_TEMPLATE_ID_REGISTER || '').trim(),
        resetPassword: String(config.resetPasswordTemplateId || process.env.TENCENT_SMS_TEMPLATE_ID_RESET_PASSWORD || '').trim(),
        adminPasskeyRegister: String(config.adminPasskeyRegisterTemplateId || process.env.TENCENT_SMS_TEMPLATE_ID_ADMIN_PASSKEY_REGISTER || '').trim(),
        sellerOrderPaid: String(process.env[NOTIFICATION_TEMPLATE_ENV_MAP.seller_order_paid] || '').trim()
      }
      const configIssues = []
      if (!secretId) configIssues.push('缺少 TENCENT_SMS_SECRET_ID')
      if (!secretKey) configIssues.push('缺少 TENCENT_SMS_SECRET_KEY')
      if (!smsSdkAppId) configIssues.push('缺少 TENCENT_SMS_SDK_APP_ID')
      if (!signName) configIssues.push('缺少 TENCENT_SMS_SIGN_NAME')
      if (!(templateIds.default || templateIds.login)) configIssues.push('缺少登录短信模板 ID')
      if (!(templateIds.default || templateIds.adminPasskeyRegister)) configIssues.push('缺少管理员 Passkey 绑定短信模板 ID')
      return {
        enabled: isConfigured,
        provider: 'tencent',
        endpoint,
        region,
        smsSdkAppId,
        signName,
        strictStartupCheck,
        hasSecretId: Boolean(secretId),
        hasSecretKey: Boolean(secretKey),
        templateIds,
        configIssues
      }
    },
    async sendVerificationCode(payload = {}) {
      const scene = normalizeSmsScene(payload.scene)
      const phone = String(payload.phone || '').trim()
      const templateId = resolveTencentTemplateId(scene, config)
      const templateParamSet = buildTencentTemplateParams(payload)

      if (!isConfigured) {
        return {
          ok: false,
          provider: 'tencent',
          reason: 'provider_not_configured',
          message: '腾讯云短信配置不完整，请检查 SecretId、SecretKey、SmsSdkAppId、SignName'
        }
      }
      if (!templateId) {
        return {
          ok: false,
          provider: 'tencent',
          reason: 'template_not_configured',
          message: `未配置场景 ${scene} 对应的腾讯云短信模板 ID`
        }
      }

      try {
        const { response, sendStatus, sendCode, sendMessage, isAccepted } = await sendTencentSms({
          phone,
          templateId,
          templateParamSet,
          scene,
          sessionContext: buildSessionContext(payload, appName)
        })

        return {
          ok: isAccepted,
          provider: 'tencent',
          scene,
          phone,
          providerMessageId: String(response?.RequestId || '').trim(),
          providerSerialNo: String(sendStatus?.SerialNo || '').trim(),
          message: isAccepted ? '腾讯云短信发送请求已受理' : (sendMessage || '腾讯云短信发送失败'),
          deliverState: isAccepted ? 'accepted' : 'failed',
          sendCode,
          templateId,
          templateParamSet,
          rawResponse: response
        }
      } catch (error) {
        return {
          ok: false,
          provider: 'tencent',
          scene,
          phone,
          reason: String(error?.code || 'send_failed').trim() || 'send_failed',
          message: String(error?.message || '腾讯云短信发送异常').trim() || '腾讯云短信发送异常',
          deliverState: 'failed',
          rawResponse: {
            code: String(error?.code || '').trim(),
            message: String(error?.message || '').trim()
          }
        }
      }
    },

    // 通知类短信（订单履约提醒等）：params 依序对应模板 {1}、{2}… 占位符。
    // 未配置对应场景模板 ID 时返回 not_configured，业务层据此静默跳过。
    async sendNotification(payload = {}) {
      const scene = String(payload.scene || '').trim().toLowerCase()
      const phone = String(payload.phone || '').trim()
      const templateEnvName = NOTIFICATION_TEMPLATE_ENV_MAP[scene]
      const templateId = templateEnvName ? String(process.env[templateEnvName] || '').trim() : ''
      const templateParamSet = Array.isArray(payload.params)
        ? payload.params.map((item) => String(item ?? '').trim()).filter((item) => item.length > 0)
        : []

      if (!templateEnvName) {
        return { ok: false, reason: 'unknown_scene', scene, phone, message: `未知通知场景 ${scene}` }
      }
      if (!isConfigured) {
        return { ok: false, reason: 'provider_not_configured', scene, phone, message: '腾讯云短信配置不完整' }
      }
      if (!templateId) {
        return { ok: false, reason: 'template_not_configured', scene, phone, message: `未配置场景 ${scene} 的短信模板 ID（${templateEnvName}）` }
      }
      if (!/^1[3-9]\d{9}$/.test(phone)) {
        return { ok: false, reason: 'invalid_phone', scene, phone, message: '通知手机号不合法' }
      }

      try {
        const { response, sendStatus, sendCode, sendMessage, isAccepted } = await sendTencentSms({
          phone,
          templateId,
          templateParamSet,
          scene
        })

        return {
          ok: isAccepted,
          provider: 'tencent',
          scene,
          phone,
          providerMessageId: String(response?.RequestId || '').trim(),
          providerSerialNo: String(sendStatus?.SerialNo || '').trim(),
          message: isAccepted ? '腾讯云通知短信发送请求已受理' : (sendMessage || '腾讯云通知短信发送失败'),
          deliverState: isAccepted ? 'accepted' : 'failed',
          sendCode,
          templateId,
          templateParamSet,
          rawResponse: response
        }
      } catch (error) {
        return {
          ok: false,
          provider: 'tencent',
          scene,
          phone,
          reason: String(error?.code || 'send_failed').trim() || 'send_failed',
          message: String(error?.message || '腾讯云通知短信发送异常').trim() || '腾讯云通知短信发送异常',
          deliverState: 'failed'
        }
      }
    }
  }
}

export function createSmsProvider(config = {}) {
  const providerName = String(config.provider || 'tencent').trim().toLowerCase() || 'tencent'
  if (providerName === 'tencent' || providerName === 'tencentcloud') {
    return createTencentSmsProvider(config)
  }

  return createUnsupportedSmsProvider(providerName)
}
