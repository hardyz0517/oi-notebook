import type { TrainingBatchDraft, TrainingItemDraft, TrainingItemStatus } from "./knowledgeTypes";

export interface TrainingBatchStatusSummary {
  draft: number;
  ready: number;
  written: number;
  skipped: number;
  failed: number;
  total: number;
}

export interface TrainingWriteFeedbackInput {
  collectionWritten: boolean;
  fragmentResults: Array<{
    itemId: string;
    written: boolean;
    skipped: boolean;
  }>;
  edgeCount: number;
  collectionPath: string;
}

export interface TrainingWriteFeedback {
  collectionCount: number;
  fragmentCount: number;
  skippedCount: number;
  failedCount: number;
  edgeCount: number;
  collectionPath: string;
  writtenItemIds: string[];
  failedItemIds: string[];
}

export function canTrainingItemBecomeReady(item: TrainingItemDraft): boolean {
  return Boolean(item.output.fragment && item.problemId.trim() && item.problemTitle.trim() && item.fields.title.trim());
}

export function markTrainingItemReady(item: TrainingItemDraft): TrainingItemDraft {
  if (item.status === "written" || item.status === "skipped") return item;
  return {
    ...item,
    status: canTrainingItemBecomeReady(item) ? "ready" : "failed",
  };
}

export function skipTrainingItem(item: TrainingItemDraft): TrainingItemDraft {
  return item.status === "written" ? item : { ...item, status: "skipped" };
}

export function buildTrainingBatchStatusSummary(
  _batch: TrainingBatchDraft,
  items: TrainingItemDraft[],
): TrainingBatchStatusSummary {
  const summary: TrainingBatchStatusSummary = {
    draft: 0,
    ready: 0,
    written: 0,
    skipped: 0,
    failed: 0,
    total: items.length,
  };

  for (const item of items) {
    summary[item.status] += 1;
  }

  return summary;
}

export function isTrainingWriteEnabled(items: TrainingItemDraft[]): boolean {
  return items.some((item) => item.status === "ready" && item.output.fragment);
}

export function applyTrainingWriteFeedback(
  items: TrainingItemDraft[],
  feedback: Pick<TrainingWriteFeedback, "writtenItemIds" | "failedItemIds">,
): TrainingItemDraft[] {
  const written = new Set(feedback.writtenItemIds);
  const failed = new Set(feedback.failedItemIds);
  return items.map((item) => {
    let status: TrainingItemStatus = item.status;
    if (written.has(item.id)) status = "written";
    if (failed.has(item.id)) status = "failed";
    return status === item.status ? item : { ...item, status };
  });
}

export function buildTrainingWriteFeedback(input: TrainingWriteFeedbackInput): TrainingWriteFeedback {
  const writtenItemIds = input.fragmentResults
    .filter((result) => result.written)
    .map((result) => result.itemId);
  const failedItemIds = input.fragmentResults
    .filter((result) => !result.written && !result.skipped)
    .map((result) => result.itemId);

  return {
    collectionCount: input.collectionWritten ? 1 : 0,
    fragmentCount: writtenItemIds.length,
    skippedCount: input.fragmentResults.filter((result) => result.skipped).length,
    failedCount: failedItemIds.length + (input.collectionWritten ? 0 : 1),
    edgeCount: input.edgeCount,
    collectionPath: input.collectionPath,
    writtenItemIds,
    failedItemIds,
  };
}
