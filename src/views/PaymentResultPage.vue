<template>
  <section class="payment-result-page">
    <div class="payment-result-card">
      <div class="payment-result-hero">
        <div :class="['payment-result-hero-icon', statusClass]">{{ statusIcon }}</div>
        <div>
          <p class="payment-result-kicker">{{ statusKicker }}</p>
          <h2>{{ statusTitle }}</h2>
          <p class="payment-result-subtitle">{{ statusSubtitle }}</p>
        </div>
      </div>

      <div class="payment-result-summary">
        <div class="payment-result-row">
          <span>商品名称</span>
          <strong>{{ displayOrderTitle }}</strong>
        </div>
        <div class="payment-result-row">
          <span>订单编号</span>
          <strong>#{{ displayOrderId }}</strong>
        </div>
        <div class="payment-result-row">
          <span>支付方式</span>
          <strong>{{ displayPaymentMethod }}</strong>
        </div>
        <div class="payment-result-row">
          <span>支付流水号</span>
          <strong>{{ transactionNo || '-' }}</strong>
        </div>
        <div class="payment-result-row payment-result-row--amount">
          <span>实付金额</span>
          <strong class="payment-result-amount-value">￥{{ formatMoneyPrecise(displayTotalAmount) }}</strong>
        </div>
      </div>

      <p v-if="statusMessage" class="payment-result-status-note">{{ statusMessage }}</p>

      <div class="payment-result-actions">
        <button type="button" class="payment-result-btn payment-result-btn--primary" @click="viewOrderDetail">
          查看订单详情
        </button>
        <button type="button" class="payment-result-btn" @click="backToProfile">
          返回个人中心
        </button>
      </div>
    </div>
  </section>
</template>

<script>
import { apiFetch } from '../utils/api.js'
import { formatMoneyPrecise as formatMoneyPreciseValue } from '../utils/money.js'

const PAYMENT_RETURN_CONTEXT_KEY = 'latest_payment_return_context'

export default {
  name: 'PaymentResultPage',
  data() {
    return {
      transaction: null,
      loading: false,
      pollTimer: null,
      pollAttempts: 0,
      returnContext: null,
      statusMessage: ''
    }
  },
  computed: {
    orderId() {
      return String(this.$route.query.orderId || '')
    },
    transactionNo() {
      return String(this.$route.query.transactionNo || this.returnContext?.transactionNo || '')
    },
    orderTitle() {
      return String(this.$route.query.title || this.returnContext?.orderTitle || '')
    },
    paymentMethod() {
      return String(this.$route.query.method || this.returnContext?.paymentMethod || '')
    },
    totalAmount() {
      return Number(this.$route.query.total || this.returnContext?.total || 0)
    },
    transactionStatus() {
      return String(this.transaction?.status || '').trim().toLowerCase()
    },
    statusClass() {
      if (this.transactionStatus === 'paid') return 'success'
      if (['failed', 'cancelled'].includes(this.transactionStatus)) return 'fail'
      if (this.loading || this.transactionStatus === 'pending' || this.transactionStatus === 'created') return 'pending'
      return 'success'
    },
    statusIcon() {
      if (this.statusClass === 'success') return '✓'
      if (this.statusClass === 'fail') return '!'
      return '...'
    },
    statusKicker() {
      if (this.statusClass === 'success') return '支付已完成'
      if (this.statusClass === 'fail') return '支付未完成'
      return '支付处理中'
    },
    statusTitle() {
      if (this.statusClass === 'success') return '订单支付成功'
      if (this.statusClass === 'fail') return '订单支付失败'
      return '正在确认支付结果'
    },
    statusSubtitle() {
      if (this.statusClass === 'success') {
        return '订单已进入已支付状态，可前往订单详情继续查看交易进度。'
      }
      if (this.statusClass === 'fail') {
        return '本次支付未成功完成，如已扣款请稍后刷新订单页确认结果。'
      }
      return '汇付正在回传支付结果，页面会自动刷新最新状态。'
    },
    displayOrderId() {
      return String(this.transaction?.order_id || this.orderId || this.returnContext?.orderId || '') || '-'
    },
    displayOrderTitle() {
      return String(this.transaction?.subject || this.orderTitle || '') || '商品租赁'
    },
    displayPaymentMethod() {
      if (this.paymentMethod) return this.paymentMethod
      const channel = String(this.transaction?.channel || this.returnContext?.paymentChannel || '').trim().toLowerCase()
      if (channel === 'alipay_h5') return '支付宝支付'
      if (channel === 'cashier_pc') return '支付宝支付'
      return '-'
    },
    displayTotalAmount() {
      return Number(this.transaction?.amount || this.totalAmount || 0)
    }
  },
  async mounted() {
    this.loadReturnContext()
    await this.refreshTransactionStatus()
  },
  beforeUnmount() {
    this.clearPollTimer()
  },
  methods: {
    formatMoneyPrecise(value) {
      return formatMoneyPreciseValue(value)
    },
    loadReturnContext() {
      if (typeof window === 'undefined') return
      try {
        const rawValue = window.sessionStorage.getItem(PAYMENT_RETURN_CONTEXT_KEY)
        this.returnContext = rawValue ? JSON.parse(rawValue) : null
      } catch (_error) {
        this.returnContext = null
      }
    },
    clearPollTimer() {
      if (this.pollTimer) {
        clearTimeout(this.pollTimer)
        this.pollTimer = null
      }
    },
    scheduleNextPoll(delay = 3000) {
      this.clearPollTimer()
      if (this.pollAttempts >= 20) {
        this.statusMessage = '支付结果仍在同步中，可稍后到订单详情页再次查看。'
        return
      }
      this.pollTimer = setTimeout(() => {
        void this.refreshTransactionStatus()
      }, Math.max(1000, Number(delay || 0)))
    },
    async refreshTransactionStatus() {
      if (!this.transactionNo) {
        return
      }
      this.loading = true
      this.statusMessage = ''
      try {
        const data = await apiFetch(`/api/pay/transactions/${encodeURIComponent(this.transactionNo)}`)
        this.transaction = data.transaction || null
        this.pollAttempts += 1
        if (['created', 'pending'].includes(String(this.transaction?.status || '').trim().toLowerCase())) {
          this.statusMessage = '已收到回跳，正在等待支付结果最终同步。'
          this.scheduleNextPoll(3000)
        } else {
          this.clearPollTimer()
          if (this.statusClass === 'success' && typeof window !== 'undefined') {
            window.sessionStorage.removeItem(PAYMENT_RETURN_CONTEXT_KEY)
          }
        }
      } catch (error) {
        this.statusMessage = error.message || '支付结果查询失败'
      } finally {
        this.loading = false
      }
    },
    viewOrderDetail() {
      if (this.displayOrderId === '-') {
        this.backToProfile()
        return
      }

      this.$router.push({
        name: 'order-detail',
        params: { id: this.displayOrderId },
        query: {
          from: 'profile',
          role: 'buyer',
          section: 'orders',
          orderStatus: this.statusClass === 'success' ? 'paid' : ''
        }
      })
    },
    backToProfile() {
      this.$router.push({
        name: 'profile',
        query: {
          section: 'orders',
          orderRole: 'buyer',
          orderStatus: 'paid'
        }
      })
    }
  }
}
</script>

