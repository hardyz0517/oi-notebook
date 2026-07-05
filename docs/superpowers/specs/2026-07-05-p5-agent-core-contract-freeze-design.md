# P5 Agent Core Contract Freeze 设计

日期：2026-07-05
状态：待评审
范围：AI Agent Workbench 大升级 / P5 Agent Core Contract Freeze

## 1. 文档目的

本文件冻结 P5 的进入边界。P5 的任务不是继续堆 UI，也不是接入真实模型，而是把 P4 已收口的 `Agent Workbench Foundation Preview` 向成熟 Agent Harness 的核心协议推进一步。

P5 必须同时继承：

- 总 spec：`docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md`
- P4 freeze spec：`docs/superpowers/specs/2026-07-04-p4-architecture-correction-freeze-design.md`
- P4 handoff：`docs/agent-workbench/handoff-p4.md`
- P4 closeout commits：`b1f0695`、`7c7582e`、`471dbc6`

本文件必须能在上下文压缩后单独恢复 P5 方向：P5 只冻结 Agent Core Contract，不打开真实 model loop、write、patch、execute、Cookie-backed reading 或 persistence。

## 2. 阶段身份

阶段名称：**P5 Agent Core Contract Freeze**

当前输入状态：**Agent Workbench Foundation Preview**

P5 输出状态：**Agent Core Contract Preview**

统一口径：

- P5 不是 AI 大升级完成。
- P5 不是成熟 Codex-style runtime 完成。
- P5 不接真实模型，不改变 provider/prompt/model request/streaming。
- P5 只把 session、event、loop contract、reserved capability、UI/Core 边界变成可测试协议。
- P5 继续保持 Agent 通用能力扎实、OI 场景特别强的产品方向，不把 Agent 窄化成只做 OI。

## 3. 为什么 P5 先做 Agent Core Contract

P4 已经提供：

- `src/lib/agent-runtime/**`：typed sessions、events、tool registration、permission gating。
- `src/lib/agent-workbench/workbenchTaskFlow.ts`：Workbench preview glue。
- `src/components/agent-workbench/**`：preview UI panels。
- `src/lib/problem-workspace/**`：第一版 OI 特化 workspace。
- `src/lib/research-engine/**`：search/read/extract/evidence/cache 分离。
- `src-tauri/src/agent_workbench.rs` 与 `src/lib/api.ts` / `apiContract.ts`：preview readiness API。

但当前 runtime 仍然主要是一次 `runTool()` primitive。它能执行一个工具并记录部分事件，却还没有成熟 Agent Loop 所需的稳定协议：

- model step；
- tool request；
- permission decision；
- observation；
- continuation；
- interruption；
- compaction；
- final result；
- failure；
- reserved / unavailable capability 的统一表达。

如果不先冻结这些协议，后续 Tool/Permission、Workspace、Web Reader/Evidence、UI IA 或真实模型接入都会再次变成临时 helper、UI 分支和 prompt 拼接。

## 4. Codex 架构对标

P5 继续学习 `openai/codex` 的成熟 Agent Harness 思路，而不是照搬产品形态。

必须对标的结构：

- `core` 是核心业务逻辑层，UI 不拥有 agent 决策。
- `protocol` 承载 core 与 UI / app 通信类型。
- sandbox、exec policy、apply-patch、tools 等是独立边界。
- session/event 是跨层协议，不是 UI 内部状态。

映射到 OI Notebook：

- `src/lib/agent-runtime/**` 是 Agent Core 的第一落点。
- `AgentEvent` 是 UI 与 Core 的最小协议面。
- `AgentLoopContract` 必须先表达成熟 loop 的完整形状，即使当前能力仍为 `reserved` 或 `unavailable`。
- `src/components/agent-workbench/**` 只能消费事件、snapshot 和 view model，不能拥有 agent loop 分支。

不照搬：

- 不默认依赖 Codex CLI。
- 不默认提供 shell / patch authority。
- 不把 OI Notebook 做成 repo-centric coding agent。
- 不让普通用户必须安装 MCP、Node、Python 或浏览器插件。

## 5. P5 允许做什么

允许：

- 扩展 `AgentEventType`，补齐总 spec 的基础事件协议。
- 定义 `AgentLoopContract`、`AgentLoopCapabilityStatus` 等纯类型契约。
- 增加 preview contract factory，例如 `createPreviewAgentLoopContract()`。
- 明确当前 `runTool()` 是 `preview_one_shot` primitive，不是成熟 model loop。
- 增加 reserved/unavailable 事件与测试，锁住未实现能力不能伪装为 ready。
- 增加 session 状态转移 helper 和 contract tests。
- 让 Workbench flow / UI 只消费 contract 和 events，不新增业务推理分支。
- 更新 handoff / plan 文档，说明 P5 后续阶段入口。

## 6. P5 禁止做什么

禁止：

- 接真实 model loop。
- 改 provider selection、prompt construction、model request、streaming 行为。
- 新增真实 write、patch apply、execute、code runner、delete、rollback 能力。
- 新增 Cookie-backed Luogu reading。
- 持久化 workspace、evidence、session 或 request logs。
- 把旧 `src/components/ai/AiSidebar.tsx` 迁移成 runtime host。
- 把 `preview` / `reserved` / `unavailable` 展示成 production-ready。
- 绕过 `src/lib/api.ts` 直接调用 Tauri IPC。
- 修改 `notes/**`。

