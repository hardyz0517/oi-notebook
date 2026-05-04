# HANDOFF.md — 新对话窗口交接文档

这份文档是接手 Hardy 的 OI Notebook 项目时的操作手册。它记录当前真实进度、协作规则、技术约定和已知坑。开始任何任务前，请先读：

1. `AGENTS.md`
2. `PROJECT.md`
3. `docs/HANDOFF.md`
4. `docs/OI-Notebook-PRD-v1.md`

**最后更新**：2026-05-04（记录删除/重命名笔记自动 Git commit 验收）
**项目仓库**：https://github.com/hardyz0517/oi-notebook

---

## 1. 一句话介绍

**OI Notebook** 是一个为竞赛选手（OIer）设计的桌面笔记工具，用 Tauri + React 构建，支持实时 Markdown 预览（含 LaTeX 和代码高亮），未来会集成 Astro 本地博客、洛谷爬虫、多 AI 适配。Hardy 主要通过自然语言协作推进项目：他下指令、review 结果，coding agent 负责实现。

---

## 2. Hardy 是谁，他怎么工作

### 基本信息

- **身份**：OIer（竞赛选手），训练节奏紧凑
- **技术背景**：写 C++ 代码做算法题没问题，但前端、Rust、Git 等都是零基础
- **目标**：做一个让自己训练间隙能快速记录 trick 的工具
- **协作方式**：默认由 Codex 执行具体任务；复杂任务先拆细、审计清楚，再一件一件交给 Codex 落地

### 他的工作方式（非常重要）

1. **他不会直接写项目代码，但判断力很强**。他会看代码、看截图、发现不协调的地方，能指出“中栏发灰”“没有滚动同步”这种细节。
2. **他要求每次编辑后打印完整真实文件内容**，不要折叠、不要省略、不要只给 diff。
3. **他愿意等待**。如果某个决策需要研究清楚再定，他会等你搜资料、读真实文件、验证。
4. **他说“不太一样”时要认真接住**。那通常表示他观察到了具体差异。
5. **他倾向一次只推进一个明确里程碑**，做到可验证、可提交，再进入下一步。

### 他的审美

- **编辑器（桌面应用侧）**：Lyra shadcn preset 深色主题，锐角、等宽字体、紧凑、开发者气质。
- **博客（未来 Astro 侧）**：完全相反，走文人博客风格：亮色、衬线字体、留白充裕、杂志卡片式排版。细节见 `PROJECT.md` 的 “Blog Design Direction”。

---

## 3. 当前进度地图

```
[x] Phase 0  脚手架                                    commit fa647d6
    ├─ Tauri 2 + React + TypeScript + Vite
    ├─ Tailwind CSS v4
    ├─ shadcn/ui with Lyra preset
    └─ 三栏布局骨架

[x] Phase 1  编辑器核心                                commit 0ff13f0
    ├─ CodeMirror 6 左侧编辑器（Markdown 语法高亮、oneDark）
    ├─ unified/remark/rehype 右侧预览管线
    ├─ KaTeX 数学公式渲染
    ├─ @shikijs/rehype 代码语法高亮
    └─ 编辑器和预览联动（输入 -> 预览更新）

[x] Phase 2  文件系统 IPC + 滚动同步 + 视觉打磨        commit d581c00
    ├─ Rust: notes.rs 模块，含 list/read/write/delete
    ├─ 两层路径安全校验（字符串过滤 + canonicalize starts_with）
    ├─ 前端: src/lib/api.ts IPC 抽象层
    ├─ 前端: FileTree 组件
    ├─ App.tsx 接入后端：挂载时列举 + 点击加载
    └─ 编辑器 -> 预览滚动同步

[x] Phase 3  保存与新建
    ├─ Ctrl+S 保存（sonner toast 反馈）
    ├─ Dirty 状态追踪 + Header 显示文件名 + 圆点指示
    ├─ 切换文件时 window.confirm 拦截未保存改动
    ├─ 新建笔记按钮与 Dialog
    ├─ 重命名笔记
    ├─ 删除笔记
    └─ Rust 端 rename_note 命令

[x] Phase 4  全局速记
    ├─ 第二个窗口 quick-note 脚手架
    ├─ QuickNoteApp.tsx textarea + Ctrl+Enter 保存 + Esc 取消
    ├─ tauri-plugin-global-shortcut：Ctrl+Alt+Space 召唤/隐藏速记窗口
    ├─ 速记保存后 emit "notes-changed"，主窗口刷新文件列表
    ├─ 系统托盘：显示主窗口/显示速记/退出
    └─ 关闭主窗口时 hide，保留后台托盘和全局快捷键

[~] Phase 5  本地博客
    ├─ Astro 子项目 site/ 已初始化，独立 pnpm install/dev/build
    ├─ 内容集合读取 notes/**/*.md，首页列出笔记，文章页渲染正文
    ├─ Draft 标记已显示，端到端 build 验证已通过
    ├─ Tauri 启动时后台启动 Astro dev server，托盘退出时清理进程树
    ├─ Header 已有“打开博客”入口，打开 http://localhost:4321
    ├─ Astro dev server 已监听外部 notes/**/*.md 变化并刷新
    ├─ 博客端 Markdown 已支持数学公式渲染、基础表格样式和浅色代码块
    ├─ 首页已调整为文章优先的博客文章流，文章页 metadata 已中文化并弱化
    ├─ 分类总览页与分类详情页已完成
    ├─ 标签总览页与标签详情页已完成，中文 tag 路由已修复
    ├─ 文章页目录 TOC 已完成，桌面端为右侧 sticky，窄屏回到正文上方
    ├─ category/tag 已可点击跳转，文章页已有上一篇/下一篇导航
    ├─ 搜索页 /search 已完成，顶部导航已有“搜索”入口
    ├─ GitHub Pages project page 已完成部署，线上站 https://hardyz0517.github.io/oi-notebook/ 已验收
    ├─ Header 已有“打开博客”“重启博客”和“同步 Git”入口
    ├─ 保存、图片 assets、删除和重命名笔记均已有对应自动 commit；手动“同步 Git”按钮执行 git push origin main，均已验收
    ├─ 主窗口已有 Frontmatter 折叠表单，支持 title/tags/summary/draft/difficulty/source，已验收
    ├─ 主窗口新建笔记已有模板选择，支持空白/Trick 模板/题解模板，已验收
    ├─ 主窗口 CodeMirror 已支持粘贴图片到 notes/assets，保存时当前 note 和本轮 assets 一起自动 commit，已验收
    ├─ 右侧 MarkdownPreview 已支持显示 notes/assets 图片，已验收
    └─ 未完成：生产分发策略、自动定时/退出时 push、洛谷网络爬取、AI 辅助、博客视觉继续打磨

[~] Phase 6  洛谷爬虫
    ├─ @oinb-insight 本地导入 MVP 已完成
    ├─ 洛谷配置存储 MVP 已完成：`.oinb/config.json`
    └─ 未完成：网络请求、Cookie 验证、增量抓取提交

[ ] Phase 7  AI 辅助整理
    └─ OpenAI-compatible providers + OpenRouter-compatible routing

[ ] Phase 8  打磨阶段
    ├─ 审美升级（目前只做功能，UI 统一在这个阶段打磨）
    ├─ 博客模板向文人博客风格调整
    └─ 光标颜色等小细节
```

