# Non-AI Architecture Upgrade Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the remaining non-AI code to a stable, maintainable baseline by turning large entry points into orchestration shells, centralizing recurring rules, and pinning the contracts with tests, without changing product behavior.

**Architecture:** Keep the current feature set and backend contracts. Extract manual pointer/session lifecycles into focused helpers, move repeated path/route rules into shared Rust modules, and split the notes search pipeline into smaller stages so the big files become true coordinators instead of mixed-responsibility dumps. AI-related files stay frozen.

**Tech Stack:** React 19, TypeScript, Vitest, Tauri 2, Rust, existing workspace scripts.

---

## What "done" means

- `src/App.tsx` keeps top-level composition, but no longer owns ad hoc pointer lifecycle code or other reusable interaction glue.
- `src-tauri/src/blog_server.rs` coordinates the preview server, but request parsing, route classification, response writing, and path rules live in focused helpers.
- `src-tauri/src/notes.rs` no longer mixes search scanning, scoring, formatting, and command plumbing in one large search function.
- `local-blog/src/App.tsx` remains a shell that loads data, reads the route, and composes views.
- Boundary tests fail when the route/path/search contracts drift.
- No AI files are modified in this effort.

## Out of scope

- AI sidebar, AI config, AI search, AI prompt polishing, or any file under `src/components/ai`, `src/lib/research-engine`, `src/lib/aiWebSearch.ts`, `src/lib/aiTagRecommendations.ts`, or `src-tauri/src/ai.rs`.
- Broad visual redesign or copy polishing that does not reduce coupling.
- Touching `notes/**` content files.

## Execution order

1. Finish the main app shell extraction.
2. Finish the Rust blog server boundary.
3. Split the notes search pipeline.
4. Lock the local-blog and frontend API contracts.
5. Run the full verification chain and confirm the remaining residue is acceptable.

### Task 1: Finish `src/App.tsx` shell extraction and remove the remaining manual resize lifecycle

**Files:**
- Modify: `src/App.tsx`
- Create: `src/lib/columnResizeInteraction.ts`
- Create: `src/lib/columnResizeInteraction.test.ts`
- Modify: `src/lib/floatingPanelInteraction.ts` only if the new helper clearly overlaps with existing pointer-session behavior

**Target state:**
- `App.tsx` keeps the state model and render wiring, but the pointerdown/move/up/cancel lifecycle for column resizing is no longer hand-written inline.
- The helper owns the shared drag-session mechanics for `left-sidebar`, `ai-sidebar`, and `editor-preview`.
- `App.tsx` still decides what each drag changes; the helper just manages pointer capture, cleanup, and optional RAF throttling.

- [ ] **Step 1: Freeze the current resize behavior with tests**

  Add a focused Vitest file for the resize helper and cover the three active resize modes:
  - left sidebar width drag
  - AI sidebar width drag with RAF batching
  - editor/preview ratio drag
  - cancellation cleanup restoring body cursor/user-select and active handle

  Run:
  ```bash
  pnpm.cmd vitest src/lib/columnResizeInteraction.test.ts
  ```
  Expected: fail before implementation.

- [ ] **Step 2: Extract the reusable pointer lifecycle**

  Move the shared pointerdown/move/up/cancel wiring out of `beginColumnResize` into `src/lib/columnResizeInteraction.ts`.

  The helper should own:
  - event.preventDefault on pointerdown
  - body cursor and user-select locking
  - pointermove registration
  - pointerup/pointercancel cleanup
  - optional RAF commit for the AI sidebar width preview

  `App.tsx` should keep only the width/ratio calculations and final state commits.

- [ ] **Step 3: Re-run the helper test and a TypeScript check**

  Run:
  ```bash
  pnpm.cmd vitest src/lib/columnResizeInteraction.test.ts
  pnpm.cmd tsc --noEmit
  ```
  Expected: both pass.

- [ ] **Step 4: Re-read the app shell**

  Confirm `src/App.tsx` no longer contains a custom pointer lifecycle block for column resizing and still reads as orchestration code rather than interaction plumbing.

### Task 2: Finish the Rust blog server boundary and move the remaining path rules out of the big file

**Files:**
- Modify: `src-tauri/src/blog_server.rs`
- Modify/Create: `src-tauri/src/blog_server/request.rs`
- Modify/Create: `src-tauri/src/blog_server/route.rs`
- Modify/Create: `src-tauri/src/blog_server/response.rs`
- Modify/Create: `src-tauri/src/path_safety.rs` or `src-tauri/src/blog_server/path_rules.rs` if a small server-local helper is cleaner
- Test: `src-tauri/src/blog_server.rs` or a dedicated `src-tauri/src/blog_server/*.test.rs`

**Target state:**
- Request parsing, route classification, response writing, and note/blog path rules are isolated and unit-testable.
- `blog_server.rs` keeps the socket loop and request buffer, but not the rule definitions themselves.
- The remaining note/asset/static path checks are centralized instead of duplicated inside the server body.

- [ ] **Step 1: Lock the route and request contracts**

  Add or tighten unit tests for:
  - GET request parsing
  - query stripping
  - `/api/notes`, `/api/note`, `/api/blog-config`
  - `/local-blog/`, `/legacy-blog/`, `/assets/`
  - the root route and not-found path

  Run:
  ```bash
  cargo test --manifest-path .\src-tauri\Cargo.toml blog_server
  ```
  Expected: route and request tests fail if the contract drifts.

- [ ] **Step 2: Move the remaining path rules into a shared helper**

  Centralize the note/asset/static containment and normalization checks so the server body no longer defines its own path rule set.

  Keep the current behavior intact:
  - absolute path rejection
  - traversal rejection
  - mixed slash normalization
  - case-safe containment checks where already required

