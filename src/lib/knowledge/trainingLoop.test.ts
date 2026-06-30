import { describe, expect, it } from "vitest";
import {
  applyTrainingWriteFeedback,
  buildTrainingBatchStatusSummary,
  buildTrainingWriteFeedback,
  isTrainingWriteEnabled,
  markTrainingItemReady,
  skipTrainingItem,
} from "./trainingLoop";
import { createProblemTrainingItemDraft, createTrainingBatchDraft, createTrainingItemDraft } from "./trainingDrafts";

describe("trainingLoop", () => {
  it("uses P2 batch item states from draft to ready, skipped, written, and failed", () => {
    const draft = createProblemTrainingItemDraft({
      id: "item:P3803",
      batchId: "batch:p2",
      problemId: "P3803",
      problemTitle: "多项式乘法",
    });

    expect(draft.status).toBe("draft");
    expect(markTrainingItemReady(draft).status).toBe("ready");
    expect(skipTrainingItem(draft).status).toBe("skipped");
    expect(applyTrainingWriteFeedback([draft], { writtenItemIds: [draft.id], failedItemIds: [] })[0].status).toBe("written");
    expect(applyTrainingWriteFeedback([draft], { writtenItemIds: [], failedItemIds: [draft.id] })[0].status).toBe("failed");
  });

  it("summarizes current batch status and write readiness", () => {
    const batch = createTrainingBatchDraft({
      id: "batch:p2",
      title: "P2-B fixture",
      sourceType: "luogu-today",
      sourceLabel: "今日训练",
      createdAt: "2026-06-30T00:00:00.000Z",
      itemIds: ["item:P3803", "item:blank"],
    });
    const ready = markTrainingItemReady(createProblemTrainingItemDraft({
      id: "item:P3803",
      batchId: batch.id,
      problemId: "P3803",
      problemTitle: "多项式乘法",
    }));
    const failed = markTrainingItemReady(createTrainingItemDraft({
      id: "item:blank",
      batchId: batch.id,
    }));

    expect(buildTrainingBatchStatusSummary(batch, [ready, failed])).toMatchObject({
      draft: 0,
      ready: 1,
      written: 0,
      skipped: 0,
      failed: 1,
    });
    expect(isTrainingWriteEnabled([ready, failed])).toBe(true);
  });

  it("reports written fragment, collection, and edge counts for feedback links", () => {
    const feedback = buildTrainingWriteFeedback({
      collectionWritten: true,
      fragmentResults: [
        { itemId: "item:P3803", written: true, skipped: false },
        { itemId: "item:P3383", written: false, skipped: true },
        { itemId: "item:P1001", written: false, skipped: false },
      ],
      edgeCount: 6,
      collectionPath: "knowledge/collections/batch-p2.md",
    });

    expect(feedback).toMatchObject({
      collectionCount: 1,
      fragmentCount: 1,
      skippedCount: 1,
      failedCount: 1,
      edgeCount: 6,
      collectionPath: "knowledge/collections/batch-p2.md",
    });
  });
});
