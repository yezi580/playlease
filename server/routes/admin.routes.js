/**
 * 管理端 HTTP 路由，处理审核、通行密钥和运营操作。
 */

import { getSmsSecurityThresholds } from '../modules/business-settings/runtime.js'

export function registerAdminRoutes(deps) {
  const {
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
    invalidateListingDetailCache,
    smsCodeService,
    smsProvider,
    loadBusinessSettings
  } = deps
  const {
    authRequired,
    adminOnly,
    requireStepUpAuth,
    fetchAuthUserById,
    listAdminPasskeysByUserId,
    revokeAdminPasskey,
    getAdminPasskeyRpId,
    issueAdminPasskeyRegistrationChallenge,
    getAdminPasskeyRegistrationChallenge,
    buildAdminStepUpSessionFingerprint,
    getExpectedAdminPasskeyOrigins,
    findAdminPasskeyByCredentialId,
    upsertAdminPasskeyCredential,
    encodeBufferToBase64Url,
    markAdminPasskeyRegistrationChallengeConsumed,
    listTrustedDevicesByUserId,
    getTrustedDeviceTokenFromRequest,
    getTrustedDeviceRecordByToken,
    refreshTrustedDeviceRecord,
    setTrustedDeviceCookie,
    issueTrustedDeviceForCurrentSession,
    refreshAdminStepUpSession,
    clearAuthCookie,
    revokeTrustedDeviceById,
    clearTrustedDeviceCookie,
    revokeAllTrustedDevicesByUserId,
    revokeAllLoginSessionsByUserId,
    getAdminStepUpPolicyByAction,
    issueAdminStepUpChallenge,
    getAdminStepUpChallenge,
    normalizeCredentialIdFromRequest,
    buildStoredWebAuthnCredential,
    markAdminStepUpChallengeConsumed,
    updateAdminPasskeyUsage
  } = authModule
  const PASSKEY_SELF_SERVICE_ROLES = new Set(['admin'])
  const ADMIN_PASSKEY_REGISTER_SMS_SCENE = 'admin_passkey_register'

  function resolvePolicyAllowedRoles(policy = {}) {
    const roles = Array.isArray(policy.allowedRoles) && policy.allowedRoles.length
      ? policy.allowedRoles.map((item) => String(item || '').trim()).filter(Boolean)
      : ['admin']
    return new Set(roles)
  }

  function canCurrentRoleUsePolicy(policy, role) {
    return resolvePolicyAllowedRoles(policy).has(String(role || '').trim())
  }

function sanitizeAdminKeyword(value) {
  return String(value || '').trim().slice(0, 50)
}

function sanitizeAdminDate(value) {
  const normalizedValue = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizedValue) ? normalizedValue : ''
}

function getNextAdminDate(dateText) {
  const safeDateText = sanitizeAdminDate(dateText)
  if (!safeDateText) return ''
  const [year, month, day] = safeDateText.split('-').map((item) => Number(item))
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1))
  return `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2, '0')}-${String(nextDate.getUTCDate()).padStart(2, '0')}`
}

function getPreviousAdminDate(dateText) {
  const safeDateText = sanitizeAdminDate(dateText)
  if (!safeDateText) return ''
  const [year, month, day] = safeDateText.split('-').map((item) => Number(item))
  const previousDate = new Date(Date.UTC(year, month - 1, day - 1))
  return `${previousDate.getUTCFullYear()}-${String(previousDate.getUTCMonth() + 1).padStart(2, '0')}-${String(previousDate.getUTCDate()).padStart(2, '0')}`
}

function sanitizeAdminMonth(value) {
  const normalizedValue = String(value || '').trim()
  return /^\d{4}-\d{2}$/.test(normalizedValue) ? normalizedValue : ''
}

function getNextAdminMonth(monthText) {
  const safeMonthText = sanitizeAdminMonth(monthText)
  if (!safeMonthText) return ''
  const [year, month] = safeMonthText.split('-').map((item) => Number(item))
  const nextMonth = new Date(Date.UTC(year, month, 1))
  return `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, '0')}`
}

function sanitizeAdminYear(value) {
  const normalizedValue = String(value || '').trim()
  return /^\d{4}$/.test(normalizedValue) ? normalizedValue : ''
}

function sanitizeAdminSelectValue(value, allowedValues, fallback = '') {
  const normalizedValue = String(value || '').trim()
  return allowedValues.includes(normalizedValue) ? normalizedValue : fallback
}

function resolveAdminTimeRange(query = {}) {
  const granularity = sanitizeAdminSelectValue(query?.granularity, ['day', 'month', 'year', 'custom'], 'day')
  let normalizedValue = ''
  let rangeStart = ''
  let rangeEnd = ''
  let startDate = ''
  let endDate = ''

  if (granularity === 'month') {
    normalizedValue = sanitizeAdminMonth(query?.value)
    const nextMonth = getNextAdminMonth(normalizedValue)
    if (normalizedValue && nextMonth) {
      startDate = `${normalizedValue}-01`
      rangeStart = `${startDate} 00:00:00`
      rangeEnd = `${nextMonth}-01 00:00:00`
      endDate = getPreviousAdminDate(`${nextMonth}-01`)
    }
  } else if (granularity === 'year') {
    normalizedValue = sanitizeAdminYear(query?.value)
    if (normalizedValue) {
      startDate = `${normalizedValue}-01-01`
      endDate = `${normalizedValue}-12-31`
      rangeStart = `${startDate} 00:00:00`
      rangeEnd = `${Number(normalizedValue) + 1}-01-01 00:00:00`
    }
  } else if (granularity === 'custom') {
    startDate = sanitizeAdminDate(query?.startDate)
    endDate = sanitizeAdminDate(query?.endDate)
    const nextDate = getNextAdminDate(endDate)
    if (startDate && endDate && nextDate && startDate <= endDate) {
      rangeStart = `${startDate} 00:00:00`
      rangeEnd = `${nextDate} 00:00:00`
    }
  } else {
    normalizedValue = sanitizeAdminDate(query?.value)
    const nextDate = getNextAdminDate(normalizedValue)
    if (normalizedValue && nextDate) {
      startDate = normalizedValue
      endDate = normalizedValue
      rangeStart = `${normalizedValue} 00:00:00`
      rangeEnd = `${nextDate} 00:00:00`
    }
  }

  return {
    granularity,
    value: normalizedValue,
    startDate,
    endDate,
    rangeStart,
    rangeEnd,
    valid: Boolean(rangeStart && rangeEnd)
  }
}

function getAdminTrendBucketSql(granularity, columnSql) {
  if (granularity === 'day') {
    return `DATE_FORMAT(${columnSql}, '%H:00')`
  }
  if (granularity === 'year') {
    return `DATE_FORMAT(${columnSql}, '%Y-%m')`
  }
  return `DATE_FORMAT(${columnSql}, '%Y-%m-%d')`
}

function sanitizeAdminRemark(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength)
}

function isValidAdminSmsCode(value = '') {
  return /^\d{4,8}$/.test(String(value || '').trim())
}

function isValidAdminSmsPhone(value = '') {
  return /^1[3-9]\d{9}$/.test(String(value || '').trim())
}

function maskAdminPhone(phone = '') {
  const normalizedPhone = String(phone || '').trim()
  if (!isValidAdminSmsPhone(normalizedPhone)) {
    return ''
  }
  return normalizedPhone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
}

function buildDefaultAdminSmsSecurityThresholds() {
  const runtimeConfig = typeof smsCodeService?.getRuntimeConfig === 'function'
    ? smsCodeService.getRuntimeConfig()
    : {}
  return {
    smsCodeTtlSeconds: Math.max(60, Number(runtimeConfig?.ttlSeconds || 300) || 300),
    smsSendIntervalSeconds: Math.max(30, Number(runtimeConfig?.sendIntervalSeconds || 60) || 60),
    smsVerifyMaxAttempts: Math.max(3, Number(runtimeConfig?.verifyMaxAttempts || 5) || 5),
    smsVerifyLockSeconds: Math.max(300, Number(runtimeConfig?.verifyLockSeconds || 900) || 900)
  }
}

async function loadAdminSmsSecurityThresholds() {
  const defaultThresholds = buildDefaultAdminSmsSecurityThresholds()
  if (typeof loadBusinessSettings !== 'function') {
    return defaultThresholds
  }

  try {
    const businessSettings = await loadBusinessSettings(pool)
    if (!businessSettings) {
      return defaultThresholds
    }
    return {
      ...defaultThresholds,
      ...getSmsSecurityThresholds(businessSettings)
    }
  } catch (_error) {
    return defaultThresholds
  }
}

function buildAdminSmsVerifyErrorResponse(result, thresholds = buildDefaultAdminSmsSecurityThresholds()) {
  if (result?.reason === 'verify_locked') {
    return {
      status: 429,
      body: {
        message: '验证码错误次数过多，请稍后重新获取验证码',
        retry_after_seconds: Number(result.retryAfterSeconds || thresholds.smsVerifyLockSeconds || 900),
        max_attempts: Number(result.maxAttempts || thresholds.smsVerifyMaxAttempts || 5),
        remaining_attempts: 0
      }
    }
  }

  if (result?.reason === 'code_not_match') {
    return {
      status: 400,
      body: {
        message: '验证码错误',
        max_attempts: Number(result.maxAttempts || thresholds.smsVerifyMaxAttempts || 5),
        remaining_attempts: Math.max(0, Number(result.remainingAttempts || 0) || 0)
      }
    }
  }

  if (result?.reason === 'invalid_payload') {
    return {
      status: 400,
      body: { message: '请输入正确的短信验证码' }
    }
  }

  return {
    status: 400,
    body: { message: '验证码错误或已过期' }
  }
}

function safeJsonStringify(value) {
  if (value === undefined) return null
  try {
    return JSON.stringify(value)
  } catch (_error) {
    return JSON.stringify({ message: 'snapshot_serialize_failed' })
  }
}

