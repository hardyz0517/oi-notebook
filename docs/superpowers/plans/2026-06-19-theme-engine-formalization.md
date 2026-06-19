# Theme Engine Formalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the existing Settings v2 theme code into an app-level Theme Engine while preserving the recently upgraded Settings UI.

**Architecture:** Move theme domain logic into `src/theme/**`, then introduce a provider/facade that owns storage, system-theme observation, document root application, and derived theme state. Keep `AppearanceSettingsPage` visual structure stable; its role remains editing theme state through existing props.

**Tech Stack:** React 19, TypeScript strict mode, Vite path alias `@/*`, existing Settings v2 primitives, browser `localStorage`, DOM root CSS custom properties.

---

## Global Constraints

- Do not redesign Settings Center or Appearance Settings.
- Do not rewrite `src/components/settings/v2/settingsV2.css`.
- Do not change Settings v2 JSX structure except import paths if needed.
- Do not touch AI behavior, `src/components/ai/AiSidebar.tsx`, `src/lib/aiWebSearch.ts`, or `src-tauri/src/ai.rs`.
- Do not modify `notes/**`.
- Run status with `git status --short -- . ":(exclude)notes/**"`.
- Stage exact paths only; do not use `git add .`.
- After any edit, print the full real contents of each edited file.
- Verify with `pnpm build` after each task.

---

## File Structure

Create these files:

- `src/theme/themeTypes.ts`
  - Owns app-level theme types. It starts as the moved content of `settingsThemeTypes.ts`.
- `src/theme/themePresets.ts`
  - Owns built-in presets and default theme state. It starts as the moved content of `settingsThemePresets.ts`.
- `src/theme/themeCodec.ts`
  - Owns `codex-theme-v1:` encode/decode/normalize logic. It starts as the moved content of `settingsThemeCodec.ts`.
- `src/theme/themeResolver.ts`
  - Owns CSS variable resolution. It starts as the moved content of `settingsThemeApply.ts`, renamed around app-level theme naming.
- `src/theme/themeStorage.ts`
  - Owns storage keys, safe reads/writes, legacy setting bridge, and initial state helpers.
- `src/theme/themeDom.ts`
  - Owns document root theme dataset/classes and CSS variable application helpers.
- `src/theme/ThemeProvider.tsx`
  - Owns React state, system theme listener, active theme derivation, side effects, and theme actions.
- `src/theme/index.ts`
  - Public export surface for App and Settings.

Modify these files:

- `src/components/settings/v2/theme/settingsThemeTypes.ts`
  - Convert to compatibility re-export from `@/theme`.
- `src/components/settings/v2/theme/settingsThemePresets.ts`
  - Convert to compatibility re-export from `@/theme`.
- `src/components/settings/v2/theme/settingsThemeCodec.ts`
  - Convert to compatibility re-export from `@/theme`.
- `src/components/settings/v2/theme/settingsThemeApply.ts`
  - Convert to compatibility re-export from `@/theme`.
- `src/components/settings/v2/pages/AppearanceSettingsPage.tsx`
  - Prefer direct imports from `@/theme` only after compatibility re-exports are in place. Do not alter rendered UI.
- `src/App.tsx`
  - Replace direct theme storage/DOM responsibilities with `useThemeEngine` or provider-backed values. Keep non-theme settings in App for this phase.

---

## Task 1: Move Theme Domain Files Behind A Stable App Boundary

**Files:**
- Create: `src/theme/themeTypes.ts`
- Create: `src/theme/themePresets.ts`
- Create: `src/theme/themeCodec.ts`
- Create: `src/theme/themeResolver.ts`
- Create: `src/theme/index.ts`
- Modify: `src/components/settings/v2/theme/settingsThemeTypes.ts`
- Modify: `src/components/settings/v2/theme/settingsThemePresets.ts`
- Modify: `src/components/settings/v2/theme/settingsThemeCodec.ts`
- Modify: `src/components/settings/v2/theme/settingsThemeApply.ts`

- [ ] **Step 1: Copy theme types into `src/theme/themeTypes.ts`**

Create `src/theme/themeTypes.ts` with:

