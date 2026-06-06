import type {
  EvidenceClaimType,
  EvidenceConflict,
  EvidenceItem,
  EvidenceItemBuildInput,
  EvidencePacket,
  EvidencePacketBuildInput,
  EvidenceRelation,
  EvidenceStrength,
  EvidenceSummary,
  EvidencePacketStatus,
} from "./evidenceTypes";
import type {
  ExcerptWarning,
  ReaderQualityEvaluation,
  UrlReaderResult,
} from "./readerTypes";
import type {
  SearchPolicyDecision,
  SourceReliability,
  SourceType,
} from "./types";

const reliableRank = (reliability: SourceReliability): number => {
  if (reliability === "very_high") return 4;
  if (reliability === "high") return 3;
  if (reliability === "medium") return 2;
  if (reliability === "low") return 1;
  return 0;
};

const sourceTypeFromReader = (result: UrlReaderResult): SourceType =>
  result.document?.metadata.sourceType ?? (result.candidate.sourceType === "documentation" ? "docs" : result.candidate.sourceType === "mainstream_news" ? "mainstream_news" : result.candidate.sourceType === "forum" ? "forum" : result.candidate.sourceType === "official" ? "official" : "unknown");

const reliabilityFromReader = (result: UrlReaderResult): SourceReliability =>
  result.document?.metadata.reliability ?? (result.candidate.sourceType === "forum" || result.candidate.sourceType === "seo_aggregator" ? "low" : "unknown");

const claimTypeFromPolicy = (policy: SearchPolicyDecision): EvidenceClaimType => {
  if (policy.mode === "rumor_check") return "rumor_check";
  if (policy.vertical === "docs_technical") return "technical_doc";
  if (policy.vertical === "oi_algorithm") return "oi_algorithm";
  if (policy.vertical === "news") return "news_summary";
  if (policy.freshness === "current" || policy.freshness === "latest") return "current_fact";
  return "stable_knowledge";
};

const inferRelation = (input: EvidenceItemBuildInput): EvidenceRelation => {
  if (input.relation) return input.relation;
  const text = `${input.readerResult.candidate.title} ${input.readerResult.candidate.snippet ?? ""} ${input.excerpt.excerptMarkdown}`.toLowerCase();
  if (input.readerResult.candidate.queryPurpose === "rebuttal" || /refute|fact.?check|debunk|rumor|false|not confirmed|no reliable support/.test(text)) return "refutes";
  if (input.readerResult.candidate.queryPurpose === "news" || input.readerResult.candidate.queryPurpose === "official") return "supports";
  if (input.readerResult.candidate.sourceType === "forum") return "mentions";
  return "background";
};

const strengthFromQuality = (
  result: UrlReaderResult,
  quality: ReaderQualityEvaluation,
  warnings: ExcerptWarning[],
  policy: SearchPolicyDecision,
): EvidenceStrength => {
  if (!quality.canSupportAnswer) return "none";
  if (["blocked", "needs_js", "parse_failed", "too_short", "homepage", "timeout", "unsupported", "wrong_page_type"].includes(result.status)) return "none";
  const technicalOrOi = policy.vertical === "docs_technical" || policy.vertical === "oi_algorithm";
  const structuralWarning = warnings.some((warning) => warning === "omitted_large_code_block" || warning === "omitted_large_math_block" || warning === "incomplete_structural_block");
  if (quality.quality === "strong" && quality.canSupportStrongClaim && !(technicalOrOi && structuralWarning)) return "strong";
  if (quality.quality === "strong" || quality.quality === "medium") return structuralWarning ? "weak" : "medium";
  if (quality.quality === "weak") return "weak";
  return "none";
};

const summarize = (items: EvidenceItem[], conflicts: EvidenceConflict[]): EvidenceSummary => ({
  strongCount: items.filter((item) => item.evidenceStrength === "strong").length,
  mediumCount: items.filter((item) => item.evidenceStrength === "medium").length,
  weakCount: items.filter((item) => item.evidenceStrength === "weak").length,
  noneCount: items.filter((item) => item.evidenceStrength === "none").length,
  supportsCount: items.filter((item) => item.relation === "supports").length,
  refutesCount: items.filter((item) => item.relation === "refutes").length,
  conflictCount: conflicts.length,
  reliableSourceCount: items.filter((item) => reliableRank(item.reliability) >= 3).length,
  citeableCount: items.filter((item) => item.canCite).length,
});

const buildConflicts = (items: EvidenceItem[]): EvidenceConflict[] => {
  const claimTypes = Array.from(new Set(items.map((item) => item.claimType)));
  return claimTypes.flatMap((claimType, index) => {
    const supports = items.filter((item) => item.claimType === claimType && item.relation === "supports" && item.evidenceStrength !== "none");
    const refutes = items.filter((item) => item.claimType === claimType && item.relation === "refutes" && item.evidenceStrength !== "none");
    if (supports.length === 0 || refutes.length === 0) return [];
    const strongSide = [...supports, ...refutes].some((item) => item.evidenceStrength === "strong" || reliableRank(item.reliability) >= 3);
    return [{
      conflictId: `C${index + 1}`,
      claimType,
      severity: strongSide ? "high" : "medium",
      supportingEvidenceIds: supports.map((item) => item.evidenceId),
      refutingEvidenceIds: refutes.map((item) => item.evidenceId),
      reason: "supporting_and_refuting_evidence_present",
    } satisfies EvidenceConflict];
  });
};

