

<script>

export default {
  name: "documentBaseLogic",

  methods:{

    async submitSelection(item, costomLoading, submit_sign, passNotification, alreadyExistNotification, additionalDuplicateHandler) {
      await this.$http.post("dogemanga/confirm", {
        manga_object: item,
        submit_sign: submit_sign,
      }).then((data) => {
        let res = data.data;
        costomLoading.close();
        if (res.code === 200) {
          if (passNotification) {
            this.$store.state.isPhone ? passNotification(item) : passNotification();
          }
          this.$emit("reload");
        } else if (res.code === 410) {
          if (alreadyExistNotification) {
            this.$store.state.isPhone ? alreadyExistNotification(item) : alreadyExistNotification();
          }
        } else if (submit_sign === "0" && res.code === 411) {
          this.$store.state.isPhone ? additionalDuplicateHandler(item, res) : additionalDuplicateHandler(res);
        }
      }).catch((error) => {
        throw error
      })
    },

    generateInitailInfo(item){
      return `<p>漫画ID为 ： <strong>${item.manga_id}</strong></p>` +
      `<p>漫画作者为 ： <strong>${item.artist_name}</strong></p>` +
      `<p>该漫画最新话名为 ： <strong>${item.newest_epi}</strong></p>` +
      `<p>请检查上方信息是否正确，最好在漫画狗网站内核实一下</p>`+
      `<p><strong>请勿添加已有的漫画！</strong></p>`
    },

    generateAdditionalDuplicateInfo(item, previousRes){
      return `<p>你选择的漫画名为 ： <strong>${item.manga_name}</strong></p>` +
      `<p>库中可能重复的漫画 ：</p>` +
      `<strong>${previousRes.data}</strong>` +
      `<p>请再次核实并确认是否添加该漫画</p>`+
      `<p><strong>请勿添加库中已有的漫画！</strong></p>`
    },

    reload() {
      this.$emit("reload");
    },
  }
}
</script>

<style scoped>

</style>