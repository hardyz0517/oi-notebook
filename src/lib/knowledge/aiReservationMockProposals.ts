import {
  normalizeMockKnowledgeProposal,
  type MockKnowledgeProposal,
  type PatchPreviewInput,
  type PatchPreviewSource,
  type TrainingAiContext,
  type TrainingAiItemSummary,
} from "./aiReservationContracts";
import { normalizeKnowledgeList, normalizeKnowledgeText } from "./knowledgeTypes";

export interface BuildMockKnowledgeProposalsOptions {
  createdAt?: string;
}

function safeFragmentPath(item: TrainingAiItemSummary): string {
  const existingFragment = item.existingAssetRefs.find((ref) => /^knowledge[\\/]fragments[\\/].+\.md$/i.test(ref.trim()));
  if (existingFragment) return existingFragment;
  const slug = normalizeKnowledgeText(item.problemId, item.id).replace(/[\\/:*?"<>|]+/g, "-");
  return `knowledge/fragments/mock/${slug || "draft-fragment"}.md`;
}

function sourceFor(context: TrainingAiContext, createdAt: string): PatchPreviewSource {
  return {
    kind: "mock",
    stage: "p4-b",
    contextId: context.contextId,
    createdAt,
  };
}

function topicTargetFor(item: TrainingAiItemSummary): string {
  const topic = normalizeKnowledgeList([
    ...item.fields.topics,
    item.fields.coreIdea,
    item.problemTitle,
  ])[0];
  return `topic:${topic || "待补充主题"}`;
}

function buildSelectedItemPreviews(
  context: TrainingAiContext,
  item: TrainingAiItemSummary,
  createdAt: string,
): PatchPreviewInput[] {
  const source = sourceFor(context, createdAt);
  const fragmentPath = safeFragmentPath(item);
  const problemNodeId = `problem:${item.problemId}`;
  const topicNodeId = topicTargetFor(item);

  return [
    {
      id: `mock-preview:${item.id}:frontmatter`,
      title: "预览 frontmatter 补全",
      target: {
        kind: "knowledge-asset",
        assetType: "fragment",
        path: fragmentPath,
      },
      intent: {
        kind: "update-frontmatter",
        fields: {
          topics: item.fields.topics,
          related_problems: item.fields.relatedProblems,
          review_priority: item.fields.reviewPriority,
          status: "active",
        },
      },
      source,
      summary: "仅展示未来可由 AI 建议的 fragment 元数据变更，不会写入文件。",
    },
    {
      id: `mock-preview:${item.id}:relationship`,
      title: "预览知识关联",
      target: {
        kind: "knowledge-relationship",
        fromId: problemNodeId,
        toId: topicNodeId,
        relationshipType: "related_to",
      },
      intent: {
        kind: "link-knowledge",
        relationshipType: "related_to",
        sourceId: problemNodeId,
        targetId: topicNodeId,
      },
      source,
      summary: "仅展示未来可由 AI 建议的题目与主题关系，不会更新图谱或 Markdown。",
    },
    {
      id: `mock-preview:${item.id}:notex`,
      title: "预览 NoteX 修改建议",
      target: {
        kind: "notex-note",
        path: `notes/${item.problemId || item.id}.md`,
      },
      intent: {
        kind: "append-markdown-section",
        heading: "AI 提炼建议（预留）",
        markdown: [
          item.fields.reviewHint || item.fields.coreIdea || "等待未来 AI 根据当前训练上下文生成建议。",
          "",
          "P4-B mock：此预览不会应用到 NoteX 或真实笔记。",
        ].join("\n"),
      },
      source,
      summary: "故意保留为 invalid target：P4-B 不允许 NoteX / notes 写入。",
    },
  ];
}

export function buildMockKnowledgeProposals(
  context: TrainingAiContext,
  options: BuildMockKnowledgeProposalsOptions = {},
): MockKnowledgeProposal[] {
  const selectedItem = context.selectedTrainingItem;
  if (!selectedItem || context.selection.kind === "none") return [];

  const createdAt = options.createdAt ?? new Date().toISOString();
  return [
    normalizeMockKnowledgeProposal({
      id: `mock-proposal:${selectedItem.id}`,
      title: "AI 提炼 / 关联 / NoteX 修改建议（预留）",
      contextId: context.contextId,
      summary: "P4-B mock proposal：基于当前训练条目生成的不可执行预览；未调用模型，也不会写入 notes。",
      previews: buildSelectedItemPreviews(context, selectedItem, createdAt),
    }),
  ];
}
