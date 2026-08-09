<template>
  <div v-if="!isLoggedIn" class="profile-placeholder-card">
    <h4>收款设置</h4>
    <p>登录后可完成收款账号入驻，并查看平台发起的结算打款记录。</p>
    <button type="button" class="profile-login-btn" @click="$emit('login')">立即登录</button>
  </div>
  <div v-else class="profile-panel-card">
    <div class="wallet-summary-grid">
      <div>
        <span class="wallet-summary-caption">入驻状态</span>
        <strong class="wallet-summary-minor">{{ onboardingStatusText }}</strong>
      </div>
      <div>
        <span class="wallet-summary-caption">收款人</span>
        <strong class="wallet-summary-minor">{{ accountForm.accountName || '--' }}</strong>
      </div>
      <div>
        <span class="wallet-summary-caption">汇付ID</span>
        <strong class="wallet-summary-minor wallet-summary-minor--highlight">{{ accountForm.huifuId || '--' }}</strong>
      </div>
    </div>

    <!-- 已完成入驻：显示余额和提现入口 -->
    <div v-if="isAccountReady" class="wallet-cashout-notice">
      <div class="wallet-cashout-info">
        <p>结算打款和邀新返现已自动到账至您的汇付账户，您可以直接在此提现到绑定的银行卡。</p>
        <p class="wallet-cashout-balance">账户可用余额：<strong>{{ balance || '0.00' }}</strong> 元</p>
        <p class="wallet-cashout-hint">提示：D1到账（次自然日），手续费率 0.05%。</p>
      </div>
      <form class="wallet-cashout-form" @submit.prevent="handleEncashment">
        <input v-model="encashmentForm.amount" type="number" step="0.01" min="0.01" :max="balance || undefined" placeholder="提现金额（元）" :disabled="encashing" class="wallet-cashout-input">
        <button type="submit" class="order-action-btn primary" :disabled="encashing || !balance || Number(balance) <= 0">
          {{ encashing ? '处理中...' : '提现' }}
        </button>
      </form>
      <div v-if="encashmentError" class="wallet-form-error">{{ encashmentError }}</div>
      <div v-if="encashmentResult" class="wallet-form-success">
        {{ encashmentResult }}
      </div>
    </div>

    <!-- 未完成入驻：显示两步入驻流程 -->
    <div v-else class="wallet-onboarding-section">
      <!-- 步骤一：个人用户开户 -->
      <div class="wallet-step-card" :class="{ 'wallet-step-card--done': hasHuifuId }">
        <div class="wallet-step-header">
          <span class="wallet-step-badge" :class="{ 'wallet-step-badge--done': hasHuifuId }">
            {{ hasHuifuId ? '✓' : '1' }}
          </span>
          <h4>个人用户开户</h4>
        </div>
        <p class="wallet-step-desc">填写真实身份信息，系统自动向汇付申请开户，开户成功后获得汇付ID。</p>

        <form v-if="!hasHuifuId" class="wallet-form-grid" @submit.prevent="handleRegister">
          <label class="wallet-form-field">
            <span>姓名</span>
            <input v-model="registerForm.name" type="text" maxlength="32" placeholder="请输入真实姓名" :disabled="registering">
          </label>
          <label class="wallet-form-field">
            <span>身份证号</span>
            <input v-model="registerForm.certNo" type="text" maxlength="18" placeholder="请输入身份证号" :disabled="registering">
          </label>
          <label class="wallet-form-field">
            <span>手机号</span>
            <input v-model="registerForm.mobileNo" type="tel" maxlength="11" placeholder="请输入手机号" :disabled="registering">
          </label>
          <label class="wallet-form-field">
            <span>身份证有效期</span>
            <select v-model="registerForm.certValidityType" :disabled="registering">
              <option value="0">非长期有效</option>
              <option value="1">长期有效</option>
            </select>
          </label>
          <label v-if="registerForm.certValidityType === '0'" class="wallet-form-field">
            <span>有效期起始日期</span>
            <input v-model="registerForm.certBeginDate" type="date" :disabled="registering">
          </label>
          <label v-if="registerForm.certValidityType === '0'" class="wallet-form-field">
            <span>有效期截止日期</span>
            <input v-model="registerForm.certEndDate" type="date" :disabled="registering">
          </label>
          <label v-if="registerForm.certValidityType === '1'" class="wallet-form-field">
            <span>有效期起始日期</span>
            <input v-model="registerForm.certBeginDate" type="date" :disabled="registering">
          </label>
          <div v-if="registerError" class="wallet-form-error wallet-form-field--full">{{ registerError }}</div>
          <div class="wallet-form-actions wallet-form-field--full">
            <button type="submit" class="order-action-btn primary wallet-submit-btn" :disabled="registering">
              {{ registering ? '正在开户...' : '提交开户' }}
            </button>
          </div>
        </form>
        <div v-else class="wallet-step-done">
          <span>汇付ID：{{ accountForm.huifuId }}</span>
        </div>
      </div>

      <!-- 步骤二：绑定银行卡 -->
      <div class="wallet-step-card" :class="{ 'wallet-step-card--disabled': !hasHuifuId }">
        <div class="wallet-step-header">
          <span class="wallet-step-badge" :class="{ 'wallet-step-badge--done': isAccountReady, 'wallet-step-badge--locked': !hasHuifuId }">
            {{ isAccountReady ? '✓' : '2' }}
          </span>
          <h4>绑定银行卡</h4>
        </div>
        <p class="wallet-step-desc">绑定银行卡后即可接收结算打款和邀新返现，并支持提现到银行卡。</p>

        <form v-if="!isAccountReady && hasHuifuId" class="wallet-form-grid" @submit.prevent="handleBindCard">
          <label class="wallet-form-field">
            <span>持卡人姓名</span>
            <input v-model="bindCardForm.cardName" type="text" maxlength="32" placeholder="请输入持卡人姓名" :disabled="binding">
          </label>
          <label class="wallet-form-field">
            <span>银行卡号</span>
            <input v-model="bindCardForm.cardNo" type="text" maxlength="32" placeholder="请输入银行卡号" :disabled="binding">
          </label>
          <label class="wallet-form-field">
            <span>银行所在省</span>
            <select v-model="bindCardForm.provId" :disabled="binding" @change="onProvChange">
              <option value="">请选择省份</option>
              <option v-for="prov in areaCodes" :key="prov.code" :value="prov.code">{{ prov.name }}</option>
            </select>
          </label>
          <label class="wallet-form-field">
            <span>银行所在市</span>
            <select v-model="bindCardForm.areaId" :disabled="binding || !bindCardForm.provId">
              <option value="">请选择城市</option>
              <option v-for="city in currentCities" :key="city.code" :value="city.code">{{ city.name }}</option>
            </select>
          </label>
          <label class="wallet-form-field">
            <span>身份证号</span>
            <input v-model="bindCardForm.certNo" type="text" maxlength="18" placeholder="请输入身份证号" :disabled="binding">
          </label>
          <label class="wallet-form-field">
            <span>手机号</span>
            <input v-model="bindCardForm.mobileNo" type="tel" maxlength="11" placeholder="银行卡绑定手机号" :disabled="binding">
          </label>
          <label class="wallet-form-field">
            <span>身份证有效期</span>
            <select v-model="bindCardForm.certValidityType" :disabled="binding">
              <option value="0">非长期有效</option>
              <option value="1">长期有效</option>
            </select>
          </label>
          <label v-if="bindCardForm.certValidityType === '0'" class="wallet-form-field">
            <span>有效期起始日期</span>
            <input v-model="bindCardForm.certBeginDate" type="date" :disabled="binding">
          </label>
          <label v-if="bindCardForm.certValidityType === '0'" class="wallet-form-field">
            <span>有效期截止日期</span>
            <input v-model="bindCardForm.certEndDate" type="date" :disabled="binding">
          </label>
          <label v-if="bindCardForm.certValidityType === '1'" class="wallet-form-field">
            <span>有效期起始日期</span>
            <input v-model="bindCardForm.certBeginDate" type="date" :disabled="binding">
          </label>
          <div v-if="bindCardError" class="wallet-form-error wallet-form-field--full">{{ bindCardError }}</div>
          <div class="wallet-form-actions wallet-form-field--full">
            <button type="submit" class="order-action-btn primary wallet-submit-btn" :disabled="binding">
              {{ binding ? '正在绑卡...' : '提交绑卡' }}
            </button>
          </div>
        </form>
        <div v-else-if="isAccountReady" class="wallet-step-done">
          <span>银行卡已绑定</span>
        </div>
        <div v-else class="wallet-step-locked">
          <span>请先完成步骤一开户</span>
        </div>
      </div>
    </div>

    <div class="wallet-action-card">
      <div class="wallet-action-header">
        <h4>结算记录</h4>
        <button type="button" class="order-action-btn ghost" :disabled="loading" @click="$emit('refresh')">
          刷新状态
        </button>
      </div>
    </div>

    <div v-if="loading" class="profile-empty">正在加载收款配置...</div>
    <div v-else-if="error" class="profile-empty profile-error">{{ error }}</div>
    <div v-else class="wallet-tab-section">
      <div class="wallet-tabs">
        <button type="button" class="wallet-tab-btn active">
          结算记录 ({{ payoutList.length }})
        </button>
      </div>
      <div class="wallet-tab-content">
        <div class="wallet-tab-panel">
          <div v-if="!payoutList.length" class="profile-empty">当前还没有余额支付结算记录。</div>
          <div v-else class="wallet-ledger-list">
            <article v-for="item in payoutList" :key="item.id" class="wallet-ledger-item wallet-withdraw-item">
              <div>
                <div class="wallet-withdraw-title-row">
                  <h4>结算单 {{ item.payout_no }}</h4>
                  <span class="order-status" :class="`status-${item.status}`">{{ getPayoutStatusText(item.status) }}</span>
                </div>
                <p>关联订单：{{ item.order_id || '-' }}</p>
                <p>收款账号：{{ item.account_name || '-' }} / {{ item.payee_huifu_id || '-' }}</p>
                <p v-if="item.failure_reason">失败原因：{{ item.failure_reason }}</p>
              </div>
              <div class="wallet-ledger-amount">
                <strong>￥{{ formatMoney(item.amount) }}</strong>
                <span>{{ formatOrderDate(item.created_at) }}</span>
              </div>
            </article>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { apiFetch } from '../../utils/api.js'
