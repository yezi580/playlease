<template>
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="auth-header" v-if="viewMode !== 'reset_password'">
        <div class="tab-item" :class="{ active: viewMode === 'login' }" @click="switchView('login')">登录</div>
        <div class="tab-item" :class="{ active: viewMode === 'register' }" @click="switchView('register')">注册</div>
      </div>
      <div class="auth-header single" v-else>
        <div class="tab-item active">重置密码</div>
        <button class="back-btn" @click="switchView('login')">返回登录</button>
      </div>

      <div class="auth-body">
        <div class="input-group">
          <input
            v-model.trim="form.phone"
            type="text"
            inputmode="numeric"
            maxlength="11"
            placeholder="请输入手机号"
            :disabled="submitting"
            @keyup.enter="submitAuth"
          />
        </div>

        <div class="input-group code-group" v-if="showCodeInput">
          <input
            v-model.trim="form.code"
            type="text"
            inputmode="numeric"
            maxlength="8"
            placeholder="请输入验证码"
            :disabled="submitting"
            @keyup.enter="submitAuth"
          />
          <button
            type="button"
            class="code-btn"
            :disabled="submitting || codeSending || captchaLoading || captchaScriptLoading || isCurrentSceneCountingDown"
            @click="sendSmsCode"
          >
            {{ codeButtonText }}
          </button>
        </div>

        <div class="input-group" v-if="showPasswordInput">
          <input
            v-model.trim="form.password"
            type="password"
            :placeholder="passwordPlaceholder"
            :disabled="submitting"
            @blur="handlePasswordBlur"
            @keyup.enter="submitAuth"
          />
        </div>

        <div class="input-group" v-if="showConfirmPasswordInput">
          <input
            v-model.trim="form.confirmPassword"
            type="password"
            :placeholder="confirmPasswordPlaceholder"
            :disabled="submitting"
            @keyup.enter="submitAuth"
          />
        </div>

        <div v-if="viewMode === 'register'" class="input-group">
          <input
            v-model.trim="form.inviteCode"
            type="text"
            maxlength="16"
            placeholder="请输入邀请码（选填，仅可绑定一次）"
            :disabled="submitting"
            @input="form.inviteCode = String(form.inviteCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '')"
            @keyup.enter="submitAuth"
          />
          <p class="input-tip">如有邀请码，请在注册时填写；注册后仍可在邀新赚钱中绑定一次。</p>
        </div>

        <div class="aux-links" v-if="viewMode === 'login'">
          <span class="link" @click="toggleLoginType">
            {{ loginType === 'sms' ? '密码登录' : '验证码登录' }}
          </span>
          <span class="link" v-if="loginType === 'password'" @click="switchView('reset_password')">
            忘记密码？
          </span>
        </div>

        <button class="submit-btn" :disabled="submitting" @click="submitAuth">
          {{ submitText }}
        </button>

        <div class="agreement-wrap" v-if="viewMode !== 'reset_password'">
          <label class="agreement-label">
            <input type="checkbox" v-model="agreement" :disabled="submitting" />
            <span class="checkmark"></span>
            我已阅读并同意
            <button type="button" class="agreement-link" @click.stop="openAgreementDialog('userAgreement')">《用户协议》</button>
            与
            <button type="button" class="agreement-link" @click.stop="openAgreementDialog('privacyPolicy')">《隐私政策》</button>
          </label>
        </div>
      </div>
    </div>

    <div v-if="agreementDialogVisible" class="agreement-modal" @click.self="closeAgreementDialog">
      <div class="agreement-modal__card">
        <div class="agreement-modal__header">
          <div>
            <h3>{{ activeAgreement.title }}</h3>
            <p>{{ activeAgreement.subtitle }}</p>
          </div>
          <button type="button" class="agreement-modal__close" @click="closeAgreementDialog">关闭</button>
        </div>
        <div class="agreement-modal__body">
          <section
            v-for="section in activeAgreement.sections"
            :key="section.heading"
            class="agreement-section"
          >
            <h4>{{ section.heading }}</h4>
            <div class="agreement-paragraphs">
              <p v-for="paragraph in section.paragraphs" :key="paragraph">
                <span class="paragraph-prefix">{{ paragraph.split(' ')[0] }}</span>
                <span class="paragraph-content">{{ paragraph.substring(paragraph.indexOf(' ') + 1) }}</span>
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>

  </div>
