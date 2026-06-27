# Local Blog v2 PRD / 技术方向

> 目标：为 oi-notebook 的 release 内置本地博客锁定长期架构方向，避免继续把当前 production blog 当成 Rust 字符串 HTML/CSS 页面局部修补。  
> 结论：Local Blog v2 采用 **Rust API + bundled local-blog frontend SPA**。Rust 负责数据、安全、assets 和静态文件服务；博客 UI、Markdown 渲染和交互由打包进应用的前端 SPA 负责。

---

## 1. 背景与问题

当前 production blog 已经完成了 v0.1 classmates preview 需要的基础能力：

- release 版应用可以启动本地 blog server。
- blog server 可以读取 app data 下的 `notes/`。
- 首页可以列出 notes。
- 单篇详情页可以打开。
- 支持基础 Markdown 渲染。
- 支持 `notes/assets/` 图片服务。
- 支持通过 KaTeX CDN 对公式做客户端渲染。

这些能力证明“release 下本地博客必须存在”这件事是正确的，但当前实现不是长期方案。当前 production blog 的页面由 `src-tauri/src/blog_server.rs` 在 Rust 中手写 HTML、CSS 和部分 Markdown 渲染逻辑。这会让页面天然接近“debug 页面 / notes 扫描结果页”：

- 首页主要像文件扫描结果：标题、路径、时间、摘要被直接铺出来，缺少正式博客的站点感、导航、文章流和信息层级。
- 文章页暴露原始路径、原始 timestamp 风格信息和 Markdown source，阅读体验像开发辅助页。
- 视觉样式通过 Rust 字符串内联维护，难以达到现有 Astro 博客那种完整页面结构和长期审美。
- Markdown 能力由 Rust 手写解析补丁式扩展，和桌面预览、Astro site 的渲染生态分裂。

Rust 手写 HTML 不是长期方案，原因不是 Rust 不适合提供本地服务，而是 Rust 不适合继续承担完整博客前端职责：

- 可维护性差：HTML、CSS、Markdown parser、frontmatter parser、路由、assets、安全逻辑混在同一个后端文件里。
- 扩展成本高：搜索、标签页、分类页、文章目录、代码复制、代码高亮、公式、图片 rewrite 每加一项都要继续扩大 Rust 字符串页面。
- 视觉复用困难：已有 Astro site 的 BaseLayout、首页、文章页、分类、标签、搜索、TOC、代码复制等能力无法自然复用。
- 渲染一致性差：桌面 MarkdownPreview、Astro site、release production blog 会形成三套 Markdown 行为。
- 打包职责混乱：release 不应运行 Node/pnpm，但也不应因此退化成后端手写页面。

博客是 oi-notebook 的核心能力，不能砍掉，也不能长期停留在“能打开”的状态。它承担的是 OI 笔记的复习、阅读、沉淀和展示入口：用户在桌面端快速写笔记，最终需要在一个接近正式个人博客的阅读界面中回看算法 trick、题解、公式、代码和图片。Local Blog v2 的目标是把这个能力从临时 production shell 升级成可维护、可打包、可长期扩展的本地博客架构。

---

## 2. 产品目标

Local Blog v2 必须满足以下产品目标：

- release 下读取 app data notes，而不是依赖 repo 内 `notes/`。
- 用户保存笔记后，刷新博客页面可以看到最新内容。
- 不要求同学安装 Node、pnpm、Astro CLI 或任何开发环境。
- 首页看起来像真正博客，有站点标题、导航、文章摘要流、分类/标签/搜索入口和舒适的信息层级。
- 文章页适合 OI 阅读：窄正文、清晰 metadata、可读代码块、公式、图片和可选目录。
- 支持 Markdown、KaTeX、代码高亮、图片、代码复制、标签、分类、搜索。
- 视觉接近正式博客 / Astro 风格，而不是 debug 页面或文件扫描器。
- 尽量减少桌面预览、local-blog、Astro site 三套 Markdown/样式行为长期分裂。
- 保持本地优先：断网时除外部 AI、Git push、Luogu 网络请求外，阅读本地博客应尽量可用。

