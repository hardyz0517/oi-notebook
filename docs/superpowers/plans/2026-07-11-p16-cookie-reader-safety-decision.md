# P16 Cookie Reader Safety Decision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze P16 as `Cookie Reader Safety Decision Preview`, a docs-only decision layer that prepares a later user decision for true Cookie-backed reader work without approving implementation.

**Architecture:** P16 follows P15 `Cookie-backed Reader Contract Preview`. It adds only safety-decision documentation: decision options, threat model, no-go criteria, audits and acceptance. It does not modify runtime, Workbench, API, Tauri, notes, package, lock or config files.

**Tech Stack:** Markdown documentation, PowerShell commands, `rg`, Git exact-path staging.

---

## Phase Boundary

Phase name: **P16 Cookie Reader Safety Decision Freeze**

Input state: **Cookie-backed Reader Contract Preview**

Output state: **Cookie Reader Safety Decision Preview**

Default rule: P16 is docs-only and decision-only. It does not approve real Cookie reader behavior. Future implementation must wait for explicit user approval and a separate implementation plan before touching `src/**` or `src-tauri/**`.

## File Structure

- `docs/superpowers/specs/2026-07-11-p16-cookie-reader-safety-decision-freeze-design.md`: canonical P16 safety decision spec.
- `docs/superpowers/plans/2026-07-11-p16-cookie-reader-safety-decision.md`: this implementation and acceptance plan.
- `docs/agent-workbench/handoff-p4.md`: later closeout target only; do not modify until the P16 handoff task.

Forbidden for P16 implementation tasks:

- `notes/**`
- `src/**`
- `src-tauri/**`
- package / lock / config files
- runtime / Workbench / API / Tauri implementation files

P16 no-op rule: no real Cookie reader, browser Cookie extraction, Cookie storage, third-party Cookie forwarding, provider/search transport, real network reader, DB/FS durable storage, migration execution, patch/write/delete/rollback/execute/code runner/stress tester behavior, old AiSidebar migration or raw payload retention.

## Task 0: Baseline / Scope Audit

**Allowed files:**
- Read-only: full repo excluding `notes/**`

**Forbidden files:**
- New edits

