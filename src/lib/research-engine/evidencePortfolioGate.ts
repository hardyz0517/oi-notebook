import type { EvidenceItem } from "./evidenceTypes";
import { canonicalizePortfolioHost } from "./sourcePortfolio";
import type { EvidenceTextLevel } from "./concurrentReader";
import type { ResearchPlanIntent } from "./researchPlanTypes";
import type { EvidenceSourceRole, OiTopicalityAssessment, OiTopicalitySignal } from "./evidenceQuality";

export type EvidencePortfolioGateStatus = "passed" | "cautious" | "failed" | "not_applicable";

export type EvidencePortfolioReadSignal = {
  url: string;
  host: string;
  facet?: string;
  status: string;
  evidenceTextLevel: EvidenceTextLevel;
  excerptLength: number;
  freshnessStatus?: "fresh" | "stale" | "unknown" | "future_date_suspicious";
  publishedDate?: string;
  ageDays?: number;
  dateConfidence?: string;
  isRecentEnough?: boolean;
  sourceRole?: EvidenceSourceRole;
  oiTopicalityScore?: number;
  oiTopicalityMatchedSignals?: OiTopicalitySignal[];
  oiTopicalityRejectedReason?: OiTopicalityAssessment["rejectedReason"];
  acceptedByOiEvidenceGate?: boolean;
};

export type EvidencePortfolioGateInput = {
  intent: ResearchPlanIntent;
  evidenceItems: EvidenceItem[];
  readSignals: EvidencePortfolioReadSignal[];
  targetReadCount: number;
  minDistinctHosts: number;
  minCoveredFacets: number;
  candidateShortage: boolean;
  allowCautiousAnswer: boolean;
  freshnessRequired?: boolean;
  freshnessWindowDays?: number;
  currentDate?: string;
};

export type EvidencePortfolioGateResult = {
  evidenceGateStatus: EvidencePortfolioGateStatus;
  evidenceGateReason: string;
  usableBodyEvidenceCount: number;
  usableFreshBodyEvidenceCount: number;
  usableEvidenceHostCount: number;
  usableFreshEvidenceHostCount: number;
  coveredFacetCount: number;
  missingFacets: string[];
  titleOnlyRejectedCount: number;
  snippetOnlyRejectedCount: number;
  bodyEvidenceRatio: number;
  attemptedReadCount: number;
  targetReadCount: number;
  candidateShortage: boolean;
  freshnessRequired: boolean;
  freshnessWindowDays?: number;
  currentDate?: string;
  freshnessGateStatus: EvidencePortfolioGateStatus;
  freshnessFailureReason?: string;
  freshEvidenceCount: number;
  staleEvidenceCount: number;
  unknownDateEvidenceCount: number;
  rejectedByFreshnessCount: number;
  oiEvidenceGateRequired: boolean;
  oiTopicalEvidenceCount: number;
  oiStrongTopicalEvidenceCount: number;
  oiRejectedEvidenceCount: number;
  oiRejectedReasons: Record<string, number>;
  oiAcceptedEvidenceHosts: string[];
  sourceDiversitySatisfied: boolean;
  selectedEvidenceHosts: string[];
  rejectedEvidenceHostDistribution: Record<string, number>;
};

const distribution = (values: string[]): Record<string, number> =>
  values.reduce((acc, value) => {
    if (!value) return acc;
    return { ...acc, [value]: (acc[value] ?? 0) + 1 };
  }, {} as Record<string, number>);

const thresholdsFor = (intent: ResearchPlanIntent): {
  passedEvidence: number;
  passedHosts: number;
  passedFacets: number;
  cautiousEvidence: number;
  cautiousHosts: number;
  cautiousFacets: number;
} => {
  if (intent === "broad_topic_news") {
    return { passedEvidence: 5, passedHosts: 5, passedFacets: 3, cautiousEvidence: 3, cautiousHosts: 3, cautiousFacets: 2 };
  }
  if (intent === "broad_news_digest") {
    return { passedEvidence: 5, passedHosts: 4, passedFacets: 1, cautiousEvidence: 3, cautiousHosts: 3, cautiousFacets: 1 };
  }
  if (intent === "entity_news") {
    return { passedEvidence: 3, passedHosts: 3, passedFacets: 1, cautiousEvidence: 2, cautiousHosts: 2, cautiousFacets: 1 };
  }
  if (intent === "technical_docs" || intent === "official_reference") {
    return { passedEvidence: 1, passedHosts: 1, passedFacets: 1, cautiousEvidence: 1, cautiousHosts: 1, cautiousFacets: 1 };
  }
  return { passedEvidence: 1, passedHosts: 1, passedFacets: 1, cautiousEvidence: 1, cautiousHosts: 1, cautiousFacets: 1 };
};

