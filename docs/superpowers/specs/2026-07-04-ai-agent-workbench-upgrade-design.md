# AI Agent Workbench 大升级总设计

日期：2026-07-04
状态：待评审
范围：AI 大升级长期总 spec / 北极星文档

## 1. 文档目的

这份文档是 OI Notebook 后续 AI 大升级的长期北极星。它回答：

- 最终要把 AI 做成什么系统；
- 为什么不能继续在旧 AI 侧边栏上打补丁；
- 如何系统性学习 `openai/codex` 的成熟 Agent 工程架构；
- 每个阶段推进时必须参考哪些架构契约；
- 上下文压缩、换线程、换 worker 后如何恢复方向；
- 如何防止后续实现退化成玩具代码、prompt 拼接、UI 堆逻辑。

这份文档不是某个单阶段施工计划。任何后续 P 阶段、worker 线程、验收线程、收口线程都必须先读它，再读对应阶段冻结 spec 或实施计划。

## 2. 一句话目标

将 OI Notebook 的 AI 从旧侧边栏问答功能升级为一个通用能力扎实、OI 场景特别强、以本地优先和可审计执行为核心的 Codex-style Agent Workbench。

它不是 Codex CLI 的壳，也不是只会做 OI 的窄工具。它应该是一个成熟的本地桌面 Agent 架构：

- 通用任务不弱：读笔记、查资料、整理知识、写作、解释代码、生成可审核修改、管理证据和上下文；
- OI 任务很强：读题、查题解、结合本地笔记、调试代码、跑样例、对拍、生成 diff、沉淀题解和博客；
- 默认低依赖：普通用户不需要安装 Codex CLI、MCP server、Node、Python、浏览器插件；
- 高级扩展可选：MCP、Codex Adapter、OpenCode Adapter、Skill Adapter 可以作为高级扩展，但不能绑死默认体验。

## 3. 产品北极星

最终用户体验应该是：

1. 用户打开一篇笔记、一段代码、一个网页、一道题，或一个问题。
2. Agent 能构造清晰的工作上下文，而不是只把文本塞进 prompt。
3. Agent 能决定需要哪些工具、证据、权限和验证步骤。
4. Agent 的每一步都以事件形式可观察：思考状态、工具开始、工具输出、权限请求、证据加入、patch 生成、失败原因。
5. Agent 默认只读，涉及联网、Cookie、执行、写文件、应用 patch 时必须走权限和安全策略。
6. Agent 给出的结论尽量基于证据和验证，而不是无来源编造。
7. Agent 对文件修改必须 diff-first：生成 patch、展示 diff、用户确认、事务应用、记录历史、必要时回滚。
8. Agent 能把过程沉淀为本地知识：题解、博客草稿、标签、证据、反例、运行记录、易错点。

通用闭环：

```text
理解任务 -> 构造上下文 -> 计划工具 -> 请求权限 -> 执行工具 -> 记录事件
-> 收集证据 -> 生成结果或 patch -> 用户确认 -> 验证 -> 沉淀知识
```

OI 闭环：

```text
读题 -> 查资料 -> 看本地笔记 -> 写/读代码 -> 跑样例 -> 找 bug
-> 生成 diff -> 用户确认 -> 重新验证 -> 写题解 -> 沉淀博客/知识
```

## 4. Codex 成熟工程框架对标

这里的“学习 Codex”不是照搬 UI，也不是默认依赖 Codex CLI，而是学习它成熟 Agent Harness 的工程结构。

### 4.1 必须学习的结构

1. **Core 与 UI 分层**
   - Codex 有 core、TUI、CLI、protocol、sandbox、exec policy 等边界。
   - OI Notebook 必须有独立 Agent Core；React UI 只消费事件和状态，不拥有 agent 逻辑。

2. **真实 Agent Loop**
   - 成熟 Agent 不是一次 `runTool()`。
   - 必须支持 model step、tool call、permission decision、tool execution、observation、continuation、interruption、compaction、final result、failure。

