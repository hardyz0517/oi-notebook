import { describe, expect, it } from "vitest";
import { buildTrainingAiContext } from "./aiReservationContracts";
import { buildMockKnowledgeProposals } from "./aiReservationMockProposals";
import type { TrainingBatchDraft, TrainingItemDraft } from "./knowledgeTypes";

const batch: TrainingBatchDraft = {
  id: "batch:mock-p4b",
  title: "P4-B mock bridge",
  sourceType: "luogu-today",
  sourceLabel: "今日",
  createdAt: "2026-07-03T09:00:00.000Z",
  status: "draft",
  itemIds: ["item:P3803"],
  collectionKind: "daily-log",
};

const readyItem: TrainingItemDraft = {
  id: "item:P3803",
  batchId: batch.id,
  problemId: "P3803",
  problemTitle: "多项式乘法",
  submitTime: "2026-07-03T08:30:00.000Z",
  difficulty: "提高+/省选-",
  status: "ready",
  sourceType: "luogu-today",
  sourceRefs: ["luogu:problem:P3803"],
  submissionRefs: ["luogu:submission:123"],
  existingAssetRefs: ["knowledge/fragments/P3803.md"],
  suggestedTopics: ["FFT"],
  output: { fragment: true, article: false },
  fields: {
    title: "P3803 多项式乘法",
    oneLineProblem: "给两个多项式，求乘积系数。",
    coreIdea: "使用 FFT 做点值表示下的卷积。",
    pitfalls: "注意位逆序和单位根方向。",
    reviewHint: "考前复习单位根和 inverse FFT。",
    topics: ["FFT", "多项式"],
    relatedProblems: ["P3803"],
    reviewPriority: "high",
  },
};

describe("aiReservationMockProposals", () => {
  it("returns no mock proposals when no training item is selected", () => {
    const context = buildTrainingAiContext({
      batch,
      items: [readyItem],
      selectedItemId: null,
    });

    expect(buildMockKnowledgeProposals(context, { createdAt: "2026-07-03T09:10:00.000Z" })).toEqual([]);
  });

  it("builds disabled previews for a selected ready item", () => {
    const context = buildTrainingAiContext({
      batch,
      items: [readyItem],
      selectedItemId: readyItem.id,
    });

    const proposals = buildMockKnowledgeProposals(context, { createdAt: "2026-07-03T09:10:00.000Z" });

    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      id: "mock-proposal:item:P3803",
      contextId: context.contextId,
      status: "mock-disabled",
      aiGenerated: false,
    });
    expect(proposals[0].previews).toHaveLength(3);
    expect(proposals[0].previews.every((preview) => preview.executable === false)).toBe(true);
    expect(proposals[0].previews.map((preview) => preview.intent.kind)).toEqual([
      "update-frontmatter",
      "link-knowledge",
      "append-markdown-section",
    ]);
  });

  it("keeps illegal NoteX targets as invalid disabled previews for the UI", () => {
    const context = buildTrainingAiContext({
      batch,
      items: [readyItem],
      selectedItemId: readyItem.id,
    });

    const proposals = buildMockKnowledgeProposals(context, { createdAt: "2026-07-03T09:10:00.000Z" });
    const notexPreview = proposals[0].previews.find((preview) => preview.target.kind === "notex-note");

    expect(notexPreview).toMatchObject({
      valid: false,
      validationReason: "notes-targets-disabled-in-p4a",
      executable: false,
      target: {
        kind: "notex-note",
        path: "notes/P3803.md",
      },
    });
  });

  it("preserves mock source metadata on every generated preview", () => {
    const context = buildTrainingAiContext({
      batch,
      items: [readyItem],
      selectedItemId: readyItem.id,
    });

    const proposals = buildMockKnowledgeProposals(context, { createdAt: "2026-07-03T09:10:00.000Z" });

    expect(proposals[0].previews.map((preview) => preview.source)).toEqual([
      {
        kind: "mock",
        stage: "p4-b",
        contextId: context.contextId,
        createdAt: "2026-07-03T09:10:00.000Z",
      },
      {
        kind: "mock",
        stage: "p4-b",
        contextId: context.contextId,
        createdAt: "2026-07-03T09:10:00.000Z",
      },
      {
        kind: "mock",
        stage: "p4-b",
        contextId: context.contextId,
        createdAt: "2026-07-03T09:10:00.000Z",
      },
    ]);
  });
});
