<template>
  <div
    class="row-card clickable-card"
    @click="handleViewDetail"
  >
    <!-- 左侧：商品封面图 -->
    <div class="cover-wrap">
      <template v-if="cardImages.length">
        <div v-for="(image, index) in cardImages" :key="`cover-${item.id || 'item'}-${index}`" class="cover-frame">
          <img
            :src="image"
            :alt="`商品图片${index + 1}`"
            class="cover-img"
            loading="lazy"
            decoding="async"
          />
        </div>
      </template>
      <div v-else class="cover-placeholder">暂无封面</div>
    </div>

    <!-- 右侧：商品详细信息区 -->
    <div class="main-area">
      <!-- 第一行：用户名 + 标签行（基础比例/租期/日消耗/上号方式/上号时间） -->
      <div class="top-line">
        <div class="owner-line">
          <div class="owner">用户{{ item.owner_name || '匿名' }}</div>
          <span class="tag tag--mobile-login-method">{{ formatText(item.login_method) }}</span>
          <span class="tag tag--mobile-login-time">{{ formatText(item.login_time_range) }}</span>
          <span v-if="isSpecialOffer" class="tag tag--special tag--mobile-special">特惠</span>
        </div>
        <div class="tag-scroll-wrap">
          <div class="tag-list">
            <span class="tag">基础比例 {{ formatValue(item.base_ratio, '万/元') }}</span>
            <span class="tag">租期 {{ formatValue(item.rent_days, '天') }}</span>
            <span class="tag">日消耗 {{ formatValue(item.daily_cost, 'M') }}</span>
            <span class="tag">上号方式 {{ formatText(item.login_method) }}</span>
            <span class="tag">上号时间 {{ formatText(item.login_time_range) }}</span>
            <span v-if="isSpecialOffer" class="tag tag--special">特惠</span>
          </div>
        </div>
      </div>

      <!-- 详情网格：PC端6列 / 移动端2×2布局 -->
      <div v-if="!isMobile" class="detail-grid pc-grid">
        <!-- 绿色信息卡：哈夫币/保险/体力/负重 -->
        <div class="info-box green">
          <p><span><ProductIcon name="coin"/>哈夫币纯币：</span>{{ formatValue(item.hafu_coin, 'M') }}</p>
          <p><span><ProductIcon name="chest"/>保险等级：</span>{{ formatInsuranceLevel(item.insurance_level) }}</p>
          <p><span><ProductIcon name="energy"/>体力等级：</span>{{ item.energy_level || '-' }}</p>
          <p><span><ProductIcon name="weight"/>负重等级：</span>{{ item.weight_level || '-' }}</p>
        </div>
        <!-- 绿色信息卡：AWM子弹/6级子弹/6级头盔/6级护甲 -->
        <div class="info-box green">
          <p><span><ProductIcon name="ammo"/>AWM子弹：</span>{{ formatCount(item.awm_bullet_qty) }}发</p>
          <p><span><ProductIcon name="ammo"/>6级子弹：</span>{{ formatCount(item.bullet_lv6_qty) }}组</p>
          <p><span><ProductIcon name="helmet"/>6级头盔：</span>{{ formatCount(item.helmet_lv6_qty) }}个</p>
          <p><span><ProductIcon name="armor"/>6级护甲：</span>{{ formatCount(item.armor_lv6_qty) }}个</p>
        </div>
        <!-- 蓝色信息卡：巴雷特子弹/绝密KD/段位/等级 -->
        <div class="info-box blue">
          <p><span><ProductIcon name="ammo"/>巴雷特子弹：</span>{{ formatCount(item.barrett_bullet_qty) }}发</p>
          <p><span><ProductIcon name="target"/>绝密KD：</span>{{ formatValue(item.secret_kd) }}</p>
          <p><span><ProductIcon name="trophy"/>段位：</span>{{ formatText(item.rank_name) }}</p>
          <p><span><ProductIcon name="level"/>等级：</span>{{ formatText(item.character_level) }}</p>
        </div>
        <!-- 紫色信息卡：潜水/洗消舱/人脸归属/地区 -->
        <div class="info-box purple">
          <p><span><ProductIcon name="dive"/>潜水等级：</span>{{ formatValue(item.dive_level, '级') }}</p>
          <p><span><ProductIcon name="character"/>洗消舱：</span>{{ formatValue(item.decontamination_chamber_level, '级') }}</p>
          <p><span><ProductIcon name="face"/>人脸归属：</span>{{ formatFace(item.face_verified) }}</p>
          <p :title="formatText(item.region)"><span><ProductIcon name="location"/>所在地区：</span>{{ formatRegionText(item.region, 7) }}</p>
        </div>
        <!-- 橙色信息卡：刀皮/干员外观/武器皮肤 -->
        <div class="info-box orange">
          <p :title="formatText(item.knife_skin)"><span><ProductIcon name="knife"/>持有刀皮：</span>{{ formatMultiSelectText(item.knife_skin, 8) }}</p>
          <p :title="formatText(item.operator_appearance)"><span><ProductIcon name="outfit"/>干员外观：</span>{{ formatMultiSelectText(item.operator_appearance, 8) }}</p>
          <p :title="formatText(item.weapon_skin)"><span><ProductIcon name="weapon"/>武器皮肤：</span>{{ formatMultiSelectText(item.weapon_skin, 8) }}</p>
          <p><span><ProductIcon name="clock"/>发布时间：</span>{{ formatTime(item.created_at) }}</p>
        </div>
        <!-- 价格区域：ID + 押金 + 租金 + 合计金额 + 发布时间 -->
        <div class="price-area">
          <div class="id-text">
            <span>ID: {{ item.listing_no || item.id }}</span>
            <CopyTextButton :text="item.listing_no || item.id" label="商品编号" />
          </div>
          <div class="price-row"><span>押金</span><strong>{{ formatMoney(item.deposit) }}元</strong></div>
          <div class="price-row"><span>租金</span><strong>{{ formatMoney(computedRentPrice) }}元</strong></div>
          <div class="total-row">
            <span></span>
            <em>{{ sumPrice }}元</em>
          </div>
        </div>
      </div>

      <!-- 移动端专属：2×2 网格布局（更宽敞舒适） -->
      <div v-else class="detail-grid mobile-grid">
        <!-- 左侧：信息卡片 -->
        <div class="info-box green">
          <p><span><ProductIcon name="coin"/>哈夫币纯币：</span>{{ formatValue(item.hafu_coin, 'M') }}</p>
          <p><span><ProductIcon name="chest"/>保险等级：</span>{{ formatInsuranceLevel(item.insurance_level) }}</p>
          <p><span><ProductIcon name="target"/>绝密KD：</span>{{ formatValue(item.secret_kd) }}</p>
          <p :title="formatMobileSkinSummary()"><span><ProductIcon name="outfit"/>刀皮红皮：</span>{{ formatMobileSkinSummary() }}</p>
          <p><span><ProductIcon name="energy"/>体力负重潜水：</span>{{ formatMobileLevelSummary() }}</p>
          <p><span><ProductIcon name="ammo"/>AWM六甲六头：</span>{{ formatMobileGearSummary() }}</p>
        </div>

        <!-- 右侧：价格卡片(保持不变) -->
        <div class="price-area">
          <div class="id-text">
            <span>ID: {{ item.listing_no || item.id }}</span>
            <CopyTextButton :text="item.listing_no || item.id" label="商品编号" />
          </div>
          <div class="price-row price-row--plain-value"><span>比例</span><strong>{{ formatValue(item.base_ratio, '万/元') }}</strong></div>
          <div class="price-row"><span>租金</span><strong>{{ formatMoney(computedRentPrice) }}元</strong></div>
          <div class="price-row"><span>押金</span><strong>{{ formatMoney(item.deposit) }}元</strong></div>
          <div class="total-row">
            <span></span>
            <em>{{ sumPrice }}元</em>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { calculateBuyerRentFromSellerRent, formatMoneyInteger, parseAmount } from '../utils/money'
