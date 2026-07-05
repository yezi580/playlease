<template>
  <PublishForm
    :key="viewKey"
    :owner-name="currentUser || '匿名用户'"
    :editing-listing-id="editingListingId"
    @published="handlePublished"
    @auth-expired="$emit('auth-expired', $event)"
    @back="handleBack"
  />
</template>

<script>
import PublishForm from '../components/PublishForm.vue'

export default {
  name: 'PublishPage',
  components: {
    PublishForm
  },
  props: {
    isLoggedIn: {
      type: Boolean,
      default: false
    },
    currentUser: {
      type: String,
      default: ''
    }
  },
  emits: ['require-login', 'auth-expired'],
  computed: {
    editingListingId() {
      return this.$route.name === 'publish-edit' ? this.$route.params.id : null
    },
    viewKey() {
      return this.editingListingId ? `edit-${this.editingListingId}` : 'publish-new'
    }
  },
  mounted() {
    if (this.isLoggedIn) return
    this.$emit('require-login', '请先登录后再发布')
    this.$router.replace({ name: 'home' })
  },
  methods: {
    handlePublished() {
      this.$router.push({ name: 'home' })
    },
    handleBack() {
      if (this.editingListingId && this.$route.query.from === 'profile') {
        this.$router.push({
          name: 'profile',
          query: {
            section: this.$route.query.section || 'published',
            orderRole: this.$route.query.orderRole || '',
            orderStatus: this.$route.query.orderStatus || '',
            listingStatus: this.$route.query.listingStatus || 'active'
          }
        })
        return
      }
      this.$router.push({ name: 'home' })
    }
  }
}
</script>
