# UI Primitives & Design Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a maintainable UI primitive and design-token layer under `src/components/ui`, then use Settings v2 as the full pilot while migrating only low-risk App/editor/tag-manager controls.

**Architecture:** Keep `src/components/ui` as the only design-system entry. Add semantic token aliases in the existing CSS variable layer, strengthen base components around those tokens, then introduce composed components for navigation, lists, toolbar controls, and settings rows. Settings v2 should consume the shared layer and retire its local primitives over time.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, class-variance-authority, Radix UI via `radix-ui`, lucide-react, existing `cn()` helper.

## Global Constraints

- Do not rewrite the theme resolver.
- Do not redesign the whole app.
- Do not migrate all legacy controls in one pass.
- Do not use `Button` for navigation items, list items, dropdown items, or settings rows.
- Do not modify `notes/**`.
- Run status with `git status --short -- . ":(exclude)notes/**"`.
- Stage with exact paths; do not use `git add .`.
- Verify with `pnpm build` after each task.

---

## File Structure

Create or modify these files:

- Modify: `src/index.css`
  - Owns global CSS custom properties for semantic interaction, shape, spacing, and motion tokens.
- Modify: `src/components/ui/button.tsx`
  - Keeps action-button variants only; consumes semantic token aliases.
- Modify: `src/components/ui/icon-button.tsx`
  - Keeps icon-only action semantics and required `aria-label`.
- Modify: `src/components/ui/dropdown-menu.tsx`
  - Keeps Radix dropdown primitives, but exposes tokenized menu content and item styles.
- Modify: `src/components/ui/switch.tsx`
  - Keeps switch semantics; consumes shared focus, disabled, motion, and control radius tokens.
- Modify: `src/components/ui/segmented-control.tsx`
  - Keeps radiogroup semantics; consumes selected, hover, focus, and reduced-motion tokens.
- Modify: `src/components/ui/list-item.tsx`
  - Turns the existing list item into the shared composed list primitive.
- Create: `src/components/ui/nav-item.tsx`
  - New composed navigation item with `selected`, icon, label, description, and aria-current support.
- Create: `src/components/ui/toolbar-button.tsx`
  - New composed toolbar button for compact editor/app tools.
- Create: `src/components/ui/setting-row.tsx`
  - New composed setting row layout used by Settings v2 and later settings-like pages.
- Modify: `src/components/ui/index.ts`
  - Exports new composed components.
- Modify: `src/components/settings/v2/components/SettingsSidebar.tsx`
  - Replaces sidebar category `Button` usage with `NavItem`.
- Modify: `src/components/settings/v2/primitives/SettingRow.tsx`
  - Converts the Settings v2 wrapper into a temporary adapter over shared `SettingRow`.
- Modify: `src/components/settings/v2/primitives/SettingsButton.tsx`
  - Keeps a temporary adapter over `Button`, with no private state styling.
- Modify: `src/components/settings/v2/primitives/SettingsDialog.tsx`
  - Keeps a temporary adapter over shared `Dialog` / `IconButton`, with fewer private classes.
- Modify: `src/components/settings/v2/settingsV2.css`
  - Removes duplicated button/nav/list/row state rules that are replaced by shared components.
- Modify: `src/App.tsx`
  - Converts one obvious icon/action button outside Settings to a shared action primitive.
- Modify: `src/components/editor/MarkdownEditor.tsx`
  - Converts one compact editor toolbar action to `ToolbarButton`.
- Modify: `src/components/tag-manager/TagManagerShell.tsx`
  - Converts one icon-only tag-manager action to `IconButton` or one compact action to `Button`.

---

### Task 1: Semantic Token Layer

**Files:**
- Modify: `src/index.css`

