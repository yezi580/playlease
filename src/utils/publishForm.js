import { formatPercentLabel } from './businessSettings.js'

export const MAX_BAN_IMAGE_SIZE = 5 * 1024 * 1024
export const MAX_BAN_VIDEO_SIZE = 100 * 1024 * 1024
export const MAX_LISTING_IMAGE_SIZE = 5 * 1024 * 1024
export const DEFAULT_COMPENSATION_PLAN = 'basic'
export const MIN_DEPOSIT_YUAN = 100
export const MAX_DEPOSIT_YUAN = 2000
export const MAX_LISTING_IMAGE_COUNT = 10
export const MAX_BAN_IMAGE_COUNT = 5

export const ITEM_MODE_OPTIONS = Object.freeze([
  { value: 'sale', label: '出售' },
  { value: 'gift', label: '赠送' }
])

export const LOGIN_METHOD_OPTIONS = Object.freeze(['QQ账密', '微信扫码', 'steam国服', 'steam国际服'])
export const INSURANCE_LEVEL_OPTIONS = Object.freeze(['2格', '4格', '6格', '9格'])
export const LEVEL_OPTIONS = Object.freeze(['4级', '5级', '6级', '7级'])
export const DIVE_LEVEL_OPTIONS = Object.freeze(['0', '1', '2', '3'])
export const DECONTAMINATION_CHAMBER_LEVEL_OPTIONS = Object.freeze(['0', '1', '2', '3'])
export const RANK_OPTIONS = Object.freeze(['无', '青铜', '白银', '黄金', '铂金', '钻石', '黑鹰', '巅峰'])
export const OPERATOR_APPEARANCE_OPTIONS = Object.freeze([
  '红狼-蚀金玫瑰',
  '威龙-凌霄戍卫',
  '骇爪-水墨云图',
  '骇爪-维什戴尔',
  '露娜-黑·天际线',
  '佐娅-能天使',
  '威龙-吴彦祖联动',
  '威龙-蛟龙特战队'
])
export const KNIFE_SKIN_OPTIONS = Object.freeze(['赤枭', '怜悯', '影锋', '黑海', '北极星', '信条', '龙牙', '暗星', '坠星者', '挽歌'])
export const WEAPON_SKIN_OPTIONS = Object.freeze([
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
])

export function createDefaultItems() {
  return {
    topCard: { quantity: '', mode: 'sale' },
    awmBullet: { quantity: '', mode: 'sale' },
    bulletLv6: { quantity: '', mode: 'sale' },
    bullet762x54R: { quantity: '', mode: 'sale' },
    bullet762x51: { quantity: '', mode: 'sale' },
    bullet68x51: { quantity: '', mode: 'sale' },
    barrettBullet: { quantity: '', mode: 'sale' },
    helmetLv6: { quantity: '', mode: 'sale' },
    armorLv6: { quantity: '', mode: 'sale' },
    coffeeBean: { quantity: '', mode: 'sale' },
    bulletPart: { quantity: '', mode: 'sale' }
  }
}

export function createDefaultPublishForm() {
  return {
    sellerContactWechat: '',
    insuranceLevel: '6格',
    compensationPlan: DEFAULT_COMPENSATION_PLAN,
    weightLevel: '7级',
    deposit: '',
    baseRatio: '',
    loginMethod: 'QQ账密',
    energyLevel: '7级',
    hafuCoin: '',
    rentDays: '',
    loginStartTime: '',
    loginEndTime: '',
    secretKd: '',
    characterLevel: '',
    rank: '无',
    region: '',
    regionProvince: '',
    regionCity: '',
    faceVerified: '',
    diveLevel: '0',
    decontaminationChamberLevel: '0',
    publishedAt: '',
    remark: '',
    banRecord: '',
    banImages: [],
    banVideo: null,
    images: [],
    items: createDefaultItems()
  }
}

export function splitMultiText(value) {
  return String(value || '')
    .split('、')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function normalizeInsuranceLevel(value) {
  const normalized = String(value || '').trim()
  const map = {
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
  }
  return map[normalized] || '6格'
}

export function splitLoginTimeRange(value) {
  const [start = '', end = ''] = String(value || '').split('-')
  return {
    start: start.trim(),
    end: end.trim()
  }
}

export function createDefaultFieldErrors() {
  return {
    sellerContactWechat: '',
    loginMethod: '',
    loginTimeRange: '',
    insuranceLevel: '',
    compensationPlan: '',
    energyLevel: '',
    weightLevel: '',
    diveLevel: '',
    decontaminationChamberLevel: '',
    banRecord: '',
    banMedia: '',
    faceVerified: '',
    characterLevel: '',
    rank: '',
    secretKd: '',
    region: '',
    hafuCoin: '',
    deposit: '',
    baseRatio: '',
    rentDays: '',
    images: ''
  }
}

export function mapCompensationPlanOptions(plans = []) {
  return plans.map((plan) => ({
    ...plan,
    feeRateLabel: formatPercentLabel(plan.feeRatePercent)
  }))
}

export function buildSaleItems(enabledSaleItems = []) {
  return enabledSaleItems.map((item) => ({
    key: item.key,
    name: item.itemName,
    priceInYuan: Number(item.unitPriceInCent || 0) / 100
  }))
}

export function getCurrentTimeText() {
  const now = new Date()
  const pad = (num) => String(num).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}