---

## 3. 非目标

Local Blog v2 不承担以下目标：

- 不做云同步。Git/GitHub 同步是单独方向，不属于 Local Blog v2 第一阶段。
- 不做评论、留言板、访问统计等公开站点互动功能。
- 不做多人博客、权限系统或团队协作发布。
- 不做 release 运行时 Astro build。
- 不要求 release 环境运行 Node/pnpm。
- 不继续把 Rust HTML renderer 当最终方案。
- 第一阶段不追求一次性替换所有旧 blog 行为；迁移必须小步、可验证、可回滚。
- 不在第一阶段解决 Git 自动 push、Luogu 自动同步、AI 关联推荐等相邻核心能力。

---

## 4. 推荐架构

长期推荐架构明确锁定为：

```text
Tauri 应用
  └─ Rust 进程
      ├─ app data / notes 文件访问
      ├─ path 安全校验
      ├─ local blog HTTP server
      │   ├─ GET /api/notes
      │   ├─ GET /api/note?path=...
      │   ├─ GET /api/tags           可选
      │   ├─ GET /api/categories     可选
      │   ├─ GET /assets/...
      │   └─ serve bundled local-blog static files
      └─ bundled resources
          └─ local-blog/dist/

local-blog frontend SPA
  ├─ 首页
  ├─ 文章页
  ├─ 搜索页
  ├─ 标签/分类页
  ├─ Markdown 渲染
  ├─ KaTeX
  ├─ 代码高亮
  ├─ 代码复制
  └─ 博客视觉样式

site/Astro
  ├─ GitHub Pages / 公开博客方向
  └─ 与 local-blog 共享视觉 token、prose CSS、frontmatter shape 和渲染策略
```

Rust 负责：

- notes 读取：从 `paths::notes_dir()` 获取 notes 根目录，debug 读 repo，release 读 app data。
- path 安全：保留字符串过滤 + canonicalize 前缀校验的两层安全思路，不接受 `../`、绝对路径、反斜杠逃逸、NUL 字符等危险路径。
- `GET /api/notes`：返回博客首页、搜索、标签/分类派生所需的 note 列表 JSON。
- `GET /api/note?path=...`：返回单篇 note 的 metadata 和 markdown body。
- `GET /assets/...`：只服务 `notes/assets/` 下允许类型的图片资源。
- serve bundled local-blog static files：release 中直接服务 `local-blog/dist` 的 HTML、JS、CSS、字体和其他静态资源。

local-blog frontend 负责：

- 首页：站点标题、导航、文章摘要流、分类/标签/搜索入口、空状态、错误状态。
- 文章页：标题、日期、标签/分类、正文、图片、公式、代码块、高亮、复制按钮、可选 TOC。
- 搜索：第一阶段可在前端基于 `/api/notes` 做内存搜索，后续再接 SQLite FTS5 或专门索引 API。
- 标签/分类：可从 `/api/notes` 派生，也可以后续接 `/api/tags`、`/api/categories`。
- Markdown 渲染：优先使用前端生态的 unified/remark/rehype、KaTeX、Shiki 或等价方案。
- 视觉样式：向正式个人博客 / 当前 Astro site 靠拢，避免 debug 风。

release 运行时不调用 Node/pnpm。开发或打包时才构建 `local-blog/dist`，然后由 Tauri/Rust 打进应用或作为资源服务。用户机器只运行打包后的应用和 Rust 内置本地服务。

---

## 5. 推荐目录结构

建议新增以下目录，分阶段落地：

```text
oi-notebook/
├─ local-blog/
│  ├─ package.json
│  ├─ index.html
│  ├─ src/
│  │  ├─ main.tsx
│  │  ├─ App.tsx
│  │  ├─ api.ts
│  │  ├─ routes/
│  │  ├─ components/
│  │  ├─ markdown/
│  │  └─ styles/
│  └─ dist/
├─ shared/
│  ├─ blog/
│  │  ├─ frontmatter.ts
│  │  ├─ excerpt.ts
│  │  ├─ sort.ts
│  │  ├─ category.ts
│  │  └─ tags.ts
│  └─ styles/
│     ├─ blog-tokens.css
│     └─ prose.css
└─ site/
   └─ ... Astro 公开博客
```

