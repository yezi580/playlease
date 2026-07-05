<template>
  <Teleport to="body">
    <div class="app-toast-stack" aria-live="polite" aria-atomic="true">
      <TransitionGroup name="app-toast">
        <article
          v-for="toast in toasts"
          :key="toast.id"
          class="app-toast"
          :class="`app-toast--${toast.type}`"
        >
          <span class="app-toast-icon" aria-hidden="true">
            {{ getToastIcon(toast.type) }}
          </span>
          <div class="app-toast-content">
            <strong class="app-toast-title">{{ getToastTitle(toast.type) }}</strong>
            <p class="app-toast-message">{{ toast.message }}</p>
          </div>
          <button type="button" class="app-toast-close" aria-label="关闭提示" @click="removeToast(toast.id)">
            ×
          </button>
        </article>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script>
import { APP_TOAST_EVENT } from '../utils/toast.js'

export default {
  name: 'AppToast',
  data() {
    return {
      nextToastId: 1,
      toasts: [],
      toastTimers: {}
    }
  },
  mounted() {
    window.addEventListener(APP_TOAST_EVENT, this.handleToastEvent)
  },
  beforeUnmount() {
    window.removeEventListener(APP_TOAST_EVENT, this.handleToastEvent)
    Object.values(this.toastTimers).forEach((timer) => {
      window.clearTimeout(timer)
    })
    this.toastTimers = {}
  },
  methods: {
    handleToastEvent(event) {
      const detail = event?.detail || {}
      const message = String(detail.message || '').trim()
      if (!message) return

      const id = this.nextToastId++
      const duration = Math.max(1200, Number(detail.duration || 2400))
      const type = String(detail.type || 'success').trim() || 'success'

      this.toasts.push({
        id,
        message,
        type
      })

      this.toastTimers[id] = window.setTimeout(() => {
        this.removeToast(id)
      }, duration)
    },
    removeToast(id) {
      const safeId = Number(id || 0)
      if (!safeId) return

      if (this.toastTimers[safeId]) {
        window.clearTimeout(this.toastTimers[safeId])
        delete this.toastTimers[safeId]
      }

      this.toasts = this.toasts.filter((toast) => toast.id !== safeId)
    },
    getToastTitle(type) {
      return {
        success: '操作成功',
        error: '操作失败',
        warning: '温馨提示'
      }[type] || '提示'
    },
    getToastIcon(type) {
      return {
        success: '✓',
        error: '!',
        warning: '!'
      }[type] || 'i'
    }
  }
}
</script>

<style scoped>
.app-toast-stack {
  position: fixed;
  top: 84px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 4000;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(420px, calc(100vw - 24px));
  pointer-events: none;
}

.app-toast {
  pointer-events: auto;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  min-height: 68px;
  padding: 14px 16px;
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(15, 118, 110, 0.96) 0%, rgba(22, 163, 74, 0.96) 100%);
  color: #ffffff;
  box-shadow: 0 18px 36px rgba(15, 118, 110, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.app-toast--error {
  background: linear-gradient(135deg, rgba(185, 28, 28, 0.96) 0%, rgba(239, 68, 68, 0.96) 100%);
  box-shadow: 0 18px 36px rgba(185, 28, 28, 0.22);
}

.app-toast--warning {
  background: linear-gradient(135deg, rgba(180, 83, 9, 0.96) 0%, rgba(245, 158, 11, 0.96) 100%);
  box-shadow: 0 18px 36px rgba(180, 83, 9, 0.22);
}

.app-toast-icon {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.18);
  font-size: 18px;
  font-weight: 700;
}

.app-toast-content {
  min-width: 0;
}

.app-toast-title {
  display: block;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.2;
}

.app-toast-message {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.92);
  word-break: break-word;
  white-space: pre-wrap;
}

.app-toast-close {
  border: none;
  background: rgba(255, 255, 255, 0.12);
  color: inherit;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}

.app-toast-close:hover {
  background: rgba(255, 255, 255, 0.2);
}

.app-toast-enter-active,
.app-toast-leave-active {
  transition: all 0.24s ease;
}

.app-toast-enter-from,
.app-toast-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.96);
}

@media (max-width: 960px) {
  .app-toast-stack {
    top: 72px;
    width: min(100vw - 20px, 420px);
  }

  .app-toast {
    min-height: 64px;
    padding: 12px 14px;
    border-radius: 16px;
  }
}
</style>
