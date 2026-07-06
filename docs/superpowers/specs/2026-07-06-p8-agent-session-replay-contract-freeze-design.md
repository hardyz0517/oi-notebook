# P8 Agent Session / Replay Contract Freeze 设计

日期：2026-07-06
状态：待评审
范围：AI Agent Workbench 大升级 / P8 Agent Session / Replay Contract Freeze

## 1. 文档目的

本文冻结 P8 的进入边界和退出口径。上下文压缩后，worker 只靠总 spec 与本文，也必须能恢复 P8 的方向、允许范围、禁止范围、文件边界、验收命令和下一阶段入口。

P8 的任务不是接模型、不是做 patch、不是执行代码，也不是把 Cookie reader 或持久化一次性接通。P8 只把 Agent session、event log、replay、checkpoint、隐私脱敏、workspace/evidence linkage 和 Workbench read-only projection 冻结为可测试 contract。

P8 必须继承：

- 总 spec：`docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md`
- P5 freeze：`docs/superpowers/specs/2026-07-05-p5-agent-core-contract-freeze-design.md`
- P6 freeze：`docs/superpowers/specs/2026-07-05-p6-tool-permission-contract-freeze-design.md`
- P7 freeze：`docs/superpowers/specs/2026-07-06-p7-oi-research-solution-skill-contract-freeze-design.md`
- P7 plan：`docs/superpowers/plans/2026-07-06-p7-oi-research-solution-skill-contract.md`
- P7 handoff：`docs/agent-workbench/handoff-p4.md`

## 2. 阶段身份

阶段名称：**P8 Agent Session / Replay Contract Freeze**

当前输入状态：**OI Research/Solution Skill Contract Preview**

P8 输出状态：**Agent Session/Replay Contract Preview**

统一口径：

- P8 是 session/replay contract、fixture、read model、privacy policy types 和 Workbench replay projection 阶段。
- P8 不声明成熟 runtime、真实模型循环、自动 patch、执行器、Cookie reader 或持久化已可用。
- P8 必须保持通用 Agent 能力扎实，同时让 OI research/solution session 可审计、可回放、可恢复；不能把 session/replay 设计成只服务 OI 的窄结构。

## 3. 当前输入状态

P7 已完成并输出 **OI Research/Solution Skill Contract Preview**。

P7 已冻结：

- OI skill/task/source/evidence/solution read model。
- `ProblemWorkspace` preview fields。
- deterministic preview adapter。
- Workbench read-model projection。

P7 未接入：

- 真实 provider request。
- prompt construction。
- model loop。
- streaming。
- write。
- patch apply。
- execute / code runner。
- Cookie-backed reader。
- session persistence。

P8 必须把这些未接入能力继续保持为未开放状态，只新增 session/replay 合同，不把 P7 preview flow 升级成真实 Agent loop。

## 4. Codex 架构对标

2026-07-06 已对官方 `openai/codex` GitHub `main` 做只读核验，参考 HEAD：

```text
be33f80bc65159c094ecd06bf155afa3061ce23d
```

核验路径包括：

```text
codex-rs/protocol/src/protocol.rs
codex-rs/core/src/tools/{registry,router,lifecycle}.rs
codex-rs/core/src/exec_policy.rs
codex-rs/core/src/apply_patch.rs
codex-rs/core/src/session/
codex-rs/core/src/state/
```

可迁移原则：

- protocol / session / event 是一等协议，不是 UI 内部状态。
- runtime owns decisions；UI only consumes events/read models。
- tools 有 registry / router / lifecycle。
- approval / sandbox / exec / patch / apply 分层。
- patch 不是模型说写就写，必须有 grammar、审批、安全评估和应用边界。
- session/replay/state 是审计、恢复、继续执行和 UI projection 的底座。

不照搬项：

- 不照搬 coding-agent UI。
- 不默认依赖 Codex CLI。
- 不默认开放 shell、patch 或 repo-centric workflow。
- 不把 OI Notebook 做成另一个通用 coding agent 壳。

P8 只吸收架构原则：事件协议、session identity、replay determinism、runtime-owned decision boundary、read-model projection 和隐私可审计性。

## 5. 为什么 P8 先做 session/replay

