import type { DiffMarkerMode, ReducedMotionMode } from "@/components/settings/v2/pages/AppearanceSettingsPage";

export type ReadingDensity = "compact" | "standard" | "comfortable";

export type ReadingDensityOption = {
  id: ReadingDensity;
  label: string;
  description: string;
  lineHeight: number;
  blockSpacing: string;
  listItemSpacing: string;
  calloutSpacing: string;
};

export const READING_DENSITY_OPTIONS: ReadingDensityOption[] = [
  {
    id: "compact",
    label: "紧凑",
    description: "减少段落和列表间距，适合高信息密度浏览。",
    lineHeight: 1.55,
    blockSpacing: "0.55rem",
    listItemSpacing: "0.15rem",
    calloutSpacing: "0.75rem",
  },
  {
    id: "standard",
    label: "标准",
    description: "保持当前阅读节奏，适合日常编辑和预览。",
    lineHeight: 1.7,
    blockSpacing: "0.75rem",
    listItemSpacing: "0.25rem",
    calloutSpacing: "1rem",
  },
  {
    id: "comfortable",
    label: "宽松",
    description: "增加正文呼吸感，适合长文审阅。",
    lineHeight: 1.85,
    blockSpacing: "1rem",
    listItemSpacing: "0.4rem",
    calloutSpacing: "1.25rem",
  },
];

export const CONTENT_ZOOM_STORAGE_KEY = "oi-notebook.contentZoom";
export const APP_ZOOM_STORAGE_KEY = "oi-notebook.appZoom";
export const APP_ZOOM_MIN = 0.8;
export const APP_ZOOM_MAX = 1.6;
export const APP_ZOOM_STEP = 0.1;
export const APP_ZOOM_DEFAULT = 1;
export const CONTENT_ZOOM_MIN = 0.8;
export const CONTENT_ZOOM_MAX = 2;
export const CONTENT_ZOOM_STEP = 0.1;
export const CONTENT_ZOOM_DEFAULT = 1;
export const UI_SCALE_STORAGE_KEY = "oi-notebook.uiScale";
export const UI_SCALE_DEFAULT = 1;
export const EDITOR_FONT_SIZE_STORAGE_KEY = "oi-notebook.editorFontSize";
export const PREVIEW_FONT_SIZE_STORAGE_KEY = "oi-notebook.previewFontSize";
export const READING_DENSITY_STORAGE_KEY = "oi-notebook.readingDensity";
export const TOOLBAR_FONT_SIZE_STORAGE_KEY = "oi-notebook.toolbarFontSize";
export const SETTINGS_FONT_SIZE_STORAGE_KEY = "oi-notebook.settingsFontSize";
export const ACCENT_COLOR_STORAGE_KEY = "oi-notebook.settingsV2.accentColor";
export const TRANSLUCENT_SIDEBAR_STORAGE_KEY = "oi-notebook.settingsV2.translucentSidebar";
export const CONTRAST_STORAGE_KEY = "oi-notebook.settingsV2.contrast";
export const POINTER_CURSOR_STORAGE_KEY = "oi-notebook.settingsV2.pointerCursor";
export const REDUCED_MOTION_STORAGE_KEY = "oi-notebook.settingsV2.reducedMotion";
export const DIFF_MARKER_MODE_STORAGE_KEY = "oi-notebook.settingsV2.diffMarkerMode";
export const DEVELOPER_MODE_STORAGE_KEY = "oi-notebook.developerMode";
export const FONT_SIZE_MIN = 13;
export const FONT_SIZE_MAX = 20;
export const EDITOR_FONT_SIZE_DEFAULT = 14;
export const PREVIEW_FONT_SIZE_DEFAULT = 14;
export const TOOLBAR_FONT_SIZE_MIN = 12;
export const TOOLBAR_FONT_SIZE_MAX = 18;
export const TOOLBAR_FONT_SIZE_DEFAULT = 12;
export const SETTINGS_FONT_SIZE_MIN = 13;
export const SETTINGS_FONT_SIZE_MAX = 18;
export const SETTINGS_FONT_SIZE_DEFAULT = 14;
export const PROMPT_EDITOR_FONT_SIZE_MIN = 12;
export const PROMPT_EDITOR_FONT_SIZE_MAX = 22;
export const PROMPT_EDITOR_FONT_SIZE_DEFAULT = 14;
export const PROMPT_EDITOR_FONT_SIZE_STEP = 1;

