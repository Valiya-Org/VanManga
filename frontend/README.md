# VanManga Frontend (Vue 3 + Vite)

## 开发

后端（NestJS，端口 5000）：

    npm run dev:backend      # 在仓库根执行

前端（Vite HMR，端口 5173，proxy /api、/socket.io、/js/config.js 到后端）：

    npm run dev:frontend     # 在仓库根执行

浏览器访问 http://localhost:5173 。

## 生产构建

在仓库根执行：

    npm run build            # 先打前端到 frontend/dist，再 nest build
    npm run start:prod       # NestJS 单进程托管 API + 前端

## 测试

    npm run test:frontend    # 在仓库根执行（Vitest）
