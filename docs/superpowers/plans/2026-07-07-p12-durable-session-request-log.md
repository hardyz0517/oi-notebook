# P12 Durable Session / Request Log / Replay Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement P12 as `Durable Session / Request Log / Replay Persistence Contract Preview`: typed durable session metadata, safe request/audit log policy, in-memory session store adapter contract, API/Tauri boundary shape, deterministic replay projector, Workbench read-only session history projection, and audit handoff.

**Architecture:** P12 builds on P11 bounded multi-step loop preview. Runtime owns session/event/request-log contracts and redaction policy; storage is behind an interface; the default implementation is in-memory / fixture-backed only; Workbench consumes read models. P12 does not implement real database storage, real filesystem durable log writing, real migrations, real patch/write/delete/rollback, execute/code runner, Cookie-backed reader, raw provider payload retention, or legacy AiSidebar migration.

**Tech Stack:** TypeScript, Vitest, React read-only Workbench components, existing `src/lib/agent-runtime/**`, `src/lib/agent-workbench/**`, `src/components/agent-workbench/**`, existing `src/lib/api.ts` boundary wrappers, optional narrow Rust/Tauri command shape tests, and docs handoff in `docs/agent-workbench/handoff-p4.md`.

---

## 0. Phase Boundary

Phase name: **P12 Durable Session / Request Log / Replay Persistence Contract Freeze**

Input state: **Multi-Step Model Loop / Tool-Call Continuation Contract Preview**

Output state: **Durable Session / Request Log / Replay Persistence Contract Preview**

Required reading:

- `AGENTS.md`
- `docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md`
- `docs/NoteX_Agent_Workbench_PRD.md`
- `docs/agent-workbench/handoff-p4.md`
- `docs/superpowers/specs/2026-07-07-p11-multi-step-model-loop-tool-continuation-freeze-design.md`
- `docs/superpowers/plans/2026-07-07-p11-multi-step-model-loop-tool-continuation.md`
- `docs/superpowers/specs/2026-07-07-p12-durable-session-request-log-freeze-design.md`
- `docs/superpowers/plans/2026-07-07-p12-durable-session-request-log.md`

Global forbidden zones:

- Do not modify `notes/**`.
- Do not modify `src/components/ai/**`.
- Do not modify package, lock, or config files.
- Do not implement real patch apply, write mutation, delete, rollback, execute/code runner, Cookie-backed reader, raw provider payload storage, raw tool output storage, real DB schema, real migration, or filesystem durable log writer.
- Do not let React components write storage, build prompts, route tools, decide continuation, call providers, or hold API keys / Authorization headers / cookies.
- Do not bypass `src/lib/api.ts`.
- Do not use `git add .`, `git add -A`, or `git commit -a`.
- Do not push unless supervisor explicitly asks.

Default storage ruling: P12 is contract/preview. If a later worker wants true durable storage, that worker must first obtain a new approved storage phase that freezes storage path, encryption/permission model, migration/rollback, backup, corruption recovery, redaction proofs, retention/export/delete controls, and destructive-operation approval. This plan intentionally avoids true DB / FS writes.

## File Structure

