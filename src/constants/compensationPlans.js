export const DEFAULT_COMPENSATION_PLAN = 'basic'

export const COMPENSATION_PLAN_OPTIONS = Object.freeze([
  {
    value: 'premium',
    title: '高级',
    shortLabel: '高级：全额赔付',
    feeRate: 0.09,
    feeRateLabel: '9%',
    description: '我们会从您租金中抽取9%，出现十年封禁或打手恶意毁号按照账号市场价赔付（同等质量的账号，质量=皮肤+仓库价值+特勤处等级，可选择兑现，结单后扣除本金×0.05给到商行）'
  },
  {
    value: 'medium',
    title: '中级',
    shortLabel: '中级：65%赔付',
    feeRate: 0.05,
    feeRateLabel: '5%',
    description: '我们会从您租金中抽取5%，出现十年封禁或打手恶意毁号按照账号市场价的65%赔付（同等质量的账号，质量=皮肤+仓库价值+特勤处等级，可选择兑现，结单后扣除本金×0.05给到商行）'
  },
  {
    value: 'basic',
    title: '初级',
    shortLabel: '初级：押金赔付（默认）',
    feeRate: 0,
    feeRateLabel: '免费',
    description: '10年封禁或打手恶意毁号只赔付打手交给商行的押金（无论是否解封），并且租金全额支付'
  }
])

export const ALLOWED_COMPENSATION_PLAN_VALUES = new Set(
  COMPENSATION_PLAN_OPTIONS.map((item) => item.value)
)

export function getCompensationPlanOption(value) {
  return COMPENSATION_PLAN_OPTIONS.find((item) => item.value === value) || COMPENSATION_PLAN_OPTIONS.find((item) => item.value === DEFAULT_COMPENSATION_PLAN)
}

export function calculateCompensationFeeAmount(amount, planValue) {
  const normalizedAmount = Math.max(0, Number(amount || 0))
  const plan = getCompensationPlanOption(planValue)
  return Math.floor(normalizedAmount * Number(plan?.feeRate || 0))
}
