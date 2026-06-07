# 前端 Plan 2b：搜索页 + 提交选择逻辑 实现计划（Plan 2 系列 2/4）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把旧 Vue2 的"搜索添加漫画"页面（SearchPage + DocumentList/Document/MobileCardList/V-botton + documentBaseLogic/checkAndPOP）重写进 `frontend/`（Vue3 + TS），并把"确认提交下载"逻辑对齐到已重构的 NestJS 后端契约。

**Architecture:** 业务逻辑用 `<script setup lang="ts">` + composables；桌面/移动的通知/加载/确认弹窗统一走 Plan 2a 的 `utils/ui`（自动按 `store.isPhone` 分支），因此"提交选择"逻辑只写一份 composable（`useSubmitSelection`），桌面 `Document` 与移动 `MobileCardList` 共用之 —— 这是相对旧代码（桌面/移动各写一套 handler）的 DRY 重构。提交分支按**新后端** `runAdd` 的返回编码处理：`200 data:'submitted'`（已添加）、`200 data:'already-in-library'`（已存在）、`409 data:{duplicates}`（疑似重复，需 `submit_sign='1'` 强制添加）、`200 data:'cancelled'`（取消）。`reload` 通过 `inject('reload')`（MainPage 已 `provide`）。

**Tech Stack:** Vue 3.5、TypeScript、Pinia、vue-router 4、element-plus 2、vant 4、overlayscrollbars-vue、Vitest + @vue/test-utils。

**配套规格：** `docs/superpowers/specs/2026-06-06-frontend-vue3-rewrite-unified-build-design.md`（第 6/8/9 节）
**前置：** Plan 2a 已完成 —— `frontend/` 已有 `types/manga.ts`、`api/dogemanga.ts`（`searchManga`/`confirmSelection`）、`utils/ui.ts`（`confirmDialog`/`showLoading`/`notifySuccess`/`notifyError`）、`components/VPullButton.vue`、`views/MainPage.vue`（`provide('reload', …)`）、element-plus/vant/@element-plus/icons-vue/overlayscrollbars 均已安装并全局注册。

---

## 迁移约定（沿用 Plan 2a）

旧源码在 `frontend_src/vanmanga/src/`（只读参考）。统一机械转换：Options API → `<script setup lang="ts">`；`this.$store.state.isPhone` → `useAppStore().isPhone`；`this.$http.get/post` → `api/*` 具名封装；element-ui 全局服务 / vant 全局服务 → Plan 2a 的 `utils/ui` 封装；`mixins` → composable；`this.$emit('reload')` 链 → `inject('reload')`；模板 `slot=` / `:visible.sync` / `.native` → Vue3 写法；`/deep/`、`>>>`、`::v-deep` → `:deep()`；Vue2 过渡类 `*-enter`/`*-leave` → Vue3 `*-enter-from`/`*-leave-to`；`<i class="bi-…">` 图标 → element-plus `<el-icon>` + `@element-plus/icons-vue`；静态 `<style>` 内若引用 `@keyframes gradient` 等未定义关键帧，原样照搬（旧代码遗留，无害）。

**关键契约对齐（与旧代码不同，务必照此实现）：**
- 旧 `documentBaseLogic.submitSelection` 按 `200/410/411` 分支。**新后端** `POST /api/dogemanga/confirm`（`library.controller.ts:runAdd`）返回：
  - 已添加：`{ code: 200, data: 'submitted' }` → 成功通知 + `reload()`
  - 已存在库中：`{ code: 200, data: 'already-in-library' }` → 错误通知"已存在"
  - 疑似重复（仅 `submit_sign='0'` 时）：`{ code: 409, data: { duplicates: string[] } }` → 二次确认弹窗，确认后以 `submit_sign='1'` 重新提交
  - 用户取消（`submit_sign='2'`，本计划不主动发）：`{ code: 200, data: 'cancelled' }` → 无操作
- `searchManga`（`GET /api/dogemanga/search`，`scraper-legacy.controller.ts`）返回：`200`(data: `MangaSearchResult[]`) / `456`（搜索词为空）/ `457`（无结果）。
- `confirmSelection(item, submitSign)` 已在 Plan 2a 实现，签名 `(mangaObject: MangaSearchResult, submitSign: '0'|'1'|'2')`，返回 `ApiEnvelope<unknown>`。

---

## 文件结构总览（本计划）

新建：
- `frontend/src/composables/useShake.ts` — 输入校验抖动动效（checkAndPOP）+ 测试
- `frontend/src/composables/useSubmitSelection.ts` — 提交选择逻辑（documentBaseLogic，新契约）+ 测试
- `frontend/src/components/VBotton.vue` — 渐变按钮（V-botton）+ 测试
- `frontend/src/components/Document.vue` — 桌面搜索结果卡片 + 测试
- `frontend/src/components/DocumentList.vue` — 桌面结果网格 + 测试
- `frontend/src/components/MobileCardList.vue` — 移动结果卡片列表 + 测试
- 各 `*.spec.ts`

修改：
- `frontend/src/views/SearchPage.vue` — 桌面/移动搜索外壳 + 搜索逻辑 + 空校验

> 旧 `SearchPage` 有一处 bug：`searchList.push(...)` 从不清空，重复搜索会累积结果。重写改为**整体替换** `searchList.value = res.data`（顺手修复，已在本计划注明）。

