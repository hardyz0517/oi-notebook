# P14 Execute / Code Runner Contract Freeze Design

Date: 2026-07-08
Status: review-ready
Scope: AI Agent Workbench upgrade / P14 execute and code runner contract freeze

## 1. Document Purpose

This document freezes the P14 phase boundary. P14 follows HEAD `88419df docs: record p13 patch workflow handoff`, whose output state is **Patch / Write Workflow Contract Preview**. P14 may define the execute / code runner contract, but it remains a preview-only contract. It does not run commands, start processes, implement a code runner, implement a stress tester, apply patches, write files, delete files, run rollback, read Cookie-backed pages, write durable storage, execute migrations, migrate the old AiSidebar, or claim a production autonomous Agent.

P14 output state: **Execute / Code Runner Contract Preview**.

The goal is to make later workers able to answer, from this spec and the paired implementation plan, how an Agent execution request is represented, how target refs and runner capabilities are classified, how sandbox policy metadata is planned, how permission and approval read models work, how command / language / test-run categories are classified without execution, how mock runner results are shaped, how observations are redacted and bounded, and what rollback / cleanup / recovery metadata must exist before any future true execution phase.

P14 inherits these required facts:

- `docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md`
- `docs/agent-workbench/handoff-p4.md` including P10, P11, P12 and P13 handoff sections
- `docs/superpowers/specs/2026-07-07-p10-model-loop-live-provider-request-freeze-design.md`
- `docs/superpowers/specs/2026-07-07-p11-multi-step-model-loop-tool-continuation-freeze-design.md`
- `docs/superpowers/plans/2026-07-07-p11-multi-step-model-loop-tool-continuation.md`
- `docs/superpowers/specs/2026-07-07-p12-durable-session-request-log-freeze-design.md`
- `docs/superpowers/plans/2026-07-07-p12-durable-session-request-log.md`
- `docs/superpowers/specs/2026-07-08-p13-patch-write-workflow-contract-freeze-design.md`
- `docs/superpowers/plans/2026-07-08-p13-patch-write-workflow-contract.md`

If a later worker only has this document, it must restore those sources before implementation.

## 2. Phase Identity

Phase name: **P14 Execute / Code Runner Contract Freeze**

Input state: **Patch / Write Workflow Contract Preview**

Target output state: **Execute / Code Runner Contract Preview**

P14 advances these layers:

- Runtime protocol layer: defines execution request envelope, runner classification, mock result, observation and audit event contracts.
- Permission layer: defines execute, network, write-adjacent, sandbox and destructive decision inputs without enabling true execution.
- Sandbox policy layer: defines planned sandbox profile metadata, resource limits and blocked reasons without creating a sandbox runtime.
- Redaction layer: defines safe input, output and observation summaries that exclude secrets, Cookies, raw provider payloads, raw tool output and unauthorized local-note content.
- Workbench read-model layer: displays execution requests, classification, sandbox plan, permission decisions and mock results as read-only projections.
- API/Tauri boundary layer: remains no-op/gated unless a later approved phase freezes a safe command boundary.

Runtime owns runner policy, classification, permission request shape and event taxonomy. Workbench consumes read-only projections. API/Tauri performs no execution in P14 preview.

OI remains a profile/evidence/workspace specialization. P14 must not turn the core Agent runner contract into an OI-only contract. Problem statements, sample inputs, code snippets, stress-test plans and solution evidence can provide execution context through refs; they do not own the generic execute / runner protocol.

## 3. Relationship To P10, P11, P12 And P13

P10 froze provider/model and one-turn live request boundaries. It did not approve execute / code runner, Cookie-backed reader, patch apply, durable storage or mature autonomous Agent behavior.

P11 froze bounded multi-step continuation and tool-call intent handling. It explicitly kept real patch/write/delete/rollback/execute/Cookie/storage unavailable or reserved.

P12 froze durable session, request-log and replay persistence contracts. It explicitly kept true DB/FS writes, real migrations, patch/write/delete/rollback/execute and Cookie-backed reader unavailable.

P13 froze patch/write workflow as proposal, diff, permission, approval, dry-run and rollback metadata. It explicitly kept true patch apply, write mutation, delete, rollback execution and execute / code runner unavailable.

P14 freezes only the next contract for execution and runner planning:

- model/tool output may produce an execution request intent, not a process invocation
- runtime normalizes and classifies the request
- runtime plans sandbox metadata and resource limits
- runtime maps the request to permission and approval read models
- runtime can produce mock / simulation / dry-run result shapes
- Workbench displays the request, policy, sandbox plan and observation as read-only projection
- audit events record request and mock lifecycle
- rollback, cleanup and recovery metadata is required before any future true execution phase

