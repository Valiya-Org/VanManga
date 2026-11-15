# P3b · 前端页面与组件设计

日期：2026-11-14
上级文档：`2026-11-14-migration-completion-roadmap-design.md` 第 7 节
前置：P3a（工具链与数据层，见 `docs/frontend-data-layer.md`）已完成

## 1. 范围

在现有数据层之上做完所有页面和组件，替换 `/` 与 `/settings` 两个占位页。不改后端接口，不改 store 的对外形状（发现数据层缺口时可以补，但要在 `docs/frontend-data-layer.md` 里同步）。

## 2. 视觉（已与用户确认）

- **固定深色**，不跟随系统，不提供浅色模式。
- **克制的蓝 → 紫渐变**，接近 Jellyfin 标志：`linear-gradient(100deg, #00A4DC, #7B6FE0 55%, #AA5CC3)`。渐变只用在四处：标志里的 "Manga"、主按钮、"新"标记、进度条。其余界面是中性深灰。
- 色值（作为 CSS 变量 / Nuxt UI 主题定义在一处）：

  | 用途 | 值 |
  |---|---|
  | 页面底色 | `#121218` |
  | 顶栏 / 抽屉 / 浮层 | `#191922` |
  | 卡片 | `#1D1D28` |
  | 分隔线 | `#2B2B3A` |
  | 正文 | `#ECEBF5` |
  | 次要文字 | `#8C8AA3` |
  | 文字强调（章节名等） | `#B9A4F5` |
  | 危险操作 | `#FF8FA3` |

  Nuxt UI 的 `primary` 设为 violet 系，`neutral` 用偏冷的灰（zinc）。
- **标志**：顶栏左侧是 Valiya 星形图标（白色）+ 文字 "Van"（白色）+ "Manga"（渐变）。
  - 图标来自旧前端，用 `git show flask-final:frontend_src/vanmanga/src/assets/imgs/onlyLogo.png`（白色透明底）取出，放到 `frontend/src/assets/valiya-mark.png`；可以缩小尺寸，但不重画。
  - `favicon.ico` 同样从 `flask-final:frontend_src/vanmanga/public/favicon.ico` 取回，放 `frontend/public/`。
  - 设置页"关于"里显示完整的 Valiya 标志（`flask-final:frontend_src/vanmanga/src/assets/nativeLogo.png` 是黑色字，放在浅色小底板上或用 CSS `filter: invert(1)` 反白）。
- 圆角：卡片 8px，按钮与搜索框为胶囊形。字体用系统字体栈，含 `"Microsoft YaHei"`。

## 3. 界面

### 3.1 外壳

- 桌面（≥ 768px）顶栏：标志 · 搜索框（占满剩余宽度，占位文字"搜索并添加漫画…"）· 队列按钮（渐变，显示 `queue.count`，为 0 时显示"队列"且为描边样式）· 设置入口。
- 手机（< 768px）：顶栏只留标志和搜索框；底部固定三个标签——漫画库、队列（带数量角标）、设置。
- 实时连接：`realtime.offline` 为真时，在顶栏下方显示一条细提示"实时连接已断开，正在重连…"；队列抽屉底部显示连接状态点。
- 应用启动时：`config.load()`、`library.load()`、`useRealtime()` 各一次；注册 `session.setAdminTokenPrompt`。

### 3.2 漫画库（`/`）

- 工具行：左"共 N 部 · 按最近更新"，中间库内筛选输入框（绑定 `library.filter`），右"卡片 | 列表"切换（选择记在 `localStorage` 键 `vanmanga.libraryView`，读写包 try/catch）。
- 卡片视图：响应式网格（手机 2–3 列，桌面按宽度自动填充，最小卡宽约 150px）。每张卡：
  - 3:4 封面（懒加载，加载失败显示占位底色与标题首字）；
  - 左上"新"：`updated_at` 在最近 3 天内；
  - 右上"自动"：`download_switch` 为 0（按接口约定，0 表示自动更新开启）；
  - 封面底部叠加层：下载中显示"下载中 x / y 话"和进度条（`queue.progressOf`），排队中显示"排队中 · 第 n 位"；
  - 标题（单行截断，`title` 属性给全名）、最新章节（强调色）、相对更新时间（"2 小时前 / 昨天 / 3 天前 / 上周 / yyyy-MM-dd"）；从未下载的显示"尚未下载"；
  - 右下 ⋯ 菜单：开启/关闭自动更新、选择章节重新下载、在 Kavita 中打开（仅 `config.kavitaEnabled` 且已登录时出现）、删除。
- 列表视图：每行 = 小封面、标题 + 作者 · 最新章节（下载中则显示进度条）、更新时间、自动/手动标记、⋯ 菜单。
- 空状态：库为空时提示"还没有漫画，在上方搜索并添加"；筛选无结果时提示"没有匹配的漫画"。
- 加载失败：显示错误文案（`errors/messages.ts`）和"重试"。
- 删除：先弹确认框（写明会删除已下载文件），再走 `session.withAdmin`；`isMangaBusy` 为真时菜单里的删除与重下禁用并说明原因。

### 3.3 搜索并添加

