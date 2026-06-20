import type { LocalNoteIndexStatusResult } from "@/lib/api";
import { isTaskFailed, isTaskRunning, type TaskState } from "@/lib/taskStatus";

export type LocalIndexStatusBadgeTone = "info" | "success" | "danger" | "warning";

export interface LocalIndexActionBusyState {
  isLoading: boolean;
  isRebuilding: boolean;
}

export interface LocalIndexTaskViewInput {
  loadTask: TaskState;
  rebuildTask: TaskState;
  fallbackMessage: string | null;
}

export interface LocalIndexTaskView {
  isLoading: boolean;
  isRebuilding: boolean;
  actionDisabled: boolean;
  rebuildButtonLabel: string;
  message: string | null;
}

export function getLocalIndexStatusLabel(
  status: LocalNoteIndexStatusResult | null,
  isBuilding: boolean,
): string {
  if (isBuilding) return "正在建立本地笔记索引...";
  if (!status) return "尚未读取";
  if (status.status === "ready") return "可用";
  if (status.status === "stale") return "建议重建";
  if (status.status === "error") return "读取失败";
  if (!status.exists) return "尚未建立";
  return status.status || "未知";
}

export function getLocalIndexStatusBadgeTone(
  status: LocalNoteIndexStatusResult | null,
  isBuilding: boolean,
): LocalIndexStatusBadgeTone {
  if (isBuilding) return "info";
  if (status?.status === "ready") return "success";
  if (status?.status === "error") return "danger";
  return "warning";
}

export function getLocalIndexStatusBadgeClassName(tone: LocalIndexStatusBadgeTone): string {
  if (tone === "info") return "settings-v2-status-badge-info";
  if (tone === "success") return "settings-v2-status-badge-success";
  if (tone === "danger") return "settings-v2-status-badge-danger";
  return "settings-v2-status-badge-warning";
}

export function buildLocalIndexStatusMessage(status: LocalNoteIndexStatusResult): string | null {
  if (!status.exists) return "本地索引尚未建立，首次搜索或点击重建后会生成。";
  if (status.status === "stale") return "本地索引版本已更新，建议重建索引。";
  if (status.status === "error") return "本地索引读取失败，可尝试重建。";
  return null;
}

export function isLocalIndexActionDisabled(state: LocalIndexActionBusyState): boolean {
  return state.isLoading || state.isRebuilding;
}

export function getLocalIndexRebuildButtonLabel(isRebuilding: boolean): string {
  return isRebuilding ? "正在建立..." : "重建索引";
}

export function deriveLocalIndexTaskView(input: LocalIndexTaskViewInput): LocalIndexTaskView {
  const isLoading = isTaskRunning(input.loadTask);
  const isRebuilding = isTaskRunning(input.rebuildTask);
  const taskError =
    isTaskFailed(input.rebuildTask)
      ? input.rebuildTask.error
      : isTaskFailed(input.loadTask)
        ? input.loadTask.error
        : null;
  return {
    isLoading,
    isRebuilding,
    actionDisabled: isLocalIndexActionDisabled({ isLoading, isRebuilding }),
    rebuildButtonLabel: getLocalIndexRebuildButtonLabel(isRebuilding),
    message: isRebuilding ? "正在建立本地笔记索引..." : taskError ?? input.fallbackMessage,
  };
}

export function getLocalIndexUpdatedLabel(status: LocalNoteIndexStatusResult | null): string {
  if (!status?.updatedAt) return "尚未记录";
  return new Date(status.updatedAt * 1000).toLocaleString();
}

export function formatLocalIndexSize(bytes: number | null | undefined, includeBytes = false): string {
  const safeBytes = Math.max(0, bytes ?? 0);
  const units = ["B", "KB", "MB", "GB"];
  let size = safeBytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const formattedSize =
    unitIndex === 0 ? `${safeBytes} B` : `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
  return includeBytes && unitIndex > 0 ? `${formattedSize} (${safeBytes.toLocaleString()} bytes)` : formattedSize;
}

export function getLocalIndexAccessLabel(status: LocalNoteIndexStatusResult): string {
  if (status.readable && status.writable) return "可读写";
  if (status.readable) return "只读";
  if (status.writable) return "仅可写入";
  return "不可读取";
}