import { fetchBusinessSettings, getCachedBusinessSettings } from '../utils/businessSettings.js'
import CopyTextButton from './CopyTextButton.vue'
import ProductIcon from './ProductIcon.vue'

export default {
  name: 'ProductCard',
  components: {
    CopyTextButton,
    ProductIcon
  },
  emits: ['view-detail'],
  props: {
    // 单条商品数据对象，由父组件App.vue通过v-for传入
    item: {
      type: Object,
      required: true
    }
  },
  data() {
    return {
      isMobile: window.innerWidth <= 960,
      businessSettings: getCachedBusinessSettings()
    }
  },
  async mounted() {
    window.addEventListener('resize', this.handleResize)
    this.businessSettings = await fetchBusinessSettings()
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.handleResize)
  },
  computed: {
    cardImages() {
      const rawImages = Array.isArray(this.item.images) ? this.item.images : [
        this.item.cover_image,
        this.item.secondary_image
      ]

      const uniqueImages = rawImages
        .map((image) => String(image || '').trim())
        .filter(Boolean)
        .filter((image, index, arr) => arr.indexOf(image) === index)

      return uniqueImages.slice(0, 1)
    },
    computedRentPrice() {
      const sellerRent = parseAmount(this.item.rent_price)
      return calculateBuyerRentFromSellerRent(
        sellerRent,
        this.businessSettings.platformCommission?.buyerServiceFeeRatePercent
      )
    },
    isSpecialOffer() {
      const baseRatio = Number(this.item.base_ratio)
      const minBaseRatio = Number(this.businessSettings.discoveryThresholds?.highRatioBaseRatioMin)
      if (!Number.isFinite(baseRatio) || !Number.isFinite(minBaseRatio)) return false
      return baseRatio >= minBaseRatio
    },
    sumPrice() {
      const deposit = parseAmount(this.item.deposit)
      const rent = this.computedRentPrice
      return formatMoneyInteger(deposit + rent)
    }
  },
  methods: {
    formatMoney(value) {
      return formatMoneyInteger(value)
    },
    handleViewDetail() {
      this.$emit('view-detail', this.item.listing_no || this.item.id)
    },
    formatText(value) {
      // 文本格式化：空值显示为"-"
      if (value === undefined || value === null || String(value).trim() === '') return '-'
      return value
    },
    formatCount(value) {
      if (value === undefined || value === null || String(value).trim() === '') return '0'
      return String(value)
    },
    formatValue(value, suffix = '') {
      // 带单位格式化：先做空值检查，非空则拼接后缀单位
      const text = this.formatText(value)
      if (text === '-') return text
      return suffix ? `${text} ${suffix}` : String(text)
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
    formatLevelLabel(value) {
      const text = this.formatText(value)
      if (text === '-') return text
      return String(text).includes('级') ? String(text) : `${text}级`
    },
    formatMobileLevelSummary() {
      return [
        this.formatLevelLabel(this.item.energy_level),
        this.formatLevelLabel(this.item.weight_level),
        this.formatLevelLabel(this.item.dive_level)
      ].join(' ')
    },
    formatMobileGearSummary() {
      return [
        `${this.formatCount(this.item.awm_bullet_qty)}发`,
        `${this.formatCount(this.item.armor_lv6_qty)}个`,
        `${this.formatCount(this.item.helmet_lv6_qty)}个`
      ].join(' ')
    },
    formatMobileSkinSummary() {
      const knifeText = this.formatText(this.item.knife_skin)
      const appearanceText = this.formatText(this.item.operator_appearance)
      return this.truncateChineseEquivalentText(`${knifeText} / ${appearanceText}`, 8)
    },
    formatMultiSelectText(value, maxChineseLength = 8) {
      const text = this.formatText(value)
      return this.truncateChineseEquivalentText(text, maxChineseLength)
    },
    truncateChineseEquivalentText(value, maxChineseLength = 8) {
      const text = this.formatText(value)
      if (text === '-') return text

      const normalizedText = String(text).trim()
      const chars = Array.from(normalizedText)
      if (!chars.length) return '-'

      const maxWidth = maxChineseLength * 2
      let currentWidth = 0
      let result = ''

      for (const char of chars) {
        const charWidth = /[^\u0000-\u00ff]/.test(char) ? 2 : 1
        if (currentWidth + charWidth > maxWidth) {
          return `${result}...`
        }
        result += char
        currentWidth += charWidth
      }

      return result
    },
    formatRegionText(value, maxChars = 7) {
      const text = this.formatText(value)
      if (text === '-') return text

      const chars = Array.from(String(text).trim())
      if (chars.length <= maxChars) return chars.join('')
      return `${chars.slice(0, 5).join('')}...`
    },
    formatFace(value) {
      // 人脸归属字段格式化：将数据库的0/1转为中文"本人"/"非本人"
      if (value === 1 || value === '1' || value === true) return '本人'
      if (value === 0 || value === '0' || value === false) return '非本人'
      return '-'
    },
    formatTime(value) {
      // 时间格式化：将ISO时间字符串转为可读格式
      if (!value) return '-'
      return String(value).replace('T', ' ').slice(0, 19)
    },
    handleResize() {
      this.isMobile = window.innerWidth <= 960
    }
  }
}
</script>

