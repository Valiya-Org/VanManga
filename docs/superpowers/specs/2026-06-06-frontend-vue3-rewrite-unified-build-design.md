# 前端 Vue 3 重写 + 与 NestJS 统一构建 — 设计文档

- 日期：2026-06-06
- 分支：`feature/nestjs-migration-stage-0-1`
- 状态：已通过设计评审，待写实现计划

## 1. 背景与目标

现有前端 `frontend_src/vanmanga` 是 Vue 2.6 + Vue CLI（webpack）项目，依赖 element-ui 2 和 vant 2 —— 这两个 UI 库**仅支持 Vue 2**，是升级 Vue 3 的主要成本。后端已迁移到 NestJS 11（当前在 `nestjs/` 目录），并已具备 `FrontendModule`：托管静态资源、SPA fallback、动态 `/js/config.js` 注入。

两个目标：

1. **前端重写为 Vue 3**（采用「重写 + 顺手重构」，而非逐行平移）。
2. **前后端能一起构建**：一条命令产出前端 + 后端产物，由 NestJS 单进程统一托管。

## 2. 关键决策（已确认）

| 决策点 | 选择 |
|---|---|
| 迁移方式 | 重写 + 顺手重构（重组目录、拆组件、换状态管理） |
| 构建工具 | Vite 6 + Vue 3 |
| 语言 | TypeScript（与 NestJS 对齐） |
| 仓库结构 | 根目录同级 `frontend/` + `backend/`，根 `package.json` 编排 |
| 开发工作流 | 生产统一构建；开发分开起（Vite proxy 联调） |
| 状态管理 | Pinia 取代 vuex（现 store 仅 2 字段，零成本） |
| UI 库 | **保留两套**：element-plus（桌面）+ vant 4（移动） |
| 实时通信 | socket.io-client 封装成 `useSocket()` composable |

## 3. 目标仓库结构

```
VanManga/
├── frontend/               # ★ 新 Vue3 + Vite + TS
│   ├── src/
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json        # 前端自己的依赖
├── backend/                # ★ 由 nestjs/ 改名（git mv）
│   ├── src/
│   └── package.json
├── package.json            # ★ 新增：根编排脚本
├── frontend_src/           # 旧 Vue2，迁移完成后删除
├── frontend_static/        # 旧静态产物，迁移完成后清理
└── main.py, modules/, ...  # 旧 Flask，本次不动
```

- `nestjs/` → `backend/`：用 `git mv` 保留历史。
- 旧 `frontend_src/` 与新 `frontend/` 并存，迁移期逐页验证，全部跑通后删旧。
- 前端构建产物输出到 `frontend/dist/`，由后端直接托管。

## 4. 技术栈对照

| 项 | 现在 (Vue2) | 重写后 (Vue3) |
|---|---|---|
| 框架 | Vue 2.6 | Vue 3.5 + `<script setup lang="ts">` |
| 构建 | Vue CLI / webpack | Vite 6 |
| 语言 | JavaScript | TypeScript |
| 路由 | vue-router 3 | vue-router 4 |
| 状态 | vuex 3 | Pinia |
| 桌面 UI | element-ui 2 | element-plus |
| 移动 UI | vant 2 | vant 4 |
| 实时 | vue-socket.io（已禁用） | socket.io-client + `useSocket()` composable |
| HTTP | `Vue.prototype.$http`(axios) | axios 实例 + 按域拆分的 api 模块 |
| 滚动条 | overlayscrollbars-vue 0.2 | overlayscrollbars-vue 0.5（Vue3 版） |

## 5. 生产构建（统一）

根 `package.json` 编排：

```jsonc
{
  "scripts": {
    "build": "npm run build:frontend && npm run build:backend",
    "build:frontend": "npm --prefix frontend install && npm --prefix frontend run build",
    "build:backend": "npm --prefix backend install && npm --prefix backend run build",
    "start:prod": "npm --prefix backend run start:prod",
    "dev:backend": "npm --prefix backend run start:dev",
    "dev:frontend": "npm --prefix frontend run dev"
  }
}
```

`npm run build` 流程：先 `npm --prefix frontend run build`（产物落 `frontend/dist/`）→ 再 `nest build`（产物落 `backend/dist/`）。运行 `npm run start:prod` 后，NestJS 单进程同时托管 `/api/*`、`/socket.io`、前端静态资源与 SPA。

## 6. 后端改动（小范围）

