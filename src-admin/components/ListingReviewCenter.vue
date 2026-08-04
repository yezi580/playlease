<template>
  <section class="review-center">
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
      <input
        v-model="filters.date"
        type="date"
        class="toolbar-date"
        @keydown.enter.prevent="loadList"
      >
      <button type="button" class="toolbar-btn" @click="loadList">
        搜索
      </button>
      <button type="button" class="toolbar-btn toolbar-btn--ghost" @click="resetFilters">
        重置
      </button>
    </div>

    <p v-if="message" class="message" :class="{ 'message--error': messageType === 'error' }">
      {{ message }}
    </p>

    <div v-if="error" class="state-card state-card--error">{{ error }}</div>
    <div class="content-grid">
      <div class="list-card">
        <div class="card-head">
          <span>共 {{ total }} 条</span>
        </div>
        <transition name="review-fade" mode="out-in">
          <div :key="listTransitionKey" class="list-content-shell">
            <div v-if="!list.length" class="state-card state-card--inner state-card--empty">当前没有符合条件的审核商品</div>
            <div v-else class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>ID</th>
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
                    <td>{{ item.id }}</td>
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
                        {{ formatReviewStatus(item.review_status) }}
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
        </transition>
      </div>

      <div class="detail-card">
        <transition name="fade-soft">
          <div v-if="detailLoading && detail" class="detail-loading-badge">正在切换详情...</div>
        </transition>
        <div v-if="detailLoading && !detail" class="state-card state-card--inner">正在加载详情...</div>
        <div v-else-if="detailError" class="state-card state-card--error state-card--inner">{{ detailError }}</div>
        <div v-else-if="!detail" class="state-card state-card--inner">从左侧选择一条商品开始审核</div>
        <div
          v-else
          class="detail-body detail-body--paged"
          @wheel="handleDetailWheel"
        >
          <div class="detail-page-nav">
            <button
              v-for="page in detailPageCount"
              :key="page"
              type="button"
              class="detail-page-dot"
              :class="{ 'detail-page-dot--active': detailPageIndex === page - 1 }"
              @click="jumpToDetailPage(page - 1)"
            >
              {{ page }}
            </button>
          </div>

          <transition name="review-page-fade" mode="out-in">
            <div
              :key="`detail-page-${detailPageIndex}`"
              class="review-page"
              :class="{ 'review-page--third': detailPageIndex === 2 }"
            >
              <template v-if="detailPageIndex === 0">
                <div class="summary-grid">
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
                    <span>审核状态</span>
                    <strong>{{ formatReviewStatus(detail.review_status) }}</strong>
                  </div>
                  <div class="summary-item">
                    <span>商品状态</span>
                    <strong>{{ formatListingStatus(detail.listing_status) }}</strong>
                  </div>
                  <div class="summary-item">
                    <span>发布时间</span>
                    <strong>{{ formatDateTime(detail.published_at || detail.created_at) }}</strong>
                  </div>
                </div>

                <div class="detail-section">
                  <div class="detail-grid">
                    <label>
                      <span>段位</span>
                      <input :value="detail.rank_name || '--'" readonly>
                    </label>
                    <label>
                      <span>上号方式</span>
                      <input :value="detail.login_method || '--'" readonly>
                    </label>
                    <label>
                      <span>上号时间</span>
                      <input :value="detail.login_time_range || '--'" readonly>
                    </label>
                    <label>
                      <span>保险等级</span>
                      <input :value="detail.insurance_level || '--'" readonly>
                    </label>
                    <label>
                      <span>体力等级</span>
                      <input :value="detail.energy_level || '--'" readonly>
                    </label>
                    <label>
                      <span>负重等级</span>
                      <input :value="detail.weight_level || '--'" readonly>
                    </label>
                    <label>
                      <span>潜水等级</span>
                      <input :value="`${formatPlain(detail.dive_level, '0')}级`" readonly>
                    </label>
                    <label>
                      <span>洗消舱等级</span>
                      <input :value="`${formatPlain(detail.decontamination_chamber_level, '0')}级`" readonly>
                    </label>
                    <label>
                      <span>哈夫币</span>
                      <input :value="formatPlain(detail.hafu_coin, '0')" readonly>
                    </label>
                    <label>
                      <span>基础比例</span>
                      <input :value="formatPlain(detail.base_ratio, '0')" readonly>
                    </label>
                    <label>
                      <span>租金</span>
                      <input :value="formatMoney(detail.rent_price)" readonly>
                    </label>
                    <label>
                      <span>押金</span>
                      <input :value="formatMoney(detail.deposit)" readonly>
                    </label>
                    <label>
                      <span>出租天数</span>
                      <input :value="formatPlain(detail.rent_days, '0')" readonly>
                    </label>
                    <label>
                      <span>每日消耗</span>
                      <input :value="formatPlain(detail.daily_cost)" readonly>
                    </label>
                  </div>
                </div>
              </template>

              <div v-else-if="detailPageIndex === 1" class="detail-section">
                <div class="item-list">
                  <div v-for="item in reviewSaleItems" :key="item.key" class="item-row">
                    <span>{{ item.name }}</span>
                    <span>数量 {{ item.quantity }}</span>
                    <span>总价 {{ formatMoney(item.totalPrice) }}</span>
                  </div>
                </div>
              </div>

              <div v-else>
                <div class="detail-section">
                  <div class="detail-grid">
                    <label>
                      <span>所在地区</span>
                      <input :value="detail.region || '--'" readonly>
                    </label>
                    <label>
                      <span>封禁记录</span>
                      <input :value="detail.ban_record || '--'" readonly>
                    </label>
                    <label>
                      <span>人脸归属</span>
                      <input :value="Number(detail.face_verified) === 1 ? '是' : '否'" readonly>
                    </label>
                    <label class="detail-grid__full">
                      <span>备注</span>
                      <textarea :value="detail.remark || '--'" rows="3" readonly />
                    </label>
                  </div>

                  <div class="detail-section detail-section--split">
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
                        <video
                          class="video-player"
                          :src="getBanVideoSource()"
                          controls
                          preload="metadata"
                          playsinline
                        />
                        <div class="video-actions">
                          <button
                            type="button"
                            class="video-link video-link--button"
                            @click="openMediaPreview({ type: 'video', src: getBanVideoSource(), title: '封禁记录视频' })"
                          >
                            放大预览
                          </button>
                          <a class="video-link" :href="getBanVideoSource()" target="_blank" rel="noreferrer">
                            新标签打开
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="detail-section detail-section--split audit-section">
                    <div class="detail-subsection">
                      <h4>历史审核备注</h4>
                      <textarea
                        class="audit-textarea audit-textarea--readonly"
                        :value="detail.review_reason || '--'"
                        rows="3"
                        readonly
                      />
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
                        <button
                          type="button"
                          class="action-btn action-btn--primary"
                          :disabled="actionSubmitting"
                          @click="approveListing"
                        >
                          {{ actionSubmitting ? '提交中...' : '审核通过' }}
                        </button>
                        <button
                          type="button"
                          class="action-btn action-btn--danger"
                          :disabled="actionSubmitting"
                          @click="rejectListing"
                        >
                          {{ actionSubmitting ? '提交中...' : '驳回商品' }}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </transition>
        </div>
      </div>
    </div>
    <AdminConfirmDialog
      :open="stepUpDialog.open"
      :title="stepUpDialog.title"
      :message="stepUpDialog.message"
      confirm-text="我知道了"
      @cancel="closeStepUpDialog"
      @confirm="closeStepUpDialog"
    />
    <div
      v-if="mediaPreview.open"
      class="media-preview-mask"
      @click.self="closeMediaPreview"
    >
      <div class="media-preview-dialog">
        <div class="media-preview-head">
          <strong>{{ mediaPreview.title || '媒体预览' }}</strong>
          <button
            type="button"
            class="media-preview-close"
            @click="closeMediaPreview"
          >
            关闭
          </button>
        </div>
        <div class="media-preview-body">
          <img
            v-if="mediaPreview.type === 'image'"
            class="media-preview-image"
            :src="mediaPreview.src"
            :alt="mediaPreview.title || '图片预览'"
          >
          <video
            v-else-if="mediaPreview.type === 'video'"
            class="media-preview-video"
            :src="mediaPreview.src"
            controls
            autoplay
            playsinline
          />
        </div>
      </div>
    </div>
  </section>