const DEFAULT_ADMIN_BUSINESS_SETTINGS = Object.freeze({
  ratioRecommendation: {
    specialKnives: ['赤枭', '怜悯'],
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
  },
  listingAppearanceOptions: {
    operatorAppearances: [
      '红狼-蚀金玫瑰',
      '威龙-凌霄戍卫',
      '骇爪-水墨云图',
      '骇爪-维什戴尔',
      '露娜-黑·天际线',
      '佐娅-能天使',
      '威龙-吴彦祖联动',
      '威龙-蛟龙特战队'
    ],
    knifeSkins: ['赤枭', '怜悯', '影锋', '黑海', '北极星', '信条', '龙牙', '暗星', '坠星者', '挽歌'],
    weaponSkins: [
      'M4A1-棱镜攻势',
      '维克托-美杜莎',
      'SCAR-H-电玩高手',
      'K416-王牌命运',
      'QBZ95-王牌命运',
      '腾龙-气象感应',
      'AUG-气象感应',
      'M7-棱镜攻势S2',
      'AS Val-悬赏令',
      'MP7-电玩高手S2',
      'M250-电玩高手S2',
      'KC17-造物纪元',
      'AKM-群星'
    ]
  },
  listingRecommendations: {
    depositMinYuan: 100,
    depositMaxYuan: 2000,
    recommendDepositRatioPercent: 100,
    itemsDepositCoveragePercent: 100
  },
  platformCommission: {
    buyerServiceFeeRatePercent: 10,
    sellerServiceFeeRatePercent: 10
  },
  inviteReward: {
    buyerServiceFeeRewardRatePercent: 30
  },
  discoveryThresholds: {
    smallAmountHafuCoinMax: 150,
    highRatioBaseRatioMin: 43,
    homepageNewTagHours: 72,
    pendingPaymentTimeoutMinutes: 10
  },
  saleItems: [
    { key: 'topCard', itemName: '顶级保险卡', unitPriceInCent: 200, enabled: true },
    { key: 'awmBullet', itemName: 'AWM子弹（发）', unitPriceInCent: 60, enabled: true },
    { key: 'barrettBullet', itemName: '巴雷特子弹（发）', remark: '指穿甲弹，别的不值钱', unitPriceInCent: 30, enabled: true },
    { key: 'bullet762x54R', itemName: '6级7.62×54R（组）', unitPriceInCent: 600, enabled: true },
    { key: 'bullet762x51', itemName: '6级7.62×51（组）', unitPriceInCent: 600, enabled: true },
    { key: 'bullet68x51', itemName: '6级6.8×51（组）', unitPriceInCent: 600, enabled: true },
    { key: 'helmetLv6', itemName: '6级头盔', unitPriceInCent: 200, enabled: true },
    { key: 'armorLv6', itemName: '6级护甲', unitPriceInCent: 200, enabled: true },
    { key: 'coffeeBean', itemName: '高级咖啡豆', unitPriceInCent: 300, enabled: true },
    { key: 'bulletPart', itemName: '高级子弹零件', unitPriceInCent: 300, enabled: true }
  ],
  compensationPlans: [
    {
      value: 'premium',
      title: '高级',
      shortLabel: '高级：全额赔付',
      feeRatePercent: 9,
      payoutRatePercent: 100,
      description: '平台按账号市场价全额赔付，适合高价值账号。'
    },
    {
      value: 'medium',
      title: '中级',
      shortLabel: '中级：65%赔付',
      feeRatePercent: 5,
      payoutRatePercent: 65,
      description: '平台按账号市场价 65% 赔付，兼顾成本与保障。'
    },
    {
      value: 'basic',
      title: '初级',
      shortLabel: '初级：押金赔付（默认）',
      feeRatePercent: 0,
      payoutRatePercent: 0,
      description: '默认仅按押金承担基础赔付责任。'
    }
  ],
  operationalThresholds: {
    listingImageLimit: 10
  },
  securityThresholds: {
    feedbackDailyLimitPerUser: 1,
    listingHotMinUniqueClickCount: 5,
    smsDailyLimitPerPhone: 10,
    smsDailyLimitPerIp: 20,
    smsCodeTtlSeconds: 300,
    smsSendIntervalSeconds: 60,
    smsVerifyMaxAttempts: 5,
    smsVerifyLockSeconds: 900
  }
})

function cloneAdminBusinessSettingsDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_ADMIN_BUSINESS_SETTINGS))
}

function sanitizeAdminShortText(value, maxLength = 100) {
  return String(value || '').trim().slice(0, maxLength)
}

function normalizeAdminNumber(value, fallback, options = {}) {
  const minimum = Number.isFinite(options.min) ? options.min : Number.NEGATIVE_INFINITY
  const maximum = Number.isFinite(options.max) ? options.max : Number.POSITIVE_INFINITY
  const precision = Number.isInteger(options.precision) && options.precision >= 0 ? options.precision : null
  const parsedValue = Number(value)
  if (!Number.isFinite(parsedValue)) return fallback
  const normalizedValue = Math.min(maximum, Math.max(minimum, parsedValue))
  if (precision === null) return normalizedValue
  const factor = 10 ** precision
  return Math.round(normalizedValue * factor) / factor
}

function normalizeAdminInteger(value, fallback, options = {}) {
  return Math.round(normalizeAdminNumber(value, fallback, options))
}

function normalizeAdminStringList(value, fallback = []) {
  if (!Array.isArray(value)) return [...fallback]
  const list = value
    .map((item) => sanitizeAdminShortText(item, 40))
    .filter(Boolean)
  return list.length ? Array.from(new Set(list)) : [...fallback]
}

function getLegacyBulletLv6Item(saleItems = []) {
  if (!Array.isArray(saleItems)) return null
  return saleItems.find((item) => String(item?.key || '') === 'bulletLv6') || null
}

function normalizeAdminSaleItemDisplayName(itemKey, itemName, fallbackName) {
  const normalizedName = sanitizeAdminShortText(itemName, 40) || fallbackName
  return normalizedName
}

function normalizeAdminBusinessSettings(rawValue = {}) {
  const source = rawValue && typeof rawValue === 'object' ? rawValue : {}
  const defaults = cloneAdminBusinessSettingsDefaults()
  const ratioSource = source.ratioRecommendation && typeof source.ratioRecommendation === 'object'
    ? source.ratioRecommendation
    : {}
  const appearanceSource = source.listingAppearanceOptions && typeof source.listingAppearanceOptions === 'object'
    ? source.listingAppearanceOptions
    : {}
  const listingSource = source.listingRecommendations && typeof source.listingRecommendations === 'object'
    ? source.listingRecommendations
    : {}
  const commissionSource = source.platformCommission && typeof source.platformCommission === 'object'
    ? source.platformCommission
    : {}
  const inviteRewardSource = source.inviteReward && typeof source.inviteReward === 'object'
    ? source.inviteReward
    : {}
  const discoverySource = source.discoveryThresholds && typeof source.discoveryThresholds === 'object'
    ? source.discoveryThresholds
    : {}
  const operationalSource = source.operationalThresholds && typeof source.operationalThresholds === 'object'
    ? source.operationalThresholds
    : {}
  const securitySource = source.securityThresholds && typeof source.securityThresholds === 'object'
    ? source.securityThresholds
    : {}
  return {
    ratioRecommendation: {
      specialKnives: normalizeAdminStringList(
        ratioSource.specialKnives,
        defaults.ratioRecommendation.specialKnives
      ),
      grid9: {
        specialKnife: normalizeAdminInteger(ratioSource.grid9?.specialKnife, defaults.ratioRecommendation.grid9.specialKnife, { min: 1, max: 1000 }),
        otherKnife: normalizeAdminInteger(ratioSource.grid9?.otherKnife, defaults.ratioRecommendation.grid9.otherKnife, { min: 1, max: 1000 }),
        noKnife: normalizeAdminInteger(ratioSource.grid9?.noKnife, defaults.ratioRecommendation.grid9.noKnife, { min: 1, max: 1000 })
      },
      grid6: {
        specialKnife: normalizeAdminInteger(ratioSource.grid6?.specialKnife, defaults.ratioRecommendation.grid6.specialKnife, { min: 1, max: 1000 }),
        otherKnife: normalizeAdminInteger(ratioSource.grid6?.otherKnife, defaults.ratioRecommendation.grid6.otherKnife, { min: 1, max: 1000 }),
        noKnife: normalizeAdminInteger(ratioSource.grid6?.noKnife, defaults.ratioRecommendation.grid6.noKnife, { min: 1, max: 1000 })
      }
    },
    listingAppearanceOptions: {
      operatorAppearances: normalizeAdminStringList(
        appearanceSource.operatorAppearances,
        defaults.listingAppearanceOptions.operatorAppearances
      ),
      knifeSkins: normalizeAdminStringList(
        appearanceSource.knifeSkins,
        defaults.listingAppearanceOptions.knifeSkins
      ),
      weaponSkins: normalizeAdminStringList(
        appearanceSource.weaponSkins,
        defaults.listingAppearanceOptions.weaponSkins
      )
    },
    listingRecommendations: {
      depositMinYuan: normalizeAdminInteger(listingSource.depositMinYuan, defaults.listingRecommendations.depositMinYuan, { min: 0, max: 999999 }),
      depositMaxYuan: normalizeAdminInteger(listingSource.depositMaxYuan, defaults.listingRecommendations.depositMaxYuan, { min: 0, max: 999999 }),
      recommendDepositRatioPercent: normalizeAdminNumber(listingSource.recommendDepositRatioPercent, defaults.listingRecommendations.recommendDepositRatioPercent, { min: 0, max: 1000, precision: 2 }),
      itemsDepositCoveragePercent: normalizeAdminNumber(listingSource.itemsDepositCoveragePercent, defaults.listingRecommendations.itemsDepositCoveragePercent, { min: 0, max: 1000, precision: 2 })
    },
    platformCommission: {
      buyerServiceFeeRatePercent: normalizeAdminNumber(commissionSource.buyerServiceFeeRatePercent, defaults.platformCommission.buyerServiceFeeRatePercent, { min: 0, max: 100, precision: 2 }),
      sellerServiceFeeRatePercent: normalizeAdminNumber(commissionSource.sellerServiceFeeRatePercent, defaults.platformCommission.sellerServiceFeeRatePercent, { min: 0, max: 100, precision: 2 })
    },
    inviteReward: {
      buyerServiceFeeRewardRatePercent: normalizeAdminNumber(
        inviteRewardSource.buyerServiceFeeRewardRatePercent,
        defaults.inviteReward.buyerServiceFeeRewardRatePercent,
        { min: 0, max: 100, precision: 2 }
      )
    },
    discoveryThresholds: {
      smallAmountHafuCoinMax: normalizeAdminInteger(discoverySource.smallAmountHafuCoinMax, defaults.discoveryThresholds.smallAmountHafuCoinMax, { min: 0, max: 999999 }),
      highRatioBaseRatioMin: normalizeAdminInteger(discoverySource.highRatioBaseRatioMin, defaults.discoveryThresholds.highRatioBaseRatioMin, { min: 0, max: 999999 }),
      homepageNewTagHours: normalizeAdminInteger(discoverySource.homepageNewTagHours, defaults.discoveryThresholds.homepageNewTagHours, { min: 1, max: 9999 }),
      pendingPaymentTimeoutMinutes: normalizeAdminInteger(discoverySource.pendingPaymentTimeoutMinutes, defaults.discoveryThresholds.pendingPaymentTimeoutMinutes, { min: 1, max: 1440 })
    },
    saleItems: defaults.saleItems.map((defaultItem) => {
      const matchedItem = Array.isArray(source.saleItems)
        ? source.saleItems.find((item) => String(item?.key || '') === defaultItem.key)
        : null
      const legacyBulletLv6Item = ['bullet762x54R', 'bullet762x51', 'bullet68x51'].includes(defaultItem.key)
        ? getLegacyBulletLv6Item(source.saleItems)
        : null
      const priceSource = matchedItem || legacyBulletLv6Item
      const enabledSource = matchedItem || legacyBulletLv6Item
      return {
        key: defaultItem.key,
        itemName: normalizeAdminSaleItemDisplayName(defaultItem.key, matchedItem?.itemName, defaultItem.itemName),
        remark: defaultItem.remark,
        unitPriceInCent: normalizeAdminInteger(priceSource?.unitPriceInCent, defaultItem.unitPriceInCent, { min: 0, max: 99999999 }),
        enabled: enabledSource?.enabled === undefined ? defaultItem.enabled : Boolean(enabledSource?.enabled)
      }
    }),
    compensationPlans: defaults.compensationPlans.map((defaultPlan) => {
      const matchedPlan = Array.isArray(source.compensationPlans)
        ? source.compensationPlans.find((item) => String(item?.value || '') === defaultPlan.value)
        : null
      return {
        value: defaultPlan.value,
        title: sanitizeAdminShortText(matchedPlan?.title, 20) || defaultPlan.title,
        shortLabel: sanitizeAdminShortText(matchedPlan?.shortLabel, 60) || defaultPlan.shortLabel,
        feeRatePercent: normalizeAdminNumber(matchedPlan?.feeRatePercent, defaultPlan.feeRatePercent, { min: 0, max: 100, precision: 2 }),
        payoutRatePercent: normalizeAdminNumber(matchedPlan?.payoutRatePercent, defaultPlan.payoutRatePercent, { min: 0, max: 1000, precision: 2 }),
        description: sanitizeAdminRemark(matchedPlan?.description, 500) || defaultPlan.description
      }
    }),
    operationalThresholds: {
      listingImageLimit: normalizeAdminInteger(operationalSource.listingImageLimit, defaults.operationalThresholds.listingImageLimit, { min: 1, max: 50 })
    },
    securityThresholds: {
      feedbackDailyLimitPerUser: normalizeAdminInteger(securitySource.feedbackDailyLimitPerUser, defaults.securityThresholds.feedbackDailyLimitPerUser, { min: 1, max: 20 }),
      listingHotMinUniqueClickCount: normalizeAdminInteger(securitySource.listingHotMinUniqueClickCount, defaults.securityThresholds.listingHotMinUniqueClickCount, { min: 1, max: 999999 }),
      smsDailyLimitPerPhone: normalizeAdminInteger(securitySource.smsDailyLimitPerPhone, defaults.securityThresholds.smsDailyLimitPerPhone, { min: 1, max: 1000 }),
      smsDailyLimitPerIp: normalizeAdminInteger(securitySource.smsDailyLimitPerIp, defaults.securityThresholds.smsDailyLimitPerIp, { min: 1, max: 5000 }),
      smsCodeTtlSeconds: normalizeAdminInteger(securitySource.smsCodeTtlSeconds, defaults.securityThresholds.smsCodeTtlSeconds, { min: 60, max: 3600 }),
      smsSendIntervalSeconds: normalizeAdminInteger(securitySource.smsSendIntervalSeconds, defaults.securityThresholds.smsSendIntervalSeconds, { min: 30, max: 3600 }),
      smsVerifyMaxAttempts: normalizeAdminInteger(securitySource.smsVerifyMaxAttempts, defaults.securityThresholds.smsVerifyMaxAttempts, { min: 3, max: 20 }),
      smsVerifyLockSeconds: normalizeAdminInteger(securitySource.smsVerifyLockSeconds, defaults.securityThresholds.smsVerifyLockSeconds, { min: 300, max: 86400 })
    }
  }
}

