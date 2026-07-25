<template>
  <section
    class="settings-page"
    @keydown.capture="handleNumberInputKeydown"
    @wheel.capture="handleNumberInputWheel"
  >
    <div class="settings-toolbar">
      <div class="settings-toolbar-tabs">
        <button
          type="button"
          class="filter-chip"
          :class="{ 'filter-chip--active': activeDisplaySection === 'rules' }"
          @click="activeDisplaySection = 'rules'"
        >
          业务规则配置
        </button>
        <button
          type="button"
          class="filter-chip"
          :class="{ 'filter-chip--active': activeDisplaySection === 'insurance' }"
          @click="activeDisplaySection = 'insurance'"
        >
          保险赔付参数
        </button>
        <button
          type="button"
          class="filter-chip"
          :class="{ 'filter-chip--active': activeDisplaySection === 'items' }"
          @click="activeDisplaySection = 'items'"
        >
          出售额外物品定价
        </button>
      </div>
      <div class="settings-toolbar-actions">
        <button type="button" class="toolbar-btn toolbar-btn--ghost" :disabled="loading || saving" @click="loadSettings">刷新</button>
        <button type="button" class="toolbar-btn" :disabled="loading || saving" @click="saveSettings">{{ saving ? '保存中...' : '保存配置' }}</button>
      </div>
    </div>

    <div v-if="error" class="state-card state-card--error">{{ error }}</div>
    <div v-else-if="loading" class="state-card">正在加载参数配置...</div>
    <div v-else-if="form" class="settings-grid">
      <Transition name="overview-view" mode="out-in">
        <div v-if="activeDisplaySection === 'rules'" key="rules" class="overview-stack">
          <article class="panel">
            <div class="panel-head">
              <strong>比例推荐逻辑</strong>
              <span>维护九格/六格比例与特殊刀皮名单</span>
            </div>
            <div class="field-grid field-grid--triple">
              <label class="field">
                <span>九格-特殊刀皮比例</span>
                <input v-model.number="form.ratioRecommendation.grid9.specialKnife" type="number" min="1" max="1000">
              </label>
              <label class="field">
                <span>九格-其他刀皮比例</span>
                <input v-model.number="form.ratioRecommendation.grid9.otherKnife" type="number" min="1" max="1000">
              </label>
              <label class="field">
                <span>九格-无皮比例</span>
                <input v-model.number="form.ratioRecommendation.grid9.noKnife" type="number" min="1" max="1000">
              </label>
              <label class="field">
                <span>六格-特殊刀皮比例</span>
                <input v-model.number="form.ratioRecommendation.grid6.specialKnife" type="number" min="1" max="1000">
              </label>
              <label class="field">
                <span>六格-其他刀皮比例</span>
                <input v-model.number="form.ratioRecommendation.grid6.otherKnife" type="number" min="1" max="1000">
              </label>
              <label class="field">
                <span>六格-无皮比例</span>
                <input v-model.number="form.ratioRecommendation.grid6.noKnife" type="number" min="1" max="1000">
              </label>
            </div>
            <label class="field">
              <span>特殊刀皮名单</span>
              <textarea
                :value="formatStringList(form.ratioRecommendation.specialKnives)"
                rows="3"
                placeholder="多个刀皮用逗号分隔"
                @input="updateSpecialKnives($event.target.value)"
              ></textarea>
            </label>
          </article>

          <article class="panel">
            <div class="panel-head">
              <strong>刀皮、干员外观与枪皮选项</strong>
              <span>控制发布页可选的刀皮、干员外观和枪皮名单，支持后台直接增删</span>
            </div>
            <div class="skin-config-grid">
              <section class="skin-config-card">
                <div class="skin-config-head">
                  <strong>刀皮列表</strong>
                  <button type="button" class="toolbar-btn toolbar-btn--ghost toolbar-btn--small" @click="addSkinOption('knifeSkins')">
                    新增刀皮
                  </button>
                </div>
                <div class="skin-option-list">
                  <div
                    v-for="(item, index) in form.listingAppearanceOptions.knifeSkins"
                    :key="`knife-${index}`"
                    class="skin-option-row"
                  >
                    <input
                      :value="item"
                      type="text"
                      maxlength="40"
                      placeholder="请输入刀皮名称"
                      @input="updateSkinOption('knifeSkins', index, $event.target.value)"
                    >
                    <button
                      type="button"
                      class="toolbar-btn toolbar-btn--danger toolbar-btn--small"
                      :disabled="form.listingAppearanceOptions.knifeSkins.length <= 1"
                      @click="removeSkinOption('knifeSkins', index)"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </section>

              <section class="skin-config-card">
                <div class="skin-config-head">
                  <strong>干员外观列表</strong>
                  <button type="button" class="toolbar-btn toolbar-btn--ghost toolbar-btn--small" @click="addSkinOption('operatorAppearances')">
                    新增干员外观
                  </button>
                </div>
                <div class="skin-option-list">
                  <div
                    v-for="(item, index) in form.listingAppearanceOptions.operatorAppearances"
                    :key="`operator-${index}`"
                    class="skin-option-row"
                  >
                    <input
                      :value="item"
                      type="text"
                      maxlength="40"
                      placeholder="请输入干员外观名称"
                      @input="updateSkinOption('operatorAppearances', index, $event.target.value)"
                    >
                    <button
                      type="button"
                      class="toolbar-btn toolbar-btn--danger toolbar-btn--small"
                      :disabled="form.listingAppearanceOptions.operatorAppearances.length <= 1"
                      @click="removeSkinOption('operatorAppearances', index)"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </section>

              <section class="skin-config-card">
                <div class="skin-config-head">
                  <strong>枪皮列表</strong>
                  <button type="button" class="toolbar-btn toolbar-btn--ghost toolbar-btn--small" @click="addSkinOption('weaponSkins')">
                    新增枪皮
                  </button>
                </div>
                <div class="skin-option-list">
                  <div
                    v-for="(item, index) in form.listingAppearanceOptions.weaponSkins"
                    :key="`weapon-${index}`"
                    class="skin-option-row"
                  >
                    <input
                      :value="item"
                      type="text"
                      maxlength="40"
                      placeholder="请输入枪皮名称"
                      @input="updateSkinOption('weaponSkins', index, $event.target.value)"
                    >
                    <button
                      type="button"
                      class="toolbar-btn toolbar-btn--danger toolbar-btn--small"
                      :disabled="form.listingAppearanceOptions.weaponSkins.length <= 1"
                      @click="removeSkinOption('weaponSkins', index)"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </article>

          <article class="panel">
            <div class="panel-head">
              <strong>押金配置</strong>
              <span>管理押金上下限和推荐比例</span>
            </div>
            <div class="field-grid field-grid--double">
              <label class="field">
                <span>押金最低值（元）</span>
                <input v-model.number="form.listingRecommendations.depositMinYuan" type="number" min="0">
              </label>
              <label class="field">
                <span>押金最高值（元）</span>
                <input v-model.number="form.listingRecommendations.depositMaxYuan" type="number" min="0">
              </label>
              <label class="field">
                <span>推荐押金比例（%）</span>
                <input v-model.number="form.listingRecommendations.recommendDepositRatioPercent" type="number" min="0" step="0.01">
              </label>
              <label class="field">
                <span>额外物品覆盖比例（%）</span>
                <input v-model.number="form.listingRecommendations.itemsDepositCoveragePercent" type="number" min="0" step="0.01">
              </label>
            </div>
          </article>

          <article class="panel">
            <div class="panel-head">
              <strong>平台抽成规则</strong>
              <span>维护买家侧和卖家侧服务费率</span>
            </div>
            <div class="field-grid field-grid--double">
              <label class="field">
                <span>买家侧服务费率（%）</span>
                <input v-model.number="form.platformCommission.buyerServiceFeeRatePercent" type="number" min="0" max="100" step="0.01">
              </label>
              <label class="field">
                <span>卖家侧服务费率（%）</span>
                <input v-model.number="form.platformCommission.sellerServiceFeeRatePercent" type="number" min="0" max="100" step="0.01">
              </label>
            </div>
          </article>

          <article class="panel">
            <div class="panel-head">
              <strong>邀新返现规则</strong>
              <span>控制邀请人可分得的买家服务费比例</span>
            </div>
            <div class="field-grid field-grid--double">
              <label class="field">
                <span>买家服务费返现比例（%）</span>
                <input v-model.number="form.inviteReward.buyerServiceFeeRewardRatePercent" type="number" min="0" max="100" step="0.01">
              </label>
            </div>
          </article>

          <article class="panel">
            <div class="panel-head">
              <strong>运营阈值建议</strong>
              <span>这里是我帮你补充的高频参数，适合后续继续接业务逻辑</span>
            </div>
            <div class="field-grid field-grid--triple">
              <label class="field">
                <span>小额专区阈值（M）</span>
                <input v-model.number="form.discoveryThresholds.smallAmountHafuCoinMax" type="number" min="0">
              </label>
              <label class="field">
                <span>高比例阈值</span>
                <input v-model.number="form.discoveryThresholds.highRatioBaseRatioMin" type="number" min="0">
              </label>
              <label class="field">
                <span>首页新品角标时长（小时）</span>
                <input v-model.number="form.discoveryThresholds.homepageNewTagHours" type="number" min="1">
              </label>
              <label class="field">
                <span>待付款超时（分钟）</span>
                <input v-model.number="form.discoveryThresholds.pendingPaymentTimeoutMinutes" type="number" min="1">
              </label>
              <label class="field">
                <span>商品图片上限</span>
                <input v-model.number="form.operationalThresholds.listingImageLimit" type="number" min="1">
              </label>
            </div>
          </article>

          <article class="panel">
            <div class="panel-head">
              <strong>安全与限流阈值</strong>
              <span>统一管理反馈次数、热门阈值、短信发送和验证码安全参数</span>
            </div>
            <div class="field-grid field-grid--triple">
              <label class="field">
                <span>每日问题反馈数</span>
                <input v-model.number="form.securityThresholds.feedbackDailyLimitPerUser" type="number" min="1">
              </label>
              <label class="field">
                <span>热门池阈值</span>
                <input v-model.number="form.securityThresholds.listingHotMinUniqueClickCount" type="number" min="1">
              </label>
              <label class="field">
                <span>短信日限额（每手机号）</span>
                <input v-model.number="form.securityThresholds.smsDailyLimitPerPhone" type="number" min="1">
              </label>
              <label class="field">
                <span>短信日限额（每 IP）</span>
                <input v-model.number="form.securityThresholds.smsDailyLimitPerIp" type="number" min="1">
              </label>
              <label class="field">
                <span>验证码 TTL（秒）</span>
                <input v-model.number="form.securityThresholds.smsCodeTtlSeconds" type="number" min="60">
              </label>
              <label class="field">
                <span>发送间隔（秒）</span>
                <input v-model.number="form.securityThresholds.smsSendIntervalSeconds" type="number" min="30">
              </label>
              <label class="field">
                <span>最大尝试次数</span>
                <input v-model.number="form.securityThresholds.smsVerifyMaxAttempts" type="number" min="3">
              </label>
              <label class="field">
                <span>锁定时长（秒）</span>
                <input v-model.number="form.securityThresholds.smsVerifyLockSeconds" type="number" min="300">
              </label>
            </div>
          </article>
        </div>

        <div v-else-if="activeDisplaySection === 'insurance'" key="insurance" class="overview-stack">
          <article class="panel">
            <div class="panel-head">
              <strong>保险赔付参数</strong>
              <span>配置收费比例、赔付比例和前台展示文案</span>
            </div>
            <div class="array-grid">
              <div v-for="plan in form.compensationPlans" :key="plan.value" class="array-card">
                <div class="array-card-head">
                  <strong>{{ plan.value }}</strong>
                </div>
                <div class="field-grid field-grid--double">
                  <label class="field">
                    <span>方案名称</span>
                    <input v-model.trim="plan.title" type="text" maxlength="20">
                  </label>
                  <label class="field">
                    <span>短标签</span>
                    <input v-model.trim="plan.shortLabel" type="text" maxlength="60">
                  </label>
                  <label class="field">
                    <span>收费比例（%）</span>
                    <input v-model.number="plan.feeRatePercent" type="number" min="0" max="100" step="0.01">
                  </label>
                  <label class="field">
                    <span>赔付比例（%）</span>
                    <input v-model.number="plan.payoutRatePercent" type="number" min="0" max="1000" step="0.01">
                  </label>
                </div>
                <label class="field">
                  <span>说明文案</span>
                  <textarea v-model.trim="plan.description" rows="3" maxlength="500"></textarea>
                </label>
              </div>
            </div>
          </article>

        </div>

        <div v-else-if="activeDisplaySection === 'items'" key="items" class="overview-stack">
          <article class="panel">
            <div class="panel-head">
              <strong>出售额外物品定价</strong>
              <span>管理可售物品名称、价格和启用状态</span>
            </div>
            <div class="array-grid">
              <div v-for="item in form.saleItems" :key="item.key" class="compact-item-card">
                <label class="checkbox-field" style="width: 120px;">
                  <input v-model="item.enabled" type="checkbox">
                  <span>启用该物品</span>
                </label>
                <label class="field">
                  <span>物品名称</span>
                  <input v-model.trim="item.itemName" type="text" maxlength="40" style="min-height: 36px; padding: 6px 10px;">
                </label>
                <label class="field">
                  <span>售价（元）</span>
                  <input
                    :value="formatYuan(item.unitPriceInCent)"
                    type="number"
                    min="0"
                    step="0.01"
                    @input="updateSaleItemPrice(item, $event.target.value)"
                    style="min-height: 36px; padding: 6px 10px;"
                  >
                </label>
              </div>
            </div>
          </article>

        </div>
      </Transition>

      <p v-if="message" class="inline-message" :class="{ 'inline-message--error': messageType === 'error' }">
        {{ message }}
      </p>
    </div>
  </section>