```ts
export type SettingsThemeVariant = "light" | "dark" | "system";

export interface SettingsThemeV1Payload {
  codeThemeId: string;
  variant: SettingsThemeVariant;
  theme: {
    accent: string;
    contrast: number;
    fonts: {
      ui: string | null;
      code: string | null;
    };
    ink: string;
    opaqueWindows: boolean;
    surface: string;
    semanticColors: {
      diffAdded: string;
      diffRemoved: string;
      skill: string;
    };
  };
}

export interface SettingsThemeState {
  mode: SettingsThemeVariant;
  light: SettingsThemeV1Payload;
  dark: SettingsThemeV1Payload;
}
```

- [ ] **Step 2: Copy presets into `src/theme/themePresets.ts`**

Copy the full current contents of `src/components/settings/v2/theme/settingsThemePresets.ts` into `src/theme/themePresets.ts`.

Change its first import from:

```ts
import type { SettingsThemeState, SettingsThemeV1Payload } from "./settingsThemeTypes";
```

to:

```ts
import type { SettingsThemeState, SettingsThemeV1Payload } from "./themeTypes";
```

- [ ] **Step 3: Copy codec into `src/theme/themeCodec.ts`**

Copy the full current contents of `src/components/settings/v2/theme/settingsThemeCodec.ts` into `src/theme/themeCodec.ts`.

Change imports from:

```ts
import { CODEX_DARK_THEME, CODEX_LIGHT_THEME, DEFAULT_SETTINGS_THEME_STATE } from "./settingsThemePresets";
import type { SettingsThemeState, SettingsThemeV1Payload, SettingsThemeVariant } from "./settingsThemeTypes";
```

to:

```ts
import { CODEX_DARK_THEME, CODEX_LIGHT_THEME, DEFAULT_SETTINGS_THEME_STATE } from "./themePresets";
import type { SettingsThemeState, SettingsThemeV1Payload, SettingsThemeVariant } from "./themeTypes";
```

- [ ] **Step 4: Copy resolver into `src/theme/themeResolver.ts`**

Copy the full current contents of `src/components/settings/v2/theme/settingsThemeApply.ts` into `src/theme/themeResolver.ts`.

Change imports from:

```ts
import { CODEX_DARK_THEME } from "./settingsThemePresets";
import type { SettingsThemeV1Payload } from "./settingsThemeTypes";
```

to:

```ts
import { CODEX_DARK_THEME } from "./themePresets";
import type { SettingsThemeV1Payload } from "./themeTypes";
```

Keep the exported function name `getSettingsThemeCssVariables` for compatibility in this task.

- [ ] **Step 5: Add `src/theme/index.ts`**

Create `src/theme/index.ts` with:

```ts
export type { SettingsThemeState, SettingsThemeV1Payload, SettingsThemeVariant } from "./themeTypes";
export { CODEX_BUILTIN_THEME_PRESETS, CODEX_DARK_THEME, CODEX_LIGHT_THEME, DEFAULT_SETTINGS_THEME_STATE } from "./themePresets";
export { decodeSettingsThemeV1, encodeSettingsThemeV1, normalizeSettingsThemeState, normalizeSettingsThemeV1 } from "./themeCodec";
export { getSettingsThemeCssVariables } from "./themeResolver";
```

- [ ] **Step 6: Convert old theme files to compatibility re-exports**

Replace `src/components/settings/v2/theme/settingsThemeTypes.ts` with:

```ts
export type { SettingsThemeState, SettingsThemeV1Payload, SettingsThemeVariant } from "@/theme";
```

Replace `src/components/settings/v2/theme/settingsThemePresets.ts` with:

```ts
export { CODEX_BUILTIN_THEME_PRESETS, CODEX_DARK_THEME, CODEX_LIGHT_THEME, DEFAULT_SETTINGS_THEME_STATE } from "@/theme";
export type { SettingsThemePreset } from "@/theme/themePresets";
```

Replace `src/components/settings/v2/theme/settingsThemeCodec.ts` with:

```ts
export { decodeSettingsThemeV1, encodeSettingsThemeV1, normalizeSettingsThemeState, normalizeSettingsThemeV1 } from "@/theme";
```

Replace `src/components/settings/v2/theme/settingsThemeApply.ts` with:

```ts
export { getSettingsThemeCssVariables } from "@/theme";
```

- [ ] **Step 7: Verify build**

Run:

```powershell
pnpm build
```

Expected: TypeScript and Vite build complete without errors.

- [ ] **Step 8: Print changed files**

Run:

