/**
 * 公开商品 HTTP 路由，处理浏览、详情与发布操作。
 */

import {
  getListingHotMinUniqueClickCount,
  getPendingPaymentTimeoutMinutes,
  getSaleItemConfig,
  loadBusinessSettings
} from '../modules/business-settings/runtime.js'

function parseRangeFilter(value) {
  if (!value || typeof value !== 'string') return null
  let raw = value

  if (raw.startsWith('custom:')) {
    raw = raw.slice(7)
  }

  const parts = raw.split('-').map((s) => Number(s.trim()))
  if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null

  const min = Math.min(parts[0], parts[1])
  const max = Math.max(parts[0], parts[1])
  return { min, max }
}

async function resolveListingIdByIdentifier(pool, identifier) {
  const normalizedIdentifier = String(identifier || '').trim()
  if (!normalizedIdentifier) return null

  const [listingNoRows] = await pool.execute(
    'SELECT id FROM listings WHERE listing_no = ? LIMIT 1',
    [normalizedIdentifier]
  )
  if (listingNoRows.length) {
    return Number(listingNoRows[0].id)
  }

  const numericId = Number(normalizedIdentifier)
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return null
  }

  return numericId
}

export function registerListingRoutes(deps) {
  const {
    app,
    pool,
    authRequired,
    publicReadLimiter,
    authenticatedWriteLimiter,
    publishLimiter,
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
    computeListingDerivedValues,
    resolveRentDaysRecommendation,
    toUnsignedInteger,
    toDecimalValue,
    toBanRecordFlag,
    buildTrustedListingItems,
    saveListingImages,
    saveListingBanMedia,
    generateListingNo,
    buildBuyerRentPriceSql,
    getListingImagesOrderSql,
    normalizeListingMoneyFields,
    buildListingDetailPayload,
    fetchListingBanImages,
    getListingDetailCache,
    setListingDetailCache,
    invalidateListingDetailCache
  } = deps


//点击提交发布后的后端动作
  app.get('/api/business-settings/public', publicReadLimiter, async (_req, res) => {
    try {
      const settings = await loadBusinessSettings(pool)
      res.json({ settings })
    } catch (_error) {
      res.status(500).json({ message: '获取业务配置失败' })
    }
  })

  app.post('/api/listings', authRequired, publishLimiter, async (req, res) => {
    const payload = req.body || {}
    const missingField = validateRequiredPayload(payload)

    //必填项校验
    if (missingField) {
      return res.status(400).json({
        message: `缺少必填字段：${missingField}`
      })
    }

    const businessSettings = await loadBusinessSettings(pool)
    const saleItemConfig = getSaleItemConfig(businessSettings)
    const invalidFieldMessage = validateListingPayload(payload, { businessSettings, saleItemConfig })

    if (invalidFieldMessage) {
      return res.status(400).json({ message: invalidFieldMessage })
    }

    //读取平台配置  
    const listingRecommendations = businessSettings.listingRecommendations || {}
    const minDepositYuan = Number(listingRecommendations.depositMinYuan || MIN_LISTING_DEPOSIT_YUAN)
    const maxDepositYuan = Number(listingRecommendations.depositMaxYuan || MAX_LISTING_DEPOSIT_YUAN)
    const itemCoverageRate = Math.max(0, Number(listingRecommendations.itemsDepositCoveragePercent || 100))
    const depositCent = yuanToCent(payload.deposit) ?? 0
    if (depositCent < (yuanToCent(minDepositYuan) ?? 0)) {
      return res.status(400).json({ message: `押金不能低于 ${minDepositYuan} 元` })
    }
    if (depositCent > (yuanToCent(maxDepositYuan) ?? 0)) {
      return res.status(400).json({ message: `押金不能超过 ${maxDepositYuan} 元` })
    }
    const itemsPayload = payload.items && typeof payload.items === 'object' ? payload.items : {}
    let itemsTotalInCent = 0
    for (const [itemKey, config] of Object.entries(saleItemConfig)) {
      const qty = toNullableInteger(itemsPayload[itemKey]?.quantity) ?? 0
      const itemMode = normalizeListingItemMode(itemsPayload[itemKey]?.itemMode || itemsPayload[itemKey]?.mode)
      if (itemMode === 'gift') continue
      itemsTotalInCent += qty * config.unitPriceInCent
    }
    const minimumItemsCoverageAmount = Math.ceil(itemsTotalInCent * itemCoverageRate / 100)
    if (minimumItemsCoverageAmount > 0 && depositCent < minimumItemsCoverageAmount) {
      return res.status(400).json({
        message: `押金（¥${centToRoundedYuan(depositCent)}）不能低于额外物品覆盖金额（¥${centToRoundedYuan(minimumItemsCoverageAmount)}）`
      })
    }

    const conn = await pool.getConnection()
    try {
      await conn.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci")
      await conn.beginTransaction()

      if (!req.auth?.userId) {
        await conn.rollback()
        return res.status(401).json({ message: '登录状态异常，请重新登录后发布' })
      }

      const [ownerRows] = await conn.execute(
        'SELECT id, username FROM users WHERE id = ? LIMIT 1',
        [req.auth.userId]
      )

      if (!Array.isArray(ownerRows) || !ownerRows.length) {
        await conn.rollback()
        return res.status(401).json({ message: '登录状态异常，请重新登录后发布' })
      }

      const resolvedOwnerUserId = ownerRows[0].id
      const resolvedOwnerName = ownerRows[0].username || req.auth?.username || payload.ownerName || '匿名用户'
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

      console.log('[租金计算调试] 发布商品参数:', {
        hafuCoin,
        userBaseRatio: payload.baseRatio,
        derivedBaseRatio: derivedValues.baseRatio,
        finalBaseRatio,
        userRentDays: payload.rentDays,
        derivedRentDays: derivedValues.rentDays,
        finalRentDays,
        finalDailyCost,
        preciseRentPrice,
        finalRentPrice
      })

      const listingValues = {
        ownerUserId: resolvedOwnerUserId,
        ownerName: resolvedOwnerName,
        sellerContactWechat: String(payload.sellerContactWechat || '').trim(),
        listingStatus: 'pending_review',
        reviewStatus: 'pending',
        publishedAt: payload.publishedAt ? new Date(payload.publishedAt) : new Date(),
        insuranceLevel: normalizeInsuranceLevel(payload.insuranceLevel),
        compensationPlan: String(payload.compensationPlan || '').trim(),
        weightLevel: String(payload.weightLevel || '').trim(),
        deposit: yuanToCent(payload.deposit) ?? 0,
        baseRatio: finalBaseRatio,
        loginMethod: String(payload.loginMethod || '').trim(),
        energyLevel: String(payload.energyLevel || '').trim(),
        hafuCoin,
        rentPrice: finalRentPrice,
        rentDays: finalRentDays,
        loginTimeRange: String(payload.loginTimeRange || '').trim(),
        dailyCost: Math.round(finalDailyCost),
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
        decontaminationChamberLevel: toUnsignedInteger(payload.decontaminationChamberLevel),
        remark: payload.remark || '',
        banRecordFlag: toBanRecordFlag(payload.banRecord)
      }
      listingValues.listingNo = await generateListingNo(conn, listingValues.publishedAt)

      const [listingResult] = await conn.execute(
        `INSERT INTO listings (
          listing_no, owner_user_id, owner_name, listing_status, review_status, published_at, insurance_level, compensation_plan, weight_level, deposit, base_ratio, login_method,
          energy_level, seller_contact_wechat, hafu_coin, rent_price, rent_days, login_time_range, daily_cost,
          secret_kd, character_level, operator_appearance, gold_skin, rank_name,
          knife_skin, weapon_skin, region, face_verified, dive_level, decontamination_chamber_level,
          remark, ban_record
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
        [
          listingValues.listingNo,
          listingValues.ownerUserId,
          listingValues.ownerName,
          listingValues.listingStatus,
          listingValues.reviewStatus,
          listingValues.publishedAt,
          listingValues.insuranceLevel,
          listingValues.compensationPlan,
          listingValues.weightLevel,
          listingValues.deposit,
          listingValues.baseRatio,
          listingValues.loginMethod,
          listingValues.energyLevel,
          listingValues.sellerContactWechat,
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
          listingValues.decontaminationChamberLevel,
          listingValues.remark,
          listingValues.banRecordFlag
        ]
      )

      const listingId = listingResult.insertId
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
      res.status(201).json({ id: listingId, listingNo: listingValues.listingNo, message: '发布成功，等待管理员审核' })
    } catch (error) {
      await conn.rollback()
      console.error('[publish] failed:', {
        message: error.message,
        code: error.code,
        errno: error.errno,
        sqlMessage: error.sqlMessage,
        banRecordRaw: payload?.banRecord,
        banRecordFlag: toBanRecordFlag(payload?.banRecord),
        remark: payload?.remark
      })
      res.status(500).json({ message: '发布失败' })
    } finally {
      conn.release()
    }
  })

  app.get('/api/listings', publicReadLimiter, async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1))
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || 20)))
    const offset = (page - 1) * pageSize
    const sortBy = String(req.query.sortBy || 'hot')
    const businessSettings = await loadBusinessSettings(pool)
    const hotMinUniqueClickCount = getListingHotMinUniqueClickCount(businessSettings)
    const buyerRentPriceSql = buildBuyerRentPriceSql('l', businessSettings.platformCommission?.buyerServiceFeeRatePercent)

    const where = ["l.listing_status = 'active'"]
    where.push("NOT EXISTS (SELECT 1 FROM orders o WHERE o.listing_id = l.id AND o.status IN ('pending_payment', 'paid', 'support_handling', 'settlement_pending'))")
    const values = []

    if (req.query.insuranceLevel) {
      where.push('l.insurance_level = ?')
      values.push(normalizeInsuranceLevel(req.query.insuranceLevel))
    }
    if (req.query.energyLevel) {
      where.push('l.energy_level = ?')
      values.push(req.query.energyLevel)
    }
    if (req.query.weightLevel) {
      where.push('l.weight_level = ?')
      values.push(req.query.weightLevel)
    }
    if (req.query.rank) {
      where.push('l.rank_name = ?')
      values.push(req.query.rank)
    }
    if (req.query.loginMethod) {
      where.push('l.login_method = ?')
      values.push(req.query.loginMethod)
    }
    if (req.query.listingNo) {
      where.push('l.listing_no = ?')
      values.push(String(req.query.listingNo).trim())
    }

    if (req.query.region) {
      where.push('l.region LIKE ?')
      values.push(`%${req.query.region}%`)
    }
    if (req.query.regionProvince) {
      where.push('l.region LIKE ?')
      values.push(`%${req.query.regionProvince}%`)
    }
    if (req.query.regionCity) {
      where.push('l.region LIKE ?')
      values.push(`%${req.query.regionCity}%`)
    }
    if (String(req.query.smallAmountZone || '') === '1') {
      where.push('l.hafu_coin < ?')
      values.push(Number(businessSettings.discoveryThresholds?.smallAmountHafuCoinMax || 150))
    }
    if (String(req.query.highRatioZone || '') === '1') {
      where.push('l.base_ratio >= ?')
      values.push(Number(businessSettings.discoveryThresholds?.highRatioBaseRatioMin || 43))
    }

    if (req.query.hafuCoin) {
      const range = parseRangeFilter(req.query.hafuCoin)
      if (range) {
        where.push('l.hafu_coin >= ? AND l.hafu_coin <= ?')
        values.push(range.min, range.max)
      } else if (req.query.hafuCoin && !req.query.hafuCoin.includes('-') && !req.query.hafuCoin.startsWith('custom:')) {
        where.push('l.hafu_coin = ?')
        values.push(Number(req.query.hafuCoin))
      }
    }

    if (req.query.rentPrice) {
      const range = parseRangeFilter(req.query.rentPrice)
      if (range) {
        where.push(`(${buyerRentPriceSql}) >= ? AND (${buyerRentPriceSql}) <= ?`)
        values.push(yuanToCent(range.min) ?? 0, yuanToCent(range.max) ?? 0)
      } else if (req.query.rentPrice && !req.query.rentPrice.includes('-') && !req.query.rentPrice.startsWith('custom:')) {
        where.push(`(${buyerRentPriceSql}) = ?`)
        values.push(yuanToCent(req.query.rentPrice) ?? 0)
      }
    }

    if (req.query.deposit) {
      const range = parseRangeFilter(req.query.deposit)
      if (range) {
        where.push('l.deposit >= ? AND l.deposit <= ?')
        values.push(yuanToCent(range.min) ?? 0, yuanToCent(range.max) ?? 0)
      } else if (req.query.deposit && !req.query.deposit.includes('-') && !req.query.deposit.startsWith('custom:')) {
        where.push('l.deposit = ?')
        values.push(yuanToCent(req.query.deposit) ?? 0)
      }
    }

    if (req.query.totalAmount) {
      const range = parseRangeFilter(req.query.totalAmount)
      if (range) {
        where.push(`((${buyerRentPriceSql}) + l.deposit) >= ? AND ((${buyerRentPriceSql}) + l.deposit) <= ?`)
        values.push(yuanToCent(range.min) ?? 0, yuanToCent(range.max) ?? 0)
      }
    }

    if (req.query.characterLevel) {
      const range = parseRangeFilter(req.query.characterLevel)
      if (range) {
        where.push('l.character_level >= ? AND l.character_level <= ?')
        values.push(range.min, range.max)
      } else if (req.query.characterLevel && !req.query.characterLevel.includes('-') && !req.query.characterLevel.startsWith('custom:')) {
        where.push('l.character_level = ?')
        values.push(Number(req.query.characterLevel))
      }
    }

    if (req.query.minRent) {
      const minRent = Number(req.query.minRent)
      if (Number.isFinite(minRent)) {
        where.push(`(${buyerRentPriceSql}) >= ?`)
        values.push(yuanToCent(minRent) ?? 0)
      }
    }
    if (req.query.maxRent) {
      const maxRent = Number(req.query.maxRent)
      if (Number.isFinite(maxRent)) {
        where.push(`(${buyerRentPriceSql}) <= ?`)
        values.push(yuanToCent(maxRent) ?? 0)
      }
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const orderMap = {
      hot: `CASE
        WHEN COALESCE(hot.recent_unique_click_7d, 0) >= ${Math.max(1, Number(hotMinUniqueClickCount || 1))}
        THEN 0
        ELSE 1
      END ASC, COALESCE(hot.recent_unique_click_7d, 0) DESC, l.created_at DESC`,
      latest: 'l.created_at DESC',
      rent_asc: `${buyerRentPriceSql} ASC`,
      rent_desc: `${buyerRentPriceSql} DESC`,
      ratio_asc: 'l.base_ratio ASC',
      ratio_desc: 'l.base_ratio DESC',
      hafu_asc: 'l.hafu_coin ASC',
      hafu_desc: 'l.hafu_coin DESC',
      awm_asc: 'COALESCE(CAST(awm_bullet_qty AS DECIMAL(12, 2)), 0) ASC',
      awm_desc: 'COALESCE(CAST(awm_bullet_qty AS DECIMAL(12, 2)), 0) DESC',
      helmet_asc: 'COALESCE(CAST(helmet_lv6_qty AS DECIMAL(12, 2)), 0) ASC',
      helmet_desc: 'COALESCE(CAST(helmet_lv6_qty AS DECIMAL(12, 2)), 0) DESC',
      armor_asc: 'COALESCE(CAST(armor_lv6_qty AS DECIMAL(12, 2)), 0) ASC',
      armor_desc: 'COALESCE(CAST(armor_lv6_qty AS DECIMAL(12, 2)), 0) DESC'
    }
    const orderSql = orderMap[sortBy] || orderMap.latest

    try {
      const limitSafe = Number.isFinite(pageSize) ? pageSize : 20
      const offsetSafe = Number.isFinite(offset) ? offset : 0

      const [rows] = await pool.execute(
        `SELECT
          l.id, l.listing_no, l.owner_name, l.insurance_level, l.weight_level, l.login_method, l.hafu_coin,
          l.rent_price, l.rent_days, l.rank_name, l.region, l.base_ratio, l.created_at,
          l.deposit, l.energy_level, l.secret_kd, l.character_level, l.daily_cost, l.login_time_range,
          l.face_verified, l.dive_level, l.decontamination_chamber_level,
          l.knife_skin, l.operator_appearance, l.gold_skin, l.weapon_skin,
          COALESCE(hot.recent_unique_click_7d, 0) AS recent_unique_click_7d,
          (
            SELECT quantity FROM listing_items li_item
            WHERE li_item.listing_id = l.id
              AND (
                li_item.item_key IN ('awmBullet', 'awm_bullet_qty', 'awmBulletQty')
                OR li_item.item_name LIKE 'AWM子弹%'
              )
            ORDER BY li_item.id DESC LIMIT 1
          ) AS awm_bullet_qty,
          (
            SELECT COALESCE(SUM(quantity), 0) FROM listing_items li_item
            WHERE li_item.listing_id = l.id
              AND (
                li_item.item_key IN ('bulletLv6', 'bullet_lv6_qty', 'bulletLv6Qty', 'bullet762x54R', 'bullet762x51', 'bullet68x51')
                OR li_item.item_name LIKE '6级子弹%'
                OR li_item.item_name LIKE '7.62×54R%'
                OR li_item.item_name LIKE '7.62×51%'
                OR li_item.item_name LIKE '6.8×51%'
              )
          ) AS bullet_lv6_qty,
          (
            SELECT quantity FROM listing_items li_item
            WHERE li_item.listing_id = l.id
              AND (
                li_item.item_key IN ('barrettBullet', 'barrett_bullet_qty', 'barrettBulletQty')
                OR li_item.item_name LIKE '巴雷特子弹%'
                OR li_item.item_name LIKE '巴雷特穿甲弹%'
              )
            ORDER BY li_item.id DESC LIMIT 1
          ) AS barrett_bullet_qty,
          (
            SELECT quantity FROM listing_items li_item
            WHERE li_item.listing_id = l.id
              AND (
                li_item.item_key IN ('helmetLv6', 'helmet_lv6_qty', 'helmetLv6Qty')
                OR li_item.item_name LIKE '6级头盔%'
              )
            ORDER BY li_item.id DESC LIMIT 1
          ) AS helmet_lv6_qty,
          (
            SELECT quantity FROM listing_items li_item
            WHERE li_item.listing_id = l.id
              AND (
                li_item.item_key IN ('armorLv6', 'armor_lv6_qty', 'armorLv6Qty')
                OR li_item.item_name LIKE '6级护甲%'
              )
            ORDER BY li_item.id DESC LIMIT 1
          ) AS armor_lv6_qty,
          (
            SELECT image_url FROM listing_images li
            WHERE li.listing_id = l.id ORDER BY ${getListingImagesOrderSql('li')} LIMIT 1
          ) AS cover_image,
          (
            SELECT image_url FROM listing_images li
            WHERE li.listing_id = l.id ORDER BY ${getListingImagesOrderSql('li')} LIMIT 1 OFFSET 1
          ) AS secondary_image
        FROM listings l
        LEFT JOIN (
          SELECT
            listing_id,
            COUNT(*) AS recent_unique_click_7d
          FROM listing_click_users
          WHERE last_clicked_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
          GROUP BY listing_id
        ) hot ON hot.listing_id = l.id
        ${whereSql}
        ORDER BY ${orderSql}
        LIMIT ${limitSafe} OFFSET ${offsetSafe}`,
        values
      )

      const [countRows] = await pool.execute(
        `SELECT COUNT(*) AS total FROM listings l ${whereSql}`,
        values
      )

      res.json({
        list: rows.map(normalizeListingMoneyFields),
        total: countRows[0].total,
        page,
        pageSize
      })
    } catch (error) {
      console.error('[listings] list query failed', error)
      res.status(500).json({ message: '获取列表失败' })
    }
  })

  app.post('/api/listings/:id/click', authRequired, authenticatedWriteLimiter, async (req, res) => {
    const listingIdentifier = String(req.params.id || '').trim()
    const listingId = await resolveListingIdByIdentifier(pool, listingIdentifier)
    if (!listingId) {
      return res.status(400).json({ message: '无效的商品ID' })
    }

    const userId = Number(req.auth?.userId || 0)
    if (!userId) {
      return res.status(401).json({ message: '请先登录后再试' })
    }

    try {
      const [rows] = await pool.execute(
        `SELECT id
         FROM listings
         WHERE id = ? AND listing_status IN ('active', 'rented')
         LIMIT 1`,
        [listingId]
      )

      if (!rows.length) {
        return res.status(404).json({ message: '商品不存在' })
      }

      await pool.execute(
        `INSERT INTO listing_click_users (
          listing_id,
          user_id,
          first_clicked_at,
          last_clicked_at
        ) VALUES (?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          last_clicked_at = NOW(),
          updated_at = NOW()`,
        [listingId, userId]
      )

      res.json({ ok: true })
    } catch (_error) {
      res.status(500).json({ message: '记录点击失败' })
    }
  })

  app.get('/api/listings/:id', publicReadLimiter, async (req, res) => {
    const listingIdentifier = String(req.params.id || '').trim()
    const listingId = await resolveListingIdByIdentifier(pool, listingIdentifier)
    if (!listingId) {
      return res.status(400).json({ message: '无效的商品ID' })
    }

    try {
      const cachedPayload = await getListingDetailCache(listingId)
      if (cachedPayload) {
        return res.json(cachedPayload)
      }

      const [rows] = await pool.execute(
        `SELECT
          id, listing_no, owner_name, insurance_level, compensation_plan, weight_level, deposit, base_ratio, login_method,
          energy_level, hafu_coin, rent_price, rent_days, login_time_range, daily_cost,
          secret_kd, character_level, operator_appearance, gold_skin, rank_name,
          knife_skin, weapon_skin, region, face_verified, dive_level, decontamination_chamber_level,
          listing_status,
          remark, ban_record, ban_video_url, created_at
        FROM listings
        WHERE id = ? AND listing_status IN ('active', 'rented')`,
        [listingId]
      )

      if (!rows.length) {
        return res.status(404).json({ message: '商品不存在' })
      }

      const [items] = await pool.execute(
        `SELECT item_key, item_name, item_mode, quantity, unit_price, total_price
         FROM listing_items WHERE listing_id = ? ORDER BY id ASC`,
        [listingId]
      )

      const [images] = await pool.execute(
        `SELECT image_url FROM listing_images WHERE listing_id = ? ORDER BY ${getListingImagesOrderSql()}`,
        [listingId]
      )

      const banImages = await fetchListingBanImages(pool, listingId)
      const payload = buildListingDetailPayload(rows[0], items, images, banImages, { includeBanMedia: true })
      await setListingDetailCache(listingId, payload)
      res.json(payload)
    } catch (_error) {
      res.status(500).json({ message: '获取详情失败' })
    }
  })
}
