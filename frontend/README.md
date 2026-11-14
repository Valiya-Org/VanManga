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
