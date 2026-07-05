/*作用：支付和提现的核心业务服务层。
* 现在用途：
* 创建平台支付流水
* 处理支付回调
* 同步订单支付状态
* 创建提现申请
* 管理员审核提现
* 处理提现回调
* 更新钱包余额、冻结金额、流水记录
* 它是“业务中台层”，上面接路由，下面接 provider 和数据库。
*/

import crypto from 'crypto'

export class PaymentServiceError extends Error {
  constructor(status, body) {
    super(body?.message || '支付服务异常')
    this.name = 'PaymentServiceError'
    this.status = status
    this.body = body
  }
}

function fail(status, body) {
  throw new PaymentServiceError(status, body)
}

function createBusinessNo(prefix = 'TXN') {
  const timestamp = new Date()
  const datePart = [
    timestamp.getFullYear(),
    String(timestamp.getMonth() + 1).padStart(2, '0'),
    String(timestamp.getDate()).padStart(2, '0'),
    String(timestamp.getHours()).padStart(2, '0'),
    String(timestamp.getMinutes()).padStart(2, '0'),
    String(timestamp.getSeconds()).padStart(2, '0')
  ].join('')
  const randomPart = crypto.randomBytes(4).toString('hex')
  return `${prefix}${datePart}${randomPart}`.toUpperCase()
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value ?? null)
  } catch (_error) {
    return JSON.stringify({ stringifyFailed: true })
  }
}

function safeJsonParse(value, fallback = null) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch (_error) {
    return fallback
  }
}

function maskAccountNo(value = '') {
  const normalized = String(value || '').trim()
  if (normalized.length <= 8) return normalized
  return `${normalized.slice(0, 4)}****${normalized.slice(-4)}`
}

function normalizePaymentCallbackStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (['success', 'paid', 'trade_success', 'succeeded'].includes(normalized)) return 'paid'
  if (['failed', 'fail', 'error'].includes(normalized)) return 'failed'
  if (['cancelled', 'canceled', 'closed'].includes(normalized)) return 'cancelled'
  return 'pending'
}

function normalizeWithdrawCallbackStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (['success', 'paid', 'finished', 'succeeded'].includes(normalized)) return 'success'
  if (['failed', 'fail', 'rejected'].includes(normalized)) return 'failed'
  if (['processing', 'pending', 'accepted'].includes(normalized)) return 'processing'
  return 'processing'
}

async function ensureWalletAccount(executor, userId) {
  await executor.execute(
    `INSERT INTO wallet_accounts (user_id, balance, frozen_balance)
     VALUES (?, 0, 0)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
    [userId]
  )
}

async function getWalletAccountForUpdate(executor, userId) {
  await ensureWalletAccount(executor, userId)
  const [[row]] = await executor.execute(
    `SELECT user_id, balance, frozen_balance
     FROM wallet_accounts
     WHERE user_id = ?
     LIMIT 1
     FOR UPDATE`,
    [userId]
  )
  return row || { user_id: userId, balance: 0, frozen_balance: 0 }
}

async function appendWalletLedger(executor, payload = {}) {
  await executor.execute(
    `INSERT INTO wallet_ledger (
      user_id,
      order_id,
      business_type,
      direction,
      amount,
      balance_before,
      balance_after,
      remark
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(payload.userId || 0),
      payload.orderId ? Number(payload.orderId) : null,
      String(payload.businessType || 'system').trim() || 'system',
      String(payload.direction || 'credit').trim() === 'debit' ? 'debit' : 'credit',
      Math.max(0, Number(payload.amount || 0) || 0),
      Math.max(0, Number(payload.balanceBefore || 0) || 0),
      Math.max(0, Number(payload.balanceAfter || 0) || 0),
      String(payload.remark || '').trim() || null
    ]
  )
}

async function fetchPaymentTransactionByNo(executor, transactionNo) {
  const [rows] = await executor.execute(
    `SELECT
        id,
        transaction_no,
        user_id,
        order_id,
        business_type,
        channel,
        provider,
        subject,
        amount,
        status,
        business_sync_status,
        business_sync_message,
        provider_trade_no,
        provider_payload,
        paid_at,
        expires_at,
        created_at,
        updated_at
     FROM payment_transactions
     WHERE transaction_no = ?
     LIMIT 1`,
    [String(transactionNo || '').trim()]
  )
  return rows[0] || null
}