3. **Tool Registry / Router / Lifecycle**
   - 工具必须统一注册、路由、校验、分发、记录生命周期。
   - 工具不能散落在 React 组件、prompt 字符串或临时 helper 里。

4. **Approval / Sandbox / Policy**
   - 权限与安全必须是 runtime 层策略，不是 UI 里的几个确认按钮。
   - 读、本地搜索、联网、Cookie、写文件、应用 patch、执行命令、删除等能力必须有明确政策。

5. **Session / Event Protocol**
   - session 和事件是一等协议。
   - UI 只消费 `AgentEvent`，不直接理解每个工具内部实现。

6. **Patch-first Workflow**
   - AI 修改文件必须生成 patch 和 diff。
   - 未经确认不得静默写用户文件。

7. **测试契约**
   - 每个架构层都要有 contract tests。
   - 不能只靠浏览器里“看起来能跑”。

### 4.2 不照搬的部分

Codex 的产品世界是软件工程仓库；OI Notebook 的默认世界是本地笔记、学习资料、代码片段、OI 题目和用户知识库。

所以我们不照搬：

- repo-centric 的产品边界；
- Codex CLI 默认依赖；
- 泛用终端式 UI；
- 默认完整 shell 权限；
- 把项目做成另一个 coding agent 平替。

我们要吸收的是成熟 harness，落地成 OI Notebook 的本地优先桌面 Agent。

## 5. 核心架构总览

```text
AI Agent Workbench
├─ Agent Core
│  ├─ AgentRuntime
│  ├─ AgentLoop
│  ├─ AgentSession
│  ├─ AgentEvent
│  ├─ ContextBuilder
│  ├─ CompactionPolicy
│  └─ SessionStorage
├─ Tool Layer
│  ├─ ToolRegistry
│  ├─ ToolRouter
│  ├─ ToolLifecycle
│  ├─ ToolSchema
│  ├─ ToolObservation
│  └─ UnsupportedToolHandler
├─ Permission And Safety Layer
│  ├─ PermissionPolicy
│  ├─ ApprovalCache
│  ├─ SandboxPolicy
│  ├─ CookiePolicy
│  └─ PatchPolicy
├─ Knowledge And Evidence Layer
│  ├─ SearchProvider
│  ├─ ReaderProvider
│  ├─ Extractor
│  ├─ EvidenceStore
│  ├─ EvidencePacket
│  ├─ ResearchCache
│  └─ LocalKnowledgeIndex
├─ Workspace Layer
│  ├─ GeneralWorkspace
│  ├─ ProblemWorkspace
│  ├─ RunRecord
│  ├─ Counterexample
│  └─ DraftArtifact
├─ Provider Layer
│  ├─ ProviderAdapter
│  ├─ ModelAdapter
│  ├─ ModelCapabilityMatrix
│  └─ RequestLogStore
└─ UI Layer
   ├─ Sidebar Agent
   ├─ Fullscreen Workbench
   ├─ Tool Trace Viewer
   ├─ Evidence Panel
   ├─ Permission Surface
   ├─ Diff Viewer
   ├─ Problem Workspace Panel
   └─ Final Result Card
```

## 6. 核心对象：Workspace

### 6.1 GeneralWorkspace

通用任务使用 `GeneralWorkspace`：

- 当前笔记；
- 选中文本；
- 相关本地笔记；
- 读取过的网页；
- 用户问题；
- 证据和引用；
- 输出草稿；
- patch 和修改建议。

这保证 Agent 不会被窄化成只做 OI。

### 6.2 ProblemWorkspace

OI 任务使用 `ProblemWorkspace`，它是 GeneralWorkspace 的 OI 特化。

它应该包含：

- 题目来源、题号、标题、URL；
- 题面、输入输出格式、数据范围、样例；
- 当前代码、暴力代码、生成器、checker；
- 编译配置、运行记录、样例输出、对拍结果；
- 反例、错误定位、修复记录；
- web evidence、本地笔记 evidence、引用、可信度；
- 相关模板、相关题目、标签、易错点；
- 题解草稿、本地博客草稿；
- Agent session 和 trace event ids。

