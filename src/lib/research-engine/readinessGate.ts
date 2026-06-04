import type { CandidateSource, ReadinessGateDecision, ReadinessGateInput } from "./types";

const isPriorityCandidate = (candidate: CandidateSource): boolean =>
  candidate.priority === "core" || candidate.priority === "preferred";

const isFinished = (candidate: CandidateSource): boolean =>
  candidate.readState === "finished" ||
  candidate.readState === "failed" ||
  candidate.readState === "timeout" ||
  candidate.status === "rejected" ||
  candidate.status === "zombie_discarded";

const countEvidence = (candidates: CandidateSource[]) => ({
  strong: candidates.filter((candidate) => candidate.evidence.level === "strong").length,
  medium: candidates.filter((candidate) => candidate.evidence.level === "medium").length,
  weak: candidates.filter((candidate) => candidate.evidence.level === "weak").length,
  none: candidates.filter((candidate) => candidate.evidence.level === "none").length,
});

export const evaluateReadinessGate = (input: ReadinessGateInput): ReadinessGateDecision => {
  const elapsedMs = Math.max(0, input.nowMs - input.startedAtMs);
  const priorityCandidates = input.candidates
    .filter(isPriorityCandidate)
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
    .slice(0, input.config.priorityTopK);
  const blockingCandidateIds = priorityCandidates
    .filter((candidate) => !isFinished(candidate))
    .map((candidate) => candidate.id);
  const evidence = countEvidence(input.candidates.filter((candidate) => candidate.status !== "zombie_discarded"));
  const reachedSoftDeadline = elapsedMs >= input.config.softDeadlineMs;
  const reachedHardDeadline = elapsedMs >= input.config.hardDeadlineMs;
  const priorityBarrierReleased = blockingCandidateIds.length === 0 || reachedSoftDeadline;
  const mediumOrBetter = evidence.strong + evidence.medium;
  const thresholdMet = input.risk === "high"
    ? evidence.strong >= input.config.minStrongEvidence
    : evidence.strong >= input.config.minStrongEvidence || mediumOrBetter >= input.config.minMediumEvidence;

  const evidenceSummary = {
    ...evidence,
    priorityPending: blockingCandidateIds.length,
    priorityFinished: priorityCandidates.length - blockingCandidateIds.length,
  };

  if (input.risk === "high" && evidence.strong < input.config.minStrongEvidence) {
    return {
      canAnswerNow: false,
      shouldWaitForPriority: !reachedHardDeadline && blockingCandidateIds.length > 0,
      shouldContinueReading: !reachedHardDeadline,
      outcome: reachedHardDeadline ? "failed_insufficient_evidence" : "wait",
      reason: reachedHardDeadline ? "hard_deadline_without_strong_high_risk_evidence" : "high_risk_requires_strong_evidence",
      blockingCandidateIds,
      evidenceSummary,
    };
  }

  if (!priorityBarrierReleased) {
    return {
      canAnswerNow: false,
      shouldWaitForPriority: true,
      shouldContinueReading: true,
      outcome: "wait",
      reason: "waiting_for_priority_candidates_before_soft_deadline",
      blockingCandidateIds,
      evidenceSummary,
    };
  }

  if (thresholdMet) {
    return {
      canAnswerNow: true,
      shouldWaitForPriority: false,
      shouldContinueReading: false,
      outcome: "ready",
      reason: "evidence_threshold_and_priority_barrier_satisfied",
      blockingCandidateIds: [],
      evidenceSummary,
    };
  }

  return {
    canAnswerNow: false,
    shouldWaitForPriority: false,
    shouldContinueReading: !reachedHardDeadline,
    outcome: reachedHardDeadline ? "failed_insufficient_evidence" : "wait",
    reason: reachedHardDeadline ? "hard_deadline_reached_with_insufficient_evidence" : "evidence_threshold_not_satisfied",
    blockingCandidateIds,
    evidenceSummary,
  };
};
