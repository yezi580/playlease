/**
 * 金额格式化工具函数
 *
 * 统一处理前后端金额转换和显示：
 * - 数据库：存储分
 * - API返回：金额字段也使用分
 * - 前端展示：按需将分转换为元
 * - 计算过程：统一使用分，避免金额单位混乱
 */

function normalizeCentAmount(value) {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? amount : 0
}

function centToYuanNumber(value) {
  return normalizeCentAmount(value) / 100
}

/**
 * 格式化金额为人民币显示格式（默认整数）
 *
 * @param {number|string} value - 金额值（单位：分）
 * @param {number} decimals - 保留小数位数，默认0位（整数）
 * @returns {string} 格式化后的金额字符串，如 "1312"
 *
 * @example
 * formatMoney(131256)     // => "1313"  （1312.56元 → 四舍五入到元）
 * formatMoney(131234)     // => "1312"  （1312.34元 → 不进位）
 * formatMoney(12000)      // => "120"   （120元）
 * formatMoney(0)          // => "0"
 * formatMoney(null)       // => "0"
 */
export function formatMoney(value, decimals = 0) {
  const amount = centToYuanNumber(value)
  const formatted = amount.toFixed(decimals)
  return formatted.includes('.')
    ? formatted.replace(/0+$/, '').replace(/\.$/, '')
    : formatted
}

export function formatMoneyInteger(value) {
  return formatMoney(value, 0)
}

export function formatMoneyPrecise(value) {
  return formatMoney(value, 2)
}

export function formatMoneyFixed(value, decimals = 2) {
  const amount = centToYuanNumber(value)
  return amount.toFixed(decimals)
}

/**
 * 格式化金额并添加￥前缀
 *
 * @param {number|string} value - 金额值（单位：分）
 * @param {number} decimals - 保留小数位数，默认0位（整数）
 * @returns {string} 带￥符号的金额字符串，如 "￥1313"
 *
 * @example
 * formatMoneyWithSymbol(1312.56)  // => "￥1313"
 * formatMoneyWithSymbol(0)        // => "￥0"
 */
export function formatMoneyWithSymbol(value, decimals = 0) {
  return `￥${formatMoney(value, decimals)}`
}

/**
 * 安全地解析金额数值
 *
 * @param {*} value - 任意值
 * @returns {number} 解析后的数字，无效值返回0
 *
 * @example
 * parseAmount(131256)   // => 131256
 * parseAmount("131200") // => 131200
 * parseAmount(null)     // => 0
 * parseAmount("abc")    // => 0
 */
export function parseAmount(value) {
  return normalizeCentAmount(value)
}

/**
 * 计算租金（保留计算精度）
 *
 * 用于前端需要重新计算租金的场景，
 * 计算过程保留分精度，最终返回分。
 *
 * @param {number} hafuCoin - 哈夫币余额（M）
 * @param {number} baseRatio - 基础比例
 * @returns {number} 四舍五入后的整数分
 *
 * @example
 * calculateRentPrice(53, 44)  // => 12045  (120.45元 → 12045分)
 * calculateRentPrice(450, 47) // => 95745  (957.45元 → 95745分)
 */
export function calculateRentPrice(hafuCoin, baseRatio) {
  if (!baseRatio || baseRatio <= 0) return 0

  const precisePrice = (Number(hafuCoin || 0) * 10000) / baseRatio
  return Math.round(precisePrice)
}

export function calculateServiceFeeFromSellerRent(sellerRent, ratePercent = 10) {
  const normalizedRate = Math.max(0, Number(ratePercent || 0))
  return Math.floor(normalizeCentAmount(sellerRent) * normalizedRate / 100)
}

export function calculateBuyerRentFromSellerRent(sellerRent, ratePercent = 10) {
  const normalizedSellerRent = normalizeCentAmount(sellerRent)
  return normalizedSellerRent + calculateServiceFeeFromSellerRent(normalizedSellerRent, ratePercent)
}

export function calculateSellerIncomeRent(sellerRent, ratePercent = 10) {
  const normalizedSellerRent = normalizeCentAmount(sellerRent)
  return Math.max(0, normalizedSellerRent - calculateServiceFeeFromSellerRent(normalizedSellerRent, ratePercent))
}

/**
 * 计算物品总价（保留计算精度）
 *
 * @param {Array<{quantity: number, unit_price: number}>} items - 物品列表
 * @returns {number} 总价（单位：分）
 *
 * @example
 * calculateItemsTotal([
 *   { quantity: 10, unit_price: 60 },
 *   { quantity: 5, unit_price: 1000 }
 * ])  // => 5600  (10*0.6 + 5*10 = 56元 = 5600分)
 */
export function calculateItemsTotal(items) {
  if (!Array.isArray(items)) return 0

  const total = items.reduce((sum, item) => {
    const quantity = Number(item?.quantity || 0)
    const unitPrice = Number(item?.unit_price || 0)
    return sum + (quantity * unitPrice)
  }, 0)

  return Math.round(total)
}

/**
 * 格式化为中文大写金额（可选功能）
 *
 * @param {number|string} value - 金额值（单位：分）
 * @returns {string} 中文大写金额，如 "壹仟叁佰壹拾贰元整"
 *
 * @example
 * formatChineseAmount(131200)  // => "壹仟叁佰壹拾贰元整"
 */
export function formatChineseAmount(value) {
  const amount = Math.round(centToYuanNumber(value))

  if (amount === 0) {
    return '零元整'
  }

  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
  const units = ['', '拾', '佰', '仟']
  const bigUnits = ['', '万', '亿']

  let result = ''
  let zeroFlag = false

  const numStr = String(amount).padStart(9, '0')

  for (let i = 0; i < 9; i++) {
    const n = parseInt(numStr[i])
    const pos = 8 - i

    if (i === 4 && numStr.substring(0, 4) !== '0000') {
      result += bigUnits[1]
    }

    if (i === 0 && numStr.substring(i, 4) !== '0000') {
      result += bigUnits[2]
    }

    if (n === 0) {
      zeroFlag = true
    } else {
      if (zeroFlag) {
        result += digits[0]
        zeroFlag = false
      }
      result += digits[n] + units[pos % 4]
    }
  }

  result += '元整'

  return result.replace(/零+/g, '零').replace(/元整$/, '元整')
}
