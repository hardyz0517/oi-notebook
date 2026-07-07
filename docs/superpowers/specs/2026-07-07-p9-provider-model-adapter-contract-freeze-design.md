# P9 Provider / Model Adapter Contract Freeze Design

Date: 2026-07-07
Status: review-ready
Scope: AI Agent Workbench upgrade / P9 Provider and Model Adapter contract freeze

## 1. Document Purpose

This document freezes the P9 boundary for provider and model adapter work after P8. P9 does not connect a real model, does not stream, does not build prompts, does not choose a live provider, and does not make network requests. It defines the mature contract shape that later implementation slices must satisfy before any real provider behavior is allowed.

P9 inherits the following source of truth:

- `docs/NoteX_Agent_Workbench_PRD.md`
- `docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md`
- `docs/superpowers/specs/2026-07-05-p5-agent-core-contract-freeze-design.md`
- `docs/superpowers/specs/2026-07-05-p6-tool-permission-contract-freeze-design.md`
- `docs/superpowers/specs/2026-07-06-p7-oi-research-solution-skill-contract-freeze-design.md`
- `docs/superpowers/specs/2026-07-06-p8-agent-session-replay-contract-freeze-design.md`
- `docs/superpowers/plans/2026-07-06-p8-agent-session-replay-contract.md`
- `docs/agent-workbench/handoff-p4.md`

If a later worker only has this document after context compaction, it must restore the listed documents before touching code.

## 2. Phase Identity

Phase name: **P9 Provider / Model Adapter Contract Freeze**

Input state: **Agent Session/Replay Contract Preview**

Output state: **Provider/Model Adapter Contract Preview**

P9 advances the Provider layer in the long-term Agent Workbench architecture. It freezes request envelopes, adapter interfaces, stream event contracts, error taxonomy, capability matrix, mock fixture rules, redaction policy, permission policy hooks, read-model projection, and negative proofs.

P9 is still a preview contract phase. It is not the AI upgrade completion, not a mature runtime, not a live model loop, and not evidence that any provider can be called from the Workbench.

## 3. Product Direction

The Agent Workbench must remain a general-purpose local desktop agent architecture with strong OI domain support. OI is a first-class domain skill/profile, not the only shape of the system. Provider/model adapter contracts must serve general tasks such as reading notes, explaining code, organizing evidence, drafting text, and producing auditable changes, while allowing OI tasks to attach problem/workspace/evidence context through profiles.

P9 therefore separates:

- protocol: cross-layer typed messages and events
- session: session id, turn id, replay trace, privacy policy, and capability state
- runtime: the owner of decisions, cancellation, retry, permission, and adapter lifecycle
- provider adapter: vendor/API-shape integration boundary
- model request: normalized request envelope and model capability assumptions
- stream event: normalized delta/tool/error/usage/cancel events
- error mapping: provider/network/quota/auth/schema/cancel/safety failures into stable taxonomy
- cancellation: runtime-owned abort signal and terminal event semantics
- rate-limit and retry: policy metadata only in P9, no actual backoff execution
- redaction: secret/cookie/user-note/request-payload visibility rules before model/provider exposure
- permission policy: provider request requires explicit policy result before any later live call
- workspace evidence: request envelopes cite evidence ids and workspace ids, not hidden note contents
- read model: UI consumes provider/model projection only and owns no provider decision

## 4. Codex Architecture Provenance

P9 references the same upstream Codex provenance fixed by P8:

```text
Repository: openai/codex
Reference commit: be33f80bc65159c094ecd06bf155afa3061ce23d
Recorded by P8 docs: 2026-07-06
Primary paths:
codex-rs/protocol/src/protocol.rs
codex-rs/core/src/session/
codex-rs/core/src/state/
codex-rs/core/src/tools/{registry,router,lifecycle}.rs
codex-rs/core/src/exec_policy.rs
codex-rs/core/src/apply_patch.rs
```

P9 does not claim fresh upstream facts beyond that fixed provenance. If a later implementation worker needs refreshed upstream facts, it must record remote URL, branch, HEAD, fetch time, and inspected paths before using those facts.

Architectural principles P9 carries forward:

- protocol/session/event are first-class contracts, not UI state.
- runtime owns decisions; UI consumes events and read models only.
- provider/tool lifecycle is separate from approval, sandbox, patch, and execution policy.
- patch is not "the model said write it"; patch requires grammar, approval, safety evaluation, and apply boundaries in a separate future phase.
- provider/model errors become structured events and read-model statuses; they do not leak raw vendor behavior into UI decisions.

OI Notebook mapping:

- `src/lib/agent-runtime/**` owns provider/model contract types, mock adapter lifecycle, permission/redaction checks, and event normalization.
- `src/lib/agent-workbench/**` owns deterministic read-model projection from provider/model contract fixtures.
- `src/components/agent-workbench/**` displays read-only provider/model status and limitations.
- `src/lib/api.ts` remains the only frontend-to-Rust boundary if a later approved phase reaches Tauri.

## 5. Current Input State