**Interfaces:**
- Produces CSS variables consumed by later tasks:
  - `--ui-space-1`, `--ui-space-2`, `--ui-space-3`, `--ui-space-4`, `--ui-space-5`
  - `--ui-radius-control`, `--ui-radius-item`, `--ui-radius-panel`, `--ui-radius-dialog`
  - `--ui-border-subtle`, `--ui-border-control`, `--ui-border-strong`
  - `--ui-state-hover`, `--ui-state-active`, `--ui-state-selected`, `--ui-state-selected-foreground`
  - `--ui-focus-ring`, `--ui-focus-ring-soft`
  - `--ui-disabled-opacity`, `--ui-disabled-foreground`
  - `--ui-motion-duration-fast`, `--ui-motion-duration-base`, `--ui-motion-ease-standard`, `--ui-motion-ease-out`
  - `--ui-motion-enter-y`, `--ui-motion-enter-scale`
- Consumes existing variables already present in `src/index.css`: `--color-background-hover`, `--color-background-active`, `--color-background-selected`, `--color-ring-focus`, `--border`, `--input`, `--radius`, and `--motion-*`.

- [ ] **Step 1: Add token aliases to `:root`**

Add this block near the existing `--motion-*` variables in `:root`:

```css
    --ui-space-1: 0.25rem;
    --ui-space-2: 0.375rem;
    --ui-space-3: 0.5rem;
    --ui-space-4: 0.75rem;
    --ui-space-5: 1rem;
    --ui-radius-control: var(--radius-md);
    --ui-radius-item: var(--radius-sm);
    --ui-radius-panel: var(--radius-lg);
    --ui-radius-dialog: var(--radius-xl);
    --ui-border-subtle: var(--color-border-subtle, var(--border-subtle));
    --ui-border-control: var(--color-border-control, var(--input));
    --ui-border-strong: var(--color-border-strong, var(--separator-strong));
    --ui-state-hover: var(--color-background-hover, var(--hover-bg));
    --ui-state-active: var(--color-background-active, var(--selected-bg));
    --ui-state-selected: var(--color-background-selected, var(--selected-bg));
    --ui-state-selected-foreground: var(--color-text-primary, var(--foreground));
    --ui-focus-ring: var(--color-ring-focus, var(--ring));
    --ui-focus-ring-soft: color-mix(in oklch, var(--ui-focus-ring) 24%, transparent);
    --ui-disabled-opacity: 0.52;
    --ui-disabled-foreground: var(--color-text-disabled, var(--text-disabled));
    --ui-motion-duration-fast: var(--motion-duration-fast);
    --ui-motion-duration-base: var(--motion-duration-base);
    --ui-motion-ease-standard: var(--motion-ease-standard);
    --ui-motion-ease-out: var(--motion-ease-out);
    --ui-motion-enter-y: var(--motion-dropdown-y);
    --ui-motion-enter-scale: var(--motion-popover-scale);
```

- [ ] **Step 2: Add reduced-motion aliases**

Inside the existing `@media (prefers-reduced-motion: reduce)` block, add:

```css
    --ui-motion-duration-fast: 0ms;
    --ui-motion-duration-base: 0ms;
    --ui-motion-enter-y: 0px;
    --ui-motion-enter-scale: 1;
```

- [ ] **Step 3: Verify build**

Run:

```powershell
pnpm build
```

Expected: TypeScript and Vite build complete without errors.

- [ ] **Step 4: Commit**

```powershell
git status --short -- . ":(exclude)notes/**"
git add -- src/index.css
git diff --cached --name-only
git commit -m "feat: add ui semantic tokens"
```

Expected staged file list:

```text
src/index.css
```

---

### Task 2: Base Component State Cleanup

