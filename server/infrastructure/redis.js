import crypto from 'crypto'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, '..', '.env') })

const REDIS_URL = String(process.env.REDIS_URL || '').trim()
const REDIS_HOST = String(process.env.REDIS_HOST || '').trim()
const REDIS_PORT = Math.max(1, Number(process.env.REDIS_PORT || 6379) || 6379)
const REDIS_USERNAME = String(process.env.REDIS_USERNAME || '').trim()
const REDIS_PASSWORD = String(process.env.REDIS_PASSWORD || '').trim()
const REDIS_DB = Math.max(0, Number(process.env.REDIS_DB || 0) || 0)
const REDIS_TLS = ['1', 'true', 'yes', 'on'].includes(String(process.env.REDIS_TLS || '').trim().toLowerCase())
const REDIS_CONNECT_TIMEOUT_MS = Math.max(1000, Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 10000) || 10000)
// 单条命令兜底超时：连接半开（TCP 未收到 FIN）时命令会无限挂起，
// 缓存类命令超时后按「Redis 不可用」降级处理，并强制销毁共享客户端触发重连
const REDIS_COMMAND_TIMEOUT_MS = Math.max(500, Number(process.env.REDIS_COMMAND_TIMEOUT_MS || 3000) || 3000)
const REDIS_STARTUP_CONNECT_TIMEOUT_MS = Math.min(2000, Math.max(1000, Number(process.env.REDIS_STARTUP_CONNECT_TIMEOUT_MS || 1500) || 1500))
const REDIS_RECONNECT_COOLDOWN_MS = Math.max(1000, Number(process.env.REDIS_RECONNECT_COOLDOWN_MS || 30000) || 30000)
const REDIS_KEY_PREFIX = String(process.env.REDIS_KEY_PREFIX || 'my-app').trim() || 'my-app'
const LISTING_DETAIL_CACHE_TTL_SECONDS = Math.max(30, Number(process.env.LISTING_DETAIL_CACHE_TTL_SECONDS || 180) || 180)
const LOGIN_SESSION_TTL_SECONDS = Math.max(60, Number(process.env.LOGIN_SESSION_TTL_SECONDS || 7 * 24 * 60 * 60) || 7 * 24 * 60 * 60)
const SMS_CODE_TTL_SECONDS = Math.max(60, Number(process.env.SMS_CODE_TTL_SECONDS || 300) || 300)
const SMS_CODE_SEND_INTERVAL_SECONDS = Math.max(30, Number(process.env.SMS_CODE_SEND_INTERVAL_SECONDS || 60) || 60)
const SMS_CODE_VERIFY_MAX_ATTEMPTS = Math.max(3, Number(process.env.SMS_CODE_VERIFY_MAX_ATTEMPTS || 5) || 5)
const SMS_CODE_VERIFY_LOCK_SECONDS = Math.max(300, Number(process.env.SMS_CODE_VERIFY_LOCK_SECONDS || 15 * 60) || 15 * 60)
const ORDER_LOCK_TTL_MS = Math.max(3000, Number(process.env.ORDER_LOCK_TTL_MS || 15000) || 15000)
const CHAT_ONLINE_TTL_SECONDS = Math.max(30, Number(process.env.CHAT_ONLINE_TTL_SECONDS || 120) || 120)

let sharedRedisClientPromise = null
let hasLoggedRedisReady = false
let hasLoggedRedisFallback = false
let redisReconnectBlockedUntil = 0
const memoryLoginSessionStore = new Map()
const memoryUserSessionIndex = new Map()

function buildRedisKey(...parts) {
  return [REDIS_KEY_PREFIX, ...parts.map((part) => String(part || '').trim()).filter(Boolean)].join(':')
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(String(value || ''))
  } catch (_error) {
    return fallback
  }
}

