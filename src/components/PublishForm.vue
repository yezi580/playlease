<template>
  <div class="publish-wrap">
    <div v-if="publishErrors.length" class="error-box">
      <p>请先处理以下问题：</p>
      <ul>
        <li v-for="error in publishErrors" :key="error">{{ error }}</li>
      </ul>
    </div>

    <section class="publish-section">
      <div class="form-grid">
        <label>
          <span>上号方式 <i class="required-star">*</i><em class="inline-label-hint">配合租客登录账号的方式</em></span>
          <AnimatedSelect
            v-model="publishForm.loginMethod"
            :options="loginMethodOptions"
            @change="handleFieldChange('loginMethod')"
          />
          <small v-if="fieldErrors.loginMethod" class="field-hint error-field-hint">{{ fieldErrors.loginMethod }}</small>
        </label>

        <label>
          <span>上号时间 <i class="required-star">*</i></span>
          <div class="time-range-input">
            <AnimatedSelect
              v-model="publishForm.loginStartTime"
              :options="loginHourOptions"
              placeholder="最早时间"
              @change="handleFieldChange('loginTimeRange')"
            />
            <span class="time-sep">-</span>
            <AnimatedSelect
              v-model="publishForm.loginEndTime"
              :options="loginHourOptions"
              placeholder="最晚时间"
              @change="handleFieldChange('loginTimeRange')"
            />
          </div>
          <small v-if="fieldErrors.loginTimeRange" class="field-hint error-field-hint">{{ fieldErrors.loginTimeRange }}</small>
        </label>

        <label>
          <span>保险等级 <i class="required-star">*</i><em class="inline-label-hint">指赛季永久保险箱容量</em></span>
          <AnimatedSelect
            v-model="publishForm.insuranceLevel"
            :options="insuranceLevelOptions"
            @change="handleFieldChange('insuranceLevel')"
          />
          <small v-if="fieldErrors.insuranceLevel" class="field-hint error-field-hint">{{ fieldErrors.insuranceLevel }}</small>
        </label>

        <label>
          <span>体力等级 <i class="required-star">*</i></span>
          <AnimatedSelect
            v-model="publishForm.energyLevel"
            :options="levelOptions"
            @change="handleFieldChange('energyLevel')"
          />
          <small v-if="fieldErrors.energyLevel" class="field-hint error-field-hint">{{ fieldErrors.energyLevel }}</small>
        </label>

        <label>
          <span>负重等级 <i class="required-star">*</i></span>
          <AnimatedSelect
            v-model="publishForm.weightLevel"
            :options="levelOptions"
            @change="handleFieldChange('weightLevel')"
          />
          <small v-if="fieldErrors.weightLevel" class="field-hint error-field-hint">{{ fieldErrors.weightLevel }}</small>
        </label>

        <label>
          <span>潜水等级 <i class="required-star">*</i></span>
          <AnimatedSelect
            v-model="publishForm.diveLevel"
            :options="diveLevelSelectOptions"
            @change="handleFieldChange('diveLevel')"
          />
          <small v-if="fieldErrors.diveLevel" class="field-hint error-field-hint">{{ fieldErrors.diveLevel }}</small>
        </label>

        <label>
          <span>洗消舱等级 <i class="required-star">*</i></span>
          <AnimatedSelect
            v-model="publishForm.decontaminationChamberLevel"
            :options="decontaminationChamberLevelSelectOptions"
            @change="handleFieldChange('decontaminationChamberLevel')"
          />
          <small v-if="fieldErrors.decontaminationChamberLevel" class="field-hint error-field-hint">{{ fieldErrors.decontaminationChamberLevel }}</small>
        </label>
      </div>
    </section>

    <section class="publish-section">
      <div class="form-grid">
        <div class="field-row inline-radio-row">
          <span class="inline-row-title">
            封禁记录 <i class="required-star">*</i>
            <em class="inline-label-hint">
              请在腾讯安全中心处罚查询，<span class="inline-emphasis-danger">封三天及以上不收</span>（任何原因都不收），如近期封过请冷号 3-5 天再出
            </em>
          </span>
          <div class="radio-group">
            <label class="radio-label"><input type="radio" v-model="publishForm.banRecord" value="有" @change="handleFieldChange('banRecord')" /> 有封禁记录</label>
            <label class="radio-label"><input type="radio" v-model="publishForm.banRecord" value="无" @change="handleFieldChange('banRecord')" /> 无封禁记录</label>
          </div>
          <small v-if="fieldErrors.banRecord" class="field-hint inline-field-hint error-field-hint">{{ fieldErrors.banRecord }}</small>
        </div>

        <div v-if="publishForm.banRecord === '有'" class="ban-upload-section">
          <div class="ban-upload-title">
            <span>封禁凭证</span>
          </div>
          <input id="ban-media-upload" class="upload-input-hidden" type="file" accept="image/*,video/*" multiple @change="handleBanMediaUpload" />
          <div class="upload-entry-row">
            <label class="upload-square" for="ban-media-upload">
              <span class="upload-square-plus">+</span>
            </label>
          </div>
          <div v-if="publishForm.banImages.length" class="preview-grid ban-preview-grid">
            <div v-for="(img, index) in publishForm.banImages" :key="`ban-${index}`" class="preview-card">
              <button
                type="button"
                class="preview-media-trigger"
                @click="openImagePreview(img.url, img.name || `处罚截图${index + 1}`)"
              >
                <img :src="img.url" :alt="img.name || `处罚截图${index + 1}`" />
              </button>
              <button type="button" class="preview-remove-btn" @click.stop="removeBanImage(index)">移除</button>
            </div>
          </div>
          <div v-if="publishForm.banVideo" class="ban-video-row">
            <div class="preview-card preview-video-card">
              <button type="button" class="video-link" @click="openVideoPreview(publishForm.banVideo.url, publishForm.banVideo.name || '封禁记录视频')">查看视频</button>
              <button type="button" class="preview-remove-btn" @click.stop="removeBanVideo">移除</button>
            </div>
          </div>
          <small class="field-hint">有封禁记录时，处罚截图或补充视频至少上传一项</small>
          <small v-if="fieldErrors.banMedia" class="field-hint error-field-hint">{{ fieldErrors.banMedia }}</small>
        </div>

        <div v-if="publishForm.banRecord === '无'" class="ban-upload-section">
          <div class="ban-upload-title">
            <span>无封禁记录视频</span>
          </div>
          <input id="ban-video-upload" class="upload-input-hidden" type="file" accept="video/*" @change="handleBanVideoUpload" />
          <div v-if="!publishForm.banVideo" class="upload-entry-row">
            <label class="upload-square" for="ban-video-upload">
              <span class="upload-square-plus">+</span>
            </label>
          </div>
          <div v-if="publishForm.banVideo" class="ban-video-row">
            <div class="preview-card preview-video-card">
              <button type="button" class="video-link" @click="openVideoPreview(publishForm.banVideo.url, publishForm.banVideo.name || '封禁记录视频')">查看视频</button>
              <button type="button" class="preview-remove-btn" @click.stop="removeBanVideo">移除</button>
            </div>
          </div>
          <small v-if="fieldErrors.banMedia" class="field-hint error-field-hint">{{ fieldErrors.banMedia }}</small>
        </div>

        <div class="field-row inline-radio-row">
          <span class="inline-row-title">人脸归属本人 <i class="required-star">*</i><em class="inline-label-hint">请在腾讯健康系统查询</em></span>
          <div class="radio-group">
            <label class="radio-label"><input type="radio" v-model="publishForm.faceVerified" value="是" @change="handleFieldChange('faceVerified')" /> 是</label>
            <label class="radio-label"><input type="radio" v-model="publishForm.faceVerified" value="否" @change="handleFieldChange('faceVerified')" /> 否</label>
          </div>
          <small
            v-if="publishForm.faceVerified === '否'"
            class="field-hint inline-field-hint warning-field-hint"
          >
            请在腾讯健康系统查询。非本人人脸可能影响租客体验，建议确认后填写。
          </small>
          <small v-if="fieldErrors.faceVerified" class="field-hint inline-field-hint error-field-hint">{{ fieldErrors.faceVerified }}</small>
        </div>

        <label>
          <span>账号等级 <i class="required-star">*</i><em class="inline-label-hint">要求60级</em></span>
          <input
            v-model.trim="publishForm.characterLevel"
            type="number"
            min="0"
            max="60"
            step="1"
            placeholder="请输入账号等级"
            @input="handleCharacterLevelInput"
            @blur="handleFieldBlur('characterLevel')"
          />
          <small v-if="fieldErrors.characterLevel" class="field-hint error-field-hint">{{ fieldErrors.characterLevel }}</small>
        </label>

        <label>
          <span>账号段位 <i class="required-star">*</i><em class="inline-label-hint">当前赛季段位</em></span>
          <AnimatedSelect
            v-model="publishForm.rank"
            :options="rankOptions"
            @change="handleFieldChange('rank')"
          />
          <small v-if="fieldErrors.rank" class="field-hint error-field-hint">{{ fieldErrors.rank }}</small>
        </label>

        <label>
          <span>绝密 KD <i class="required-star">*</i></span>
          <input v-model.trim="publishForm.secretKd" type="number" min="0" step="0.1" placeholder="请输入当前赛季绝密 KD" @blur="handleFieldBlur('secretKd')" />
          <small v-if="fieldErrors.secretKd" class="field-hint error-field-hint">{{ fieldErrors.secretKd }}</small>
        </label>

        <div class="field-group">
          <span>所在地区 <i class="required-star">*</i></span>
          <div class="region-select-row">
            <AnimatedSelect
              v-model="publishForm.regionProvince"
              :options="provinceOptions"
              placeholder="选择省份"
              @change="handleRegionProvinceChange"
            />
            <AnimatedSelect
              v-model="publishForm.regionCity"
              :options="availableRegionCities"
              :placeholder="requiresRegionCity ? '选择城市' : (publishForm.regionProvince ? '/' : '请先选择省份')"
              :disabled="!publishForm.regionProvince || !requiresRegionCity"
              @change="handleRegionCityChange"
            />
          </div>
          <small v-if="fieldErrors.region" class="field-hint error-field-hint">{{ fieldErrors.region }}</small>
        </div>

        <div class="field-group">
          <span>干员外观</span>
          <div class="capsule-selector">
            <button
              v-for="item in operatorAppearanceOptions"
              :key="item"
              type="button"
              class="capsule-btn"
              :class="{ active: selectedOperatorAppearances.includes(item) }"
              @click="toggleOperatorAppearance(item)"
            >
              {{ item }}
            </button>
          </div>
        </div>

        <div class="field-group">
          <span>持有刀皮</span>
          <div class="capsule-selector">
            <button
              v-for="item in knifeSkinOptions"
              :key="item"
              type="button"
              class="capsule-btn"
              :class="{ active: selectedKnifeSkins.includes(item) }"
              @click="toggleKnifeSkin(item)"
            >
              {{ item }}
            </button>
          </div>
        </div>

        <div class="field-group">
          <span>武器皮肤</span>
          <div class="capsule-selector">
            <button
              v-for="item in weaponSkinOptions"
              :key="item"
              type="button"
              class="capsule-btn"
              :class="{ active: selectedWeaponSkins.includes(item) }"
              @click="toggleWeaponSkin(item)"
            >
              {{ item }}
            </button>
          </div>
        </div>

        <label>
          <span>备注</span>
          <textarea v-model.trim="publishForm.remark" rows="4" placeholder="可选，填写补充说明" />
        </label>
      </div>
    </section>

    <section class="publish-section">
      <div class="auto-calc-section pricing-main-section">
        <div class="auto-calc-grid">
          <label>
            <span>哈夫币余额（M）<i class="required-star">*</i><em class="inline-label-hint">指仓库右上角显示</em></span>
            <div class="hafu-input-wrap">
              <input v-model.trim="publishForm.hafuCoin" type="number" min="0" step="1" placeholder="请输入哈夫币数量" @input="handleNonNegativeIntegerInput('hafuCoin')" @blur="handleFieldBlur('hafuCoin')" />
              <span class="hafu-unit">M</span>
            </div>
            <small v-if="fieldErrors.hafuCoin" class="field-hint error-field-hint">{{ fieldErrors.hafuCoin }}</small>
          </label>

          <label>
            <span>押金（元）<i class="required-star">*</i><em class="inline-label-hint">{{ MIN_DEPOSIT_YUAN }} - {{ MAX_DEPOSIT_YUAN }} 元，且为100整数倍</em></span>
            <input v-model.trim="publishForm.deposit" type="number" :min="MIN_DEPOSIT_YUAN" :max="MAX_DEPOSIT_YUAN" step="100" :placeholder="`推荐值：${recommendedDeposit}`" @input="handleNonNegativeIntegerInput('deposit')" @blur="handleFieldBlur('deposit')" />
            <small v-if="fieldErrors.deposit" class="field-hint error-field-hint">{{ fieldErrors.deposit }}</small>
          </label>

          <label>
            <span>基础比例</span>
            <input v-model.trim="publishForm.baseRatio" type="number" min="38" max="55" step="1" :placeholder="`推荐值：${recommendedBaseRatio}`" @input="handleNonNegativeIntegerInput('baseRatio')" @blur="handleFieldBlur('baseRatio')" />
            <small v-if="fieldErrors.baseRatio" class="field-hint error-field-hint">{{ fieldErrors.baseRatio }}</small>
          </label>

          <label>
            <span>出租天数</span>
            <input v-model.trim="publishForm.rentDays" type="number" min="1" :max="rentDaysInputMax" step="1" :placeholder="rentDaysPlaceholder" @input="handleNonNegativeIntegerInput('rentDays')" @blur="handleFieldBlur('rentDays')" />
            <small v-if="fieldErrors.rentDays" class="field-hint error-field-hint">{{ fieldErrors.rentDays }}</small>
          </label>

          <label class="readonly-label">
            <span>每日消耗</span>
            <input class="readonly-input" :value="`${computedDailyCost} M/天`" readonly />
          </label>

          <label class="readonly-label">
            <span>租金</span>
            <input class="readonly-input" :value="`${formatMoneyValue(computedRentPrice)} 元`" readonly />
          </label>
        </div>
      </div>

      <div class="auto-calc-section items-card-section">
        <div v-if="!isMobileView" class="items-table">
          <div class="item-head-empty"></div>
          <div class="col-label">方式</div>
          <div class="col-label">数量</div>
          <div class="col-label">总价</div>
          <template v-for="item in saleItems" :key="item.key">
            <div class="item-name">{{ item.name }}</div>
            <div class="item-col">
              <AnimatedSelect
                v-model="publishForm.items[item.key].mode"
                :options="itemModeOptions"
                class="item-mode-select"
              />
            </div>
            <div class="item-col">
              <input
                v-model.trim="publishForm.items[item.key].quantity"
                class="item-qty-input"
                type="number"
                min="0"
                step="1"
                @input="handleItemQuantityInput(item.key)"
              />
            </div>
            <div class="item-col">
              <div class="auto-total">{{ formatMoneyValue(calcTotal(item.key)) }}</div>
            </div>
          </template>
          <div class="items-total-row">
            <div class="item-name total-label">额外物品总价</div>
            <div class="item-col"></div>
            <div class="item-col"></div>
            <div class="item-col">
              <div class="auto-total items-total-price">{{ formatMoneyValue(totalItemsPrice) }}</div>
            </div>
          </div>
        </div>

        <div v-else class="items-mobile-list">
          <div v-for="item in saleItems" :key="`mobile-${item.key}`" class="item-mobile-card">
            <div class="item-mobile-name">{{ item.name }}</div>
            <div class="item-mobile-row">
              <div class="item-mobile-field">
                <span class="item-mobile-label">方式</span>
                <AnimatedSelect
                  v-model="publishForm.items[item.key].mode"
                  :options="itemModeOptions"
                  class="item-mode-select"
                />
              </div>
              <div class="item-mobile-field">
                <span class="item-mobile-label">数量</span>
                <input
                  v-model.trim="publishForm.items[item.key].quantity"
                  class="item-qty-input"
                  type="number"
                  min="0"
                  step="1"
                  @input="handleItemQuantityInput(item.key)"
                />
              </div>
            </div>
            <div class="item-mobile-total">
              <span class="item-mobile-label">总价</span>
              <div class="auto-total">{{ formatMoneyValue(calcTotal(item.key)) }}</div>
            </div>
          </div>
          <div class="item-mobile-summary">
            <span class="item-mobile-summary-label">额外物品总价</span>
            <div class="auto-total items-total-price">{{ formatMoneyValue(totalItemsPrice) }}</div>
          </div>
        </div>
      </div>
    </section>

    <section class="publish-section">
      <h3>商品图片 <i class="required-star">*</i></h3>
      <input id="listing-image-upload" class="upload-input-hidden" type="file" accept="image/*" multiple @change="handleImageUpload" />
      <div class="upload-entry-row">
        <label class="upload-square" for="listing-image-upload">
          <span class="upload-square-plus">+</span>
        </label>
      </div>

      <div v-if="publishForm.images.length" class="preview-grid">
        <div v-for="(img, index) in publishForm.images" :key="`img-${index}`" class="preview-card">
          <div class="preview-image-wrap">
            <button
              type="button"
              class="preview-media-trigger"
              @click="openImagePreview(img.url, img.name || `图片${index + 1}`)"
            >
              <img :src="img.url" :alt="img.name || `图片${index + 1}`" />
            </button>
            <button type="button" class="preview-sort-btn preview-sort-btn-left" :disabled="index === 0" @click.stop="moveImage(index, -1)">‹</button>
            <button type="button" class="preview-sort-btn preview-sort-btn-right" :disabled="index === publishForm.images.length - 1" @click.stop="moveImage(index, 1)">›</button>
          </div>
          <button type="button" class="preview-remove-btn" @click.stop="removeImage(index)">移除</button>
        </div>
      </div>
      <small v-if="fieldErrors.images" class="field-hint error-field-hint">{{ fieldErrors.images }}</small>
    </section>

    <section class="publish-section">
      <div class="form-grid">
        <label>
          <span>联系微信 <i class="required-star">*</i></span>
          <input
            v-model.trim="publishForm.sellerContactWechat"
            type="text"
            maxlength="20"
            placeholder=""
            @blur="handleFieldBlur('sellerContactWechat')"
          />
          <small v-if="fieldErrors.sellerContactWechat" class="field-hint error-field-hint">{{ fieldErrors.sellerContactWechat }}</small>
        </label>

      </div>
    </section>

    <section class="publish-section compensation-section">
      <h3>保险赔付</h3>
      <div class="compensation-plan-list">
        <label
          v-for="plan in compensationPlanOptions"
          :key="plan.value"
          class="compensation-plan-card"
          :class="{ active: publishForm.compensationPlan === plan.value }"
        >
          <input v-model="publishForm.compensationPlan" type="radio" name="compensation-plan" :value="plan.value" @change="handleFieldChange('compensationPlan')" />
          <div class="compensation-plan-header">
            <strong>{{ plan.shortLabel }}</strong>
            <span class="compensation-plan-fee">费率：{{ plan.feeRateLabel }}</span>
          </div>
          <p class="compensation-plan-desc">{{ plan.description }}</p>
        </label>
      </div>
      <small v-if="fieldErrors.compensationPlan" class="field-hint error-field-hint">{{ fieldErrors.compensationPlan }}</small>
    </section>

    <div class="submit-row">
      <div class="submit-container">
        <div class="submit-left">
          <div class="price-summary">
            <div class="price-summary-row">
              <div class="summary-row"><span>卖家发布租金</span><em>{{ formatMoneyValue(computedRentPrice) }} 元</em></div>
              <div class="summary-row"><span>{{ sellerServiceFeeLabel }}</span><em>{{ formatMoneyValue(serviceFeeYuan) }} 元</em></div>
              <div class="summary-row"><span>{{ compensationFeeLabel }}</span><em>{{ formatMoneyValue(compensationFeeYuan) }} 元</em></div>
              <div class="summary-row"><span>额外物品总价</span><em>{{ formatMoneyValue(totalItemsPrice) }} 元</em></div>
            </div>
            <div class="price-summary-row">
              <div class="summary-row"><span>押金</span><em>{{ formatMoneyValue(Number(publishForm.deposit || 0)) }} 元</em></div>
              <div class="summary-row summary-row--highlight"><span>预计到账租金</span><em>{{ formatMoneyValue(sellerIncomeRentYuan) }} 元</em></div>
            </div>
          </div>
          <div class="agreements-row">
            <label class="agreement-label">
              <input type="checkbox" v-model="agreedToTerms" />
              <span>我已阅读并同意 <a href="#" @click.prevent="showAgreement('virtual')">《虚拟资产出售协议》</a> 和 <a href="#" @click.prevent="showAgreement('owner')">《号主协议》</a></span>
            </label>
          </div>
        </div>
        <button class="submit-btn" :disabled="submitting" @click="submitPublish">
          {{ submitting ? submittingText : submitActionText }}
        </button>
      </div>
    </div>
    <Teleport to="body">
      <Transition name="media-preview-fade">
        <div v-if="showingAgreement" class="media-preview-overlay" @click.self="closeAgreement">
          <div class="agreement-modal">
            <div class="agreement-modal-header">
              <h3>{{ showingAgreement === 'virtual' ? '虚拟资产出售协议' : '号主协议' }}</h3>
              <button type="button" class="agreement-close-btn" @click="closeAgreement">✕</button>
            </div>
            <div class="agreement-modal-body">
              <pre>{{ showingAgreement === 'virtual' ? virtualAssetAgreementContent : ownerAgreementContent }}</pre>
            </div>
            <div class="agreement-modal-footer">
              <button type="button" class="submit-btn agreement-confirm-btn" @click="closeAgreement">我已阅读</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
    <Teleport to="body">
      <Transition name="media-preview-fade">
        <div v-if="previewMediaUrl" class="media-preview-overlay" @click.self="closeMediaPreview">
          <button type="button" class="media-preview-close" @click="closeMediaPreview">关闭</button>
          <img
            v-if="previewMediaType === 'image'"
            :src="previewMediaUrl"
            :alt="previewMediaName || '图片预览'"
            class="media-preview-image"
          />
          <video
            v-else
            :src="previewMediaUrl"
            :aria-label="previewMediaName || '视频预览'"
            class="media-preview-video"
            controls
            autoplay
          ></video>
          <div v-if="previewMediaName" class="media-preview-name">{{ previewMediaName }}</div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script>
