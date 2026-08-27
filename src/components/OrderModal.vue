<template>
  <Transition name="modal-fade">
    <div v-if="visible" class="modal-overlay" @click.self="handleClose">
      <div class="modal-card">
        <div class="modal-header">
          <h3 class="modal-title">确认租赁订单</h3>
          <button class="close-btn" @click="handleClose" aria-label="关闭">&times;</button>
        </div>

        <div class="modal-body">
          <div class="listing-summary">
            <div class="summary-cover">
              <img v-if="coverImageUrl" :src="coverImageUrl" alt="商品封面" class="cover-img" loading="lazy" decoding="async" @error="handleMediaImageError" />
              <div v-else class="cover-placeholder">暂无封面</div>
            </div>
            <div class="summary-info">
              <p class="listing-no">
                <span>出租账号 #{{ listing?.listing_no || listing?.id || '-' }}</span>
                <CopyTextButton :text="listing?.listing_no || listing?.id || ''" label="商品编号" />
              </p>
              <p class="owner-name">{{ listing?.owner_name || '匿名' }}</p>
            </div>
          </div>

          <div class="contact-form">
            <label class="contact-field">
              <span>联系方式</span>
              <input
                v-model.trim="buyerContactWechat"
                type="text"
                maxlength="20"
                placeholder="微信号或手机号"
              />
            </label>
          </div>

          <div class="price-detail">
            <div class="price-row"><span>{{ buyerRentLabel }}</span><em>￥{{ formatMoney(buyerRentPrice) }}</em></div>
            <div class="price-row"><span>押金</span><em>￥{{ formatMoney(listing?.deposit || 0) }}</em></div>
            <div class="price-divider"></div>
            <div class="total-row"><span>合计金额</span><strong>￥{{ totalPrice }}</strong></div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-cancel" :disabled="submitting" @click="handleClose">取消</button>
          <button class="btn-confirm" :disabled="submitting" @click="handleSubmit">
            {{ submitting ? '提交中...' : '确认下单' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script>
import { apiFetch } from '../utils/api'
import { calculateBuyerRentFromSellerRent, formatMoneyPrecise, parseAmount } from '../utils/money'
import { fetchBusinessSettings, getBuyerRentLabel, getCachedBusinessSettings } from '../utils/businessSettings.js'
import { handleMediaImageError, withMediaVariant } from '../utils/media.js'
import { showErrorToast, showSuccessToast } from '../utils/toast.js'
import CopyTextButton from './CopyTextButton.vue'

export default {
  name: 'OrderModal',
  components: {
    CopyTextButton
  },
  emits: ['close', 'order-created'],
  props: {
    listing: {
      type: Object,
      default: null
    },
    visible: {
      type: Boolean,
      default: false
    },
    agreements: {
      type: Object,
      default: () => ({
        acceptBuyerAgreement: false,
        acceptPaymentAgreement: false,
        buyerAgreementVersion: '',
        paymentAgreementVersion: ''
      })
    }
  },
  data() {
    return {
      submitting: false,
      businessSettings: getCachedBusinessSettings(),
      buyerContactWechat: ''
    }
  },
  async mounted() {
    this.businessSettings = await fetchBusinessSettings()
  },
  computed: {
    sellerRentPrice() {
      return parseAmount(this.listing?.rent_price)
    },
    buyerRentPrice() {
      return parseAmount(this.listing?.buyer_rent_price ?? calculateBuyerRentFromSellerRent(
        this.sellerRentPrice,
        this.businessSettings.platformCommission?.buyerServiceFeeRatePercent
      ))
    },
    buyerRentLabel() {
      return getBuyerRentLabel(this.businessSettings)
    },
    coverImageUrl() {
      const images = Array.isArray(this.listing?.images) ? this.listing.images : []
      const rawCover = typeof images[0] === 'string' ? images[0] : ''
      return withMediaVariant(rawCover, 'thumb')
    },
    totalPrice() {
      const deposit = parseAmount(this.listing?.deposit)
      return formatMoneyPrecise(this.buyerRentPrice + deposit)
    }
  },
  watch: {
    visible(val) {
      if (val) {
        document.body.style.overflow = 'hidden'
        window.addEventListener('keydown', this.handleEsc)
      } else {
        document.body.style.overflow = ''
        window.removeEventListener('keydown', this.handleEsc)
      }
    }
  },
  beforeUnmount() {
    document.body.style.overflow = ''
    window.removeEventListener('keydown', this.handleEsc)
  },
  methods: {
    handleMediaImageError,
    handleClose() {
      this.$emit('close')
    },
    handleEsc(e) {
      if (e.key === 'Escape') this.handleClose()
    },
    async handleSubmit() {
      if (!this.listing || this.submitting) return
      if (!/^[a-zA-Z][-_a-zA-Z0-9]{5,19}$/.test(this.buyerContactWechat) && !/^1[3-9]\d{9}$/.test(this.buyerContactWechat)) {
        showErrorToast('请输入正确的微信号或手机号')
        return
      }
      this.submitting = true
      try {
        const data = await apiFetch('/api/orders', {
          method: 'POST',
          body: JSON.stringify({
            listing_id: this.listing.id,
            buyer_contact_wechat: this.buyerContactWechat,
            accept_buyer_agreement: Boolean(this.agreements?.acceptBuyerAgreement),
            accept_payment_agreement: Boolean(this.agreements?.acceptPaymentAgreement),
            buyer_agreement_version: String(this.agreements?.buyerAgreementVersion || '').trim(),
            payment_agreement_version: String(this.agreements?.paymentAgreementVersion || '').trim()
          })
        })
        showSuccessToast('订单创建成功')
        this.$emit('order-created', data)
        this.handleClose()
      } catch (error) {
        showErrorToast(`下单失败：${error.message}`)
      } finally {
        this.submitting = false
      }
    },
    formatMoney(cents) {
      return formatMoneyPrecise(cents)
    }
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
}

.modal-card {
  width: 500px;
  max-width: 90vw;
  max-height: 85vh;
  background: var(--bg-card);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.modal-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--text-main);
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, color 0.15s ease;
}

.close-btn:hover {
  background: var(--bg-page);
  color: var(--text-main);
}

.modal-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
}

.listing-summary {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-color);
  border-radius: 10px;
}

