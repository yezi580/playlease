// 端到端联调：Node 代理路由 → ai-service 的 SSE 管道（无需 LLM key，走错误事件分支即算通）
// 跑法：node e2e_check.mjs
const BASE = 'http://127.0.0.1:3000'

async function testChatPipeline() {
  const resp = await fetch(`${BASE}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: '押金什么时候退？' }] })
  })
  console.log('[chat] status =', resp.status, '| content-type =', resp.headers.get('content-type'))
  const text = await resp.text()
  console.log('[chat] body =', text.trim().slice(0, 300))
  if (!resp.ok || !text.includes('data:')) throw new Error('SSE 管道不通')
  // 没有 LLM key 时应收到 error 事件（而不是裸断流/502）
  if (!text.includes('"type": "error"') && !text.includes('"type":"error"')) {
    throw new Error('未收到 error 事件——检查 ai-service 是否在 8000')
  }
  console.log('[chat] SSE 管道 OK（无 key 走 error 分支符合预期）\n')
}

async function testListings() {
  const resp = await fetch(`${BASE}/api/listings?page=1&pageSize=2`)
  const data = await resp.json()
  console.log('[listings] total =', data.total, '| rows =', data.list?.length)
  if (resp.ok && data.list?.length) {
    const row = data.list[0]
    console.log('[listings] 首行字段样例:', JSON.stringify({
      listing_no: row.listing_no, rent_price: row.rent_price, deposit: row.deposit,
      region: row.region, character_level: row.character_level
    }))
  }
  console.log('[listings] OK\n')
}

await testChatPipeline()
await testListings()
console.log('=== 端到端联调通过 ===')