## 7. 事件协议底线

UI 必须以事件协议为主消费面。

基础事件至少包括：

- `agent.started`
- `agent.plan.created`
- `model.delta`
- `tool.requested`
- `permission.required`
- `permission.resolved`
- `tool.started`
- `tool.output`
- `tool.failed`
- `observation.added`
- `evidence.added`
- `patch.generated`
- `patch.applied`
- `workspace.updated`
- `agent.compacted`
- `agent.completed`
- `agent.failed`

任何新功能如果不能表达成事件，就不能进入成熟 Workbench UI。

## 8. 权限与安全底线

最小权限种类：

- `read`
- `local-note-search`
- `public-network`
- `cookie-network`
- `write`
- `patch-apply`
- `execute`
- `destructive`

最小状态：

- auto-allowed；
- prompt-required；
- denied；
- blocked-by-configuration；
- unavailable；
- degraded-fallback。

Cookie 规则：

- 用户显式配置；
- 本地保存；
- 限定域名；
- 不进模型；
- 不发给 Tavily；
- 不发给第三方模型 provider；
- 可删除；
- 使用有日志；
- 读取登录态页面前必须明确提示。

## 9. UI 升级范围

AI UI 升级属于本次大升级，但 UI 不是先行乱改的理由。

UI 的职责：

- 展示 runtime 真实状态；
- 展示工具轨迹；
- 展示证据；
- 展示权限请求；
- 展示 diff；
- 展示验证结果；
- 展示失败和降级原因；
- 提供继续执行的安全入口。

UI 不得：

- 拼 prompt；
- 直接拥有工具逻辑；
- 把 mock/manual flow 展示成真实能力；
- 用固定 ready 状态冒充健康检查；
- 把旧侧边栏继续堆成主架构。

## 10. 分阶段路线

后续每个 P 阶段必须说明它推进了下面哪一层，并引用本节。

### P0：架构重置与文档冻结

目标：

- 写 AI 大升级总 spec；
- 写当前阶段冻结 spec；
- 明确 Codex-style 架构基准；
- 梳理当前 P4 的真实状态；
- 明确禁止项和阶段验收口径。

产物：

- 总 spec；
- P4 Architecture Correction Freeze spec；
- 当前 AI 资产 keep / migrate / rewrite / discard 清单。

### P1：Agent Core Contract

目标：

- 建立真实 Agent Loop 协议；
- 明确 session、event、tool call、observation、continuation、failure；
- 将一击式 `runTool()` 降级为 loop 的内部执行单元，而不是成熟 runtime。

验收：

- contract tests 覆盖 loop 状态；
- UI 只消费 events；
- 无真实 provider 行为变更，除非对应阶段批准。

### P2：Tool / Permission Contract

目标：

- 将 ToolRegistry 升级为 Registry + Router + Lifecycle；
- 增加 schema、duplicate guard、unsupported tool、timeout、exposure；
- 建立 PermissionPolicy、ApprovalCache、SandboxPolicy。

验收：

- 工具不能重复/静默覆盖；
- 未注册工具有结构化失败；
- 写/执行/Cookie/patch 默认不可自动执行。

### P3：Workspace Contract

目标：

- 建立 GeneralWorkspace；
- 将 ProblemWorkspace 作为 OI 特化；
- 明确 workspace 与 evidence、runs、drafts、patches 的关系。

验收：

- 通用任务不被 OI 模型绑死；
- OI 任务能稳定挂到 ProblemWorkspace；
- 持久化必须等 storage/privacy spec 批准。

### P4：Web Reader / Evidence

目标：

- 分离 search、read、extract、evidence、cache；
- Tavily 作为配置后可用的主方向；
- manual URL 和 fallback search 是降级路径；
- Luogu Cookie Reader 走严格安全边界。

验收：

- Evidence 可追踪；
- 来源可引用；
- Cookie 不进入模型或第三方；
- 搜索和阅读不是巨型混合函数。

### P5：Workbench UI IA

目标：