P14 does not infer from P10-P13 that true execution is approved.

## 4. Codex Upstream Provenance

P14 uses the same Codex upstream reference lineage used by P10-P13:

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

The reference is architectural only. P14 borrows these principles:

- protocol, session, event and UI projection are separate boundaries
- execution policy is independent from model output and tool routing
- approval, sandbox policy, resource limits and redaction must be explicit before execution
- observations must be bounded and safe before entering continuation, replay or Workbench projection
- UI does not own runner decisions or local process behavior

P14 does not copy Codex product boundaries, CLI assumptions, shell permissions, repository-centric defaults, concrete Rust module structure or sandbox implementation details.

## 5. Execution Request Envelope

P14 must define a typed execution request envelope before any future runner can execute:

```text
executionRequestId
sessionId
turnId
stepId
sourceKind
sourceEventIds
workspaceRefs
evidenceRefs
targetRefs
runnerKind
runnerIntent
classification
requestedInputs
expectedOutputs
sandboxPlan
resourceLimits
permissionRequest
approvalDecision
mockResult
observationPolicy
rollbackCleanupPlan
redactionResult
createdAt
schemaVersion
capabilityStatus
```

Required rules:

- `sourceKind` can be `model-output`, `tool-observation`, `user-request`, `fixture`, `manual-import` or `replay-preview`.
- `runnerKind` can be `shell-command`, `language-runtime`, `test-run`, `compile-run`, `stress-test`, `formatter`, `linter`, `unsupported` or `reserved`.
- `runnerIntent` is a structured summary, not a raw shell string passed to a process.
- `targetRefs` point to opaque workspace, generated artifact, scratch fixture or note refs, not raw mutation handles.
- `capabilityStatus` must be `preview`, `reserved`, `unavailable`, `denied` or `blocked`.
- A request can be accepted as a contract artifact while still being impossible to execute in P14.

P14 does not permit `spawn(`, `exec(`, `child_process`, `Command`, `writeFile`, `removeFile`, `unlink`, `applyPatch(` or direct Tauri invocation from request helpers.

## 6. Target Refs

P14 target refs must be explicit:

```text
targetRefId
targetKind
displayPath
workspaceId
languageId
contentHashBefore
inputRefs
expectedOutputRefs
permissionScope
pathSafetyStatus
notesPolicy
networkPolicy
```

Rules:

- `targetKind` can be `workspace-file`, `generated-artifact`, `scratch-fixture`, `note-ref`, `stdin-fixture`, `expected-output-fixture` or `unsupported`.
- `displayPath` is for display only and must not be used as a process path.
- `contentHashBefore` is required for stale-preview detection when a target file is involved.
- `pathSafetyStatus` can be `safe-preview`, `requires-review`, `blocked`, `unsupported` or `unknown`.
- `notesPolicy` must be `not-read`, `fixture-only`, `ref-only`, `blocked` or `explicitly-approved-future-phase`.
- `networkPolicy` defaults to `none`.
- Real `notes/**` content must not be read or modified for routine P14 work.

P14 must preserve the project rule that frontend-to-Rust calls go through `src/lib/api.ts` and that the Tauri notes path-safety layers are not simplified.

## 7. Runner Capability Status

P14 runner capability status must use the following vocabulary:

- `preview`: contract/read-model/mock planning exists, no true execution.
- `reserved`: a future true execution event or action name is recognized but unavailable in P14.
- `unavailable`: the capability is not implemented or not exposed in this phase.
- `denied`: policy denies the request.
- `blocked`: the request is structurally unsafe or outside phase boundary.

Rules:

- `preview` can only describe request classification, sandbox plan metadata, permission read models, mock results and read-only Workbench projection.
- `reserved` can describe future true execution events, but those events must not be successful in P14 preview.
- `denied` and `blocked` must include safe reasons.
- No status in P14 can mean true process execution is available.

## 8. Sandbox Profile / Runner Policy Metadata

P14 freezes sandbox metadata only:

```text
sandboxPlanId
profile
workingDirectoryRef
allowedTargetRefs
networkAccess
secretAccess
cookieAccess
writeAccess
maxFilesTouched
timeoutMs
maxOutputBytes
maxInputBytes
environmentPolicy
cleanupPolicy
blockedReasons
createdAt
```

