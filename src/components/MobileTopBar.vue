<template>
  <div class="mobile-topbar">
    <div class="left-wrap">
      <div class="logo">
        <span class="logo-mark">tp</span>
        <div class="logo-text">
          <strong>Game Hub</strong>
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
export default {
  name: 'MobileTopBar',
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
