# Foundation-First Architecture Design, AI Frozen

Date: 2026-06-19

## Decision

Use a foundation-first refactor path while freezing AI behavior. The first implementation phase is to formalize the existing Theme Engine as an app-level boundary without redesigning the recently upgraded Settings UI.

This design treats the current Settings v2 UI as a protected asset. The plan migrates architecture beneath it: theme schema, codec, presets, token resolution, DOM application, and storage become a reusable app foundation. JSX structure, class names, Settings v2 visual CSS, and interaction layout remain stable unless a later task explicitly targets them.

## Current Findings

The repository is clean when checked with:

```powershell
git status --short -- . ":(exclude)notes/**"
```

Recent work has already improved Settings and UI primitives. The current Theme Engine is not absent; it exists as a mature-enough seed under:

- `src/components/settings/v2/theme/settingsThemeTypes.ts`
- `src/components/settings/v2/theme/settingsThemeCodec.ts`
- `src/components/settings/v2/theme/settingsThemePresets.ts`
- `src/components/settings/v2/theme/settingsThemeApply.ts`

That code already defines the `codex-theme-v1:` import/export format, light/dark/system variants, built-in presets, token resolution, semantic colors, font variables, and CSS variable output.

The remaining architectural problem is placement and ownership. Theme domain logic still lives under Settings v2, while `src/App.tsx` still owns theme initialization, legacy localStorage bridging, system theme observation, document root attributes/classes, and CSS variable application. This makes App behave as a hidden theme provider and keeps Settings coupled to global side effects.

## Goals

1. Promote the existing theme code into a real app-level Theme Engine.
2. Keep Settings v2 UI visually and behaviorally stable.
3. Reduce `src/App.tsx` responsibility without a broad App rewrite.
4. Preserve all existing storage keys and `codex-theme-v1:` compatibility.
5. Establish a pattern for later foundation work: Settings registry, App shell decomposition, task/progress model, and non-AI Rust service boundaries.
6. Keep AI implementation, legacy no-key search, `AiSidebar.tsx`, and `src-tauri/src/ai.rs` frozen for now.

## Non-Goals

- Do not redesign Appearance Settings or Settings Center UI.
- Do not rewrite `settingsV2.css`.
- Do not refactor NoteX streaming, AI provider behavior, web search behavior, or `src-tauri/src/ai.rs`.
- Do not remove legacy no-key search yet.
- Do not change `src-tauri/src/notes.rs` path safety.
- Do not touch `notes/**` unless explicitly requested.
- Do not optimize the ref-based patterns in `MarkdownEditor` or `MarkdownPreview`.

## Recommended Approach

Use a migration-with-stable-facade approach.

First, create `src/theme/**` as the app-level owner of theme domain logic. Move or re-export the current Settings theme files into this boundary with minimal semantic changes. Then introduce a provider/hook boundary that owns side effects currently scattered in `App.tsx`.

Settings pages should consume actions and state through props or a hook, but their rendered UI should remain effectively unchanged. This makes the migration primarily architectural, not visual.

## Target Theme Boundary

The first phase should introduce a structure like:

```text
src/theme/
  themeTypes.ts
  themeCodec.ts
  themePresets.ts
  themeResolver.ts
  themeStorage.ts
  themeDom.ts
  ThemeProvider.tsx
  useThemeEngine.ts
  index.ts
```

Responsibilities:

- `themeTypes.ts`: app-level theme types and variant contracts.
- `themeCodec.ts`: decode, encode, normalize, and compatibility handling for `codex-theme-v1:`.
- `themePresets.ts`: built-in presets.
- `themeResolver.ts`: convert theme payloads into CSS variables and resolved token output.
- `themeStorage.ts`: read/write current storage keys, including legacy bridge values.
- `themeDom.ts`: apply and clean up document root dataset, classes, and CSS variables.
- `ThemeProvider.tsx`: own React state, system theme listener, derived active theme, and safe update actions.
- `index.ts`: stable public imports for Settings and App.

The existing files under `src/components/settings/v2/theme/**` can either become compatibility re-exports temporarily or be updated at call sites in one focused pass. The choice should minimize churn and keep review simple.

## Settings UI Protection Rules

During Theme Engine formalization:

