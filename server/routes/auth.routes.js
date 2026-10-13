/**
 * 认证相关 HTTP 路由，处理登录、登出与用户会话流程。
 */

import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { getSmsSecurityThresholds } from '../modules/business-settings/runtime.js'
import { normalizeCentAmount } from '../utils/money.js'

function readPositiveIntEnv(name, fallback, minimum = 1) {
  const parsedValue = Number(process.env[name] || fallback)
  if (!Number.isFinite(parsedValue)) return fallback
  return Math.max(minimum, Math.round(parsedValue))
}

const SMS_DAILY_LIMIT = readPositiveIntEnv('SMS_CODE_DAILY_LIMIT', 10)
const SMS_IP_DAILY_LIMIT = readPositiveIntEnv('SMS_CODE_IP_DAILY_LIMIT', 20)
const SMS_CODE_VERIFY_MAX_ATTEMPTS = readPositiveIntEnv('SMS_CODE_VERIFY_MAX_ATTEMPTS', 5, 3)
const SMS_CODE_VERIFY_LOCK_SECONDS = readPositiveIntEnv('SMS_CODE_VERIFY_LOCK_SECONDS', 15 * 60, 300)

function buildDefaultSmsSecurityThresholds() {
  return {
    smsDailyLimitPerPhone: SMS_DAILY_LIMIT,
    smsDailyLimitPerIp: SMS_IP_DAILY_LIMIT,
    smsCodeTtlSeconds: readPositiveIntEnv('SMS_CODE_TTL_SECONDS', 300, 60),
    smsSendIntervalSeconds: readPositiveIntEnv('SMS_CODE_SEND_INTERVAL_SECONDS', 60, 30),
    smsVerifyMaxAttempts: SMS_CODE_VERIFY_MAX_ATTEMPTS,
    smsVerifyLockSeconds: SMS_CODE_VERIFY_LOCK_SECONDS
  }
}

function maskPhoneAsUsername(phone = '') {
  return String(phone || '').replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
}

function isValidPhone(value = '') {
  return /^1[3-9]\d{9}$/.test(String(value || '').trim())
}

function isValidSmsScene(value = '') {
  return ['login', 'admin_login'].includes(String(value || '').trim())
}

function isStrongPassword(value = '') {
  const password = String(value || '')
  if (password.length < 8) {
    return false
  }

  let typeCount = 0
  if (/[A-Za-z]/.test(password)) typeCount += 1
  if (/\d/.test(password)) typeCount += 1
  if (/[^A-Za-z\d]/.test(password)) typeCount += 1
  return typeCount >= 2
}

function isAdminRole(role = '') {
  return String(role || '').trim() === 'admin'
}

function buildAdminPortalOnlyMessage() {
  return '管理员账号仅支持在 admin.html 登录后台'
}

const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const INVITE_CODE_REGEX = /^[A-Z0-9]{6,16}$/

function normalizeInviteCode(value = '') {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function buildRandomInviteCode(length = 8) {
  const size = Math.max(6, Number(length || 8) || 8)
  let result = ''
  for (let index = 0; index < size; index += 1) {
    const randomIndex = Math.floor(Math.random() * INVITE_CODE_ALPHABET.length)
    result += INVITE_CODE_ALPHABET[randomIndex]
  }
  return result
}

async function findUserByPhone(pool, phone) {
  const [rows] = await pool.execute(
    `SELECT
      id,
      username,
      password_hash,
      phone,
      role,
      banned_until,
      invite_code,
      inviter_user_id,
      bound_invite_code,
      invite_bound_at
     FROM users
     WHERE phone = ?
     LIMIT 1`,
    [phone]
  )
  return rows[0] || null
}

async function findUserByInviteCode(executor, inviteCode) {
  const normalizedInviteCode = normalizeInviteCode(inviteCode)
  if (!normalizedInviteCode) return null
  const [rows] = await executor.execute(
    `SELECT id, username, invite_code
     FROM users
     WHERE invite_code = ?
     LIMIT 1`,
    [normalizedInviteCode]
  )
  return rows[0] || null
}

async function generateUniqueInviteCode(executor) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = buildRandomInviteCode(attempt >= 10 ? 10 : 8)
    const [rows] = await executor.execute(
      `SELECT id
       FROM users
       WHERE invite_code = ?
       LIMIT 1`,
      [candidate]
    )
    if (!rows.length) {
      return candidate
    }
  }
  throw new Error('生成邀请码失败，请稍后重试')
}