</template>

<script>
import {
  apiFetch,
  getStepUpRequirementMessage,
  getStepUpRequirementReason,
  isStepUpRequiredError,
  performAdminStepUp
} from '../utils/api.js'

function cloneSettings(value) {
  return JSON.parse(JSON.stringify(value || {}))
}

function parseStringList(value) {
  return String(value || '')
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function yuanToCent(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) return 0
  return Math.round(amount * 100)
}

export default {
  name: 'AdminBusinessSettingsCenter',
  data() {
    return {
      activeDisplaySection: 'rules',
      loading: false,
      saving: false,
      error: '',
      message: '',
      messageType: 'success',
      form: null
    }
  },
  async mounted() {
    await this.loadSettings()
  },
  methods: {
    async loadSettings() {
      this.loading = true
      this.error = ''
      this.message = ''
      try {
        const data = await apiFetch('/api/admin/business-settings')
        this.form = cloneSettings(data.settings)
      } catch (error) {
        this.error = error.message || '加载参数配置失败'
      } finally {
        this.loading = false
      }
    },
    async saveSettings() {
      if (!this.form) return
      this.saving = true
      this.message = ''
      const requester = () => apiFetch('/api/admin/business-settings', {
        method: 'PUT',
        body: JSON.stringify({
          settings: this.form
        })
      })
      try {
        let data = null
        try {
          data = await requester()
        } catch (error) {
          if (!isStepUpRequiredError(error)) throw error
          if (getStepUpRequirementReason(error) === 'trusted_device_required') {
            throw new Error(getStepUpRequirementMessage(error))
          }
          await performAdminStepUp('update_business_settings')
          data = await requester()
        }
        this.form = cloneSettings(data.settings)
        this.messageType = 'success'
        this.message = data.message || '参数配置已保存'
      } catch (error) {
        this.messageType = 'error'
        this.message = error.message || '保存参数配置失败'
      } finally {
        this.saving = false
      }
    },
    updateSpecialKnives(value) {
      this.form.ratioRecommendation.specialKnives = parseStringList(value)
    },
    addSkinOption(type) {
      if (!this.form?.listingAppearanceOptions?.[type]) return
      this.form.listingAppearanceOptions[type].push('')
    },
    updateSkinOption(type, index, value) {
      if (!this.form?.listingAppearanceOptions?.[type]?.[index] && this.form?.listingAppearanceOptions?.[type]?.[index] !== '') return
      this.form.listingAppearanceOptions[type].splice(index, 1, String(value || '').trimStart())
    },
    removeSkinOption(type, index) {
      if (!this.form?.listingAppearanceOptions?.[type]) return
      if (this.form.listingAppearanceOptions[type].length <= 1) return
      this.form.listingAppearanceOptions[type].splice(index, 1)
    },
    updateSaleItemPrice(item, value) {
      item.unitPriceInCent = yuanToCent(value)
    },
    handleNumberInputKeydown(event) {
      const input = event.target
      if (!(input instanceof HTMLInputElement) || input.type !== 'number') return
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault()
      }
    },
    handleNumberInputWheel(event) {
      const input = event.target
      if (!(input instanceof HTMLInputElement) || input.type !== 'number') return
      event.preventDefault()
    },
    formatStringList(value) {
      return Array.isArray(value) ? value.join(', ') : ''
    },
    formatYuan(value) {
      const amount = Number(value || 0)
      return String(amount / 100)
    }
  }
}
</script>

