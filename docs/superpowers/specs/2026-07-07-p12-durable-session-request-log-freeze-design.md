# P12 Durable Session / Request Log / Replay Persistence Contract Freeze Design

日期：2026-07-07
状态：review-ready
范围：AI Agent Workbench upgrade / P12 durable session、request log、replay persistence contract freeze

## 1. 文档目的

本文冻结 P12 的阶段边界：在 P11 `Multi-Step Model Loop / Tool-Call Continuation Contract Preview` 之后，P12 只把 durable session persistence、safe request log、replay persistence、storage boundary、privacy/redaction、compaction snapshot 与 Workbench 只读历史投影的契约写清楚。P12 不实现真实数据库、真实文件系统 durable log 写入、真实 patch apply、write mutation、delete、rollback、execute/code runner、Cookie-backed reader，也不迁移旧 `src/components/ai/AiSidebar.tsx`。

P12 的目标是让后续 worker 即使在上下文压缩后，也能只靠本文和对应 implementation plan 明确回答：

- session metadata、turn、step、event log、checkpoint、replay references、workspace/evidence/model/provider/tool/permission/observation ids 如何作为可持久化契约表达。
- request log / audit log 只能保存哪些 safe metadata、redacted summary、event ids 和 `secretRef` ids。
- durable event log 如何重放成 P11 read model 与 Workbench timeline，并如何处理 ordering、schema version、migration 和 corruption。
- 前端、runtime、Tauri/Rust、storage adapter 与 Workbench read model 的边界在哪里。
- 哪些隐私内容绝不进入 durable logs、provider/model payload、request log 或 Workbench 明文显示。

本文继承并必须继续遵守：

- `docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md`
- `docs/NoteX_Agent_Workbench_PRD.md`
- `docs/agent-workbench/handoff-p4.md` 的 P9 / P10 / P11 handoff sections
- `docs/superpowers/specs/2026-07-07-p11-multi-step-model-loop-tool-continuation-freeze-design.md`
- `docs/superpowers/plans/2026-07-07-p11-multi-step-model-loop-tool-continuation.md`

## 2. 阶段身份

阶段名称：**P12 Durable Session / Request Log / Replay Persistence Contract Freeze**

输入状态：**Multi-Step Model Loop / Tool-Call Continuation Contract Preview**

目标输出状态：**Durable Session / Request Log / Replay Persistence Contract Preview**

P12 推进的层级：

- Protocol / Event Schema：冻结可持久化 event envelope、schema version、sequence、causality、correlation ids、redaction class 和 replay visibility。
- Runtime Session Store Interface：runtime 只依赖 store interface，不能直接绑定具体 DB / FS adapter；P12 默认只允许 in-memory adapter contract。
- Safe Request Log Policy：request log 只保存 redacted metadata、safe summaries、event ids、provider/model ids、`secretRef` ids 和 audit decisions，不保存 raw payload。
- Tauri / API Boundary：frontend-to-Rust 只能经 `src/lib/api.ts`，Rust/Tauri command shape 必须 opaque、安全、最小。
- Storage Adapter Boundary：P12 可以冻结 adapter shape、schema version、migration guard 和 corruption result type；真实 durable adapter 必须由后续阶段单独批准。
- Replay Projector：从 durable event log deterministic replay 出 P11 read model / Workbench timeline。
- Workbench Read Model：UI 只读查看 session history、replay、audit trail，不触发工具执行、patch、write、delete、rollback、execute 或 Cookie reader。

通用能力裁决：P12 的 persistence core 必须通用，不是 OI-only。OI evidence、ProblemWorkspace、session linkage 可以很强，但只能作为 profile / capability specialization 挂接到通用 session、workspace、evidence refs；不得把 OI schema 写死到 durable session core、request log core、storage adapter 或 replay projector。

## 3. Codex upstream provenance

P12 固定参考 `openai/codex` 的以下上游版本：

