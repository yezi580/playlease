const TOKEN_KEY = 'admin_auth_token'
const USER_KEY = 'admin_auth_user'
const STEP_UP_ACTION_LABELS = Object.freeze({
  update_user_role: '用户角色变更',
  ban_user: '用户封禁',
  unban_user: '用户解封',
  close_order: '关闭订单',
  deactivate_listing: '下架商品',
  delete_passkey: '删除 Passkey',
  trust_current_device: '信任当前设备',
  revoke_trusted_device: '移除受信任设备',
  revoke_all_trusted_devices: '清空受信任设备',
  update_security_settings: '安全设置修改',
  update_business_settings: '平台参数修改',
  batch_operation: '批量操作',
  approve_listing: '商品审核通过',
  reject_listing: '商品驳回'
})

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
  const rawMessage = String(error?.message || '').trim()
  const normalizedMessage = rawMessage.toLowerCase()
  const isRegisterAction = action === 'register'

  if (errorName === 'NotAllowedError') {
    if (normalizedMessage.includes('user could not be verified')) {
      return new Error('当前设备未完成 Windows Hello/Passkey 用户验证，请确认系统 PIN、指纹或面容可正常使用后重试。')
    }
    if (normalizedMessage.includes('timed out')) {
      return new Error(isRegisterAction ? 'Passkey 注册已超时，请在系统验证弹窗出现后尽快完成确认。' : 'Passkey 验证已超时，请重新发起校验并完成系统验证。')
    }
    return new Error(isRegisterAction ? 'Passkey 注册已取消或被系统拒绝，请确认当前设备支持 Windows Hello/Passkey 后重试。' : 'Passkey 验证已取消或被系统拒绝，请确认当前设备支持 Windows Hello/Passkey 后重试。')
  }

  if (errorName === 'InvalidStateError') {
    return new Error(isRegisterAction ? '当前设备上的该 Passkey 可能已经绑定过，请先检查现有 Passkey 列表。' : '当前 Passkey 状态异常，请重新尝试或改用已绑定的其他设备。')
  }

  if (errorName === 'SecurityError') {
    return new Error('当前页面环境不满足 Passkey 安全要求，请使用 HTTPS 或 localhost 访问，并确认域名与已绑定环境一致。')
  }

  if (errorName === 'AbortError') {
    return new Error(isRegisterAction ? 'Passkey 注册流程已中断，请重新尝试。' : 'Passkey 验证流程已中断，请重新尝试。')
  }

  if (errorName === 'UnknownError') {
    return new Error('系统认证器返回未知错误，请检查 Windows Hello/浏览器状态后重试。')
  }

  return error instanceof Error ? error : new Error(rawMessage || 'Passkey 操作失败')
}

export function getToken() {
  return ''
}

export function getStoredUser() {
  const raw = sessionStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (_error) {
    sessionStorage.removeItem(USER_KEY)
    return null
  }
}

export function setAuth(_token, user) {
  sessionStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TOKEN_KEY)
  if (user) {
    sessionStorage.setItem(USER_KEY, JSON.stringify(user))
  }
}

export function clearAuth() {
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(USER_KEY)
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  try {
    void fetch('/api/logout', {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true
    })
  } catch (_error) {
    // 忽略退出清理请求失败，保留本地状态清空即可
  }
}

function buildAuthHeaders(initialHeaders = {}) {
  return new Headers(initialHeaders)
}

export async function createAuthorizedObjectUrl(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers: buildAuthHeaders(options.headers || {})
  })

  if (!response.ok) {
    const rawText = await response.text()
    let data = {}
    if (rawText) {
      try {
        data = JSON.parse(rawText)
      } catch (_error) {
        data = { message: rawText }
      }
    }
    const error = new Error(data.message || `请求失败：${response.status}`)
    error.status = response.status
    error.data = data
    throw error
  }

  const blob = await response.blob()
  return URL.createObjectURL(blob)
}

export async function apiFetch(url, options = {}) {
  const headers = buildAuthHeaders(options.headers || {})
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers
  })

  const rawText = await response.text()
  let data = {}
  if (rawText) {
    try {
      data = JSON.parse(rawText)
    } catch (_error) {
      data = { message: rawText }
    }
  }

  if (!response.ok) {
    const error = new Error(data.message || `请求失败：${response.status}`)
    error.status = response.status
    error.data = data
    throw error
  }

  return data
}

export function isStepUpRequiredError(error) {
  return Number(error?.status) === 428 && String(error?.data?.code || '').trim() === 'STEP_UP_REQUIRED'
}

export function getStepUpRequirementReason(error) {
  return String(error?.data?.reason || '').trim()
}

export function getStepUpRequirementMessage(error) {
  const action = String(error?.data?.action || '').trim()
  const actionLabel = STEP_UP_ACTION_LABELS[action] || '当前高风险操作'
  const reason = getStepUpRequirementReason(error)
  if (reason === 'trusted_device_required') {
    return `${actionLabel}要求当前设备已加入受信任设备，请先前往安全设置页信任当前设备。`
  }
  if (reason === 'passkey_required') {
    return `${actionLabel}要求当前管理员会话已完成 Passkey 校验。`
  }
  if (reason === 'step_up_expired') {
    return `${actionLabel}的二次校验已过期，请重新完成 Passkey 验证。`
  }
  return `${actionLabel}需要完成二次校验。`
}

export async function listAdminPasskeys() {
  return apiFetch('/api/admin/passkeys')
}

export async function sendAdminPasskeyRegisterSmsCode() {
  return apiFetch('/api/admin/passkeys/register/sms/send', {
    method: 'POST'
  })
}

export async function registerAdminPasskey(deviceName = '', smsCode = '') {
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

export async function deleteAdminPasskey(passkeyId) {
  return apiFetch(`/api/admin/passkeys/${passkeyId}`, {
    method: 'DELETE'
  })
}

export async function listTrustedDevices() {
  return apiFetch('/api/admin/trusted-devices')
}

export async function trustCurrentAdminDevice(deviceName = '') {
  return apiFetch('/api/admin/trusted-devices', {
    method: 'POST',
    body: JSON.stringify({ deviceName })
  })
}

export async function revokeTrustedDevice(deviceId) {
  return apiFetch(`/api/admin/trusted-devices/${deviceId}`, {
    method: 'DELETE'
  })
}

export async function revokeAllTrustedDevices() {
  return apiFetch('/api/admin/trusted-devices/revoke-all', {
    method: 'POST'
  })
}

export async function performAdminStepUp(action) {
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
