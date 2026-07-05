//- 作用：短信服务商适配层。
//- 当前仅支持腾讯云短信，业务层统一走 sendVerificationCode 即可。

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
    forgotpassword: 'reset_password'
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

  return {
    mode: 'tencent',
    isEnabled: isConfigured,
    getRuntimeConfig() {
      const templateIds = {
        default: String(config.defaultTemplateId || process.env.TENCENT_SMS_TEMPLATE_ID_DEFAULT || '').trim(),
        login: String(config.loginTemplateId || process.env.TENCENT_SMS_TEMPLATE_ID_LOGIN || '').trim(),
        register: String(config.registerTemplateId || process.env.TENCENT_SMS_TEMPLATE_ID_REGISTER || '').trim(),
        resetPassword: String(config.resetPasswordTemplateId || process.env.TENCENT_SMS_TEMPLATE_ID_RESET_PASSWORD || '').trim()
      }
      const configIssues = []
      if (!secretId) configIssues.push('缺少 TENCENT_SMS_SECRET_ID')
      if (!secretKey) configIssues.push('缺少 TENCENT_SMS_SECRET_KEY')
      if (!smsSdkAppId) configIssues.push('缺少 TENCENT_SMS_SDK_APP_ID')
      if (!signName) configIssues.push('缺少 TENCENT_SMS_SIGN_NAME')
      if (!(templateIds.default || templateIds.login)) configIssues.push('缺少登录短信模板 ID')
      if (!(templateIds.default || templateIds.register)) configIssues.push('缺少注册短信模板 ID')
      if (!(templateIds.default || templateIds.resetPassword)) configIssues.push('缺少改密短信模板 ID')
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
        const client = await getClient()
        const requestPayload = {
          SmsSdkAppId: smsSdkAppId,
          SignName: signName,
          TemplateId: templateId,
          TemplateParamSet: templateParamSet,
          PhoneNumberSet: [normalizePhoneNumberToE164(phone)],
          SessionContext: buildSessionContext(payload, appName)
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