<style scoped>
.payment-result-page {
  max-width: 920px;
  margin: 0 auto;
  padding: 32px 20px 40px;
}

.payment-result-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 20px;
  padding: 28px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
}

.payment-result-hero {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-bottom: 24px;
}

.payment-result-hero-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 700;
}

.payment-result-hero-icon.success {
  color: #047857;
  background: #ecfdf5;
}

.payment-result-hero-icon.fail {
  color: #b91c1c;
  background: #fee2e2;
}

.payment-result-hero-icon.pending {
  color: #1d4ed8;
  background: #dbeafe;
}

.payment-result-kicker {
  margin: 0 0 6px;
  color: #047857;
  font-weight: 700;
}

.payment-result-hero h2 {
  margin: 0;
  font-size: 28px;
  color: #111827;
}

.payment-result-subtitle {
  margin: 8px 0 0;
  color: #6b7280;
}

.payment-result-summary {
  display: grid;
  gap: 14px;
  padding: 22px;
  border-radius: 18px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
}

.payment-result-row {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  color: #374151;
}

.payment-result-row--amount {
  padding-top: 14px;
  border-top: 1px dashed #d1d5db;
  align-items: center;
}

.payment-result-amount-value {
  font-size: 22px;
  color: #111827;
}

.payment-result-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}

.payment-result-status-note {
  margin: 16px 0 0;
  font-size: 14px;
  color: #6b7280;
}

.payment-result-btn {
  min-width: 120px;
  height: 42px;
  border-radius: 12px;
  border: 1px solid #d1d5db;
  background: #ffffff;
  color: #111827;
  font-weight: 600;
  cursor: pointer;
}

.payment-result-btn--primary {
  border-color: var(--brand-primary);
  background: var(--brand-primary);
  color: #ffffff;
}

@media (max-width: 960px) {
  .payment-result-page {
    padding: 20px 14px 28px;
  }

  .payment-result-card {
    padding: 20px;
    border-radius: 16px;
  }

  .payment-result-hero {
    align-items: flex-start;
  }

  .payment-result-row {
    flex-direction: column;
    gap: 6px;
  }

  .payment-result-actions {
    flex-direction: column;
  }

  .payment-result-btn {
    width: 100%;
  }
}
</style>
