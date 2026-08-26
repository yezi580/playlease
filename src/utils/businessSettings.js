import { apiFetch } from './api.js'

const RENT_DAYS_THRESHOLD_M = 600
const RENT_DAYS_BELOW_THRESHOLD_DAILY_COST = 10
const RENT_DAYS_ABOVE_THRESHOLD_DAILY_COST = 20
const RENT_DAYS_BELOW_THRESHOLD_MAX = 30

const DEFAULT_BUSINESS_SETTINGS = Object.freeze({
  ratioRecommendation: {
    specialKnives: ['赤枭', '怜悯'],
    // 发布页基础比例填写区间的上下限
    baseRatioMin: 35,
    baseRatioMax: 120,
    // 2格/4格保险为固定比例，不区分刀皮枪皮
    grid2: 60,
    grid4: 55,
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
    { key: 'awmBullet', itemName: 'AWM子弹（发）', unitPriceInCent: 60, buyerUnitPriceInCent: 80, enabled: true },
    { key: 'barrettBullet', itemName: '巴雷特子弹（发）', remark: '指穿甲弹，别的不值钱', unitPriceInCent: 30, enabled: true },
    { key: 'bullet762x54R', itemName: '6级7.62×54R（组）', unitPriceInCent: 600, enabled: true },
    { key: 'bullet762x51', itemName: '6级7.62×51（组）', unitPriceInCent: 600, enabled: true },
    { key: 'bullet68x51', itemName: '6级6.8×51（组）', unitPriceInCent: 600, enabled: true },
    { key: 'helmetLv6', itemName: '6级头盔', unitPriceInCent: 200, buyerUnitPriceInCent: 250, enabled: true },
    { key: 'armorLv6', itemName: '6级护甲', unitPriceInCent: 200, buyerUnitPriceInCent: 250, enabled: true },
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

let cachedSettings = null
let loadingPromise = null

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_BUSINESS_SETTINGS))
}

function normalizeNumber(value, fallback, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY, integer = false } = {}) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  const bounded = Math.min(max, Math.max(min, parsed))
  return integer ? Math.round(bounded) : bounded
}

function normalizeString(value, fallback = '', maxLength = 200) {
  const normalized = String(value || '').trim().slice(0, maxLength)
  return normalized || fallback
}

function normalizeStringList(value, fallback = []) {
  if (!Array.isArray(value)) return [...fallback]
  const list = value.map((item) => normalizeString(item, '', 40)).filter(Boolean)
  return list.length ? Array.from(new Set(list)) : [...fallback]
}

function getLegacyBulletLv6Item(saleItems = []) {
  if (!Array.isArray(saleItems)) return null
  return saleItems.find((item) => String(item?.key || '') === 'bulletLv6') || null
}

function normalizeSaleItemDisplayName(itemKey, itemName, fallbackName) {
  const normalizedName = normalizeString(itemName, fallbackName, 40)
  return normalizedName
}

