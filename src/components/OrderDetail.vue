<template>
  <div class="order-detail">
    <div v-if="loading" class="state-card">正在加载订单详情...</div>
    <div v-else-if="error" class="state-card state-card--error">
      <p>{{ error }}</p>
      <button type="button" class="btn btn--primary" @click="fetchOrderDetail">重新加载</button>
    </div>

    <template v-else-if="order">
      <section class="hero" :class="`hero--${order.status}`">
        <div class="hero-main">
          <div class="hero-title-row">
            <h2>{{ order.status_text || statusLabel }}</h2>
            <span v-if="userRole === 'buyer' && order.status === 'pending_payment'" class="pill pill--warn">
              {{ pendingCountdownText }}
            </span>
            <button
              v-if="canOpenConversation"
              type="button"
              class="btn btn--ghost hero-chat-btn"
              @click="showConversationPanel = true"
            >
              进入聊天室
            </button>
          </div>
          <div
            v-if="statusDescription || (userRole === 'buyer' && order.status === 'pending_payment')"
            class="hero-desc-row"
          >
            <p v-if="statusDescription" class="hero-desc">{{ statusDescription }}</p>
            <button
              v-if="userRole === 'buyer' && order.status === 'pending_payment'"
              type="button"
              class="btn btn--primary hero-pay-btn"
              @click="showPaymentModal = true"
            >
              立即支付
            </button>
          </div>
        </div>
      </section>

      <section class="grid">
        <article class="card card--wide">
          <div class="card-head">
            <h3>商品信息</h3>
            <button
              v-if="order.listing_id"
              type="button"
              class="btn btn--ghost card-view-btn"
              @click="$emit('view-listing', order.listing_id, order.listing, order.images)"
            >
              查看商品
            </button>
          </div>
          <div class="product">
            <img v-if="productCoverImage" :src="productCoverImage" :alt="order.listing_title" class="product-cover">
            <div v-else class="product-cover product-cover--empty">暂无封面</div>
            <div class="product-main">
              <h4>{{ order.listing_title }}</h4>
              <p class="copy-inline">
                <span>商品编号：{{ order.listing?.listing_no || order.listing_no || '-' }}</span>
                <CopyTextButton :text="order.listing?.listing_no || order.listing_no || ''" label="商品编号" />
              </p>
              <p>订单编号：{{ order.order_no }}</p>
              <p>{{ counterpartyLabel }}：{{ counterpartyName }}</p>
              <p v-if="order.support_assignee_name">当前客服：{{ order.support_assignee_name }}</p>
              <p>租用天数：{{ order.rent_days || 0 }} 天</p>
            </div>
          </div>
        </article>

        <article class="card">
          <div class="card-head">
            <h3>费用明细</h3>
          </div>
          <div class="money-list">
            <template v-if="userRole === 'seller'">
              <div><span>发布租金</span><strong>￥{{ formatMoney(sellerRentAmount) }}</strong></div>
              <div><span>平台手续费</span><strong>￥{{ formatMoney(sellerServiceFee) }}</strong></div>
              <div><span>{{ sellerCompensationFeeLabel }}</span><strong>￥{{ formatMoney(sellerCompensationFee) }}</strong></div>
              <div><span>预计到账租金</span><strong>￥{{ formatMoney(sellerIncomeRent) }}</strong></div>
              <div><span>押金</span><strong>￥{{ formatMoney(order.deposit_amount) }}</strong></div>
            </template>
            <template v-else>
              <div><span>{{ buyerRentLabel }}</span><strong>￥{{ formatMoney(order.amount) }}</strong></div>
              <div><span>押金</span><strong>￥{{ formatMoney(order.deposit_amount) }}</strong></div>
              <div><span>应付合计</span><strong>￥{{ formatMoney(order.total_amount) }}</strong></div>
            </template>
          </div>
        </article>

        <article class="card">
          <div class="card-head">
            <h3>流程信息</h3>
          </div>
          <div class="info-list">
            <div><span>下单时间</span><strong>{{ formatDateTime(order.created_at) }}</strong></div>
            <div v-if="order.paid_at"><span>支付时间</span><strong>{{ formatDateTime(order.paid_at) }}</strong></div>
            <div v-if="order.verified_at"><span>继续履约确认</span><strong>{{ formatDateTime(order.verified_at) }}</strong></div>
            <div v-if="order.settlement_requested_at"><span>进入结算中</span><strong>{{ formatDateTime(order.settlement_requested_at) }}</strong></div>
            <div v-if="order.finished_at"><span>完成时间</span><strong>{{ formatDateTime(order.finished_at) }}</strong></div>
            <div v-if="order.cancel_requested_at"><span>取消申请</span><strong>{{ formatDateTime(order.cancel_requested_at) }}</strong></div>
          </div>
        </article>

        <article v-if="showUsageForm" class="card card--wide">
          <div class="card-head">
            <h3>额外物品使用表单</h3>
          </div>
          <div class="usage-form">
            <div v-for="item in saleItems" :key="`usage-${item.item_key}`" class="usage-row">
              <div>
                <strong>{{ item.item_name }}</strong>
                <p>最多可填 {{ item.quantity }}，单价 ￥{{ formatMoney(item.unit_price) }}</p>
              </div>
              <input
                v-model.number="usageForm[item.item_key]"
                type="number"
                min="0"
                :max="item.quantity"
              >
            </div>
            <div class="usage-actions">
              <button type="button" class="btn btn--primary" :disabled="submitting" @click="handleUsagePrimaryAction">
                {{ submitting ? '提交中...' : usagePrimaryActionLabel }}
              </button>
            </div>
          </div>
        </article>

        <article v-if="showSellerUsageReport" class="card card--wide">
          <div class="card-head">
            <h3>买家提交的额外物品使用表单</h3>
          </div>
          <div class="table">
            <div class="table-row table-row--head">
              <span>物品</span>
              <span>使用数量</span>
              <span>单价</span>
              <span>总价</span>
            </div>
            <div v-for="item in reportedUsageItems" :key="`reported-${item.item_key}`" class="table-row">
              <span>{{ item.item_name }}</span>
              <span>{{ item.reported_quantity }}</span>
              <span>￥{{ formatMoney(item.unit_price) }}</span>
              <span>￥{{ formatMoney(item.reported_total_price) }}</span>
            </div>
          </div>
        </article>

        <article v-if="order.cancel_reason || order.support_note" class="card">
          <div class="card-head">
            <h3>补充说明</h3>
          </div>
          <div class="note-list">
            <p v-if="order.cancel_reason"><strong>取消原因：</strong>{{ order.cancel_reason }}</p>
            <p v-if="order.support_note"><strong>客服备注：</strong>{{ order.support_note }}</p>
          </div>
        </article>

        <article v-if="currentActions.length" class="card card--wide">
          <div v-if="currentActions.length" class="actions">
            <button
              v-for="action in currentActions"
              :key="action.key"
              type="button"
              class="btn"
              :class="action.tone === 'danger' ? 'btn--danger' : (action.tone === 'ghost' ? 'btn--ghost' : 'btn--primary')"
              :disabled="submitting"
              @click="handleAction(action.key)"
            >
              {{ action.label }}
            </button>
          </div>
        </article>

        <article class="card card--wide">
          <div class="card-head">
            <h3>订单记录</h3>
          </div>
          <div class="timeline">
            <div v-for="(item, index) in timelineItems" :key="`${item.desc}-${index}`" class="timeline-item">
              <span class="timeline-dot"></span>
              <div>
                <p>{{ item.desc }}</p>
                <small>{{ item.time }}</small>
              </div>
            </div>
          </div>
        </article>
      </section>

      <PaymentModal
        :visible="showPaymentModal"
        :order-id="order?.id"
        :order-title="order?.listing_title"
        :cover-image="productCoverImage"
        :listing-no="order?.listing?.listing_no || order?.listing_no || ''"
        :listing-id="order?.listing?.id || order?.listing_id || ''"
        :amount="order?.amount"
        :deposit="order?.deposit_amount"
        :total="order?.total_amount"
        :rent-days="order?.rent_days"
        @close="showPaymentModal = false"
        @success="onPaymentSuccess"
      />
      <ConversationPanel
        :visible="showConversationPanel"
        :order-id="order?.id"
        :user-role="userRole"
        @close="showConversationPanel = false"
      />
    </template>
  </div>
