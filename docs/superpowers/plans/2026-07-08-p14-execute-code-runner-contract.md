# P14 Execute / Code Runner Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement P14 as `Execute / Code Runner Contract Preview`: typed execution request envelopes, target refs, runner capability status, sandbox policy metadata, permission request and approval read models, command/language/test-run classification, mock runner result shape, bounded observations, cleanup metadata, audit event taxonomy and read-only Workbench projection.

**Architecture:** P14 builds on HEAD `88419df docs: record p13 patch workflow handoff` and the P13 output state `Patch / Write Workflow Contract Preview`. Runtime owns execution request normalization, classification, sandbox plan metadata, resource limit policy, permission request shape, mock result shape, observation redaction and event taxonomy; Workbench consumes read-only projections; API/Tauri remains gated/no-op for execution in P14. P14 does not implement real process execution, code runner, stress tester, patch apply, write mutation, delete, rollback execution, Cookie-backed reader, DB/FS durable storage, migration execution, old AiSidebar migration or production autonomous Agent behavior.

**Tech Stack:** TypeScript, Vitest, React read-only Workbench components, existing `src/lib/agent-runtime/**`, `src/lib/agent-workbench/**`, `src/components/agent-workbench/**`, existing `src/lib/api.ts` boundary, optional API/Tauri no-op audit, and docs handoff in `docs/agent-workbench/handoff-p4.md` during implementation closeout only.

---

## 0. Phase Boundary

Phase name: **P14 Execute / Code Runner Contract Freeze**

Input state: **Patch / Write Workflow Contract Preview**

Output state: **Execute / Code Runner Contract Preview**

Required reading:

- `AGENTS.md`
- `docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md`
- `docs/agent-workbench/handoff-p4.md`
- `docs/superpowers/specs/2026-07-07-p10-model-loop-live-provider-request-freeze-design.md`
- `docs/superpowers/specs/2026-07-07-p11-multi-step-model-loop-tool-continuation-freeze-design.md`
- `docs/superpowers/plans/2026-07-07-p11-multi-step-model-loop-tool-continuation.md`
- `docs/superpowers/specs/2026-07-07-p12-durable-session-request-log-freeze-design.md`
- `docs/superpowers/plans/2026-07-07-p12-durable-session-request-log.md`
- `docs/superpowers/specs/2026-07-08-p13-patch-write-workflow-contract-freeze-design.md`
- `docs/superpowers/plans/2026-07-08-p13-patch-write-workflow-contract.md`
- `docs/superpowers/specs/2026-07-08-p14-execute-code-runner-contract-freeze-design.md`
- `docs/superpowers/plans/2026-07-08-p14-execute-code-runner-contract.md`

Global forbidden zones:

- Do not modify `notes/**`.
- Do not modify `src/components/ai/**`.
- Do not modify package, lock or config files.
- Do not implement real process execution, code runner, stress tester, real patch apply, write mutation, delete, rollback execution, Cookie-backed reader, raw provider payload storage, raw tool output storage, real DB/FS storage, real migration execution or old AiSidebar migration.
- Do not let React components route runner decisions, approve execution, call providers, build prompts, call Tauri directly, write files, execute commands or hold secrets.
- Do not bypass `src/lib/api.ts`.
- Do not use `git add .`, `git add -A` or `git commit -a`.
- Do not push unless supervisor explicitly asks.

Default execution ruling: P14 is contract/preview. If a later worker wants true execution, that worker must first obtain a new approved phase that freezes command boundary, sandbox implementation, path safety, resource enforcement, timeout/output handling, network/secret/Cookie policy, cleanup, rollback and recovery proofs.

## File Structure