async function fetchWithdrawRequestById(executor, withdrawRequestId) {
  const [rows] = await executor.execute(
    `SELECT
        id,
        request_no,
        user_id,
        channel,
        provider,
        amount,
        fee_amount,
        net_amount,
        status,
        account_name,
        account_no_masked,
        account_snapshot_json,
        provider_request_id,
        provider_payload,
        remark,
        failure_reason,
        reviewed_by_user_id,
        reviewed_at,
        paid_at,
        created_at,
        updated_at
     FROM wallet_withdraw_requests
     WHERE id = ?
     LIMIT 1`,
    [Number(withdrawRequestId || 0)]
  )
  return rows[0] || null
}

async function fetchWithdrawRequestByNo(executor, requestNo) {
  const [rows] = await executor.execute(
    `SELECT
        id,
        request_no,
        user_id,
        channel,
        provider,
        amount,
        fee_amount,
        net_amount,
        status,
        account_name,
        account_no_masked,
        account_snapshot_json,
        provider_request_id,
        provider_payload,
        remark,
        failure_reason,
        reviewed_by_user_id,
        reviewed_at,
        paid_at,
        created_at,
        updated_at
     FROM wallet_withdraw_requests
     WHERE request_no = ?
     LIMIT 1`,
    [String(requestNo || '').trim()]
  )
  return rows[0] || null
}

