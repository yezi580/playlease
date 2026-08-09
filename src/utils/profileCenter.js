export const FEEDBACK_CATEGORY_OPTIONS = Object.freeze([
  { value: 'account_login', label: '账号登录问题' },
  { value: 'listing_issue', label: '商品信息问题' },
  { value: 'order_payment', label: '订单/支付问题' },
  { value: 'chat_report', label: '聊天/违规举报' },
  { value: 'feature_suggestion', label: '功能建议' },
  { value: 'other', label: '其他问题' }
])

export const PROFILE_SECTION_ITEMS = Object.freeze([
  { key: 'published', label: '我发布的' },
  { key: 'orders', label: '我买到的' },
  { key: 'messages', label: '我的消息' },
  { key: 'wallet', label: '收款账号' },
  { key: 'invite', label: '邀新赚钱' }
])

export const ORDER_STATUS_TABS = Object.freeze([
  { key: 'all', label: '全部' },
  { key: 'pending_payment', label: '待付款' },
  { key: 'paid', label: '已支付' },
  { key: 'settlement_pending', label: '结算中' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
  { key: 'support_handling', label: '客服处理中' }
])

export const MY_LISTING_STATUS_TABS = Object.freeze([
  { key: 'all', label: '全部' },
  { key: 'active', label: '上架中' },
  { key: 'inactive', label: '已下架' },
  { key: 'pending_payment', label: '待付款' },
  { key: 'paid', label: '已支付' },
  { key: 'settlement_pending', label: '结算中' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
  { key: 'support_handling', label: '客服处理中' }
])

const SETTLEMENT_BIND_STATUS_TEXT_MAP = Object.freeze({
  unbound: '未配置',
  pending: '待校验',
  active: '已启用',
  disabled: '已停用'
})

const SETTLEMENT_PAYOUT_STATUS_TEXT_MAP = Object.freeze({
  pending: '待发起',
  processing: '处理中',
  success: '已到账',
  failed: '打款失败',
  cancelled: '已取消'
})

function cloneList(items = []) {
  return items.map((item) => ({ ...item }))
}

function padDatePart(value) {
  return String(value).padStart(2, '0')
}

export function createProfileSections() {
  return cloneList(PROFILE_SECTION_ITEMS)
}

export function createFeedbackCategories() {
  return cloneList(FEEDBACK_CATEGORY_OPTIONS)
}

export function createFeedbackForm() {
  return {
    category: FEEDBACK_CATEGORY_OPTIONS[0]?.value || 'other',
    description: ''
  }
}

export function createOrderStatsData() {
  return {
    total: 0,
    pending_payment: 0,
    paid: 0,
    support_handling: 0,
    settlement_pending: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0
  }
}

export function createOrderStatusTabs() {
  return cloneList(ORDER_STATUS_TABS)
}

export function createMyListingStatusTabs() {
  return cloneList(MY_LISTING_STATUS_TABS)
}

export function createMyListingsStatsData() {
  return {
    total: 0,
    active: 0,
    inactive: 0,
    pending_payment: 0,
    paid: 0,
    support_handling: 0,
    settlement_pending: 0,
    completed: 0,
    cancelled: 0
  }
}

export function createSettlementAccountForm() {
  return {
    huifuId: '',
    accountName: '',
    bindStatus: ''
  }
}

export function getSettlementBindStatusText(status = '') {
  return SETTLEMENT_BIND_STATUS_TEXT_MAP[String(status || '').trim().toLowerCase()] || '未配置'
}

export function getSettlementPayoutStatusText(status = '') {
  return SETTLEMENT_PAYOUT_STATUS_TEXT_MAP[String(status || '').trim().toLowerCase()] || '处理中'
}

export function formatPendingCountdown(createdAt, timeoutMinutes, nowTs) {
  const createdTime = new Date(createdAt).getTime()
  if (!Number.isFinite(createdTime)) return '--:--'
  const remainingMs = Math.max(0, createdTime + Number(timeoutMinutes || 0) * 60 * 1000 - Number(nowTs || 0))
  const totalSeconds = Math.floor(remainingMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${padDatePart(minutes)}:${padDatePart(seconds)}`
}

export function formatOrderDateTime(value) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const year = date.getFullYear()
  const month = padDatePart(date.getMonth() + 1)
  const day = padDatePart(date.getDate())
  const hour = padDatePart(date.getHours())
  const minute = padDatePart(date.getMinutes())
  return `${year}-${month}-${day} ${hour}:${minute}`
}

export function formatConversationTime(value) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const month = padDatePart(date.getMonth() + 1)
  const day = padDatePart(date.getDate())
  const hour = padDatePart(date.getHours())
  const minute = padDatePart(date.getMinutes())
  return `${month}-${day} ${hour}:${minute}`
}

export function formatBadgeCount(value) {
  const count = Number(value || 0)
  if (count > 99) return '99+'
  return String(count)
}

export function getMessageItemMeta(messageItem = {}) {
  if (messageItem?.item_type === 'conversation') {
    const counterpart = messageItem.counterpart_name || '订单成员'
    const orderNo = messageItem.order_no ? `订单号：${messageItem.order_no}` : '订单聊天室'
    return `${orderNo} · ${counterpart}`
  }
  return '平台通知'
}

export function getMessageItemPreview(messageItem = {}) {
  if (messageItem?.item_type === 'conversation') {
    return messageItem.last_message_preview || '点击进入订单聊天室。'
  }
  return messageItem.preview || messageItem.content || '点击查看通知详情。'
}