</template>

<script>
import {
  apiFetch,
  createAuthorizedObjectUrl,
  getStepUpRequirementMessage,
  getStepUpRequirementReason,
  isStepUpRequiredError,
  performAdminStepUp
} from '../utils/api.js'
import AdminConfirmDialog from './AdminConfirmDialog.vue'

const REVIEW_STATUS_LABELS = Object.freeze({
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回'
})

const LISTING_STATUS_LABELS = Object.freeze({
  active: '上架中',
  inactive: '已下架',
  pending_review: '审核中',
  sold_out: '已售出',
  rented: '已租出'
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
  name: 'ListingReviewCenter',
  components: {
    AdminConfirmDialog
  },
  data() {
    return {
      loading: false,
      error: '',
      list: [],
      total: 0,
      filters: {
        keyword: '',
        status: 'pending',
        date: ''
      },
      selectedId: 0,
      detail: null,
      detailLoading: false,
      detailError: '',
      protectedBanImages: [],
      protectedBanVideo: '',
      protectedMediaRequestId: 0,
      detailRequestId: 0,
      listRequestId: 0,
      listTransitionKey: 0,
      detailPageIndex: 0,
      lastDetailWheelAt: 0,
      actionSubmitting: false,
      auditRemark: '',
      message: '',
      messageType: 'success',
      stepUpDialog: {
        open: false,
        title: '请完成二次校验',
        message: ''
      },
      mediaPreview: {
        open: false,
        type: 'image',
        src: '',
        title: ''
      },
      statusOptions: [
        { value: 'pending', label: '待审核' },
        { value: 'rejected', label: '已驳回' },
        { value: 'approved', label: '已通过' },
        { value: 'all', label: '全部状态' }
      ]
    }
  },
  computed: {
    detailPageCount() {
      return 3
    },
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
      this.protectedBanImages.forEach((url) => {
        if (url) URL.revokeObjectURL(url)
      })
      if (this.protectedBanVideo) {
        URL.revokeObjectURL(this.protectedBanVideo)
      }
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
        const nextBanImages = await Promise.all(
          banImages.map((url) => createAuthorizedObjectUrl(url))
        )
        const nextBanVideo = banVideo ? await createAuthorizedObjectUrl(banVideo) : ''
        if (requestId !== this.protectedMediaRequestId) {
          nextBanImages.forEach((url) => {
            if (url) URL.revokeObjectURL(url)
          })
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
        if (this.filters.date) {
          params.set('date', this.filters.date)
        }
        const data = await apiFetch(`/api/admin/review/listings?${params.toString()}`)
        if (requestId !== this.listRequestId) return
        this.list = Array.isArray(data.list) ? data.list : []
        this.total = Number(data.total || 0)

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
        this.listTransitionKey += 1
      } catch (error) {
        if (requestId !== this.listRequestId) return
        this.error = error.message || '加载审核商品失败'
      } finally {
        if (requestId === this.listRequestId) {
          this.loading = false
        }
      }
    },
    applyStatusFilter(status) {
      const nextStatus = String(status || 'pending')
      if (this.filters.status === nextStatus && !this.error) return
      this.filters.status = nextStatus
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
        const data = await apiFetch(`/api/admin/review/listings/${nextId}`)
        if (requestId !== this.detailRequestId) return
        this.detail = data || null
        this.detailPageIndex = 0
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
        if (requestId === this.detailRequestId) {
          this.detailLoading = false
        }
      }
    },
    resetFilters() {
      this.filters = {
        keyword: '',
        status: 'pending',
        date: ''
      }
      this.message = ''
      this.loadList()
    },
    handleDetailWheel(event) {
      if (!this.detail) return
      const deltaY = Number(event?.deltaY || 0)
      if (Math.abs(deltaY) < 8) return
      const pageElement = event?.target instanceof Element
        ? event.target.closest('.review-page')
        : null
      if (pageElement) {
        const canScroll = pageElement.scrollHeight > pageElement.clientHeight + 1
        if (canScroll) {
          const reachedTop = pageElement.scrollTop <= 1
          const reachedBottom = pageElement.scrollTop + pageElement.clientHeight >= pageElement.scrollHeight - 1
          if ((deltaY > 0 && !reachedBottom) || (deltaY < 0 && !reachedTop)) {
            return
          }
        }
      }
      const now = Date.now()
      if (now - this.lastDetailWheelAt < 280) return
      event.preventDefault()
      this.lastDetailWheelAt = now
      this.changeDetailPage(deltaY > 0 ? 1 : -1)
    },
    changeDetailPage(offset) {
      const nextIndex = Math.min(
        this.detailPageCount - 1,
        Math.max(0, this.detailPageIndex + offset)
      )
      this.detailPageIndex = nextIndex
    },
    jumpToDetailPage(index) {
      const nextIndex = Math.min(this.detailPageCount - 1, Math.max(0, Number(index) || 0))
      this.detailPageIndex = nextIndex
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

        try {
          await performAdminStepUp(action)
        } catch (stepUpError) {
          this.openStepUpDialog('二次校验未完成', stepUpError.message || 'Passkey 二次校验失败')
          throw stepUpError
        }

        return requester()
      }
    },
    openStepUpDialog(title, message) {
      this.stepUpDialog = {
        open: true,
        title,
        message
      }
    },
    closeStepUpDialog() {
      this.stepUpDialog = {
        open: false,
        title: '请完成二次校验',
        message: ''
      }
    },
    async approveListing() {
      if (!this.detail?.id) return
      this.actionSubmitting = true
      this.message = ''
      try {
        const data = await this.runProtectedAction('approve_listing', () => (
          apiFetch(`/api/admin/review/listings/${this.detail.id}/approve`, {
            method: 'PUT',
            body: JSON.stringify({
              remark: this.auditRemark
            })
          })
        ))
        this.messageType = 'success'
        this.message = data.message || '商品审核已通过'
        await this.selectListing({ id: this.detail.id })
        await this.loadList()
      } catch (error) {
        this.messageType = 'error'
        this.message = error.message || '审核通过失败'
      } finally {
        this.actionSubmitting = false
      }
    },
    async rejectListing() {
      if (!this.detail?.id) return
      if (!this.auditRemark) {
        this.messageType = 'error'
        this.message = '请先填写驳回原因'
        return
      }
      this.actionSubmitting = true
      this.message = ''
      try {
        const data = await this.runProtectedAction('reject_listing', () => (
          apiFetch(`/api/admin/review/listings/${this.detail.id}/reject`, {
            method: 'PUT',
            body: JSON.stringify({
              reason: this.auditRemark
            })
          })
        ))
        this.messageType = 'success'
        this.message = data.message || '商品已驳回'
        await this.selectListing({ id: this.detail.id })
        await this.loadList()
      } catch (error) {
        this.messageType = 'error'
        this.message = error.message || '驳回商品失败'
      } finally {
        this.actionSubmitting = false
      }
    },
    formatReviewStatus(status) {
      return REVIEW_STATUS_LABELS[String(status || '').trim()] || '未知状态'
    },
    formatListingStatus(status) {
      return LISTING_STATUS_LABELS[String(status || '').trim()] || '未知状态'
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
      this.mediaPreview = {
        open: false,
        type: 'image',
        src: '',
        title: ''
      }
    }
  }
}
</script>

