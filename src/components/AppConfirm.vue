<template>
  <Teleport to="body">
    <Transition name="app-confirm-fade">
      <div v-if="activeConfirm" class="app-confirm-overlay" @click.self="handleCancel">
        <section class="app-confirm-card">
          <h3>{{ activeConfirm.title }}</h3>
          <p v-if="activeConfirm.message">{{ activeConfirm.message }}</p>
          <div v-if="activeConfirm.isPrompt" class="app-confirm-input-wrap">
            <textarea
              v-model="activeConfirm.inputValue"
              :placeholder="activeConfirm.inputPlaceholder"
              class="app-confirm-input"
              rows="3"
            ></textarea>
          </div>
          <div class="app-confirm-actions">
            <button type="button" class="app-confirm-btn app-confirm-btn--ghost" @click="handleCancel">
              {{ activeConfirm.cancelText }}
            </button>
            <button
              type="button"
              class="app-confirm-btn"
              :class="`app-confirm-btn--${activeConfirm.tone}`"
              @click="handleConfirm"
            >
              {{ activeConfirm.confirmText }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { APP_CONFIRM_EVENT, resolveConfirm } from '../utils/confirm.js'

export default {
  name: 'AppConfirm',
  data() {
    return {
      queue: [],
      activeConfirm: null
    }
  },
  mounted() {
    window.addEventListener(APP_CONFIRM_EVENT, this.handleConfirmEvent)
    window.addEventListener('keydown', this.handleKeydown)
  },
  beforeUnmount() {
    window.removeEventListener(APP_CONFIRM_EVENT, this.handleConfirmEvent)
    window.removeEventListener('keydown', this.handleKeydown)

    if (this.activeConfirm?.id) {
      resolveConfirm(this.activeConfirm.id, false)
    }
    this.queue.forEach((item) => resolveConfirm(item.id, false))
    this.queue = []
    this.activeConfirm = null
  },
  methods: {
    handleConfirmEvent(event) {
      const detail = event?.detail || {}
      if (!detail.id) return

      this.queue.push({
        id: Number(detail.id),
        isPrompt: Boolean(detail.isPrompt),
        title: String(detail.title || '请确认'),
        message: String(detail.message || ''),
        inputValue: String(detail.inputValue || ''),
        inputPlaceholder: String(detail.inputPlaceholder || ''),
        confirmText: String(detail.confirmText || '确认'),
        cancelText: String(detail.cancelText || '取消'),
        tone: String(detail.tone || 'primary')
      })

      if (!this.activeConfirm) {
        this.showNextConfirm()
      }
    },
    handleKeydown(event) {
      if (event.key === 'Escape' && this.activeConfirm) {
        this.handleCancel()
      }
    },
    showNextConfirm() {
      this.activeConfirm = this.queue.shift() || null
    },
    finishConfirm(result) {
      if (!this.activeConfirm?.id) return

      const currentId = this.activeConfirm.id
      this.activeConfirm = null
      resolveConfirm(currentId, result)
      this.showNextConfirm()
    },
    handleConfirm() {
      if (!this.activeConfirm) return
      const result = this.activeConfirm.isPrompt ? this.activeConfirm.inputValue : true
      this.finishConfirm(result)
    },
    handleCancel() {
      if (!this.activeConfirm) return
      const result = this.activeConfirm.isPrompt ? null : false
      this.finishConfirm(result)
    }
  }
}
</script>

<style scoped>
.app-confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 3500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.46);
}

.app-confirm-card {
  width: min(420px, 100%);
  padding: 24px 22px 20px;
  border-radius: 24px;
  background: var(--bg-card);
  box-shadow: 0 24px 50px rgba(15, 23, 42, 0.18);
}

.app-confirm-card h3 {
  margin: 0;
  font-size: 20px;
  color: var(--text-main);
}

.app-confirm-card p {
  margin: 10px 0 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-regular);
  white-space: pre-wrap;
}

.app-confirm-input-wrap {
  margin-top: 16px;
}

.app-confirm-input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  font-size: 14px;
  color: var(--text-strong);
  background: var(--bg-subtle);
  resize: vertical;
  box-sizing: border-box;
  font-family: inherit;
  transition: border-color 0.2s;
}

.app-confirm-input:focus {
  outline: none;
  border-color: var(--info-strong);
  background: var(--bg-card);
}

.app-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.app-confirm-btn {
  border: none;
  border-radius: 12px;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.app-confirm-btn--ghost {
  background: var(--bg-subtle);
  color: var(--text-regular);
}

.app-confirm-btn--primary {
  background: linear-gradient(135deg, #166534 0%, #15803d 100%);
  color: #ffffff;
}

.app-confirm-btn--danger {
  background: linear-gradient(135deg, var(--danger) 0%, var(--danger-strong) 100%);
  color: #ffffff;
}

.app-confirm-fade-enter-active,
.app-confirm-fade-leave-active {
  transition: opacity 0.2s ease;
}

.app-confirm-fade-enter-from,
.app-confirm-fade-leave-to {
  opacity: 0;
}
</style>
