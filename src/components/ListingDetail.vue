<template>
  <div class="detail-wrap">
    <div v-if="loading" class="status-box">正在加载详情...</div>
    <div v-else-if="errorMsg" class="status-box error">{{ errorMsg }}</div>
    <div v-else-if="!detail" class="status-box">未找到商品详情</div>

    <div v-else class="detail-content">
      <section class="publish-section">
        <h3>基础信息</h3>
        <div class="form-grid">
          <label>
            <span>商品编号</span>
            <div class="copy-field-row">
              <input class="readonly-input" :value="detail.listing_no || detail.id" readonly />
              <CopyTextButton :text="detail.listing_no || detail.id" label="商品编号" />
            </div>
          </label>
          <label>
            <span>发布者</span>
            <input class="readonly-input" :value="formatText(detail.owner_name)" readonly />
          </label>
          <label>
            <span>发布时间</span>
            <input class="readonly-input" :value="formatTime(detail.published_at || detail.created_at)" readonly />
          </label>
          <label>
            <span>上号方式</span>
            <input class="readonly-input" :value="formatText(detail.login_method)" readonly />
          </label>
          <label>
            <span>上号时间</span>
            <div class="time-range-input">
              <input class="readonly-input" :value="loginTimeRange.start || '-'" readonly />
              <span class="time-sep">-</span>
              <input class="readonly-input" :value="loginTimeRange.end || '-'" readonly />
            </div>
          </label>
          <label>
            <span>保险等级</span>
            <input class="readonly-input" :value="formatInsuranceLevel(detail.insurance_level)" readonly />
          </label>
          <label>
            <span>体力等级</span>
            <input class="readonly-input" :value="formatText(detail.energy_level)" readonly />
          </label>
          <label>
            <span>负重等级</span>
            <input class="readonly-input" :value="formatText(detail.weight_level)" readonly />
          </label>
          <label>
            <span>潜水等级</span>
            <input class="readonly-input" :value="withUnit(detail.dive_level, '级')" readonly />
          </label>
          <label>
            <span>洗消舱等级</span>
            <input class="readonly-input" :value="withUnit(detail.decontamination_chamber_level, '级')" readonly />
          </label>
        </div>
      </section>

      <section class="publish-section">
        <h3>详细属性</h3>
        <div class="form-grid">
          <div class="field-row inline-radio-row">
            <span class="inline-row-title">封禁记录</span>
            <div class="radio-group">
              <label class="radio-label" :class="{ active: detail.ban_record === '有' }">
                <input type="radio" :checked="detail.ban_record === '有'" disabled />
                有
              </label>
              <label class="radio-label" :class="{ active: detail.ban_record === '无' }">
                <input type="radio" :checked="detail.ban_record === '无'" disabled />
                无
              </label>
            </div>
          </div>

          <div class="field-row inline-radio-row">
            <span class="inline-row-title">人脸归属本人</span>
            <div class="radio-group">
              <label class="radio-label" :class="{ active: Number(detail.face_verified) === 1 }">
                <input type="radio" :checked="Number(detail.face_verified) === 1" disabled />
                是
              </label>
              <label class="radio-label" :class="{ active: Number(detail.face_verified) === 0 }">
                <input type="radio" :checked="Number(detail.face_verified) === 0" disabled />
                否
              </label>
            </div>
          </div>

          <label>
            <span>账号等级</span>
            <input class="readonly-input" :value="formatText(detail.character_level, '0')" readonly />
          </label>
          <label>
            <span>账号段位</span>
            <input class="readonly-input" :value="formatText(detail.rank_name)" readonly />
          </label>
          <label>
            <span>绝密 KD</span>
            <input class="readonly-input" :value="formatText(detail.secret_kd, '0')" readonly />
          </label>
          <label>
            <span>哈夫币余额</span>
            <div class="hafu-input-wrap">
              <input class="readonly-input" :value="formatText(detail.hafu_coin, '0')" readonly />
              <span class="hafu-unit">M</span>
            </div>
          </label>
          <label>
            <span>押金</span>
            <input class="readonly-input" :value="formatMoney(detail.deposit)" readonly />
          </label>
          <label>
            <span>基础比例</span>
            <input class="readonly-input" :value="formatText(detail.base_ratio, '0')" readonly />
          </label>
          <label>
            <span>每日消耗</span>
            <input class="readonly-input" :value="formatText(detail.daily_cost, '0')" readonly />
          </label>
          <label>
            <span>出租天数</span>
            <input class="readonly-input" :value="formatText(detail.rent_days, '0')" readonly />
          </label>
          <label>
            <span>{{ rentLabelText }}</span>
            <input class="readonly-input" :value="formatMoney(displayRentPrice)" readonly />
          </label>
          <label v-if="!hideCompensationPlan">
            <span>保险赔付</span>
            <input class="readonly-input" :value="compensationPlanLabel" readonly />
          </label>

          <div class="field-group">
            <span>所在地区</span>
            <div class="region-select-row">
              <input class="readonly-input" :value="regionDisplay.province" readonly />
              <input class="readonly-input" :value="regionDisplay.city" readonly />
            </div>
          </div>

          <div class="field-group">
            <span>干员外观</span>
            <div class="capsule-selector">
              <span
                v-for="item in getCapsules(detail.operator_appearance)"
                :key="`operator-${item}`"
                class="capsule-btn readonly-capsule"
              >
                {{ item }}
              </span>
              <span v-if="!getCapsules(detail.operator_appearance).length" class="empty-text">未填写</span>
            </div>
          </div>

          <div class="field-group">
            <span>持有刀皮</span>
            <div class="capsule-selector">
              <span
                v-for="item in getCapsules(detail.knife_skin)"
                :key="`knife-${item}`"
                class="capsule-btn readonly-capsule"
              >
                {{ item }}
              </span>
              <span v-if="!getCapsules(detail.knife_skin).length" class="empty-text">未填写</span>
            </div>
          </div>

          <div class="field-group">
            <span>武器皮肤</span>
            <div class="capsule-selector">
              <span
                v-for="item in getCapsules(detail.weapon_skin)"
                :key="`weapon-${item}`"
                class="capsule-btn readonly-capsule"
              >
                {{ item }}
              </span>
              <span v-if="!getCapsules(detail.weapon_skin).length" class="empty-text">未填写</span>
            </div>
          </div>

          <label>
            <span>备注</span>
            <textarea class="readonly-input" :value="formatText(detail.remark, '')" rows="4" readonly />
          </label>
        </div>
      </section>

      <section class="publish-section">
        <h3>额外物品与图片</h3>

        <div class="items-table" v-if="!isMobile">
          <div class="item-head-empty"></div>
          <div class="col-label">方式</div>
          <div class="col-label">数量</div>
          <div class="col-label">总价</div>

          <template v-for="item in saleItems" :key="item.key">
            <div class="item-name">
              {{ item.name }}
              <div v-if="item.remark" class="item-remark">{{ item.remark }}</div>
            </div>
            <div class="item-col">
              <div class="auto-total">{{ getItemModeLabel(item.key) }}</div>
            </div>
            <div class="item-col">
              <input class="item-qty-input readonly-input" :value="getItemQuantity(item.key)" readonly />
            </div>
            <div class="item-col">
              <div class="auto-total">{{ getItemTotal(item.key) }}</div>
            </div>
          </template>

          <div class="items-total-row">
            <div class="item-name total-label">额外物品总价</div>
            <div class="item-col"></div>
            <div class="item-col"></div>
            <div class="item-col">
              <div class="auto-total items-total-price">{{ formatMoney(totalItemsPrice) }}</div>
            </div>
          </div>
        </div>

        <div class="items-table-mobile" v-else>
            <div v-for="item in saleItems" :key="`mobile-${item.key}`" class="item-card-mobile">
              <div class="item-card-header">
                <span class="item-name-mobile">
                  {{ item.name }}
                  <span v-if="item.remark" class="item-remark-mobile">({{ item.remark }})</span>
                </span>
                <span class="item-price-mobile">{{ getItemTotal(item.key) }}</span>
              </div>
            <div class="item-card-body">
              <span class="item-mode-mobile">方式: {{ getItemModeLabel(item.key) }}</span>
              <div class="item-qty-mobile">
                <span class="qty-label">数量:</span>
                <input class="item-qty-input readonly-input qty-val" :value="getItemQuantity(item.key)" readonly />
              </div>
            </div>
          </div>
          <div class="item-card-mobile items-total-mobile">
            <span class="item-name-mobile total-label">额外物品总价</span>
            <span class="item-price-mobile total-price-display">{{ formatMoney(totalItemsPrice) }} 元</span>
          </div>
        </div>

        <div class="media-block">
          <h4>商品图片</h4>
          <div v-if="detail.images?.length" class="preview-grid">
            <div v-for="(image, index) in detail.images" :key="`image-${index}`" class="preview-card">
              <button
                type="button"
                class="preview-media-trigger"
                @click="openImagePreview(image, `商品图片${index + 1}`)"
              >
                <img :src="image" :alt="`商品图片${index + 1}`" />
              </button>
            </div>
          </div>
          <div v-else class="status-box inner">暂无图片</div>
        </div>

        <div class="media-block" v-if="detail.ban_record === '有' || detail.banImages?.length || detail.banVideo">
          <h4>封禁凭证</h4>
          <div v-if="detail.banImages?.length" class="preview-grid">
            <div v-for="(image, index) in detail.banImages" :key="`ban-image-${index}`" class="preview-card">
              <button
                type="button"
                class="preview-media-trigger"
                @click="openImagePreview(getBanImageSource(image, index), `处罚截图${index + 1}`)"
              >
                <img :src="getBanImageSource(image, index)" :alt="`处罚截图${index + 1}`" />
              </button>
            </div>
          </div>
          <button
            v-if="detail.banVideo"
            type="button"
            class="video-link"
            :disabled="loadingBanVideoPreview"
            @click="openBanVideoPreview"
          >
            {{ loadingBanVideoPreview ? '封禁记录视频加载中...' : '查看封禁记录视频' }}
          </button>
          <div v-if="!detail.banImages?.length && !detail.banVideo" class="status-box inner">暂无封禁凭证</div>
        </div>
      </section>

      <div class="submit-row">
        <div class="submit-container">
          <div class="submit-info-block">
            <div v-if="!readOnly" class="agreement-box">
              <div class="agreement-content">
                <div class="price-summary">
                  <div class="summary-row"><span>{{ rentLabelText }}</span><em>{{ formatMoney(displayRentPrice) }} 元</em></div>
                  <div class="summary-row"><span>押金</span><em>{{ formatMoney(detail.deposit) }} 元</em></div>
                  <div class="summary-row"><span>额外物品总价</span><em>{{ formatMoney(totalItemsPrice) }} 元</em></div>
                  <div class="summary-total"><span>应付合计</span><strong>{{ formatMoney(sumPrice) }} 元</strong></div>
                </div>
                <div class="agreement-checks-wrap">
                  <div class="agreement-title">下单前请先确认以下协议</div>
                  <div class="agreement-checks">
                    <label class="agreement-check">
                      <input v-model="agreementState.acceptPaymentAgreement" type="checkbox" />
                      <span>我已阅读并同意《{{ paymentAgreement.title }}》</span>
                      <button type="button" class="agreement-link" @click.prevent="openAgreementModal(paymentAgreement)">
                        查看协议
                      </button>
                    </label>
                    <label class="agreement-check">
                      <input v-model="agreementState.acceptBuyerAgreement" type="checkbox" />
                      <span>我已阅读并同意《{{ buyerAgreement.title }}》</span>
                      <button type="button" class="agreement-link" @click.prevent="openAgreementModal(buyerAgreement)">
                        查看协议
                      </button>
                    </label>
                  </div>
                </div>
              </div>
              <button
                class="rent-now-btn agreement-submit-btn"
                :class="{ disabled: !canSubmitOrder }"
                :disabled="!canSubmitOrder"
                @click="handleRentNow"
              >
                立即租用
              </button>
            </div>
          </div>
        </div>
      </div>

      <OrderModal
        v-if="detail && !readOnly"
        :listing="orderModalListing"
        :visible="showOrderModal"
        :agreements="orderAgreementPayload"
        @close="showOrderModal = false"
        @order-created="handleOrderCreated"
      />
    </div>
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="activeAgreement" class="agreement-modal-overlay" @click.self="closeAgreementModal">
          <div class="agreement-modal">
            <div class="agreement-modal-header">
              <div>
                <h3>{{ activeAgreement.title }}</h3>
                <p>协议版本：{{ activeAgreement.version }}</p>
              </div>
              <button type="button" class="agreement-close-btn" @click="closeAgreementModal">×</button>
            </div>
            <div class="agreement-modal-body">
              <p class="agreement-intro">{{ activeAgreement.intro }}</p>
              <section
                v-for="section in activeAgreement.sections"
                :key="`${activeAgreement.key}-${section.title}`"
                class="agreement-section"
              >
                <h4>{{ section.title }}</h4>
                <ol>
                  <li v-for="item in section.items" :key="item">{{ item }}</li>
                </ol>
              </section>
            </div>
            <div class="agreement-modal-footer">
              <button type="button" class="agreement-confirm-btn" @click="acceptAndCloseAgreement(activeAgreement.key)">
                我已阅读，返回勾选
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
    <Teleport to="body">
      <Transition name="media-preview-fade">
        <div v-if="previewMediaUrl" class="media-preview-overlay" @click.self="closeMediaPreview">
          <button type="button" class="media-preview-close" @click="closeMediaPreview">关闭</button>
          <img
            v-if="previewMediaType === 'image'"
            :src="previewMediaUrl"
            :alt="previewMediaName || '图片预览'"
            class="media-preview-image"
          />
          <video
            v-else
            :src="previewMediaUrl"
            :aria-label="previewMediaName || '视频预览'"
            class="media-preview-video"
            controls
            autoplay
          ></video>
          <div v-if="previewMediaName" class="media-preview-name">{{ previewMediaName }}</div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script>
