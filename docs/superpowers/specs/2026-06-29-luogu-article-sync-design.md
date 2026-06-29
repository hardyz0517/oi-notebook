# Luogu Article Sync Design

Date: 2026-06-29
Status: draft for user review

## 1. Goal

Add Markdown editor toolbar actions for syncing the current note with a Luogu article.

The feature must support:

- Uploading the current Markdown body to Luogu.
- Pulling the Luogu article body back into the editor through a review diff.
- Editing Luogu article metadata used on the next sync.
- Remembering the Luogu article id in frontmatter so repeat uploads update the same article instead of creating duplicates.

The first version is single-article, current-note only. It does not include batch sync, automatic three-way merge, image migration, or scheduled background sync.

## 2. Product Decisions

- Store the Luogu binding and metadata in the current note frontmatter.
- Upload only the Markdown body. Frontmatter is local metadata and must not be sent to Luogu article content.
- If the remote article is deleted, inaccessible, or temporarily unreadable, keep the local binding and ask the user to either recreate the article or explicitly unlink it.
- Pulling from Luogu always opens a review diff first. It never overwrites the local body without user confirmation.
- Uploading to Luogu shows a confirmation dialog with a diff and changed-line counts before writing the remote article.
- Treat Luogu article integration as a webpage adapter. Luogu does not expose a stable machine API for this path, so all internal route and HTML parsing assumptions stay behind the backend adapter boundary.

## 3. Architecture

Use a vertical `LuoguArticleSync` slice.

Frontend responsibilities:

- Add a compact Luogu article sync group to the Markdown toolbar.
- Read and update current-note frontmatter through existing frontmatter helpers.
- Split frontmatter from body before upload.
- Show upload confirmation diff and pull-review tabs.
- Apply accepted pull reviews by replacing only the Markdown body.

Backend responsibilities:

- Read the saved Luogu cookie configuration.
- Fetch Luogu pages with `_uid` and `__client_id`.
- Extract CSRF tokens from Luogu HTML.
- Parse `lentille-context` article data from public and edit pages.
- Submit create/update requests through Luogu webpage routes.
- Return structured success and error results to the frontend.

The frontend API boundary continues to go through `src/lib/api.ts` and `src/lib/apiContract.ts`. The UI should not know Luogu internal route names such as `article.edit.submit`; those are backend adapter details.

## 4. Frontmatter Fields

Use flat fields so the existing frontmatter merge model can support them without a nested-YAML rewrite.

```yaml
luogu_article_id: s58xwevf
luogu_article_title: Example title
luogu_article_category: 1
luogu_article_status: 1
luogu_article_top: 2
luogu_article_solution_for: ""
luogu_article_synced_at: "2026-06-29T12:00:00.000Z"
```

Do not reuse local `title`, `category`, or `draft` as Luogu fields. They may have different meanings for local notes and local blog output. The Luogu metadata dialog can initialize empty Luogu fields from local note fields, but after that they are independent.

Field meanings:

- `luogu_article_id`: Luogu article `lid`. Empty means upload creates a new article.
- `luogu_article_title`: Article title sent to Luogu.
- `luogu_article_category`: Luogu article category id.
- `luogu_article_status`: Luogu article status value, including draft/public states supported by Luogu.
- `luogu_article_top`: Luogu article top value. Default should match Luogu's webpage default.
- `luogu_article_solution_for`: Optional related problem id for solution-style articles.
- `luogu_article_synced_at`: Last successful local sync timestamp.

## 5. Backend Commands

Expose stable commands shaped around product actions, not Luogu internal routes.

```ts
interface LuoguArticleMetadata {
  lid: string | null;
  title: string;
  category: number;
  status: number;
  top: number;
  solutionFor: string;
}

interface LuoguArticleSnapshot {
  metadata: LuoguArticleMetadata;
  content: string;
  canEdit: boolean;
  url: string | null;
}
```

Commands:

- `get_luogu_article(lid)`: fetch an existing remote article snapshot.
- `prepare_luogu_article_push(input)`: validate cookie, fetch remote state when `lid` exists, and return data needed for the confirmation diff.
- `push_luogu_article(input)`: create or update the Luogu article after user confirmation.
- `pull_luogu_article(lid)`: fetch remote article body and metadata for review.

The backend adapter should map Luogu HTTP and parsing failures into stable error codes:

- `cookie_missing`
- `auth_expired`
- `not_found`
- `permission_denied`
- `adapter_changed`
- `network`

## 6. Luogu Web Adapter Notes

Current Luogu article pages expose useful state through `lentille-context`. Public article pages include article fields such as `lid`, `title`, `category`, `content`, `status`, `solutionFor`, and `canEdit`. Edit pages require login and return 403 without cookie.

Luogu's current frontend article editor initializes a form with fields equivalent to:

```ts
{
  title: string;
  category: number;
  content: string;
  solutionFor: string;
  status: number;
  top: number;
}
```

