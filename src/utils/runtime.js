const LOCAL_DEV_SERVER_PORT = '5173'
const LOCAL_API_SERVER_ORIGIN = 'http://localhost:3000'

function trimTrailingSlash(value = '') {
  return String(value || '').trim().replace(/\/+$/, '')
}

function isAbsoluteHttpUrl(value = '') {
  return /^https?:\/\//i.test(String(value || '').trim())
}

function getWindowLocation() {
  if (typeof window === 'undefined') {
    return null
  }
  return window.location
}

export function isNativeAppRuntime() {
  if (typeof window === 'undefined') {
    return false
  }

  const capacitor = window.Capacitor
  if (capacitor && typeof capacitor.isNativePlatform === 'function') {
    return capacitor.isNativePlatform()
  }

  const protocol = String(window.location?.protocol || '').toLowerCase()
  return protocol === 'capacitor:' || protocol === 'ionic:'
}

export function getApiBaseUrl() {
  const configuredBaseUrl = trimTrailingSlash(import.meta.env.VITE_API_BASE_URL)
  if (configuredBaseUrl) {
    return configuredBaseUrl
  }

  const location = getWindowLocation()
  if (!location) {
    return LOCAL_API_SERVER_ORIGIN
  }

  const isLocalDevHost = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  if (isLocalDevHost && location.port === LOCAL_DEV_SERVER_PORT) {
    return `${location.protocol}//${location.hostname}:3000`
  }

  return trimTrailingSlash(location.origin)
}

export function buildRuntimeUrl(path = '') {
  const normalizedPath = String(path || '').trim()
  if (!normalizedPath) {
    return getApiBaseUrl()
  }

  if (isAbsoluteHttpUrl(normalizedPath)) {
    return normalizedPath
  }

  const prefix = normalizedPath.startsWith('/') ? '' : '/'
  return `${getApiBaseUrl()}${prefix}${normalizedPath}`
}

export function getSocketServerUrl() {
  const configuredSocketBaseUrl = trimTrailingSlash(import.meta.env.VITE_SOCKET_BASE_URL)
  if (configuredSocketBaseUrl) {
    return configuredSocketBaseUrl
  }

  return getApiBaseUrl()
}

export function getRequestCredentials() {
  return import.meta.env.VITE_REQUEST_CREDENTIALS || 'include'
}
