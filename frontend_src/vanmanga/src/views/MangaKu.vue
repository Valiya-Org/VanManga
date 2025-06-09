<template>
  <!-- 电脑版本页面 -->
  <div v-if="!this.$store.state.isPhone" id="uploadTable">

    <el-table
        :data="tableData.filter(data => !search || data.manga_name.toLowerCase().includes(search.toLowerCase())).sort((a,b) => {return b.add_date - a.add_date})"
        class = "grandTable"
        height="100%"
        :stripe = "true"
        :row-style="{background:'transparent',color:'white'}"
        empty-text = "暂时还没有漫画哦"
    >
      <el-table-column
          label="封面"
          prop= "thumbnail"
          width="200">
        <template v-slot:default="scope">
          <a v-if="$store.state.isLoginAlready" :href="scope.row.kavita_url" target="_blank">
            <img :id = "'s'+scope.row.manga_id" :src="scope.row.thumbnail" style="width: 100px; height: 133px; object-fit: contain" >
          </a>
          <img v-else :id = "'s'+scope.row.manga_id" :src="scope.row.thumbnail" style="width: 100px; height: 133px; object-fit: contain" >
        </template>
      </el-table-column>
      <el-table-column
          label="漫画名"
          prop= "manga_name"
          width="240">
      </el-table-column>
      <el-table-column
          label="漫画ID"
          prop="manga_id"
          width="90">
      </el-table-column>
      <el-table-column
          label="作者"
          prop="artist_name"
          width="110">
      </el-table-column>
      <el-table-column
          label="当前库中最新话名称"
          prop="last_epi_name"
          width="240">
      </el-table-column>
      <el-table-column
          label="是否完结"
          prop="serialization"
          width="85">
        <template slot-scope="scope">
          <el-tag v-if="scope.row.serialization === 0" effect="dark" type="primary"><strong>未完结</strong></el-tag>
          <el-tag v-else effect="dark" type="info"><strong>已完结</strong></el-tag>
        </template>
      </el-table-column>
      <el-table-column
          label="抓取状态"
          prop="download_switch"
          width="85">
        <template slot-scope="scope">
          <el-tag v-if="scope.row.download_switch === 0" effect="dark" type="success"><strong>开启中</strong></el-tag>
          <el-tag v-else effect="dark" type="info"><strong>已关闭</strong></el-tag>
        </template>
      </el-table-column>
      <el-table-column
          label="现在状态"
          prop="completed"
          width="90">
        <template slot-scope="scope">
          <span>{{ scope.row.completed === true ? '已完成' : (scope.row.completed === 1 ? '正在抓取...' : '排队中...') }}</span>
        </template>
      </el-table-column>
      <el-table-column
          align="right">
        <!-- eslint-disable-->
        <template v-slot:default="scope">
          <div class="desktopButtonShell">
            <div class="desktopButtonStage">
              <div class="desktopButton">
                <el-button :type="scope.row.download_switch === 0 ? 'warning' : 'success'" icon="el-icon-switch-button" @click = "desktopDownloadSwitchManga(scope.row)" circle></el-button>
                <div class="buttonText">{{scope.row.download_switch === 0 ? "关闭自动抓取" : "开启自动抓取"}}</div>
              </div>
              <div class="desktopButton">
                <el-button type="primary" icon="el-icon-document-add" @click = "openReload(scope.row)" circle></el-button>
                <div class="buttonText">手动抓取章节</div>
              </div>
              <div class="desktopButton">
                <el-button type="danger" icon="el-icon-delete" @click = "desktopDeleteManga(scope.row)" circle></el-button>
                <div class="buttonText">删除该漫画</div>
              </div>
            </div>
          </div>
        </template>
        <template v-slot:header="scope">
          <el-input
              v-model="search"
              size="mini"
              prefix-icon="el-icon-search"
              style="width: 200px"
              placeholder="输入关键字搜索"
          />
        </template>
      </el-table-column>
    </el-table>
    <MangaReloadForm @reload = "reloadPass" @closeNewDir = "closeNewDir" :newVisible = "newVisible" :manga_id="selectedMangaId" :manga_name="selectedMangaName"></MangaReloadForm>
  </div>
  <!-- 手机版本页面 -->
  <div v-else class="mangaKuStage">
    <van-search
        v-model = "search"
        shape = "round"
        @search = "filterOut"
        @keyup.enter.native = "filterOut"
        placeholder="请输入漫画名以搜索"
    />
    <div v-if="tableData.length === 0" class="mobileEmptyStage">
      <van-divider>暂时还没有漫画哦</van-divider>
    </div>
    <div v-else class="mobileCardListStage">
      <div class="mobileCardShell" v-for="item in tableData.filter(data => !search || data.manga_name.toLowerCase().includes(search.toLowerCase())).sort((a,b) => {return b.add_date - a.add_date})" v-bind:key = "item.manga_id">
        <div class="mobileSingleCardStage">
          <van-card
              :desc="item.artist_name"
              :title="item.manga_name"
              :thumb="item.thumbnail"
              centered
              @click = "handleClick(item)"
              class = "mobileSingleCard"
              :thumb-link="$store.state.isLoginAlready ? item.kavita_url : undefined"
          >
            <template #tags>
              <div>漫画ID: {{ item.manga_id }}</div>
              <div>最新话名称: <strong>{{ item.last_epi_name }}</strong></div>
              <div>是否完结: <van-tag :color="item.serialization === 0 ? undefined : '#909399'" type="primary">{{ item.serialization === 0 ? '未完结' : '已完结' }}</van-tag></div>
              <div>抓取状态: <van-tag :color="item.download_switch === 0 ? undefined : '#909399'" type="success">{{ item.download_switch === 0 ? '已开启' : '已关闭' }}</van-tag></div>
            </template>
            <template #num>
              <div>下载状态: <van-tag plain :type="item.completed === true ? 'success' : (item.completed === 1 ? 'primary' : 'warning') ">{{ item.completed === true ? '已完成' : (item.completed === 1 ? '正在抓取...' : '排队中...') }}</van-tag></div>
            </template>
          </van-card>
          <transition name = "mobileCardMaskShow">
          <div v-if="currentId === item.manga_id" class="mobileSingleCardMask" @click = "handleMaskClick">
            <div class="mobileMaskButton">
              <el-button :type="item.download_switch === 0 ? 'warning' : 'success'" icon="el-icon-switch-button" @click="mobileDownloadSwitchManga(item)" circle></el-button>
              <div class="mobileMaskButtonText">{{item.download_switch === 0 ? "关闭抓取" : "开启抓取"}}</div>
            </div>
            <div class="mobileMaskButton">
              <el-button type="primary" icon="el-icon-document-add" @click="openReload(item)" circle></el-button>
              <div class="mobileMaskButtonText">手动抓取</div>
            </div>
            <div class="mobileMaskButton">
              <el-button type="danger" icon="el-icon-delete" @click="mobileDeleteManga(item)" circle></el-button>
              <div class="mobileMaskButtonText">删除漫画</div>
            </div>
          </div>
          </transition>
        </div>
      </div>
    </div>
    <mobile-manga-reload-form @reload = "reloadPass" @closeNewDir = "closeNewDir" :newVisible = "newVisible" :manga_id="selectedMangaId" :manga_name="selectedMangaName"></mobile-manga-reload-form>
  </div>
