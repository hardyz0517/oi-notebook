# P10 Model Loop / Live Provider Request Contract Freeze Design

日期：2026-07-07
状态：review-ready
范围：AI Agent Workbench upgrade / P10 live provider request 与 model loop contract freeze

## 1. 文档目的

本文冻结 P10 的阶段边界：在 P9 `Provider/Model Adapter Contract Preview` 之后，P10 可以开始进入真实 provider request 与 live streaming 的最小安全通路，但必须先通过 `src/lib/api.ts` / Tauri 安全边界、权限门禁、redaction、API key / secret 策略、request log 策略、可取消 / 可重试 / 可审计事件流之后才能实现。

P10 不是“一次性把完整 Agent 做完”。它只允许把 P9 的 mock provider/model contract 升级成受控的 live provider request gate，并冻结最小 one-turn model step / stream projection / cancellation / retry / audit contract。真正的多轮 autonomous model loop、工具调用闭环、patch workflow、execute/code runner、Cookie-backed reader、session persistence 和旧 AiSidebar 迁移仍然留给后续阶段。

本阶段继承以下事实来源：

- `docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md`
- `docs/NoteX_Agent_Workbench_PRD.md`
- `docs/agent-workbench/handoff-p4.md` 的 P9 handoff 小节
- `docs/superpowers/specs/2026-07-07-p9-provider-model-adapter-contract-freeze-design.md`
- `docs/superpowers/plans/2026-07-07-p9-provider-model-adapter-contract.md`

如果后续 worker 只拿到本文，必须先恢复上述文档，再写功能代码。

## 2. 阶段身份

阶段名称：**P10 Model Loop / Live Provider Request Contract Freeze**

输入状态：**Provider/Model Adapter Contract Preview**

目标输出状态：**Live Provider Request / One-Turn Model Step Contract Preview**

P10 推进的层级：

- Provider layer：从 mock adapter contract 进入受控 live request gate。
- Runtime layer：冻结 runtime-owned provider request lifecycle、abort、retry、error mapping 与 event emission。
- Context layer：冻结 prompt construction / context builder 的输入输出边界，不把拼 prompt 放进 UI。
- Session/Event layer：冻结 live stream 事件投影，但不开放长期 session persistence。
- UI layer：Workbench 只消费 read model 和事件，不选择 provider、不读 secret、不直接请求 provider。

命名 / 范围裁决建议：保留用户指定的 `P10 Model Loop / Live Provider Request` 文件名和阶段名，但在正文中把成熟 model loop 拆成两级：

1. P10 允许：单次 live model step、live stream projection、request lifecycle、cancel/retry/audit contract。
2. P10 不允许：模型自行多轮调用工具、continuation loop、tool observation 再喂回模型、patch/execute/write 闭环。

这样既承认 P10 是 provider/model loop 入口，又避免一次性堆成无法审计的巨大实现。

## 3. P10 是否允许真实 provider request

P10 **允许**实现真实 provider request 和 live streaming，但只能在以下闸门全部满足后进入实现：

1. 前端到 Rust 的 provider request 必须经过 `src/lib/api.ts`，不得在 React / `src/lib/agent-runtime/**` 中直接使用 Tauri `invoke()`。
2. Rust / Tauri 侧必须是唯一读取 API key / secret 的层；前端不得持有、记录、展示或传递明文 key。
3. runtime 必须先得到 provider request permission decision；permission 不可由 UI 卡片手写冒充。
4. request envelope 必须经过 redaction gate；secret、cookie、真实 note content、未授权 local-note payload 不得进入 provider payload。
5. prompt construction 必须由 runtime/context builder 生成结构化 request parts；React UI 不得拼 prompt。
6. request log 必须先冻结 redacted audit 形态；P10 可以记录内存态 redacted summary，但不得写 session storage、数据库或长期 request log persistence。
7. live stream 必须转换成稳定 `AgentEvent` / provider-model event；UI 只消费事件和 read model。
8. cancellation 必须可从 runtime 发起，且产生 terminal event；retry 必须有上限、原因、attempt id 和审计事件。
9. provider error 必须映射为 P9 taxonomy 的安全错误，不得泄漏 raw provider payload、Authorization header、API key、cookie 或完整未授权 prompt。
10. focused tests、typecheck、API boundary audit、secret/network audit、capability claim audit 必须通过。

如果任一闸门缺失，P10 worker 只能继续写 contract、mock、negative-proof tests 或 read-only projection，不得发起 live provider call。

## 4. Codex 上游参考 provenance

P10 沿用此前固定的上游 Codex provenance：

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

本文参考的是架构边界与工程分层，不是复制具体实现。P10 借鉴的原则是：

