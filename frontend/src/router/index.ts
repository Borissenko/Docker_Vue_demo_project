import Vue from 'vue'
import VueRouter, {RouteConfig} from 'vue-router'
import store from '../store'
import authStore from '../store/auth'
import Basket from '../views/Basket.vue'
import A11n from '../views/A11n.vue'
import Person from '../views/Person.vue'

Vue.use(VueRouter)

const routes: Array<RouteConfig> = [
  {
    path: '/',
    redirect: '/laptops'
  },
  {
    path: '/basket',
    name: 'Basket',
    component: Basket
  },
  {
    path: '/a11n',
    name: 'a11n',
    component: A11n
  },
  {
    path: '/person',
    name: 'Person',
    component: Person,
    beforeEnter(to, from, next) {
      if (authStore.state.isAuthorization) {
        next()
      } else {
        let clarification = `Access was denied <br>because of <br> you need authorisation`
        store.dispatch('SHOW_CLARIFICATION', clarification)
          .then(() => {
            next('/a11n')
          })
      }
    }
  },
  {
    path: '/:shelf',
    name: 'Shop',
    component: () => import('../views/Shop.vue')
  },
  {
    path: '/:shelf/:productId',
    name: 'Product',
    component: () => import('../views/Product.vue')
  },
]

const router = new VueRouter({
  mode: 'history',
  base: process.env.BASE_URL,
  routes
})

export default router