<style scoped>
.review-center {
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
.toolbar-date,
.detail-grid input,
.detail-grid textarea {
  min-height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #1f2937;
}

.toolbar-input {
  flex: 1 1 280px;
}

.toolbar-select,
.toolbar-date {
  min-width: 140px;
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
  border: 1px solid #dbe2ea;
  background: #fff;
  color: #475569;
  transition: all 0.2s ease;
}

.status-filter-btn:hover:not(:disabled) {
  border-color: #93c5fd;
  color: #1d4ed8;
  background: #f8fbff;
}

.status-filter-btn--active {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
  font-weight: 700;
  box-shadow: 0 6px 18px rgba(59, 130, 246, 0.12);
}

.toolbar-btn,
.row-btn,
.action-btn {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
  white-space: nowrap;
}

.toolbar-btn--ghost {
  border-color: #d1d5db;
  background: #fff;
  color: #374151;
}

.row-btn--muted {
  border-color: #e5e7eb;
  background: #f8fafc;
  color: #cbd5e1;
  box-shadow: none;
  cursor: default;
}

.message {
  margin: 0;
  color: #047857;
}

.message--error {
  color: #b91c1c;
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 16px;
  align-items: start;
}

.list-card,
.detail-card,
.state-card {
  border-radius: 18px;
  border: 1px solid #e5e7eb;
  background: #fff;
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.08);
}

