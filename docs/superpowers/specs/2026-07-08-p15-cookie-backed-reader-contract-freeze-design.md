# P15 Cookie-backed Reader Contract Freeze Design

Date: 2026-07-08
Status: review-ready
Scope: AI Agent Workbench upgrade / P15 Cookie-backed reader contract freeze

## 1. Document Purpose

This document freezes the P15 phase boundary. P15 follows HEAD `8e34519 docs: record p14 runner workflow handoff`, whose output state is **Execute / Code Runner Contract Preview**. P15 may define the Cookie-backed reader contract, source boundary, permission/read model, redaction/audit rules, mock/fixture projection and Workbench read-only projection plan, but it remains a preview-only contract. It does not implement real Cookie reading, browser Cookie extraction, Cookie storage, third-party provider/search Cookie forwarding, a real network reader, DB/FS durable storage, migration execution, patch/write/delete/rollback/execute/code runner/stress tester behavior, old AiSidebar migration, raw payload retention, production-ready autonomous Agent behavior or AI 大升级完成.

P15 output state: **Cookie-backed Reader Contract Preview**.

The goal is to make later workers able to answer, from this spec and the paired implementation plan, how a Cookie-backed read request is represented, which source boundaries are allowed, how permission and consent are modeled, how private data is redacted before evidence or audit projection, how mock/fixture reader output is shaped, how Workbench can display read-only status, and which API/Tauri boundaries remain no-op until a later safety spec approves true Cookie-backed reading.

P15 inherits these required facts:

- `AGENTS.md`
- `docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md`
- `docs/agent-workbench/handoff-p4.md` including P10, P11, P12, P13 and P14 handoff sections
- `docs/superpowers/specs/2026-07-07-p10-model-loop-live-provider-request-freeze-design.md`
- `docs/superpowers/specs/2026-07-07-p11-multi-step-model-loop-tool-continuation-freeze-design.md`
- `docs/superpowers/specs/2026-07-07-p12-durable-session-request-log-freeze-design.md`
- `docs/superpowers/specs/2026-07-08-p13-patch-write-workflow-contract-freeze-design.md`
- `docs/superpowers/specs/2026-07-08-p14-execute-code-runner-contract-freeze-design.md`
- `docs/superpowers/plans/2026-07-08-p14-execute-code-runner-contract.md`

If a later worker only has this document, it must restore those sources before implementation.

## 2. Phase Identity

Phase name: **P15 Cookie-backed Reader Contract Freeze**

Input state: **Execute / Code Runner Contract Preview**

Target output state: **Cookie-backed Reader Contract Preview**

P15 advances these layers only:

- Runtime contract layer: typed Cookie-backed reader request, source refs, source capability status, mock observation and event taxonomy.
- Source boundary layer: domain/source classification, explicit user-consent metadata and unsupported-source reasons.
- Permission/read model layer: read request, review requirement, approval decision, blocked reason and read-only Workbench projection.
- Redaction/audit layer: safe summaries that exclude Cookie, Authorization, API key, session token, private note content, raw provider payload and raw tool output.
- No-provider-leak layer: rules proving Cookie-derived data and sensitive headers cannot enter model provider payloads, third-party search payloads, request logs, evidence payloads, Workbench raw view or durable storage.
- Mock/fixture projection layer: deterministic fixture-only read output for tests and Workbench previews.
- API/Tauri boundary layer: remains no-op/gated unless a later approved phase freezes true browser/session/Cookie access and storage handling.

Runtime owns the reader contract, permission inputs, redaction policy and event taxonomy. Workbench consumes read-only projections. API/Tauri performs no Cookie access in P15 preview.

OI remains a profile/evidence/workspace specialization. Luogu can be one motivating source profile, but P15 must not turn the core reader contract into a Luogu-only protocol.

## 3. Relationship To P10, P11, P12, P13 And P14

P10 froze one-turn live provider request boundaries. It did not approve Cookie-backed reader behavior, third-party Cookie forwarding, durable storage or mature autonomous Agent behavior.