import { apiFetch, createAuthorizedObjectUrl, getStoredUser } from '../utils/api'
import { BUYER_AGREEMENT, BUYER_AGREEMENT_VERSION, PAYMENT_AGREEMENT, PAYMENT_AGREEMENT_VERSION } from '../constants/rentalAgreements.js'
import { resolveRegionSelection } from '../constants/regionData'
import { calculateBuyerRentFromSellerRent, calculateServiceFeeFromSellerRent, formatMoneyPrecise, parseAmount } from '../utils/money'
import CopyTextButton from './CopyTextButton.vue'
import {
  fetchBusinessSettings,
  getCachedBusinessSettings,
  getCompensationPlanOption,
  getEnabledSaleItems,
  getBuyerRentLabel
} from '../utils/businessSettings.js'
import { showWarningToast } from '../utils/toast.js'
import OrderModal from './OrderModal.vue'

export default {
  name: 'ListingDetail',
  components: {
    CopyTextButton,
    OrderModal
  },
  emits: ['back', 'goto-profile', 'require-login'],
  props: {
    listingId: {
      type: [Number, String],
      required: true
    },
    isLoggedIn: {
      type: Boolean,
      default: false
    },
    backText: {
      type: String,
      default: '返回列表'
    },
    readOnly: {
      type: Boolean,
      default: false
    },
    useSellerPricingView: {
      type: Boolean,
      default: false
    },
    prefetchedData: {
      type: Object,
      default: null
    },
    hideCompensationPlan: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      loading: false,
      errorMsg: '',
      detail: null,
      showOrderModal: false,
      isMobile: window.innerWidth <= 1200,
      businessSettings: getCachedBusinessSettings(),
      saleItems: getEnabledSaleItems().map((item) => ({ key: item.key, name: item.itemName, remark: item.remark })),
      protectedBanImages: [],
      protectedBanVideo: '',
      protectedMediaRequestId: 0,
      loadingBanVideoPreview: false,
      paymentAgreement: PAYMENT_AGREEMENT,
      buyerAgreement: BUYER_AGREEMENT,
      activeAgreement: null,
      previewMediaType: 'image',
      previewMediaUrl: '',
      previewMediaName: '',
      agreementState: {
        acceptPaymentAgreement: false,
        acceptBuyerAgreement: false
      }
    }
  },
  computed: {
    sellerRentPrice() {
      return parseAmount(this.detail?.rent_price)
    },
    serviceFee() {
      return calculateServiceFeeFromSellerRent(
        this.sellerRentPrice,
        this.businessSettings.platformCommission?.buyerServiceFeeRatePercent
      )
    },
    displayRentPrice() {
      if (this.useSellerPricingView) {
        return this.sellerRentPrice
      }
      return calculateBuyerRentFromSellerRent(
        this.sellerRentPrice,
        this.businessSettings.platformCommission?.buyerServiceFeeRatePercent
      )
    },
    rentLabelText() {
      return this.useSellerPricingView ? '租金' : getBuyerRentLabel(this.businessSettings)
    },
    sumPrice() {
      const deposit = parseAmount(this.detail?.deposit)
      return deposit + this.displayRentPrice
    },
    totalItemsPrice() {
      return (this.detail?.items || []).reduce((sum, item) => {
        if (item?.item_mode === 'gift') return sum
        return sum + parseAmount(item?.total_price)
      }, 0)
    },
    regionSelection() {
      return resolveRegionSelection(this.detail?.region || '')
    },
    regionDisplay() {
      const rawRegion = String(this.detail?.region || '').trim()
      const province = this.regionSelection.province || rawRegion || '-'
      const city = this.regionSelection.city || '-'
      return { province, city }
    },
    loginTimeRange() {
      const [start = '', end = ''] = String(this.detail?.login_time_range || '').split('-')
      return {
        start: start.trim(),
        end: end.trim()
      }
    },
    compensationPlanLabel() {
      return getCompensationPlanOption(this.detail?.compensation_plan, this.businessSettings).shortLabel
    },
    orderModalListing() {
      if (!this.detail) return null
      return {
        ...this.detail,
        buyer_rent_price: this.displayRentPrice,
        service_fee: this.serviceFee
      }
    },
    canSubmitOrder() {
      return this.agreementState.acceptPaymentAgreement && this.agreementState.acceptBuyerAgreement
    },
    orderAgreementPayload() {
      return {
        acceptBuyerAgreement: this.agreementState.acceptBuyerAgreement,
        acceptPaymentAgreement: this.agreementState.acceptPaymentAgreement,
        buyerAgreementVersion: BUYER_AGREEMENT_VERSION,
        paymentAgreementVersion: PAYMENT_AGREEMENT_VERSION
      }
    }
  },
  watch: {
    listingId: {
      immediate: true,
      async handler() {
        await this.fetchDetail()
      }
    },
    prefetchedData: {
      deep: true,
      async handler(value) {
        if (value) {
          await this.applyDetail(value)
        }
      }
    }
  },
  async mounted() {
    window.addEventListener('resize', this.handleResize)
    window.addEventListener('keydown', this.handlePreviewKeydown)
    this.businessSettings = await fetchBusinessSettings()
    this.saleItems = getEnabledSaleItems(this.businessSettings).map((item) => ({
      key: item.key,
      name: item.itemName,
      remark: item.remark
    }))
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.handleResize)
    window.removeEventListener('keydown', this.handlePreviewKeydown)
    this.revokeProtectedBanMedia()
  },
  methods: {
    handleResize() {
      this.isMobile = window.innerWidth <= 1200
    },
    handlePreviewKeydown(event) {
      if (event?.key === 'Escape' && this.previewMediaUrl) {
        this.closeMediaPreview()
      }
    },
    openImagePreview(imageUrl, imageName = '') {
      const targetUrl = String(imageUrl || '').trim()
      if (!targetUrl) return
      this.previewMediaType = 'image'
      this.previewMediaUrl = targetUrl
      this.previewMediaName = String(imageName || '').trim()
    },
    openVideoPreview(videoUrl, videoName = '') {
      const targetUrl = String(videoUrl || '').trim()
      if (!targetUrl) return
      this.previewMediaType = 'video'
      this.previewMediaUrl = targetUrl
      this.previewMediaName = String(videoName || '').trim()
    },
    closeMediaPreview() {
      this.previewMediaType = 'image'
      this.previewMediaUrl = ''
      this.previewMediaName = ''
    },
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
      this.loadingBanVideoPreview = false

      const banImages = Array.isArray(detail?.banImages) ? detail.banImages.filter(Boolean) : []
      if (!banImages.length) return

      try {
        const nextBanImages = await Promise.all(
          banImages.map((url) => createAuthorizedObjectUrl(url))
        )
        if (requestId !== this.protectedMediaRequestId) {
          nextBanImages.forEach((url) => {
            if (url) URL.revokeObjectURL(url)
          })
          return
        }
        this.protectedBanImages = nextBanImages
      } catch (_error) {
        if (requestId === this.protectedMediaRequestId) {
          this.revokeProtectedBanMedia()
        }
      }
    },
    async applyDetail(detail) {
      this.detail = detail
      this.agreementState = {
        acceptPaymentAgreement: false,
        acceptBuyerAgreement: false
      }
      this.activeAgreement = null
      await this.hydrateProtectedBanMedia(detail)
    },
    shouldReportListingClick(detail) {
      const listingId = Number(detail?.id || 0)
      if (!listingId || this.readOnly) return false
      const storedUser = getStoredUser()
      if (storedUser?.role && storedUser.role !== 'user') return false
      return true
    },
    getListingClickSessionKey(detail) {
      const listingId = Number(detail?.id || 0)
      return `listing-click-reported:${listingId}`
    },
    async reportListingClick(detail) {
      if (!this.shouldReportListingClick(detail)) return
      const sessionKey = this.getListingClickSessionKey(detail)
      if (sessionStorage.getItem(sessionKey)) return

      sessionStorage.setItem(sessionKey, '1')
      try {
        await apiFetch(`/api/listings/${detail.id}/click`, {
          method: 'POST'
        })
      } catch (_error) {
        sessionStorage.removeItem(sessionKey)
      }
    },
    async fetchDetail() {
      if (this.prefetchedData) {
        await this.applyDetail(this.prefetchedData)
        void this.reportListingClick(this.prefetchedData)
        this.loading = false
        this.errorMsg = ''
        return
      }

      this.loading = true
      this.errorMsg = ''
      this.detail = null
      this.revokeProtectedBanMedia()
      try {
        const data = await apiFetch(`/api/listings/${this.listingId}`)
        await this.applyDetail(data)
        void this.reportListingClick(data)
      } catch (error) {
        this.errorMsg = `详情加载失败：${error.message}`
      } finally {
        this.loading = false
      }
    },
    formatMoney(value) {
      return formatMoneyPrecise(value)
    },
    formatText(value, fallback = '-') {
      if (value === undefined || value === null || String(value).trim() === '') return fallback
      return String(value)
    },
    formatTime(value) {
      if (!value) return '-'
      return String(value).replace('T', ' ').slice(0, 19)
    },
    formatInsuranceLevel(value) {
      const normalized = String(value || '').trim()
      if (!normalized) return '-'
      const map = {
        '基础（1*2）': '2格',
        '进阶（2*2）': '4格',
        '高级（2*3）': '6格',
        '顶级（3*3）': '9格',
        '2': '2格',
        '4': '4格',
        '6': '6格',
        '9': '9格',
        '2格': '2格',
        '4格': '4格',
        '6格': '6格',
        '9格': '9格'
      }
      return map[normalized] || normalized
    },
    withUnit(value, unit) {
      const text = this.formatText(value)
      if (text === '-') return text
      return `${text} ${unit}`
    },
    getCapsules(value) {
      return String(value || '')
        .split('、')
        .map((item) => item.trim())
        .filter(Boolean)
    },
    getItemByKey(itemKey) {
      if (!Array.isArray(this.detail?.items)) return null
      return this.detail.items.find((item) => item.item_key === itemKey) || null
    },
    getItemQuantity(itemKey) {
      const item = this.getItemByKey(itemKey)
      return item && item.quantity !== null && item.quantity !== undefined ? String(item.quantity) : '0'
    },
    getItemTotal(itemKey) {
      const item = this.getItemByKey(itemKey)
      return `${this.formatMoney(item?.total_price || 0)} 元`
    },
    getItemModeLabel(itemKey) {
      const item = this.getItemByKey(itemKey)
      return item?.item_mode === 'gift' ? '赠送' : '出售'
    },
    getBanImageSource(image, index) {
      return this.protectedBanImages[index] || image
    },
    async openBanVideoPreview() {
      if (this.loadingBanVideoPreview) return
      const rawVideoUrl = String(this.detail?.banVideo || '').trim()
      if (!rawVideoUrl) return

      if (this.protectedBanVideo) {
        this.openVideoPreview(this.protectedBanVideo, '封禁记录视频')
        return
      }

      this.loadingBanVideoPreview = true
      try {
        const objectUrl = await createAuthorizedObjectUrl(rawVideoUrl)
        this.protectedBanVideo = objectUrl
        this.openVideoPreview(objectUrl, '封禁记录视频')
      } catch (error) {
        showWarningToast(error?.message || '封禁记录视频加载失败')
      } finally {
        this.loadingBanVideoPreview = false
      }
    },
    handleRentNow() {
      if (!this.detail) {
        showWarningToast('商品信息加载中，请稍后再试')
        return
      }
      if (!this.isLoggedIn) {
        this.$emit('require-login', '请先登录后再立即租用')
        return
      }
      if (!this.canSubmitOrder) {
        showWarningToast('请先阅读并勾选支付前协议和租客协议')
        return
      }
      this.showOrderModal = true
    },
    openAgreementModal(agreement) {
      this.activeAgreement = agreement || null
    },
    closeAgreementModal() {
      this.activeAgreement = null
    },
    acceptAndCloseAgreement(key) {
      if (key === 'payment') {
        this.agreementState.acceptPaymentAgreement = true
      }
      if (key === 'buyer') {
        this.agreementState.acceptBuyerAgreement = true
      }
      this.closeAgreementModal()
    },
    handleOrderCreated(order) {
      this.showOrderModal = false
      this.$emit('goto-profile', {
        section: 'orders',
        orderFilter: 'pending_payment',
        orderId: Number(order?.id || 0)
      })
    }
  }
}
</script>

