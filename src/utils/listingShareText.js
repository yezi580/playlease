/**
 * 商品分享文案构造：把列表卡片上的关键字段拼成一段可复制的纯文本摘要。
 * 目标格式示例：
 *   编号:202608131234 租期5天 保险9格 哈夫币74M 体力7级 负重7级 QQ账密 区服广东深圳
 *   段位黑鹰 等级60级 六级防具8件 AWM子弹30发 KD0.7 刀皮暗星,处刑者 备注：不要整理医疗箱等信息
 */

// 保险等级归一化为「N格」展示，兼容历史数据（如「顶级（3*3）」、「9」等写法）。
const INSURANCE_LEVEL_MAP = {
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

function toText(value) {
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

function normalizeInsurance(value) {
  const raw = toText(value)
  if (!raw) return ''
  return INSURANCE_LEVEL_MAP[raw] || raw
}

function toPositiveNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : 0
}

export function buildListingShareText(item) {
  if (!item) return ''
  const parts = []

  const listingNo = toText(item.listing_no) || toText(item.id)
  if (listingNo) parts.push(`编号:${listingNo}`)

  const rentDays = toPositiveNumber(item.rent_days)
  if (rentDays) parts.push(`租期${rentDays}天`)

  const insurance = normalizeInsurance(item.insurance_level)
  if (insurance) parts.push(`保险${insurance}`)

  const hafuCoin = toText(item.hafu_coin)
  if (hafuCoin) parts.push(`哈夫币${hafuCoin}M`)

  const energyLevel = toText(item.energy_level)
  if (energyLevel) parts.push(`体力${energyLevel}级`)

  const weightLevel = toText(item.weight_level)
  if (weightLevel) parts.push(`负重${weightLevel}级`)

  const loginMethod = toText(item.login_method)
  if (loginMethod) parts.push(loginMethod)

  const region = toText(item.region)
  if (region) parts.push(`区服${region}`)

  const rankName = toText(item.rank_name)
  if (rankName) parts.push(`段位${rankName}`)

  const characterLevel = toPositiveNumber(item.character_level)
  if (characterLevel) parts.push(`等级${characterLevel}级`)

  // 六级防具合并展示护甲+头盔总数，与分享示例中的「六级防具8件」保持一致。
  const defenseQty = toPositiveNumber(item.armor_lv6_qty) + toPositiveNumber(item.helmet_lv6_qty)
  if (defenseQty) parts.push(`六级防具${defenseQty}件`)

  const awmBullet = toText(item.awm_bullet_qty)
  if (awmBullet) parts.push(`AWM子弹${awmBullet}发`)

  const bulletLv6 = toText(item.bullet_lv6_qty)
  if (bulletLv6) parts.push(`6级子弹${bulletLv6}组`)

  const barrettBullet = toText(item.barrett_bullet_qty)
  if (barrettBullet) parts.push(`巴雷特子弹${barrettBullet}发`)

  const secretKd = toText(item.secret_kd)
  if (secretKd) parts.push(`KD${secretKd}`)

  const knifeSkin = toText(item.knife_skin)
  if (knifeSkin) parts.push(`刀皮${knifeSkin}`)

  const operatorAppearance = toText(item.operator_appearance)
  if (operatorAppearance) parts.push(`干员外观${operatorAppearance}`)

  const weaponSkin = toText(item.weapon_skin)
  if (weaponSkin) parts.push(`武器皮肤${weaponSkin}`)

  let text = parts.join(' ')
  const remark = toText(item.remark)
  if (remark) text += ` 备注：${remark}`
  return text
}