.list-card,
.detail-card {
  position: relative;
  height: calc(100vh - 190px);
  padding: 18px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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

.state-card--empty {
  flex: 1;
  display: grid;
  place-items: center;
  min-height: 180px;
  border-color: transparent;
  background: transparent;
}

.list-content-shell {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
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
  flex: 1;
  min-height: 0;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;
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

.row-active {
  background: #f8fbff;
  transition: background-color 0.24s ease;
}

.cell-main {
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
}

.cell-sub {
  margin-top: 4px;
  color: #6b7280;
  font-size: 12px;
  white-space: nowrap;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 70px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
}

.status-badge--pending {
  background: #dbeafe;
  color: #1d4ed8;
}

.status-badge--approved {
  background: #d1fae5;
  color: #047857;
}

.status-badge--rejected {
  background: #fee2e2;
  color: #b91c1c;
}

.detail-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: auto;
  padding-right: 4px;
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;
}

.detail-body--paged {
  overflow: hidden;
  padding-right: 0;
}

.detail-page-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.detail-page-dot {
  min-width: 30px;
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid #dbe2ea;
  background: #fff;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.detail-page-dot--active {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
}

.review-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: auto;
  padding-right: 4px;
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;
}

.review-page--third {
  gap: 10px;
}

.table-wrap::-webkit-scrollbar,
.detail-body::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.table-wrap::-webkit-scrollbar-track,
.detail-body::-webkit-scrollbar-track {
  background: transparent;
}