</template>

<script>
import { apiFetch } from '../utils/api.js'
import { showWarningToast } from '../utils/toast.js'

const AGREEMENT_CONTENTS = {
  userAgreement: {
    title: '用户服务协议',
    subtitle: '最新修订日期：2026年06月10日',
    sections: [
      {
        heading: '1. 导言与协议接受',
        paragraphs: [
          '1.1 本《用户服务协议》（以下简称“本协议”）是您（以下或称“用户”）与本租号平台（以下简称“本平台”）之间关于注册、登录、使用本平台服务所订立的具有法律效力的契约。',
          '1.2 在您勾选同意或以其他方式确认接受本协议之前，请务必审慎阅读、充分理解各条款内容。您一旦完成注册流程或开始使用本平台提供的任何服务，即视为您已完全理解并同意接受本协议的全部约束。'
        ]
      },
      {
        heading: '2. 账号管理与使用规范',
        paragraphs: [
          '2.1 您承诺以真实、合法、有效的身份信息及手机号码注册本平台账号，并对您账号下发生的所有活动和事件承担全部法律责任。',
          '2.2 您应妥善保管账号密码及验证码，不得将账号出借、赠与、出租、转让或售卖给任何第三方。因您保管不善导致的账号被盗、虚拟财产流失或引发的其他纠纷，本平台不承担赔偿责任。',
          '2.3 为响应国家法律法规及相关政策要求，并保障平台交易与资金的安全性，您在进行发布商品、充值、交易或申请资金提现等特定操作前，必须按本平台指引完成实名认证。'
        ]
      },
      {
        heading: '3. 服务内容与交易规则',
        paragraphs: [
          '3.1 本平台致力于为用户提供数字化账号的租赁、交易撮合及相关系统支持服务。具体的订单金额、服务周期、押金标准及违约赔付方案，以交易界面的最终确认及订单协议为准。',
          '3.2 用户在交易过程中应诚实守信，严格遵守平台规则。如用户存在恶意毁约、使用第三方违规插件（外挂/辅助）、故意毁坏租赁账号资产、恶意投诉或洗钱等行为，本平台有权单方面采取冻结交易资金、封停平台账号等措施，并保留追究其法律责任的权利。'
        ]
      },
      {
        heading: '4. 免责声明与责任限制',
        paragraphs: [
          '4.1 鉴于互联网服务的特殊性，因不可抗力、基础电信运营商故障、第三方支付网关异常、黑客攻击或计算机病毒等非本平台故意或重大过失导致的服务中断或数据丢失，本平台将在法律允许的最大范围内免责。',
          '4.2 本平台将对用户发布的信息进行合理程度的审查，但无法对所有交易标的的绝对安全性、合法性及无瑕疵性作出实质担保。用户需自行对交易风险进行评估。'
        ]
      },
      {
        heading: '5. 违约责任与协议终止',
        paragraphs: [
          '5.1 如您违反适用法律或本协议的任何约定，本平台有权视情节轻重，随时采取包括但不限于警告、限制部分或全部功能、冻结账户资金、永久封停账号等处置措施。',
          '5.2 本平台保留根据业务调整或法律法规变化对本协议进行修改的权利。修改后的协议将通过平台公告等方式进行公示。如您在修改后继续使用本平台服务，即表示您接受修订后的条款。'
        ]
      }
    ]
  },
  privacyPolicy: {
    title: '隐私权保护政策',
    subtitle: '最新修订日期：2026年06月10日',
    sections: [
      {
        heading: '1. 个人信息的收集范围',
        paragraphs: [
          '1.1 业务必要信息：为实现注册、登录、实名认证、支付与提现、风控安全审查及客户服务等核心功能，我们会依法收集您的手机号码、网络身份标识信息、实名认证信息（包括但不限于真实姓名、有效身份证件号码）以及支付流转记录。',
          '1.2 安全保障信息：当您使用验证码登录、注册或进行敏感操作时，我们将记录您的操作日志、设备硬件信息及IP地址，以预防欺诈并保障您的账号安全。'
        ]
      },
      {
        heading: '2. 个人信息的使用规则',
        paragraphs: [
          '2.1 我们收集的信息将严格用于身份核实、订单履约保障、风险控制拦截、争议调解、客服响应以及提升平台系统服务质量。',
          '2.2 除本政策明确约定或法律法规另有规定外，未经您的明确授权同意，我们绝不会将您的个人敏感信息用于与平台核心业务无关的其他商业目的。'
        ]
      },
      {
        heading: '3. 信息的共享、转让与披露',
        paragraphs: [
          '3.1 原则上我们不会与任何外部公司、组织或个人共享您的个人信息。但在以下情形除外：获取您的明确同意；根据法律法规及国家有权机关的强制性要求；以及为实现核心功能（如接入第三方短信网关、支付机构或实名认证数据源）而必须共享的最小必要信息。',
          '3.2 我们在与第三方服务提供商共享信息时，将签署严格的保密协议，并要求其采取符合业界标准的安全保护措施来处理您的个人信息。'
        ]
      },
      {
        heading: '4. 信息的存储与安全防护',
        paragraphs: [
          '4.1 我们将依照中国法律法规的规定，将收集到的个人信息存储于中国境内，并采取包括但不限于数据加密、访问权限控制、日志审计等物理及技术层面的安全措施来防止数据泄露或被篡改。',
          '4.2 尽管我们已经采取了合理的安保措施，但互联网环境并非绝对安全。如发生个人信息安全事件，我们将依法启动应急预案，并以推送通知、邮件或公告等形式及时告知您。'
        ]
      },
      {
        heading: '5. 用户的权利与联系方式',
        paragraphs: [
          '5.1 依照相关法律法规，您对自己的个人信息享有知情权、查阅权、更正权及删除权。在符合平台规则的前提下，您亦有权申请注销您的平台账号。',
          '5.2 如您对本隐私政策或您的个人信息处理情况有任何疑问、意见或建议，请通过平台设立的官方客服通道与我们的个人信息保护专员取得联系。'
        ]
      }
    ]
  }
}

