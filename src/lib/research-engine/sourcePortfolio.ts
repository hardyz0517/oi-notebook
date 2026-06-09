import type { CandidateSource } from "./types";
import type { ExecutableCoveragePlan } from "./researchPlanTypes";

export type SourcePortfolioQueryMode = "normal" | "entity_news" | "broad_news_digest" | "broad_topic_news" | "technical_docs" | "official_reference" | "general_web" | "oi_problem";

export type SourcePortfolioConfig = {
  queryMode: SourcePortfolioQueryMode;
  plannedQueries: string[];
  maxCandidateCount: number;
  coveragePlan?: ExecutableCoveragePlan;
  candidateFacetByUrl?: Record<string, string>;
  targetDistinctHosts?: number;
  minimumDistinctHostsToAttempt?: number;
  maxCandidatesInPortfolio?: number;
  maxPerHost?: number;
};

export type SourcePortfolioDiagnostics = {
  sourcePortfolioEnabled: boolean;
  queryMode: SourcePortfolioQueryMode;
  plannedQueries: string[];
  targetDistinctHosts: number;
  minimumDistinctHostsToAttempt: number;
  maxCandidatesInPortfolio: number;
  maxPerHost: number;
  distinctCandidateHosts: number;
  selectedHostCount: number;
  hostDiversityShortfall: number;
  rejectedByHostDiversityCount: number;
  portfolioHostDistribution: Record<string, number>;
  portfolioFacetDistribution: Record<string, number>;
  readQueueHostOrder: string[];
  readQueueFacetOrder: string[];
  candidateHostDistribution: Record<string, number>;
  targetReadCount: number;
  candidateShortage: boolean;
  missingFacetCandidates: string[];
  hostCanonicalization: "simple_registered_domain";
  hostDiversityRelaxed: boolean;
  sourcePortfolioSummary: string;
};

export type SourcePortfolioResult = {
  portfolioCandidates: CandidateSource[];
  readQueue: CandidateSource[];
  hostDistribution: Record<string, number>;
  selectedHostCount: number;
  rejectedByHostDiversityCount: number;
  diagnostics: SourcePortfolioDiagnostics;
};

const DEFAULT_ENTITY_NEWS_TARGET_HOSTS = 8;
const DEFAULT_ENTITY_NEWS_MIN_HOSTS = 5;
const DEFAULT_ENTITY_NEWS_MAX_CANDIDATES = 30;
const DEFAULT_BROAD_NEWS_TARGET_HOSTS = 10;
const DEFAULT_BROAD_NEWS_MIN_HOSTS = 8;
const DEFAULT_BROAD_NEWS_MAX_CANDIDATES = 30;
const DEFAULT_BROAD_TOPIC_NEWS_TARGET_HOSTS = 10;
const DEFAULT_BROAD_TOPIC_NEWS_MIN_HOSTS = 5;
const DEFAULT_BROAD_TOPIC_NEWS_MAX_CANDIDATES = 30;
const DEFAULT_NORMAL_TARGET_HOSTS = 3;
const DEFAULT_NORMAL_MIN_HOSTS = 1;
const DEFAULT_NORMAL_MAX_CANDIDATES = 8;

const SECOND_LEVEL_TLDS = new Set([
  "ac",
  "co",
  "com",
  "edu",
  "gov",
  "net",
  "org",
]);

const distribution = (values: string[]): Record<string, number> =>
  values.reduce((acc, value) => {
    if (!value) return acc;
    return { ...acc, [value]: (acc[value] ?? 0) + 1 };
  }, {} as Record<string, number>);

