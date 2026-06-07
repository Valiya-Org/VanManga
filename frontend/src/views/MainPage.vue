<script setup lang="ts">
import { ref, onMounted, onUnmounted, provide, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { Search, Tools, Link } from '@element-plus/icons-vue';
import Announcement from '@/components/Announcement.vue';
import VPullButton from '@/components/VPullButton.vue';
import { useAppStore } from '@/stores/app';
import { useSocket } from '@/composables/useSocket';
import { notifyError } from '@/utils/ui';
import nativeLogo from '@/assets/nativeLogo.png';

const store = useAppStore();
const route = useRoute();

const mobileTabbarActive = ref('search');
const isRouterAlive = ref(true);
const isCollapse = ref(false);

function reload(): void {
  isRouterAlive.value = false;
  void nextTick(() => {
    isRouterAlive.value = true;
  });
}
provide('reload', reload);

function handleCollapse(): void {
  isCollapse.value = !isCollapse.value;
}

const { connect, disconnect, on } = useSocket();
function onScanCompleted(): void {
  notifyError(
    '全盘扫描完成',
    '已完成全盘扫描，建议检查后台以确定是否有无法扫描的漫画！',
  );
}

onMounted(() => {
  on('scan_completed', onScanCompleted);
  connect();
});
onUnmounted(() => {
  disconnect();
});
</script>

<template>
  <div id="mainShell">
    <!-- 桌面 -->
    <el-container v-if="!store.isPhone" id="main">
      <el-header class="frame header">
        <img :src="nativeLogo" alt="logo" id="logo" />
        <div class="statusBlock">
          <el-tag v-if="store.isLogin" type="success" effect="dark">跳转开启</el-tag>
          <el-tag v-else type="danger" effect="dark">跳转关闭</el-tag>
          <p id="logoText">请问你想来点漫画吗？</p>
        </div>
      </el-header>
      <el-container class="mainPart">
        <el-menu
          :default-active="route?.fullPath ?? ''"
          class="frame aside"
          :collapse="isCollapse"
          router
          background-color="#1e1f26"
          text-color="#fff"
          active-text-color="#ffd04b"
        >
          <el-menu-item index="/mainpage/searchpage">
            <el-icon><Search /></el-icon>
            <span>搜索添加漫画</span>
          </el-menu-item>
          <el-menu-item index="/mainpage/mangaku">
            <el-icon><Tools /></el-icon>
            <span>现有漫画</span>
          </el-menu-item>
          <el-menu-item index="/mainpage/kavitaLinkCheck">
            <el-icon><Link /></el-icon>
            <span>Kavita连接配置</span>
          </el-menu-item>
        </el-menu>
        <el-main class="frame main">
          <router-view v-if="isRouterAlive" />
        </el-main>
      </el-container>
      <Announcement class="announcement" />
      <VPullButton
        :class="!isCollapse ? 'mainPagePullButton' : 'mainPagePullButton hide'"
        :is-hide="isCollapse"
        @switch-collapse="handleCollapse"
      />
    </el-container>
    <!-- 移动 -->
    <div v-else class="mobile">
      <van-nav-bar>
        <template #title>
          <div class="mobileLogoStage">
            <img :src="nativeLogo" alt="logo" id="mobileLogo" />
          </div>
        </template>
      </van-nav-bar>
      <div class="mobileMain">
        <router-view v-if="isRouterAlive" />
      </div>
      <van-tabbar v-model="mobileTabbarActive" route>
        <van-tabbar-item replace to="/mainpage/searchpage" name="search" icon="search">搜索漫画</van-tabbar-item>
        <van-tabbar-item replace to="/mainpage/mangaku" name="lib" icon="star-o">现有漫画</van-tabbar-item>
        <van-tabbar-item replace to="/mainpage/kavitaLinkCheck" name="kavitaLogin" icon="link-o">Kavita登录</van-tabbar-item>
      </van-tabbar>
    </div>
  </div>
</template>

<style scoped>
#mainShell{
  width: 100%;
  height: 100%;
}