.table-wrap::-webkit-scrollbar-thumb,
.detail-body::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.45);
}

.table-wrap::-webkit-scrollbar-thumb:hover,
.detail-body::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.7);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.review-page-fade-enter-active,
.review-page-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.review-page-fade-enter-from,
.review-page-fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.summary-item {
  padding: 14px;
  border-radius: 14px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
}

.summary-item span {
  display: block;
  color: #6b7280;
  font-size: 13px;
  margin-bottom: 8px;
}

.detail-section {
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 16px;
  background: #fafafa;
}

.detail-section h3 {
  margin: 0 0 12px;
  font-size: 16px;
}

.detail-section--split {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.detail-subsection + .detail-subsection {
  margin-top: 16px;
}

.detail-section--split .detail-subsection + .detail-subsection {
  margin-top: 0;
}

.detail-subsection h4 {
  margin: 0 0 12px;
  font-size: 14px;
  color: #374151;
}

.detail-section--split .detail-subsection {
  min-width: 0;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.detail-grid label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #374151;
  font-size: 13px;
}

.detail-grid__full {
  grid-column: 1 / -1;
}

.detail-grid textarea {
  min-height: 96px;
  padding: 10px 12px;
  resize: vertical;
}

.audit-textarea {
  width: 100%;
  box-sizing: border-box;
  border-radius: 10px;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  transition: all 0.2s ease;
  min-height: 96px;
  padding: 10px 12px;
}

.audit-textarea--readonly {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #64748b;
  cursor: default;
  resize: none;
}

.audit-textarea--readonly:focus {
  outline: none;
  border-color: #cbd5e1;
}

.audit-textarea--editable {
  background: #fff;
  border: 1px solid #cbd5e1;
  color: #334155;
  resize: none;
}

.audit-textarea--editable:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.audit-textarea::placeholder {
  color: #94a3b8;
}

.review-page--third .detail-section {
  padding: 12px;
}

.review-page--third .detail-grid {
  gap: 10px;
}

.review-page--third .detail-grid textarea,
.review-page--third .audit-textarea {
  min-height: 72px;
}

.item-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.item-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px 140px;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
}

