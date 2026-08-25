/**
 * 订单履约短信通知：买家支付成功后短信触达号主（卖家）。
 * 背景：支付后号主常处于离线状态，微信/电话联系不上导致交付滞留，
 * 短信是唯一可靠的带外触达通道（注册手机号已验证）。
 *
 * 设计约束：
 * - 永不抛错：短信失败只记日志，绝不影响支付主流程
 * - 模板未配置（TENCENT_SMS_TEMPLATE_ID_SELLER_ORDER_PAID 为空）时静默跳过
 * - 进程内按订单幂等去重：同一订单无论触发几次只发一条
 */

const SELLER_NOTIFY_SENT_TTL_MS = 24 * 60 * 60 * 1000

export function createOrderSmsService({ pool, smsProvider }) {
  // 进程内已发订单快照：orderId -> 发送时间戳，超时清理防止内存缓慢增长
  const sentOrderIds = new Map()

  function pruneExpiredSentOrders() {
    const now = Date.now()
    for (const [orderId, sentAt] of sentOrderIds.entries()) {
      if (Number(sentAt || 0) + SELLER_NOTIFY_SENT_TTL_MS <= now) {
        sentOrderIds.delete(orderId)
      }
    }
  }

  async function notifySellerOrderPaid({ orderId } = {}) {
    const safeOrderId = Number(orderId || 0)
    if (!safeOrderId) {
      return { ok: false, reason: 'invalid_order' }
    }

    try {
      pruneExpiredSentOrders()
      if (sentOrderIds.has(safeOrderId)) {
        return { ok: false, reason: 'already_sent', orderId: safeOrderId }
      }
      // 先占位再发送：即使发送过程异常也不重试，避免重复触达号主
      sentOrderIds.set(safeOrderId, Date.now())

      const [rows] = await pool.execute(
        `SELECT o.order_no, o.seller_id, u.phone AS seller_phone
         FROM orders o
         JOIN users u ON u.id = o.seller_id
         WHERE o.id = ?
         LIMIT 1`,
        [safeOrderId]
      )
      if (!rows.length) {
        return { ok: false, reason: 'order_not_found', orderId: safeOrderId }
      }

      const { order_no: orderNo, seller_phone: sellerPhone } = rows[0]
      if (!sellerPhone) {
        console.warn('[order-sms] seller phone missing, skip notify', { orderId: safeOrderId })
        return { ok: false, reason: 'seller_phone_missing', orderId: safeOrderId }
      }

      // 模板为无变量固定文案（个人认证通知类模板不允许变量），不传 TemplateParamSet
      const result = await smsProvider.sendNotification({
        scene: 'seller_order_paid',
        phone: sellerPhone
      })

      if (result?.ok) {
        console.log('[order-sms] seller notified', {
          orderId: safeOrderId,
          orderNo,
          phone: `${String(sellerPhone).slice(0, 3)}****${String(sellerPhone).slice(-4)}`
        })
      } else {
        console.warn('[order-sms] seller notify skipped/failed', {
          orderId: safeOrderId,
          reason: result?.reason || '',
          message: result?.message || ''
        })
      }
      return result
    } catch (error) {
      console.error('[order-sms] seller notify error', {
        orderId: safeOrderId,
        message: String(error?.message || error)
      })
      return { ok: false, reason: 'internal_error', orderId: safeOrderId }
    }
  }

  return { notifySellerOrderPaid }
}