export default {
  name: 'AuthPanel',
  props: {
    mode: {
      type: String,
      default: 'login'
    },
    tip: {
      type: String,
      default: ''
    }
  },
  emits: ['auth-success'],
  data() {
    return {
      viewMode: this.mode === 'register' ? 'register' : 'login',
      loginType: 'password', // 'sms' or 'password'
      submitting: false,
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
      codeCountdownScene: '',
      codeTimer: null,
      agreement: false,
      agreementDialogType: '',
      agreementDialogVisible: false,
      form: {
        phone: '',
        password: '',
        code: '',
        confirmPassword: '',
        inviteCode: ''
      }
    }
  },
  computed: {
    showCodeInput() {
      return this.viewMode === 'register' || this.viewMode === 'reset_password' || (this.viewMode === 'login' && this.loginType === 'sms')
    },
    showPasswordInput() {
      return this.viewMode === 'register' || this.viewMode === 'reset_password' || (this.viewMode === 'login' && this.loginType === 'password')
    },
    showConfirmPasswordInput() {
      return this.viewMode === 'register' || this.viewMode === 'reset_password'
    },
    passwordPlaceholder() {
      if (this.viewMode === 'register') return '请设置登录密码（8 位且至少包含两种字符）'
      if (this.viewMode === 'reset_password') return '请设置新密码（8 位且至少包含两种字符）'
      return '请输入密码'
    },
    confirmPasswordPlaceholder() {
      return this.viewMode === 'reset_password' ? '请再次输入新密码' : '请再次输入密码'
    },
    currentSmsScene() {
      if (this.viewMode === 'register') return 'register'
      return this.viewMode === 'reset_password' ? 'reset_password' : 'login'
    },
    isCurrentSceneCountingDown() {
      return this.codeCountdown > 0 && this.codeCountdownScene === this.currentSmsScene
    },
    codeButtonText() {
      if (this.captchaLoading || this.captchaScriptLoading) return '加载验证中...'
      if (this.codeSending) return '发送中...'
      if (this.isCurrentSceneCountingDown) return `${this.codeCountdown}s 后重发`
      return '获取验证码'
    },
    activeAgreement() {
      return AGREEMENT_CONTENTS[this.agreementDialogType] || AGREEMENT_CONTENTS.userAgreement
    },
    submitText() {
      if (this.submitting) {
        if (this.viewMode === 'register') return '注册中...'
        if (this.viewMode === 'reset_password') return '重置中...'
        return '登录中...'
      }
      if (this.viewMode === 'register') return '注册并登录'
      if (this.viewMode === 'reset_password') return '确认重置'
      return '登录'
    }
  },
  watch: {
    mode(value) {
      this.switchView(value === 'register' ? 'register' : 'login')
    },
    tip(value) {
      const message = String(value || '').trim()
      if (message) {
        showWarningToast(message)
      }
    }
  },
  mounted() {
    const message = String(this.tip || '').trim()
    if (message) {
      showWarningToast(message)
    }
    
    // 恢复验证码倒计时
    const scenes = ['login', 'register', 'reset_password']
    for (const scene of scenes) {
      const expireTimeStr = localStorage.getItem(`sms_countdown_${scene}`)
      if (expireTimeStr) {
        const expireTime = parseInt(expireTimeStr, 10)
        const now = Date.now()
        if (expireTime > now) {
          const remainSeconds = Math.ceil((expireTime - now) / 1000)
          this.startCodeCountdown(remainSeconds, scene)
          break // 只恢复当前正在倒计时的场景
        } else {
          localStorage.removeItem(`sms_countdown_${scene}`)
        }
      }
    }
  },
  beforeUnmount() {
    this.clearCodeTimer()
  },
  methods: {
    isStrongPassword(password) {
      const safePassword = String(password || '')
      if (safePassword.length < 8) return false

      let typeCount = 0
      if (/[A-Za-z]/.test(safePassword)) typeCount += 1
      if (/\d/.test(safePassword)) typeCount += 1
      if (/[^A-Za-z\d]/.test(safePassword)) typeCount += 1
      return typeCount >= 2
    },
    alertMessage(message = '') {
      const text = String(message || '').trim()
      if (!text) return
      showWarningToast(text)
    },
    formatDurationText(seconds) {
      const totalSeconds = Math.max(0, Number(seconds || 0) || 0)
      if (!totalSeconds) return ''
      const hours = Math.floor(totalSeconds / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      const remainSeconds = totalSeconds % 60
      if (hours > 0) {
        return `${hours} 小时${minutes > 0 ? ` ${minutes} 分钟` : ''}`
      }
      if (minutes > 0) {
        return `${minutes} 分钟${remainSeconds > 0 ? ` ${remainSeconds} 秒` : ''}`
      }
      return `${remainSeconds} 秒`
    },
    buildSmsErrorMessage(error, fallbackMessage) {
      const data = error?.data && typeof error.data === 'object' ? error.data : {}
      const baseMessage = String(data.message || error?.message || fallbackMessage || '').trim() || fallbackMessage
      const remainingAttempts = Math.max(0, Number(data.remaining_attempts || 0) || 0)
      const maxAttempts = Math.max(0, Number(data.max_attempts || 0) || 0)
      const retryAfterSeconds = Math.max(0, Number(data.retry_after_seconds || 0) || 0)
      const durationText = this.formatDurationText(retryAfterSeconds)

      if (remainingAttempts > 0 && maxAttempts > 0) {
        return `${baseMessage}，还可尝试 ${remainingAttempts} 次`
      }
      if (retryAfterSeconds > 0 && durationText) {
        return `${baseMessage}，请 ${durationText} 后重试`
      }
      return baseMessage
    },
    clearCodeTimer() {
      if (this.codeTimer) {
        clearInterval(this.codeTimer)
        this.codeTimer = null
      }
    },
    startCodeCountdown(seconds, scene) {
      this.clearCodeTimer()
      this.codeCountdown = Math.max(0, Number(seconds || 0) || 0)
      this.codeCountdownScene = scene
      
      if (this.codeCountdown > 0) {
        const expireTime = Date.now() + this.codeCountdown * 1000
        localStorage.setItem(`sms_countdown_${scene}`, expireTime.toString())
      }

      if (this.codeCountdown <= 0) return
      this.codeTimer = setInterval(() => {
        if (this.codeCountdown <= 1) {
          this.codeCountdown = 0
          this.codeCountdownScene = ''
          localStorage.removeItem(`sms_countdown_${scene}`)
          this.clearCodeTimer()
          return
        }
        this.codeCountdown -= 1
      }, 1000)
    },
    resetForm() {
      this.form.phone = ''
      this.form.password = ''
      this.form.code = ''
      this.form.confirmPassword = ''
      this.form.inviteCode = ''
    },
    openAgreementDialog(type) {
      this.agreementDialogType = type
      this.agreementDialogVisible = true
    },
    closeAgreementDialog() {
      this.agreementDialogVisible = false
    },
    switchView(mode) {
      this.viewMode = mode
      if (mode === 'login') {
        this.loginType = 'password'
      }
      this.resetForm()
    },
    toggleLoginType() {
      this.loginType = this.loginType === 'sms' ? 'password' : 'sms'
      this.form.password = ''
      this.form.code = ''
    },
    validatePhone(phone) {
      if (!phone) {
        this.alertMessage('请输入手机号')
        return false
      }
      if (!/^1[3-9]\d{9}$/.test(phone)) {
        this.alertMessage('手机号格式不正确')
        return false
      }
      return true
    },
    validateStrongPassword(password, { showAlert = true } = {}) {
      if (!this.isStrongPassword(password)) {
        if (showAlert) {
          this.alertMessage('密码需至少 8 位，且包含数字、英文、符号中的至少两种')
        }
        return false
      }
      return true
    },
    handlePasswordBlur() {
      if (!(this.viewMode === 'register' || this.viewMode === 'reset_password')) {
        return
      }
      const password = String(this.form.password || '')
      if (!password) return
      this.validateStrongPassword(password, { showAlert: true })
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
      const phone = String(this.form.phone || '').trim()
      if (!this.validatePhone(phone)) return

      let captchaResult = null
      try {
        this.captchaLoading = true
        captchaResult = await this.openTencentCaptcha()
      } catch (error) {
        this.alertMessage(error.message || '拉起腾讯云验证码失败')
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
            scene: this.currentSmsScene,
            captcha_ticket: captchaResult.ticket,
            captcha_randstr: captchaResult.randstr
          })
        })
        const retryAfterSeconds = Math.max(0, Number(data.retry_after_seconds || 60) || 60)
        this.startCodeCountdown(retryAfterSeconds, this.currentSmsScene)
        const durationText = this.formatDurationText(retryAfterSeconds)
        const successMessage = this.viewMode === 'register'
          ? '注册验证码已发送，请注意查收'
          : '验证码已发送，请注意查收'
        this.alertMessage(durationText ? `${successMessage}，${durationText} 后可重新获取` : successMessage)
      } catch (error) {
        this.alertMessage(this.buildSmsErrorMessage(error, '发送验证码失败'))
      } finally {
        this.codeSending = false
      }
    },
    async submitAuth() {
      const phone = String(this.form.phone || '').trim()
      const password = String(this.form.password || '')
      const code = String(this.form.code || '').trim()
      const confirmPassword = String(this.form.confirmPassword || '')
      const inviteCode = String(this.form.inviteCode || '').trim().toUpperCase()

      if (this.viewMode !== 'reset_password' && !this.agreement) {
        this.alertMessage('请先阅读并同意用户协议与隐私政策')
        return
      }

      if (!this.validatePhone(phone)) return

      if (this.showPasswordInput) {
        if (!password) {
          this.alertMessage(this.viewMode === 'reset_password' ? '请输入新密码' : '请输入密码')
          return
        }
        if ((this.viewMode === 'register' || this.viewMode === 'reset_password') && !this.validateStrongPassword(password)) {
          return
        }
      }

      if (this.showConfirmPasswordInput) {
        if (!confirmPassword) {
          this.alertMessage(this.viewMode === 'reset_password' ? '请再次输入新密码' : '请再次输入密码')
          return
        }
        if (password !== confirmPassword) {
          this.alertMessage(this.viewMode === 'reset_password' ? '两次输入的新密码不一致' : '两次输入的密码不一致')
          return
        }
      }

      if (this.showCodeInput) {
        if (!/^\d{4,8}$/.test(code)) {
          this.alertMessage('请输入正确的验证码')
          return
        }
      }

      this.submitting = true

      try {
        let data = null

        if (this.viewMode === 'register') {
          await apiFetch('/api/register', {
            method: 'POST',
            body: JSON.stringify({ phone, code, password, invite_code: inviteCode || undefined })
          })
          data = await apiFetch('/api/login', {
            method: 'POST',
            body: JSON.stringify({ phone, password })
          })
        } else if (this.viewMode === 'reset_password') {
          await apiFetch('/api/auth/password/reset-by-sms', {
            method: 'POST',
            body: JSON.stringify({ phone, code, new_password: password })
          })
          data = await apiFetch('/api/login', {
            method: 'POST',
            body: JSON.stringify({ phone, password })
          })
        } else {
          if (this.loginType === 'password') {
            data = await apiFetch('/api/login', {
              method: 'POST',
              body: JSON.stringify({ phone, password })
            })
          } else {
            data = await apiFetch('/api/auth/sms/login', {
              method: 'POST',
              body: JSON.stringify({ phone, code })
            })
          }
        }

        this.$emit('auth-success', {
          username: data.user?.username || data.user?.phone || phone,
          token: data.token,
          user: data.user
        })
      } catch (error) {
        this.alertMessage(
          this.buildSmsErrorMessage(
            error,
            this.viewMode === 'register' ? '注册失败，请稍后重试' : '操作失败，请稍后重试'
          )
        )
      } finally {
        this.submitting = false
      }
    }
  }
}
</script>

