<template>
  <div class="admin-page">
    <div class="admin-page-body">
      <div v-if="booting" class="admin-state-card">
        <div class="admin-state-mark">ADMIN</div>
        <h1>平台管理控制台</h1>
        <p>正在验证管理员身份与系统状态...</p>
      </div>

      <div v-else-if="!isAuthenticated" class="admin-auth-shell">
        <section class="admin-auth-card">
          <div class="admin-auth-badge">天蓬商行管理后台</div>
          <div class="admin-auth-head">
            <h1>平台管理控制台</h1>
            <p>统一管理用户、商品、订单审核与平台运营数据。</p>
          </div>

          <div class="admin-auth-status">
            <span class="admin-auth-status-label">系统服务状态</span>
            <strong :class="{ 'admin-status-ok': Boolean(healthStatus?.ok), 'admin-status-error': !healthStatus?.ok }">
              {{ healthStatusText }}
            </strong>
          </div>

          <div class="admin-auth-tips">
            <span>安全登录</span>
            <span>操作留痕</span>
            <span>统一治理</span>
          </div>

          <label class="admin-field">
            <span>手机号</span>
            <input
              v-model.trim="loginForm.phone"
              type="text"
              maxlength="11"
              inputmode="numeric"
              autocomplete="username"
              placeholder="请输入管理员手机号"
              :disabled="loginSubmitting || codeSending"
              @keydown.enter.prevent="handleLogin"
            >
          </label>

          <label class="admin-field">
            <span>验证码</span>
            <div class="admin-code-group">
              <input
                v-model.trim="loginForm.code"
                type="text"
                maxlength="8"
                inputmode="numeric"
                placeholder="请输入验证码"
                :disabled="loginSubmitting"
                @keydown.enter.prevent="handleLogin"
              >
              <button
                type="button"
                class="admin-code-btn"
                :disabled="loginSubmitting || codeSending || captchaLoading || captchaScriptLoading || codeCountdown > 0"
                @click="sendSmsCode"
              >
                {{ codeButtonText }}
              </button>
            </div>
          </label>

          <p v-if="loginError" class="admin-error-text">{{ loginError }}</p>

          <button
            type="button"
            class="admin-primary-btn"
            :disabled="loginSubmitting"
            @click="handleLogin"
          >
            {{ loginSubmitting ? '登录中...' : '进入管理控制台' }}
          </button>
        </section>
      </div>

      <div v-else class="admin-shell">
        <aside class="admin-sidebar">
          <div class="admin-brand">
            <img class="admin-brand-mark admin-brand-mark-img" src="/web.jpg" alt="天蓬商行" />
            <strong>天蓬商行</strong>
            <span>平台运营管理中心</span>
          </div>

          <button
            v-for="item in sections"
            :key="item.key"
            type="button"
            class="admin-nav-btn"
            :class="{ 'admin-nav-btn--active': activeSection === item.key }"
            @click="selectSection(item)"
          >
            {{ item.label }}
          </button>
        </aside>

        <main class="admin-main">
          <RouterView v-slot="{ Component, route }">
            <Transition name="admin-section-fade" mode="out-in">
              <KeepAlive>
                <component
                  :is="Component"
                  :key="route.name || activeSection"
                  v-bind="currentSectionProps"
                  @force-logout="handleLogout"
                />
              </KeepAlive>
            </Transition>
          </RouterView>
        </main>
      </div>
    </div>

    <AppFooter class="admin-footer" :class="{ 'admin-footer--with-sidebar': isAuthenticated }" />
  </div>
</template>

<script>
import { RouterView } from 'vue-router'
import AppFooter from '../src/components/AppFooter.vue'
import { apiFetch, clearAuth, setAuth } from './utils/api.js'
import { adminSections } from './router'

