<template>
  <div class="mobile-topbar">
    <div class="left-wrap">
      <div class="logo">
        <img class="logo-mark logo-mark-img" src="/web.jpg" alt="天蓬商行" />
        <div class="logo-text">
          <strong>天蓬商行</strong>
        </div>
      </div>
    </div>

    <div class="search-container">
      <transition name="fade-slide">
        <form
          v-if="showListingSearch"
          class="listing-search"
          @submit.prevent="handleListingSearch"
        >
          <input
            v-model.trim="searchInput"
            type="search"
            class="listing-search-input"
            inputmode="numeric"
            placeholder="请输入完整商品编号"
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
      </transition>
    </div>

    <div class="right">
      <button
        class="theme-toggle"
        :class="{ 'is-dark': isDark }"
        :title="isDark ? '切换到白天模式' : '切换到夜间模式'"
        :aria-label="isDark ? '切换到白天模式' : '切换到夜间模式'"
        @click="toggleTheme"
      >
        <span class="theme-icons" aria-hidden="true">
          <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
          <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </span>
      </button>
      <button
        v-if="showBackAction"
        class="nav-back"
        :class="{ 'nav-back--highlight': highlightBackAction }"
        :title="backActionText"
        :aria-label="backActionText"
        @click="$emit('back')"
      >
        <span class="nav-back-icon">←</span>
        <span class="nav-back-text">{{ backActionText }}</span>
      </button>
    </div>
  </div>
</template>

<script>
import { useTheme } from '../composables/useTheme'

export default {
  name: 'MobileTopBar',
  setup() {
    const { theme, isDark, toggleTheme } = useTheme()
    return { theme, isDark, toggleTheme }
  },
  props: {
    showBackAction: {
      type: Boolean,
      default: false
    },
    backActionText: {
      type: String,
      default: '返回'
    },
    highlightBackAction: {
      type: Boolean,
      default: false
    },
    showListingSearch: {
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
  emits: ['back', 'search-listing-no'],
  data() {
    return {
      searchInput: String(this.listingSearchValue || '')
    }
  },
  watch: {
    listingSearchValue(value) {
      this.searchInput = String(value || '')
    }
  },
  methods: {
    handleListingSearch() {
      this.$emit('search-listing-no', this.searchInput)
    }
  }
}
</script>

<style scoped>
.mobile-topbar {
  display: none;
}

@media (max-width: 960px) {
  .mobile-topbar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1100;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 60px;
    padding: 10px 12px;
    box-sizing: border-box;
    background: linear-gradient(90deg, #0f172a 0%, #1e293b 100%);
    border-bottom: 1px solid #334155;
    box-shadow: var(--shadow-sm);
  }

  .left-wrap {
    margin-right: auto;
    display: flex;
    align-items: center;
  }

  .search-container {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    justify-content: flex-end;
    padding: 0;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .logo-mark {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #06b6d4;
    color: #fff;
    font-size: 16px;
    font-weight: 800;
    line-height: 1;
    text-transform: lowercase;
    box-shadow: 0 4px 10px rgba(6, 182, 212, 0.35);
  }

  .logo-mark-img {
    background: transparent;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.25);
    object-fit: cover;
  }

  .logo-text {
    display: flex;
    align-items: center;
    min-height: 36px;
    line-height: 1;
  }

  .logo-text strong {
    font-size: 16px;
    color: #ffffff;
    letter-spacing: 0.02em;
    font-weight: 700;
  }

  .right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .theme-toggle {
    height: 36px;
    width: 36px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    color: #f8fafc;
    cursor: pointer;
    transition: background-color 0.2s ease, color 0.2s ease;
    flex-shrink: 0;
  }

  .theme-toggle:hover {
    background: rgba(255, 255, 255, 0.15);
    color: #ffffff;
  }

  .theme-toggle svg {
    width: 18px;
    height: 18px;
  }

  /* 太阳/月亮叠加放置，点击时旋转 + 缩放交叉过渡 */
  .theme-icons {
    position: relative;
    width: 18px;
    height: 18px;
    display: inline-block;
  }

  .theme-icons svg {
    position: absolute;
    inset: 0;
    width: 18px;
    height: 18px;
    transition: transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.7s ease !important;
  }

  .icon-moon {
    transform: rotate(-120deg) scale(0.3);
    opacity: 0;
  }

  .is-dark .icon-sun {
    transform: rotate(120deg) scale(0.3);
    opacity: 0;
  }

  .is-dark .icon-moon {
    transform: rotate(0deg) scale(1);
    opacity: 1;
  }

  .listing-search {
    position: relative;
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    flex: 0 1 auto;
  }

  .listing-search-input {
    width: min(34vw, 124px);
    min-width: 0;
    height: 36px;
    padding: 0 24px 0 12px;
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.08);
    color: #f8fafc;
    outline: none;
    font-size: 12px;
    transition: all 0.3s ease;
  }

  .listing-search-input::placeholder {
    color: transparent;
  }

  .listing-search-input:focus {
    width: min(34vw, 124px);
    border-color: rgba(16, 185, 129, 0.6);
    background: rgba(255, 255, 255, 0.15);
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.16);
  }

  .listing-search-btn {
    height: 36px;
    width: 36px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: var(--brand-primary);
    color: #fff;
    cursor: pointer;
    transition: background-color 0.2s ease, opacity 0.2s ease;
    flex-shrink: 0;
  }

  .listing-search-btn svg {
    width: 16px;
    height: 16px;
  }

  .listing-search-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .icon-spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    100% {
      transform: rotate(360deg);
    }
  }

  .fade-slide-enter-active,
  .fade-slide-leave-active {
    transition: opacity 0.3s ease, transform 0.3s ease;
  }

  .fade-slide-enter-from,
  .fade-slide-leave-to {
    opacity: 0;
    transform: translateX(10px);
  }

  .nav-back {
    min-height: 40px;
    padding: 8px 12px;
    border-radius: 12px;
    border: 1px solid transparent;
    background: rgba(255, 255, 255, 0.15);
    color: #ffffff;
    cursor: pointer;
    font-size: 13px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .nav-back-icon {
    font-size: 16px;
    line-height: 1;
    font-weight: 700;
  }

  .nav-back--highlight {
    background: var(--brand-primary);
    border: none;
    font-weight: 600;
  }

  .nav-back:not(.nav-back--highlight) .nav-back-text {
    display: none;
  }
}
</style>
