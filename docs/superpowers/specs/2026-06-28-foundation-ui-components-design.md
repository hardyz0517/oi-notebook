# Foundation UI Components Upgrade Design

Date: 2026-06-28

Branch: `codex/foundation-ui-components`

Worktree: `D:\Dev\Projects\oi-notebook\.worktrees\foundation-ui-components`

## Background

OI Notebook already has a useful UI foundation in `src/components/ui`, including
`Button`, `Card`, `Dialog`, `SegmentedControl`, `SettingRow`, `IconButton`, and
related primitives. Settings v2 has the most mature semantic layer on top of
that foundation through `SettingsCard`, `SettingRow`, `SettingsDialog`,
`SettingsButton`, `SelectPill`, and related controls.

The current gap is not that reusable components are missing entirely. The gap is
that the reusable semantics are uneven across the application. Settings v2 is
coherent, while other areas still assemble buttons, cards, dialogs, panels,
toolbars, and tab-like controls with local class strings and feature-specific
patterns.

This upgrade should make the component semantics explicit and reusable across
the app without redesigning the product from scratch.

## Goals

- Establish clear, reusable semantics for `Button`, `Card` or panel surfaces,
  `Tabs`, and `Dialog`.
- Keep `src/components/ui` focused on business-neutral UI primitives.
- Add or refine `src/components/common` patterns for app-level repeated UI such
  as confirmation dialogs, panels, section headers, action bars, and empty
  states.
- Preserve feature-level primitives where they carry real domain meaning,
  especially Settings v2.
- Migrate high-traffic application areas so new UI no longer invents local
  button sizes, panel shells, dialog footers, or tab triggers by default.
- Use Settings v2 as the visual quality reference while protecting its current
  density, hierarchy, theme behavior, and dialog feel.
- Include AI shell controls in the visual unification while avoiding AI message,
  streaming, markdown rendering, citation, cache, and research-engine hot paths.

## Non-Goals

- Do not redesign Settings v2. It may receive small control-level consistency
  improvements, but its overall layout, density, hierarchy, theme editor, and
  dialog feel should remain stable.
- Do not rewrite `MarkdownEditor` or `MarkdownPreview`, and do not change their
  ref-based patterns.
- Do not touch AI message rendering, virtual list behavior, streaming state,
  markdown cache, citation decoration, or research-engine logic.
- Do not turn Settings-specific primitives into global components directly.
  Extract shared ideas downward into `ui` or `common` instead.
- Do not use this branch as a broad product redesign or marketing-style visual
  refresh.

## Component Layers

### `src/components/ui`

This layer contains business-neutral primitives. Components in this layer should
not know about Settings, AI, tags, notes, Luogu, or any other feature area.

Expected responsibilities:

- Structural and interactive semantics.
- `variant`, `size`, `data-slot`, disabled, loading, focus, and accessibility
  behavior.
- Token-based styling for radius, borders, surfaces, focus rings, motion, and
  density.

Candidate components in this layer:

- `Button`
- `IconButton`
- `ToolbarButton`
- `Card`
- `Dialog`
- `Tabs`
- `SegmentedControl`
- `Input`, `Textarea`, `Select`, `Switch`, `Checkbox`, `Slider`
- `SettingRow` as a neutral row layout primitive

### `src/components/common`

This layer contains application-level patterns that are reused across features
but still express OI Notebook product conventions.

Candidate components or refinements:

- `AppDialog`
- `ConfirmDialog`
- `Panel` or `Surface`
- `SectionHeader`
- `ActionBar`
- `EmptyState`
- Shared picker or footer patterns where useful

This layer should reduce repeated feature-local class composition without
absorbing feature-specific behavior.

### Feature Primitives

Feature primitives remain valid when they encode local meaning or preserve a
specific density. Settings v2 should keep its primitives:

- `SettingsCard`
- `SettingRow`
- `SettingsDialog`
- `SettingsButton`
- `SelectPill`
- Settings-specific fields and theme controls

Other feature areas may also have thin wrappers, but they should delegate to
`ui` or `common` instead of defining a parallel visual system.

## Core Component Semantics

### Button

`Button` should remain the source of truth for action controls.

The design should keep and refine:

- `variant` for action intent: for example `primary`, `default`, `subtle`,
  `ghost`, `danger`, `destructive`, and `link`.
- `size` for spatial density: for example `xs`, `sm`, `md`, `lg`, `compact`,
  `icon`, `icon-xs`, `icon-sm`, and `icon-lg`.
- `loading`, `disabled`, `asChild`, `data-slot`, `data-variant`, and
  `data-size`.

Feature components should stop encoding common button geometry with ad hoc
classes such as fixed heights, padding, and text sizes when an existing size
or variant can express the intent.

### Card, Panel, and Surface

`Card` should remain a low-level bordered surface primitive. It is too broad to
carry every application container meaning by itself.

The upgrade should introduce or clarify a common `Panel` or `Surface` pattern
for feature containers such as:

- Settings sections
- Tag Manager columns
- AI sidebar blocks
- Search diagnostics groups
- File or note management panels

This avoids forcing every container to behave like a card and gives repeated
headers, actions, empty states, and content spacing a shared home.

### Tabs

The app needs a first-class tabs primitive.