<style scoped>
.auth-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  background: #f8fafc;
}

.auth-card {
  width: min(400px, 100%);
  background: #ffffff;
  border-radius: 20px;
  box-shadow: 0 20px 40px -8px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  transform: translateY(-40px);
}

.auth-header {
  display: flex;
  align-items: center;
  padding: 0 32px;
  margin-top: 32px;
  gap: 24px;
  border-bottom: 1px solid transparent;
}

.auth-header.single {
  justify-content: space-between;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 16px;
  margin-top: 24px;
}

.tab-item {
  font-size: 18px;
  font-weight: 500;
  color: #64748b;
  cursor: pointer;
  position: relative;
  padding-bottom: 8px;
  transition: all 0.3s;
}

.tab-item.active {
  font-size: 22px;
  font-weight: 600;
  color: #0f172a;
}

.tab-item.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 24px;
  height: 4px;
  background: #3b82f6;
  border-radius: 2px;
}

.back-btn {
  background: none;
  border: none;
  color: #64748b;
  font-size: 14px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}
.back-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.auth-body {
  padding: 24px 32px 36px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.input-group {
  position: relative;
}

.input-group input {
  width: 100%;
  height: 48px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0 16px;
  font-size: 15px;
  color: #0f172a;
  transition: all 0.2s ease;
  outline: none;
  box-sizing: border-box;
}

.input-group input:focus {
  background: #ffffff;
  border-color: #3b82f6;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
}

.input-group input::placeholder {
  color: #94a3b8;
}

.input-group input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background: #f1f5f9;
}

