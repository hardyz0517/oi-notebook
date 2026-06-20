import type {
  PrepareLuoguSubmissionNoteResult,
  PreviewLuoguSubmission,
  WriteLuoguPreparedNoteResult,
} from "@/lib/api";
import type { LuoguSubmissionCandidateState } from "@/components/settings/pages/luoguImportDomain";

export type LuoguPrepareItemStatus = "queued" | "running" | "stopped";

export interface LuoguCandidateDisplayState {
  label: string;
  detail: string;
  tone: "success" | "warning" | "muted" | "danger" | "info" | "primary";
  output: string;
}

export function parseLuoguSubmitTimeMs(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) return null;
    const milliseconds = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
    return Number.isNaN(milliseconds) ? null : milliseconds;
  }

  const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const parsed = new Date(normalized).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

export function formatLuoguSubmissionTime(value: string): { absolute: string; compact: string; relative: string } {
  const timestamp = parseLuoguSubmitTimeMs(value);
  if (timestamp === null) {
    const fallback = value.trim() || "—";
    return {
      absolute: fallback,
      compact: fallback,
      relative: "",
    };
  }

  const date = new Date(timestamp);
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);
  const absolute = date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const compact = date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (diffMs >= 0 && diffMinutes < 1) return { absolute, compact, relative: "刚刚" };
  if (diffMs >= 0 && diffMinutes < 60) return { absolute, compact, relative: `${diffMinutes}分钟前` };
  if (diffMs >= 0 && diffHours < 24) return { absolute, compact, relative: `${diffHours}小时前` };
  if (diffMs >= 0 && diffDays < 7) return { absolute, compact, relative: `${diffDays}天前` };
  return { absolute, compact, relative: "" };
}

export function formatLuoguSubmissionStatus(status: number | string | null | undefined): string {
  if (status == null || status === "") return "未知";
  if (String(status) === "12") return "通过";
  return String(status);
}

export function getLuoguStatusBadgeClass(tone: LuoguCandidateDisplayState["tone"]): string {
  if (tone === "success") return "border-emerald-500/35 bg-emerald-500/10 text-emerald-200";
  if (tone === "warning") return "border-amber-500/35 bg-amber-500/10 text-amber-200";
  if (tone === "danger") return "border-destructive/40 bg-destructive/10 text-destructive";
  if (tone === "info") return "border-sky-500/35 bg-sky-500/10 text-sky-200";
  if (tone === "primary") return "border-primary/40 bg-primary/10 text-foreground";
  return "border-border bg-muted/25 text-muted-foreground";
}

