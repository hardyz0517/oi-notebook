import type { TrainingBatchDraft, TrainingItemDraft, TrainingSourceType } from "./knowledgeTypes";

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
  const title = `${input.problemId} ${input.problemTitle}`.trim();

  return {
    ...input,
    status: "pending",
    output: { fragment: true, article: false },
    fields: {
      title,
      oneLineProblem: "",
      coreIdea: "",
      pitfalls: "",
      reviewHint: "",
      topics: [],
      relatedProblems: input.problemId ? [input.problemId] : [],
      reviewPriority: "medium",
    },
  };
}
