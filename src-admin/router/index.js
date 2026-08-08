import { createRouter, createWebHashHistory } from 'vue-router'
import AdminOverview from '../components/AdminOverview.vue'
import AdminUsersCenter from '../components/AdminUsersCenter.vue'
import AdminOrdersCenter from '../components/AdminOrdersCenter.vue'
import AdminListingsCenter from '../components/AdminListingsCenter.vue'
import AdminSecurityCenter from '../components/AdminSecurityCenter.vue'
import ListingReviewCenter from '../components/ListingReviewCenter.vue'
import AdminBusinessSettingsCenter from '../components/AdminBusinessSettingsCenter.vue'
import OperationLogCenter from '../components/OperationLogCenter.vue'
import AdminFeedbackCenter from '../components/AdminFeedbackCenter.vue'

export const adminSections = [
  {
    key: 'overview',
    routeName: 'admin-overview',
    path: '/overview',
    label: '运营概览',
    description: '查看平台核心数据、系统状态与运营关注项',
    component: AdminOverview
  },
  {
    key: 'users',
    routeName: 'admin-users',
    path: '/users',
    label: '用户管理',
    description: '管理用户资料、角色权限与账号状态',
    component: AdminUsersCenter
  },
  {
    key: 'orders',
    routeName: 'admin-orders',
    path: '/orders',
    label: '订单管理',
    description: '跟踪订单履约、支付进度与售后处理',
    component: AdminOrdersCenter
  },
  {
    key: 'listings',
    routeName: 'admin-listings',
    path: '/listings',
    label: '商品管理',
    description: '查看商品信息、上架状态与经营表现',
    component: AdminListingsCenter
  },
  {
    key: 'listingReviews',
    routeName: 'admin-listing-reviews',
    path: '/listing-reviews',
    label: '商品审核',
    description: '审核新发布或重新提交的商品内容',
    component: ListingReviewCenter
  },
  {
    key: 'feedback',
    routeName: 'admin-feedback',
    path: '/feedback',
    label: '问题反馈',
    description: '查看用户提交的问题反馈并跟进处理结果',
    component: AdminFeedbackCenter
  },
  {
    key: 'businessSettings',
    routeName: 'admin-business-settings',
    path: '/business-settings',
    label: '参数配置',
    description: '集中维护比例、押金、抽成、赔付和运营阈值等业务参数',
    component: AdminBusinessSettingsCenter
  },
  {
    key: 'operationLogs',
    routeName: 'admin-operation-logs',
    path: '/operation-logs',
    label: '操作日志',
    description: '追踪平台治理动作与关键变更记录',
    component: OperationLogCenter
  },
  {
    key: 'security',
    routeName: 'admin-security',
    path: '/security',
    label: '安全设置',
    description: '管理 Passkey、受信任设备与二次校验策略',
    component: AdminSecurityCenter
  }
]

const routes = [
  {
    path: '/',
    redirect: { name: 'admin-overview' }
  },
  ...adminSections.map((section) => ({
    path: section.path,
    name: section.routeName,
    component: section.component,
    meta: {
      sectionKey: section.key,
      sectionLabel: section.label,
      sectionDescription: section.description
    }
  })),
  {
    path: '/:pathMatch(.*)*',
    redirect: { name: 'admin-overview' }
  }
]

const router = createRouter({
  // Admin uses a dedicated `admin.html` entry, so hash history keeps both dev and prod access stable.
  history: createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})

export default router
