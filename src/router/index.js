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

export default router