- Create: `src/lib/agent-runtime/runnerContractTypes.ts` for execution request envelope, target refs, runner capability status, sandbox plan, resource limits, permission request, approval decision, mock result, observation, cleanup metadata and event taxonomy.
- Create: `src/lib/agent-runtime/runnerContractTypes.test.ts` for contract and reserved-event negative-proof tests.
- Create: `src/lib/agent-runtime/runnerRequestPolicy.ts` for request normalizer and structural validation.
- Create: `src/lib/agent-runtime/runnerRequestPolicy.test.ts` for normalizer and validator tests.
- Create: `src/lib/agent-runtime/runnerClassificationPolicy.ts` for command / language / test-run classification and risk mapping.
- Create: `src/lib/agent-runtime/runnerClassificationPolicy.test.ts` for classification tests.
- Create: `src/lib/agent-runtime/runnerPermissionSandboxPolicy.ts` for permission request, approval decision read model and sandbox plan metadata.
- Create: `src/lib/agent-runtime/runnerPermissionSandboxPolicy.test.ts` for permission and sandbox metadata tests.
- Create: `src/lib/agent-runtime/mockRunnerProjection.ts` for dry-run / mock runner result shape.
- Create: `src/lib/agent-runtime/mockRunnerProjection.test.ts` for no-run mock result tests.
- Create: `src/lib/agent-runtime/runnerObservationPolicy.ts` for bounded output, redaction and cleanup / recovery metadata.
- Create: `src/lib/agent-runtime/runnerObservationPolicy.test.ts` for observation and cleanup metadata tests.
- Create: `src/lib/agent-workbench/runnerWorkflowViewModel.ts` for Workbench read-only projection.
- Create: `src/lib/agent-workbench/runnerWorkflowViewModel.test.ts` for read model tests.
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.ts` and `src/lib/agent-workbench/workbenchTaskFlow.test.ts` only if runtime attaches P14 preview data through existing flow.
- Create: `src/components/agent-workbench/RunnerWorkflowPanel.tsx` for read-only display.
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
rg -n 'P14|Execute / Code Runner Contract Preview|P13|Patch / Write Workflow Contract Preview|88419df' docs/superpowers/specs/2026-07-08-p14-execute-code-runner-contract-freeze-design.md docs/superpowers/plans/2026-07-08-p14-execute-code-runner-contract.md docs/agent-workbench/handoff-p4.md
```

Expected: filtered status is clean or unrelated existing changes are named and left untouched; staged paths are empty; HEAD lineage includes `88419df`; P13 input state and P14 output state are visible.

**Boundary audit:**

```powershell
rg -n 'real process|code runner|stress tester|patch apply|write mutation|delete|rollback execution|Cookie-backed|raw provider payload|raw tool output|database storage|filesystem durable|migration execution|AiSidebar' docs/superpowers/specs/2026-07-08-p14-execute-code-runner-contract-freeze-design.md
```

Expected: hits are in forbidden / non-goal language only.

**Exact-path staging:** none.

**Commit message:** none.

## Task 1: Runner Contract Types / Event Taxonomy

**Allowed files:**
- Create: `src/lib/agent-runtime/runnerContractTypes.ts`
- Create: `src/lib/agent-runtime/runnerContractTypes.test.ts`

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- `src-tauri/src/**`
- Workbench components
- API/Tauri files
- mutation, storage, execution or Cookie implementation files

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/runnerContractTypes.test.ts
```

Expected before implementation: FAIL because `runnerContractTypes.ts` does not exist or lacks P14 exports.

**Implementation steps:**

- [ ] Add tests for `RunnerExecutionRequestEnvelope` with `executionRequestId`, `sessionId`, `turnId`, `stepId`, `sourceKind`, `sourceEventIds`, `workspaceRefs`, `evidenceRefs`, `targetRefs`, `runnerKind`, `runnerIntent`, `classification`, `requestedInputs`, `expectedOutputs`, `sandboxPlan`, `resourceLimits`, `permissionRequest`, `approvalDecision`, `mockResult`, `observationPolicy`, `rollbackCleanupPlan`, `redactionResult`, `schemaVersion`, `capabilityStatus` and output state `Execute / Code Runner Contract Preview`.
- [ ] Add tests for `RunnerTargetRef` with display-only path, `languageId`, `contentHashBefore`, `inputRefs`, `expectedOutputRefs`, `pathSafetyStatus`, `notesPolicy` and `networkPolicy`.
- [ ] Add tests for runner capability statuses: `preview`, `reserved`, `unavailable`, `denied`, `blocked`.
- [ ] Add tests for event taxonomy: `runner.requested`, `runner.classified`, `runner.permission.required`, `runner.permission.resolved`, `runner.sandbox.planned`, `runner.mock.started`, `runner.mock.completed`, `runner.mock.failed`, `runner.observation.added`, `runner.blocked`, `runner.unavailable`.
- [ ] Add tests that reserved true execution events such as `runner.started`, `runner.completed`, `command.executed`, `process.started`, `test-run.executed`, `stress-test.executed`, `artifact.written`, `cleanup.executed` and `rollback.executed` cannot be represented as successful P14 events.
- [ ] Implement only type exports, constants and pure validators needed by tests.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/runnerContractTypes.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: focused tests and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'fs\.|writeFile|removeFile|unlink|applyPatch\(|spawn\(|child_process|exec\(|fetch\(|XMLHttpRequest|EventSource|WebSocket|@tauri-apps/api/core|\binvoke\s*\(|Authorization|apiKey|api_key|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-[A-Za-z0-9]|cookie' src/lib/agent-runtime/runnerContractTypes.ts src/lib/agent-runtime/runnerContractTypes.test.ts
```

