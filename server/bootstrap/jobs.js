/**
 * 后台任务启动逻辑，用于注册周期性维护任务。
 */

export function startRecurringJobs({
  expirePendingPaymentOrders,
  captureOnlinePresenceSnapshot,
  reconcileProcessingFundsOrders,
  intervalMs = 60_000,
  onlineSnapshotIntervalMs = 60_000,
  fundsReconcileIntervalMs = 120_000
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

  runExpiredOrderCleanup()
  runOnlineSnapshotCapture()
  runProcessingFundsReconcile()

  const cleanupInterval = setInterval(runExpiredOrderCleanup, intervalMs)
  const onlineSnapshotInterval = setInterval(runOnlineSnapshotCapture, onlineSnapshotIntervalMs)
  const fundsReconcileInterval = setInterval(runProcessingFundsReconcile, fundsReconcileIntervalMs)

  return {
    cleanupInterval,
    onlineSnapshotInterval,
    fundsReconcileInterval
  }
}