---

## 4. 技术栈与关键决策

| 层 | 选择 | 关键理由 |
|---|---|---|
| 桌面壳 | **Tauri 2.0**（不是 Electron） | 冷启快、包体小，适合训练间隙快速记录 |
| 前端 | React + TypeScript + Vite | 生态成熟 |
| UI | shadcn/ui + Tailwind v4 | 组件可定制，不被库绑架 |
| Toast | sonner | shadcn 社区常用方案 |
| Preset | **Lyra** | 锐角 + 等宽字体，开发者工具气质 |
| Icon | **Lucide** | shadcn 社区事实标准 |
| 全局快捷键 | tauri-plugin-global-shortcut 2.x | Tauri 2 官方插件生态 |
| 系统托盘 | tauri tray-icon feature | Windows 托盘常驻入口 |
| 编辑器 | **CodeMirror 6** 原生 API | 控制力强，适合左写 md 右预览 |
| Markdown | unified + remark + rehype | 事实标准，插件生态完整 |
| 数学 | **KaTeX** | 快，适合实时预览 |
| 代码高亮 | **@shikijs/rehype** | 官方维护的 Shiki rehype 集成 |
| 博客（部分完成） | **Astro** | `site/` 子项目已初始化，直接读取 `notes/**/*.md` |
| AI（未做） | OpenAI-compatible providers | DeepSeek/Kimi/GLM/通义/OpenRouter 等可走统一适配 |

其它重要决策：

- **笔记存储位置**：`notes/`（仓库内），跟着 git 走，未来 Astro 博客直接读。
- **包管理器**：pnpm。
- **序列化**：Rust -> 前端结构体一律 `#[serde(rename_all = "camelCase")]`。
- **IPC 抽象**：所有前端 -> Rust 调用走 `src/lib/api.ts`，不要在业务组件里直接 invoke。
- **多窗口架构**：主窗口 + quick-note 窗口共享 `src/lib/api.ts`，独立 React 入口，同一 Rust 后端进程。
- **全局快捷键**：实际使用 Ctrl+Alt+Space，而不是 PRD 里的 Ctrl+Shift+Space，后者容易被 Windows 中文输入法占用。

---

## 5. 环境配置

Hardy 的电脑是 Windows 11，开发工具装在 `D:\Dev`：

```text
D:\Dev\
├── Apps\
├── Env\
│   ├── node-js\
│   ├── Git\
│   ├── rust\
│   │   ├── cargo\
│   │   └── rustup\
│   ├── mingw64\
│   └── Python314\
└── Projects\
    ├── oi-notebook\
    └── oi-coach\
```

关键环境变量：

- `RUSTUP_HOME = D:\Dev\Env\rust\rustup`
- `CARGO_HOME = D:\Dev\Env\rust\cargo`
- npm prefix/cache 已指向 `D:\Dev\Env\node-js`

注意：PowerShell 里直接跑 `pnpm` 可能被 `.ps1` execution policy 拦住，可用 `pnpm.cmd`。Rust 命令若 PATH 找不到 `cargo`，可显式设置 `RUSTUP_HOME` / `CARGO_HOME` 后调用 `D:\Dev\Env\rust\cargo\bin\cargo.exe`。

---

## 6. 约定、雷区、已知问题

### 代码 review 约定

Hardy 有一个硬要求：**每次新建或大改文件后，必须把完整真实文件内容打印到对话里**。

- 不要折叠。
- 不要只给差异。
- 不要只给总结。
- 必须读真实文件，不要根据记忆或 summary 声称完成。

### 一次只做一件事

每个任务只推进一个明确目标。完成后验证、汇报、等待 review，不要顺手做下一步。

### 路径安全

Rust 侧的 `safe_note_path` 有两层防御：字符串过滤 + canonicalize 前缀校验。**不要简化它**。即使是本地应用，也要挡住 `../` 路径遍历攻击。

### React 陷阱已经趟过的坑

这些代码里的“反直觉”写法是故意的，不要“优化”掉：