---

## Task 1: 输入抖动动效 `composables/useShake.ts`（TDD）

**Files:**
- Create: `frontend/src/composables/useShake.ts`
- Test: `frontend/src/composables/useShake.spec.ts`

> 取代旧 `assets/methods/checkAndPOP.vue`。旧版用 `getElementById` + Web Animations API 抖动并把输入框背景染红。重写为 composable，暴露 `shake(el)`：对传入的元素用 WAAPI 播放左右抖动关键帧（与旧 `shakingAnime` 一致）。背景染红改由组件用响应式 class 处理（更 Vue3），故 composable 只保留可复用的"动效"。`el` 可能为 `null`（ref 未挂载）或在 jsdom 下无 `animate`，均需安全防御。

- [ ] **Step 1: 写失败测试 `frontend/src/composables/useShake.spec.ts`**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { useShake } from './useShake';

describe('useShake', () => {
  it('calls element.animate with a horizontal-shake keyframe set', () => {
    const animate = vi.fn();
    const el = { animate } as unknown as HTMLElement;
    const { shake } = useShake();
    shake(el);
    expect(animate).toHaveBeenCalledTimes(1);
    const [keyframes, options] = animate.mock.calls[0];
    expect(Array.isArray(keyframes)).toBe(true);
    expect(keyframes.length).toBeGreaterThan(1);
    expect((options as { duration: number }).duration).toBe(300);
  });

  it('does nothing when target is null', () => {
    const { shake } = useShake();
    expect(() => shake(null)).not.toThrow();
  });

  it('does nothing when target has no animate (non-WAAPI env)', () => {
    const { shake } = useShake();
    const el = {} as unknown as HTMLElement;
    expect(() => shake(el)).not.toThrow();
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd frontend; npm run test -- --run useShake`
Expected: FAIL（`./useShake` 未创建）。

- [ ] **Step 3: 实现 `frontend/src/composables/useShake.ts`**
```typescript
/**
 * 输入校验抖动动效（取代旧 checkAndPOP.shakingAnime）。
 * 对元素用 Web Animations API 播放一段左右抖动，用于"搜索词为空"等校验失败反馈。
 */
export function useShake() {
  function shake(target: HTMLElement | null): void {
    if (!target || typeof target.animate !== 'function') return;
    target.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-3%)' },
        { transform: 'translateX(0%)' },
        { transform: 'translateX(3%)' },
        { transform: 'translateX(0%)' },
        { transform: 'translateX(-3%)' },
        { transform: 'translateX(0%)' },
        { transform: 'translateX(3%)' },
        { transform: 'translateX(0%)' },
      ],
      { duration: 300 },
    );
  }

  return { shake };
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd frontend; npm run test -- --run useShake`
Expected: PASS（3 个用例）。

- [ ] **Step 5: 提交**
```
git add frontend/src/composables/useShake.ts frontend/src/composables/useShake.spec.ts
git commit -m "feat(frontend): useShake input-validation animation (TDD)"
```
提交信息结尾加（空行后）：

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

---

## Task 2: 提交选择逻辑 `composables/useSubmitSelection.ts`（TDD）

**Files:**
- Create: `frontend/src/composables/useSubmitSelection.ts`
- Test: `frontend/src/composables/useSubmitSelection.spec.ts`

> 取代旧 `assets/methods/documentBaseLogic.vue`。核心是 `submitManga(item)`：先弹"确认所选漫画"对话框（HTML），确认后以 `submit_sign='0'` 提交；按**新后端契约**分支（见迁移约定）；遇 `409` 弹"疑似重复"二次确认，确认后以 `submit_sign='1'` 重提交。桌面/移动的弹窗与通知统一走 `utils/ui`（自动分支），故只此一份逻辑。`reload` 用 `inject('reload', () => {})`（无 provider 时退化为空函数，便于测试）。

- [ ] **Step 1: 写失败测试 `frontend/src/composables/useSubmitSelection.spec.ts`**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';

vi.mock('@/api/dogemanga', () => ({
  confirmSelection: vi.fn(),
}));

const confirmDialog = vi.fn();
const showLoading = vi.fn(() => ({ close: vi.fn() }));
const notifySuccess = vi.fn();
const notifyError = vi.fn();
vi.mock('@/utils/ui', () => ({
  confirmDialog: (...a: unknown[]) => confirmDialog(...a),
  showLoading: (...a: unknown[]) => showLoading(...a),
  notifySuccess: (...a: unknown[]) => notifySuccess(...a),
  notifyError: (...a: unknown[]) => notifyError(...a),
}));

import { confirmSelection } from '@/api/dogemanga';
import { useSubmitSelection } from './useSubmitSelection';

const mockConfirm = confirmSelection as unknown as ReturnType<typeof vi.fn>;
const item = {
  manga_id: 1,
  manga_name: 'Naruto',
  artist_name: 'Kishimoto',
  thumbnail: 'x',
  newest_epi: '700',
} as never;

const reload = vi.fn();

function harness() {
  const Comp = defineComponent({
    setup() {
      return useSubmitSelection();
    },
    template: '<div />',
  });
  return mount(Comp, { global: { provide: { reload } } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useSubmitSelection', () => {
  it('on confirm + 200/"submitted": notifies success and reloads', async () => {
    confirmDialog.mockResolvedValueOnce(undefined); // initial confirm accepted
    mockConfirm.mockResolvedValueOnce({ code: 200, data: 'submitted' });
    const w = harness();
    await (w.vm as unknown as { submitManga: (i: never) => Promise<void> }).submitManga(item);
    expect(mockConfirm).toHaveBeenCalledWith(item, '0');
    expect(notifySuccess).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the user cancels the initial confirm', async () => {
    confirmDialog.mockRejectedValueOnce(new Error('cancel'));
    const w = harness();
    await (w.vm as unknown as { submitManga: (i: never) => Promise<void> }).submitManga(item);
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('on 200/"already-in-library": notifies error, does not reload', async () => {
    confirmDialog.mockResolvedValueOnce(undefined);
    mockConfirm.mockResolvedValueOnce({ code: 200, data: 'already-in-library' });
    const w = harness();
    await (w.vm as unknown as { submitManga: (i: never) => Promise<void> }).submitManga(item);
    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('on 409 duplicate: second confirm then resubmits with submit_sign=1', async () => {
    confirmDialog
      .mockResolvedValueOnce(undefined) // initial confirm
      .mockResolvedValueOnce(undefined); // duplicate confirm accepted
    mockConfirm
      .mockResolvedValueOnce({ code: 409, data: { duplicates: ['Naruto 2'] } })
      .mockResolvedValueOnce({ code: 200, data: 'submitted' });
    const w = harness();
    await (w.vm as unknown as { submitManga: (i: never) => Promise<void> }).submitManga(item);
    expect(mockConfirm).toHaveBeenNthCalledWith(1, item, '0');
    expect(mockConfirm).toHaveBeenNthCalledWith(2, item, '1');
    expect(notifySuccess).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('on 409 duplicate then cancel: does not resubmit', async () => {
    confirmDialog
      .mockResolvedValueOnce(undefined) // initial confirm
      .mockRejectedValueOnce(new Error('cancel')); // duplicate confirm rejected
    mockConfirm.mockResolvedValueOnce({ code: 409, data: { duplicates: ['x'] } });
    const w = harness();
    await (w.vm as unknown as { submitManga: (i: never) => Promise<void> }).submitManga(item);
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(notifySuccess).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd frontend; npm run test -- --run useSubmitSelection`
Expected: FAIL（`./useSubmitSelection` 未创建）。

- [ ] **Step 3: 实现 `frontend/src/composables/useSubmitSelection.ts`**
```typescript
import { inject } from 'vue';
import type { MangaSearchResult } from '@/types/manga';
import { confirmSelection } from '@/api/dogemanga';
import {
  confirmDialog,
  notifyError,
  notifySuccess,
  showLoading,
} from '@/utils/ui';

/** 生成"确认所选漫画"对话框正文（HTML）。 */
function initialInfo(item: MangaSearchResult): string {
  return (
    `<p>漫画ID为 ： <strong>${item.manga_id}</strong></p>` +
    `<p>漫画作者为 ： <strong>${item.artist_name}</strong></p>` +
    `<p>该漫画最新话名为 ： <strong>${item.newest_epi}</strong></p>` +
    `<p>请检查上方信息是否正确，最好在漫画狗网站内核实一下</p>` +
    `<p><strong>请勿添加已有的漫画！</strong></p>`
  );
}

/** 生成"疑似重复"对话框正文（HTML）。 */
function duplicateInfo(item: MangaSearchResult, duplicates: string[]): string {
  return (
    `<p>你选择的漫画名为 ： <strong>${item.manga_name}</strong></p>` +
    `<p>库中可能重复的漫画 ：</p>` +
    `<strong>${duplicates.join('、')}</strong>` +
    `<p>请再次核实并确认是否添加该漫画</p>` +
    `<p><strong>请勿添加库中已有的漫画！</strong></p>`
  );
}

/**
 * 搜索结果"确认并提交下载"逻辑（桌面/移动共用）。
 * 分支严格对齐新后端 runAdd 的返回编码。
 */
export function useSubmitSelection() {
  const reload = inject<() => void>('reload', () => {});

  async function submit(
    item: MangaSearchResult,
    submitSign: '0' | '1',
  ): Promise<void> {
    const loading = showLoading('正在提交下载请求，等待响应...');
    try {
      const res = await confirmSelection(item, submitSign);
      loading.close();

      if (res.code === 409) {
        const duplicates =
          (res.data as { duplicates?: string[] })?.duplicates ?? [];
        try {
          await confirmDialog({
            title: '我们检查了已有漫画，发现有可能的重复！',
            message: duplicateInfo(item, duplicates),
            allowHtml: true,
            confirmButtonText: '仍要添加',
            cancelButtonText: '遗憾离场',
          });
        } catch {
          return; // 用户在重复确认弹窗里取消
        }
        await submit(item, '1');
        return;
      }

      if (res.code === 200 && res.data === 'already-in-library') {
        notifyError(`${item.manga_name} 已存在在库中`, '请仔细检查后再添加！');
        return;
      }
      if (res.code === 200 && res.data === 'cancelled') {
        return;
      }
      if (res.code === 200) {
        notifySuccess(
          `${item.manga_name} 已入库`,
          `成功选择 ${item.manga_name}。ID为 ${item.manga_id}。已开始在后台下载！`,
        );
        reload();
      }
    } catch (error) {
      loading.close();
      notifyError('提交失败', '漫画提交出现未知问题，请联系管理员！');
      throw error;
    }
  }

  /** 入口：点击搜索结果卡片后调用。先确认，再提交。 */
  async function submitManga(item: MangaSearchResult): Promise<void> {
    try {
      await confirmDialog({
        title: `你选择的是 ${item.manga_name}`,
        message: initialInfo(item),
        allowHtml: true,
      });
    } catch {
      return; // 用户取消初次确认
    }
    await submit(item, '0');
  }

  return { submitManga, initialInfo, duplicateInfo };
}
```

> 说明：`submit` 的 `catch` 里 `notifyError` 后 `throw error`，与旧 `documentBaseLogic` 行为一致（向上抛出未知错误）；最外层调用方（Document/MobileCardList）的点击处理用 `void submitManga(...)`，未捕获的拒绝不影响 UI。最后一个测试用例"409 then cancel"在 `submit('0')` 内 `return`，不会触发 `submit('1')`。

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd frontend; npm run test -- --run useSubmitSelection`
Expected: PASS（5 个用例）。

- [ ] **Step 5: 提交**
```
git add frontend/src/composables/useSubmitSelection.ts frontend/src/composables/useSubmitSelection.spec.ts
git commit -m "feat(frontend): useSubmitSelection (new confirm contract, TDD)"
```
结尾加 Co-Authored-By 行。

---

## Task 3: 渐变按钮 `components/VBotton.vue`（TDD）

**Files:**
- Create: `frontend/src/components/VBotton.vue`
- Test: `frontend/src/components/VBotton.spec.ts`

> 取代旧 `components/V-botton.vue`。纯展示按钮：`label` 文本 + 可选图标插槽，点击 `emit('click')`（旧版用 `:clickMethod` prop 传函数，Vue3 改为事件更地道）。`working` 控制底部光条的两种渐变（旧 `beGreen`/`isWorking`）：`working=false` 显示常态光条，`working=true` 显示工作态光条。

- [ ] **Step 1: 写失败测试 `frontend/src/components/VBotton.spec.ts`**
```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import VBotton from './VBotton.vue';

describe('VBotton', () => {
  it('renders the label and emits click', async () => {
    const wrapper = mount(VBotton, { props: { label: '搜索' } });
    expect(wrapper.text()).toContain('搜索');
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });

  it('shows the working bottomSide when working is true', () => {
    const wrapper = mount(VBotton, { props: { label: '搜索', working: true } });
    const working = wrapper.find('.bottomSide.working');
    expect(working.isVisible()).toBe(true);
  });

  it('renders an icon slot', () => {
    const wrapper = mount(VBotton, {
      props: { label: '搜索' },
      slots: { icon: '<i class="my-icon" />' },
    });
    expect(wrapper.find('.my-icon').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd frontend; npm run test -- --run VBotton`
Expected: FAIL（组件未创建）。

- [ ] **Step 3: 实现 `frontend/src/components/VBotton.vue`**
```vue
<script setup lang="ts">
withDefaults(defineProps<{ label: string; working?: boolean }>(), {
  working: false,
});
const emit = defineEmits<{ (e: 'click'): void }>();

function handleClick(): void {
  emit('click');
}
</script>

<template>
  <div class="button-container">
    <button id="upload" class="vbotton" @click="handleClick">
      <slot name="icon" />
      {{ label }}
      <div v-show="!working" class="bottomSide"></div>
      <div v-show="working" class="bottomSide working"></div>
    </button>
  </div>
</template>

<style scoped>
/* 从旧 frontend_src/vanmanga/src/components/V-botton.vue 的 <style scoped> 原样复制：
   .button-container / #upload / .button-container::before / @keyframes move /
   .bottomSide / .bottomSide.working / hover 规则等。
   注意 .bottomSide.working 用到 @keyframes gradient（旧代码未在本文件定义，原样保留无害）。 */
</style>
```

> Step 3 要点：把旧 `V-botton.vue` 的 `<style scoped>` 全部规则照搬。旧模板用 `<i :class="iconClass">`，这里换成 `<slot name="icon" />`，由父组件传 element-plus 图标。

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd frontend; npm run test -- --run VBotton`
Expected: PASS（3 个用例）。

- [ ] **Step 5: 提交**
```
git add frontend/src/components/VBotton.vue frontend/src/components/VBotton.spec.ts
git commit -m "feat(frontend): VBotton gradient button (TDD)"
```
结尾加 Co-Authored-By 行。

---

## Task 4: 桌面搜索结果卡片 `components/Document.vue`（TDD）

**Files:**
- Create: `frontend/src/components/Document.vue`
- Test: `frontend/src/components/Document.spec.ts`

> 取代旧 `components/Document.vue`。展示单个搜索结果（封面 base64 + 名称/作者/最新话），点击整卡 → `useSubmitSelection().submitManga(item)`。提交细节全在 composable 里，本组件很薄。

- [ ] **Step 1: 写失败测试 `frontend/src/components/Document.spec.ts`**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

const submitManga = vi.fn();
vi.mock('@/composables/useSubmitSelection', () => ({
  useSubmitSelection: () => ({ submitManga }),
}));

import Document from './Document.vue';

const item = {
  manga_id: 1,
  manga_name: 'Naruto',
  artist_name: 'Kishimoto',
  thumbnail: 'BASE64',
  newest_epi: '700',
} as never;

describe('Document', () => {
  it('renders manga name, artist and newest episode', () => {
    const wrapper = mount(Document, { props: { item } });
    expect(wrapper.text()).toContain('Naruto');
    expect(wrapper.text()).toContain('Kishimoto');
    expect(wrapper.text()).toContain('700');
  });

  it('renders a base64 thumbnail src', () => {
    const wrapper = mount(Document, { props: { item } });
    expect(wrapper.find('img').attributes('src')).toBe(
      'data:image/png;base64,BASE64',
    );
  });

  it('calls submitManga(item) when the card is clicked', async () => {
    submitManga.mockClear();
    const wrapper = mount(Document, { props: { item } });
    await wrapper.find('.documentBlock').trigger('click');
    expect(submitManga).toHaveBeenCalledWith(item);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd frontend; npm run test -- --run Document`
Expected: FAIL（组件未创建）。注意此过滤器也会匹配 `DocumentList`（尚未创建），无妨。

- [ ] **Step 3: 实现 `frontend/src/components/Document.vue`**
```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { MangaSearchResult } from '@/types/manga';
import { useSubmitSelection } from '@/composables/useSubmitSelection';

const props = defineProps<{ item: MangaSearchResult }>();
const { submitManga } = useSubmitSelection();

const imgSrc = computed(
  () => `data:image/png;base64,${props.item.thumbnail}`,
);

function handleClick(): void {
  void submitManga(props.item);
}
</script>

<template>
  <div class="stage">
    <div class="documentBlock" @click="handleClick">
      <img
        draggable="false"
        :src="imgSrc"
        :alt="item.manga_name"
        class="thumb"
      />
      <p class="showName">{{ item.manga_name }}</p>
      <p class="showName">{{ item.artist_name }}</p>
      <p class="showName">最新话名 ：{{ item.newest_epi }}</p>
    </div>
  </div>
</template>

<style scoped>
/* 从旧 frontend_src/vanmanga/src/components/Document.vue 的 <style scoped> 原样复制：
   @property --rotate / @keyframes light|spin / .stage(::before/::after/:hover) /
   .documentBlock / .showName 等。把旧内联 style="width:240px;height:320px;object-fit:contain"
   迁到 .thumb 类（width:240px;height:320px;object-fit:contain）。无 /deep/。 */
</style>
```

> Step 3 要点：旧 `<img>` 用内联样式，这里改用 `.thumb` 类承接（`width:240px; height:320px; object-fit:contain;`），其余样式原样照搬。

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd frontend; npm run test -- --run Document.spec`
Expected: PASS（3 个用例）。

- [ ] **Step 5: 提交**
```
git add frontend/src/components/Document.vue frontend/src/components/Document.spec.ts
git commit -m "feat(frontend): Document search-result card (TDD)"
```
结尾加 Co-Authored-By 行。

---

## Task 5: 桌面结果网格 `components/DocumentList.vue`（TDD）

**Files:**
- Create: `frontend/src/components/DocumentList.vue`
- Test: `frontend/src/components/DocumentList.spec.ts`

> 取代旧 `components/DocumentList.vue`。把 `searchList` 渲染成网格 `Document` 列表；空列表时显示"搜索无结果"。旧版的 `@reload` 链已由 `Document`→composable 的 `inject('reload')` 取代，本组件无需透传 reload。

- [ ] **Step 1: 写失败测试 `frontend/src/components/DocumentList.spec.ts`**
```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DocumentList from './DocumentList.vue';

const stubs = { Document: { template: '<div class="doc-stub" />' } };

const list = [
  { manga_id: 1, manga_name: 'A', artist_name: 'a', thumbnail: 'x', newest_epi: '1' },
  { manga_id: 2, manga_name: 'B', artist_name: 'b', thumbnail: 'y', newest_epi: '2' },
] as never;

describe('DocumentList', () => {
  it('renders one Document per search item', () => {
    const wrapper = mount(DocumentList, {
      props: { searchList: list },
      global: { stubs },
    });
    expect(wrapper.findAll('.doc-stub')).toHaveLength(2);
    expect(wrapper.find('.nothing').exists()).toBe(false);
  });

  it('shows the empty message when the list is empty', () => {
    const wrapper = mount(DocumentList, {
      props: { searchList: [] },
      global: { stubs },
    });
    expect(wrapper.findAll('.doc-stub')).toHaveLength(0);
    expect(wrapper.find('.nothing').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd frontend; npm run test -- --run DocumentList`
Expected: FAIL（组件未创建）。

- [ ] **Step 3: 实现 `frontend/src/components/DocumentList.vue`**
```vue
<script setup lang="ts">
import type { MangaSearchResult } from '@/types/manga';
import Document from './Document.vue';

defineProps<{ searchList: MangaSearchResult[] }>();
</script>

<template>
  <div class="documentListRoot">
    <ul class="document">
      <li v-for="item in searchList" :key="item.manga_id">
        <Document :item="item" />
      </li>
    </ul>
    <div class="nothing" v-if="searchList.length === 0">
      <p>搜索无结果！<br />Nothing Here!</p>
    </div>
  </div>
</template>

<style scoped>
/* 从旧 frontend_src/vanmanga/src/components/DocumentList.vue 的 <style scoped> 原样复制：
   .nothing / .nothing>p / .document（grid 布局）/ li / #ccc 等。
   旧根元素 id="ccc" 改为 class="documentListRoot"，把旧 #ccc 选择器改名为 .documentListRoot。
   无 /deep/。 */
</style>
```

> Step 3 要点：旧根 `<div id="ccc">` 的样式选择器 `#ccc` 改为 `.documentListRoot`，其余（grid、`.nothing` 等）原样照搬。

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd frontend; npm run test -- --run DocumentList`
Expected: PASS（2 个用例）。

- [ ] **Step 5: 提交**
```
git add frontend/src/components/DocumentList.vue frontend/src/components/DocumentList.spec.ts
git commit -m "feat(frontend): DocumentList result grid (TDD)"
```
结尾加 Co-Authored-By 行。

---

## Task 6: 移动结果卡片列表 `components/MobileCardList.vue`（TDD）

**Files:**
- Create: `frontend/src/components/MobileCardList.vue`
- Test: `frontend/src/components/MobileCardList.spec.ts`

> 取代旧 `components/MobileCardList.vue`。用 vant `van-card` 列出搜索结果，点击 → `submitManga(item)`（与桌面共用 composable）。

- [ ] **Step 1: 写失败测试 `frontend/src/components/MobileCardList.spec.ts`**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

const submitManga = vi.fn();
vi.mock('@/composables/useSubmitSelection', () => ({
  useSubmitSelection: () => ({ submitManga }),
}));

import MobileCardList from './MobileCardList.vue';

const list = [
  { manga_id: 1, manga_name: 'A', artist_name: 'a', thumbnail: 'x', newest_epi: '1' },
  { manga_id: 2, manga_name: 'B', artist_name: 'b', thumbnail: 'y', newest_epi: '2' },
] as never;

const stubs = {
  'van-card': { template: '<div class="card-stub" @click="$emit(\'click\')"><slot name="tags" /></div>' },
  'van-tag': { template: '<span><slot /></span>' },
};

describe('MobileCardList', () => {
  it('renders one card per item', () => {
    const wrapper = mount(MobileCardList, {
      props: { searchList: list },
      global: { stubs },
    });
    expect(wrapper.findAll('.card-stub')).toHaveLength(2);
  });

  it('calls submitManga(item) when a card is clicked', async () => {
    submitManga.mockClear();
    const wrapper = mount(MobileCardList, {
      props: { searchList: list },
      global: { stubs },
    });
    await wrapper.findAll('.card-stub')[0].trigger('click');
    expect(submitManga).toHaveBeenCalledWith(list[0]);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd frontend; npm run test -- --run MobileCardList`
Expected: FAIL（组件未创建）。

- [ ] **Step 3: 实现 `frontend/src/components/MobileCardList.vue`**
```vue
<script setup lang="ts">
import type { MangaSearchResult } from '@/types/manga';
import { useSubmitSelection } from '@/composables/useSubmitSelection';

defineProps<{ searchList: MangaSearchResult[] }>();
const { submitManga } = useSubmitSelection();
</script>

<template>
  <div class="mobileCardListStage">
    <div
      class="mobileCardShell"
      v-for="item in searchList"
      :key="item.manga_id"
    >
      <van-card
        :desc="item.artist_name"
        :title="item.manga_name"
        :thumb="`data:image/png;base64,${item.thumbnail}`"
        :centered="true"
        class="mobileSingleCard"
        @click="submitManga(item)"
      >
        <template #tags>
          <span
            >最新一话:
            <van-tag color="#a85dc3" plain type="primary">{{
              item.newest_epi
            }}</van-tag></span
          >
        </template>
      </van-card>
    </div>
  </div>
</template>

<style scoped>
/* 从旧 frontend_src/vanmanga/src/components/MobileCardList.vue 的 <style scoped> 原样复制：
   .mobileCardListStage / .mobileSingleCard。无 /deep/。 */
</style>
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd frontend; npm run test -- --run MobileCardList`
Expected: PASS（2 个用例）。

- [ ] **Step 5: 提交**
```
git add frontend/src/components/MobileCardList.vue frontend/src/components/MobileCardList.spec.ts
git commit -m "feat(frontend): MobileCardList result list (TDD)"
```
结尾加 Co-Authored-By 行。

---

## Task 7: 重写 `views/SearchPage.vue`（搜索外壳 + 搜索逻辑 + 空校验）（TDD）

**Files:**
- Modify: `frontend/src/views/SearchPage.vue`
- Test: `frontend/src/views/SearchPage.spec.ts`

> 桌面：搜索框（el-input）+ "搜索"/"扫描" 两个 `VBotton` + `DocumentList`（包在 `OverlayScrollbarsComponent` 里）。移动：`van-search` + `MobileCardList`。搜索逻辑用 `searchManga`：`200` 替换 `searchList` 并显示结果（修复旧累积 bug）、`456` 触发空校验抖动、`457` 错误通知。搜索词为空时显示 `el-alert` 并 `shake` 搜索框。"扫描"按钮保持旧版"暂不开放"行为（`ElMessageBox.prompt` 暗码 → `notifyError('该功能暂不开放', …)`）。

- [ ] **Step 1: 写失败测试 `frontend/src/views/SearchPage.spec.ts`**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/api/dogemanga', () => ({
  searchManga: vi.fn(),
}));
vi.mock('@/utils/ui', () => ({
  showLoading: vi.fn(() => ({ close: vi.fn() })),
  notifyError: vi.fn(),
}));

import { searchManga } from '@/api/dogemanga';
import { useAppStore } from '@/stores/app';
import SearchPage from './SearchPage.vue';

const mockSearch = searchManga as unknown as ReturnType<typeof vi.fn>;

const stubs = {
  'el-input': {
    props: ['modelValue'],
    template:
      '<input class="el-input-stub" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  'el-alert': { template: '<div class="el-alert-stub"><slot /></div>' },
  VBotton: { template: '<button class="vbotton-stub" @click="$emit(\'click\')" />' },
  DocumentList: { template: '<div class="doclist-stub" />' },
  MobileCardList: { template: '<div class="mobilelist-stub" />' },
  'van-search': { template: '<div class="van-search-stub" />' },
  OverlayScrollbarsComponent: { template: '<div><slot /></div>' },
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('SearchPage', () => {
  it('renders desktop search box + buttons when not phone', () => {
    useAppStore().setIsPhone(false);
    const wrapper = mount(SearchPage, { global: { stubs } });
    expect(wrapper.find('.el-input-stub').exists()).toBe(true);
    expect(wrapper.findAll('.vbotton-stub')).toHaveLength(2);
    expect(wrapper.find('.van-search-stub').exists()).toBe(false);
  });

  it('renders mobile van-search when phone', () => {
    useAppStore().setIsPhone(true);
    const wrapper = mount(SearchPage, { global: { stubs } });
    expect(wrapper.find('.van-search-stub').exists()).toBe(true);
    expect(wrapper.find('.el-input-stub').exists()).toBe(false);
  });

  it('flags emptyError and does not call the api when search is blank', async () => {
    useAppStore().setIsPhone(false);
    const wrapper = mount(SearchPage, { global: { stubs } });
    await (wrapper.vm as unknown as { sendOut: () => Promise<void> }).sendOut();
    expect(mockSearch).not.toHaveBeenCalled();
    expect((wrapper.vm as unknown as { emptyError: boolean }).emptyError).toBe(true);
  });

  it('on 200 replaces searchList and shows results', async () => {
    useAppStore().setIsPhone(false);
    mockSearch.mockResolvedValueOnce({
      code: 200,
      data: [{ manga_id: 9, manga_name: 'X', artist_name: 'x', thumbnail: 't', newest_epi: '1' }],
    });
    const wrapper = mount(SearchPage, { global: { stubs } });
    const vm = wrapper.vm as unknown as {
      search: string;
      sendOut: () => Promise<void>;
      isSearch: boolean;
      searchList: unknown[];
    };
    vm.search = 'naruto';
    await vm.sendOut();
    expect(mockSearch).toHaveBeenCalledWith('naruto');
    expect(vm.isSearch).toBe(true);
    expect(vm.searchList).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd frontend; npm run test -- --run SearchPage`
Expected: FAIL（当前 SearchPage 是占位 div，无搜索逻辑）。

- [ ] **Step 3: 实现 `frontend/src/views/SearchPage.vue`**
```vue
<script setup lang="ts">
import { ref } from 'vue';
import { ElMessageBox } from 'element-plus';
import { Search, Box } from '@element-plus/icons-vue';
import { OverlayScrollbarsComponent } from 'overlayscrollbars-vue';
import 'overlayscrollbars/overlayscrollbars.css';
import VBotton from '@/components/VBotton.vue';
import DocumentList from '@/components/DocumentList.vue';
import MobileCardList from '@/components/MobileCardList.vue';
import { useAppStore } from '@/stores/app';
import { useShake } from '@/composables/useShake';
import { searchManga } from '@/api/dogemanga';
import { showLoading, notifyError } from '@/utils/ui';
import type { MangaSearchResult } from '@/types/manga';

const store = useAppStore();
const { shake } = useShake();

const search = ref('');
const searchList = ref<MangaSearchResult[]>([]);
const isSearch = ref(false);
const emptyError = ref(false);
const searchBox = ref<HTMLElement | null>(null);

defineExpose({ search, searchList, isSearch, emptyError, sendOut });

async function sendOut(): Promise<void> {
  if (!search.value) {
    emptyError.value = true;
    shake(searchBox.value);
    return;
  }
  emptyError.value = false;
  isSearch.value = false;
  const loading = showLoading('正在加载中...');
  try {
    const res = await searchManga(search.value);
    loading.close();
    if (res.code === 200) {
      // 整体替换（修复旧 push 累积 bug）
      searchList.value = res.data;
      isSearch.value = true;
    } else if (res.code === 456) {
      emptyError.value = true;
      shake(searchBox.value);
    } else if (res.code === 457) {
      notifyError('搜索出现问题', `${search.value} 无法在对应网站源搜索到结果`);
    }
  } catch {
    loading.close();
    isSearch.value = false;
    notifyError('搜索失败', '漫画搜索出现未知问题，请联系管理员！');
  }
}

function handleScan(): void {
  ElMessageBox.prompt('请输入暗码', '仅管理员可以操作', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    inputPattern: /^[A-Za-z0-9]{16}$/,
    inputErrorMessage: '暗码错误，无法认证管理员身份，无法进行该危险操作！',
  })
    .then(() => {
      notifyError('该功能暂不开放', '该功能暂不开放');
    })
    .catch(() => {
      /* 用户取消 */
    });
}
</script>

<template>
  <!-- 桌面 -->
  <div v-if="!store.isPhone" class="searchStage">
    <div class="searchArea">
      <div class="globalSearch">
        <div ref="searchBox" class="searchBox">
          <el-input
            v-model="search"
            size="small"
            class="searchBoxInput"
            :class="{ inputError: emptyError }"
            placeholder="输入漫画名，将在现有源中搜索"
            @keyup.enter="sendOut"
          />
        </div>
        <transition name="password-error">
          <el-alert
            v-show="emptyError"
            title="搜索内容不能为空！"
            type="error"
            show-icon
            :closable="false"
            class="errorMsgs"
          />
        </transition>
      </div>
      <VBotton label="搜索" class="searchButton" @click="sendOut">
        <template #icon><el-icon><Search /></el-icon></template>
      </VBotton>
      <VBotton label="扫描" class="searchButton" @click="handleScan">
        <template #icon><el-icon><Box /></el-icon></template>
      </VBotton>
    </div>
    <OverlayScrollbarsComponent class="listArea" :options="{ scrollbars: { autoHide: 'leave' }, overflow: { x: 'hidden' } }" defer>
      <DocumentList v-if="isSearch" class="cardPage" :search-list="searchList" />
    </OverlayScrollbarsComponent>
  </div>
  <!-- 移动 -->
  <div v-else class="mobileSearchStage">
    <van-search
      v-model="search"
      shape="round"
      placeholder="输入漫画名，将在现有源中搜索"
      @search="sendOut"
    />
    <div class="mobileCardListShell">
      <MobileCardList v-if="isSearch" :search-list="searchList" />
    </div>
  </div>
</template>

<style scoped>
/* 从旧 frontend_src/vanmanga/src/views/SearchPage.vue 的 <style scoped> 原样复制：
   .searchStage / .searchArea / .globalSearch / .searchBox / .listArea / .errorMsgs /
   .mobileSearchStage / .mobileCardListShell / .password-error-* 过渡 / @keyframes shaking 等。
   旧 `.searchBox /deep/ .el-input__inner` → `.searchBox :deep(.el-input__inner)`，
   `.searchBox /deep/ .el-input` → `.searchBox :deep(.el-input)`。
   新增一条 .inputError:deep(.el-input__inner){ background-color:#fbc4c4; } 以承接旧 errorDealing 的输入框染红。
   若旧文件无 @keyframes shaking 定义（动效靠 .password-error-enter-active），保持原样。 */
</style>
```

> Step 3 要点：
> - `defineExpose` 暴露 `search/searchList/isSearch/emptyError/sendOut` 供测试访问。
> - 旧模板 `prefix-icon="el-icon-search"` 去掉（element-plus 改用 `:prefix-icon` 组件，可省略，不影响逻辑）。`@keyup.enter.native` → `@keyup.enter`。
> - `OverlayScrollbarsComponent` 来自已安装的 `overlayscrollbars-vue`；样式 `overlayscrollbars/overlayscrollbars.css` 已引入。
> - 旧 scoped 样式里 `/deep/` 两处改 `:deep()`；其余原样照搬。

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd frontend; npm run test -- --run SearchPage`
Expected: PASS（4 个用例）。

- [ ] **Step 5: 全量回归 + 类型 + 构建**

Run: `cd frontend; npm run test` → 期望全绿。
Run: `cd frontend; npx vue-tsc --noEmit` → 期望无错误。
Run: `cd frontend; npm run build` → 期望成功。

- [ ] **Step 6: 提交**
```
git add frontend/src/views/SearchPage.vue frontend/src/views/SearchPage.spec.ts
git commit -m "feat(frontend): SearchPage (search + submit, desktop/mobile)"
```
结尾加 Co-Authored-By 行。

---

## 完成标准（Plan 2b）

- `useShake`（输入校验动效）、`useSubmitSelection`（提交逻辑，**新 200/'submitted'·200/'already-in-library'·409/{duplicates} 契约**）就位并有单测。
- `VBotton`、`Document`、`DocumentList`、`MobileCardList` 组件迁移完成并有渲染/事件测试。
- `SearchPage` 完成桌面（el-input + 双 VBotton + DocumentList）/移动（van-search + MobileCardList）外壳与搜索逻辑（200/456/457 + 空校验抖动），重复搜索不再累积结果。
- 点击搜索结果卡片 → 确认弹窗 → 提交；命中 409 走二次确认并以 `submit_sign='1'` 重提交；成功后 `inject('reload')` 刷新。
- `npm run test` 全绿、`npx vue-tsc --noEmit` 无错、`npm run build` 通过。

## 后续（不在本计划内）

- **Plan 2c**：MangaKu（el-table + 移动卡片）+ MangaReloadForm/MobileMangaReloadForm/VanFieldCheckbox + 删除（已去 pwd）/开关/重下载 + socket `response`/`complete_info`/`downloading_info` 实时更新（载荷已在后端对齐为 `{manga_id,last_epi_name,last_epi}` / `{manga_id}` / 裸 `manga_id`）。
- **Plan 2d**：KavitaCheckPage（登录/状态/localStorage/自动登录 iframe）。
- 清理旧 `frontend_src/`、`frontend_static/`（Plan 3）。