也可以选择 `packages/blog-core/` 和 `packages/blog-theme/`，但在当前 repo 体量下，先用 `shared/blog/` 与 `shared/styles/` 更轻。是否改成 workspace package，应等真正出现跨项目 import、独立测试和版本边界需求后再决定。

`local-blog/` 与现有 `site/` 的关系：

- `site/` 继续作为 Astro / GitHub Pages / 公开博客方向。
- `local-blog/` 是 release 内置动态博客，不运行 Astro，不在用户机器上 build。
- 两者视觉应接近，但不要求一开始共享所有组件。
- 两者数据源不同：`site/` 在 build/dev 时读取 notes 内容集合；`local-blog/` 在运行时通过 Rust API 读取 app data notes。

未来应共享：

- frontmatter shape。
- note list item 类型约定。
- excerpt 生成规则。
- sort 规则。
- category/tag helper。
- prose CSS。
- 视觉 token：颜色、字体、间距、边框、文章宽度、代码块主题。
- Markdown plugin 配置：remark-gfm、remark-math、rehype-katex、Shiki 主题、图片 URL rewrite 策略。

可以暂时分开：

- Astro 的 `getCollection()` 使用方式。
- local-blog 的 fetch/cache/loading/error 状态管理。
- local-blog 的客户端路由。
- GitHub Pages base path 处理。
- release static resource serving 细节。

---

## 6. API 草案

### 6.1 `GET /api/notes`

用途：返回博客列表页、搜索页、标签/分类派生所需的 note 摘要列表。

响应：

```json
{
  "notes": [
    {
      "title": "李超线段树笔记",
      "relativePath": "tricks/li-chao-tree.md",
      "summary": "用于维护直线集合并查询最大/最小值的技巧。",
      "excerpt": "如果 summary 为空，从正文生成的摘要。",
      "tags": ["数据结构", "李超线段树"],
      "category": "tricks",
      "created": "2026-05-01T10:00:00+08:00",
      "updated": "2026-05-06T20:30:00+08:00",
      "date": "2026-05-06T20:30:00+08:00",
      "sortKey": "2026-05-06T20:30:00+08:00",
      "draft": false
    }
  ]
}
```

字段要求：

- `title`：frontmatter `title`，为空时使用文件名 fallback。
- `relativePath`：相对 notes 根目录的 `/` 分隔路径，必须保留中文路径和 Unicode。
- `summary`：frontmatter `summary`，没有则为空字符串。
- `excerpt`：优先使用 `summary`；否则从正文剔除 frontmatter、代码块、Markdown 标记后生成。
- `tags`：frontmatter `tags`，支持 inline 和 block 两种 YAML 写法。
- `category`：`relativePath` 第一段，例如 `tricks`、`problems`、`luogu`、`inbox`。
- `created`：frontmatter `created`，不存在时为 `null` 或空值。
- `updated`：frontmatter `updated`，不存在时为 `null` 或空值。
- `date`：展示用日期，优先 `updated`，其次 `created`，最后文件 modified time。
- `sortKey`：排序用字段，优先 `updated`，其次 `created`，最后文件 modified time。
- `draft`：frontmatter `draft`，默认 `false`。

排序：

- 默认按 `sortKey` 倒序。
- `sortKey` 相同按 `relativePath` 升序，保证稳定输出。

draft 处理：

- `/api/notes` 第一阶段建议返回 `draft` 字段，不在 Rust API 层隐藏 draft。
- local-blog 可以先显示 draft badge，后续根据“本地预览显示 draft / 公开 site 过滤 draft”的产品规则再决定是否提供 `?includeDrafts=false`。