import AnimatedSelect from './AnimatedSelect.vue'
import { apiFetch, clearAuth, createAuthorizedObjectUrl } from '../utils/api.js'
import { REGION_OPTIONS, getCitiesByProvince, buildRegionText, isProvinceWithoutCityRequired, resolveRegionSelection } from '../constants/regionData.js'
import { VIRTUAL_ASSET_AGREEMENT, OWNER_AGREEMENT } from '../constants/agreements.js'
import {
  calculateBaseRatio,
  fetchBusinessSettings,
  formatPercentLabel,
  getCachedBusinessSettings,
  getCompensationPlanOption,
  getEnabledSaleItems,
  getKnifeSkinOptions,
  getOperatorAppearanceOptions,
  getRecommendedDailyCost,
  getRecommendedRentDays,
  getRentDaysLimit,
  getWeaponSkinOptions
} from '../utils/businessSettings.js'
import {
  buildSaleItems,
  createDefaultItems,
  createDefaultFieldErrors,
  createDefaultPublishForm,
  DEFAULT_COMPENSATION_PLAN,
  DECONTAMINATION_CHAMBER_LEVEL_OPTIONS,
  DIVE_LEVEL_OPTIONS,
  getCurrentTimeText,
  INSURANCE_LEVEL_OPTIONS,
  ITEM_MODE_OPTIONS,
  LEVEL_OPTIONS,
  LOGIN_METHOD_OPTIONS,
  mapCompensationPlanOptions,
  MAX_BAN_IMAGE_COUNT,
  MAX_BAN_IMAGE_SIZE,
  MAX_BAN_VIDEO_SIZE,
  MAX_DEPOSIT_YUAN,
  MAX_LISTING_IMAGE_COUNT,
  MAX_LISTING_IMAGE_SIZE,
  MIN_DEPOSIT_YUAN,
  normalizeInsuranceLevel,
  RANK_OPTIONS,
  splitLoginTimeRange,
  splitMultiText
} from '../utils/publishForm.js'
import { showErrorToast, showSuccessToast, showWarningToast } from '../utils/toast.js'
import { showConfirm } from '../utils/confirm.js'

