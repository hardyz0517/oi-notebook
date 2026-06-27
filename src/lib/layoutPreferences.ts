import { clampNumberRange } from "./appPreferences";

export const LEFT_SIDEBAR_WIDTH_STORAGE_KEY = "oi-notebook.layout.leftSidebarWidth";
export const AI_SIDEBAR_WIDTH_STORAGE_KEY = "oi-notebook.layout.aiSidebarWidth";
export const EDITOR_PREVIEW_RATIO_STORAGE_KEY = "oi-notebook.layout.editorPreviewRatio";

export const LEFT_SIDEBAR_WIDTH_DEFAULT = 260;
export const LEFT_SIDEBAR_WIDTH_MIN = 200;
export const LEFT_SIDEBAR_WIDTH_MAX = 420;
export const AI_SIDEBAR_WIDTH_DEFAULT = 390;
export const AI_SIDEBAR_WIDTH_MIN = 320;
export const EDITOR_PREVIEW_RATIO_DEFAULT = 0.5;
export const EDITOR_PREVIEW_RATIO_MIN = 0.2;
export const EDITOR_PREVIEW_RATIO_MAX = 0.8;
export const EDITOR_PREVIEW_MIN_PANE_WIDTH = 320;

function readStoredNumber(storageKey: string): number | null {
  const stored = window.localStorage.getItem(storageKey);
  if (stored === null) return null;

  const parsed = Number(stored);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getInitialLeftSidebarWidth(): number {
  const stored = readStoredNumber(LEFT_SIDEBAR_WIDTH_STORAGE_KEY);
  if (stored === null) return LEFT_SIDEBAR_WIDTH_DEFAULT;
  return clampNumberRange(stored, LEFT_SIDEBAR_WIDTH_MIN, LEFT_SIDEBAR_WIDTH_MAX);
}

export function getInitialAiSidebarWidth(clampWidth: (value: number) => number): number {
  const stored = readStoredNumber(AI_SIDEBAR_WIDTH_STORAGE_KEY);
  return clampWidth(stored ?? AI_SIDEBAR_WIDTH_DEFAULT);
}

export function clampEditorPreviewRatio(value: number, containerWidth?: number): number {
  let minRatio = EDITOR_PREVIEW_RATIO_MIN;
  let maxRatio = EDITOR_PREVIEW_RATIO_MAX;

  if (containerWidth && containerWidth > EDITOR_PREVIEW_MIN_PANE_WIDTH * 2) {
    minRatio = Math.max(minRatio, EDITOR_PREVIEW_MIN_PANE_WIDTH / containerWidth);
    maxRatio = Math.min(maxRatio, 1 - EDITOR_PREVIEW_MIN_PANE_WIDTH / containerWidth);
  }

  return Math.min(maxRatio, Math.max(minRatio, value));
}

export function getInitialEditorPreviewRatio(): number {
  const stored = readStoredNumber(EDITOR_PREVIEW_RATIO_STORAGE_KEY);
  if (stored === null) return EDITOR_PREVIEW_RATIO_DEFAULT;
  return clampEditorPreviewRatio(stored);
}

export function writeStoredLeftSidebarWidth(width: number): void {
  window.localStorage.setItem(LEFT_SIDEBAR_WIDTH_STORAGE_KEY, String(width));
}

export function writeStoredAiSidebarWidth(width: number): void {
  window.localStorage.setItem(AI_SIDEBAR_WIDTH_STORAGE_KEY, String(width));
}

export function writeStoredEditorPreviewRatio(ratio: number): void {
  window.localStorage.setItem(EDITOR_PREVIEW_RATIO_STORAGE_KEY, String(ratio));
}
