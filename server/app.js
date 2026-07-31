/**
 * 租号网站后端API服务
 *
 * 技术栈：Express + MySQL + JWT + bcryptjs
 *
 * API路由总览：
 *   GET  /api/health           — 健康检查（无需认证）
 *   POST /api/register         — 用户注册（无需认证）
 *   POST /api/login            — 用户登录，返回JWT Token
 *   GET  /api/orders/stats      — 我的订单统计（需要登录）
 *   GET  /api/orders            — 我的订单列表（需要登录，支持状态筛选+分页）
 *   GET  /api/seller/orders/stats — 我卖出的订单统计（需要登录）
 *   GET  /api/seller/orders       — 我卖出的订单列表（需要登录，支持状态筛选+分页）
 *   GET  /api/my-listings/stats  — 我发布的商品统计（需要登录）
 *   GET  /api/my-listings        — 我发布的商品列表（需要登录，支持状态筛选+分页）
 *   GET  /api/listings          — 商品列表（支持筛选+排序+分页）
 *   GET  /api/listings/:id      — 商品详情
 *   POST /api/listings          — 发布商品（需要登录 + authRequired中间件）
 *
 * 启动方式：
 *   cd server && npm run dev     （开发模式，热重载）
 *   cd server && npm start       （生产模式）
 */

import express from 'express'
import { SALE_ITEM_CONFIG } from './constants/saleItems.js'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from '@simplewebauthn/server'
import cors from 'cors'
import dotenv from 'dotenv'
import fs from 'fs'
import { createServer } from 'http'
import path from 'path'
import multer from 'multer'
import { Server as SocketIOServer } from 'socket.io'
import pool from './infrastructure/db.js'           // MySQL连接池
import {
  helmetMiddleware,
  authLimiter,
  publicReadLimiter,
  authenticatedReadLimiter,
  authenticatedWriteLimiter,
  orderWriteLimiter,
  publishLimiter,
  conversationApiLimiter
} from './middleware/security.middleware.js'
import { createSlidingWindowRateStore } from './infrastructure/rate-limit-store.js'
import {
  buildManagedFileReadUrl,
  buildManagedUploadUrl,
  deleteManagedFileByUrl,
  getCosRuntimeConfig,
  uploadManagedFileToCos
} from './infrastructure/cos.js'
import {
  acquireDistributedLock,
  buildListingOrderLockKey,
  buildOrderLockKey,
  createLockToken,
  createLoginSession,
  getCurrentOnlineUserCount,
  getLoginSession,
  getListingDetailCache,
  getRedisRuntimeConfig,
  getUsersOnlineStatus,
  invalidateListingDetailCache,
  invalidateListingDetailCaches,
  markUserDisconnected,
  releaseDistributedLock,
  revokeAllLoginSessionsByUserId,
  revokeLoginSession,
  setListingDetailCache,
  touchLoginSession,
  touchUserPresence
} from './infrastructure/redis.js'
import { canAccessProtectedBanMedia } from './constants/accessPolicy.js'
import { BUYER_AGREEMENT_VERSION, PAYMENT_AGREEMENT_VERSION } from './constants/rentalAgreements.js'
import { fileURLToPath } from 'url'
import { createAuthModule } from './modules/auth/auth.service.js'
import { createCaptchaProvider } from './modules/auth/captcha-provider.service.js'
import { createSmsCodeService } from './modules/auth/sms-code.service.js'
import { createSmsProvider } from './modules/auth/sms-provider.service.js'
import { createChatModule } from './modules/chat/chat.module.js'
import { registerChatSocket } from './modules/chat/chat.socket.js'
import { createPaymentProvider } from './modules/payment/payment-provider.service.js'
import { createPaymentService } from './modules/payment/payment.service.js'

import { registerAuthRoutes } from './routes/auth.routes.js'
import { registerPaymentRoutes } from './routes/payment.routes.js'
import { registerUploadRoutes } from './routes/upload.routes.js'
import { registerAdminRoutes } from './routes/admin.routes.js'
import { registerFeedbackRoutes } from './routes/feedback.routes.js'
import { registerSupportRoutes } from './routes/support.routes.js'
import { registerNotificationRoutes } from './routes/notification.routes.js'
import { registerConversationRoutes } from './routes/conversation.routes.js'
import { registerMyListingsRoutes } from './routes/my-listings.routes.js'
import { registerOrdersRoutes } from './routes/order.routes.js'
import { registerListingRoutes } from './routes/listing.routes.js'
import { createNotificationService } from './modules/notification/notification.service.js'
import {
  buildBuyerRentPriceSql,
  buildOrderListingTitle,
  calculateBuyerOrderRentPrice,
  createListingService,
  generateListingNo
} from './modules/listing/listing.service.js'
import { createListingMediaService } from './modules/listing/listing-media.service.js'
import { createOrderLifecycleService } from './modules/order/order-lifecycle.service.js'
import { createOrderQueryService } from './modules/order/order-query.service.js'
import {
  getSmsSecurityThresholds,
  getPendingPaymentTimeoutMinutes,
  getSaleItemConfig,
  loadBusinessSettings
} from './modules/business-settings/runtime.js'
import { yuanToCent, centToRoundedYuan } from './utils/money.js'
import {
  buildListingDetailPayload,
  buildMyListingStatsPayload,
  listingStatusToLabel,
  normalizeListingMoneyFields,
  normalizeMyListingFields
} from './serializers/listing.serializer.js'
import { buildOrderStatsPayload, normalizeOrderMoneyFields, orderStatusToLabel } from './serializers/order.serializer.js'
import {
  normalizeInsuranceLevel,
  normalizeListingItemMode,
  toBanRecordFlag,
  validateListingPayload,
  validateRequiredPayload
} from './modules/listing/listing-validator.js'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 加载 server/.env 环境变量，兼容从项目根目录执行 `npm run dev:server`
dotenv.config({ path: path.join(__dirname, '.env') })

function parseCommaSeparatedEnv(value) {
  return Array.from(new Set(
    String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  ))
}

function loadChatBannedWordsFromFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return []
    }

    return Array.from(new Set(
      fs.readFileSync(filePath, 'utf8')
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter((item) => item && !item.startsWith('#'))
    ))
  } catch (error) {
    console.warn('[chat] failed to load banned words file', {
      filePath,
      message: error?.message || error
    })
    return []
  }
}

function createCorsOriginValidator(allowedOrigins = []) {
  const allowlist = new Set(allowedOrigins)
  const hasExplicitAllowlist = allowlist.size > 0

  return (origin, callback) => {
    if (!origin || !hasExplicitAllowlist || allowlist.has(origin)) {
      callback(null, true)
      return
    }
    callback(new Error('CORS origin not allowed'))
  }
}

// ==================== 应用初始化 ====================
const app = express()
const CORS_ALLOWED_ORIGINS = parseCommaSeparatedEnv(process.env.CORS_ALLOWED_ORIGINS)
const corsOriginValidator = createCorsOriginValidator(CORS_ALLOWED_ORIGINS)
const httpServer = createServer(app)
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: corsOriginValidator,
    credentials: true
  }
})
const port = Number(process.env.PORT || 3000)
const FILE_STORAGE_DRIVER = ['cos', 'local'].includes(String(process.env.FILE_STORAGE_DRIVER || '').trim().toLowerCase())
  ? String(process.env.FILE_STORAGE_DRIVER || '').trim().toLowerCase()
  : 'local'
const UPLOAD_ROOT_DIR = path.join(__dirname, 'uploads')
const LISTING_IMAGES_UPLOAD_DIR = path.join(UPLOAD_ROOT_DIR, 'listing-images')
const BAN_IMAGES_UPLOAD_DIR = path.join(UPLOAD_ROOT_DIR, 'ban-images')
const BAN_VIDEOS_UPLOAD_DIR = path.join(UPLOAD_ROOT_DIR, 'ban-videos')
const CHAT_IMAGES_UPLOAD_DIR = path.join(UPLOAD_ROOT_DIR, 'chat-images')
const CHAT_BANNED_WORDS_FILE_PATH = path.join(__dirname, 'config', 'chat-banned-words.txt')
let HAS_LISTING_IMAGE_SORT_ORDER = false
let HAS_BAN_IMAGE_SORT_ORDER = false
const CHAT_SLOW_QUERY_MS = Math.max(50, Number(process.env.CHAT_SLOW_QUERY_MS || 200))
const CHAT_BANNED_WORDS = loadChatBannedWordsFromFile(CHAT_BANNED_WORDS_FILE_PATH)
const SOCKET_MESSAGE_RATE_LIMIT_WINDOW_MS = 10 * 1000
const SOCKET_MESSAGE_RATE_LIMIT_MAX = Math.max(50, Number(process.env.SOCKET_MESSAGE_RATE_LIMIT_MAX || 50))
const CHAT_IMAGE_UPLOAD_RATE_LIMIT_WINDOW_MS = 60 * 1000
const CHAT_IMAGE_UPLOAD_RATE_LIMIT_MAX = 5
const USER_DAILY_UPLOAD_LIMIT_BYTES = Math.max(
  0,
  Number(process.env.USER_DAILY_UPLOAD_LIMIT_BYTES || 100 * 1024 * 1024) || 100 * 1024 * 1024
)
const AUTH_COOKIE_NAME = 'auth_token'
const TRUSTED_DEVICE_COOKIE_NAME = 'admin_trusted_device'
const { enabled: COS_ENABLED } = getCosRuntimeConfig()
const USE_COS_STORAGE = FILE_STORAGE_DRIVER === 'cos'
const {
  LOGIN_SESSION_TTL_SECONDS,
  ORDER_LOCK_TTL_MS,
  CHAT_ONLINE_TTL_SECONDS
} = getRedisRuntimeConfig()
const ADMIN_STEP_UP_CHALLENGE_TTL_MS = 5 * 60 * 1000
const ADMIN_STEP_UP_MAX_ACTIVE_CHALLENGES_PER_USER = 3
const ADMIN_PASSKEY_REGISTRATION_TTL_MS = 10 * 60 * 1000
const ADMIN_TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000
const ADMIN_PASSKEY_ENABLED = !['0', 'false', 'off', 'no'].includes(
  String(process.env.ADMIN_PASSKEY_ENABLED ?? 'true').trim().toLowerCase()
)
const ADMIN_PASSKEY_RP_NAME = String(process.env.PASSKEY_RP_NAME || 'Game Hub Admin').trim() || 'Game Hub Admin'
const ADMIN_PASSKEY_RP_ID = String(process.env.PASSKEY_RP_ID || '').trim()
const ADMIN_STEP_UP_POLICIES = Object.freeze({
  updateUserRole: {
    action: 'update_user_role',
    message: '用户角色变更需要完成二次校验',
    maxAgeMinutes: 15,
    requirePasskey: true,
    requireTrustedDevice: false,
    allowTrustedDeviceBypassPasskey: true
  },
  banUser: {
    action: 'ban_user',
    message: '封禁用户需要完成二次校验',
    maxAgeMinutes: 15,
    requirePasskey: true,
    requireTrustedDevice: false
  },
  unbanUser: {
    action: 'unban_user',
    message: '解除封禁需要完成二次校验',
    maxAgeMinutes: 15,
    requirePasskey: true,
    requireTrustedDevice: false
  },
  closeOrder: {
    action: 'close_order',
    message: '关闭订单需要完成二次校验',
    maxAgeMinutes: 15,
    requirePasskey: true,
    requireTrustedDevice: false
  },
  deactivateListing: {
    action: 'deactivate_listing',
    message: '下架商品需要完成二次校验',
    maxAgeMinutes: 15,
    requirePasskey: true,
    requireTrustedDevice: false
  },
  deletePasskey: {
    action: 'delete_passkey',
    message: '删除 Passkey 需要完成二次校验',
    maxAgeMinutes: 5,
    requirePasskey: true,
    requireTrustedDevice: false
  },
  trustCurrentDevice: {
    action: 'trust_current_device',
    message: '信任当前设备需要完成二次校验',
    maxAgeMinutes: 5,
    requirePasskey: true,
    requireTrustedDevice: false
  },
  revokeTrustedDevice: {
    action: 'revoke_trusted_device',
    message: '移除受信任设备需要完成二次校验',
    maxAgeMinutes: 5,
    requirePasskey: true,
    requireTrustedDevice: false
  },
  revokeAllTrustedDevices: {
    action: 'revoke_all_trusted_devices',
    message: '清空受信任设备需要完成二次校验',
    maxAgeMinutes: 5,
    requirePasskey: true,
    requireTrustedDevice: false
  },
  updateSecuritySettings: {
    action: 'update_security_settings',
    message: '安全设置修改需要完成二次校验',
    maxAgeMinutes: 5,
    requirePasskey: true,
    requireTrustedDevice: false,
    allowTrustedDeviceBypassPasskey: true
  },
  updateBusinessSettings: {
    action: 'update_business_settings',
    message: '修改平台参数需要完成二次校验',
    maxAgeMinutes: 5,
    requirePasskey: true,
    requireTrustedDevice: false,
    allowTrustedDeviceBypassPasskey: true
  },
  reviewWithdraw: {
    action: 'review_withdraw',
    message: '审核提现申请需要完成二次校验',
    maxAgeMinutes: 5,
    requirePasskey: true,
    requireTrustedDevice: false,
    allowTrustedDeviceBypassPasskey: true
  },
  approveListing: {
    action: 'approve_listing',
    message: '审核通过商品需要完成二次校验',
    maxAgeMinutes: 10,
    requirePasskey: true,
    requireTrustedDevice: false
  },
  rejectListing: {
    action: 'reject_listing',
    message: '驳回商品需要完成二次校验',
    maxAgeMinutes: 10,
    requirePasskey: true,
    requireTrustedDevice: false
  },
  batchOperation: {
    action: 'batch_operation',
    message: '批量操作需要完成二次校验',
    maxAgeMinutes: 10,
    requirePasskey: true,
    requireTrustedDevice: false
  }
})
const ADMIN_STEP_UP_POLICY_BY_ACTION = Object.freeze(
  Object.values(ADMIN_STEP_UP_POLICIES).reduce((result, item) => {
    result[item.action] = item
    return result
  }, {})
)
const adminStepUpChallenges = new Map()
const adminPasskeyRegistrationChallenges = new Map()