async function ensureUserInviteCode(executor, userId) {
  const safeUserId = Number(userId || 0)
  if (!safeUserId) return ''
  const [[userRow]] = await executor.execute(
    `SELECT invite_code
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [safeUserId]
  )
  const existingInviteCode = normalizeInviteCode(userRow?.invite_code || '')
  if (existingInviteCode) {
    return existingInviteCode
  }
  const inviteCode = await generateUniqueInviteCode(executor)
  await executor.execute(
    `UPDATE users
     SET invite_code = ?
     WHERE id = ?
       AND (invite_code IS NULL OR invite_code = '')`,
    [inviteCode, safeUserId]
  )
  return inviteCode
}

function serializeInviteRewardRow(row = {}) {
  return {
    order_id: Number(row.order_id || 0),
    order_no: String(row.order_no || '').trim(),
    listing_title: String(row.listing_title || '').trim(),
    seller_name: String(row.seller_name || '').trim(),
    invitee_username: String(row.invitee_username || '').trim(),
    inviter_username: String(row.inviter_username || '').trim(),
    seller_rent_amount: normalizeCentAmount(row.seller_rent_amount) ?? 0,
    buyer_rent_amount: normalizeCentAmount(row.amount) ?? 0,
    platform_fee_amount: normalizeCentAmount(row.platform_fee_amount) ?? 0,
    reward_amount: normalizeCentAmount(row.reward_amount) ?? 0,
    status: String(row.status || '').trim(),
    finished_at: row.finished_at || null,
    awarded_at: row.awarded_at || null
  }
}

function getRequestIp(req) {
  // 安全要求：统一使用 Express 的 req.ip（trust proxy=1 下由 proxy-addr 解析，
  // 不可被客户端伪造），不再读取 X-Forwarded-For / X-Real-Ip 首段，
  // 否则短信按 IP 的日配额可被轮换伪造头绕过
  return String(req.ip || req.socket?.remoteAddress || '').trim()
}

function getCaptchaVerifyErrorMessage(result = {}) {
  if (result.reason === 'provider_not_configured') {
    return '验证码服务尚未配置完成，请联系管理员'
  }
  if (result.reason === 'invalid_payload') {
    return '请先完成验证码验证'
  }
  return String(result.message || '').trim() || '验证码校验失败，请重试'
}

function getRetryAfterSecondsUntilTomorrow() {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setHours(24, 0, 0, 0)
  return Math.max(1, Math.ceil((tomorrow.getTime() - now.getTime()) / 1000))
}

function getSmsVerifyErrorResponse(result = {}, thresholds = buildDefaultSmsSecurityThresholds()) {
  if (result.reason === 'verify_locked') {
    return {
      status: 429,
      body: {
        message: '验证码错误次数过多，请稍后重新获取验证码',
        retry_after_seconds: Number(result.retryAfterSeconds || thresholds.smsVerifyLockSeconds || SMS_CODE_VERIFY_LOCK_SECONDS),
        max_attempts: Number(result.maxAttempts || thresholds.smsVerifyMaxAttempts || SMS_CODE_VERIFY_MAX_ATTEMPTS),
        remaining_attempts: 0
      }
    }
  }
  if (result.reason === 'code_not_match') {
    return {
      status: 401,
      body: {
        message: '验证码错误',
        max_attempts: Number(result.maxAttempts || thresholds.smsVerifyMaxAttempts || SMS_CODE_VERIFY_MAX_ATTEMPTS),
        remaining_attempts: Math.max(0, Number(result.remainingAttempts || 0))
      }
    }
  }
  return {
    status: 401,
    body: { message: '验证码错误或已过期' }
  }
}

async function reserveSmsDailyQuota(conn, phone, scene, thresholds = buildDefaultSmsSecurityThresholds()) {
  const dailyLimit = Math.max(1, Number(thresholds.smsDailyLimitPerPhone || SMS_DAILY_LIMIT) || SMS_DAILY_LIMIT)
  await conn.execute(
    `INSERT INTO sms_send_daily_stats (phone, scene, send_date, send_count, last_sent_at)
     VALUES (?, ?, CURRENT_DATE(), 0, NULL)
     ON DUPLICATE KEY UPDATE id = id`,
    [phone, scene]
  )

  const [rows] = await conn.execute(
    `SELECT id, send_count
     FROM sms_send_daily_stats
     WHERE phone = ?
       AND scene = ?
       AND send_date = CURRENT_DATE()
     LIMIT 1
     FOR UPDATE`,
    [phone, scene]
  )
  const row = rows[0]
  const currentCount = Number(row?.send_count || 0)

  if (!row?.id) {
    return {
      ok: false,
      reason: 'daily_quota_unavailable',
      retryAfterSeconds: getRetryAfterSecondsUntilTomorrow()
    }
  }
  if (currentCount >= dailyLimit) {
    return {
      ok: false,
      reason: 'daily_quota_exceeded',
      retryAfterSeconds: getRetryAfterSecondsUntilTomorrow(),
      dailyCount: currentCount,
      dailyLimit
    }
  }

  await conn.execute(
    `UPDATE sms_send_daily_stats
     SET send_count = send_count + 1,
         last_sent_at = NOW(),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [Number(row.id)]
  )

  return {
    ok: true,
    dailyCount: currentCount + 1,
    dailyLimit
  }
}

