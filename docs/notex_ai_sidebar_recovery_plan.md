# NoteX AI 侧边栏恢复计划

> 目标：只恢复右侧 AI 侧边栏，不改设置中心、不改文件树、不改 local-blog、不改 Rust、不处理 `notes/**` 和 `.oinb/**`。  
> 方向：保留虚拟列表、分块 hydration、Markdown cache 这套新架构，但把功能和 UI 恢复到之前已经修到的标准。

---

## 0. 当前原则

这份计划不是继续“顺便优化”，而是把 NoteX AI 侧边栏恢复到之前已经反复修到的验收标准。

本轮只允许围绕 AI 侧边栏做修复：

允许修改：

- `src/components/ai/AiSidebar.tsx`
- `src/components/ai/notexWorkbench.css`
- `src/components/ai/VirtualMessageList.tsx`
- `src/components/ai/useVirtualMessageList.ts`
- `src/components/ai/markdownCache.ts`

只有在左侧 AI 按钮 toggle 必须修时，才允许最小修改：

- `src/App.tsx`

禁止修改：

- `src/components/settings/**`
- `src/components/file-tree/FileTree.tsx`
- `src/index.css`，除非确认仍有 AI 侧边栏样式残留且必须迁回 scoped CSS
- `local-blog/**`
- `src-tauri/**`
- `notes/**`
- `.oinb/**`

执行期间不要 stage，不要 commit，不要 push。

---

## 1. 总体验收标准

最终恢复标准：

1. 左侧 AI 按钮可以打开 / 收起右侧 AI 侧边栏。
2. 历史记录仍然存在，切换会话后历史正确。
3. 输入内容可以点击发送，也可以 Enter 发送。
4. 发送后消息显示在 composer 上方，不被遮挡。
5. AI 回复时，用户在底部附近应自动跟随。
6. 用户上滚后不会被强制拉回底部。
7. 配置组菜单、模型菜单、笔记、联网、slash command 菜单恢复之前的 NoteX 风格。
8. Dark theme 下不发棕、不发紫，主体保持中性深灰体系。
9. Light theme 下不是黑色孤岛，背景和 composer 为白色。
10. 虚拟列表架构保留，但不能牺牲功能正确性。
11. 打开 AI 侧边栏不能长时间 Loading chat 并卡死整个软件。
12. 关闭 AI 侧边栏后，其它区域不应被 NoteX 拖慢。

---

## 2. 架构边界

必须保持清晰分层：

### 2.1 数据层

真实消息数据只能来自：

- `conversations`
- `activeConversation`
- `activeConversation.messages`

要求：

- `activeConversation.messages` 是唯一 canonical 数据源。
- `messages useMemo` 必须从 canonical messages 派生。
- hydration 不能把历史清空。
- hydration 不能用旧 snapshot 覆盖用户新发消息。

### 2.2 Hydration 层

hydration 只负责：

- 分块读取 / sanitize / 合并 localStorage state；
- 给打开过程降阻塞；
- 准备元数据。

hydration 不允许：

- 取代真实消息数据；
- 让 composer 失效；
- 用空数组覆盖当前会话；
- 用旧 snapshot 覆盖运行时新增消息。

### 2.3 Virtual list 层

虚拟列表只负责显示：

- 接收完整 canonical messages；
- 根据 scrollTop / height cache 计算可视区域；
- 渲染 top spacer + visible messages + bottom spacer；
- 按 message id 缓存高度；
- 切换 conversation 时 reset height cache / range。

虚拟列表不允许：

- 管理真实消息；
- 决定消息是否存在；
- 接管发送逻辑；
- 把未 hydrate 完解释为“无历史”。

### 2.4 Composer 层

composer 必须只有一套真实组件。

要求：

- loading 阶段和正式阶段使用同一套真实 composer；
- input state、onChange、onKeyDown、send button、model trigger、note toggle、web toggle 都复用原逻辑；
- composer 不依赖 `isHydrating` / `isContentReady` / `virtualReady`；
- 发送后写入 canonical conversation。

---

## 3. 阶段 0：建立当前基线

执行：

- `git status --short -- . ":(exclude)notes/**"`
- `git diff --cached --name-only`
- `pnpm.cmd tsc --noEmit`

如果 TypeScript 不通过，先修编译错误，不进入 UI 修复。

---

## 4. 阶段 1：恢复基础功能

### 4.1 AI 侧边栏开关

验收标准：

- AI 关闭时，点击左侧 AI 按钮打开。
- AI 打开时，再点击左侧 AI 按钮收起。
- maximized 状态下也不能卡住或无法关闭。
- resize rail、overlay、hydration、virtual list 都不能影响 open / close。
- 如果必须改 `App.tsx`，只能最小修改 toggle 逻辑。