fs.mkdirSync(LISTING_IMAGES_UPLOAD_DIR, { recursive: true })
fs.mkdirSync(BAN_IMAGES_UPLOAD_DIR, { recursive: true })
fs.mkdirSync(BAN_VIDEOS_UPLOAD_DIR, { recursive: true })
fs.mkdirSync(CHAT_IMAGES_UPLOAD_DIR, { recursive: true })

// 服务器部署在 Nginx 反向代理后面时，需要信任代理头，避免限流中间件误报。
app.set('trust proxy', 1)

async function invalidateListingCacheSafely(listingId) {
  const safeListingId = Number(listingId || 0)
  if (!safeListingId) return
  try {
    await invalidateListingDetailCache(safeListingId)
  } catch (error) {
    console.warn('[cache] invalidate listing detail failed', {
      listingId: safeListingId,
      message: error?.message || error
    })
  }
}

async function invalidateListingCachesSafely(listingIds = []) {
  const safeListingIds = [...new Set(
    (Array.isArray(listingIds) ? listingIds : [])
      .map((listingId) => Number(listingId || 0))
      .filter((listingId) => listingId > 0)
  )]
  if (!safeListingIds.length) return

  try {
    await invalidateListingDetailCaches(safeListingIds)
  } catch (error) {
    console.warn('[cache] batch invalidate listing detail failed', {
      listingIds: safeListingIds,
      message: error?.message || error
    })
  }
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

// JWT配置：密钥和过期时间（从环境变量读取，开发环境有默认值）
const jwtSecret = String(process.env.JWT_SECRET || '').trim()
const userJwtExpiresIn = String(process.env.USER_JWT_EXPIRES_IN || process.env.JWT_EXPIRES_IN || '4h').trim() || '4h'
const adminJwtExpiresIn = String(process.env.ADMIN_JWT_EXPIRES_IN || userJwtExpiresIn).trim() || userJwtExpiresIn
const userAuthCookieMaxAgeMs = parseDurationToMs(userJwtExpiresIn)
const adminAuthCookieMaxAgeMs = parseDurationToMs(adminJwtExpiresIn)
const userLoginSessionTtlSeconds = Math.max(
  60,
  Number(process.env.USER_LOGIN_SESSION_TTL_SECONDS || process.env.LOGIN_SESSION_TTL_SECONDS || 7 * 24 * 60 * 60) || 7 * 24 * 60 * 60
)
const adminLoginSessionTtlSeconds = Math.max(
  60,
  Number(process.env.ADMIN_LOGIN_SESSION_TTL_SECONDS || 24 * 60 * 60) || 24 * 60 * 60
)
const userSessionIdleTimeoutMs = Math.max(
  60 * 1000,
  parseDurationToMs(process.env.USER_SESSION_IDLE_TIMEOUT || '') || 12 * 60 * 60 * 1000
)
const adminSessionIdleTimeoutMs = Math.max(
  60 * 1000,
  parseDurationToMs(process.env.ADMIN_SESSION_IDLE_TIMEOUT || '') || 30 * 60 * 1000
)
const userJwtRenewWindowMs = Math.max(
  60 * 1000,
  parseDurationToMs(process.env.USER_JWT_RENEW_WINDOW || '') || 15 * 60 * 1000
)
const adminJwtRenewWindowMs = Math.max(
  60 * 1000,
  parseDurationToMs(process.env.ADMIN_JWT_RENEW_WINDOW || '') || 15 * 60 * 1000
)

if (
  !jwtSecret ||
  jwtSecret === 'please_change_this_secret' ||
  jwtSecret === 'dev-jwt-secret' ||
  jwtSecret.length < 32
) {
  throw new Error('JWT_SECRET 不安全：请在 `server/.env` 中设置至少 32 位的高强度随机密钥')
}

// 全局中间件：跨域支持 + JSON请求体解析（限制2MB防止大文件攻击）
app.use(cors({
  origin: corsOriginValidator,
  credentials: true
}))
app.use(helmetMiddleware)
app.use(express.json({
  limit: '2mb',
  verify: (req, _res, buffer) => {
    req.rawBody = buffer?.length ? buffer.toString('utf8') : ''
  }
}))
app.use(express.urlencoded({
  extended: false,
  limit: '2mb',
  verify: (req, _res, buffer) => {
    req.rawBody = buffer?.length ? buffer.toString('utf8') : ''
  }
}))

const socketMessageRateStore = await createSlidingWindowRateStore({
  namespace: 'socket-message',
  windowMs: SOCKET_MESSAGE_RATE_LIMIT_WINDOW_MS,
  max: SOCKET_MESSAGE_RATE_LIMIT_MAX
})
const chatImageUploadRateStore = await createSlidingWindowRateStore({
  namespace: 'chat-image-upload',
  windowMs: CHAT_IMAGE_UPLOAD_RATE_LIMIT_WINDOW_MS,
  max: CHAT_IMAGE_UPLOAD_RATE_LIMIT_MAX
})

const authModule = createAuthModule({
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
  allowedOrigins: CORS_ALLOWED_ORIGINS
})
const {
  verifyAuthToken,
  validateAuthSession,
  issueAuthSession,
  logoutCurrentSession,
  setTrustedDeviceCookie,
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
  getAdminStepUpPolicyByAction,
  issueAdminStepUpChallenge,
  issueAdminPasskeyRegistrationChallenge,
  getAdminStepUpChallenge,
  markAdminStepUpChallengeConsumed,
  getAdminPasskeyRegistrationChallenge,
  markAdminPasskeyRegistrationChallengeConsumed,
  buildAdminStepUpPublicKeyOptions,
  refreshAdminStepUpSession,
  updateAdminPasskeyUsage,
  fetchAuthUserById,
  authRequired,
  supportOnly,
  adminOnly,
  requireStepUpAuth,
  getOptionalAuth,
  getSocketToken
} = authModule
const smsCodeService = createSmsCodeService({
  async getRuntimeConfig() {
    const businessSettings = await loadBusinessSettings(pool)
    return getSmsSecurityThresholds(businessSettings)
  }
})
const smsCodeRuntimeConfig = typeof smsCodeService.getRuntimeConfig === 'function'
  ? smsCodeService.getRuntimeConfig()
  : null
const captchaProvider = createCaptchaProvider({
  provider: process.env.CAPTCHA_PROVIDER || 'tencent'
})
const smsProvider = createSmsProvider({
  provider: process.env.SMS_PROVIDER || 'tencent',
  appName: process.env.APP_NAME || 'my-app'
})
const smsRuntimeConfig = typeof smsProvider.getRuntimeConfig === 'function'
  ? smsProvider.getRuntimeConfig()
  : null
console.log('[auth] sms provider ready', {
  provider: smsProvider.mode || process.env.SMS_PROVIDER || 'tencent',
  enabled: smsRuntimeConfig ? Boolean(smsRuntimeConfig.enabled) : Boolean(smsProvider.isEnabled),
  endpoint: smsRuntimeConfig?.endpoint || '',
  region: smsRuntimeConfig?.region || ''
})
if (smsCodeRuntimeConfig) {
  console.log('[auth] sms code security ready', {
    ttlSeconds: smsCodeRuntimeConfig.ttlSeconds,
    sendIntervalSeconds: smsCodeRuntimeConfig.sendIntervalSeconds,
    verifyMaxAttempts: smsCodeRuntimeConfig.verifyMaxAttempts,
    verifyLockSeconds: smsCodeRuntimeConfig.verifyLockSeconds,
    dailyLimit: Math.max(1, Number(process.env.SMS_CODE_DAILY_LIMIT || 10) || 10),
    ipDailyLimit: Math.max(1, Number(process.env.SMS_CODE_IP_DAILY_LIMIT || 20) || 20)
  })
}
if (Array.isArray(smsRuntimeConfig?.configIssues) && smsRuntimeConfig.configIssues.length) {
  const message = `[auth] sms provider config check failed: ${smsRuntimeConfig.configIssues.join('; ')}`
  if (smsRuntimeConfig.strictStartupCheck) {
    throw new Error(message)
  }
  console.warn(message)
}
const paymentProvider = createPaymentProvider({
  paymentProvider: process.env.PAYMENT_PROVIDER || 'mock_payment',
  withdrawProvider: process.env.WITHDRAW_PROVIDER || process.env.PAYMENT_PROVIDER || 'mock_payment',
  appName: process.env.APP_NAME || 'my-app',
  mockPaymentAutoSuccessSeconds: process.env.MOCK_PAYMENT_AUTO_SUCCESS_SECONDS,
  mockPaymentExpiresMinutes: process.env.MOCK_PAYMENT_EXPIRES_MINUTES,
  mockWithdrawImmediateSuccess: process.env.MOCK_WITHDRAW_IMMEDIATE_SUCCESS,
  huifuGatewayUrl: process.env.HUIFU_GATEWAY_URL,
  huifuSysId: process.env.HUIFU_SYS_ID,
  huifuProductId: process.env.HUIFU_PRODUCT_ID,
  huifuId: process.env.HUIFU_HUIFU_ID,
  huifuHostingPreOrderUrl: process.env.HUIFU_HOSTING_PREORDER_URL,
  huifuNotifyUrl: process.env.HUIFU_NOTIFY_URL,
  huifuReturnUrl: process.env.HUIFU_RETURN_URL,
  huifuHostingProjectTitle: process.env.HUIFU_HOSTING_PROJECT_TITLE,
  huifuHostingProjectIdH5: process.env.HUIFU_HOSTING_PROJECT_ID_H5,
  huifuHostingProjectIdPc: process.env.HUIFU_HOSTING_PROJECT_ID_PC,
  huifuHostingStyleIdH5: process.env.HUIFU_HOSTING_STYLE_ID_H5,
  huifuHostingStyleIdPc: process.env.HUIFU_HOSTING_STYLE_ID_PC,
  huifuMerchantPrivateKey: process.env.HUIFU_MERCHANT_PRIVATE_KEY,
  huifuPublicKey: process.env.HUIFU_PUBLIC_KEY,
  huifuVerifyResponseSignature: process.env.HUIFU_VERIFY_RESPONSE_SIGNATURE
})

const chatModule = createChatModule({
  pool,
  io,
  CHAT_SLOW_QUERY_MS,
  SOCKET_MESSAGE_RATE_LIMIT_WINDOW_MS,
  SOCKET_MESSAGE_RATE_LIMIT_MAX,
  socketMessageRateStore,
  getUsersOnlineStatus,
  CHAT_IMAGE_UPLOAD_URL_REGEX: /^\/api\/uploads\/files\/chat-images\/[A-Za-z0-9._-]+$/i,
  chatBannedWords: CHAT_BANNED_WORDS
})
const {
  getConversationRoomName,
  getUserRoomName,
  emitSupportDeskUpdate,
  logChatEvent,
  consumeSocketMessageQuota,
  sanitizeSupportNote,
  normalizeSupportStatus,
  sanitizeSupportSearchKeyword,
  normalizeSupportAssigneeScope,
  getSupportTimeoutMinutes,
  buildSupportTimeoutMeta,
  buildSupportOrderFilterParts,
  getSupportOrderTimeline,
  buildLegacySupportTimeline,
  emitSupportEvent,
  serializeConversationRow,
  ensureConversationSchema,
  ensureUserRoleSchema,
  ensureOrderSupportSchema,
  ensurePresaleSupportSchema,
  ensureSupportEventSchema,
  getOrderConversationAccess,
  ensureOrderConversation,
  ensureSupportConversationParticipant,
  getConversationForUser,
  getConversationMessages,
  normalizeConversationScope,
  getConversationListForUser,
  getUnreadSummaryForUser,
  markConversationAsRead,
  recordConversationMessageUpload,
  createConversationMessage,
  emitConversationMessage
} = chatModule

const notificationService = createNotificationService({
  pool,
  io,
  getUserRoomName
})
const {
  createUserNotificationSafely,
  getUserNotificationList,
  getUnreadNotificationSummary,
  markUserNotificationAsRead
} = notificationService

const orderLifecycleService = createOrderLifecycleService({
  pool,
  ORDER_LOCK_TTL_MS,
  acquireDistributedLock,
  releaseDistributedLock,
  buildOrderLockKey,
  buildListingOrderLockKey,
  createLockToken,
  invalidateListingDetailCache: invalidateListingCacheSafely,
  calculateBuyerOrderRentPrice,
  buildOrderListingTitle,
  orderStatusToLabel,
  getOrderConversationAccess,
  ensureOrderConversation,
  ensureSupportConversationParticipant,
  getConversationForUser,
  createConversationMessage,
  emitConversationMessage,
  emitSupportEvent,
  emitSupportDeskUpdate
})
const paymentService = createPaymentService({
  pool,
  orderLifecycleService,
  paymentProvider
})

function getUploadErrorMessage(error, fallbackMessage) {
  if (!error) return fallbackMessage
  if (error.code === 'LIMIT_FILE_SIZE') return '文件大小超过限制'
  if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') return '上传文件数量超出限制'
  return fallbackMessage
}

function isSafeUploadFileName(fileName) {
  return /^[A-Za-z0-9._-]+$/.test(String(fileName || ''))
}

async function canAccessBanImageByUrl(db, mediaUrl, auth) {
  const normalizedUrl = String(mediaUrl || '').trim()
  if (!normalizedUrl) return false
  const authUserId = Number(auth?.userId || 0)
  const authUsername = String(auth?.username || '')

  const [rows] = await db.execute(
    `SELECT
        l.id,
        l.listing_status,
        l.owner_user_id,
        l.owner_name,
        EXISTS (
          SELECT 1
          FROM orders o
          WHERE o.listing_id = l.id
            AND o.buyer_id = ?
        ) AS has_buyer_order
     FROM listing_ban_images bi
     JOIN listings l ON l.id = bi.listing_id
     WHERE bi.image_url = ?
     LIMIT 1`,
    [authUserId, normalizedUrl]
  )

  if (!rows.length) return false

  const row = rows[0]
  const isOwner = (row.owner_user_id !== null && Number(row.owner_user_id) === authUserId) || (!row.owner_user_id && row.owner_name === authUsername)

  return canAccessProtectedBanMedia({
    isLoggedIn: Boolean(auth?.userId),
    isAdmin: String(auth?.role || '') === 'admin',
    isOwner,
    isBuyer: Number(row.has_buyer_order) === 1,
    isActiveListing: row.listing_status === 'active'
  })
}

async function canAccessBanVideoByUrl(db, mediaUrl, auth) {
  const normalizedUrl = String(mediaUrl || '').trim()
  if (!normalizedUrl) return false
  const authUserId = Number(auth?.userId || 0)
  const authUsername = String(auth?.username || '')

  const [rows] = await db.execute(
    `SELECT
        l.id,
        l.listing_status,
        l.owner_user_id,
        l.owner_name,
        EXISTS (
          SELECT 1
          FROM orders o
          WHERE o.listing_id = l.id
            AND o.buyer_id = ?
        ) AS has_buyer_order
     FROM listings l
     WHERE l.ban_video_url = ?
     LIMIT 1`,
    [authUserId, normalizedUrl]
  )

  if (!rows.length) return false

  const row = rows[0]
  const isOwner = (row.owner_user_id !== null && Number(row.owner_user_id) === authUserId) || (!row.owner_user_id && row.owner_name === authUsername)

  return canAccessProtectedBanMedia({
    isLoggedIn: Boolean(auth?.userId),
    isAdmin: String(auth?.role || '') === 'admin',
    isOwner,
    isBuyer: Number(row.has_buyer_order) === 1,
    isActiveListing: row.listing_status === 'active'
  })
}

async function canAccessConversationImageByUrl(db, mediaUrl, auth) {
  const normalizedUrl = String(mediaUrl || '').trim()
  if (!normalizedUrl) return false
  if (String(auth?.role || '') === 'admin') return true

  const authUserId = Number(auth?.userId || 0)
  if (!authUserId) return false

  const [rows] = await db.execute(
    `SELECT 1
     FROM conversation_messages m
     JOIN conversation_participants cp
       ON cp.conversation_id = m.conversation_id
      AND cp.user_id = ?
     WHERE m.media_url = ?
     LIMIT 1`,
    [authUserId, normalizedUrl]
  )

  return rows.length > 0
}


const BASE_RATIO_CONFIG = {
  grid9: {
    specialKnife: 40,
    otherKnife: 41,
    noKnife: 42
  },
  grid6: {
    specialKnife: 42,
    otherKnife: 43,
    noKnife: 44
  }
}

const SPECIAL_KNIVES = ['赤枭', '怜悯']
const MAX_LISTING_IMAGE_COUNT = 10
const MAX_LISTING_IMAGE_UPLOAD_SIZE = 5 * 1024 * 1024
const MAX_CHAT_IMAGE_UPLOAD_SIZE = 5 * 1024 * 1024
const MIN_LISTING_DEPOSIT_YUAN = 100
const MAX_LISTING_DEPOSIT_YUAN = 2000
const MAX_IMAGE_URL_LENGTH = 1_500_000
const IMAGE_DATA_URL_REGEX = /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i
const IMAGE_HTTP_URL_REGEX = /^https?:\/\/\S+$/i
const LISTING_IMAGE_UPLOAD_URL_REGEX = /^\/api\/uploads\/files\/listing-images\/[A-Za-z0-9._-]+$/i
const CHAT_IMAGE_UPLOAD_URL_REGEX = /^\/api\/uploads\/files\/chat-images\/[A-Za-z0-9._-]+$/i
const MAX_BAN_IMAGE_COUNT = 5
const MAX_BAN_IMAGE_UPLOAD_SIZE = 5 * 1024 * 1024
const MAX_BAN_VIDEO_UPLOAD_SIZE = 100 * 1024 * 1024
const BAN_IMAGE_UPLOAD_URL_REGEX = /^\/api\/uploads\/files\/ban-images\/[A-Za-z0-9._-]+$/i
const BAN_VIDEO_UPLOAD_URL_REGEX = /^\/api\/uploads\/files\/ban-videos\/[A-Za-z0-9._-]+$/i
const LISTING_ITEM_MODES = new Set(['sale', 'gift'])

function validateListingPayloadWithDefaults(payload) {
  return validateListingPayload(payload, {
    saleItemConfig: SALE_ITEM_CONFIG,
    listingItemModes: LISTING_ITEM_MODES,
    maxListingImageCount: MAX_LISTING_IMAGE_COUNT,
    maxImageUrlLength: MAX_IMAGE_URL_LENGTH,
    imageDataUrlRegex: IMAGE_DATA_URL_REGEX,
    imageHttpUrlRegex: IMAGE_HTTP_URL_REGEX,
    listingImageUploadUrlRegex: LISTING_IMAGE_UPLOAD_URL_REGEX,
    maxBanImageCount: MAX_BAN_IMAGE_COUNT,
    banImageUploadUrlRegex: BAN_IMAGE_UPLOAD_URL_REGEX,
    banVideoUploadUrlRegex: BAN_VIDEO_UPLOAD_URL_REGEX
  })
}

const listingMediaService = createListingMediaService({
  fs,
  path,
  listingImagesUploadDir: LISTING_IMAGES_UPLOAD_DIR,
  banImagesUploadDir: BAN_IMAGES_UPLOAD_DIR,
  banVideosUploadDir: BAN_VIDEOS_UPLOAD_DIR,
  chatImagesUploadDir: CHAT_IMAGES_UPLOAD_DIR,
  listingImageUploadUrlRegex: LISTING_IMAGE_UPLOAD_URL_REGEX,
  chatImageUploadUrlRegex: CHAT_IMAGE_UPLOAD_URL_REGEX,
  banImageUploadUrlRegex: BAN_IMAGE_UPLOAD_URL_REGEX,
  banVideoUploadUrlRegex: BAN_VIDEO_UPLOAD_URL_REGEX,
  maxListingImageCount: MAX_LISTING_IMAGE_COUNT,
  hasListingImageSortOrder: () => HAS_LISTING_IMAGE_SORT_ORDER,
  hasBanImageSortOrder: () => HAS_BAN_IMAGE_SORT_ORDER,
  deleteManagedFileByUrl: USE_COS_STORAGE ? deleteManagedFileByUrl : null
})
const {
  getListingImagesOrderSql,
  getObsoleteListingImageUrls,
  getObsoleteBanMediaUrls,
  cleanupOrphanUploadedFiles,
  saveListingBanMedia,
  saveListingImages,
  fetchListingBanImages
} = listingMediaService

const orderQueryService = createOrderQueryService({
  pool,
  getListingImagesOrderSql,
  normalizeOrderMoneyFields,
  normalizeListingMoneyFields,
  buildOrderListingTitle,
  fetchListingBanImages,
  buildListingDetailPayload
})

const IMAGE_UPLOAD_MIME_TYPES = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif']
])
const VIDEO_UPLOAD_MIME_TYPES = new Map([
  ['video/mp4', '.mp4'],
  ['video/webm', '.webm'],
  ['video/ogg', '.ogv'],
  ['video/quicktime', '.mov']
])

