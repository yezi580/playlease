/**
 * 商品领域辅助逻辑，处理定价、比例和商品编号生成。
 */

import { normalizeInsuranceLevel } from './listing-validator.js'

const RENT_DAYS_THRESHOLD_M = 600
const RENT_DAYS_BELOW_THRESHOLD_DAILY_COST = 10
const RENT_DAYS_ABOVE_THRESHOLD_DAILY_COST = 20
const RENT_DAYS_BELOW_THRESHOLD_MAX = 30

function calculateBuyerDisplayRatio(baseRatio) {
  const numericBaseRatio = Number(baseRatio || 0)
  if (!Number.isFinite(numericBaseRatio) || numericBaseRatio <= 0) return 0
  return numericBaseRatio - 6
}

export function calculateBuyerOrderRentPrice(hafuCoin, baseRatio, buyerServiceFeeRatePercent = 10) {
  let sellerRentPrice = Number(hafuCoin || 0)
  const numericBaseRatio = Number(baseRatio || 0)
  const normalizedRate = Math.max(0, Number(buyerServiceFeeRatePercent || 0))

  if (Number.isFinite(numericBaseRatio) && numericBaseRatio > 0) {
    const numericHafuCoin = Number(hafuCoin || 0)
    if (!Number.isFinite(numericHafuCoin) || numericHafuCoin <= 0) return 0
    sellerRentPrice = Math.round((numericHafuCoin * 10000) / numericBaseRatio)
  }

  if (!Number.isFinite(sellerRentPrice) || sellerRentPrice <= 0) return 0
  return sellerRentPrice + Math.floor(sellerRentPrice * normalizedRate / 100)
}

export function buildOrderListingTitle({ hafuCoin, rentDays, insuranceLevel } = {}) {
  const hafuCoinPart = hafuCoin != null && hafuCoin !== '' ? `${hafuCoin}M` : '未设置'
  const rentDaysPart = `${rentDays != null && rentDays !== '' ? rentDays : 0} 天`
  const insurancePart = String(insuranceLevel || '').trim() || '未设置保险'
  return `${hafuCoinPart} / ${rentDaysPart} / ${insurancePart}`
}

export function buildBuyerRentPriceSql(alias = 'l', buyerServiceFeeRatePercent = 10) {
  const normalizedRate = Math.max(0, Number(buyerServiceFeeRatePercent || 0))
  return `CASE
    WHEN COALESCE(${alias}.rent_price, 0) > 0
      THEN COALESCE(${alias}.rent_price, 0) + FLOOR(COALESCE(${alias}.rent_price, 0) * ${normalizedRate / 100})
    ELSE 0
  END`
}

function formatListingNoDatePart(date = new Date()) {
  const sourceDate = date instanceof Date ? date : new Date(date)
  const year = String(sourceDate.getFullYear())
  const month = String(sourceDate.getMonth() + 1).padStart(2, '0')
  const day = String(sourceDate.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

function buildListingNoCandidate(date = new Date()) {
  const datePart = formatListingNoDatePart(date)
  const randomPart = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  return `${datePart}${randomPart}`
}

async function isListingNoExists(db, listingNo) {
  const [rows] = await db.execute(
    'SELECT id FROM listings WHERE listing_no = ? LIMIT 1',
    [listingNo]
  )
  return rows.length > 0
}

export async function generateListingNo(db, date = new Date()) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidate = buildListingNoCandidate(date)
    if (!(await isListingNoExists(db, candidate))) {
      return candidate
    }
  }
  throw new Error('商品编号生成失败，请稍后重试')
}

