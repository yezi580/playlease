<template>
  <Teleport to="body">
    <Transition name="conversation-fade">
      <div v-if="visible" class="conversation-overlay" @click.self="handleClose">
        <section class="conversation-panel">
          <header class="conversation-header">
            <div>
              <h3>{{ headerTitle }}</h3>
              <p>{{ headerSubtitle }}</p>
            </div>
            <button type="button" class="conversation-close-btn" @click="handleClose">
              关闭
            </button>
          </header>

          <div v-if="loading" class="conversation-state">正在加载会话...</div>
          <div v-else-if="error" class="conversation-state conversation-state--error">{{ error }}</div>

          <template v-else>
            <div ref="messageListRef" class="conversation-messages">
              <div v-if="!messages.length" class="conversation-empty">
                请输入消息或图片，按Enter发送
              </div>

              <article
                v-for="message in messages"
                :key="message.id"
                class="conversation-message"
                :class="{ 'conversation-message--self': isSelfMessage(message) }"
              >
                <div class="conversation-message-meta">
                  <span>{{ isSelfMessage(message) ? '我' : (message.sender_name || counterpartName) }}</span>
                  <span>{{ formatTime(message.created_at) }}</span>
                </div>
                <div
                  v-if="message.message_type === 'image'"
                  class="conversation-message-bubble conversation-message-bubble--image"
                >
                  <button
                    type="button"
                    class="conversation-image-link"
                    @click="openImagePreview(message.media_url, message.media_name || '聊天图片')"
                  >
                    <img
                      :src="message.media_url"
                      :alt="message.media_name || '聊天图片'"
                      class="conversation-message-image"
                    />
                  </button>
                </div>
                <div
                  v-else
                  class="conversation-message-bubble"
                  :class="{ 'conversation-message-bubble--system': message.message_type === 'system' }"
                >
                  {{ message.content }}
                </div>
              </article>
            </div>

            <footer class="conversation-footer">
              <input
                ref="imageInputRef"
                class="conversation-image-input"
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/gif"
                @change="handleImageSelect"
              />
              <div class="conversation-composer">
                <div v-if="pendingImages.length" class="conversation-pending-images">
                  <div
                    v-for="image in pendingImages"
                    :key="image.id"
                    class="conversation-pending-image-card"
                  >
                    <button
                      type="button"
                      class="conversation-pending-preview"
                      :disabled="sending"
                      @click="openImagePreview(image.previewUrl, image.name)"
                    >
                      <img :src="image.previewUrl" :alt="image.name" class="conversation-pending-image" />
                    </button>
                    <button
                      type="button"
                      class="conversation-pending-remove"
                      :disabled="sending"
                      @click="removePendingImage(image.id)"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <textarea
                  v-model="draft"
                  class="conversation-input"
                  rows="3"
                  maxlength="2000"
                  placeholder="请输入消息或图片，按Enter发送"
                  @keydown.enter.exact.prevent="sendMessage"
                  @paste="handleInputPaste"
                ></textarea>
              </div>
              <div class="conversation-footer-actions">
                <div class="conversation-footer-buttons">
                  <button
                    type="button"
                    class="conversation-image-btn"
                    :disabled="sending || !joinedConversation"
                    @click="triggerImageSelect"
                    title="新增图片"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                      <circle cx="9" cy="9" r="2"/>
                      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="conversation-send-btn"
                    :disabled="sending || !canSend"
                    @click="sendMessage"
                  >
                    {{ sending ? '发送中...' : '发送' }}
                  </button>
                </div>
              </div>
            </footer>
          </template>
        </section>
        <div
          v-if="previewImageUrl"
          class="conversation-image-viewer"
          @click.self="closeImagePreview"
        >
          <button
            type="button"
            class="conversation-image-viewer-close"
            @click="closeImagePreview"
          >
            关闭
          </button>
          <img
            :src="previewImageUrl"
            :alt="previewImageName || '图片预览'"
            class="conversation-image-viewer-image"
          />
          <div v-if="previewImageName" class="conversation-image-viewer-name">{{ previewImageName }}</div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { nextTick } from 'vue'
import { io } from 'socket.io-client'
import { apiFetch } from '../utils/api.js'
import { getSocketServerUrl } from '../utils/runtime.js'

