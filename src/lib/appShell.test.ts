import { describe, expect, it } from "vitest";
import {
  EDITOR_VIEW_MODE_OPTIONS,
  MARKDOWN_CAPABILITIES,
  getActiveActivityItem,
  getActivityButtonClassName,
  getSettingsOpenTarget,
  isAiActivitySelected,
  shouldEnsureAiConfigForSettingsPage,
  shouldRefreshAiConfigForSettingsDiagnostics,
} from "./appShell";

describe("appShell", () => {
  it("prioritizes modal and transient activity state over the notes sidebar", () => {
    expect(getActiveActivityItem({
      isSettingsCenterOpen: true,
      isLuoguDialogOpen: true,
      isRestartingBlog: true,
      isSearchOpen: true,
      isNotesSidebarOpen: true,
    })).toBe("settings");
    expect(getActiveActivityItem({
      isSettingsCenterOpen: false,
      isLuoguDialogOpen: true,
      isRestartingBlog: true,
      isSearchOpen: true,
      isNotesSidebarOpen: true,
    })).toBe("luogu");
    expect(getActiveActivityItem({
      isSettingsCenterOpen: false,
      isLuoguDialogOpen: false,
      isRestartingBlog: true,
      isSearchOpen: true,
      isNotesSidebarOpen: true,
    })).toBe("blog");
    expect(getActiveActivityItem({
      isSettingsCenterOpen: false,
      isLuoguDialogOpen: false,
      isRestartingBlog: false,
      isSearchOpen: true,
      isNotesSidebarOpen: true,
    })).toBe("search");
  });

  it("falls back to notes or no active activity item", () => {
    expect(getActiveActivityItem({
      isSettingsCenterOpen: false,
      isLuoguDialogOpen: false,
      isRestartingBlog: false,
      isSearchOpen: false,
      isNotesSidebarOpen: true,
    })).toBe("notes");
    expect(getActiveActivityItem({
      isSettingsCenterOpen: false,
      isLuoguDialogOpen: false,
      isRestartingBlog: false,
      isSearchOpen: false,
      isNotesSidebarOpen: false,
    })).toBeNull();
  });

  it("selects AI activity when the sidebar is open or AI settings are active", () => {
    expect(isAiActivitySelected({ isAiSidebarOpen: true, isSettingsCenterOpen: false, activeSettingsGroupId: null })).toBe(true);
    expect(isAiActivitySelected({ isAiSidebarOpen: false, isSettingsCenterOpen: true, activeSettingsGroupId: "ai" })).toBe(true);
    expect(isAiActivitySelected({ isAiSidebarOpen: false, isSettingsCenterOpen: true, activeSettingsGroupId: "blog" })).toBe(false);
    expect(isAiActivitySelected({ isAiSidebarOpen: false, isSettingsCenterOpen: false, activeSettingsGroupId: "ai" })).toBe(false);
  });

  it("keeps the stable activity button class", () => {
    expect(getActivityButtonClassName()).toBe("app-activity-button relative h-12 w-12 rounded-md");
  });

  it("keeps about-page markdown capabilities stable", () => {
    expect(MARKDOWN_CAPABILITIES).toEqual([
      "数学公式",
      "代码高亮与行号",
      "表格与合并单元格",
      "引用块与常用排版组件",
    ]);
  });

  it("keeps editor view mode options stable", () => {
    expect(EDITOR_VIEW_MODE_OPTIONS).toEqual([
      { id: "split", label: "双栏" },
      { id: "editor", label: "仅编辑" },
      { id: "preview", label: "仅预览" },
    ]);
  });

  it("derives settings open targets from categories and pages", () => {
    expect(getSettingsOpenTarget("ai", {
      general: "general-basics",
      appearance: "appearance-theme",
      ai: "ai-api",
      luogu: "luogu-account",
      blog: "blog-info",
      data: "data-storage",
      keyboard: "keyboard-shortcuts",
      advanced: "advanced-developer",
      about: "about-version",
      diagnostics: "diagnostics-search",
      editor: "about-version",
    })).toEqual({ type: "category", category: "ai" });
    expect(getSettingsOpenTarget("ai-web-search", {
      general: "general-basics",
      appearance: "appearance-theme",
      ai: "ai-api",
      luogu: "luogu-account",
      blog: "blog-info",
      data: "data-storage",
      keyboard: "keyboard-shortcuts",
      advanced: "advanced-developer",
      about: "about-version",
      diagnostics: "diagnostics-search",
      editor: "about-version",
    })).toEqual({ type: "page", page: "ai-web-search" });
  });

  it("detects settings pages that need AI config side effects", () => {
    expect(shouldEnsureAiConfigForSettingsPage("ai-api")).toBe(true);
    expect(shouldEnsureAiConfigForSettingsPage("ai-web-search")).toBe(true);
    expect(shouldEnsureAiConfigForSettingsPage("diagnostics-search")).toBe(false);
    expect(shouldEnsureAiConfigForSettingsPage("blog-info")).toBe(false);
    expect(shouldRefreshAiConfigForSettingsDiagnostics("diagnostics-search")).toBe(true);
    expect(shouldRefreshAiConfigForSettingsDiagnostics("ai-api")).toBe(false);
  });
});
