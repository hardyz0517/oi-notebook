import type {
  ExtractedContentBlockType,
  ExcerptWarning,
  ReaderQualityEvaluation,
  ReaderQualityLevel,
  ReaderQualitySignal,
  UrlReaderResult,
} from "./readerTypes";

const BLOCK_TYPES: ExtractedContentBlockType[] = ["heading", "paragraph", "code", "math", "table", "list", "quote", "metadata", "unknown"];

const reliabilityScore = (reliability: string | undefined): number => {
  if (reliability === "very_high") return 3;
  if (reliability === "high") return 2;
  if (reliability === "medium") return 1;
  return 0;
};

const warningForStatus = (status: UrlReaderResult["status"]): ExcerptWarning | undefined => {
  if (status === "partial") return "partial_reader_result";
  if (status === "blocked" || status === "timeout" || status === "wrong_page_type" || status === "unsupported") return "blocked_or_unreadable";
  if (status === "needs_js") return "needs_js";
  if (status === "homepage") return "homepage_weak_source";
  if (status === "parse_failed") return "parse_failed";
  if (status === "too_short") return "too_short";
  return undefined;
};

const qualityFromScore = (score: number): ReaderQualityLevel => {
  if (score >= 6) return "strong";
  if (score >= 4) return "medium";
  if (score >= 2) return "weak";
  return "none";
};

export const evaluateReaderQuality = (result: UrlReaderResult): ReaderQualityEvaluation => {
  const stats = {
    ...Object.fromEntries(BLOCK_TYPES.map((type) => [type, 0])),
    total: 0,
    complete: 0,
    incomplete: 0,
    textChars: 0,
  } as ReaderQualityEvaluation["blockStats"];
  const warnings: ExcerptWarning[] = [];
  const reasons: string[] = [];
  const statusWarning = warningForStatus(result.status);
  if (statusWarning) warnings.push(statusWarning);

  if (!result.document) {
    return {
      quality: "none",
      canSupportAnswer: false,
      canSupportStrongClaim: false,
      reasons: [`reader_status_${result.status}`],
      warnings,
      blockStats: stats,
      signals: [{ name: "document_present", passed: false, weight: 3, reason: "No extracted document is available." }],
    };
  }

  for (const item of result.document.blocks) {
    stats[item.type] += 1;
    stats.total += 1;
    stats.textChars += item.charLength;
    if (item.isComplete) stats.complete += 1;
    else stats.incomplete += 1;
  }

  const hasStructuredContent = stats.heading > 0 && (stats.paragraph + stats.code + stats.math + stats.table + stats.list + stats.quote) > 0;
  const enoughText = stats.textChars >= 220;
  const reliable = reliabilityScore(result.document.metadata.reliability) >= 2;
  const highReliability = reliabilityScore(result.document.metadata.reliability) >= 3;
  const partial = result.status === "partial";
  const unreadable = ["blocked", "timeout", "needs_js", "parse_failed", "unsupported", "wrong_page_type"].includes(result.status);
  const weakStatus = ["too_short", "homepage"].includes(result.status);
  const incompleteStructuralBlock = result.document.blocks.some((item) => !item.isComplete && ["code", "math", "table"].includes(item.type));
  const highRiskOrCurrent = result.request.policy.risk === "high" || result.request.policy.freshness === "current" || result.request.policy.mode === "rumor_check";

  const signals: ReaderQualitySignal[] = [
    { name: "reader_fetched", passed: result.status === "fetched" || result.status === "partial", weight: 2, reason: `status=${result.status}` },
    { name: "enough_body_text", passed: enoughText, weight: 2, reason: `textChars=${stats.textChars}` },
    { name: "structured_blocks", passed: hasStructuredContent, weight: 1, reason: `blocks=${stats.total}` },
    { name: "source_reliable", passed: reliable, weight: 2, reason: `reliability=${result.document.metadata.reliability}` },
    { name: "complete_structural_blocks", passed: !incompleteStructuralBlock, weight: 2, reason: `incomplete=${stats.incomplete}` },
  ];
  let score = signals.reduce((sum, signal) => sum + (signal.passed ? signal.weight : 0), 0);

  if (partial) {
    score = Math.min(score, 5);
    reasons.push("partial_reader_result_caps_quality");
  }
  if (weakStatus) {
    score = Math.min(score, 2);
    reasons.push(`weak_reader_status_${result.status}`);
  }
  if (unreadable) {
    score = 0;
    reasons.push(`unreadable_status_${result.status}`);
  }
  if (incompleteStructuralBlock) {
    score = Math.min(score, 3);
    warnings.push("incomplete_structural_block");
    reasons.push("incomplete_code_math_or_table_blocks");
  }
  if (highRiskOrCurrent && !highReliability) {
    score = Math.min(score, 3);
    reasons.push("high_risk_or_current_fact_requires_very_high_reliability");
  }

  const quality = qualityFromScore(score);
  const canSupportAnswer = quality !== "none" && !unreadable && result.status !== "too_short";
  const canSupportStrongClaim = quality === "strong" && !partial && !incompleteStructuralBlock && (!highRiskOrCurrent || highReliability);

  if (quality === "strong") reasons.push("strong_reader_quality");
  if (quality === "medium") reasons.push("medium_reader_quality");
  if (quality === "weak") reasons.push("weak_reader_quality");
  if (quality === "none") reasons.push("no_answer_bearing_reader_quality");
  if (!reliable) warnings.push("low_quality_source");

  return {
    quality,
    canSupportAnswer,
    canSupportStrongClaim,
    reasons,
    warnings: Array.from(new Set(warnings)),
    blockStats: stats,
    signals,
  };
};