Add `src/components/ui/tabs.tsx` with accessible semantics such as:

- `Tabs`
- `TabsList`
- `TabsTrigger`
- `TabsContent`

Radix Tabs is acceptable if it fits the existing dependency style. A small
custom implementation is acceptable only if it preserves correct keyboard and
ARIA semantics.

Important distinction:

- `Tabs` are for switching content panels.
- `OpenTabsBar` is a document tab strip for open notes. It should not be forced
  into content-tab semantics, though it may reuse lower-level tab button tokens
  or shared button styling.

### Dialog

`src/components/ui/dialog.tsx` should stay as the Radix-based primitive layer.

Add or refine application-level dialog patterns in `common`:

- `AppDialog` for consistent title, description, body, footer, close behavior,
  width, and z-index expectations.
- `ConfirmDialog` as the standard destructive or confirm/cancel workflow.

Settings v2 may internally reuse common dialog behavior where that is low risk,
but it should keep its settings-specific classes and visual density.

## Migration Strategy

### Phase 1: Foundation

- Add or refine `Tabs`.
- Clarify `Button`, `Card`, `Dialog`, and `SettingRow` semantics.
- Add `Panel` or `Surface` and any small common patterns needed for migration.
- Update exports in `src/components/ui/index.ts` where appropriate.

This phase should avoid broad page layout changes.

### Phase 2: Low-Risk Shared UI

Migrate components with clear boundaries first:

- `ConfirmDialog`
- `TagPickerDialog`
- Shared picker/dialog footers
- Editor toolbar buttons where they do not touch editor internals
- Small utility panels and empty states

This phase validates whether the new APIs are pleasant before larger sweeps.

### Phase 3: Feature Sweep

Migrate feature areas where repeated local class patterns are visible:

- Tag Manager shell, columns, detail panels, and collection panels
- File Tree shell and action surfaces
- Open tabs presentation, without changing document tab behavior
- Search diagnostics panels
- Luogu and blog settings legacy surfaces where they are outside protected
  Settings v2 behavior

The target is fewer local button, panel, dialog, and tab-like class recipes.

### Phase 4: AI Shell Integration

Include AI UI only at the shell level:

- Top bar and toolbar buttons
- Panel containers
- Dialogs and confirmations
- Empty or diagnostic shell states
- Entry points that benefit from shared action, panel, or dialog semantics

Do not change:

- Message rendering
- Virtual list behavior
- Streaming state
- Markdown rendering or cache
- Citation decoration
- Research Engine logic

Because another worktree is upgrading AI functionality, AI-facing changes in
this branch should be isolated and easy to cherry-pick or drop during merge
conflict resolution.

## Settings v2 Protection Strategy

Settings v2 is the reference implementation for the desired product feel.

Allowed changes:

- Replace internals with shared primitives when the rendered result stays stable.
- Normalize button or dialog APIs where the visual effect remains close.
- Keep using settings-specific wrappers to lock density and hierarchy.

Not allowed:

- Large layout changes.
- Different section rhythm or row density.
- Theme editor behavior changes.
- Dialog width, footer, or close-button changes that noticeably alter the
  Settings v2 feel.

Any implementation that changes Settings v2 primitives should include visual
review of Settings pages before and after the change.

## AI Worktree Coordination

The AI area is in active parallel development elsewhere. This branch should
minimize conflict by treating AI as a consumer of shared UI APIs rather than as
the main place to develop those APIs.

Rules:

- Prefer changing shared `ui` and `common` components first.
- Touch AI files only for shell-level component usage.
- Keep AI shell changes in a separate commit if possible.
- Avoid edits around message rendering, markdown, citations, streaming,
  virtualization, and research execution.
- During merge, prefer the AI feature branch for AI behavior and reapply shared
  component usage afterward if needed.

## Validation Plan

Required static validation:

- `pnpm.cmd tsc --noEmit`
- `pnpm.cmd build`

Visual or runtime smoke targets:

- Settings v2, especially Appearance and dialog flows.
- Tag Manager shell and detail flows.
- Main editor layout and toolbar.
- File Tree actions.
- Open note tabs.
- AI Sidebar shell controls, without testing AI feature internals as part of
  this branch.

When Settings v2 primitives are touched, capture or inspect before and after
screens to confirm that density, hierarchy, and dialog feel remain stable.

## Acceptance Criteria

- Developers can tell when to use `ui`, `common`, or feature primitives.
- `Button`, `Card` or `Panel`, `Tabs`, and `Dialog` have clear semantic roles.
- New UI no longer needs ad hoc class recipes for common button sizes, dialog
  footers, panel shells, section headers, or tab triggers.
- Settings v2 remains visually stable aside from approved small control-level
  consistency changes.
- AI shell controls can use shared UI without disrupting active AI feature work.
- Typecheck, production build, and targeted visual smoke pass.

## Implementation Planning Entry

After this design is reviewed, create an implementation plan that starts with
the isolated worktree at:

`D:\Dev\Projects\oi-notebook\.worktrees\foundation-ui-components`

Recommended implementation order:

1. Foundation components and exports.
2. Low-risk common dialogs and controls.
3. Feature sweeps outside AI.
4. AI shell-only migration in a separate commit.
5. Full verification and visual review.
