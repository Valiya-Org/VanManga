<template>
  <div class="mobileCardListStage">
    <div class="mobileCardShell" v-for="item in searchList" v-bind:key = "item.manga_id">
      <van-card
          :desc="item.artist_name"
          :title="item.manga_name"
          :thumb="'data:image/png;base64,' + item.thumbnail"
          :centered = true
          @click = "handleClick(item)"
          class = "mobileSingleCard"
      >
        <template #tags>
          <span>最新一话: <van-tag color="#a85dc3" plain type="primary">{{ item.newest_epi }}</van-tag></span>
        </template>
      </van-card>
    </div>
  </div>
</template>

<script>
import documentBaseLogic from "@/assets/methods/documentBaseLogic";
import { Notify } from 'vant';

export default {
  name: "MobileCardList",
  props:["searchList"],
  mixins:[documentBaseLogic],
  data(){
    return{
    }
  },

  methods:{
    handleClick(item){
      let submitLoading;
      const info = this.generateInitailInfo(item);
      this.$dialog.confirm({
        title: `你选择的是 ${item.manga_name}`,
        message: info,
        allowHtml: true,
      }).then(async () => {
        submitLoading = this.$loading({
          lock: true,
          text: '正在提交下载请求，等待响应...',
          spinner: 'el-icon-loading',
          background: 'rgba(0, 0, 0, 0.7)'
        });
        await this.submitSelection(
            item,
            submitLoading,
            "0",
            this.mobilePassNotification,
            this.mobileAlreadyExistNotification,
            this.mobileAdditionalDuplicateHandler,
        )
      }).catch((error) => {
            if(error !== "cancel") {
              if (submitLoading) {
                submitLoading.close();
              }
              submitLoading.close();
              this.isSearch = false;
              if (this.$route.fullPath !== "/") {
                this.$router.replace("/");
              }
              Notify({type: 'danger', message: `漫画搜索出现未知问题，请联系管理员！ Code:` + error.message});
            }
      })
    },

    mobileAdditionalDuplicateHandler(previousRes, item){
      const info = this.generateAdditionalDuplicateInfo(item, previousRes)
      this.$dialog.confirm(
          {
            title: `我们检查了已有漫画，发现有可能的重复！`,
            message: info,
            allowHtml: true,
            confirmButtonText: '仍要添加',
            cancelButtonText:'取消退出'
          }
      ).then(async () => {
            const submitLoading = this.$loading({
              lock: true,
              text: '正在提交下载请求，等待响应...',
              spinner: 'el-icon-loading',
              background: 'rgba(0, 0, 0, 0.7)'
            });
            await this.submitSelection(
                this.item,
                submitLoading,
                "1",
                this.desktopPassNotification,
                this.desktopAlreadyExistNotification
            );
          }
      ).catch((error) => {
        throw error
      });
    },

    mobilePassNotification(item){
      Notify({ type: 'success', message: `${item.manga_name} 已入库, ID: ${item.manga_id}, 已开始在后台下载！` });
    },

    mobileAlreadyExistNotification(item){
      Notify({ type: 'danger', message: `${item.manga_name} 已存在在库中, 请仔细检查后再添加！` });
    },

  },

  components:{
    [Notify.Component.name]: Notify.Component,
  }
}
</script>

<style scoped>
.mobileCardListStage{
  width: 100%;
  height: 100%;
}

.mobileSingleCard{
  margin: 10px 0px;
}
</style>