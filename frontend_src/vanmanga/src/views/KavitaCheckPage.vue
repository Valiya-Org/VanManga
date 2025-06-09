<template>
  <!-- 电脑版本页面 -->
  <div v-if="!this.$store.state.isPhone" class="kavitaCheckStage">
    <div class="kavitaUserLogin">
      <p class="kavitaTitle">请输入您在Kavita漫画库中的用户信息，用以开启跳转功能</p>
      <el-input v-model="username" :disabled="!this.serverStatus" placeholder="请输入用户名"></el-input>
      <el-input v-model="password" :disabled="!this.serverStatus" placeholder="请输入密码" show-password></el-input>
      <Vbotton :nameForButton = "'登录'" :clickMethod = "login" :isIcon ="true" :iconClass = "'el-icon-s-promotion'"></Vbotton>
    </div>
    <div class="kavitaKanBan">
    <p class="kavitaStatus">跳转功能：<el-tag :type="this.aggregateStatus ? 'success' : 'danger'" effect="dark">{{this.aggregateStatus ? '开启' : '关闭'}}</el-tag></p>
    <div :class="this.aggregateStatus ? 'kavitaInfoBorderSuccess' : 'kavitaInfoBorderFail'">
      <div class="kavitaUserInfo">
        <p class="kavitaTitle">服务器是否成功配置Kavita？</p>
        <el-result v-if="this.serverStatus" icon="success">
          <template slot="title">
            <p class="kavitaTitle">服务器配置有效！</p>
          </template>
        </el-result>
        <el-result v-else icon="error">
          <template slot="title">
            <p class="kavitaTitle">服务器配置无效！</p>
          </template>
          <template slot="subTitle">
            <p class="kavitaTitle">请联系管理员</p>
          </template>
        </el-result>
      </div>
      <div class="kavitaUserInfo">
        <p class="kavitaTitle">现在您的登录状态</p>
        <el-result v-if="this.possibleLoginStatus" icon="success">
          <template slot="title">
            <p class="kavitaTitle">登录信息有效！</p>
          </template>
        </el-result>
        <el-result v-else icon="error">
          <template slot="title">
            <p class="kavitaTitle">登录信息可能已经失效！</p>
          </template>
          <template slot="subTitle">
            <p class="kavitaTitle">请尝试再次登录</p>
          </template>
        </el-result>
      </div>
    </div>
    </div>

  </div>
  <!-- 手机版本页面 -->
  <div v-else class="mobileKavitaCheckStage">
    <div class="mobileKavitaUserLoginCard">
      <div class="mobileKavitaUserLoginTitleStage">
        <p class="mobileKavitaUserLoginTitle">KAVITA 登录</p>
      </div>
      <div class="mobileInfoEnter">
        <van-field v-model="username" label="用户名" placeholder="请输入用户名" />
        <van-field v-model="password" label="密码" type="password" placeholder="请输入密码" />
      </div>
      <van-button round :color="'#A85DC3'" type="info" @click="login">点我登录</van-button>
    </div>

    <div class="mobileKavitaKanBan">
      <p class="mobileKavitaStatus">跳转功能：<el-tag :type="this.aggregateStatus ? 'success' : 'danger'" effect="dark">{{this.aggregateStatus ? '开启' : '关闭'}}</el-tag></p>
      <div :class="this.aggregateStatus ? 'mobileKavitaInfoBorderSuccess' : 'mobileKavitaInfoBorderFail'">
        <div class="mobileKavitaUserInfo">
          <el-result v-if="this.serverStatus" icon="success">
            <template slot="title">
              <p class="mobileKavitaTitle">服务器配置有效</p>
            </template>
          </el-result>
          <el-result v-else icon="error">
            <template slot="title">
              <p class="mobileKavitaTitle">服务器配置无效</p>
            </template>
            <template slot="subTitle">
              <p class="mobileKavitaTitle">请联系管理员</p>
            </template>
          </el-result>
        </div>
        <div class="mobileKavitaUserInfo">
          <el-result v-if="this.possibleLoginStatus" icon="success">
            <template slot="title">
              <p class="mobileKavitaTitle">登录信息有效</p>
            </template>
          </el-result>
          <el-result v-else icon="error">
            <template slot="title">
              <p class="mobileKavitaTitle">登录信息可能已经失效</p>
            </template>
            <template slot="subTitle">
              <p class="mobileKavitaTitle">请尝试再次登录</p>
            </template>
          </el-result>
        </div>
      </div>
    </div>

  </div>
