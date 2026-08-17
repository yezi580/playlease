/**
 * 客服 Passkey（WebAuthn）工具：注册绑定与资金操作二次校验。
 * 与 src-admin/utils/api.js 的管理员实现保持同一套编码协议（base64url）。
 */
import { apiFetch } from './api.js'

function base64UrlToArrayBuffer(value) {
  const normalizedValue = String(value || '').trim()
  if (!normalizedValue) return new ArrayBuffer(0)
  const base64 = normalizedValue
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(normalizedValue.length / 4) * 4, '=')
  const binary = atob(base64)
  const buffer = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    buffer[index] = binary.charCodeAt(index)
  }
  return buffer.buffer
}

function arrayBufferToBase64Url(value) {
  if (!value) return ''
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function normalizeCreationOptions(publicKey = {}) {
  return {
    ...publicKey,
    challenge: base64UrlToArrayBuffer(publicKey.challenge),
    user: publicKey.user ? {
      ...publicKey.user,
      id: base64UrlToArrayBuffer(publicKey.user.id)
    } : undefined,
    excludeCredentials: Array.isArray(publicKey.excludeCredentials)
      ? publicKey.excludeCredentials.map((item) => ({
        ...item,
        id: base64UrlToArrayBuffer(item.id)
      }))
      : []
  }
}

function normalizeRequestOptions(publicKey = {}) {
  return {
    ...publicKey,
    challenge: base64UrlToArrayBuffer(publicKey.challenge),
    allowCredentials: Array.isArray(publicKey.allowCredentials)
      ? publicKey.allowCredentials.map((item) => ({
        ...item,
        id: base64UrlToArrayBuffer(item.id)
      }))
      : []
  }
}

function serializeRegistrationCredential(credential) {
  if (!credential) return null
  const response = credential.response
  const transports = typeof response?.getTransports === 'function'
    ? response.getTransports()
    : []
  return {
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment || null,
    clientExtensionResults: typeof credential.getClientExtensionResults === 'function'
      ? credential.getClientExtensionResults()
      : {},
    response: {
      clientDataJSON: arrayBufferToBase64Url(response?.clientDataJSON),
      attestationObject: arrayBufferToBase64Url(response?.attestationObject),
      transports
    }
  }
}

function serializeAuthenticationCredential(credential) {
  if (!credential) return null
  const response = credential.response
  return {
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment || null,
    clientExtensionResults: typeof credential.getClientExtensionResults === 'function'
      ? credential.getClientExtensionResults()
      : {},
    response: {
      clientDataJSON: arrayBufferToBase64Url(response?.clientDataJSON),
      authenticatorData: arrayBufferToBase64Url(response?.authenticatorData),
      signature: arrayBufferToBase64Url(response?.signature),
      userHandle: response?.userHandle ? arrayBufferToBase64Url(response.userHandle) : null
    }
  }
}

function ensureWebAuthnSupported() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    throw new Error('当前环境不支持 Passkey')
  }
  if (!window.PublicKeyCredential || !navigator.credentials) {
    throw new Error('当前浏览器不支持 Passkey，请更换新版浏览器或系统环境')
  }
}

function normalizeWebAuthnError(error, action = 'verify') {
  const errorName = String(error?.name || '').trim()
  const isRegisterAction = action === 'register'
  if (errorName === 'NotAllowedError') {
    return new Error(isRegisterAction
      ? 'Passkey 注册已取消或被系统拒绝，请确认当前设备支持 Windows Hello/Passkey 后重试。'
      : 'Passkey 验证已取消或被系统拒绝，请重试。')
  }
  if (errorName === 'SecurityError') {
    return new Error('Passkey 校验失败：当前域名与注册时的环境不一致，请联系管理员核查配置。')
  }
  return error instanceof Error ? error : new Error(String(error?.message || 'Passkey 操作失败'))
}

/** 列出当前账号已绑定的 Passkey */
export async function listSupportPasskeys() {
  return apiFetch('/api/admin/passkeys')
}

/** 发送 Passkey 注册短信验证码（发到客服本人手机） */
export async function sendSupportPasskeySmsCode() {
  return apiFetch('/api/admin/passkeys/register/sms/send', { method: 'POST' })
}

/** 注册 Passkey：需先获取本人手机短信验证码 */
export async function registerSupportPasskey(deviceName = '', smsCode = '') {
  ensureWebAuthnSupported()
  const optionsData = await apiFetch('/api/admin/passkeys/register/options', {
    method: 'POST',
    body: JSON.stringify({ deviceName, smsCode })
  })
  let credential = null
  try {
    credential = await navigator.credentials.create({
      publicKey: normalizeCreationOptions(optionsData.publicKey || {})
    })
  } catch (error) {
    throw normalizeWebAuthnError(error, 'register')
  }
  if (!credential) {
    throw new Error('Passkey 注册已取消')
  }
  return apiFetch('/api/admin/passkeys/register/verify', {
    method: 'POST',
    body: JSON.stringify({
      challengeToken: optionsData.challengeToken,
      deviceName,
      credential: serializeRegistrationCredential(credential)
    })
  })
}

/** 删除当前账号绑定的 Passkey */
export async function deleteSupportPasskey(passkeyId) {
  return apiFetch(`/api/admin/passkeys/${passkeyId}`, { method: 'DELETE' })
}

/** 完成一次 Passkey 二次校验（验证成功后会话将被标记为已验证） */
export async function performSupportStepUp(action) {
  ensureWebAuthnSupported()
  const optionsData = await apiFetch('/api/admin/step-up/options', {
    method: 'POST',
    body: JSON.stringify({ action })
  })
  let credential = null
  try {
    credential = await navigator.credentials.get({
      publicKey: normalizeRequestOptions(optionsData.publicKey || {})
    })
  } catch (error) {
    throw normalizeWebAuthnError(error, 'verify')
  }
  if (!credential) {
    throw new Error('Passkey 验证已取消')
  }
  return apiFetch('/api/admin/step-up/verify', {
    method: 'POST',
    body: JSON.stringify({
      action,
      challengeToken: optionsData.challengeToken,
      credential: serializeAuthenticationCredential(credential)
    })
  })
}

/**
 * 带二次校验的请求：先直接请求，收到 428 STEP_UP_REQUIRED 时拉起 Passkey
 * 验证后自动重试一次。用于客服资金操作。
 */
export async function stepUpFetch(url, options = {}, action = '') {
  try {
    return await apiFetch(url, options)
  } catch (error) {
    const status = Number(error?.status || 0)
    const code = String(error?.data?.code || '').trim()
    if (status === 428 && code === 'STEP_UP_REQUIRED' && action) {
      await performSupportStepUp(action)
      return apiFetch(url, options)
    }
    if (status === 412 && code === 'PASSKEY_NOT_REGISTERED') {
      throw new Error('尚未绑定 Passkey，请先在客服工作台的「安全设置」中完成绑定')
    }
    throw error
  }
}
