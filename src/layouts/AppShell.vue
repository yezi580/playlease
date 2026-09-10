<template>
  <div class="page">
    <SideBar
      :currentPage="currentPageKey"
      :inviteActive="isProfileInviteSection"
      :showAuth="showAuth"
      :isLoggedIn="isLoggedIn"
      :has-unread-messages="hasRegularUnreadMessages"
      :has-support-unread-messages="hasSupportUnreadMessages"
      :show-back-action="showTopBarBackAction"
      :back-action-text="topBarBackActionText"
      :highlight-back-action="highlightTopBarBackAction"
      :show-support-console-entry="showSupportConsoleEntry"
      :support-console-label="supportConsoleLabel"
      @login="openAuth('login')"
      @publish="handlePublishClick"
      @navigate="handleNavigate"
      @open-support-console="openSupportConsole"
      @profile="goProfile"
      @back="handleTopBarBack"
      @invite="goInviteCenter"
      @presale-consultation="openPresaleConsultation"
    />
    <MobileTopBar
      :show-back-action="showTopBarBackAction"
      :back-action-text="topBarBackActionText"
      :highlight-back-action="highlightTopBarBackAction"
      :show-listing-search="showTopBarListingSearch"
      :listing-search-value="listingSearchValue"
      :listing-search-loading="false"
      @back="handleTopBarBack"
      @search-listing-no="handleListingNoSearch"
    />
    <AppToast />
    <AppConfirm />
    <main class="main-content">
      <AuthPanel
        v-if="showAuth"
        :tip="authTip"
        @auth-success="handleAuthSuccess"
      />
      <RouterView v-else v-slot="{ Component, route: currentRoute }">
        <Transition name="app-page" mode="out-in">
          <template v-if="currentRoute.name === 'home'">
            <KeepAlive include="HomePage">
              <component
                :is="Component"
                :key="'home'"
                class="page-stage"
                :is-logged-in="isLoggedIn"
                :current-user="currentUser"
                :current-user-role="currentUserRole"
                :unread-message-count="regularUnreadMessageCount"
                @require-login="handleRequireLogin"
                @auth-expired="handleAuthExpired"
                @logout="handleLogout"
                @unread-change="handleUnreadChange"
              />
            </KeepAlive>
          </template>
          <template v-else>
            <component
              :is="Component"
              :key="currentRoute.fullPath"
              class="page-stage"
              :is-logged-in="isLoggedIn"
              :current-user="currentUser"
              :current-user-role="currentUserRole"
              :unread-message-count="regularUnreadMessageCount"
              @require-login="handleRequireLogin"
              @auth-expired="handleAuthExpired"
              @logout="handleLogout"
              @unread-change="handleUnreadChange"
            />
          </template>
        </Transition>
      </RouterView>
    </main>

    <AppFooter />

    <BottomNav
      :currentPage="currentPageKey"
      :auth-visible="showAuth"
      :has-regular-unread-messages="hasRegularUnreadMessages"
      :has-support-unread-messages="hasSupportUnreadMessages"
      :is-support-user="showSupportConsoleEntry"
      @navigate="handleNavigate"
    />

    <div
      class="global-floating-actions"
      :class="{
        'global-floating-actions--above-action-bar': hasBottomActionBar,
        'global-floating-actions--listing-detail': isListingDetailRoute,
        'is-home': routeName === 'home'
      }"
    >
      <div
        v-if="showTopBarBackAction && topBarBackActionText"
        class="quick-action-wrapper global-back-wrapper"
      >
        <button
          type="button"
          class="global-floating-back-btn"
          :aria-label="topBarBackActionText"
          @click="handleTopBarBack"
        >
          <span class="back-icon">←</span>
          <span>{{ topBarBackActionText }}</span>
        </button>
      </div>
      <template v-if="showHomeQuickActions">
        <div class="quick-action-wrapper invite-action">
          <button
            type="button"
            class="home-quick-action-btn"
            aria-label="邀新赚钱"
            @click="goInviteCenter"
          >
            <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 5h8" />
              <path d="M10 2h4a1 1 0 0 1 1 1v2H9V3a1 1 0 0 1 1-1Z" />
              <path d="M8 5c-3.5 1.5-5 5-5 9a9 9 0 0 0 18 0c0-4-1.5-7.5-5-9" />
              <line x1="12" x2="12" y1="9" y2="19" />
              <path d="M14.5 11H10a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H9.5" />
            </svg>
          </button>
          <span class="action-label">邀新赚钱</span>
        </div>
        <div class="quick-action-wrapper presale-action">
          <button
            type="button"
            class="home-quick-action-btn"
            aria-label="售前咨询"
            @click="openPresaleConsultation"
          >
            <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z" />
              <path d="M21 16v2a4 4 0 0 1-4 4h-5" />
            </svg>
          </button>
          <span class="action-label">售前咨询</span>
        </div>
      </template>
    </div>

    <ConversationPanel
      :visible="showPresaleConversationPanel"
      conversation-type="presale"
      :user-role="currentUserRole === 'support' ? 'support' : 'user'"
      @close="showPresaleConversationPanel = false"
    />
  </div>