<style scoped>
.settings-toolbar-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-chip {
  min-height: 36px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #64748b;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-chip:hover {
  background: #f1f5f9;
  color: #334155;
}

.filter-chip--active {
  border-color: #3b82f6;
  background: #eff6ff;
  color: #2563eb;
  font-weight: 600;
}

.overview-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.overview-view-enter-active,
.overview-view-leave-active {
  transition: opacity 0.28s ease, transform 0.28s ease, filter 0.28s ease;
}

.overview-view-enter-from {
  opacity: 0;
  transform: translateY(18px) scale(0.992);
  filter: blur(4px);
}

.overview-view-leave-to {
  opacity: 0;
  transform: translateY(-18px) scale(0.992);
  filter: blur(4px);
}

.compact-item-card {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
}

.compact-item-card > .field {
  flex: 1;
}

.compact-item-card > .checkbox-field {
  min-height: 42px;
  margin-bottom: 2px;
}

.settings-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.settings-toolbar,
.panel,
.state-card {
  border-radius: 18px;
  border: 1px solid #e5e7eb;
  background: #fff;
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.08);
}

.settings-toolbar,
.panel,
.state-card {
  padding: 20px;
}

.settings-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.settings-toolbar h2 {
  margin: 0 0 6px;
  font-size: 22px;
  color: #111827;
}