export function createListingService({ baseRatioConfig, specialKnives, toUnsignedInteger }) {
  function calculateBaseRatioByGrid(gridSize, knifeSkinText) {
    const config = gridSize === 9 ? baseRatioConfig.grid9 : baseRatioConfig.grid6
    const knifeSkin = String(knifeSkinText || '')
    const hasSpecialKnife = specialKnives.some((knife) => knifeSkin.includes(knife))
    const hasAnyKnife = knifeSkin.trim() !== ''

    if (hasSpecialKnife) return config.specialKnife
    if (hasAnyKnife) return config.otherKnife
    return config.noKnife
  }

  function resolveRentDaysRecommendation(hafuCoinValue, runtimeSettings = null) {
    const numericHafuCoin = Math.max(0, Number(hafuCoinValue || 0))
    const isAboveThreshold = numericHafuCoin >= RENT_DAYS_THRESHOLD_M
    const recommendedDailyCost = isAboveThreshold
      ? RENT_DAYS_ABOVE_THRESHOLD_DAILY_COST
      : RENT_DAYS_BELOW_THRESHOLD_DAILY_COST
    const maxRentDays = isAboveThreshold ? 0 : RENT_DAYS_BELOW_THRESHOLD_MAX

    return {
      recommendedDailyCost,
      maxRentDays
    }
  }

  function computeListingDerivedValues(payload) {
    const runtimeSettings = arguments[1] && typeof arguments[1] === 'object' ? arguments[1] : null
    const ratioSettings = runtimeSettings?.ratioRecommendation && typeof runtimeSettings.ratioRecommendation === 'object'
      ? runtimeSettings.ratioRecommendation
      : null
    const insuranceLevel = normalizeInsuranceLevel(payload.insuranceLevel)
    const energyLevel = parseInt(String(payload.energyLevel || ''), 10) || 7
    const weightLevel = parseInt(String(payload.weightLevel || ''), 10) || 7
    const hafuCoin = toUnsignedInteger(payload.hafuCoin)
    const knifeSkin = String(payload.knifeSkin || '').trim()
    const weaponSkin = String(payload.weaponSkin || '').trim()
    const specialKnivesList = Array.isArray(ratioSettings?.specialKnives) && ratioSettings.specialKnives.length
      ? ratioSettings.specialKnives
      : specialKnives
    const resolvedBaseRatioConfig = ratioSettings
      ? {
          grid9: {
            specialKnife: Number(ratioSettings.grid9?.specialKnife || baseRatioConfig.grid9.specialKnife),
            otherKnife: Number(ratioSettings.grid9?.otherKnife || baseRatioConfig.grid9.otherKnife),
            noKnife: Number(ratioSettings.grid9?.noKnife || baseRatioConfig.grid9.noKnife)
          },
          grid6: {
            specialKnife: Number(ratioSettings.grid6?.specialKnife || baseRatioConfig.grid6.specialKnife),
            otherKnife: Number(ratioSettings.grid6?.otherKnife || baseRatioConfig.grid6.otherKnife),
            noKnife: Number(ratioSettings.grid6?.noKnife || baseRatioConfig.grid6.noKnife)
          }
        }
      : baseRatioConfig

    function calculateBaseRatioByRuntimeGrid(gridSize, knifeSkinText) {
      const config = gridSize === 9 ? resolvedBaseRatioConfig.grid9 : resolvedBaseRatioConfig.grid6
      const normalizedKnifeSkin = String(knifeSkinText || '')
      const hasSpecialKnife = specialKnivesList.some((knife) => normalizedKnifeSkin.includes(knife))
      const hasAnyKnife = normalizedKnifeSkin.trim() !== ''
      if (hasSpecialKnife) return config.specialKnife
      if (hasAnyKnife) return config.otherKnife
      return config.noKnife
    }

    let baseRatio = 0
    if (insuranceLevel === '2格' || insuranceLevel === '4格') {
      baseRatio = insuranceLevel === '2格'
        ? Number(ratioSettings?.grid2 || baseRatioConfig.grid2)
        : Number(ratioSettings?.grid4 || baseRatioConfig.grid4)
    } else {
      const gridSize = insuranceLevel === '9格' ? 9 : 6
      baseRatio = runtimeSettings
        ? calculateBaseRatioByRuntimeGrid(gridSize, knifeSkin)
        : calculateBaseRatioByGrid(gridSize, knifeSkin)
      baseRatio += 7 - energyLevel

      if (weightLevel <= 5) {
        baseRatio += 6 - weightLevel
      }

      if (hafuCoin >= 300) {
        baseRatio += Math.floor((hafuCoin - 300) / 100)
      }

      if (weaponSkin.includes('M7-棱镜攻势')) {
        baseRatio -= 1
      }
    }

    const { recommendedDailyCost, maxRentDays } = resolveRentDaysRecommendation(hafuCoin, runtimeSettings)
    const rawRecommendedRentDays = recommendedDailyCost > 0 ? Math.floor(hafuCoin / recommendedDailyCost) : 0
    const normalizedRentDays = Math.max(1, rawRecommendedRentDays || 1)
    const rentDays = maxRentDays > 0 ? Math.min(maxRentDays, normalizedRentDays) : normalizedRentDays
    const dailyCost = rentDays > 0 && hafuCoin > 0 ? Math.round(hafuCoin / rentDays) : 0
    const rentPrice = baseRatio > 0 ? Math.round((hafuCoin * 10000) / baseRatio) : 0

    return {
      baseRatio,
      dailyCost,
      rentDays,
      rentPrice,
      displayRatio: baseRatio - 6
    }
  }

  return {
    computeListingDerivedValues,
    resolveRentDaysRecommendation
  }
}
