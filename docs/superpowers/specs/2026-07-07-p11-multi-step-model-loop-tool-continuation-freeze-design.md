# P11 Multi-Step Model Loop / Tool-Call Continuation Contract Freeze Design

日期：2026-07-07
状态：review-ready
范围：AI Agent Workbench upgrade / P11 multi-step model loop 与 tool-call continuation contract freeze

## 1. 文档目的

本文冻结 P11 的阶段边界：在 P10 `Live Provider Request / One-Turn Model Step Contract Preview` 之后，P11 可以把单次 live model step 扩展为受限的 multi-step continuation contract，并冻结 tool-call continuation 的协议、状态机、权限、观察结果回灌、Workbench 只读投影和审计口径。

P11 不是 production-ready autonomous Agent。它不默认开放真实工具执行，不应用 patch，不写文件，不删除或回滚，不运行代码，不读 Cookie-backed 页面，也不写 durable session / request log。P11 只把“模型请求工具 -> runtime 解析和路由 -> permission decision -> mock/read-only tool boundary -> redacted observation -> 下一次 model continuation 或终止”的 contract 写清楚，并允许后续 implementation workers 在 preview / mock / read-only 范围内实现。

本阶段继承以下事实来源：

- `docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md`
- `docs/NoteX_Agent_Workbench_PRD.md`
- `docs/agent-workbench/handoff-p4.md` 的 P9 / P10 handoff 小节
- `docs/superpowers/specs/2026-07-07-p10-model-loop-live-provider-request-freeze-design.md`
- `docs/superpowers/plans/2026-07-07-p10-model-loop-live-provider-request.md`

如果后续 worker 只拿到本文，必须先恢复上述文档，再写功能代码。

## 2. 阶段身份

阶段名称：**P11 Multi-Step Model Loop / Tool-Call Continuation Contract Freeze**

输入状态：**Live Provider Request / One-Turn Model Step Contract Preview**

目标输出状态：**Multi-Step Model Loop / Tool-Call Continuation Contract Preview**

P11 推进的层级：

- Protocol / Session / Event layer：冻结 turn、step、attempt、terminal status、cancellation、failure taxonomy 与 event sequence。
- Runtime loop layer：runtime 拥有 continuation decisions、step limit、retry、interruption、tool observation routing。
- Provider adapter layer：provider 只提供 model step / continuation transport，不拥有 tool routing 或 permission decisions。
- Tool registry / router / lifecycle layer：工具注册、解析、路由、mock/read-only execution boundary 与 lifecycle 独立于 provider request lifecycle。
- Permission policy layer：读、写、网络、执行、patch、delete、rollback 等 permission 分级冻结；P11 只能实现接口和 mock/read-only preview。
- Observation / redaction layer：工具结果进入下一次 model continuation 前必须经过 redaction、summarization、bounding 与 provenance 标记。
- Workbench read model layer：UI 只读展示 loop timeline、tool-call、permission、observation 和 terminal status，不拥有 loop decisions。

通用能力裁决：P11 的 Agent runtime contract 必须通用，不是 OI-only。OI 题解、题面、证据、代码运行、对拍、题解写作是 profile / tool capability specialization；它们不能污染通用 Agent loop、provider continuation、tool routing、permission、observation 和 Workbench read model 的核心契约。通用任务、研究、解释、调试、写作预览必须仍然是一等输入。

## 3. Codex upstream provenance

P11 固定参考 `openai/codex` 的以下上游版本：

```text
Repository: openai/codex
Reference commit: be33f80bc65159c094ecd06bf155afa3061ce23d
Primary paths:
codex-rs/protocol/src/protocol.rs
codex-rs/core/src/session/
codex-rs/core/src/state/
codex-rs/core/src/tools/{registry,router,lifecycle}.rs
codex-rs/core/src/exec_policy.rs
codex-rs/core/src/apply_patch.rs
```

本文参考的是架构边界与工程分层，不复制具体实现，不声称本地已经具备 Codex 的成熟 runtime 能力。P11 借鉴的原则是：

- protocol / session / event 是稳定边界；UI 不拥有 agent loop decisions。
- runtime 拥有 turn / step / attempt 生命周期、cancellation、failure mapping 和 continuation decisions。
- provider request lifecycle 与 tool registry / router / lifecycle 分离。
- approval、sandbox、exec policy 与 apply patch 是独立安全层，不能因模型请求工具而默认开放。
- apply patch 必须有单独 grammar、审批、事务、rollback 和验证边界；P11 不实现真实 patch apply。

P11 不照搬：

