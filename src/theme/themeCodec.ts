import { CODEX_DARK_THEME, CODEX_LIGHT_THEME, DEFAULT_SETTINGS_THEME_STATE } from "./themePresets";
import type { SettingsThemeState, SettingsThemeV1Payload, SettingsThemeVariant } from "./themeTypes";

const THEME_PREFIX = "codex-theme-v1:";
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const THEME_VARIANTS = new Set<SettingsThemeVariant>(["light", "dark", "system"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeHexColor(value: unknown, fieldName: string): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string") return { ok: false, error: `${fieldName} must be a HEX color.` };
  const trimmed = value.trim();
  const expanded = /^#[0-9a-f]{3}$/i.test(trimmed)
    ? `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`
    : trimmed;
  if (!HEX_COLOR_PATTERN.test(expanded)) return { ok: false, error: `${fieldName} must be a valid #RRGGBB color.` };
  return { ok: true, value: expanded.toUpperCase() };
}

function normalizeNullableFont(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeSettingsThemeV1(input: unknown): { ok: true; value: SettingsThemeV1Payload } | { ok: false; error: string } {
  if (!isRecord(input)) return { ok: false, error: "Theme payload must be an object." };
  if (!isRecord(input.theme)) return { ok: false, error: "Theme payload is missing theme." };

  const defaultTheme = input.variant === "light" ? CODEX_LIGHT_THEME : CODEX_DARK_THEME;
  const variant = typeof input.variant === "string" && THEME_VARIANTS.has(input.variant as SettingsThemeVariant)
    ? input.variant as SettingsThemeVariant
    : defaultTheme.variant;
  const codeThemeId = typeof input.codeThemeId === "string" && input.codeThemeId.trim()
    ? input.codeThemeId.trim()
    : defaultTheme.codeThemeId;
  const contrast = typeof input.theme.contrast === "number" && Number.isFinite(input.theme.contrast)
    ? Math.min(100, Math.max(0, Math.round(input.theme.contrast)))
    : defaultTheme.theme.contrast;
  const opaqueWindows = typeof input.theme.opaqueWindows === "boolean"
    ? input.theme.opaqueWindows
    : defaultTheme.theme.opaqueWindows;

  const accent = normalizeHexColor(input.theme.accent, "theme.accent");
  if (!accent.ok) return accent;
  const ink = normalizeHexColor(input.theme.ink, "theme.ink");
  if (!ink.ok) return ink;
  const surface = normalizeHexColor(input.theme.surface, "theme.surface");
  if (!surface.ok) return surface;

  const semanticColors = isRecord(input.theme.semanticColors) ? input.theme.semanticColors : {};
  const diffAdded = normalizeHexColor(semanticColors.diffAdded ?? defaultTheme.theme.semanticColors.diffAdded, "theme.semanticColors.diffAdded");
  if (!diffAdded.ok) return diffAdded;
  const diffRemoved = normalizeHexColor(semanticColors.diffRemoved ?? defaultTheme.theme.semanticColors.diffRemoved, "theme.semanticColors.diffRemoved");
  if (!diffRemoved.ok) return diffRemoved;
  const skill = normalizeHexColor(semanticColors.skill ?? defaultTheme.theme.semanticColors.skill, "theme.semanticColors.skill");
  if (!skill.ok) return skill;

  const fonts = isRecord(input.theme.fonts) ? input.theme.fonts : {};
  return {
    ok: true,
    value: {
      codeThemeId,
      variant,
      theme: {
        accent: accent.value,
        contrast,
        fonts: {
          ui: normalizeNullableFont(fonts.ui),
          code: normalizeNullableFont(fonts.code),
        },
        ink: ink.value,
        opaqueWindows,
        semanticColors: {
          diffAdded: diffAdded.value,
          diffRemoved: diffRemoved.value,
          skill: skill.value,
        },
        surface: surface.value,
      },
    },
  };
}

export function normalizeSettingsThemeState(input: unknown): SettingsThemeState {
  if (!isRecord(input)) return DEFAULT_SETTINGS_THEME_STATE;

  if (isRecord(input.theme)) {
    const normalizedPayload = normalizeSettingsThemeV1(input);
    if (!normalizedPayload.ok) return DEFAULT_SETTINGS_THEME_STATE;
    const variant = normalizedPayload.value.variant === "system" ? "dark" : normalizedPayload.value.variant;
    return {
      mode: normalizedPayload.value.variant,
      light: variant === "light" ? { ...normalizedPayload.value, variant: "light" } : CODEX_LIGHT_THEME,
      dark: variant === "dark" ? { ...normalizedPayload.value, variant: "dark" } : CODEX_DARK_THEME,
    };
  }

  const mode = typeof input.mode === "string" && THEME_VARIANTS.has(input.mode as SettingsThemeVariant)
    ? input.mode as SettingsThemeVariant
    : DEFAULT_SETTINGS_THEME_STATE.mode;
  const light = normalizeSettingsThemeV1({ ...(isRecord(input.light) ? input.light : CODEX_LIGHT_THEME), variant: "light" });
  const dark = normalizeSettingsThemeV1({ ...(isRecord(input.dark) ? input.dark : CODEX_DARK_THEME), variant: "dark" });

  return {
    mode,
    light: light.ok ? { ...light.value, variant: "light" } : CODEX_LIGHT_THEME,
    dark: dark.ok ? { ...dark.value, variant: "dark" } : CODEX_DARK_THEME,
  };
}

export function encodeSettingsThemeV1(theme: SettingsThemeV1Payload): string {
  return `${THEME_PREFIX}${JSON.stringify(theme)}`;
}

export function decodeSettingsThemeV1(input: string): { ok: true; value: SettingsThemeV1Payload } | { ok: false; error: string } {
  const trimmed = input.trim();
  const json = trimmed.startsWith(THEME_PREFIX) ? trimmed.slice(THEME_PREFIX.length) : trimmed;
  if (!json) return { ok: false, error: "Theme input is empty." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "Theme JSON could not be parsed." };
  }

  return normalizeSettingsThemeV1(parsed);
}