export default {
  name: 'ConversationPanel',
  emits: ['close'],
  props: {
    visible: {
      type: Boolean,
      default: false
    },
    orderId: {
      type: [Number, String],
      required: true
    },
    userRole: {
      type: String,
      default: 'buyer'
    }
  },
  data() {
    return {
      loading: false,
      error: '',
      sending: false,
      draft: '',
      pendingImages: [],
      nextPendingImageId: 1,
      previewImageUrl: '',
      previewImageName: '',
      socket: null,
      conversation: null,
      messages: [],
      currentUserId: 0,
      joinedConversation: false,
      conversationRequestId: 0,
      pageVisible: true,
      windowFocused: true
    }
  },
  computed: {
    headerTitle() {
      return this.conversation?.title || '订单沟通'
    },
    counterpartName() {
      if (this.conversation?.counterpart_name) {
        return this.conversation.counterpart_name
      }
      if (this.userRole === 'support') {
        return '买家 / 卖家'
      }
      return this.userRole === 'seller' ? '买家' : '卖家'
    },
    headerSubtitle() {
      const orderNo = this.conversation?.order_no ? `订单号：${this.conversation.order_no}` : '订单会话'
      return `${orderNo} · 对方：${this.counterpartName}`
    },
    canSend() {
      return (Boolean(String(this.draft || '').trim()) || this.pendingImages.length > 0) && this.joinedConversation
    },
    canAutoMarkRead() {
      return this.visible && this.pageVisible && this.windowFocused
    }
  },
  watch: {
    visible: {
      immediate: true,
      async handler(val) {
        if (val) {
          await this.initializeConversation()
          return
        }
        this.teardownConversation()
      }
    },
    orderId() {
      if (!this.visible) return
      this.initializeConversation()
    },
    canAutoMarkRead(value) {
      if (!value) return
      this.tryMarkConversationRead()
    }
  },
  mounted() {
    this.syncPageActivityState()
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handlePageVisibilityChange)
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', this.handleWindowFocus)
      window.addEventListener('blur', this.handleWindowBlur)
      window.addEventListener('keydown', this.handleWindowKeydown)
    }
  },
  beforeUnmount() {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handlePageVisibilityChange)
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', this.handleWindowFocus)
      window.removeEventListener('blur', this.handleWindowBlur)
      window.removeEventListener('keydown', this.handleWindowKeydown)
    }
    this.teardownConversation()
  },
  methods: {
    syncPageActivityState() {
      if (typeof document !== 'undefined') {
        this.pageVisible = document.visibilityState === 'visible'
      } else {
        this.pageVisible = true
      }

      if (typeof window !== 'undefined' && typeof window.hasFocus === 'function') {
        this.windowFocused = window.hasFocus()
      } else {
        this.windowFocused = true
      }
    },
    isLatestConversationRequest(requestId, orderId) {
      return this.visible
        && this.conversationRequestId === requestId
        && String(this.orderId || '') === String(orderId || '')
    },
    handlePageVisibilityChange() {
      this.pageVisible = typeof document === 'undefined' || document.visibilityState === 'visible'
    },
    handleWindowFocus() {
      this.windowFocused = true
    },
    handleWindowBlur() {
      this.windowFocused = false
    },
    handleWindowKeydown(event) {
      if (event?.key === 'Escape' && this.previewImageUrl) {
        this.closeImagePreview()
      }
    },
    async initializeConversation() {
      const targetOrderId = String(this.orderId || '')
      this.teardownConversation()
      const requestId = ++this.conversationRequestId
      this.loading = true
      this.error = ''
      this.draft = ''
      this.clearPendingImages()
      this.messages = []
      this.conversation = null
      this.currentUserId = 0
      this.joinedConversation = false

      try {
        const conversation = await apiFetch(`/api/conversations/order/${targetOrderId}`, {
          method: 'POST'
        })
        if (!this.isLatestConversationRequest(requestId, targetOrderId)) return
        this.conversation = conversation

        const history = await apiFetch(`/api/conversations/${conversation.id}/messages?page=1&pageSize=100`)
        if (!this.isLatestConversationRequest(requestId, targetOrderId)) return
        this.currentUserId = Number(
          history.current_user_id
          || history.conversation?.current_user_id
          || conversation.current_user_id
          || 0
        )
        this.messages = this.normalizeMessages(history.list)

        await this.tryMarkConversationRead()
        if (!this.isLatestConversationRequest(requestId, targetOrderId)) return
        await nextTick()
        if (!this.isLatestConversationRequest(requestId, targetOrderId)) return
        this.scrollToBottom()
        this.setupSocket()
      } catch (error) {
        if (!this.isLatestConversationRequest(requestId, targetOrderId)) return
        this.error = error.message || '加载会话失败，请稍后重试'
      } finally {
        if (this.isLatestConversationRequest(requestId, targetOrderId)) {
          this.loading = false
        }
      }
    },
    setupSocket() {
      const conversationId = Number(this.conversation?.id || 0)

      if (!conversationId) {
        this.error = this.error || '缺少会话凭证，无法建立连接'
        return
      }

      const socketUrl = getSocketServerUrl()
      const socket = io(socketUrl, {
        withCredentials: true,
        transports: ['websocket', 'polling']
      })

      socket.on('connect', () => {
        socket.emit('conversation:join', { conversationId }, (response) => {
          if (!response?.success) {
            this.error = response?.message || '进入会话失败'
            this.joinedConversation = false
            return
          }
          this.joinedConversation = true
        })
      })

      socket.on('connect_error', () => {
        this.error = '实时连接失败，请刷新后重试'
        this.joinedConversation = false
      })

      socket.on('message:new', async (message) => {
        if (Number(message?.conversation_id) !== conversationId) return
        if (this.messages.some((item) => Number(item.id) === Number(message.id))) return
        const normalizedMessage = this.normalizeMessage(message)
        this.messages.push(normalizedMessage)
        await nextTick()
        this.scrollToBottom()
        this.tryMarkConversationRead(message.id)
      })

      this.socket = socket
    },
    teardownConversation() {
      this.conversationRequestId += 1
      const conversationId = Number(this.conversation?.id || 0)
      if (this.socket) {
        if (conversationId) {
          this.socket.emit('conversation:leave', { conversationId })
        }
        this.socket.disconnect()
      }
      this.socket = null
      this.joinedConversation = false
      this.draft = ''
      this.closeImagePreview()
      this.clearPendingImages()
    },
    async markConversationRead(lastReadMessageId) {
      const conversationId = Number(this.conversation?.id || 0)
      if (!conversationId) return
      try {
        await apiFetch(`/api/conversations/${conversationId}/read`, {
          method: 'PUT',
          body: JSON.stringify({
            lastReadMessageId: Number(lastReadMessageId || this.messages[this.messages.length - 1]?.id || 0)
          })
        })
      } catch (_error) {
        // 已读失败不阻断聊天主流程
      }
    },
    async tryMarkConversationRead(lastReadMessageId) {
      if (!this.canAutoMarkRead) return
      await this.markConversationRead(lastReadMessageId)
    },
    async sendMessage() {
      const content = String(this.draft || '').trim()
      const pendingImages = [...this.pendingImages]
      if ((!content && !pendingImages.length) || this.sending) {
        return
      }

      this.sending = true
      this.error = ''

      try {
        let lastMessageId = 0
        if (content) {
          const textMessage = await this.emitConversationMessage({ content, messageType: 'text' })
          this.draft = ''
          lastMessageId = Number(textMessage?.id || 0)
        }

        for (const image of pendingImages) {
          const uploadedFile = await this.uploadPendingImage(image)
          let sentMessage = null
          try {
            sentMessage = await this.emitConversationMessage({
              messageType: 'image',
              mediaUrl: uploadedFile.url,
              mediaName: uploadedFile.name || image.name,
              mediaSize: Number(uploadedFile.size || image.size || 0)
            })
          } catch (error) {
            await this.recycleTempMedia([uploadedFile.url])
            throw error
          }
          this.removePendingImage(image.id)
          lastMessageId = Number(sentMessage?.id || lastMessageId || 0)
        }

        await nextTick()
        this.scrollToBottom()
        await this.tryMarkConversationRead(lastMessageId)
      } catch (error) {
        this.error = error.message || '发送失败，请稍后重试'
      } finally {
        this.sending = false
      }
    },
    async emitConversationMessage(payload = {}) {
      const conversationId = Number(this.conversation?.id || 0)
      if (!conversationId || !this.socket || !this.joinedConversation) {
        throw new Error('会话尚未就绪，请稍后重试')
      }

      const response = await new Promise((resolve) => {
        this.socket.emit('message:send', { conversationId, ...payload }, resolve)
      })

      if (!response?.success) {
        throw new Error(response?.message || '发送失败')
      }

      const message = this.normalizeMessage(response.message)
      if (message && !this.messages.some((item) => Number(item.id) === Number(message.id))) {
        this.messages.push(message)
      }
      return message
    },
    triggerImageSelect() {
      if (this.sending || !this.joinedConversation) return
      this.$refs.imageInputRef?.click()
    },
    handleImageSelect(event) {
      const files = Array.from(event?.target?.files || [])
      event.target.value = ''
      this.addPendingImages(files)
    },
    handleInputPaste(event) {
      const clipboardItems = Array.from(event?.clipboardData?.items || [])
      const imageFiles = clipboardItems
        .filter((item) => String(item.type || '').startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file) => file instanceof File)

      if (!imageFiles.length) return
      event.preventDefault()
      this.addPendingImages(imageFiles)
    },
    addPendingImages(files = []) {
      const imageFiles = Array.isArray(files)
        ? files.filter((file) => file instanceof File)
        : []
      if (!imageFiles.length) return

      const nextImages = []
      imageFiles.forEach((file) => {
        if (file.size > 5 * 1024 * 1024) {
          this.error = '单张聊天图片不能超过 5M'
          return
        }

        nextImages.push({
          id: this.nextPendingImageId++,
          file,
          name: file.name || '聊天图片',
          size: Number(file.size || 0),
          previewUrl: URL.createObjectURL(file)
        })
      })

      if (nextImages.length) {
        this.error = ''
        this.pendingImages.push(...nextImages)
      }
    },
    async uploadPendingImage(image) {
      const formData = new FormData()
      formData.append('image', image.file)
      formData.append('conversationId', String(Number(this.conversation?.id || 0)))
      const uploadResult = await apiFetch('/api/uploads/chat-images', {
        method: 'POST',
        body: formData
      })
      const uploadedFile = uploadResult?.file || {}
      const uploadedUrl = String(uploadedFile.url || '').trim()
      if (!uploadedUrl) {
        throw new Error('图片上传失败，请稍后重试')
      }
      return {
        url: uploadedUrl,
        name: uploadedFile.name || image.name,
        size: Number(uploadedFile.size || image.size || 0)
      }
    },
    removePendingImage(imageId) {
      const targetIndex = this.pendingImages.findIndex((item) => item.id === imageId)
      if (targetIndex < 0) return
      this.revokePendingImage(this.pendingImages[targetIndex])
      this.pendingImages.splice(targetIndex, 1)
    },
    revokePendingImage(image) {
      if (image?.previewUrl) {
        URL.revokeObjectURL(image.previewUrl)
      }
    },
    clearPendingImages() {
      this.pendingImages.forEach((image) => this.revokePendingImage(image))
      this.pendingImages = []
    },
    async recycleTempMedia(mediaUrls = []) {
      const validUrls = Array.isArray(mediaUrls)
        ? mediaUrls.map((item) => String(item || '').trim()).filter(Boolean)
        : []
      if (!validUrls.length) return

      try {
        await apiFetch('/api/uploads/recycle-temp', {
          method: 'POST',
          body: JSON.stringify({ mediaUrls: validUrls })
        })
      } catch (_error) {
        // 回收失败不阻断聊天主流程
      }
    },
    openImagePreview(imageUrl, imageName = '') {
      const targetUrl = String(imageUrl || '').trim()
      if (!targetUrl) return
      this.previewImageUrl = targetUrl
      this.previewImageName = String(imageName || '').trim()
    },
    closeImagePreview() {
      this.previewImageUrl = ''
      this.previewImageName = ''
    },
    isSelfMessage(message) {
      if (typeof message?.is_self === 'boolean') {
        return message.is_self
      }
      return Number(message?.sender_user_id || 0) === Number(this.currentUserId || 0)
    },
    normalizeMessages(list) {
      return Array.isArray(list) ? list.map((item) => this.normalizeMessage(item)) : []
    },
    normalizeMessage(message) {
      if (!message || typeof message !== 'object') return message
      return {
        ...message,
        is_self: typeof message.is_self === 'boolean'
          ? message.is_self
          : Number(message.sender_user_id || 0) === Number(this.currentUserId || 0)
      }
    },
    scrollToBottom() {
      const container = this.$refs.messageListRef
      if (!container) return
      container.scrollTop = container.scrollHeight
    },
    formatTime(value) {
      if (!value) return '--:--'
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return String(value)
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hour = String(date.getHours()).padStart(2, '0')
      const minute = String(date.getMinutes()).padStart(2, '0')
      return `${month}-${day} ${hour}:${minute}`
    },
    handleClose() {
      this.$emit('close')
    }
  }
}
</script>