### 6.2 `GET /api/note?path=...`

用途：返回单篇文章页所需的 metadata 和 Markdown body。

请求：

```text
GET /api/note?path=tricks/li-chao-tree.md
```

响应：

```json
{
  "relativePath": "tricks/li-chao-tree.md",
  "category": "tricks",
  "title": "李超线段树笔记",
  "tags": ["数据结构", "李超线段树"],
  "created": "2026-05-01T10:00:00+08:00",
  "updated": "2026-05-06T20:30:00+08:00",
  "metadata": {
    "title": "李超线段树笔记",
    "summary": "用于维护直线集合并查询最大/最小值的技巧。",
    "tags": ["数据结构", "李超线段树"],
    "difficulty": "提高+",
    "source": "luogu-P4097",
    "created": "2026-05-01T10:00:00+08:00",
    "updated": "2026-05-06T20:30:00+08:00",
    "draft": false
  },
  "body": "## 思路\n\n正文 Markdown 内容..."
}
```

要求：

- `path` 必须经过 percent decode 和 path safety 校验。
- 只允许读取 notes 根目录内的 `.md` 文件。
- 不允许读取 `notes/assets/` 下的 markdown 文件。
- 返回 body 时应去掉 frontmatter，只返回正文 Markdown。
- 404 时返回 JSON error，不返回 HTML debug 页。

### 6.3 `GET /assets/{path}`

用途：服务 note 图片。

要求：

- 路径根目录固定为 `paths::notes_dir()/assets`。
- 保留两层安全校验：先拒绝不安全相对路径，再 canonicalize root 和 candidate 并验证 candidate 在 root 内。
- 允许的扩展名第一阶段保持为 `png`、`jpg`、`jpeg`、`webp`、`gif`、`svg`。
- 返回正确 `Content-Type`。
- 不服务任意文件，不服务 note markdown。

### 6.4 可选 API

`GET /api/tags`：

```json
{
  "tags": [
    { "name": "dp", "count": 12 },
    { "name": "图论", "count": 5 }
  ]
}
```

`GET /api/categories`：

```json
{
  "categories": [
    { "key": "tricks", "name": "技巧笔记", "count": 12 },
    { "key": "problems", "name": "题解笔记", "count": 8 },
    { "key": "luogu", "name": "洛谷沉淀", "count": 3 },
    { "key": "inbox", "name": "速记草稿", "count": 4 }
  ]
}
```

第一阶段不一定需要这两个 API。local-blog 可以先从 `/api/notes` 派生 tags/categories，等性能或契约需要明确后再下沉到 Rust。

---

## 7. Local Blog 页面设计

### 7.1 首页

首页必须像正式博客，而不是 notes scan result。需要包含：

- 顶部导航：`首页`、`文章`、`分类`、`标签`、`搜索`。
- 站点标题：`OI Notebook`。
- 站点副标题：一句轻量说明，例如“算法笔记与题解的本地博客”。
- 文章摘要流：
  - 最新文章可以作为 featured post。
  - 后续文章以摘要卡片或文章流排列。
  - 每项显示分类、格式化日期、标题、摘要、标签、阅读链接。
- 标签/分类入口：
  - 首页底部或侧边轻量入口。
  - 不要用后台管理式筛选面板作为首屏核心。
- 搜索入口：
  - 顶部 nav 和首页入口都可进入搜索。
  - 第一阶段可跳转到 `/search`，也可页面内输入过滤。
- 空状态：
  - 没有 notes 时显示温和提示，引导用户在桌面端写第一篇 Markdown。
  - 不显示“扫描结果为空”这类 debug 文案。
- 错误状态：
  - API 失败时说明“本地博客暂时无法读取笔记”，并给刷新入口。
  - 不直接暴露 Rust panic、filesystem 原始错误作为主要视觉。

### 7.2 文章页

文章页必须适合 OI 阅读。需要包含：

