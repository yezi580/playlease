/**
 * 安全中间件模块
 *
 * 职责：
 * 1. 统一管理基础安全响应头
 * 2. 统一管理接口限流策略
 * 3. 统一管理可复用的安全中间件导出
 *
 * 注意：
 * - 当前文件仅负责定义和导出中间件
 * - 真正启用时，需要在 index.js 中 import 并 app.use(...)
 * - 使用前需先安装依赖：helmet、express-rate-limit
 */

import helmet from 'helmet'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { createExpressRateLimitStore } from '../infrastructure/rate-limit-store.js'

function readPositiveIntEnv(name, fallback) {
  const rawValue = String(process.env[name] || '').trim()
  if (!rawValue) return fallback
  const parsedValue = Number(rawValue)
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return fallback
  }
  return Math.round(parsedValue)
}

function buildIpKey(req) {
  return `ip:${ipKeyGenerator(req.ip || req.socket?.remoteAddress || '')}`
}

function buildUserScopedKey(req, fallbackPrefix = 'anonymous') {
  const safeUserId = Number(req.auth?.userId || 0)
  if (safeUserId > 0) {
    return `user:${safeUserId}`
  }
  return `${fallbackPrefix}:${buildIpKey(req)}`
}

function buildPhoneScopedKey(req) {
  const phone = String(req.body?.phone || '').trim()
  if (phone) {
    return `phone:${phone}`
  }
  return buildIpKey(req)
}

const authLimiterStore = await createExpressRateLimitStore('auth-attempt')
const publicReadLimiterStore = await createExpressRateLimitStore('public-read')
const authenticatedReadLimiterStore = await createExpressRateLimitStore('auth-read')
const authenticatedWriteLimiterStore = await createExpressRateLimitStore('auth-write')
const orderWriteLimiterStore = await createExpressRateLimitStore('order-write')
const publishLimiterStore = await createExpressRateLimitStore('publish')
const conversationLimiterStore = await createExpressRateLimitStore('conversation')
const uploadReadLimiterStore = await createExpressRateLimitStore('upload-read')
const uploadWriteLimiterStore = await createExpressRateLimitStore('upload-write')

function createLimiter({
  store,
  windowMs,
  max,
  keyGenerator,
  message
}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store,
    keyGenerator,
    message: {
      message
    }
  })
}

/**
 * Helmet：自动补充常见安全响应头
 * 作用：
 * - 防止点击劫持
 * - 降低 XSS 风险
 * - 禁止 MIME 嗅探
 * - 强化 HTTPS 相关策略
 */
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      mediaSrc: ["'self'", 'blob:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"]
    }
  },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'no-referrer' }
})

/**
 * 登录/注册限流：
 * - 适合只挂在 /api/login、/api/register
 * - 防止暴力破解和批量撞库
 */
export const authLimiter = createLimiter({
  store: authLimiterStore,
  windowMs: 5 * 60 * 1000,
  max: readPositiveIntEnv('AUTH_LIMIT_MAX_PER_5_MIN', 10),
  keyGenerator: buildPhoneScopedKey,
  message: '操作过于频繁，请5分钟后再试'
})

/**
 * 公开读接口限流：
 * - 用于商品列表、详情、公共配置等无需登录的读请求
 * - 阈值明显高于旧的全局限流，避免压测和正常高峰被误伤
 */
export const publicReadLimiter = createLimiter({
  store: publicReadLimiterStore,
  windowMs: 60 * 1000,
  max: readPositiveIntEnv('PUBLIC_READ_LIMIT_MAX_PER_MIN', 6000),
  keyGenerator: buildIpKey,
  message: '访问过于频繁，请稍后再试'
})

/**
 * 认证后读接口限流：
 * - 优先按 userId 计数，避免 NAT 场景下单 IP 互相误伤
 */
export const authenticatedReadLimiter = createLimiter({
  store: authenticatedReadLimiterStore,
  windowMs: 60 * 1000,
  max: readPositiveIntEnv('AUTHENTICATED_READ_LIMIT_MAX_PER_MIN', 1800),
  keyGenerator: (req) => buildUserScopedKey(req, 'auth-read'),
  message: '读取过于频繁，请稍后再试'
})

/**
 * 认证后通用写接口限流：
 * - 用于通知已读、我的商品编辑等已登录写操作
 */
export const authenticatedWriteLimiter = createLimiter({
  store: authenticatedWriteLimiterStore,
  windowMs: 60 * 1000,
  max: readPositiveIntEnv('AUTHENTICATED_WRITE_LIMIT_MAX_PER_MIN', 120),
  keyGenerator: (req) => buildUserScopedKey(req, 'auth-write'),
  message: '操作过于频繁，请稍后再试'
})

/**
 * 上传文件访问限流：
 * - GET /api/uploads/files/* 的读取频率
 * - 封顶对象存在性枚举（COS 签名 307 探测）与每请求的 DB 属主校验消耗
 */
export const uploadReadLimiter = createLimiter({
  store: uploadReadLimiterStore,
  windowMs: 60 * 1000,
  max: readPositiveIntEnv('UPLOAD_READ_LIMIT_MAX_PER_MIN', 120),
  keyGenerator: (req) => buildUserScopedKey(req, 'upload-read'),
  message: '文件访问过于频繁，请稍后再试'
})

/**
 * 上传写接口限流：
 * - POST 上传频率（列表图/封禁图/视频/聊天图）
 * - 封顶并发大文件内存缓冲（multer memoryStorage）造成的 OOM 攻击面
 */
export const uploadWriteLimiter = createLimiter({
  store: uploadWriteLimiterStore,
  windowMs: 60 * 1000,
  max: readPositiveIntEnv('UPLOAD_WRITE_LIMIT_MAX_PER_MIN', 20),
  keyGenerator: (req) => buildUserScopedKey(req, 'upload-write'),
  message: '上传过于频繁，请稍后再试'
})

/**
 * 订单与客服写接口限流：
 * - 比通用写接口更严格，优先保护事务型接口
 */
export const orderWriteLimiter = createLimiter({
  store: orderWriteLimiterStore,
  windowMs: 60 * 1000,
  max: readPositiveIntEnv('ORDER_WRITE_LIMIT_MAX_PER_MIN', 60),
  keyGenerator: (req) => buildUserScopedKey(req, 'order-write'),
  message: '订单操作过于频繁，请稍后再试'
})

/**
 * 发布接口限流：
 * - 防止恶意刷发布
 * - 可按业务量后续再调整阈值
 */
export const publishLimiter = createLimiter({
  store: publishLimiterStore,
  windowMs: 60 * 60 * 1000,
  max: readPositiveIntEnv('PUBLISH_LIMIT_MAX_PER_HOUR', 5),
  keyGenerator: (req) => buildUserScopedKey(req, 'publish'),
  message: '发布过于频繁，请稍后再试'
})

/**
 * 聊天接口限流：
 * - 覆盖会话创建、列表、消息拉取、未读汇总、已读更新等接口
 * - 兼顾正常聊天刷新频率和基础防刷能力
 */
export const conversationApiLimiter = createLimiter({
  store: conversationLimiterStore,
  windowMs: 60 * 1000,
  max: readPositiveIntEnv('CONVERSATION_API_LIMIT_MAX_PER_MIN', 1800),
  keyGenerator: (req) => buildUserScopedKey(req, 'conversation'),
  message: '聊天请求过于频繁，请稍后再试'
})
