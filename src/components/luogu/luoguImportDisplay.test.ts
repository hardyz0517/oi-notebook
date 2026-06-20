import { describe, expect, it } from "vitest";

import {
  createEmptyLuoguPreparationWorkspace,
  deriveLuoguScanTaskState,
  formatLuoguPrepareButtonLabel,
  formatLuoguPreviewReviewSummary,
  formatLuoguScanResultSummary,
  getLuoguScanCompletionSelection,
  isLuoguImportCenterBusy,
} from "./luoguImportDisplay";
import { normalizeLuoguImportRules } from "@/components/settings/pages/luoguImportRules";
import type { PreviewLuoguSubmission } from "@/lib/api";

const emptyStats = { total: 0, candidateCount: 0, skippedCount: 0 };
const luoguSubmissions: PreviewLuoguSubmission[] = [
  {
    submissionId: "103",
    problemId: "P1001",
    problemTitle: "A+B",
    difficulty: "入门",
    status: "Accepted",
    isAc: true,
    submitTime: "",
    statusLabel: "可候选",
  },
  {
    submissionId: "102",
    problemId: "P1002",
    problemTitle: "过河卒",
    difficulty: "普及-",
    status: "Wrong Answer",
    isAc: false,
    submitTime: "",
    statusLabel: "可候选",
  },
  {
    submissionId: "101",
    problemId: "B2001",
    problemTitle: "Hello",
    difficulty: "入门",
    status: "Accepted",
    isAc: true,
    submitTime: "",
    statusLabel: "可候选",
  },
];

