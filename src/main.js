// Vue应用入口文件
// 作用：创建Vue实例，挂载根组件App到页面的#app元素上

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'

function installGlobalClickMovementGuard() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  const MOVE_THRESHOLD = 10
  const SUPPRESS_DURATION_MS = 350

  let startPoint = null
  let shouldSuppressClick = false
  let suppressUntil = 0

  const getEventPoint = (event) => {
    if (event.changedTouches?.length) {
      return event.changedTouches[0]
    }
    if (event.touches?.length) {
      return event.touches[0]
    }
    if (typeof event.clientX === 'number' && typeof event.clientY === 'number') {
      return event
    }
    return null
  }

  const beginTracking = (event) => {
    const point = getEventPoint(event)
    if (!point) return

    startPoint = {
      x: point.clientX,
      y: point.clientY
    }
    shouldSuppressClick = false
  }

  const trackMovement = (event) => {
    if (!startPoint || shouldSuppressClick) return

    const point = getEventPoint(event)
    if (!point) return

    const dx = Math.abs(point.clientX - startPoint.x)
    const dy = Math.abs(point.clientY - startPoint.y)

    if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
      shouldSuppressClick = true
    }
  }

  const endTracking = (event) => {
    if (!startPoint) return

    trackMovement(event)

    if (shouldSuppressClick) {
      suppressUntil = Date.now() + SUPPRESS_DURATION_MS
    }

    startPoint = null
    shouldSuppressClick = false
  }

  const cancelTracking = () => {
    startPoint = null
    shouldSuppressClick = false
  }

  const suppressMovedClick = (event) => {
    if (Date.now() > suppressUntil) return

    event.preventDefault()
    event.stopPropagation()

    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation()
    }

    suppressUntil = 0
  }

  if (window.PointerEvent) {
    document.addEventListener('pointerdown', beginTracking, { capture: true, passive: true })
    document.addEventListener('pointermove', trackMovement, { capture: true, passive: true })
    document.addEventListener('pointerup', endTracking, { capture: true, passive: true })
    document.addEventListener('pointercancel', cancelTracking, { capture: true, passive: true })
  } else {
    document.addEventListener('touchstart', beginTracking, { capture: true, passive: true })
    document.addEventListener('touchmove', trackMovement, { capture: true, passive: true })
    document.addEventListener('touchend', endTracking, { capture: true, passive: true })
    document.addEventListener('touchcancel', cancelTracking, { capture: true, passive: true })
    document.addEventListener('mousedown', beginTracking, { capture: true, passive: true })
    document.addEventListener('mousemove', trackMovement, { capture: true, passive: true })
    document.addEventListener('mouseup', endTracking, { capture: true, passive: true })
  }

  document.addEventListener('click', suppressMovedClick, true)
}

installGlobalClickMovementGuard()

// 创建Vue应用实例并挂载到 index.html 中的 <div id="app">
createApp(App).use(router).mount('#app')
