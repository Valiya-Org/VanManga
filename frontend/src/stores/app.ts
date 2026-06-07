import { defineStore } from 'pinia';
import { ref } from 'vue';

const PHONE_BREAKPOINT = 993;

export const useAppStore = defineStore('app', () => {
  const isPhone = ref(
    typeof document !== 'undefined' &&
      document.documentElement.clientWidth < PHONE_BREAKPOINT,
  );
  const isLogin = ref(false);

  function setIsPhone(value: boolean): void {
    isPhone.value = value;
  }

  function setIsLogin(value: boolean): void {
    isLogin.value = value;
  }

  return { isPhone, isLogin, setIsPhone, setIsLogin };
});