- 设计成熟侧边栏与全屏 Workbench；
- Tool Trace、Evidence、Permission、Diff、Final Result 全部基于事件协议；
- UI 显示真实状态。

验收：

- preview / unavailable / blocked / running / failed / completed 状态清楚；
- 不再用未来模式名称冒充已接通能力；
- 旧 AiSidebar 不能继续作为主架构补丁点。

### P6：Code Debugger / Patch Workflow

目标：

- 编译、运行样例、比较输出；
- 生成 patch；
- diff preview；
- 用户确认；
- 应用后重新验证；
- 记录运行和修改历史。

验收：

- AI 不静默写文件；
- patch-first；
- 失败可恢复；
- 运行在安全策略内。

### P7：OI Research / Solution Skills

目标：

- `/research-problem`
- `/debug-code`
- `/stress-test`
- `/write-solution`
- `/find-notes`

验收：

- 资料研究有 evidence；
- 调试有运行或对拍证据；
- 题解沉淀能关联 workspace；
- 不照搬网页原文。

### P8：Advanced Extension

目标：

- MCP Adapter；
- Codex Adapter；
- OpenCode Adapter；
- custom skills。

验收：

- 默认体验不依赖高级扩展；
- Adapter 与主 runtime 解耦；
- 高级用户可以扩展工具，但不会污染核心架构。

## 11. 每个 P 阶段必须回答的问题

任何新计划必须先回答：

1. 它推进的是 Core、Tool、Permission、Workspace、Evidence、Provider、UI 哪一层？
2. 它是否改变 provider、prompt、model selection、web search 行为？
3. 它新增了哪些工具？这些工具的 schema、permission、failure state 是什么？
4. 它新增了哪些事件？UI 是否只消费事件？
5. 它是否需要写文件、执行命令、联网、Cookie、patch？
6. 它是否能在没有 Codex CLI、MCP、Node、Python 的普通环境运行？
7. 它是否保持通用能力，同时增强 OI 场景？
8. 它的 contract tests 是什么？
9. 它如何验证没有绕过 `src/lib/api.ts`？
10. 它如何保证 `notes/**` 不被 routine engineering work 误改？

回答不清楚，不进入实现。

## 12. 上下文压缩后的恢复协议

任何线程在上下文压缩、换人、换 worker、重开会话后，必须按以下顺序恢复：

1. 读 `AGENTS.md`。
2. 跑 `git status --short -- . ":(exclude)notes/**"`。
3. 跑 `git diff --cached --name-only`。
4. 读本总 spec。
5. 读当前阶段 freeze spec 或 implementation plan。
6. 明确自己负责的 P 阶段和模块层。
7. 说明本轮不会触碰的禁止项。
8. 再读直接相关源码。

如果只剩这份文档可见，先不要实现。先按上面的恢复协议找回当前阶段文档；如果找不到阶段文档，就只做只读审计和阶段计划，不写功能代码。

任何 worker 报告必须包含：

- 当前阶段；
- 当前模块层；
- 改了哪些文件；
- 没改哪些禁止区域；
- 跑了哪些验证；
- 是否 staged / committed / pushed。

## 13. 阶段计划模板

任何新的 P 阶段实施计划必须使用下面结构。缺一项就不能交给 worker 实现：

```text
阶段名称：
对应总 spec 层级：
本阶段目标：
明确非目标：
允许修改的文件/模块：
禁止触碰的文件/模块：
Codex 架构对标点：
新增或变更的事件：
新增或变更的工具：
权限和安全策略：
UI 如何消费事件：
测试与验收命令：
API boundary 检查：
notes/** 处理规则：
预计 worker 拆分：
退出标准：
```

每个 worker 的任务提示也必须包含：

- 当前阶段名称；
- 只负责的模块层；
- 可改路径和禁止路径；
- 需要先读的 spec / plan；
- 必须运行的验证命令；
- 禁止 `git add .`、`git add -A`、`git commit -a`；
- 是否允许 stage / commit / push。

## 14. Codex 参考刷新规则

