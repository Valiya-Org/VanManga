

<script>

export default {
  name: "checkAndPOP",

  methods:{


errorDealing(event,inputID,errorMsgID){
  if(document.getElementById(errorMsgID)){
    let errMsg = document.getElementById(errorMsgID);
    this.shakingAnime(errMsg);
  }
  let v = document.getElementById(inputID);
  v.style.backgroundColor = "#fbc4c4";
},

recover(event,inputID){
  let v = document.getElementById(inputID);
  v.style.backgroundColor = "transparent";
} ,

shakingAnime(target) {
  target.animate([{transform: 'translateX(0)'}, {transform: 'translateX(-3%)'}, {transform: 'translateX(0%)'}, {transform: 'translateX(3%)'},
        {transform: 'translateX(0%)'}, {transform: 'translateX(-3%)'}, {transform: 'translateX(0%)'}, {transform: 'translateX(3%)'},
        {transform: 'translateX(0%)'}, {transform: 'translateX(-3%)'}, {transform: 'translateX(0%)'}, {transform: 'translateX(3%)'},
        {transform: 'translateX(0%)'}, {transform: 'translateX(-3%)'}, {transform: 'translateX(0%)'}, {transform: 'translateX(3%)'},
        {transform: 'translateX(0%)'}, {transform: 'translateX(-3%)'}, {transform: 'translateX(0%)'}, {transform: 'translateX(3%)'},
        {transform: 'translateX(0%)'}],
      {
        duration: 300
      }
  )
}
  }
}
</script>

<style scoped>

</style>