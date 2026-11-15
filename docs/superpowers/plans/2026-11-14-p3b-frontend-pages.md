# P3b · 前端页面与组件 — 实施计划

设计：`docs/superpowers/specs/2026-11-14-p3b-frontend-pages-design.md`
数据层：`docs/frontend-data-layer.md`

每个任务带测试，完成后单独提交（conventional commits）。所有 UI 文案中文，固定深色。

## T1 · 主题、图标、标志资源

- `frontend/vite.config.ts`、`vitest.config.ts`：`ui({ colorMode: false, ui: { colors: { primary: 'violet', neutral: 'zinc' } } })`；图标离线打包（`@iconify-json/lucide` + `icon.clientBundle.scan`），不依赖 Iconify 在线 API。
- `frontend/index.html`：`<html class="dark">`、favicon。
- `frontend/src/assets/main.css`：色值变量（规格 §2 的八个值 + 渐变）一处定义，并映射到 Nuxt UI 的 `--ui-*` 变量；系统字体栈。
- 资源：`src/assets/valiya-mark.png`、`src/assets/valiya-logo.png`（nativeLogo）、`public/favicon.ico`，取自 tag `flask-final`。
- `components/brand/BrandLogo.vue`（+ spec）。

## T2 · 基础件

- `composables/useRelativeTime.ts`（+ spec）：刚刚 / n 分钟前 / n 小时前 / 昨天 / n 天前 / 上周 / yyyy-MM-dd。
- `composables/useLibraryViewMode.ts`（+ spec）：`localStorage` 键 `vanmanga.libraryView`，try/catch。
- `stores/ui.ts`（+ spec）：`searchOpen`、`queueOpen`、`chapterPickerFor`、确认框（`confirm()` 返回 Promise）。
- `components/common/ProgressBar.vue`、`ConfirmDialog.vue`、`AdminTokenDialog.vue`（+ spec：重输、取消）。

## T3 · 漫画操作与卡片

- `composables/useMangaActions.ts`（+ spec）：自动更新切换、选择章节重下（打开选择器）、在 Kavita 中打开、删除（确认 → `library.remove`），统一 toast 与 `errorMessage`。
- `components/library/CoverImage.vue`、`MangaActionsMenu.vue`（+ spec：busy 禁用、Kavita 项条件）、`MangaCard.vue`（+ spec：新 / 自动 / 下载中 / 排队中 / 尚未下载）、`MangaRow.vue`、`LibraryToolbar.vue`。

## T4 · 漫画库页

- `views/LibraryView.vue`（+ spec）：工具行、卡片 / 列表、空状态、筛选无结果、加载失败重试、DMCA 提示。

## T5 · 搜索并添加

- `components/search/SearchPanel.vue`、`SearchResultRow.vue`（+ spec：added / 相似确认 / 过期重搜 / 已在库中 / 出错重试）。

## T6 · 队列与章节选择

- `components/queue/QueueContent.vue`（+ spec）、`QueueDrawer.vue`（桌面右侧抽屉，手机全屏）。
- `components/chapters/ChapterPickerDialog.vue`（+ spec：加载、失败重试、全选/反选、n=0 禁用、确认重下）。

## T7 · 外壳与设置

- `layouts/AppShell.vue`：顶栏（标志、搜索框、队列按钮、设置）、手机底部标签、离线提示、挂载浮层；`App.vue` 用它。
- `views/SettingsView.vue`（+ spec：Kavita 未启用 / 未登录 / 已登录；rezip 走口令）。
- 更新 `App.spec.ts`。

## T8 · 端到端冒烟（Playwright）

- `frontend/playwright.config.ts`、`frontend/e2e/smoke.spec.ts`、`frontend/e2e/fake-scraper.cjs`。
- 假抓取器通过后端现有配置项接入：`PYTHON_EXECUTABLE=node`、`PYTHON_CLI_SCRIPT=<fake>`（后端自己的 e2e 已经这么用），无需改后端。
- `npm run test:e2e`（不进 `npm test`；vitest 排除 `e2e/`）。
- `.github/workflows/ci.yml` 新 job `e2e`（原四个 job 不动）。
- 开发文档：`frontend/README.md` 说明如何运行。

## T9 · 真实浏览器检查与截图

- 脚本 `frontend/e2e/screenshots.spec.ts`（单独 project，不进 CI 冒烟）在 1280px 与 375px 下截库页、搜索面板、队列抽屉、设置，存到 `docs/review/p3b-screenshots/`；看图修问题。

## T10 · 收尾

- 全部验证命令；报告 `.superpowers/sdd/p3b-report.md`。
