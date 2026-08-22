/**
 * 订单生命周期流程逻辑，处理支付超时、结算与状态变更。
 */

import { getSaleItemDisplayName } from '../../constants/saleItems.js'
import {
  calculateBuyerServiceFeeAmount,
  calculateBuyerRentFromSellerRent,
  calculateCompensationFeeAmount,
  calculateSellerIncomeRent,
  calculateServiceFeeFromSellerRent,
  getSaleItemConfig,
  loadBusinessSettings,
  resolveBuyerUnitPriceInCent
} from '../business-settings/runtime.js'

export class OrderLifecycleError extends Error {
  constructor(status, body) {
    super(body?.message || '订单流程处理失败')
    this.name = 'OrderLifecycleError'
    this.status = status
    this.body = body
  }
}

function fail(status, body) {
  throw new OrderLifecycleError(status, body)
}

function buildDefaultOrderNo(date = new Date()) {
  const sourceDate = date instanceof Date ? date : new Date(date)
  const year = String(sourceDate.getFullYear())
  const month = String(sourceDate.getMonth() + 1).padStart(2, '0')
  const day = String(sourceDate.getDate()).padStart(2, '0')
  const hour = String(sourceDate.getHours()).padStart(2, '0')
  const minute = String(sourceDate.getMinutes()).padStart(2, '0')
  const second = String(sourceDate.getSeconds()).padStart(2, '0')
  const randomPart = String(Math.floor(Math.random() * 1000000)).padStart(6, '0')
  return `ORD${year}${month}${day}${hour}${minute}${second}${randomPart}`
}