<style scoped>
.detail-wrap {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  padding: 16px 20px 200px;
  max-width: 900px;
  margin: 20px auto;
}

.detail-content,
.status-box {
  max-width: 100%;
  margin: 0;
}

.status-box {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  color: #4b5563;
  padding: 16px;
}

.status-box.error {
  border-color: #fecaca;
  background: #fff1f2;
  color: #b91c1c;
}

.status-box.inner {
  border-style: dashed;
}

.publish-section {
  margin-top: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 16px 24px;
  background: #fafafa;
}

.publish-section h3,
.publish-section h4 {
  margin: 0 0 10px;
  color: #111827;
}

.form-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-grid > label,
.field-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 13px;
  color: #374151;
}

.form-grid > label > span,
.field-group > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.field-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: #374151;
}

.inline-radio-row {
  flex-wrap: wrap;
}

.inline-row-title {
  white-space: nowrap;
}

.radio-group {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.radio-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: default;
  padding: 6px 12px;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: #f9fafb;
}

.radio-label.active {
  color: #14532d;
  border-color: #166534;
  background: #dcfce7;
  font-weight: 700;
}

.radio-label input[type='radio'] {
  width: auto;
  accent-color: #166534;
}

.readonly-input {
  background: #e5e7eb !important;
  border: 1px solid #d1d5db !important;
  color: #111827 !important;
  font-weight: 600;
  cursor: not-allowed;
}

