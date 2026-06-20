export type ActivityBarItem = "notes" | "search" | "luogu" | "ai" | "blog" | "settings";

export interface ActiveActivityItemInput {
  isSettingsCenterOpen: boolean;
  isLuoguDialogOpen: boolean;
  isRestartingBlog: boolean;
  isSearchOpen: boolean;
  isNotesSidebarOpen: boolean;
}

export function getActiveActivityItem(input: ActiveActivityItemInput): ActivityBarItem | null {
  if (input.isSettingsCenterOpen) return "settings";
  if (input.isLuoguDialogOpen) return "luogu";
  if (input.isRestartingBlog) return "blog";
  if (input.isSearchOpen) return "search";
  if (input.isNotesSidebarOpen) return "notes";
  return null;
}

export interface AiActivitySelectedInput {
  isAiSidebarOpen: boolean;
  isSettingsCenterOpen: boolean;
  activeSettingsGroupId: string | null | undefined;
}

export function isAiActivitySelected(input: AiActivitySelectedInput): boolean {
  return input.isAiSidebarOpen || (input.isSettingsCenterOpen && input.activeSettingsGroupId === "ai");
}

export function getActivityButtonClassName(): string {
  return "app-activity-button relative h-12 w-12 rounded-md";
}
