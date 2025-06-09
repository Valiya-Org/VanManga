<script>
export default {
  name: "mangaReloadFormBaseLogic",
  methods:{
    close(){
      this.$emit("closeNewDir");
      if(this.isNeedReload){
        this.isNeedReload = false;
        this.$emit("reload");
      }
    },

    generalOpenConfirm(msgBoxPromise,errorNotification){
      if(this.allMultipleSelection.length > 0){
        msgBoxPromise().then(() => {
          this.submitReload();
        }).catch(()=>{})
      }
      else{
        errorNotification()
      }

    },

    generalSubmitReload(submitNotification){
      const submitLoading = this.$loading({
        lock: true,
        text: '正在提交重下载请求，等待响应...',
        spinner: 'el-icon-loading',
        background: 'rgba(0, 0, 0, 0.7)'
      });

      this.$http.post("dogemanga/redownload", {manga_id: this.manga_id, selected_array: JSON.stringify(this.allMultipleSelection)}).then((data) =>{
        let res = data.data;
        if(res.code === 200){
          submitNotification();
          submitLoading.close();
          this.$emit("closeNewDir");
          this.$emit("reload");
        }
      }).catch((error) => {
        submitLoading.close();
        if(this.$route.fullPath !== "/") {
          this.$router.replace("/");
        }
        this.$message.error('章节加载出现未知问题，请联系管理员！ Code:' + error.message);
      });
    }

  }
}
</script>

<style scoped>

</style>