.input-tip {
  margin: 8px 2px 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}

.code-group {
  display: flex;
  gap: 12px;
}

.code-group input {
  flex: 1;
}

.code-btn {
  width: 120px;
  height: 48px;
  border: none;
  background: #eff6ff;
  color: #3b82f6;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.code-btn:hover:not(:disabled) {
  background: #dbeafe;
}

.code-btn:disabled {
  color: #94a3b8;
  background: #f1f5f9;
  cursor: not-allowed;
}

.aux-links {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: -4px;
}

.aux-links .link {
  font-size: 14px;
  color: #64748b;
  cursor: pointer;
  transition: color 0.2s;
}

.aux-links .link:hover {
  color: #3b82f6;
}

.submit-btn {
  width: 100%;
  height: 48px;
  border: none;
  border-radius: 12px;
  background: #3b82f6;
  color: #ffffff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 4px;
}

.submit-btn:hover:not(:disabled) {
  background: #2563eb;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
}

.submit-btn:active:not(:disabled) {
  transform: translateY(0);
}

.submit-btn:disabled {
  background: #94a3b8;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.agreement-wrap {
  margin-top: 8px;
  text-align: center;
}

.agreement-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  font-size: 12px;
  color: #64748b;
  cursor: pointer;
  user-select: none;
  line-height: 1.8;
}

