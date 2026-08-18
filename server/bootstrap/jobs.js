/**
 * 后台任务启动逻辑，用于注册周期性维护任务。
 */

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

export function startRecurringJobs({
  expirePendingPaymentOrders,
  captureOnlinePresenceSnapshot,
  reconcileProcessingFundsOrders,
  arbitrateSettlementTimeouts,
  refreshListingHotStats,
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

  // 各任务的定时触发与启动首跑都走重入保护，慢轮（如外部支付查单）未结束时跳过本轮
  const guardedRunners = {
    cleanup: withReentryGuard('自动取消', runExpiredOrderCleanup),
    onlineSnapshot: withReentryGuard('在线快照', runOnlineSnapshotCapture),
    fundsReconcile: withReentryGuard('资金对账', runProcessingFundsReconcile),
    settlementArbitration: withReentryGuard('结算仲裁', runSettlementArbitration),
    listingHotStats: withReentryGuard('商品热度', runListingHotStatsRefresh)
  }

  Object.values(guardedRunners).forEach((runner) => runner())

  const cleanupInterval = setInterval(guardedRunners.cleanup, intervalMs)
  const onlineSnapshotInterval = setInterval(guardedRunners.onlineSnapshot, onlineSnapshotIntervalMs)
  const fundsReconcileInterval = setInterval(guardedRunners.fundsReconcile, fundsReconcileIntervalMs)
  const settlementArbitrationInterval = setInterval(guardedRunners.settlementArbitration, intervalMs)
  const listingHotStatsInterval = setInterval(guardedRunners.listingHotStats, listingHotStatsIntervalMs)

  return {
    cleanupInterval,
    onlineSnapshotInterval,
    fundsReconcileInterval,
    settlementArbitrationInterval,
    listingHotStatsInterval
  }
}
