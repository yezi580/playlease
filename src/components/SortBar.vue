<template>
  <div class="sort-wrap">
    <div class="sort-layout">
      <div class="sort-line">
        <button
          v-for="sort in sorts"
          :key="sort.key"
          type="button"
          class="sort-trigger"
          :class="{ active: isSortActive(sort.key) }"
          :style="sortTriggerGlassStyle"
          :title="sort.label"
          @click="$emit('change-sort', sort.key)"
        >
          <span class="sort-label">{{ getSortLabel(sort) }}</span>
          <span v-if="showSortArrows(sort.key)" class="sort-arrows">
            <svg width="12" height="14" viewBox="0 0 12 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2.5 5.5L6 2L9.5 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="sort-arrow sort-arrow-up" :class="{ strong: isUpStrong(sort) }" />
              <path d="M2.5 8.5L6 12L9.5 8.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="sort-arrow sort-arrow-down" :class="{ strong: isDownStrong(sort) }" />
            </svg>
          </span>
        </button>
      </div>

      <div class="search-container">
        <form class="listing-search" @submit.prevent="handleListingSearch">
          <input
            v-model.trim="searchInput"
            type="search"
            class="listing-search-input"
            inputmode="numeric"
            placeholder="搜编号"
            aria-label="完整编号搜索"
            @search="handleListingSearch"
          />
          <button
            type="submit"
            class="listing-search-btn"
            :disabled="listingSearchLoading"
            :title="listingSearchLoading ? '搜索中' : '搜索'"
          >
            <svg v-if="listingSearchLoading" class="icon-spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="16 16"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'SortBar',
  props: {
    currentSortKey: {
      type: String,
      default: 'default'
    },
    currentSortOrder: {
      type: String,
      default: 'desc'
    },
    smallAmountOnly: {
      type: Boolean,
      default: false
    },
    highRatioOnly: {
      type: Boolean,
      default: false
    },
    listingSearchValue: {
      type: String,
      default: ''
    },
    listingSearchLoading: {
      type: Boolean,
      default: false
    }
  },
  emits: ['change-sort', 'search-listing-no'],
  data() {
    return {
      sorts: [
        { key: 'default', label: '默认', compactLabel: '默认' },
        { key: 'smallAmount', label: '小额专区', compactLabel: '小额' },
        { key: 'highRatio', label: '特惠专区', compactLabel: '特惠' },
        { key: 'hafu', label: '哈夫币', compactLabel: '哈夫币' },
        { key: 'ratio', label: '比例', compactLabel: '比例' },
        { key: 'price', label: '租金', compactLabel: '租金' },
        { key: 'awm', label: 'AWM', compactLabel: 'AWM' },
        { key: 'helmet', label: '六头', compactLabel: '六头' },
        { key: 'armor', label: '六甲', compactLabel: '六甲' }
      ],
      searchInput: String(this.listingSearchValue || '')
    }
  },
  computed: {
    sortTriggerGlassStyle() {
      return {}
    }
  },
  watch: {
    listingSearchValue(value) {
      this.searchInput = String(value || '')
    }
  },
  methods: {
    getSortLabel(sort) {
      return sort.label
    },
    isSortActive(sortKey) {
      if (sortKey === 'default') {
        return this.currentSortKey === 'default' && !this.smallAmountOnly && !this.highRatioOnly
      }
      if (sortKey === 'smallAmount') return this.smallAmountOnly
      if (sortKey === 'highRatio') return this.highRatioOnly
      return this.currentSortKey === sortKey
    },
    showSortArrows(sortKey) {
      return sortKey !== 'default' && sortKey !== 'smallAmount' && sortKey !== 'highRatio'
    },
    isUpStrong(sort) {
      return this.currentSortKey === sort.key && this.currentSortOrder === 'asc'
    },
    isDownStrong(sort) {
      return this.currentSortKey === sort.key && this.currentSortOrder === 'desc'
    },
    handleListingSearch() {
      this.$emit('search-listing-no', this.searchInput)
    }
  }
}
</script>