- protocol / session / event 是一等边界，UI 不拥有 agent decisions。
- runtime 拥有 request lifecycle、permission、abort、retry、error mapping。
- tool registry / router / lifecycle 与 provider request lifecycle 分离。
- exec policy / patch apply 是独立安全层，不能因 live model response 可用而顺手开放。
- apply patch 必须有单独 grammar、审批、事务和 rollback 边界；P10 不实现 patch apply。

P10 不照搬：

- Codex 的 repo-centric 产品边界。
- Codex CLI 默认依赖。
- 默认 shell / patch / execute 权限。
- 具体 Rust module 结构或 UI 形态。

如果后续 worker 需要补充上游事实，只能做文档级引用，并记录 remote、branch、HEAD、fetch time 和 inspected paths；不能把未复核的上游实现当成当前实现证据。

## 5. 输入状态：P9 冻结边界

P9 已合入：

- provider/model request envelope
- mock adapter interface
- deterministic mock fixture
- preview stream event contract
- error taxonomy
- capability matrix
- cancellation / rate-limit / retry metadata
- redaction / permission policy
- Workbench read-only projection

P9 仍禁止：

- 真实 provider request
- 真实 streaming
- prompt construction
- model loop
- API key handling
- secret storage
- request log
- session storage / persistence
- write / patch apply / execute / code runner
- Cookie-backed reader
- 旧 `src/components/ai/AiSidebar.tsx` 迁移
- 绕过 `src/lib/api.ts`
- 读取或修改真实 `notes/**`

P10 只能在 P9 类型、mock adapter、policy、view model 的基础上逐步打开 live gate，不能绕过 P9 已冻结的 contract。

## 6. P10 总体依赖顺序

P10 必须按以下依赖推进，不能把这些内容塞进一个巨大 PR：

1. **Settings / secret source audit**
   - 只审计既有 provider settings、API key、model config、request log 资产。
   - 不迁移旧 AiSidebar，不改 settings UI 行为。

2. **Tauri provider request boundary**
   - 先定义 `src/lib/api.ts` wrapper 和 Tauri command contract。
   - Rust 侧读取 secret，前端只传 provider/profile id、model id、redacted envelope id 和 request options。

3. **Secret / redaction / permission gate**
   - permission 必须来自 runtime policy。
   - redaction 必须在 provider payload 生成前完成。
   - blocked request 必须有 event 和 safe error。

4. **Context builder / prompt construction contract**
   - ContextBuilder 产出 structured request parts。
   - PromptAssembler 只在 runtime/provider boundary 内把 parts 转换成 provider payload。
   - UI 不拼 prompt，Workbench 不拥有 context decisions。

5. **One-turn live provider request**
   - 只允许单次 model step。
   - 不允许模型输出触发真实工具执行。
   - 不允许 continuation loop。

6. **Live stream projection**
   - provider raw stream 映射为 normalized events。
   - UI 只消费 `model.delta.live` / lifecycle events 的 read model。

7. **Cancellation / retry / rate-limit**
   - abort signal、terminal event、bounded retry、retry audit。
   - 不允许无限 backoff 或隐藏重试。

8. **Redacted request log strategy**
   - P10 只允许内存态 redacted audit snapshot 或 fixture-backed test log。
   - 持久化必须等 session/request-log persistence 阶段。

9. **Workbench read-only projection**
   - 展示 request lifecycle、stream status、cancel/retry/error。
   - 不显示 secret、不显示完整未授权 prompt。

10. **Closeout audit / handoff**
    - 证明没有写、patch apply、execute/code runner、Cookie-backed reader、旧 AiSidebar 迁移、session persistence。

## 7. P10 允许工作

P10 implementation workers 可以在严格范围内实现：

- live provider request boundary types。
- `src/lib/api.ts` 中的 provider request wrapper。
- Tauri command contract 与 Rust-side provider request dispatcher。
- provider settings 读取的安全接口，前端不拿明文 key。
- OpenAI-compatible / relay-style 最小 adapter 的安全调用路径，前提是由 supervisor 明确选择目标 provider shape。
- runtime-owned permission / redaction gate。
- ContextBuilder / PromptAssembler contract 与 focused tests。
- one-turn model step lifecycle。
- live stream normalized event union。
- cancellation、retry、rate-limit event semantics。
- redacted in-memory audit snapshot。
- Workbench read-only live provider projection。
- negative-proof tests：无 secret 泄漏、无 UI prompt construction、无 direct Tauri invoke、无 write/patch/execute/Cookie/storage。