```powershell
Get-Content -Raw -Encoding UTF8 src\theme\themeTypes.ts
Get-Content -Raw -Encoding UTF8 src\theme\themePresets.ts
Get-Content -Raw -Encoding UTF8 src\theme\themeCodec.ts
Get-Content -Raw -Encoding UTF8 src\theme\themeResolver.ts
Get-Content -Raw -Encoding UTF8 src\theme\index.ts
Get-Content -Raw -Encoding UTF8 src\components\settings\v2\theme\settingsThemeTypes.ts
Get-Content -Raw -Encoding UTF8 src\components\settings\v2\theme\settingsThemePresets.ts
Get-Content -Raw -Encoding UTF8 src\components\settings\v2\theme\settingsThemeCodec.ts
Get-Content -Raw -Encoding UTF8 src\components\settings\v2\theme\settingsThemeApply.ts
```

- [ ] **Step 9: Commit**

```powershell
git status --short -- . ":(exclude)notes/**"
git add -- src/theme/themeTypes.ts src/theme/themePresets.ts src/theme/themeCodec.ts src/theme/themeResolver.ts src/theme/index.ts src/components/settings/v2/theme/settingsThemeTypes.ts src/components/settings/v2/theme/settingsThemePresets.ts src/components/settings/v2/theme/settingsThemeCodec.ts src/components/settings/v2/theme/settingsThemeApply.ts
git diff --cached --name-only
git commit -m "refactor(theme): promote theme domain boundary"
```

Expected staged files:

```text
src/components/settings/v2/theme/settingsThemeApply.ts
src/components/settings/v2/theme/settingsThemeCodec.ts
src/components/settings/v2/theme/settingsThemePresets.ts
src/components/settings/v2/theme/settingsThemeTypes.ts
src/theme/index.ts
src/theme/themeCodec.ts
src/theme/themePresets.ts
src/theme/themeResolver.ts
src/theme/themeTypes.ts
```

---

## Task 2: Extract Theme Storage And DOM Helpers

**Files:**
- Create: `src/theme/themeStorage.ts`
- Create: `src/theme/themeDom.ts`
- Modify: `src/theme/index.ts`
- Verify: `src/App.tsx` still owns state after this task

- [ ] **Step 1: Create `src/theme/themeStorage.ts`**

Create `src/theme/themeStorage.ts` with:

```ts
import { DEFAULT_SETTINGS_THEME_STATE } from "./themePresets";
import { normalizeSettingsThemeState } from "./themeCodec";
import type { SettingsThemeState, SettingsThemeVariant } from "./themeTypes";

export type AppTheme = SettingsThemeVariant;
export type ResolvedTheme = "dark" | "light";

export const THEME_STORAGE_KEY = "oi-notebook.theme";
export const ACCENT_COLOR_STORAGE_KEY = "oi-notebook.accentColor";
export const CONTRAST_STORAGE_KEY = "oi-notebook.appearance.contrast";
export const TRANSLUCENT_SIDEBAR_STORAGE_KEY = "oi-notebook.translucentSidebar";
export const SETTINGS_THEME_V1_STORAGE_KEY = "oi-notebook.settingsThemeV1";

function isAppTheme(value: string | null): value is AppTheme {
  return value === "dark" || value === "light" || value === "system";
}

function isHexColor(value: string | null): value is string {
  return /^#[0-9a-fA-F]{6}$/.test(value ?? "");
}

function clampNumberRange(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getStoredBoolean(storageKey: string, defaultValue: boolean): boolean {
  if (typeof window === "undefined") return defaultValue;
  const stored = window.localStorage.getItem(storageKey);
  if (stored === "true") return true;
  if (stored === "false") return false;
  return defaultValue;
}

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveThemeMode(mode: AppTheme, systemTheme: ResolvedTheme): ResolvedTheme {
  return mode === "system" ? systemTheme : mode;
}

export function readStoredAppTheme(): AppTheme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isAppTheme(stored) ? stored : "dark";
}

export function readStoredSettingsThemeState(): SettingsThemeState {
  if (typeof window === "undefined") return DEFAULT_SETTINGS_THEME_STATE;

  try {
    const rawValue = window.localStorage.getItem(SETTINGS_THEME_V1_STORAGE_KEY);
    if (rawValue) {
      return normalizeSettingsThemeState(JSON.parse(rawValue));
    }
  } catch {
    // Fall through to the legacy setting bridge.
  }

  const variant = readStoredAppTheme();
  const resolvedVariant = resolveThemeMode(variant, getSystemTheme());
  const initialState = normalizeSettingsThemeState({
    ...DEFAULT_SETTINGS_THEME_STATE,
    mode: variant,
  });

  const storedAccent = window.localStorage.getItem(ACCENT_COLOR_STORAGE_KEY);
  const rawContrast = window.localStorage.getItem(CONTRAST_STORAGE_KEY);
  const parsedContrast = rawContrast === null ? 56 : Number(rawContrast);
  const contrast = Number.isFinite(parsedContrast) ? clampNumberRange(parsedContrast, 0, 100) : 56;

  return {
    ...initialState,
    [resolvedVariant]: {
      ...initialState[resolvedVariant],
      theme: {
        ...initialState[resolvedVariant].theme,
        accent: isHexColor(storedAccent) ? storedAccent.toUpperCase() : "#0169CC",
        contrast,
        ink: resolvedVariant === "dark" ? "#F3F4F6" : "#0D0D0D",
        opaqueWindows: getStoredBoolean(TRANSLUCENT_SIDEBAR_STORAGE_KEY, false),
        surface: resolvedVariant === "dark" ? "#1D1D1D" : "#F7F7F5",
      },
    },
  };
}

export function writeStoredAppTheme(mode: AppTheme): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_STORAGE_KEY, mode);
}

export function writeStoredSettingsThemeState(state: SettingsThemeState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETTINGS_THEME_V1_STORAGE_KEY, JSON.stringify(state));
}
```