<style scoped>
.sort-wrap {
  width: 100%;
  padding: 0px 20px 10px; /* 彻底去掉包裹层的顶部内边距 */
  box-sizing: border-box;
  background: transparent; /* 去掉排序栏自身的白色背景，融入全局透明吸顶 */
  border-bottom: 1px solid var(--border-color); /* 极浅的底边框 */
  box-shadow: none; /* 去掉多余的阴影 */
  margin-bottom: 0;
}

.sort-layout {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
}

.sort-line {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  overflow-x: auto;
  padding: 2px 0; /* 为 transform: translateY 预留空间避免裁剪 */
  scrollbar-width: none; /* 隐藏滚动条 (Firefox) */
  -webkit-overflow-scrolling: touch;
}

.sort-line::-webkit-scrollbar {
  display: none; /* 隐藏滚动条 (Chrome/Safari) */
}

.sort-trigger {
  flex: 0 0 auto;
  min-height: 42px;
  margin-top: 10px; /* 增加按钮自身的上间距 */
  padding: 0 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid rgba(15, 23, 42, 0.24);
  border-radius: 10px;
  background: var(--bg-card);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
  color: var(--text-main);
  font-size: 14px;
  line-height: 1.2;
  cursor: pointer;
  transition: all 0.2s ease;
}

.sort-trigger:hover {
  border-color: rgba(15, 23, 42, 0.34);
  background: var(--bg-subtle);
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.06);
  color: var(--text-main);
  transform: translateY(-1px);
}

.sort-trigger:focus-visible {
  outline: none;
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.12);
}

.sort-trigger.active {
  border-color: var(--brand-primary);
  background: rgba(16, 185, 129, 0.05);
  color: var(--brand-primary-dark);
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.1);
  transform: translateY(-1px);
}


.sort-label {
  white-space: nowrap;
}

.sort-arrows {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-faint); /* 默认未选中时箭头的浅灰色 */
  margin-left: -2px;
}

.sort-trigger:hover .sort-arrows {
  color: var(--text-muted);
}

.sort-trigger.active .sort-arrows {
  color: rgba(16, 185, 129, 0.4); /* 选中状态下的默认浅绿（非强高亮状态） */
}

.sort-arrow {
  transition: stroke 0.2s ease, transform 0.2s ease;
}

.sort-arrow.strong {
  stroke: var(--brand-primary); /* 如果不是 active，备用高亮 */
}

.sort-trigger.active .sort-arrow.strong {
  stroke: var(--brand-primary-dark); /* 选中且高亮时的箭头深绿 */
}

.search-container {
  margin-left: auto;
  margin-top: 10px;
  flex: 0 0 auto;
}

.listing-search {
  position: relative;
  display: flex;
  align-items: center;
  width: 180px;
}

.listing-search-input {
  width: 100%;
  height: 42px;
  padding: 0 36px 0 16px;
  border-radius: 21px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: var(--bg-card);
  color: var(--text-main);
  outline: none;
  font-size: 13px;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
}

.listing-search-input::placeholder {
  color: var(--text-faint);
}

.listing-search-input:focus {
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.12);
}

.listing-search-btn {
  position: absolute;
  right: 4px;
  height: 34px;
  width: 34px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  transition: all 0.2s ease;
}

.listing-search-btn svg {
  width: 16px;
  height: 16px;
}

.listing-search-btn:hover:not(:disabled) {
  color: var(--brand-primary);
  transform: scale(1.05);
}

.icon-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 960px) {
  .sort-wrap {
    padding: 2px 12px 10px;
  }

  .sort-layout {
    display: block;
  }

  .sort-line {
    gap: 8px;
  }

  .sort-trigger {
    min-height: 38px;
    padding: 0 14px;
    font-size: 14px;
    margin-top: 0;
  }

  .search-container {
    display: none;
  }
}

@media (max-width: 768px) {
  .sort-wrap {
    padding: 2px 10px 10px;
  }

  .sort-trigger {
    min-height: 36px;
    padding: 0 12px;
    font-size: 13px;
    margin-top: 0;
  }
}
</style>
