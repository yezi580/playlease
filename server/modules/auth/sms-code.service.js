import crypto from 'crypto'
import {
  clearSmsVerificationState,
  persistSmsVerificationCode,
  verifySmsVerificationCode
} from '../../infrastructure/redis.js'

const memorySmsCodeStore = new Map()
const memorySmsSendLockStore = new Map()
const memorySmsVerifyFailStore = new Map()
const memorySmsVerifyLockStore = new Map()
const SMS_CODE_TTL_SECONDS = Math.max(60, Number(process.env.SMS_CODE_TTL_SECONDS || 300) || 300)
const SMS_CODE_SEND_INTERVAL_SECONDS = Math.max(30, Number(process.env.SMS_CODE_SEND_INTERVAL_SECONDS || 60) || 60)
const SMS_CODE_VERIFY_MAX_ATTEMPTS = Math.max(3, Number(process.env.SMS_CODE_VERIFY_MAX_ATTEMPTS || 5) || 5)
const SMS_CODE_VERIFY_LOCK_SECONDS = Math.max(300, Number(process.env.SMS_CODE_VERIFY_LOCK_SECONDS || 15 * 60) || 15 * 60)

function buildDefaultRuntimeConfig() {
  return {
    ttlSeconds: SMS_CODE_TTL_SECONDS,
    sendIntervalSeconds: SMS_CODE_SEND_INTERVAL_SECONDS,
    verifyMaxAttempts: SMS_CODE_VERIFY_MAX_ATTEMPTS,
    verifyLockSeconds: SMS_CODE_VERIFY_LOCK_SECONDS
  }
}

function buildMemoryStoreKey(scene = 'login', phone = '') {
  return `${String(scene || 'login').trim() || 'login'}::${String(phone || '').trim()}`
}

function cleanupExpiredMemoryEntries() {
  const now = Date.now()
  for (const [key, entry] of memorySmsCodeStore.entries()) {
    if (!entry || Number(entry.expiresAt || 0) <= now) {
      memorySmsCodeStore.delete(key)
    }
  }
  for (const [key, entry] of memorySmsSendLockStore.entries()) {
    if (!entry || Number(entry.expiresAt || 0) <= now) {
      memorySmsSendLockStore.delete(key)
    }
  }
  for (const [key, entry] of memorySmsVerifyFailStore.entries()) {
    if (!entry || Number(entry.expiresAt || 0) <= now) {
      memorySmsVerifyFailStore.delete(key)
    }
  }
  for (const [key, entry] of memorySmsVerifyLockStore.entries()) {
    if (!entry || Number(entry.expiresAt || 0) <= now) {
      memorySmsVerifyLockStore.delete(key)
    }
  }
}

function persistSmsVerificationCodeInMemory({
  scene = 'login',
  phone,
  code,
  ttlSeconds = 300,
  sendIntervalSeconds = 60,
  metadata = {}
}) {
  cleanupExpiredMemoryEntries()
  const storeKey = buildMemoryStoreKey(scene, phone)
  const now = Date.now()
  const sendLock = memorySmsSendLockStore.get(storeKey)
  if (sendLock && Number(sendLock.expiresAt || 0) > now) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((Number(sendLock.expiresAt || now) - now) / 1000))
    }
  }

  memorySmsSendLockStore.set(storeKey, {
    expiresAt: now + Math.max(30, Number(sendIntervalSeconds || 0) || 60) * 1000
  })
  memorySmsCodeStore.set(storeKey, {
    code: String(code || '').trim(),
    phone: String(phone || '').trim(),
    scene: String(scene || 'login').trim() || 'login',
    metadata,
    createdAt: now,
    expiresAt: now + Math.max(60, Number(ttlSeconds || 0) || 300) * 1000
  })
  // 只清空失败计数；验证锁定不随新码下发而解除（与 Redis 实现保持一致）
  memorySmsVerifyFailStore.delete(storeKey)
  return { ok: true, retryAfterSeconds: 0 }
}

