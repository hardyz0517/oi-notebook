# OI Notebook Foundation Engineering Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn OI Notebook from a vibecoding-shaped application into a maintainable, testable, domain-oriented codebase that can safely host the later full AI assistant upgrade.

**Architecture:** Keep the current product behavior stable while extracting pure domain logic, storage helpers, controllers, and service boundaries out of `src/App.tsx`. AI behavior remains frozen during this plan; foundation modules should make the later AI rebuild easier without changing the current assistant, settings UI, or note path safety model.

**Tech Stack:** React + TypeScript + Vite frontend, Tauri/Rust backend, `src/lib/api.ts` as the frontend-to-Rust boundary, CodeGraph for structural inspection, `pnpm.cmd build` for the default frontend verification, focused Rust tests for backend services.

---

## Current Status

The plan starts from branch `codex/theme-engine-formalization`.

Already completed foundation commits:

- `82c95b4 refactor(theme): promote theme domain boundary`
- `3d80fe9 refactor(theme): add storage and dom helpers`
- `8c71606 fix(theme): align legacy settings storage keys`
- `5543e8a refactor(theme): add theme provider facade`
- `835c783 refactor(theme): route app theme through provider`
- `337296b refactor(settings): import appearance theme from app boundary`
- `9224f09 refactor(settings): extract window geometry helpers`
- `a90c6da refactor(settings): extract navigation model`
- `87fd1c9 refactor(luogu): extract import rules helpers`
- `6bd23f6 refactor(luogu): extract import candidate domain`
- `6cdb451 refactor(search): extract local result helpers`
- `2441517 refactor(markdown): extract document helpers`
- `e332fc9 test: add vitest runner`
- `e21071f test(markdown): cover document helpers`
- `abe1fc5 docs: record rust service boundary audit`
- `466b473 refactor(tasks): add rust task status model`
- `fa58082 refactor(blog): extract config service helpers`
- `580622b test: add frontend helper test config`
- `aad74ed refactor(tags): extract normalization scan helpers`
- `fe5cd39 test(tags): cover normalization scan helpers`
- `1fd87d0 refactor(luogu): introduce import controller`
- `21b8406 test(luogu): cover candidate reasons`
- `98c146d refactor(notes): extract path helpers`
- `40ce378 test(markdown): cover renderer plugins`
- `c4ba3fb refactor(markdown): share table merge plugin`
- `3fbc969 refactor(editor): extract preview scroll sync hook`
- `eac409a refactor(tabs): extract open tab helpers`
- `ad29e61 refactor(search): extract local note search controller`
- `8fbe5e9 refactor(tabs): extract open tabs controller`
- `230f92c refactor(tags): extract collection candidates hook`
- `14da101 refactor(notes): extract notes list controller`
- `52752f8 refactor(notes): extract display note files hook`
- `7ff4be0 refactor(notes): extract note workspace helpers`
- `05681cc refactor(notes): centralize note creation rules`
- `0dd51b8 refactor(blog): extract config draft normalization`
- `db2703d refactor(editor): extract cursor context helper`
- `1781efe refactor(preview): extract sync timing rules`
- `5b99f44 refactor(app): extract status label helpers`
- `c6f09fd refactor(luogu): extract difficulty display model`
- `c6de2e3 refactor(tags): extract user taxonomy helpers`
- `372c985 refactor(notes): extract path reference helpers`
- `f1cf297 refactor(app): extract activity shell helpers`
- `0000d62 refactor(tasks): add task state helpers`
- `de7c460 refactor(api): extract error normalization`
- `cdb9764 docs: sync foundation upgrade status`
- `de27b0b refactor(luogu): extract import display labels`
- `996e442 refactor(tasks): align luogu write progress model`
- `c150024 refactor(tags): extract taxonomy settings model`
- `f83c4ca refactor(search): extract local index status model`
- `1a4a01c refactor(luogu): extract rule settings model`
- `10df1a4 refactor(search): drive local index with task state`
- `2ddd238 refactor(blog): centralize config draft rules`
- `983a0ee refactor(notes): centralize workspace path rewrites`
- `440e880 refactor(luogu): centralize rule update patches`
- `d7ed2ae refactor(luogu): derive scan task state`
- `b23b861 refactor(luogu): consume scan task state`
- `6271332 refactor(notes): centralize deleted workspace cleanup`
- `b4a149f refactor(notes): centralize tree selection state`
- `04e6832 refactor(tags): centralize taxonomy export payload`
- `64a5b12 refactor(tags): centralize taxonomy config updates`
- `2e2f115 refactor(luogu): centralize config form rules`
- `6bbca95 refactor(tasks): add task transition helpers`

Progress calibration, 2026-06-20:

- Completed from this plan: app preference helpers, collection/tag helpers, local index display/status/task-state helpers, blog config draft rules, note workspace path rewrite/deleted-cleanup/tree-selection helpers, tag taxonomy export payload helpers, settings render guards, settings registry/search helpers, Luogu import controller/rule settings model/update patch helpers/scan task-state bridge/UI consumption, markdown document helpers and tests, shared frontend/Rust task status models, Rust blog service helpers, foundation release checklist, AI freeze boundary, and AI upgrade entry criteria.
- Newly added during continued execution: `src/lib/noteWorkspace.ts`, `src/lib/blogConfig.ts`, `src/lib/editorContext.ts`, `src/lib/previewSyncTiming.ts`, `src/lib/appStatusLabels.ts`, `src/lib/luoguDifficulty.ts`, `src/lib/tagTaxonomyUserConfig.ts`, `src/lib/appAsync.ts`, `src/lib/appShell.ts`, `src/lib/apiError.ts`, `src/components/luogu/luoguImportDisplay.ts`, and `src/lib/tagTaxonomySettingsModel.ts`, each with focused tests where pure logic is present. Existing `src/components/settings/pages/luoguImportRules.ts` now also owns the Luogu rule settings row model.
- Remaining foundation focus: further `App.tsx` shell decomposition, broader task-controller adoption of `src/lib/taskStatus.ts` beyond Luogu scan/write progress and local index status/load/rebuild state, more note workspace side-effect cleanup where it can stay pure, tag manager config helper consolidation where behavior can be preserved, blog frontend controller helpers if useful, safer Luogu/task-controller consolidation, continued API boundary audits, and documentation/handoff sync. Latest verified slices centralized file-tree selection state in `src/lib/noteWorkspace.ts`, tag taxonomy export JSON/file-name rules and entry/alias add-delete update rules in `src/lib/tagTaxonomyUserConfig.ts`, Luogu config form load/save payload rules in `src/lib/luoguConfigForm.ts`, and queued/paused/resumed/stopping transition helpers in `src/lib/taskStatus.ts`; `pnpm.cmd test:run`, `pnpm.cmd build`, and the frontend API boundary audit passed afterward.
- Still frozen: `src/components/ai/AiSidebar.tsx`, `src/lib/aiWebSearch.ts`, `src-tauri/src/ai.rs`, prompts, model/provider behavior, and web search behavior.