.review-page--third .image-grid {
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 10px;
}

.image-card {
  display: block;
  width: 100%;
  padding: 0;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  background: #fff;
  cursor: zoom-in;
}

.image-card img {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
}

.review-page--third .image-card img {
  aspect-ratio: 4 / 3;
  max-height: 112px;
}

.video-link {
  display: inline-flex;
  margin-top: 12px;
  color: #1d4ed8;
  text-decoration: none;
}

.video-link--button {
  min-height: 38px;
  padding: 0 14px;
  margin-top: 0;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  background: #eff6ff;
  font-weight: 600;
}

.video-preview-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
}

.video-player {
  width: 100%;
  max-height: 320px;
  border-radius: 16px;
  background: #020617;
}

.video-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.media-preview-mask {
  position: fixed;
  inset: 0;
  z-index: 40;
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
  gap: 16px;
  padding: 18px;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.28);
}

.media-preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.media-preview-close {
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  background: #fff;
  color: #374151;
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
  max-height: calc(100vh - 180px);
  border-radius: 16px;
  background: #020617;
}

.audit-section {
  background: #fff;
}

.audit-actions {
  display: flex;
  gap: 12px;
  margin-top: 14px;
}

.review-page--third .audit-actions {
  margin-top: 10px;
}

.action-btn {
  flex: 1;
  font-weight: 600;
  transition: all 0.2s ease;
}

.action-btn--primary {
  background: #1d4ed8;
  border-color: #1d4ed8;
  color: #fff;
}

.action-btn--primary:hover:not(:disabled) {
  background: #1e40af;
  border-color: #1e40af;
  box-shadow: 0 4px 12px rgba(29, 78, 216, 0.2);
}

.action-btn--danger {
  background: #fff1f2;
  border-color: #fecaca;
  color: #b91c1c;
}

.action-btn--danger:hover:not(:disabled) {
  background: #fef2f2;
  border-color: #f87171;
  color: #991b1b;
}

.detail-loading-badge {
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #dbeafe;
  color: #1d4ed8;
  font-size: 12px;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(6px);
}

.review-fade-enter-active,
.review-fade-leave-active {
  transition: opacity 0.16s ease;
}

.review-fade-enter-from,
.review-fade-leave-to {
  opacity: 0;
}

.fade-soft-enter-active,
.fade-soft-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.fade-soft-enter-from,
.fade-soft-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 1100px) {
  .content-grid,
  .summary-grid,
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .detail-section--split {
    grid-template-columns: 1fr;
  }

  .list-card,
  .detail-card {
    height: auto;
  }

  .table-wrap,
  .detail-body {
    overflow: visible;
  }

  .item-row {
    grid-template-columns: 1fr;
  }
}
</style>
