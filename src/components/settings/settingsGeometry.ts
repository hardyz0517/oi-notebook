import type { SettingsResizeHandle } from "./settingsTypes";

export type SettingsCenterRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const SETTINGS_CENTER_MIN_WIDTH = 860;
const SETTINGS_CENTER_MIN_HEIGHT = 560;
const SETTINGS_CENTER_DEFAULT_WIDTH = 1180;
const SETTINGS_CENTER_DEFAULT_HEIGHT = 780;
const SETTINGS_CENTER_MAXIMIZED_MARGIN_X = 24;
const SETTINGS_CENTER_MAXIMIZED_MARGIN_TOP = 56;
const SETTINGS_CENTER_MAXIMIZED_MARGIN_BOTTOM = 40;
const LUOGU_DIALOG_MIN_WIDTH = 1080;
const LUOGU_DIALOG_MIN_HEIGHT = 700;
const LUOGU_DIALOG_DEFAULT_WIDTH = 1440;
const LUOGU_DIALOG_DEFAULT_HEIGHT = 900;
const LUOGU_DIALOG_MARGIN_X = 16;
const LUOGU_DIALOG_MARGIN_TOP = 16;
const LUOGU_DIALOG_MARGIN_BOTTOM = 16;

export function areSettingsCenterRectsEqual(a: SettingsCenterRect, b: SettingsCenterRect): boolean {
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}

function isFinitePositiveNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function clampNumber(value: number, min: number, max: number): number {
  const safeMax = Math.max(min, max);
  return Math.min(Math.max(value, min), safeMax);
}

function getSettingsViewportSize() {
  if (typeof window === "undefined") {
    return {
      width: SETTINGS_CENTER_DEFAULT_WIDTH + SETTINGS_CENTER_MAXIMIZED_MARGIN_X * 2,
      height: SETTINGS_CENTER_DEFAULT_HEIGHT + SETTINGS_CENTER_MAXIMIZED_MARGIN_TOP + SETTINGS_CENTER_MAXIMIZED_MARGIN_BOTTOM,
    };
  }
  const viewportWidth = Number.isFinite(window.innerWidth) ? window.innerWidth : SETTINGS_CENTER_DEFAULT_WIDTH + SETTINGS_CENTER_MAXIMIZED_MARGIN_X * 2;
  const viewportHeight = Number.isFinite(window.innerHeight) ? window.innerHeight : SETTINGS_CENTER_DEFAULT_HEIGHT + SETTINGS_CENTER_MAXIMIZED_MARGIN_TOP + SETTINGS_CENTER_MAXIMIZED_MARGIN_BOTTOM;
  return {
    width: Math.max(320, viewportWidth),
    height: Math.max(360, viewportHeight),
  };
}

export function getSettingsCenterMaxSize() {
  const viewport = getSettingsViewportSize();
  return {
    width: Math.max(1, viewport.width - SETTINGS_CENTER_MAXIMIZED_MARGIN_X * 2),
    height: Math.max(1, viewport.height - SETTINGS_CENTER_MAXIMIZED_MARGIN_TOP - SETTINGS_CENTER_MAXIMIZED_MARGIN_BOTTOM),
  };
}

export function getSettingsCenterMinSize() {
  const maxSize = getSettingsCenterMaxSize();
  return {
    width: Math.min(SETTINGS_CENTER_MIN_WIDTH, maxSize.width),
    height: Math.min(SETTINGS_CENTER_MIN_HEIGHT, maxSize.height),
  };
}

export function getLuoguDialogMaxSize() {
  const viewport = getSettingsViewportSize();
  return {
    width: Math.max(1, viewport.width - LUOGU_DIALOG_MARGIN_X * 2),
    height: Math.max(1, viewport.height - LUOGU_DIALOG_MARGIN_TOP - LUOGU_DIALOG_MARGIN_BOTTOM),
  };
}

export function getLuoguDialogMinSize() {
  const maxSize = getLuoguDialogMaxSize();
  return {
    width: Math.min(LUOGU_DIALOG_MIN_WIDTH, maxSize.width),
    height: Math.min(LUOGU_DIALOG_MIN_HEIGHT, maxSize.height),
  };
}

