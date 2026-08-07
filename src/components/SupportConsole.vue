<template>
  <section class="support-console">
    <template v-if="canAccessOrderDesk">
    <div class="toolbar">
      <div class="toolbar-search">
        <input
          v-model.trim="keywordDraft"
          type="text"
          class="search-input"
          maxlength="50"
          :placeholder="searchPlaceholder"
          @keydown.enter.prevent="applyFilters"
        >
        <button type="button" class="search-submit-btn" aria-label="搜索客服订单" @click="applyFilters">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path
              d="M8.75 3.5a5.25 5.25 0 1 0 0 10.5a5.25 5.25 0 0 0 0-10.5Zm-6.75 5.25a6.75 6.75 0 1 1 12.17 4.02l3.53 3.53a.75.75 0 1 1-1.06 1.06l-3.53-3.53A6.75 6.75 0 0 1 2 8.75Z"
            />
          </svg>
        </button>
      </div>
      <div class="toolbar-actions">
        <button
          v-for="tab in statusTabs"
          :key="tab.value"
          type="button"
          class="tab-btn"
          :class="{ 'tab-btn--active': activeStatus === tab.value }"
          @click="changeStatus(tab.value)"
        >
          {{ tab.label }} {{ tab.count }}
        </button>
        <button type="button" class="ghost-btn" :disabled="currentLoading" @click="applyFilters">
          刷新
        </button>
      </div>
    </div>

    <div class="summary-grid">
      <article class="summary-card">
        <span>{{ isAfterSaleDesk ? '待售后跟进' : '待售前跟进' }}</span>
        <strong>{{ currentWorkload.my_handling_count }}</strong>
      </article>
      <article class="summary-card">
        <span>已完成</span>
        <strong>{{ currentWorkload.my_resolved_total }}</strong>
      </article>
      <article class="summary-card">
        <span>今日完成</span>
        <strong>{{ currentWorkload.my_resolved_today }}</strong>
      </article>
      <article class="summary-card">
        <span>{{ isAfterSaleDesk ? '超时提醒' : '当前列表' }}</span>
        <strong>{{ isAfterSaleDesk ? alerts.pending_timeout_total : (currentCounts[activeStatus] || 0) }}</strong>
      </article>
    </div>

    <div class="shell">
      <aside class="panel panel--orders">
        <div class="panel-head">
          <div class="desk-tabs">
            <button
              type="button"
              class="desk-tab-btn"
              :class="{ 'desk-tab-btn--active': activeDesk === 'aftersale' }"
              @click="changeDesk('aftersale')"
            >
              售后
              <span v-if="hasAfterSaleUnreadDot" class="desk-tab-dot" aria-hidden="true"></span>
            </button>
            <button
              type="button"
              class="desk-tab-btn"
              :class="{ 'desk-tab-btn--active': activeDesk === 'presale' }"
              @click="changeDesk('presale')"
            >
              售前
              <span v-if="hasPresaleUnreadDot" class="desk-tab-dot" aria-hidden="true"></span>
            </button>
          </div>
          <span>{{ currentCounts[activeStatus] || 0 }} 条</span>
        </div>
        <div class="panel-scroll-shell">
          <div
            ref="ordersPanel"
            class="panel-body panel-body--orders"
            :style="{ opacity: currentLoading ? 0.6 : 1, pointerEvents: currentLoading ? 'none' : 'auto', transition: 'opacity 0.2s' }"
            @scroll="handlePanelScroll('orders')"
          >
            <div v-if="currentLoading && !currentList.length" class="state">{{ isAfterSaleDesk ? '正在加载订单...' : '正在加载售前咨询...' }}</div>
            <div v-else-if="currentError" class="state state--error">{{ currentError }}</div>
            <div v-else-if="!currentList.length && !currentLoading" class="state">{{ isAfterSaleDesk ? '当前没有匹配订单。' : '当前没有匹配的售前咨询。' }}</div>
            <template v-else-if="isAfterSaleDesk">
              <button
                v-for="order in orders"
                :key="order.id"
                type="button"
                class="order-card"
                :class="{ 'order-card--active': Number(order.id) === Number(activeOrderId) }"
                @click="selectOrder(order.id)"
                @dblclick="handleOrderCardDoubleClick(order.id)"
              >
                <div class="order-card-top">
                  <div class="order-card-title">
                    <strong>{{ order.order_no }}</strong>
                    <span
                      v-if="Number(order.conversation_unread_count || 0) > 0"
                      class="order-card-unread-badge"
                    >
                      {{ formatUnreadCount(order.conversation_unread_count) }}
                    </span>
                  </div>
                  <span>{{ formatDateTime(order.support_requested_at || order.created_at) }}</span>
                </div>
                <p>{{ order.listing_title }}</p>
                <div class="order-card-meta order-card-meta--grid">
                  <span class="meta-cell">
                    <em>买家</em>
                    <strong>{{ formatUserWechat(order.buyer_contact_wechat, order.buyer_name) }}</strong>
                  </span>
                  <span class="meta-cell">
                    <em>流程</em>
                    <strong>{{ order.status_text || order.status }}</strong>
                  </span>
                </div>
                <div class="order-card-meta order-card-meta--grid">
                  <span class="meta-cell">
                    <em>卖家</em>
                    <strong>{{ formatUserWechat(order.seller_contact_wechat, order.seller_name) }}</strong>
                  </span>
                  <span class="meta-cell">
                    <em>客服状态</em>
                    <strong>{{ getSupportStatusLabel(order.support_status) }}</strong>
                  </span>
                </div>
              </button>
            </template>
            <template v-else>
              <button
                v-for="consultation in presaleConsultations"
                :key="consultation.id"
                type="button"
                class="order-card"
                :class="{ 'order-card--active': Number(consultation.id) === Number(activePresaleId) }"
                @click="selectPresaleConsultation(consultation.id)"
                @dblclick="handlePresaleCardDoubleClick(consultation.id)"
              >
                <div class="order-card-top">
                  <div class="order-card-title">
                    <strong>{{ consultation.consultation_no }}</strong>
                    <span
                      v-if="Number(consultation.conversation_unread_count || 0) > 0"
                      class="order-card-unread-badge"
                    >
                      {{ formatUnreadCount(consultation.conversation_unread_count) }}
                    </span>
                  </div>
                  <span>{{ formatDateTime(consultation.last_message_at || consultation.created_at) }}</span>
                </div>
                <p>咨询用户：{{ consultation.user_name }}</p>
                <div class="order-card-meta order-card-meta--grid">
                  <span class="meta-cell">
                    <em>当前客服</em>
                    <strong>{{ consultation.support_assignee_name || '客服' }}</strong>
                  </span>
                  <span class="meta-cell">
                    <em>咨询状态</em>
                    <strong>{{ getSupportStatusLabel(consultation.support_status) }}</strong>
                  </span>
                </div>
              </button>
            </template>
          </div>
          <div
            v-show="ordersScrollbarEnabled"
            class="panel-scrollbar"
            :class="{ 'panel-scrollbar--visible': ordersScrollbarVisible }"
            aria-hidden="true"
          >
            <span class="panel-scrollbar-thumb" :style="getScrollbarThumbStyle('orders')"></span>
          </div>
        </div>
      </aside>

      <section class="panel panel--detail">
        <template v-if="!isAfterSaleDesk && activePresaleConsultation">
          <div class="panel-head">
            <h3>售前详情</h3>
            <span class="badge" :class="`badge--${activePresaleConsultation.support_status}`">
              {{ getSupportStatusLabel(activePresaleConsultation.support_status) }}
            </span>
          </div>

          <div class="panel-scroll-shell">
            <div
              ref="detailPanel"
              class="panel-body panel-body--detail"
              @scroll="handlePanelScroll('detail')"
            >
              <div class="detail-grid">
                <div><span>咨询单号</span><strong>{{ activePresaleConsultation.consultation_no }}</strong></div>
                <div><span>咨询用户</span><strong>{{ activePresaleConsultation.user_name }}</strong></div>
                <div><span>当前客服</span><strong>{{ activePresaleConsultation.support_assignee_name || '客服' }}</strong></div>
                <div><span>咨询状态</span><strong>{{ getSupportStatusLabel(activePresaleConsultation.support_status) }}</strong></div>
                <div><span>创建时间</span><strong>{{ formatDateTime(activePresaleConsultation.created_at) }}</strong></div>
                <div><span>最后更新</span><strong>{{ formatDateTime(activePresaleConsultation.updated_at || activePresaleConsultation.created_at) }}</strong></div>
              </div>

              <div class="detail-actions">
                <button type="button" class="primary-btn" @click="openConversation(activePresaleConsultation.id, 'presale')">
                  进入咨询会话
                </button>
                <button type="button" class="ghost-btn" :disabled="presaleNoteSaving || !canSavePresaleNote" @click="savePresaleNote">
                  {{ presaleNoteSaving ? '保存中...' : '保存备注' }}
                </button>
                <button
                  v-if="canResolvePresale"
                  type="button"
                  class="ok-btn"
                  :disabled="presaleResolving"
                  @click="resolvePresaleConsultation"
                >
                  {{ presaleResolving ? '提交中...' : '标记完成' }}
                </button>
              </div>

              <article class="info-block">
                <div class="note-head">
                  <h4>内部备注</h4>
                  <span>{{ presaleNoteDraft.length }}/500</span>
                </div>
                <textarea
                  v-model.trim="presaleNoteDraft"
                  class="note-textarea"
                  rows="4"
                  maxlength="500"
                  placeholder="记录售前沟通重点、意向问题与处理结果。"
                ></textarea>
              </article>
            </div>
            <div
              v-show="detailScrollbarEnabled"
              class="panel-scrollbar"
              :class="{ 'panel-scrollbar--visible': detailScrollbarVisible }"
              aria-hidden="true"
            >
              <span class="panel-scrollbar-thumb" :style="getScrollbarThumbStyle('detail')"></span>
            </div>
          </div>
        </template>

        <template v-else-if="isAfterSaleDesk && activeOrder">
          <div class="panel-head">
            <h3>订单详情</h3>
            <span class="badge" :class="`badge--${activeOrder.support_status}`">
              {{ getSupportStatusLabel(activeOrder.support_status) }}
            </span>
          </div>

          <div class="panel-scroll-shell">
            <div
              ref="detailPanel"
              class="panel-body panel-body--detail"
              @scroll="handlePanelScroll('detail')"
            >
              <div class="detail-grid">
                <div><span>买家微信号：</span><strong>{{ activeOrder.buyer_contact_wechat || '-' }}</strong></div>
                <div><span>卖家微信号：</span><strong>{{ activeOrder.seller_contact_wechat || '-' }}</strong></div>
                <div><span>订单号</span><strong>{{ activeOrder.order_no }}</strong></div>
                <div><span>商品标题</span><strong>{{ activeOrder.listing_title }}</strong></div>
                <div><span>当前流程</span><strong>{{ activeOrder.status_text || activeOrder.status }}</strong></div>
                <div><span>当前客服</span><strong>{{ formatUserPhone(activeOrder.support_assignee_phone, activeOrder.support_assignee_name || '未分配') }}</strong></div>
                <div v-if="activeOrder.support_scene === 'fund_frozen'">
                  <span>冻结前流程</span>
                  <strong>{{ activeOrder.support_origin_status_text || activeOrder.support_origin_status || '--' }}</strong>
                </div>
              </div>

              <article
                v-if="canReleaseFunds || activeOrder.support_freeze_reason"
                class="info-block"
              >
                <div class="note-head">
                  <h4>冻结原因</h4>
                  <span>{{ String(activeOrder.support_freeze_reason || '').length }}/500</span>
                </div>
                <p class="info-block-text">{{ activeOrder.support_freeze_reason || '暂无冻结原因。' }}</p>
              </article>

              <article
                v-if="activeOrder.support_scene === 'fund_frozen'"
                class="info-block freeze-resolution-card"
              >
                <div class="freeze-resolution-head">
                  <h4>冻结裁决说明</h4>
                  <span>冻结订单专用规则</span>
                </div>
                <p>押金退买家、租金归平台、卖家无收益。</p>
              </article>

              <div class="detail-actions">
                <button type="button" class="primary-btn" @click="openConversation(activeOrder.id)">
                  进入订单会话
                </button>
                <button type="button" class="ghost-btn" :disabled="noteSaving || !canSaveNote" @click="saveNote">
                  {{ noteSaving ? '保存中...' : '保存备注' }}
                </button>
                <button
                  v-if="canContinueOrder"
                  type="button"
                  class="primary-btn"
                  :disabled="statusSubmitting"
                  @click="continueOrder"
                >
                  {{ statusSubmitting ? '提交中...' : '继续履约' }}
                </button>
                <button
                  v-if="canReturnToSettlement"
                  type="button"
                  class="ghost-btn"
                  :disabled="statusSubmitting"
                  @click="returnToSettlement"
                >
                  {{ statusSubmitting ? '提交中...' : '回结算中' }}
                </button>
                <button
                  v-if="canCancelOrder"
                  type="button"
                  class="danger-btn"
                  :disabled="cancelSubmitting"
                  @click="cancelOrderBySupport"
                >
                  {{ cancelSubmitting ? '取消中...' : '取消订单' }}
                </button>
                <button
                  v-if="canFreezeFunds"
                  type="button"
                  class="danger-btn detail-actions__freeze"
                  :disabled="statusSubmitting"
                  @click="openFreezeDialog"
                >
                  {{ statusSubmitting ? '提交中...' : '冻结资金' }}
                </button>
                <button
                  v-if="canReleaseFunds"
                  type="button"
                  class="ok-btn"
                  :disabled="statusSubmitting"
                  @click="releaseFunds"
                >
                  {{ statusSubmitting ? '提交中...' : '解除冻结' }}
                </button>
                <button
                  v-if="canReconcileFunds"
                  type="button"
                  class="ghost-btn"
                  :disabled="reconcileSubmitting"
                  @click="reconcileFunds"
                >
                  {{ reconcileSubmitting ? '同步中...' : '同步资金结果' }}
                </button>
                <button
                  v-if="canExecuteSettlement"
                  type="button"
                  class="ok-btn"
                  :disabled="settlementSubmitting"
                  @click="executeSettlement"
                >
                  {{ settlementSubmitting ? '执行中...' : '执行分账' }}
                </button>
              </div>

              <article class="info-block">
                <div class="note-head">
                  <h4>内部备注</h4>
                  <span>{{ noteDraft.length }}/500</span>
                </div>
                <textarea
                  v-model.trim="noteDraft"
                  class="note-textarea"
                  rows="4"
                  maxlength="500"
                  placeholder="记录客服跟进过程、提醒结果或沟通结论。"
                ></textarea>
              </article>

              <article class="info-block" :style="{ opacity: timelineLoading ? 0.6 : 1, transition: 'opacity 0.2s' }">
                <div class="panel-head panel-head--sub">
                  <h3>处理时间线</h3>
                  <span>{{ timeline.length }} 条</span>
                </div>
                <div v-if="timelineLoading && !timeline.length" class="state">正在加载时间线...</div>
                <div v-else-if="timelineError" class="state state--error">{{ timelineError }}</div>
                <div v-else-if="!timeline.length && !timelineLoading" class="state">当前暂无处理记录。</div>
                <div v-else class="timeline">
                  <div v-for="item in timeline" :key="`${item.event_type}-${item.created_at}`" class="timeline-item">
                    <span class="timeline-dot"></span>
                    <div>
                      <p>{{ item.title }}</p>
                      <small>{{ item.description || '已记录一条处理动作。' }}</small>
                      <small>{{ formatDateTime(item.created_at) }}</small>
                    </div>
                  </div>
                </div>
              </article>
            </div>
            <div
              v-show="detailScrollbarEnabled"
              class="panel-scrollbar"
              :class="{ 'panel-scrollbar--visible': detailScrollbarVisible }"
              aria-hidden="true"
            >
              <span class="panel-scrollbar-thumb" :style="getScrollbarThumbStyle('detail')"></span>
            </div>
          </div>
        </template>

        <div v-else class="panel-scroll-shell">
          <div
            ref="detailPanel"
            class="panel-body panel-body--detail panel-body--empty"
            @scroll="handlePanelScroll('detail')"
          >
            <div class="state">{{ isAfterSaleDesk ? '请选择一条订单查看详情。' : '请选择一条售前咨询查看详情。' }}</div>
          </div>
          <div
            v-show="detailScrollbarEnabled"
            class="panel-scrollbar"
            :class="{ 'panel-scrollbar--visible': detailScrollbarVisible }"
            aria-hidden="true"
          >
            <span class="panel-scrollbar-thumb" :style="getScrollbarThumbStyle('detail')"></span>
          </div>
        </div>
      </section>
    </div>

    <ConversationPanel
      v-if="canAccessOrderDesk"
      :visible="messagePanelVisible"
      :conversation-type="activeConversationType"
      :order-id="activeConversationOrderId"
      :consultation-id="activeConversationConsultationId"
      user-role="support"
      @close="handleConversationClose"
    />
    <Transition name="freeze-dialog-fade">
      <div
        v-if="freezeDialogVisible"
        class="freeze-dialog-overlay"
        @click.self="closeFreezeDialog"
      >
        <section class="freeze-dialog" role="dialog" aria-modal="true" aria-label="冻结原因输入框">
          <div class="freeze-dialog__body">
            <div class="note-head">
              <h4>冻结原因</h4>
              <span>{{ freezeReasonDraft.length }}/500</span>
            </div>
            <textarea
              ref="freezeReasonInput"
              v-model.trim="freezeReasonDraft"
              class="note-textarea freeze-dialog__textarea"
              rows="4"
              maxlength="500"
              placeholder="请输入冻结资金原因，例如发现疑似私下交易、规避平台规则等。"
            ></textarea>
          </div>

          <div class="freeze-dialog__footer">
            <button type="button" class="ghost-btn" :disabled="statusSubmitting" @click="closeFreezeDialog">
              取消
            </button>
            <button type="button" class="danger-btn" :disabled="statusSubmitting" @click="freezeFunds">
              {{ statusSubmitting ? '提交中...' : '确定冻结' }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
    </template>

    <template v-else-if="canAccessWithdrawDesk">
      <div class="toolbar">
        <div class="toolbar-search">
          <input
            v-model.trim="withdrawKeywordDraft"
            type="text"
            class="search-input"
            maxlength="50"
            placeholder="搜索提现单号、用户名、手机号"
            @keydown.enter.prevent="applyWithdrawFilters"
          >
          <button type="button" class="search-submit-btn" aria-label="搜索提现申请" @click="applyWithdrawFilters">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path
                d="M8.75 3.5a5.25 5.25 0 1 0 0 10.5a5.25 5.25 0 0 0 0-10.5Zm-6.75 5.25a6.75 6.75 0 1 1 12.17 4.02l3.53 3.53a.75.75 0 1 1-1.06 1.06l-3.53-3.53A6.75 6.75 0 0 1 2 8.75Z"
              />
            </svg>
          </button>
        </div>
        <div class="toolbar-actions">
          <button
            v-for="tab in withdrawStatusTabs"
            :key="tab.value"
            type="button"
            class="tab-btn"
            :class="{ 'tab-btn--active': activeWithdrawStatus === tab.value }"
            @click="changeWithdrawStatus(tab.value)"
          >
            {{ tab.label }}
          </button>
          <button type="button" class="ghost-btn" :disabled="withdrawLoading || withdrawSubmitting" @click="fetchWithdrawRequests">
            刷新
          </button>
        </div>
      </div>

      <div class="summary-grid">
        <article class="summary-card">
          <span>待审核申请</span>
          <strong>{{ withdrawSummary.pending_review }}</strong>
        </article>
        <article class="summary-card">
          <span>处理中申请</span>
          <strong>{{ withdrawSummary.processing }}</strong>
        </article>
        <article class="summary-card">
          <span>已打款</span>
          <strong>{{ withdrawSummary.success }}</strong>
        </article>
        <article class="summary-card">
          <span>已拒绝 / 失败</span>
          <strong>{{ withdrawSummary.rejected + withdrawSummary.failed }}</strong>
        </article>
      </div>

      <div class="shell">
        <aside class="panel panel--orders">
          <div class="panel-head">
            <h3>提现申请</h3>
            <span>{{ filteredWithdrawRequests.length }} 条</span>
          </div>
          <div class="panel-scroll-shell">
            <div
              ref="ordersPanel"
              class="panel-body panel-body--orders"
              :style="{ opacity: withdrawLoading ? 0.6 : 1, pointerEvents: withdrawLoading ? 'none' : 'auto', transition: 'opacity 0.2s' }"
              @scroll="handlePanelScroll('orders')"
            >
              <div v-if="withdrawLoading && !filteredWithdrawRequests.length" class="state">正在加载提现申请...</div>
              <div v-else-if="withdrawError" class="state state--error">{{ withdrawError }}</div>
              <div v-else-if="!filteredWithdrawRequests.length && !withdrawLoading" class="state">当前没有匹配的提现申请。</div>
              <template v-else>
                <button
                  v-for="item in filteredWithdrawRequests"
                  :key="item.id"
                  type="button"
                  class="order-card"
                  :class="{ 'order-card--active': Number(item.id) === Number(activeWithdrawId) }"
                  @click="selectWithdraw(item.id)"
                >
                  <div class="order-card-top">
                    <div class="order-card-title">
                      <strong>{{ item.request_no }}</strong>
                    </div>
                    <span>{{ formatDateTime(item.created_at) }}</span>
                  </div>
                  <p>用户：{{ item.username || '未知用户' }}</p>
                  <div class="order-card-meta">
                    <span>手机号：{{ item.phone || '-' }}</span>
                    <span>方式：{{ getWithdrawChannelLabel(item.channel) }}</span>
                  </div>
                  <div class="order-card-meta">
                    <span>提现金额：￥{{ formatMoney(item.amount) }}</span>
                    <span>状态：{{ getWithdrawStatusLabel(item.status) }}</span>
                  </div>
                  <p class="reason">{{ item.remark || '等待管理员审核' }}</p>
                </button>
              </template>
            </div>
            <div
              v-show="ordersScrollbarEnabled"
              class="panel-scrollbar"
              :class="{ 'panel-scrollbar--visible': ordersScrollbarVisible }"
              aria-hidden="true"
            >
              <span class="panel-scrollbar-thumb" :style="getScrollbarThumbStyle('orders')"></span>
            </div>
          </div>
        </aside>

        <section class="panel panel--detail">
          <template v-if="activeWithdrawRequest">
            <div class="panel-head">
              <h3>审核详情</h3>
              <span class="badge" :class="`badge--${activeWithdrawRequest.status}`">
                {{ getWithdrawStatusLabel(activeWithdrawRequest.status) }}
              </span>
            </div>

            <div class="panel-scroll-shell">
              <div
                ref="detailPanel"
                class="panel-body panel-body--detail"
                @scroll="handlePanelScroll('detail')"
              >
                <div class="detail-grid">
                  <div><span>提现单号</span><strong>{{ activeWithdrawRequest.request_no }}</strong></div>
                  <div><span>申请用户</span><strong>{{ activeWithdrawRequest.username || '-' }}</strong></div>
                  <div><span>手机号</span><strong>{{ activeWithdrawRequest.phone || '-' }}</strong></div>
                  <div><span>提现方式</span><strong>{{ getWithdrawChannelLabel(activeWithdrawRequest.channel) }}</strong></div>
                  <div><span>提现金额</span><strong>￥{{ formatMoney(activeWithdrawRequest.amount) }}</strong></div>
                  <div><span>手续费</span><strong>￥{{ formatMoney(activeWithdrawRequest.fee_amount) }}</strong></div>
                  <div><span>到账金额</span><strong>￥{{ formatMoney(activeWithdrawRequest.net_amount) }}</strong></div>
                  <div><span>申请时间</span><strong>{{ formatDateTime(activeWithdrawRequest.created_at) }}</strong></div>
                  <div><span>审核时间</span><strong>{{ formatDateTime(activeWithdrawRequest.reviewed_at) }}</strong></div>
                  <div><span>打款时间</span><strong>{{ formatDateTime(activeWithdrawRequest.paid_at) }}</strong></div>
                </div>

                <div class="info-blocks">
                  <article class="info-block">
                    <h4>收款信息</h4>
                    <p>收款人：{{ activeWithdrawRequest.account_name || '-' }}</p>
                    <p>收款账号：{{ activeWithdrawRequest.account_no_masked || '-' }}</p>
                    <p>渠道备注：{{ activeWithdrawRequest.provider || 'manual' }}</p>
                  </article>
                  <article class="info-block">
                    <h4>审核说明</h4>
                    <p>{{ activeWithdrawRequest.remark || '暂无审核说明。' }}</p>
                    <p v-if="activeWithdrawRequest.failure_reason">失败原因：{{ activeWithdrawRequest.failure_reason }}</p>
                  </article>
                </div>

                <article class="info-block">
                  <div class="note-head">
                    <h4>审核备注</h4>
                    <span>{{ withdrawRemarkDraft.length }}/255</span>
                  </div>
                  <textarea
                    v-model.trim="withdrawRemarkDraft"
                    class="note-textarea"
                    rows="4"
                    maxlength="255"
                    placeholder="填写审核备注，驳回时建议说明具体原因。"
                  ></textarea>
                </article>

                <div class="detail-actions">
                  <button
                    v-if="canApproveWithdraw"
                    type="button"
                    class="ok-btn"
                    :disabled="withdrawSubmitting"
                    @click="reviewWithdraw('approve')"
                  >
                    {{ withdrawSubmitting ? '提交中...' : '通过并发起打款' }}
                  </button>
                  <button
                    v-if="canRejectWithdraw"
                    type="button"
                    class="danger-btn"
                    :disabled="withdrawSubmitting"
                    @click="reviewWithdraw('reject')"
                  >
                    {{ withdrawSubmitting ? '提交中...' : '驳回并退回余额' }}
                  </button>
                </div>
              </div>
              <div
                v-show="detailScrollbarEnabled"
                class="panel-scrollbar"
                :class="{ 'panel-scrollbar--visible': detailScrollbarVisible }"
                aria-hidden="true"
              >
                <span class="panel-scrollbar-thumb" :style="getScrollbarThumbStyle('detail')"></span>
              </div>
            </div>
          </template>

          <div v-else class="panel-scroll-shell">
            <div
              ref="detailPanel"
              class="panel-body panel-body--detail panel-body--empty"
              @scroll="handlePanelScroll('detail')"
            >
              <div class="state">请选择一条提现申请查看详情。</div>
            </div>
            <div
              v-show="detailScrollbarEnabled"
              class="panel-scrollbar"
              :class="{ 'panel-scrollbar--visible': detailScrollbarVisible }"
              aria-hidden="true"
            >
              <span class="panel-scrollbar-thumb" :style="getScrollbarThumbStyle('detail')"></span>
            </div>
          </div>
        </section>
      </div>
    </template>

    <div v-else class="panel">
      <div class="state state--error">当前账号无权访问工作台。</div>
    </div>
  </section>
</template>

<script>
import { io } from 'socket.io-client'
import { apiFetch } from '../utils/api.js'
import { formatMoneyFixed } from '../utils/money'
import { getSocketServerUrl } from '../utils/runtime.js'
import { showErrorToast, showSuccessToast } from '../utils/toast.js'
import { showConfirm } from '../utils/confirm.js'
import ConversationPanel from './ConversationPanel.vue'

export default {
  name: 'SupportConsole',
  components: { ConversationPanel },
  props: {
    currentUserRole: {
      type: String,
      default: ''
    }
  },
  data() {
    return {
      activeDesk: 'aftersale',
      loading: false,
      error: '',
      keyword: '',
      keywordDraft: '',
      activeStatus: 'handling',
      counts: { pending: 0, handling: 0, resolved: 0 },
      alerts: { pending_timeout_total: 0 },
      workload: { my_handling_count: 0, my_resolved_total: 0, my_resolved_today: 0 },
      orders: [],
      activeOrderId: 0,
      timeline: [],
      timelineLoading: false,
      timelineError: '',
      noteDraft: '',
      freezeReasonDraft: '',
      freezeDialogVisible: false,
      noteSaving: false,
      statusSubmitting: false,
      cancelSubmitting: false,
      settlementSubmitting: false,
      reconcileSubmitting: false,
      messagePanelVisible: false,
      activeConversationType: 'order',
      activeConversationOrderId: 0,
      activeConversationConsultationId: 0,
      presaleLoading: false,
      presaleError: '',
      presaleCounts: { handling: 0, resolved: 0 },
      presaleWorkload: { my_handling_count: 0, my_resolved_total: 0, my_resolved_today: 0 },
      presaleConsultations: [],
      activePresaleId: 0,
      presaleNoteDraft: '',
      presaleNoteSaving: false,
      presaleResolving: false,
      ordersScrollbarVisible: false,
      detailScrollbarVisible: false,
      ordersScrollbarEnabled: false,
      detailScrollbarEnabled: false,
      ordersScrollbarThumbTop: 0,
      detailScrollbarThumbTop: 0,
      ordersScrollbarThumbHeight: 0,
      detailScrollbarThumbHeight: 0,
      withdrawLoading: false,
      withdrawError: '',
      withdrawKeyword: '',
      withdrawKeywordDraft: '',
      activeWithdrawStatus: 'pending_review',
      withdrawRequests: [],
      activeWithdrawId: 0,
      withdrawRemarkDraft: '',
      withdrawSubmitting: false,
      withdrawSummary: {
        pending_review: 0,
        processing: 0,
        success: 0,
        failed: 0,
        rejected: 0,
        cancelled: 0
      },
      scrollbarFadeTimers: {
        orders: null,
        detail: null
      },
      supportDeskUnreadSummary: {
        aftersale: 0,
        presale: 0
      },
      realtimeSocket: null,
      realtimeRefreshTimer: null,
      realtimeRefreshQueuedDesk: ''
    }
  },
  computed: {
    isSupportUser() {
      return this.currentUserRole === 'support'
    },
    isAdminUser() {
      return this.currentUserRole === 'admin'
    },
    canAccessOrderDesk() {
      return this.isSupportUser
    },
    canAccessWithdrawDesk() {
      return this.isAdminUser
    },
    isAfterSaleDesk() {
      return this.activeDesk === 'aftersale'
    },
    hasAfterSaleUnreadDot() {
      return Number(this.supportDeskUnreadSummary.aftersale || 0) > 0
    },
    hasPresaleUnreadDot() {
      return Number(this.supportDeskUnreadSummary.presale || 0) > 0
    },
    searchPlaceholder() {
      return this.isAfterSaleDesk ? '搜索订单号、买家、卖家' : '搜索咨询编号、咨询用户、客服'
    },
    currentLoading() {
      return this.isAfterSaleDesk ? this.loading : this.presaleLoading
    },
    currentError() {
      return this.isAfterSaleDesk ? this.error : this.presaleError
    },
    currentCounts() {
      return this.isAfterSaleDesk ? this.counts : this.presaleCounts
    },
    currentWorkload() {
      return this.isAfterSaleDesk ? this.workload : this.presaleWorkload
    },
    currentList() {
      return this.isAfterSaleDesk ? this.orders : this.presaleConsultations
    },
    statusTabs() {
      const counts = this.currentCounts
      return [
        { value: 'handling', label: '处理中', count: counts.handling || 0 },
        { value: 'resolved', label: '已完成', count: counts.resolved || 0 }
      ]
    },
    withdrawStatusTabs() {
      return [
        { value: 'pending_review', label: `待审核 ${this.withdrawSummary.pending_review || 0}` },
        { value: 'processing', label: `处理中 ${this.withdrawSummary.processing || 0}` },
        { value: 'success', label: `已打款 ${this.withdrawSummary.success || 0}` },
        { value: 'failed', label: `打款失败 ${this.withdrawSummary.failed || 0}` },
        { value: 'rejected', label: `已驳回 ${this.withdrawSummary.rejected || 0}` }
      ]
    },
    activeOrder() {
      return this.orders.find((item) => Number(item.id) === Number(this.activeOrderId)) || null
    },
    activePresaleConsultation() {
      return this.presaleConsultations.find((item) => Number(item.id) === Number(this.activePresaleId)) || null
    },
    filteredWithdrawRequests() {
      const keyword = String(this.withdrawKeyword || '').trim().toLowerCase()
      const list = this.withdrawRequests.filter((item) => (
        String(item.status || '').trim() === this.activeWithdrawStatus
      ))
      if (!keyword) return list
      return list.filter((item) => {
        const haystack = [
          item.request_no,
          item.username,
          item.phone,
          item.account_name,
          item.account_no_masked
        ]
          .map((value) => String(value || '').toLowerCase())
          .join(' ')
        return haystack.includes(keyword)
      })
    },
    activeWithdrawRequest() {
      return this.filteredWithdrawRequests.find((item) => Number(item.id) === Number(this.activeWithdrawId)) || null
    },
    canApproveWithdraw() {
      return this.activeWithdrawRequest?.status === 'pending_review'
    },
    canRejectWithdraw() {
      return this.activeWithdrawRequest?.status === 'pending_review'
    },
    canSaveNote() {
      return this.activeOrder && String(this.noteDraft || '').trim() !== String(this.activeOrder.support_note || '').trim()
    },
    canSavePresaleNote() {
      return this.activePresaleConsultation
        && String(this.presaleNoteDraft || '').trim() !== String(this.activePresaleConsultation.support_note || '').trim()
    },
    canResolvePresale() {
      return this.activePresaleConsultation?.support_status !== 'resolved'
    },
    canExecuteSettlement() {
      return (
        this.activeOrder?.status === 'settlement_pending'
        && Boolean(this.activeOrder?.seller_item_confirmed_at)
      ) || (
        this.activeOrder?.status === 'support_handling'
        && this.activeOrder?.support_scene === 'fund_frozen'
        && this.activeOrder?.support_status !== 'resolved'
      )
    },
    canCancelOrder() {
      return this.activeOrder?.status === 'support_handling'
        && this.activeOrder?.support_scene === 'cancel_request'
        && this.activeOrder?.support_status !== 'resolved'
    },
    canContinueOrder() {
      return this.activeOrder?.status === 'support_handling'
        && this.activeOrder?.support_scene === 'cancel_request'
        && this.activeOrder?.support_status !== 'resolved'
    },
    canReturnToSettlement() {
      return this.activeOrder?.status === 'support_handling'
        && this.activeOrder?.support_scene === 'settlement_dispute'
        && this.activeOrder?.support_status !== 'resolved'
    },
    canFreezeFunds() {
      return ['paid', 'settlement_pending'].includes(String(this.activeOrder?.status || '').trim())
        && this.activeOrder?.support_scene !== 'fund_frozen'
        && this.activeOrder?.support_status !== 'resolved'
    },
    canReleaseFunds() {
      return this.activeOrder?.status === 'support_handling'
        && this.activeOrder?.support_scene === 'fund_frozen'
        && this.activeOrder?.support_status !== 'resolved'
    },
    canReconcileFunds() {
      return this.activeOrder?.status === 'support_handling'
        && ['cancel_refund_processing', 'settlement_funds_processing', 'frozen_funds_processing'].includes(
          String(this.activeOrder?.support_scene || '').trim()
        )
        && this.activeOrder?.support_status !== 'resolved'
    }
  },
  watch: {
    activeOrder: {
      immediate: true,
      handler(order) {
        this.noteDraft = order?.support_note || ''
        this.freezeReasonDraft = order?.support_freeze_reason || ''
        this.freezeDialogVisible = false
        this.$nextTick(() => {
          this.updateScrollbar('detail')
        })
      }
    },
    activeOrderId: {
      immediate: true,
      handler(orderId) {
        if (!this.isAfterSaleDesk) return
        if (!Number(orderId || 0)) {
          this.timeline = []
          this.$nextTick(() => {
            this.updateScrollbar('detail')
          })
          return
        }
        this.fetchTimeline(orderId)
      }
    },
    activePresaleConsultation: {
      immediate: true,
      handler(consultation) {
        this.presaleNoteDraft = consultation?.support_note || ''
        this.$nextTick(() => {
          this.updateScrollbar('detail')
        })
      }
    },
    activeWithdrawRequest: {
      immediate: true,
      handler(request) {
        this.withdrawRemarkDraft = request?.remark || ''
        this.$nextTick(() => {
          this.updateScrollbar('detail')
        })
      }
    }
  },
  mounted() {
    if (this.canAccessOrderDesk) {
      this.fetchOrders()
      this.fetchSupportDeskUnreadSummary()
      this.setupRealtimeSupportDeskSocket()
    } else if (this.canAccessWithdrawDesk) {
      this.fetchWithdrawRequests()
    }
    window.addEventListener('resize', this.refreshScrollbars)
  },
  beforeUnmount() {
    this.clearScrollbarFadeTimer('orders')
    this.clearScrollbarFadeTimer('detail')
    this.teardownRealtimeSupportDeskSocket()
    window.removeEventListener('resize', this.refreshScrollbars)
  },
  methods: {
    applySupportDeskUnreadSummary(summary = {}) {
      this.supportDeskUnreadSummary = {
        aftersale: Math.max(0, Number(
          summary?.support_aftersale_unread_total
          ?? summary?.supportAftersaleUnreadTotal
          ?? this.supportDeskUnreadSummary.aftersale
          ?? 0
        )),
        presale: Math.max(0, Number(
          summary?.support_presale_unread_total
          ?? summary?.supportPresaleUnreadTotal
          ?? this.supportDeskUnreadSummary.presale
          ?? 0
        ))
      }
    },
    async fetchSupportDeskUnreadSummary() {
      if (!this.canAccessOrderDesk) return
      try {
        const summary = await apiFetch('/api/conversations/unread-summary')
        this.applySupportDeskUnreadSummary(summary)
      } catch (_error) {
        // 红点拉取失败不阻断客服工作台主流程。
      }
    },
    setupRealtimeSupportDeskSocket() {
      if (!this.canAccessOrderDesk || this.realtimeSocket) return
      const socket = io(getSocketServerUrl(), {
        withCredentials: true,
        transports: ['websocket', 'polling']
      })

      socket.on('support:desk:update', (payload = {}) => {
        const desk = String(payload?.desk || '').trim().toLowerCase() === 'presale'
          ? 'presale'
          : 'aftersale'
        this.queueRealtimeDeskRefresh(desk)
      })

      socket.on('message:notify', (payload = {}) => {
        this.applySupportDeskUnreadSummary(payload?.unread_summary || {})
      })

      socket.on('message:read', (payload = {}) => {
        this.applySupportDeskUnreadSummary(payload?.unread_summary || {})
      })

      socket.on('connect_error', () => {
        // 实时同步失败时保留手动刷新作为兜底，不打断页面使用。
      })

      this.realtimeSocket = socket
    },
    teardownRealtimeSupportDeskSocket() {
      if (this.realtimeRefreshTimer) {
        window.clearTimeout(this.realtimeRefreshTimer)
        this.realtimeRefreshTimer = null
      }
      this.realtimeRefreshQueuedDesk = ''
      if (this.realtimeSocket) {
        this.realtimeSocket.disconnect()
        this.realtimeSocket = null
      }
    },
    queueRealtimeDeskRefresh(desk = 'aftersale') {
      const normalizedDesk = String(desk || '').trim().toLowerCase() === 'presale'
        ? 'presale'
        : 'aftersale'
      this.realtimeRefreshQueuedDesk = normalizedDesk
      if (this.realtimeRefreshTimer) {
        window.clearTimeout(this.realtimeRefreshTimer)
      }
      this.realtimeRefreshTimer = window.setTimeout(() => {
        const queuedDesk = this.realtimeRefreshQueuedDesk
        this.realtimeRefreshTimer = null
        this.realtimeRefreshQueuedDesk = ''
        void this.refreshDeskByRealtimeEvent(queuedDesk)
      }, 250)
    },
    async refreshDeskByRealtimeEvent(desk = 'aftersale') {
      if (!this.canAccessOrderDesk) return
      const normalizedDesk = String(desk || '').trim().toLowerCase() === 'presale'
        ? 'presale'
        : 'aftersale'
      if (normalizedDesk !== this.activeDesk) return
      if (normalizedDesk === 'presale') {
        if (this.presaleLoading) {
          this.queueRealtimeDeskRefresh(normalizedDesk)
          return
        }
        await this.fetchPresaleConsultations(this.activeStatus)
        return
      }
      if (this.loading) {
        this.queueRealtimeDeskRefresh(normalizedDesk)
        return
      }
      await this.fetchOrders(this.activeStatus)
    },
    handlePanelScroll(panel) {
      const visibleKey = this.getScrollbarStateKey(panel, 'Visible')
      this.updateScrollbar(panel)
      if (!this[this.getScrollbarStateKey(panel, 'Enabled')]) return
      this[visibleKey] = true
      this.clearScrollbarFadeTimer(panel)
      this.scrollbarFadeTimers[panel] = window.setTimeout(() => {
        this[visibleKey] = false
        this.scrollbarFadeTimers[panel] = null
      }, 1000)
    },
    refreshScrollbars() {
      this.$nextTick(() => {
        this.updateScrollbar('orders')
        this.updateScrollbar('detail')
      })
    },
    getScrollbarStateKey(panel, suffix) {
      return `${panel}Scrollbar${suffix}`
    },
    updateScrollbar(panel) {
      const panelRef = panel === 'orders' ? 'ordersPanel' : 'detailPanel'
      const element = this.$refs[panelRef]
      if (!element) return

      const enabledKey = this.getScrollbarStateKey(panel, 'Enabled')
      const visibleKey = this.getScrollbarStateKey(panel, 'Visible')
      const thumbTopKey = this.getScrollbarStateKey(panel, 'ThumbTop')
      const thumbHeightKey = this.getScrollbarStateKey(panel, 'ThumbHeight')
      const { scrollTop, scrollHeight, clientHeight } = element

      if (scrollHeight <= clientHeight + 1) {
        this[enabledKey] = false
        this[visibleKey] = false
        this[thumbTopKey] = 0
        this[thumbHeightKey] = 0
        this.clearScrollbarFadeTimer(panel)
        return
      }

      const thumbHeight = Math.max((clientHeight / scrollHeight) * clientHeight, 36)
      const maxThumbTop = Math.max(clientHeight - thumbHeight, 0)
      const maxScrollTop = Math.max(scrollHeight - clientHeight, 1)

      this[enabledKey] = true
      this[thumbHeightKey] = thumbHeight
      this[thumbTopKey] = (scrollTop / maxScrollTop) * maxThumbTop
    },
    getScrollbarThumbStyle(panel) {
      const thumbTop = this[this.getScrollbarStateKey(panel, 'ThumbTop')]
      const thumbHeight = this[this.getScrollbarStateKey(panel, 'ThumbHeight')]
      return {
        height: `${thumbHeight}px`,
        transform: `translateY(${thumbTop}px)`
      }
    },
    clearScrollbarFadeTimer(panel) {
      const timer = this.scrollbarFadeTimers[panel]
      if (timer) {
        window.clearTimeout(timer)
        this.scrollbarFadeTimers[panel] = null
      }
    },
    async fetchOrders(status = this.activeStatus) {
      this.activeStatus = status
      this.loading = true
      this.error = ''
      try {
        const params = new URLSearchParams({
          page: '1',
          pageSize: '50',
          status
        })
        if (this.keyword) {
          params.set('keyword', this.keyword)
        }
        const data = await apiFetch(`/api/support/orders?${params.toString()}`)
        this.orders = Array.isArray(data.list) ? data.list : []
        this.counts = {
          pending: Number(data.counts?.pending || 0),
          handling: Number(data.counts?.handling || 0),
          resolved: Number(data.counts?.resolved || 0)
        }
        this.alerts = {
          pending_timeout_total: Number(data.alerts?.pending_timeout_total || 0)
        }
        this.workload = {
          my_handling_count: Number(data.workload?.my_handling_count || 0),
          my_resolved_total: Number(data.workload?.my_resolved_total || 0),
          my_resolved_today: Number(data.workload?.my_resolved_today || 0)
        }
        if (this.orders.length && !this.orders.some((item) => Number(item.id) === Number(this.activeOrderId))) {
          this.activeOrderId = Number(this.orders[0].id)
        }
        if (!this.orders.length) {
          this.activeOrderId = 0
        }
        this.refreshScrollbars()
      } catch (error) {
        this.error = error.message || '加载客服订单失败'
      } finally {
        this.loading = false
        this.refreshScrollbars()
      }
    },
    async fetchTimeline(orderId) {
      this.timelineLoading = true
      this.timelineError = ''
      try {
        const data = await apiFetch(`/api/support/orders/${orderId}/timeline`)
        this.timeline = Array.isArray(data.list) ? data.list : []
      } catch (error) {
        this.timeline = []
        this.timelineError = error.message || '加载时间线失败'
      } finally {
        this.timelineLoading = false
        this.refreshScrollbars()
      }
    },
    async fetchPresaleConsultations(status = this.activeStatus) {
      this.activeStatus = status
      this.presaleLoading = true
      this.presaleError = ''
      try {
        const params = new URLSearchParams({
          page: '1',
          pageSize: '50',
          status
        })
        if (this.keyword) {
          params.set('keyword', this.keyword)
        }
        const data = await apiFetch(`/api/support/presale-consultations?${params.toString()}`)
        this.presaleConsultations = Array.isArray(data.list) ? data.list : []
        this.presaleCounts = {
          handling: Number(data.counts?.handling || 0),
          resolved: Number(data.counts?.resolved || 0)
        }
        this.presaleWorkload = {
          my_handling_count: Number(data.workload?.my_handling_count || 0),
          my_resolved_total: Number(data.workload?.my_resolved_total || 0),
          my_resolved_today: Number(data.workload?.my_resolved_today || 0)
        }
        if (this.presaleConsultations.length && !this.presaleConsultations.some((item) => Number(item.id) === Number(this.activePresaleId))) {
          this.activePresaleId = Number(this.presaleConsultations[0].id)
        }
        if (!this.presaleConsultations.length) {
          this.activePresaleId = 0
        }
        this.refreshScrollbars()
      } catch (error) {
        this.presaleError = error.message || '加载售前咨询失败'
      } finally {
        this.presaleLoading = false
        this.refreshScrollbars()
      }
    },
    async applyFilters() {
      this.keyword = String(this.keywordDraft || '').trim().slice(0, 50)
      if (this.isAfterSaleDesk) {
        await this.fetchOrders(this.activeStatus)
        return
      }
      await this.fetchPresaleConsultations(this.activeStatus)
    },
    applyWithdrawFilters() {
      this.withdrawKeyword = String(this.withdrawKeywordDraft || '').trim().slice(0, 50)
      if (this.filteredWithdrawRequests.length && !this.filteredWithdrawRequests.some((item) => Number(item.id) === Number(this.activeWithdrawId))) {
        this.activeWithdrawId = Number(this.filteredWithdrawRequests[0].id || 0)
      }
      if (!this.filteredWithdrawRequests.length) {
        this.activeWithdrawId = 0
      }
      this.refreshScrollbars()
    },
    changeStatus(status) {
      if (status === this.activeStatus) return
      if (this.isAfterSaleDesk) {
        this.fetchOrders(status)
        return
      }
      this.fetchPresaleConsultations(status)
    },
    async changeDesk(desk) {
      const nextDesk = desk === 'presale' ? 'presale' : 'aftersale'
      if (nextDesk === this.activeDesk) return
      this.activeDesk = nextDesk
      this.messagePanelVisible = false
      this.handleConversationClose()
      this.refreshScrollbars()
      if (this.isAfterSaleDesk) {
        await this.fetchOrders(this.activeStatus)
        return
      }
      await this.fetchPresaleConsultations(this.activeStatus)
    },
    async fetchWithdrawRequests() {
      this.withdrawLoading = true
      this.withdrawError = ''
      try {
        const data = await apiFetch('/api/admin/withdraw-requests')
        const list = Array.isArray(data.list) ? data.list : []
        this.withdrawRequests = list
        this.withdrawSummary = list.reduce((summary, item) => {
          const key = String(item.status || '').trim()
          if (Object.prototype.hasOwnProperty.call(summary, key)) {
            summary[key] += 1
          }
          return summary
        }, {
          pending_review: 0,
          processing: 0,
          success: 0,
          failed: 0,
          rejected: 0,
          cancelled: 0
        })
        if (list.length && !list.some((item) => Number(item.id) === Number(this.activeWithdrawId))) {
          this.activeWithdrawId = Number(list[0].id || 0)
        }
        if (!list.length) {
          this.activeWithdrawId = 0
        }
        this.applyWithdrawFilters()
      } catch (error) {
        this.withdrawRequests = []
        this.withdrawSummary = {
          pending_review: 0,
          processing: 0,
          success: 0,
          failed: 0,
          rejected: 0,
          cancelled: 0
        }
        this.activeWithdrawId = 0
        this.withdrawError = error.message || '加载提现申请失败'
      } finally {
        this.withdrawLoading = false
        this.refreshScrollbars()
      }
    },
    changeWithdrawStatus(status) {
      if (status === this.activeWithdrawStatus) return
      this.activeWithdrawStatus = status
      this.applyWithdrawFilters()
    },
    selectWithdraw(withdrawId) {
      this.activeWithdrawId = Number(withdrawId || 0)
    },
    async reviewWithdraw(action) {
      if (!this.activeWithdrawRequest || this.withdrawSubmitting) return
      const actionText = action === 'approve' ? '通过并发起打款' : '驳回并退回余额'
      const message = action === 'approve'
        ? '确认通过该提现申请吗？通过后系统将按当前支付配置发起打款。'
        : '确认驳回该提现申请吗？驳回后金额将退回用户钱包余额。'
      const confirmed = await showConfirm({
        title: actionText,
        message,
        confirmText: actionText,
        cancelText: '取消',
        tone: action === 'approve' ? 'primary' : 'danger'
      })
      if (!confirmed) return

      this.withdrawSubmitting = true
      try {
        const data = await apiFetch(`/api/admin/withdraw-requests/${this.activeWithdrawRequest.id}/review`, {
          method: 'POST',
          body: JSON.stringify({
            action,
            remark: this.withdrawRemarkDraft
          })
        })
        showSuccessToast(action === 'approve' ? '提现审核已通过' : '提现申请已驳回')
        const nextId = Number(data.withdraw_request?.id || this.activeWithdrawRequest.id || 0)
        await this.fetchWithdrawRequests()
        this.activeWithdrawId = nextId
      } catch (error) {
        showErrorToast(error.message || '提交提现审核失败')
      } finally {
        this.withdrawSubmitting = false
      }
    },
    selectOrder(orderId) {
      this.activeOrderId = Number(orderId || 0)
    },
    handleOrderCardDoubleClick(orderId) {
      this.openConversation(orderId, 'order')
    },
    selectPresaleConsultation(consultationId) {
      this.activePresaleId = Number(consultationId || 0)
    },
    handlePresaleCardDoubleClick(consultationId) {
      this.openConversation(consultationId, 'presale')
    },
    openConversation(targetId, type = 'order') {
      const conversationType = String(type || '').trim().toLowerCase() === 'presale' ? 'presale' : 'order'
      this.activeConversationType = conversationType
      if (conversationType === 'presale') {
        this.activePresaleId = Number(targetId || 0)
        this.activeConversationOrderId = 0
        this.activeConversationConsultationId = Number(targetId || 0)
        this.presaleConsultations = this.presaleConsultations.map((item) => (
          Number(item.id) === Number(this.activeConversationConsultationId)
            ? { ...item, conversation_unread_count: 0 }
            : item
        ))
      } else {
        this.activeOrderId = Number(targetId || 0)
        this.activeConversationOrderId = Number(targetId || 0)
        this.activeConversationConsultationId = 0
        this.orders = this.orders.map((item) => (
          Number(item.id) === Number(this.activeConversationOrderId)
            ? { ...item, conversation_unread_count: 0 }
            : item
        ))
      }
      this.messagePanelVisible = true
    },
    handleConversationClose() {
      this.messagePanelVisible = false
      this.activeConversationType = this.isAfterSaleDesk ? 'order' : 'presale'
      this.activeConversationOrderId = 0
      this.activeConversationConsultationId = 0
    },
    openFreezeDialog() {
      if (!this.canFreezeFunds || this.statusSubmitting) return
      this.freezeReasonDraft = String(this.activeOrder?.support_freeze_reason || '').trim()
      this.freezeDialogVisible = true
      this.$nextTick(() => {
        this.$refs.freezeReasonInput?.focus()
      })
    },
    closeFreezeDialog() {
      if (this.statusSubmitting) return
      this.freezeDialogVisible = false
      this.freezeReasonDraft = this.activeOrder?.support_freeze_reason || ''
    },
    async saveNote() {
      if (!this.activeOrder || !this.canSaveNote) return
      this.noteSaving = true
      try {
        const updated = await apiFetch(`/api/support/orders/${this.activeOrder.id}/note`, {
          method: 'PUT',
          body: JSON.stringify({ note: this.noteDraft })
        })
        this.orders = this.orders.map((item) => (
          Number(item.id) === Number(updated.id)
            ? { ...item, ...updated, support_note: updated.support_note || '' }
            : item
        ))
        showSuccessToast('内部备注已保存')
        await this.fetchTimeline(this.activeOrder.id)
      } catch (error) {
        showErrorToast(error.message || '保存内部备注失败')
      } finally {
        this.noteSaving = false
      }
    },
    async savePresaleNote() {
      if (!this.activePresaleConsultation || !this.canSavePresaleNote) return
      this.presaleNoteSaving = true
      try {
        const updated = await apiFetch(`/api/support/presale-consultations/${this.activePresaleConsultation.id}/note`, {
          method: 'PUT',
          body: JSON.stringify({ note: this.presaleNoteDraft })
        })
        this.presaleConsultations = this.presaleConsultations.map((item) => (
          Number(item.id) === Number(updated.id)
            ? { ...item, ...updated, support_note: updated.support_note || '' }
            : item
        ))
        showSuccessToast('售前备注已保存')
      } catch (error) {
        showErrorToast(error.message || '保存售前备注失败')
      } finally {
        this.presaleNoteSaving = false
      }
    },
    async resolvePresaleConsultation() {
      if (!this.activePresaleConsultation || this.presaleResolving || !this.canResolvePresale) return
      const confirmed = await showConfirm({
        title: '完成售前咨询',
        message: '确认将当前售前咨询标记为已完成吗？系统会同步向会话内发送完成通知。',
        confirmText: '确认完成',
        cancelText: '返回',
        tone: 'primary'
      })
      if (!confirmed) return

      this.presaleResolving = true
      try {
        await apiFetch(`/api/support/presale-consultations/${this.activePresaleConsultation.id}/resolve`, {
          method: 'PUT',
          body: JSON.stringify({ note: this.presaleNoteDraft })
        })
        showSuccessToast('售前咨询已完成')
        await this.fetchPresaleConsultations(this.activeStatus)
      } catch (error) {
        showErrorToast(error.message || '完成售前咨询失败')
      } finally {
        this.presaleResolving = false
      }
    },
    async executeSettlement() {
      if (!this.activeOrder) return
      const isFrozenSettlement = this.activeOrder?.status === 'support_handling'
        && this.activeOrder?.support_scene === 'fund_frozen'
      const confirmed = await showConfirm({
        title: '执行分账',
        message: isFrozenSettlement
          ? '是否确认按冻结资金规则执行分账？执行后将全额退还买家押金，买家支付租金全部计入平台收益，卖家无收益，且无需提交额外物品使用表单。'
          : '是否确认执行分账？执行后将发起买家原路退款与卖家余额支付，订单会在支付通道确认后自动完成。',
        confirmText: '确认执行',
        cancelText: '返回',
        tone: 'primary'
      })
      if (!confirmed) return
      this.settlementSubmitting = true
      try {
        await apiFetch(
          `/api/support/orders/${this.activeOrder.id}/execute-settlement`,
          {
            method: 'PUT'
          }
        )
        showSuccessToast('分账执行成功')
        await this.fetchOrders(this.activeStatus)
      } catch (error) {
        showErrorToast(error.message || '执行分账失败')
      } finally {
        this.settlementSubmitting = false
      }
    },
    async reconcileFunds() {
      if (!this.activeOrder || this.reconcileSubmitting) return
      this.reconcileSubmitting = true
      try {
        const result = await apiFetch(
          `/api/support/orders/${this.activeOrder.id}/reconcile-funds`,
          {
            method: 'POST'
          }
        )
        showSuccessToast(result?.finalized ? '资金结果已同步，订单已自动收口' : '已同步最新资金结果')
        await this.fetchOrders(this.activeStatus)
        if (this.activeOrderId) {
          await this.fetchTimeline(this.activeOrderId)
        }
      } catch (error) {
        showErrorToast(error.message || '同步资金结果失败')
      } finally {
        this.reconcileSubmitting = false
      }
    },
    async cancelOrderBySupport() {
      if (!this.activeOrder || this.cancelSubmitting) return
      const confirmed = await showConfirm({
        title: '取消订单',
        message: '确认由客服取消该订单吗？该操作将按规则执行全额退款处理，并在聊天室留痕。',
        confirmText: '确认取消',
        cancelText: '返回',
        tone: 'danger'
      })
      if (!confirmed) return

      this.cancelSubmitting = true
      try {
        await apiFetch(`/api/support/orders/${this.activeOrder.id}/cancel`, {
          method: 'PUT',
          body: JSON.stringify({
            note: this.noteDraft
          })
        })
        showSuccessToast('订单已取消')
        await this.fetchOrders(this.activeStatus)
        if (this.activeOrderId) {
          await this.fetchTimeline(this.activeOrderId)
        }
      } catch (error) {
        showErrorToast(error.message || '客服取消订单失败')
      } finally {
        this.cancelSubmitting = false
      }
    },
    async continueOrder() {
      if (!this.activeOrder || this.statusSubmitting) return
      this.statusSubmitting = true
      try {
        const updated = await apiFetch(`/api/support/orders/${this.activeOrder.id}/continue`, {
          method: 'PUT',
          body: JSON.stringify({
            note: this.noteDraft
          })
        })
        this.orders = this.orders.map((item) => (
          Number(item.id) === Number(updated.id)
            ? { ...item, ...updated, support_status: updated.support_status || item.support_status, support_note: updated.support_note || this.noteDraft }
            : item
        ))
        showSuccessToast('订单已恢复为已支付状态')
        await this.fetchOrders(this.activeStatus)
      } catch (error) {
        showErrorToast(error.message || '继续履约失败')
      } finally {
        this.statusSubmitting = false
      }
    },
    async returnToSettlement() {
      if (!this.activeOrder || this.statusSubmitting) return
      this.statusSubmitting = true
      try {
        const updated = await apiFetch(`/api/support/orders/${this.activeOrder.id}/return-to-settlement`, {
          method: 'PUT',
          body: JSON.stringify({
            note: this.noteDraft
          })
        })
        this.orders = this.orders.map((item) => (
          Number(item.id) === Number(updated.id)
            ? { ...item, ...updated, support_status: updated.support_status || item.support_status, support_note: updated.support_note || this.noteDraft }
            : item
        ))
        showSuccessToast('订单已返回结算中')
        await this.fetchOrders(this.activeStatus)
      } catch (error) {
        showErrorToast(error.message || '返回结算中失败')
      } finally {
        this.statusSubmitting = false
      }
    },
    async freezeFunds() {
      if (!this.activeOrder || this.statusSubmitting || !this.freezeDialogVisible) return
      if (!String(this.freezeReasonDraft || '').trim()) {
        showErrorToast('请先填写冻结原因')
        return
      }

      this.statusSubmitting = true
      try {
        await apiFetch(
          `/api/support/orders/${this.activeOrder.id}/freeze-funds`,
          {
            method: 'PUT',
            body: JSON.stringify({
              freezeReason: this.freezeReasonDraft
            })
          }
        )
        this.freezeDialogVisible = false
        showSuccessToast('订单资金已冻结')
        await this.fetchOrders(this.activeStatus)
      } catch (error) {
        showErrorToast(error.message || '冻结资金失败')
      } finally {
        this.statusSubmitting = false
      }
    },
    async releaseFunds() {
      if (!this.activeOrder || this.statusSubmitting) return
      const confirmed = await showConfirm({
        title: '解除冻结',
        message: '确认解除该订单资金冻结吗？解除后订单会恢复到冻结前的正常流程。',
        confirmText: '确认解除',
        cancelText: '返回',
        tone: 'primary'
      })
      if (!confirmed) return

      this.statusSubmitting = true
      try {
        await apiFetch(
          `/api/support/orders/${this.activeOrder.id}/release-funds`,
          {
            method: 'PUT',
            body: JSON.stringify({
              note: this.noteDraft
            })
          }
        )
        showSuccessToast('订单资金冻结已解除')
        await this.fetchOrders(this.activeStatus)
      } catch (error) {
        showErrorToast(error.message || '解除冻结失败')
      } finally {
        this.statusSubmitting = false
      }
    },
    getSupportStatusLabel(status) {
      return status === 'resolved' ? '已完成' : '处理中'
    },
    getWithdrawStatusLabel(status) {
      const textMap = {
        pending_review: '待审核',
        processing: '处理中',
        success: '已打款',
        failed: '打款失败',
        rejected: '已驳回',
        cancelled: '已取消'
      }
      return textMap[String(status || '').trim()] || '处理中'
    },
    getWithdrawChannelLabel(channel) {
      const textMap = {
        alipay: '支付宝',
        bank: '银行卡',
        wechat: '微信零钱'
      }
      return textMap[String(channel || '').trim().toLowerCase()] || '其他方式'
    },
    formatMoney(value) {
      return formatMoneyFixed(value, 2)
    },
    formatDateTime(value) {
      if (!value) return '--'
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return String(value)
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    },
    formatUnreadCount(value) {
      const count = Number(value || 0)
      if (count > 99) return '99+'
      return String(count)
    },
    formatUserPhone(phone, fallbackValue = '-') {
      const safePhone = String(phone || '').trim()
      const safeFallback = String(fallbackValue || '').trim()
      return safePhone || safeFallback || '-'
    },
    formatUserWechat(wechat, fallbackValue = '-') {
      const safeWechat = String(wechat || '').trim()
      const safeFallback = String(fallbackValue || '').trim()
      return safeWechat || safeFallback || '-'
    }
  }
}
</script>

<style scoped>
.support-console {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toolbar,
.panel,
.summary-card {
  padding: 18px;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  background: #fff;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.toolbar-search {
  position: relative;
  flex: 0 1 clamp(320px, 42vw, 560px);
  max-width: 100%;
}

.search-input,
.note-textarea {
  width: 100%;
  padding: 0 14px;
  min-height: 42px;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  box-sizing: border-box;
}

.search-input {
  min-width: 0;
  padding-right: 54px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}

.search-input:focus {
  border-color: #93c5fd;
  background: #fff;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12);
  outline: none;
}

.search-submit-btn {
  position: absolute;
  top: 50%;
  right: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 10px;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
  cursor: pointer;
  transform: translateY(-50%);
  transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
}

.search-submit-btn:hover {
  box-shadow: 0 10px 18px rgba(37, 99, 235, 0.22);
  transform: translateY(-50%) scale(1.03);
}

.search-submit-btn:focus-visible {
  outline: 2px solid #bfdbfe;
  outline-offset: 2px;
}

.search-submit-btn svg {
  width: 16px;
  height: 16px;
  fill: currentColor;
}

.toolbar-actions,
.detail-actions {
  display: flex;
  gap: 10px;
}

.toolbar-actions {
  flex: 1 1 auto;
  justify-content: flex-end;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.detail-actions {
  flex-wrap: wrap;
}

.detail-actions__freeze {
  margin-left: auto;
}

.tab-btn,
.ghost-btn,
.primary-btn,
.danger-btn,
.ok-btn {
  min-height: 42px;
  padding: 0 16px;
  border-radius: 12px;
  border: 1px solid transparent;
  cursor: pointer;
  font-weight: 700;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.tab-btn:disabled,
.ghost-btn:disabled,
.primary-btn:disabled,
.danger-btn:disabled,
.ok-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.tab-btn {
  background: #f8fafc;
  color: #475569;
  border-color: #e5e7eb;
}

.tab-btn:hover:not(:disabled) {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.tab-btn--active {
  background: #eff6ff;
  color: #1d4ed8;
  border-color: #bfdbfe;
}

.tab-btn--active:hover:not(:disabled) {
  background: #dbeafe;
  border-color: #93c5fd;
}

.ghost-btn {
  background: #fff;
  color: #1f2937;
  border-color: #d1d5db;
}

.ghost-btn:hover:not(:disabled) {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.primary-btn {
  background: #2563eb;
  color: #fff;
}

.primary-btn:hover:not(:disabled) {
  background: #1d4ed8;
}

.danger-btn {
  background: #fef2f2;
  color: #b91c1c;
  border-color: #fecaca;
}

.danger-btn:hover:not(:disabled) {
  background: #fee2e2;
  border-color: #fca5a5;
}

.ok-btn {
  background: #ecfdf5;
  color: #047857;
  border-color: #a7f3d0;
}

.ok-btn:hover:not(:disabled) {
  background: #d1fae5;
  border-color: #6ee7b7;
}

.freeze-resolution-card {
  border-color: #fcd34d;
  background: linear-gradient(180deg, #fffbea 0%, #fffbeb 100%);
}

.freeze-resolution-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.freeze-resolution-head span {
  color: #92400e;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.freeze-resolution-card p {
  margin: 0;
  color: #78350f;
  font-weight: 700;
  line-height: 1.7;
}

.summary-grid,
.shell {
  display: grid;
  gap: 16px;
}

.summary-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.summary-card span {
  color: #6b7280;
  font-size: 13px;
}

.summary-card strong {
  display: block;
  margin-top: 8px;
  font-size: 28px;
  color: #111827;
}

.shell {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: stretch;
}

.panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: clamp(560px, 72vh, 820px);
  position: relative;
}

.panel-scroll-shell {
  display: flex;
  flex-direction: column;
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.panel-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: auto;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.88) transparent;
}

.panel-body::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.panel-body::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.88);
}

.panel-body::-webkit-scrollbar-track {
  background: transparent;
}

.panel-scrollbar {
  display: none;
}

.panel-body--orders {
  padding-right: 12px;
}

.panel-body--detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-right: 12px;
}

.panel-body--empty {
  justify-content: center;
}

.panel--detail {
  grid-column: span 3;
  height: clamp(620px, 72vh, 860px);
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.desk-tabs {
  display: flex;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 8px;
  gap: 4px;
}

.desk-tab-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  background: transparent;
  padding: 6px 16px;
  font-size: 14px;
  font-weight: 600;
  color: #64748b;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.desk-tab-btn:hover {
  color: #334155;
}

.desk-tab-btn--active {
  background: #ffffff;
  color: #111827;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.desk-tab-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #dc2626;
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.14);
  flex-shrink: 0;
}

.panel-head--sub {
  margin-bottom: 10px;
}

.panel-head h3,
.info-block h4 {
  margin: 0;
  color: #111827;
}

.panel-head span {
  color: #6b7280;
  font-size: 13px;
}

.state {
  padding: 48px 12px;
  text-align: center;
  color: #6b7280;
}

.state--error {
  color: #b91c1c;
}

.order-card {
  width: 100%;
  margin-bottom: 12px;
  padding: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  background: #f8fafc;
  text-align: left;
  cursor: pointer;
}

.order-card--active {
  border-color: #93c5fd;
  background: #eff6ff;
}

.order-card-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.order-card-unread-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  border-radius: 999px;
  background: #dc2626;
  color: #fff !important;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.order-card-top,
.order-card-meta,
.detail-grid {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.order-card p,
.info-block p,
.timeline-item p {
  margin: 8px 0 0;
  color: #334155;
  line-height: 1.7;
}

.info-block-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.order-card-top strong,
.detail-grid strong {
  color: #111827;
}

.order-card-top span,
.order-card-meta span,
.detail-grid span,
.timeline-item small,
.note-head span {
  color: #6b7280;
  font-size: 13px;
}

.order-card-meta--grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
}

.meta-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.meta-cell em {
  color: #6b7280;
  font-style: normal;
  font-size: 12px;
}

.meta-cell strong {
  color: #111827;
  font-size: 14px;
  line-height: 1.5;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
  margin-bottom: 16px;
}

.detail-grid div,
.info-block {
  padding: 14px;
  border-radius: 16px;
  background: #f8fafc;
}

.detail-grid div {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-grid strong {
  line-height: 1.6;
}

.note-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.note-textarea {
  min-height: 110px;
  padding-top: 12px;
  resize: vertical;
}

.freeze-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.48);
}

