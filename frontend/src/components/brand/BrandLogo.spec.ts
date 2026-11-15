import { describe, it, expect, afterEach } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import { mountWithApp } from '@/test/mount';
import BrandLogo from './BrandLogo.vue';

enableAutoUnmount(afterEach);

describe('BrandLogo', () => {
  it('shows the Valiya mark, white "Van" and gradient "Manga", linking home', async () => {
    const { wrapper } = await mountWithApp(BrandLogo, { path: '/settings' });
    const link = wrapper.find('[data-testid="brand-logo"]');
    expect(link.attributes('href')).toBe('/');
    expect(link.find('img').exists()).toBe(true);
    expect(link.text()).toBe('VanManga');
    expect(link.find('.vm-gradient-text').text()).toBe('Manga');
  });
});
