# HANDOFF.md — 新对话窗口交接文档

这份文档是接手 Hardy 的 OI Notebook 项目时的操作手册。它记录当前真实进度、协作规则、技术约定和已知坑。开始任何任务前，请先读：

1. `AGENTS.md`
2. `PROJECT.md`
3. `docs/HANDOFF.md`
4. `docs/OI-Notebook-PRD-v1.md`

**最后更新**：2026-05-05（记录 AI 缓存第一版完成）  
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
    ├─ 桌面端 Ctrl+K / Cmd+K 搜索 MVP 已完成并验收：当前为内存扫描，不是 SQLite FTS5
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
    └─ 未完成：生产分发策略、自动定时/退出时 push、SQLite FTS5 正式索引、AI 关联推荐、博客视觉继续打磨

[~] Phase 6  洛谷爬虫
    ├─ @oinb-insight 本地导入 MVP 已完成
    ├─ 洛谷配置存储 MVP 已完成：`.oinb/config.json`
    ├─ “测试连接”dry run 已完成并验收：只拉提交列表摘要，不生成笔记、不更新 `last_submission_id`
    ├─ 手动“同步洛谷”MVP 已完成：分页拉取提交、过滤 AC、抓详情源码、生成 `notes/luogu` 并自动 commit
    ├─ 分页同步已完成：最多扫描 5 页，遇到 `last_submission_id` 会提前停止
    ├─ Cookie 配置引导和过期提示已完成
    ├─ AI-first 洛谷 insight 已完成：普通尾部块注释候选会由 AI 整理成 `notes/luogu` draft 笔记
    └─ 未完成：启动/定时自动同步

[~] Phase 7  AI 辅助整理
    ├─ OpenAI-compatible AI 配置和连接测试已完成，DeepSeek 已验收可用
    ├─ 洛谷普通注释 AI 整理已接入同步和本地导入
    ├─ 当前笔记 AI 元数据补全已完成并验收：手动触发生成 title/tags/summary，不改正文、不自动保存、不自动 commit
    ├─ 当前笔记 AI 全文润色预览已完成并验收：只润色正文 body，先预览，用户应用后才写回并标记 dirty
    ├─ AI Prompt 模板系统已完成：模板存储在 `.oinb/prompts/`，已 gitignore；前端 AI Prompt 面板可读取、编辑、保存模板
    ├─ AI 缓存第一版已完成：`.oinb/ai-cache/` 已 gitignore，洛谷 insight、元数据补全、全文润色会走缓存，测试连接不缓存
    └─ 未完成：关联推荐

[ ] Phase 8  打磨阶段
    ├─ 审美升级（目前只做功能，UI 统一在这个阶段打磨）
    ├─ 桌面端顶部工具栏按钮已经明显偏多，视觉拥挤；AI Prompt 面板虽然已改善，但整体 UI 仍需后续统一整理
    ├─ 当前阶段暂时不要零散继续修 UI，先推进功能；等 Hardy 明确同意后再做一次集中 UI pass
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
| AI（部分完成） | OpenAI-compatible Chat Completions | DeepSeek 已验收；当前已接入洛谷 insight 整理、当前笔记元数据补全、全文润色预览和本地响应缓存，关联推荐仍未做 |

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
- 桌面端顶部工具栏按钮已经明显偏多，视觉拥挤；AI Prompt 面板虽然已从窄 textarea 改成宽弹窗 + 左侧列表 + 右侧大 textarea，但整体 UI 仍需后续统一整理。
- 暂时不要零散继续修 UI，先推进功能；等 Hardy 明确同意后，再做一次集中 UI pass。

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

