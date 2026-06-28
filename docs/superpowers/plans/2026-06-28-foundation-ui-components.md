# Foundation UI Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade OI Notebook's reusable UI foundation so buttons, cards/panels, tabs, and dialogs have consistent semantics across the app while preserving Settings v2 and avoiding AI hot-path churn.

**Architecture:** Keep `src/components/ui` as the business-neutral primitive layer, add app-level composition patterns in `src/components/common`, and migrate feature areas through thin wrappers or direct usage of the shared layer. Settings v2 remains the protected visual reference; AI changes are shell-only and isolated late in the sequence.

**Tech Stack:** React, TypeScript, Tailwind utility classes, Radix UI primitives, lucide-react, Vite, pnpm, Tauri.

---

## Source Spec

Read first:

- `docs/superpowers/specs/2026-06-28-foundation-ui-components-design.md`
- `AGENTS.md`

Work in:

- `D:\Dev\Projects\oi-notebook\.worktrees\foundation-ui-components`
- Branch: `codex/foundation-ui-components`

Do not use `git add .`, `git add -A`, or `git commit -a`.

## File Structure

Create:

- `src/components/ui/tabs.tsx` - business-neutral accessible tabs primitive.
- `src/components/common/AppDialog.tsx` - app-level dialog shell for repeated modal structure.
- `src/components/common/Panel.tsx` - app-level panel/surface composition for repeated feature containers.
- `src/components/common/EmptyState.tsx` - small reusable empty-state pattern for feature sweeps.

Modify:

- `src/components/ui/index.ts` - export `tabs`.
- `src/components/common/ConfirmDialog.tsx` - use `AppDialog` and standardized button semantics.
- `src/components/TagPickerDialog.tsx` - migrate close/footer/common action controls while preserving draggable/resizable behavior.
- `src/components/tag-manager/TagManagerShell.tsx` - use shared panel/action semantics without changing state or drag/resize logic.
- `src/components/tag-manager/TagManagerRootColumn.tsx` - reduce repeated panel/list styling where safe.
- `src/components/tag-manager/TagManagerGroupColumn.tsx` - reduce repeated panel/list styling where safe.
- `src/components/tag-manager/TagManagerDetailsPanel.tsx` - reduce repeated panel/detail styling where safe.
- `src/components/file-tree/FileTree.tsx` - migrate shell/action controls only.
- `src/components/layout/OpenTabsBar.tsx` - align document tab buttons with shared button/tab tokens without changing document-tab behavior.
- `src/components/settings/SearchDiagnosticsPanel.tsx` - migrate panels/buttons where safe.
- `src/components/ai/AiSidebar.tsx` - shell-only migration after all shared APIs are stable.

Protected or avoid:

- Do not rewrite `src/components/editor/MarkdownEditor.tsx`.
- Do not rewrite `src/components/editor/MarkdownPreview.tsx`.
- Do not change AI message rendering, markdown rendering/cache, streaming, citation decoration, virtual list, or Research Engine logic.
- Do not visually redesign Settings v2; any Settings primitive changes require before/after visual inspection.

---

### Task 1: Baseline and Inventory

**Files:**
- Read: `src/components/ui/index.ts`
- Read: `src/components/ui/button.tsx`
- Read: `src/components/ui/card.tsx`
- Read: `src/components/ui/dialog.tsx`
- Read: `src/components/ui/segmented-control.tsx`
- Read: `src/components/common/ConfirmDialog.tsx`
- Read: `src/components/TagPickerDialog.tsx`
- Read: `src/components/tag-manager/TagManagerShell.tsx`

- [ ] **Step 1: Confirm clean isolated worktree**

