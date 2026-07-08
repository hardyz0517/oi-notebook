# P13 Patch Write Workflow Contract Freeze Design

Date: 2026-07-08
Status: review-ready
Scope: AI Agent Workbench upgrade / P13 patch and write workflow contract freeze

## 1. Document Purpose

This document freezes the P13 phase boundary. P13 follows HEAD `0af495c docs: record p12 durable session handoff`, whose output state is **Durable Session / Request Log / Replay Persistence Contract Preview**. P13 may define the next contract for patch/write workflow, but it remains a preview-only contract. It does not apply patches, write files, delete files, run rollback, run code, read Cookie-backed pages, write durable storage, execute migrations, migrate the old AiSidebar, or claim a production autonomous Agent.

P13 output state: **Patch / Write Workflow Contract Preview**.

The goal is to make later workers able to answer, from this spec and the paired implementation plan, how an Agent-generated edit becomes a structured proposal, how the proposal is validated, how a read-only diff/dry-run is projected, what permission must be requested, what approval decision read model looks like, what events are emitted, what is redacted, and what rollback-plan metadata must exist before any future implementation may apply real mutations.

P13 inherits these required facts:

- `docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md`
- `docs/agent-workbench/handoff-p4.md` including P10, P11 and P12 handoff sections
- `docs/superpowers/specs/2026-07-07-p10-model-loop-live-provider-request-freeze-design.md`
- `docs/superpowers/specs/2026-07-07-p11-multi-step-model-loop-tool-continuation-freeze-design.md`
- `docs/superpowers/specs/2026-07-07-p12-durable-session-request-log-freeze-design.md`
- `docs/superpowers/plans/2026-07-07-p12-durable-session-request-log.md`

If a later worker only has this document, it must restore those sources before implementation.

## 2. Phase Identity

Phase name: **P13 Patch / Write Workflow Contract Freeze**

Input state: **Durable Session / Request Log / Replay Persistence Contract Preview**

Target output state: **Patch / Write Workflow Contract Preview**

P13 advances these layers:

- Runtime protocol layer: defines proposal, validation, diff preview, approval, dry-run and audit event contracts.
- Permission layer: defines write, patch-apply, delete, rollback and destructive decision inputs without enabling real mutation.
- Redaction layer: defines safe proposal and diff summaries that exclude secrets, Cookies, raw provider payloads, raw tool output and unauthorized local-note content.
- Workbench read-model layer: displays patch proposals, dry-run/validation status, approval decisions and rollback-plan metadata as read-only projections.
- API/Tauri boundary layer: remains gated and does not perform mutation in P13 preview unless a later approved implementation phase freezes a safe command boundary.

Runtime owns proposal validation and event taxonomy. Workbench consumes read-only projections. API/Tauri remains gated and performs no mutation in P13 preview.

OI remains a profile/evidence/workspace specialization. P13 must not turn the core Agent patch workflow into an OI-only contract. Problem statements, code snippets, evidence packets and solution-outline drafts can provide proposal context through refs; they do not own the generic patch/write protocol.

## 3. Relationship To P11 And P12

P11 froze bounded multi-step continuation and tool-call intent handling. It explicitly left real patch, write, delete, rollback, execute and Cookie-backed reader behavior unavailable.

P12 froze durable session, request-log and replay persistence contracts. It explicitly left real DB/FS storage, real migrations, real patch/write/delete/rollback/execute, Cookie-backed reader and raw payload retention unavailable.

P13 builds on those boundaries by defining how a future patch/write workflow should be represented before mutation:

- model/tool output may produce a patch proposal intent, not an applied change
- runtime normalizes and validates the proposal
- runtime classifies risk and required permission
- runtime produces read-only diff preview and dry-run/validation results
- Workbench displays proposal and approval read model
- audit events record the proposal lifecycle
- rollback-plan metadata is required as metadata only

P13 does not infer from P11 or P12 that any mutation is approved.

## 4. Codex Upstream Provenance

P13 uses the same Codex upstream reference lineage used by P10-P12:

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

The reference is architectural only. P13 borrows these principles:

