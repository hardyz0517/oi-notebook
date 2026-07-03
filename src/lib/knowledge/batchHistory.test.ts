import { describe, expect, it } from "vitest";
import {
  buildLegacyMigrationDraft,
  duplicateBatchHistoryAsDraft,
  mapBatchHistoryRows,
} from "./batchHistory";
import type { KnowledgeAssetRow, KnowledgeBatchHistoryEntry } from "./knowledgeTypes";

const batch: KnowledgeBatchHistoryEntry = {
  batchId: "batch:2026-07-03",
  sourceType: "luogu-today",
  sourceLabel: "今日训练",
  createdAt: "2026-07-03T08:00:00.000Z",
  collectionPath: "knowledge/collections/batch-2026-07-03.md",
  writtenAssets: [
    {
      kind: "collection",
      path: "knowledge/collections/batch-2026-07-03.md",
      title: "2026-07-03 今日训练",
    },
    {
      kind: "fragment",
      path: "knowledge/fragments/batch-2026-07-03/P3803.md",
      title: "P3803 FFT",
      problemId: "P3803",
    },
  ],
  skippedItems: ["item:P1001:no-comment"],
  failedItems: ["item:P3383:write-denied"],
  graphRefresh: {
    nodeCount: 9,
    edgeCount: 12,
    refreshedAt: "2026-07-03T08:01:00.000Z",
  },
};

const legacyAsset: KnowledgeAssetRow = {
  id: "asset:luogu/P3803.md",
  type: "asset",
  assetType: "legacy-luogu-solution",
  title: "P3803 多项式乘法",
  kind: "legacy-note",
  date: "",
  topics: ["FFT"],
  relatedProblems: ["P3803"],
  source: "unknown",
  createdFrom: "unknown",
  reviewPriority: "medium",
  status: "active",
  path: "luogu/P3803.md",
  refs: ["luogu/P3803.md"],
  lastModified: "2026-07-02T00:00:00.000Z",
  relationCount: 2,
  missingMetadataFlags: [],
  classificationReason: "legacy_luogu_import",
  classificationConfidence: 0.95,
  inDegree: 0,
  outDegree: 2,
  degree: 2,
  isolated: false,
  componentId: 0,
};

describe("batchHistory", () => {
  it("maps batch history into readable rows with failure and skip counts", () => {
    expect(mapBatchHistoryRows([batch])).toEqual([
      expect.objectContaining({
        batchId: "batch:2026-07-03",
        writtenCount: 2,
        skippedCount: 1,
        failedCount: 1,
        graphSummary: "9 nodes / 12 edges",
      }),
    ]);
  });

  it("duplicates an old batch as a new editable draft without reusing written state", () => {
    const duplicate = duplicateBatchHistoryAsDraft(batch, "2026-07-04T09:00:00.000Z");

    expect(duplicate.sourceBatchId).toBe(batch.batchId);
    expect(duplicate.batch).toMatchObject({
      id: "batch:2026-07-04T09-00-00-000Z-replay",
      sourceType: "luogu-today",
      sourceLabel: "今日训练 replay",
      status: "draft",
    });
    expect(duplicate.items).toEqual([
      expect.objectContaining({
        problemId: "P3803",
        status: "draft",
        output: { fragment: true, article: false },
      }),
    ]);
  });

  it("builds a legacy Luogu fragment migration preview that preserves the source note", () => {
    const draft = buildLegacyMigrationDraft({
      asset: legacyAsset,
      markdown: "# P3803 多项式乘法\n\n## 题解\n\nFFT 的旧题解正文很长，应先摘要。",
      targetType: "fragment",
    });

    expect(draft).toMatchObject({
      sourcePath: "luogu/P3803.md",
      sourceTitle: "P3803 多项式乘法",
      targetType: "fragment",
      targetPath: "knowledge/fragments/legacy/P3803.md",
      originalLink: "[[luogu/P3803.md]]",
      requiresConfirmation: true,
      writesOriginal: false,
      complexity: "summary-only",
    });
    expect(draft.markdown).toContain("created_from: luogu-import-legacy");
    expect(draft.markdown).toContain("original_note: \"luogu/P3803.md\"");
    expect(draft.markdown).toContain("[[luogu/P3803.md]]");
  });

  it("builds a legacy collection migration preview without destructuring the original solution", () => {
    const draft = buildLegacyMigrationDraft({
      asset: legacyAsset,
      markdown: "# P3803 多项式乘法\n\n旧题解。",
      targetType: "collection",
    });

    expect(draft.targetPath).toBe("knowledge/collections/legacy/P3803.md");
    expect(draft.markdown).toContain("type: collection");
    expect(draft.markdown).toContain("原文链接");
    expect(draft.writesOriginal).toBe(false);
  });
});
