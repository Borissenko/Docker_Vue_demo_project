import Vue from 'vue'
import Vuex, {ActionTree, GetterTree, MutationTree} from 'vuex'
import {RootState} from '@/types'
import shopState from './shop'
import authState from './auth'
import basketState from './basket'
import axios from "axios";

Vue.use(Vuex)

const state = () => ({
  clarification: '',
  alertStuff: {
    slogan: '',
    suffix: '',
    yesFunction: null,
    functionArgument: null,
  },
  besideData: {
    projectDescription: {}
  }
}) as RootState

const getters = {
  GET_CLARIFICATION: ({clarification}): string => clarification,
  GET_ALERT: ({alertStuff}): object => alertStuff,
  GET_DESCRIPTION: ({besideData}): object => besideData.projectDescription
} as GetterTree<RootState, RootState>

const mutations = {
  SET_CLARIFICATION: (state, message) => state.clarification = message,
  SET_ALERT: (state, alertStuff) => state.alertStuff = alertStuff,
// @ts-ignore
  SET_BESIDE_DATA: (state, {dataName, data}) => state.besideData[dataName] = data
} as MutationTree<RootState>

const actions = {
  SHOW_CLARIFICATION({commit}, message): void {
    commit('SET_CLARIFICATION', message)   //показываем пояснение
  },
  SHOW_ALERT({commit}, alertStuff): void {
    commit('SET_ALERT', alertStuff)   //показываем алерт
  },
  async FETCH_DATA_FROM_DISKSTORAGE({commit}, dataName): Promise<void> {
    await axios.get(`api/common_data/${dataName}`)
      .then(({data}) => {
        commit('SET_BESIDE_DATA', {dataName, data})
      })
  }
} as ActionTree<RootState, RootState>

export default new Vuex.Store<RootState>({
  state,
  getters,
  mutations,
  actions,
  modules: {
    shopState,
    authState,
    basketState
  }
})