.form-grid input,
.form-grid textarea {
  width: 80%;
  max-width: 560px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 9px 10px;
  font-size: 14px;
  background: #fff;
  box-sizing: border-box;
}

.form-grid textarea {
  resize: vertical;
}

.time-range-input,
.region-select-row,
.hafu-input-wrap,
.copy-field-row {
  width: 80%;
  max-width: 560px;
}

.copy-field-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.copy-field-row .readonly-input {
  width: 100%;
}

.copy-inline {
  display: inline-flex;
  align-items: center;
}

.time-range-input {
  display: flex;
  align-items: center;
  gap: 8px;
}

.time-range-input input {
  width: 100%;
}

.time-sep,
.hafu-unit {
  color: #6b7280;
  font-size: 13px;
}

.hafu-input-wrap {
  display: flex;
  align-items: center;
}

.hafu-input-wrap input {
  flex: 1;
}

.hafu-unit {
  padding: 0 10px;
  font-weight: 700;
}

.region-select-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.capsule-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.capsule-btn {
  padding: 8px 14px;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: #f9fafb;
  color: #4b5563;
  font-size: 14px;
}

.readonly-capsule {
  cursor: default;
}

.empty-text {
  color: #6b7280;
}

.items-table {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: 10px 12px;
  align-items: center;
}

