# 前端 Plan 2a：应用外壳 + 数据层 实现计划（Plan 2 系列 1/4）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把旧 Vue2 前端的"应用外壳"（App 初始化、MainPage 桌面/移动布局、公告、收起按钮）和"共享数据层"（领域类型、dogemanga/kavita 接口封装、响应式 store 同步、UI 服务封装、socket 连接 + 全盘扫描完成通知）重写进新的 `frontend/`（Vue3 + TS）。

**Architecture:** 业务逻辑用 `<script setup lang="ts">` + composables 取代旧的 Options API + mixins；vuex → Pinia（已就位）；element-ui 全局服务（`$loading/$message/$notify/$msgbox`）→ element-plus 的 `ElLoading/ElMessage/ElNotification/ElMessageBox` 具名导入；vant2 的 `Notify/Dialog` → vant4 函数式 `showNotify/showConfirmDialog/showLoadingToast`；`this.$http` → `api/*` 具名封装（基于已存在的 `api/http.ts`）；socket 从"被注释禁用"改为真正连接（基于已存在的 `composables/useSocket.ts`）。页面 body 仍是占位，由 Plan 2b–2d 填充。

**Tech Stack:** Vue 3.5、TypeScript、Pinia、vue-router 4、element-plus 2、vant 4、axios、socket.io-client、Vitest + @vue/test-utils。

**配套规格：** `docs/superpowers/specs/2026-06-06-frontend-vue3-rewrite-unified-build-design.md`（第 6/8/9 节）
**前置：** Plan 1（地基）已完成 —— `frontend/` 已有 router 骨架、Pinia `useAppStore`、`api/http.ts`、`composables/useSocket.ts`、element-plus/vant 已注册、占位 views 存在。

---

## 迁移约定（所有 Plan 2 子计划共同遵守）

旧源码在 `frontend_src/vanmanga/src/`（只读参考，不修改）。重写时统一执行这些机械转换：

1. **组件风格**：Options API → `<script setup lang="ts">`。`data()` → `ref/reactive`；`methods` → 普通函数；`computed` → `computed()`；`watch` → `watch()`；`mounted` → `onMounted`；`mixins` → 导入 composable/工具函数。
2. **状态**：`this.$store.state.isPhone` → `useAppStore().isPhone`；`this.$store.commit("updateIsPhone", v)` → `store.setIsPhone(v)`；`updateIsLoginAlready` → `store.setIsLogin`。
3. **HTTP**：`this.$http.get("dogemanga/search", {params})` → `import { searchManga } from '@/api/dogemanga'`。接口层返回 `{ code, data }` 信封，调用方按 `code` 分支（与旧逻辑一致）。
4. **element-plus 全局服务**（桌面）：
   - `this.$loading({...})` → `ElLoading.service({...})`（返回的实例有 `.close()`）。
   - `this.$message.error(msg)` → `ElMessage.error(msg)`。
   - `this.$notify({title,message,type,position})` → `ElNotification({title,message,type,position})`。
   - `this.$confirm(msg,title,{...})` / `this.$msgbox({...})` → `ElMessageBox.confirm(...)` / `ElMessageBox({...})`。`dangerouslyUseHTMLString: true` 保留。
   - 图标：旧 `spinner: 'el-icon-loading'` 在 element-plus 中改用默认 loading（去掉 `spinner`/`el-icon-*` 字符串，element-plus 默认即转圈）。
5. **vant4 全局服务**（移动）：`import { showNotify, showConfirmDialog, showLoadingToast, closeToast } from 'vant'` 及 `'vant/es/notify/style'` 等样式（vant4 全量注册已在 main.ts，无需逐个引样式）。`Notify({type:'danger',message})` → `showNotify({ type: 'danger', message })`；`this.$dialog.confirm({...})` → `showConfirmDialog({...})`（`allowHtml` 保留）。
6. **模板插槽**：`slot="title"` / `slot-scope="scope"` / `v-slot:default="scope"` → Vue3 `#title` / `v-slot:default="scope"`（element-plus 用具名插槽 `#default="scope"`）。`:visible.sync="x"` → `v-model="x"`。`.native` 修饰符去掉（如 `@keyup.enter.native` → `@keyup.enter`）。
7. **scoped 样式深度选择器**：`/deep/ X` 和 `>>> X` 和 `::v-deep X` → `:deep(X)`。其余 CSS 原样照搬（规格第 8/12 节：外观仅按 UI 库差异做最小适配）。
8. **静态资源**：`src="../assets/xxx.png"` 在 `<script setup>` 中 `import xxx from '@/assets/xxx.png'` 再 `:src="xxx"`；`require('/node_modules/bootstrap-icons/...svg')` → `import icon from 'bootstrap-icons/...svg'`（或用 vant/element 图标替代，见具体任务）。
9. **资源迁移**：旧 `src/assets/`（图片/字体）按需复制到 `frontend/src/assets/`。本计划只复制本计划用到的资源（logo 等），其余留给后续子计划。
10. **`provide/inject` 的 reload**：旧 MainPage `provide({reload})` + 子页面 `this.$emit("reload")`。Vue3 改用 `provide('reload', reloadFn)` + 页面 `inject('reload')`。

> 注意：本计划**不引入** `frontend_src` 的运行时依赖，只把它当只读蓝本照抄业务逻辑与样式。

---

## 接口与 socket 事件清单（全 Plan 2 共用，本计划建立接口层）

**dogemanga（`/api/dogemanga/*`）：**

| 函数 | 方法 路径 | 入参 | 返回信封 `{code,data}` 关注码 |
|---|---|---|---|
| `searchManga` | GET `dogemanga/search` | `?manga_name=` | 200(data: SearchResult[]) / 456 / 457 |
| `confirmSelection` | POST `dogemanga/confirm` | `{manga_object, submit_sign}` | 200 / 410 / 411(data: 重复信息) |
| `fetchLibrary` | POST `dogemanga/lib` | 无 | 200(data: Manga[]) |
| `fetchCurrentDownload` | GET `dogemanga/cdl` | 无 | 200(data: manga_id) |
| `deleteManga` | DELETE `dogemanga/deletemanga` | body `{manga_id, pwd}` | 200 / 401 / 500 |
| `toggleDownloadSwitch` | POST `dogemanga/downloadswitch` | `{manga_id}` | 200(data.currentDownloadStatus) / 424 |
| `redownload` | POST `dogemanga/redownload` | `{manga_id, selected_array: JSON 字符串}` | 200 |
| `fetchChapters` | GET `dogemanga/confirmmanga` | `?manga_id=` | 200(data: Chapter[]) / 501 |

**kavita（`/api/kavita/*`）：**

| 函数 | 方法 路径 | 入参 | 关注码 |
|---|---|---|---|
| `kavitaLogin` | POST `kavita/login` | `{username, password}` | 200(data.apiKey) / 434 / 500 |
| `kavitaStatus` | GET `kavita/status` | 无 | 200 / 404 |

