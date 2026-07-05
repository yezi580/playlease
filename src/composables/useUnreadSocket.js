import { computed, ref, unref } from 'vue'
import { io } from 'socket.io-client'
import { apiFetch } from '../utils/api.js'
import { getSocketServerUrl } from '../utils/runtime.js'

export function useUnreadSocket({ isLoggedIn }) {
  const regularConversationUnreadCount = ref(0)
  const notificationUnreadCount = ref(0)
  const regularUnreadMessageCount = ref(0)
  const supportUnreadMessageCount = ref(0)
  const unreadSummaryRequestSeq = ref(0)
  const globalMessageSocket = ref(null)

  const hasRegularUnreadMessages = computed(() => Number(regularUnreadMessageCount.value || 0) > 0)
  const hasSupportUnreadMessages = computed(() => Number(supportUnreadMessageCount.value || 0) > 0)

  function applyUnreadCounts({
    regularConversationUnreadTotal = regularConversationUnreadCount.value,
    notificationUnreadTotal = notificationUnreadCount.value,
    supportUnreadTotal = supportUnreadMessageCount.value
  } = {}) {
    regularConversationUnreadCount.value = Math.max(0, Number(regularConversationUnreadTotal || 0))
    notificationUnreadCount.value = Math.max(0, Number(notificationUnreadTotal || 0))
    supportUnreadMessageCount.value = Math.max(0, Number(supportUnreadTotal || 0))
    regularUnreadMessageCount.value = regularConversationUnreadCount.value + notificationUnreadCount.value
  }

  function applySocketUnreadSummary(payload = {}) {
    const unreadSummary = payload?.unread_summary || {}
    const nextCounts = {}

    if (unreadSummary.regular_conversation_unread_total !== undefined) {
      nextCounts.regularConversationUnreadTotal = unreadSummary.regular_conversation_unread_total
    }
    if (unreadSummary.notification_unread_total !== undefined) {
      nextCounts.notificationUnreadTotal = unreadSummary.notification_unread_total
    }
    if (unreadSummary.support_handling_unread_total !== undefined) {
      nextCounts.supportUnreadTotal = unreadSummary.support_handling_unread_total
    } else if (unreadSummary.support_unread_total !== undefined) {
      nextCounts.supportUnreadTotal = unreadSummary.support_unread_total
    }

    if (!Object.keys(nextCounts).length) return
    applyUnreadCounts(nextCounts)
  }

  function stopGlobalMessageSocket() {
    if (!globalMessageSocket.value) return
    globalMessageSocket.value.disconnect()
    globalMessageSocket.value = null
  }

  function startGlobalMessageSocket() {
    stopGlobalMessageSocket()
    if (!unref(isLoggedIn)) return

    const socket = io(getSocketServerUrl(), {
      withCredentials: true,
      transports: ['websocket', 'polling']
    })

    socket.on('message:notify', (payload = {}) => {
      applySocketUnreadSummary(payload)
    })

    socket.on('message:read', (payload = {}) => {
      applySocketUnreadSummary(payload)
    })

    socket.on('notification:notify', (payload = {}) => {
      applySocketUnreadSummary(payload)
    })

    socket.on('notification:read', (payload = {}) => {
      applySocketUnreadSummary(payload)
    })

    socket.on('connect_error', () => {
      // 红点仅依赖实时事件，连接失败时不再启用轮询兜底
    })

    globalMessageSocket.value = socket
  }

  async function fetchUnreadSummary() {
    if (!unref(isLoggedIn)) {
      applyUnreadCounts({
        regularConversationUnreadTotal: 0,
        notificationUnreadTotal: 0,
        supportUnreadTotal: 0
      })
      return
    }

    const requestSeq = unreadSummaryRequestSeq.value + 1
    unreadSummaryRequestSeq.value = requestSeq

    try {
      const [conversationSummary, notificationSummary] = await Promise.all([
        apiFetch('/api/conversations/unread-summary'),
        apiFetch('/api/notifications/unread-summary')
      ])
      if (requestSeq !== unreadSummaryRequestSeq.value) return

      applyUnreadCounts({
        regularConversationUnreadTotal: Number(conversationSummary.regular_unread_total || 0),
        notificationUnreadTotal: Number(notificationSummary.unread_total || 0),
        supportUnreadTotal: Number(
          conversationSummary.support_handling_unread_total
          ?? conversationSummary.support_unread_total
          ?? 0
        )
      })
    } catch (_error) {
      if (requestSeq !== unreadSummaryRequestSeq.value) return
      applyUnreadCounts({
        regularConversationUnreadTotal: 0,
        notificationUnreadTotal: 0,
        supportUnreadTotal: 0
      })
    }
  }

  function clearUnreadState() {
    unreadSummaryRequestSeq.value += 1
    applyUnreadCounts({
      regularConversationUnreadTotal: 0,
      notificationUnreadTotal: 0,
      supportUnreadTotal: 0
    })
  }

  function handleUnreadChange(count) {
    if (count && typeof count === 'object') {
      applyUnreadCounts({
        regularConversationUnreadTotal: count.conversationUnreadTotal,
        notificationUnreadTotal: count.notificationUnreadTotal,
        supportUnreadTotal: count.supportUnreadTotal
      })
      return
    }
    regularUnreadMessageCount.value = Math.max(0, Number(count || 0))
  }

  return {
    regularUnreadMessageCount,
    supportUnreadMessageCount,
    hasRegularUnreadMessages,
    hasSupportUnreadMessages,
    fetchUnreadSummary,
    startGlobalMessageSocket,
    stopGlobalMessageSocket,
    clearUnreadState,
    handleUnreadChange
  }
}