export default {
  name: 'PublishForm',
  components: { AnimatedSelect },
  props: {
    ownerName: {
      type: String,
      default: '匿名用户'
    },
    editingListingId: {
      type: [Number, String, null],
      default: null
    }
  },
  emits: ['published', 'auth-expired', 'back'],
  data() {
    return {
      businessSettings: getCachedBusinessSettings(),
      MIN_DEPOSIT_YUAN,
      MAX_DEPOSIT_YUAN,
      loadingEdit: false,
      submitting: false,
      publishErrors: [],
      loginMethodOptions: LOGIN_METHOD_OPTIONS,
      insuranceLevelOptions: INSURANCE_LEVEL_OPTIONS,
      compensationPlanOptions: mapCompensationPlanOptions(getCachedBusinessSettings().compensationPlans),
      levelOptions: LEVEL_OPTIONS,
      diveLevelOptions: DIVE_LEVEL_OPTIONS,
      decontaminationChamberLevelOptions: DECONTAMINATION_CHAMBER_LEVEL_OPTIONS,
      rankOptions: RANK_OPTIONS,
      operatorAppearanceOptions: getOperatorAppearanceOptions(getCachedBusinessSettings()),
      knifeSkinOptions: getKnifeSkinOptions(getCachedBusinessSettings()),
      weaponSkinOptions: getWeaponSkinOptions(getCachedBusinessSettings()),
      selectedOperatorAppearances: [],
      selectedKnifeSkins: [],
      selectedWeaponSkins: [],
      itemModeOptions: ITEM_MODE_OPTIONS,
      saleItems: buildSaleItems(getEnabledSaleItems()),
      viewportWidth: typeof window === 'undefined' ? 1440 : window.innerWidth,
      isMobileView: typeof window === 'undefined' ? false : window.innerWidth <= 1200,
      previewMediaType: 'image',
      previewMediaUrl: '',
      previewMediaName: '',
      fieldErrors: createDefaultFieldErrors(),
      publishForm: createDefaultPublishForm(),
      agreedToTerms: false,
      showingAgreement: null,
      virtualAssetAgreementContent: VIRTUAL_ASSET_AGREEMENT,
      ownerAgreementContent: OWNER_AGREEMENT
    }
  },
  computed: {
    isEditMode() {
      return this.editingListingId !== null && this.editingListingId !== undefined && this.editingListingId !== ''
    },
    submitActionText() {
      return this.isEditMode ? '保存修改' : '提交发布'
    },
    submittingText() {
      return this.isEditMode ? '保存中...' : '提交中...'
    },
    gridSize() {
      const map = {
        '2格': 2,
        '4格': 4,
        '6格': 6,
        '9格': 9
      }
      return map[this.publishForm.insuranceLevel] || 2
    },
    recommendedBaseRatio() {
      if (this.publishForm.insuranceLevel === '2格' || this.publishForm.insuranceLevel === '4格') {
        return 50
      }
      let ratio = calculateBaseRatio(this.gridSize, this.selectedKnifeSkins.join('、'), this.businessSettings)
      const energyLevel = parseInt(this.publishForm.energyLevel, 10) || 7
      ratio += (7 - energyLevel)

      const weightLevel = parseInt(this.publishForm.weightLevel, 10) || 7
      if (weightLevel <= 5) {
        ratio += (6 - weightLevel)
      }

      const hafuCoin = Number(this.publishForm.hafuCoin || 0)
      if (hafuCoin >= 300) {
        ratio += Math.floor((hafuCoin - 300) / 100)
      }

      if (this.selectedWeaponSkins.some((skin) => skin.includes('M7-棱镜攻势'))) {
        ratio -= 1
      }

      return ratio
    },
    computedBaseRatio() {
      const userValue = Number(this.publishForm.baseRatio)
      if (Number.isInteger(userValue) && userValue >= 38 && userValue <= 55) {
        return userValue
      }
      return this.recommendedBaseRatio
    },
    recommendedRentDays() {
      return getRecommendedRentDays(this.publishForm.hafuCoin, this.businessSettings)
    },
    recommendedDailyCost() {
      return getRecommendedDailyCost(this.publishForm.hafuCoin, this.businessSettings)
    },
    rentDaysLimit() {
      return getRentDaysLimit(this.publishForm.hafuCoin, this.businessSettings)
    },
    rentDaysInputMax() {
      return this.rentDaysLimit > 0 ? this.rentDaysLimit : null
    },
    rentDaysPlaceholder() {
      return String(this.publishForm.hafuCoin ?? '').trim() === ''
        ? ''
        : `推荐值：${this.recommendedRentDays}（按 ${this.recommendedDailyCost} M/天）`
    },
    effectiveRentDays() {
      const userValue = Number(this.publishForm.rentDays)
      if (this.isValidRentDaysValue(userValue)) {
        return userValue
      }
      return this.recommendedRentDays
    },
    computedDailyCost() {
      const hafuCoin = Number(this.publishForm.hafuCoin || 0)
      if (!this.effectiveRentDays) return 0
      return Math.round(hafuCoin / this.effectiveRentDays)
    },
    computedRentPrice() {
      const hafuCoin = Number(this.publishForm.hafuCoin || 0)
      if (this.computedBaseRatio <= 0) return 0
      return Math.round((hafuCoin * 100) / this.computedBaseRatio)
    },
    serviceFeeYuan() {
      return Number((this.computedRentPrice * Number(this.businessSettings.platformCommission?.sellerServiceFeeRatePercent || 10) / 100).toFixed(2))
    },
    selectedCompensationPlan() {
      return getCompensationPlanOption(this.publishForm.compensationPlan, this.businessSettings)
    },
    compensationFeeYuan() {
      return Number((this.computedRentPrice * Number(this.selectedCompensationPlan?.feeRatePercent || 0) / 100).toFixed(2))
    },
    compensationFeeLabel() {
      const feeRateLabel = formatPercentLabel(this.selectedCompensationPlan?.feeRatePercent || 0)
      return `保险赔付服务费（${feeRateLabel}）`
    },
    sellerServiceFeeLabel() {
      const feeRateLabel = formatPercentLabel(this.businessSettings.platformCommission?.sellerServiceFeeRatePercent || 0)
      return `平台手续费（${feeRateLabel}）`
    },
    buyerRentPriceYuan() {
      return this.computedRentPrice + Number((this.computedRentPrice * Number(this.businessSettings.platformCommission?.buyerServiceFeeRatePercent || 10) / 100).toFixed(2))
    },
    sellerIncomeRentYuan() {
      return Math.max(0, this.computedRentPrice - this.serviceFeeYuan - this.compensationFeeYuan)
    },
    totalItemsPrice() {
      return this.saleItems.reduce((sum, item) => sum + this.calcTotal(item.key), 0)
    },
    recommendedDeposit() {
      const depositMin = Number(this.MIN_DEPOSIT_YUAN || MIN_DEPOSIT_YUAN)
      const depositMax = Number(this.MAX_DEPOSIT_YUAN || MAX_DEPOSIT_YUAN)
      const rentBasedRecommend = this.computedRentPrice * Number(this.businessSettings.listingRecommendations?.recommendDepositRatioPercent || 100) / 100
      const itemsCoverageAmount = this.totalItemsPrice * Number(this.businessSettings.listingRecommendations?.itemsDepositCoveragePercent || 100) / 100
      const rounded = Math.ceil(Math.max(rentBasedRecommend, itemsCoverageAmount, depositMin) / 100) * 100
      return Math.min(depositMax, rounded)
    },
    summaryTotal() {
      return Number(this.publishForm.deposit || 0) + this.buyerRentPriceYuan
    },
    provinceOptions() {
      return REGION_OPTIONS.map((item) => item.province)
    },
    availableRegionCities() {
      return getCitiesByProvince(this.publishForm.regionProvince)
    },
    requiresRegionCity() {
      return !isProvinceWithoutCityRequired(this.publishForm.regionProvince)
    },
    loginHourOptions() {
      return Array.from({ length: 24 }, (_, index) => `${String(index).padStart(2, '0')}:00`)
    },
    diveLevelSelectOptions() {
      return this.diveLevelOptions.map(item => ({ label: `${item}级`, value: item }))
    },
    decontaminationChamberLevelSelectOptions() {
      return this.decontaminationChamberLevelOptions.map(item => ({ label: `${item}级`, value: item }))
    }
  },
  watch: {
    editingListingId: {
      immediate: true,
      async handler() {
        await this.ensureBusinessSettingsLoaded()
        await this.initializeForm()
      }
    }
  },
  async mounted() {
    await this.ensureBusinessSettingsLoaded()
    this.handleViewportResize()
    window.addEventListener('resize', this.handleViewportResize)
    window.addEventListener('keydown', this.handlePreviewKeydown)
    this.$el?.addEventListener('wheel', this.handleNumberInputWheel, { passive: false })
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.handleViewportResize)
    window.removeEventListener('keydown', this.handlePreviewKeydown)
    this.$el?.removeEventListener('wheel', this.handleNumberInputWheel)
    this.cleanupObjectUrls()
  },
  methods: {
    async ensureBusinessSettingsLoaded() {
      const settings = await fetchBusinessSettings()
      this.applyBusinessSettings(settings)
    },
    applyBusinessSettings(settings) {
      this.businessSettings = settings
      this.MIN_DEPOSIT_YUAN = Number(settings.listingRecommendations?.depositMinYuan || MIN_DEPOSIT_YUAN)
      this.MAX_DEPOSIT_YUAN = Number(settings.listingRecommendations?.depositMaxYuan || MAX_DEPOSIT_YUAN)
      this.compensationPlanOptions = mapCompensationPlanOptions(settings.compensationPlans)
      this.operatorAppearanceOptions = getOperatorAppearanceOptions(settings)
      this.knifeSkinOptions = getKnifeSkinOptions(settings)
      this.weaponSkinOptions = getWeaponSkinOptions(settings)
      this.saleItems = buildSaleItems(getEnabledSaleItems(settings))
      if (!this.compensationPlanOptions.some((plan) => plan.value === this.publishForm.compensationPlan)) {
        this.publishForm.compensationPlan = DEFAULT_COMPENSATION_PLAN
      }
    },
    handleViewportResize() {
      if (typeof window === 'undefined') return
      this.viewportWidth = window.innerWidth
      this.isMobileView = window.innerWidth <= 1200
    },
    handleNumberInputWheel(event) {
      const target = event.target
      if (!(target instanceof HTMLInputElement)) return
      if (target.type !== 'number') return
      event.preventDefault()
    },
    handlePreviewKeydown(event) {
      if (event?.key === 'Escape') {
        if (this.previewMediaUrl) {
          this.closeMediaPreview()
        }
        if (this.showingAgreement) {
          this.closeAgreement()
        }
      }
    },
    showAgreement(type) {
      this.showingAgreement = type
    },
    closeAgreement() {
      this.showingAgreement = null
    },
    openImagePreview(imageUrl, imageName = '') {
      const targetUrl = String(imageUrl || '').trim()
      if (!targetUrl) return
      this.previewMediaType = 'image'
      this.previewMediaUrl = targetUrl
      this.previewMediaName = String(imageName || '').trim()
    },
    openVideoPreview(videoUrl, videoName = '') {
      const targetUrl = String(videoUrl || '').trim()
      if (!targetUrl) return
      this.previewMediaType = 'video'
      this.previewMediaUrl = targetUrl
      this.previewMediaName = String(videoName || '').trim()
    },
    closeMediaPreview() {
      this.previewMediaType = 'image'
      this.previewMediaUrl = ''
      this.previewMediaName = ''
    },
    cleanupObjectUrls() {
      this.publishForm.images.forEach((item) => {
        if (item?.localPreview && item?.url) URL.revokeObjectURL(item.url)
      })
      this.publishForm.banImages.forEach((item) => {
        if (item?.localPreview && item?.url) URL.revokeObjectURL(item.url)
      })
      if (this.publishForm.banVideo?.localPreview && this.publishForm.banVideo?.url) {
        URL.revokeObjectURL(this.publishForm.banVideo.url)
      }
    },
    resetPublishForm() {
      this.cleanupObjectUrls()
      this.publishErrors = []
      this.fieldErrors = createDefaultFieldErrors()
      this.selectedOperatorAppearances = []
      this.selectedKnifeSkins = []
      this.selectedWeaponSkins = []
      this.publishForm = createDefaultPublishForm()
    },
    async initializeForm() {
      this.resetPublishForm()
      if (this.isEditMode) {
        await this.loadEditingListing()
      }
    },
    async buildProtectedBanImagePreviewItem(url, index) {
      const previewUrl = await createAuthorizedObjectUrl(url)
      return {
        name: `处罚截图${index + 1}`,
        url: previewUrl,
        serverUrl: String(url || ''),
        uploaded: true,
        localPreview: true
      }
    },
    async buildProtectedBanVideoPreviewItem(url) {
      const previewUrl = await createAuthorizedObjectUrl(url)
      return {
        name: '封禁记录视频',
        url: previewUrl,
        serverUrl: String(url || ''),
        uploaded: true,
        localPreview: true
      }
    },
    async hydrateProtectedBanMedia(detail) {
      const banImages = Array.isArray(detail?.banImages) ? detail.banImages.filter(Boolean) : []
      const hydratedBanImages = await Promise.all(
        banImages.map((url, index) => this.buildProtectedBanImagePreviewItem(url, index))
      )
      let hydratedBanVideo = null
      if (detail?.banVideo) {
        hydratedBanVideo = await this.buildProtectedBanVideoPreviewItem(detail.banVideo)
      }
      return {
        ...detail,
        banImages: hydratedBanImages,
        banVideo: hydratedBanVideo
      }
    },
    populateFormFromListing(detail) {
      const timeRange = splitLoginTimeRange(detail.login_time_range)
      const regionSelection = resolveRegionSelection(detail.region)
      const nextItems = createDefaultItems()

      if (Array.isArray(detail.items)) {
        detail.items.forEach((item) => {
          if (nextItems[item.item_key]) {
            nextItems[item.item_key].quantity = item.quantity ? String(item.quantity) : ''
            nextItems[item.item_key].mode = item.item_mode === 'gift' ? 'gift' : 'sale'
          }
        })
      }

      this.selectedOperatorAppearances = splitMultiText(detail.operator_appearance)
      this.selectedKnifeSkins = splitMultiText(detail.knife_skin)
      this.selectedWeaponSkins = splitMultiText(detail.weapon_skin)

      this.publishForm = {
        sellerContactWechat: String(detail.seller_contact_wechat || ''),
        insuranceLevel: normalizeInsuranceLevel(detail.insurance_level),
        compensationPlan: String(detail.compensation_plan || DEFAULT_COMPENSATION_PLAN),
        weightLevel: String(detail.weight_level || '7级'),
        deposit: String(Math.round(Number(detail.deposit || 0) / 100)),
        baseRatio: String(detail.base_ratio ?? ''),
        loginMethod: String(detail.login_method || 'QQ账密'),
        energyLevel: String(detail.energy_level || '7级'),
        hafuCoin: String(detail.hafu_coin ?? ''),
        rentDays: String(detail.rent_days ?? ''),
        loginStartTime: timeRange.start,
        loginEndTime: timeRange.end,
        secretKd: String(detail.secret_kd ?? ''),
        characterLevel: String(detail.character_level ?? ''),
        rank: String(detail.rank_name || '无'),
        region: String(detail.region || ''),
        regionProvince: regionSelection.province,
        regionCity: regionSelection.city,
        faceVerified: Number(detail.face_verified) === 1 ? '是' : '否',
        diveLevel: String(detail.dive_level ?? '0'),
        decontaminationChamberLevel: String(detail.decontamination_chamber_level ?? '0'),
        publishedAt: String(detail.published_at || ''),
        remark: String(detail.remark || ''),
        banRecord: String(detail.ban_record || ''),
        banImages: Array.isArray(detail.banImages) ? detail.banImages : [],
        banVideo: detail.banVideo || null,
        images: Array.isArray(detail.images)
          ? detail.images.map((url, index) => ({
              name: `图片${index + 1}`,
              url,
              uploaded: true,
              localPreview: false
            }))
          : [],
        items: nextItems
      }
    },
    async loadEditingListing() {
      this.loadingEdit = true
      try {
        const detail = await apiFetch(`/api/my-listings/${this.editingListingId}`)
        const hydratedDetail = await this.hydrateProtectedBanMedia(detail)
        this.populateFormFromListing(hydratedDetail)
      } catch (error) {
        if (error.status === 401) {
          clearAuth()
          this.$emit('auth-expired', '登录状态异常，请重新登录后编辑商品')
          return
        }
        showErrorToast(`加载商品失败：${error.message}`)
      } finally {
        this.loadingEdit = false
      }
    },
    toggleOperatorAppearance(item) {
      this.toggleMultiSelect(this.selectedOperatorAppearances, item)
    },
    toggleKnifeSkin(item) {
      this.toggleMultiSelect(this.selectedKnifeSkins, item)
    },
    toggleWeaponSkin(item) {
      this.toggleMultiSelect(this.selectedWeaponSkins, item)
    },
    toggleMultiSelect(list, item) {
      const index = list.indexOf(item)
      if (index > -1) {
        list.splice(index, 1)
      } else {
        list.push(item)
      }
    },
    validateAndFixBaseRatio() {
      this.handleFieldBlur('baseRatio')
    },
    validateAndFixRentDays() {
      this.handleFieldBlur('rentDays')
    },
    handleFieldBlur(field) {
      this.fieldErrors[field] = this.validateField(field)
      if (field === 'hafuCoin') {
        this.fieldErrors.rentDays = this.validateField('rentDays')
      }
      if (field === 'deposit') {
        this.fieldErrors.deposit = this.validateField('deposit')
      }
    },
    handleFieldChange(field) {
      this.fieldErrors[field] = this.validateField(field)
      if (field === 'banRecord') {
        this.fieldErrors.banMedia = this.validateField('banMedia')
      }
    },
    validateField(field) {
      const value = this.publishForm[field]
      switch (field) {
        case 'sellerContactWechat':
          if (!value) return '联系微信为必填'
          return /^[a-zA-Z][-_a-zA-Z0-9]{5,19}$/.test(String(value).trim()) ? '' : '请输入正确的微信号'
        case 'loginMethod':
          return value ? '' : '上号方式为必填'
        case 'loginTimeRange':
          return this.publishForm.loginStartTime && this.publishForm.loginEndTime ? '' : '上号时间为必填'
        case 'insuranceLevel':
          return value ? '' : '保险等级为必填'
        case 'compensationPlan':
          return value ? '' : '保险赔付为必填'
        case 'energyLevel':
          return value ? '' : '体力等级为必填'
        case 'weightLevel':
          return value ? '' : '负重等级为必填'
        case 'diveLevel':
          return value !== '' ? '' : '潜水等级为必填'
        case 'decontaminationChamberLevel':
          return value !== '' ? '' : '洗消舱等级为必填'
        case 'banRecord':
          return value ? '' : '封禁记录为必填'
        case 'banMedia':
          return ''
        case 'faceVerified':
          return value ? '' : '人脸归属本人为必填'
        case 'characterLevel': {
          if (value === '' || value === null || value === undefined) return '账号等级为必填'
          const characterLevel = Number(value)
          return Number.isInteger(characterLevel) && characterLevel === 60 ? '' : '账号等级必须为 60 级'
        }
        case 'rank':
          return value ? '' : '账号段位为必填'
        case 'secretKd': {
          if (value === '' || value === null || value === undefined) return '绝密 KD 为必填'
          const secretKd = Number(value)
          return Number.isFinite(secretKd) && secretKd >= 0 ? '' : '绝密 KD 请输入有效的非负数'
        }
        case 'region':
          if (!this.publishForm.regionProvince) return '所在地区为必填'
          return this.requiresRegionCity && !this.publishForm.regionCity ? '所在地区为必填' : ''
        case 'hafuCoin': {
          if (value === '' || value === null || value === undefined) return '哈夫币余额为必填'
          const hafuCoin = Number(value)
          return Number.isInteger(hafuCoin) && hafuCoin >= 0 ? '' : '哈夫币余额请输入有效的非负整数'
        }
        case 'deposit': {
          if (value === '' || value === null || value === undefined) return '押金为必填'
          const deposit = Number(value)
          if (!Number.isInteger(deposit) || deposit < 0) return '押金请输入有效的非负整数'
          if (deposit < this.MIN_DEPOSIT_YUAN || deposit > this.MAX_DEPOSIT_YUAN) return `押金范围为 ${this.MIN_DEPOSIT_YUAN} - ${this.MAX_DEPOSIT_YUAN} 元`
          if (deposit % 100 !== 0) return '押金必须为 100 的整数倍'
          const minimumItemsCoverageAmount = this.totalItemsPrice * Number(this.businessSettings.listingRecommendations?.itemsDepositCoveragePercent || 100) / 100
          if (deposit < minimumItemsCoverageAmount) {
            return `押金（¥${deposit}）不能低于额外物品覆盖金额（¥${this.formatMoneyValue(minimumItemsCoverageAmount)}）`
          }
          return ''
        }
        case 'baseRatio': {
          if (value === '' || value === null || value === undefined) return ''
          const baseRatio = Number(value)
          return Number.isInteger(baseRatio) && baseRatio >= 38 && baseRatio <= 55 ? '' : '基础比例需为 38 - 55 的整数'
        }
        case 'rentDays': {
          if (value === '' || value === null || value === undefined) return ''
          const rentDays = Number(value)
          if (this.isValidRentDaysValue(rentDays)) return ''
          return this.rentDaysLimit > 0
            ? `出租天数需为 1 - ${this.rentDaysLimit} 的整数`
            : '出租天数需为大于等于 1 的整数'
        }
        case 'images':
          return this.publishForm.images.length > 0 ? '' : '请上传商品图片'
        default:
          return ''
      }
    },
    handleRegionProvinceChange() {
      this.publishForm.regionCity = ''
      this.publishForm.region = this.requiresRegionCity
        ? ''
        : buildRegionText(this.publishForm.regionProvince, '')
      this.fieldErrors.region = this.validateField('region')
    },
    isValidRentDaysValue(value) {
      return Number.isInteger(value) && value >= 1 && (this.rentDaysLimit <= 0 || value <= this.rentDaysLimit)
    },
    handleRegionCityChange() {
      this.publishForm.region = buildRegionText(this.publishForm.regionProvince, this.publishForm.regionCity)
      this.fieldErrors.region = this.validateField('region')
    },
    handleNonNegativeIntegerInput(field) {
      const currentValue = String(this.publishForm[field] ?? '')
      if (currentValue === '') return

      const numericValue = Number(currentValue)
      if (!Number.isFinite(numericValue) || numericValue < 0) {
        this.publishForm[field] = ''
        return
      }

      const nextValue = Math.floor(numericValue)
      this.publishForm[field] = String(nextValue)
    },
    handleCharacterLevelInput() {
      const currentValue = String(this.publishForm.characterLevel ?? '')
      if (currentValue === '') return

      const numericValue = Number(currentValue)
      if (!Number.isFinite(numericValue) || numericValue < 0) {
        this.publishForm.characterLevel = ''
        return
      }

      this.publishForm.characterLevel = String(Math.min(Math.floor(numericValue), 60))
    },
    handleItemQuantityInput(itemKey) {
      const currentValue = this.publishForm.items[itemKey].quantity
      this.publishForm.items[itemKey].quantity = currentValue === '' ? '' : String(Math.max(0, Math.floor(Number(currentValue) || 0)))
    },
    formatMoneyValue(value) {
      const amount = Number(value || 0)
      const formatted = amount.toFixed(2)
      return formatted.includes('.')
        ? formatted.replace(/0+$/, '').replace(/\.$/, '')
        : formatted
    },
    calcTotal(itemKey) {
      const item = this.saleItems.find((entry) => entry.key === itemKey)
      const qty = Number(this.publishForm.items[itemKey]?.quantity || 0)
      const mode = this.publishForm.items[itemKey]?.mode === 'gift' ? 'gift' : 'sale'
      if (mode === 'gift') return 0
      return qty * Number(item?.priceInYuan || 0)
    },
    handleImageUpload(event) {
      const files = Array.from(event.target.files || [])
      const maxListingImageCount = Number(this.businessSettings.operationalThresholds?.listingImageLimit || MAX_LISTING_IMAGE_COUNT)
      const remainCount = maxListingImageCount - this.publishForm.images.length
      if (remainCount <= 0) {
        showWarningToast(`最多只能上传 ${maxListingImageCount} 张图片`)
        event.target.value = ''
        return
      }

      files.slice(0, remainCount).forEach((file) => {
        if (file.size > MAX_LISTING_IMAGE_SIZE) {
          return
        }
        this.publishForm.images.push({
          name: file.name,
          url: URL.createObjectURL(file),
          file,
          uploaded: false,
          localPreview: true
        })
      })
      this.fieldErrors.images = this.validateField('images')
      event.target.value = ''
    },
    moveImage(index, direction) {
      const targetIndex = index + direction
      if (targetIndex < 0 || targetIndex >= this.publishForm.images.length) return
      const nextImages = [...this.publishForm.images]
      const [currentItem] = nextImages.splice(index, 1)
      nextImages.splice(targetIndex, 0, currentItem)
      this.publishForm.images = nextImages
    },
    removeImage(index) {
      const target = this.publishForm.images[index]
      if (target?.localPreview && target?.url) {
        URL.revokeObjectURL(target.url)
      }
      this.publishForm.images.splice(index, 1)
      this.fieldErrors.images = this.validateField('images')
    },
    appendBanImageFiles(files) {
      const remainCount = MAX_BAN_IMAGE_COUNT - this.publishForm.banImages.length
      if (remainCount <= 0) {
        showWarningToast(`处罚截图最多上传 ${MAX_BAN_IMAGE_COUNT} 张`)
        return
      }

      files.slice(0, remainCount).forEach((file) => {
        if (file.size > MAX_BAN_IMAGE_SIZE) {
          return
        }
        this.publishForm.banImages.push({
          name: file.name,
          url: URL.createObjectURL(file),
          file,
          uploaded: false,
          localPreview: true
        })
      })
    },
    handleBanImageUpload(event) {
      const files = Array.from(event.target.files || [])
      this.appendBanImageFiles(files)
      this.fieldErrors.banMedia = this.validateField('banMedia')
      event.target.value = ''
    },
    setBanVideoFile(file) {
      if (!file) return
      if (file.size > MAX_BAN_VIDEO_SIZE) {
        showWarningToast('视频文件不能超过 100MB')
        return
      }

      if (this.publishForm.banVideo?.localPreview && this.publishForm.banVideo?.url) {
        URL.revokeObjectURL(this.publishForm.banVideo.url)
      }
      this.publishForm.banVideo = {
        name: file.name,
        url: URL.createObjectURL(file),
        file,
        uploaded: false,
        localPreview: true
      }
    },
    handleBanMediaUpload(event) {
      const files = Array.from(event.target.files || [])
      const imageFiles = files.filter((file) => file.type.startsWith('image/'))
      const videoFiles = files.filter((file) => file.type.startsWith('video/'))

      if (imageFiles.length) {
        this.appendBanImageFiles(imageFiles)
      }
      if (videoFiles.length > 1) {
        showWarningToast('封禁补充视频最多上传 1 个')
      }
      if (videoFiles[0]) {
        this.setBanVideoFile(videoFiles[0])
      }
      this.fieldErrors.banMedia = this.validateField('banMedia')
      event.target.value = ''
    },
    removeBanImage(index) {
      const target = this.publishForm.banImages[index]
      if (target?.localPreview && target?.url) {
        URL.revokeObjectURL(target.url)
      }
      this.publishForm.banImages.splice(index, 1)
      this.fieldErrors.banMedia = this.validateField('banMedia')
    },
    handleBanVideoUpload(event) {
      const file = event.target.files?.[0]
      if (!file) return
      this.setBanVideoFile(file)
      this.fieldErrors.banMedia = this.validateField('banMedia')
      event.target.value = ''
    },
    removeBanVideo() {
      if (this.publishForm.banVideo?.localPreview && this.publishForm.banVideo?.url) {
        URL.revokeObjectURL(this.publishForm.banVideo.url)
      }
      this.publishForm.banVideo = null
      this.fieldErrors.banMedia = this.validateField('banMedia')
    },
    async uploadBanMediaForSubmit() {
      const uploadedBanImageUrls = []
      let uploadedBanVideoUrl = ''

      if (this.publishForm.banRecord === '有') {
        const pendingImageFiles = this.publishForm.banImages.filter((item) => item?.file instanceof File && !item?.uploaded).map((item) => item.file)
        if (pendingImageFiles.length) {
          const formData = new FormData()
          pendingImageFiles.forEach((file) => formData.append('images', file))
          const data = await apiFetch('/api/uploads/ban-images', { method: 'POST', body: formData })
          const uploadedFiles = Array.isArray(data.files) ? data.files : []
          let pendingIndex = 0
          this.publishForm.banImages.forEach((item) => {
            if (item?.uploaded && item?.serverUrl) {
              uploadedBanImageUrls.push(item.serverUrl)
              return
            }
            if (item?.file instanceof File) {
              const nextUploadedUrl = uploadedFiles[pendingIndex]?.url
              if (nextUploadedUrl) uploadedBanImageUrls.push(nextUploadedUrl)
              pendingIndex += 1
            }
          })
        } else {
          this.publishForm.banImages.forEach((item) => {
            if (item?.uploaded && item?.serverUrl) {
              uploadedBanImageUrls.push(item.serverUrl)
            }
          })
        }
      }

      if (this.publishForm.banVideo?.uploaded && this.publishForm.banVideo?.serverUrl) {
        uploadedBanVideoUrl = this.publishForm.banVideo.serverUrl
      } else if (this.publishForm.banVideo?.file instanceof File) {
        const formData = new FormData()
        formData.append('video', this.publishForm.banVideo.file)
        const data = await apiFetch('/api/uploads/ban-video', { method: 'POST', body: formData })
        uploadedBanVideoUrl = data?.file?.url || ''
      }

      return {
        banImages: uploadedBanImageUrls,
        banVideo: uploadedBanVideoUrl
      }
    },
    async uploadListingImagesForSubmit() {
      const uploadedListingImageUrls = []
      const pendingImageFiles = this.publishForm.images.filter((item) => item?.file instanceof File && !item?.uploaded).map((item) => item.file)

      if (pendingImageFiles.length) {
        const formData = new FormData()
        pendingImageFiles.forEach((file) => formData.append('images', file))
        const data = await apiFetch('/api/uploads/listing-images', { method: 'POST', body: formData })
        const uploadedFiles = Array.isArray(data.files) ? data.files : []
        let pendingIndex = 0
        this.publishForm.images.forEach((item) => {
          if (item?.uploaded && item?.url) {
            uploadedListingImageUrls.push(item.url)
            return
          }
          if (item?.file instanceof File) {
            const nextUploadedUrl = uploadedFiles[pendingIndex]?.url
            if (nextUploadedUrl) uploadedListingImageUrls.push(nextUploadedUrl)
            pendingIndex += 1
          }
        })
      } else {
        this.publishForm.images.forEach((item) => {
          if (item?.uploaded && item?.url) {
            uploadedListingImageUrls.push(item.url)
          }
        })
      }

      return uploadedListingImageUrls
    },
    validatePublishForm() {
      const nextFieldErrors = createDefaultFieldErrors()
      Object.keys(nextFieldErrors).forEach((field) => {
        nextFieldErrors[field] = this.validateField(field)
      })
      this.fieldErrors = nextFieldErrors
      return [...new Set(Object.values(nextFieldErrors).filter(Boolean))]
    },
    buildPublishPayload(uploadedBanMedia = {}, uploadedListingImages = []) {
      const itemsPayload = {}
      this.saleItems.forEach((item) => {
        itemsPayload[item.key] = {
          itemName: item.name,
          quantity: Number(this.publishForm.items[item.key].quantity || 0),
          itemMode: this.publishForm.items[item.key].mode === 'gift' ? 'gift' : 'sale',
          unitPrice: String(item.priceInYuan),
          totalPrice: String(this.calcTotal(item.key))
        }
      })

      return {
        ownerName: this.ownerName || '匿名用户',
        sellerContactWechat: String(this.publishForm.sellerContactWechat || '').trim(),
        publishedAt: this.publishForm.publishedAt || getCurrentTimeText(),
        insuranceLevel: this.publishForm.insuranceLevel,
        compensationPlan: this.publishForm.compensationPlan,
        weightLevel: this.publishForm.weightLevel,
        deposit: Number(this.publishForm.deposit || 0),
        loginMethod: this.publishForm.loginMethod,
        energyLevel: this.publishForm.energyLevel,
        hafuCoin: Number(this.publishForm.hafuCoin || 0),
        baseRatio: this.computedBaseRatio,
        rentDays: this.effectiveRentDays,
        loginTimeRange: `${this.publishForm.loginStartTime}-${this.publishForm.loginEndTime}`,
        secretKd: this.publishForm.secretKd,
        characterLevel: Number(this.publishForm.characterLevel || 0),
        operatorAppearance: this.selectedOperatorAppearances.join('、'),
        rank: this.publishForm.rank,
        knifeSkin: this.selectedKnifeSkins.join('、'),
        weaponSkin: this.selectedWeaponSkins.join('、'),
        region: this.publishForm.region,
        faceVerified: this.publishForm.faceVerified,
        diveLevel: this.publishForm.diveLevel,
        decontaminationChamberLevel: this.publishForm.decontaminationChamberLevel,
        remark: this.publishForm.remark,
        banRecord: this.publishForm.banRecord,
        banImages: this.publishForm.banRecord === '有' ? (uploadedBanMedia.banImages || []) : [],
        banVideo: uploadedBanMedia.banVideo || '',
        items: itemsPayload,
        images: uploadedListingImages
      }
    },
    async submitPublish() {
      if (!this.agreedToTerms) {
        showWarningToast('请先阅读并勾选同意相关协议')
        return
      }

      this.publishErrors = this.validatePublishForm()
      if (this.publishErrors.length) {
        showWarningToast(`请先完成以下内容：\n\n${this.publishErrors.join('\n')}`, { duration: 4200 })
        return
      }

      const confirmed = await showConfirm({
        title: this.isEditMode ? '确认保存商品' : '确认发布商品',
        message: `平台将向卖家收取租金的${formatPercentLabel(this.businessSettings.platformCommission?.sellerServiceFeeRatePercent || 0)}作为手续费。\n保险赔付方案：${this.selectedCompensationPlan.shortLabel}\n保险赔付服务费：${this.formatMoneyValue(this.compensationFeeYuan)} 元\n卖家发布租金：${this.formatMoneyValue(this.computedRentPrice)} 元\n预计到账租金：${this.formatMoneyValue(this.sellerIncomeRentYuan)} 元`,
        confirmText: this.isEditMode ? '确认保存' : '确认发布',
        cancelText: '再看看'
      })
      if (!confirmed) {
        return
      }

      this.submitting = true
      try {
        const uploadedBanMedia = await this.uploadBanMediaForSubmit()
        const uploadedListingImages = await this.uploadListingImagesForSubmit()
        const payload = this.buildPublishPayload(uploadedBanMedia, uploadedListingImages)
        const url = this.isEditMode ? `/api/my-listings/${this.editingListingId}` : '/api/listings'
        const method = this.isEditMode ? 'PUT' : 'POST'
        const data = await apiFetch(url, {
          method,
          body: JSON.stringify(payload)
        })
        showSuccessToast(this.isEditMode ? '保存成功' : '发布成功')
        this.$emit('published', data.id)
      } catch (error) {
        if (error.status === 401) {
          clearAuth()
          this.$emit('auth-expired', this.isEditMode ? '登录状态异常，请重新登录后编辑商品' : '登录状态异常，请重新登录后发布')
          return
        }
        showErrorToast(`${this.isEditMode ? '保存失败' : '发布失败'}：${error.message}`)
      } finally {
        this.submitting = false
      }
    }
  }
}
</script>

