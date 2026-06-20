import { describe, expect, it } from "vitest";

import {
  addTagNormalizationPlanStats,
  createEmptyTagNormalizationScanStats,
  deriveTagNormalizationScanTaskState,
  formatTagNormalizationReason,
  getAllTagNormalizationScanSelection,
  getSelectedTagNormalizationScanStats,
  getTagNormalizationScanStats,
  type TagNormalizationScanResult,
} from "./tagNormalizationScan";
import type { TagNormalizationPlan } from "@/lib/tagTaxonomy";

function createPlan(overrides: Partial<TagNormalizationPlan["stats"]> = {}): TagNormalizationPlan {
  return {
    analyses: [],
    suggestions: [
      {
        original: "exKMP",
        normalized: "算法/字符串/Z 函数",
        displayName: "Z 函数",
        pathText: "算法/字符串/Z 函数",
        reason: "alias_to_canonical",
        targetEntryId: "algorithm.string.z-function",
        safeToAutoApply: true,
      },
      {
        original: "KMP",
        normalized: "算法/字符串/Z 函数",
        displayName: "Z 函数",
        pathText: "算法/字符串/Z 函数",
        reason: "merge_to_target",
        targetEntryId: "algorithm.string.z-function",
        safeToAutoApply: true,
      },
    ],
    nextTags: ["算法/字符串/Z 函数"],
    changed: true,
    stats: {
      total: 2,
      rewriteCount: 2,
      aliasCount: 1,
      mergeCount: 1,
      aliasToMergedSourceCount: 0,
      duplicateCount: 0,
      unknownCount: 0,
      hiddenSkippedCount: 0,
      ...overrides,
    },
  };
}

describe("tagNormalizationScan", () => {
  it("creates an empty scan stats object", () => {
    expect(createEmptyTagNormalizationScanStats()).toEqual({
      noteCount: 0,
      suggestionCount: 0,
      rewriteCount: 0,
      aliasCount: 0,
      mergeCount: 0,
      aliasToMergedSourceCount: 0,
      duplicateCount: 0,
      unknownCount: 0,
      hiddenSkippedCount: 0,
    });
  });

  it("accumulates plan stats without mutating the previous stats", () => {
    const initial = createEmptyTagNormalizationScanStats();
    const next = addTagNormalizationPlanStats(initial, createPlan({
      aliasToMergedSourceCount: 1,
      duplicateCount: 2,
      unknownCount: 3,
      hiddenSkippedCount: 4,
    }));

    expect(initial.noteCount).toBe(0);
    expect(next).toEqual({
      noteCount: 1,
      suggestionCount: 2,
      rewriteCount: 2,
      aliasCount: 1,
      mergeCount: 1,
      aliasToMergedSourceCount: 1,
      duplicateCount: 2,
      unknownCount: 3,
      hiddenSkippedCount: 4,
    });
  });

  it("derives task state for idle, running, failed, and completed scans", () => {
    const stats = addTagNormalizationPlanStats(createEmptyTagNormalizationScanStats(), createPlan({
      hiddenSkippedCount: 1,
    }));

    expect(deriveTagNormalizationScanTaskState({
      isScanning: false,
      error: null,
      results: null,
      stats,
    })).toEqual({ status: "idle", progress: null, error: null });

    expect(deriveTagNormalizationScanTaskState({
      isScanning: true,
      error: null,
      results: null,
      stats,
    })).toEqual({
      status: "running",
      progress: { current: 1, total: 1, succeeded: 1, failed: 0, skipped: 1 },
      error: null,
    });

    expect(deriveTagNormalizationScanTaskState({
      isScanning: false,
      error: "scan failed",
      results: null,
      stats,
    })).toEqual({ status: "failed", progress: null, error: "scan failed" });

    expect(deriveTagNormalizationScanTaskState({
      isScanning: false,
      error: null,
      results: [createScanResult("a.md", createPlan())],
      stats,
    })).toEqual({
      status: "succeeded",
      progress: { current: 1, total: 1, succeeded: 1, failed: 0, skipped: 1 },
      error: null,
    });
  });

  it("derives scan stats from cached all-stats when available", () => {
    const cached = {
      ...createEmptyTagNormalizationScanStats(),
      noteCount: 9,
      suggestionCount: 10,
    };
    const results = [
      createScanResult("a.md", createPlan()),
    ];

    expect(getTagNormalizationScanStats(cached, results)).toBe(cached);
  });

  it("derives scan stats from results when cached all-stats is absent", () => {
    const results = [
      createScanResult("a.md", createPlan({ duplicateCount: 1 })),
      createScanResult("b.md", createPlan({ unknownCount: 2 })),
    ];

    expect(getTagNormalizationScanStats(null, results)).toEqual({
      noteCount: 2,
      suggestionCount: 4,
      rewriteCount: 4,
      aliasCount: 2,
      mergeCount: 2,
      aliasToMergedSourceCount: 0,
      duplicateCount: 1,
      unknownCount: 2,
      hiddenSkippedCount: 0,
    });
  });

  it("derives selected scan stats by path", () => {
    const results = [
      createScanResult("a.md", createPlan({ duplicateCount: 1 })),
      createScanResult("b.md", createPlan({ unknownCount: 2 })),
    ];

    expect(getSelectedTagNormalizationScanStats(results, new Set(["b.md"]))).toEqual({
      noteCount: 1,
      suggestionCount: 2,
      rewriteCount: 2,
      aliasCount: 1,
      mergeCount: 1,
      aliasToMergedSourceCount: 0,
      duplicateCount: 0,
      unknownCount: 2,
      hiddenSkippedCount: 0,
    });
  });

  it("creates a selection set for all scan result paths", () => {
    expect(getAllTagNormalizationScanSelection([
      createScanResult("a.md", createPlan()),
      createScanResult("b.md", createPlan()),
    ])).toEqual(new Set(["a.md", "b.md"]));
    expect(getAllTagNormalizationScanSelection(null)).toEqual(new Set());
  });

  it("formats normalization reasons for display", () => {
    expect(formatTagNormalizationReason("alias_to_canonical")).toBe("别名");
    expect(formatTagNormalizationReason("merge_to_target")).toBe("已合并");
    expect(formatTagNormalizationReason("duplicate_after_normalize")).toBe("去重");
    expect(formatTagNormalizationReason("already_canonical")).toBe("已规范");
  });
});

function createScanResult(path: string, plan: TagNormalizationPlan): TagNormalizationScanResult {
  return {
    path,
    title: path,
    plan,
    suggestions: plan.suggestions,
  };
}
