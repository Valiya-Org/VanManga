<template>
  <div class="announceStage" @mouseover = "showText" @mouseout = "hideText" @click = "handleClick">
    <svg class="icon bi" width="30" height="30" :fill="color" id = "announceIcon">
      <use :xlink:href="require('/node_modules/bootstrap-icons/bootstrap-icons.svg')+'#exclamation-circle'"></use>
    </svg>
    <transition name = "announceShow">
      <p v-show="isHover" id = 'announceContent'>公告</p>
    </transition>
    <el-dialog
        title="Valiya-Manga 夜镇漫画 V1.0.1 公告"
        :visible.sync="isClicked"
        :append-to-body = true
        top = "5vh"
        width="55%"
        center>
      <hr>
      <div class = "text">
        <span>感谢你使用Valiya-Manga漫画系统</span><br><br>
        <span>本系统仅为漫画添加系统，对应源为漫画狗</span><br><br>
        <span>考虑到安全性等诸多方面的缘故，漫画抓取速度设置同时只能下载一部且每本2话并发下载，并设有一定的速度上限以防止被cloudflare发现</span><br><br>
        <span>如果登记多部，会排队下载。</span><br><br>
        <span>搜索结果对应在漫画狗中搜索结果的前10条，如果需要确认搜索结果是否为你想要的结果，你可以在漫画狗中核对。</span><br><br>
        <span>现有漫画中可以实时看到漫画的抓取情况，<em>当前库中最新话</em> 代表现在抓取完成的最新一话，<em>初次抓取？</em> 代表第一次抓取是否完成</span><br><br><br><br>
        <span>注意！由于并发下载的问题 <em>当前库中最新话</em> 不代表最新话前的所有话都已下载完成，只是记录了下载的所有话中最新的一话。</span><br><br><br><br>
        <span>所有在漫画库的漫画会自动在每天扫描更新一次</span><br><br><br><br>
        <span>未来或许会提供更多源的选择，目前对抓取友善的汉化源仅有漫画狗，可能存在缺页。</span><br><br><br><br>
        <span>V1.0.1版本新增功能：</span><br><br>
        <span>1. 新增重新抓取功能，现在的漫画可以单独重新抓取其中的部分章节</span><br>
        <span>2. 修复漫画索引功能，现在可以通过搜索栏查询漫画</span><br>
        <span>3. 漫画库动态显示，新增的漫画或有新抓取的漫画，现在会显示在漫画库前列</span><br>
        <span>4. 优化章节命名，减少章节在漫画分类中可能会出现的错误</span><br><br><br><br>
        

        <span>本系统的开发人员只有两位（Van/Alen Qi）,且完全从零开始的开发,我们已经尽量保证版本的稳定，但如果遇见任何bug，请立刻联系我</span><br><br>
        <span>但也请你不要破坏性的使用本系统，做出一些正常人不会做的操作</span><br><br><br><br>
        <span>最后，再次感谢你使用Valiya-Manga漫画系统</span><br><br>
        <span style="float: right"><em>--Tom "Van" Wang & Kun "Alen" Qi</em></span>

      </div>

      <span slot="footer" class="dialog-footer">
    <el-button type="primary" @click="isClicked = false">确 定</el-button>
  </span>
    </el-dialog>
  </div>
</template>

<script>
export default {
  // eslint-disable-next-line vue/multi-word-component-names
  name: "Announcement",
  data(){
    return{
      color: "#ded12f",
      isHover:false,
      isClicked:false
    }
  },
  methods:{
    showText(){
      this.isHover = true;
    },
    hideText(){
      this.isHover = false;
    },
    handleClick(){
      this.isClicked = true;
    }
  },
  watch:{
    'isHover':{
      handler(val){
        if(val){
          const body = document.querySelector("body");
          body.style.overflow = "hidden";
        }else{
          const body = document.querySelector("body");
          body.style.overflow = "hidden";
        }
      }
    }
  }

}
</script>

<style scoped>
.announceStage{
  width: 35px;
  height: max-content;
  text-align: center;
  overflow: visible;
}

#announceContent{
  color: white;
  margin: 0;
  transition: all 0.2s ease-in-out;
  overflow: hidden;
}

#announceContentHover {
  overflow: hidden;
  height: 0;
  color: white;
  margin: 0;
  transition: all 0.2s ease-in-out;
}
#announceIcon{
  transition: all 0.2s ease-in-out;
}

.announceStage:hover > #announceIcon{
  transform: scale(1.2);
  filter: drop-shadow(0px 0px 20px #f6bc06);
}

.text{
  font-size: 1.15em;
  color: black;
}

.announceShow-enter-active,.announceShow-leave-active{
  transition: all .1s ease-in-out;
}
.announceShow-enter,.announceShow-leave-to{
  transform: translateY(30px);
  opacity: 0;

}
</style>