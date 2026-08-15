<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="visible" class="payment-modal-overlay" @click.self="handleClose">
        <div class="payment-modal">
          <div class="payment-modal-header">
            <h3>确认支付</h3>
            <button type="button" class="payment-close-btn" @click="handleClose" :disabled="processing">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div v-if="!processing && !awaitingPaymentResult && !payResult" class="payment-modal-body">
            <div class="payment-order-summary">
              <div v-if="coverImage" class="payment-cover-wrap">
                <img :src="coverImage" alt="商品封面" class="payment-cover-img" />
              </div>
              <div class="payment-product-info">
                <span class="payment-product-name">{{ orderTitle || '商品租赁' }}</span>
                <span class="payment-rent-days">租用 {{ rentDays }} 天</span>
              </div>
            </div>

            <div class="payment-amount-card">
              <div class="payment-amount-row">
                <span>{{ buyerRentLabel }}</span>
                <span class="payment-amount-value">￥{{ formatMoney(amount) }}</span>
              </div>
              <div class="payment-amount-row">
                <span>押金</span>
                <span class="payment-amount-value">￥{{ formatMoney(deposit) }}</span>
              </div>
              <div class="payment-amount-row payment-total-row">
                <span>实付金额</span>
                <span class="payment-total-value">￥{{ formatMoney(total) }}</span>
              </div>
            </div>

            <div class="payment-method-section">
              <h4 class="payment-method-title">选择支付方式</h4>
              <div class="payment-method-list">
                <label
                  v-for="method in paymentMethods"
                  :key="method.key"
                  class="payment-method-item"
                  :class="{ active: selectedMethod === method.key }"
                >
                  <input
                    type="radio"
                    :value="method.key"
                    v-model="selectedMethod"
                    class="payment-method-radio"
                  />
                  <span class="payment-method-icon">{{ method.icon }}</span>
                  <span class="payment-method-name">{{ method.name }}</span>
                  <span class="payment-method-check" v-if="selectedMethod === method.key">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div v-else-if="(processing || awaitingPaymentResult) && !payResult" class="payment-modal-body payment-processing-body">
            <div class="payment-processing-icon">
              <svg class="payment-spinner" viewBox="0 0 50 50" width="60" height="60">
                <circle cx="25" cy="25" r="20" fill="none" stroke-width="4" style="stroke: var(--border-strong)"/>
                <circle cx="25" cy="25" r="20" fill="none" stroke-width="4" stroke-dasharray="90 31.4" stroke-linecap="round" class="spinner-circle" style="stroke: var(--info-strong)"/>
              </svg>
            </div>
            <p class="payment-processing-text">{{ paymentProcessingText }}</p>
            <p class="payment-processing-hint">{{ paymentProcessingHint }}</p>
            <p v-if="transactionNo" class="payment-transaction-no">支付流水号：{{ transactionNo }}</p>
          </div>

          <div v-else-if="payResult" class="payment-modal-body payment-result-body">
            <div :class="['payment-result-icon', payResult.success ? 'success' : 'fail']">
              {{ payResult.success ? '成功' : '失败' }}
            </div>
            <p class="payment-result-text">{{ payResult.success ? '支付成功' : '支付失败' }}</p>
            <p v-if="!payResult.success" class="payment-result-reason">{{ payResult.message }}</p>
          </div>

          <div class="payment-modal-footer">
            <template v-if="!processing && !awaitingPaymentResult && !payResult">
              <button type="button" class="payment-btn payment-btn-cancel" @click="handleClose">取消</button>
              <button type="button" class="payment-btn payment-btn-confirm" @click="handleConfirmPay">
                确认支付 ￥{{ formatMoney(total) }}
              </button>
            </template>
            <button v-else-if="payResult?.success" type="button" class="payment-btn payment-btn-confirm" @click="handleClose">
              完成
            </button>
            <button v-else-if="payResult && !payResult.success" type="button" class="payment-btn payment-btn-retry" @click="handleRetry">
              重新发起支付
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { apiFetch } from '../utils/api.js'
import { formatMoneyPrecise } from '../utils/money'
import { fetchBusinessSettings, getBuyerRentLabel, getCachedBusinessSettings } from '../utils/businessSettings.js'