- protocol, session, event and UI projection are separate boundaries
- patch/apply policy is independent from model output and tool routing
- approval, sandbox and exec policy must be explicit before mutation
- patch grammar, validation, transaction, failure and rollback metadata must be modeled before real apply
- UI does not own patch decisions or file writes

P13 does not copy Codex product boundaries, CLI assumptions, shell permissions, repository-centric defaults, or concrete Rust module structure.

## 5. Patch Proposal Envelope

P13 must define a typed proposal envelope before any future patch is applied:

```text
proposalId
sessionId
turnId
stepId
sourceKind
sourceEventIds
workspaceRefs
evidenceRefs
targetRefs
patchFormat
proposalSummary
authoringMode
riskClassification
permissionRequest
validationResult
dryRunResult
rollbackPlan
redactionResult
createdAt
schemaVersion
capabilityStatus
```

Required rules:

- `sourceKind` can be `model-output`, `tool-observation`, `user-draft`, `fixture` or `manual-import`.
- `patchFormat` can be `unified-diff`, `structured-edit`, `whole-file-preview` or `unsupported`.
- `targetRefs` point to opaque file/workspace/note refs, not raw filesystem mutation handles.
- `proposalSummary` is safe text, not raw provider payload.
- `capabilityStatus` must be `preview`, `reserved`, `unavailable`, `denied` or `blocked`.
- A proposal can be accepted as a contract artifact while still being impossible to apply in P13.

P13 does not permit `writeFile`, `removeFile`, `unlink`, `applyPatch(`, command execution or direct Tauri invocation from the proposal helper.

## 6. Target Refs And Path Safety

P13 target refs must be explicit:

```text
targetRefId
targetKind
displayPath
workspaceId
contentHashBefore
lineRange
permissionScope
pathSafetyStatus
notesPolicy
```

Rules:

- `targetKind` can be `workspace-file`, `note-ref`, `generated-artifact`, `scratch-fixture` or `unsupported`.
- `displayPath` is for display only and must not be used as a mutation path.
- `contentHashBefore` is required for stale-preview detection.
- `pathSafetyStatus` can be `safe-preview`, `requires-review`, `blocked`, `unsupported` or `unknown`.
- `notesPolicy` must be `not-read`, `fixture-only`, `ref-only`, `blocked` or `explicitly-approved-future-phase`.
- Real `notes/**` content must not be read or modified for routine P13 work.

P13 must preserve the existing project rule that frontend-to-Rust calls go through `src/lib/api.ts` and that the Tauri notes path-safety layers are not simplified.

## 7. Read-Only Diff Preview

P13 can define read-only diff projection:

```text
diffPreviewId
proposalId
targetRefs
format
filesChanged
insertions
deletions
safeHunks
truncated
redactionStatus
renderWarnings
createdAt
```

Rules:

- Diff preview is derived from proposal text and supplied target refs; it does not write files.
- Large hunks are bounded and summarized.
- Secret-like text, API keys, Authorization headers, Cookies, raw provider payloads, raw tool output and unauthorized local-note content must be dropped or redacted before Workbench projection.
- Preview can report unsupported syntax, invalid target refs, stale content hash, binary file, oversized diff or forbidden path.
- A successful diff preview is not approval to mutate.

## 8. Risk Classification

P13 risk classification must be deterministic:

```text
riskLevel: low | medium | high | blocked
riskReasons[]
permissionKinds[]
requiresHumanApproval
requiresFreshRead
requiresDryRun
requiresRollbackPlan
```

Baseline classification:

- `low`: read-only preview, generated artifact preview or fixture-only change.
- `medium`: single-file patch proposal with safe target ref and small diff.
- `high`: multi-file patch, note target, stale hash, unknown path, generated code, or user-visible data rewrite.
- `blocked`: delete, rollback execution, command execution, Cookie-backed content, raw secret exposure, direct filesystem mutation, direct Tauri bypass, or `notes/**` mutation without explicit future approval.

P13 preview may compute this classification, but must not execute blocked or high-risk operations.

## 9. Permission Request Contract

Patch/write proposals must map to permission requests:

