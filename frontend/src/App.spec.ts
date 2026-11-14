import { describe, it, expect } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createPinia } from 'pinia';
import App from './App.vue';
import { routes } from './router';

describe('App shell', () => {
  it('renders the routed view inside the Nuxt UI app wrapper', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes });
    await router.push('/settings');
    await router.isReady();

    const wrapper = mount(App, {
      global: { plugins: [createPinia(), router] },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="settings-view"]').exists()).toBe(true);
  });
});