</template>

<script>
import { apiFetch } from '../utils/api.js'
import { calculateSellerIncomeRent, calculateServiceFeeFromSellerRent, formatMoneyPrecise } from '../utils/money'
import CopyTextButton from './CopyTextButton.vue'
import {
  calculateCompensationFeeAmount,
  fetchBusinessSettings,
  formatPercentLabel,
  getBuyerRentLabel,
  getCachedBusinessSettings,
  getCompensationPlanOption,
  getPendingPaymentTimeoutMinutes
} from '../utils/businessSettings.js'
import { showErrorToast, showSuccessToast } from '../utils/toast.js'
import { showConfirm, showPrompt } from '../utils/confirm.js'
import PaymentModal from './PaymentModal.vue'
import ConversationPanel from './ConversationPanel.vue'

const STATUS_DESCRIPTION_MAP = {
  pending_payment: '请在 30 分钟内完成支付，支付成功后系统会自动分配客服并建立三方聊天室。',
  paid: '',
  support_handling: '当前订单由客服处理中，请在聊天室配合沟通，等待客服给出下一步结论。',
  settlement_pending: '订单已进入结算中，买家提交额外物品表单后由卖家确认，客服执行分账。',
  completed: '订单已完成，平台已按规则结算。',
  cancelled: '订单已取消。'
}

