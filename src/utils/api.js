/**
 * 前端API请求工具库
 *
 * 功能：
 * 1. 登录态管理 — 由服务端通过 httpOnly Cookie 托管JWT
 * 2. 用户信息缓存 — 仅缓存非敏感用户信息，用于页面初始化体验
 * 3. 统一请求封装(apiFetch) — 自动携带同源Cookie、自动解析JSON响应
 *
 * 使用方式：
 *   import { apiFetch, setAuth, clearAuth } from './utils/api.js'
 *
 *   // 登录成功后保存Token
 *   setAuth(token, user)
 *
 *   // 发起带认证的请求（自动附加 Bearer token）
 *   const data = await apiFetch('/api/listings')
 *
 *   // 退出登录时清除
 *   clearAuth()
 */

const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'

import { buildRuntimeUrl, getRequestCredentials } from './runtime.js'

/**
 * Token 由 httpOnly Cookie 托管，前端不再直接读取
 */
export function getToken() {
  return ''
}

/**
 * 获取当前缓存的用户信息对象
 * @returns {Object|null} 解析后的用户对象，无效或不存在返回null
 */
export function getStoredUser() {
  const raw = sessionStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (_error) {
    sessionStorage.removeItem(USER_KEY)
    return null
  }
}

/**
 * 登录成功后仅缓存非敏感用户信息
 * @param {string} _token - 仅为兼容旧调用签名保留
 * @param {Object} user - 用户信息对象（至少包含username）
 */
export function setAuth(_token, user) {
  sessionStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TOKEN_KEY)
  if (user) {
    sessionStorage.setItem(USER_KEY, JSON.stringify(user))
  }
}

/**
 * 清除所有认证信息（退出登录时调用）
 * 同时删除Token和用户信息
 */
export function clearAuth() {
  clearLocalAuthCache()
  try {
    void fetch(buildRuntimeUrl('/api/logout'), {
      method: 'POST',
      credentials: getRequestCredentials(),
      keepalive: true
    })
  } catch (_error) {
    // 忽略退出清理请求失败，保留本地状态清空即可
  }
}

export function clearLocalAuthCache() {
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(USER_KEY)
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

function buildAuthHeaders(initialHeaders = {}) {
  return new Headers(initialHeaders)
}

export async function createAuthorizedObjectUrl(url, options = {}) {
  const response = await fetch(buildRuntimeUrl(url), {
    ...options,
    credentials: getRequestCredentials(),
    headers: buildAuthHeaders(options.headers || {})
  })

  if (!response.ok) {
    const rawText = await response.text()
    let data = {}
    if (rawText) {
      try {
        data = JSON.parse(rawText)
      } catch (_error) {
        data = { message: rawText }
      }
    }
    const error = new Error(data.message || `请求失败：${response.status}`)
    error.status = response.status
    error.data = data
    throw error
  }

  const blob = await response.blob()
  return URL.createObjectURL(blob)
}

/**
 * 统一API请求封装函数
 *
 * 相比原生fetch的增强功能：
 * - 自动设置 Content-Type: application/json（除非是FormData）
 * - 自动从localStorage读取Token并添加 Authorization: Bearer xxx 头
 * - 自动将响应体解析为JSON对象
 * - 非2xx状态码自动抛出Error（携带status和data信息）
 *
 * @param {string} url - 请求地址（如 '/api/listings'）
 * @param {Object} options - fetch标准配置项（method, body, headers等）
 * @returns {Promise<Object>} 解析后的JSON响应数据
 * @throws {Error} 请求失败时抛出，包含 error.status 和 error.data 属性
 */
export async function apiFetch(url, options = {}) {
  // 构建请求头：保留传入的自定义headers，自动补充Content-Type
  const headers = buildAuthHeaders(options.headers || {})
  const requestUrl = buildRuntimeUrl(url)
  const requestMethod = String(options.method || 'GET').toUpperCase()
  const requestCredentials = getRequestCredentials()

  // 仅在非FormData且未手动设置Content-Type时自动添加
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  let response
  try {
    // 发起fetch请求，合并自定义配置和自动生成的headers
    response = await fetch(requestUrl, {
      ...options,
      credentials: requestCredentials,
      headers
    })
  } catch (networkError) {
    throw networkError
  }

  // 将响应体读取为文本（兼容空响应和非JSON格式）
  const rawText = await response.text()
  let data = {}
  if (rawText) {
    try {
      data = JSON.parse(rawText)
    } catch (_error) {
      // JSON解析失败时将原始文本包装为错误消息
      data = { message: rawText }
    }
  }

  // HTTP状态码非2xx时抛出异常（供上层catch处理）
  if (!response.ok) {
    const error = new Error(data.message || `请求失败：${response.status}`)
    error.status = response.status
    error.data = data
    throw error
  }
  return data
}
