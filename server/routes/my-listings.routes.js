/**
 * 卖家商品管理路由，处理本人商品列表与统计。
 */

import {
  getSaleItemConfig,
  loadBusinessSettings
} from '../modules/business-settings/runtime.js'

export function registerMyListingsRoutes(deps) {
  const {
    app,
    pool,
    authRequired,
    authenticatedReadLimiter,
    authenticatedWriteLimiter,
    buildMyListingStatsPayload,
    normalizeMyListingFields,
    getListingImagesOrderSql,
    fetchListingBanImages,
    buildListingDetailPayload,
    validateRequiredPayload,
    validateListingPayload,
    yuanToCent,
    MIN_LISTING_DEPOSIT_YUAN,
    MAX_LISTING_DEPOSIT_YUAN,
    SALE_ITEM_CONFIG,
    toNullableInteger,
    normalizeInsuranceLevel,
    normalizeListingItemMode,
    centToRoundedYuan,
    getObsoleteListingImageUrls,
    getObsoleteBanMediaUrls,
    computeListingDerivedValues,
    resolveRentDaysRecommendation,
    toUnsignedInteger,
    toDecimalValue,
    toBanRecordFlag,
    buildTrustedListingItems,
    saveListingImages,
    saveListingBanMedia,
    cleanupOrphanUploadedFiles,
    listingStatusToLabel,
    invalidateListingDetailCache
  } = deps

/**
 * GET /api/my-listings/stats — 我发布的商品统计接口
 *
 * 优先按 owner_user_id 查询；为了兼容旧数据，若 owner_user_id 为空，则回退匹配 owner_name。
 */
app.get('/api/my-listings/stats', authRequired, authenticatedReadLimiter, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN listing_status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN listing_status = 'inactive' THEN 1 ELSE 0 END) AS inactive,
        SUM(CASE WHEN listing_status = 'pending_review' THEN 1 ELSE 0 END) AS pending_review,
        SUM(CASE WHEN listing_status = 'sold_out' THEN 1 ELSE 0 END) AS sold_out,
        SUM(CASE WHEN listing_status = 'rented' THEN 1 ELSE 0 END) AS rented
      FROM listings
      WHERE owner_user_id = ? OR (owner_user_id IS NULL AND owner_name = ?)`,
      [req.auth.userId, req.auth.username]
    )

    res.json(buildMyListingStatsPayload(rows[0]))
  } catch (_error) {
    res.status(500).json({ message: '获取我发布的统计失败' })
  }
})

/**
 * GET /api/my-listings — 我发布的商品列表接口
 *
 * 查询参数：
 *   status — 商品状态（all/active/inactive/pending_review/sold_out）
 *   page/pageSize — 分页控制
 */
app.get('/api/my-listings', authRequired, authenticatedReadLimiter, async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1))
  const pageSize = Math.min(20, Math.max(1, Number(req.query.pageSize || 8)))
  const offset = (page - 1) * pageSize
  const status = String(req.query.status || 'all').trim()
  const where = ['(l.owner_user_id = ? OR (l.owner_user_id IS NULL AND l.owner_name = ?))']
  const values = [req.auth.userId, req.auth.username]

  if (status && status !== 'all') {
    where.push('l.listing_status = ?')
    values.push(status)
  }

  const whereSql = `WHERE ${where.join(' AND ')}`

  try {
    const limitSafe = Number.isFinite(pageSize) ? pageSize : 8
    const offsetSafe = Number.isFinite(offset) ? offset : 0

    const [rows] = await pool.execute(
      `SELECT
        l.id,
        l.listing_no,
        l.owner_name,
        l.listing_status,
        l.rank_name,
        l.region,
        l.insurance_level,
        l.login_method,
        l.hafu_coin,
        l.rent_price,
        l.deposit,
        l.rent_days,
        l.published_at,
        l.created_at,
        COALESCE(
          l.cover_image,
          (
            SELECT li.image_url FROM listing_images li
            WHERE li.listing_id = l.id
            ORDER BY ${getListingImagesOrderSql('li')}
            LIMIT 1
          )
        ) AS cover_image,
        CONCAT(
          COALESCE(CONCAT(NULLIF(l.hafu_coin, ''), 'M'), '未设置'),
          ' / ',
          COALESCE(NULLIF(l.rent_days, ''), '0'),
          ' 天',
          ' / ',
          COALESCE(NULLIF(l.insurance_level, ''), '未设置保险')
        ) AS listing_title
      FROM listings l
      ${whereSql}
      ORDER BY l.created_at DESC
      LIMIT ${limitSafe} OFFSET ${offsetSafe}`,
      values
    )

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM listings l
       ${whereSql}`,
      values
    )

    res.json({
      list: rows.map(normalizeMyListingFields),
      total: Number(countRows[0]?.total || 0),
      page,
      pageSize
    })
  } catch (_error) {
    res.status(500).json({ message: '获取我发布的列表失败' })
  }
})