- 返回首页或返回文章列表。
- 标题。
- 格式化日期：优先展示更新日期，可轻量显示创建日期。
- 标签/分类：可点击跳转。
- 正文：
  - 单列窄正文，保证长文阅读舒适。
  - 数学公式清晰。
  - 代码块对 OI/C++ 友好。
  - 图片自适应宽度。
- 代码块复制：
  - 每个代码块右上角有复制按钮。
  - 成功/失败状态短暂反馈。
- 公式：
  - 支持 `$...$` 与 `$$...$$`。
  - 公式样式与正文间距协调。
- 图片：
  - Markdown 中的 `assets/...`、`../assets/...` 等路径需要 rewrite 到 `/assets/...`。
  - 图片不应撑破正文。
- 可选 TOC：
  - h2/h3 生成目录。
  - 桌面端可右侧 sticky，窄屏回到正文上方。

---

## 8. 视觉方向

Local Blog v2 的视觉方向：

- 白色主题优先。
- 接近正式个人博客 / Astro 风格，而不是桌面工具 UI。
- 大留白，低噪音，薄分隔线。
- 清晰导航，首屏就能感知“这是一个博客站点”。
- 首页使用文章卡片或摘要流，不是文件表格。
- 文章页正文优先，metadata 弱化为辅助信息。
- OI 友好的代码块和公式：
  - 浅色代码高亮，例如 `github-light` 或接近现有 Astro site 的主题。
  - 行内代码、代码块、公式和表格都有清晰间距。
- 不要 debug 风：
  - 不用 “Local preview from your Markdown notes” 这类开发说明作为主文案。
  - 不把 `relativePath` 当成主要视觉信息。
  - 不默认展开 Markdown source。
  - 不显示原始 UNIX timestamp 或未格式化 ISO 字符串。
- 文件路径可以作为辅助信息存在于调试细节或小号 metadata 中，但不作为文章卡片和文章页的主要信息。

---

## 9. Markdown 渲染策略

Markdown 渲染应放在 local-blog 前端，而不是继续扩展 Rust 手写 renderer。

推荐策略：

- 使用 unified / remark / rehype 管线渲染 Markdown。
- 支持 `remark-gfm`，覆盖表格、任务列表、删除线等常见 Markdown。
- 支持 `remark-math` + `rehype-katex` 渲染 KaTeX。
- 支持 Shiki 或等价代码高亮方案。
- 代码块复制由前端 DOM 装饰或组件渲染实现。
- 图片 URL 统一 rewrite 到 `/assets/...`：
  - `assets/a.png` -> `/assets/a.png`
  - `../assets/a.png` -> `/assets/a.png`
  - `../../assets/sub/a.png` -> `/assets/sub/a.png`
  - 外部 URL 保持不变。
  - `javascript:`、危险协议、逃逸到 assets 外的路径必须拒绝或忽略。
- HTML 安全：
  - 当前本地用户内容可以接受较宽松策略。
  - 一旦引入远程内容或外部导入，应加 `rehype-sanitize` 或明确白名单。

与现有桌面预览对齐：

- `MarkdownPreview.tsx` 已有异步 `renderMarkdown`、图片 rewrite、代码复制按钮和 race condition 防护。
- local-blog 应尽量复用或对齐这条渲染管线，而不是重新发明一套。
- 代码复制文案、Shiki 主题、KaTeX 间距、表格样式、图片处理应逐步统一。

与 Astro site 对齐：

- Astro site 已有 `remarkMath`、`rehypeKatex`、Shiki `github-light`、note assets rewrite、copy buttons。
- local-blog 的 Markdown plugin 配置应和 Astro site 对齐，最终沉淀到共享配置或共享 helper。

目标是避免长期形成：

```text
desktop preview Markdown 行为
local-blog Markdown 行为
Astro site Markdown 行为
```

三套互相漂移的局面。

---

## 10. 与现有 site/Astro 的关系

`site/` 继续作为 GitHub Pages / 公开博客方向：

- 它适合 build 成静态站。
- 它适合由 GitHub Actions 发布。
- 它可以继续使用 Astro content collection。
- 它可以继续过滤 production draft。