.settings-toolbar p {
  margin: 0;
  color: #6b7280;
  line-height: 1.6;
}

.settings-toolbar-actions {
  display: flex;
  gap: 10px;
}

.toolbar-btn {
  min-height: 40px;
  padding: 0 16px;
  border-radius: 10px;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
  font-weight: 600;
}

.toolbar-btn--small {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 9px;
  font-size: 13px;
}

.toolbar-btn--ghost {
  border-color: #d1d5db;
  background: #fff;
  color: #374151;
}

.toolbar-btn--danger {
  border-color: #fecaca;
  background: #fff1f2;
  color: #dc2626;
}

.settings-grid {
  display: grid;
  gap: 16px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}

.panel-head strong {
  font-size: 16px;
  color: #111827;
}

.panel-head span {
  color: #6b7280;
  font-size: 13px;
  text-align: right;
}

.field-grid {
  display: grid;
  gap: 12px;
}

.field-grid--double {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.field-grid--triple {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #374151;
  font-size: 13px;
}

.field input,
.field textarea {
  width: 100%;
  min-height: 42px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #111827;
  font: inherit;
  box-sizing: border-box;
}

.field input[type="number"]::-webkit-outer-spin-button,
.field input[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.field input[type="number"] {
  -moz-appearance: textfield;
  appearance: textfield;
}

.field textarea {
  min-height: 84px;
  resize: vertical;
}

.array-grid {
  display: grid;
  gap: 12px;
}

.array-card {
  padding: 14px;
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  display: grid;
  gap: 12px;
}

.skin-config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 14px;
  align-items: stretch;
}

.skin-config-card {
  padding: 14px;
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skin-config-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.skin-option-list {
  display: grid;
  gap: 10px;
}

.skin-option-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
}

.skin-option-row input {
  width: 100%;
  min-height: 40px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #111827;
  font: inherit;
  box-sizing: border-box;
}

.array-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.checkbox-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #374151;
  font-size: 13px;
}

.state-card {
  color: #4b5563;
}

.state-card--error,
.inline-message--error {
  color: #b91c1c;
}

.inline-message {
  margin: 0;
  color: #047857;
  font-size: 14px;
  font-weight: 600;
}

@media (max-width: 900px) {
  .settings-toolbar {
    flex-direction: column;
  }

  .settings-toolbar-actions {
    width: 100%;
  }

  .toolbar-btn {
    flex: 1;
  }
}
</style>
