<template>
  <div class = "stage">
    <div class = "documentBlock" @click = "handleClick">
      <img draggable="false" :id = "'s'+item.manga_id" :src="imgSrc" style="width: 240px; height: 320px; object-fit: contain" >
      <p class = "showName">{{ item.manga_name }}</p>
      <p class = "showName">{{ item.artist_name }}</p>
      <p class = "showName">最新话名 ：{{ item.newest_epi }}</p>
    </div>
  </div>

</template>

<script>


import documentBaseLogic from "@/assets/methods/documentBaseLogic";

export default {
  // eslint-disable-next-line vue/multi-word-component-names
  name: "Document",
  props:["item"],
  mixins:[documentBaseLogic],
  data() {
    return {
      imgSrc:"",

    }
  },
  created() {
    this.imgSrc = 'data:image/png;base64,' + this.item.thumbnail;
  },
  mounted() {

  },

  methods: {

    handleClick(){
      let submitLoading;
      const info = this.generateInitailInfo(this.item);
      this.$confirm(info, `你选择的是 ${this.item.manga_name}`, {
        dangerouslyUseHTMLString: true,
        confirmButtonText: '确定',
        cancelButtonText: '取消',
      }).then(async () => {
            submitLoading = this.$loading({
              lock: true,
              text: '正在提交下载请求，等待响应...',
              spinner: 'el-icon-loading',
              background: 'rgba(0, 0, 0, 0.7)'
            });
            await this.submitSelection(
                this.item,
                submitLoading,
                "0",
                this.desktopPassNotification,
                this.desktopAlreadyExistNotification,
                this.desktopAdditionalDuplicateHandler,
            );
          }
      ).catch((error) => {
        if(error !== "cancel"){
          if(submitLoading){
            submitLoading.close();
          }
          this.isSearch = false;
          if(this.$route.fullPath !== "/") {
            this.$router.replace("/");
          }
          this.$message.error('漫画搜索出现未知问题，请联系管理员！ Code:' + error.message);
        }
      });

    },

    desktopAdditionalDuplicateHandler(previousRes){
      const info = this.generateAdditionalDuplicateInfo(this.item, previousRes)
      this.$confirm(info, `我们检查了已有漫画，发现有可能的重复！`, {
        dangerouslyUseHTMLString: true,
        confirmButtonText: '仍要添加',
        cancelButtonText: '遗憾离场',
      }).then(async () => {
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

    desktopPassNotification(){
      this.$notify({
        title: `${this.item.manga_name} 已入库`,
        message: `成功选择 ${this.item.manga_name}。 ID为 ${this.item.manga_id}。已开始在后台下载！`,
        type: 'success',
        position: 'bottom-right'
      })
    },

    desktopAlreadyExistNotification(){
      this.$notify({
        title: `${this.item.manga_name} 已存在在库中`,
        message: `请仔细检查后再添加！`,
        type: 'error',
        position: 'bottom-right'
      })
    },


    changeHeight(event){
      let c = event.target;
      let doc = c.parentNode;

      if(c.clientHeight !== 435){
        c.style.gridTemplateRows = "1fr 1fr 1fr 1fr";
        doc.style.transition = "all 0s";
      }
      doc.style.height = c.clientHeight + "px";



    },
    recover(event){
      let c = event.target;
      let doc = c.parentNode;
      doc.style.height = "100%";

      c.style.gridTemplateRows = "1fr 1fr";
      doc.style.transition = "all 0.3s ease-in-out";

    },


  },

}
</script>

<style scoped>
@property --rotate {
  syntax: "<angle>";
  initial-value: 132deg;
  inherits: false;
}

@keyframes light {
  0% {filter: hue-rotate(0deg);}
  50% {filter: hue-rotate(90deg);}
  100% {filter: hue-rotate(0deg);}
}

.documentBlock{
  position: absolute;
  padding: 0;
  margin: 0;
  width: 100%;
  height: 100%;
  border-radius: 6px;
  background-color: #252830;
  display: flex;
  flex-direction: column;
  justify-items:center;
  align-items:center;
  transition: all 0.3s ease-in-out;
}
.stage{
  position: relative;
  padding: 3px;
  box-sizing: border-box;
  margin: 0;
  width: 100%;
  height: 100%;
  border-radius: 6px;
  background-color: #252830;
  cursor: pointer;
  transition: all 0.3s ease-in-out;
  display: flex;
  justify-content:center;
  align-items: center;
}
.stage:hover{
  z-index: 99999;
  transform: scale(1.05);
}
.stage::before {
  content: "";
  width: 103%;
  height: 102%;
  z-index: -1;
  position: absolute;

  border-radius: 8px;
  background-image: linear-gradient(
      var(--rotate)
      , #5ddcff, #3c67e3 43%, #4e00c2);
  top: -1%;
  left: -1.5%;

  animation: none;
  opacity: 0;
  transition: opacity 0.3s;
}
.stage::after {
  top: 0;
  left: 0;
  right: 0;
  margin: 0 auto;
  transform: scale(0.9);
  filter: blur(calc(435px / 6));
  background-image: linear-gradient(
      var(--rotate)
      , #5ddcff, #3c67e3 43%, #4e00c2);

  z-index: -1;
  height: 100%;
  width: 100%;
  position: absolute;
  content: "";
  animation: none;
  opacity: 0;
  transition: opacity 0.3s;
}

.stage:hover:before {
  animation: spin 2.5s linear infinite;
  opacity: 1;
}
.stage:hover:after {
  animation: spin 2.5s linear infinite;
  opacity: 1;
}
@keyframes spin {
  0% {
    --rotate: 0deg;
  }
  100% {
    --rotate: 360deg;
  }
}
.stage:hover .documentBlock{
  height: auto;
  min-height: 435px;
  max-height: fit-content;
}
.showName{
  color: white;
  margin: 2px;
  width: 80%;
  text-align: center;
  font-size:0.95em;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-line-clamp: 3;
  word-break: break-word;
  transition: all 0.3s ease-in-out;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  font-family: "Helvetica Neue", Helvetica, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", Arial, sans-serif;
}
.stage:hover #showName{
  overflow: visible;
  text-overflow: unset;
  display: block;
}


</style>

