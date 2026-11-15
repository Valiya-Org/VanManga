import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import ui from '@nuxt/ui/vite';
import { uiOptions } from './ui.options';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // ui() resolves Nuxt UI components (UApp, …) in component tests too.
  plugins: [vue(), ui(uiOptions)],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
