<template>
  <div id = "mainShell">
    <!-- 电脑版本页面 -->
    <el-container v-if="!this.$store.state.isPhone" id = "main">
      <el-header class="frame header">
        <img alt="Vue logo" src="../assets/naiveLogo.png" id="logo">
        <div class="statusBlock">
          <el-tag
              v-if="this.$store.state.isLoginAlready"
              type="success"
              effect="dark">
            跳转开启
          </el-tag>
          <el-tag
              v-else
              type="danger"
              effect="dark">
            跳转关闭
          </el-tag>
          <p id = "logoText">请问你想来点漫画吗？</p>
        </div>
      </el-header>
      <el-container class="mainPart">

        <!--@select ="attedCheck"-->
        <el-menu :default-active="this.$route.fullPath"
                 class="frame aside"
                 :collapse="isCollapse"
                 :router = "true"

                 background-color="#1e1f26"
                 text-color="#fff"
                 active-text-color="#ffd04b">

          <el-menu-item index="/mainpage/searchpage">
            <i class="bi-search menuIcons"></i>
            <span slot="title">搜索添加漫画</span>
          </el-menu-item>
          <el-menu-item index="/mainpage/mangaku">
            <i class="bi-tools menuIcons"></i>
            <span slot="title">现有漫画</span>
          </el-menu-item>
          <el-menu-item index="/mainpage/kavitaLinkCheck">
            <i class="bi-link-45deg menuIcons"></i>
            <span slot="title">Kavita连接配置</span>
          </el-menu-item>

        </el-menu>
        <el-main class="frame main">
          <router-view v-if="isRouterAlive" @reload = "reload"></router-view>
        </el-main>
      </el-container>
      <Announcement class = "announcement"></Announcement>
      <v-pull-button :class = "!isCollapse ? 'mainPagePullButton' : 'mainPagePullButton hide' " :isHide = "isCollapse" @switchCollapse = "handleCollapse"></v-pull-button>
    </el-container>
    <!-- 手机版本页面 -->
    <div v-else class="mobile">
      <van-nav-bar>
        <template #title>
          <div class="mobileLogoStage">
            <img alt="Vue logo" src="../assets/naiveLogo.png" id="mobileLogo">
          </div>
        </template>
      </van-nav-bar>
      <div class="mobileMain">
        <router-view v-if="isRouterAlive" @reload = "reload"></router-view>
      </div>

      <van-tabbar route v-model="mobileTabbarSelectActive">
        <van-tabbar-item replace to="/mainpage/searchpage" name="search" icon="search">搜索漫画</van-tabbar-item>
        <van-tabbar-item replace to="/mainpage/mangaku" name="lib">
          <span>现有漫画</span>
          <template #icon="props">
            <van-icon :name="props.active ? 'star' : 'star-o'" />
          </template>
        </van-tabbar-item>
        <van-tabbar-item replace to="/mainpage/kavitaLinkCheck" name="kavitaLogin" icon="link-o">Kavita登录</van-tabbar-item>
      </van-tabbar>
    </div>
  </div>
</template>

<script>

import VPullButton from "@/components/V-pullButton";
import Announcement from "@/components/Announcement"

export default {

  name: "MainPage",
  data(){
    return{
      mobileTabbarSelectActive: "search",
      isRouterAlive: true,
      isCollapse: false,
    }
  },
  provide() {
    return {
      reload: this.reload,
    }
  },
  methods:{

    reload() {
      this.isRouterAlive = false
      this.$nextTick(function() {
        this.isRouterAlive = true
      })
    },

    handleCollapse(){
      this.isCollapse = !this.isCollapse;
    },
  },
  components:{
    VPullButton,
    Announcement,
  },

  sockets:{
    scan_completed(){
      this.$notify({
        title: `全盘扫描完成`,
        message: `已完成全盘扫描，建议检查后台以确定是否有无法扫描的漫画！`,
        type: 'warning',
        position: 'bottom-right'
      });
    }
  },
  created() {
    // this.$socket.open();
    // console.log("链接启动！");
  },
}
</script>

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

.frame.aside /deep/ .el-menu-item{
  font-size: 16px;
}
.frame.aside /deep/ .el-submenu__title{
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
