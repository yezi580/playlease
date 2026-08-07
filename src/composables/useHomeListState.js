import { reactive } from 'vue'

export function createDefaultHomeFilters() {
  return {
    loginTimeRange: '',
    insuranceLevel: '9格',
    energyLevel: '7级',
    weightLevel: '7级',
    knifeSkin: '',
    operatorAppearance: [],
    loginMethod: '',
    rentPrice: '',
    hafuCoin: '',
    deposit: ''
  }
}

export function createEmptyHomeFilters() {
  return {
    loginTimeRange: '',
    insuranceLevel: '',
    energyLevel: '',
    weightLevel: '',
    knifeSkin: '',
    operatorAppearance: [],
    loginMethod: '',
    rentPrice: '',
    hafuCoin: '',
    deposit: ''
  }
}

function createInitialHomeListState() {
  return {
    initialized: false,
    hasLoaded: false,
    currentSortKey: 'default',
    currentSortOrder: 'desc',
    smallAmountOnly: false,
    highRatioOnly: false,
    resourceFilters: createDefaultHomeFilters(),
    listingNoSearch: '',
    listings: [],
    listTotal: 0,
    currentListPage: 1,
    pageSize: 10,
    scrollTop: 0
  }
}

const homeListState = reactive(createInitialHomeListState())

function cloneFilters(filters, fallbackFactory = createDefaultHomeFilters) {
  const base = fallbackFactory()
  return {
    ...base,
    ...(filters || {}),
    operatorAppearance: Array.isArray(filters?.operatorAppearance)
      ? [...filters.operatorAppearance]
      : []
  }
}

function cloneListings(listings) {
  return Array.isArray(listings) ? listings.map((item) => ({ ...item })) : []
}

export function getHomeListStateSnapshot() {
  return {
    initialized: homeListState.initialized,
    hasLoaded: homeListState.hasLoaded,
    currentSortKey: homeListState.currentSortKey,
    currentSortOrder: homeListState.currentSortOrder,
    smallAmountOnly: homeListState.smallAmountOnly,
    highRatioOnly: homeListState.highRatioOnly,
    resourceFilters: cloneFilters(
      homeListState.resourceFilters,
      homeListState.listingNoSearch ? createEmptyHomeFilters : createDefaultHomeFilters
    ),
    listingNoSearch: homeListState.listingNoSearch,
    listings: cloneListings(homeListState.listings),
    listTotal: Number(homeListState.listTotal || 0),
    currentListPage: Number(homeListState.currentListPage || 1),
    pageSize: Number(homeListState.pageSize || 10),
    scrollTop: Number(homeListState.scrollTop || 0)
  }
}

export function updateHomeListState(patch = {}) {
  if ('hasLoaded' in patch) homeListState.hasLoaded = Boolean(patch.hasLoaded)
  if ('currentSortKey' in patch) homeListState.currentSortKey = patch.currentSortKey || 'default'
  if ('currentSortOrder' in patch) homeListState.currentSortOrder = patch.currentSortOrder || 'desc'
  if ('smallAmountOnly' in patch) homeListState.smallAmountOnly = Boolean(patch.smallAmountOnly)
  if ('highRatioOnly' in patch) homeListState.highRatioOnly = Boolean(patch.highRatioOnly)
  if ('resourceFilters' in patch) {
    const fallbackFactory = patch.listingNoSearch || homeListState.listingNoSearch
      ? createEmptyHomeFilters
      : createDefaultHomeFilters
    homeListState.resourceFilters = cloneFilters(patch.resourceFilters, fallbackFactory)
  }
  if ('listingNoSearch' in patch) homeListState.listingNoSearch = String(patch.listingNoSearch || '').trim()
  if ('listings' in patch) homeListState.listings = cloneListings(patch.listings)
  if ('listTotal' in patch) homeListState.listTotal = Number(patch.listTotal || 0)
  if ('currentListPage' in patch) homeListState.currentListPage = Number(patch.currentListPage || 1)
  if ('pageSize' in patch) homeListState.pageSize = Number(patch.pageSize || 10)
  if ('scrollTop' in patch) homeListState.scrollTop = Number(patch.scrollTop || 0)
  homeListState.initialized = true
}

export function resetHomeListState() {
  Object.assign(homeListState, createInitialHomeListState())
}
