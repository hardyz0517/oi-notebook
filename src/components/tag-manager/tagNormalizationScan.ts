import type {
  TagNormalizationPlan,
  TagNormalizationReason,
  TagNormalizationSuggestion,
} from "@/lib/tagTaxonomy";
import { createIdleTaskState, createTaskProgress, deriveTaskView, type TaskState, type TaskView } from "@/lib/taskStatus";

export interface TagNormalizationScanResult {
  path: string;
  title: string;
  plan: TagNormalizationPlan;
  suggestions: TagNormalizationSuggestion[];
}

export interface TagNormalizationApplyFailure {
  path: string;
  error: string;
}

export interface TagNormalizationApplyResult {
  successCount: number;
  normalizedTagCount: number;
  duplicateTagCount: number;
  skippedCount: number;
  failures: TagNormalizationApplyFailure[];
}

export interface TagNormalizationScanStats {
  noteCount: number;
  suggestionCount: number;
  rewriteCount: number;
  aliasCount: number;
  mergeCount: number;
  aliasToMergedSourceCount: number;
  duplicateCount: number;
  unknownCount: number;
  hiddenSkippedCount: number;
}

export interface TagNormalizationScanTaskInput {
  isScanning: boolean;
  error: string | null;
  results: TagNormalizationScanResult[] | null;
  stats: TagNormalizationScanStats;
}

export interface TagNormalizationApplyTaskInput {
  isApplying: boolean;
  selectedStats: TagNormalizationScanStats;
}

export type TagNormalizationTaskKind = "scan" | "apply";

export function createEmptyTagNormalizationScanStats(): TagNormalizationScanStats {
  return {
    noteCount: 0,
    suggestionCount: 0,
    rewriteCount: 0,
    aliasCount: 0,
    mergeCount: 0,
    aliasToMergedSourceCount: 0,
    duplicateCount: 0,
    unknownCount: 0,
    hiddenSkippedCount: 0,
  };
}

export function deriveTagNormalizationScanTaskState(input: TagNormalizationScanTaskInput): TaskState {
  if (input.isScanning) {
    return {
      status: "running",
      progress: {
        current: input.stats.noteCount,
        total: input.stats.noteCount,
        succeeded: input.stats.noteCount,
        failed: 0,
        skipped: input.stats.hiddenSkippedCount,
      },
      error: null,
    };
  }

  if (input.error) {
    return { status: "failed", progress: null, error: input.error };
  }

  if (input.results) {
    return {
      status: "succeeded",
      progress: {
        current: input.stats.noteCount,
        total: input.stats.noteCount,
        succeeded: input.stats.noteCount,
        failed: 0,
        skipped: input.stats.hiddenSkippedCount,
      },
      error: null,
    };
  }

  return createIdleTaskState();
}

export function deriveTagNormalizationApplyTaskState(input: TagNormalizationApplyTaskInput): TaskState {
  if (!input.isApplying) {
    return createIdleTaskState();
  }

  return {
    status: "running",
    progress: createTaskProgress(input.selectedStats.noteCount),
    error: null,
  };
}

export function deriveTagNormalizationTaskView(
  state: TaskState,
  kind: TagNormalizationTaskKind,
): TaskView {
  return deriveTaskView(state, kind === "scan"
    ? {
      idleLabel: "开始扫描",
      runningLabel: "扫描中",
      stoppingLabel: "停止中",
      succeededLabel: "扫描完成",
      failedLabel: "扫描失败",
      cancelledLabel: "扫描已取消",
    }
    : {
      idleLabel: "应用",
      runningLabel: "应用中",
      stoppingLabel: "停止中",
      succeededLabel: "应用完成",
      failedLabel: "应用失败",
      cancelledLabel: "应用已取消",
    });
}

export function addTagNormalizationPlanStats(
  stats: TagNormalizationScanStats,
  plan: TagNormalizationPlan,
): TagNormalizationScanStats {
  return {
    noteCount: stats.noteCount + 1,
    suggestionCount: stats.suggestionCount + plan.suggestions.length,
    rewriteCount: stats.rewriteCount + plan.stats.rewriteCount,
    aliasCount: stats.aliasCount + plan.stats.aliasCount,
    mergeCount: stats.mergeCount + plan.stats.mergeCount,
    aliasToMergedSourceCount: stats.aliasToMergedSourceCount + plan.stats.aliasToMergedSourceCount,
    duplicateCount: stats.duplicateCount + plan.stats.duplicateCount,
    unknownCount: stats.unknownCount + plan.stats.unknownCount,
    hiddenSkippedCount: stats.hiddenSkippedCount + plan.stats.hiddenSkippedCount,
  };
}

export function getTagNormalizationScanStats(
  allStats: TagNormalizationScanStats | null,
  results: TagNormalizationScanResult[] | null,
): TagNormalizationScanStats {
  return allStats ?? results?.reduce(
    (stats, result) => addTagNormalizationPlanStats(stats, result.plan),
    createEmptyTagNormalizationScanStats(),
  ) ?? createEmptyTagNormalizationScanStats();
}

export function getSelectedTagNormalizationScanStats(
  results: TagNormalizationScanResult[] | null,
  selectedPaths: Set<string>,
): TagNormalizationScanStats {
  if (!results) {
    return createEmptyTagNormalizationScanStats();
  }

  return results.reduce(
    (stats, result) => {
      if (!selectedPaths.has(result.path)) {
        return stats;
      }

      return addTagNormalizationPlanStats(stats, result.plan);
    },
    createEmptyTagNormalizationScanStats(),
  );
}

export function getAllTagNormalizationScanSelection(
  results: TagNormalizationScanResult[] | null,
): Set<string> {
  return new Set(results?.map((result) => result.path) ?? []);
}

export function formatTagNormalizationReason(reason: TagNormalizationReason): string {
  switch (reason) {
    case "alias_to_canonical":
      return "别名";
    case "merge_to_target":
      return "已合并";
    case "alias_to_merged_source":
      return "别名指向已合并标签";
    case "duplicate_after_normalize":
      return "去重";
    case "hidden_no_change":
      return "隐藏，跳过";
    case "unknown_freeform":
      return "自由标签，跳过";
    case "already_canonical":
    default:
      return "已规范";
  }
}