## 7. 核心契约

### 7.1 AgentEvent 协议

P5 后 `AgentEventType` 至少覆盖：

```text
agent.started
agent.plan.created
model.delta
tool.requested
tool.started
tool.output
tool.failed
permission.required
permission.resolved
observation.added
evidence.added
patch.generated
patch.applied
workspace.updated
agent.compacted
agent.completed
agent.failed
```

当前未实现能力必须能产生 reserved / unavailable 语义，而不是沉默缺失。

### 7.2 AgentLoopContract

P5 新增的 loop contract 只描述协议，不执行真实模型。

最小字段：

```text
mode: preview_one_shot | reserved_model_loop
modelStep: unavailable
toolRequest: preview
permissionDecision: preview
toolExecution: preview
observation: reserved
continuation: reserved
interruption: reserved
compaction: reserved
patchGeneration: unavailable
patchApply: unavailable
sessionPersistence: unavailable
```

每个非 ready 状态必须带 reason code，例如：

```text
model_loop_unavailable
continuation_reserved
compaction_reserved
patch_apply_unavailable
session_persistence_unavailable
```

### 7.3 Session Contract

P5 后 session 至少要能表达：

- `idle`
- `running`
- `blocked`
- `completed`
- `failed`

如需表达 compaction / continuation，只能通过 reserved event 或 future status，不得虚构真实执行。

### 7.4 Runtime Primitive Contract

`createAgentRuntime().runTool()` 在 P5 仍是 one-shot primitive。

它必须：

- 先发 `tool.requested`，再进入 permission / execution。
- unsupported tool 产生结构化 `tool.failed`。
- permission block 产生 `permission.required`，返回 `blocked`。
- tool output 后能追加 observation / evidence / workspace events。
- completion 只能表示当前 primitive 完成，不表示成熟 agent loop 完成。

## 8. UI/Core 边界

React UI 不得：

- 直接决定 agent loop 下一步；
- 拼 prompt；
- 直接拥有 tool routing；
- 把 unavailable 能力显示为 ready；
- 直接绕过 API boundary 调 Tauri IPC。

React UI 可以：

- 展示 session status；
- 展示 event timeline；
- 展示 loop contract snapshot；
- 展示 reserved / unavailable capability；
- 展示 permission request；
- 展示 evidence / workspace snapshot；
- 展示失败和降级原因。

## 9. Source of truth

P5 可改路径：

```text
src/lib/agent-runtime/**
src/lib/agent-workbench/**
src/components/agent-workbench/**
src/lib/api.ts
src/lib/apiContract.ts
docs/agent-workbench/handoff-p4.md
docs/superpowers/specs/2026-07-05-p5-agent-core-contract-freeze-design.md
docs/superpowers/plans/2026-07-05-p5-agent-core-contract.md
```

只有当 contract 需要 workspace event 测试时，才可窄改：

```text
src/lib/problem-workspace/**
src/lib/research-engine/evidenceStore.ts
src/lib/research-engine/evidenceStore.test.ts
```

P5 禁止路径：

```text
notes/**
src/components/ai/**
src-tauri/src/ai.rs
src-tauri/src/luogu*.rs
local-blog/**
provider/model selection 代码
prompt construction 代码
真实 patch/write/execute/code-runner 代码
storage/privacy persistence surface
```

## 10. 验收命令

P5 worker 至少运行：

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/agent-runtime
.\node_modules\.bin\vitest.cmd run src/lib/agent-workbench
.\node_modules\.bin\vitest.cmd run src/lib/apiBoundary.test.ts
.\node_modules\.bin\tsc.cmd --noEmit
rg -n "@tauri-apps/api/core|\binvoke\s*\(" src --glob "!src/lib/api.ts" --glob "!src/components/ai/**" --glob "!src/lib/aiWebSearch.ts"
rg -n "AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|production-ready|ready: true|isReady: true" src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

如修改 Rust API boundary，额外运行：

```powershell
cargo check --manifest-path .\src-tauri\Cargo.toml
```

## 11. 退出标准

P5 可以结束的条件：

- Agent event protocol 覆盖总 spec 基础事件。
- Agent loop contract 明确 mature loop 的完整形状。
- 当前 one-shot runtime 被明确标记为 preview primitive。
- model loop、patch、execute、persistence、continuation、compaction 等未实现能力有 reserved/unavailable contract 和负证明测试。
- UI 不拥有 agent loop 决策，只消费 events / contract snapshot。
- API boundary audit 通过。
- focused tests 和 typecheck 通过。
- handoff 文档记录 P6 入口，且 P6 不得绕过本 contract。

## 12. P6 进入规则

P6 不得直接接真实模型。P6 必须先说明它推进的是：

- Tool / Permission Contract；
- Workspace Contract；
- Web Reader / Evidence Contract；
- UI IA Contract；
- 或 Provider Adapter Contract。

任何 P6 worker 必须引用本 P5 freeze spec，并说明不会重新打开 P5 禁止项。