### 4.2 历史记录

验收标准：

- 打开 NoteX 后，历史记录还在。
- 切换会话后，显示对应会话历史。
- 关闭再打开，历史仍在。
- hydration 不覆盖当前会话。
- 如果消息很多，可以延迟渲染，但不能显示成“历史全没了”。

重点检查：

- `activeConversation`
- `activeConversation.messages`
- `messages useMemo`
- `hydratedMessages`
- `displayMessages`
- `visibleMessages`
- `VirtualMessageList props.messages`
- `resetKey`
- hydration generation / mutation merge

### 4.3 输入和发送

验收标准：

- textarea 可以输入。
- 点击发送按钮可以发送。
- Enter 可以发送。
- send disabled 只能与输入为空、正在响应、模型不可用等真实条件有关。
- 发送不依赖 hydration。
- 发送后用户消息进入 canonical conversation。
- 发送后消息显示在 composer 上方。

阶段 1 完成后执行：

- `pnpm.cmd tsc --noEmit`

---

## 5. 阶段 2：恢复 composer 与底部控件 UI

### 5.1 Dark theme

标准：

- 阅读区背景：`#181818`
- composer card 背景：`#2e2e2e`
- hover：`#2A2D2E`
- composer 外层透明
- 不要黑色夹层
- 不要整块 footer 背景
- composer 下方 bottom fill 只能补下方，不能盖上方消息区

### 5.2 Light theme

标准：

- NoteX 主背景：`#FFFFFF`
- messages / chat body：`#FFFFFF`
- composer card：`#FFFFFF`
- composer bottom fill：`#FFFFFF`
- 代码块背景：`#F9F9F9`
- 代码块复制按钮轻量，不要厚重胶囊

### 5.3 字号与间距

标准：

- 对话正文：`20px`
- assistant markdown：`20px`
- 用户消息：`20px`
- composer input：`20px`
- 对话内容左右距侧边栏边缘：`30px`
- composer 左右留白：`30px`

### 5.4 必须命中的 class hook

重点确认这些 class hook 仍真实命中：

- `.notex-composer-wrap`
- `.notex-composer-card`
- `.notex-composer-input`
- `.notex-composer-toolbar`
- `.notex-model-trigger`
- `.notex-tool-pill`
- `.notex-composer-send`
- `.notex-composer-bottom-fill`

如果 DOM 改了导致 selector 失效，补 className，不要重写旧 UI。

### 5.5 模型、笔记、联网

验收标准：

- 模型选择是 NoteX trigger 样式，不是裸按钮。
- 笔记 / 联网是圆形 pill 样式，不是方块。
- hover 有反馈。
- 模型菜单不显示 API 管理。
- 模型菜单每行只显示模型主名称，不要后面一串小字。
- selected 行右侧显示普通 `√`。
- 不要圈起来的 check。
- 不要整行强高亮。

阶段 2 完成后执行：

- `pnpm.cmd tsc --noEmit`

---

## 6. 阶段 3：恢复顶部配置组菜单

验收标准：

- 顶部中间显示当前配置组。
- NoteX 标题下面不要显示“默认 OpenAI Compatible”等副标题。
- 配置组下拉和 slash command menu 是同一类浮层风格。
- 不要厚重大卡片。
- hover 明显。
- selected 行右侧显示普通 `√`。
- 不要圈起来的 check。
- 不要一行大字后面跟重复小字。
- 不要裸 button。
- light / dark 都适配。

重点确认这些 class hook：

- `.notex-config-trigger`
- `.notex-config-menu`
- `.notex-config-menu-item`
- `.notex-config-menu-check`
- `.notex-header`
- `.notex-modebar`

阶段 3 完成后执行：

- `pnpm.cmd tsc --noEmit`

---

## 7. 阶段 4：恢复 slash command 菜单

验收标准：

- 删除顶部“选择命令”那行。
- 删除“文档”“上下文”字样。
- 每条高度 `40px`。
- 字体 `20px`。
- 命令名和说明放同一行。
- 左右留 `30px`。
- 背景和 composer 体系一致，略微透明 / blur。
- dark hover 高亮：`#2A2D2E`。
- light hover 使用浅灰 token。
- 不要粗重列表。
- 不要超出侧边栏。

重点确认：

- `.notex-command-panel`
- `.notex-command-list`
- `.notex-command-item`
- `.notex-command-name`
- `.notex-command-description`

阶段 4 完成后执行：

- `pnpm.cmd tsc --noEmit`

---

## 8. 阶段 5：恢复会话列表与“查看全部”

验收标准：

