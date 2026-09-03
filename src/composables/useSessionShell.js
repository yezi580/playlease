import { ref } from 'vue'
import { apiFetch, setAuth, clearAuth, clearLocalAuthCache, getStoredUser } from '../utils/api.js'
import { showSuccessToast, showWarningToast } from '../utils/toast.js'

// 首次会话探测（initializeSession）完成信号。新标签页深链时 sessionStorage
// 为空、/api/profile 探测未返回，受保护页 mounted 里的登录校验若不等它，
// 会把 cookie 仍有效的用户误弹登录并踢回首页。校验先等此 Promise 再判断；
// 同标签页刷新因 sessionStorage 同步恢复登录态（isLoggedIn 已为 true）不会等待。
let resolveSessionReady = () => {}
export const sessionReady = new Promise((resolve) => {
  resolveSessionReady = resolve
})

export function useSessionShell({ onAuthenticated = () => {}, onLoggedOut = () => {} } = {}) {
  const isLoggedIn = ref(false)
  const showAuth = ref(false)
  const authMode = ref('login')
  const authTip = ref('')
  const currentUser = ref('')
  const currentUserRole = ref('')

  function applyUserState(user = {}) {
    isLoggedIn.value = true
    currentUser.value = String(user.username || '')
    currentUserRole.value = String(user.role || 'user')
  }

  async function notifyAuthenticated() {
    await onAuthenticated()
  }

  async function initializeSession() {
    try {
      const storedUser = getStoredUser()
      if (storedUser && storedUser.username) {
        applyUserState(storedUser)
      }

      try {
        const data = await apiFetch('/api/profile')
        const user = data?.user || null
        if (!user?.username) {
          handleLocalLogout()
          return
        }

        setAuth('', user)
        applyUserState(user)
        await notifyAuthenticated()
      } catch (error) {
        if (Number(error?.status) === 403) {
          handleLocalLogout(false)
          return
        }
        handleLocalLogout()
      }
    } finally {
      // 无论探测结果如何都放行等待中的页面守卫（幂等，重复调用无副作用）
      resolveSessionReady()
    }
  }

  function openAuth(mode = 'login', tip = '') {
    showAuth.value = true
    authMode.value = mode
    authTip.value = tip
  }

  function closeAuth() {
    showAuth.value = false
    authTip.value = ''
  }

  async function handleAuthSuccess(payload) {
    resolveSessionReady()
    const user = payload?.user || {}
    const username = user.username || payload?.username || ''
    const role = String(user.role || 'user')

    setAuth(payload?.token || '', { ...user, username, role })
    applyUserState({ ...user, username, role })
    await notifyAuthenticated()
    closeAuth()
    showSuccessToast(`欢迎回来，${username}`)
  }

  function handleLocalLogout(revokeSession = true) {
    resolveSessionReady()
    if (revokeSession) {
      clearAuth()
    } else {
      clearLocalAuthCache()
    }

    isLoggedIn.value = false
    currentUser.value = ''
    currentUserRole.value = ''
    onLoggedOut()
  }

  function handleRequireLogin(tip = '请先登录') {
    openAuth('login', tip)
  }

  function handleAuthExpired(tip = '登录已过期，请重新登录') {
    handleLocalLogout()
    showWarningToast(tip)
    openAuth('login', tip)
  }

  return {
    isLoggedIn,
    showAuth,
    authMode,
    authTip,
    currentUser,
    currentUserRole,
    initializeSession,
    openAuth,
    closeAuth,
    handleAuthSuccess,
    handleLocalLogout,
    handleRequireLogin,
    handleAuthExpired
  }
}