export function getDefaultSettingsCenterRect(): SettingsCenterRect {
  const viewport = getSettingsViewportSize();
  const maxSize = getSettingsCenterMaxSize();
  const width = Math.min(SETTINGS_CENTER_DEFAULT_WIDTH, maxSize.width);
  const height = Math.min(SETTINGS_CENTER_DEFAULT_HEIGHT, maxSize.height);
  const left = Math.max(0, Math.min(Math.max(SETTINGS_CENTER_MAXIMIZED_MARGIN_X, (viewport.width - width) / 2), viewport.width - width));
  const top = Math.max(0, Math.min(Math.max(SETTINGS_CENTER_MAXIMIZED_MARGIN_TOP, (viewport.height - height) / 2), viewport.height - height));
  return {
    left,
    top,
    width,
    height,
  };
}

export function getDefaultLuoguDialogRect(): SettingsCenterRect {
  const viewport = getSettingsViewportSize();
  const maxSize = getLuoguDialogMaxSize();
  const width = Math.min(LUOGU_DIALOG_DEFAULT_WIDTH, maxSize.width);
  const height = Math.min(LUOGU_DIALOG_DEFAULT_HEIGHT, maxSize.height);
  const left = Math.max(0, Math.min(Math.max(LUOGU_DIALOG_MARGIN_X, (viewport.width - width) / 2), viewport.width - width));
  const top = Math.max(0, Math.min(Math.max(LUOGU_DIALOG_MARGIN_TOP, (viewport.height - height) / 2), viewport.height - height));
  return {
    left,
    top,
    width,
    height,
  };
}

export function getMaximizedSettingsCenterRect(): SettingsCenterRect {
  const maxSize = getSettingsCenterMaxSize();
  return clampSettingsCenterRect({
    left: SETTINGS_CENTER_MAXIMIZED_MARGIN_X,
    top: SETTINGS_CENTER_MAXIMIZED_MARGIN_TOP,
    width: maxSize.width,
    height: maxSize.height,
  });
}

export function getMaximizedLuoguDialogRect(): SettingsCenterRect {
  const maxSize = getLuoguDialogMaxSize();
  return clampLuoguDialogRect({
    left: LUOGU_DIALOG_MARGIN_X,
    top: LUOGU_DIALOG_MARGIN_TOP,
    width: maxSize.width,
    height: maxSize.height,
  });
}

export function clampSettingsCenterRect(rect: SettingsCenterRect): SettingsCenterRect {
  const viewport = getSettingsViewportSize();
  const maxSize = getSettingsCenterMaxSize();
  const defaultRect = getDefaultSettingsCenterRect();
  const minWidth = Math.min(SETTINGS_CENTER_MIN_WIDTH, maxSize.width);
  const minHeight = Math.min(SETTINGS_CENTER_MIN_HEIGHT, maxSize.height);
  const width = Math.min(
    Math.max(isFinitePositiveNumber(rect.width) ? rect.width : defaultRect.width, minWidth),
    maxSize.width,
  );
  const height = Math.min(
    Math.max(isFinitePositiveNumber(rect.height) ? rect.height : defaultRect.height, minHeight),
    maxSize.height,
  );
  const minLeft = Math.min(SETTINGS_CENTER_MAXIMIZED_MARGIN_X, Math.max(0, viewport.width - width));
  const maxLeft = Math.max(minLeft, viewport.width - SETTINGS_CENTER_MAXIMIZED_MARGIN_X - width);
  const minTop = Math.min(SETTINGS_CENTER_MAXIMIZED_MARGIN_TOP, Math.max(0, viewport.height - height));
  const maxTop = Math.max(minTop, viewport.height - SETTINGS_CENTER_MAXIMIZED_MARGIN_BOTTOM - height);
  const safeLeft = Number.isFinite(rect.left) ? rect.left : defaultRect.left;
  const safeTop = Number.isFinite(rect.top) ? rect.top : defaultRect.top;
  return {
    left: Math.min(Math.max(safeLeft, minLeft), maxLeft),
    top: Math.min(Math.max(safeTop, minTop), maxTop),
    width,
    height,
  };
}

