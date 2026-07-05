# P4 架构纠偏冻结实施计划

> **给 agentic worker 的强制要求：**执行本计划时必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，按任务逐项推进。所有步骤使用 checkbox（`- [ ]`）记录进度。本计划必须能在上下文压缩后独立交给后续 worker 执行。

**目标：**把当前 P4 Agent Workbench Foundation Preview 冻结并纠偏，确保 readiness、UI 能力表达、运行时/工具/权限契约、验证证据都真实保守，再进入 P5 或任何真实模型循环（model loop）能力。

**架构：**本阶段不新增 AI 真能力，只修正现有 preview 边界。重点是把 Agent 核心（Agent Core）、工具注册与路由（Tool Registry / Router）、权限策略（Permission Policy）、会话与事件（Session / Event）、UI 与核心分层（UI / Core separation）做成可验证契约，让 React UI 反映 runtime 真实状态，而不是暗示未来能力已经完成。OI Notebook 可以学习 `openai/codex` 的成熟 Agent Harness，但不能默认依赖 Codex CLI、MCP、shell、patch、Cookie 或真实 provider 执行。

**技术栈：**Tauri 2、React、TypeScript、Rust、Vitest、`tsc`、Vite、Cargo、`src/lib/api.ts`、`src/lib/apiContract.ts`、`src/lib/agent-runtime/**`、`src/lib/agent-workbench/**`、`src/lib/problem-workspace/**`、`src/lib/research-engine/**`、`src/components/agent-workbench/**`。

---

## 0. 阶段身份

阶段名称：P4 架构纠偏冻结 / P4 Architecture Correction

当前 P4 状态：Agent Workbench Foundation Preview

统一口径：

- 当前 P4 有价值，但不是 AI 大升级完成。
- 当前 P4 不是完整 Codex-style Agent Runtime。
- 当前 P4 不是 L5 Agent 完成。
- 本阶段只纠偏 preview 语义、契约真实性和验收边界。
- AI Agent 是通用能力扎实、OI 场景特别强的本地桌面 Agent Workbench，不是只做 OI 的窄工具，也不是 Codex CLI 的外壳。

## 1. 强制启动协议

任何执行 worker 在读源码或改文件前，必须先完成：

- [ ] 读取 `AGENTS.md`。
- [ ] 运行并记录：

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

- [ ] 按顺序读取以下文档。前两份是强制继承来源，不能跳过：

```text
docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md
docs/superpowers/specs/2026-07-04-p4-architecture-correction-freeze-design.md
docs/NoteX_Agent_Workbench_PRD.md
docs/agent-workbench/handoff-p4.md
docs/superpowers/plans/2026-06-28-agent-workbench-p4.md
docs/superpowers/plans/2026-07-04-p4-architecture-correction.md
```

- [ ] 报告自己负责的 worker 角色、模块层级、可改路径、禁止路径，以及主管是否允许 stage / commit / push。
- [ ] 如果 `.codegraph/` 已初始化，结构性问题优先用 CodeGraph；只有查字面字符串、命令审计、或未跟踪文件未进入索引时才用 `rg`。

## 2. 必须继承的总 spec 与 freeze spec

本计划不是独立发明的新阶段，而是严格继承：

- 总 spec：`docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md`
- P4 freeze spec：`docs/superpowers/specs/2026-07-04-p4-architecture-correction-freeze-design.md`

对应总 spec 层级：

- 第 4 节 Codex 成熟工程框架对标：Core/UI 分层、真实 Agent Loop、工具注册/路由/生命周期（Tool Registry / Router / Lifecycle）、审批/沙箱/策略（Approval / Sandbox / Policy）、会话/事件协议（Session / Event Protocol）、patch-first 工作流、contract tests。
- 第 5 节核心架构：Agent Core、Tool Layer、Permission and Safety Layer、Knowledge and Evidence Layer、Workspace Layer、Provider Layer、UI Layer。
- 第 7 节事件协议：UI 消费结构化事件，不直接理解工具内部实现。
- 第 8 节权限与安全底线：`read`、`local-note-search`、`public-network`、`cookie-network`、`write`、`patch-apply`、`execute`、`destructive`。
- 第 9 节 UI 职责：展示真实 runtime、工具、证据、权限、diff、失败和降级状态，不拼 prompt，不拥有工具逻辑。
- 第 10 节阶段路线：本阶段横跨 P1 Agent Core Contract、P2 Tool / Permission Contract、P4 Web Reader / Evidence truthfulness、P5 Workbench UI IA 进入条件；它不是 provider/search/model 新能力阶段。
- 第 17 节当前 P4 解释：当前 P4 只能称为 Agent Workbench Foundation Preview，必须先纠偏再继续推进。

