import type { CSSProperties } from "react";

import { CODEX_DARK_THEME } from "./settingsThemePresets";
import type { SettingsThemeV1Payload } from "./settingsThemeTypes";

type ThemeCssVariables = Record<`--${string}`, string>;

type RgbColor = { r: number; g: number; b: number };

const BLACK: RgbColor = { r: 0, g: 0, b: 0 };
const WHITE: RgbColor = { r: 255, g: 255, b: 255 };
const DEFAULT_CONTRAST_BY_VARIANT = {
  dark: 60,
  light: 45,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(color: string): RgbColor | null {
  const trimmed = color.trim();
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed);
  if (!match) return null;

  const value = match[1].length === 3
    ? match[1].split("").map((part) => part + part).join("")
    : match[1];

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function rgbToCss(color: RgbColor): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

function rgbToHex(color: RgbColor): string {
  const toHex = (channel: number) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

function formatAlpha(alpha: number): string {
  return clamp(alpha, 0, 1).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function rgba(color: RgbColor, alpha: number): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${formatAlpha(alpha)})`;
}

function mixRgb(from: RgbColor, to: RgbColor, amount: number): RgbColor {
  const t = clamp(amount, 0, 1);
  return {
    r: Math.round(from.r + (to.r - from.r) * t),
    g: Math.round(from.g + (to.g - from.g) * t),
    b: Math.round(from.b + (to.b - from.b) * t),
  };
}

function mixHex(from: RgbColor, to: RgbColor, amount: number): string {
  return rgbToHex(mixRgb(from, to, amount));
}

function normalizeContrast(contrast: number, variant: "light" | "dark"): number {
  const base = DEFAULT_CONTRAST_BY_VARIANT[variant];
  const baseStrength = base / 100;
  // Matches Codex Desktop's audited me(contrast, variant) strength transform.
  const rawStrength = contrast / 100 + ((contrast - base) / 60) * 0.7;

  return contrast <= base
    ? rawStrength
    : baseStrength + (rawStrength - baseStrength) * 2;
}

function resolveCodexLikeTokens(theme: SettingsThemeV1Payload): ThemeCssVariables {
  const surface = theme.theme.surface;
  const ink = theme.theme.ink;
  const accent = theme.theme.accent;
  const contrast = clamp(theme.theme.contrast, 0, 100);
  const variant = theme.variant === "light" ? "light" : "dark";
  const c = normalizeContrast(contrast, variant);
  const delta = contrast - DEFAULT_CONTRAST_BY_VARIANT[variant];
  const surfaceRgb = hexToRgb(surface) ?? hexToRgb(CODEX_DARK_THEME.theme.surface) ?? BLACK;
  const inkRgb = hexToRgb(ink) ?? hexToRgb(CODEX_DARK_THEME.theme.ink) ?? WHITE;
  const accentRgb = hexToRgb(accent) ?? hexToRgb(CODEX_DARK_THEME.theme.accent) ?? WHITE;
  const diffAddedRgb = hexToRgb(theme.theme.semanticColors.diffAdded) ?? accentRgb;
  const diffRemovedRgb = hexToRgb(theme.theme.semanticColors.diffRemoved) ?? accentRgb;
  const skillRgb = hexToRgb(theme.theme.semanticColors.skill) ?? accentRgb;

  const editorBackground = variant === "light"
    ? mixHex(surfaceRgb, WHITE, 0.12)
    : mixHex(surfaceRgb, inkRgb, 0.07);

  const surfaceUnder = variant === "light"
    ? mixHex(surfaceRgb, inkRgb, 0.04 + delta * 0.0012)
    : mixHex(surfaceRgb, BLACK, 0.16 + delta * 0.0015);

  const panel = variant === "light"
    ? mixHex(surfaceRgb, WHITE, 0.18 + c * 0.008)
    : mixHex(surfaceRgb, inkRgb, 0.03 + c * 0.03);

  const elevatedPrimaryRgb = variant === "light"
    ? mixRgb(surfaceRgb, WHITE, 0.16 + c * 0.12)
    : mixRgb(surfaceRgb, inkRgb, 0.08 + c * 0.08);

  const elevatedSecondary = variant === "light"
    ? rgba(mixRgb(surfaceRgb, WHITE, 0.08 + c * 0.08), 0.96)
    : rgba(inkRgb, 0.02 + c * 0.02);

  const controlRgb = variant === "light"
    ? mixRgb(surfaceRgb, WHITE, 0.09 + c * 0.04)
    : mixRgb(surfaceRgb, inkRgb, 0.06 + c * 0.05);

  const textSecondary = rgba(inkRgb, 0.65 + c * 0.1);
  const textTertiary = variant === "light"
    ? rgba(inkRgb, 0.45 + c * 0.1)
    : rgba(inkRgb, 0.42 + c * 0.13);
  const textDisabled = variant === "light"
    ? rgba(inkRgb, 0.32 + c * 0.08)
    : rgba(inkRgb, 0.3 + c * 0.1);
  const iconPrimary = variant === "light" ? ink : rgba(inkRgb, 0.82 + c * 0.14);
  const iconSecondary = rgba(inkRgb, 0.65 + c * 0.1);

  const border = rgba(inkRgb, 0.06 + c * 0.04);
  const borderHeavy = variant === "light"
    ? rgba(inkRgb, 0.09 + c * 0.06)
    : rgba(inkRgb, 0.12 + c * 0.06);
  const borderLight = variant === "light"
    ? rgba(inkRgb, 0.04 + c * 0.02)
    : rgba(inkRgb, 0.03 + c * 0.02);

  const hover = rgba(inkRgb, variant === "light" ? 0.08 + c * 0.04 : 0.05 + c * 0.03);
  const active = rgba(inkRgb, variant === "light" ? 0.16 + c * 0.08 : 0.07 + c * 0.05);
  // Codex Desktop's exact selected token mapping is still unconfirmed. Keep this
  // as a conservative accent-muted approximation until the exact mapping is known.
  const selected = rgba(accentRgb, 0.12 + c * 0.06);

  const accentBackground = variant === "light"
    ? mixHex(surfaceRgb, accentRgb, 0.11 + c * 0.04)
    : mixHex(BLACK, accentRgb, 0.2 + c * 0.08);
  const accentBackgroundHover = variant === "light"
    ? mixHex(surfaceRgb, accentRgb, 0.12 + c * 0.045)
    : mixHex(BLACK, accentRgb, 0.21 + c * 0.1);
  const accentBackgroundActive = variant === "light"
    ? mixHex(surfaceRgb, accentRgb, 0.13 + c * 0.05)
    : mixHex(BLACK, accentRgb, 0.22 + c * 0.12);
  const darkFocusRgb = mixRgb(accentRgb, WHITE, 0.3 + c * 0.15);
  const accentFocus = variant === "light"
    ? accent
    : rgba(darkFocusRgb, 0.7 + c * 0.1);
  const accentHover = variant === "light"
    ? mixHex(accentRgb, inkRgb, 0.14)
    : rgbToCss(darkFocusRgb);
  const accentText = variant === "light" ? "#ffffff" : rgbToCss(darkFocusRgb);

  const diffAlpha = variant === "light" ? 0.15 : 0.23;
  const stateBgAlpha = 0.1 + c * 0.12;
  const stateBorderAlpha = 0.24 + c * 0.18;

  return {
    "--color-background-app": surface,
    "--color-background-window": surfaceUnder,
    "--color-background-activity": surfaceUnder,
    "--color-background-sidebar": surfaceUnder,
    "--color-background-toolbar": panel,
    "--color-background-workspace": surfaceUnder,
    "--color-background-editor": editorBackground,
    "--color-background-preview": editorBackground,
    "--color-background-card": rgba(elevatedPrimaryRgb, 0.96),
    "--color-background-panel": panel,
    "--color-background-popover": rgba(elevatedPrimaryRgb, 0.96),
    "--color-background-control": rgba(controlRgb, 0.96),
    "--color-background-control-opaque": rgbToCss(controlRgb),
    "--color-background-hover": hover,
    "--color-background-active": active,
    "--color-background-selected": selected,
    "--color-background-elevated-primary": rgba(elevatedPrimaryRgb, 0.96),
    "--color-background-elevated-primary-opaque": rgbToCss(elevatedPrimaryRgb),
    "--color-background-elevated-secondary": elevatedSecondary,
    "--color-background-surface": surface,
    "--color-background-surface-under": surfaceUnder,
    "--color-background-accent": accentBackground,
    "--color-background-accent-hover": accentBackgroundHover,
    "--color-background-accent-active": accentBackgroundActive,
    "--color-text-primary": ink,
    "--color-text-secondary": textSecondary,
    "--color-text-muted": textTertiary,
    "--color-text-subtle": textDisabled,
    "--color-text-disabled": textDisabled,
    "--color-text-foreground": ink,
    "--color-text-foreground-secondary": textSecondary,
    "--color-text-foreground-tertiary": textTertiary,
    "--color-icon-primary": iconPrimary,
    "--color-icon-secondary": iconSecondary,
    "--color-border-primary": border,
    "--color-border-subtle": borderLight,
    "--color-border-control": border,
    "--color-border-strong": borderHeavy,
    "--color-border-focus": accentFocus,
    "--color-border": border,
    "--color-border-heavy": borderHeavy,
    "--color-border-light": borderLight,
    "--color-accent-primary": accent,
    "--color-accent-hover": accentHover,
    "--color-accent-muted": selected,
    "--color-accent-text": accentText,
    "--color-ring-focus": accentFocus,
    "--color-diff-added": theme.theme.semanticColors.diffAdded,
    "--color-diff-added-bg": rgba(diffAddedRgb, stateBgAlpha),
    "--color-diff-added-border": rgba(diffAddedRgb, stateBorderAlpha),
    "--color-editor-added": rgba(diffAddedRgb, diffAlpha),
    "--color-diff-removed": theme.theme.semanticColors.diffRemoved,
    "--color-diff-removed-bg": rgba(diffRemovedRgb, stateBgAlpha),
    "--color-diff-removed-border": rgba(diffRemovedRgb, stateBorderAlpha),
    "--color-editor-deleted": rgba(diffRemovedRgb, diffAlpha),
    "--color-skill": theme.theme.semanticColors.skill,
    "--color-skill-bg": rgba(skillRgb, stateBgAlpha),
    "--color-skill-border": rgba(skillRgb, stateBorderAlpha),
  };
}

export function getSettingsThemeCssVariables(theme: SettingsThemeV1Payload): CSSProperties {
  const safeTheme = {
    ...CODEX_DARK_THEME,
    ...theme,
    theme: {
      ...CODEX_DARK_THEME.theme,
      ...theme.theme,
      fonts: {
        ...CODEX_DARK_THEME.theme.fonts,
        ...theme.theme?.fonts,
      },
      semanticColors: {
        ...CODEX_DARK_THEME.theme.semanticColors,
        ...theme.theme?.semanticColors,
      },
    },
  };
  const uiFont = safeTheme.theme.fonts.ui ?? "var(--font-sans)";
  const codeFont = safeTheme.theme.fonts.code ?? "var(--font-mono)";
  const fontVariables: Record<string, string> = {
    "--settings-theme-ui-font": uiFont,
    "--settings-theme-code-font": codeFont,
    "--codex-base-ui-font": uiFont,
    "--codex-base-code-font": codeFont,
  };

  return {
    "--codex-base-surface": safeTheme.theme.surface,
    "--codex-base-ink": safeTheme.theme.ink,
    "--codex-base-accent": safeTheme.theme.accent,
    "--codex-base-contrast": String(safeTheme.theme.contrast),
    "--codex-base-diff-added": safeTheme.theme.semanticColors.diffAdded,
    "--codex-base-diff-removed": safeTheme.theme.semanticColors.diffRemoved,
    "--codex-base-skill": safeTheme.theme.semanticColors.skill,
    ...resolveCodexLikeTokens(safeTheme),
    "--settings-theme-accent": safeTheme.theme.accent,
    "--settings-theme-surface": safeTheme.theme.surface,
    "--settings-theme-ink": safeTheme.theme.ink,
    "--settings-theme-contrast": String(safeTheme.theme.contrast),
    "--settings-theme-diff-added": safeTheme.theme.semanticColors.diffAdded,
    "--settings-theme-diff-removed": safeTheme.theme.semanticColors.diffRemoved,
    "--settings-theme-skill": safeTheme.theme.semanticColors.skill,
    ...fontVariables,
  } as CSSProperties;
}
