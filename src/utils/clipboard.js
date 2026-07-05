import { showErrorToast, showSuccessToast } from './toast.js'

export async function copyText(text, successMessage = '已复制', failureMessage = '复制失败，请手动复制') {
  const normalizedText = String(text || '').trim()
  if (!normalizedText) return false

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(normalizedText)
    } else if (!copyTextFallback(normalizedText)) {
      throw new Error('clipboard unavailable')
    }

    showSuccessToast(successMessage)
    return true
  } catch (_error) {
    if (copyTextFallback(normalizedText)) {
      showSuccessToast(successMessage)
      return true
    }

    showErrorToast(failureMessage)
    return false
  }
}

export function copyTextFallback(text) {
  if (typeof document === 'undefined') return false

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'readonly')
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)

  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch (_error) {
    copied = false
  }

  document.body.removeChild(textarea)
  return copied
}
