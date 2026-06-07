<script setup lang="ts">
import { onMounted } from 'vue';
import { useResponsive } from '@/composables/useResponsive';
import { useAppStore } from '@/stores/app';
import { kavitaStatus } from '@/api/kavita';
import { showLoading, messageError } from '@/utils/ui';

const store = useAppStore();
useResponsive();

const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

function autoLogin(): void {
  const shouldAutoLogin = JSON.parse(
    localStorage.getItem('autoLogin') ?? 'null',
  );
  const apiKey = localStorage.getItem('apiKey');
  if (shouldAutoLogin && apiKey) {
    const iframe = document.createElement('iframe');
    iframe.src = `${window.MANGA_BASE_URL}/login?apiKey=${apiKey}`;
    iframe.style.display = 'none';
    iframe.onload = () => {
      localStorage.setItem('lastLoginTime', JSON.stringify(Date.now()));
      store.setIsLogin(true);
    };
    document.body.appendChild(iframe);
  }
}

function initApp(): void {
  const initialLoading = showLoading('正在初始化...');
  store.setIsLogin(false);

  const serverStatusLastCheckTime = JSON.parse(
    localStorage.getItem('serverStatusLastCheckTime') ?? 'null',
  );
  const serverStatus = JSON.parse(localStorage.getItem('serverStatus') ?? 'null');
  const currentTime = Date.now();
  let serverCheckFlag = false;

  if (
    !serverStatus ||
    currentTime - serverStatusLastCheckTime > TEN_DAYS_MS
  ) {
    kavitaStatus()
      .then((res) => {
        if (res.code === 200) {
          serverCheckFlag = true;
          localStorage.setItem('serverStatus', 'true');
        } else if (res.code === 404) {
          serverCheckFlag = false;
          localStorage.setItem('serverStatus', 'false');
          localStorage.removeItem('serverStatusLastCheckTime');
        }
        localStorage.setItem(
          'serverStatusLastCheckTime',
          JSON.stringify(Date.now()),
        );
        store.setIsLogin(serverCheckFlag);
      })
      .catch((error: { message?: string }) => {
        localStorage.removeItem('serverStatus');
        localStorage.removeItem('serverStatusLastCheckTime');
        initialLoading.close();
        messageError(
          '服务器配置状态检查出现未知问题，请联系管理员！ Code:' +
            (error.message ?? ''),
        );
      });
  } else {
    serverCheckFlag = true;
  }

  if (serverCheckFlag) {
    autoLogin();
  }
  initialLoading.close();
}

onMounted(initApp);
</script>

<template>
  <div id="app">
    <router-view />
  </div>
</template>

<style>
#app{
  width: 100vw;
  height: 100vh;
}

.van-image__img{
  object-fit: contain !important;
}

#uploadTotalBar.el-progress .el-progress-bar__inner{
  background: linear-gradient(-30deg, #00B3CC, #ED7B84,  #9055FF, #6699FF);
  background-size: 700% 700%;
  animation: gradient 15s ease infinite;
}
.el-progress .el-progress-bar__outer{
  background: rgba(235, 238, 245, 0.3)
}

.el-popover{
  background: #1e1f26 !important;
  border: #1e1f26 !important;
}
.el-popover__title{
  color: white !important;
}
.el-popover[x-placement^="bottom"] .popper__arrow{
  border-bottom-color: #1e1f26 !important;
}
.el-popover[x-placement^="bottom"] .popper__arrow::after{
  border-bottom-color: #1e1f26 !important;
}

.el-popper[x-placement^="left"] .popper__arrow{
  border-left-color: #1e1f26 !important;
}
.el-popper[x-placement^="left"] .popper__arrow::after{
  border-left-color: #1e1f26 !important;
}
.message{
  background-color: #444857 !important;
  border: #444857 !important;
}
/*.el-notification__title,.el-notification__content{*/
/*  color: white !important;*/
/*}*/

.el-dropdown-menu.el-popper{
  background-color: rgba(0,0,0,0.9) !important;
  border: transparent !important;
  -webkit-box-shadow: 2px 2px 8px 0 rgb(0 0 0 / 20%) !important;
  box-shadow: 2px 2px 8px 0 rgb(0 0 0 / 20%) !important;
}
.el-dropdown-menu.el-popper[x-placement^=bottom] .popper__arrow{
  border-bottom-color: rgba(0,0,0,0.9) !important;

}
.el-dropdown-menu.el-popper[x-placement^=bottom] .popper__arrow::after{
  border-bottom-color: rgba(0,0,0,0.9) !important;
}

.el-dropdown-menu__item{
  color: white !important;
}
.el-dropdown-menu__item:hover{
  background: linear-gradient(to left,rgba(0,0,0,0.9) 50%,#E040FB 100%);
  background-size: 300% 300%;
  animation: superGradient 0.25s ease-in-out;
}

.mainPart .el-submenu .el-menu-item{
  height: 35px;
  line-height: 35px;
}
.mainPart .el-menu-item{
  height: 45px;
  line-height: 45px;
}

.mainPart .el-submenu__title{
  height: 45px;
  line-height: 45px;
}
@keyframes superGradient {
  0% {
    background-position: 100% 0%;
  }
  25% {
    background-position: 75% 0%;
  }
  50% {
    background-position: 50% 0%;
  }
  75% {
    background-position: 25% 0%;
  }
  100% {
    background-position: 0% 0%;
  }
}

</style>
