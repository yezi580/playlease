/**
 * 优雅停机：容器收到 SIGTERM（docker stop / compose 重建容器）时，
 * 先把健康检查置为不可用（编排器/网关据此摘流量）、停掉周期任务，
 * 再断开 websocket 与新连接，限时等待在途请求处理完成后退出。
 *
 * 排干上限必须小于编排文件的 stop_grace_period（当前 30s），
 * 否则进程等来的不是自然退出而是 SIGKILL，前功尽弃。
 */

const DEFAULT_DRAIN_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.SHUTDOWN_DRAIN_TIMEOUT_MS || 15_000) || 15_000
)
// websocket 断开兜底：io.close 正常毫秒级完成，卡住时最多等 3s
const SOCKET_CLOSE_TIMEOUT_MS = 3_000

function withTimeout(promiseFactory, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs)
    promiseFactory().then(
      () => {
        clearTimeout(timer)
        resolve()
      },
      () => {
        clearTimeout(timer)
        resolve()
      }
    )
  })
}

export function registerGracefulShutdown({
  httpServer,
  io,
  stopJobs,
  onShutdownStart,
  drainTimeoutMs = DEFAULT_DRAIN_TIMEOUT_MS
}) {
  let shuttingDown = false

  const closeHttpServer = () => new Promise((resolve) => {
    if (!httpServer || typeof httpServer.close !== 'function') {
      resolve()
      return
    }
    // close() 停止接受新连接；回调触发说明在途连接已全部结束。
    // 服务已关闭时回调会带 ERR_SERVER_NOT_RUNNING 错误，同样视为完成
    httpServer.close(() => resolve())
  })

  const closeSocketIo = () => withTimeout(() => new Promise((resolveClose) => {
    if (!io || typeof io.close !== 'function') {
      resolveClose()
      return
    }
    try {
      // io.close 会主动断开全部 websocket 客户端（客户端会自动重连），
      // 同时关闭其挂载的底层 httpServer
      io.close(() => resolveClose())
    } catch (_error) {
      resolveClose()
    }
  }), SOCKET_CLOSE_TIMEOUT_MS)

  const shutdown = async (signal) => {
    // 第二次收到信号视为强制退出指令（docker 在宽限期后会发 SIGKILL，这里给人工干预留口子）
    if (shuttingDown) {
      console.log(`[shutdown] 再次收到 ${signal}，立即退出`)
      process.exit(0)
    }
    shuttingDown = true
    console.log(`[shutdown] 收到 ${signal}，开始优雅停机（排干上限 ${drainTimeoutMs}ms）`)

    // 1. 健康检查立即转 503：正在轮询 readiness 的编排器/网关能尽快把流量切走
    try {
      onShutdownStart?.()
    } catch (error) {
      console.warn('[shutdown] 标记停机状态失败:', error?.message || error)
    }

    // 2. 停掉周期任务触发，避免排干期间又新起一轮外部支付查单等慢任务
    try {
      stopJobs?.()
    } catch (error) {
      console.warn('[shutdown] 停止周期任务失败:', error?.message || error)
    }

    // 3. 先断 websocket（长连接不关，server.close 的回调永远不会触发）
    await closeSocketIo()

    // 4. 等在途 HTTP 请求排干，超时兜底强制退出
    await Promise.race([
      closeHttpServer(),
      new Promise((resolve) => setTimeout(resolve, drainTimeoutMs))
    ])

    console.log('[shutdown] 排干完成，进程退出')
    process.exit(0)
  }

  process.on('SIGTERM', () => {
    shutdown('SIGTERM')
  })
  process.on('SIGINT', () => {
    shutdown('SIGINT')
  })
}
