import { onUnmounted } from 'vue';
import { useAppStore } from '@/stores/app';

const PHONE_BREAKPOINT = 993;

/**
 * 把视口宽度同步到 app store 的 isPhone。
 * 挂载即生效；返回 stop() 以手动停止（onUnmounted 也会自动停止）。
 * 在组件 setup 内调用时自动注册 onUnmounted；脱离组件调用时请手动 stop()。
 */
export function useResponsive(): () => void {
  const store = useAppStore();

  const apply = (): void => {
    store.setIsPhone(document.documentElement.clientWidth < PHONE_BREAKPOINT);
  };

  apply();
  window.addEventListener('resize', apply);

  const stop = (): void => {
    window.removeEventListener('resize', apply);
  };

  // 在组件上下文中调用时自动清理；否则该调用是 no-op。
  try {
    onUnmounted(stop);
  } catch {
    // 非组件上下文（如测试/手动调用）——忽略，交由 stop() 手动清理。
  }

  return stop;
}