Run:

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git branch --show-current
```

Expected:

```text
codex/foundation-ui-components
```

`git status` and `git diff --cached --name-only` should have no output before implementation starts.

- [ ] **Step 2: Record current component import inventory**

Run:

```powershell
rg "@/components/ui/(button|card|dialog|segmented-control|setting-row|toolbar-button|icon-button)" src/components -n
rg "className=\"[^\"]*(h-7|h-8|rounded-sm|border-border|DialogFooter|DialogContent)" src/components -n
```

Expected:

```text
At least ConfirmDialog, TagPickerDialog, TagManagerShell, Settings pages, editor toolbar, and AiSidebar appear in the output.
```

- [ ] **Step 3: Do not commit**

This task is read-only. If any files changed, stop and inspect before continuing.

---

### Task 2: Add the `Tabs` UI Primitive

**Files:**
- Create: `src/components/ui/tabs.tsx`
- Modify: `src/components/ui/index.ts`

- [ ] **Step 1: Create `src/components/ui/tabs.tsx`**

Use this implementation:

```tsx
"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("grid min-w-0 gap-3", className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex min-w-0 items-center gap-0.5 rounded-[var(--ui-radius-control)] bg-muted p-0.5",
        className,
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex h-7 min-w-0 items-center justify-center gap-1 rounded-[var(--ui-radius-item)] px-2.5 text-xs font-medium text-muted-foreground outline-none transition-[background-color,color,box-shadow,opacity] duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)] hover:bg-[var(--ui-state-hover)] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-[var(--ui-focus-ring-soft)] disabled:pointer-events-none disabled:opacity-[var(--ui-disabled-opacity)] data-[state=active]:bg-[var(--ui-state-selected)] data-[state=active]:text-[var(--ui-state-selected-foreground)] data-[state=active]:shadow-sm",
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("min-w-0 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsContent, TabsList, TabsTrigger }
```

- [ ] **Step 2: Export tabs**

Append this line to `src/components/ui/index.ts` near the other UI exports:

```ts
export * from "@/components/ui/tabs"
```

- [ ] **Step 3: Run typecheck**

Run:

```powershell
pnpm.cmd tsc --noEmit
```

Expected:

```text
No TypeScript errors from tabs.tsx or ui/index.ts.
```

- [ ] **Step 4: Commit**

Run:

```powershell
git status --short -- . ":(exclude)notes/**"
git add -- src/components/ui/tabs.tsx src/components/ui/index.ts
git diff --cached --name-only
git commit -m "feat(ui): add tabs primitive"
```

Expected staged files:

```text
src/components/ui/index.ts
src/components/ui/tabs.tsx
```

---

### Task 3: Add Common Dialog and Panel Patterns

**Files:**
- Create: `src/components/common/AppDialog.tsx`
- Create: `src/components/common/Panel.tsx`
- Create: `src/components/common/EmptyState.tsx`

- [ ] **Step 1: Create `src/components/common/AppDialog.tsx`**

Use this implementation:

```tsx
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export interface AppDialogProps {
  open: boolean
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  width?: "sm" | "md" | "lg" | "xl"
  overlayClassName?: string
  contentClassName?: string
  headerClassName?: string
  bodyClassName?: string
  footerClassName?: string
  showCloseButton?: boolean
  onOpenChange: (open: boolean) => void
}

const widthClassName = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-2xl",
} satisfies Record<NonNullable<AppDialogProps["width"]>, string>

export function AppDialog({
  open,
  title,
  description,
  children,
  footer,
  width = "md",
  overlayClassName,
  contentClassName,
  headerClassName,
  bodyClassName,
  footerClassName,
  showCloseButton = true,
  onOpenChange,
}: AppDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName={overlayClassName}
        showCloseButton={showCloseButton}
        className={cn(widthClassName[width], contentClassName)}
      >
        <DialogHeader className={headerClassName}>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children ? <div className={cn("min-w-0", bodyClassName)}>{children}</div> : null}
        {footer ? <DialogFooter className={footerClassName}>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  )
}

export function AppDialogCloseButton({
  children = "取消",
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button type="button" variant="outline" {...props}>
      {children}
    </Button>
  )
}
```

- [ ] **Step 2: Create `src/components/common/Panel.tsx`**

Use this implementation:

```tsx
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export interface PanelProps extends React.ComponentProps<"section"> {
  tone?: "default" | "muted" | "floating"
}

