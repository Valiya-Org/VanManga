import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from 'vue-router';
import LibraryView from '@/views/LibraryView.vue';
import SettingsView from '@/views/SettingsView.vue';

export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'library', component: LibraryView },
  { path: '/settings', name: 'settings', component: SettingsView },
  // Old bookmarks (/mainpage/searchpage, /mainpage/mangaku, …) land on the library.
  { path: '/mainpage/:pathMatch(.*)*', redirect: '/' },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