</template>

<script setup>
import { KeepAlive, computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import SideBar from '../components/SideBar.vue'
import MobileTopBar from '../components/MobileTopBar.vue'
import AuthPanel from '../components/AuthPanel.vue'
import BottomNav from '../components/BottomNav.vue'
import AppFooter from '../components/AppFooter.vue'
import AppToast from '../components/AppToast.vue'
import AppConfirm from '../components/AppConfirm.vue'
import ConversationPanel from '../components/ConversationPanel.vue'
import { showWarningToast } from '../utils/toast.js'
import { useSessionShell } from '../composables/useSessionShell.js'
import { useUnreadSocket } from '../composables/useUnreadSocket.js'
import { useRouteShellUi } from '../composables/useRouteShellUi.js'

const route = useRoute()
const router = useRouter()
const pendingAuthRedirect = ref(null)
const showPresaleConversationPanel = ref(false)

function syncAuthenticatedState() {
  unread.fetchUnreadSummary()
  unread.startGlobalMessageSocket()
}

function clearAuthenticatedState() {
  unread.clearUnreadState()
  unread.stopGlobalMessageSocket()
}

const {
  isLoggedIn,
  showAuth,
  authMode,
  authTip,
  currentUser,
  currentUserRole,
  initializeSession,
  openAuth,
  closeAuth,
  handleAuthSuccess: completeAuthSuccess,
  handleLocalLogout,
  handleRequireLogin: openLoginPrompt,
  handleAuthExpired
} = useSessionShell({
  onAuthenticated: syncAuthenticatedState,
  onLoggedOut: clearAuthenticatedState
})

const unread = useUnreadSocket({ isLoggedIn })
const { regularUnreadMessageCount } = unread
const {
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
} = useRouteShellUi({
  route,
  showAuth,
  isLoggedIn,
  currentUserRole,
  regularUnreadMessageCount: unread.regularUnreadMessageCount,
  supportUnreadMessageCount: unread.supportUnreadMessageCount
})

const showHomeQuickActions = computed(() => {
  return routeName.value === 'home' && !showAuth.value
})

// 邀新赚钱入口对应 profile?section=invite，需与普通个人中心区分高亮
const isProfileInviteSection = computed(() => {
  return !showAuth.value && routeName.value === 'profile' && String(route.query.section || '') === 'invite'
})

watch(
  () => showAuth.value,
  (visible, previousVisible) => {
    if (!previousVisible && visible) {
      nextTick(() => {
        requestAnimationFrame(() => {
          window.scrollTo({ top: 0, behavior: 'auto' })
        })
      })
    }

    if (previousVisible && !visible && !isLoggedIn.value) {
      pendingAuthRedirect.value = null
    }
  }
)

onMounted(() => {
  void initializeSession()
})

onBeforeUnmount(() => {
  unread.stopGlobalMessageSocket()
})

function handleNavigate(page) {
  if (page === 'publish') {
    handlePublishClick()
    return
  }
  if (page === 'profile') {
    goProfile()
    return
  }
  if (page === 'support-console') {
    openSupportConsole()
    return
  }

  closeAuth()

  if (page === 'resource') {
    router.push({ name: 'home' })
    return
  }
  if (page === 'gun') {
    router.push({ name: 'gun-code' })
    return
  }
  if (page === 'boost') {
    showWarningToast('代肝功能开发中，敬请期待')
    return
  }
}

async function handleAuthSuccess(payload) {
  const redirectTarget = pendingAuthRedirect.value
  await completeAuthSuccess(payload)
  pendingAuthRedirect.value = null
  if (redirectTarget) {
    await router.push(redirectTarget)
  }
}

function handleRequireLogin(payload = '请先登录') {
  if (typeof payload === 'object' && payload !== null) {
    pendingAuthRedirect.value = payload.redirectTo || null
    openLoginPrompt(payload.tip || '请先登录')
    return
  }
  pendingAuthRedirect.value = null
  openLoginPrompt(payload)
}

function handleListingNoSearch(value = '') {
  const listingNo = String(value || '').trim()
  const query = listingNo ? { listingNo } : {}
  closeAuth()

  if (routeName.value === 'home' && listingNo === listingSearchValue.value) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }

  router.push({
    name: 'home',
    query
  })
}