<style scoped>
.publish-wrap {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  padding: 16px 20px 84px;
  max-width: 900px;
  margin: 20px auto;
}

.error-box {
  margin-bottom: 12px;
  border: 1px solid #fecaca;
  background: #fff1f2;
  color: #b91c1c;
  border-radius: 8px;
  padding: 12px 14px;
}

.error-box p {
  margin: 0 0 8px;
}

.error-box ul {
  margin: 0;
  padding-left: 18px;
}

.publish-section {
  margin-top: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 16px 24px;
  background: #fafafa;
}

.publish-section h3 {
  margin: 0 0 12px;
  color: #111827;
}

.form-grid,
.auto-calc-grid {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.form-grid > label,
.auto-calc-grid > label,
.field-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 13px;
  color: #374151;
}

.form-grid > label > span,
.auto-calc-grid > label > span,
.field-group > span {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}

.form-grid input,
.form-grid .animated-select,
.form-grid textarea,
.auto-calc-grid input {
  width: 80%;
  max-width: 560px;
}

.form-grid input,
.form-grid textarea,
.auto-calc-grid input {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 9px 10px;
  font-size: 14px;
  background: #fff;
  box-sizing: border-box;
}

.form-grid textarea {
  resize: vertical;
}

.required-star {
  color: #dc2626;
  font-style: normal;
}

