<template>
  <section ref="overviewPageRef" class="overview-page">
    <div v-if="error" class="state-card state-card--error">{{ error }}</div>
    <div v-else-if="loading" class="state-card">正在加载概览数据...</div>
    <div v-else class="content-grid">
      <Transition name="overview-view" mode="out-in">
        <div v-if="activeDisplaySection === 'dashboard'" key="dashboard" class="overview-stack">
          <div class="summary-grid">
            <article class="summary-card">
              <span>用户总数</span>
              <strong>{{ overview.totalUsers }}</strong>
            </article>
            <article class="summary-card">
              <span>商品总数</span>
              <strong>{{ overview.totalListings }}</strong>
            </article>
            <article class="summary-card">
              <span>订单总数</span>
              <strong>{{ overview.totalOrders }}</strong>
            </article>
            <article class="summary-card">
              <span>售后订单</span>
              <strong>{{ overview.afterSaleOrders }}</strong>
            </article>
          </div>

          <article class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <strong>概览看板</strong>
              </div>
              <div class="panel-head-side">
                <button
                  type="button"
                  class="panel-btn panel-btn--primary"
                  @click="activeDisplaySection = 'revenue'"
                >
                  查看收益明细
                </button>
              </div>
            </div>

            <div class="toolbar">
              <label v-if="dashboardFilters.granularity === 'day'" class="toolbar-field">
                <span>选择日期</span>
                <input
                  v-model="dashboardFilters.date"
                  type="date"
                  class="toolbar-input"
                  :disabled="dashboardLoading"
                  @keydown.enter.prevent="loadDashboardData"
                >
              </label>

              <label v-else-if="dashboardFilters.granularity === 'month'" class="toolbar-field">
                <span>选择月份</span>
                <input
                  v-model="dashboardFilters.month"
                  type="month"
                  class="toolbar-input"
                  :disabled="dashboardLoading"
                  @keydown.enter.prevent="loadDashboardData"
                >
              </label>

              <label v-else-if="dashboardFilters.granularity === 'year'" class="toolbar-field toolbar-field--year">
                <span>选择年份</span>
                <input
                  v-model.trim="dashboardFilters.year"
                  type="number"
                  min="2000"
                  max="9999"
                  step="1"
                  class="toolbar-input"
                  :disabled="dashboardLoading"
                  @keydown.enter.prevent="loadDashboardData"
                >
              </label>

              <template v-else>
                <label class="toolbar-field">
                  <span>开始日期</span>
                  <input
                    v-model="dashboardFilters.startDate"
                    type="date"
                    class="toolbar-input"
                    :disabled="dashboardLoading"
                    @keydown.enter.prevent="loadDashboardData"
                  >
                </label>
                <label class="toolbar-field">
                  <span>结束日期</span>
                  <input
                    v-model="dashboardFilters.endDate"
                    type="date"
                    class="toolbar-input"
                    :disabled="dashboardLoading"
                    @keydown.enter.prevent="loadDashboardData"
                  >
                </label>
              </template>

              <div class="toolbar-tabs">
                <button
                  type="button"
                  class="filter-chip"
                  :class="{ 'filter-chip--active': dashboardFilters.granularity === 'day' }"
                  @click="setDashboardGranularity('day')"
                >
                  按日
                </button>
                <button
                  type="button"
                  class="filter-chip"
                  :class="{ 'filter-chip--active': dashboardFilters.granularity === 'month' }"
                  @click="setDashboardGranularity('month')"
                >
                  按月
                </button>
                <button
                  type="button"
                  class="filter-chip"
                  :class="{ 'filter-chip--active': dashboardFilters.granularity === 'year' }"
                  @click="setDashboardGranularity('year')"
                >
                  按年
                </button>
                <button
                  type="button"
                  class="filter-chip"
                  :class="{ 'filter-chip--active': dashboardFilters.granularity === 'custom' }"
                  @click="setDashboardGranularity('custom')"
                >
                  自定义
                </button>
              </div>

              <div class="toolbar-actions">
                <button type="button" class="panel-btn panel-btn--primary" :disabled="dashboardLoading" @click="loadDashboardData">
                  {{ dashboardLoading ? '查询中...' : '查询看板' }}
                </button>
                <button type="button" class="panel-btn" :disabled="dashboardLoading" @click="resetDashboardFilters">
                  重置
                </button>
              </div>
            </div>

            <div v-if="trendError" class="state-card state-card--error">{{ trendError }}</div>
            <div v-else class="trend-content">
              <div class="trend-stats-grid">
                <article class="revenue-stat-card">
                  <span>销量总额</span>
                  <strong>{{ formatMoney(trendStats.totalSalesAmount) }}</strong>
                </article>
                <article class="revenue-stat-card">
                  <span>已支付订单数</span>
                  <strong>{{ trendStats.totalPaidOrders }}</strong>
                </article>
                <article class="revenue-stat-card">
                  <span>新增注册用户</span>
                  <strong>{{ trendStats.totalRegisteredUsers }}</strong>
                </article>
                <article class="revenue-stat-card">
                  <span>当前在线</span>
                  <strong>{{ trendStats.currentOnlineUsers }}</strong>
                </article>
                <article class="revenue-stat-card">
                  <span>范围内最大在线</span>
                  <strong>{{ trendStats.maxOnlineUsers }}</strong>
                </article>
                <article class="revenue-stat-card">
                  <span>统计范围</span>
                  <strong class="range-value">{{ dashboardRangeLabel }}</strong>
                </article>
              </div>

              <div class="chart-grid">
                <article class="chart-card">
                  <div class="chart-card-head">
                    <strong>销量趋势</strong>
                  </div>
                  <div ref="salesChartRef" class="chart"></div>
                </article>
                <article class="chart-card">
                  <div class="chart-card-head">
                    <strong>注册趋势</strong>
                  </div>
                  <div ref="usersChartRef" class="chart"></div>
                </article>
                <article class="chart-card">
                  <div class="chart-card-head">
                    <strong>在线趋势</strong>
                  </div>
                  <div ref="onlineChartRef" class="chart"></div>
                </article>
              </div>
            </div>
          </article>
        </div>

        <article
          v-else
          key="revenue"
          class="panel panel--top"
        >
          <div class="panel-head">
            <div class="panel-title">
              <strong>收益明细</strong>
            </div>
            <div class="panel-head-side">
              <button
                type="button"
                class="panel-btn"
                @click="activeDisplaySection = 'dashboard'"
              >
                返回概览看板
              </button>
              <button type="button" class="panel-btn" :disabled="revenueLoading" @click="loadRevenue">
                {{ revenueLoading ? '刷新中...' : '刷新收益' }}
              </button>
            </div>
          </div>

          <div v-if="revenueError" class="state-card state-card--error">{{ revenueError }}</div>
          <div v-else class="revenue-content">
            <div class="revenue-stats-grid">
              <article class="revenue-stat-card">
                <span>平台收益合计</span>
                <strong>{{ formatMoney(revenueStats.totalPlatformFee) }}</strong>
              </article>
              <article class="revenue-stat-card">
                <span>已结算收益</span>
                <strong>{{ formatMoney(revenueStats.settledPlatformFee) }}</strong>
              </article>
              <article class="revenue-stat-card">
                <span>收益订单数</span>
                <strong>{{ revenueStats.totalOrders }}</strong>
              </article>
              <article class="revenue-stat-card">
                <span>已结算订单</span>
                <strong>{{ revenueStats.settledOrders }}</strong>
              </article>
            </div>

            <div v-if="revenueLoading" class="state-card">正在加载收益明细数据...</div>
            <div v-else-if="!revenueOrders.length" class="state-card">当前筛选范围内暂无收益订单数据。</div>
            <div v-else class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>订单号</th>
                    <th>商品</th>
                    <th>买家</th>
                    <th>卖家</th>
                    <th>订单状态</th>
                    <th>结算状态</th>
                    <th>平台收益</th>
                    <th>卖家入账</th>
                    <th>收益时间</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in revenueOrders" :key="item.id">
                    <td>{{ item.order_no }}</td>
                    <td class="table-title">{{ item.listing_title || '--' }}</td>
                    <td>{{ item.buyer_name || '--' }}</td>
                    <td>{{ item.seller_name || '--' }}</td>
                    <td>{{ formatOrderStatus(item.status) }}</td>
                    <td>{{ formatSettlementStatus(item.settlement_status) }}</td>
                    <td>{{ formatMoney(item.platform_fee_amount) }}</td>
                    <td>{{ formatMoney(item.seller_income_amount) }}</td>
                    <td>{{ formatDateTime(item.revenue_time || item.executed_at) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </article>
      </Transition>
    </div>
  </section>
</template>

<script>
import * as echarts from 'echarts'
import { apiFetch } from '../utils/api.js'

function debugReportOverview() {}

const EMPTY_OVERVIEW = Object.freeze({
  totalUsers: 0,
  totalListings: 0,
  totalOrders: 0,
  afterSaleOrders: 0
})

const EMPTY_REVENUE_STATS = Object.freeze({
  totalOrders: 0,
  settledOrders: 0,
  totalPlatformFee: 0,
  settledPlatformFee: 0,
  totalSellerIncome: 0,
  totalUsedItemsAmount: 0
})

const EMPTY_TREND_STATS = Object.freeze({
  totalPaidOrders: 0,
  totalSalesAmount: 0,
  totalRegisteredUsers: 0,
  currentOnlineUsers: 0,
  maxOnlineUsers: 0,
  avgOnlineUsers: 0
})

const ORDER_STATUS_LABELS = Object.freeze({
  pending_payment: '待付款',
  paid: '已支付',
  in_progress: '进行中',
  completed: '已完成',
  after_sale: '售后中',
  support_handling: '客服处理中',
  settlement_pending: '结算中',
  cancelled: '已取消',
  refund_pending: '退款处理中',
  refunded: '已退款'
})

const SETTLEMENT_STATUS_LABELS = Object.freeze({
  draft: '待结算',
  executed: '已结算'
})

function padDatePart(value) {
  return String(value).padStart(2, '0')
}

function getTodayDate() {
  const date = new Date()
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`
}

function getCurrentMonth() {
  const date = new Date()
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}`
}

function getCurrentYear() {
  return String(new Date().getFullYear())
}

function getDateDaysAgo(days) {
  const date = new Date()
  date.setDate(date.getDate() - Number(days || 0))
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`
}

function createDefaultDashboardFilters() {
  const today = getTodayDate()
  return {
    granularity: 'day',
    date: today,
    month: getCurrentMonth(),
    year: getCurrentYear(),
    startDate: getDateDaysAgo(6),
    endDate: today
  }
}

export default {
  name: 'AdminOverview',
  props: {
    currentUser: {
      type: Object,
      default: null
    },
    healthStatus: {
      type: Object,
      default: null
    }
  },
  data() {
    return {
      loading: false,
      error: '',
      lastLoadedAt: '',
      overview: { ...EMPTY_OVERVIEW },
      trendLoading: false,
      trendError: '',
      trendLastLoadedAt: '',
      trendRange: null,
      trendStats: { ...EMPTY_TREND_STATS },
      salesTrendList: [],
      usersTrendList: [],
      onlineTrendList: [],
      revenueLoading: false,
      revenueError: '',
      revenueLastLoadedAt: '',
      revenueStats: { ...EMPTY_REVENUE_STATS },
      revenueOrders: [],
      activeDisplaySection: 'dashboard',
      lastWheelSwitchAt: 0,
      dashboardFilters: createDefaultDashboardFilters(),
      salesChart: null,
      usersChart: null,
      onlineChart: null
    }
  },
  computed: {
    dashboardLoading() {
      return this.trendLoading || this.revenueLoading
    },
    dashboardFilterLabel() {
      if (this.dashboardFilters.granularity === 'month') {
        return `按月 ${this.dashboardFilters.month || '--'}`
      }
      if (this.dashboardFilters.granularity === 'year') {
        return `按年 ${this.dashboardFilters.year || '--'}`
      }
      if (this.dashboardFilters.granularity === 'custom') {
        return `自定义 ${this.dashboardFilters.startDate || '--'} 至 ${this.dashboardFilters.endDate || '--'}`
      }
      return `按日 ${this.dashboardFilters.date || '--'}`
    },
    dashboardRangeLabel() {
      if (!this.trendRange?.startDate || !this.trendRange?.endDate) {
        return '--'
      }
      return `${this.trendRange.startDate} 至 ${this.trendRange.endDate}`
    }
  },
  watch: {
    loading(nextValue) {
      if (nextValue) return
      this.$nextTick(() => {
        this.initCharts()
      })
    },
    activeDisplaySection(nextValue) {
      if (nextValue !== 'dashboard') return
      this.$nextTick(() => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            this.recreateCharts()
          })
        })
      })
    }
  },
  async mounted() {
    // #region debug-point C:mounted
    debugReportOverview('C', 'AdminOverview.vue:mounted', '[DEBUG] mounted lifecycle entered', {
      loading: this.loading,
      trendLoading: this.trendLoading,
      revenueLoading: this.revenueLoading
    })
    // #endregion
    window.addEventListener('resize', this.handleResize)
    this.attachGlobalWheelListener()
    await Promise.all([
      this.loadOverview(),
      this.loadDashboardData()
    ])
  },
  activated() {
    this.$nextTick(() => {
      // #region debug-point C:activated
      debugReportOverview('C', 'AdminOverview.vue:activated', '[DEBUG] activated lifecycle entered', {
        hasSalesRef: Boolean(this.$refs.salesChartRef),
        hasUsersRef: Boolean(this.$refs.usersChartRef),
        hasOnlineRef: Boolean(this.$refs.onlineChartRef)
      })
      // #endregion
      this.attachGlobalWheelListener()
      this.recreateCharts()
    })
  },
  deactivated() {
    this.detachGlobalWheelListener()
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.handleResize)
    this.detachGlobalWheelListener()
    this.disposeCharts()
  },
  methods: {
    attachGlobalWheelListener() {
      window.removeEventListener('wheel', this.handleOverviewWheel)
      window.addEventListener('wheel', this.handleOverviewWheel, { passive: true })
    },
    detachGlobalWheelListener() {
      window.removeEventListener('wheel', this.handleOverviewWheel)
    },
    ensureChart(chartKey, refName) {
      const element = this.$refs[refName]
      if (!element) return null

      const currentChart = this[chartKey]
      if (currentChart && currentChart.getDom() === element) {
        return currentChart
      }

      if (currentChart) {
        currentChart.dispose()
      }

      const nextChart = echarts.init(element)
      this[chartKey] = nextChart
      return nextChart
    },
    buildDashboardQueryParams() {
      const params = new URLSearchParams({
        granularity: this.dashboardFilters.granularity
      })

      if (this.dashboardFilters.granularity === 'month') {
        params.set('value', String(this.dashboardFilters.month || '').trim())
      } else if (this.dashboardFilters.granularity === 'year') {
        params.set('value', String(this.dashboardFilters.year || '').trim())
      } else if (this.dashboardFilters.granularity === 'custom') {
        params.set('startDate', String(this.dashboardFilters.startDate || '').trim())
        params.set('endDate', String(this.dashboardFilters.endDate || '').trim())
      } else {
        params.set('value', String(this.dashboardFilters.date || '').trim())
      }

      return params
    },
    async loadOverview() {
      this.loading = true
      this.error = ''
      try {
        const data = await apiFetch('/api/admin/overview')
        this.overview = {
          totalUsers: Number(data.totalUsers || 0),
          totalListings: Number(data.totalListings || 0),
          totalOrders: Number(data.totalOrders || 0),
          afterSaleOrders: Number(data.afterSaleOrders || 0)
        }
        this.lastLoadedAt = this.formatDateTime(new Date())
      } catch (error) {
        this.error = error.message || '获取后台概览数据失败'
      } finally {
        this.loading = false
      }
    },
    setDashboardGranularity(granularity) {
      this.dashboardFilters = {
        ...this.dashboardFilters,
        granularity
      }
    },
    resetDashboardFilters() {
      this.dashboardFilters = createDefaultDashboardFilters()
      this.loadDashboardData()
    },
    async loadDashboardData() {
      await Promise.all([
        this.loadTrendData(),
        this.loadRevenue()
      ])
    },
    async loadTrendData() {
      const params = this.buildDashboardQueryParams()
      this.trendLoading = true
      this.trendError = ''
      // #region debug-point A:trend-request
      debugReportOverview('A', 'AdminOverview.vue:loadTrendData:start', '[DEBUG] dashboard trends request start', {
        url: `/api/admin/dashboard/trends?${params.toString()}`,
        granularity: this.dashboardFilters.granularity
      })
      // #endregion
      try {
        const data = await apiFetch(`/api/admin/dashboard/trends?${params.toString()}`)
        // #region debug-point A:trend-response
        debugReportOverview('A', 'AdminOverview.vue:loadTrendData:success', '[DEBUG] dashboard trends request success', {
          salesCount: Array.isArray(data?.sales?.list) ? data.sales.list.length : -1,
          usersCount: Array.isArray(data?.users?.list) ? data.users.list.length : -1,
          onlineCount: Array.isArray(data?.online?.list) ? data.online.list.length : -1,
          range: data?.range || null
        })
        // #endregion
        this.trendRange = data?.range || null
        this.trendStats = {
          totalPaidOrders: Number(data?.sales?.totals?.totalPaidOrders || 0),
          totalSalesAmount: Number(data?.sales?.totals?.totalSalesAmount || 0),
          totalRegisteredUsers: Number(data?.users?.totals?.totalRegisteredUsers || 0),
          currentOnlineUsers: Number(data?.online?.summary?.currentOnlineUsers || 0),
          maxOnlineUsers: Number(data?.online?.summary?.maxOnlineUsers || 0),
          avgOnlineUsers: Number(data?.online?.summary?.avgOnlineUsers || 0)
        }
        this.salesTrendList = Array.isArray(data?.sales?.list) ? data.sales.list : []
        this.usersTrendList = Array.isArray(data?.users?.list) ? data.users.list : []
        this.onlineTrendList = Array.isArray(data?.online?.list) ? data.online.list : []
        this.trendLastLoadedAt = this.formatDateTime(new Date())
        await this.$nextTick()
        this.initCharts()
        this.renderCharts()
      } catch (error) {
        // #region debug-point A:trend-error
        debugReportOverview('A', 'AdminOverview.vue:loadTrendData:error', '[DEBUG] dashboard trends request failed', {
          message: error?.message || 'unknown'
        })
        // #endregion
        this.trendRange = null
        this.trendStats = { ...EMPTY_TREND_STATS }
        this.salesTrendList = []
        this.usersTrendList = []
        this.onlineTrendList = []
        this.trendError = error.message || '获取趋势图数据失败'
        await this.$nextTick()
        this.initCharts()
        this.renderCharts()
      } finally {
        this.trendLoading = false
      }
    },
    async loadRevenue() {
      const params = this.buildDashboardQueryParams()
      params.set('page', '1')
      params.set('pageSize', '20')

      this.revenueLoading = true
      this.revenueError = ''
      try {
        const data = await apiFetch(`/api/admin/revenue?${params.toString()}`)
        this.revenueStats = {
          totalOrders: Number(data?.stats?.totalOrders || 0),
          settledOrders: Number(data?.stats?.settledOrders || 0),
          totalPlatformFee: Number(data?.stats?.totalPlatformFee || 0),
          settledPlatformFee: Number(data?.stats?.settledPlatformFee || 0),
          totalSellerIncome: Number(data?.stats?.totalSellerIncome || 0),
          totalUsedItemsAmount: Number(data?.stats?.totalUsedItemsAmount || 0)
        }
        this.revenueOrders = Array.isArray(data.list) ? data.list : []
        this.revenueLastLoadedAt = this.formatDateTime(new Date())
      } catch (error) {
        this.revenueStats = { ...EMPTY_REVENUE_STATS }
        this.revenueOrders = []
        this.revenueError = error.message || '获取收益明细数据失败'
      } finally {
        this.revenueLoading = false
      }
    },
    initCharts() {
      const salesChart = this.ensureChart('salesChart', 'salesChartRef')
      const usersChart = this.ensureChart('usersChart', 'usersChartRef')
      const onlineChart = this.ensureChart('onlineChart', 'onlineChartRef')
      // #region debug-point B:init-charts
      debugReportOverview('B', 'AdminOverview.vue:initCharts', '[DEBUG] initCharts executed', {
        hasSalesRef: Boolean(this.$refs.salesChartRef),
        hasUsersRef: Boolean(this.$refs.usersChartRef),
        hasOnlineRef: Boolean(this.$refs.onlineChartRef),
        salesDomSize: this.$refs.salesChartRef ? {
          width: this.$refs.salesChartRef.clientWidth,
          height: this.$refs.salesChartRef.clientHeight
        } : null,
        usersDomSize: this.$refs.usersChartRef ? {
          width: this.$refs.usersChartRef.clientWidth,
          height: this.$refs.usersChartRef.clientHeight
        } : null,
        onlineDomSize: this.$refs.onlineChartRef ? {
          width: this.$refs.onlineChartRef.clientWidth,
          height: this.$refs.onlineChartRef.clientHeight
        } : null,
        hasSalesChart: Boolean(salesChart),
        hasUsersChart: Boolean(usersChart),
        hasOnlineChart: Boolean(onlineChart)
      })
      // #endregion
      this.renderCharts()
    },
    recreateCharts() {
      this.disposeCharts()
      this.$nextTick(() => {
        this.initCharts()
        this.handleResize()
      })
    },
    disposeCharts() {
      this.salesChart?.dispose()
      this.usersChart?.dispose()
      this.onlineChart?.dispose()
      this.salesChart = null
      this.usersChart = null
      this.onlineChart = null
    },
    handleResize() {
      this.salesChart?.resize()
      this.usersChart?.resize()
      this.onlineChart?.resize()
    },
    handleOverviewWheel(event) {
      const rootElement = this.$refs.overviewPageRef
      const rootRect = rootElement?.getBoundingClientRect?.()
      if (!rootRect || Number(event?.clientX || 0) < rootRect.left) {
        return
      }
      const target = event?.target
      if (target?.closest?.('input, textarea, select, button, .table-wrap')) {
        return
      }
      const deltaY = Number(event?.deltaY || 0)
      if (Math.abs(deltaY) < 24) return

      const now = Date.now()
      if (now - this.lastWheelSwitchAt < 280) return

      if (deltaY > 0 && this.activeDisplaySection !== 'revenue') {
        this.activeDisplaySection = 'revenue'
        this.lastWheelSwitchAt = now
        return
      }

      if (deltaY < 0 && this.activeDisplaySection !== 'dashboard') {
        this.activeDisplaySection = 'dashboard'
        this.lastWheelSwitchAt = now
      }
    },
    renderCharts() {
      // #region debug-point D:render-charts
      debugReportOverview('D', 'AdminOverview.vue:renderCharts', '[DEBUG] renderCharts executed', {
        salesCount: this.salesTrendList.length,
        usersCount: this.usersTrendList.length,
        onlineCount: this.onlineTrendList.length,
        hasSalesChart: Boolean(this.salesChart),
        hasUsersChart: Boolean(this.usersChart),
        hasOnlineChart: Boolean(this.onlineChart)
      })
      // #endregion
      this.renderSalesChart()
      this.renderUsersChart()
      this.renderOnlineChart()
    },
    renderSalesChart() {
      if (!this.salesChart) return
      const categories = this.salesTrendList.map((item) => item.bucket)
      const seriesData = this.salesTrendList.map((item) => Number(item.salesAmount || 0) / 100)
      // #region debug-point E:sales-before-set-option
      debugReportOverview('E', 'AdminOverview.vue:renderSalesChart:before', '[DEBUG] sales chart render before setOption', {
        categories,
        seriesData,
        chartWidth: this.salesChart.getWidth(),
        chartHeight: this.salesChart.getHeight()
      })
      // #endregion
      this.salesChart.setOption({
        animationDuration: 300,
        tooltip: {
          trigger: 'axis',
          valueFormatter: (value) => `¥ ${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
        },
        grid: {
          left: 48,
          right: 24,
          top: 36,
          bottom: 36
        },
        xAxis: {
          type: 'category',
          boundaryGap: false,
          data: categories,
          axisLine: {
            lineStyle: {
              color: '#cbd5e1'
            }
          },
          axisLabel: {
            color: '#64748b'
          }
        },
        yAxis: {
          type: 'value',
          axisLabel: {
            color: '#64748b',
            formatter: (value) => `¥${Number(value || 0).toLocaleString('zh-CN')}`
          },
          splitLine: {
            lineStyle: {
              color: '#e2e8f0'
            }
          }
        },
        series: [
          {
            name: '销量',
            type: 'line',
            smooth: true,
            symbolSize: 8,
            data: seriesData,
            lineStyle: {
              width: 3,
              color: '#2563eb'
            },
            itemStyle: {
              color: '#2563eb'
            },
            areaStyle: {
              color: 'rgba(37, 99, 235, 0.14)'
            }
          }
        ]
      })
      // #region debug-point E:sales-after-set-option
      debugReportOverview('E', 'AdminOverview.vue:renderSalesChart:after', '[DEBUG] sales chart render after setOption', {
        seriesLength: this.salesChart.getOption()?.series?.length || 0,
        dataUrlLength: this.salesChart.getDataURL({ pixelRatio: 1, backgroundColor: '#fff' }).length
      })
      // #endregion
    },
    renderUsersChart() {
      if (!this.usersChart) return
      const categories = this.usersTrendList.map((item) => item.bucket)
      const seriesData = this.usersTrendList.map((item) => Number(item.registerCount || 0))
      // #region debug-point E:users-before-set-option
      debugReportOverview('E', 'AdminOverview.vue:renderUsersChart:before', '[DEBUG] users chart render before setOption', {
        categories,
        seriesData,
        chartWidth: this.usersChart.getWidth(),
        chartHeight: this.usersChart.getHeight()
      })
      // #endregion
      this.usersChart.setOption({
        animationDuration: 300,
        tooltip: {
          trigger: 'axis'
        },
        grid: {
          left: 40,
          right: 24,
          top: 36,
          bottom: 36
        },
        xAxis: {
          type: 'category',
          data: categories,
          axisLine: {
            lineStyle: {
              color: '#cbd5e1'
            }
          },
          axisLabel: {
            color: '#64748b'
          }
        },
        yAxis: {
          type: 'value',
          axisLabel: {
            color: '#64748b'
          },
          splitLine: {
            lineStyle: {
              color: '#e2e8f0'
            }
          }
        },
        series: [
          {
            name: '新增用户',
            type: 'bar',
            barMaxWidth: 36,
            data: seriesData,
            itemStyle: {
              color: '#14b8a6',
              borderRadius: [10, 10, 0, 0]
            }
          }
        ]
      })
      // #region debug-point E:users-after-set-option
      debugReportOverview('E', 'AdminOverview.vue:renderUsersChart:after', '[DEBUG] users chart render after setOption', {
        seriesLength: this.usersChart.getOption()?.series?.length || 0,
        dataUrlLength: this.usersChart.getDataURL({ pixelRatio: 1, backgroundColor: '#fff' }).length
      })
      // #endregion
    },
    renderOnlineChart() {
      if (!this.onlineChart) return
      const categories = this.onlineTrendList.map((item) => item.bucket)
      const seriesData = this.onlineTrendList.map((item) => Number(item.maxOnlineUsers || 0))
      // #region debug-point E:online-before-set-option
      debugReportOverview('E', 'AdminOverview.vue:renderOnlineChart:before', '[DEBUG] online chart render before setOption', {
        categories,
        seriesData,
        chartWidth: this.onlineChart.getWidth(),
        chartHeight: this.onlineChart.getHeight()
      })
      // #endregion
      this.onlineChart.setOption({
        animationDuration: 300,
        tooltip: {
          trigger: 'axis'
        },
        grid: {
          left: 40,
          right: 24,
          top: 36,
          bottom: 36
        },
        xAxis: {
          type: 'category',
          boundaryGap: false,
          data: categories,
          axisLine: {
            lineStyle: {
              color: '#cbd5e1'
            }
          },
          axisLabel: {
            color: '#64748b'
          }
        },
        yAxis: {
          type: 'value',
          axisLabel: {
            color: '#64748b'
          },
          splitLine: {
            lineStyle: {
              color: '#e2e8f0'
            }
          }
        },
        series: [
          {
            name: '最大在线',
            type: 'line',
            smooth: true,
            symbolSize: 8,
            data: seriesData,
            lineStyle: {
              width: 3,
              color: '#f59e0b'
            },
            itemStyle: {
              color: '#f59e0b'
            },
            areaStyle: {
              color: 'rgba(245, 158, 11, 0.16)'
            }
          }
        ]
      })
      // #region debug-point E:online-after-set-option
      debugReportOverview('E', 'AdminOverview.vue:renderOnlineChart:after', '[DEBUG] online chart render after setOption', {
        seriesLength: this.onlineChart.getOption()?.series?.length || 0,
        dataUrlLength: this.onlineChart.getDataURL({ pixelRatio: 1, backgroundColor: '#fff' }).length
      })
      // #endregion
    },
    formatOrderStatus(status) {
      return ORDER_STATUS_LABELS[String(status || '').trim()] || String(status || '--')
    },
    formatSettlementStatus(status) {
      return SETTLEMENT_STATUS_LABELS[String(status || '').trim()] || String(status || '--')
    },
    formatMoney(value) {
      const amountInCents = Number(value)
      if (!Number.isFinite(amountInCents)) return '--'
      const amountInYuan = amountInCents / 100
      return `¥ ${amountInYuan.toLocaleString('zh-CN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      })}`
    },
    formatDecimal(value) {
      const amount = Number(value)
      if (!Number.isFinite(amount)) return '--'
      return amount.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
    },
    formatDateTime(value) {
      if (!value) return '--'
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return String(value)
      return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())} ${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`
    }
  }
}
</script>

<style scoped>
.overview-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 2px 8px 8px;
  animation: fadeIn 0.4s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.content-grid {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.overview-stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 20px;
  margin-top: -6px;
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

.revenue-stats-grid,
.trend-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.chart-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 20px;
}

/* Base Card Style */
.summary-card,
.panel,
.state-card,
.revenue-stat-card,
.chart-card {
  border-radius: 16px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
  padding: 24px;
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.summary-card:hover,
.revenue-stat-card:hover,
.chart-card:hover {
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  transform: translateY(-2px);
}

.summary-card,
.revenue-stat-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
  overflow: hidden;
}

/* Decorative background circle */
.summary-card::after,
.revenue-stat-card::after {
  display: none;
}

.summary-card span,
.revenue-stat-card span {
  color: #64748b;
  font-size: 14px;
  font-weight: 500;
  z-index: 1;
}

.summary-card strong,
.revenue-stat-card strong {
  font-size: 32px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.2;
  z-index: 1;
}

.revenue-stat-card strong {
  font-size: 24px;
}

.range-value {
  font-size: 16px !important;
  line-height: 1.5;
  color: #3b82f6 !important;
}

/* Panel Header */
.panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.panel--top {
  order: -1;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding-bottom: 16px;
  border-bottom: 1px solid #f1f5f9;
}

.panel-title {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.panel-title strong {
  font-size: 18px;
  font-weight: 600;
  color: #0f172a;
}

.panel-title span,
.panel-head-side span,
.chart-card-head span {
  color: #64748b;
  font-size: 13px;
}

.panel-head-side {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

/* Buttons */
.panel-btn {
  min-height: 36px;
  padding: 0 16px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #334155;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.panel-btn:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #94a3b8;
}

.panel-btn--primary {
  border-color: transparent;
  background: #3b82f6;
  color: #ffffff;
}

.panel-btn--primary:hover:not(:disabled) {
  background: #2563eb;
}

.panel-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background: #f1f5f9;
}

/* Toolbar */
.toolbar {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
  padding: 20px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.toolbar-tabs {
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

.toolbar-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #475569;
  font-size: 13px;
  font-weight: 500;
}

.toolbar-field--year {
  max-width: 140px;
}

.toolbar-input {
  min-height: 38px;
  min-width: 160px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #0f172a;
  font-size: 14px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.toolbar-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.toolbar-actions {
  display: flex;
  gap: 12px;
  margin-left: auto;
}

.panel-tip {
  margin: 0;
  color: #64748b;
  font-size: 14px;
  line-height: 1.6;
  padding: 12px 16px;
  background: #eff6ff;
  border-radius: 8px;
  border-left: 4px solid #3b82f6;
}

/* Charts & Stats */
.trend-content,
.revenue-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.chart-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.chart-card-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chart-card-head strong {
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}

.chart {
  width: 100%;
  height: 320px;
}

/* Revenue summary */
.revenue-summary-bar {
  display: none;
}

/* Table */
.table-wrap {
  overflow-x: auto;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
}

.table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.table th,
.table td {
  padding: 16px;
  font-size: 14px;
  color: #334155;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
}

.table th {
  background: #f8fafc;
  color: #64748b;
  font-weight: 600;
  text-transform: uppercase;
  font-size: 12px;
  letter-spacing: 0.05em;
}

.table tbody tr {
  transition: background-color 0.2s;
}

.table tbody tr:hover {
  background-color: #f8fafc;
}

.table tbody tr:last-child td {
  border-bottom: none;
}

.table-title {
  max-width: 300px;
  white-space: normal;
  line-height: 1.5;
  color: #0f172a;
  font-weight: 500;
}

/* States */
.state-card {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  color: #64748b;
  font-size: 15px;
  text-align: center;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
}

.state-card--error {
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
}

/* Responsive */
@media (max-width: 1024px) {
  .chart-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .panel-head {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  
  .toolbar-actions {
    margin-left: 0;
    justify-content: flex-end;
  }
  
  .toolbar-input {
    width: 100%;
  }
}
</style>
