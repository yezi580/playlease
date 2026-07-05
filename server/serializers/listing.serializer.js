/**
 * 商品响应序列化逻辑，用于统一金额字段和返回结构。
 */

import { normalizeCentAmount } from '../utils/money.js'
import { normalizeListingItemMode } from '../modules/listing/listing-validator.js'
import { normalizeSaleItemRow } from '../constants/saleItems.js'

function banRecordFlagToLabel(value) {
  return Number(value) === 1 ? '有' : '无'
}

const listingStatusLabelMap = {
  active: '上架中',
  inactive: '已下架',
  pending_review: '审核中',
  sold_out: '已售出',
  rented: '已租出'
}

export function listingStatusToLabel(status) {
  return listingStatusLabelMap[status] || '未知状态'
}

export function normalizeListingMoneyFields(row) {
  return {
    ...row,
    deposit: normalizeCentAmount(row.deposit),
    rent_price: normalizeCentAmount(row.rent_price),
    ban_record: banRecordFlagToLabel(row.ban_record)
  }
}

export function buildListingDetailPayload(row, items, images, banImages = [], options = {}) {
  const includeBanMedia = Boolean(options.includeBanMedia)
  return {
    ...normalizeListingMoneyFields(row),
    items: items.map((item) => {
      const normalizedItem = normalizeSaleItemRow(item)
      return {
        ...normalizedItem,
        item_mode: normalizeListingItemMode(normalizedItem.item_mode),
        unit_price: normalizeCentAmount(normalizedItem.unit_price),
        total_price: normalizeCentAmount(normalizedItem.total_price)
      }
    }),
    images: images.map((imageRow) => imageRow.image_url),
    banImages: includeBanMedia ? banImages.map((imageRow) => imageRow.image_url) : [],
    banVideo: includeBanMedia ? (row.ban_video_url || '') : ''
  }
}

export function normalizeMyListingFields(row) {
  return {
    ...row,
    rent_price: normalizeCentAmount(row.rent_price),
    deposit: normalizeCentAmount(row.deposit),
    listing_status_text: listingStatusToLabel(row.listing_status)
  }
}

export function buildMyListingStatsPayload(row) {
  return {
    total: Number(row?.total || 0),
    active: Number(row?.active || 0),
    inactive: Number(row?.inactive || 0),
    pending_review: Number(row?.pending_review || 0),
    sold_out: Number(row?.sold_out || 0),
    rented: Number(row?.rented || 0)
  }
}

