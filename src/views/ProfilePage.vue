<template>
  <ProfileCenter
    :key="viewKey"
    :is-logged-in="isLoggedIn"
    :current-user="currentUser"
    :current-user-role="currentUserRole"
    :unread-message-count="unreadMessageCount"
    :default-section="defaultSection"
    :default-order-role="defaultOrderRole"
    :default-order-filter="defaultOrderFilter"
    :default-listing-filter="defaultListingFilter"
    @view-listing-detail="handleViewListingDetail"
    @edit-listing="handleEditListing"
    @view-order-detail="handleViewOrderDetail"
    @unread-change="$emit('unread-change', $event)"
    @login="$emit('require-login', '请先登录')"
    @payment-success="handlePaymentSuccess"
    @logout="$emit('logout')"
  />
</template>

<script>
import ProfileCenter from '../components/ProfileCenter.vue'
import { sessionReady } from '../composables/useSessionShell.js'

export default {
  name: 'ProfilePage',
  components: {
    ProfileCenter
  },
  props: {
    isLoggedIn: {
      type: Boolean,
      default: false
    },
    currentUser: {
      type: String,
      default: ''
    },
    currentUserRole: {
      type: String,
      default: ''
    },
    unreadMessageCount: {
      type: Number,
      default: 0
    }
  },
  emits: ['require-login', 'logout', 'unread-change'],
  async mounted() {
    // 与其它受保护页同款守卫：先等会话探测完成，避免把 cookie 仍有效的新标签页用户误踢
    if (this.isLoggedIn) return
    await sessionReady
    if (this.isLoggedIn) return
    this.$emit('require-login', '请先登录')
    this.$router.replace({ name: 'home' })
  },
  computed: {
    defaultSection() {
      return this.$route.query.section || 'published'
    },
    defaultOrderRole() {
      return this.$route.query.orderRole || 'buyer'
    },
    defaultOrderFilter() {
      return this.$route.query.orderStatus || ''
    },
    defaultListingFilter() {
      return this.$route.query.listingStatus || 'all'
    },
    viewKey() {
      return [
        'profile',
        this.defaultSection,
        this.defaultOrderRole,
        this.defaultOrderFilter,
        this.defaultListingFilter
      ].join('-')
    }
  },
  methods: {
    handleViewListingDetail(listingNo, listingFilter = 'active') {
      this.$router.push({
        name: 'listing-detail',
        params: { listingNo },
        query: {
          from: 'profile',
          section: 'published',
          listingStatus: listingFilter
        }
      })
    },
    handleEditListing(id, listingFilter = 'active') {
      this.$router.push({
        name: 'publish-edit',
        params: { id },
        query: {
          from: 'profile',
          section: 'published',
          listingStatus: listingFilter
        }
      })
    },
    handleViewOrderDetail(orderId, source = 'profile', userRole = 'buyer', orderFilter = '', listingFilter = 'active', profileSection = 'orders') {
      this.$router.push({
        name: 'order-detail',
        params: { id: orderId },
        query: {
          from: source,
          role: userRole,
          section: profileSection,
          orderStatus: orderFilter,
          listingStatus: listingFilter
        }
      })
    },
    handlePaymentSuccess(payload = {}) {
      const query = {
        orderId: String(payload.orderId || ''),
        transactionNo: String(payload.transactionNo || ''),
        listingId: String(payload.listingId || ''),
        listingNo: payload.listingNo || '',
        title: payload.orderTitle || '',
        method: payload.paymentMethod || '',
        total: String(payload.total || 0)
      }
      this.$router.push({
        name: 'payment-result',
        query
      })
    }
  }
}
</script>