.agreement-label input {
  position: absolute;
  opacity: 0;
  cursor: pointer;
  height: 0;
  width: 0;
}

.checkmark {
  width: 16px;
  height: 16px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  margin-right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  background: #ffffff;
}

.agreement-label:hover input ~ .checkmark {
  border-color: #3b82f6;
}

.agreement-label input:checked ~ .checkmark {
  background-color: #3b82f6;
  border-color: #3b82f6;
}

.agreement-label input:checked ~ .checkmark::after {
  content: '';
  width: 4px;
  height: 8px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
  margin-bottom: 2px;
}

.agreement-link {
  border: none;
  background: transparent;
  color: #3b82f6;
  padding: 0;
  font-size: 12px;
  cursor: pointer;
}

.agreement-link:hover {
  text-decoration: underline;
}

.agreement-modal {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(15, 23, 42, 0.52);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.agreement-modal__card {
  width: min(720px, 100%);
  max-height: min(80vh, 720px);
  background: #ffffff;
  border-radius: 20px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.24);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.agreement-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 24px 24px 16px;
  border-bottom: 1px solid #e2e8f0;
}

.agreement-modal__header h3 {
  margin: 0;
  font-size: 20px;
  color: #0f172a;
}

.agreement-modal__header p {
  margin: 6px 0 0;
  font-size: 13px;
  color: #64748b;
}

