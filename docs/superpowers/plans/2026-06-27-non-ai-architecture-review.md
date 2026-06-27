# Non-AI Architecture Upgrade Review Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:receiving-code-review` to assess this branch before any implementation follow-up. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decide whether the current non-AI engineering-upgrade branch is ready to close, or whether there are still concrete architecture, contract, or verification gaps that need follow-up work.

**Architecture:** Review the branch as a boundary audit, not a feature review. Focus on whether the large entry points now behave like orchestration shells, whether the extracted helpers own the right contracts, whether docs and handoff notes describe the current ownership model, and whether the verification evidence is sufficient to call the branch mature. AI-related files stay frozen and are only mentioned as out-of-scope residue if they still block repo-wide verification.

**Tech Stack:** React 19, TypeScript, Vitest, Tauri 2, Rust, workspace docs.

---

## What "done" means

- The branch either has no meaningful non-AI architecture residue left, or the remaining residue is explicitly acceptable shell/orchestration code.
- Any remaining large files are justified by real coordination responsibility, not by mixed business logic.
- The extracted helper modules have test coverage that pins their contracts.
- The current docs and handoff state match the code structure the branch now has.
- Verification evidence is sufficient to close the branch without pretending frozen AI drift is fixed.

## Out of scope

- AI behavior changes, prompt changes, provider changes, web-search changes, or edits under `src/components/ai/**`, `src/lib/research-engine/**`, `src/lib/aiWebSearch.ts`, `src/lib/aiTagRecommendations.ts`, or `src-tauri/src/ai.rs`.
- Touching `notes/**` content files.
- Broad redesign, copy polish, or unrelated cleanup that does not affect the branch’s engineering maturity.

## Review order

1. Lock the exact branch surface and current diff.
2. Re-check the architecture boundaries in the changed files.
3. Verify the extracted helper contracts and focused tests.
4. Confirm docs and handoff text match the current ownership model.
5. Run the verification set and decide whether the branch can close.

### Task 1: Lock the branch surface before judging the architecture

**Files:**
- No code changes unless the review finds a real documentation mismatch.

**Target state:**
- The review is grounded in the current diff and not in stale memory.
- The exact files touched by the branch are known, including any docs or helper tests that were added during the engineering pass.

- [ ] **Step 1: Capture the filtered status and cached scope**

Run:
```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```
Expected: a precise list of changed files and no surprise scope drift into `notes/**`.

- [ ] **Step 2: Check whether the branch is already large for the right reasons**

Run:
```powershell
git diff --stat -- . ":(exclude)notes/**"
```
Expected: the diff size is explainable by boundary extraction, tests, and docs updates rather than by new feature sprawl.

- [ ] **Step 3: Check for any stale release or handoff assumptions**

Read:
- `docs/HANDOFF.md`
- `PROJECT.md`

Expected: the current handoff still matches the actual architecture and out-of-scope rules.

### Task 2: Re-check the main orchestration shells for any remaining mixed responsibility

**Files:**
- `src/App.tsx`
- `src/lib/columnResizeInteraction.ts`
- `src/lib/floatingPanelInteraction.ts`
- `src-tauri/src/blog_server.rs`
- `src-tauri/src/blog_server/request.rs`
- `src-tauri/src/blog_server/route.rs`
- `src-tauri/src/blog_server/response.rs`
- `src-tauri/src/blog_server/path_rules.rs`
- `src-tauri/src/notes.rs`
- `src-tauri/src/notes/search.rs`
- `local-blog/src/App.tsx`
- `local-blog/src/blogRoutes.ts`
- `src/lib/api.ts`

**Target state:**
- The big files read as coordinators.
- The helper files own the reusable pure rules.
- No file still mixes orchestration, path rules, search scoring, response formatting, or pointer lifecycle code in a way that would justify more decomposition.

- [ ] **Step 1: Inspect `src/App.tsx` and the resize helper**

Look for:
- any remaining hand-written pointer lifecycle for column resizing
- any helper overlap that would make a second split worthwhile
- any business rule that should have stayed in a smaller domain helper

Expected: `App.tsx` is an app shell, and `columnResizeInteraction.ts` owns the reusable session mechanics.

- [ ] **Step 2: Inspect `blog_server.rs` and its helper modules**

Look for:
- route parsing still embedded in the socket loop
- path safety rules still duplicated in the server body
- response writing still mixed with route classification
- any sign that the new modules are too thin or too coupled

