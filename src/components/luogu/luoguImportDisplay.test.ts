import { describe, expect, it } from "vitest";

import {
  formatLuoguPrepareButtonLabel,
  formatLuoguPreviewReviewSummary,
  formatLuoguScanResultSummary,
} from "./luoguImportDisplay";

const emptyStats = { total: 0, candidateCount: 0, skippedCount: 0 };

describe("luoguImportDisplay", () => {
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
