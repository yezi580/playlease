<template>
  <section class="profile-center">
      <aside class="profile-sidebar">
        <nav class="profile-nav" aria-label="个人中心导航">
          <!-- 移动端向左切换按钮 -->
          <button 
            v-if="isMobileView" 
            class="profile-nav-arrow profile-nav-arrow--left" 
            :class="{ 'is-invisible': mobileNavPage === 0 }"
            @click="switchNavPage(0)"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
  
          <div class="profile-nav-items-wrapper">
          <Transition :name="navTransitionName" mode="out-in">
            <div :key="mobileNavPage" class="profile-nav-items-group">
              <template v-for="(section, index) in visibleSections" :key="section.key">
                <button
                  v-show="!isMobileView || (mobileNavPage === 0 ? index < 4 : index >= 4)"
                  type="button"
                  class="profile-nav-item"
                  :class="{ active: activeSection === section.key }"
                  @click="switchSection(section.key)"
                >
                  <span class="profile-nav-label-wrap">
                    <span class="profile-nav-label">{{ section.label }}</span>
                    <span v-if="hasSectionUnreadDot(section.key)" class="profile-nav-dot" aria-hidden="true"></span>
                  </span>
                </button>
              </template>
      
              <div v-if="isLoggedIn && !isMobileView" key="divider" class="profile-nav-divider"></div>
              <button
                v-if="isLoggedIn"
                v-show="!isMobileView || mobileNavPage === 1"
                key="logout"
                type="button"
                class="profile-nav-item profile-nav-logout"
                @click="handleLogout"
              >
                <span class="profile-nav-label-wrap">
                  <span class="profile-nav-label">退出登录</span>
                </span>
              </button>
            </div>
          </Transition>
        </div>
  
          <!-- 移动端向右切换按钮 -->
          <button 
            v-if="isMobileView" 
            class="profile-nav-arrow profile-nav-arrow--right" 
            :class="{ 'is-invisible': mobileNavPage === 1 }"
            @click="switchNavPage(1)"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
      </nav>
    </aside>

    <div class="profile-content">
      <Transition name="profile-section-fade" mode="out-in">
      <section v-if="activeSection === 'orders'" :key="'orders'" class="profile-panel profile-panel--orders">
        <div class="profile-panel-card">
          <div class="profile-order-toolbar">
            <div class="order-filter-tabs" aria-label="我买到的状态筛选">
              <button
                v-for="tab in visibleOrderStatusTabs"
                :key="tab.key"
                type="button"
                class="order-filter-tab"
                :class="{ active: orderFilterStatus === tab.key }"
                @click="changeOrderStatus(tab.key)"
              >
                <span>{{ tab.label }}</span>
                <span class="order-filter-count">{{ getOrderCount(tab.key) }}</span>
              </button>
            </div>
          </div>

          <Transition name="profile-section-fade" mode="out-in">
            <div :key="orderFilterStatus + '-' + orderPage" class="profile-tab-content">
              <div v-if="orderLoading" class="profile-empty">正在加载订单列表...</div>
              <div v-else-if="orderError" class="profile-empty profile-error">{{ orderError }}</div>
          <div v-else-if="!orderList.length" class="profile-empty">当前筛选条件下暂无订单。</div>

          <div v-else class="order-list">
            <article v-for="order in orderList" :key="order.id" class="order-item" @click="handleOrderCardClick($event, order)">
              <div class="order-cover">
                <img v-if="order.cover_image" :src="order.cover_image" :alt="order.listing_title" />
                <div v-else class="order-cover-placeholder">订单</div>
              </div>

              <div class="order-main">
                <div class="order-header">
                  <div>
                    <h4>{{ order.listing_title }}</h4>
                    <p class="order-subtitle">
                      {{ orderCounterpartyLabel }}：{{ getOrderCounterpartyName(order) }}
                    </p>
                  </div>
                  <div class="order-status-wrap">
                    <span class="order-status" :class="`status-${order.status}`">{{ order.status_text }}</span>
                    <span v-if="order.status === 'pending_payment'" class="order-status-countdown">
                      {{ formatPendingCountdown(order.created_at) }}
                    </span>
                  </div>
                </div>

                <div class="order-meta-grid order-meta-grid--orders">
                  <p class="copy-inline"><span>商品编号</span><span>{{ order.listing_no || '-' }}</span><CopyTextButton :text="order.listing_no || ''" label="商品编号" /></p>
                  <p><span>订单编号</span>{{ order.order_no }}</p>
                  <p><span>租用天数</span>{{ order.rent_days || 0 }} 天</p>
                  <p><span>下单时间</span>{{ formatOrderDate(order.created_at) }}</p>
                  <p><span>租金</span>￥{{ formatMoney(order.amount) }}</p>
                  <p><span>押金</span>￥{{ formatMoney(order.deposit_amount) }}</p>
                </div>
              </div>

              <div class="order-actions">
                <button
                  v-for="action in getOrderActions(order)"
                  :key="action.key"
                  type="button"
                  class="order-action-btn"
                  :class="[{ 'order-action-btn--detail': action.key === 'detail' }, action.tone]"
                  @click.stop="handleOrderAction(action, order)"
                >
                  {{ action.label }}
                </button>
              </div>
            </article>
          </div>

          <div v-if="orderTotalPages > 1" class="order-pagination">
            <button type="button" class="order-page-btn" :disabled="orderPage <= 1 || orderLoading" @click="goToOrderPage(orderPage - 1)">
              上一页
            </button>
            <button
              v-for="page in visibleOrderPages"
              :key="page"
              type="button"
              class="order-page-btn"
              :class="{ active: page === orderPage }"
              :disabled="orderLoading"
              @click="goToOrderPage(page)"
            >
              {{ page }}
            </button>
            <button type="button" class="order-page-btn" :disabled="orderPage >= orderTotalPages || orderLoading" @click="goToOrderPage(orderPage + 1)">
              下一页
            </button>
            <span class="order-page-summary">第 {{ orderPage }} / {{ orderTotalPages }} 页，共 {{ orderTotal }} 条</span>
          </div>
            </div>
          </Transition>
        </div>
      </section>

      <section v-else-if="activeSection === 'messages'" :key="'messages'" class="profile-panel">
        <ProfileMessagesPanel
          :total-unread-count="totalUnreadCount"
          :loading="messageLoading"
          :error="messageError"
          :message-list="messageList"
          @refresh="loadMessageData"
          @open-item="openMessageItem"
        />
      </section>

      <section v-else-if="activeSection === 'published'" :key="'published'" class="profile-panel profile-panel--published">
        <div class="profile-panel-card">
          <div class="profile-order-toolbar">
            <div class="order-filter-tabs" aria-label="我发布的状态筛选">
              <button
                v-for="tab in visibleMyListingStatusTabs"
                :key="tab.key"
                type="button"
                class="order-filter-tab"
                :class="{ active: myListingFilterStatus === tab.key }"
                @click="changeMyListingStatus(tab.key)"
              >
                <span>{{ tab.label }}</span>
                <span class="order-filter-count">{{ getMyListingCount(tab.key) }}</span>
              </button>
            </div>
          </div>

          <Transition name="profile-section-fade" mode="out-in">
            <div :key="myListingFilterStatus + '-' + myListingsPage" class="profile-tab-content">
              <div v-if="myListingsLoading" class="profile-empty">正在加载内容...</div>
              <div v-else-if="myListingsError" class="profile-empty profile-error">{{ myListingsError }}</div>
          <div v-else-if="!myListingsList.length" class="profile-empty">{{ myListingsEmptyText }}</div>

          <div v-else class="listing-list">
            <article
              v-for="item in myListingsList"
              :key="`${item.record_type}-${item.id}`"
              :class="item.record_type === 'seller_order' ? 'order-item' : 'listing-item'"
            >
              <template v-if="item.record_type === 'seller_order'">
                <div class="order-cover" @click="handlePublishedRecordClick($event, item)">
                  <img v-if="item.cover_image" :src="item.cover_image" :alt="item.listing_title" />
                  <div v-else class="order-cover-placeholder">订单</div>
                </div>

                <div class="order-main" @click="handlePublishedRecordClick($event, item)">
                  <div class="order-header">
                    <div>
                      <h4>{{ item.listing_title }}</h4>
                      <p class="order-subtitle">
                        买家：{{ item.buyer_name || '未知买家' }}
                      </p>
                    </div>
                    <div class="order-status-wrap">
                      <span class="order-status" :class="`status-${item.status}`">{{ item.status_text }}</span>
                      <span v-if="false" class="order-status-countdown">
                        {{ formatPendingCountdown(item.created_at) }}
                      </span>
                    </div>
                  </div>

                  <div class="order-meta-grid">
                    <p class="copy-inline"><span>商品编号</span><span>{{ item.listing_no || '-' }}</span><CopyTextButton :text="item.listing_no || ''" label="商品编号" /></p>
                    <p><span>订单编号</span>{{ item.order_no }}</p>
                    <p><span>租用天数</span>{{ item.rent_days || 0 }} 天</p>
                    <p><span>下单时间</span>{{ formatOrderDate(item.created_at) }}</p>
                    <p><span>发布租金</span>￥{{ formatMoney(item.seller_rent_amount) }}</p>
                    <p><span>预计到帐租金</span>￥{{ formatMoney(getSellerIncomeRent(item)) }}</p>
                    <p><span>押金</span>￥{{ formatMoney(item.deposit_amount) }}</p>
                  </div>
                </div>

                <div class="order-actions">
                  <button
                    v-for="action in getPublishedOrderActions(item)"
                    :key="action.key"
                    type="button"
                    class="order-action-btn"
                    :class="[{ 'order-action-btn--detail': action.key === 'detail' }, action.tone]"
                    @click.stop="handlePublishedOrderAction(action, item)"
                  >
                    {{ action.label }}
                  </button>
                </div>
              </template>

              <template v-else>
                <div class="listing-cover" @click="handlePublishedRecordClick($event, item)">
                  <img v-if="item.cover_image" :src="item.cover_image" :alt="item.listing_title" />
                  <div v-else class="order-cover-placeholder">商品</div>
                </div>

                <div class="listing-main" @click="handlePublishedRecordClick($event, item)">
                  <div class="order-header">
                    <div>
                      <h4>{{ item.listing_title }}</h4>
                    </div>
                    <span class="listing-status" :class="`status-${item.listing_status}`">
                      {{ item.listing_status_text }}
                    </span>
                  </div>

                  <div class="listing-meta-grid">
                    <p class="copy-inline"><span>商品编号</span><span>#{{ item.listing_no || item.id }}</span><CopyTextButton :text="item.listing_no || item.id || ''" label="商品编号" /></p>
                    <p><span>租用天数</span>{{ item.rent_days || 0 }} 天</p>
                    <p><span>发布时间</span>{{ formatOrderDate(item.published_at || item.created_at) }}</p>
                    <p><span>段位</span>{{ item.rank_name || '未设置段位' }}</p>
                    <p><span>租金</span><strong>￥{{ formatMoney(item.rent_price) }}</strong></p>
                    <p><span>押金</span><strong>￥{{ formatMoney(item.deposit) }}</strong></p>
                  </div>
                </div>

                <div class="listing-actions-col">
                  <button
                    v-for="action in getMyListingActions(item)"
                    :key="action.key"
                    type="button"
                    class="order-action-btn"
                    :class="[{ 'order-action-btn--detail': action.key === 'detail' }, action.tone]"
                    @click.stop="handleMyListingAction(action, item)"
                  >
                    {{ action.label }}
                  </button>
                </div>
              </template>
            </article>
          </div>

          <div v-if="myListingsTotalPages > 1" class="order-pagination">
            <button type="button" class="order-page-btn" :disabled="myListingsPage <= 1 || myListingsLoading" @click="goToMyListingPage(myListingsPage - 1)">
              上一页
            </button>
            <button
              v-for="page in visibleMyListingPages"
              :key="page"
              type="button"
              class="order-page-btn"
              :class="{ active: page === myListingsPage }"
              :disabled="myListingsLoading"
              @click="goToMyListingPage(page)"
            >
              {{ page }}
            </button>
            <button type="button" class="order-page-btn" :disabled="myListingsPage >= myListingsTotalPages || myListingsLoading" @click="goToMyListingPage(myListingsPage + 1)">
              下一页
            </button>
            <span class="order-page-summary">第 {{ myListingsPage }} / {{ myListingsTotalPages }} 页，共 {{ myListingsTotal }} 条</span>
          </div>
            </div>
          </Transition>
        </div>
      </section>

      <section v-else-if="activeSection === 'verify'" :key="'verify'" class="profile-panel">
        <ProfileVerifyPanel
          :is-logged-in="isLoggedIn"
          :loading="kycLoading"
          :error="kycError"
          :kyc-status="kycStatus"
          :real-name-masked="kycRealNameMasked"
          :id-card-masked="kycIdCardMasked"
          :submitted-at="kycSubmittedAt"
          :verified-at="kycVerifiedAt"
          :failure-reason="kycFailureReason"
          :can-submit="canSubmitKyc"
          :submitting="kycSubmitting"
          :syncing="kycSyncing"
          :verify-url="kycVerifyUrl"
          :kyc-form="kycForm"
          :format-order-date="formatOrderDate"
          @login="triggerLogin"
          @update:kyc-form="handleKycFormUpdate"
          @submit="submitKyc"
          @continue="continueKycVerification"
          @sync-result="syncKycResult({}, { showToast: true })"
        />
      </section>

      <section v-else-if="activeSection === 'wallet'" :key="'wallet'" class="profile-panel">
        <ProfileWalletPanel
          :is-logged-in="isLoggedIn"
          :loading="walletLoading"
          :error="walletError"
          :withdraw-submitting="walletWithdrawSubmitting"
          :can-apply-withdraw="canApplyWithdraw"
          :balance="walletBalance"
          :frozen-balance="walletFrozenBalance"
          :withdrawable-balance="walletWithdrawableBalance"
          :ledger="walletLedger"
          :withdraw-list="walletWithdrawList"
          :withdraw-form="withdrawForm"
          :format-money="formatMoney"
          :format-order-date="formatOrderDate"
          @login="triggerLogin"
          @refresh="loadWalletData"
          @update:withdraw-form="handleWithdrawFormUpdate"
          @submit="submitWithdraw"
        />
      </section>

      <section v-else-if="activeSection === 'invite'" :key="'invite'" class="profile-panel profile-panel--invite">
        <div class="profile-panel-card">
          <div v-if="inviteLoading" class="profile-empty">正在加载邀新数据...</div>
          <div v-else-if="inviteError" class="profile-empty profile-error">{{ inviteError }}</div>
          <div v-else class="invite-panel">
            <div class="invite-summary-grid">
              <article class="invite-summary-card">
                <span class="invite-summary-label">我的邀请码</span>
                <strong class="invite-summary-code">{{ ownInviteCode || '--' }}</strong>
              </article>

              <article class="invite-summary-card invite-summary-card--bind">
                <span class="invite-summary-label">我填入的邀请码</span>
                <template v-if="boundInviteCode">
                  <strong class="invite-summary-code">{{ boundInviteCode }}</strong>
                </template>
                <template v-else>
                  <div class="invite-bind-row">
                    <input
                      v-model.trim="inviteCodeInput"
                      type="text"
                      maxlength="16"
                      class="invite-bind-input"
                      placeholder="仅可绑定一次，绑定后不可修改"
                      :disabled="inviteSubmitting"
                      @input="inviteCodeInput = String(inviteCodeInput || '').toUpperCase().replace(/[^A-Z0-9]/g, '')"
                    />
                    <button
                      type="button"
                      class="order-action-btn primary"
                      :disabled="inviteSubmitting"
                      @click="submitInviteCode"
                    >
                      {{ inviteSubmitting ? '提交中...' : '确认绑定' }}
                    </button>
                  </div>
                </template>
              </article>

              <article class="invite-summary-card invite-summary-card--full">
                <div class="invite-order-section-header invite-summary-card-header">
                  <div class="invite-summary-title tooltip-wrap">
                    <h4>累计返现</h4>
                    <i class="help-icon">?</i>
                    <span class="tooltip-text">被邀请人发布的商品成交后，邀请人可获得<br>该订单中平台向买家收取服务费的30%返现</span>
                  </div>
                </div>
                <strong>￥{{ formatMoney(invitedRewardTotal) }}</strong>
              </article>
            </div>

            <div class="invite-order-section">
              <div class="invite-order-section-header">
                <h4>我赚的</h4>
                <span>{{ inviterOrderList.length }} 条</span>
              </div>
              <div v-if="!inviterOrderList.length" class="invite-order-list">
                <article class="invite-order-card invite-order-card--empty">
                  <div class="profile-empty">暂时还没有通过我的邀请码产生返现的订单</div>
                </article>
              </div>
              <div v-else class="invite-order-list">
                <article v-for="order in inviterOrderList" :key="`inviter-${order.order_id}`" class="invite-order-card">
                  <div>
                    <h4>{{ order.listing_title || '订单' }}</h4>
                    <p>订单编号：{{ order.order_no || '-' }}</p>
                    <p>出号用户：{{ order.invitee_username || order.seller_name || '未知用户' }}</p>
                    <p>订单完成：{{ formatOrderDate(order.finished_at) }}</p>
                  </div>
                  <div class="invite-order-amounts">
                    <strong>返现 ￥{{ formatMoney(order.reward_amount) }}</strong>
                    <span>到账时间 {{ formatOrderDate(order.awarded_at) }}</span>
                  </div>
                </article>
              </div>
            </div>

            <div class="invite-order-section">
              <div class="invite-order-section-header">
                <h4>TA赚的</h4>
                <span>{{ inviteeOrderList.length }} 条</span>
              </div>
              <div v-if="!boundInviteCode" class="invite-order-list">
                <article class="invite-order-card invite-order-card--empty">
                  <div class="profile-empty">当前还未绑定邀请码</div>
                </article>
              </div>
              <div v-else-if="!inviteeOrderList.length" class="invite-order-list">
                <article class="invite-order-card invite-order-card--empty">
                  <div class="profile-empty">当前还没有因我出号而给邀请人产生返现的订单</div>
                </article>
              </div>
              <div v-else class="invite-order-list">
                <article v-for="order in inviteeOrderList" :key="`invitee-${order.order_id}`" class="invite-order-card">
                  <div>
                    <h4>{{ order.listing_title || '订单' }}</h4>
                    <p>订单编号：{{ order.order_no || '-' }}</p>
                    <p>邀请人：{{ order.inviter_username || inviterInfo?.username || '未知用户' }}</p>
                    <p>订单完成：{{ formatOrderDate(order.finished_at) }}</p>
                  </div>
                  <div class="invite-order-amounts">
                    <strong>邀请人返现 ￥{{ formatMoney(order.reward_amount) }}</strong>
                    <span>到账时间 {{ formatOrderDate(order.awarded_at) }}</span>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-else-if="activeSection === 'feedback'" :key="'feedback'" class="profile-panel profile-panel--feedback">
        <div class="profile-panel-card">
          <article class="feedback-form-card">
            <label class="feedback-field">
              <span>问题类别</span>
              <select
                v-model="feedbackForm.category"
                class="feedback-select"
                :style="feedbackSelectStyle"
                :disabled="feedbackSubmitting"
              >
                <option v-for="item in feedbackCategories" :key="item.value" :value="item.value">
                  {{ item.label }}
                </option>
              </select>
            </label>

            <label class="feedback-field">
              <span>问题描述</span>
              <textarea
                v-model.trim="feedbackForm.description"
                class="feedback-textarea"
                rows="6"
                maxlength="1000"
                :disabled="feedbackSubmitting"
                placeholder="请输入问题描述"
              ></textarea>
            </label>

            <div class="feedback-form-footer">
              <span class="feedback-count">{{ String(feedbackForm.description || '').length }}/1000</span>
              <button type="button" class="order-action-btn primary" :disabled="feedbackSubmitting" @click="submitFeedback">
                {{ feedbackSubmitting ? '提交中...' : '提交反馈' }}
              </button>
            </div>
          </article>
        </div>
      </section>

      <section v-else :key="activeSection" class="profile-panel">
        <div class="profile-placeholder-card">
          <h4>{{ currentSection.label }}</h4>
          <p>{{ getPlaceholderText(activeSection) }}</p>
          <button type="button" class="profile-login-btn" @click="triggerLogin">立即登录</button>
        </div>
      </section>
      </Transition>

    </div>

    <PaymentModal
      v-if="selectedPaymentOrder"
      :visible="showPaymentModal"
      :order-id="selectedPaymentOrder?.id"
      :order-title="selectedPaymentOrder?.listing_title"
      :cover-image="selectedPaymentOrder?.cover_image"
      :listing-no="selectedPaymentOrder?.listing_no || ''"
      :listing-id="selectedPaymentOrder?.listing_id || ''"
      :amount="selectedPaymentOrder?.amount"
      :deposit="selectedPaymentOrder?.deposit_amount"
      :total="selectedPaymentOrder?.total_amount"
      :rent-days="selectedPaymentOrder?.rent_days"
      @close="handlePaymentModalClose"
      @success="handleOrderPaymentSuccess"
    />
    <ConversationPanel
      :visible="showConversationPanel"
      :order-id="selectedConversationOrderId"
      :user-role="selectedConversationUserRole"
      @close="handleConversationPanelClose"
    />
  </section>
