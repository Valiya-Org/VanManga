<template>
<div id = "pullButton" :class = " !isHide? '' : 'hide'" @click = "changeHide">
  <div id = "pullButtonBackground">
    <i class = "bi-arrow-bar-left"></i>
  </div>
</div>
</template>

<script>
export default {
  name: "V-pullButton",
  props:["isHide"],
  data(){
    return{
    }
  },
  methods:{
    changeHide(){
      this.$emit("switchCollapse")
    }
  }
}
</script>

<style scoped>
@property --rotate {
  syntax: "<angle>";
  initial-value: 132deg;
  inherits: false;
}
#pullButton{
  width: 95px;
  height: 33px;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 7px;
  background: linear-gradient(to right, #E040FB, #00BCD4);
  transition: all 0.3s ease-in-out;
}
#pullButton.hide i{
  transform: rotate(180deg);
}
#pullButton:hover{
  transform: translateX(15px);
}
#pullButtonBackground>i{
  padding: 4px;
  font-size: 1.5em;
  color: white;
  transition: all 0.3s ease-in-out;
}
#pullButton::before {
  content: "";
  width: 106%;
  height: 104%;
  z-index: -1;
  position: absolute;
  border-radius: 8px;
  background-image: linear-gradient(
      var(--rotate)
      , #984ce8, #00BCD4 43%, #4e00c2);

  top: -2%;
  left: -3%;
  animation: none;
  opacity: 1;
}
#pullButton:hover:before{
  animation: spin 2.5s linear infinite;
}
#pullButton::after {
  z-index: -1;
  height: 100%;
  width: 100%;
  position: absolute;
  content: "";
  animation: none;
  opacity: 0;
  transition: opacity 0.3s;
  top: 0;
  left: 0;
  right: 0;
  margin: 0 auto;
  transform: scale(0.9);
  filter: blur(calc(175px / 6));
  background-image: linear-gradient(
      var(--rotate)
      , #5ddcff, #3c67e3 43%, #4e00c2);
}


#pullButton:hover:after {
  transition: opacity 0.3s;
  animation: spin 2.5s linear infinite;
  opacity: 1;
}

#pullButtonBackground{
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  align-items: center;
  border-radius: 7px;
  z-index: 2;
  background: #444857;
}

@keyframes spin {
  0% {
    --rotate: 0deg;
  }
  100% {
    --rotate: 360deg;
  }
}
</style>