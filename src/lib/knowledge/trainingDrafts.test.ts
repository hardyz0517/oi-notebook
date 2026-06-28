import { describe, expect, it } from "vitest";
import {
  buildTrainingBatchWritePlan,
  createProblemTrainingItemDraft,
  createTrainingBatchDraft,
  createTrainingItemDraft,
  toggleTrainingItemOutput,
} from "./trainingDrafts";

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

  it("builds a deterministic one-collection plus N-fragment write plan", () => {
    const batch = createTrainingBatchDraft({
      id: "batch:2026-06-28",
      title: "2026-06-28 训练沉淀",
      sourceType: "luogu-today",
      sourceLabel: "今日训练",
      createdAt: "2026-06-28T00:00:00.000Z",
      itemIds: ["item:P3803", "item:P3383", "item:blank"],
    });
    const first = createProblemTrainingItemDraft({
      id: "item:P3803",
      batchId: batch.id,
      problemId: "P3803",
      problemTitle: "多项式乘法",
    });
    const second = createProblemTrainingItemDraft({
      id: "item:P3383",
      batchId: batch.id,
      problemId: "P3383",
      problemTitle: "最近公共祖先",
    });
    const third = createTrainingItemDraft({
      id: "item:blank",
      batchId: batch.id,
    });
    const plan = buildTrainingBatchWritePlan(batch, [first, second, third]);

    expect(plan.collection.relativePath).toBe("knowledge/collections/batch-2026-06-28.md");
    expect(plan.collection.markdown).toContain("type: collection");
    expect(plan.collection.markdown).toContain("P3803");
    expect(plan.fragments).toHaveLength(2);
    expect(plan.fragments[0].relativePath).toBe("knowledge/fragments/batch-2026-06-28/P3803.md");
    expect(plan.fragments[0].markdown).toContain("type: fragment");
    expect(plan.fragments[1].markdown).toContain("type: fragment");
    expect(plan.skippedItems).toEqual([
      expect.objectContaining({ itemId: "item:blank", reason: "incomplete" }),
    ]);

    expect(toggleTrainingItemOutput(first, "article", true).output.article).toBe(true);
  });
});
