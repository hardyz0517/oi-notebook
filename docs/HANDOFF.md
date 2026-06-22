# HANDOFF

This handoff records the current foundation-first engineering state for
OI Notebook. It is the operating manual for future coding agents and should be
updated at the end of each architecture phase.

## Current Direction

The current strategy is still foundation first, AI frozen. Non-AI app
infrastructure should become easier to review and test before the later AI
assistant upgrade begins.

Do not change AI behavior during this phase. That includes prompts, providers,
models, web search behavior, Tavily/no-key search behavior,
`src/components/ai/AiSidebar.tsx`, `src/lib/aiWebSearch.ts`, and
`src-tauri/src/ai.rs`.

## Hard Guardrails

- Do not touch `notes/**` unless the user explicitly asks.
- Do not simplify the two-layer path safety checks in
  `src-tauri/src/notes.rs`.
- Frontend-to-Rust command calls go through `src/lib/api.ts`.
- Keep Settings V2 visual structure stable. Do not edit
  `src/components/settings/v2/settingsV2.css` during foundation cleanup.
- Do not use `git add .`; stage exact paths and check
  `git diff --cached --name-only` before committing.
- Routine status checks should use
  `git status --short -- . ":(exclude)notes/**"`.

## App Shell Boundary

`src/App.tsx` is still the app shell and composition root. It may keep:

- backend API call ordering;
- toasts and confirm dialogs;
- cross-domain orchestration;
- app-level state wiring;
- modal/dialog shell behavior.

It should not regain ownership of stable domain rules such as selection plans,
task labels, disabled-state formulas, path rewrite rules, config
normalization, or reusable status summaries. Those rules now belong in focused
domain modules with tests.

## Current Domain Owners

- Notes workspace:
  `src/lib/noteWorkspace.ts` owns note path plans, dialog reset state, tree
  selection, inline create state, and deleted/renamed workspace reference
  updates.
- App status and shell:
  `src/lib/appStatusLabels.ts` and `src/lib/appShell.ts` own pure status
  labels, shell navigation helpers, and stable shell/about-page static models.
- Blog:
  `src/lib/blogConfig.ts` owns blog defaults, draft normalization, save
  validation, and Blog settings view state. App-level Blog API calls remain in
  `App.tsx`.
- Local index:
  `src/lib/localIndexStatus.ts` owns local index status, task view state,
  rebuild labels, and details formatting.
- Luogu account/config:
  `src/lib/luoguConfigForm.ts` owns account form state, save payload
  validation, AI-configured detection, and account settings view state.
- Luogu rules:
  `src/components/settings/pages/luoguImportRules.ts` owns import rule schema,
  storage normalization, rule row models, and prepared-note path rewrites.
- Luogu import workflow:
  `src/components/luogu/useLuoguImportWorkflow.ts` owns import workspace
  source state such as selected ids, skipped ids, prepared notes, prepare/write
  state, active preview, edited markdown ids, and reset helpers.
- Luogu import display/controller rules:
  `src/components/luogu/luoguImportDisplay.ts` and
  `src/components/luogu/useLuoguImportController.ts` own task/view state,
  selection plans, scan summaries, prepare/write progress, candidate display,
  and reusable preview grouping.
- Tag taxonomy settings:
  `src/lib/tagTaxonomySettingsModel.ts` owns taxonomy stats, visible entry and
  alias lists, status tone, and settings action state.
- Collection/tag presets:
  `src/lib/collectionTags.ts` owns common collection presets, common new-note
  tag presets, collection-tag parsing, display tags, and collection candidate
  derivation.
- App preferences:
  `src/lib/appPreferences.ts` owns persisted preference keys, preference
  clamping/defaults, and stable preference option models such as reading
  density choices.
- Tag normalization:
  `src/components/tag-manager/tagNormalizationScan.ts` owns scan/apply task
  state, stats, selection summaries, and panel state.
- Tag Manager config rules:
  `src/components/tag-manager/tagManagerConfig.ts` owns Tag Manager config
  normalization, custom tag create/edit/delete rules, alias update validation,
  merge rule updates, collection candidate updates, filtered root/suggestion
  helpers, and save debug event labels.
