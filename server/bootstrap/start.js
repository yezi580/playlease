/**
 * 服务器启动辅助逻辑，用于初始化数据库结构检查和定时任务。
 */

import { registerGracefulShutdown } from './shutdown.js'
import { startRecurringJobs } from './jobs.js'
import { runBootstrapSchemaTasks } from './schema.js'

export async function startServer(options) {
  const {
    httpServer,
    io,
    port,
    markShuttingDown,
    expirePendingPaymentOrders,
    captureOnlinePresenceSnapshot,
    reconcileProcessingFundsOrders,
    arbitrateSettlementTimeouts,
    refreshListingHotStats,
    releaseDueDepositHolds
  } = options

  await runBootstrapSchemaTasks(options)

  httpServer.listen(port, () => {
    console.log(`API server running at http://localhost:${port}`)
    const recurringJobs = startRecurringJobs({
      expirePendingPaymentOrders,
      captureOnlinePresenceSnapshot,
      reconcileProcessingFundsOrders,
      arbitrateSettlementTimeouts,
      refreshListingHotStats,
      releaseDueDepositHolds
    })
    registerGracefulShutdown({
      httpServer,
      io,
      stopJobs: recurringJobs.stop,
      onShutdownStart: markShuttingDown
    })
  })
}