- Create: `src/lib/agent-runtime/durableSessionTypes.ts` for P12 session metadata, event log envelope, checkpoint refs, schema version, storage capability status and corruption/migration result types.
- Create: `src/lib/agent-runtime/durableSessionTypes.test.ts` for contract and negative-proof tests.
- Create: `src/lib/agent-runtime/requestLogPolicy.ts` for safe request/audit log record shape and redaction classification.
- Create: `src/lib/agent-runtime/requestLogPolicy.test.ts` for redaction and forbidden-payload tests.
- Create: `src/lib/agent-runtime/inMemorySessionStore.ts` for `AgentSessionStore` / `RequestAuditLogStore` interface plus in-memory adapter contract.
- Create: `src/lib/agent-runtime/inMemorySessionStore.test.ts` for append/read/version/corruption tests without DB / FS writes.
- Modify: `src/lib/api.ts` only if Task 4 freezes frontend wrapper shape for read-only durable session metadata.
- Modify: `src/lib/apiContract.ts` only if Task 4 adds opaque contract typings.
- Optional modify: `src-tauri/src/**` only in Task 4 if the supervisor accepts type/command shape stubs; default plan can complete without Rust mutation.
- Create: `src/lib/agent-runtime/replayPersistenceProjector.ts` for deterministic projection from event log to P11 read model / P12 history read model.
- Create: `src/lib/agent-runtime/replayPersistenceProjector.test.ts` for ordering, schema, migration and corruption tests.
- Create: `src/lib/agent-workbench/sessionHistoryViewModel.ts` for Workbench session history / audit trail read model.
- Create: `src/lib/agent-workbench/sessionHistoryViewModel.test.ts` for redaction and read-only projection tests.
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.ts` and `src/lib/agent-workbench/workbenchTaskFlow.test.ts` only to attach P12 history projection when runtime provides P12 preview data.
- Create: `src/components/agent-workbench/SessionHistoryPanel.tsx` for read-only display.
- Modify: `src/components/agent-workbench/AgentWorkbenchShell.tsx` only to display the read-only panel.
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
- `src-tauri/src/**` unless Task 4 explicitly needs read-only inspection

**RED commands:** none; this is a read-only audit task.

**GREEN commands:**

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -12 --decorate
rg -n 'P12|Durable Session|Request Log|Replay Persistence|Multi-Step Model Loop / Tool-Call Continuation Contract Preview|be33f80bc65159c094ecd06bf155afa3061ce23d' docs/superpowers/specs/2026-07-07-p12-durable-session-request-log-freeze-design.md docs/superpowers/plans/2026-07-07-p12-durable-session-request-log.md docs/agent-workbench/handoff-p4.md
```

Expected: filtered status is clean or existing unrelated changes are named and left untouched; staged paths are empty; P11 input state, P12 output state and upstream provenance are visible.

**Boundary audit:**

```powershell
rg -n 'real patch|write mutation|delete|rollback|execute|code runner|Cookie-backed|raw provider payload|raw tool output|database storage|filesystem durable|AiSidebar' docs/superpowers/specs/2026-07-07-p12-durable-session-request-log-freeze-design.md
```

Expected: hits are in forbidden / non-goal language only.

**Exact-path staging:** none.

**Commit message:** none.

## Task 1: Persistence Contract Types / Schema Versioning

**Allowed files:**
- Create: `src/lib/agent-runtime/durableSessionTypes.ts`
- Create: `src/lib/agent-runtime/durableSessionTypes.test.ts`
- Modify: `src/lib/agent-runtime/agentTypes.ts` only if a narrow exported ref type is required
- Modify: `src/lib/agent-runtime/agentTypes.test.ts` only for narrow compatibility coverage

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- `src-tauri/src/**`
- Workbench components
- storage adapter with real DB / FS write behavior

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/durableSessionTypes.test.ts
```

Expected before implementation: FAIL because `durableSessionTypes.ts` does not exist or lacks P12 exports.

**Implementation steps:**

- [ ] Add tests for `DurableAgentSessionMetadata` with `sessionId`, `schemaVersion`, `phaseName`, `inputState`, `outputState`, `workspaceRefs`, `evidenceRefs`, `modelRefs`, `providerRefs`, `toolRefs`, `permissionDecisionRefs`, `observationRefs`, `requestLogRefs`, `replayCheckpointRefs`, `privacyPolicyId`, `redactionPolicyId`, `storageAdapterKind` and `capabilityStatuses`.
- [ ] Add tests for `DurableAgentEventLogEntry` with monotonic `sequence`, ids, `eventType`, `redactionClass`, `replayVisibility`, `summary` and refs.
- [ ] Add tests proving timestamp ordering is not used for replay ordering when sequence is present.
- [ ] Add tests for schema version support and structured `unsupported-schema-version` result.
- [ ] Add tests that P12 output state is exactly `Durable Session / Request Log / Replay Persistence Contract Preview`.
- [ ] Implement only types, constants and pure validators needed by tests.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/durableSessionTypes.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: focused tests and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'fs\.|writeFile|removeFile|unlink|sqlite|database|migration|localStorage|indexedDB|Authorization|apiKey|api_key|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-[A-Za-z0-9]|cookie|raw provider payload|raw tool output' src/lib/agent-runtime/durableSessionTypes.ts src/lib/agent-runtime/durableSessionTypes.test.ts
```

Expected: no real storage, secret, cookie, raw payload or browser storage behavior; any forbidden literal appears only as negative-proof text.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-runtime/durableSessionTypes.ts src/lib/agent-runtime/durableSessionTypes.test.ts src/lib/agent-runtime/agentTypes.ts src/lib/agent-runtime/agentTypes.test.ts
git diff --cached --name-only
```

Expected: only P12 type files plus narrowly touched shared type files are staged.

**Commit message:**

```powershell
git commit -m "feat: define p12 durable session contract"
```

## Task 2: Safe Request Log Redaction Policy

**Allowed files:**
- Create: `src/lib/agent-runtime/requestLogPolicy.ts`
- Create: `src/lib/agent-runtime/requestLogPolicy.test.ts`
- Modify: `src/lib/agent-runtime/durableSessionTypes.ts` only for shared request log refs
- Modify: `src/lib/agent-runtime/durableSessionTypes.test.ts` only for shared ref coverage

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- `src-tauri/src/**`
- provider transport files
- storage writer files

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/requestLogPolicy.test.ts
```

Expected before implementation: FAIL because `requestLogPolicy.ts` does not exist.

**Implementation steps:**

- [ ] Add tests for safe `RequestAuditLogRecord` fields: `requestLogId`, `sessionId`, `turnId`, `stepId`, `providerId`, `modelId`, `requestKind`, `permissionDecisionId`, `redactionDecisionId`, `secretRefId`, `contextBuildId`, `eventIds`, `safeInputSummary`, `safeOutputSummary`, `usageSummary`, `status`, `safeError`, `createdAt`, `schemaVersion`.
- [ ] Add tests that API key, Authorization header, Cookie, raw provider request, raw provider response, raw tool output and real note content are dropped or replaced by safe redaction markers.
- [ ] Add tests that `secretRefId` is preserved as an opaque id without exposing the secret value.
- [ ] Add tests for redaction classes: `secret`, `cookie`, `local-note`, `user-input`, `derived-evidence`, `provider-payload`, `tool-output`, `safe-metadata`.
- [ ] Implement pure redaction/classification helpers; do not store records in DB / FS.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/requestLogPolicy.test.ts src/lib/agent-runtime/durableSessionTypes.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: request log tests, durable session tests, agent-runtime suite and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'writeFile|sqlite|database storage|filesystem durable|localStorage|indexedDB|Authorization|apiKey|api_key|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-[A-Za-z0-9]|Cookie|raw provider payload|raw tool output|notes/' src/lib/agent-runtime/requestLogPolicy.ts src/lib/agent-runtime/requestLogPolicy.test.ts
```

Expected: sensitive strings appear only in negative-proof tests and are not emitted by production helper output.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-runtime/requestLogPolicy.ts src/lib/agent-runtime/requestLogPolicy.test.ts src/lib/agent-runtime/durableSessionTypes.ts src/lib/agent-runtime/durableSessionTypes.test.ts
git diff --cached --name-only
```

Expected: only request log policy files plus narrowly touched durable session type files are staged.

**Commit message:**

```powershell
git commit -m "feat: redact p12 request audit logs"
```

## Task 3: In-Memory Session Store Adapter Contract

**Allowed files:**
- Create: `src/lib/agent-runtime/inMemorySessionStore.ts`
- Create: `src/lib/agent-runtime/inMemorySessionStore.test.ts`
- Modify: `src/lib/agent-runtime/durableSessionTypes.ts` only for store interface types
- Modify: `src/lib/agent-runtime/requestLogPolicy.ts` only for request log record type reuse

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- `src-tauri/src/**`
- `src/lib/api.ts`
- real DB / FS storage writer files

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/inMemorySessionStore.test.ts
```

Expected before implementation: FAIL because `inMemorySessionStore.ts` does not exist.

**Implementation steps:**

- [ ] Add tests for `AgentSessionStore` interface methods that append event log entries, read session metadata, read ordered events, read checkpoints and read request audit records.
- [ ] Add tests that event append rejects duplicate sequence, sequence gaps, session mismatch and unsupported schema version.
- [ ] Add tests that store keeps data in memory only and exposes `storageAdapterKind: "in-memory-preview"`.
- [ ] Add tests that request audit records pass through `requestLogPolicy` before storage.
- [ ] Add tests that store returns structured corruption results instead of repairing or mutating records silently.
- [ ] Implement an in-memory adapter using arrays/maps only; do not use filesystem, database, browser storage, Tauri or network.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/inMemorySessionStore.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/requestLogPolicy.test.ts src/lib/agent-runtime/durableSessionTypes.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: in-memory store tests, related policy/type tests, agent-runtime suite and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'fs\.|writeFile|readFile|removeFile|unlink|sqlite|database|migration|localStorage|indexedDB|@tauri-apps/api/core|\binvoke\s*\(|fetch\(|XMLHttpRequest|EventSource|WebSocket' src/lib/agent-runtime/inMemorySessionStore.ts src/lib/agent-runtime/inMemorySessionStore.test.ts
```

Expected: no real durable storage, browser storage, Tauri or network behavior.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-runtime/inMemorySessionStore.ts src/lib/agent-runtime/inMemorySessionStore.test.ts src/lib/agent-runtime/durableSessionTypes.ts src/lib/agent-runtime/requestLogPolicy.ts
git diff --cached --name-only
```

Expected: only in-memory store and narrowly touched shared contract files are staged.

**Commit message:**

```powershell
git commit -m "feat: add p12 in-memory session store contract"
```

## Task 4: API/Tauri Boundary Contract For Durable Session Metadata

**Allowed files:**
- Modify: `src/lib/api.ts`
- Modify: `src/lib/apiContract.ts`
- Create or modify: focused API boundary tests if existing test layout requires it, preferably `src/lib/apiBoundary.test.ts`
- Optional read-only inspection: `src-tauri/src/**`

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- package / lock / config files
- real Rust DB / FS mutation implementation
- provider transport behavior changes

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/apiBoundary.test.ts
```

Expected before implementation: FAIL only if the new P12 boundary assertion is added first and wrappers are missing; if no wrapper is needed, this task may remain read-only with no staged changes.

**Implementation steps:**

- [ ] Prefer no production change if runtime can stay fully in-memory for P12.
- [ ] If a wrapper is required, add type-only or read-only command wrapper names that accept opaque ids, schema version, safe summaries and refs only.
- [ ] Add tests that no component outside `src/lib/api.ts` imports `@tauri-apps/api/core` or calls `invoke`.
- [ ] Add tests or audit notes proving wrapper params do not include API key, Authorization, Cookie, raw provider payload, raw tool output or real note content.
- [ ] Do not add Rust code that writes DB / FS; if Rust shape is required, freeze only command/type contract and document that implementation remains unavailable.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/apiBoundary.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'
```

Expected: API boundary tests and typecheck pass; direct Tauri audit is no-hit outside allowed boundaries.

**Boundary audit:**

```powershell
rg -n 'Authorization|apiKey|api_key|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-[A-Za-z0-9]|cookie|raw provider payload|raw tool output|noteContent|notesContent|database|migration|writeFile|filesystem durable' src/lib/api.ts src/lib/apiContract.ts src/lib/apiBoundary.test.ts
```

Expected: no frontend secret/raw payload/note content durable logging behavior; existing unrelated provider settings wrapper hits must be explained if present.

**Exact-path staging:**

```powershell
git add -- src/lib/api.ts src/lib/apiContract.ts src/lib/apiBoundary.test.ts
git diff --cached --name-only
```

Expected: only API boundary files that actually changed are staged.

**Commit message:**

```powershell
git commit -m "feat: freeze p12 session api boundary"
```

## Task 5: Replay Loader / Deterministic Projector

**Allowed files:**
- Create: `src/lib/agent-runtime/replayPersistenceProjector.ts`
- Create: `src/lib/agent-runtime/replayPersistenceProjector.test.ts`
- Modify: `src/lib/agent-runtime/durableSessionTypes.ts` only for projector input/output types
- Modify: `src/lib/agent-runtime/modelLoopTypes.ts` only for P11 read model compatibility types

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- `src-tauri/src/**`
- `src/lib/api.ts`
- real provider/tool execution files
- real storage writer files

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/replayPersistenceProjector.test.ts
```

Expected before implementation: FAIL because `replayPersistenceProjector.ts` does not exist.

**Implementation steps:**

- [ ] Add tests projecting ordered durable events into a P11-style turn/step/tool/permission/observation timeline.
- [ ] Add tests that duplicate sequence, missing sequence, session mismatch, step mismatch, unknown schema, redaction violation and corrupt checkpoint return structured failure.
- [ ] Add tests that replay ordering uses sequence rather than timestamp.
- [ ] Add tests that replay never invokes tool transport, provider request, patch apply, write, delete, rollback, execute or Cookie reader.
- [ ] Add tests that migration strategy is reported as read-only plan metadata, not executed.
- [ ] Implement a pure projector from input events/checkpoints to read model; no DB / FS / network / Tauri access.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/replayPersistenceProjector.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: projector tests, agent-runtime suite and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'runTool|execute|applyPatch|patch apply|writeFile|removeFile|unlink|fetch\(|@tauri-apps/api/core|\binvoke\s*\(|Cookie-backed|cookie|database|migration' src/lib/agent-runtime/replayPersistenceProjector.ts src/lib/agent-runtime/replayPersistenceProjector.test.ts
```

Expected: no replay-triggered execution or storage mutation; migration appears only as read-only strategy/result text.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-runtime/replayPersistenceProjector.ts src/lib/agent-runtime/replayPersistenceProjector.test.ts src/lib/agent-runtime/durableSessionTypes.ts src/lib/agent-runtime/modelLoopTypes.ts
git diff --cached --name-only
```

Expected: only projector and narrowly touched type files are staged.

**Commit message:**

```powershell
git commit -m "feat: project p12 durable replay logs"
```

## Task 6: Workbench Read-Only Session History Projection

**Allowed files:**
- Create: `src/lib/agent-workbench/sessionHistoryViewModel.ts`
- Create: `src/lib/agent-workbench/sessionHistoryViewModel.test.ts`
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.ts`
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.test.ts`
- Create: `src/components/agent-workbench/SessionHistoryPanel.tsx`
- Modify: `src/components/agent-workbench/AgentWorkbenchShell.tsx`

**Forbidden files:**
- `notes/**`
- `src/components/ai/**`
- `src-tauri/src/**`
- `src/lib/api.ts`
- mutation / execute / Cookie / storage writer files

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench/sessionHistoryViewModel.test.ts
```

Expected before implementation: FAIL because session history read model does not exist.

**Implementation steps:**

- [ ] Add tests projecting session metadata, event count, checkpoint refs, request audit records, corruption warnings and output state.
- [ ] Add tests proving raw provider payload, raw tool output, API key, Authorization, Cookie and real note content do not appear in the read model.
- [ ] Add tests proving visible title/output state is exactly `Durable Session / Request Log / Replay Persistence Contract Preview`.
- [ ] Attach P12 projection to `workbenchTaskFlow.ts` only when runtime supplies P12 preview data; keep P8 session replay and P11 model loop previews intact.
- [ ] Add read-only `SessionHistoryPanel` without buttons that execute tools, call provider, apply patch, write files, delete, rollback, run code or read Cookie pages.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench/sessionHistoryViewModel.test.ts src/lib/agent-workbench/workbenchTaskFlow.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: Workbench history tests, agent-workbench suite and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'onClick=.*execute|applyPatch|patch apply|run code|code runner|delete|rollback|Cookie-backed|cookie|Authorization|apiKey|sk-[A-Za-z0-9]|raw provider payload|raw tool output|buildPrompt|prompt construction|@tauri-apps/api/core|\binvoke\s*\(' src/lib/agent-workbench src/components/agent-workbench
```

Expected: no direct execution controls, secret/raw payload exposure, prompt construction or direct Tauri calls.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-workbench/sessionHistoryViewModel.ts src/lib/agent-workbench/sessionHistoryViewModel.test.ts src/lib/agent-workbench/workbenchTaskFlow.ts src/lib/agent-workbench/workbenchTaskFlow.test.ts src/components/agent-workbench/SessionHistoryPanel.tsx src/components/agent-workbench/AgentWorkbenchShell.tsx
git diff --cached --name-only
```

Expected: only read-model and read-only component files are staged.

**Commit message:**

```powershell
git commit -m "feat: project p12 session history"
```

## Task 7: Boundary Audit And Handoff

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
rg -n 'Authorization|apiKey|api_key|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-[A-Za-z0-9]|cookie|raw provider payload|raw tool output' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts
rg -n 'localStorage|indexedDB|database storage|request log persistence|session storage|durable log writer|filesystem durable|migration' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts src-tauri/src
rg -n 'patch apply|patch-apply|execute runner|code runner|Cookie-backed|delete|rollback|AiSidebar' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts src-tauri/src
rg -n 'AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|production-ready|ready: true|isReady: true' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

Expected: direct Tauri audit no-hit outside allowed boundaries; secret/cookie/raw payload hits are only negative-proof tests or safe existing API boundary references; storage hits are contract/preview or unavailable language only; forbidden capability hits are unavailable/reserved/negative-proof language; status contains only intended files before handoff staging; staged paths are empty before handoff staging.

**Implementation steps:**

- [ ] Append a P12 handoff section to `docs/agent-workbench/handoff-p4.md`.
- [ ] Record output state as **Durable Session / Request Log / Replay Persistence Contract Preview**.
- [ ] Record what P12 froze and what remains forbidden.
- [ ] Record actual verification command results and any scoped audit hits.
- [ ] State that P12 does not implement production-ready autonomous Agent, real DB / FS persistence, real patch/write/delete/rollback/execute/Cookie, raw provider payload storage, old AiSidebar migration or AI upgrade completion.

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
git commit -m "docs: record p12 durable session handoff"
```

## Task 8: Supervisor Acceptance

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
rg -n 'Authorization|apiKey|api_key|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-[A-Za-z0-9]|cookie|raw provider payload|raw tool output' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts
rg -n 'localStorage|indexedDB|database storage|request log persistence|session storage|durable log writer|filesystem durable|migration' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts src-tauri/src
rg -n 'patch apply|patch-apply|execute runner|code runner|Cookie-backed|delete|rollback|AiSidebar' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts src-tauri/src
```

Expected: checkout is clean, staged paths empty, P12 commits present, verification passes or blockers are recorded precisely, audits are no-hit or scoped to contract/test literals with explanation.

**Supervisor report shape:**

```text
Verdict:
P12 output state:
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

This current docs-only P12 worker must run:

```powershell
rg -n 'P12|Durable Session|Request Log|Replay Persistence|be33f80bc65159c094ecd06bf155afa3061ce23d' docs/superpowers/specs/2026-07-07-p12-durable-session-request-log-freeze-design.md docs/superpowers/plans/2026-07-07-p12-durable-session-request-log.md
$placeholderPattern = ('TO' + 'DO|TB' + 'D|待' + '补|以' + '后再补|占' + '位')
rg -n $placeholderPattern docs/superpowers/specs/2026-07-07-p12-durable-session-request-log-freeze-design.md docs/superpowers/plans/2026-07-07-p12-durable-session-request-log.md
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

Expected:

- First `rg` finds the phase name, output state, durable session/request-log/replay persistence terms and upstream commit provenance.
- Placeholder audit is no-hit.
- Filtered status contains only the two P12 docs before staging.
- Staged paths are empty before exact-path staging.

Then stage and commit exactly:

```powershell
git add -- docs/superpowers/specs/2026-07-07-p12-durable-session-request-log-freeze-design.md docs/superpowers/plans/2026-07-07-p12-durable-session-request-log.md
git diff --cached --name-only
git commit -m "docs: define p12 durable session request log contract"
```

Expected staged paths:

```text
docs/superpowers/specs/2026-07-07-p12-durable-session-request-log-freeze-design.md
docs/superpowers/plans/2026-07-07-p12-durable-session-request-log.md
```

## Handoff Template For Future Workers

```text
Current phase:
P12 Durable Session / Request Log / Replay Persistence Contract Freeze

Responsible slice:
<Task N name>

Input state:
Multi-Step Model Loop / Tool-Call Continuation Contract Preview

Target output state:
Durable Session / Request Log / Replay Persistence Contract Preview

Allowed files:
<exact paths from this plan>

Forbidden files:
notes/**
src/components/ai/**
package / lock / config files
true DB / FS durable writes
true patch / write / delete / rollback / execute / Cookie surfaces
raw provider payload / raw tool output storage
old AiSidebar migration

Required reading:
AGENTS.md
P12 spec
P12 plan
P11 spec
P11 plan
docs/agent-workbench/handoff-p4.md P9/P10/P11/P12 sections

RED evidence:
<failing test command and failure reason>

GREEN evidence:
<passing test commands>

Boundary audits:
<API boundary, secret/cookie/raw payload, storage, forbidden capability audits>

Staging:
Use git add -- <exact paths>

Commit:
<task-specific commit message>

Push:
No, unless supervisor explicitly asks.

Remaining forbidden capabilities:
production autonomous Agent, true DB / FS persistence, true write, patch apply, delete, rollback, execute/code runner, Cookie-backed reader, raw provider payload storage, raw tool output storage, old AiSidebar migration
```

## Plan Self-Review

- Spec coverage: tasks cover durable session metadata, schema versioning, safe request log redaction, in-memory store interface, API/Tauri boundary, deterministic replay projector, Workbench read-only session history, boundary audits, handoff and supervisor acceptance.
- Scope control: plan does not implement real DB / FS durable storage, true migration, patch/write/delete/rollback, execute/code runner, Cookie-backed reader, raw provider payload retention or legacy AiSidebar migration.
- Generality: persistence core supports general Agent sessions; OI remains profile / evidence / workspace linkage specialization.
- Verification: every implementation task has RED, GREEN, exact-path staging, commit-only closeout and boundary audit requirements.
- Dependency order: storage adapter and Workbench history arrive only after durable types and request-log redaction policy are explicit.