export default {
  name: 'AdminApp',
  components: {
    AppFooter,
    RouterView
  },
  data() {
    return {
      booting: true,
      loginSubmitting: false,
      loginError: '',
      loginForm: {
        phone: '',
        code: ''
      },
      currentUser: null,
      healthStatus: null,
      codeSending: false,
      captchaLoading: false,
      captchaConfigLoaded: false,
      captchaEnabled: false,
      captchaAppId: '',
      captchaJsUrl: '',
      captchaUserLanguage: 'zh-cn',
      captchaScriptLoading: false,
      captchaScriptLoaded: false,
      codeCountdown: 0,
      codeTimer: null
    }
  },
  computed: {
    isAuthenticated() {
      return Boolean(this.currentUser && this.currentUser.role === 'admin')
    },
    activeSection() {
      return this.$route.meta?.sectionKey || 'overview'
    },
    sections() {
      return adminSections
    },
    currentSectionProps() {
      if (this.activeSection === 'overview') {
        return {
          currentUser: this.currentUser,
          healthStatus: this.healthStatus
        }
      }
      if (this.activeSection === 'users') {
        return {
          currentUser: this.currentUser
        }
      }
      if (this.activeSection === 'security') {
        return {
          currentUser: this.currentUser
        }
      }
      return {}
    },
    healthStatusText() {
      if (this.healthStatus?.ok) {
        return '服务正常'
      }
      return '服务异常'
    },
    codeButtonText() {
      if (this.captchaLoading || this.captchaScriptLoading) return '加载验证中...'
      if (this.codeSending) return '发送中...'
      if (this.codeCountdown > 0) return `${this.codeCountdown}s 后重发`
      return '获取验证码'
    }
  },
  async mounted() {
    await this.fetchHealthStatus()
    await this.initializeAuth()
    this.restoreCodeCountdown()
  },
  beforeUnmount() {
    this.clearCodeTimer()
  },
  methods: {
    async initializeAuth() {
      try {
        await this.fetchProfile()
      } catch (error) {
        this.handleLocalLogout()
        this.loginError = error?.status === 401 ? '' : (error.message || '登录已失效，请重新登录')
      } finally {
        this.booting = false
      }
    },
    async fetchHealthStatus() {
      try {
        this.healthStatus = await apiFetch('/api/admin/health')
      } catch (_error) {
        this.healthStatus = { ok: false }
      }
    },
    async fetchProfile() {
      const data = await apiFetch('/api/admin/profile')
      this.currentUser = data.user
        ? {
            ...data.user,
            adminSecurity: data.security || {}
          }
        : null
      if (this.currentUser) {
        setAuth('', this.currentUser)
      }
    },
    handleLocalLogout() {
      clearAuth()
      this.currentUser = null
    },
    async handleLogin() {
      const phone = String(this.loginForm.phone || '').trim()
      const code = String(this.loginForm.code || '').trim()

      if (!phone || !code) {
        this.loginError = '手机号和验证码不能为空'
        return
      }
      if (!/^1[3-9]\d{9}$/.test(phone)) {
        this.loginError = '手机号格式不正确'
        return
      }
      if (!/^\d{4,8}$/.test(code)) {
        this.loginError = '验证码格式不正确'
        return
      }

      this.loginSubmitting = true
      this.loginError = ''
      try {
        const data = await apiFetch('/api/admin/login', {
          method: 'POST',
          body: JSON.stringify({ phone, code })
        })

        if (String(data?.user?.role || '') !== 'admin') {
          this.handleLocalLogout()
          throw new Error('当前账号不是管理员，无法进入后台')
        }

        setAuth('', data.user)
        this.currentUser = data.user
      } catch (error) {
        this.handleLocalLogout()
        this.loginError = error.message || '登录失败'
      } finally {
        this.loginSubmitting = false
      }
    },
    clearCodeTimer() {
      if (this.codeTimer) {
        clearInterval(this.codeTimer)
        this.codeTimer = null
      }
    },
    restoreCodeCountdown() {
      const scene = 'login'
      const expireTimeStr = localStorage.getItem(`sms_countdown_${scene}`)
      if (expireTimeStr) {
        const expireTime = parseInt(expireTimeStr, 10)
        const now = Date.now()
        if (expireTime > now) {
          const remainSeconds = Math.ceil((expireTime - now) / 1000)
          this.startCodeCountdown(remainSeconds)
        } else {
          localStorage.removeItem(`sms_countdown_${scene}`)
        }
      }
    },
    startCodeCountdown(seconds) {
      this.clearCodeTimer()
      this.codeCountdown = Math.max(0, Number(seconds || 0) || 0)
      if (this.codeCountdown > 0) {
        const expireTime = Date.now() + this.codeCountdown * 1000
        localStorage.setItem('sms_countdown_login', expireTime.toString())
      }
      if (this.codeCountdown <= 0) return
      this.codeTimer = setInterval(() => {
        if (this.codeCountdown <= 1) {
          this.codeCountdown = 0
          localStorage.removeItem('sms_countdown_login')
          this.clearCodeTimer()
          return
        }
        this.codeCountdown -= 1
      }, 1000)
    },
    async ensureCaptchaConfig() {
      if (this.captchaConfigLoaded) {
        if (!this.captchaEnabled) {
          throw new Error('腾讯云验证码未配置完成，请联系管理员')
        }
        return
      }
      this.captchaLoading = true
      try {
        const data = await apiFetch('/api/auth/captcha/config')
        this.captchaConfigLoaded = true
        this.captchaEnabled = Boolean(data.enabled)
        this.captchaAppId = String(data.captcha_app_id || '').trim()
        this.captchaJsUrl = String(data.js_url || '').trim()
        this.captchaUserLanguage = String(data.user_language || 'zh-cn').trim() || 'zh-cn'
        if (!this.captchaEnabled || !this.captchaAppId || !this.captchaJsUrl) {
          throw new Error('腾讯云验证码未配置完成，请联系管理员')
        }
      } finally {
        this.captchaLoading = false
      }
    },
    async ensureTencentCaptchaScript() {
      if (this.captchaScriptLoaded && typeof window.TencentCaptcha === 'function') {
        return
      }
      await this.ensureCaptchaConfig()
      if (typeof window.TencentCaptcha === 'function') {
        this.captchaScriptLoaded = true
        return
      }

      if (window.__tencentCaptchaScriptPromise) {
        this.captchaScriptLoading = true
        try {
          await window.__tencentCaptchaScriptPromise
          this.captchaScriptLoaded = typeof window.TencentCaptcha === 'function'
          if (!this.captchaScriptLoaded) {
            throw new Error('腾讯云验证码脚本加载失败')
          }
          return
        } finally {
          this.captchaScriptLoading = false
        }
      }

      this.captchaScriptLoading = true
      window.__tencentCaptchaScriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = this.captchaJsUrl
        script.async = true
        script.onload = () => resolve()
        script.onerror = () => reject(new Error('腾讯云验证码脚本加载失败'))
        document.head.appendChild(script)
      })

      try {
        await window.__tencentCaptchaScriptPromise
        this.captchaScriptLoaded = typeof window.TencentCaptcha === 'function'
        if (!this.captchaScriptLoaded) {
          throw new Error('腾讯云验证码脚本加载失败')
        }
      } finally {
        this.captchaScriptLoading = false
      }
    },
    async openTencentCaptcha() {
      await this.ensureTencentCaptchaScript()
      const CaptchaCtor = window.TencentCaptcha
      if (typeof CaptchaCtor !== 'function') {
        throw new Error('腾讯云验证码初始化失败')
      }

      return new Promise((resolve, reject) => {
        try {
          const captcha = new CaptchaCtor(this.captchaAppId, (res) => {
            if (Number(res?.ret) === 2) {
              resolve(null)
              return
            }
            if (Number(res?.ret) === 0 && res?.ticket && res?.randstr) {
              resolve({
                ticket: String(res.ticket || '').trim(),
                randstr: String(res.randstr || '').trim()
              })
              return
            }
            reject(new Error('验证码校验未通过，请重试'))
          }, {
            userLanguage: this.captchaUserLanguage
          })
          captcha.show()
        } catch (error) {
          reject(error)
        }
      })
    },
    async sendSmsCode() {
      const phone = String(this.loginForm.phone || '').trim()
      if (!phone) {
        this.loginError = '请输入手机号'
        return
      }
      if (!/^1[3-9]\d{9}$/.test(phone)) {
        this.loginError = '手机号格式不正确'
        return
      }
      this.loginError = ''

      let captchaResult = null
      try {
        this.captchaLoading = true
        captchaResult = await this.openTencentCaptcha()
      } catch (error) {
        this.loginError = error.message || '拉起腾讯云验证码失败'
        return
      } finally {
        this.captchaLoading = false
      }

      if (!captchaResult?.ticket || !captchaResult?.randstr) {
        return
      }

      this.codeSending = true
      try {
        const data = await apiFetch('/api/auth/sms/send', {
          method: 'POST',
          body: JSON.stringify({
            phone,
            scene: 'admin_login',
            captcha_ticket: captchaResult.ticket,
            captcha_randstr: captchaResult.randstr
          })
        })
        const retryAfterSeconds = Math.max(0, Number(data.retry_after_seconds || 60) || 60)
        this.startCodeCountdown(retryAfterSeconds)
      } catch (error) {
        this.loginError = error?.data?.message || error?.message || '发送验证码失败'
      } finally {
        this.codeSending = false
      }
    },
    selectSection(section) {
      if (!section?.routeName || this.$route.name === section.routeName) {
        return
      }
      this.$router.push({ name: section.routeName })
    },
    handleLogout() {
      this.handleLocalLogout()
      this.loginForm.code = ''
      if (this.$route.name !== 'admin-overview') {
        this.$router.replace({ name: 'admin-overview' })
      }
    }
  }
}
</script>