Allowed profiles:

- `preview-no-op`
- `mock-runner`
- `read-only-classification`
- `fixture-simulation`
- `reserved-future-sandbox`
- `blocked`

Resource defaults:

- no network by default
- no Cookie
- no secret exposure
- no write access
- no patch apply
- no delete or rollback
- timeout must be bounded even for mock plans
- output bytes must be bounded and redacted
- max files touched must be `0` in P14 preview unless a fixture simulation explicitly counts planned refs without touching them

P14 does not create a sandbox runtime. A sandbox plan is metadata for audit, policy and Workbench display only.

## 9. Permission Request And Approval Decision Read Model

Execution requests must map to permission requests:

```text
permissionRequestId
executionRequestId
permissionKind
decisionStatus
riskLevel
reason
requestedByEventId
targetRefs
sandboxPlanId
approvalSurface
expiresAt
createdAt
```

P14 permission kinds:

- `execute`
- `public-network`
- `write`
- `patch-apply`
- `delete`
- `rollback`
- `destructive`

Allowed P14 decision statuses:

- `prompt-required`
- `denied`
- `blocked-by-configuration`
- `unavailable`
- `reserved`

P14 does not auto-allow execution or mutation. Any approval UI is a read-only projection of the requested decision, not a runner trigger.

Approval decision read model:

```text
approvalDecisionId
permissionRequestId
executionRequestId
status
decidedBy
safeReason
visibleConsequences
blockedCapabilities
eventIds
createdAt
```

Statuses:

- `pending`
- `approved-for-future-execute`
- `denied`
- `blocked`
- `expired`
- `unavailable`

`approved-for-future-execute` is metadata only. It means the request can be handed to a later approved phase; it does not execute in P14.

## 10. Classification Without Execution

P14 may classify requests without running them:

```text
classificationId
executionRequestId
commandClass
languageClass
testRunClass
riskLevel
riskReasons
requiresHumanApproval
requiresSandbox
requiresNetwork
requiresSecrets
requiresWritableWorkspace
blockedReasons
createdAt
```

`commandClass` can be `read-only-inspection`, `build`, `test`, `compile`, `format`, `lint`, `stress-test`, `networked`, `mutating`, `destructive`, `unknown` or `unsupported`.

`languageClass` can be `cpp`, `python`, `javascript`, `typescript`, `rust`, `shell`, `markdown`, `text`, `unknown` or `unsupported`.

`testRunClass` can be `unit-test`, `sample-test`, `compile-check`, `stress-test`, `benchmark`, `lint-check`, `format-check`, `not-a-test` or `unsupported`.

Baseline classification:

- `low`: fixture-only classification, no run, no network, no writes.
- `medium`: read-only compile/test plan over explicit scratch fixtures, still no run in P14.
- `high`: real workspace target, generated code target, multi-file plan, unknown working directory, or any request that would need sandbox execution.
- `blocked`: network, Cookie, secret access, direct filesystem mutation, delete, rollback execution, patch apply, direct Tauri bypass, real `notes/**` access, unbounded output, missing cleanup plan or requested true execution.

P14 preview may compute this classification, but must not execute blocked or high-risk operations.

## 11. Input / Output Redaction And Bounded Observation

P14 must redact or drop:

- API key
- Authorization header
- Cookie
- secret-like tokens
- raw provider request payload
- raw provider response payload
- raw tool output
- real `notes/**` content
- unauthorized local-note content
- browser storage dumps
- unbounded stdout / stderr
- unbounded file content

Observation shape:

```text
observationId
executionRequestId
mockResultId
sourceEventIds
status
safeSummary
boundedStdout
boundedStderr
exitCodePreview
redactionStatus
droppedFields
truncated
maxOutputBytes
continuationVisibility
createdAt
```

Rules:

- raw runner output must not enter continuation, durable replay or Workbench projection.
- stdout and stderr are bounded independently.
- secrets, Cookies and raw provider/tool payloads are dropped before observation.
- observations can report `not-run`, `simulated`, `mock-completed`, `mock-failed`, `blocked` or `unavailable`.

## 12. Mock Runner / Dry-Run Result Shape

P14 mock runner result:

```text
mockResultId
executionRequestId
mode
status
plannedRunnerKind
plannedSandboxProfile
safeInputSummary
safeOutputSummary
exitCodePreview
durationMsPreview
filesTouchedPreview
networkAccessPreview
resourceLimitPreview
observationId
safeErrors
createdAt
```

Modes:

