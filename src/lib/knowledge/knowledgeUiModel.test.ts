import { describe, expect, it } from "vitest";
import {
  buildKnowledgeOverviewStats,
  buildReviewRows,
  buildSuggestionRows,
  filterKnowledgeAssetRows,
  mapGraphToAssetRows,
} from "./knowledgeUiModel";
import type { KnowledgeGraphIndex } from "./knowledgeTypes";

const graph: KnowledgeGraphIndex = {
  generatedAt: "2026-06-30T00:00:00.000Z",
  nodes: [
    {
      id: "asset:knowledge/fragments/P3803.md",
      type: "asset",
      title: "P3803 FFT 复习",
      refs: ["knowledge/fragments/P3803.md"],
      assetType: "fragment",
      kind: "problem-note",
      source: "luogu",
      topics: ["FFT", "多项式"],
      status: "active",
      reviewPriority: "high",
      lastReviewedAt: "2026-06-01",
      createdAt: "2026-06-20",
    },
    {
      id: "asset:knowledge/collections/daily.md",
      type: "asset",
      title: "六月训练",
      refs: ["knowledge/collections/daily.md"],
      assetType: "collection",
      kind: "daily-log",
      source: "luogu",
      topics: ["FFT"],
      status: "active",
      reviewPriority: "medium",
      createdAt: "2026-06-29",
    },
    {
      id: "asset:knowledge/fragments/lonely.md",
      type: "asset",
      title: "孤立片段",
      refs: ["knowledge/fragments/lonely.md"],
      assetType: "fragment",
      kind: "mistake",
      source: "manual",
      topics: [],
      status: "draft",
      reviewPriority: "low",
      createdAt: "2026-06-28",
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
  ],
  assets: [],
  suggestions: [],
  reviewSlices: [],
};

describe("knowledgeUiModel", () => {
  it("maps graph asset nodes to dense rows with relation counts", () => {
    const rows = mapGraphToAssetRows(graph);

    expect(rows[0]).toMatchObject({
      id: "asset:knowledge/fragments/P3803.md",
      assetType: "fragment",
      relationCount: 2,
      topics: ["FFT", "多项式"],
      openPath: "knowledge/fragments/P3803.md",
    });
  });

  it("filters rows by type, topic, source, status, priority, relations, and date window", () => {
    const rows = mapGraphToAssetRows(graph);
    const filtered = filterKnowledgeAssetRows(rows, {
      assetType: "fragment",
      topic: "FFT",
      source: "luogu",
      status: "active",
      reviewPriority: "high",
      minRelations: 2,
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
    });

    expect(filtered.map((row) => row.title)).toEqual(["P3803 FFT 复习"]);
  });

  it("builds overview stats with high-frequency topics", () => {
    const stats = buildKnowledgeOverviewStats(graph);

    expect(stats).toMatchObject({
      nodeCount: 5,
      edgeCount: 2,
      fragmentCount: 2,
      collectionCount: 1,
    });
    expect(stats.topTopics[0]).toEqual({ topic: "FFT", count: 2 });
  });

  it("explains review ordering with concrete reasons", () => {
    const rows = mapGraphToAssetRows(graph);
    const reviewRows = buildReviewRows(rows, "2026-06-30");

    expect(reviewRows[0].title).toBe("P3803 FFT 复习");
    expect(reviewRows[0].reasons).toContain("高优先级");
    expect(reviewRows[0].reasons).toContain("29 天未复习");
  });

  it("keeps deterministic suggestions actionable through manual markdown open", () => {
    const suggestions = buildSuggestionRows(graph);

    expect(suggestions).toContainEqual(expect.objectContaining({
      targetTitle: "孤立片段",
      kind: "isolated-asset",
      score: 0.72,
      action: expect.objectContaining({
        kind: "open-markdown",
        enabled: true,
        path: "knowledge/fragments/lonely.md",
      }),
    }));
  });
});
