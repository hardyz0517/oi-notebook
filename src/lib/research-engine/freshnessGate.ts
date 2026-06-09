import type { EvidenceQualityAssessment } from "./evidenceQuality";
import type { ResearchPlanIntent } from "./researchPlanTypes";

export type FreshnessGateStatus = "passed" | "cautious" | "failed" | "not_applicable";

export type FreshnessGateResult = {
  freshnessGateStatus: FreshnessGateStatus;
  freshnessFailureReason?: string;
  currentDate: string;
  freshnessWindowDays: number;
  freshnessRequired: boolean;
  freshEvidenceCount: number;
  staleEvidenceCount: number;
  unknownDateEvidenceCount: number;
  rejectedByFreshnessCount: number;
  backgroundOnlyCount: number;
  freshEvidenceHostCount: number;
  freshnessLimitations: string[];
};

const NEWS_INTENTS = new Set<ResearchPlanIntent>(["entity_news", "broad_topic_news", "broad_news_digest"]);

const thresholdsFor = (intent: ResearchPlanIntent): { passedEvidence: number; passedHosts: number; cautiousEvidence: number; cautiousHosts: number } => {
  if (intent === "broad_topic_news") return { passedEvidence: 5, passedHosts: 5, cautiousEvidence: 3, cautiousHosts: 3 };
  if (intent === "broad_news_digest") return { passedEvidence: 5, passedHosts: 4, cautiousEvidence: 3, cautiousHosts: 3 };
  if (intent === "entity_news") return { passedEvidence: 3, passedHosts: 3, cautiousEvidence: 2, cautiousHosts: 2 };
  return { passedEvidence: 1, passedHosts: 1, cautiousEvidence: 1, cautiousHosts: 1 };
};

export const evaluateFreshnessGate = (input: {
  intent: ResearchPlanIntent;
  assessments: EvidenceQualityAssessment[];
  currentDate: string;
  freshnessWindowDays: number;
  freshnessRequired: boolean;
  allowCautiousAnswer: boolean;
}): FreshnessGateResult => {
  const bodyAssessments = input.assessments.filter((item) => item.hasBodyExcerpt);
  const freshAssessments = bodyAssessments.filter((item) => item.freshnessStatus === "fresh" && item.isRecentEnough);
  const staleEvidenceCount = bodyAssessments.filter((item) => item.freshnessStatus === "stale" || item.freshnessStatus === "future_date_suspicious").length;
  const unknownDateEvidenceCount = bodyAssessments.filter((item) => item.freshnessStatus === "unknown").length;
  const backgroundOnlyCount = bodyAssessments.filter((item) => item.evidenceQualityTier === "background").length;
  const rejectedByFreshnessCount = staleEvidenceCount + (input.freshnessRequired ? unknownDateEvidenceCount : 0);
  const freshEvidenceHostCount = new Set(freshAssessments.map((item) => item.host).filter(Boolean)).size;
  const thresholds = thresholdsFor(input.intent);
  const applies = input.freshnessRequired && NEWS_INTENTS.has(input.intent);
  const passed = !applies || (freshAssessments.length >= thresholds.passedEvidence && freshEvidenceHostCount >= thresholds.passedHosts);
  const cautious = applies &&
    input.allowCautiousAnswer &&
    freshAssessments.length >= thresholds.cautiousEvidence &&
    freshEvidenceHostCount >= thresholds.cautiousHosts;
  const freshnessGateStatus: FreshnessGateStatus = !applies ? "not_applicable" : passed ? "passed" : cautious ? "cautious" : "failed";
  const freshnessFailureReason = freshnessGateStatus === "failed"
    ? freshAssessments.length === 0
      ? "freshness_failed:no_recent_body_evidence"
      : "freshness_failed:insufficient_recent_body_evidence_or_hosts"
    : undefined;
  return {
    freshnessGateStatus,
    freshnessFailureReason,
    currentDate: input.currentDate,
    freshnessWindowDays: input.freshnessWindowDays,
    freshnessRequired: input.freshnessRequired,
    freshEvidenceCount: freshAssessments.length,
    staleEvidenceCount,
    unknownDateEvidenceCount,
    rejectedByFreshnessCount,
    backgroundOnlyCount,
    freshEvidenceHostCount,
    freshnessLimitations: [
      applies ? `freshness window: ${input.freshnessWindowDays} days as of ${input.currentDate}` : undefined,
      staleEvidenceCount > 0 ? `${staleEvidenceCount} body evidence item(s) were stale and can only be background` : undefined,
      unknownDateEvidenceCount > 0 && applies ? `${unknownDateEvidenceCount} body evidence item(s) had unknown publish date and cannot support latest-news claims` : undefined,
      freshnessFailureReason,
    ].filter((item): item is string => Boolean(item)),
  };
};