/**
 * GET /api/my-listings/:id — 获取我发布的单个商品详情（用于编辑回填）
 */
app.get('/api/my-listings/:id', authRequired, authenticatedReadLimiter, async (req, res) => {
  const listingId = Number(req.params.id)

  if (!Number.isFinite(listingId) || listingId <= 0) {
    return res.status(400).json({ message: '无效的商品ID' })
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
        id, listing_no, owner_user_id, owner_name, seller_contact_wechat, seller_contact_phone, insurance_level, compensation_plan, weight_level, deposit, base_ratio, login_method,
        energy_level, hafu_coin, rent_price, rent_days, login_time_range, daily_cost,
        secret_kd, character_level, operator_appearance, gold_skin, rank_name,
        knife_skin, weapon_skin, region, face_verified, dive_level, seyed_unlocked,
        listing_status, remark, ban_record, ban_video_url, published_at, created_at
      FROM listings
      WHERE id = ?
        AND (owner_user_id = ? OR (owner_user_id IS NULL AND owner_name = ?))
      LIMIT 1`,
      [listingId, req.auth.userId, req.auth.username]
    )

    if (!rows.length) {
      return res.status(404).json({ message: '未找到该商品，或你无权查看' })
    }

    const [items] = await pool.execute(
      `SELECT item_key, item_name, item_mode, quantity, unit_price, total_price
       FROM listing_items
       WHERE listing_id = ?
       ORDER BY id ASC`,
      [listingId]
    )

    const [images] = await pool.execute(
      `SELECT image_url
       FROM listing_images
       WHERE listing_id = ?
       ORDER BY ${getListingImagesOrderSql()}`,
      [listingId]
    )

    const banImages = await fetchListingBanImages(pool, listingId)

    res.json(buildListingDetailPayload(rows[0], items, images, banImages, { includeBanMedia: true, includeSellerContact: true }))
  } catch (_error) {
    res.status(500).json({ message: '获取我的商品详情失败' })
  }
})

/**
 * PUT /api/my-listings/:id — 更新我发布的商品
 */
app.put('/api/my-listings/:id', authRequired, authenticatedWriteLimiter, async (req, res) => {
  const listingId = Number(req.params.id)
  const payload = req.body || {}
  const missingField = validateRequiredPayload(payload)

  if (!Number.isFinite(listingId) || listingId <= 0) {
    return res.status(400).json({ message: '商品ID无效' })
  }

  if (missingField) {
    return res.status(400).json({ message: `缺少必填字段：${missingField}` })
  }

  const businessSettings = await loadBusinessSettings(pool)
  const saleItemConfig = getSaleItemConfig(businessSettings)
  const invalidFieldMessage = validateListingPayload(payload, { businessSettings, saleItemConfig })

  if (invalidFieldMessage) {
    return res.status(400).json({ message: invalidFieldMessage })
  }

  const listingRecommendations = businessSettings.listingRecommendations || {}
  const minDepositYuan = Number(listingRecommendations.depositMinYuan || MIN_LISTING_DEPOSIT_YUAN)
  const maxDepositYuan = Number(listingRecommendations.depositMaxYuan || MAX_LISTING_DEPOSIT_YUAN)
  const itemCoverageRate = Math.max(0, Number(listingRecommendations.itemsDepositCoveragePercent || 100))
  const editDepositCent = yuanToCent(payload.deposit) ?? 0
  if (editDepositCent < (yuanToCent(minDepositYuan) ?? 0)) {
    return res.status(400).json({ message: `押金不能低于 ${minDepositYuan} 元` })
  }
  if (editDepositCent > (yuanToCent(maxDepositYuan) ?? 0)) {
    return res.status(400).json({ message: `押金不能超过 ${maxDepositYuan} 元` })
  }
  const editItemsPayload = payload.items && typeof payload.items === 'object' ? payload.items : {}
  let editItemsTotalCent = 0
  for (const [itemKey, config] of Object.entries(saleItemConfig)) {
    const qty = toNullableInteger(editItemsPayload[itemKey]?.quantity) ?? 0
    const itemMode = normalizeListingItemMode(editItemsPayload[itemKey]?.itemMode || editItemsPayload[itemKey]?.mode)
    if (itemMode === 'gift') continue
    editItemsTotalCent += qty * config.unitPriceInCent
  }
  const minimumItemsCoverageAmount = Math.ceil(editItemsTotalCent * itemCoverageRate / 100)
  if (minimumItemsCoverageAmount > 0 && editDepositCent < minimumItemsCoverageAmount) {
    return res.status(400).json({
      message: `押金（¥${centToRoundedYuan(editDepositCent)}）不能低于额外物品覆盖金额（¥${centToRoundedYuan(minimumItemsCoverageAmount)}）`
    })
  }

  const conn = await pool.getConnection()

  try {
    await conn.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci")
    await conn.beginTransaction()

    const [existingRows] = await conn.execute(
      `SELECT
        id, listing_no, owner_user_id, owner_name, listing_status, review_status, published_at, ban_video_url
      FROM listings
      WHERE id = ?
        AND (owner_user_id = ? OR (owner_user_id IS NULL AND owner_name = ?))
      LIMIT 1`,
      [listingId, req.auth.userId, req.auth.username]
    )

    if (!existingRows.length) {
      await conn.rollback()
      return res.status(404).json({ message: '未找到该商品，或你无权编辑' })
    }

    const existingListing = existingRows[0]
    if (existingListing.listing_status === 'pending_review' || existingListing.listing_status === 'sold_out') {
      await conn.rollback()
      return res.status(400).json({ message: '当前状态下不支持编辑商品' })
    }

    const [existingImages] = await conn.execute(
      `SELECT image_url
       FROM listing_images
       WHERE listing_id = ?
       ORDER BY ${getListingImagesOrderSql()}`,
      [listingId]
    )
    const obsoleteListingImageUrls = getObsoleteListingImageUrls(existingImages, payload)
    const existingBanImages = await fetchListingBanImages(conn, listingId)
    const obsoleteBanMediaUrls = getObsoleteBanMediaUrls(
      existingBanImages,
      existingListing.ban_video_url,
      payload
    )

    const derivedValues = computeListingDerivedValues(payload, businessSettings)
    const hafuCoin = toUnsignedInteger(payload.hafuCoin)
    const userBaseRatio = toUnsignedInteger(payload.baseRatio)
    const finalBaseRatio = (userBaseRatio >= 38 && userBaseRatio <= 55) ? userBaseRatio : derivedValues.baseRatio
    const userRentDays = toUnsignedInteger(payload.rentDays)
    const { maxRentDays: rentDaysLimit } = resolveRentDaysRecommendation(payload.hafuCoin, businessSettings)
    const canUseUserRentDays = userRentDays >= 1 && (rentDaysLimit <= 0 || userRentDays <= rentDaysLimit)
    const finalRentDays = canUseUserRentDays ? userRentDays : derivedValues.rentDays
    const finalDailyCost = finalRentDays > 0 && hafuCoin > 0 ? Math.round(hafuCoin / finalRentDays) : derivedValues.dailyCost
    const preciseRentPrice = (hafuCoin * 10000) / finalBaseRatio
    const finalRentPrice = finalBaseRatio > 0 ? Math.round(preciseRentPrice) : 0

    const listingValues = {
      ownerName: existingListing.owner_name || req.auth.username || payload.ownerName || '匿名用户',
      sellerContactWechat: String(payload.sellerContactWechat || '').trim(),
      sellerContactPhone: String(payload.sellerContactPhone || '').trim(),
      insuranceLevel: normalizeInsuranceLevel(payload.insuranceLevel),
      compensationPlan: String(payload.compensationPlan || '').trim(),
      weightLevel: String(payload.weightLevel || '').trim(),
      deposit: yuanToCent(payload.deposit) ?? 0,
      baseRatio: finalBaseRatio,
      loginMethod: String(payload.loginMethod || '').trim(),
      energyLevel: String(payload.energyLevel || '').trim(),
      hafuCoin: hafuCoin,
      rentPrice: finalRentPrice,
      rentDays: finalRentDays,
      loginTimeRange: String(payload.loginTimeRange || '').trim(),
      dailyCost: finalDailyCost,
      secretKd: toDecimalValue(payload.secretKd, 1, 0),
      characterLevel: toUnsignedInteger(payload.characterLevel),
      operatorAppearance: payload.operatorAppearance || null,
      goldSkin: payload.goldSkin || null,
      rank: String(payload.rank || '').trim(),
      knifeSkin: payload.knifeSkin || null,
      weaponSkin: payload.weaponSkin || null,
      region: String(payload.region || '').trim(),
      faceVerified: payload.faceVerified === '是' ? 1 : 0,
      diveLevel: toUnsignedInteger(payload.diveLevel),
      seyedUnlocked: payload.seyedUnlocked === '是' ? 1 : 0,
      remark: payload.remark || '',
      banRecordFlag: toBanRecordFlag(payload.banRecord)
    }

    await conn.execute(
      `UPDATE listings SET
        owner_name = ?, listing_status = ?, review_status = ?, reviewed_by = NULL, reviewed_at = NULL, review_reason = NULL,
        insurance_level = ?, compensation_plan = ?, weight_level = ?, deposit = ?, base_ratio = ?, login_method = ?,
        energy_level = ?, seller_contact_wechat = ?, seller_contact_phone = ?, hafu_coin = ?, rent_price = ?, rent_days = ?, login_time_range = ?, daily_cost = ?,
        secret_kd = ?, character_level = ?, operator_appearance = ?, gold_skin = ?, rank_name = ?,
        knife_skin = ?, weapon_skin = ?, region = ?, face_verified = ?, dive_level = ?, seyed_unlocked = ?,
        remark = ?, ban_record = ?
      WHERE id = ?`,
      [
        listingValues.ownerName,
        'pending_review',
        'pending',
        listingValues.insuranceLevel,
        listingValues.compensationPlan,
        listingValues.weightLevel,
        listingValues.deposit,
        listingValues.baseRatio,
        listingValues.loginMethod,
        listingValues.energyLevel,
        listingValues.sellerContactWechat,
        listingValues.sellerContactPhone,
        listingValues.hafuCoin,
        listingValues.rentPrice,
        listingValues.rentDays,
        listingValues.loginTimeRange,
        listingValues.dailyCost,
        listingValues.secretKd,
        listingValues.characterLevel,
        listingValues.operatorAppearance,
        listingValues.goldSkin,
        listingValues.rank,
        listingValues.knifeSkin,
        listingValues.weaponSkin,
        listingValues.region,
        listingValues.faceVerified,
        listingValues.diveLevel,
        listingValues.seyedUnlocked,
        listingValues.remark,
        listingValues.banRecordFlag,
        listingId
      ]
    )

    await conn.execute('DELETE FROM listing_items WHERE listing_id = ?', [listingId])
    const trustedItems = buildTrustedListingItems(payload.items, businessSettings)
    for (const item of trustedItems) {
      await conn.execute(
        `INSERT INTO listing_items (listing_id, item_key, item_name, item_mode, quantity, unit_price, total_price)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          listingId,
          item.itemKey,
          item.itemName,
          item.itemMode,
          item.quantity,
          item.unitPriceInCent,
          item.totalPriceInCent
        ]
      )
    }

    await saveListingImages(conn, listingId, payload)
    await saveListingBanMedia(conn, listingId, payload)

    await conn.commit()
    await invalidateListingDetailCache(listingId)
    await cleanupOrphanUploadedFiles(conn, [
      ...obsoleteListingImageUrls,
      ...obsoleteBanMediaUrls
    ])
    res.json({
      id: listingId,
      listingNo: existingListing.listing_no,
      message: '商品更新成功，已重新提交审核'
    })
  } catch (_error) {
    await conn.rollback()
    res.status(500).json({ message: '更新商品失败' })
  } finally {
    conn.release()
  }
})

