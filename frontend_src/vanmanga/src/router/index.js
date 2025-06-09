import Vue from 'vue'
import VueRouter from 'vue-router'
import MainPage from '../views/MainPage.vue'
import SearchPage from '../views/SearchPage.vue'
import MangaKu from '../views/MangaKu.vue'
import Error from '../views/ErrorPage.vue'
import KavitaCheckPage from "../views/KavitaCheckPage";
Vue.use(VueRouter)

const routes = [
  {
    path: '/mainpage',
    name: 'MainPage',
    component: MainPage,
    children:[
      {path : 'searchpage', component: SearchPage},
      {path : 'mangaku', component: MangaKu},
      {path : 'kavitaLinkCheck', component: KavitaCheckPage},
    ],
  },
  {
    path: '*',
    name: 'Error',
    component: Error,
    meta: {
      isLogin: false
    }
  },
]

const router = new VueRouter({
  mode: 'history',
  base: process.env.BASE_URL,
  routes
})
router.beforeEach((to,from,next) =>{

  if(to.path === '/' || to.path === '/mainpage'){
    next('/mainpage/searchpage');
  }else{
    next();
  }
})
export default router