export function Panel({ className, tone = "default", ...props }: PanelProps) {
  return (
    <section
      data-slot="panel"
      data-tone={tone}
      className={cn(
        "min-w-0 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border-subtle)] text-card-foreground",
        tone === "default" && "bg-card shadow-sm",
        tone === "muted" && "bg-muted/20",
        tone === "floating" && "bg-background/96 shadow-xl shadow-black/20 backdrop-blur-xl",
        className,
      )}
      {...props}
    />
  )
}

export function PanelHeader({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="panel-header"
      className={cn("flex min-w-0 items-center justify-between gap-3 border-b border-[var(--ui-border-subtle)] px-4 py-3", className)}
      {...props}
    />
  )
}

export function PanelTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="panel-title"
      className={cn("min-w-0 text-sm font-semibold text-foreground", className)}
      {...props}
    />
  )
}

export function PanelDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="panel-description"
      className={cn("mt-1 text-xs/relaxed text-muted-foreground", className)}
      {...props}
    />
  )
}

export function PanelBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="panel-body" className={cn("min-w-0 p-4", className)} {...props} />
}

export function PanelActions({ className, children, ...props }: React.ComponentProps<"div"> & { children: ReactNode }) {
  return (
    <div
      data-slot="panel-actions"
      className={cn("flex min-w-0 items-center justify-end gap-2", className)}
      {...props}
    >
      {children}
    </div>
  )
}
```

- [ ] **Step 3: Create `src/components/common/EmptyState.tsx`**

Use this implementation:

```tsx
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export interface EmptyStateProps extends React.ComponentProps<"div"> {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
}

export function EmptyState({
  title,
  description,
  action,
  className,
  children,
  ...props
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn("grid min-w-0 place-items-center gap-2 px-4 py-8 text-center", className)}
      {...props}
    >
      <div className="grid max-w-sm gap-1">
        {title ? <div className="text-sm font-medium text-foreground">{title}</div> : null}
        {description ? <div className="text-xs/relaxed text-muted-foreground">{description}</div> : null}
        {children}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
```

- [ ] **Step 4: Run typecheck**

Run:

```powershell
pnpm.cmd tsc --noEmit
```

Expected:

```text
No TypeScript errors from AppDialog, Panel, or EmptyState.
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add -- src/components/common/AppDialog.tsx src/components/common/Panel.tsx src/components/common/EmptyState.tsx
git diff --cached --name-only
git commit -m "feat(ui): add common app surfaces"
```

Expected staged files:

```text
src/components/common/AppDialog.tsx
src/components/common/EmptyState.tsx
src/components/common/Panel.tsx
```

---

### Task 4: Migrate ConfirmDialog to AppDialog

**Files:**
- Modify: `src/components/common/ConfirmDialog.tsx`

- [ ] **Step 1: Replace ConfirmDialog implementation**

Use this implementation:

```tsx
import type { ReactNode } from "react"

import { AppDialog } from "@/components/common/AppDialog"
import { Button } from "@/components/ui/button"

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: ReactNode
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "确认",
  cancelText = "取消",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AppDialog
      open={open}
      title={title}
      description={description}
      width="md"
      overlayClassName="z-[150]"
      contentClassName="z-[160] w-[min(420px,calc(100vw-32px))] max-w-none border-border/80 bg-popover text-popover-foreground shadow-2xl shadow-black/25 dark:border-white/10 dark:bg-popover"
      footerClassName="gap-2 sm:justify-end"
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel()
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button type="button" variant={danger ? "destructive" : "default"} onClick={onConfirm}>
            {confirmText}
          </Button>
        </>
      }
    />
  )
}
```

- [ ] **Step 2: Run typecheck**

Run:

```powershell
pnpm.cmd tsc --noEmit
```

Expected:

```text
No TypeScript errors from ConfirmDialog.
```

- [ ] **Step 3: Commit**

Run:

```powershell
git add -- src/components/common/ConfirmDialog.tsx
git diff --cached --name-only
git commit -m "refactor(ui): standardize confirm dialog shell"
```

Expected staged files:

```text
src/components/common/ConfirmDialog.tsx
```

---

### Task 5: Migrate Tag Picker Shell Controls

**Files:**
- Modify: `src/components/TagPickerDialog.tsx`

- [ ] **Step 1: Update imports**

Keep the existing `Dialog` primitives because the picker is draggable and resizable. Add `IconButton` and avoid changing picker state helpers.

```tsx
import { IconButton } from "@/components/ui/icon-button"
```

- [ ] **Step 2: Replace the header close button**

Replace the manual close `<button>` in the `DialogHeader` with:

```tsx
<IconButton
  type="button"
  data-no-window-drag="true"
  aria-label="关闭标签选择"
  title="关闭标签选择"
  onClick={close}