1. `FrontendModule` 的 `STATIC_ROOT` 与 `main.ts` 的 `indexPath` 改指向 `frontend/dist`（Vite 标准布局：`dist/index.html` + `dist/assets/`），不再使用 `templates/` 子目录的老约定。具体相对路径在实现阶段按 `backend/dist` 运行时 `__dirname` 推算。
2. `ServeStaticModule` 的 `rootPath` 随之更新；`exclude: ['/api{/*path}']` 与 SPA fallback 逻辑保持不变。
3. 动态 `/js/config.js` 机制**完全保留**：`frontend/index.html` 中继续 `<script src="/js/config.js"></script>`，运行时读 `window.MANGA_BASE_URL` / `window.MANGA_BASE_WEBSOCKET_URL`。
4. 路由前缀 `setGlobalPrefix('api', { exclude: ['/', 'js/config.js'] })` 不变。

## 7. 开发联调

`frontend/vite.config.ts` 配置 proxy：

```ts
server: {
  proxy: {
    '/api':          { target: 'http://localhost:5000', changeOrigin: true },
    '/socket.io':    { target: 'http://localhost:5000', ws: true },
    '/js/config.js': { target: 'http://localhost:5000' },
  },
}
```

开发时两个终端：

- `npm run dev:backend` —— NestJS watch（端口 5000）
- `npm run dev:frontend` —— Vite HMR（默认 5173），通过 proxy 打到后端

## 8. 前端内部结构（重写映射）

```
frontend/src/
├── main.ts                  # createApp + 注册 router/pinia/element-plus/vant
├── App.vue
├── router/index.ts          # /mainpage/{searchpage,mangaku,kavitaLinkCheck} + 404 兜底
├── stores/
│   └── app.ts               # useAppStore: isPhone, isLogin
├── api/
│   ├── http.ts              # axios 实例，baseURL='/api'
│   ├── dogemanga.ts         # search/confirm/redownload/lib/cdl/deletemanga 等
│   └── kavita.ts            # login/status
├── composables/
│   ├── useSocket.ts         # socket.io-client 连接 + 下载进度事件
│   └── useResponsive.ts     # isPhone 响应式（替代 store 里手算 clientWidth）
├── views/
│   ├── MainPage.vue
│   ├── SearchPage.vue
│   ├── MangaKu.vue
│   ├── KavitaCheckPage.vue
│   └── ErrorPage.vue
└── components/
    ├── desktop/             # element-plus 版（Document/DocumentList/MangaReloadForm 等）
    └── mobile/              # vant 版（MobileCardList/MobileMangaReloadForm/VanFieldCheckbox 等）
```

现有 `src/assets/methods/*BaseLogic.vue`（mixin 风格的逻辑文件）改写为 `composables/` 或 `api/` 中的函数。

### 路由行为（保持现状）

- `mode: history`
- `/` 与 `/mainpage` 重定向到 `/mainpage/searchpage`
- `/mainpage` 下子路由：`searchpage`、`mangaku`、`kavitaLinkCheck`
- 通配兜底到 `ErrorPage`

## 9. 数据流

- **HTTP**：axios 实例 `baseURL='/api'`，按域拆 `api/dogemanga.ts`、`api/kavita.ts`，组件不直接拼 URL。沿用现有后端兼容路由 `/api/dogemanga/*`、`/api/kavita/*`。
- **实时**：`useSocket()` 连 `/socket.io`，订阅后端下载进度事件，组件以响应式状态消费（修复现状里 socket 基本被注释禁用的问题）。
- **配置**：`window.MANGA_BASE_URL` 等仍由后端 `/js/config.js` 注入。

## 10. 切换策略（分阶段、可回滚）

1. `nestjs/` → `backend/`（git mv），新建根 `package.json`，后端可正常构建运行。
2. 在 `frontend/` 搭起 Vite + Vue3 + TS 骨架（router/pinia/UI 库/api/socket 基础设施）。
3. 逐页重写并联调验证：SearchPage → MangaKu → KavitaCheckPage → MainPage/Error。
4. 后端 `FrontendModule` 切到 `frontend/dist`，验证统一构建 `npm run build` + `start:prod`。
5. 全部跑通后删除 `frontend_src/`、清理 `frontend_static/` 及后端相关老路径引用。

## 11. 测试

- 前端：Vitest + Vue Test Utils，覆盖组件渲染、composable（useSocket/useResponsive）、api 封装层（mock axios）。
- 后端：沿用现有 Jest，不动。
- 统一构建：手动验证 `npm run build` 产物完整、`start:prod` 下前端可访问、`/api` 与 `/socket.io` 正常。

## 12. 不在本次范围（YAGNI）

- 旧 Flask（`main.py`、`modules/`、`utils/`）的处理。
- 前后端共享 DTO 类型包的抽取（可留作后续优化）。
- pnpm/npm workspaces 正式 monorepo 化（当前根脚本 + `--prefix` 已够用）。
- UI/交互的视觉重设计（重写以业务对等为准，外观仅按 UI 库差异做最小适配）。