export function normalizeBusinessSettings(rawValue = {}) {
  const source = rawValue && typeof rawValue === 'object' ? rawValue : {}
  const defaults = cloneDefaults()
  const ratioSource = source.ratioRecommendation && typeof source.ratioRecommendation === 'object' ? source.ratioRecommendation : {}
  const appearanceSource = source.listingAppearanceOptions && typeof source.listingAppearanceOptions === 'object' ? source.listingAppearanceOptions : {}
  const listingSource = source.listingRecommendations && typeof source.listingRecommendations === 'object' ? source.listingRecommendations : {}
  const commissionSource = source.platformCommission && typeof source.platformCommission === 'object' ? source.platformCommission : {}
  const inviteRewardSource = source.inviteReward && typeof source.inviteReward === 'object' ? source.inviteReward : {}
  const discoverySource = source.discoveryThresholds && typeof source.discoveryThresholds === 'object' ? source.discoveryThresholds : {}
  const operationalSource = source.operationalThresholds && typeof source.operationalThresholds === 'object' ? source.operationalThresholds : {}
  const securitySource = source.securityThresholds && typeof source.securityThresholds === 'object' ? source.securityThresholds : {}
  const baseRatioMin = normalizeNumber(ratioSource.baseRatioMin, defaults.ratioRecommendation.baseRatioMin, { min: 1, max: 1000, integer: true })
  const baseRatioMax = normalizeNumber(ratioSource.baseRatioMax, defaults.ratioRecommendation.baseRatioMax, { min: 1, max: 1000, integer: true })
  // 下限不得高于上限，配置颠倒时整体回退默认区间
  const hasValidBaseRatioRange = baseRatioMin <= baseRatioMax
  return {
    ratioRecommendation: {
      specialKnives: normalizeStringList(ratioSource.specialKnives, defaults.ratioRecommendation.specialKnives),
      baseRatioMin: hasValidBaseRatioRange ? baseRatioMin : defaults.ratioRecommendation.baseRatioMin,
      baseRatioMax: hasValidBaseRatioRange ? baseRatioMax : defaults.ratioRecommendation.baseRatioMax,
      grid2: normalizeNumber(ratioSource.grid2, defaults.ratioRecommendation.grid2, { min: 1, max: 1000, integer: true }),
      grid4: normalizeNumber(ratioSource.grid4, defaults.ratioRecommendation.grid4, { min: 1, max: 1000, integer: true }),
      grid9: {
        specialKnife: normalizeNumber(ratioSource.grid9?.specialKnife, defaults.ratioRecommendation.grid9.specialKnife, { min: 1, max: 1000, integer: true }),
        otherKnife: normalizeNumber(ratioSource.grid9?.otherKnife, defaults.ratioRecommendation.grid9.otherKnife, { min: 1, max: 1000, integer: true }),
        noKnife: normalizeNumber(ratioSource.grid9?.noKnife, defaults.ratioRecommendation.grid9.noKnife, { min: 1, max: 1000, integer: true })
      },
      grid6: {
        specialKnife: normalizeNumber(ratioSource.grid6?.specialKnife, defaults.ratioRecommendation.grid6.specialKnife, { min: 1, max: 1000, integer: true }),
        otherKnife: normalizeNumber(ratioSource.grid6?.otherKnife, defaults.ratioRecommendation.grid6.otherKnife, { min: 1, max: 1000, integer: true }),
        noKnife: normalizeNumber(ratioSource.grid6?.noKnife, defaults.ratioRecommendation.grid6.noKnife, { min: 1, max: 1000, integer: true })
      }
    },
    listingAppearanceOptions: {
      operatorAppearances: normalizeStringList(appearanceSource.operatorAppearances, defaults.listingAppearanceOptions.operatorAppearances),
      knifeSkins: normalizeStringList(appearanceSource.knifeSkins, defaults.listingAppearanceOptions.knifeSkins),
      weaponSkins: normalizeStringList(appearanceSource.weaponSkins, defaults.listingAppearanceOptions.weaponSkins)
    },
    listingRecommendations: {
      depositMinYuan: normalizeNumber(listingSource.depositMinYuan, defaults.listingRecommendations.depositMinYuan, { min: 0, max: 999999, integer: true }),
      depositMaxYuan: normalizeNumber(listingSource.depositMaxYuan, defaults.listingRecommendations.depositMaxYuan, { min: 0, max: 999999, integer: true }),
      recommendDepositRatioPercent: normalizeNumber(listingSource.recommendDepositRatioPercent, defaults.listingRecommendations.recommendDepositRatioPercent, { min: 0, max: 1000 }),
      itemsDepositCoveragePercent: normalizeNumber(listingSource.itemsDepositCoveragePercent, defaults.listingRecommendations.itemsDepositCoveragePercent, { min: 0, max: 1000 })
    },
    platformCommission: {
      buyerServiceFeeRatePercent: normalizeNumber(commissionSource.buyerServiceFeeRatePercent, defaults.platformCommission.buyerServiceFeeRatePercent, { min: 0, max: 100 }),
      sellerServiceFeeRatePercent: normalizeNumber(commissionSource.sellerServiceFeeRatePercent, defaults.platformCommission.sellerServiceFeeRatePercent, { min: 0, max: 100 })
    },
    inviteReward: {
      buyerServiceFeeRewardRatePercent: normalizeNumber(
        inviteRewardSource.buyerServiceFeeRewardRatePercent,
        defaults.inviteReward.buyerServiceFeeRewardRatePercent,
        { min: 0, max: 100 }
      )
    },
    discoveryThresholds: {
      smallAmountHafuCoinMax: normalizeNumber(discoverySource.smallAmountHafuCoinMax, defaults.discoveryThresholds.smallAmountHafuCoinMax, { min: 0, max: 999999, integer: true }),
      highRatioBaseRatioMin: normalizeNumber(discoverySource.highRatioBaseRatioMin, defaults.discoveryThresholds.highRatioBaseRatioMin, { min: 0, max: 999999, integer: true }),
      homepageNewTagHours: normalizeNumber(discoverySource.homepageNewTagHours, defaults.discoveryThresholds.homepageNewTagHours, { min: 1, max: 9999, integer: true }),
      pendingPaymentTimeoutMinutes: normalizeNumber(discoverySource.pendingPaymentTimeoutMinutes, defaults.discoveryThresholds.pendingPaymentTimeoutMinutes, { min: 1, max: 1440, integer: true })
    },
    saleItems: defaults.saleItems.map((defaultItem) => {
      const matched = Array.isArray(source.saleItems)
        ? source.saleItems.find((item) => String(item?.key || '') === defaultItem.key)
        : null
      const legacyBulletLv6Item = ['bullet762x54R', 'bullet762x51', 'bullet68x51'].includes(defaultItem.key)
        ? getLegacyBulletLv6Item(source.saleItems)
        : null
      const priceSource = matched || legacyBulletLv6Item
      const enabledSource = matched || legacyBulletLv6Item
      return {
        key: defaultItem.key,
        itemName: normalizeSaleItemDisplayName(defaultItem.key, matched?.itemName, defaultItem.itemName),
        remark: defaultItem.remark,
        unitPriceInCent: normalizeNumber(priceSource?.unitPriceInCent, defaultItem.unitPriceInCent, { min: 0, max: 99999999, integer: true }),
        buyerUnitPriceInCent: normalizeNumber(matched?.buyerUnitPriceInCent, defaultItem.buyerUnitPriceInCent || 0, { min: 0, max: 99999999, integer: true }),
        enabled: enabledSource?.enabled === undefined ? defaultItem.enabled : Boolean(enabledSource?.enabled)
      }
    }),
    compensationPlans: defaults.compensationPlans.map((defaultPlan) => {
      const matched = Array.isArray(source.compensationPlans)
        ? source.compensationPlans.find((item) => String(item?.value || '') === defaultPlan.value)
        : null
      return {
        value: defaultPlan.value,
        title: normalizeString(matched?.title, defaultPlan.title, 20),
        shortLabel: normalizeString(matched?.shortLabel, defaultPlan.shortLabel, 60),
        feeRatePercent: normalizeNumber(matched?.feeRatePercent, defaultPlan.feeRatePercent, { min: 0, max: 100 }),
        payoutRatePercent: normalizeNumber(matched?.payoutRatePercent, defaultPlan.payoutRatePercent, { min: 0, max: 1000 }),
        description: normalizeString(matched?.description, defaultPlan.description, 500)
      }
    }),
    operationalThresholds: {
      listingImageLimit: normalizeNumber(operationalSource.listingImageLimit, defaults.operationalThresholds.listingImageLimit, { min: 1, max: 50, integer: true })
    },
    securityThresholds: {
      feedbackDailyLimitPerUser: normalizeNumber(securitySource.feedbackDailyLimitPerUser, defaults.securityThresholds.feedbackDailyLimitPerUser, { min: 1, max: 20, integer: true }),
      listingHotMinUniqueClickCount: normalizeNumber(securitySource.listingHotMinUniqueClickCount, defaults.securityThresholds.listingHotMinUniqueClickCount, { min: 1, max: 999999, integer: true }),
      smsDailyLimitPerPhone: normalizeNumber(securitySource.smsDailyLimitPerPhone, defaults.securityThresholds.smsDailyLimitPerPhone, { min: 1, max: 1000, integer: true }),
      smsDailyLimitPerIp: normalizeNumber(securitySource.smsDailyLimitPerIp, defaults.securityThresholds.smsDailyLimitPerIp, { min: 1, max: 5000, integer: true }),
      smsCodeTtlSeconds: normalizeNumber(securitySource.smsCodeTtlSeconds, defaults.securityThresholds.smsCodeTtlSeconds, { min: 60, max: 3600, integer: true }),
      smsSendIntervalSeconds: normalizeNumber(securitySource.smsSendIntervalSeconds, defaults.securityThresholds.smsSendIntervalSeconds, { min: 30, max: 3600, integer: true }),
      smsVerifyMaxAttempts: normalizeNumber(securitySource.smsVerifyMaxAttempts, defaults.securityThresholds.smsVerifyMaxAttempts, { min: 3, max: 20, integer: true }),
      smsVerifyLockSeconds: normalizeNumber(securitySource.smsVerifyLockSeconds, defaults.securityThresholds.smsVerifyLockSeconds, { min: 300, max: 86400, integer: true })
    }
  }
}