</template>

<script>
import Vbotton from "@/components/V-botton";
import {Notify} from "vant";

export default {
  name: "KavitaCheckPage",
  components: {Vbotton},
  data(){
    return{
      username:"",
      password:"",
      aggregateStatus: false,
      serverStatus: false,
      possibleLoginStatus: false,
    }
  },

  methods:{
    async login(){
    const loginLoading = this.$loading({
        lock: true,
        text: '正在登录...',
        spinner: 'el-icon-loading',
        background: 'rgba(0, 0, 0, 0.7)'
      });
    this.$http.post("kavita/login", {
        username: this.username,
        password: this.password,
      }).then((data) => {
        let res = data.data;
        if(res.code === 200){
          localStorage.setItem("apiKey", res.data.apiKey);
          localStorage.setItem("autoLogin", JSON.stringify(true));
          const iframe = document.createElement('iframe');
          iframe.src = `${window.MANGA_BASE_URL}/login?apiKey=${res.data.apiKey}`;
          iframe.style.display = 'none';
          iframe.onload = () => {
            localStorage.setItem("lastLoginTime", JSON.stringify(Date.now()));
            this.$store.commit("updateIsLoginAlready", true);
            this.possibleLoginStatus = true;
            if(this.$store.state.isPhone){
              Notify({ type: 'success', message: `登录成功, 登录状态已更新` });
            } else {
              this.$notify({
                title: `登录成功`,
                message: `登录状态已更新`,
                type: 'success',
                position: 'bottom-right'
              });
            }
            this.username = "";
            this.password = "";
            loginLoading.close();
          };
          document.body.appendChild(iframe);
        }
        else if(res.code === 434){
          if(this.$store.state.isPhone){
            Notify({type: 'danger', message: `Kavita漫画库未能成功配置，请联系管理员配置漫画库`});
          } else {
            this.$notify({
              title: `Kavita漫画库未能成功配置`,
              message: `请联系管理员配置漫画库`,
              type: 'error',
              position: 'bottom-right'
            });
          }
          this.password = "";
          loginLoading.close();
        }
        else if(res.code === 500){
          if(this.$store.state.isPhone){
            Notify({type: 'danger', message: `密码或用户名可能错误，无法完成登录`});
          } else {
            this.$notify({
              title: `登陆失败`,
              message: `密码或用户名可能错误，无法完成登录。若多次尝试仍无法登录请联系管理员`,
              type: 'error',
              position: 'bottom-right'
            });
          }
          this.password = "";
          loginLoading.close();
        }
      }).catch((error) => {
      loginLoading.close();
      localStorage.removeItem('apiKey');
      localStorage.removeItem('lastLoginTime');
      localStorage.removeItem("autoLogin");
      this.$store.commit("updateIsLoginAlready", false);
      this.username = "";
      this.password = "";
      if(this.$route.fullPath !== "/") {
        this.$router.replace("/");
      }
      this.$message.error('服务器配置状态检查出现未知问题，请联系管理员！ Code:' + error.message);
      })
    }
  },

  watch:{
    possibleLoginStatus(val){
      this.aggregateStatus = this.serverStatus && val;
    }
  },

  async mounted() {
    const lastLoginTime = JSON.parse(localStorage.getItem("lastLoginTime"));
    const serverStatus = JSON.parse(localStorage.getItem("serverStatus"));
    const serverStatusLastCheckTime = JSON.parse(localStorage.getItem("serverStatusLastCheckTime"));
    const tenDaysInMs = 10 * 24 * 60 * 60 * 1000;
    const currentTime = Date.now();

    // 用户登录时间戳排查
    if((currentTime - lastLoginTime) > tenDaysInMs){
      this.possibleLoginStatus = false;
    }
    else{
      this.possibleLoginStatus = true;
    }

    //服务器状态时间戳排查
    if(!serverStatus || ((currentTime - serverStatusLastCheckTime) > tenDaysInMs)){
      const checkLoading = this.$loading({
        lock: true,
        text: '正在检查服务器状态...',
        spinner: 'el-icon-loading',
        background: 'rgba(0, 0, 0, 0.7)'
      });

      this.$http.get("kavita/status").then((data) => {
        let res = data.data;
        if(res.code === 200){
          this.serverStatus = true;
          this.aggregateStatus = this.serverStatus && this.possibleLoginStatus;
          localStorage.setItem("serverStatus", "true");
        }
        else if(res.code === 404){
          this.serverStatus = false;
          this.aggregateStatus = false;
          this.possibleLoginStatus  = false;
          localStorage.setItem("serverStatus", "false");
          localStorage.removeItem('serverStatusLastCheckTime');
        }
        localStorage.setItem("serverStatusLastCheckTime", JSON.stringify(Date.now()));
        this.$store.commit("updateIsLoginAlready", this.aggregateStatus);
        checkLoading.close();
      }).catch((error) => {
        checkLoading.close();
        localStorage.removeItem('serverStatus');
        localStorage.removeItem('serverStatusLastCheckTime');
        this.$store.commit("updateIsLoginAlready", false);
        if(this.$route.fullPath !== "/") {
          this.$router.replace("/");
        }
        this.$message.error('服务器配置状态检查出现未知问题，请联系管理员！ Code:' + error.message);
      })
    }
    else{
      this.serverStatus = serverStatus;
      this.aggregateStatus = this.serverStatus && this.possibleLoginStatus;
      this.$store.commit("updateIsLoginAlready", this.aggregateStatus);
    }
  },

}
</script>

