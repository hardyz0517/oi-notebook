import type {
  AllowedClaim,
  EvidenceConflict,
  EvidenceEvaluationInput,
  EvidenceEvaluationResult,
  EvidencePacketStatus,
  EvidenceRequirement,
  ForbiddenClaim,
} from "./evidenceTypes";
import type { EvidenceItem } from "./evidenceTypes";
import type { SearchPolicyDecision, SourceReliability } from "./types";

const reliabilityRank = (reliability: SourceReliability): number => {
  if (reliability === "very_high") return 4;
  if (reliability === "high") return 3;
  if (reliability === "medium") return 2;
  if (reliability === "low") return 1;
  return 0;
};

const defaultRequirement = (policy: SearchPolicyDecision): EvidenceRequirement => {
  if (policy.risk === "high") {
    return { minStrong: 1, minMedium: 0, requireReliableSource: true, requireFreshness: true, requireNoHighSeverityConflict: true };
  }
  if (policy.vertical === "docs_technical" || policy.vertical === "oi_algorithm") {
    return { minStrong: 0, minMedium: 1, requireReliableSource: true, requireFreshness: false, requireNoHighSeverityConflict: true };
  }
  if (policy.vertical === "news" || policy.freshness === "latest" || policy.freshness === "current") {
    return { minStrong: 0, minMedium: 2, requireReliableSource: true, requireFreshness: true, requireNoHighSeverityConflict: true };
  }
  return { minStrong: 0, minMedium: 1, requireReliableSource: false, requireFreshness: false, requireNoHighSeverityConflict: true };
};

const hasFreshness = (items: EvidenceItem[]): boolean =>
  items.some((item) => item.publishedAt || item.updatedAt);

const hasReliableSource = (items: EvidenceItem[]): boolean =>
  items.some((item) => reliabilityRank(item.reliability) >= 3 && item.canCite);

const conflictPenalty = (conflicts: EvidenceConflict[]): number =>
  conflicts.reduce((sum, conflict) => sum + (conflict.severity === "high" ? 0.35 : conflict.severity === "medium" ? 0.2 : 0.1), 0);

const mergeForbiddenClaims = (packetClaims: ForbiddenClaim[], policy: SearchPolicyDecision, sufficient: boolean): ForbiddenClaim[] => {
  const claims = [...packetClaims];
  if (policy.risk === "high" && !sufficient && !claims.some((claim) => claim.claimId === "F-high-risk-confirmation")) {
    claims.push({
      claimId: "F-high-risk-confirmation",
      text: "Do not confirm the high-risk current claim without strong reliable evidence.",
      claimType: "rumor_check",
      reason: "insufficient_high_risk_evidence",
      patterns: [
        "confirmed dead",
        "is dead",
        "has died",
        "death confirmed",
        "definitely dead",
        "already confirmed",
        "\u5df2\u8bc1\u5b9e\u6b7b\u4ea1",
        "\u5df2\u7ecf\u8bc1\u5b9e\u6b7b\u4ea1",
        "\u786e\u8ba4\u6b7b\u4ea1",
        "\u786e\u5b9a\u6b7b\u4ea1",
        "\u5df2\u7ecf\u6b7b\u4ea1",
        "\u5df2\u8bc1\u5b9e\u72af\u7f6a",
        "\u786e\u8ba4\u72af\u7f6a",
        "\u786e\u5b9a\u8fdd\u6cd5",
      ],
    });
  }
  return claims;
};

const allowedClaimsFor = (items: EvidenceItem[], policy: SearchPolicyDecision, sufficient: boolean): AllowedClaim[] => {
  const citeable = items.filter((item) => item.canCite);
  if (policy.risk === "high" && !sufficient) {
    const refutes = citeable.filter((item) => item.relation === "refutes");
    return [{
      claimId: "A-high-risk-no-confirmation",
      text: refutes.length > 0
        ? "You may say reliable sources refute the claim or that reliable support was not found, with citation."
        : "You may say there is not enough reliable evidence to confirm the claim.",
      claimType: "rumor_check",
      evidenceIds: refutes.map((item) => item.evidenceId),
      requiresCitation: refutes.length > 0,
    }];
  }
  return citeable.map((item, index) => ({
    claimId: `A-eval-${index + 1}`,
    text: item.relation === "refutes" ? "The cited evidence refutes or does not support the claim." : "The cited evidence supports a bounded claim.",
    claimType: item.claimType,
    evidenceIds: [item.evidenceId],
    requiresCitation: true,
  }));
};

