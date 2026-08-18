/**
 * 认证服务工厂，负责令牌、鉴权中间件和管理员二次校验流程。
 */

import crypto from 'crypto'
import jwt from 'jsonwebtoken'

export function createAuthModule(config) {
  const {
    pool,
    jwtSecret,
    userJwtExpiresIn,
    adminJwtExpiresIn,
    userAuthCookieMaxAgeMs,
    adminAuthCookieMaxAgeMs,
    AUTH_COOKIE_NAME,
    TRUSTED_DEVICE_COOKIE_NAME,
    ADMIN_TRUSTED_DEVICE_TTL_MS,
    ADMIN_PASSKEY_ENABLED,
    ADMIN_PASSKEY_RP_NAME,
    ADMIN_PASSKEY_RP_ID,
    ADMIN_STEP_UP_CHALLENGE_TTL_MS,
    ADMIN_STEP_UP_MAX_ACTIVE_CHALLENGES_PER_USER,
    ADMIN_PASSKEY_REGISTRATION_TTL_MS,
    ADMIN_STEP_UP_POLICY_BY_ACTION,
    adminStepUpChallenges,
    adminPasskeyRegistrationChallenges,
    createLoginSession,
    getLoginSession,
    touchLoginSession,
    revokeAllLoginSessionsByUserId,
    revokeLoginSession,
    userLoginSessionTtlSeconds,
    adminLoginSessionTtlSeconds,
    userSessionIdleTimeoutMs,
    adminSessionIdleTimeoutMs,
    userJwtRenewWindowMs,
    adminJwtRenewWindowMs,
    allowedOrigins = []
  } = config

const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function isAdminRole(role = '') {
  return String(role || '').trim() === 'admin'
}

function resolveAuthSecurityProfile(role = '') {
  if (isAdminRole(role)) {
    return {
      jwtExpiresIn: adminJwtExpiresIn || userJwtExpiresIn || '1h',
      authCookieMaxAgeMs: adminAuthCookieMaxAgeMs || userAuthCookieMaxAgeMs || parseDurationToMs(adminJwtExpiresIn || userJwtExpiresIn || '1h'),
      sessionTtlSeconds: Math.max(60, Number(adminLoginSessionTtlSeconds || userLoginSessionTtlSeconds || 24 * 60 * 60) || 24 * 60 * 60),
      sessionIdleTimeoutMs: Math.max(60 * 1000, Number(adminSessionIdleTimeoutMs || 30 * 60 * 1000) || 30 * 60 * 1000),
      jwtRenewWindowMs: Math.max(60 * 1000, Number(adminJwtRenewWindowMs || 15 * 60 * 1000) || 15 * 60 * 1000)
    }
  }

  return {
    jwtExpiresIn: userJwtExpiresIn || '1h',
    authCookieMaxAgeMs: userAuthCookieMaxAgeMs || parseDurationToMs(userJwtExpiresIn || '1h'),
    sessionTtlSeconds: Math.max(60, Number(userLoginSessionTtlSeconds || 7 * 24 * 60 * 60) || 7 * 24 * 60 * 60),
    sessionIdleTimeoutMs: Math.max(60 * 1000, Number(userSessionIdleTimeoutMs || 12 * 60 * 60 * 1000) || 12 * 60 * 60 * 1000),
    jwtRenewWindowMs: Math.max(60 * 1000, Number(userJwtRenewWindowMs || 15 * 60 * 1000) || 15 * 60 * 1000)
  }
}

function buildAuthToken(user, sessionState = {}) {
  const securityProfile = resolveAuthSecurityProfile(user?.role)
  const authLevel = String(sessionState.authLevel || 'password').trim() || 'password'
  const stepUpVerifiedAt = Number(sessionState.stepUpVerifiedAt || 0) || 0
  const trustedDevice = Boolean(sessionState.trustedDevice)
  const trustedDeviceId = String(sessionState.trustedDeviceId || '').trim()
  const sessionId = String(sessionState.sessionId || sessionState.sid || '').trim()
  const amr = Array.isArray(sessionState.amr) && sessionState.amr.length
    ? sessionState.amr.map((item) => String(item || '').trim()).filter(Boolean)
    : ['pwd']

  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      phone: user.phone,
      role: user.role,
      sid: sessionId || undefined,
      authLevel,
      stepUpVerifiedAt,
      trustedDevice,
      trustedDeviceId,
      amr
    },
    jwtSecret,
    { expiresIn: securityProfile.jwtExpiresIn }
  )
}

function verifyAuthToken(token) {
  return jwt.verify(token, jwtSecret)
}

function parseDurationToMs(value) {
  const normalizedValue = String(value || '').trim()
  const match = normalizedValue.match(/^(\d+)([smhd])$/i)
  if (!match) return null

  const amount = Number(match[1])
  const unit = match[2].toLowerCase()
  const unitMap = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  }
  return amount * unitMap[unit]
}

function parseCookieHeader(cookieHeader = '') {
  return String(cookieHeader || '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((result, item) => {
      const separatorIndex = item.indexOf('=')
      if (separatorIndex <= 0) return result
      const key = item.slice(0, separatorIndex).trim()
      const value = item.slice(separatorIndex + 1).trim()
      if (key) {
        result[key] = decodeURIComponent(value)
      }
      return result
    }, {})
}

function isSecureRequest(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
  return Boolean(req.secure || forwardedProto === 'https')
}

function buildAuthCookieOptions(req, maxAgeMs = 0) {
  const options = {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: '/'
  }
  if (Number(maxAgeMs || 0) > 0) {
    options.maxAge = Number(maxAgeMs)
  }
  return options
}

function buildTrustedDeviceCookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: '/',
    maxAge: ADMIN_TRUSTED_DEVICE_TTL_MS
  }
}

function setAuthCookie(req, res, token, options = {}) {
  res.cookie(
    AUTH_COOKIE_NAME,
    token,
    buildAuthCookieOptions(req, Number(options?.maxAgeMs || 0) || 0)
  )
}

function setTrustedDeviceCookie(req, res, token) {
  res.cookie(TRUSTED_DEVICE_COOKIE_NAME, token, buildTrustedDeviceCookieOptions(req))
}

