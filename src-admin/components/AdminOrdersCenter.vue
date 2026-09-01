<template>
  <section class="page">
    <div class="panel">
      <div class="panel-head">
        <span>共 {{ total }} 条</span>
        <span v-if="totalPages > 1">第 {{ page }} / {{ totalPages }} 页</span>
      </div>

      <div class="toolbar">
        <input
          v-model.trim="keyword"
          type="text"
          maxlength="50"
          class="toolbar-input"
          placeholder="搜索订单号、买家、卖家或商品标题"
          @keydown.enter.prevent="searchOrders"
        >
        <select v-model="status" class="toolbar-select" @change="searchOrders">
          <option v-for="option in statusOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <input
          v-model="date"
          type="date"
          class="toolbar-date"
          @keydown.enter.prevent="searchOrders"
        >
        <button type="button" class="row-btn" :disabled="loading" @click="searchOrders">
          {{ loading ? '搜索中...' : '搜索' }}
        </button>
        <button type="button" class="row-btn" :disabled="loading || !hasActiveFilter" @click="resetSearch">
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
              <th>客服</th>
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
              <td>{{ formatOrderStatusLabel(item) }}</td>
              <td>{{ item.assignee_name || '--' }}</td>
              <td>{{ formatMoney(item.amount) }}</td>
              <td>
                <div class="row-action-group">
                  <button
                    v-if="canReassignOrder(item)"
                    type="button"
                    class="row-btn"
                    :disabled="Boolean(orderSubmittingMap[item.id])"
                    @click="openReassignDialog(item)"
                  >
                    改派
                  </button>
                  <button
                    v-if="canCloseOrder(item)"
                    type="button"
                    class="row-btn row-btn--danger"
                    @click="closeOrder(item)"
                  >
                    {{ orderSubmittingMap[item.id] ? '处理中...' : '关闭订单' }}
                  </button>
                  <button
                    v-else-if="getRefundProcessingSceneLabel(item)"
                    type="button"
                    class="row-btn"
                    disabled
                  >
                    {{ getRefundProcessingSceneLabel(item) }}
                  </button>
                </div>
              </td>
              <td>{{ formatDateTime(item.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="totalPages > 1" class="pager">
        <button
          type="button"
          class="row-btn"
          :disabled="loading || page <= 1"
          @click="goPage(1)"
        >
          第一页
        </button>
        <button
          type="button"
          class="row-btn"
          :disabled="loading || page <= 1"
          @click="goPage(page - 1)"
        >
          上一页
        </button>
        <button
          v-for="p in pageButtons"
          :key="p"
          type="button"
          class="row-btn pager-num"
          :class="{ 'pager-num--active': p === page }"
          :disabled="loading"
          @click="goPage(p)"
        >
          {{ p }}
        </button>
        <button
          type="button"
          class="row-btn"
          :disabled="loading || page >= totalPages"
          @click="goPage(page + 1)"
        >
          下一页
        </button>
        <button
          type="button"
          class="row-btn"
          :disabled="loading || page >= totalPages"
          @click="goPage(totalPages)"
        >
          末页
        </button>
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

    <AdminConfirmDialog
      :open="Boolean(pendingReassignOrder)"
      title="改派订单客服"
      :message="reassignConfirmMessage"
      confirm-text="确认改派"
      :loading="Boolean(pendingReassignOrder && orderSubmittingMap[pendingReassignOrder.id])"
      @cancel="pendingReassignOrder = null"
      @confirm="confirmReassignOrder"
    >
      <div class="reassign-picker">
        <label class="reassign-picker__label">接单客服</label>
        <select
          v-model.number="reassignTargetId"
          class="reassign-picker__select"
          :disabled="supportLoading || Boolean(pendingReassignOrder && orderSubmittingMap[pendingReassignOrder.id])"
        >
          <option :value="0" disabled>
            {{ supportLoading ? '正在加载客服列表...' : (reassignSupportOptions.length ? '请选择客服' : '暂无其他在职客服') }}
          </option>
          <option v-for="opt in reassignSupportOptions" :key="opt.id" :value="opt.id">
            {{ opt.username }}（#{{ opt.id }}）
          </option>
        </select>
      </div>
    </AdminConfirmDialog>
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

// 与生产库 orders.status ENUM 保持一致（app.js 启动迁移已将历史状态归并：
// after_sale→support_handling、refund_pending/refunded→cancelled、in_progress→paid）
const ORDER_STATUS_LABELS = Object.freeze({
  pending_payment: '待付款',
  paid: '已支付',
  support_handling: '客服处理中',
  settlement_pending: '待结算',
  deposit_holding: '押金保管中',
  completed: '已完成',
  cancelled: '已取消'
})

// 资金在途场景：退款/打款已在处理中，后台再关单会造成重复退款/付款，按钮禁用等对账任务自动收尾
const REFUND_PROCESSING_SCENE_LABELS = Object.freeze({
  cancel_refund_processing: '客服取消退款中',
  admin_close_refund_processing: '关单退款中',
  settlement_funds_processing: '结算打款中',
  frozen_funds_processing: '冻结资金处理中',
  deposit_funds_processing: '押金退款中'
})

const AUTO_REFRESH_INTERVAL_MS = 30000

const ORDER_STATUS_OPTIONS = Object.freeze([
  { value: 'all', label: '全部状态' },
  ...Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => ({ value, label }))
])

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
      status: 'all',
      page: 1,
      pageSize: 20,
      total: 0,
      orders: [],
      pendingCloseOrder: null,
      pendingReassignOrder: null,
      reassignTargetId: 0,
      supportOptions: [],
      supportLoading: false,
      orderSubmittingMap: {},
      actionMessage: '',
      actionMessageType: 'success',
      statusOptions: ORDER_STATUS_OPTIONS,
      autoRefreshTimer: null,
      refreshing: false,
      handleWindowFocus: null
    }
  },
  async mounted() {
    await this.loadOrders()
    this.startAutoRefresh()
  },
  beforeUnmount() {
    this.stopAutoRefresh()
  },
  computed: {
    hasActiveFilter() {
      return Boolean(this.keyword || this.date) || this.status !== 'all'
    },
    closeOrderConfirmMessage() {
      const order = this.pendingCloseOrder
      if (!order) return ''
      const isPaid = String(order.status || '') !== 'pending_payment'
      if (isPaid) {
        return `确认关闭订单 ${order.order_no || '--'} 吗？该订单已支付，关闭后将原路退款给买家（退款通常 1-2 个工作日到账），商品将转为已下架；若退款仍在处理中，订单将在到账后自动完成关闭。`
      }
      return `确认关闭订单 ${order.order_no || '--'} 吗？关闭后将通知汇付关闭未支付的支付单，商品将转为已下架。`
    },
    reassignConfirmMessage() {
      const order = this.pendingReassignOrder
      if (!order) return ''
      const assigneeName = order.assignee_name || '原客服'
      return `将订单 ${order.order_no || '--'} 的负责客服由 ${assigneeName} 改派给其他客服接管。改派后仅接单客服可执行该订单的客服操作（继续履约、取消、结算分账等），买卖双方不受影响。`
    },
    reassignSupportOptions() {
      const currentAssigneeId = Number(this.pendingReassignOrder?.support_assignee_id || 0)
      return this.supportOptions.filter((item) => (
        Number(item.id) !== currentAssigneeId
        && !item.banned_until
        && String(item.role || '') === 'support'
      ))
    },
    totalPages() {
      return Math.max(1, Math.ceil(Number(this.total || 0) / this.pageSize))
    },
    pageButtons() {
      const current = this.page
      const last = this.totalPages
      // 以当前页为中心取最多 5 个连续页码，收边不越界
      let start = Math.max(1, Math.min(current - 2, last - 4))
      const end = Math.min(last, start + 4)
      start = Math.max(1, end - 4)
      const buttons = []
      for (let p = start; p <= end; p += 1) {
        buttons.push(p)
      }
      return buttons
    }
  },
  methods: {
    // 静默刷新（silent=true）供定时/聚焦同步用：不转圈、不清提示，避免打断管理员阅读操作结果
    async loadOrders(silent = false) {
      if (silent && (this.loading || this.refreshing)) return
      if (silent) {
        this.refreshing = true
      } else {
        this.loading = true
        this.error = ''
        this.actionMessage = ''
      }
      try {
        const params = new URLSearchParams({
          page: String(this.page),
          pageSize: String(this.pageSize),
          keyword: this.keyword,
          status: this.status
        })
        if (this.date) {
          params.set('date', this.date)
        }
        const data = await apiFetch(`/api/admin/orders?${params.toString()}`)
        this.total = Number(data.total || 0)
        if (Number(data.page)) {
          this.page = Number(data.page)
        }
        this.orders = Array.isArray(data.list) ? data.list : []
        if (silent) {
          // 同步后刷新确认弹窗里的订单快照，避免用旧状态提交
          const pendingId = Number(this.pendingCloseOrder?.id || 0)
          if (pendingId) {
            const fresh = this.orders.find((order) => Number(order.id) === pendingId)
            if (fresh) this.pendingCloseOrder = fresh
          }
          const pendingReassignId = Number(this.pendingReassignOrder?.id || 0)
          if (pendingReassignId) {
            const fresh = this.orders.find((order) => Number(order.id) === pendingReassignId)
            if (fresh) this.pendingReassignOrder = fresh
          }
        }
      } catch (error) {
        if (!silent) this.error = error.message || '获取订单列表失败'
      } finally {
        this.refreshing = false
        this.loading = false
      }
    },
    startAutoRefresh() {
      // 客服侧取消/关闭不会推送管理侧，定时+聚焦静默拉取保证状态同步
      this.autoRefreshTimer = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
        this.loadOrders(true)
      }, AUTO_REFRESH_INTERVAL_MS)
      this.handleWindowFocus = () => this.loadOrders(true)
      window.addEventListener('focus', this.handleWindowFocus)
    },
    stopAutoRefresh() {
      if (this.autoRefreshTimer) {
        clearInterval(this.autoRefreshTimer)
        this.autoRefreshTimer = null
      }
      if (this.handleWindowFocus) {
        window.removeEventListener('focus', this.handleWindowFocus)
        this.handleWindowFocus = null
      }
    },
    searchOrders() {
      // 换搜索词后结果集变化，回到第一页
      this.page = 1
      this.loadOrders()
    },
    goPage(target) {
      const next = Math.min(Math.max(1, Number(target) || 1), this.totalPages)
      if (next === this.page) return
      this.page = next
      this.loadOrders()
    },
    resetSearch() {
      this.keyword = ''
      this.date = ''
      this.status = 'all'
      this.page = 1
      this.loadOrders()
    },
    getRefundProcessingSceneLabel(item) {
      return REFUND_PROCESSING_SCENE_LABELS[String(item?.support_scene || '')] || ''
    },
    canCloseOrder(item) {
      if (Boolean(this.orderSubmittingMap[item.id])) return false
      if (this.getRefundProcessingSceneLabel(item)) return false
      return !['cancelled', 'completed'].includes(String(item.status || ''))
    },
    // 终态订单保留原客服归属作历史统计；有负责客服的非终态订单才可改派
    canReassignOrder(item) {
      if (!Number(item.support_assignee_id || 0)) return false
      return !['cancelled', 'completed'].includes(String(item.status || ''))
    },
    async openReassignDialog(item) {
      if (!this.canReassignOrder(item)) return
      this.pendingReassignOrder = item
      this.reassignTargetId = 0
      await this.loadSupportOptions()
      const firstOption = this.reassignSupportOptions[0]
      this.reassignTargetId = firstOption ? firstOption.id : 0
    },
    async loadSupportOptions() {
      this.supportLoading = true
      try {
        const data = await apiFetch('/api/admin/users?role=support&page=1&pageSize=100')
        this.supportOptions = Array.isArray(data.list) ? data.list : []
      } catch (error) {
        this.supportOptions = []
        this.actionMessageType = 'error'
        this.actionMessage = error.message || '获取客服列表失败'
      } finally {
        this.supportLoading = false
      }
    },
    async confirmReassignOrder() {
      const item = this.pendingReassignOrder
      if (!item) return
      if (!this.reassignTargetId) {
        this.actionMessageType = 'error'
        this.actionMessage = this.reassignSupportOptions.length
          ? '请先选择接单客服'
          : '暂无其他在职客服可接单，请先在用户管理中新增客服'
        return
      }

      this.orderSubmittingMap = {
        ...this.orderSubmittingMap,
        [item.id]: true
      }
      this.actionMessage = ''

      try {
        const data = await this.runProtectedAction('reassign_order_support', () => apiFetch(`/api/admin/orders/${item.id}/reassign`, {
          method: 'PUT',
          body: JSON.stringify({ supportUserId: this.reassignTargetId })
        }))
        const updatedOrder = data.order || {}
        this.orders = this.orders.map((order) => (
          Number(order.id) === Number(item.id)
            ? { ...order, ...updatedOrder }
            : order
        ))
        this.actionMessageType = 'success'
        this.actionMessage = data.message || `订单 ${item.order_no} 已改派`
        this.pendingReassignOrder = null
      } catch (error) {
        this.actionMessageType = 'error'
        this.actionMessage = error.message || '改派失败'
      } finally {
        this.orderSubmittingMap = {
          ...this.orderSubmittingMap,
          [item.id]: false
        }
      }
    },
    async closeOrder(item) {
      if (!this.canCloseOrder(item)) return
      this.pendingCloseOrder = item
    },
    async confirmCloseOrder() {
      const item = this.pendingCloseOrder
      if (!item) return
      // 弹窗打开期间订单可能已被客服取消/进入资金处理（静默刷新会同步快照），此时说明原因而非无声关闭
      if (!this.canCloseOrder(item)) {
        const sceneLabel = this.getRefundProcessingSceneLabel(item)
        this.actionMessageType = 'error'
        this.actionMessage = sceneLabel
          ? `订单 ${item.order_no} 已${sceneLabel}，退款到账后将自动关闭，请稍后刷新查看`
          : '订单状态已变更（可能已由客服处理），请刷新后查看最新状态'
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
    formatOrderStatusLabel(item) {
      const statusLabel = this.formatOrderStatus(item.status)
      const sceneLabel = this.getRefundProcessingSceneLabel(item)
      return sceneLabel && String(item.status || '') === 'support_handling'
        ? `${statusLabel}·${sceneLabel}`
        : statusLabel
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
.toolbar-select,
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

.toolbar-select {
  min-width: 150px;
  color: #111827;
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

.row-action-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.reassign-picker {
  margin-top: 16px;
}

.reassign-picker__label {
  display: block;
  margin-bottom: 8px;
  color: #374151;
  font-size: 14px;
}

.reassign-picker__select {
  width: 100%;
  min-height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #111827;
  font-size: 14px;
}

.reassign-picker__select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
}

.pager-num {
  min-width: 40px;
  padding: 0 10px;
}

.pager-num--active {
  border-color: #1d4ed8;
  background: #1d4ed8;
  color: #fff;
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
