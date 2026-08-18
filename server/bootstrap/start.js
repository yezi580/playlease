/**
 * 服务器启动辅助逻辑，用于初始化数据库结构检查和定时任务。
 */

import { startRecurringJobs } from './jobs.js'
import { runBootstrapSchemaTasks } from './schema.js'

export async function startServer(options) {
  const {
    httpServer,
    port,
    expirePendingPaymentOrders,
    captureOnlinePresenceSnapshot,
    reconcileProcessingFundsOrders,
    arbitrateSettlementTimeouts,
    refreshListingHotStats
  } = options

  await runBootstrapSchemaTasks(options)

  httpServer.listen(port, () => {
    console.log(`API server running at http://localhost:${port}`)
    startRecurringJobs({
      expirePendingPaymentOrders,
      captureOnlinePresenceSnapshot,
      reconcileProcessingFundsOrders,
      arbitrateSettlementTimeouts,
      refreshListingHotStats
    })
  })
}
