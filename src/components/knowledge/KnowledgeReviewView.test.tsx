import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { KnowledgeReviewRow } from "@/lib/knowledge/knowledgeUiModel";
import { KnowledgeReviewView } from "./KnowledgeReviewView";

function row(): KnowledgeReviewRow {
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
  };
}

describe("KnowledgeReviewView", () => {
  it("renders manual review-state controls instead of the disabled placeholder", () => {
    const html = renderToStaticMarkup(
      <KnowledgeReviewView rows={[row()]} onSaveReviewState={async () => undefined} />,
    );

    expect(html).toContain("保存复习状态");
    expect(html).toContain("标记已复习");
    expect(html).toContain("review_priority");
    expect(html).toContain("mastery");
    expect(html).not.toContain("等待安全 API 后写回长期状态");
  });
});