export async function fetchBusinessSettings(force = false) {
  if (cachedSettings && !force) return cachedSettings
  if (loadingPromise && !force) return loadingPromise

  loadingPromise = apiFetch('/api/business-settings/public')
    .then((data) => {
      cachedSettings = normalizeBusinessSettings(data?.settings || {})
      return cachedSettings
    })
    .catch((_error) => {
      cachedSettings = cloneDefaults()
      return cachedSettings
    })
    .finally(() => {
      loadingPromise = null
    })

  return loadingPromise
}

export function getCachedBusinessSettings() {
  return cachedSettings || cloneDefaults()
}

export function getEnabledSaleItems(settings = null) {
  return normalizeBusinessSettings(settings || getCachedBusinessSettings()).saleItems.filter((item) => item.enabled)
}

/**
 * 解析物品的买家侧结算单价（分）。
 * 买家价仅在高于卖家价时生效（买家侧升价），否则与卖家价一致。
 */
export function resolveBuyerUnitPriceInCent(saleItem, settings = null) {
  const item = saleItem?.unitPriceInCent !== undefined
    ? saleItem
    : getEnabledSaleItems(settings).find((entry) => entry.key === saleItem?.key)
  const sellerPrice = Math.max(0, Number(item?.unitPriceInCent || 0))
  const buyerPrice = Math.max(0, Number(item?.buyerUnitPriceInCent || 0))
  return buyerPrice > sellerPrice ? buyerPrice : sellerPrice
}