.item-head-empty {
  height: 1px;
}

.item-col {
  display: flex;
  align-items: center;
  justify-content: center;
}

.col-label {
  font-size: 13px;
  color: #6b7280;
  font-weight: 600;
  text-align: center;
}

.item-name {
  font-size: 14px;
  color: #111827;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.item-remark {
  font-size: 11px;
  color: #9ca3af;
  font-weight: 400;
  margin-top: 2px;
}

.item-qty-input {
  width: 100%;
  min-width: 86px;
  max-width: none;
  text-align: center;
}

.auto-total {
  width: 100%;
  min-width: 86px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
  font-size: 14px;
  color: #111827;
  font-weight: 600;
  min-height: 36px;
}

.items-total-row {
  display: contents;
}

.total-label {
  font-weight: 700;
  color: #111827;
}

.items-total-price {
  background: #e5e7eb;
  border-color: #d1d5db;
}

.items-table-mobile {
  display: none;
}

.item-card-mobile {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  margin-bottom: 10px;
}

.item-card-mobile:last-child {
  margin-bottom: 0;
}

.item-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px dashed #cbd5e1;
  padding-bottom: 10px;
}

.item-name-mobile {
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
}

.item-remark-mobile {
  font-size: 11px;
  color: #9ca3af;
  font-weight: 400;
  margin-left: 4px;
}