#main{
  width: 100%;
  min-width: max-content;
  position: relative;
  height: 100%;
  min-height: 750px;
  background: linear-gradient(to right,#1e1f26 25%,black 100%);

}
.mobile{
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.mobileMain{
  /*减去导航栏和下方的操作栏*/
  height: calc(100vh - 50px - 46px);
  overflow: hidden;
}

.frame {
  padding: 0;
}

.frame.header{
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  background-image: url("../assets/imgs/ccc.gif"),url("../assets/imgs/sparklesBig.gif"),linear-gradient(to right, rgba(17, 7, 12, 0.7) 10%,#06007E3F 20%, #06007E3F 90%, rgba(17, 7, 12, 0.7) 100%);
  animation: rotate 15s linear infinite , glowRotate 15s linear infinite;
  background-size: 50%;
  background-blend-mode: overlay;
  border-radius: 0 0 15px 15px;
  z-index: 2;
}
.mainPart{
  width: 100%;
  height: calc(100vh - 60px);

}

@keyframes glowRotate {
  0% {
    filter: drop-shadow(-15px -10px 10px #f0f) drop-shadow(-15px -10px 10px #324949);
  }
  25% {
    filter: drop-shadow(-15px -10px 20px #f0f) drop-shadow(-15px -10px 20px #324949);
  }
  50% {
    filter: drop-shadow(-15px -10px 10px #0080ff) drop-shadow(-15px -10px 10px #324949);
  }
  75% {
    filter: drop-shadow(-15px -10px 20px #0080ff) drop-shadow(-15px -10px 20px #324949);
  }
  100% {
    filter: drop-shadow(-15px -10px 10px #f0f) drop-shadow(-15px -10px 10px #324949);
  }
}

@keyframes rotate {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 50% 50%;
  }
  100% {
    background-position: 100% 50%;
  }
}

.frame.main{
  max-height: 100%;
  background: #252830;
  position: relative;
  overflow: hidden;
}

.frame.aside{

  border: none;

  height: 100%;
  font-family: "AaGothic (Non-Commercial Use)";

  z-index: 1;
}

.frame.aside :deep(.el-menu-item){
  font-size: 16px;
}
.frame.aside :deep(.el-submenu__title){
  font-size: 16px;
}

#logo{
  padding: 0 25px;
  width: 150px;
  height: auto;
  filter:invert(100%);
  cursor: pointer;
}
#logoText{
  font-size: 1.5em;
  margin: 0px 20px;
  font-family: "AaGothic (Non-Commercial Use)";
  color: white;
}

#mobileLogo{
  height: 46px;
}

.mobileLogoStage{
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter:invert(100%);
}

.menuIcons{
  margin-right: 5px;
  width: 24px;
  font-size: 18px;
}

.frame.aside:not(.el-menu--collapse) {
  width: 220px;
  min-height: 550px;
}
.mainPagePullButton{
  position: absolute;
  left: 160px;
  bottom: 20px;
  z-index: 0;
  transition: all 0.3s ease-in-out;
}
.mainPagePullButton.hide{
  left: 4px;

}

.announcement{
  position: absolute;
  bottom: 10px;
  right: 20px;
}

.statusBlock{
  display: flex;
  flex-direction: row;
  justify-content: space-evenly;
  align-items: center;
}

</style>
<style>
/*mobile*/
.van-nav-bar__content{
  background: linear-gradient(-45deg, #9055FF, #6699FF, #23d5ab);
  background-size: 400% 400%;
  animation: gradient 15s ease infinite, glowRotateMobile 15s linear infinite;
  background-blend-mode: overlay;
  border-radius: 0 0 15px 15px;
}
.van-nav-bar.van-hairline--bottom::after{
  border-bottom-width: 0px;
}
</style>
