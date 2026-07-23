# P16 Cookie Reader Safety Decision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a docs-only P16 decision packet that freezes the safety choices, threat controls and acceptance gates required before any true Cookie-backed reader implementation can be proposed.

**Architecture:** P16 consumes the P15 **Cookie-backed Reader Contract Preview** and emits **Cookie Reader Safety Decision Preview** without changing runtime behavior. The design document owns the decision matrix, threat model and no-go gates; this plan owns document construction, audit and supervisor acceptance. Until a user selects an option and separately approves implementation, true Cookie reading remains blocked.

**Tech Stack:** Markdown, PowerShell, ripgrep, Git exact-path staging; no TypeScript, React, Rust, API, Tauri, provider/search, network, browser or storage implementation.

---

## Phase Boundary

Phase name: **P16 Cookie Reader Safety Decision Freeze**

Input state: **Cookie-backed Reader Contract Preview**

Output state: **Cookie Reader Safety Decision Preview**

P16 is docs-only and decision-only. It does not approve or implement true Cookie access. OI/Luogu remains a motivating source profile, not a hard-coded core-only protocol. Any later implementation still requires explicit user approval before touching `src/**` or `src-tauri/**`.

## Global No-op Rule

No task in P16 may add a real Cookie reader, browser Cookie extraction, Cookie storage, third-party Cookie forwarding, provider/search transport, real network reader, DB/FS durable storage, migration execution, patch/write/delete/rollback/execute/code runner/stress tester behavior, old AiSidebar migration, or raw payload retention. Do not modify `notes/**`, `src/**`, `src-tauri/**`, or package/lock/config files. Do not use `git add .`, `git add -A` or `git commit -a`. Do not push.

## File Structure

- Create: `docs/superpowers/specs/2026-07-11-p16-cookie-reader-safety-decision-freeze-design.md` for the phase identity, complete safety decision surface, option matrix, threat model, failure states, no-go criteria and user decision record.
- Create: `docs/superpowers/plans/2026-07-11-p16-cookie-reader-safety-decision.md` for docs-only construction, audit, later-handoff planning and supervisor acceptance.
- Later closeout only, not modified by this plan execution: `docs/agent-workbench/handoff-p4.md`.

### Task 0: Baseline / Scope Audit

**Allowed files:** read-only `AGENTS.md`, the P14/P15 handoff sections, the AI upgrade design, the P15 spec/plan, and Git metadata; no created or modified files in this task.

**Forbidden files:** modifications anywhere, especially `notes/**`, `src/**`, `src-tauri/**`, package/lock/config files and runtime/Workbench/API/Tauri files.

- [ ] **Step 1: Capture the clean delegated baseline.**