function clearAuthCookie(req, res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: '/'
  })
}

function clearTrustedDeviceCookie(req, res) {
  res.clearCookie(TRUSTED_DEVICE_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: '/'
  })
}

function getClientIpAddress(req) {
  // 安全要求：统一使用 Express 的 req.ip（trust proxy=1 下取 nginx 直连地址），
  // 不读取可被客户端伪造的 X-Forwarded-For 首段
  return String(req.ip || req.socket?.remoteAddress || '').trim()
}

async function persistAuthSessionRecord(req, user, sessionState = {}, existingSessionId = '', options = {}) {
  const safeUserId = Number(user?.id || 0)
  const safeSessionId = String(existingSessionId || sessionState.sessionId || '').trim()
  if (!safeUserId || !safeSessionId || typeof createLoginSession !== 'function') {
    return safeSessionId
  }

  const securityProfile = resolveAuthSecurityProfile(user?.role)
  const shouldPreserveTtl = Boolean(options?.preserveTtl && typeof touchLoginSession === 'function')
  const sessionMetadata = {
    authLevel: String(sessionState.authLevel || 'password').trim() || 'password',
    trustedDevice: Boolean(sessionState.trustedDevice),
    trustedDeviceId: String(sessionState.trustedDeviceId || '').trim(),
    amr: Array.isArray(sessionState.amr) ? sessionState.amr : ['pwd'],
    userAgent: String(req?.headers?.['user-agent'] || '').trim(),
    ip: getClientIpAddress(req),
    role: String(user?.role || '').trim(),
    createdAt: Number(sessionState.createdAt || Date.now()) || Date.now()
  }

  if (shouldPreserveTtl) {
    const touchedSession = await touchLoginSession(safeSessionId, sessionMetadata)
    if (touchedSession) {
      return safeSessionId
    }
  }

  await createLoginSession({
    sessionId: safeSessionId,
    userId: safeUserId,
    ttlSeconds: securityProfile.sessionTtlSeconds,
    metadata: sessionMetadata
  })

  return safeSessionId
}

async function issueAuthSession(req, user, sessionState = {}, options = {}) {
  const securityProfile = resolveAuthSecurityProfile(user?.role)
  const nextSessionId = String(sessionState.sessionId || '').trim() || crypto.randomBytes(24).toString('base64url')
  await persistAuthSessionRecord(req, user, sessionState, nextSessionId, options)
  return {
    sessionId: nextSessionId,
    tokenMaxAgeMs: securityProfile.authCookieMaxAgeMs,
    token: buildAuthToken(user, {
      ...sessionState,
      sessionId: nextSessionId
    })
  }
}

async function validateDecodedSession(decoded, options = {}) {
  const sessionId = String(decoded?.sid || '').trim()
  if (!sessionId || typeof getLoginSession !== 'function') {
    return options?.returnSession ? { sessionId, userId: Number(decoded?.userId || 0) || 0 } : true
  }

  const session = await getLoginSession(sessionId)
  if (!session) {
    return options?.returnSession ? null : false
  }

  if (Number(session.userId || 0) !== Number(decoded?.userId || 0)) {
    return options?.returnSession ? null : false
  }

  const securityProfile = resolveAuthSecurityProfile(decoded?.role)
  const lastActiveAt = Number(session.updatedAt || session.createdAt || 0) || 0
  if (
    securityProfile.sessionIdleTimeoutMs > 0 &&
    lastActiveAt > 0 &&
    (Date.now() - lastActiveAt) > securityProfile.sessionIdleTimeoutMs
  ) {
    if (typeof revokeLoginSession === 'function') {
      await revokeLoginSession(sessionId)
    }
    return options?.returnSession ? null : false
  }

  return options?.returnSession ? session : true
}

function getRequestOrigin(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
  const protocol = forwardedProto || (req.secure ? 'https' : 'http')
  const host = String(req.headers.host || req.hostname || '').trim()
  return host ? `${protocol}://${host}` : ''
}

function normalizeOrigin(origin) {
  const normalizedOrigin = String(origin || '').trim()
  if (!normalizedOrigin) return ''
  try {
    return new URL(normalizedOrigin).origin.toLowerCase()
  } catch (_error) {
    return ''
  }
}

function getRefererOrigin(req) {
  return normalizeOrigin(req.headers.referer || '')
}

function hasBearerAuthHeader(req) {
  const authHeader = String(req.headers.authorization || '').trim()
  return authHeader.toLowerCase().startsWith('bearer ')
}

function usesCookieAuth(req) {
  return !hasBearerAuthHeader(req) && Boolean(getCookieToken(req))
}

function isTrustedWriteOrigin(req) {
  const method = String(req.method || 'GET').trim().toUpperCase()
  if (SAFE_HTTP_METHODS.has(method)) return true
  if (!usesCookieAuth(req)) return true

  const trustedOrigins = new Set(
    [getRequestOrigin(req), ...(Array.isArray(allowedOrigins) ? allowedOrigins : [])]
      .map((origin) => normalizeOrigin(origin))
      .filter(Boolean)
  )
  const requestOrigin = normalizeOrigin(req.headers.origin || '')
  if (requestOrigin) {
    return trustedOrigins.has(requestOrigin)
  }
  const refererOrigin = getRefererOrigin(req)
  if (refererOrigin) {
    return trustedOrigins.has(refererOrigin)
  }
  return false
}

function shouldAutoRenewAuthToken(decoded, authUser) {
  const securityProfile = resolveAuthSecurityProfile(authUser?.role || decoded?.role)
  const expiresAtMs = Math.max(0, Number(decoded?.exp || 0) || 0) * 1000
  if (!expiresAtMs) return false
  const remainingMs = expiresAtMs - Date.now()
  return remainingMs > 0 && remainingMs <= securityProfile.jwtRenewWindowMs
}

async function touchAuthSession(sessionId, metadata = {}) {
  const safeSessionId = String(sessionId || '').trim()
  if (!safeSessionId || typeof touchLoginSession !== 'function') {
    return null
  }
  return touchLoginSession(safeSessionId, metadata)
}

