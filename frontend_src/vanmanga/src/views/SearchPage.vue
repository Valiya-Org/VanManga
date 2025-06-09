<template>
<div v-if="!this.$store.state.isPhone" class = "searchStage">
  <div class = "searchArea">
    <div class = "globalSearch">
      <el-input
          v-model="search"
          size="mini"
          id = "searchBoxID"
          class = "searchBox"
          prefix-icon="el-icon-search"
          @keyup.enter.native = "sendOut"
          placeholder="输入漫画名，将在现有源中搜索"
      />
      <transition name = "password-error">
        <el-alert v-show="emptyError"
                  title="搜索内容不能为空！"
                  type="error"
                  show-icon :closable="false" id = "emptyErrorMessage" class="errorMsgs">
        </el-alert>
      </transition>
    </div>



    <Vbotton :nameForButton = "'搜索'" :clickMethod = "sendOut" :isIcon ="true" :iconClass = "'bi-search'" class = "searchButton" ></Vbotton>
    <Vbotton :nameForButton = "'扫描'" :clickMethod = "sendOutScan" :isIcon ="true" :iconClass = "'bi-box-seam-fill'" class = "searchButton" ></Vbotton>
  </div>
  <overlay-scrollbars class = "listArea" :options = "defaultStyle" >
    <DocumentList v-if = "isSearch" class="cardPage"  @reload = "reloadPass" :searchList = "searchList"></DocumentList>
  </overlay-scrollbars>

</div>
<div v-else class="mobileSearchStage">
  <van-search
      v-model = "search"
      shape = "round"
      @search = "sendOut"
      @keyup.enter.native = "sendOut"
      placeholder="输入漫画名，将在现有源中搜索"
  />
  <div class="mobileCardListShell">
    <MobileCardList v-if = "isSearch" @reload = "reloadPass" :searchList = "searchList"></MobileCardList>
  </div>
</div>
</template>

<script>
import mixinMethod from "@/assets/methods/checkAndPOP.vue";
import DocumentList from "@/components/DocumentList";
import Vbotton from "@/components/V-botton";
import MobileCardList from "@/components/MobileCardList";
export default {
  name: "SearchPage",
  mixins:[mixinMethod],
  data(){
    return{
      search:"",
      searchList:[],
      emptyError : false,
      isSearch : false,
      defaultStyle: {
        className: 'os-theme-thick-light',
        overflowBehavior : {
          x : "hidden",
        },
        scrollbars: { autoHide : "leave",},

      }
    }
  },
  methods:{
    reloadPass(){
      this.$emit("reload");
    },
    sendOutScan(){
      this.$prompt('请输入暗码', '仅管理员可以操作', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPattern: /^[A-Za-z0-9]{16}$/,
        inputErrorMessage: '暗码错误，无法认证管理员身份，无法进行该危险操作！'
      // }).then(({ value }) => {
      }).then(() => {
        this.$notify({
          title: `该功能暂不开放`,
          message: `该功能暂不开放`,
          type: 'warning',
          position: 'bottom-right'
        });
        // TODO: 需要后端API 添加配合检查
        // const loading = this.$loading({
        //   lock: true,
        //   text: '正在加载中...',
        //   spinner: 'el-icon-loading',
        //   background: 'rgba(0, 0, 0, 0.7)'
        // });
        // this.$http.get("dogemanga/rezip", {
        //   params: {
        //     pwd: value
        //   }}).then((data) =>{
        //   let res = data.data;
        //   if(res.code === 200){
        //     this.$notify({
        //       title: `全盘扫描开始`,
        //       message: `正在全盘扫描检查并打包所有漫画文件，请稍后`,
        //       type: 'success',
        //       position: 'bottom-right'
        //     });
        //     loading.close();
        //   }
        //   else if (res.code === 401) {
        //     this.$notify({
        //       title: `暗码错误`,
        //       message: `暗码错误，无法认证管理员身份，无法进行该危险操作！`,
        //       type: 'error',
        //       position: 'bottom-right'
        //     });
        //     loading.close();
        //   }
        // }
        // ).catch((error) => {
        //   loading.close();
        //   this.isSearch = false;
        //   if(this.$route.fullPath !== "/") {
        //     this.$router.replace("/");
        //   }
        //   this.$message.error('全盘扫描打包出现未知问题，请联系管理员！ Code:' + error.message);
        // });
      }).catch(() => {});
    },

    sendOut(event){
      const isPhone = this.$store.state.isPhone;
      if(this.search === null || this.search === ''){
        this.emptyError = true;
        if(!isPhone){
          this.errorDealing(event,'searchBoxID','emptyErrorMessage');
        }
      }
      else{
        const loading = this.$loading({
          lock: true,
          text: '正在加载中...',
          spinner: 'el-icon-loading',
          background: 'rgba(0, 0, 0, 0.7)'
        });
        this.emptyError = false;
        if(!isPhone) {
          this.recover(event, 'searchBoxID', 'emptyErrorMessage');
        }
        this.isSearch = false;
        this.$http.get("dogemanga/search",{
          params: {
            manga_name: this.search,//请求参数
          },
        }).then((data) =>{

          let res = data.data;
          if(res.code === 200){
            for(let el of res.data){
              this.searchList.push(el);
            }
            this.isSearch = true;
            loading.close();
          }
          else if(res.code === 456) {
            loading.close();
            this.isSearch = false;
            if(!isPhone) {
              this.emptyError = true;
              this.errorDealing(event,'searchBoxID','emptyErrorMessage');
            }
          }
          else if(res.code === 457) {
            loading.close();
            this.$notify({
              title: `搜索出现问题`,
              message: `${this.search} 无法在对应网站源搜索到结果`,
              type: 'error',
              position: 'bottom-right'
            });
          }
        }).catch((error) => {
          loading.close();
          this.isSearch = false;
          if(this.$route.fullPath !== "/") {
            this.$router.replace("/");
          }
          this.$message.error('漫画搜索出现未知问题，请联系管理员！ Code:' + error.message);
        });
      }

    },
  },
  components:{
    DocumentList,
    MobileCardList,
    Vbotton
  },
}
</script>

<style scoped>
.searchStage{
  width: 100%;
  height: 100%;
}
.searchArea{
  width: 100%;
  display: flex;
  height: 120px;
  justify-content: center;
  align-items: center;
}
.globalSearch{
  width: 80%;
  text-align: center;
}
.searchBox{
  width: 90%;
}

.searchBox /deep/ .el-input__inner {
  background-color: rgb(30, 30, 30);
  color: white;
  border: 1px solid transparent;
}

.searchBox /deep/ .el-input__inner:hover{
  border-color: #A85DC3;
  border-top-color: #A85DC3;
  border-right-color: #A85DC3;
  border-bottom-color: #A85DC3;
  border-left-color: #A85DC3;
}
.searchBox /deep/ .el-input{
  box-shadow: 0 4px 7px -3px rgb(20, 25, 38);

}
.listArea{
  width: 100%;
  height:calc(100vh - 180px);
  box-sizing: border-box;
  padding: 15px 15px 15px 15px;

}


.errorMsgs{
  margin-top: 10px;
}

.mobileSearchStage{
  height: 100%;
  display: flex;
  flex-direction: column;
}

.mobileCardListShell{
  overflow: scroll;
  flex-shrink: 1;
}

.password-error-enter-active{
  animation: shaking .3s linear;
}

.password-error-leave-active{
  transition: all 0s ease-in-out;
}
.password-error-leave-to{
  opacity: 0;
}

#logo{
  padding: 0 25px;
  width: 150px;
  height: auto;
}
</style>