P4 freeze spec 的强制继承点：

- readiness 必须真实、保守、可解释。
- AgentRuntime 必须降级为 preview runtime primitive，不能宣称成熟 Agent Loop。
- ToolRegistry 必须走向 Registry + Router，而不是散落工具函数。
- Permission 必须成为 runtime 层 policy，而不是 UI 层几个确认按钮。
- UI 必须表达 preview、configured、unavailable、blocked、running、completed、failed 等真实状态。
- 不允许在本阶段接真实模型 loop、provider/prompt/search 行为变更、真实 patch/write/execute/Cookie 能力。

## 3. 当前 source of truth

`docs/agent-workbench/handoff-p4.md` 记录了当前 P4 preview 的主要实现面：

- `src/lib/agent-runtime/**`：typed sessions、events、tool registration、permission gating。
- `src/lib/problem-workspace/**`：第一版 `ProblemWorkspace` model 和 in-memory helper。
- `src/lib/agent-workbench/workbenchTaskFlow.ts`：runtime、workspace、manual / Luogu / current task mode、evidence、permission、cache snapshot 的 glue。
- `src/components/agent-workbench/**`：workspace panel、tool trace、evidence panel、permission surface。
- `src/lib/research-engine/searchProvider.ts`、`readerProvider.ts`、`extractor.ts`、`evidenceStore.ts`、`cacheManager.ts`、`pipelineBoundary.ts`：search / read / extract / evidence / cache 分离。
- `src-tauri/src/agent_workbench.rs`、`src/lib/api.ts`、`src/lib/apiContract.ts`：Rust preview command 和前端 API boundary。

注意：不要假设这些文件已 tracked 或 clean。worker 必须报告自己看到的真实工作区状态。

## 4. 本阶段目标

- 让 readiness 真实、保守、可解释。
- 让 UI label、badge、disabled/blocked state 与 preview / configured / unavailable / blocked / running / completed / failed 事实一致。
- 让 `AgentRuntime` 明确是 preview runtime primitive，而不是成熟模型循环（model loop）。
- 强化工具注册与路由（Tool Registry / Router）和权限策略（Permission Policy）契约，防止 unsupported、duplicate、write、patch、execute、Cookie、destructive 能力被静默展示为可用。
- 保持所有前端到 Rust 调用经过 `src/lib/api.ts`。
- 增加 focused tests 锁住 preview semantics 和安全默认值。
- 产出后续 P5 worker 能信任的 closeout evidence。

## 5. 明确非目标

- 不接真实模型循环（model loop）。
- 不改 prompt construction、provider selection、model request、streaming 或 provider 行为。
- 不新增真实 Tavily 行为；只能保留或修正已有的配置感知 unavailable / preview 状态。
- 不新增真实 Cookie-backed Luogu reading；除非后续另有 Cookie safety spec。
- 不新增真实文件写入、patch apply、命令执行、编译、样例运行、对拍、删除或 rollback 能力。
- 不在 storage/privacy spec 批准前持久化 workspace 或 evidence。
- 不把旧 `src/components/ai/AiSidebar.tsx` 迁移成新 runtime host。
- 不把 mock/manual flow 描述成 production-ready。
- 不读、改、stage、commit `notes/**`。

## 6. 可改路径与禁止路径

本阶段允许修改：

```text
src/lib/agent-runtime/**
src/lib/agent-workbench/**
src/lib/problem-workspace/**
src/lib/research-engine/readinessGate.ts
src/lib/research-engine/searchProvider.ts
src/lib/research-engine/readerProvider.ts
src/lib/research-engine/extractor.ts
src/lib/research-engine/evidenceStore.ts
src/lib/research-engine/cacheManager.ts
src/lib/research-engine/pipelineBoundary.ts
src/lib/research-engine/index.ts
src/components/agent-workbench/**
src/lib/api.ts
src/lib/apiContract.ts
src-tauri/src/agent_workbench.rs
上述文件旁边的 focused tests
docs/agent-workbench/handoff-p4.md（仅限主管明确要求 closeout 文档更新时）
```

除非主管明确重新开放 scope，否则禁止修改：

