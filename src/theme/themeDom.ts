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