async function recordAdminOperation(payload = {}) {
  const operatorUserId = Number(payload.operatorUserId || 0) || null
  await pool.execute(
    `INSERT INTO admin_operation_logs (
      operator_user_id,
      operator_name,
      module,
      action,
      target_type,
      target_id,
      target_label,
      before_snapshot,
      after_snapshot,
      remark
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      operatorUserId,
      String(payload.operatorName || '').trim() || '管理员',
      String(payload.module || '').trim(),
      String(payload.action || '').trim(),
      String(payload.targetType || '').trim(),
      Number(payload.targetId || 0) || null,
      String(payload.targetLabel || '').trim().slice(0, 255),
      safeJsonStringify(payload.beforeSnapshot),
      safeJsonStringify(payload.afterSnapshot),
      sanitizeAdminRemark(payload.remark)
    ]
  )
}

async function recordAdminOperationSafely(payload = {}) {
  try {
    await recordAdminOperation(payload)
  } catch (error) {
    console.error('[admin] record operation log failed', error)
  }
}

async function getAdminListingSummaryById(db, listingId) {
  const [rows] = await db.execute(
    `SELECT
       l.id,
       l.listing_no,
       l.owner_user_id,
       COALESCE(NULLIF(owner.phone, ''), NULLIF(owner.username, ''), l.owner_name) AS owner_name,
       owner.phone AS owner_phone,
       l.listing_status,
       l.review_status,
       l.reviewed_by,
       l.reviewed_at,
       l.review_reason,
       l.rent_price,
       l.published_at,
       reviewer.username AS reviewer_name,
       TRIM(
         CONCAT(
           IFNULL(NULLIF(l.rank_name, ''), '未命名商品'),
           ' / ',
           IFNULL(NULLIF(l.login_method, ''), '未知方式')
         )
       ) AS title
     FROM listings l
     LEFT JOIN users owner ON owner.id = l.owner_user_id
     LEFT JOIN users reviewer ON reviewer.id = l.reviewed_by
     WHERE l.id = ?
     LIMIT 1`,
    [listingId]
  )
  return rows[0] || null
}

app.get('/api/admin/health', (_req, res) => {
  res.json({
    ok: true,
    mode: 'local'
  })
})

app.get('/api/admin/profile', authRequired, adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, username, phone, role, banned_until, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
      [req.auth.userId]
    )
    if (!rows.length) {
      return res.status(404).json({ message: '管理员账号不存在' })
    }
    res.json({
      user: rows[0],
      security: {
        passkeyEnabled: ADMIN_PASSKEY_ENABLED
      }
    })
  } catch (_error) {
    res.status(500).json({ message: '获取管理员信息失败' })
  }
})

app.get('/api/admin/passkeys', authRequired, adminOnly, async (req, res) => {
  try {
    const passkeys = await listAdminPasskeysByUserId(req.auth.userId)
    res.json({
      list: passkeys.map((item) => ({
        id: Number(item.id || 0),
        credentialId: String(item.credential_id || ''),
        deviceName: String(item.device_name || '').trim() || '未命名设备',
        transports: String(item.transports || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        lastUsedAt: item.last_used_at || null,
        createdAt: item.created_at || null
      }))
    })
  } catch (error) {
    console.error('[admin] list passkeys failed', error)
    res.status(500).json({ message: '获取 Passkey 列表失败' })
  }
})

app.delete(
  '/api/admin/passkeys/:id',
  authRequired,
  adminOnly,
  requireStepUpAuth(ADMIN_STEP_UP_POLICIES.deletePasskey),
  async (req, res) => {
    const passkeyId = Math.max(0, Number(req.params?.id || 0) || 0)

    if (!passkeyId) {
      return res.status(400).json({ message: '无效的 Passkey ID' })
    }

    try {
      const revokedPasskey = await revokeAdminPasskey(passkeyId, req.auth.userId)
      if (!revokedPasskey) {
        return res.status(404).json({ message: 'Passkey 不存在或已失效' })
      }

      const remainingPasskeys = await listAdminPasskeysByUserId(req.auth.userId)
      const forceRelogin = remainingPasskeys.length === 0

      if (forceRelogin) {
        if (typeof revokeAllLoginSessionsByUserId === 'function') {
          await revokeAllLoginSessionsByUserId(req.auth.userId)
        }
        clearAuthCookie(req, res)
      } else {
        const authUser = await fetchAuthUserById(req.auth.userId)
        if (authUser) {
          await refreshAdminStepUpSession(req, res, authUser, {
            authLevel: 'password',
            stepUpVerifiedAt: 0,
            amr: ['pwd']
          })
        }
      }

      res.json({
        message: forceRelogin ? 'Passkey 已删除，因当前账号已无可用 Passkey，请重新登录' : 'Passkey 已删除，当前会话的二次校验状态已清空',
        forceRelogin,
        passkey: {
          id: Number(revokedPasskey.id || 0),
          deviceName: String(revokedPasskey.device_name || '').trim() || '未命名设备'
        }
      })

      await recordAdminOperationSafely({
        operatorUserId: req.auth?.userId,
        operatorName: req.auth?.username,
        module: 'security',
        action: 'delete_passkey',
        targetType: 'passkey',
        targetId: passkeyId,
        targetLabel: String(revokedPasskey.device_name || '').trim() || `Passkey #${passkeyId}`,
        beforeSnapshot: revokedPasskey,
        afterSnapshot: { ...revokedPasskey, is_active: 0 },
        remark: '管理员删除 Passkey'
      })
    } catch (error) {
      console.error('[admin] delete passkey failed', error)
      res.status(500).json({ message: '删除 Passkey 失败' })
    }
  }
)

app.post('/api/admin/passkeys/register/sms/send', authRequired, adminOnly, async (req, res) => {
  try {
    const authUser = await fetchAuthUserById(req.auth.userId)
    if (!authUser || String(authUser.role || '').trim() !== 'admin') {
      return res.status(404).json({ message: '当前账号不支持管理员 Passkey 绑定' })
    }
    if (!isValidAdminSmsPhone(authUser.phone)) {
      return res.status(400).json({ message: '当前管理员账号未绑定有效手机号，无法发送验证码' })
    }

    const smsSecurityThresholds = await loadAdminSmsSecurityThresholds()
    const issueResult = await smsCodeService.issueCode({
      phone: authUser.phone,
      scene: ADMIN_PASSKEY_REGISTER_SMS_SCENE,
      metadata: {
        userId: req.auth.userId,
        ip: req.ip,
        userAgent: String(req.headers['user-agent'] || '').trim()
      }
    })

    if (!issueResult?.ok) {
      if (issueResult.reason === 'send_too_frequent') {
        return res.status(429).json({
          message: '验证码发送过于频繁，请稍后再试',
          retry_after_seconds: Number(issueResult.retryAfterSeconds || smsSecurityThresholds.smsSendIntervalSeconds || 60)
        })
      }
      return res.status(400).json({ message: '验证码发送失败' })
    }

    const providerResult = await smsProvider.sendVerificationCode({
      scene: ADMIN_PASSKEY_REGISTER_SMS_SCENE,
      phone: authUser.phone,
      code: issueResult.code,
      ttlSeconds: Number(smsSecurityThresholds.smsCodeTtlSeconds || 300)
    })

    if (!providerResult?.ok) {
      if (typeof smsCodeService.clearIssuedCode === 'function') {
        await smsCodeService.clearIssuedCode({
          scene: ADMIN_PASSKEY_REGISTER_SMS_SCENE,
          phone: authUser.phone
        })
      }
      return res.status(
        ['provider_not_configured', 'template_not_configured'].includes(String(providerResult.reason || '').trim())
          ? 503
          : 502
      ).json({ message: providerResult?.message || '短信服务暂不可用' })
    }

    res.status(201).json({
      success: true,
      scene: ADMIN_PASSKEY_REGISTER_SMS_SCENE,
      maskedPhone: maskAdminPhone(authUser.phone),
      retry_after_seconds: Number(issueResult.retryAfterSeconds || smsSecurityThresholds.smsSendIntervalSeconds || 60)
    })
  } catch (error) {
    console.error('[admin] send passkey register sms failed', error)
    res.status(500).json({ message: '发送验证码失败' })
  }
})

