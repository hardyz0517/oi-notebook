import type { SettingsCategory, SettingsSection } from "@/components/settings/settingsTypes";

export type ActivityBarItem = "notes" | "search" | "luogu" | "ai" | "blog" | "settings";
export type EditorViewMode = "split" | "editor" | "preview";

export const EDITOR_VIEW_MODE_OPTIONS: Array<{ id: EditorViewMode; label: string }> = [
  { id: "split", label: "双栏" },
  { id: "editor", label: "仅编辑" },
  { id: "preview", label: "仅预览" },
];

export interface EditorViewLayout {
  showEditorPane: boolean;
  showPreviewPane: boolean;
  isEditorPreviewSplit: boolean;
}

export function deriveEditorViewLayout(viewMode: EditorViewMode): EditorViewLayout {
  const showEditorPane = viewMode !== "preview";
  const showPreviewPane = viewMode !== "editor";

  return {
    showEditorPane,
    showPreviewPane,
    isEditorPreviewSplit: showEditorPane && showPreviewPane,
  };
}

export interface SaveStatusActionLabelInput {
  isDirty: boolean;
  isUntitled: boolean;
  saveStatusLabel: string;
}

export function getSaveStatusActionLabel(input: SaveStatusActionLabelInput): string {
  return input.isDirty || input.isUntitled ? "保存当前笔记" : input.saveStatusLabel;
}

export const MARKDOWN_CAPABILITIES = [
  "数学公式",
  "代码高亮与行号",
  "表格与合并单元格",
  "引用块与常用排版组件",
];

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

export function getNotesActivityToggleLabel(isNotesSidebarOpen: boolean): string {
  return isNotesSidebarOpen ? "收起笔记侧栏" : "展开笔记侧栏";
}

export function getAiActivityToggleLabel(isAiSidebarOpen: boolean): string {
  return isAiSidebarOpen ? "关闭 AI 助手" : "打开 AI 助手";
}

export type SettingsOpenTarget =
  | { type: "category"; category: SettingsCategory }
  | { type: "page"; page: SettingsSection };

export function getSettingsOpenTarget(
  target: SettingsSection | SettingsCategory,
  sectionFallback: Record<SettingsCategory, SettingsSection>,
): SettingsOpenTarget {
  return target in sectionFallback
    ? { type: "category", category: target as SettingsCategory }
    : { type: "page", page: target as SettingsSection };
}

export function shouldEnsureAiConfigForSettingsPage(page: SettingsSection): boolean {
  return page.startsWith("ai-");
}

export function shouldRefreshAiConfigForSettingsDiagnostics(page: SettingsSection): boolean {
  return page === "diagnostics-search";
}
