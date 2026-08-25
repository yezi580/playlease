<template>
  <section class="review-desk">
    <div class="toolbar">
      <input
        v-model.trim="filters.keyword"
        type="text"
        class="toolbar-input"
        maxlength="50"
        placeholder="搜索发布人、手机号、商品编号、段位或上号方式"
        @keydown.enter.prevent="loadList"
      >
      <div class="status-filter-group" role="tablist" aria-label="审核状态筛选">
        <button
          v-for="option in statusOptions"
          :key="option.value"
          type="button"
          class="status-filter-btn"
          :class="{ 'status-filter-btn--active': filters.status === option.value }"
          @click="applyStatusFilter(option.value)"
        >
          {{ option.label }}
        </button>
      </div>
      <button type="button" class="toolbar-btn" @click="loadList">搜索</button>
      <button type="button" class="toolbar-btn toolbar-btn--ghost" @click="resetFilters">重置</button>
    </div>

    <div class="summary-grid">
      <article class="summary-card">
        <span>待审核</span>
        <strong>{{ workload.my_pending_count }}</strong>
      </article>
      <article class="summary-card">
        <span>已处理</span>
        <strong>{{ workload.my_approved_total + workload.my_rejected_total }}</strong>
      </article>
      <article class="summary-card">
        <span>今日完成</span>
        <strong>{{ workload.my_resolved_today }}</strong>
      </article>
    </div>

    <p v-if="message" class="message" :class="{ 'message--error': messageType === 'error' }">{{ message }}</p>

    <div v-if="error" class="state-card state-card--error">{{ error }}</div>
    <div class="content-grid">
      <div class="list-card">
        <div class="card-head"><span>共 {{ total }} 条</span></div>
        <div v-if="!list.length && !loading" class="state-card state-card--inner state-card--empty">当前没有分配给你的审核单</div>
        <div v-else class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>商品</th>
                <th>发布人</th>
                <th>审核状态</th>
                <th>发布时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in list"
                :key="item.id"
                :class="{ 'row-active': Number(item.id) === Number(selectedId) }"
              >
                <td>
                  <div class="cell-main">{{ item.title || '--' }}</div>
                  <div class="cell-sub">编号：{{ item.listing_no || '--' }}</div>
                </td>
                <td>
                  <div class="cell-main">{{ item.owner_name || '--' }}</div>
                  <div class="cell-sub">{{ item.owner_phone || '--' }}</div>
                </td>
                <td>
                  <span class="status-badge" :class="`status-badge--${item.review_status || 'pending'}`">
                    {{ item.review_status_label || formatReviewStatus(item.review_status) }}
                  </span>
                </td>
                <td>{{ formatDateTime(item.published_at) }}</td>
                <td>
                  <button
                    type="button"
                    class="row-btn"
                    :class="{ 'row-btn--muted': Number(item.id) === Number(selectedId) }"
                    :disabled="Number(item.id) === Number(selectedId)"
                    @click="selectListing(item)"
                  >
                    查看详情
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="detail-card">
        <div v-if="detailLoading && !detail" class="state-card state-card--inner">正在加载详情...</div>
        <div v-else-if="detailError" class="state-card state-card--error state-card--inner">{{ detailError }}</div>
        <div v-else-if="!detail" class="state-card state-card--inner">从左侧选择一条商品开始审核</div>
        <div v-else class="detail-body">
          <div class="summary-grid summary-grid--detail">
            <div class="summary-item">
              <span>商品编号</span>
              <strong>{{ detail.listing_no || '--' }}</strong>
            </div>
            <div class="summary-item">
              <span>发布人</span>
              <strong>{{ detail.owner_name || '--' }}</strong>
            </div>
            <div class="summary-item">
              <span>手机号</span>
              <strong>{{ detail.owner_phone || '--' }}</strong>
            </div>
            <div class="summary-item">
              <span>发布时间</span>
              <strong>{{ formatDateTime(detail.published_at || detail.created_at) }}</strong>
            </div>
          </div>

          <div class="detail-section">
            <div class="detail-grid">
              <label><span>保险等级</span><input :value="detail.insurance_level || '--'" readonly></label>
              <label><span>体力等级</span><input :value="detail.energy_level || '--'" readonly></label>
              <label><span>负重等级</span><input :value="detail.weight_level || '--'" readonly></label>
              <label><span>人脸归属</span><input :value="Number(detail.face_verified) === 1 ? '是' : '否'" readonly></label>
              <label><span>武器皮肤</span><input :value="detail.weapon_skin || '--'" readonly></label>
              <label><span>干员外观</span><input :value="detail.operator_appearance || '--'" readonly></label>
              <label><span>所在地区</span><input :value="detail.region || '--'" readonly></label>
              <label><span>段位</span><input :value="detail.rank_name || '--'" readonly></label>
              <label><span>绝密KD</span><input :value="formatPlain(detail.secret_kd)" readonly></label>
              <label><span>上号方式</span><input :value="detail.login_method || '--'" readonly></label>
              <label><span>上号时间</span><input :value="detail.login_time_range || '--'" readonly></label>
              <label><span>潜水等级</span><input :value="`${formatPlain(detail.dive_level, '0')}级`" readonly></label>
              <label><span>洗消舱等级</span><input :value="`${formatPlain(detail.decontamination_chamber_level, '0')}级`" readonly></label>
              <label><span>哈夫币</span><input :value="`${formatPlain(detail.hafu_coin, '0')}M`" readonly></label>
              <label><span>基础比例</span><input :value="formatPlain(detail.base_ratio, '0')" readonly></label>
              <label><span>租金</span><input :value="formatMoney(detail.rent_price)" readonly></label>
              <label><span>押金</span><input :value="formatMoney(detail.deposit)" readonly></label>
              <label><span>出租天数</span><input :value="formatPlain(detail.rent_days, '0')" readonly></label>
            </div>
          </div>

          <div class="detail-section">
            <h4>额外物品</h4>
            <div class="item-list">
              <div v-for="item in reviewSaleItems" :key="item.key" class="item-row">
                <span>{{ item.name }}</span>
                <span>数量 {{ item.quantity }}</span>
                <span>总价 {{ formatMoney(item.totalPrice) }}</span>
              </div>
            </div>
          </div>

          <div class="detail-section">
            <div class="detail-grid">
              <label class="detail-grid__full"><span>封禁记录</span><input :value="detail.ban_record || '--'" readonly></label>
              <label class="detail-grid__full"><span>备注</span><textarea :value="detail.remark || '--'" rows="2" readonly /></label>
            </div>

            <div class="detail-media-split">
              <div class="detail-subsection">
                <h4>商品图片</h4>
                <div v-if="detail.images?.length" class="image-grid">
                  <button
                    v-for="(image, index) in detail.images"
                    :key="`image-${index}`"
                    type="button"
                    class="image-card"
                    @click="openMediaPreview({ type: 'image', src: image, title: `商品图片${index + 1}` })"
                  >
                    <img :src="image" :alt="`商品图片${index + 1}`">
                  </button>
                </div>
                <div v-else class="state-card state-card--inner">暂无商品图片</div>
              </div>

              <div class="detail-subsection">
                <h4>封禁凭证</h4>
                <div v-if="detail.banImages?.length" class="image-grid">
                  <button
                    v-for="(image, index) in detail.banImages"
                    :key="`ban-${index}`"
                    type="button"
                    class="image-card"
                    @click="openMediaPreview({ type: 'image', src: getBanImageSource(image, index), title: `封禁图片${index + 1}` })"
                  >
                    <img :src="getBanImageSource(image, index)" :alt="`封禁图片${index + 1}`">
                  </button>
                </div>
                <div v-else class="state-card state-card--inner">暂无封禁图片</div>
                <div v-if="detail.banVideo" class="video-preview-card">
                  <video class="video-player" :src="getBanVideoSource()" controls preload="metadata" playsinline />
                  <div class="video-actions">
                    <button type="button" class="video-link video-link--button" @click="openMediaPreview({ type: 'video', src: getBanVideoSource(), title: '封禁记录视频' })">放大预览</button>
                    <a class="video-link" :href="getBanVideoSource()" target="_blank" rel="noreferrer">新标签打开</a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="detail-section audit-section">
            <div class="detail-subsection">
              <h4>历史审核备注</h4>
              <textarea class="audit-textarea audit-textarea--readonly" :value="detail.review_reason || '--'" rows="2" readonly />
            </div>
            <div class="detail-subsection">
              <h4>审核操作</h4>
              <textarea
                v-model.trim="auditRemark"
                class="audit-textarea audit-textarea--editable"
                maxlength="500"
                rows="3"
                placeholder="通过时可填审核备注，驳回时请填写驳回原因"
              />
              <div class="audit-actions">
                <button type="button" class="action-btn action-btn--primary" :disabled="actionSubmitting || !canReview" @click="approveListing">
                  {{ actionSubmitting ? '提交中...' : '审核通过' }}
                </button>
                <button type="button" class="action-btn action-btn--danger" :disabled="actionSubmitting || !canReview" @click="rejectListing">
                  {{ actionSubmitting ? '提交中...' : '驳回商品' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="mediaPreview.open" class="media-preview-mask" @click.self="closeMediaPreview">
      <div class="media-preview-dialog">
        <div class="media-preview-head">
          <strong>{{ mediaPreview.title || '媒体预览' }}</strong>
          <button type="button" class="media-preview-close" @click="closeMediaPreview">关闭</button>
        </div>
        <div class="media-preview-body">
          <img v-if="mediaPreview.type === 'image'" class="media-preview-image" :src="mediaPreview.src" :alt="mediaPreview.title || '图片预览'">
          <video v-else-if="mediaPreview.type === 'video'" class="media-preview-video" :src="mediaPreview.src" controls autoplay playsinline />
        </div>
      </div>
    </div>
  </section>
</template>

<script>
import { apiFetch, createAuthorizedObjectUrl } from '../../utils/api.js'
import { showErrorToast, showSuccessToast } from '../../utils/toast.js'

const REVIEW_STATUS_LABELS = Object.freeze({
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回'
})

const REVIEW_SALE_ITEMS = Object.freeze([
  { key: 'topCard', name: '顶级保险卡' },
  { key: 'awmBullet', name: 'AWM子弹（发）' },
  { key: 'barrettBullet', name: '巴雷特子弹（发）' },
  { key: 'bulletLv6', name: '6级子弹（组）' },
  { key: 'helmetLv6', name: '6级头盔' },
  { key: 'armorLv6', name: '6级护甲' },
  { key: 'coffeeBean', name: '高级咖啡豆' },
  { key: 'bulletPart', name: '高级子弹零件' }
])

export default {
  name: 'ListingReviewDesk',
  emits: ['reviewed'],
  data() {
    return {
      loading: false,
      error: '',
      list: [],
      total: 0,
      workload: { my_pending_count: 0, my_approved_total: 0, my_rejected_total: 0, my_resolved_today: 0 },
      filters: { keyword: '', status: 'pending' },
      selectedId: 0,
      detail: null,
      detailLoading: false,
      detailError: '',
      protectedBanImages: [],
      protectedBanVideo: '',
      protectedMediaRequestId: 0,
      detailRequestId: 0,
      listRequestId: 0,
      actionSubmitting: false,
      auditRemark: '',
      message: '',
      messageType: 'success',
      mediaPreview: { open: false, type: 'image', src: '', title: '' },
      statusOptions: [
        { value: 'pending', label: '待审核' },
        { value: 'rejected', label: '已驳回' },
        { value: 'approved', label: '已通过' },
        { value: 'all', label: '全部状态' }
      ]
    }
  },
  computed: {
    reviewSaleItems() {
      const rows = Array.isArray(this.detail?.items) ? this.detail.items : []
      const itemMap = new Map(rows.map((item) => [String(item?.item_key || '').trim(), item]))
      return REVIEW_SALE_ITEMS.map((config) => {
        const currentItem = itemMap.get(config.key) || {}
        return {
          key: config.key,
          name: config.name,
          quantity: Number(currentItem.quantity || 0) || 0,
          totalPrice: Number(currentItem.total_price || 0) || 0
        }
      })
    },
    canReview() {
      return this.detail && this.detail.review_status === 'pending'
    }
  },
  async mounted() {
    await this.loadList()
  },
  beforeUnmount() {
    this.closeMediaPreview()
    this.revokeProtectedBanMedia()
  },
  methods: {
    revokeProtectedBanMedia() {
      this.protectedBanImages.forEach((url) => { if (url) URL.revokeObjectURL(url) })
      if (this.protectedBanVideo) URL.revokeObjectURL(this.protectedBanVideo)
      this.protectedBanImages = []
      this.protectedBanVideo = ''
    },
    async hydrateProtectedBanMedia(detail) {
      const requestId = this.protectedMediaRequestId + 1
      this.protectedMediaRequestId = requestId
      this.revokeProtectedBanMedia()

      const banImages = Array.isArray(detail?.banImages) ? detail.banImages.filter(Boolean) : []
      const banVideo = String(detail?.banVideo || '').trim()
      if (!banImages.length && !banVideo) return

      try {
        const nextBanImages = await Promise.all(banImages.map((url) => createAuthorizedObjectUrl(url)))
        const nextBanVideo = banVideo ? await createAuthorizedObjectUrl(banVideo) : ''
        if (requestId !== this.protectedMediaRequestId) {
          nextBanImages.forEach((url) => { if (url) URL.revokeObjectURL(url) })
          if (nextBanVideo) URL.revokeObjectURL(nextBanVideo)
          return
        }
        this.protectedBanImages = nextBanImages
        this.protectedBanVideo = nextBanVideo
      } catch (error) {
        if (requestId === this.protectedMediaRequestId) {
          this.revokeProtectedBanMedia()
          this.messageType = 'error'
          this.message = error.message || '加载受保护素材失败'
        }
      }
    },
    async loadList() {
      const requestId = this.listRequestId + 1
      this.listRequestId = requestId
      this.loading = true
      this.error = ''
      try {
        const params = new URLSearchParams({
          page: '1',
          pageSize: '20',
          keyword: this.filters.keyword,
          status: this.filters.status
        })
        const data = await apiFetch(`/api/support/listing-reviews?${params.toString()}`)
        if (requestId !== this.listRequestId) return
        this.list = Array.isArray(data.list) ? data.list : []
        this.total = Number(data.total || 0)
        this.workload = {
          my_pending_count: Number(data.workload?.my_pending_count || 0),
          my_approved_total: Number(data.workload?.my_approved_total || 0),
          my_rejected_total: Number(data.workload?.my_rejected_total || 0),
          my_resolved_today: Number(data.workload?.my_resolved_today || 0)
        }

        if (this.selectedId) {
          const exists = this.list.some((item) => Number(item.id) === Number(this.selectedId))
          if (!exists) {
            this.closeMediaPreview()
            this.revokeProtectedBanMedia()
            this.detail = null
            this.detailError = ''
            this.selectedId = 0
            this.auditRemark = ''
          }
        }
        if (!this.selectedId && this.list.length) {
          await this.selectListing(this.list[0])
        }
      } catch (error) {
        if (requestId !== this.listRequestId) return
        this.error = error.message || '加载审核工单失败'
      } finally {
        if (requestId === this.listRequestId) this.loading = false
      }
    },
    applyStatusFilter(status) {
      const nextStatus = String(status || 'pending')
      if (this.filters.status === nextStatus && !this.error) return
      this.filters.status = nextStatus
      this.message = ''
      this.loadList()
    },
    resetFilters() {
      this.filters = { keyword: '', status: 'pending' }
      this.message = ''
      this.loadList()
    },
    async selectListing(item) {
      const nextId = Number(item?.id || 0)
      if (!nextId) return
      const requestId = this.detailRequestId + 1
      this.detailRequestId = requestId
      const hasExistingDetail = Boolean(this.detail)
      this.selectedId = nextId
      this.detailLoading = true
      this.detailError = ''
      this.message = ''
      this.closeMediaPreview()
      try {
        const data = await apiFetch(`/api/support/listing-reviews/${nextId}`)
        if (requestId !== this.detailRequestId) return
        this.detail = data || null
        this.auditRemark = String(data?.review_reason || '').trim()
        await this.hydrateProtectedBanMedia(data)
      } catch (error) {
        if (requestId !== this.detailRequestId) return
        if (hasExistingDetail) {
          this.messageType = 'error'
          this.message = error.message || '加载商品详情失败'
        } else {
          this.revokeProtectedBanMedia()
          this.detail = null
          this.detailError = error.message || '加载商品详情失败'
        }
      } finally {
        if (requestId === this.detailRequestId) this.detailLoading = false
      }
    },
    async approveListing() {
      if (!this.detail?.id) return
      this.actionSubmitting = true
      this.message = ''
      try {
        const data = await apiFetch(`/api/support/listing-reviews/${this.detail.id}/approve`, {
          method: 'PUT',
          body: JSON.stringify({ remark: this.auditRemark })
        })
        showSuccessToast(data.message || '商品审核已通过')
        this.$emit('reviewed')
        await this.loadList()
      } catch (error) {
        showErrorToast(error.message || '审核通过失败')
      } finally {
        this.actionSubmitting = false
      }
    },
    async rejectListing() {
      if (!this.detail?.id) return
      if (!this.auditRemark) {
        showErrorToast('请先填写驳回原因')
        return
      }
      this.actionSubmitting = true
      this.message = ''
      try {
        const data = await apiFetch(`/api/support/listing-reviews/${this.detail.id}/reject`, {
          method: 'PUT',
          body: JSON.stringify({ reason: this.auditRemark })
        })
        showSuccessToast(data.message || '商品已驳回')
        this.$emit('reviewed')
        await this.loadList()
      } catch (error) {
        showErrorToast(error.message || '驳回商品失败')
      } finally {
        this.actionSubmitting = false
      }
    },
    formatReviewStatus(status) {
      return REVIEW_STATUS_LABELS[String(status || '').trim()] || '未知状态'
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
    },
    formatPlain(value, fallback = '--') {
      if (value === undefined || value === null || String(value).trim() === '') return fallback
      return String(value)
    },
    getBanImageSource(image, index) {
      return this.protectedBanImages[index] || image
    },
    getBanVideoSource() {
      return this.protectedBanVideo || this.detail?.banVideo || ''
    },
    openMediaPreview(payload = {}) {
      const src = String(payload.src || '').trim()
      if (!src) return
      this.mediaPreview = {
        open: true,
        type: String(payload.type || '').trim() === 'video' ? 'video' : 'image',
        src,
        title: String(payload.title || '').trim()
      }
    },
    closeMediaPreview() {
      this.mediaPreview = { open: false, type: 'image', src: '', title: '' }
    }
  }
}
</script>

<style scoped>
.review-desk {
  display: flex;
  flex-direction: column;
  gap: 14px;
  /* 桌面端上方仅 desk-mode-bar（42px + 8px 下边距）；内部 content-grid 弹性拉伸铺满剩余高度 */
  height: calc(100vh - 50px);
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.toolbar-input,
.detail-grid input,
.detail-grid textarea {
  min-height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--border-strong);
  background: var(--bg-card);
  color: var(--text-strong);
}
.toolbar-input {
  flex: 1 1 280px;
}
.status-filter-group {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
}
.status-filter-btn {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: var(--bg-card);
  color: var(--text-regular);
  transition: all 0.2s ease;
}
.status-filter-btn--active {
  border-color: var(--info-border);
  background: var(--info-bg);
  color: var(--info-text);
  font-weight: 700;
}
.toolbar-btn,
.row-btn {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid var(--info-border);
  background: var(--info-bg);
  color: var(--info-text);
  white-space: nowrap;
}
.toolbar-btn--ghost {
  border-color: var(--border-strong);
  background: var(--bg-card);
  color: var(--text-regular);
}
.row-btn--muted {
  border-color: var(--border-color);
  background: var(--bg-subtle);
  color: var(--text-faint);
  cursor: default;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.summary-card {
  padding: 14px;
  border-radius: 14px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-color);
}
.summary-card span {
  display: block;
  color: var(--text-muted);
  font-size: 13px;
  margin-bottom: 8px;
}
.message {
  margin: 0;
  color: var(--success-text-dark);
}
.message--error {
  color: var(--danger-text-strong);
}
.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  grid-template-rows: minmax(0, 1fr);
  gap: 16px;
  flex: 1;
  min-height: 0;
}
.list-card,
.detail-card,
.state-card {
  border-radius: 18px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.08);
}
.list-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  overflow: auto;
}
.detail-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  overflow: auto;
}
.state-card {
  padding: 18px;
  color: var(--text-regular);
}
.state-card--error {
  color: var(--danger-text-strong);
  border-color: var(--danger-border);
  background: var(--danger-bg);
  box-shadow: none;
}
.state-card--inner {
  box-shadow: none;
}
.detail-card > .state-card--inner {
  flex: 1;
  display: grid;
  place-items: center;
}
.state-card--empty {
  flex: 1;
  display: grid;
  place-items: center;
  min-height: 180px;
  border-color: transparent;
  background: transparent;
}
.card-head {
  margin-bottom: 12px;
  color: var(--text-muted);
  font-size: 13px;
}
.table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.table {
  width: 100%;
  border-collapse: collapse;
}
.table th,
.table td {
  padding: 10px;
  border-bottom: 1px solid var(--border-color);
  text-align: left;
  vertical-align: top;
  font-size: 14px;
}
.table th {
  color: var(--text-muted);
  font-weight: 600;
}
.row-active {
  background: var(--bg-subtle);
}
.cell-main {
  font-weight: 600;
  color: var(--text-main);
}
.cell-sub {
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 12px;
}
.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 64px;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}
.status-badge--pending {
  background: var(--info-bg-strong);
  color: var(--info-text);
}
.status-badge--approved {
  background: var(--success-bg-strong);
  color: var(--success-text-dark);
}
.status-badge--rejected {
  background: var(--danger-bg-strong);
  color: var(--danger-text-strong);
}
.detail-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-right: 4px;
}
.summary-grid--detail {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.summary-item {
  padding: 12px;
  border-radius: 12px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-color);
}
.summary-item span {
  display: block;
  color: var(--text-muted);
  font-size: 12px;
  margin-bottom: 6px;
}
.detail-section {
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 14px;
  background: var(--bg-subtle);
}
.detail-section h4 {
  margin: 0 0 10px;
  font-size: 14px;
  color: var(--text-regular);
}
.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.detail-grid label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--text-regular);
  font-size: 13px;
}
.detail-grid__full {
  grid-column: 1 / -1;
}
.detail-grid textarea {
  min-height: 60px;
  padding: 8px 12px;
  resize: vertical;
}
.item-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.item-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px 140px;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  font-size: 13px;
}
.detail-media-split {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 12px;
}
.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 10px;
}
.image-card {
  display: block;
  width: 100%;
  padding: 0;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  cursor: zoom-in;
}
.image-card img {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
}
.video-preview-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}
.video-player {
  width: 100%;
  max-height: 240px;
  border-radius: 12px;
  background: #020617;
}
.video-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.video-link {
  display: inline-flex;
  color: var(--info-text);
  text-decoration: none;
}
.video-link--button {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--info-border);
  border-radius: 8px;
  background: var(--info-bg);
  font-weight: 600;
}
.audit-section {
  background: var(--bg-card);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.audit-textarea {
  width: 100%;
  box-sizing: border-box;
  border-radius: 10px;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  min-height: 72px;
  padding: 10px 12px;
}
.audit-textarea--readonly {
  background: var(--bg-subtle);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  cursor: default;
  resize: none;
}
.audit-textarea--editable {
  background: var(--bg-card);
  border: 1px solid var(--border-strong);
  color: var(--text-regular);
  resize: none;
}
.audit-textarea--editable:focus {
  outline: none;
  border-color: var(--info);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}
.audit-actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}
.action-btn {
  flex: 1;
  min-height: 40px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid var(--info-border);
  background: var(--info-bg);
  color: var(--info-text);
  font-weight: 600;
  transition: all 0.2s ease;
}
.action-btn--primary {
  background: var(--info-strong);
  border-color: var(--info-strong);
  color: #fff;
}
.action-btn--danger {
  background: var(--danger-bg);
  border-color: var(--danger-border);
  color: var(--danger-text-strong);
}
.media-preview-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.72);
}
.media-preview-dialog {
  width: min(1080px, 100%);
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border-radius: 18px;
  background: var(--bg-card);
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.28);
}
.media-preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.media-preview-close {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-regular);
}
.media-preview-body {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  overflow: auto;
}
.media-preview-image,
.media-preview-video {
  max-width: 100%;
  max-height: calc(100vh - 160px);
  border-radius: 14px;
  background: #020617;
}
@media (max-width: 1100px) {
  .review-desk {
    height: auto;
  }
  .content-grid,
  .summary-grid,
  .detail-grid,
  .audit-section,
  .detail-media-split {
    grid-template-columns: 1fr;
  }
  .content-grid {
    grid-template-rows: auto;
    flex: none;
  }
  .list-card,
  .detail-card {
    max-height: none;
  }
}
</style>
