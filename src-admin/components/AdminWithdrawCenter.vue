<template>
  <section class="page">
    <div class="summary-grid">
      <article class="summary-card">
        <span>待审核</span>
        <strong>{{ summary.pending_review }}</strong>
      </article>
      <article class="summary-card">
        <span>处理中</span>
        <strong>{{ summary.processing }}</strong>
      </article>
      <article class="summary-card">
        <span>已打款</span>
        <strong>{{ summary.success }}</strong>
      </article>
      <article class="summary-card">
        <span>驳回/失败</span>
        <strong>{{ summary.rejected + summary.failed }}</strong>
      </article>
    </div>

    <div class="panel">
      <div class="panel-head">
        <span>共 {{ filteredRequests.length }} 条</span>
      </div>

      <div class="toolbar">
        <input
          v-model.trim="keyword"
          type="text"
          maxlength="50"
          class="toolbar-input"
          placeholder="搜索提现单号、用户名、手机号"
          @keydown.enter.prevent="applyFilters"
        >
        <div class="toolbar-tabs">
          <button
            v-for="tab in statusTabs"
            :key="tab.value"
            type="button"
            class="filter-chip"
            :class="{ 'filter-chip--active': activeStatus === tab.value }"
            @click="changeStatus(tab.value)"
          >
            {{ tab.label }}
          </button>
        </div>
        <button type="button" class="row-btn" :disabled="loading" @click="loadRequests">
          {{ loading ? '刷新中...' : '刷新' }}
        </button>
      </div>

      <div v-if="error" class="state-card state-card--error">{{ error }}</div>
      <div v-else-if="loading" class="state-card">正在加载提现申请...</div>
      <div v-else-if="!filteredRequests.length" class="state-card">当前筛选条件下暂无提现申请。</div>
      <div v-else class="content-grid">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>提现单号</th>
                <th>用户</th>
                <th>手机号</th>
                <th>提现方式</th>
                <th>到账金额</th>
                <th>状态</th>
                <th>申请时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in filteredRequests"
                :key="item.id"
                :class="{ 'table-row--active': Number(item.id) === Number(activeRequestId) }"
                @click="selectRequest(item.id)"
              >
                <td>{{ item.request_no }}</td>
                <td>{{ item.username || '--' }}</td>
                <td>{{ item.phone || '--' }}</td>
                <td>{{ getChannelLabel(item.channel) }}</td>
                <td>{{ formatMoney(item.net_amount) }}</td>
                <td>
                  <span class="status-badge" :class="`status-badge--${item.status}`">
                    {{ getStatusLabel(item.status) }}
                  </span>
                </td>
                <td>{{ formatDateTime(item.created_at) }}</td>
                <td>
                  <div class="row-actions">
                    <button
                      v-if="canApprove(item)"
                      type="button"
                      class="row-btn"
                      :disabled="Boolean(submittingMap[item.id])"
                      @click.stop="openReviewDialog(item, 'approve')"
                    >
                      通过
                    </button>
                    <button
                      v-if="canReject(item)"
                      type="button"
                      class="row-btn row-btn--danger"
                      :disabled="Boolean(submittingMap[item.id])"
                      @click.stop="openReviewDialog(item, 'reject')"
                    >
                      驳回
                    </button>
                    <button
                      v-if="Number(item.id) !== Number(activeRequestId)"
                      type="button"
                      class="row-btn row-btn--ghost"
                      @click.stop="selectRequest(item.id)"
                    >
                      详情
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <aside class="detail-card">
          <template v-if="activeRequest">
            <div class="detail-head">
              <strong>审核详情</strong>
              <span class="status-badge" :class="`status-badge--${activeRequest.status}`">
                {{ getStatusLabel(activeRequest.status) }}
              </span>
            </div>

            <div class="detail-grid">
              <div>
                <span>提现单号</span>
                <strong>{{ activeRequest.request_no }}</strong>
              </div>
              <div>
                <span>申请用户</span>
                <strong>{{ activeRequest.username || '--' }}</strong>
              </div>
              <div>
                <span>手机号</span>
                <strong>{{ activeRequest.phone || '--' }}</strong>
              </div>
              <div>
                <span>提现方式</span>
                <strong>{{ getChannelLabel(activeRequest.channel) }}</strong>
              </div>
              <div>
                <span>提现金额</span>
                <strong>{{ formatMoney(activeRequest.amount) }}</strong>
              </div>
              <div>
                <span>到账金额</span>
                <strong>{{ formatMoney(activeRequest.net_amount) }}</strong>
              </div>
              <div>
                <span>收款人</span>
                <strong>{{ activeRequest.account_name || '--' }}</strong>
              </div>
              <div>
                <span>收款账号</span>
                <strong>{{ activeRequest.account_no_masked || '--' }}</strong>
              </div>
              <div>
                <span>申请时间</span>
                <strong>{{ formatDateTime(activeRequest.created_at) }}</strong>
              </div>
              <div>
                <span>审核时间</span>
                <strong>{{ formatDateTime(activeRequest.reviewed_at) }}</strong>
              </div>
            </div>

            <label class="detail-field">
              <span>审核备注</span>
              <textarea
                v-model.trim="remarkDraft"
                rows="4"
                maxlength="255"
                class="detail-textarea"
                placeholder="填写审核说明，驳回时建议说明具体原因"
              ></textarea>
            </label>

            <div class="detail-notes">
              <p><strong>申请备注：</strong>{{ activeRequest.remark || '无' }}</p>
              <p v-if="activeRequest.failure_reason"><strong>失败原因：</strong>{{ activeRequest.failure_reason }}</p>
              <p v-if="reviewDebugCallbackPath"><strong>联调回调：</strong>{{ reviewDebugCallbackPath }}</p>
            </div>

            <div class="detail-actions">
              <button
                v-if="canApprove(activeRequest)"
                type="button"
                class="row-btn"
                :disabled="Boolean(submittingMap[activeRequest.id])"
                @click="openReviewDialog(activeRequest, 'approve')"
              >
                {{ submittingMap[activeRequest.id] ? '处理中...' : '通过并发起打款' }}
              </button>
              <button
                v-if="canReject(activeRequest)"
                type="button"
                class="row-btn row-btn--danger"
                :disabled="Boolean(submittingMap[activeRequest.id])"
                @click="openReviewDialog(activeRequest, 'reject')"
              >
                {{ submittingMap[activeRequest.id] ? '处理中...' : '驳回并退回余额' }}
              </button>
            </div>
          </template>
          <div v-else class="state-card">请选择一条提现申请查看详情。</div>
        </aside>
      </div>

      <p v-if="actionMessage" class="inline-message" :class="{ 'inline-message--error': actionMessageType === 'error' }">
        {{ actionMessage }}
      </p>
    </div>

    <AdminConfirmDialog
      :open="Boolean(pendingReview)"
      :title="pendingReview?.action === 'approve' ? '确认通过提现申请' : '确认驳回提现申请'"
      :message="reviewConfirmMessage"
      :confirm-text="pendingReview?.action === 'approve' ? '确认通过' : '确认驳回'"
      :loading="Boolean(pendingReview && submittingMap[pendingReview.item.id])"
      :danger="pendingReview?.action === 'reject'"
      @cancel="pendingReview = null"
      @confirm="confirmReview"
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

