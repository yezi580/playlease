<template>
  <div class="filter-wrap" @click.self="closeAllDropdowns">
    <div class="filter-layout">
      <div class="filter-scroll-area">
        <div class="filter-line">
          <div
            v-for="key in allFilterKeys"
            :key="key"
            class="filter-dropdown-wrapper"
          >
            <button
              class="filter-trigger"
              :class="{ active: activeDropdown === key, selected: !!selectedValues[key] }"
              :style="filterTriggerGlassStyle"
              :aria-expanded="activeDropdown === key ? 'true' : 'false'"
              :title="selectedValues[key] ? `${getTriggerLabel(key)}：${getDisplayText(key)}` : getTriggerLabel(key)"
              @click.stop="toggleDropdown(key)"
            >
              <span class="trigger-label">{{ getTriggerLabel(key) }}</span>
              <span v-if="selectedValues[key] && !isCompactView" class="selected-text">
                {{ getDisplayText(key) }}
              </span>
              <span class="arrow">▼</span>
            </button>

            <Transition name="dropdown-fade">
              <div v-if="activeDropdown === key" class="dropdown-menu" @click.stop>
                <div v-if="filterConfigs[key].regionPicker" class="region-picker-section">
                  <select v-model="selectedRegionProvince" @change="handleRegionProvinceChange">
                    <option value="">全部省份</option>
                    <option
                      v-for="province in provinceOptions"
                      :key="province"
                      :value="province"
                    >
                      {{ province }}
                    </option>
                  </select>

                  <select
                    v-if="requiresRegionCity || !selectedRegionProvince"
                    v-model="selectedRegionCity"
                    @change="handleRegionCityChange"
                  >
                    <option value="">
                      {{ selectedRegionProvince ? '全部城市' : '请先选择省份' }}
                    </option>
                    <option
                      v-for="city in availableRegionCities"
                      :key="city"
                      :value="city"
                    >
                      {{ city }}
                    </option>
                  </select>
                  <div v-else class="region-picker-placeholder">/</div>

                  <button
                    v-if="selectedValues.region"
                    class="region-reset-btn"
                    @click="clearRegionSelection"
                  >
                    清空地区
                  </button>
                </div>

                <template v-else>
                  <div class="dropdown-options">
                    <div
                      v-for="opt in filterConfigs[key].options"
                      :key="opt.value"
                      class="dropdown-item"
                      :class="{
                        selected: selectedValues[key] === opt.value,
                        disabled: isCustomInputActive(key) && opt.value !== ''
                      }"
                      @click="selectOption(key, opt.value)"
                    >
                      {{ opt.label }}
                    </div>
                  </div>
                </template>

                <div v-if="filterConfigs[key].customRange" class="custom-range-section">
                  <div class="custom-input-row">
                    <input
                      v-model.number="customInputs[key].min"
                      type="number"
                      placeholder="最小值"
                      :min="filterConfigs[key].customRange.min"
                      :max="filterConfigs[key].customRange.max"
                      @focus="onCustomFocus(key)"
                      @input="onCustomInput(key)"
                    />

                    <span class="range-separator">-</span>

                    <input
                      v-model.number="customInputs[key].max"
                      type="number"
                      placeholder="最大值"
                      :min="filterConfigs[key].customRange.min"
                      :max="filterConfigs[key].customRange.max"
                      @focus="onCustomFocus(key)"
                      @input="onCustomInput(key)"
                    />

                    <button
                      v-if="customInputs[key].min !== '' || customInputs[key].max !== ''"
                      class="confirm-custom-btn"
                      @click="confirmCustomRange(key)"
                    >
                      应用
                    </button>
                  </div>
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </div>

      <div class="filter-actions">
        <button class="reset-btn" @click="resetFilter">重置</button>
        <button class="apply-btn" @click="emitChange">筛选</button>
      </div>
    </div>
  </div>
</template>

<script>
import {
  REGION_OPTIONS,
  getCitiesByProvince,
  buildRegionText,
  isProvinceWithoutCityRequired
} from '../constants/regionData'

