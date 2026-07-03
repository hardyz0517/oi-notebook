import { describe, expect, it } from "vitest";
import { normalizeKnowledgeFrontmatter } from "./knowledgeFrontmatter";

describe("normalizeKnowledgeFrontmatter", () => {
  it("treats notes without type as legacy notes", () => {
    expect(normalizeKnowledgeFrontmatter({ title: "Old note" })).toMatchObject({
      type: "legacy-note",
      kind: "legacy-note",
      title: "Old note",
      status: "active",
    });
  });

  it("normalizes fragment metadata", () => {
    expect(
      normalizeKnowledgeFrontmatter({
        type: "fragment",
        kind: "problem-note",
        topics: [" FFT ", ""],
        related_problems: ["P3803"],
        source: "luogu",
        created_from: "training-center",
        review_priority: "high",
        mastery: "learning",
      }),
    ).toMatchObject({
      type: "fragment",
      kind: "problem-note",
      topics: ["FFT"],
      relatedProblems: ["P3803"],
      source: "luogu",
      createdFrom: "training-center",
      reviewPriority: "high",
      mastery: "learning",
    });
  });

  it("keeps mastery optional for legacy markdown", () => {
    expect(normalizeKnowledgeFrontmatter({ title: "Old note" })).toMatchObject({
      mastery: "new",
    });
  });
});