Phase 5 已从“第一刀初始化”推进到本地开发闭环，并完成 GitHub Pages project page 部署和当前最小 Git 同步工作流：仓库新增独立 `site/` Astro 子项目，Tauri 应用启动时会在后台启动本地 Astro dev server，桌面端 Header 提供“打开博客”“重启博客”和“同步 Git”入口；线上站点通过 GitHub Actions 发布到 `https://hardyz0517.github.io/oi-notebook/`。当前 Git 工作流是“保存/图片 assets/删除/重命名后自动 commit，手动按钮 push”，图片粘贴已能保存到 `notes/assets` 并随当前 note 一起自动 commit，删除和重命名笔记也已生成对应 note commit；仍不包含自动定时/退出时 push、生产分发策略或通用 AI 笔记能力。

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
- [x] 洛谷 @oinb-insight 本地导入 MVP 已完成：用户可手动粘贴洛谷源码，解析第一个 C/C++ 块注释 `/* @oinb-insight ... */`，生成 `notes/luogu/P{problem_id}-{safe_title}.md`，文件已存在时跳过不覆盖；该路径现在只作为历史 MVP 保留，不再是主路径。
- [x] 中文路径 Git 自动提交已修复：staged 文件列表改用 NUL 分隔解析，中文文件名不再因为 Git quote/转义而误判；删除未跟踪残留笔记时会返回 noChanges，不再误报 `pathspec did not match any files`。
- [x] 洛谷“测试连接”dry run 已完成并验收：读取 `.oinb/config.json` 里的 `uid` / `__client_id`，只请求提交列表第一页并返回最近提交摘要；不生成笔记、不更新 `last_submission_id`、不 commit、不 push。
- [x] 手动“同步洛谷”MVP 已完成：读取配置，分页拉取提交，过滤 AC，按 `submission_id` 从小到大处理，抓取详情源码，生成 `notes/luogu` 笔记，并对新笔记执行自动 commit。
- [x] 洛谷分页同步已完成：从第 1 页开始，最多扫描 5 页；遇到 `submission_id <= last_submission_id` 会提前停止继续翻页。
- [x] 洛谷同步页间隔为 1 秒，详情请求仍保持至少 3 秒间隔；目标文件已存在时跳过不覆盖。
- [x] 同步流程整体成功后更新 `.oinb/config.json` 中的 `last_submission_id`；同步中有失败时不推进，避免漏扫。
- [x] 同步结果反馈已增强：完成后会显示 `scanned` / `scanned_pages` / `ac` / `imported` / `no_insight` / `existing` / `failed` / `reached_last_submission_id` / `last_submission_id`，避免只看到“没有新笔记”而不知道跳过原因。
- [x] 洛谷 Cookie 配置引导和过期提示已完成：设置面板说明需要从浏览器洛谷 Cookie 中复制 `_uid` 和 `__client_id`，路径为 `F12 -> Application/应用 -> Cookies -> https://www.luogu.com.cn`。
- [x] 设置面板已提醒 `__client_id` 不要泄露、不要提交到 Git；toast、日志或错误信息中不会输出完整 `__client_id`。
- [x] 测试连接 / 同步遇到 401 或 403 时会提示“洛谷 Cookie 可能已失效，请重新复制 _uid 和 __client_id。”；网络失败、请求超时、返回格式异常也有简短错误提示。
- [x] AI 配置和 OpenAI-compatible 连接测试已完成：`.oinb/config.json` 记录 `ai.base_url`、`ai.api_key`、`ai.model`；前端使用 password input 保存 API Key；连接测试通过 Chat Completions 做极小 JSON 任务，不打印完整 `api_key`。
- [x] 普通尾部注释候选提取已完成：AC 源码靠近末尾的 C/C++ 块注释 `/* ... */`，只要包含“启示 / 坑点 / 思路 / 总结 / trick / idea”等关键词且内容达到下限，就会作为 AI 候选；源码中间注释、无关键词注释、过短注释不会作为候选。
- [x] 洛谷同步和本地导入已改为 AI-first：不再要求用户写完整 `@oinb-insight` YAML；如果仍有 `@oinb-insight`，也只把注释内容作为候选交给 AI，不再走本地 YAML 解析生成笔记。
- [x] 没有候选注释时不会调用 AI，避免无注释源码浪费 token 或产生幻觉。
- [x] 洛谷 insight AI 第一版只发送题目信息、提交 ID 和候选注释，不发送完整源码。
- [x] AI 必须返回结构化 JSON：`should_import`、`title`、`tags`、`difficulty`、`summary`、`draft`、`body`；解析失败算 AI failed，不把完整模型输出打到 toast。
- [x] `should_import=true` 时生成 `notes/luogu/Pxxx-title.md` draft 笔记，文件已存在则跳过不覆盖；同步生成后自动 commit，不自动 push。
- [x] AI 生成笔记 frontmatter 会写入 `ai_generated: true` 和 `ai_model`，但不会写入 `api_key` 或 `base_url`。
- [x] 同步摘要已包含 `ai_imported_count` / `ai_skipped_count` / `ai_failed_count`，AI 调用失败算严重失败，本轮不推进 `last_submission_id`。
- [x] DeepSeek 路径已由 Hardy 验收：测试连接成功，AI 整理洛谷注释时 DeepSeek API 平台能看到请求。
- [x] 通用 AI 元数据补全已完成并由 Hardy 人工验收通过：主窗口当前笔记区域有“AI 补全元数据”手动触发入口，AI 只根据当前打开笔记生成 `title`、`tags`、`summary`。
- [x] AI 元数据补全的 `tags` 会收敛为 3-5 个偏 OI/算法标签；成功后只更新当前编辑器里的 frontmatter，并标记 dirty。
- [x] AI 元数据补全不改正文，不自动保存，不自动 commit；保存仍由用户 Ctrl+S 触发，然后沿用现有保存后自动 commit 流程。
- [x] AI 元数据补全只写 frontmatter 的 `title` / `tags` / `summary`；`draft`、`difficulty`、`source`、`created`、`updated`、`luogu_submission`、`ai_generated`、`ai_model` 和未知字段会保留。
- [x] 当前笔记 AI 全文润色预览已完成并由 Hardy 人工验收通过：AI 只润色正文 body，不改 frontmatter；AI 返回后先进入预览弹窗，不直接覆盖编辑器。
- [x] AI 全文润色只有用户点击“应用到正文”后才替换正文并标记 dirty；不自动保存，不自动 commit。
- [x] AI Prompt 模板系统已完成：Prompt 存储路径为 `.oinb/prompts/`，该目录已加入 `.gitignore`，不会提交到 Git。
- [x] 当前支持三个 Prompt 模板：`luogu-insight.md` 对应洛谷 insight 整理，`note-metadata.md` 对应当前笔记元数据补全，`note-polish.md` 对应当前笔记正文润色。
- [x] 前端已有“AI Prompt”面板，可读取、编辑、保存模板；Prompt 编辑面板已修复为宽弹窗、左侧模板列表、右侧大 textarea，改善长文本编辑体验。
- [x] AI 缓存第一版已完成：缓存目录为 `.oinb/ai-cache/`，该目录已加入 `.gitignore`，不会提交到 Git。
- [x] 洛谷 insight、当前笔记元数据补全、当前笔记全文润色会走缓存；`test_ai_connection` 不缓存。
- [x] 缓存 key 包含 task、model、base_url hash、渲染后的 prompt 和输入上下文；prompt、model、base_url 或输入内容变化后会重新请求。
- [x] 缓存损坏会忽略并重新请求；AI 请求失败不会写缓存；缓存 JSON 不保存 `api_key` / `base_url`。
- [!] 已知限制：全文润色 prompt 效果一般，后续可单独继续调优；当前仍是手动同步，不做启动自动同步或定时同步；关联推荐还没做；生产分发策略还没做。

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
- `7b3366c feat(luogu): import local insight notes`
- `e804516 fix(git): handle unicode staged paths`
- `961d156 fix(git): ignore untracked note deletions`
- `a3dc6c6 feat(luogu): save local config`
- `048ee70 docs: record Luogu local config`
- `978f5ff feat(luogu): test submissions connection`
- `986d45f feat(luogu): sync insight submissions`
- `1f5cbc8 fix(luogu): show sync summary`
- `69069f0 feat(luogu): paginate submission sync`
- `2027b5c fix(luogu): clarify cookie setup errors`
- `edbc15e feat(luogu): detect AI insight comment candidates`
- `ecb605c feat(ai): add provider config and test`
- `dd9818f feat(ai): organize Luogu comments with AI`
- `7ef9ed9 feat(ai): mark generated Luogu notes`
- `0c053db feat(ai): generate note metadata`
- `a1e8ca0 feat(ai): polish note body`

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
- 洛谷 Phase 4 手动同步 MVP 当前进度：
  - 本地导入已完成：可粘贴洛谷源码并通过 AI-first 路径从普通尾部块注释生成 `notes/luogu` draft 笔记；旧 `@oinb-insight` 注释块只作为候选输入，不再本地解析 YAML。
  - 配置存储已完成：`.oinb/config.json` 保存 `luogu.uid`、`luogu.client_id`、`luogu.last_submission_id`，且已加入 `.gitignore`。
  - “测试连接”dry run 已完成并验收：只拉提交列表摘要，不生成笔记、不更新 `last_submission_id`。
  - 手动“同步洛谷”MVP 已完成：读取配置、分页拉取提交、过滤 AC、按 `submission_id` 从小到大处理、抓详情源码、提取 AI 候选注释、生成 `notes/luogu`、自动 commit。
  - 分页同步已完成：最多扫描 5 页；遇到 `submission_id <= last_submission_id` 会提前停止继续翻页。
  - 页间隔为 1 秒，详情请求间隔仍保持 3 秒；文件已存在时跳过不覆盖。
  - 同步成功且本轮无严重失败时才更新 `last_submission_id`；失败时不推进。
  - 普通尾部块注释包含“启示 / 坑点 / 思路 / 总结 / trick / idea”等候选内容时会调用 AI 整理；没有候选注释时不会调用 AI。
  - AI 只接收题目信息、提交 ID 和候选注释，第一版不发送完整源码。
  - AI 返回结构化 JSON 后生成 `notes/luogu` draft 笔记；AI 生成笔记 frontmatter 会写入 `ai_generated: true` 和 `ai_model`，不写入 `api_key` 或 `base_url`。
  - 同步摘要会显示 scanned/ac/imported/no_insight/existing/failed/scanned_pages/reached_last_submission_id/last_submission_id，以及 ai_imported/ai_skipped/ai_failed。
  - Cookie 配置引导和过期提示已完成：设置面板说明从 `F12 -> Application/应用 -> Cookies -> https://www.luogu.com.cn` 复制 `_uid` 和 `__client_id`，并提醒 `__client_id` 不要泄露、不要提交到 Git。
  - 401/403 会提示 Cookie 可能失效，需要重新复制；网络失败、请求超时、返回格式异常也有简短错误提示。
  - AI 配置和测试连接已完成，DeepSeek 路径已由 Hardy 验收：API 平台能看到请求。
  - 当前笔记 AI 元数据补全已完成并验收：用户手动点击“AI 补全元数据”，AI 只生成 `title`、`tags`、`summary`；`tags` 限制为 3-5 个偏 OI/算法标签；不改正文、不自动保存、不自动 commit，只标记 dirty，等待用户确认后 Ctrl+S 保存。
  - 元数据补全只更新 frontmatter 的 `title` / `tags` / `summary`；`draft`、`difficulty`、`source`、`created`、`updated`、`luogu_submission`、`ai_generated`、`ai_model` 和未知字段会保留。
  - 当前笔记 AI 全文润色预览已完成并验收：只润色正文 body，不改 frontmatter；AI 返回后先预览，不直接覆盖；用户点击“应用到正文”后才替换正文并标记 dirty；不自动保存，不自动 commit。
  - AI Prompt 模板系统已完成：Prompt 存储在 `.oinb/prompts/`，且 `.oinb/prompts/` 已 gitignore，不提交到 Git。
  - 当前支持 `luogu-insight.md`、`note-metadata.md`、`note-polish.md` 三个模板，分别用于洛谷 insight 整理、当前笔记元数据补全、当前笔记正文润色。
  - 前端已有“AI Prompt”面板，可读取、编辑、保存模板；原右侧 textarea 过窄的问题已修复为宽弹窗 + 左侧列表 + 右侧大 textarea。
  - AI 缓存第一版已完成：缓存路径为 `.oinb/ai-cache/`，该目录已 gitignore；洛谷 insight、AI 补全元数据、AI 全文润色会走缓存，`test_ai_connection` 不缓存。
  - AI 缓存 key 包含 task、model、base_url hash、渲染后的 prompt 和输入上下文；prompt、model、base_url 或输入内容变化后会重新请求。
  - AI 缓存损坏会忽略并重新请求；AI 请求失败不会写缓存；缓存 JSON 不保存 `api_key` / `base_url`。
  - 桌面端 Ctrl+K / Cmd+K 搜索 MVP 已完成并验收：当前为内存扫描，不是 SQLite FTS5；搜索覆盖标题、正文、summary、tags、source 和路径；支持普通关键词、`tag:xxx`、`source:xxx`、`@recent`；最多显示 20 条结果；点击结果会打开对应笔记；若当前笔记有未保存改动，会复用现有 dirty 切换确认，不会直接丢内容。
  - 已知限制：全文润色 prompt 效果后续还可继续调优；桌面搜索正式 SQLite FTS5 索引还没做；只手动同步，不做启动自动同步或定时同步；关联推荐还没做；生产分发策略还没做。

尚未完成：

- 博客视觉仍可继续打磨。
- 还没有生产分发策略；当前桌面端仍是开发模式下启动 Astro dev server。
- 还没有自动定时 push / 退出时 push；当前只支持 Header 手动“同步 Git”。
- SQLite FTS5 正式索引还没做；当前桌面端 Ctrl+K / Cmd+K 搜索是内存扫描 MVP。
- 启动/定时自动同步还没做。
- AI 关联推荐还没做。

下一步建议：等待 Hardy 决定方向，可以继续博客视觉打磨，或进入 SQLite FTS5 正式索引、生产分发策略、自动定时/退出时 push、启动/定时洛谷同步，或 AI 关联推荐方向。

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
- SQLite FTS5 正式索引还没做；当前桌面端 Ctrl+K / Cmd+K 搜索是内存扫描 MVP。
- 启动/定时自动同步还没做。
- AI 关联推荐还没做。
- 博客视觉仍可继续打磨。