```text
notes/**
docs/archive/**
docs/superpowers/specs/**
docs/NoteX_Agent_Workbench_PRD.md
docs/superpowers/plans/2026-06-28-agent-workbench-p4.md
src/components/ai/**
上述 P4 边界之外的 provider/model selection 代码
prompt construction 代码
preview/config truthfulness 之外的真实 web-search 行为
真实 Cookie persistence 或浏览器 Cookie import
真实 patch/write/execute/code-runner/destructive 实现
storage 或 privacy persistence surface
```

## 7. Codex 架构对标点

2026-07-04 刷新过的上游参考：

- `https://github.com/openai/codex`
- `https://github.com/openai/codex/tree/main/codex-rs`
- `https://github.com/openai/codex/tree/main/codex-rs/core`

上游事实：

- `openai/codex` 有 Rust-centered `codex-rs` tree，并拆出 `core`、`tui`、`protocol`、`tools`、`exec`、`execpolicy`、`sandboxing`、`apply-patch`、`mcp-server`、app-server 等边界。
- `codex-rs/core` 是供 Codex UI 使用的核心业务逻辑层。
- `codex-rs/protocol` 承载 core 与 UI / app-server 通信类型，不承载主要业务逻辑。
- sandbox 和 execution policy 是一等架构区域，不是 UI 里的几个确认按钮。

本项目映射：

- Agent 核心（Agent Core）拥有 runtime、session、tool、permission、event 逻辑。
- UI 只消费事件和 view model，不拥有 agent 业务分支。
- 工具必须有注册、路由、校验、生命周期和失败状态。
- 权限策略默认阻断 Cookie、write、patch、execute、destructive 等高风险能力。

不照搬：

- OI Notebook 不做 repo-centric 产品边界。
- 默认体验不依赖 Codex CLI、MCP、shell、patch authority。
- Workspace 中心是通用工作区（GeneralWorkspace）加 OI 特化的问题工作区（ProblemWorkspace）。

凡是后续 worker 修改 Agent Core、Tool、Permission、Session/Event、Patch 或 UI 分层，都必须重新确认上游 Codex 当前结构；如果无法联网刷新，只能继续本地低风险计划或文档工作，不能宣称实现已符合最新 Codex 架构。

## 8. 横向审计命令

API boundary audit：

```powershell
rg -n "@tauri-apps/api/core|\binvoke\s*\(" src --glob "!src/lib/api.ts" --glob "!src/components/ai/**" --glob "!src/lib/aiWebSearch.ts"
```

预期证据：approved boundary 之外没有直接 Rust IPC 调用。若有命中，worker 必须说明是既有 out-of-scope 还是本任务新增；本任务新增命中必须修掉。

能力宣称 audit：

```powershell
rg -n "L5|Codex-style runtime|AI 大升级完成|完整接通|production-ready|ready: true|isReady: true|patch|execute|Cookie|Luogu|Current" src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/research-engine src-tauri/src/agent_workbench.rs
```

预期证据：命中内容必须是 preview/truthful 语义；blocked capability 必须有明确 reason。