```text
permissionRequestId
proposalId
permissionKind
decisionStatus
riskLevel
reason
requestedByEventId
targetRefs
approvalSurface
expiresAt
createdAt
```

P13 permission kinds:

- `write`
- `patch-apply`
- `delete`
- `rollback`
- `destructive`

Allowed P13 decision statuses:

- `prompt-required`
- `denied`
- `blocked-by-configuration`
- `unavailable`
- `reserved`

P13 does not auto-allow write, patch-apply, delete, rollback or destructive permissions. Any approval UI is a read-only projection of the requested decision, not a mutation trigger.

## 10. Approval Decision Read Model

Workbench can display an approval decision read model:

```text
approvalDecisionId
permissionRequestId
proposalId
status
decidedBy
safeReason
visibleConsequences
blockedCapabilities
eventIds
createdAt
```

P13 statuses:

- `pending`
- `approved-for-future-apply`
- `denied`
- `blocked`
- `expired`
- `unavailable`

`approved-for-future-apply` is metadata only. It means the proposal can be handed to a later approved phase; it does not apply the patch in P13.

## 11. Dry-Run And Validation Result Shape

Validation result:

```text
validationId
proposalId
status
checks[]
safeErrors[]
warnings[]
redactionStatus
createdAt
```

Dry-run result:

```text
dryRunId
proposalId
status
targetCompatibility
wouldChangeFiles
wouldCreateFiles
wouldDeleteFiles
conflicts[]
staleTargets[]
blockedTargets[]
createdAt
```

Statuses:

- `not-run`
- `passed`
- `failed`
- `blocked`
- `unavailable`

P13 dry-run is a pure compatibility projection. It must not write files, create files, delete files, run commands, invoke Tauri mutation, or touch real `notes/**`.

## 12. Rollback-Plan Metadata

P13 requires rollback-plan metadata before any future apply-capable phase:

```text
rollbackPlanId
proposalId
rollbackKind
requiredBeforeApply
preApplyContentHashes
affectedTargetRefs
inversePatchPreviewRef
manualRecoveryNotes
unavailableReasons
createdAt
```

Rules:

- `rollbackKind` can be `inverse-patch-preview`, `content-hash-restore-plan`, `manual-recovery`, `unavailable`.
- P13 does not execute rollback.
- Missing rollback metadata must raise risk and block future apply.
- Rollback plan text must be safe and redacted.

## 13. Audit Event Taxonomy

P13 event taxonomy:

```text
patch.proposal.created
patch.proposal.normalized
patch.proposal.validation.started
patch.proposal.validation.completed
patch.diff.preview.created
patch.risk.classified
patch.permission.requested
patch.permission.resolved
patch.approval.read_model.created
patch.dry_run.started
patch.dry_run.completed
patch.rollback_plan.created
patch.proposal.blocked
patch.proposal.failed
patch.proposal.discarded
```

Reserved events that must not be emitted as successful P13 actions:

```text
patch.applied
file.write.completed
file.delete.completed
rollback.executed
command.executed
```

If such events appear in fixtures, tests or prior protocol literals, they must be marked `reserved`, `unavailable`, `denied` or `blocked`, never as completed product capability.

## 14. Redaction Rules

P13 must redact or drop:

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
- unbounded code or diff content beyond configured preview limits

Workbench may display:

- safe proposal summary
- bounded diff hunks
- target ref display labels
- risk reasons
- permission request status
- validation and dry-run summaries
- rollback-plan metadata
- output state **Patch / Write Workflow Contract Preview**

## 15. Workbench Read-Only Projection

Workbench may display:

- proposal list and detail
- target refs
- read-only diff preview
- risk classification
- permission request and approval decision read model
- validation result
- dry-run result
- rollback-plan metadata
- audit timeline

Workbench must not:

- apply patch
- write file
- delete file
- execute rollback
- run commands
- invoke Tauri mutation
- read Cookie-backed pages
- read or modify real `notes/**`
- show raw provider payloads, raw tool output, API keys, Authorization headers or Cookies
- present P13 as production-ready, AI upgrade completion, L5 Agent completion or Codex-style runtime completion

## 16. File And Module Boundaries

