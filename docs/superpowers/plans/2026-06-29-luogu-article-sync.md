# Luogu Article Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Luogu article sync buttons to the Markdown toolbar, with frontmatter binding, upload/pull review flows, and Luogu metadata editing.

**Architecture:** Keep the Luogu article feature as one vertical slice. Pure sync state and frontmatter helpers live in `src/lib/`, UI lives in small Luogu/editor components, and the webpage adapter stays behind a dedicated Rust module. Reuse the existing diff preview and review-tab shell instead of inventing a second review system.

**Tech Stack:** TypeScript, React, Tauri 2, Rust, `reqwest`, `serde`, `serde_yaml`, Radix UI, Lucide icons, Vitest.

---

## File Map

- `src/lib/frontmatter.ts`: add Luogu article frontmatter fields to the existing parser/serializer model.
- `src/lib/frontmatter.test.ts`: new focused unit tests for the new fields.
- `src/lib/luoguArticleSync.ts`: pure Luogu sync helpers for body extraction, metadata normalization, and enablement logic.
- `src/lib/luoguArticleSync.test.ts`: unit tests for the sync helpers.
- `src/lib/apiContract.ts`: register new Luogu article commands.
- `src/lib/api.ts`: add typed wrappers for the new commands.
- `src/lib/apiBoundary.test.ts`: keep the command contract synchronized.
- `src/components/editor/ReviewDiffPane.tsx`: reusable diff review shell for polish review and Luogu pull review.
- `src/components/luogu/LuoguArticleSyncToolbar.tsx`: toolbar button group and confirm triggers.
- `src/components/luogu/LuoguArticleInfoDialog.tsx`: metadata editor dialog.
- `src/components/luogu/useLuoguArticleSync.ts`: orchestration hook for upload/pull/info state.
- `src/App.tsx`: wire the toolbar, dialogs, review tabs, and frontmatter persistence.
- `src-tauri/src/luogu_article.rs`: new Luogu webpage adapter and command handlers.
- `src-tauri/src/lib.rs`: register the new Rust commands and module.
- `src-tauri/src/luogu.rs`: expose any shared Luogu config/cookie helpers needed by the new adapter.

### Task 1: Extend Frontmatter For Luogu Article Binding

**Files:**
- Modify: `src/lib/frontmatter.ts`
- Create: `src/lib/frontmatter.test.ts`
- Test: `src/lib/markdownDocument.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("parses and merges Luogu article fields", () => {
  const markdown = [
    "---",
    "title: Local title",
    "luogu_article_id: s58xwevf",
    "luogu_article_title: Remote title",
    "luogu_article_category: 1",
    "luogu_article_status: 0",
    "luogu_article_top: 2",
    "luogu_article_solution_for: P1234",
    "luogu_article_synced_at: 2026-06-29T12:00:00.000Z",
    "---",
    "Body",
  ].join("\n");

  const parsed = parseFrontmatterFields(markdown);
  expect(parsed.fields.luogu_article_id).toBe("s58xwevf");
  expect(parsed.fields.luogu_article_title).toBe("Remote title");
  expect(parsed.fields.luogu_article_status).toBe("0");
  expect(parsed.fields.luogu_article_solution_for).toBe("P1234");
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
pnpm.cmd test -- src/lib/frontmatter.test.ts
```

Expected: fail because the Luogu fields do not exist yet.

- [ ] **Step 3: Implement the Luogu fields**

Add the new fields to `FrontmatterFields`, `EMPTY_FIELDS`, `KNOWN_FIELD_ORDER`, `parseFrontmatterFields`, and `mergeFrontmatterFields`. Keep the serializer flat and preserve the existing frontmatter body handling.

- [ ] **Step 4: Run the focused tests again**

Run:

```bash
pnpm.cmd test -- src/lib/frontmatter.test.ts src/lib/markdownDocument.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit the frontmatter slice**

```bash
git add -- src/lib/frontmatter.ts src/lib/frontmatter.test.ts src/lib/markdownDocument.test.ts
git commit -m "feat: add luogu article frontmatter fields"
```

### Task 2: Add Stable Luogu Article Commands And Rust Module

**Files:**
- Create: `src-tauri/src/luogu_article.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/luogu.rs`
- Modify: `src/lib/apiContract.ts`
- Modify: `src/lib/api.ts`
- Modify: `src/lib/apiBoundary.test.ts`

- [ ] **Step 1: Write the failing contract tests**

```ts
expect(API_COMMAND_CONTRACTS).toContainEqual({
  functionName: "getLuoguArticle",
  commandName: "get_luogu_article",
  argKeys: ["lid"],
});
```

Also add one wrapper-parity expectation in `src/lib/apiBoundary.test.ts` for the new Luogu article wrappers.

- [ ] **Step 2: Run the boundary tests and confirm they fail**

Run:

```bash
pnpm.cmd test -- src/lib/apiBoundary.test.ts
```

Expected: fail until the new wrappers and contract rows exist.

- [ ] **Step 3: Add the command surface**

Add wrappers in `src/lib/api.ts` for:

```ts
getLuoguArticle(lid: string)
prepareLuoguArticlePush(input)
pushLuoguArticle(input)
pullLuoguArticle(lid: string)
```

Register matching rows in `src/lib/apiContract.ts` and add the Rust command handlers in `src-tauri/src/lib.rs`.

- [ ] **Step 4: Run the boundary tests again**

Run:

```bash
pnpm.cmd test -- src/lib/apiBoundary.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit the command-plumbing slice**

```bash
git add -- src-tauri/src/luogu_article.rs src-tauri/src/lib.rs src-tauri/src/luogu.rs src/lib/apiContract.ts src/lib/api.ts src/lib/apiBoundary.test.ts
git commit -m "feat: add luogu article sync commands"
```

### Task 3: Implement The Luogu Webpage Adapter

**Files:**
- Create: `src-tauri/src/luogu_article.rs`
- Modify: `src-tauri/src/luogu.rs`
- Test: `src-tauri/src/luogu_article.rs`

- [ ] **Step 1: Write adapter tests first**

Cover three behaviors in Rust tests:

```rust
#[test]
fn extracts_csrf_token_from_article_edit_html() { /* ... */ }

#[test]
fn parses_article_snapshot_from_lentille_context() { /* ... */ }

#[test]
fn maps_unauthorized_and_not_found_to_stable_errors() { /* ... */ }
```

The tests should use inline HTML fixture strings or small local fixture files, and assert that the parsed article snapshot contains `lid`, `title`, `content`, `status`, `category`, and `canEdit`.

- [ ] **Step 2: Run the Rust tests and confirm they fail**

Run:

```bash
cargo test --manifest-path .\src-tauri\Cargo.toml luogu_article
```

Expected: fail until the adapter exists.

- [ ] **Step 3: Implement the adapter**

In `src-tauri/src/luogu_article.rs`, add helpers to:

- read the saved Luogu cookie from config,
- fetch public article pages and edit pages,
- extract `csrf-token`,
- parse `lentille-context` article data,
- build create/update payloads,
- return a stable `LuoguArticleSnapshot` structure,
- map 401/403/404/network/parse failures to stable error strings.

Use the Luogu cookie shape already established by `_uid` and `__client_id`; do not expose the raw webpage route details to the frontend.

- [ ] **Step 4: Run the Rust tests again**

Run:

```bash
cargo test --manifest-path .\src-tauri\Cargo.toml luogu_article
```

Expected: pass.

- [ ] **Step 5: Commit the adapter slice**

```bash
git add -- src-tauri/src/luogu_article.rs src-tauri/src/luogu.rs src-tauri/src/lib.rs
git commit -m "feat: implement luogu article adapter"
```

### Task 4: Build Shared Sync Helpers And Luogu UI Components

**Files:**
- Create: `src/lib/luoguArticleSync.ts`
- Create: `src/lib/luoguArticleSync.test.ts`
- Create: `src/components/editor/ReviewDiffPane.tsx`
- Create: `src/components/luogu/LuoguArticleSyncToolbar.tsx`
- Create: `src/components/luogu/LuoguArticleInfoDialog.tsx`
- Create: `src/components/luogu/useLuoguArticleSync.ts`
- Modify: `src/components/editor/MarkdownEditor.tsx` only if a tiny prop/export change is needed

- [ ] **Step 1: Write the failing pure-logic tests**

```ts
it("splits luogu article body from frontmatter", () => { /* ... */ });
it("enables sync only when cookie and merge state are ready", () => { /* ... */ });
it("derives pull review metadata without touching the body", () => { /* ... */ });
```

Keep these tests in `src/lib/luoguArticleSync.test.ts` so they stay fast and do not need a browser renderer.

- [ ] **Step 2: Run the new tests and confirm they fail**

Run:

```bash
pnpm.cmd test -- src/lib/luoguArticleSync.test.ts
```

- [ ] **Step 3: Implement the reusable UI and state helpers**