export function getKnifeSkinOptions(settings = null) {
  return normalizeBusinessSettings(settings || getCachedBusinessSettings()).listingAppearanceOptions.knifeSkins
}

export function getOperatorAppearanceOptions(settings = null) {
  return normalizeBusinessSettings(settings || getCachedBusinessSettings()).listingAppearanceOptions.operatorAppearances
}

export function getWeaponSkinOptions(settings = null) {
  return normalizeBusinessSettings(settings || getCachedBusinessSettings()).listingAppearanceOptions.weaponSkins
}

export function getCompensationPlanOption(value, settings = null) {
  const normalizedSettings = normalizeBusinessSettings(settings || getCachedBusinessSettings())
  return normalizedSettings.compensationPlans.find((item) => item.value === value)
    || normalizedSettings.compensationPlans.find((item) => item.value === 'basic')
    || normalizedSettings.compensationPlans[0]
}

export function calculateCompensationFeeAmount(amount, planValue, settings = null) {
  const plan = getCompensationPlanOption(planValue, settings)
  const normalizedAmount = Math.max(0, Number(amount || 0))
  return Math.floor(normalizedAmount * Number(plan?.feeRatePercent || 0) / 100)
}

export function formatPercentLabel(percent) {
  const normalized = Number(percent || 0)
  return normalized > 0 ? `${normalized}%` : '免费'
}

export function getBuyerRentLabel(settings = null) {
  const normalizedSettings = normalizeBusinessSettings(settings || getCachedBusinessSettings())
  const feeRateLabel = formatPercentLabel(normalizedSettings.platformCommission?.buyerServiceFeeRatePercent || 0)
  return `租金（含平台收取${feeRateLabel}手续费）`
}