Future P13 implementation workers may modify, only when the paired plan explicitly opens the task:

```text
src/lib/agent-runtime/**
src/lib/agent-workbench/**
src/components/agent-workbench/**
docs/agent-workbench/handoff-p4.md
```

Only a later API/Tauri boundary audit task may narrowly inspect or modify:

```text
src/lib/api.ts
src/lib/apiContract.ts
src-tauri/src/**
```

That task must remain no-op/gated unless a later approved phase freezes a safe command boundary.

P13 docs-only worker may modify only:

```text
docs/superpowers/specs/2026-07-08-p13-patch-write-workflow-contract-freeze-design.md
docs/superpowers/plans/2026-07-08-p13-patch-write-workflow-contract.md
```

P13 must not modify:

```text
notes/**
src/**
src-tauri/**
package.json
pnpm-lock.yaml
vite.config.*
tsconfig*.json
local-blog/**
```

The docs-only worker for this turn must not modify `docs/agent-workbench/handoff-p4.md`; handoff is reserved for implementation closeout.

## 17. Acceptance Path

Implementation closeout for P13 must prove:

- proposal envelope and target refs are typed and validated
- diff preview is read-only and redacted
- risk classification is deterministic
- permission request and approval decision read models exist
- validation and dry-run results are pure projections
- rollback-plan metadata exists and rollback execution remains unavailable
- audit event taxonomy records proposal lifecycle
- Workbench is read-only
- API/Tauri does not mutate files in P13
- no real patch apply, write mutation, delete, rollback, execute/code runner, Cookie-backed reader, DB/FS durable storage, migration execution or AiSidebar migration was introduced
- `notes/**` was not touched

## 18. Required Audit Commands

Every P13 worker starts with:

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -12 --decorate
```

Docs-only acceptance for this worker:

```powershell
rg -n 'P13|Patch / Write Workflow Contract Preview|patch proposal|approval decision|dry-run|rollback-plan|0af495c|P12' docs/superpowers/specs/2026-07-08-p13-patch-write-workflow-contract-freeze-design.md docs/superpowers/plans/2026-07-08-p13-patch-write-workflow-contract.md
$placeholderPattern = ('TO' + 'DO|TB' + 'D|待' + '补|以' + '后再补|占' + '位')
rg -n $placeholderPattern docs/superpowers/specs/2026-07-08-p13-patch-write-workflow-contract-freeze-design.md docs/superpowers/plans/2026-07-08-p13-patch-write-workflow-contract.md
rg -n 'production-ready|AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|ready: true|isReady: true|writeFile|removeFile|unlink|applyPatch\(|execute runner|code runner|Cookie-backed reader implementation' docs/superpowers/specs/2026-07-08-p13-patch-write-workflow-contract-freeze-design.md docs/superpowers/plans/2026-07-08-p13-patch-write-workflow-contract.md
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

Expected:

- First `rg` has hits.
- Placeholder audit has no hits.
- Capability audit hits only forbidden/non-goal language and no implementation claim.
- Filtered status contains only the two new docs before staging.
- Staged paths are empty before staging.

## 19. Exit Criteria

P13 docs-only freeze is complete when:

- this spec and the paired plan are written
- both documents name **Patch / Write Workflow Contract Preview**
- both documents reference P12 and HEAD `0af495c`
- forbidden capabilities are explicitly blocked
- future implementation tasks include allowed files, forbidden files, RED commands, GREEN commands, boundary audits, exact-path staging and commit messages
- docs-only acceptance commands are run
- exact-path staging contains only the two P13 docs
- commit message is `docs: define p13 patch write workflow contract`
- push status is explicitly reported as no

## 20. Spec Self-Review

- P13 is scoped to patch/write workflow contract preview and does not implement mutation.
- P13 extends P11/P12 through proposal, diff, permission, approval, dry-run and rollback-plan metadata only.
- Runtime owns validation and event taxonomy; Workbench consumes read-only projections; API/Tauri remains gated/no-op in P13 preview.
- OI specialization is preserved through refs and profile metadata without polluting the generic Agent patch workflow.
- Forbidden capabilities are named as unavailable or blocked and are not claimed as implemented.
