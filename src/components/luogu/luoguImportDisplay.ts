import { createIdleTaskState, type TaskProgress, type TaskState } from "@/lib/taskStatus";

import type { LuoguScanResultStats } from "./useLuoguImportController";

export interface LuoguScanProgressDisplay {
  foundCount: number;
  waiting?: boolean;
}

export interface LuoguScanSummaryDisplay {
  foundCount: number;
  candidateCount: number;
  skippedCount: number;
}

export interface LuoguScanResultSummaryInput {
  isPaused: boolean;
  progress: LuoguScanProgressDisplay | null;
  summary: LuoguScanSummaryDisplay | null;
  hasPreviewResult: boolean;
  stats: Pick<LuoguScanResultStats, "total" | "candidateCount" | "skippedCount">;
}

export interface LuoguImportCenterBusyInput {
  isImporting: boolean;
  isPreparing: boolean;
  isWriting: boolean;
  isScanning: boolean;
  isSyncing: boolean;
}

export function isLuoguImportCenterBusy(input: LuoguImportCenterBusyInput): boolean {
  return input.isImporting || input.isPreparing || input.isWriting || input.isScanning || input.isSyncing;
}

export interface LuoguScanTaskStateInput {
  isScanning: boolean;
  isPaused: boolean;
  progress: LuoguScanProgressDisplay | null;
  summary: LuoguScanSummaryDisplay | null;
  error: string | null;
}

export function deriveLuoguScanTaskState(input: LuoguScanTaskStateInput): TaskState {
  if (input.isScanning) {
    const foundCount = input.progress?.foundCount ?? 0;
    return {
      status: "running",
      progress: {
        current: foundCount,
        total: foundCount,
        succeeded: foundCount,
        failed: 0,
        skipped: 0,
      },
      error: null,
    };
  }

  if (input.isPaused) {
    return { status: "paused", progress: null, error: null };
  }

  if (input.error) {
    return { status: "failed", progress: null, error: input.error };
  }

  if (input.summary) {
    return {
      status: "succeeded",
      progress: {
        current: input.summary.foundCount,
        total: input.summary.foundCount,
        succeeded: input.summary.candidateCount,
        failed: 0,
        skipped: input.summary.skippedCount,
      },
      error: null,
    };
  }

  return createIdleTaskState();
}

export function formatLuoguScanResultSummary(input: LuoguScanResultSummaryInput): string {
  if (input.isPaused) {
    return `扫描已暂停 — ${input.stats.total} 条 / 可导入 ${input.stats.candidateCount} / 跳过 ${input.stats.skippedCount}`;
  }

  if (input.progress) {
    return `正在扫描，已发现 ${input.progress.foundCount} 条`;
  }

  if (input.summary) {
    return `${input.summary.foundCount} 条 / 可导入 ${input.summary.candidateCount} / 跳过 ${input.summary.skippedCount}`;
  }

  if (input.hasPreviewResult) {
    return `${input.stats.total} 条 / 可导入 ${input.stats.candidateCount} / 跳过 ${input.stats.skippedCount}`;
  }

  return "还没有扫描结果。";
}

export interface LuoguPrepareButtonLabelInput {
  isPreparing: boolean;
  progress: Pick<TaskProgress, "current" | "total"> | null;
  prepareQueueCount: number;
  reusablePreviewCount: number;
}

export function formatLuoguPrepareButtonLabel(input: LuoguPrepareButtonLabelInput): string {
  if (input.isPreparing) {
    return `生成中 ${input.progress?.current ?? 0}/${input.progress?.total ?? input.prepareQueueCount}`;
  }

  if (input.prepareQueueCount > 0) {
    return `生成预览（${input.prepareQueueCount}）`;
  }

  return `查看预览（${input.reusablePreviewCount}）`;
}

export interface LuoguPreviewReviewSummaryInput {
  prepareProgress: TaskProgress | null;
  writeProgress: Pick<TaskProgress, "current" | "total"> | null;
  preparedCount: number;
  writableCount: number;
}

export function formatLuoguPreviewReviewSummary(input: LuoguPreviewReviewSummaryInput): string {
  if (input.prepareProgress) {
    return `生成中 ${input.prepareProgress.current}/${input.prepareProgress.total} 路 成功 ${input.prepareProgress.succeeded} 路 失败 ${input.prepareProgress.failed}`;
  }

  if (input.writeProgress) {
    return `写入中 ${input.writeProgress.current}/${input.writeProgress.total}`;
  }

  return `已生成 ${input.preparedCount} 个 路 已选 ${input.writableCount} 个`;
}