Hard guardrails for every task:

- Keep AI frozen unless this plan explicitly marks a task as AI-unlocked.
- Do not edit `src/components/ai/AiSidebar.tsx`, `src/lib/aiWebSearch.ts`, `src-tauri/src/ai.rs`, or AI prompt behavior during foundation work.
- Do not edit `src/components/settings/v2/settingsV2.css` unless the task is a dedicated Settings UI visual QA task approved by the user.
- Do not touch `notes/**`.
- Do not simplify the two-layer path safety check in `src-tauri/src/notes.rs`.
- Do not change the ref-based patterns in `src/components/editor/MarkdownEditor.tsx` or `src/components/editor/MarkdownPreview.tsx`.
- Frontend-to-Rust calls continue through `src/lib/api.ts`.
- Use exact `git add -- <paths>` only; never use `git add .`.
- Before each commit, run `git diff --cached --name-only`.

Default verification for frontend-only refactors:

```powershell
git status --short -- . ":(exclude)notes/**"
pnpm.cmd build
git diff --cached --name-only
```

Manual smoke after Settings-adjacent changes:

- Open Settings Center.
- Open Appearance -> Theme.
- Switch light/dark/system.
- Change accent, contrast, translucent sidebar, pointer cursor, and reduced motion once.
- Close and reopen Settings Center.
- Confirm the recently upgraded Settings UI layout, typography, and controls still look unchanged.

---

## File Map

Foundation architecture modules already created:

- `src/theme/themeTypes.ts`: theme payload and state types.
- `src/theme/themePresets.ts`: built-in theme presets and defaults.
- `src/theme/themeCodec.ts`: theme import/export and normalization.
- `src/theme/themeResolver.ts`: CSS variable generation.
- `src/theme/themeStorage.ts`: theme persistence.
- `src/theme/themeDom.ts`: DOM theme application helpers.
- `src/theme/ThemeProvider.tsx`: theme facade consumed by `App`.
- `src/theme/index.ts`: theme public API.
- `src/components/settings/settingsGeometry.ts`: Settings Center and Luogu dialog geometry.
- `src/components/settings/settingsNavigation.ts`: Settings tree, fallback pages, active labels.
- `src/components/settings/pages/luoguImportRules.ts`: Luogu import rule model, storage, directory validation, prepared-note rule transforms.
- `src/components/settings/pages/luoguImportDomain.ts`: Luogu candidate selection and scan range pure domain logic.
- `src/lib/localSearchResults.ts`: search dialog result mapping, local fallback scoring, display date formatting.

Foundation modules planned by this document:

- `src/lib/appPreferences.ts`: primitive preference storage readers, numeric clamps, and settings defaults that are not UI-specific.
- `src/lib/collectionTags.ts`: legacy collection/tag display helpers and frontmatter collection suggestions.
- `src/lib/localIndexStatus.ts`: local note index status labels and display formatting.
- `src/components/settings/settingsRegistry.ts`: settings page registry with ids, labels, group ids, keywords, render contract metadata.
- `src/components/settings/settingsSearch.ts`: search/query matching over the registry.
- `src/components/settings/settingsRenderGuards.ts`: pure helpers for group/page render decisions.
- `src/components/luogu/luoguDisplay.ts`: Luogu status, timestamp, candidate display state, and badge class helpers.
- `src/components/blog/blogController.ts`: frontend controller helpers for blog config and taxonomy interactions.
- `src/lib/taskStatus.ts`: shared long-running task status model for frontend task controllers.
- `src-tauri/src/task_status.rs`: Rust mirror of the task status model for non-AI background work.
- `src-tauri/src/storage_service.rs`: Rust storage/path/config service helpers outside `notes.rs`.
- `src-tauri/src/blog_service.rs`: Rust blog lifecycle service helpers.
- `src-tauri/src/luogu_service.rs`: Rust Luogu parser/config helpers outside command glue.
- `tests/` or colocated `*.test.ts`: focused pure-helper tests where the project test runner is enabled.
- `docs/release/foundation-checklist.md`: build, smoke, and release checklist.

---

## Execution Protocol

Use small commits. One task should leave the app buildable and reviewable.

For tasks that only move pure TypeScript helpers:

```powershell
git status --short -- . ":(exclude)notes/**"
pnpm.cmd build
git add -- <exact changed paths>
git diff --cached --name-only
git commit -m "<scope>: <summary>"
git status --short -- . ":(exclude)notes/**"
```

Stop and ask the user before continuing if any of these happen:

- A task requires editing `src/components/settings/v2/settingsV2.css`.
- A task requires changing AI behavior.
- A task requires changing `src-tauri/src/notes.rs` path safety.
- `pnpm.cmd build` fails twice for different reasons.
- A refactor changes visual JSX structure in Settings Center or Appearance page.

When user is away, continue only through low-risk pure extraction and documentation tasks. Save UI behavior or backend path-safety changes for explicit review.

---

## Phase 0: Planning And Guardrails

### Task 0.1: Save This Master Plan

**Files:**

- Create: `docs/superpowers/plans/2026-06-20-foundation-engineering-upgrade.md`

- [x] **Step 1: Create the plan document**

Create this file with the required implementation-plan header, current status, file map, phases, verification commands, and execution protocol.

- [ ] **Step 2: Verify the plan file can be read**

Run:

```powershell
Get-Content -Raw -Encoding UTF8 docs/superpowers/plans/2026-06-20-foundation-engineering-upgrade.md
```