Add pure helpers for:

- extracting the note body for upload,
- deriving upload/pull enablement,
- normalizing Luogu metadata from frontmatter,
- producing review tab titles and status labels.

Create the Luogu toolbar group with icon buttons and tooltips, and create a Luogu info dialog that edits only the Luogu fields in frontmatter.

Extract the generic diff review shell into `src/components/editor/ReviewDiffPane.tsx`, and let both the AI polish review and Luogu pull review use it.

- [ ] **Step 4: Run the helper tests again**

Run:

```bash
pnpm.cmd test -- src/lib/luoguArticleSync.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit the reusable component slice**

```bash
git add -- src/lib/luoguArticleSync.ts src/lib/luoguArticleSync.test.ts src/components/editor/ReviewDiffPane.tsx src/components/luogu/LuoguArticleSyncToolbar.tsx src/components/luogu/LuoguArticleInfoDialog.tsx src/components/luogu/useLuoguArticleSync.ts
git commit -m "feat: add luogu article sync ui helpers"
```

### Task 5: Wire The Toolbar, Upload Confirmation, And Pull Review In App

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/OpenTabsBar.tsx` only if the review tab display needs a small status tweak
- Modify: `src/components/editor/MarkdownEditor.tsx` only if the toolbar composition needs a tiny export or prop adjustment

- [ ] **Step 1: Wire the Luogu toolbar actions into App**

Add state and handlers for:

- opening the Luogu info dialog,
- preparing upload confirmation,
- starting upload,
- starting pull review,
- applying the pulled body back into the current note,
- preserving the current frontmatter when only the body changes.

The toolbar group should sit alongside the existing `trailingContent` area, not inside the formatting button groups.

- [ ] **Step 2: Reuse the review-tab flow for pull review**

Treat Luogu pull review as the same class of editor review as polish review: create a review tab entry, open it in the editor area, and let `ReviewDiffPane` render the diff. The apply action should replace only the body, then reassemble the note with the existing frontmatter prefix.

- [ ] **Step 3: Add the upload confirmation dialog**

Use the existing `CodexDiffPreview` and `getDiffStats` to show:

- local body versus remote body,
- changed-line counts,
- Luogu target title/category/status,
- create-new versus update-existing summary,
- explicit recreate/unlink choice when the remote article is unavailable.

- [ ] **Step 4: Run the app-level tests**

Run:

```bash
pnpm.cmd test -- src/lib/apiBoundary.test.ts src/lib/frontmatter.test.ts src/lib/luoguArticleSync.test.ts
```

Then run the full build checks:

```bash
pnpm.cmd build
cargo check --manifest-path .\src-tauri\Cargo.toml
```

Expected: both pass.

- [ ] **Step 5: Commit the App wiring slice**

```bash
git add -- src/App.tsx src/components/layout/OpenTabsBar.tsx src/components/editor/MarkdownEditor.tsx
git commit -m "feat: wire luogu article sync into editor"
```

### Task 6: Manual Smoke And Final Validation

**Files:**
- None for code changes; this is a verification task.

- [ ] **Step 1: Run the existing test subset one last time**

Run:

```bash
pnpm.cmd test -- src/lib/apiBoundary.test.ts src/lib/frontmatter.test.ts src/lib/luoguArticleSync.test.ts
```

- [ ] **Step 2: Verify the Rust side**

Run:

```bash
cargo test --manifest-path .\src-tauri\Cargo.toml luogu_article
```

- [ ] **Step 3: Smoke the Luogu flows in the app**

Manually verify:

- no cookie: buttons disabled,
- expired cookie: upload blocked with a clear message,
- existing article: upload updates the same `lid`,
- pull: opens review tab instead of overwriting immediately,
- info dialog: updates only frontmatter,
- deleted remote article: binding stays until explicit unlink.

- [ ] **Step 4: Stop and report exact verification results**

Include the commands run, pass/fail, and whether any files remain staged or committed.

## Coverage Check

- Spec section 1 and 2: Tasks 1, 4, and 5.
- Spec section 3 and 5: Tasks 2 and 3.
- Spec section 4: Task 1.
- Spec section 6: Task 3.
- Spec section 7, 8, 9, and 10: Tasks 4 and 5.
- Spec section 11: Tasks 3, 4, and 5.
- Spec section 12: Tasks 3 and 5.
- Spec section 13: Tasks 1, 2, 3, 4, and 6.
- Spec section 14: Out of scope is preserved by not adding batch sync, background sync, image migration, or three-way merge.