</template>

<script>
import MangaReloadForm from "@/components/MangaReloadForm.vue"
import mangaKuBaseLogic from "@/assets/methods/mangaKuBaseLogic.vue";

import {Notify} from "vant";
import MobileMangaReloadForm from "@/components/MobileMangaReloadForm";

export default {
  name: "MangaKu",
  components : {
    MobileMangaReloadForm,
    MangaReloadForm,
  },
  mixins:[mangaKuBaseLogic],
  data(){
    return{
      search:"",
      tableData:[],
      newVisible:false,
      selectedMangaId: null,
      selectedMangaName: null,
      currentId: false,
    }
  },

  methods:{
    reloadPass(){
      this.$emit("reload");
    },
    openReload(row){
      this.selectedMangaId = row.manga_id;
      this.selectedMangaName = row.manga_name;
      this.newVisible = true;
    },
    closeNewDir(){
      this.searchFlag = false;
      this.editData = null;
      this.newVisible = false;
    },
    handleClick(item){
      this.currentId = item.manga_id;
    },

    handleMaskClick(){
      this.currentId = "";
    },

    filterOut(){
      this.tableData.filter(data => !this.search || data.manga_name.toLowerCase().includes(this.search.toLowerCase())).sort((a,b) => {return b.add_date - a.add_date});
    },

    // desktopDeleteManga(row){
    desktopDeleteManga(){
      this.$notify({
        title: `该功能暂不开放`,
        message: `该功能暂不开放`,
        type: 'warning',
        position: 'bottom-right'
      });
      // let deleteLoading;
      // let pwd;
      // const info = this.generateDeleteInitialInfo(row);
      // this.$prompt('请输入暗码', '仅管理员可以操作', {
      //   confirmButtonText: '确定',
      //   cancelButtonText: '取消',
      //   inputPattern: /^[A-Za-z0-9]{16}$/,
      //   inputErrorMessage: '暗码错误，无法认证管理员身份，无法进行该危险操作！'
      // }).then(({ value }) => {
      //   pwd = value;
      //   this.$confirm(info, `你确定要删除 ${row.manga_name} 吗？`, {
      //     dangerouslyUseHTMLString: true,
      //     confirmButtonText: '确定',
      //     cancelButtonText: '再想想',
      //   }).then(async () => {
      //         deleteLoading = this.$loading({
      //           lock: true,
      //           text: '正在删除...',
      //           spinner: 'el-icon-loading',
      //           background: 'rgba(0, 0, 0, 0.7)'
      //         });
      //         await this.generalDeleteManga(
      //             row.manga_name,
      //             row.manga_id,
      //             deleteLoading,
      //             pwd,
      //             this.desktopPassNotification,
      //             this.desktopErrorNotification,
      //         );
      //       }
      //   ).catch((error) => {
      //     this.generalDeleteErrorHandler(error,deleteLoading);
      //   });
      // }).catch(() => {});
    },

    desktopDownloadSwitchManga(row){
      let downloadSwitchLoading;
      const info = this.generateDownloadSwitchInitialInfo(row);
      this.$confirm(info, `你确定要改变 ${row.manga_name} 的更新状态吗？`, {
        dangerouslyUseHTMLString: true,
        confirmButtonText: '确定',
        cancelButtonText: '再想想',
      }).then(async () => {
        downloadSwitchLoading = this.$loading({
              lock: true,
              text: '正在上传请求...',
              spinner: 'el-icon-loading',
              background: 'rgba(0, 0, 0, 0.7)'
            });
            await this.generalDownloadSwitch(
                row.manga_name,
                row.manga_id,
                downloadSwitchLoading,
                this.desktopDownloadSwitchPassNotification,
                this.desktopDownloadSwitchNotFoundNotification,
            );
          }
      ).catch((error) => {
        this.generalDownloadSwitchErrorHandler(error,downloadSwitchLoading);
      });
    },

    desktopPassNotification(name){
      this.$notify({
        title: `${name} 已从漫画库删除`,
        message: `已完全将 ${name} 的资源与记录从服务器中删除！`,
        type: 'success',
        position: 'bottom-right'
      })
    },

    desktopErrorNotification(name){
      this.$notify({
        title: `${name} 删除失败`,
        message: `${name}未能正确从服务器中删除，请联系管理员。`,
        type: 'error',
        position: 'bottom-right'
      })
    },

    desktopDownloadSwitchPassNotification(name, download_switch){
      // download_switch === 0 已开启
      if(download_switch === 1){
        this.$notify({
          title: `${name} 已关闭自动更新`,
          message: `${name} 将不会再从漫画源同步新的更新！`,
          type: 'warning',
          position: 'bottom-right'
        })
      }
      else {
        this.$notify({
          title: `${name} 已开启自动更新`,
          message: `${name} 将会从漫画源同步新的更新！`,
          type: 'success',
          position: 'bottom-right'
        })
      }
    },

    desktopDownloadSwitchNotFoundNotification(name){
      this.$notify({
        title: `${name} 未能成功切换`,
        message: `${name} 未能正确从切换服务器的更新状态，请联系管理员。`,
        type: 'error',
        position: 'bottom-right'
      })
    },

    mobileDownloadSwitchManga(row){
      let downloadSwitchLoading;
      const info = this.generateDownloadSwitchInitialInfo(row);
      this.$dialog.confirm({
        title: `你确定要改变 ${row.manga_name} 的更新状态吗？`,
        message: info,
        allowHtml: true,
      }).then(async () => {
        downloadSwitchLoading = this.$loading({
              lock: true,
              text: '正在上传请求...',
              spinner: 'el-icon-loading',
              background: 'rgba(0, 0, 0, 0.7)'
            });
            await this.generalDownloadSwitch(
                row.manga_name,
                row.manga_id,
                downloadSwitchLoading,
                this.mobileDownloadSwitchPassNotification,
                this.mobileDownloadSwitchNotFoundNotification,
            );
          }
      ).catch((error) => {
        this.generalDownloadSwitchErrorHandler(error,downloadSwitchLoading);
      });
    },

    mobileDeleteManga(row){
      let deleteLoading;
      const info = this.generateDeleteInitialInfo(row);
      this.$dialog.confirm({
        title: `你确定要删除 ${row.manga_name} 吗？`,
        message: info,
        allowHtml: true,
      }).then(async () => {
            deleteLoading = this.$loading({
              lock: true,
              text: '正在删除...',
              spinner: 'el-icon-loading',
              background: 'rgba(0, 0, 0, 0.7)'
            });
            await this.generalDeleteManga(
                row.manga_name,
                row.manga_id,
                deleteLoading,
                this.mobilePassNotification,
                this.mobileErrorNotification,
            );
          }
      ).catch((error) => {
        this.generalDeleteErrorHandler(error,deleteLoading);
      });
    },

    mobilePassNotification(name){
      Notify({ type: 'success', message: `${name} 的所有资源与记录已从服务器中删除成功！` });
    },

    mobileErrorNotification(name){
      Notify({ type: 'danger', message: `${name} 删除出现未知错误，请联系管理员！` });
    },

    mobileDownloadSwitchPassNotification(name, download_switch){
      // download_switch === 0 已开启
      if(download_switch === 1){
        Notify({ type: 'warning', message: `${name} 已关闭自动更新, 将不会再从漫画源同步新的更新！` });
      }
      else{
        Notify({ type: 'success', message: `${name} 已开启自动更新, 将会从漫画源同步新的更新！` });
      }
    },

    mobileDownloadSwitchNotFoundNotification(name){
      Notify({ type: 'danger', message: `${name} 未能正确从切换服务器的更新状态，请联系管理员！` });
    },

    generalDownloadSwitchErrorHandler(error, customLording){
      if(error !== "cancel"){
        if(customLording){
          customLording.close();
        }
        this.isSearch = false;
        // if(this.$route.fullPath !== "/") {
        //   this.$router.replace("/");
        // }
        this.$message.error('漫画更新切换出现未知问题，请联系管理员！ Code:' + error.message);
      }
    },

    generalDeleteErrorHandler(error, customLording){
      if(error !== "cancel"){
        if(customLording){
          customLording.close();
        }
        this.isSearch = false;
        // if(this.$route.fullPath !== "/") {
        //   this.$router.replace("/");
        // }
        this.$message.error('漫画删除出现未知问题，请联系管理员！ Code:' + error.message);
      }
    },

  },

  async mounted() {
    const loading = this.$loading({
      lock: true,
      text: '正在加载中...',
      spinner: 'el-icon-loading',
      background: 'rgba(0, 0, 0, 0.7)'
    });
    // eslint-disable-next-line no-undef
    OverlayScrollbars(document.querySelectorAll("#uploadTable .el-table__body-wrapper"), {
      className: 'os-theme-thick-light',
      scrollbars: { autoHide : "none",},
    });

    this.tableData = [];
    await this.$http.post("dogemanga/lib",).then((data) =>{
      let res = data.data;
      if(res.code === 200){
        for(let el of res.data){
          this.tableData.push(el);
        }
        this.tableData.sort(function compare(a,b){return b.add_date - a.add_date});
        loading.close();
      }
    }).catch((error) => {
      loading.close();
      this.isSearch = false;
      if(this.$route.fullPath !== "/") {
        this.$router.replace("/");
      }
      this.$message.error('漫画库加载出现未知问题，请联系管理员！ Code:' + error.message);
    });

    await this.$http.get("dogemanga/cdl",).then((data) =>{
      let res = data.data;
      if(res.code === 200){
        let id = res.data;
        for(let el of this.tableData){
          if(el.manga_id === id){
            el.completed = 1;
          }
        }
      }
    }).catch((error) => {
      loading.close();
      this.isSearch = false;
      if(this.$route.fullPath !== "/") {
        this.$router.replace("/");
      }
      this.$message.error('漫画库下载加载出现未知问题，请联系管理员！ Code:' + error.message);
    });


  },
  sockets: {
    response(data){
      let id = data.manga_id;
      for(let el of this.tableData){
        if(el.manga_id === id){
          el.last_epi_name = data.last_epi_name;
          el.last_epi = data.last_epi;
          break;
        }
      }
    },

    complete_info(data){
      let id = data.manga_id;
      for(let el of this.tableData){
        if(el.manga_id === id){
          el.completed = true;
          if(this.$store.state.isPhone){
            Notify({ type: 'success', message: `${el.manga_name} 完成所有下载！` });
          } else {
            this.$notify({
              title: `${el.manga_name} 完成所有下载！`,
              message: `${el.manga_name} 已经完成所有现有下载任务！等待后续循环更新`,
              type: 'success',
              position: 'bottom-right'
            });
          }
          break;
        }
      }
    },

    downloading_info(data){
      let id = data;
      for(let el of this.tableData){
        if(el.manga_id === id){
          el.completed = 1;
          el.add_date = (Date.now() / 1000);
          if(this.$store.state.isPhone){
            Notify({ type: 'success', message: `${el.manga_name} 开始抓取下载！` });
          } else {
            this.$notify({
              title: `${el.manga_name} 开始抓取下载！`,
              message: `${el.manga_name} 开始初次抓取！`,
              type: 'success',
              position: 'bottom-right'
            });
          }
          break;
        }
      }
    },


  },
  create() {
  },
}
</script>