export function getInviteRewardRuleText(settings = null) {
  const normalizedSettings = normalizeBusinessSettings(settings || getCachedBusinessSettings())
  const rewardRate = Number(normalizedSettings.inviteReward?.buyerServiceFeeRewardRatePercent || 0)
  return `永久返现：被邀请人每完成一笔订单，邀请人即可获得平台向买家收取服务费的${rewardRate}%作为返现`
}

export function getBaseRatioRange(settings = null) {
  const normalizedSettings = normalizeBusinessSettings(settings || getCachedBusinessSettings())
  return {
    min: Number(normalizedSettings.ratioRecommendation.baseRatioMin || DEFAULT_BUSINESS_SETTINGS.ratioRecommendation.baseRatioMin),
    max: Number(normalizedSettings.ratioRecommendation.baseRatioMax || DEFAULT_BUSINESS_SETTINGS.ratioRecommendation.baseRatioMax)
  }
}

/**
 * 2格/4格保险的固定推荐比例（不区分刀皮枪皮）。
 */
export function getSmallInsuranceBaseRatio(insuranceLevel, settings = null) {
  const normalizedSettings = normalizeBusinessSettings(settings || getCachedBusinessSettings())
  return Number(insuranceLevel === '2格'
    ? normalizedSettings.ratioRecommendation.grid2
    : normalizedSettings.ratioRecommendation.grid4)
}

export function calculateBaseRatio(gridSize, knifeSkinText, settings = null) {
  const normalizedSettings = normalizeBusinessSettings(settings || getCachedBusinessSettings())
  const ratioConfig = gridSize === 9 ? normalizedSettings.ratioRecommendation.grid9 : normalizedSettings.ratioRecommendation.grid6
  const knifeSkin = String(knifeSkinText || '')
  const hasSpecialKnife = normalizedSettings.ratioRecommendation.specialKnives.some((knife) => knifeSkin.includes(knife))
  const hasAnyKnife = knifeSkin.trim() !== ''
  if (hasSpecialKnife) return ratioConfig.specialKnife
  if (hasAnyKnife) return ratioConfig.otherKnife
  return ratioConfig.noKnife
}

function getRentDaysRecommendationStrategy(hafuCoin) {
  const numericHafuCoin = Math.max(0, Number(hafuCoin || 0))
  const isAboveThreshold = numericHafuCoin >= RENT_DAYS_THRESHOLD_M
  const recommendedDailyCost = isAboveThreshold
    ? RENT_DAYS_ABOVE_THRESHOLD_DAILY_COST
    : RENT_DAYS_BELOW_THRESHOLD_DAILY_COST
  const maxRentDays = isAboveThreshold ? 0 : RENT_DAYS_BELOW_THRESHOLD_MAX

  return {
    numericHafuCoin,
    recommendedDailyCost,
    maxRentDays
  }
}

export function getRecommendedDailyCost(hafuCoin, settings = null) {
  return getRentDaysRecommendationStrategy(hafuCoin).recommendedDailyCost
}

export function getRentDaysLimit(hafuCoin, settings = null) {
  return getRentDaysRecommendationStrategy(hafuCoin).maxRentDays
}

export function getRecommendedRentDays(hafuCoin, settings = null) {
  const { numericHafuCoin, recommendedDailyCost, maxRentDays } = getRentDaysRecommendationStrategy(hafuCoin)
  const rawRecommended = recommendedDailyCost > 0 ? Math.floor(numericHafuCoin / recommendedDailyCost) : 0
  const normalizedRecommended = Math.max(1, rawRecommended || 1)
  return maxRentDays > 0 ? Math.min(maxRentDays, normalizedRecommended) : normalizedRecommended
}

export function getPendingPaymentTimeoutMinutes(settings = null) {
  const normalizedSettings = normalizeBusinessSettings(settings || getCachedBusinessSettings())
  return Number(normalizedSettings.discoveryThresholds.pendingPaymentTimeoutMinutes || 10)
}