1. **MarkdownEditor 的 `editorOwnValue` ref**：打破编辑器 -> 父组件的死循环。
2. **MarkdownEditor 的 `onChangeFn.current` ref**：避免 effect 依赖 onChange 导致编辑器重建。
3. **MarkdownPreview 的 `cancelled` flag**：race condition 防御。
4. **MarkdownPreview 的 scrollRatio effect 依赖里有 `renderedHtml`**：HTML 异步渲染完成后必须重新对齐滚动位置。
5. **StrictMode 下 useEffect 会执行两次**：cleanup 必须正确 destroy CodeMirror 实例。

### 已知但暂不修的 TODO

- 编辑器光标颜色仍是 oneDark 默认鲜蓝色，Phase 8 UI 打磨时处理。
- Lyra 深色主题 `--accent` 和 `--muted` 颜色相同，不要擅自改。
- `get_notes_dir` 目前用 `env!("CARGO_MANIFEST_DIR")`，开发模式可靠；生产分发应改用 app data dir。
- `allowDangerousHtml` + 无 rehype-sanitize：本地应用暂可接受，远程内容进入时再加 sanitize。
- sonner toast 主题跟随系统，Phase 8 可统一强制 dark。
- `vite.config.ts` 必须忽略 `notes/**`，否则保存 .md 会触发 Vite 热重载丢 state。
- 托盘图标在 Windows 默认进溢出区，这是系统行为。
- QuickNoteApp 保存失败只 `console.error`，Phase 8 再统一 UI 反馈。
- FileTree 在窄宽度下 hover 按钮位置可用但不够精致，Phase 8 再打磨。

### 敏感事项

- Hardy 的旧项目 `D:\Dev\Projects\oi-coach` 里有 `DEEPSEEK_API_KEY.txt`。当前项目不要提交密钥；新项目里的 API key 要走 `.env` + `.gitignore`。

---

## 7. 新会话起手模板

```text
你好，我的项目在 D:\Dev\Projects\oi-notebook，请读以下文件了解状态：

1. AGENTS.md
2. PROJECT.md
3. docs/HANDOFF.md
4. docs/OI-Notebook-PRD-v1.md

读完后总结一下：
- 项目做到哪个阶段
- 下一个要做的任务是什么
- 有什么值得我注意的地方

然后等我下一个指令，不要主动开始新任务。
```

---

## 8. Codex 工作方式建议

### 你要做的

1. **Review 代码时严格**。看真实文件，不要只看 summary。
2. **一次只做一件事**。做完打印完整文件，review 通过再进入下一步。
3. **不要自己做技术选型决策**。涉及库版本、插件替换、架构取舍时先汇报。
4. **用中文沟通**。
5. **遇到不确定就查真实来源**。前端生态变化快，记忆可能过时。

### 你不要做的

1. 不要催 Hardy 做决定。
2. 不要跳过 review。
3. 不要声称折叠代码“已检查”。
4. 不要在一个任务里堆多个目标。
5. 不要擅自 push。

### Hardy 表达偏好的信号

| Hardy 说 | 翻译 |
|---|---|
| “不太一样哈” | 他观察到了区别，需要解释 |
| “有点 xxx 的感觉” | 他用直觉反馈视觉问题，要认真接住 |
| “你推荐” | 他希望你拿主意并说明理由 |
| “等一下” | 打断当前流程，有新想法要说 |
| “比如...” / “就像...” | 这些类比是重要产品方向信号 |

### 8.5 任务拆分

默认由 Codex 执行具体任务。复杂任务先由架构 reviewer 拆成更小的、可验证的步骤，再交给 Codex 逐步落地。

适合直接交给 Codex：

- 单文件、明确指令的小改动
- 文档维护
- 常规模板代码
- 跑命令、看日志
- 写测试
- 已经给出详细分步指令的任务

需要先拆细再执行：

- 跨多文件架构改动
- 需要理解历史约定才能避免踩坑的改动
- 长链条 debug
- 用户需求还不清晰的任务

判断口径：

- 任务说明只看当前一个文件就能写完 -> 直接交给 Codex。
- 任务说明需要看多个文件互相配合 -> 先审计、拆步，再交给 Codex。
- 需要产品/架构判断 -> 先汇报选项和推荐，再执行。

---

## 9. 关键文件导读

读代码时优先看这几个：

```text
src/App.tsx                          # 应用主框架，状态管理集中在这里
src/lib/api.ts                       # 前端 -> Rust 的 IPC 抽象层
src/lib/markdown.ts                  # unified 渲染管线
src/lib/datetime.ts                  # 相对时间格式化
src/components/ui/dialog.tsx, sonner.tsx, input.tsx, label.tsx, button.tsx
src/quick-note/QuickNoteApp.tsx      # 速记窗口
src/quick-note/main.tsx              # 速记窗口 React 入口
quick-note.html                      # 速记窗口 HTML 入口
src/components/editor/MarkdownEditor.tsx
src/components/editor/MarkdownPreview.tsx
src/components/file-tree/FileTree.tsx
src-tauri/src/notes.rs               # 后端文件系统命令 + 路径安全
src-tauri/src/frontmatter.rs         # frontmatter 默认值和 updated 更新逻辑
src-tauri/src/lib.rs                 # Tauri 构建器、命令注册、快捷键、托盘、关闭拦截
vite.config.ts                       # 忽略 notes/，防止保存 .md 触发 Vite 热重载丢 state
PROJECT.md                           # 项目简介
docs/OI-Notebook-PRD-v1.md           # 完整产品需求文档
docs/HANDOFF.md                      # 本文件
```

---

## 10. 交接备注

Hardy 已经从零基础前端/Rust 起步，把项目推进到可运行的 Markdown 编辑器桌面应用：文件系统、速记窗口、全局快捷键、托盘、笔记目录骨架、frontmatter 自动补全、主窗口按目录新建笔记都已经落地。Phase 5 前置工作已经收口，`site/` Astro 子项目已完成初始化、端到端验证、Tauri 开发模式集成、外部 notes 刷新和 Markdown 数学渲染。后续重点是继续按小步提交推进，不要把多个目标混在一个 commit 里。

