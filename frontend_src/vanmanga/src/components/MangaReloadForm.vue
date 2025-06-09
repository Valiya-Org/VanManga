<template>
  <el-dialog
      :title="`请选择 《${manga_name}》 中需要重新下载的章节`"
      :visible.sync="newVisibleShell"
      v-if="newVisibleShell"
      @close = "close"
      :append-to-body = "true"
      width="75%"
      :center = "true"
      top = "7vh"
      custom-class="mainDialog"
      id = "mainDialog"
  >

    <el-table
        id = "chapterTable"
        ref="chapterTable"
        v-loading="loading"
        element-loading-text="正在查询中，请稍后..."
        element-loading-spinner="el-icon-loading"
        element-loading-background="rgba(0, 0, 0, 0.8)"
        :data="chapterData.filter(data => !search || data.chapter_title.toLowerCase().includes(search.toLowerCase()))"
        class = "chapterTable"
        height="70vh"
        :stripe = "true"
        :row-style="{background:'transparent',color:'white'}"
        @select-all="handleSelectAll"
        @select = "handleSelect"
        empty-text = "该漫画无任何章节，需要联系管理员以寻求帮助"
    >
      <el-table-column
          type="selection"
          width="55">
      </el-table-column>
      <el-table-column
          label="章节名称"
          prop= "chapter_title"
          width="200">
      </el-table-column>
      <el-table-column
          align="right">
        <!-- eslint-disable-->
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
    <span slot="footer" class="dialog-footer">
    <el-button type="primary" @click="toggleClearSelection">清除选择</el-button>
    <el-button type="primary" @click="openConfirm">确认重新下载</el-button>
       </span>

  </el-dialog>
</template>

<script>


import mangaReloadFormBaseLogic from "@/assets/methods/mangaReloadFormBaseLogic";

export default {
  name: "MangaReloadForm",
  props:["newVisible","manga_name","manga_id"],
  mixins:[mangaReloadFormBaseLogic],
  data(){
    return{
      search:"",
      loading: true,
      newVisibleShell : false,
      chapterData :[],
      allMultipleSelection: [],
      currentCheck: null,
      currentData : null,
    }
  },
  methods:{
    toggleClearSelection() {
      this.allMultipleSelection = [];
      this.$refs.chapterTable.clearSelection();
    },
    handleSelectAll(val){
      //全选时候的逻辑 注意不能直接复制array的引用
      if(val.length === 0){
        this.allMultipleSelection = [];
      }
      else{
        this.allMultipleSelection = [...this.chapterData];
      }
    },
    handleSelect(val,row){
      this.currentCheck = row;
      this.checkSelection();

    },
    checkSelection(){
        //选择时候的逻辑 保证table的selection变量与组件的变量脱离
        let flag = true;
        this.allMultipleSelection.forEach(el => {
          if(this.currentCheck.chapter_link === el.chapter_link){
            this.allMultipleSelection.splice(this.allMultipleSelection.indexOf(this.currentCheck), 1);

            flag = false;
          }
        })

        if(flag){
          this.allMultipleSelection.push(this.currentCheck);

        }

    },

    openConfirm(){
      const h = this.$createElement;
      let nameList = this.allMultipleSelection.map(el => el.chapter_title).sort((a,b) => {return a.chapter_title - b.chapter_title});
      let tempElementHolder = [];
      for(let el of nameList){
        tempElementHolder.push(h('div', null, el));
      }
      const msgBoxPromise = () => {
        return this.$msgbox({
          title: '你确定吗？',
          message: h('div', { class : "confirmPage"}, [
            h('div', null, '需要重新下载的章节有'),
            h('div', {style : "width: 100%; display: flex; flex-direction: column; align-items: center; max-height : 70vh; overflow : auto", id : "confirmList"}, [...tempElementHolder]),
            h('div', null, [
              h('strong', null, "请仔细确认！任务会被安排进入下载队列且无法退回"),
            ])
          ]),
          showCancelButton: true,
          confirmButtonText: '确定',
          cancelButtonText: '取消',
        })
      }

      const errorNotification = ()=>{
        this.$notify({
          title: `无有效选中章节`,
          message: `你未选中任何章节，无法提交重新下载请求`,
          type: 'error',
          position: 'bottom-right'
        });
      };
      this.generalOpenConfirm(msgBoxPromise, errorNotification);
    },

    submitReload(){
      const submitNotification = () => {
        this.$notify({
          title: `${this.manga_name} 重新下载任务已提交！`,
          message: `${this.manga_name} 中所选章节开始重新下载`,
          type: 'success',
          position: 'bottom-right'
        });
      };

      this.generalSubmitReload(submitNotification);
    }

  },

  updated() {
    //每当data改变时，就更新currentData以触发回选监控
    //element ui会在data被改变（被搜索字符filter的时候）自动清除所有的选择，我们需要做的是回选我们已有的选择，所以记录必须和selection返回的val脱离
    //这里，我们只对data改变时自动清空selection这一单独change负责 复制其数据引用使得能被vue的watch捕获监控
    this.currentData = this.$refs.chapterTable.data;
  },

  watch:{
    "currentData" : {
      handler(){
          this.$refs.chapterTable.data.forEach(item => {
            this.allMultipleSelection.forEach(el =>{
              if(item.chapter_link === el.chapter_link){
                this.$refs.chapterTable.toggleRowSelection(item,true);
              }
            })
          })
      }
    },
    'newVisible':{
      handler(val){
        this.newVisibleShell = val;
        if(val){
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
                  this.loading = false;
                  // eslint-disable-next-line no-undef
                  OverlayScrollbars(document.querySelectorAll("#chapterTable .el-table__body-wrapper"), {
                    className: 'os-theme-thick-light',
                    scrollbars: { autoHide : "none",},
                  });
                }
                if(res.code === 501){
                  this.$notify({
                    title: `查询失败`,
                    message: `无法访问指定漫画主页面`,
                    type: 'error',
                    position: 'bottom-right'
                  });
                  this.$emit("closeNewDir");
                }
              }).catch((error) => {
                this.loading = false;
                if(this.$route.fullPath !== "/") {
                  this.$router.replace("/");
                }
                this.$message.error('章节加载出现未知问题，请联系管理员！ Code:' + error.message);
              });
        }
      }
    },
  },

}
</script>