import areaCodes from '../../utils/area-codes.json'

defineOptions({
  name: 'ProfileWalletPanel'
})

const props = defineProps({
  isLoggedIn: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  submitting: { type: Boolean, default: false },
  payoutList: { type: Array, default: () => [] },
  balance: { type: String, default: '' },
  merchantPortalUrl: { type: String, default: '' },
  accountForm: {
    type: Object,
    default: () => ({
      huifuId: '',
      accountName: ''
    })
  },
  formatMoney: { type: Function, default: (value) => value || '0.00' },
  formatOrderDate: { type: Function, default: (value) => value || '--' },
  getBindStatusText: { type: Function, default: (value) => value || '--' },
  getPayoutStatusText: { type: Function, default: (value) => value || '--' }
})

const emit = defineEmits(['login', 'refresh', 'submit', 'update:settlement-account-form'])

const hasHuifuId = computed(() => String(props.accountForm.huifuId || '').trim() !== '')
const isAccountReady = computed(() => {
  return String(props.accountForm.huifuId || '').trim() !== ''
    && String(props.accountForm.accountName || '').trim() !== ''
    && String(props.accountForm.bindStatus || '').trim() === 'active'
})

const onboardingStatusText = computed(() => {
  if (isAccountReady.value) return '已完成'
  if (hasHuifuId.value) return '待绑卡'
  return '未完成'
})