function getExpectedAdminPasskeyOrigins(req) {
  const envOrigins = String(process.env.PASSKEY_EXPECTED_ORIGINS || process.env.PASSKEY_EXPECTED_ORIGIN || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  if (envOrigins.length) {
    return envOrigins
  }
  const requestOrigin = getRequestOrigin(req)
  return requestOrigin ? [requestOrigin] : []
}

function getAdminPasskeyRpId(req) {
  if (ADMIN_PASSKEY_RP_ID) {
    return ADMIN_PASSKEY_RP_ID
  }
  return String(req.hostname || req.headers.host || '')
    .replace(/:\d+$/, '')
    .trim()
}

function decodeBase64UrlToBuffer(value) {
  const normalizedValue = String(value || '').trim()
  if (!normalizedValue) return Buffer.alloc(0)
  const base64 = normalizedValue
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(normalizedValue.length / 4) * 4, '=')
  return Buffer.from(base64, 'base64')
}

function encodeBufferToBase64Url(value) {
  return Buffer.from(value || Buffer.alloc(0))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function decodeJsonFromBase64Url(value) {
  const buffer = decodeBase64UrlToBuffer(value)
  if (!buffer.length) return null
  return JSON.parse(buffer.toString('utf8'))
}

function normalizeCredentialIdFromRequest(credential = {}) {
  const rawId = String(credential?.rawId || '').trim()
  if (rawId) return rawId
  const id = String(credential?.id || '').trim()
  return id
}

function parseAuthenticatorData(authenticatorDataBase64Url) {
  const buffer = decodeBase64UrlToBuffer(authenticatorDataBase64Url)
  if (buffer.length < 37) {
    throw new Error('authenticatorData 长度不合法')
  }

  const rpIdHash = buffer.subarray(0, 32)
  const flagsByte = buffer.readUInt8(32)
  const signCount = buffer.readUInt32BE(33)

  return {
    raw: buffer,
    rpIdHash,
    flagsByte,
    signCount,
    userPresent: Boolean(flagsByte & 0x01),
    userVerified: Boolean(flagsByte & 0x04)
  }
}

async function ensureAdminPasskeySchema() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS admin_passkeys (
      id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '管理员 Passkey 凭证ID',
      user_id INT NOT NULL COMMENT '所属管理员用户ID',
      credential_id VARCHAR(512) NOT NULL COMMENT 'WebAuthn credential id（base64url）',
      public_key TEXT DEFAULT NULL COMMENT '注册后保存的公钥，后续用于 assertion 验签',
      public_key_format VARCHAR(50) NOT NULL DEFAULT 'unknown' COMMENT '公钥格式，预留 spki_pem/cose 等',
      sign_count BIGINT NOT NULL DEFAULT 0 COMMENT '签名计数器',
      transports VARCHAR(255) DEFAULT NULL COMMENT '设备传输方式，逗号分隔',
      device_name VARCHAR(120) DEFAULT NULL COMMENT '管理员给设备起的名称',
      aaguid VARCHAR(64) DEFAULT NULL COMMENT '认证器 AAGUID',
      is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
      last_used_at DATETIME DEFAULT NULL COMMENT '最后使用时间',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      UNIQUE KEY uk_admin_passkeys_credential_id (credential_id),
      INDEX idx_admin_passkeys_user_id (user_id, is_active),
      CONSTRAINT fk_admin_passkeys_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )
}

async function ensureAdminTrustedDeviceSchema() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS admin_trusted_devices (
      id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '受信任设备记录ID',
      user_id INT NOT NULL COMMENT '所属管理员用户ID',
      token_hash CHAR(64) NOT NULL COMMENT '设备令牌 SHA-256 哈希',
      device_name VARCHAR(120) DEFAULT NULL COMMENT '管理员给设备起的名称',
      user_agent VARCHAR(255) DEFAULT NULL COMMENT '浏览器 UA',
      last_ip VARCHAR(64) DEFAULT NULL COMMENT '最近 IP',
      last_used_at DATETIME DEFAULT NULL COMMENT '最近使用时间',
      expires_at DATETIME NOT NULL COMMENT '到期时间',
      revoked_at DATETIME DEFAULT NULL COMMENT '撤销时间',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      UNIQUE KEY uk_admin_trusted_devices_token_hash (token_hash),
      INDEX idx_admin_trusted_devices_user_id (user_id, revoked_at, expires_at),
      CONSTRAINT fk_admin_trusted_devices_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )
}

async function findAdminPasskeyByCredentialId(credentialId) {
  const normalizedCredentialId = String(credentialId || '').trim()
  if (!normalizedCredentialId) return null
  const [rows] = await pool.execute(
    `SELECT
        id,
        user_id,
        credential_id,
        public_key,
        public_key_format,
        sign_count,
        transports,
        device_name,
        aaguid,
        is_active,
        last_used_at,
        created_at,
        updated_at
     FROM admin_passkeys
     WHERE credential_id = ?
       AND is_active = 1
     LIMIT 1`,
    [normalizedCredentialId]
  )
  return rows[0] || null
}

async function listAdminPasskeysByUserId(userId) {
  const safeUserId = Number(userId || 0)
  if (!safeUserId) return []
  const [rows] = await pool.execute(
    `SELECT
        id,
        credential_id,
        public_key,
        public_key_format,
        sign_count,
        transports,
        device_name,
        aaguid,
        last_used_at,
        created_at,
        updated_at
     FROM admin_passkeys
     WHERE user_id = ?
       AND is_active = 1
     ORDER BY id DESC`,
    [safeUserId]
  )
  return rows
}