推荐验证命令：

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/apiBoundary.test.ts
.\node_modules\.bin\vitest.cmd run src/lib/agent-runtime/*.test.ts
.\node_modules\.bin\vitest.cmd run src/lib/agent-workbench/*.test.ts
.\node_modules\.bin\vitest.cmd run src/lib/problem-workspace/*.test.ts
.\node_modules\.bin\vitest.cmd run src/lib/research-engine/*.test.ts
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\vite.cmd build
cargo check --manifest-path .\src-tauri\Cargo.toml
```

如果 `pnpm.cmd` 因 `ERR_PNPM_IGNORED_BUILDS` 被 `msw` 或 `sharp` 阻塞，立即切换到本地 `.\node_modules\.bin\*.cmd`，不要反复重试，并在报告里说明 fallback。

## 9. 任务 0：基线与 source-of-truth 审计

**层级：**协调 / audit

**文件范围：**

- 读取：第 1 节列出的启动文档。
- 读取：可改路径下的直接相关文件，优先用 CodeGraph 或定向 file read。
- 修改：无。

**预期动作：**

- [ ] 记录 branch 或 detached HEAD：

```powershell
git branch --show-current
git log --oneline -1 --decorate
```

- [ ] 记录基线状态和暂存区：

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

- [ ] 枚举实际存在的 P4 文件：

```powershell
rg --files src/lib/agent-runtime src/lib/agent-workbench src/lib/problem-workspace src/components/agent-workbench
rg --files src/lib/research-engine | rg "searchProvider|readerProvider|extractor|evidenceStore|cacheManager|pipelineBoundary|readinessGate|index"
```

- [ ] 记录 P4 文件是 tracked、modified 还是 untracked；不要清理，不要 stage。

**禁止事项：**

- 不改源码。
- 不 stage。
- 不假设 handoff 状态等于当前工作区状态。

**验收命令：**

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

**验收证据：**

- 报告包含 branch/HEAD、基线状态、暂存区结果、读取文件清单、source-of-truth 风险。

## 10. 任务 1：readiness 真实性纠偏

**层级：**Agent Core preview readiness、Rust API boundary、research/evidence availability

**文件范围：**

- 修改：`src-tauri/src/agent_workbench.rs`
- 修改：`src/lib/api.ts`
- 修改：`src/lib/apiContract.ts`
- 修改：`src/lib/research-engine/readinessGate.ts`
- 修改：`src/lib/agent-workbench/workbenchTaskFlow.ts`
- 测试：`src/lib/agent-workbench/workbenchTaskFlow.test.ts`
- 测试：`src/lib/research-engine/*.test.ts`，仅当 readiness 行为在这些文件覆盖时修改。

**预期改动：**

- [ ] 把固定乐观 readiness 替换成 typed status：

```text
ready
preview
blocked
not_configured
unavailable
failed
```

- [ ] 为不可用或 preview 能力增加 reason code：

```text
model_loop_unavailable
patch_apply_unavailable
execute_unavailable
tavily_not_configured
luogu_cookie_not_configured
cookie_network_blocked_by_policy
manual_url_preview_only
in_memory_workspace_preview
```

- [ ] 保持现有 Rust command 只通过 `src/lib/api.ts` 暴露；如果 Rust response shape 变化，同任务更新 `src/lib/apiContract.ts`。
- [ ] 确保能力只有在真正实现且当前配置安全时才可为 `ready`；否则必须是 `preview`、`not_configured`、`unavailable` 或 `blocked`。

**禁止事项：**

- 不加真实 model call。
- 不改 Tavily transport。
- 不加真实 Cookie storage 或 Cookie-backed reading。
- 不加 patch/write/execute/code-runner 行为。
- 不因为一个 manual flow 可跑就把整个 Workbench 标成 ready。

**测试命令：**

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/agent-workbench/workbenchTaskFlow.test.ts
.\node_modules\.bin\vitest.cmd run src/lib/research-engine/*.test.ts
.\node_modules\.bin\vitest.cmd run src/lib/apiBoundary.test.ts
.\node_modules\.bin\tsc.cmd --noEmit
```

**验收证据：**

- 测试证明 unavailable capability 不会返回乐观 ready。
- 报告包含 manual URL、public search、Tavily、Luogu Cookie、model loop、patch、execute、workspace persistence 的 readiness matrix。
- API boundary audit 保持干净。

## 11. 任务 2：UI 真实性纠偏

**层级：**Workbench UI 消费 runtime truth

**文件范围：**

- 修改：`src/components/agent-workbench/AgentWorkbenchShell.tsx`
- 修改：`src/components/agent-workbench/ProblemWorkspacePanel.tsx`
- 修改：`src/components/agent-workbench/ToolTraceViewer.tsx`
- 修改：`src/components/agent-workbench/EvidencePanel.tsx`
- 修改：`src/components/agent-workbench/PermissionSurface.tsx`
- 修改：`src/lib/agent-workbench/workbenchTaskFlow.ts`，仅限 view-model truth label。
- 测试：`src/lib/agent-workbench/workbenchTaskFlow.test.ts`

**预期改动：**

- [ ] UI 状态只能来自 runtime / view model，并落在这些语义内：

```text
preview
configured
not_configured
unavailable
blocked_by_permission
running
completed
failed
```

- [ ] 替换任何暗示完整完成的 label。UI 可以写 Foundation Preview、manual preview、unavailable、not configured、blocked，但不能宣称 Luogu / current research / model loop 已完整接通。
- [ ] Tool trace 渲染结构化 runtime event 和 permission state，不渲染硬编码成功故事。
- [ ] Evidence panel 和 workspace panel 区分 in-memory preview evidence 与 persisted verified evidence。

**禁止事项：**

- 不把 agent 逻辑移进 React 组件。
- 不在 UI 拼 prompt。
- 不把旧 `AiSidebar` 接进新 Workbench。
- 不用无解释的 disabled button 掩盖 blocked / unavailable 状态。

**测试命令：**

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/agent-workbench/workbenchTaskFlow.test.ts
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\vite.cmd build
rg -n "完整接通|AI 大升级完成|L5 Agent 完成|production-ready|Codex-style runtime 完成|ready: true|isReady: true" src/components/agent-workbench src/lib/agent-workbench
```

**验收证据：**

- 截图或 browser smoke notes 能证明 preview / unavailable / not-configured 状态可见。
- 字面文本审计没有误导性完成宣称。
- UI 改动由 runtime / workbench view model 驱动，而不是复制业务规则。

## 12. 任务 3：AgentRuntime preview contract

**层级：**Agent Core / Session / Event

**文件范围：**

- 修改：`src/lib/agent-runtime/agentTypes.ts`
- 修改：`src/lib/agent-runtime/agentSession.ts`
- 修改：`src/lib/agent-runtime/eventStream.ts`
- 修改：`src/lib/agent-runtime/agentRuntime.ts`
- 测试：`src/lib/agent-runtime/agentTypes.test.ts`
- 测试：`src/lib/agent-runtime/eventStream.test.ts`
- 测试：`src/lib/agent-runtime/agentRuntime.test.ts`

**预期改动：**

- [ ] runtime contract 明确描述当前执行只是 preview primitive 或 one-shot tool execution，不是成熟 loop。
- [ ] event type 至少覆盖总 spec 要求的 preview truthfulness：

```text
agent.started
agent.plan.created
tool.requested
permission.required
permission.resolved
tool.started
tool.output
tool.failed
observation.added
evidence.added
workspace.updated
agent.completed
agent.failed
```

- [ ] 如果 `model.delta`、`patch.generated`、`patch.applied`、`agent.compacted`、continuation/interruption 事件只是未来状态，必须标记 unavailable 或 reserved，preview flow 不得 emit。
- [ ] 测试必须证明当前 runtime 不能被报告为真实 model loop。

**禁止事项：**

- 不接 provider streaming。
- 不实现 continuation、compaction、patch application、shell execution、file mutation。
- 不 emit 没有真实发生的事件。

**测试命令：**

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/agent-runtime/*.test.ts
.\node_modules\.bin\tsc.cmd --noEmit
```

**验收证据：**

- 测试覆盖一个 preview task 的事件顺序、permission-required flow、tool failure flow、unavailable model-loop flow。
- 报告说明哪些成熟 Agent Loop 状态仍是 future work。

## 13. 任务 4：工具注册与权限策略契约

**层级：**工具注册/路由/生命周期（Tool Registry / Router / Lifecycle）与权限策略（Permission Policy）

**文件范围：**

- 修改：`src/lib/agent-runtime/toolRegistry.ts`
- 修改：`src/lib/agent-runtime/permissionManager.ts`
- 修改：`src/lib/agent-runtime/agentTypes.ts`，仅当需要共享类型时。
- 测试：`src/lib/agent-runtime/toolRegistry.test.ts`
- 测试：`src/lib/agent-runtime/permissionManager.test.ts`
- 修改：`src/lib/agent-workbench/workbenchTaskFlow.ts`，仅当它消费新 contract output。

**预期改动：**

- [ ] Tool metadata 至少包含：

```text
name
description
input schema or validator metadata
output schema or result metadata
permission kind
exposure policy
timeout policy
lifecycle event names
preview status
```

- [ ] duplicate registration 行为必须显式。推荐 contract：重复工具名抛结构化错误，不允许静默覆盖。
- [ ] unsupported tool 返回结构化失败，不允许 undefined behavior。
- [ ] Permission kind 至少包含：

```text
read
local-note-search
public-network
cookie-network
write
patch-apply
execute
destructive
```

- [ ] Permission decision 至少包含：

```text
auto-allowed
prompt-required
denied
blocked-by-configuration
unavailable
degraded-fallback
```

- [ ] 默认策略：read-only preview tool 可 auto-allowed；public network 需要配置/审批；Cookie、write、patch、execute、destructive 在本阶段必须 blocked 或 unavailable。

**禁止事项：**

- 不新增真实 Cookie、write、patch、execute、destructive、code-runner tool。
- 不在 UI component 决定 permission。
- 不允许 duplicate tool last-write-wins。

**测试命令：**

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/agent-runtime/toolRegistry.test.ts src/lib/agent-runtime/permissionManager.test.ts
.\node_modules\.bin\vitest.cmd run src/lib/agent-runtime/*.test.ts
.\node_modules\.bin\tsc.cmd --noEmit
```

**验收证据：**

- 测试覆盖 duplicate registration、unsupported tool routing、schema metadata presence、permission status decisions、blocked risky capabilities。
- 报告包含工具名、权限、exposure、timeout、preview/availability status 表。

## 14. 任务 5：preview contract 集成

**层级：**Runtime / Workbench / Workspace / Evidence integration

**文件范围：**

- 修改：`src/lib/agent-workbench/workbenchTaskFlow.ts`
- 修改：`src/lib/problem-workspace/problemWorkspaceTypes.ts`
- 修改：`src/lib/problem-workspace/problemWorkspaceStore.ts`
- 修改：`src/lib/problem-workspace/problemWorkspaceDefaults.ts`
- 修改：`src/lib/research-engine/evidenceStore.ts`
- 修改：`src/lib/research-engine/cacheManager.ts`
- 测试：`src/lib/agent-workbench/workbenchTaskFlow.test.ts`
- 测试：`src/lib/problem-workspace/*.test.ts`
- 测试：`src/lib/research-engine/evidenceStore.test.ts`
- 测试：`src/lib/research-engine/cacheManager.test.ts`

**预期改动：**

- [ ] Workbench task flow 组合 readiness、registry、permission、workspace、evidence state，但不宣称真实 model/provider execution。
- [ ] Workspace 和 evidence object 在未持久化时携带 preview / in-memory 语义。
- [ ] Manual URL 与 public read preview 只能通过 runtime/tool/evidence path 生成 evidence，并有可追踪 event。
- [ ] Luogu / current research mode 在缺少批准真能力时必须显示 not-configured、preview、blocked 或 unavailable。

**禁止事项：**

- 不持久化 workspace 或 evidence。
- 不新增 storage/privacy 代码。
- 不绕过 runtime path 从 UI 直接写 evidence。
- 不引入真实 provider/search 行为变更。

**测试命令：**

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/agent-workbench/*.test.ts
.\node_modules\.bin\vitest.cmd run src/lib/problem-workspace/*.test.ts
.\node_modules\.bin\vitest.cmd run src/lib/research-engine/evidenceStore.test.ts src/lib/research-engine/cacheManager.test.ts
.\node_modules\.bin\tsc.cmd --noEmit
```

**验收证据：**

- 测试证明 manual preview success、Tavily without key/config unavailable、Luogu Cookie blocked/not configured、workspace/evidence in-memory status。
- 报告确认没有改变 provider、prompt、model selection、Cookie persistence、write、patch、execute 行为。

## 15. 任务 6：验证与审计收口

**层级：**verification / closeout hygiene

**文件范围：**

- 默认不改源码；除非为修复 allowed paths 内的 focused check failure。
- 可选修改：`docs/agent-workbench/handoff-p4.md`，仅当主管明确要求文档收口。

**预期动作：**

- [ ] 跑 focused suites：

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/apiBoundary.test.ts
.\node_modules\.bin\vitest.cmd run src/lib/agent-runtime/*.test.ts
.\node_modules\.bin\vitest.cmd run src/lib/agent-workbench/*.test.ts
.\node_modules\.bin\vitest.cmd run src/lib/problem-workspace/*.test.ts
.\node_modules\.bin\vitest.cmd run src/lib/research-engine/*.test.ts
```

- [ ] 跑 type/build checks：

```powershell
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\vite.cmd build
cargo check --manifest-path .\src-tauri\Cargo.toml
```

- [ ] 跑 API boundary audit：

```powershell
rg -n "@tauri-apps/api/core|\binvoke\s*\(" src --glob "!src/lib/api.ts" --glob "!src/components/ai/**" --glob "!src/lib/aiWebSearch.ts"
```

- [ ] 跑 capability-claim audit：

```powershell
rg -n "完整接通|AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|production-ready|ready: true|isReady: true" src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/research-engine src-tauri/src/agent_workbench.rs
```

- [ ] 记录最终状态：

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

**禁止事项：**

- 主管没有明确授权时，不 stage、不 commit、不 push、不 tag、不清理无关文件。
- 不 stage `notes/**`。

**验收证据：**

- 报告包含每条命令的 pass/fail、fallback 原因、API-boundary 结果、capability-claim 结果、精确修改路径、staged paths、最终 status。
- 若仍有失败，必须分类为 blocker、既有 out-of-scope 或 follow-up risk。

## 16. Worker 拆分建议

推荐串并行关系：

- 必须先串行：任务 0。当前 source-of-truth 和 dirty worktree 没确认前，任何 worker 不应实现。
- 任务 0 后可并行，但必须使用不同 worktree 或严格不重叠文件所有权：
  - 任务 1 readiness 真实性可与任务 4 权限/工具契约并行，但 `agentTypes.ts` 共享类型需要协调。
  - 任务 3 AgentRuntime preview contract 与任务 4 ToolRegistry / Permission contract 可拆分；如果无法指定共享类型 owner，就顺序执行。
  - 任务 2 UI 真实性必须等任务 1 定义 view-model 状态后再开始，不能自己发明状态。
  - 任务 5 integration 必须在任务 1、3、4 后执行。
  - 任务 6 closeout 必须最后执行。

推荐 worker 分配：

```text
Worker A：任务 1 readiness 真实性纠偏
Worker B：任务 3 AgentRuntime preview contract
Worker C：任务 4 ToolRegistry / Permission contract
Worker D：任务 2 UI 真实性纠偏，等待 readiness 状态确定后开始
Worker E：任务 5 integration，等待 A/B/C 完成后开始
Worker F：任务 6 verification / audit closeout，最后执行
```

如果只有一个 worktree，推荐顺序：

```text
任务 0 -> 任务 1 -> 任务 3 -> 任务 4 -> 任务 2 -> 任务 5 -> 任务 6
```

这样可以减少 shared type churn。

## 17. `notes/**` 规则

- `notes/**` 是 scratch space，默认 out of scope。
- 不读、改、restore、stage、commit、routine status 报告 `notes/**`。
- routine snapshot 只用：

```powershell
git status --short -- . ":(exclude)notes/**"
```

- 只有主管明确要求，或命令意外触碰 `notes/**`，才单独提及。

## 18. 精确路径 staging 规则

本计划本身不授权 staging。只有主管明确要求 execution 或 closeout worker stage 时，才允许 stage。

授权 staging 时：

- 禁止 `git add .`。
- 禁止 `git add -A`。
- 禁止 `git commit -a`。
- 只能精确路径 stage：

```powershell
git add -- src/lib/agent-runtime/agentTypes.ts src/lib/agent-runtime/agentRuntime.test.ts
```

- commit 前必须检查：

```powershell
git diff --cached --name-only
```

- staged list 只能包含本阶段计划内的 P4 correction 路径，并且必须排除 `notes/**`。
- push 只能在主管明确要求时进行。

## 19. 如何防止写成玩具代码

- 当前 P4 被明确定位为 Foundation Preview，不是 completed AI。
- 本阶段阻断真实 provider、prompt、model-loop、Cookie、patch、write、execute、persistence。
- UI 必须基于 typed readiness、tool metadata、permission decision、structured event 才能展示能力。
- focused tests 必须覆盖 duplicate tools、unsupported tools、blocked permissions、unavailable capabilities、event order。
- 保持 UI/Core 分层：UI 消费 view model 和 event；runtime/tool/permission 层拥有行为。
- closeout 必须跑 API-boundary audit 和 capability-claim audit。
- 对未知或未实现能力，必须显示 preview / unavailable / not configured / blocked，不能用 mock success 填洞。

## 20. 退出标准

P4 架构纠偏冻结只有满足以下条件才能关闭：

- readiness status 真实且保守。
- preview / manual / mock flow 被可见地标记为 preview 或 unavailable。
- 当前 P4 被文档和报告统一称为 Agent Workbench Foundation Preview。
- runtime / tool / permission / event contract 有 focused tests。
- ToolRegistry 对 duplicate 和 unsupported tools 有结构化处理。
- Permission policy 对 Cookie、write、patch、execute、destructive 默认 blocked 或 unavailable。
- UI 不再暗示未实现的 Luogu / current research / model-loop capability 已完成。
- API boundary audit 干净，或每个命中都有解释并被主管接受。
- `notes/**` 没有被 routine work 触碰。
- 除非主管明确要求 exact-path staging，否则 `git diff --cached --name-only` 为空。
- 没有 push / tag / release，除非主管明确要求。