P8 推荐优先冻结 **Agent Session/Replay Contract Preview**，因为它是后续 provider/model adapter、patch workflow、tool execution runner、Cookie-backed reader、Workbench IA 的审计底座。

依赖关系如下：

1. Provider/model adapter 需要 session id、turn id、event order、privacy policy 和 replay trace，才能证明一次模型输出来自哪一段上下文、哪些 evidence、哪些权限决策。
2. Patch workflow 需要 event log 和 checkpoint，才能记录 patch generated、diff reviewed、apply requested、apply result、rollback candidate，而不是静默写文件。
3. Tool execution runner 需要 lifecycle event、permission decision、failure recovery 和 replay fixture，才能区分真实执行、preview、blocked、failed。
4. Cookie-backed reader 需要 redaction policy、source boundary 和 audit event，才能证明 Cookie 不进入模型 provider、第三方搜索、日志或 evidence payload。
5. Workbench IA 需要稳定 read model，才能展示 session timeline、evidence linkage、workspace snapshot、failure/recovery，而不是从 UI 状态倒推出业务含义。

因此 P8 先做 session/replay，而不是先做 provider/model/patch/execute/Cookie。没有 P8，后续任何真实能力都会缺审计、缺恢复、缺负证明，容易退化成 prompt helper 或 UI 分支。

## 6. P8 允许做什么

允许：

- 定义 session metadata / identity / state / capability types。
- 定义 AgentEvent log、replay input/output、event ordering、snapshot/checkpoint contract。
- 定义 deterministic replay fixture，使用 in-memory 数据，不落真实 storage。
- 定义 redaction/privacy policy types，表达 secret、Cookie、user note、request payload、evidence excerpt 的可见性。
- 定义 workspace / evidence / session linkage，让 P7 read model 能挂到 session trace。
- 定义 failure/recovery 状态，例如 interrupted、blocked、failed、replay-mismatch、checkpoint-missing。
- 定义 Workbench read-only replay projection，让 UI 只展示 session replay read model。
- 增加 negative-proof tests，证明 provider/model/patch/execute/Cookie/persistence 没被接通。
- 更新 `docs/agent-workbench/handoff-p4.md`，记录 P8 输出状态与 P9 入口。

## 7. P8 禁止做什么

禁止：

- 真实 provider request。
- prompt construction。
- model loop。
- streaming。
- write。
- patch apply。
- execute / code runner。
- delete / rollback。
- Cookie-backed reader 或 Cookie-backed capability expansion。
- 真实 persistence / storage / request log。
- 旧 `src/components/ai/AiSidebar.tsx` 迁移。
- 绕过 `src/lib/api.ts`。
- 修改 `notes/**` 或读取真实用户笔记参与 routine engineering work。
- 用 UI 文案或类型名暗示 P8 已具备成熟 runtime、真实模型循环、patch workflow、执行器、Cookie reader 或持久化能力。

## 8. Contract Detail

### 8.1 AgentSession identity / state

P8 后 session identity 至少应表达：

```text
sessionId
workspaceId
createdAt
updatedAt
inputState
outputState
phase
status
capabilities
privacyPolicyId
replaySource
```

建议状态：

```text
idle
running
blocked
interrupted
completed
failed
replayable
replay-mismatch
```

规则：

- `sessionId` 是 event log、workspace snapshot、evidence packet、Workbench projection 的关联主键。
- `inputState` 必须记录 P8 的输入状态：`OI Research/Solution Skill Contract Preview`。
- `outputState` 只能记录 P8 的输出状态：`Agent Session/Replay Contract Preview`。
- capability status 必须区分 `preview`、`reserved`、`unavailable`、`blocked`、`degraded`。

### 8.2 AgentEvent log / replay

P8 event log contract 至少应表达：

```text
eventId
sessionId
sequence
type
at
source
payload
redaction
causationId
correlationId
```

event ordering：

- `sequence` 在单个 session 内单调递增。
- replay 必须按 `sequence` 重建 read model。
- 同 sequence、缺 sequence、跨 session event 混入，必须产生结构化 replay failure。
- replay 不得依赖 wall-clock、random、真实 network、真实 storage 或真实 notes。

