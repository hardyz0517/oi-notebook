import { describe, expect, it } from "vitest";
import type { KnowledgeGraphIndex, KnowledgeGraphNode, TrainingItemDraft } from "./knowledgeTypes";

describe("knowledgeTypes", () => {
  it("allows a fragment-producing training item draft", () => {
    const draft: TrainingItemDraft = {
      id: "item:P3803",
      batchId: "batch:2026-06-28",
      problemId: "P3803",
      problemTitle: "多项式乘法",
      status: "draft",
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

  it("allows an indexed knowledge graph snapshot", () => {
    const graph: KnowledgeGraphIndex = {
      generatedAt: "2026-06-28T00:00:00.000Z",
      nodes: [
        {
          id: "asset:knowledge/fragments/P3803-fft.md",
          type: "asset",
          title: "P3803 FFT 复习",
          refs: ["knowledge/fragments/P3803-fft.md"],
          assetType: "fragment",
          kind: "problem-note",
          source: "luogu",
        },
      ],
      edges: [
        {
          from: "asset:knowledge/fragments/P3803-fft.md",
          to: "problem:P3803",
          type: "mentions",
          source: "problem_id_match",
          confidence: 1,
          refs: ["knowledge/fragments/P3803-fft.md"],
        },
      ],
    };

    const node: KnowledgeGraphNode = graph.nodes[0];
    expect(node.assetType).toBe("fragment");
    expect(graph.edges[0].source).toBe("problem_id_match");
  });
});