<style scoped>
*{
  padding: 0;
  margin: 0;
}

.kavitaCheckStage{
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row;
  justify-content: space-evenly;
  align-items: center;
}

.kavitaUserLogin{
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  align-items: center;
}

.kavitaUserInfo{
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  align-items: center;
  margin: 20px;
}

.kavitaTitle{
  font-size: large;
  color: white;
  font-family: "AaGothic (Non-Commercial Use)", Helvetica, sans-serif;
}

.kavitaStatus{
  font-size: 1.8rem;
  display: flex;
  justify-content: center;
  align-items: center;
  color: white;
  font-family: "AaGothic (Non-Commercial Use)", Helvetica, sans-serif;
  margin: 20px;
}

.kavitaKanBan{
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  align-items: center;
}

.mobileKavitaKanBan{
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  align-items: center;
  position: relative;
  padding-top: 17px;
}

.mobileKavitaInfoBorderSuccess{
  border-radius: 10px;
  border: 5px solid greenyellow;
  display: flex;
  flex-direction: row;
  margin: 0px 24px;
  width: calc(100vw - 48px);
}


.mobileKavitaInfoBorderFail{
  border-radius: 10px;
  border: 5px solid red;
  display: flex;
  flex-direction: row;
  margin: 0px 24px;
  width: calc(100vw - 48px);
}

.mobileKavitaUserInfo{
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  align-items: center;
}

.mobileKavitaTitle{
  font-size: 1rem;
}

.mobileKavitaStatus{
  font-size: 1.2rem;
  display: flex;
  justify-content: center;
  align-items: center;
  position: absolute;
  top: 0px;
  padding: 0px 6px;
  background-color: white;
}

.kavitaInfoBorderSuccess{
  border-radius: 10px;
  border: 5px solid greenyellow;
}


.kavitaInfoBorderFail{
  border-radius: 10px;
  border: 5px solid red;
}

.mobileKavitaUserLoginCard{
  margin: 24px;
  padding: 10px;
  border-radius: 12px;
  box-shadow: 0 8px 12px #ebedf0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: calc(100vw - 56px);
}

.mobileKavitaUserLoginTitle{
  font-size: 1.2rem;
  padding: 10px 16px;
}

.mobileInfoEnter{
  width: 100%;
  margin: 16px 0px;
}

.mobileKavitaUserLoginTitleStage{
  width: 100%;
}

.mobileKavitaCheckStage{
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  align-items: center;
}

</style>