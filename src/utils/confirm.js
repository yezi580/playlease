const APP_CONFIRM_EVENT = 'app:confirm'

let nextConfirmId = 1
const confirmResolvers = new Map()

export function showConfirm(options = {}) {
  if (typeof window === 'undefined') {
    return Promise.resolve(false)
  }

  const id = nextConfirmId++
  const detail = {
    id,
    title: String(options.title || '请确认').trim() || '请确认',
    message: String(options.message || '').trim(),
    confirmText: String(options.confirmText || '确认').trim() || '确认',
    cancelText: String(options.cancelText || '取消').trim() || '取消',
    tone: String(options.tone || 'primary').trim() || 'primary'
  }

  return new Promise((resolve) => {
    confirmResolvers.set(id, resolve)
    window.dispatchEvent(new CustomEvent(APP_CONFIRM_EVENT, { detail }))
  })
}

export function showPrompt(options = {}) {
  if (typeof window === 'undefined') {
    return Promise.resolve(null)
  }

  const id = nextConfirmId++
  const detail = {
    id,
    isPrompt: true,
    title: String(options.title || '请输入').trim() || '请输入',
    message: String(options.message || '').trim(),
    inputValue: String(options.defaultValue || '').trim(),
    inputPlaceholder: String(options.inputPlaceholder || '请输入...').trim(),
    confirmText: String(options.confirmText || '确认').trim() || '确认',
    cancelText: String(options.cancelText || '取消').trim() || '取消',
    tone: String(options.tone || 'primary').trim() || 'primary'
  }

  return new Promise((resolve) => {
    confirmResolvers.set(id, resolve)
    window.dispatchEvent(new CustomEvent(APP_CONFIRM_EVENT, { detail }))
  })
}

export function resolveConfirm(id, result) {
  const safeId = Number(id || 0)
  const resolver = confirmResolvers.get(safeId)
  if (!resolver) return

  confirmResolvers.delete(safeId)
  resolver(result)
}

export { APP_CONFIRM_EVENT }