<style scoped>
.conversation-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  justify-content: flex-end;
  background: rgba(17, 24, 39, 0.48);
}

.conversation-panel {
  width: min(460px, 100vw);
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  box-shadow: -12px 0 32px rgba(15, 23, 42, 0.18);
}

.conversation-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid #e5e7eb;
}

.conversation-header h3 {
  margin: 0;
  font-size: 18px;
  color: #111827;
}

.conversation-header p {
  margin: 6px 0 0;
  color: #6b7280;
  font-size: 13px;
}

.conversation-close-btn {
  border: 1px solid #d1d5db;
  background: #fff;
  color: #374151;
  border-radius: 10px;
  padding: 8px 12px;
  min-width: 64px;
  white-space: nowrap;
  cursor: pointer;
}

.conversation-state,
.conversation-empty {
  padding: 24px;
  text-align: center;
  color: #6b7280;
}

.conversation-state--error {
  color: #b91c1c;
}

.conversation-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: #f8fafc;
}

.conversation-message {
  max-width: 82%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.conversation-message--self {
  margin-left: auto;
  align-items: flex-end;
}

.conversation-message-meta {
  display: flex;
  gap: 8px;
  color: #6b7280;
  font-size: 12px;
}

.conversation-message-bubble {
  white-space: pre-wrap;
  word-break: break-word;
  border-radius: 14px;
  background: #fff;
  border: 1px solid #e5e7eb;
  padding: 10px 12px;
  color: #111827;
  line-height: 1.6;
}

.conversation-message-bubble--image {
  padding: 6px;
}

.conversation-message-bubble--system {
  background: #fff7ed;
  border-color: #fdba74;
  color: #9a3412;
}

.conversation-message--self .conversation-message-bubble {
  background: #111827;
  border-color: #111827;
  color: #fff;
}

.conversation-message--self .conversation-message-bubble--image {
  background: #111827;
}

.conversation-image-link {
  border: none;
  padding: 0;
  background: transparent;
  cursor: pointer;
}

.conversation-message-image {
  display: block;
  max-width: min(260px, 62vw);
  max-height: 320px;
  border-radius: 10px;
  object-fit: cover;
}

.conversation-footer {
  padding: 16px 20px 20px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
}

.conversation-composer {
  border: 1px solid #d1d5db;
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
}

.conversation-pending-images {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 8px 0;
}

.conversation-pending-image-card {
  position: relative;
  width: 60px;
  height: 60px;
  border-radius: 8px;
  overflow: hidden;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
}

.conversation-pending-preview {
  width: 100%;
  height: 100%;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.conversation-pending-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.conversation-pending-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.78);
  color: #fff;
  cursor: pointer;
  line-height: 1;
  font-size: 12px;
  padding: 0;
}

