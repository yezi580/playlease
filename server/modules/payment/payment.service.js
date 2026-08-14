/*作用：支付与结算资金处理的核心业务服务层。
* 现在用途：
* 创建平台支付流水
* 处理支付回调
* 同步订单支付状态
* 管理卖家收款账号
* 创建订单退款
* 创建卖家结算打款
* 对账订单资金状态
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

function getReqDateFromTransactionNo(transactionNo = '') {
  const normalized = String(transactionNo || '').trim()
  const matched = normalized.match(/\d{8}/)
  return matched ? matched[0] : new Date().toISOString().slice(0, 10).replace(/-/g, '')
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

function normalizePaymentCallbackStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (['success', 'paid', 'trade_success', 'succeeded'].includes(normalized)) return 'paid'
  if (['failed', 'fail', 'error'].includes(normalized)) return 'failed'
  if (['cancelled', 'canceled', 'closed'].includes(normalized)) return 'cancelled'
  return 'pending'
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

async function fetchSettlementAccountByUserId(executor, userId) {
  const [rows] = await executor.execute(
    `SELECT
        user_id,
        provider,
        account_type,
        bind_status,
        huifu_id,
        acct_id,
        account_name,
        mobile,
        id_card_masked,
        remark,
        last_verified_at,
        created_at,
        updated_at
     FROM user_settlement_accounts
     WHERE user_id = ?
     LIMIT 1`,
    [Number(userId || 0)]
  )
  return rows[0] || null
}

async function fetchRefundByNo(executor, refundNo) {
  const [rows] = await executor.execute(
    `SELECT
        id,
        refund_no,
        transaction_no,
        order_id,
        user_id,
        refund_type,
        amount,
        reason,
        provider,
        status,
        provider_refund_no,
        provider_payload,
        failure_reason,
        completed_at,
        created_at,
        updated_at
     FROM payment_refunds
     WHERE refund_no = ?
     LIMIT 1`,
    [String(refundNo || '').trim()]
  )
  return rows[0] || null
}

async function fetchSettlementPayoutByNo(executor, payoutNo) {
  const [rows] = await executor.execute(
    `SELECT
        id,
        payout_no,
        order_id,
        payee_user_id,
        provider,
        status,
        amount,
        account_name,
        payee_huifu_id,
        payee_acct_id,
        provider_request_id,
        provider_payload,
        remark,
        failure_reason,
        completed_at,
        created_at,
        updated_at
     FROM settlement_payouts
     WHERE payout_no = ?
     LIMIT 1`,
    [String(payoutNo || '').trim()]
  )
  return rows[0] || null
}

async function fetchOrderById(executor, orderId) {
  const [rows] = await executor.execute(
    `SELECT *
     FROM orders
     WHERE id = ?
     LIMIT 1`,
    [Number(orderId || 0)]
  )
  return rows[0] || null
}

async function fetchLatestRefundByOrderId(executor, orderId) {
  const [rows] = await executor.execute(
    `SELECT
        id,
        refund_no,
        transaction_no,
        order_id,
        user_id,
        refund_type,
        amount,
        reason,
        provider,
        status,
        provider_refund_no,
        provider_payload,
        failure_reason,
        completed_at,
        created_at,
        updated_at
     FROM payment_refunds
     WHERE order_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [Number(orderId || 0)]
  )
  return rows[0] || null
}

async function fetchLatestSettlementPayoutByOrderId(executor, orderId) {
  const [rows] = await executor.execute(
    `SELECT
        id,
        payout_no,
        order_id,
        payee_user_id,
        provider,
        status,
        amount,
        account_name,
        payee_huifu_id,
        payee_acct_id,
        provider_request_id,
        provider_payload,
        remark,
        failure_reason,
        completed_at,
        created_at,
        updated_at
     FROM settlement_payouts
     WHERE order_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [Number(orderId || 0)]
  )
  return rows[0] || null
}

async function fetchEncashmentByNo(executor, encashmentNo) {
  const [rows] = await executor.execute(
    `SELECT
        id,
        encashment_no,
        user_id,
        provider,
        status,
        amount,
        huifu_id,
        token_no,
        into_acct_date_type,
        trans_stat,
        provider_request_id,
        provider_payload,
        failure_reason,
        completed_at,
        created_at,
        updated_at
     FROM encashments
     WHERE encashment_no = ?
     LIMIT 1`,
    [String(encashmentNo || '').trim()]
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

  function buildSettlementAccountResult(row) {
    if (!row) return null
    return {
      ...row
    }
  }

  function buildRefundResult(row) {
    if (!row) return null
    return {
      ...row,
      provider_payload: safeJsonParse(row?.provider_payload, null)
    }
  }

  function buildSettlementPayoutResult(row) {
    if (!row) return null
    return {
      ...row,
      provider_payload: safeJsonParse(row?.provider_payload, null)
    }
  }

  function buildEncashmentResult(row) {
    if (!row) return null
    return {
      ...row,
      provider_payload: safeJsonParse(row?.provider_payload, null)
    }
  }

  function normalizeEncashmentStatus(transStat = '', intoAcctDateType = 'D1') {
    const stat = String(transStat || '').trim().toUpperCase()
    if (stat === 'F') return 'failed'
    const dateType = String(intoAcctDateType || 'D1').trim().toUpperCase()
    // 秒到(TS)且汇付确认成功才算真正到账；D1/T1 同步返回的 S 仅表示“申请受理成功”，
    // 资金要次日/次工作日才入银行卡，因此先记为处理中，避免误导用户以为已到账。
    if (stat === 'S' && dateType === 'TS') return 'success'
    return 'processing'
  }

  async function syncRefundWithProvider(refund = {}) {
    const refundNo = String(refund?.refund_no || '').trim()
    const status = String(refund?.status || '').trim().toLowerCase()
    if (!refundNo || !['pending', 'processing'].includes(status)) {
      return buildRefundResult(refund)
    }
    if (typeof paymentProvider?.queryRefund !== 'function') {
      return buildRefundResult(refund)
    }

    const queryResult = await paymentProvider.queryRefund({
      refundNo,
      transactionNo: refund.transaction_no,
      providerRefundNo: refund.provider_refund_no,
      orgReqDate: getReqDateFromTransactionNo(refundNo)
    })
    if (!queryResult?.ok) {
      return {
        ...buildRefundResult(refund),
        provider_query_status: 'failed',
        provider_query_message: String(queryResult?.message || '退款查单失败').trim()
      }
    }

    const nextStatus = ['success', 'failed', 'cancelled'].includes(String(queryResult.status || '').trim())
      ? String(queryResult.status || '').trim()
      : 'processing'
    await pool.execute(
      `UPDATE payment_refunds
       SET status = ?,
           provider = ?,
           provider_refund_no = COALESCE(?, provider_refund_no),
           provider_payload = ?,
           failure_reason = CASE
             WHEN ? = 'failed' THEN COALESCE(failure_reason, '退款失败，请人工核对')
             ELSE failure_reason
           END,
           completed_at = CASE
             WHEN ? = 'success' THEN COALESCE(completed_at, NOW())
             ELSE completed_at
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE refund_no = ?`,
      [
        nextStatus,
        String(queryResult.provider || refund.provider || paymentProvider?.mode || 'mock_payment').trim() || 'mock_payment',
        String(queryResult.providerRefundNo || '').trim() || null,
        safeJsonStringify(queryResult),
        nextStatus,
        nextStatus,
        refundNo
      ]
    )
    return buildRefundResult(await fetchRefundByNo(pool, refundNo))
  }

  async function syncSettlementPayoutWithProvider(payout = {}) {
    const payoutNo = String(payout?.payout_no || '').trim()
    const status = String(payout?.status || '').trim().toLowerCase()
    if (!payoutNo || !['pending', 'processing'].includes(status)) {
      return buildSettlementPayoutResult(payout)
    }
    if (typeof paymentProvider?.queryBalancePayout !== 'function') {
      return buildSettlementPayoutResult(payout)
    }

    const queryResult = await paymentProvider.queryBalancePayout({
      payoutNo,
      providerPayoutNo: payout.provider_request_id,
      orgReqDate: getReqDateFromTransactionNo(payoutNo)
    })
    if (!queryResult?.ok) {
      return {
        ...buildSettlementPayoutResult(payout),
        provider_query_status: 'failed',
        provider_query_message: String(queryResult?.message || '余额支付查单失败').trim()
      }
    }

    const nextStatus = ['success', 'failed', 'cancelled'].includes(String(queryResult.status || '').trim())
      ? String(queryResult.status || '').trim()
      : 'processing'
    await pool.execute(
      `UPDATE settlement_payouts
       SET status = ?,
           provider = ?,
           provider_request_id = COALESCE(?, provider_request_id),
           provider_payload = ?,
           failure_reason = CASE
             WHEN ? = 'failed' THEN COALESCE(failure_reason, '余额支付失败，请人工核对')
             ELSE failure_reason
           END,
           completed_at = CASE
             WHEN ? = 'success' THEN COALESCE(completed_at, NOW())
             ELSE completed_at
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE payout_no = ?`,
      [
        nextStatus,
        String(queryResult.provider || payout.provider || paymentProvider?.withdrawMode || paymentProvider?.mode || 'mock_payment').trim() || 'mock_payment',
        String(queryResult.providerPayoutNo || '').trim() || null,
        safeJsonStringify(queryResult),
        nextStatus,
        nextStatus,
        payoutNo
      ]
    )
    return buildSettlementPayoutResult(await fetchSettlementPayoutByNo(pool, payoutNo))
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
      if (currentStatus === 'cancelled') {
        const syncResult = {
          businessSyncStatus: 'failed',
          businessSyncMessage: '订单已超时取消，收到延迟支付回调，请人工核对资金状态'
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
    const scene = String(payload.scene || '').trim().toLowerCase()
    const returnUrl = String(payload.returnUrl || '').trim()

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
        scene,
        amount,
        orderId,
        subject: order.listing_title || order.order_no || `订单#${orderId}`,
        payerUserId: userId,
        returnUrl
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

  async function getSettlementAccount(payload = {}) {
    const userId = Number(payload.userId || 0)
    if (!userId) {
      fail(400, { message: '用户信息不完整' })
    }
    const account = await fetchSettlementAccountByUserId(pool, userId)
    if (account) {
      return buildSettlementAccountResult(account)
    }
    return buildSettlementAccountResult({
      user_id: userId,
      provider: String(paymentProvider?.withdrawMode || paymentProvider?.mode || 'mock_payment').trim() || 'mock_payment',
      account_type: 'person',
      bind_status: 'unbound',
      huifu_id: '',
      acct_id: '',
      account_name: '',
      mobile: '',
      id_card_masked: '',
      remark: '',
      last_verified_at: null,
      created_at: null,
      updated_at: null
    })
  }

  async function upsertSettlementAccount(payload = {}) {
    const userId = Number(payload.userId || 0)
    const provider = String(payload.provider || paymentProvider?.withdrawMode || paymentProvider?.mode || 'mock_payment').trim() || 'mock_payment'
    const accountType = ['person', 'enterprise'].includes(String(payload.accountType || '').trim())
      ? String(payload.accountType || '').trim()
      : 'person'
    const bindStatus = ['unbound', 'pending', 'active', 'disabled'].includes(String(payload.bindStatus || '').trim())
      ? String(payload.bindStatus || '').trim()
      : 'active'
    const huifuId = String(payload.huifuId || '').trim()
    const acctId = String(payload.acctId || '').trim()
    const accountName = String(payload.accountName || '').trim()
    const mobile = String(payload.mobile || '').trim()
    const idCardMasked = String(payload.idCardMasked || '').trim()
    const remark = String(payload.remark || '').trim().slice(0, 255)

    if (!userId) {
      fail(400, { message: '用户信息不完整' })
    }
    if (!huifuId) {
      fail(400, { message: '请填写汇付ID' })
    }
    if (!accountName) {
      fail(400, { message: '请填写收款人姓名' })
    }

    await pool.execute(
      `INSERT INTO user_settlement_accounts (
        user_id,
        provider,
        account_type,
        bind_status,
        huifu_id,
        acct_id,
        account_name,
        mobile,
        id_card_masked,
        remark,
        last_verified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        provider = VALUES(provider),
        account_type = VALUES(account_type),
        bind_status = VALUES(bind_status),
        huifu_id = VALUES(huifu_id),
        acct_id = VALUES(acct_id),
        account_name = VALUES(account_name),
        mobile = VALUES(mobile),
        id_card_masked = VALUES(id_card_masked),
        remark = VALUES(remark),
        last_verified_at = NOW()`,
      [
        userId,
        provider,
        accountType,
        bindStatus,
        huifuId,
        acctId || null,
        accountName,
        mobile || null,
        idCardMasked || null,
        remark || null
      ]
    )

    const account = await fetchSettlementAccountByUserId(pool, userId)
    return buildSettlementAccountResult(account)
  }

  async function getUserSettlementPayoutList(payload = {}) {
    const userId = Number(payload.userId || 0)
    if (!userId) {
      fail(400, { message: '用户信息不完整' })
    }
    const [rows] = await pool.execute(
      `SELECT
          id,
          payout_no,
          order_id,
          payee_user_id,
          provider,
          status,
          amount,
          account_name,
          payee_huifu_id,
          payee_acct_id,
          provider_request_id,
          provider_payload,
          remark,
          failure_reason,
          completed_at,
          created_at,
          updated_at
       FROM settlement_payouts
       WHERE payee_user_id = ?
       ORDER BY id DESC
       LIMIT 100`,
      [userId]
    )
    return rows.map((row) => buildSettlementPayoutResult(row))
  }

  async function createOrderRefund(payload = {}) {
    const orderId = Number(payload.orderId || 0)
    const userId = Number(payload.userId || 0)
    const amount = Math.max(0, Number(payload.amount || 0) || 0)
    const refundType = String(payload.refundType || 'partial').trim().toLowerCase() === 'full' ? 'full' : 'partial'
    const reason = String(payload.reason || '').trim().slice(0, 255)
    const explicitTransactionNo = String(payload.transactionNo || '').trim()

    if (!orderId || !userId || amount <= 0) {
      fail(400, { message: '退款参数不完整' })
    }

    const conn = await pool.getConnection()
    let refundNo = ''
    let transaction = null
    try {
      await conn.beginTransaction()

      const [[orderRow]] = await conn.execute(
        `SELECT id, buyer_id
         FROM orders
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [orderId]
      )
      if (!orderRow) {
        fail(404, { message: '订单不存在' })
      }
      if (Number(orderRow.buyer_id || 0) !== userId) {
        fail(403, { message: '无权为该订单发起退款' })
      }

      const [transactionRows] = await conn.execute(
        `SELECT
            transaction_no,
            amount,
            provider_trade_no,
            provider
         FROM payment_transactions
         WHERE order_id = ?
           AND status = 'paid'
           AND (? = '' OR transaction_no = ?)
         ORDER BY id DESC
         LIMIT 1
         FOR UPDATE`,
        [orderId, explicitTransactionNo, explicitTransactionNo]
      )
      transaction = transactionRows[0]
      if (!transaction) {
        fail(400, { message: '未找到可退款的已支付流水' })
      }
      if (amount > Number(transaction.amount || 0)) {
        fail(400, { message: '退款金额不能大于原支付金额' })
      }

      refundNo = createBusinessNo('RFD')
      await conn.execute(
        `INSERT INTO payment_refunds (
          refund_no,
          transaction_no,
          order_id,
          user_id,
          refund_type,
          amount,
          reason,
          provider,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          refundNo,
          transaction.transaction_no,
          orderId,
          userId,
          refundType,
          amount,
          reason || null,
          String(transaction.provider || paymentProvider?.mode || 'mock_payment').trim() || 'mock_payment'
        ]
      )

      await conn.commit()
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }

    const refund = await fetchRefundByNo(pool, refundNo)
    const providerResult = await paymentProvider.createRefund({
      refundNo,
      transactionNo: refund.transaction_no,
      providerTradeNo: transaction.provider_trade_no,
      orgReqDate: getReqDateFromTransactionNo(transaction.transaction_no),
      orderId,
      amount,
      reason
    })
    if (!providerResult?.ok) {
      await pool.execute(
        `UPDATE payment_refunds
         SET status = 'failed',
             failure_reason = ?,
             provider_payload = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE refund_no = ?`,
        [
          providerResult?.message || '退款申请失败',
          safeJsonStringify(providerResult || null),
          refundNo
        ]
      )
      fail(502, { message: providerResult?.message || '退款申请失败' })
    }

    const refundStatus = String(providerResult.status || 'processing').trim() === 'success' ? 'success' : 'processing'
    await pool.execute(
      `UPDATE payment_refunds
       SET status = ?,
           provider = ?,
           provider_refund_no = ?,
           provider_payload = ?,
           completed_at = CASE WHEN ? = 'success' THEN NOW() ELSE completed_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE refund_no = ?`,
      [
        refundStatus,
        String(providerResult.provider || paymentProvider?.mode || 'mock_payment').trim() || 'mock_payment',
        String(providerResult.providerRefundNo || '').trim() || null,
        safeJsonStringify(providerResult),
        refundStatus,
        refundNo
      ]
    )
    return buildRefundResult(await fetchRefundByNo(pool, refundNo))
  }

  async function createSettlementPayout(payload = {}) {
    const orderId = Number(payload.orderId || 0)
    const payeeUserId = Number(payload.payeeUserId || 0)
    const amount = Math.max(0, Number(payload.amount || 0) || 0)
    const remark = String(payload.remark || '').trim().slice(0, 255)

    if (!orderId || !payeeUserId || amount <= 0) {
      fail(400, { message: '余额支付参数不完整' })
    }

    const account = await fetchSettlementAccountByUserId(pool, payeeUserId)
    if (!account
      || String(account.bind_status || '').trim() !== 'active'
      || !String(account.huifu_id || '').trim()
      || !String(account.acct_id || '').trim()) {
      fail(400, { message: '卖家尚未完成收款账号配置或绑卡，暂时不能执行余额支付' })
    }

    const payoutNo = createBusinessNo('POT')
    await pool.execute(
      `INSERT INTO settlement_payouts (
        payout_no,
        order_id,
        payee_user_id,
        provider,
        status,
        amount,
        account_name,
        payee_huifu_id,
        payee_acct_id,
        remark
      ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
      [
        payoutNo,
        orderId,
        payeeUserId,
        String(paymentProvider?.withdrawMode || paymentProvider?.mode || 'mock_payment').trim() || 'mock_payment',
        amount,
        account.account_name,
        account.huifu_id,
        account.acct_id || null,
        remark || null
      ]
    )

    const providerResult = await paymentProvider.createBalancePayout({
      payoutNo,
      orderId,
      amount,
      payeeHuifuId: account.huifu_id,
      payeeAcctId: account.acct_id || '',
      accountName: account.account_name,
      remark
    })
    if (!providerResult?.ok) {
      await pool.execute(
        `UPDATE settlement_payouts
         SET status = 'failed',
             failure_reason = ?,
             provider_payload = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE payout_no = ?`,
        [
          providerResult?.message || '余额支付申请失败',
          safeJsonStringify(providerResult || null),
          payoutNo
        ]
      )
      fail(502, { message: providerResult?.message || '余额支付申请失败' })
    }

    const payoutStatus = String(providerResult.status || 'processing').trim() === 'success' ? 'success' : 'processing'
    await pool.execute(
      `UPDATE settlement_payouts
       SET status = ?,
           provider = ?,
           provider_request_id = ?,
           provider_payload = ?,
           completed_at = CASE WHEN ? = 'success' THEN NOW() ELSE completed_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE payout_no = ?`,
      [
        payoutStatus,
        String(providerResult.provider || paymentProvider?.withdrawMode || paymentProvider?.mode || 'mock_payment').trim() || 'mock_payment',
        String(providerResult.providerPayoutNo || '').trim() || null,
        safeJsonStringify(providerResult),
        payoutStatus,
        payoutNo
      ]
    )
    return buildSettlementPayoutResult(await fetchSettlementPayoutByNo(pool, payoutNo))
  }

  async function reconcileOrderFunds(payload = {}) {
    const orderId = Number(payload.orderId || 0)
    const supportUserId = Number(payload.supportUserId || 0)

    if (!orderId || !supportUserId) {
      fail(400, { message: '订单或客服信息不完整' })
    }

    const order = await fetchOrderById(pool, orderId)
    if (!order) {
      fail(404, { message: '订单不存在' })
    }
    if (Number(order.support_assignee_id || 0) !== supportUserId) {
      fail(403, { message: '只有当前负责客服可以同步资金状态' })
    }

    const supportScene = String(order.support_scene || '').trim()
    if (!['cancel_refund_processing', 'settlement_funds_processing', 'frozen_funds_processing'].includes(supportScene)) {
      fail(400, { message: '当前订单不在资金处理中状态' })
    }

    let refund = await fetchLatestRefundByOrderId(pool, orderId)
    let payout = await fetchLatestSettlementPayoutByOrderId(pool, orderId)

    if (refund) {
      refund = await syncRefundWithProvider(refund)
    }
    if (supportScene === 'settlement_funds_processing' && payout) {
      payout = await syncSettlementPayoutWithProvider(payout)
    }

    const refundFailed = ['failed', 'cancelled'].includes(String(refund?.status || '').trim())
    const payoutFailed = ['failed', 'cancelled'].includes(String(payout?.status || '').trim())

    if (refundFailed || payoutFailed) {
      const messages = []
      if (refundFailed) {
        messages.push(`退款失败：${refund?.failure_reason || refund?.provider_query_message || '请人工核对汇付结果'}`)
      }
      if (payoutFailed) {
        messages.push(`打款失败：${payout?.failure_reason || payout?.provider_query_message || '请人工核对汇付结果'}`)
      }
      await pool.execute(
        `UPDATE orders
         SET support_note = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [messages.join('；').slice(0, 255), orderId]
      )
      return {
        order: await fetchOrderById(pool, orderId),
        refund: buildRefundResult(refund),
        payout: buildSettlementPayoutResult(payout),
        finalized: false
      }
    }

    const refundDone = !refund || String(refund.status || '').trim() === 'success'
    const payoutDone = supportScene !== 'settlement_funds_processing'
      || !payout
      || String(payout.status || '').trim() === 'success'

    if (refundDone && payoutDone) {
      let finalizedOrder = null
      if (supportScene === 'cancel_refund_processing') {
        finalizedOrder = await orderLifecycleService.cancelOrderBySupport({
          orderId,
          supportUserId,
          note: '客服已确认原路退款完成，订单已取消。'
        })
      } else {
        finalizedOrder = await orderLifecycleService.executeSettlement({
          orderId,
          supportUserId
        })
      }
      return {
        order: finalizedOrder,
        refund: buildRefundResult(await fetchLatestRefundByOrderId(pool, orderId)),
        payout: buildSettlementPayoutResult(await fetchLatestSettlementPayoutByOrderId(pool, orderId)),
        finalized: true
      }
    }

    const processingNotes = []
    if (refund && !refundDone) {
      processingNotes.push('退款处理中')
    }
    if (supportScene === 'settlement_funds_processing' && payout && !payoutDone) {
      processingNotes.push('打款处理中')
    }
    if (processingNotes.length) {
      await pool.execute(
        `UPDATE orders
         SET support_note = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [`已主动查询汇付结果，当前${processingNotes.join('，')}。`, orderId]
      )
    }

    return {
      order: await fetchOrderById(pool, orderId),
      refund: buildRefundResult(refund),
      payout: buildSettlementPayoutResult(payout),
      finalized: false
    }
  }

  async function reconcileProcessingFundsOrders(options = {}) {
    const lookbackHours = Math.max(1, Number(options?.lookbackHours ?? 24) || 24)
    const limit = Math.min(200, Math.max(1, Number(options?.limit ?? 50) || 50))
    const [rows] = await pool.query(
      `SELECT id, support_assignee_id
       FROM orders
       WHERE status = 'support_handling'
         AND support_status = 'handling'
         AND support_scene IN ('cancel_refund_processing', 'settlement_funds_processing', 'frozen_funds_processing')
         AND updated_at > DATE_SUB(NOW(), INTERVAL ? HOUR)
       ORDER BY updated_at ASC
       LIMIT ?`,
      [lookbackHours, limit]
    )

    const summary = { scanned: rows.length, finalized: 0, pending: 0, skipped: 0, errors: 0 }
    for (const row of rows) {
      const orderId = Number(row.id)
      const supportUserId = Number(row.support_assignee_id || 0)
      if (!orderId || !supportUserId) {
        summary.skipped += 1
        continue
      }
      try {
        const result = await reconcileOrderFunds({ orderId, supportUserId })
        if (result?.finalized) {
          summary.finalized += 1
        } else {
          summary.pending += 1
        }
      } catch (error) {
        summary.errors += 1
        console.error('[资金对账] 订单', orderId, '对账失败:', error?.body?.message || error?.message || String(error))
      }
    }
    return summary
  }

  async function requestEncashment(payload = {}) {
    const userId = Number(payload.userId || 0)
    if (!userId) {
      fail(400, { message: '用户信息不完整' })
    }
    const account = await fetchSettlementAccountByUserId(pool, userId)
    if (!account
      || String(account.bind_status || '').trim() !== 'active'
      || !String(account.huifu_id || '').trim()
      || !String(account.acct_id || '').trim()) {
      fail(400, { message: '请先完成开户和绑卡' })
    }
    const cashAmt = Number(payload.cashAmt || 0)
    if (!cashAmt || cashAmt <= 0) {
      fail(400, { message: '取现金额必须大于0' })
    }
    const cashAmtStr = cashAmt.toFixed(2)
    const intoAcctDateType = String(payload.intoAcctDateType || 'D1').trim().toUpperCase() || 'D1'
    const encashmentNo = createBusinessNo('EC')
    const amountCents = Math.round(cashAmt * 100)
    const providerName = String(paymentProvider?.mode || 'mock_payment').trim() || 'mock_payment'

    await pool.execute(
      `INSERT INTO encashments (
        encashment_no,
        user_id,
        provider,
        status,
        amount,
        huifu_id,
        token_no,
        into_acct_date_type
      ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`,
      [encashmentNo, userId, providerName, amountCents, account.huifu_id, account.acct_id, intoAcctDateType]
    )

    const providerResult = await paymentProvider.createEncashment({
      huifuId: account.huifu_id,
      tokenNo: account.acct_id,
      cashAmt: cashAmtStr,
      intoAcctDateType,
      reqSeqId: encashmentNo
    })
    if (!providerResult?.ok) {
      await pool.execute(
        `UPDATE encashments
         SET status = 'failed',
             failure_reason = ?,
             provider_payload = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE encashment_no = ?`,
        [providerResult?.message || '取现申请失败', safeJsonStringify(providerResult || null), encashmentNo]
      )
      fail(502, { message: providerResult?.message || '取现申请失败' })
    }

    const transStat = String(providerResult.transStat || 'P').trim()
    const nextStatus = normalizeEncashmentStatus(transStat, intoAcctDateType)
    await pool.execute(
      `UPDATE encashments
       SET status = ?,
           trans_stat = ?,
           provider = ?,
           provider_request_id = ?,
           provider_payload = ?,
           completed_at = CASE WHEN ? = 'success' THEN NOW() ELSE completed_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE encashment_no = ?`,
      [
        nextStatus,
        transStat,
        String(providerResult.provider || providerName).trim() || providerName,
        String(providerResult.hfSeqId || '').trim() || null,
        safeJsonStringify(providerResult),
        nextStatus,
        encashmentNo
      ]
    )
    return buildEncashmentResult(await fetchEncashmentByNo(pool, encashmentNo))
  }

  async function syncEncashmentWithProvider(encashment = {}, options = {}) {
    const encashmentNo = String(encashment?.encashment_no || '').trim()
    const currentStatus = String(encashment?.status || '').trim().toLowerCase()
    const force = Boolean(options.force)
    if (!encashmentNo) {
      return buildEncashmentResult(encashment)
    }
    if (!force && !['pending', 'processing'].includes(currentStatus)) {
      return buildEncashmentResult(encashment)
    }
    if (typeof paymentProvider?.queryEncashment !== 'function') {
      return buildEncashmentResult(encashment)
    }
    const queryResult = await paymentProvider.queryEncashment({
      huifuId: encashment.huifu_id,
      orgReqSeqId: encashment.encashment_no,
      orgHfSeqId: encashment.provider_request_id
    })
    if (!queryResult?.ok) {
      return {
        ...buildEncashmentResult(encashment),
        provider_query_status: 'failed',
        provider_query_message: String(queryResult?.message || '取现查单失败').trim()
      }
    }
    const nextStatus = ['success', 'failed', 'cancelled'].includes(String(queryResult.status || '').trim())
      ? String(queryResult.status).trim()
      : 'processing'
    const transStat = String(queryResult.transStat || '').trim()
    await pool.execute(
      `UPDATE encashments
       SET status = ?,
           trans_stat = COALESCE(NULLIF(?, ''), trans_stat),
           provider_request_id = COALESCE(?, provider_request_id),
           provider_payload = ?,
           failure_reason = CASE
             WHEN ? = 'failed' THEN COALESCE(failure_reason, '取现失败，请人工核对汇付结果')
             ELSE failure_reason
           END,
           completed_at = CASE
             WHEN ? = 'success' THEN COALESCE(completed_at, NOW())
             ELSE completed_at
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE encashment_no = ?`,
      [
        nextStatus,
        transStat,
        String(queryResult.hfSeqId || '').trim() || null,
        safeJsonStringify(queryResult),
        nextStatus,
        nextStatus,
        encashmentNo
      ]
    )
    return buildEncashmentResult(await fetchEncashmentByNo(pool, encashmentNo))
  }

  async function getUserEncashmentList(payload = {}) {
    const userId = Number(payload.userId || 0)
    if (!userId) {
      fail(400, { message: '用户信息不完整' })
    }
    const [rows] = await pool.execute(
      `SELECT
          id,
          encashment_no,
          user_id,
          provider,
          status,
          amount,
          huifu_id,
          token_no,
          into_acct_date_type,
          trans_stat,
          provider_request_id,
          provider_payload,
          failure_reason,
          completed_at,
          created_at,
          updated_at
       FROM encashments
       WHERE user_id = ?
       ORDER BY id DESC
       LIMIT 100`,
      [userId]
    )
    return rows.map((row) => buildEncashmentResult(row))
  }

  async function syncEncashmentByNo(payload = {}) {
    const userId = Number(payload.userId || 0)
    const encashmentNo = String(payload.encashmentNo || '').trim()
    if (!userId || !encashmentNo) {
      fail(400, { message: '取现单信息不完整' })
    }
    const encashment = await fetchEncashmentByNo(pool, encashmentNo)
    if (!encashment) {
      fail(404, { message: '取现单不存在' })
    }
    if (Number(encashment.user_id || 0) !== userId) {
      fail(403, { message: '无权操作该取现单' })
    }
    return syncEncashmentWithProvider(encashment, { force: true })
  }

  return {
    createOrderPayment,
    getPaymentTransactionDetail,
    closePaymentTransaction,
    handlePaymentCallback,
    getSettlementAccount,
    upsertSettlementAccount,
    getUserSettlementPayoutList,
    createOrderRefund,
    createSettlementPayout,
    reconcileOrderFunds,
    reconcileProcessingFundsOrders,
    requestEncashment,
    getUserEncashmentList,
    syncEncashmentByNo
  }
}
