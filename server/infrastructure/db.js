/**
 * 数据库连接池模块
 *
 * 使用 mysql2/promise 创建连接池，支持：
 * - 自动连接管理（获取/释放）
 * - 连接数限制（最多10个并发连接）
 * - 通过 .env 环境变量配置数据库参数
 *
 * 使用方式（在路由/中间件中）：
 *   import pool from './infrastructure/db.js'
 *   const [rows] = await pool.query('SELECT * FROM listings LIMIT ?', [10])
 */

import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 加载 .env 文件（优先从 server/ 目录加载，兼容从上级目录启动）
dotenv.config({ path: join(__dirname, '..', '.env') })

function readPositiveIntEnv(name, fallback) {
  const rawValue = String(process.env[name] || '').trim()
  if (!rawValue) return fallback
  const parsedValue = Number(rawValue)
  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return fallback
  }
  return Math.round(parsedValue)
}

const dbConnectionLimit = Math.max(1, readPositiveIntEnv('DB_CONNECTION_LIMIT', 30))
const dbMaxIdle = Math.max(1, readPositiveIntEnv('DB_MAX_IDLE', dbConnectionLimit))
const dbIdleTimeoutMs = Math.max(1000, readPositiveIntEnv('DB_IDLE_TIMEOUT_MS', 60_000))
const dbQueueLimit = readPositiveIntEnv('DB_QUEUE_LIMIT', 0)
const dbConnectTimeoutMs = Math.max(1000, readPositiveIntEnv('DB_CONNECT_TIMEOUT_MS', 10_000))
const dbEnableKeepAlive = String(process.env.DB_ENABLE_KEEP_ALIVE || '1').trim() !== '0'
const dbKeepAliveInitialDelay = Math.max(0, readPositiveIntEnv('DB_KEEP_ALIVE_INITIAL_DELAY_MS', 0))

// 创建MySQL连接池
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',    // 数据库地址（默认本地）
  port: Number(process.env.DB_PORT || 3306),     // 数据库端口（默认3306）
  user: process.env.DB_USER || 'root',           // 数据库用户名
  password: process.env.DB_PASSWORD || '',       // 数据库密码
  database: process.env.DB_NAME || 'game_rental', // 数据库名称
  connectionLimit: dbConnectionLimit,            // 最大连接数
  maxIdle: dbMaxIdle,                            // 最大空闲连接数
  idleTimeout: dbIdleTimeoutMs,                  // 空闲连接超时时间
  queueLimit: dbQueueLimit,                      // 连接池排队上限，0 表示不限
  connectTimeout: dbConnectTimeoutMs,            // 建连超时
  enableKeepAlive: dbEnableKeepAlive,            // 减少长连接闲置被断开
  keepAliveInitialDelay: dbKeepAliveInitialDelay,
  charset: 'utf8mb4_unicode_ci'                  // 显式使用 utf8mb4 排序规则，避免中文枚举值写入异常
})

pool.on('connection', (connection) => {
  connection.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci")
})

export default pool