1. Keep `AppearanceSettingsPage` JSX structure stable.
2. Keep existing primitive components, CSS classes, and Settings v2 CSS unchanged.
3. Keep `SettingsDialog`, `SettingsCard`, `SegmentedControl`, `SliderControl`, `ColorField`, and related primitives as-is.
4. Do not change copy, labels, grouping, preview layout, or controls unless a bug is discovered.
5. Any import-path-only change must be reviewed separately from behavior changes.
6. Verify Settings manually after each implementation commit.

This is important because the Settings UI has just been upgraded. The next step should preserve that work and move infrastructure beneath it.

## Data Flow

Current simplified flow:

```text
App.tsx
  reads localStorage
  stores theme state
  observes system theme
  derives active settings theme
  applies document classes and CSS variables
  passes props into Settings

AppearanceSettingsPage
  edits SettingsThemeState
  imports/exports codex-theme-v1 payloads
```

Target flow:

```text
ThemeProvider
  reads storage and legacy values
  owns theme state
  observes system theme
  derives resolved theme and active theme
  applies document root attributes/classes/CSS variables
  exposes stable actions

App.tsx
  composes ThemeProvider
  passes theme state/actions to Settings host

AppearanceSettingsPage
  keeps existing UI
  calls theme actions through props or provider-backed callbacks
```

## Error Handling

Theme import and normalization should continue to be forgiving:

- Invalid theme JSON returns a user-facing error.
- Invalid colors are rejected with field-specific errors.
- Missing optional fields fall back to current defaults.
- Storage failures do not prevent Settings Center from opening.
- DOM apply cleanup should remove variables applied by the provider.
- Existing storage keys remain readable and writable to avoid migration loss.

## Testing And Verification

Initial verification should be practical and focused:

1. `pnpm build`
2. Open Settings Center.
3. Switch dark, light, and system modes.
4. Change accent, surface, ink, contrast, font fields, opaque window toggle.
5. Import and export a `codex-theme-v1:` payload.
6. Confirm editor, preview, NoteX surface, and Settings Center still pick up theme variables.
7. Confirm no visible Settings layout regression.

Once test infrastructure is added, add unit tests for:

- Theme normalization.
- `codex-theme-v1:` encode/decode.
- Preset compatibility.
- CSS variable resolver snapshots.
- Legacy storage bridge behavior.

## Later Phases

### Phase 2: Settings Registry And Search

Upgrade Settings navigation from scattered metadata into a page registry with group, label, keywords, visibility, render target, and fallback behavior. Improve search from group-label filtering to group/page/keyword matching. Keep UI layout stable.

### Phase 3: App Shell Decomposition

After ThemeProvider is stable, extract additional non-AI App responsibilities:

- Layout persistence provider.
- Settings host controller.
- Luogu import controller.
- Blog/tag configuration controller.
- Editor document controller, without changing editor ref contracts.

### Phase 4: Long Task Model

Create a shared frontend task model for progress, error, retry, pause, resume, and cancel semantics. Start with Luogu import as the first real consumer. Blog scan and tag normalization can follow. Future AI long-running work can reuse the same model after the AI upgrade begins.

### Phase 5: Non-AI Backend Service Boundaries

Move non-AI Rust code toward thin commands and service modules. Start with command registration organization, Luogu parser/config services, and blog lifecycle. Keep command signatures stable during each extraction.

## Why This Is Mature Architecture

The plan separates responsibilities by volatility and ownership:

- Theme domain logic changes when theme contracts change.
- Storage changes when persistence policy changes.
- DOM application changes when browser/webview integration changes.
- Settings UI changes when the user-facing settings experience changes.
- App composition changes when top-level features are assembled.

Keeping these concerns separate is a standard mature pattern in large React applications: provider or facade boundaries expose a stable contract, domain logic is testable without rendering UI, and UI components consume state/actions rather than owning global side effects.

For Tauri and Rust work, the same idea maps to thin commands, services, domain types, and typed errors. Commands should adapt IPC to services; they should not become the service layer themselves.

## Maintainability Outcomes

After the first phase:

- Theme changes no longer require editing a large section of `App.tsx`.
- Settings UI can evolve without owning app-wide side effects.
- Theme normalization and token resolution can be tested as pure logic.
- Future AI work can depend on a stable theme/settings foundation.
- Review becomes easier because import migration, provider behavior, and UI changes are separate.

## Approval Gate

Implementation should start only after this design is reviewed and approved. The first implementation plan should cover only Theme Engine formalization and its verification checklist.
