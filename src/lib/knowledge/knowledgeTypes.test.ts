import { describe, expect, it } from "vitest";
import type {
  KnowledgeAssetRow,
  KnowledgeGraphIndex,
  KnowledgeGraphNode,
  KnowledgeRelationshipSuggestion,
  KnowledgeReviewSlice,
  TrainingItemDraft,
} from "./knowledgeTypes";

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
      assets: [],
      suggestions: [],
      reviewSlices: [],
    };

    const node: KnowledgeGraphNode = graph.nodes[0];
    expect(node.assetType).toBe("fragment");
    expect(graph.edges[0].source).toBe("problem_id_match");
  });

  it("allows a P2-A asset read model row with derived metadata", () => {
    const row: KnowledgeAssetRow = {
      id: "asset:knowledge/fragments/P3803-fft.md",
      type: "asset",
      assetType: "fragment",
      kind: "problem-note",
      title: "P3803 FFT 复习",
      date: "2026-06-30",
      topics: ["FFT"],
      relatedProblems: ["P3803"],
      source: "luogu",
      createdFrom: "training-center",
      reviewPriority: "high",
      status: "active",
      path: "knowledge/fragments/P3803-fft.md",
      refs: ["knowledge/fragments/P3803-fft.md"],
      lastModified: "2026-06-30T00:00:00.000Z",
      relationCount: 3,
      missingMetadataFlags: [],
      classificationReason: "explicit_type",
      classificationConfidence: 1,
      inDegree: 1,
      outDegree: 2,
      degree: 3,
      isolated: false,
      componentId: 0,
    };

    expect(row.missingMetadataFlags).toEqual([]);
    expect(row.componentId).toBe(0);
  });

  it("allows deterministic relationship suggestions and review slices", () => {
    const suggestion: KnowledgeRelationshipSuggestion = {
      id: "missing-related-problem:asset:a.md:problem:P3803",
      kind: "missing_related_problem",
      source: "asset:a.md",
      target: "problem:P3803",
      reason: "正文提到 P3803，但 related_problems 未声明。",
      refs: ["a.md"],
      preview: "P3803 appears in body",
      score: 2.4,
    };
    const reviewSlice: KnowledgeReviewSlice = {
      assetId: "asset:a.md",
      title: "A",
      path: "a.md",
      reviewPriority: "high",
      status: "active",
      kind: "mistake",
      topics: ["FFT"],
      relatedProblems: ["P3803"],
      lastReviewedAt: null,
      score: 4,
      reasons: ["high_priority", "mistake_or_template"],
    };

    expect(suggestion.kind).toBe("missing_related_problem");
    expect(reviewSlice.reasons).toContain("high_priority");
  });
});