---

## §11. Phase 5 前置工作进度（截至 2026-05-02）

Phase 5（本地 Astro 博客）开始前，需要先把笔记目录改成 PRD 规定的子目录结构。前置工作已全部完成，可以进入正式的 Astro 子项目初始化。

- [x] **Step 1**：后端 `list_notes` 递归扫描 + `safe_note_path` 标准化路径分隔符 + 4 个标准子目录自动创建 + 单元测试。已完成。
- [x] **Step 2**：前端 FileTree 改树形分组（tricks/problems/luogu/inbox + 其他），rename 保留目录前缀。已完成。
- [x] **Step 3**：清掉测试笔记，加 `.gitkeep` 锁住目录骨架。已完成。
- [x] **Step 4**：后端 `write_note` 已接入 frontmatter 自动补全；首次写入无 frontmatter 的笔记时补完整 schema，已有 frontmatter 时只更新 `updated`，不覆盖用户已有字段。commit：`4356548 feat(phase5-prep): add note frontmatter defaults`。
- [x] **Step 5**：QuickNoteApp 写入路径已改为 `inbox/quick-xxx.md`，速记保存后仍会通知主窗口刷新。commit：`269d033 feat(phase5-prep): save quick notes to inbox`。
- [x] **Step 6**：主窗口新建笔记对话框已支持选择 `tricks` / `problems`，创建路径分别为 `tricks/{filename}.md` 和 `problems/{filename}.md`。commit：`8dc655c feat(phase5-prep): choose directory when creating notes`。

Step 6 UI 最终方案：目录选择使用纵向 radio 选择卡片，整行可点击，选中项有明确 radio 圆点、边框和背景状态；不再使用原生 `select`，也不再使用按钮式 segmented control。相关修复：`67c3672 fix(ui): replace native note directory select`、`12023f1 fix(ui): clarify note directory choice`。

额外修复：右侧 Markdown 预览在渲染前会隐藏文件开头的 YAML frontmatter，避免 `title`、`tags`、`created` 等元数据显示在预览区；左侧编辑器仍显示完整 Markdown 原文。commit：`ac6fe1b fix(markdown): hide frontmatter in preview`。

Phase 5 Astro 子项目初始化、Tauri 开发模式集成、打开博客入口、外部 notes 刷新和 Markdown 数学渲染都已完成。下一步等待 Hardy 决定：继续打磨博客 UI、先做搜索/标签页，或进入部署/生产分发方向。

---

## §12. Phase 5 本地 Astro 博客进度（截至 2026-05-02）

Phase 5 已从“第一刀初始化”推进到本地开发闭环，并完成 GitHub Pages project page 部署和当前最小 Git 同步工作流：仓库新增独立 `site/` Astro 子项目，Tauri 应用启动时会在后台启动本地 Astro dev server，桌面端 Header 提供“打开博客”“重启博客”和“同步 Git”入口；线上站点通过 GitHub Actions 发布到 `https://hardyz0517.github.io/oi-notebook/`。当前 Git 工作流是“保存/图片 assets/删除/重命名后自动 commit，手动按钮 push”，图片粘贴已能保存到 `notes/assets` 并随当前 note 一起自动 commit，删除和重命名笔记也已生成对应 note commit；仍不包含自动定时/退出时 push、生产分发策略、洛谷或 AI。

已完成内容：

