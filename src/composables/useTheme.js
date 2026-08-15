import { ref, computed } from 'vue'

const STORAGE_KEY = 'theme'
// 切换期间挂在 <html> 上的类，配合 style.css 让全页颜色平滑过渡
const TRANSITION_CLASS = 'theme-transition'

// index.html 中的内联脚本会在应用挂载前根据 localStorage / 系统偏好
// 设置 document.documentElement.dataset.theme，这里读取它作为初始值
function resolveInitialTheme() {
  if (typeof document !== 'undefined' && document.documentElement.dataset.theme) {
    return document.documentElement.dataset.theme
  }
  return 'light'
}

const theme = ref(resolveInitialTheme())
const isDark = computed(() => theme.value === 'dark')
let transitionTimer = null

function applyTheme(next) {
  const root = document.documentElement
  // 过渡类只在切换期间存在，避免常驻 transition 影响日常交互动画
  root.classList.add(TRANSITION_CLASS)
  clearTimeout(transitionTimer)
  transitionTimer = setTimeout(() => root.classList.remove(TRANSITION_CLASS), 1000)

  theme.value = next
  root.dataset.theme = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch (error) {
    /* localStorage 不可用时忽略，仅本次会话生效 */
  }
}

export function useTheme() {
  const toggleTheme = () => {
    applyTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  return {
    theme,
    isDark,
    toggleTheme
  }
}