The webpage uses a CSRF token from the page `<meta name="csrf-token">` and submits through internal route names for new/edit/delete article actions. The backend must hide those details so future Luogu page changes are isolated to one adapter.

## 7. Toolbar UI

Add a Luogu article sync group near the Markdown toolbar trailing content, separated from formatting actions and editor/preview controls.

Buttons:

- Upload to Luogu.
- Pull from Luogu.
- Article info.

Use icon buttons with tooltips. The buttons are enabled only when:

- A Markdown document is open.
- Frontmatter can be safely merged.
- Luogu cookie settings are configured.

Additional per-action gating:

- Pull requires `luogu_article_id`.
- Upload without `luogu_article_id` creates a new article after confirmation.
- Article info works without an id so the user can prepare metadata before first upload.

When cookie is missing, show disabled buttons with a tooltip that points the user to Luogu settings.

## 8. Upload Flow

1. User clicks Upload to Luogu.
2. Frontend splits current full Markdown into frontmatter and body.
3. Frontend reads Luogu metadata from frontmatter.
4. Backend prepares the push:
   - If `luogu_article_id` exists, fetch the remote article and edit permission.
   - If no id exists, report that this will create a new article.
5. Frontend shows a confirmation dialog:
   - Existing article: local body versus remote body diff.
   - New article: create-new summary plus article body preview.
   - Show `+/-` changed-line counts using existing diff helpers.
   - Show target status, category, title, and link when available.
6. User confirms.
7. Backend creates or updates the article.
8. Frontend writes returned `lid` and metadata into frontmatter, updates `luogu_article_synced_at`, and keeps the editor body unchanged.

If the existing remote article is unavailable, the dialog offers:

- Recreate as new article.
- Unlink local binding.
- Cancel.

Unlinking is explicit and only removes `luogu_article_*` fields.

## 9. Pull Flow

1. User clicks Pull from Luogu.
2. Backend fetches the remote article snapshot.
3. Frontend opens a review tab in the editor area.
4. The review tab compares current local body with remote body using the existing diff preview style.
5. User chooses Apply remote version.
6. Frontend replaces only the body and preserves frontmatter.

Pull review tab labels should make the direction clear, for example:

- Title: `洛谷同步审阅`
- Primary action: `应用远端版本`
- Status labels: pending, applied, closed, stale

## 10. Article Info Dialog

The Article Info dialog edits Luogu metadata stored in frontmatter.

Fields:

- Article title.
- Category.
- Status.
- Top value.
- Related problem id.
- Article id and article link.

Behavior:

- Empty Luogu title can default from local `title` or filename.
- Article id is shown as a binding field. It should not be edited inline casually.
- Provide explicit actions for binding an existing article id and unlinking the current article id.
- Saving the dialog updates frontmatter only. It does not contact Luogu until the next upload.

## 11. Error Handling

Do not clear local bindings automatically on errors.

Error behavior:

- `cookie_missing`: buttons are disabled and the tooltip points to Luogu settings.
- `auth_expired`: show that the saved cookie may have expired. Keep binding.
- `not_found`: say the remote article is unavailable. Offer recreate, unlink, or cancel.
- `permission_denied`: block upload and explain that the account cannot edit the article.
- `adapter_changed`: say Luogu page structure may have changed. Keep local content and binding.
- `network`: allow retry. Keep local content and binding.

If remote content changed since the last successful sync, first version does not perform three-way merge. It shows the remote/local diff and lets the user decide whether to overwrite remote or pull remote for review.

## 12. Component Reuse

Reuse existing UI and domain helpers where possible:

- `MarkdownEditorToolbar` and `ToolbarButton` for toolbar integration.
- `Dialog` primitives for upload confirmation and article info.
- `CodexDiffPreview` and `getDiffStats` for changed-line previews.
- Existing open-review-tab layout for pull review, generalized if needed instead of duplicating a full diff shell.
- Existing frontmatter parsing and merge helpers, extended for Luogu fields.

Do not add a separate editor or second diff implementation for this feature.

## 13. Testing And Validation

Frontend tests:

- Frontmatter parsing and merging for Luogu article fields.
- Upload button enabled/disabled states.
- Pull review applies remote body while preserving frontmatter.
- Article info dialog writes frontmatter metadata without changing body.

Backend tests:

- CSRF token extraction from HTML.
- `lentille-context` article parsing.
- Luogu status/error mapping.
- Create/update payload construction from metadata and body.

Manual smoke:

- No cookie configured.
- Expired or invalid cookie.
- Bind to an existing public article and pull.
- Create a new draft article.
- Update the same article twice and verify the second upload does not create a duplicate.
- Simulate unavailable remote article and verify binding is preserved until explicit unlink.

Automated CI should not write real Luogu articles. Network-writing tests remain manual or use captured fixtures.

## 14. Out Of Scope

- Batch sync across multiple notes.
- Automatic scheduled sync.
- Automatic image upload or Markdown asset migration.
- Three-way merge.
- Full local blog integration.
- Changing existing Luogu submission import workflows.
