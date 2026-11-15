import type ui from '@nuxt/ui/vite';

type NuxtUIOptions = NonNullable<Parameters<typeof ui>[0]>;

/**
 * Nuxt UI options shared by the app build and the component tests.
 *
 * - Fixed dark theme: no color-mode plugin; `<html class="dark">` is static
 *   in index.html. The palette itself lives in src/assets/main.css.
 * - Icons are bundled at build time (lucide via @iconify-json/lucide) so the
 *   UI never fetches icons from the online Iconify API.
 */
export const uiOptions: NuxtUIOptions = {
  colorMode: false,
  ui: {
    colors: { primary: 'violet', neutral: 'zinc' },
  },
  icon: {
    clientBundle: { scan: true },
  },
};
