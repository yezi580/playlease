<template>
  <div>
    <div class="resource-toolbar" :style="toolbarGlassStyle">
      <FilterBar v-model="resourceFilters" @search="handleFilterSearch" />
      <SortBar
        :current-sort-key="currentSortKey"
        :current-sort-order="currentSortOrder"
        :small-amount-only="smallAmountOnly"
        :high-ratio-only="highRatioOnly"
        :listing-search-value="listingNoSearch"
        :listing-search-loading="listLoading"
        @change-sort="handleSortChange"
        @search-listing-no="handleListingNoSearch"
      />
    </div>

    <div v-if="listLoading" class="empty-state">正在加载商品列表...</div>
    <div v-else-if="!listings.length" class="empty-state">暂无匹配商品，试试调整筛选条件。</div>
    <div v-else>
      <div class="list">
        <ProductCard
          v-for="item in listings"
          :key="item.id"
          :item="item"
          @view-detail="handleViewDetail"
        />
      </div>
      <div
        v-if="hasMoreListings"
        ref="loadMoreSentinel"
        class="load-more-sentinel"
        aria-hidden="true"
      ></div>
      <div v-if="listAppending" class="list-status">正在加载更多商品...</div>
      <div v-else-if="hasMoreListings" class="list-status">继续下滑加载更多</div>
      <div v-else class="list-status">已显示全部 {{ listTotal }} 条商品</div>
    </div>
  </div>
</template>

<script>
import FilterBar from '../components/FilterBar.vue'
import SortBar from '../components/SortBar.vue'
import ProductCard from '../components/ProductCard.vue'
import {
  createDefaultHomeFilters,
  createEmptyHomeFilters,
  getHomeListStateSnapshot,
  updateHomeListState
} from '../composables/useHomeListState.js'
import { apiFetch } from '../utils/api.js'
import { canOpenListingDetail, LISTING_DETAIL_LOGIN_TIP } from '../constants/accessPolicy.js'
import { showErrorToast } from '../utils/toast.js'

