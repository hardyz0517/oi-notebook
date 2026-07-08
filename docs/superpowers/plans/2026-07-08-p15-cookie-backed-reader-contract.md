# P15 Cookie-backed Reader Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement P15 as `Cookie-backed Reader Contract Preview`: typed Cookie-backed reader request envelopes, source boundary policy, permission/read model, redaction/audit contract, no-provider-leak rules, mock/fixture projection and Workbench read-only projection.

**Architecture:** P15 builds on HEAD `8e34519 docs: record p14 runner workflow handoff` and the P14 output state `Execute / Code Runner Contract Preview`. Runtime owns the reader request contract, source boundary, permission and redaction rules; fixture projection supplies deterministic mock observations; Workbench consumes read-only projections; API/Tauri remains no-op for Cookie-backed reading. P15 does not implement real Cookie reading, browser Cookie extraction, Cookie storage, third-party Cookie forwarding, real network reader, DB/FS durable storage, migration execution, patch/write/delete/rollback/execute/code runner/stress tester behavior, old AiSidebar migration, raw payload retention, production-ready autonomous Agent behavior or AI 大升级完成.

**Tech Stack:** TypeScript, Vitest, React read-only Workbench components, existing `src/lib/agent-runtime/**`, `src/lib/agent-workbench/**`, `src/components/agent-workbench/**`, existing `src/lib/api.ts` boundary, optional API/Tauri no-op audit, and docs handoff in `docs/agent-workbench/handoff-p4.md` during implementation closeout only.

---

## 0. Phase Boundary

Phase name: **P15 Cookie-backed Reader Contract Freeze**

Input state: **Execute / Code Runner Contract Preview**

Output state: **Cookie-backed Reader Contract Preview**

Required reading:

- `AGENTS.md`
- `docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md`
- `docs/agent-workbench/handoff-p4.md`
- `docs/superpowers/specs/2026-07-07-p10-model-loop-live-provider-request-freeze-design.md`
- `docs/superpowers/specs/2026-07-07-p11-multi-step-model-loop-tool-continuation-freeze-design.md`
- `docs/superpowers/specs/2026-07-07-p12-durable-session-request-log-freeze-design.md`
- `docs/superpowers/specs/2026-07-08-p13-patch-write-workflow-contract-freeze-design.md`
- `docs/superpowers/specs/2026-07-08-p14-execute-code-runner-contract-freeze-design.md`
- `docs/superpowers/plans/2026-07-08-p14-execute-code-runner-contract.md`
- `docs/superpowers/specs/2026-07-08-p15-cookie-backed-reader-contract-freeze-design.md`
- `docs/superpowers/plans/2026-07-08-p15-cookie-backed-reader-contract.md`

Global forbidden zones:

- Do not modify `notes/**`.
- Do not modify package, lock or config files.
- Do not implement real Cookie reading, browser Cookie extraction, Cookie storage, third-party provider/search Cookie forwarding, real network reader, DB/FS durable storage, migration execution, patch/write/delete/rollback/execute/code runner/stress tester behavior, old AiSidebar migration or raw payload retention.
- Do not let React components route reader decisions, approve real authenticated reads, call providers, call third-party search, build prompts, call Tauri directly, hold Cookie, hold Authorization, hold API key, hold session token or display private note content.
- Do not place Cookie, Authorization, API key, session token or private note content into model provider, third-party search, request log, evidence payload, Workbench raw view or durable storage.
- Do not bypass `src/lib/api.ts`.
- Do not use `git add .`, `git add -A` or `git commit -a`.
- Do not push unless supervisor explicitly asks.

Default execution ruling: P15 is contract/preview. If a later worker wants true Cookie-backed reader behavior, that worker must first obtain a new approved safety spec and explicit user decision covering browser/session source, consent, domain allowlist, storage, retention, redaction, audit, provider/search isolation, migration and rollback policy.

## File Structure

