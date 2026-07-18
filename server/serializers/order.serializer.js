/**
 * 订单响应序列化逻辑，用于统计、标签和金额归一化。
 */

import { normalizeCentAmount } from '../utils/money.js'

const orderStatusLabelMap = {
  pending_payment: '待付款',
  paid: '已支付',
  support_handling: '客服处理中',
  settlement_pending: '结算中',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消'
}

export function orderStatusToLabel(status) {
  return orderStatusLabelMap[status] || '未知状态'
}

export function normalizeOrderMoneyFields(row, options = {}) {
  const includeSensitiveContacts = Boolean(options.includeSensitiveContacts)
  const amount = normalizeCentAmount(row.amount) ?? 0
  const depositAmount = normalizeCentAmount(row.deposit_amount) ?? 0
  const sellerRentAmount = normalizeCentAmount(row.seller_rent_amount) ?? 0
  const normalizedRow = {
    ...row
  }

  if (!includeSensitiveContacts) {
    delete normalizedRow.buyer_contact_wechat
    delete normalizedRow.seller_contact_wechat
  }

  return {
    ...normalizedRow,
    amount,
    seller_rent_amount: sellerRentAmount,
    deposit_amount: depositAmount,
    total_amount: amount + depositAmount,
    status_text: orderStatusToLabel(row.status)
  }
}

export function buildOrderStatsPayload(row) {
  return {
    total: Number(row?.total || 0),
    pending_payment: Number(row?.pending_payment || 0),
    in_progress: Number(row?.in_progress || 0),
    completed: Number(row?.completed || 0),
    paid: Number(row?.paid || 0),
    support_handling: Number(row?.support_handling || 0),
    settlement_pending: Number(row?.settlement_pending || 0),
    cancelled: Number(row?.cancelled || 0)
  }
}