- `dry-run`
- `classification-only`
- `fixture-simulation`
- `mock-success`
- `mock-failure`
- `unavailable`
- `blocked`

Statuses:

- `not-run`
- `planned`
- `completed`
- `failed`
- `blocked`
- `unavailable`

Rules:

- `completed` in a P14 mock result means the mock/dry-run completed, not true execution.
- `filesTouchedPreview` is a planned count or fixture count, not actual filesystem mutation.
- `networkAccessPreview` must be `none` unless the request is blocked or reserved for a future phase.
- mock result generation must not invoke real process, filesystem mutation, network, Cookie reader, DB/FS durable write or patch apply.

## 13. Rollback / Cleanup / Recovery Metadata

P14 requires rollback, cleanup and recovery metadata before any future true execution phase:

```text
rollbackCleanupPlanId
executionRequestId
requiredBeforeExecute
preRunContentHashes
affectedTargetRefs
temporaryDirectoryPolicy
artifactRetentionPolicy
cleanupStepsPreview
recoveryStrategy
unavailableReasons
createdAt
```

Rules:

- P14 does not perform cleanup, rollback, deletion or artifact retention.
- Missing cleanup / recovery metadata must raise risk and block future true execution.
- Temporary directory and artifact paths are refs or display labels only.
- Recovery text must be safe and redacted.

## 14. Audit Event Taxonomy

P14 event taxonomy:

```text
runner.requested
runner.classified
runner.permission.required
runner.permission.resolved
runner.sandbox.planned
runner.mock.started
runner.mock.completed
runner.mock.failed
runner.observation.added
runner.blocked
runner.unavailable
```

Reserved true execution events that must not be emitted as successful P14 actions:

```text
runner.started
runner.completed
runner.failed
runner.cancelled
command.executed
process.started
process.completed
test-run.executed
stress-test.executed
artifact.written
cleanup.executed
rollback.executed
```

If such events appear in fixtures, tests or prior protocol literals, they must be marked `reserved`, `unavailable`, `denied` or `blocked`, never as completed product capability.

## 15. Workbench Read-Only Projection

Workbench may display:

- execution request list and detail
- target refs
- runner classification
- sandbox plan metadata
- resource limits
- permission request and approval decision read model
- mock runner / dry-run result
- bounded observation summary
- rollback / cleanup / recovery metadata
- audit timeline
- output state **Execute / Code Runner Contract Preview**

Workbench must not:

- run commands
- start processes
- execute code
- run tests
- run stress tests
- apply patch
- write file
- delete file
- execute rollback
- invoke Tauri execution or mutation
- read Cookie-backed pages
- read or modify real `notes/**`
- show raw provider payloads, raw tool output, API keys, Authorization headers or Cookies
- present P14 as production-ready, AI upgrade completion, L5 Agent completion or Codex-style runtime completion

## 16. API / Tauri Boundary

P14 API/Tauri boundary stays no-op/gated. The only acceptable API/Tauri work in a later P14 implementation task is an audit or unavailable/no-op contract shape that returns `unavailable`, `reserved`, `denied` or `blocked`.

Rules:

- frontend-to-Rust calls must go through `src/lib/api.ts`.
- React / Workbench must not import Tauri core or call invoke directly.
- no Rust command may be added to spawn a process, run code, write files, apply patches, delete, rollback, read Cookie-backed pages, write durable storage or execute migrations in P14.
- if a future phase wants true execution, it must first freeze a safe command boundary, sandbox implementation, path safety, resource enforcement, cleanup, rollback and recovery proof.

## 17. File And Module Boundaries

Future P14 implementation workers may modify, only when the paired plan explicitly opens the task:

```text
src/lib/agent-runtime/**
src/lib/agent-workbench/**
src/components/agent-workbench/**
docs/agent-workbench/handoff-p4.md
```

Only a later API/Tauri no-op boundary audit task may narrowly inspect or modify:

```text
src/lib/api.ts
src/lib/apiContract.ts
src-tauri/src/**
```

That task must remain no-op/gated unless a later approved phase freezes a safe command boundary.

P14 docs-only worker may modify only:

```text
docs/superpowers/specs/2026-07-08-p14-execute-code-runner-contract-freeze-design.md
docs/superpowers/plans/2026-07-08-p14-execute-code-runner-contract.md
```

P14 must not modify:

```text
notes/**
src/**
src-tauri/**
package.json
pnpm-lock.yaml
vite.config.*
tsconfig*.json
local-blog/**
docs/agent-workbench/handoff-p4.md
```

