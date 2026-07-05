import process from 'process'

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
    Accept: 'application/json'
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

async function runTarget({ name, url, headers, concurrency, requests }) {
  const startedAt = Date.now()
  const durations = []
  let success = 0
  let failed = 0
  let pointer = 0
  const errors = []

  async function worker() {
    while (true) {
      const current = pointer
      pointer += 1
      if (current >= requests) return

      const requestStartedAt = performance.now()
      try {
        await requestJson(url, { headers })
        success += 1
        durations.push(performance.now() - requestStartedAt)
      } catch (error) {
        failed += 1
        durations.push(performance.now() - requestStartedAt)
        if (errors.length < 5) {
          errors.push(error.message || String(error))
        }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  const totalMs = Date.now() - startedAt
  const average = durations.length
    ? durations.reduce((sum, value) => sum + value, 0) / durations.length
    : 0

  return {
    name,
    url,
    requests,
    concurrency,
    success,
    failed,
    totalMs,
    average,
    p95: percentile(durations, 0.95),
    p99: percentile(durations, 0.99),
    errors
  }
}

async function main() {
  const baseUrl = String(process.env.BASE_URL || 'http://localhost:3000').trim().replace(/\/$/, '')
  const token = readRequiredEnv('TOKEN')
  const concurrency = readNumberEnv('CONCURRENCY', 10)
  const requests = readNumberEnv('REQUESTS', 100)
  const pageSize = readNumberEnv('PAGE_SIZE', 20)
  const targets = String(process.env.TARGETS || 'list,unread,messages')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  const conversationId = await resolveConversationId({
    baseUrl,
    token,
    orderId: process.env.ORDER_ID,
    conversationId: process.env.CONVERSATION_ID
  })

  const headers = buildHeaders(token)
  const plan = {
    list: `${baseUrl}/api/conversations?page=1&pageSize=${pageSize}`,
    unread: `${baseUrl}/api/conversations/unread-summary`,
    messages: `${baseUrl}/api/conversations/${conversationId}/messages?page=1&pageSize=${pageSize}`
  }

  const selectedTargets = targets.map((target) => {
    if (!plan[target]) {
      throw new Error(`不支持的 TARGETS 项：${target}`)
    }
    return {
      name: target,
      url: plan[target],
      headers,
      concurrency,
      requests
    }
  })

  console.log('[chat-http-load] 启动压测')
  console.log(JSON.stringify({
    baseUrl,
    conversationId,
    concurrency,
    requests,
    targets
  }, null, 2))

  for (const target of selectedTargets) {
    const result = await runTarget(target)
    console.log(`\n[${result.name}] ${result.url}`)
    console.log(`- success: ${result.success}`)
    console.log(`- failed: ${result.failed}`)
    console.log(`- total: ${result.requests}`)
    console.log(`- concurrency: ${result.concurrency}`)
    console.log(`- total_time: ${result.totalMs}ms`)
    console.log(`- avg: ${formatDuration(result.average)}`)
    console.log(`- p95: ${formatDuration(result.p95)}`)
    console.log(`- p99: ${formatDuration(result.p99)}`)
    if (result.errors.length) {
      console.log(`- sample_errors: ${result.errors.join(' | ')}`)
    }
  }
}

main().catch((error) => {
  console.error('[chat-http-load] 失败:', error.message || error)
  process.exit(1)
})
