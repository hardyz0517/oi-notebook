# NoteX Agent Workbench Handoff: P4 Start Point

**Date:** 2026-06-28  
**Scope:** handoff for the next session after P3 closeout
**Role:** this thread is the manager / coordinator, not the executor

## What is confirmed

- P3 closeout verification passed in `C:\Users\cpp_s\.codex\worktrees\730d\oi-notebook`.
- `vitest` passed: **57 files, 416 tests**.
- `tsc --noEmit` passed.
- No stage / commit / push was performed.
- `notes/**` was not touched.

## Confirmed P4 progress

One subtask has returned a final result:

- **P4.2 Web Reader / Search**
  - The worker reported a search-read split skeleton.
  - It added or updated these files:
    - `src/lib/research-engine/searchProvider.ts`
    - `src/lib/research-engine/readerProvider.ts`
    - `src/lib/research-engine/extractor.ts`
    - `src/lib/research-engine/evidenceStore.ts`
    - `src/lib/research-engine/cacheManager.ts`
    - `src/lib/research-engine/pipelineBoundary.ts`
    - `src/lib/research-engine/index.ts`
  - The worker's own report says the current `research-engine` is still the old coupled pipeline and that Tavily / local reader / manual reader are not yet truly wired.

## Unconfirmed / do not assume

- I do **not** have a final verified report for:
  - `019f0d5b-65b8-74e3-ae3a-411ce2885835` (P4.0 Runtime Foundation)
  - `019f0d5b-b6a6-7ad1-adb7-d6549fa46651` (P4.1 Problem Workspace)
- Treat their state as unknown until you re-check them directly.
- Do not assume P4.0 or P4.1 are complete just because P4.2 finished.

## Current worktree snapshot

The main `730d` worktree currently shows these untracked P4 trees:

- `docs/agent-workbench/`
- `src/components/agent-workbench/`
- `src/lib/agent-runtime/`
- `src/lib/agent-search/`
- `src/lib/problem-workspace/`

## Existing P3 anchor

`docs/agent-workbench/phase3-closeout.md` is the main P3 boundary reference.

Key P3 conclusions from that note:

- old `src/components/ai/AiSidebar.tsx` is not wired to L5 capability
- `src/components/agent-workbench/**` stays read-model only
- permission UI emits fake structured intents only
- workspace / evidence / run / artifact panels are ref-only previews
- replay projects into read model; workspace truth stays behind the mutation adapter

## Plan Locations

The next session should start by reading these files in order:

1. `docs/NoteX_Agent_Workbench_PRD.md`
2. `docs/agent-workbench/phase3-closeout.md`
3. `docs/agent-workbench/phase0-architecture-freeze.md`
4. `docs/agent-workbench/phase1-closeout.md`
5. `docs/agent-workbench/phase2-closeout.md`
6. `docs/agent-workbench/phase3-interface-freeze.md`
7. `docs/agent-workbench/phase3-replay-harness.md`
8. `docs/agent-workbench/phase3-workbench-shell.md`
9. `docs/agent-workbench/phase3-permission-surface.md`
10. `docs/agent-workbench/phase3-workspace-panels.md`

If the session needs a single coordination note, use:

- `docs/agent-workbench/handoff-p4.md`

If it needs a product-level north star, use:

- `docs/NoteX_Agent_Workbench_PRD.md`

If it needs the full technical master plan, use:

- `docs/agent-workbench/technical-architecture-plan.md`

## Safe next steps

1. Create or resume separate worker threads for P4.0, P4.1, and P4.2 if more work is needed.
2. Re-check the worker outputs directly instead of assuming completion.
3. Verify whether the new P4.2 files actually exist in this worktree and pass typecheck/test.
4. Keep the old `AiSidebar` boundary intact.
5. Keep runtime, workspace, and search responsibilities separated.
6. Only after the above should the manager decide whether to continue P4 wiring or clean up the skeletons.

## Guardrails

- This thread should coordinate, verify, and integrate.
- It should not be the one doing all implementation work itself.
- When a slice needs code changes, spawn or hand off to a separate worker thread.
- Do not treat subagent reports as verified unless you have the final agent result.
- Do not infer that completion in one P4 slice means the others are done.
- Do not add real runtime/model/Tavily/note IO/patch/code execution into the old sidebar flow.
- Do not stage/commit/push unless explicitly asked.
