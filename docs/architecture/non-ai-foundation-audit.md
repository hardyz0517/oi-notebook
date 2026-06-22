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
  - `src-tauri/src/blog_server.rs`: about 1,940 lines after blog content
    extraction.
  - `src-tauri/src/blog_content.rs`: about 870 lines.
  - `src-tauri/src/luogu.rs`: about 2,885 lines after Luogu reader
    extraction.
  - `src-tauri/src/luogu_reader.rs`: about 524 lines.
  - `src-tauri/src/local_search.rs`: about 2,240 lines.
- Recent commits show active foundation work in Rust non-AI code:
  local-search core tests, blog content extraction, Luogu problem reader
  extraction, and local-search ranking/snippet tests.

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

Status: `partially fixed; should fix only if legacy rendering remains a review blocker`.

Evidence:
- `src-tauri/src/blog_content.rs` now owns note scanning, API JSON shaping,
  note detail loading, frontmatter parsing, collection/excerpt rules, and
  focused tests for those content rules.
- `src-tauri/src/blog_server.rs` now primarily owns HTTP routing, path/static
  asset safety, response writing, local-blog/static asset serving, and legacy
  HTML rendering.
- `src-tauri/src/blog_service.rs` owns effective blog config JSON/error
  helpers.
- `blog_server.rs` still has focused tests for route/path/rendering and
  response-shaping helpers.

Assessment:
- The main content/API boundary has been extracted, so this area is no longer
  a clear must-fix.
- The remaining large surface is legacy HTML/Markdown rendering and static
  response handling. It is acceptable to leave this in `blog_server.rs` unless
  a future review finds a specific render rule that is hard to test or reason
  about.

Next actions:
- Do not mechanically split `blog_server.rs` for line count.
- Consider a future renderer module only if it can own legacy rendering
  cleanly with moved tests and no static/path-safety behavior changes.

## Rust Luogu

Status: `partially fixed; should fix selectively`.

Evidence:
- `src-tauri/src/luogu_reader.rs` now owns Luogu problem/solution/discussion
  content reading: reader input/result types, problem id and kind
  normalization, URLs/source roles, permission result shaping, lentille JSON
  extraction, content extraction, HTTP request logic, and focused tests.
- `src-tauri/src/luogu.rs` still owns config, Luogu submission HTTP/JSON
  reading, submission parsing, insight extraction, note markdown preparation,
  note writing, path formatting, command entry, and tests.
- It has a substantial test module covering many parsing, note, config, and
  import helpers.
- It also contains AI-related config and AI-first note preparation logic, so
  the AI freeze boundary must be respected when changing this file.

Assessment:
- The Luogu problem content reader boundary is now clear and test-covered.
- The remaining `luogu.rs` breadth is still real, but much of it is cohesive
  command-side orchestration around config, submissions, preparation, writing,
  and AI-adjacent note generation.
- Further Rust Luogu work should be narrow: submission parsing/path/write
  helpers only when a concrete owner or test gap appears. Do not refactor the
  AI-adjacent preparation path without explicit approval.

Next actions:
- Treat `luogu_reader.rs` as done.
- Revisit `luogu.rs` only for specific non-AI helper gaps, especially
  submission parsing/path/write rules with focused tests.

## Rust Local Search

Status: `fixed for test coverage; acceptable as-is unless a concrete owner gap appears`.

Evidence:
- `src-tauri/src/local_search.rs` owns command entry, index persistence, note
  scanning/frontmatter parsing, query expansion, OI synonym logic, scoring,
  chunking/snippets, diagnostics, ids, and metadata.
- Focused tests now cover safe relative note paths, skipped generated/hidden
  entries, frontmatter/tag parsing, problem id detection, OI synonym gating,
  ASCII term word boundaries, ranking/current-note boosts, heading-aware
  chunking, and snippet/code truncation.

Assessment:
- The original must-fix gap was missing focused tests around high-risk search
  rules. That gap is now closed.
- The file remains large, but its responsibilities are cohesive for a local
  indexing/search service. Splitting it now would mostly move private helpers
  around without a stronger owner or verification benefit.

Next actions:
- Leave `local_search.rs` in place unless a future feature reveals a concrete
  persistence/scoring/snippet boundary that should become a separate owner.
- Keep adding focused tests when changing search behavior.

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
- Documentation is broadly aligned after the Rust foundation updates, but it
  should continue to distinguish fixed areas from intentionally deferred
  follow-ups.

Next actions:
- Update HANDOFF and architecture docs at each milestone boundary, not after
  every tiny helper.

## Priority Order

1. `fixed`: local-search focused tests now protect core search rules.
2. `fixed`: blog note content/API shaping now belongs to `blog_content.rs`.
3. `fixed`: Luogu problem content reader now belongs to `luogu_reader.rs`.
4. `should fix selectively`: App shell rules only where owner and focused test
   value are clear.
5. `acceptable/deferred with reason`: remaining `blog_server.rs` legacy
   rendering/static response code and remaining `luogu.rs` command-side
   orchestration are not current must-fix areas; revisit only with a concrete
   owner or test gap.
6. `mostly acceptable`: local-blog and Tag Manager; revisit only with specific
   evidence.
7. `acceptable`: API boundary; keep auditing.

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
