/**
 * 受保护封禁媒体的访问规则及相关鉴权校验。
 */

export function canAccessProtectedBanMedia({
  isLoggedIn = false,
  isAdmin = false,
  isSupport = false,
  isOwner = false,
  isBuyer = false,
  isActiveListing = false
} = {}) {
  if (!isLoggedIn) return false
  if (isAdmin || isSupport || isOwner || isBuyer) return true
  return Boolean(isActiveListing)
}