```text
Repository: openai/codex
Reference commit: be33f80bc65159c094ecd06bf155afa3061ce23d
Primary paths:
codex-rs/protocol/src/protocol.rs
codex-rs/core/src/session/
codex-rs/core/src/state/
codex-rs/core/src/tools/
codex-rs/core/src/exec_policy.rs
codex-rs/core/src/apply_patch.rs
```

本文参考的是架构边界与工程分层，不复制具体实现，不声称本地已经具备 Codex 的成熟 runtime、session persistence、patch、sandbox、tool execution 或 autonomous Agent 能力。P12 借鉴的原则是：

- protocol / session / event log 是跨 UI 与 runtime 的稳定边界。
- session state、tool lifecycle、approval / permission、exec policy、patch workflow 与 UI projection 分层存在。
- replay、state projection、tool execution、patch apply 和 approval policy 不能互相混入。
- 持久化契约必须在 redaction、schema version、corruption handling、migration guard 和 replay determinism 上先冻结，再讨论真实 adapter。

P12 不照搬：

- Codex 的 repo-centric 产品边界。
- Codex CLI 默认依赖。
- 默认 shell、patch、execute 权限。
- 具体 Rust 数据结构、UI 形态、DB / FS layout 或 tool implementation。

上游事实与本项目映射必须区分：上游路径只作为成熟 Agent 分层参考；OI Notebook 的本地落地仍以通用 Agent runtime + OI specialization + low-dependency desktop boundary 为准。

## 4. 与 P11 的差异

P11 冻结的是 **in-memory bounded multi-step model loop / tool continuation**：

- turn / step / attempt / terminal status。
- tool-call parser / normalizer。
- preview registry / router / lifecycle。
- permission gate。
- redacted observation。
- mock / read-only tool transport。
- Workbench read-only loop timeline。

P11 明确禁止：

- durable session persistence。
- durable request-log persistence。
- database storage。
- raw provider payload storage。
- raw tool output storage。
- real patch / write / delete / rollback。
- execute / code runner。
- Cookie-backed reader。

P12 冻结的是 **durable session / request-log / replay persistence contract**：

- session metadata、turn、step、event、checkpoint、replay refs 的可持久化 schema。
- request log / audit log 的 safe metadata 与 redaction policy。
- durable event log replay 成 P11 read model / Workbench timeline 的 deterministic projector。
- storage adapter interface、schema version、migration strategy、corruption handling。
- frontend、runtime、Tauri/Rust、storage adapter 与 Workbench read model 的安全边界。

P12 仍是 contract / preview。默认实现只能落地类型、policy、pure projector、in-memory adapter contract、fixture-backed replay 和只读 UI projection。真实 DB / FS durable storage、真实 migration、真实 destructive cleanup、真实 log compaction 写入必须由后续阶段重新冻结安全边界、migration/rollback、redaction proofs 和 destructive-operation approval 后才能实施。

## 5. Durable Session Persistence Contract

P12 durable session metadata 至少冻结以下字段：

- `sessionId`
- `schemaVersion`
- `createdAt`
- `updatedAt`
- `phaseName`
- `inputState`
- `outputState`
- `runtimeVersion`
- `workspaceRefs`
- `evidenceRefs`
- `modelRefs`
- `providerRefs`
- `toolRefs`
- `permissionDecisionRefs`
- `observationRefs`
- `requestLogRefs`
- `replayCheckpointRefs`
- `privacyPolicyId`
- `redactionPolicyId`
- `storageAdapterKind`
- `capabilityStatuses`

turn / step / event log 契约：

- 每个 event 必须有 `eventId`、`sessionId`、`turnId`、可选 `stepId`、`sequence`、`eventType`、`createdAt`、`schemaVersion`、`redactionClass`、`replayVisibility`、`summary` 和 `refs`。
- ordering 必须由 monotonic `sequence` 决定；timestamp 只作为显示和审计辅助，不作为 replay 顺序来源。
- event 必须只引用 workspace/evidence/model/provider/tool/permission/observation ids，不内嵌真实 notes 内容、raw provider payload 或 raw tool output。
- checkpoint 必须引用 event sequence range、compacted snapshot id、redaction policy id 和 replay projector version。
- replay checkpoint 是恢复锚点，不是授权执行任何工具的入口。

