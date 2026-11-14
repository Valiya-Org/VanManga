# P3a · 前端底座与数据层 — 实现计划

规格：`docs/superpowers/specs/2026-11-14-migration-completion-roadmap-design.md` §7（7.1、7.2、7.5、7.6、7.7）。
接口：`docs/api-contract.md`（唯一依据）。

范围：工具链 + 类型化数据层。不做页面和视觉组件（后续任务在此之上搭建）。

## 1. 工具链

- 官方文档 <https://ui.nuxt.com/docs/getting-started/installation/vue>（Vue + Vite 模式）。
- 安装 `@nuxt/ui`（4.x）与 `tailwindcss`（4.x）。
- `vite.config.ts`：`vue()` 之后加 `ui()`（`@nuxt/ui/vite`）；保留 `/api`、`/socket.io` 代理，删除 `/js/config.js` 代理。
- `main.ts`：`app.use(ui)`（`@nuxt/ui/vue-plugin`），引入 `src/assets/main.css`（`@import "tailwindcss"; @import "@nuxt/ui";`）。
- `App.vue`：`<UApp><RouterView /></UApp>`；`index.html` 的 `#app` 加 `isolate`，去掉 `/js/config.js`。
- 自动生成的 `auto-imports.d.ts`、`components.d.ts` 加入 tsconfig `include` 并 gitignore；`build` 改为先 `vite build` 再类型检查（文档要求）；`typecheck` 在无生成文件时也要能过。
- vitest 配置同样加载 `ui()` 插件，使组件测试能解析 `UApp`。

## 2. 删除

element-plus、vant、overlayscrollbars(-vue)、`@element-plus/icons-vue`；`VPullButton`、`Announcement`、`useResponsive`、http 信封补丁、`api/dogemanga`、`types/manga`、`stores/app`、`utils/ui`、旧页面及其测试、`window.MANGA_BASE_URL` 声明。

外壳占位：路由 `/`（库占位）、`/settings`（占位）、`/mainpage/:pathMatch(.*)*` → `/`，其余未知路径也回 `/`。

## 3. 数据层结构

```
src/api/
  types.ts      契约第 2、4 节类型 + 各接口 Data 类型 + ApiErrorCode
  errors.ts     ApiError 类（status、error、message?、data?）+ toApiError
  http.ts       唯一 axios 实例；请求拦截器加 X-Admin-Token；响应拦截器解信封/转 ApiError
  config.ts / scraper.ts / library.ts / download.ts / kavita.ts   每个规范接口一个函数
  index.ts      汇总导出
src/stores/
  session.ts    Kavita 登录态（持久化 localStorage）+ 管理员口令（仅内存）+ withAdmin(op) 401 重试
  config.ts     GET /api/config
  library.ts    列表、排序、筛选、增删改、socket 更新
  queue.ts      队列快照 + 进度
src/socket/
  dispatcher.ts 规范事件 → store 动作（纯函数注册，便于测试）
src/composables/useSocket.ts  沿用单例连接
src/errors/messages.ts        error 字符串 → 中文提示
```

管理员口令注入：http 不直接依赖 Pinia，而是 `setAdminTokenProvider(() => string | null)`；session store 在创建时注册。

401 重试：`session.withAdmin(op)` 执行 `op()`；捕获 `admin-token-required|invalid` 时调用注入的 `askAdminToken(reason)`，拿到口令后存入内存并重试，用户取消（返回 null）则抛出原错误。最多重试到用户取消为止。

添加流程：`library.add(candidate, { confirmDuplicate })` 返回判别联合：
`added | cancelled | already-in-library | search-expired`；`duplicate` 时调用 `confirmDuplicate(names)`，确认 → `submit_sign: '1'` 重发，取消 → `submit_sign: '2'` 并返回 `cancelled`。

## 4. 步骤（每步测试先行、单独提交）

1. 计划文档。
2. 工具链：装 Nuxt UI/Tailwind，删旧依赖与旧代码，占位外壳 + 路由测试。
3. api 类型、ApiError、http 拦截器（测试：成功解包、各失败映射、网络错误、管理员头）。
4. 各端点函数（测试：方法/路径/body/编码）。
5. 错误中文映射（测试：覆盖契约全部错误码 + 兜底）。
6. session、config store（测试：登录/刷新/登出、口令仅内存、401 重试）。
7. library、queue store（测试：排序、筛选、添加各分支、删除走 withAdmin、socket 更新）。
8. socket 分发器 + App 根部连接（测试：每个事件调用对应 store 动作）。
9. 公共接口文档 `docs/frontend-data-layer.md`。
