<template>
  <div class="tooltip"
       @mouseenter="makeAlive(true)"
       @mouseleave="makeAlive(false)"
       v-html="tooltip"
  >
  </div>
</template>

<script>
import {mapMutations} from "vuex"

export default {
  props: {
    tooltip: {
      type: String,
      required: true
    },
  },
  data: () => ({
    keepAlive: false,
    timeOut: null
  }),
  methods: {
    ...mapMutations([
      'SET_CLARIFICATION'
    ]),
    makeAlive(vector) {
      if(this.timeOut) {
        clearTimeout(this.timeOut)
        this.timeOut = null
      }
      this.keepAlive = vector
      
      if(!vector) {
        this.SET_CLARIFICATION('')   //устранение tooltip
      }
    }
  },
  mounted() {
    this.timeOut = setTimeout(() => {        //самоустранение tooltip
      this.SET_CLARIFICATION('')
    }, 2700)
  }
}
</script>

<style lang="scss" scoped>
.tooltip {
  position: absolute;
  left: 10%;
  top: 10%;
  
  width: 50%;
  max-width: rem(600);
  min-height: rem(400);
  height: fit-content;

  box-sizing: border-box;
  padding: rem(30);
  background-color: $white-opasity;
  border: $grey-opasity 1px solid;

  display: flex;
  align-items: center;
  justify-content: center;
  
  color: $valid;
  cursor: pointer;
  text-align: center;
  transition: all 1s ease;
}
</style>