export function clampAppZoom(value: number): number {
  const stepped = Math.round(value * 10) / 10;
  return Math.min(APP_ZOOM_MAX, Math.max(APP_ZOOM_MIN, stepped));
}

export function clampContentZoom(value: number): number {
  const stepped = Math.round(value * 10) / 10;
  return Math.min(CONTENT_ZOOM_MAX, Math.max(CONTENT_ZOOM_MIN, stepped));
}

export function clampScale(value: number): number {
  const stepped = Math.round(value * 10) / 10;
  return Math.min(1.3, Math.max(0.9, stepped));
}

export function clampFontSize(value: number): number {
  const rounded = Math.round(value);
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, rounded));
}

export function clampNumberRange(value: number, min: number, max: number): number {
  const rounded = Math.round(value);
  return Math.min(max, Math.max(min, rounded));
}

export function getInitialAppZoom(): number {
  const stored = window.localStorage.getItem(APP_ZOOM_STORAGE_KEY);
  if (stored === null) return APP_ZOOM_DEFAULT;

  const parsed = Number(stored);
  if (!Number.isFinite(parsed)) return APP_ZOOM_DEFAULT;
  return clampAppZoom(parsed);
}

export function getInitialContentZoom(): number {
  const stored = window.localStorage.getItem(CONTENT_ZOOM_STORAGE_KEY);
  if (stored === null) return CONTENT_ZOOM_DEFAULT;

  const parsed = Number(stored);
  if (!Number.isFinite(parsed)) return CONTENT_ZOOM_DEFAULT;
  return clampContentZoom(parsed);
}

export function getInitialScale(storageKey: string, fallback: number): number {
  const stored = window.localStorage.getItem(storageKey);
  if (stored === null) return fallback;

  const parsed = Number(stored);
  if (!Number.isFinite(parsed)) return fallback;
  return clampScale(parsed);
}

export function getInitialFontSize(storageKey: string, fallback: number): number {
  const stored = window.localStorage.getItem(storageKey);
  if (stored === null) return fallback;

  const parsed = Number(stored);
  if (!Number.isFinite(parsed)) return fallback;
  return clampFontSize(parsed);
}

export function getInitialNumberRange(storageKey: string, fallback: number, min: number, max: number): number {
  const stored = window.localStorage.getItem(storageKey);
  if (stored === null) return fallback;

  const parsed = Number(stored);
  if (!Number.isFinite(parsed)) return fallback;
  return clampNumberRange(parsed, min, max);
}

export function isReadingDensity(value: string | null): value is ReadingDensity {
  return value === "compact" || value === "standard" || value === "comfortable";
}

export function getInitialReadingDensity(): ReadingDensity {
  const stored = window.localStorage.getItem(READING_DENSITY_STORAGE_KEY);
  return isReadingDensity(stored) ? stored : "standard";
}

export function getInitialBooleanSetting(storageKey: string, defaultValue: boolean): boolean {
  const stored = window.localStorage.getItem(storageKey);
  if (stored === "true") return true;
  if (stored === "false") return false;
  return defaultValue;
}

export function getInitialReducedMotion(): ReducedMotionMode {
  const stored = window.localStorage.getItem(REDUCED_MOTION_STORAGE_KEY);
  return stored === "on" || stored === "off" || stored === "system" ? stored : "system";
}

export function getInitialDiffMarkerMode(): DiffMarkerMode {
  const stored = window.localStorage.getItem(DIFF_MARKER_MODE_STORAGE_KEY);
  return stored === "symbols" ? "symbols" : "color";
}

export function getInitialDeveloperMode(): boolean {
  return window.localStorage.getItem(DEVELOPER_MODE_STORAGE_KEY) === "true";
}