app.post('/api/admin/passkeys/register/options', authRequired, async (req, res) => {
  const deviceName = String(req.body?.deviceName || '').trim()
  const smsCode = String(req.body?.smsCode || '').trim()

  try {
    const authUser = await fetchAuthUserById(req.auth.userId)
    if (!authUser || !PASSKEY_SELF_SERVICE_ROLES.has(String(authUser.role || '').trim())) {
      return res.status(404).json({ message: '当前账号不支持 Passkey 绑定' })
    }
    if (String(authUser.role || '').trim() === 'admin') {
      if (!isValidAdminSmsPhone(authUser.phone)) {
        return res.status(400).json({ message: '当前管理员账号未绑定有效手机号，无法完成短信校验' })
      }
      if (!isValidAdminSmsCode(smsCode)) {
        return res.status(400).json({ message: '请输入正确的短信验证码' })
      }
      const smsSecurityThresholds = await loadAdminSmsSecurityThresholds()
      const verifyResult = await smsCodeService.verifyCode({
        phone: authUser.phone,
        code: smsCode,
        scene: ADMIN_PASSKEY_REGISTER_SMS_SCENE,
        consume: true
      })
      if (!verifyResult?.ok) {
        const errorResponse = buildAdminSmsVerifyErrorResponse(verifyResult, smsSecurityThresholds)
        return res.status(errorResponse.status).json(errorResponse.body)
      }
    }

    const passkeys = await listAdminPasskeysByUserId(req.auth.userId)
    const publicKey = await generateRegistrationOptions({
      rpName: ADMIN_PASSKEY_RP_NAME,
      rpID: getAdminPasskeyRpId(req),
      userName: String(authUser.phone || authUser.username || `admin-${authUser.id}`),
      userID: Buffer.from(String(authUser.id)),
      userDisplayName: String(authUser.username || authUser.phone || `admin-${authUser.id}`),
      timeout: ADMIN_PASSKEY_REGISTRATION_TTL_MS,
      attestationType: 'none',
      excludeCredentials: passkeys.map((item) => ({
        id: String(item.credential_id || ''),
        transports: String(item.transports || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred'
      },
      preferredAuthenticatorType: 'localDevice'
    })

    const challengeRecord = issueAdminPasskeyRegistrationChallenge(req, req.auth, {
      challenge: publicKey.challenge,
      deviceName
    })

    res.json({
      challengeToken: challengeRecord.challengeToken,
      expiresAt: challengeRecord.expiresAt,
      publicKey,
      stage: 'active'
    })
  } catch (error) {
    console.error('[admin] passkey register options failed', error)
    res.status(500).json({ message: '生成 Passkey 注册挑战失败' })
  }
})

app.post('/api/admin/passkeys/register/verify', authRequired, async (req, res) => {
  const challengeToken = String(req.body?.challengeToken || '').trim()
  const credential = req.body?.credential
  const fallbackDeviceName = String(req.body?.deviceName || '').trim()
  const challengeRecord = getAdminPasskeyRegistrationChallenge(challengeToken)

  if (!challengeToken) {
    return res.status(400).json({ message: '缺少 challengeToken' })
  }
  if (!challengeRecord) {
    return res.status(410).json({
      code: 'PASSKEY_REGISTRATION_CHALLENGE_EXPIRED',
      message: 'Passkey 注册挑战不存在或已过期'
    })
  }
  if (Number(challengeRecord.userId || 0) !== Number(req.auth.userId || 0)) {
    return res.status(403).json({ message: '当前注册挑战不属于当前管理员会话' })
  }
  if (challengeRecord.consumedAt) {
    return res.status(409).json({
      code: 'PASSKEY_REGISTRATION_CHALLENGE_CONSUMED',
      message: '当前 Passkey 注册挑战已被使用'
    })
  }
  if (challengeRecord.sessionFingerprint !== buildAdminStepUpSessionFingerprint(req)) {
    return res.status(403).json({ message: '当前注册挑战已脱离原始管理员会话环境' })
  }
  if (!credential || typeof credential !== 'object') {
    return res.status(400).json({ message: '缺少 Passkey 注册结果' })
  }

  try {
    const authUser = await fetchAuthUserById(req.auth.userId)
    if (!authUser || !PASSKEY_SELF_SERVICE_ROLES.has(String(authUser.role || '').trim())) {
      return res.status(404).json({ message: '当前账号不支持 Passkey 绑定' })
    }

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: challengeRecord.challenge,
      expectedOrigin: getExpectedAdminPasskeyOrigins(req),
      expectedRPID: getAdminPasskeyRpId(req),
      requireUserVerification: false
    })

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({
        code: 'PASSKEY_REGISTRATION_FAILED',
        message: 'Passkey 注册验证失败'
      })
    }

    const credentialId = String(verification.registrationInfo.credential.id || '').trim()
    const existingPasskey = await findAdminPasskeyByCredentialId(credentialId)
    if (existingPasskey && Number(existingPasskey.user_id || 0) !== Number(req.auth.userId || 0)) {
      return res.status(409).json({
        code: 'PASSKEY_CREDENTIAL_CONFLICT',
        message: '该 Passkey 已绑定到其他管理员账号'
      })
    }

    const savedPasskey = await upsertAdminPasskeyCredential({
      userId: req.auth.userId,
      credentialId,
      publicKey: encodeBufferToBase64Url(verification.registrationInfo.credential.publicKey),
      signCount: verification.registrationInfo.credential.counter,
      transports: credential?.response?.transports || [],
      deviceName: challengeRecord.deviceName || fallbackDeviceName,
      aaguid: verification.registrationInfo.aaguid
    })

    markAdminPasskeyRegistrationChallengeConsumed(challengeToken)
    res.json({
      success: true,
      stage: 'active',
      passkey: {
        id: Number(savedPasskey?.id || 0),
        credentialId,
        deviceName: savedPasskey?.device_name || challengeRecord.deviceName || fallbackDeviceName || '未命名设备',
        createdAt: savedPasskey?.created_at || null
      }
    })
  } catch (error) {
    console.error('[admin] passkey register verify failed', error)
    res.status(400).json({
      code: 'PASSKEY_REGISTRATION_FAILED',
      message: error.message || 'Passkey 注册验证失败'
    })
  }
})

app.get('/api/admin/trusted-devices', authRequired, adminOnly, async (req, res) => {
  try {
    const currentTrustedDeviceId = Number(req.auth?.trustedDeviceId || 0) || 0
    const devices = await listTrustedDevicesByUserId(req.auth.userId)
    res.json({
      list: devices.map((item) => ({
        id: Number(item.id || 0),
        deviceName: String(item.device_name || '').trim() || '未命名设备',
        userAgent: String(item.user_agent || '').trim(),
        lastIp: String(item.last_ip || '').trim(),
        lastUsedAt: item.last_used_at || null,
        expiresAt: item.expires_at || null,
        createdAt: item.created_at || null,
        isCurrent: Number(item.id || 0) === currentTrustedDeviceId
      }))
    })
  } catch (error) {
    console.error('[admin] list trusted devices failed', error)
    res.status(500).json({ message: '获取受信任设备列表失败' })
  }
})

app.post(
  '/api/admin/trusted-devices',
  authRequired,
  adminOnly,
  requireStepUpAuth(ADMIN_STEP_UP_POLICIES.trustCurrentDevice),
  async (req, res) => {
    const deviceName = String(req.body?.deviceName || '').trim()

    try {
      let trustedDevice = null
      const currentToken = getTrustedDeviceTokenFromRequest(req)
      const currentRecord = currentToken
        ? await getTrustedDeviceRecordByToken(currentToken, req.auth.userId)
        : null

      if (currentRecord?.id) {
        trustedDevice = await refreshTrustedDeviceRecord(currentRecord.id, req, deviceName)
        setTrustedDeviceCookie(req, res, currentToken)
      } else {
        trustedDevice = await issueTrustedDeviceForCurrentSession(req, res, req.auth.userId, deviceName)
      }

      const authUser = await fetchAuthUserById(req.auth.userId)
      if (authUser && trustedDevice?.id) {
        await refreshAdminStepUpSession(req, res, authUser, {
          trustedDevice: true,
          trustedDeviceId: String(trustedDevice.id),
          authLevel: req.auth?.authLevel || 'password',
          stepUpVerifiedAt: req.auth?.stepUpVerifiedAt || 0,
          amr: Array.isArray(req.auth?.amr) ? req.auth.amr : ['pwd']
        })
      }

      res.json({
        message: '当前设备已加入受信任设备列表',
        device: {
          id: Number(trustedDevice?.id || 0),
          deviceName: String(trustedDevice?.device_name || '').trim() || '未命名设备',
          expiresAt: trustedDevice?.expires_at || null,
          isCurrent: true
        }
      })

      await recordAdminOperationSafely({
        operatorUserId: req.auth?.userId,
        operatorName: req.auth?.username,
        module: 'security',
        action: 'trust_current_device',
        targetType: 'trusted_device',
        targetId: Number(trustedDevice?.id || 0) || null,
        targetLabel: String(trustedDevice?.device_name || '').trim() || `受信任设备 #${Number(trustedDevice?.id || 0) || 0}`,
        beforeSnapshot: null,
        afterSnapshot: trustedDevice,
        remark: '信任当前设备'
      })
    } catch (error) {
      console.error('[admin] trust current device failed', error)
      res.status(500).json({ message: '设置信任设备失败' })
    }
  }
)

app.delete(
  '/api/admin/trusted-devices/:id',
  authRequired,
  adminOnly,
  requireStepUpAuth(ADMIN_STEP_UP_POLICIES.revokeTrustedDevice),
  async (req, res) => {
    const deviceId = Math.max(0, Number(req.params?.id || 0) || 0)

    if (!deviceId) {
      return res.status(400).json({ message: '无效的设备ID' })
    }

    try {
      const revokedDevice = await revokeTrustedDeviceById(deviceId, req.auth.userId)
      if (!revokedDevice) {
        return res.status(404).json({ message: '受信任设备不存在或已失效' })
      }

      const currentTrustedDeviceId = Number(req.auth?.trustedDeviceId || 0) || 0
      if (currentTrustedDeviceId && currentTrustedDeviceId === deviceId) {
        clearTrustedDeviceCookie(req, res)
      }

      res.json({
        message: '受信任设备已移除',
        device: {
          id: Number(revokedDevice.id || 0),
          deviceName: String(revokedDevice.device_name || '').trim() || '未命名设备'
        }
      })

      await recordAdminOperationSafely({
        operatorUserId: req.auth?.userId,
        operatorName: req.auth?.username,
        module: 'security',
        action: 'revoke_trusted_device',
        targetType: 'trusted_device',
        targetId: deviceId,
        targetLabel: String(revokedDevice.device_name || '').trim() || `受信任设备 #${deviceId}`,
        beforeSnapshot: revokedDevice,
        afterSnapshot: { ...revokedDevice, revoked_at: new Date().toISOString() },
        remark: '撤销受信任设备'
      })
    } catch (error) {
      console.error('[admin] revoke trusted device failed', error)
      res.status(500).json({ message: '移除受信任设备失败' })
    }
  }
)

app.post(
  '/api/admin/trusted-devices/revoke-all',
  authRequired,
  adminOnly,
  requireStepUpAuth(ADMIN_STEP_UP_POLICIES.revokeAllTrustedDevices),
  async (req, res) => {
    try {
      const affectedRows = await revokeAllTrustedDevicesByUserId(req.auth.userId)
      clearTrustedDeviceCookie(req, res)

      res.json({
        message: affectedRows ? '已清空受信任设备' : '当前没有可清空的受信任设备',
        count: affectedRows
      })

      await recordAdminOperationSafely({
        operatorUserId: req.auth?.userId,
        operatorName: req.auth?.username,
        module: 'security',
        action: 'revoke_all_trusted_devices',
        targetType: 'trusted_device',
        targetId: req.auth?.userId,
        targetLabel: `管理员 #${req.auth?.userId || 0}`,
        beforeSnapshot: { count: affectedRows },
        afterSnapshot: { count: 0 },
        remark: '清空全部受信任设备'
      })
    } catch (error) {
      console.error('[admin] revoke all trusted devices failed', error)
      res.status(500).json({ message: '清空受信任设备失败' })
    }
  }
)

