<template>
  <ListingDetail
    :listing-id="listingId"
    :back-text="backText"
    :read-only="isReadOnly"
    :use-seller-pricing-view="useSellerPricingView"
    :hide-compensation-plan="hideCompensationPlan"
    @back="handleBack"
    @goto-profile="handleGotoProfile"
  />
</template>

<script>
import ListingDetail from '../components/ListingDetail.vue'
import { canOpenListingDetail, LISTING_DETAIL_LOGIN_TIP } from '../constants/accessPolicy.js'

export default {
  name: 'ListingDetailPage',
  components: {
    ListingDetail
  },
  props: {
    isLoggedIn: {
      type: Boolean,
      default: false
    }
  },
  emits: ['require-login'],
  computed: {
    listingId() {
      return this.$route.params.listingNo || this.$route.params.id
    },
    source() {
      const source = String(this.$route.query.from || 'resource')
      if (['resource', 'profile', 'order'].includes(source)) {
        return source
      }
      return 'resource'
    },
    backText() {
      if (this.source === 'profile') return '返回个人中心'
      if (this.source === 'order') return '返回订单详情'
      return '返回列表'
    },
    isReadOnly() {
      return this.source !== 'resource'
    },
    useSellerPricingView() {
      return this.source === 'profile' || (this.source === 'order' && this.$route.query.role === 'seller')
    },
    hideCompensationPlan() {
      return this.source !== 'resource'
    }
  },
  mounted() {
    if (!canOpenListingDetail({ isLoggedIn: this.isLoggedIn, source: this.source })) {
      this.$emit('require-login', {
        tip: LISTING_DETAIL_LOGIN_TIP,
        redirectTo: {
          name: 'listing-detail',
          params: { listingNo: this.listingId },
          query: {
            ...this.$route.query
          }
        }
      })
      this.$router.replace({ name: 'home' })
    }
  },
  methods: {
    handleBack() {
      if (this.source === 'profile') {
        this.$router.push({
          name: 'profile',
          query: {
            section: this.$route.query.section || 'published',
            orderRole: this.$route.query.orderRole || '',
            orderStatus: this.$route.query.orderStatus || '',
            listingStatus: this.$route.query.listingStatus || ''
          }
        })
        return
      }

      if (this.source === 'order') {
        const orderId = this.$route.query.orderId
        if (orderId) {
          this.$router.push({
            name: 'order-detail',
            params: { id: orderId },
            query: {
              from: this.$route.query.orderFrom || 'resource',
              role: this.$route.query.role || 'buyer',
              section: this.$route.query.section || '',
              orderStatus: this.$route.query.orderStatus || '',
              listingStatus: this.$route.query.listingStatus || ''
            }
          })
          return
        }
      }

      const query = {}
      if (this.$route.query.listingNo) {
        query.listingNo = this.$route.query.listingNo
      }
      this.$router.push({ name: 'home', query })
    },
    handleGotoProfile(payload = {}) {
      this.$router.push({
        name: 'profile',
        query: {
          section: payload.section === 'orders' ? 'orders' : 'orders',
          orderRole: 'buyer',
          orderStatus: payload.orderFilter || ''
        }
      })
    }
  }
}
</script>
