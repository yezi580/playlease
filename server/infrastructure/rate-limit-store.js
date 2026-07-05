/**
 * 限流存储适配层：
 * - HTTP 限流优先使用 Redis，便于多实例共享限流状态
 * - Socket / 上传等滑动窗口频控复用同一套 Redis 客户端
 * - 未配置 Redis 时自动回退到进程内存存储
 */

import { getRedisClient } from './redis.js'

const RATE_LIMIT_REDIS_PREFIX = String(process.env.RATE_LIMIT_REDIS_PREFIX || 'my-app:rate-limit:').trim() || 'my-app:rate-limit:'

export async function getSharedRedisClient() {
  return getRedisClient()
}

export async function createExpressRateLimitStore(namespace) {
  const client = await getSharedRedisClient()
  if (!client) {
    return undefined
  }

  const { RedisStore } = await import('rate-limit-redis')
  return new RedisStore({
    prefix: `${RATE_LIMIT_REDIS_PREFIX}${String(namespace || 'http').trim()}:`,
    sendCommand: (...args) => client.sendCommand(args)
  })
}

function createInMemorySlidingWindowStore({ windowMs, max }) {
  const buckets = new Map()

  function prune(key, now) {
    const activeEntries = (buckets.get(key) || [])
      .filter((entry) => now - entry.timestamp < windowMs)
    if (activeEntries.length) {
      buckets.set(key, activeEntries)
    } else {
      buckets.delete(key)
    }
    return activeEntries
  }

  return {
    async consume(key) {
      const now = Date.now()
      const safeKey = String(key || '').trim()
      if (!safeKey) {
        return { allowed: false, retryAfterMs: windowMs, token: '' }
      }

      const activeEntries = prune(safeKey, now)
      if (activeEntries.length >= max) {
        return {
          allowed: false,
          retryAfterMs: Math.max(1000, windowMs - (now - activeEntries[0].timestamp)),
          token: ''
        }
      }

      const token = `${now}-${Math.random().toString(36).slice(2, 10)}`
      activeEntries.push({ token, timestamp: now })
      buckets.set(safeKey, activeEntries)
      return { allowed: true, retryAfterMs: 0, token }
    },

    async rollback(key, token) {
      const safeKey = String(key || '').trim()
      const safeToken = String(token || '').trim()
      if (!safeKey || !safeToken) return

      const nextEntries = (buckets.get(safeKey) || [])
        .filter((entry) => entry.token !== safeToken)

      if (nextEntries.length) {
        buckets.set(safeKey, nextEntries)
      } else {
        buckets.delete(safeKey)
      }
    }
  }
}

export async function createSlidingWindowRateStore({ namespace, windowMs, max }) {
  const client = await getSharedRedisClient()
  if (!client) {
    return createInMemorySlidingWindowStore({ windowMs, max })
  }

  const prefix = `${RATE_LIMIT_REDIS_PREFIX}${String(namespace || 'window').trim()}:`

  return {
    async consume(key) {
      const now = Date.now()
      const safeKey = `${prefix}${String(key || '').trim()}`
      if (!String(key || '').trim()) {
        return { allowed: false, retryAfterMs: windowMs, token: '' }
      }

      await client.zRemRangeByScore(safeKey, 0, now - windowMs)
      const activeCount = await client.zCard(safeKey)
      if (activeCount >= max) {
        const oldestEntries = await client.zRangeWithScores(safeKey, 0, 0)
        const oldestTimestamp = Number(oldestEntries[0]?.score || now)
        return {
          allowed: false,
          retryAfterMs: Math.max(1000, windowMs - (now - oldestTimestamp)),
          token: ''
        }
      }

      const token = `${now}-${Math.random().toString(36).slice(2, 10)}`
      await client.zAdd(safeKey, [{ score: now, value: token }])
      await client.pExpire(safeKey, windowMs)
      return { allowed: true, retryAfterMs: 0, token }
    },

    async rollback(key, token) {
      const safeKey = String(key || '').trim()
      const safeToken = String(token || '').trim()
      if (!safeKey || !safeToken) return
      await client.zRem(`${prefix}${safeKey}`, safeToken)
    }
  }
}