export const canonicalizePortfolioHost = (value: string | undefined): string => {
  const rawHost = (value ?? "").trim().toLowerCase();
  if (!rawHost) return "unknown";
  const host = rawHost
    .replace(/^www\./, "")
    .replace(/^m\./, "")
    .replace(/^mobile\./, "");
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;
  const tld = parts[parts.length - 1] ?? "";
  const second = parts[parts.length - 2] ?? "";
  if (tld.length === 2 && SECOND_LEVEL_TLDS.has(second) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
};

const defaultsForMode = (
  queryMode: SourcePortfolioQueryMode,
): {
  targetDistinctHosts: number;
  minimumDistinctHostsToAttempt: number;
  maxCandidatesInPortfolio: number;
} => {
  if (queryMode === "broad_topic_news") {
    return {
      targetDistinctHosts: DEFAULT_BROAD_TOPIC_NEWS_TARGET_HOSTS,
      minimumDistinctHostsToAttempt: DEFAULT_BROAD_TOPIC_NEWS_MIN_HOSTS,
      maxCandidatesInPortfolio: DEFAULT_BROAD_TOPIC_NEWS_MAX_CANDIDATES,
    };
  }
  if (queryMode === "broad_news_digest") {
    return {
      targetDistinctHosts: DEFAULT_BROAD_NEWS_TARGET_HOSTS,
      minimumDistinctHostsToAttempt: DEFAULT_BROAD_NEWS_MIN_HOSTS,
      maxCandidatesInPortfolio: DEFAULT_BROAD_NEWS_MAX_CANDIDATES,
    };
  }
  if (queryMode === "entity_news") {
    return {
      targetDistinctHosts: DEFAULT_ENTITY_NEWS_TARGET_HOSTS,
      minimumDistinctHostsToAttempt: DEFAULT_ENTITY_NEWS_MIN_HOSTS,
      maxCandidatesInPortfolio: DEFAULT_ENTITY_NEWS_MAX_CANDIDATES,
    };
  }
  return {
    targetDistinctHosts: DEFAULT_NORMAL_TARGET_HOSTS,
    minimumDistinctHostsToAttempt: DEFAULT_NORMAL_MIN_HOSTS,
    maxCandidatesInPortfolio: DEFAULT_NORMAL_MAX_CANDIDATES,
  };
};

const facetForCandidate = (candidate: CandidateSource, config: SourcePortfolioConfig): string => {
  const byUrl = config.candidateFacetByUrl ?? {};
  return byUrl[candidate.url] ?? byUrl[candidate.url.toLocaleLowerCase()] ?? "primary";
};

export const buildSourcePortfolio = (
  candidates: CandidateSource[],
  config: SourcePortfolioConfig,
): SourcePortfolioResult => {
  const defaults = defaultsForMode(config.queryMode);
  const targetReadCount = config.coveragePlan?.sourceRequirements.targetReadCount ?? defaults.maxCandidatesInPortfolio;
  const targetDistinctHosts = config.targetDistinctHosts ?? config.coveragePlan?.sourceRequirements.targetDistinctHosts ?? defaults.targetDistinctHosts;
  const minimumDistinctHostsToAttempt = config.minimumDistinctHostsToAttempt ?? defaults.minimumDistinctHostsToAttempt;
  const maxCandidatesInPortfolio = Math.max(1, config.maxCandidatesInPortfolio ?? Math.max(defaults.maxCandidatesInPortfolio, targetReadCount));
  const maxCandidateCount = Math.max(1, config.maxCandidateCount);
  const maxPerHost = Math.max(1, config.maxPerHost ?? (config.queryMode === "normal" || config.queryMode === "technical_docs" || config.queryMode === "official_reference" ? 2 : 1));
  const limitedCandidates = candidates.slice(0, Math.max(maxCandidateCount, maxCandidatesInPortfolio));
  const candidateHosts = limitedCandidates.map((candidate) => canonicalizePortfolioHost(candidate.host));
  const candidateHostDistribution = distribution(candidateHosts);
  const facetIds = config.coveragePlan?.facets.map((facet) => facet.id) ?? ["primary"];
  const candidateFacetDistribution = distribution(limitedCandidates.map((candidate) => facetForCandidate(candidate, config)));
  const missingFacetCandidates = facetIds.filter((facet) => !candidateFacetDistribution[facet]);
  const selected: CandidateSource[] = [];
  const deferred: CandidateSource[] = [];
  const selectedHostCounts = new Map<string, number>();
  let rejectedByHostDiversityCount = 0;

  const byFacet = new Map<string, CandidateSource[]>();
  for (const candidate of limitedCandidates) {
    const facet = facetForCandidate(candidate, config);
    byFacet.set(facet, [...(byFacet.get(facet) ?? []), candidate]);
  }
  const interleavedCandidates: CandidateSource[] = [];
  while (interleavedCandidates.length < limitedCandidates.length) {
    let added = false;
    for (const facet of Array.from(byFacet.keys())) {
      const next = byFacet.get(facet)?.shift();
      if (!next) continue;
      interleavedCandidates.push(next);
      added = true;
    }
    if (!added) break;
  }

  for (const candidate of interleavedCandidates) {
    if (selected.length >= maxCandidatesInPortfolio) {
      deferred.push(candidate);
      continue;
    }
    const host = canonicalizePortfolioHost(candidate.host);
    const hostCount = selectedHostCounts.get(host) ?? 0;
    if (hostCount >= maxPerHost) {
      rejectedByHostDiversityCount += 1;
      deferred.push(candidate);
      continue;
    }
    selected.push(candidate);
    selectedHostCounts.set(host, hostCount + 1);
  }

  const selectedHostCount = selectedHostCounts.size;
  const hostDiversityRelaxed = selectedHostCount < minimumDistinctHostsToAttempt && deferred.length > 0;
  if (hostDiversityRelaxed) {
    for (const candidate of deferred) {
      if (selected.length >= maxCandidatesInPortfolio) break;
      if (selected.some((item) => item.url === candidate.url)) continue;
      selected.push(candidate);
      const host = canonicalizePortfolioHost(candidate.host);
      selectedHostCounts.set(host, (selectedHostCounts.get(host) ?? 0) + 1);
    }
  }

  const portfolioHostDistribution = distribution(selected.map((candidate) => canonicalizePortfolioHost(candidate.host)));
  const portfolioFacetDistribution = distribution(selected.map((candidate) => facetForCandidate(candidate, config)));
  const readQueue = [...selected].sort((left, right) => {
    const leftHostCount = portfolioHostDistribution[canonicalizePortfolioHost(left.host)] ?? 0;
    const rightHostCount = portfolioHostDistribution[canonicalizePortfolioHost(right.host)] ?? 0;
    if (leftHostCount !== rightHostCount) return leftHostCount - rightHostCount;
    const leftFacetCount = portfolioFacetDistribution[facetForCandidate(left, config)] ?? 0;
    const rightFacetCount = portfolioFacetDistribution[facetForCandidate(right, config)] ?? 0;
    if (leftFacetCount !== rightFacetCount) return leftFacetCount - rightFacetCount;
    return (right.score ?? 0) - (left.score ?? 0);
  });
  const candidateShortage = readQueue.length < targetReadCount;

  return {
    portfolioCandidates: selected,
    readQueue,
    hostDistribution: portfolioHostDistribution,
    selectedHostCount: Object.keys(portfolioHostDistribution).length,
    rejectedByHostDiversityCount,
    diagnostics: {
      sourcePortfolioEnabled: config.queryMode !== "normal",
      queryMode: config.queryMode,
      plannedQueries: config.plannedQueries,
      targetDistinctHosts,
      minimumDistinctHostsToAttempt,
      maxCandidatesInPortfolio,
      maxPerHost,
      distinctCandidateHosts: Object.keys(candidateHostDistribution).length,
      selectedHostCount: Object.keys(portfolioHostDistribution).length,
      hostDiversityShortfall: Math.max(0, targetDistinctHosts - Object.keys(portfolioHostDistribution).length),
      rejectedByHostDiversityCount,
      portfolioHostDistribution,
      portfolioFacetDistribution,
      readQueueHostOrder: readQueue.map((candidate) => canonicalizePortfolioHost(candidate.host)),
      readQueueFacetOrder: readQueue.map((candidate) => facetForCandidate(candidate, config)),
      candidateHostDistribution,
      targetReadCount,
      candidateShortage,
      missingFacetCandidates,
      hostCanonicalization: "simple_registered_domain",
      hostDiversityRelaxed,
      sourcePortfolioSummary: `target=${targetReadCount}; queued=${readQueue.length}; hosts=${Object.keys(portfolioHostDistribution).length}; facets=${Object.keys(portfolioFacetDistribution).length}; shortage=${candidateShortage}`,
    },
  };
};
