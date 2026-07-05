<template>
  <SupportConsole :current-user-role="currentUserRole" />
</template>

<script>
import SupportConsole from '../components/SupportConsole.vue'
import { showWarningToast } from '../utils/toast.js'

export default {
  name: 'SupportConsolePage',
  components: {
    SupportConsole
  },
  props: {
    isLoggedIn: {
      type: Boolean,
      default: false
    },
    currentUserRole: {
      type: String,
      default: ''
    }
  },
  emits: ['require-login'],
  mounted() {
    if (!this.isLoggedIn) {
      this.$emit('require-login', '请先登录')
      this.$router.replace({ name: 'home' })
      return
    }

    if (this.currentUserRole !== 'support') {
      showWarningToast('当前账号无权访问客服工作台')
      this.$router.replace({ name: 'home' })
    }
  }
}
</script>
