# HANDOFF

This is the current operating handoff for OI Notebook. Keep it synchronized
with `PROJECT.md` and the current architecture docs. Historical plans and old
PRDs belong in `docs/archive/**`.

## Current Direction

The project is in a foundation-first engineering phase. The goal is to make
non-AI infrastructure easier to review, test, and extend before any later AI
assistant upgrade.

AI behavior is frozen. Do not change prompts, providers, model selection, web
search behavior, Tavily/no-key search behavior, `src/components/ai/**`,
`src/lib/aiWebSearch.ts`, or `src-tauri/src/ai.rs` unless the user explicitly
starts AI work.

## Hard Guardrails

- Do not touch `notes/**` unless the user explicitly asks.
- Do not simplify the two-layer path safety checks in
  `src-tauri/src/notes.rs`.
- Frontend-to-Rust command calls go through `src/lib/api.ts`.
- Keep Settings V2 visual structure stable. Do not edit
  `src/components/settings/v2/settingsV2.css` during routine foundation
  cleanup.
- Do not use `git add .`; stage exact paths and check
  `git diff --cached --name-only` before committing.
- Routine status checks should use
  `git status --short -- . ":(exclude)notes/**"`.

## Local Blog Runtime

The runtime local blog is Rust `ProductionBlogServer` plus the bundled
`local-blog` SPA. It is not an Astro dev server.

- `src-tauri/src/lib.rs` owns Tauri commands such as `open_blog` and
  `restart_blog_server`.
- `src-tauri/src/blog_server.rs` owns the HTTP server, routing, static asset
  safety, and response writing.
- `src-tauri/src/blog_content.rs` owns local-blog note scanning, frontmatter
  parsing, note detail loading, and JSON shaping.
- `local-blog/src/blogRoutes.ts` owns hash routes and href builders.
- `local-blog/src/blogContent.ts` owns frontend note/config normalization,
  collection grouping, search, pagination, and date formatting.
- `local-blog/src/blogViewModel.ts` owns ready-to-render local-blog route,
  card, list, archive, search, navigation, diagnostics, and pagination state.

`site/` remains the Astro/public-site direction. Do not reintroduce it as a
runtime dependency for the desktop local blog.

## App Shell Boundary

`src/App.tsx` is still the app shell and composition root. It may own:

- backend API call ordering;
- toasts and confirm dialogs;
- cross-domain orchestration;
- app-level state wiring;
- modal/dialog shell behavior;
- browser/window effects.

It should not regain ownership of stable pure rules such as path rewrite
rules, task labels, disabled-state formulas, status summaries, config
normalization, or reusable formatting helpers. Those rules belong in focused
domain modules with tests.

Do not keep shrinking `App.tsx` for line count alone. Revisit it only when a
specific rule has a clear owner and test value, or when a domain controller can
own an effect end to end without hiding important ordering.

## Current Domain Owners

- Notes workspace: `src/lib/noteWorkspace.ts`.
- App status and shell helpers:
  `src/lib/appStatusLabels.ts`, `src/lib/appShell.ts`.
- App preferences: `src/lib/appPreferences.ts`.
- Collection/tag presets: `src/lib/collectionTags.ts`.
- Blog settings model: `src/lib/blogConfig.ts`.
- Local index task/status view: `src/lib/localIndexStatus.ts`.
- Luogu account/config: `src/lib/luoguConfigForm.ts`.
- Luogu import rules:
  `src/components/settings/pages/luoguImportRules.ts`.
- Luogu import source workflow:
  `src/components/luogu/useLuoguImportWorkflow.ts`.
- Luogu import controller/display:
  `src/components/luogu/useLuoguImportController.ts`,
  `src/components/luogu/luoguImportDisplay.ts`,
  `src/components/luogu/luoguDisplay.ts`.
- Tag taxonomy settings: `src/lib/tagTaxonomySettingsModel.ts`.
- Tag normalization:
  `src/components/tag-manager/tagNormalizationScan.ts`.
- Tag Manager config/rules:
  `src/components/tag-manager/tagManagerConfig.ts`.
- Tag Manager workspace view:
  `src/components/tag-manager/tagManagerViewModel.ts`.
