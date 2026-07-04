import { describe, expect, it } from "vitest";
import {
  buildTrainingAiContext,
  normalizeMockKnowledgeProposal,
  normalizePatchPreview,
  validateKnowledgePatchTarget,
} from "./aiReservationContracts";
import type { KnowledgeGraphIndex, TrainingBatchDraft, TrainingItemDraft } from "./knowledgeTypes";

const batch: TrainingBatchDraft = {
  id: "batch:2026-07-03",
  title: "P4 context batch",
  sourceType: "luogu-problemset",
  sourceLabel: "problemset P4",
  createdAt: "2026-07-03T08:00:00.000Z",
  status: "draft",
  itemIds: ["item:P3803", "item:P3383"],
  collectionKind: "problemset-review",
  sourceInput: "T100",
};

const items: TrainingItemDraft[] = [
  {
    id: "item:P3803",
    batchId: batch.id,
    problemId: "P3803",
    problemTitle: "Polynomial multiplication",
    status: "ready",
    sourceType: "luogu-problemset",
    sourceRefs: ["luogu:problem:P3803"],
    submissionRefs: ["submission:1"],
    suggestedTopics: ["FFT"],
    existingAssetRefs: ["knowledge/fragments/P3803.md"],
    output: { fragment: true, article: false },
    fields: {
      title: "P3803 FFT note",
      oneLineProblem: "multiply polynomials",
      coreIdea: "FFT divide and conquer",
      pitfalls: "remember bit reversal",
      reviewHint: "review roots of unity",
      topics: ["FFT", "polynomial"],
      relatedProblems: ["P3803"],
      reviewPriority: "high",
    },
  },
  {
    id: "item:P3383",
    batchId: batch.id,
    problemId: "P3383",
    problemTitle: "Linear sieve",
    status: "draft",
    output: { fragment: true, article: true },
    fields: {
      title: "P3383 sieve note",
      oneLineProblem: "",
      coreIdea: "",
      pitfalls: "",
      reviewHint: "",
      topics: ["number theory"],
      relatedProblems: ["P3383"],
      reviewPriority: "medium",
    },
  },
];

const graph: KnowledgeGraphIndex = {
  generatedAt: "2026-07-03T08:10:00.000Z",
  nodes: [
    {
      id: "asset:knowledge/fragments/P3803.md",
      type: "asset",
      title: "P3803 fragment",
      refs: ["knowledge/fragments/P3803.md"],
      assetType: "fragment",
      kind: "problem-note",
      topics: ["FFT"],
      reviewPriority: "high",
      status: "active",
    },
    {
      id: "asset:knowledge/articles/fft.md",
      type: "asset",
      title: "FFT article",
      refs: ["knowledge/articles/fft.md"],
      assetType: "article",
      kind: "algorithm-note",
      topics: ["FFT"],
    },
    {
      id: "asset:knowledge/collections/poly.md",
      type: "asset",
      title: "Polynomial collection",
      refs: ["knowledge/collections/poly.md"],
      assetType: "collection",
      kind: "topic-review",
      topics: ["polynomial"],
    },
    {
      id: "problem:P3803",
      type: "problem",
      title: "P3803",
      refs: ["knowledge/fragments/P3803.md"],
    },
    {
      id: "topic:FFT",
      type: "topic",
      title: "FFT",
      refs: ["knowledge/fragments/P3803.md"],
    },
  ],
  edges: [
    {
      from: "asset:knowledge/fragments/P3803.md",
      to: "problem:P3803",
      type: "mentions",
      source: "problem_id_match",
      confidence: 1,
      refs: ["knowledge/fragments/P3803.md"],
    },
    {
      from: "asset:knowledge/fragments/P3803.md",
      to: "topic:FFT",
      type: "related_to",
      source: "frontmatter",
      confidence: 1,
      refs: ["knowledge/fragments/P3803.md"],
    },
    {
      from: "asset:knowledge/articles/fft.md",
      to: "topic:FFT",
      type: "related_to",
      source: "frontmatter",
      confidence: 1,
      refs: ["knowledge/articles/fft.md"],
    },
    {
      from: "asset:knowledge/collections/poly.md",
      to: "problem:P3803",
      type: "contains",
      source: "frontmatter",
      confidence: 1,
      refs: ["knowledge/collections/poly.md"],
    },
  ],
  assets: [],
  suggestions: [],
  reviewSlices: [],
  batches: [],
};