function getRedisConnectionDisplayName() {
  if (REDIS_URL) {
    try {
      const parsed = new URL(REDIS_URL)
      return `${parsed.protocol}//${parsed.hostname}:${parsed.port || (parsed.protocol === 'rediss:' ? '6379' : '6379')}`
    } catch (_error) {
      return 'redis-url'
    }
  }

  if (REDIS_HOST) {
    return `${REDIS_TLS ? 'rediss' : 'redis'}://${REDIS_HOST}:${REDIS_PORT}`
  }

  return ''
}

function buildRedisSocketOptions(overrides = {}) {
  return {
    connectTimeout: Math.min(REDIS_CONNECT_TIMEOUT_MS, REDIS_STARTUP_CONNECT_TIMEOUT_MS),
    reconnectStrategy: false,
    // TCP keepalive：长空闲连接被网络路径静默丢弃时，内核探测包能及时发现并触发重连，
    // 避免第一条「复活后」命令踩进半开连接无限挂起（与 db.js 的 MySQL keepalive 同理）
    keepAlive: 30_000,
    ...overrides
  }
}

function buildRedisClientOptions() {
  if (REDIS_URL) {
    const options = {
      url: REDIS_URL,
      socket: buildRedisSocketOptions()
    }
    if (REDIS_TLS && !String(REDIS_URL).startsWith('rediss://')) {
      options.socket.tls = true
    }
    return options
  }

  if (!REDIS_HOST) {
    return null
  }

  const options = {
    socket: buildRedisSocketOptions({
      host: REDIS_HOST,
      port: REDIS_PORT,
      tls: REDIS_TLS
    }),
    database: REDIS_DB
  }

  if (REDIS_USERNAME) {
    options.username = REDIS_USERNAME
  }
  if (REDIS_PASSWORD) {
    options.password = REDIS_PASSWORD
  }

  return options
}

async function createSharedRedisClient() {
  const redisClientOptions = buildRedisClientOptions()
  if (!redisClientOptions) {
    return null
  }

  try {
    const { createClient } = await import('redis')
    const client = createClient(redisClientOptions)
    client.on('error', (error) => {
      console.error('[redis] client-error', error?.message || error)
    })
    client.on('end', () => {
      sharedRedisClientPromise = null
    })
    await client.connect()
    redisReconnectBlockedUntil = 0

    if (!hasLoggedRedisReady) {
      hasLoggedRedisReady = true
      console.log('[redis] shared client enabled:', getRedisConnectionDisplayName())
    }

    return client
  } catch (error) {
    redisReconnectBlockedUntil = Date.now() + REDIS_RECONNECT_COOLDOWN_MS
    if (!hasLoggedRedisFallback) {
      hasLoggedRedisFallback = true
      console.warn('[redis] unavailable, fallback to database/memory path:', error?.message || error)
    }
    return null
  }
}

export async function getRedisClient() {
  if (sharedRedisClientPromise) {
    return sharedRedisClientPromise
  }

  if (redisReconnectBlockedUntil > Date.now()) {
    return null
  }

  const connectPromise = createSharedRedisClient()
  sharedRedisClientPromise = connectPromise

  const client = await connectPromise
  if (!client && sharedRedisClientPromise === connectPromise) {
    sharedRedisClientPromise = null
  }

  return client
}

export function isRedisConfigured() {
  return Boolean(REDIS_URL || REDIS_HOST)
}

export function getRedisRuntimeConfig() {
  return {
    REDIS_URL,
    REDIS_HOST,
    REDIS_PORT,
    REDIS_USERNAME,
    REDIS_DB,
    REDIS_TLS,
    REDIS_CONNECT_TIMEOUT_MS,
    REDIS_STARTUP_CONNECT_TIMEOUT_MS,
    REDIS_RECONNECT_COOLDOWN_MS,
    REDIS_KEY_PREFIX,
    LISTING_DETAIL_CACHE_TTL_SECONDS,
    LOGIN_SESSION_TTL_SECONDS,
    SMS_CODE_TTL_SECONDS,
    SMS_CODE_SEND_INTERVAL_SECONDS,
    ORDER_LOCK_TTL_MS,
    CHAT_ONLINE_TTL_SECONDS
  }
}