- [ ] **Step 2: Create `src/theme/themeDom.ts`**

Create `src/theme/themeDom.ts` with:

```ts
import type { CSSProperties } from "react";

import type { AppTheme, ResolvedTheme } from "./themeStorage";

export function applyThemeRootState(root: HTMLElement, mode: AppTheme, resolvedTheme: ResolvedTheme): void {
  root.dataset.theme = resolvedTheme;
  root.dataset.themeMode = mode;
  root.classList.toggle("dark", resolvedTheme === "dark");
}

export function applyThemeCssVariables(root: HTMLElement, variables: CSSProperties): () => void {
  const entries = Object.entries(variables);

  for (const [name, value] of entries) {
    root.style.setProperty(name, String(value));
  }

  return () => {
    for (const [name] of entries) {
      root.style.removeProperty(name);
    }
  };
}
```

- [ ] **Step 3: Update `src/theme/index.ts` exports**

Append these exports to `src/theme/index.ts`:

```ts
export type { AppTheme, ResolvedTheme } from "./themeStorage";
export {
  ACCENT_COLOR_STORAGE_KEY,
  CONTRAST_STORAGE_KEY,
  SETTINGS_THEME_V1_STORAGE_KEY,
  THEME_STORAGE_KEY,
  TRANSLUCENT_SIDEBAR_STORAGE_KEY,
  getSystemTheme,
  readStoredAppTheme,
  readStoredSettingsThemeState,
  resolveThemeMode,
  writeStoredAppTheme,
  writeStoredSettingsThemeState,
} from "./themeStorage";
export { applyThemeCssVariables, applyThemeRootState } from "./themeDom";
```

- [ ] **Step 4: Verify build**

Run:

```powershell
pnpm build
```

Expected: TypeScript and Vite build complete without errors.

- [ ] **Step 5: Print changed files**

Run:

```powershell
Get-Content -Raw -Encoding UTF8 src\theme\themeStorage.ts
Get-Content -Raw -Encoding UTF8 src\theme\themeDom.ts
Get-Content -Raw -Encoding UTF8 src\theme\index.ts
```

- [ ] **Step 6: Commit**

```powershell
git status --short -- . ":(exclude)notes/**"
git add -- src/theme/themeStorage.ts src/theme/themeDom.ts src/theme/index.ts
git diff --cached --name-only
git commit -m "refactor(theme): add storage and dom helpers"
```

Expected staged files:

```text
src/theme/index.ts
src/theme/themeDom.ts
src/theme/themeStorage.ts
```

---

## Task 3: Introduce ThemeProvider Without Changing App Consumers

**Files:**
- Create: `src/theme/ThemeProvider.tsx`
- Modify: `src/theme/index.ts`

- [ ] **Step 1: Create `src/theme/ThemeProvider.tsx`**

Create `src/theme/ThemeProvider.tsx` with:

