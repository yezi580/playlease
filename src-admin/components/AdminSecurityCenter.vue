<template>
  <section class="security-page">
    <div class="security-grid">
      <article class="panel panel--hero">
        <div>
          <p class="eyebrow">安全设置</p>
          <h2>管理员认证中心</h2>
          <p class="hero-copy">统一管理 Passkey、受信任设备以及高风险操作的认证方式。</p>
        </div>
        <ul class="hero-list">
          <li>已绑定 Passkey：{{ passkeys.length }}</li>
          <li>受信任设备：{{ trustedDevices.length }}</li>
          <li>当前管理员：{{ currentUser?.username || '管理员' }}</li>
        </ul>
      </article>

      <article v-if="!passkeyEnabled" class="state-card state-card--warning">
        当前环境已关闭管理员 Passkey 与二次校验。适合无证书的测试环境，生产环境请重新开启 `ADMIN_PASSKEY_ENABLED=true`。
      </article>

      <article class="panel">
        <div class="panel-head">
          <strong>Passkey 管理</strong>
          <button type="button" class="panel-btn" :disabled="!passkeyEnabled || passkeysLoading || passkeySubmitting" @click="loadPasskeys">
            {{ passkeysLoading ? '刷新中...' : '刷新' }}
          </button>
        </div>
        <div class="form-row">
          <label class="field">
            <span>设备名称</span>
            <input
              v-model.trim="passkeyDeviceName"
              type="text"
              maxlength="40"
              placeholder="例如：办公室 Windows 笔记本"
              :disabled="!passkeyEnabled || passkeySubmitting"
              @keydown.enter.prevent="handleRegisterPasskey"
            >
          </label>
          <button type="button" class="panel-btn panel-btn--primary" :disabled="!passkeyEnabled || passkeySubmitting" @click="handleRegisterPasskey">
            {{ passkeySubmitting ? '绑定中...' : '添加 Passkey' }}
          </button>
        </div>
        <div class="form-row">
          <label class="field">
            <span>验证手机号</span>
            <input :value="maskedAdminPhone || '当前账号未绑定手机号'" type="text" disabled>
          </label>
          <label class="field">
            <span>短信验证码</span>
            <input
              v-model.trim="passkeySmsCode"
              type="text"
              maxlength="8"
              inputmode="numeric"
              placeholder="请输入短信验证码"
              :disabled="!passkeyEnabled || passkeySubmitting || passkeySmsSending"
              @keydown.enter.prevent="handleRegisterPasskey"
            >
          </label>
          <button
            type="button"
            class="panel-btn"
            :disabled="!passkeyEnabled || passkeySubmitting || passkeySmsSending || passkeySmsCooldown > 0 || !maskedAdminPhone"
            @click="handleSendPasskeySmsCode"
          >
            {{ passkeySmsSending ? '发送中...' : (passkeySmsCooldown > 0 ? `${passkeySmsCooldown}s 后重发` : '发送验证码') }}
          </button>
        </div>
        <p class="form-hint">绑定新的 Passkey 前，需要先验证当前管理员手机号。</p>
        <p v-if="passkeyMessage" class="inline-message" :class="{ 'inline-message--error': passkeyMessageType === 'error' }">
          {{ passkeyMessage }}
        </p>
        <div v-if="!passkeyEnabled" class="state-card">当前环境已关闭 Passkey 管理。</div>
        <div v-else-if="passkeyError" class="state-card state-card--error">{{ passkeyError }}</div>
        <div v-else-if="passkeysLoading" class="state-card">正在读取 Passkey 列表...</div>
        <ul v-else-if="passkeys.length" class="device-list">
          <li v-for="item in passkeys" :key="`passkey-${item.id}`" class="device-item">
            <div class="device-main">
              <strong>{{ item.deviceName }}</strong>
              <span>{{ formatTransports(item.transports) }}</span>
              <small>绑定时间：{{ formatDateTime(item.createdAt) }}</small>
              <small>最近使用：{{ formatDateTime(item.lastUsedAt) }}</small>
            </div>
            <div class="device-action">
              <button
                type="button"
                class="panel-btn panel-btn--danger"
                :disabled="deletingPasskeyId === item.id || passkeySubmitting"
                @click="pendingDeletePasskey = item"
              >
                {{ deletingPasskeyId === item.id ? '删除中...' : '删除' }}
              </button>
            </div>
          </li>
        </ul>
        <div v-else class="state-card">当前还没有绑定 Passkey。建议至少绑定 1 台本机设备。</div>
      </article>

      <article class="panel">
        <div class="panel-head">
          <strong>受信任设备</strong>
          <button type="button" class="panel-btn" :disabled="!passkeyEnabled || trustedDevicesLoading || trustedDeviceSubmitting" @click="loadTrustedDevices">
            {{ trustedDevicesLoading ? '刷新中...' : '刷新' }}
          </button>
        </div>
        <div class="form-row">
          <label class="field">
            <span>当前设备名称</span>
            <input
              v-model.trim="trustedDeviceName"
              type="text"
              maxlength="40"
              placeholder="例如：前台值班电脑"
              :disabled="!passkeyEnabled || trustedDeviceSubmitting"
              @keydown.enter.prevent="handleTrustCurrentDevice"
            >
          </label>
          <button type="button" class="panel-btn panel-btn--primary" :disabled="!passkeyEnabled || trustedDeviceSubmitting" @click="handleTrustCurrentDevice">
            {{ trustedDeviceSubmitting ? '设置中...' : '信任当前设备 30 天' }}
          </button>
        </div>
        <p v-if="trustedDeviceMessage" class="inline-message" :class="{ 'inline-message--error': trustedDeviceMessageType === 'error' }">
          {{ trustedDeviceMessage }}
        </p>
        <div class="panel-subhead">
          <span>设备列表</span>
        </div>
        <div v-if="!passkeyEnabled" class="state-card">当前环境已关闭受信任设备管理。</div>
        <div v-else-if="trustedDeviceError" class="state-card state-card--error">{{ trustedDeviceError }}</div>
        <div v-else-if="trustedDevicesLoading" class="state-card">正在读取受信任设备...</div>
        <ul v-else-if="trustedDevices.length" class="device-list">
          <li v-for="item in trustedDevices" :key="`trusted-${item.id}`" class="device-item">
            <div class="device-main">
              <div class="device-title">
                <strong>{{ item.deviceName }}</strong>
                <span v-if="item.isCurrent" class="chip chip--current">当前设备</span>
              </div>
              <span>{{ formatUserAgent(item.userAgent) }}</span>
              <small>最近 IP：{{ item.lastIp || '--' }}</small>
              <small>最近使用：{{ formatDateTime(item.lastUsedAt) }}</small>
              <small>有效期至：{{ formatDateTime(item.expiresAt) }}</small>
            </div>
            <div class="device-action">
              <button
                type="button"
                class="panel-btn panel-btn--danger"
                :disabled="revokingTrustedDeviceId === item.id || trustedDeviceSubmitting"
                @click="pendingRevokeTrustedDevice = item"
              >
                {{ revokingTrustedDeviceId === item.id ? '删除中...' : '删除' }}
              </button>
            </div>
          </li>
        </ul>
        <div v-else class="state-card">当前还没有受信任设备。建议在常用办公设备上启用，减少重复验证。</div>
      </article>

      <article class="panel">
        <div class="panel-head">
          <strong>策略说明</strong>
        </div>
        <ul class="panel-list">
          <li v-if="passkeyEnabled">角色变更、封禁、关闭订单、下架商品已接入 Passkey 二次校验。</li>
          <li v-else>当前环境已关闭管理员 Passkey 校验，高风险操作不会再触发二次认证。</li>
          <li>管理员绑定新 Passkey 前，需先完成当前账号手机号短信校验。</li>
          <li>受信任设备默认有效 30 天，仅代表“这台设备被管理员确认过”，不会替代 Passkey。</li>
          <li>安全设置本身属于高敏感区域，信任设备与删除凭证都会触发 Passkey 补认证。</li>
        </ul>
      </article>
    </div>

    <AdminConfirmDialog
      :open="Boolean(pendingDeletePasskey)"
      title="确认删除 Passkey"
      :message="deletePasskeyConfirmMessage"
      confirm-text="确认删除"
      :loading="Boolean(pendingDeletePasskey && deletingPasskeyId === pendingDeletePasskey.id)"
      danger
      @cancel="pendingDeletePasskey = null"
      @confirm="confirmDeletePasskey"
    />
    <AdminConfirmDialog
      :open="Boolean(pendingRevokeTrustedDevice)"
      title="确认删除受信任设备"
      :message="revokeTrustedDeviceConfirmMessage"
      confirm-text="确认删除"
      :loading="Boolean(pendingRevokeTrustedDevice && revokingTrustedDeviceId === pendingRevokeTrustedDevice.id)"
      danger
      @cancel="pendingRevokeTrustedDevice = null"
      @confirm="confirmRevokeTrustedDevice"
    />
  </section>