async function reserveSmsIpDailyQuota(conn, ipAddress, thresholds = buildDefaultSmsSecurityThresholds()) {
  const dailyLimit = Math.max(1, Number(thresholds.smsDailyLimitPerIp || SMS_IP_DAILY_LIMIT) || SMS_IP_DAILY_LIMIT)
  const safeIpAddress = String(ipAddress || '').trim()
  if (!safeIpAddress) {
    return {
      ok: true,
      dailyCount: 0,
      dailyLimit
    }
  }

  await conn.execute(
    `INSERT INTO sms_send_ip_daily_stats (ip_address, send_date, send_count, last_sent_at)
     VALUES (?, CURRENT_DATE(), 0, NULL)
     ON DUPLICATE KEY UPDATE id = id`,
    [safeIpAddress]
  )

  const [rows] = await conn.execute(
    `SELECT id, send_count
     FROM sms_send_ip_daily_stats
     WHERE ip_address = ?
       AND send_date = CURRENT_DATE()
     LIMIT 1
     FOR UPDATE`,
    [safeIpAddress]
  )
  const row = rows[0]
  const currentCount = Number(row?.send_count || 0)

  if (!row?.id) {
    return {
      ok: false,
      reason: 'daily_ip_quota_unavailable',
      retryAfterSeconds: getRetryAfterSecondsUntilTomorrow()
    }
  }
  if (currentCount >= dailyLimit) {
    return {
      ok: false,
      reason: 'daily_ip_quota_exceeded',
      retryAfterSeconds: getRetryAfterSecondsUntilTomorrow(),
      dailyCount: currentCount,
      dailyLimit
    }
  }

  await conn.execute(
    `UPDATE sms_send_ip_daily_stats
     SET send_count = send_count + 1,
         last_sent_at = NOW(),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [Number(row.id)]
  )

  return {
    ok: true,
    dailyCount: currentCount + 1,
    dailyLimit
  }
}

export function registerAuthRoutes(deps) {
  const {
    app,
    pool,
    authLimiter,
    authIpLimiter,
    authRequired,
    authenticatedReadLimiter,
    isShuttingDown = () => false,
    issueAuthSession,
    setAuthCookie,
    revokeAllLoginSessionsByUserId,
    logoutCurrentSession,
    isUserCurrentlyBanned,
    buildBannedUserMessage,
    captchaProvider,
    smsCodeService,
    smsProvider,
    loadBusinessSettings
  } = deps

  app.get('/api/health', (_req, res) => {
    // 优雅停机期间返回 503：编排器/负载均衡据此把本实例摘出流量（容器存活检查以外的摘除信号）
    if (isShuttingDown()) {
      res.status(503).json({ ok: false, reason: 'shutting_down' })
      return
    }
    res.json({ ok: true })
  })

  app.get('/api/auth/captcha/config', authLimiter, (_req, res) => {
    const config = captchaProvider.getClientConfig()
    res.json({
      enabled: Boolean(config.enabled),
      provider: config.provider,
      js_url: config.jsUrl,
      captcha_app_id: config.captchaAppId,
      user_language: config.userLanguage
    })
  })

  app.post('/api/register', authLimiter, (_req, res) => {
    res.status(410).json({ message: '注册功能已下线，请使用验证码直接登录' })
  })

  app.post('/api/admin/login', authIpLimiter, authLimiter, async (req, res) => {
    const phone = String(req.body?.phone || '').trim()
    const code = String(req.body?.code || '').trim()

    if (!isValidPhone(phone) || !/^\d{4,8}$/.test(code)) {
      return res.status(400).json({ message: '手机号或验证码格式不正确' })
    }

    try {
      const businessSettings = typeof loadBusinessSettings === 'function' ? await loadBusinessSettings(pool) : null
      const smsSecurityThresholds = businessSettings ? getSmsSecurityThresholds(businessSettings) : buildDefaultSmsSecurityThresholds()
      const verifyResult = await smsCodeService.verifyCode({
        phone,
        code,
        scene: 'admin_login',
        consume: true
      })
      if (!verifyResult?.ok) {
        const errorResponse = getSmsVerifyErrorResponse(verifyResult, smsSecurityThresholds)
        return res.status(errorResponse.status).json(errorResponse.body)
      }

      const user = await findUserByPhone(pool, phone)
      if (!user) {
        return res.status(401).json({ message: '该手机号未注册' })
      }
      if (!isAdminRole(user.role)) {
        return res.status(403).json({ message: '当前账号不是管理员，无法进入后台' })
      }
      if (isUserCurrentlyBanned(user)) {
        return res.status(403).json({ message: buildBannedUserMessage(user) })
      }

      const { token, tokenMaxAgeMs } = await issueAuthSession(req, user, {
        authLevel: 'sms',
        amr: ['sms']
      })
      setAuthCookie(req, res, token, { maxAgeMs: tokenMaxAgeMs })
      res.json({
        user: {
          id: user.id,
          username: user.username,
          phone: user.phone,
          role: user.role
        }
      })
    } catch (_error) {
      res.status(500).json({ message: '登录失败' })
    }
  })

  app.post('/api/login', authLimiter, (_req, res) => {
    res.status(410).json({ message: '密码登录已下线，请使用验证码登录' })
  })

  // 演示/测试环境密码登录：仅 DEMO_PASSWORD_LOGIN=true 时注册此端点，
  // 逻辑复用 2026-08-12（db85b16 改仅验证码登录）之前的 /api/login 实现。
  // 生产环境不设置该变量，端点不存在，行为不变。
  if (['1', 'true', 'yes', 'on'].includes(String(process.env.DEMO_PASSWORD_LOGIN || '').trim().toLowerCase())) {
    app.post('/api/auth/password/login', authIpLimiter, authLimiter, async (req, res) => {
      const phone = String(req.body?.phone || '').trim()
      const password = String(req.body?.password || '')

      if (!phone || !password) {
        return res.status(400).json({ message: '手机号和密码不能为空' })
      }

      try {
        const user = await findUserByPhone(pool, phone)
        if (!user) {
          return res.status(401).json({ message: '手机号或密码错误' })
        }
        if (isAdminRole(user.role)) {
          return res.status(403).json({ message: buildAdminPortalOnlyMessage() })
        }
        const isPassOk = await bcrypt.compare(password, user.password_hash)
        if (!isPassOk) {
          return res.status(401).json({ message: '手机号或密码错误' })
        }
        if (isUserCurrentlyBanned(user)) {
          return res.status(403).json({ message: buildBannedUserMessage(user) })
        }

        const { token, tokenMaxAgeMs } = await issueAuthSession(req, user, {
          authLevel: 'password',
          amr: ['pwd']
        })
        setAuthCookie(req, res, token, { maxAgeMs: tokenMaxAgeMs })
        res.json({
          user: {
            id: user.id,
            username: user.username,
            phone: user.phone,
            role: user.role
          }
        })
      } catch (_error) {
        res.status(500).json({ message: '登录失败' })
      }
    })
  }

  app.post('/api/auth/sms/send', authIpLimiter, authLimiter, async (req, res) => {
    const phone = String(req.body?.phone || '').trim()
    const scene = String(req.body?.scene || 'login').trim() || 'login'
    const captchaTicket = String(req.body?.captcha_ticket || req.body?.ticket || '').trim()
    const captchaRandstr = String(req.body?.captcha_randstr || req.body?.randstr || '').trim()
    const requestIp = getRequestIp(req)

    if (!isValidPhone(phone)) {
      return res.status(400).json({ message: '请输入正确的11位手机号' })
    }
    if (!isValidSmsScene(scene)) {
      return res.status(400).json({ message: '不支持的验证码场景' })
    }

    const conn = await pool.getConnection()
    let shouldClearIssuedSmsCode = false
    try {
      const businessSettings = typeof loadBusinessSettings === 'function' ? await loadBusinessSettings(pool) : null
      const smsSecurityThresholds = businessSettings ? getSmsSecurityThresholds(businessSettings) : buildDefaultSmsSecurityThresholds()

      const captchaVerifyResult = await captchaProvider.verifyTicket({
        ticket: captchaTicket,
        randstr: captchaRandstr,
        userIp: getRequestIp(req)
      })
      if (!captchaVerifyResult.ok) {
        return res.status(captchaVerifyResult.reason === 'provider_not_configured' ? 503 : 400).json({
          message: getCaptchaVerifyErrorMessage(captchaVerifyResult),
          captcha_required: true,
          captcha_request_id: captchaVerifyResult.requestId || ''
        })
      }

      // 管理员登录验证码：每日单号上限收紧到 min(5, 配置值)
      const effectiveSmsThresholds = scene === 'admin_login'
        ? {
            ...smsSecurityThresholds,
            smsDailyLimitPerPhone: Math.min(
              5,
              Number(smsSecurityThresholds.smsDailyLimitPerPhone) || 5
            )
          }
        : smsSecurityThresholds

      await conn.beginTransaction()
      const ipQuotaResult = await reserveSmsIpDailyQuota(conn, requestIp, effectiveSmsThresholds)
      if (!ipQuotaResult.ok) {
        await conn.rollback()
        return res.status(429).json({
          message: '当前网络今日验证码发送次数已达上限，请明天再试',
          retry_after_seconds: Number(ipQuotaResult.retryAfterSeconds || 0),
          daily_limit: Number(ipQuotaResult.dailyLimit || smsSecurityThresholds.smsDailyLimitPerIp || SMS_IP_DAILY_LIMIT),
          daily_count: Number(ipQuotaResult.dailyCount || smsSecurityThresholds.smsDailyLimitPerIp || SMS_IP_DAILY_LIMIT)
        })
      }
      const dailyQuotaResult = await reserveSmsDailyQuota(conn, phone, scene, effectiveSmsThresholds)
      if (!dailyQuotaResult.ok) {
        await conn.rollback()
        return res.status(429).json({
          message: '该手机号今日验证码发送次数已达上限，请明天再试',
          retry_after_seconds: Number(dailyQuotaResult.retryAfterSeconds || 0),
          daily_limit: Number(dailyQuotaResult.dailyLimit || smsSecurityThresholds.smsDailyLimitPerPhone || SMS_DAILY_LIMIT),
          daily_count: Number(dailyQuotaResult.dailyCount || smsSecurityThresholds.smsDailyLimitPerPhone || SMS_DAILY_LIMIT)
        })
      }

      const issueResult = await smsCodeService.issueCode({
        phone,
        scene,
        metadata: {
          ip: requestIp,
          userAgent: String(req.headers['user-agent'] || '').trim()
        }
      })

      if (!issueResult?.ok) {
        if (issueResult.reason === 'send_too_frequent') {
          await conn.rollback()
          return res.status(429).json({
            message: '验证码发送过于频繁，请稍后再试',
            retry_after_seconds: Number(issueResult.retryAfterSeconds || 0)
          })
        }
        await conn.rollback()
        return res.status(400).json({ message: '验证码发送失败' })
      }
      shouldClearIssuedSmsCode = true

      const providerResult = await smsProvider.sendVerificationCode({
        scene,
        phone,
        code: issueResult.code,
        ttlSeconds: Number(smsSecurityThresholds.smsCodeTtlSeconds || 300)
      })
      if (!providerResult?.ok) {
        await conn.rollback()
        if (typeof smsCodeService.clearIssuedCode === 'function') {
          await smsCodeService.clearIssuedCode({ scene, phone })
        }
        shouldClearIssuedSmsCode = false
        return res.status(
          ['provider_not_configured', 'template_not_configured'].includes(String(providerResult.reason || '').trim())
            ? 503
            : 502
        ).json({ message: providerResult?.message || '短信服务暂不可用' })
      }

      await conn.commit()
      shouldClearIssuedSmsCode = false

      res.status(201).json({
        success: true,
        phone,
        scene,
        provider: providerResult.provider,
        provider_message_id: providerResult.providerMessageId || '',
        retry_after_seconds: Number(issueResult.retryAfterSeconds || 0)
      })
    } catch (_error) {
      try {
        await conn.rollback()
      } catch (_rollbackError) {
        // 忽略回滚异常，优先返回原始错误
      }
      if (shouldClearIssuedSmsCode && typeof smsCodeService.clearIssuedCode === 'function') {
        await smsCodeService.clearIssuedCode({ scene, phone })
      }
      res.status(500).json({ message: '发送验证码失败' })
    } finally {
      conn.release()
    }
  })

  app.post('/api/auth/sms/login', authIpLimiter, authLimiter, async (req, res) => {
    const phone = String(req.body?.phone || '').trim()
    const code = String(req.body?.code || '').trim()
    const inviteCode = normalizeInviteCode(req.body?.invite_code || '')

    if (!isValidPhone(phone) || !/^\d{4,8}$/.test(code)) {
      return res.status(400).json({ message: '手机号或验证码格式不正确' })
    }
    if (inviteCode && !INVITE_CODE_REGEX.test(inviteCode)) {
      return res.status(400).json({ message: '邀请码格式不正确' })
    }

    try {
      const businessSettings = typeof loadBusinessSettings === 'function' ? await loadBusinessSettings(pool) : null
      const smsSecurityThresholds = businessSettings ? getSmsSecurityThresholds(businessSettings) : buildDefaultSmsSecurityThresholds()
      const verifyResult = await smsCodeService.verifyCode({
        phone,
        code,
        scene: 'login',
        consume: true
      })
      if (!verifyResult?.ok) {
        const errorResponse = getSmsVerifyErrorResponse(verifyResult, smsSecurityThresholds)
        return res.status(errorResponse.status).json(errorResponse.body)
      }

      let user = await findUserByPhone(pool, phone)
      let isNewUser = false
      if (!user) {
        const conn = await pool.getConnection()
        try {
          await conn.beginTransaction()

          let inviterUser = null
          if (inviteCode) {
            inviterUser = await findUserByInviteCode(conn, inviteCode)
            if (!inviterUser?.id) {
              await conn.rollback()
              return res.status(400).json({ message: '邀请码不存在，请核对后重试' })
            }
          }

          const username = maskPhoneAsUsername(phone)
          const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10)
          const [insertResult] = await conn.execute(
            `INSERT INTO users (
              username, password_hash, phone, role, inviter_user_id, bound_invite_code, invite_bound_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              username,
              passwordHash,
              phone,
              'user',
              inviterUser?.id ? Number(inviterUser.id) : null,
              inviterUser?.invite_code || null,
              inviterUser?.id ? new Date() : null
            ]
          )
          const userInviteCode = await ensureUserInviteCode(conn, insertResult.insertId)
          await conn.commit()

          user = {
            id: insertResult.insertId,
            username,
            phone,
            role: 'user',
            banned_until: null,
            invite_code: userInviteCode,
            inviter_user_id: inviterUser?.id || null,
            bound_invite_code: inviterUser?.invite_code || '',
            invite_bound_at: inviterUser?.id ? new Date() : null
          }
          isNewUser = true
        } catch (error) {
          await conn.rollback()
          throw error
        } finally {
          conn.release()
        }
      }
      if (isAdminRole(user.role)) {
        return res.status(403).json({ message: buildAdminPortalOnlyMessage() })
      }

      if (isUserCurrentlyBanned(user)) {
        return res.status(403).json({ message: buildBannedUserMessage(user) })
      }

      const { token, tokenMaxAgeMs } = await issueAuthSession(req, user, {
        authLevel: 'sms',
        amr: ['sms']
      })
      setAuthCookie(req, res, token, { maxAgeMs: tokenMaxAgeMs })
      res.json({
        is_new_user: isNewUser,
        user: {
          id: user.id,
          username: user.username,
          phone: user.phone,
          role: user.role
        }
      })
    } catch (_error) {
      res.status(500).json({ message: '验证码登录失败' })
    }
  })

  app.post('/api/auth/password/reset-by-sms', authLimiter, (_req, res) => {
    res.status(410).json({ message: '密码重置功能已下线，请使用验证码登录' })
  })

  app.post('/api/logout', async (req, res) => {
    await logoutCurrentSession(req, res)
    res.json({ success: true })
  })

  app.get('/api/profile', authRequired, authenticatedReadLimiter, async (req, res) => {
    if (isAdminRole(req.auth.role)) {
      return res.status(403).json({ message: buildAdminPortalOnlyMessage() })
    }
    const inviteCode = await ensureUserInviteCode(pool, req.auth.userId)
    res.json({
      user: {
        id: req.auth.userId,
        username: req.auth.username,
        phone: req.auth.phone,
        role: req.auth.role,
        invite_code: inviteCode
      }
    })
  })

  app.get('/api/invite/overview', authRequired, authenticatedReadLimiter, async (req, res) => {
    if (isAdminRole(req.auth.role)) {
      return res.status(403).json({ message: buildAdminPortalOnlyMessage() })
    }

    try {
      const ownInviteCode = await ensureUserInviteCode(pool, req.auth.userId)
      const [[userRow]] = await pool.execute(
        `SELECT
          u.invite_code,
          u.bound_invite_code,
          u.inviter_user_id,
          inviter.username AS inviter_username,
          inviter.invite_code AS inviter_invite_code
         FROM users u
         LEFT JOIN users inviter ON inviter.id = u.inviter_user_id
         WHERE u.id = ?
         LIMIT 1`,
        [req.auth.userId]
      )

      const [inviterRows] = await pool.execute(
        `SELECT
          ir.order_id,
          ir.platform_fee_amount,
          ir.reward_amount,
          ir.awarded_at,
          o.order_no,
          o.listing_title,
          o.seller_name,
          o.seller_rent_amount,
          o.amount,
          o.status,
          o.finished_at,
          invitee.username AS invitee_username
         FROM invite_rewards ir
         INNER JOIN orders o ON o.id = ir.order_id
         LEFT JOIN users invitee ON invitee.id = ir.invitee_user_id
         WHERE ir.inviter_user_id = ?
         ORDER BY ir.awarded_at DESC, ir.id DESC
         LIMIT 100`,
        [req.auth.userId]
      )

      const [inviteeRows] = await pool.execute(
        `SELECT
          ir.order_id,
          ir.platform_fee_amount,
          ir.reward_amount,
          ir.awarded_at,
          o.order_no,
          o.listing_title,
          o.seller_name,
          o.seller_rent_amount,
          o.amount,
          o.status,
          o.finished_at,
          inviter.username AS inviter_username
         FROM invite_rewards ir
         INNER JOIN orders o ON o.id = ir.order_id
         LEFT JOIN users inviter ON inviter.id = ir.inviter_user_id
         WHERE ir.invitee_user_id = ?
         ORDER BY ir.awarded_at DESC, ir.id DESC
         LIMIT 100`,
        [req.auth.userId]
      )

      const inviterOrderList = inviterRows.map(serializeInviteRewardRow)
      const inviteeOrderList = inviteeRows.map(serializeInviteRewardRow)

      res.json({
        own_invite_code: ownInviteCode,
        bound_invite_code: String(userRow?.bound_invite_code || userRow?.inviter_invite_code || '').trim(),
        inviter: userRow?.inviter_user_id
          ? {
            id: Number(userRow.inviter_user_id || 0),
            username: String(userRow.inviter_username || '').trim(),
            invite_code: String(userRow.inviter_invite_code || '').trim()
          }
          : null,
        invited_reward_total: inviterOrderList.reduce((sum, item) => sum + Number(item.reward_amount || 0), 0),
        contributed_reward_total: inviteeOrderList.reduce((sum, item) => sum + Number(item.reward_amount || 0), 0),
        inviter_order_list: inviterOrderList,
        invitee_order_list: inviteeOrderList
      })
    } catch (_error) {
      res.status(500).json({ message: '加载邀新数据失败' })
    }
  })

  app.post('/api/invite/bind', authRequired, authLimiter, async (req, res) => {
    if (isAdminRole(req.auth.role)) {
      return res.status(403).json({ message: buildAdminPortalOnlyMessage() })
    }

    const inviteCode = normalizeInviteCode(req.body?.invite_code || '')
    if (!INVITE_CODE_REGEX.test(inviteCode)) {
      return res.status(400).json({ message: '邀请码格式不正确' })
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [[currentUser]] = await conn.execute(
        `SELECT id, invite_code, inviter_user_id, bound_invite_code
         FROM users
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [req.auth.userId]
      )

      if (!currentUser?.id) {
        await conn.rollback()
        return res.status(404).json({ message: '当前账号不存在' })
      }
      if (Number(currentUser.inviter_user_id || 0) > 0 || String(currentUser.bound_invite_code || '').trim()) {
        await conn.rollback()
        return res.status(400).json({ message: '邀请码已绑定，当前账号不可修改' })
      }

      const ownInviteCode = await ensureUserInviteCode(conn, currentUser.id)
      if (inviteCode === ownInviteCode) {
        await conn.rollback()
        return res.status(400).json({ message: '不能填写自己的邀请码' })
      }

      const inviterUser = await findUserByInviteCode(conn, inviteCode)
      if (!inviterUser?.id) {
        await conn.rollback()
        return res.status(400).json({ message: '邀请码不存在，请核对后重试' })
      }
      if (Number(inviterUser.id) === Number(currentUser.id)) {
        await conn.rollback()
        return res.status(400).json({ message: '不能填写自己的邀请码' })
      }

      await conn.execute(
        `UPDATE users
         SET inviter_user_id = ?,
             bound_invite_code = ?,
             invite_bound_at = NOW(),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [Number(inviterUser.id), inviterUser.invite_code, Number(currentUser.id)]
      )
      await conn.commit()

      res.json({
        success: true,
        message: '邀请码绑定成功',
        own_invite_code: ownInviteCode,
        bound_invite_code: inviterUser.invite_code,
        inviter: {
          id: Number(inviterUser.id),
          username: String(inviterUser.username || '').trim()
        }
      })
    } catch (_error) {
      await conn.rollback()
      res.status(500).json({ message: '绑定邀请码失败' })
    } finally {
      conn.release()
    }
  })
}