// 步骤一：开户表单
const registering = ref(false)
const registerError = ref('')
const registerForm = reactive({
  name: '',
  certNo: '',
  mobileNo: '',
  certValidityType: '0',
  certBeginDate: '',
  certEndDate: ''
})

async function handleRegister() {
  registerError.value = ''
  if (!registerForm.name.trim() || !registerForm.certNo.trim() || !registerForm.mobileNo.trim()) {
    registerError.value = '姓名、身份证号、手机号不能为空'
    return
  }
  registering.value = true
  try {
    const res = await apiFetch('/api/settlement-account/register', {
      method: 'POST',
      body: JSON.stringify({
        name: registerForm.name.trim(),
        cert_no: registerForm.certNo.trim(),
        mobile_no: registerForm.mobileNo.trim(),
        cert_validity_type: registerForm.certValidityType,
        cert_begin_date: registerForm.certBeginDate.trim().replace(/-/g, ''),
        cert_end_date: registerForm.certValidityType === '1' ? '' : registerForm.certEndDate.trim().replace(/-/g, '')
      })
    })
    if (res.huifu_id) {
      emit('update:settlement-account-form', {
        ...props.accountForm,
        huifuId: res.huifu_id,
        accountName: registerForm.name.trim()
      })
      // 把开户信息同步到绑卡表单
      bindCardForm.cardName = registerForm.name.trim()
      bindCardForm.certNo = registerForm.certNo.trim()
      bindCardForm.mobileNo = registerForm.mobileNo.trim()
      bindCardForm.certValidityType = registerForm.certValidityType
      bindCardForm.certBeginDate = registerForm.certBeginDate.trim()
      bindCardForm.certEndDate = registerForm.certEndDate.trim()
    }
  } catch (err) {
    registerError.value = err?.body?.message || err?.message || '开户失败，请稍后重试'
  } finally {
    registering.value = false
  }
}

