# oi-notebook 项目情况说明（2026-05-25）

这份文档用于替代旧 handoff 文档。后续 GPT / Codex 接手时应优先阅读本文件，再看当前 `git status` 和最近提交，不要继续依赖已删除的旧交接文档。

## 1. 项目概览

`oi-notebook` 是一个面向 OIer 的本地桌面笔记工具。核心目标是把训练中的题解、trick、复盘和资料沉淀到本地 Markdown 笔记里，同时提供本地博客预览、洛谷导入、AI 辅助整理、标签体系治理等工作流。

当前主要模块：

- 桌面主应用：`src/App.tsx`，负责主布局、文件树、编辑器、预览、设置中心、洛谷导入、AI Sidebar、标签体系入口。
- 编辑与预览：`src/components/editor/MarkdownEditor.tsx`、`src/components/editor/MarkdownPreview.tsx`，不要随意改 ref 型同步模式。
- 文件树与标签选择：`src/components/file-tree/FileTree.tsx`、`src/components/TagPickerDialog.tsx`。
- AI / NoteX：`src/components/ai/AiSidebar.tsx`、`src/lib/aiWebSearch.ts`、`src/lib/searchDiagnostics.ts`、`src-tauri/src/ai.rs`。
- 标签体系：`shared/tagTaxonomy.ts`、`src/lib/tagTaxonomy.ts`、`src/lib/tagTaxonomyPrompt.ts`、`src/components/tag-manager/`、`src-tauri/src/tag_taxonomy.rs`。
- 前端 IPC 封装：`src/lib/api.ts`。业务 IPC 必须从这里走，不要在组件里直接 `invoke`。
- Rust 后端：`src-tauri/src/`，包含 notes、frontmatter、git、luogu、ai、blog_server、tag_taxonomy、local_search、web_cache、web_extract 等模块。
- 本地博客：`local-blog/` 子项目，主仓验证命令包括 `pnpm.cmd --dir local-blog build`。
- 共享逻辑：`shared/`，目前主要承载标签 taxonomy 与规范化逻辑。

技术栈：

- Tauri 2 + Rust 后端。
- React 19 + TypeScript + Vite 7。
- Tailwind CSS v4、shadcn/radix 风格组件、lucide-react 图标。
- CodeMirror 6 编辑器、unified/remark/rehype Markdown 管线、KaTeX、Shiki。
- dnd-kit 用于标签管理器排序。
- local-blog 子项目用于本地博客构建和验证。

常用运行与验证命令：

```powershell
pnpm.cmd tsc --noEmit
pnpm.cmd --dir local-blog build
pnpm.cmd build
cargo check --manifest-path .\src-tauri\Cargo.toml
pnpm.cmd tauri dev
```

## 2. 当前 Git 状态

当前 HEAD：

```text
fb4ab18 feat(tag): add normalization analysis engine
```

开始本轮前的暂存区为空：

```powershell
git diff --cached --name-only
```

开始本轮前过滤 `notes/**` 后的工作区有一个 pending 修改：

```text
 M shared/tagTaxonomy.ts
```

该修改不是本轮创建，内容是 AI 推荐标签 v2 相关的候选构建、后处理类型和 self-check 扩展，包括 `buildAiTagRecommendationCandidates`、`postprocessAiTagRecommendations` 等。后续接手者不要误以为它已提交。

最近关键 commits：

```text
fb4ab18 feat(tag): add normalization analysis engine
974b554 fix(tag): apply taxonomy rules across workflows
a5b4a28 feat(tag): refine taxonomy manager workflows
f74bb70 feat(tag): add standalone sortable taxonomy manager
fc2cd7d feat(tag): support hiding taxonomy entries
5aac184 feat(tag): add read-only taxonomy manager
e2cd4b5 style(tag): refine taxonomy settings layout
d163d75 feat(tag): apply selected legacy tag normalization
44efc22 feat(tag): preview legacy tag normalization
047b880 feat(tag): suggest normalizing legacy tags
f3962f4 chore(tag): ignore local taxonomy config
```

本轮文档清理会新增 `docs/oi_notebook_project_status_2026-05-25.md`，删除旧的 docs handoff 文档；不修改代码、不 staging、不 commit、不 push。

`notes/**` 和 `.oinb/**` 边界：

