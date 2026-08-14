<template>
  <section class="page">
    <div class="panel">
      <div class="panel-head">
        <span>共 {{ orders.length }} 条</span>
      </div>

      <div class="toolbar">
        <input
          v-model.trim="keyword"
          type="text"
          maxlength="50"
          class="toolbar-input"
          placeholder="搜索订单号、买家、卖家或商品标题"
          @keydown.enter.prevent="loadOrders"
        >
        <input
          v-model="date"
          type="date"
          class="toolbar-date"
          @keydown.enter.prevent="loadOrders"
        >
        <button type="button" class="row-btn" :disabled="loading" @click="loadOrders">
          {{ loading ? '搜索中...' : '搜索' }}
        </button>
        <button type="button" class="row-btn" :disabled="loading || !(keyword || date)" @click="resetSearch">
          重置
        </button>
      </div>

      <div v-if="error" class="state-card state-card--error">{{ error }}</div>
      <div v-else-if="loading" class="state-card">正在加载订单...</div>
      <div v-else class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>订单号</th>
              <th>买家</th>
              <th>卖家</th>
              <th>状态</th>
              <th>金额</th>
              <th>操作</th>
              <th>创建时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in orders" :key="item.id">
              <td>{{ item.id }}</td>
              <td>{{ item.order_no }}</td>
              <td>{{ item.buyer_name }}</td>
              <td>{{ item.seller_name || '--' }}</td>
              <td>{{ formatOrderStatus(item.status) }}</td>
              <td>{{ formatMoney(item.amount) }}</td>
              <td>
                <button
                  v-if="canCloseOrder(item)"
                  type="button"
                  class="row-btn row-btn--danger"
                  @click="closeOrder(item)"
                >
                  {{ orderSubmittingMap[item.id] ? '处理中...' : '关闭订单' }}
                </button>
              </td>
              <td>{{ formatDateTime(item.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-if="actionMessage" class="inline-message" :class="{ 'inline-message--error': actionMessageType === 'error' }">
        {{ actionMessage }}
      </p>
    </div>

    <AdminConfirmDialog
      :open="Boolean(pendingCloseOrder)"
      title="确认关闭订单"
      :message="closeOrderConfirmMessage"
      confirm-text="确认关闭"
      :loading="Boolean(pendingCloseOrder && orderSubmittingMap[pendingCloseOrder.id])"
      danger
      @cancel="pendingCloseOrder = null"
      @confirm="confirmCloseOrder"
    />
  </section>
</template>

<script>
import {
  apiFetch,
  getStepUpRequirementMessage,
  getStepUpRequirementReason,
  isStepUpRequiredError,
  performAdminStepUp
} from '../utils/api.js'
import AdminConfirmDialog from './AdminConfirmDialog.vue'

const ORDER_STATUS_LABELS = Object.freeze({
  pending_payment: '待付款',
  paid: '已支付',
  in_progress: '进行中',
  completed: '已完成',
  after_sale: '售后中',
  support_handling: '客服处理中',
  settlement_pending: '待结算',
  cancelled: '已取消',
  refund_pending: '退款中',
  refunded: '已退款'
})

export default {
  name: 'AdminOrdersCenter',
  components: {
    AdminConfirmDialog
  },
  data() {
    return {
      loading: false,
      error: '',
      keyword: '',
      date: '',
      orders: [],
      pendingCloseOrder: null,
      orderSubmittingMap: {},
      actionMessage: '',
      actionMessageType: 'success'
    }
  },
  async mounted() {
    await this.loadOrders()
  },
  computed: {
    closeOrderConfirmMessage() {
      const order = this.pendingCloseOrder
      if (!order) return ''
      const isPaid = String(order.status || '') !== 'pending_payment'
      if (isPaid) {
        return `确认关闭订单 ${order.order_no || '--'} 吗？该订单已支付，关闭后将原路退款给买家（退款通常 1-2 个工作日到账）；若退款仍在处理中，订单将在到账后自动完成关闭。`
      }
      return `确认关闭订单 ${order.order_no || '--'} 吗？关闭后将通知汇付关闭未支付的支付单，商品将重新上架。`
    }
  },
  methods: {
    async loadOrders() {
      this.loading = true
      this.error = ''
      this.actionMessage = ''
      try {
        const params = new URLSearchParams({
          page: '1',
          pageSize: '20',
          keyword: this.keyword
        })
        if (this.date) {
          params.set('date', this.date)
        }
        const data = await apiFetch(`/api/admin/orders?${params.toString()}`)
        this.orders = Array.isArray(data.list) ? data.list : []
      } catch (error) {
        this.error = error.message || '获取订单列表失败'
      } finally {
        this.loading = false
      }
    },
    resetSearch() {
      this.keyword = ''
      this.date = ''
      this.loadOrders()
    },
    canCloseOrder(item) {
      if (Boolean(this.orderSubmittingMap[item.id])) return false
      return !['cancelled', 'completed', 'refunded'].includes(String(item.status || ''))
    },
    async closeOrder(item) {
      if (!this.canCloseOrder(item)) return
      this.pendingCloseOrder = item
    },
    async confirmCloseOrder() {
      const item = this.pendingCloseOrder
      if (!item || !this.canCloseOrder(item)) {
        this.pendingCloseOrder = null
        return
      }

      this.orderSubmittingMap = {
        ...this.orderSubmittingMap,
        [item.id]: true
      }
      this.actionMessage = ''

      try {
        const data = await this.runProtectedAction('close_order', () => apiFetch(`/api/admin/orders/${item.id}/close`, {
          method: 'PUT'
        }))
        const updatedOrder = data.order || {}
        this.orders = this.orders.map((order) => (
          Number(order.id) === Number(item.id)
            ? { ...order, ...updatedOrder }
            : order
        ))
        this.actionMessageType = 'success'
        this.actionMessage = data.message || `订单 ${item.order_no} 已关闭`
      } catch (error) {
        this.actionMessageType = 'error'
        this.actionMessage = error.message || '关闭订单失败'
      } finally {
        this.orderSubmittingMap = {
          ...this.orderSubmittingMap,
          [item.id]: false
        }
        this.pendingCloseOrder = null
      }
    },
    async runProtectedAction(action, requester) {
      try {
        return await requester()
      } catch (error) {
        if (!isStepUpRequiredError(error)) {
          throw error
        }
        if (getStepUpRequirementReason(error) === 'trusted_device_required') {
          throw new Error(getStepUpRequirementMessage(error))
        }
        await performAdminStepUp(action)
        return requester()
      }
    },
    formatOrderStatus(status) {
      return ORDER_STATUS_LABELS[String(status || '').trim()] || String(status || '--')
    },
    formatDateTime(value) {
      if (!value) return '--'
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return String(value)
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    },
    formatMoney(value) {
      const amount = Number(value)
      if (!Number.isFinite(amount)) return '--'
      return `¥ ${Math.round(amount / 100).toLocaleString('zh-CN')}`
    }
  }
}
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel,
.state-card {
  border-radius: 18px;
  background: #fff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.08);
}

.panel,
.state-card {
  padding: 20px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.panel-head span {
  color: #6b7280;
  font-size: 13px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.toolbar-input,
.toolbar-date {
  min-height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid #d1d5db;
  background: #fff;
}

.toolbar-input {
  flex: 1;
}

.toolbar-date {
  min-width: 170px;
}

.table-wrap {
  overflow-x: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table th,
.table td {
  padding: 12px 10px;
  border-bottom: 1px solid #e5e7eb;
  text-align: left;
  white-space: nowrap;
  font-size: 14px;
}

.table th {
  color: #6b7280;
  font-weight: 600;
}

.row-btn {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  background: #eff6ff;
  color: #1d4ed8;
}

.row-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.row-btn--danger {
  border-color: #fecaca;
  background: #fef2f2;
  color: #b91c1c;
}

.inline-message {
  margin: 12px 0 0;
  color: #047857;
  font-size: 14px;
}

.inline-message--error,
.state-card--error {
  color: #b91c1c;
}

.state-card--error {
  border-color: #fecaca;
  background: #fff1f2;
  box-shadow: none;
}

@media (max-width: 960px) {
  .toolbar {
    flex-wrap: wrap;
  }
}
</style>