<style scoped>
*{
  padding: 0;
  margin: 0;
}

.grandTable{
  width: 100%;
  height: 100%;
  background: #252830;
  position: absolute;
}

#uploadTable{
  width: 100%;
  height: 100%;
  position: relative;
  min-height: 550px;
}
/deep/ .el-input__inner {
  background-color: rgba(255, 255, 255, 0.247);
  color: white;
}

.mobileEmptyStage{
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.mobileSingleCard{
  margin: 3px 0px;

}

.mobileCardListStage{
  overflow-y: scroll;

}

.mobileSingleCardStage{
  position: relative;
  overflow-x: hidden;
}

.mobileSingleCardMask{
  position: absolute;
  top: 0;
  right: 0;
  width: 100%;
  height: 100%;
  z-index: 99;
  background-color: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: space-evenly;
  align-items: center;


}

.mobileMaskButton{
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.mobileMaskButtonText{
  padding-top: 5px;
  color: white;
  font-size: 0.8rem;
}

.desktopButton{
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.buttonText{
  padding-top: 5px;
  color: white;
}

.desktopButtonStage{
  display: flex;
  flex-direction: row;
  justify-content: space-evenly;
  align-items: center;
  flex: 0 1 300px;
}

.desktopButtonShell{
  display: flex;
  flex-direction: row-reverse;
}

.mangaKuStage{
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.mobileCardMaskShow-enter-active,.mobileCardMaskShow-leave-active{
  transition: all .3s ease-in-out;
}

.mobileCardMaskShow-enter,.mobileCardMaskShow-leave-to{
  transform: translateX(30px);
  opacity: 0;
}

#uploadTable >>> .el-table th{
  background:#444857;
  color:white;
}

#uploadTable >>> .el-table tr{
  background:#444857;
  color:white;
}

#uploadTable >>> .el-table th.gutter{   /*解决el-table加了gutter后 边框出现白边*/
  background:#444857;
}

#uploadTable >>> .el-table--striped .el-table__body tr.el-table__row--striped td.el-table__cell{
  background-color: #34343f;
}

#uploadTable >>> .el-table--enable-row-hover .el-table__body tr:hover>td {
  background-color: #A85DC3;

}
#uploadTable >>> .el-table--enable-row-hover .el-table__body tr.el-table__row--striped:hover>td.el-table__cell {
  background-color: #A85DC3;

}
#uploadTable >>> .el-table__row>td,#uploadTable >>>  .el-table th.is-leaf{
  border: none;
}

</style>