- Create: `src/lib/agent-runtime/cookieReaderContractTypes.ts` for reader request envelope, source refs, source boundary, permission request, approval decision, redaction policy, mock projection metadata, audit summary and event taxonomy.
- Create: `src/lib/agent-runtime/cookieReaderContractTypes.test.ts` for contract and reserved-event negative-proof tests.
- Create: `src/lib/agent-runtime/cookieReaderSourceBoundaryPolicy.ts` for source profile/domain/auth material/Cookie policy classification.
- Create: `src/lib/agent-runtime/cookieReaderSourceBoundaryPolicy.test.ts` for source boundary tests.
- Create: `src/lib/agent-runtime/cookieReaderRedactionAuditPolicy.ts` for redaction, safe audit summaries and no-provider-leak checks.
- Create: `src/lib/agent-runtime/cookieReaderRedactionAuditPolicy.test.ts` for no-leak and audit tests.
- Create: `src/lib/agent-runtime/mockCookieReaderProjection.ts` for deterministic fixture-only reader projections.
- Create: `src/lib/agent-runtime/mockCookieReaderProjection.test.ts` for no-network/no-Cookie mock projection tests.
- Create: `src/lib/agent-workbench/cookieReaderViewModel.ts` for Workbench read-only projection.
- Create: `src/lib/agent-workbench/cookieReaderViewModel.test.ts` for read model tests.
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.ts` and `src/lib/agent-workbench/workbenchTaskFlow.test.ts` only if runtime attaches P15 preview data through existing flow.
- Create: `src/components/agent-workbench/CookieReaderPanel.tsx` for read-only display.
- Modify: `src/components/agent-workbench/AgentWorkbenchShell.tsx` only to mount the read-only panel.
- Modify: `src/lib/api.ts`, `src/lib/apiContract.ts` and `src/lib/apiBoundary.test.ts` only in the no-op boundary audit task if a type-only unavailable wrapper is explicitly required.
- Modify: `docs/agent-workbench/handoff-p4.md` only in closeout task.

## Task 0: Baseline / Scope Audit

**Allowed files:**
- Read-only: required docs
- Read-only: `src/lib/agent-runtime/**`
- Read-only: `src/lib/agent-workbench/**`
- Read-only: `src/components/agent-workbench/**`
- Read-only: `src/lib/api.ts`
- Read-only: `src/lib/apiContract.ts`
- Read-only: `src/lib/apiBoundary.test.ts`

**Forbidden files:**
- `notes/**`
- `src-tauri/src/**`
- package / lock / config files
- Cookie storage, browser extraction, provider/search transport, mutation, storage or execution files

**RED commands:** none; this is a read-only audit task.

**GREEN commands:**

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -12 --decorate
rg -n 'P15|Cookie-backed Reader Contract Preview|Cookie-backed reader|P14|Execute / Code Runner Contract Preview|8e34519' docs/superpowers/specs/2026-07-08-p15-cookie-backed-reader-contract-freeze-design.md docs/superpowers/plans/2026-07-08-p15-cookie-backed-reader-contract.md docs/agent-workbench/handoff-p4.md
```

Expected: filtered status is clean or unrelated existing changes are named and left untouched; staged paths are empty; HEAD lineage includes `8e34519`; P14 input state and P15 output state are visible.

**Boundary audit:**

```powershell
rg -n 'production-ready|AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|ready: true|isReady: true|real Cookie|browser Cookie|Cookie storage|third-party.*Cookie|writeFile|removeFile|unlink|applyPatch\(|spawn\(|child_process|exec\(|execute runner|code runner|stress tester|database storage|filesystem durable|migration execution|AiSidebar' docs/superpowers/specs/2026-07-08-p15-cookie-backed-reader-contract-freeze-design.md docs/superpowers/plans/2026-07-08-p15-cookie-backed-reader-contract.md
```

Expected: hits are forbidden / non-goal / negative-proof language only.

**Exact-path staging:** none.

**Commit message:** none.

## Task 1: Spec / Contract Types

**Allowed files:**
- Create: `src/lib/agent-runtime/cookieReaderContractTypes.ts`
- Create: `src/lib/agent-runtime/cookieReaderContractTypes.test.ts`

**Forbidden files:**
- `notes/**`
- `src-tauri/src/**`
- Workbench components
- API/Tauri files
- Cookie storage, browser extraction, provider/search transport, mutation, storage or execution files

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/cookieReaderContractTypes.test.ts
```

Expected before implementation: FAIL because `cookieReaderContractTypes.ts` does not exist or lacks P15 exports.

**Implementation steps:**

- [ ] Add tests for `CookieReaderRequestEnvelope` with `readerRequestId`, `sessionId`, `turnId`, `stepId`, `sourceKind`, `sourceEventIds`, `sourceRefs`, `workspaceRefs`, `evidenceRefs`, `requestedUrlRef`, `sourceBoundary`, `permissionRequest`, `approvalDecision`, `redactionPolicy`, `mockProjection`, `auditSummary`, `capabilityStatus`, `schemaVersion` and output state `Cookie-backed Reader Contract Preview`.
- [ ] Add tests for `CookieReaderSourceRef` with `sourceProfile`, `displayOrigin`, `domainPolicy`, `authMaterialPolicy`, `networkPolicy`, `cookiePolicy`, `privateContentPolicy`, `fixturePolicy`, `consentStatus` and `blockedReasons`.
- [ ] Add tests for capability statuses `preview`, `reserved`, `unavailable`, `denied` and `blocked`.
- [ ] Add tests for event taxonomy: `cookieReader.requested`, `cookieReader.classified`, `cookieReader.permission.required`, `cookieReader.permission.resolved`, `cookieReader.mock.projected`, `cookieReader.audit.recorded`, `cookieReader.blocked` and `cookieReader.unavailable`.
- [ ] Add tests that future true-read events such as `cookieReader.cookie.loaded`, `cookieReader.browser.extracted`, `cookieReader.network.started`, `cookieReader.network.completed` and `cookieReader.storage.persisted` cannot be represented as successful P15 events.
- [ ] Implement only type exports, constants and pure validators needed by tests.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/cookieReaderContractTypes.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: focused tests and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'fs\.|writeFile|removeFile|unlink|applyPatch\(|spawn\(|child_process|exec\(|fetch\(|XMLHttpRequest|EventSource|WebSocket|@tauri-apps/api/core|\binvoke\s*\(|Authorization|apiKey|api_key|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-[A-Za-z0-9]|Cookie|cookie' src/lib/agent-runtime/cookieReaderContractTypes.ts src/lib/agent-runtime/cookieReaderContractTypes.test.ts
```

Expected: no real mutation, execution, network, Tauri, secret or Cookie behavior; forbidden literals appear only in type names, blocked future-event names or negative-proof tests.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-runtime/cookieReaderContractTypes.ts src/lib/agent-runtime/cookieReaderContractTypes.test.ts
git diff --cached --name-only
```

Expected staged paths:

```text
src/lib/agent-runtime/cookieReaderContractTypes.ts
src/lib/agent-runtime/cookieReaderContractTypes.test.ts
```

**Commit message:**

```powershell
git commit -m "feat: define p15 cookie reader contract"
```

## Task 2: Permission / Source Boundary

**Allowed files:**
- Create: `src/lib/agent-runtime/cookieReaderSourceBoundaryPolicy.ts`
- Create: `src/lib/agent-runtime/cookieReaderSourceBoundaryPolicy.test.ts`
- Modify: `src/lib/agent-runtime/cookieReaderContractTypes.ts`
- Modify: `src/lib/agent-runtime/cookieReaderContractTypes.test.ts`

**Forbidden files:**
- `notes/**`
- `src-tauri/src/**`
- Workbench components
- API/Tauri files
- Cookie storage, browser extraction, provider/search transport, mutation, storage or execution files

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/cookieReaderSourceBoundaryPolicy.test.ts
```

Expected before implementation: FAIL because source boundary policy exports do not exist.

**Implementation steps:**

- [ ] Add tests that `luogu`, `workspace-fixture`, `manual-fixture`, `replay-fixture`, `unsupported` and `reserved-future-source` source profiles map to explicit boundary decisions.
- [ ] Add tests that P15 defaults `networkPolicy` to `none`, `cookiePolicy` to `fixture-only` or `blocked`, and `authMaterialPolicy` to `not-present`, `redacted-ref-only`, `blocked`, `unsupported` or `reserved-future-user-consent`.
- [ ] Add tests that requests asking for real Cookie, browser Cookie, Cookie storage, third-party Cookie forwarding or private note content become `blocked`.
- [ ] Add tests that display origins remain display-only and never become fetch targets.
- [ ] Implement a pure classifier that returns source boundary metadata and safe blocked reasons.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/cookieReaderSourceBoundaryPolicy.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/cookieReaderContractTypes.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: focused tests and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'fetch\(|XMLHttpRequest|EventSource|WebSocket|document\.cookie|chrome\.cookies|browser\.cookies|localStorage|indexedDB|Cookie storage|third-party.*Cookie|writeFile|removeFile|unlink|applyPatch\(|spawn\(|child_process|exec\(' src/lib/agent-runtime/cookieReaderSourceBoundaryPolicy.ts src/lib/agent-runtime/cookieReaderSourceBoundaryPolicy.test.ts
```

Expected: hits are absent or negative-proof strings only.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-runtime/cookieReaderContractTypes.ts src/lib/agent-runtime/cookieReaderContractTypes.test.ts src/lib/agent-runtime/cookieReaderSourceBoundaryPolicy.ts src/lib/agent-runtime/cookieReaderSourceBoundaryPolicy.test.ts
git diff --cached --name-only
```

Expected: only the four listed runtime contract/source-boundary files are staged.

**Commit message:**

```powershell
git commit -m "feat: gate p15 reader source boundary"
```

## Task 3: Redaction / Audit Policy

**Allowed files:**
- Create: `src/lib/agent-runtime/cookieReaderRedactionAuditPolicy.ts`
- Create: `src/lib/agent-runtime/cookieReaderRedactionAuditPolicy.test.ts`
- Modify: `src/lib/agent-runtime/cookieReaderContractTypes.ts`
- Modify: `src/lib/agent-runtime/cookieReaderContractTypes.test.ts`

**Forbidden files:**
- `notes/**`
- `src-tauri/src/**`
- Workbench components
- API/Tauri files
- provider transport
- third-party search transport
- request-log persistence files unless a read-only type import is already required by an existing boundary
- Cookie storage, browser extraction, mutation, storage or execution files

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/cookieReaderRedactionAuditPolicy.test.ts
```

Expected before implementation: FAIL because redaction/audit policy exports do not exist.

**Implementation steps:**

- [ ] Add tests proving Cookie, Authorization, API key, session token and private note content are removed before model provider payload, third-party search payload, request log, evidence payload, Workbench raw view and durable storage projection.
- [ ] Add tests proving raw provider payload and raw tool output are not retained.
- [ ] Add tests for safe audit fields only: `readerRequestId`, `sourceProfile`, `displayOrigin`, `capabilityStatus`, `permissionStatus`, `redactionStatus`, `blockedReasons`, `fixtureId`, `schemaVersion` and `createdAt`.
- [ ] Add tests that redaction summaries can report a class of removed data without keeping the original value.
- [ ] Implement pure redaction helpers and audit summary constructors.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/cookieReaderRedactionAuditPolicy.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/cookieReaderContractTypes.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: focused tests and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'Authorization|apiKey|api_key|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-[A-Za-z0-9]|session token|private note content|raw provider payload|raw tool output|Cookie|cookie|fetch\(|document\.cookie|browser\.cookies|database storage|filesystem durable|migration execution' src/lib/agent-runtime/cookieReaderRedactionAuditPolicy.ts src/lib/agent-runtime/cookieReaderRedactionAuditPolicy.test.ts
```

Expected: hits are redaction class names, redaction tests or negative-proof assertions only.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-runtime/cookieReaderContractTypes.ts src/lib/agent-runtime/cookieReaderContractTypes.test.ts src/lib/agent-runtime/cookieReaderRedactionAuditPolicy.ts src/lib/agent-runtime/cookieReaderRedactionAuditPolicy.test.ts
git diff --cached --name-only
```

Expected: only the four listed runtime contract/redaction files are staged.

**Commit message:**

```powershell
git commit -m "feat: redact p15 reader audit summaries"
```

## Task 4: Mock / Fixture Projection

**Allowed files:**
- Create: `src/lib/agent-runtime/mockCookieReaderProjection.ts`
- Create: `src/lib/agent-runtime/mockCookieReaderProjection.test.ts`
- Modify: `src/lib/agent-runtime/cookieReaderContractTypes.ts`
- Modify: `src/lib/agent-runtime/cookieReaderContractTypes.test.ts`
- Modify: `src/lib/agent-runtime/cookieReaderRedactionAuditPolicy.ts`
- Modify: `src/lib/agent-runtime/cookieReaderRedactionAuditPolicy.test.ts`

**Forbidden files:**
- `notes/**`
- `src-tauri/src/**`
- Workbench components
- API/Tauri files
- real network reader, Cookie storage, browser extraction, provider/search transport, mutation, storage or execution files

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/mockCookieReaderProjection.test.ts
```

Expected before implementation: FAIL because mock projection exports do not exist.

**Implementation steps:**

- [ ] Add tests for deterministic fixture projections with fixture id, source profile, display origin, safe title, safe excerpt, sanitized evidence refs, redaction markers, blocked/unavailable reasons and schema version.
- [ ] Add tests that fixture projection never calls fetch, browser Cookie APIs, provider transport, third-party search, request log persistence, DB/FS storage or Tauri.
- [ ] Add tests that fixture projection does not read real `notes/**`.
- [ ] Add tests that fixture projection does not include Cookie, Authorization, API key, session token, private note content, raw provider payload or raw tool output.
- [ ] Implement a pure fixture projector that accepts typed fixture input and returns safe projection metadata.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/mockCookieReaderProjection.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/cookieReaderRedactionAuditPolicy.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: focused tests and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'fs\.|readFile|writeFile|removeFile|unlink|applyPatch\(|spawn\(|child_process|exec\(|fetch\(|XMLHttpRequest|EventSource|WebSocket|document\.cookie|chrome\.cookies|browser\.cookies|localStorage|indexedDB|database storage|filesystem durable|migration execution|@tauri-apps/api/core|\binvoke\s*\(' src/lib/agent-runtime/mockCookieReaderProjection.ts src/lib/agent-runtime/mockCookieReaderProjection.test.ts
```

Expected: no real file IO, browser Cookie access, network behavior, browser storage, DB/FS storage, migration, Tauri, mutation or execution behavior.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-runtime/cookieReaderContractTypes.ts src/lib/agent-runtime/cookieReaderContractTypes.test.ts src/lib/agent-runtime/cookieReaderRedactionAuditPolicy.ts src/lib/agent-runtime/cookieReaderRedactionAuditPolicy.test.ts src/lib/agent-runtime/mockCookieReaderProjection.ts src/lib/agent-runtime/mockCookieReaderProjection.test.ts
git diff --cached --name-only
```

Expected: only the listed runtime contract/redaction/mock projection files are staged.

**Commit message:**

```powershell
git commit -m "feat: project p15 cookie reader fixtures"
```

## Task 5: Workbench Read-only Projection

**Allowed files:**
- Create: `src/lib/agent-workbench/cookieReaderViewModel.ts`
- Create: `src/lib/agent-workbench/cookieReaderViewModel.test.ts`
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.ts`
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.test.ts`
- Create: `src/components/agent-workbench/CookieReaderPanel.tsx`
- Modify: `src/components/agent-workbench/AgentWorkbenchShell.tsx`
- Modify: P15 runtime files only as needed for typed projection exports

**Forbidden files:**
- `notes/**`
- `src-tauri/src/**`
- `src/components/ai/**`
- API/Tauri files
- package / lock / config files
- real network reader, Cookie storage, browser extraction, provider/search transport, mutation, storage or execution files

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench/cookieReaderViewModel.test.ts
```

Expected before implementation: FAIL because Workbench cookie reader projection exports do not exist.

**Implementation steps:**

- [ ] Add tests proving read model title/output state is exactly `Cookie-backed Reader Contract Preview`.
- [ ] Add tests proving projection includes source profile, display origin, capability status, permission/consent status, redaction status, fixture-only observation summary and blocked/unavailable reasons.
- [ ] Add tests proving raw Cookie, Authorization, API key, session token, private note content, raw provider payload and raw tool output do not appear in the view model.
- [ ] Attach P15 projection to `workbenchTaskFlow.ts` only when runtime reports P15 preview data; keep P14 runner projection intact.
- [ ] Add read-only `CookieReaderPanel` without buttons that read browser Cookie, extract Cookie storage, call third-party search with Cookie, run a real network reader, write files, apply patches, delete, rollback, execute runner, code runner or stress tester behavior.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench/cookieReaderViewModel.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench/workbenchTaskFlow.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: focused tests and typecheck pass.

**Boundary audit:**

```powershell
rg -n 'onClick=.*read|onClick=.*Cookie|onClick=.*fetch|onClick=.*search|document\.cookie|chrome\.cookies|browser\.cookies|fetch\(|XMLHttpRequest|EventSource|WebSocket|writeFile|removeFile|unlink|applyPatch\(|spawn\(|child_process|exec\(|execute runner|code runner|stress tester|Authorization|apiKey|sk-[A-Za-z0-9]|raw provider payload|raw tool output|@tauri-apps/api/core|\binvoke\s*\(' src/lib/agent-workbench src/components/agent-workbench
```

Expected: no Workbench capability to perform real Cookie access, network reader, provider/search forwarding, mutation, execution or Tauri calls; hits are read-only labels or negative-proof tests only.

**Exact-path staging:**

```powershell
git add -- src/lib/agent-workbench/cookieReaderViewModel.ts src/lib/agent-workbench/cookieReaderViewModel.test.ts src/lib/agent-workbench/workbenchTaskFlow.ts src/lib/agent-workbench/workbenchTaskFlow.test.ts src/components/agent-workbench/CookieReaderPanel.tsx src/components/agent-workbench/AgentWorkbenchShell.tsx
git diff --cached --name-only
```

Expected: only Workbench P15 projection files and narrowly required runtime type files are staged.

**Commit message:**

```powershell
git commit -m "feat: project p15 cookie reader workflow"
```

## Task 6: API / Tauri No-op Boundary Audit

**Allowed files:**
- Read-only preferred: `src/lib/api.ts`
- Read-only preferred: `src/lib/apiContract.ts`
- Read-only preferred: `src/lib/apiBoundary.test.ts`
- Modify only if a type-only unavailable wrapper is explicitly required: `src/lib/api.ts`, `src/lib/apiContract.ts`, `src/lib/apiBoundary.test.ts`

**Forbidden files:**
- `notes/**`
- `src-tauri/src/**` unless supervisor opens a separate safety task
- package / lock / config files
- Cookie storage, browser extraction, provider/search transport, real network reader, DB/FS storage, migration, mutation or execution files

**RED commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/apiBoundary.test.ts
```

Expected before implementation: existing tests pass. If no wrapper is needed, this task remains read-only with no staged changes.

**Implementation steps:**

- [ ] Prefer no production change if P15 can stay fully runtime/read-model/mock-fixture only.
- [ ] Inspect existing API wrappers for direct Cookie, Authorization, API key, raw provider payload, raw tool output and private note content exposure.
- [ ] Confirm frontend-to-Rust calls still go through `src/lib/api.ts`.
- [ ] Do not add Tauri commands, Rust code, browser Cookie extraction, Cookie storage, provider/search forwarding, real network reader, DB/FS durable storage or migration execution.
- [ ] If a type-only unavailable wrapper is unavoidable, write a failing boundary test first, then implement only a no-op/unavailable wrapper that cannot read or persist sensitive data.

**GREEN commands:**

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/apiBoundary.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: API boundary tests and typecheck pass, or read-only no-op is recorded with no staged files.

**Boundary audit:**

```powershell
rg -n 'document\.cookie|chrome\.cookies|browser\.cookies|Cookie storage|third-party.*Cookie|fetch\(|XMLHttpRequest|EventSource|WebSocket|Authorization|apiKey|api_key|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-[A-Za-z0-9]|raw provider payload|raw tool output|writeFile|removeFile|unlink|applyPatch\(|spawn\(|child_process|exec\(|execute runner|code runner|stress tester|database storage|filesystem durable|migration execution' src/lib/api.ts src/lib/apiContract.ts src/lib/apiBoundary.test.ts src-tauri/src
```

Expected: no new P15 API/Tauri Cookie implementation; existing hits are classified as pre-existing boundary wrappers, redaction tests or unrelated existing Rust surfaces.

**Exact-path staging:**

```powershell
git add -- src/lib/api.ts src/lib/apiContract.ts src/lib/apiBoundary.test.ts
git diff --cached --name-only
```

Expected: no staged paths if no wrapper is needed. If a wrapper is required, only the three listed API boundary files are staged.

**Commit message:**

```powershell
git commit -m "test: prove p15 cookie reader boundary is unavailable"
```

Skip the commit if the task is a documented no-op with no file changes.

## Task 7: Handoff

**Allowed files:**
- Modify: `docs/agent-workbench/handoff-p4.md`

**Forbidden files:**
- `notes/**`
- `src/**`
- `src-tauri/**`
- package / lock / config files
- P15 implementation files unless supervisor explicitly asks for corrections

**RED commands:** none; this is a documentation closeout task.

**Implementation steps:**

- [ ] Append a P15 handoff section to `docs/agent-workbench/handoff-p4.md`.
- [ ] Record output state as **Cookie-backed Reader Contract Preview**.
- [ ] Record what P15 froze and what remains forbidden.
- [ ] Record exact commits from Tasks 1-6.
- [ ] State that P15 does not implement production-ready autonomous Agent, AI 大升级完成, real Cookie reading, browser Cookie extraction, Cookie storage, third-party Cookie forwarding, real network reader, DB/FS durable storage, migration execution, patch/write/delete/rollback/execute/code runner/stress tester behavior, old AiSidebar migration or raw payload retention.
- [ ] State that future true Cookie-backed reader work requires a separate safety spec and user decision.

**GREEN commands:**

```powershell
rg -n 'P15|Cookie-backed Reader Contract Preview|Cookie-backed reader|P14|Execute / Code Runner Contract Preview' docs/agent-workbench/handoff-p4.md
git log --oneline -12 --decorate
```

Expected: handoff records P15 output state, commits and remaining forbidden capabilities.

**Boundary audit:**

```powershell
rg -n 'production-ready|AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|ready: true|isReady: true|real Cookie|browser Cookie|Cookie storage|third-party.*Cookie|writeFile|removeFile|unlink|applyPatch\(|spawn\(|child_process|exec\(|execute runner|code runner|stress tester|database storage|filesystem durable|migration execution|AiSidebar' docs/agent-workbench/handoff-p4.md
```

Expected: hits are forbidden / non-goal / negative-proof language only.

**Exact-path staging:**

```powershell
git add -- docs/agent-workbench/handoff-p4.md
git diff --cached --name-only
```

Expected staged path:

```text
docs/agent-workbench/handoff-p4.md
```

**Commit message:**

```powershell
git commit -m "docs: record p15 cookie reader handoff"
```

## Task 8: Supervisor Acceptance

**Allowed files:**
- Read-only: full repo excluding `notes/**` unless supervisor asks

**Forbidden files:**
- New edits unless supervisor asks for a targeted correction

**RED commands:** none.

**GREEN commands:**

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -12 --decorate
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench
node .\node_modules\vitest\vitest.mjs run src/lib/apiBoundary.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: checkout is clean, staged paths empty, P15 commits present, verification passes or blockers are recorded precisely.

**Boundary audit:**

```powershell
rg -n 'document\.cookie|chrome\.cookies|browser\.cookies|Cookie storage|third-party.*Cookie|real Cookie|raw provider payload|raw tool output|Authorization|apiKey|session token|private note content|writeFile|removeFile|unlink|applyPatch\(|spawn\(|child_process|exec\(|execute runner|code runner|stress tester|database storage|filesystem durable|migration execution|AiSidebar' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts src/lib/apiContract.ts src/lib/apiBoundary.test.ts src-tauri/src docs/agent-workbench/handoff-p4.md
```

Expected: hits are no-hit or scoped to contract/test literals, read-only display text, redaction tests, pre-existing wrappers or handoff forbidden-language explanations.

**Exact-path staging:** none.

**Commit message:** none.

## Docs-only P15 Freeze Worker Acceptance

This current docs-only P15 worker must run:

```powershell
rg -n 'Cookie-backed Reader Contract Preview|P15|Cookie-backed reader|P14|Execute / Code Runner Contract Preview' docs/superpowers/specs/2026-07-08-p15-cookie-backed-reader-contract-freeze-design.md docs/superpowers/plans/2026-07-08-p15-cookie-backed-reader-contract.md
rg -n 'production-ready|AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|ready: true|isReady: true|real Cookie|browser Cookie|Cookie storage|third-party.*Cookie|writeFile|removeFile|unlink|applyPatch\(|spawn\(|child_process|exec\(|execute runner|code runner|stress tester|database storage|filesystem durable|migration execution|AiSidebar' docs/superpowers/specs/2026-07-08-p15-cookie-backed-reader-contract-freeze-design.md docs/superpowers/plans/2026-07-08-p15-cookie-backed-reader-contract.md
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

Expected:

- Content self-check finds P15, P14, Cookie-backed reader and output state wording.
- Forbidden capability audit hits are negative statements only.
- Filtered status contains only the two P15 docs before staging.
- Staged paths contain only the two P15 docs after exact-path staging.
- Final commit message is `docs: define p15 cookie reader contract`.
- Push status is not pushed.

Future true Cookie-backed reader implementation is intentionally out of scope. It requires a separate safety spec and user decision before any worker may add browser/session Cookie access, storage, provider/search forwarding, real network reader, durable retention, migration, rollback or production readiness claims.
