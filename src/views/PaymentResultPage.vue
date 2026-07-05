<template>
  <section class="payment-result-page">
    <div class="payment-result-card">
      <div class="payment-result-hero">
        <div class="payment-result-hero-icon">✓</div>
        <div>
          <p class="payment-result-kicker">支付已完成</p>
          <h2>订单支付成功</h2>
          <p class="payment-result-subtitle">订单已进入已支付状态，可前往订单详情继续查看交易进度。</p>
        </div>
      </div>

      <div class="payment-result-summary">
        <div class="payment-result-row">
          <span>商品名称</span>
          <strong>{{ orderTitle || '商品租赁' }}</strong>
        </div>
        <div class="payment-result-row">
          <span>订单编号</span>
          <strong>#{{ orderId || '-' }}</strong>
        </div>
        <div class="payment-result-row">
          <span>商品编号</span>
          <strong class="copy-inline">
            <span>{{ displayListingId || '-' }}</span>
            <CopyTextButton :text="displayListingId" label="商品编号" />
          </strong>
        </div>
        <div class="payment-result-row">
          <span>支付方式</span>
          <strong>{{ paymentMethod || '-' }}</strong>
        </div>
        <div class="payment-result-row payment-result-row--amount">
          <span>实付金额</span>
          <strong class="payment-result-amount-value">￥{{ formatMoneyPrecise(totalAmount) }}</strong>
        </div>
      </div>

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
import CopyTextButton from '../components/CopyTextButton.vue'
import { formatMoneyPrecise as formatMoneyPreciseValue } from '../utils/money.js'

export default {
  name: 'PaymentResultPage',
  components: {
    CopyTextButton
  },
  computed: {
    orderId() {
      return String(this.$route.query.orderId || '')
    },
    listingId() {
      return String(this.$route.query.listingId || '')
    },
    displayListingId() {
      return this.listingId
    },
    orderTitle() {
      return String(this.$route.query.title || '')
    },
    paymentMethod() {
      return String(this.$route.query.method || '')
    },
    totalAmount() {
      return Number(this.$route.query.total || 0)
    }
  },
  methods: {
    formatMoneyPrecise(value) {
      return formatMoneyPreciseValue(value)
    },
    viewOrderDetail() {
      if (!this.orderId) {
        this.backToProfile()
        return
      }

      this.$router.push({
        name: 'order-detail',
        params: { id: this.orderId },
        query: {
          from: 'profile',
          role: 'buyer',
          section: 'orders',
          orderStatus: 'paid'
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
  color: #047857;
  background: #ecfdf5;
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

.copy-inline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
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