export function buildListingDetailCacheKey(listingId) {
  return buildRedisKey('listing', 'detail', Number(listingId || 0))
}

function resetSharedRedisClient() {
  const pendingPromise = sharedRedisClientPromise
  sharedRedisClientPromise = null
  Promise.resolve(pendingPromise).then((client) => {
    if (!client) return
    try {
      if (typeof client.destroy === 'function') {
        client.destroy()
      } else if (typeof client.disconnect === 'function') {
        client.disconnect()
      }
    } catch (_error) {
      // 忽略销毁失败，下次调用会重新建连
    }
  }).catch(() => {})
}

async function runCacheCommand(command, fallbackValue) {
  const client = await getRedisClient()
  if (!client) return fallbackValue

  let timedOut = false
  try {
    return await Promise.race([
      Promise.resolve(command(client)).catch((error) => {
        console.error('[redis] cache command failed:', error?.message || error)
        return fallbackValue
      }),
      new Promise((resolve) => {
        setTimeout(() => {
          timedOut = true
          resolve(fallbackValue)
        }, REDIS_COMMAND_TIMEOUT_MS)
      })
    ])
  } finally {
    if (timedOut) {
      console.error(`[redis] cache command timed out after ${REDIS_COMMAND_TIMEOUT_MS}ms, resetting shared client`)
      resetSharedRedisClient()
    }
  }
}

export async function getListingDetailCache(listingId) {
  const raw = await runCacheCommand(
    (client) => client.get(buildListingDetailCacheKey(listingId)),
    null
  )
  return raw ? safeJsonParse(raw, null) : null
}

export async function setListingDetailCache(listingId, payload, ttlSeconds = LISTING_DETAIL_CACHE_TTL_SECONDS) {
  const ok = await runCacheCommand(
    (client) => client.set(
      buildListingDetailCacheKey(listingId),
      JSON.stringify(payload),
      { EX: Math.max(30, Number(ttlSeconds || 0) || LISTING_DETAIL_CACHE_TTL_SECONDS) }
    ),
    false
  )
  return Boolean(ok)
}

export async function invalidateListingDetailCache(listingId) {
  const safeListingId = Number(listingId || 0)
  if (!safeListingId) return 0
  return Number(
    await runCacheCommand(
      (client) => client.del(buildListingDetailCacheKey(safeListingId)),
      0
    )
  ) || 0
}

export async function invalidateListingDetailCaches(listingIds = []) {
  const keys = [...new Set(
    (Array.isArray(listingIds) ? listingIds : [])
      .map((listingId) => Number(listingId || 0))
      .filter((listingId) => listingId > 0)
      .map((listingId) => buildListingDetailCacheKey(listingId))
  )]
  if (!keys.length) return 0
  return Number(
    await runCacheCommand((client) => client.del(keys), 0)
  ) || 0
}

function buildLoginSessionKey(sessionId) {
  return buildRedisKey('auth', 'session', sessionId)
}

function buildUserLoginSessionIndexKey(userId) {
  return buildRedisKey('auth', 'user-sessions', Number(userId || 0))
}

function cleanupExpiredMemoryLoginSessions() {
  const now = Date.now()
  for (const [sessionId, session] of memoryLoginSessionStore.entries()) {
    if (Number(session?.expiresAt || 0) <= now) {
      const safeUserId = Number(session?.userId || 0)
      if (safeUserId) {
        const sessionSet = memoryUserSessionIndex.get(safeUserId)
        sessionSet?.delete(sessionId)
        if (!sessionSet?.size) {
          memoryUserSessionIndex.delete(safeUserId)
        }
      }
      memoryLoginSessionStore.delete(sessionId)
    }
  }
}

