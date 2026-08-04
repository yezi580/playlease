import { computed, unref } from 'vue'

export function useRouteShellUi({
  route,
  showAuth,
  isLoggedIn,
  currentUserRole,
  regularUnreadMessageCount,
  supportUnreadMessageCount
}) {
  const routeName = computed(() => String(route.name || 'home'))

  const currentPageKey = computed(() => {
    if (['home', 'listing-detail'].includes(routeName.value)) return 'resource'
    if (['publish-create', 'publish-edit'].includes(routeName.value)) return 'publish'
    if (['profile', 'order-detail', 'payment-result'].includes(routeName.value)) return 'profile'
    if (routeName.value === 'support-console') return 'support-console'
    if (routeName.value === 'gun-code') return 'gun'
    if (routeName.value === 'boost') return 'boost'
    return 'resource'
  })

  const isListingDetailRoute = computed(() => routeName.value === 'listing-detail')

  const showTopBarBackAction = computed(() => {
    return ['listing-detail', 'publish-create', 'publish-edit', 'order-detail', 'payment-result'].includes(routeName.value)
  })

  const topBarBackActionText = computed(() => {
    if (['publish-create', 'publish-edit'].includes(routeName.value)) {
      return routeName.value === 'publish-edit' && route.query.from === 'profile' ? '返回个人中心' : '返回列表'
    }
    if (routeName.value === 'order-detail') {
      return route.query.from === 'profile' ? '返回个人中心' : '返回列表'
    }
    if (routeName.value === 'payment-result') {
      return '返回个人中心'
    }
    if (routeName.value === 'listing-detail') {
      if (route.query.from === 'profile') return '返回个人中心'
      if (route.query.from === 'order') return '返回订单详情'
      return '返回列表'
    }
    return '返回'
  })

  const highlightTopBarBackAction = computed(() => {
    return ['listing-detail', 'publish-create', 'publish-edit', 'order-detail'].includes(routeName.value)
  })

  const showTopBarListingSearch = computed(() => {
    return routeName.value === 'home' && !unref(showAuth)
  })

  const listingSearchValue = computed(() => String(route.query.listingNo || '').trim())

  const hasBottomActionBar = computed(() => {
    return ['listing-detail', 'publish-create', 'publish-edit'].includes(routeName.value)
  })

  const hasRegularUnreadMessages = computed(() => Number(unref(regularUnreadMessageCount) || 0) > 0)
  const hasSupportUnreadMessages = computed(() => Number(unref(supportUnreadMessageCount) || 0) > 0)

  const showSupportConsoleEntry = computed(() => {
    return unref(isLoggedIn) && unref(currentUserRole) === 'support'
  })

  const supportConsoleLabel = computed(() => '客服工作台')

  return {
    routeName,
    currentPageKey,
    isListingDetailRoute,
    showTopBarBackAction,
    topBarBackActionText,
    highlightTopBarBackAction,
    showTopBarListingSearch,
    listingSearchValue,
    hasBottomActionBar,
    hasRegularUnreadMessages,
    hasSupportUnreadMessages,
    showSupportConsoleEntry,
    supportConsoleLabel
  }
}
