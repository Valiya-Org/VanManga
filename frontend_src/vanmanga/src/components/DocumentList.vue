<template>

<div id ="ccc">
<ul class = "document">
  <li v-for="item in searchList" v-bind:key = "item.manga_id">
  <keep-alive>
    <Document :item = "item" @reload = "reload"></Document>
  </keep-alive>
  </li>
</ul>
  <div class = "nothing" v-if="isNoContent">
    <p>搜索无结果！<br/>Nothing Here!</p>
  </div>
</div>
</template>

<script>
import Document from '@/components/Document.vue'

export default {
  name: "DocumentList",
  props:["searchList"],
  data(){
    return{
      isNoContent:false,
    }
  },
  components:{

    Document,

  },
  methods:{
    reload(){
      this.$emit("reload");
    },
  },

}
</script>

<style scoped>
*{
  margin:0px;
  padding:0px;
}
.nothing{
  width: 100%;
  height: calc(100vh - 300px);
  display: flex;
  justify-content: center;
  align-items: center;
}
.nothing > p{
  font-family: "AaGothic (Non-Commercial Use)";
  text-align: center;
  color: white;
}
.document{
  width: 100%;
  max-height: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  grid-auto-rows: 435px;

  /*grid-template-columns: 100%;
  grid-auto-rows: 50px;*/
  grid-gap: 5px 5px;
}

li{

width: 100%;
height: 100%;
list-style: none;

}

.mainDev-enter-active, .mainDev-leave-active {
transition: all 0.3s;
}
.mainDev-enter, .mainDev-leave-to
/* .list-leave-active for below version 2.1.8 */ {
  opacity: 0;
  transform: translateY(30px);
}

#ccc{

  box-sizing: border-box;
  width: 100%;
  padding-bottom: 100px;
}

</style>