function createUploadFilename(prefix = 'file', extension = '') {
  const safeExt = /^[.][a-z0-9]+$/.test(extension) ? extension : ''
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`
}

function createDiskUploader(targetDir, prefix, acceptedMimeTypes, fileSizeLimit, maxCount = 1, fileLabel = '文件') {
  const storage = multer.diskStorage({
    destination(_req, _file, cb) {
      cb(null, targetDir)
    },
    filename(_req, file, cb) {
      const normalizedMimeType = String(file.mimetype || '').toLowerCase()
      const safeExtension = acceptedMimeTypes.get(normalizedMimeType)
      if (!safeExtension) {
        cb(new Error(`仅支持指定${fileLabel}格式上传`))
        return
      }
      cb(null, createUploadFilename(prefix, safeExtension))
    }
  })

  return multer({
    storage,
    limits: {
      fileSize: fileSizeLimit,
      files: maxCount
    },
    fileFilter(_req, file, cb) {
      const normalizedMimeType = String(file.mimetype || '').toLowerCase()
      if (acceptedMimeTypes.has(normalizedMimeType)) {
        cb(null, true)
        return
      }
      cb(new Error(`仅支持指定${fileLabel}格式上传`))
    }
  })
}

function createMemoryUploader(prefix, acceptedMimeTypes, fileSizeLimit, maxCount = 1, fileLabel = '文件') {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: fileSizeLimit,
      files: maxCount
    },
    fileFilter(_req, file, cb) {
      const normalizedMimeType = String(file.mimetype || '').toLowerCase()
      if (acceptedMimeTypes.has(normalizedMimeType)) {
        cb(null, true)
        return
      }
      cb(new Error(`仅支持指定${fileLabel}格式上传`))
    }
  })

  function attachManagedFileName(file) {
    const normalizedMimeType = String(file?.mimetype || '').toLowerCase()
    const safeExtension = acceptedMimeTypes.get(normalizedMimeType)
    if (!safeExtension) {
      throw new Error(`仅支持指定${fileLabel}格式上传`)
    }
    file.filename = createUploadFilename(prefix, safeExtension)
    return file
  }

  function finalizeFiles(req) {
    if (Array.isArray(req.files)) {
      req.files.forEach(attachManagedFileName)
    }
    if (req.file) {
      attachManagedFileName(req.file)
    }
  }

  return {
    array(fieldName, maxFiles = maxCount) {
      return (req, res, cb) => {
        upload.array(fieldName, maxFiles)(req, res, (error) => {
          if (!error) {
            finalizeFiles(req)
          }
          cb(error)
        })
      }
    },
    single(fieldName) {
      return (req, res, cb) => {
        upload.single(fieldName)(req, res, (error) => {
          if (!error) {
            finalizeFiles(req)
          }
          cb(error)
        })
      }
    }
  }
}

function createManagedUploader(targetDir, prefix, acceptedMimeTypes, fileSizeLimit, maxCount = 1, fileLabel = '文件') {
  return USE_COS_STORAGE
    ? createMemoryUploader(prefix, acceptedMimeTypes, fileSizeLimit, maxCount, fileLabel)
    : createDiskUploader(targetDir, prefix, acceptedMimeTypes, fileSizeLimit, maxCount, fileLabel)
}

const listingImageUploader = createManagedUploader(
  LISTING_IMAGES_UPLOAD_DIR,
  'listing-image',
  IMAGE_UPLOAD_MIME_TYPES,
  MAX_LISTING_IMAGE_UPLOAD_SIZE,
  MAX_LISTING_IMAGE_COUNT,
  '图片'
)
const banImageUploader = createManagedUploader(
  BAN_IMAGES_UPLOAD_DIR,
  'ban-image',
  IMAGE_UPLOAD_MIME_TYPES,
  MAX_BAN_IMAGE_UPLOAD_SIZE,
  MAX_BAN_IMAGE_COUNT,
  '图片'
)
const banVideoUploader = createManagedUploader(
  BAN_VIDEOS_UPLOAD_DIR,
  'ban-video',
  VIDEO_UPLOAD_MIME_TYPES,
  MAX_BAN_VIDEO_UPLOAD_SIZE,
  1,
  '视频'
)
const chatImageUploader = createManagedUploader(
  CHAT_IMAGES_UPLOAD_DIR,
  'chat-image',
  IMAGE_UPLOAD_MIME_TYPES,
  MAX_CHAT_IMAGE_UPLOAD_SIZE,
  1,
  '图片'
)
registerUploadRoutes({
  app,
  fs,
  path,
  pool,
  authRequired,
  getOptionalAuth,
  isSafeUploadFileName,
  toUploadFileUrl,
  buildManagedFileReadUrl: USE_COS_STORAGE ? buildManagedFileReadUrl : null,
  uploadManagedFileToCos: USE_COS_STORAGE ? uploadManagedFileToCos : null,
  deleteManagedFileByUrl: USE_COS_STORAGE ? deleteManagedFileByUrl : null,
  storageDriver: FILE_STORAGE_DRIVER,
  useCosStorage: USE_COS_STORAGE,
  cosEnabled: COS_ENABLED,
  getConversationForUser,
  recordConversationMessageUpload,
  canAccessBanImageByUrl,
  canAccessBanVideoByUrl,
  canAccessConversationImageByUrl,
  BAN_IMAGES_UPLOAD_DIR,
  BAN_VIDEOS_UPLOAD_DIR,
  CHAT_IMAGES_UPLOAD_DIR,
  LISTING_IMAGES_UPLOAD_DIR,
  banImageUploader,
  MAX_BAN_IMAGE_COUNT,
  getUploadErrorMessage,
  listingImageUploader,
  MAX_LISTING_IMAGE_COUNT,
  banVideoUploader,
  chatImageUploader,
  CHAT_IMAGE_UPLOAD_RATE_LIMIT_WINDOW_MS,
  CHAT_IMAGE_UPLOAD_RATE_LIMIT_MAX,
  USER_DAILY_UPLOAD_LIMIT_BYTES,
  chatImageUploadRateStore,
  cleanupOrphanUploadedFiles,
  LISTING_IMAGE_UPLOAD_URL_REGEX,
  CHAT_IMAGE_UPLOAD_URL_REGEX,
  BAN_IMAGE_UPLOAD_URL_REGEX,
  BAN_VIDEO_UPLOAD_URL_REGEX
})


function toUploadFileUrl(folderName, fileName) {
  return buildManagedUploadUrl(folderName, fileName)
}

app.get('/api/health/storage', (_req, res) => {
  res.json({
    status: 'ok',
    storage: {
      driver: FILE_STORAGE_DRIVER,
      useCosStorage: USE_COS_STORAGE,
      cosConfigured: COS_ENABLED,
      localUploadRootDir: UPLOAD_ROOT_DIR,
      managedFolders: {
        listingImages: LISTING_IMAGES_UPLOAD_DIR,
        banImages: BAN_IMAGES_UPLOAD_DIR,
        banVideos: BAN_VIDEOS_UPLOAD_DIR,
        chatImages: CHAT_IMAGES_UPLOAD_DIR
      }
    }
  })
})

function buildTrustedListingItems(itemsPayload, businessSettings = null) {
  const items = itemsPayload && typeof itemsPayload === 'object' ? itemsPayload : {}
  const saleItemConfig = businessSettings ? getSaleItemConfig(businessSettings) : SALE_ITEM_CONFIG

  return Object.entries(saleItemConfig).map(([itemKey, config]) => {
    const quantity = toNullableInteger(items[itemKey]?.quantity) ?? 0
    const itemMode = String(items[itemKey]?.itemMode || items[itemKey]?.mode || 'sale').trim().toLowerCase()
    const normalizedItemMode = LISTING_ITEM_MODES.has(itemMode) ? itemMode : 'sale'
    const totalPriceInCent = normalizedItemMode === 'gift' ? 0 : quantity * config.unitPriceInCent

    return {
      itemKey,
      itemName: config.itemName,
      itemMode: normalizedItemMode,
      quantity,
      unitPriceInCent: config.unitPriceInCent,
      totalPriceInCent
    }
  })
}

async function ensureListingNumberSchema() {
  const databaseName = process.env.DB_NAME || 'game_rental'

  const [columnRows] = await pool.execute(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'listings'
       AND COLUMN_NAME = 'listing_no'
     LIMIT 1`,
    [databaseName]
  )
  if (!columnRows.length) {
    await pool.execute(
      `ALTER TABLE listings
       ADD COLUMN listing_no VARCHAR(20) DEFAULT NULL COMMENT '商品编号（年月日+4位随机数，如202605191652）' AFTER id`
    )
  }

  const [indexRows] = await pool.execute(
    `SELECT INDEX_NAME
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'listings'
       AND INDEX_NAME = 'uk_listings_listing_no'
     LIMIT 1`,
    [databaseName]
  )
  if (!indexRows.length) {
    await pool.execute(
      'ALTER TABLE listings ADD UNIQUE INDEX uk_listings_listing_no (listing_no)'
    )
  }

  const [rows] = await pool.execute(
    `SELECT id, COALESCE(published_at, created_at) AS seed_time
     FROM listings
     WHERE listing_no IS NULL OR listing_no = ''
     ORDER BY id ASC`
  )

  for (const row of rows) {
    const listingNo = await generateListingNo(pool, row.seed_time || new Date())
    await pool.execute(
      'UPDATE listings SET listing_no = ? WHERE id = ?',
      [listingNo, row.id]
    )
  }
}

