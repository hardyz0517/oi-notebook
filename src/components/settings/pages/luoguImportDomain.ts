import type { PreviewLuoguSubmission } from "@/lib/api";
import type { LuoguImportRules } from "./luoguImportRules";

export interface LuoguSubmissionCandidateState {
  canSelect: boolean;
  defaultSelected: boolean;
  reason?: LuoguSubmissionCandidateReason;
  statusLabel: string;
}

export type LuoguSubmissionCandidateReason =
  | "skippedByUser"
  | "problemIdBlocked"
  | "importedRegenerate"
  | "importedShowUnselected"
  | "imported"
  | "nonAcRequired"
  | "nonAcOptional"
  | "sameProblemOldAcSkipped"
  | "sameProblemOldAcManual"
  | "candidate";

export type LuoguScanMode = "count" | "days";
export type LuoguScanCountLimit = 20 | 50 | 100 | 200;
export type LuoguScanDaysLimit = 30 | 90 | 180 | 365;

export function isLuoguImportCandidate(submission: PreviewLuoguSubmission): boolean {
  return submission.statusLabel === "可候选";
}

export function isLuoguProblemIdAllowedByRules(problemId: string, rules: LuoguImportRules): boolean {
  if (rules.problemIdFilter !== "onlyP") return true;
  return problemId.trim().toUpperCase().startsWith("P");
}

function parseLuoguSubmissionId(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getLuoguSubmissionCandidateReason(
  submission: PreviewLuoguSubmission,
  submissions: PreviewLuoguSubmission[],
  rules: LuoguImportRules,
  lastSubmissionId: number | null,
  skippedIds: Set<string>,
): LuoguSubmissionCandidateReason {
  if (skippedIds.has(submission.submissionId)) return "skippedByUser";

  if (!isLuoguProblemIdAllowedByRules(submission.problemId, rules)) return "problemIdBlocked";

  const submissionId = parseLuoguSubmissionId(submission.submissionId);
  if (lastSubmissionId !== null && submissionId !== null && submissionId <= lastSubmissionId) {
    if (rules.importedProblemPolicy === "regenerate") return "importedRegenerate";
    if (rules.importedProblemPolicy === "showUnselected") return "importedShowUnselected";
    return "imported";
  }

  if (rules.requireAc && !submission.isAc) return "nonAcRequired";

  if (!submission.isAc) return "nonAcOptional";

  const latestSameProblemAcId = submissions.reduce<number | null>((latest, item) => {
    if (!item.isAc || item.problemId !== submission.problemId) return latest;
    const itemId = parseLuoguSubmissionId(item.submissionId);
    if (itemId === null) return latest;
    return latest === null ? itemId : Math.max(latest, itemId);
  }, null);

  if (
    latestSameProblemAcId !== null &&
    submissionId !== null &&
    submissionId < latestSameProblemAcId
  ) {
    if (rules.sameProblemStrategy === "latestAc") return "sameProblemOldAcSkipped";
    if (rules.sameProblemStrategy === "manual") return "sameProblemOldAcManual";
  }

  return "candidate";
}

export function getLuoguSubmissionCandidateState(
  submission: PreviewLuoguSubmission,
  submissions: PreviewLuoguSubmission[],
  rules: LuoguImportRules,
  lastSubmissionId: number | null,
  skippedIds: Set<string>,
): LuoguSubmissionCandidateState {
  if (skippedIds.has(submission.submissionId)) {
    return { canSelect: false, defaultSelected: false, statusLabel: "已跳过" };
  }

  if (!isLuoguProblemIdAllowedByRules(submission.problemId, rules)) {
    return { canSelect: false, defaultSelected: false, statusLabel: "题号类型不符合规则" };
  }

  const submissionId = parseLuoguSubmissionId(submission.submissionId);
  if (lastSubmissionId !== null && submissionId !== null && submissionId <= lastSubmissionId) {
    if (rules.importedProblemPolicy === "regenerate") {
      return { canSelect: true, defaultSelected: true, statusLabel: "已导入，可重新生成" };
    }
    if (rules.importedProblemPolicy === "showUnselected") {
      return { canSelect: true, defaultSelected: false, statusLabel: "已导入，默认不选" };
    }
    return { canSelect: false, defaultSelected: false, statusLabel: "已导入" };
  }

  if (rules.requireAc && !submission.isAc) {
    return { canSelect: false, defaultSelected: false, statusLabel: "跳过：非 AC" };
  }

  if (!submission.isAc) {
    return { canSelect: true, defaultSelected: false, statusLabel: "非 AC，默认不选" };
  }

  const latestSameProblemAcId = submissions.reduce<number | null>((latest, item) => {
    if (!item.isAc || item.problemId !== submission.problemId) return latest;
    const itemId = parseLuoguSubmissionId(item.submissionId);
    if (itemId === null) return latest;
    return latest === null ? itemId : Math.max(latest, itemId);
  }, null);

  if (rules.sameProblemStrategy === "latestAc") {
    if (latestSameProblemAcId !== null && submissionId !== null && submissionId < latestSameProblemAcId) {
      return { canSelect: false, defaultSelected: false, statusLabel: "跳过：同题旧提交" };
    }
  }

  if (rules.sameProblemStrategy === "manual" && latestSameProblemAcId !== null && submissionId !== null && submissionId < latestSameProblemAcId) {
    return {
      canSelect: isLuoguImportCandidate(submission) || submission.isAc,
      defaultSelected: false,
      statusLabel: "同题旧提交，手动选择",
    };
  }

  return {
    canSelect: isLuoguImportCandidate(submission) || submission.isAc,
    defaultSelected: true,
    statusLabel: "可候选",
  };
}

export function getLuoguScanRangeLabel(
  mode: LuoguScanMode,
  countLimit: LuoguScanCountLimit,
  daysLimit: LuoguScanDaysLimit,
): string {
  return mode === "count" ? `最近 ${countLimit} 条` : `最近 ${daysLimit} 天`;
}
