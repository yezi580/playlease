export const LISTING_DETAIL_LOGIN_TIP = '登录后可查看完整商品详情与交易保障信息'

export const ACCESS_POLICY = Object.freeze({
  listingDetail: Object.freeze({
    resourceRequiresLogin: true
  }),
  media: Object.freeze({
    listingImagesPublic: true,
    banMediaRequiresLogin: true
  })
})

export function canOpenListingDetail({ isLoggedIn = false, source = 'resource' } = {}) {
  if (source === 'resource') {
    return ACCESS_POLICY.listingDetail.resourceRequiresLogin ? Boolean(isLoggedIn) : true
  }
  return true
}

export function canAccessProtectedBanMedia({
  isLoggedIn = false,
  isAdmin = false,
  isOwner = false,
  isBuyer = false,
  isActiveListing = false
} = {}) {
  if (!isLoggedIn) return false
  if (isAdmin || isOwner || isBuyer) return true
  return Boolean(isActiveListing)
}