async function ensureBanMediaSchema() {
  const databaseName = process.env.DB_NAME || 'game_rental'

  const [listingImageSortOrderRows] = await pool.execute(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'listing_images'
       AND COLUMN_NAME = 'sort_order'
     LIMIT 1`,
    [databaseName]
  )
  if (!listingImageSortOrderRows.length) {
    await pool.execute(
      `ALTER TABLE listing_images
       ADD COLUMN sort_order INT NOT NULL DEFAULT 0 COMMENT '排序序号（小的在前）' AFTER image_url`
    )
  }
  HAS_LISTING_IMAGE_SORT_ORDER = true

  const [banVideoColumnRows] = await pool.execute(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'listings'
       AND COLUMN_NAME = 'ban_video_url'
     LIMIT 1`,
    [databaseName]
  )
  if (!banVideoColumnRows.length) {
    await pool.execute(
      `ALTER TABLE listings
       ADD COLUMN ban_video_url VARCHAR(500) DEFAULT NULL COMMENT '无封禁记录视频URL' AFTER ban_record`
    )
  }

  await pool.execute(
    `CREATE TABLE IF NOT EXISTS listing_ban_images (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '记录唯一ID',
      listing_id INT NOT NULL COMMENT '关联的商品ID',
      image_url VARCHAR(500) NOT NULL COMMENT '处罚截图URL',
      sort_order INT NOT NULL DEFAULT 0 COMMENT '排序序号（小的在前）',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
      FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
      INDEX idx_listing_ban_images_listing_id (listing_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )

  const [banImageSortOrderRows] = await pool.execute(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'listing_ban_images'
       AND COLUMN_NAME = 'sort_order'
     LIMIT 1`,
    [databaseName]
  )
  if (!banImageSortOrderRows.length) {
    await pool.execute(
      `ALTER TABLE listing_ban_images
       ADD COLUMN sort_order INT NOT NULL DEFAULT 0 COMMENT '排序序号（小的在前）' AFTER image_url`
    )
  }
  HAS_BAN_IMAGE_SORT_ORDER = true
}

async function ensureListingItemModeSchema() {
  const databaseName = process.env.DB_NAME || 'game_rental'
  const [columnRows] = await pool.execute(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'listing_items'
       AND COLUMN_NAME = 'item_mode'
     LIMIT 1`,
    [databaseName]
  )

  if (!columnRows.length) {
    await pool.execute(
      `ALTER TABLE listing_items
       ADD COLUMN item_mode ENUM('sale', 'gift') NOT NULL DEFAULT 'sale' COMMENT '额外物品处理方式：出售/赠送' AFTER item_name`
    )
  }
}

async function ensureListingDecontaminationChamberLevelSchema() {
  const databaseName = process.env.DB_NAME || 'game_rental'
  const [columnRows] = await pool.execute(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'listings'
       AND COLUMN_NAME = 'decontamination_chamber_level'
     LIMIT 1`,
    [databaseName]
  )

  if (!columnRows.length) {
    await pool.execute(
      `ALTER TABLE listings
       ADD COLUMN decontamination_chamber_level TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '洗消舱等级（0-3）' AFTER dive_level`
    )
  }
}