export function getLuoguCandidateDisplayState({
  submission,
  candidateState,
  prepared,
  prepareError,
  writeResult,
  prepareStatus,
  currentlyPreparingId,
  currentlyWritingId,
  selectedIds,
  skippedIds,
}: {
  submission: PreviewLuoguSubmission;
  candidateState: LuoguSubmissionCandidateState;
  prepared: PrepareLuoguSubmissionNoteResult | undefined;
  prepareError: string | undefined;
  writeResult: WriteLuoguPreparedNoteResult | undefined;
  prepareStatus: LuoguPrepareItemStatus | undefined;
  currentlyPreparingId: string | null;
  currentlyWritingId: string | null;
  selectedIds: Set<string>;
  skippedIds: Set<string>;
}): LuoguCandidateDisplayState {
  if (skippedIds.has(submission.submissionId)) {
    return { label: "已跳过", detail: "用户已手动跳过这条候选", tone: "muted", output: "—" };
  }

  if (writeResult) {
    if (writeResult.skipped) return { label: "写入跳过", detail: writeResult.skipReason ?? "写入阶段跳过", tone: "muted", output: writeResult.relativePath ?? "—" };
    if (writeResult.failed) return { label: "写入失败", detail: writeResult.error ?? "写入阶段失败", tone: "danger", output: writeResult.relativePath ?? "—" };
    if (writeResult.relativePath) return { label: "已写入", detail: "笔记已写入", tone: "success", output: writeResult.relativePath };
    return { label: "已写入", detail: "写入完成", tone: "success", output: "—" };
  }

  if (currentlyWritingId === submission.submissionId) {
    return { label: "写入中", detail: "正在写入本地笔记", tone: "primary", output: prepared?.suggestedRelativePath ?? "—" };
  }

  if (prepareError) {
    return { label: "预览失败", detail: prepareError, tone: "danger", output: prepared?.suggestedRelativePath ?? "—" };
  }

  if (prepared) {
    const output = prepared.suggestedRelativePath || "—";
    if (prepared.skipped) return { label: "跳过", detail: prepared.skipReason ?? prepared.reason ?? "生成预览阶段跳过", tone: "muted", output };
    if (prepared.aiStatus === "failed") return { label: "生成失败", detail: prepared.reason ?? "AI 生成失败", tone: "danger", output };
    if (prepared.existing) return { label: "已预览", detail: "目标文件已存在，写入不会覆盖", tone: "info", output };
    if (prepared.draftFallback) return { label: "草稿预览", detail: "缺少心得，生成草稿", tone: "warning", output };
    return { label: "已预览", detail: "可确认写入", tone: "success", output };
  }

  if (prepareStatus === "running" || currentlyPreparingId === submission.submissionId) {
    return { label: "生成中", detail: "正在生成预览", tone: "primary", output: "生成预览后确定" };
  }
  if (prepareStatus === "queued") {
    return { label: "等待中", detail: "已进入预览生成队列", tone: "primary", output: "生成预览后确定" };
  }
  if (prepareStatus === "stopped") {
    return { label: "已停止", detail: "预览生成已停止", tone: "muted", output: "—" };
  }

  if (!candidateState.canSelect) {
    const isNonAc = candidateState.statusLabel.includes("非 AC");
    return {
      label: "跳过",
      detail: candidateState.statusLabel,
      tone: isNonAc ? "warning" : "muted",
      output: "—",
    };
  }

  if (candidateState.statusLabel.includes("非 AC")) {
    return { label: "非 AC", detail: candidateState.statusLabel, tone: "warning", output: "生成时会由后端安全跳过" };
  }

  if (candidateState.statusLabel.includes("已导入") && !selectedIds.has(submission.submissionId)) {
    return { label: "已导入", detail: candidateState.statusLabel, tone: "info", output: "—" };
  }

  if (candidateState.statusLabel.includes("同题旧提交") && !selectedIds.has(submission.submissionId)) {
    return { label: "同题旧提交", detail: candidateState.statusLabel, tone: "muted", output: "—" };
  }

  if (selectedIds.has(submission.submissionId)) {
    return { label: "待生成", detail: "已选择，等待生成预览", tone: "primary", output: "生成预览后确定" };
  }

  return { label: "可导入", detail: "符合当前规则，可选择生成预览", tone: "success", output: "生成预览后确定" };
}

export function getLuoguPreviewStatusLabel({
  prepared,
  prepareError,
  writeResult,
  edited,
}: {
  prepared?: PrepareLuoguSubmissionNoteResult;
  prepareError?: string;
  writeResult?: WriteLuoguPreparedNoteResult;
  edited?: boolean;
}): string {
  if (writeResult) {
    if (writeResult.failed) return "失败";
    if (writeResult.skipped) return "已跳过";
    return "已写入";
  }
  if (prepareError || prepared?.aiStatus === "failed") return "生成失败";
  if (prepared?.skipped) return "已跳过";
  if (edited) return "已修改";
  if (prepared?.draftFallback) return "草稿就绪";
  if (prepared) return "预览就绪";
  return "待生成";
}

export function getLuoguPreviewStatusBadgeClass(statusLabel: string): string {
  if (statusLabel === "预览就绪") return "border-teal-500/35 bg-teal-500/10 text-teal-200";
  if (statusLabel === "草稿就绪") return "border-amber-500/35 bg-amber-500/10 text-amber-200";
  if (statusLabel === "已修改") return "border-sky-500/35 bg-sky-500/10 text-sky-200";
  if (statusLabel === "已写入") return "border-emerald-500/35 bg-emerald-500/10 text-emerald-200";
  if (statusLabel === "生成失败" || statusLabel === "失败") return "border-destructive/40 bg-destructive/10 text-destructive";
  if (statusLabel === "已跳过") return "border-border bg-muted/20 text-muted-foreground";
  return "border-border bg-muted/20 text-muted-foreground";
}