const PAYMENT_RETURN_CONTEXT_KEY = 'latest_payment_return_context'

export default {
  name: 'PaymentModal',
  emits: ['close', 'success'],
  props: {
    visible: {
      type: Boolean,
      default: false
    },
    orderId: {
      type: [Number, String],
      required: true
    },
    orderTitle: {
      type: String,
      default: ''
    },
    amount: {
      type: Number,
      default: 0
    },
    deposit: {
      type: Number,
      default: 0
    },
    total: {
      type: Number,
      default: 0
    },
    rentDays: {
      type: [Number, String],
      default: 0
    },
    coverImage: {
      type: String,
      default: ''
    },
    listingNo: {
      type: String,
      default: ''
    },
    listingId: {
      type: [Number, String],
      default: ''
    }
  },
  data() {
    return {
      businessSettings: getCachedBusinessSettings(),
      selectedMethod: '',
      processing: false,
      awaitingPaymentResult: false,
      payResult: null,
      transactionNo: '',
      expiresAt: '',
      remainingSeconds: 0,
      closingTransaction: false,
      pollTimer: null,
      countdownTimer: null
    }
  },
  async mounted() {
    this.businessSettings = await fetchBusinessSettings()
    this.selectedMethod = this.defaultMethod
  },
  computed: {
    terminalScene() {
      if (typeof window === 'undefined') return 'pc'
      const userAgent = String(window.navigator?.userAgent || '')
      const isMobile = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS|Windows Phone/i.test(userAgent)
      return isMobile ? 'h5' : 'pc'
    },
    defaultMethod() {
      return this.terminalScene === 'h5' ? 'alipay_h5' : 'cashier_pc'
    },
    paymentMethods() {
      if (this.terminalScene === 'h5') {
        return [
          { key: 'alipay_h5', name: '支付宝支付', icon: 'A' }
        ]
      }
      return [
        { key: 'cashier_pc', name: '支付宝支付', icon: 'A' }
      ]
    },
    buyerRentLabel() {
      return getBuyerRentLabel(this.businessSettings)
    },
    paymentProcessingText() {
      return this.awaitingPaymentResult ? '正在确认支付...' : '正在跳转收银台...'
    },
    paymentProcessingHint() {
      if (this.awaitingPaymentResult) {
        return '请稍候，系统正在处理本次订单支付'
      }
      return '已生成支付流水，正在为你拉起收银台'
    }
  },
  watch: {
    visible(val) {
      if (val) {
        this.selectedMethod = this.defaultMethod
        return
      }
      if (!val) {
        this.resetState()
      }
    }
  },
  beforeUnmount() {
    this.clearTimers()
  },
  methods: {
    resetState() {
      this.selectedMethod = this.defaultMethod
      this.processing = false
      this.awaitingPaymentResult = false
      this.payResult = null
      this.transactionNo = ''
      this.expiresAt = ''
      this.remainingSeconds = 0
      this.closingTransaction = false
      this.clearTimers()
    },
    clearPollTimer() {
      if (this.pollTimer) {
        clearTimeout(this.pollTimer)
        this.pollTimer = null
      }
    },
    clearCountdownTimer() {
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer)
        this.countdownTimer = null
      }
    },
    clearTimers() {
      this.clearPollTimer()
      this.clearCountdownTimer()
    },
    handleClose() {
      if (this.processing || this.awaitingPaymentResult) return
      this.$emit('close')
    },
    getSelectedMethodMeta() {
      return this.paymentMethods.find((item) => item.key === this.selectedMethod) || this.paymentMethods[0]
    },
    getReturnUrlBase() {
      if (typeof window === 'undefined') return '/payment/result'
      return `${window.location.origin}/payment/result`
    },
    computeRemainingSeconds(expiresAt) {
      const timestamp = Date.parse(expiresAt || '')
      if (!Number.isFinite(timestamp)) return 0
      return Math.max(0, Math.ceil((timestamp - Date.now()) / 1000))
    },
    formatRemainingTime(seconds) {
      const normalizedSeconds = Math.max(0, Number(seconds || 0))
      const minutes = Math.floor(normalizedSeconds / 60)
      const remainSeconds = normalizedSeconds % 60
      return `${String(minutes).padStart(2, '0')}:${String(remainSeconds).padStart(2, '0')}`
    },
    startCountdown() {
      this.clearCountdownTimer()
      if (this.remainingSeconds <= 0) return
      this.countdownTimer = setInterval(() => {
        if (this.remainingSeconds > 0) {
          this.remainingSeconds -= 1
          return
        }
        void this.handleTransactionExpiry()
      }, 1000)
    },
    async closeCurrentTransaction() {
      if (!this.transactionNo || this.closingTransaction) return null
      this.closingTransaction = true
      try {
        const data = await apiFetch(`/api/pay/transactions/${encodeURIComponent(this.transactionNo)}/close`, {
          method: 'POST'
        })
        return data.transaction || null
      } finally {
        this.closingTransaction = false
      }
    },
    async handleTransactionExpiry() {
      this.clearTimers()
      try {
        const transaction = await this.closeCurrentTransaction()
        if (transaction && transaction.status === 'paid') {
          this.awaitingPaymentResult = false
          this.payResult = { success: true, message: '' }
          const selectedMethodMeta = this.getSelectedMethodMeta()
          this.$emit('success', {
            orderId: Number(this.orderId || 0),
            orderTitle: this.orderTitle || '商品租赁',
            listingNo: this.listingNo || '',
            listingId: Number(this.listingId || 0),
            total: Number(this.total || 0),
            amount: Number(this.amount || 0),
            deposit: Number(this.deposit || 0),
            rentDays: Number(this.rentDays || 0),
            coverImage: this.coverImage || '',
            paymentMethod: selectedMethodMeta?.name || '',
            paymentChannel: selectedMethodMeta?.key || this.selectedMethod,
            transactionNo: this.transactionNo
          })
          return
        }
      } catch (_error) {
        // 关单失败时只保留统一的前端提示，不阻塞用户重新发起支付
      }
      this.handlePaymentFailure('支付已超时，系统已尝试自动关单，请重新发起支付')
    },
    scheduleStatusPolling(delay = 3000) {
      if (!this.transactionNo || this.payResult || !this.visible) return
      this.clearPollTimer()
      this.pollTimer = setTimeout(() => {
        this.pollPaymentStatus()
      }, Math.max(0, Number(delay || 0)))
    },
    async pollPaymentStatus() {
      if (!this.transactionNo || this.payResult || !this.visible) return
      try {
        const data = await apiFetch(`/api/pay/transactions/${encodeURIComponent(this.transactionNo)}`)
        const transaction = data.transaction || {}
        if (transaction.expires_at) {
          this.expiresAt = transaction.expires_at
          this.remainingSeconds = this.computeRemainingSeconds(this.expiresAt)
        }
        if (transaction.status === 'paid') {
          this.awaitingPaymentResult = false
          this.payResult = { success: true, message: '' }
          this.clearTimers()
          const selectedMethodMeta = this.getSelectedMethodMeta()
          this.$emit('success', {
            orderId: Number(this.orderId || 0),
            orderTitle: this.orderTitle || '商品租赁',
            listingNo: this.listingNo || '',
            listingId: Number(this.listingId || 0),
            total: Number(this.total || 0),
            amount: Number(this.amount || 0),
            deposit: Number(this.deposit || 0),
            rentDays: Number(this.rentDays || 0),
            coverImage: this.coverImage || '',
            paymentMethod: selectedMethodMeta?.name || '',
            paymentChannel: selectedMethodMeta?.key || this.selectedMethod,
            transactionNo: this.transactionNo
          })
          return
        }
        if (['failed', 'cancelled'].includes(String(transaction.status || ''))) {
          this.handlePaymentFailure('支付未完成，请重新发起支付')
          return
        }
        if (this.remainingSeconds <= 0) {
          this.handlePaymentFailure('支付已过期，请重新发起支付')
          return
        }
        this.scheduleStatusPolling(3000)
      } catch (_error) {
        if (this.remainingSeconds > 0) {
          this.scheduleStatusPolling(5000)
          return
        }
        this.handlePaymentFailure('支付状态查询失败，请重新发起支付')
      }
    },
    handlePaymentFailure(message) {
      this.clearTimers()
      this.awaitingPaymentResult = false
      this.payResult = {
        success: false,
        message: message || '支付失败，请稍后重试'
      }
    },
    persistReturnContext(extra = {}) {
      if (typeof window === 'undefined') return
      const selectedMethodMeta = this.getSelectedMethodMeta()
      const payload = {
        orderId: Number(this.orderId || 0),
        orderTitle: this.orderTitle || '商品租赁',
        listingNo: this.listingNo || '',
        listingId: Number(this.listingId || 0),
        total: Number(this.total || 0),
        amount: Number(this.amount || 0),
        deposit: Number(this.deposit || 0),
        rentDays: Number(this.rentDays || 0),
        coverImage: this.coverImage || '',
        paymentMethod: selectedMethodMeta?.name || '',
        paymentChannel: selectedMethodMeta?.key || this.selectedMethod,
        transactionNo: this.transactionNo || '',
        ...extra
      }
      try {
        window.sessionStorage.setItem(PAYMENT_RETURN_CONTEXT_KEY, JSON.stringify(payload))
      } catch (_error) {
        // 忽略存储失败，支付主流程仍继续
      }
    },
    redirectToCashier(jumpUrl) {
      if (typeof window === 'undefined') {
        throw new Error('当前环境不支持跳转收银台')
      }
      window.location.assign(jumpUrl)
    },
    async handleConfirmPay() {
      this.processing = true
      this.awaitingPaymentResult = false
      this.payResult = null
      this.transactionNo = ''
      this.expiresAt = ''
      this.remainingSeconds = 0
      this.closingTransaction = false
      this.clearTimers()

      try {
        const data = await apiFetch('/api/pay/create', {
          method: 'POST',
          body: JSON.stringify({
            order_id: Number(this.orderId || 0),
            channel: this.selectedMethod,
            scene: this.terminalScene,
            return_url_base: this.getReturnUrlBase()
          })
        })
        const transaction = data.transaction || {}
        const providerPayload = transaction.provider_payload || {}
        const jumpUrl = transaction.jump_url || providerPayload.jumpUrl || providerPayload.jump_url || ''
        if (!transaction.transaction_no) {
          throw new Error('支付订单创建失败，请稍后重试')
        }

        this.transactionNo = String(transaction.transaction_no || '')
        this.persistReturnContext({
          transactionNo: this.transactionNo,
          callbackUrl: transaction.callback_url || providerPayload.callbackUrl || providerPayload.callback_url || ''
        })
        if (jumpUrl) {
          this.redirectToCashier(jumpUrl)
          return
        }
        this.expiresAt = transaction.expires_at || providerPayload.expiresAt || providerPayload.expires_at || ''
        this.remainingSeconds = this.computeRemainingSeconds(this.expiresAt)
        this.awaitingPaymentResult = true
        this.startCountdown()
        this.scheduleStatusPolling(0)
      } catch (error) {
        this.handlePaymentFailure(error.message || '支付失败，请稍后重试')
      } finally {
        this.processing = false
      }
    },
    handleRetry() {
      this.awaitingPaymentResult = false
      this.payResult = null
      this.transactionNo = ''
      this.expiresAt = ''
      this.remainingSeconds = 0
      this.clearTimers()
    },
    formatMoney(value) {
      return formatMoneyPrecise(value)
    }
  }
}
</script>