P11 froze bounded multi-step continuation and tool-call intent handling. It explicitly kept real patch/write/delete/rollback/execute/Cookie/storage unavailable or reserved.

P12 froze durable session, request-log and replay persistence contracts. It explicitly kept true DB/FS writes, real migrations, patch/write/delete/rollback/execute and Cookie-backed reader unavailable.

P13 froze patch/write workflow as proposal, diff, permission, approval, dry-run and rollback metadata. It explicitly kept true patch apply, write mutation, delete, rollback execution, execute/code runner and Cookie-backed reader unavailable.

P14 froze execute / code runner workflow as request, classification, sandbox, mock result, bounded observation and read-only projection. It explicitly kept true process execution, code runner, stress tester, mutation, Cookie-backed reader, DB/FS storage and raw payload retention unavailable.

P15 freezes only the next contract for Cookie-backed reader planning:

- model/tool output may propose a reader request intent, not read a browser session
- runtime normalizes and classifies the request
- runtime maps the request to permission, consent and redaction read models
- runtime can project fixture-only mock reader output
- Workbench displays source boundary, permission status, redaction status and fixture observation as read-only projection
- audit events record safe metadata only
- API/Tauri remains no-op for true Cookie access

P15 does not infer from P10-P14 that true Cookie-backed reading is approved.

## 4. Reader Request Envelope

P15 must define a typed request envelope before any future reader can access authenticated sources:

```text
readerRequestId
sessionId
turnId
stepId
sourceKind
sourceEventIds
sourceRefs
workspaceRefs
evidenceRefs
requestedUrlRef
sourceBoundary
permissionRequest
approvalDecision
redactionPolicy
mockProjection
auditSummary
capabilityStatus
createdAt
schemaVersion
outputState
```

Required rules:

- `sourceKind` can be `user-request`, `model-output`, `tool-observation`, `fixture`, `manual-import` or `replay-preview`.
- `capabilityStatus` must be `preview`, `reserved`, `unavailable`, `denied` or `blocked`.
- `outputState` must be `Cookie-backed Reader Contract Preview`.
- A request can be accepted as a contract artifact while still impossible to execute in P15.
- Request helpers must not include real Cookie, browser Cookie, Cookie storage, third-party Cookie forwarding, real network fetch, database storage, filesystem durable storage, migration execution, `writeFile`, `removeFile`, `unlink`, `applyPatch(`, `spawn(`, `child_process`, `exec(`, execute runner, code runner or stress tester behavior.

## 5. Source Boundary

P15 source refs must be explicit:

```text
sourceRefId
sourceProfile
displayOrigin
domainPolicy
authMaterialPolicy
networkPolicy
cookiePolicy
privateContentPolicy
fixturePolicy
consentStatus
blockedReasons
```

Rules:

- `sourceProfile` can be `luogu`, `workspace-fixture`, `manual-fixture`, `replay-fixture`, `unsupported` or `reserved-future-source`.
- `displayOrigin` is for display only and must not become a fetch target.
- `authMaterialPolicy` must be `not-present`, `redacted-ref-only`, `blocked`, `unsupported` or `reserved-future-user-consent`.
- `cookiePolicy` must be `not-read`, `fixture-only`, `blocked`, `unsupported` or `reserved-future-safe-reader`.
- `networkPolicy` defaults to `none` in P15.
- Real Cookie or browser Cookie access is blocked unless a future safety spec explicitly approves a real reader.
- Private note content is not reader input unless represented by an opaque ref that is already authorized by an earlier phase.

## 6. Permission And Read Model

P15 permission/read model must represent:

- the requested source profile and display origin
- whether the request is fixture-only, blocked, denied, unavailable or reserved
- the reason human review would be required in a future phase
- whether any sensitive input was requested
- whether redaction policy removed sensitive data before projection
- whether Workbench can show a read-only summary

No P15 status may mean true authenticated reading is available. `preview` means contract/read-model/mock planning exists. `reserved` means a future action name is recognized but unavailable. `denied` and `blocked` must include safe reasons.

## 7. Redaction And Audit Contract

P15 must enforce these redaction and audit rules:

