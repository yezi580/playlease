<template>
  <div class="topbar">
    <div class="left-wrap">
      <div class="logo">
        <span class="logo-mark">tp</span>
        <div class="logo-text">
          <strong>Game Hub</strong>
        </div>
      </div>
    </div>

    <div class="menu">
      <button
        :class="{ active: !showAuth && currentPage === 'resource' }"
        @click="handleNavigate('resource')"
      >
        <span>资源号租赁</span>
      </button>
      <button
        :class="{ active: !showAuth && currentPage === 'gun' }"
        @click="handleNavigate('gun')"
      >
        <span>改枪码</span>
      </button>
      <button
        :class="{ active: !showAuth && currentPage === 'boost' }"
        @click="handleNavigate('boost')"
      >
        <span>代肝</span>
      </button>
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
      <button
        v-if="isLoggedIn && showSupportConsoleEntry"
        class="support-console-entry"
        :class="{ active: currentPage === 'support-console' }"
        @click="$emit('open-support-console')"
      >
        {{ supportConsoleLabel }}
        <span v-if="hasSupportUnreadMessages" class="nav-red-dot" aria-hidden="true"></span>
      </button>
      <button v-if="isLoggedIn" class="profile" @click="$emit('profile')">
        <span>个人中心</span>
        <span v-if="hasUnreadMessages" class="nav-red-dot" aria-hidden="true"></span>
      </button>
      <button v-else class="login" @click="$emit('login')">登录</button>
      <button class="publish" @click="$emit('publish')">
        <span class="publish-text">发布账号</span>
        <span class="publish-icon">+</span>
      </button>
    </div>
  </div>
</template>

<script>
import { showConfirm } from '../utils/confirm.js'

export default {
  name: 'TopBar',
  props: {
    currentPage: {
      type: String,
      default: 'resource'
    },
    showAuth: {
      type: Boolean,
      default: false
    },
    isLoggedIn: {
      type: Boolean,
      default: false
    },
    hasUnreadMessages: {
      type: Boolean,
      default: false
    },
    hasSupportUnreadMessages: {
      type: Boolean,
      default: false
    },
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
    },
    showSupportConsoleEntry: {
      type: Boolean,
      default: false
    },
    supportConsoleLabel: {
      type: String,
      default: '工作台'
    }
  },
  emits: ['login', 'publish', 'navigate', 'profile', 'back', 'open-support-console', 'search-listing-no'],
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
    handleNavigate(page) {
      this.$emit('navigate', page)
    },
    handleListingSearch() {
      this.$emit('search-listing-no', this.searchInput)
    }
  }
}
</script>

<style scoped>
.topbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  gap: 20px;
  min-height: 68px;
  padding: 10px 20px;
  box-sizing: border-box;
  background: linear-gradient(90deg, #0f172a 0%, #1e293b 100%);
  border-bottom: 1px solid #334155;
  box-shadow: var(--shadow-sm);
}

.left-wrap {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-mark {
  width: 44px;
  height: 40px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #06b6d4;
  color: #fff;
  font-size: 18px;
  font-weight: 800;
  line-height: 1;
  text-transform: lowercase;
  box-shadow: 0 4px 10px rgba(6, 182, 212, 0.35);
}

.logo-text {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  line-height: 1;
}

.logo-text strong {
  font-size: 18px;
  color: #ffffff;
  letter-spacing: 0.02em;
  font-weight: 700;
}

.menu {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
}

.menu button {
  border: none;
  background: transparent;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  color: #cbd5e1;
  padding: 8px 16px;
  border-radius: 6px;
  transition: all 0.2s ease;
  min-width: 100px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
}

.menu button:hover,
.menu button:focus-visible {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
}

.menu button.active,
.menu button.active:hover,
.menu button.active:focus-visible {
  color: #fff;
  background: var(--brand-primary);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

.right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-container {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 0;
  padding: 0 10px;
}

.listing-search {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
}

.listing-search-input {
  width: 320px;
  height: 38px;
  padding: 0 32px 0 16px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
  outline: none;
  font-size: 13px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.listing-search-input::placeholder {
  color: #94a3b8;
}

.listing-search-input:focus {
  width: 420px;
  border-color: rgba(16, 185, 129, 0.6);
  background: rgba(255, 255, 255, 0.15);
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.16);
}

.listing-search-btn {
  height: 38px;
  width: 38px; /* 改为正方形包裹图标 */
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%; /* 圆形按钮 */
  background: var(--brand-primary);
  color: #fff;
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
  flex-shrink: 0;
}

.listing-search-btn svg {
  width: 18px;
  height: 18px;
}

.icon-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  100% {
    transform: rotate(360deg);
  }
}

.listing-search-btn:hover:not(:disabled) {
  background: var(--brand-primary-dark);
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.25);
  transform: translateY(-1px);
}

.listing-search-btn:active:not(:disabled) {
  transform: translateY(0) scale(0.95);
  box-shadow: 0 1px 3px rgba(16, 185, 129, 0.25);
}