```tsx
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { normalizeSettingsThemeState } from "./themeCodec";
import { applyThemeCssVariables, applyThemeRootState } from "./themeDom";
import { getSettingsThemeCssVariables } from "./themeResolver";
import {
  getSystemTheme,
  readStoredSettingsThemeState,
  resolveThemeMode,
  writeStoredAppTheme,
  writeStoredSettingsThemeState,
  type AppTheme,
  type ResolvedTheme,
} from "./themeStorage";
import type { SettingsThemeState } from "./themeTypes";

export interface ThemeEngineState {
  appTheme: AppTheme;
  systemTheme: ResolvedTheme;
  resolvedTheme: ResolvedTheme;
  themeState: SettingsThemeState;
  activeTheme: SettingsThemeState["light"];
  themeVariables: ReturnType<typeof getSettingsThemeCssVariables>;
}

export interface ThemeEngineActions {
  setAppTheme: (value: AppTheme) => void;
  setThemeState: (value: SettingsThemeState) => void;
  applyThemeState: (value: SettingsThemeState) => void;
}

export interface ThemeEngineContextValue extends ThemeEngineState, ThemeEngineActions {}

const ThemeEngineContext = createContext<ThemeEngineContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeState, setThemeStateInternal] = useState(readStoredSettingsThemeState);
  const [appTheme, setAppThemeInternal] = useState<AppTheme>(themeState.mode);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);
  const resolvedTheme = resolveThemeMode(appTheme, systemTheme);
  const activeTheme = resolvedTheme === "light" ? themeState.light : themeState.dark;
  const themeVariables = useMemo(() => getSettingsThemeCssVariables(activeTheme), [activeTheme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mediaQuery) return;

    const updateSystemTheme = () => {
      setSystemTheme(mediaQuery.matches ? "dark" : "light");
    };

    updateSystemTheme();
    mediaQuery.addEventListener?.("change", updateSystemTheme);
    return () => mediaQuery.removeEventListener?.("change", updateSystemTheme);
  }, []);

  useEffect(() => {
    applyThemeRootState(document.documentElement, appTheme, resolvedTheme);
    writeStoredAppTheme(appTheme);
  }, [appTheme, resolvedTheme]);

  useEffect(() => {
    return applyThemeCssVariables(document.documentElement, themeVariables);
  }, [themeVariables]);

  useEffect(() => {
    try {
      writeStoredSettingsThemeState(themeState);
    } catch {
      // A storage failure should not prevent Settings Center from opening.
    }
  }, [themeState]);

  const setAppTheme = (value: AppTheme) => {
    setAppThemeInternal(value);
    setThemeStateInternal((current) => normalizeSettingsThemeState({ ...current, mode: value }));
  };

  const setThemeState = (value: SettingsThemeState) => {
    const normalizedState = normalizeSettingsThemeState(value);
    setThemeStateInternal(normalizedState);
    setAppThemeInternal(normalizedState.mode);
  };

  const applyThemeState = (value: SettingsThemeState) => {
    setThemeState(value);
  };

  const contextValue = useMemo<ThemeEngineContextValue>(() => ({
    activeTheme,
    appTheme,
    applyThemeState,
    resolvedTheme,
    setAppTheme,
    setThemeState,
    systemTheme,
    themeState,
    themeVariables,
  }), [activeTheme, appTheme, resolvedTheme, systemTheme, themeState, themeVariables]);

  return (
    <ThemeEngineContext.Provider value={contextValue}>
      {children}
    </ThemeEngineContext.Provider>
  );
}

export function useThemeEngine(): ThemeEngineContextValue {
  const context = useContext(ThemeEngineContext);
  if (!context) {
    throw new Error("useThemeEngine must be used within ThemeProvider.");
  }
  return context;
}
```

- [ ] **Step 2: Update `src/theme/index.ts` exports**

Append:

```ts
export { ThemeProvider, useThemeEngine };
export type { ThemeEngineActions, ThemeEngineContextValue, ThemeEngineState } from "./ThemeProvider";
```

- [ ] **Step 3: Verify build**

Run:

```powershell
pnpm build
```

Expected: TypeScript and Vite build complete without errors.

- [ ] **Step 4: Print changed files**

Run:

```powershell
Get-Content -Raw -Encoding UTF8 src\theme\ThemeProvider.tsx
Get-Content -Raw -Encoding UTF8 src\theme\index.ts
```

