import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import VPullButton from './VPullButton.vue';

describe('VPullButton', () => {
  it('emits switchCollapse when clicked', async () => {
    const wrapper = mount(VPullButton, {
      props: { isHide: false },
      global: { stubs: { 'el-icon': true } },
    });
    await wrapper.find('#pullButton').trigger('click');
    expect(wrapper.emitted('switchCollapse')).toHaveLength(1);
  });

  it('applies hide class when isHide is true', () => {
    const wrapper = mount(VPullButton, {
      props: { isHide: true },
      global: { stubs: { 'el-icon': true } },
    });
    expect(wrapper.find('#pullButton').classes()).toContain('hide');
  });
});
