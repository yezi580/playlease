// 真实验收脚本：四项验收全跑（RAG 引用 / 智能选号工具 / SSE 流式 / 限流）
// 跑法：node ai_verify.mjs   （需要 ai-service:8000 与 Node:3000 都在跑，且已配 AI_LLM_API_KEY）
const NODE = 'http://127.0.0.1:3000'
const AI = 'http://127.0.0.1:8000'

// 读取一条 SSE 流，返回全部事件对象数组 + 首 token 延迟（毫秒）
async function readSse(resp) {
  const reader = resp.body.getReader()
  const decoder = new TextDecoder('utf-8')
  const events = []
  let buffer = ''
  let firstDeltaMs = null
  const startedAt = Date.now()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const line = block.split('\n').find(l => l.startsWith('data:'))
      if (!line) continue
      try {
        const evt = JSON.parse(line.slice(5).trim())
        if (evt.type === 'delta' && firstDeltaMs === null) firstDeltaMs = Date.now() - startedAt
        events.push(evt)
      } catch { /* 坏块跳过 */ }
    }
  }
  return { events, firstDeltaMs }
}

function joinText(events) {
  return events.filter(e => e.type === 'delta').map(e => e.text).join('')
}

async function chat(content) {
  const resp = await fetch(`${NODE}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content }] })
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`chat HTTP ${resp.status}: ${text.slice(0, 200)}`)
  }
  return readSse(resp)
}

// ---------- ① 健康检查 ----------
const health = await (await fetch(`${AI}/health`)).json()
console.log('① health:', JSON.stringify(health))
if (!health.llm) throw new Error('ai-service 未读到 key（.env 填了吗？重启了吗？）')

// ---------- ② RAG 规则问答（验：sources 引用 + 回答内容） ----------
{
  const { events, firstDeltaMs } = await chat('押金什么时候退？')
  const sources = events.find(e => e.type === 'sources')
  const answer = joinText(events)
  const hasDone = events.some(e => e.type === 'done')
  console.log(`② RAG 问答：首token ${firstDeltaMs}ms | delta ${events.filter(e => e.type === 'delta').length} 段 | done=${hasDone}`)
  console.log('   引用来源:', sources ? sources.sources.map(s => s.title).join('；') : '（无）')
  console.log('   回答节选:', answer.replace(/\s+/g, ' ').slice(0, 160) + '…')
  if (!sources || !sources.sources.length) throw new Error('RAG 未带回引用来源')
  if (!answer.includes('3') || !answer.includes('天')) throw new Error('回答未覆盖「冷静期默认3天」要点')
  if (!hasDone) throw new Error('流未正常收尾（缺 done）')
}

// ---------- ③ 智能选号（验：Function Calling + 卡片数据 + 金额单位） ----------
{
  const { events, firstDeltaMs } = await chat('帮我找个日租800以内的号')
  const toolCall = events.find(e => e.type === 'tool_call')
  const toolResult = events.find(e => e.type === 'tool_result')
  const answer = joinText(events)
  console.log(`③ 智能选号：首token ${firstDeltaMs}ms | 工具=${toolCall?.name}(${JSON.stringify(toolCall?.args)})`)
  const list = toolResult?.result?.list || []
  console.log('   命中商品:', list.map(r => `${r.listingNo}(租${r.rent}元/押${r.deposit}元/${r.region})`).join('，'))
  console.log('   回答节选:', answer.replace(/\s+/g, ' ').slice(0, 160) + '…')
  if (toolCall?.name !== 'search_listings') throw new Error('未触发 search_listings 工具')
  if (!list.length) throw new Error('工具结果为空')
  for (const row of list) {
    if (typeof row.rent !== 'number' || row.rent <= 0 || row.rent > 10000) {
      throw new Error(`金额单位疑似未转元：rent=${row.rent}`)
    }
  }
}

// ---------- ④ SSE 流式粒度（验：delta 是多次小段而非一整块） ----------
{
  const { events } = await chat('结算流程是什么？')
  const deltas = events.filter(e => e.type === 'delta')
  const avgLen = deltas.reduce((s, e) => s + e.text.length, 0) / Math.max(1, deltas.length)
  console.log(`④ 流式粒度：${deltas.length} 段 delta，平均每段 ${avgLen.toFixed(1)} 字`)
  if (deltas.length < 10) throw new Error('delta 段数太少，疑似被整块缓冲（检查 nginx/代理缓冲配置）')
}

// ---------- ⑤ 限流（验：空 body 请求也会被 limiter 计数，凑满阈值后应 429，零 LLM 成本） ----------
{
  const statuses = []
  for (let i = 0; i < 12; i++) {
    const resp = await fetch(`${NODE}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [] })   // 非法 body：过 limiter 后在 handler 400，不烧 token
    })
    statuses.push(resp.status)
  }
  const rateLimited = statuses.filter(s => s === 429).length
  console.log(`⑤ 限流：12 连发状态码 = [${statuses.join(',')}]，429 x${rateLimited}`)
  if (rateLimited < 1) throw new Error('未触发限流（aiChatLimiter 未生效？）')
  console.log('   （本机 IP 已被限流，约 60 秒后自动恢复）')
}

console.log('\n=== 四项验收全部通过 ===')