export function createPaymentService(config = {}) {
  const {
    pool,
    orderLifecycleService,
    paymentProvider
  } = config

  function buildTransactionResult(row) {
    return {
      ...row,
      provider_payload: safeJsonParse(row?.provider_payload, null)
    }
  }

  async function syncPaymentTransactionWithProvider(transaction = {}) {
    const transactionNo = String(transaction?.transaction_no || '').trim()
    const status = String(transaction?.status || '').trim().toLowerCase()
    if (!transactionNo || !['created', 'pending'].includes(status)) {
      return buildTransactionResult(transaction)
    }
    if (typeof paymentProvider?.queryPaymentOrder !== 'function') {
      return buildTransactionResult(transaction)
    }

    const queryResult = await paymentProvider.queryPaymentOrder({
      transactionNo,
      channel: transaction.channel,
      provider: transaction.provider
    })
    if (!queryResult?.ok) {
      return buildTransactionResult(transaction)
    }
    if (String(queryResult.status || '').trim().toLowerCase() === 'pending') {
      return {
        ...buildTransactionResult(transaction),
        provider_query_status: 'pending'
      }
    }

    return handlePaymentCallback({
      channel: transaction.channel,
      transactionNo,
      providerTradeNo: queryResult.providerTradeNo,
      status: queryResult.status,
      rawPayload: queryResult.rawResponse || queryResult
    })
  }

  async function updatePaymentBusinessSync(transactionNo, payload = {}) {
    await pool.execute(
      `UPDATE payment_transactions
       SET business_sync_status = ?,
           business_sync_message = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE transaction_no = ?`,
      [
        String(payload.businessSyncStatus || 'pending').trim() || 'pending',
        String(payload.businessSyncMessage || '').trim() || null,
        String(transactionNo || '').trim()
      ]
    )
  }

  async function syncOrderPayment(transaction = {}) {
    const orderId = Number(transaction.order_id || 0)
    const userId = Number(transaction.user_id || 0)
    const transactionNo = String(transaction.transaction_no || '').trim()

    if (!orderId || !userId || !transactionNo) {
      return {
        businessSyncStatus: 'synced',
        businessSyncMessage: '无关联业务单据'
      }
    }

    try {
      await orderLifecycleService.payOrder({
        orderId,
        userId
      })
      const syncResult = {
        businessSyncStatus: 'synced',
        businessSyncMessage: '订单支付状态已同步'
      }
      await updatePaymentBusinessSync(transactionNo, syncResult)
      return syncResult
    } catch (error) {
      const currentStatus = String(error?.body?.currentStatus || '').trim()
      if (currentStatus === 'paid') {
        const syncResult = {
          businessSyncStatus: 'synced',
          businessSyncMessage: '订单已处于已支付状态'
        }
        await updatePaymentBusinessSync(transactionNo, syncResult)
        return syncResult
      }

      const syncResult = {
        businessSyncStatus: 'failed',
        businessSyncMessage: String(error?.body?.message || error?.message || '业务状态同步失败').slice(0, 255)
      }
      await updatePaymentBusinessSync(transactionNo, syncResult)
      return syncResult
    }
  }

  async function createOrderPayment(payload = {}) {
    const orderId = Number(payload.orderId || 0)
    const userId = Number(payload.userId || 0)
    const channel = String(payload.channel || 'online').trim().toLowerCase() || 'online'

    if (!orderId || !userId) {
      fail(400, { message: '订单信息不完整' })
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [orders] = await conn.execute(
        `SELECT id, order_no, buyer_id, listing_title, status, amount, deposit_amount
         FROM orders
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [orderId]
      )
      if (!orders.length) {
        fail(404, { message: '订单不存在' })
      }

      const order = orders[0]
      if (Number(order.buyer_id) !== userId) {
        fail(403, { message: '无权为此订单发起支付' })
      }
      if (String(order.status || '') !== 'pending_payment') {
        fail(400, {
          message: '当前订单状态不允许重新拉起支付',
          currentStatus: order.status
        })
      }

      const [existingRows] = await conn.execute(
        `SELECT
            id,
            transaction_no,
            user_id,
            order_id,
            business_type,
            channel,
            provider,
            subject,
            amount,
            status,
            business_sync_status,
            business_sync_message,
            provider_trade_no,
            provider_payload,
            paid_at,
            expires_at,
            created_at,
            updated_at
         FROM payment_transactions
         WHERE order_id = ?
           AND user_id = ?
           AND status IN ('created', 'pending')
         ORDER BY id DESC
         LIMIT 1
         FOR UPDATE`,
        [orderId, userId]
      )

      if (existingRows.length) {
        await conn.commit()
        return {
          ...existingRows[0],
          provider_payload: safeJsonParse(existingRows[0].provider_payload, null)
        }
      }

      const transactionNo = createBusinessNo('PAY')
      const amount = Number(order.amount || 0) + Number(order.deposit_amount || 0)
      const providerResult = await paymentProvider.createPaymentOrder({
        transactionNo,
        channel,
        amount,
        orderId,
        subject: order.listing_title || order.order_no || `订单#${orderId}`,
        payerUserId: userId
      })

      if (!providerResult?.ok) {
        fail(502, { message: providerResult?.message || '支付渠道下单失败' })
      }

      await conn.execute(
        `INSERT INTO payment_transactions (
          transaction_no,
          user_id,
          order_id,
          business_type,
          channel,
          provider,
          subject,
          amount,
          status,
          business_sync_status,
          business_sync_message,
          provider_trade_no,
          provider_payload,
          expires_at
        ) VALUES (?, ?, ?, 'order_payment', ?, ?, ?, ?, ?, 'pending', '等待支付回调', ?, ?, ?)`,
        [
          transactionNo,
          userId,
          orderId,
          channel,
          String(providerResult.provider || paymentProvider.mode || 'mock_payment').trim() || 'mock_payment',
          String(order.listing_title || order.order_no || `订单#${orderId}`).trim(),
          amount,
          String(providerResult.status || 'pending').trim() || 'pending',
          String(providerResult.providerTradeNo || '').trim() || null,
          safeJsonStringify(providerResult),
          providerResult.expiresAt || null
        ]
      )

      const transaction = await fetchPaymentTransactionByNo(conn, transactionNo)
      await conn.commit()
      return {
        ...transaction,
        provider_payload: safeJsonParse(transaction?.provider_payload, null)
      }
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }

  async function getPaymentTransactionDetail(payload = {}) {
    const transactionNo = String(payload.transactionNo || '').trim()
    const userId = Number(payload.userId || 0)
    if (!transactionNo || !userId) {
      fail(400, { message: '支付流水号无效' })
    }

    const transaction = await fetchPaymentTransactionByNo(pool, transactionNo)
    if (!transaction) {
      fail(404, { message: '支付流水不存在' })
    }
    if (Number(transaction.user_id) !== userId) {
      fail(403, { message: '无权查看此支付流水' })
    }
    return syncPaymentTransactionWithProvider(transaction)
  }

  async function closePaymentTransaction(payload = {}) {
    const transactionNo = String(payload.transactionNo || '').trim()
    const userId = Number(payload.userId || 0)
    if (!transactionNo || !userId) {
      fail(400, { message: '支付流水号无效' })
    }

    let transaction = await fetchPaymentTransactionByNo(pool, transactionNo)
    if (!transaction) {
      fail(404, { message: '支付流水不存在' })
    }
    if (Number(transaction.user_id) !== userId) {
      fail(403, { message: '无权关闭此支付流水' })
    }

    if (String(transaction.status || '').trim() === 'paid') {
      fail(400, { message: '支付已完成，不能关闭当前支付流水' })
    }
    if (['cancelled', 'failed'].includes(String(transaction.status || '').trim())) {
      return buildTransactionResult(transaction)
    }

    transaction = await syncPaymentTransactionWithProvider(transaction)
    if (String(transaction.status || '').trim() === 'paid') {
      return transaction
    }
    if (['cancelled', 'failed'].includes(String(transaction.status || '').trim())) {
      return transaction
    }

    let providerPayload = transaction.provider_payload || null
    if (typeof paymentProvider?.closePaymentOrder === 'function') {
      const closeResult = await paymentProvider.closePaymentOrder({
        transactionNo,
        channel: transaction.channel,
        provider: transaction.provider
      })
      if (!closeResult?.ok) {
        fail(502, { message: closeResult?.message || '关闭支付订单失败' })
      }
      providerPayload = closeResult.rawResponse || closeResult
    }

    await pool.execute(
      `UPDATE payment_transactions
       SET status = 'cancelled',
           provider_payload = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE transaction_no = ?
         AND status IN ('created', 'pending')`,
      [
        safeJsonStringify(providerPayload),
        transactionNo
      ]
    )

    const updatedTransaction = await fetchPaymentTransactionByNo(pool, transactionNo)
    return buildTransactionResult(updatedTransaction)
  }

  async function handlePaymentCallback(payload = {}) {
    const transactionNo = String(payload.transactionNo || '').trim()
    const providerTradeNo = String(payload.providerTradeNo || '').trim()
    const callbackStatus = normalizePaymentCallbackStatus(payload.status)
    const callbackPayload = payload.rawPayload ?? payload

    if (!transactionNo) {
      fail(400, { message: '支付流水号不能为空' })
    }

    const conn = await pool.getConnection()
    let transaction = null
    try {
      await conn.beginTransaction()
      transaction = await fetchPaymentTransactionByNo(conn, transactionNo)
      if (!transaction) {
        fail(404, { message: '支付流水不存在' })
      }

      if (String(transaction.status || '') === 'paid') {
        await conn.commit()
        const syncResult = await syncOrderPayment(transaction)
        return {
          ...transaction,
          provider_payload: safeJsonParse(transaction.provider_payload, null),
          ...syncResult
        }
      }

      await conn.execute(
        `UPDATE payment_transactions
         SET status = ?,
             provider_trade_no = COALESCE(?, provider_trade_no),
             provider_payload = ?,
             paid_at = CASE WHEN ? = 'paid' THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
             updated_at = CURRENT_TIMESTAMP
         WHERE transaction_no = ?`,
        [
          callbackStatus,
          providerTradeNo || null,
          safeJsonStringify(callbackPayload),
          callbackStatus,
          transactionNo
        ]
      )

      transaction = await fetchPaymentTransactionByNo(conn, transactionNo)
      await conn.commit()
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }

    let syncResult = {
      businessSyncStatus: String(transaction?.business_sync_status || 'pending').trim() || 'pending',
      businessSyncMessage: String(transaction?.business_sync_message || '').trim()
    }
    if (callbackStatus === 'paid') {
      syncResult = await syncOrderPayment(transaction)
    }

    return {
      ...transaction,
      provider_payload: safeJsonParse(transaction?.provider_payload, null),
      ...syncResult
    }
  }

  async function getUserWithdrawList(payload = {}) {
    const userId = Number(payload.userId || 0)
    const [rows] = await pool.execute(
      `SELECT
          id,
          request_no,
          user_id,
          channel,
          provider,
          amount,
          fee_amount,
          net_amount,
          status,
          account_name,
          account_no_masked,
          provider_request_id,
          remark,
          failure_reason,
          reviewed_by_user_id,
          reviewed_at,
          paid_at,
          created_at,
          updated_at
       FROM wallet_withdraw_requests
       WHERE user_id = ?
       ORDER BY id DESC
       LIMIT 100`,
      [userId]
    )
    return rows
  }

  async function getAdminWithdrawList(payload = {}) {
    const status = String(payload.status || '').trim().toLowerCase()
    const params = []
    let whereSql = ''
    if (status) {
      whereSql = 'WHERE wr.status = ?'
      params.push(status)
    }

    const [rows] = await pool.execute(
      `SELECT
          wr.id,
          wr.request_no,
          wr.user_id,
          u.username,
          u.phone,
          wr.channel,
          wr.provider,
          wr.amount,
          wr.fee_amount,
          wr.net_amount,
          wr.status,
          wr.account_name,
          wr.account_no_masked,
          wr.provider_request_id,
          wr.remark,
          wr.failure_reason,
          wr.reviewed_by_user_id,
          wr.reviewed_at,
          wr.paid_at,
          wr.created_at,
          wr.updated_at
       FROM wallet_withdraw_requests wr
       JOIN users u ON u.id = wr.user_id
       ${whereSql}
       ORDER BY wr.id DESC
       LIMIT 200`,
      params
    )
    return rows
  }

  async function applyWithdraw(payload = {}) {
    const userId = Number(payload.userId || 0)
    const amount = Math.max(0, Number(payload.amount || 0) || 0)
    const channel = String(payload.channel || 'bank').trim().toLowerCase() || 'bank'
    const accountName = String(payload.accountName || '').trim()
    const accountNo = String(payload.accountNo || '').trim()
    const remark = String(payload.remark || '').trim().slice(0, 255)

    if (!userId || amount <= 0) {
      fail(400, { message: '提现申请参数不完整' })
    }
    if (!accountName || !accountNo) {
      fail(400, { message: '请输入完整的收款账户信息' })
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const [[userRow]] = await conn.execute(
        `SELECT id
         FROM users
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [userId]
      )
      if (!userRow) {
        fail(404, { message: '用户不存在' })
      }

      const walletAccount = await getWalletAccountForUpdate(conn, userId)
      const balanceBefore = Number(walletAccount.balance || 0)
      const frozenBefore = Number(walletAccount.frozen_balance || 0)
      if (balanceBefore < amount) {
        fail(400, { message: '钱包可提现余额不足' })
      }

      const requestNo = createBusinessNo('WD')
      const balanceAfter = balanceBefore - amount
      const frozenAfter = frozenBefore + amount
      await conn.execute(
        `UPDATE wallet_accounts
         SET balance = ?,
             frozen_balance = ?
         WHERE user_id = ?`,
        [balanceAfter, frozenAfter, userId]
      )

      await appendWalletLedger(conn, {
        userId,
        orderId: null,
        businessType: 'withdraw_apply',
        direction: 'debit',
        amount,
        balanceBefore,
        balanceAfter,
        remark: `提现申请已提交，单号 ${requestNo}`
      })

      await conn.execute(
        `INSERT INTO wallet_withdraw_requests (
          request_no,
          user_id,
          channel,
          provider,
          amount,
          fee_amount,
          net_amount,
          status,
          account_name,
          account_no_masked,
          account_snapshot_json,
          remark
        ) VALUES (?, ?, ?, ?, ?, 0, ?, 'pending_review', ?, ?, ?, ?)`,
        [
          requestNo,
          userId,
          channel,
          String(paymentProvider?.withdrawMode || paymentProvider?.mode || 'mock_payment').trim() || 'mock_payment',
          amount,
          amount,
          accountName,
          maskAccountNo(accountNo),
          safeJsonStringify({
            accountName,
            accountNo,
            payeeRealName: accountName
          }),
          remark || null
        ]
      )

      const request = await fetchWithdrawRequestByNo(conn, requestNo)
      await conn.commit()
      return {
        ...request,
        provider_payload: safeJsonParse(request?.provider_payload, null)
      }
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }

  async function reviewWithdraw(payload = {}) {
    const withdrawRequestId = Number(payload.withdrawRequestId || 0)
    const adminUserId = Number(payload.adminUserId || 0)
    const action = String(payload.action || '').trim().toLowerCase()
    const remark = String(payload.remark || '').trim().slice(0, 255)

    if (!withdrawRequestId || !adminUserId || !['approve', 'reject'].includes(action)) {
      fail(400, { message: '审核参数不合法' })
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const request = await fetchWithdrawRequestById(conn, withdrawRequestId)
      if (!request) {
        fail(404, { message: '提现申请不存在' })
      }
      if (String(request.status || '') !== 'pending_review') {
        fail(400, { message: '当前提现申请不在待审核状态' })
      }

      const walletAccount = await getWalletAccountForUpdate(conn, Number(request.user_id || 0))
      const balanceBefore = Number(walletAccount.balance || 0)
      const frozenBefore = Number(walletAccount.frozen_balance || 0)
      const amount = Number(request.amount || 0)
      if (frozenBefore < amount) {
        fail(400, { message: '钱包冻结金额不足，无法继续处理该提现申请' })
      }

      if (action === 'reject') {
        const balanceAfter = balanceBefore + amount
        const frozenAfter = frozenBefore - amount
        await conn.execute(
          `UPDATE wallet_accounts
           SET balance = ?,
               frozen_balance = ?
           WHERE user_id = ?`,
          [balanceAfter, frozenAfter, Number(request.user_id || 0)]
        )
        await appendWalletLedger(conn, {
          userId: Number(request.user_id || 0),
          orderId: null,
          businessType: 'withdraw_reject',
          direction: 'credit',
          amount,
          balanceBefore,
          balanceAfter,
          remark: `提现驳回退回余额，单号 ${request.request_no}`
        })
        await conn.execute(
          `UPDATE wallet_withdraw_requests
           SET status = 'rejected',
               provider = 'manual',
               failure_reason = ?,
               reviewed_by_user_id = ?,
               reviewed_at = NOW(),
               remark = COALESCE(?, remark),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [remark || '管理员驳回提现申请', adminUserId, remark || null, withdrawRequestId]
        )
        const updatedRequest = await fetchWithdrawRequestById(conn, withdrawRequestId)
        await conn.commit()
        return {
          ...updatedRequest,
          provider_payload: safeJsonParse(updatedRequest?.provider_payload, null)
        }
      }

      const accountSnapshot = safeJsonParse(request.account_snapshot_json, {})
      const providerResult = await paymentProvider.createWithdrawal({
        requestNo: request.request_no,
        channel: request.channel,
        amount,
        accountName: accountSnapshot?.accountName || request.account_name,
        accountNo: accountSnapshot?.accountNo || '',
          payeeRealName: accountSnapshot?.payeeRealName || request.account_name
      })
      if (!providerResult?.ok) {
        fail(502, { message: providerResult?.message || '提现代付下单失败' })
      }

      const nextStatus = String(providerResult.status || 'processing').trim() === 'success'
        ? 'success'
        : 'processing'

      await conn.execute(
        `UPDATE wallet_withdraw_requests
         SET status = ?,
             provider = ?,
             provider_request_id = ?,
             provider_payload = ?,
             reviewed_by_user_id = ?,
             reviewed_at = NOW(),
             paid_at = CASE WHEN ? = 'success' THEN NOW() ELSE paid_at END,
             remark = COALESCE(?, remark),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          nextStatus,
          String(providerResult.provider || paymentProvider.mode || 'mock_payment').trim() || 'mock_payment',
          String(providerResult.providerRequestId || '').trim() || null,
          safeJsonStringify(providerResult),
          adminUserId,
          nextStatus,
          remark || null,
          withdrawRequestId
        ]
      )

      if (nextStatus === 'success') {
        await conn.execute(
          `UPDATE wallet_accounts
           SET frozen_balance = ?
           WHERE user_id = ?`,
          [frozenBefore - amount, Number(request.user_id || 0)]
        )
      }

      const updatedRequest = await fetchWithdrawRequestById(conn, withdrawRequestId)
      await conn.commit()
      return {
        ...updatedRequest,
        provider_payload: safeJsonParse(updatedRequest?.provider_payload, null)
      }
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }

  async function handleWithdrawCallback(payload = {}) {
    const requestNo = String(payload.requestNo || '').trim()
    const providerRequestId = String(payload.providerRequestId || '').trim()
    const callbackStatus = normalizeWithdrawCallbackStatus(payload.status)
    const failureReason = String(payload.failureReason || '').trim().slice(0, 255)

    if (!requestNo) {
      fail(400, { message: '提现单号不能为空' })
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const request = await fetchWithdrawRequestByNo(conn, requestNo)
      if (!request) {
        fail(404, { message: '提现申请不存在' })
      }
      const previousStatus = String(request.status || '').trim()
      if (['success', 'rejected', 'failed'].includes(String(request.status || '').trim())) {
        await conn.commit()
        return {
          ...request,
          previous_status: previousStatus,
          provider_payload: safeJsonParse(request.provider_payload, null)
        }
      }

      const walletAccount = await getWalletAccountForUpdate(conn, Number(request.user_id || 0))
      const balanceBefore = Number(walletAccount.balance || 0)
      const frozenBefore = Number(walletAccount.frozen_balance || 0)
      const amount = Number(request.amount || 0)

      await conn.execute(
        `UPDATE wallet_withdraw_requests
         SET status = ?,
             provider_request_id = COALESCE(?, provider_request_id),
             provider_payload = ?,
             failure_reason = CASE
               WHEN ? = 'failed' THEN ?
               ELSE failure_reason
             END,
             paid_at = CASE
               WHEN ? = 'success' THEN COALESCE(paid_at, NOW())
               ELSE paid_at
             END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          callbackStatus,
          providerRequestId || null,
          safeJsonStringify(payload.rawPayload ?? payload),
          callbackStatus,
          failureReason || '提现失败，金额已退回钱包',
          callbackStatus,
          Number(request.id || 0)
        ]
      )

      if (callbackStatus === 'success') {
        await conn.execute(
          `UPDATE wallet_accounts
           SET frozen_balance = ?
           WHERE user_id = ?`,
          [Math.max(0, frozenBefore - amount), Number(request.user_id || 0)]
        )
      } else if (callbackStatus === 'failed') {
        const balanceAfter = balanceBefore + amount
        await conn.execute(
          `UPDATE wallet_accounts
           SET balance = ?,
               frozen_balance = ?
           WHERE user_id = ?`,
          [balanceAfter, Math.max(0, frozenBefore - amount), Number(request.user_id || 0)]
        )
        await appendWalletLedger(conn, {
          userId: Number(request.user_id || 0),
          orderId: null,
          businessType: 'withdraw_fail_refund',
          direction: 'credit',
          amount,
          balanceBefore,
          balanceAfter,
          remark: `提现失败退回余额，单号 ${request.request_no}`
        })
      }

      const updatedRequest = await fetchWithdrawRequestByNo(conn, requestNo)
      await conn.commit()
      return {
        ...updatedRequest,
        previous_status: previousStatus,
        provider_payload: safeJsonParse(updatedRequest?.provider_payload, null)
      }
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }

  return {
    createOrderPayment,
    getPaymentTransactionDetail,
    closePaymentTransaction,
    handlePaymentCallback,
    getUserWithdrawList,
    getAdminWithdrawList,
    applyWithdraw,
    reviewWithdraw,
    handleWithdrawCallback
  }
}
