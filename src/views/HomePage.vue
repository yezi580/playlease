<template>
  <div>
    <div class="resource-toolbar" :style="toolbarGlassStyle">
      <FilterBar v-model="resourceFilters" @search="handleFilterSearch" />
      <SortBar
        :current-sort-key="currentSortKey"
        :current-sort-order="currentSortOrder"
        :small-amount-only="smallAmountOnly"
        :high-ratio-only="highRatioOnly"
        @change-sort="handleSortChange"
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
import { apiFetch } from '../utils/api.js'
import { canOpenListingDetail, LISTING_DETAIL_LOGIN_TIP } from '../constants/accessPolicy.js'
import { showErrorToast } from '../utils/toast.js'

const HOME_VIEW_STATE_KEY = 'home_listing_view_state'

function createDefaultResourceFilters() {
  return {
    insuranceLevel: '',
    energyLevel: '',
    weightLevel: '',
    hafuCoin: '',
    rentPrice: '',
    deposit: '',
    totalAmount: '',
    rank: '',
    loginMethod: '',
    region: '',
    regionProvince: '',
    regionCity: ''
  }
}

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
    return {
      currentSortKey: 'default',
      currentSortOrder: 'desc',
      smallAmountOnly: false,
      highRatioOnly: false,
      listLoading: false,
      listAppending: false,
      listings: [],
      listTotal: 0,
      currentListPage: 1,
      pageSize: 10,
      listRequestSeq: 0,
      loadMoreObserver: null,
      resourceFilters: createDefaultResourceFilters(),
      listingNoSearch: '',
      pendingViewStateRestore: null,
      restoreViewStateTimer: null,
      restoreViewStateRetryCount: 0
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
      this.currentListPage = 1
      this.fetchListings({ page: 1, append: false })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  },
  mounted() {
    this.listingNoSearch = this.routeListingNo
    this.fetchListings({ page: 1, append: false })
    this.setupLoadMoreObserver()
  },
  activated() {
    this.$nextTick(() => {
      this.observeLoadMoreSentinel()
      this.restoreSavedViewState()
    })
  },
  deactivated() {
    this.disconnectLoadMoreObserver()
    this.clearRestoreViewStateTimer()
  },
  beforeUnmount() {
    this.disconnectLoadMoreObserver()
    this.clearRestoreViewStateTimer()
  },
  methods: {
    getCurrentScrollTop() {
      return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
    },
    saveViewStateForDetail() {
      const payload = {
        scrollTop: this.getCurrentScrollTop(),
        listingNoSearch: this.listingNoSearch
      }
      sessionStorage.setItem(HOME_VIEW_STATE_KEY, JSON.stringify(payload))
    },
    restoreSavedViewState() {
      const rawState = this.pendingViewStateRestore
        ? JSON.stringify(this.pendingViewStateRestore)
        : sessionStorage.getItem(HOME_VIEW_STATE_KEY)
      if (!rawState) return

      let parsedState = null
      try {
        parsedState = JSON.parse(rawState)
      } catch {
        sessionStorage.removeItem(HOME_VIEW_STATE_KEY)
        this.pendingViewStateRestore = null
        return
      }

      const scrollTop = Number(parsedState?.scrollTop)
      if (!Number.isFinite(scrollTop) || scrollTop < 0) {
        sessionStorage.removeItem(HOME_VIEW_STATE_KEY)
        this.pendingViewStateRestore = null
        return
      }

      this.pendingViewStateRestore = {
        scrollTop,
        listingNoSearch: parsedState?.listingNoSearch || ''
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
      sessionStorage.removeItem(HOME_VIEW_STATE_KEY)
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
          if (value) params.set(key, value)
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
      } catch (error) {
        if (requestSeq !== this.listRequestSeq) return

        if (!append) {
          this.listings = []
          this.listTotal = 0
        }

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
      this.fetchListings({ page: 1, append: false })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    handleViewDetail(listingNo) {
      if (listingNo === undefined || listingNo === null || listingNo === '') {
        return
      }

      this.saveViewStateForDetail()

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
  top: 68px;
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
