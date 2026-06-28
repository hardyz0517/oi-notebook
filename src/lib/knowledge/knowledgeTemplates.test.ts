import { describe, expect, it } from "vitest";
import { buildCollectionMarkdown, buildFragmentMarkdown } from "./knowledgeTemplates";
import { createProblemTrainingItemDraft, createTrainingBatchDraft } from "./trainingDrafts";

describe("knowledgeTemplates", () => {
  it("builds fragment markdown with knowledge frontmatter", () => {
    const item = createProblemTrainingItemDraft({
      id: "item:P3803",
      batchId: "batch:2026-06-28",
      problemId: "P3803",
      problemTitle: "多项式乘法",
    });

    const markdown = buildFragmentMarkdown(item);

    expect(markdown).toContain("type: fragment");
    expect(markdown).toContain("problem_id: \"P3803\"");
    expect(markdown).toContain("## 一句话题意");
  });

  it("builds collection markdown that references the problem ids", () => {
    const batch = createTrainingBatchDraft({
      id: "batch:2026-06-28",
      title: "2026-06-28 日训",
      sourceType: "luogu-today",
      sourceLabel: "今日 Luogu",
      createdAt: "2026-06-28T00:00:00.000Z",
      itemIds: ["item:P3803"],
    });
    const item = createProblemTrainingItemDraft({
      id: "item:P3803",
      batchId: batch.id,
      problemId: "P3803",
      problemTitle: "多项式乘法",
    });

    const markdown = buildCollectionMarkdown(batch, [item]);

    expect(markdown).toContain("type: collection");
    expect(markdown).toContain("P3803");
    expect(markdown).toContain("[[P3803 多项式乘法]]");
  });
});