.item-price-mobile {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.item-card-body {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.item-mode-mobile {
  font-size: 13px;
  color: #475569;
  background: #f1f5f9;
  padding: 4px 8px;
  border-radius: 6px;
}

.item-qty-mobile {
  display: flex;
  align-items: center;
  gap: 6px;
}

.qty-label {
  font-size: 13px;
  color: #64748b;
}

.qty-val {
  width: 60px;
  text-align: center;
  font-size: 13px;
  padding: 4px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  color: #334155;
}

.items-total-mobile {
  background: #f0fdf4;
  border-color: #bbf7d0;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 14px;
}

.items-total-mobile .item-name-mobile {
  color: #166534;
}

.items-total-mobile .total-price-display {
  color: #15803d;
  font-size: 16px;
}

.media-block + .media-block {
  margin-top: 18px;
}

.preview-grid {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.preview-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 4px;
  background: #fff;
}

.preview-media-trigger {
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  cursor: zoom-in;
}

.preview-card img {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: fill;
  border-radius: 6px;
}

.video-link {
  display: inline-block;
  margin-top: 8px;
  border: none;
  background: transparent;
  color: #166534;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.video-link:hover {
  text-decoration: underline;
}

.submit-row {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  display: flex;
  justify-content: center;
  padding: 8px 16px;
  background: #ffffff;
  border-top: 1px solid #e5e7eb;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.08);
}

.submit-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  max-width: 900px;
}

.submit-info-block {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
}

.price-summary {
  display: grid;
  grid-template-columns: repeat(4, max-content);
  justify-content: space-between;
  align-items: center;
  gap: 6px 14px;
  padding-bottom: 8px;
  border-bottom: 1px solid #dbeafe;
  overflow-x: auto;
}

.summary-row,
.summary-total {
  display: flex;
  align-items: baseline;
  flex-wrap: nowrap;
  gap: 6px;
  font-size: 15px;
  white-space: nowrap;
}

.summary-row span {
  color: #6b7280;
  font-weight: 500;
}

.summary-row em {
  font-style: normal;
  color: #111827;
  font-size: 16px;
  font-weight: 700;
}

.summary-total {
  color: #dc2626;
  font-weight: 700;
  justify-self: end;
}

.summary-total strong {
  font-size: 22px;
}

.agreement-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border: 1px solid #dbeafe;
  border-radius: 12px;
  background: #f8fbff;
}

