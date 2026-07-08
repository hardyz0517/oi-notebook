# P13 Patch Write Workflow Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement P13 as `Patch / Write Workflow Contract Preview`: typed patch proposal envelopes, target refs, read-only diff preview, risk classification, permission request and approval decision read models, validation/dry-run results, rollback-plan metadata, audit event taxonomy, and read-only Workbench projection.

**Architecture:** P13 builds on HEAD `0af495c docs: record p12 durable session handoff` and the P12 output state `Durable Session / Request Log / Replay Persistence Contract Preview`. Runtime owns proposal normalization, validation, event taxonomy, risk classification and permission request shape; Workbench consumes read-only projections; API/Tauri remains gated/no-op for mutation in P13. P13 does not implement patch apply, write mutation, delete, rollback execution, execute/code runner, Cookie-backed reader, DB/FS durable storage, migration execution, old AiSidebar migration or production autonomous Agent behavior.

**Tech Stack:** TypeScript, Vitest, React read-only Workbench components, existing `src/lib/agent-runtime/**`, `src/lib/agent-workbench/**`, `src/components/agent-workbench/**`, existing `src/lib/api.ts` boundary, optional API/Tauri no-op audit, and docs handoff in `docs/agent-workbench/handoff-p4.md` during implementation closeout only.

---

## 0. Phase Boundary

Phase name: **P13 Patch / Write Workflow Contract Freeze**

Input state: **Durable Session / Request Log / Replay Persistence Contract Preview**

Output state: **Patch / Write Workflow Contract Preview**

Required reading:

- `AGENTS.md`
- `docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md`
- `docs/agent-workbench/handoff-p4.md`
- `docs/superpowers/specs/2026-07-07-p11-multi-step-model-loop-tool-continuation-freeze-design.md`
- `docs/superpowers/specs/2026-07-07-p12-durable-session-request-log-freeze-design.md`
- `docs/superpowers/plans/2026-07-07-p12-durable-session-request-log.md`
- `docs/superpowers/specs/2026-07-08-p13-patch-write-workflow-contract-freeze-design.md`
- `docs/superpowers/plans/2026-07-08-p13-patch-write-workflow-contract.md`

Global forbidden zones:

- Do not modify `notes/**`.
- Do not modify `src/components/ai/**`.
- Do not modify package, lock or config files.
- Do not implement real patch apply, write mutation, delete, rollback execution, execute/code runner, Cookie-backed reader, raw provider payload storage, raw tool output storage, real DB/FS storage, real migration execution or old AiSidebar migration.
- Do not let React components route patch decisions, approve mutation, call providers, build prompts, call Tauri directly, write files or hold secrets.
- Do not bypass `src/lib/api.ts`.
- Do not use `git add .`, `git add -A` or `git commit -a`.
- Do not push unless supervisor explicitly asks.

Default mutation ruling: P13 is contract/preview. If a later worker wants true mutation, that worker must first obtain a new approved phase that freezes command boundary, path safety, sandbox, transaction, backup, rollback execution, destructive approval, persistence and recovery proofs.

## File Structure

