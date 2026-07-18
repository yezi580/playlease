/**
 * 商品请求载荷与必填字段的输入校验辅助逻辑。
 */

import { REGION_OPTIONS, buildRegionText } from '../../constants/regionData.js'
import { ALLOWED_COMPENSATION_PLAN_VALUES } from '../../constants/compensationPlans.js'

const requiredFields = [
  'ownerName',
  'sellerContactWechat',
  'insuranceLevel',
  'compensationPlan',
  'weightLevel',
  'deposit',
  'loginMethod',
  'energyLevel',
  'hafuCoin',
  'loginTimeRange',
  'characterLevel',
  'rank',
  'region',
  'faceVerified',
  'diveLevel',
  'seyedUnlocked'
]

const INSURANCE_LEVEL_MAP = Object.freeze({
  '基础（1*2）': '2格',
  '进阶（2*2）': '4格',
  '高级（2*3）': '6格',
  '顶级（3*3）': '9格',
  '2': '2格',
  '4': '4格',
  '6': '6格',
  '9': '9格',
  '2格': '2格',
  '4格': '4格',
  '6格': '6格',
  '9格': '9格'
})
const ALLOWED_INSURANCE_LEVELS = new Set(['2格', '4格', '6格', '9格'])
const ALLOWED_LEVELS = new Set(['4级', '5级', '6级', '7级'])
const ALLOWED_LOGIN_METHODS = new Set(['QQ账密', '微信扫码', 'steam国服', 'steam国际服'])
const ALLOWED_RANKS = new Set(['无', '青铜', '白银', '黄金', '铂金', '钻石', '黑鹰', '巅峰'])
const ALLOWED_BOOLEAN_TEXT = new Set(['是', '否'])
const ALLOWED_DIVE_LEVELS = new Set(['0', '1', '2', '3'])
const LOGIN_TIME_RANGE_REGEX = /^([01]\d|2[0-3]):00-([01]\d|2[0-3]):00$/
const WECHAT_ID_REGEX = /^[a-zA-Z][-_a-zA-Z0-9]{5,19}$/
const VALID_REGION_TEXTS = new Set(
  REGION_OPTIONS.flatMap((item) => item.cities.map((city) => buildRegionText(item.province, city)))
)
const ALLOWED_OPERATOR_APPEARANCES = new Set([
  '红狼-蚀金玫瑰',
  '威龙-凌霄戍卫',
  '骇爪-水墨云图',
  '骇爪-维什戴尔',
  '露娜-黑·天际线',
  '佐娅-能天使',
  '威龙-吴彦祖联动',
  '威龙-蛟龙特战队'
])
const DEFAULT_KNIFE_SKINS = ['赤枭', '怜悯', '影锋', '黑海', '北极星', '信条', '龙牙', '暗星', '坠星者', '挽歌']
const DEFAULT_WEAPON_SKINS = [
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

function normalizeAllowedOptionList(value, fallback = []) {
  if (!Array.isArray(value)) return [...fallback]
  const list = value
    .map((item) => String(item || '').trim().slice(0, 40))
    .filter(Boolean)
  return list.length ? Array.from(new Set(list)) : [...fallback]
}

function getAllowedKnifeSkinSet(businessSettings) {
  const list = normalizeAllowedOptionList(
    businessSettings?.listingAppearanceOptions?.knifeSkins,
    DEFAULT_KNIFE_SKINS
  )
  return new Set(list)
}

function getAllowedWeaponSkinSet(businessSettings) {
  const list = normalizeAllowedOptionList(
    businessSettings?.listingAppearanceOptions?.weaponSkins,
    DEFAULT_WEAPON_SKINS
  )
  return new Set(list)
}

export function validateRequiredPayload(payload) {
  for (const field of requiredFields) {
    const value = payload[field]
    if (value === undefined || value === null || String(value).trim() === '') {
      return field
    }
  }
  return null
}

export function normalizeListingItemMode(value, listingItemModes = new Set(['sale', 'gift'])) {
  const nextValue = String(value || 'sale').trim().toLowerCase()
  return listingItemModes.has(nextValue) ? nextValue : 'sale'
}

export function normalizeInsuranceLevel(value) {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  return INSURANCE_LEVEL_MAP[normalized] || normalized
}

function isNonNegativeIntegerValue(value) {
  if (value === undefined || value === null || String(value).trim() === '') return false
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0
}

function isValidDecimalValue(value, digits = 1) {
  if (value === undefined || value === null || String(value).trim() === '') return false
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return false
  const text = String(value).trim()
  const decimalPart = text.split('.')[1] || ''
  return decimalPart.length <= digits
}

function splitMultiSelectText(value) {
  return String(value || '')
    .split('、')
    .map((item) => item.trim())
    .filter(Boolean)
}

function validateMultiSelectWhitelist(value, allowedSet, fieldLabel) {
  const items = splitMultiSelectText(value)
  for (const item of items) {
    if (!allowedSet.has(item)) {
      return `${fieldLabel}存在非法选项：${item}`
    }
  }
  return null
}

function validateListingImages(imagesPayload, options) {
  const {
    maxListingImageCount,
    maxImageUrlLength,
    imageDataUrlRegex,
    imageHttpUrlRegex,
    listingImageUploadUrlRegex
  } = options

  if (imagesPayload === undefined || imagesPayload === null) {
    return '请至少上传1张商品图片'
  }

  if (!Array.isArray(imagesPayload)) {
    return '商品图片格式不合法'
  }

  if (imagesPayload.length === 0) {
    return '请至少上传1张商品图片'
  }

  if (imagesPayload.length > maxListingImageCount) {
    return `商品图片最多上传${maxListingImageCount}张`
  }

  for (let index = 0; index < imagesPayload.length; index += 1) {
    const imageValue = String(imagesPayload[index] || '').trim()
    if (!imageValue) {
      return `商品图片第${index + 1}张为空`
    }

    if (imageValue.length > maxImageUrlLength) {
      return `商品图片第${index + 1}张超出大小限制`
    }

    const isValidDataUrl = imageDataUrlRegex.test(imageValue)
    const isValidHttpUrl = imageHttpUrlRegex.test(imageValue)
    const isValidUploadedUrl = listingImageUploadUrlRegex.test(imageValue)
    if (!isValidDataUrl && !isValidHttpUrl && !isValidUploadedUrl) {
      return `商品图片第${index + 1}张格式不合法`
    }
  }

  return null
}

function normalizeBanImagesPayload(banImagesPayload) {
  if (banImagesPayload === undefined || banImagesPayload === null) {
    return []
  }
  if (!Array.isArray(banImagesPayload)) {
    return null
  }
  return banImagesPayload.map((item) => String(item || '').trim()).filter(Boolean)
}

function validateBanMediaPayload(payload, options) {
  const { maxBanImageCount, banImageUploadUrlRegex, banVideoUploadUrlRegex } = options
  const banRecord = String(payload.banRecord || '').trim()
  const banImages = normalizeBanImagesPayload(payload.banImages)
  const banVideo = String(payload.banVideo || '').trim()

  if (banImages === null) {
    return '处罚截图格式不合法'
  }

  if (banImages.length > maxBanImageCount) {
    return `处罚截图最多上传${maxBanImageCount}张`
  }

  for (let index = 0; index < banImages.length; index += 1) {
    if (!banImageUploadUrlRegex.test(banImages[index])) {
      return `处罚截图第${index + 1}张地址不合法`
    }
  }

  if (banVideo && !banVideoUploadUrlRegex.test(banVideo)) {
    return '封禁记录视频地址不合法'
  }

  if (banRecord === '有' && banImages.length === 0 && !banVideo) {
    return '有封禁记录时至少上传处罚截图或视频'
  }

  if (banRecord === '无' && !banVideo) {
    return '无封禁记录时必须上传视频'
  }

  if (banRecord === '无' && banImages.length > 0) {
    return '无封禁记录时不能同时提交处罚截图'
  }

  return null
}

function normalizeBanRecord(value) {
  if (value === true || value === 1) return '有'
  if (value === false || value === 0) return '无'

  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return '无'

  if (['有', '有封禁记录', '是', '1', 'true', 'yes'].includes(normalized)) {
    return '有'
  }

  if (['无', '无封禁记录', '否', '0', 'false', 'no'].includes(normalized)) {
    return '无'
  }

  if (normalized.includes('有') && normalized.includes('封禁')) {
    return '有'
  }

  return '无'
}

export function toBanRecordFlag(value) {
  return normalizeBanRecord(value) === '有' ? 1 : 0
}

export function validateListingPayload(payload, options = {}) {
  const {
    saleItemConfig = {},
    listingItemModes = new Set(['sale', 'gift']),
    businessSettings
  } = options

  const insuranceLevel = normalizeInsuranceLevel(payload.insuranceLevel)
  if (!ALLOWED_INSURANCE_LEVELS.has(insuranceLevel)) {
    return '保险等级不合法'
  }

  const compensationPlan = String(payload.compensationPlan || '').trim()
  if (!ALLOWED_COMPENSATION_PLAN_VALUES.has(compensationPlan)) {
    return '保险赔付方案不合法'
  }

  const weightLevel = String(payload.weightLevel || '').trim()
  if (!ALLOWED_LEVELS.has(weightLevel)) {
    return '负重等级不合法'
  }

  const energyLevel = String(payload.energyLevel || '').trim()
  if (!ALLOWED_LEVELS.has(energyLevel)) {
    return '体力等级不合法'
  }

  const loginMethod = String(payload.loginMethod || '').trim()
  if (!ALLOWED_LOGIN_METHODS.has(loginMethod)) {
    return '上号方式不合法'
  }

  const sellerContactWechat = String(payload.sellerContactWechat || '').trim()
  if (!WECHAT_ID_REGEX.test(sellerContactWechat)) {
    return '鍗栧寰俊鍙锋牸寮忎笉姝ｇ‘'
  }

  const rank = String(payload.rank || '').trim()
  if (!ALLOWED_RANKS.has(rank)) {
    return '账号段位不合法'
  }

  const faceVerified = String(payload.faceVerified || '').trim()
  if (!ALLOWED_BOOLEAN_TEXT.has(faceVerified)) {
    return '人脸归属本人字段不合法'
  }

  const seyedUnlocked = String(payload.seyedUnlocked || '').trim()
  if (!ALLOWED_BOOLEAN_TEXT.has(seyedUnlocked)) {
    return '解锁赛依德字段不合法'
  }

  const banRecord = String(payload.banRecord || '').trim()
  if (banRecord && !['有', '无'].includes(banRecord)) {
    return '封禁记录字段不合法'
  }

  const diveLevel = String(payload.diveLevel || '').trim()
  if (!ALLOWED_DIVE_LEVELS.has(diveLevel)) {
    return '潜水等级不合法'
  }

  if (!isNonNegativeIntegerValue(payload.deposit)) {
    return '押金必须为非负整数'
  }

  if (!isNonNegativeIntegerValue(payload.hafuCoin)) {
    return '哈夫币余额必须为非负整数'
  }

  if (!isNonNegativeIntegerValue(payload.characterLevel)) {
    return '账号等级必须为非负整数'
  }

  if (Number(payload.characterLevel) !== 60) {
    return '账号等级必须为60级'
  }

  if (payload.secretKd !== undefined && payload.secretKd !== null && String(payload.secretKd).trim() !== '') {
    if (!isValidDecimalValue(payload.secretKd, 1)) {
      return '绝密KD必须为非负数字，且最多保留1位小数'
    }
  }

  const loginTimeRange = String(payload.loginTimeRange || '').trim()
  if (!LOGIN_TIME_RANGE_REGEX.test(loginTimeRange)) {
    return '上号时间格式不合法'
  }

  const region = String(payload.region || '').trim()
  if (!VALID_REGION_TEXTS.has(region)) {
    return '所在地区不合法'
  }

  const operatorAppearanceMessage = validateMultiSelectWhitelist(payload.operatorAppearance, ALLOWED_OPERATOR_APPEARANCES, '干员外观')
  if (operatorAppearanceMessage) {
    return operatorAppearanceMessage
  }

  const knifeSkinMessage = validateMultiSelectWhitelist(payload.knifeSkin, getAllowedKnifeSkinSet(businessSettings), '刀皮')
  if (knifeSkinMessage) {
    return knifeSkinMessage
  }

  const weaponSkinMessage = validateMultiSelectWhitelist(payload.weaponSkin, getAllowedWeaponSkinSet(businessSettings), '武器皮肤')
  if (weaponSkinMessage) {
    return weaponSkinMessage
  }

  const imageValidationMessage = validateListingImages(payload.images, options)
  if (imageValidationMessage) {
    return imageValidationMessage
  }

  const banMediaValidationMessage = validateBanMediaPayload(payload, options)
  if (banMediaValidationMessage) {
    return banMediaValidationMessage
  }

  const items = payload.items && typeof payload.items === 'object' ? payload.items : {}
  for (const itemKey of Object.keys(items)) {
    if (!Object.prototype.hasOwnProperty.call(saleItemConfig, itemKey)) {
      return `额外物品字段不合法：${itemKey}`
    }
    const quantity = items[itemKey]?.quantity
    if (quantity === '' || quantity === undefined || quantity === null) continue
    if (!isNonNegativeIntegerValue(quantity)) {
      return `${saleItemConfig[itemKey].itemName} 数量必须为非负整数`
    }
    const itemMode = String(items[itemKey]?.itemMode || items[itemKey]?.mode || 'sale').trim().toLowerCase()
    if (!listingItemModes.has(itemMode)) {
      return `${saleItemConfig[itemKey].itemName} 方式仅支持出售或赠送`
    }
  }

  return null
}