.inline-label-hint {
  margin-left: 8px;
  font-size: 12px;
  color: #6b7280;
  font-style: normal;
  font-weight: 400;
}

.inline-emphasis-danger {
  color: #dc2626;
}

.field-hint {
  display: block;
  font-size: 12px;
  color: #6b7280;
  font-style: normal;
  line-height: 1.5;
}

.inline-field-hint {
  width: 100%;
}

.warning-field-hint {
  margin-top: 4px;
  border: 1px solid #fcd34d;
  border-radius: 8px;
  padding: 8px 10px;
  background: #fffbeb;
  color: #92400e;
}

.error-field-hint {
  margin-top: 4px;
  color: #dc2626;
}

.field-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.inline-radio-row {
  flex-wrap: wrap;
}

.inline-row-title {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}

.radio-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.radio-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  font-size: 13px;
  padding: 6px 12px;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: #fff;
}

.time-range-input,
.region-select-row,
.hafu-input-wrap {
  width: 80%;
  max-width: 560px;
}

.time-range-input {
  display: flex;
  align-items: center;
  gap: 8px;
}

.time-range-input .animated-select {
  width: 100%;
}

.time-sep,
.hafu-unit {
  color: #6b7280;
  font-size: 13px;
}

.hafu-input-wrap {
  display: flex;
  align-items: center;
}