- 在顶栏搜索框回车触发 `useMangaSearch().search`。结果在顶栏下方展开为一层面板（桌面：贴顶栏的下拉面板，库页面变暗留在后面；手机：全屏）。Esc、点击遮罩、"关闭 ✕"都能关，关闭时 `cancel()`。
- 状态：搜索中（骨架行）、结果列表、无结果、出错（文案 + 重试）。
- 每行：小封面、标题、作者 · 最新章节、右侧按钮——"添加" / 已在库中则是禁用的"已在库中" / 添加中转圈。
- 添加走 `library.add(candidate, { confirmDuplicate })`：
  - `added` → 成功提示，该行变"已在库中"；
  - 有相似标题 → 弹确认框列出相似的库内标题，"仍然添加 / 取消"；
  - `search-expired` → 提示"搜索结果已过期"，并提供一键 `research()`。

### 3.4 下载队列

- 桌面：右侧抽屉（宽约 360px）；手机：全屏页（由底部"队列"标签打开）。
- 内容：正在下载（标题、"已完成 x / y 话"、进度条；x 是已完成的话数，与卡片"下载中 x / y 话"同一口径。接口没有"正在下载哪一话"的字段，所以不显示当前章节名）；等待中列表（标题、范围说明）；空状态"当前没有下载任务"；底部连接状态。
- 只读：本期没有取消/调序接口，不做对应按钮。

### 3.5 章节选择

- 弹窗：标题"《名》· 选择章节"；打开时 `library.fetchChapters`（加载中 / 失败重试）；章节以可点选的小标签排布，支持全选、反选、显示"已选 n / 总数"；确认按钮"重新下载 n 话"，n 为 0 时禁用。确认后 `library.redownload`，成功提示并关闭。

### 3.6 设置（`/settings`）

- Kavita：`config.kavitaEnabled` 为假时显示"服务器未启用 Kavita"；否则未登录显示用户名 / 密码表单，已登录显示状态、"打开 Kavita"和"退出登录"。
- 维护："重新打包全部漫画"，确认后走 `session.withAdmin` 调 `library.rezip`。
- 关于：Valiya 标志、项目名、旧公告里仍然有效的说明文字（简短）。

### 3.7 管理口令对话框

- 由 `session.setAdminTokenPrompt` 注册的全局对话框：密码输入框、"确认 / 取消"；口令错误（再次 401）时在框内提示并允许重输；取消则原操作静默中止。口令只在内存。

## 4. 组件划分

```
src/
  App.vue                     启动逻辑 + <UApp>
  layouts/AppShell.vue        顶栏、手机底部标签、离线提示、挂载各浮层
  components/
    brand/BrandLogo.vue
    library/MangaCard.vue  MangaRow.vue  MangaActionsMenu.vue
            LibraryToolbar.vue  CoverImage.vue
    search/SearchPanel.vue  SearchResultRow.vue
    queue/QueueDrawer.vue  QueueContent.vue
    chapters/ChapterPickerDialog.vue
    common/AdminTokenDialog.vue  ConfirmDialog.vue  ProgressBar.vue
  composables/useRelativeTime.ts  useLibraryViewMode.ts  useMangaActions.ts
  views/LibraryView.vue  SettingsView.vue
```

`useMangaActions` 集中每部漫画的四个操作及其提示，卡片和列表行共用，组件本身不直接调 api。浮层的开关状态放一个小的 `ui` store（`searchOpen`、`queueOpen`、`chapterPickerFor`）。名字可按实现需要微调，但保持"一个文件一个职责"。

## 5. 交互与无障碍

- 所有可点元素能用键盘到达，⋯ 菜单、对话框、抽屉用 Nuxt UI 组件自带的焦点管理。
- 提示用 Nuxt UI toast；文案全部中文，错误文案统一取自 `errors/messages.ts`。
- 手机视口（375px 宽）不出现横向滚动。

## 6. 测试

- 组件单测（Vitest + @vue/test-utils，沿用 `src/test/fake-server.ts` 与 fixtures）：`MangaCard` 各状态、`MangaActionsMenu` 禁用逻辑、搜索添加流程（added / 相似确认 / 过期重搜 / 已在库中）、`QueueContent`、`ChapterPickerDialog`、`AdminTokenDialog`（重输与取消）、`SettingsView` 的 Kavita 三种状态、`useRelativeTime`。
- 端到端冒烟一条（Playwright，仅 chromium）：真实后端 + 假抓取器，`ADMIN_TOKEN` 已设置，走"搜索 → 添加 → 库里出现 → 删除（输入口令）→ 库里消失"。假抓取器通过后端现有的可配置点接入；若没有，就加一个最小的、仅测试使用的配置项，并在 `docs/api-contract.md` 之外的开发文档里说明。并入 CI 的一个新 job。
- 完成标准：`frontend` 的 lint、typecheck、test、build 全绿；后端测试不退步；端到端在 CI 通过；桌面（1280px）与手机（375px）视口下三项功能可用，并在真实浏览器里实际跑过一遍。

## 7. 不做

- 浅色模式、主题切换、多语言。
- 队列取消 / 调序、漫画详情页、阅读器。
- 后端接口变更（端到端所需的测试配置项除外）。