- [x] `site/` 可以独立安装和构建，包含 `dev`、`build`、`preview` 脚本。
- [x] Astro content collection 使用 `glob()` loader，`base` 指向 `../notes`，`pattern` 覆盖 `**/*.md`，不复制也不移动 `notes/`。
- [x] 首页 `/` 显示 `OI Notebook`，读取所有笔记，按 `updated` 或 `created` 倒序列出。
- [x] 首页笔记卡片显示分类、日期、标题、summary、tags，并对 `draft: true` 显示 `Draft` badge。
- [x] 文章页使用 `/posts/[...slug]`，能渲染 Markdown 正文，并显示 title、created、updated、tags、difficulty、source。
- [x] frontmatter 作为 Astro 元数据处理，不会作为正文显示。
- [x] 样式为最小亮色文学博客风格：留白、衬线正文、窄宽度文章页，不引入 Tailwind 或 UI 库。
- [x] Tauri 启动时后台启动 `site` 的 Astro dev server。
- [x] 主窗口关闭只是隐藏，不 kill Astro；托盘“退出”才清理 Astro。
- [x] Windows 下退出应用时使用 `taskkill /PID <pid> /T /F` 清理 `pnpm.cmd` 进程树，避免 node/astro 残留。
- [x] Header 已有“打开博客”入口，打开 `http://localhost:4321`。
- [x] Header 已新增“重启博客”按钮，用于重启后台 Astro dev server，方便 UI/CSS 调试；重启时会先清理现有 pnpm/node/astro 进程树，再重新启动 `site` dev server。
- [x] Astro dev server 已 watch 外部 `../notes` 目录，新增/修改/删除 `.md` 时刷新 content layer 并 full reload。
- [x] 博客端 Markdown 已支持数学公式渲染：`remark-math` + `rehype-katex` + KaTeX CSS。
- [x] 表格基础样式已补。
- [x] 文章页已支持目录 TOC：使用 Astro `render(note)` 返回的 `headings`，只展示 h2/h3。
- [x] 桌面端 TOC 为右侧 sticky；窄屏下 TOC 回到正文上方，避免横向溢出。
- [x] TOC 最终布局已修复为：正文主栏自己居中，TOC 通过 CSS 挂在右侧，不参与正文居中计算。
- [x] 已修复早期 TOC 布局问题：外层 `main max-width` 限制导致 `.post` 宽度调整不生效，以及“正文 + TOC”整体居中导致正文被 TOC 拖偏。
- [x] 分类总览页 `/categories` 已新增，显示 `tricks`、`problems`、`luogu`、`inbox` 四个标准目录的说明、文章数量和入口。
- [x] 分类详情页 `/categories/tricks`、`/categories/problems`、`/categories/luogu`、`/categories/inbox` 已新增，可按 notes 目录浏览文章。
- [x] 分类详情页沿用文章列表样式，按 `updated ?? created` 倒序；空分类会显示温和空状态提示。
- [x] 标签总览页 `/tags` 已新增，从所有 notes 的 frontmatter `tags` 收集标签，显示 tag 名称、文章数量和详情入口。
- [x] 标签详情页 `/tags/[tag]` 已新增，列出包含该 tag 的所有笔记，并按 `updated ?? created` 倒序。
- [x] 中文 tag 路由已修复：`getStaticPaths()` 使用原始 tag 作为 params，`/tags/测试` 能生成并访问。
- [x] 首页、文章页、分类详情页、标签详情页中的 category / tags 已可点击。
- [x] category badge 会跳到 `/categories/{category}`；tag 链接会跳到 `/tags/{encodedTag}`，中文 tag 已支持。
- [x] 含 `/` 的 tag 暂时显示为纯文本，不生成链接，避免破坏当前 `/tags/[tag]` 路由。
- [x] 文章页底部已新增上一篇/下一篇导航，按 `updated ?? created` 倒序，和首页一致。
- [x] 第一篇没有上一篇，最后一篇没有下一篇；只有单项时仍保持正确左右对齐。
- [x] 单个“下一篇”错误落到左列、视觉偏左的问题已修复并肉眼验收通过。
- [x] 搜索页 `/search` 已完成。
- [x] 顶部导航已有“分类”“标签”和“搜索”，首页底部已有“按目录浏览全部分类”入口。
- [x] 搜索数据在 build 时通过 `getCollection("notes")` 生成静态条目。
- [x] 搜索覆盖 title、summary/excerpt、tags、category 和 body 简化文本。
- [x] 前端使用原生 JS 对 `data-search` 做 `includes` 实时过滤，不引入依赖，不做复杂分词或高亮。
- [x] 中文和英文均可基于子串匹配；无结果时有温和空状态。
- [x] `/search` 已生成并肉眼验收通过。
- [x] GitHub Pages 部署 workflow 已新增，使用 GitHub Actions 官方 Pages 链路。
- [x] workflow 在 push 到 `main` 且命中 `notes/**`、`site/**` 或 `.github/workflows/deploy.yml` 时触发，也支持 `workflow_dispatch` 手动触发。
- [x] 线上站 URL 为 `https://hardyz0517.github.io/oi-notebook/`，Actions 已成功跑通，线上站验收正常。
- [x] GitHub Pages project page base `/oi-notebook` 已适配，本地 dev 仍使用无 base 的 `localhost:4321`。
- [x] 生产构建会过滤 `draft: true` 笔记；本地 dev 仍显示 draft，并保留 Draft badge。
- [x] 主窗口保存笔记后会自动 commit 当前保存的单个 `notes/{relative_path}` 文件；自动 commit 不 push。
- [x] 自动 commit 不使用 `git add .` 或 `git add notes/`，只允许提交当前保存的单个 notes pathspec。
- [x] 自动 commit 前检查暂存区；如果 `git diff --cached --name-only` 非空，则跳过/报错，避免把用户手动 staged 的内容带进自动 commit。
- [x] 自动 commit message 目前使用 `note: update {relative_path}`，暂不解析 title。
- [x] 主窗口已有 Frontmatter 折叠表单，放在 Markdown 编辑区上方，已由 Hardy 肉眼验收通过。
- [x] Frontmatter 表单第一版支持 `title`、`tags`、`summary`、`draft`、`difficulty`、`source`；不提供 `created` / `updated` 编辑，这两个字段仍由系统维护。
- [x] `tags` 第一版使用逗号分隔输入，不做 chip 或 autocomplete。
- [x] 前端 frontmatter 合并采用保守文本策略：只处理文件开头 frontmatter，正文原样保留，未知字段保留；frontmatter 缺少闭合 `---` 或 tags 为复杂 YAML 时不强行改写原文。
- [x] Frontmatter 表单改写只更新当前 Markdown state，保存链路仍保持 `writeNote` -> 自动 commit，frontmatter warning toast 和自动 commit toast 继续按原逻辑执行。
- [x] 主窗口新建笔记已有模板选择，支持空白、Trick 模板和题解模板，已由 Hardy 肉眼验收通过。
- [x] 新建笔记模板会根据目录自动给默认值：`tricks` 默认 Trick 模板，`problems` 默认题解模板；用户仍可在对话框里手动切换模板。
- [x] 模板只在前端生成 Markdown 正文，不改后端；模板正文包含常用小节，并生成和 Frontmatter 表单兼容的基础 frontmatter，`created` / `updated` 仍由后端 `writeNote` 补全。
- [x] 主窗口 CodeMirror 已支持粘贴剪贴板中的第一张 `image/*`；图片保存到 `notes/assets/`，支持 png/jpg/webp。
- [x] 图片粘贴会按当前笔记位置插入相对 Markdown 图片链接，例如 `tricks/foo.md` 使用 `../assets/xxx.jpg`，更深目录会自动增加 `../`。
- [x] 粘贴图片只修改当前 Markdown state 并标记 dirty，不立即保存、不立即 commit、不 push。
- [x] 保存时会把当前 note 和本轮 pending assets 一起自动 commit；自动 commit 仍只 add 明确 pathspec，不使用 `git add .` 或 `git add notes/`。
- [x] 右侧 MarkdownPreview 已支持显示 `notes/assets` 图片；相对图片路径会按当前 note 所在目录安全解析，最终文件必须位于 `notes/assets/` 下。
- [x] 桌面预览端使用 `data:image/...;base64,...` URL 显示本地图片，不影响博客 `site/` 的构建和图片路径。
- [x] 图片粘贴与桌面预览图片显示均已由 Hardy 肉眼验收通过。
- [x] 删除笔记后会自动 commit，commit message 为 `note: delete {path}`，不自动 push。
- [x] 重命名笔记后会自动 commit，commit message 为 `note: rename {old} to {new}`，不自动 push。
- [x] 删除/重命名自动 commit 仍使用精确 pathspec，不使用 `git add .` 或 `git add notes/`。
- [x] Git 端 commit 前检查暂存区为空，`git add -- <pathspec>` 后复查 staged 文件必须只属于本次允许集合；commit 失败会 reset 本次 pathspec。
- [x] 删除/重命名笔记自动 Git commit 已由 Hardy 人工验收通过。
- [x] Header 已新增“同步 Git”按钮，手动执行 `git push origin main`；不做 pull、rebase 或冲突解决。
- [x] 手动 push 前同样检查暂存区；暂存区非空会失败，允许工作区保留未跟踪本地测试笔记。
- [x] tracked draft 测试笔记已创建用于验证自动 commit 和博客 UI；它们均为 `draft: true`，生产构建会过滤。
- [x] 手动同步 Git 已验收成功：点击按钮后 `git push origin main` 成功，并触发 GitHub Actions / Pages 链路更新。
- [x] 洛谷配置存储 MVP 已完成：本地配置写入仓库根目录 `.oinb/config.json`，字段包含 `luogu.uid`、`luogu.client_id`、`luogu.last_submission_id`；当前只做本地保存，不做网络请求、不验证 Cookie、不同步提交；`.oinb/config.json` 已加入 `.gitignore`，避免提交敏感配置。