>
  <X aria-hidden="true" />
</IconButton>
```

- [ ] **Step 3: Remove button geometry overrides where existing sizes work**

In `TagPickerDialog.tsx`, replace `Button` usages that include `className="h-7 px-2 ..."` with `size="sm"` or `size="compact"` while preserving color-specific class names. Example replacement:

```tsx
<Button
  type="button"
  variant="ghost"
  size="compact"
  className="text-[#146BB7]"
  onClick={addCustomTag}
>
  <Plus aria-hidden="true" />
  添加自定义标签：“{normalizeTagValue(searchQuery)}”
</Button>
```

- [ ] **Step 4: Run typecheck**

Run:

```powershell
pnpm.cmd tsc --noEmit
```

Expected:

```text
No TypeScript errors from TagPickerDialog.
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add -- src/components/TagPickerDialog.tsx
git diff --cached --name-only
git commit -m "refactor(ui): align tag picker controls"
```

Expected staged files:

```text
src/components/TagPickerDialog.tsx
```

---

### Task 6: Migrate Tag Manager Surface and Actions

**Files:**
- Modify: `src/components/tag-manager/TagManagerShell.tsx`
- Modify: `src/components/tag-manager/TagManagerRootColumn.tsx`
- Modify: `src/components/tag-manager/TagManagerGroupColumn.tsx`
- Modify: `src/components/tag-manager/TagManagerDetailsPanel.tsx`

- [ ] **Step 1: Update shell imports**

In `TagManagerShell.tsx`, add:

```tsx
import { Panel, PanelHeader, PanelTitle } from "@/components/common/Panel"
```

- [ ] **Step 2: Wrap the floating manager window with `Panel`**

Replace the outer draggable `<section>` with:

```tsx
<Panel
  tone="floating"
  className="absolute flex min-h-[560px] min-w-[900px] flex-col overflow-hidden rounded-[10px]"
  style={{ left: dialogRect.left, top: dialogRect.top, width: dialogRect.width, height: dialogRect.height }}
>
```

Keep all drag, resize, and clear-selection handlers unchanged.

- [ ] **Step 3: Use panel header semantics**

Replace the header opening tag in `TagManagerShell.tsx` with:

```tsx
<PanelHeader
  data-tag-manager-no-clear="true"
  className="h-12 shrink-0 cursor-grab px-5 py-0 active:cursor-grabbing"
  onPointerDown={beginDrag}
>
  <PanelTitle className="text-base">Tag Manager</PanelTitle>
```

Keep the existing close `IconButton`.

- [ ] **Step 4: Remove redundant button geometry overrides**

In `TagManagerShell.tsx`, replace button class overrides that only restate shared geometry. Example:

```tsx
<Button
  data-no-window-drag="true"
  data-tag-manager-interactive="true"
  type="button"
  variant="outline"
  size="sm"
  className="w-44 justify-between text-xs"
