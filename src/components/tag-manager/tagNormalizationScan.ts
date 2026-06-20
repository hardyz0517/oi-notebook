import type {
  TagNormalizationPlan,
  TagNormalizationReason,
  TagNormalizationSuggestion,
} from "@/lib/tagTaxonomy";

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