/**
 * PATCH /api/my-listings/:id/status — 更新我发布的商品状态
 *
 * 请求体：
 *   status — 目标状态，仅支持 active / inactive
 */
app.patch('/api/my-listings/:id/status', authRequired, async (req, res) => {
  const listingId = Number(req.params.id)
  const nextStatus = String(req.body?.status || '').trim()

  if (!Number.isFinite(listingId) || listingId <= 0) {
    return res.status(400).json({ message: '商品ID无效' })
  }

  if (!['active', 'inactive'].includes(nextStatus)) {
    return res.status(400).json({ message: '仅支持切换为上架中或已下架' })
  }

  try {
    const [rows] = await pool.execute(
      `SELECT id, listing_status, review_status
       FROM listings
       WHERE id = ?
         AND (owner_user_id = ? OR (owner_user_id IS NULL AND owner_name = ?))
       LIMIT 1`,
      [listingId, req.auth.userId, req.auth.username]
    )

    if (!rows.length) {
      return res.status(404).json({ message: '未找到该商品，或你无权操作' })
    }

    const currentStatus = String(rows[0].listing_status || '')
    const reviewStatus = String(rows[0].review_status || 'approved')
    if (currentStatus === 'pending_review' || currentStatus === 'sold_out') {
      return res.status(400).json({ message: '当前状态下不支持上下架操作' })
    }

    if (nextStatus === 'active' && reviewStatus !== 'approved') {
      return res.status(400).json({ message: '商品尚未审核通过，暂不能上架' })
    }

    if (currentStatus === nextStatus) {
      return res.json({
        message: nextStatus === 'active' ? '商品已处于上架状态' : '商品已处于下架状态',
        listingStatus: currentStatus,
        listingStatusText: listingStatusToLabel(currentStatus)
      })
    }

    await pool.execute(
      'UPDATE listings SET listing_status = ? WHERE id = ?',
      [nextStatus, listingId]
    )
    await invalidateListingDetailCache(listingId)

    res.json({
      message: nextStatus === 'active' ? '商品重新上架成功' : '商品下架成功',
      listingStatus: nextStatus,
      listingStatusText: listingStatusToLabel(nextStatus)
    })
  } catch (_error) {
    res.status(500).json({ message: '更新商品状态失败' })
  }
})
}