const EMPTY_SUMMARY = Object.freeze({
  pending_review: 0,
  processing: 0,
  success: 0,
  failed: 0,
  rejected: 0,
  cancelled: 0
})

export default {
  name: 'AdminWithdrawCenter',
  components: {
    AdminConfirmDialog
  },
  data() {
    return {
      loading: false,
      error: '',
      keyword: '',
      activeStatus: 'pending_review',
      requests: [],
      activeRequestId: 0,
      remarkDraft: '',
      submittingMap: {},
      pendingReview: null,
      actionMessage: '',
      actionMessageType: 'success',
      reviewDebugCallbackPath: ''
    }
  },
  computed: {
    summary() {
      return this.requests.reduce((result, item) => {
        const key = String(item.status || '').trim()
        if (Object.prototype.hasOwnProperty.call(result, key)) {
          result[key] += 1
        }
        return result
      }, { ...EMPTY_SUMMARY })
    },
    statusTabs() {
      return [
        { value: 'pending_review', label: `待审核 ${this.summary.pending_review}` },
        { value: 'processing', label: `处理中 ${this.summary.processing}` },
        { value: 'success', label: `已打款 ${this.summary.success}` },
        { value: 'failed', label: `打款失败 ${this.summary.failed}` },
        { value: 'rejected', label: `已驳回 ${this.summary.rejected}` }
      ]
    },
    filteredRequests() {
      const keyword = String(this.keyword || '').trim().toLowerCase()
      return this.requests.filter((item) => {
        if (String(item.status || '').trim() !== this.activeStatus) return false
        if (!keyword) return true
        const haystack = [
          item.request_no,
          item.username,
          item.phone,
          item.account_name,
          item.account_no_masked
        ]
          .map((value) => String(value || '').toLowerCase())
          .join(' ')
        return haystack.includes(keyword)
      })
    },
    activeRequest() {
      return this.requests.find((item) => Number(item.id) === Number(this.activeRequestId)) || null
    },
    reviewConfirmMessage() {
      if (!this.pendingReview?.item) return ''
      const item = this.pendingReview.item
      if (this.pendingReview.action === 'approve') {
        return `确认通过提现申请 ${item.request_no} 吗？系统将按当前支付配置发起打款。`
      }
      return `确认驳回提现申请 ${item.request_no} 吗？驳回后金额会退回用户钱包余额。`
    }
  },
  watch: {
    activeRequest: {
      immediate: true,
      handler(value) {
        this.remarkDraft = value?.remark || ''
        this.reviewDebugCallbackPath = ''
      }
    }
  },
  async mounted() {
    await this.loadRequests()
  },
  methods: {
    async loadRequests() {
      this.loading = true
      this.error = ''
      this.actionMessage = ''
      try {
        const data = await apiFetch('/api/admin/withdraw-requests')
        this.requests = Array.isArray(data.list) ? data.list : []
        this.ensureActiveRequest()
      } catch (error) {
        this.error = error.message || '获取提现审核列表失败'
      } finally {
        this.loading = false
      }
    },
    applyFilters() {
      this.ensureActiveRequest()
    },
    changeStatus(status) {
      this.activeStatus = status
      this.ensureActiveRequest()
    },
    ensureActiveRequest() {
      if (this.filteredRequests.some((item) => Number(item.id) === Number(this.activeRequestId))) return
      this.activeRequestId = this.filteredRequests[0]?.id || 0
    },
    selectRequest(requestId) {
      this.activeRequestId = Number(requestId || 0)
    },
    canApprove(item) {
      return String(item?.status || '').trim() === 'pending_review' && !this.submittingMap[item.id]
    },
    canReject(item) {
      return String(item?.status || '').trim() === 'pending_review' && !this.submittingMap[item.id]
    },
    openReviewDialog(item, action) {
      if (!item || !['approve', 'reject'].includes(action)) return
      this.pendingReview = { item, action }
    },
    async confirmReview() {
      const pending = this.pendingReview
      if (!pending?.item) return
      const item = pending.item
      const submittingKey = Number(item.id || 0)
      this.submittingMap = {
        ...this.submittingMap,
        [submittingKey]: true
      }
      this.actionMessage = ''
      try {
        const data = await this.runProtectedAction('batch_operation', () => apiFetch(`/api/admin/withdraw-requests/${item.id}/review`, {
          method: 'POST',
          body: JSON.stringify({
            action: pending.action,
            remark: this.remarkDraft
          })
        }))
        const updatedRequest = data.withdraw_request || {}
        this.requests = this.requests.map((request) => (
          Number(request.id) === Number(item.id) ? { ...request, ...updatedRequest } : request
        ))
        this.activeRequestId = Number(updatedRequest.id || item.id || 0)
        this.actionMessageType = 'success'
        this.actionMessage = pending.action === 'approve' ? '提现申请已通过' : '提现申请已驳回'
        this.reviewDebugCallbackPath = String(data?.callback_debug?.withdraw_callback_path || '').trim()
        this.ensureActiveRequest()
      } catch (error) {
        this.actionMessageType = 'error'
        this.actionMessage = error.message || '提交提现审核失败'
      } finally {
        this.submittingMap = {
          ...this.submittingMap,
          [submittingKey]: false
        }
        this.pendingReview = null
      }
    },
    async runProtectedAction(action, requester) {
      try {
        return await requester()
      } catch (error) {
        if (!isStepUpRequiredError(error)) throw error
        if (getStepUpRequirementReason(error) === 'trusted_device_required') {
          throw new Error(getStepUpRequirementMessage(error))
        }
        await performAdminStepUp(action)
        return requester()
      }
    },
    getStatusLabel(status) {
      const labelMap = {
        pending_review: '待审核',
        processing: '处理中',
        success: '已打款',
        failed: '打款失败',
        rejected: '已驳回',
        cancelled: '已取消'
      }
      return labelMap[String(status || '').trim()] || String(status || '--')
    },
    getChannelLabel(channel) {
      const labelMap = {
        alipay: '支付宝',
        bank: '银行卡',
        wechat: '微信零钱'
      }
      return labelMap[String(channel || '').trim().toLowerCase()] || '其他方式'
    },
    formatMoney(value) {
      const amount = Number(value)
      if (!Number.isFinite(amount)) return '--'
      return `¥ ${Math.round(amount / 100).toLocaleString('zh-CN')}`
    },
    formatDateTime(value) {
      if (!value) return '--'
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return String(value)
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
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

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.summary-card,
.panel,
.state-card,
.detail-card {
  border-radius: 18px;
  background: #fff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.08);
}

.summary-card,
.panel,
.state-card,
.detail-card {
  padding: 20px;
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.summary-card span,
.panel-head span {
  color: #6b7280;
  font-size: 14px;
}

.summary-card strong {
  color: #111827;
  font-size: 30px;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-head,
.detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel-head strong,
.detail-head strong {
  color: #111827;
  font-size: 20px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-input,
.detail-textarea {
  border-radius: 12px;
  border: 1px solid #d1d5db;
  background: #fff;
}

.toolbar-input {
  flex: 1;
  min-width: 240px;
  min-height: 42px;
  padding: 0 14px;
}

.toolbar-tabs {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.filter-chip {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #475569;
}

.filter-chip--active {
  border-color: #93c5fd;
  background: #eff6ff;
  color: #1d4ed8;
  font-weight: 700;
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(320px, 0.95fr);
  gap: 16px;
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
  padding: 13px 10px;
  border-bottom: 1px solid #e5e7eb;
  text-align: left;
  white-space: nowrap;
  font-size: 14px;
}

.table th {
  color: #6b7280;
}

.table-row--active {
  background: #f8fbff;
}

.row-actions,
.detail-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.row-btn {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
}

.row-btn--danger {
  border-color: #fecaca;
  background: #fef2f2;
  color: #b91c1c;
}

.row-btn--ghost {
  border-color: #d1d5db;
  background: #fff;
  color: #334155;
}

.row-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.detail-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.detail-grid div,
.detail-notes {
  padding: 14px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
}

.detail-grid span,
.detail-field span {
  display: block;
  color: #6b7280;
  font-size: 13px;
}

.detail-grid strong {
  display: block;
  margin-top: 6px;
  color: #111827;
  line-height: 1.6;
}

.detail-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-textarea {
  min-height: 112px;
  padding: 12px 14px;
  resize: vertical;
}

.detail-notes {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: #475569;
  line-height: 1.7;
}

.detail-notes p {
  margin: 0;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
}

.status-badge--pending_review,
.status-badge--processing {
  color: #b45309;
  background: #fef3c7;
}

.status-badge--success {
  color: #047857;
  background: #d1fae5;
}

.status-badge--failed,
.status-badge--rejected {
  color: #b91c1c;
  background: #fee2e2;
}

.status-badge--cancelled {
  color: #4b5563;
  background: #e5e7eb;
}

.inline-message {
  margin: 0;
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
}

@media (max-width: 1280px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .content-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .summary-grid,
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .toolbar {
    align-items: stretch;
  }

  .toolbar-input {
    min-width: 0;
    width: 100%;
  }
}
</style>
