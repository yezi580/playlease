function readPositiveIntEnv(name, fallback) {
  const rawValue = String(process.env[name] || '').trim()
  if (!rawValue) return fallback
  const parsedValue = Number(rawValue)
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return fallback
  }
  return Math.round(parsedValue)
}

function normalizeCaptchaResultMessage(payload = {}) {
  const code = Number(payload?.captchaCode ?? payload?.CaptchaCode ?? -1)
  switch (code) {
    case 1:
      return '验证通过'
    case 7:
      return '验证码随机串校验失败，请重试'
    case 8:
      return '验证码已过期，请重新验证'
    case 9:
      return '验证码已被使用，请重新验证'
    case 15:
      return '验证码票据不合法，请重试'
    case 16:
      return '验证码应用配置不匹配，请检查 CaptchaAppId'
    case 21:
      return '验证码校验异常，请稍后重试'
    case 100:
      return '验证码密钥配置错误，请检查 AppSecretKey'
    default:
      return String(payload?.captchaMsg || payload?.CaptchaMsg || '验证码校验失败').trim() || '验证码校验失败'
  }
}

function createUnavailableTencentCaptchaProvider() {
  return {
    mode: 'tencent',
    isEnabled: false,
    getClientConfig() {
      return {
        enabled: false,
        provider: 'tencent',
        jsUrl: 'https://turing.captcha.qcloud.com/TJCaptcha.js',
        captchaAppId: '',
        userLanguage: 'zh-cn'
      }
    },
    async verifyTicket() {
      return {
        ok: false,
          provider: 'tencent',
        reason: 'provider_not_configured',
        message: '腾讯云验证码未配置完成，请检查 CaptchaAppId、AppSecretKey 与云 API 密钥'
      }
    }
  }
}


function createUnsupportedCaptchaProvider(providerName = 'unknown') {
  return {
    mode: providerName,
    isEnabled: false,
    getClientConfig() {
      return {
        enabled: false,
        provider: providerName,
        jsUrl: '',
        captchaAppId: '',
        userLanguage: 'zh-cn'
      }
    },
    async verifyTicket() {
      return {
        ok: false,
        provider: providerName,
        reason: 'provider_not_implemented',
        message: `验证码服务商 ${providerName} 尚未接入，目前仅支持腾讯云验证码`
      }
    }
  }
}

function createTencentCaptchaProvider(config = {}) {
  const secretId = String(config.secretId || process.env.TENCENT_CAPTCHA_SECRET_ID || '').trim()
  const secretKey = String(config.secretKey || process.env.TENCENT_CAPTCHA_SECRET_KEY || '').trim()
  const captchaAppId = Number(config.captchaAppId || process.env.TENCENT_CAPTCHA_APP_ID || 0)
  const appSecretKey = String(config.appSecretKey || process.env.TENCENT_CAPTCHA_APP_SECRET_KEY || '').trim()
  const endpoint = String(config.endpoint || process.env.TENCENT_CAPTCHA_ENDPOINT || 'captcha.tencentcloudapi.com').trim() || 'captcha.tencentcloudapi.com'
  const region = String(config.region || process.env.TENCENT_CAPTCHA_REGION || 'ap-guangzhou').trim() || 'ap-guangzhou'
  const reqTimeout = readPositiveIntEnv('TENCENT_CAPTCHA_TIMEOUT_SECONDS', 10)
  const businessId = Number(config.businessId || process.env.TENCENT_CAPTCHA_BUSINESS_ID || 0)
  const sceneId = Number(config.sceneId || process.env.TENCENT_CAPTCHA_SCENE_ID || 0)
  const userLanguage = String(config.userLanguage || process.env.TENCENT_CAPTCHA_USER_LANGUAGE || 'zh-cn').trim() || 'zh-cn'
  const jsUrl = String(config.jsUrl || process.env.TENCENT_CAPTCHA_JS_URL || 'https://turing.captcha.qcloud.com/TJCaptcha.js').trim() || 'https://turing.captcha.qcloud.com/TJCaptcha.js'
  if (!secretId || !secretKey || !captchaAppId || !appSecretKey) {
    return createUnavailableTencentCaptchaProvider()
  }
  let cachedClient = null

  async function getClient() {
    if (cachedClient) return cachedClient
    const tencentcloudModule = await import('tencentcloud-sdk-nodejs-captcha')
    const tencentcloud = tencentcloudModule.default || tencentcloudModule
    const CaptchaClient = tencentcloud?.captcha?.v20190722?.Client
    if (typeof CaptchaClient !== 'function') {
      throw new Error('腾讯云验证码 SDK 加载失败')
    }

    cachedClient = new CaptchaClient({
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
    isEnabled: true,
    getClientConfig() {
      return {
        enabled: true,
        provider: 'tencent',
        jsUrl,
        captchaAppId: String(captchaAppId || ''),
        userLanguage
      }
    },
    async verifyTicket(payload = {}) {
      const ticket = String(payload.ticket || '').trim()
      const randstr = String(payload.randstr || '').trim()
      const userIp = String(payload.userIp || '').trim()
      if (!ticket || !randstr || !userIp) {
        return {
          ok: false,
          provider: 'tencent',
          reason: 'invalid_payload',
          message: '验证码票据参数不完整，请重新验证'
        }
      }

      try {
        const client = await getClient()
        const requestPayload = {
          CaptchaType: 9,
          Ticket: ticket,
          UserIp: userIp,
          Randstr: randstr,
          CaptchaAppId: captchaAppId,
          AppSecretKey: appSecretKey,
          NeedGetCaptchaTime: 1
        }
        if (businessId > 0) {
          requestPayload.BusinessId = businessId
        }
        if (sceneId > 0) {
          requestPayload.SceneId = sceneId
        }

        const response = await client.DescribeCaptchaResult(requestPayload)
        const captchaCode = Number(response?.CaptchaCode ?? -1)
        const evilLevel = Number(response?.EvilLevel ?? 0)
        const passed = captchaCode === 1 && evilLevel !== 100

        return {
          ok: passed,
          provider: 'tencent',
          reason: passed ? '' : 'captcha_verify_failed',
          message: passed ? '验证通过' : normalizeCaptchaResultMessage(response),
          captchaCode,
          captchaMsg: String(response?.CaptchaMsg || '').trim(),
          evilLevel,
          requestId: String(response?.RequestId || '').trim(),
          rawResponse: response
        }
      } catch (error) {
        return {
          ok: false,
          provider: 'tencent',
          reason: String(error?.code || 'verify_failed').trim() || 'verify_failed',
          message: String(error?.message || '腾讯云验证码校验异常').trim() || '腾讯云验证码校验异常',
          rawResponse: {
            code: String(error?.code || '').trim(),
            message: String(error?.message || '').trim()
          }
        }
      }
    }
  }
}

export function createCaptchaProvider(config = {}) {
  const providerName = String(config.provider || process.env.CAPTCHA_PROVIDER || 'tencent').trim().toLowerCase() || 'tencent'

  if (providerName === 'tencent') {
    return createTencentCaptchaProvider(config)
  }

  return createUnsupportedCaptchaProvider(providerName)
}
