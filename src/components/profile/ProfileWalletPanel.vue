<template>
  <div v-if="!isLoggedIn" class="profile-placeholder-card">
    <h4>收款设置</h4>
    <p>登录后可配置卖家收款账号，并查看平台发起的余额支付结算记录。</p>
    <button type="button" class="profile-login-btn" @click="$emit('login')">立即登录</button>
  </div>
  <div v-else class="profile-panel-card">
    <div class="wallet-summary-grid">
      <div>
        <span class="wallet-summary-caption">当前状态</span>
        <strong class="wallet-summary-minor">{{ getBindStatusText(accountForm.bindStatus) }}</strong>
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

    <div class="wallet-action-card">
      <div class="wallet-action-header">
        <div>
          <h4>收款账号配置</h4>
          <p>余额支付会直接打到这里。买家退款走原路退回，不再经过站内钱包。</p>
        </div>
        <button type="button" class="order-action-btn ghost" :disabled="loading || submitting" @click="$emit('refresh')">
          刷新状态
        </button>
      </div>

      <form class="wallet-form-grid" @submit.prevent="$emit('submit')">
        <label class="wallet-form-field">
          <span>主体类型</span>
          <select
            :value="accountForm.accountType"
            :disabled="submitting"
            @change="updateForm('accountType', $event.target.value)"
          >
            <option value="person">个人</option>
            <option value="enterprise">企业</option>
          </select>
        </label>
        <label class="wallet-form-field">
          <span>绑定状态</span>
          <select
            :value="accountForm.bindStatus"
            :disabled="submitting"
            @change="updateForm('bindStatus', $event.target.value)"
          >
            <option value="active">已启用</option>
            <option value="pending">待校验</option>
            <option value="disabled">已停用</option>
          </select>
        </label>
        <label class="wallet-form-field">
          <span>汇付ID</span>
          <input
            :value="accountForm.huifuId"
            type="text"
            maxlength="32"
            placeholder="请输入汇付 huifu_id"
            :disabled="submitting"
            @input="updateForm('huifuId', $event.target.value)"
          >
        </label>
        <label class="wallet-form-field">
          <span>账户号</span>
          <input
            :value="accountForm.acctId"
            type="text"
            maxlength="32"
            placeholder="选填，汇付 acct_id"
            :disabled="submitting"
            @input="updateForm('acctId', $event.target.value)"
          >
        </label>
        <label class="wallet-form-field">
          <span>收款人姓名</span>
          <input
            :value="accountForm.accountName"
            type="text"
            maxlength="50"
            placeholder="请输入收款人姓名"
            :disabled="submitting"
            @input="updateForm('accountName', $event.target.value)"
          >
        </label>
        <label class="wallet-form-field">
          <span>预留手机号</span>
          <input
            :value="accountForm.mobile"
            type="text"
            maxlength="20"
            placeholder="选填，便于人工核对"
            :disabled="submitting"
            @input="updateForm('mobile', $event.target.value)"
          >
        </label>
        <label class="wallet-form-field">
          <span>脱敏证件号</span>
          <input
            :value="accountForm.idCardMasked"
            type="text"
            maxlength="40"
            placeholder="如 3201********1234"
            :disabled="submitting"
            @input="updateForm('idCardMasked', $event.target.value)"
          >
        </label>
        <label class="wallet-form-field wallet-form-field--full">
          <span>备注说明</span>
          <input
            :value="accountForm.remark"
            type="text"
            maxlength="100"
            placeholder="选填，例如该账号已完成线下核验"
            :disabled="submitting"
            @input="updateForm('remark', $event.target.value)"
          >
        </label>
        <div class="wallet-form-actions wallet-form-field--full">
          <button type="submit" class="order-action-btn primary wallet-submit-btn" :disabled="submitting">
            {{ submitting ? '保存中...' : '保存收款配置' }}
          </button>
        </div>
      </form>
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
defineOptions({
  name: 'ProfileWalletPanel'
})

const props = defineProps({
  isLoggedIn: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  submitting: { type: Boolean, default: false },
  payoutList: { type: Array, default: () => [] },
  accountForm: {
    type: Object,
    default: () => ({
      provider: 'mock_payment',
      accountType: 'person',
      bindStatus: 'active',
      huifuId: '',
      acctId: '',
      accountName: '',
      mobile: '',
      idCardMasked: '',
      remark: ''
    })
  },
  formatMoney: { type: Function, default: (value) => value || '0.00' },
  formatOrderDate: { type: Function, default: (value) => value || '--' },
  getBindStatusText: { type: Function, default: (value) => value || '--' },
  getPayoutStatusText: { type: Function, default: (value) => value || '--' }
})

const emit = defineEmits(['login', 'refresh', 'submit', 'update:settlement-account-form'])

function updateForm(field, value) {
  emit('update:settlement-account-form', {
    ...props.accountForm,
    [field]: String(value || '').trim()
  })
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

.tooltip-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  position: relative;
}

.help-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #e5e7eb;
  color: #6b7280;
  font-size: 10px;
  font-style: normal;
  cursor: help;
}

.tooltip-text {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: 8px;
  padding: 8px 12px;
  background: #1f2937;
  color: #fff;
  font-size: 12px;
  line-height: 1.5;
  border-radius: 6px;
  width: max-content;
  text-align: left;
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s ease;
  z-index: 10;
  pointer-events: none;
}

.tooltip-text::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: #1f2937;
}

.tooltip-wrap:hover .tooltip-text {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(-4px);
}

.wallet-summary-minor {
  display: block;
  margin-top: 8px;
  color: #111827;
  font-size: 24px;
}

.wallet-summary-minor--frozen {
  color: #60a5fa;
}

.wallet-summary-minor--highlight {
  color: #10b981;
}

.wallet-action-card {
  margin-bottom: 24px;
}

.wallet-action-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.wallet-action-header h4 {
  margin: 0;
  color: #111827;
  font-size: 18px;
}

.wallet-action-header p {
  margin: 8px 0 0;
  color: #6b7280;
  line-height: 1.7;
  font-size: 13px;
}

/* Tabs Section */
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

.wallet-ledger-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
}

.wallet-ledger-item h4 {
  margin: 0;
  color: #111827;
  font-size: 16px;
}

.wallet-ledger-item p {
  margin: 6px 0 0;
  color: #6b7280;
  font-size: 13px;
}

.wallet-ledger-amount {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  color: #6b7280;
  font-size: 12px;
}

.wallet-ledger-amount strong {
  color: #10b981;
  font-size: 18px;
}

.wallet-ledger-amount--credit {
  color: #10b981 !important;
}

.wallet-ledger-amount span {
  color: #6b7280;
}

.wallet-withdraw-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

@media (max-width: 960px) {
  .wallet-ledger-item,
  .wallet-action-header,
  .wallet-withdraw-title-row {
    flex-direction: column;
  }

  .wallet-ledger-amount {
    align-items: flex-start;
  }

  .wallet-summary-grid,
  .wallet-form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