.hafu-input-wrap input {
  flex: 1;
}

.hafu-unit {
  padding: 0 10px;
  font-weight: 700;
}

.region-select-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.capsule-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.capsule-btn {
  padding: 8px 14px;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: #f9fafb;
  color: #4b5563;
  font-size: 14px;
  cursor: pointer;
}

.capsule-btn.active {
  border-color: #2563eb;
  background: #dbeafe;
  color: #1e40af;
  font-weight: 600;
}

.ban-upload-section {
  padding: 10px 14px;
  background: #fff8f0;
  border: 1px solid #fed7aa;
  border-radius: 8px;
}

.ban-upload-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.upload-input-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.upload-entry-row {
  margin-top: 6px;
  display: flex;
  align-items: center;
}

.upload-square {
  width: 96px;
  height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  background: #f8fafc;
  color: #94a3b8;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.4);
  transition: border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease, transform 0.2s ease;
}

.upload-square:hover {
  border-color: #2563eb;
  color: #2563eb;
  background: #eff6ff;
}

.upload-square-plus {
  font-size: 40px;
  line-height: 1;
  font-weight: 300;
}

.ban-video-row {
  margin-top: 8px;
}

.preview-video-card {
  width: 96px;
  min-height: 126px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: stretch;
  padding: 10px 8px 8px;
}

