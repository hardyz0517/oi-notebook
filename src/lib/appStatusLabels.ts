export type EditorViewMode = "split" | "editor" | "preview";

export interface SaveStatusLabelInput {
  hasActiveEditorDocument: boolean;
  isSavingNote: boolean;
  isDirty: boolean;
}

export interface LuoguStatusLabelInput {
  hasLoadedLuoguConfigStatus: boolean;
  isLoadingLuoguConfig: boolean;
  isConfigured: boolean;
  hasConnectionError: boolean;
}

export interface LuoguStatusDescriptionInput extends LuoguStatusLabelInput {
  hasConnectionResult: boolean;
}

export function getSaveStatusLabel(input: SaveStatusLabelInput): string {
  if (!input.hasActiveEditorDocument) return "未选择文件";
  if (input.isSavingNote) return "保存中";
  return input.isDirty ? "未保存" : "已保存";
}

export function getBlogStatusLabel(isRestartingBlog: boolean): string {
  return isRestartingBlog ? "重启中" : "打开 / 重启";
}

export function getLuoguStatusLabel(input: LuoguStatusLabelInput): string {
  if (!input.hasLoadedLuoguConfigStatus || input.isLoadingLuoguConfig) return "读取中";
  if (!input.isConfigured) return "未配置";
  return input.hasConnectionError ? "连接失败" : "已配置";
}

export function getLuoguSettingsStatusTone(input: LuoguStatusLabelInput): string {
  if (!input.hasLoadedLuoguConfigStatus || input.isLoadingLuoguConfig) {
    return "border-sky-300/50 bg-sky-500/10 text-sky-700 dark:text-sky-200";
  }
  if (!input.isConfigured) {
    return "border-amber-300/60 bg-amber-500/10 text-amber-700 dark:text-amber-200";
  }
  if (input.hasConnectionError) {
    return "border-red-300/60 bg-red-500/10 text-red-700 dark:text-red-200";
  }
  return "border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200";
}

export function getLuoguSettingsStatusDescription(input: LuoguStatusDescriptionInput): string {
  if (!input.hasLoadedLuoguConfigStatus || input.isLoadingLuoguConfig) {
    return "正在读取本机洛谷配置。";
  }
  if (!input.isConfigured) {
    return "尚未配置 _uid 和 __client_id，请先配置账号。";
  }
  if (input.hasConnectionError) {
    return "最近一次测试连接失败，请检查 Cookie 后重试。";
  }
  return input.hasConnectionResult ? "最近测试正常。" : "账号 Cookie 已保存，可手动测试连接。";
}

export function getLuoguImportCenterAccountLabel(isLoadingLuoguConfig: boolean, isConfigured: boolean): string {
  if (isLoadingLuoguConfig) return "读取中";
  return isConfigured ? "已连接" : "未配置";
}

export function getEditorViewModeLabel(editorViewMode: EditorViewMode): string {
  if (editorViewMode === "split") return "双栏";
  return editorViewMode === "editor" ? "仅编辑" : "仅预览";
}

export function formatZoomLabel(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}
