import { onScopeDispose, ref, type Ref } from 'vue';

/** Below this width the phone layout applies (spec §3.1). */
export const MOBILE_QUERY = '(max-width: 767.98px)';

/** Reactive "phone layout" flag; false where matchMedia is unavailable. */
export function useIsMobile(): Ref<boolean> {
  const mobile = ref(false);
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return mobile;
  const mql = window.matchMedia(MOBILE_QUERY);
  mobile.value = mql.matches;
  const onChange = (e: MediaQueryListEvent) => (mobile.value = e.matches);
  mql.addEventListener('change', onChange);
  onScopeDispose(() => mql.removeEventListener('change', onChange));
  return mobile;
}