app.post('/api/admin/step-up/options', authRequired, async (req, res) => {
  const action = String(req.body?.action || '').trim()
  const policy = getAdminStepUpPolicyByAction(action)

  if (!policy) {
    return res.status(400).json({ message: '无效的二次校验动作' })
  }
  if (!canCurrentRoleUsePolicy(policy, req.auth?.role)) {
    return res.status(403).json({ message: '当前角色无权发起该二次校验' })
  }

  try {
    const authUser = await fetchAuthUserById(req.auth.userId)
    if (!authUser || !canCurrentRoleUsePolicy(policy, authUser.role)) {
      return res.status(404).json({ message: '当前账号无权执行该二次校验' })
    }
    const passkeys = await listAdminPasskeysByUserId(req.auth.userId)
    if (!passkeys.length) {
      return res.status(412).json({
        code: 'PASSKEY_NOT_REGISTERED',
        message: '当前管理员尚未绑定 Passkey，暂时无法完成二次校验',
        action: policy.action
      })
    }

    const publicKey = await generateAuthenticationOptions({
      rpID: getAdminPasskeyRpId(req),
      timeout: ADMIN_STEP_UP_CHALLENGE_TTL_MS,
      userVerification: 'preferred',
      allowCredentials: passkeys.map((item) => ({
        id: String(item.credential_id || ''),
        transports: String(item.transports || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      }))
    })
    const challengeRecord = issueAdminStepUpChallenge(req, req.auth, policy, publicKey.challenge)
    publicKey.allowCredentials = passkeys.map((item) => ({
      id: String(item.credential_id || ''),
      type: 'public-key',
      transports: String(item.transports || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    }))
    res.json({
      action: policy.action,
      challengeToken: challengeRecord.challengeToken,
      expiresAt: challengeRecord.expiresAt,
      stage: 'active',
      policy: {
        maxAgeMinutes: policy.maxAgeMinutes,
        requirePasskey: policy.requirePasskey,
        requireTrustedDevice: policy.requireTrustedDevice,
        allowTrustedDeviceBypassPasskey: Boolean(policy.allowTrustedDeviceBypassPasskey)
      },
      publicKey,
      credentialCount: passkeys.length
    })
  } catch (error) {
    console.error('[admin] step-up options failed', error)
    res.status(500).json({ message: '生成二次校验挑战失败' })
  }
})

app.post('/api/admin/step-up/verify', authRequired, async (req, res) => {
  const challengeToken = String(req.body?.challengeToken || '').trim()
  const action = String(req.body?.action || '').trim()
  const credential = req.body?.credential
  const challengeRecord = getAdminStepUpChallenge(challengeToken)

  if (!challengeToken) {
    return res.status(400).json({ message: '缺少 challengeToken' })
  }
  if (!action) {
    return res.status(400).json({ message: '缺少待验证动作' })
  }
  if (!challengeRecord) {
    return res.status(410).json({
      code: 'STEP_UP_CHALLENGE_EXPIRED',
      message: '二次校验挑战不存在或已过期'
    })
  }
  if (Number(challengeRecord.userId || 0) !== Number(req.auth.userId || 0)) {
    return res.status(403).json({ message: '当前挑战不属于当前管理员会话' })
  }
  if (challengeRecord.action !== action) {
    return res.status(400).json({ message: '挑战动作不匹配，请重新发起二次校验' })
  }
  const policy = getAdminStepUpPolicyByAction(action)
  if (!policy || !canCurrentRoleUsePolicy(policy, req.auth?.role)) {
    return res.status(403).json({ message: '当前角色无权完成该二次校验' })
  }
  if (challengeRecord.consumedAt) {
    return res.status(409).json({
      code: 'STEP_UP_CHALLENGE_CONSUMED',
      message: '当前二次校验挑战已被使用'
    })
  }
  if (challengeRecord.sessionFingerprint !== buildAdminStepUpSessionFingerprint(req)) {
    return res.status(403).json({ message: '当前挑战已脱离原始管理员会话环境' })
  }
  if (!credential || typeof credential !== 'object') {
    return res.status(400).json({ message: '缺少 Passkey 验证结果' })
  }

  try {
    const authUser = await fetchAuthUserById(req.auth.userId)
    if (!authUser || !canCurrentRoleUsePolicy(policy, authUser.role)) {
      return res.status(404).json({ message: '当前账号无权执行该二次校验' })
    }
    const credentialId = normalizeCredentialIdFromRequest(credential)
    if (!credentialId) {
      return res.status(400).json({
        code: 'PASSKEY_ASSERTION_INVALID',
        message: '缺少 Passkey credential id'
      })
    }

    const passkeyRecord = await findAdminPasskeyByCredentialId(credentialId)
    if (!passkeyRecord || Number(passkeyRecord.user_id || 0) !== Number(req.auth.userId || 0)) {
      return res.status(404).json({
        code: 'PASSKEY_CREDENTIAL_NOT_FOUND',
        message: '当前管理员尚未绑定可用的 Passkey 凭证'
      })
    }

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: challengeRecord.challenge,
      expectedOrigin: getExpectedAdminPasskeyOrigins(req),
      expectedRPID: getAdminPasskeyRpId(req),
      credential: buildStoredWebAuthnCredential(passkeyRecord),
      requireUserVerification: false
    })

    if (!verification.verified) {
      return res.status(400).json({
        code: 'PASSKEY_VERIFY_FAILED',
        message: 'Passkey 验签未通过',
        action,
        challengeToken,
        stage: 'active'
      })
    }

    markAdminStepUpChallengeConsumed(challengeToken)
    await updateAdminPasskeyUsage(passkeyRecord.id, verification.authenticationInfo.newCounter)
    const sessionState = await refreshAdminStepUpSession(req, res, authUser, {
      authLevel: 'passkey',
      stepUpVerifiedAt: Date.now(),
      amr: ['pwd', 'passkey']
    })
    return res.json({
      success: true,
      action,
      stage: 'active',
      session: sessionState,
      verificationInfo: verification.authenticationInfo
    })
  } catch (error) {
    console.error('[admin] step-up verify failed', error)
    res.status(400).json({
      code: 'PASSKEY_VERIFY_FAILED',
      message: error.message || '执行二次校验失败'
    })
  }
})

app.get('/api/admin/overview', authRequired, adminOnly, async (_req, res) => {
  try {
    const [[usersRow]] = await pool.execute(
      'SELECT COUNT(*) AS total_users FROM users'
    )
    const [[listingsRow]] = await pool.execute(
      'SELECT COUNT(*) AS total_listings FROM listings'
    )
    const [[ordersRow]] = await pool.execute(
      `SELECT
         COUNT(*) AS total_orders,
         SUM(CASE WHEN status IN ('after_sale', 'refund_pending', 'refunded') THEN 1 ELSE 0 END) AS after_sale_orders
       FROM orders`
    )

    res.json({
      totalUsers: Number(usersRow?.total_users || 0),
      totalListings: Number(listingsRow?.total_listings || 0),
      totalOrders: Number(ordersRow?.total_orders || 0),
      afterSaleOrders: Number(ordersRow?.after_sale_orders || 0)
    })
  } catch (_error) {
    res.status(500).json({ message: '获取后台概览数据失败' })
  }
})

app.get('/api/admin/business-settings', authRequired, adminOnly, async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT settings_json, updated_by_user_id, updated_at
       FROM admin_business_settings
       WHERE id = 1
       LIMIT 1`
    )
    const row = rows[0] || null
    let parsedSettings = {}
    if (row?.settings_json) {
      try {
        parsedSettings = JSON.parse(row.settings_json)
      } catch (_error) {
        parsedSettings = {}
      }
    }

    res.json({
      settings: normalizeAdminBusinessSettings(parsedSettings),
      updatedByUserId: Number(row?.updated_by_user_id || 0) || null,
      updatedAt: row?.updated_at || null
    })
  } catch (error) {
    console.error('[admin] business settings detail failed', error)
    res.status(500).json({ message: '获取参数配置失败' })
  }
})

app.put(
  '/api/admin/business-settings',
  authRequired,
  adminOnly,
  requireStepUpAuth(ADMIN_STEP_UP_POLICIES.updateBusinessSettings),
  async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT settings_json, updated_by_user_id, updated_at
       FROM admin_business_settings
       WHERE id = 1
       LIMIT 1`
    )
    const currentRow = rows[0] || null
    let currentSettings = {}
    if (currentRow?.settings_json) {
      try {
        currentSettings = JSON.parse(currentRow.settings_json)
      } catch (_error) {
        currentSettings = {}
      }
    }

    const normalizedSettings = normalizeAdminBusinessSettings(req.body?.settings)
    await pool.execute(
      `INSERT INTO admin_business_settings (
         id,
         settings_json,
         updated_by_user_id,
         updated_at
       ) VALUES (1, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         settings_json = VALUES(settings_json),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = VALUES(updated_at)`,
      [
        JSON.stringify(normalizedSettings),
        Number(req.auth?.userId || 0) || null
      ]
    )

    res.json({
      message: '参数配置已保存',
      settings: normalizedSettings,
      updatedByUserId: Number(req.auth?.userId || 0) || null,
      updatedAt: new Date().toISOString()
    })

    await recordAdminOperationSafely({
      operatorUserId: req.auth?.userId,
      operatorName: req.auth?.username,
      module: 'config',
      action: 'update_business_settings',
      targetType: 'business_settings',
      targetId: 1,
      targetLabel: '平台业务参数',
      beforeSnapshot: normalizeAdminBusinessSettings(currentSettings),
      afterSnapshot: normalizedSettings,
      remark: '更新平台业务参数配置'
    })
  } catch (error) {
    console.error('[admin] business settings update failed', error)
    res.status(500).json({ message: '保存参数配置失败' })
  }
  }
)