**socket（服务端→客户端）：**

| 事件 | 载荷 | 用处（计划） |
|---|---|---|
| `scan_completed` | 无 | 全盘扫描完成通知（MainPage，本计划） |
| `response` | `{manga_id, last_epi_name, last_epi}` | 更新库内某行最新话（MangaKu，Plan 2c） |
| `complete_info` | `{manga_id}` | 某漫画全部下载完成通知（Plan 2c） |
| `downloading_info` | `manga_id`（原始值） | 某漫画开始抓取通知（Plan 2c） |

---

## 文件结构总览（本计划）

新建：
- `frontend/src/types/manga.ts` — 领域类型（Manga / MangaSearchResult / Chapter / ApiEnvelope / DownloadSwitchData）
- `frontend/src/api/dogemanga.ts` — dogemanga 接口封装 + 测试
- `frontend/src/api/kavita.ts` — kavita 接口封装 + 测试
- `frontend/src/composables/useResponsive.ts` — 监听 resize 同步 `store.isPhone` + 测试
- `frontend/src/utils/ui.ts` — 桌面/移动统一的 notify/loading/messagebox 封装 + 测试
- `frontend/src/components/Announcement.vue` — 公告（el-dialog）+ 渲染测试
- `frontend/src/components/VPullButton.vue` — 侧栏收起按钮 + emit 测试
- `frontend/src/assets/nativeLogo.png` — 从旧源复制
- 各测试 `*.spec.ts`

修改：
- `frontend/src/App.vue` — 初始化（responsive、服务器检查、自动登录）
- `frontend/src/views/MainPage.vue` — 桌面/移动外壳布局 + provide reload + socket scan_completed
- `frontend/src/main.ts` —（仅当需要全局引入 element-plus 的 `ElMessage` 等样式时）— 见 Task 5 说明，通常无需改

---

## Task 1: 领域类型 `types/manga.ts`

**Files:**
- Create: `frontend/src/types/manga.ts`

> 纯类型文件，无运行时逻辑，不做 TDD；以"构建通过 + 被后续任务引用"为验证。字段依据旧源码实际用法（MangaKu el-table 列、search 结果、confirmmanga 章节）。

- [ ] **Step 1: 创建 `frontend/src/types/manga.ts`**
```typescript
/** 后端统一返回信封：{ code, data }。调用方按 code 分支。 */
export interface ApiEnvelope<T = unknown> {
  code: number;
  data: T;
}

/** 搜索结果项（dogemanga/search 返回，thumbnail 为 base64 原文）。 */
export interface MangaSearchResult {
  manga_id: number;
  manga_name: string;
  artist_name: string;
  thumbnail: string;
  newest_epi: string;
}

/** 漫画库项（dogemanga/lib 返回）。completed 为前端瞬时 UI 标记。 */
export interface Manga {
  manga_id: number;
  manga_name: string;
  artist_name: string;
  thumbnail: string;
  last_epi_name: string;
  last_epi: number | string;
  serialization: number; // 0 = 未完结，其他 = 已完结
  download_switch: number; // 0 = 更新检查开启
  add_date: number; // unix 秒
  kavita_url: string;
  completed?: number | boolean; // 前端瞬时标记，非后端字段
}

/** 章节项（dogemanga/confirmmanga 返回）。 */
export interface Chapter {
  chapter_title: string;
  chapter_link: string;
}

/** downloadswitch 成功返回的 data。 */
export interface DownloadSwitchData {
  currentDownloadStatus: number;
}

/** kavita/login 成功返回的 data。 */
export interface KavitaLoginData {
  apiKey: string;
}
```

- [ ] **Step 2: 验证类型编译通过**

Run: `cd frontend; npx vue-tsc --noEmit`
Expected: 无错误（新文件未被任何代码引用，纯声明，应通过）。

- [ ] **Step 3: 提交**
```
git add frontend/src/types/manga.ts
git commit -m "feat(frontend): manga domain types"
```
提交信息结尾加：

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

---

## Task 2: dogemanga 接口封装 `api/dogemanga.ts`（TDD）

**Files:**
- Create: `frontend/src/api/dogemanga.ts`
- Test: `frontend/src/api/dogemanga.spec.ts`

> 基于已存在的 `@/api/http`（axios 实例，baseURL `/api`）。每个函数返回 `res.data`（即后端的 `{code,data}` 信封）。测试用 `vi.mock('@/api/http')` 桩掉 http，断言"调用了正确的 method/url/params/body"并"原样返回信封"。

- [ ] **Step 1: 写失败测试 `frontend/src/api/dogemanga.spec.ts`**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/api/http', () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import { http } from '@/api/http';
import {
  searchManga,
  confirmSelection,
  fetchLibrary,
  fetchCurrentDownload,
  deleteManga,
  toggleDownloadSwitch,
  redownload,
  fetchChapters,
} from './dogemanga';

const mockGet = http.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = http.post as unknown as ReturnType<typeof vi.fn>;
const mockDelete = http.delete as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockDelete.mockReset();
});