<style scoped>
.row-card {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 16px;
  background: #f1f5f9; /* 进一步加深为更暗的灰蓝 */
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  align-items: stretch;
  min-width: 0;
  box-shadow: var(--shadow-sm);
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  transform: translateY(0);
}

.clickable-card {
  cursor: pointer;
}

@media (hover: hover) {
  .clickable-card:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-hover);
    border-color: rgba(16, 185, 129, 0.4); /* 微微的品牌色边框发光 */
  }
  
  .clickable-card:hover .cover-img {
    transform: scale(1.05);
  }
}

.clickable-card:active {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
  transition: all 0.1s ease;
}

.cover-wrap {
  display: grid;
  grid-template-columns: 1fr;
  height: 150px;
  border-radius: 8px;
  overflow: hidden;
  background: #f8fafc;
  border: 1px solid var(--border-color);
}

.cover-frame {
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background: #eef2f7;
}

.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  transition: transform 0.4s ease;
}

.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  font-size: 13px;
}

.main-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.top-line {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.owner {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}

.owner-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.tag-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tag-scroll-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  max-width: 100%;
}

@media (max-width: 1200px) {
  .row-card {
    grid-template-columns: 140px 1fr;
  }

  .cover-wrap {
    height: 130px;
  }

  .pc-grid {
    grid-template-columns: repeat(3, 1fr);
  }

  .tag {
    font-size: 11px;
  }

  .owner {
    font-size: 13px;
  }

  .info-box {
    font-size: 12px;
    padding: 6px 8px;
  }

  .info-box p {
    font-size: 12px;
  }

  .price-area {
    padding: 6px 8px;
  }

  .price-row {
    font-size: 12px;
  }

  .price-row strong {
    font-size: 13px;
  }

  .total-row em {
    font-size: 22px;
  }
}