.preview-video-card::before {
  content: "VIDEO";
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  border-radius: 8px;
  background: linear-gradient(135deg, #e0f2fe, #dbeafe);
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
}

.video-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 30px;
  border-radius: 6px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
  margin-bottom: 6px;
}

.video-link:hover {
  background: #dbeafe;
  text-decoration: none;
}

.auto-calc-section {
  background: #fafafa;
  border: none;
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 18px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.pricing-main-section {
  background: #fafafa;
}

.items-card-section {
  background: #fafafa;
}

.readonly-label {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.readonly-input {
  background: #e5e7eb !important;
  border: 1px solid #d1d5db !important;
  color: #111827 !important;
  font-weight: 600;
  cursor: not-allowed;
}

.auto-calc-grid .readonly-input {
  background: #f8fafc !important;
  border-color: #d1d5db !important;
  color: #111827 !important;
}

.items-table {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  column-gap: 12px;
  row-gap: 10px;
  align-items: center;
}

.item-head-empty {
  height: 1px;
}

.item-col {
  display: flex;
  align-items: center;
  justify-content: center;
}

.col-label {
  font-size: 13px;
  color: #6b7280;
  font-weight: 600;
  text-align: center;
}

.item-name {
  font-size: 13px;
  color: #4b5563;
  font-weight: 500;
}

.item-qty-input {
  width: 100%;
  min-width: 86px;
  max-width: none;
  text-align: center;
  min-height: 36px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
  font-size: 14px;
  color: #111827;
  font-weight: 600;
}

.item-mode-select {
  width: 100%;
  min-width: 86px;
}

.item-mode-select :deep(.select-trigger) {
  min-height: 36px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
  font-size: 14px;
  color: #111827;
  font-weight: 600;
  text-align: center;
  justify-content: center;
}

.auto-total {
  width: 100%;
  min-width: 86px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
  font-size: 14px;
  color: #111827;
  font-weight: 600;
  min-height: 36px;
}

.items-total-row {
  display: contents;
}

.items-total-price,
.total-label {
  font-weight: 700;
}

.items-mobile-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.item-mobile-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 10px;
  background: #fff;
}

.item-mobile-name {
  font-size: 13px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 8px;
}

.item-mobile-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.item-mobile-field,
.item-mobile-total,
.item-mobile-summary {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.item-mobile-total {
  margin-top: 8px;
}

.item-mobile-label,
.item-mobile-summary-label {
  font-size: 11px;
  color: #6b7280;
  font-weight: 600;
}

.item-mobile-summary {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 10px;
  background: #fff;
}

.item-mobile-summary .auto-total {
  font-weight: 700;
}

.preview-grid {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.preview-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 4px;
  background: #fff;
}

.preview-image-wrap {
  position: relative;
}

.preview-media-trigger {
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  cursor: zoom-in;
}

.preview-card img {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: fill;
  border-radius: 6px;
}

.preview-sort-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  border: 1px solid rgba(255, 255, 255, 0.78);
  border-radius: 999px;
  padding: 0;
  background: rgba(17, 24, 39, 0.42);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.preview-sort-btn-left {
  left: 6px;
}

.preview-sort-btn-right {
  right: 6px;
}

.preview-remove-btn {
  width: 100%;
  margin-top: 6px;
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: 5px 0;
  background: #fff1f2;
  color: #b91c1c;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.media-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  background: rgba(17, 24, 39, 0.82);
}

.media-preview-close {
  position: absolute;
  top: 16px;
  right: 16px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: rgba(17, 24, 39, 0.72);
  color: #fff;
  border-radius: 999px;
  padding: 8px 12px;
  cursor: pointer;
}

.media-preview-image,
.media-preview-video {
  display: block;
  max-width: min(80vw, 880px);
  max-height: min(76vh, 880px);
  border-radius: 14px;
  object-fit: contain;
  background: #111827;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.3);
}

.media-preview-name {
  max-width: min(80vw, 880px);
  color: #e5e7eb;
  font-size: 13px;
  text-align: center;
  word-break: break-all;
}

.media-preview-fade-enter-active,
.media-preview-fade-leave-active {
  transition: opacity 0.2s ease;
}

.media-preview-fade-enter-from,
.media-preview-fade-leave-to {
  opacity: 0;
}

.compensation-plan-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.compensation-plan-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid #d1d5db;
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}

.compensation-plan-card input[type='radio'] {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.compensation-plan-card.active {
  border-color: #2563eb;
  background: #eff6ff;
  box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.12);
}

.compensation-plan-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  color: #111827;
}