export function clampLuoguDialogRect(rect: SettingsCenterRect): SettingsCenterRect {
  const viewport = getSettingsViewportSize();
  const maxSize = getLuoguDialogMaxSize();
  const defaultRect = getDefaultLuoguDialogRect();
  const minWidth = Math.min(LUOGU_DIALOG_MIN_WIDTH, maxSize.width);
  const minHeight = Math.min(LUOGU_DIALOG_MIN_HEIGHT, maxSize.height);
  const width = Math.min(
    Math.max(isFinitePositiveNumber(rect.width) ? rect.width : defaultRect.width, minWidth),
    maxSize.width,
  );
  const height = Math.min(
    Math.max(isFinitePositiveNumber(rect.height) ? rect.height : defaultRect.height, minHeight),
    maxSize.height,
  );
  const minLeft = Math.min(LUOGU_DIALOG_MARGIN_X, Math.max(0, viewport.width - width));
  const maxLeft = Math.max(minLeft, viewport.width - LUOGU_DIALOG_MARGIN_X - width);
  const minTop = Math.min(LUOGU_DIALOG_MARGIN_TOP, Math.max(0, viewport.height - height));
  const maxTop = Math.max(minTop, viewport.height - LUOGU_DIALOG_MARGIN_BOTTOM - height);
  const safeLeft = Number.isFinite(rect.left) ? rect.left : defaultRect.left;
  const safeTop = Number.isFinite(rect.top) ? rect.top : defaultRect.top;
  return {
    left: Math.min(Math.max(safeLeft, minLeft), maxLeft),
    top: Math.min(Math.max(safeTop, minTop), maxTop),
    width,
    height,
  };
}

function isSettingsCenterRectFullyVisible(rect: SettingsCenterRect): boolean {
  const viewport = getSettingsViewportSize();
  return (
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    isFinitePositiveNumber(rect.width) &&
    isFinitePositiveNumber(rect.height) &&
    rect.left >= 0 &&
    rect.top >= 0 &&
    rect.left + rect.width <= viewport.width &&
    rect.top + rect.height <= viewport.height
  );
}

function isLuoguDialogRectFullyVisible(rect: SettingsCenterRect): boolean {
  return isSettingsCenterRectFullyVisible(rect);
}

export function getSafeOpenedSettingsCenterRect(rect: SettingsCenterRect): SettingsCenterRect {
  const defaultRect = getDefaultSettingsCenterRect();
  const maxSize = getSettingsCenterMaxSize();
  if (!isFinitePositiveNumber(rect.width) || !isFinitePositiveNumber(rect.height)) return defaultRect;
  const width = Math.min(Math.max(rect.width, Math.min(SETTINGS_CENTER_MIN_WIDTH, maxSize.width)), maxSize.width);
  const height = Math.min(Math.max(rect.height, Math.min(SETTINGS_CENTER_MIN_HEIGHT, maxSize.height)), maxSize.height);
  const viewport = getSettingsViewportSize();
  const centeredRect = clampSettingsCenterRect({
    left: (viewport.width - width) / 2,
    top: (viewport.height - height) / 2,
    width,
    height,
  });
  return isSettingsCenterRectFullyVisible(centeredRect) ? centeredRect : defaultRect;
}

export function getSafeOpenedLuoguDialogRect(rect: SettingsCenterRect): SettingsCenterRect {
  const defaultRect = getDefaultLuoguDialogRect();
  const maxSize = getLuoguDialogMaxSize();
  if (!isFinitePositiveNumber(rect.width) || !isFinitePositiveNumber(rect.height)) return defaultRect;
  const width = Math.min(Math.max(rect.width, Math.min(LUOGU_DIALOG_MIN_WIDTH, maxSize.width)), maxSize.width);
  const height = Math.min(Math.max(rect.height, Math.min(LUOGU_DIALOG_MIN_HEIGHT, maxSize.height)), maxSize.height);
  const viewport = getSettingsViewportSize();
  const centeredRect = clampLuoguDialogRect({
    left: (viewport.width - width) / 2,
    top: (viewport.height - height) / 2,
    width,
    height,
  });
  return isLuoguDialogRectFullyVisible(centeredRect) ? centeredRect : defaultRect;
}

