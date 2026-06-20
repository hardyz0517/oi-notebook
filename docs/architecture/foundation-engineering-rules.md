# Foundation Engineering Rules

This document records the engineering rules that emerged during the
foundation-first upgrade. It is a working contract for future non-AI
architecture work: preserve product behavior, keep the upgraded Settings UI
stable, and move rules into small, testable modules instead of growing
`App.tsx`.

## Purpose

The foundation phase exists to make later AI work safer. It should reduce
coupling in notes, Luogu import, local index, blog, settings, tag taxonomy,
and other non-AI systems while the AI surface remains frozen.

Good foundation work is not measured by line-count reduction alone. It is
measured by whether each rule has a clear owner, whether UI components consume
stable view state, and whether pure behavior can be tested without rendering
the app.

## Global Guardrails

- Keep AI frozen. Do not change prompts, provider behavior, model selection,
  web search behavior, `src/components/ai/AiSidebar.tsx`,
  `src/lib/aiWebSearch.ts`, or `src-tauri/src/ai.rs`.
- Protect the recently upgraded Settings UI. Do not refactor visual structure
  or edit `src/components/settings/v2/settingsV2.css` during foundation
  cleanup.
- Do not touch `notes/**` during routine engineering work.
- Do not simplify the two-layer path safety checks in `src-tauri/src/notes.rs`.
- Frontend-to-Rust calls must go through `src/lib/api.ts`.
- Prefer small, behavior-preserving commits with focused tests.

## App Shell Boundary

`src/App.tsx` should act as the composition root and application shell. It may
own cross-module orchestration, app-level React state, event wiring, toasts,
confirm dialogs, and backend call ordering.

`App.tsx` should not be the permanent home for:

- path rewrite rules;
- note workspace cleanup rules;
- button labels and disabled-state formulas;
- long-running task status labels;
- domain-specific status badges;
- import/export normalization rules;
- storage codecs and default-value normalization;
- reusable formatting helpers.

When a block of code is pure, domain-specific, and testable, move it behind a
domain helper. `App.tsx` should pass source state into that helper and consume
the resulting plan, state, or view model.

## State And View Model Pattern

For UI-facing derived state, use this flow:

```text
raw source state -> domain state helper -> domain view helper -> component props
```

Examples already following this pattern:

- Luogu scan/prepare/write source state and import center view state in
  `src/components/luogu/luoguImportDisplay.ts`.
- Luogu account settings button state in `src/lib/luoguConfigForm.ts`.
- Tag normalization scan/apply task and panel state in
  `src/components/tag-manager/tagNormalizationScan.ts`.
- Local index task view state in `src/lib/localIndexStatus.ts`.
- Tag taxonomy settings state in `src/lib/tagTaxonomySettingsModel.ts`.

Components should receive ready-to-render view state when a rule is shared or
non-trivial. JSX may still contain simple one-off conditions, but it should not
assemble the same multi-boolean rule in multiple places.

## Long-Task Model

Non-AI long-running work should use `src/lib/taskStatus.ts` when the shared
model fits. The preferred shape is:

```text
TaskState -> deriveTaskView or domain-specific task view -> UI
```

Use task state for workflows that need status, progress, error, retry, cancel,
pause, resume, or completion labels. Avoid growing independent clusters such
as `isLoading`, `isBusy`, `isRunning`, `error`, `progressText`, and
`buttonLabel` when a task view can represent them.

Domain modules may add wrappers around `deriveTaskView` for local vocabulary
and disabled-state rules. This keeps `TaskState` generic while preserving
domain-specific labels and UI behavior.

## Domain Module Ownership

Use domain modules as the home for stable rules:

- `src/lib/noteWorkspace.ts`: note path plans, dialog reset state, tree
  selection, inline create state, deleted/renamed workspace reference updates.
- `src/components/luogu/luoguImportDisplay.ts`: Luogu import task states,
  import center view state, scan summaries, prepare/write progress, selection
  plans, and display-only import rules.
- `src/components/settings/pages/luoguImportRules.ts`: Luogu import rule
  schema, storage normalization, rule rows, and safe save-directory rules.
- `src/components/tag-manager/tagNormalizationScan.ts`: tag normalization
  scan/apply task state, stats, panel state, and selection summaries.
- `src/lib/localIndexStatus.ts`: local index status labels, task view state,
  rebuild messages, details view state, and size/date/access formatting.
- `src/lib/blogConfig.ts`: blog identity defaults, loaded config fallback,
  draft normalization, save validation, and Blog settings view state such as
  field disabled state, button labels, and Blog operation entry state.
- `src/lib/luoguConfigForm.ts`: Luogu account form state, save payload
  validation, AI-configured detection, and Luogu account settings view state.
- `src/lib/tagTaxonomySettingsModel.ts`: tag taxonomy statistics, visible
  entry/alias lists, status tone, and settings action disabled/spinner state.
