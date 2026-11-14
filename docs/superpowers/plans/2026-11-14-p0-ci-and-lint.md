# P0 · CI 与代码规范 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给仓库加上 GitHub Actions CI（前端、后端、Python 抓取器、Docker 镜像四个任务），并让前后端都有可用的 ESLint。

**Architecture:** 前后端各自一份 ESLint flat config（`eslint.config.*`），规则取 `@eslint/js` + `typescript-eslint` 的 recommended，前端再加 `eslint-plugin-vue` 的 essential。一个工作流文件 `.github/workflows/ci.yml` 跑四个并行 job；后端 e2e 依赖 `frontend/dist`，所以后端 job 在跑 e2e 前先构建前端。

**Tech Stack:** GitHub Actions、ESLint 9（flat config）、typescript-eslint、eslint-plugin-vue、Node（版本取自 `.nvmrc`）、Python 3.11、Docker Buildx。

**配套规格：** `docs/superpowers/specs/2026-11-14-migration-completion-roadmap-design.md` 第 4 节

## Global Constraints

- Node 版本一律读仓库根的 `.nvmrc`（当前 `24.22.1`），工作流里不写死版本号。
- 接入 lint 时现有代码的报错必须在本计划内修完：不加文件级 `eslint-disable`，不把规则降级为 `off` 来消除报错（下文配置里已列出的规则调整除外）。
- lint 修复只改写法，不改行为；每个任务结束时现有测试必须仍然全绿。
- 不修改 `modules/*.py`、`utils/*.py`、`scrape_cli.py`。
- 在子项目里跑 npm 用 `cd <dir>` 的形式，不用 `npm --prefix <dir> install`（在本仓库会往目标 `package.json` 注入自引用依赖）。
- 平台是 Windows；命令在 Git Bash 下给出。git 命令在仓库根执行。
- 提交信息末尾加：`Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`
- 推送到远端需要用户明确同意（Task 3 Step 4）。

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `frontend/eslint.config.js` | 新建 | 前端 lint 规则（Vue 3 + TS） |
| `frontend/package.json` | 修改 | 加 `lint`、`lint:fix`、`typecheck` 脚本和 lint 依赖 |
| `backend/eslint.config.mjs` | 新建 | 后端 lint 规则（TS + Node + Jest 全局） |
| `backend/package.json` | 修改 | `lint` 改为只检查，新增 `lint:fix`，加 lint 依赖 |
| `.github/workflows/ci.yml` | 新建 | 四个 CI job |
| `frontend/src/**`、`backend/src/**`、`backend/test/**` | 按需修改 | 仅修 lint 报错 |

---

### Task 1: 前端 ESLint

**Files:**
- Create: `frontend/eslint.config.js`
- Modify: `frontend/package.json`（scripts、devDependencies）
- Modify: `frontend/src/**`（仅修 lint 报错）

**Interfaces:**
- Produces: `frontend` 下可用的三个 npm 脚本 —— `npm run lint`（只检查，有 warning 也失败）、`npm run lint:fix`、`npm run typecheck`。Task 3 的工作流会调用 `lint`、`typecheck`、`test`、`build`。

- [ ] **Step 1: 安装依赖**

```bash
cd frontend && npm install -D eslint @eslint/js typescript-eslint eslint-plugin-vue globals
```

Expected: 安装成功，`package.json` 的 `devDependencies` 多出这五项，`dependencies` 里**没有**多出名为 `vanmanga` 的条目。

- [ ] **Step 2: 创建 `frontend/eslint.config.js`**

```js
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/essential'],

  // <script lang="ts"> inside .vue files needs the TS parser.
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },

  {
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      // Views are single-word by design (MainPage is fine, but so is e.g. a
      // future Library.vue); the router, not the name, disambiguates them.
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Build/test config files run in Node.
  {
    files: ['*.config.ts', '*.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
```

- [ ] **Step 3: 在 `frontend/package.json` 的 `scripts` 里加三项**

改完后 `scripts` 为：

```json
"scripts": {
  "dev": "vite",
  "build": "vue-tsc --noEmit && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "vue-tsc --noEmit",
  "lint": "eslint . --max-warnings 0",
  "lint:fix": "eslint . --fix"
}
```

- [ ] **Step 4: 跑 lint，记录报错**

```bash
cd frontend && npm run lint
```

Expected: 命令能运行（不是"找不到配置"或解析崩溃）。大概率有若干报错，把报错总数记下来写进最终汇报。若报"Parsing error"指向 `.vue` 文件，说明 Step 2 的 parser 段没生效，先修配置再继续。

- [ ] **Step 5: 修掉全部报错**

先跑自动修复，再手工修剩下的：

