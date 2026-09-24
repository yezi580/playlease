/**
 * AI 助手代理路由：把前端的 /api/ai/chat 转发到内网 ai-service（Python FastAPI，见仓库 ai-service/ 目录）。
 *
 * 为什么不让浏览器直连 ai-service：
 * 1. 复用主站统一安全体系（CORS allowlist、限流、登录态解析）
 * 2. ai-service 不暴露公网，大模型密钥永远留在内网
 *
 * 流式转发要点：ai-service 返回 SSE（text/event-stream），这里拿到 fetch 的
 * ReadableStream 后逐块 res.write()——绝不能 await response.text()，
 * 那会把流攒成一整块，前端就失去"逐字打出"的体验了。
 */

// 与 security.middleware.js / db.js 同款的本地 env 读取辅助（本仓库既定模式）
function readPositiveIntEnv(name, fallback) {
  const rawValue = String(process.env[name] || '').trim()
  if (!rawValue) return fallback
  const parsedValue = Number(rawValue)
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return fallback
  }
  return Math.round(parsedValue)
}

const AI_SERVICE_URL = String(process.env.AI_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '')
const AI_SERVICE_TOKEN = String(process.env.AI_SERVICE_TOKEN || '').trim()
const AI_SERVICE_TIMEOUT_MS = readPositiveIntEnv('AI_SERVICE_TIMEOUT_MS', 120000)

// 输入上限与 ai-service 侧保持一致，两层都校验（别信任任何一层能兜住另一层）
const MAX_MESSAGES = 20
const MAX_CONTENT_CHARS = 2000

/**
 * 白名单式清洗前端传入的对话历史：只放行 user/assistant + 纯文本，长度超限直接拒绝。
 */
function sanitizeAiMessages(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null
  const messages = []
  for (const item of raw) {
    const role = item?.role
    const content = typeof item?.content === 'string' ? item.content.trim() : ''
    if ((role !== 'user' && role !== 'assistant') || !content || content.length > MAX_CONTENT_CHARS) {
      return null
    }
    messages.push({ role, content })
  }
  return messages
}

export function registerAiRoutes(deps) {
  const { app, aiChatLimiter, getOptionalAuth } = deps

  // 把"可选登录态"提前解析进 req.auth，让 aiChatLimiter 的 keyGenerator 能按
  // userId 计数（而不是所有登录用户都被按 IP 合并计数）。
  // getOptionalAuth 本身是 handler 内调用的函数（见 auth.service.js），这里包一层中间件；
  // 解析失败按游客处理，绝不因此拒请求。
  const attachOptionalAuth = async (req, _res, next) => {
    try {
      req.auth = (await getOptionalAuth(req)) || null
    } catch {
      req.auth = null
    }
    next()
  }

  app.post('/api/ai/chat', attachOptionalAuth, aiChatLimiter, async (req, res) => {
    const messages = sanitizeAiMessages(req.body?.messages)
    if (!messages) {
      return res.status(400).json({ message: '消息格式不正确' })
    }

    let upstream
    try {
      upstream = await fetch(`${AI_SERVICE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(AI_SERVICE_TOKEN ? { 'X-Internal-Token': AI_SERVICE_TOKEN } : {})
        },
        body: JSON.stringify({ messages }),
        // SSE 长流：这里的超时兜的是"服务挂起不响应"（建连 + 首字节），
        // 正常流式期间模型逐字吐 token 不会触发
        signal: AbortSignal.timeout(AI_SERVICE_TIMEOUT_MS)
      })
    } catch (error) {
      console.warn(`[ai] 调用 ai-service 失败：${error.message || error}`)
      return res.status(502).json({ message: 'AI 服务暂时不可用，请稍后再试' })
    }

    if (!upstream.ok || !upstream.body) {
      console.warn(`[ai] ai-service 返回异常状态：${upstream.status}`)
      try {
        await upstream.text() // 读完丢弃，释放连接
      } catch {
        /* 忽略 */
      }
      return res.status(502).json({ message: 'AI 服务暂时不可用，请稍后再试' })
    }

    res.status(200)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('X-Accel-Buffering', 'no') // 告诉 nginx 这条响应不要缓冲，SSE 实时下发
    res.flushHeaders()

    const reader = upstream.body.getReader()
    // 客户端提前断开（关页面/停止生成）时取消上游请求，别再白烧模型 token
    req.on('close', () => {
      if (!res.writableEnded) {
        reader.cancel().catch(() => {})
      }
    })

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(Buffer.from(value))
      }
      res.end()
    } catch (error) {
      // 上游中途断流：优雅收尾，前端保留已渲染的部分内容
      console.warn(`[ai] 上游流中断：${error.message || error}`)
      res.end()
    }
  })
}