- `notes/**` 是用户本地笔记和测试笔记区，除非用户明确要求，否则不要读、改、恢复、stage 或 commit。
- `.oinb/**` 是本地运行配置、缓存、标签配置等运行态目录，除非用户明确要求，否则不要处理，也不要引用其中用户本地内容。
- 常规状态检查使用 `git status --short -- . ":(exclude)notes/**"`。
- 不要打印完整 `notes/**` 状态列表，除非用户明确要求。

## 3. 工作模式与硬性约束

- 禁止 `git add .`。
- 提交前必须使用精确 pathspec，例如 `git add -- src/App.tsx shared/tagTaxonomy.ts`。
- 提交前必须检查 `git diff --cached --name-only`。
- 普通开发不要处理 `notes/**` 和 `.oinb/**`。
- 前端到 Rust 的业务调用走 `src/lib/api.ts`，不要在组件层直接 `invoke`。
- 不要简化 `src-tauri/src/notes.rs` 的两层路径安全校验。
- 不要随意“优化” `MarkdownEditor`、`MarkdownPreview` 里的 ref 同步模式。
- 用户偏好是：先改代码，跑验证，给用户人工确认，再 commit / push。
- commit 和 push 通常可以合在一起做，除非用户明确说不要 push。
- 未来给 Codex 的指令尽量用纯文本，避免复杂嵌套 Markdown，减少解析偏差。
- UI 问题要先看真实代码和用户截图，不要凭记忆改。

提交前常规验证：

```powershell
pnpm.cmd tsc --noEmit
pnpm.cmd --dir local-blog build
pnpm.cmd build
```

涉及 Rust 后端时再加：

```powershell
cargo check --manifest-path .\src-tauri\Cargo.toml
```

涉及 Rust 单元测试时按模块追加，例如：

```powershell
cargo test tag_taxonomy --manifest-path .\src-tauri\Cargo.toml
cargo test notex_search_self_check --manifest-path .\src-tauri\Cargo.toml -- --nocapture
cargo test notex_url_reader_smoke --manifest-path .\src-tauri\Cargo.toml -- --nocapture
```

## 4. 标签体系当前状态

标签管理器已经从 `App.tsx` 内联巨型状态中拆出为独立工作区，核心文件在 `src/components/tag-manager/`：

- `TagManagerWorkspace.tsx`：工作区状态、保存链路、排序、hidden、alias、custom tag、merge 操作。
- `TagManagerShell.tsx`：独立弹窗壳、搜索、筛选、空白点击取消选中、debug 操作。
- `TagManagerRootColumn.tsx`：一级分类 dnd-kit 排序。
- `TagManagerGroupColumn.tsx`：二级中类与三级标签 dnd-kit 排序。
- `TagManagerDetailsPanel.tsx`：选中项详情、隐藏/恢复、别名、自定义标签、合并规则。
- `tagManagerOrdering.ts`：排序覆盖写入，当前通过 `createDenseOrderOverrides(currentOverrides, nextIds)` 做稠密重写。
- `tagManagerConfig.ts`：导入解析、自定义标签、合并规则、过滤等配置逻辑。

已完成能力：

- 标签管理器是独立工作区，不再平铺在设置页里。
- 支持一级 / 二级 / 三级 dnd-kit 排序。
- `orderOverrides` 使用 `nextIds` 稠密重写，避免旧 override 污染当前兄弟顺序。
- `workingConfig` 是保存链路的 UI 侧真相，保存失败会回滚。
- 支持隐藏 / 恢复内置标签。
- 支持 alias 管理。
- 支持 user custom 标签新建 / 编辑 / 删除。
- 支持 merges 写入 v1 配置。
- 支持导入 / 导出标签配置。
- 支持筛选器：全部、只看自定义、只看隐藏、只看合并。
- 支持空白点击取消选中。
- 输入框使用 `autoComplete="new-password"` 或 `autoComplete="off"` 等方式抑制浏览器/系统自动填充浮层。
- `vite.config.ts` 已让 watcher 忽略 `.oinb/**`，保存 `.oinb/tag-taxonomy.json` 不应触发 dev reload。
- 标签规则贯通 alias / merge / hidden / deprecated / user custom。
- 规范化分析引擎已在 `shared/tagTaxonomy.ts`：`analyzeSingleTagNormalization`、`analyzeTagListNormalization`、`buildTagNormalizationPreview`、`applyTagNormalizationPlan`。

