# Non-AI Foundation Audit

This audit records the current non-AI architecture state for the
foundation-first upgrade on `codex/theme-engine-formalization`.

The goal is a professional maintainability bar, not endless cleanup. A module
is done when its ownership is clear, key rules are protected by focused tests,
and remaining issues are either acceptable in place or deferred with a reason.

## Audit Method

- Read the goal objective, `AGENTS.md`, `PROJECT.md`, `docs/HANDOFF.md`, and
  `docs/architecture/foundation-engineering-rules.md`.
- Checked the current branch and routine status with
  `git status --short -- . ":(exclude)notes/**"`.
- Used CodeGraph for project structure and owner lookup.
- Used targeted searches for test coverage, Rust command/function layout, and
  frontend API boundary violations.

## Current Evidence

- Branch: `codex/theme-engine-formalization`.
- Routine status excluding `notes/**`: clean at audit start.
- API boundary search outside `src/lib/api.ts`, frozen AI code, and
  `src/lib/aiWebSearch.ts` returned no matches.
- Current file size signals:
  - `src/App.tsx`: about 405 KB.
  - `local-blog/src/App.tsx`: about 44 KB.
  - `local-blog/src/blogViewModel.ts`: about 30 KB.
  - `src-tauri/src/blog_server.rs`: about 88 KB.
  - `src-tauri/src/luogu.rs`: about 107 KB.
  - `src-tauri/src/local_search.rs`: about 66 KB.
- Recent commits show active extraction work in local-blog and App shell:
  local-blog note detail, archive scroll state, diagnostics debug state, and
  App shell activity labels.

## App Shell

Status: `should fix selectively`.

Evidence:
- `src/App.tsx` remains the composition root and owns app-level state, API call
  ordering, toast/confirm behavior, dialog shell behavior, and cross-domain
  wiring.
- Many stable rules already have owners and tests, including
  `src/lib/appShell.ts`, `src/lib/appStatusLabels.ts`,
  `src/lib/noteWorkspace.ts`, `src/lib/blogConfig.ts`,
  `src/lib/localIndexStatus.ts`, `src/lib/luoguConfigForm.ts`,
  `src/lib/appPreferences.ts`, `src/lib/collectionTags.ts`, and
  `src/lib/apiContract.ts`.
- Focused tests exist for the main extracted shell/domain helpers, including
  App shell, status labels, note workspace, blog config, local index status,
  Luogu config form, app preferences, collection tags, task status, and API
  boundary.

Assessment:
- The App shell is large, but size alone is not the failure condition. Its
  remaining work should target only stable, pure, domain-specific rules that
  still sit in App and have focused test value.
- Side-effect ordering, toast/confirm behavior, cross-domain orchestration, and
  modal/dialog wiring may remain in App unless a whole domain controller owns
  the effect end to end.

Next actions:
- Continue only with evidence-backed extractions from App shell.
- Do not extract one-off JSX conditions or effect ordering just to reduce line
  count.

## local-blog

Status: `mostly acceptable as-is; should fix only if a stable page rule remains`.

Evidence:
- `local-blog/src/blogRoutes.ts` owns hash routes, href builders, return
  targets, and return labels.
- `local-blog/src/blogContent.ts` owns frontmatter parsing, note
  normalization, collection grouping, search, pagination, date formatting, and
  config defaults.
- `local-blog/src/blogViewModel.ts` owns most ready-to-render route, list,
  card, navigation, archive, search, note detail, diagnostics, and pagination
  view data.
- `local-blog/src/App.tsx` now imports many `build*View` helpers and mainly
  handles fetches, browser hash state, document title, local debug logging,
  scroll/focus effects, and page composition.
- Focused tests exist in `blogRoutes.test.ts`, `blogContent.test.ts`, and a
  broad `blogViewModel.test.ts` with static guards for App wiring.

Assessment:
- The local-blog boundary is close to the intended professional state. The App
  still contains page components, browser effects, and fetches, which are
  acceptable shell responsibilities.
- Further extraction should happen only if a remaining page-section rule is
  stable, reused, or risky enough to test.

Next actions:
- Treat local-blog as near complete.
- Avoid repeated polishing of small render branches unless a clear owner and
  test case appear.

## Luogu Frontend Workflow

Status: `acceptable core boundary; should fix selectively`.

Evidence:
- `src/components/luogu/useLuoguImportWorkflow.ts` owns import source state:
  selected ids, skipped ids, prepared notes, prepare/write state, active
  preview, edited markdown ids, review selection, and reset helpers.
- `src/components/luogu/useLuoguImportController.ts` derives candidate,
  selection, preview, and review controller state.
- `src/components/luogu/luoguImportDisplay.ts` owns task/view state, selection
  plans, scan summaries, prepare/write progress, and display helpers.
- Focused tests exist for Luogu display/task/workflow helpers.

Assessment:
- The frontend Luogu workflow has meaningful owners. Remaining work should not
  re-home the entire workflow.
- The main risk is whether long side-effect sequences in App can be reasoned
  about. A controller is useful only if it owns an end-to-end effect without
  hiding API, toast, confirm, pause, or cancellation ordering.

Next actions:
- Audit Luogu App-side scan/prepare/write handlers before extracting anything.
- Prefer small state/view helper improvements over a broad controller rewrite.

## Tag Manager

Status: `mostly acceptable as-is; should fix if component rules reappear`.

Evidence:
- `src/components/tag-manager/tagManagerConfig.ts` owns config
  normalization, custom tag create/edit/delete rules, alias validation, merge
  rule updates, collection candidates, filtered root/suggestion helpers, and
  debug labels.