P10 可以使用真实 provider request，但必须默认由 test/mocked transport 覆盖；任何需要真实 key 的 smoke test 都必须是显式 opt-in，不得成为普通 CI 或 routine test 的前置条件。

## 8. P10 禁止工作

P10 仍不得实现或迁移：

- write
- patch generation / patch apply
- execute / code runner / stress tester
- delete / rollback
- Cookie-backed reader 或 Cookie-backed Luogu expansion
- session persistence / database storage / durable request log
- 旧 `src/components/ai/AiSidebar.tsx` 迁移
- 旧 research-engine 主链路重写
- React component 内 prompt construction
- UI 直接选择 provider 并发 request
- 前端读取或存储 API key / Authorization header / cookie
- 绕过 `src/lib/api.ts`
- 读取或修改真实 `notes/**`
- 把 live one-turn response 表述为 L5 Agent 完成、AI 大升级完成、production-ready 或成熟 Codex-style runtime 完成

这些能力必须拆为后续阶段：

- P11：multi-step model loop / tool-call continuation contract。
- P12：session persistence / redacted request log storage。
- P13：patch workflow contract。
- P14：execute / code runner contract。
- P15：Cookie-backed reader contract。
- P16：legacy AiSidebar retirement / migration。

阶段编号可以由主管线程裁决，但 P10 不得越界实现。

## 9. Contract 方向

### 9.1 Live Request Envelope

P9 `ProviderModelRequestEnvelope` 继续作为核心输入。P10 可以扩展 live metadata：

```text
transport: "tauri-provider-request"
requestMode: "live-one-turn"
contextBuildId
redactionDecisionId
permissionDecisionId
secretRef
requestLogPolicyId
streamPolicyId
abortControllerId
retryPolicyId
```

约束：

- `secretRef` 只能是 Rust / secure store 能解析的 opaque id。
- 前端不得出现 API key 明文。
- `contextBuildId` 指向结构化 context builder output，不指向 UI 拼接字符串。
- request log 只能记录 redacted summary。

### 9.2 Provider Adapter

P10 adapter 分层：

```text
ProviderModelAdapter
├─ MockProviderModelAdapter
├─ LiveProviderModelAdapter interface
└─ TauriProviderTransport
```

规则：

- TypeScript runtime 只调用 `src/lib/api.ts` wrapper。
- Rust / Tauri 侧负责 secret lookup、HTTP request、SSE/stream parsing 或 equivalent transport。
- raw provider payload 不直接进入 Workbench。
- adapter 必须把 vendor-specific event 映射为 normalized stream events。

### 9.3 Context Builder / Prompt Assembler

ContextBuilder 输出：

```text
contextBuildId
taskIntent
workspaceRefs
evidenceRefs
inputParts[]
tokenBudget
redactionLabels
permissionNeeds
```

PromptAssembler 输出：

```text
providerPayloadShape
messagesOrInput
toolExposure
responseFormat
streamOptions
safePromptSummary
```

约束：

- ContextBuilder 是通用的；OI 只是 `taskIntent` / workspace profile。
- OI 题面、代码、证据、笔记以 typed parts 进入，不把 Provider 层写死成 OI-only。
- PromptAssembler 不在 UI 层，不在 Workbench component 层。
- safePromptSummary 可展示，完整 raw prompt 默认不展示。

### 9.4 Model Step / Loop

P10 只冻结并实现 one-turn model step：

```text
agent.started
context.build.started
context.build.completed
provider.permission.checked
provider.redaction.checked
provider.request.started
model.turn.started
model.delta.live
model.usage.live
model.turn.completed.live
agent.completed
```

失败 / 取消：

```text
provider.request.failed
model.turn.failed.live
provider.request.cancelled
model.turn.cancelled.live
agent.failed
```

P10 不允许：

- model output 直接 dispatch tool。
- tool observation 再进入 model continuation。
- 自动 compaction。
- 多 turn session persistence。

### 9.5 Request Log Strategy

P10 request log 是策略冻结，不是持久化实现。

允许记录：

- requestId、sessionId、turnId、workspaceId
- providerProfileId、modelProfileId
- permission decision summary
- redaction decision summary
- event sequence
- usage summary
- safe error
- retry attempts
- cancellation reason
- safePromptSummary

不得记录：

- API key / Authorization header
- cookie
- raw provider payload
- 完整未授权 prompt
- 真实 local note content
- 用户未批准的 secret-like text
- durable storage record

## 10. Workbench 投影边界

Workbench 可以展示：

- live request status
- provider/model label
- permission/redaction status
- stream event timeline
- delta text
- usage summary
- cancel/retry/error status
- redacted request summary
- “one-turn live model step”能力说明

Workbench 不得：

