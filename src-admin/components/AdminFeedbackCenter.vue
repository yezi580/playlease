<template>
  <section class="page">
    <div class="summary-grid">
      <article class="summary-card">
        <span>待处理</span>
        <strong>{{ summary.pending }}</strong>
      </article>
      <article class="summary-card">
        <span>处理中</span>
        <strong>{{ summary.processing }}</strong>
      </article>
      <article class="summary-card">
        <span>已解决</span>
        <strong>{{ summary.resolved }}</strong>
      </article>
      <article class="summary-card">
        <span>已驳回</span>
        <strong>{{ summary.rejected }}</strong>
      </article>
    </div>

    <div class="panel">
      <div class="toolbar">
        <input
          v-model.trim="keyword"
          type="text"
          maxlength="50"
          class="toolbar-input"
          placeholder="搜索用户、手机号、分类或描述"
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
        <select v-model="activeCategory" class="toolbar-select" @change="applyFilters">
          <option value="">全部分类</option>
          <option v-for="item in categoryOptions" :key="item.value" :value="item.value">
            {{ item.label }}
          </option>
        </select>
        <button type="button" class="row-btn row-btn--ghost" :disabled="loading" @click="loadFeedbackList">
          {{ loading ? '刷新中...' : '刷新' }}
        </button>
      </div>

      <div v-if="error" class="state-card state-card--error">{{ error }}</div>
      <div v-else-if="loading" class="state-card">正在加载反馈列表...</div>
      <div v-else-if="!list.length" class="state-card">当前筛选条件下暂无反馈记录。</div>
      <div v-else class="content-grid">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>提交用户</th>
                <th>手机号</th>
                <th>问题类别</th>
                <th>状态</th>
                <th>提交时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in list"
                :key="item.id"
                :class="{ 'table-row--active': Number(item.id) === Number(activeFeedbackId) }"
                @click="selectFeedback(item.id)"
              >
                <td>#{{ item.id }}</td>
                <td>{{ item.username || '--' }}</td>
                <td>{{ item.phone || '--' }}</td>
                <td>{{ item.category_label || '--' }}</td>
                <td>
                  <span class="status-badge" :class="`status-badge--${item.status}`">
                    {{ getStatusLabel(item.status) }}
                  </span>
                </td>
                <td>{{ formatDateTime(item.created_at) }}</td>
                <td>
                  <button
                    v-if="Number(item.id) !== Number(activeFeedbackId)"
                    type="button"
                    class="row-btn row-btn--ghost"
                    @click.stop="selectFeedback(item.id)"
                  >
                    详情
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <div v-if="totalPages > 1" class="pagination">
            <button type="button" class="row-btn row-btn--ghost" :disabled="loading || page <= 1" @click="goToPage(page - 1)">
              上一页
            </button>
            <span>第 {{ page }} / {{ totalPages }} 页，共 {{ total }} 条</span>
            <button type="button" class="row-btn row-btn--ghost" :disabled="loading || page >= totalPages" @click="goToPage(page + 1)">
              下一页
            </button>
          </div>
        </div>

        <aside class="detail-card">
          <template v-if="activeFeedback">
            <div class="detail-head">
              <strong>反馈详情</strong>
              <span class="status-badge" :class="`status-badge--${activeFeedback.status}`">
                {{ getStatusLabel(activeFeedback.status) }}
              </span>
            </div>

            <div class="detail-grid">
              <div>
                <span>反馈 ID</span>
                <strong>#{{ activeFeedback.id }}</strong>
              </div>
              <div>
                <span>提交用户</span>
                <strong>{{ activeFeedback.username || '--' }}</strong>
              </div>
              <div>
                <span>手机号</span>
                <strong>{{ activeFeedback.phone || '--' }}</strong>
              </div>
              <div>
                <span>问题类别</span>
                <strong>{{ activeFeedback.category_label || '--' }}</strong>
              </div>
              <div>
                <span>提交时间</span>
                <strong>{{ formatDateTime(activeFeedback.created_at) }}</strong>
              </div>
              <div>
                <span>最后处理人</span>
                <strong>{{ activeFeedback.handled_by_name || '--' }}</strong>
              </div>
              <div>
                <span>处理时间</span>
                <strong>{{ formatDateTime(activeFeedback.handled_at) }}</strong>
              </div>
            </div>

            <div class="detail-block">
              <span>问题描述</span>
              <p>{{ activeFeedback.description || '无' }}</p>
            </div>

            <label class="detail-field">
              <span>处理备注</span>
              <textarea
                v-model.trim="adminNoteDraft"
                rows="5"
                maxlength="500"
                class="detail-textarea"
                placeholder="填写处理结论、需要用户补充的信息，或说明驳回原因"
              ></textarea>
            </label>

            <div class="detail-actions">
              <button
                v-if="canUpdateStatus(activeFeedback, 'processing')"
                type="button"
                class="row-btn"
                :disabled="Boolean(savingMap[activeFeedback.id])"
                @click="updateFeedback('processing')"
              >
                {{ savingMap[activeFeedback.id] ? '处理中...' : '标记处理中' }}
              </button>
              <button
                v-if="canUpdateStatus(activeFeedback, 'resolved')"
                type="button"
                class="row-btn"
                :disabled="Boolean(savingMap[activeFeedback.id])"
                @click="updateFeedback('resolved')"
              >
                {{ savingMap[activeFeedback.id] ? '处理中...' : '标记已解决' }}
              </button>
              <button
                v-if="canUpdateStatus(activeFeedback, 'rejected')"
                type="button"
                class="row-btn row-btn--danger"
                :disabled="Boolean(savingMap[activeFeedback.id])"
                @click="updateFeedback('rejected')"
              >
                {{ savingMap[activeFeedback.id] ? '处理中...' : '驳回/无效' }}
              </button>
            </div>

            <p v-if="actionMessage" class="inline-message" :class="{ 'inline-message--error': actionMessageType === 'error' }">
              {{ actionMessage }}
            </p>
          </template>
          <div v-else class="state-card">请选择一条反馈记录查看详情。</div>
        </aside>
      </div>
    </div>
  </section>