const statusFor = (input: EvidenceEvaluationInput, sufficient: boolean, missing: string[]): EvidencePacketStatus => {
  if (input.packet.evidenceItems.length === 0) return "no_evidence";
  if (input.packet.conflicts.some((conflict) => conflict.severity === "high")) return "conflicted";
  if (sufficient) return "ready";
  if (missing.includes("only_weak_or_unusable_evidence")) return "insufficient";
  return "partial";
};

export const evaluateEvidencePacket = (input: EvidenceEvaluationInput): EvidenceEvaluationResult => {
  const packet = input.packet;
  const requirement = { ...defaultRequirement(packet.policy), ...input.requirement };
  const summary = packet.evidenceSummary;
  const usableItems = packet.evidenceItems.filter((item) => item.canCite && item.evidenceStrength !== "none");
  const strongItems = usableItems.filter((item) => item.evidenceStrength === "strong");
  const mediumOrBetter = usableItems.filter((item) => item.evidenceStrength === "strong" || item.evidenceStrength === "medium");
  const missing = [...packet.missingEvidenceReasons];

  if (strongItems.length < requirement.minStrong) missing.push("not_enough_strong_evidence");
  if (mediumOrBetter.length < requirement.minMedium) missing.push("not_enough_medium_or_strong_evidence");
  if (requirement.requireReliableSource && !hasReliableSource(usableItems)) missing.push("no_reliable_citeable_source");
  if (requirement.requireFreshness && !hasFreshness(usableItems)) missing.push("freshness_required_but_no_timestamp");
  if (requirement.requireNoHighSeverityConflict && packet.conflicts.some((conflict) => conflict.severity === "high")) missing.push("high_severity_conflict_present");
  if (usableItems.length === 0) missing.push("only_weak_or_unusable_evidence");

  const currentOrNews = packet.policy.freshness === "current" || packet.policy.freshness === "latest" || packet.policy.vertical === "news";
  if (currentOrNews && !hasFreshness(usableItems)) missing.push("current_or_news_answer_requires_date_hint");

  const highRisk = packet.policy.risk === "high";
  const highRiskStrongAuthority = strongItems.some((item) => item.canSupportStrongClaim && item.relation !== "mentions" && item.relation !== "unknown");
  const highRiskReliableRefute = usableItems.some((item) => item.relation === "refutes" && item.canCite && reliabilityRank(item.reliability) >= 3);
  if (highRisk && !highRiskStrongAuthority && !highRiskReliableRefute) missing.push("high_risk_has_no_authoritative_strong_support_or_refute");

  const uniqueMissing = Array.from(new Set(highRiskReliableRefute
    ? missing.filter((reason) => reason !== "not_enough_strong_evidence" && reason !== "high_risk_requires_strong_evidence")
    : missing));
  const sufficient = uniqueMissing.length === 0;
  const baseConfidence = Math.min(1, (summary.strongCount * 0.35) + (summary.mediumCount * 0.22) + (summary.weakCount * 0.08) + (summary.reliableSourceCount * 0.12));
  const confidence = Math.max(0, Number((baseConfidence - conflictPenalty(packet.conflicts) - (uniqueMissing.length * 0.08)).toFixed(2)));
  const allowedClaims = allowedClaimsFor(packet.evidenceItems, packet.policy, sufficient);
  const forbiddenClaims = mergeForbiddenClaims(packet.forbiddenClaims, packet.policy, sufficient);

  return {
    packet,
    status: statusFor(input, sufficient, uniqueMissing),
    requirement,
    sufficient,
    confidence,
    evidenceSummary: { ...summary, conflictCount: packet.conflicts.length },
    conflicts: packet.conflicts,
    allowedClaims,
    forbiddenClaims,
    missingEvidenceReasons: uniqueMissing,
  };
};