const isBodyEvidence = (item: EvidenceItem): boolean =>
  item.status === "usable" &&
  item.canCite &&
  item.excerptMarkdown.replace(/\s+/g, " ").trim().length >= 80;

const isOiRoleStrong = (role: EvidenceSourceRole | undefined): boolean =>
  role === "problem_statement" ||
  role === "official_editorial" ||
  role === "community_solution" ||
  role === "algorithm_reference" ||
  role === "discussion_warning";

export const evaluateEvidencePortfolioGate = (
  input: EvidencePortfolioGateInput,
): EvidencePortfolioGateResult => {
  const thresholds = thresholdsFor(input.intent);
  const usableBodyItems = input.evidenceItems.filter(isBodyEvidence);
  const oiEvidenceGateRequired = input.intent === "oi_problem";
  const acceptedOiUrls = new Set(input.readSignals
    .filter((signal) =>
      !oiEvidenceGateRequired ||
      (
        signal.acceptedByOiEvidenceGate === true &&
        signal.evidenceTextLevel === "body_excerpt" &&
        signal.excerptLength >= 80 &&
        isOiRoleStrong(signal.sourceRole)
      ))
    .map((signal) => signal.url));
  const oiAcceptedSignals = input.readSignals.filter((signal) =>
    signal.acceptedByOiEvidenceGate === true &&
    signal.evidenceTextLevel === "body_excerpt" &&
    signal.excerptLength >= 80 &&
    isOiRoleStrong(signal.sourceRole));
  const oiRejectedSignals = input.readSignals.filter((signal) =>
    oiEvidenceGateRequired &&
    signal.evidenceTextLevel === "body_excerpt" &&
    signal.excerptLength >= 80 &&
    signal.acceptedByOiEvidenceGate === false);
  const freshnessRequired = input.freshnessRequired === true && (
    input.intent === "entity_news" ||
    input.intent === "broad_topic_news" ||
    input.intent === "broad_news_digest"
  );
  const freshSignalUrls = new Set(input.readSignals
    .filter((signal) => signal.evidenceTextLevel === "body_excerpt" && signal.excerptLength >= 80 && signal.freshnessStatus === "fresh" && signal.isRecentEnough !== false)
    .map((signal) => signal.url));
  const gateBodyItems = freshnessRequired
    ? usableBodyItems.filter((item) => freshSignalUrls.has(item.url))
    : usableBodyItems;
  const topicalGateBodyItems = oiEvidenceGateRequired
    ? gateBodyItems.filter((item) => acceptedOiUrls.has(item.url))
    : gateBodyItems;
  const usableHosts = Array.from(new Set(topicalGateBodyItems.map((item) => canonicalizePortfolioHost(item.host))));
  const allUsableHosts = Array.from(new Set(usableBodyItems.map((item) => canonicalizePortfolioHost(item.host))));
  const coveredFacets = Array.from(new Set(input.readSignals
    .filter((signal) =>
      signal.evidenceTextLevel === "body_excerpt" &&
      signal.excerptLength >= 80 &&
      (!oiEvidenceGateRequired || signal.acceptedByOiEvidenceGate === true) &&
      (!freshnessRequired || (signal.freshnessStatus === "fresh" && signal.isRecentEnough !== false)))
    .map((signal) => signal.facet)
    .filter((facet): facet is string => Boolean(facet))));
  const allFacets = Array.from(new Set(input.readSignals.map((signal) => signal.facet).filter((facet): facet is string => Boolean(facet))));
  const missingFacets = allFacets.filter((facet) => !coveredFacets.includes(facet));
  const titleOnlyRejectedCount = input.readSignals.filter((signal) => signal.evidenceTextLevel === "title_only").length;
  const snippetOnlyRejectedCount = input.readSignals.filter((signal) => signal.evidenceTextLevel === "snippet_only").length;
  const staleEvidenceCount = input.readSignals.filter((signal) => signal.evidenceTextLevel === "body_excerpt" && (signal.freshnessStatus === "stale" || signal.freshnessStatus === "future_date_suspicious")).length;
  const unknownDateEvidenceCount = input.readSignals.filter((signal) => signal.evidenceTextLevel === "body_excerpt" && signal.freshnessStatus === "unknown").length;
  const rejectedByFreshnessCount = freshnessRequired ? staleEvidenceCount + unknownDateEvidenceCount : 0;
  const attemptedReadCount = input.readSignals.length;
  const passed = gateBodyItems.length >= thresholds.passedEvidence &&
    topicalGateBodyItems.length >= thresholds.passedEvidence &&
    usableHosts.length >= Math.max(thresholds.passedHosts, input.minDistinctHosts) &&
    Math.max(coveredFacets.length, input.intent === "entity_news" || input.intent === "broad_news_digest" ? 1 : coveredFacets.length) >= thresholds.passedFacets;
  const cautious = input.allowCautiousAnswer &&
    topicalGateBodyItems.length >= thresholds.cautiousEvidence &&
    usableHosts.length >= thresholds.cautiousHosts &&
    Math.max(coveredFacets.length, input.intent === "entity_news" || input.intent === "broad_news_digest" ? 1 : coveredFacets.length) >= thresholds.cautiousFacets;
  const status: EvidencePortfolioGateStatus = passed ? "passed" : cautious ? "cautious" : "failed";
  const sourceDiversitySatisfied = usableHosts.length >= Math.max(thresholds.passedHosts, input.minDistinctHosts);
  const freshnessGateStatus: EvidencePortfolioGateStatus = !freshnessRequired ? "not_applicable" : status;
  const freshnessFailureReason = freshnessRequired && status === "failed" && gateBodyItems.length < thresholds.cautiousEvidence
    ? "freshness_failed"
    : undefined;
  const rejectedSignals = input.readSignals.filter((signal) => signal.evidenceTextLevel !== "body_excerpt" || signal.excerptLength < 80);
  const oiRejectedReasons = distribution(oiRejectedSignals.map((signal) => signal.oiTopicalityRejectedReason ?? "oi_offtopic_body"));
  const oiAcceptedEvidenceHosts = Array.from(new Set(oiAcceptedSignals.map((signal) => canonicalizePortfolioHost(signal.host))));
  const oiTopicalEvidenceCount = oiAcceptedSignals.length;
  const oiStrongTopicalEvidenceCount = oiAcceptedSignals.filter((signal) => (signal.oiTopicalityScore ?? 0) >= 55 && isOiRoleStrong(signal.sourceRole)).length;
  return {
    evidenceGateStatus: status,
    evidenceGateReason: passed
      ? "body_evidence_portfolio_satisfied"
      : cautious
        ? "body_evidence_portfolio_limited"
        : freshnessFailureReason
          ? freshnessFailureReason
        : topicalGateBodyItems.length === 0 && oiEvidenceGateRequired
          ? "no_oi_topical_body_evidence"
        : gateBodyItems.length === 0
          ? "no_usable_body_excerpt_evidence"
          : oiEvidenceGateRequired && oiStrongTopicalEvidenceCount === 0
            ? "no_strong_oi_topical_evidence"
          : !sourceDiversitySatisfied
            ? "insufficient_distinct_body_evidence_hosts"
            : "insufficient_body_evidence_or_facet_coverage",
    usableBodyEvidenceCount: usableBodyItems.length,
    usableFreshBodyEvidenceCount: topicalGateBodyItems.length,
    usableEvidenceHostCount: usableHosts.length,
    usableFreshEvidenceHostCount: usableHosts.length,
    coveredFacetCount: coveredFacets.length,
    missingFacets,
    titleOnlyRejectedCount,
    snippetOnlyRejectedCount,
    bodyEvidenceRatio: attemptedReadCount > 0 ? Number((usableBodyItems.length / attemptedReadCount).toFixed(3)) : 0,
    attemptedReadCount,
    targetReadCount: input.targetReadCount,
    candidateShortage: input.candidateShortage,
    freshnessRequired,
    freshnessWindowDays: input.freshnessWindowDays,
    currentDate: input.currentDate,
    freshnessGateStatus,
    freshnessFailureReason,
    freshEvidenceCount: topicalGateBodyItems.length,
    staleEvidenceCount,
    unknownDateEvidenceCount,
    rejectedByFreshnessCount,
    oiEvidenceGateRequired,
    oiTopicalEvidenceCount,
    oiStrongTopicalEvidenceCount,
    oiRejectedEvidenceCount: oiRejectedSignals.length,
    oiRejectedReasons,
    oiAcceptedEvidenceHosts,
    sourceDiversitySatisfied,
    selectedEvidenceHosts: oiEvidenceGateRequired || freshnessRequired ? usableHosts : allUsableHosts,
    rejectedEvidenceHostDistribution: distribution(rejectedSignals.map((signal) => canonicalizePortfolioHost(signal.host))),
  };
};
