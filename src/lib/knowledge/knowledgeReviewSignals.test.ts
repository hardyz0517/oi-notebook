import { describe, expect, it } from "vitest";
import type { KnowledgeAssetRow, KnowledgeGraphIndex } from "./knowledgeTypes";
import {
  buildP5RelationshipSuggestions,
  buildP5ReviewSignals,
  detectUnlinkedKnowledgeMentions,
  groupReviewAssetsByTopic,
  selectRecentReviewAssets,
} from "./knowledgeReviewSignals";

function asset(overrides: Partial<KnowledgeAssetRow>): KnowledgeAssetRow {
  return {
    id: "asset:knowledge/fragments/default.md",
    type: "asset",
    assetType: "fragment",
    kind: "problem-note",
    title: "Default",
    date: "",
    topics: [],
    relatedProblems: [],
    source: "manual",
    createdFrom: "manual",
    reviewPriority: "medium",
    status: "active",
    path: "knowledge/fragments/default.md",
    refs: ["knowledge/fragments/default.md"],
    lastModified: "",
    relationCount: 0,
    missingMetadataFlags: [],
    classificationReason: "test",
    classificationConfidence: 1,
    inDegree: 0,
    outDegree: 0,
    degree: 0,
    isolated: true,
    componentId: 0,
    ...overrides,
  };
}

const rows: KnowledgeAssetRow[] = [
  asset({
    id: "asset:knowledge/fragments/p1001.md",
    title: "P1001 最短路 trick",
    path: "knowledge/fragments/p1001.md",
    refs: ["knowledge/fragments/p1001.md"],
    topics: ["图论", "最短路"],
    relatedProblems: ["P1001"],
    reviewPriority: "high",
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z",
    lastModified: "2026-07-01T10:00:00.000Z",
    relationCount: 2,
    isolated: false,
  }),
  asset({
    id: "asset:knowledge/fragments/p1002.md",
    title: "P1002 Dijkstra 复盘",
    path: "knowledge/fragments/p1002.md",
    refs: ["knowledge/fragments/p1002.md"],
    topics: ["图论", "最短路"],
    relatedProblems: ["P1002"],
    createdAt: "2026-07-02T08:00:00.000Z",
    lastModified: "2026-07-02T08:00:00.000Z",
    relationCount: 2,
    isolated: false,
  }),
  asset({
    id: "asset:knowledge/fragments/lonely.md",
    title: "孤立技巧",
    path: "knowledge/fragments/lonely.md",
    refs: ["knowledge/fragments/lonely.md"],
    createdAt: "",
    updatedAt: "",
    lastModified: "",
  }),
  asset({
    id: "asset:knowledge/articles/fft.md",
    assetType: "article",
    title: "FFT 入门",
    path: "knowledge/articles/fft.md",
    refs: ["knowledge/articles/fft.md"],
    topics: ["FFT"],
    relatedProblems: ["P3803"],
    date: "2026-06-20",
    relationCount: 1,
    isolated: false,
  }),
];

const graph: KnowledgeGraphIndex = {
  generatedAt: "2026-07-03T00:00:00.000Z",
  nodes: [
    { id: "asset:knowledge/fragments/p1001.md", type: "asset", title: "P1001 最短路 trick", refs: ["knowledge/fragments/p1001.md"] },
    { id: "asset:knowledge/fragments/p1002.md", type: "asset", title: "P1002 Dijkstra 复盘", refs: ["knowledge/fragments/p1002.md"] },
    { id: "asset:knowledge/fragments/lonely.md", type: "asset", title: "孤立技巧", refs: ["knowledge/fragments/lonely.md"] },
    { id: "asset:knowledge/articles/fft.md", type: "asset", title: "FFT 入门", refs: ["knowledge/articles/fft.md"] },
    { id: "problem:P1001", type: "problem", title: "P1001", refs: ["knowledge/fragments/p1001.md"] },
    { id: "topic:图论", type: "topic", title: "图论", refs: ["knowledge/fragments/p1001.md", "knowledge/fragments/p1002.md"] },
    { id: "topic:FFT", type: "topic", title: "FFT", refs: ["knowledge/articles/fft.md"] },
  ],
  edges: [
    { from: "asset:knowledge/fragments/p1001.md", to: "problem:P1001", type: "mentions", source: "frontmatter", confidence: 1, refs: ["knowledge/fragments/p1001.md"] },
    { from: "asset:knowledge/fragments/p1001.md", to: "topic:图论", type: "related_to", source: "frontmatter", confidence: 1, refs: ["knowledge/fragments/p1001.md"] },
    { from: "asset:knowledge/fragments/p1002.md", to: "topic:图论", type: "related_to", source: "frontmatter", confidence: 1, refs: ["knowledge/fragments/p1002.md"] },
    { from: "asset:knowledge/articles/fft.md", to: "topic:FFT", type: "related_to", source: "frontmatter", confidence: 1, refs: ["knowledge/articles/fft.md"] },
  ],
  assets: rows,
  suggestions: [],
  reviewSlices: [],
  batches: [
    {
      batchId: "batch:graph",
      sourceType: "luogu-range",
      sourceLabel: "本周训练",
      createdAt: "2026-07-02T12:00:00.000Z",
      collectionPath: "knowledge/collections/week.md",
      writtenAssets: [{ kind: "fragment", path: "knowledge/fragments/p1002.md", title: "P1002 Dijkstra 复盘", problemId: "P1002" }],
      skippedItems: [],
      failedItems: [],
      graphRefresh: { nodeCount: 7, edgeCount: 4, refreshedAt: "2026-07-02T12:10:00.000Z" },
    },
  ],
};

