/**
 * 性能相关基础设施：
 * - 补齐高频查询缺失的索引（幂等，启动时执行）
 * - 维护商品 7 日热度预聚合表 listing_hot_stats，供商品列表接口直接 JOIN，
 *   替代原先每次请求对 listing_click_users 的全量 GROUP BY 派生表
 */

const LISTING_HOT_STATS_7D_WINDOW_SQL = `DATE_SUB(NOW(), INTERVAL 7 DAY)`

async function hasIndex(pool, tableName, indexName) {
  const [rows] = await pool.execute(
    `SELECT INDEX_NAME
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?
     LIMIT 1`,
    [process.env.DB_NAME || 'game_rental', tableName, indexName]
  )
  return rows.length > 0
}

export async function ensurePerformanceIndexes(pool) {
  // 商品 7 日热度预聚合表：一行一商品，refreshListingHotStats 周期维护
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS listing_hot_stats (
      listing_id INT NOT NULL COMMENT '商品ID',
      unique_click_7d INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '近7天独立访客点击数（周期预聚合）',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后聚合时间',
      PRIMARY KEY (listing_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )

  // 依赖 ensureOrderSupportSchema / ensureOrderWorkflowSchema 运行时补列的索引放在此处，
  // 本函数必须在那些 ensure 之后调用（见 bootstrap/schema.js 调用顺序）
  const requiredIndexes = [
    {
      tableName: 'listings',
      indexName: 'idx_listings_status_created',
      sql: `CREATE INDEX idx_listings_status_created ON listings (listing_status, created_at)`
    },
    {
      tableName: 'orders',
      indexName: 'idx_orders_status_created',
      sql: `CREATE INDEX idx_orders_status_created ON orders (status, created_at)`
    },
    {
      tableName: 'orders',
      indexName: 'idx_orders_status_paid',
      sql: `CREATE INDEX idx_orders_status_paid ON orders (status, paid_at)`
    },
    {
      tableName: 'orders',
      indexName: 'idx_orders_status_settlement_requested',
      sql: `CREATE INDEX idx_orders_status_settlement_requested ON orders (status, settlement_requested_at)`
    },
    {
      tableName: 'orders',
      indexName: 'idx_orders_support_assignee_status',
      sql: `CREATE INDEX idx_orders_support_assignee_status ON orders (support_assignee_id, support_status)`
    }
  ]

  for (const index of requiredIndexes) {
    if (!(await hasIndex(pool, index.tableName, index.indexName))) {
      await pool.execute(index.sql)
    }
  }
}

let refreshingListingHotStats = false

/**
 * 刷新商品 7 日点击热度预聚合。
 * 周期任务调用（60s 一次），列表接口读到的热度最多滞后一个刷新周期。
 */
export async function refreshListingHotStats(pool) {
  if (refreshingListingHotStats) {
    return { skipped: true }
  }
  refreshingListingHotStats = true
  try {
    const [result] = await pool.execute(
      `INSERT INTO listing_hot_stats (listing_id, unique_click_7d)
       SELECT listing_id, COUNT(*) AS unique_click_7d
       FROM listing_click_users
       WHERE last_clicked_at >= ${LISTING_HOT_STATS_7D_WINDOW_SQL}
       GROUP BY listing_id
       ON DUPLICATE KEY UPDATE unique_click_7d = VALUES(unique_click_7d)`
    )
    // 清理窗口内已无点击的旧聚合行，保证 JOIN 结果与 COALESCE 语义一致
    await pool.execute(
      `DELETE s FROM listing_hot_stats s
       WHERE NOT EXISTS (
         SELECT 1 FROM listing_click_users c
         WHERE c.listing_id = s.listing_id
           AND c.last_clicked_at >= ${LISTING_HOT_STATS_7D_WINDOW_SQL}
       )`
    )
    return {
      refreshed: Number(result?.affectedRows || 0)
    }
  } finally {
    refreshingListingHotStats = false
  }
}
