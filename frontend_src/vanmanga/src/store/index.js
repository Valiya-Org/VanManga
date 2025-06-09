import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

export default new Vuex.Store({
  state: {
    isPhone: document.documentElement.clientWidth < 993,
    isLoginAlready: false,
  },
  getters: {
  },
  mutations: {
    updateIsPhone(state,flag){
      state.isPhone = flag;
    },
    updateIsLoginAlready(state,flag){
      state.isLoginAlready = flag;
    },
  },
  actions: {
  },
  modules: {
  }
})
