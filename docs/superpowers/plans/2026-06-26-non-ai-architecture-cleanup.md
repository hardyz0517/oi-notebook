# Non-AI Architecture Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the remaining non-AI architectural residue to a stable, maintainable baseline without changing product behavior.

**Architecture:** Keep the current feature set and contracts. Extract orchestration out of the giant entry points, centralize shared path/route rules, and tighten boundary tests around the riskiest server and file operations. Do not touch any AI-related files in this plan.

**Tech Stack:** React 19, TypeScript, Vitest, Tauri 2, Rust, existing workspace scripts.

---

## What "done" means

- `src/App.tsx` is an assembly shell, not the place where most business logic lives.
- `src-tauri/src/blog_server.rs` coordinates preview serving, but request parsing and route handling are cleanly isolated and testable.
- `src-tauri/src/notes.rs` and `src-tauri/src/git.rs` do not each carry their own version of the same note-path safety logic.
- `local-blog/src/App.tsx` only loads route/data and composes views.
- The route/path/server boundary behavior has tests that fail if the contract drifts.
- No AI files are modified in this effort.

## Out of scope

- AI sidebar, AI config, AI search, AI prompt polishing, or any file under `src/components/ai`, `src/lib/research-engine`, `src/lib/aiWebSearch.ts`, `src/lib/aiTagRecommendations.ts`, or `src-tauri/src/ai.rs`.
- Broad UI polish that does not reduce coupling or raise maintainability.
- Rewriting the app into a new framework or introducing new infrastructure for its own sake.

## Execution order

1. Shrink the main app shell.
2. Harden and simplify the Rust blog server boundary.
3. Deduplicate Rust note/git path safety.
4. Trim the local blog shell and normalize its contract usage.
5. Lock everything down with boundary tests and a full verification pass.

### Task 1: Reduce `src/App.tsx` to an orchestration shell

**Files:**
- Modify: `src/App.tsx`
- Create: `src/components/app/useAppWorkspace.ts`
- Create: `src/components/app/useAppWindow.ts`
- Create: `src/components/app/useAppDocument.ts`
- Test: `src/lib/apiBoundary.test.ts` if imports or API usage boundaries change

**Target state:**
- `App.tsx` still owns top-level composition and global layout, but most stateful workflows move into focused hooks.
- Loading notes/config, tab restoration, editor/preview sync, and window actions become reusable controllers.
- The shell keeps only wiring, top-level feature toggles, and render composition.

- [ ] **Step 1: Split the largest state clusters into hooks**

  Move note/config loading, tab restoration, and window-only actions into focused hooks under `src/components/app/`.

- [ ] **Step 2: Keep the shell thin**

  Leave `App.tsx` responsible for assembling the hooks and rendering the layout, not for owning every interaction detail.

- [ ] **Step 3: Preserve behavior**

  Do not change current save/load semantics, preview behavior, or the existing feature toggles.

- [ ] **Step 4: Verify shell boundaries**

  Run:
  ```bash
  pnpm.cmd tsc --noEmit
  ```
  Expected: pass.

### Task 2: Clean up the Rust blog server boundary

**Files:**
- Modify: `src-tauri/src/blog_server.rs`
- Create: `src-tauri/src/blog_server/request.rs`
- Create: `src-tauri/src/blog_server/response.rs`
- Create: `src-tauri/src/blog_server/routing.rs`
- Test: `src-tauri/src/blog_server.rs` unit tests or a new module test file under `src-tauri/src/blog_server/`

**Target state:**
- Request parsing, route classification, and response writing are separated.
- The server still serves the same routes and same pages.
- The 2048-byte request buffer and the socket loop remain internal details, not scattered through the module.

- [ ] **Step 1: Extract request parsing**

  Move the first-line parsing and target normalization into a small request module.

- [ ] **Step 2: Extract route classification**

  Move `BlogRoute` decision logic into a dedicated routing module with direct unit tests.

- [ ] **Step 3: Extract response helpers**

  Keep JSON, HTML, binary, and redirect response writing in one response helper module.

- [ ] **Step 4: Preserve route behavior**

  Verify `/api/notes`, `/api/note`, `/api/blog-config`, `/local-blog/`, `/legacy-blog/`, and `/assets/` still behave exactly as before.

- [ ] **Step 5: Verify Rust boundary**

  Run:
  ```bash
  cargo test --manifest-path .\src-tauri\Cargo.toml
  ```
  Expected: pass.