async function ensureListingReviewSchema() {
  const databaseName = process.env.DB_NAME || 'game_rental'
  const hasListingColumn = async (columnName) => {
    const [rows] = await pool.execute(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'listings'
         AND COLUMN_NAME = ?
       LIMIT 1`,
      [databaseName, columnName]
    )
    return rows.length > 0
  }
  const columns = [
    {
      name: 'seller_contact_wechat',
      sql: `ALTER TABLE listings
            ADD COLUMN seller_contact_wechat VARCHAR(50) NOT NULL DEFAULT '' COMMENT '卖家联系微信号' AFTER owner_name`
    },
    {
      name: 'review_status',
      sql: `ALTER TABLE listings
            ADD COLUMN review_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'approved' COMMENT '审核状态：待审/通过/驳回' AFTER listing_status`
    },
    {
      name: 'reviewed_by',
      sql: `ALTER TABLE listings
            ADD COLUMN reviewed_by INT DEFAULT NULL COMMENT '最后审核管理员ID' AFTER review_status`
    },
    {
      name: 'reviewed_at',
      sql: `ALTER TABLE listings
            ADD COLUMN reviewed_at DATETIME DEFAULT NULL COMMENT '最后审核时间' AFTER reviewed_by`
    },
    {
      name: 'review_reason',
      sql: `ALTER TABLE listings
            ADD COLUMN review_reason VARCHAR(500) DEFAULT NULL COMMENT '审核备注或驳回原因' AFTER reviewed_at`
    }
  ]

  for (const column of columns) {
    if (!(await hasListingColumn(column.name))) {
      await pool.execute(column.sql)
    }
  }

  if (await hasListingColumn('seller_contact_phone')) {
    await pool.execute('ALTER TABLE listings DROP COLUMN `seller_contact_phone`')
  }

  await pool.execute(
    `UPDATE listings
     SET review_status = CASE
       WHEN listing_status = 'pending_review' THEN 'pending'
       ELSE 'approved'
     END
     WHERE review_status IS NULL
        OR review_status = ''`
  )
}

async function ensureAdminOperationLogSchema() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS admin_operation_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '管理员操作日志ID',
      operator_user_id INT DEFAULT NULL COMMENT '操作管理员ID',
      operator_name VARCHAR(100) NOT NULL DEFAULT '' COMMENT '操作管理员名称',
      module VARCHAR(50) NOT NULL DEFAULT '' COMMENT '所属模块',
      action VARCHAR(50) NOT NULL DEFAULT '' COMMENT '操作动作',
      target_type VARCHAR(50) NOT NULL DEFAULT '' COMMENT '操作对象类型',
      target_id INT DEFAULT NULL COMMENT '操作对象ID',
      target_label VARCHAR(255) NOT NULL DEFAULT '' COMMENT '操作对象展示文案',
      before_snapshot LONGTEXT DEFAULT NULL COMMENT '变更前快照JSON',
      after_snapshot LONGTEXT DEFAULT NULL COMMENT '变更后快照JSON',
      remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      INDEX idx_admin_operation_logs_created_at (created_at, id),
      INDEX idx_admin_operation_logs_operator (operator_user_id, id),
      INDEX idx_admin_operation_logs_module (module, id),
      INDEX idx_admin_operation_logs_target (target_type, target_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )
}

async function ensureAdminBusinessSettingsSchema() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS admin_business_settings (
      id TINYINT PRIMARY KEY COMMENT '单例配置ID',
      settings_json LONGTEXT NOT NULL COMMENT '平台业务参数JSON',
      updated_by_user_id INT DEFAULT NULL COMMENT '最后更新管理员ID',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      INDEX idx_admin_business_settings_updated_at (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )
}

async function ensureUserFeedbackSchema() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS user_feedback (
      id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '问题反馈ID',
      user_id INT NOT NULL COMMENT '提交用户ID',
      category_code VARCHAR(50) NOT NULL DEFAULT '' COMMENT '问题分类编码',
      category_label VARCHAR(50) NOT NULL DEFAULT '' COMMENT '问题分类名称',
      description VARCHAR(1000) NOT NULL DEFAULT '' COMMENT '问题描述',
      status ENUM('pending', 'processing', 'resolved', 'rejected') NOT NULL DEFAULT 'pending' COMMENT '处理状态',
      admin_note VARCHAR(500) DEFAULT NULL COMMENT '管理员处理备注',
      handled_by_user_id INT DEFAULT NULL COMMENT '处理管理员ID',
      handled_at DATETIME DEFAULT NULL COMMENT '处理时间',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '提交时间',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (handled_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_user_feedback_user_created (user_id, created_at, id),
      INDEX idx_user_feedback_status_created (status, created_at, id),
      INDEX idx_user_feedback_category_created (category_code, created_at, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )
}

async function ensureListingClickUserSchema() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS listing_click_users (
      id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '记录ID',
      listing_id INT NOT NULL COMMENT '商品ID',
      user_id INT NOT NULL COMMENT '点击用户ID',
      first_clicked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '首次点击时间',
      last_clicked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最近一次点击时间',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE INDEX uk_listing_click_users_listing_user (listing_id, user_id),
      INDEX idx_listing_click_users_last_clicked_listing (last_clicked_at, listing_id),
      INDEX idx_listing_click_users_listing_last_clicked (listing_id, last_clicked_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )
}

async function ensureAdminOnlineSnapshotSchema() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS admin_online_snapshots (
      id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '在线人数快照ID',
      current_online_users INT NOT NULL DEFAULT 0 COMMENT '采样时当前在线用户数',
      snapshot_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '采样时间',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      INDEX idx_admin_online_snapshots_snapshot_at (snapshot_at, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )
}

async function captureOnlinePresenceSnapshot() {
  const currentOnlineUsers = await getCurrentOnlineUserCount()
  await pool.execute(
    `INSERT INTO admin_online_snapshots (
      current_online_users,
      snapshot_at
    ) VALUES (?, NOW())`,
    [currentOnlineUsers]
  )
  return {
    currentOnlineUsers
  }
}

async function ensureUserNotificationSchema() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS user_notifications (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '站内通知ID',
      user_id INT NOT NULL COMMENT '接收通知的用户ID',
      category VARCHAR(50) NOT NULL DEFAULT 'system' COMMENT '通知分类',
      title VARCHAR(120) NOT NULL DEFAULT '' COMMENT '通知标题',
      content VARCHAR(1000) NOT NULL DEFAULT '' COMMENT '通知内容',
      related_type VARCHAR(50) DEFAULT NULL COMMENT '关联对象类型',
      related_id INT DEFAULT NULL COMMENT '关联对象ID',
      is_read TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已读',
      read_at DATETIME DEFAULT NULL COMMENT '已读时间',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_notifications_user_created (user_id, created_at, id),
      INDEX idx_user_notifications_user_read (user_id, is_read, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )
}

async function ensureOrderWorkflowSchema() {
  const databaseName = process.env.DB_NAME || 'game_rental'

  const hasOrderColumn = async (columnName) => {
    const [rows] = await pool.execute(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'orders'
         AND COLUMN_NAME = ?
       LIMIT 1`,
      [databaseName, columnName]
    )
    return rows.length > 0
  }

  const dropOrderColumnIfExists = async (columnName) => {
    if (await hasOrderColumn(columnName)) {
      await pool.execute(`ALTER TABLE orders DROP COLUMN \`${columnName}\``)
    }
  }

  await pool.execute(
    `ALTER TABLE orders
     MODIFY COLUMN status ENUM(
       'pending_payment',
       'awaiting_verification',
       'verified_not_started',
       'using',
       'awaiting_item_report',
       'awaiting_item_confirm',
       'awaiting_buyer_finish',
       'awaiting_seller_finish',
       'awaiting_settlement',
       'cancellation_pending',
       'abnormal_pending',
       'in_progress',
       'after_sale',
       'refund_pending',
       'refunded',
       'paid',
       'support_handling',
       'settlement_pending',
       'completed',
       'cancelled'
     ) NOT NULL DEFAULT 'pending_payment' COMMENT '订单状态'`
  )

  await pool.execute(
    `UPDATE orders
     SET status = CASE
       WHEN status IN ('awaiting_verification', 'verified_not_started', 'using') THEN 'paid'
       WHEN status IN (
         'awaiting_item_report',
         'awaiting_item_confirm',
         'awaiting_buyer_finish',
         'awaiting_seller_finish',
         'awaiting_settlement'
       ) THEN 'settlement_pending'
       WHEN status IN ('cancellation_pending', 'abnormal_pending', 'after_sale') THEN 'support_handling'
       WHEN status IN ('refund_pending', 'refunded') THEN 'cancelled'
       WHEN status = 'in_progress' THEN 'paid'
       ELSE status
     END
     WHERE status IN (
       'awaiting_verification',
       'verified_not_started',
       'using',
       'awaiting_item_report',
       'awaiting_item_confirm',
       'awaiting_buyer_finish',
       'awaiting_seller_finish',
       'awaiting_settlement',
       'cancellation_pending',
       'abnormal_pending',
       'in_progress',
       'after_sale',
       'refund_pending',
       'refunded'
     )`
  )

  await pool.execute(
    `ALTER TABLE orders
     MODIFY COLUMN status ENUM(
       'pending_payment',
       'paid',
       'support_handling',
       'settlement_pending',
       'completed',
       'cancelled'
     ) NOT NULL DEFAULT 'pending_payment' COMMENT '订单状态'`
  )

  const orderColumns = [
    {
      name: 'buyer_contact_wechat',
      sql: `ALTER TABLE orders
            ADD COLUMN buyer_contact_wechat VARCHAR(50) NOT NULL DEFAULT '' COMMENT '买家联系微信号快照' AFTER seller_name`
    },
    {
      name: 'seller_contact_wechat',
      sql: `ALTER TABLE orders
            ADD COLUMN seller_contact_wechat VARCHAR(50) NOT NULL DEFAULT '' COMMENT '卖家联系微信号快照' AFTER buyer_contact_wechat`
    },
    {
      name: 'seller_rent_amount',
      sql: `ALTER TABLE orders
            ADD COLUMN seller_rent_amount BIGINT NOT NULL DEFAULT 0 COMMENT '卖家发布租金快照（分）' AFTER rent_days`
    },
    {
      name: 'settlement_status',
      sql: `ALTER TABLE orders
            ADD COLUMN settlement_status ENUM('none', 'buyer_reported', 'seller_confirmed', 'executed') NOT NULL DEFAULT 'none' COMMENT '结算状态' AFTER status`
    },
    {
      name: 'support_scene',
      sql: `ALTER TABLE orders
            ADD COLUMN support_scene VARCHAR(50) NOT NULL DEFAULT 'none' COMMENT '客服处理场景：none/cancel_request/settlement_dispute/fund_frozen' AFTER settlement_status`
    },
    {
      name: 'support_origin_status',
      sql: `ALTER TABLE orders
            ADD COLUMN support_origin_status VARCHAR(50) DEFAULT NULL COMMENT '客服冻结前原始订单状态' AFTER support_scene`
    },
    {
      name: 'support_freeze_reason',
      sql: `ALTER TABLE orders
            ADD COLUMN support_freeze_reason VARCHAR(500) DEFAULT NULL COMMENT '客服冻结资金原因' AFTER support_origin_status`
    },
    {
      name: 'verified_at',
      sql: `ALTER TABLE orders
            ADD COLUMN verified_at DATETIME DEFAULT NULL COMMENT '验号成功时间' AFTER support_freeze_reason`
    },
    {
      name: 'buyer_item_reported_at',
      sql: `ALTER TABLE orders
            ADD COLUMN buyer_item_reported_at DATETIME DEFAULT NULL COMMENT '买家填报额外物品时间' AFTER verified_at`
    },
    {
      name: 'seller_item_confirmed_at',
      sql: `ALTER TABLE orders
            ADD COLUMN seller_item_confirmed_at DATETIME DEFAULT NULL COMMENT '卖家确认额外物品时间' AFTER buyer_item_reported_at`
    },
    {
      name: 'settlement_executed_at',
      sql: `ALTER TABLE orders
            ADD COLUMN settlement_executed_at DATETIME DEFAULT NULL COMMENT '执行分账时间' AFTER seller_item_confirmed_at`
    },
    {
      name: 'settlement_requested_at',
      sql: `ALTER TABLE orders
            ADD COLUMN settlement_requested_at DATETIME DEFAULT NULL COMMENT '申请进入结算流程时间' AFTER settlement_executed_at`
    },
    {
      name: 'cancel_requested_by',
      sql: `ALTER TABLE orders
            ADD COLUMN cancel_requested_by INT DEFAULT NULL COMMENT '发起取消的用户ID' AFTER settlement_requested_at`
    },
    {
      name: 'cancel_requested_at',
      sql: `ALTER TABLE orders
            ADD COLUMN cancel_requested_at DATETIME DEFAULT NULL COMMENT '发起取消时间' AFTER cancel_requested_by`
    },
    {
      name: 'cancel_reason',
      sql: `ALTER TABLE orders
            ADD COLUMN cancel_reason VARCHAR(500) DEFAULT NULL COMMENT '取消原因' AFTER cancel_requested_at`
    }
  ]

  for (const column of orderColumns) {
    const [rows] = await pool.execute(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'orders'
         AND COLUMN_NAME = ?
       LIMIT 1`,
      [databaseName, column.name]
    )
    if (!rows.length) {
      await pool.execute(column.sql)
    }
  }

  await dropOrderColumnIfExists('buyer_contact_phone')
  await dropOrderColumnIfExists('seller_contact_phone')

  if (await hasOrderColumn('seller_rent_amount')) {
    await pool.execute(
      `UPDATE orders
       SET seller_rent_amount = CASE
         WHEN seller_rent_amount > 0 THEN seller_rent_amount
         WHEN amount > 0 THEN ROUND(amount / 1.1)
         ELSE 0
       END
       WHERE seller_rent_amount = 0`
    )
  }

  const obsoleteColumns = [
    'remark',
    'started_using_at',
    'buyer_finished_confirmed_at',
    'seller_finished_confirmed_at',
    'cancel_response',
    'cancel_responded_at',
    'abnormal_status',
    'abnormal_reason',
    'abnormal_note',
    'abnormal_reported_by',
    'abnormal_reported_at',
    'after_sale_reason',
    'after_sale_reason_code',
    'after_sale_note',
    'after_sale_at'
  ]

  for (const columnName of obsoleteColumns) {
    await dropOrderColumnIfExists(columnName)
  }

  await pool.execute(
    `CREATE TABLE IF NOT EXISTS order_item_snapshots (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '订单物品快照ID',
      order_id INT NOT NULL COMMENT '关联订单ID',
      item_key VARCHAR(40) NOT NULL COMMENT '道具标识',
      item_name VARCHAR(120) NOT NULL COMMENT '道具名称',
      item_mode ENUM('sale', 'gift') NOT NULL DEFAULT 'sale' COMMENT '道具处理方式',
      quantity INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '快照数量',
      unit_price BIGINT NOT NULL DEFAULT 0 COMMENT '快照单价（分）',
      total_price BIGINT NOT NULL DEFAULT 0 COMMENT '快照总价（分）',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      UNIQUE INDEX uk_order_item_snapshot_order_item (order_id, item_key),
      INDEX idx_order_item_snapshots_order_id (order_id, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )

  await pool.execute(
    `CREATE TABLE IF NOT EXISTS order_item_usage_reports (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '订单额外物品使用记录ID',
      order_id INT NOT NULL COMMENT '关联订单ID',
      item_key VARCHAR(40) NOT NULL COMMENT '道具标识',
      snapshot_quantity INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '快照数量',
      reported_quantity INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '买家填报使用数量',
      reported_total_price BIGINT NOT NULL DEFAULT 0 COMMENT '买家填报总价（分）',
      buyer_note VARCHAR(500) DEFAULT NULL COMMENT '买家补充说明',
      buyer_reported_by INT DEFAULT NULL COMMENT '填报人用户ID',
      buyer_reported_at DATETIME DEFAULT NULL COMMENT '填报时间',
      seller_confirmed TINYINT(1) NOT NULL DEFAULT 0 COMMENT '卖家是否确认',
      seller_confirmed_by INT DEFAULT NULL COMMENT '卖家确认人ID',
      seller_confirmed_at DATETIME DEFAULT NULL COMMENT '卖家确认时间',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      UNIQUE INDEX uk_order_item_usage_order_item (order_id, item_key),
      INDEX idx_order_item_usage_order_id (order_id, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )

  await pool.execute(
    `CREATE TABLE IF NOT EXISTS order_settlements (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '订单结算ID',
      order_id INT NOT NULL COMMENT '关联订单ID',
      rent_amount BIGINT NOT NULL DEFAULT 0 COMMENT '租金（分）',
      deposit_amount BIGINT NOT NULL DEFAULT 0 COMMENT '押金（分）',
      used_items_amount BIGINT NOT NULL DEFAULT 0 COMMENT '出售物品使用金额（分）',
      platform_fee_amount BIGINT NOT NULL DEFAULT 0 COMMENT '平台抽成（分）',
      seller_income_amount BIGINT NOT NULL DEFAULT 0 COMMENT '卖家入账金额（分）',
      buyer_refund_amount BIGINT NOT NULL DEFAULT 0 COMMENT '买家退款金额（分）',
      status ENUM('draft', 'executed') NOT NULL DEFAULT 'draft' COMMENT '结算状态',
      executed_by_support_id INT DEFAULT NULL COMMENT '执行分账的客服ID',
      executed_at DATETIME DEFAULT NULL COMMENT '执行时间',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      UNIQUE INDEX uk_order_settlements_order_id (order_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )
}

async function ensureWalletSchema() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS wallet_accounts (
      user_id INT PRIMARY KEY COMMENT '用户ID',
      balance BIGINT NOT NULL DEFAULT 0 COMMENT '钱包余额（分）',
      frozen_balance BIGINT NOT NULL DEFAULT 0 COMMENT '提现冻结金额（分）',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )

  await pool.execute(
    `CREATE TABLE IF NOT EXISTS wallet_ledger (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '钱包流水ID',
      user_id INT NOT NULL COMMENT '用户ID',
      order_id INT DEFAULT NULL COMMENT '关联订单ID',
      business_type VARCHAR(50) NOT NULL DEFAULT 'order' COMMENT '业务类型',
      direction ENUM('credit', 'debit') NOT NULL DEFAULT 'credit' COMMENT '流水方向',
      amount BIGINT NOT NULL DEFAULT 0 COMMENT '变动金额（分）',
      balance_before BIGINT NOT NULL DEFAULT 0 COMMENT '变动前余额（分）',
      balance_after BIGINT NOT NULL DEFAULT 0 COMMENT '变动后余额（分）',
      remark VARCHAR(255) DEFAULT NULL COMMENT '备注',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
      INDEX idx_wallet_ledger_user_created (user_id, created_at, id),
      INDEX idx_wallet_ledger_order_id (order_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )

  const databaseName = process.env.DB_NAME || 'game_rental'
  const [walletColumnRows] = await pool.execute(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'wallet_accounts'
       AND COLUMN_NAME = 'frozen_balance'
     LIMIT 1`,
    [databaseName]
  )
  if (!walletColumnRows.length) {
    await pool.execute(
      `ALTER TABLE wallet_accounts
       ADD COLUMN frozen_balance BIGINT NOT NULL DEFAULT 0 COMMENT '提现冻结金额（分）' AFTER balance`
    )
  }
}

const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function buildRandomInviteCode(length = 8) {
  const size = Math.max(6, Number(length || 8) || 8)
  let result = ''
  for (let index = 0; index < size; index += 1) {
    const randomIndex = Math.floor(Math.random() * INVITE_CODE_ALPHABET.length)
    result += INVITE_CODE_ALPHABET[randomIndex]
  }
  return result
}

async function ensureInviteSchema() {
  const databaseName = process.env.DB_NAME || 'game_rental'
  const userColumns = [
    {
      name: 'invite_code',
      sql: `ALTER TABLE users
            ADD COLUMN invite_code VARCHAR(16) DEFAULT NULL COMMENT '用户专属邀请码（唯一）' AFTER banned_until`
    },
    {
      name: 'inviter_user_id',
      sql: `ALTER TABLE users
            ADD COLUMN inviter_user_id INT DEFAULT NULL COMMENT '邀请人用户ID' AFTER invite_code`
    },
    {
      name: 'bound_invite_code',
      sql: `ALTER TABLE users
            ADD COLUMN bound_invite_code VARCHAR(16) DEFAULT NULL COMMENT '已绑定的邀请码快照（不可修改）' AFTER inviter_user_id`
    },
    {
      name: 'invite_bound_at',
      sql: `ALTER TABLE users
            ADD COLUMN invite_bound_at DATETIME DEFAULT NULL COMMENT '邀请码绑定时间' AFTER bound_invite_code`
    }
  ]

  for (const column of userColumns) {
    const [rows] = await pool.execute(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'users'
         AND COLUMN_NAME = ?
       LIMIT 1`,
      [databaseName, column.name]
    )
    if (!rows.length) {
      await pool.execute(column.sql)
    }
  }

  const [inviteCodeIndexRows] = await pool.execute(
    `SELECT INDEX_NAME
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'users'
       AND INDEX_NAME = 'uk_users_invite_code'
     LIMIT 1`,
    [databaseName]
  )
  if (!inviteCodeIndexRows.length) {
    await pool.execute(`CREATE UNIQUE INDEX uk_users_invite_code ON users (invite_code)`)
  }

  const [inviterIndexRows] = await pool.execute(
    `SELECT INDEX_NAME
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'users'
       AND INDEX_NAME = 'idx_users_inviter_user_id'
     LIMIT 1`,
    [databaseName]
  )
  if (!inviterIndexRows.length) {
    await pool.execute(`CREATE INDEX idx_users_inviter_user_id ON users (inviter_user_id)`)
  }

  await pool.execute(
    `CREATE TABLE IF NOT EXISTS invite_rewards (
      id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '邀请返现记录ID',
      order_id INT NOT NULL COMMENT '关联订单ID',
      inviter_user_id INT NOT NULL COMMENT '邀请人用户ID',
      invitee_user_id INT NOT NULL COMMENT '被邀请人用户ID',
      reward_rate_percent DECIMAL(5,2) NOT NULL DEFAULT 30.00 COMMENT '返现比例',
      platform_fee_amount BIGINT NOT NULL DEFAULT 0 COMMENT '买家服务费（分）',
      reward_amount BIGINT NOT NULL DEFAULT 0 COMMENT '返现金额（分）',
      awarded_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '返现发放时间',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (inviter_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (invitee_user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE INDEX uk_invite_rewards_order_id (order_id),
      INDEX idx_invite_rewards_inviter (inviter_user_id, awarded_at, id),
      INDEX idx_invite_rewards_invitee (invitee_user_id, awarded_at, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )

  const generateUniqueInviteCode = async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = buildRandomInviteCode(attempt >= 10 ? 10 : 8)
      const [rows] = await pool.execute(
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
    throw new Error('生成唯一邀请码失败')
  }

  const [usersWithoutInviteCode] = await pool.execute(
    `SELECT id
     FROM users
     WHERE invite_code IS NULL
        OR invite_code = ''
     ORDER BY id ASC`
  )

  for (const row of usersWithoutInviteCode) {
    const inviteCode = await generateUniqueInviteCode()
    await pool.execute(
      `UPDATE users
       SET invite_code = ?
       WHERE id = ?`,
      [inviteCode, Number(row.id)]
    )
  }
}

async function ensureSmsSecuritySchema() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS sms_send_daily_stats (
      id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '短信日发送统计ID',
      phone VARCHAR(20) NOT NULL COMMENT '手机号',
      scene VARCHAR(30) NOT NULL DEFAULT 'login' COMMENT '发送场景',
      send_date DATE NOT NULL COMMENT '统计日期',
      send_count INT NOT NULL DEFAULT 0 COMMENT '当日发送次数',
      last_sent_at DATETIME DEFAULT NULL COMMENT '最近发送时间',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      UNIQUE KEY uk_sms_send_daily_stats (phone, scene, send_date),
      INDEX idx_sms_send_daily_stats_date (send_date, phone, scene)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS sms_send_ip_daily_stats (
      id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '短信IP日发送统计ID',
      ip_address VARCHAR(64) NOT NULL COMMENT '请求IP',
      send_date DATE NOT NULL COMMENT '统计日期',
      send_count INT NOT NULL DEFAULT 0 COMMENT '当日发送次数',
      last_sent_at DATETIME DEFAULT NULL COMMENT '最近发送时间',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      UNIQUE KEY uk_sms_send_ip_daily_stats (ip_address, send_date),
      INDEX idx_sms_send_ip_daily_stats_date (send_date, ip_address)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )
}

async function ensureUploadQuotaSchema() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS user_upload_daily_stats (
      id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '用户上传日统计ID',
      user_id INT NOT NULL COMMENT '用户ID',
      upload_date DATE NOT NULL COMMENT '统计日期',
      total_bytes BIGINT NOT NULL DEFAULT 0 COMMENT '当日累计上传字节数',
      upload_count INT NOT NULL DEFAULT 0 COMMENT '当日累计上传文件数',
      last_uploaded_at DATETIME DEFAULT NULL COMMENT '最近上传时间',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY uk_user_upload_daily_stats (user_id, upload_date),
      INDEX idx_user_upload_daily_stats_date (upload_date, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )
}


async function ensureKycSchema() {
  const databaseName = process.env.DB_NAME || 'game_rental'
  const userColumns = [
    {
      name: 'kyc_status',
      sql: `ALTER TABLE users
            ADD COLUMN kyc_status ENUM('unverified', 'pending', 'verified', 'failed') NOT NULL DEFAULT 'unverified' COMMENT '实名认证状态' AFTER banned_until`
    },
    {
      name: 'kyc_real_name',
      sql: `ALTER TABLE users
            ADD COLUMN kyc_real_name VARCHAR(50) DEFAULT NULL COMMENT '实名姓名快照' AFTER kyc_status`
    },
    {
      name: 'kyc_real_name_masked',
      sql: `ALTER TABLE users
            ADD COLUMN kyc_real_name_masked VARCHAR(50) DEFAULT NULL COMMENT '脱敏后的实名姓名' AFTER kyc_real_name`
    },
    {
      name: 'kyc_id_card_masked',
      sql: `ALTER TABLE users
            ADD COLUMN kyc_id_card_masked VARCHAR(40) DEFAULT NULL COMMENT '脱敏后的证件号' AFTER kyc_real_name_masked`
    },
    {
      name: 'kyc_verified_at',
      sql: `ALTER TABLE users
            ADD COLUMN kyc_verified_at DATETIME DEFAULT NULL COMMENT '实名认证通过时间' AFTER kyc_id_card_masked`
    }
  ]

  for (const column of userColumns) {
    const [rows] = await pool.execute(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'users'
         AND COLUMN_NAME = ?
       LIMIT 1`,
      [databaseName, column.name]
    )
    if (!rows.length) {
      await pool.execute(column.sql)
    }
  }

  await pool.execute(
    `CREATE TABLE IF NOT EXISTS user_kyc_records (
      id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '实名认证记录ID',
      user_id INT NOT NULL COMMENT '用户ID',
      real_name VARCHAR(50) NOT NULL COMMENT '实名姓名',
      real_name_masked VARCHAR(50) DEFAULT NULL COMMENT '脱敏后的实名姓名',
      id_card_masked VARCHAR(40) NOT NULL COMMENT '脱敏后的证件号',
      id_card_hash CHAR(64) NOT NULL COMMENT '证件号摘要',
      status ENUM('pending', 'verified', 'failed') NOT NULL DEFAULT 'pending' COMMENT '实名状态',
      provider VARCHAR(50) NOT NULL DEFAULT 'disabled' COMMENT '实名服务商',
      provider_request_id VARCHAR(100) DEFAULT NULL COMMENT '服务商请求单号',
      order_no VARCHAR(64) DEFAULT NULL COMMENT '平台侧实名订单号',
      biz_token VARCHAR(128) DEFAULT NULL COMMENT '服务商核身流程标识',
      verify_url VARCHAR(1024) DEFAULT NULL COMMENT '核身跳转地址',
      rule_id VARCHAR(64) DEFAULT NULL COMMENT '核身业务流程ID',
      biz_seq_no VARCHAR(128) DEFAULT NULL COMMENT '服务商业务流水号',
      request_id VARCHAR(128) DEFAULT NULL COMMENT '服务商请求ID',
      similarity DECIMAL(6,2) DEFAULT NULL COMMENT '人脸比对分',
      live_rate DECIMAL(6,2) DEFAULT NULL COMMENT '活体得分',
      completed_at DATETIME DEFAULT NULL COMMENT '实名流程完成时间',
      failure_reason VARCHAR(255) DEFAULT NULL COMMENT '失败原因',
      provider_payload LONGTEXT DEFAULT NULL COMMENT '服务商响应JSON',
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '提交时间',
      verified_at DATETIME DEFAULT NULL COMMENT '通过时间',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY uk_user_kyc_records_provider_request_id (provider_request_id),
      INDEX idx_user_kyc_records_user_id (user_id, id),
      INDEX idx_user_kyc_records_status (status, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )

  const recordColumns = [
    {
      name: 'order_no',
      sql: `ALTER TABLE user_kyc_records
            ADD COLUMN order_no VARCHAR(64) DEFAULT NULL COMMENT '平台侧实名订单号' AFTER provider_request_id`
    },
    {
      name: 'biz_token',
      sql: `ALTER TABLE user_kyc_records
            ADD COLUMN biz_token VARCHAR(128) DEFAULT NULL COMMENT '服务商核身流程标识' AFTER order_no`
    },
    {
      name: 'verify_url',
      sql: `ALTER TABLE user_kyc_records
            ADD COLUMN verify_url VARCHAR(1024) DEFAULT NULL COMMENT '核身跳转地址' AFTER biz_token`
    },
    {
      name: 'rule_id',
      sql: `ALTER TABLE user_kyc_records
            ADD COLUMN rule_id VARCHAR(64) DEFAULT NULL COMMENT '核身业务流程ID' AFTER verify_url`
    },
    {
      name: 'biz_seq_no',
      sql: `ALTER TABLE user_kyc_records
            ADD COLUMN biz_seq_no VARCHAR(128) DEFAULT NULL COMMENT '服务商业务流水号' AFTER rule_id`
    },
    {
      name: 'request_id',
      sql: `ALTER TABLE user_kyc_records
            ADD COLUMN request_id VARCHAR(128) DEFAULT NULL COMMENT '服务商请求ID' AFTER biz_seq_no`
    },
    {
      name: 'similarity',
      sql: `ALTER TABLE user_kyc_records
            ADD COLUMN similarity DECIMAL(6,2) DEFAULT NULL COMMENT '人脸比对分' AFTER request_id`
    },
    {
      name: 'live_rate',
      sql: `ALTER TABLE user_kyc_records
            ADD COLUMN live_rate DECIMAL(6,2) DEFAULT NULL COMMENT '活体得分' AFTER similarity`
    },
    {
      name: 'completed_at',
      sql: `ALTER TABLE user_kyc_records
            ADD COLUMN completed_at DATETIME DEFAULT NULL COMMENT '实名流程完成时间' AFTER live_rate`
    }
  ]

  for (const column of recordColumns) {
    const [rows] = await pool.execute(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'user_kyc_records'
         AND COLUMN_NAME = ?
       LIMIT 1`,
      [databaseName, column.name]
    )
    if (!rows.length) {
      await pool.execute(column.sql)
    }
  }
}

async function ensurePaymentChannelSchema() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS payment_transactions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '支付流水ID',
      transaction_no VARCHAR(40) NOT NULL COMMENT '平台支付流水号',
      user_id INT NOT NULL COMMENT '付款用户ID',
      order_id INT DEFAULT NULL COMMENT '关联订单ID',
      business_type VARCHAR(50) NOT NULL DEFAULT 'order_payment' COMMENT '业务类型',
      channel VARCHAR(30) NOT NULL DEFAULT 'alipay' COMMENT '支付渠道',
      provider VARCHAR(50) NOT NULL DEFAULT 'mock_payment' COMMENT '渠道服务商',
      subject VARCHAR(255) DEFAULT NULL COMMENT '支付标题',
      amount BIGINT NOT NULL DEFAULT 0 COMMENT '支付金额（分）',
      status ENUM('created', 'pending', 'paid', 'failed', 'cancelled', 'closed') NOT NULL DEFAULT 'created' COMMENT '支付状态',
      business_sync_status ENUM('pending', 'synced', 'failed') NOT NULL DEFAULT 'pending' COMMENT '业务同步状态',
      business_sync_message VARCHAR(255) DEFAULT NULL COMMENT '业务同步说明',
      provider_trade_no VARCHAR(100) DEFAULT NULL COMMENT '服务商交易号',
      provider_payload LONGTEXT DEFAULT NULL COMMENT '服务商响应JSON',
      paid_at DATETIME DEFAULT NULL COMMENT '支付成功时间',
      expires_at DATETIME DEFAULT NULL COMMENT '支付过期时间',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
      UNIQUE KEY uk_payment_transactions_no (transaction_no),
      INDEX idx_payment_transactions_order_id (order_id, id),
      INDEX idx_payment_transactions_user_id (user_id, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )

  await pool.execute(
    `CREATE TABLE IF NOT EXISTS wallet_withdraw_requests (
      id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '提现申请ID',
      request_no VARCHAR(40) NOT NULL COMMENT '平台提现单号',
      user_id INT NOT NULL COMMENT '提现用户ID',
      channel VARCHAR(30) NOT NULL DEFAULT 'alipay' COMMENT '提现渠道',
      provider VARCHAR(50) NOT NULL DEFAULT 'pending' COMMENT '代付服务商',
      amount BIGINT NOT NULL DEFAULT 0 COMMENT '申请提现金额（分）',
      fee_amount BIGINT NOT NULL DEFAULT 0 COMMENT '手续费（分）',
      net_amount BIGINT NOT NULL DEFAULT 0 COMMENT '到账金额（分）',
      status ENUM('pending_review', 'processing', 'success', 'failed', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending_review' COMMENT '提现状态',
      account_name VARCHAR(80) NOT NULL DEFAULT '' COMMENT '收款账户姓名',
      account_no_masked VARCHAR(120) NOT NULL DEFAULT '' COMMENT '脱敏后的收款账号',
      account_snapshot_json LONGTEXT DEFAULT NULL COMMENT '收款账户快照JSON，后续可替换为加密密文',
      provider_request_id VARCHAR(100) DEFAULT NULL COMMENT '服务商打款单号',
      provider_payload LONGTEXT DEFAULT NULL COMMENT '服务商响应JSON',
      remark VARCHAR(255) DEFAULT NULL COMMENT '备注',
      failure_reason VARCHAR(255) DEFAULT NULL COMMENT '失败原因',
      reviewed_by_user_id INT DEFAULT NULL COMMENT '审核管理员ID',
      reviewed_at DATETIME DEFAULT NULL COMMENT '审核时间',
      paid_at DATETIME DEFAULT NULL COMMENT '打款完成时间',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY uk_wallet_withdraw_requests_no (request_no),
      INDEX idx_wallet_withdraw_requests_user_id (user_id, id),
      INDEX idx_wallet_withdraw_requests_status (status, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )
}

async function refreshUploadSortOrderFlags() {
  const databaseName = process.env.DB_NAME || 'game_rental'

  const [listingImageSortOrderRows] = await pool.execute(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'listing_images'
       AND COLUMN_NAME = 'sort_order'
     LIMIT 1`,
    [databaseName]
  )
  HAS_LISTING_IMAGE_SORT_ORDER = listingImageSortOrderRows.length > 0

  const [banImageSortOrderRows] = await pool.execute(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'listing_ban_images'
       AND COLUMN_NAME = 'sort_order'
     LIMIT 1`,
    [databaseName]
  )
  HAS_BAN_IMAGE_SORT_ORDER = banImageSortOrderRows.length > 0
}

function toUnsignedInteger(value, fallback = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return Math.round(parsed)
}

function toDecimalValue(value, digits = 1, fallback = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return Number(parsed.toFixed(digits))
}

function toNullableInteger(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed)
}

const { computeListingDerivedValues, resolveRentDaysRecommendation } = createListingService({
  baseRatioConfig: BASE_RATIO_CONFIG,
  specialKnives: SPECIAL_KNIVES,
  toUnsignedInteger
})

async function expirePendingPaymentOrders() {
  const readConn = await pool.getConnection()
  let pendingPaymentTimeoutMinutes = 10
  let expiredRows = []
  try {
    const businessSettings = await loadBusinessSettings(readConn)
    pendingPaymentTimeoutMinutes = getPendingPaymentTimeoutMinutes(businessSettings)
    const [rows] = await readConn.execute(
      `SELECT id, listing_id
       FROM orders
       WHERE status = 'pending_payment'
         AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
      [pendingPaymentTimeoutMinutes]
    )
    expiredRows = rows
  } finally {
    readConn.release()
  }

  if (!expiredRows.length) {
    return {
      expiredOrderCount: 0,
      restoredListingCount: 0,
      closedTransactionCount: 0,
      syncedPaidTransactionCount: 0,
      skippedOrderCount: 0
    }
  }

  const expiredOrderIds = expiredRows
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id) && id > 0)
  const transactionsByOrderId = new Map()

  if (expiredOrderIds.length) {
    const placeholders = expiredOrderIds.map(() => '?').join(', ')
    const [transactionRows] = await pool.execute(
      `SELECT
          id,
          transaction_no,
          user_id,
          order_id,
          business_type,
          channel,
          provider,
          status,
          provider_trade_no,
          provider_payload,
          paid_at,
          expires_at,
          created_at,
          updated_at
       FROM payment_transactions
       WHERE order_id IN (${placeholders})
         AND status IN ('created', 'pending')
       ORDER BY order_id ASC, id DESC`,
      expiredOrderIds
    )

    for (const row of transactionRows) {
      const orderId = Number(row.order_id || 0)
      if (!transactionsByOrderId.has(orderId)) {
        transactionsByOrderId.set(orderId, [])
      }
      transactionsByOrderId.get(orderId).push(row)
    }
  }

  const orderIdsToCancel = []
  const skippedOrderIds = []
  let closedTransactionCount = 0
  let syncedPaidTransactionCount = 0

  for (const orderRow of expiredRows) {
    const orderId = Number(orderRow.id || 0)
    const activeTransactions = transactionsByOrderId.get(orderId) || []
    let shouldCancelOrder = true

    for (const transaction of activeTransactions) {
      const transactionNo = String(transaction.transaction_no || '').trim()
      if (!transactionNo) continue

      const queryResult = typeof paymentProvider?.queryPaymentOrder === 'function'
        ? await paymentProvider.queryPaymentOrder({
            transactionNo,
            channel: transaction.channel,
            provider: transaction.provider
          })
        : null

      if (!queryResult?.ok) {
        const providerUnsupported = String(queryResult?.reason || '').trim() === 'provider_not_implemented'
        if (providerUnsupported) {
          await paymentService.handlePaymentCallback({
            channel: transaction.channel,
            transactionNo,
            providerTradeNo: transaction.provider_trade_no,
            status: 'cancelled',
            rawPayload: {
              autoExpiredLocally: true,
              reason: 'provider_query_not_implemented',
              timeoutMinutes: pendingPaymentTimeoutMinutes,
              provider: transaction.provider,
              originalExpiresAt: transaction.expires_at || null
            }
          })
          continue
        }
        shouldCancelOrder = false
        break
      }

      const remoteStatus = String(queryResult.status || '').trim().toLowerCase()
      if (remoteStatus === 'paid') {
        await paymentService.handlePaymentCallback({
          channel: transaction.channel,
          transactionNo,
          providerTradeNo: queryResult.providerTradeNo,
          status: queryResult.status,
          rawPayload: queryResult.rawResponse || queryResult
        })
        syncedPaidTransactionCount += 1
        shouldCancelOrder = false
        break
      }

      if (['cancelled', 'failed'].includes(remoteStatus)) {
        await paymentService.handlePaymentCallback({
          channel: transaction.channel,
          transactionNo,
          providerTradeNo: queryResult.providerTradeNo,
          status: queryResult.status,
          rawPayload: queryResult.rawResponse || queryResult
        })
        continue
      }

      const closeResult = typeof paymentProvider?.closePaymentOrder === 'function'
        ? await paymentProvider.closePaymentOrder({
            transactionNo,
            channel: transaction.channel,
            provider: transaction.provider
          })
        : null

      if (!closeResult?.ok) {
        shouldCancelOrder = false
        break
      }

      await paymentService.handlePaymentCallback({
        channel: transaction.channel,
        transactionNo,
        providerTradeNo: closeResult.providerTradeNo || queryResult.providerTradeNo,
        status: closeResult.status || 'cancelled',
        rawPayload: closeResult.rawResponse || closeResult
      })
      closedTransactionCount += 1
    }

    if (shouldCancelOrder) {
      orderIdsToCancel.push(orderId)
    } else {
      skippedOrderIds.push(orderId)
    }
  }

  if (!orderIdsToCancel.length) {
    return {
      expiredOrderCount: 0,
      restoredListingCount: 0,
      closedTransactionCount,
      syncedPaidTransactionCount,
      skippedOrderCount: skippedOrderIds.length
    }
  }

  const cancelledOrderSet = new Set(orderIdsToCancel)
  const expiredListingIds = [...new Set(
    expiredRows
      .filter((row) => cancelledOrderSet.has(Number(row.id || 0)))
      .map((row) => Number(row.listing_id))
      .filter((id) => Number.isFinite(id) && id > 0)
  )]

  const writeConn = await pool.getConnection()
  try {
    await writeConn.beginTransaction()
    const orderPlaceholders = orderIdsToCancel.map(() => '?').join(', ')
    await writeConn.execute(
      `UPDATE orders
       SET status = 'cancelled', cancelled_at = NOW()
       WHERE id IN (${orderPlaceholders})
         AND status = 'pending_payment'`,
      orderIdsToCancel
    )

    let restoredListingCount = 0
    if (expiredListingIds.length) {
      const listingPlaceholders = expiredListingIds.map(() => '?').join(', ')
      const [listingResult] = await writeConn.execute(
        `UPDATE listings
         SET listing_status = 'active'
         WHERE id IN (${listingPlaceholders})
           AND listing_status = 'rented'`,
        expiredListingIds
      )
      restoredListingCount = Number(listingResult?.affectedRows || 0)
    }

    await writeConn.commit()
    await invalidateListingCachesSafely(expiredListingIds)
    return {
      expiredOrderCount: orderIdsToCancel.length,
      restoredListingCount,
      closedTransactionCount,
      syncedPaidTransactionCount,
      skippedOrderCount: skippedOrderIds.length
    }
  } catch (error) {
    await writeConn.rollback()
    throw error
  } finally {
    writeConn.release()
  }
}

// ==================== 路由定义 ====================

registerAuthRoutes({
  app,
  pool,
  authLimiter,
  authRequired,
  authenticatedReadLimiter,
  issueAuthSession,
  setAuthCookie: authModule.setAuthCookie,
  revokeAllLoginSessionsByUserId: authModule.revokeAllLoginSessionsByUserId,
  logoutCurrentSession,
  isUserCurrentlyBanned: authModule.isUserCurrentlyBanned,
  buildBannedUserMessage: authModule.buildBannedUserMessage,
  captchaProvider,
  smsCodeService,
  smsProvider,
  loadBusinessSettings
})

registerAdminRoutes({
  app,
  pool,
  authModule,
  getCurrentOnlineUserCount,
  createUserNotificationSafely,
  ADMIN_STEP_UP_POLICIES,
  ADMIN_PASSKEY_ENABLED,
  ADMIN_PASSKEY_RP_NAME,
  ADMIN_PASSKEY_REGISTRATION_TTL_MS,
  ADMIN_STEP_UP_CHALLENGE_TTL_MS,
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  buildListingDetailPayload,
  fetchListingBanImages,
  getListingImagesOrderSql,
  invalidateListingDetailCache: invalidateListingCacheSafely,
  smsCodeService,
  smsProvider,
  loadBusinessSettings
})


registerListingRoutes({
  app,
  pool,
  authRequired,
  publicReadLimiter,
  authenticatedWriteLimiter,
  publishLimiter,
  validateRequiredPayload,
  validateListingPayload: validateListingPayloadWithDefaults,
  yuanToCent,
  MIN_LISTING_DEPOSIT_YUAN,
  MAX_LISTING_DEPOSIT_YUAN,
  SALE_ITEM_CONFIG,
  toNullableInteger,
  normalizeInsuranceLevel,
  normalizeListingItemMode,
  centToRoundedYuan,
  computeListingDerivedValues,
  resolveRentDaysRecommendation,
  toUnsignedInteger,
  toDecimalValue,
  toBanRecordFlag,
  buildTrustedListingItems,
  saveListingImages,
  saveListingBanMedia,
  generateListingNo,
  buildBuyerRentPriceSql,
  getListingImagesOrderSql,
  normalizeListingMoneyFields,
  fetchListingBanImages,
  buildListingDetailPayload,
  getListingDetailCache,
  setListingDetailCache,
  invalidateListingDetailCache: invalidateListingCacheSafely
})

registerMyListingsRoutes({
  app,
  pool,
  authRequired,
  authenticatedReadLimiter,
  authenticatedWriteLimiter,
  buildMyListingStatsPayload,
  normalizeMyListingFields,
  getListingImagesOrderSql,
  fetchListingBanImages,
  buildListingDetailPayload,
  validateRequiredPayload,
  validateListingPayload: validateListingPayloadWithDefaults,
  yuanToCent,
  MIN_LISTING_DEPOSIT_YUAN,
  MAX_LISTING_DEPOSIT_YUAN,
  SALE_ITEM_CONFIG,
  toNullableInteger,
  normalizeInsuranceLevel,
  normalizeListingItemMode,
  centToRoundedYuan,
  getObsoleteListingImageUrls,
  getObsoleteBanMediaUrls,
  computeListingDerivedValues,
  resolveRentDaysRecommendation,
  toUnsignedInteger,
  toDecimalValue,
  toBanRecordFlag,
  buildTrustedListingItems,
  saveListingImages,
  saveListingBanMedia,
  cleanupOrphanUploadedFiles,
  listingStatusToLabel,
  invalidateListingDetailCache: invalidateListingCacheSafely
})

registerFeedbackRoutes({
  app,
  pool,
  authRequired,
  adminOnly,
  authenticatedReadLimiter,
  authenticatedWriteLimiter
})

registerOrdersRoutes({
  app,
  pool,
  authRequired,
  supportOnly,
  requireStepUpAuth,
  ADMIN_STEP_UP_POLICIES,
  authenticatedReadLimiter,
  orderWriteLimiter,
  orderLifecycleService,
  orderQueryService,
  buildOrderStatsPayload,
  normalizeOrderMoneyFields,
  BUYER_AGREEMENT_VERSION,
  PAYMENT_AGREEMENT_VERSION,
})
registerPaymentRoutes({
  app,
  pool,
  authRequired,
  adminOnly,
  requireStepUpAuth,
  ADMIN_STEP_UP_POLICIES,
  authenticatedReadLimiter,
  authenticatedWriteLimiter,
  orderWriteLimiter,
  normalizeOrderMoneyFields,
  paymentProvider,
  paymentService,
  yuanToCent,
  createUserNotificationSafely
})
registerConversationRoutes({
  app,
  authRequired,
  conversationApiLimiter,
  chatModule,
  io
})

registerSupportRoutes({
  app,
  pool,
  authRequired,
  supportOnly,
  requireStepUpAuth,
  ADMIN_STEP_UP_POLICIES,
  authenticatedReadLimiter,
  orderWriteLimiter,
  normalizeOrderMoneyFields,
  chatModule,
  orderLifecycleService
})


registerNotificationRoutes({
  app,
  authRequired,
  authenticatedReadLimiter,
  authenticatedWriteLimiter,
  getUserNotificationList,
  getUnreadNotificationSummary,
  markUserNotificationAsRead
})


registerChatSocket({
  io,
  authModule,
  chatModule,
  validateAuthSession,
  touchUserPresence,
  markUserDisconnected,
  chatOnlineTtlSeconds: CHAT_ONLINE_TTL_SECONDS
})

export function createApp() {
  return {
    app,
    httpServer,
    port,
    ensureUserRoleSchema,
    ensureAdminPasskeySchema,
    ensureAdminTrustedDeviceSchema,
    ensureListingNumberSchema,
    ensureBanMediaSchema,
    ensureListingItemModeSchema,
    ensureListingDecontaminationChamberLevelSchema,
    ensureListingReviewSchema,
    ensureAdminOperationLogSchema,
    ensureAdminBusinessSettingsSchema,
    ensureUserFeedbackSchema,
    ensureListingClickUserSchema,
    ensureAdminOnlineSnapshotSchema,
    ensureAdminOnlineSnapshotSchema,
    ensureUserNotificationSchema,
    ensureConversationSchema,
    ensureOrderSupportSchema,
    ensurePresaleSupportSchema,
    ensureOrderWorkflowSchema,
    ensureSupportEventSchema,
    ensureWalletSchema,
    ensureInviteSchema,
    ensureSmsSecuritySchema,
    ensureUploadQuotaSchema,
    ensureKycSchema,
    ensurePaymentChannelSchema,
    refreshUploadSortOrderFlags,
    expirePendingPaymentOrders,
    captureOnlinePresenceSnapshot
  }
}
