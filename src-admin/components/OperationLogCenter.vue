<template>
  <section class="log-center">
    <div class="toolbar">
      <input
        v-model.trim="filters.keyword"
        type="text"
        class="toolbar-input"
        maxlength="50"
        placeholder="搜索操作人、动作、对象或备注"
        @keydown.enter.prevent="searchList"
      >
      <select v-model="filters.module" class="toolbar-select" @change="searchList">
        <option value="all">全部模块</option>
        <option value="review">商品审核</option>
        <option value="listing">商品管理</option>
        <option value="order">订单管理</option>
        <option value="user">用户管理</option>
        <option value="wallet">提现管理</option>
        <option value="security">安全设置</option>
        <option value="config">参数配置</option>
        <option value="feedback">问题反馈</option>
      </select>
      <input
        v-model="filters.date"
        type="date"
        class="toolbar-date"
        @keydown.enter.prevent="searchList"
      >
      <button type="button" class="toolbar-btn" :disabled="loading" @click="searchList">
        {{ loading ? '加载中...' : '搜索' }}
      </button>
      <button type="button" class="toolbar-btn toolbar-btn--ghost" :disabled="loading" @click="resetFilters">
        重置
      </button>
    </div>

    <div v-if="error" class="state-card state-card--error">{{ error }}</div>
    <div v-else-if="loading" class="state-card">正在加载操作日志...</div>
    <div v-else class="log-card">
      <div class="card-head">
        <span>共 {{ total }} 条</span>
        <span v-if="totalPages > 1">第 {{ page }} / {{ totalPages }} 页</span>
      </div>

      <div v-if="!list.length" class="state-card state-card--inner">当前没有符合条件的操作日志</div>
      <div v-else class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>时间</th>
              <th>操作人</th>
              <th>模块</th>
              <th>动作</th>
              <th>对象</th>
              <th>备注</th>
              <th>快照</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in list" :key="item.id">
              <td>{{ formatDateTime(item.created_at) }}</td>
              <td>{{ item.operator_name || '--' }}</td>
              <td>{{ formatModule(item.module) }}</td>
              <td>{{ formatAction(item.action) }}</td>
              <td>
                <div class="cell-main">{{ item.target_label || '--' }}</div>
                <div class="cell-sub">{{ item.target_type || '--' }} / {{ item.target_id || '--' }}</div>
              </td>
              <td>{{ item.remark || '--' }}</td>
              <td class="snapshot-cell">
                <details class="snapshot-box">
                  <summary>查看快照</summary>
                  <div class="snapshot-content">
                    <p class="snapshot-title">变更前</p>
                    <pre>{{ formatSnapshot(item.before_snapshot) }}</pre>
                    <p class="snapshot-title">变更后</p>
                    <pre>{{ formatSnapshot(item.after_snapshot) }}</pre>
                  </div>
                </details>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="totalPages > 1" class="pager">
        <button
          type="button"
          class="toolbar-btn"
          :disabled="loading || page <= 1"
          @click="goPage(1)"
        >
          第一页
        </button>
        <button
          type="button"
          class="toolbar-btn"
          :disabled="loading || page <= 1"
          @click="goPage(page - 1)"
        >
          上一页
        </button>
        <button
          v-for="p in pageButtons"
          :key="p"
          type="button"
          class="toolbar-btn pager-num"
          :class="{ 'pager-num--active': p === page }"
          :disabled="loading"
          @click="goPage(p)"
        >
          {{ p }}
        </button>
        <button
          type="button"
          class="toolbar-btn"
          :disabled="loading || page >= totalPages"
          @click="goPage(page + 1)"
        >
          下一页
        </button>
        <button
          type="button"
          class="toolbar-btn"
          :disabled="loading || page >= totalPages"
          @click="goPage(totalPages)"
        >
          末页
        </button>
      </div>
    </div>
  </section>
</template>

<script>
import { apiFetch } from '../utils/api.js'

const MODULE_LABELS = Object.freeze({
  user: '用户管理',
  order: '订单管理',
  listing: '商品管理',
  review: '商品审核',
  wallet: '提现管理',
  security: '安全设置',
  config: '参数配置',
  feedback: '问题反馈'
})