- [ ] **Step 5: Commit**

```powershell
git status --short -- . ":(exclude)notes/**"
git add -- src/theme/ThemeProvider.tsx src/theme/index.ts
git diff --cached --name-only
git commit -m "refactor(theme): add theme provider facade"
```

Expected staged files:

```text
src/theme/ThemeProvider.tsx
src/theme/index.ts
```

---

## Task 4: Wire App To ThemeProvider And Remove App-Owned Theme Side Effects

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: Wrap App with ThemeProvider**

In `src/main.tsx`, import `ThemeProvider`:

```ts
import { ThemeProvider } from "@/theme";
```

Wrap the existing `<App />` render with:

```tsx
<ThemeProvider>
  <App />
</ThemeProvider>
```

Keep any existing React strict mode or root setup unchanged.

- [ ] **Step 2: Replace theme imports in `src/App.tsx`**

Remove these imports:

```ts
import { getSettingsThemeCssVariables } from "@/components/settings/v2/theme/settingsThemeApply";
import { normalizeSettingsThemeState } from "@/components/settings/v2/theme/settingsThemeCodec";
import { DEFAULT_SETTINGS_THEME_STATE } from "@/components/settings/v2/theme/settingsThemePresets";
import type { SettingsThemeState } from "@/components/settings/v2/theme/settingsThemeTypes";
```

Add:

```ts
import { useThemeEngine, type SettingsThemeState } from "@/theme";
```

- [ ] **Step 3: Remove App-local theme initialization helpers**

Delete these App-local helpers from `src/App.tsx` if they are no longer referenced after Step 4:

```ts
function isAppTheme(value: string | null): value is AppTheme
function getInitialAppTheme(): AppTheme
function isHexColor(value: string | null): value is string
function getInitialAccentColor(): string
function getInitialContrast(): number
function getInitialSettingsThemeState(): SettingsThemeState
function getInitialSystemTheme(): "dark" | "light"
```

Keep `getInitialBooleanSetting` if non-theme settings still use it, such as pointer cursor.

- [ ] **Step 4: Replace App theme state declarations**

Inside `App`, replace:

```ts
const [settingsThemeState, setSettingsThemeState] = useState(getInitialSettingsThemeState);
const [appTheme, setAppTheme] = useState<AppTheme>(settingsThemeState.mode);
const [systemTheme, setSystemTheme] = useState<"dark" | "light">(getInitialSystemTheme);
```

with:

```ts
const {
  activeTheme: activeSettingsTheme,
  appTheme,
  applyThemeState,
  resolvedTheme,
  setAppTheme,
  themeState: settingsThemeState,
  themeVariables: settingsThemeVariables,
} = useThemeEngine();
```

- [ ] **Step 5: Keep legacy UI state mirrors but source them from provider**

Keep existing `accentColor`, `translucentSidebar`, and `appearanceContrast` state declarations if other App code still reads them. They should still initialize from `settingsThemeState` as before:

```ts
const [accentColor, setAccentColor] = useState(() => {
  const initialTheme = settingsThemeState.mode === "light" ? settingsThemeState.light : settingsThemeState.dark;
  return initialTheme.theme.accent;
});
```

Do not move these non-provider mirrors in this task unless TypeScript proves they are unused.

- [ ] **Step 6: Remove duplicated App derivations**

Delete these derivations near the current line around `resolvedTheme`:

```ts
const resolvedTheme = appTheme === "system" ? systemTheme : appTheme;
const activeSettingsTheme = resolvedTheme === "light" ? settingsThemeState.light : settingsThemeState.dark;
const settingsThemeVariables = useMemo(() => getSettingsThemeCssVariables(activeSettingsTheme), [activeSettingsTheme]);
```

Keep `appearanceBackgroundColor`, `appearanceForegroundColor`, and `settingsPanelStyle` derived from the provider-backed `activeSettingsTheme` and `settingsThemeVariables`.

- [ ] **Step 7: Replace theme action callbacks**

Replace:

```ts
const applySettingsThemeState = (nextThemeState: SettingsThemeState) => {
  const normalizedState = normalizeSettingsThemeState(nextThemeState);
  const nextTheme = normalizedState.mode;
  setAppTheme(nextTheme);
  setSettingsThemeState(normalizedState);
};
```

with:

```ts
const applySettingsThemeState = (nextThemeState: SettingsThemeState) => {
  applyThemeState(nextThemeState);
};
```

Replace:

```ts
const handleThemeChange = (nextTheme: ThemeMode) => {
  setAppTheme(nextTheme);
  setSettingsThemeState((current) => normalizeSettingsThemeState({ ...current, mode: nextTheme }));
};
```

with:

```ts
const handleThemeChange = (nextTheme: ThemeMode) => {
  setAppTheme(nextTheme);
};
```

- [ ] **Step 8: Remove duplicated App theme side effects**

Delete these effects from `src/App.tsx`:

```ts
useEffect(() => {
  const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (!mediaQuery) return;

  const updateSystemTheme = () => {
    setSystemTheme(mediaQuery.matches ? "dark" : "light");
  };

  updateSystemTheme();
  mediaQuery.addEventListener?.("change", updateSystemTheme);
  return () => mediaQuery.removeEventListener?.("change", updateSystemTheme);
}, []);
```

Delete:

```ts
useEffect(() => {
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme;
  root.dataset.themeMode = appTheme;
  root.classList.toggle("dark", resolvedTheme === "dark");
  window.localStorage.setItem(THEME_STORAGE_KEY, appTheme);
}, [appTheme, resolvedTheme]);
```

Delete:

```ts
useEffect(() => {
  const root = document.documentElement;
  const entries = Object.entries(settingsThemeVariables);

  for (const [name, value] of entries) {
    root.style.setProperty(name, String(value));
  }

  return () => {
    for (const [name] of entries) {
      root.style.removeProperty(name);
    }
  };
}, [settingsThemeVariables]);
```

Delete:

```ts
useEffect(() => {
  try {
    window.localStorage.setItem(SETTINGS_THEME_V1_STORAGE_KEY, JSON.stringify(settingsThemeState));
  } catch {
    // A storage failure should not prevent Settings Center from opening.
  }
}, [settingsThemeState]);
```

- [ ] **Step 9: Remove unused App theme constants**

Delete these constants from `src/App.tsx` if TypeScript reports they are unused after the previous steps:

```ts
const THEME_STORAGE_KEY = "oi-notebook.theme";
const SETTINGS_THEME_V1_STORAGE_KEY = "oi-notebook.settingsThemeV1";
```

Keep `ACCENT_COLOR_STORAGE_KEY`, `CONTRAST_STORAGE_KEY`, and `TRANSLUCENT_SIDEBAR_STORAGE_KEY` only if App still writes legacy mirror values in existing effects.

- [ ] **Step 10: Verify build**

Run:

```powershell
pnpm build
```

Expected: TypeScript and Vite build complete without errors. If `noUnusedLocals` reports unused theme helpers, delete only those unused helpers and rerun `pnpm build`.

- [ ] **Step 11: Print changed files**

Run:

```powershell
Get-Content -Raw -Encoding UTF8 src\App.tsx
Get-Content -Raw -Encoding UTF8 src\main.tsx
```

- [ ] **Step 12: Commit**

```powershell
git status --short -- . ":(exclude)notes/**"
git add -- src/App.tsx src/main.tsx
git diff --cached --name-only
git commit -m "refactor(theme): route app theme through provider"
```

Expected staged files:

```text
src/App.tsx
src/main.tsx
```

---

## Task 5: Move Settings Appearance Imports To The App-Level Theme Boundary

**Files:**
- Modify: `src/components/settings/v2/pages/AppearanceSettingsPage.tsx`

- [ ] **Step 1: Replace Settings-local theme imports**

In `src/components/settings/v2/pages/AppearanceSettingsPage.tsx`, replace:

```ts
import { decodeSettingsThemeV1, encodeSettingsThemeV1, normalizeSettingsThemeState } from "../theme/settingsThemeCodec";
import { CODEX_BUILTIN_THEME_PRESETS } from "../theme/settingsThemePresets";
import type { SettingsThemeState, SettingsThemeV1Payload, SettingsThemeVariant } from "../theme/settingsThemeTypes";
```

with:

```ts
import {
  CODEX_BUILTIN_THEME_PRESETS,
  decodeSettingsThemeV1,
  encodeSettingsThemeV1,
  normalizeSettingsThemeState,
  type SettingsThemeState,
  type SettingsThemeV1Payload,
  type SettingsThemeVariant,
} from "@/theme";
```