describe("luoguImportDisplay", () => {
  it("creates an empty preparation workspace state", () => {
    const workspace = createEmptyLuoguPreparationWorkspace();

    expect(workspace.skippedSubmissionIds).toEqual(new Set());
    expect(workspace.preparedNotesById).toEqual({});
    expect(workspace.prepareErrorsById).toEqual({});
    expect(workspace.prepareStatusesById).toEqual({});
    expect(workspace.editedPreparedMarkdownIds).toEqual(new Set());
    expect(workspace.reviewSelectedSubmissionIds).toEqual(new Set());
    expect(workspace.currentlyPreparingId).toBeNull();
    expect(workspace.prepareProgress).toBeNull();
    expect(workspace.isStoppingPrepare).toBe(false);
    expect(workspace.writeResultsById).toEqual({});
    expect(workspace.currentlyWritingId).toBeNull();
    expect(workspace.writeProgress).toBeNull();
    expect(workspace.activePreparedPreviewId).toBeNull();
    expect(workspace.activePreviewDetailTab).toBe("rendered");
    expect(workspace.importStep).toBe("scan");
  });

  it("derives whether the import center is globally busy", () => {
    expect(isLuoguImportCenterBusy({
      isImporting: false,
      isPreparing: false,
      isWriting: false,
      isScanning: false,
      isSyncing: false,
    })).toBe(false);

    expect(isLuoguImportCenterBusy({
      isImporting: true,
      isPreparing: false,
      isWriting: false,
      isScanning: false,
      isSyncing: false,
    })).toBe(true);

    expect(isLuoguImportCenterBusy({
      isImporting: false,
      isPreparing: false,
      isWriting: true,
      isScanning: false,
      isSyncing: false,
    })).toBe(true);
  });

  it("derives task state for running, paused, failed, completed, and idle scan states", () => {
    expect(deriveLuoguScanTaskState({
      isScanning: true,
      isPaused: false,
      progress: { foundCount: 12, waiting: true },
      summary: null,
      error: null,
    })).toEqual({
      status: "running",
      progress: { current: 12, total: 12, succeeded: 12, failed: 0, skipped: 0 },
      error: null,
    });

    expect(deriveLuoguScanTaskState({
      isScanning: false,
      isPaused: true,
      progress: null,
      summary: null,
      error: null,
    }).status).toBe("paused");

    expect(deriveLuoguScanTaskState({
      isScanning: false,
      isPaused: false,
      progress: null,
      summary: null,
      error: "network",
    })).toEqual({ status: "failed", progress: null, error: "network" });

    expect(deriveLuoguScanTaskState({
      isScanning: false,
      isPaused: false,
      progress: null,
      summary: { foundCount: 20, candidateCount: 9, skippedCount: 11 },
      error: null,
    })).toEqual({
      status: "succeeded",
      progress: { current: 20, total: 20, succeeded: 9, failed: 0, skipped: 11 },
      error: null,
    });

    expect(deriveLuoguScanTaskState({
      isScanning: false,
      isPaused: false,
      progress: null,
      summary: null,
      error: null,
    })).toEqual({ status: "idle", progress: null, error: null });
  });

  it("derives scan completion counts and default selection from import rules", () => {
    const selection = getLuoguScanCompletionSelection({
      submissions: luoguSubmissions,
      rules: normalizeLuoguImportRules({
        requireAc: true,
        problemIdFilter: "onlyP",
      }),
      lastSubmissionId: null,
      skippedSubmissionIds: new Set(),
    });

    expect(selection.candidateCount).toBe(1);
    expect(selection.skippedCount).toBe(2);
    expect(selection.defaultSelectedSubmissionIds).toEqual(new Set(["103"]));
  });

  it("keeps imported submissions selectable but unselected when rules ask for review", () => {
    const selection = getLuoguScanCompletionSelection({
      submissions: luoguSubmissions,
      rules: normalizeLuoguImportRules({
        importedProblemPolicy: "showUnselected",
      }),
      lastSubmissionId: 103,
      skippedSubmissionIds: new Set(),
    });

    expect(selection.candidateCount).toBe(3);
    expect(selection.skippedCount).toBe(0);
    expect(selection.defaultSelectedSubmissionIds).toEqual(new Set());
  });

  it("formats paused scan summary before other states", () => {
    expect(formatLuoguScanResultSummary({
      isPaused: true,
      progress: { foundCount: 7 },
      summary: { foundCount: 8, candidateCount: 5, skippedCount: 3 },
      hasPreviewResult: true,
      stats: { total: 10, candidateCount: 6, skippedCount: 4 },
    })).toBe("扫描已暂停 — 10 条 / 可导入 6 / 跳过 4");
  });

  it("formats running and completed scan summaries", () => {
    expect(formatLuoguScanResultSummary({
      isPaused: false,
      progress: { foundCount: 12 },
      summary: null,
      hasPreviewResult: false,
      stats: emptyStats,
    })).toBe("正在扫描，已发现 12 条");

    expect(formatLuoguScanResultSummary({
      isPaused: false,
      progress: null,
      summary: { foundCount: 20, candidateCount: 9, skippedCount: 11 },
      hasPreviewResult: false,
      stats: emptyStats,
    })).toBe("20 条 / 可导入 9 / 跳过 11");
  });

  it("formats preview scan summary and empty state", () => {
    expect(formatLuoguScanResultSummary({
      isPaused: false,
      progress: null,
      summary: null,
      hasPreviewResult: true,
      stats: { total: 3, candidateCount: 2, skippedCount: 1 },
    })).toBe("3 条 / 可导入 2 / 跳过 1");

    expect(formatLuoguScanResultSummary({
      isPaused: false,
      progress: null,
      summary: null,
      hasPreviewResult: false,
      stats: emptyStats,
    })).toBe("还没有扫描结果。");
  });

  it("formats prepare button labels", () => {
    expect(formatLuoguPrepareButtonLabel({
      isPreparing: true,
      progress: { current: 2, total: 5 },
      prepareQueueCount: 7,
      reusablePreviewCount: 1,
    })).toBe("生成中 2/5");

    expect(formatLuoguPrepareButtonLabel({
      isPreparing: true,
      progress: null,
      prepareQueueCount: 7,
      reusablePreviewCount: 1,
    })).toBe("生成中 0/7");

    expect(formatLuoguPrepareButtonLabel({
      isPreparing: false,
      progress: null,
      prepareQueueCount: 7,
      reusablePreviewCount: 1,
    })).toBe("生成预览（7）");

    expect(formatLuoguPrepareButtonLabel({
      isPreparing: false,
      progress: null,
      prepareQueueCount: 0,
      reusablePreviewCount: 3,
    })).toBe("查看预览（3）");
  });

  it("formats review header summaries", () => {
    expect(formatLuoguPreviewReviewSummary({
      prepareProgress: { current: 1, total: 4, succeeded: 1, failed: 0, skipped: 0 },
      writeProgress: { current: 2, total: 4 },
      preparedCount: 5,
      writableCount: 3,
    })).toBe("生成中 1/4 路 成功 1 路 失败 0");

    expect(formatLuoguPreviewReviewSummary({
      prepareProgress: null,
      writeProgress: { current: 2, total: 4 },
      preparedCount: 5,
      writableCount: 3,
    })).toBe("写入中 2/4");

    expect(formatLuoguPreviewReviewSummary({
      prepareProgress: null,
      writeProgress: null,
      preparedCount: 5,
      writableCount: 3,
    })).toBe("已生成 5 个 路 已选 3 个");
  });
});