- Codex 的 repo-centric 产品边界。
- Codex CLI 默认依赖。
- 默认 shell、patch、execute 权限。
- 具体 Rust module 结构、UI 形态或 tool implementation。

如果后续 worker 需要补充上游事实，只能做文档级引用，并记录 remote、reference commit、inspected paths 和时间；不能把未复核的上游实现当成本地能力证据。

## 4. 与 P10 的差异

P10 冻结的是 **one-turn live model step**：

- 一次 context build。
- 一次 permission / redaction gate。
- 一次 provider request。
- live stream projection。
- cancellation / bounded retry。
- redacted memory audit snapshot。
- Workbench 只读展示 live request 状态。

P10 明确禁止：

- multi-step autonomous model loop。
- tool-call continuation。
- observation 回灌模型。
- compaction。
- write、patch apply、execute/code runner、Cookie-backed reader、session persistence。

P11 冻结的是 **multi-step continuation contract**：

- 一个 turn 可包含多个 model step。
- 每个 step 可产生 assistant delta、tool-call intent、permission request、tool lifecycle、observation 或 terminal event。
- runtime 解析 provider output，不让 provider 或 UI 直接 dispatch 工具。
- tool registry / router / lifecycle 与 provider request lifecycle 分离。
- observation 经过 redaction / summarization / bounding 后成为下一次 model continuation 的 input part。
- loop 由 step limit、terminal status、cancellation、permission denial、tool failure、provider failure、redaction failure 和 user interruption 共同控制。

P11 仍然只到 contract / preview。它可以实现 deterministic mock tool transport 和 read-only preview 工具，但不得实现真实 write、patch apply、execute/code runner、delete、rollback、Cookie-backed reader 或 durable persistence。

## 5. Loop state machine contract

P11 loop state machine 必须以 runtime-owned state 表达：

```text
turn.created
turn.started
step.created
context.continuation.started
provider.request.started
model.delta.live
model.tool_call.requested
tool_call.normalized
tool.permission.checked
permission.required
permission.resolved
tool.lifecycle.started
tool.lifecycle.completed
observation.redacted
observation.added
context.continuation.completed
step.completed
step.failed
turn.completed
turn.failed
turn.cancelled
```

核心对象：

- `turn`：用户一次任务请求的执行边界；可以包含多个 step。
- `step`：一次 provider continuation 或 terminal evaluation；必须有 step id、sequence、attempt、input summary、output summary。
- `attempt`：同一 step 的 bounded retry 计数；retry 必须记录原因、上限和 safe error。
- `terminal status`：`completed`、`failed`、`cancelled`、`interrupted`、`blocked-by-permission`、`step-limit-exceeded`、`redaction-blocked`、`unsupported-tool`。
- `cancellation / interruption`：用户或 runtime 取消时必须产生 terminal event，不能隐藏在 UI state。
- `bounded step limit`：P11 必须有 `maxSteps`，默认不超过一个小整数；超过上限时以 structured failure 结束。

失败 taxonomy：

- provider failure：auth、network、quota、rate-limit、timeout、schema、unsupported、cancel。
- tool failure：unsupported tool、invalid arguments、permission denied、unavailable capability、mock transport failure、observation too large。
- redaction failure：secret / cookie / unauthorized note content 被阻止进入 continuation。
- runtime failure：step limit exceeded、event ordering invalid、stale cancellation、duplicate tool call id。

## 6. Tool-call continuation contract

P11 冻结 tool-call continuation 的最小链路：

```text
model output
-> ToolCallParser
-> ToolCallNormalizer
-> ToolRegistry lookup
-> ToolRouter route decision
-> PermissionPolicy decision
-> ToolLifecycle preview transport
-> ObservationBuilder
-> ObservationRedactor
-> ContinuationContextBuilder
-> next model step or terminal status
```

约束：

- Provider adapter 只返回 normalized model output 或 raw vendor output；它不拥有工具注册、路由、权限或执行。
- Runtime 解析 tool calls，并把 parse errors 转成 safe `tool_call.invalid` event。
- ToolRegistry 只声明工具 schema、permission、exposure、lifecycle、capability status 和 observation policy。
- ToolRouter 决定目标 transport，但 P11 只能使用 mock / read-only preview transport。
- ToolLifecycle 负责 started / completed / failed / unavailable events，不把真实执行藏在 UI 或 provider adapter。
- Tool output 必须先变成 observation，经过 redaction / summarization / bound，再进入下一次 continuation。
- 未注册工具、禁止工具、超出 P11 能力的工具必须结构化失败，不能静默忽略或伪装成功。

P11 可定义 preview 工具类型：

