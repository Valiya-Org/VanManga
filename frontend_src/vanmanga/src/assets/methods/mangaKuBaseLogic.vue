

<script>

export default {
  name: "mangaKuBaseLogic",

  methods:{
    async generalDeleteManga(manga_name,manga_id,costomLoading,pwd,passNotification,errorNotification) {
      await this.$http.delete("dogemanga/deletemanga", {
        data: { manga_id: manga_id, pwd: pwd}
      }).then((data) => {
        let res = data.data;
        costomLoading.close();
        if (res.code === 200) {
          if (passNotification) {
            passNotification(manga_name);
          }
          this.$emit("reload");
        }
        else if (res.code === 401) {
          this.$notify({
            title: `暗码错误`,
            message: `暗码错误，无法认证管理员身份，无法进行该危险操作！`,
            type: 'error',
            position: 'bottom-right'
          });
          this.$emit("reload");
        }
        else if (res.code === 500) {
          if (errorNotification) {
            errorNotification(manga_name);
          }
        }
        // TODO：没有对edge case的handle
      }).catch((error) => {
        throw error
      })
    },

    async generalDownloadSwitch(manga_name,manga_id,costomLoading,passNotification,notFoundNotification) {
      await this.$http.post("dogemanga/downloadswitch", {
        manga_id: manga_id,
      }).then((data) => {
        let res = data.data;
        costomLoading.close();
        if (res.code === 200) {
          if (passNotification) {
            passNotification(manga_name, res.data.currentDownloadStatus);
          }
          this.$emit("reload");
        } else if (res.code === 424) {
          if (notFoundNotification) {
            notFoundNotification(manga_name);
          }
        }
      }).catch((error) => {
        throw error
      })
    },

    generateDeleteInitialInfo(item){
      return `<p>漫画ID为 ： <strong>${item.manga_id}</strong></p>` +
      `<p>漫画名为 ： <strong>${item.manga_name}</strong></p>` +
      `<p>该漫画最新话名为 ： <strong>${item.last_epi_name}</strong></p>` +
      `<p>该操作会从漫画库中完全移除该漫画及其信息</p>`+
      `<p><strong>注意！该操作不可卷回！</strong></p>`
    },

    generateDownloadSwitchInitialInfo(item){
      let info = `<p>漫画ID为 ： <strong>${item.manga_id}</strong></p>` +
          `<p>漫画名为 ： <strong>${item.manga_name}</strong></p>` +
          `<p>该漫画的完结状态 ： <strong>${item.serialization === 0 ? '未完结' : '已完结' }</strong></p>`;
      const warnInfo = `<p><strong style="color: red">侦测到该漫画并未完结！建议保持更新开启！</strong></p>`;
      const checkInfo = item.download_switch === 0 ? `<p>是否想要手动<strong style="color: orangered">关闭</strong>该漫画的自动更新检查？</p>` : `<p>是否想要手动<strong style="color: green">开启</strong>该漫画的自动更新检查？</p>`;

      return item.serialization === 0 ? info + warnInfo + checkInfo : info + checkInfo;
    }
  }
}
</script>

<style scoped>

</style>