const statusFrom = (summary: EvidenceSummary, conflicts: EvidenceConflict[]): EvidencePacketStatus => {
  if (summary.strongCount + summary.mediumCount + summary.weakCount === 0) return "no_evidence";
  if (conflicts.some((conflict) => conflict.severity === "high")) return "conflicted";
  if (summary.strongCount > 0 || summary.mediumCount > 0) return conflicts.length > 0 ? "partial" : "ready";
  return "insufficient";
};

const missingReasons = (items: EvidenceItem[], summary: EvidenceSummary, policy: SearchPolicyDecision, conflicts: EvidenceConflict[]): string[] => {
  const reasons: string[] = [];
  if (items.length === 0) reasons.push("no_reader_results");
  if (summary.citeableCount === 0) reasons.push("no_citeable_evidence");
  if (policy.risk === "high" && summary.strongCount === 0) reasons.push("high_risk_requires_strong_evidence");
  if ((policy.freshness === "latest" || policy.freshness === "current") && !items.some((item) => item.publishedAt || item.updatedAt)) reasons.push("freshness_required_but_no_timestamp");
  if (conflicts.length > 0) reasons.push("conflicting_evidence_requires_caution");
  return reasons;
};

export const buildEvidenceItems = (
  inputs: EvidenceItemBuildInput[],
  policy: SearchPolicyDecision,
): EvidenceItem[] =>
  inputs.map((input, index) => {
    const result = input.readerResult;
    const candidate = input.candidate ?? result.candidate;
    const reliability = reliabilityFromReader(result);
    const sourceType = sourceTypeFromReader(result);
    const warnings = Array.from(new Set([...input.readerQuality.warnings, ...input.excerpt.warnings]));
    const evidenceStrength = strengthFromQuality(result, input.readerQuality, warnings, policy);
    const canCite = evidenceStrength !== "none" && Boolean(input.excerpt.excerptMarkdown.trim()) && input.readerQuality.canSupportAnswer;
    const canSupportStrongClaim = evidenceStrength === "strong" && input.readerQuality.canSupportStrongClaim && reliableRank(reliability) >= (policy.risk === "high" ? 4 : 3);
    return {
      evidenceId: `E${index + 1}`,
      candidateId: candidate.id,
      url: result.document?.metadata.canonicalUrl ?? candidate.url,
      title: result.document?.metadata.title ?? candidate.title,
      host: result.document?.metadata.host ?? candidate.host,
      sourceType,
      reliability,
      publishedAt: result.document?.metadata.publishedAt,
      updatedAt: result.document?.metadata.updatedAt,
      excerptMarkdown: input.excerpt.excerptMarkdown,
      readerQuality: input.readerQuality.quality,
      evidenceStrength,
      relation: inferRelation(input),
      claimType: input.claimType ?? claimTypeFromPolicy(policy),
      warnings,
      canCite,
      canSupportStrongClaim,
      status: evidenceStrength === "none" ? "unusable" : evidenceStrength === "weak" ? "degraded" : "usable",
    };
  });

export const buildEvidencePacket = (input: EvidencePacketBuildInput): EvidencePacket => {
  const evidenceItems = buildEvidenceItems(input.items, input.policy);
  const conflicts = buildConflicts(evidenceItems);
  const evidenceSummary = summarize(evidenceItems, conflicts);
  const citationMap = Object.fromEntries(evidenceItems.map((item) => [item.evidenceId, item])) as Record<string, EvidenceItem>;
  const status = statusFrom(evidenceSummary, conflicts);
  const allowedClaims = evidenceItems
    .filter((item) => item.canCite && item.evidenceStrength !== "none")
    .map((item, index) => ({
      claimId: `A${index + 1}`,
      text: item.relation === "refutes" ? "Reliable sources do not support the claim, or explicitly refute it." : "The cited source supports a bounded answer.",
      claimType: item.claimType,
      evidenceIds: [item.evidenceId],
      requiresCitation: true,
    }));
  const forbiddenClaims = input.policy.risk === "high"
    ? [{
        claimId: "F1",
        text: "Do not confirm death, criminal conduct, medical status, or similar high-risk current claims without strong reliable evidence.",
        claimType: "rumor_check" as const,
        reason: "high_risk_claim_requires_strong_evidence",
        patterns: [
          "confirmed dead",
          "is dead",
          "has died",
          "death confirmed",
          "already confirmed",
          "definitely dead",
          "\u5df2\u8bc1\u5b9e\u6b7b\u4ea1",
          "\u5df2\u7ecf\u8bc1\u5b9e\u6b7b\u4ea1",
          "\u786e\u8ba4\u6b7b\u4ea1",
          "\u786e\u5b9a\u6b7b\u4ea1",
          "\u5df2\u7ecf\u6b7b\u4ea1",
          "\u5df2\u8bc1\u5b9e\u72af\u7f6a",
          "\u786e\u8ba4\u72af\u7f6a",
          "\u786e\u5b9a\u8fdd\u6cd5",
        ],
      }]
    : [];
  return {
    packetId: input.packetId ?? `${input.request.requestId ?? "research"}-evidence-packet`,
    request: input.request,
    policy: input.policy,
    queryPlan: input.queryPlan,
    evidenceItems,
    conflicts,
    status,
    evidenceSummary,
    allowedClaims,
    forbiddenClaims,
    missingEvidenceReasons: missingReasons(evidenceItems, evidenceSummary, input.policy, conflicts),
    citationMap,
  };
};