export default {
  name: 'FilterBar',
  props: {
    modelValue: {
      type: Object,
      default: () => ({})
    }
  },
  emits: ['update:modelValue', 'search'],
  data() {
    return {
      activeDropdown: null,
      selectedValues: {},
      customInputs: {},
      selectedRegionProvince: '',
      selectedRegionCity: '',
      viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1440
    }
  },
  created() {
    const initial = this.modelValue || {}

    this.selectedValues = {
      insuranceLevel: initial.insuranceLevel || '',
      energyLevel: initial.energyLevel || '',
      weightLevel: initial.weightLevel || '',
      hafuCoin: initial.hafuCoin || '',
      rentPrice: initial.rentPrice || '',
      deposit: initial.deposit || '',
      totalAmount: initial.totalAmount || '',
      rank: initial.rank || '',
      loginMethod: initial.loginMethod || '',
      region: initial.region || buildRegionText(initial.regionProvince, initial.regionCity)
    }

    this.selectedRegionProvince = initial.regionProvince || ''
    this.selectedRegionCity = initial.regionCity || ''

    this.customInputs = {
      hafuCoin: { min: '', max: '' },
      rentPrice: { min: '', max: '' },
      deposit: { min: '', max: '' },
      totalAmount: { min: '', max: '' }
    }
  },
  computed: {
    allFilterKeys() {
      return [
        'insuranceLevel',
        'energyLevel',
        'weightLevel',
        'rentPrice',
        'hafuCoin',
        'deposit',
        'totalAmount',
        'rank',
        'loginMethod',
        'region'
      ]
    },
    isCompactView() {
      return this.viewportWidth <= 1200
    },
    isUltraCompactView() {
      return this.viewportWidth <= 768
    },
    filterTriggerGlassStyle() {
      return {}
    },
    filterConfigs() {
      return {
        insuranceLevel: {
          label: '保险',
          compactLabel: '保险',
          options: [
            { value: '', label: '全部' },
            { value: '2格', label: '2格' },
            { value: '4格', label: '4格' },
            { value: '6格', label: '6格' },
            { value: '9格', label: '9格' }
          ]
        },
        energyLevel: {
          label: '体力',
          compactLabel: '体力',
          options: [
            { value: '', label: '全部' },
            { value: '4级', label: '4级' },
            { value: '5级', label: '5级' },
            { value: '6级', label: '6级' },
            { value: '7级', label: '7级' }
          ]
        },
        weightLevel: {
          label: '负重',
          compactLabel: '负重',
          options: [
            { value: '', label: '全部' },
            { value: '4级', label: '4级' },
            { value: '5级', label: '5级' },
            { value: '6级', label: '6级' },
            { value: '7级', label: '7级' }
          ]
        },
        hafuCoin: {
          label: '哈夫币',
          compactLabel: '哈夫币',
          options: [
            { value: '', label: '全部（M）' },
            { value: '0-100', label: '0-100' },
            { value: '100-200', label: '100-200' },
            { value: '200-500', label: '200-500' }
          ],
          customRange: { min: 0, max: Infinity }
        },
        rentPrice: {
          label: '租金',
          compactLabel: '租金',
          options: [
            { value: '', label: '全部区间' },
            { value: '0-500', label: '0-500' },
            { value: '500-1000', label: '500-1000' },
            { value: '1000-2000', label: '1000-2000' },
            { value: '2000-5000', label: '2000-5000' }
          ],
          customRange: { min: 0, max: Infinity }
        },
        deposit: {
          label: '押金',
          compactLabel: '押金',
          options: [
            { value: '', label: '全部区间' },
            { value: '0-500', label: '0-500' },
            { value: '500-1000', label: '500-1000' },
            { value: '1000-2000', label: '1000-2000' }
          ],
          customRange: { min: 0, max: Infinity }
        },
        totalAmount: {
          label: '合计金额',
          compactLabel: '合计',
          options: [
            { value: '', label: '全部区间' },
            { value: '0-500', label: '0-500' },
            { value: '500-1000', label: '500-1000' },
            { value: '1000-2000', label: '1000-2000' },
            { value: '2000-5000', label: '2000-5000' }
          ]
        },
        rank: {
          label: '段位',
          compactLabel: '段位',
          options: [
            { value: '', label: '全部' },
            { value: '青铜', label: '青铜' },
            { value: '白银', label: '白银' },
            { value: '黄金', label: '黄金' },
            { value: '铂金', label: '铂金' },
            { value: '钻石', label: '钻石' },
            { value: '黑鹰', label: '黑鹰' },
            { value: '巅峰', label: '巅峰' }
          ]
        },
        loginMethod: {
          label: '登录方式',
          compactLabel: '登录方式',
          options: [
            { value: '', label: '全部' },
            { value: 'QQ账密', label: 'QQ账密' },
            { value: '微信扫码', label: '微信扫码' },
            { value: 'steam国服', label: 'steam国服' },
            { value: 'steam国际服', label: 'steam国际服' }
          ]
        },
        region: {
          label: '地区',
          compactLabel: '地区',
          options: [],
          regionPicker: true
        }
      }
    },
    provinceOptions() {
      return REGION_OPTIONS.map((item) => item.province)
    },
    availableRegionCities() {
      return getCitiesByProvince(this.selectedRegionProvince)
    },
    requiresRegionCity() {
      return !isProvinceWithoutCityRequired(this.selectedRegionProvince)
    }
  },
  watch: {
    modelValue: {
      handler(value) {
        if (!value) return
        this.selectedValues = {
          insuranceLevel: value.insuranceLevel || '',
          energyLevel: value.energyLevel || '',
          weightLevel: value.weightLevel || '',
          hafuCoin: value.hafuCoin || '',
          rentPrice: value.rentPrice || '',
          deposit: value.deposit || '',
          totalAmount: value.totalAmount || '',
          rank: value.rank || '',
          loginMethod: value.loginMethod || '',
          region: value.region || buildRegionText(value.regionProvince, value.regionCity)
        }
        this.selectedRegionProvince = value.regionProvince || ''
        this.selectedRegionCity = value.regionCity || ''
      },
      deep: true
    }
  },
  mounted() {
    document.addEventListener('click', this.closeAllDropdowns)
    window.addEventListener('resize', this.handleResize)
  },
  beforeUnmount() {
    document.removeEventListener('click', this.closeAllDropdowns)
    window.removeEventListener('resize', this.handleResize)
  },
  methods: {
    handleResize() {
      this.viewportWidth = window.innerWidth
    },
    getTriggerLabel(key) {
      const config = this.filterConfigs[key]
      if (!config) return key
      if (this.isCompactView && config.compactLabel) {
        return config.compactLabel
      }
      return config.label
    },
    toggleDropdown(key) {
      this.activeDropdown = this.activeDropdown === key ? null : key
    },
    closeAllDropdowns() {
      this.activeDropdown = null
    },
    selectOption(key, value) {
      if (this.isCustomInputActive(key) && value !== '') return

      this.selectedValues[key] = value
      if (this.filterConfigs[key]?.customRange) {
        this.customInputs[key] = { min: '', max: '' }
      }
      this.activeDropdown = null
    },
    handleRegionProvinceChange() {
      if (!this.selectedRegionProvince) {
        this.selectedRegionCity = ''
        this.selectedValues.region = ''
        return
      }
      this.selectedRegionCity = ''
      this.selectedValues.region = this.requiresRegionCity
        ? this.selectedRegionProvince
        : buildRegionText(this.selectedRegionProvince, '')
    },
    handleRegionCityChange() {
      this.selectedValues.region = buildRegionText(
        this.selectedRegionProvince,
        this.selectedRegionCity
      )
    },
    clearRegionSelection() {
      this.selectedRegionProvince = ''
      this.selectedRegionCity = ''
      this.selectedValues.region = ''
    },
    isCustomInputActive(key) {
      const val = this.selectedValues[key]
      if (!val) return false
      return val.startsWith('custom:')
    },
    onCustomFocus() {},
    onCustomInput() {},
    confirmCustomRange(key) {
      const { min, max } = this.customInputs[key]
      const config = this.filterConfigs[key]?.customRange

      let minVal = Number(min)
      let maxVal = Number(max)

      if (config && config.max === 60) {
        minVal = Math.max(0, Math.min(60, isNaN(minVal) ? 0 : minVal))
        maxVal = Math.max(0, Math.min(60, isNaN(maxVal) ? 60 : maxVal))
      } else {
        minVal = isNaN(minVal) ? 0 : Math.max(0, minVal)
        maxVal = isNaN(maxVal) ? 0 : Math.max(0, maxVal)
      }

      if (minVal > maxVal) {
        ;[minVal, maxVal] = [maxVal, minVal]
      }

      this.selectedValues[key] = `custom:${minVal}-${maxVal}`
      this.activeDropdown = null
    },
    getDisplayText(key) {
      const val = this.selectedValues[key]
      if (!val) return ''

      if (val.startsWith('custom:')) {
        return val.replace('custom:', '')
      }

      const config = this.filterConfigs[key]
      if (!config) return val
      const found = config.options.find((o) => o.value === val)
      return found ? found.label : val
    },
    emitChange() {
      const payload = {
        ...this.selectedValues,
        regionProvince: this.selectedRegionProvince,
        regionCity: this.selectedRegionCity
      }

      this.$emit('update:modelValue', payload)
      this.$emit('search', payload)
      this.activeDropdown = null
    },
    resetFilter() {
      this.selectedValues = {
        insuranceLevel: '',
        energyLevel: '',
        weightLevel: '',
        hafuCoin: '',
        rentPrice: '',
        deposit: '',
        totalAmount: '',
        rank: '',
        loginMethod: '',
        region: ''
      }
      this.selectedRegionProvince = ''
      this.selectedRegionCity = ''
      this.customInputs = {
        hafuCoin: { min: '', max: '' },
        rentPrice: { min: '', max: '' },
        deposit: { min: '', max: '' },
        totalAmount: { min: '', max: '' }
      }
      this.emitChange()
    }
  }
}
</script>