.summary-cover {
  width: 80px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  background: linear-gradient(180deg, var(--bg-subtle) 0%, var(--bg-page) 100%);
  border: 1px solid var(--border-color);
}

.cover-img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
}

.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-muted);
}

.summary-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}

.listing-no {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.owner-name {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}

.price-detail {
  margin-top: 14px;
  padding: 12px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
}

.contact-form {
  margin-top: 14px;
  display: grid;
  gap: 12px;
}

.contact-field {
  display: grid;
  gap: 6px;
}

.contact-field span {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
}

.contact-field input {
  width: 100%;
  min-height: 42px;
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  box-sizing: border-box;
}

.order-price-hint {
  margin: 10px 0 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.6;
}

.price-detail .price-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  line-height: 2;
  color: var(--text-regular);
}

.price-detail .price-row span {
  color: var(--text-muted);
}

.price-detail .price-row em {
  font-style: normal;
  font-weight: 600;
  color: var(--text-main);
}

.price-divider {
  height: 1px;
  background: var(--bg-page);
  margin: 6px 0;
}

.total-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  color: var(--danger-text);
}

.total-row span {
  font-size: 15px;
  font-weight: 600;
}

.total-row strong {
  font-size: 22px;
  font-weight: 700;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}

.btn-cancel,
.btn-confirm {
  padding: 9px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: opacity 0.15s ease, background 0.15s ease;
}

.btn-cancel {
  background: var(--bg-page);
  color: var(--text-regular);
}

.btn-cancel:hover:not(:disabled) {
  background: var(--border-strong);
}

.btn-confirm {
  background: var(--info-strong);
  color: #fff;
}

.btn-confirm:hover:not(:disabled) {
  background: var(--info-strong);
}

.btn-cancel:disabled,
.btn-confirm:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.25s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

@media (max-width: 540px) {
  .modal-card {
    width: 92vw;
    max-height: 88vh;
    border-radius: 10px;
  }

  .modal-header {
    padding: 14px 16px;
  }

  .modal-title {
    font-size: 16px;
  }

  .modal-body {
    padding: 14px 16px;
  }

  .listing-summary {
    padding: 10px;
    gap: 10px;
  }

  .summary-cover {
    width: 64px;
    height: 64px;
    padding: 5px;
  }

  .listing-no {
    font-size: 13px;
    display: flex;
    align-items: center;
  }

  .owner-name {
    font-size: 12px;
  }

  .price-detail {
    padding: 10px 12px;
  }

  .price-detail .price-row {
    font-size: 13px;
  }

  .total-row strong {
    font-size: 19px;
  }

  .modal-footer {
    padding: 12px 16px;
  }

  .btn-cancel,
  .btn-confirm {
    padding: 8px 18px;
    font-size: 13px;
  }
}
</style>
