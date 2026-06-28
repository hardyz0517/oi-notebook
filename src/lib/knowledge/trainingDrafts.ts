import {
  createTrainingBatchSlug,
  createTrainingItemSlug,
  normalizeKnowledgeText,
  type TrainingBatchDraft,
  type TrainingBatchWritePlan,
  type TrainingItemDraft,
  type TrainingItemOutputSelection,
  type TrainingSourceType,
} from "./knowledgeTypes";
import { buildCollectionMarkdown, buildFragmentMarkdown } from "./knowledgeTemplates";

export function createTrainingBatchDraft(input: {
  id: string;
  title: string;
  sourceType: TrainingSourceType;
  sourceLabel: string;
  createdAt: string;
  itemIds: string[];
}): TrainingBatchDraft {
  return {
    ...input,
    status: "draft",
    itemIds: [...input.itemIds],
  };
}

export function createTrainingItemDraft(input: {
  id: string;
  batchId: string;
  problemId?: string;
  problemTitle?: string;
  submissionId?: string;
  submitTime?: string;
  difficulty?: string;
}): TrainingItemDraft {
  const problemId = normalizeKnowledgeText(input.problemId ?? "", input.id);
  const problemTitle = (input.problemTitle ?? "").trim();

  return {
    id: input.id,
    batchId: input.batchId,
    problemId,
    problemTitle,
    submissionId: input.submissionId,
    submitTime: input.submitTime,
    difficulty: input.difficulty,
    status: "pending",
    output: { fragment: true, article: false },
    fields: {
      title: normalizeKnowledgeText(problemTitle ? `${problemId} ${problemTitle}` : problemId, problemId),
      oneLineProblem: "",
      coreIdea: "",
      pitfalls: "",
      reviewHint: "",
      topics: [],
      relatedProblems: problemId ? [problemId] : [],
      reviewPriority: "medium",
    },
  };
}

export function createProblemTrainingItemDraft(input: {
  id: string;
  batchId: string;
  problemId: string;
  problemTitle: string;
  submissionId?: string;
  submitTime?: string;
  difficulty?: string;
}): TrainingItemDraft {
  return createTrainingItemDraft(input);
}

export function toggleTrainingItemOutput(
  item: TrainingItemDraft,
  output: keyof TrainingItemOutputSelection,
  enabled: boolean,
): TrainingItemDraft {
  const nextOutput = {
    ...item.output,
    [output]: enabled,
  };

  return nextOutput.fragment || nextOutput.article
    ? { ...item, output: nextOutput }
    : { ...item, output: nextOutput, status: item.status === "written" ? item.status : "skipped" };
}

function buildCollectionPath(batch: TrainingBatchDraft): string {
  return `knowledge/collections/${createTrainingBatchSlug(batch)}.md`;
}

function buildFragmentPath(batch: TrainingBatchDraft, item: TrainingItemDraft): string {
  return `knowledge/fragments/${createTrainingBatchSlug(batch)}/${createTrainingItemSlug(item)}.md`;
}

export function buildTrainingBatchWritePlan(
  batch: TrainingBatchDraft,
  items: TrainingItemDraft[],
): TrainingBatchWritePlan {
  const writableItems = items.filter((item) => item.output.fragment && item.problemId.trim() && item.problemTitle.trim());
  const collectionRelativePath = buildCollectionPath(batch);
  const fragmentPaths = writableItems.map((item) => buildFragmentPath(batch, item));

  return {
    collection: {
      relativePath: collectionRelativePath,
      markdown: buildCollectionMarkdown(batch, writableItems, fragmentPaths),
    },
    fragments: writableItems.map((item) => ({
      itemId: item.id,
      relativePath: buildFragmentPath(batch, item),
      markdown: buildFragmentMarkdown(item, collectionRelativePath),
    })),
    skippedItems: items
      .filter((item) => !item.output.fragment || !item.problemId.trim() || !item.problemTitle.trim())
      .map((item) => ({
        itemId: item.id,
        reason: !item.output.fragment ? "fragment-disabled" : "incomplete",
      })),
  };
}

export function buildTrainingBatchTitle(batch: TrainingBatchDraft): string {
  return normalizeKnowledgeText(batch.title, createTrainingBatchSlug(batch));
}