- `src/components/tag-manager/tagManagerViewModel.ts` owns filtered
  suggestions/root groups, active root fallback, alias display state, merge
  preview/candidates, collection rows, sort disabled state, and search results.
- `src/components/tag-manager/tagManagerOrdering.ts` owns ordering rules.
- Focused tests exist for config, view model, ordering, and normalization scan.

Assessment:
- Tag Manager has strong domain ownership and test coverage.
- Further work should be limited to any complex rule still assembled in the
  component layer; do not move straightforward rendering or event binding.

Next actions:
- Only inspect Tag Manager again if a specific component-level complex rule is
  found during App or Settings wiring work.

## Rust Blog Server

Status: `should fix`.

Evidence:
- `src-tauri/src/blog_server.rs` still combines request routing, API JSON,
  notes scanning, path resolution/safety, frontmatter parsing, markdown and
  legacy HTML rendering, static assets, response writing, and tests in one
  large file.
- `src-tauri/src/blog_service.rs` exists but currently owns only effective blog
  config JSON/error helpers.
- `blog_server.rs` does have focused tests for many path, parsing, rendering,
  and response-shaping helpers.

Assessment:
- The file is not untested, but the ownership boundary is still too broad.
- The right upgrade is not a mechanical split into many files. Prefer one or
  two high-cohesion moves such as blog note content/API shaping or legacy
  markdown rendering, with existing tests moved or expanded.

Next actions:
- Choose the most cohesive and lowest-risk extraction from `blog_server.rs`.
- Preserve HTTP route behavior and static asset/path safety behavior.

## Rust Luogu

Status: `should fix selectively`.

Evidence:
- `src-tauri/src/luogu.rs` combines config, Luogu HTTP/JSON reading,
  problem/submission parsing, insight extraction, note markdown preparation,
  note writing, path formatting, command entry, and tests.
- It has a substantial test module covering many parsing, note, config, and
  import helpers.
- It also contains AI-related config and AI-first note preparation logic, so
  the AI freeze boundary must be respected when changing this file.

Assessment:
- The module has test coverage and recognizable sections, but its non-AI
  service boundary is still broad.
- Work should favor cohesive non-AI helper extraction or clearer section
  ownership around parsing, raw note preparation/write, or path formatting.
- Avoid changing AI behavior or provider/prompt/search behavior while touching
  this file.

Next actions:
- Start with non-AI parsing/path/note-preparation helpers that already have
  tests or can get focused tests.
- Do not rewrite the Luogu system end to end.

## Rust Local Search

Status: `must fix`.

Evidence:
- `src-tauri/src/local_search.rs` owns command entry, index persistence, note
  scanning/frontmatter parsing, query expansion, OI synonym logic, scoring,
  chunking/snippets, diagnostics, ids, and metadata.
- Targeted search found no `mod tests` or `#[test]` entries in this file.
- The file contains high-risk search behavior and many pure helpers that are
  suitable for focused Rust tests.

Assessment:
- This is the clearest remaining foundation gap: large, high-impact local
  search logic lacks local focused tests in the owning module.
- Before broad structural extraction, add focused tests around stable pure
  rules such as note path normalization, frontmatter parsing, query token
  expansion, problem id detection, chunking, snippet behavior, or diagnostics.

Next actions:
- First Rust implementation slice should add local-search tests without
  changing behavior.
- After tests exist, consider a small cohesive extraction only if it improves
  reviewability.

## API Boundary

Status: `acceptable as-is`.

Evidence:
- `src/lib/api.ts` remains the normal frontend Rust command boundary.
- `src/lib/apiContract.ts` records wrapper/command metadata.
- `src/lib/apiBoundary.test.ts` verifies direct-invoke isolation and contract
  consistency.
- Targeted API boundary search returned no direct invoke/core imports outside
  allowed files.

Assessment:
- No current boundary fix is required.
- Continue to update `api.ts` and `apiContract.ts` together when wrappers
  change.

Next actions:
- Keep running the API boundary audit after frontend code changes.

## Docs

Status: `should keep synchronized`.

Evidence:
- `docs/HANDOFF.md` and
  `docs/architecture/foundation-engineering-rules.md` already document the
  foundation-first rules and current domain owners.
- This audit adds a current-state triage artifact for the long-running goal.

Assessment:
- Documentation is broadly aligned, but it should not imply all foundation work
  is done while Rust blog server, Rust Luogu, and Rust local search remain
  active follow-up areas.

Next actions:
- Update HANDOFF and architecture docs at each milestone boundary, not after
  every tiny helper.

## Priority Order

1. `must fix`: add focused tests to `src-tauri/src/local_search.rs`.
2. `should fix`: extract one cohesive Rust blog server boundary with tests.
3. `should fix`: selectively improve Rust Luogu non-AI helper boundaries.
4. `should fix selectively`: App shell rules only where owner and focused test
   value are clear.
5. `mostly acceptable`: local-blog and Tag Manager; revisit only with specific
   evidence.
6. `acceptable`: API boundary; keep auditing.

## Stop Rule For This Goal

The goal should be considered complete only after a final audit confirms:

- The priority list above is resolved, reclassified as acceptable, or deferred
  with a concrete reason.
- All code changes have focused tests or documented existing coverage.
- Frontend API boundary remains clean.
- Docs match the final architecture.
- Remaining work is not an unexamined unknown area and does not require
  continuing just for line count, naming polish, or small render-condition
  cleanup.