@media (max-width: 960px) {
  .tag-scroll-wrap {
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    mask-image: linear-gradient(to right, transparent, black 12px, black calc(100% - 12px), transparent);
    -webkit-mask-image: linear-gradient(to right, transparent, black 12px, black calc(100% - 12px), transparent);
  }

  .tag-scroll-wrap .tag-list {
    flex-wrap: nowrap;
  }
}

.tag {
  font-size: 12px;
  color: var(--brand-primary-dark);
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.25);
  padding: 2px 8px;
  border-radius: 6px;
  font-weight: 500;
}

.tag--special {
  color: #dc2626;
  background: #fef2f2;
  border-color: #dc2626;
}

.tag--mobile-special {
  display: none;
}

.tag--mobile-login-method,
.tag--mobile-login-time {
  display: none;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
  align-items: stretch;
  flex: 1;
  min-height: 0;
}

.pc-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
  align-items: stretch;
  flex: 1;
  min-height: 0;
}

.mobile-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
  align-items: stretch;
  flex: 1;
  min-height: 0;
}

@media (max-width: 960px) {
  .mobile-grid .info-box,
  .mobile-grid .price-area {
    padding: 8px 10px;
    font-size: 12px;
    line-height: 1.35;
    gap: 3px;
  }

  .mobile-grid .info-box p {
    font-size: 12px;
    line-height: 1.35;
  }

  .mobile-grid .price-row {
    font-size: 12px;
  }

  .mobile-grid .price-row strong {
    font-size: 13px;
  }

  .mobile-grid .id-text {
    font-size: 11px;
  }

  .mobile-grid .total-row em {
    font-size: 18px;
  }
}

