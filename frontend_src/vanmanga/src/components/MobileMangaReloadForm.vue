<template>
  <van-field-checkbox
      v-model="allMultipleSelection"
      placeholder="请选择"
      :columns="chapterData"
      label-width="100"
      :option="{label:'chapter_title', value:'chapter_link'}"
      :newVisible = "realNewVisable"
      @closeNewDir = "closeNewDir"
      @confirm = "openConfirm"
  >
  </van-field-checkbox>
</template>

<script>
import VanFieldCheckbox from "@/components/VanFieldCheckbox";
import mangaReloadFormBaseLogic from "@/assets/methods/mangaReloadFormBaseLogic";
import {Notify} from "vant";
export default {
  name: "MobileMangaReloadForm",
  props:["newVisible","manga_name","manga_id"],
  mixins:[mangaReloadFormBaseLogic],
  components: {VanFieldCheckbox},
  data(){
    return{
      search:"",
      chapterData:[],
      allMultipleSelection: [],
      realNewVisable: false,
    }
  },

  methods:{
    closeNewDir(){
      this.allMultipleSelection = [];
      this.$emit("closeNewDir");
    },

    openConfirm(valueList, wholeList){
      this.allMultipleSelection = wholeList;
      const nameList = this.allMultipleSelection.map(el => el.chapter_title).sort((a,b) => {return a.chapter_title - b.chapter_title});
      let listString = "";
      for(let el of nameList){
        listString = listString + `<div>${el}</div>`
      }

      const info = `<div class="confirmPage">
                        <div>需要重新下载的章节有</div>
                        <div style="width: 100%; display: flex; flex-direction: column; align-items: center; max-height : 30vh; overflow : auto" class="confirmList">
                        ${listString}
                        </div>
                        <div><strong>请仔细确认！任务会被安排进入下载队列且无法退回</strong></div>
                    </div>`;

      const msgBoxPromise = () => {
        return this.$dialog.confirm({
          title: '你确定吗？',
          message: info,
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          allowHtml: true
        })
      }

      const errorNotification = ()=>{
        Notify({ type: 'danger', message: `你未选中任何章节，无法提交重新下载请求` });
      };
      this.generalOpenConfirm(msgBoxPromise, errorNotification);
    },

    submitReload(){
      const submitNotification = () => {
        Notify({ type: 'success', message: `${this.manga_name} 中所选中的章节已提交下载!` });
      };

      this.generalSubmitReload(submitNotification);
    }
  },

  watch:{
    'newVisible':{
      handler(val){
        if(val){
          const fetchListLoading = this.$loading({
            lock: true,
            text: '正在获取可下载的章节列表，请稍后',
            spinner: 'el-icon-loading',
            background: 'rgba(0, 0, 0, 0.7)'
          });
          this.chapterData = [];
          this.$http.get("dogemanga/confirmmanga", {
            params: {
              manga_id: this.manga_id
            }}).then((data) =>{
            let res = data.data;
            if(res.code === 200){
              for(let el of res.data){
                this.chapterData.push(el);
              }
              this.chapterData.sort(function compare(a,b){return b.chapter_title - a.chapter_title});
              fetchListLoading.close();
              this.realNewVisable = val;
            }
            if(res.code === 501){
              fetchListLoading.close();
              Notify({ type: 'danger', message: `查询失败，无法访问指定漫画主页面` });
              this.$emit("closeNewDir");
            }
          }).catch((error) => {
            fetchListLoading.close();
            if(this.$route.fullPath !== "/") {
              this.$router.replace("/");
            }
            this.$message.error('章节加载出现未知问题，请联系管理员！ Code:' + error.message);
          });
        }
      }
    },
  }

}
</script>

<style scoped>

</style>