```bash
cd frontend && npm run lint:fix && npm run lint
```

手工修复的规则：

- 未使用的变量/导入：删掉；确实要保留占位的参数改名加 `_` 前缀
- `@typescript-eslint/no-explicit-any`：换成具体类型或 `unknown`；测试里的桩对象用 `as unknown as <Type>`
- `@typescript-eslint/no-empty-object-type`（`env.d.ts` 里的 `DefineComponent<{}, {}, any>`）：改为 `DefineComponent<object, object, unknown>`
- 其他规则：按规则文档的推荐写法改代码

不允许：加文件级 `/* eslint-disable */`、在配置里新增 `off`。如果某条报错只能靠关规则解决，停下来汇报 BLOCKED，说明是哪条规则、哪个文件、为什么改不了代码。

Expected: `npm run lint` 退出码 0，无任何输出的 error 或 warning。

- [ ] **Step 6: 回归验证**

```bash
cd frontend && npm run typecheck && npm test && npm run build
```

Expected: 三条都成功；测试数量与修复前一致（修复前先跑一次 `npm test` 记下通过数）。

- [ ] **Step 7: 提交**

```bash
git add frontend/eslint.config.js frontend/package.json frontend/package-lock.json frontend/src frontend/env.d.ts
git commit -m "chore(frontend): add ESLint (flat config) and fix existing violations"
```

---

### Task 2: 后端 ESLint

**Files:**
- Create: `backend/eslint.config.mjs`
- Modify: `backend/package.json`（scripts、devDependencies）
- Modify: `backend/src/**`、`backend/test/**`（仅修 lint 报错）

**Interfaces:**
- Produces: `backend` 下的 `npm run lint`（只检查，有 warning 也失败）和 `npm run lint:fix`。Task 3 的工作流会调用 `lint`、`build`、`test`、`test:e2e`。

背景：`backend/package.json` 已有 `"lint": "eslint \"{src,test}/**/*.ts\" --fix"`，但既没装 eslint 也没有配置文件，这个脚本现在跑不起来。CI 里不能用带 `--fix` 的脚本（它会改文件而不是报错），所以拆成检查和修复两个。

- [ ] **Step 1: 记录基线**

```bash
cd backend && npm test 2>&1 | tail -6
```

记下 `Tests: N passed`，Step 6 要对比。

- [ ] **Step 2: 安装依赖**

```bash
cd backend && npm install -D eslint @eslint/js typescript-eslint globals
```

Expected: 安装成功，`devDependencies` 多出这四项。

- [ ] **Step 3: 创建 `backend/eslint.config.mjs`**

（`backend` 是 CommonJS 包，所以配置文件用 `.mjs` 扩展名。）

```js
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // The fake Python CLI used by python-runner specs is plain CommonJS.
  {
    files: ['**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
```

- [ ] **Step 4: 修改 `backend/package.json` 的 lint 脚本**

把：

```json
"lint": "eslint \"{src,test}/**/*.ts\" --fix",
```

改为：

```json
"lint": "eslint \"{src,test}/**/*.ts\" --max-warnings 0",
"lint:fix": "eslint \"{src,test}/**/*.ts\" --fix",
```

- [ ] **Step 5: 跑 lint 并修掉全部报错**

```bash
cd backend && npm run lint
```

记下报错总数，然后：

```bash
cd backend && npm run lint:fix && npm run lint
```

手工修复的规则与 Task 1 Step 5 相同：

- 未使用的变量/导入：删掉；必须保留的参数加 `_` 前缀。`catch (err)` 里没用到 `err` 的，改成 `catch {`
- `@typescript-eslint/no-explicit-any`：换成具体类型或 `unknown`；测试桩用 `as unknown as <Type>`
- 其他规则：按规则文档的推荐写法改代码

不允许：加文件级 `/* eslint-disable */`、在配置里新增 `off`。只能靠关规则解决的，停下来汇报 BLOCKED。

注意：`backend/src` 里的 DTO 和 Nest 装饰器类不要为了消除报错而改动字段或装饰器 —— 全局 ValidationPipe 是 `whitelist: true`，删掉装饰器会让字段被静默丢弃。

Expected: `npm run lint` 退出码 0。

- [ ] **Step 6: 回归验证**

```bash
cd backend && npm run build && npm test 2>&1 | tail -6
```

Expected: 构建成功；`Tests: N passed` 的 N 与 Step 1 的基线一致，0 failed。

如果本机 Node 版本低于 `.nvmrc`（例如 v22.14），`trust-store-check.spec.ts` 可能在修复前后都失败 —— 那是本机环境问题，不是 lint 修复引入的。此时以"失败的用例集合与基线完全相同"为通过标准，并在汇报里写明。

