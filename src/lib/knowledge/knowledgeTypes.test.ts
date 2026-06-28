import { describe, expect, it } from "vitest";
import type { TrainingItemDraft } from "./knowledgeTypes";

describe("knowledgeTypes", () => {
  it("allows a fragment-producing training item draft", () => {
    const draft: TrainingItemDraft = {
      id: "item:P3803",
      batchId: "batch:2026-06-28",
      problemId: "P3803",
      problemTitle: "多项式乘法",
      status: "pending",
      output: { fragment: true, article: false },
      fields: {
        title: "P3803 FFT 复习点",
        oneLineProblem: "给两个多项式，求乘积系数。",
        coreIdea: "FFT 蝴蝶合并。",
        pitfalls: "注意单位根更新。",
        reviewHint: "考前看迭代 FFT 模板。",
        topics: ["FFT"],
        relatedProblems: ["P3803"],
        reviewPriority: "medium",
      },
    };

    expect(draft.output.fragment).toBe(true);
    expect(draft.fields.relatedProblems).toEqual(["P3803"]);
  });
});
