<template>
  <div class="sidebar">
    <div class="logo-wrap">
      <div class="logo">
        <span class="logo-mark">tp</span>
        <div class="logo-text">
          <strong>Game Hub</strong>
        </div>
      </div>
    </div>

    <div class="quick-actions">
      <button class="action-btn" @click="$emit('invite')" aria-label="邀新赚钱">
        <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 5h8" />
          <path d="M10 2h4a1 1 0 0 1 1 1v2H9V3a1 1 0 0 1 1-1Z" />
          <path d="M8 5c-3.5 1.5-5 5-5 9a9 9 0 0 0 18 0c0-4-1.5-7.5-5-9" />
          <line x1="12" x2="12" y1="9" y2="19" />
          <path d="M14.5 11H10a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H9.5" />
        </svg>
        <span>邀新赚钱</span>
      </button>
      <button class="action-btn" @click="$emit('presale-consultation')" aria-label="售前咨询">
        <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z" />
          <path d="M21 16v2a4 4 0 0 1-4 4h-5" />
        </svg>
        <span>售前咨询</span>
      </button>
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

    <div class="bottom-actions">
      <button
        v-if="isLoggedIn && showSupportConsoleEntry"
        class="bottom-btn"
        :class="{ active: currentPage === 'support-console' }"
        @click="$emit('open-support-console')"
      >
        {{ supportConsoleLabel }}
        <span v-if="hasSupportUnreadMessages" class="nav-red-dot" aria-hidden="true"></span>
      </button>
      <button v-if="isLoggedIn" class="bottom-btn profile" @click="$emit('profile')">
        <span>个人中心</span>
        <span v-if="hasUnreadMessages" class="nav-red-dot" aria-hidden="true"></span>
      </button>
      <button v-else class="bottom-btn login" @click="$emit('login')">登录</button>
      <button class="publish" @click="$emit('publish')">
        <span class="publish-text">发布账号</span>
        <span class="publish-icon">+</span>
      </button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'SideBar',
  props: {
    currentPage: { type: String, default: 'resource' },
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

.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.action-btn:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
  border-color: var(--brand-primary);
}

.action-icon {
  width: 20px;
  height: 20px;
}

.menu {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}

.menu button {
  border: none;
  background: transparent;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  color: #cbd5e1;
  padding: 12px 16px;
  border-radius: 8px;
  transition: all 0.2s ease;
  text-align: left;
  display: flex;
  align-items: center;
}

.menu button:hover,
.menu button:focus-visible {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.06);
}

.menu button.active {
  color: #fff;
  background: var(--brand-primary);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
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
  justify-content: center;
}

.bottom-btn:hover {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
}

.publish {
  background: var(--brand-primary);
  color: white;
  border: none;
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  box-shadow: var(--shadow-sm);
  transition: all 0.2s ease;
}

.publish:hover {
  background: var(--brand-primary-dark);
  transform: translateY(-1px);
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