app.get('/api/admin/revenue', authRequired, adminOnly, async (req, res) => {
  const page = Math.max(1, Number(req.query?.page || 1) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(req.query?.pageSize || 20) || 20))
  const offset = (page - 1) * pageSize
  const rangeInfo = resolveAdminTimeRange(req.query)

  if (!rangeInfo.valid) {
    return res.status(400).json({ message: '无效的收益筛选时间范围' })
  }

  try {
    const rangeParams = [rangeInfo.rangeStart, rangeInfo.rangeEnd]
    const revenueTimeSql = 'COALESCE(os.executed_at, os.updated_at, os.created_at)'
    const buyerServiceFeeSql = `CASE
      WHEN o.status = 'completed' AND os.status = 'executed'
        THEN GREATEST(COALESCE(o.amount, 0) - COALESCE(os.rent_amount, 0), 0)
      ELSE 0
    END`
    const [[statsRow]] = await pool.execute(
      `SELECT
         COUNT(*) AS total_orders,
         SUM(COALESCE(os.platform_fee_amount, 0) + ${buyerServiceFeeSql}) AS total_platform_fee,
         SUM(CASE WHEN os.status = 'executed' THEN COALESCE(os.platform_fee_amount, 0) + ${buyerServiceFeeSql} ELSE 0 END) AS settled_platform_fee,
         SUM(COALESCE(os.seller_income_amount, 0)) AS total_seller_income,
         SUM(COALESCE(os.used_items_amount, 0)) AS total_used_items_amount,
         SUM(CASE WHEN os.status = 'executed' THEN 1 ELSE 0 END) AS settled_orders
       FROM order_settlements os
       JOIN orders o ON o.id = os.order_id
       WHERE ${revenueTimeSql} >= ? AND ${revenueTimeSql} < ?`,
      rangeParams
    )
    const [rows] = await pool.query(
      `SELECT
         o.id,
         o.order_no,
         o.listing_title,
         o.status,
         os.status AS settlement_status,
         os.rent_amount,
         os.used_items_amount,
         COALESCE(os.platform_fee_amount, 0) + ${buyerServiceFeeSql} AS platform_fee_amount,
         os.seller_income_amount,
         os.buyer_refund_amount,
         ${revenueTimeSql} AS revenue_time,
         os.executed_at,
         COALESCE(NULLIF(buyer.phone, ''), NULLIF(buyer.username, ''), CONCAT('用户 #', o.buyer_id)) AS buyer_name,
         COALESCE(NULLIF(seller.phone, ''), NULLIF(seller.username, ''), NULLIF(o.seller_name, ''), '平台卖家') AS seller_name
       FROM order_settlements os
       JOIN orders o ON o.id = os.order_id
       JOIN users buyer ON buyer.id = o.buyer_id
       LEFT JOIN users seller ON seller.id = o.seller_id
       WHERE ${revenueTimeSql} >= ? AND ${revenueTimeSql} < ?
       ORDER BY revenue_time DESC, o.id DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      rangeParams
    )

    res.json({
      page,
      pageSize,
      total: Number(statsRow?.total_orders || 0),
      granularity: rangeInfo.granularity,
      value: rangeInfo.value,
      range: {
        startAt: rangeInfo.rangeStart,
        endAt: rangeInfo.rangeEnd,
        startDate: rangeInfo.startDate,
        endDate: rangeInfo.endDate
      },
      stats: {
        totalOrders: Number(statsRow?.total_orders || 0),
        settledOrders: Number(statsRow?.settled_orders || 0),
        totalPlatformFee: Number(statsRow?.total_platform_fee || 0),
        settledPlatformFee: Number(statsRow?.settled_platform_fee || 0),
        totalSellerIncome: Number(statsRow?.total_seller_income || 0),
        totalUsedItemsAmount: Number(statsRow?.total_used_items_amount || 0)
      },
      list: rows.map((row) => ({
        ...row,
        id: Number(row.id || 0),
        rent_amount: Number(row.rent_amount || 0),
        used_items_amount: Number(row.used_items_amount || 0),
        platform_fee_amount: Number(row.platform_fee_amount || 0),
        seller_income_amount: Number(row.seller_income_amount || 0),
        buyer_refund_amount: Number(row.buyer_refund_amount || 0)
      }))
    })
  } catch (error) {
    console.error('[admin] revenue list failed', error)
    res.status(500).json({ message: '获取平台收益数据失败' })
  }
})

app.get('/api/admin/dashboard/trends', authRequired, adminOnly, async (req, res) => {
  const rangeInfo = resolveAdminTimeRange(req.query)

  if (!rangeInfo.valid) {
    return res.status(400).json({ message: '无效的趋势筛选时间范围' })
  }

  try {
    const rangeParams = [rangeInfo.rangeStart, rangeInfo.rangeEnd]
    const salesTimeSql = 'o.paid_at'
    const salesBucketSql = getAdminTrendBucketSql(rangeInfo.granularity, salesTimeSql)
    const usersTimeSql = 'u.created_at'
    const usersBucketSql = getAdminTrendBucketSql(rangeInfo.granularity, usersTimeSql)
    const onlineTimeSql = 'snapshot_at'
    const onlineBucketSql = getAdminTrendBucketSql(rangeInfo.granularity, onlineTimeSql)

    const [[salesStatsRow]] = await pool.execute(
      `SELECT
         COUNT(*) AS total_paid_orders,
         SUM(COALESCE(o.amount, 0)) AS total_sales_amount
       FROM orders o
       WHERE o.paid_at IS NOT NULL
         AND ${salesTimeSql} >= ?
         AND ${salesTimeSql} < ?`,
      rangeParams
    )

    const [salesRows] = await pool.execute(
      `SELECT
         ${salesBucketSql} AS bucket,
         COUNT(*) AS paid_order_count,
         SUM(COALESCE(o.amount, 0)) AS sales_amount
       FROM orders o
       WHERE o.paid_at IS NOT NULL
         AND ${salesTimeSql} >= ?
         AND ${salesTimeSql} < ?
       GROUP BY bucket
       ORDER BY bucket ASC`,
      rangeParams
    )

    const [[usersStatsRow]] = await pool.execute(
      `SELECT
         COUNT(*) AS total_registered_users
       FROM users u
       WHERE ${usersTimeSql} >= ?
         AND ${usersTimeSql} < ?`,
      rangeParams
    )

    const [usersRows] = await pool.execute(
      `SELECT
         ${usersBucketSql} AS bucket,
         COUNT(*) AS register_count
       FROM users u
       WHERE ${usersTimeSql} >= ?
         AND ${usersTimeSql} < ?
       GROUP BY bucket
       ORDER BY bucket ASC`,
      rangeParams
    )

    const currentOnlineUsers = typeof getCurrentOnlineUserCount === 'function'
      ? await getCurrentOnlineUserCount()
      : 0

    const [[onlineStatsRow]] = await pool.execute(
      `SELECT
         MAX(current_online_users) AS max_online_users,
         AVG(current_online_users) AS avg_online_users,
         COUNT(*) AS sample_count
       FROM admin_online_snapshots
       WHERE ${onlineTimeSql} >= ?
         AND ${onlineTimeSql} < ?`,
      rangeParams
    )

    const [onlineRows] = await pool.execute(
      `SELECT
         ${onlineBucketSql} AS bucket,
         MAX(current_online_users) AS max_online_users
       FROM admin_online_snapshots
       WHERE ${onlineTimeSql} >= ?
         AND ${onlineTimeSql} < ?
       GROUP BY bucket
       ORDER BY bucket ASC`,
      rangeParams
    )

    res.json({
      granularity: rangeInfo.granularity,
      value: rangeInfo.value,
      range: {
        startAt: rangeInfo.rangeStart,
        endAt: rangeInfo.rangeEnd,
        startDate: rangeInfo.startDate,
        endDate: rangeInfo.endDate
      },
      sales: {
        totals: {
          totalPaidOrders: Number(salesStatsRow?.total_paid_orders || 0),
          totalSalesAmount: Number(salesStatsRow?.total_sales_amount || 0)
        },
        list: salesRows.map((row) => ({
          bucket: String(row.bucket || ''),
          paidOrderCount: Number(row.paid_order_count || 0),
          salesAmount: Number(row.sales_amount || 0)
        }))
      },
      users: {
        totals: {
          totalRegisteredUsers: Number(usersStatsRow?.total_registered_users || 0)
        },
        list: usersRows.map((row) => ({
          bucket: String(row.bucket || ''),
          registerCount: Number(row.register_count || 0)
        }))
      },
      online: {
        summary: {
          currentOnlineUsers: Number(currentOnlineUsers || 0),
          maxOnlineUsers: Number(onlineStatsRow?.max_online_users || 0),
          avgOnlineUsers: Math.round(Number(onlineStatsRow?.avg_online_users || 0) * 100) / 100,
          sampleCount: Number(onlineStatsRow?.sample_count || 0)
        },
        list: onlineRows.map((row) => ({
          bucket: String(row.bucket || ''),
          maxOnlineUsers: Number(row.max_online_users || 0)
        }))
      }
    })
  } catch (error) {
    console.error('[admin] dashboard trends failed', error)
    res.status(500).json({ message: '获取趋势图数据失败' })
  }
})

app.get('/api/admin/users', authRequired, adminOnly, async (req, res) => {
  const page = Math.max(1, Number(req.query?.page || 1) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(req.query?.pageSize || 20) || 20))
  const offset = (page - 1) * pageSize
  const keyword = sanitizeAdminKeyword(req.query?.keyword)

  try {
    const whereSql = keyword
      ? 'WHERE username LIKE ? OR phone LIKE ?'
      : ''
    const params = keyword ? [`%${keyword}%`, `%${keyword}%`] : []

    const [[countRow]] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM users
       ${whereSql}`,
      params
    )
    const [rows] = await pool.query(
      `SELECT id, username, phone, role, banned_until, created_at, updated_at
       FROM users
       ${whereSql}
       ORDER BY
         CASE role
           WHEN 'admin' THEN 1
           WHEN 'support' THEN 2
           WHEN 'user' THEN 3
           ELSE 4
         END ASC,
         id DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      params
    )
    res.json({
      total: Number(countRow?.total || 0),
      page,
      pageSize,
      keyword,
      list: rows
    })
  } catch (error) {
    console.error('[admin] users list failed', error)
    res.status(500).json({ message: '获取用户列表失败' })
  }
})

app.put(
  '/api/admin/users/:id/role',
  authRequired,
  adminOnly,
  requireStepUpAuth(ADMIN_STEP_UP_POLICIES.updateUserRole),
  async (req, res) => {
  const userId = Math.max(0, Number(req.params?.id || 0) || 0)
  const nextRole = String(req.body?.role || '').trim()
  const allowedRoles = ['user', 'support', 'admin']

  if (!userId) {
    return res.status(400).json({ message: '无效的用户ID' })
  }

  if (!allowedRoles.includes(nextRole)) {
    return res.status(400).json({ message: '仅支持设置为 user、support、admin' })
  }

  if (userId === Number(req.auth.userId || 0) && nextRole !== 'admin') {
    return res.status(400).json({ message: '不能将当前登录管理员降级为非 admin' })
  }

  try {
    const [rows] = await pool.execute(
      'SELECT id, username, phone, role, banned_until, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
      [userId]
    )
    if (!rows.length) {
      return res.status(404).json({ message: '用户不存在' })
    }

    await pool.execute(
      'UPDATE users SET role = ? WHERE id = ?',
      [nextRole, userId]
    )
    if (typeof revokeAllLoginSessionsByUserId === 'function') {
      await revokeAllLoginSessionsByUserId(userId)
    }

    const [updatedRows] = await pool.execute(
      'SELECT id, username, phone, role, banned_until, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
      [userId]
    )

    res.json({
      message: '用户角色已更新',
      user: updatedRows[0]
    })
    await recordAdminOperationSafely({
      operatorUserId: req.auth?.userId,
      operatorName: req.auth?.username,
      module: 'user',
      action: 'update_role',
      targetType: 'user',
      targetId: userId,
      targetLabel: `${updatedRows[0]?.username || rows[0]?.username || '用户'} (#${userId})`,
      beforeSnapshot: rows[0],
      afterSnapshot: updatedRows[0],
      remark: `角色变更为 ${nextRole}`
    })
  } catch (error) {
    console.error('[admin] update user role failed', error)
    res.status(500).json({ message: '更新用户角色失败' })
  }
  }
)

app.put(
  '/api/admin/users/:id/ban',
  authRequired,
  adminOnly,
  requireStepUpAuth(ADMIN_STEP_UP_POLICIES.banUser),
  async (req, res) => {
  const userId = Math.max(0, Number(req.params?.id || 0) || 0)
  const days = Math.max(0, Number(req.body?.days || 0) || 0)

  if (!userId) {
    return res.status(400).json({ message: '无效的用户ID' })
  }

  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    return res.status(400).json({ message: '封禁天数必须是 1 到 3650 之间的整数' })
  }

  if (userId === Number(req.auth.userId || 0)) {
    return res.status(400).json({ message: '不能封禁当前登录管理员自己' })
  }

  try {
    const [rows] = await pool.execute(
      'SELECT id, username, phone, role, banned_until, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
      [userId]
    )
    if (!rows.length) {
      return res.status(404).json({ message: '用户不存在' })
    }

    await pool.query(
      `UPDATE users
       SET banned_until = DATE_ADD(NOW(), INTERVAL ${days} DAY)
       WHERE id = ${userId}`
    )
    if (typeof revokeAllLoginSessionsByUserId === 'function') {
      await revokeAllLoginSessionsByUserId(userId)
    }

    const [updatedRows] = await pool.execute(
      'SELECT id, username, phone, role, banned_until, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
      [userId]
    )

    res.json({
      message: `用户已封禁 ${days} 天`,
      user: updatedRows[0]
    })
    await recordAdminOperationSafely({
      operatorUserId: req.auth?.userId,
      operatorName: req.auth?.username,
      module: 'user',
      action: 'ban_user',
      targetType: 'user',
      targetId: userId,
      targetLabel: `${updatedRows[0]?.username || rows[0]?.username || '用户'} (#${userId})`,
      beforeSnapshot: rows[0],
      afterSnapshot: updatedRows[0],
      remark: `封禁 ${days} 天`
    })
  } catch (error) {
    console.error('[admin] ban user failed', error)
    res.status(500).json({ message: '封禁用户失败' })
  }
  }
)

