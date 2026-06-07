/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

// Injected at runtime by the backend via GET /js/config.js
interface Window {
  MANGA_BASE_URL?: string;
  MANGA_BASE_WEBSOCKET_URL?: string;
}