- Tag Manager workspace:
  `src/components/tag-manager/tagManagerViewModel.ts` owns filtered
  suggestions/root groups, active root fallback state, selected suggestion
  display, alias display state, merge preview/candidates, collection rows,
  sort disabled state, and search results.
- API boundary:
  `src/lib/api.ts` is the only non-AI frontend Rust command boundary.
  `src/lib/apiContract.ts` records the command wrapper contract, and
  `src/lib/apiBoundary.test.ts` verifies both direct-invoke isolation and
  contract consistency.
- Settings render guards:
  `src/components/settings/settingsRenderGuards.ts` owns settings page/group
  render guard rules.
- Local blog routes:
  `local-blog/src/blogRoutes.ts` owns local-blog hash route parsing, route
  href builders, note return-target validation, and return labels. The
  local-blog App shell should pass `window.location.hash` into this helper
  instead of owning route rules directly.
- Local blog content model:
  `local-blog/src/blogContent.ts` owns local-blog frontmatter parsing, note
  summary/detail normalization, summary cleanup, display tags, collection
  grouping, search, pagination, date formatting, and Blog config defaults.
  The local-blog App shell should load data and render views instead of owning
  these content rules directly.
- Local blog view model:
  `local-blog/src/blogViewModel.ts` owns local-blog tag chip labels, related
  tag chip expansion, tag chip search matching, tag-map group/branch view data,
  tag-map route/search state, tag detail route data, tag detail header data,
  collection overview state/card rows, collection
  detail route data, collection detail entries state, collection detail header
  data, collection detail entry rows, article archive route data, article
  archive entries state, home route data, note detail route data, archive list
  sections/rows, archive year index data, search route result data, recent
  update cards, post results state, note detail header/navigation context, note
  navigation items, compact post card/result rows, compact pagination
  items/links, and tag diagnostics payloads/debug-enable rules.
  The local-blog App shell should render these
  ready-to-render items, read browser debug flags, and perform console side
  effects instead of owning tag-map, tag detail filtering/pagination, collection overview/detail rows, archive
  list rows, collection detail filtering/pagination, article archive
  pagination/year grouping/index data, home pagination/latest-note data, note
  detail route data, site nav active state, article toc active state, note
  navigation card state, collection detail entries state, search result
  pagination/count labels, article archive entries state, recent update cards,
  note detail header/navigation context, note navigation items,
  post results state, post card/result rows, pagination items/links, tag-map
  route/search state, or diagnostics data-shaping rules directly.
- Rust blog content:
  `src-tauri/src/blog_content.rs` owns production/local-blog note scanning,
  note API JSON shaping, note detail loading, frontmatter parsing, collection
  and excerpt rules, and their focused tests. `src-tauri/src/blog_server.rs`
  owns HTTP routing, path/static asset safety, response writing, local-blog
  static serving, and legacy HTML rendering.
- Rust Luogu reader:
  `src-tauri/src/luogu_reader.rs` owns Luogu problem/solution/discussion
  content reader input/result types, problem id and kind normalization,
  reader URLs, source roles, permission result shaping, lentille JSON
  extraction, content extraction, HTTP request logic, and focused tests.
  `src-tauri/src/luogu.rs` remains the command-side owner for config,
  submissions, note preparation/write, and AI-adjacent Luogu import behavior.
- Rust local search:
  `src-tauri/src/local_search.rs` remains the local index/search service owner
  for command entry, index persistence, scanning/frontmatter parsing, query
  expansion, OI synonym logic, scoring, chunking/snippets, diagnostics, ids,
  and metadata. Focused tests now cover the main pure rules; do not split the
  file just for line count.

## Long-Task Model

Non-AI long-running flows should use `src/lib/taskStatus.ts` when practical.
The preferred flow is:

```text
raw source state -> TaskState/domain state helper -> domain task view -> UI props
```

Aligned areas now include local index rebuild/load state, Luogu
scan/prepare/write state, and tag normalization scan/apply state. Future
long-running flows should not invent new clusters of `isLoading`, `isBusy`,
`error`, `progressText`, and `buttonLabel` when the shared task model can
represent the workflow.

