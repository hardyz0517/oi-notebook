import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

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

  const setAppTheme = useCallback((value: AppTheme) => {
    setAppThemeInternal(value);
    setThemeStateInternal((current) => normalizeSettingsThemeState({ ...current, mode: value }));
  }, []);

  const setThemeState = useCallback((value: SettingsThemeState) => {
    const normalizedState = normalizeSettingsThemeState(value);
    setThemeStateInternal(normalizedState);
    setAppThemeInternal(normalizedState.mode);
  }, []);

  const applyThemeState = useCallback((value: SettingsThemeState) => {
    setThemeState(value);
  }, [setThemeState]);

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
  }), [
    activeTheme,
    appTheme,
    applyThemeState,
    resolvedTheme,
    setAppTheme,
    setThemeState,
    systemTheme,
    themeState,
    themeVariables,
  ]);

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
