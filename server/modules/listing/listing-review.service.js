/**
 * 商品审核工单相关服务。
 *
 * 商品提交（发布 / 编辑后重提）即生成一张"审核工单"，
 * 按最闲客服自动派单 —— 与订单售后、售前咨询工单一致的分配模式
 * （参见 order-lifecycle.service.js 的 assignSupportUser、chat.module.js 的 assignPresaleSupportUser）。
 */

/**
 * 在事务内挑选最闲的客服承接一张商品审核工单。
 * 负载计数 = 该客服名下待审商品数（review_assignee_id = u.id 且 review_status = 'pending'）。
 * 系统中没有任何客服时返回 null（调用方应容错：留空 assignee，不阻断发布）。
 *
 * @param {import('mysql2/promise').PoolConnection} executor 事务连接
 * @returns {Promise<{id: number, username: string} | null>}
 */
export async function assignListingReviewSupportUser(executor) {
  const [rows] = await executor.execute(
    `SELECT
        u.id,
        u.username,
        COUNT(l.id) AS active_review_count,
        MAX(COALESCE(l.review_assigned_at, l.published_at, l.created_at)) AS last_assigned_at
     FROM users u
     LEFT JOIN listings l
       ON l.review_assignee_id = u.id
      AND l.review_status = 'pending'
     WHERE u.role = 'support'
     GROUP BY u.id, u.username
     ORDER BY active_review_count ASC, COALESCE(last_assigned_at, '1970-01-01 00:00:00') ASC, u.id ASC
     LIMIT 1`
  )

  if (!rows.length) return null
  return { id: Number(rows[0].id || 0), username: rows[0].username || '客服' }
}

/**
 * 把一张待审商品派给最闲客服（事务内调用）。
 * 派单失败（无客服，或 SQL 异常）时静默跳过，保持 review_assignee_id = NULL，交由后续兜底。
 *
 * 关键：派单是"锦上添花"，绝不能阻断发布/编辑主流程。这里整体 try/catch，
 * 任何异常都只记日志、返回 null，调用方（listing.routes / my-listings.routes 的发布事务）
 * 不受影响，商品照常发布成功。
 */
export async function assignListingReviewToLeastBusySupport(executor, listingId) {
  try {
    const supportUser = await assignListingReviewSupportUser(executor)
    if (!supportUser || !supportUser.id) return null
    await executor.execute(
      `UPDATE listings
       SET review_assignee_id = ?,
           review_assigned_at = NOW()
       WHERE id = ?`,
      [supportUser.id, listingId]
    )
    return supportUser
  } catch (error) {
    console.error('[listing-review] assign support failed (non-fatal)', {
      listingId,
      message: error?.message || String(error)
    })
    return null
  }
}
