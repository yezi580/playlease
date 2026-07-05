<template>
  <OrderDetail
    :order-id="orderId"
    :back-text="backText"
    :user-role="userRole"
    @back="handleBack"
    @view-listing="handleViewListing"
  />
</template>

<script>
import OrderDetail from '../components/OrderDetail.vue'

export default {
  name: 'OrderDetailPage',
  components: {
    OrderDetail
  },
  props: {
    isLoggedIn: {
      type: Boolean,
      default: false
    }
  },
  emits: ['require-login'],
  computed: {
    orderId() {
      return this.$route.params.id
    },
    userRole() {
      return this.$route.query.role === 'seller' ? 'seller' : 'buyer'
    },
    backText() {
      return this.$route.query.from === 'profile' ? '返回个人中心' : '返回列表'
    }
  },
  mounted() {
    if (this.isLoggedIn) return
    this.$emit('require-login', '请先登录')
    this.$router.replace({ name: 'home' })
  },
  methods: {
    handleBack() {
      if (this.$route.query.from === 'profile') {
        this.$router.push({
          name: 'profile',
          query: {
            section: this.$route.query.section || 'orders',
            orderRole: this.userRole,
            orderStatus: this.$route.query.orderStatus || '',
            listingStatus: this.$route.query.listingStatus || ''
          }
        })
        return
      }
      this.$router.push({ name: 'home' })
    },
    handleViewListing(listingId, listing) {
      this.$router.push({
        name: 'listing-detail',
        params: { listingNo: listing?.listing_no || listingId },
        query: {
          from: 'order',
          orderId: this.orderId,
          orderFrom: this.$route.query.from || 'resource',
          role: this.userRole,
          section: this.$route.query.section || '',
          orderStatus: this.$route.query.orderStatus || '',
          listingStatus: this.$route.query.listingStatus || ''
        }
      })
    }
  }
}
</script>