Expected: the full plan prints without encoding errors.

- [ ] **Step 3: Commit the plan**

Run:

```powershell
git add -- docs/superpowers/plans/2026-06-20-foundation-engineering-upgrade.md
git diff --cached --name-only
git commit -m "docs: add foundation engineering upgrade plan"
```

Expected staged files:

```text
docs/superpowers/plans/2026-06-20-foundation-engineering-upgrade.md
```

### Task 0.2: Keep Project Handoff In Sync

**Files:**

- Modify: `docs/HANDOFF.md`
- Modify: `PROJECT.md`

- [ ] **Step 1: Read only the sections that describe current architecture and gotchas**

Run:

```powershell
rg -n "Theme|Settings|App.tsx|Luogu|search|AI|notes.rs|api.ts|build" PROJECT.md docs/HANDOFF.md
```

Expected: a short list of sections that mention architecture, commands, and hard rules.

- [ ] **Step 2: Add a foundation-upgrade status paragraph**

Add a short paragraph to both docs:

```markdown
Foundation upgrade status: Theme Engine has been promoted to `src/theme/**`; Settings geometry/navigation helpers and Luogu/search pure helpers have started moving out of `src/App.tsx`. AI behavior is frozen during this foundation pass. Settings V2 visual styling is protected; do not edit `src/components/settings/v2/settingsV2.css` for foundation refactors.
```

- [ ] **Step 3: Verify docs only changed expected sections**

Run:

```powershell
git diff -- PROJECT.md docs/HANDOFF.md
```

Expected: only the new status paragraph and no changes to commands, product requirements, or path safety rules.

- [ ] **Step 4: Commit**

Run:

```powershell
git add -- PROJECT.md docs/HANDOFF.md
git diff --cached --name-only
git commit -m "docs: record foundation upgrade status"
```

Expected staged files:

```text
PROJECT.md
docs/HANDOFF.md
```

---

## Phase 1: Theme Engine Boundary

Status: core extraction is complete. This phase is kept in the master plan so future workers know what is protected.

### Task 1.1: Verify Theme Engine Contract

**Files:**

- Read: `src/theme/index.ts`
- Read: `src/theme/ThemeProvider.tsx`
- Read: `src/App.tsx`
- Read: `src/components/settings/v2/pages/AppearanceSettingsPage.tsx`

- [ ] **Step 1: Confirm public exports**

Run:

```powershell
Get-Content -Raw -Encoding UTF8 src/theme/index.ts
```

Expected exports include theme types, presets, codec, resolver, storage keys, storage helpers, DOM helpers, and `ThemeProvider`/`useThemeEngine`.

- [ ] **Step 2: Confirm App consumes the provider facade**

Run:

```powershell
rg -n "useThemeEngine|document\\.documentElement|localStorage.*theme|writeStoredSettingsThemeState|readStoredSettingsThemeState" src/App.tsx src/theme src/components/settings/v2/pages/AppearanceSettingsPage.tsx
```

Expected:

- `src/App.tsx` uses `useThemeEngine`.
- DOM and storage operations for theme live under `src/theme/**`.
- `AppearanceSettingsPage` receives theme state/actions through props.

- [ ] **Step 3: Build**

Run:

```powershell
pnpm.cmd build
```

Expected: build succeeds. Existing Vite chunk-size warnings are acceptable.

- [ ] **Step 4: Commit only if verification discovers a small import/export correction**

If no file changes are needed, do not commit. If a correction is needed:

```powershell
git add -- src/theme/index.ts src/theme/ThemeProvider.tsx src/App.tsx src/components/settings/v2/pages/AppearanceSettingsPage.tsx
git diff --cached --name-only
git commit -m "fix(theme): align public engine contract"
```

---

## Phase 2: Settings Domain Maturity

### Task 2.1: Promote Settings Registry

**Files:**

- Create: `src/components/settings/settingsRegistry.ts`
- Modify: `src/components/settings/settingsNavigation.ts`
- Modify: `src/components/settings/SettingsCenterHost.tsx`
- Modify: `src/components/settings/SettingsCenterShell.tsx`

- [ ] **Step 1: Inspect current navigation and search inputs**

Run:

```powershell
rg -n "SETTINGS_TREE|SETTINGS_SECTION_FALLBACK|SETTINGS_SECTION_LABELS|settingsSearchQuery|filterSettingsTree|visibleSettingsTree" src/components/settings src/App.tsx
```

Expected: navigation constants live in `settingsNavigation.ts`; search filtering is inside `SettingsCenterShell`.

- [ ] **Step 2: Create `settingsRegistry.ts`**

Create this initial registry shape:

```ts
import type { SettingsGroupId, SettingsSection } from "./settingsTypes";

export interface SettingsRegistryPage {
  id: SettingsSection;
  groupId: SettingsGroupId;
  label: string;
  keywords: string[];
}

export const SETTINGS_REGISTRY_PAGES: SettingsRegistryPage[] = [
  { id: "general-basics", groupId: "general", label: "基础偏好", keywords: ["常规", "基础", "偏好"] },
  { id: "appearance-theme", groupId: "appearance", label: "主题", keywords: ["外观", "主题", "颜色", "字体", "浅色", "深色"] },
  { id: "ai-api", groupId: "ai", label: "模型与 API", keywords: ["AI", "模型", "API", "供应商"] },
  { id: "ai-local-notes", groupId: "ai", label: "本地笔记索引", keywords: ["AI", "索引", "本地笔记", "搜索"] },
  { id: "ai-web-search", groupId: "ai", label: "联网搜索", keywords: ["AI", "搜索", "网页", "缓存"] },
  { id: "ai-prompts", groupId: "ai", label: "提示词模板", keywords: ["AI", "提示词", "模板"] },
  { id: "luogu-account", groupId: "luogu", label: "账号配置", keywords: ["洛谷", "账号", "Cookie"] },
  { id: "luogu-rules", groupId: "luogu", label: "导入规则", keywords: ["洛谷", "规则", "AC", "题号"] },
  { id: "luogu-import-center", groupId: "luogu", label: "导入中心", keywords: ["洛谷", "导入", "提交"] },
  { id: "blog-info", groupId: "blog", label: "博客信息", keywords: ["博客", "标题", "副标题"] },
  { id: "blog-preview", groupId: "blog", label: "本地预览", keywords: ["博客", "预览", "服务"] },
  { id: "blog-tag-taxonomy", groupId: "blog", label: "标签体系", keywords: ["博客", "标签", "体系"] },
  { id: "blog-tag-manager", groupId: "blog", label: "标签管理器", keywords: ["博客", "标签", "管理"] },
  { id: "data-storage", groupId: "data", label: "目录与缓存", keywords: ["数据", "存储", "目录", "缓存"] },
  { id: "keyboard-shortcuts", groupId: "keyboard", label: "快捷键", keywords: ["键盘", "快捷键"] },
  { id: "advanced-developer", groupId: "advanced", label: "开发者", keywords: ["高级", "开发者", "诊断"] },
  { id: "diagnostics-search", groupId: "advanced", label: "搜索自检", keywords: ["诊断", "搜索", "自检"] },
  { id: "about-version", groupId: "about", label: "关于 OI Notebook", keywords: ["关于", "版本", "Markdown"] },
];
```

- [ ] **Step 3: Build labels from registry**

In `settingsNavigation.ts`, derive labels from `SETTINGS_REGISTRY_PAGES` while keeping `SETTINGS_TREE` shape unchanged.

- [ ] **Step 4: Build**

Run:

```powershell
pnpm.cmd build
```

Expected: build succeeds and Settings Center navigation labels remain unchanged.

- [ ] **Step 5: Commit**

Run:

```powershell
git add -- src/components/settings/settingsRegistry.ts src/components/settings/settingsNavigation.ts src/components/settings/SettingsCenterHost.tsx src/components/settings/SettingsCenterShell.tsx
git diff --cached --name-only
git commit -m "refactor(settings): add registry metadata"
```

### Task 2.2: Extract Settings Search Matching

**Files:**

- Create: `src/components/settings/settingsSearch.ts`
- Modify: `src/components/settings/SettingsCenterShell.tsx`
- Test if test runner is available: `src/components/settings/settingsSearch.test.ts`

- [ ] **Step 1: Inspect current filter helper**

Run:

```powershell
rg -n "filterSettingsTree|settingsSearchQuery|toLocaleLowerCase|keywords" src/components/settings
```

Expected: current filtering only searches group and child labels.

- [ ] **Step 2: Create search helper**

Create:

```ts
import type { SettingsNavigationGroup } from "./settingsTypes";
import { SETTINGS_REGISTRY_PAGES } from "./settingsRegistry";

function normalizeSettingsSearchText(value: string): string {
  return value.trim().toLocaleLowerCase("zh-CN");
}

export function filterSettingsTreeByQuery(
  tree: SettingsNavigationGroup[],
  query: string,
): SettingsNavigationGroup[] {
  const normalizedQuery = normalizeSettingsSearchText(query);
  if (!normalizedQuery) return tree;

  const pagesById = new Map(SETTINGS_REGISTRY_PAGES.map((page) => [page.id, page]));

  return tree
    .map((group) => {
      const groupMatches = normalizeSettingsSearchText(group.label).includes(normalizedQuery);
      const children = group.children.filter((child) => {
        const page = pagesById.get(child.id);
        const terms = [group.label, child.label, ...(page?.keywords ?? [])];
        return terms.some((term) => normalizeSettingsSearchText(term).includes(normalizedQuery));
      });

      return groupMatches ? group : { ...group, children };
    })
    .filter((group) => group.children.length > 0);
}
```

- [ ] **Step 3: Replace shell-local filtering**

In `SettingsCenterShell.tsx`, import `filterSettingsTreeByQuery` and use it where `filterSettingsTree` is currently called.

- [ ] **Step 4: Build**

Run:

```powershell
pnpm.cmd build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

Run:

```powershell
git add -- src/components/settings/settingsSearch.ts src/components/settings/SettingsCenterShell.tsx
git diff --cached --name-only
git commit -m "refactor(settings): extract search matching"
```

### Task 2.3: Extract Settings Render Guards

**Files:**

- Create: `src/components/settings/settingsRenderGuards.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Locate render guard helpers**

Run:

```powershell
rg -n "shouldRenderSettingsPage|shouldRenderSettingsGroup|activeSettingsTarget|SETTINGS_SECTION_LABELS" src/App.tsx
```

Expected: render guard helpers are local to `App.tsx` and only depend on settings labels and active target.

- [ ] **Step 2: Move pure guard functions**

Create functions with this shape:

```ts
import type { SettingsGroupId, SettingsSection, SettingsTarget } from "./settingsTypes";

export function shouldRenderSettingsPage(
  page: SettingsSection,
  activePageKey: SettingsSection,
  activeTarget: SettingsTarget,
): boolean {
  return activeTarget.type === "page" ? activeTarget.page === page : activePageKey === page;
}

export function shouldRenderSettingsGroup(
  groupId: SettingsGroupId,
  activePageKey: SettingsSection,
  activeTarget: SettingsTarget,
  sectionGroupByPage: Record<SettingsSection, SettingsGroupId>,
): boolean {
  const activeGroupId = activeTarget.type === "category"
    ? activeTarget.category
    : sectionGroupByPage[activePageKey];
  return activeGroupId === groupId;
}
```

If current behavior differs, preserve current behavior exactly and encode it in this module.

- [ ] **Step 3: Build**

Run:

```powershell
pnpm.cmd build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

Run:

```powershell
git add -- src/components/settings/settingsRenderGuards.ts src/App.tsx
git diff --cached --name-only
git commit -m "refactor(settings): extract render guards"
```

---

## Phase 3: App Shell Decomposition

### Task 3.1: Extract App Preference Helpers

**Files:**

- Create: `src/lib/appPreferences.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Locate preference helpers and constants**

Run:

```powershell
rg -n "getInitialNumberRange|getInitialScale|getInitialAppZoom|getInitialContentZoom|getInitialFontSize|getInitialReadingDensity|getInitialReducedMotion|getInitialDiffMarkerMode|clampAppZoom|clampContentZoom" src/App.tsx
```

Expected: pure localStorage and clamp helpers are local to `App.tsx`.

- [ ] **Step 2: Move only storage/clamp helpers**

Move helpers that read primitive preferences or clamp values. Keep viewport/layout helpers that depend on computed DOM geometry in `App.tsx` until a dedicated layout module is planned.

- [ ] **Step 3: Build**

Run:

```powershell
pnpm.cmd build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

Run:

```powershell
git add -- src/lib/appPreferences.ts src/App.tsx
git diff --cached --name-only
git commit -m "refactor(app): extract preference helpers"
```

### Task 3.2: Extract Collection And Legacy Tag Helpers

**Files:**

- Create: `src/lib/collectionTags.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Locate collection helpers**

Run:

```powershell
rg -n "COMMON_COLLECTIONS|collection|legacy|frontmatter.*tag|candidate" src/App.tsx
```

Expected: helpers around collection display and frontmatter tag suggestions are pure string/list transforms.

- [ ] **Step 2: Move only pure helpers**

Move helpers that depend on `FrontmatterFields` and `COMMON_COLLECTIONS`. Keep helpers that depend on user taxonomy config or app state in `App.tsx` until the tag taxonomy controller is extracted.

- [ ] **Step 3: Build**

Run:

```powershell
pnpm.cmd build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

Run:

```powershell
git add -- src/lib/collectionTags.ts src/App.tsx
git diff --cached --name-only
git commit -m "refactor(tags): extract collection helpers"
```

### Task 3.3: Extract Local Index Display Helpers

**Files:**

- Create: `src/lib/localIndexStatus.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Locate local index helpers**

Run:

```powershell
rg -n "getLocalIndexStatusLabel|getLocalIndexUpdatedLabel|formatLocalIndexSize|getLocalIndexAccessLabel" src/App.tsx
```

Expected: four pure helpers near the top of `App.tsx`.

- [ ] **Step 2: Move helpers**

Move these helpers into `src/lib/localIndexStatus.ts` and import them in `App.tsx`.

- [ ] **Step 3: Build**

Run:

```powershell
pnpm.cmd build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

Run:

```powershell
git add -- src/lib/localIndexStatus.ts src/App.tsx
git diff --cached --name-only
git commit -m "refactor(search): extract local index display helpers"
```

### Task 3.4: Extract Layout Persistence Helpers

**Files:**

- Create: `src/lib/layoutPreferences.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Locate layout helpers**

Run:

```powershell
rg -n "LEFT_SIDEBAR|AI_SIDEBAR|EDITOR_PREVIEW|sidebarWidth|editorPreviewRatio|getInitialAiSidebarWidth|clampAiSidebarWidth" src/App.tsx
```

Expected: layout persistence and viewport-dependent helpers are mixed in `App.tsx`.

- [ ] **Step 2: Move only pure persistence helpers**

Move localStorage key parsing and numeric range persistence. Keep functions that read `window.innerWidth`, `document`, or computed style in `App.tsx` unless all call sites are covered in the same small commit.

- [ ] **Step 3: Build**

Run:

```powershell
pnpm.cmd build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

Run:

```powershell
git add -- src/lib/layoutPreferences.ts src/App.tsx
git diff --cached --name-only
git commit -m "refactor(layout): extract persistence helpers"
```

---

## Phase 4: Luogu Import And Long-Task Model

### Task 4.1: Extract Luogu Display Helpers

**Files:**

- Create: `src/components/luogu/luoguDisplay.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Locate display helpers**

Run:

```powershell
rg -n "formatLuoguSubmissionTime|formatLuoguSubmissionStatus|getLuoguStatusBadgeClass|getLuoguCandidateDisplayState|getLuoguPreviewStatusLabel|getLuoguPreviewStatusBadgeClass" src/App.tsx
```

Expected: pure formatting and display-state helpers are local to `App.tsx`.

- [ ] **Step 2: Move display helpers**

Move only helpers that return labels, timestamps, display state, or badge class names. Keep handlers that call `previewLuoguSubmissionPage`, `prepareLuoguSubmissionNote`, `writeLuoguPreparedNote`, and `importLuoguInsight` in `App.tsx`.

- [ ] **Step 3: Build**

Run:

```powershell
pnpm.cmd build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

Run:

```powershell
git add -- src/components/luogu/luoguDisplay.ts src/App.tsx
git diff --cached --name-only
git commit -m "refactor(luogu): extract display helpers"
```

### Task 4.2: Add Shared Frontend Task Status Model

**Files:**

- Create: `src/lib/taskStatus.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Inspect task-like state**

Run:

```powershell
rg -n "Progress|Status|isScanning|isPreparing|isWriting|isStopping|paused|queued|running|failed|succeeded" src/App.tsx src/components
```

Expected: Luogu import has progress/status state that can share a common type.

- [ ] **Step 2: Create task model**

Create:

```ts
export type TaskStatus = "idle" | "queued" | "running" | "paused" | "stopping" | "succeeded" | "failed" | "cancelled";

export interface TaskProgress {
  current: number;
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export interface TaskState<TError = string> {
  status: TaskStatus;
  progress: TaskProgress | null;
  error: TError | null;
}

export function createIdleTaskState<TError = string>(): TaskState<TError> {
  return { status: "idle", progress: null, error: null };
}
```

- [ ] **Step 3: Use the type without changing runtime behavior**

Type existing Luogu progress/status state where possible. Do not combine separate state variables in this task.

- [ ] **Step 4: Build**

Run:

```powershell
pnpm.cmd build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

Run:

```powershell
git add -- src/lib/taskStatus.ts src/App.tsx
git diff --cached --name-only
git commit -m "refactor(tasks): add shared status model"
```

### Task 4.3: Introduce Luogu Import Controller Hook

**Files:**

- Create: `src/components/luogu/useLuoguImportController.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Locate Luogu import handlers**

Run:

```powershell
rg -n "handleScanLuogu|handlePrepare|handleWrite|openLuoguDialog|luoguPreview|luoguPrepared|selectedLuogu" src/App.tsx
```

Expected: Luogu orchestration remains in `App.tsx` after pure helpers have moved.

- [ ] **Step 2: Extract read-only derived selectors first**

Move memo-ready selectors and derived booleans into the hook. Keep backend-calling handlers in `App.tsx` for the first controller commit.

- [ ] **Step 3: Build**

Run:

```powershell
pnpm.cmd build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

Run:

```powershell
git add -- src/components/luogu/useLuoguImportController.ts src/App.tsx
git diff --cached --name-only
git commit -m "refactor(luogu): introduce import controller"
```

---

## Phase 5: Blog And Tag Taxonomy Controllers

### Task 5.1: Extract Blog Config Controller Helpers

**Files:**

- Create: `src/components/blog/blogController.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Locate blog config state and handlers**

Run:

```powershell
rg -n "blogInfoDraft|blogConfig|openBlog|restartBlogServer|getBlogConfig|saveBlogConfig|BlogPreviewSettingsPage" src/App.tsx
```

Expected: blog config draft and status logic are local to `App.tsx`.

- [ ] **Step 2: Move pure normalization and label helpers**

Move only pure helpers and typed action payloads. Keep calls to `getBlogConfig`, `saveBlogConfig`, `openBlog`, and `restartBlogServer` routed through `src/lib/api.ts`.

- [ ] **Step 3: Build**

Run:

```powershell
pnpm.cmd build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

Run:

```powershell
git add -- src/components/blog/blogController.ts src/App.tsx
git diff --cached --name-only
git commit -m "refactor(blog): extract config helpers"
```

### Task 5.2: Extract Tag Taxonomy Scan Helpers

**Files:**

- Create: `src/components/tag-manager/tagNormalizationScan.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Locate tag normalization helpers**

Run:

```powershell
rg -n "TagNormalizationScan|createEmptyTagNormalizationScanStats|addTagNormalizationPlanStats|formatTagNormalizationReason|applyTagNormalization" src/App.tsx
```

Expected: stats and reason formatting helpers are local to `App.tsx`.

- [ ] **Step 2: Move stats helpers**

Move `TagNormalizationScanStats`, `createEmptyTagNormalizationScanStats`, and `addTagNormalizationPlanStats`. Keep UI text formatting in `App.tsx` if it is tightly coupled to JSX.

- [ ] **Step 3: Build**

Run:

```powershell
pnpm.cmd build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

Run:

```powershell
git add -- src/components/tag-manager/tagNormalizationScan.ts src/App.tsx
git diff --cached --name-only
git commit -m "refactor(tags): extract normalization scan helpers"
```

---

## Phase 6: Editor And Markdown Pipeline

### Task 6.1: Extract Markdown Load/Save Pure Helpers

**Files:**

- Create: `src/lib/markdownDocument.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Locate document splitting and dirty-state helpers**

Run:

```powershell
rg -n "LoadedMarkdownParts|SavedNoteSnapshot|splitLoadedMarkdown|combineMarkdown|isSnapshotDirty" src/App.tsx
```

Expected: these helpers are pure and use `splitFrontmatter`.

- [ ] **Step 2: Move helpers**

Move the helper types and functions into `src/lib/markdownDocument.ts`. Keep editor and preview component refs unchanged.

- [ ] **Step 3: Build**

Run:

```powershell
pnpm.cmd build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

Run:

```powershell
git add -- src/lib/markdownDocument.ts src/App.tsx
git diff --cached --name-only
git commit -m "refactor(markdown): extract document helpers"
```

### Task 6.2: Add Markdown Fixture Tests

**Files:**

- Create: `src/lib/markdownDocument.test.ts`
- Modify only if test script is missing: `package.json`

- [ ] **Step 1: Check test runner**

Run:

```powershell
Get-Content -Raw package.json
```

Expected: inspect whether a test script exists. If no runner exists, add Vitest in a separate tooling task before this task.

- [ ] **Step 2: Add tests**

Test cases:

```ts
import { describe, expect, it } from "vitest";
import { combineMarkdown, isSnapshotDirty, splitLoadedMarkdown } from "./markdownDocument";

describe("markdownDocument", () => {
  it("splits closed frontmatter from the body", () => {
    const result = splitLoadedMarkdown("---\ntitle: A\n---\nBody");
    expect(result.frontmatterPrefix).toBe("---\ntitle: A\n---\n");
    expect(result.body).toBe("Body");
    expect(result.warning).toBeNull();
  });

  it("keeps unclosed frontmatter as body", () => {
    const result = splitLoadedMarkdown("---\ntitle: A\nBody");
    expect(result.frontmatterPrefix).toBe("");
    expect(result.body).toBe("---\ntitle: A\nBody");
    expect(result.warning).toContain("frontmatter");
  });

  it("detects dirty snapshots", () => {
    expect(isSnapshotDirty({ path: "a.md", frontmatterPrefix: "", markdown: "A" }, "a.md", "", "B")).toBe(true);
    expect(isSnapshotDirty({ path: "a.md", frontmatterPrefix: "", markdown: "A" }, "a.md", "", "A")).toBe(false);
  });

  it("combines frontmatter and body", () => {
    expect(combineMarkdown("---\na: b\n---\n", "Body")).toBe("---\na: b\n---\nBody");
  });
});
```

- [ ] **Step 3: Run focused tests**

Run:

```powershell
pnpm.cmd test -- src/lib/markdownDocument.test.ts
```

Expected: tests pass. If no test script exists, stop and create the tooling task first.

- [ ] **Step 4: Commit**

Run:

```powershell
git add -- src/lib/markdownDocument.test.ts package.json pnpm-lock.yaml
git diff --cached --name-only
git commit -m "test(markdown): cover document helpers"
```

---

## Phase 7: Rust Non-AI Service Layer

### Task 7.1: Audit Rust Command Boundaries

**Files:**

- Read: `src-tauri/src/lib.rs`
- Read: `src-tauri/src/notes.rs`
- Read: `src-tauri/src/git.rs`
- Read: `src-tauri/src/luogu.rs`
- Read: `src-tauri/src/blog_server.rs`
- Read: `src-tauri/src/paths.rs`

- [ ] **Step 1: Find Tauri commands and direct filesystem boundaries**

Run:

```powershell
rg -n "#\\[tauri::command\\]|pub fn|async fn|notes_root|app_data|PathBuf|canonicalize" src-tauri/src
```

Expected: command functions and path-sensitive helpers are visible.

- [ ] **Step 2: Write a short service-boundary note in this plan**

Append a short note under this task listing which helpers can move out of command glue without changing `notes.rs` path safety.

- [ ] **Step 3: Commit only if the note is added**

Run:

```powershell
git add -- docs/superpowers/plans/2026-06-20-foundation-engineering-upgrade.md
git diff --cached --name-only
git commit -m "docs: record rust service boundary audit"
```

**Service-boundary audit note, 2026-06-20:**

- Keep all `#[tauri::command]` functions as stable command adapters unless a later task explicitly changes the frontend contract. The non-AI command surface currently includes app/window commands in `lib.rs`, notes commands in `notes.rs`, git commands in `git.rs`, Luogu commands in `luogu.rs`, and blog config commands in `blog_server.rs`.
- Keep `paths.rs` as the root/path provider. It owns app data, repo root, notes root, `.oinb`, site, local-blog dist, and data directory creation. Service modules should call it instead of duplicating root discovery.
- Treat `notes.rs` path safety as high-risk. `safe_note_path` and its two-layer guard must not be simplified or replaced by a generic helper. If notes helpers are ever extracted, move the validation, canonicalization, callers, and tests as one intact unit.
- Safe future extraction candidates: git command internals such as command execution/output helpers, staging guards, commit helpers, and pathspec validation; Luogu parsing/fetching/markdown-building/import helpers that already take explicit inputs; blog note scanning, frontmatter parsing, note/asset/static path resolution, JSON serialization, and typed blog response models.
- Blog extraction order should be conservative: first pure string/path/frontmatter helpers, then note scanning/detail assembly, then asset/static resolution while preserving canonical containment checks, then JSON helpers. Keep HTTP response writing, `ProductionBlogServer`, route dispatch, redirects, Tauri commands, and `State<BlogServerState>` glue in `blog_server.rs` until the service boundary is stable.
- Do not mix behavior cleanup into service extraction. In particular, `lib.rs::start_blog_server` currently routes both debug and release to `ProductionBlogServer::ensure_running`; record that observation, but leave the behavior unchanged during extraction tasks.

### Task 7.2: Add Rust Task Status Model

**Files:**

- Create: `src-tauri/src/task_status.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create Rust model**

Create:

```rust
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskProgress {
    pub current: usize,
    pub total: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub skipped: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskError {
    pub message: String,
}
```

- [ ] **Step 2: Export module**

In `src-tauri/src/lib.rs`, add:

```rust
mod task_status;
```

- [ ] **Step 3: Run Rust tests**

Run:

```powershell
cd src-tauri
cargo test
```

Expected: tests pass.

- [ ] **Step 4: Commit**

Run:

```powershell
git add -- src-tauri/src/task_status.rs src-tauri/src/lib.rs
git diff --cached --name-only
git commit -m "refactor(tasks): add rust task status model"
```

### Task 7.3: Extract Blog Service Helpers

**Files:**

- Create: `src-tauri/src/blog_service.rs`
- Modify: `src-tauri/src/blog_server.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Inspect blog server responsibilities**

Run:

```powershell
rg -n "blog|server|preview|config|resource|static|asset" src-tauri/src/blog_server.rs src-tauri/src/lib.rs
```

Expected: separate lifecycle/config helpers from command-facing glue.

- [ ] **Step 2: Move pure helpers only**

Move helpers that do not change command signatures. Keep Tauri command names and frontend API wrappers unchanged.

- [ ] **Step 3: Run Rust tests and frontend build**

Run:

```powershell
cd src-tauri
cargo test
```

Then from repo root:

```powershell
pnpm.cmd build
```

Expected: both pass.

- [ ] **Step 4: Commit**

Run:

```powershell
git add -- src-tauri/src/blog_service.rs src-tauri/src/blog_server.rs src-tauri/src/lib.rs
git diff --cached --name-only
git commit -m "refactor(blog): extract server service helpers"
```

---

## Phase 8: Testing And Release Engineering

### Task 8.1: Add Pure Helper Test Harness

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `vitest.config.ts`

- [ ] **Step 1: Inspect current scripts**

Run:

```powershell
Get-Content -Raw package.json
```

Expected: determine whether `test` and `test:run` scripts exist.

- [ ] **Step 2: Add Vitest only if missing**

If Vitest is missing, run:

```powershell
pnpm.cmd add -D vitest
```

Then add scripts:

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run"
  }
}
```

Preserve all existing scripts.

- [ ] **Step 3: Run test command**

Run:

```powershell
pnpm.cmd test:run
```

Expected: no tests found is acceptable only before test files are added; after tests are added, all tests pass.

- [ ] **Step 4: Commit**

Run:

```powershell
git add -- package.json pnpm-lock.yaml vitest.config.ts
git diff --cached --name-only
git commit -m "test: add frontend helper test harness"
```

### Task 8.2: Add Settings Smoke Checklist

**Files:**

- Create: `docs/release/foundation-checklist.md`

- [ ] **Step 1: Create checklist**

Create:

```markdown
# Foundation Release Checklist

## Build

- [ ] `pnpm.cmd build` passes.
- [ ] `cd src-tauri; cargo test` passes when Rust files changed.
- [ ] Non-notes worktree status is clean.

## Settings UI Smoke

- [ ] Settings Center opens.
- [ ] Appearance page renders unchanged.
- [ ] Light/dark/system switching works.
- [ ] Accent and contrast controls persist after close/reopen.
- [ ] Settings search finds Appearance, Luogu, Blog, Data, Keyboard, Advanced, About.

## Luogu Smoke

- [ ] Luogu rules page opens.
- [ ] Rule changes save and reload.
- [ ] Import center range label changes between count and days.
- [ ] Candidate selection behavior matches existing rules.

## Search Smoke

- [ ] Empty search shows recently modified notes.
- [ ] Query fallback searches title and path when backend search fails.
- [ ] Backend results still show title, path, tags, summary, and excerpt.
```

- [ ] **Step 2: Commit**

Run:

```powershell
git add -- docs/release/foundation-checklist.md
git diff --cached --name-only
git commit -m "docs: add foundation release checklist"
```

### Task 8.3: Add Playwright Settings Smoke

**Files:**

- Create: `tests/settings-smoke.spec.ts`
- Modify only if required: `package.json`

- [ ] **Step 1: Check existing Playwright setup**

Run:

```powershell
rg -n "playwright|@playwright/test|settings-smoke" package.json tests src
```

Expected: determine whether Playwright is already installed or a manual smoke remains the active verification path.

- [ ] **Step 2: Add smoke only if Playwright exists**

If `@playwright/test` exists, add a smoke that opens the dev app URL used by the project and verifies Settings Center opens. If Playwright is not installed, keep this task parked and do not add dependencies during foundation refactors.

- [ ] **Step 3: Run smoke**

Run the existing Playwright command from `package.json`.

Expected: Settings smoke passes.

- [ ] **Step 4: Commit**

Run:

```powershell
git add -- tests/settings-smoke.spec.ts package.json
git diff --cached --name-only
git commit -m "test(settings): add smoke coverage"
```

---

## Phase 9: AI Upgrade Readiness Gate

This phase prepares for the later AI upgrade without changing AI behavior.

### Task 9.1: Document AI Freeze Boundary

**Files:**

- Create: `docs/architecture/ai-freeze-boundary.md`

- [ ] **Step 1: Create boundary doc**

Create:

```markdown
# AI Freeze Boundary

Foundation work may move non-AI helpers, settings metadata, task models, and service boundaries.

Foundation work must not change:

- `src/components/ai/AiSidebar.tsx`
- `src/lib/aiWebSearch.ts`
- `src-tauri/src/ai.rs`
- AI prompts, model selection behavior, provider behavior, or web search behavior

The later AI upgrade can start when:

- `src/App.tsx` no longer owns unrelated domain helper clusters.
- Long-task status models exist in frontend and Rust.
- Settings registry/search can host AI settings without visual churn.
- Non-AI Rust services have clearer command/service boundaries.
```

- [ ] **Step 2: Commit**

Run:

```powershell
git add -- docs/architecture/ai-freeze-boundary.md
git diff --cached --name-only
git commit -m "docs(ai): define freeze boundary"
```

### Task 9.2: Define AI Upgrade Entry Criteria

**Files:**

- Create: `docs/architecture/ai-upgrade-entry-criteria.md`

- [ ] **Step 1: Create entry criteria doc**

Create:

```markdown
# AI Upgrade Entry Criteria

The full AI assistant upgrade can begin after these checks pass:

- [ ] Theme Engine is stable through Settings manual smoke.
- [ ] Settings registry/search is in place.
- [ ] Luogu import rules and candidate domain logic are outside `App.tsx`.
- [ ] Search result helpers are outside `App.tsx`.
- [ ] Markdown document helpers are outside `App.tsx`.
- [ ] Long-task status model exists for frontend and Rust.
- [ ] `pnpm.cmd build` passes.
- [ ] Rust tests pass after Rust service changes.
- [ ] `notes/**` remains untouched by routine engineering work.

Initial AI upgrade target:

- Replace ad hoc assistant behavior with a planner/executor architecture inspired by Codex core capabilities.
- Keep Tavily as the primary future web search provider.
- Keep no-key search as auxiliary fallback only.
- Preserve Settings UI behavior while adding or reshaping AI configuration.
```

- [ ] **Step 2: Commit**

Run:

```powershell
git add -- docs/architecture/ai-upgrade-entry-criteria.md
git diff --cached --name-only
git commit -m "docs(ai): add upgrade entry criteria"
```

---

## Continuous Execution Queue

When the user is away, execute these low-risk tasks in order:

1. Update this plan whenever execution reality diverges from the original queue.
2. Continue extracting remaining non-AI status/label helpers from `App.tsx` when they are pure and testable; status bar and Luogu connection labels are now covered by `src/lib/appStatusLabels.ts`.
3. Keep editor-context behavior pinned in `src/lib/editorContext.ts`; do not change cursor paragraph semantics unless a later behavior task explicitly asks for it.
4. Keep preview sync timing rules in `src/lib/previewSyncTiming.ts`; future performance tuning should update its tests with the rule change.
5. Extract prompt usage metadata helpers only if the task can avoid changing prompt content or AI behavior.
6. Continue reducing note/file workspace orchestration by moving pure path rewrite helpers, leaving side effects in `App.tsx`.
7. Add or update tests for every pure helper module touched in the same commit.
8. Keep verifying with `pnpm.cmd test:run` and `pnpm.cmd build` after each small slice.
9. Treat `src/lib/tagTaxonomyUserConfig.ts` as the App-facing user taxonomy helper boundary; keep `src/components/tag-manager/tagManagerConfig.ts` ID behavior separate unless a later task deliberately preserves and tests both algorithms.

Hold these for user-visible review before continuing:

1. Any Settings visual JSX/CSS change.
2. Any AI behavior, prompt, provider, model, or web-search behavior change.
3. Any edit to `src-tauri/src/notes.rs` path safety.
4. Any Rust service extraction that changes Tauri command signatures.
5. Playwright Settings smoke if it requires adding a new dependency.

---

## Self-Review

Spec coverage:

- Foundation-first architecture: covered by Phases 1-8.
- AI frozen during foundation: covered by guardrails and Phase 9.
- Settings UI protection: covered by guardrails, manual smoke, and Settings-specific phases.
- Theme Engine current status: covered by Current Status and Phase 1.
- App shell decomposition: covered by Phase 3.
- Luogu/task model: covered by Phase 4.
- Editor/Markdown safety: covered by Phase 6 and explicit ref-pattern guardrail.
- Rust non-AI service layer: covered by Phase 7.
- Testing/release engineering: covered by Phase 8.

Placeholder scan:

- This plan does not use open-ended task markers such as unfinished placeholders.
- Each executable task has concrete files, commands, and expected results.

Type consistency:

- Settings types use `SettingsGroupId`, `SettingsSection`, and `SettingsTarget` from `src/components/settings/settingsTypes.ts`.
- Luogu rule types use `LuoguImportRules` from `src/components/settings/pages/luoguImportRules.ts`.
- Search result helpers use `NoteSearchResult` from `src/lib/api.ts` and `NoteFileInfo` from `src/types/note.ts`.