</template>

<script>
import { apiFetch } from '../utils/api.js'
import { calculateSellerIncomeRent, formatMoneyFixed } from '../utils/money'
import {
  calculateCompensationFeeAmount,
  fetchBusinessSettings,
  getCachedBusinessSettings,
  getInviteRewardRuleText,
  getPendingPaymentTimeoutMinutes
} from '../utils/businessSettings.js'
import {
  createFeedbackCategories,
  createFeedbackForm,
  createKycForm,
  createMyListingsStatsData,
  createMyListingStatusTabs,
  createOrderStatsData,
  createOrderStatusTabs,
  createProfileSections,
  createWithdrawForm,
  formatOrderDateTime,
  formatPendingCountdown,
  normalizeKycStatus
} from '../utils/profileCenter.js'
import { showErrorToast, showSuccessToast, showWarningToast } from '../utils/toast.js'
import { showConfirm } from '../utils/confirm.js'
import ConversationPanel from './ConversationPanel.vue'
import PaymentModal from './PaymentModal.vue'
import CopyTextButton from './CopyTextButton.vue'
import ProfileMessagesPanel from './profile/ProfileMessagesPanel.vue'
import ProfileVerifyPanel from './profile/ProfileVerifyPanel.vue'
import ProfileWalletPanel from './profile/ProfileWalletPanel.vue'