- 会话列表行高不要太高。
- 当前会话未 hover 时不要整行高亮。
- 最近一次会话标题不要加粗。
- “查看全部”是挂在侧边栏上的浮层，不像完整页面。
- 浮层左右距侧边栏边缘 `15px`。
- 浮层内部会话名称左右留 `10px`。
- 默认只显示 8 个会话。
- 超出后内部滚动，底部自然虚化。
- 搜索条不要完整边框。
- 搜索区和列表之间只保留轻微横向分割线。
- 分割线不要左右封口。
- 点击下方空白处可收起查看全部。
- hover / selected 不要太重。

阶段 5 完成后执行：

- `pnpm.cmd tsc --noEmit`

---

## 9. 阶段 6：恢复虚拟列表与滚动行为

保留虚拟列表，但行为必须正确。

验收标准：

- `VirtualMessageList props.messages` 是完整 canonical messages。
- DOM 只渲染可视区附近消息。
- top spacer / bottom spacer 正确。
- height cache 按 message id 存。
- 切换 conversation 时 reset height cache / range，但不清空消息。
- message key 稳定。
- 长会话滚动不空白、不重叠、不跳动。
- 发送消息后 force scroll to bottom。
- 消息不能出现在 composer 后面。
- AI 回复时，底部附近自动跟随。
- 用户向上滚动后，不强制拉回。
- 用户回到底部后恢复跟随。
- 关闭 AI 侧边栏后 observers / rAF / timeout 清理。

禁止用巨大 padding 硬修。

阶段 6 完成后执行：

- `pnpm.cmd tsc --noEmit`

---

## 10. 阶段 7：恢复 Markdown、代码块、引用、调试信息

验收标准：

- Markdown cache 保留。
- 只对 visible assistant message 做 Markdown / citation / code block 处理。
- streaming 消息节流，不要 token 级重渲染全部列表。
- 代码块 light theme 背景：`#F9F9F9`
- 代码块复制按钮轻量。
- 引用来源显示正常。
- Developer diagnostics 普通模式不构造。
- Developer Mode 下调试信息不横向溢出。
- 调试信息左右也要在 `30px` 内容区域内。
- 长 URL / query / reason 自动换行。

阶段 7 完成后执行：

- `pnpm.cmd tsc --noEmit`

---

## 11. 阶段 8：检查 resize rail 与全屏按钮

保持之前修复，不要回退。

验收标准：

- AI resize rail 只在 AiSidebar 容器内部渲染。
- 只在 `isOpen && !isMaximized && onResizePointerDown` 时显示。
- rail z-index 不压过 modal / dialog。
- rail 不显示在其它页面上方。
- 点击全屏不应卡。
- resize 用 rAF 合并。
- `settingsCenterRect` 只在设置中心打开且非最大化时更新。

如果已经正确，不要重写。

---

## 12. 阶段 9：最终验证

执行：

- `pnpm.cmd tsc --noEmit`
- `pnpm.cmd build`

如果 build 因 `dist/assets` EPERM，说明情况，不要杀进程。

### GUI 验收清单

如果有 GUI 能力，逐项验证：

1. 左侧 AI 按钮能打开 / 收起。
2. 历史记录还在。
3. 切换会话历史正确。
4. 输入内容可以点击发送。
5. Enter 可以发送。
6. 发送后消息显示在 composer 上方。
7. 配置组菜单 UI 正常。
8. 模型菜单 UI 正常。
9. 笔记 / 联网是 pill。
10. slash command 菜单符合 `40px` / `20px` / inline 说明。
11. 会话列表 / 查看全部正常。
12. 长会话滚动不空白、不错位。
13. AI 回复自动跟随不回退。
14. 用户上滚不被拉回。
15. dark theme 正常。
16. light theme 正常。
17. code block light 背景 `#F9F9F9`。
18. 打开 AI 侧边栏不长时间卡死。
19. 展开后全局不卡。
20. 关闭 AI 后全局不卡。

如果没有 GUI 能力，必须明确说明，不要伪造。

---

## 13. 完成后汇报模板

不要 stage，不要 commit，不要 push。

汇报：

1. 修改了哪些文件。
2. 是否只改 AI 侧边栏相关文件。
3. 左侧 toggle / 历史 / 发送分别如何修复。
4. 配置组菜单、模型菜单、composer、slash menu 如何恢复。
5. 会话列表和查看全部如何恢复。
6. 虚拟列表架构是否保留。
7. canonical data / hydration / virtual list / composer 分工是否仍正确。
8. light / dark theme 是否检查。
9. `pnpm.cmd tsc --noEmit` 结果。
10. `pnpm.cmd build` 结果。
11. GUI 验证结果；如果没有 GUI 能力，请说明。
12. `git status --short -- . ":(exclude)notes/**"`。
13. 确认没有处理 `notes/**` 和 `.oinb/**`。
