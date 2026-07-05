/**
 * 金额处理纯函数
 */

export function normalizeCentAmount(value) {
  if (value === undefined || value === null) return value
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return value
  return Math.round(parsed)
}

export function yuanToCent(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * 100)
}

export function centToRoundedYuan(value) {
  const parsed = Number(value || 0)
  if (!Number.isFinite(parsed)) return 0
  return Math.round(parsed / 100)
}