<style scoped>
.filter-wrap {
  width: 100%;
  padding: 16px 20px 2px; /* 极限缩减底部间距 */
  box-sizing: border-box;
  background: transparent; /* 改为透明，让外层 App.vue 的毛玻璃生效 */
  border-bottom: none; /* Removed border */
  box-shadow: none; /* Removed shadow */
  margin-bottom: 0; 
  position: relative; /* Make it a containing block for absolute mobile dropdowns */
}

.filter-layout {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-scroll-area {
  flex: 1;
  min-width: 0;
}

.filter-line {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  align-items: center;
  gap: 8px;
  overflow: visible;
}

.filter-dropdown-wrapper {
  position: relative;
  min-width: 0;
}


.filter-trigger,
.region-picker-section select,
.custom-input-row input,
.confirm-custom-btn,
.apply-btn,
.reset-btn,
.region-reset-btn {
  min-height: 42px;
  border-radius: 10px;
  font-size: 14px;
  line-height: 1.2;
  transition: border-color 0.2s ease, background-color 0.2s ease, color 0.2s ease;
}

.filter-trigger {
  width: 100%;
  min-width: 0;
  max-width: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid rgba(15, 23, 42, 0.24);
  background: #ffffff;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
  color: var(--text-main);
  cursor: pointer;
}

.filter-trigger:hover {
  border-color: rgba(15, 23, 42, 0.34);
  background: #f8fafc;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.06);
  transform: translateY(-1px);
}

.filter-trigger:focus-visible,
.region-picker-section select:focus-visible,
.custom-input-row input:focus-visible {
  outline: none;
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.12);
}