Rust 持久化：

- `src-tauri/src/tag_taxonomy.rs` 读写 `.oinb/tag-taxonomy.json`，schema 使用 camelCase，包括 `entries`、`aliases`、`hiddenIds`、`orderOverrides`、`merges`。
- `get_tag_taxonomy_config`、`save_tag_taxonomy_config`、`reset_tag_taxonomy_config` 通过 `src/lib/api.ts` 暴露给前端。
- 不要把用户本地 `.oinb/tag-taxonomy.json` 的内容写进文档或提交。

标签选择器与文章信息区：

- `src/components/TagPickerDialog.tsx` 使用 taxonomy suggestion catalog，过滤 hidden / deprecated 标签。
- 文章信息区的 tags 字段通过标签选择器编辑。
- 旧标签规范化提示在 `src/App.tsx` 里使用 `analyzeTagListNormalization` 和 `applyTagNormalizationPlan`。
- 旧标签扫描和批量应用逻辑存在，但治理 UI 当前不是优先方向。

## 5. 标签体系重要历史坑

- 二级中类排序弹回的真实根因不是 dnd-kit 的 `nextIds` 错，而是保存后的 `savedOverrides` 没有按 `nextIds` 稠密重写。现在写入要继续走 `createDenseOrderOverrides`，不要恢复旧做法。
- 保存 `.oinb/tag-taxonomy.json` 曾触发 Vite dev reload；`vite.config.ts` 的 `server.watch.ignored` 已包含 `.oinb/**` 和 `**/.oinb/**`。
- `TagManager` 不应重新塞回 `App.tsx` 内联巨型状态里。
- 设置页不要再平铺自定义标签 / 自定义别名长列表；日常编辑应进入标签管理器工作区。
- 拖动时横向滚动要靠容器 `overflow-x-hidden`、`contain: paint`、固定宽度和 transform x clamp 一类处理控制，避免拖动项撑宽页面。
- 自动填充“保存的信息”浮层要通过 input `autocomplete` 相关属性抑制。
- merge / hidden / deprecated 的含义不同：merge source 会变成 deprecated，默认 suggestion / picker / AI prompt context 不应继续推荐它。

## 6. AI / NoteX 当前状态

已确认状态：

- `src/components/ai/AiSidebar.tsx` 已有 AI Sidebar、对话、流式回答、slash command、AI 润色、题解格式化、本地笔记搜索、公开网页搜索和 Developer Mode diagnostics。
- prompt 体系已有 `{{tag_context}}` 变量，说明位于 `src/App.tsx` prompt variables 区，生成逻辑在 `src/lib/tagTaxonomyPrompt.ts`。
- `AiSidebar` 会通过 `buildTagTaxonomyPromptContext` 构造标签上下文，并接收 `tagTaxonomyConfig`。
- 标签系统已经贯通到 AI tag_context：alias、merge、hidden、deprecated、user custom 都应影响 prompt 候选。
- `suggestNoteTags` 仍通过 `src/lib/api.ts` 调 Rust AI 命令。
- `onApplySuggestedTags` 最终回到 `src/App.tsx` 的 `handleApplyAiSuggestedTags`，只合并 frontmatter tags，不改正文。

当前推进或下一步计划：

- AI 推荐标签 v2 是近期主线。当前工作区已有未提交的 `shared/tagTaxonomy.ts` 修改，包含 AI 推荐候选构建和后处理雏形。
- 推荐标签应该只建议，用户确认后才写入 frontmatter。
- 不要让 AI 自动批量改 `notes/**`。
- 需要做标签选择器和推荐标签联动回归，确认 AI 输出被限制到 taxonomy canonical path，且 unknown / hidden / deprecated / duplicate / existing 能被正确过滤。

NoteX 搜索边界：

- 公开网页搜索不应读取 Cookie、登录态、浏览器历史，不绕 CAPTCHA，不使用代理，不递归爬取。
- 普通模式只展示用户可理解的状态和实际使用来源；Developer Mode 保留完整 diagnostics。

## 7. 文章 / 博客 / local-blog 当前状态