P8 output state is **Agent Session/Replay Contract Preview**. The current architecture can represent deterministic session metadata, event logs, replay fixtures, privacy/redaction policy, workspace/evidence/session linkage, and read-only Workbench replay projection.

P8 explicitly did not open:

- real provider request
- prompt construction
- model loop
- streaming
- write
- patch apply
- execute / code runner
- Cookie-backed reader
- session persistence / storage / request log

P9 must preserve these closures. It can define how provider/model capability will be represented later, but it cannot activate the capability.

## 6. P9 Allowed Work

P9 implementation workers may define mock-only, contract-only TypeScript surfaces:

- provider/model request envelope types
- adapter interface types and deterministic mock adapter implementation
- model capability matrix and model profile descriptors
- normalized provider stream event union
- provider/model error taxonomy and mapping helpers
- cancellation state contract and terminal event rules
- rate-limit/retry policy metadata types
- redaction policy helpers that reject secrets, cookies, real notes, and unapproved request payloads
- permission policy inputs that mark provider request as unavailable or prompt-required in P9
- workspace/evidence request references by id only
- read-only Workbench projection of provider/model adapter status
- negative-proof tests that prove no real network, API key, prompt construction, streaming, write, patch apply, execute, Cookie reader, storage, or request log was introduced

P9 may create mock fixtures that contain only synthetic text, fixed ids, fixed timestamps, and non-secret payloads.

## 7. P9 Forbidden Work

P9 must not approve or implement:

- real provider request
- real streaming
- real prompt construction
- real model loop
- live provider/model selection from user settings
- OpenAI, Anthropic, OpenAI-compatible, local model, or relay network calls
- API key handling, secret storage, secret reading, or request log persistence
- write, patch generation, patch apply, delete, rollback, execute, code runner
- Cookie-backed reader or Cookie-backed capability expansion
- session persistence, storage, resumable request logs, or database state
- legacy `src/components/ai/AiSidebar.tsx` migration
- direct Tauri `invoke()` outside `src/lib/api.ts`
- reading or modifying real `notes/**`

These are future-stage forbidden zones. A later phase must write a new freeze spec and implementation plan before any of them can be reopened.

## 8. Contract Detail

### 8.1 Provider Request Envelope

Minimum fields:

```text
requestId
sessionId
turnId
workspaceId
providerProfileId
modelProfileId
intent
inputParts
toolExposure
evidenceRefs
privacyPolicyId
permissionDecision
capabilitySnapshot
idempotencyKey
createdAt
```

Rules:

- `sessionId` and `turnId` link back to P8 replay.
- `workspaceId` and `evidenceRefs` identify context without embedding real note contents.
- `inputParts` must carry redaction metadata per part.
- `permissionDecision` must be explicit and must not imply a live call in P9.
- `idempotencyKey` is contract metadata only; P9 does not send requests.

### 8.2 Adapter Interface

Minimum interface shape:

```text
adapterId
providerKind
supports(request)
createMockTurn(request, fixture)
mapProviderEvent(rawEvent)
mapProviderError(rawError)
cancel(requestId)
describeCapabilities()
```

P9 mock adapters can return deterministic event arrays from fixtures. They cannot use `fetch`, Tauri commands, SDK clients, environment variables, user settings, or API keys.

### 8.3 Model Capability Matrix

Minimum capability fields:

```text
modelProfileId
providerProfileId
toolCalling
structuredOutput
streaming
longContext
visionInput
codeReasoning
costTier
latencyTier
stabilityTier
contextWindow
maxOutputTokens
limitations
status
reason
```

Allowed statuses:

```text
preview
reserved
unavailable
blocked
degraded
```

In P9, real provider-backed capabilities remain `reserved`, `unavailable`, `blocked`, or `degraded`. Only contract/mock capability projection may be `preview`.

### 8.4 Stream Event Contract

Normalized event types:

```text
provider.request.created
provider.permission.checked
provider.redaction.checked
model.turn.started
model.delta.preview
model.tool-call.requested.preview
model.usage.preview
model.turn.completed.preview
model.turn.failed.preview
model.turn.cancelled.preview
provider.rate-limit.preview
provider.retry.scheduled.preview
```

Rules:

- P9 stream events are fixture events, not live streaming.
- `model.delta.preview` must not reuse P5/P8 reserved `model.delta` as a real event claim.
- tool-call events are request previews only; they do not dispatch tools.
- cancellation creates a deterministic terminal preview event and never aborts a real network request in P9.

### 8.5 Error Taxonomy

Minimum normalized errors:

```text
provider-auth-unavailable
provider-network-unavailable
provider-rate-limited
provider-quota-exhausted
provider-timeout
provider-schema-mismatch
provider-unsupported-capability
provider-cancelled
provider-redaction-blocked
provider-permission-blocked
provider-fixture-invalid
provider-unexpected-event
```

Rules:

- Raw provider errors are not exposed directly to UI.
- Every error has `code`, `message`, `retryable`, `permissionRelated`, `redactionRelated`, and `safeDetail`.
- P9 fixtures must not contain API keys, cookies, Authorization headers, or real user note content.

