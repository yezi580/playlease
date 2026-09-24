<template>
  <Teleport to="body">
    <Transition name="ai-fade">
      <div v-if="visible" class="ai-overlay" @click.self="handleClose">
        <section class="ai-panel">
          <header class="ai-header">
            <div>
              <h3>AI 助手</h3>
              <p>平台规则问答 · 智能选号</p>
            </div>
            <button type="button" class="ai-close-btn" @click="handleClose">关闭</button>
          </header>

          <div ref="messageListRef" class="ai-messages">
            <article v-if="!messages.length" class="ai-welcome">
              <div class="ai-welcome-title">你好，我是西游商行 AI 助手 👋</div>
              <p>可以问我平台规则（押金、结算、出租流程），也可以直接说找号需求，比如「日租 50 以内、带 AWM 子弹的号」。</p>
              <div class="ai-suggest-list">
                <button
                  v-for="prompt in suggestions"
                  :key="prompt"
                  type="button"
                  class="ai-suggest-chip"
                  :disabled="streaming"
                  @click="draft = prompt; sendMessage()"
                >
                  {{ prompt }}
                </button>
              </div>
              <p class="ai-welcome-note">回答由 AI 生成仅供参考，资金相关结论以订单页面与客服裁决为准。</p>
            </article>

            <template v-for="(message, index) in messages" :key="index">
              <article class="ai-message" :class="{ 'ai-message--self': message.role === 'user' }">
                <div class="ai-message-meta">
                  <span>{{ message.role === 'user' ? '我' : 'AI 助手' }}</span>
                </div>

                <div v-if="message.role === 'user'" class="ai-bubble">{{ message.content }}</div>

                <div v-else class="ai-bubble ai-bubble--assistant">
                  <div v-if="message.sources?.length" class="ai-sources">
                    参考：{{ message.sources.map(source => source.title).join('；') }}
                  </div>
                  <div v-if="message.content" class="ai-content">{{ message.content }}</div>
                  <div v-if="message.toolStatus" class="ai-tool-status">
                    <span class="ai-dot-loading"></span>{{ message.toolStatus }}
                  </div>

                  <div v-if="message.cards?.length" class="ai-cards">
                    <button
                      v-for="card in message.cards"
                      :key="card.listingNo"
                      type="button"
                      class="ai-card"
                      @click="$emit('view-listing', card.listingNo)"
                    >
                      <div class="ai-card-top">
                        <span class="ai-card-no">{{ card.listingNo }}</span>
                        <span class="ai-card-rent">{{ card.rent }}元/天</span>
                      </div>
                      <div class="ai-card-tags">
                        <span v-if="card.region" class="ai-card-tag">{{ card.region }}</span>
                        <span v-if="card.characterLevel" class="ai-card-tag">{{ card.characterLevel }}级</span>
                        <span v-if="card.rank" class="ai-card-tag">{{ card.rank }}</span>
                        <span v-if="card.insurance" class="ai-card-tag">{{ card.insurance }}保险</span>
                        <span v-if="card.loginTime" class="ai-card-tag">{{ card.loginTime === 'night' ? '夜号' : '昼号' }}</span>
                        <span v-if="card.awmBullets" class="ai-card-tag">AWM×{{ card.awmBullets }}</span>
                      </div>
                      <div class="ai-card-bottom">
                        <span>押金 {{ card.deposit }}元</span>
                        <span class="ai-card-link">查看详情 →</span>
                      </div>
                    </button>
                  </div>

                  <div v-if="message.error" class="ai-error">{{ message.error }}</div>
                  <div v-if="isStreamingLast(index)" class="ai-cursor">▍</div>
                </div>
              </article>
            </template>
          </div>

          <footer class="ai-footer">
            <div class="ai-composer">
              <textarea
                ref="inputRef"
                v-model="draft"
                class="ai-input"
                rows="2"
                maxlength="2000"
                placeholder="输入问题，Enter 发送"
                :disabled="streaming"
                @keydown.enter.exact.prevent="sendMessage"
              ></textarea>
            </div>
            <div class="ai-footer-actions">
              <span class="ai-footer-tip">Enter 发送 · Shift+Enter 换行</span>
              <button
                v-if="streaming"
                type="button"
                class="ai-stop-btn"
                @click="stopStreaming"
              >
                停止生成
              </button>
              <button
                type="button"
                class="ai-send-btn"
                :disabled="streaming || !canSend"
                @click="sendMessage"
              >
                {{ streaming ? '回答中...' : '发送' }}
              </button>
            </div>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { nextTick } from 'vue'
import { buildRuntimeUrl, getRequestCredentials } from '../utils/runtime.js'