Run:

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log -5 --oneline
```

Expected: filtered status and staged paths are empty; HEAD is `5d4d6c6 docs: record p15 cookie reader handoff`.

- [ ] **Step 2: Read the authoritative boundary.**

Run:

```powershell
Get-Content -Raw AGENTS.md
Get-Content -Raw docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md
rg -n -C 12 'P14|P15|Cookie-backed Reader' docs/agent-workbench/handoff-p4.md
Get-Content -Raw docs/superpowers/specs/2026-07-08-p15-cookie-backed-reader-contract-freeze-design.md
Get-Content -Raw docs/superpowers/plans/2026-07-08-p15-cookie-backed-reader-contract.md
```

Expected: sources confirm P15 output is preview-only, true Cookie/network/storage behavior remains blocked, and a separate safety spec plus user decision is required.

**Exact-path staging:** none.

**Commit rule:** no commit; this task is read-only.

### Task 1: Safety Spec Creation

**Allowed files:** create only `docs/superpowers/specs/2026-07-11-p16-cookie-reader-safety-decision-freeze-design.md`.

**Forbidden files:** the plan until Task 2, `docs/agent-workbench/handoff-p4.md`, `notes/**`, `src/**`, `src-tauri/**`, package/lock/config and all implementation files.

- [ ] **Step 1: Write phase identity and inheritance.**

Write exact phase/input/output wording and state that P16 is docs-only/decision-only, approves no true Cookie access, keeps Option 1 effective until explicit user choice, and requires later approval before `src/**` or `src-tauri/**` changes.

- [ ] **Step 2: Freeze the complete safety surface.**

Document browser/session source, consent, exact-domain allowlist, same-site/origin/redirect policy, storage/retention, redaction/audit, provider/search isolation, request-log/evidence/Workbench raw-view boundaries, API/Tauri boundary, rollback/migration, threat model, user-visible controls, failure states and no-go criteria.

- [ ] **Step 3: Verify spec structure.**

Run:

```powershell
rg -n 'Phase name|Input state|Target output state|docs-only|decision-only|Browser And Session Source|Consent Model|Domain Allowlist|Storage And Retention|Redaction And Audit|Provider And Search Isolation|Request Log, Evidence And Workbench|API / Tauri Boundary|Rollback And Migration|Failure States|Threat Model|No-go Criteria' docs/superpowers/specs/2026-07-11-p16-cookie-reader-safety-decision-freeze-design.md
```

Expected: every required decision surface has an explicit section; no implementation is approved.

**Exact-path staging:** none until Task 5 acceptance.

**Commit rule:** no commit; keep the two-doc decision packet atomic.

### Task 2: Decision Matrix / User Decision Packet

**Allowed files:** create/modify only the two P16 docs named in File Structure.

**Forbidden files:** `docs/agent-workbench/handoff-p4.md`, `notes/**`, `src/**`, `src-tauri/**`, package/lock/config and all implementation files.

- [ ] **Step 1: Add the three-option matrix.**

Include: (1) keep true Cookie reading blocked; (2) allow fixture/manual authenticated-source import only; (3) allow narrowly scoped real Cookie-backed reader behind explicit per-domain consent and no provider/search forwarding. For each, specify allowed surfaces, forbidden surfaces, risks, required tests/audits and exit criteria.

- [ ] **Step 2: Add the decision recording template.**

Require option/rationale, source/domain scope, consent/revocation, retention, egress/projection, API/Tauri permission, audits, rollback trigger, rejected alternatives and unresolved risks. State that incomplete or absent selection leaves Option 1 effective.

- [ ] **Step 3: Verify matrix coverage.**

Run:

```powershell
rg -n 'Keep true Cookie reading blocked|fixture/manual authenticated-source import only|narrowly scoped real Cookie-backed reader|Allowed surfaces|Forbidden surfaces|Primary risks|Required tests / audits|Exit criteria|Decision Packet' docs/superpowers/specs/2026-07-11-p16-cookie-reader-safety-decision-freeze-design.md
```

Expected: all three options and every comparison field are present; no option is presented as already selected.

**Exact-path staging:** none until Task 5 acceptance.

**Commit rule:** no commit; keep the two-doc decision packet atomic.

### Task 3: Threat Model And Audit Checklist

**Allowed files:** modify only the two P16 docs named in File Structure.

**Forbidden files:** `docs/agent-workbench/handoff-p4.md`, `notes/**`, `src/**`, `src-tauri/**`, package/lock/config and all implementation files.

- [ ] **Step 1: Complete threat and control coverage.**

Cover credentials, authenticated content, malicious sites/redirects/content, model/tool confused-deputy attempts, third-party egress, local forensic leakage, stale consent, revocation races and migration resurrection. Pair each class with deny-by-default, exact-origin, redaction-before-projection, bounded parsing, safe audit and rollback controls.

- [ ] **Step 2: Run the docs boundary audit.**

Run:

```powershell
rg -n 'production-ready|AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|ready: true|isReady: true|real Cookie|browser Cookie|Cookie storage|third-party.*Cookie|writeFile|removeFile|unlink|applyPatch\(|spawn\(|child_process|exec\(|execute runner|code runner|stress tester|database storage|filesystem durable|migration execution|AiSidebar' docs/superpowers/specs/2026-07-11-p16-cookie-reader-safety-decision-freeze-design.md docs/superpowers/plans/2026-07-11-p16-cookie-reader-safety-decision.md
```

Expected: all hits are forbidden, decision-option, future-approval, no-go or negative-proof language; there is no production-readiness or implementation approval claim.

- [ ] **Step 3: Check placeholders and scope drift.**

Run:

```powershell
rg -n 'TBD|TODO|implement later|fill in details' docs/superpowers/specs/2026-07-11-p16-cookie-reader-safety-decision-freeze-design.md docs/superpowers/plans/2026-07-11-p16-cookie-reader-safety-decision.md
git status --short -- . ":(exclude)notes/**"
```

Expected: placeholder scan has no hits; filtered status lists only the two P16 docs.

**Exact-path staging:** none until Task 5 acceptance.

**Commit rule:** no commit; keep the two-doc decision packet atomic.

### Task 4: Handoff Update Plan For Later Closeout Only

**Allowed files:** read-only `docs/agent-workbench/handoff-p4.md`; describe its future update in this P16 plan only.

**Forbidden files:** modifying `docs/agent-workbench/handoff-p4.md` during the P16 docs-only worker; all `notes/**`, `src/**`, `src-tauri/**`, package/lock/config and implementation files.

- [ ] **Step 1: Define later handoff contents without editing the handoff.**

A later, separately authorized closeout task should append P16 phase/input/output states, the final user-selected option or `decision pending`, the two P16 docs commit, explicit no-op boundaries, audit interpretation and the rule that later implementation requires user approval before `src/**` or `src-tauri/**` changes.

- [ ] **Step 2: Prove the handoff was not changed here.**

Run:

```powershell
git diff -- docs/agent-workbench/handoff-p4.md
git status --short -- . ":(exclude)notes/**"
```

Expected: handoff diff is empty; status lists only the two P16 docs.

**Exact-path staging:** none.

**Commit rule:** no commit; the future handoff update requires a separate authorized closeout task and commit message.

### Task 5: Supervisor Acceptance

**Allowed files:** read-only verification of the repo excluding `notes/**`; exact-path stage and commit only the two P16 docs.

**Forbidden files:** any new edit outside the two P16 docs; `notes/**`, `src/**`, `src-tauri/**`, package/lock/config and implementation files.

- [ ] **Step 1: Run required content verification.**

Run:

```powershell
rg -n 'P16|Cookie Reader Safety Decision Preview|Cookie-backed Reader Contract Preview|P15|P14' docs/superpowers/specs/2026-07-11-p16-cookie-reader-safety-decision-freeze-design.md docs/superpowers/plans/2026-07-11-p16-cookie-reader-safety-decision.md
```

Expected: both documents identify P16, input/output states and P14/P15 inheritance.

- [ ] **Step 2: Run required forbidden-capability audit.**

Run:

```powershell
rg -n 'production-ready|AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|ready: true|isReady: true|real Cookie|browser Cookie|Cookie storage|third-party.*Cookie|writeFile|removeFile|unlink|applyPatch\(|spawn\(|child_process|exec\(|execute runner|code runner|stress tester|database storage|filesystem durable|migration execution|AiSidebar' docs/superpowers/specs/2026-07-11-p16-cookie-reader-safety-decision-freeze-design.md docs/superpowers/plans/2026-07-11-p16-cookie-reader-safety-decision.md
```

Expected: hits are forbidden, decision, future-approval, no-go or negative-proof language only, not implementation approval.

- [ ] **Step 3: Verify the exact file boundary before staging.**

Run:

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

Expected: filtered status contains only the two untracked P16 docs; staged paths are empty.

- [ ] **Step 4: Stage exact files and verify.**

Run:

```powershell
git add -- docs/superpowers/specs/2026-07-11-p16-cookie-reader-safety-decision-freeze-design.md docs/superpowers/plans/2026-07-11-p16-cookie-reader-safety-decision.md
git diff --cached --name-only
```

Expected staged paths, exactly:

```text
docs/superpowers/plans/2026-07-11-p16-cookie-reader-safety-decision.md
docs/superpowers/specs/2026-07-11-p16-cookie-reader-safety-decision-freeze-design.md
```

- [ ] **Step 5: Commit the atomic decision packet.**

Run:

```powershell
git commit -m "docs: define p16 cookie reader safety decision"
```

Expected: one commit containing only the two P16 docs.

- [ ] **Step 6: Capture final evidence.**

Run:

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log -1 --oneline
git show --stat --oneline --summary HEAD
```

Expected: filtered status and staged paths are empty; HEAD message is `docs: define p16 cookie reader safety decision`; the commit contains only the two requested docs. Push remains `no`.