The docs-only worker for this turn must not modify `docs/agent-workbench/handoff-p4.md`; handoff is reserved for implementation closeout.

## 18. Explicitly Forbidden Work

P14 explicitly forbids:

- real process spawn / command execution
- code runner / stress tester implementation
- patch apply, write, delete or rollback mutation
- Cookie-backed reader implementation
- database storage and filesystem durable writes
- migration execution
- raw provider payload, raw tool output or secret retention
- old AiSidebar migration
- direct Tauri invoke outside `src/lib/api.ts`
- reading or modifying real `notes/**`
- production-ready autonomous Agent, AI upgrade completion, L5 Agent completion or Codex-style runtime completion claims

These terms can appear in tests, specs, plans and audit explanations only as forbidden, unavailable, reserved, denied, blocked or no-op boundary language.

## 19. Acceptance Path

Implementation closeout for P14 must prove:

- execution request envelope and target refs are typed and validated
- runner capability status uses `preview`, `reserved`, `unavailable`, `denied` and `blocked`
- sandbox profile / runner policy metadata is planned without execution
- permission request and approval decision read models exist
- command / language / test-run classification is deterministic and no-run
- input/output redaction and bounded observations exist
- resource limits cover timeout, max output bytes, max files touched, no network by default, no Cookie and no secret exposure
- mock runner / dry-run result shape exists and cannot imply true execution
- audit event taxonomy records request, classification, permission, sandbox plan, mock lifecycle, observation, blocked and unavailable states
- reserved true execution events are never successful in P14 preview
- rollback / cleanup / recovery metadata exists before future execution
- Workbench is read-only
- API/Tauri remains no-op/gated
- no real process execution, code runner, stress tester, patch/write/delete/rollback mutation, Cookie-backed reader, DB/FS durable storage, migration execution or AiSidebar migration was introduced
- `notes/**` was not touched

## 20. Required Audit Checks

Every P14 worker starts with:

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -12 --decorate
```

Docs-only acceptance for this worker:

```powershell
rg -n 'P14|Execute / Code Runner Contract Preview|execute|runner|sandbox|mock runner|P13|Patch / Write Workflow Contract Preview' docs/superpowers/specs/2026-07-08-p14-execute-code-runner-contract-freeze-design.md docs/superpowers/plans/2026-07-08-p14-execute-code-runner-contract.md
$placeholderPattern = ('TO' + 'DO|TB' + 'D|待' + '补|以' + '后再补|占' + '位')
rg -n $placeholderPattern docs/superpowers/specs/2026-07-08-p14-execute-code-runner-contract-freeze-design.md docs/superpowers/plans/2026-07-08-p14-execute-code-runner-contract.md
rg -n 'production-ready|AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|ready: true|isReady: true|spawn\(|Command|child_process|exec\(|writeFile|removeFile|unlink|applyPatch\(|patch apply|Cookie-backed reader implementation|database storage|filesystem durable' docs/superpowers/specs/2026-07-08-p14-execute-code-runner-contract-freeze-design.md docs/superpowers/plans/2026-07-08-p14-execute-code-runner-contract.md
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

Expected:

- First `rg` has hits.
- Placeholder audit has no hits.
- Capability audit hits only forbidden/non-goal/reserved/no-op language and no implementation authorization.
- Filtered status contains only the two new docs before staging.
- Staged paths are empty before staging.

## 21. Exit Criteria

P14 docs-only freeze is complete when:

- this spec and the paired plan are written
- both documents name **Execute / Code Runner Contract Preview**
- both documents reference P13 and **Patch / Write Workflow Contract Preview**
- forbidden capabilities are explicitly blocked
- future implementation tasks include allowed files, forbidden files, RED commands, GREEN commands, boundary audits, exact-path staging and commit messages
- docs-only acceptance commands are run
- exact-path staging contains only the two P14 docs
- commit message is `docs: define p14 execute runner contract`
- push status is explicitly reported as no

## 22. Spec Self-Review

- P14 is scoped to execute / code runner contract preview and does not implement execution.
- P14 extends P10/P11/P12/P13 through request, classification, sandbox plan, permission, mock result, observation and cleanup metadata only.
- Runtime owns runner policy and event taxonomy; Workbench consumes read-only projections; API/Tauri remains gated/no-op in P14 preview.
- OI specialization is preserved through refs and profile metadata without polluting the generic Agent runner contract.
- Forbidden capabilities are named as unavailable, denied, reserved or blocked and are not claimed as implemented.
