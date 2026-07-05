/**
 * 服务端入口文件，用于启动 HTTP 应用和后台任务。
 */

import { createApp } from './app.js'
import { startServer } from './bootstrap/start.js'

const appContext = createApp()

startServer(appContext).catch((error) => {
  console.error('API server failed to start:', error)
  process.exit(1)
})