- Cookie, Authorization, API key, session token and private note content must not enter model provider payloads.
- Cookie, Authorization, API key, session token and private note content must not enter third-party search payloads.
- Cookie, Authorization, API key, session token and private note content must not enter request logs.
- Cookie, Authorization, API key, session token and private note content must not enter evidence payloads.
- Cookie, Authorization, API key, session token and private note content must not enter Workbench raw views.
- Cookie, Authorization, API key, session token and private note content must not enter durable storage.
- Raw provider payload and raw tool output are not retained by P15.

Allowed audit fields are safe metadata only:

```text
readerRequestId
sourceProfile
displayOrigin
capabilityStatus
permissionStatus
redactionStatus
blockedReasons
fixtureId
schemaVersion
createdAt
```

Audit summaries may say that sensitive data was requested and removed. They must not preserve the sensitive value.

## 8. Mock / Fixture Projection

P15 may define fixture-only projection for tests and Workbench previews:

- fixture id
- source profile
- display origin
- safe title
- safe excerpt
- sanitized evidence refs
- redaction markers
- blocked/unavailable reasons
- schema version

Fixture projection must be deterministic. It must not fetch URLs, read browser state, read Cookie storage, call a model provider, call third-party search, read real `notes/**`, write files, apply patches, execute commands or persist data.

## 9. Workbench Read-only Projection

Workbench may display:

- output state **Cookie-backed Reader Contract Preview**
- source profile and display origin
- capability status
- permission/consent status
- redaction status
- fixture-only observation summary
- blocked/unavailable reasons
- next-step warning that true Cookie-backed reader requires a later safety spec and user decision

Workbench must not display raw Cookie, Authorization, API key, session token, private note content, raw provider payload, raw tool output or a raw authenticated page body. It must not include buttons that read browser Cookie, extract Cookie storage, call third-party search with Cookie, run a real network reader, write files, apply patches, delete, rollback, execute runner, code runner or stress tester behavior.

## 10. API / Tauri Boundary

P15 should prefer no production API/Tauri changes if the contract can stay fully runtime/read-model/mock-fixture only. If a later implementation worker believes a type-only unavailable wrapper is necessary, the worker must first prove it does not read Cookie, does not read browser state, does not forward Authorization or Cookie, does not persist raw payloads, and does not bypass `src/lib/api.ts`.

P15 does not add Tauri commands, browser extraction code, storage adapters, migrations, provider transport changes, third-party search changes, process execution, code runner or stress tester code.

## 11. Explicit Non-goals

P15 forbids:

- production-ready autonomous Agent claims.
- AI 大升级完成, L5 Agent 完成 or Codex-style runtime 完成 claims.
- `ready: true` or `isReady: true` capability claims for Cookie-backed reading.
- real Cookie reading.
- browser Cookie extraction.
- Cookie storage.
- third-party provider/search Cookie forwarding.
- real network reader implementation.
- DB/FS durable storage or migration execution.
- patch/write/delete/rollback/execute/code runner/stress tester behavior.
- old AiSidebar migration.
- raw payload retention.
- placing Cookie, Authorization, API key, session token or private note content into model provider, third-party search, request log, evidence payload, Workbench raw view or durable storage.

If a later phase wants true Cookie-backed reader behavior, it must start with a separate approved safety spec and explicit user decision covering browser/session source, consent, domain allowlist, storage, retention, redaction, audit, provider/search isolation, migration and rollback policy.

## 12. Acceptance Criteria

The P15 implementation plan must split work into small tasks covering:

- spec/contract types
- permission/source boundary
- redaction/audit policy
- mock/fixture projection
- Workbench read-only projection
- API/Tauri no-op boundary audit
- handoff
- supervisor acceptance

Each task must list allowed files, forbidden files, RED evidence, GREEN evidence, boundary audit command, exact-path staging and commit message. The plan must default to no real Cookie implementation.

This docs-only worker is accepted when:

- the spec and implementation plan exist at the requested paths
- content self-check finds P15, P14 and the output state wording
- forbidden capability audit hits are negative statements only
- only the two requested docs are staged and committed
- no push occurs