export default {
  name: 'OrderDetail',
  components: {
    CopyTextButton
  },
  components: { PaymentModal, ConversationPanel },
  emits: ['back', 'view-listing'],
  props: {
    orderId: { type: [Number, String], required: true },
    backText: { type: String, default: '返回列表' },
    userRole: {
      type: String,
      default: 'buyer',
      validator: (value) => ['buyer', 'seller'].includes(value)
    }
  },
  data() {
    return {
      loading: false,
      error: '',
      order: null,
      countdownNowTs: Date.now(),
      countdownTimer: null,
      submitting: false,
      showPaymentModal: false,
      showConversationPanel: false,
      usageForm: {},
      businessSettings: getCachedBusinessSettings()
    }
  },
  computed: {
    productCoverImage() {
      if (this.order?.images?.length) {
        const first = this.order.images[0]
        return typeof first === 'string' ? first : (first?.image_url || null)
      }
      return this.order?.listing?.cover_image || null
    },
    saleItems() {
      return (Array.isArray(this.order?.items) ? this.order.items : []).filter((item) => item.item_mode === 'sale')
    },
    timelineItems() {
      const list = Array.isArray(this.order?.timeline) ? this.order.timeline : []
      if (!list.length) return []
      return list.map((item) => ({
        desc: item.label || item.desc || '',
        time: this.formatDateTime(item.time)
      }))
    },
    statusLabel() {
      return this.order?.status_text || ''
    },
    statusDescription() {
      if (this.order?.status === 'pending_payment' && this.userRole === 'seller') {
        return ''
      }
      if (this.order?.status === 'pending_payment') {
        return `请在 ${getPendingPaymentTimeoutMinutes(this.businessSettings)} 分钟内完成支付，支付成功后系统会自动分配客服并建立三方聊天室。`
      }
      const desc = STATUS_DESCRIPTION_MAP[this.order?.status]
      return desc !== undefined ? desc : '请按当前流程完成订单。'
    },
    pendingCountdownText() {
      if (this.order?.status !== 'pending_payment') return ''
      const createdTime = new Date(this.order?.created_at).getTime()
      if (!Number.isFinite(createdTime)) return '--:--'
      const remainingMs = Math.max(0, createdTime + getPendingPaymentTimeoutMinutes(this.businessSettings) * 60 * 1000 - this.countdownNowTs)
      const totalSeconds = Math.floor(remainingMs / 1000)
      const minutes = Math.floor(totalSeconds / 60)
      const seconds = totalSeconds % 60
      return `剩余 ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    },
    showUsageForm() {
      return this.userRole === 'buyer'
        && this.order?.status === 'settlement_pending'
        && this.order?.settlement_status !== 'seller_confirmed'
        && this.saleItems.length > 0
    },
    reportedUsageItems() {
      const reportMap = new Map(
        (Array.isArray(this.order?.item_usage_reports) ? this.order.item_usage_reports : [])
          .map((row) => [row.item_key, row])
      )
      return this.saleItems.map((item) => {
        const reportRow = reportMap.get(item.item_key) || {}
        const reportedQuantity = Number(reportRow?.reported_quantity || 0)
        const reportedTotalPrice = Number(reportRow?.reported_total_price || 0)
        return {
          ...item,
          reported_quantity: reportedQuantity,
          reported_total_price: reportedTotalPrice > 0
            ? reportedTotalPrice
            : reportedQuantity * Number(item?.unit_price || 0)
        }
      })
    },
    showSellerUsageReport() {
      return this.userRole === 'seller'
        && Boolean(this.order?.buyer_item_reported_at)
        && this.saleItems.length > 0
    },
    hasReportedUsageItems() {
      return (Array.isArray(this.order?.item_usage_reports) ? this.order.item_usage_reports : [])
        .some((row) => Number(row?.reported_quantity || 0) > 0)
    },
    sellerUsageConfirmActionLabel() {
      return this.hasReportedUsageItems ? '确认额外物品表单' : '确认无额外物品使用'
    },
    usagePrimaryActionLabel() {
      return this.userRole === 'seller' ? '确认额外物品表单' : '提交额外物品表单'
    },
    counterpartyLabel() {
      return this.userRole === 'seller' ? '买家' : '卖家'
    },
    counterpartyName() {
      if (this.userRole === 'seller') {
        return this.order?.buyer_name || '买家'
      }
      return this.order?.seller_name || this.order?.listing?.owner_name || '平台卖家'
    },
    sellerRentAmount() {
      return Number(this.order?.seller_rent_amount || 0)
    },
    sellerServiceFee() {
      return calculateServiceFeeFromSellerRent(
        this.sellerRentAmount,
        this.businessSettings.platformCommission?.sellerServiceFeeRatePercent
      )
    },
    sellerCompensationPlan() {
      return getCompensationPlanOption(
        this.order?.listing?.compensation_plan || this.order?.compensation_plan,
        this.businessSettings
      )
    },
    sellerCompensationFee() {
      return calculateCompensationFeeAmount(
        this.sellerRentAmount,
        this.sellerCompensationPlan.value,
        this.businessSettings
      )
    },
    sellerCompensationFeeLabel() {
      return `保险赔付服务费（${formatPercentLabel(this.sellerCompensationPlan.feeRatePercent)}）`
    },
    buyerRentLabel() {
      return getBuyerRentLabel(this.businessSettings)
    },
    sellerIncomeRent() {
      return Math.max(
        0,
        calculateSellerIncomeRent(
          this.sellerRentAmount,
          this.businessSettings.platformCommission?.sellerServiceFeeRatePercent
        ) - this.sellerCompensationFee
      )
    },
    canOpenConversation() {
      return Boolean(this.order?.id)
        && this.order?.status
        && this.order.status !== 'pending_payment'
    },
    isCurrentUserCancelRequester() {
      const requesterId = Number(this.order?.cancel_requested_by || 0)
      if (!requesterId) return false
      return this.userRole === 'buyer'
        ? requesterId === Number(this.order?.buyer_id || 0)
        : requesterId === Number(this.order?.seller_id || 0)
    },
    currentActions() {
      if (!this.order) return []
      const actions = []
      const status = this.order.status
      if (status === 'paid' && this.userRole === 'buyer') {
        if (!this.order.verified_at) {
          actions.push({ key: 'verify', label: '确认账号正常，继续履约', tone: 'primary' })
          actions.push({ key: 'request_cancel', label: '取消订单', tone: 'ghost' })
        } else {
          actions.push({ key: 'apply_settlement', label: '已完成，申请结算', tone: 'primary' })
        }
      }
      if (
        status === 'settlement_pending'
        && this.userRole === 'seller'
        && (this.order.buyer_item_reported_at || this.saleItems.length === 0)
        && this.order.settlement_status !== 'seller_confirmed'
      ) {
        actions.push({ key: 'confirm_usage', label: this.sellerUsageConfirmActionLabel, tone: 'primary' })
        if (this.order.buyer_item_reported_at) {
          actions.push({ key: 'reject_usage', label: '不同意当前表单', tone: 'ghost' })
        }
      }
      return actions
    }
  },
  mounted() {
    this.startCountdownTicker()
    this.fetchOrderDetail()
    void this.loadBusinessSettings()
  },
  beforeUnmount() {
    this.stopCountdownTicker()
  },
  methods: {
    async loadBusinessSettings() {
      this.businessSettings = await fetchBusinessSettings()
    },
    startCountdownTicker() {
      this.stopCountdownTicker()
      this.countdownTimer = window.setInterval(() => {
        this.countdownNowTs = Date.now()
      }, 1000)
    },
    stopCountdownTicker() {
      if (this.countdownTimer) {
        window.clearInterval(this.countdownTimer)
        this.countdownTimer = null
      }
    },
    resetUsageForm() {
      const nextForm = {}
      this.saleItems.forEach((item) => {
        const reportRow = (Array.isArray(this.order?.item_usage_reports) ? this.order.item_usage_reports : [])
          .find((row) => row.item_key === item.item_key)
        nextForm[item.item_key] = Number(reportRow?.reported_quantity || 0)
      })
      this.usageForm = nextForm
    },
    async fetchOrderDetail() {
      if (!this.orderId) {
        this.error = '缺少订单ID参数'
        return
      }
      this.loading = true
      this.error = ''
      try {
        this.order = await apiFetch(`/api/orders/${this.orderId}`)
        this.resetUsageForm()
      } catch (error) {
        this.error = error.message || '加载订单详情失败'
      } finally {
        this.loading = false
      }
    },
    async onPaymentSuccess() {
      this.showPaymentModal = false
      await this.fetchOrderDetail()
    },
    async submitItemUsage() {
      const items = this.saleItems.map((item) => ({
        item_key: item.item_key,
        reported_quantity: Math.max(0, Math.min(Number(item.quantity || 0), Number(this.usageForm[item.item_key] || 0)))
      }))
      this.submitting = true
      try {
        await apiFetch(`/api/orders/${this.order.id}/item-usage`, {
          method: 'PUT',
          body: JSON.stringify({ items })
        })
        await this.fetchOrderDetail()
        showSuccessToast(this.saleItems.length > 0 ? '额外物品使用表单已提交' : '已确认本单无额外物品使用')
      } catch (error) {
        showErrorToast(error.message || '提交额外物品表单失败')
      } finally {
        this.submitting = false
      }
    },
    async handleUsagePrimaryAction() {
      if (this.userRole === 'seller') {
        await this.handleAction('confirm_usage')
        return
      }
      await this.submitItemUsage()
    },
    async handleAction(actionKey) {
      if (!this.order?.id || this.submitting) return
      try {
        switch (actionKey) {
          case 'pay':
            this.showPaymentModal = true
            return
          case 'verify':
            await this.runSimpleAction(
              `/api/orders/${this.order.id}/verify`,
              '已确认账号正常，订单继续履约',
              {
                title: '继续履约',
                message: '是否确认账号正常并继续履约？确认后将不可再发起取消订单。',
                confirmText: '确认继续',
                cancelText: '返回',
                tone: 'primary'
              }
            )
            return
          case 'confirm_usage':
            await this.runSimpleAction(
              `/api/orders/${this.order.id}/item-usage/confirm`,
              this.hasReportedUsageItems ? '卖家已确认额外物品使用情况' : '卖家已确认本单无额外物品使用',
              {
                title: this.hasReportedUsageItems ? '确认额外物品使用' : '确认无额外物品使用',
                message: this.hasReportedUsageItems
                  ? '是否确认买家当前提交的额外物品使用情况？确认后客服即可按此结果执行分账。'
                  : '是否确认本单无额外物品使用？确认后客服即可执行分账。',
                confirmText: '确认',
                cancelText: '返回',
                tone: 'primary'
              }
            )
            return
          case 'reject_usage':
            await this.rejectUsage()
            return
          case 'apply_settlement':
            await this.requestSettlement()
            return
          case 'request_cancel':
            await this.requestCancel()
            return
          default:
            return
        }
      } catch (_error) {
        // 由各方法自行提示
      }
    },
    async runSimpleAction(url, successMessage, confirmOptions = null) {
      if (confirmOptions) {
        const confirmed = await showConfirm(confirmOptions)
        if (!confirmed) return
      }
      this.submitting = true
      try {
        await apiFetch(url, { method: 'PUT' })
        await this.fetchOrderDetail()
        showSuccessToast(successMessage)
      } catch (error) {
        showErrorToast(error.message || '操作失败')
      } finally {
        this.submitting = false
      }
    },
    async requestCancel() {
      const reason = await showPrompt({
        title: '取消订单',
        message: '是否取消订单？提交申请后将转接客服处理。\n如果需要，请填写取消原因：',
        inputPlaceholder: '请输入取消原因（可选）',
        defaultValue: this.order?.cancel_reason || '',
        confirmText: '确认申请',
        cancelText: '取消',
        tone: 'danger'
      })
      if (reason === null) return
      this.submitting = true
      try {
        await apiFetch(`/api/orders/${this.order.id}/request-cancel`, {
          method: 'PUT',
          body: JSON.stringify({ reason: reason.trim() })
        })
        await this.fetchOrderDetail()
        showSuccessToast('取消申请已提交')
      } catch (error) {
        showErrorToast(error.message || '发起取消申请失败')
      } finally {
        this.submitting = false
      }
    },
    async requestSettlement() {
      const confirmed = await showConfirm({
        title: '申请结算',
        message: '将转接客服进入结算，是否继续？\n请在该页面提交额外物品使用表单，卖家确认后将进入结算。',
        confirmText: '继续',
        cancelText: '返回',
        tone: 'primary'
      })
      if (!confirmed) return
      this.submitting = true
      try {
        await apiFetch(`/api/orders/${this.order.id}/complete`, { method: 'PUT' })
        await this.fetchOrderDetail()
        showSuccessToast('订单已进入结算中')
      } catch (error) {
        showErrorToast(error.message || '申请结算失败')
      } finally {
        this.submitting = false
      }
    },
    async rejectUsage() {
      const note = await showPrompt({
        title: '不同意当前表单',
        message: '确认不同意买家当前提交的额外物品表单吗？订单将转接客服处理。\n如果需要，请填写不同意的原因：',
        inputPlaceholder: '请输入不同意的原因（可选）',
        confirmText: '确认不同意',
        cancelText: '返回',
        tone: 'danger'
      })
      if (note === null) return
      this.submitting = true
      try {
        await apiFetch(`/api/orders/${this.order.id}/item-usage/reject`, {
          method: 'PUT',
          body: JSON.stringify({ note: note.trim() })
        })
        await this.fetchOrderDetail()
        showSuccessToast('已转接客服处理结算争议')
      } catch (error) {
        showErrorToast(error.message || '发起结算争议失败')
      } finally {
        this.submitting = false
      }
    },
    formatMoney(value) {
      return formatMoneyPrecise(value)
    },
    formatDateTime(value) {
      if (!value) return '--'
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return String(value)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hour = String(date.getHours()).padStart(2, '0')
      const minute = String(date.getMinutes()).padStart(2, '0')
      const second = String(date.getSeconds()).padStart(2, '0')
      return `${year}-${month}-${day} ${hour}:${minute}:${second}`
    }
  }
}
</script>

<style scoped>
.order-detail {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px 16px 100px;
}

.state-card {
  padding: 48px 20px;
  text-align: center;
  border: 1px solid #e5e7eb;
  border-radius: 20px;
  background: #fff;
  color: #6b7280;
}

.state-card--error p {
  color: #b91c1c;
}

.hero {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 24px;
  border-radius: 22px;
  border: 1px solid #e5e7eb;
  background: linear-gradient(135deg, #eff6ff, #e0f2fe);
}

.hero--pending_payment { background: linear-gradient(135deg, #fffbeb, #fef3c7); }
.hero--completed { background: linear-gradient(135deg, #ecfdf5, #d1fae5); }
.hero--cancelled { background: linear-gradient(135deg, #f9fafb, #e5e7eb); }
.hero--support_handling { background: linear-gradient(135deg, #fef2f2, #fee2e2); }
.hero--settlement_pending { background: linear-gradient(135deg, #eff6ff, #dbeafe); }

.hero-kicker {
  margin: 0 0 6px;
  color: #6b7280;
  font-size: 13px;
}

.hero h2 {
  margin: 0;
  color: #111827;
  font-size: 28px;
}

.hero-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.hero-main {
  flex: 1;
  min-width: 0;
}

.hero-desc-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 10px;
}

.hero-desc {
  margin: 0;
  color: #475569;
  line-height: 1.7;
}

.hero-pay-btn {
  flex-shrink: 0;
  min-width: 112px;
}

.hero-chat-btn {
  flex-shrink: 0;
  min-width: 112px;
}

.pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  color: #1f2937;
  font-size: 13px;
  font-weight: 700;
}

.pill--warn {
  color: #c2410c;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.card {
  padding: 20px;
  border: 1px solid #e5e7eb;
  border-radius: 20px;
  background: #fff;
}

.card--wide {
  grid-column: 1 / -1;
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.card-head h3 {
  margin: 0;
  color: #111827;
  font-size: 18px;
}

.subtle {
  color: #6b7280;
  font-size: 13px;
}

.product {
  display: flex;
  gap: 16px;
}

.product-cover {
  width: 168px;
  min-width: 168px;
  height: 168px;
  object-fit: fill;
  border-radius: 16px;
  background: #f8fafc;
}

.product-cover--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  border: 1px dashed #cbd5e1;
}

.product-main h4 {
  margin: 0 0 10px;
  font-size: 20px;
  color: #111827;
}

.product-main p,
.note-list p {
  margin: 6px 0;
  color: #475569;
  line-height: 1.7;
}

.copy-inline {
  display: inline-flex;
  align-items: center;
}

.money-list,
.info-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.money-list div,
.info-list div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #f1f5f9;
}

.money-list div:last-child,
.info-list div:last-child {
  border-bottom: none;
}

.money-list span,
.info-list span {
  color: #6b7280;
}

.money-list strong,
.info-list strong {
  color: #111827;
}

.table {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.table-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: #f8fafc;
  color: #334155;
}

.table-row--head {
  background: #eff6ff;
  color: #1e3a8a;
  font-weight: 700;
}

.usage-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.usage-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding: 14px 16px;
  border-radius: 14px;
  background: #f8fafc;
}

.usage-row p {
  margin: 6px 0 0;
  color: #6b7280;
  font-size: 13px;
}

.usage-row input {
  width: 120px;
  min-height: 42px;
  padding: 0 12px;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  box-sizing: border-box;
}

.usage-actions,
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.empty-tip {
  color: #6b7280;
  line-height: 1.7;
}

.timeline {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.timeline-item {
  display: flex;
  gap: 12px;
}

.timeline-item p {
  margin: 0;
  color: #111827;
}

.timeline-item small {
  color: #6b7280;
}

.timeline-dot {
  width: 12px;
  height: 12px;
  margin-top: 4px;
  border-radius: 999px;
  background: #2563eb;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
  flex-shrink: 0;
}

.btn {
  min-height: 42px;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.btn--primary {
  background: #2563eb;
  color: #fff;
}

.btn--ghost {
  background: #fff;
  color: #1f2937;
  border-color: #d1d5db;
}

.btn--danger {
  background: #fef2f2;
  color: #b91c1c;
  border-color: #fecaca;
}

@media (max-width: 960px) {
  .grid {
    grid-template-columns: 1fr;
  }

  .product,
  .hero {
    flex-direction: column;
  }

  .hero-desc-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .hero-title-row {
    flex-direction: row;
    align-items: center;
    flex-wrap: wrap;
  }

  button.hero-chat-btn {
    width: auto;
    margin-left: auto;
    padding: 0 20px;
    min-height: 42px;
    font-size: 15px;
  }

  button.card-view-btn {
    width: auto;
    padding: 0 20px;
    min-height: 42px;
    font-size: 15px;
  }

  .hero-pay-btn {
    width: 100%;
  }

  .product-cover {
    width: 100%;
    min-width: 0;
    height: 220px;
  }

  .table-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .usage-row {
    flex-direction: column;
    align-items: stretch;
  }

  .usage-row input,
  .btn {
    width: 100%;
  }
}
</style>