// 步骤二：绑卡表单
const binding = ref(false)
const bindCardError = ref('')
const bindCardForm = reactive({
  cardName: '',
  cardNo: '',
  provId: '',
  areaId: '',
  certNo: '',
  certValidityType: '0',
  certBeginDate: '',
  certEndDate: '',
  mobileNo: ''
})

const currentCities = computed(() => {
  const prov = areaCodes.find(p => p.code === bindCardForm.provId)
  return prov ? prov.cities : []
})

function onProvChange() {
  bindCardForm.areaId = ''
}

// 步骤三：提现
const encashing = ref(false)
const encashmentError = ref('')
const encashmentResult = ref('')
const encashmentForm = reactive({ amount: '' })

async function handleEncashment() {
  encashmentError.value = ''
  encashmentResult.value = ''
  const amt = Number(encashmentForm.amount || 0)
  if (!amt || amt <= 0) {
    encashmentError.value = '请输入有效的提现金额'
    return
  }
  encashing.value = true
  try {
    const res = await apiFetch('/api/settlement-account/encashment', {
      method: 'POST',
      body: JSON.stringify({ cash_amt: amt.toFixed(2) })
    })
    const statText = res.trans_stat === 'S' ? '成功' : res.trans_stat === 'P' ? '处理中' : '失败'
    encashmentResult.value = `提现${statText}，金额 ${res.cash_amt} 元，流水号 ${res.hf_seq_id || res.req_seq_id || '-'}`
    encashmentForm.amount = ''
    emit('refresh')
  } catch (err) {
    encashmentError.value = err?.body?.message || err?.message || '提现失败，请稍后重试'
  } finally {
    encashing.value = false
  }
}

async function handleBindCard() {
  bindCardError.value = ''
  if (!bindCardForm.cardName.trim() || !bindCardForm.cardNo.trim()) {
    bindCardError.value = '持卡人姓名和银行卡号不能为空'
    return
  }
  binding.value = true
  try {
    const res = await apiFetch('/api/settlement-account/bind-card', {
      method: 'POST',
      body: JSON.stringify({
        card_name: bindCardForm.cardName.trim(),
        card_no: bindCardForm.cardNo.trim(),
        prov_id: bindCardForm.provId.trim(),
        area_id: bindCardForm.areaId.trim(),
        cert_no: bindCardForm.certNo.trim(),
        cert_validity_type: bindCardForm.certValidityType,
        cert_begin_date: bindCardForm.certBeginDate.trim().replace(/-/g, ''),
        cert_end_date: bindCardForm.certValidityType === '1' ? '' : bindCardForm.certEndDate.trim().replace(/-/g, ''),
        mobile_no: bindCardForm.mobileNo.trim()
      })
    })
    if (res.settlement_account) {
      emit('update:settlement-account-form', {
        huifuId: res.settlement_account.huifu_id || props.accountForm.huifuId,
        accountName: res.settlement_account.account_name || bindCardForm.cardName.trim(),
        bindStatus: res.settlement_account.bind_status || 'active'
      })
      emit('refresh')
    }
  } catch (err) {
    bindCardError.value = err?.body?.message || err?.message || '绑卡失败，请稍后重试'
  } finally {
    binding.value = false
  }
}
</script>

<style scoped src="./profile-panel-shared.css"></style>
<style scoped>
.wallet-summary-grid {
  display: flex;
  align-items: center;
  margin-bottom: 24px;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  background: #fff;
}

.wallet-summary-grid > div {
  flex: 1;
  padding: 24px;
  border-right: 1px solid #e5e7eb;
  transition: background-color 0.2s ease;
}

.wallet-summary-grid > div:last-child {
  border-right: none;
}

.wallet-summary-grid > div:hover {
  background-color: #f9fafb;
}

