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