.agreement-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
}

.agreement-checks-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.agreement-checks {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agreement-title {
  color: #1e3a8a;
  font-size: 14px;
  font-weight: 700;
}

.agreement-check {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  color: #334155;
  font-size: 14px;
  line-height: 1.4;
}

.agreement-check input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: #2563eb;
}

.agreement-link {
  border: none;
  padding: 0;
  background: transparent;
  color: #2563eb;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.rent-now-btn {
  border: none;
  border-radius: 10px;
  background: #111827;
  color: #fff;
  min-width: 112px;
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
}

.agreement-submit-btn {
  align-self: center;
  min-width: 116px;
  padding-top: 8px;
  padding-bottom: 8px;
}

.rent-now-btn.disabled,
.rent-now-btn:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}

.agreement-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.55);
  padding: 16px;
}

.agreement-modal {
  width: min(880px, 100%);
  max-height: min(86vh, 900px);
  display: flex;
  flex-direction: column;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.2);
  overflow: hidden;
}

.agreement-modal-header,
.agreement-modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px;
  border-bottom: 1px solid #e5e7eb;
}

.agreement-modal-footer {
  border-top: 1px solid #e5e7eb;
  border-bottom: none;
  justify-content: flex-end;
}

.agreement-modal-header h3 {
  margin: 0;
  color: #0f172a;
}