function addMemoryLoginSessionIndex(userId, sessionId) {
  const safeUserId = Number(userId || 0)
  const safeSessionId = String(sessionId || '').trim()
  if (!safeUserId || !safeSessionId) return
  const sessionSet = memoryUserSessionIndex.get(safeUserId) || new Set()
  sessionSet.add(safeSessionId)
  memoryUserSessionIndex.set(safeUserId, sessionSet)
}

function removeMemoryLoginSessionIndex(userId, sessionId) {
  const safeUserId = Number(userId || 0)
  const safeSessionId = String(sessionId || '').trim()
  if (!safeUserId || !safeSessionId) return
  const sessionSet = memoryUserSessionIndex.get(safeUserId)
  if (!sessionSet) return
  sessionSet.delete(safeSessionId)
  if (!sessionSet.size) {
    memoryUserSessionIndex.delete(safeUserId)
  }
}

export function createSessionId() {
  return crypto.randomBytes(24).toString('base64url')
}

export async function createLoginSession({
  sessionId,
  userId,
  metadata = {},
  ttlSeconds = LOGIN_SESSION_TTL_SECONDS
}) {
  const client = await getRedisClient()

  const safeSessionId = String(sessionId || '').trim()
  const safeUserId = Number(userId || 0)
  if (!safeSessionId || !safeUserId) return false

  const sessionPayload = {
    sessionId: safeSessionId,
    userId: safeUserId,
    authLevel: String(metadata?.authLevel || 'password').trim() || 'password',
    trustedDevice: Boolean(metadata?.trustedDevice),
    trustedDeviceId: String(metadata?.trustedDeviceId || '').trim(),
    amr: Array.isArray(metadata?.amr) ? metadata.amr : ['pwd'],
    userAgent: String(metadata?.userAgent || '').trim().slice(0, 255),
    ip: String(metadata?.ip || '').trim().slice(0, 64),
    createdAt: Number(metadata?.createdAt || Date.now()) || Date.now(),
    updatedAt: Date.now()
  }

  if (!client) {
    cleanupExpiredMemoryLoginSessions()
    memoryLoginSessionStore.set(safeSessionId, {
      ...sessionPayload,
      expiresAt: Date.now() + Math.max(60, Number(ttlSeconds || 0) || LOGIN_SESSION_TTL_SECONDS) * 1000
    })
    addMemoryLoginSessionIndex(safeUserId, safeSessionId)
    return true
  }

  await client.set(
    buildLoginSessionKey(safeSessionId),
    JSON.stringify(sessionPayload),
    { EX: Math.max(60, Number(ttlSeconds || 0) || LOGIN_SESSION_TTL_SECONDS) }
  )
  await client.sAdd(buildUserLoginSessionIndexKey(safeUserId), safeSessionId)
  return true
}

export async function getLoginSession(sessionId) {
  const client = await getRedisClient()
  const safeSessionId = String(sessionId || '').trim()
  if (!safeSessionId) return null
  if (!client) {
    cleanupExpiredMemoryLoginSessions()
    const session = memoryLoginSessionStore.get(safeSessionId)
    if (!session) return null
    return {
      ...session,
      expiresAt: undefined
    }
  }
  const raw = await client.get(buildLoginSessionKey(safeSessionId))
  return raw ? safeJsonParse(raw, null) : null
}

export async function revokeLoginSession(sessionId) {
  const client = await getRedisClient()
  const safeSessionId = String(sessionId || '').trim()
  if (!safeSessionId) return 0
  if (!client) {
    cleanupExpiredMemoryLoginSessions()
    const session = memoryLoginSessionStore.get(safeSessionId)
    if (!session) return 0
    removeMemoryLoginSessionIndex(session.userId, safeSessionId)
    return memoryLoginSessionStore.delete(safeSessionId) ? 1 : 0
  }
  const session = await getLoginSession(safeSessionId)
  const deletedCount = await client.del(buildLoginSessionKey(safeSessionId))
  if (Number(session?.userId || 0)) {
    await client.sRem(buildUserLoginSessionIndexKey(session.userId), safeSessionId)
  }
  return deletedCount
}

