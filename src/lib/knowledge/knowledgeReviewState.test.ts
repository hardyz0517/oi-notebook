import { describe, expect, it } from "vitest";
import type { KnowledgeReviewRow } from "./knowledgeUiModel";
import {
  buildKnowledgeReviewStateRequest,
  normalizeReviewMastery,
  normalizeReviewPriority,
} from "./knowledgeReviewState";

function row(overrides: Partial<KnowledgeReviewRow> = {}): KnowledgeReviewRow {
  return {
    id: "asset:knowledge/fragments/p3803.md",
    type: "asset",
    assetType: "fragment",
    kind: "problem-note",
    title: "P3803 FFT",
    date: "2026-07-03",
    topics: ["FFT"],
    relatedProblems: ["P3803"],
    source: "manual",
    createdFrom: "manual",
    reviewPriority: "medium",
    mastery: "new",
    status: "active",
    path: "knowledge/fragments/p3803.md",
    refs: ["knowledge/fragments/p3803.md"],
    lastModified: "2026-07-03",
    relationCount: 1,
    missingMetadataFlags: [],
    classificationReason: "test",
    classificationConfidence: 1,
    inDegree: 0,
    outDegree: 1,
    degree: 1,
    isolated: false,
    componentId: 0,
    lastReviewedAt: null,
    reasons: ["最近新增"],
    reviewScore: 1,
    canEditLongTermState: true,
    ...overrides,
  };
}

describe("knowledgeReviewState", () => {
  it("builds typed review state requests from review rows", () => {
    expect(buildKnowledgeReviewStateRequest(row(), {
      reviewPriority: "high",
      mastery: "familiar",
      lastReviewedAt: "2026-07-03T12:00:00.000Z",
    })).toEqual({
      relativePath: "knowledge/fragments/p3803.md",
      reviewPriority: "high",
      mastery: "familiar",
      lastReviewedAt: "2026-07-03T12:00:00.000Z",
    });
  });

  it("rejects empty, non-markdown, and unknown enum requests before IPC", () => {
    expect(() => buildKnowledgeReviewStateRequest(row({ path: "", refs: [], openPath: "" }), {
      reviewPriority: "high",
      mastery: "familiar",
      lastReviewedAt: "2026-07-03T12:00:00.000Z",
    })).toThrow("路径为空");
    expect(() => buildKnowledgeReviewStateRequest(row({ path: "knowledge/fragments/p3803.txt" }), {
      reviewPriority: "high",
      mastery: "familiar",
      lastReviewedAt: "2026-07-03T12:00:00.000Z",
    })).toThrow("Markdown");
    expect(() => buildKnowledgeReviewStateRequest(row(), {
      reviewPriority: "urgent",
      mastery: "familiar",
      lastReviewedAt: "2026-07-03T12:00:00.000Z",
    })).toThrow("review_priority");
    expect(() => buildKnowledgeReviewStateRequest(row(), {
      reviewPriority: "high",
      mastery: "expert",
      lastReviewedAt: "2026-07-03T12:00:00.000Z",
    })).toThrow("mastery");
  });

  it("normalizes display drafts for legacy graph rows", () => {
    expect(normalizeReviewPriority("unexpected")).toBe("medium");
    expect(normalizeReviewMastery("stable")).toBe("new");
  });
});