- 读取 secret
- 构造 prompt
- 选择 provider 并绕过 runtime
- 触发工具执行
- 应用 patch
- 写文件
- 读取 Cookie-backed 页面
- 把 one-turn live step 描述为 mature model loop

## 11. 文件 / 模块边界

P10 implementation slices 可修改：

```text
src/lib/agent-runtime/**
src/lib/agent-workbench/**
src/components/agent-workbench/**
src/lib/api.ts
src/lib/apiContract.ts
src-tauri/src/**
docs/agent-workbench/handoff-p4.md
```

其中 `src-tauri/src/**` 只能改 provider request / secret lookup / transport 所需的最小文件，并必须保留 frontend-to-Rust 只经 `src/lib/api.ts` 的边界。

P10 不得修改：

```text
notes/**
src/components/ai/**
local-blog/**
real write/patch/execute/code-runner implementation
Cookie-backed reader implementation
session persistence / database storage
request log durable storage
package or lock files unless dependency hydration is explicitly approved
```

本 docs-only worker 只允许新增 / 修改：

```text
docs/superpowers/specs/2026-07-07-p10-model-loop-live-provider-request-freeze-design.md
docs/superpowers/plans/2026-07-07-p10-model-loop-live-provider-request.md
```

## 12. 验收口径

P10 实现完成时，必须证明：

- live provider request 只经 `src/lib/api.ts` / Tauri safe boundary。
- 前端没有 API key / Authorization / cookie 明文。
- permission gate 阻止未批准 request。
- redaction gate 阻止 secret、cookie、未授权 note content。
- ContextBuilder / PromptAssembler 不在 UI component 中。
- one-turn live stream 事件可审计、可取消、可映射错误。
- retry 有上限并产生 event。
- request log 只有 redacted in-memory summary。
- Workbench 只读消费 event/read model。
- 没有 write、patch apply、execute/code runner、Cookie-backed reader、session persistence、旧 AiSidebar migration。
- `notes/**` 未被读取或修改为 routine engineering work。

## 13. 必跑审计命令

每个 P10 implementation worker 起步：

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -12 --decorate
```

docs worker 验收：

```powershell
rg -n 'P10 Model Loop|Live Provider Request|Live Provider Request / One-Turn Model Step Contract Preview|be33f80bc65159c094ecd06bf155afa3061ce23d' docs/superpowers/specs/2026-07-07-p10-model-loop-live-provider-request-freeze-design.md docs/superpowers/plans/2026-07-07-p10-model-loop-live-provider-request.md
$placeholderPattern = ('TO' + 'DO|TB' + 'D|待' + '补|以' + '后再补|占' + '位')
rg -n $placeholderPattern docs/superpowers/specs/2026-07-07-p10-model-loop-live-provider-request-freeze-design.md docs/superpowers/plans/2026-07-07-p10-model-loop-live-provider-request.md
```

implementation worker 至少执行：

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench
node .\node_modules\vitest\vitest.mjs run src/lib/apiBoundary.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'
rg -n 'Authorization|apiKey|api_key|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-[A-Za-z0-9]' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts
rg -n 'prompt construction|buildPrompt|PromptAssembler|ContextBuilder' src/components src/lib/agent-workbench src/lib/agent-runtime
rg -n 'patch apply|execute runner|Cookie-backed|session storage|request log persistence|AiSidebar' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts src-tauri/src
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

审计命中必须逐条解释。测试中的 negative-proof literal 可以存在，但必须说明它不代表产品能力。

## 14. 退出标准

P10 只能在以下条件满足后 closeout：

- spec / plan 已冻结且后续 worker 可独立执行。
- live provider request gate 已被拆成可验证任务。
- API boundary、secret、redaction、permission、context builder、one-turn model step、stream projection、cancel/retry、request-log strategy、Workbench projection 均有明确测试计划。
- 禁止项在测试和审计中有负证明。
- handoff 明确输出状态：**Live Provider Request / One-Turn Model Step Contract Preview**。
- 不声称 mature model loop、L5 Agent 完成、AI 大升级完成或 production-ready。

## 15. Spec 自审

- P10 明确允许进入真实 provider request / live streaming，但只允许在安全闸门后进行。
- P10 把 prompt construction、context builder、model step、stream projection、provider adapter、settings migration、request log、session persistence 拆成有先后依赖的阶段。
- P10 保持 Agent runtime 通用；OI 是 workspace / skill 特化，不污染 provider/model/runtime contract。
- P10 不开放 write、patch apply、execute/code runner、Cookie-backed reader、旧 AiSidebar 迁移。
- Codex 参考限定为架构边界与工程分层，不复制具体实现。