- [ ] Run startup status.

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -12 --decorate
```

Expected:

- Filtered status is empty or unrelated existing changes are named and left untouched.
- Staged paths are empty.
- Log includes `5d4d6c6 docs: record p15 cookie reader handoff`.

- [ ] Confirm P15 handoff requires a later safety decision.

```powershell
rg -n 'P15|Cookie-backed Reader Contract Preview|future true Cookie-backed reader|safety spec|user decision|真实 Cookie' docs/agent-workbench/handoff-p4.md docs/superpowers/specs/2026-07-08-p15-cookie-backed-reader-contract-freeze-design.md docs/superpowers/plans/2026-07-08-p15-cookie-backed-reader-contract.md
```

Expected: hits say true Cookie reader behavior requires a later safety spec and user decision.

**Exact-path staging:** none.

**Commit message:** none.

## Task 1: Safety Spec Creation

**Allowed files:**
- Create/modify: `docs/superpowers/specs/2026-07-11-p16-cookie-reader-safety-decision-freeze-design.md`

**Forbidden files:**
- `notes/**`
- `src/**`
- `src-tauri/**`
- package / lock / config files
- `docs/superpowers/plans/**` except this plan if a supervisor explicitly batches Task 1 and plan creation

- [ ] Write the spec with these exact phase labels.

```markdown
Phase name: **P16 Cookie Reader Safety Decision Freeze**

Input state: **Cookie-backed Reader Contract Preview**

Target output state: **Cookie Reader Safety Decision Preview**
```

- [ ] Include a decision surface covering all of these items:

```text
browser/session source
consent model
domain allowlist
same-site / origin policy
storage and retention
redaction and audit
provider/search isolation
request log/evidence/Workbench raw-view boundaries
API/Tauri boundary
rollback/migration policy
threat model
user-visible controls
failure states
no-go criteria
```

- [ ] Include a decision matrix with these options:

```text
Option A: Keep true Cookie reading blocked
Option B: Allow fixture/manual authenticated-source import only
Option C: Narrow real Cookie-backed reader with per-domain consent
```

Each option must list allowed surfaces, forbidden surfaces, risks, required tests/audits and exit criteria.

- [ ] Run the spec content check.

```powershell
rg -n 'P16|Cookie Reader Safety Decision Preview|Cookie-backed Reader Contract Preview|P15|P14|Option A|Option B|Option C|per-domain consent|provider/search isolation' docs/superpowers/specs/2026-07-11-p16-cookie-reader-safety-decision-freeze-design.md
```

Expected: hits cover phase labels, output state, P15/P14 lineage, all three options and provider/search isolation.

**Exact-path staging:** defer until Task 5 unless this task is executed alone.

**Commit message:** defer until Task 5 unless this task is executed alone.

## Task 2: Decision Matrix / User Decision Packet

**Allowed files:**
- Modify: `docs/superpowers/specs/2026-07-11-p16-cookie-reader-safety-decision-freeze-design.md`
- Modify: `docs/superpowers/plans/2026-07-11-p16-cookie-reader-safety-decision.md`

**Forbidden files:**
- `notes/**`
- `src/**`
- `src-tauri/**`
- package / lock / config files

- [ ] Confirm the decision matrix can be copied into a user decision packet.

```powershell
rg -n 'Keep True Cookie Reading Blocked|Fixture Or Manual Authenticated-Source Import Only|Narrow Real Cookie-Backed Reader|Allowed surfaces|Forbidden surfaces|Risks|Required tests and audits|Exit criteria' docs/superpowers/specs/2026-07-11-p16-cookie-reader-safety-decision-freeze-design.md
```

Expected: each option has allowed surfaces, forbidden surfaces, risks, tests/audits and exit criteria.

- [ ] Confirm implementation is still gated after the decision packet.

```powershell
rg -n 'requires user approval|separate implementation plan|remain blocked|does not approve|docs-only|decision-only' docs/superpowers/specs/2026-07-11-p16-cookie-reader-safety-decision-freeze-design.md docs/superpowers/plans/2026-07-11-p16-cookie-reader-safety-decision.md
```

Expected: hits show a later decision and implementation plan are required before touching implementation files.

**Exact-path staging:** defer until Task 5 unless this task is executed alone.

**Commit message:** defer until Task 5 unless this task is executed alone.

## Task 3: Threat Model And Audit Checklist

**Allowed files:**
- Modify: `docs/superpowers/specs/2026-07-11-p16-cookie-reader-safety-decision-freeze-design.md`
- Modify: `docs/superpowers/plans/2026-07-11-p16-cookie-reader-safety-decision.md`

**Forbidden files:**
- `notes/**`
- `src/**`
- `src-tauri/**`
- package / lock / config files

- [ ] Verify threat model terms exist.

```powershell
rg -n 'Threat Model|token leakage|cross-domain|provider forwarding|durable retention|UI mislabeling|stale consent|Tauri|browser APIs' docs/superpowers/specs/2026-07-11-p16-cookie-reader-safety-decision-freeze-design.md
```

Expected: hits describe the primary threats that must block future implementation when untested.

- [ ] Verify no-go criteria exist.

```powershell
rg -n 'No-Go Criteria|no explicit user decision|domain allowlist|consent revoke|redaction proof|durable|third-party|ready: true|isReady: true' docs/superpowers/specs/2026-07-11-p16-cookie-reader-safety-decision-freeze-design.md
```

Expected: hits list concrete block conditions.

- [ ] Run forbidden capability audit on P16 docs.

```powershell
rg -n 'production-ready|AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|ready: true|isReady: true|real Cookie|browser Cookie|Cookie storage|third-party.*Cookie|writeFile|removeFile|unlink|applyPatch\(|spawn\(|child_process|exec\(|execute runner|code runner|stress tester|database storage|filesystem durable|migration execution|AiSidebar' docs/superpowers/specs/2026-07-11-p16-cookie-reader-safety-decision-freeze-design.md docs/superpowers/plans/2026-07-11-p16-cookie-reader-safety-decision.md
```

Expected: hits are forbidden, decision, non-goal or future-approval language only. No hit may claim production readiness or actual Cookie implementation approval.

**Exact-path staging:** defer until Task 5 unless this task is executed alone.

**Commit message:** defer until Task 5 unless this task is executed alone.

## Task 4: Future Handoff Update Plan

**Allowed files:**
- Read-only now: `docs/agent-workbench/handoff-p4.md`
- Future closeout only: `docs/agent-workbench/handoff-p4.md`

**Forbidden files:**
- New edits during this docs-only P16 spec/plan worker unless supervisor explicitly opens a handoff task
- `notes/**`
- `src/**`
- `src-tauri/**`
- package / lock / config files

- [ ] Confirm the future handoff target exists.

```powershell
rg -n 'P15 Cookie-backed Reader Contract Freeze handoff|Cookie-backed Reader Contract Preview|future true Cookie-backed reader' docs/agent-workbench/handoff-p4.md
```

Expected: hits identify the P15 handoff section that a later P16 handoff can follow.

- [ ] Record the future handoff rule in this plan.

```text
Future P16 handoff task may modify only docs/agent-workbench/handoff-p4.md.
It must record Cookie Reader Safety Decision Preview, selected or deferred user decision, no-go criteria and remaining forbidden capabilities.
```

**Exact-path staging:** none for this task.

**Commit message:** none for this task.

## Task 5: Supervisor Acceptance

**Allowed files:**
- Read-only: full repo excluding `notes/**`
- Stage only:
  - `docs/superpowers/specs/2026-07-11-p16-cookie-reader-safety-decision-freeze-design.md`
  - `docs/superpowers/plans/2026-07-11-p16-cookie-reader-safety-decision.md`

**Forbidden files:**
- `notes/**`
- `src/**`
- `src-tauri/**`
- package / lock / config files

- [ ] Run content self-check.

```powershell
rg -n 'P16|Cookie Reader Safety Decision Preview|Cookie-backed Reader Contract Preview|P15|P14' docs/superpowers/specs/2026-07-11-p16-cookie-reader-safety-decision-freeze-design.md docs/superpowers/plans/2026-07-11-p16-cookie-reader-safety-decision.md
```

Expected: hits include P16, output state, P15 input state and P14/P15 lineage.

- [ ] Run forbidden capability audit.

```powershell
rg -n 'production-ready|AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|ready: true|isReady: true|real Cookie|browser Cookie|Cookie storage|third-party.*Cookie|writeFile|removeFile|unlink|applyPatch\(|spawn\(|child_process|exec\(|execute runner|code runner|stress tester|database storage|filesystem durable|migration execution|AiSidebar' docs/superpowers/specs/2026-07-11-p16-cookie-reader-safety-decision-freeze-design.md docs/superpowers/plans/2026-07-11-p16-cookie-reader-safety-decision.md
```

Expected: hits are forbidden, decision, non-goal or future-approval language only.

- [ ] Confirm only P16 docs are changed.

```powershell
git status --short -- . ":(exclude)notes/**"
```

Expected:

```text
?? docs/superpowers/plans/2026-07-11-p16-cookie-reader-safety-decision.md
?? docs/superpowers/specs/2026-07-11-p16-cookie-reader-safety-decision-freeze-design.md
```

- [ ] Stage exact paths.

```powershell
git add -- docs/superpowers/specs/2026-07-11-p16-cookie-reader-safety-decision-freeze-design.md docs/superpowers/plans/2026-07-11-p16-cookie-reader-safety-decision.md
git diff --cached --name-only
```

Expected:

```text
docs/superpowers/plans/2026-07-11-p16-cookie-reader-safety-decision.md
docs/superpowers/specs/2026-07-11-p16-cookie-reader-safety-decision-freeze-design.md
```

- [ ] Commit.

```powershell
git commit -m "docs: define p16 cookie reader safety decision"
```

Expected: commit succeeds and push is not performed.

## Acceptance Summary Shape

Final supervisor report must include:

- Verdict
- P16 output state
- Changed files
- Verification commands and results
- Boundary audit interpretation
- Remaining forbidden capabilities
- Final filtered status
- Final staged paths
- Push status