.conversation-input {
  width: 100%;
  box-sizing: border-box;
  resize: none;
  border: none;
  border-radius: 0;
  padding: 12px;
  font: inherit;
  color: #111827;
}

.conversation-image-input {
  display: none;
}

.conversation-input:focus {
  outline: none;
  box-shadow: none;
}

.conversation-footer-actions {
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.conversation-footer-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.conversation-footer-tip {
  color: #6b7280;
  font-size: 12px;
}

.conversation-send-btn {
  border: none;
  background: #111827;
  color: #fff;
  border-radius: 10px;
  padding: 10px 18px;
  cursor: pointer;
}

.conversation-image-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #374151;
  border-radius: 10px;
  padding: 10px;
  cursor: pointer;
}

.conversation-image-btn:disabled,
.conversation-send-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.conversation-image-viewer {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  background: rgba(17, 24, 39, 0.82);
}

.conversation-image-viewer-close {
  position: absolute;
  top: 16px;
  right: 16px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: rgba(17, 24, 39, 0.72);
  color: #fff;
  border-radius: 999px;
  padding: 8px 12px;
  cursor: pointer;
}

.conversation-image-viewer-image {
  display: block;
  max-width: min(80vw, 880px);
  max-height: min(76vh, 880px);
  border-radius: 14px;
  object-fit: contain;
  background: #111827;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.3);
}

.conversation-image-viewer-name {
  max-width: min(80vw, 880px);
  color: #e5e7eb;
  font-size: 13px;
  text-align: center;
  word-break: break-all;
}

.conversation-fade-enter-active,
.conversation-fade-leave-active {
  transition: opacity 0.2s ease;
}

.conversation-fade-enter-from,
.conversation-fade-leave-to {
  opacity: 0;
}

@media (max-width: 640px) {
  .conversation-panel {
    width: 100vw;
  }

  .conversation-header,
  .conversation-footer {
    padding-left: 14px;
    padding-right: 14px;
  }

  .conversation-messages {
    padding: 14px;
  }

  .conversation-message {
    max-width: 92%;
  }

  .conversation-pending-image-card {
    width: 56px;
    height: 56px;
  }

  .conversation-image-viewer {
    padding: 16px;
  }

  .conversation-image-viewer-image {
    max-width: 92vw;
    max-height: 68vh;
  }
}
</style>