.listing-search-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 显示原生的 input type="search" 清除按钮并稍微调整样式 */
.listing-search-input::-webkit-search-cancel-button {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background-color: rgba(255, 255, 255, 0.4);
  -webkit-mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><line x1='18' y1='6' x2='6' y2='18'></line><line x1='6' y1='6' x2='18' y2='18'></line></svg>");
  mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><line x1='18' y1='6' x2='6' y2='18'></line><line x1='6' y1='6' x2='18' y2='18'></line></svg>");
  -webkit-mask-size: cover;
  mask-size: cover;
  cursor: pointer;
  margin-right: -8px;
  transition: background-color 0.2s;
}

.listing-search-input::-webkit-search-cancel-button:hover {
  background-color: rgba(255, 255, 255, 0.8);
}

@media (max-width: 960px) {
  .listing-search-input {
    width: 124px;
    height: 34px;
    padding: 0 24px 0 12px;
    font-size: 12px;
  }
  
  .listing-search-input:focus {
    width: 124px;
  }

  .listing-search-input::placeholder {
    color: transparent;
  }

  .listing-search-btn {
    height: 34px;
    width: 34px;
    padding: 0;
  }

  .listing-search-btn svg {
    width: 16px;
    height: 16px;
  }
  
  .listing-search-btn:hover:not(:disabled) {
    transform: none;
  }
}

/* 搜索框入场与离场动画 */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(10px);
}

.login,
.support-console-entry,
.profile,
.nav-back {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  color: #f8fafc;
  font-weight: 500;
  transition: all 0.2s ease;
}

.profile {
  position: relative;
}

.support-console-entry {
  position: relative;
  background: rgba(255, 255, 255, 0.05);
}

.support-console-entry.active,
.support-console-entry:hover,
.support-console-entry:focus-visible {
  color: #ffffff;
  border-color: var(--brand-primary);
  background: var(--brand-primary);
}

.nav-red-dot {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
  box-shadow: 0 0 0 2px #0f172a;
}

.nav-back {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.15);
  border-color: transparent;
  color: #ffffff;
  box-shadow: var(--shadow-sm);
}

.nav-back-icon {
  font-size: 16px;
  line-height: 1;
  font-weight: 700;
}

.nav-back-text {
  white-space: nowrap;
}

.nav-back--highlight {
  background: var(--brand-primary);
  color: white;
  border: none;
  font-weight: 600;
}

.nav-back--highlight:hover {
  background: var(--brand-primary-dark);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.login:hover,
.profile:hover {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
  background: rgba(255, 255, 255, 0.15);
}

.nav-back:hover {
  background: rgba(255, 255, 255, 0.25);
}

.publish {
  background: var(--brand-primary);
  color: white;
  border: none;
  padding: 8px 20px;
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  box-shadow: var(--shadow-sm);
  transition: all 0.2s ease;
}

.publish:hover {
  background: var(--brand-primary-dark);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.publish-icon {
  display: none;
}

@media (max-width: 1200px) {
  .topbar {
    gap: 14px;
    padding: 8px 14px;
  }

  .logo-mark {
    width: 42px;
    height: 38px;
    font-size: 16px;
  }

  .logo-text strong {
    font-size: 16px;
  }

  .logo-text small {
    font-size: 11px;
  }

  .menu {
    gap: 6px;
    padding: 4px;
  }

  .menu button {
    font-size: 14px;
    padding: 8px 12px;
    min-width: 82px;
    gap: 6px;
  }

  .publish {
    font-size: 13px;
    padding: 8px 12px;
  }

  .listing-search-input {
    width: 200px;
    height: 38px;
  }

  .listing-search-input:focus {
    width: 260px;
  }

  .listing-search-btn {
    height: 38px;
    padding: 0 12px;
  }

  .listing-search-clear {
    right: 66px;
  }

  .login,
  .support-console-entry,
  .profile,
  .logout,
  .nav-back {
    font-size: 13px;
    padding: 8px 12px;
  }
}

@media (max-width: 960px) {
  .topbar {
    gap: 8px;
    min-height: 60px;
    padding: 10px 12px;
    align-items: center;
  }

  .left-wrap {
    margin-right: auto;
  }

  .menu {
    display: none;
  }

  .right {
    gap: 8px;
    padding: 0;
    min-width: 0;
  }

  .login,
  .profile,
  .logout,
  .support-console-entry,
  .publish {
    display: none;
  }

  .nav-back {
    min-height: 40px;
    padding: 8px 12px;
    border-radius: 12px;
    font-size: 13px;
    box-shadow: none;
    transform: none;
  }

  .nav-back--highlight:hover {
    transform: none;
  }

  .nav-back:not(.nav-back--highlight) .nav-back-text {
    display: none;
  }

  .search-container {
    flex: 1 1 auto;
    justify-content: flex-end;
    padding: 0;
  }

  .listing-search {
    gap: 5px;
    min-width: 0;
    flex: 0 1 auto;
  }

  .listing-search-input {
    width: min(34vw, 124px);
    min-width: 0;
    height: 36px;
    padding: 0 24px 0 12px;
  }

  .listing-search-input:focus {
    width: min(34vw, 124px);
  }

  .listing-search-input::placeholder {
    color: transparent;
  }

  .listing-search-btn {
    height: 36px;
    width: 36px;
    padding: 0;
  }
}
</style>