export async function touchLoginSession(sessionId, metadata = {}) {
  const client = await getRedisClient()
  const safeSessionId = String(sessionId || '').trim()
  if (!safeSessionId) return null

  if (!client) {
    cleanupExpiredMemoryLoginSessions()
    const currentSession = memoryLoginSessionStore.get(safeSessionId)
    if (!currentSession) return null
    const nextSession = {
      ...currentSession,
      authLevel: String(metadata?.authLevel || currentSession.authLevel || 'password').trim() || 'password',
      trustedDevice: metadata?.trustedDevice ?? currentSession.trustedDevice,
      trustedDeviceId: String(metadata?.trustedDeviceId ?? currentSession.trustedDeviceId ?? '').trim(),
      amr: Array.isArray(metadata?.amr) && metadata.amr.length
        ? metadata.amr
        : Array.isArray(currentSession.amr) && currentSession.amr.length
          ? currentSession.amr
          : ['pwd'],
      userAgent: String(metadata?.userAgent || currentSession.userAgent || '').trim().slice(0, 255),
      ip: String(metadata?.ip || currentSession.ip || '').trim().slice(0, 64),
      role: String(metadata?.role || currentSession.role || '').trim(),
      createdAt: Number(metadata?.createdAt || currentSession.createdAt || Date.now()) || Date.now(),
      updatedAt: Date.now()
    }
    memoryLoginSessionStore.set(safeSessionId, nextSession)
    return {
      ...nextSession,
      expiresAt: undefined
    }
  }

  const currentSession = await getLoginSession(safeSessionId)
  if (!currentSession) return null

  const nextSession = {
    ...currentSession,
    authLevel: String(metadata?.authLevel || currentSession.authLevel || 'password').trim() || 'password',
    trustedDevice: metadata?.trustedDevice ?? currentSession.trustedDevice,
    trustedDeviceId: String(metadata?.trustedDeviceId ?? currentSession.trustedDeviceId ?? '').trim(),
    amr: Array.isArray(metadata?.amr) && metadata.amr.length
      ? metadata.amr
      : Array.isArray(currentSession.amr) && currentSession.amr.length
        ? currentSession.amr
        : ['pwd'],
    userAgent: String(metadata?.userAgent || currentSession.userAgent || '').trim().slice(0, 255),
    ip: String(metadata?.ip || currentSession.ip || '').trim().slice(0, 64),
    role: String(metadata?.role || currentSession.role || '').trim(),
    createdAt: Number(metadata?.createdAt || currentSession.createdAt || Date.now()) || Date.now(),
    updatedAt: Date.now()
  }

  await client.set(
    buildLoginSessionKey(safeSessionId),
    JSON.stringify(nextSession),
    { KEEPTTL: true }
  )
  return nextSession
}

export async function revokeAllLoginSessionsByUserId(userId) {
  const client = await getRedisClient()
  const safeUserId = Number(userId || 0)
  if (!safeUserId) return 0

  if (!client) {
    cleanupExpiredMemoryLoginSessions()
    const sessionIds = Array.from(memoryUserSessionIndex.get(safeUserId) || [])
    sessionIds.forEach((sessionId) => {
      memoryLoginSessionStore.delete(sessionId)
      removeMemoryLoginSessionIndex(safeUserId, sessionId)
    })
    return sessionIds.length
  }

  const sessionIndexKey = buildUserLoginSessionIndexKey(safeUserId)
  const sessionIds = await client.sMembers(sessionIndexKey)
  const safeSessionIds = [...new Set(
    (Array.isArray(sessionIds) ? sessionIds : [])
      .map((sessionId) => String(sessionId || '').trim())
      .filter(Boolean)
  )]
  const loginSessionKeys = safeSessionIds.map((sessionId) => buildLoginSessionKey(sessionId))
  if (loginSessionKeys.length) {
    await client.del(loginSessionKeys)
  }
  await client.del(sessionIndexKey)
  return safeSessionIds.length
}