相关提交：

- `758e128 feat(site): initialize Astro notes blog`
- `089b813 feat(site): start Astro dev server with app`
- `2f1dad8 fix(site): clean up Astro dev process tree`
- `aab93db feat(site): add open blog action`
- `456361f fix(site): refresh notes during dev`
- `2903349 fix(site): render math in blog posts`
- `90cdd44 feat(site): add category pages`
- `e617542 feat(site): add tag pages`
- `3ca8ce7 fix(site): handle unicode tag routes`
- `86a5e66 feat(site): add post table of contents`
- `1f1a25f style(site): move post toc to sidebar`
- `7594744 style(site): loosen post toc spacing`
- `9492a4e fix(site): allow wide post layout`
- `2f7f1f1 fix(site): keep post content centered with toc`
- `5fb5ab4 feat(site): add restart blog action`
- `8e597ed feat(site): link post categories and tags`
- `fd70ea4 feat(site): add post navigation`
- `36a736e fix(site): align single post navigation item`
- `cb6b958 feat(site): add search page`
- `16d1623 feat(site): prepare GitHub Pages base`
- `e96ea1c ci(site): deploy blog to GitHub Pages`
- `5ddc0e9 feat(git): auto commit saved notes`
- `fe94a4a test(notes): add tracked draft notes`
- `c4784a5 note: update tricks/git-auto-commit-test.md`
- `750e47e feat(git): add manual push action`
- `d7e44d8 feat(editor): add frontmatter form`
- `9d5dbbf feat(editor): add note templates`
- `5e2c2af feat(editor): paste images into notes assets`
- `8f4c5df fix(editor): preview pasted note images`
- `c0752c8 feat(git): commit note delete and rename`
- `a3dc6c6 feat(luogu): save local config`

端到端验证结果：

- 临时创建 `notes/tricks/astro-test.md` 和 `notes/problems/astro-problem-test.md` 后，`cd site && pnpm.cmd build` 通过。
- Astro 成功读取 `notes/**/*.md`，首页列出两篇测试笔记，并按 `updated` 倒序。
- 生成文章页路径：
  - `/posts/problems/astro-problem-test`
  - `/posts/tricks/astro-test`
- `draft: true` 的 problems 测试笔记在首页和文章页都显示 `Draft` badge。
- build 共生成 3 个页面：首页 + 两篇文章页。
- 验证后两篇临时测试笔记已删除，没有提交测试笔记。
- Tauri 运行时验收通过：应用启动后会后台启动 Astro dev server。
- 主窗口关闭隐藏后，`localhost:4321` 仍可访问；托盘退出后会清理 Astro dev server，`localhost:4321` 不再可访问。
- Header “打开博客”按钮能打开 `http://localhost:4321`。
- 桌面端新建/修改 `notes/` 下的 `.md` 笔记后，运行中的 Astro dev server 能刷新内容。
- 博客端数学公式已接入 `remark-math` + `rehype-katex` + KaTeX CSS；表格基础样式已补。
- 人工验收用测试笔记已删除，未提交测试笔记。
- 分类页肉眼验收通过：
  - `/categories` 正常打开。
  - `/categories/tricks` 能显示 Hardy 本地测试笔记。
  - 空分类如 `/categories/luogu`、`/categories/inbox` 能显示空状态。
  - 首页底部“按目录浏览全部分类”入口可用。
- 标签页 build 验证通过：`cd site && pnpm.cmd build` 成功。
- 已确认中文 tag 详情页会生成：`/tags/测试/index.html`。
- 文章页 TOC 最新布局已肉眼验收通过：
  - 正文主栏保持居中。
  - TOC 挂在正文右侧。
  - TOC 不再参与正文居中计算。
  - 窄屏下 TOC 回到正文上方普通目录。