function handlePublishClick() {
  if (!isLoggedIn.value) {
    openAuth('login', '请先登录后再发布')
    return
  }
  closeAuth()
  router.push({ name: 'publish-create' })
}

function goProfile() {
  if (!isLoggedIn.value) {
    openAuth('login', '请先登录')
    return
  }
  closeAuth()
  router.push({
    name: 'profile',
    query: {
      section: 'published',
      orderRole: 'buyer',
      listingStatus: 'all'
    }
  })
}

function goInviteCenter() {
  if (!isLoggedIn.value) {
    openAuth('login', '请先登录')
    return
  }
  closeAuth()
  router.push({
    name: 'profile',
    query: {
      section: 'invite'
    }
  })
}

function openPresaleConsultation() {
  if (!isLoggedIn.value) {
    openAuth('login', '请先登录后再发起售前咨询')
    return
  }
  closeAuth()
  showPresaleConversationPanel.value = true
}

function openSupportConsole() {
  if (!isLoggedIn.value) {
    openAuth('login', '请先登录')
    return
  }
  if (currentUserRole.value !== 'support') {
    showWarningToast('当前账号无权访问客服工作台')
    return
  }
  closeAuth()
  router.push({ name: 'support-console' })
}

function handleTopBarBack() {
  if (['publish-create', 'publish-edit'].includes(routeName.value)) {
    if (routeName.value === 'publish-edit' && route.query.from === 'profile') {
      router.push({
        name: 'profile',
        query: {
          section: route.query.section || 'published',
          orderRole: route.query.orderRole || '',
          orderStatus: route.query.orderStatus || '',
          listingStatus: route.query.listingStatus || 'active'
        }
      })
      return
    }
    router.push({ name: 'home' })
    return
  }

  if (routeName.value === 'order-detail') {
    if (route.query.from === 'profile') {
      router.push({
        name: 'profile',
        query: {
          section: route.query.section || 'orders',
          orderRole: route.query.role || 'buyer',
          orderStatus: route.query.orderStatus || '',
          listingStatus: route.query.listingStatus || ''
        }
      })
      return
    }
    router.push({ name: 'home' })
    return
  }

  if (routeName.value === 'payment-result') {
    router.push({
      name: 'profile',
      query: {
        section: 'orders',
        orderRole: 'buyer',
        orderStatus: 'paid'
      }
    })
    return
  }

  if (routeName.value === 'listing-detail') {
    if (route.query.from === 'profile') {
      router.push({
        name: 'profile',
        query: {
          section: route.query.section || 'published',
          orderRole: route.query.orderRole || '',
          orderStatus: route.query.orderStatus || '',
          listingStatus: route.query.listingStatus || ''
        }
      })
      return
    }

    if (route.query.from === 'order' && route.query.orderId) {
      router.push({
        name: 'order-detail',
        params: { id: route.query.orderId },
        query: {
          from: route.query.orderFrom || 'resource',
          role: route.query.role || 'buyer',
          section: route.query.section || '',
          orderStatus: route.query.orderStatus || '',
          listingStatus: route.query.listingStatus || ''
        }
      })
      return
    }

    const hasResourceHistory = route.query.from === 'resource' && window.history.state?.back
    if (hasResourceHistory) {
      router.back()
      return
    }

    const query = {}
    if (route.query.listingNo) {
      query.listingNo = route.query.listingNo
    }
    router.push({ name: 'home', query })
  }
}