后续每个涉及 Agent Core、Tool、Permission、Session/Event、Patch、UI 分层的阶段，都必须重新确认一次 `openai/codex` 的当前结构，优先查看上游仓库而不是二手文章。

最少要确认：

- core 与 UI/CLI 是否仍分层；
- agent loop 的当前结构；
- tool registry/router/lifecycle 的当前结构；
- approval/sandbox/exec policy 的当前结构；
- session/event protocol 的当前结构；
- patch workflow 的当前结构。

报告中必须区分：

- **上游事实**：Codex 当前确实这样做；
- **本项目映射**：OI Notebook 应该如何吸收；
- **不照搬项**：哪些 Codex 产品边界不适合本项目。

如果无法联网读取上游仓库，则必须明确标记“Codex 参考未刷新”，只允许继续做本地只读计划或低风险文档工作，不允许声称新实现已经符合 Codex 当前架构。

## 15. 成熟度验收

一个模块不能因为“能 demo”就叫完成。成熟标准：

- 有清晰职责；
- 有 typed input/output；
- 有 permission behavior；
- 有 failure state；
- 有 event output；
- 有 focused tests；
- 有 API boundary audit；
- UI 反映真实能力；
- 没有隐藏 provider、prompt、Cookie、文件写入或命令执行副作用。

## 16. 架构失败判据

出现以下情况，即使功能 demo 能跑，也判定为架构失败：

- React 组件开始拼 prompt 或拥有 agent 业务分支；
- 新工具没有 schema、permission、failure state；
- UI 直接理解工具内部流程，而不是消费事件；
- mock/manual flow 被描述为真实能力；
- readiness 固定乐观返回；
- provider、prompt、model selection、web search 行为在未批准阶段被改变；
- 写文件、执行命令、Cookie、patch 绕过权限策略；
- 新阶段没有引用本总 spec 和阶段 freeze/plan；
- worker 报告没有验证命令和精确文件清单。

## 17. 当前 P4 解释

当前 P4 只能称为 **Agent Workbench Foundation Preview**。

它有价值，但还不是成熟 Agent：

- `AgentRuntime` 仍是最小工具执行器；
- ToolRegistry 还不是成熟 router；
- PermissionManager 还不是完整 policy；
- Workbench UI 仍有 preview/mock/manual flow；
- readiness 语义需要纠偏；
- Luogu/current research 不能被表述为完整接通；
- 真实 model loop、patch、execute、code runner、持久化都还未进入成熟阶段。

因此下一步必须先执行 P4 Architecture Correction Freeze，再推进 P5 或后续能力。

## 18. 最小启动提示

如果一个新线程只有很少上下文，可以直接用下面这段作为启动提示：

```text
你在 D:\Dev\Projects\oi-notebook。先读 AGENTS.md，然后运行：
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only

再读 docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md。
如果当前任务涉及 P4/P5 前置纠偏，再读
docs/superpowers/specs/2026-07-04-p4-architecture-correction-freeze-design.md。

本项目 AI 升级目标是 Codex-style Agent Workbench：通用能力扎实，OI 场景特别强。
不要把旧 AI 侧边栏继续堆成主架构；不要把 mock/manual flow 当真能力；
不要绕过 src/lib/api.ts；不要改 notes/**；不要 git add .。
先说明当前阶段、负责层级、允许/禁止范围、验证命令，再动手。
```

## 19. 最终成功标准

本次大升级成功时，OI Notebook 应该拥有：

- 通用 Agent 能力：读笔记、查资料、写作、解释、整理、生成可审查修改；
- OI 强能力：读题、查题解、调试、跑样例、对拍、沉淀题解；
- Codex-style 成熟架构：core/runtime/tool/permission/session/event/UI 分层；
- 低依赖默认体验；
- 可选高级扩展；
- 全链路可观察；
- 权限和安全可信；
- 证据可追踪；
- 文件修改可审核、可确认、可回滚。

如果后续某个实现让系统变成“聊天框 + prompt + 几个工具函数”，即使 demo 能跑，也应判定为架构失败。