<style scoped>
.admin-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #f4f7fb 0%, #eef3f9 100%);
}

.admin-page-body {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.admin-auth-shell,
.admin-state-card {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.admin-auth-card,
.admin-state-card,
.admin-panel,
.admin-summary-card {
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
}

.admin-auth-card {
  width: min(100%, 420px);
  padding: 32px;
  backdrop-filter: blur(18px);
}

.admin-auth-head h1,
.admin-topbar h1 {
  margin: 0;
  font-size: 30px;
  color: #0f172a;
}

.admin-auth-head p,
.admin-topbar p {
  margin: 10px 0 0;
  color: #64748b;
  line-height: 1.7;
}

.admin-state-mark,
.admin-auth-badge,
.admin-brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.admin-state-mark,
.admin-auth-badge {
  min-height: 34px;
  padding: 0 14px;
  margin-bottom: 16px;
  background: linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%);
  color: #1d4ed8;
  font-size: 12px;
}

.admin-section-fade-enter-active,
.admin-section-fade-leave-active {
  transition: opacity 0.12s ease;
}

.admin-section-fade-enter-from,
.admin-section-fade-leave-to {
  opacity: 0;
}

.admin-auth-status {
  margin: 20px 0 14px;
  padding: 14px 16px;
  border-radius: 16px;
  background: linear-gradient(135deg, #f8fbff 0%, #eef4ff 100%);
  border: 1px solid #dbeafe;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.admin-auth-status-label {
  color: #64748b;
  font-size: 14px;
}

.admin-status-ok {
  color: #0f766e;
}

.admin-status-error {
  color: #b91c1c;
}

.admin-auth-tips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 18px;
}

.admin-auth-tips span {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #475569;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
}

.admin-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.admin-field span {
  font-size: 14px;
  color: #334155;
  font-weight: 600;
}

.admin-field input {
  min-height: 48px;
  padding: 0 16px;
  border-radius: 14px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.admin-field input:focus {
  outline: none;
  border-color: #60a5fa;
  box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.16);
  transform: translateY(-1px);
}

.admin-primary-btn,
.admin-ghost-btn,
.admin-nav-btn {
  min-height: 46px;
  border-radius: 14px;
  border: none;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease, color 0.18s ease;
}

.admin-primary-btn {
  width: 100%;
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  color: #ffffff;
  font-weight: 700;
  box-shadow: 0 14px 28px rgba(37, 99, 235, 0.22);
}

.admin-primary-btn:hover:not(:disabled),
.admin-ghost-btn:hover,
.admin-nav-btn:hover {
  transform: translateY(-1px);
}

.admin-primary-btn:hover:not(:disabled) {
  box-shadow: 0 18px 30px rgba(37, 99, 235, 0.28);
}

.admin-primary-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.admin-ghost-btn {
  padding: 0 16px;
  border: 1px solid #dbe3ee;
  background: rgba(255, 255, 255, 0.9);
  color: #334155;
}

.admin-ghost-btn:hover {
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);
}