function buildStoredWebAuthnCredential(passkeyRecord) {
  return {
    id: String(passkeyRecord?.credential_id || '').trim(),
    publicKey: decodeBase64UrlToBuffer(passkeyRecord?.public_key),
    counter: Number(passkeyRecord?.sign_count || 0),
    transports: String(passkeyRecord?.transports || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
}

async function upsertAdminPasskeyCredential({
  userId,
  credentialId,
  publicKey,
  signCount,
  transports,
  deviceName,
  aaguid
}) {
  const normalizedCredentialId = String(credentialId || '').trim()
  const normalizedPublicKey = String(publicKey || '').trim()
  if (!normalizedCredentialId || !normalizedPublicKey) {
    throw new Error('Passkey credential 数据不完整')
  }
  const normalizedTransports = Array.isArray(transports)
    ? transports.map((item) => String(item || '').trim()).filter(Boolean).join(',')
    : String(transports || '').trim()
  const normalizedDeviceName = String(deviceName || '').trim() || null
  const normalizedAaguid = String(aaguid || '').trim() || null

  await pool.execute(
    `INSERT INTO admin_passkeys (
        user_id,
        credential_id,
        public_key,
        public_key_format,
        sign_count,
        transports,
        device_name,
        aaguid,
        is_active,
        last_used_at
      ) VALUES (?, ?, ?, 'simplewebauthn_base64url', ?, ?, ?, ?, 1, NULL)
      ON DUPLICATE KEY UPDATE
        user_id = VALUES(user_id),
        public_key = VALUES(public_key),
        public_key_format = VALUES(public_key_format),
        sign_count = VALUES(sign_count),
        transports = VALUES(transports),
        device_name = COALESCE(VALUES(device_name), device_name),
        aaguid = COALESCE(VALUES(aaguid), aaguid),
        is_active = 1,
        updated_at = CURRENT_TIMESTAMP`,
    [
      Number(userId || 0),
      normalizedCredentialId,
      normalizedPublicKey,
      Math.max(0, Number(signCount || 0) || 0),
      normalizedTransports || null,
      normalizedDeviceName,
      normalizedAaguid
    ]
  )

  return findAdminPasskeyByCredentialId(normalizedCredentialId)
}

async function updateAdminPasskeyUsage(passkeyId, signCount) {
  const safePasskeyId = Number(passkeyId || 0)
  if (!safePasskeyId) return
  await pool.execute(
    `UPDATE admin_passkeys
     SET sign_count = ?, last_used_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [Math.max(0, Number(signCount || 0) || 0), safePasskeyId]
  )
}

async function revokeAdminPasskey(passkeyId, userId) {
  const safePasskeyId = Number(passkeyId || 0)
  const safeUserId = Number(userId || 0)
  if (!safePasskeyId || !safeUserId) return null

  const [rows] = await pool.execute(
    `SELECT
        id,
        user_id,
        credential_id,
        transports,
        device_name,
        last_used_at,
        created_at
     FROM admin_passkeys
     WHERE id = ?
       AND user_id = ?
       AND is_active = 1
     LIMIT 1`,
    [safePasskeyId, safeUserId]
  )
  if (!rows.length) return null

  await pool.execute(
    `UPDATE admin_passkeys
     SET is_active = 0,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
       AND user_id = ?`,
    [safePasskeyId, safeUserId]
  )

  return rows[0]
}

function hashTrustedDeviceToken(token) {
  return crypto.createHash('sha256').update(String(token || '').trim()).digest('hex')
}

function getTrustedDeviceTokenFromRequest(req) {
  const cookies = parseCookieHeader(req.headers.cookie || '')
  return String(cookies[TRUSTED_DEVICE_COOKIE_NAME] || '').trim()
}

async function getTrustedDeviceRecordByToken(token, userId) {
  const normalizedToken = String(token || '').trim()
  const safeUserId = Number(userId || 0)
  if (!normalizedToken || !safeUserId) return null

  const now = new Date()
  const [rows] = await pool.execute(
    `SELECT
        id,
        user_id,
        device_name,
        user_agent,
        last_ip,
        last_used_at,
        expires_at,
        created_at
     FROM admin_trusted_devices
     WHERE token_hash = ?
       AND user_id = ?
       AND revoked_at IS NULL
       AND expires_at > ?
     LIMIT 1`,
    [hashTrustedDeviceToken(normalizedToken), safeUserId, now]
  )
  return rows[0] || null
}

async function touchTrustedDeviceRecord(deviceId, req) {
  const safeDeviceId = Number(deviceId || 0)
  if (!safeDeviceId) return
  await pool.execute(
    `UPDATE admin_trusted_devices
     SET last_used_at = NOW(),
         last_ip = ?,
         user_agent = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      getClientIpAddress(req) || null,
      String(req.headers['user-agent'] || '').trim() || null,
      safeDeviceId
    ]
  )
}

async function issueTrustedDeviceForCurrentSession(req, res, userId, deviceName = '') {
  const rawToken = crypto.randomBytes(32).toString('base64url')
  const tokenHash = hashTrustedDeviceToken(rawToken)
  const now = Date.now()
  const expiresAt = new Date(now + ADMIN_TRUSTED_DEVICE_TTL_MS)

  await pool.execute(
    `INSERT INTO admin_trusted_devices (
        user_id,
        token_hash,
        device_name,
        user_agent,
        last_ip,
        last_used_at,
        expires_at,
        revoked_at
      ) VALUES (?, ?, ?, ?, ?, NOW(), ?, NULL)`,
    [
      Number(userId || 0),
      tokenHash,
      String(deviceName || '').trim() || null,
      String(req.headers['user-agent'] || '').trim() || null,
      getClientIpAddress(req) || null,
      expiresAt
    ]
  )

  const trustedDeviceRecord = await getTrustedDeviceRecordByToken(rawToken, userId)
  setTrustedDeviceCookie(req, res, rawToken)
  return trustedDeviceRecord
}

async function listTrustedDevicesByUserId(userId) {
  const safeUserId = Number(userId || 0)
  if (!safeUserId) return []
  const now = new Date()
  const [rows] = await pool.execute(
    `SELECT
        id,
        device_name,
        user_agent,
        last_ip,
        last_used_at,
        expires_at,
        created_at
     FROM admin_trusted_devices
     WHERE user_id = ?
       AND revoked_at IS NULL
       AND expires_at > ?
     ORDER BY created_at DESC`,
    [safeUserId, now]
  )
  return rows
}

async function revokeTrustedDeviceById(deviceId, userId) {
  const safeDeviceId = Number(deviceId || 0)
  const safeUserId = Number(userId || 0)
  if (!safeDeviceId || !safeUserId) return null
  const [rows] = await pool.execute(
    `SELECT
        id,
        device_name,
        user_agent,
        last_ip,
        last_used_at,
        expires_at,
        created_at
     FROM admin_trusted_devices
     WHERE id = ?
       AND user_id = ?
       AND revoked_at IS NULL
     LIMIT 1`,
    [safeDeviceId, safeUserId]
  )
  if (!rows.length) return null

  await pool.execute(
    `UPDATE admin_trusted_devices
     SET revoked_at = NOW(),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
       AND user_id = ?`,
    [safeDeviceId, safeUserId]
  )
  return rows[0]
}

async function revokeAllTrustedDevicesByUserId(userId) {
  const safeUserId = Number(userId || 0)
  if (!safeUserId) return 0
  const [result] = await pool.execute(
    `UPDATE admin_trusted_devices
     SET revoked_at = NOW(),
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ?
       AND revoked_at IS NULL`,
    [safeUserId]
  )
  return Number(result?.affectedRows || 0)
}

async function refreshTrustedDeviceRecord(deviceId, req, deviceName = '') {
  const safeDeviceId = Number(deviceId || 0)
  if (!safeDeviceId) return null
  const expiresAt = new Date(Date.now() + ADMIN_TRUSTED_DEVICE_TTL_MS)
  await pool.execute(
    `UPDATE admin_trusted_devices
     SET device_name = COALESCE(?, device_name),
         user_agent = ?,
         last_ip = ?,
         last_used_at = NOW(),
         expires_at = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      String(deviceName || '').trim() || null,
      String(req.headers['user-agent'] || '').trim() || null,
      getClientIpAddress(req) || null,
      expiresAt,
      safeDeviceId
    ]
  )

  const [rows] = await pool.execute(
    `SELECT
        id,
        user_id,
        device_name,
        user_agent,
        last_ip,
        last_used_at,
        expires_at,
        created_at
     FROM admin_trusted_devices
     WHERE id = ?
     LIMIT 1`,
    [safeDeviceId]
  )
  return rows[0] || null
}

function buildAdminStepUpSessionFingerprint(req) {
  const userAgent = String(req.headers['user-agent'] || '').trim()
  const ip = getClientIpAddress(req)
  return `${ip}::${userAgent}`
}

function pruneExpiredAdminStepUpChallenges() {
  const now = Date.now()
  for (const [challengeToken, challenge] of adminStepUpChallenges.entries()) {
    if (!challenge || challenge.expiresAt <= now || challenge.consumedAt) {
      adminStepUpChallenges.delete(challengeToken)
    }
  }
}

function cleanupAdminStepUpChallengesForUser(userId) {
  const safeUserId = Number(userId || 0)
  if (!safeUserId) return
  pruneExpiredAdminStepUpChallenges()
  const activeChallenges = []
  for (const [challengeToken, challenge] of adminStepUpChallenges.entries()) {
    if (Number(challenge?.userId || 0) !== safeUserId) continue
    activeChallenges.push([challengeToken, challenge])
  }
  activeChallenges
    .sort((left, right) => Number(left[1]?.createdAt || 0) - Number(right[1]?.createdAt || 0))
    .slice(0, Math.max(0, activeChallenges.length - ADMIN_STEP_UP_MAX_ACTIVE_CHALLENGES_PER_USER))
    .forEach(([challengeToken]) => {
      adminStepUpChallenges.delete(challengeToken)
    })
}

function pruneExpiredAdminPasskeyRegistrationChallenges() {
  const now = Date.now()
  for (const [challengeToken, challenge] of adminPasskeyRegistrationChallenges.entries()) {
    if (!challenge || challenge.expiresAt <= now || challenge.consumedAt) {
      adminPasskeyRegistrationChallenges.delete(challengeToken)
    }
  }
}

function cleanupAdminPasskeyRegistrationChallengesForUser(userId) {
  const safeUserId = Number(userId || 0)
  if (!safeUserId) return
  pruneExpiredAdminPasskeyRegistrationChallenges()
  const activeChallenges = []
  for (const [challengeToken, challenge] of adminPasskeyRegistrationChallenges.entries()) {
    if (Number(challenge?.userId || 0) !== safeUserId) continue
    activeChallenges.push([challengeToken, challenge])
  }
  activeChallenges
    .sort((left, right) => Number(left[1]?.createdAt || 0) - Number(right[1]?.createdAt || 0))
    .slice(0, Math.max(0, activeChallenges.length - ADMIN_STEP_UP_MAX_ACTIVE_CHALLENGES_PER_USER))
    .forEach(([challengeToken]) => {
      adminPasskeyRegistrationChallenges.delete(challengeToken)
    })
}

function getAdminStepUpPolicyByAction(action) {
  const normalizedAction = String(action || '').trim()
  return ADMIN_STEP_UP_POLICY_BY_ACTION[normalizedAction] || null
}

function issueAdminStepUpChallenge(req, auth, policy, challengeValue = '') {
  pruneExpiredAdminStepUpChallenges()

  const challengeToken = crypto.randomBytes(24).toString('base64url')
  const webauthnChallenge = String(challengeValue || '').trim() || crypto.randomBytes(32).toString('base64url')
  const now = Date.now()
  const challengeRecord = {
    challengeToken,
    challenge: webauthnChallenge,
    userId: Number(auth?.userId || 0),
    username: String(auth?.username || '').trim(),
    action: policy.action,
    createdAt: now,
    expiresAt: now + ADMIN_STEP_UP_CHALLENGE_TTL_MS,
    consumedAt: 0,
    sessionFingerprint: buildAdminStepUpSessionFingerprint(req),
    clientIp: getClientIpAddress(req),
    userAgent: String(req.headers['user-agent'] || '').trim()
  }

  adminStepUpChallenges.set(challengeToken, challengeRecord)
  cleanupAdminStepUpChallengesForUser(challengeRecord.userId)
  return challengeRecord
}

function issueAdminPasskeyRegistrationChallenge(req, auth, metadata = {}) {
  pruneExpiredAdminPasskeyRegistrationChallenges()

  const challengeToken = crypto.randomBytes(24).toString('base64url')
  const challengeRecord = {
    challengeToken,
    challenge: String(metadata.challenge || '').trim(),
    userId: Number(auth?.userId || 0),
    username: String(auth?.username || '').trim(),
    deviceName: String(metadata.deviceName || '').trim(),
    createdAt: Date.now(),
    expiresAt: Date.now() + ADMIN_PASSKEY_REGISTRATION_TTL_MS,
    consumedAt: 0,
    sessionFingerprint: buildAdminStepUpSessionFingerprint(req),
    clientIp: getClientIpAddress(req),
    userAgent: String(req.headers['user-agent'] || '').trim()
  }

  adminPasskeyRegistrationChallenges.set(challengeToken, challengeRecord)
  cleanupAdminPasskeyRegistrationChallengesForUser(challengeRecord.userId)
  return challengeRecord
}

function getAdminStepUpChallenge(challengeToken) {
  pruneExpiredAdminStepUpChallenges()
  const normalizedToken = String(challengeToken || '').trim()
  if (!normalizedToken) return null
  return adminStepUpChallenges.get(normalizedToken) || null
}

function markAdminStepUpChallengeConsumed(challengeToken) {
  const challenge = getAdminStepUpChallenge(challengeToken)
  if (!challenge) return null
  challenge.consumedAt = Date.now()
  adminStepUpChallenges.set(challengeToken, challenge)
  return challenge
}

function getAdminPasskeyRegistrationChallenge(challengeToken) {
  pruneExpiredAdminPasskeyRegistrationChallenges()
  const normalizedToken = String(challengeToken || '').trim()
  if (!normalizedToken) return null
  return adminPasskeyRegistrationChallenges.get(normalizedToken) || null
}

function markAdminPasskeyRegistrationChallengeConsumed(challengeToken) {
  const challenge = getAdminPasskeyRegistrationChallenge(challengeToken)
  if (!challenge) return null
  challenge.consumedAt = Date.now()
  adminPasskeyRegistrationChallenges.set(challengeToken, challenge)
  return challenge
}

function buildAdminStepUpPublicKeyOptions(req, challengeRecord) {
  const rpId = getAdminPasskeyRpId(req)

  return {
    challenge: challengeRecord.challenge,
    timeout: ADMIN_STEP_UP_CHALLENGE_TTL_MS,
    rpId,
    rp: {
      id: rpId,
      name: ADMIN_PASSKEY_RP_NAME
    },
    userVerification: 'required',
    allowCredentials: [],
    extensions: {
      action: challengeRecord.action
    }
  }
}

async function refreshAdminStepUpSession(req, res, authUser, options = {}) {
  const hasExplicitStepUpVerifiedAt = Object.prototype.hasOwnProperty.call(options, 'stepUpVerifiedAt')
  const nextSessionState = {
    sessionId: String(options.sessionId || req.auth?.sid || req.auth?.sessionId || '').trim(),
    authLevel: String(options.authLevel || req.auth?.authLevel || 'password').trim() || 'password',
    stepUpVerifiedAt: hasExplicitStepUpVerifiedAt
      ? Math.max(0, Number(options.stepUpVerifiedAt || 0) || 0)
      : (Number(req.auth?.stepUpVerifiedAt || Date.now()) || Date.now()),
    trustedDevice: Boolean(options.trustedDevice ?? req.auth?.trustedDevice),
    trustedDeviceId: String(options.trustedDeviceId || req.auth?.trustedDeviceId || '').trim(),
    amr: Array.isArray(options.amr) && options.amr.length
      ? options.amr
      : Array.isArray(req.auth?.amr) && req.auth.amr.length
        ? req.auth.amr
        : ['pwd']
  }
  const { token, sessionId, tokenMaxAgeMs } = await issueAuthSession(req, authUser, nextSessionState, {
    preserveSessionTtl: true
  })
  setAuthCookie(req, res, token, { maxAgeMs: tokenMaxAgeMs })
  nextSessionState.sessionId = sessionId
  return nextSessionState
}

function getCookieToken(req) {
  const cookies = parseCookieHeader(req.headers.cookie || '')
  return String(cookies[AUTH_COOKIE_NAME] || '').trim()
}

function resolveRequestToken(req) {
  const authHeader = req.headers.authorization || ''
  const [scheme, token] = authHeader.split(' ')
  if (scheme === 'Bearer' && token) {
    return String(token).trim()
  }
  return getCookieToken(req)
}

function parseSafeDateTime(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function isUserCurrentlyBanned(user) {
  const bannedUntil = parseSafeDateTime(user?.banned_until)
  return Boolean(bannedUntil && bannedUntil.getTime() > Date.now())
}

function formatDateTimeLabel(value) {
  const date = parseSafeDateTime(value)
  if (!date) return '--'
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function buildBannedUserMessage(user) {
  return `账号已被封禁至 ${formatDateTimeLabel(user?.banned_until)}`
}

// 认证热路径用户信息短 TTL 缓存：authRequired 每个需登录请求都会读取 users 表，
// 这里用进程内缓存消掉这次查询。角色/封禁等安全变更务必调用 invalidateAuthUserCache
// （admin 端点已接入；其余路径最多存在 TTL 时长的延迟窗口）
const AUTH_USER_CACHE_TTL_MS = Math.max(
  1_000,
  Number(process.env.AUTH_USER_CACHE_TTL_MS != null ? process.env.AUTH_USER_CACHE_TTL_MS : 30_000) || 30_000
)
const AUTH_USER_CACHE_MAX_ENTRIES = 2000
const authUserCache = new Map()

function invalidateAuthUserCache(userId) {
  if (Number(userId || 0) > 0) {
    authUserCache.delete(Number(userId))
    return
  }
  authUserCache.clear()
}

async function fetchAuthUserById(userId) {
  const safeUserId = Number(userId || 0)
  if (!safeUserId) return null
  const cached = authUserCache.get(safeUserId)
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.user }
  }
  const [rows] = await pool.execute(
    'SELECT id, username, phone, role, banned_until, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
    [safeUserId]
  )
  const user = rows[0] || null
  if (user) {
    if (authUserCache.size >= AUTH_USER_CACHE_MAX_ENTRIES) {
      authUserCache.clear()
    }
    authUserCache.set(safeUserId, { user, expiresAt: Date.now() + AUTH_USER_CACHE_TTL_MS })
  }
  return user ? { ...user } : null
}

/**
 * JWT认证中间件
 *
 * 验证流程：
 * 1. 从请求头 Authorization 中提取 Bearer Token
 * 2. 用jwt.verify验证Token签名和有效期
 * 3. 将解码后的用户信息挂载到 req.auth 上
 * 4. 验证通过则 next() 放行，失败则返回401
 *
 * 使用方式：在需要登录的路由上添加 authRequired 参数
 *   app.post('/api/something', authRequired, handler)
 */
async function authRequired(req, res, next) {
  const token = resolveRequestToken(req)

  // 检查是否携带登录凭证（Authorization 或 httpOnly Cookie）
  if (!token) {
    return res.status(401).json({ message: '未登录或登录已过期' })
  }

  if (!isTrustedWriteOrigin(req)) {
    return res.status(403).json({ message: '请求来源不受信任，请刷新页面后重试' })
  }

  try {
    // 验证Token签名和过期时间，解码出payload
    const decoded = verifyAuthToken(token)
    const sessionRecord = await validateDecodedSession(decoded, { returnSession: true })
    if (!sessionRecord) {
      return res.status(401).json({ message: '登录会话已失效，请重新登录' })
    }
    const authUser = await fetchAuthUserById(decoded.userId)
    const trustedDeviceToken = getTrustedDeviceTokenFromRequest(req)
    const trustedDeviceRecord = trustedDeviceToken
      ? await getTrustedDeviceRecordByToken(trustedDeviceToken, decoded.userId)
      : null
    if (trustedDeviceRecord?.id) {
      await touchTrustedDeviceRecord(trustedDeviceRecord.id, req)
    }
    if (!authUser) {
      return res.status(401).json({ message: '账号不存在或已被删除' })
    }
    if (isUserCurrentlyBanned(authUser)) {
      return res.status(403).json({ message: buildBannedUserMessage(authUser) })
    }
    // 将用户信息挂载到request对象上，始终以数据库中的最新角色和状态为准
    req.auth = {
      ...decoded,
      userId: authUser.id,
      sessionId: String(decoded?.sid || '').trim(),
      sessionCreatedAt: Number(sessionRecord?.createdAt || 0) || 0,
      sessionUpdatedAt: Number(sessionRecord?.updatedAt || 0) || 0,
      username: authUser.username,
      phone: authUser.phone,
      role: authUser.role,
      bannedUntil: authUser.banned_until || null,
      trustedDevice: Boolean(trustedDeviceRecord?.id),
      trustedDeviceId: trustedDeviceRecord?.id ? String(trustedDeviceRecord.id) : ''
    }
    if (shouldAutoRenewAuthToken(decoded, authUser) && !hasBearerAuthHeader(req)) {
      const { token: renewedToken, tokenMaxAgeMs } = await issueAuthSession(req, authUser, {
        sessionId: req.auth.sessionId,
        authLevel: req.auth.authLevel,
        stepUpVerifiedAt: req.auth.stepUpVerifiedAt,
        trustedDevice: req.auth.trustedDevice,
        trustedDeviceId: req.auth.trustedDeviceId,
        amr: req.auth.amr,
        createdAt: req.auth.sessionCreatedAt
      }, {
        preserveSessionTtl: true
      })
      setAuthCookie(req, res, renewedToken, { maxAgeMs: tokenMaxAgeMs })
    } else {
      await touchAuthSession(req.auth.sessionId, {
        role: req.auth.role,
        authLevel: req.auth.authLevel,
        trustedDevice: req.auth.trustedDevice,
        trustedDeviceId: req.auth.trustedDeviceId,
        amr: req.auth.amr,
        userAgent: String(req.headers['user-agent'] || '').trim(),
        ip: getClientIpAddress(req),
        createdAt: req.auth.sessionCreatedAt
      })
    }
    next()
  } catch (_error) {
    // Token无效（过期/被篡改/格式错误）→ 返回401
    return res.status(401).json({ message: '无效的登录凭证' })
  }
}

function supportOnly(req, res, next) {
  if (!req.auth) {
    return res.status(401).json({ message: '未登录或登录已过期' })
  }
  if (String(req.auth.role || '') !== 'support') {
    return res.status(403).json({ message: '无权访问客服工作台' })
  }
  next()
}

function adminOnly(req, res, next) {
  if (!req.auth) {
    return res.status(401).json({ message: '未登录或登录已过期' })
  }
  if (String(req.auth.role || '') !== 'admin') {
    return res.status(403).json({ message: '无权访问管理员后台' })
  }
  next()
}

function hasPasskeyStepUp(auth = {}) {
  const authLevel = String(auth.authLevel || '').trim()
  const amr = Array.isArray(auth.amr) ? auth.amr : []
  return authLevel === 'passkey' || amr.includes('passkey')
}

function isStepUpFresh(verifiedAt, maxAgeMinutes) {
  const safeVerifiedAt = Number(verifiedAt || 0) || 0
  const safeMaxAgeMinutes = Math.max(1, Number(maxAgeMinutes || 0) || 0)
  if (!safeVerifiedAt) return false
  return (Date.now() - safeVerifiedAt) <= safeMaxAgeMinutes * 60 * 1000
}

function hasFreshPasskeyStepUp(auth = {}, maxAgeMinutes) {
  return hasPasskeyStepUp(auth) && isStepUpFresh(auth.stepUpVerifiedAt, maxAgeMinutes)
}

function requireStepUpAuth(policy = {}) {
  if (!ADMIN_PASSKEY_ENABLED) {
    return (_req, _res, next) => {
      next()
    }
  }
  // 策略级开关（如客服资金操作在完成 Passkey 绑定前保持关闭）
  if (policy.enabled === false) {
    return (_req, _res, next) => {
      next()
    }
  }

  const mergedPolicy = {
    action: String(policy.action || 'high_risk_admin_action').trim() || 'high_risk_admin_action',
    message: String(policy.message || '当前操作需要完成二次校验').trim() || '当前操作需要完成二次校验',
    maxAgeMinutes: Math.max(1, Number(policy.maxAgeMinutes || 15) || 15),
    requirePasskey: policy.requirePasskey !== false,
    requireTrustedDevice: Boolean(policy.requireTrustedDevice),
    allowTrustedDeviceBypassPasskey: Boolean(policy.allowTrustedDeviceBypassPasskey),
    allowedRoles: Array.isArray(policy.allowedRoles) && policy.allowedRoles.length
      ? policy.allowedRoles.map((item) => String(item || '').trim()).filter(Boolean)
      : ['admin']
  }

  return (req, res, next) => {
    if (!req.auth) {
      return res.status(401).json({ message: '未登录或登录已过期' })
    }
    if (!mergedPolicy.allowedRoles.includes(String(req.auth.role || '').trim())) {
      return res.status(403).json({ message: '当前角色无权执行该高危操作' })
    }

    const trustedDeviceActive = Boolean(req.auth.trustedDevice)
    const trustedDeviceSatisfied = !mergedPolicy.requireTrustedDevice || trustedDeviceActive
    const passkeyBypassedByTrustedDevice = mergedPolicy.allowTrustedDeviceBypassPasskey && trustedDeviceActive
    const passkeySatisfied = !mergedPolicy.requirePasskey
      || passkeyBypassedByTrustedDevice
      || hasFreshPasskeyStepUp(req.auth, mergedPolicy.maxAgeMinutes)

    if (passkeySatisfied && trustedDeviceSatisfied) {
      next()
      return
    }

    let reason = 'step_up_required'
    if (!trustedDeviceSatisfied) {
      reason = 'trusted_device_required'
    } else if (!hasPasskeyStepUp(req.auth)) {
      reason = 'passkey_required'
    } else if (!isStepUpFresh(req.auth.stepUpVerifiedAt, mergedPolicy.maxAgeMinutes)) {
      reason = 'step_up_expired'
    }

    return res.status(428).json({
      code: 'STEP_UP_REQUIRED',
      message: mergedPolicy.message,
      action: mergedPolicy.action,
      reason,
      policy: {
        maxAgeMinutes: mergedPolicy.maxAgeMinutes,
        requirePasskey: mergedPolicy.requirePasskey,
        requireTrustedDevice: mergedPolicy.requireTrustedDevice,
        allowTrustedDeviceBypassPasskey: mergedPolicy.allowTrustedDeviceBypassPasskey
      },
      stage: 'active'
    })
  }
}

async function getOptionalAuth(req) {
  const token = resolveRequestToken(req)
  if (!token) {
    return null
  }

  try {
    const decoded = verifyAuthToken(token)
    const sessionValid = await validateDecodedSession(decoded)
    if (!sessionValid) {
      return null
    }
    const authUser = await fetchAuthUserById(decoded.userId)
    if (!authUser || isUserCurrentlyBanned(authUser)) {
      return null
    }
    return {
      ...decoded,
      userId: authUser.id,
      sessionId: String(decoded?.sid || '').trim(),
      username: authUser.username,
      phone: authUser.phone,
      role: authUser.role,
      bannedUntil: authUser.banned_until || null
    }
  } catch (_error) {
    return null
  }
}

function getSocketToken(socket) {
  const authToken = String(socket.handshake?.auth?.token || '').trim()
  if (authToken) return authToken
  const authHeader = String(socket.handshake?.headers?.authorization || '').trim()
  const [scheme, token] = authHeader.split(' ')
  if (scheme === 'Bearer' && token) {
    return String(token || '').trim()
  }
  const cookies = parseCookieHeader(socket.handshake?.headers?.cookie || '')
  return String(cookies[AUTH_COOKIE_NAME] || '').trim()
}

async function logoutCurrentSession(req, res) {
  const token = resolveRequestToken(req)
  if (token && typeof revokeLoginSession === 'function') {
    try {
      const decoded = verifyAuthToken(token)
      const sessionId = String(decoded?.sid || '').trim()
      if (sessionId) {
        await revokeLoginSession(sessionId)
      }
    } catch (_error) {
      // 退出登录时即便 token 已过期，也应继续清 cookie。
    }
  }

  clearAuthCookie(req, res)
}

  return {
    buildAuthToken,
    verifyAuthToken,
    validateAuthSession: validateDecodedSession,
    issueAuthSession,
    logoutCurrentSession,
    setAuthCookie,
    setTrustedDeviceCookie,
    clearAuthCookie,
    clearTrustedDeviceCookie,
    getExpectedAdminPasskeyOrigins,
    getAdminPasskeyRpId,
    encodeBufferToBase64Url,
    normalizeCredentialIdFromRequest,
    ensureAdminPasskeySchema,
    ensureAdminTrustedDeviceSchema,
    findAdminPasskeyByCredentialId,
    listAdminPasskeysByUserId,
    buildStoredWebAuthnCredential,
    upsertAdminPasskeyCredential,
    revokeAdminPasskey,
    getTrustedDeviceRecordByToken,
    listTrustedDevicesByUserId,
    issueTrustedDeviceForCurrentSession,
    revokeTrustedDeviceById,
    revokeAllTrustedDevicesByUserId,
    refreshTrustedDeviceRecord,
    getTrustedDeviceTokenFromRequest,
    getAdminStepUpPolicyByAction,
    issueAdminStepUpChallenge,
    issueAdminPasskeyRegistrationChallenge,
    getAdminStepUpChallenge,
    markAdminStepUpChallengeConsumed,
    getAdminPasskeyRegistrationChallenge,
    markAdminPasskeyRegistrationChallengeConsumed,
    buildAdminStepUpPublicKeyOptions,
    buildAdminStepUpSessionFingerprint,
    refreshAdminStepUpSession,
    revokeAllLoginSessionsByUserId,
    touchAuthSession,
    updateAdminPasskeyUsage,
    fetchAuthUserById,
    invalidateAuthUserCache,
    isUserCurrentlyBanned,
    buildBannedUserMessage,
    authRequired,
    supportOnly,
    adminOnly,
    requireStepUpAuth,
    getOptionalAuth,
    getSocketToken
  }
}
