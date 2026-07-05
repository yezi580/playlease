/**
 * 订单生命周期流程逻辑，处理支付超时、结算与状态变更。
 */

import { getSaleItemDisplayName } from '../../constants/saleItems.js'
import {
  calculateBuyerRentFromSellerRent,
  calculateCompensationFeeAmount,
  calculateSellerIncomeRent,
  calculateServiceFeeFromSellerRent,
  loadBusinessSettings
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
  emitSupportEvent
}) {
  const createOrderNo = typeof generateOrderNo === 'function' ? generateOrderNo : buildDefaultOrderNo
  const INVITE_REWARD_RATE_PERCENT = 5

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

  async function saveOrderItemSnapshots(executor, orderId, listingId) {
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

    for (const row of itemsRows) {
      await executor.execute(
        `INSERT INTO order_item_snapshots (
          order_id, item_key, item_name, item_mode, quantity, unit_price, total_price
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          item_name = VALUES(item_name),
          item_mode = VALUES(item_mode),
          quantity = VALUES(quantity),
          unit_price = VALUES(unit_price),
          total_price = VALUES(total_price)`,
        [
          orderId,
          row.item_key,
          getSaleItemDisplayName(row.item_key, row.item_name),
          row.item_mode || 'sale',
          Number(row.quantity || 0),
          Number(row.unit_price || 0),
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

    const [[usageRow]] = await executor.execute(
      `SELECT COALESCE(SUM(reported_total_price), 0) AS used_items_amount
       FROM order_item_usage_reports
       WHERE order_id = ?`,
      [orderId]
    )

    const buyerRentAmount = Number(order.amount || 0)
    const depositAmount = Number(order.deposit_amount || 0)
    const usedItemsAmount = Number(usageRow?.used_items_amount || 0)
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
    const platformFeeAmount = calculateServiceFeeFromSellerRent(
      sellerRentAmount,
      sellerServiceFeeRatePercent
    )
    const compensationFeeAmount = calculateCompensationFeeAmount(
      sellerRentAmount,
      listingRow?.compensation_plan,
      businessSettings
    )
    const sellerIncomeAmount = Math.max(
      0,
      calculateSellerIncomeRent(sellerRentAmount, sellerServiceFeeRatePercent) - compensationFeeAmount
    ) + usedItemsAmount
    const buyerRefundAmount = Math.max(0, depositAmount - usedItemsAmount)

    return {
      rentAmount: sellerRentAmount,
      buyerRentAmount,
      sellerRentAmount,
      depositAmount,
      usedItemsAmount,
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

  async function upsertSettlement(executor, orderId, preview, status = 'draft', supportUserId = null) {
    await executor.execute(
      `INSERT INTO order_settlements (
        order_id,
        rent_amount,
        deposit_amount,
        used_items_amount,
        platform_fee_amount,
        seller_income_amount,
        buyer_refund_amount,
        status,
        executed_by_support_id,
        executed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        rent_amount = VALUES(rent_amount),
        deposit_amount = VALUES(deposit_amount),
        used_items_amount = VALUES(used_items_amount),
        platform_fee_amount = VALUES(platform_fee_amount),
        seller_income_amount = VALUES(seller_income_amount),
        buyer_refund_amount = VALUES(buyer_refund_amount),
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
    const platformFeeAmount = Math.max(0, Number(preview?.platformFeeAmount || 0))
    if (!sellerUserId || !orderId || platformFeeAmount <= 0) {
      return
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
      return
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
      return
    }

    const rewardAmount = Math.floor(platformFeeAmount * INVITE_REWARD_RATE_PERCENT / 100)
    if (rewardAmount <= 0) {
      return
    }

    await creditWallet(
      executor,
      inviterUserId,
      rewardAmount,
      orderId,
      `邀新返现入账（平台收益的 ${INVITE_REWARD_RATE_PERCENT}%）`,
      'invite_reward'
    )
    await executor.execute(
      `INSERT INTO invite_rewards (
        order_id, inviter_user_id, invitee_user_id, reward_rate_percent, platform_fee_amount, reward_amount
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        inviterUserId,
        sellerUserId,
        INVITE_REWARD_RATE_PERCENT,
        platformFeeAmount,
        rewardAmount
      ]
    )
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

  async function createOrder({ listingId, userId }) {
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
              seller_name, listing_title, listing_cover_image, rent_days, seller_rent_amount, amount, deposit_amount,
              status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment')`,
            [
              orderNo,
              userId,
              listing.owner_user_id,
              listingId,
              listing.owner_name,
              listingTitleSnapshot,
              listing.cover_image || null,
              listing.rent_days,
              listing.rent_price,
              buyerRentPrice,
              listing.deposit
            ]
          )

          await saveOrderItemSnapshots(conn, result.insertId, listingId)

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
        `SELECT id, buyer_id, status
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

      const [snapshotRows] = await conn.execute(
        `SELECT item_key, item_name, item_mode, quantity, unit_price, total_price
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
        const totalPrice = quantity * Number(snapshot.unit_price || 0)
        await conn.execute(
          `INSERT INTO order_item_usage_reports (
            order_id, item_key, snapshot_quantity, reported_quantity, reported_total_price,
            buyer_note, buyer_reported_by, buyer_reported_at, seller_confirmed, seller_confirmed_by, seller_confirmed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 0, NULL, NULL)
          ON DUPLICATE KEY UPDATE
            snapshot_quantity = VALUES(snapshot_quantity),
            reported_quantity = VALUES(reported_quantity),
            reported_total_price = VALUES(reported_total_price),
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

  async function executeSettlement({ orderId, supportUserId }) {
    return runWithDistributedLock(
      typeof buildOrderLockKey === 'function' ? buildOrderLockKey(orderId) : '',
      '当前订单正在执行分账，请稍后再试',
      async () => {
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
          const order = orders[0]
          if (Number(order.support_assignee_id || 0) !== Number(supportUserId)) {
            fail(403, { message: '只有当前负责客服可以执行分账' })
          }

          const orderStatus = String(order.status || '').trim()
          const supportScene = String(order.support_scene || '').trim()
          const isFrozenSettlement = orderStatus === 'support_handling' && supportScene === 'fund_frozen'
          const isRegularSettlement = orderStatus === 'settlement_pending'

          if (!isRegularSettlement && !isFrozenSettlement) {
            fail(400, { message: '当前状态不允许执行分账' })
          }
          if (isRegularSettlement && !order.seller_item_confirmed_at) {
            fail(400, { message: '卖家确认额外物品后，才可执行分账' })
          }

          const preview = isFrozenSettlement
            ? buildFrozenFundsSettlementPreview(order)
            : await buildSettlementPreview(conn, orderId)
          await upsertSettlement(conn, orderId, preview, 'executed', supportUserId)
          await creditWallet(conn, order.buyer_id, preview.buyerRefundAmount, orderId, '订单押金退回')
          if (Number(order.seller_id || 0) > 0) {
            await creditWallet(conn, Number(order.seller_id), preview.sellerIncomeAmount, orderId, '订单结算入账')
          }
          if (!isFrozenSettlement) {
            await awardInviteRewardForSettlement(conn, order, preview)
          }
          await conn.execute(
            `UPDATE orders
             SET status = 'completed',
                 settlement_status = 'executed',
                 support_scene = CASE
                   WHEN ? = 1 THEN 'fund_frozen'
                   ELSE 'none'
                 END,
                 support_status = 'resolved',
                 support_origin_status = NULL,
                 support_resolved_at = NOW(),
                 settlement_executed_at = NOW(),
                 finished_at = NOW()
             WHERE id = ?`,
            [isFrozenSettlement ? 1 : 0, orderId]
          )
          if (Number(order.listing_id || 0) > 0) {
            await conn.execute(
              `UPDATE listings
               SET listing_status = 'active'
               WHERE id = ? AND listing_status = 'rented'`,
              [order.listing_id]
            )
          }
          await conn.commit()
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
              ? '客服已按冻结资金规则执行分账：押金已全额退回买家，买家支付租金计入平台收益，卖家无收益。'
              : '客服已执行分账，订单已完成，资金已分别计入买家和卖家钱包。'
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

  async function cancelOrderBySupport({ orderId, supportUserId, note = '' }) {
    return runWithDistributedLock(
      typeof buildOrderLockKey === 'function' ? buildOrderLockKey(orderId) : '',
      '当前订单正在处理取消，请稍后再试',
      async () => {
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
          const order = orders[0]
          if (String(order.status || '').trim() !== 'support_handling' || String(order.support_scene || '').trim() !== 'cancel_request') {
            fail(400, { message: '当前订单不在客服可取消的取消处理中状态' })
          }
          if (Number(order.support_assignee_id || 0) !== Number(supportUserId)) {
            fail(403, { message: '只有当前负责客服可以取消该订单' })
          }

          const settlementPreview = buildFullRefundSettlementPreview(order)
          await upsertSettlement(conn, orderId, settlementPreview, 'executed', supportUserId)
          await creditWallet(conn, Number(order.buyer_id || 0), settlementPreview.buyerRefundAmount, orderId, '订单取消全额退款')
          await conn.execute(
            `UPDATE orders
             SET support_note = ?,
                 cancel_reason = COALESCE(NULLIF(cancel_reason, ''), '客服确认取消订单')
             WHERE id = ?`,
            [note || null, orderId]
          )

          const cancelledOrder = await transitionToCancelled(conn, orderId, { markSettlementExecuted: true })
          await conn.commit()
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
            note: note || '客服已取消订单，并按规则全额退款处理。',
            conversationOrder: orderConversation
          })
          await emitOrderSystemMessage({
            order: orderConversation,
            actorUserId: supportUserId,
            actorRole: 'support',
            content: '客服已取消本订单，并按规则执行全额退款处理。'
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
    confirmFinish,
    requestCancel,
    respondCancel,
    reportMismatch,
    executeSettlement,
    cancelOrderBySupport,
    continueOrderBySupport,
    returnToSettlementBySupport,
    freezeFundsBySupport,
    releaseFrozenFundsBySupport,
    buildSettlementPreview: async (orderId) => buildSettlementPreview(pool, orderId)
  }
}