>
```

Do not remove feature-specific width, color, or truncation classes.

- [ ] **Step 5: Inspect column files for panel-like wrappers**

In each column file, replace only top-level repeated panel shell classes with `Panel`, `PanelHeader`, `PanelBody`, or `PanelTitle` when the replacement does not change layout. Do not change selection logic, drag sorting, collection logic, or config normalization.

Use this import where needed:

```tsx
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/common/Panel"
```

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```powershell
pnpm.cmd vitest run src/components/tag-manager/tagManagerOrdering.test.ts src/components/tag-manager/tagManagerViewModel.test.ts src/components/tag-manager/tagManagerConfig.test.ts
pnpm.cmd tsc --noEmit
```

Expected:

```text
All listed Vitest tests pass.
No TypeScript errors from tag-manager files.
```

- [ ] **Step 7: Commit**

Run:

```powershell
git add -- src/components/tag-manager/TagManagerShell.tsx src/components/tag-manager/TagManagerRootColumn.tsx src/components/tag-manager/TagManagerGroupColumn.tsx src/components/tag-manager/TagManagerDetailsPanel.tsx
git diff --cached --name-only
git commit -m "refactor(ui): align tag manager surfaces"
```

Expected staged files are exactly the four tag-manager files listed above.

---

### Task 7: Align File Tree and Open Tabs UI

**Files:**
- Modify: `src/components/file-tree/FileTree.tsx`
- Modify: `src/components/layout/OpenTabsBar.tsx`

- [ ] **Step 1: Migrate file tree action buttons**

In `FileTree.tsx`, use `Button`, `IconButton`, or `ToolbarButton` size and variant props instead of local height/padding classes when the existing shared size matches. Keep note creation, selection, rename, and context menu behavior unchanged.

Use imports only if not already present:

```tsx
import { IconButton } from "@/components/ui/icon-button"
import { ToolbarButton } from "@/components/ui/toolbar-button"
```

- [ ] **Step 2: Align OpenTabsBar as document tabs**

In `OpenTabsBar.tsx`, do not migrate to content `Tabs`. Keep it as a document tab strip. Use shared button-style tokens or `ToolbarButton` for close/actions when it does not change behavior.

Use this principle for active tab class names:

```tsx
const tabClassName = cn(
  "inline-flex min-w-0 items-center gap-2 border-b-2 px-3 text-xs transition-colors",
  active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
)
```

- [ ] **Step 3: Run typecheck**

Run:

```powershell
pnpm.cmd tsc --noEmit
```

Expected:

```text
No TypeScript errors from FileTree or OpenTabsBar.
```

- [ ] **Step 4: Commit**

Run:

```powershell
git add -- src/components/file-tree/FileTree.tsx src/components/layout/OpenTabsBar.tsx
git diff --cached --name-only
git commit -m "refactor(ui): align navigation controls"
```

Expected staged files:

```text
src/components/file-tree/FileTree.tsx
src/components/layout/OpenTabsBar.tsx
```

---

### Task 8: Align Settings Diagnostics Without Reworking Settings v2

**Files:**
- Modify: `src/components/settings/SearchDiagnosticsPanel.tsx`
- Optional Modify: `src/components/settings/pages/BlogTaxonomySettingsPage.tsx`
- Optional Modify: `src/components/settings/pages/LuoguSettingsPages.tsx`

- [ ] **Step 1: Migrate SearchDiagnosticsPanel surfaces**

Use `Panel`, `PanelHeader`, `PanelBody`, `PanelTitle`, and shared `Button` sizes for diagnostic sections where they replace repeated container classes. Keep diagnostic data loading, copy behavior, and search provider logic unchanged.

Use imports:

```tsx
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/common/Panel"
```

- [ ] **Step 2: Only touch legacy settings pages if they have local UI debt**

For `BlogTaxonomySettingsPage.tsx` and `LuoguSettingsPages.tsx`, migrate only obvious repeated button or panel shell class recipes. Do not change Settings v2 primitives or page rhythm.

- [ ] **Step 3: Run settings checks**

Run:

```powershell
pnpm.cmd vitest run src/components/settings/settingsRenderGuards.test.ts
pnpm.cmd tsc --noEmit
```

Expected:

```text
settingsRenderGuards tests pass.
No TypeScript errors from settings files.
```

- [ ] **Step 4: Commit**

Stage only files actually changed:

```powershell
git add -- src/components/settings/SearchDiagnosticsPanel.tsx
git diff --cached --name-only
git commit -m "refactor(ui): align settings diagnostics surfaces"
```

If optional legacy settings files changed, include them explicitly in `git add --`.

---

### Task 9: AI Shell-Only Migration

**Files:**
- Modify: `src/components/ai/AiSidebar.tsx`

- [ ] **Step 1: Locate shell-only regions**

Use CodeGraph or targeted search for imports and UI shell areas:

```powershell
rg "@/components/ui/(button|dialog|icon-button|toolbar-button)" src/components/ai/AiSidebar.tsx -n
rg "DialogContent|DialogFooter|Button|toolbar|header|empty|diagnostic" src/components/ai/AiSidebar.tsx -n
```

Allowed edits:

- Top bar buttons.
- Toolbar buttons.
- Dialog shells and footers.
- Panel containers.
- Empty or diagnostic shell states.

Forbidden edits:

- Message rendering.
- Virtualized list.
- Streaming state.
- Markdown rendering or cache.
- Citation decoration.
- Research Engine calls.

- [ ] **Step 2: Apply shell-only shared controls**

Use `Button`, `IconButton`, `ToolbarButton`, `Panel`, or `AppDialog` only where the edit is outside the forbidden regions. Keep all handler names, state variables, and async behavior unchanged.

Example shell button replacement:

```tsx
<ToolbarButton type="button" aria-label="打开诊断" onClick={openDiagnostics}>
  <Activity aria-hidden="true" />
