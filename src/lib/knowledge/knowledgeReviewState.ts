import type { KnowledgeReviewRow } from "./knowledgeUiModel";
import type { ReviewMastery, ReviewPriority } from "./knowledgeTypes";

export const REVIEW_PRIORITY_VALUES = ["low", "medium", "high", "none"] as const satisfies readonly ReviewPriority[];
export const REVIEW_MASTERY_VALUES = ["new", "learning", "familiar", "mastered"] as const satisfies readonly ReviewMastery[];

export interface KnowledgeReviewStateRequest {
  relativePath: string;
  reviewPriority: ReviewPriority;
  mastery: ReviewMastery;
  lastReviewedAt: string;
}

export function isReviewPriority(value: string): value is ReviewPriority {
  return REVIEW_PRIORITY_VALUES.includes(value as ReviewPriority);
}

export function isReviewMastery(value: string): value is ReviewMastery {
  return REVIEW_MASTERY_VALUES.includes(value as ReviewMastery);
}

export function normalizeReviewPriority(value: string | undefined): ReviewPriority {
  return value && isReviewPriority(value) ? value : "medium";
}

export function normalizeReviewMastery(value: string | undefined): ReviewMastery {
  return value && isReviewMastery(value) ? value : "new";
}

export function getKnowledgeReviewOpenPath(row: Pick<KnowledgeReviewRow, "openPath" | "path" | "refs">): string {
  return row.openPath || row.path || row.refs[0] || "";
}

export function buildKnowledgeReviewStateRequest(
  row: KnowledgeReviewRow,
  input: {
    reviewPriority: string;
    mastery: string;
    lastReviewedAt: string;
  },
): KnowledgeReviewStateRequest {
  const relativePath = getKnowledgeReviewOpenPath(row).trim();
  if (!relativePath) {
    throw new Error("复习状态写回失败：Markdown 路径为空");
  }
  if (!relativePath.toLowerCase().endsWith(".md")) {
    throw new Error("复习状态写回失败：只能更新 Markdown 文件");
  }
  if (!isReviewPriority(input.reviewPriority)) {
    throw new Error(`复习状态写回失败：未知 review_priority ${input.reviewPriority}`);
  }
  if (!isReviewMastery(input.mastery)) {
    throw new Error(`复习状态写回失败：未知 mastery ${input.mastery}`);
  }
  const reviewedAt = input.lastReviewedAt.trim();
  if (!reviewedAt || Number.isNaN(Date.parse(reviewedAt))) {
    throw new Error("复习状态写回失败：last_reviewed_at 无效");
  }

  return {
    relativePath,
    reviewPriority: input.reviewPriority,
    mastery: input.mastery,
    lastReviewedAt: reviewedAt,
  };
}
