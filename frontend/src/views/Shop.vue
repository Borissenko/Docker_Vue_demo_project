<template>
  <div class="wrapper" :class="{'show-products': runCascadeAppearance}" :key="`${$route.params.shelf}`">
    <div v-for="(product, ind) in GET_PRODUCTS($route.params.shelf)"
         :key="ind"
         @click.exact="onGoToProductDescription(product._id)"
         class="cart"
    >
      <product-cart :product="product"/>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue';
import ProductCart from "@/components/productCart.vue";
import {mapActions, mapGetters} from "vuex";

export default Vue.extend({
  components: {
    ProductCart
  },
  data: () => ({
    runCascadeAppearance: false
  }),
  computed: {
    ...mapGetters([
      'GET_PRODUCTS'
    ])
  },
  methods: {
    ...mapActions([
      'FETCH_PRODUCTS'
    ]),
    onGoToProductDescription(_id: any) {
      this.$router.push(`/${this.$route.params.shelf}/${_id}`)
    },
  },
  created() {
    this.FETCH_PRODUCTS(this.$route.params.shelf)
  },
  mounted() {
    setTimeout(() => this.runCascadeAppearance = true, 70)
  }
});
</script>

<style lang="scss">
.wrapper {
  @extend .wrapper_common;
  
  width: 100%;
  display: flex;
  margin-top: rem(-10);
  flex-flow: wrap row;
  justify-content: space-between;
  
  @media (max-width: 760px) {
    justify-content: space-around;
  }
  
  .cart {
    width: rem(260);
    height: rem(400);
    margin: rem(10) rem(1) 0 rem(1);
    cursor: pointer;
    
    opacity: 0;
    transform: translateY(-30px);
  }
}

//for cascading appearance
@mixin tr-reset() {
  opacity: 1;
  transform: translate(0, 0);
}

@function trns($how, $properties...) {
  $result: '';
  @each $property in $properties {
    $result: $result + $property + ' ' + $how + ', ';
  }
  @return #{$result};
}

.show-products {
  @for $i from 1 through 8 {
    .cart:nth-child(#{$i}) {
      @include tr-reset();
      transition: trns($appear, opacity, transform);
      transition-delay: ($base-delay + $i * $base-delay);
    }
  }

  .cart:nth-child(n+9) {
    @include tr-reset();
    transition: trns($appear, opacity, transform);
    transition-delay: ($base-delay + 9 * $base-delay);
  }
}
</style>