Expected: no real mutation, execution, network, Tauri, secret or Cookie behavior; forbidden literals appear only in negative-proof tests if present.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-runtime/runnerContractTypes.ts src/lib/agent-runtime/runnerContractTypes.test.ts
git diff --cached --name-only
```

Expected staged paths:

```text
src/lib/agent-runtime/runnerContractTypes.ts
src/lib/agent-runtime/runnerContractTypes.test.ts
```

**Commit message:**

```powershell
git commit -m "feat: define p14 runner contract"
```

## Task 2: Runner Request Normalizer / Policy Classifier

**Allowed files:**
- Create: `src/lib/agent-runtime/runnerRequestPolicy.ts`
- Create: `src/lib/agent-runtime/runnerRequestPolicy.test.ts`
- Create: `src/lib/agent-runtime/runnerClassificationPolicy.ts`
- Create: `src/lib/agent-runtime/runnerClassificationPolicy.test.ts`
- Modify: `src/lib/agent-runtime/runnerContractTypes.ts` only for shared classification types
- Modify: `src/lib/agent-runtime/runnerContractTypes.test.ts` only for narrow coverage

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- `src-tauri/src/**`
- API/Tauri files
- real process, file writer, patch applier, code runner or Cookie reader modules

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/runnerRequestPolicy.test.ts src/lib/agent-runtime/runnerClassificationPolicy.test.ts
```

Expected before implementation: FAIL because request and classification modules do not exist.

**Implementation steps:**

- [ ] Add tests normalizing a model/tool/user request into an execution request envelope without preserving raw provider payload.
- [ ] Add tests rejecting missing target refs, unsupported runner kind, unknown working directory ref, unbounded output and real `notes/**` access.
- [ ] Add tests classifying command classes: `read-only-inspection`, `build`, `test`, `compile`, `format`, `lint`, `stress-test`, `networked`, `mutating`, `destructive`, `unknown`, `unsupported`.
- [ ] Add tests classifying language classes: `cpp`, `python`, `javascript`, `typescript`, `rust`, `shell`, `markdown`, `text`, `unknown`, `unsupported`.
- [ ] Add tests classifying test-run classes: `unit-test`, `sample-test`, `compile-check`, `stress-test`, `benchmark`, `lint-check`, `format-check`, `not-a-test`, `unsupported`.
- [ ] Add tests that network, Cookie, secret access, direct filesystem mutation, delete, rollback execution, patch apply, direct Tauri bypass and requested true execution become blocked.
- [ ] Implement pure normalization and classification helpers; do not run, patch, delete, execute or call Tauri.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/runnerRequestPolicy.test.ts src/lib/agent-runtime/runnerClassificationPolicy.test.ts src/lib/agent-runtime/runnerContractTypes.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: request policy tests, classification tests, contract type tests, agent-runtime suite and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'writeFile|removeFile|unlink|applyPatch\(|patch apply|spawn\(|child_process|exec\(|execute runner|code runner|stress tester|@tauri-apps/api/core|\binvoke\s*\(|Cookie-backed|cookie|raw provider payload|raw tool output' src/lib/agent-runtime/runnerRequestPolicy.ts src/lib/agent-runtime/runnerRequestPolicy.test.ts src/lib/agent-runtime/runnerClassificationPolicy.ts src/lib/agent-runtime/runnerClassificationPolicy.test.ts
```

Expected: no true mutation or execution behavior; forbidden strings only in blocked/negative-proof language.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-runtime/runnerRequestPolicy.ts src/lib/agent-runtime/runnerRequestPolicy.test.ts src/lib/agent-runtime/runnerClassificationPolicy.ts src/lib/agent-runtime/runnerClassificationPolicy.test.ts src/lib/agent-runtime/runnerContractTypes.ts src/lib/agent-runtime/runnerContractTypes.test.ts
git diff --cached --name-only
```

Expected: only request/classification policy files plus narrowly touched P14 type files are staged.

**Commit message:**

```powershell
git commit -m "feat: classify p14 runner requests"
```

## Task 3: Permission / Sandbox Gate Read Model

**Allowed files:**
- Create: `src/lib/agent-runtime/runnerPermissionSandboxPolicy.ts`
- Create: `src/lib/agent-runtime/runnerPermissionSandboxPolicy.test.ts`
- Modify: `src/lib/agent-runtime/runnerContractTypes.ts` only for shared permission/sandbox types

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- `src-tauri/src/**`
- Workbench components
- mutation, execution, sandbox runtime or Cookie files

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/runnerPermissionSandboxPolicy.test.ts
```

Expected before implementation: FAIL because `runnerPermissionSandboxPolicy.ts` does not exist.

**Implementation steps:**

- [ ] Add tests for permission kinds: `execute`, `public-network`, `write`, `patch-apply`, `delete`, `rollback`, `destructive`.
- [ ] Add tests that no permission kind returns `auto-allowed` in P14.
- [ ] Add tests for decision statuses: `prompt-required`, `denied`, `blocked-by-configuration`, `unavailable`, `reserved`.
- [ ] Add tests for approval read statuses: `pending`, `approved-for-future-execute`, `denied`, `blocked`, `expired`, `unavailable`.
- [ ] Add tests for sandbox profiles: `preview-no-op`, `mock-runner`, `read-only-classification`, `fixture-simulation`, `reserved-future-sandbox`, `blocked`.
- [ ] Add tests proving no network by default, no Cookie, no secret exposure, no write access, no patch apply, no delete or rollback, bounded timeout, bounded output bytes and max files touched of `0` unless fixture simulation counts planned refs.
- [ ] Implement pure permission and sandbox plan builders; do not create a sandbox runtime.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/runnerPermissionSandboxPolicy.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: permission/sandbox tests, agent-runtime suite and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'auto-allowed.*execute|auto-allowed.*write|auto-allowed.*patch|auto-allowed.*delete|auto-allowed.*rollback|writeFile|removeFile|unlink|applyPatch\(|spawn\(|child_process|exec\(|execute runner|code runner|Cookie-backed|cookie' src/lib/agent-runtime/runnerPermissionSandboxPolicy.ts src/lib/agent-runtime/runnerPermissionSandboxPolicy.test.ts
```

Expected: no auto-allowed execution or mutation capability.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-runtime/runnerPermissionSandboxPolicy.ts src/lib/agent-runtime/runnerPermissionSandboxPolicy.test.ts src/lib/agent-runtime/runnerContractTypes.ts
git diff --cached --name-only
```

Expected: only permission/sandbox policy files plus narrowly touched type file are staged.

**Commit message:**

```powershell
git commit -m "feat: gate p14 runner sandbox policy"
```

## Task 4: Mock Runner / Dry-Run Projection

**Allowed files:**
- Create: `src/lib/agent-runtime/mockRunnerProjection.ts`
- Create: `src/lib/agent-runtime/mockRunnerProjection.test.ts`
- Modify: `src/lib/agent-runtime/runnerContractTypes.ts` only for shared mock result types
- Modify: `src/lib/agent-runtime/runnerPermissionSandboxPolicy.ts` only for shared sandbox metadata

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- `src-tauri/src/**`
- `src/lib/api.ts`
- real filesystem, patch apply, process execution, Cookie or storage modules

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/mockRunnerProjection.test.ts
```

Expected before implementation: FAIL because `mockRunnerProjection.ts` does not exist.

**Implementation steps:**

- [ ] Add tests for mock modes: `dry-run`, `classification-only`, `fixture-simulation`, `mock-success`, `mock-failure`, `unavailable`, `blocked`.
- [ ] Add tests for statuses: `not-run`, `planned`, `completed`, `failed`, `blocked`, `unavailable`.
- [ ] Add tests that `completed` means mock completion only and cannot imply true execution.
- [ ] Add tests that `filesTouchedPreview` is a planned count or fixture count and never actual filesystem mutation.
- [ ] Add tests that `networkAccessPreview` is `none` unless request is blocked or reserved for future phase.
- [ ] Add tests for safe input/output summaries and safe errors.
- [ ] Implement pure mock result projection using supplied request, classification and sandbox metadata only.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/mockRunnerProjection.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: mock runner tests, agent-runtime suite and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'fs\.|readFile|writeFile|removeFile|unlink|applyPatch\(|spawn\(|child_process|exec\(|@tauri-apps/api/core|\binvoke\s*\(|fetch\(|XMLHttpRequest|EventSource|WebSocket|localStorage|indexedDB|database|migration|Cookie-backed|cookie' src/lib/agent-runtime/mockRunnerProjection.ts src/lib/agent-runtime/mockRunnerProjection.test.ts
```

Expected: no real file IO, patch application, process execution, browser storage, DB/FS storage, migration, network or Cookie behavior.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-runtime/mockRunnerProjection.ts src/lib/agent-runtime/mockRunnerProjection.test.ts src/lib/agent-runtime/runnerContractTypes.ts src/lib/agent-runtime/runnerPermissionSandboxPolicy.ts
git diff --cached --name-only
```

Expected: only mock projection files plus narrowly touched type/policy files are staged.

**Commit message:**

```powershell
git commit -m "feat: project p14 mock runner results"
```

## Task 5: Observation Redaction / Bounded Output

**Allowed files:**
- Create: `src/lib/agent-runtime/runnerObservationPolicy.ts`
- Create: `src/lib/agent-runtime/runnerObservationPolicy.test.ts`
- Modify: `src/lib/agent-runtime/runnerContractTypes.ts` only for shared observation and cleanup types
- Modify: `src/lib/agent-runtime/mockRunnerProjection.ts` only for result-to-observation refs

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- `src-tauri/src/**`
- provider raw transport files
- runner, storage writer, mutation or Cookie files

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/runnerObservationPolicy.test.ts
```

Expected before implementation: FAIL because `runnerObservationPolicy.ts` does not exist.

**Implementation steps:**

- [ ] Add tests that API key, Authorization header, Cookie, secret-like text, raw provider payload, raw tool output and unauthorized local-note content are dropped or redacted before observation.
- [ ] Add tests that stdout and stderr are bounded independently by max output bytes.
- [ ] Add tests for observation statuses: `not-run`, `simulated`, `mock-completed`, `mock-failed`, `blocked`, `unavailable`.
- [ ] Add tests that observations include `safeSummary`, `boundedStdout`, `boundedStderr`, `exitCodePreview`, `droppedFields`, `truncated` and `continuationVisibility`.
- [ ] Add tests that cleanup / rollback / recovery metadata is required before future execution and is metadata only.
- [ ] Implement pure observation and cleanup metadata builders; do not write request logs or session storage.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/runnerObservationPolicy.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: observation tests, agent-runtime suite and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'localStorage|indexedDB|database|request log persistence|session storage|writeFile|removeFile|unlink|raw provider payload|raw tool output|Authorization|apiKey|sk-[A-Za-z0-9]|cookie|spawn\(|child_process|exec\(' src/lib/agent-runtime/runnerObservationPolicy.ts src/lib/agent-runtime/runnerObservationPolicy.test.ts
```

Expected: sensitive strings appear only in negative-proof tests and are not emitted by production helper output.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-runtime/runnerObservationPolicy.ts src/lib/agent-runtime/runnerObservationPolicy.test.ts src/lib/agent-runtime/runnerContractTypes.ts src/lib/agent-runtime/mockRunnerProjection.ts
git diff --cached --name-only
```

Expected: only observation policy files plus narrowly touched P14 runtime files are staged.

**Commit message:**

```powershell
git commit -m "feat: redact p14 runner observations"
```

## Task 6: Workbench Read-Only Runner Projection

**Allowed files:**
- Create: `src/lib/agent-workbench/runnerWorkflowViewModel.ts`
- Create: `src/lib/agent-workbench/runnerWorkflowViewModel.test.ts`
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.ts`
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.test.ts`
- Create: `src/components/agent-workbench/RunnerWorkflowPanel.tsx`
- Modify: `src/components/agent-workbench/AgentWorkbenchShell.tsx`

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- `src-tauri/src/**`
- `src/lib/api.ts`
- provider transport, runner, mutation, execute, Cookie or storage writer files

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench/runnerWorkflowViewModel.test.ts
```

Expected before implementation: FAIL because runner workflow read model does not exist.

**Implementation steps:**

- [ ] Add tests projecting execution request summary, target refs, classification, sandbox plan, resource limits, permission request, approval decision, mock result, observation, cleanup metadata and audit events.
- [ ] Add tests proving read model title/output state is exactly `Execute / Code Runner Contract Preview`.
- [ ] Add tests proving raw provider payload, raw tool output, API key, Authorization, Cookie and real note content do not appear in Workbench projection.
- [ ] Attach P14 projection to `workbenchTaskFlow.ts` only when runtime reports P14 preview data; keep P13 patch workflow projection intact.
- [ ] Add read-only `RunnerWorkflowPanel` without buttons that run commands, execute code, run tests, run stress tests, apply patches, write files, delete, rollback, call Tauri, call provider or read Cookie pages.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench/runnerWorkflowViewModel.test.ts src/lib/agent-workbench/workbenchTaskFlow.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: Workbench runner projection tests, agent-workbench suite and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'onClick=.*run|onClick=.*execute|onClick=.*test|onClick=.*apply|onClick=.*write|onClick=.*delete|onClick=.*rollback|applyPatch\(|patch apply|writeFile|removeFile|unlink|spawn\(|child_process|exec\(|execute runner|code runner|Cookie-backed|cookie|Authorization|apiKey|sk-[A-Za-z0-9]|raw provider payload|raw tool output|buildPrompt|prompt construction|@tauri-apps/api/core|\binvoke\s*\(' src/lib/agent-workbench src/components/agent-workbench
```

Expected: no direct execution controls, mutation controls, secret/raw payload exposure, prompt construction or direct Tauri calls.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-workbench/runnerWorkflowViewModel.ts src/lib/agent-workbench/runnerWorkflowViewModel.test.ts src/lib/agent-workbench/workbenchTaskFlow.ts src/lib/agent-workbench/workbenchTaskFlow.test.ts src/components/agent-workbench/RunnerWorkflowPanel.tsx src/components/agent-workbench/AgentWorkbenchShell.tsx
git diff --cached --name-only
```

Expected: only read-model and read-only component files are staged.

**Commit message:**

```powershell
git commit -m "feat: project p14 runner workflow preview"
```

## Task 7: API/Tauri No-Op Boundary Audit

**Allowed files:**
- Modify: `src/lib/api.ts` only if an unavailable/no-op wrapper is explicitly needed
- Modify: `src/lib/apiContract.ts` only if a type-only contract is explicitly needed
- Modify: `src/lib/apiBoundary.test.ts` only for boundary tests
- Read-only: `src-tauri/src/**`

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- package / lock / config files
- Rust process execution implementation
- Rust file-write, patch-apply, delete, rollback, Cookie reader, DB/FS storage or migration implementation

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/apiBoundary.test.ts
```

Expected before implementation: FAIL only if a new P14 unavailable/no-op boundary assertion is added first. If no wrapper is needed, this task may remain read-only with no staged changes.

**Implementation steps:**

- [ ] Prefer no production change if P14 can stay fully runtime/read-model only.
- [ ] If a wrapper is required, expose unavailable/no-op contract shape only; it must return `unavailable`, `reserved`, `denied` or `blocked` and must not call a Tauri execution or mutation command.
- [ ] Add or update boundary tests proving no component outside `src/lib/api.ts` imports `@tauri-apps/api/core` or calls `invoke`.
- [ ] Audit wrapper params for absence of API key, Authorization, Cookie, raw provider payload, raw tool output and real note content.
- [ ] Do not add Rust code that starts processes, runs code, writes files, applies patches, deletes, rolls back, reads Cookie pages or writes durable storage.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/apiBoundary.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'
```

Expected: API boundary tests and typecheck pass; direct Tauri audit is no-hit outside allowed boundaries.

**Boundary audit:**

```powershell
rg -n 'writeFile|removeFile|unlink|applyPatch\(|patch apply|spawn\(|child_process|exec\(|execute runner|code runner|stress tester|delete|rollback|Cookie-backed|raw provider payload|raw tool output|Authorization|apiKey|api_key|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-[A-Za-z0-9]|filesystem durable|database storage|migration' src/lib/api.ts src/lib/apiContract.ts src/lib/apiBoundary.test.ts src-tauri/src
```

Expected: no new execution or mutation command behavior; existing unrelated API/Rust hits must be explained as pre-existing or negative-proof language.

**Exact-path staging:**

```powershell
git add -- src/lib/api.ts src/lib/apiContract.ts src/lib/apiBoundary.test.ts
git diff --cached --name-only
```

Expected: only API boundary files that actually changed are staged. If none changed, no staging occurs.

**Commit message:**

```powershell
git commit -m "feat: gate p14 runner api boundary"
```

If no files changed, skip commit and report no-op boundary audit.

## Task 8: Boundary Audit And Handoff

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
rg -n 'writeFile|removeFile|unlink|applyPatch\(|patch apply|spawn\(|child_process|exec\(|execute runner|code runner|stress tester|Cookie-backed|delete|rollback|database storage|filesystem durable|migration|AiSidebar' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts src-tauri/src
rg -n 'AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|production-ready|ready: true|isReady: true' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

Expected: direct Tauri audit no-hit outside allowed boundaries; secret/cookie/raw payload hits only negative-proof tests or safe existing boundary references; forbidden capability hits only unavailable/reserved/blocked/negative-proof language; status contains only intended files before handoff staging; staged paths are empty before handoff staging.

**Implementation steps:**

- [ ] Append a P14 handoff section to `docs/agent-workbench/handoff-p4.md`.
- [ ] Record output state as **Execute / Code Runner Contract Preview**.
- [ ] Record what P14 froze and what remains forbidden.
- [ ] Record actual verification command results and scoped audit hits.
- [ ] State that P14 does not implement production-ready autonomous Agent, real process execution, code runner, stress tester, patch apply, write mutation, delete, rollback execution, Cookie-backed reader, DB/FS durable storage, migration execution, raw payload storage, old AiSidebar migration or AI upgrade completion.

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
git commit -m "docs: record p14 runner workflow handoff"
```

## Task 9: Supervisor Acceptance

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
rg -n 'writeFile|removeFile|unlink|applyPatch\(|patch apply|spawn\(|child_process|exec\(|execute runner|code runner|stress tester|Cookie-backed|delete|rollback|database storage|filesystem durable|migration|AiSidebar' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts src-tauri/src
```

Expected: checkout is clean, staged paths empty, P14 commits present, verification passes or blockers are recorded precisely, audits are no-hit or scoped to contract/test literals with explanation.

**Supervisor report shape:**

```text
Verdict:
P14 output state:
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

This current docs-only P14 worker must run:

```powershell
rg -n 'P14|Execute / Code Runner Contract Preview|execute|runner|sandbox|mock runner|P13|Patch / Write Workflow Contract Preview' docs/superpowers/specs/2026-07-08-p14-execute-code-runner-contract-freeze-design.md docs/superpowers/plans/2026-07-08-p14-execute-code-runner-contract.md
$placeholderPattern = ('TO' + 'DO|TB' + 'D|待' + '补|以' + '后再补|占' + '位')
rg -n $placeholderPattern docs/superpowers/specs/2026-07-08-p14-execute-code-runner-contract-freeze-design.md docs/superpowers/plans/2026-07-08-p14-execute-code-runner-contract.md
rg -n 'production-ready|AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|ready: true|isReady: true|spawn\(|Command|child_process|exec\(|writeFile|removeFile|unlink|applyPatch\(|patch apply|Cookie-backed reader implementation|database storage|filesystem durable' docs/superpowers/specs/2026-07-08-p14-execute-code-runner-contract-freeze-design.md docs/superpowers/plans/2026-07-08-p14-execute-code-runner-contract.md
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

Expected:

- First `rg` finds the phase name, output state, runner, sandbox, mock runner, P13 and P13 output state.
- Placeholder audit is no-hit.
- Capability audit hits only forbidden/non-goal/reserved/no-op language and no implementation claim.
- Filtered status contains only the two P14 docs before staging.
- Staged paths are empty before exact-path staging.

Then stage and commit exactly:

```powershell
git add -- docs/superpowers/specs/2026-07-08-p14-execute-code-runner-contract-freeze-design.md docs/superpowers/plans/2026-07-08-p14-execute-code-runner-contract.md
git diff --cached --name-only
git commit -m "docs: define p14 execute runner contract"
```

Expected staged paths:

```text
docs/superpowers/specs/2026-07-08-p14-execute-code-runner-contract-freeze-design.md
docs/superpowers/plans/2026-07-08-p14-execute-code-runner-contract.md
```

## Handoff Template For Future Workers

```text
Current phase:
P14 Execute / Code Runner Contract Freeze

Responsible slice:
Use the exact task title assigned by the supervisor, such as Task 2 Runner Request Normalizer / Policy Classifier.

Input state:
Patch / Write Workflow Contract Preview

Target output state:
Execute / Code Runner Contract Preview

Allowed files:
Use only the exact allowed paths listed under the assigned task in this plan.

Forbidden files:
notes/**
src/components/ai/**
package / lock / config files
true process execution / code runner / stress tester
true patch apply / write mutation / delete / rollback execution / Cookie surfaces
true DB / FS durable writes
raw provider payload / raw tool output storage
old AiSidebar migration

Required reading:
AGENTS.md
P14 spec
P14 plan
P13 spec
P13 plan
P12 spec
P12 plan
P11 spec
P11 plan
docs/agent-workbench/handoff-p4.md P10/P11/P12/P13/P14 sections

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
production autonomous Agent, true process execution, code runner, stress tester, true patch apply, write mutation, delete, rollback execution, Cookie-backed reader, DB/FS durable storage, migration execution, old AiSidebar migration
```

## Plan Self-Review

- Spec coverage: tasks cover execution request envelope, target refs, runner capability status, sandbox policy metadata, permission request, approval decision read model, command/language/test-run classification, mock runner results, bounded observations, resource limits, rollback/cleanup/recovery metadata, audit event taxonomy, Workbench read-only projection, API/Tauri no-op boundary, handoff and supervisor acceptance.
- Scope control: plan does not implement real process execution, code runner, stress tester, patch apply, write mutation, delete, rollback execution, Cookie-backed reader, DB/FS durable storage, migration execution, raw payload retention or legacy AiSidebar migration.
- Generality: execute / runner workflow supports general Agent sessions; OI remains profile/evidence/workspace specialization through refs.
- Verification: every implementation task has RED, GREEN, exact-path staging, commit-only closeout and boundary audit requirements.
- Dependency order: true execution remains unavailable unless a future approved phase freezes safe command boundary, sandbox implementation, path safety, resource enforcement, cleanup, rollback and recovery boundaries.