</template>

<script>
import {
  deleteAdminPasskey,
  getStepUpRequirementMessage,
  getStepUpRequirementReason,
  isStepUpRequiredError,
  listAdminPasskeys,
  listTrustedDevices,
  performAdminStepUp,
  registerAdminPasskey,
  sendAdminPasskeyRegisterSmsCode,
  revokeTrustedDevice,
  trustCurrentAdminDevice
} from '../utils/api.js'
import AdminConfirmDialog from './AdminConfirmDialog.vue'

const PASSKEY_SMS_COUNTDOWN_STORAGE_KEY = 'admin_passkey_sms_countdown_expire_at'

export default {
  name: 'AdminSecurityCenter',
  components: {
    AdminConfirmDialog
  },
  props: {
    currentUser: {
      type: Object,
      default: null
    }
  },
  data() {
    return {
      passkeysLoading: false,
      passkeySubmitting: false,
      passkeyError: '',
      passkeyMessage: '',
      passkeyMessageType: 'success',
      passkeyDeviceName: '',
      passkeySmsCode: '',
      passkeySmsSending: false,
      passkeySmsCooldown: 0,
      passkeySmsTimer: null,
      passkeys: [],
      pendingDeletePasskey: null,
      deletingPasskeyId: 0,
      trustedDevicesLoading: false,
      trustedDeviceSubmitting: false,
      trustedDeviceError: '',
      trustedDeviceMessage: '',
      trustedDeviceMessageType: 'success',
      trustedDeviceName: '',
      trustedDevices: [],
      pendingRevokeTrustedDevice: null,
      revokingTrustedDeviceId: 0
    }
  },
  computed: {
    passkeyEnabled() {
      return this.currentUser?.adminSecurity?.passkeyEnabled !== false
    },
    maskedAdminPhone() {
      const phone = String(this.currentUser?.phone || '').trim()
      if (!/^1[3-9]\d{9}$/.test(phone)) {
        return ''
      }
      return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
    },
    deletePasskeyConfirmMessage() {
      if (!this.pendingDeletePasskey) return ''
      return `确认删除 ${this.pendingDeletePasskey.deviceName || '该设备'} 对应的 Passkey 吗？`
    },
    revokeTrustedDeviceConfirmMessage() {
      if (!this.pendingRevokeTrustedDevice) return ''
      return `确认删除 ${this.pendingRevokeTrustedDevice.deviceName || '该设备'} 的信任状态吗？`
    }
  },
  async mounted() {
    if (!this.passkeyEnabled) {
      return
    }
    this.restorePasskeySmsCountdown()
    await Promise.all([
      this.loadPasskeys(),
      this.loadTrustedDevices()
    ])
  },
  beforeUnmount() {
    this.clearPasskeySmsTimer()
  },
  methods: {
    async loadPasskeys() {
      if (!this.passkeyEnabled) {
        this.passkeys = []
        return
      }
      this.passkeysLoading = true
      this.passkeyError = ''
      try {
        const data = await listAdminPasskeys()
        this.passkeys = Array.isArray(data.list) ? data.list : []
      } catch (error) {
        this.passkeyError = error.message || '获取 Passkey 列表失败'
      } finally {
        this.passkeysLoading = false
      }
    },
    async loadTrustedDevices() {
      if (!this.passkeyEnabled) {
        this.trustedDevices = []
        return
      }
      this.trustedDevicesLoading = true
      this.trustedDeviceError = ''
      try {
        const data = await listTrustedDevices()
        this.trustedDevices = Array.isArray(data.list) ? data.list : []
      } catch (error) {
        this.trustedDeviceError = error.message || '获取受信任设备失败'
      } finally {
        this.trustedDevicesLoading = false
      }
    },
    async handleRegisterPasskey() {
      if (!this.passkeyEnabled) {
        return
      }
      if (!this.passkeySmsCode) {
        this.passkeyMessageType = 'error'
        this.passkeyMessage = '请先输入短信验证码'
        return
      }
      this.passkeySubmitting = true
      this.passkeyError = ''
      this.passkeyMessage = ''
      try {
        const data = await registerAdminPasskey(this.passkeyDeviceName, this.passkeySmsCode)
        this.passkeyMessageType = 'success'
        this.passkeyMessage = data.message || `Passkey 绑定成功：${data?.passkey?.deviceName || this.passkeyDeviceName || '未命名设备'}`
        this.passkeyDeviceName = ''
        this.passkeySmsCode = ''
        await this.loadPasskeys()
      } catch (error) {
        this.passkeyMessageType = 'error'
        this.passkeyMessage = this.buildSmsErrorMessage(error, error.message || 'Passkey 绑定失败')
      } finally {
        this.passkeySubmitting = false
      }
    },
    async handleSendPasskeySmsCode() {
      if (!this.passkeyEnabled || this.passkeySmsSending || this.passkeySmsCooldown > 0) {
        return
      }
      this.passkeySmsSending = true
      this.passkeyError = ''
      this.passkeyMessage = ''
      try {
        const data = await sendAdminPasskeyRegisterSmsCode()
        const retryAfterSeconds = Math.max(0, Number(data?.retry_after_seconds || 0) || 0)
        this.passkeyMessageType = 'success'
        this.passkeyMessage = data?.maskedPhone
          ? `验证码已发送至 ${data.maskedPhone}，请注意查收。`
          : '验证码已发送，请注意查收。'
        this.startPasskeySmsCountdown(retryAfterSeconds)
      } catch (error) {
        this.passkeyMessageType = 'error'
        this.passkeyMessage = this.buildSmsErrorMessage(error, '发送验证码失败')
      } finally {
        this.passkeySmsSending = false
      }
    },
    async handleTrustCurrentDevice() {
      if (!this.passkeyEnabled) {
        return
      }
      this.trustedDeviceSubmitting = true
      this.trustedDeviceError = ''
      this.trustedDeviceMessage = ''
      try {
        const data = await this.runProtectedAction('trust_current_device', () => trustCurrentAdminDevice(this.trustedDeviceName))
        this.trustedDeviceMessageType = 'success'
        this.trustedDeviceMessage = data.message || '当前设备已加入受信任设备'
        this.trustedDeviceName = ''
        await this.loadTrustedDevices()
      } catch (error) {
        this.trustedDeviceMessageType = 'error'
        this.trustedDeviceMessage = error.message || '设置信任设备失败'
      } finally {
        this.trustedDeviceSubmitting = false
      }
    },
    async confirmDeletePasskey() {
      if (!this.passkeyEnabled) {
        this.pendingDeletePasskey = null
        return
      }
      const item = this.pendingDeletePasskey
      if (!item?.id) {
        this.pendingDeletePasskey = null
        return
      }
      this.deletingPasskeyId = Number(item.id || 0)
      this.passkeyMessage = ''
      try {
        const data = await this.runProtectedAction('delete_passkey', () => deleteAdminPasskey(item.id))
        this.passkeyMessageType = 'success'
        this.passkeyMessage = data.message || 'Passkey 已删除'
        await this.loadPasskeys()
      } catch (error) {
        this.passkeyMessageType = 'error'
        this.passkeyMessage = error.message || '删除 Passkey 失败'
      } finally {
        this.deletingPasskeyId = 0
        this.pendingDeletePasskey = null
      }
    },
    async confirmRevokeTrustedDevice() {
      if (!this.passkeyEnabled) {
        this.pendingRevokeTrustedDevice = null
        return
      }
      const item = this.pendingRevokeTrustedDevice
      if (!item?.id) {
        this.pendingRevokeTrustedDevice = null
        return
      }
      this.revokingTrustedDeviceId = Number(item.id || 0)
      this.trustedDeviceMessage = ''
      try {
        const data = await this.runProtectedAction('revoke_trusted_device', () => revokeTrustedDevice(item.id))
        this.trustedDeviceMessageType = 'success'
        this.trustedDeviceMessage = data.message || '受信任设备已移除'
        await this.loadTrustedDevices()
      } catch (error) {
        this.trustedDeviceMessageType = 'error'
        this.trustedDeviceMessage = error.message || '移除受信任设备失败'
      } finally {
        this.revokingTrustedDeviceId = 0
        this.pendingRevokeTrustedDevice = null
      }
    },
    async runProtectedAction(action, requester) {
      try {
        return await requester()
      } catch (error) {
        if (!isStepUpRequiredError(error)) {
          throw error
        }
        if (getStepUpRequirementReason(error) === 'trusted_device_required') {
          throw new Error(getStepUpRequirementMessage(error))
        }
        await performAdminStepUp(action)
        return requester()
      }
    },
    formatDurationText(seconds) {
      const totalSeconds = Math.max(0, Number(seconds || 0) || 0)
      if (!totalSeconds) return ''
      const minutes = Math.floor(totalSeconds / 60)
      const remainSeconds = totalSeconds % 60
      if (minutes > 0) {
        return `${minutes} 分钟${remainSeconds > 0 ? ` ${remainSeconds} 秒` : ''}`
      }
      return `${remainSeconds} 秒`
    },
    buildSmsErrorMessage(error, fallbackMessage) {
      const data = error?.data && typeof error.data === 'object' ? error.data : {}
      const baseMessage = String(data.message || error?.message || fallbackMessage || '').trim() || fallbackMessage
      const remainingAttempts = Math.max(0, Number(data.remaining_attempts || 0) || 0)
      const retryAfterSeconds = Math.max(0, Number(data.retry_after_seconds || 0) || 0)
      const durationText = this.formatDurationText(retryAfterSeconds)

      if (remainingAttempts > 0) {
        return `${baseMessage}，还可尝试 ${remainingAttempts} 次`
      }
      if (retryAfterSeconds > 0 && durationText) {
        return `${baseMessage}，请 ${durationText} 后重试`
      }
      return baseMessage
    },
    clearPasskeySmsTimer() {
      if (this.passkeySmsTimer) {
        window.clearInterval(this.passkeySmsTimer)
        this.passkeySmsTimer = null
      }
    },
    startPasskeySmsCountdown(seconds) {
      this.clearPasskeySmsTimer()
      this.passkeySmsCooldown = Math.max(0, Number(seconds || 0) || 0)
      if (this.passkeySmsCooldown <= 0) {
        localStorage.removeItem(PASSKEY_SMS_COUNTDOWN_STORAGE_KEY)
        return
      }
      localStorage.setItem(
        PASSKEY_SMS_COUNTDOWN_STORAGE_KEY,
        String(Date.now() + this.passkeySmsCooldown * 1000)
      )
      this.passkeySmsTimer = window.setInterval(() => {
        if (this.passkeySmsCooldown <= 1) {
          this.passkeySmsCooldown = 0
          localStorage.removeItem(PASSKEY_SMS_COUNTDOWN_STORAGE_KEY)
          this.clearPasskeySmsTimer()
          return
        }
        this.passkeySmsCooldown -= 1
      }, 1000)
    },
    restorePasskeySmsCountdown() {
      const expireAt = Number(localStorage.getItem(PASSKEY_SMS_COUNTDOWN_STORAGE_KEY) || 0) || 0
      if (!expireAt || expireAt <= Date.now()) {
        localStorage.removeItem(PASSKEY_SMS_COUNTDOWN_STORAGE_KEY)
        this.passkeySmsCooldown = 0
        return
      }
      this.startPasskeySmsCountdown(Math.ceil((expireAt - Date.now()) / 1000))
    },
    formatTransports(value) {
      const list = Array.isArray(value) ? value.filter(Boolean) : []
      return list.length ? `可用通道：${list.join(' / ')}` : '可用通道：由系统自动识别'
    },
    formatUserAgent(value) {
      const text = String(value || '').trim()
      if (!text) return '浏览器环境信息不可用'

      const browserVersion = this.extractUserAgentVersion(text, [
        { label: 'Edge', pattern: /Edg\/([\d.]+)/i },
        { label: 'Chrome', pattern: /Chrome\/([\d.]+)/i },
        { label: 'Firefox', pattern: /Firefox\/([\d.]+)/i },
        { label: 'Safari', pattern: /Version\/([\d.]+).*Safari/i }
      ])

      const systemLabel = this.extractUserAgentSystem(text)
      const parts = [systemLabel, browserVersion].filter(Boolean)
      return parts.length ? parts.join(' · ') : '浏览器环境信息不可用'
    },
    extractUserAgentVersion(userAgent, matchers) {
      for (const matcher of matchers) {
        const matched = userAgent.match(matcher.pattern)
        if (matched?.[1]) {
          return `${matcher.label} ${matched[1].split('.')[0]}`
        }
      }
      return '未知浏览器'
    },
    extractUserAgentSystem(userAgent) {
      if (/Windows NT 10\.0/i.test(userAgent)) return 'Windows 10/11'
      if (/Windows NT 6\.3/i.test(userAgent)) return 'Windows 8.1'
      if (/Windows NT 6\.2/i.test(userAgent)) return 'Windows 8'
      if (/Windows NT 6\.1/i.test(userAgent)) return 'Windows 7'
      if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iOS'
      if (/Android/i.test(userAgent)) return 'Android'
      if (/Mac OS X/i.test(userAgent)) return 'macOS'
      if (/Linux/i.test(userAgent)) return 'Linux'
      return '未知系统'
    },
    formatDateTime(value) {
      if (!value) return '--'
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return String(value)
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    }
  }
}
</script>

