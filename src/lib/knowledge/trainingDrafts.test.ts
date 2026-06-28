import { describe, expect, it } from "vitest";
import { createProblemTrainingItemDraft, createTrainingBatchDraft } from "./trainingDrafts";

describe("trainingDrafts", () => {
  it("creates a pending problem draft with fragment output defaults", () => {
    const draft = createProblemTrainingItemDraft({
      id: "item:P3803",
      batchId: "batch:2026-06-28",
      problemId: "P3803",
      problemTitle: "多项式乘法",
    });

    expect(draft.status).toBe("pending");
    expect(draft.output).toEqual({ fragment: true, article: false });
    expect(draft.fields.relatedProblems).toEqual(["P3803"]);
    expect(draft.fields.title).toBe("P3803 多项式乘法");
  });

  it("creates a draft batch with draft status", () => {
    const batch = createTrainingBatchDraft({
      id: "batch:2026-06-28",
      title: "2026-06-28 日训",
      sourceType: "luogu-today",
      sourceLabel: "今日 Luogu",
      createdAt: "2026-06-28T00:00:00.000Z",
      itemIds: ["item:P3803"],
    });

    expect(batch.status).toBe("draft");
    expect(batch.itemIds).toEqual(["item:P3803"]);
  });
});