P12 不允许 frontend 直接写持久层。runtime 可以依赖 `AgentSessionStore` interface；Tauri/Rust 可以暴露 opaque command shape；真实 storage adapter 不得在 P12 默认任务中写 DB / FS。

## 6. Request Log / Audit Log Contract

P12 request log / audit log 只能保存 safe metadata：

- `requestLogId`
- `sessionId`
- `turnId`
- `stepId`
- `providerId`
- `modelId`
- `requestKind`
- `permissionDecisionId`
- `redactionDecisionId`
- `secretRefId`
- `contextBuildId`
- `eventIds`
- `safeInputSummary`
- `safeOutputSummary`
- `usageSummary`
- `status`
- `safeError`
- `createdAt`
- `schemaVersion`

request log / audit log 绝不保存：

- API key。
- Authorization header。
- Cookie。
- raw provider request payload。
- raw provider response payload。
- raw tool output。
- 真实 `notes/**` 内容。
- 未授权 local note content。
- browser storage / localStorage / indexedDB dump。
- third-party payload 原文。
- 用户输入中被标记为 secret、cookie、local-note-sensitive 的片段。

`secretRefId` 只表示 Rust/Tauri secret store 或 provider settings boundary 中的 opaque reference，不表示前端或 request log 持有 secret。Workbench 可以显示 provider/model/request status 与 redacted summaries，但不能显示 raw prompt、raw completion、raw request body、raw response body 或 secret value。

## 7. Privacy / Redaction Policy

P12 redaction 分类：

- `secret`：API key、Authorization、token、password、private key、`sk-` 类 key。
- `cookie`：Cookie header、browser cookie、session id、CSRF token。
- `local-note`：真实 notes 内容、用户私有笔记片段、路径敏感内容。
- `user-input`：用户输入中未标记为 secret 但仍可能需要 summary-only 的内容。
- `derived-evidence`：可引用的证据摘要、source id、title、URL、snippet hash、workspace ref。
- `provider-payload`：provider request / response raw payload，默认不可持久化。
- `tool-output`：工具原始输出，默认 summary-only。
- `safe-metadata`：ids、status、timestamps、counts、model/provider identifiers、capability status。

规则：

- durable logs 默认只允许 `safe-metadata` 与 redacted summaries。
- `derived-evidence` 只能以 evidence id、source metadata 和 bounded summary 进入 durable logs。
- `local-note` 默认只允许 note id、workspace ref、hash / excerpt policy id 和 redacted summary；真实 note 内容不得进入 P12 durable log。
- `provider-payload` 与 `tool-output` 不得进入 durable request log；如后续阶段需要 retention，必须单独冻结 explicit retention policy、storage encryption、expiry、export/delete controls 和 audit proof。
- redaction failure 必须产生 structured event，并阻止该 payload 进入 durable log 与 continuation snapshot。

## 8. Replay Persistence Contract

P12 replay 必须从 durable event log 还原 P11 read model / Workbench timeline：

- projector input：session metadata、ordered event log、checkpoint refs、schema version、redaction policy id。
- projector output：P11 loop read model、session history summary、request audit trail read model、capability statuses、safe corruption / migration warnings。
- deterministic ordering：只按 `sequence` 排序，发现 duplicate、gap、session mismatch、step mismatch、unknown schema 或 redaction violation 时返回 structured failure。
- schema version：每个 session、event、checkpoint、request log record 都携带 schema version；projector 必须有 supported version set。
- migration strategy：P12 只冻结 migration plan shape，不执行真实 migration。迁移必须是 append-only 或 copy-on-write 计划，真实迁移留给后续阶段。
- corruption handling：corrupt log 不得触发工具执行或自动修复；只能产生 read-only warning、quarantined event refs、safe partial projection 或 hard failure。