export default {
  name: 'ProfileCenter',
  components: {
    ConversationPanel,
    PaymentModal,
    CopyTextButton,
    ProfileMessagesPanel,
    ProfileVerifyPanel,
    ProfileWalletPanel
  },
  emits: ['view-listing-detail', 'edit-listing', 'view-order-detail', 'login', 'unread-change', 'logout', 'payment-success'],
  props: {
    isLoggedIn: {
      type: Boolean,
      default: false
    },
    currentUser: {
      type: String,
      default: ''
    },
    currentUserRole: {
      type: String,
      default: ''
    },
    unreadMessageCount: {
      type: Number,
      default: 0
    },
    defaultSection: {
      type: String,
      default: 'published'
    },
    defaultOrderRole: {
      type: String,
      default: ''
    },
    defaultOrderFilter: {
      type: String,
      default: ''
    },
    defaultListingFilter: {
      type: String,
      default: ''
    }
  },
  data() {
    return {
      mobileNavPage: 0,
      mobileNavLastSelected: {
        0: 'published',
        1: 'invite'
      },
      navTransitionName: 'profile-nav-slide-right',
      isMobileView: false,
      sections: createProfileSections(),
      feedbackCategories: createFeedbackCategories(),
      feedbackForm: createFeedbackForm(),
      feedbackSubmitting: false,
      orderStatusTabs: createOrderStatusTabs(),
      myListingStatusTabs: createMyListingStatusTabs(),
      activeSection: 'published',
      activeOrderRole: 'buyer',
      orderFilterStatus: 'all',
      orderStatsData: createOrderStatsData(),
      orderList: [],
      orderLoading: false,
      orderError: '',
      orderPage: 1,
      orderPageSize: 5,
      orderTotal: 0,
      countdownNowTs: Date.now(),
      countdownTimer: null,
      myListingFilterStatus: 'all',
      myListingsStatsData: createMyListingsStatsData(),
      myListingsList: [],
      myListingsLoading: false,
      myListingsError: '',
      myListingsPage: 1,
      myListingsPageSize: 6,
      myListingsTotal: 0,
      conversationList: [],
      conversationPage: 1,
      conversationPageSize: 20,
      notificationList: [],
      notificationPage: 1,
      notificationPageSize: 20,
      notificationTotal: 0,
      conversationUnreadTotal: 0,
      notificationUnreadTotal: 0,
      totalUnreadCount: 0,
      messageLoading: false,
      messageError: '',
      showConversationPanel: false,
      selectedConversationOrderId: 0,
      selectedConversationUserRole: 'buyer',
      showPaymentModal: false,
      selectedPaymentOrder: null,
      walletBalance: 0,
      walletFrozenBalance: 0,
      walletWithdrawableBalance: 0,
      walletLedger: [],
      walletWithdrawList: [],
      walletLoading: false,
      walletWithdrawSubmitting: false,
      walletError: '',
      kycLoading: false,
      kycSubmitting: false,
      kycSyncing: false,
      kycError: '',
      kycStatus: 'unverified',
      kycRealNameMasked: '',
      kycIdCardMasked: '',
      kycVerifiedAt: null,
      kycSubmittedAt: null,
      kycFailureReason: '',
      kycCompletedAt: null,
      kycOrderNo: '',
      kycBizToken: '',
      kycVerifyUrl: '',
      kycRuleId: '',
      kycForm: createKycForm(),
      inviteLoading: false,
      inviteSubmitting: false,
      inviteError: '',
      inviteCodeInput: '',
      ownInviteCode: '',
      boundInviteCode: '',
      inviterInfo: null,
      invitedRewardTotal: 0,
      contributedRewardTotal: 0,
      inviterOrderList: [],
      inviteeOrderList: [],
      withdrawForm: createWithdrawForm(),
      businessSettings: getCachedBusinessSettings()
    }
  },
  computed: {
    feedbackSelectStyle() {
      const maxLabelLength = this.feedbackCategories.reduce((max, item) => {
        return Math.max(max, String(item?.label || '').trim().length)
      }, 0)
      return {
        width: `calc(${Math.max(8, maxLabelLength * 2)}ch + 40px)`,
        maxWidth: '100%'
      }
    },
    canAccessFeedback() {
      return this.isLoggedIn && String(this.currentUserRole || '').trim() !== 'admin'
    },
    visibleSections() {
      return this.canAccessFeedback
        ? [...this.sections, { key: 'feedback', label: '问题反馈' }]
        : this.sections
    },
    currentSection() {
      return this.visibleSections.find((item) => item.key === this.activeSection) || this.visibleSections[0]
    },
    orderCounterpartyLabel() {
      return '卖家'
    },
    inviteRewardRuleText() {
      return getInviteRewardRuleText(this.businessSettings)
    },
    orderTotalPages() {
      const total = Number(this.orderTotal || 0)
      return Math.max(1, Math.ceil(total / this.orderPageSize))
    },
    myListingsTotalPages() {
      const total = Number(this.myListingsTotal || 0)
      return Math.max(1, Math.ceil(total / this.myListingsPageSize))
    },
    visibleOrderPages() {
      return this.buildVisiblePages(this.orderPage, this.orderTotalPages)
    },
    visibleMyListingPages() {
      return this.buildVisiblePages(this.myListingsPage, this.myListingsTotalPages)
    },
    visibleOrderStatusTabs() {
      return this.orderStatusTabs.filter((tab) => this.shouldShowStatusTab(tab.key, this.orderStatsData))
    },
    visibleMyListingStatusTabs() {
      return this.myListingStatusTabs.filter((tab) => this.shouldShowStatusTab(tab.key, this.myListingsStatsData))
    },
    myListingsEmptyText() {
      return this.isSellerOrderStatus(this.myListingFilterStatus)
        ? '当前状态下暂无我卖出的订单。'
        : '当前状态下暂无已发布商品。'
    },
    hasUnreadMessages() {
      return Number(this.totalUnreadCount || this.unreadMessageCount || 0) > 0
    },
    canSubmitKyc() {
      return this.kycStatus === 'unverified' || this.kycStatus === 'failed'
    },
    canApplyWithdraw() {
      return this.isLoggedIn
    },
    messageList() {
      const conversationItems = this.conversationList.map((item) => ({
        ...item,
        item_type: 'conversation',
        created_at: item.last_message_at || item.updated_at
      }))
      const notificationItems = this.notificationList.map((item) => ({
        ...item,
        item_type: item.item_type || 'notification'
      }))

      return [...conversationItems, ...notificationItems]
        .sort((a, b) => {
          const unreadA = Number(a.unread_count || 0) > 0 ? 1 : 0
          const unreadB = Number(b.unread_count || 0) > 0 ? 1 : 0
          if (unreadA !== unreadB) {
            return unreadB - unreadA
          }
          const timeA = new Date(a.created_at || a.updated_at || 0).getTime() || 0
          const timeB = new Date(b.created_at || b.updated_at || 0).getTime() || 0
          return timeB - timeA
        })
    }
  },
  watch: {
    unreadMessageCount: {
      immediate: true,
      handler(count, previousCount) {
        const normalizedCount = Math.max(0, Number(count || 0))
        const normalizedPreviousCount = Math.max(0, Number(previousCount || 0))
        this.totalUnreadCount = normalizedCount

        if (normalizedCount === normalizedPreviousCount) return
        if (!this.isLoggedIn || this.activeSection !== 'messages' || this.messageLoading) return
        if (normalizedCount === this.computeLocalUnreadCount()) return

        this.loadMessageData({ silent: true })
      }
    }
  },
  created() {
    if (this.defaultSection) {
      this.activeSection = this.isSupportedSection(this.defaultSection) ? this.defaultSection : 'published'
    }
    if (this.defaultOrderRole) {
      this.activeOrderRole = 'buyer'
    }
    if (this.defaultOrderFilter) {
      this.orderFilterStatus = this.normalizeOrderFilter(this.defaultOrderFilter)
    }
    if (this.defaultListingFilter) {
      this.myListingFilterStatus = this.normalizeListingFilter(this.defaultListingFilter)
    }
    this.rememberMobileSection(this.activeSection)
  },
  mounted() {
    this.checkMobileView()
    window.addEventListener('resize', this.checkMobileView)
    this.startCountdownTicker()
    void this.loadBusinessSettings()
    if (!this.isLoggedIn) return
    if (this.activeSection === 'orders') {
      this.loadOrderData()
    } else if (this.activeSection === 'messages') {
      this.loadMessageData()
    } else if (this.activeSection === 'published') {
      this.loadMyListingsData()
    } else if (this.activeSection === 'wallet') {
      this.loadWalletData()
    } else if (this.activeSection === 'invite') {
      this.loadInviteData()
    } else if (this.activeSection === 'verify') {
      this.loadKycData()
    }
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.checkMobileView)
    this.stopCountdownTicker()
  },
  methods: {
    checkMobileView() {
      this.isMobileView = window.innerWidth <= 960
      if (this.isMobileView) {
        this.syncMobileNavStateWithActiveSection()
      }
    },
    switchNavPage(newPage) {
      if (this.mobileNavPage === newPage) return
      const nextSectionKey = this.resolveMobileSectionForPage(newPage)
      // 根据目标页码判断滑动方向：向右翻（页码变大）时新内容从右侧进入，向左翻时从左侧进入
      this.navTransitionName = newPage > this.mobileNavPage ? 'profile-nav-slide-right' : 'profile-nav-slide-left'
      if (nextSectionKey && nextSectionKey !== this.activeSection) {
        this.switchSection(nextSectionKey, { syncMobilePage: false })
      }
      this.mobileNavPage = newPage
    },
    getMobileNavSections(page) {
      return this.visibleSections.filter((_, index) => (page === 0 ? index < 4 : index >= 4))
    },
    getMobileNavPageForSection(sectionKey) {
      const sectionIndex = this.visibleSections.findIndex((item) => item.key === sectionKey)
      if (sectionIndex === -1) {
        return 0
      }
      return sectionIndex < 4 ? 0 : 1
    },
    getDefaultMobileSection(page) {
      return this.getMobileNavSections(page)[0]?.key || this.visibleSections[0]?.key || 'published'
    },
    rememberMobileSection(sectionKey) {
      const page = this.getMobileNavPageForSection(sectionKey)
      if (!this.getMobileNavSections(page).some((item) => item.key === sectionKey)) {
        return
      }
      this.mobileNavLastSelected = {
        ...this.mobileNavLastSelected,
        [page]: sectionKey
      }
    },
    resolveMobileSectionForPage(page) {
      const rememberedSectionKey = String(this.mobileNavLastSelected?.[page] || '').trim()
      if (this.getMobileNavSections(page).some((item) => item.key === rememberedSectionKey)) {
        return rememberedSectionKey
      }
      return this.getDefaultMobileSection(page)
    },
    syncMobileNavStateWithActiveSection() {
      this.rememberMobileSection(this.activeSection)
      this.mobileNavPage = this.getMobileNavPageForSection(this.activeSection)
    },
    async loadBusinessSettings() {
      this.businessSettings = await fetchBusinessSettings()
    },
    startCountdownTicker() {
      this.stopCountdownTicker()
      this.countdownTimer = window.setInterval(() => {
        this.countdownNowTs = Date.now()
      }, 1000)
    },
    stopCountdownTicker() {
      if (this.countdownTimer) {
        window.clearInterval(this.countdownTimer)
        this.countdownTimer = null
      }
    },
    buildVisiblePages(current, total) {
      if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1)
      if (current <= 3) return [1, 2, 3, 4, total]
      if (current >= total - 2) return [1, total - 3, total - 2, total - 1, total]
      return [1, current - 1, current, current + 1, total]
    },
    switchSection(sectionKey, options = {}) {
      const normalizedSectionKey = String(sectionKey || '').trim()
      if (!normalizedSectionKey) return

      this.activeSection = normalizedSectionKey
      this.rememberMobileSection(normalizedSectionKey)
      if (this.isMobileView && options.syncMobilePage !== false) {
        const targetPage = this.getMobileNavPageForSection(normalizedSectionKey)
        if (targetPage !== this.mobileNavPage) {
          this.navTransitionName = targetPage > this.mobileNavPage ? 'profile-nav-slide-right' : 'profile-nav-slide-left'
        }
        this.mobileNavPage = targetPage
      }
      if (!this.isLoggedIn) return
      if (normalizedSectionKey === 'orders') {
        this.loadOrderData()
      } else if (normalizedSectionKey === 'messages') {
        this.loadMessageData()
      } else if (normalizedSectionKey === 'published') {
        this.loadMyListingsData()
      } else if (normalizedSectionKey === 'wallet') {
        this.loadWalletData()
      } else if (normalizedSectionKey === 'invite') {
        this.loadInviteData()
      } else if (normalizedSectionKey === 'verify') {
        this.loadKycData()
      }
    },
    isSupportedSection(sectionKey) {
      const normalized = String(sectionKey || '').trim()
      return [...this.visibleSections.map((item) => item.key), 'verify'].includes(normalized)
    },
    async submitFeedback() {
      const category = String(this.feedbackForm.category || '').trim()
      const description = String(this.feedbackForm.description || '').trim()

      if (!category) {
        showWarningToast('请先选择问题类别')
        return
      }
      if (description.length < 5) {
        showWarningToast('问题描述至少填写 5 个字')
        return
      }

      this.feedbackSubmitting = true
      try {
        const data = await apiFetch('/api/feedback', {
          method: 'POST',
          body: JSON.stringify({
            category,
            description
          })
        })
        this.feedbackForm = createFeedbackForm()
        showSuccessToast(data.message || '反馈已提交')
      } catch (error) {
        showErrorToast(error.message || '提交反馈失败')
      } finally {
        this.feedbackSubmitting = false
      }
    },
    changeOrderStatus(statusKey) {
      if (statusKey === this.orderFilterStatus) return
      this.orderFilterStatus = this.normalizeOrderFilter(statusKey)
      this.orderPage = 1
      this.fetchOrderList()
    },
    changeMyListingStatus(statusKey) {
      if (statusKey === this.myListingFilterStatus) return
      this.myListingFilterStatus = this.normalizeListingFilter(statusKey)
      this.myListingsPage = 1
      this.fetchMyListingsList()
    },
    normalizeOrderFilter(statusKey) {
      const normalized = String(statusKey || '').trim()
      if (normalized === 'in_progress') {
        return 'all'
      }
      return this.orderStatusTabs.some((item) => item.key === normalized) ? normalized : 'all'
    },
    normalizeListingFilter(statusKey) {
      const normalized = String(statusKey || '').trim()
      if (['in_progress', 'pending_review', 'verify'].includes(normalized)) {
        return 'active'
      }
      return this.myListingStatusTabs.some((item) => item.key === normalized) ? normalized : 'active'
    },
    async loadOrderData() {
      await this.fetchOrderStats()
      this.ensureVisibleOrderFilter()
      await this.fetchOrderList()
    },
    async loadMyListingsData() {
      await this.fetchMyListingsStats()
      this.ensureVisibleMyListingFilter()
      await this.fetchMyListingsList()
    },
    async loadMessageData(options = {}) {
      const silent = Boolean(options?.silent)
      if (!silent) {
        this.messageLoading = true
      }
      this.messageError = ''

      const [conversationResult, notificationResult] = await Promise.allSettled([
        this.fetchConversationList(),
        this.fetchNotificationList()
      ])

      if (conversationResult.status === 'rejected' && notificationResult.status === 'rejected') {
        this.messageError = conversationResult.reason?.message
          || notificationResult.reason?.message
          || '消息列表加载失败'
      } else {
        this.applyUnreadSummary(
          this.computeConversationUnreadCount(),
          this.computeNotificationUnreadCount()
        )
      }

      if (!silent) {
        this.messageLoading = false
      }
    },
    async loadWalletData() {
      this.walletLoading = true
      this.walletError = ''
      try {
        await Promise.all([this.fetchWalletBalance(), this.fetchWalletLedger(), this.fetchWalletWithdrawList()])
      } catch (error) {
        this.walletError = error.message || '钱包数据加载失败'
      } finally {
        this.walletLoading = false
      }
    },
    applyInvitePayload(data = {}) {
      this.ownInviteCode = String(data.own_invite_code || '').trim()
      this.boundInviteCode = String(data.bound_invite_code || '').trim()
      this.inviterInfo = data.inviter && typeof data.inviter === 'object'
        ? {
          id: Number(data.inviter.id || 0),
          username: String(data.inviter.username || '').trim(),
          inviteCode: String(data.inviter.invite_code || '').trim()
        }
        : null
      this.invitedRewardTotal = Number(data.invited_reward_total || 0)
      this.contributedRewardTotal = Number(data.contributed_reward_total || 0)
      this.inviterOrderList = Array.isArray(data.inviter_order_list) ? data.inviter_order_list : []
      this.inviteeOrderList = Array.isArray(data.invitee_order_list) ? data.invitee_order_list : []
      if (this.boundInviteCode) {
        this.inviteCodeInput = ''
      }
    },
    async loadInviteData() {
      this.inviteLoading = true
      this.inviteError = ''
      try {
        const data = await apiFetch('/api/invite/overview')
        this.applyInvitePayload(data)
      } catch (error) {
        this.ownInviteCode = ''
        this.boundInviteCode = ''
        this.inviterInfo = null
        this.invitedRewardTotal = 0
        this.contributedRewardTotal = 0
        this.inviterOrderList = []
        this.inviteeOrderList = []
        this.inviteError = error.status === 401 ? '登录已过期，请重新登录后查看邀新数据' : (error.message || '邀新数据加载失败')
      } finally {
        this.inviteLoading = false
      }
    },
    async submitInviteCode() {
      const inviteCode = String(this.inviteCodeInput || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
      if (!inviteCode) {
        showWarningToast('请输入邀请码')
        return
      }
      if (!/^[A-Z0-9]{6,16}$/.test(inviteCode)) {
        showWarningToast('邀请码格式不正确')
        return
      }
      if (this.boundInviteCode) {
        showWarningToast('邀请码已绑定，当前账号不可修改')
        return
      }
      if (inviteCode === this.ownInviteCode) {
        showWarningToast('不能填写自己的邀请码')
        return
      }

      this.inviteSubmitting = true
      try {
        const data = await apiFetch('/api/invite/bind', {
          method: 'POST',
          body: JSON.stringify({
            invite_code: inviteCode
          })
        })
        showSuccessToast(data.message || '邀请码绑定成功')
        this.inviteCodeInput = ''
        await this.loadInviteData()
      } catch (error) {
        showErrorToast(error.message || '绑定邀请码失败')
      } finally {
        this.inviteSubmitting = false
      }
    },
    getKycCallbackParams() {
      const searchParams = new URLSearchParams(window.location.search || '')
      const bizToken = String(
        searchParams.get('biz_token')
        || searchParams.get('bizToken')
        || searchParams.get('BizToken')
        || ''
      ).trim()
      const orderNo = String(
        searchParams.get('order_no')
        || searchParams.get('orderNo')
        || searchParams.get('OrderNo')
        || ''
      ).trim()
      return {
        bizToken,
        orderNo
      }
    },
    clearKycCallbackParams() {
      const url = new URL(window.location.href)
      const keys = ['biz_token', 'bizToken', 'BizToken', 'order_no', 'orderNo', 'OrderNo']
      keys.forEach((key) => url.searchParams.delete(key))
      window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`)
    },
    applyKycStatusPayload(data = {}) {
      this.kycStatus = this.normalizeKycStatus(data.status)
      this.kycRealNameMasked = String(data.real_name_masked || '').trim()
      this.kycIdCardMasked = String(data.id_card_masked || '').trim()
      this.kycVerifiedAt = data.verified_at || data.latest_record?.verified_at || null
      this.kycSubmittedAt = data.latest_record?.submitted_at || data.latest_record?.created_at || this.kycSubmittedAt || null
      this.kycCompletedAt = data.completed_at || data.latest_record?.completed_at || null
      this.kycFailureReason = String(data.failure_reason || data.latest_record?.failure_reason || '').trim()
      this.kycOrderNo = String(data.order_no || data.latest_record?.order_no || '').trim()
      this.kycBizToken = String(data.biz_token || data.latest_record?.biz_token || '').trim()
      this.kycVerifyUrl = String(data.redirect_url || data.verify_url || data.latest_record?.verify_url || '').trim()
      this.kycRuleId = String(data.rule_id || data.latest_record?.rule_id || '').trim()
    },
    async syncKycResult(payload = {}, options = {}) {
      const bizToken = String(payload.bizToken || payload.biz_token || this.kycBizToken || '').trim()
      const orderNo = String(payload.orderNo || payload.order_no || this.kycOrderNo || '').trim()
      if (!bizToken && !orderNo) {
        if (options.showToast) {
          showWarningToast('当前没有可同步的实名认证会话')
        }
        return null
      }

      this.kycSyncing = true
      try {
        const data = await apiFetch('/api/kyc/result/sync', {
          method: 'POST',
          body: JSON.stringify({
            biz_token: bizToken || undefined,
            order_no: orderNo || undefined
          })
        })
        this.applyKycStatusPayload(data)
        this.clearKycCallbackParams()
        await this.loadKycData({ skipRedirectSync: true })

        if (options.showToast) {
          if (this.kycStatus === 'verified') {
            showSuccessToast('实名认证已完成')
          } else if (this.kycStatus === 'failed') {
            showWarningToast(this.kycFailureReason || '实名认证未通过，请核对后重试')
          } else {
            showSuccessToast('实名认证结果已刷新')
          }
        }
        return data
      } catch (error) {
        if (options.showToast !== false) {
          showErrorToast(error.message || '同步实名认证结果失败')
        }
        throw error
      } finally {
        this.kycSyncing = false
      }
    },
    continueKycVerification() {
      if (!this.kycVerifyUrl) {
        showWarningToast('当前没有可继续的实名认证会话')
        return
      }
      window.location.assign(this.kycVerifyUrl)
    },
    async loadKycData(options = {}) {
      const skipRedirectSync = Boolean(options?.skipRedirectSync)
      this.kycLoading = true
      this.kycError = ''
      try {
        const data = await apiFetch('/api/kyc/status')
        this.applyKycStatusPayload(data)

        if (!skipRedirectSync) {
          const callbackParams = this.getKycCallbackParams()
          if (callbackParams.bizToken || callbackParams.orderNo) {
            try {
              await this.syncKycResult(callbackParams, { showToast: true })
            } catch (syncError) {
              this.kycError = syncError.message || '同步实名认证结果失败'
            }
          }
        }
      } catch (error) {
        this.kycStatus = 'unverified'
        this.kycRealNameMasked = ''
        this.kycIdCardMasked = ''
        this.kycVerifiedAt = null
        this.kycSubmittedAt = null
        this.kycFailureReason = ''
        this.kycCompletedAt = null
        this.kycOrderNo = ''
        this.kycBizToken = ''
        this.kycVerifyUrl = ''
        this.kycRuleId = ''
        this.kycError = error.status === 401 ? '登录已过期，请重新登录后查看实名认证信息' : (error.message || '实名认证信息加载失败')
      } finally {
        this.kycLoading = false
      }
    },
    async fetchOrderStats() {
      try {
        const data = await apiFetch('/api/orders/stats')
        this.orderStatsData = {
          total: Number(data.total || 0),
          pending_payment: Number(data.pending_payment || 0),
          paid: Number(data.paid || 0),
          support_handling: Number(data.support_handling || 0),
          settlement_pending: Number(data.settlement_pending || 0),
          in_progress: Number(data.in_progress || 0),
          completed: Number(data.completed || 0),
          cancelled: Number(data.cancelled || 0)
        }
      } catch (error) {
        this.orderStatsData = {
          total: 0,
          pending_payment: 0,
          paid: 0,
          support_handling: 0,
          settlement_pending: 0,
          in_progress: 0,
          completed: 0,
          cancelled: 0
        }
        if (!this.orderError) {
          this.orderError = error.message || '订单统计加载失败'
        }
      }
    },
    async fetchOrderList() {
      this.orderLoading = true
      this.orderError = ''
      try {
        const params = new URLSearchParams({
          page: String(this.orderPage),
          pageSize: String(this.orderPageSize),
          status: this.orderFilterStatus
        })
        const data = await apiFetch(`/api/orders?${params.toString()}`)
        this.orderList = Array.isArray(data.list) ? data.list : []
        this.orderTotal = Number(data.total || 0)
        this.orderPage = Number(data.page || this.orderPage)
      } catch (error) {
        this.orderList = []
        this.orderTotal = 0
        this.orderError = error.status === 401 ? '登录已过期，请重新登录后查看订单' : (error.message || '订单列表加载失败')
      } finally {
        this.orderLoading = false
      }
    },
    async fetchMyListingsStats() {
      try {
        const [listingStats, sellerOrderStats] = await Promise.all([
          apiFetch('/api/my-listings/stats'),
          apiFetch('/api/seller/orders/stats')
        ])
        this.myListingsStatsData = {
          total: Number(listingStats.total || 0),
          active: Number(listingStats.active || 0),
          inactive: Number(listingStats.inactive || 0),
          pending_payment: Number(sellerOrderStats.pending_payment || 0),
          paid: Number(sellerOrderStats.paid || 0),
          support_handling: Number(sellerOrderStats.support_handling || 0),
          settlement_pending: Number(sellerOrderStats.settlement_pending || 0),
          completed: Number(sellerOrderStats.completed || 0),
          cancelled: Number(sellerOrderStats.cancelled || 0)
        }
      } catch (error) {
        this.myListingsStatsData = {
          total: 0,
          active: 0,
          inactive: 0,
          pending_payment: 0,
          paid: 0,
          support_handling: 0,
          settlement_pending: 0,
          completed: 0,
          cancelled: 0
        }
        if (!this.myListingsError) {
          this.myListingsError = error.message || '我发布的统计加载失败'
        }
      }
    },
    async fetchMyListingsList() {
      this.myListingsLoading = true
      this.myListingsError = ''
      try {
        const isSellerOrderTab = this.isSellerOrderStatus(this.myListingFilterStatus)
        const params = new URLSearchParams({
          page: String(this.myListingsPage),
          pageSize: String(this.myListingsPageSize),
          status: this.myListingFilterStatus
        })
        const endpoint = isSellerOrderTab ? '/api/seller/orders' : '/api/my-listings'
        const data = await apiFetch(`${endpoint}?${params.toString()}`)
        this.myListingsList = (Array.isArray(data.list) ? data.list : []).map((item) => ({
          ...item,
          record_type: isSellerOrderTab ? 'seller_order' : 'listing'
        }))
        this.myListingsTotal = Number(data.total || 0)
        this.myListingsPage = Number(data.page || this.myListingsPage)
      } catch (error) {
        this.myListingsList = []
        this.myListingsTotal = 0
        this.myListingsError = error.status === 401 ? '登录已过期，请重新登录后查看我发布的商品' : (error.message || '我发布的列表加载失败')
      } finally {
        this.myListingsLoading = false
      }
    },
    async fetchAllPagedItems(baseUrl, pageSize = 100) {
      const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 100))
      const list = []
      let page = 1
      let total = 0
      let totalPages = 1

      while (page <= totalPages) {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(safePageSize)
        })
        const data = await apiFetch(`${baseUrl}?${params.toString()}`)
        const currentList = Array.isArray(data.list) ? data.list : []
        const currentTotal = Number(data.total || currentList.length || 0)
        const responsePageSize = Math.min(100, Math.max(1, Number(data.pageSize || safePageSize) || safePageSize))

        list.push(...currentList)
        total = currentTotal
        totalPages = Math.max(1, Math.ceil(currentTotal / responsePageSize))

        if (!currentList.length || list.length >= currentTotal) {
          break
        }

        page += 1
      }

      return {
        list,
        total,
        pageSize: safePageSize
      }
    },
    async fetchConversationList() {
      try {
        const data = await this.fetchAllPagedItems('/api/conversations', this.conversationPageSize)
        this.conversationList = Array.isArray(data.list) ? data.list : []
        this.conversationPage = 1
      } catch (error) {
        this.conversationList = []
        throw error
      }
    },
    async fetchNotificationList() {
      try {
        const data = await this.fetchAllPagedItems('/api/notifications', this.notificationPageSize)
        this.notificationList = Array.isArray(data.list) ? data.list : []
        this.notificationTotal = Number(data.total || 0)
        this.notificationPage = 1
      } catch (error) {
        this.notificationList = []
        this.notificationTotal = 0
        throw error
      }
    },
    applyUnreadSummary(conversationUnreadTotal, notificationUnreadTotal) {
      this.conversationUnreadTotal = Math.max(0, Number(conversationUnreadTotal || 0))
      this.notificationUnreadTotal = Math.max(0, Number(notificationUnreadTotal || 0))
      this.totalUnreadCount = this.conversationUnreadTotal + this.notificationUnreadTotal
      this.$emit('unread-change', {
        total: this.totalUnreadCount,
        conversationUnreadTotal: this.conversationUnreadTotal,
        notificationUnreadTotal: this.notificationUnreadTotal
      })
    },
    computeConversationUnreadCount() {
      return this.conversationList.reduce(
        (sum, item) => sum + Number(item?.unread_count || 0),
        0
      )
    },
    computeNotificationUnreadCount() {
      return this.notificationList.reduce(
        (sum, item) => sum + Number(item?.unread_count || 0),
        0
      )
    },
    computeLocalUnreadCount() {
      const conversationUnread = this.computeConversationUnreadCount()
      const notificationUnread = this.computeNotificationUnreadCount()
      return conversationUnread + notificationUnread
    },
    async fetchWalletBalance() {
      const data = await apiFetch('/api/wallet')
      this.walletBalance = Number(data.balance || 0)
      this.walletFrozenBalance = Number(data.frozen_balance || 0)
      this.walletWithdrawableBalance = Number(data.withdrawable_balance || data.balance || 0)
    },
    async fetchWalletLedger() {
      const data = await apiFetch('/api/wallet/ledger')
      this.walletLedger = Array.isArray(data.list) ? data.list : []
    },
    async fetchWalletWithdrawList() {
      const data = await apiFetch('/api/wallet/withdraw/list')
      this.walletWithdrawList = Array.isArray(data.list) ? data.list : []
    },
    normalizeKycStatus,
    handleKycFormUpdate(nextForm = {}) {
      this.kycForm = {
        ...this.kycForm,
        ...nextForm
      }
    },
    async submitKyc() {
      const realName = String(this.kycForm.realName || '').trim()
      const idCardNo = String(this.kycForm.idCardNo || '').trim().toUpperCase()

      if (!/^[A-Za-z\u4e00-\u9fa5·\s]{2,30}$/.test(realName)) {
        showWarningToast('请输入真实有效的姓名')
        return
      }
      if (!/^(\d{15}|\d{17}[\dXx])$/.test(idCardNo)) {
        showWarningToast('请输入真实有效的证件号码')
        return
      }

      this.kycSubmitting = true
      try {
        const data = await apiFetch('/api/kyc/submit', {
          method: 'POST',
          body: JSON.stringify({
            real_name: realName,
            id_card_no: idCardNo
          })
        })
        this.applyKycStatusPayload({
          ...data,
          latest_record: {
            order_no: data.order_no || '',
            biz_token: data.biz_token || '',
            verify_url: data.redirect_url || '',
            rule_id: data.rule_id || '',
            submitted_at: new Date().toISOString()
          }
        })
        this.kycSubmittedAt = new Date().toISOString()
        this.kycForm.realName = ''
        this.kycForm.idCardNo = ''

        if (data.redirect_url) {
          showSuccessToast('实名认证会话已创建，正在进入腾讯云刷脸核身页面')
          window.location.assign(data.redirect_url)
          return
        }

        if (data.sync_required) {
          await this.syncKycResult({
            bizToken: data.biz_token,
            orderNo: data.order_no
          }, {
            showToast: true
          })
        } else {
          showSuccessToast(data.is_mock ? '实名认证申请已提交，当前为测试模式' : '实名认证申请已提交')
          await this.loadKycData({ skipRedirectSync: true })
        }
      } catch (error) {
        showErrorToast(error.message || '提交实名认证失败')
      } finally {
        this.kycSubmitting = false
      }
    },
    handleWithdrawFormUpdate(nextForm = {}) {
      this.withdrawForm = {
        ...this.withdrawForm,
        ...nextForm
      }
    },
    async submitWithdraw() {
      if (!this.canApplyWithdraw) {
        showWarningToast('请先登录后再申请提现')
        return
      }

      const amount = Number(this.withdrawForm.amount || 0)
      const accountName = String(this.withdrawForm.accountName || '').trim()
      const accountNo = String(this.withdrawForm.accountNo || '').trim()

      if (!Number.isFinite(amount) || amount < 1) {
        showWarningToast('提现金额至少 1 元')
        return
      }
      if (amount > Number(this.walletWithdrawableBalance || 0)) {
        showWarningToast('提现金额不能超过可提现余额')
        return
      }
      if (!accountName) {
        showWarningToast('请输入收款人姓名')
        return
      }
      if (!accountNo) {
        showWarningToast('请输入收款账号')
        return
      }

      this.walletWithdrawSubmitting = true
      try {
        await apiFetch('/api/wallet/withdraw/apply', {
          method: 'POST',
          body: JSON.stringify({
            amount,
            channel: this.withdrawForm.channel,
            account_name: accountName,
            account_no: accountNo,
            remark: String(this.withdrawForm.remark || '').trim()
          })
        })
        this.withdrawForm.amount = ''
        this.withdrawForm.accountName = ''
        this.withdrawForm.accountNo = ''
        this.withdrawForm.remark = ''
        showSuccessToast('提现申请已提交')
        await this.loadWalletData()
      } catch (error) {
        showErrorToast(error.message || '提交提现申请失败')
      } finally {
        this.walletWithdrawSubmitting = false
      }
    },
    async updateMyListingStatus(item, nextStatus) {
      if (!item?.id) return
      const actionText = nextStatus === 'active' ? '重新上架' : '下架'
      const confirmed = await showConfirm({
        title: actionText,
        message: `确认${actionText}商品 #${item.listing_no || item.id} 吗？`,
        confirmText: actionText,
        cancelText: '取消',
        tone: nextStatus === 'active' ? 'primary' : 'danger'
      })
      if (!confirmed) return

      try {
        const data = await apiFetch(`/api/my-listings/${item.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: nextStatus })
        })
        showSuccessToast(data.message || `${actionText}成功`)
        await this.loadMyListingsData()
      } catch (error) {
        showErrorToast(error.message || `${actionText}失败`)
      }
    },
    goToOrderPage(page) {
      if (page < 1 || page > this.orderTotalPages || page === this.orderPage) return
      this.orderPage = page
      this.fetchOrderList()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    goToMyListingPage(page) {
      if (page < 1 || page > this.myListingsTotalPages || page === this.myListingsPage) return
      this.myListingsPage = page
      this.fetchMyListingsList()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    formatMoney(value) {
      return formatMoneyFixed(value, 2)
    },
    getSellerIncomeRent(order) {
      const sellerRentAmount = Number(order?.seller_rent_amount || 0)
      const compensationFee = calculateCompensationFeeAmount(
        sellerRentAmount,
        order?.compensation_plan,
        this.businessSettings
      )
      return Math.max(
        0,
        calculateSellerIncomeRent(
          sellerRentAmount,
          this.businessSettings.platformCommission?.sellerServiceFeeRatePercent
        ) - compensationFee
      )
    },
    formatPendingCountdown(createdAt) {
      return formatPendingCountdown(
        createdAt,
        getPendingPaymentTimeoutMinutes(this.businessSettings),
        this.countdownNowTs
      )
    },
    formatOrderDate: formatOrderDateTime,
    hasSectionUnreadDot(sectionKey) {
      return sectionKey === 'messages' && this.hasUnreadMessages
    },
    getOrderCounterpartyName(order) {
      return order.seller_name || '平台卖家'
    },
    getOrderCount(statusKey) {
      if (statusKey === 'all') return this.orderStatsData.total || 0
      return this.orderStatsData[statusKey] || 0
    },
    getMyListingCount(statusKey) {
      if (statusKey === 'all') return this.myListingsStatsData.total || 0
      return this.myListingsStatsData[statusKey] || 0
    },
    shouldShowStatusTab(statusKey, statsData) {
      if (statusKey === 'all') return true
      return Number(statsData?.[statusKey] || 0) > 0
    },
    ensureVisibleOrderFilter() {
      if (this.visibleOrderStatusTabs.some((item) => item.key === this.orderFilterStatus)) {
        return
      }
      this.orderFilterStatus = 'all'
      this.orderPage = 1
    },
    ensureVisibleMyListingFilter() {
      if (this.visibleMyListingStatusTabs.some((item) => item.key === this.myListingFilterStatus)) {
        return
      }
      this.myListingFilterStatus = 'all'
      this.myListingsPage = 1
    },
    isSellerOrderStatus(statusKey) {
      return ['pending_payment', 'paid', 'support_handling', 'settlement_pending', 'completed', 'cancelled'].includes(statusKey)
    },
    getOrderActions(order) {
      if (order.status === 'pending_payment') {
        return [
          { key: 'detail', label: '查看订单', tone: 'ghost' },
          { key: 'pay', label: '立即支付', tone: 'primary' }
        ]
      }
      return [{ key: 'detail', label: '查看订单', tone: 'ghost' }]
    },
    getPublishedOrderActions(order) {
      if (order.status === 'pending_payment') {
        return [{ key: 'detail', label: '查看订单', tone: 'ghost' }]
      }
      return [{ key: 'detail', label: '查看订单', tone: 'ghost' }]
    },
    getMyListingActions(item) {
      if (item.listing_status === 'active') {
        return [
          { key: 'detail', label: '查看详情', tone: 'ghost' },
          { key: 'edit', label: '编辑商品', tone: 'ghost' },
          { key: 'off_shelf', label: '下架商品', tone: 'danger' }
        ]
      }
      if (item.listing_status === 'rented') {
        return [{ key: 'detail', label: '查看详情', tone: 'ghost' }]
      }
      if (item.listing_status === 'inactive') {
        return [
          { key: 'edit', label: '编辑商品', tone: 'ghost' },
          { key: 'relist', label: '重新上架', tone: 'ghost' }
        ]
      }
      return []
    },
    canViewListingDetail(item) {
      return ['active', 'rented'].includes(String(item?.listing_status || '').trim())
    },
    isMobileProfileViewport() {
      return typeof window !== 'undefined' && window.matchMedia('(max-width: 960px)').matches
    },
    shouldIgnoreCardClick(event) {
      const target = event?.target
      return Boolean(target && target.closest('button, a, input, select, textarea, label'))
    },
    handleOrderCardClick(event, order) {
      if (!this.isMobileProfileViewport() || this.shouldIgnoreCardClick(event)) return
      this.handleOrderAction({ key: 'detail' }, order)
    },
    handlePublishedRecordClick(event, item) {
      if (!this.isMobileProfileViewport() || this.shouldIgnoreCardClick(event)) return
      if (item.record_type === 'seller_order') {
        this.handlePublishedOrderAction({ key: 'detail' }, item)
        return
      }
      if (!this.canViewListingDetail(item)) {
        return
      }
      this.handleMyListingAction({ key: 'detail' }, item)
    },
    handleOrderAction(action, order) {
      if (action.key === 'detail') {
        this.$emit(
          'view-order-detail',
          order.id,
          'profile',
          'buyer',
          this.orderFilterStatus,
          this.myListingFilterStatus,
          'orders'
        )
        return
      }
      if (action.key === 'pay') {
        this.selectedPaymentOrder = order
        this.showPaymentModal = true
        return
      }
    },
    handlePublishedOrderAction(action, order) {
      if (action.key === 'detail') {
        this.$emit(
          'view-order-detail',
          order.id,
          'profile',
          'seller',
          '',
          this.myListingFilterStatus,
          'published'
        )
        return
      }
    },
    handleMyListingAction(action, item) {
      if (action.key === 'detail') {
        if (!this.canViewListingDetail(item)) {
          return
        }
        this.$emit('view-listing-detail', item.listing_no || item.id, this.myListingFilterStatus)
        return
      }
      if (action.key === 'edit') {
        this.$emit('edit-listing', item.id, this.myListingFilterStatus)
        return
      }
      if (action.key === 'off_shelf') {
        this.updateMyListingStatus(item, 'inactive')
        return
      }
      if (action.key === 'relist') {
        this.updateMyListingStatus(item, 'active')
      }
    },
    async openMessageItem(messageItem) {
      if (messageItem?.item_type === 'conversation') {
        await this.openConversation(messageItem)
        return
      }
      await this.openNotification(messageItem)
    },
    async openConversation(conversation) {
      const orderId = Number(conversation?.order_id || conversation?.ref_id || 0)
      if (!orderId) {
        showErrorToast('该聊天室缺少订单信息，暂时无法打开')
        return
      }

      const unreadCount = Number(conversation?.unread_count || 0)
      if (unreadCount > 0) {
        this.conversationList = this.conversationList.map((item) => (
          Number(item.id) === Number(conversation.id)
            ? { ...item, unread_count: 0 }
            : item
        ))
        this.applyUnreadSummary(
          Math.max(0, Number(this.conversationUnreadTotal || 0) - unreadCount),
          this.notificationUnreadTotal
        )
      }

      this.selectedConversationOrderId = orderId
      this.selectedConversationUserRole = conversation?.self_role || 'buyer'
      this.showConversationPanel = true
    },
    async openNotification(notification) {
      const unreadCount = Number(notification?.unread_count || 0)
      if (unreadCount > 0 && notification?.id) {
        try {
          await apiFetch(`/api/notifications/${notification.id}/read`, { method: 'PUT' })
          this.notificationList = this.notificationList.map((item) => (
            Number(item.id) === Number(notification.id)
              ? { ...item, is_read: true, unread_count: 0 }
              : item
          ))
          this.applyUnreadSummary(
            this.conversationUnreadTotal,
            Math.max(0, Number(this.notificationUnreadTotal || 0) - unreadCount)
          )
        } catch (_error) {
          // 通知已读失败时不阻断查看
        }
      }
    },
    async handleConversationPanelClose() {
      this.showConversationPanel = false
      await this.loadMessageData({ silent: true })
    },
    handlePaymentModalClose() {
      this.showPaymentModal = false
      this.selectedPaymentOrder = null
    },
    async handleOrderPaymentSuccess(payload = {}) {
      this.handlePaymentModalClose()
      await this.loadOrderData()
      this.$emit('payment-success', payload)
    },
    triggerLogin() {
      this.$emit('login')
    },
    async handleLogout() {
      const confirmed = await showConfirm({
        title: '退出登录',
        message: '确定要退出当前账号吗？',
        confirmText: '确认退出',
        cancelText: '取消',
        tone: 'danger'
      })
      if (confirmed) {
        this.$emit('logout')
      }
    },
    getPlaceholderText(sectionKey) {
      const textMap = {
        messages: '消息板块暂未接入公告与通知，后续可在这里统一展示平台消息。',
        invite: '邀新赚钱板块用于展示邀请码、绑定关系和订单返现明细。',
        feedback: '问题反馈板块仅对已登录的普通用户和客服开放。'
      }
      return textMap[sectionKey] || '该板块暂未开放。'
    }
  }
}
</script>

<style scoped>
:global(html) {
  scrollbar-gutter: stable;
}

.profile-center {
  display: flex;
  gap: 24px;
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px 20px 32px;
  box-sizing: border-box;
  align-items: flex-start;
  min-height: calc(100vh - 92px);
}

.profile-sidebar {
  width: 220px;
  min-width: 220px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: sticky;
  top: 92px;
  align-self: flex-start;
  margin-top: 21px;
}

.profile-user-card,
.profile-content {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
}

.profile-placeholder-card,
.profile-panel-card {
  background: #fff;
  border-radius: 16px;
}

.profile-user-card {
  padding: 18px 16px;
}

.profile-user-label {
  margin: 0 0 8px;
  font-size: 12px;
  color: #6b7280;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.profile-user-card h2,
.profile-placeholder-card h4 {
  margin: 0;
  color: #111827;
}

.profile-user-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile-user-title-line {
  display: block;
}

.profile-user-card h2 {
  font-size: 22px;
  line-height: 1.3;
}

.profile-login-title {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.profile-login-link,
.profile-login-btn {
  border: none;
  background: none;
  padding: 0;
  color: #2563eb;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.profile-login-link:hover,
.profile-login-btn:hover {
  color: #1d4ed8;
}

.profile-login-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  margin-top: 16px;
  padding: 0 16px;
  border-radius: 999px;
  background: #111827;
  color: #fff;
}

.profile-login-btn:hover {
  background: #1f2937;
  color: #fff;
}

.profile-nav {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.profile-nav-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 14px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #fff;
  color: #374151;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
}

.profile-nav-item:hover {
  border-color: #c7d2fe;
  color: #1d4ed8;
}

.profile-nav-item.active {
  border-color: #1d4ed8;
  background: linear-gradient(135deg, #eff6ff 0%, #eef2ff 100%);
  color: #1d4ed8;
  box-shadow: 0 10px 30px rgba(29, 78, 216, 0.08);
}

.profile-nav-label-wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  position: relative;
}

.profile-nav-label {
  display: inline-block;
}

.profile-nav-dot {
  display: inline-flex;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #dc2626;
  box-shadow: 0 0 0 2px #fff;
}

.profile-nav-divider {
  height: 1px;
  background-color: var(--border-color);
  margin: 4px 0;
}

.profile-nav-logout {
  color: #ef4444;
  border-color: #fecaca;
  background: #fef2f2;
}

.profile-nav-logout:hover {
  border-color: #fca5a5;
  color: #dc2626;
  background: #fee2e2;
}

.profile-nav-items-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.profile-nav-items-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

/* 统一过渡配置 */
.profile-nav-slide-left-enter-active,
.profile-nav-slide-left-leave-active,
.profile-nav-slide-right-enter-active,
.profile-nav-slide-right-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 
  向右翻页动画（点右侧箭头）：
  新元素从右侧进入 (translateX(15px))
  旧元素向左侧退出 (translateX(-15px))
*/
.profile-nav-slide-right-enter-from {
  opacity: 0;
  transform: translateX(15px);
}
.profile-nav-slide-right-leave-to {
  opacity: 0;
  transform: translateX(-15px);
}

/* 
  向左翻页动画（点左侧箭头）：
  新元素从左侧进入 (translateX(-15px))
  旧元素向右侧退出 (translateX(15px))
*/
.profile-nav-slide-left-enter-from {
  opacity: 0;
  transform: translateX(-15px);
}
.profile-nav-slide-left-leave-to {
  opacity: 0;
  transform: translateX(15px);
}

.profile-content {
  flex: 1;
  min-width: 0;
  padding: 20px;
  min-height: calc(100vh - 116px);
  display: flex;
  flex-direction: column;
  scrollbar-gutter: stable both-edges;
}

.profile-section-fade-enter-active,
.profile-section-fade-leave-active {
  transition: opacity 0.12s ease;
}

.profile-section-fade-enter-from,
.profile-section-fade-leave-to {
  opacity: 0;
}

.profile-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  flex: 1;
}

.profile-panel-card,
.profile-placeholder-card {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.profile-tab-content {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.profile-order-toolbar {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 18px;
}

.order-role-tabs,
.order-filter-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.order-role-tab,
.order-filter-tab,
.order-page-btn {
  border: 1px solid #d1d5db;
  background: #fff;
  color: #374151;
  border-radius: 10px;
  padding: 8px 14px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.order-role-tab:hover,
.order-filter-tab:hover,
.order-page-btn:not(:disabled):hover {
  border-color: #c7d2fe;
  color: #1d4ed8;
}

.order-role-tab.active,
.order-filter-tab.active,
.order-page-btn.active {
  border-color: #1d4ed8;
  background: linear-gradient(135deg, #eff6ff 0%, #eef2ff 100%);
  color: #1d4ed8;
  box-shadow: 0 4px 12px rgba(29, 78, 216, 0.08);
}

.order-filter-count {
  margin-left: 6px;
  font-size: 12px;
  opacity: 0.88;
}

.profile-empty {
  padding: 28px 12px;
  text-align: center;
  color: #6b7280;
}

.invite-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.invite-panel-title {
  margin: 0;
  color: #111827;
  font-size: 22px;
}

.invite-panel-subtitle {
  margin: 8px 0 0;
  color: #6b7280;
  line-height: 1.7;
}

.invite-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.invite-summary-card,
.invite-order-card {
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  background: #fff;
}

.invite-summary-card {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  justify-content: center;
}

.invite-summary-card--full {
  grid-column: 1 / -1;
}

.invite-summary-card-header {
  margin-bottom: 0;
}

.invite-summary-title {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.invite-summary-title h4 {
  margin: 0;
  color: #111827;
  font-size: 18px;
}

/* Tooltip Styles */
.tooltip-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  position: relative;
}

.help-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #e5e7eb;
  color: #6b7280;
  font-size: 10px;
  font-style: normal;
  cursor: help;
  position: relative;
}

.tooltip-text {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: 8px;
  padding: 8px 12px;
  background: #1f2937;
  color: #fff !important;
  font-size: 12px;
  line-height: 1.5;
  border-radius: 6px;
  width: max-content;
  text-align: left;
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s ease;
  z-index: 100;
  pointer-events: none;
  font-weight: normal !important;
  white-space: nowrap;
}

.tooltip-text::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: #1f2937;
}

.tooltip-wrap:hover .tooltip-text {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(-4px);
}

.invite-summary-label {
  display: block;
  color: #6b7280;
  font-size: 13px;
}

.invite-summary-card strong {
  display: block;
  color: #111827;
  font-size: 24px;
}

.invite-summary-code {
  display: block;
  letter-spacing: 0.08em;
}

.invite-summary-card p {
  margin: 10px 0 0;
  color: #6b7280;
  line-height: 1.7;
}

.invite-bind-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 0;
}

.invite-bind-input {
  flex: 1;
  min-height: 44px;
  border: 1px solid #d1d5db;
  border-radius: 12px;
  padding: 0 14px;
  background: #f9fafb;
  color: #111827;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.invite-bind-input::placeholder {
  color: #9ca3af;
  font-size: 13px;
}

.invite-bind-input:focus {
  border-color: #60a5fa;
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.18);
}

.invite-summary-card--bind .order-action-btn {
  min-width: 108px;
  min-height: 44px;
  flex-shrink: 0;
}

.invite-order-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.invite-order-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.invite-order-section-header h4 {
  margin: 0;
  color: #111827;
  font-size: 18px;
}

.invite-order-section-header span {
  color: #6b7280;
  font-size: 13px;
}

.invite-order-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.invite-order-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px;
}

.invite-order-card--empty {
  padding: 0;
}

.invite-order-card--empty .profile-empty {
  width: 100%;
  padding: 24px 18px;
}

.invite-order-card h4 {
  margin: 0 0 8px;
  color: #111827;
  font-size: 18px;
}

.invite-order-card p {
  margin: 6px 0 0;
  color: #6b7280;
  font-size: 13px;
}

.invite-order-amounts {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  text-align: right;
}

.invite-order-amounts strong {
  color: #047857;
  font-size: 18px;
}

.invite-order-amounts span {
  color: #6b7280;
  font-size: 12px;
}

.profile-error {
  color: #b91c1c;
}

.order-list,
.listing-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.order-item,
.listing-item {
  display: flex;
  gap: 18px;
  align-items: stretch;
  padding: 18px;
  border: 1px solid #e8eaed;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03), 0 6px 18px rgba(0, 0, 0, 0.04);
}

.order-cover,
.listing-cover {
  width: 240px;
  min-width: 240px;
  flex-shrink: 0;
  height: auto;
  aspect-ratio: 16 / 9;
  border-radius: 12px;
  overflow: hidden;
  background: #eef2f7;
}

.order-cover img,
.listing-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

.order-cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  font-size: 13px;
}

.order-main,
.listing-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.order-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.order-header h4 {
  margin: 0 0 6px;
  font-size: 20px;
  color: #111827;
}

.order-subtitle {
  margin: 0;
  font-size: 14px;
  color: #6b7280;
}

.order-status,
.listing-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}

.order-status-wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.order-status-countdown {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: #fff7ed;
  color: #c2410c;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.status-pending_payment {
  background: #fffbeb;
  color: #b45309;
}

.status-in_progress,
.status-paid,
.status-settlement_pending,
.status-rented {
  background: #eff6ff;
  color: #1d4ed8;
}

.status-completed,
.status-active {
  background: #ecfdf5;
  color: #047857;
}

.status-support_handling,
.status-pending_review,
.status-failed,
.status-rejected {
  background: #fef2f2;
  color: #b91c1c;
}

.status-cancelled,
.status-inactive,
.status-sold_out {
  background: #f3f4f6;
  color: #4b5563;
}

.status-pending,
.status-processing {
  background: #fffbeb;
  color: #b45309;
}

.status-verified,
.status-success {
  background: #ecfdf5;
  color: #047857;
}

.order-meta-grid,
.listing-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 20px;
  padding: 12px 14px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px solid #f1f5f9;
}

.order-meta-grid p,
.listing-meta-grid p {
  margin: 0;
  color: #374151;
  font-size: 14px;
}

.order-meta-grid p.copy-inline,
.listing-meta-grid p.copy-inline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.order-meta-grid span,
.listing-meta-grid span {
  display: inline-block;
  min-width: 72px;
  color: #6b7280;
}

.order-actions,
.listing-actions-col {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-end;
  gap: 10px;
  min-width: 120px;
}

.order-action-btn {
  border: 1px solid #d1d5db;
  border-radius: 10px;
  background: #fff;
  color: #374151;
  padding: 10px 14px;
  cursor: pointer;
  font-size: 14px;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.order-action-btn:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.order-action-btn:active {
  transform: scale(0.96);
  background: #e5e7eb;
}

.order-action-btn.primary {
  background: #111827;
  border-color: #111827;
  color: #fff;
}

.order-action-btn.primary:hover {
  background: #374151;
  border-color: #374151;
}

.order-action-btn.primary:active {
  background: #1f2937;
}

.order-action-btn.danger {
  border-color: #fecaca;
  background: #fff1f2;
  color: #b91c1c;
}

.order-action-btn.danger:hover {
  background: #ffe4e6;
  border-color: #fca5a5;
}

.order-action-btn.danger:active {
  background: #fecdd3;
}

.order-action-btn.ghost {
  background: #f8fafc;
  border-color: #e5e7eb;
}

.order-action-btn.ghost:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.order-action-btn.ghost:active {
  background: #e2e8f0;
}

.order-pagination {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

.order-page-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.order-page-summary {
  color: #6b7280;
  font-size: 14px;
}

.profile-placeholder-card {
  padding: 28px 24px;
}

.profile-placeholder-card p {
  margin: 10px 0 0;
  color: #6b7280;
  line-height: 1.8;
}

.feedback-form-card {
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  background: #fff;
  padding: 20px;
}

.feedback-form-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.feedback-form-footer,
.feedback-count {
  display: flex;
  align-items: center;
  gap: 12px;
}

.feedback-form-footer {
  flex-direction: column;
  align-items: flex-start;
}

.feedback-count {
  color: #6b7280;
  font-size: 13px;
}

.feedback-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.feedback-field span {
  color: #374151;
  font-size: 14px;
  font-weight: 600;
}

.feedback-select,
.feedback-textarea {
  border: 1px solid #d1d5db;
  border-radius: 12px;
  background: #fff;
  color: #111827;
}

.feedback-select {
  align-self: flex-start;
  min-height: 44px;
  padding: 0 12px;
}

.feedback-textarea {
  width: 100%;
}

.feedback-textarea {
  padding: 12px 14px;
  resize: vertical;
  line-height: 1.7;
}

@media (max-width: 960px) {
  .profile-center {
    padding: 12px 12px 88px 12px;
    gap: 16px;
    min-height: calc(100vh - 60px);
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .profile-sidebar {
    position: relative;
    left: auto;
    top: auto;
    z-index: 20;
    width: 100%;
    min-width: auto;
    transform: none;
    flex-direction: column;
    gap: 12px;
    margin-top: 0;
  }

  .profile-user-card {
    display: block;
    padding: 16px;
    border-radius: 16px;
  }

  /* 移动端现代化 Tab 标签栏布局 */
  .profile-nav {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 0;
    width: 100%;
    overflow-x: hidden;
    padding: 0 6px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    min-height: 56px;
  }
  
  .profile-nav-items-wrapper {
    display: flex;
    flex-direction: row;
    align-items: center;
    width: 100%;
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .profile-nav-items-group {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-around;
    width: 100%;
    gap: 0;
  }
  
  .profile-nav::-webkit-scrollbar {
    display: none;
  }

  .profile-nav-arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: #6b7280;
    padding: 0 4px;
    height: 56px;
    cursor: pointer;
    flex-shrink: 0;
    transition: color 0.2s, opacity 0.2s;
  }

  .profile-nav-arrow.is-invisible {
    opacity: 0;
    pointer-events: none;
  }

  .profile-nav-arrow:hover,
  .profile-nav-arrow:active {
    color: #111827;
  }

  .profile-nav-item {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    flex: 1;
    width: auto;
    height: 56px;
    min-height: auto;
    padding: 0 4px;
    border: none !important;
    border-radius: 0;
    background: transparent !important;
    text-align: center;
    box-shadow: none !important;
    white-space: nowrap;
    flex-shrink: 0;
    color: #6b7280 !important;
    font-size: 14px;
    font-weight: 500;
    transition: color 0.2s ease;
  }

  .profile-nav-item.active {
    color: #111827 !important;
    font-weight: 600;
  }

  /* 优雅的底部指示线 */
  .profile-nav-item::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 3px;
    background: #111827;
    border-radius: 3px 3px 0 0;
    transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .profile-nav-item.active::after {
    width: 16px;
  }

  .profile-nav-divider {
    display: none;
  }

  .profile-nav-label-wrap {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    width: auto;
    line-height: 1.4;
  }

  .profile-nav-dot {
    position: absolute;
    right: -10px;
    top: 0;
    left: auto;
    transform: none;
    width: 6px;
    height: 6px;
    box-shadow: none;
  }

  .profile-nav-logout {
    color: #ef4444 !important;
  }

  .profile-content {
    padding: 0;
    min-height: auto;
    width: 100%;
    background: transparent;
    border: none;
  }

  .profile-panel-card,
  .profile-placeholder-card {
    padding: 18px 16px;
  }

  .order-filter-tabs {
    flex-wrap: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    gap: 8px;
    width: 100%;
    padding-bottom: 2px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .order-filter-tabs::-webkit-scrollbar {
    display: none;
  }

  .order-filter-tab {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .profile-user-card {
    padding: 16px 14px;
  }

  .profile-user-title {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px;
  }

  .profile-user-card h2 {
    font-size: 20px;
  }

  .profile-login-btn {
    width: 100%;
  }

  .order-item,
  .listing-item {
    flex-direction: column;
    padding: 14px;
  }

  .wallet-ledger-item {
    flex-direction: column;
  }

  .wallet-ledger-amount {
    align-items: flex-start;
  }

  .verify-status-card,
  .wallet-action-header,
  .wallet-subpanel-header,
  .wallet-withdraw-title-row {
    flex-direction: column;
  }

  .verify-info-grid,
  .wallet-summary-grid,
  .wallet-panels,
  .wallet-form-grid,
  .invite-summary-grid {
    grid-template-columns: 1fr;
  }

  .order-cover,
  .listing-cover {
    width: 100%;
    min-width: 0;
    height: auto;
    aspect-ratio: 16 / 9;
  }

  .order-header {
    flex-direction: column;
  }

  .order-header h4 {
    font-size: 18px;
  }

  .order-meta-grid,
  .listing-meta-grid {
    grid-template-columns: 1fr;
  }

  .order-meta-grid--orders p {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .order-meta-grid--orders span {
    display: block;
    min-width: 0;
    line-height: 1.4;
  }

  .order-actions,
  .listing-actions-col {
    width: 100%;
    min-width: 0;
    align-items: stretch;
  }

  .order-action-btn {
    width: 100%;
  }

  .profile-panel--orders .order-item,
  .profile-panel--published .order-item,
  .profile-panel--published .listing-item {
    cursor: pointer;
  }

  .profile-panel--orders .order-action-btn--detail,
  .profile-panel--published .listing-actions-col .order-action-btn--detail {
    display: none;
  }

  .invite-bind-row,
  .invite-order-card {
    flex-direction: column;
  }

  .invite-order-amounts {
    align-items: flex-start;
    text-align: left;
  }

  .feedback-form-footer {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