describe("knowledgeReviewSignals", () => {
  it("selects recent assets by updated, created, batch, date, then stable fallback", () => {
    expect(selectRecentReviewAssets(rows, { batches: graph.batches }).map((row) => row.id)).toEqual([
      "asset:knowledge/fragments/p1002.md",
      "asset:knowledge/fragments/p1001.md",
      "asset:knowledge/articles/fft.md",
      "asset:knowledge/fragments/lonely.md",
    ]);
  });

  it("groups review assets by topic with stable counts and item ordering", () => {
    const groups = groupReviewAssetsByTopic(rows);

    expect(groups[0]).toMatchObject({
      topic: "图论",
      count: 2,
    });
    expect(groups[0].items.map((item) => item.title)).toEqual(["P1002 Dijkstra 复盘", "P1001 最短路 trick"]);
  });

  it("detects unlinked problem ids and OI terms from supplied content excerpts", () => {
    const mentions = detectUnlinkedKnowledgeMentions([
      {
        asset: rows[2],
        content: "这段总结提到了 P3379、LCA 和倍增，但 frontmatter 还没补齐。",
      },
    ], graph);

    expect(mentions.map((item) => item.reasonCode)).toEqual(["unlinked_problem_id", "unlinked_oi_term", "unlinked_oi_term"]);
    expect(mentions.map((item) => item.mention)).toEqual(["P3379", "倍增", "LCA"]);
  });

  it("builds review signals for recent, topic, isolated, and unlinked mention sections", () => {
    const signals = buildP5ReviewSignals({
      graph,
      assets: rows,
      contentByAssetId: {
        "asset:knowledge/fragments/lonely.md": "P3379 最近公共祖先 LCA 倍增",
      },
    });

    expect(signals.recentAssets[0].title).toBe("P1002 Dijkstra 复盘");
    expect(signals.topicGroups.map((group) => group.topic)).toContain("图论");
    expect(signals.isolatedAssets.map((item) => item.title)).toEqual(["孤立技巧"]);
    expect(signals.unlinkedMentions).toContainEqual(expect.objectContaining({
      assetId: "asset:knowledge/fragments/lonely.md",
      mention: "P3379",
      reasonCode: "unlinked_problem_id",
    }));
  });

  it("builds explainable rule relationship suggestions without AI state", () => {
    const suggestions = buildP5RelationshipSuggestions({
      graph,
      assets: rows,
      contentByAssetId: {
        "asset:knowledge/fragments/lonely.md": "P3379 最近公共祖先 LCA 倍增",
      },
    });

    expect(suggestions).toContainEqual(expect.objectContaining({
      kind: "missing_related_problem",
      source: "asset:knowledge/fragments/lonely.md",
      target: "problem:P3379",
      reasonCode: "unlinked_problem_id",
      aiGenerated: false,
    }));
    expect(suggestions).toContainEqual(expect.objectContaining({
      kind: "related_asset",
      source: "asset:knowledge/fragments/p1001.md",
      target: "asset:knowledge/fragments/p1002.md",
      reasonCode: "shared_topics",
    }));
    expect(suggestions.map((item) => item.id)).toEqual([...suggestions.map((item) => item.id)].sort());
  });
});