.agreement-modal-header p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 13px;
}

.agreement-close-btn {
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
}

.agreement-modal-body {
  overflow-y: auto;
  padding: 20px 22px;
}

.agreement-intro {
  margin: 0 0 16px;
  color: #475569;
  line-height: 1.8;
}

.agreement-section + .agreement-section {
  margin-top: 18px;
}

.agreement-section h4 {
  margin: 0 0 10px;
  color: #0f172a;
}

.agreement-section ol {
  margin: 0;
  padding-left: 20px;
  color: #475569;
  line-height: 1.9;
}

.agreement-confirm-btn {
  border: none;
  border-radius: 10px;
  background: #111827;
  color: #fff;
  padding: 12px 18px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.media-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  background: rgba(17, 24, 39, 0.82);
}

.media-preview-close {
  position: absolute;
  top: 16px;
  right: 16px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: rgba(17, 24, 39, 0.72);
  color: #fff;
  border-radius: 999px;
  padding: 8px 12px;
  cursor: pointer;
}

.media-preview-image,
.media-preview-video {
  display: block;
  max-width: min(80vw, 880px);
  max-height: min(76vh, 880px);
  border-radius: 14px;
  object-fit: contain;
  background: #111827;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.3);
}

.media-preview-name {
  max-width: min(80vw, 880px);
  color: #e5e7eb;
  font-size: 13px;
  text-align: center;
  word-break: break-all;
}

.media-preview-fade-enter-active,
.media-preview-fade-leave-active {
  transition: opacity 0.2s ease;
}

.media-preview-fade-enter-from,
.media-preview-fade-leave-to {
  opacity: 0;
}

@media (max-width: 1200px) {
  .detail-wrap {
    margin: 12px auto;
    padding: 12px;
    padding-bottom: 12px;
    max-width: 100%;
  }

  .publish-section {
    padding: 12px;
  }

  .form-grid input,
  .form-grid textarea,
  .time-range-input,
  .region-select-row,
  .hafu-input-wrap {
    width: 100%;
    max-width: none;
  }

  .region-select-row {
    grid-template-columns: 1fr;
  }

  .preview-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  
  .preview-card {
    border-radius: 6px;
    padding: 3px;
  }

  .items-table {
    display: none;
  }

  .items-table-mobile {
    display: flex;
    flex-direction: column;
  }

  .submit-row {
    position: static;
    left: auto;
    right: auto;
    bottom: auto;
    z-index: auto;
    padding: 0;
    margin-top: 16px;
    background: transparent;
    border-top: none;
    box-shadow: none;
  }

  .submit-container {
    max-width: none;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .price-summary {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    padding-bottom: 4px;
    display: flex;
  }

  .summary-row,
  .summary-total {
    justify-content: space-between;
  }

  .summary-row,
  .summary-total,
  .summary-row span,
  .summary-row em,
  .summary-total span,
  .summary-total strong {
    line-height: 1.2;
  }

  .rent-now-btn {
    width: 100%;
  }

  .agreement-box {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    padding: 5px 6px;
  }

  .agreement-content {
    gap: 4px;
  }

  .agreement-checks-wrap,
  .agreement-checks {
    gap: 3px;
  }

  .agreement-title {
    font-size: 13px;
  }

  .agreement-check {
    gap: 4px;
    font-size: 13px;
    line-height: 1.25;
  }

  .agreement-submit-btn {
    align-self: auto;
    min-width: 0;
    padding-top: 10px;
    padding-bottom: 10px;
  }

  .agreement-modal {
    max-height: 90vh;
  }

  .agreement-modal-header,
  .agreement-modal-body,
  .agreement-modal-footer {
    padding-left: 16px;
    padding-right: 16px;
  }
}
</style>