- [ ] **Step 3: Keep the response helpers isolated**

  Ensure JSON, HTML, binary, and redirect response writing stay in one helper module with no route logic mixed in.

  The server should call those helpers, not inline response formatting.

- [ ] **Step 4: Re-run Rust tests and a syntax/style pass**

  Run:
  ```bash
  rustfmt --check src-tauri/src/blog_server.rs src-tauri/src/blog_server/request.rs src-tauri/src/blog_server/route.rs src-tauri/src/blog_server/response.rs
  cargo test --manifest-path .\src-tauri\Cargo.toml
  ```
  Expected: both pass.

- [ ] **Step 5: Confirm the server file is now an orchestrator**

  Re-read `src-tauri/src/blog_server.rs` and confirm the big file now mainly coordinates the socket loop, commands, and page rendering calls.

### Task 3: Split the notes search pipeline into smaller stages

**Files:**
- Modify: `src-tauri/src/notes.rs`
- Create: `src-tauri/src/notes/search.rs`
- Create: `src-tauri/src/notes/search_tests.rs` or keep tests inline in the new module
- Modify: `src-tauri/src/notes.rs` tests if a small contract assertion belongs there

**Target state:**
- `search_notes_in_dir` is no longer a single large block that scans, parses, scores, sorts, and formats all at once.
- The scan/parse/score/format stages are individually readable and testable.
- `notes.rs` keeps the Tauri commands and high-level plumbing.

- [ ] **Step 1: Freeze the current search contract with tests**

  Add tests for the current search behavior:
  - hidden files and hidden directories are skipped
  - non-markdown files are skipped
  - excerpt generation still returns a short human-readable snippet
  - title and summary fallback behavior stay stable
  - ordering remains score/date/path deterministic

  Run:
  ```bash
  cargo test --manifest-path .\src-tauri\Cargo.toml search_notes_in_dir
  ```
  Expected: fail before refactor if the coverage is missing.

- [ ] **Step 2: Extract scan and parse stages**

  Move the directory walk and file loading into a small search module so the stage boundaries are explicit:
  - walk notes
  - filter hidden entries
  - read markdown content
  - parse frontmatter/body

- [ ] **Step 3: Extract scoring and result formatting**

  Move the search scoring, sorting, and `NoteSearchResult` assembly into separate helper functions so `notes.rs` does not own the whole pipeline.

- [ ] **Step 4: Re-run the notes search tests**

  Run:
  ```bash
  cargo test --manifest-path .\src-tauri\Cargo.toml search_notes_in_dir
  cargo test --manifest-path .\src-tauri\Cargo.toml
  ```
  Expected: both pass.

- [ ] **Step 5: Re-read `notes.rs` for residual bulk**

  Confirm the remaining large parts are true domain code, not search pipeline glue.

### Task 4: Lock the local-blog and frontend contract surfaces

**Files:**
- Modify: `local-blog/src/blogRoutes.ts`
- Modify: `local-blog/src/blogContent.ts`
- Modify: `local-blog/src/blogViewModel.ts`
- Modify: `local-blog/src/blogRoutes.test.ts`
- Modify: `local-blog/src/blogContent.test.ts` or add a new focused test if needed
- Modify: `src/lib/api.ts` only if a contract mismatch is found during this pass

**Target state:**
- `local-blog` stays a shell, but its route and content contracts are pinned so they do not drift while the backend changes.
- The frontend API wrapper layer remains thin and typed; no extra business logic is added there.

- [ ] **Step 1: Add or tighten route contract tests**

  Cover:
  - hash route parsing
  - return-path generation
  - note hash `from=` safety
  - tag/collection/home/search page links

  Run:
  ```bash
  pnpm.cmd --dir local-blog vitest src/blogRoutes.test.ts
  ```
  Expected: pass after the contract is pinned.

- [ ] **Step 2: Add or tighten content normalization tests**

  Cover:
  - summary sanitization
  - frontmatter leakage prevention
  - note normalization
  - collection/tag compatibility behavior that already exists

- [ ] **Step 3: Keep `src/lib/api.ts` thin**

  Only touch the IPC wrapper layer if the route/path/search cleanup reveals a real contract drift.
  Do not add new business rules here.

- [ ] **Step 4: Re-run the local-blog build**

  Run:
  ```bash
  pnpm.cmd --dir local-blog build
  ```
  Expected: pass.

### Task 5: Run the full verification chain and decide whether the residue is acceptable

**Files:**
- No new code unless a verification failure reveals a real bug

**Target state:**
- The repo has a repeatable validation chain for the changed surfaces.
- Any remaining large files are large because they are genuine orchestration points, not because they hide unrelated responsibilities.

- [ ] **Step 1: Run the repo-wide checks in the stable order**

  Run:
  ```bash
  pnpm.cmd tsc --noEmit
  pnpm.cmd build
  pnpm.cmd --dir local-blog build
  cargo test --manifest-path .\src-tauri\Cargo.toml
  cargo check --manifest-path .\src-tauri\Cargo.toml
  ```
  Expected: all pass.

- [ ] **Step 2: Re-read the touched files**

  Confirm the remaining big files are acceptable orchestration files, not mixed-responsibility files.

- [ ] **Step 3: Narrow the final scope**

  Stage only the exact files touched by the upgrade.

## Review checklist

- Every changed file has one primary responsibility.
- No AI file was edited.
- No `notes/**` content file was touched.
- Behavior did not change unless a task explicitly preserves it.
- Each task can be validated independently.
- The final state is maintainable without over-splitting.
