import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from 'vue-router';
import MainPage from '@/views/MainPage.vue';
import SearchPage from '@/views/SearchPage.vue';
import MangaKu from '@/views/MangaKu.vue';
import KavitaCheckPage from '@/views/KavitaCheckPage.vue';
import ErrorPage from '@/views/ErrorPage.vue';

export const routes: RouteRecordRaw[] = [
  {
    path: '/mainpage',
    name: 'MainPage',
    component: MainPage,
    redirect: '/mainpage/searchpage',
    children: [
      { path: 'searchpage', name: 'SearchPage', component: SearchPage },
      { path: 'mangaku', name: 'MangaKu', component: MangaKu },
      {
        path: 'kavitaLinkCheck',
        name: 'KavitaCheck',
        component: KavitaCheckPage,
      },
    ],
  },
  { path: '/', redirect: '/mainpage/searchpage' },
  {
    path: '/:pathMatch(.*)*',
    name: 'Error',
    component: ErrorPage,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