### 8.6 Redaction And Permission Policy

Before a later real provider request is allowed, the runtime must prove:

- secret and cookie parts are forbidden for model/provider exposure.
- local note content requires an approved future context/storage/privacy phase.
- evidence excerpts must carry source ids and visibility metadata.
- provider request permission must be checked by policy, not by UI.
- request payloads can be projected to UI only through a redacted read model.

P9 may add tests for these rules. P9 may not read real secrets, real cookies, or real notes.

### 8.7 Workbench Read-Only Projection

Workbench may display:

- adapter status: preview / unavailable / blocked / degraded
- provider kind and model profile labels from mock fixtures
- capability matrix statuses and reasons
- request envelope summary with redacted input part counts
- fixture event timeline
- mapped error status
- limitations explaining that no live provider call exists

Workbench must not:

- choose a provider
- build a prompt
- read API keys
- start streaming
- dispatch tools from model output
- call Tauri directly
- show mock fixtures as live model output

## 9. File / Module Boundary

P9 implementation slices may modify only narrow contract/read-model/mock surfaces:

```text
src/lib/agent-runtime/**
src/lib/agent-workbench/**
src/components/agent-workbench/**
docs/superpowers/specs/2026-07-07-p9-provider-model-adapter-contract-freeze-design.md
docs/superpowers/plans/2026-07-07-p9-provider-model-adapter-contract.md
```

P9 implementation slices must not modify:

```text
notes/**
src/components/ai/**
src-tauri/src/ai.rs
src-tauri/src/luogu*.rs
local-blog/**
real provider/network/SDK integration
prompt construction code
real write/patch/execute/code-runner code
storage/privacy persistence surface
request log storage
Cookie-backed reader implementation
package or lock files unless dependency hydration is explicitly approved
```

Docs-only P9 freeze worker may only create the two P9 docs.

## 10. Required Verification And Audits

Every P9 implementation worker must start with:

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -12 --decorate
```

P9 docs worker must run:

```powershell
rg -n 'P9 Provider / Model Adapter|Provider/Model Adapter Contract Preview|Agent Session/Replay Contract Preview' docs/superpowers/specs/2026-07-07-p9-provider-model-adapter-contract-freeze-design.md docs/superpowers/plans/2026-07-07-p9-provider-model-adapter-contract.md
$placeholderPattern = ('TO' + 'DO|TB' + 'D|待' + '补|以' + '后再补|占' + '位')
rg -n $placeholderPattern docs/superpowers/specs/2026-07-07-p9-provider-model-adapter-contract-freeze-design.md docs/superpowers/plans/2026-07-07-p9-provider-model-adapter-contract.md
```

The placeholder audit must be no-hit.

P9 implementation worker must run focused tests and audits for the changed slice, at minimum:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench
node .\node_modules\typescript\bin\tsc --noEmit
rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'
rg -n 'fetch\(|XMLHttpRequest|EventSource|WebSocket|Authorization|apiKey|api_key|OPENAI_API_KEY|ANTHROPIC_API_KEY' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench
rg -n 'chat_with_current_note_stream|prompt construction|request log|session storage|Cookie-backed|patch apply|execute runner' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

Any intentional literal in a negative-proof test must be scoped and explained. A broad audit hit must not be reported as pass without changed-surface analysis.

## 11. Exit Criteria

P9 can end only when:

- provider/model request envelope is typed and tested.
- adapter interface and deterministic mock fixture contract are typed and tested.
- stream event contract is normalized and explicitly preview-only.
- provider/model error taxonomy is typed and tested.
- capability matrix distinguishes preview/reserved/unavailable/blocked/degraded.
- cancellation/rate-limit/retry are represented as contract metadata without live behavior.
- redaction and permission checks reject secrets, cookies, real notes, and unapproved request payloads.
- Workbench projection is read-only and cannot trigger provider decisions.
- negative-proof tests cover no network, no API key, no prompt construction, no live streaming, no write, no patch apply, no execute, no Cookie reader, no storage, and no request log.
- focused tests, typecheck, API boundary audit, provider/network audit, and capability claim audit pass.
- final output state is reported only as **Provider/Model Adapter Contract Preview**.

## 12. Next-Phase Rule

After P9, a new freeze spec is required before any of the following can be discussed or implemented:

- live provider request
- live streaming
- prompt construction
- model loop
- provider settings migration
- API key handling
- request log persistence
- patch workflow
- tool execution runner
- Cookie-backed reader
- session persistence/storage

No later worker may infer that P9 approved those capabilities.

## 13. Spec Self-Review

- No unfinished sections or ambiguous approval language.
- P9 inherits P5/P6/P7/P8 forbidden zones and does not reopen real model/provider behavior.
- P9 output state is explicitly **Provider/Model Adapter Contract Preview**.
- The contract remains general-purpose; OI is supported through domain profiles and workspace/evidence refs rather than hard-wiring the adapter layer to OI.
- Upstream Codex facts are cited only through the P8-fixed provenance, with refresh rules for later workers.
