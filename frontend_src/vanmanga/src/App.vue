<template>
  <div id="app">
    <router-view></router-view>
    <!--MainPage></MainPage-->
  </div>
</template>
<script>

//import Mainpage from '@/views/MainPage.vue'

export default {
  data() {
    return{
      screenWidth: document.documentElement.clientWidth,
    }
  },
  components: {
  },

  mounted() {
    window.addEventListener('resize', ()=>{
      this.screenWidth = document.body.offsetWidth;
      const isPhone = document.body.offsetWidth < 993;
      this.$store.commit("updateIsPhone", isPhone);
    });

    const initialLoading = this.$loading({
      lock: true,
      text: '正在初始化...',
      spinner: 'el-icon-loading',
      background: 'rgba(0, 0, 0, 0.7)'
    });

    this.$store.commit("updateIsLoginAlready", false);

    //Server Check
    const serverStatusLastCheckTime = JSON.parse(localStorage.getItem("serverStatusLastCheckTime"));
    const serverStatus = JSON.parse(localStorage.getItem("serverStatus"));
    const tenDaysInMs = 10 * 24 * 60 * 60 * 1000;
    const currentTime = Date.now();
    let serverCheckFlag = false;
    if(!serverStatus || ((currentTime - serverStatusLastCheckTime) > tenDaysInMs)){
      this.$http.get("kavita/status").then((data) => {
        let res = data.data;
        if(res.code === 200){
          serverCheckFlag = true;
          localStorage.setItem("serverStatus", "true");
          console.log("服务器自动检查通过");
        }
        else if(res.code === 404){
          serverCheckFlag = false;
          localStorage.setItem("serverStatus", "false");
          localStorage.removeItem('serverStatusLastCheckTime');
          console.log("服务器自动检查失败");
        }
        localStorage.setItem("serverStatusLastCheckTime", JSON.stringify(Date.now()));
        this.$store.commit("updateIsLoginAlready", this.aggregateStatus);
      }).catch((error) => {
        localStorage.removeItem('serverStatus');
        localStorage.removeItem('serverStatusLastCheckTime');
        initialLoading.close();
        this.$message.error('服务器配置状态检查出现未知问题，请联系管理员！ Code:' + error.message);
      })
    } else {
      serverCheckFlag = true;
      console.log("服务器无需被检查");
    }

    //Auto Login
    if(serverCheckFlag){
      const shouldAutoLogin = JSON.parse(localStorage.getItem("autoLogin"));
      const apiKey = localStorage.getItem("apiKey");
      if(shouldAutoLogin && apiKey){
        const iframe = document.createElement('iframe');
        iframe.src = `${window.MANGA_BASE_URL}/login?apiKey=${apiKey}`;
        iframe.style.display = 'none';
        iframe.onload = () => {
          console.log("自动登录成功");
          localStorage.setItem("lastLoginTime", JSON.stringify(Date.now()));
          this.$store.commit("updateIsLoginAlready", true);
        };
        document.body.appendChild(iframe);
      }
    }
    initialLoading.close();
  }
}

</script>
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