describe("aiReservationContracts", () => {
  it("builds an empty-selection reservation context without requiring AI or note writes", () => {
    const context = buildTrainingAiContext({
      batch,
      items,
      selectedItemId: null,
      graph,
    });

    expect(context.kind).toBe("training-ai-context");
    expect(context.ai).toEqual({
      enabled: false,
      modelConnected: false,
      reason: "reserved-for-future-ai",
    });
    expect(context.selection).toEqual({ kind: "none" });
    expect(context.reviewState).toMatchObject({ ready: 1, draft: 1, written: 0 });
  });

  it("describes selected training items and trims graph neighbors deterministically", () => {
    const context = buildTrainingAiContext({
      batch,
      items,
      selectedItemId: "item:P3803",
      graph,
      maxGraphNeighbors: 2,
    });

    expect(context.selection).toMatchObject({
      kind: "problem",
      problemId: "P3803",
      trainingItemId: "item:P3803",
      title: "P3803 FFT note",
    });
    expect(context.selectedTrainingItem?.fields).toMatchObject({
      coreIdea: "FFT divide and conquer",
      reviewPriority: "high",
    });
    expect(context.graph.neighbors).toHaveLength(2);
    expect(context.graph.truncated).toBe(true);
    expect(context.graph.neighbors.map((node) => node.id)).toEqual([
      "asset:knowledge/collections/poly.md",
      "asset:knowledge/fragments/P3803.md",
    ]);
  });

  it("supports fragment, article, collection, and problem selections for later P4-B consumers", () => {
    expect(buildTrainingAiContext({
      batch,
      items,
      selectedItemId: null,
      graph,
      selection: { kind: "fragment", id: "asset:knowledge/fragments/P3803.md", path: "knowledge/fragments/P3803.md" },
    }).selection.kind).toBe("fragment");

    expect(buildTrainingAiContext({
      batch,
      items,
      selectedItemId: null,
      graph,
      selection: { kind: "article", id: "asset:knowledge/articles/fft.md", path: "knowledge/articles/fft.md" },
    }).selection.kind).toBe("article");

    expect(buildTrainingAiContext({
      batch,
      items,
      selectedItemId: null,
      graph,
      selection: { kind: "collection", id: "asset:knowledge/collections/poly.md", path: "knowledge/collections/poly.md" },
    }).selection.kind).toBe("collection");

    expect(buildTrainingAiContext({
      batch,
      items,
      selectedItemId: null,
      graph,
      selection: { kind: "problem", problemId: "P3803", title: "P3803" },
    }).selection.kind).toBe("problem");
  });

  it("rejects unsafe or incomplete patch targets before any execution layer exists", () => {
    expect(validateKnowledgePatchTarget({
      kind: "notex-note",
      path: "notes/real.md",
    })).toMatchObject({ ok: false, reason: "notes-targets-disabled-in-p4a" });

    expect(validateKnowledgePatchTarget({
      kind: "knowledge-asset",
      assetType: "fragment",
      path: "../outside.md",
    })).toMatchObject({ ok: false, reason: "unsafe-relative-path" });

    expect(validateKnowledgePatchTarget({
      kind: "review-state",
      assetId: "",
    })).toMatchObject({ ok: false, reason: "missing-asset-id" });
  });

  it("keeps legal patch previews serializable and preserves source metadata", () => {
    const preview = normalizePatchPreview({
      id: "preview:1",
      title: "Add review hint",
      target: {
        kind: "knowledge-asset",
        assetType: "fragment",
        path: "knowledge/fragments/P3803.md",
      },
      intent: {
        kind: "append-markdown-section",
        heading: "Review",
        markdown: "Check inverse FFT.",
      },
      source: {
        kind: "mock",
        stage: "p4-a",
        contextId: "ctx:1",
        createdAt: "2026-07-03T08:15:00.000Z",
      },
    });

    expect(preview.valid).toBe(true);
    expect(preview.source).toEqual({
      kind: "mock",
      stage: "p4-a",
      contextId: "ctx:1",
      createdAt: "2026-07-03T08:15:00.000Z",
    });
    expect(JSON.parse(JSON.stringify(preview))).toMatchObject({
      id: "preview:1",
      target: { kind: "knowledge-asset" },
      intent: { kind: "append-markdown-section" },
    });
  });

  it("normalizes mock proposals into disabled AI suggestion slots for P4-B", () => {
    const proposal = normalizeMockKnowledgeProposal({
      id: "proposal:1",
      title: "Condense selected fragment",
      contextId: "ctx:1",
      previews: [
        {
          id: "preview:frontmatter",
          title: "Raise priority",
          target: {
            kind: "knowledge-asset",
            assetType: "fragment",
            path: "knowledge/fragments/P3803.md",
          },
          intent: {
            kind: "update-frontmatter",
            fields: { review_priority: "high" },
          },
          source: {
            kind: "mock",
            stage: "p4-a",
            contextId: "ctx:1",
            createdAt: "2026-07-03T08:20:00.000Z",
          },
        },
      ],
    });

    expect(proposal.status).toBe("mock-disabled");
    expect(proposal.aiGenerated).toBe(false);
    expect(proposal.previews).toHaveLength(1);
    expect(proposal.previews[0].valid).toBe(true);
  });
});
