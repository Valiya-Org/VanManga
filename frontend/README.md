# VanManga Frontend (Vue 3 + Vite + Nuxt UI)

技术栈：Vue 3.5、Vite 6、TypeScript、Pinia、vue-router 4、axios、socket.io-client、
[Nuxt UI](https://ui.nuxt.com/docs/getting-started/installation/vue)（Vue 模式）+ Tailwind 4、Vitest。

数据层（api、store、socket、错误提示、管理员口令重试）的公共接口见
[`docs/frontend-data-layer.md`](../docs/frontend-data-layer.md)。

## 开发

后端（NestJS，端口 5000）：

    npm run dev:backend      # 在仓库根执行

前端（Vite HMR，端口 5173，proxy /api、/socket.io 到后端）：

    npm run dev:frontend     # 在仓库根执行

浏览器访问 http://localhost:5173 。

Nuxt UI 的 vite 插件在每次运行 vite/vitest 时生成 `auto-imports.d.ts`、`components.d.ts`（已 gitignore）。

## 生产构建

在仓库根执行：

    npm run build            # 先打前端到 frontend/dist，再 nest build
    npm run start:prod       # NestJS 单进程托管 API + 前端

## 测试

    npm run test:frontend    # 在仓库根执行（Vitest）

## 端到端测试（Playwright，仅 chromium）

真实后端（`backend/dist`，同时托管 `frontend/dist`）+ 假抓取器，`ADMIN_TOKEN` 已设置，
走一遍"搜索 → 添加 → 库里出现 → 删除（输入口令）→ 库里消失"。不在 `npm test` 里。

    npx playwright install chromium     # 首次
    (cd ../backend && npm run build)
    npm run build
    npm run test:e2e

- `e2e/start-backend.cjs` 在临时数据目录上启动后端（端口 5480，可用 `E2E_PORT` 改），
  测试结束后删除。
- 假抓取器 `e2e/fake-scraper.cjs` 通过后端已有的配置项接入，无需改后端：
  `PYTHON_EXECUTABLE=<node>`、`PYTHON_CLI_SCRIPT=e2e/fake-scraper.cjs`
  （后端自己的 `test/*.e2e-spec.ts` 也这样用 `fake-cli.cjs`）。它按 `scrape_cli.py`
  的单行 JSON 协议回答 `search`、`metadata`、`chapters`；章节列表为空，所以全量下载立即结束。
- CI（`.github/workflows/ci.yml` 的 `e2e` job）设 `E2E_BACKEND_MAIN=1`，用生产入口
  `dist/main.js` 启动。本地默认用与后端 e2e 相同的方式（`AppModule` + `configureApp`）启动：
  `main.js` 会拒绝在低于 `.nvmrc` 版本的 Node 上启动（TLS 根证书检查），而假抓取器不发任何外部请求。

审阅用截图（1280px 与 375px，库、搜索面板、队列抽屉、设置）：

    npm run screenshots                 # 写到 ../docs/review/p3b-screenshots/