export async function persistSmsVerificationCode({
  scene = 'login',
  phone,
  code,
  ttlSeconds = SMS_CODE_TTL_SECONDS,
  sendIntervalSeconds = SMS_CODE_SEND_INTERVAL_SECONDS,
  metadata = {}
}) {
  const client = await getRedisClient()
  if (!client) return { ok: false, retryAfterSeconds: 0 }

  const safeScene = String(scene || 'login').trim() || 'login'
  const safePhone = String(phone || '').trim()
  const safeCode = String(code || '').trim()
  if (!safePhone || !safeCode) {
    return { ok: false, retryAfterSeconds: 0 }
  }

  const codeKey = buildRedisKey('sms', safeScene, safePhone, 'code')
  const sendLockKey = buildRedisKey('sms', safeScene, safePhone, 'send-lock')
  const verifyFailKey = buildRedisKey('sms', safeScene, safePhone, 'verify-fail')
  const verifyLockKey = buildRedisKey('sms', safeScene, safePhone, 'verify-lock')
  const sendLocked = await client.set(sendLockKey, '1', {
    NX: true,
    EX: Math.max(30, Number(sendIntervalSeconds || 0) || SMS_CODE_SEND_INTERVAL_SECONDS)
  })

  if (sendLocked !== 'OK') {
    const retryAfterSeconds = Number(await client.ttl(sendLockKey) || 0)
    return {
      ok: false,
      retryAfterSeconds: retryAfterSeconds > 0 ? retryAfterSeconds : Math.max(30, Number(sendIntervalSeconds || 0) || SMS_CODE_SEND_INTERVAL_SECONDS)
    }
  }

  await client.set(
    codeKey,
    JSON.stringify({
      code: safeCode,
      phone: safePhone,
      scene: safeScene,
      createdAt: Date.now(),
      metadata
    }),
    { EX: Math.max(60, Number(ttlSeconds || 0) || SMS_CODE_TTL_SECONDS) }
  )
  // 只清空失败计数；验证锁定不随新码下发而解除——
  // 否则攻击者可反复申请新码重置锁定，把每日爆破空间从 5 次放大到 50 次
  await client.del(verifyFailKey)

  return { ok: true, retryAfterSeconds: 0 }
}

export async function clearSmsVerificationState({
  scene = 'login',
  phone,
  clearCode = true,
  clearSendLock = true,
  clearVerifyState = true
}) {
  const client = await getRedisClient()
  if (!client) return false

  const safeScene = String(scene || 'login').trim() || 'login'
  const safePhone = String(phone || '').trim()
  if (!safePhone) return false

  const keys = []
  if (clearCode) {
    keys.push(buildRedisKey('sms', safeScene, safePhone, 'code'))
  }
  if (clearSendLock) {
    keys.push(buildRedisKey('sms', safeScene, safePhone, 'send-lock'))
  }
  if (clearVerifyState) {
    keys.push(
      buildRedisKey('sms', safeScene, safePhone, 'verify-fail'),
      buildRedisKey('sms', safeScene, safePhone, 'verify-lock')
    )
  }
  if (!keys.length) return true

  await client.del(keys)
  return true
}