.freeze-dialog {
  width: min(560px, 100%);
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.24);
  overflow: hidden;
}

.freeze-dialog__header,
.freeze-dialog__body,
.freeze-dialog__footer {
  padding: 18px 20px;
}

.freeze-dialog__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid #e5e7eb;
}

.freeze-dialog__header h3 {
  margin: 0 0 6px;
  font-size: 20px;
  color: #0f172a;
}

.freeze-dialog__header p {
  margin: 0;
  color: #64748b;
  line-height: 1.7;
}

.freeze-dialog__close {
  border: 0;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  font: inherit;
  padding: 0;
}

.freeze-dialog__close:hover {
  color: #0f172a;
}

.freeze-dialog__textarea {
  min-height: 128px;
}

.freeze-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid #e5e7eb;
}

.freeze-dialog-fade-enter-active,
.freeze-dialog-fade-leave-active {
  transition: opacity 0.2s ease;
}

.freeze-dialog-fade-enter-active .freeze-dialog,
.freeze-dialog-fade-leave-active .freeze-dialog {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.freeze-dialog-fade-enter-from,
.freeze-dialog-fade-leave-to {
  opacity: 0;
}

.freeze-dialog-fade-enter-from .freeze-dialog,
.freeze-dialog-fade-leave-to .freeze-dialog {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.badge--resolved {
  background: #d1fae5;
  color: #047857;
}

.badge--handling {
  background: #dbeafe;
  color: #1d4ed8;
}

.badge--pending_review,
.badge--processing {
  background: #fef3c7;
  color: #b45309;
}

.badge--success {
  background: #d1fae5;
  color: #047857;
}

.badge--failed,
.badge--rejected {
  background: #fee2e2;
  color: #b91c1c;
}

.badge--cancelled {
  background: #e5e7eb;
  color: #4b5563;
}

.timeline {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.timeline-item {
  display: flex;
  gap: 12px;
}

.timeline-dot {
  width: 12px;
  height: 12px;
  margin-top: 4px;
  border-radius: 999px;
  background: #2563eb;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
  flex-shrink: 0;
}

@media (max-width: 960px) {
  .toolbar,
  .summary-grid,
  .shell,
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .freeze-dialog-overlay {
    padding: 14px;
  }

  .freeze-dialog__header,
  .freeze-dialog__body,
  .freeze-dialog__footer {
    padding: 16px;
  }

  .freeze-dialog__header,
  .freeze-dialog__footer {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-search {
    flex-basis: auto;
    width: 100%;
  }

  .panel,
  .panel--detail {
    grid-column: span 1;
    height: auto;
  }

  .panel-body {
    overflow: visible;
    overscroll-behavior: auto;
    scrollbar-gutter: auto;
  }

  .panel-body--orders,
  .panel-body--detail {
    padding-right: 0;
  }

  .panel-scrollbar {
    display: none;
  }

  .tab-btn,
  .ghost-btn,
  .primary-btn,
  .danger-btn,
  .ok-btn {
    width: 100%;
  }
}
</style>