.wallet-summary-caption {
  display: block;
  color: #374151;
  font-size: 13px;
  font-weight: 600;
}

.wallet-summary-minor {
  display: block;
  margin-top: 8px;
  color: #111827;
  font-size: 24px;
}

.wallet-summary-minor--highlight {
  color: #10b981;
}

.wallet-cashout-notice {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  margin-bottom: 16px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.wallet-cashout-info p {
  margin: 0;
  color: #374151;
  font-size: 13px;
  line-height: 1.6;
}

.wallet-cashout-hint {
  font-size: 12px !important;
  color: #6b7280 !important;
}

.wallet-cashout-balance {
  font-size: 14px !important;
  color: #374151 !important;
}

.wallet-cashout-balance strong {
  font-size: 18px;
  color: #111827;
}

.wallet-cashout-form {
  display: flex;
  gap: 8px;
  align-items: center;
}

.wallet-cashout-input {
  flex: 1;
  max-width: 200px;
  padding: 7px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
}

.wallet-form-success {
  color: #15803d;
  font-size: 13px;
  padding: 8px 12px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
}

/* 两步入驻 */
.wallet-onboarding-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-bottom: 24px;
}

.wallet-step-card {
  padding: 20px;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #fff;
  transition: opacity 0.2s ease;
}

.wallet-step-card--done {
  border-color: #d1fae5;
  background: #f0fdf4;
}

.wallet-step-card--disabled {
  opacity: 0.5;
}

.wallet-step-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.wallet-step-header h4 {
  margin: 0;
  color: #111827;
  font-size: 18px;
}

.wallet-step-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
}

.wallet-step-badge--done {
  background: #10b981;
  color: #fff;
}

.wallet-step-badge--locked {
  background: #f3f4f6;
  color: #d1d5db;
}

.wallet-step-desc {
  margin: 8px 0 0 40px;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.5;
}

.wallet-step-done {
  margin: 12px 0 0 40px;
  color: #059669;
  font-size: 14px;
  font-weight: 600;
}

.wallet-step-locked {
  margin: 12px 0 0 40px;
  color: #9ca3af;
  font-size: 14px;
}

.wallet-form-error {
  color: #dc2626;
  font-size: 13px;
}

/* 表单 */
.wallet-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 16px;
}

.wallet-form-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wallet-form-field--full {
  grid-column: 1 / -1;
}

.wallet-form-field span {
  color: #374151;
  font-size: 13px;
  font-weight: 600;
}

.wallet-form-field input,
.wallet-form-field select {
  min-height: 44px;
  border: 1px solid #d1d5db;
  border-radius: 12px;
  padding: 0 14px;
  background: #fff;
  color: #111827;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.wallet-form-field input:focus,
.wallet-form-field select:focus {
  border-color: #60a5fa;
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.18);
}

.wallet-form-field input:disabled,
.wallet-form-field select:disabled {
  background: #f8fafc;
  color: #9ca3af;
  cursor: not-allowed;
}

.wallet-form-actions {
  margin-top: 4px;
}

.wallet-submit-btn {
  min-width: 180px;
}

.order-action-btn {
  transition: all 0.2s ease;
}

.order-action-btn:active:not(:disabled) {
  transform: scale(0.96);
}

.order-action-btn.ghost:hover:not(:disabled) {
  background: #f1f5f9;
}

.wallet-action-card {
  margin-bottom: 24px;
}

.wallet-action-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.wallet-action-header h4 {
  margin: 0;
  color: #111827;
  font-size: 18px;
}

/* 结算记录 */
.wallet-tab-section {
  margin-top: 18px;
}

.wallet-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  border-bottom: 1px solid #f3f4f6;
  padding-bottom: 12px;
}

.wallet-tab-btn {
  padding: 8px 16px;
  border: none;
  background: transparent;
  color: #6b7280;
  font-size: 15px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.wallet-tab-btn:hover {
  background: #f3f4f6;
  color: #374151;
}

.wallet-tab-btn.active {
  background: #f3f4f6;
  color: #111827;
}

.wallet-ledger-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.wallet-ledger-item {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  background: #fff;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

@media (max-width: 960px) {
  .wallet-summary-grid {
    flex-direction: column;
  }

  .wallet-summary-grid > div {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid #e5e7eb;
  }

  .wallet-summary-grid > div:last-child {
    border-bottom: none;
  }

  .wallet-form-grid {
    grid-template-columns: 1fr;
  }

  .wallet-action-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
