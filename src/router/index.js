import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import HomePage from '../views/HomePage.vue'
import ListingDetailPage from '../views/ListingDetailPage.vue'
import PublishPage from '../views/PublishPage.vue'
import ProfilePage from '../views/ProfilePage.vue'
import OrderDetailPage from '../views/OrderDetailPage.vue'
import PaymentResultPage from '../views/PaymentResultPage.vue'
import SupportConsolePage from '../views/SupportConsolePage.vue'
import GunCodePage from '../views/GunCodePage.vue'
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
    component: ListingDetailPage
  },
  {
    path: '/publish',
    name: 'publish-create',
    component: PublishPage
  },
  {
    path: '/publish/:id/edit',
    name: 'publish-edit',
    component: PublishPage
  },
  {
    path: '/profile',
    name: 'profile',
    component: ProfilePage
  },
  {
    path: '/orders/:id',
    name: 'order-detail',
    component: OrderDetailPage
  },
  {
    path: '/payment/result',
    name: 'payment-result',
    component: PaymentResultPage
  },
  {
    path: '/support-console',
    name: 'support-console',
    component: SupportConsolePage
  },
  {
    path: '/gun',
    name: 'gun-code',
    component: GunCodePage
  },
  {
    path: '/boost',
    redirect: { name: 'home' }
  }
]

const router = createRouter({
  history: isNativeAppRuntime() ? createWebHashHistory() : createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})

export default router