</ToolbarButton>
```

If the existing handler name is different, use the existing handler name. Do not introduce new AI state.

- [ ] **Step 3: Run typecheck**

Run:

```powershell
pnpm.cmd tsc --noEmit
```

Expected:

```text
No TypeScript errors from AiSidebar.
```

- [ ] **Step 4: Commit AI shell changes separately**

Run:

```powershell
git add -- src/components/ai/AiSidebar.tsx
git diff --cached --name-only
git commit -m "refactor(ui): align ai shell controls"
```

Expected staged files:

```text
src/components/ai/AiSidebar.tsx
```

---

### Task 10: Full Verification and Visual Smoke

**Files:**
- No code changes expected.

- [ ] **Step 1: Run full static checks**

Run:

```powershell
pnpm.cmd tsc --noEmit
pnpm.cmd build
```

Expected:

```text
Typecheck passes.
Production build completes.
```

- [ ] **Step 2: Start dev app for visual smoke**

Run:

```powershell
pnpm.cmd tauri dev
```

Expected:

```text
Vite dev server starts and the Tauri app opens.
```

- [ ] **Step 3: Smoke test protected and migrated areas**

Manually inspect:

- Settings v2 Appearance page.
- Settings v2 import/export theme dialogs.
- Tag Manager shell, root column, group column, detail panel.
- Tag Picker dialog, including drag and resize.
- File Tree actions.
- Open note tabs.
- Main editor toolbar.
- Search diagnostics panel.
- AI Sidebar shell controls only.

Expected:

```text
Settings v2 density and hierarchy remain stable.
Tag Picker remains draggable and resizable.
Tag Manager drag, resize, selection clear, filters, and debug actions still work.
AI message rendering and streaming behavior are not part of this branch's UI changes.
```

- [ ] **Step 4: Record final status**

Run:

```powershell
git status --short -- . ":(exclude)notes/**"
git log --oneline -8
```

Expected:

```text
No uncommitted implementation changes remain unless intentionally reported.
Recent commits show the foundation, common, feature sweep, AI shell, and verification work.
```

---

## Completion Notes

Before final handoff:

- Report all commits created.
- Report exact validation commands and results.
- Report any visual smoke gaps.
- Report whether Settings v2 changed visually.
- Report whether AI files were touched and confirm changes stayed shell-only.