- `local-blog` build 是验证命令之一：`pnpm.cmd --dir local-blog build`。
- Tauri 后端 `src-tauri/src/blog_server.rs` 提供本地博客预览服务，包含 `/local-blog/` 静态资源、`/api/note`、`/note/{path}`、`/assets/{path}` 等路径。
- `src-tauri/src/paths.rs` 在 debug 下指向仓库 `local-blog/dist`。
- `src/App.tsx` 里有博客入口、打开博客、重启博客、标签体系设置入口。
- 文章信息区已经有 title、tags、summary、draft、difficulty、source 等 frontmatter 表单。
- 标签选择器已替代 tags 的普通文本输入。
- 难度下拉、旧标签规范化提示、旧标签扫描入口存在。
- 用户之后还会统一打磨首页、文章列表、阅读页和编辑器 UI 细节；当前不要过早大改视觉风格。

## 8. 设置页当前状态

设置树在 `src/App.tsx`：

- 分类包括 `appearance`、`ai`、`luogu`、`blog`、`data`、`about`、`diagnostics`、`git`、`editor`。
- `blog` 下有本地预览、标签体系、标签管理器。
- `diagnostics` 和 `git` 带 `developerOnly: true`，只有 Developer Mode 打开时进入设置树。
- 页脚 Git 状态/同步按钮也只在 `developerModeEnabled` 时显示。

标签体系页已经收口：

- 保留摘要统计、导入导出、旧标签扫描、标签管理器入口。
- 日常编辑进入标签管理器，不在设置页直接展开长列表。
- 如果要改设置中心 / dialog / 大弹窗，注意宽度、滚动、中文换行和移动端约束。

## 9. 已知待办 / 后续计划

- AI 推荐标签 v2：接上当前 `shared/tagTaxonomy.ts` WIP，完善候选、后处理、prompt、UI 确认流和验证。
- 标签选择器和推荐标签联动回归：确认已有 tags、推荐 tags、taxonomy config、merge/hidden/deprecated 的组合都正确。
- 旧标签治理 UI 目前不优先做，只保留扫描、预览和可控应用。
- 首页 / 文章列表 / 阅读页 UI 细节后续统一打磨。
- 标签管理器继续真实使用观察，尤其排序保存、merge、custom tag 删除、hidden 恢复。
- 发布前清理 debug / handoff / 临时日志，并重新做打包验证。
- 发布前至少跑前端 build、local-blog build、Rust check；若改到 Rust 路由、安全、搜索或标签持久化，补对应 cargo test。

## 10. 常用验证命令

TypeScript：

```powershell
pnpm.cmd tsc --noEmit
```

local-blog：

```powershell
pnpm.cmd --dir local-blog build
```

前端生产构建：

```powershell
pnpm.cmd build
```

Rust check：

```powershell
cargo check --manifest-path .\src-tauri\Cargo.toml
```

Rust tests 示例：

```powershell
cargo test tag_taxonomy --manifest-path .\src-tauri\Cargo.toml
cargo test notex_search_self_check --manifest-path .\src-tauri\Cargo.toml -- --nocapture
cargo test notex_url_reader_smoke --manifest-path .\src-tauri\Cargo.toml -- --nocapture
```

Git 状态：

```powershell
git diff --cached --name-only
git status --short -- . ":(exclude)notes/**"
git log --oneline -12
git diff --cached --name-only
```

提交前：

```powershell
git add -- <exact paths>
git diff --cached --name-only
git commit -m "<message>"
git push
```

除非用户明确要求，不要执行上面的 `git add`、`git commit`、`git push`。

## 11. 给下一个 GPT / Codex 的接手建议

- 先读这份文档。
- 再看 `git diff --cached --name-only`、`git status --short -- . ":(exclude)notes/**"`、`git log --oneline -12`。
- 不要凭记忆改，先读真实文件。
- 不要读旧 handoff；旧 handoff 已删除。
- 小步修改，小步验证。
- UI 问题先看用户截图和当前 DOM / 组件结构，再下判断。
- 涉及设置中心、dialog、大弹窗时，注意宽度、滚动、中文换行、按钮文本长度和移动端视口。
- 涉及标签体系时，优先看 `shared/tagTaxonomy.ts`、`src/components/tag-manager/`、`src/lib/tagTaxonomyPrompt.ts`、`src/components/TagPickerDialog.tsx`。
- 涉及 AI 推荐标签时，注意推荐只建议，不自动批量写 notes；用户确认后才写 frontmatter。
- 涉及后端路径时，先看 `src-tauri/src/notes.rs`，不要削弱两层路径安全校验。