export default {
  name: 'AiChatPanel',
  emits: ['close', 'view-listing'],
  props: {
    visible: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      messages: [],
      draft: '',
      streaming: false,
      streamController: null,
      suggestions: [
        '押金什么时候退？',
        '怎么发布账号出租？',
        '帮我找个日租50以内的号',
        '结算流程是什么？'
      ]
    }
  },
  computed: {
    canSend() {
      return Boolean(String(this.draft || '').trim())
    }
  },
  watch: {
    visible(value) {
      if (value) {
        nextTick(() => {
          this.scrollToListBottom()
          this.$refs.inputRef?.focus()
        })
        return
      }
      // 关面板即中断在途请求，别让用户走远了还在烧 token
      this.stopStreaming()
    }
  },
  beforeUnmount() {
    this.stopStreaming()
  },
  methods: {
    handleClose() {
      this.$emit('close')
    },

    isStreamingLast(index) {
      return this.streaming && index === this.messages.length - 1 && this.messages[index]?.role === 'assistant'
    },

    scrollToListBottom() {
      const list = this.$refs.messageListRef
      if (list) {
        list.scrollTop = list.scrollHeight
      }
    },

    requestMessages() {
      // 与后端约定一致：只送 user/assistant 文本，最多 20 条，单条最长 2000
      return this.messages
        .filter(message => message.content && message.content.trim())
        .map(message => ({ role: message.role, content: message.content.slice(0, 2000) }))
        .slice(-20)
    },

    async sendMessage() {
      const content = String(this.draft || '').trim()
      if (!content || this.streaming) return

      this.messages.push({ role: 'user', content })
      this.draft = ''
      const assistant = {
        role: 'assistant',
        content: '',
        sources: [],
        cards: [],
        toolStatus: '',
        error: ''
      }
      this.messages.push(assistant)
      this.streaming = true
      this.scrollToListBottom()
      await this.runStream(assistant)
    },

    stopStreaming() {
      if (this.streamController) {
        this.streamController.abort()
      }
    },

    async runStream(assistant) {
      const controller = new AbortController()
      this.streamController = controller

      let response
      try {
        // 不走 apiFetch：它会把响应聚合成整块 JSON，SSE 必须拿原始流自己解析
        response = await fetch(buildRuntimeUrl('/api/ai/chat'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: getRequestCredentials(),
          body: JSON.stringify({ messages: this.requestMessages() }),
          signal: controller.signal
        })
      } catch (error) {
        this.finishStream(assistant, error.name === 'AbortError' ? '' : '网络异常，请稍后再试')
        return
      }

      if (!response.ok || !response.body) {
        let message = 'AI 服务暂时不可用，请稍后再试'
        try {
          const data = await response.json()
          if (data?.message) message = data.message
        } catch {
          /* 保持默认文案 */
        }
        this.finishStream(assistant, message)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          // SSE 消息以空行分隔；一块里可能含多条事件，循环切分
          let separatorIndex
          while ((separatorIndex = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, separatorIndex)
            buffer = buffer.slice(separatorIndex + 2)
            const dataLine = block
              .split('\n')
              .find(line => line.startsWith('data:'))
            if (!dataLine) continue
            try {
              this.applyStreamEvent(assistant, JSON.parse(dataLine.slice(5).trim()))
            } catch {
              /* 单个坏块跳过，流不断 */
            }
          }
        }
      } catch (error) {
        // 中断/断流：保留已收到的内容优雅收尾
        const aborted = error.name === 'AbortError'
        this.finishStream(assistant, aborted ? '' : '回答传输中断，请重试')
        return
      }
      this.finishStream(assistant, '')
    },

    applyStreamEvent(assistant, event) {
      switch (event.type) {
        case 'sources':
          assistant.sources = event.sources || []
          break
        case 'delta':
          assistant.content += event.text || ''
          nextTick(() => this.scrollToListBottom())
          break
        case 'tool_call':
          assistant.toolStatus = event.name === 'search_listings'
            ? '正在检索在租账号…'
            : '正在查询商品详情…'
          nextTick(() => this.scrollToListBottom())
          break
        case 'tool_result':
          assistant.toolStatus = ''
          if (Array.isArray(event.result?.list) && event.result.list.length) {
            assistant.cards = event.result.list.slice(0, 5)
          }
          nextTick(() => this.scrollToListBottom())
          break
        case 'error':
          assistant.error = event.message || 'AI 服务异常，请稍后再试'
          break
        case 'done':
          break
        default:
          break
      }
    },

    finishStream(assistant, errorMessage) {
      this.streaming = false
      this.streamController = null
      assistant.toolStatus = ''
      if (errorMessage) {
        assistant.error = errorMessage
      }
      if (!assistant.content && !assistant.error && !assistant.cards?.length) {
        assistant.content = '（本次没有生成内容）'
      }
      nextTick(() => this.scrollToListBottom())
    }
  }
}
</script>

