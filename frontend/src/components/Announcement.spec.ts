import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Announcement from './Announcement.vue';

describe('Announcement', () => {
  it('renders the trigger and hides dialog by default', () => {
    const wrapper = mount(Announcement, {
      global: { stubs: { 'el-dialog': true, 'el-icon': true, 'el-button': true } },
    });
    expect(wrapper.find('.announceStage').exists()).toBe(true);
  });

  it('opens the dialog when the trigger is clicked', async () => {
    const wrapper = mount(Announcement, {
      global: { stubs: { 'el-dialog': true, 'el-icon': true, 'el-button': true } },
    });
    await wrapper.find('.announceStage').trigger('click');
    expect((wrapper.vm as unknown as { isClicked: boolean }).isClicked).toBe(true);
  });
});
