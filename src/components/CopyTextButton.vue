<template>
  <button
    type="button"
    class="copy-text-btn"
    :title="buttonTitle"
    :aria-label="buttonTitle"
    @click.stop="handleCopy"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="9" width="10" height="10" rx="2"></rect>
      <path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"></path>
    </svg>
  </button>
</template>

<script>
import { copyText } from '../utils/clipboard.js'

export default {
  name: 'CopyTextButton',
  props: {
    text: {
      type: [String, Number],
      default: ''
    },
    label: {
      type: String,
      default: '内容'
    }
  },
  computed: {
    normalizedText() {
      return String(this.text || '').trim()
    },
    buttonTitle() {
      return `复制${this.label}`
    }
  },
  methods: {
    async handleCopy() {
      if (!this.normalizedText) return
      await copyText(this.normalizedText, `${this.label}已复制`)
    }
  }
}
</script>

<style scoped>
.copy-text-btn {
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #94a3b8; /* 改为柔和的浅色，避免满屏绿色干扰视线 */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  vertical-align: text-bottom;
  flex-shrink: 0;
  margin-left: 4px;
}

.copy-text-btn:hover {
  background: rgba(16, 185, 129, 0.1);
  color: var(--brand-primary);
  transform: translateY(-1px) scale(1.05);
}

.copy-text-btn:active {
  transform: scale(0.95);
}

.copy-text-btn svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (max-width: 960px) {
  .copy-text-btn {
    width: 16px;
    height: 16px;
    margin-left: 2px;
  }
  .copy-text-btn svg {
    width: 12px;
    height: 12px;
  }
  .copy-text-btn:hover {
    transform: none;
  }
}
</style>
