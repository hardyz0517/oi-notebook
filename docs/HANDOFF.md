# HANDOFF.md — 新对话窗口交接文档

这份文档是接手 Hardy 的 OI Notebook 项目时的操作手册。它记录当前真实进度、协作规则、技术约定和已知坑。开始任何任务前，请先读：

1. `AGENTS.md`
2. `PROJECT.md`
3. `docs/HANDOFF.md`
4. `docs/OI-Notebook-PRD-v1.md`

**最后更新**：2026-05-02（完成 Phase 5 Astro 子项目初始化 + 端到端验证）
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
    └─ 未完成：Tauri 后台启动 astro dev、桌面端打开博客入口、设计打磨、搜索/标签页增强

[ ] Phase 6  洛谷爬虫
    └─ @oinb-insight 注释格式，增量抓取提交

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

Hardy 已经从零基础前端/Rust 起步，把项目推进到可运行的 Markdown 编辑器桌面应用：文件系统、速记窗口、全局快捷键、托盘、笔记目录骨架、frontmatter 自动补全、主窗口按目录新建笔记都已经落地。Phase 5 前置工作已经收口，`site/` Astro 子项目也已完成第一刀初始化并通过端到端验证。后续重点是继续按小步提交推进，不要把多个目标混在一个 commit 里。

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

Phase 5 Astro 子项目初始化已完成。下一步：Tauri 集成 Astro dev，让应用启动时后台启动 `site` dev server，并提供打开 `localhost:4321` 的入口。

---

## §12. Phase 5 本地 Astro 博客进度（截至 2026-05-02）

Phase 5 第一刀已经完成：仓库新增独立 `site/` Astro 子项目，先做最小可用的本地博客，不包含 Tauri 后台启动、打开博客按钮、GitHub Actions、搜索、标签页、深色模式切换、洛谷、AI 或 Git 自动同步。

已完成内容：

- [x] `site/` 可以独立安装和构建，包含 `dev`、`build`、`preview` 脚本。
- [x] Astro content collection 使用 `glob()` loader，`base` 指向 `../notes`，`pattern` 覆盖 `**/*.md`，不复制也不移动 `notes/`。
- [x] 首页 `/` 显示 `OI Notebook`，读取所有笔记，按 `updated` 或 `created` 倒序列出。
- [x] 首页笔记卡片显示分类、日期、标题、summary、tags，并对 `draft: true` 显示 `Draft` badge。
- [x] 文章页使用 `/posts/[...slug]`，能渲染 Markdown 正文，并显示 title、created、updated、tags、difficulty、source。
- [x] frontmatter 作为 Astro 元数据处理，不会作为正文显示。
- [x] 样式为最小亮色文学博客风格：留白、衬线正文、窄宽度文章页，不引入 Tailwind 或 UI 库。

相关提交：

- `758e128 feat(site): initialize Astro notes blog`

端到端验证结果：

- 临时创建 `notes/tricks/astro-test.md` 和 `notes/problems/astro-problem-test.md` 后，`cd site && pnpm.cmd build` 通过。
- Astro 成功读取 `notes/**/*.md`，首页列出两篇测试笔记，并按 `updated` 倒序。
- 生成文章页路径：
  - `/posts/problems/astro-problem-test`
  - `/posts/tricks/astro-test`
- `draft: true` 的 problems 测试笔记在首页和文章页都显示 `Draft` badge。
- build 共生成 3 个页面：首页 + 两篇文章页。
- 验证后两篇临时测试笔记已删除，没有提交测试笔记。

尚未完成：

- Tauri 启动时后台运行 `site` 的 Astro dev server。
- 桌面端提供打开本地博客 `localhost:4321` 的入口。
- 博客视觉继续向文人博客方向打磨。
- 搜索、标签页、分页、文章导航等后续增强。

下一步建议：Tauri 集成 Astro dev：应用启动时后台启动 `site` dev server，并提供打开 `localhost:4321` 的入口。