export function getSettingsCenterResizeCursor(handle: SettingsResizeHandle): string {
  if (handle === "left" || handle === "right") return "ew-resize";
  if (handle === "top" || handle === "bottom") return "ns-resize";
  if (handle === "top-left" || handle === "bottom-right") return "nwse-resize";
  return "nesw-resize";
}

export function getResizedLuoguDialogRect(handle: SettingsResizeHandle, startRect: SettingsCenterRect, deltaX: number, deltaY: number): SettingsCenterRect {
  const viewport = getSettingsViewportSize();
  const maxSize = getLuoguDialogMaxSize();
  const minWidth = Math.min(LUOGU_DIALOG_MIN_WIDTH, maxSize.width);
  const minHeight = Math.min(LUOGU_DIALOG_MIN_HEIGHT, maxSize.height);
  const minLeft = Math.min(LUOGU_DIALOG_MARGIN_X, Math.max(0, viewport.width - minWidth));
  const minTop = Math.min(LUOGU_DIALOG_MARGIN_TOP, Math.max(0, viewport.height - minHeight));
  const rightLimit = Math.max(1, viewport.width - LUOGU_DIALOG_MARGIN_X);
  const bottomLimit = Math.max(1, viewport.height - LUOGU_DIALOG_MARGIN_BOTTOM);
  const startRight = startRect.left + startRect.width;
  const startBottom = startRect.top + startRect.height;
  let left = startRect.left;
  let top = startRect.top;
  let right = startRight;
  let bottom = startBottom;

  if (handle.includes("left")) {
    left = clampNumber(startRect.left + deltaX, minLeft, startRight - minWidth);
  }
  if (handle.includes("right")) {
    right = clampNumber(startRight + deltaX, startRect.left + minWidth, rightLimit);
  }
  if (handle.includes("top")) {
    top = clampNumber(startRect.top + deltaY, minTop, startBottom - minHeight);
  }
  if (handle.includes("bottom")) {
    bottom = clampNumber(startBottom + deltaY, startRect.top + minHeight, bottomLimit);
  }

  return clampLuoguDialogRect({
    left,
    top,
    width: right - left,
    height: bottom - top,
  });
}

export function getResizedSettingsCenterRect(handle: SettingsResizeHandle, startRect: SettingsCenterRect, deltaX: number, deltaY: number): SettingsCenterRect {
  const viewport = getSettingsViewportSize();
  const maxSize = getSettingsCenterMaxSize();
  const minWidth = Math.min(SETTINGS_CENTER_MIN_WIDTH, maxSize.width);
  const minHeight = Math.min(SETTINGS_CENTER_MIN_HEIGHT, maxSize.height);
  const minLeft = Math.min(SETTINGS_CENTER_MAXIMIZED_MARGIN_X, Math.max(0, viewport.width - minWidth));
  const minTop = Math.min(SETTINGS_CENTER_MAXIMIZED_MARGIN_TOP, Math.max(0, viewport.height - minHeight));
  const rightLimit = Math.max(1, viewport.width - SETTINGS_CENTER_MAXIMIZED_MARGIN_X);
  const bottomLimit = Math.max(1, viewport.height - SETTINGS_CENTER_MAXIMIZED_MARGIN_BOTTOM);
  const startRight = startRect.left + startRect.width;
  const startBottom = startRect.top + startRect.height;
  let left = startRect.left;
  let top = startRect.top;
  let right = startRight;
  let bottom = startBottom;

  if (handle.includes("left")) {
    left = clampNumber(startRect.left + deltaX, minLeft, startRight - minWidth);
  }
  if (handle.includes("right")) {
    right = clampNumber(startRight + deltaX, startRect.left + minWidth, rightLimit);
  }
  if (handle.includes("top")) {
    top = clampNumber(startRect.top + deltaY, minTop, startBottom - minHeight);
  }
  if (handle.includes("bottom")) {
    bottom = clampNumber(startBottom + deltaY, startRect.top + minHeight, bottomLimit);
  }

  return clampSettingsCenterRect({
    left,
    top,
    width: right - left,
    height: bottom - top,
  });
}