<style scoped>
*{
  padding: 0;
  margin: 0;
}

.confirmPage{
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap : 1.5rem;
}
/deep/ .el-dialog.mainDialog{
  background-color: rgb(30, 31, 38);
  color: white !important;
}

/deep/ .el-dialog.mainDialog > .el-dialog__header{
  background-color: rgb(30, 31, 38);
  color: white !important;
}

/deep/ .el-dialog.mainDialog > .el-dialog__header > .el-dialog__title{
  background-color: rgb(30, 31, 38);
  color: white !important;
}

/deep/ .el-dialog.mainDialog > .el-dialog__body{
  background-color: rgb(30, 31, 38);
  color: white;
}
/deep/ .el-dialog.mainDialog > .el-dialog__footer{
  background-color: rgb(30, 31, 38);
  color: white;
}

.chapterTable{
  width: 100%;
  height: 100%;
  background: #252830;
}

/deep/ .el-input__inner {
  background-color: rgba(255, 255, 255, 0.247);
  color: white;
}


#mainDialog >>> .el-table th{
  background:#444857;
  color:white;
}

#mainDialog >>> .el-table tr{
  background:#444857;
  color:white;
}

#mainDialog >>> .el-table th.gutter{   /*解决el-table加了gutter后 边框出现白边*/
  background:#444857;
}

#mainDialog >>> .el-table--striped .el-table__body tr.el-table__row--striped td.el-table__cell{
  background-color: #34343f;
}

#mainDialog >>> .el-table--enable-row-hover .el-table__body tr:hover>td {
  background-color: #A85DC3;

}
#mainDialog >>> .el-table--enable-row-hover .el-table__body tr.el-table__row--striped:hover>td.el-table__cell {
  background-color: #A85DC3;

}
#mainDialog >>> .el-table__row>td,#uploadTable >>>  .el-table th.is-leaf{
  border: none;
}
</style>