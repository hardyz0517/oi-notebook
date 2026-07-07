# P11 Multi-Step Model Loop / Tool-Call Continuation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement P11 as `Multi-Step Model Loop / Tool-Call Continuation Contract Preview`: a runtime-owned multi-step continuation contract, tool-call parser/normalizer, registry/router/lifecycle preview, permission gate, redacted observation model, mock/read-only transport, and read-only Workbench timeline.

**Architecture:** P11 builds on P10 one-turn live provider requests. Runtime owns turn/step/attempt state, continuation decisions, tool-call parsing, permission checks, tool lifecycle events, observation redaction, step limits, cancellation and terminal status; provider adapters only supply model output and continuation transport; Workbench consumes read models only. P11 does not implement production autonomous Agent behavior, true patch apply, write, delete, rollback, execute/code runner, Cookie-backed reader, durable session persistence, durable request logs, or legacy AiSidebar migration.

**Tech Stack:** TypeScript, Vitest, React read-only Workbench components, existing `src/lib/agent-runtime/**`, `src/lib/agent-workbench/**`, `src/components/agent-workbench/**`, existing P10 provider model contracts, and docs handoff in `docs/agent-workbench/handoff-p4.md`.

---

## 0. Phase Boundary

Phase name: **P11 Multi-Step Model Loop / Tool-Call Continuation Contract Freeze**

Input state: **Live Provider Request / One-Turn Model Step Contract Preview**

Output state: **Multi-Step Model Loop / Tool-Call Continuation Contract Preview**

Required reading:

- `AGENTS.md`
- `docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md`
- `docs/NoteX_Agent_Workbench_PRD.md`
- `docs/agent-workbench/handoff-p4.md`
- `docs/superpowers/specs/2026-07-07-p10-model-loop-live-provider-request-freeze-design.md`
- `docs/superpowers/plans/2026-07-07-p10-model-loop-live-provider-request.md`
- `docs/superpowers/specs/2026-07-07-p11-multi-step-model-loop-tool-continuation-freeze-design.md`
- `docs/superpowers/plans/2026-07-07-p11-multi-step-model-loop-tool-continuation.md`

Global forbidden zones:

- Do not modify `notes/**`.
- Do not modify `src/components/ai/**`.
- Do not modify package, lock, or config files unless supervisor explicitly approves dependency hydration repair; P11 should not require it.
- Do not implement true write, patch apply, delete, rollback, execute/code runner, Cookie-backed reader, session persistence, durable request log, or legacy AiSidebar migration.
- Do not let React components build prompts, route tools, decide continuation, call providers, or hold API keys / Authorization headers / cookies.
- Do not bypass `src/lib/api.ts`.
- Do not use `git add .`, `git add -A`, or `git commit -a`.
- Do not push unless supervisor explicitly asks.

## File Structure

