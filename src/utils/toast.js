const APP_TOAST_EVENT = 'app:toast'

export function showToast(options = {}) {
  if (typeof window === 'undefined') return

  const detail = {
    message: String(options.message || '').trim(),
    type: String(options.type || 'success').trim() || 'success',
    duration: Number(options.duration || 2400)
  }

  if (!detail.message) return

  window.dispatchEvent(new CustomEvent(APP_TOAST_EVENT, { detail }))
}

export function showSuccessToast(message, options = {}) {
  showToast({
    ...options,
    message,
    type: 'success'
  })
}

export function showErrorToast(message, options = {}) {
  showToast({
    ...options,
    message,
    type: 'error'
  })
}

export function showWarningToast(message, options = {}) {
  showToast({
    ...options,
    message,
    type: 'warning'
  })
}

export { APP_TOAST_EVENT }