function verifySmsVerificationCodeInMemory({
  scene = 'login',
  phone,
  code,
  consume = true,
  ttlSeconds = SMS_CODE_TTL_SECONDS,
  verifyMaxAttempts = SMS_CODE_VERIFY_MAX_ATTEMPTS,
  verifyLockSeconds = SMS_CODE_VERIFY_LOCK_SECONDS
}) {
  cleanupExpiredMemoryEntries()
  const storeKey = buildMemoryStoreKey(scene, phone)
  const now = Date.now()
  const verifyLock = memorySmsVerifyLockStore.get(storeKey)
  if (verifyLock && Number(verifyLock.expiresAt || 0) > now) {
    return {
      ok: false,
      reason: 'verify_locked',
      retryAfterSeconds: Math.max(1, Math.ceil((Number(verifyLock.expiresAt || now) - now) / 1000)),
      maxAttempts: verifyMaxAttempts,
      remainingAttempts: 0
    }
  }
  const payload = memorySmsCodeStore.get(storeKey)
  if (!payload?.code) return { ok: false, reason: 'code_not_found' }
  if (String(payload.code || '').trim() !== String(code || '').trim()) {
    const currentFailure = memorySmsVerifyFailStore.get(storeKey)
    const nextFailureCount = Number(currentFailure?.count || 0) + 1
    memorySmsVerifyFailStore.set(storeKey, {
      count: nextFailureCount,
      expiresAt: Number(payload.expiresAt || (now + ttlSeconds * 1000))
    })
    const remainingAttempts = Math.max(0, verifyMaxAttempts - nextFailureCount)
    if (nextFailureCount >= verifyMaxAttempts) {
      memorySmsCodeStore.delete(storeKey)
      memorySmsVerifyFailStore.delete(storeKey)
      memorySmsVerifyLockStore.set(storeKey, {
        expiresAt: now + verifyLockSeconds * 1000
      })
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
    memorySmsCodeStore.delete(storeKey)
  }
  memorySmsVerifyFailStore.delete(storeKey)
  memorySmsVerifyLockStore.delete(storeKey)
  return {
    ok: true,
    payload,
    maxAttempts: verifyMaxAttempts,
    remainingAttempts: verifyMaxAttempts
  }
}

function clearSmsVerificationStateInMemory({
  scene = 'login',
  phone,
  clearCode = true,
  clearSendLock = true,
  clearVerifyState = true
}) {
  cleanupExpiredMemoryEntries()
  const storeKey = buildMemoryStoreKey(scene, phone)
  if (clearCode) {
    memorySmsCodeStore.delete(storeKey)
  }
  if (clearSendLock) {
    memorySmsSendLockStore.delete(storeKey)
  }
  if (clearVerifyState) {
    memorySmsVerifyFailStore.delete(storeKey)
    memorySmsVerifyLockStore.delete(storeKey)
  }
  return true
}

function createNumericCode(length = 6) {
  const size = Math.max(4, Math.min(8, Number(length || 6) || 6))
  const max = 10 ** size
  const min = 10 ** (size - 1)
  const value = min + crypto.randomInt(max - min)
  return String(value).padStart(size, '0')
}

export function createSmsCodeService(options = {}) {
  async function resolveRuntimeConfig() {
    const dynamicConfig = typeof options.getRuntimeConfig === 'function'
      ? await options.getRuntimeConfig()
      : null
    return {
      ...buildDefaultRuntimeConfig(),
      ...(dynamicConfig && typeof dynamicConfig === 'object' ? dynamicConfig : {})
    }
  }

  async function issueCode({
    scene = 'login',
    phone,
    codeLength = 6,
    metadata = {}
  }) {
    const safePhone = String(phone || '').trim()
    if (!/^1[3-9]\d{9}$/.test(safePhone)) {
      return { ok: false, reason: 'invalid_phone', retryAfterSeconds: 0 }
    }

    const runtimeConfig = await resolveRuntimeConfig()
    const code = createNumericCode(codeLength)
    let result = await persistSmsVerificationCode({
      scene,
      phone: safePhone,
      code,
      ttlSeconds: runtimeConfig.ttlSeconds,
      sendIntervalSeconds: runtimeConfig.sendIntervalSeconds,
      metadata
    })
    if (!result.ok && Number(result.retryAfterSeconds || 0) === 0) {
      result = persistSmsVerificationCodeInMemory({
        scene,
        phone: safePhone,
        code,
        ttlSeconds: runtimeConfig.ttlSeconds,
        sendIntervalSeconds: runtimeConfig.sendIntervalSeconds,
        metadata
      })
    }

    if (!result.ok) {
      return {
        ok: false,
        reason: 'send_too_frequent',
        retryAfterSeconds: Number(result.retryAfterSeconds || 0)
      }
    }

    return {
      ok: true,
      phone: safePhone,
      code,
      scene: String(scene || 'login').trim() || 'login',
      retryAfterSeconds: runtimeConfig.sendIntervalSeconds
    }
  }

  async function verifyCode({
    scene = 'login',
    phone,
    code,
    consume = true
  }) {
    const safePhone = String(phone || '').trim()
    const safeCode = String(code || '').trim()
    if (!/^1[3-9]\d{9}$/.test(safePhone) || !/^\d{4,8}$/.test(safeCode)) {
      return { ok: false, reason: 'invalid_payload' }
    }

    const runtimeConfig = await resolveRuntimeConfig()
    let result = await verifySmsVerificationCode({
      scene,
      phone: safePhone,
      code: safeCode,
      consume,
      ttlSeconds: runtimeConfig.ttlSeconds,
      verifyMaxAttempts: runtimeConfig.verifyMaxAttempts,
      verifyLockSeconds: runtimeConfig.verifyLockSeconds
    })
    if (!result.ok && result.reason === 'redis_unavailable') {
      result = verifySmsVerificationCodeInMemory({
        scene,
        phone: safePhone,
        code: safeCode,
        consume,
        ttlSeconds: runtimeConfig.ttlSeconds,
        verifyMaxAttempts: runtimeConfig.verifyMaxAttempts,
        verifyLockSeconds: runtimeConfig.verifyLockSeconds
      })
    }
    return result
  }

  return {
    getRuntimeConfig() {
      return buildDefaultRuntimeConfig()
    },
    async clearIssuedCode({
      scene = 'login',
      phone,
      clearCode = true,
      clearSendLock = true,
      clearVerifyState = true
    }) {
      const safePhone = String(phone || '').trim()
      if (!/^1[3-9]\d{9}$/.test(safePhone)) {
        return false
      }

      const cleared = await clearSmsVerificationState({
        scene,
        phone: safePhone,
        clearCode,
        clearSendLock,
        clearVerifyState
      })
      if (cleared) {
        return true
      }

      return clearSmsVerificationStateInMemory({
        scene,
        phone: safePhone,
        clearCode,
        clearSendLock,
        clearVerifyState
      })
    },
    issueCode,
    verifyCode
  }
}
