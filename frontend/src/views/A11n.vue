<template>
  <div class="cover">
    <h2>Entrance in to your privat space</h2>
    <div class="forms">
      <h2 v-if="isRegistrationInterface" class="forms__registration">Enter your registration data</h2>

      <div v-for="(field, key, ind) in forms" :key="ind" class="forms__field">
        <h2 v-if="(field.name !== 'password confirm') || isRegistrationInterface"
            :class="{
              'error': $v.forms[key].value.$error,
              'valid': !$v.forms[key].value.$invalid && forms[key].value
            }"
        >
          {{ field.name }}
        </h2>
        <input :type="field.inputType"
               v-model="field.value"
               :placeholder="field.placeholder"
               v-mask="field.mask ? field.mask : ''"
               @blur="$v.forms[key].value.$touch()"
               v-if="(field.name !== 'password confirm') || isRegistrationInterface"
        >
      </div>

      <div v-if="!isRegistrationInterface"
           @click="onAuthentication"
           class="forms__btn_login"
      >
        Take it
      </div>

      <div v-if="!isRegistrationInterface" class="forms__signature">
        If you are't resident take a
        <span @click="onSwitchToTheRegistrationInterface">
          registration
        </span>
        !
      </div>
      <div v-else
           @click="onAuthentication"
           class="forms__signature"
           :class="{forms__signature_link: !$v.$invalid && forms.login.value && forms.passwordConfirm.value}"
      >
        You are welcome!
      </div>
    </div>
  </div>
</template>

<script>
import Vue from "vue"
// @ts-ignore
import AwesomeMask from 'awesome-mask'
import {LoginForms} from "@/types/auth"
import {minLength, required, sameAs} from 'vuelidate/lib/validators'
import {isPhone, isPassword, isUnique} from '@/utils/validation.ts'
import {mapActions} from "vuex";

export default Vue.extend({
  data: () => ({
    forms: {
      login: {
        name: 'login',
        value: '',
        placeholder: '(906) 075-19-75',
        mask: '(999) 999-99-99',
        inputType: 'text'
      },
      password: {
        name: 'password',
        value: '',
        placeholder: 'at least 5 signs',
        inputType: 'password'
      },
      passwordConfirm: {
        name: 'password confirm',
        value: '',
        placeholder: 'it must be the same as the password',
        inputType: 'password'
      }
    },
    isRegistrationInterface: false,
  }),
  validations() {
    return {
      forms: {
        login: {
          value: {
            required,
            isPhone,
            isUnique: isUnique(this.isRegistrationInterface) //аргумент(величина login.value) поступает для замкнутой функции неявно, напрямую.
          }
        },
        password: {
          value: {required, minLength: minLength(5), isPassword}
        },
        passwordConfirm: {
          value: {
            // @ts-ignore
            sameAs: sameAs(function () {
              // @ts-ignore
              return this.forms.password.value
            })
          }
        }
      }
    }
  },
  methods: {
    ...mapActions([
      'TOUCH_ACCOUNT'
    ]),
    async onAuthentication() {   //for logIn & create_account concurrently
      //при Login устраняем влияние незадействованного поля passwordConfirm, иначе this.$v.forms.$anyError будет давать false.
      if (!this.isRegistrationInterface)
        this.forms.passwordConfirm.value = this.forms.password.value

      // @ts-ignore
      this.$v.$touch()
      // @ts-ignore
      if (this.$v.forms.$dirty && !this.$v.forms.$anyError) {
        await this.TOUCH_ACCOUNT({login: this.forms.login.value, password: this.forms.password.value})
            .then(isSuccess => {
              this.forms.password.value = ''           //предупреждаем утечку sensitive_data.
              this.forms.passwordConfirm.value = ''

              if (isSuccess)
                this.$router.push('/person')         //when isSuccess is false we would go to another url or stay on a same place.
            })
      }
    },
    onSwitchToTheRegistrationInterface() {
      //обнуляем результаты предыдущей возможной попытки валидации (если были попытки заполнить форму на первом этапе login'a)
      for (let formValue of Object.values(this.forms)) {
        formValue.value = ''
      }
      // @ts-ignore
      this.$v.$reset()
      //включаем интерфейс регистрации
      this.isRegistrationInterface = true
    }
  },
  directives: {
    'mask': AwesomeMask
  }
})
</script>

<style scoped lang="scss">
.error {
  color: $error;
}

.valid {
  color: $valid;
}

.cover {
  @extend .wrapper_common;

  .forms {
    display: block;
    width: 100%;

    > h2 {
      width: 50%;
      margin-right: auto;
      text-align: right;
      text-decoration: underline;
    }

    &__field {
      width: 100%;
      height: fit-content;
      display: flex;
      flex-flow: row wrap;
      align-items: center;
      justify-content: flex-start;
      margin: rem(20) auto 0;

      & h2 {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        width: 50%;
        box-sizing: border-box;
        padding-right: rem(20);

        background: $grey-light;

        @media (max-width: 800px) {
          width: rem(300);
        }
      }

      input {
        width: rem(300);
        height: rem(40);
        box-sizing: border-box;
        padding-left: rem(7);
        border: none;
        border-bottom: $grey-middle 1px solid;
      }
    }

    &__btn_login {
      width: 100%;
      margin: rem(30) auto 0 50%;
      @extend .btn_common;
    }

    &__signature {
      width: 50%;
      margin-left: auto;
      margin-top: rem(40);
      text-align: left;
      color: $grey;

      &_link, span {
        color: $valid;
        text-decoration: underline;

        &:hover {
          color: $green;
          cursor: pointer;
        }
      }
    }
  }


}

</style>