.info-box {
  border-radius: 8px;
  background: #e2e8f0; /* 再次加深内部信息框背景色 */
  border: 1px solid #cbd5e1; /* 加深内部信息框边框色 */
  padding: 8px 10px;
  font-size: 14px;
  line-height: 1.35;
  display: flex;
  flex-direction: column;
  gap: 2px;
  justify-content: center;
  align-items: flex-start;
  text-align: left;
  transition: all 0.2s ease;
}

.info-box p {
  margin: 0;
  color: var(--text-main);
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.info-box span {
  color: #4b5563; /* 让内部说明文字也稍微加深点对比度 */
}

.blue,
.orange,
.green,
.purple {
  /* 统一为更深的浅灰蓝背景 */
  background: #e2e8f0;
  border-color: #cbd5e1;
}

.price-area {
  border-radius: 8px;
  /* 恢复极浅的红色渐变背景 */
  background: linear-gradient(135deg, #fef2f2 0%, #ffffff 100%);
  border: 1px solid #fecaca;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  justify-content: center;
  min-width: 0;
  overflow: hidden;
  position: relative;
}

.price-area::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: #dc2626; /* 调深红色，避免偏粉 */
}

.clickable-card {
  cursor: pointer;
  transition: all 0.2s ease;
  touch-action: pan-y;
}

.clickable-card:hover {
  border-color: var(--brand-primary);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.clickable-card:focus-visible {
  outline: 2px solid var(--brand-primary);
  outline-offset: 2px;
}

.id-text {
  text-align: right;
  font-size: 12px;
  line-height: 1.4;
  color: #475569;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  align-self: flex-end;
  white-space: nowrap;
}

.price-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  line-height: 1.4;
  color: #374151;
  white-space: nowrap;
}

.price-row strong {
  color: #111827;
  font-size: 14px;
}

.price-row--plain-value strong {
  color: var(--text-main);
  font-size: inherit;
  font-weight: 400;
}

.price-row span {
  flex-shrink: 0;
}

.total-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  border-top: 1px dashed var(--border-color);
  padding-top: 6px;
  margin-top: 4px;
  line-height: 1.4;
  color: #dc2626; /* 调深红色，避免偏粉 */
  font-weight: 700;
  white-space: nowrap;
}

.total-row span {
  flex-shrink: 0;
}

.total-row em {
  font-style: normal;
  font-size: 24px;
  line-height: 1;
}

.publish-time {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px dashed #fecaca;
  font-size: 11px;
  color: #dc2626;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 960px) {
  .row-card {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    padding: 8px;
    min-height: auto;
  }

  .cover-wrap {
    width: 100%;
    min-width: 0;
    height: auto;
    aspect-ratio: 16 / 9;
    flex-shrink: 0;
  }

  .main-area {
    flex: 1;
    min-width: 0;
    gap: 4px;
    display: flex;
    flex-direction: column;
  }

  .top-line {
    flex-shrink: 0;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }

  .owner {
    font-size: 12px;
    white-space: nowrap;
  }

  .owner-line {
    width: 100%;
  }

  .tag-list {
    display: none;
  }

  .tag--mobile-special {
    display: inline-flex;
    flex-shrink: 0;
  }

  .tag--mobile-login-method,
  .tag--mobile-login-time {
    display: inline-flex;
    flex-shrink: 0;
  }


  .info-box,
  .price-area {
    padding: 4px 6px;
    font-size: 10.5px;
    line-height: 1.25;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .info-box p {
    font-size: 10.5px;
    line-height: 1.25;
    margin: 0;
  }

  .price-row {
    font-size: 10.5px;
  }

  .mobile-grid .price-area {
    height: 100%;
    justify-content: flex-start;
  }

  .price-row strong {
    font-size: 11px;
  }

  .id-text {
    font-size: 9.5px;
    gap: 2px;
  }

  .total-row em {
    font-size: 15px;
  }

  .mobile-grid .price-area .total-row {
    margin-top: auto;
    padding-top: 12px;
  }

  .publish-time {
    font-size: 9.5px;
    margin-top: 2px;
    padding-top: 2px;
  }

  .mobile-grid {
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
  }
}
</style>