.filter-trigger.active,
.filter-trigger.selected {
  border-color: rgba(15, 23, 42, 0.72);
  background: linear-gradient(180deg, #374151 0%, #111827 100%);
  color: #ffffff;
  font-weight: 600;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.14);
  transform: translateY(-1px);
}

.filter-trigger.active .arrow,
.filter-trigger.selected .arrow,
.filter-trigger.active .selected-text,
.filter-trigger.selected .selected-text {
  color: #ffffff;
}

.trigger-label {
  min-width: 0;
  flex-shrink: 0;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.selected-text {
  min-width: 0;
  flex: 1 1 auto;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
}

.arrow {
  margin-left: auto;
  color: var(--text-main);
  font-size: 11px;
  transition: transform 0.2s ease;
}

.filter-trigger.active .arrow {
  transform: rotate(180deg);
}

.filter-actions {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  padding-left: 8px;
  flex: 0 0 auto;
  white-space: nowrap;
}

.reset-btn,
.region-reset-btn {
  padding: 0 16px;
  border: 1px solid var(--text-main);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-main);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}

.reset-btn:hover,
.region-reset-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.apply-btn,
.confirm-custom-btn {
  padding: 0 18px;
  background: var(--brand-primary);
  color: #ffffff;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  font-weight: 600;
}

