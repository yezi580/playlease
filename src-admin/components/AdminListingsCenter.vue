<template>
  <section class="page">
    <div class="panel">
      <div class="panel-head">
        <span>共 {{ listings.length }} 条</span>
      </div>

      <div class="toolbar">
        <input
          v-model.trim="keyword"
          type="text"
          maxlength="50"
          class="toolbar-input"
          placeholder="搜索发布人、编号、段位、上号方式或状态"
          @keydown.enter.prevent="loadListings"
        >
        <input
          v-model="date"
          type="date"
          class="toolbar-date"
          @keydown.enter.prevent="loadListings"
        >
        <button type="button" class="row-btn" :disabled="loading" @click="loadListings">
          {{ loading ? '搜索中...' : '搜索' }}
        </button>
        <button type="button" class="row-btn" :disabled="loading || !(keyword || date)" @click="resetSearch">
          重置
        </button>
      </div>

      <div v-if="error" class="state-card state-card--error">{{ error }}</div>
      <div v-else-if="loading" class="state-card">正在加载商品...</div>
      <div v-else class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>标题</th>
              <th>发布人</th>
              <th>状态</th>
              <th>租金</th>
              <th>操作</th>
              <th>发布时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in listings" :key="item.id">
              <td>{{ item.id }}</td>
              <td>{{ item.title }}</td>
              <td>{{ item.owner_name }}</td>
              <td>{{ formatListingStatus(item.listing_status) }}</td>
              <td>{{ formatMoney(item.rent_price) }}</td>
              <td>
                <button
                  v-if="canDeactivateListing(item)"
                  type="button"
                  class="row-btn row-btn--danger"
                  @click="deactivateListing(item)"
                >
                  {{ listingSubmittingMap[item.id] ? '处理中...' : '下架商品' }}
                </button>
              </td>
              <td>{{ formatDateTime(item.published_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-if="actionMessage" class="inline-message" :class="{ 'inline-message--error': actionMessageType === 'error' }">
        {{ actionMessage }}
      </p>
    </div>

    <AdminConfirmDialog
      :open="Boolean(pendingDeactivateListing)"
      title="确认下架商品"
      :message="deactivateListingConfirmMessage"
      confirm-text="确认下架"
      :loading="Boolean(pendingDeactivateListing && listingSubmittingMap[pendingDeactivateListing.id])"
      danger
      @cancel="pendingDeactivateListing = null"
      @confirm="confirmDeactivateListing"
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

const LISTING_STATUS_LABELS = Object.freeze({
  active: '上架中',
  inactive: '已下架',
  pending_review: '审核中',
  sold_out: '已售出',
  rented: '已租出'
})

export default {
  name: 'AdminListingsCenter',
  components: {
    AdminConfirmDialog
  },
  data() {
    return {
      loading: false,
      error: '',
      keyword: '',
      date: '',
      listings: [],
      pendingDeactivateListing: null,
      listingSubmittingMap: {},
      actionMessage: '',
      actionMessageType: 'success'
    }
  },
  async mounted() {
    await this.loadListings()
  },
  computed: {
    deactivateListingConfirmMessage() {
      if (!this.pendingDeactivateListing) return ''
      return `确认下架商品 ${this.pendingDeactivateListing.title || `#${this.pendingDeactivateListing.id || '--'}`} 吗？下架后该商品将不再继续展示。`
    }
  },
  methods: {
    async loadListings() {
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
        const data = await apiFetch(`/api/admin/listings?${params.toString()}`)
        this.listings = Array.isArray(data.list) ? data.list : []
      } catch (error) {
        this.error = error.message || '获取商品列表失败'
      } finally {
        this.loading = false
      }
    },
    resetSearch() {
      this.keyword = ''
      this.date = ''
      this.loadListings()
    },
    canDeactivateListing(item) {
      if (Boolean(this.listingSubmittingMap[item.id])) return false
      return !['inactive', 'sold_out', 'rented'].includes(String(item.listing_status || ''))
    },
    async deactivateListing(item) {
      if (!this.canDeactivateListing(item)) return
      this.pendingDeactivateListing = item
    },
    async confirmDeactivateListing() {
      const item = this.pendingDeactivateListing
      if (!item || !this.canDeactivateListing(item)) {
        this.pendingDeactivateListing = null
        return
      }

      this.listingSubmittingMap = {
        ...this.listingSubmittingMap,
        [item.id]: true
      }
      this.actionMessage = ''

      try {
        const data = await this.runProtectedAction('deactivate_listing', () => apiFetch(`/api/admin/listings/${item.id}/deactivate`, {
          method: 'PUT'
        }))
        const updatedListing = data.listing || {}
        this.listings = this.listings.map((listing) => (
          Number(listing.id) === Number(item.id)
            ? { ...listing, ...updatedListing }
            : listing
        ))
        this.actionMessageType = 'success'
        this.actionMessage = data.message || `商品 ${item.id} 已下架`
      } catch (error) {
        this.actionMessageType = 'error'
        this.actionMessage = error.message || '商品下架失败'
      } finally {
        this.listingSubmittingMap = {
          ...this.listingSubmittingMap,
          [item.id]: false
        }
        this.pendingDeactivateListing = null
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
    formatListingStatus(status) {
      return LISTING_STATUS_LABELS[String(status || '').trim()] || String(status || '--')
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
