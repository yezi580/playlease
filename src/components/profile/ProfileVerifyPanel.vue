<template>
  <div v-if="!isLoggedIn" class="profile-placeholder-card">
    <h4>实名认证</h4>
    <p>完成实名认证后，可用于发布商品、申请提现，并提升交易信任度。</p>
    <button type="button" class="profile-login-btn" @click="$emit('login')">立即登录</button>
  </div>
  <div v-else class="profile-panel-card">
    <div class="verify-status-card" :class="`verify-status-card--${kycStatus}`">
      <div class="verify-status-main">
        <span class="verify-status-label">当前认证状态</span>
        <strong>{{ getKycStatusText(kycStatus) }}</strong>
        <p>{{ getKycStatusDescription(kycStatus) }}</p>
      </div>
      <span class="verify-status-badge order-status" :class="`status-${kycStatus}`">{{ getKycStatusText(kycStatus) }}</span>
    </div>

    <div v-if="loading" class="profile-empty">正在加载实名认证信息...</div>
    <div v-else-if="error" class="profile-empty profile-error">{{ error }}</div>
    <div v-else class="verify-panel">
      <div class="verify-info-grid">
        <div class="verify-info-item">
          <span>认证姓名</span>
          <strong>{{ realNameMasked || '未认证' }}</strong>
        </div>
        <div class="verify-info-item">
          <span>证件号码</span>
          <strong>{{ idCardMasked || '未认证' }}</strong>
        </div>
        <div class="verify-info-item">
          <span>最近提交</span>
          <strong>{{ formatOrderDate(submittedAt) }}</strong>
        </div>
        <div class="verify-info-item">
          <span>认证完成</span>
          <strong>{{ formatOrderDate(verifiedAt) }}</strong>
        </div>
      </div>

      <div v-if="failureReason" class="verify-tips-card verify-tips-card--error">
        <h4>审核反馈</h4>
        <p>{{ failureReason }}</p>
      </div>

      <form v-if="canSubmit" class="verify-form-card" @submit.prevent="$emit('submit')">
        <div class="wallet-action-header">
          <div>
            <h4>提交实名认证</h4>
            <p>请填写本人真实姓名与有效身份证件号码，提交后系统会根据当前配置完成审核。</p>
          </div>
        </div>

        <div class="wallet-form-grid verify-form-grid">
          <label class="wallet-form-field">
            <span>真实姓名</span>
            <input
              :value="kycForm.realName"
              type="text"
              maxlength="30"
              placeholder="请输入真实姓名"
              :disabled="submitting"
              @input="updateKycForm('realName', $event.target.value)"
            >
          </label>
          <label class="wallet-form-field">
            <span>身份证号</span>
            <input
              :value="kycForm.idCardNo"
              type="text"
              maxlength="18"
              placeholder="请输入身份证号码"
              :disabled="submitting"
              @input="updateKycForm('idCardNo', $event.target.value)"
            >
          </label>
        </div>

        <div class="wallet-form-actions">
          <button type="submit" class="order-action-btn primary wallet-submit-btn" :disabled="submitting">
            {{ submitting ? '提交中...' : '提交实名认证' }}
          </button>
        </div>
      </form>

      <div v-else class="verify-tips-card">
        <h4>{{ kycStatus === 'pending' ? '认证审核中' : '实名认证已完成' }}</h4>
        <p>
          {{
            kycStatus === 'pending'
              ? '你已提交实名认证申请，请继续完成腾讯云刷脸核身；回跳后页面会自动同步最新状态。'
              : '当前账号已完成实名认证，可继续发布商品和申请钱包提现。'
          }}
        </p>
        <div v-if="kycStatus === 'pending'" class="verify-action-row">
          <button
            v-if="verifyUrl"
            type="button"
            class="order-action-btn primary"
            :disabled="syncing"
            @click="$emit('continue')"
          >
            继续刷脸核身
          </button>
          <button
            type="button"
            class="order-action-btn secondary"
            :disabled="syncing"
            @click="$emit('sync-result')"
          >
            {{ syncing ? '同步中...' : '刷新认证结果' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { getKycStatusDescription, getKycStatusText } from '../../utils/profileCenter.js'

export default {
  name: 'ProfileVerifyPanel',
  emits: ['login', 'update:kyc-form', 'submit', 'continue', 'sync-result'],
  props: {
    isLoggedIn: {
      type: Boolean,
      default: false
    },
    loading: {
      type: Boolean,
      default: false
    },
    error: {
      type: String,
      default: ''
    },
    kycStatus: {
      type: String,
      default: 'unverified'
    },
    realNameMasked: {
      type: String,
      default: ''
    },
    idCardMasked: {
      type: String,
      default: ''
    },
    submittedAt: {
      type: [String, Number, Date, null],
      default: null
    },
    verifiedAt: {
      type: [String, Number, Date, null],
      default: null
    },
    failureReason: {
      type: String,
      default: ''
    },
    canSubmit: {
      type: Boolean,
      default: false
    },
    submitting: {
      type: Boolean,
      default: false
    },
    syncing: {
      type: Boolean,
      default: false
    },
    verifyUrl: {
      type: String,
      default: ''
    },
    kycForm: {
      type: Object,
      default: () => ({ realName: '', idCardNo: '' })
    },
    formatOrderDate: {
      type: Function,
      default: (value) => value || '--'
    }
  },
  methods: {
    getKycStatusText,
    getKycStatusDescription,
    updateKycForm(field, value) {
      this.$emit('update:kyc-form', {
        ...this.kycForm,
        [field]: String(value || '').trim()
      })
    }
  }
}
</script>

<style scoped src="./profile-panel-shared.css"></style>
<style scoped>
.verify-status-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px;
  margin-bottom: 18px;
  border: 1px solid #dbeafe;
  border-radius: 16px;
  background: linear-gradient(135deg, #eff6ff 0%, #f8fbff 100%);
}

.verify-status-main {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.verify-status-label {
  display: block;
  color: #6b7280;
  font-size: 13px;
}

.verify-status-main strong {
  color: #111827;
  font-size: 28px;
}

.verify-status-main p {
  margin: 0;
  color: #475569;
  font-size: 14px;
  line-height: 1.7;
}

.verify-status-badge {
  flex-shrink: 0;
}

.verify-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.verify-info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.verify-info-item {
  padding: 16px;
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  background: #fff;
}

.verify-info-item span {
  display: block;
  color: #6b7280;
  font-size: 12px;
}

.verify-info-item strong {
  display: block;
  margin-top: 8px;
  color: #111827;
  font-size: 18px;
}

.verify-tips-card,
.verify-form-card {
  padding: 18px;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  background: #fff;
}

.verify-tips-card h4,
.wallet-action-header h4 {
  margin: 0;
  color: #111827;
  font-size: 18px;
}

.verify-tips-card p,
.wallet-action-header p {
  margin: 8px 0 0;
  color: #6b7280;
  line-height: 1.7;
}

.verify-action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 16px;
}

.verify-tips-card--error {
  border-color: #fecaca;
  background: #fff7f7;
}

.wallet-action-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.wallet-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 16px;
}

.wallet-form-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wallet-form-field span {
  color: #374151;
  font-size: 13px;
  font-weight: 600;
}

.wallet-form-field input {
  min-height: 44px;
  border: 1px solid #d1d5db;
  border-radius: 12px;
  padding: 0 14px;
  background: #fff;
  color: #111827;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.wallet-form-field input:focus {
  border-color: #60a5fa;
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.18);
}

.wallet-form-field input:disabled {
  background: #f8fafc;
  color: #9ca3af;
  cursor: not-allowed;
}

.wallet-form-actions {
  margin-top: 2px;
}

@media (max-width: 960px) {
  .verify-status-card,
  .wallet-action-header {
    flex-direction: column;
  }

  .verify-info-grid,
  .wallet-form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