- [ ] **Step 2: Verify rendered UI code is unchanged**

Run:

```powershell
git diff -- src/components/settings/v2/pages/AppearanceSettingsPage.tsx
```

Expected: the diff only changes import lines. No JSX, class names, labels, or CSS references change.

- [ ] **Step 3: Verify build**

Run:

```powershell
pnpm build
```

Expected: TypeScript and Vite build complete without errors.

- [ ] **Step 4: Print changed file**

Run:

```powershell
Get-Content -Raw -Encoding UTF8 src\components\settings\v2\pages\AppearanceSettingsPage.tsx
```

- [ ] **Step 5: Commit**

```powershell
git status --short -- . ":(exclude)notes/**"
git add -- src/components/settings/v2/pages/AppearanceSettingsPage.tsx
git diff --cached --name-only
git commit -m "refactor(settings): import appearance theme from app boundary"
```

Expected staged files:

```text
src/components/settings/v2/pages/AppearanceSettingsPage.tsx
```

---

## Task 6: Manual Theme And Settings Regression Check

**Files:**
- No planned edits unless verification finds a bug.

- [ ] **Step 1: Run final build**

Run:

```powershell
pnpm build
```

Expected: TypeScript and Vite build complete without errors.

- [ ] **Step 2: Start app for manual verification**

Run:

```powershell
pnpm tauri dev
```

Expected: the desktop app opens. If port `1420` is occupied, stop the old dev process rather than changing Vite config.

- [ ] **Step 3: Verify Settings Center opens unchanged**

In the app:

1. Open Settings Center.
2. Open Appearance.
3. Confirm the layout, cards, segmented controls, sliders, dialogs, and spacing look like the current upgraded UI.
4. Confirm there is no obvious text overflow or broken side navigation.

- [ ] **Step 4: Verify theme mode switching**

In Appearance:

1. Switch to dark.
2. Switch to light.
3. Switch to system.
4. Confirm `document.documentElement.dataset.theme` follows the resolved theme.
5. Confirm `document.documentElement.dataset.themeMode` follows the selected mode.

- [ ] **Step 5: Verify theme edits**

In Appearance:

1. Change accent.
2. Change surface.
3. Change ink.
4. Change contrast.
5. Toggle translucent sidebar.
6. Confirm Settings, editor, preview, and NoteX surfaces still receive CSS variable updates.

- [ ] **Step 6: Verify import/export compatibility**

In Appearance:

1. Copy/export a theme.
2. Confirm the exported value starts with `codex-theme-v1:`.
3. Import the exported value.
4. Confirm the active theme remains valid and no error message appears.

- [ ] **Step 7: Stop dev server**

Stop `pnpm tauri dev` with `Ctrl+C`.

- [ ] **Step 8: Fix verification bugs if found**

If verification finds a bug, make the smallest code change and rerun:

```powershell
pnpm build
```

Then print every changed file with `Get-Content -Raw -Encoding UTF8 <path>`.

- [ ] **Step 9: Commit verification fixes only if files changed**

If fixes were needed:

```powershell
git status --short -- . ":(exclude)notes/**"
git add -- <exact changed paths>
git diff --cached --name-only
git commit -m "fix(theme): preserve settings theme behavior"
```

Do not commit anything if no files changed.

---

## Final Verification

- [ ] Run:

```powershell
pnpm build
git status --short -- . ":(exclude)notes/**"
```

- [ ] Expected:

```text
pnpm build exits 0
git status shows only intentional changes or is clean, excluding notes/**
```

- [ ] Confirm these files were not modified:

```text
src/components/settings/v2/settingsV2.css
src/components/ai/AiSidebar.tsx
src/lib/aiWebSearch.ts
src-tauri/src/ai.rs
src-tauri/src/notes.rs
notes/**
```

---

## Self-Review Notes

- Spec coverage: Tasks cover Theme Engine promotion, stable Settings UI, storage compatibility, DOM application ownership, provider facade, App side-effect reduction, and final manual verification.
- Scope control: Settings registry/search, App shell decomposition, long task model, and non-AI Rust service boundaries are intentionally excluded from this implementation plan.
- Placeholder scan: No unresolved placeholder steps remain.
- Type consistency: Theme types keep the existing names `SettingsThemeState`, `SettingsThemeV1Payload`, and `SettingsThemeVariant` to minimize churn.
