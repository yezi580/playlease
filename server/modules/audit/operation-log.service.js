/**
 * 操作日志（审计）共享服务。
 *
 * 管理员与客服（support）都通过这里写入同一张 `admin_operation_logs` 表，
 * 保证「谁/何时/做了什么/通过或驳回原因」在统一审计流里可追溯、可区分。
 */

export function sanitizeRemark(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength)
}

export function safeJsonStringify(value) {
  if (value === undefined) return null
  try {
    return JSON.stringify(value)
  } catch (_error) {
    return JSON.stringify({ message: 'snapshot_serialize_failed' })
  }
}

/**
 * 创建操作日志服务。
 * `recordOperationSafely` 写入失败只记录日志、不抛错，避免阻断主业务流程。
 */
export function createOperationLogService({ pool }) {
  async function recordOperation(payload = {}) {
    const operatorUserId = Number(payload.operatorUserId || 0) || null
    await pool.execute(
      `INSERT INTO admin_operation_logs (
        operator_user_id,
        operator_name,
        module,
        action,
        target_type,
        target_id,
        target_label,
        before_snapshot,
        after_snapshot,
        remark
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        operatorUserId,
        String(payload.operatorName || '').trim() || '管理员',
        String(payload.module || '').trim(),
        String(payload.action || '').trim(),
        String(payload.targetType || '').trim(),
        Number(payload.targetId || 0) || null,
        String(payload.targetLabel || '').trim().slice(0, 255),
        safeJsonStringify(payload.beforeSnapshot),
        safeJsonStringify(payload.afterSnapshot),
        sanitizeRemark(payload.remark)
      ]
    )
  }

  async function recordOperationSafely(payload = {}) {
    try {
      await recordOperation(payload)
    } catch (error) {
      console.error('[audit] record operation log failed', error)
    }
  }

  return { recordOperation, recordOperationSafely }
}

/**
 * 取商品审核摘要（含 owner/reviewer 关联与 title 文案）。
 * 接受 `pool` 或事务 `conn`，便于在事务内复用。
 */
export async function getListingSummaryById(db, listingId) {
  const [rows] = await db.execute(
    `SELECT
       l.id,
       l.listing_no,
       l.owner_user_id,
       COALESCE(NULLIF(owner.phone, ''), NULLIF(owner.username, ''), l.owner_name) AS owner_name,
       owner.phone AS owner_phone,
       l.listing_status,
       l.review_status,
       l.review_assignee_id,
       l.reviewed_by,
       l.reviewed_at,
       l.review_reason,
       l.rent_price,
       l.published_at,
       reviewer.username AS reviewer_name,
       TRIM(
         CONCAT(
           IFNULL(NULLIF(l.rank_name, ''), '未命名商品'),
           ' / ',
           IFNULL(NULLIF(l.login_method, ''), '未知方式')
         )
       ) AS title
     FROM listings l
     LEFT JOIN users owner ON owner.id = l.owner_user_id
     LEFT JOIN users reviewer ON reviewer.id = l.reviewed_by
     WHERE l.id = ?
     LIMIT 1`,
    [listingId]
  )
  return rows[0] || null
}