export async function verifySmsVerificationCode({
  scene = 'login',
  phone,
  code,
  consume = true,
  ttlSeconds = SMS_CODE_TTL_SECONDS,
  verifyMaxAttempts = SMS_CODE_VERIFY_MAX_ATTEMPTS,
  verifyLockSeconds = SMS_CODE_VERIFY_LOCK_SECONDS
}) {
  const client = await getRedisClient()
  if (!client) return { ok: false, reason: 'redis_unavailable' }

  const safeScene = String(scene || 'login').trim() || 'login'
  const safePhone = String(phone || '').trim()
  const safeCode = String(code || '').trim()
  if (!safePhone || !safeCode) return { ok: false, reason: 'invalid_payload' }

  const codeKey = buildRedisKey('sms', safeScene, safePhone, 'code')
  const verifyFailKey = buildRedisKey('sms', safeScene, safePhone, 'verify-fail')
  const verifyLockKey = buildRedisKey('sms', safeScene, safePhone, 'verify-lock')
  const verifyLockTtl = Number(await client.ttl(verifyLockKey) || 0)
  if (verifyLockTtl > 0) {
    return {
      ok: false,
      reason: 'verify_locked',
      retryAfterSeconds: verifyLockTtl,
      maxAttempts: verifyMaxAttempts,
      remainingAttempts: 0
    }
  }

  const raw = await client.get(codeKey)
  const payload = raw ? safeJsonParse(raw, null) : null
  if (!payload?.code) return { ok: false, reason: 'code_not_found' }
  if (String(payload.code || '').trim() !== safeCode) {
    const codeTtl = Number(await client.ttl(codeKey) || 0)
    const failureCount = Number(await client.incr(verifyFailKey) || 0)
    const verifyFailTtl = codeTtl > 0 ? codeTtl : ttlSeconds
    if (failureCount === 1 || Number(await client.ttl(verifyFailKey) || 0) < 0) {
      await client.expire(verifyFailKey, Math.max(60, verifyFailTtl))
    }
    const remainingAttempts = Math.max(0, verifyMaxAttempts - failureCount)
    if (failureCount >= verifyMaxAttempts) {
      await client.del(codeKey, verifyFailKey)
      await client.set(verifyLockKey, '1', { EX: verifyLockSeconds })
      return {
        ok: false,
        reason: 'verify_locked',
        retryAfterSeconds: verifyLockSeconds,
        maxAttempts: verifyMaxAttempts,
        remainingAttempts: 0
      }
    }
    return {
      ok: false,
      reason: 'code_not_match',
      maxAttempts: verifyMaxAttempts,
      remainingAttempts
    }
  }

  if (consume) {
    await client.del(codeKey)
  }
  await client.del(verifyFailKey, verifyLockKey)

  return {
    ok: true,
    payload,
    maxAttempts: verifyMaxAttempts,
    remainingAttempts: verifyMaxAttempts
  }
}

export function buildOrderLockKey(orderId) {
  return buildRedisKey('lock', 'order', Number(orderId || 0))
}

export function buildListingOrderLockKey(listingId) {
  return buildRedisKey('lock', 'listing-order', Number(listingId || 0))
}

export function createLockToken() {
  return crypto.randomBytes(18).toString('base64url')
}

export async function acquireDistributedLock(lockKey, token, ttlMs = ORDER_LOCK_TTL_MS) {
  const client = await getRedisClient()
  if (!client) return true
  const safeLockKey = String(lockKey || '').trim()
  const safeToken = String(token || '').trim()
  if (!safeLockKey || !safeToken) return false
  const result = await client.set(safeLockKey, safeToken, {
    NX: true,
    PX: Math.max(3000, Number(ttlMs || 0) || ORDER_LOCK_TTL_MS)
  })
  return result === 'OK'
}