`local-blog/` 作为 release 内置动态博客：

- 它不要求用户机器安装 Node/pnpm。
- 它不在 release 运行时调用 Astro。
- 它通过 Rust API 读取 app data notes。
- 它通过刷新页面或重新 fetch API 看到保存后的最新笔记。

后续共享方向：

- 视觉 token：颜色、字体、正文宽度、间距、border、accent。
- prose CSS：正文、标题、列表、表格、代码块、引用、图片、KaTeX。
- frontmatter shape：字段名、默认值、draft 语义。
- excerpt helper：summary fallback 和正文摘要生成。
- sort helper：`updated ?? created ?? modified` 倒序。
- tag/category helper：目录到分类、tag normalize、中文 tag URL encode。
- Markdown plugin 配置：GFM、math、KaTeX、Shiki、assets rewrite。

关键原则：

- `site/` 和 `local-blog/` 可以有不同运行时，但不能在产品表现上长期变成两个完全不同的博客。
- `site/` 不应被迫改成 release 运行时依赖。
- `local-blog/` 不应复制 Astro 的每行实现，但应复用其视觉和内容处理决策。

---

## 11. 分阶段迁移计划

每个阶段都必须小、可验证、可回滚。

### Phase 1: 新增 `/api/notes`

- 在 Rust production blog server 中新增 JSON route。
- 返回 note list metadata。
- 不改变现有 `/`、`/note/`、`/assets/`。
- 验证 app data notes 可读、Unicode path 正常、assets 被跳过。

### Phase 2: 新增 `/api/note`

- 新增单篇 note JSON route。
- 复用 path safety。
- 返回 metadata 和去掉 frontmatter 的 Markdown body。
- 不替换旧详情页。

### Phase 3: 新增 local-blog skeleton

- 新增 `local-blog/` 最小前端项目。
- 只实现静态 shell、路由骨架、基础样式 token。
- 暂时可以 mock 数据或 fetch `/api/notes`。

### Phase 4: Rust serve bundled local-blog static shell

- 构建 `local-blog/dist`。
- Rust server 能服务 dist 里的 `index.html`、JS、CSS。
- 保留旧 Rust HTML fallback，便于回滚。

### Phase 5: local-blog 首页读取 `/api/notes`

- 首页由 SPA fetch `/api/notes`。
- 显示站点标题、导航、文章摘要流、空状态、错误状态。
- 验证保存新笔记后刷新可见。

### Phase 6: local-blog 文章页读取 `/api/note`

- 文章页根据 path fetch `/api/note`。
- 显示标题、日期、分类、标签和 Markdown body placeholder。
- 验证中文 path、嵌套目录、draft metadata。

### Phase 7: Markdown/KaTeX/Shiki/图片/复制

- 接入统一 Markdown 渲染管线。
- 支持 KaTeX。
- 支持代码高亮。
- 支持图片 URL rewrite 到 `/assets/...`。
- 支持代码复制。
- 和桌面预览、Astro site 对齐行为。

### Phase 8: 搜索/标签/分类

- 先基于 `/api/notes` 做前端内存搜索和 tags/categories 派生。
- 支持中文和英文 substring 搜索。
- 支持 `/tags`、`/tags/:tag`、`/categories`、`/categories/:category`。
- 后续如性能需要，再接 `/api/tags`、`/api/categories` 或 SQLite FTS5。

### Phase 9: 替换旧 Rust HTML 页面

- 将 `/` 默认指向 bundled local-blog shell。
- 旧 Rust HTML renderer 只保留为 fallback 或删除。
- Rust server 专注 API、assets 和 static serving。

### Phase 10: 和 Astro/site 视觉统一与打包验证

- 抽共享 prose CSS / tokens / helpers。
- 验证 local-blog 与 Astro site 首页、文章页、代码块、公式、标签/分类视觉接近。
- 完成 release build smoke test。
- 确认 release 不依赖 Node/pnpm。

---

## 12. Phase 1 详细实现草案