- category/tag 链接与文章上一篇/下一篇导航已肉眼验收通过：
  - category badge 能跳到对应 `/categories/{category}`。
  - tag 能跳到对应 `/tags/{encodedTag}`，中文 tag 可用。
  - 最新文章只有“下一篇”时靠右。
  - 最旧文章只有“上一篇”时靠左。
  - 中间文章上一篇在左侧，下一篇在右侧。
- 搜索页 `/search` 已生成并肉眼验收通过：
  - 顶部导航“搜索”入口可用。
  - 搜索覆盖 title、summary/excerpt、tags、category 和 body 简化文本。
  - 中文和英文均可基于子串匹配。
  - 无结果时会显示温和空状态。
- GitHub Pages 部署已验收通过：
  - workflow 使用 GitHub Actions 官方 Pages artifact/deploy-pages 链路。
  - push 到 `main` 且命中 `notes/**`、`site/**` 或 `.github/workflows/deploy.yml` 时会触发，也支持 `workflow_dispatch`。
  - 线上站 URL 为 `https://hardyz0517.github.io/oi-notebook/`。
  - Actions 已绿色通过，线上站肉眼验收正常。
  - project page base `/oi-notebook` 已处理。
  - 生产 build 会过滤 draft，本地 dev 仍显示 draft。
- 自动 Git commit 已人工验收通过：
  - 保存 `tricks/git-auto-commit-test.md` 后生成 `c4784a5 note: update tricks/git-auto-commit-test.md`。
  - 最新 note commit 只包含当前保存的一个 notes 文件：`notes/tricks/git-auto-commit-test.md`。
  - 暂存区为空时才会自动 commit；暂存区已有其它内容时会跳过/报错。
  - 4 个 Hardy 本地 UI 测试笔记仍保持未跟踪，不删除、不提交、不修改。
- 手动同步 Git 已人工验收通过：
  - Header “同步 Git”按钮点击后执行 `git push origin main` 成功。
  - 手动 push 不做 pull、rebase 或冲突解决。
  - GitHub Actions / Pages 链路被 push 正常触发并更新。
- tracked draft 测试笔记：
  - `notes/tricks/git-auto-commit-test.md`
  - `notes/problems/post-navigation-test.md`
  - `notes/luogu/tag-search-test.md`
  - 这些文件用于验证自动 commit 和博客 UI，均设置 `draft: true`，生产构建会过滤。
- 图片粘贴与桌面预览图片显示已人工验收通过：
  - 主窗口 CodeMirror 处理剪贴板中的第一张 `image/*`，保存到 `notes/assets/`，支持 png/jpg/webp。
  - Markdown 会插入相对当前笔记的图片链接；粘贴只修改 Markdown state，不立即保存、不立即 commit。
  - Ctrl+S 保存成功后，当前 note 和本轮 pending assets 会一起进入自动 commit。
  - 右侧 MarkdownPreview 会按当前 note 位置安全解析 `../assets/...`、`../../assets/...` 或 `assets/...`，最终文件必须位于 `notes/assets/`。
  - 桌面预览使用 `data:image/...` URL 显示本地图片，不影响博客 `site/`。
- 删除/重命名笔记自动 Git commit 已人工验收通过：
  - 实现提交为 `c0752c8 feat(git): commit note delete and rename`。
  - 删除笔记后会生成 `note: delete {path}`，只 stage `notes/{path}` 的删除。
  - 重命名笔记后会生成 `note: rename {old} to {new}`，只 stage `notes/{old}` 和 `notes/{new}`。
  - 验收中已看到 `ebd878c note: delete tricks/testrename.md`，只包含 `D notes/tricks/testrename.md`。
  - 验收中已看到 `4206920 note: rename tricks/test01.md to tricks/test0123.md`，只包含 `R100 notes/tricks/test01.md notes/tricks/test0123.md`。
  - 删除/重命名 commit 不自动 push，仍由 Header “同步 Git”按钮手动执行 `git push origin main`。
  - Git 端保持误提交防护：commit 前检查暂存区为空；只使用精确 pathspec；add 后复查 staged 文件只属于本次允许集合；不使用 `git add .` 或 `git add notes/`。

尚未完成：

- 博客视觉仍可继续打磨。
- 还没有生产分发策略；当前桌面端仍是开发模式下启动 Astro dev server。
- 还没有自动定时 push / 退出时 push；当前只支持 Header 手动“同步 Git”。
- 洛谷配置存储 MVP 已完成，但还没有网络请求、Cookie 验证或增量爬取。
- 还没有 AI 辅助。

下一步建议：等待 Hardy 决定方向，可以继续博客视觉打磨，或进入生产分发策略、自动定时/退出时 push、洛谷爬取或 AI 辅助方向。

### 博客 UI 打磨进展

最近一轮博客 UI 已按小步提交推进，目标是从“能用的基础博客”逐步转向更自然的亮色文学/杂志式阅读体验。

已完成内容：

