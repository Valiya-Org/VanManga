<template>
  <div class="button-container" id = "button-container">
    <button @click = "handleClick" id = "upload" :class = "vStyle">
      <i v-if="isIcon" :class="iconClass"></i>
      {{nameForButton}}
      <div v-show="beGreen" class="bottomSide"></div>
      <div v-show="!beGreen" class="bottomSide working"></div>
    </button>
  </div>
</template>

<script>
export default {
  name: "V-botton",
  props:["nameForButton","clickMethod","isWorking", "isIcon","iconClass","vStyle"],
  data(){
    return{
      beGreen:true,

    }
  },
  methods:{
    handleClick(){
      return this.clickMethod();
    }
  },
  watch: {
    isWorking: {
      handler(val) {
        this.beGreen = val;
      },
    },
  },


}
</script>

<style scoped>

.button-container {
  text-align: center;
  position: relative;
  width: 160px;
  margin: 0 auto;
  cursor: pointer;
  transition: all 0.4s ease;
}

#upload{
  font-family: "AaGothic (Non-Commercial Use)",Helvetica, sans-serif;
  color: #fff;
  background: linear-gradient(to right, #E040FB, #00BCD4);
  position: relative;
  height: 30px;
  width: 100px;
  border: 0;
  border-radius: 5px;
  font-size: 1.1em;
  letter-spacing: 0.2em;
  overflow: hidden;
  box-shadow: 0 4px 12px 0 rgb(20, 25, 38);
  z-index: 1;
  cursor: pointer;
}

#upload.rounded{
  border-radius: 30px;
}

.button-container::before{
  content: '';
  position: absolute;
  top: 0;
  left: 25px;
  width: 110px;
  height: 30px;
  background: linear-gradient(to right, #E040FB, #00BCD4);
  background-size: 400%;
  opacity: 0;
  z-index: -1;
  border-radius: 45px;
  transition: 0.6s;

}
.button-container:hover::before{
  filter: blur(15px);
  opacity: 1;
  animation: move 6s linear alternate infinite;
}
@keyframes move{
  0%{
    background-position: 0%;
  }
  100%{
    background-position: 100%;
  }
}

.bottomSide{
  position: absolute;
  background-image: linear-gradient(to right, #E040FB, #00BCD4);
  height: 70px;
  width: 420px;
  border-radius: 5px;
  margin: -40px 0 0 -140px;
  z-index: -2;
  transition: all 0.4s ease;
}

.bottomSide.working{
  background: linear-gradient(-30deg, #D6FF7F,  #30BE96,  #13E2DA, #00B3CC);
  background-size: 700% 700%;
  animation: gradient 15s ease infinite;
}

.button-container:hover{
  transform: scale(1.2);
}

.button-container:hover .bottomSide {
  -webkit-transform: translateX(100px);
  -moz-transform: translateX(100px);
  transform: translateX(100px);
}
</style>