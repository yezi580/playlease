/**
 * 受保护封禁媒体的访问规则及相关鉴权校验。
 */

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