- Create: `src/lib/agent-runtime/modelLoopTypes.ts` for turn/step/attempt/terminal state, loop event taxonomy, step limit, cancellation and failure types.
- Create: `src/lib/agent-runtime/modelLoopTypes.test.ts` for contract and negative-proof tests.
- Create: `src/lib/agent-runtime/toolCallParser.ts` for provider-output-to-tool-call parsing and safe parse failures.
- Create: `src/lib/agent-runtime/toolCallParser.test.ts` for parser RED/GREEN.
- Create: `src/lib/agent-runtime/toolCallNormalizer.ts` for schema-normalized tool call intent.
- Create: `src/lib/agent-runtime/toolCallNormalizer.test.ts` for normalizer RED/GREEN.
- Create: `src/lib/agent-runtime/toolContinuationRegistry.ts` for P11 preview tool definitions, duplicate guard and unsupported tool failure.
- Create: `src/lib/agent-runtime/toolContinuationRegistry.test.ts` for registry tests.
- Create: `src/lib/agent-runtime/toolContinuationRouter.ts` for route decisions to mock/read-only preview transport.
- Create: `src/lib/agent-runtime/toolContinuationRouter.test.ts` for router tests.
- Create: `src/lib/agent-runtime/toolContinuationLifecycle.ts` for started/completed/failed/unavailable lifecycle events.
- Create: `src/lib/agent-runtime/toolContinuationLifecycle.test.ts` for lifecycle tests.
- Create: `src/lib/agent-runtime/toolPermissionGate.ts` for permission decisions across read, network, write, patch, execute, delete and rollback classes.
- Create: `src/lib/agent-runtime/toolPermissionGate.test.ts` for permission matrix tests.
- Create: `src/lib/agent-runtime/toolObservation.ts` for observation redaction, summarization and continuation visibility.
- Create: `src/lib/agent-runtime/toolObservation.test.ts` for redaction and bounding tests.
- Create: `src/lib/agent-runtime/multiStepModelLoop.ts` for bounded orchestration over injected provider continuation and mock tool transport.
- Create: `src/lib/agent-runtime/multiStepModelLoop.test.ts` for loop RED/GREEN tests.
- Create or modify: `src/lib/agent-workbench/modelLoopViewModel.ts` and `modelLoopViewModel.test.ts` for read-only timeline projection.
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.ts` and `workbenchTaskFlow.test.ts` only to attach P11 read model when runtime reports it.
- Create or modify: `src/components/agent-workbench/ModelLoopTimelinePanel.tsx`; modify `src/components/agent-workbench/AgentWorkbenchShell.tsx` only for read-only display.
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
- package / lock / config files
- `src-tauri/src/**` unless a later task explicitly proves it is only reading

**RED commands:** none; this is a read-only audit task.

**GREEN commands:**

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -12 --decorate
rg -n 'P11|Multi-Step Model Loop|Tool-Call Continuation|Live Provider Request / One-Turn Model Step Contract Preview|be33f80bc65159c094ecd06bf155afa3061ce23d' docs/superpowers/specs/2026-07-07-p11-multi-step-model-loop-tool-continuation-freeze-design.md docs/superpowers/plans/2026-07-07-p11-multi-step-model-loop-tool-continuation.md docs/agent-workbench/handoff-p4.md
```

Expected: filtered status is clean or unrelated existing changes are explicitly named and left untouched; staged paths are empty; P10 input state, P11 output state and upstream provenance are visible.

**Boundary audit:**

```powershell
rg -n 'patch apply|patch-apply|execute runner|code runner|Cookie-backed|session storage|request log persistence|database storage|delete|rollback|AiSidebar' docs/superpowers/specs/2026-07-07-p11-multi-step-model-loop-tool-continuation-freeze-design.md
```

Expected: hits are in forbidden / non-goal language only.

**Exact-path staging:** none.

**Commit message:** none.

## Task 1: Loop Contract Types / Event Taxonomy

**Allowed files:**
- Create: `src/lib/agent-runtime/modelLoopTypes.ts`
- Create: `src/lib/agent-runtime/modelLoopTypes.test.ts`

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- `src-tauri/src/**`
- Workbench components
- provider transport files

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/modelLoopTypes.test.ts
```

Expected before implementation: FAIL because `modelLoopTypes.ts` does not exist or lacks P11 loop contract exports.

**Implementation steps:**

- [ ] Add failing tests that construct a P11 turn with `turnId`, `maxSteps`, `currentStep`, `attempt`, `status`, `terminalStatus` and `outputState: "Multi-Step Model Loop / Tool-Call Continuation Contract Preview"`.
- [ ] Add failing tests for event ordering: `turn.started`, `step.started`, `model.tool_call.requested`, `tool_call.normalized`, `permission.required`, `permission.resolved`, `tool.lifecycle.started`, `tool.lifecycle.completed`, `observation.added`, `step.completed`, `turn.completed`.
- [ ] Add failing tests for terminal statuses: `completed`, `failed`, `cancelled`, `interrupted`, `blocked-by-permission`, `step-limit-exceeded`, `redaction-blocked`, `unsupported-tool`.
- [ ] Implement only type exports and deterministic helpers needed by tests; do not orchestrate provider or tool execution in this task.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/modelLoopTypes.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: focused tests and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'fetch\(|XMLHttpRequest|EventSource|WebSocket|Authorization|apiKey|api_key|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-[A-Za-z0-9]|cookie' src/lib/agent-runtime/modelLoopTypes.ts src/lib/agent-runtime/modelLoopTypes.test.ts
rg -n 'patch apply|execute runner|code runner|Cookie-backed|session storage|request log persistence|database storage|delete|rollback' src/lib/agent-runtime/modelLoopTypes.ts src/lib/agent-runtime/modelLoopTypes.test.ts
```

Expected: no product capability hits; forbidden terms only appear in negative-proof assertions if needed.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-runtime/modelLoopTypes.ts src/lib/agent-runtime/modelLoopTypes.test.ts
git diff --cached --name-only
```

Expected staged paths:

```text
src/lib/agent-runtime/modelLoopTypes.ts
src/lib/agent-runtime/modelLoopTypes.test.ts
```

**Commit message:**

```powershell
git commit -m "feat: define p11 model loop contract"
```

## Task 2: Tool Call Parser / Normalizer Contract

**Allowed files:**
- Create: `src/lib/agent-runtime/toolCallParser.ts`
- Create: `src/lib/agent-runtime/toolCallParser.test.ts`
- Create: `src/lib/agent-runtime/toolCallNormalizer.ts`
- Create: `src/lib/agent-runtime/toolCallNormalizer.test.ts`
- Modify: `src/lib/agent-runtime/modelLoopTypes.ts` only if parser event types need a narrow export
- Modify: `src/lib/agent-runtime/modelLoopTypes.test.ts` only if new event types require coverage

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- `src-tauri/src/**`
- Workbench components
- provider transport files

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/toolCallParser.test.ts src/lib/agent-runtime/toolCallNormalizer.test.ts
```

Expected before implementation: FAIL because parser and normalizer modules do not exist.

**Implementation steps:**

- [ ] Add tests for a provider output containing a tool call intent with `toolCallId`, `toolName`, `argumentsJson`, `stepId` and `sequence`.
- [ ] Add tests for malformed JSON producing `tool_call.invalid` with safe detail and no raw provider payload leak.
- [ ] Add tests for normalization preserving general tool names and not assuming OI-only task shapes.
- [ ] Add tests that unsupported or missing tool names remain normalized intents, leaving registry lookup to Task 3.
- [ ] Implement parser and normalizer as pure functions; do not execute tools, do not call provider, do not call UI.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/toolCallParser.test.ts src/lib/agent-runtime/toolCallNormalizer.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/modelLoopTypes.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: parser, normalizer, loop type tests and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'tool\.started|tool\.output|applyPatch|patch apply|execute runner|code runner|fetch\(|XMLHttpRequest|EventSource|WebSocket|Authorization|apiKey|cookie' src/lib/agent-runtime/toolCallParser.ts src/lib/agent-runtime/toolCallNormalizer.ts src/lib/agent-runtime/toolCallParser.test.ts src/lib/agent-runtime/toolCallNormalizer.test.ts
```

Expected: no true execution, network, patch, execute, secret or cookie behavior.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-runtime/toolCallParser.ts src/lib/agent-runtime/toolCallParser.test.ts src/lib/agent-runtime/toolCallNormalizer.ts src/lib/agent-runtime/toolCallNormalizer.test.ts src/lib/agent-runtime/modelLoopTypes.ts src/lib/agent-runtime/modelLoopTypes.test.ts
git diff --cached --name-only
```

Expected: only parser, normalizer and narrowly touched loop type files are staged.

**Commit message:**

```powershell
git commit -m "feat: normalize p11 tool call intents"
```

## Task 3: Tool Registry / Router / Lifecycle Preview

**Allowed files:**
- Create: `src/lib/agent-runtime/toolContinuationRegistry.ts`
- Create: `src/lib/agent-runtime/toolContinuationRegistry.test.ts`
- Create: `src/lib/agent-runtime/toolContinuationRouter.ts`
- Create: `src/lib/agent-runtime/toolContinuationRouter.test.ts`
- Create: `src/lib/agent-runtime/toolContinuationLifecycle.ts`
- Create: `src/lib/agent-runtime/toolContinuationLifecycle.test.ts`
- Modify: `src/lib/agent-runtime/modelLoopTypes.ts` only for shared lifecycle types

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- `src-tauri/src/**`
- real filesystem writer, patch applier, code runner or Cookie reader modules

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/toolContinuationRegistry.test.ts src/lib/agent-runtime/toolContinuationRouter.test.ts src/lib/agent-runtime/toolContinuationLifecycle.test.ts
```

Expected before implementation: FAIL because registry/router/lifecycle modules do not exist.

**Implementation steps:**

- [ ] Add tests for preview tool registration with schema, permission, exposure, lifecycle and observation policy.
- [ ] Add duplicate registration tests that return structured failure instead of silent overwrite.
- [ ] Add unsupported tool tests returning `unsupported-tool` terminal reason.
- [ ] Add router tests proving all P11 routes go to `mock-preview` or `read-only-preview` transport.
- [ ] Add lifecycle tests for started/completed/failed/unavailable events without true execution side effects.
- [ ] Register only preview tools such as `read-current-context.preview`, `search-evidence.preview`, `oi-problem-context.preview`, and `write-solution-outline.preview`.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/toolContinuationRegistry.test.ts src/lib/agent-runtime/toolContinuationRouter.test.ts src/lib/agent-runtime/toolContinuationLifecycle.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: focused tests, agent-runtime suite and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'fs\.|writeFile|removeFile|unlink|applyPatch|patch apply|execute runner|code runner|spawn|Command|fetch\(|Cookie-backed|cookie' src/lib/agent-runtime/toolContinuationRegistry.ts src/lib/agent-runtime/toolContinuationRouter.ts src/lib/agent-runtime/toolContinuationLifecycle.ts src/lib/agent-runtime/toolContinuationRegistry.test.ts src/lib/agent-runtime/toolContinuationRouter.test.ts src/lib/agent-runtime/toolContinuationLifecycle.test.ts
```

Expected: no true filesystem mutation, command execution, network, patch or Cookie behavior.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-runtime/toolContinuationRegistry.ts src/lib/agent-runtime/toolContinuationRegistry.test.ts src/lib/agent-runtime/toolContinuationRouter.ts src/lib/agent-runtime/toolContinuationRouter.test.ts src/lib/agent-runtime/toolContinuationLifecycle.ts src/lib/agent-runtime/toolContinuationLifecycle.test.ts src/lib/agent-runtime/modelLoopTypes.ts
git diff --cached --name-only
```

Expected: only P11 registry/router/lifecycle files plus narrowly touched shared type file are staged.

**Commit message:**

```powershell
git commit -m "feat: add p11 tool continuation preview registry"
```

## Task 4: Permission / Approval Gate For Tool Calls

**Allowed files:**
- Create: `src/lib/agent-runtime/toolPermissionGate.ts`
- Create: `src/lib/agent-runtime/toolPermissionGate.test.ts`
- Modify: `src/lib/agent-runtime/toolContinuationRegistry.ts` only to attach permission metadata
- Modify: `src/lib/agent-runtime/toolContinuationRegistry.test.ts` only for permission metadata coverage

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- `src-tauri/src/**`
- mutation, patch, execution and Cookie implementations

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/toolPermissionGate.test.ts
```

Expected before implementation: FAIL because `toolPermissionGate.ts` does not exist.

**Implementation steps:**

- [ ] Add tests for permission kinds: `read`, `local-note-search`, `public-network`, `cookie-network`, `write`, `patch-apply`, `execute`, `delete`, `rollback`, `destructive`.
- [ ] Add tests that fixture / explicit-context read can be `auto-allowed`.
- [ ] Add tests that public network is `prompt-required` or `unavailable` but never executes in P11.
- [ ] Add tests that cookie-network, write, patch-apply, execute, delete, rollback and destructive return `unavailable`, `reserved` or `denied`.
- [ ] Add tests that permission decisions are emitted before lifecycle events.
- [ ] Implement a pure decision function; do not connect UI approval to true execution.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/toolPermissionGate.test.ts src/lib/agent-runtime/toolContinuationRegistry.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: permission tests, related registry tests, agent-runtime suite and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'auto.*patch|auto.*execute|auto.*write|applyPatch|patch apply|execute runner|code runner|delete.*allowed|rollback.*allowed|Cookie-backed|cookie' src/lib/agent-runtime/toolPermissionGate.ts src/lib/agent-runtime/toolPermissionGate.test.ts src/lib/agent-runtime/toolContinuationRegistry.ts
```

Expected: no auto-allowed mutation or execution capability.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-runtime/toolPermissionGate.ts src/lib/agent-runtime/toolPermissionGate.test.ts src/lib/agent-runtime/toolContinuationRegistry.ts src/lib/agent-runtime/toolContinuationRegistry.test.ts
git diff --cached --name-only
```

Expected: only permission gate and narrowly touched registry files are staged.

**Commit message:**

```powershell
git commit -m "feat: gate p11 tool continuation permissions"
```

## Task 5: Observation Redaction / Continuation Context

**Allowed files:**
- Create: `src/lib/agent-runtime/toolObservation.ts`
- Create: `src/lib/agent-runtime/toolObservation.test.ts`
- Modify: `src/lib/agent-runtime/modelLoopTypes.ts` only for shared observation types

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- `src-tauri/src/**`
- provider raw transport files
- durable storage modules

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/toolObservation.test.ts
```

Expected before implementation: FAIL because `toolObservation.ts` does not exist.

**Implementation steps:**

- [ ] Add tests that raw tool output containing API key, Authorization header, cookie-like text or secret label is dropped or redacted before continuation.
- [ ] Add tests that large output is summarized and bounded.
- [ ] Add tests that observation includes `observationId`, `sourceToolCallId`, `toolName`, `permissionDecisionId`, `summary`, `boundedContent`, `droppedFields`, `continuationVisibility`.
- [ ] Add tests that OI evidence uses `evidenceRefs` and `workspaceRefs` without making the observation type OI-only.
- [ ] Implement pure observation builder and redactor; do not write request logs or session storage.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/toolObservation.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: observation tests, agent-runtime suite and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'localStorage|indexedDB|database|request log persistence|session storage|writeFile|raw provider payload|Authorization|apiKey|sk-[A-Za-z0-9]|cookie' src/lib/agent-runtime/toolObservation.ts src/lib/agent-runtime/toolObservation.test.ts
```

Expected: secret-like strings appear only in negative-proof tests and are not emitted by production helper output.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-runtime/toolObservation.ts src/lib/agent-runtime/toolObservation.test.ts src/lib/agent-runtime/modelLoopTypes.ts
git diff --cached --name-only
```

Expected: only observation files plus narrowly touched shared type file are staged.

**Commit message:**

```powershell
git commit -m "feat: redact p11 tool observations"
```

## Task 6: Multi-Step Loop Orchestrator With Mock Tool Transport

**Allowed files:**
- Create: `src/lib/agent-runtime/multiStepModelLoop.ts`
- Create: `src/lib/agent-runtime/multiStepModelLoop.test.ts`
- Modify: P11 runtime modules from Tasks 1-5 only when integration requires narrow exports

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- `src-tauri/src/**`
- `src/lib/api.ts`
- `src/lib/apiContract.ts`
- real write / patch / execute / Cookie / persistence files

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/multiStepModelLoop.test.ts
```

Expected before implementation: FAIL because `multiStepModelLoop.ts` does not exist.

**Implementation steps:**

- [ ] Add tests for a two-step loop: step 1 model requests preview tool, runtime normalizes, permission is resolved, mock transport returns observation, step 2 model completes.
- [ ] Add tests that `maxSteps` stops the loop with `step-limit-exceeded`.
- [ ] Add tests that cancellation produces `turn.cancelled` and prevents further continuation.
- [ ] Add tests that permission denial produces `blocked-by-permission`.
- [ ] Add tests that tool failure becomes redacted observation or terminal failure according to policy.
- [ ] Add tests that model output requesting patch apply or execute returns unsupported / reserved failure and never calls a transport.
- [ ] Implement orchestrator using injected provider continuation and injected mock/read-only tool transport.
- [ ] Keep all state in memory; do not add durable storage.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/multiStepModelLoop.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: loop orchestrator tests, agent-runtime suite and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'fetch\(|XMLHttpRequest|EventSource|WebSocket|@tauri-apps/api/core|\binvoke\s*\(|writeFile|removeFile|unlink|spawn|Command|applyPatch|patch apply|execute runner|code runner|Cookie-backed|session storage|request log persistence|database storage' src/lib/agent-runtime/multiStepModelLoop.ts src/lib/agent-runtime/multiStepModelLoop.test.ts
```

Expected: no true transport, mutation, execution, Cookie or persistence behavior.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-runtime/multiStepModelLoop.ts src/lib/agent-runtime/multiStepModelLoop.test.ts src/lib/agent-runtime/modelLoopTypes.ts src/lib/agent-runtime/toolCallParser.ts src/lib/agent-runtime/toolCallNormalizer.ts src/lib/agent-runtime/toolContinuationRegistry.ts src/lib/agent-runtime/toolContinuationRouter.ts src/lib/agent-runtime/toolContinuationLifecycle.ts src/lib/agent-runtime/toolPermissionGate.ts src/lib/agent-runtime/toolObservation.ts
git diff --cached --name-only
```

Expected: only the orchestrator and narrowly touched P11 runtime modules are staged.

**Commit message:**

```powershell
git commit -m "feat: run p11 bounded model loop preview"
```

## Task 7: Workbench Read-Only Loop Projection

**Allowed files:**
- Create or modify: `src/lib/agent-workbench/modelLoopViewModel.ts`
- Create or modify: `src/lib/agent-workbench/modelLoopViewModel.test.ts`
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.ts`
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.test.ts`
- Create or modify: `src/components/agent-workbench/ModelLoopTimelinePanel.tsx`
- Modify: `src/components/agent-workbench/AgentWorkbenchShell.tsx`

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- `src-tauri/src/**`
- `src/lib/api.ts`
- provider transport files
- mutation / execute / Cookie / persistence files

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench/modelLoopViewModel.test.ts
```

Expected before implementation: FAIL because model loop read model does not exist or lacks P11 output state.

**Implementation steps:**

- [ ] Add tests projecting a timeline with turn, step, model delta, tool-call, permission, lifecycle, observation and terminal status.
- [ ] Add tests proving the projection redacts secret-like text and does not expose raw provider payload.
- [ ] Add tests proving Workbench labels the output state exactly as `Multi-Step Model Loop / Tool-Call Continuation Contract Preview`.
- [ ] Attach P11 projection to `workbenchTaskFlow.ts` only when runtime reports a P11 loop result; keep P10 provider projection behavior intact.
- [ ] Add a read-only timeline panel with no buttons that execute tools, apply patches, run code, read Cookie pages, delete, rollback or write files.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench/modelLoopViewModel.test.ts src/lib/agent-workbench/workbenchTaskFlow.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: Workbench projection tests, agent-workbench suite and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'onClick=.*execute|applyPatch|patch apply|run code|code runner|delete|rollback|Cookie-backed|cookie|Authorization|apiKey|sk-[A-Za-z0-9]|buildPrompt|prompt construction' src/lib/agent-workbench src/components/agent-workbench
rg -n '@tauri-apps/api/core|\binvoke\s*\(' src/components/agent-workbench src/lib/agent-workbench
```

Expected: no direct execution controls, secret exposure, prompt construction or direct Tauri calls.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-workbench/modelLoopViewModel.ts src/lib/agent-workbench/modelLoopViewModel.test.ts src/lib/agent-workbench/workbenchTaskFlow.ts src/lib/agent-workbench/workbenchTaskFlow.test.ts src/components/agent-workbench/ModelLoopTimelinePanel.tsx src/components/agent-workbench/AgentWorkbenchShell.tsx
git diff --cached --name-only
```

Expected: only read-model and read-only component files are staged.

**Commit message:**

```powershell
git commit -m "feat: project p11 model loop timeline"
```

## Task 8: Boundary Audit And Handoff

**Allowed files:**
- Modify: `docs/agent-workbench/handoff-p4.md`
- Optional modify: focused tests only when audit-noise cleanup is needed without weakening coverage

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
rg -n 'Authorization|apiKey|api_key|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-[A-Za-z0-9]|cookie' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts
rg -n 'buildPrompt|prompt construction|PromptAssembler|ContextBuilder' src/components src/lib/agent-workbench src/lib/agent-runtime
rg -n 'patch apply|patch-apply|execute runner|code runner|Cookie-backed|session storage|request log persistence|database storage|delete|rollback|AiSidebar' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts src-tauri/src
rg -n 'AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|production-ready|ready: true|isReady: true' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

Expected: direct Tauri audit no-hit outside allowed boundaries; secret/cookie hits are only negative-proof tests or safe API boundary references; forbidden capability hits are only unavailable/reserved/negative-proof language; status contains only intended files before handoff staging; staged paths are empty before handoff staging.

**Implementation steps:**

- [ ] Append a P11 handoff section to `docs/agent-workbench/handoff-p4.md`.
- [ ] Record output state as **Multi-Step Model Loop / Tool-Call Continuation Contract Preview**.
- [ ] Record what P11 froze and what remains forbidden.
- [ ] Record actual verification command results and any scoped audit hits.
- [ ] State that P11 does not implement production-ready autonomous Agent, real patch/write/execute/Cookie/persistence, old AiSidebar migration or durable request log.

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
git commit -m "docs: record p11 model loop handoff"
```

## Task 9: Supervisor Acceptance

**Allowed files:**
- Read-only in supervisor checkout

**Forbidden files:**
- All files unless supervisor explicitly opens a follow-up correction task

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
rg -n 'Authorization|apiKey|api_key|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-[A-Za-z0-9]|cookie' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts
rg -n 'patch apply|patch-apply|execute runner|code runner|Cookie-backed|session storage|request log persistence|database storage|delete|rollback|AiSidebar' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts src-tauri/src
```

Expected: checkout is clean, staged paths empty, P11 commits present, verification passes or blockers are recorded precisely, audits are no-hit or scoped to contract/test literals with explanation.

**Supervisor report shape:**

```text
Verdict:
P11 output state:
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

This current docs-only P11 worker must run:

```powershell
rg -n 'P11|Multi-Step Model Loop|Tool-Call Continuation|be33f80bc65159c094ecd06bf155afa3061ce23d' docs/superpowers/specs/2026-07-07-p11-multi-step-model-loop-tool-continuation-freeze-design.md docs/superpowers/plans/2026-07-07-p11-multi-step-model-loop-tool-continuation.md
$placeholderPattern = ('TO' + 'DO|TB' + 'D|待' + '补|以' + '后再补|占' + '位')
rg -n $placeholderPattern docs/superpowers/specs/2026-07-07-p11-multi-step-model-loop-tool-continuation-freeze-design.md docs/superpowers/plans/2026-07-07-p11-multi-step-model-loop-tool-continuation.md
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

Expected:

- First `rg` finds the phase name, output state, tool-call continuation terms and upstream commit provenance.
- Placeholder audit is no-hit.
- Filtered status contains only the two P11 docs before staging.
- Staged paths are empty before exact-path staging.

Then stage and commit exactly:

```powershell
git add -- docs/superpowers/specs/2026-07-07-p11-multi-step-model-loop-tool-continuation-freeze-design.md docs/superpowers/plans/2026-07-07-p11-multi-step-model-loop-tool-continuation.md
git diff --cached --name-only
git commit -m "docs: define p11 model loop continuation contract"
```

Expected staged paths:

```text
docs/superpowers/specs/2026-07-07-p11-multi-step-model-loop-tool-continuation-freeze-design.md
docs/superpowers/plans/2026-07-07-p11-multi-step-model-loop-tool-continuation.md
```

## Handoff Template For Future Workers

```text
Current phase:
P11 Multi-Step Model Loop / Tool-Call Continuation Contract Freeze

Responsible slice:
<Task N name>

Input state:
Live Provider Request / One-Turn Model Step Contract Preview

Target output state:
Multi-Step Model Loop / Tool-Call Continuation Contract Preview

Allowed files:
<exact paths from this plan>

Forbidden files:
notes/**
src/components/ai/**
package / lock / config files unless explicitly approved
true write / patch apply / execute / Cookie / persistence / old AiSidebar migration surfaces

Required reading:
AGENTS.md
P11 spec
P11 plan
P10 spec
P10 plan
docs/agent-workbench/handoff-p4.md P9/P10/P11 sections

RED evidence:
<failing test command and failure reason>

GREEN evidence:
<passing test commands>

Boundary audits:
<API boundary, secret/cookie, prompt, forbidden capability audits>

Staging:
Use git add -- <exact paths>

Commit:
<task-specific commit message>

Push:
No, unless supervisor explicitly asks.

Remaining forbidden capabilities:
production autonomous Agent, true write, patch apply, execute/code runner, Cookie-backed reader, durable request log, session persistence, old AiSidebar migration
```

## Plan Self-Review

- Spec coverage: tasks cover loop state machine, event taxonomy, parser/normalizer, registry/router/lifecycle preview, permission gate, observation redaction, continuation context, bounded multi-step orchestration, Workbench read-only projection, boundary audits, handoff and supervisor acceptance.
- Scope control: plan does not implement true write, patch apply, execute/code runner, delete, rollback, Cookie-backed reader, durable request log, session persistence or legacy AiSidebar migration.
- Generality: loop, tool-call and observation contracts support general tasks; OI remains profile / capability specialization.
- Verification: every implementation task has RED, GREEN, exact-path staging, commit-only closeout and boundary audit requirements.
- Dependency order: multi-step orchestration arrives only after parser, normalizer, registry/router/lifecycle, permission and observation boundaries are explicit.