**Files:**
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/icon-button.tsx`
- Modify: `src/components/ui/dropdown-menu.tsx`
- Modify: `src/components/ui/switch.tsx`
- Modify: `src/components/ui/segmented-control.tsx`
- Modify: `src/components/ui/index.ts` only if export order needs to stay grouped

**Interfaces:**
- Consumes Task 1 CSS variables.
- Produces stable base semantics:
  - `Button` remains action-only.
  - `IconButton` requires `aria-label`.
  - `DropdownMenuItem` and `DropdownMenuCheckboxItem` own menu item states.
  - `Switch` owns switch states.
  - `SegmentedControl` owns radiogroup states.

- [ ] **Step 1: Update Button state tokens**

In `src/components/ui/button.tsx`, keep the existing `buttonVariants` shape, but replace hard-coded hover/focus/disabled state fragments with tokenized fragments equivalent to:

```tsx
const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[var(--ui-radius-control)] border border-transparent font-medium whitespace-nowrap outline-none transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)] focus-visible:ring-[3px] focus-visible:ring-[var(--ui-focus-ring-soft)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:text-[var(--ui-disabled-foreground)] disabled:opacity-[var(--ui-disabled-opacity)] active:scale-[var(--motion-scale-pressed)]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "border-[var(--ui-border-control)] bg-secondary text-secondary-foreground hover:bg-[var(--ui-state-hover)]",
        outline: "border-[var(--ui-border-control)] bg-transparent text-foreground hover:bg-[var(--ui-state-hover)]",
        ghost: "bg-transparent text-foreground hover:bg-[var(--ui-state-hover)]",
        danger: "bg-destructive text-white hover:bg-destructive/90",
        link: "h-auto border-0 bg-transparent p-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3 text-xs",
        compact: "h-7 px-2.5 text-xs",
        sm: "h-7 px-2 text-xs",
        lg: "h-9 px-4 text-sm",
        icon: "size-8 p-0",
        "icon-xs": "size-6 p-0",
        "icon-sm": "size-7 p-0",
        "icon-lg": "size-9 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)
```

Preserve any existing variants that are present in the file but not shown here by mapping their state colors to `--ui-state-hover`, `--ui-state-active`, or existing semantic color variables.

- [ ] **Step 2: Keep IconButton thin**

Verify `src/components/ui/icon-button.tsx` still has this shape:

```tsx
type ButtonProps = React.ComponentProps<typeof Button>

export interface IconButtonProps extends Omit<ButtonProps, "size"> {
  "aria-label": string
  size?: Extract<ButtonProps["size"], "icon" | "icon-xs" | "icon-sm" | "icon-lg">
}

function IconButton({
  size = "icon",
  variant = "ghost",
  ...props
}: IconButtonProps) {
  return <Button data-slot="icon-button" variant={variant} size={size} {...props} />
}
```

Do not add layout logic to `IconButton`.

- [ ] **Step 3: Tokenize dropdown menu content and items**

In `src/components/ui/dropdown-menu.tsx`, update class strings so the main state fragments use:

```tsx
"z-80 min-w-36 overflow-hidden rounded-[var(--ui-radius-panel)] border border-[var(--ui-border-subtle)] bg-popover p-1 text-popover-foreground shadow-lg outline-none duration-[var(--ui-motion-duration-base)] ease-[var(--ui-motion-ease-out)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-[var(--ui-motion-enter-y)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:slide-out-to-top-[var(--ui-motion-enter-y)]"
```

For `DropdownMenuItem`, use:

```tsx
"relative flex min-h-7 cursor-pointer select-none items-center gap-2 rounded-[var(--ui-radius-item)] px-2 py-1.5 text-xs outline-none transition-[background-color,color,opacity] duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)] hover:bg-[var(--ui-state-hover)] focus:bg-[var(--ui-state-hover)] data-[highlighted]:bg-[var(--ui-state-hover)] data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:text-[var(--ui-disabled-foreground)] data-[disabled]:opacity-[var(--ui-disabled-opacity)] data-[inset=true]:pl-7"
```

For `DropdownMenuCheckboxItem`, use `data-[state=checked]:bg-[var(--ui-state-selected)]`.

- [ ] **Step 4: Tokenize Switch**

In `src/components/ui/switch.tsx`, keep `role="switch"` and `aria-checked`. Update visual classes to use:

```tsx
"relative inline-flex h-5 w-8 shrink-0 cursor-pointer items-center rounded-full border border-[var(--ui-border-control)] bg-muted/80 outline-none transition-[background-color,border-color,box-shadow,opacity] duration-[var(--ui-motion-duration-base)] ease-[var(--ui-motion-ease-standard)] hover:border-[var(--ui-focus-ring)] focus-visible:ring-[3px] focus-visible:ring-[var(--ui-focus-ring-soft)] disabled:cursor-not-allowed disabled:opacity-[var(--ui-disabled-opacity)] data-[state=checked]:border-primary/70 data-[state=checked]:bg-primary"
```

- [ ] **Step 5: Tokenize SegmentedControl**

In `src/components/ui/segmented-control.tsx`, keep the current radiogroup behavior. Update container and item classes to:

```tsx
className={cn("inline-flex items-center gap-0.5 rounded-[var(--ui-radius-control)] bg-muted p-0.5", className)}
```

and:

```tsx
"inline-flex h-6 min-w-0 items-center justify-center rounded-[var(--ui-radius-item)] px-2 text-xs font-medium text-muted-foreground outline-none transition-[background-color,color,box-shadow,opacity] duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)] hover:bg-[var(--ui-state-hover)] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-[var(--ui-focus-ring-soft)] disabled:cursor-not-allowed disabled:opacity-[var(--ui-disabled-opacity)] data-[state=checked]:bg-[var(--ui-state-selected)] data-[state=checked]:text-[var(--ui-state-selected-foreground)] data-[state=checked]:shadow-sm"
```

- [ ] **Step 6: Verify build**

Run:

```powershell
pnpm build
```

Expected: TypeScript and Vite build complete without errors.

- [ ] **Step 7: Commit**

```powershell
git status --short -- . ":(exclude)notes/**"
git add -- src/components/ui/button.tsx src/components/ui/icon-button.tsx src/components/ui/dropdown-menu.tsx src/components/ui/switch.tsx src/components/ui/segmented-control.tsx src/components/ui/index.ts
git diff --cached --name-only
git commit -m "feat: align base ui component states"
```

Expected staged file list contains only the files listed in this task that changed.

---

### Task 3: Composed UI Components

**Files:**
- Modify: `src/components/ui/list-item.tsx`
- Create: `src/components/ui/nav-item.tsx`
- Create: `src/components/ui/toolbar-button.tsx`
- Create: `src/components/ui/setting-row.tsx`
- Modify: `src/components/ui/index.ts`

**Interfaces:**
- Produces:
  - `ListItem(props: React.ComponentProps<"div"> & { interactive?: boolean; selected?: boolean })`
  - `NavItem(props: NavItemProps)`
  - `ToolbarButton(props: ToolbarButtonProps)`
  - `SettingRow(props: SettingRowProps)`
- Consumed by Task 4 Settings v2 migration.

- [ ] **Step 1: Replace `ListItem` with shared composed container**

Set `src/components/ui/list-item.tsx` to:

```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

export interface ListItemProps extends React.ComponentProps<"div"> {
  interactive?: boolean
  selected?: boolean
}

function ListItem({
  className,
  interactive = false,
  selected = false,
  ...props
}: ListItemProps) {
  return (
    <div
      data-slot="list-item"
      data-interactive={interactive ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
      className={cn(
        "rounded-[var(--ui-radius-item)] border border-transparent transition-[background-color,border-color,color,opacity] duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)]",
        interactive && "cursor-pointer hover:bg-[var(--ui-state-hover)]",
        selected && "bg-[var(--ui-state-selected)] text-[var(--ui-state-selected-foreground)]",
        className,
      )}
      {...props}
    />
  )
}

export { ListItem }
```

- [ ] **Step 2: Create `NavItem`**

Create `src/components/ui/nav-item.tsx`:

```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

export interface NavItemProps extends Omit<React.ComponentProps<"button">, "children"> {
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  label: React.ReactNode
  description?: React.ReactNode
  selected?: boolean
}

function NavItem({
  icon: Icon,
  label,
  description,
  selected = false,
  className,
  type = "button",
  ...props
}: NavItemProps) {
  return (
    <button
      type={type}
      data-slot="nav-item"
      data-selected={selected ? "true" : undefined}
      aria-current={selected ? "page" : props["aria-current"]}
      className={cn(
        "group/nav-item relative flex w-full min-w-0 items-center gap-2 rounded-[var(--ui-radius-item)] px-2.5 py-2 text-left text-xs text-muted-foreground outline-none transition-[background-color,color,box-shadow,opacity] duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)] hover:bg-[var(--ui-state-hover)] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-[var(--ui-focus-ring-soft)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-[var(--ui-disabled-opacity)] data-[selected=true]:bg-[var(--ui-state-selected)] data-[selected=true]:text-[var(--ui-state-selected-foreground)]",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary opacity-0 transition-opacity duration-[var(--ui-motion-duration-fast)] group-data-[selected=true]/nav-item:opacity-100"
      />
      {Icon ? <Icon aria-hidden className="size-4 shrink-0" /> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {description ? <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{description}</span> : null}
      </span>
    </button>
  )
}

export { NavItem }
```

- [ ] **Step 3: Create `ToolbarButton`**

Create `src/components/ui/toolbar-button.tsx`:

```tsx
import * as React from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ButtonProps = React.ComponentProps<typeof Button>

export interface ToolbarButtonProps extends Omit<ButtonProps, "variant" | "size"> {
  selected?: boolean
  size?: Extract<ButtonProps["size"], "icon-xs" | "icon-sm" | "compact">
}

function ToolbarButton({
  selected = false,
  size = "icon-sm",
  className,
  ...props
}: ToolbarButtonProps) {
  return (
    <Button
      data-slot="toolbar-button"
      data-selected={selected ? "true" : undefined}
      variant="ghost"
      size={size}
      className={cn(
        "rounded-[var(--ui-radius-item)] text-muted-foreground hover:bg-[var(--ui-state-hover)] hover:text-foreground data-[selected=true]:bg-[var(--ui-state-selected)] data-[selected=true]:text-[var(--ui-state-selected-foreground)]",
        className,
      )}
      aria-pressed={selected || props["aria-pressed"]}
      {...props}
    />
  )
}

export { ToolbarButton }
```

- [ ] **Step 4: Create shared `SettingRow`**

Create `src/components/ui/setting-row.tsx`:

```tsx
import type { ReactNode } from "react"

import { ListItem } from "@/components/ui/list-item"
import { cn } from "@/lib/utils"

export type SettingRowDensity = "normal" | "compact"
export type SettingRowLayout = "split" | "stacked" | "nested"

export interface SettingRowProps {
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  density?: SettingRowDensity
  layout?: SettingRowLayout
  className?: string
  contentClassName?: string
  controlClassName?: string
}

function SettingRow({
  title,
  description,
  children,
  density = "normal",
  layout = "split",
  className,
  contentClassName,
  controlClassName,
}: SettingRowProps) {
  return (
    <ListItem
      className={cn(
        "grid gap-3 border-[var(--ui-border-subtle)] px-4 py-3",
        density === "compact" && "px-3 py-2",
        layout === "split" && "grid-cols-[minmax(0,1fr)_auto] items-center",
        layout === "stacked" && "grid-cols-1",
        layout === "nested" && "ml-4 grid-cols-[minmax(0,1fr)_auto] items-center border-l pl-4",
        className,
      )}
      data-density={density}
      data-layout={layout}
    >
      <div className={cn("min-w-0", contentClassName)}>
        <div className="text-xs font-medium text-foreground">{title}</div>
        {description ? <div className="mt-1 text-xs/relaxed text-muted-foreground">{description}</div> : null}
      </div>
      {children ? <div className={cn("flex min-w-0 items-center justify-end gap-2", controlClassName)}>{children}</div> : null}
    </ListItem>
  )
}

export { SettingRow }
```

- [ ] **Step 5: Export new components**

Append to `src/components/ui/index.ts`:

```ts
export * from "@/components/ui/nav-item"
export * from "@/components/ui/setting-row"
export * from "@/components/ui/toolbar-button"
```

- [ ] **Step 6: Verify build**

Run:

```powershell
pnpm build
```

Expected: TypeScript and Vite build complete without errors.

- [ ] **Step 7: Commit**

```powershell
git status --short -- . ":(exclude)notes/**"
git add -- src/components/ui/list-item.tsx src/components/ui/nav-item.tsx src/components/ui/toolbar-button.tsx src/components/ui/setting-row.tsx src/components/ui/index.ts
git diff --cached --name-only
git commit -m "feat: add composed ui primitives"
```

Expected staged file list:

```text
src/components/ui/index.ts
src/components/ui/list-item.tsx
src/components/ui/nav-item.tsx
src/components/ui/setting-row.tsx
src/components/ui/toolbar-button.tsx
```

---

### Task 4: Settings v2 Pilot Migration

**Files:**
- Modify: `src/components/settings/v2/components/SettingsSidebar.tsx`
- Modify: `src/components/settings/v2/primitives/SettingRow.tsx`
- Modify: `src/components/settings/v2/primitives/SettingsButton.tsx`
- Modify: `src/components/settings/v2/primitives/SettingsDialog.tsx`
- Modify: `src/components/settings/v2/settingsV2.css`

**Interfaces:**
- Consumes Task 3:
  - `NavItem`
  - `SettingRow as UiSettingRow`
  - `Button`
  - `IconButton`
- Produces Settings v2 as the first complete consumer of shared primitives.

- [ ] **Step 1: Replace settings sidebar nav buttons**

In `src/components/settings/v2/components/SettingsSidebar.tsx`, replace the category `Button` import usage with `NavItem`.

Use this import shape:

```tsx
import { Button } from "@/components/ui/button";
import { NavItem } from "@/components/ui/nav-item";
import { cn } from "@/lib/utils";
```

Keep the back button as `Button`, because it is an action. Replace the mapped category button with:

```tsx
<NavItem
  key={group.id}
  icon={Icon}
  label={group.label}
  selected={isActive}
  className="settings-v2-nav-item"
  onClick={() => onOpenGroup(group.id)}
>
</NavItem>
```

If TypeScript rejects children because `NavItem` omits `children`, remove the closing children form and use:

```tsx
<NavItem
  key={group.id}
  icon={Icon}
  label={group.label}
  selected={isActive}
  className="settings-v2-nav-item"
  onClick={() => onOpenGroup(group.id)}
/>
```

Remove manual active rail markup from the sidebar map.

- [ ] **Step 2: Convert Settings v2 SettingRow adapter**

In `src/components/settings/v2/primitives/SettingRow.tsx`, replace the body with:

```tsx
import type { ReactNode } from "react";

import { SettingRow as UiSettingRow } from "@/components/ui/setting-row";
import { cn } from "@/lib/utils";

export type SettingRowDensity = "normal" | "compact";
export type SettingRowVariant = "default" | "grid" | "nested" | "compact";

export function SettingRow({
  title,
  description,
  children,
  density = "normal",
  variant,
  className,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  density?: SettingRowDensity;
  variant?: SettingRowVariant;
  className?: string;
}) {
  const resolvedVariant = variant ?? (density === "compact" ? "compact" : "grid");
  const layout = resolvedVariant === "default" || resolvedVariant === "compact" ? "stacked" : resolvedVariant === "nested" ? "nested" : "split";

  return (
    <UiSettingRow
      title={title}
      description={description}
      density={density}
      layout={layout}
      className={cn("settings-v2-row", className)}
      contentClassName="settings-v2-row-copy"
      controlClassName="settings-v2-row-control"
    >
      {children}
    </UiSettingRow>
  );
}
```

- [ ] **Step 3: Simplify SettingsButton adapter**

In `src/components/settings/v2/primitives/SettingsButton.tsx`, keep it as a compatibility wrapper but remove variant-specific private classes:

```tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SettingsButtonVariant = "secondary" | "ghost" | "danger";

export interface SettingsButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: SettingsButtonVariant;
}

export function SettingsButton({
  children,
  className,
  variant = "secondary",
  type = "button",
  ...props
}: SettingsButtonProps) {
  const buttonVariant = variant === "danger" ? "danger" : variant === "ghost" ? "ghost" : "secondary";

  return (
    <Button
      type={type}
      variant={buttonVariant}
      size="compact"
      className={cn("settings-v2-button", className)}
      {...props}
    >
      {children}
    </Button>
  );
}
```

- [ ] **Step 4: Keep SettingsDialog as a thin dialog adapter**

In `src/components/settings/v2/primitives/SettingsDialog.tsx`, keep Radix dialog behavior through shared `Dialog`. The header close button should remain `IconButton` with `aria-label="关闭"`. Remove any button state classes that duplicate shared `IconButton` states. The close line should be:

```tsx
<IconButton type="button" className="settings-v2-dialog-close" aria-label="关闭" onClick={onClose}>
  <X aria-hidden="true" />
</IconButton>
```

- [ ] **Step 5: Remove duplicated Settings v2 state CSS**

In `src/components/settings/v2/settingsV2.css`, remove rules whose only purpose is duplicating shared states:

```css
.settings-v2-button--ghost
.settings-v2-button--danger
.settings-v2-button--secondary
.settings-v2-nav-active-rail
.settings-v2-nav-active-rail-on
.settings-v2-nav-item-active
```

Keep layout rules such as sidebar width, page spacing, search layout, grid layout, dialog sizing, and scroll containers.

- [ ] **Step 6: Verify build**

Run:

```powershell
pnpm build
```

Expected: TypeScript and Vite build complete without errors.

- [ ] **Step 7: Manual UI check**

Run:

```powershell
pnpm dev
```

Open the app in the browser at `http://localhost:1420` and check:

- Settings opens.
- Sidebar text is left-aligned.
- Active settings group has selected styling.
- Back button still closes settings.
- Setting rows do not overlap controls.
- Dialog close button remains reachable by keyboard.

- [ ] **Step 8: Commit**

```powershell
git status --short -- . ":(exclude)notes/**"
git add -- src/components/settings/v2/components/SettingsSidebar.tsx src/components/settings/v2/primitives/SettingRow.tsx src/components/settings/v2/primitives/SettingsButton.tsx src/components/settings/v2/primitives/SettingsDialog.tsx src/components/settings/v2/settingsV2.css
git diff --cached --name-only
git commit -m "refactor: migrate settings v2 to shared ui primitives"
```

Expected staged file list contains only files listed in this task that changed.

---

### Task 5: Low-Risk Cross-App Validation

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/editor/MarkdownEditor.tsx`
- Modify: `src/components/tag-manager/TagManagerShell.tsx`
- Do not modify `src/components/ai/notexWorkbench.css` unless the user explicitly asks, because it currently has unrelated local changes.

**Interfaces:**
- Consumes Task 3:
  - `ToolbarButton`
  - `IconButton`
  - `Button`
  - `SegmentedControl`
- Produces a small proof that the shared layer works outside Settings v2 without broad migration.

- [ ] **Step 1: Confirm low-risk usages**

Run:

```powershell
rg -n "<button|<Button|DropdownMenu|SegmentedControl|settings-v2-button" src/App.tsx src/components/editor/MarkdownEditor.tsx src/components/tag-manager/TagManagerShell.tsx
```

Expected: a list of candidate inline buttons and existing shared component usage.

- [ ] **Step 2: Limit the conversion set**

Convert these three tightly scoped surfaces:

- The top-right window control group in `src/App.tsx`
- The markdown toolbar action loop in `src/components/editor/MarkdownEditor.tsx`
- The tag-manager close action in `src/components/tag-manager/TagManagerShell.tsx`

Do not migrate navigation rows, file-tree rows, or complex dropdowns in this task.

- [ ] **Step 3: Convert MarkdownEditor toolbar buttons to `ToolbarButton`**

In `src/components/editor/MarkdownEditor.tsx`, import:

```tsx
import { ToolbarButton } from "@/components/ui/toolbar-button"
```

Inside `MarkdownEditorToolbar`, replace the mapped toolbar button with:

```tsx
<ToolbarButton
  key={action.id}
  type="button"
  title={action.title}
  aria-label={action.title}
  disabled={disabled}
  size="compact"
  className="markdown-toolbar-button min-w-6 px-1.5 font-semibold"
  onMouseDown={(event) => {
    event.preventDefault()
    if (disabled) return
    onAction?.(action.id)
  }}
>
  {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : action.label}
</ToolbarButton>
```

- [ ] **Step 4: Convert the tag-manager close action to `IconButton`**

In `src/components/tag-manager/TagManagerShell.tsx`, replace the header close button with:

```tsx
<IconButton data-tag-manager-interactive="true" type="button" aria-label="关闭标签管理器" onClick={onClose}>
  <X className="h-4 w-4" aria-hidden="true" />
</IconButton>
```

Add or keep this import:

```tsx
import { IconButton } from "@/components/ui/icon-button"
```

- [ ] **Step 5: Convert App window controls to `ToolbarButton`**

In `src/App.tsx`, add:

```tsx
import { ToolbarButton } from "@/components/ui/toolbar-button"
```

Replace the three window-control buttons with:

```tsx
<ToolbarButton
  type="button"
  size="compact"
  className="h-6 w-8"
  onClick={() => void handleMinimizeWindow()}
  title="最小化"
  aria-label="最小化窗口"
>
  <Minus className="h-3.5 w-3.5" aria-hidden="true" />
</ToolbarButton>
<ToolbarButton
  type="button"
  size="compact"
  className="h-6 w-8"
  onClick={() => void handleToggleMaximizeWindow()}
  title="最大化 / 还原"
  aria-label="最大化或还原窗口"
>
  <Square className="h-3 w-3" aria-hidden="true" />
</ToolbarButton>
<ToolbarButton
  type="button"
  size="compact"
  className="h-6 w-8 hover:bg-red-500/85 hover:text-white focus-visible:ring-red-400/70"
  onClick={() => void handleCloseWindow()}
  title="关闭"
  aria-label="关闭窗口"
>
  <X className="h-3.5 w-3.5" aria-hidden="true" />
</ToolbarButton>
```

- [ ] **Step 6: Verify build**

Run:

```powershell
pnpm build
```

Expected: TypeScript and Vite build complete without errors.

- [ ] **Step 7: Manual UI check**

Run:

```powershell
pnpm dev
```

Open `http://localhost:1420` and check:

- Converted buttons still perform the same action.
- Icon-only buttons have accessible labels.
- Focus rings are visible with keyboard navigation.
- Toolbar density did not increase.
- No nearby text overlaps at narrow widths.

- [ ] **Step 8: Commit**

```powershell
git status --short -- . ":(exclude)notes/**"
git add -- src/App.tsx src/components/editor/MarkdownEditor.tsx src/components/tag-manager/TagManagerShell.tsx
git diff --cached --name-only
git commit -m "refactor: validate shared ui primitives in app surfaces"
```

Expected staged file list:

```text
src/App.tsx
src/components/editor/MarkdownEditor.tsx
src/components/tag-manager/TagManagerShell.tsx
```

---

## Final Verification

After all tasks are complete:

- [ ] Run:

```powershell
pnpm build
```

Expected: TypeScript and Vite build complete without errors.

- [ ] Run:

```powershell
git status --short -- . ":(exclude)notes/**"
```

Expected: no uncommitted files from this plan. Pre-existing unrelated changes may remain and should not be reverted.

- [ ] Manual pass in the running app:
  - Settings sidebar nav items are left-aligned.
  - Settings selected state is visually distinct but not accent-heavy.
  - Dropdowns animate without layout jumps.
  - Switch and segmented controls support keyboard focus.
  - Reduced motion mode removes visible movement while preserving state changes.