<style scoped>
.payment-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.payment-modal {
  width: 100%;
  max-width: 420px;
  background: var(--bg-card);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.payment-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 0;
}

.payment-modal-header h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-main);
}

.payment-close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: var(--bg-page);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
}

.payment-close-btn:hover:not(:disabled) {
  background: var(--bg-page);
  color: var(--text-regular);
}

.payment-close-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.payment-modal-body {
  padding: 20px 24px;
}

.payment-order-summary {
  display: flex;
  gap: 14px;
  padding: 14px 16px;
  background: var(--bg-subtle);
  border-radius: 12px;
  margin-bottom: 16px;
}

.payment-cover-wrap {
  width: 80px;
  min-width: 80px;
  height: 80px;
  border-radius: 10px;
  overflow: hidden;
  background: linear-gradient(135deg, var(--bg-subtle), var(--bg-page));
}

.payment-cover-img {
  width: 100%;
  height: 100%;
  object-fit: fill;
  display: block;
}

.payment-product-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  justify-content: center;
  min-width: 0;
}

.payment-product-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-main);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
}

.payment-rent-days {
  font-size: 13px;
  color: var(--text-muted);
  white-space: nowrap;
}

.payment-amount-card {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 4px 0;
  margin-bottom: 20px;
}

.payment-amount-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  font-size: 14px;
  color: var(--text-regular);
}

