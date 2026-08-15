<template>
  <div class="profile-panel-card">
    <div class="profile-order-toolbar profile-message-toolbar">
      <div class="profile-message-summary">
        <strong>未读消息</strong>
        <span>{{ totalUnreadCount }} 条</span>
      </div>
      <button
        type="button"
        class="profile-message-refresh-btn"
        :disabled="loading"
        @click="$emit('refresh')"
      >
        刷新
      </button>
    </div>

    <div v-if="loading" class="profile-empty">正在加载消息列表...</div>
    <div v-else-if="error" class="profile-empty profile-error">{{ error }}</div>
    <div v-else-if="!messageList.length" class="profile-empty">暂时还没有消息。</div>

    <div v-else class="profile-message-list">
      <article
        v-for="messageItem in messageList"
        :key="`${messageItem.item_type}-${messageItem.id}`"
        class="profile-message-item"
        :class="{ 'profile-message-item--unread': Number(messageItem.unread_count || 0) > 0 }"
        @click="$emit('open-item', messageItem)"
      >
        <div class="profile-message-item-main">
          <div class="profile-message-item-header">
            <div class="profile-message-title-wrap">
              <h4>{{ formatMessageItemTitle(messageItem.title) }}</h4>
              <span v-if="messageItem.unread_count > 0" class="profile-message-unread-badge">
                {{ formatBadgeCount(messageItem.unread_count) }}
              </span>
            </div>
            <span class="profile-message-time">{{ formatConversationTime(messageItem.created_at || messageItem.updated_at) }}</span>
          </div>

          <p class="profile-message-counterpart">
            {{ getMessageItemMeta(messageItem) }}
          </p>
          <p class="profile-message-preview">
            {{ getMessageItemPreview(messageItem) }}
          </p>
        </div>
      </article>
    </div>
  </div>
</template>

<script>
import {
  formatBadgeCount,
  formatConversationTime,
  getMessageItemMeta,
  getMessageItemPreview
} from '../../utils/profileCenter.js'

export default {
  name: 'ProfileMessagesPanel',
  emits: ['refresh', 'open-item'],
  props: {
    totalUnreadCount: {
      type: Number,
      default: 0
    },
    loading: {
      type: Boolean,
      default: false
    },
    error: {
      type: String,
      default: ''
    },
    messageList: {
      type: Array,
      default: () => []
    }
  },
  methods: {
    formatMessageItemTitle(title = '') {
      const text = String(title || '').trim()
      return text.replace(/^订单沟通\s*[-－–—]?\s*/, '') || '订单会话'
    },
    formatBadgeCount,
    formatConversationTime,
    getMessageItemMeta,
    getMessageItemPreview
  }
}
</script>

<style scoped src="./profile-panel-shared.css"></style>
<style scoped>
.profile-order-toolbar {
  display: flex;
  gap: 16px;
  margin-bottom: 18px;
}

.profile-message-toolbar {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.profile-message-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-regular);
  font-size: 14px;
}

.profile-message-summary strong {
  color: var(--text-main);
  font-size: 16px;
}

.profile-message-refresh-btn {
  border: 1px solid var(--border-strong);
  background: var(--bg-card);
  color: var(--text-regular);
  border-radius: 10px;
  padding: 8px 14px;
  cursor: pointer;
}

.profile-message-refresh-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.profile-message-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.profile-message-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: var(--bg-card);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03), 0 6px 18px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}

.profile-message-item--unread {
  border-color: var(--info-border);
  background: var(--bg-subtle);
}

.profile-message-item:hover {
  border-color: var(--info-border);
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(37, 99, 235, 0.08);
}

.profile-message-item-main {
  flex: 1;
  min-width: 0;
}

.profile-message-item-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.profile-message-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.profile-message-title-wrap h4 {
  margin: 0;
  font-size: 17px;
  color: var(--text-main);
}

.profile-message-unread-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--danger-strong);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.profile-message-time {
  flex-shrink: 0;
  color: var(--text-faint);
  font-size: 12px;
}

.profile-message-counterpart,
.profile-message-preview {
  margin: 8px 0 0;
  color: var(--text-muted);
  font-size: 14px;
}

.profile-message-preview {
  color: var(--text-regular);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 960px) {
  .profile-message-refresh-btn {
    width: auto;
    padding: 6px 16px;
    font-size: 13px;
    border-radius: 8px;
  }

  .profile-message-item,
  .profile-message-item-header {
    flex-direction: column;
    align-items: stretch;
  }

  .profile-message-title-wrap {
    justify-content: space-between;
  }

  .profile-message-preview {
    white-space: normal;
  }
}
</style>