### 8.3 Snapshot / checkpoint

P8 snapshot/checkpoint contract 至少应表达：

```text
checkpointId
sessionId
afterSequence
workspaceSnapshot
evidenceSnapshot
skillSnapshot
capabilitySnapshot
privacySnapshot
```

规则：

- checkpoint 是 replay 加速和恢复边界，不是持久化实现。
- P8 可使用 fixture / in-memory checkpoint。
- checkpoint 缺失时 replay 可从 event log 重建；重建失败必须输出 failure reason。
- checkpoint payload 必须经过 redaction policy 标记。

### 8.4 Privacy / redaction

P8 privacy contract 至少应表达：

```text
classification
visibility
redactionStrategy
reason
sourceRef
```

classification 建议：

```text
public
local-note
cookie
secret
user-input
derived-evidence
runtime-metadata
```

visibility 建议：

```text
ui-visible
runtime-only
redacted
forbidden-for-model
forbidden-for-third-party
```

规则：

- Cookie、secret、真实 note content 默认不能进入模型 provider、第三方 search、request log 或 replay fixture 明文。
- P8 只定义 policy 和 tests，不读取真实 Cookie 或真实 notes。
- Workbench 展示的是 redacted read model，不展示敏感 payload。

### 8.5 Evidence / workspace linkage

P8 linkage contract 至少应表达：

```text
sessionId
workspaceId
evidenceIds
traceEventIds
checkpointIds
skillInvocationIds
```

规则：

- P7 `OiSkillReadModel` 可以被 session replay 引用，但 P8 不改变其真实能力。
- `ProblemWorkspace.traceEventIds` 与 session event log 保持可追踪。
- evidence 只以 id、source role、citation id、redaction metadata 进入 replay read model。
- local-note source 仍只做 contract/read-model 表达，不读 `notes/**`。

### 8.6 Failure / recovery

P8 failure reasons 至少应覆盖：

```text
event-order-invalid
event-session-mismatch
checkpoint-missing
checkpoint-session-mismatch
redaction-policy-violation
unsupported-event-type
reserved-capability-event
unavailable-capability-event
replay-fixture-invalid
```

recovery 语义：

- 可从 event log 重建的，返回 `replayable` 或 `completed` read model。
- 缺关键 event 或违反 redaction policy 的，返回 `failed` read model，附 failure reason。
- reserved / unavailable capability 事件不能被当作真实执行结果。

### 8.7 Replay determinism

P8 replay 必须满足：

- 同一 fixture 多次 replay 输出稳定。
- 输出不依赖当前时间、随机数、网络、真实文件系统、真实 notes、真实 storage。
- fixture 内的时间戳和 ids 必须固定。
- replay projection 是 read model，不触发工具执行、副作用、provider request 或 Tauri IPC。

### 8.8 Capability statuses

P8 capability statuses 必须继续表达：

```text
preview
reserved
unavailable
blocked
degraded
```

P8 可以把 session/replay 自身标为 `preview`，但必须把 provider/model/streaming/write/patch/execute/Cookie/persistence 维持为 `reserved`、`unavailable`、`blocked` 或 `degraded`，并带 reason code。

## 9. File / Module Boundary

P8 implementation slice 可改：

```text
src/lib/agent-runtime/**
src/lib/agent-workbench/**
src/lib/problem-workspace/**
src/lib/oi-skills/**
src/components/agent-workbench/**
docs/agent-workbench/handoff-p4.md
docs/superpowers/specs/2026-07-06-p8-agent-session-replay-contract-freeze-design.md
docs/superpowers/plans/2026-07-06-p8-agent-session-replay-contract.md
```

P8 implementation slice 禁止：

```text
notes/**
src/components/ai/**
src-tauri/src/ai.rs
src-tauri/src/luogu*.rs
local-blog/**
provider/model selection code
prompt construction code
real patch/write/execute/code-runner code
storage/privacy persistence surface
request log storage
Cookie-backed reader implementation
```

文档 worker 只允许创建/修改本 P8 spec 和 P8 implementation plan；不得修改功能代码、测试代码、package/lockfile 或 `notes/**`。

## 10. 验收命令和 no-hit audits