.payment-total-row {
  border-top: 1px solid var(--border-color);
  margin-top: 4px;
}

.payment-amount-value {
  color: var(--text-regular);
}

.payment-total-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--danger-text);
}

.payment-method-section {
  margin-bottom: 8px;
}

.payment-method-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-regular);
}

.payment-method-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.payment-method-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1.5px solid var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.payment-method-item:hover {
  border-color: var(--info-border);
  background: var(--info-bg);
}

.payment-method-item.active {
  border-color: var(--info-strong);
  background: var(--info-bg);
}

.payment-method-radio {
  display: none;
}

.payment-method-icon {
  font-size: 22px;
  line-height: 1;
}

.payment-method-name {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-regular);
}

.payment-method-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--info-text);
}

.payment-processing-body,
.payment-result-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
}

.payment-transaction-no {
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-muted);
  word-break: break-all;
}

.payment-processing-icon {
  margin-bottom: 20px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.spinner-circle {
  transform-origin: center;
  animation: spin 1s linear infinite;
}

.payment-spinner {
  display: block;
}

.payment-processing-text {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--text-main);
}

.payment-processing-hint {
  margin-top: 8px;
  font-size: 13px;
  color: var(--text-faint);
}

.payment-result-icon {
  min-width: 92px;
  margin-bottom: 16px;
  padding: 18px 16px;
  border-radius: 999px;
  font-size: 24px;
  font-weight: 700;
  line-height: 1;
}