- Settings navigation/search/render guards:
  `src/components/settings/settingsNavigation.ts`,
  `src/components/settings/settingsSearch.ts`,
  `src/components/settings/settingsRenderGuards.ts`.
- API boundary:
  `src/lib/api.ts`, `src/lib/apiContract.ts`,
  `src/lib/apiBoundary.test.ts`.
- Rust blog content/server:
  `src-tauri/src/blog_content.rs`, `src-tauri/src/blog_server.rs`.
- Rust Luogu reader:
  `src-tauri/src/luogu_reader.rs`.
- Rust local search:
  `src-tauri/src/local_search.rs`.

For the longer ownership rationale, see
`docs/architecture/foundation-engineering-rules.md` and
`docs/architecture/non-ai-foundation-audit.md`.

## Long-Task Model

Non-AI long-running flows should use `src/lib/taskStatus.ts` when practical.
The preferred flow is:

```text
raw source state -> TaskState/domain state helper -> domain task view -> UI props
```

Aligned areas include local index rebuild/load state, Luogu scan/prepare/write
state, and tag normalization scan/apply state. Future long-running flows
should not invent new clusters of `isLoading`, `isBusy`, `error`,
`progressText`, and `buttonLabel` when the shared task model can represent the
workflow.

## API Contract Rules

When adding or changing a Rust command wrapper:

1. Add or update the wrapper in `src/lib/api.ts`.
2. Add or update the matching row in `src/lib/apiContract.ts`.
3. Keep wrapper name, Rust command name, and argument keys aligned.
4. Run `pnpm.cmd vitest run src/lib/apiBoundary.test.ts`.
5. Run the API boundary audit:

```powershell
rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'
```

Tauri event/window utilities are not Rust command calls and may remain in
shell or quick-note code when they are local window/event orchestration.

## Verification Baseline

For foundation code changes, prefer:

```powershell
pnpm.cmd vitest run <focused-test-file>
pnpm.cmd test:run
pnpm.cmd build
rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'
git status --short -- . ":(exclude)notes/**"
```

For Rust changes, also run:

```powershell
cd src-tauri
cargo check
cargo test
```

If `cargo test` is blocked by frozen AI test code, report the exact file,
line, and error. Do not fix AI files as part of foundation work.

Recent focused coverage includes:

- `src/lib/apiBoundary.test.ts`
- `src/lib/appShell.test.ts`
- `src/lib/blogConfig.test.ts`
- `src/lib/localIndexStatus.test.ts`
- `src/lib/noteWorkspace.test.ts`
- `src/lib/taskStatus.test.ts`
- `src/components/luogu/*.test.ts`
- `src/components/tag-manager/*.test.ts`
- `local-blog/src/blogRoutes.test.ts`
- `local-blog/src/blogContent.test.ts`
- `local-blog/src/blogViewModel.test.ts`
- Rust tests in `src-tauri/src/blog_content.rs`,
  `src-tauri/src/blog_server.rs`, `src-tauri/src/local_search.rs`, and
  `src-tauri/src/luogu_reader.rs`.

## Remaining Foundation Work

The main foundation goals are mostly in place. Good remaining work should be
selective:

- Treat `src/App.tsx` as acceptable as the app shell/composition root unless a
  specific pure rule or complete effect owner emerges.
- Treat `local-blog/src/App.tsx` as acceptable as the local-blog shell. It
  should keep fetches, browser hash state, document title, debug logging,
  scroll/focus effects, and page composition while consuming domain helpers.
- Treat `src-tauri/src/local_search.rs` as acceptable unless a concrete
  persistence/scoring/snippet owner gap appears.
- Treat `src-tauri/src/luogu_reader.rs` as done. Change `src-tauri/src/luogu.rs`
  only for specific non-AI submission/path/write helper gaps.
- Treat `src-tauri/src/blog_content.rs` as the blog content/API owner. Revisit
  `src-tauri/src/blog_server.rs` only if legacy rendering or static response
  behavior becomes hard to review or test.
- Keep docs synchronized after each architecture milestone.

Do not chase line count. The mature architecture target is stable ownership,
testable pure rules, explicit side-effect boundaries, and predictable API
contracts.
