import type {
  AnswerContract,
  AnswerMode,
  EvidenceEvaluationResult,
} from "./evidenceTypes";

const fallbackFor = (mode: AnswerMode): string => {
  if (mode === "refuse_current_claim") return "I do not have enough reliable public evidence to confirm this current high-risk claim.";
  if (mode === "insufficient_evidence") return "I do not have enough reliable evidence to answer this confidently.";
  if (mode === "cautious") return "The available evidence is partial, so the answer must be framed cautiously and cite sources.";
  return "Use the cited evidence and avoid unsupported claims.";
};

const answerModeFor = (evaluation: EvidenceEvaluationResult): AnswerMode => {
  const policy = evaluation.packet.policy;
  if (policy.risk === "high" && !evaluation.sufficient) return "refuse_current_claim";
  if (policy.risk === "high") return "cautious";
  if (evaluation.status === "no_evidence" || evaluation.status === "insufficient") return "insufficient_evidence";
  if (evaluation.conflicts.length > 0) return "cautious";
  if (policy.vertical === "news" || policy.mode === "news_recent") return evaluation.sufficient ? "summarize_sources" : "cautious";
  if (evaluation.sufficient && (policy.vertical === "docs_technical" || policy.vertical === "oi_algorithm" || policy.risk === "low")) return "direct";
  return evaluation.sufficient ? "direct" : "cautious";
};

export const buildAnswerContract = (evaluation: EvidenceEvaluationResult): AnswerContract => {
  const answerMode = answerModeFor(evaluation);
  const allowedEvidenceIds = evaluation.packet.evidenceItems
    .filter((item) => item.canCite && item.evidenceStrength !== "none")
    .map((item) => item.evidenceId);
  const knownEvidenceIds = evaluation.packet.evidenceItems.map((item) => item.evidenceId);
  const mustCite = allowedEvidenceIds.length > 0 && (evaluation.packet.policy.mustUseEvidence || answerMode !== "insufficient_evidence");
  const requiredHedges = answerMode === "cautious" || answerMode === "refuse_current_claim" || answerMode === "insufficient_evidence"
    ? ["based on the available evidence", "not enough reliable evidence"]
    : [];
  return {
    answerMode,
    mustCite,
    citationStyle: "[[E1]]",
    knownEvidenceIds,
    allowedEvidenceIds,
    allowedClaims: evaluation.allowedClaims,
    forbiddenClaims: evaluation.forbiddenClaims,
    requiredHedges,
    maxUnsupportedClaimRisk: evaluation.packet.policy.risk,
    fallbackMessage: fallbackFor(answerMode),
    constraints: [
      { constraintId: "C-citations", description: "Cite every non-trivial factual claim with an allowed evidence id.", severity: "must" },
      { constraintId: "C-forbidden", description: "Do not make forbidden high-risk or unsupported claims.", severity: "must" },
      { constraintId: "C-hedge", description: "Use required hedging language when evidence is partial or insufficient.", severity: answerMode === "direct" ? "should" : "must" },
    ],
    developerDiagnostics: {
      evaluationStatus: evaluation.status,
      confidence: evaluation.confidence,
      missingEvidenceReasons: evaluation.missingEvidenceReasons,
      conflictCount: evaluation.conflicts.length,
    },
  };
};