.admin-error-text {
  margin: 0 0 12px;
  color: #b91c1c;
}

.admin-code-group {
  display: flex;
  gap: 10px;
}

.admin-code-group input {
  flex: 1;
}

.admin-code-btn {
  min-width: 120px;
  min-height: 48px;
  padding: 0 14px;
  border-radius: 14px;
  border: 1px solid #dbe3ee;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
  white-space: nowrap;
}

.admin-code-btn:hover:not(:disabled) {
  background: #dbeafe;
  transform: translateY(-1px);
}

.admin-code-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.admin-shell {
  flex: 1;
  display: block;
}

.admin-footer {
  border-top: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(10px);
}

.admin-footer--with-sidebar {
  margin-left: 240px;
}

.admin-sidebar {
  position: fixed;
  top: 0;
  left: 0;
  width: 240px;
  height: 100vh;
  overflow-y: auto;
  padding: 20px;
  background: linear-gradient(180deg, #0f172a 0%, #111827 55%, #172033 100%);
  color: #ffffff;
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 20;
  box-shadow: 24px 0 50px rgba(15, 23, 42, 0.18);
}

.admin-brand {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 4px 20px;
}

.admin-brand-mark {
  width: 44px;
  height: 44px;
  margin-bottom: 8px;
  border-radius: 16px;
  background: linear-gradient(135deg, #3b82f6 0%, #38bdf8 100%);
  color: #eff6ff;
  font-size: 16px;
  box-shadow: 0 16px 30px rgba(59, 130, 246, 0.22);
}

.admin-brand-mark-img {
  background: transparent;
  box-shadow: 0 16px 30px rgba(15, 23, 42, 0.25);
  object-fit: cover;
}

.admin-brand strong {
  font-size: 18px;
  letter-spacing: 0.02em;
}

.admin-brand span {
  color: #94a3b8;
  font-size: 13px;
}

.admin-nav-btn {
  padding: 0 16px;
  text-align: left;
  background: transparent;
  color: #cbd5e1;
  border: 1px solid transparent;
}

.admin-nav-btn--active {
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.24) 0%, rgba(56, 189, 248, 0.16) 100%);
  color: #ffffff;
  border-color: rgba(96, 165, 250, 0.38);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.admin-main {
  min-height: 100vh;
  margin-left: 240px;
  padding: 32px 28px;
}

.admin-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
  padding: 22px 24px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(148, 163, 184, 0.16);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(14px);
}