- `read-current-context.preview`：只读读取已在 runtime context 中显式提供的内容，不读真实 `notes/**`。
- `search-evidence.preview`：只消费已有 synthetic / fixture evidence，不联网。
- `oi-problem-context.preview`：只读 ProblemWorkspace projection，不执行代码、不读 Cookie。
- `write-solution-outline.preview`：只生成 outline observation，不写文件。

这些工具用于 contract 与 Workbench timeline 预览，不代表真实工具能力开放。

## 7. Permission / approval policy

P11 permission kinds：

- `read`
- `local-note-search`
- `public-network`
- `cookie-network`
- `write`
- `patch-apply`
- `execute`
- `delete`
- `rollback`
- `destructive`

P11 decision statuses：

- `auto-allowed`
- `prompt-required`
- `denied`
- `blocked-by-configuration`
- `unavailable`
- `reserved`
- `degraded-fallback`

阶段裁决：

- `read` 可以在 fixture / explicit context 范围内 auto-allowed。
- `local-note-search` 在 P11 只能是 contract / preview，不读取真实 `notes/**`。
- `public-network` 可以表达为 prompt-required 或 unavailable，不执行真实网络。
- `cookie-network` 必须 unavailable / blocked，不实现 Cookie-backed reader。
- `write`、`patch-apply`、`execute`、`delete`、`rollback`、`destructive` 必须 denied / unavailable / reserved，不能真实执行。

Workbench 可以展示 permission request 和 resolved decision，但不能批准后直接执行真实 mutation。任何 approval UI 只能作为 read-only projection 或 future action preview；真实 approval / sandbox / execute / patch apply 必须拆到后续阶段。

## 8. Observation model

Observation 是工具结果进入 continuation 的唯一通道。P11 必须冻结：

- `observationId`
- `sourceToolCallId`
- `toolName`
- `permissionDecisionId`
- `rawStatus`
- `redactionStatus`
- `summary`
- `boundedContent`
- `evidenceRefs`
- `workspaceRefs`
- `droppedFields`
- `continuationVisibility`
- `createdAt`

规则：

- raw tool output 不直接进入 provider continuation。
- observation 必须经过 redaction。
- Cookie、secret、Authorization、API key、未授权 local note content、raw provider payload 不得进入 observation 或 continuation。
- 大输出必须 summarization / bounding；超过限制时进入 safe truncated summary。
- OI evidence 可以通过 `evidenceRefs` 和 `workspaceRefs` 关联，不把 OI schema 写死到 runtime loop。
- observation 可以进入下一次 context build，也可以被 Workbench timeline 展示为 redacted summary。

## 9. Context compaction boundary

P11 可以冻结 compaction interface 与事件：

- `compaction.policy.checked`
- `compaction.skipped`
- `compaction.summary.created`
- `compaction.blocked`

P11 不要求实现 mature long-task compaction。若实现，只能是 deterministic in-memory preview summary，并且必须说明它不是 durable session memory。真实长期上下文压缩、session replay storage、database-backed memory 和 request-log persistence 必须留给后续阶段。

## 10. Request / session log boundary

P11 仍不得实现：

- durable session persistence
- database storage
- durable request-log storage
- raw provider payload storage
- raw tool output storage
- API key / Authorization / cookie logging

P11 可以保留内存态 redacted audit snapshot，用于测试和 Workbench preview。该 snapshot 必须可丢弃、不可作为 durable log 宣称。

## 11. Workbench projection boundary

Workbench 可以只读展示：

- loop phase
- turn / step / attempt ids
- provider continuation status
- tool-call requested / normalized / unsupported
- permission decision
- mock/read-only tool lifecycle
- observation summary / redaction status
- step limit / retry / terminal status
- cancellation / interruption
- “Multi-Step Model Loop / Tool-Call Continuation Contract Preview”输出状态

Workbench 不得：

- 拼 prompt。
- 选择 provider 并绕过 runtime。
- 解析 raw provider payload。
- 持有 API key、Authorization header、cookie。
- 触发真实工具执行。
- 应用 patch。
- 写文件。
- 删除、回滚。
- 运行代码。
- 读取 Cookie-backed 页面。
- 把 P11 preview 表述为 production-ready Agent。

## 12. 文件 / 模块边界

P11 implementation workers 可在后续任务中按计划修改：

```text
src/lib/agent-runtime/**
src/lib/agent-workbench/**
src/components/agent-workbench/**
docs/agent-workbench/handoff-p4.md
```

只有当某个 P11 implementation task 明确需要复用 P10 provider boundary 时，才可触碰：

```text
src/lib/api.ts
src/lib/apiContract.ts
src-tauri/src/**
```

