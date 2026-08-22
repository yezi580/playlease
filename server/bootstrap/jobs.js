/**
 * 后台任务启动逻辑，用于注册周期性维护任务。
 *
 * 任务同时受两层保护：
 * - 进程内重入保护：上一轮未跑完时跳过本轮，防止任务叠加执行
 * - 跨实例分布式锁：蓝绿双容器（或多实例）并存时，同一轮任务全局只有一个实例执行
 */

import {
  acquireDistributedLock,
  buildJobLockKey,
  createLockToken,
  releaseDistributedLock
} from '../infrastructure/redis.js'

// 跨实例任务锁 TTL：需覆盖最慢一轮任务（资金对账含外部支付查单）；
// 实例崩溃来不及释放时靠 TTL 自动失效，避免任务永久停摆。
// 单轮跑超 TTL 的极端情况下可能双跑，底层操作有事务 + 行锁兜底。
const JOB_LOCK_TTL_MS = Math.max(30_000, Number(process.env.JOB_LOCK_TTL_MS || 300_000) || 300_000)

// 重入保护包装：上一轮未跑完（如外部支付查单慢）时跳过本轮，防止任务叠加执行
function withReentryGuard(label, task) {
  let running = false
  return async () => {
    if (running) {
      console.warn(`[${label}] 上一轮尚未结束，本轮跳过`)
      return
    }
    running = true
    try {
      await task()
    } finally {
      running = false
    }
  }
}

// 单实例执行包装：抢不到锁说明另一实例正在跑本轮，直接跳过。
// Redis 不可用时 acquireDistributedLock 返回 true（fail-open，与订单锁同一约定）：
// 宁可偶尔双跑也不要任务停摆——降级场景通常只剩单实例在服务。
function withSingleNodeLock(lockName, task) {
  return async () => {
    const lockKey = buildJobLockKey(lockName)
    const token = createLockToken()
    const acquired = await acquireDistributedLock(lockKey, token, JOB_LOCK_TTL_MS)
    if (!acquired) {
      return
    }
    try {
      await task()
    } finally {
      await releaseDistributedLock(lockKey, token)
    }
  }
}

