import { describe, expect, it } from "vitest";
import { getActiveActivityItem, getActivityButtonClassName, isAiActivitySelected } from "./appShell";

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
});