- Create: `src/lib/agent-runtime/patchWorkflowTypes.ts` for proposal envelope, target refs, diff preview, risk classification, permission request, approval decision, validation result, dry-run result, rollback-plan metadata and event types.
- Create: `src/lib/agent-runtime/patchWorkflowTypes.test.ts` for contract and negative-proof tests.
- Create: `src/lib/agent-runtime/patchProposalPolicy.ts` for proposal normalizer and validator.
- Create: `src/lib/agent-runtime/patchProposalPolicy.test.ts` for validation tests.
- Create: `src/lib/agent-runtime/patchRiskPolicy.ts` for risk classification and permission request mapping.
- Create: `src/lib/agent-runtime/patchRiskPolicy.test.ts` for risk/permission tests.
- Create: `src/lib/agent-runtime/patchDiffPreview.ts` for read-only diff projector and redaction boundary.
- Create: `src/lib/agent-runtime/patchDiffPreview.test.ts` for diff/dry-run RED/GREEN tests.
- Create: `src/lib/agent-workbench/patchWorkflowViewModel.ts` for Workbench read-only projection.
- Create: `src/lib/agent-workbench/patchWorkflowViewModel.test.ts` for read model tests.
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.ts` and `src/lib/agent-workbench/workbenchTaskFlow.test.ts` only if runtime attaches P13 preview data through existing flow.
- Create: `src/components/agent-workbench/PatchWorkflowPanel.tsx` for read-only display.
- Modify: `src/components/agent-workbench/AgentWorkbenchShell.tsx` only to mount the read-only panel.
- Modify: `src/lib/api.ts` and `src/lib/apiContract.ts` only in the no-op/boundary audit task if a type-only unavailable wrapper is explicitly required.
- Modify: `docs/agent-workbench/handoff-p4.md` only in closeout task.

## Task 0: Baseline / Scope Audit

**Allowed files:**
- Read-only: required docs
- Read-only: `src/lib/agent-runtime/**`
- Read-only: `src/lib/agent-workbench/**`
- Read-only: `src/components/agent-workbench/**`
- Read-only: `src/lib/api.ts`
- Read-only: `src/lib/apiContract.ts`

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- `src-tauri/src/**`
- package / lock / config files

**RED commands:** none; this is a read-only audit task.

**GREEN commands:**

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -12 --decorate
rg -n 'P13|Patch / Write Workflow Contract Preview|P12|Durable Session / Request Log / Replay Persistence Contract Preview|0af495c' docs/superpowers/specs/2026-07-08-p13-patch-write-workflow-contract-freeze-design.md docs/superpowers/plans/2026-07-08-p13-patch-write-workflow-contract.md docs/agent-workbench/handoff-p4.md
```

Expected: filtered status is clean or unrelated existing changes are named and left untouched; staged paths are empty; HEAD lineage includes `0af495c`; P12 input state and P13 output state are visible.

**Boundary audit:**

```powershell
rg -n 'real patch apply|write mutation|delete|rollback execution|execute runner|code runner|Cookie-backed|raw provider payload|raw tool output|database storage|filesystem durable|migration execution|AiSidebar' docs/superpowers/specs/2026-07-08-p13-patch-write-workflow-contract-freeze-design.md
```

Expected: hits are in forbidden / non-goal language only.

**Exact-path staging:** none.

**Commit message:** none.

## Task 1: Patch Workflow Contract Types

**Allowed files:**
- Create: `src/lib/agent-runtime/patchWorkflowTypes.ts`
- Create: `src/lib/agent-runtime/patchWorkflowTypes.test.ts`

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- `src-tauri/src/**`
- Workbench components
- API/Tauri files
- mutation, storage, execute or Cookie implementation files

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/patchWorkflowTypes.test.ts
```

Expected before implementation: FAIL because `patchWorkflowTypes.ts` does not exist or lacks P13 exports.

**Implementation steps:**

- [ ] Add tests for `PatchProposalEnvelope` with `proposalId`, `sessionId`, `turnId`, `stepId`, `sourceKind`, `sourceEventIds`, `workspaceRefs`, `evidenceRefs`, `targetRefs`, `patchFormat`, `proposalSummary`, `authoringMode`, `riskClassification`, `permissionRequest`, `validationResult`, `dryRunResult`, `rollbackPlan`, `redactionResult`, `schemaVersion`, `capabilityStatus` and output state `Patch / Write Workflow Contract Preview`.
- [ ] Add tests for `PatchTargetRef` with display-only path, `contentHashBefore`, `pathSafetyStatus` and `notesPolicy`.
- [ ] Add tests for `PatchDiffPreview`, `PatchApprovalDecisionReadModel`, `PatchValidationResult`, `PatchDryRunResult` and `PatchRollbackPlanMetadata`.
- [ ] Add tests that reserved events such as `patch.applied`, `file.write.completed`, `file.delete.completed`, `rollback.executed` and `command.executed` cannot be represented as successful P13 events.
- [ ] Implement only type exports, constants and pure validators needed by tests.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/patchWorkflowTypes.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: focused tests and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'fs\.|writeFile|removeFile|unlink|applyPatch\(|spawn|Command|fetch\(|XMLHttpRequest|EventSource|WebSocket|@tauri-apps/api/core|\binvoke\s*\(|Authorization|apiKey|api_key|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-[A-Za-z0-9]|cookie' src/lib/agent-runtime/patchWorkflowTypes.ts src/lib/agent-runtime/patchWorkflowTypes.test.ts
```

Expected: no real mutation, command, network, Tauri, secret or Cookie behavior; forbidden literals appear only in negative-proof tests if present.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-runtime/patchWorkflowTypes.ts src/lib/agent-runtime/patchWorkflowTypes.test.ts
git diff --cached --name-only
```

Expected staged paths:

```text
src/lib/agent-runtime/patchWorkflowTypes.ts
src/lib/agent-runtime/patchWorkflowTypes.test.ts
```

**Commit message:**

```powershell
git commit -m "feat: define p13 patch workflow contract"
```

## Task 2: Proposal Normalizer / Validator

**Allowed files:**
- Create: `src/lib/agent-runtime/patchProposalPolicy.ts`
- Create: `src/lib/agent-runtime/patchProposalPolicy.test.ts`
- Modify: `src/lib/agent-runtime/patchWorkflowTypes.ts` only for shared validation types
- Modify: `src/lib/agent-runtime/patchWorkflowTypes.test.ts` only for narrow coverage

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- `src-tauri/src/**`
- API/Tauri files
- file writer, patch applier, execute runner or Cookie reader modules

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/patchProposalPolicy.test.ts
```

Expected before implementation: FAIL because `patchProposalPolicy.ts` does not exist.

**Implementation steps:**

- [ ] Add tests normalizing a model/tool output into a proposal envelope without preserving raw provider payload.
- [ ] Add tests rejecting missing target refs, unsupported patch format, stale `contentHashBefore`, blocked path safety and `notes/**` mutation without explicit future approval.
- [ ] Add tests that delete, rollback execution, command execution and direct filesystem mutation become blocked validation results.
- [ ] Add tests that `proposalSummary` is safe and bounded.
- [ ] Implement pure normalization and validation helpers; do not write, patch, delete, execute or call Tauri.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/patchProposalPolicy.test.ts src/lib/agent-runtime/patchWorkflowTypes.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: proposal policy tests, contract type tests, agent-runtime suite and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'writeFile|removeFile|unlink|applyPatch\(|patch apply|execute runner|code runner|delete.*completed|rollback.*executed|@tauri-apps/api/core|\binvoke\s*\(|Cookie-backed|cookie|raw provider payload|raw tool output' src/lib/agent-runtime/patchProposalPolicy.ts src/lib/agent-runtime/patchProposalPolicy.test.ts src/lib/agent-runtime/patchWorkflowTypes.ts
```

Expected: no true mutation or execution behavior; forbidden strings only in blocked/negative-proof language.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-runtime/patchProposalPolicy.ts src/lib/agent-runtime/patchProposalPolicy.test.ts src/lib/agent-runtime/patchWorkflowTypes.ts src/lib/agent-runtime/patchWorkflowTypes.test.ts
git diff --cached --name-only
```

Expected: only proposal policy files plus narrowly touched P13 type files are staged.

**Commit message:**

```powershell
git commit -m "feat: validate p13 patch proposals"
```

## Task 3: Risk Classification / Permission Request Contract

**Allowed files:**
- Create: `src/lib/agent-runtime/patchRiskPolicy.ts`
- Create: `src/lib/agent-runtime/patchRiskPolicy.test.ts`
- Modify: `src/lib/agent-runtime/patchWorkflowTypes.ts` only for shared risk/permission types

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- `src-tauri/src/**`
- Workbench components
- mutation and execution files

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/patchRiskPolicy.test.ts
```

Expected before implementation: FAIL because `patchRiskPolicy.ts` does not exist.

**Implementation steps:**

- [ ] Add tests for low, medium, high and blocked risk levels.
- [ ] Add tests that `write`, `patch-apply`, `delete`, `rollback` and `destructive` permissions never return `auto-allowed` in P13.
- [ ] Add tests that single safe fixture diff is low/medium, multi-file or stale target is high, and direct mutation/delete/rollback execution is blocked.
- [ ] Add tests that approval decision read model can be `pending`, `approved-for-future-apply`, `denied`, `blocked`, `expired` or `unavailable`.
- [ ] Implement pure risk classification and permission request generation.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/patchRiskPolicy.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: risk policy tests, agent-runtime suite and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'auto-allowed.*write|auto-allowed.*patch|auto-allowed.*delete|auto-allowed.*rollback|applyPatch\(|writeFile|removeFile|unlink|execute runner|code runner|Cookie-backed' src/lib/agent-runtime/patchRiskPolicy.ts src/lib/agent-runtime/patchRiskPolicy.test.ts
```

Expected: no auto-allowed mutation or execution capability.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-runtime/patchRiskPolicy.ts src/lib/agent-runtime/patchRiskPolicy.test.ts src/lib/agent-runtime/patchWorkflowTypes.ts
git diff --cached --name-only
```

Expected: only risk policy files plus narrowly touched type file are staged.

**Commit message:**

```powershell
git commit -m "feat: classify p13 patch proposal risk"
```

## Task 4: Read-Only Diff Preview / Dry-Run Projection

**Allowed files:**
- Create: `src/lib/agent-runtime/patchDiffPreview.ts`
- Create: `src/lib/agent-runtime/patchDiffPreview.test.ts`
- Modify: `src/lib/agent-runtime/patchWorkflowTypes.ts` only for shared diff/dry-run types

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- `src-tauri/src/**`
- `src/lib/api.ts`
- real filesystem, patch apply, command execution, Cookie or storage modules

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/patchDiffPreview.test.ts
```

Expected before implementation: FAIL because `patchDiffPreview.ts` does not exist.

**Implementation steps:**

- [ ] Add tests projecting unified diff text into bounded read-only hunks.
- [ ] Add tests redacting API key, Authorization header, Cookie, raw provider payload, raw tool output and unauthorized local-note content.
- [ ] Add tests for dry-run statuses `not-run`, `passed`, `failed`, `blocked` and `unavailable`.
- [ ] Add tests that dry-run reports `wouldChangeFiles`, `wouldCreateFiles`, `wouldDeleteFiles`, conflicts, stale targets and blocked targets without mutating.
- [ ] Add tests that rollback-plan metadata is produced as metadata only and missing rollback plan raises risk.
- [ ] Implement pure diff preview and dry-run projection using supplied proposal/target refs only.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/patchDiffPreview.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: diff preview tests, agent-runtime suite and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'fs\.|readFile|writeFile|removeFile|unlink|applyPatch\(|spawn|Command|@tauri-apps/api/core|\binvoke\s*\(|localStorage|indexedDB|database|migration|Cookie-backed|cookie' src/lib/agent-runtime/patchDiffPreview.ts src/lib/agent-runtime/patchDiffPreview.test.ts
```

Expected: no real file IO, patch application, execution, browser storage, DB/FS storage, migration or Cookie behavior.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-runtime/patchDiffPreview.ts src/lib/agent-runtime/patchDiffPreview.test.ts src/lib/agent-runtime/patchWorkflowTypes.ts
git diff --cached --name-only
```

Expected: only diff preview files plus narrowly touched type file are staged.

**Commit message:**

```powershell
git commit -m "feat: preview p13 patch diffs"
```

## Task 5: Workbench Read-Only Patch Projection

**Allowed files:**
- Create: `src/lib/agent-workbench/patchWorkflowViewModel.ts`
- Create: `src/lib/agent-workbench/patchWorkflowViewModel.test.ts`
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.ts`
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.test.ts`
- Create: `src/components/agent-workbench/PatchWorkflowPanel.tsx`
- Modify: `src/components/agent-workbench/AgentWorkbenchShell.tsx`

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- `src-tauri/src/**`
- `src/lib/api.ts`
- provider transport, mutation, execute, Cookie or storage writer files

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench/patchWorkflowViewModel.test.ts
```

Expected before implementation: FAIL because patch workflow read model does not exist.

**Implementation steps:**

- [ ] Add tests projecting proposal summary, target refs, diff preview, risk, permission request, approval decision, validation result, dry-run result, rollback-plan metadata and audit events.
- [ ] Add tests proving read model title/output state is exactly `Patch / Write Workflow Contract Preview`.
- [ ] Add tests proving raw provider payload, raw tool output, API key, Authorization, Cookie and real note content do not appear in Workbench projection.
- [ ] Attach P13 projection to `workbenchTaskFlow.ts` only when runtime reports P13 preview data; keep P12 session history projection intact.
- [ ] Add read-only `PatchWorkflowPanel` without buttons that apply patches, write files, delete, rollback, run code, call Tauri, call provider or read Cookie pages.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench/patchWorkflowViewModel.test.ts src/lib/agent-workbench/workbenchTaskFlow.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: Workbench patch projection tests, agent-workbench suite and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'onClick=.*apply|onClick=.*write|onClick=.*delete|onClick=.*rollback|applyPatch\(|patch apply|writeFile|removeFile|unlink|execute runner|code runner|Cookie-backed|cookie|Authorization|apiKey|sk-[A-Za-z0-9]|raw provider payload|raw tool output|buildPrompt|prompt construction|@tauri-apps/api/core|\binvoke\s*\(' src/lib/agent-workbench src/components/agent-workbench
```

Expected: no direct mutation controls, secret/raw payload exposure, prompt construction or direct Tauri calls.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-workbench/patchWorkflowViewModel.ts src/lib/agent-workbench/patchWorkflowViewModel.test.ts src/lib/agent-workbench/workbenchTaskFlow.ts src/lib/agent-workbench/workbenchTaskFlow.test.ts src/components/agent-workbench/PatchWorkflowPanel.tsx src/components/agent-workbench/AgentWorkbenchShell.tsx
git diff --cached --name-only
```

Expected: only read-model and read-only component files are staged.

**Commit message:**

```powershell
git commit -m "feat: project p13 patch workflow preview"
```

## Task 6: API/Tauri No-Op Boundary Audit

**Allowed files:**
- Modify: `src/lib/api.ts` only if an unavailable/no-op wrapper is explicitly needed
- Modify: `src/lib/apiContract.ts` only if a type-only contract is explicitly needed
- Modify: `src/lib/apiBoundary.test.ts` only for boundary tests
- Read-only: `src-tauri/src/**`

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- package / lock / config files
- Rust DB/FS mutation implementation
- Tauri file-write, patch-apply, delete or rollback commands

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/apiBoundary.test.ts
```

Expected before implementation: FAIL only if a new P13 unavailable/no-op boundary assertion is added first. If no wrapper is needed, this task may remain read-only with no staged changes.

**Implementation steps:**

- [ ] Prefer no production change if P13 can stay fully runtime/read-model only.
- [ ] If a wrapper is required, expose unavailable/no-op contract shape only; it must return `unavailable`, `reserved`, `denied` or `blocked` and must not call a Tauri mutation command.
- [ ] Add or update boundary tests proving no component outside `src/lib/api.ts` imports `@tauri-apps/api/core` or calls `invoke`.
- [ ] Audit wrapper params for absence of API key, Authorization, Cookie, raw provider payload, raw tool output and real note content.
- [ ] Do not add Rust code that writes files, applies patches, deletes, rolls back, executes commands, reads Cookie pages or writes durable storage.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/apiBoundary.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'
```

Expected: API boundary tests and typecheck pass; direct Tauri audit is no-hit outside allowed boundaries.

**Boundary audit:**

```powershell
rg -n 'writeFile|removeFile|unlink|applyPatch\(|patch apply|execute runner|code runner|delete|rollback|Cookie-backed|raw provider payload|raw tool output|Authorization|apiKey|api_key|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-[A-Za-z0-9]|filesystem durable|database storage|migration' src/lib/api.ts src/lib/apiContract.ts src/lib/apiBoundary.test.ts src-tauri/src
```

Expected: no new mutation command behavior; existing unrelated API/Rust hits must be explained as pre-existing or negative-proof language.

**Exact-path staging:**

```powershell
git add -- src/lib/api.ts src/lib/apiContract.ts src/lib/apiBoundary.test.ts
git diff --cached --name-only
```

Expected: only API boundary files that actually changed are staged. If none changed, no staging occurs.

**Commit message:**

```powershell
git commit -m "feat: gate p13 patch api boundary"
```

If no files changed, skip commit and report no-op boundary audit.

## Task 7: Boundary Audit And Handoff

**Allowed files:**
- Modify: `docs/agent-workbench/handoff-p4.md`
- Optional modify: focused tests only when audit-noise cleanup is required without weakening coverage

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- package / lock / config files
- feature implementation beyond audit-noise cleanup

**RED commands:** none; this is verification and handoff.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench
node .\node_modules\vitest\vitest.mjs run src/lib/apiBoundary.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: all focused suites and typecheck pass. If dependency hydration is missing, repair only with supervisor-approved command and report exact output.

**Boundary audit:**

```powershell
rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'
rg -n 'Authorization|apiKey|api_key|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-[A-Za-z0-9]|cookie|raw provider payload|raw tool output' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts
rg -n 'writeFile|removeFile|unlink|applyPatch\(|patch apply|execute runner|code runner|Cookie-backed|delete|rollback|database storage|filesystem durable|migration|AiSidebar' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts src-tauri/src
rg -n 'AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|production-ready|ready: true|isReady: true' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

Expected: direct Tauri audit no-hit outside allowed boundaries; secret/cookie/raw payload hits only negative-proof tests or safe existing boundary references; forbidden capability hits only unavailable/reserved/blocked/negative-proof language; status contains only intended files before handoff staging; staged paths are empty before handoff staging.

**Implementation steps:**

- [ ] Append a P13 handoff section to `docs/agent-workbench/handoff-p4.md`.
- [ ] Record output state as **Patch / Write Workflow Contract Preview**.
- [ ] Record what P13 froze and what remains forbidden.
- [ ] Record actual verification command results and scoped audit hits.
- [ ] State that P13 does not implement production-ready autonomous Agent, real patch apply, write mutation, delete, rollback execution, execute/code runner, Cookie-backed reader, DB/FS durable storage, migration execution, raw payload storage, old AiSidebar migration or AI upgrade completion.

**Exact-path staging:**

```powershell
git add -- docs/agent-workbench/handoff-p4.md
git diff --cached --name-only
```

Expected staged paths:

```text
docs/agent-workbench/handoff-p4.md
```

**Commit message:**

```powershell
git commit -m "docs: record p13 patch workflow handoff"
```

## Task 8: Supervisor Acceptance

**Allowed files:**
- Read-only in supervisor checkout

**Forbidden files:**
- All files unless supervisor explicitly opens a correction task

**RED commands:** none; supervisor validates already-implemented work.

**GREEN commands:**

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -12 --decorate
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench
node .\node_modules\vitest\vitest.mjs run src/lib/apiBoundary.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'
rg -n 'Authorization|apiKey|api_key|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-[A-Za-z0-9]|cookie|raw provider payload|raw tool output' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts
rg -n 'writeFile|removeFile|unlink|applyPatch\(|patch apply|execute runner|code runner|Cookie-backed|delete|rollback|database storage|filesystem durable|migration|AiSidebar' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts src-tauri/src
```

Expected: checkout is clean, staged paths empty, P13 commits present, verification passes or blockers are recorded precisely, audits are no-hit or scoped to contract/test literals with explanation.

**Supervisor report shape:**

```text
Verdict:
P13 output state:
Merged commits:
Changed files by slice:
Verification commands and results:
No-hit audit results:
Scoped audit hits:
Remaining forbidden capabilities:
Final filtered status:
Final staged paths:
Push status:
```

**Exact-path staging:** none unless supervisor opens a correction.

**Commit message:** none unless supervisor opens a correction.

## Docs-Only Worker Acceptance

This current docs-only P13 worker must run:

```powershell
rg -n 'P13|Patch / Write Workflow Contract Preview|patch proposal|approval decision|dry-run|rollback-plan|0af495c|P12' docs/superpowers/specs/2026-07-08-p13-patch-write-workflow-contract-freeze-design.md docs/superpowers/plans/2026-07-08-p13-patch-write-workflow-contract.md
$placeholderPattern = ('TO' + 'DO|TB' + 'D|待' + '补|以' + '后再补|占' + '位')
rg -n $placeholderPattern docs/superpowers/specs/2026-07-08-p13-patch-write-workflow-contract-freeze-design.md docs/superpowers/plans/2026-07-08-p13-patch-write-workflow-contract.md
rg -n 'production-ready|AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|ready: true|isReady: true|writeFile|removeFile|unlink|applyPatch\(|execute runner|code runner|Cookie-backed reader implementation' docs/superpowers/specs/2026-07-08-p13-patch-write-workflow-contract-freeze-design.md docs/superpowers/plans/2026-07-08-p13-patch-write-workflow-contract.md
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

Expected:

- First `rg` finds the phase name, output state, patch proposal terms, approval decision, dry-run, rollback-plan, `0af495c` and P12.
- Placeholder audit is no-hit.
- Capability audit hits only forbidden/non-goal language and no implementation claim.
- Filtered status contains only the two P13 docs before staging.
- Staged paths are empty before exact-path staging.

Then stage and commit exactly:

```powershell
git add -- docs/superpowers/specs/2026-07-08-p13-patch-write-workflow-contract-freeze-design.md docs/superpowers/plans/2026-07-08-p13-patch-write-workflow-contract.md
git diff --cached --name-only
git commit -m "docs: define p13 patch write workflow contract"
```

Expected staged paths:

```text
docs/superpowers/specs/2026-07-08-p13-patch-write-workflow-contract-freeze-design.md
docs/superpowers/plans/2026-07-08-p13-patch-write-workflow-contract.md
```

## Handoff Template For Future Workers

```text
Current phase:
P13 Patch / Write Workflow Contract Freeze

Responsible slice:
Use the exact task title assigned by the supervisor, such as Task 2 Proposal Normalizer / Validator.

Input state:
Durable Session / Request Log / Replay Persistence Contract Preview

Target output state:
Patch / Write Workflow Contract Preview

Allowed files:
Use only the exact allowed paths listed under the assigned task in this plan.

Forbidden files:
notes/**
src/components/ai/**
package / lock / config files
true patch apply / write mutation / delete / rollback execution / execute-code-runner / Cookie surfaces
true DB / FS durable writes
raw provider payload / raw tool output storage
old AiSidebar migration

Required reading:
AGENTS.md
P13 spec
P13 plan
P12 spec
P12 plan
docs/agent-workbench/handoff-p4.md P10/P11/P12/P13 sections

RED evidence:
Record the failing command named in the assigned task and the specific expected missing symbol or failing assertion.

GREEN evidence:
Record the passing GREEN commands named in the assigned task, including test file counts when Vitest reports them.

Boundary audits:
Record the API boundary audit, secret/cookie/raw payload audit and forbidden capability audit from the assigned task.

Staging:
Use git add -- <exact paths>

Commit:
Use the commit message listed under the assigned task.

Push:
No, unless supervisor explicitly asks.

Remaining forbidden capabilities:
production autonomous Agent, true patch apply, write mutation, delete, rollback execution, execute/code runner, Cookie-backed reader, DB/FS durable storage, migration execution, old AiSidebar migration
```

## Plan Self-Review

- Spec coverage: tasks cover proposal envelope, target refs, diff preview, risk classification, permission request, approval decision read model, validation result, dry-run result, rollback-plan metadata, audit event taxonomy, Workbench read-only projection, API/Tauri no-op boundary, handoff and supervisor acceptance.
- Scope control: plan does not implement real patch apply, write mutation, delete, rollback execution, execute/code runner, Cookie-backed reader, DB/FS durable storage, migration execution, raw payload retention or legacy AiSidebar migration.
- Generality: patch/write workflow supports general Agent sessions; OI remains profile/evidence/workspace specialization through refs.
- Verification: every implementation task has RED, GREEN, exact-path staging, commit-only closeout and boundary audit requirements.
- Dependency order: mutation remains unavailable unless a future approved phase freezes safe command, transaction, path safety, rollback execution and recovery boundaries.