function handleUnreadChange(count) {
  unread.handleUnreadChange(count)
}

function handleLogout() {
  handleLocalLogout()
  closeAuth()
  router.replace({ name: 'home' })
}
</script>

<style scoped>
.page {
  position: relative;
  background: var(--bg-page);
  min-height: 100vh;
  min-height: 100dvh;
  font-family: Arial;
  padding-left: 240px;
  display: flex;
  flex-direction: column;
}

.main-content {
  flex: 1;
}

.page-stage {
  min-height: 100%;
}

.app-page-enter-active,
.app-page-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease, filter 0.18s ease;
  will-change: opacity, transform, filter;
}

.app-page-enter-from {
  opacity: 0;
  transform: translateY(6px) scale(0.996);
  filter: blur(1px);
}

.app-page-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.998);
  filter: blur(0.6px);
}

.global-floating-actions {
  position: fixed;
  right: 24px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.global-floating-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  padding: 0 18px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-muted);
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

.global-floating-back-btn:hover {
  color: var(--brand-primary);
  border-color: var(--brand-primary);
  transform: translateX(-2px);
  box-shadow: 0 6px 20px rgba(16, 185, 129, 0.18);
}

.back-icon {
  font-size: 18px;
  line-height: 1;
  font-weight: 700;
}

.home-quick-action-btn:hover {
  color: var(--brand-primary);
  border-color: var(--brand-primary);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(16, 185, 129, 0.18);
}

.quick-action-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.action-label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
}

.home-quick-action-btn {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-muted);
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  padding: 0;
  position: relative;
}

.action-icon {
  width: 22px;
  height: 22px;
}

@media (min-width: 961px) {
  .invite-action,
  .presale-action {
    display: none;
  }
}

@media (max-width: 960px) {
  .page {
    padding-left: 0;
    padding-top: 60px;
    padding-bottom: 70px;
  }

  .global-floating-actions {
    right: 16px;
  }

  .global-floating-actions.is-home {
    top: auto;
    bottom: 132px;
    transform: none;
    gap: 8px;
  }

  .global-back-wrapper {
    display: none;
  }

  .invite-action {
    display: none;
  }

  .action-label {
    display: none;
  }

  .home-quick-action-btn {
    width: 46px;
    height: 46px;
  }

  .action-icon {
    width: 20px;
    height: 20px;
  }

  /* 移动端客服/售前咨询按钮显眼样式 */
  .presale-action .home-quick-action-btn {
    width: 56px;
    height: 56px;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    color: var(--brand-primary, var(--success));
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    animation: pulse-shadow-soft 2.5s infinite;
  }

  .presale-action .action-icon {
    width: 28px;
    height: 28px;
  }
}

@keyframes pulse-shadow-soft {
  0% {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1), 0 0 0 0 rgba(16, 185, 129, 0.2);
  }
  70% {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1), 0 0 0 8px rgba(16, 185, 129, 0);
  }
  100% {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1), 0 0 0 0 rgba(16, 185, 129, 0);
  }
}
</style>