- [x] 首页从厚重卡片网格逐步调整为文章优先的博客首页。
- [x] 首页去掉重复的大号 hero 和 section header，避免出现“站点标题 + 区块标题 + 文章”的层级重复。
- [x] 第一篇最新笔记作为 featured post，后续文章进入三列文章流。
- [x] featured post 与后续文章流已对齐到同一版心，不再像单独居中的窄块。
- [x] 首页 summary 为空时会从正文生成 excerpt，避免测试笔记或未写 summary 的笔记卡片过空。
- [x] 首页双重分隔线已简化，保留轻分隔感但减少杂乱。
- [x] 代码块改为浅色 Shiki 主题 `github-light`，更贴近亮色纸感博客。
- [x] 代码块已有“复制”按钮，成功后短暂显示“已复制”，失败时显示“复制失败”。
- [x] 文章页 metadata 已中文化：创建、更新、难度、来源。
- [x] 文章页 metadata 已弱化为轻量信息区，不再像后台字段表格。
- [x] 数学公式、表格、代码块基础阅读体验已可用。
- [x] 文章页目录 TOC 已完成，只使用 h2/h3 heading。
- [x] TOC 已从正文顶部改为桌面端右侧 sticky，长文章滚动时仍可见。
- [x] TOC 布局已修复：正文主栏独立居中，TOC 通过 CSS 挂在正文右侧，不再把正文拖偏；窄屏下 TOC 回到正文上方。
- [x] 分类总览页 `/categories` 已完成，支持按 `tricks`、`problems`、`luogu`、`inbox` 浏览。
- [x] 分类详情页已完成：`/categories/tricks`、`/categories/problems`、`/categories/luogu`、`/categories/inbox`。
- [x] 分类详情页沿用文章列表风格，按 `updated ?? created` 倒序，并支持空分类状态。
- [x] 标签总览页 `/tags` 已完成，按 frontmatter `tags` 汇总 tag 名称和文章数量。
- [x] 标签详情页 `/tags/[tag]` 已完成，沿用文章列表风格，并按 `updated ?? created` 倒序。
- [x] 中文 tag 路由 404 已修复，`/tags/测试` 可生成并访问。
- [x] 首页、文章页、分类详情页、标签详情页中的 category / tags 已可点击，category 跳到 `/categories/{category}`，tag 跳到 `/tags/{encodedTag}`。
- [x] 含 `/` 的 tag 暂时显示纯文本，不生成链接，避免破坏当前 tag 路由。
- [x] 文章页底部上一篇/下一篇导航已完成，按 `updated ?? created` 倒序；单项导航对齐已修复。
- [x] 上一篇/下一篇肉眼验收通过：最新文章只有“下一篇”时靠右，最旧文章只有“上一篇”时靠左，中间文章左右分列。
- [x] 顶部导航已有“分类”和“标签”，首页已有“按目录浏览全部分类”入口。

相关提交：

- `3b2d590 style(site): refine blog reading layout`
- `11cd096 style(site): reshape blog homepage`
- `66ac716 style(site): simplify homepage hierarchy`
- `6eaec52 style(site): make homepage article-first`
- `7320f07 style(site): align featured post with article grid`
- `a1deaee style(site): simplify homepage dividers`
- `4f90137 style(site): soften blog code blocks`
- `fdb2969 fix(site): use light code block theme`
- `fca48d3 feat(site): add copy buttons to code blocks`
- `c2a1923 style(site): soften post metadata`
- `90cdd44 feat(site): add category pages`
- `e617542 feat(site): add tag pages`
- `3ca8ce7 fix(site): handle unicode tag routes`
- `86a5e66 feat(site): add post table of contents`
- `1f1a25f style(site): move post toc to sidebar`
- `7594744 style(site): loosen post toc spacing`
- `9492a4e fix(site): allow wide post layout`
- `2f7f1f1 fix(site): keep post content centered with toc`
- `5fb5ab4 feat(site): add restart blog action`
- `8e597ed feat(site): link post categories and tags`
- `fd70ea4 feat(site): add post navigation`
- `36a736e fix(site): align single post navigation item`
- `cb6b958 feat(site): add search page`

### 本地测试笔记策略

未跟踪的 `notes/**/test*.md` 和 `notes/**/测试*.md` 这类文件是 Hardy 的本地验收素材，包括但不限于：

- `notes/tricks/测试*.md`
- `notes/tricks/test*.md`
- `notes/problems/test*.md`

它们通常会以未跟踪文件形式留在工作区，用于 UI、模板、博客和 Git 自动提交验收；也会用来反复检查首页文章流、文章页排版、分类页、标签页、代码块、公式、表格和 metadata 显示。

后续 Codex 看到这类未跟踪本地测试笔记时：

- 不要删除。
- 不要提交。
- 不要修改。
- 除非 Hardy 明确要求清理，否则把它们视为正常本地验收素材。

分类页肉眼验收：

- `/categories` 正常打开。
- `/categories/tricks` 能显示 Hardy 本地测试笔记。
- 空分类如 `/categories/luogu`、`/categories/inbox` 能显示空状态。
- 首页底部“按目录浏览全部分类”入口可用。

标签页验收：

- `/tags` 正常打开。
- `/tags` 会从 frontmatter `tags` 汇总标签并显示文章数量。
- `/tags/[tag]` 会按 `updated ?? created` 倒序列出文章。
- 中文 tag 路由已修复，`/tags/测试` 能生成并访问。
- 首页、文章页、分类详情页、标签详情页里的 tags 已可点击；中文 tag 链接可用。
- 含 `/` 的 tag 暂时保留纯文本。

文章上一篇/下一篇验收：

- 导航按 `updated ?? created` 倒序，和首页一致。
- 最新文章只有“下一篇”时靠右。
- 最旧文章只有“上一篇”时靠左。
- 中间文章上一篇在左侧，下一篇在右侧。

搜索页验收：

- `/search` 已生成并肉眼验收通过。
- 顶部导航已有“搜索”入口。
- 搜索数据在 build 时通过 `getCollection("notes")` 生成静态条目。
- 搜索覆盖 title、summary/excerpt、tags、category 和 body 简化文本。
- 前端原生 JS 对 `data-search` 做 `includes` 实时过滤，中文和英文均可基于子串匹配。
- 无结果时有温和空状态。

仍未完成 / 等待 Hardy 决定：

- 生产分发策略；当前桌面端仍是开发模式下启动 Astro dev server。
- 自动定时 push / 退出时 push；当前只支持手动“同步 Git”。
- 洛谷配置存储 MVP 已完成，但还没有网络请求、Cookie 验证或增量爬取。
- AI 辅助。
- 博客视觉仍可继续打磨。