.admin-topbar-copy {
  min-width: 0;
}

.admin-topbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.admin-service-chip,
.admin-user-chip {
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid #e2e8f0;
}

.admin-service-chip {
  min-height: 48px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #0f766e;
}

.admin-service-chip--error {
  color: #b91c1c;
  background: #fff7f7;
  border-color: #fecaca;
}

.admin-service-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 6px color-mix(in srgb, currentColor 14%, transparent);
}

.admin-user-chip {
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.admin-user-chip span {
  color: #64748b;
  font-size: 13px;
}

.admin-content-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.admin-summary-card {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.admin-summary-card span {
  color: #6b7280;
  font-size: 14px;
}

.admin-summary-card strong {
  font-size: 28px;
}

.admin-panel,
.admin-state-card {
  padding: 24px;
}

.admin-state-card--error strong {
  color: #b91c1c;
}

.admin-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.admin-panel-head span {
  color: #6b7280;
  font-size: 13px;
}

.admin-list {
  margin: 0;
  padding-left: 20px;
  color: #4b5563;
  line-height: 1.8;
}

.admin-table-wrap {
  overflow-x: auto;
}

.admin-search-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.admin-search-input {
  flex: 1;
  min-height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid #d1d5db;
  background: #ffffff;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.admin-search-input:focus,
.admin-date-input:focus {
  outline: none;
  border-color: #60a5fa;
  box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.18);
}

.admin-date-field {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  padding: 4px;
  border-radius: 14px;
  border: 1px solid #dbeafe;
  background: linear-gradient(135deg, #f8fbff 0%, #eff6ff 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.admin-date-field:hover {
  border-color: #93c5fd;
  box-shadow: 0 10px 20px rgba(37, 99, 235, 0.08);
}

.admin-date-field:focus-within {
  border-color: #60a5fa;
  box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.14);
  transform: translateY(-1px);
}

.admin-date-field-label {
  padding: 0 12px;
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.admin-date-input {
  min-width: 170px;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.92);
  color: #1f2937;
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.06);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.admin-date-input::-webkit-calendar-picker-indicator {
  cursor: pointer;
  opacity: 0.72;
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.admin-date-input:hover::-webkit-calendar-picker-indicator,
.admin-date-input:focus::-webkit-calendar-picker-indicator {
  opacity: 1;
  transform: scale(1.05);
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
}

.admin-table th,
.admin-table td {
  padding: 12px 10px;
  border-bottom: 1px solid #e5e7eb;
  text-align: left;
  white-space: nowrap;
  font-size: 14px;
}

.admin-table th {
  color: #6b7280;
  font-weight: 600;
}

.admin-role-select {
  min-height: 36px;
  min-width: 110px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid #d1d5db;
  background: #ffffff;
}

.admin-row-btn {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  background: #eff6ff;
  color: #1d4ed8;
}

.admin-row-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.admin-row-btn--danger {
  border-color: #fecaca;
  background: #fef2f2;
  color: #b91c1c;
}

.admin-row-actions {
  display: flex;
  gap: 8px;
}

.admin-status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
}

.admin-status-badge--ok {
  color: #047857;
  background: #d1fae5;
}

.admin-status-badge--danger {
  color: #b91c1c;
  background: #fee2e2;
}

.admin-days-input {
  width: 92px;
  min-height: 36px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid #d1d5db;
  background: #ffffff;
}

.admin-inline-message {
  margin: 12px 0 0;
  color: #047857;
  font-size: 14px;
}

.admin-inline-message--error {
  color: #b91c1c;
}

@media (max-width: 960px) {
  .admin-sidebar {
    position: static;
    width: auto;
    height: auto;
    flex-direction: row;
    overflow-x: auto;
    overflow-y: visible;
    box-shadow: none;
  }

  .admin-topbar {
    flex-direction: column;
    align-items: stretch;
  }

  .admin-topbar-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .admin-content-grid {
    grid-template-columns: 1fr;
  }

  .admin-main {
    margin-left: 0;
    padding: 20px 16px 28px;
  }

  .admin-footer--with-sidebar {
    margin-left: 0;
  }

  .admin-search-bar,
  .admin-row-actions {
    flex-wrap: wrap;
  }
}
</style>
