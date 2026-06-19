import type { LocalNoteIndexStatusResult } from "@/lib/api";

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
