import Vue from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'
import axios from "axios";
import ElementUI from 'element-ui';
//import { Notification } from 'element-ui';
import '../theme/index.css';
import 'bootstrap-icons/font/bootstrap-icons.css'
import 'overlayscrollbars/css/OverlayScrollbars.css';
import 'overlayscrollbars/css/os-theme-thick-light.css';
import { OverlayScrollbarsPlugin } from 'overlayscrollbars-vue';
import "./css/global.css";
// import VueSocketIO from 'vue-socket.io'
// import SocketIO from 'socket.io-client'
import Vant from 'vant';
import 'vant/lib/index.less';

let base_url = window.MANGA_BASE_URL;
// let base_web_socket = window.MANGA_BASE_WEBSOCKET_URL;


// Vue.use(new VueSocketIO({
//   debug: true,
//   //connection: '192.168.1.143',
//   //connection: SocketIO('http://127.0.0.1:5500'),
//   //connection: SocketIO('http://192.168.1.3:5500'),
//   connection: SocketIO(base_web_socket),
//   extraHeaders: {"Access-Control-Allow-Origin": '*'},
//   options:{
//     autoConnect: false,
//   }
// }));

Vue.config.productionTip = false
Vue.use(ElementUI);
Vue.use(Vant);
axios.defaults.baseURL = "/api";
Vue.prototype.$http = axios;
Vue.prototype.$addr= base_url;
Vue.use(OverlayScrollbarsPlugin);
new Vue({
  sockets: {
    connecting() {
      console.log('正在连接')
    },
    disconnect(){
      console.log("断开链接");
    },
    connect_failed() {
      console.log('连接失败')
    },
    connect() {
      console.log("链接成功",this.$socket.id);
    },
    reconnect(){
      console.log("重新链接");
      //this.$socket.emit('getUserId',this.$store.state.user_id,localStorage.loginToken);
    },

  },
  router,
  store,
  render: h => h(App)
}).$mount('#app')








