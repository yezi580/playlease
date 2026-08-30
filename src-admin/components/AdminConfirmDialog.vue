<template>
  <div v-if="open" class="confirm-overlay" @click.self="handleCancel">
    <section class="confirm-card" role="dialog" aria-modal="true" :aria-labelledby="titleId">
      <div class="confirm-head">
        <h3 :id="titleId">{{ title }}</h3>
        <p>{{ message }}</p>
      </div>
      <slot />
      <div class="confirm-actions">
        <button type="button" class="confirm-btn confirm-btn--ghost" :disabled="loading" @click="handleCancel">
          取消
        </button>
        <button
          type="button"
          class="confirm-btn"
          :class="danger ? 'confirm-btn--danger' : 'confirm-btn--primary'"
          :disabled="loading"
          @click="$emit('confirm')"
        >
          {{ loading ? '处理中...' : confirmText }}
        </button>
      </div>
    </section>
  </div>
</template>

<script>
export default {
  name: 'AdminConfirmDialog',
  props: {
    open: {
      type: Boolean,
      default: false
    },
    title: {
      type: String,
      default: '确认操作'
    },
    message: {
      type: String,
      default: ''
    },
    confirmText: {
      type: String,
      default: '确认'
    },
    loading: {
      type: Boolean,
      default: false
    },
    danger: {
      type: Boolean,
      default: false
    }
  },
  emits: ['confirm', 'cancel'],
  computed: {
    titleId() {
      return `admin-confirm-${this._.uid}`
    }
  },
  methods: {
    handleCancel() {
      if (this.loading) return
      this.$emit('cancel')
    }
  }
}
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.42);
  backdrop-filter: blur(6px);
}

.confirm-card {
  width: min(100%, 420px);
  border-radius: 18px;
  background: #fff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.16);
  padding: 22px;
}

.confirm-head h3 {
  margin: 0;
  font-size: 20px;
  color: #111827;
}

.confirm-head p {
  margin: 10px 0 0;
  color: #4b5563;
  line-height: 1.7;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.confirm-btn {
  min-height: 40px;
  padding: 0 16px;
  border-radius: 10px;
  border: 1px solid #bfdbfe;
  white-space: nowrap;
}

.confirm-btn--ghost {
  background: #fff;
  border-color: #d1d5db;
  color: #374151;
}

.confirm-btn--primary {
  background: #eff6ff;
  color: #1d4ed8;
}

.confirm-btn--danger {
  background: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
}

.confirm-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .confirm-actions {
    flex-direction: column-reverse;
  }

  .confirm-btn {
    width: 100%;
  }
}
</style>