.compensation-plan-header strong {
  font-size: 15px;
}

.compensation-plan-fee {
  font-size: 12px;
  color: #1d4ed8;
  font-weight: 700;
}

.compensation-plan-desc {
  margin: 0;
  color: #4b5563;
  font-size: 13px;
  line-height: 1.75;
}

.inline-remove-btn {
  width: auto;
  padding: 5px 12px;
}

.submit-row {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  display: flex;
  justify-content: center;
  padding: 12px 20px;
  background: #ffffff;
  border-top: 1px solid #e5e7eb;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.08);
}

.submit-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  width: 100%;
  max-width: 900px;
}

.submit-left {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  overflow: hidden;
}

.price-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.price-summary-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.price-summary::-webkit-scrollbar {
  display: none;
}

.summary-row,
.summary-total {
  display: flex;
  align-items: baseline;
  gap: 5px;
  font-size: 14px;
  white-space: nowrap;
}

.summary-row span {
  color: #6b7280;
}

.summary-row em {
  font-style: normal;
  color: #111827;
  font-weight: 700;
  font-size: 14px;
}

.summary-row--highlight em {
  color: #dc2626;
}

.agreements-row {
  display: flex;
  align-items: center;
  font-size: 14px;
}

.agreement-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: #4b5563;
}

.agreement-label input {
  margin: 0;
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.agreement-label a {
  color: #2563eb;
  text-decoration: none;
}

.agreement-label a:hover {
  text-decoration: underline;
}

.agreement-modal {
  background: #fff;
  border-radius: 12px;
  width: 90%;
  max-width: 700px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

.agreement-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
}

.agreement-modal-header h3 {
  margin: 0;
  font-size: 18px;
  color: #111827;
}

.agreement-close-btn {
  background: transparent;
  border: none;
  font-size: 20px;
  color: #6b7280;
  cursor: pointer;
  padding: 4px;
}

.agreement-modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.agreement-modal-body pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  color: #374151;
}

.agreement-modal-footer {
  padding: 16px 20px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
}

.agreement-confirm-btn {
  padding: 8px 24px;
  font-size: 14px;
}

.summary-total {
  color: #dc2626;
  font-weight: 700;
}

.summary-total strong {
  font-size: 20px;
}

.submit-btn {
  border: none;
  border-radius: 10px;
  background: #111827;
  color: #fff;
  padding: 12px 24px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 1200px) {
  .publish-wrap {
    margin: 12px auto;
    padding: 12px;
    padding-bottom: 12px;
    max-width: 100%;
  }

  .publish-section {
    padding: 12px;
  }

  .form-grid input,
  .form-grid .animated-select,
  .form-grid textarea,
  .auto-calc-grid input,
  .time-range-input,
  .region-select-row,
  .hafu-input-wrap {
    width: 100%;
    max-width: none;
  }

  .region-select-row {
    grid-template-columns: 1fr;
  }

  .preview-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .upload-square,
  .preview-video-card {
    width: 88px;
  }

  .upload-square {
    height: 88px;
  }

  .item-mobile-row {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .item-mobile-card {
    padding: 9px;
  }

  .item-mobile-name {
    margin-bottom: 6px;
  }

  .item-mobile-total {
    margin-top: 6px;
  }

  .item-mode-select,
  .item-mode-select :deep(.select-trigger),
  .item-qty-input,
  .item-mobile-total .auto-total,
  .item-mobile-summary .auto-total {
    min-height: 32px;
    font-size: 13px;
  }

  .submit-row {
    position: static;
    left: auto;
    right: auto;
    bottom: auto;
    z-index: auto;
    padding: 0;
    margin-top: 16px;
    background: transparent;
    border-top: none;
    box-shadow: none;
  }

  .submit-container {
    max-width: none;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .submit-left {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .price-summary {
    flex-direction: column;
    align-items: stretch;
    flex-wrap: nowrap;
    gap: 8px;
    padding: 12px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
  }

  .price-summary-row {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .summary-row,
  .summary-total {
    justify-content: space-between;
  }

  .submit-btn {
    width: 100%;
  }
}
</style>