## API Contract Rules

When adding or changing a Rust command wrapper:

1. Add or update the wrapper in `src/lib/api.ts`.
2. Add or update the matching row in `src/lib/apiContract.ts`.
3. Keep the wrapper's command name and argument object keys aligned with the
   contract.
4. Run `pnpm.cmd vitest run src/lib/apiBoundary.test.ts`.
5. Run the API boundary audit:
   `rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'`.

The contract is intentionally small: it guards wrapper name, Rust command
name, argument keys, and uniqueness. It does not replace TypeScript return
types or backend tests.

## Verification Baseline

For foundation code changes, prefer:

```powershell
pnpm.cmd vitest run <focused-test-file>
pnpm.cmd test:run
pnpm.cmd build
rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'
git status --short -- . ":(exclude)notes/**"
```

Recent focused coverage includes:

- Local blog route helpers:
  `local-blog/src/blogRoutes.test.ts`.
- Local blog content helpers:
  `local-blog/src/blogContent.test.ts`.
- Local blog view-model helpers:
  `local-blog/src/blogViewModel.test.ts`.
- Luogu display/task/workflow helpers:
  `src/components/luogu/luoguImportDisplay.test.ts`,
  `src/components/luogu/useLuoguImportWorkflow.test.ts`.
- Rust Luogu problem reader:
  `src-tauri/src/luogu_reader.rs` tests cover problem id/kind normalization,
  reader URLs/source roles, JSON and lentille HTML extraction, and unreadable
  or too-short content handling.
- Rust local search:
  `src-tauri/src/local_search.rs` tests cover safe relative paths, skipped
  generated/hidden entries, frontmatter/tag parsing, problem id detection, OI
  synonym gating, ASCII term boundaries, ranking/current-note boosts,
  heading-aware chunking, and snippet/code truncation.
- Rust blog content:
  `src-tauri/src/blog_content.rs` tests cover blog content/frontmatter/API
  shaping rules extracted from the blog server.
- Tag Manager config rules:
  `src/components/tag-manager/tagManagerConfig.test.ts`, including alias add
  validation and config updates.
- Tag Manager workspace view model:
  `src/components/tag-manager/tagManagerViewModel.test.ts`, including active
  root fallback, alias display, merge target, collection row, and search/sort
  view state.
- API boundary and command contract:
  `src/lib/apiBoundary.test.ts`.
- Settings render guards:
  `src/components/settings/settingsRenderGuards.test.tsx`.
- App preferences and collection/tag presets:
  `src/lib/appPreferences.test.ts`,
  `src/lib/collectionTags.test.ts`.

## Remaining Foundation Work

The main foundation goals are now mostly in place. Good remaining work should
be selective:

- Continue shrinking `App.tsx` only where a rule has a clear owner and focused
  test value.
- Continue shrinking `local-blog/src/App.tsx` by moving remaining stable
  page-section view rules into focused local-blog modules with tests when they
  have stable ownership.
- Treat `src-tauri/src/local_search.rs` as acceptable as-is unless a future
  search change reveals a concrete persistence/scoring/snippet owner gap.
- Treat `src-tauri/src/luogu_reader.rs` as done. Continue changing
  `src-tauri/src/luogu.rs` only for specific non-AI submission/path/write
  helper gaps, and do not touch frozen AI behavior.
- Treat `src-tauri/src/blog_content.rs` as the blog content/API owner. Revisit
  `src-tauri/src/blog_server.rs` only if legacy rendering/static response code
  becomes hard to review or test; do not split it mechanically.
- Consider a future Luogu effect controller only if it can own an end-to-end
  side-effect boundary without hiding important API/toast/confirm ordering.
- Extend API contract metadata only when it improves review value, such as
  grouping commands or documenting high-risk payloads.
- Add smoke tests around critical Settings surfaces when changing settings
  wiring, without touching Settings V2 visual CSS.
- Keep docs synchronized after every architecture phase.

Do not chase line count. The mature architecture target is stable ownership,
testable pure rules, explicit side-effect boundaries, and predictable API
contracts.