但 P11 不应新增真实 transport 或 secret behavior；若触碰这些文件，必须仅用于类型兼容、negative-proof tests 或 read-only contract projection。

P11 不得修改：

```text
notes/**
src/components/ai/**
package.json
pnpm-lock.yaml
vite.config.*
tsconfig*.json
local-blog/**
real write/patch/execute/code-runner implementation
Cookie-backed reader implementation
session persistence / database storage
durable request-log storage
```

本 docs-only worker 只允许新增 / 修改：

```text
docs/superpowers/specs/2026-07-07-p11-multi-step-model-loop-tool-continuation-freeze-design.md
docs/superpowers/plans/2026-07-07-p11-multi-step-model-loop-tool-continuation.md
```

## 13. 验收口径

P11 实现完成时，必须证明：

- multi-step loop contract 有 turn / step / attempt / terminal status / cancellation / failure taxonomy。
- provider request lifecycle 与 tool registry / router / lifecycle 分离。
- runtime 拥有 continuation decisions；Workbench 不拥有 loop decisions。
- tool-call parser / normalizer 只产出 intent，不直接执行真实工具。
- permission policy 覆盖 read、local-note-search、public-network、cookie-network、write、patch-apply、execute、delete、rollback、destructive。
- write、patch apply、execute/code runner、delete、rollback、Cookie-backed reader 均未开放真实执行。
- observation 经过 redaction / summarization / bounding 后才进入 continuation context。
- context compaction 只冻结 interface / preview，不声称 mature memory。
- request/session log 不写 durable storage。
- Workbench 只读展示 timeline/tool-call/permission/observation。
- OI specialization 是 profile / capability specialization，不污染通用 Agent runtime contract。
- `notes/**` 未被读取或修改为 routine engineering work。

## 14. 必跑审计命令

每个 P11 worker 起步：

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -12 --decorate
```

docs worker 验收：

```powershell
rg -n 'P11|Multi-Step Model Loop|Tool-Call Continuation|be33f80bc65159c094ecd06bf155afa3061ce23d' docs/superpowers/specs/2026-07-07-p11-multi-step-model-loop-tool-continuation-freeze-design.md docs/superpowers/plans/2026-07-07-p11-multi-step-model-loop-tool-continuation.md
$placeholderPattern = ('TO' + 'DO|TB' + 'D|待' + '补|以' + '后再补|占' + '位')
rg -n $placeholderPattern docs/superpowers/specs/2026-07-07-p11-multi-step-model-loop-tool-continuation-freeze-design.md docs/superpowers/plans/2026-07-07-p11-multi-step-model-loop-tool-continuation.md
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

implementation worker 至少执行：

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench
node .\node_modules\vitest\vitest.mjs run src/lib/apiBoundary.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'
rg -n 'Authorization|apiKey|api_key|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-[A-Za-z0-9]|cookie' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts
rg -n 'buildPrompt|prompt construction|PromptAssembler|ContextBuilder' src/components src/lib/agent-workbench src/lib/agent-runtime
rg -n 'patch apply|patch-apply|execute runner|code runner|Cookie-backed|session storage|request log persistence|database storage|delete|rollback|AiSidebar' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts src-tauri/src
rg -n 'AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|production-ready|ready: true|isReady: true' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

审计命中必须逐条解释。测试中的 negative-proof literal、preview status 和 forbidden capability string 可以存在，但必须说明它们不代表真实产品能力。

## 15. 退出标准

P11 只能在以下条件满足后 closeout：

- spec / plan 已冻结且后续 worker 可独立执行。
- loop state machine、tool-call parser/normalizer、registry/router/lifecycle preview、permission gate、observation redaction、continuation context、mock transport、Workbench projection 均有明确任务。
- 禁止项在测试和审计中有负证明。
- handoff 明确输出状态：**Multi-Step Model Loop / Tool-Call Continuation Contract Preview**。
- 不声称 AI 大升级完成、L5 Agent 完成、Codex-style runtime 完成、production-ready 或 mature autonomous Agent。

## 16. Spec 自审

- P11 与 P10 差异清楚：P10 是 one-turn live step，P11 是 multi-step continuation contract preview。
- P11 保持通用 Agent runtime contract，OI 仅作为 profile / tool capability specialization。
- P11 引用 Codex upstream provenance 的固定 commit 和 primary paths，只借鉴架构边界与分层。
- P11 不开放真实 write、patch apply、execute/code runner、delete、rollback、Cookie-backed reader 或 durable persistence。
- P11 把 Workbench 限定为只读投影，不让 UI 拥有 loop decisions、prompt construction、tool routing 或 provider secrets。
