<template>
  <nav class="bottom-nav">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="nav-item"
      :class="{ active: isActive(tab.key), 'nav-item-publish': tab.isPublish }"
      @click="handleClick(tab.key)"
    >
      <span class="nav-icon-wrap" :class="{ 'publish-icon-wrap': tab.isPublish }">
        <span class="nav-icon" v-html="tab.icon"></span>
        <span v-if="showDot(tab.key)" class="nav-red-dot" aria-hidden="true"></span>
      </span>
      <span class="nav-label" :class="{ 'publish-label': tab.isPublish }">{{ tab.label }}</span>
    </button>
  </nav>
</template>

<script>
export default {
  name: 'BottomNav',
  props: {
    currentPage: {
      type: String,
      default: 'resource'
    },
    authVisible: {
      type: Boolean,
      default: false
    },
    hasRegularUnreadMessages: {
      type: Boolean,
      default: false
    },
    hasSupportUnreadMessages: {
      type: Boolean,
      default: false
    },
    isSupportUser: {
      type: Boolean,
      default: false
    }
  },
  emits: ['navigate'],
  data() {
    return {
      tabs: [
        {
          key: 'resource',
          label: '首页',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>'
        },
        {
          key: 'gun',
          label: '改枪码',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9l7-7"></path><path d="M14 9l-3 3"></path><path d="M5 18l6-6"></path><path d="M3 21l3-3"></path><path d="M12 6l6 6"></path></svg>'
        },
        {
          key: 'publish',
          label: '出租发布',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
          isPublish: true
        },
        {
          key: 'boost',
          label: '代肝',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>'
        },
        {
          key: 'profile',
          label: '我的',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>'
        }
      ]
    }
  },
  methods: {
    isActive(page) {
      if (this.authVisible) return false
      return this.currentPage === page
    },
    showDot(page) {
      if (page === 'profile') {
        return this.hasRegularUnreadMessages
      }
      return false
    },
    handleClick(page) {
      if (this.authVisible || page !== this.currentPage) {
        this.$emit('navigate', page)
      }
    }
  }
}
</script>

<style scoped>
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-around;
  background: var(--bg-card);
  border-top: 1px solid var(--border-color);
  padding: 6px 0 calc(6px + env(safe-area-inset-bottom, 0px));
  z-index: 30;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px 8px;
  border: none;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  transition: color 0.2s ease;
  min-width: 50px;
  -webkit-tap-highlight-color: transparent;
}

.nav-item:active {
  opacity: 0.7;
}

.nav-item.active {
  color: var(--text-main);
}

.nav-icon {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-icon-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.nav-red-dot {
  position: absolute;
  top: -2px;
  right: -4px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--danger-strong);
  box-shadow: 0 0 0 2px #fff;
}

.nav-icon :deep(svg) {
  width: 100%;
  height: 100%;
}

.nav-label {
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}

/* 突出的发布按钮样式 */
.nav-item-publish {
  position: relative;
  transform: translateY(-8px);
}

.publish-icon-wrap {
  width: 40px;
  height: 40px;
  background: var(--brand-primary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: 0 4px 10px rgba(16, 185, 129, 0.35);
  border: 3px solid #ffffff;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.nav-item-publish:active .publish-icon-wrap {
  transform: scale(0.95);
  background: var(--brand-primary-dark);
}

.publish-icon-wrap .nav-icon {
  width: 20px;
  height: 20px;
  color: white;
}

.publish-label {
  margin-top: 4px;
}

@media (min-width: 961px) {
  .bottom-nav {
    display: none;
  }
}
</style>