export function startRecurringJobs({
  expirePendingPaymentOrders,
  captureOnlinePresenceSnapshot,
  reconcileProcessingFundsOrders,
  arbitrateSettlementTimeouts,
  refreshListingHotStats,
  releaseDueDepositHolds,
  intervalMs = 60_000,
  onlineSnapshotIntervalMs = 60_000,
  fundsReconcileIntervalMs = 120_000,
  listingHotStatsIntervalMs = 60_000
}) {
  const runExpiredOrderCleanup = async () => {
    try {
      const result = await expirePendingPaymentOrders()
      if (result.expiredOrderCount > 0 || result.closedTransactionCount > 0 || result.syncedPaidTransactionCount > 0 || result.skippedOrderCount > 0) {
        console.log(
          `[自动取消] 已取消 ${result.expiredOrderCount} 个超时未支付订单，已恢复 ${result.restoredListingCount} 个商品，` +
          `已关闭 ${result.closedTransactionCount} 笔支付流水，已同步 ${result.syncedPaidTransactionCount} 笔已支付流水，` +
          `跳过 ${result.skippedOrderCount} 个订单`
        )
      }
    } catch (error) {
      console.error('[自动取消] 检查超时订单失败:', error.message)
    }
  }

  const runOnlineSnapshotCapture = async () => {
    if (typeof captureOnlinePresenceSnapshot !== 'function') return
    try {
      await captureOnlinePresenceSnapshot()
    } catch (error) {
      console.error('[在线快照] 采样失败:', error.message)
    }
  }

  const runProcessingFundsReconcile = async () => {
    if (typeof reconcileProcessingFundsOrders !== 'function') return
    try {
      const summary = await reconcileProcessingFundsOrders()
      if (summary && summary.scanned > 0) {
        console.log(
          `[资金对账] 扫描 ${summary.scanned} 个资金处理中订单：完成 ${summary.finalized}，处理中 ${summary.pending}，跳过 ${summary.skipped}，失败 ${summary.errors}`
        )
      }
    } catch (error) {
      console.error('[资金对账] 执行失败:', error.message)
    }
  }

  const runSettlementArbitration = async () => {
    if (typeof arbitrateSettlementTimeouts !== 'function') return
    try {
      const summary = await arbitrateSettlementTimeouts()
      if (summary && (summary.buyerTimeoutArbitrated > 0 || summary.sellerTimeoutConfirmed > 0 || summary.autoEnteredSettlement > 0 || summary.autoVerifiedOrders > 0)) {
        console.log(
          `[结算仲裁] 支付超时自动确认履约 ${summary.autoVerifiedOrders} 单，租期结束自动进入结算 ${summary.autoEnteredSettlement} 单，买家超时转客服仲裁 ${summary.buyerTimeoutArbitrated} 单，卖家超时视为确认 ${summary.sellerTimeoutConfirmed} 单`
        )
      }
    } catch (error) {
      console.error('[结算仲裁] 执行失败:', error.message)
    }
  }

  const runListingHotStatsRefresh = async () => {
    if (typeof refreshListingHotStats !== 'function') return
    try {
      await refreshListingHotStats()
    } catch (error) {
      console.error('[商品热度] 预聚合刷新失败:', error.message)
    }
  }

  const runDepositHoldRelease = async () => {
    if (typeof releaseDueDepositHolds !== 'function') return
    try {
      const summary = await releaseDueDepositHolds()
      if (summary && summary.released + summary.pending + summary.errors > 0) {
        console.log(
          `[押金保管] 扫描 ${summary.scanned} 个到期押金：已退回 ${summary.released}，处理中 ${summary.pending}，跳过 ${summary.skipped}，失败 ${summary.errors}`
        )
      }
    } catch (error) {
      console.error('[押金保管] 到期释放执行失败:', error.message)
    }
  }

  // 锁在重入保护外层：本地上一轮未结束时直接跳过，不去碰 Redis；
  // 抢到锁后才进入实际执行，异常/正常结束都释放锁
  const guardedRunners = {
    cleanup: withSingleNodeLock('cleanup', withReentryGuard('自动取消', runExpiredOrderCleanup)),
    onlineSnapshot: withSingleNodeLock('online-snapshot', withReentryGuard('在线快照', runOnlineSnapshotCapture)),
    fundsReconcile: withSingleNodeLock('funds-reconcile', withReentryGuard('资金对账', runProcessingFundsReconcile)),
    settlementArbitration: withSingleNodeLock('settlement-arbitration', withReentryGuard('结算仲裁', runSettlementArbitration)),
    listingHotStats: withSingleNodeLock('listing-hot-stats', withReentryGuard('商品热度', runListingHotStatsRefresh)),
    depositHoldRelease: withSingleNodeLock('deposit-hold-release', withReentryGuard('押金保管', runDepositHoldRelease))
  }

  Object.values(guardedRunners).forEach((runner) => runner())

  const intervals = [
    setInterval(guardedRunners.cleanup, intervalMs),
    setInterval(guardedRunners.onlineSnapshot, onlineSnapshotIntervalMs),
    setInterval(guardedRunners.fundsReconcile, fundsReconcileIntervalMs),
    setInterval(guardedRunners.settlementArbitration, intervalMs),
    setInterval(guardedRunners.listingHotStats, listingHotStatsIntervalMs),
    setInterval(guardedRunners.depositHoldRelease, intervalMs)
  ]

  return {
    // 优雅停机时调用：停掉所有周期触发，避免排干期间又新起一轮慢任务
    // （已在进行中的一轮不会被中断，靠任务自身的幂等设计保证可重入）
    stop() {
      intervals.forEach((timer) => clearInterval(timer))
    }
  }
}
