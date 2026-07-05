import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  EDITOR_VIEW_MODE_OPTIONS,
  MARKDOWN_CAPABILITIES,
  deriveEditorViewLayout,
  getActiveActivityItem,
  getAiActivityToggleLabel,
  getActivityButtonClassName,
  getWorkbenchActivityToggleLabel,
  getNotesActivityToggleLabel,
  getSaveStatusActionLabel,
  getSettingsOpenTarget,
  isAiActivitySelected,
  shouldEnsureAiConfigForSettingsPage,
  shouldRefreshAiConfigForSettingsDiagnostics,
} from "./appShell";

const appSourcePath = path.resolve(__dirname, "..", "App.tsx");

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
      isAgentWorkbenchOpen: true,
      isNotesSidebarOpen: true,
    })).toBe("search");
  });

  it("falls back to notes or no active activity item", () => {
    expect(getActiveActivityItem({
      isSettingsCenterOpen: false,
      isLuoguDialogOpen: false,
      isRestartingBlog: false,
      isSearchOpen: false,
      isAgentWorkbenchOpen: false,
      isNotesSidebarOpen: true,
    })).toBe("notes");
    expect(getActiveActivityItem({
      isSettingsCenterOpen: false,
      isLuoguDialogOpen: false,
      isRestartingBlog: false,
      isSearchOpen: false,
      isAgentWorkbenchOpen: false,
      isNotesSidebarOpen: false,
    })).toBeNull();
  });

  it("selects workbench activity before notes", () => {
    expect(getActiveActivityItem({
      isSettingsCenterOpen: false,
      isLuoguDialogOpen: false,
      isRestartingBlog: false,
      isSearchOpen: false,
      isAgentWorkbenchOpen: true,
      isNotesSidebarOpen: true,
    })).toBe("workbench");
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

  it("derives the notes activity toggle label from sidebar visibility", () => {
    expect(getNotesActivityToggleLabel(true)).toBe("收起笔记侧栏");
    expect(getNotesActivityToggleLabel(false)).toBe("展开笔记侧栏");
  });

  it("derives the AI activity toggle label from sidebar visibility", () => {
    expect(getAiActivityToggleLabel(true)).toBe("关闭 AI 助手");
    expect(getAiActivityToggleLabel(false)).toBe("打开 AI 助手");
  });

  it("derives the workbench activity toggle label from workspace visibility", () => {
    expect(getWorkbenchActivityToggleLabel(true)).toBe("关闭 Agent Workbench");
    expect(getWorkbenchActivityToggleLabel(false)).toBe("打开 Agent Workbench");
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

  it("derives editor and preview pane visibility from the editor view mode", () => {
    expect(deriveEditorViewLayout("split")).toEqual({
      showEditorPane: true,
      showPreviewPane: true,
      isEditorPreviewSplit: true,
    });
    expect(deriveEditorViewLayout("editor")).toEqual({
      showEditorPane: true,
      showPreviewPane: false,
      isEditorPreviewSplit: false,
    });
    expect(deriveEditorViewLayout("preview")).toEqual({
      showEditorPane: false,
      showPreviewPane: true,
      isEditorPreviewSplit: false,
    });
  });

  it("derives the save status action label from dirty and untitled state", () => {
    expect(getSaveStatusActionLabel({
      isDirty: true,
      isUntitled: false,
      saveStatusLabel: "已保存",
    })).toBe("保存当前笔记");
    expect(getSaveStatusActionLabel({
      isDirty: false,
      isUntitled: true,
      saveStatusLabel: "未命名",
    })).toBe("保存当前笔记");
    expect(getSaveStatusActionLabel({
      isDirty: false,
      isUntitled: false,
      saveStatusLabel: "已保存",
    })).toBe("已保存");
  });

  it("keeps App wired to centralized editor view mode options", () => {
    const appSource = readFileSync(appSourcePath, "utf8");

    expect(appSource).toContain("EDITOR_VIEW_MODE_OPTIONS");
    expect(appSource).not.toContain("editorViewModeButtons");
  });

  it("keeps App wired to centralized activity toggle labels", () => {
    const appSource = readFileSync(appSourcePath, "utf8");

    expect(appSource).toContain("getAiActivityToggleLabel");
    expect(appSource).not.toContain('isAiSidebarOpen ? "关闭 AI 助手" : "打开 AI 助手"');
  });

  it("keeps the Agent Workbench shell mounted so toggling does not reset its local state", () => {
    const appSource = readFileSync(appSourcePath, "utf8");

    expect(appSource).toContain("<AgentWorkbenchShell preview={agentWorkbenchPreview} />");
    expect(appSource).not.toContain("{isAgentWorkbenchOpen ? (");
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