app.delete(
  '/api/admin/users/:id/ban',
  authRequired,
  adminOnly,
  requireStepUpAuth(ADMIN_STEP_UP_POLICIES.unbanUser),
  async (req, res) => {
  const userId = Math.max(0, Number(req.params?.id || 0) || 0)

  if (!userId) {
    return res.status(400).json({ message: '无效的用户ID' })
  }

  try {
    const [rows] = await pool.execute(
      'SELECT id, username, phone, role, banned_until, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
      [userId]
    )
    if (!rows.length) {
      return res.status(404).json({ message: '用户不存在' })
    }

    await pool.execute(
      'UPDATE users SET banned_until = NULL WHERE id = ?',
      [userId]
    )

    const [updatedRows] = await pool.execute(
      'SELECT id, username, phone, role, banned_until, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
      [userId]
    )

    res.json({
      message: '用户封禁已解除',
      user: updatedRows[0]
    })
    await recordAdminOperationSafely({
      operatorUserId: req.auth?.userId,
      operatorName: req.auth?.username,
      module: 'user',
      action: 'unban_user',
      targetType: 'user',
      targetId: userId,
      targetLabel: `${updatedRows[0]?.username || rows[0]?.username || '用户'} (#${userId})`,
      beforeSnapshot: rows[0],
      afterSnapshot: updatedRows[0],
      remark: '解除封禁'
    })
  } catch (error) {
    console.error('[admin] unban user failed', error)
    res.status(500).json({ message: '解除封禁失败' })
  }
  }
)

app.put(
  '/api/admin/orders/:id/close',
  authRequired,
  adminOnly,
  requireStepUpAuth(ADMIN_STEP_UP_POLICIES.closeOrder),
  async (req, res) => {
  const orderId = Math.max(0, Number(req.params?.id || 0) || 0)

  if (!orderId) {
    return res.status(400).json({ message: '无效的订单ID' })
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
         o.id,
         o.listing_id,
         o.status,
         o.order_no,
         o.amount,
         o.created_at,
         buyer.username AS buyer_name,
         seller.username AS seller_name
       FROM orders o
       JOIN users buyer ON buyer.id = o.buyer_id
       LEFT JOIN users seller ON seller.id = o.seller_id
       WHERE o.id = ?
       LIMIT 1`,
      [orderId]
    )

    if (!rows.length) {
      return res.status(404).json({ message: '订单不存在' })
    }

    const currentOrder = rows[0]
    if (currentOrder.status === 'cancelled') {
      return res.json({
        message: '订单已处于关闭状态',
        order: currentOrder
      })
    }

    if (['completed', 'refunded'].includes(String(currentOrder.status || ''))) {
      return res.status(400).json({ message: '已完成或已退款订单不支持后台关闭' })
    }

    await pool.execute(
      `UPDATE orders
       SET status = 'cancelled', cancelled_at = NOW()
       WHERE id = ?`,
      [orderId]
    )

    if (currentOrder.listing_id) {
      await pool.execute(
        `UPDATE listings
         SET listing_status = 'active'
         WHERE id = ?
           AND listing_status = 'rented'`,
        [currentOrder.listing_id]
      )
    }

    const [updatedRows] = await pool.execute(
      `SELECT
         o.id,
         o.listing_id,
         o.status,
         o.order_no,
         o.amount,
         o.created_at,
         COALESCE(NULLIF(buyer.phone, ''), buyer.username) AS buyer_name,
         COALESCE(NULLIF(seller.phone, ''), NULLIF(seller.username, ''), o.seller_name) AS seller_name
       FROM orders o
       JOIN users buyer ON buyer.id = o.buyer_id
       LEFT JOIN users seller ON seller.id = o.seller_id
       WHERE o.id = ?
       LIMIT 1`,
      [orderId]
    )

    res.json({
      message: '订单已关闭',
      order: updatedRows[0]
    })
    await recordAdminOperationSafely({
      operatorUserId: req.auth?.userId,
      operatorName: req.auth?.username,
      module: 'order',
      action: 'close_order',
      targetType: 'order',
      targetId: orderId,
      targetLabel: currentOrder.order_no || `订单 #${orderId}`,
      beforeSnapshot: currentOrder,
      afterSnapshot: updatedRows[0],
      remark: '后台关闭订单'
    })
  } catch (error) {
    console.error('[admin] close order failed', error)
    res.status(500).json({ message: '关闭订单失败' })
  }
  }
)

app.get('/api/admin/orders', authRequired, adminOnly, async (req, res) => {
  const page = Math.max(1, Number(req.query?.page || 1) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(req.query?.pageSize || 20) || 20))
  const offset = (page - 1) * pageSize
  const keyword = sanitizeAdminKeyword(req.query?.keyword)
  const date = sanitizeAdminDate(req.query?.date)
  const nextDate = getNextAdminDate(date)

  try {
    const whereParts = []
    const params = []

    if (keyword) {
      whereParts.push(`(
        o.order_no LIKE ?
        OR o.listing_title LIKE ?
        OR buyer.phone LIKE ?
        OR buyer.username LIKE ?
        OR seller.phone LIKE ?
        OR seller.username LIKE ?
      )`)
      params.push(...Array(6).fill(`%${keyword}%`))
    }
    if (date && nextDate) {
      whereParts.push('o.created_at >= ? AND o.created_at < ?')
      params.push(`${date} 00:00:00`, `${nextDate} 00:00:00`)
    }

    const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : ''

    const [[countRow]] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM orders o
       JOIN users buyer ON buyer.id = o.buyer_id
       LEFT JOIN users seller ON seller.id = o.seller_id
       ${whereSql}`,
      params
    )
    const [rows] = await pool.query(
      `SELECT
         o.id,
         o.order_no,
         o.status,
         o.amount,
         o.created_at,
         COALESCE(NULLIF(buyer.phone, ''), buyer.username) AS buyer_name,
         COALESCE(NULLIF(seller.phone, ''), NULLIF(seller.username, ''), o.seller_name) AS seller_name
       FROM orders o
       JOIN users buyer ON buyer.id = o.buyer_id
       LEFT JOIN users seller ON seller.id = o.seller_id
       ${whereSql}
       ORDER BY o.id DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      params
    )
    res.json({
      total: Number(countRow?.total || 0),
      page,
      pageSize,
      keyword,
      date,
      list: rows
    })
  } catch (error) {
    console.error('[admin] orders list failed', error)
    res.status(500).json({ message: '获取订单列表失败' })
  }
})

app.put(
  '/api/admin/listings/:id/deactivate',
  authRequired,
  adminOnly,
  requireStepUpAuth(ADMIN_STEP_UP_POLICIES.deactivateListing),
  async (req, res) => {
  const listingId = Math.max(0, Number(req.params?.id || 0) || 0)

  if (!listingId) {
    return res.status(400).json({ message: '无效的商品ID' })
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
         l.id,
         COALESCE(NULLIF(owner.phone, ''), NULLIF(owner.username, ''), l.owner_name) AS owner_name,
         l.listing_status,
         l.rent_price,
         l.published_at,
         TRIM(
           CONCAT(
             IFNULL(NULLIF(l.rank_name, ''), '未命名商品'),
             ' / ',
             IFNULL(NULLIF(l.login_method, ''), '未知方式')
           )
         ) AS title
       FROM listings l
       LEFT JOIN users owner ON owner.id = l.owner_user_id
       WHERE l.id = ?
       LIMIT 1`,
      [listingId]
    )

    if (!rows.length) {
      return res.status(404).json({ message: '商品不存在' })
    }

    const currentListing = rows[0]
    const currentStatus = String(currentListing.listing_status || '')

    if (currentStatus === 'inactive') {
      return res.json({
        message: '商品已处于下架状态',
        listing: currentListing
      })
    }

    if (['sold_out', 'rented'].includes(currentStatus)) {
      return res.status(400).json({ message: '当前商品状态不支持后台下架' })
    }

    await pool.execute(
      'UPDATE listings SET listing_status = ? WHERE id = ?',
      ['inactive', listingId]
    )
    await invalidateListingDetailCache(listingId)

    const [updatedRows] = await pool.execute(
      `SELECT
         l.id,
         COALESCE(NULLIF(owner.phone, ''), NULLIF(owner.username, ''), l.owner_name) AS owner_name,
         l.listing_status,
         l.rent_price,
         l.published_at,
         TRIM(
           CONCAT(
             IFNULL(NULLIF(l.rank_name, ''), '未命名商品'),
             ' / ',
             IFNULL(NULLIF(l.login_method, ''), '未知方式')
           )
         ) AS title
       FROM listings l
       LEFT JOIN users owner ON owner.id = l.owner_user_id
       WHERE l.id = ?
       LIMIT 1`,
      [listingId]
    )

    res.json({
      message: '商品已下架',
      listing: updatedRows[0]
    })
    await recordAdminOperationSafely({
      operatorUserId: req.auth?.userId,
      operatorName: req.auth?.username,
      module: 'listing',
      action: 'deactivate_listing',
      targetType: 'listing',
      targetId: listingId,
      targetLabel: currentListing.title || `商品 #${listingId}`,
      beforeSnapshot: currentListing,
      afterSnapshot: updatedRows[0],
      remark: '后台下架商品'
    })
  } catch (error) {
    console.error('[admin] deactivate listing failed', error)
    res.status(500).json({ message: '商品下架失败' })
  }
  }
)

app.get('/api/admin/listings', authRequired, adminOnly, async (req, res) => {
  const page = Math.max(1, Number(req.query?.page || 1) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(req.query?.pageSize || 20) || 20))
  const offset = (page - 1) * pageSize
  const keyword = sanitizeAdminKeyword(req.query?.keyword)
  const date = sanitizeAdminDate(req.query?.date)
  const nextDate = getNextAdminDate(date)

  try {
    const whereParts = []
    const params = []

    if (keyword) {
      whereParts.push(`(
        l.owner_name LIKE ?
        OR owner.phone LIKE ?
        OR owner.username LIKE ?
        OR l.listing_no LIKE ?
        OR l.rank_name LIKE ?
        OR l.login_method LIKE ?
        OR l.listing_status LIKE ?
      )`)
      params.push(...Array(7).fill(`%${keyword}%`))
    }
    if (date && nextDate) {
      whereParts.push('l.published_at >= ? AND l.published_at < ?')
      params.push(`${date} 00:00:00`, `${nextDate} 00:00:00`)
    }

    const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : ''

    const [[countRow]] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM listings l
       LEFT JOIN users owner ON owner.id = l.owner_user_id
       ${whereSql}`,
      params
    )
    const [rows] = await pool.query(
      `SELECT
         l.id,
         COALESCE(NULLIF(owner.phone, ''), NULLIF(owner.username, ''), l.owner_name) AS owner_name,
         l.listing_status,
         l.rent_price,
         l.published_at,
         TRIM(
           CONCAT(
             IFNULL(NULLIF(l.rank_name, ''), '未命名商品'),
             ' / ',
             IFNULL(NULLIF(l.login_method, ''), '未知方式')
           )
         ) AS title
       FROM listings l
       LEFT JOIN users owner ON owner.id = l.owner_user_id
       ${whereSql}
       ORDER BY l.id DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      params
    )
    res.json({
      total: Number(countRow?.total || 0),
      page,
      pageSize,
      keyword,
      date,
      list: rows
    })
  } catch (error) {
    console.error('[admin] listings list failed', error)
    res.status(500).json({ message: '获取商品列表失败' })
  }
})