- `src/lib/appStatusLabels.ts`: status bar and settings status labels.
- `src/lib/api.ts`: the only frontend boundary for Rust command invocation.
- `src/components/settings/settingsRenderGuards.ts`: settings group/page render
  guards used by the Settings shell.

Future work should continue this pattern for remaining Tag Manager details,
Luogu import edge cases, and other non-AI areas only when the extracted rule
has a stable owner and focused test value.

## Blog Domain Boundary

Blog configuration rules are owned by `src/lib/blogConfig.ts`. This includes
`DEFAULT_BLOG_CONFIG`, `normalizeBlogConfigDraft`, `resolveBlogConfigDraft`,
`buildBlogConfigSaveDraft`, and `deriveBlogSettingsView`.

The Blog settings page should consume `BlogSettingsView` instead of assembling
loading, saving, restarting, disabled-state, or button-label formulas in JSX.
This keeps Settings visual components stable and lets Blog UI behavior be
tested without rendering the Settings center.

`src/App.tsx` remains the correct owner for Blog side effects and app-shell
orchestration: calling `getBlogConfig`, `saveBlogConfig`, `openBlog`, and
`restartBlogServer`; preserving toast behavior; and maintaining try/catch and
state update order. Do not move those API calls into `blogConfig.ts`.

When extending Blog behavior, first decide whether the change is:

- a pure config/view rule, which belongs in `src/lib/blogConfig.ts` with
  focused tests;
- an app-shell side effect, which may stay in `src/App.tsx` or move into a
  dedicated controller only if the whole effect has a clear owner;
- a visual Settings change, which should be handled separately from foundation
  cleanup and must preserve the Settings V2 visual contract.

## Side Effects

Pure helpers should not call APIs, show toasts, open confirm dialogs, or mutate
global state. They should accept inputs and return values.

Side effects belong in one of these places:

- `App.tsx`, when the effect coordinates multiple domains or controls app
  shell behavior;
- a dedicated controller or hook, when one domain owns the effect end to end;
- `src/lib/api.ts`, when crossing the frontend/Rust boundary.

Do not move side effects just to reduce `App.tsx` line count. Move them when
there is a clear ownership boundary and the resulting controller can be tested
or reasoned about independently.

## API Boundary Contract

Rust command invocation is centralized in `src/lib/api.ts`. Frontend modules
should import typed wrapper functions from that file instead of importing
`@tauri-apps/api/core` or calling `invoke` directly.

`src/lib/apiBoundary.test.ts` enforces this contract for non-AI source files.
The test intentionally allows existing frozen AI boundary files and test files,
but ordinary app, settings, notes, Luogu, blog, local index, and tag taxonomy
code should not bypass `src/lib/api.ts`.

Tauri event/window utilities are not Rust command calls and may remain in shell
or quick-note code when they are part of local window/event orchestration.

## Testing Rules

Every extracted pure rule should get focused tests when it handles:

- path or filename decisions;
- task status transitions;
- disabled-state or label decisions used in more than one place;
- import/export normalization;
- selection plans;
- destructive or difficult-to-recover workflows.

Preferred verification for foundation slices:

```powershell
pnpm.cmd vitest run <focused-test-file>
pnpm.cmd test:run
pnpm.cmd build
rg -n 'invoke\(|@tauri-apps/api/core|from "@tauri-apps/api' src --glob '!lib/api.ts' --glob '!components/ai/**' --glob '!lib/aiWebSearch.ts'
git status --short -- . ":(exclude)notes/**"
```

In PowerShell, a narrower audit that avoids quote parsing issues is:

```powershell
rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'
```

For small documentation-only changes, focused tests and build may be skipped,
but the final report should say that no runtime verification was needed.

## When Not To Extract

Do not extract code when the result would be a new abstraction with no stable
owner. Leave code in place when:

- it is a one-off JSX condition;
- it depends heavily on local React state and has no reuse or test value;
- moving it would hide important side-effect ordering;
- the change would touch frozen AI files;
- the change would risk Settings visual regressions;
- the only benefit is making `App.tsx` shorter.

Foundation work should make future changes easier to review, not harder to
trace.

## Checklist For Future Foundation Changes

Before changing code, classify the work:

- Is this a pure rule, state derivation, side effect, or visual component?
- Does this belong to notes, Luogu, tag taxonomy, local index, blog, settings,
  app shell, or API boundary?
- Can the new behavior be covered with a focused test?
- Does the change touch the AI freeze boundary?
- Does it alter Settings visual UI?
- Does it introduce a direct frontend `invoke` outside `src/lib/api.ts`?
- Does it touch `notes/**`?

After changing code, verify:

- focused tests for the changed helper;
- full tests and build for code changes;
- API boundary audit when frontend code changed;
- exact staging paths, never `git add .`;
- no unrelated user changes reverted.