Expected: the server file coordinates the loop and dispatch; the helpers own the rules.

- [ ] **Step 3: Inspect `notes.rs` and `notes/search.rs`**

Look for:
- search scanning, scoring, excerpt formatting, and command plumbing still tangled together
- whether `search.rs` now owns the meaningful search stages
- whether `notes.rs` still has one acceptable large domain block or still needs another split

Expected: the search pipeline is decomposed enough that further splits would be cosmetic, not structural.

- [ ] **Step 4: Inspect `local-blog/src/App.tsx`, `blogRoutes.ts`, and `src/lib/api.ts`**

Look for:
- route parsing or normalization logic leaking into the shell
- API wrapper logic turning into business logic
- any contract duplication that should have moved into the existing helper modules

Expected: `local-blog` is a shell, `blogRoutes.ts` is contract logic, and `api.ts` remains a thin boundary.

### Task 3: Verify the extracted contracts are pinned and not merely moved

**Files:**
- `src/lib/columnResizeInteraction.test.ts`
- `src/lib/floatingPanelInteraction.test.ts`
- `src/lib/blogServerBoundary.test.ts`
- `local-blog/src/blogRoutes.test.ts`
- `src-tauri/src/blog_server.rs` tests
- `src-tauri/src/notes.rs` tests

**Target state:**
- The branch’s helper modules have tests that would catch contract drift.
- Tests prove the extracted behavior, not just the end result.

- [ ] **Step 1: Read the helper tests for coverage shape**

Confirm the tests cover:
- resize pointer lifecycle cleanup and optional RAF batching
- blog route parsing and return-path safety
- blog server boundary assumptions
- notes search contract behavior

Expected: each extracted helper has at least one focused contract test.

- [ ] **Step 2: Decide whether any test gap is material**

If a helper has no meaningful contract test, judge whether that is a real maturity gap or just acceptable residual risk.

Expected: only real contract gaps are flagged; minor duplication or over-testing is not.

### Task 4: Reconcile the docs with the code that now exists

**Files:**
- `docs/HANDOFF.md`
- `PROJECT.md`
- `docs/superpowers/plans/2026-06-27-non-ai-architecture-upgrade.md`
- `docs/README.md` if the docs map needs a final sanity check

**Target state:**
- The docs describe the branch’s current ownership model instead of an older pre-extraction shape.
- The plan and handoff language are not overstating how much remains.

- [ ] **Step 1: Check the architecture ownership statements**

Read the current doc sections that describe:
- `src/App.tsx`
- `src-tauri/src/blog_server.rs`
- `src-tauri/src/notes.rs`
- `local-blog/src/App.tsx`
- `src/lib/api.ts`

Expected: the docs say these files are shells/coordinators where appropriate, and do not demand unnecessary further splitting.

- [ ] **Step 2: Check whether any plan text has gone stale**

If the plan still describes work as pending that is now done, or names files that are no longer the right owners, flag that as a documentation cleanup item only if it affects future maintenance.

Expected: the plan can remain as history, but it should not mislead the next person about current state.

### Task 5: Run the verification set and decide whether the branch can close

**Files:**
- No code changes unless verification exposes a real defect.

**Target state:**
- The branch has enough evidence to close with honest caveats.
- If the only blocker is frozen AI drift, that is documented as an unrelated residue, not a failure of this branch’s non-AI engineering work.

- [ ] **Step 1: Run the focused non-AI checks**

Run:
```powershell
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\vitest.cmd run src\lib\columnResizeInteraction.test.ts --reporter=dot
cargo check --manifest-path .\src-tauri\Cargo.toml
```
Expected: these should stay green if the non-AI boundary work is truly stable.

- [ ] **Step 2: Record any frozen-AI blocker separately**

If full Rust tests still fail because of frozen AI-area drift, document the exact file and reason, but do not widen scope into AI fixes.

Expected: the review distinguishes between branch quality and out-of-scope repo drift.

- [ ] **Step 3: Decide on closeout**

If the code, tests, and docs all read as mature enough, stop here and close the branch review.
If not, return only the genuinely justified follow-up items, with exact files and reasons.

## Review checklist

- The diff was reviewed from the current repo state.
- Main entry points now read like orchestration shells.
- No new non-AI mixed-responsibility hotspot was found.
- Helper modules have focused tests.
- Docs and handoff text match the code.
- Any remaining blocker is clearly out of scope for this branch.