export async function releaseDistributedLock(lockKey, token) {
  const client = await getRedisClient()
  if (!client) return 1
  const safeLockKey = String(lockKey || '').trim()
  const safeToken = String(token || '').trim()
  if (!safeLockKey || !safeToken) return 0

  const script = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    end
    return 0
  `
  return client.eval(script, {
    keys: [safeLockKey],
    arguments: [safeToken]
  })
}

function buildPresenceSocketKey(userId, socketId) {
  return buildRedisKey('presence', 'user', Number(userId || 0), 'socket', socketId)
}

function buildPresenceCountKey(userId) {
  return buildRedisKey('presence', 'user', Number(userId || 0), 'count')
}

function buildPresenceLastSeenKey(userId) {
  return buildRedisKey('presence', 'user', Number(userId || 0), 'last-seen')
}

function buildPresenceOnlineUsersKey() {
  return buildRedisKey('presence', 'online-users')
}

export async function touchUserPresence(userId, socketId, ttlSeconds = CHAT_ONLINE_TTL_SECONDS) {
  const client = await getRedisClient()
  if (!client) return false

  const safeUserId = Number(userId || 0)
  const safeSocketId = String(socketId || '').trim()
  if (!safeUserId || !safeSocketId) return false

  const socketKey = buildPresenceSocketKey(safeUserId, safeSocketId)
  const countKey = buildPresenceCountKey(safeUserId)
  const isFirstSeenSocket = await client.set(socketKey, '1', {
    NX: true,
    EX: Math.max(30, Number(ttlSeconds || 0) || CHAT_ONLINE_TTL_SECONDS)
  })

  if (isFirstSeenSocket === 'OK') {
    await client.incr(countKey)
  } else {
    await client.expire(socketKey, Math.max(30, Number(ttlSeconds || 0) || CHAT_ONLINE_TTL_SECONDS))
  }

  const expireAt = Date.now() + (Math.max(30, Number(ttlSeconds || 0) || CHAT_ONLINE_TTL_SECONDS) * 1000)
  await client.expire(countKey, Math.max(30, Number(ttlSeconds || 0) || CHAT_ONLINE_TTL_SECONDS))
  await client.zAdd(buildPresenceOnlineUsersKey(), [{ score: expireAt, value: String(safeUserId) }])
  return true
}

export async function markUserDisconnected(userId, socketId) {
  const client = await getRedisClient()
  if (!client) return false

  const safeUserId = Number(userId || 0)
  const safeSocketId = String(socketId || '').trim()
  if (!safeUserId || !safeSocketId) return false

  const socketKey = buildPresenceSocketKey(safeUserId, safeSocketId)
  const countKey = buildPresenceCountKey(safeUserId)
  const socketExists = await client.del(socketKey)
  if (Number(socketExists || 0) > 0) {
    const nextCount = await client.decr(countKey)
    if (Number(nextCount || 0) <= 0) {
      await client.del(countKey)
      await client.set(buildPresenceLastSeenKey(safeUserId), String(Date.now()), { EX: 30 * 24 * 60 * 60 })
      await client.zRem(buildPresenceOnlineUsersKey(), String(safeUserId))
    }
  }

  return true
}

export async function getCurrentOnlineUserCount() {
  const client = await getRedisClient()
  if (!client) return 0

  const now = Date.now()
  const onlineUsersKey = buildPresenceOnlineUsersKey()
  await client.zRemRangeByScore(onlineUsersKey, 0, now)
  const count = Math.max(0, Number(await client.zCard(onlineUsersKey)) || 0)
  return count
}

export async function getUsersOnlineStatus(userIds = []) {
  const client = await getRedisClient()
  const normalizedUserIds = [...new Set(
    (Array.isArray(userIds) ? userIds : [])
      .map((userId) => Number(userId || 0))
      .filter((userId) => userId > 0)
  )]

  const statusMap = new Map()
  if (!normalizedUserIds.length) {
    return statusMap
  }

  if (!client) {
    normalizedUserIds.forEach((userId) => {
      statusMap.set(userId, { online: false, connectedSockets: 0, lastSeenAt: null })
    })
    return statusMap
  }

  const countKeys = normalizedUserIds.map((userId) => buildPresenceCountKey(userId))
  const lastSeenKeys = normalizedUserIds.map((userId) => buildPresenceLastSeenKey(userId))
  const countValues = await client.mGet(countKeys)
  const lastSeenValues = await client.mGet(lastSeenKeys)

  normalizedUserIds.forEach((userId, index) => {
    const connectedSockets = Math.max(0, Number(countValues?.[index] || 0) || 0)
    const lastSeenValue = Number(lastSeenValues?.[index] || 0) || 0
    statusMap.set(userId, {
      online: connectedSockets > 0,
      connectedSockets,
      lastSeenAt: lastSeenValue ? new Date(lastSeenValue).toISOString() : null
    })
  })

  return statusMap
}