.payment-result-icon.success {
  color: var(--success-text-dark);
  background: var(--success-bg-strong);
}

.payment-result-icon.fail {
  color: var(--danger-text-strong);
  background: var(--danger-bg-strong);
}

.payment-result-text {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-main);
}

.payment-result-reason {
  margin-top: 8px;
  font-size: 14px;
  color: var(--danger-text);
}

.payment-modal-footer {
  display: flex;
  gap: 12px;
  padding: 0 24px 24px;
}

.payment-btn {
  flex: 1;
  padding: 13px 20px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
}

.payment-btn-cancel {
  background: var(--bg-page);
  color: var(--text-regular);
}

.payment-btn-cancel:hover {
  background: var(--bg-page);
}

.payment-btn-confirm {
  background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%);
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(29, 78, 216, 0.3);
}

.payment-btn-confirm:hover {
  opacity: 0.92;
  box-shadow: 0 6px 16px rgba(29, 78, 216, 0.35);
}

.payment-btn-retry {
  background: var(--danger-bg);
  color: var(--danger-text);
  border: 1px solid var(--danger-border);
}

.payment-btn-retry:hover {
  background: var(--danger-bg-strong);
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.25s ease;
}

.modal-fade-enter-active .payment-modal,
.modal-fade-leave-active .payment-modal {
  transition: transform 0.25s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .payment-modal,
.modal-fade-leave-to .payment-modal {
  transform: scale(0.95) translateY(10px);
}

@media (max-width: 480px) {
  .payment-modal {
    max-width: 100%;
    border-radius: 16px;
  }

  .payment-modal-header {
    padding: 16px 18px 0;
  }

  .payment-modal-body {
    padding: 16px 18px;
  }

  .payment-modal-footer {
    padding: 0 18px 18px;
  }

  .payment-product-name {
    max-width: 160px;
  }

  .payment-total-value {
    font-size: 18px;
  }

  .payment-btn {
    padding: 12px 16px;
    font-size: 14px;
  }
}
</style>