describe('dogemanga api', () => {
  it('searchManga GETs /search with manga_name param and returns envelope', async () => {
    mockGet.mockResolvedValue({ data: { code: 200, data: [{ manga_id: 1 }] } });
    const res = await searchManga('naruto');
    expect(mockGet).toHaveBeenCalledWith('dogemanga/search', {
      params: { manga_name: 'naruto' },
    });
    expect(res).toEqual({ code: 200, data: [{ manga_id: 1 }] });
  });

  it('confirmSelection POSTs /confirm with manga_object and submit_sign', async () => {
    mockPost.mockResolvedValue({ data: { code: 200, data: null } });
    const manga = { manga_id: 1 } as never;
    await confirmSelection(manga, '0');
    expect(mockPost).toHaveBeenCalledWith('dogemanga/confirm', {
      manga_object: manga,
      submit_sign: '0',
    });
  });

  it('fetchLibrary POSTs /lib', async () => {
    mockPost.mockResolvedValue({ data: { code: 200, data: [] } });
    await fetchLibrary();
    expect(mockPost).toHaveBeenCalledWith('dogemanga/lib');
  });

  it('fetchCurrentDownload GETs /cdl', async () => {
    mockGet.mockResolvedValue({ data: { code: 200, data: 7 } });
    const res = await fetchCurrentDownload();
    expect(mockGet).toHaveBeenCalledWith('dogemanga/cdl');
    expect(res.data).toBe(7);
  });

  it('deleteManga DELETEs /deletemanga with body in config.data', async () => {
    mockDelete.mockResolvedValue({ data: { code: 200, data: null } });
    await deleteManga(3, 'SECRETCODE0000001');
    expect(mockDelete).toHaveBeenCalledWith('dogemanga/deletemanga', {
      data: { manga_id: 3, pwd: 'SECRETCODE0000001' },
    });
  });

  it('toggleDownloadSwitch POSTs /downloadswitch with manga_id', async () => {
    mockPost.mockResolvedValue({
      data: { code: 200, data: { currentDownloadStatus: 1 } },
    });
    const res = await toggleDownloadSwitch(5);
    expect(mockPost).toHaveBeenCalledWith('dogemanga/downloadswitch', {
      manga_id: 5,
    });
    expect(res.data.currentDownloadStatus).toBe(1);
  });

  it('redownload POSTs /redownload with selected_array JSON-stringified', async () => {
    mockPost.mockResolvedValue({ data: { code: 200, data: null } });
    const chapters = [{ chapter_title: 'c1', chapter_link: 'l1' }];
    await redownload(9, chapters);
    expect(mockPost).toHaveBeenCalledWith('dogemanga/redownload', {
      manga_id: 9,
      selected_array: JSON.stringify(chapters),
    });
  });

  it('fetchChapters GETs /confirmmanga with manga_id param', async () => {
    mockGet.mockResolvedValue({ data: { code: 200, data: [] } });
    await fetchChapters(4);
    expect(mockGet).toHaveBeenCalledWith('dogemanga/confirmmanga', {
      params: { manga_id: 4 },
    });
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd frontend; npm run test -- dogemanga`
Expected: FAIL（`./dogemanga` 未创建）。

- [ ] **Step 3: 实现 `frontend/src/api/dogemanga.ts`**
```typescript
import { http } from '@/api/http';
import type {
  ApiEnvelope,
  Chapter,
  DownloadSwitchData,
  Manga,
  MangaSearchResult,
} from '@/types/manga';

/** 在现有源中搜索漫画。 */
export async function searchManga(
  mangaName: string,
): Promise<ApiEnvelope<MangaSearchResult[]>> {
  const res = await http.get('dogemanga/search', {
    params: { manga_name: mangaName },
  });
  return res.data;
}

/**
 * 确认并提交一部漫画下载。
 * submit_sign: '0' 普通提交（可能触发 411 重复确认）；'1' 强制添加。
 */
export async function confirmSelection(
  mangaObject: MangaSearchResult,
  submitSign: '0' | '1',
): Promise<ApiEnvelope<unknown>> {
  const res = await http.post('dogemanga/confirm', {
    manga_object: mangaObject,
    submit_sign: submitSign,
  });
  return res.data;
}

/** 获取漫画库列表。 */
export async function fetchLibrary(): Promise<ApiEnvelope<Manga[]>> {
  const res = await http.post('dogemanga/lib');
  return res.data;
}

/** 获取当前正在下载的漫画 id。 */
export async function fetchCurrentDownload(): Promise<ApiEnvelope<number>> {
  const res = await http.get('dogemanga/cdl');
  return res.data;
}

/** 删除漫画（需管理员暗码）。 */
export async function deleteManga(
  mangaId: number,
  pwd: string,
): Promise<ApiEnvelope<unknown>> {
  const res = await http.delete('dogemanga/deletemanga', {
    data: { manga_id: mangaId, pwd },
  });
  return res.data;
}

/** 切换漫画的自动更新检查开关。 */
export async function toggleDownloadSwitch(
  mangaId: number,
): Promise<ApiEnvelope<DownloadSwitchData>> {
  const res = await http.post('dogemanga/downloadswitch', {
    manga_id: mangaId,
  });
  return res.data;
}

/** 重新下载选中的章节。 */
export async function redownload(
  mangaId: number,
  selectedChapters: Chapter[],
): Promise<ApiEnvelope<unknown>> {
  const res = await http.post('dogemanga/redownload', {
    manga_id: mangaId,
    selected_array: JSON.stringify(selectedChapters),
  });
  return res.data;
}

/** 获取某漫画可重新下载的章节列表。 */
export async function fetchChapters(
  mangaId: number,
): Promise<ApiEnvelope<Chapter[]>> {
  const res = await http.get('dogemanga/confirmmanga', {
    params: { manga_id: mangaId },
  });
  return res.data;
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd frontend; npm run test -- dogemanga`
Expected: PASS（8 个用例）。

- [ ] **Step 5: 提交**
```
git add frontend/src/api/dogemanga.ts frontend/src/api/dogemanga.spec.ts
git commit -m "feat(frontend): dogemanga api module (TDD)"
```
结尾加 Co-Authored-By 行（同上）。

---

## Task 3: kavita 接口封装 `api/kavita.ts`（TDD）

**Files:**
- Create: `frontend/src/api/kavita.ts`
- Test: `frontend/src/api/kavita.spec.ts`

- [ ] **Step 1: 写失败测试 `frontend/src/api/kavita.spec.ts`**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/api/http', () => ({
  http: { get: vi.fn(), post: vi.fn() },
}));

import { http } from '@/api/http';
import { kavitaLogin, kavitaStatus } from './kavita';

const mockGet = http.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = http.post as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
});

describe('kavita api', () => {
  it('kavitaLogin POSTs /kavita/login with username and password', async () => {
    mockPost.mockResolvedValue({
      data: { code: 200, data: { apiKey: 'abc' } },
    });
    const res = await kavitaLogin('u', 'p');
    expect(mockPost).toHaveBeenCalledWith('kavita/login', {
      username: 'u',
      password: 'p',
    });
    expect(res.data.apiKey).toBe('abc');
  });

  it('kavitaStatus GETs /kavita/status', async () => {
    mockGet.mockResolvedValue({ data: { code: 200, data: null } });
    const res = await kavitaStatus();
    expect(mockGet).toHaveBeenCalledWith('kavita/status');
    expect(res.code).toBe(200);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd frontend; npm run test -- kavita`
Expected: FAIL（`./kavita` 未创建）。

- [ ] **Step 3: 实现 `frontend/src/api/kavita.ts`**
```typescript
import { http } from '@/api/http';
import type { ApiEnvelope, KavitaLoginData } from '@/types/manga';

/** 登录 Kavita 账户，成功返回 apiKey。 */
export async function kavitaLogin(
  username: string,
  password: string,
): Promise<ApiEnvelope<KavitaLoginData>> {
  const res = await http.post('kavita/login', { username, password });
  return res.data;
}

/** 检查服务器 Kavita 配置状态。 */
export async function kavitaStatus(): Promise<ApiEnvelope<unknown>> {
  const res = await http.get('kavita/status');
  return res.data;
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd frontend; npm run test -- kavita`
Expected: PASS（2 个用例）。

- [ ] **Step 5: 提交**
```
git add frontend/src/api/kavita.ts frontend/src/api/kavita.spec.ts
git commit -m "feat(frontend): kavita api module (TDD)"
```
结尾加 Co-Authored-By 行。

---

## Task 4: 响应式同步 `composables/useResponsive.ts`（TDD）

**Files:**
- Create: `frontend/src/composables/useResponsive.ts`
- Test: `frontend/src/composables/useResponsive.spec.ts`

> 取代旧 App.vue 的 resize 监听 + 初始判断。断点 993（与 Plan 1 store 默认一致）。挂载时立即按当前宽度设一次，并监听 `resize`；卸载时移除监听。`useAppStore().setIsPhone(...)`。

- [ ] **Step 1: 写失败测试 `frontend/src/composables/useResponsive.spec.ts`**
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAppStore } from '@/stores/app';
import { useResponsive } from './useResponsive';

function setWidth(px: number) {
  Object.defineProperty(document.documentElement, 'clientWidth', {
    value: px,
    configurable: true,
  });
}

describe('useResponsive', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('sets isPhone=true immediately when width < 993', () => {
    setWidth(500);
    const store = useAppStore();
    const stop = useResponsive();
    expect(store.isPhone).toBe(true);
    stop();
  });

  it('sets isPhone=false immediately when width >= 993', () => {
    setWidth(1200);
    const store = useAppStore();
    const stop = useResponsive();
    expect(store.isPhone).toBe(false);
    stop();
  });

  it('updates store on window resize', () => {
    setWidth(1200);
    const store = useAppStore();
    const stop = useResponsive();
    expect(store.isPhone).toBe(false);
    setWidth(400);
    window.dispatchEvent(new Event('resize'));
    expect(store.isPhone).toBe(true);
    stop();
  });

  it('stop() removes the resize listener', () => {
    setWidth(1200);
    const store = useAppStore();
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const stop = useResponsive();
    stop();
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    removeSpy.mockRestore();
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd frontend; npm run test -- useResponsive`
Expected: FAIL（`./useResponsive` 未创建）。

- [ ] **Step 3: 实现 `frontend/src/composables/useResponsive.ts`**
```typescript
import { onUnmounted } from 'vue';
import { useAppStore } from '@/stores/app';

const PHONE_BREAKPOINT = 993;

/**
 * 把视口宽度同步到 app store 的 isPhone。
 * 挂载即生效；返回 stop() 以手动停止（onUnmounted 也会自动停止）。
 * 在组件 setup 内调用时自动注册 onUnmounted；脱离组件调用时请手动 stop()。
 */
export function useResponsive(): () => void {
  const store = useAppStore();

  const apply = (): void => {
    store.setIsPhone(document.documentElement.clientWidth < PHONE_BREAKPOINT);
  };

  apply();
  window.addEventListener('resize', apply);

  const stop = (): void => {
    window.removeEventListener('resize', apply);
  };

  // 在组件上下文中调用时自动清理；否则该调用是 no-op。
  try {
    onUnmounted(stop);
  } catch {
    // 非组件上下文（如测试/手动调用）——忽略，交由 stop() 手动清理。
  }

  return stop;
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd frontend; npm run test -- useResponsive`
Expected: PASS（4 个用例）。

- [ ] **Step 5: 提交**
```
git add frontend/src/composables/useResponsive.ts frontend/src/composables/useResponsive.spec.ts
git commit -m "feat(frontend): useResponsive composable (TDD)"
```
结尾加 Co-Authored-By 行。

---

## Task 5: UI 服务封装 `utils/ui.ts`（TDD）

**Files:**
- Create: `frontend/src/utils/ui.ts`
- Test: `frontend/src/utils/ui.spec.ts`

> 把"桌面用 element-plus、移动用 vant"的分支收敛到一处，供所有页面复用（DRY，规格"顺手重构"）。本计划只实现 `notifySuccess` / `notifyError` / `showLoading`（返回带 `close()` 的句柄）/ `confirmDialog`（返回 Promise，确认 resolve、取消 reject）。是否移动端由 `useAppStore().isPhone` 决定。
>
> 测试用 `vi.mock('element-plus')` 与 `vi.mock('vant')` 桩掉两套库，断言按 isPhone 走对分支。

- [ ] **Step 1: 写失败测试 `frontend/src/utils/ui.spec.ts`**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const elNotification = vi.fn();
const elMessageError = vi.fn();
const elLoadingService = vi.fn(() => ({ close: vi.fn() }));
const elMessageBoxConfirm = vi.fn(() => Promise.resolve());

vi.mock('element-plus', () => ({
  ElNotification: (opts: unknown) => elNotification(opts),
  ElMessage: { error: (m: unknown) => elMessageError(m) },
  ElLoading: { service: (opts: unknown) => elLoadingService(opts) },
  ElMessageBox: { confirm: (...a: unknown[]) => elMessageBoxConfirm(...a) },
}));

const showNotify = vi.fn();
const showLoadingToast = vi.fn(() => ({ close: vi.fn() }));
const showConfirmDialog = vi.fn(() => Promise.resolve());
const closeToast = vi.fn();

vi.mock('vant', () => ({
  showNotify: (opts: unknown) => showNotify(opts),
  showLoadingToast: (opts: unknown) => showLoadingToast(opts),
  showConfirmDialog: (opts: unknown) => showConfirmDialog(opts),
  closeToast: () => closeToast(),
}));

import { useAppStore } from '@/stores/app';
import { notifySuccess, notifyError, showLoading, confirmDialog } from './ui';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('ui helpers — desktop (isPhone=false)', () => {
  beforeEach(() => {
    useAppStore().setIsPhone(false);
  });

  it('notifySuccess uses ElNotification', () => {
    notifySuccess('t', 'm');
    expect(elNotification).toHaveBeenCalledTimes(1);
    expect(showNotify).not.toHaveBeenCalled();
  });

  it('notifyError uses ElNotification', () => {
    notifyError('t', 'm');
    expect(elNotification).toHaveBeenCalledTimes(1);
  });

  it('showLoading uses ElLoading.service and returns a closeable handle', () => {
    const h = showLoading('loading...');
    expect(elLoadingService).toHaveBeenCalledTimes(1);
    expect(typeof h.close).toBe('function');
  });

  it('confirmDialog uses ElMessageBox.confirm', async () => {
    await confirmDialog({ title: 't', message: 'm' });
    expect(elMessageBoxConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('ui helpers — mobile (isPhone=true)', () => {
  beforeEach(() => {
    useAppStore().setIsPhone(true);
  });

  it('notifySuccess uses vant showNotify', () => {
    notifySuccess('t', 'm');
    expect(showNotify).toHaveBeenCalledTimes(1);
    expect(elNotification).not.toHaveBeenCalled();
  });

  it('showLoading uses vant showLoadingToast', () => {
    const h = showLoading('loading...');
    expect(showLoadingToast).toHaveBeenCalledTimes(1);
    expect(typeof h.close).toBe('function');
  });

  it('confirmDialog uses vant showConfirmDialog', async () => {
    await confirmDialog({ title: 't', message: 'm' });
    expect(showConfirmDialog).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd frontend; npm run test -- utils/ui`
Expected: FAIL（`./ui` 未创建）。

- [ ] **Step 3: 实现 `frontend/src/utils/ui.ts`**
```typescript
import {
  ElLoading,
  ElMessage,
  ElMessageBox,
  ElNotification,
} from 'element-plus';
import {
  showNotify,
  showLoadingToast,
  showConfirmDialog,
  closeToast,
} from 'vant';
import { useAppStore } from '@/stores/app';

/** 可关闭的加载句柄（统一桌面/移动）。 */
export interface LoadingHandle {
  close: () => void;
}

/** 确认弹窗参数。allowHtml 时 message 作为 HTML 渲染。 */
export interface ConfirmOptions {
  title: string;
  message: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  allowHtml?: boolean;
}

function isPhone(): boolean {
  return useAppStore().isPhone;
}

/** 成功通知（桌面右下角 ElNotification / 移动 vant Notify）。 */
export function notifySuccess(title: string, message: string): void {
  if (isPhone()) {
    showNotify({ type: 'success', message });
  } else {
    ElNotification({ title, message, type: 'success', position: 'bottom-right' });
  }
}

/** 错误通知。 */
export function notifyError(title: string, message: string): void {
  if (isPhone()) {
    showNotify({ type: 'danger', message });
  } else {
    ElNotification({ title, message, type: 'error', position: 'bottom-right' });
  }
}

/** 全屏加载，返回可 close 的句柄。 */
export function showLoading(text: string): LoadingHandle {
  if (isPhone()) {
    showLoadingToast({ message: text, forbidClick: true, duration: 0 });
    return { close: () => closeToast() };
  }
  const instance = ElLoading.service({
    lock: true,
    text,
    background: 'rgba(0, 0, 0, 0.7)',
  });
  return { close: () => instance.close() };
}

/** 确认弹窗：确认 resolve，取消 reject。 */
export function confirmDialog(opts: ConfirmOptions): Promise<unknown> {
  if (isPhone()) {
    return showConfirmDialog({
      title: opts.title,
      message: opts.message,
      allowHtml: opts.allowHtml,
      confirmButtonText: opts.confirmButtonText,
      cancelButtonText: opts.cancelButtonText,
    });
  }
  return ElMessageBox.confirm(opts.message, opts.title, {
    dangerouslyUseHTMLString: opts.allowHtml,
    confirmButtonText: opts.confirmButtonText ?? '确定',
    cancelButtonText: opts.cancelButtonText ?? '取消',
  });
}

/** 直接暴露 element-plus 的错误条（少数场景用，桌面/移动通用兜底）。 */
export function messageError(message: string): void {
  if (isPhone()) {
    showNotify({ type: 'danger', message });
  } else {
    ElMessage.error(message);
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd frontend; npm run test -- utils/ui`
Expected: PASS（7 个用例）。

- [ ] **Step 5: 验证整体测试与构建**

Run: `cd frontend; npm run test` → 期望所有已有测试仍全绿。
Run: `cd frontend; npm run build` → 期望成功。

- [ ] **Step 6: 提交**
```
git add frontend/src/utils/ui.ts frontend/src/utils/ui.spec.ts
git commit -m "feat(frontend): responsive UI service helpers (TDD)"
```
结尾加 Co-Authored-By 行。

---

## Task 6: 复制 logo 资源 + 公告组件 `components/Announcement.vue`

**Files:**
- Create: `frontend/src/assets/nativeLogo.png`（从 `frontend_src/vanmanga/src/assets/nativeLogo.png` 复制）
- Create: `frontend/src/components/Announcement.vue`
- Test: `frontend/src/components/Announcement.spec.ts`

> 公告是一个悬浮图标 + 点击弹出 el-dialog 的纯展示组件。旧版用 `require(bootstrap-icons.svg)#exclamation-circle` 画图标——重写改用 element-plus 的 `<el-icon>` + `@element-plus/icons-vue` 的 `WarningFilled` 图标，避免引 bootstrap-icons 整包 svg（element-plus 图标已随 UI 库可用；若 `@element-plus/icons-vue` 未安装则先安装：见 Step 0）。`:visible.sync` → `v-model`。弹窗正文（版本/作者等中文段落）原样照搬旧 `Announcement.vue` 模板内的文字。

- [ ] **Step 0: 确认/安装图标包**

Run: `cd frontend; node -e "require.resolve('@element-plus/icons-vue'); console.log('present')"`
- 若打印 `present`：跳过安装。
- 若报错 Cannot find module：`cd frontend; npm install @element-plus/icons-vue@^2.3.1`（element-plus 官方图标包）。

- [ ] **Step 1: 复制 logo 资源**

Run（仓库根）:
```powershell
Copy-Item "frontend_src/vanmanga/src/assets/nativeLogo.png" "frontend/src/assets/nativeLogo.png"
```
Verify: `Test-Path frontend/src/assets/nativeLogo.png` → True。

- [ ] **Step 2: 写失败测试 `frontend/src/components/Announcement.spec.ts`**
```typescript
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
```

- [ ] **Step 3: 运行测试，确认失败**

Run: `cd frontend; npm run test -- Announcement`
Expected: FAIL（组件未创建）。

- [ ] **Step 4: 实现 `frontend/src/components/Announcement.vue`**

模板/脚本用以下内容；`<el-dialog>` 正文中的中文公告段落，从旧 `frontend_src/vanmanga/src/components/Announcement.vue` 的 `<div class="text">...</div>` 整块**原样复制**进来（保持文字一致）。`<script setup>` 暴露 `isClicked`/`isHover` 供测试访问（`defineExpose`）。
```vue
<script setup lang="ts">
import { ref } from 'vue';
import { ElIcon } from 'element-plus';
import { WarningFilled } from '@element-plus/icons-vue';

const isHover = ref(false);
const isClicked = ref(false);

function showText(): void {
  isHover.value = true;
}
function hideText(): void {
  isHover.value = false;
}
function handleClick(): void {
  isClicked.value = true;
}

defineExpose({ isHover, isClicked });
</script>

<template>
  <div
    class="announceStage"
    @mouseover="showText"
    @mouseout="hideText"
    @click="handleClick"
  >
    <el-icon id="announceIcon" :size="30" color="#ded12f">
      <WarningFilled />
    </el-icon>
    <transition name="announceShow">
      <p v-show="isHover" id="announceContent">公告</p>
    </transition>
    <el-dialog
      v-model="isClicked"
      title="Valiya-Manga 夜镇漫画 V1.0.1 公告"
      append-to-body
      top="5vh"
      width="55%"
      center
    >
      <hr />
      <div class="text">
        <!-- 从旧 Announcement.vue 的 <div class="text"> 整块原样复制中文公告段落 -->
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button type="primary" @click="isClicked = false">确 定</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* 从旧 frontend_src/vanmanga/src/components/Announcement.vue 的 <style scoped> 原样复制，
   去掉与 bootstrap-icons svg 相关的选择器（#announceIcon 的 svg 特定样式可保留无害）。 */
</style>
```

> Step 4 实现要点：把旧文件 `<div class="text">…</div>` 的全部中文段落、以及 `<style scoped>` 全部规则照搬过来（`<style scoped>` 内无 `/deep/`，可直接复制）。`el-icon` 的悬浮缩放/发光动画 `.announceStage:hover > #announceIcon` 选择器旧版针对 `svg#announceIcon`，element-plus 的 `el-icon` 会渲染成带该 id 的元素，保留即可。

- [ ] **Step 5: 运行测试，确认通过**

Run: `cd frontend; npm run test -- Announcement`
Expected: PASS（2 个用例）。

- [ ] **Step 6: 提交**
```
git add frontend/src/assets/nativeLogo.png frontend/src/components/Announcement.vue frontend/src/components/Announcement.spec.ts frontend/package.json frontend/package-lock.json
git commit -m "feat(frontend): Announcement dialog component"
```
结尾加 Co-Authored-By 行。（若 Step 0 未安装图标包，`package.json/lock` 无变化，可从 add 列表去掉。）

---

## Task 7: 侧栏收起按钮 `components/VPullButton.vue`

**Files:**
- Create: `frontend/src/components/VPullButton.vue`
- Test: `frontend/src/components/VPullButton.spec.ts`

> 纯展示 + 一个 `switchCollapse` 事件。旧版用 `bi-arrow-bar-left` 图标（bootstrap-icons 字体类）——重写用 element-plus `<el-icon><Fold/></el-icon>`（来自 `@element-plus/icons-vue`，Task 6 已确保安装）。prop `isHide` 控制旋转。

- [ ] **Step 1: 写失败测试 `frontend/src/components/VPullButton.spec.ts`**
```typescript
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
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd frontend; npm run test -- VPullButton`
Expected: FAIL（组件未创建）。

- [ ] **Step 3: 实现 `frontend/src/components/VPullButton.vue`**
```vue
<script setup lang="ts">
import { ElIcon } from 'element-plus';
import { Fold } from '@element-plus/icons-vue';

defineProps<{ isHide: boolean }>();
const emit = defineEmits<{ (e: 'switchCollapse'): void }>();

function changeHide(): void {
  emit('switchCollapse');
}
</script>

<template>
  <div id="pullButton" :class="!isHide ? '' : 'hide'" @click="changeHide">
    <div id="pullButtonBackground">
      <el-icon><Fold /></el-icon>
    </div>
  </div>
</template>

<style scoped>
/* 从旧 frontend_src/vanmanga/src/components/V-pullButton.vue 的 <style scoped> 原样复制。
   旧版图标是 <i class="bi-arrow-bar-left">；这里换成 el-icon，
   原 #pullButtonBackground>i 的样式选择器改为 #pullButtonBackground :deep(.el-icon)。 */
</style>
```

> Step 3 要点：复制旧 `<style scoped>` 全部规则；把针对 `#pullButtonBackground>i` 的那条规则的选择器改为 `#pullButtonBackground :deep(.el-icon)`（颜色/字号/过渡照搬），其余原样。旋转 `#pullButton.hide i` 改为 `#pullButton.hide :deep(.el-icon)`。

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd frontend; npm run test -- VPullButton`
Expected: PASS（2 个用例）。

- [ ] **Step 5: 提交**
```
git add frontend/src/components/VPullButton.vue frontend/src/components/VPullButton.spec.ts
git commit -m "feat(frontend): VPullButton sidebar toggle"
```
结尾加 Co-Authored-By 行。

---

## Task 8: 重写 `App.vue`（初始化：响应式 + 服务器检查 + 自动登录）

**Files:**
- Modify: `frontend/src/App.vue`
- Test: `frontend/src/App.spec.ts`

> 旧 App.vue `mounted` 做四件事：① resize 监听 → store.isPhone（改用 `useResponsive`）；② 初始 loading；③ 服务器状态检查（10 天缓存，`kavita/status`）→ 写 localStorage `serverStatus`/`serverStatusLastCheckTime`；④ 自动登录（localStorage `autoLogin`+`apiKey` → 隐藏 iframe 打 `${MANGA_BASE_URL}/login?apiKey=`）。逻辑照搬，HTTP 改用 `kavitaStatus()`，store 改用 Pinia，UI 改用 `utils/ui` + element-plus。
>
> 注意旧逻辑一个无害遗留：`serverCheckFlag` 在 `.then` 回调里赋值，但下面的"自动登录"在同步流程里读它——回调是异步的，旧代码实际上在请求未回来前就判断了 flag。重写时**保持等价行为**：把"服务器检查"与"自动登录"按旧的同步/异步时序照搬（不要"修复"成 await，以免改变可观察行为；规格要求业务等价）。为可测试性，把初始化逻辑放进一个 `initApp()` 函数并在 `onMounted` 调用。

- [ ] **Step 1: 写失败测试 `frontend/src/App.spec.ts`**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/api/kavita', () => ({
  kavitaStatus: vi.fn(() => Promise.resolve({ code: 200, data: null })),
}));
vi.mock('@/utils/ui', () => ({
  showLoading: vi.fn(() => ({ close: vi.fn() })),
  messageError: vi.fn(),
}));

import { kavitaStatus } from '@/api/kavita';
import App from './App.vue';

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  vi.clearAllMocks();
  (window as unknown as { MANGA_BASE_URL?: string }).MANGA_BASE_URL = 'http://x';
});

describe('App init', () => {
  it('renders router-view outlet', () => {
    const wrapper = mount(App, {
      global: { stubs: { 'router-view': true } },
    });
    expect(wrapper.find('#app').exists()).toBe(true);
  });

  it('checks server status when no cached serverStatus', async () => {
    mount(App, { global: { stubs: { 'router-view': true } } });
    await Promise.resolve();
    expect(kavitaStatus).toHaveBeenCalledTimes(1);
  });

  it('skips server check when fresh cache exists', async () => {
    localStorage.setItem('serverStatus', 'true');
    localStorage.setItem(
      'serverStatusLastCheckTime',
      JSON.stringify(Date.now()),
    );
    mount(App, { global: { stubs: { 'router-view': true } } });
    await Promise.resolve();
    expect(kavitaStatus).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd frontend; npm run test -- App`
Expected: FAIL（当前 App.vue 还是 Plan 1 的空壳，无 `#app`/无初始化）。

- [ ] **Step 3: 实现 `frontend/src/App.vue`**
```vue
<script setup lang="ts">
import { onMounted } from 'vue';
import { useResponsive } from '@/composables/useResponsive';
import { useAppStore } from '@/stores/app';
import { kavitaStatus } from '@/api/kavita';
import { showLoading, messageError } from '@/utils/ui';

const store = useAppStore();
useResponsive();

const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

function autoLogin(): void {
  const shouldAutoLogin = JSON.parse(
    localStorage.getItem('autoLogin') ?? 'null',
  );
  const apiKey = localStorage.getItem('apiKey');
  if (shouldAutoLogin && apiKey) {
    const iframe = document.createElement('iframe');
    iframe.src = `${window.MANGA_BASE_URL}/login?apiKey=${apiKey}`;
    iframe.style.display = 'none';
    iframe.onload = () => {
      localStorage.setItem('lastLoginTime', JSON.stringify(Date.now()));
      store.setIsLogin(true);
    };
    document.body.appendChild(iframe);
  }
}

function initApp(): void {
  const initialLoading = showLoading('正在初始化...');
  store.setIsLogin(false);

  const serverStatusLastCheckTime = JSON.parse(
    localStorage.getItem('serverStatusLastCheckTime') ?? 'null',
  );
  const serverStatus = JSON.parse(localStorage.getItem('serverStatus') ?? 'null');
  const currentTime = Date.now();
  let serverCheckFlag = false;

  if (
    !serverStatus ||
    currentTime - serverStatusLastCheckTime > TEN_DAYS_MS
  ) {
    kavitaStatus()
      .then((res) => {
        if (res.code === 200) {
          serverCheckFlag = true;
          localStorage.setItem('serverStatus', 'true');
        } else if (res.code === 404) {
          serverCheckFlag = false;
          localStorage.setItem('serverStatus', 'false');
          localStorage.removeItem('serverStatusLastCheckTime');
        }
        localStorage.setItem(
          'serverStatusLastCheckTime',
          JSON.stringify(Date.now()),
        );
        store.setIsLogin(serverCheckFlag);
      })
      .catch((error: { message?: string }) => {
        localStorage.removeItem('serverStatus');
        localStorage.removeItem('serverStatusLastCheckTime');
        initialLoading.close();
        messageError(
          '服务器配置状态检查出现未知问题，请联系管理员！ Code:' +
            (error.message ?? ''),
        );
      });
  } else {
    serverCheckFlag = true;
  }

  if (serverCheckFlag) {
    autoLogin();
  }
  initialLoading.close();
}

onMounted(initApp);
</script>

<template>
  <div id="app">
    <router-view />
  </div>
</template>

<style>
/* 从旧 frontend_src/vanmanga/src/App.vue 的全局 <style>（非 scoped）原样复制：
   #app 尺寸、.van-image__img、#uploadTotalBar 进度条渐变、.el-popover/.el-dropdown-menu
   等 element 弹层暗色覆盖样式、@keyframes superGradient 等。全部照搬保持外观一致。 */
</style>
```

> Step 3 要点：把旧 App.vue 的整段全局 `<style>`（注意旧版是非 scoped 全局样式，作用于 element/vant 弹层）原样复制进来。逻辑上 `serverCheckFlag` 的同步/异步时序与旧版保持等价（见任务说明）。

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd frontend; npm run test -- App`
Expected: PASS（3 个用例）。

- [ ] **Step 5: 提交**
```
git add frontend/src/App.vue frontend/src/App.spec.ts
git commit -m "feat(frontend): App init — responsive, server check, auto-login"
```
结尾加 Co-Authored-By 行。

---

## Task 9: 重写 `MainPage.vue`（桌面/移动外壳 + provide reload + socket scan_completed）

**Files:**
- Modify: `frontend/src/views/MainPage.vue`
- Test: `frontend/src/views/MainPage.spec.ts`

> MainPage 是主框架：桌面用 `el-container`(header logo + 登录状态 tag) + `el-menu` 侧栏（三个路由项）+ `el-main` 承载子路由 + `Announcement` + `VPullButton`(收起侧栏)；移动用 `van-nav-bar`(logo) + `van-tabbar`(三个路由项) + 子路由区。`provide('reload', reload)` 供子页面强制刷新（`isRouterAlive` 切换）。socket `scan_completed` → 全盘扫描完成通知。
>
> 桌面/移动由 `store.isPhone` 切换（`v-if/v-else`）。element-ui→element-plus 名称变化：`el-submenu` 本计划未用；`el-menu-item index=...` + `:router="true"` 保留；`slot="title"` → 直接放文字（element-plus menu-item 文本默认即标题）。`<i class="bi-...">` 图标 → element-plus `<el-icon>`（Search/Tools/Link 图标用 `@element-plus/icons-vue` 的 `Search`/`Tools`/`Link`）。vant `van-tabbar v-model` 保留（vant4 仍支持）。

- [ ] **Step 1: 写失败测试 `frontend/src/views/MainPage.spec.ts`**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/composables/useSocket', () => ({
  useSocket: vi.fn(() => ({
    socket: {},
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  })),
}));

import { useAppStore } from '@/stores/app';
import MainPage from './MainPage.vue';

const stubs = {
  'router-view': true,
  'el-container': { template: '<div><slot /></div>' },
  'el-header': { template: '<div><slot /></div>' },
  'el-main': { template: '<div><slot /></div>' },
  'el-menu': { template: '<div class="el-menu"><slot /></div>' },
  'el-menu-item': { template: '<div class="el-menu-item"><slot /></div>' },
  'el-tag': { template: '<div><slot /></div>' },
  'el-icon': true,
  'van-nav-bar': { template: '<div><slot name="title" /></div>' },
  'van-tabbar': { template: '<div class="van-tabbar"><slot /></div>' },
  'van-tabbar-item': { template: '<div class="van-tabbar-item"><slot /></div>' },
  'van-icon': true,
  Announcement: true,
  VPullButton: true,
};

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('MainPage', () => {
  it('renders desktop el-menu when not phone', () => {
    useAppStore().setIsPhone(false);
    const wrapper = mount(MainPage, { global: { stubs } });
    expect(wrapper.find('.el-menu').exists()).toBe(true);
    expect(wrapper.find('.van-tabbar').exists()).toBe(false);
  });

  it('renders mobile van-tabbar when phone', () => {
    useAppStore().setIsPhone(true);
    const wrapper = mount(MainPage, { global: { stubs } });
    expect(wrapper.find('.van-tabbar').exists()).toBe(true);
    expect(wrapper.find('.el-menu').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd frontend; npm run test -- MainPage`
Expected: FAIL（当前 MainPage 是占位 div）。

- [ ] **Step 3: 实现 `frontend/src/views/MainPage.vue`**

用以下脚本与模板骨架；`<style scoped>` 与第二个全局 `<style>`（移动 van-nav-bar 渐变）从旧 `frontend_src/vanmanga/src/views/MainPage.vue` 原样复制（旧 scoped 样式里有 `/deep/`：`.frame.aside /deep/ .el-menu-item` 等 → 改为 `.frame.aside :deep(.el-menu-item)`）。
```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted, provide, nextTick } from 'vue';
import { ElIcon } from 'element-plus';
import { Search, Tools, Link } from '@element-plus/icons-vue';
import Announcement from '@/components/Announcement.vue';
import VPullButton from '@/components/VPullButton.vue';
import { useAppStore } from '@/stores/app';
import { useSocket } from '@/composables/useSocket';
import { notifyError } from '@/utils/ui';
import nativeLogo from '@/assets/nativeLogo.png';

const store = useAppStore();

const mobileTabbarActive = ref('search');
const isRouterAlive = ref(true);
const isCollapse = ref(false);

function reload(): void {
  isRouterAlive.value = false;
  void nextTick(() => {
    isRouterAlive.value = true;
  });
}
provide('reload', reload);

function handleCollapse(): void {
  isCollapse.value = !isCollapse.value;
}

const { connect, disconnect, on } = useSocket();
function onScanCompleted(): void {
  notifyError(
    '全盘扫描完成',
    '已完成全盘扫描，建议检查后台以确定是否有无法扫描的漫画！',
  );
}

onMounted(() => {
  on('scan_completed', onScanCompleted);
  connect();
});
onUnmounted(() => {
  disconnect();
});
</script>

<template>
  <div id="mainShell">
    <!-- 桌面 -->
    <el-container v-if="!store.isPhone" id="main">
      <el-header class="frame header">
        <img :src="nativeLogo" alt="logo" id="logo" />
        <div class="statusBlock">
          <el-tag v-if="store.isLogin" type="success" effect="dark">跳转开启</el-tag>
          <el-tag v-else type="danger" effect="dark">跳转关闭</el-tag>
          <p id="logoText">请问你想来点漫画吗？</p>
        </div>
      </el-header>
      <el-container class="mainPart">
        <el-menu
          :default-active="$route.fullPath"
          class="frame aside"
          :collapse="isCollapse"
          router
          background-color="#1e1f26"
          text-color="#fff"
          active-text-color="#ffd04b"
        >
          <el-menu-item index="/mainpage/searchpage">
            <el-icon><Search /></el-icon>
            <span>搜索添加漫画</span>
          </el-menu-item>
          <el-menu-item index="/mainpage/mangaku">
            <el-icon><Tools /></el-icon>
            <span>现有漫画</span>
          </el-menu-item>
          <el-menu-item index="/mainpage/kavitaLinkCheck">
            <el-icon><Link /></el-icon>
            <span>Kavita连接配置</span>
          </el-menu-item>
        </el-menu>
        <el-main class="frame main">
          <router-view v-if="isRouterAlive" />
        </el-main>
      </el-container>
      <Announcement class="announcement" />
      <VPullButton
        :class="!isCollapse ? 'mainPagePullButton' : 'mainPagePullButton hide'"
        :is-hide="isCollapse"
        @switch-collapse="handleCollapse"
      />
    </el-container>
    <!-- 移动 -->
    <div v-else class="mobile">
      <van-nav-bar>
        <template #title>
          <div class="mobileLogoStage">
            <img :src="nativeLogo" alt="logo" id="mobileLogo" />
          </div>
        </template>
      </van-nav-bar>
      <div class="mobileMain">
        <router-view v-if="isRouterAlive" />
      </div>
      <van-tabbar v-model="mobileTabbarActive" route>
        <van-tabbar-item replace to="/mainpage/searchpage" name="search" icon="search">搜索漫画</van-tabbar-item>
        <van-tabbar-item replace to="/mainpage/mangaku" name="lib" icon="star-o">现有漫画</van-tabbar-item>
        <van-tabbar-item replace to="/mainpage/kavitaLinkCheck" name="kavitaLogin" icon="link-o">Kavita登录</van-tabbar-item>
      </van-tabbar>
    </div>
  </div>
</template>

<style scoped>
/* 从旧 MainPage.vue 的 <style scoped> 原样复制；把 /deep/ 选择器改为 :deep()。 */
</style>

<style>
/* 从旧 MainPage.vue 的第二段全局 <style>（.van-nav-bar__content 渐变等）原样复制。 */
</style>
```

> Step 3 要点：① 子路由通过 `@reload`（旧）已改为 `provide('reload')`，子页面在 Plan 2b–2d 用 `inject('reload')`，本计划不需要在 `<router-view>` 上挂 `@reload`；② socket 旧版被注释禁用，这里真正 `connect()` 并监听 `scan_completed`（修复禁用问题，符合规格"顺手重构"）；③ 样式照搬，`/deep/`→`:deep()`。

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd frontend; npm run test -- MainPage`
Expected: PASS（2 个用例）。

- [ ] **Step 5: 全量回归 + 构建**

Run: `cd frontend; npm run test` → 期望全绿。
Run: `cd frontend; npm run build` → 期望成功。

- [ ] **Step 6: 提交**
```
git add frontend/src/views/MainPage.vue frontend/src/views/MainPage.spec.ts
git commit -m "feat(frontend): MainPage shell (desktop sidebar + mobile tabbar)"
```
结尾加 Co-Authored-By 行。

---

## 完成标准（Plan 2a）

- 领域类型 `types/manga.ts` 就位并被接口层引用。
- `api/dogemanga.ts`（8 函数）、`api/kavita.ts`（2 函数）封装完成，单测全绿（mock http）。
- `useResponsive` 把视口同步到 `store.isPhone`；`utils/ui` 把桌面/移动通知/加载/确认收敛到一处，均有单测。
- `Announcement`、`VPullButton` 组件迁移完成并有渲染/事件测试。
- `App.vue` 完成初始化（响应式 + 服务器检查 + 自动登录），`MainPage.vue` 完成桌面/移动外壳、provide reload、socket `scan_completed`。
- `npm run test` 全绿、`npm run build` 通过。
- 应用可在桌面/移动两种视口下显示正确外壳与导航；页面 body 仍为占位（Plan 2b–2d 填充）。

## 后续（不在本计划内）

- **Plan 2b**：SearchPage + DocumentList/Document/MobileCardList/V-botton + 提交选择逻辑（`documentBaseLogic` → composable）+ `checkAndPOP` 输入校验动效。
- **Plan 2c**：MangaKu（el-table + 移动卡片）+ MangaReloadForm/MobileMangaReloadForm/VanFieldCheckbox + 删除/开关/重下载 + socket `response`/`complete_info`/`downloading_info` 实时更新。
- **Plan 2d**：KavitaCheckPage（登录/状态/localStorage/自动登录 iframe）。
- 删除旧 `frontend_src/`、清理 `frontend_static/`（Plan 3）。