<style scoped>
/* 面板骨架与 ConversationPanel 保持同一套交互范式：右侧抽屉 + 蒙层，主题走 CSS 变量 */
.ai-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  justify-content: flex-end;
  background: rgba(17, 24, 39, 0.48);
}

.ai-panel {
  width: min(460px, 100vw);
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  box-shadow: -12px 0 32px rgba(15, 23, 42, 0.18);
}

.ai-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border-color);
}

.ai-header h3 {
  margin: 0;
  font-size: 18px;
  color: var(--text-main);
}

.ai-header p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

.ai-close-btn {
  border: 1px solid var(--border-strong);
  background: var(--bg-card);
  color: var(--text-main);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
}

.ai-close-btn:hover {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
}

.ai-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: var(--bg-subtle);
}

.ai-welcome {
  border: 1px dashed var(--border-color);
  border-radius: 14px;
  padding: 16px;
  color: var(--text-main);
  font-size: 14px;
  line-height: 1.7;
}

.ai-welcome-title {
  font-weight: 600;
  margin-bottom: 6px;
}

.ai-welcome p {
  margin: 0 0 10px;
}

.ai-welcome-note {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

.ai-suggest-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ai-suggest-chip {
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--brand-primary);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
}

.ai-suggest-chip:hover {
  border-color: var(--brand-primary);
}

.ai-message {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: 92%;
}

.ai-message--self {
  align-self: flex-end;
  align-items: flex-end;
}

.ai-message-meta {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.ai-bubble {
  white-space: pre-wrap;
  word-break: break-word;
  border-radius: 14px;
  border: 1px solid var(--border-color);
  padding: 10px 12px;
  color: var(--text-main);
  line-height: 1.6;
  font-size: 14px;
  background: var(--bg-card);
}

.ai-message--self .ai-bubble {
  background: var(--brand-primary);
  border-color: var(--brand-primary);
  color: #fff;
}

.ai-bubble--assistant {
  width: 100%;
}

.ai-sources {
  font-size: 12px;
  color: var(--text-muted);
  border-left: 3px solid var(--brand-primary);
  padding-left: 8px;
  margin-bottom: 8px;
}

.ai-tool-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-muted);
}

.ai-dot-loading {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--brand-primary);
  animation: ai-blink 1s infinite;
}

@keyframes ai-blink {
  0%, 100% { opacity: 0.2; }
  50% { opacity: 1; }
}

.ai-cursor {
  display: inline-block;
  color: var(--brand-primary);
  animation: ai-blink 1s infinite;
}

.ai-error {
  margin-top: 8px;
  font-size: 13px;
  color: var(--danger, #ef4444);
}

.ai-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
  width: 100%;
}

.ai-card {
  text-align: left;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  padding: 10px 12px;
  cursor: pointer;
  color: var(--text-main);
  font-size: 13px;
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.ai-card:hover {
  border-color: var(--brand-primary);
  transform: translateY(-1px);
}

.ai-card-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}

.ai-card-no {
  font-weight: 600;
  font-size: 13px;
}

.ai-card-rent {
  color: var(--brand-primary);
  font-weight: 700;
}

.ai-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0;
}

.ai-card-tag {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 1px 6px;
  font-size: 11px;
  color: var(--text-muted);
}

.ai-card-bottom {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-muted);
}

.ai-card-link {
  color: var(--brand-primary);
}

.ai-footer {
  padding: 14px 20px 18px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-card);
}

.ai-composer {
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  overflow: hidden;
}

.ai-input {
  width: 100%;
  box-sizing: border-box;
  resize: none;
  border: none;
  outline: none;
  padding: 10px 12px;
  font: inherit;
  color: var(--text-main);
  background: var(--bg-card);
}

.ai-footer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
}

.ai-footer-tip {
  font-size: 12px;
  color: var(--text-muted);
}

.ai-send-btn {
  border: none;
  background: #111827;
  color: #fff;
  border-radius: 10px;
  padding: 8px 18px;
  cursor: pointer;
}

.ai-send-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ai-stop-btn {
  border: 1px solid var(--border-strong);
  background: var(--bg-card);
  color: var(--text-main);
  border-radius: 10px;
  padding: 7px 14px;
  cursor: pointer;
}

.ai-fade-enter-active,
.ai-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.ai-fade-enter-from,
.ai-fade-leave-to {
  opacity: 0;
  transform: translateX(16px);
}
</style>