app.get('/api/admin/review/listings', authRequired, adminOnly, async (req, res) => {
  const page = Math.max(1, Number(req.query?.page || 1) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(req.query?.pageSize || 20) || 20))
  const offset = (page - 1) * pageSize
  const keyword = sanitizeAdminKeyword(req.query?.keyword)
  const date = sanitizeAdminDate(req.query?.date)
  const nextDate = getNextAdminDate(date)
  const reviewStatus = sanitizeAdminSelectValue(req.query?.status, ['all', 'pending', 'approved', 'rejected'], 'pending')

  try {
    const whereParts = []
    const params = []

    if (reviewStatus && reviewStatus !== 'all') {
      whereParts.push('l.review_status = ?')
      params.push(reviewStatus)
    }
    if (keyword) {
      whereParts.push(`(
        l.owner_name LIKE ?
        OR owner.phone LIKE ?
        OR owner.username LIKE ?
        OR l.listing_no LIKE ?
        OR l.rank_name LIKE ?
        OR l.login_method LIKE ?
      )`)
      params.push(...Array(6).fill(`%${keyword}%`))
    }
    if (date && nextDate) {
      whereParts.push('l.published_at >= ? AND l.published_at < ?')
      params.push(`${date} 00:00:00`, `${nextDate} 00:00:00`)
    }

    const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : ''

    const [[countRow]] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM listings l
       LEFT JOIN users owner ON owner.id = l.owner_user_id
       ${whereSql}`,
      params
    )
    const [rows] = await pool.query(
      `SELECT
         l.id,
         l.listing_no,
         COALESCE(NULLIF(owner.phone, ''), NULLIF(owner.username, ''), l.owner_name) AS owner_name,
         owner.phone AS owner_phone,
         l.listing_status,
         l.review_status,
         l.review_reason,
         l.reviewed_at,
         l.rent_price,
         l.published_at,
         TRIM(
           CONCAT(
             IFNULL(NULLIF(l.rank_name, ''), '未命名商品'),
             ' / ',
             IFNULL(NULLIF(l.login_method, ''), '未知方式')
           )
         ) AS title
       FROM listings l
       LEFT JOIN users owner ON owner.id = l.owner_user_id
       ${whereSql}
       ORDER BY
         CASE
           WHEN l.review_status = 'pending' THEN 0
           WHEN l.review_status = 'rejected' THEN 1
           ELSE 2
         END ASC,
         l.id DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      params
    )
    res.json({
      total: Number(countRow?.total || 0),
      page,
      pageSize,
      keyword,
      date,
      status: reviewStatus,
      list: rows
    })
  } catch (error) {
    console.error('[admin] review listings list failed', error)
    res.status(500).json({ message: '获取审核商品列表失败' })
  }
})

app.get('/api/admin/review/listings/:id', authRequired, adminOnly, async (req, res) => {
  const listingId = Math.max(0, Number(req.params?.id || 0) || 0)

  if (!listingId) {
    return res.status(400).json({ message: '无效的商品ID' })
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
         l.id, l.listing_no, l.owner_user_id, l.owner_name, owner.phone AS owner_phone,
         l.insurance_level, l.weight_level, l.deposit, l.base_ratio, l.login_method,
         l.energy_level, l.hafu_coin, l.rent_price, l.rent_days, l.login_time_range, l.daily_cost,
         l.secret_kd, l.character_level, l.operator_appearance, l.gold_skin, l.rank_name,
         l.knife_skin, l.weapon_skin, l.region, l.face_verified, l.dive_level, l.decontamination_chamber_level,
         l.listing_status, l.review_status, l.review_reason, l.reviewed_by, l.reviewed_at,
         reviewer.username AS reviewer_name,
         l.remark, l.ban_record, l.ban_video_url, l.published_at, l.created_at
       FROM listings l
       LEFT JOIN users owner ON owner.id = l.owner_user_id
       LEFT JOIN users reviewer ON reviewer.id = l.reviewed_by
       WHERE l.id = ?
       LIMIT 1`,
      [listingId]
    )

    if (!rows.length) {
      return res.status(404).json({ message: '商品不存在' })
    }

    const [items] = await pool.execute(
      `SELECT item_key, item_name, item_mode, quantity, unit_price, total_price
       FROM listing_items
       WHERE listing_id = ?
       ORDER BY id ASC`,
      [listingId]
    )
    const [images] = await pool.execute(
      `SELECT image_url
       FROM listing_images
       WHERE listing_id = ?
       ORDER BY ${getListingImagesOrderSql()}`,
      [listingId]
    )
    const banImages = await fetchListingBanImages(pool, listingId)
    res.json(buildListingDetailPayload(rows[0], items, images, banImages, { includeBanMedia: true }))
  } catch (error) {
    console.error('[admin] review listing detail failed', error)
    res.status(500).json({ message: '获取审核商品详情失败' })
  }
})

app.put(
  '/api/admin/review/listings/:id/approve',
  authRequired,
  adminOnly,
  requireStepUpAuth(ADMIN_STEP_UP_POLICIES.approveListing),
  async (req, res) => {
  const listingId = Math.max(0, Number(req.params?.id || 0) || 0)
  const remark = sanitizeAdminRemark(req.body?.remark)

  if (!listingId) {
    return res.status(400).json({ message: '无效的商品ID' })
  }

  try {
    const currentListing = await getAdminListingSummaryById(pool, listingId)
    if (!currentListing) {
      return res.status(404).json({ message: '商品不存在' })
    }
    if (['sold_out', 'rented'].includes(String(currentListing.listing_status || ''))) {
      return res.status(400).json({ message: '当前商品状态不支持审核通过' })
    }
    if (currentListing.review_status === 'approved' && currentListing.listing_status === 'active') {
      return res.json({
        message: '商品已审核通过',
        listing: currentListing
      })
    }

    await pool.execute(
      `UPDATE listings
       SET listing_status = 'active',
           review_status = 'approved',
           reviewed_by = ?,
           reviewed_at = NOW(),
           review_reason = ?
       WHERE id = ?`,
      [req.auth.userId, remark || null, listingId]
    )
    await invalidateListingDetailCache(listingId)

    const updatedListing = await getAdminListingSummaryById(pool, listingId)
    res.json({
      message: '商品审核已通过',
      listing: updatedListing
    })
    await recordAdminOperationSafely({
      operatorUserId: req.auth?.userId,
      operatorName: req.auth?.username,
      module: 'review',
      action: 'approve_listing',
      targetType: 'listing',
      targetId: listingId,
      targetLabel: updatedListing?.title || currentListing.title || `商品 #${listingId}`,
      beforeSnapshot: currentListing,
      afterSnapshot: updatedListing,
      remark: remark || '审核通过'
    })
  } catch (error) {
    console.error('[admin] approve listing failed', error)
    res.status(500).json({ message: '审核通过失败' })
  }
  }
)

app.put(
  '/api/admin/review/listings/:id/reject',
  authRequired,
  adminOnly,
  requireStepUpAuth(ADMIN_STEP_UP_POLICIES.rejectListing),
  async (req, res) => {
  const listingId = Math.max(0, Number(req.params?.id || 0) || 0)
  const reason = sanitizeAdminRemark(req.body?.reason)

  if (!listingId) {
    return res.status(400).json({ message: '无效的商品ID' })
  }
  if (!reason) {
    return res.status(400).json({ message: '请填写驳回原因' })
  }

  try {
    const currentListing = await getAdminListingSummaryById(pool, listingId)
    if (!currentListing) {
      return res.status(404).json({ message: '商品不存在' })
    }
    if (['sold_out', 'rented'].includes(String(currentListing.listing_status || ''))) {
      return res.status(400).json({ message: '当前商品状态不支持驳回' })
    }

    await pool.execute(
      `UPDATE listings
       SET listing_status = 'inactive',
           review_status = 'rejected',
           reviewed_by = ?,
           reviewed_at = NOW(),
           review_reason = ?
       WHERE id = ?`,
      [req.auth.userId, reason, listingId]
    )
    await invalidateListingDetailCache(listingId)

    const updatedListing = await getAdminListingSummaryById(pool, listingId)
    res.json({
      message: '商品已驳回',
      listing: updatedListing
    })
    await createUserNotificationSafely({
      userId: updatedListing?.owner_user_id || currentListing?.owner_user_id,
      category: 'listing_review',
      title: '商品审核未通过',
      content: `${updatedListing?.title || currentListing?.title || `商品 #${listingId}`} 审核未通过，原因：${reason}。请修改后重新提交审核。`,
      relatedType: 'listing',
      relatedId: listingId
    })
    await recordAdminOperationSafely({
      operatorUserId: req.auth?.userId,
      operatorName: req.auth?.username,
      module: 'review',
      action: 'reject_listing',
      targetType: 'listing',
      targetId: listingId,
      targetLabel: updatedListing?.title || currentListing.title || `商品 #${listingId}`,
      beforeSnapshot: currentListing,
      afterSnapshot: updatedListing,
      remark: reason
    })
  } catch (error) {
    console.error('[admin] reject listing failed', error)
    res.status(500).json({ message: '驳回商品失败' })
  }
  }
)

app.get('/api/admin/operation-logs', authRequired, adminOnly, async (req, res) => {
  const page = Math.max(1, Number(req.query?.page || 1) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(req.query?.pageSize || 20) || 20))
  const offset = (page - 1) * pageSize
  const keyword = sanitizeAdminKeyword(req.query?.keyword)
  const date = sanitizeAdminDate(req.query?.date)
  const nextDate = getNextAdminDate(date)
  const moduleName = sanitizeAdminSelectValue(req.query?.module, ['all', 'user', 'order', 'listing', 'review', 'security', 'config', 'feedback', 'wallet'], 'all')

  try {
    const whereParts = []
    const params = []

    if (moduleName && moduleName !== 'all') {
      whereParts.push('module = ?')
      params.push(moduleName)
    }
    if (keyword) {
      whereParts.push(`(
        operator_name LIKE ?
        OR action LIKE ?
        OR target_type LIKE ?
        OR target_label LIKE ?
        OR remark LIKE ?
      )`)
      params.push(...Array(5).fill(`%${keyword}%`))
    }
    if (date && nextDate) {
      whereParts.push('created_at >= ? AND created_at < ?')
      params.push(`${date} 00:00:00`, `${nextDate} 00:00:00`)
    }

    const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : ''

    const [[countRow]] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM admin_operation_logs
       ${whereSql}`,
      params
    )
    const [rows] = await pool.query(
      `SELECT
         id,
         operator_user_id,
         operator_name,
         module,
         action,
         target_type,
         target_id,
         target_label,
         before_snapshot,
         after_snapshot,
         remark,
         created_at
       FROM admin_operation_logs
       ${whereSql}
       ORDER BY id DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      params
    )
    res.json({
      total: Number(countRow?.total || 0),
      page,
      pageSize,
      keyword,
      date,
      module: moduleName,
      list: rows
    })
  } catch (error) {
    console.error('[admin] operation logs list failed', error)
    res.status(500).json({ message: '获取操作日志失败' })
  }
})
}