P12 replay projection 只能查看历史，不执行历史中的 tool call、patch、write、delete、rollback、execute、Cookie reader 或 provider request。历史 event 中即使包含 future action intent，也只能作为 `unavailable` / `reserved` / `blocked` 的只读状态显示。

## 9. Compaction / Snapshot Boundary

P12 冻结 compacted context snapshot / replay checkpoint contract：

- `snapshotId`
- `sessionId`
- `turnId`
- `eventSequenceRange`
- `summary`
- `droppedEventIds`
- `retainedRefs`
- `redactionPolicyId`
- `schemaVersion`
- `createdAt`
- `projectorVersion`
- `privacyClass`

compacted snapshot 只能保存 redacted summary 与 retained refs，不保存 raw provider payload、raw tool output、API key、Authorization、Cookie 或真实 notes 内容。P12 默认只实现 deterministic in-memory snapshot contract 或 fixture projection；真实 snapshot durable write、snapshot compaction job、retention cleanup、export/delete controls 均延期到后续阶段。

## 10. Storage / API / Tauri Boundary

前端边界：

- React / Workbench 只消费 read model，不直接写 durable storage。
- frontend 不持有 API key、Authorization header、Cookie、raw provider payload 或 raw tool output。
- frontend-to-Rust 只能经 `src/lib/api.ts`。
- Workbench 的 session history、request audit trail、replay view 均为 read-only projection。

Runtime 边界：

- runtime 拥有 session lifecycle、event append intent、redaction decision、request log safe summary 和 replay projector 调用。
- runtime 依赖 `AgentSessionStore` / `RequestAuditLogStore` interface，不直接绑定 DB / FS。
- runtime 不把 OI specialization 写入 persistence core；只通过 refs 和 typed extension metadata 关联。

Tauri / Rust 边界：

- command shape 必须 opaque、安全、最小，只接受 ids、safe metadata、redacted summaries 与 explicit schema version。
- secret lookup 留在 Rust/Tauri 或已批准 secret boundary；前端与 durable log 只见 `secretRefId`。
- P12 可以冻结 command/type shape，但默认不得实现真实 DB / FS mutation。

Storage adapter 边界：

- P12 默认 adapter 为 in-memory / fixture-backed contract。
- 真实 DB / FS adapter 必须另开阶段冻结 storage path、encryption / permission、migration、rollback、backup、corruption recovery、retention、export/delete 和 destructive approval。

## 11. Workbench Read-Only Projection

Workbench P12 可以展示：

- session list / session detail。
- turn / step / event timeline。
- replay checkpoint list。
- request audit trail safe metadata。
- provider/model/request status。
- permission decisions。
- observation summaries。
- redaction / privacy status。
- corruption / migration warnings。
- 输出状态：**Durable Session / Request Log / Replay Persistence Contract Preview**。

Workbench P12 不得：

- 触发真实工具执行。
- 触发 provider request。
- 应用 patch。
- 写文件。
- 删除或回滚。
- 运行代码。
- 读取 Cookie-backed 页面。
- 读取或修改真实 `notes/**`。
- 显示 API key、Authorization、Cookie、raw provider payload、raw tool output 或真实 notes 内容。
- 把 P12 preview 表述为 production-ready autonomous Agent、AI 大升级完成、L5 Agent 完成或 Codex-style runtime 完成。

## 12. 文件 / 模块边界

后续 P12 implementation workers 可按 plan 精确修改：

```text
src/lib/agent-runtime/**
src/lib/agent-workbench/**
src/components/agent-workbench/**
docs/agent-workbench/handoff-p4.md
```

只有在 API / Tauri boundary contract 任务明确要求时，才可窄范围修改：

```text
src/lib/api.ts
src/lib/apiContract.ts
src-tauri/src/**
```

P12 默认不得触碰：

```text
notes/**
src/components/ai/**
package.json
pnpm-lock.yaml
vite.config.*
tsconfig*.json
local-blog/**
real patch apply / write mutation / delete / rollback implementation
execute / code runner implementation
Cookie-backed reader implementation
real DB schema / migration / filesystem durable log writer
```

