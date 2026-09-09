import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
// 首页保持同步加载以优先渲染首屏，其余页面懒加载拆包
import HomePage from '../views/HomePage.vue'
import { isNativeAppRuntime } from '../utils/runtime.js'

const routes = [
  {
    path: '/',
    name: 'home',
    component: HomePage
  },
  {
    path: '/listings/:listingNo',
    name: 'listing-detail',
    component: () => import('../views/ListingDetailPage.vue')
  },
  {
    path: '/publish',
    name: 'publish-create',
    component: () => import('../views/PublishPage.vue')
  },
  {
    path: '/publish/:id/edit',
    name: 'publish-edit',
    component: () => import('../views/PublishPage.vue')
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('../views/ProfilePage.vue')
  },
  {
    path: '/orders/:id',
    name: 'order-detail',
    component: () => import('../views/OrderDetailPage.vue')
  },
  {
    path: '/payment/result',
    name: 'payment-result',
    component: () => import('../views/PaymentResultPage.vue')
  },
  {
    path: '/support-console',
    name: 'support-console',
    component: () => import('../views/SupportConsolePage.vue')
  },
  {
    path: '/gun',
    name: 'gun-code',
    component: () => import('../views/GunCodePage.vue')
  },
  {
    path: '/boost',
    redirect: { name: 'home' }
  }
]

const router = createRouter({
  history: isNativeAppRuntime() ? createWebHashHistory() : createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }
    if (to.name === 'listing-detail') {
      return false
    }
    return { top: 0 }
  }
})

// 路由级 SEO：标题随页面切换；个人/交易页不对搜索引擎开放
const DEFAULT_TITLE = '西游商行-三角洲改枪码_三角洲行动账号租赁平台'
const ROUTE_SEO = {
  home: { title: DEFAULT_TITLE },
  'gun-code': { title: '三角洲改枪码大全-烽火地带/全面战场改枪码分享-西游商行' },
  'listing-detail': { title: '三角洲账号租赁详情-西游商行' },
  'publish-create': { title: '发布账号-西游商行', noindex: true },
  'publish-edit': { title: '编辑账号-西游商行', noindex: true },
  profile: { title: '个人中心-西游商行', noindex: true },
  'order-detail': { title: '订单详情-西游商行', noindex: true },
  'payment-result': { title: '支付结果-西游商行', noindex: true },
  'support-console': { title: '客服中心-西游商行', noindex: true }
}

function applyRouteSeo(to) {
  const seo = ROUTE_SEO[to.name]
  if (seo?.title) {
    document.title = seo.title
  }
  const robotsMeta = document.querySelector('meta[name="robots"]')
  if (robotsMeta) {
    robotsMeta.setAttribute('content', seo?.noindex ? 'noindex, nofollow' : 'index, follow')
  }
}

router.afterEach(applyRouteSeo)

export default router
