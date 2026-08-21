/**
 * 商品增值服务项使用的静态配置。
 */

export const SALE_ITEM_CONFIG = {
  topCard: { itemName: '顶级保险卡', unitPriceInCent: 200 },
  awmBullet: { itemName: 'AWM子弹（发）', unitPriceInCent: 60, buyerUnitPriceInCent: 80 },
  barrettBullet: { itemName: '巴雷特子弹（发）', remark: '指穿甲弹，别的不值钱', unitPriceInCent: 30 },
  bulletLv6: { itemName: '6级子弹（组）', unitPriceInCent: 600 },
  bullet762x54R: { itemName: '6级7.62×54R（组）', unitPriceInCent: 600 },
  bullet762x51: { itemName: '6级7.62×51（组）', unitPriceInCent: 600 },
  bullet68x51: { itemName: '6级6.8×51（组）', unitPriceInCent: 600 },
  helmetLv6: { itemName: '6级头盔', unitPriceInCent: 200, buyerUnitPriceInCent: 250 },
  armorLv6: { itemName: '6级护甲', unitPriceInCent: 200, buyerUnitPriceInCent: 250 },
  coffeeBean: { itemName: '高级咖啡豆', unitPriceInCent: 300 },
  bulletPart: { itemName: '高级子弹零件', unitPriceInCent: 300 }
}

export function getSaleItemDisplayName(itemKey, fallbackName = '') {
  const normalizedFallbackName = String(fallbackName || '').trim()
  return normalizedFallbackName || SALE_ITEM_CONFIG[itemKey]?.itemName || ''
}

export function normalizeSaleItemRow(row) {
  if (!row || typeof row !== 'object') return row
  return {
    ...row,
    item_name: getSaleItemDisplayName(row.item_key, row.item_name),
    item_remark: SALE_ITEM_CONFIG[row.item_key]?.remark || ''
  }
}