const ACTION_LABELS = Object.freeze({
  update_role: '修改角色',
  ban_user: '封禁用户',
  unban_user: '解除封禁',
  close_order: '关闭订单',
  deactivate_listing: '下架商品',
  approve_listing: '审核通过',
  reject_listing: '审核驳回',
  delete_passkey: '删除 Passkey',
  trust_current_device: '信任当前设备',
  revoke_trusted_device: '移除受信任设备',
  revoke_all_trusted_devices: '清空受信任设备',
  update_business_settings: '更新业务参数',
  update_feedback_status: '更新反馈状态'
})

export default {
  name: 'OperationLogCenter',
  data() {
    return {
      loading: false,
      error: '',
      total: 0,
      list: [],
      page: 1,
      pageSize: 20,
      filters: {
        keyword: '',
        module: 'all',
        date: ''
      }
    }
  },
  async mounted() {
    await this.loadList()
  },
  computed: {
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
    async loadList() {
      this.loading = true
      this.error = ''
      try {
        const params = new URLSearchParams({
          page: String(this.page),
          pageSize: String(this.pageSize),
          keyword: this.filters.keyword,
          module: this.filters.module
        })
        if (this.filters.date) {
          params.set('date', this.filters.date)
        }
        const data = await apiFetch(`/api/admin/operation-logs?${params.toString()}`)
        this.list = Array.isArray(data.list) ? data.list : []
        this.total = Number(data.total || 0)
        if (Number(data.page)) {
          this.page = Number(data.page)
        }
      } catch (error) {
        this.error = error.message || '加载操作日志失败'
      } finally {
        this.loading = false
      }
    },
    searchList() {
      // 换筛选条件后结果集变化，回到第一页
      this.page = 1
      this.loadList()
    },
    goPage(target) {
      const next = Math.min(Math.max(1, Number(target) || 1), this.totalPages)
      if (next === this.page) return
      this.page = next
      this.loadList()
    },
    resetFilters() {
      this.filters = {
        keyword: '',
        module: 'all',
        date: ''
      }
      this.page = 1
      this.loadList()
    },
    formatDateTime(value) {
      if (!value) return '--'
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return String(value)
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    },
    formatModule(value) {
      return MODULE_LABELS[String(value || '').trim()] || String(value || '--')
    },
    formatAction(value) {
      return ACTION_LABELS[String(value || '').trim()] || String(value || '--')
    },
    formatSnapshot(value) {
      if (!value) return '--'
      try {
        return JSON.stringify(JSON.parse(value), null, 2)
      } catch (_error) {
        return String(value)
      }
    }
  }
}
</script>

<style scoped>
.log-center {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.toolbar-input,
.toolbar-select,
.toolbar-date {
  min-height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #1f2937;
}

.toolbar-input {
  flex: 1 1 260px;
}

.toolbar-select,
.toolbar-date {
  min-width: 140px;
}

.toolbar-btn {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
}

.toolbar-btn--ghost {
  border-color: #d1d5db;
  background: #fff;
  color: #374151;
}

.toolbar-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
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

.log-card,
.state-card {
  border-radius: 18px;
  border: 1px solid #e5e7eb;
  background: #fff;
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.08);
}

.log-card {
  padding: 18px;
}

.state-card {
  padding: 18px;
  color: #4b5563;
}

.state-card--error {
  color: #b91c1c;
  border-color: #fecaca;
  background: #fff1f2;
  box-shadow: none;
}

.state-card--inner {
  box-shadow: none;
}

.card-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.card-head span {
  color: #6b7280;
  font-size: 13px;
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
  vertical-align: top;
  font-size: 14px;
}

.table th {
  color: #6b7280;
  font-weight: 600;
}

.cell-main {
  font-weight: 600;
  color: #111827;
}

.cell-sub {
  margin-top: 4px;
  color: #6b7280;
  font-size: 12px;
}

.snapshot-cell {
  min-width: 240px;
}

.snapshot-box summary {
  color: #1d4ed8;
  cursor: pointer;
}

.snapshot-content {
  margin-top: 10px;
}

.snapshot-title {
  margin: 0 0 6px;
  font-size: 12px;
  color: #6b7280;
}

.snapshot-content pre {
  margin: 0 0 10px;
  padding: 10px;
  border-radius: 10px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
