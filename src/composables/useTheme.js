import { ref, computed, nextTick } from 'vue'

const STORAGE_KEY = 'theme'
// 回退方案（不支持 View Transitions 的浏览器）：
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

function persist(next) {
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch (error) {
    /* localStorage 不可用时忽略，仅本次会话生效 */
  }
}

function applyTheme(next) {
  const root = document.documentElement

  const commit = () => {
    theme.value = next
    root.dataset.theme = next
    persist(next)
    // 等待 Vue 响应式更新（isDark 类绑定等）完成，快照才是新主题
    return nextTick()
  }

  // 优先走 View Transitions：整页一次合成器级交叉淡化，
  // 避免对上千个元素逐个启动 transition 造成的掉帧与渐变离散跳变
  if (typeof document.startViewTransition === 'function') {
    document.startViewTransition(commit)
    return
  }

  // 回退：切换期间挂过渡类，1s 后移除，避免常驻影响日常交互动画
  root.classList.add(TRANSITION_CLASS)
  clearTimeout(transitionTimer)
  transitionTimer = setTimeout(() => root.classList.remove(TRANSITION_CLASS), 1000)
  commit()
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
