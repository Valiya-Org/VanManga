import { defineComponent, h, type Component } from 'vue';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import UApp from '@nuxt/ui/components/App.vue';
import { routes } from '@/router';

export interface Mounted {
  wrapper: VueWrapper;
  router: Router;
  pinia: Pinia;
}

/**
 * Mounts `component` inside `<UApp>` (toasts, overlays) with a pinia and a
 * memory router, attached to the document so portalled content (modals,
 * menus, slideovers) is reachable through `document.body`.
 *
 * Pass `pinia` to reuse one set up (and seeded) before mounting.
 */
export async function mountWithApp(
  component: Component,
  options: { props?: Record<string, unknown>; pinia?: Pinia; path?: string } = {},
): Promise<Mounted> {
  const pinia = options.pinia ?? createPinia();
  setActivePinia(pinia);
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push(options.path ?? '/');
  await router.isReady();
  const Host = defineComponent({
    setup: () => () =>
      h(UApp as Component, null, { default: () => h(component, options.props ?? {}) }),
  });
  const wrapper = mount(Host, {
    attachTo: document.body,
    global: { plugins: [pinia, router] },
  });
  await flushPromises();
  return { wrapper, router, pinia };
}

/** Text of everything rendered into the document (including portals). */
export function bodyText(): string {
  return document.body.textContent ?? '';
}

/** Finds a button anywhere in the document by its (trimmed) visible text. */
export function findButton(text: string | RegExp): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll('button')].find((b) => {
    const t = (b.textContent ?? '').trim();
    return typeof text === 'string' ? t === text : text.test(t);
  });
}

/** Clicks a DOM element and lets Vue and pending promises settle. */
export async function click(el: Element | undefined | null): Promise<void> {
  if (!el) throw new Error('click(): element not found');
  (el as HTMLElement).click();
  await flushPromises();
}