export default {
  name: 'HomePage',
  components: {
    FilterBar,
    SortBar,
    ProductCard
  },
  props: {
    isLoggedIn: {
      type: Boolean,
      default: false
    }
  },
  emits: ['require-login', 'auth-expired'],
  data() {
    const cachedState = getHomeListStateSnapshot()
    return {
      currentSortKey: cachedState.currentSortKey,
      currentSortOrder: cachedState.currentSortOrder,
      smallAmountOnly: cachedState.smallAmountOnly,
      highRatioOnly: cachedState.highRatioOnly,
      listLoading: false,
      listAppending: false,
      listings: cachedState.listings,
      listTotal: cachedState.listTotal,
      currentListPage: cachedState.currentListPage,
      pageSize: cachedState.pageSize,
      listRequestSeq: 0,
      loadMoreObserver: null,
      resourceFilters: cachedState.resourceFilters,
      listingNoSearch: cachedState.listingNoSearch,
      pendingViewStateRestore: cachedState.initialized
        ? {
            scrollTop: cachedState.scrollTop,
            listingNoSearch: cachedState.listingNoSearch
          }
        : null,
      restoreViewStateTimer: null,
      restoreViewStateRetryCount: 0,
      hasCachedHomeState: cachedState.initialized,
      hasLoadedHomeState: cachedState.hasLoaded
    }
  },
  computed: {
    hasMoreListings() {
      return this.listings.length < Number(this.listTotal || 0)
    },
    routeListingNo() {
      return String(this.$route.query.listingNo || '').trim()
    },
    toolbarGlassStyle() {
      return {}
    }
  },
  watch: {
    routeListingNo(value) {
      if (value === this.listingNoSearch) return
      this.listingNoSearch = value
      
      if (value) {
        this.resourceFilters = createEmptyHomeFilters()
      } else {
        this.resourceFilters = createDefaultHomeFilters()
      }

      this.currentListPage = 1
      this.persistHomeListState({
        hasLoaded: false,
        listings: [],
        listTotal: 0,
        currentListPage: 1
      })
      this.fetchListings({ page: 1, append: false })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  },
  mounted() {
    if (this.routeListingNo !== this.listingNoSearch) {
      this.listingNoSearch = this.routeListingNo
      this.resourceFilters = this.listingNoSearch
        ? createEmptyHomeFilters()
        : createDefaultHomeFilters()
      this.listings = []
      this.listTotal = 0
      this.currentListPage = 1
      this.hasLoadedHomeState = false
    }

    this.setupLoadMoreObserver()

    if (this.hasLoadedHomeState && this.hasCachedHomeState) {
      this.$nextTick(() => {
        this.observeLoadMoreSentinel()
        this.tryRestoreSavedViewState()
      })
      return
    }

    this.fetchListings({ page: 1, append: false })
  },
  activated() {
    this.$nextTick(() => {
      this.observeLoadMoreSentinel()
      this.restoreSavedViewState()
    })
  },
  deactivated() {
    this.persistHomeListState()
    this.disconnectLoadMoreObserver()
    this.clearRestoreViewStateTimer()
  },
  beforeUnmount() {
    this.persistHomeListState()
    this.disconnectLoadMoreObserver()
    this.clearRestoreViewStateTimer()
  },
  methods: {
    getCurrentScrollTop() {
      return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
    },
    persistHomeListState(overrides = {}) {
      updateHomeListState({
        currentSortKey: this.currentSortKey,
        currentSortOrder: this.currentSortOrder,
        smallAmountOnly: this.smallAmountOnly,
        highRatioOnly: this.highRatioOnly,
        resourceFilters: this.resourceFilters,
        listingNoSearch: this.listingNoSearch,
        listings: this.listings,
        listTotal: this.listTotal,
        currentListPage: this.currentListPage,
        pageSize: this.pageSize,
        scrollTop: this.getCurrentScrollTop(),
        ...overrides
      })
    },
    restoreSavedViewState() {
      const stateToRestore = this.pendingViewStateRestore || getHomeListStateSnapshot()
      const scrollTop = Number(stateToRestore?.scrollTop)
      if (!Number.isFinite(scrollTop) || scrollTop < 0) {
        this.pendingViewStateRestore = null
        return
      }

      this.pendingViewStateRestore = {
        scrollTop,
        listingNoSearch: stateToRestore?.listingNoSearch || ''
      }
      this.restoreViewStateRetryCount = 0
      this.tryRestoreSavedViewState()
    },
    clearRestoreViewStateTimer() {
      if (!this.restoreViewStateTimer) return
      clearTimeout(this.restoreViewStateTimer)
      this.restoreViewStateTimer = null
    },
    scheduleRestoreViewStateRetry() {
      this.clearRestoreViewStateTimer()
      this.restoreViewStateTimer = setTimeout(() => {
        this.restoreViewStateTimer = null
        this.tryRestoreSavedViewState()
      }, 80)
    },
    finalizeSavedViewStateRestore() {
      this.pendingViewStateRestore = null
      this.restoreViewStateRetryCount = 0
      this.clearRestoreViewStateTimer()
    },
    tryRestoreSavedViewState() {
      if (!this.pendingViewStateRestore) return

      const targetScrollTop = Number(this.pendingViewStateRestore.scrollTop)
      const documentHeight = document.documentElement.scrollHeight
      const viewportHeight = window.innerHeight
      const maxScrollTop = Math.max(0, documentHeight - viewportHeight)

      if ((this.listLoading || !this.listings.length) && maxScrollTop < targetScrollTop) {
        if (this.restoreViewStateRetryCount < 12) {
          this.restoreViewStateRetryCount += 1
          this.scheduleRestoreViewStateRetry()
        }
        return
      }

      const finalScrollTop = Math.min(targetScrollTop, maxScrollTop)
      window.scrollTo({ top: finalScrollTop, behavior: 'auto' })

      requestAnimationFrame(() => {
        const currentScrollTop = this.getCurrentScrollTop()
        if (Math.abs(currentScrollTop - finalScrollTop) <= 2) {
          this.finalizeSavedViewStateRestore()
          return
        }

        if (this.restoreViewStateRetryCount < 12) {
          this.restoreViewStateRetryCount += 1
          this.scheduleRestoreViewStateRetry()
          return
        }

        this.finalizeSavedViewStateRestore()
      })
    },
    mapSortToQuery() {
      if (this.currentSortKey === 'price') return `rent_${this.currentSortOrder}`
      if (this.currentSortKey === 'ratio') return `ratio_${this.currentSortOrder}`
      if (this.currentSortKey === 'hafu') return `hafu_${this.currentSortOrder}`
      if (this.currentSortKey === 'awm') return `awm_${this.currentSortOrder}`
      if (this.currentSortKey === 'helmet') return `helmet_${this.currentSortOrder}`
      if (this.currentSortKey === 'armor') return `armor_${this.currentSortOrder}`
      return 'hot'
    },
    async fetchListings({ page = 1, append = false } = {}) {
      const requestSeq = this.listRequestSeq + 1
      this.listRequestSeq = requestSeq

      if (append) {
        this.listAppending = true
      } else {
        this.listLoading = true
        this.currentListPage = 1
        this.listings = []
        this.listTotal = 0
      }

      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(this.pageSize),
          sortBy: this.mapSortToQuery()
        })

        if (this.smallAmountOnly) {
          params.set('smallAmountZone', '1')
        }
        if (this.highRatioOnly) {
          params.set('highRatioZone', '1')
        }

        Object.entries(this.resourceFilters).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            if (value.length > 0) params.set(key, value.join(','))
          } else if (value) {
            params.set(key, value)
          }
        })

        if (this.listingNoSearch) {
          params.set('listingNo', this.listingNoSearch)
        }

        const data = await apiFetch(`/api/listings?${params.toString()}`)
        if (requestSeq !== this.listRequestSeq) return

        const nextList = Array.isArray(data.list) ? data.list : []
        this.listings = append ? [...this.listings, ...nextList] : nextList
        this.listTotal = Number(data.total || 0)

        const apiPage = Number(data.page || page)
        this.currentListPage = Number.isFinite(apiPage) && apiPage > 0 ? apiPage : 1
        this.hasLoadedHomeState = true
        this.persistHomeListState({
          hasLoaded: true
        })
      } catch (error) {
        if (requestSeq !== this.listRequestSeq) return

        if (!append) {
          this.listings = []
          this.listTotal = 0
        }
        this.hasLoadedHomeState = true
        this.persistHomeListState({
          hasLoaded: true
        })

        if (Number(error?.status) === 401) {
          this.$emit('auth-expired', '登录已过期，请重新登录')
          return
        }

        showErrorToast(`商品列表加载失败：${error.message}`)
      } finally {
        if (requestSeq !== this.listRequestSeq) return

        if (append) {
          this.listAppending = false
        } else {
          this.listLoading = false
        }

        this.$nextTick(() => {
          this.observeLoadMoreSentinel()
          this.tryRestoreSavedViewState()
        })
      }
    },
    loadMoreListings() {
      if (!this.hasMoreListings || this.listLoading || this.listAppending) return
      this.fetchListings({ page: this.currentListPage + 1, append: true })
    },
    handleFilterSearch(payload) {
      this.resourceFilters = { ...payload }
      this.currentListPage = 1
      this.persistHomeListState({
        hasLoaded: false,
        listings: [],
        listTotal: 0,
        currentListPage: 1
      })
      this.fetchListings({ page: 1, append: false })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    handleSortChange(sortKey) {
      if (sortKey === 'smallAmount') {
        this.smallAmountOnly = !this.smallAmountOnly
      } else if (sortKey === 'highRatio') {
        this.highRatioOnly = !this.highRatioOnly
      } else if (sortKey === 'default') {
        this.currentSortKey = 'default'
        this.currentSortOrder = 'desc'
        this.smallAmountOnly = false
        this.highRatioOnly = false
      } else if (this.currentSortKey === sortKey) {
        this.currentSortOrder = this.currentSortOrder === 'desc' ? 'asc' : 'desc'
      } else {
        this.currentSortKey = sortKey
        this.currentSortOrder = 'desc'
      }

      this.currentListPage = 1
      this.persistHomeListState({
        hasLoaded: false,
        listings: [],
        listTotal: 0,
        currentListPage: 1
      })
      this.fetchListings({ page: 1, append: false })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    handleListingNoSearch(listingNo) {
      const query = listingNo ? { listingNo } : {}
      
      if (listingNo) {
        this.resourceFilters = createEmptyHomeFilters()
      } else {
        this.resourceFilters = createDefaultHomeFilters()
      }

      if (listingNo === this.routeListingNo) {
        this.currentListPage = 1
        this.persistHomeListState({
          hasLoaded: false,
          listings: [],
          listTotal: 0,
          currentListPage: 1
        })
        this.fetchListings({ page: 1, append: false })
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
      this.persistHomeListState({
        hasLoaded: false,
        listings: [],
        listTotal: 0,
        currentListPage: 1,
        listingNoSearch: listingNo
      })
      this.$router.push({
        name: 'home',
        query
      })
    },
    handleViewDetail(listingNo) {
      if (listingNo === undefined || listingNo === null || listingNo === '') {
        return
      }

      this.persistHomeListState()

      if (!canOpenListingDetail({ isLoggedIn: this.isLoggedIn, source: 'resource' })) {
        this.$emit('require-login', {
          tip: LISTING_DETAIL_LOGIN_TIP,
          redirectTo: {
            name: 'listing-detail',
            params: { listingNo },
            query: {
              from: 'resource',
              ...(this.listingNoSearch ? { listingNo: this.listingNoSearch } : {})
            }
          }
        })
        return
      }

      const query = { from: 'resource' }
      if (this.listingNoSearch) {
        query.listingNo = this.listingNoSearch
      }

      this.$router.push({
        name: 'listing-detail',
        params: { listingNo },
        query
      })
    },
    setupLoadMoreObserver() {
      if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return

      this.disconnectLoadMoreObserver()
      this.loadMoreObserver = new IntersectionObserver(
        (entries) => {
          const entry = entries[0]
          if (!entry?.isIntersecting) return
          this.loadMoreListings()
        },
        {
          root: null,
          rootMargin: '0px 0px 240px 0px',
          threshold: 0.1
        }
      )

      this.observeLoadMoreSentinel()
    },
    observeLoadMoreSentinel() {
      if (!this.loadMoreObserver || !this.hasMoreListings) return
      this.loadMoreObserver.disconnect()
      const sentinel = this.$refs.loadMoreSentinel
      if (sentinel) {
        this.loadMoreObserver.observe(sentinel)
      }
    },
    disconnectLoadMoreObserver() {
      if (!this.loadMoreObserver) return
      this.loadMoreObserver.disconnect()
    }
  }
}
</script>

<style scoped>
.resource-toolbar {
  position: sticky;
  top: 0;
  z-index: 120;
  isolation: isolate;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  border-bottom: 1px solid rgba(226, 232, 240, 0.9);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05);
}

.empty-state {
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px 20px 32px;
  color: #6b7280;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 20px 20px;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

.load-more-sentinel {
  width: 100%;
  height: 1px;
}

.list-status {
  padding: 0 20px 32px;
  text-align: center;
  color: #6b7280;
  font-size: 14px;
}

@media (max-width: 960px) {
  .resource-toolbar {
    top: 60px;
  }
}
</style>