export function createOrderLifecycleService({
  pool,
  generateOrderNo,
  ORDER_LOCK_TTL_MS,
  acquireDistributedLock,
  releaseDistributedLock,
  buildOrderLockKey,
  buildListingOrderLockKey,
  createLockToken,
  invalidateListingDetailCache,
  calculateBuyerOrderRentPrice,
  buildOrderListingTitle,
  orderStatusToLabel,
  getOrderConversationAccess,
  ensureOrderConversation,
  ensureSupportConversationParticipant,
  getConversationForUser,
  createConversationMessage,
  emitConversationMessage,
  emitSupportEvent,
  emitSupportDeskUpdate,
  createOrderRefund,
  createSettlementPayout,
  closeOrderPayment
}) {
  const createOrderNo = typeof generateOrderNo === 'function' ? generateOrderNo : buildDefaultOrderNo

  async function runWithDistributedLock(lockKey, busyMessage, executor) {
    const safeLockKey = String(lockKey || '').trim()
    if (!safeLockKey || typeof executor !== 'function') {
      return executor()
    }

    const lockToken = typeof createLockToken === 'function'
      ? createLockToken()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const acquired = typeof acquireDistributedLock === 'function'
      ? await acquireDistributedLock(safeLockKey, lockToken, ORDER_LOCK_TTL_MS)
      : true

    if (!acquired) {
      fail(409, { message: busyMessage || '当前订单正在处理中，请稍后再试' })
    }

    try {
      return await executor()
    } finally {
      if (typeof releaseDistributedLock === 'function') {
        await releaseDistributedLock(safeLockKey, lockToken)
      }
    }
  }

  function inferSellerRentFromBuyerRent(buyerRentAmount) {
    const normalizedBuyerRent = Math.max(0, Number(buyerRentAmount || 0))
    const quotient = Math.floor(normalizedBuyerRent / 11)
    const remainder = normalizedBuyerRent % 11
    if (remainder <= 9) {
      return quotient * 10 + remainder
    }
    return Math.floor(normalizedBuyerRent / 1.1)
  }

  async function fetchOrderById(executor, orderId) {
    const [rows] = await executor.execute(
      `SELECT * FROM orders WHERE id = ? LIMIT 1`,
      [orderId]
    )
    return rows[0] || null
  }

  async function emitOrderSystemMessage({ order, actorUserId, actorRole = 'buyer', content }) {
    if (!order || !actorUserId || !content) return
    const conversationId = await ensureOrderConversation(order)
    if (actorRole === 'support') {
      await ensureSupportConversationParticipant(conversationId, actorUserId)
    }
    const conversation = await getConversationForUser(conversationId, actorUserId)
    if (!conversation) return
    const systemMessage = await createConversationMessage({
      conversationId,
      senderUserId: actorUserId,
      messageType: 'system',
      content
    })
    await emitConversationMessage(conversation, systemMessage, actorUserId)
  }

  async function assignSupportUser(executor) {
    const [rows] = await executor.execute(
      `SELECT
          u.id,
          u.username,
          COUNT(o.id) AS active_order_count,
          MAX(COALESCE(o.paid_at, o.created_at)) AS last_assigned_at
       FROM users u
       LEFT JOIN orders o
         ON o.support_assignee_id = u.id
        AND o.status IN ('paid', 'support_handling', 'settlement_pending')
       WHERE u.role = 'support'
       GROUP BY u.id, u.username
       ORDER BY active_order_count ASC, COALESCE(last_assigned_at, '1970-01-01 00:00:00') ASC, u.id ASC
       LIMIT 1`
    )

    if (!rows.length) {
      fail(400, { message: '当前暂无可分配的客服，请稍后再试' })
    }

    return {
      id: Number(rows[0].id || 0),
      username: rows[0].username || '客服'
    }
  }

  async function saveOrderItemSnapshots(executor, orderId, listingId, businessSettings = null) {
    const [itemsRows] = await executor.execute(
      `SELECT item_key, item_name, item_mode, quantity, unit_price, total_price
       FROM listing_items
       WHERE listing_id = ?
       ORDER BY id ASC`,
      [listingId]
    )

    if (!itemsRows.length) {
      return
    }

    // 买家侧结算单价在下单时点快照，后续后台调价不影响已成交订单
    const saleItemConfig = getSaleItemConfig(businessSettings || await loadBusinessSettings(executor))

    for (const row of itemsRows) {
      const sellerUnitPrice = Number(row.unit_price || 0)
      const itemMode = row.item_mode || 'sale'
      const buyerUnitPrice = itemMode === 'gift'
        ? 0
        : resolveBuyerUnitPriceInCent(sellerUnitPrice, saleItemConfig[row.item_key]?.buyerUnitPriceInCent)
      await executor.execute(
        `INSERT INTO order_item_snapshots (
          order_id, item_key, item_name, item_mode, quantity, unit_price, buyer_unit_price, total_price
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          item_name = VALUES(item_name),
          item_mode = VALUES(item_mode),
          quantity = VALUES(quantity),
          unit_price = VALUES(unit_price),
          buyer_unit_price = VALUES(buyer_unit_price),
          total_price = VALUES(total_price)`,
        [
          orderId,
          row.item_key,
          getSaleItemDisplayName(row.item_key, row.item_name),
          itemMode,
          Number(row.quantity || 0),
          sellerUnitPrice,
          buyerUnitPrice,
          Number(row.total_price || 0)
        ]
      )
    }
  }

  async function buildSettlementPreview(executor, orderId) {
    const order = await fetchOrderById(executor, orderId)
    if (!order) {
      fail(404, { message: '订单不存在' })
    }

    // 额外物品按买卖双侧计价：买家按买家价从押金扣除，卖家按卖家价全额入账，差价归平台。
    // 旧申报记录无买家总价（0）时回退卖家口径，与历史订单行为一致。
    const [[usageRow]] = await executor.execute(
      `SELECT
          COALESCE(SUM(reported_total_price), 0) AS used_items_seller_amount,
          COALESCE(SUM(CASE
            WHEN reported_quantity > 0 AND buyer_total_price > 0 THEN buyer_total_price
            ELSE reported_total_price
          END), 0) AS used_items_buyer_amount
       FROM order_item_usage_reports
       WHERE order_id = ?`,
      [orderId]
    )

    const buyerRentAmount = Number(order.amount || 0)
    const depositAmount = Number(order.deposit_amount || 0)
    // usedItemsAmount = 买家侧扣款合计（从押金扣除的口径，沿用列语义）
    const usedItemsAmount = Number(usageRow?.used_items_buyer_amount || 0)
    const usedItemsSellerAmount = Number(usageRow?.used_items_seller_amount || 0)
    const usedItemsMarkupAmount = Math.max(0, usedItemsAmount - usedItemsSellerAmount)
    const [[listingRow]] = Number(order.listing_id || 0) > 0
      ? await executor.execute(
        `SELECT rent_price, compensation_plan
         FROM listings
         WHERE id = ?
         LIMIT 1`,
        [order.listing_id]
      )
      : [[null]]
    const sellerRentAmount = Number(order.seller_rent_amount || 0) > 0
      ? Number(order.seller_rent_amount || 0)
      : (Number(listingRow?.rent_price || 0) > 0
        ? Number(listingRow.rent_price || 0)
        : inferSellerRentFromBuyerRent(buyerRentAmount))
    const businessSettings = await loadBusinessSettings(executor)
    const sellerServiceFeeRatePercent = businessSettings.platformCommission?.sellerServiceFeeRatePercent
    const buyerServiceFeeAmount = calculateBuyerServiceFeeAmount(buyerRentAmount, sellerRentAmount)
    const inviteRewardRatePercent = Math.max(0, Number(businessSettings.inviteReward?.buyerServiceFeeRewardRatePercent || 0))
    // 额外物品差价（买家价 − 卖家价）并入平台收益，卖家按卖家价全额入账
    const platformFeeAmount = calculateServiceFeeFromSellerRent(
      sellerRentAmount,
      sellerServiceFeeRatePercent
    ) + usedItemsMarkupAmount
    const compensationFeeAmount = calculateCompensationFeeAmount(
      sellerRentAmount,
      listingRow?.compensation_plan,
      businessSettings
    )
    const sellerIncomeAmount = Math.max(
      0,
      calculateSellerIncomeRent(sellerRentAmount, sellerServiceFeeRatePercent) - compensationFeeAmount
    ) + usedItemsSellerAmount
    const buyerRefundAmount = Math.max(0, depositAmount - usedItemsAmount)

    return {
      rentAmount: sellerRentAmount,
      buyerRentAmount,
      sellerRentAmount,
      depositAmount,
      usedItemsAmount,
      usedItemsSellerAmount,
      usedItemsMarkupAmount,
      buyerServiceFeeAmount,
      inviteRewardRatePercent,
      platformFeeAmount,
      sellerIncomeAmount,
      buyerRefundAmount
    }
  }

  async function countSaleSnapshotItems(executor, orderId) {
    const [rows] = await executor.execute(
      `SELECT COUNT(*) AS total
       FROM order_item_snapshots
       WHERE order_id = ?
         AND item_mode = 'sale'`,
      [orderId]
    )
    return Number(rows[0]?.total || 0)
  }

  async function upsertSettlement(executor, orderId, preview, status = 'draft', supportUserId = null, options = {}) {
    const payoutMode = options.payoutMode === 'manual' ? 'manual' : 'huifu'
    const manualPayoutNote = payoutMode === 'manual'
      ? String(options.manualPayoutNote || '').trim().slice(0, 500) || null
      : null
    await executor.execute(
      `INSERT INTO order_settlements (
        order_id,
        rent_amount,
        deposit_amount,
        used_items_amount,
        platform_fee_amount,
        seller_income_amount,
        buyer_refund_amount,
        payout_mode,
        manual_payout_note,
        status,
        executed_by_support_id,
        executed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        rent_amount = VALUES(rent_amount),
        deposit_amount = VALUES(deposit_amount),
        used_items_amount = VALUES(used_items_amount),
        platform_fee_amount = VALUES(platform_fee_amount),
        seller_income_amount = VALUES(seller_income_amount),
        buyer_refund_amount = VALUES(buyer_refund_amount),
        payout_mode = VALUES(payout_mode),
        manual_payout_note = VALUES(manual_payout_note),
        status = VALUES(status),
        executed_by_support_id = VALUES(executed_by_support_id),
        executed_at = VALUES(executed_at)`,
      [
        orderId,
        preview.rentAmount,
        preview.depositAmount,
        preview.usedItemsAmount,
        preview.platformFeeAmount,
        preview.sellerIncomeAmount,
        preview.buyerRefundAmount,
        payoutMode,
        manualPayoutNote,
        status,
        supportUserId ? Number(supportUserId) : null,
        status === 'executed' ? new Date() : null
      ]
    )
  }

  function buildFullRefundSettlementPreview(order) {
    const buyerRentAmount = Number(order.amount || 0)
    const rentAmount = Number(order.seller_rent_amount || 0) > 0
      ? Number(order.seller_rent_amount || 0)
      : inferSellerRentFromBuyerRent(buyerRentAmount)
    const depositAmount = Number(order.deposit_amount || 0)
    return {
      rentAmount,
      buyerRentAmount,
      sellerRentAmount: rentAmount,
      depositAmount,
      usedItemsAmount: 0,
      usedItemsSellerAmount: 0,
      usedItemsMarkupAmount: 0,
      buyerServiceFeeAmount: 0,
      inviteRewardRatePercent: 0,
      platformFeeAmount: 0,
      sellerIncomeAmount: 0,
      buyerRefundAmount: buyerRentAmount + depositAmount
    }
  }

  function buildFrozenFundsSettlementPreview(order) {
    const buyerRentAmount = Number(order.amount || 0)
    const depositAmount = Number(order.deposit_amount || 0)
    return {
      rentAmount: buyerRentAmount,
      buyerRentAmount,
      sellerRentAmount: buyerRentAmount,
      depositAmount,
      usedItemsAmount: 0,
      usedItemsSellerAmount: 0,
      usedItemsMarkupAmount: 0,
      buyerServiceFeeAmount: 0,
      inviteRewardRatePercent: 0,
      platformFeeAmount: buyerRentAmount,
      sellerIncomeAmount: 0,
      buyerRefundAmount: depositAmount
    }
  }

  async function ensureWalletAccount(executor, userId) {
    await executor.execute(
      `INSERT INTO wallet_accounts (user_id, balance)
       VALUES (?, 0)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
      [userId]
    )
  }

  async function creditWallet(executor, userId, amount, orderId, remark, businessType = 'order_settlement') {
    const safeAmount = Number(amount || 0)
    if (safeAmount <= 0) return

    await ensureWalletAccount(executor, userId)
    const [[accountRow]] = await executor.execute(
      `SELECT balance
       FROM wallet_accounts
       WHERE user_id = ?
       LIMIT 1
       FOR UPDATE`,
      [userId]
    )
    const balanceBefore = Number(accountRow?.balance || 0)
    const balanceAfter = balanceBefore + safeAmount
    await executor.execute(
      `UPDATE wallet_accounts
       SET balance = ?
       WHERE user_id = ?`,
      [balanceAfter, userId]
    )
    await executor.execute(
      `INSERT INTO wallet_ledger (
        user_id, order_id, business_type, direction, amount, balance_before, balance_after, remark
      ) VALUES (?, ?, ?, 'credit', ?, ?, ?, ?)`,
      [userId, orderId, businessType, safeAmount, balanceBefore, balanceAfter, remark || null]
    )
  }

  async function awardInviteRewardForSettlement(executor, order, preview) {
    const sellerUserId = Number(order?.seller_id || 0)
    const orderId = Number(order?.id || 0)
    const buyerServiceFeeAmount = Math.max(0, Number(preview?.buyerServiceFeeAmount || 0))
    const rewardRatePercent = Math.max(0, Number(preview?.inviteRewardRatePercent || 0))
    if (!sellerUserId || !orderId || buyerServiceFeeAmount <= 0 || rewardRatePercent <= 0) {
      return null
    }

    const [[inviteeRow]] = await executor.execute(
      `SELECT inviter_user_id
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [sellerUserId]
    )
    const inviterUserId = Number(inviteeRow?.inviter_user_id || 0)
    if (!inviterUserId || inviterUserId === sellerUserId) {
      return null
    }

    const [[existingReward]] = await executor.execute(
      `SELECT id
       FROM invite_rewards
       WHERE order_id = ?
       LIMIT 1
       FOR UPDATE`,
      [orderId]
    )
    if (existingReward?.id) {
      return null
    }

    const rewardAmount = Math.floor(buyerServiceFeeAmount * rewardRatePercent / 100)
    if (rewardAmount <= 0) {
      return null
    }

    const [insertResult] = await executor.execute(
      `INSERT INTO invite_rewards (
        order_id, inviter_user_id, invitee_user_id, reward_rate_percent, platform_fee_amount, reward_amount, payout_status
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [
        orderId,
        inviterUserId,
        sellerUserId,
        rewardRatePercent,
        buyerServiceFeeAmount,
        rewardAmount
      ]
    )

    return {
      rewardId: Number(insertResult.insertId || 0),
      inviterUserId,
      orderId,
      rewardAmount,
      rewardRatePercent,
      buyerServiceFeeAmount
    }
  }

  async function processInviteRewardPayout(rewardInfo) {
    if (!rewardInfo || !rewardInfo.rewardId || !rewardInfo.inviterUserId) return

    const { rewardId, inviterUserId, orderId, rewardAmount } = rewardInfo

    const [[accountRow]] = await pool.execute(
      `SELECT huifu_id, bind_status
       FROM user_settlement_accounts
       WHERE user_id = ?
       LIMIT 1`,
      [inviterUserId]
    )
    if (!accountRow || String(accountRow.bind_status || '').trim() !== 'active' || !String(accountRow.huifu_id || '').trim()) {
      await creditWallet(
        pool,
        inviterUserId,
        rewardAmount,
        orderId,
        `邀新返现入账（邀请人未完成进件，暂存余额）`,
        'invite_reward'
      )
      await pool.execute(
        `UPDATE invite_rewards SET payout_status = 'wallet_credited' WHERE id = ?`,
        [rewardId]
      )
      return
    }

    try {
      const payoutResult = await createSettlementPayout({
        orderId,
        payeeUserId: inviterUserId,
        amount: rewardAmount,
        remark: '邀新返现自动打款'
      })

      const payoutNo = String(payoutResult?.payoutNo || payoutResult?.payout_no || '').trim()
      const payoutStatus = String(payoutResult?.status || 'processing').trim()
      const finalPayoutStatus = payoutStatus === 'success' ? 'paid' : 'pending'

      await pool.execute(
        `UPDATE invite_rewards
         SET payout_status = ?, payout_no = ?
         WHERE id = ?`,
        [finalPayoutStatus, payoutNo || null, rewardId]
      )
    } catch (error) {
      await creditWallet(
        pool,
        inviterUserId,
        rewardAmount,
        orderId,
        `邀新返现入账（自动打款失败，暂存余额）`,
        'invite_reward'
      )
      await pool.execute(
        `UPDATE invite_rewards SET payout_status = 'wallet_credited' WHERE id = ?`,
        [rewardId]
      )
    }
  }

  async function transitionToCancelled(executor, orderId, options = {}) {
    const markSettlementExecuted = Boolean(options?.markSettlementExecuted)
    const order = await fetchOrderById(executor, orderId)
    if (!order) return null

    await executor.execute(
      `UPDATE orders
       SET status = 'cancelled',
           settlement_status = ?,
           support_scene = 'none',
           support_status = CASE
             WHEN support_assignee_id IS NOT NULL AND support_assignee_id > 0 THEN 'resolved'
             ELSE support_status
           END,
           support_resolved_at = CASE
             WHEN support_assignee_id IS NOT NULL AND support_assignee_id > 0 THEN NOW()
             ELSE support_resolved_at
           END,
           settlement_executed_at = CASE
             WHEN ? = 1 THEN NOW()
             ELSE settlement_executed_at
           END,
           finished_at = COALESCE(finished_at, NOW()),
           cancelled_at = NOW()
       WHERE id = ?`,
      [markSettlementExecuted ? 'executed' : 'none', markSettlementExecuted ? 1 : 0, orderId]
    )

    if (Number(order.listing_id || 0) > 0) {
      await executor.execute(
        `UPDATE listings
         SET listing_status = 'active'
         WHERE id = ? AND listing_status = 'rented'`,
        [order.listing_id]
      )
    }

    return fetchOrderById(executor, orderId)
  }

  function isFundsSuccessStatus(status) {
    return String(status || '').trim() === 'success'
  }

  function isFundsProcessingStatus(status) {
    return ['pending', 'processing'].includes(String(status || '').trim())
  }

  async function fetchLatestRefundByReason(executor, orderId, reason) {
    const [rows] = await executor.execute(
      `SELECT
          id,
          refund_no,
          status,
          amount,
          reason,
          failure_reason,
          created_at,
          updated_at
       FROM payment_refunds
       WHERE order_id = ?
         AND reason = ?
       ORDER BY id DESC
       LIMIT 1`,
      [orderId, reason]
    )
    return rows[0] || null
  }

  async function fetchLatestPayoutByRemark(executor, orderId, remark) {
    const [rows] = await executor.execute(
      `SELECT
          id,
          payout_no,
          status,
          amount,
          remark,
          failure_reason,
          created_at,
          updated_at
       FROM settlement_payouts
       WHERE order_id = ?
         AND remark = ?
       ORDER BY id DESC
       LIMIT 1`,
      [orderId, remark]
    )
    return rows[0] || null
  }

  async function markOrderFundsProcessing({
    orderId,
    supportUserId,
    supportScene = 'funds_processing',
    supportNote = null,
    settlementStatus = null
  }) {
    const updates = [
      `status = 'support_handling'`,
      `support_scene = ?`,
      `support_status = 'handling'`,
      `support_assignee_id = COALESCE(support_assignee_id, ?)`,
      `support_handling_at = COALESCE(support_handling_at, NOW())`,
      `support_resolved_at = NULL`
    ]
    const params = [supportScene, Number(supportUserId || 0)]

    if (supportNote !== undefined) {
      updates.push('support_note = ?')
      params.push(supportNote || null)
    }
    if (settlementStatus) {
      updates.push('settlement_status = ?')
      params.push(settlementStatus)
    }

    params.push(orderId)
    await pool.execute(
      `UPDATE orders
       SET ${updates.join(', ')}
       WHERE id = ?`,
      params
    )
  }

  async function createOrder({ listingId, userId, buyerContactWechat }) {
    return runWithDistributedLock(
      typeof buildListingOrderLockKey === 'function' ? buildListingOrderLockKey(listingId) : '',
      '当前商品正在处理下单，请稍后再试',
      async () => {
        const conn = await pool.getConnection()
        try {
          await conn.beginTransaction()
          const [listings] = await conn.execute(
            `SELECT
              id,
              owner_user_id,
              owner_name,
              seller_contact_wechat,
              rent_price,
              deposit,
              rent_days,
              listing_status,
              hafu_coin,
              base_ratio,
              insurance_level,
              cover_image
             FROM listings WHERE id = ? LIMIT 1 FOR UPDATE`,
            [listingId]
          )

          if (!listings.length) {
            fail(404, { message: '商品不存在' })
          }

          const listing = listings[0]
          const safeBuyerContactWechat = String(buyerContactWechat || '').trim()

          if (listing.listing_status !== 'active') {
            fail(400, { message: '该商品当前不可租用' })
          }

          if (listing.owner_user_id === userId) {
            fail(400, { message: '不能租用自己发布的商品' })
          }

          const orderNo = createOrderNo()
          const businessSettings = await loadBusinessSettings(conn)
          const buyerRentPrice = calculateBuyerRentFromSellerRent(
            listing.rent_price,
            businessSettings.platformCommission?.buyerServiceFeeRatePercent
          )
          const listingTitleSnapshot = buildOrderListingTitle({
            hafuCoin: listing.hafu_coin,
            rentDays: listing.rent_days,
            insuranceLevel: listing.insurance_level,
            listingId
          })

          const [result] = await conn.execute(
            `INSERT INTO orders (
              order_no, buyer_id, seller_id, listing_id,
              seller_name, buyer_contact_wechat, seller_contact_wechat,
              listing_title, listing_cover_image, rent_days, seller_rent_amount, amount, deposit_amount,
              status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment')`,
            [
              orderNo,
              userId,
              listing.owner_user_id,
              listingId,
              listing.owner_name,
              safeBuyerContactWechat,
              String(listing.seller_contact_wechat || '').trim(),
              listingTitleSnapshot,
              listing.cover_image || null,
              listing.rent_days,
              listing.rent_price,
              buyerRentPrice,
              listing.deposit
            ]
          )

          await saveOrderItemSnapshots(conn, result.insertId, listingId, businessSettings)

          await conn.execute(
            `UPDATE listings SET listing_status = 'rented' WHERE id = ? AND listing_status = 'active'`,
            [listingId]
          )

          const newOrder = await fetchOrderById(conn, result.insertId)
          await conn.commit()
          if (typeof invalidateListingDetailCache === 'function') {
            await invalidateListingDetailCache(listingId)
          }
          return newOrder
        } catch (error) {
          await conn.rollback()
          throw error
        } finally {
          conn.release()
        }
      }
    )
  }

  async function payOrder({ orderId, userId }) {
    return runWithDistributedLock(
      typeof buildOrderLockKey === 'function' ? buildOrderLockKey(orderId) : '',
      '当前订单正在处理支付，请稍后再试',
      async () => {
        const conn = await pool.getConnection()
        try {
          await conn.beginTransaction()
          const [orders] = await conn.execute(
            `SELECT id, buyer_id, status FROM orders WHERE id = ? LIMIT 1 FOR UPDATE`,
            [orderId]
          )

          if (!orders.length) {
            fail(404, { message: '订单不存在' })
          }

          const order = orders[0]

          if (order.buyer_id !== userId) {
            fail(403, { message: '无权操作此订单' })
          }

          if (order.status !== 'pending_payment') {
            fail(400, {
              message: '当前状态不允许支付',
              currentStatus: order.status,
              statusText: orderStatusToLabel(order.status)
            })
          }

          // 安全兜底：订单置为已支付前必须存在渠道侧支付成功（paid）的支付流水。
          // payOrder 仅限支付回调/主动查单同步的内部调用链，任何路由不得直接暴露。
          const [paidTransactions] = await conn.execute(
            `SELECT id FROM payment_transactions
             WHERE order_id = ? AND user_id = ? AND status = 'paid'
             LIMIT 1`,
            [orderId, userId]
          )
          if (!paidTransactions.length) {
            fail(400, { message: '未找到已支付的支付流水，无法将订单标记为已支付' })
          }

          const supportUser = await assignSupportUser(conn)
          await conn.execute(
            `UPDATE orders
             SET status = 'paid',
                 paid_at = NOW(),
                 settlement_status = 'none',
                 support_scene = 'none',
                 support_status = 'handling',
                 support_assignee_id = ?,
                 support_handling_at = NOW()
             WHERE id = ?`,
            [supportUser.id, orderId]
          )

          const updated = await fetchOrderById(conn, orderId)
          await conn.commit()

          emitSupportDeskUpdate({
            supportUserId: supportUser.id,
            desk: 'aftersale',
            resourceId: orderId,
            reason: 'assigned'
          })

          const orderConversation = await getOrderConversationAccess(orderId, userId)
          if (orderConversation) {
            await emitOrderSystemMessage({
              order: orderConversation,
              actorUserId: userId,
              actorRole: 'buyer',
              content: `订单已支付成功，系统已自动分配客服 ${supportUser.username}，已创建买家、卖家、客服三方聊天室。`
            })
            await emitOrderSystemMessage({
              order: orderConversation,
              actorUserId: userId,
              actorRole: 'buyer',
              content: '平台温馨提示：请双方全程在平台内沟通并合规履约，勿私下交易、私下转账或绕开平台交付。若平台核实存在违规私下交易等情形，客服可按冻结资金特殊裁决处理：押金退买家、租金归平台、卖家无收益。请双方按规则完成订单，保障各自权益。'
            })
          }

          return updated
        } catch (error) {
          await conn.rollback()
          throw error
        } finally {
          conn.release()
        }
      }
    )
  }

  async function cancelOrderByBuyer({ orderId, userId }) {
    return runWithDistributedLock(
      typeof buildOrderLockKey === 'function' ? buildOrderLockKey(orderId) : '',
      '当前订单正在处理取消，请稍后再试',
      async () => {
        const [orders] = await pool.execute(
          `SELECT id, buyer_id, status, listing_id FROM orders WHERE id = ? LIMIT 1`,
          [orderId]
        )

        if (!orders.length) {
          fail(404, { message: '订单不存在' })
        }

        const order = orders[0]

        if (order.buyer_id !== userId) {
          fail(403, { message: '无权操作此订单' })
        }

        if (order.status !== 'pending_payment') {
          fail(400, {
            message: '只有待付款的订单可以取消',
            currentStatus: order.status,
            statusText: orderStatusToLabel(order.status)
          })
        }

        await pool.execute(
          `UPDATE orders SET status = 'cancelled', cancelled_at = NOW() WHERE id = ?`,
          [orderId]
        )

        if (order.listing_id) {
          await pool.execute(
            `UPDATE listings SET listing_status = 'active' WHERE id = ? AND listing_status = 'rented'`,
            [order.listing_id]
          )
          if (typeof invalidateListingDetailCache === 'function') {
            await invalidateListingDetailCache(order.listing_id)
          }
        }

        const [updated] = await pool.execute(
          `SELECT * FROM orders WHERE id = ? LIMIT 1`,
          [orderId]
        )

        return updated[0]
      }
    )
  }

  async function cancelOrderBySeller({ orderId, userId }) {
    void orderId
    void userId
    fail(403, { message: '卖家不可发起取消订单，请在聊天室联系买家或客服处理' })
  }

  async function verifyOrder({ orderId, userId }) {
    const [orders] = await pool.execute(
      `SELECT id, buyer_id, status, verified_at
       FROM orders
       WHERE id = ?
       LIMIT 1`,
      [orderId]
    )
    if (!orders.length) fail(404, { message: '订单不存在' })
    const order = orders[0]
    if (Number(order.buyer_id) !== Number(userId)) {
      fail(403, { message: '只有买家可以确认账号正常并继续履约' })
    }
    if (order.status !== 'paid') {
      fail(400, { message: '当前状态不允许确认继续履约' })
    }
    if (order.verified_at) {
      fail(400, { message: '当前订单已确认继续履约' })
    }
    await pool.execute(
      `UPDATE orders
       SET verified_at = NOW()
       WHERE id = ?`,
      [orderId]
    )
    const updated = await fetchOrderById(pool, orderId)
    const orderConversation = await getOrderConversationAccess(orderId, userId)
    await emitOrderSystemMessage({
      order: orderConversation,
      actorUserId: userId,
      actorRole: 'buyer',
      content: '买家已确认账号正常，订单继续履约，后续不可再发起取消订单。'
    })
    return updated
  }

  async function submitItemUsageReport({ orderId, userId, items, note }) {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [orders] = await conn.execute(
        `SELECT id, buyer_id, status, settlement_status
         FROM orders
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [orderId]
      )
      if (!orders.length) fail(404, { message: '订单不存在' })
      const order = orders[0]
      if (Number(order.buyer_id) !== Number(userId)) {
        fail(403, { message: '只有买家可以填报额外物品使用情况' })
      }
      if (String(order.status || '').trim() !== 'settlement_pending') {
        fail(400, { message: '当前状态不允许填报额外物品使用情况' })
      }
      // 卖家已确认后买家不得再重新申报（防止反复重置确认状态的拖延循环），变更走争议/客服通道
      if (String(order.settlement_status || '').trim() === 'seller_confirmed') {
        fail(400, { message: '卖家已确认使用情况，如需变更请让卖家发起争议或联系客服处理' })
      }

      const [snapshotRows] = await conn.execute(
        `SELECT item_key, item_name, item_mode, quantity, unit_price, buyer_unit_price, total_price
         FROM order_item_snapshots
         WHERE order_id = ?
         ORDER BY id ASC`,
        [orderId]
      )

      const snapshotMap = new Map(snapshotRows.map((row) => [row.item_key, row]))
      for (const item of items) {
        const snapshot = snapshotMap.get(item.item_key)
        if (!snapshot || snapshot.item_mode !== 'sale') continue
        const snapshotQuantity = Number(snapshot.quantity || 0)
        const quantity = Math.max(0, Math.min(snapshotQuantity, Number(item.reported_quantity || 0)))
        const sellerUnitPrice = Number(snapshot.unit_price || 0)
        // 旧订单快照无买家价（0）时按卖家价结算，行为与历史一致
        const buyerUnitPrice = resolveBuyerUnitPriceInCent(sellerUnitPrice, snapshot.buyer_unit_price)
        const totalPrice = quantity * sellerUnitPrice
        const buyerTotalPrice = quantity * buyerUnitPrice
        await conn.execute(
          `INSERT INTO order_item_usage_reports (
            order_id, item_key, snapshot_quantity, reported_quantity, reported_total_price, buyer_total_price,
            buyer_note, buyer_reported_by, buyer_reported_at, seller_confirmed, seller_confirmed_by, seller_confirmed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), 0, NULL, NULL)
          ON DUPLICATE KEY UPDATE
            snapshot_quantity = VALUES(snapshot_quantity),
            reported_quantity = VALUES(reported_quantity),
            reported_total_price = VALUES(reported_total_price),
            buyer_total_price = VALUES(buyer_total_price),
            buyer_note = VALUES(buyer_note),
            buyer_reported_by = VALUES(buyer_reported_by),
            buyer_reported_at = NOW(),
            seller_confirmed = 0,
            seller_confirmed_by = NULL,
            seller_confirmed_at = NULL`,
          [
            orderId,
            item.item_key,
            snapshotQuantity,
            quantity,
            totalPrice,
            buyerTotalPrice,
            note || null,
            userId
          ]
        )
      }

      const preview = await buildSettlementPreview(conn, orderId)
      await upsertSettlement(conn, orderId, preview, 'draft')
      await conn.execute(
        `UPDATE orders
         SET settlement_status = 'buyer_reported',
             buyer_item_reported_at = NOW()
         WHERE id = ?`,
        [orderId]
      )

      await conn.commit()
      const updated = await fetchOrderById(pool, orderId)
      const orderConversation = await getOrderConversationAccess(orderId, userId)
      await emitOrderSystemMessage({
        order: orderConversation,
        actorUserId: userId,
        actorRole: 'buyer',
        content: '买家已提交额外物品使用表单，等待卖家确认。'
      })
      return updated
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }

  async function confirmItemUsageBySeller({ orderId, userId }) {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [orders] = await conn.execute(
        `SELECT id, seller_id, status, buyer_item_reported_at
         FROM orders
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [orderId]
      )
      if (!orders.length) fail(404, { message: '订单不存在' })
      const order = orders[0]
      if (Number(order.seller_id || 0) !== Number(userId)) {
        fail(403, { message: '只有卖家可以确认额外物品使用情况' })
      }
      if (order.status !== 'settlement_pending') {
        fail(400, { message: '当前状态不允许确认额外物品使用情况' })
      }
      if (!order.buyer_item_reported_at) {
        const saleSnapshotCount = await countSaleSnapshotItems(conn, orderId)
        if (saleSnapshotCount > 0) {
          fail(400, { message: '买家尚未提交额外物品使用表单' })
        }
        await conn.execute(
          `UPDATE orders
           SET settlement_status = 'buyer_reported',
               buyer_item_reported_at = NOW()
           WHERE id = ?`,
          [orderId]
        )
      }

      await conn.execute(
        `UPDATE order_item_usage_reports
         SET seller_confirmed = 1,
             seller_confirmed_by = ?,
             seller_confirmed_at = NOW()
         WHERE order_id = ?`,
        [userId, orderId]
      )
      const preview = await buildSettlementPreview(conn, orderId)
      await upsertSettlement(conn, orderId, preview, 'draft')
      await conn.execute(
        `UPDATE orders
         SET settlement_status = 'seller_confirmed',
             seller_item_confirmed_at = NOW()
         WHERE id = ?`,
        [orderId]
      )
      await conn.commit()
      const updated = await fetchOrderById(pool, orderId)
      const orderConversation = await getOrderConversationAccess(orderId, userId)
      await emitOrderSystemMessage({
        order: orderConversation,
        actorUserId: userId,
        actorRole: 'seller',
        content: '卖家已确认额外物品使用情况，当前客服可执行分账。'
      })
      return updated
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }

  async function rejectItemUsageBySeller({ orderId, userId, note = '' }) {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [orders] = await conn.execute(
        `SELECT id, seller_id, status, buyer_item_reported_at
         FROM orders
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [orderId]
      )
      if (!orders.length) fail(404, { message: '订单不存在' })
      const order = orders[0]
      if (Number(order.seller_id || 0) !== Number(userId)) {
        fail(403, { message: '只有卖家可以发起结算争议' })
      }
      if (order.status !== 'settlement_pending') {
        fail(400, { message: '当前状态不允许发起结算争议' })
      }
      if (!order.buyer_item_reported_at) {
        fail(400, { message: '买家尚未提交额外物品使用表单' })
      }

      await conn.execute(
        `UPDATE orders
         SET status = 'support_handling',
             support_scene = 'settlement_dispute',
             settlement_status = 'buyer_reported',
             support_status = 'handling',
             support_requested_at = NOW(),
             support_requested_by = ?,
             support_note = ?,
             seller_item_confirmed_at = NULL
         WHERE id = ?`,
        [userId, note || null, orderId]
      )

      await conn.execute(
        `UPDATE order_item_usage_reports
         SET seller_confirmed = 0,
             seller_confirmed_by = NULL,
             seller_confirmed_at = NULL
         WHERE order_id = ?`,
        [orderId]
      )

      await conn.commit()
      const updated = await fetchOrderById(pool, orderId)
      const orderConversation = await getOrderConversationAccess(orderId, userId)
      await emitOrderSystemMessage({
        order: orderConversation,
        actorUserId: userId,
        actorRole: 'seller',
        content: `卖家不同意当前额外物品表单，订单已转接客服处理。${note ? `说明：${note}` : ''}`.trim()
      })
      return updated
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }

  /**
   * 结算超时仲裁（后台周期任务，由 startRecurringJobs 驱动）：
   * - 买家超时未申报额外物品使用 → 订单转入客服仲裁（settlement_dispute），
   *   不自动判零/判满，由客服依据聊天记录与凭证裁量
   * - 买家已申报、卖家超时既不确认也不争议 → 视为确认买家申报（超时默认同意），
   *   重建结算草稿并通知客服可执行分账
   * 时长由环境变量 SETTLEMENT_BUYER_REPORT_TIMEOUT_HOURS / SETTLEMENT_SELLER_CONFIRM_TIMEOUT_HOURS 配置。
   */
  async function arbitrateSettlementTimeouts() {
    const buyerTimeoutHours = Math.max(1, Number(process.env.SETTLEMENT_BUYER_REPORT_TIMEOUT_HOURS || 24) || 24)
    const sellerTimeoutHours = Math.max(1, Number(process.env.SETTLEMENT_SELLER_CONFIRM_TIMEOUT_HOURS || 48) || 48)
    const summary = { buyerTimeoutArbitrated: 0, sellerTimeoutConfirmed: 0, autoEnteredSettlement: 0, autoVerifiedOrders: 0 }

    // 生命周期自动化生效日期：仅处理该日期之后支付的订单（测试期遗留单排除）。
    // 只约束 Case C/D 两个自动推进入口；已进入结算流程的订单照常受超时约束。
    const lifecycleCutoff = /^\d{4}-\d{2}-\d{2}$/.test(String(process.env.ORDER_LIFECYCLE_EFFECTIVE_FROM || '').trim())
      ? String(process.env.ORDER_LIFECYCLE_EFFECTIVE_FROM).trim()
      : ''

    // Case D：支付后 N 小时买家仍未「确认账号正常，继续履约」→ 系统自动确认，
    // 视为自支付起租用（verified_at 回溯为 paid_at，租期不因拖延重新起算）；
    // 自动确认后买家失去自助取消入口，问题账号走客服异常处理
    const autoVerifyHours = Math.max(1, Number(process.env.ORDER_AUTO_VERIFY_AFTER_PAID_HOURS ?? 48) || 48)
    const [autoVerifyRows] = await pool.execute(
      `SELECT id, buyer_id
       FROM orders
       WHERE status = 'paid'
         AND verified_at IS NULL
         AND paid_at IS NOT NULL
         AND paid_at < NOW() - INTERVAL ${autoVerifyHours} HOUR
         AND (? = '' OR paid_at > ?)
       LIMIT 50`,
      [lifecycleCutoff, lifecycleCutoff]
    )
    for (const row of autoVerifyRows) {
      const [result] = await pool.execute(
        `UPDATE orders
         SET verified_at = paid_at
         WHERE id = ? AND status = 'paid' AND verified_at IS NULL`,
        [row.id]
      )
      if (Number(result?.affectedRows || 0) > 0) {
        summary.autoVerifiedOrders += 1
        const updated = await fetchOrderById(pool, row.id)
        await emitOrderSystemMessage({
          order: updated,
          actorUserId: row.buyer_id,
          actorRole: 'buyer',
          content: `买家支付后超过 ${autoVerifyHours} 小时未确认账号状态，系统已自动确认继续履约。如账号存在问题，请立即联系客服发起异常处理。`
        }).catch(() => {})
      }
    }

    // Case A：买家超时未申报（仅存在销售类快照项的订单需要申报）
    const [buyerTimeoutRows] = await pool.execute(
      `SELECT id, buyer_id
       FROM orders
       WHERE status = 'settlement_pending'
         AND buyer_item_reported_at IS NULL
         AND settlement_status NOT IN ('buyer_reported', 'seller_confirmed')
         AND settlement_requested_at IS NOT NULL
         AND settlement_requested_at < NOW() - INTERVAL ${buyerTimeoutHours} HOUR
         AND EXISTS (
           SELECT 1 FROM order_item_snapshots s
           WHERE s.order_id = orders.id AND s.item_mode = 'sale'
         )
       LIMIT 50`
    )
    for (const row of buyerTimeoutRows) {
      const [result] = await pool.execute(
        `UPDATE orders
         SET status = 'support_handling',
             support_scene = 'settlement_dispute',
             support_status = 'handling',
             support_requested_at = NOW(),
             support_requested_by = NULL,
             support_note = ?
         WHERE id = ? AND status = 'settlement_pending' AND buyer_item_reported_at IS NULL`,
        [`买家超过 ${buyerTimeoutHours} 小时未提交额外物品使用表单，系统自动转客服仲裁`, row.id]
      )
      if (Number(result?.affectedRows || 0) > 0) {
        summary.buyerTimeoutArbitrated += 1
        const updated = await fetchOrderById(pool, row.id)
        await emitOrderSystemMessage({
          order: updated,
          actorUserId: row.buyer_id,
          actorRole: 'buyer',
          content: `买家超过 ${buyerTimeoutHours} 小时未提交额外物品使用表单，订单已自动转客服仲裁，请客服依据聊天记录与凭证处理押金结算。`
        }).catch(() => {})
      }
    }

    // Case B：卖家超时未处理买家申报 → 视为确认
    const [sellerTimeoutRows] = await pool.execute(
      `SELECT id, buyer_id, seller_id
       FROM orders
       WHERE status = 'settlement_pending'
         AND settlement_status = 'buyer_reported'
         AND seller_item_confirmed_at IS NULL
         AND buyer_item_reported_at IS NOT NULL
         AND buyer_item_reported_at < NOW() - INTERVAL ${sellerTimeoutHours} HOUR
       LIMIT 50`
    )
    for (const row of sellerTimeoutRows) {
      const conn = await pool.getConnection()
      try {
        await conn.beginTransaction()
        const [orders] = await conn.execute(
          `SELECT id FROM orders
           WHERE id = ? AND status = 'settlement_pending'
             AND settlement_status = 'buyer_reported'
             AND seller_item_confirmed_at IS NULL
           LIMIT 1 FOR UPDATE`,
          [row.id]
        )
        if (!orders.length) {
          await conn.rollback()
          continue
        }
        await conn.execute(
          `UPDATE order_item_usage_reports
           SET seller_confirmed = 1,
               seller_confirmed_by = NULL,
               seller_confirmed_at = NOW()
           WHERE order_id = ?`,
          [row.id]
        )
        const preview = await buildSettlementPreview(conn, row.id)
        await upsertSettlement(conn, row.id, preview, 'draft')
        await conn.execute(
          `UPDATE orders
           SET settlement_status = 'seller_confirmed',
               seller_item_confirmed_at = NOW()
           WHERE id = ?`,
          [row.id]
        )
        await conn.commit()
        summary.sellerTimeoutConfirmed += 1
        const updated = await fetchOrderById(pool, row.id)
        await emitOrderSystemMessage({
          order: updated,
          actorUserId: row.seller_id || row.buyer_id,
          actorRole: 'seller',
          content: `卖家超过 ${sellerTimeoutHours} 小时未处理买家提交的额外物品表单，系统已视为确认买家申报，客服可执行分账。`
        }).catch(() => {})
      } catch (error) {
        await conn.rollback()
        throw error
      } finally {
        conn.release()
      }
    }

    // Case C：租期（verified_at + rent_days）结束后 N 天买家仍未申请结算 → 自动进入结算流程，
    // 之后自然落入 Case A/B 的申报与确认超时（仅处理买家已确认账号正常的订单）
    const autoEnterDays = Math.max(0, Number(process.env.SETTLEMENT_AUTO_ENTER_AFTER_RENT_END_DAYS ?? 3) || 3)
    const [autoEnterRows] = await pool.execute(
      `SELECT id, buyer_id
       FROM orders
       WHERE status = 'paid'
         AND verified_at IS NOT NULL
         AND settlement_requested_at IS NULL
         AND DATE_ADD(DATE_ADD(verified_at, INTERVAL rent_days DAY), INTERVAL ${autoEnterDays} DAY) < NOW()
         AND (? = '' OR paid_at > ?)
       LIMIT 50`,
      [lifecycleCutoff, lifecycleCutoff]
    )
    for (const row of autoEnterRows) {
      const saleSnapshotCount = await countSaleSnapshotItems(pool, row.id)
      const nextSettlementStatus = saleSnapshotCount > 0 ? 'none' : 'buyer_reported'
      const buyerReportedSql = saleSnapshotCount > 0 ? 'buyer_item_reported_at' : 'NOW()'
      const [result] = await pool.execute(
        `UPDATE orders
         SET status = 'settlement_pending',
             settlement_status = ?,
             settlement_requested_at = NOW(),
             support_scene = 'none',
             buyer_item_reported_at = ${buyerReportedSql}
         WHERE id = ? AND status = 'paid'`,
        [nextSettlementStatus, row.id]
      )
      if (Number(result?.affectedRows || 0) > 0) {
        summary.autoEnteredSettlement += 1
        const updated = await fetchOrderById(pool, row.id)
        await emitOrderSystemMessage({
          order: updated,
          actorUserId: row.buyer_id,
          actorRole: 'buyer',
          content: `租期已结束超过 ${autoEnterDays} 天，买家未申请结算，系统已自动进入结算流程。请买家在申报期限内完成额外物品使用表单（或确认无使用），随后由卖家确认。`
        }).catch(() => {})
      }
    }

    return summary
  }

  async function confirmFinish({ orderId, userId }) {
    const [orders] = await pool.execute(
      `SELECT id, buyer_id, status, verified_at
       FROM orders
       WHERE id = ?
       LIMIT 1`,
      [orderId]
    )
    if (!orders.length) fail(404, { message: '订单不存在' })
    const order = orders[0]
    if (Number(order.buyer_id) !== Number(userId)) {
      fail(403, { message: '只有买家可以申请进入结算流程' })
    }
    if (String(order.status || '').trim() !== 'paid') {
      fail(400, { message: '当前状态不允许申请结算' })
    }

    const saleSnapshotCount = await countSaleSnapshotItems(pool, orderId)
    const nextSettlementStatus = saleSnapshotCount > 0 ? 'none' : 'buyer_reported'
    const buyerReportedSql = saleSnapshotCount > 0 ? 'buyer_item_reported_at' : 'NOW()'
    await pool.execute(
      `UPDATE orders
       SET status = 'settlement_pending',
           settlement_status = ?,
           settlement_requested_at = NOW(),
           support_scene = 'none',
           verified_at = COALESCE(verified_at, NOW()),
           buyer_item_reported_at = ${buyerReportedSql}
       WHERE id = ?`,
      [nextSettlementStatus, orderId]
    )
    const updated = await fetchOrderById(pool, orderId)
    const orderConversation = await getOrderConversationAccess(orderId, userId)
    await emitOrderSystemMessage({
      order: orderConversation,
      actorUserId: userId,
      actorRole: 'buyer',
      content: saleSnapshotCount > 0
        ? '买家已申请进入结算流程，当前由客服监督买家填报和卖家确认额外物品。'
        : '买家已申请进入结算流程，本单无出售类额外物品，卖家可直接确认后由客服执行分账。'
    })
    return updated
  }

  async function requestCancel({ orderId, userId, reason }) {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [orders] = await conn.execute(
        `SELECT id, buyer_id, seller_id, status, verified_at
         FROM orders
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [orderId]
      )
      if (!orders.length) fail(404, { message: '订单不存在' })
      const order = orders[0]
      const isBuyer = Number(order.buyer_id) === Number(userId)
      if (!isBuyer) {
        fail(403, { message: '无权发起取消申请' })
      }
      if (String(order.status || '').trim() !== 'paid') {
        fail(400, { message: '当前状态不允许发起取消申请' })
      }
      if (order.verified_at) {
        fail(400, { message: '买家已确认账号正常并继续履约，当前不可再取消订单' })
      }

      await conn.execute(
        `UPDATE orders
         SET status = 'support_handling',
             support_scene = 'cancel_request',
             cancel_requested_by = ?,
             cancel_requested_at = NOW(),
             cancel_reason = ?,
             support_status = 'handling',
             support_requested_at = NOW(),
             support_requested_by = ?,
             support_note = NULL
         WHERE id = ?`,
        [userId, reason || null, userId, orderId]
      )
      await conn.commit()
      const updated = await fetchOrderById(pool, orderId)
      const orderConversation = await getOrderConversationAccess(orderId, userId)
      await emitOrderSystemMessage({
        order: orderConversation,
        actorUserId: userId,
        actorRole: 'buyer',
        content: `买家已发起取消订单申请${reason ? `，原因：${reason}` : ''}，订单已转接客服处理。`
      })
      return updated
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }

  async function respondCancel({ orderId, userId, agree }) {
    void orderId
    void userId
    void agree
    fail(400, { message: '当前流程下取消订单仅由客服处理' })
  }

  async function reportMismatch({ orderId, userId, note }) {
    return requestCancel({ orderId, userId, reason: note })
  }

  async function executeSettlement({ orderId, supportUserId, payoutMode = 'huifu', manualNote = '' }) {
    return runWithDistributedLock(
      typeof buildOrderLockKey === 'function' ? buildOrderLockKey(orderId) : '',
      '当前订单正在执行分账，请稍后再试',
      async () => {
        let order = null
        let preview = null
        let isFrozenSettlement = false
        let isRegularSettlement = false
        let isManualPayout = String(payoutMode || '').trim() === 'manual'
        let manualPayoutNote = String(manualNote || '').trim().slice(0, 500)
        const conn = await pool.getConnection()
        try {
          await conn.beginTransaction()
          const [orders] = await conn.execute(
            `SELECT id, status, support_scene, amount, deposit_amount, buyer_id, seller_id, listing_id, support_assignee_id, seller_item_confirmed_at
             FROM orders
             WHERE id = ?
             LIMIT 1
             FOR UPDATE`,
            [orderId]
          )
          if (!orders.length) fail(404, { message: '订单不存在' })
          order = orders[0]
          if (Number(order.support_assignee_id || 0) !== Number(supportUserId)) {
            fail(403, { message: '只有当前负责客服可以执行分账' })
          }

          const orderStatus = String(order.status || '').trim()
          const supportScene = String(order.support_scene || '').trim()
          isFrozenSettlement = orderStatus === 'support_handling'
            && ['fund_frozen', 'frozen_funds_processing'].includes(supportScene)
          isRegularSettlement = orderStatus === 'settlement_pending'
            || (orderStatus === 'support_handling' && supportScene === 'settlement_funds_processing')

          if (!isRegularSettlement && !isFrozenSettlement) {
            fail(400, { message: '当前状态不允许执行分账' })
          }
          if (isRegularSettlement && !order.seller_item_confirmed_at) {
            fail(400, { message: '卖家确认额外物品后，才可执行分账' })
          }

          // 手动结单仅适用于普通结算：冻结裁决卖家无收益，无需线下收款
          if (isManualPayout && !isRegularSettlement) {
            fail(400, { message: '手动结单仅适用于普通结算流程，冻结资金订单请按冻结规则执行分账' })
          }

          // 对账收口等重入场景不携带 payoutMode，以已持久化的模式为准，
          // 避免手动结单后的退款确认重入时再次尝试给未进件卖家打款
          const [[settlementRow]] = await conn.execute(
            `SELECT payout_mode, manual_payout_note
             FROM order_settlements
             WHERE order_id = ?
             LIMIT 1`,
            [orderId]
          )
          if (String(settlementRow?.payout_mode || '').trim() === 'manual') {
            isManualPayout = true
            // 重入不携带备注时保留已留痕的手动结单备注，避免被空值覆盖
            if (!manualPayoutNote && settlementRow?.manual_payout_note) {
              manualPayoutNote = String(settlementRow.manual_payout_note).slice(0, 500)
            }
          }

          if (isRegularSettlement && !isManualPayout && Number(order.seller_id || 0) > 0) {
            const [sellerAccounts] = await conn.execute(
              `SELECT bind_status, huifu_id, acct_id
               FROM user_settlement_accounts
               WHERE user_id = ?
               LIMIT 1`,
              [Number(order.seller_id)]
            )
            const sellerAccount = sellerAccounts[0] || null
            if (!sellerAccount
              || String(sellerAccount.bind_status || '').trim() !== 'active'
              || !String(sellerAccount.huifu_id || '').trim()
              || !String(sellerAccount.acct_id || '').trim()) {
              fail(400, { message: '卖家尚未完成个人进件与绑卡（收款账号未配置或未启用），无法执行分账。如卖家无法进件，请使用手动结单，由客服线下联系卖家收款' })
            }
          }

          preview = isFrozenSettlement
            ? buildFrozenFundsSettlementPreview(order)
            : await buildSettlementPreview(conn, orderId)
          await upsertSettlement(conn, orderId, preview, 'draft', supportUserId, {
            payoutMode: isManualPayout ? 'manual' : 'huifu',
            manualPayoutNote: manualPayoutNote
          })
          await conn.execute(
            `UPDATE orders
             SET status = 'support_handling',
                 settlement_status = CASE
                   WHEN ? = 1 THEN 'seller_confirmed'
                   ELSE settlement_status
                 END,
                 support_scene = ?,
                 support_status = 'handling',
                 support_note = ?,
                 support_resolved_at = NULL,
                 settlement_executed_at = NULL
             WHERE id = ?`,
            [
              isRegularSettlement ? 1 : 0,
              isFrozenSettlement ? 'frozen_funds_processing' : 'settlement_funds_processing',
              isManualPayout
                ? '客服已发起手动结单：买家押金原路退回待支付通道确认，卖家结算款需客服线下联系卖家支付。'
                : '客服已发起资金处理，等待支付通道确认。',
              orderId
            ]
          )
          await conn.commit()
        } catch (error) {
          await conn.rollback()
          throw error
        } finally {
          conn.release()
        }

        const buyerRefundReason = isFrozenSettlement
          ? '客服执行冻结资金结算-押金原路退回'
          : '客服执行结算-押金原路退回'
        const sellerPayoutRemark = '客服执行结算-卖家余额支付'
        const needsRefund = Number(preview?.buyerRefundAmount || 0) > 0
        const needsPayout = !isFrozenSettlement && !isManualPayout && Number(order?.seller_id || 0) > 0 && Number(preview?.sellerIncomeAmount || 0) > 0

        let refundResult = needsRefund ? await fetchLatestRefundByReason(pool, orderId, buyerRefundReason) : null
        let payoutResult = needsPayout ? await fetchLatestPayoutByRemark(pool, orderId, sellerPayoutRemark) : null

        try {
          if (needsRefund && !(isFundsSuccessStatus(refundResult?.status) || isFundsProcessingStatus(refundResult?.status))) {
            if (typeof createOrderRefund !== 'function') {
              fail(500, { message: '退款服务尚未就绪，请稍后重试' })
            }
            refundResult = await createOrderRefund({
              orderId,
              userId: Number(order?.buyer_id || 0),
              amount: Number(preview?.buyerRefundAmount || 0),
              refundType: 'partial',
              reason: buyerRefundReason
            })
          }

          if (needsPayout && !(isFundsSuccessStatus(payoutResult?.status) || isFundsProcessingStatus(payoutResult?.status))) {
            if (typeof createSettlementPayout !== 'function') {
              fail(500, { message: '余额支付服务尚未就绪，请稍后重试' })
            }
            payoutResult = await createSettlementPayout({
              orderId,
              payeeUserId: Number(order?.seller_id || 0),
              amount: Number(preview?.sellerIncomeAmount || 0),
              remark: sellerPayoutRemark
            })
          }
        } catch (error) {
          console.error('[executeSettlement] funds processing failed:', {
            orderId,
            needsRefund,
            needsPayout,
            refundStatus: refundResult?.status,
            payoutStatus: payoutResult?.status,
            errorMessage: error?.body?.message || error?.message || String(error)
          })
          await markOrderFundsProcessing({
            orderId,
            supportUserId,
            supportScene: isFrozenSettlement ? 'frozen_funds_processing' : 'settlement_funds_processing',
            supportNote: `资金处理发起失败：${error?.body?.message || error?.message || '请稍后重试'}`
          })
          throw error
        }

        const refundSuccess = !needsRefund || isFundsSuccessStatus(refundResult?.status)
        const payoutSuccess = !needsPayout || isFundsSuccessStatus(payoutResult?.status)

        if (!refundSuccess || !payoutSuccess) {
          const processingNotes = []
          if (needsRefund) {
            processingNotes.push(refundSuccess ? '买家退款已完成' : '买家退款处理中')
          }
          if (needsPayout) {
            processingNotes.push(payoutSuccess ? '卖家打款已完成' : '卖家打款处理中')
          }
          await markOrderFundsProcessing({
            orderId,
            supportUserId,
            supportScene: isFrozenSettlement ? 'frozen_funds_processing' : 'settlement_funds_processing',
            supportNote: `客服已发起资金处理，等待支付通道确认。${processingNotes.join('，')}。`
          })
          const updated = await fetchOrderById(pool, orderId)
          const orderConversation = await getOrderConversationAccess(orderId, supportUserId, 'support')
          await emitOrderSystemMessage({
            order: orderConversation,
            actorUserId: supportUserId,
            actorRole: 'support',
            content: isFrozenSettlement
              ? '客服已按冻结资金规则发起资金处理：押金将原路退回买家，租金归平台，等待支付通道确认结果。'
              : (isManualPayout
                ? '客服已发起手动结单资金处理：买家将原路收到退款，卖家结算款将由客服线下联系支付，当前等待支付通道确认结果。'
                : '客服已发起订单资金处理：买家将原路收到退款，卖家将收到平台余额支付打款，当前等待支付通道确认结果。')
          })
          return updated
        }

        const finalizeConn = await pool.getConnection()
        let pendingRewardInfo = null
        try {
          await finalizeConn.beginTransaction()
          await upsertSettlement(finalizeConn, orderId, preview, 'executed', supportUserId, {
            payoutMode: isManualPayout ? 'manual' : 'huifu',
            manualPayoutNote: manualPayoutNote
          })
          if (!isFrozenSettlement) {
            pendingRewardInfo = await awardInviteRewardForSettlement(finalizeConn, order, preview)
          }
          await finalizeConn.execute(
            `UPDATE orders
             SET status = 'completed',
                 settlement_status = 'executed',
                 support_scene = CASE
                   WHEN ? = 1 THEN 'fund_frozen'
                   ELSE 'none'
                 END,
                 support_status = 'resolved',
                 support_note = NULL,
                 support_origin_status = NULL,
                 support_resolved_at = NOW(),
                 settlement_executed_at = NOW(),
                 finished_at = NOW()
             WHERE id = ?`,
            [isFrozenSettlement ? 1 : 0, orderId]
          )
          if (Number(order.listing_id || 0) > 0) {
            await finalizeConn.execute(
              `UPDATE listings
               SET listing_status = 'sold_out'
               WHERE id = ? AND listing_status = 'rented'`,
              [order.listing_id]
            )
          }
          await finalizeConn.commit()
        } catch (error) {
          await finalizeConn.rollback()
          throw error
        } finally {
          finalizeConn.release()
        }

        if (pendingRewardInfo) {
          try {
            await processInviteRewardPayout(pendingRewardInfo)
          } catch (_payoutError) {
            // 返现打款失败不影响订单完成
          }
        }

        if (Number(order.listing_id || 0) > 0 && typeof invalidateListingDetailCache === 'function') {
          await invalidateListingDetailCache(order.listing_id)
        }
        const updated = await fetchOrderById(pool, orderId)
        const orderConversation = await getOrderConversationAccess(orderId, supportUserId, 'support')
        await emitOrderSystemMessage({
          order: orderConversation,
          actorUserId: supportUserId,
          actorRole: 'support',
          content: isFrozenSettlement
            ? '客服已按冻结资金规则完成结算：押金已原路退回买家，买家支付租金计入平台收益，卖家无收益。'
            : (isManualPayout
              ? '客服已完成手动结单：买家退款已原路退回，卖家结算款将由客服线下联系支付。'
              : '客服已完成结算：买家退款已原路退回，卖家结算款已通过余额支付发起/到账。')
        })
        return updated
      }
    )
  }

  async function cancelOrderBySupport({ orderId, supportUserId, note = '' }) {
    return runWithDistributedLock(
      typeof buildOrderLockKey === 'function' ? buildOrderLockKey(orderId) : '',
      '当前订单正在处理取消，请稍后再试',
      async () => {
        let order = null
        let settlementPreview = null
        const conn = await pool.getConnection()
        try {
          await conn.beginTransaction()
          const [orders] = await conn.execute(
            `SELECT id, status, support_scene, amount, deposit_amount, buyer_id, support_status, support_assignee_id
             FROM orders
             WHERE id = ?
             LIMIT 1
             FOR UPDATE`,
            [orderId]
          )
          if (!orders.length) fail(404, { message: '订单不存在' })
          order = orders[0]
          const cancelScene = String(order.support_scene || '').trim()
          if (String(order.status || '').trim() !== 'support_handling' || !['cancel_request', 'cancel_refund_processing'].includes(cancelScene)) {
            fail(400, { message: '当前订单不在客服可取消的取消处理中状态' })
          }
          if (Number(order.support_assignee_id || 0) !== Number(supportUserId)) {
            fail(403, { message: '只有当前负责客服可以取消该订单' })
          }

          settlementPreview = buildFullRefundSettlementPreview(order)
          await upsertSettlement(conn, orderId, settlementPreview, 'draft', supportUserId)
          await conn.execute(
            `UPDATE orders
             SET support_note = ?,
                 support_scene = 'cancel_refund_processing',
                 support_status = 'handling',
                 cancel_reason = COALESCE(NULLIF(cancel_reason, ''), '客服确认取消订单')
             WHERE id = ?`,
            [note || '客服已发起原路退款，等待支付通道确认。', orderId]
          )
          await conn.commit()
        } catch (error) {
          await conn.rollback()
          throw error
        } finally {
          conn.release()
        }

        const refundReason = '客服取消订单-原路退款'
        let refundResult = await fetchLatestRefundByReason(pool, orderId, refundReason)

        try {
          if (!(isFundsSuccessStatus(refundResult?.status) || isFundsProcessingStatus(refundResult?.status))) {
            if (typeof createOrderRefund !== 'function') {
              fail(500, { message: '退款服务尚未就绪，请稍后重试' })
            }
            refundResult = await createOrderRefund({
              orderId,
              userId: Number(order?.buyer_id || 0),
              amount: Number(settlementPreview?.buyerRefundAmount || 0),
              refundType: 'full',
              reason: refundReason
            })
          }
        } catch (error) {
          await markOrderFundsProcessing({
            orderId,
            supportUserId,
            supportScene: 'cancel_refund_processing',
            supportNote: `原路退款发起失败：${error?.body?.message || error?.message || '请稍后重试'}`
          })
          throw error
        }

        if (!isFundsSuccessStatus(refundResult?.status)) {
          await markOrderFundsProcessing({
            orderId,
            supportUserId,
            supportScene: 'cancel_refund_processing',
            supportNote: '客服已发起原路退款，等待支付通道确认结果。'
          })
          const updated = await fetchOrderById(pool, orderId)
          const orderConversation = await getOrderConversationAccess(orderId, supportUserId, 'support')
          await emitSupportEvent({
            orderId,
            actorUserId: supportUserId,
            actorRole: 'support',
            actorName: orderConversation?.support_assignee_name || '',
            eventType: 'note_updated',
            note: '客服已发起原路退款，等待支付通道确认结果。',
            conversationOrder: orderConversation
          })
          return updated
        }

        const finalizeConn = await pool.getConnection()
        let cancelledOrder = null
        try {
          await finalizeConn.beginTransaction()
          await upsertSettlement(finalizeConn, orderId, settlementPreview, 'executed', supportUserId)
          await finalizeConn.execute(
            `UPDATE orders
             SET support_note = ?,
                 cancel_reason = COALESCE(NULLIF(cancel_reason, ''), '客服确认取消订单')
             WHERE id = ?`,
            [note || '客服已取消订单，退款原路退回买家。', orderId]
          )
          cancelledOrder = await transitionToCancelled(finalizeConn, orderId, { markSettlementExecuted: true })
          await finalizeConn.commit()
        } catch (error) {
          await finalizeConn.rollback()
          throw error
        } finally {
          finalizeConn.release()
        }
        if (Number(cancelledOrder?.listing_id || 0) > 0 && typeof invalidateListingDetailCache === 'function') {
          await invalidateListingDetailCache(cancelledOrder.listing_id)
        }

        const updated = await fetchOrderById(pool, orderId)
        const orderConversation = await getOrderConversationAccess(orderId, supportUserId, 'support')
        await emitSupportEvent({
          orderId,
          actorUserId: supportUserId,
          actorRole: 'support',
          actorName: orderConversation?.support_assignee_name || '',
          eventType: 'cancelled',
          note: note || '客服已取消订单，并已将款项原路退回买家。',
          conversationOrder: orderConversation
        })
        return updated
      }
    )
  }

  async function safeEmitAdminOrderEvent(orderId, adminUserId, adminName, eventType, note) {
    if (typeof emitSupportEvent !== 'function') return
    try {
      let orderConversation = null
      if (typeof getOrderConversationAccess === 'function') {
        try {
          orderConversation = await getOrderConversationAccess(orderId, adminUserId, 'support')
        } catch (_error) {
          orderConversation = null
        }
      }
      await emitSupportEvent({
        orderId,
        actorUserId: adminUserId,
        actorRole: 'admin',
        actorName: adminName || '管理员',
        eventType,
        note,
        conversationOrder: orderConversation
      })
    } catch (_error) {
      // 管理员关单事件推送失败不阻塞资金流转
    }
  }

  async function finalizeAdminCloseRefund({ orderId }) {
    const order = await fetchOrderById(pool, orderId)
    if (!order) fail(404, { message: '订单不存在' })
    const settlementPreview = buildFullRefundSettlementPreview(order)
    const conn = await pool.getConnection()
    let cancelledOrder = null
    try {
      await conn.beginTransaction()
      await upsertSettlement(conn, orderId, settlementPreview, 'executed')
      cancelledOrder = await transitionToCancelled(conn, orderId, { markSettlementExecuted: true })
      await conn.commit()
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
    if (Number(cancelledOrder?.listing_id || 0) > 0 && typeof invalidateListingDetailCache === 'function') {
      await invalidateListingDetailCache(cancelledOrder.listing_id)
    }
    const finalized = await fetchOrderById(pool, orderId)
    await safeEmitAdminOrderEvent(orderId, 0, '资金对账', 'cancelled', '原路退款已到账，订单已关闭。')
    return finalized
  }

  async function markAdminCloseProcessing({ orderId, supportNote = null }) {
    await pool.execute(
      `UPDATE orders
       SET status = 'support_handling',
           support_scene = 'admin_close_refund_processing',
           support_status = 'handling',
           support_assignee_id = 0,
           support_handling_at = COALESCE(support_handling_at, NOW()),
           support_resolved_at = NULL,
           support_note = ?
       WHERE id = ?`,
      [supportNote || null, orderId]
    )
  }

  async function closeOrderAsAdmin({ orderId, adminUserId, adminName = '', reason = '' }) {
    return runWithDistributedLock(
      typeof buildOrderLockKey === 'function' ? buildOrderLockKey(orderId) : '',
      '当前订单正在关闭，请稍后再试',
      async () => {
        let order = null
        let isPaidOrder = false
        let settlementPreview = null

        const conn = await pool.getConnection()
        try {
          await conn.beginTransaction()
          const [orders] = await conn.execute(
            `SELECT id, status, amount, deposit_amount, buyer_id, listing_id
             FROM orders
             WHERE id = ?
             LIMIT 1
             FOR UPDATE`,
            [orderId]
          )
          if (!orders.length) fail(404, { message: '订单不存在' })
          order = orders[0]
          if (['cancelled', 'completed', 'refunded'].includes(String(order.status || '').trim())) {
            fail(400, { message: '已完成、已退款或已关闭的订单不支持后台关闭' })
          }

          const [paidRows] = await conn.execute(
            `SELECT 1 FROM payment_transactions WHERE order_id = ? AND status = 'paid' LIMIT 1`,
            [orderId]
          )
          isPaidOrder = paidRows.length > 0

          if (isPaidOrder) {
            settlementPreview = buildFullRefundSettlementPreview(order)
            await upsertSettlement(conn, orderId, settlementPreview, 'draft')
            await conn.execute(
              `UPDATE orders
               SET cancel_reason = COALESCE(NULLIF(cancel_reason, ''), ?)
               WHERE id = ?`,
              [reason || '管理员后台关单，原路退款买家', orderId]
            )
          }
          await conn.commit()
        } catch (error) {
          await conn.rollback()
          throw error
        } finally {
          conn.release()
        }

        if (!isPaidOrder) {
          if (typeof closeOrderPayment !== 'function') {
            fail(500, { message: '关单服务尚未就绪，请稍后重试' })
          }
          const closeResult = await closeOrderPayment({ orderId, operatorUserId: adminUserId })
          const cancelledOrder = await transitionToCancelled(pool, orderId, { markSettlementExecuted: false })
          if (Number(cancelledOrder?.listing_id || 0) > 0 && typeof invalidateListingDetailCache === 'function') {
            await invalidateListingDetailCache(cancelledOrder.listing_id)
          }
          await safeEmitAdminOrderEvent(
            orderId, adminUserId, adminName, 'cancelled',
            closeResult?.skipped ? '管理员后台关闭订单。' : '管理员后台关闭订单，已通知汇付关单。'
          )
          return { order: await fetchOrderById(pool, orderId), outcome: 'closed', refundStatus: null }
        }

        const refundReason = '管理员后台关单-原路退款'
        let refundResult = await fetchLatestRefundByReason(pool, orderId, refundReason)
        try {
          if (!(isFundsSuccessStatus(refundResult?.status) || isFundsProcessingStatus(refundResult?.status))) {
            if (typeof createOrderRefund !== 'function') {
              fail(500, { message: '退款服务尚未就绪，请稍后重试' })
            }
            refundResult = await createOrderRefund({
              orderId,
              userId: Number(order.buyer_id || 0),
              amount: Number(settlementPreview?.buyerRefundAmount || 0),
              refundType: 'full',
              reason: refundReason
            })
          }
        } catch (error) {
          await markAdminCloseProcessing({
            orderId,
            supportNote: `原路退款发起失败：${error?.body?.message || error?.message || '请稍后重试'}`
          })
          throw error
        }

        if (!isFundsSuccessStatus(refundResult?.status)) {
          await markAdminCloseProcessing({
            orderId,
            supportNote: '管理员后台关单，原路退款处理中，到账后自动取消订单。'
          })
          await safeEmitAdminOrderEvent(
            orderId, adminUserId, adminName, 'note_updated',
            '管理员后台关单，原路退款处理中，到账后自动取消订单。'
          )
          return { order: await fetchOrderById(pool, orderId), outcome: 'refund_processing', refundStatus: 'processing' }
        }

        const cancelledOrder = await finalizeAdminCloseRefund({ orderId })
        await safeEmitAdminOrderEvent(
          orderId, adminUserId, adminName, 'cancelled',
          '管理员后台关单，已将款项原路退回买家。'
        )
        return { order: cancelledOrder, outcome: 'refund_success', refundStatus: 'success' }
      }
    )
  }

  async function continueOrderBySupport({ orderId, supportUserId, note = '' }) {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [orders] = await conn.execute(
        `SELECT id, status, support_scene, support_assignee_id
         FROM orders
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [orderId]
      )
      if (!orders.length) fail(404, { message: '订单不存在' })
      const order = orders[0]
      if (String(order.status || '').trim() !== 'support_handling' || String(order.support_scene || '').trim() !== 'cancel_request') {
        fail(400, { message: '当前订单不在可继续履约的取消处理中状态' })
      }
      if (Number(order.support_assignee_id || 0) !== Number(supportUserId)) {
        fail(403, { message: '只有当前负责客服可以继续履约' })
      }

      await conn.execute(
        `UPDATE orders
         SET status = 'paid',
             support_scene = 'none',
             cancel_requested_by = NULL,
             cancel_requested_at = NULL,
             cancel_reason = NULL,
             support_note = ?
         WHERE id = ?`,
        [note || null, orderId]
      )
      await conn.commit()

      const updated = await fetchOrderById(pool, orderId)
      const orderConversation = await getOrderConversationAccess(orderId, supportUserId, 'support')
      await emitOrderSystemMessage({
        order: orderConversation,
        actorUserId: supportUserId,
        actorRole: 'support',
        content: `客服已确认订单继续履约，订单已恢复为已支付状态。${note ? `说明：${note}` : ''}`.trim()
      })
      return updated
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }

  async function returnToSettlementBySupport({ orderId, supportUserId, note = '' }) {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [orders] = await conn.execute(
        `SELECT id, status, support_scene, support_assignee_id
         FROM orders
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [orderId]
      )
      if (!orders.length) fail(404, { message: '订单不存在' })
      const order = orders[0]
      if (String(order.status || '').trim() !== 'support_handling' || String(order.support_scene || '').trim() !== 'settlement_dispute') {
        fail(400, { message: '当前订单不在可返回结算中的争议处理状态' })
      }
      if (Number(order.support_assignee_id || 0) !== Number(supportUserId)) {
        fail(403, { message: '只有当前负责客服可以将订单退回结算中' })
      }

      await conn.execute(
        `UPDATE orders
         SET status = 'settlement_pending',
             settlement_requested_at = NOW(),
             buyer_item_reported_at = CASE
               WHEN settlement_status = 'buyer_reported' THEN NOW()
               ELSE buyer_item_reported_at
             END,
             support_scene = 'none',
             support_note = ?
         WHERE id = ?`,
        [note || null, orderId]
      )
      await conn.commit()

      const updated = await fetchOrderById(pool, orderId)
      const orderConversation = await getOrderConversationAccess(orderId, supportUserId, 'support')
      await emitOrderSystemMessage({
        order: orderConversation,
        actorUserId: supportUserId,
        actorRole: 'support',
        content: `客服已处理结算争议，订单已返回结算中，请买家按沟通结果修改表单后继续。${note ? `说明：${note}` : ''}`.trim()
      })
      return updated
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }

  async function freezeFundsBySupport({ orderId, supportUserId, freezeReason = '' }) {
    return runWithDistributedLock(
      typeof buildOrderLockKey === 'function' ? buildOrderLockKey(orderId) : '',
      '当前订单正在处理冻结资金，请稍后再试',
      async () => {
        const conn = await pool.getConnection()
        try {
          await conn.beginTransaction()
          const [orders] = await conn.execute(
            `SELECT id, status, support_scene, support_assignee_id
             FROM orders
             WHERE id = ?
             LIMIT 1
             FOR UPDATE`,
            [orderId]
          )
          if (!orders.length) fail(404, { message: '订单不存在' })
          const order = orders[0]
          if (!['paid', 'settlement_pending'].includes(String(order.status || '').trim())) {
            fail(400, { message: '当前订单状态不允许冻结资金' })
          }
          if (Number(order.support_assignee_id || 0) !== Number(supportUserId)) {
            fail(403, { message: '只有当前负责客服可以冻结该订单资金' })
          }
          if (String(order.support_scene || '').trim() === 'fund_frozen') {
            fail(400, { message: '当前订单资金已处于冻结状态' })
          }
          if (!String(freezeReason || '').trim()) {
            fail(400, { message: '请输入冻结原因' })
          }

          await conn.execute(
            `UPDATE orders
             SET status = 'support_handling',
                 support_scene = 'fund_frozen',
                 support_origin_status = ?,
                 support_freeze_reason = ?,
                 support_requested_at = NOW(),
                 support_requested_by = ?,
                 support_resolved_at = NULL
             WHERE id = ?`,
            [order.status, freezeReason || null, supportUserId, orderId]
          )
          await conn.commit()

          const updated = await fetchOrderById(pool, orderId)
          const orderConversation = await getOrderConversationAccess(orderId, supportUserId, 'support')
          await emitSupportEvent({
            orderId,
            actorUserId: supportUserId,
            actorRole: 'support',
            actorName: orderConversation?.support_assignee_name || '',
            eventType: 'funds_frozen',
            note: freezeReason || '检测到疑似私下交易，已临时冻结订单资金。',
            conversationOrder: orderConversation
          })
          return updated
        } catch (error) {
          await conn.rollback()
          throw error
        } finally {
          conn.release()
        }
      }
    )
  }

  async function releaseFrozenFundsBySupport({ orderId, supportUserId, note = '' }) {
    return runWithDistributedLock(
      typeof buildOrderLockKey === 'function' ? buildOrderLockKey(orderId) : '',
      '当前订单正在处理解除冻结，请稍后再试',
      async () => {
        const conn = await pool.getConnection()
        try {
          await conn.beginTransaction()
          const [orders] = await conn.execute(
            `SELECT id, status, support_scene, support_origin_status, support_assignee_id
             FROM orders
             WHERE id = ?
             LIMIT 1
             FOR UPDATE`,
            [orderId]
          )
          if (!orders.length) fail(404, { message: '订单不存在' })
          const order = orders[0]
          if (String(order.status || '').trim() !== 'support_handling' || String(order.support_scene || '').trim() !== 'fund_frozen') {
            fail(400, { message: '当前订单不在资金冻结状态' })
          }
          if (Number(order.support_assignee_id || 0) !== Number(supportUserId)) {
            fail(403, { message: '只有当前负责客服可以解除冻结' })
          }

          const restoreStatus = String(order.support_origin_status || '').trim()
          if (!['paid', 'settlement_pending'].includes(restoreStatus)) {
            fail(400, { message: '当前订单缺少有效的冻结前状态，暂时无法解除冻结' })
          }

          await conn.execute(
            `UPDATE orders
             SET status = ?,
                 support_scene = 'none',
                 support_origin_status = NULL,
                 support_freeze_reason = NULL,
                 support_note = ?,
                 support_resolved_at = NULL
             WHERE id = ?`,
            [restoreStatus, note || null, orderId]
          )
          await conn.commit()

          const updated = await fetchOrderById(pool, orderId)
          const orderConversation = await getOrderConversationAccess(orderId, supportUserId, 'support')
          await emitSupportEvent({
            orderId,
            actorUserId: supportUserId,
            actorRole: 'support',
            actorName: orderConversation?.support_assignee_name || '',
            eventType: 'funds_released',
            note: note || '平台已核实情况，解除订单资金冻结。',
            conversationOrder: orderConversation
          })
          return updated
        } catch (error) {
          await conn.rollback()
          throw error
        } finally {
          conn.release()
        }
      }
    )
  }

  return {
    createOrder,
    payOrder,
    cancelOrderByBuyer,
    cancelOrderBySeller,
    verifyOrder,
    submitItemUsageReport,
    confirmItemUsageBySeller,
    rejectItemUsageBySeller,
    arbitrateSettlementTimeouts,
    confirmFinish,
    requestCancel,
    respondCancel,
    reportMismatch,
    executeSettlement,
    cancelOrderBySupport,
    closeOrderAsAdmin,
    finalizeAdminCloseRefund,
    continueOrderBySupport,
    returnToSettlementBySupport,
    freezeFundsBySupport,
    releaseFrozenFundsBySupport,
    buildSettlementPreview: async (orderId) => buildSettlementPreview(pool, orderId)
  }
}
