import process from 'process'
import { io } from 'socket.io-client'

function readRequiredEnv(name) {
  const value = String(process.env[name] || '').trim()
  if (!value) {
    throw new Error(`缺少环境变量 ${name}`)
  }
  return value
}

function readNumberEnv(name, fallback) {
  const raw = String(process.env[name] || '').trim()
  if (!raw) return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function percentile(values, ratio) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
  return sorted[index]
}

function buildHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options)
  const contentType = String(response.headers.get('content-type') || '')
  const body = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => '')

  if (!response.ok) {
    const message = typeof body === 'object' && body
      ? body.message || JSON.stringify(body)
      : String(body || response.statusText)
    throw new Error(`${response.status} ${message}`)
  }

  return body
}

async function resolveConversationId({ baseUrl, token, orderId, conversationId }) {
  const directId = Number(conversationId || 0)
  if (directId) return directId

  const safeOrderId = Number(orderId || 0)
  if (!safeOrderId) {
    throw new Error('缺少 CONVERSATION_ID 或 ORDER_ID')
  }

  const payload = await requestJson(`${baseUrl}/api/conversations/order/${safeOrderId}`, {
    method: 'POST',
    headers: buildHeaders(token)
  })
  return Number(payload?.id || 0)
}

function formatDuration(ms) {
  return `${ms.toFixed(1)}ms`
}

async function connectClient({ socketUrl, token, conversationId }) {
  return await new Promise((resolve, reject) => {
    const socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: false
    })

    let settled = false

    socket.on('connect', () => {
      socket.emit('conversation:join', { conversationId }, (response) => {
        if (response?.success) {
          settled = true
          resolve(socket)
          return
        }
        socket.disconnect()
        reject(new Error(response?.message || '进入会话失败'))
      })
    })

    socket.on('connect_error', (error) => {
      if (settled) return
      settled = true
      reject(new Error(error.message || 'socket 连接失败'))
    })

    setTimeout(() => {
      if (settled) return
      settled = true
      socket.disconnect()
      reject(new Error('socket 连接超时'))
    }, 5000)
  })
}

async function sendMessage(socket, conversationId, content) {
  const startedAt = performance.now()
  const response = await new Promise((resolve) => {
    socket.emit('message:send', { conversationId, content }, resolve)
  })
  return {
    response,
    durationMs: performance.now() - startedAt
  }
}

async function main() {
  const baseUrl = String(process.env.BASE_URL || 'http://localhost:3000').trim().replace(/\/$/, '')
  const socketUrl = String(process.env.SOCKET_URL || baseUrl).trim().replace(/\/$/, '')
  const tokenList = String(process.env.TOKENS || process.env.TOKEN || '').split(',').map((item) => item.trim()).filter(Boolean)
  if (!tokenList.length) {
    throw new Error('缺少 TOKEN 或 TOKENS')
  }

  const clientCount = readNumberEnv('CLIENTS', Math.min(3, tokenList.length))
  const messagesPerClient = readNumberEnv('MESSAGES_PER_CLIENT', 3)
  const messageIntervalMs = readNumberEnv('MESSAGE_INTERVAL_MS', 800)
  const messagePrefix = String(process.env.MESSAGE_PREFIX || 'load-test').trim()
  const conversationId = await resolveConversationId({
    baseUrl,
    token: tokenList[0],
    orderId: process.env.ORDER_ID,
    conversationId: process.env.CONVERSATION_ID
  })

  const clients = []
  const ackDurations = []
  const errors = []
  let success = 0
  let failed = 0

  try {
    for (let i = 0; i < clientCount; i += 1) {
      const token = tokenList[i % tokenList.length]
      const socket = await connectClient({ socketUrl, token, conversationId })
      clients.push(socket)
    }

    console.log('[chat-socket-load] 启动压测')
    console.log(JSON.stringify({
      socketUrl,
      conversationId,
      clientCount,
      tokenCount: tokenList.length,
      messagesPerClient,
      messageIntervalMs
    }, null, 2))

    for (let round = 0; round < messagesPerClient; round += 1) {
      for (let i = 0; i < clients.length; i += 1) {
        const socket = clients[i]
        const content = `${messagePrefix}-${i + 1}-${round + 1}-${Date.now()}`
        try {
          const { response, durationMs } = await sendMessage(socket, conversationId, content)
          ackDurations.push(durationMs)
          if (response?.success) {
            success += 1
          } else {
            failed += 1
            if (errors.length < 5) {
              errors.push(response?.message || '未知发送失败')
            }
          }
        } catch (error) {
          failed += 1
          if (errors.length < 5) {
            errors.push(error.message || String(error))
          }
        }
        if (messageIntervalMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, messageIntervalMs))
        }
      }
    }

    const average = ackDurations.length
      ? ackDurations.reduce((sum, value) => sum + value, 0) / ackDurations.length
      : 0

    console.log('\n[socket-send]')
    console.log(`- success: ${success}`)
    console.log(`- failed: ${failed}`)
    console.log(`- clients: ${clientCount}`)
    console.log(`- messages_per_client: ${messagesPerClient}`)
    console.log(`- avg_ack: ${formatDuration(average)}`)
    console.log(`- p95_ack: ${formatDuration(percentile(ackDurations, 0.95))}`)
    console.log(`- p99_ack: ${formatDuration(percentile(ackDurations, 0.99))}`)
    if (errors.length) {
      console.log(`- sample_errors: ${errors.join(' | ')}`)
    }
  } finally {
    clients.forEach((socket) => socket.disconnect())
  }
}

main().catch((error) => {
  console.error('[chat-socket-load] 失败:', error.message || error)
  process.exit(1)
})