- [ ] **Step 7: 提交**

```bash
git add backend/eslint.config.mjs backend/package.json backend/package-lock.json backend/src backend/test
git commit -m "chore(backend): add ESLint (flat config) and fix existing violations"
```

---

### Task 3: GitHub Actions 工作流

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Task 1 的 `frontend` 脚本 `lint`、`typecheck`、`test`、`build`；Task 2 的 `backend` 脚本 `lint`、`build`、`test`、`test:e2e`。

背景：

- 后端 e2e（`backend/test/frontend-static.e2e-spec.ts`）断言 `GET /` 返回 SPA 的 `index.html`，它从 `<repo>/frontend/dist` 读文件，所以后端 job 必须先构建前端。
- `scrape_cli.py` 在模块顶层构建 `SOURCE_REGISTRY`，会导入 `modules/DGmanga.py` 及其依赖（DrissionPage、bs4、gevent）。因此 `python scrape_cli.py --help` 能成功就说明 `requirements-scraper.txt` 装全了、导入链没断。
- 运行镜像是 Debian bookworm，自带 Python 3.11，CI 用同一个小版本。

- [ ] **Step 1: 创建 `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
  pull_request:
    branches: [staging]

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  frontend:
    name: Frontend
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build

  backend:
    name: Backend
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
          cache-dependency-path: |
            backend/package-lock.json
            frontend/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm test
      # The e2e suite serves the SPA from <repo>/frontend/dist.
      - name: Build frontend for e2e
        working-directory: frontend
        run: npm ci && npm run build
      - run: npm run test:e2e

  scraper:
    name: Python scraper
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: pip
          cache-dependency-path: requirements-scraper.txt
      - run: pip install -r requirements-scraper.txt
      # Importing scrape_cli pulls in modules/* and their deps.
      - run: python scrape_cli.py --help

  docker:
    name: Docker image
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: backend/Dockerfile
          push: false
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 2: 本地校验 YAML 语法**

```bash
node -e "const y=require('./backend/node_modules/js-yaml');const d=y.load(require('fs').readFileSync('.github/workflows/ci.yml','utf8'));console.log(Object.keys(d.jobs).join(','))"
```

Expected: 打印 `frontend,backend,scraper,docker`。

若报 `Cannot find module 'js-yaml'`，改用：

```bash
python -c "import yaml,sys;print(','.join(yaml.safe_load(open('.github/workflows/ci.yml',encoding='utf8'))['jobs']))"
```

两个都不可用就跳过本步，在汇报里注明，由 Step 5 的真实运行来验证。

- [ ] **Step 3: 本地预演每个 job 的命令**

工作流里的命令在本机各跑一遍，提前发现问题：

```bash
(cd frontend && npm ci && npm run lint && npm run typecheck && npm test && npm run build)
(cd backend && npm ci && npm run lint && npm run build && npm test && npm run test:e2e)
python scrape_cli.py --help
```

Expected: 前两组全部成功。第三条需要本机 Python 装了 `requirements-scraper.txt`；没装的话会报 `ModuleNotFoundError`，这是本机环境缺依赖，不算失败，在汇报里注明"scraper job 未在本地预演"。

Docker 构建在本机有 Docker 时可选预演：`docker build -f backend/Dockerfile -t vanmanga-ci-check .`

- [ ] **Step 4: 提交，并请用户确认推送**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow (frontend, backend, scraper, docker)"
```

推送会把本分支上所有未推送的提交发到 `origin`。**停下来向用户确认后**再执行：

```bash
git push origin feature/nestjs-migration-stage-0-1
```

- [ ] **Step 5: 确认工作流全绿**

```bash
gh run list --branch feature/nestjs-migration-stage-0-1 --limit 1
gh run watch
```

Expected: 四个 job 全部 `success`。

某个 job 失败时：`gh run view --log-failed` 看日志，修复后新建提交再推送（不要 amend 已推送的提交），直到全绿。常见原因：

- `setup-node` 找不到 `.nvmrc` 指定的版本 → 确认 `.nvmrc` 内容是一个已发布的 Node 版本号
- scraper job 的 `pip install` 编译失败 → 说明某个固定版本没有 Python 3.11 的预编译包；把 `python-version` 调到有预编译包的版本，并在汇报里说明与运行镜像的差异
- docker job 超时或缓存报错 → 去掉 `cache-from`/`cache-to` 两行重试

---

## 完成标准

- `frontend`、`backend` 下 `npm run lint` 均退出码 0，仓库里没有新增的文件级 `eslint-disable`
- 前后端现有测试数量不减、全部通过
- `.github/workflows/ci.yml` 在 `feature/nestjs-migration-stage-0-1` 上的最近一次运行四个 job 全绿
