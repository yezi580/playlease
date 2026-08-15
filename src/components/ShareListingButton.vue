<template>
  <button
    type="button"
    class="share-listing-btn"
    title="分享商品"
    aria-label="分享商品"
    @click.stop="handleShare"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="18" cy="5" r="3"></circle>
      <circle cx="6" cy="12" r="3"></circle>
      <circle cx="18" cy="19" r="3"></circle>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
      <line x1="15.42" y1="6.51" x2="8.59" y2="10.49"></line>
    </svg>
    <span class="share-listing-btn__label">分享</span>
  </button>
</template>

<script>
import { copyText } from '../utils/clipboard.js'
import { buildListingShareText } from '../utils/listingShareText.js'

export default {
  name: 'ShareListingButton',
  props: {
    item: {
      type: Object,
      required: true
    }
  },
  methods: {
    async handleShare() {
      const text = buildListingShareText(this.item)
      if (!text) return
      await copyText(text, '商品信息已复制')
    }
  }
}
</script>

<style scoped>
.share-listing-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px solid var(--border-color, var(--border-color));
  border-radius: 6px;
  background: var(--bg-subtle); /* 与商品卡片背景一致（偏白色），弱化视觉干扰 */
  color: var(--text-regular);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.share-listing-btn:hover {
  background: var(--bg-card);
  border-color: rgba(16, 185, 129, 0.4);
  color: var(--brand-primary-dark, var(--success-text-dark));
  transform: translateY(-1px);
}

.share-listing-btn:active {
  transform: scale(0.95);
}

.share-listing-btn svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (max-width: 960px) {
  .share-listing-btn {
    padding: 2px 6px;
    font-size: 11px;
  }

  .share-listing-btn svg {
    width: 12px;
    height: 12px;
  }

  .share-listing-btn:hover {
    transform: none;
  }
}
</style>