每个 P8 worker 启动必须运行：

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -10 --decorate
```

P8 docs worker 至少运行：

```powershell
rg -n 'P8 Agent Session|Agent Session/Replay Contract Preview|P9' docs/superpowers/specs/2026-07-06-p8-agent-session-replay-contract-freeze-design.md docs/superpowers/plans/2026-07-06-p8-agent-session-replay-contract.md
$placeholderPattern = ('TO' + 'DO|TB' + 'D|待' + '补|占' + '位|以后' + '再')
rg -n $placeholderPattern docs/superpowers/specs/2026-07-06-p8-agent-session-replay-contract-freeze-design.md docs/superpowers/plans/2026-07-06-p8-agent-session-replay-contract.md
$capabilityPattern = ('AI 大升级' + '完成|L5 Agent ' + '完成|Codex-style runtime ' + '完成|production' + '-ready|ready:' + ' true|isReady:' + ' true')
rg -n $capabilityPattern docs/superpowers/specs/2026-07-06-p8-agent-session-replay-contract-freeze-design.md docs/superpowers/plans/2026-07-06-p8-agent-session-replay-contract.md
```

第二、第三个 audit 必须 no-hit。

P8 implementation worker 根据 slice 至少运行：

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench
node .\node_modules\vitest\vitest.mjs run src/lib/problem-workspace
node .\node_modules\vitest\vitest.mjs run src/lib/oi-skills
node .\node_modules\typescript\bin\tsc --noEmit
rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'
rg -n 'providerId|modelId|chat_with_current_note_stream|model\.delta|prompt construction|OpenAI' src/lib/agent-workbench src/components/agent-workbench src/lib/problem-workspace src/lib/oi-skills
rg -n 'write|patch apply|execute|Cookie-backed|request log|session storage' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench
```

若 broad audit 命中既有 protocol literal，worker 必须收窄到 changed surface 并解释命中来源，不得把越界实现当作通过。

## 11. 退出标准

P8 可以结束的条件：

- Agent session identity/state/capability contract 已冻结并有 focused tests。
- Event log/replay ordering、snapshot/checkpoint、failure/recovery、determinism 已有 tests。
- Privacy/redaction policy types 能阻止 Cookie、secret、真实 note content 进入 fixture、model provider、第三方 search 或 request log。
- Workspace/evidence/session linkage 能让 P7 read model 与 session trace 互相定位。
- Workbench replay projection 只读消费 read model，不拥有 replay decision。
- Negative-proof tests 覆盖 provider/model/streaming/write/patch/execute/Cookie/persistence 未接通。
- Focused tests、typecheck、API boundary audit、capability claim audit 通过。
- `docs/agent-workbench/handoff-p4.md` 记录 P8 输出状态与 P9 入口。
- 最终只能声明 **Agent Session/Replay Contract Preview**。

P8 不可声明成熟 runtime、真实 provider/model loop、patch workflow、tool execution runner、Cookie-backed reader、session persistence 或完整 Workbench IA。

## 12. 下一阶段入口

P9 才能讨论以下方向之一：

- provider/model adapter contract。
- patch workflow contract。
- tool execution runner contract。
- Cookie-backed reader contract。
- session persistence/storage contract。
- Workbench IA replay/detail contract。

P9 必须先写新的 freeze spec 和 implementation plan，明确继承 P5/P6/P7/P8 禁区、允许路径、禁止路径、tests、no-hit audits 和退出口径。任何 worker 不得从 P8 推导出 provider/model/patch/execute/Cookie/persistence 已获批。

## 13. Self-review

- 无未完成段落或模糊入口。
- 本文继承 P5/P6/P7 禁区，没有重新打开真实 provider、prompt、model loop、streaming、write、patch、execute、Cookie、persistence、旧 AiSidebar 或 notes。
- P8 输出名明确为 **Agent Session/Replay Contract Preview**。
- P8 先做 session/replay 的依赖关系已说明：它是后续 provider/model adapter、patch workflow、tool execution runner、Cookie-backed reader 和 Workbench IA 的审计底座。
- 通用 Agent 能力扎实，OI 场景通过 ProblemWorkspace、evidence、skill read model linkage 得到强化，但底层 session/replay contract 不被 OI 窄化。
