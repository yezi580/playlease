<template>
  <div class="sidebar">
    <div class="logo-wrap">
      <div class="logo">
        <img class="logo-mark logo-mark-img" src="/web.jpg?v=20260910" alt="西游商行" />
        <div class="logo-text">
          <strong>西游商行</strong>
        </div>
      </div>
    </div>

    <nav class="menu">
      <!-- 1. 我要租号（原 资源号租赁） -->
      <button
        class="nav-item"
        :class="{ active: !showAuth && currentPage === 'resource' }"
        @click="handleNavigate('resource')"
      >
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="16.65" y1="16.65" x2="21" y2="21" />
        </svg>
        <span>我要租号</span>
      </button>

      <!-- 2. 我要出号（原 发布账号） -->
      <button
        class="nav-item"
        :class="{ active: !showAuth && currentPage === 'publish' }"
        @click="$emit('publish')"
      >
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span>我要出号</span>
      </button>

      <!-- 3. 售前咨询 -->
      <button class="nav-item" @click="$emit('presale-consultation')">
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
        <span>售前咨询</span>
      </button>

      <!-- 4. 邀新赚钱 -->
      <button
        class="nav-item"
        :class="{ active: !showAuth && inviteActive }"
        @click="$emit('invite')"
      >
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 5h8" />
          <path d="M10 2h4a1 1 0 0 1 1 1v2H9V3a1 1 0 0 1 1-1Z" />
          <path d="M8 5c-3.5 1.5-5 5-5 9a9 9 0 0 0 18 0c0-4-1.5-7.5-5-9" />
          <line x1="12" x2="12" y1="9" y2="19" />
          <path d="M14.5 11H10a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H9.5" />
        </svg>
        <span>邀新赚钱</span>
      </button>

      <!-- 5. 改枪推荐（原 改枪码） -->
      <button
        class="nav-item"
        :class="{ active: !showAuth && currentPage === 'gun' }"
        @click="handleNavigate('gun')"
      >
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 7.5h13a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2H9" />
          <path d="M3 7.5V10" />
          <path d="M14 7.5V5.5h2.5v2" />
          <path d="M9 12.5 7.5 21h4L13 12.5" />
          <path d="M10 13a1.6 1.6 0 0 0 3 0" />
        </svg>
        <span>改枪推荐</span>
      </button>

      <!-- 6. 鼠团跑刀（原 代肝） -->
      <button
        class="nav-item"
        :class="{ active: !showAuth && currentPage === 'boost' }"
        @click="handleNavigate('boost')"
      >
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01" />
          <path d="M6 12h.01M10 12h.01M14 12h.01M18 12h.01" />
          <path d="M8 16h8" />
        </svg>
        <span>鼠团跑刀</span>
      </button>
    </nav>

    <div class="bottom-actions">
      <button
        class="bottom-btn theme-toggle"
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
        v-if="isLoggedIn && showSupportConsoleEntry"
        class="bottom-btn"
        :class="{ active: currentPage === 'support-console' }"
        @click="$emit('open-support-console')"
      >
        <svg class="bottom-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z" />
          <path d="M21 16v2a4 4 0 0 1-4 4h-5" />
        </svg>
        <span>{{ supportConsoleLabel }}</span>
        <span v-if="hasSupportUnreadMessages" class="nav-red-dot" aria-hidden="true"></span>
      </button>
      <button v-if="isLoggedIn" class="bottom-btn profile" @click="$emit('profile')">
        <svg class="bottom-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span>个人中心</span>
        <span v-if="hasUnreadMessages" class="nav-red-dot" aria-hidden="true"></span>
      </button>
      <button v-else class="bottom-btn login" @click="$emit('login')">登录</button>
    </div>
  </div>
</template>

<script>
import { useTheme } from '../composables/useTheme'

export default {
  name: 'SideBar',
  setup() {
    const { theme, isDark, toggleTheme } = useTheme()
    return { theme, isDark, toggleTheme }
  },
  props: {
    currentPage: { type: String, default: 'resource' },
    inviteActive: { type: Boolean, default: false },
    showAuth: { type: Boolean, default: false },
    isLoggedIn: { type: Boolean, default: false },
    hasUnreadMessages: { type: Boolean, default: false },
    hasSupportUnreadMessages: { type: Boolean, default: false },
    showBackAction: { type: Boolean, default: false },
    backActionText: { type: String, default: '返回' },
    highlightBackAction: { type: Boolean, default: false },
    showSupportConsoleEntry: { type: Boolean, default: false },
    supportConsoleLabel: { type: String, default: '工作台' }
  },
  emits: ['login', 'publish', 'navigate', 'profile', 'back', 'open-support-console', 'invite', 'presale-consultation'],
  methods: {
    handleNavigate(page) {
      this.$emit('navigate', page)
    }
  }
}
</script>

<style scoped>
.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 240px;
  z-index: 1100;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
  border-right: 1px solid #334155;
  box-shadow: var(--shadow-sm);
  padding: 20px 16px;
  box-sizing: border-box;
  overflow-y: auto;
}

.logo-wrap {
  display: flex;
  justify-content: center;
  margin-bottom: 30px;
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

.logo-mark-img {
  background: transparent;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.25);
  object-fit: cover;
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
  flex-direction: column;
  gap: 6px;
  margin-bottom: 20px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  border: none;
  background: transparent;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  color: #cbd5e1;
  padding: 11px 14px;
  border-radius: 8px;
  transition: all 0.2s ease;
  text-align: left;
}

.nav-item:hover,
.nav-item:focus-visible {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.06);
}

.nav-item.active {
  color: #fff;
  background: var(--brand-primary);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

.nav-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.bottom-actions {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bottom-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  color: #f8fafc;
  font-weight: 500;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
}

.bottom-btn:hover {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
}

.theme-toggle {
  justify-content: center;
  padding: 10px 16px;
}

.bottom-btn.login {
  justify-content: center;
}

/* 太阳/月亮叠加放置，点击时旋转 + 缩放交叉过渡 */
.theme-icons {
  position: relative;
  width: 20px;
  height: 20px;
  display: inline-block;
}

.theme-icons svg {
  position: absolute;
  inset: 0;
  width: 20px;
  height: 20px;
  /* 带弹性缓动的进出动画；!important 保证不被主题过渡的全局规则覆盖 */
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

.bottom-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
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

.profile, .bottom-btn {
  position: relative;
}

@media (max-width: 960px) {
  .sidebar {
    display: none;
  }
}
</style>