### Task 3: Deduplicate note/git path safety in Rust

**Files:**
- Modify: `src-tauri/src/notes.rs`
- Modify: `src-tauri/src/git.rs`
- Create: `src-tauri/src/path_safety.rs`
- Test: `src-tauri/src/notes.rs` and `src-tauri/src/git.rs` existing tests, plus new tests for shared helpers

**Target state:**
- One shared helper owns note-path normalization and traversal rejection.
- `notes.rs` and `git.rs` use the same rules for absolute paths, traversal segments, and notes-directory containment.
- The two-layer safety check in `notes.rs` stays intact.

- [ ] **Step 1: Extract shared path helpers**

  Create a small Rust module that normalizes note-relative paths and validates containment under `notes/`.

- [ ] **Step 2: Rewire note commands**

  Update `notes.rs` to call the shared helper while preserving the existing two-layer safety check.

- [ ] **Step 3: Rewire git pathspec handling**

  Update `git.rs` to call the same helper for note and asset pathspecs.

- [ ] **Step 4: Lock the contract with tests**

  Add tests for:
  - empty path rejection
  - absolute path rejection
  - traversal rejection
  - mixed slash normalization
  - case-safe notes containment

- [ ] **Step 5: Verify Rust boundary**

  Run:
  ```bash
  cargo test --manifest-path .\src-tauri\Cargo.toml
  ```
  Expected: pass.

### Task 4: Trim the local blog shell and align contract usage

**Files:**
- Modify: `local-blog/src/App.tsx`
- Modify: `local-blog/src/blogRoutes.ts`
- Modify: `local-blog/src/blogContent.ts`
- Modify: `local-blog/src/blogViewModel.ts`
- Test: `local-blog/src/*.test.ts`

**Target state:**
- `local-blog/src/App.tsx` only loads data, resolves routes, and composes views.
- Route parsing and return-path rules live in `blogRoutes.ts`.
- Content normalization stays in `blogContent.ts`.
- View decisions stay in `blogViewModel.ts`.

- [ ] **Step 1: Pull page concerns out of `App.tsx`**

  Keep `App.tsx` as the shell for fetching data, tracking route state, and selecting the top-level view.

- [ ] **Step 2: Keep route rules canonical**

  Ensure all return-path and hash-route logic uses `blogRoutes.ts` only.

- [ ] **Step 3: Keep content normalization canonical**

  Ensure all blog note/config normalization flows through `blogContent.ts`.

- [ ] **Step 4: Preserve the visible blog**

  Do not change the page structure, only the organization behind it.

- [ ] **Step 5: Verify local-blog build**

  Run:
  ```bash
  pnpm.cmd --dir local-blog build
  ```
  Expected: pass.

### Task 5: Add boundary tests and finish with a full verification pass

**Files:**
- Modify: `src/lib/blogServerBoundary.test.ts` or add focused Rust tests if needed
- Modify: `src-tauri/src/blog_server.rs` tests if route coverage is best kept there
- Modify: `src-tauri/src/notes.rs` tests if path safety coverage is best kept there
- Modify: `src/lib/apiBoundary.test.ts` only if the front-end contract surface changes

**Target state:**
- The most failure-prone boundaries are pinned by tests.
- The final check covers TypeScript, the main UI build, the local blog build, and Rust compilation/tests.

- [ ] **Step 1: Add route and path boundary tests**

  Cover the route matrix and path-safety edge cases that would regress easily during future refactors.

- [ ] **Step 2: Run the repo-wide verification chain**

  Run:
  ```bash
  pnpm.cmd tsc --noEmit
  pnpm.cmd build
  pnpm.cmd --dir local-blog build
  cargo test --manifest-path .\src-tauri\Cargo.toml
  cargo check --manifest-path .\src-tauri\Cargo.toml
  ```
  Expected: all pass.

- [ ] **Step 3: Confirm the remaining residue is acceptable**

  Re-read the changed files and confirm the only remaining large files are large because they are true orchestration points, not because they hide unrelated responsibilities.

- [ ] **Step 4: Commit in a narrow scope**

  Stage only the exact files touched by the cleanup and keep AI files untouched.

## Review checklist

- Every changed file has one primary responsibility.
- No AI file was edited.
- No behavior changed unless the plan explicitly calls for preserving it.
- Each task can be validated on its own.
- The final state is “general big-company maintainable,” not over-split or over-abstracted.
