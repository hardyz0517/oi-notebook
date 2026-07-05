# NoteX Agent Workbench Handoff: P4 Closeout

**Date:** 2026-06-28  
**Updated:** 2026-07-02  
**Scope:** P4 closeout and next-session handoff
**Role:** preserve the verified P4 boundary and guide P5 planning

## P4 closeout state

P4 is implemented in `codex/p4-agent-workbench` as a Web Reader + Evidence slice for the new Agent Workbench architecture.

Confirmed implementation:

- Activity Bar opens the new Agent Workbench without rerouting the old `src/components/ai/AiSidebar.tsx`.
- `src/lib/agent-runtime/**` provides typed sessions, events, tool registration, and permission gating.
- `src/lib/problem-workspace/**` provides the first `ProblemWorkspace` model and in-memory store helpers.
- `src/lib/agent-workbench/workbenchTaskFlow.ts` connects runtime, workspace, manual/Luogu/current task modes, evidence, permissions, and cache snapshots.
- `src/components/agent-workbench/**` renders the workspace panel, tool trace, evidence panel, and permission surface.
- `src/lib/research-engine/searchProvider.ts`, `readerProvider.ts`, `extractor.ts`, `evidenceStore.ts`, `cacheManager.ts`, and `pipelineBoundary.ts` separate search, read, extraction, evidence, and cache responsibilities.
- Tavily is configuration-aware and unavailable without a key/transport.
- Public search has a keyless Bing boundary.
- Manual URL reading works through the runtime path.
- Luogu Cookie Reader has an initial safety boundary: domain-limited, missing-cookie aware, and never forwards cookies to model or third-party payloads.
- Frontend-to-Rust IPC remains behind `src/lib/api.ts`, with `src/lib/apiContract.ts` aligned.
- `notes/**` was not modified.

Fresh closeout verification:

- `.\node_modules\.bin\vitest.cmd run src/lib/apiBoundary.test.ts src/lib/appShell.test.ts` passed: 2 files, 22 tests.
- P4 focused suite passed: 13 files, 26 tests.
- `.\node_modules\.bin\tsc.cmd --noEmit` passed.
- `.\node_modules\.bin\vite.cmd build` passed with only existing large chunk warnings.
- `cargo check --manifest-path .\src-tauri\Cargo.toml` passed with existing dead-code warnings.
- API boundary audit had no matches outside the approved boundary:
  `rg -n "@tauri-apps/api/core|\binvoke\s*\(" src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'`
- Browser smoke on Vite confirmed Workbench open, Run flow, Luogu mode, trace/evidence/permission rendering, state preservation, and old AI Sidebar isolation.

Known environment note:

- `pnpm.cmd` commands can be blocked before test execution by the Codex runtime dependency policy:
  `[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: msw@2.13.5, sharp@0.34.5`.
  Use the checked-in `node_modules\.bin\*.cmd` commands for local verification in this worktree unless the dependency policy is approved.

## Historical P3 baseline

- P3 closeout verification passed in `C:\Users\cpp_s\.codex\worktrees\730d\oi-notebook`.
- `vitest` passed: **57 files, 416 tests**.
- `tsc --noEmit` passed.
- No stage / commit / push was performed.
- `notes/**` was not touched.

## Original P4 start-point notes

The original start-point handoff recorded only partial P4 evidence:

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

## Existing P3 anchor

`docs/agent-workbench/phase3-closeout.md` is the main P3 boundary reference.

Key P3 conclusions from that note:

- old `src/components/ai/AiSidebar.tsx` is not wired to L5 capability
- `src/components/agent-workbench/**` stays read-model only
- permission UI emits fake structured intents only
- workspace / evidence / run / artifact panels are ref-only previews
- replay projects into read model; workspace truth stays behind the mutation adapter

## Safe P5 next steps

1. Keep `AiSidebar.tsx` as the legacy flow until a later migration is explicitly planned.
2. Promote the Workbench task flow from manual fixture reading to a real public search/read task using `createKeylessBingSearchProvider` and `createTauriUrlReaderProvider`.
3. Add a user-visible unavailable/config state for Tavily that can become active only after a user-provided key and explicit approval.
4. Keep Luogu cookie use behind the safety boundary; do not forward cookies to model providers, Tavily, browser extraction, logs, or evidence payloads.
5. Persist workspace/evidence state only after defining the storage boundary; P4 intentionally uses in-memory stores.
6. Treat write, execute, patch, and code-runner capabilities as permission placeholders until a separate P5/P6 plan approves them.

## Guardrails

- This thread should coordinate, verify, and integrate.
- It should not be the one doing all implementation work itself.
- When a slice needs code changes, spawn or hand off to a separate worker thread.
- Do not treat subagent reports as verified unless you have the final agent result.
- Do not infer that completion in one P4 slice means the others are done.
- Do not add real runtime/model/Tavily/note IO/patch/code execution into the old sidebar flow.
- Do not stage/commit/push unless explicitly asked.
