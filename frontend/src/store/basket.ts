import Vue from 'vue'
import axios from "axios"
import {MutationTree, ActionTree, GetterTree} from 'vuex'
import {RootState} from '@/types/'
import {UserState, ProductPoint, BasketMovement, AxiosConfig} from '@/types/user'
import {Product, ProductsPoolForShelf} from '@/types/shop'

const state = () => ({
  clientBasket: [],
  isBasketProductsInTheStore: false,    //восстанавливались ли во Vuex после перезагрузки сайта описания продуктов, которые положены в корзину
  isBasketPointsInTheStore: false,       //восстанавливались ли во Vuex после перезагрузки сайта сноски на продукты, которые положены в корзину. Важно, для нормальной работы в асинхронности при перезагрузке броузера.
  privatUserData: {},                      //if you'll need it for future
}) as UserState

const getters = {
  GET_BASKET_POINTS: ({clientBasket}): ProductPoint[] => clientBasket,
  GET_BASKET_PRODUCTS: (state: UserState, getters): Product[] => {
    if (getters.GET_BASKET_POINTS.length === 0)
      return []
    
    //устраняем в корзине повторы заказанных продуктов
    let noRedundantBasketProductPoints = getters.GET_BASKET_POINTS.filter((item: Product, ind: number, arr: Product[]) => ind === arr.findIndex(i => i._id === item._id))
    
    let basketProducts = [] as Product[]
    for (let productPoint of noRedundantBasketProductPoints) {
      let product = getters.GET_PRODUCTS(productPoint.shelf).find((item: Product) => item._id === productPoint._id)
      basketProducts.push(product)
    }
    return basketProducts
  },
  GET_IS_BASKET_PRODUCTS: ({isBasketProductsInTheStore}): boolean => isBasketProductsInTheStore,
  GET_IS_BASKET_POINTS: ({isBasketPointsInTheStore}): boolean => isBasketPointsInTheStore,
  GET_PRODUCT_BASKET_AMOUNT: ({clientBasket}) => ({shelf, _id}: ProductPoint): number => {
    let count = 0
    for (let item of clientBasket) {
      if (item._id === _id)
        count += 1
    }
    return count
  }
} as GetterTree<UserState, RootState>

const mutations = {
  SET_BASKET: (state, recoveryBasket: ProductPoint[]) => state.clientBasket = recoveryBasket,
  SET_IS_BASKET_PRODUCTS: (state, status: boolean) => state.isBasketProductsInTheStore = status,
  SET_IS_BASKET_POINTS: (state, status: boolean) => state.isBasketPointsInTheStore = status,
  ADD_PRODUCT_TO_BASKET: (state, {shelf, _id}: ProductPoint) => state.clientBasket.push({shelf, _id}),
  DELETE_PRODUCT_AT_BASKET: (state, {shelf, _id}: ProductPoint) => {
    let deletedProductIndex = state.clientBasket.findIndex(itemId => itemId._id === _id)
    Vue.delete(state.clientBasket, deletedProductIndex)
  },
  DELETE_PRODUCTS_AT_BASKET: state => state.clientBasket = []
} as MutationTree<UserState>

const actions = {
  async FETCH_BASKET_POINTS({commit}): Promise<void> {     //грузим при загрузе App
    await axios.get(`/auth/basket`)
      .then(({data}) => {
        if (data.length > 0)
          commit('SET_BASKET', data)
        commit('SET_IS_BASKET_POINTS', true)
      })
  },
  async FETCH_BASKET_PRODUCTS({state, getters, commit}): Promise<void> {    //грузим при ПЕРВОМ посещении корзины. Восполняем товар, отсутствующий во Vuex.
    if (state.clientBasket.length > 0) {
      //отбираем тот товар, который обозначен в корзине, но отсутствует во Vuex, (после перезагрузки сайта),
      //одновременно сортируя его по принадлежности к полкам и устраняя повторы.
      let unredundantedBasket = getters.GET_BASKET_POINTS.filter((item: ProductPoint, ind: number, arr: ProductPoint[]) => ind == arr.findIndex(i => i._id === item._id))
      let upsetProducts = {} as any      //{'shelf': [productPoint, ...], }
      for (let productPoint of unredundantedBasket) {
        let isThere = getters.GET_PRODUCTS(productPoint.shelf).some((i: Product) => i._id === productPoint._id)  //присутствует ли корзиночный товар в shop'e.
        
        if (!isThere) {   //корзиночный товар - в shop'e отсутствует.
          if (!upsetProducts[productPoint.shelf])   //если поле для полки в upsetProducts отсутствует, то создаем его.
            upsetProducts[productPoint.shelf] = []
          upsetProducts[productPoint.shelf].push(productPoint)
        }
      }
      
      //дозагружаем недостающий товар по каждой полке
      for await (let shelf of Object.keys(upsetProducts)) {
        let shelfResponses = upsetProducts[shelf].map(async (productPoint: ProductPoint) =>
          await axios.get(`/api/shop/${productPoint.shelf}/${productPoint._id}`)
        )

        let responses = await Promise.allSettled(shelfResponses)

        //выбираем из каждого промиса только его .value.data
        let responseData = [] as Product[]
        //@ts-ignore
        for (let {value} of responses) {
          responseData.push(value.data)
        }
        commit('SET_PRODUCTS', {shelf, products: responseData})
      }
    }
    commit('SET_IS_BASKET_PRODUCTS', true)
  },
  //изменяем в корзине количество единиц выбранного товара
  async MOVE_THE_BASKET_PRODUCT({state, commit}, {shelf, _id, vector}: BasketMovement): Promise<void> {
    if (vector > 0) {
      await axios.put(`/auth/basket`, {shelf, _id})
        .then(response => {
          if (response.status === 200)
            commit('ADD_PRODUCT_TO_BASKET', {shelf, _id})
        })
    } else {
      await axios.delete(`/auth/basket`, {params: {_id}})
        .then(response => {
          if (response.status === 200)
            commit('DELETE_PRODUCT_AT_BASKET', {shelf, _id})
        })
    }
  },
  async CLEAR_BASKET({commit}): Promise<void> {
    await axios.delete(`/auth/basket`, {params: {_id: 'all'}})
      .then(response => {
        if (response.status === 200)
          commit('DELETE_PRODUCTS_AT_BASKET')
      })
  }
} as ActionTree<UserState, RootState>


export default {
  namespaced: false,
  state,
  getters,
  mutations,
  actions
}