</template>

<script>
import { apiFetch } from '../utils/api.js'

const EMPTY_SUMMARY = Object.freeze({
  pending: 0,
  processing: 0,
  resolved: 0,
  rejected: 0
})

const STATUS_LABELS = Object.freeze({
  all: '全部',
  pending: '待处理',
  processing: '处理中',
  resolved: '已解决',
  rejected: '已驳回'
})

export default {
  name: 'AdminFeedbackCenter',
  data() {
    return {
      loading: false,
      error: '',
      keyword: '',
      activeStatus: 'pending',
      activeCategory: '',
      categoryOptions: [],
      summary: { ...EMPTY_SUMMARY },
      list: [],
      total: 0,
      page: 1,
      pageSize: 20,
      activeFeedbackId: 0,
      adminNoteDraft: '',
      savingMap: {},
      actionMessage: '',
      actionMessageType: 'success'
    }
  },
  computed: {
    totalPages() {
      return Math.max(1, Math.ceil(Number(this.total || 0) / this.pageSize))
    },
    statusTabs() {
      return [
        { value: 'pending', label: `待处理 ${this.summary.pending}` },
        { value: 'processing', label: `处理中 ${this.summary.processing}` },
        { value: 'resolved', label: `已解决 ${this.summary.resolved}` },
        { value: 'rejected', label: `已驳回 ${this.summary.rejected}` }
      ]
    },
    activeFeedback() {
      return this.list.find((item) => Number(item.id) === Number(this.activeFeedbackId)) || null
    }
  },
  watch: {
    activeFeedback: {
      immediate: true,
      handler(value) {
        this.adminNoteDraft = value?.admin_note || ''
      }
    }
  },
  async mounted() {
    await this.loadFeedbackList()
  },
  methods: {
    async loadFeedbackList() {
      this.loading = true
      this.error = ''
      try {
        const params = new URLSearchParams({
          page: String(this.page),
          pageSize: String(this.pageSize),
          status: this.activeStatus,
          keyword: this.keyword
        })
        if (this.activeCategory) {
          params.set('category', this.activeCategory)
        }
        const data = await apiFetch(`/api/admin/feedback?${params.toString()}`)
        this.list = Array.isArray(data.list) ? data.list : []
        this.total = Number(data.total || 0)
        this.summary = {
          ...EMPTY_SUMMARY,
          ...(data.summary || {})
        }
        this.categoryOptions = Array.isArray(data.categories) ? data.categories : []
        this.ensureActiveFeedback()
      } catch (error) {
        this.error = error.message || '加载反馈列表失败'
      } finally {
        this.loading = false
      }
    },
    applyFilters() {
      this.page = 1
      this.loadFeedbackList()
    },
    changeStatus(status) {
      if (status === this.activeStatus) return
      this.activeStatus = status
      this.applyFilters()
    },
    goToPage(nextPage) {
      const normalizedPage = Math.min(this.totalPages, Math.max(1, Number(nextPage || 1) || 1))
      if (normalizedPage === this.page) return
      this.page = normalizedPage
      this.loadFeedbackList()
    },
    ensureActiveFeedback() {
      if (this.list.some((item) => Number(item.id) === Number(this.activeFeedbackId))) return
      this.activeFeedbackId = this.list[0]?.id || 0
    },
    selectFeedback(feedbackId) {
      this.activeFeedbackId = Number(feedbackId || 0)
      this.actionMessage = ''
    },
    canUpdateStatus(item, nextStatus) {
      const currentStatus = String(item?.status || '').trim()
      if (!['pending', 'processing'].includes(currentStatus)) return false
      return currentStatus !== String(nextStatus || '').trim()
    },
    async updateFeedback(nextStatus) {
      const current = this.activeFeedback
      if (!current || !this.canUpdateStatus(current, nextStatus)) return

      const savingKey = Number(current.id || 0)
      this.savingMap = {
        ...this.savingMap,
        [savingKey]: true
      }
      this.actionMessage = ''

      try {
        const data = await apiFetch(`/api/admin/feedback/${current.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            status: nextStatus,
            adminNote: this.adminNoteDraft
          })
        })
        const updated = data.feedback || null
        if (updated) {
          this.list = this.list.map((item) => (
            Number(item.id) === Number(updated.id) ? { ...item, ...updated } : item
          ))
          this.activeFeedbackId = Number(updated.id || current.id || 0)
        }
        this.actionMessageType = 'success'
        this.actionMessage = data.message || `反馈已更新为${this.getStatusLabel(nextStatus)}`
        await this.loadFeedbackList()
      } catch (error) {
        this.actionMessageType = 'error'
        this.actionMessage = error.message || '更新反馈状态失败'
      } finally {
        this.savingMap = {
          ...this.savingMap,
          [savingKey]: false
        }
      }
    },
    getStatusLabel(status) {
      return STATUS_LABELS[String(status || '').trim()] || String(status || '--')
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
  padding: 20px;
  border-radius: 18px;
  background: #fff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.08);
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.summary-card span {
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

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-input,
.toolbar-select,
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

.toolbar-select {
  min-width: 170px;
  min-height: 42px;
  padding: 0 12px;
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

.pagination,
.detail-head,
.detail-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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

.detail-head strong {
  color: #111827;
  font-size: 20px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.detail-grid div,
.detail-block {
  padding: 14px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
}

.detail-grid span,
.detail-field span,
.detail-block span {
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

.detail-block p {
  margin: 8px 0 0;
  color: #334155;
  line-height: 1.8;
  white-space: pre-wrap;
}

.detail-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-textarea {
  min-height: 120px;
  padding: 12px 14px;
  resize: vertical;
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

.status-badge--pending,
.status-badge--processing {
  color: #b45309;
  background: #fef3c7;
}

.status-badge--resolved {
  color: #047857;
  background: #d1fae5;
}

.status-badge--rejected {
  color: #b91c1c;
  background: #fee2e2;
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

@media (max-width: 1200px) {
  .content-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .summary-grid,
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .toolbar,
  .pagination,
  .detail-head,
  .detail-actions {
    align-items: stretch;
  }
}
</style>