Phase 1 是第一刀，目标是新增 `GET /api/notes` JSON，而不是继续美化当前 Rust HTML。

### route

```text
GET /api/notes
```

路由要求：

- 在 `handle_connection` 中识别 `/api/notes`。
- 不影响现有 `/`、`/note/`、`/assets/`。
- 保持 `/assets/` 在 `/note/` 前匹配的要求。
- 仅支持 GET；其他 method 返回 400 或 405。

### response JSON

响应示例：

```json
{
  "notes": [
    {
      "title": "Demo",
      "relativePath": "tricks/demo.md",
      "summary": "frontmatter summary",
      "excerpt": "frontmatter summary",
      "tags": ["dp", "test"],
      "category": "tricks",
      "created": "2026-05-01T00:00:00+08:00",
      "updated": "2026-05-06T12:00:00+08:00",
      "date": "2026-05-06T12:00:00+08:00",
      "sortKey": "2026-05-06T12:00:00+08:00",
      "draft": false
    }
  ]
}
```

Content-Type：

```text
application/json; charset=utf-8
```

### path safety

`/api/notes` 本身不接收用户 path，但 scan notes 时仍必须保证：

- 根目录来自 `paths::notes_dir()`。
- 只扫描 notes 根目录下的 `.md` 文件。
- 不进入 `notes/assets/`。
- 输出的 `relativePath` 只能是 notes 根目录内的相对路径。
- Windows `\` 输出时统一转成 `/`。

### draft 处理

Phase 1 不过滤 draft，返回 `draft` 字段：

- local-blog 是本地动态博客，默认可以显示 draft。
- 公开 Astro site 的 production build 可以继续过滤 draft。
- 后续如需要，可扩展 `GET /api/notes?includeDrafts=false`。

### assets 跳过

必须跳过：

- `notes/assets/`
- `notes/assets/**/*.md`
- 图片或其他非 `.md` 文件

这避免把 assets 目录误当文章分类，也避免首页出现资源文件。

### Unicode path

必须支持：

- 中文文件名。
- 中文目录名。
- tag 中的中文。
- percent encode/decode 的路径在后续 `/api/note` 中可 round-trip。

Phase 1 至少要保证 `/api/notes` 输出的 `relativePath` 是合法 UTF-8 字符串，并且前端可以拿它作为后续 `/api/note?path=` 的输入。

### sort 规则

默认排序：

1. `updated` 倒序。
2. 没有 `updated` 时使用 `created`。
3. 没有 frontmatter 日期时使用文件 modified time。
4. 日期相同按 `relativePath` 升序。

`sortKey` 应与实际排序依据一致，便于前端调试和稳定二次排序。

### 单元测试建议

建议新增聚焦 Rust 单元测试：

- `GET /api/notes` 或底层 JSON serializer 返回所有必要字段。
- inline tags 和 block tags 都能进入 JSON。
- `draft: true` 能正确返回。
- `notes/assets/ignored.md` 被跳过。
- 中文路径输出不丢失。
- 排序按 `updated ?? created ?? modified` 倒序。
- JSON 中 title、summary、tags 里的特殊字符被正确转义。
- route 不影响现有 `/`、`/note/`、`/assets/`。

### 不影响旧行为

Phase 1 是架构验证，不是页面替换：

- `/` 继续显示旧 Rust HTML 首页。
- `/note/{path}` 继续显示旧 Rust HTML 详情页。
- `/assets/{path}` 继续服务图片。
- 新增 `/api/notes` 后，旧 UI 即使不好看，也不在这一刀修。

---

## 13. 验收标准

Local Blog v2 最终验收标准：

- release 下不依赖 Node/pnpm。
- release 下读取 app data notes。
- 新保存笔记后，刷新本地博客可以看到更新。
- 首页不像 debug 页面，有正式博客的导航、站点感和文章摘要流。
- 文章页适合 OI 阅读：正文舒适、metadata 清晰、代码和公式可读。
- Markdown 渲染稳定。
- KaTeX 公式正常渲染。
- 代码高亮正常。
- 图片通过 `/assets/...` 正常显示。
- 代码块复制按钮可用。
- 标签、分类、搜索可用。
- 中文路径、中文 tag、中文标题可用。
- 打包 smoke test 通过。
- release 打开博客时不要求用户安装任何开发依赖。

Phase 1 验收标准：

- `/api/notes` 返回 JSON。
- Content-Type 是 `application/json; charset=utf-8`。
- 返回字段包含 title、relativePath、summary、excerpt、tags、category、created、updated、date、sortKey、draft。
- 读取路径来自 `paths::notes_dir()`。
- `notes/assets/` 被跳过。
- Unicode path 不破坏。
- 现有 `/`、`/note/`、`/assets/` 行为不变。

---

## 14. 风险与取舍

### local-blog 和 site 分裂风险

风险：`local-blog/` 和 `site/` 使用不同运行时，可能逐渐变成两个视觉和渲染行为不同的博客。

取舍：

- 不强行让 release 运行 Astro。
- 通过共享 token、prose CSS、frontmatter shape、excerpt/sort/tag/category helpers、Markdown plugin 配置来降低分裂。
- 先允许局部重复，等稳定后抽共享层。

### 资源打包路径

风险：Tauri resource path、Rust static serving path、Vite asset base path 在 debug/release 下容易不一致。

取舍：

- Phase 4 单独验证 static shell serving。
- local-blog 前端使用相对 asset URL 或明确 base。
- release smoke test 必须覆盖打开 `/`、刷新文章页、加载 JS/CSS。

### Windows 路径和中文路径

风险：Windows `\`、盘符、中文路径、percent encode/decode 容易导致 API path 不一致。

取舍：

- API 输出统一 `/` 分隔的 `relativePath`。
- 后续 `/api/note?path=` 必须 percent decode 后走 path safety。
- 单元测试覆盖中文路径。

### Markdown 安全

风险：本地 Markdown 允许 HTML 时有 XSS 风险，未来如果引入远程内容风险更高。

取舍：

- 本地用户内容阶段可以保持较宽松。
- API 返回 Markdown，不返回 Rust 拼好的 HTML。
- 前端 Markdown 管线应预留 sanitize 开关或白名单策略。

### 搜索性能

风险：note 数量增加后，前端内存搜索可能变慢。

取舍：

- 第一阶段用 `/api/notes` 内存搜索，简单可验证。
- 当笔记规模变大，再接 SQLite FTS5 或 Rust 侧搜索 API。
- 不在 v2 第一刀引入搜索索引复杂度。

### Shiki/KaTeX 体积

风险：Shiki 和 KaTeX 可能增加 bundle 体积。

取舍：

- 首先保证阅读效果。
- 可以选择固定少量语言和主题。
- 后续再做 lazy load、按语言加载或构建时裁剪。

### 离线可用性

风险：当前 production blog 公式使用 CDN，断网时不可用。

取舍：

- Local Blog v2 应把 KaTeX CSS/JS 或渲染逻辑打包进 local-blog bundle。
- 不依赖 CDN 完成核心阅读。

### 旧 Rust HTML renderer 迁移期间兼容

风险：直接替换旧 `/` 页面可能影响 v0.1 classmates preview 的已验收行为。

取舍：

- 迁移阶段保留旧 renderer fallback。
- 先新增 API，再新增 local-blog shell，再切入口。
- 每一步都能回滚到旧 Rust HTML 页面。

---

## 15. 下一步建议

下一步建议先做 Phase 1：新增 `GET /api/notes` JSON。

这一步是最小架构验证：

- 不碰桌面 UI。
- 不碰 AI。
- 不碰 Luogu。
- 不碰 `notes/**`。
- 不继续美化 Rust HTML/CSS。
- 证明 release blog 的长期数据接口可以从 app data notes 直接服务 frontend SPA。

完成 Phase 1 后，再进入 Phase 2 `/api/note`，随后才新增 `local-blog/` skeleton。
