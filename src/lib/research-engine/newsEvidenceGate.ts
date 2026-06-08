import type { EvidenceItem } from "./evidenceTypes";
import { canonicalizePortfolioHost, type SourcePortfolioQueryMode } from "./sourcePortfolio";

export type NewsEvidenceGateStatus = "passed" | "cautious" | "failed" | "not_applicable";

export type NewsEvidenceGateResult = {
  evidenceGateStatus: NewsEvidenceGateStatus;
  evidenceGateReason: string;
  usableEvidenceCount: number;
  usableEvidenceHostCount: number;
  requiredEvidenceCount: number;
  requiredHostCount: number;
  cautiousEvidenceCount: number;
  cautiousHostCount: number;
  sourceDiversitySatisfied: boolean;
  sourceDiversityFailureReason?: string;
  selectedEvidenceHosts: string[];
  rejectedEvidenceHostDistribution: Record<string, number>;
  sourceDiversityLow: boolean;
};

const distribution = (values: string[]): Record<string, number> =>
  values.reduce((acc, value) => {
    if (!value) return acc;
    return { ...acc, [value]: (acc[value] ?? 0) + 1 };
  }, {} as Record<string, number>);

const thresholdsForMode = (
  queryMode: SourcePortfolioQueryMode,
): {
  requiredEvidenceCount: number;
  requiredHostCount: number;
  cautiousEvidenceCount: number;
  cautiousHostCount: number;
} => {
  if (queryMode === "broad_news_digest") {
    return {
      requiredEvidenceCount: 5,
      requiredHostCount: 4,
      cautiousEvidenceCount: 3,
      cautiousHostCount: 3,
    };
  }
  if (queryMode === "entity_news") {
    return {
      requiredEvidenceCount: 3,
      requiredHostCount: 3,
      cautiousEvidenceCount: 2,
      cautiousHostCount: 2,
    };
  }
  return {
    requiredEvidenceCount: 1,
    requiredHostCount: 1,
    cautiousEvidenceCount: 1,
    cautiousHostCount: 1,
  };
};

export const evaluateNewsEvidenceGate = (
  queryMode: SourcePortfolioQueryMode,
  evidenceItems: EvidenceItem[],
): NewsEvidenceGateResult => {
  const thresholds = thresholdsForMode(queryMode);
  const usableItems = evidenceItems.filter((item) => item.status === "usable" && item.canCite);
  const rejectedItems = evidenceItems.filter((item) => item.status !== "usable" || !item.canCite);
  const usableHosts = Array.from(new Set(usableItems.map((item) => canonicalizePortfolioHost(item.host))));
  const rejectedEvidenceHostDistribution = distribution(rejectedItems.map((item) => canonicalizePortfolioHost(item.host)));
  if (queryMode === "normal") {
    return {
      evidenceGateStatus: "not_applicable",
      evidenceGateReason: "not_news_query",
      usableEvidenceCount: usableItems.length,
      usableEvidenceHostCount: usableHosts.length,
      ...thresholds,
      sourceDiversitySatisfied: true,
      selectedEvidenceHosts: usableHosts,
      rejectedEvidenceHostDistribution,
      sourceDiversityLow: false,
    };
  }

  const passed = usableItems.length >= thresholds.requiredEvidenceCount && usableHosts.length >= thresholds.requiredHostCount;
  const cautious = usableItems.length >= thresholds.cautiousEvidenceCount && usableHosts.length >= thresholds.cautiousHostCount;
  const evidenceGateStatus: NewsEvidenceGateStatus = passed ? "passed" : cautious ? "cautious" : "failed";
  const sourceDiversitySatisfied = usableHosts.length >= thresholds.requiredHostCount;
  const sourceDiversityFailureReason = sourceDiversitySatisfied
    ? undefined
    : usableHosts.length <= 1
      ? "source_diversity_failed"
      : "insufficient_distinct_hosts";
  return {
    evidenceGateStatus,
    evidenceGateReason: passed
      ? "news_evidence_portfolio_satisfied"
      : cautious
        ? "news_evidence_portfolio_limited"
        : usableHosts.length <= 1
          ? "source_diversity_failed"
          : "insufficient_evidence",
    usableEvidenceCount: usableItems.length,
    usableEvidenceHostCount: usableHosts.length,
    ...thresholds,
    sourceDiversitySatisfied,
    sourceDiversityFailureReason,
    selectedEvidenceHosts: usableHosts,
    rejectedEvidenceHostDistribution,
    sourceDiversityLow: !sourceDiversitySatisfied,
  };
};
