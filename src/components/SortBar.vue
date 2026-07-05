<template>
  <div class="sort-wrap">
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
    }
  },
  emits: ['change-sort'],
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
      ]
    }
  },
  computed: {
    sortTriggerGlassStyle() {
      return {}
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
  border-bottom: 1px solid rgba(226, 232, 240, 0.4); /* 极浅的底边框 */
  box-shadow: none; /* 去掉多余的阴影 */
  margin-bottom: 0;
}

.sort-line {
  max-width: 1400px;
  margin: 0 auto;
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
  background: #ffffff;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
  color: var(--text-main);
  font-size: 14px;
  line-height: 1.2;
  cursor: pointer;
  transition: all 0.2s ease;
}

.sort-trigger:hover {
  border-color: rgba(15, 23, 42, 0.34);
  background: #f8fafc;
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
  border-color: rgba(15, 23, 42, 0.72);
  background: linear-gradient(180deg, #374151 0%, #111827 100%);
  color: #ffffff;
  font-weight: 600;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.14);
  transform: translateY(-1px);
}


.sort-label {
  white-space: nowrap;
}

.sort-arrows {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8; /* 默认未选中时箭头的浅灰色 */
  margin-left: -2px;
}

.sort-trigger:hover .sort-arrows {
  color: #64748b;
}

.sort-trigger.active .sort-arrows {
  color: rgba(255, 255, 255, 0.25); /* 选中状态下的默认暗色（非强高亮状态） */
}

.sort-arrow {
  transition: stroke 0.2s ease, transform 0.2s ease;
}

.sort-arrow.strong {
  stroke: var(--brand-primary); /* 如果不是 active，备用高亮 */
}

.sort-trigger.active .sort-arrow.strong {
  stroke: #ffffff; /* 选中且高亮时的箭头纯白 */
}

@media (max-width: 960px) {
  .sort-wrap {
    padding: 2px 12px 10px;
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