<style scoped>
.security-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.security-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.panel,
.state-card {
  border-radius: 20px;
  background: #fff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.08);
  padding: 20px;
}

.panel--hero {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  grid-column: 1 / -1;
  background: linear-gradient(135deg, rgba(239, 246, 255, 0.95), rgba(248, 250, 252, 0.95));
}

.eyebrow {
  margin: 0 0 8px;
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.panel--hero h2,
.panel-head strong {
  margin: 0;
  color: #0f172a;
}

.hero-copy {
  margin: 10px 0 0;
  color: #475569;
  line-height: 1.7;
}

.hero-list,
.panel-list {
  margin: 0;
  padding-left: 18px;
  color: #475569;
  line-height: 1.8;
}

.panel-head,
.panel-subhead {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.panel-subhead span {
  color: #64748b;
  font-size: 14px;
}

.form-row {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 14px;
}

.form-hint {
  margin: -2px 0 14px;
  color: #64748b;
  font-size: 13px;
  line-height: 1.6;
}

.field {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  color: #475569;
  font-size: 14px;
}

.field input {
  min-height: 42px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid #d1d5db;
  background: #fff;
}

.field input:disabled {
  background: #f8fafc;
  color: #64748b;
}

.panel-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #334155;
  cursor: pointer;
}

.panel-btn--primary {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
}

.panel-btn--danger {
  min-width: 90px;
  height: 50%;
  border: 1px solid #fecaca;
  background: #fef2f2;
  color: #ef4444;
  font-weight: 500;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.panel-btn--danger:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: #fca5a5;
  background: #fee2e2;
  color: #dc2626;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.08);
}

.panel-btn--danger:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 2px 4px rgba(239, 68, 68, 0.04);
}

.panel-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.inline-message {
  margin: 0 0 14px;
  color: #047857;
  line-height: 1.7;
}

.inline-message--error,
.state-card--error {
  color: #b91c1c;
}

.state-card--error {
  border-color: #fecaca;
  background: #fff1f2;
  box-shadow: none;
}

.state-card--warning {
  color: #92400e;
  border-color: #fcd34d;
  background: #fffbeb;
  box-shadow: none;
}

.device-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.device-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border-radius: 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.device-action {
  display: flex;
  align-items: center;
  align-self: stretch;
}

.device-main {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.device-main strong {
  color: #0f172a;
}

.device-main span,
.device-main small {
  color: #64748b;
}

.device-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.chip--current {
  background: #dbeafe;
  color: #1d4ed8;
}

@media (max-width: 960px) {
  .security-grid {
    grid-template-columns: 1fr;
  }

  .panel--hero,
  .form-row,
  .device-item {
    flex-direction: column;
  }
}
</style>