本 docs-only worker 只允许新增 / 修改：

```text
docs/superpowers/specs/2026-07-07-p12-durable-session-request-log-freeze-design.md
docs/superpowers/plans/2026-07-07-p12-durable-session-request-log.md
```

## 13. 验收口径

P12 实现完成时，必须证明：

- durable session metadata、turn、step、event log、checkpoint、replay refs 有 schema version 与 deterministic ordering。
- request log / audit log 只保存 safe metadata、redacted summaries、event ids 和 `secretRefId`，不保存 secret / raw payload。
- replay projector 能从 event log deterministic 还原 P11 read model / Workbench timeline。
- migration strategy 与 corruption handling 是 read-only、安全、结构化的 contract。
- frontend 不直接写持久层，frontend-to-Rust 只经 `src/lib/api.ts`。
- Rust/Tauri command shape opaque、安全、最小，P12 默认不落地真实 DB / FS mutation。
- Workbench 只读查看 session history / replay / audit trail。
- OI specialization 通过 refs / profile / tool capability extension 表达，不污染通用 persistence core。
- 禁止项未实现、未被文案冒充已完成。
- `notes/**` 未被读取或修改为 routine engineering work。

## 14. 必跑审计命令

每个 P12 worker 起步：

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -12 --decorate
```

docs worker 验收：

```powershell
rg -n 'P12|Durable Session|Request Log|Replay Persistence|be33f80bc65159c094ecd06bf155afa3061ce23d' docs/superpowers/specs/2026-07-07-p12-durable-session-request-log-freeze-design.md docs/superpowers/plans/2026-07-07-p12-durable-session-request-log.md
$placeholderPattern = ('TO' + 'DO|TB' + 'D|待' + '补|以' + '后再补|占' + '位')
rg -n $placeholderPattern docs/superpowers/specs/2026-07-07-p12-durable-session-request-log-freeze-design.md docs/superpowers/plans/2026-07-07-p12-durable-session-request-log.md
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
rg -n 'Authorization|apiKey|api_key|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-[A-Za-z0-9]|cookie|raw provider payload|raw tool output' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts
rg -n 'localStorage|indexedDB|database storage|request log persistence|session storage|durable log writer|filesystem durable|migration' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts src-tauri/src
rg -n 'patch apply|patch-apply|execute runner|code runner|Cookie-backed|delete|rollback|AiSidebar' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts src-tauri/src
rg -n 'AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|production-ready|ready: true|isReady: true' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

审计命中必须逐条解释。测试中的 negative-proof literal、preview status、unavailable / reserved capability string 和 safe policy text 可以存在，但必须说明它们不代表真实产品能力。

## 15. 退出标准

P12 只能在以下条件满足后 closeout：

- spec / plan 已冻结且后续 worker 可独立执行。
- durable session、request log、replay projector、storage adapter interface、redaction policy、compaction snapshot、Workbench read-only projection 均有明确任务。
- 禁止项在测试和审计中有负证明。
- handoff 明确输出状态：**Durable Session / Request Log / Replay Persistence Contract Preview**。
- 不声称 AI 大升级完成、L5 Agent 完成、Codex-style runtime 完成、production-ready 或 mature autonomous Agent。
- final filtered status 与 staged paths 可解释；push 明确为否，除非 supervisor 后续另行要求。

## 16. Spec 自审

- P12 与 P11 差异清楚：P11 是 in-memory bounded loop / tool continuation，P12 是 durable session / request-log / replay persistence contract preview。
- P12 保持通用 Agent persistence core，OI 仅作为 profile / evidence / workspace linkage specialization。
- P12 引用 Codex upstream provenance 的固定 commit 和 primary paths，只借鉴架构边界与分层。
- P12 不开放真实 DB / FS durable writes、write、patch apply、execute/code runner、delete、rollback 或 Cookie-backed reader。
- P12 把 Workbench 限定为只读 history / replay / audit projection，不让 UI 拥有 storage mutation、prompt construction、tool routing、provider secrets 或 raw payload。