.agreement-modal__close {
  border: none;
  background: #f1f5f9;
  color: #334155;
  border-radius: 10px;
  padding: 10px 14px;
  cursor: pointer;
  font-size: 13px;
}

.agreement-modal__body {
  padding: 20px 24px 28px;
  overflow-y: auto;
}

.agreement-section + .agreement-section {
  margin-top: 20px;
}

.agreement-section h4 {
  margin: 0 0 10px;
  font-size: 15px;
  color: #0f172a;
}

.agreement-paragraphs p {
  margin: 0;
  font-size: 14px;
  line-height: 1.8;
  color: #475569;
  text-align: justify;
  display: flex;
  align-items: flex-start;
}

.agreement-paragraphs p + p {
  margin-top: 10px;
}

.paragraph-prefix {
  flex-shrink: 0;
  width: 2.2em; /* 固定宽度，大约等于 "1.1 " 两个数字加一个点的宽度 */
  font-weight: 500;
}

.paragraph-content {
  flex: 1;
}

@media (max-width: 640px) {
  .auth-wrap {
    padding: 16px;
    align-items: flex-start;
  }
  .auth-card {
    border-radius: 16px;
    transform: none;
    margin-top: 20px;
  }
  .auth-header {
    padding: 0 24px;
    margin-top: 24px;
  }
  .auth-body {
    padding: 20px 24px 28px;
  }

  .agreement-modal {
    padding: 12px;
    align-items: flex-end;
  }

  .agreement-modal__card {
    max-height: 88vh;
    border-radius: 18px 18px 0 0;
  }

  .agreement-modal__header,
  .agreement-modal__body {
    padding-left: 18px;
    padding-right: 18px;
  }
}
</style>