.confirm-custom-btn {
  border: 1px solid var(--text-main);
}

.apply-btn {
  border: none;
}

.apply-btn:hover,
.confirm-custom-btn:hover {
  background: var(--brand-primary-dark);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 50;
  min-width: 220px;
  max-width: 280px;
  padding: 10px;
  border: 1px solid #d8dde3;
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
}

.dropdown-options,
.region-picker-section,
.custom-range-section {
  display: grid;
  gap: 8px;
}

.dropdown-item {
  display: flex;
  align-items: center;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #ffffff;
  color: #334155;
  font-size: 13px;
  cursor: pointer;
}

.dropdown-item:hover {
  border-color: #94a3b8;
  background: #f8fafc;
}

.dropdown-item.selected {
  border-color: var(--brand-primary);
  background: rgba(16, 185, 129, 0.05);
  color: var(--brand-primary-dark);
  font-weight: 600;
}

.dropdown-item.disabled {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}

.region-picker-section select,
.region-picker-placeholder,
.custom-input-row input {
  width: 100%;
  padding: 0 10px;
  border: 1px solid #d8dde3;
  background: #ffffff;
  color: #334155;
}

.region-picker-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  border-radius: 8px;
  background: #f8fafc;
}

.region-picker-section select:disabled,
.custom-input-row input:disabled {
  opacity: 0.55;
  background: #f8fafc;
  cursor: not-allowed;
}

.custom-input-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr auto;
  gap: 8px;
  align-items: center;
}

.range-separator {
  color: #64748b;
  font-weight: 600;
}

.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 960px) {
  .filter-wrap {
    padding: 12px 12px 0;
  }

  .filter-layout {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .filter-scroll-area {
    overflow-x: auto;
    scrollbar-width: none; /* 隐藏滚动条 (Firefox) */
    -webkit-overflow-scrolling: touch;
  }
  
  .filter-scroll-area::-webkit-scrollbar {
    display: none; /* 隐藏滚动条 (Chrome/Safari) */
  }

  .filter-line {
    display: flex;
    align-items: center;
    overflow-x: visible;
    gap: 6px;
    padding: 2px 0 6px;
  }

  .filter-dropdown-wrapper {
    flex: 0 0 auto;
    position: static; /* Let dropdown escape on mobile */
  }

  .dropdown-menu {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    width: 100%;
    max-width: none;
    border-radius: 0 0 10px 10px;
    border-top: none;
    margin-top: 0;
  }

  .filter-trigger {
    min-height: 38px;
    padding: 0 14px;
  }

  .filter-actions {
    flex: 0 0 auto;
    gap: 6px;
    padding-left: 0;
    margin-left: 0;
    padding-bottom: 6px; /* 对齐 filter-line 的 padding */
  }

  .filter-trigger,
  .apply-btn,
  .reset-btn {
    min-height: 38px;
    font-size: 14px;
    box-shadow: none;
    transform: none;
  }

  .apply-btn:hover,
  .confirm-custom-btn:hover {
    transform: none;
  }

  .selected-text {
    display: none;
  }
}

@media (max-width: 768px) {
  .filter-wrap {
    padding: 12px 10px 0;
  }

  .filter-trigger,
  .apply-btn,
  .reset-btn {
    min-height: 36px;
    font-size: 13px;
    box-shadow: none;
    transform: none;
  }

  .filter-trigger {
    padding: 0 12px;
  }

  .selected-text {
    display: none;
  }

  .filter-line {
    gap: 8px;
  }
  
  .filter-actions {
    gap: 6px;
  }
}
</style>
