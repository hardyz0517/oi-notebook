import type { CandidateSource } from "./types";

export type SourcePortfolioQueryMode = "normal" | "entity_news" | "broad_news_digest";

export type SourcePortfolioConfig = {
  queryMode: SourcePortfolioQueryMode;
  plannedQueries: string[];
  maxCandidateCount: number;
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
  readQueueHostOrder: string[];
  candidateHostDistribution: Record<string, number>;
  hostCanonicalization: "simple_registered_domain";
  hostDiversityRelaxed: boolean;
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
const DEFAULT_ENTITY_NEWS_MAX_CANDIDATES = 16;
const DEFAULT_BROAD_NEWS_TARGET_HOSTS = 10;
const DEFAULT_BROAD_NEWS_MIN_HOSTS = 8;
const DEFAULT_BROAD_NEWS_MAX_CANDIDATES = 24;
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

export const buildSourcePortfolio = (
  candidates: CandidateSource[],
  config: SourcePortfolioConfig,
): SourcePortfolioResult => {
  const defaults = defaultsForMode(config.queryMode);
  const targetDistinctHosts = config.targetDistinctHosts ?? defaults.targetDistinctHosts;
  const minimumDistinctHostsToAttempt = config.minimumDistinctHostsToAttempt ?? defaults.minimumDistinctHostsToAttempt;
  const maxCandidatesInPortfolio = Math.max(1, config.maxCandidatesInPortfolio ?? defaults.maxCandidatesInPortfolio);
  const maxCandidateCount = Math.max(1, config.maxCandidateCount);
  const maxPerHost = Math.max(1, config.maxPerHost ?? (config.queryMode === "normal" ? 2 : 1));
  const limitedCandidates = candidates.slice(0, Math.max(maxCandidateCount, maxCandidatesInPortfolio));
  const candidateHosts = limitedCandidates.map((candidate) => canonicalizePortfolioHost(candidate.host));
  const candidateHostDistribution = distribution(candidateHosts);
  const selected: CandidateSource[] = [];
  const deferred: CandidateSource[] = [];
  const selectedHostCounts = new Map<string, number>();
  let rejectedByHostDiversityCount = 0;

  for (const candidate of limitedCandidates) {
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
  const readQueue = [...selected].sort((left, right) => {
    const leftHostCount = portfolioHostDistribution[canonicalizePortfolioHost(left.host)] ?? 0;
    const rightHostCount = portfolioHostDistribution[canonicalizePortfolioHost(right.host)] ?? 0;
    if (leftHostCount !== rightHostCount) return leftHostCount - rightHostCount;
    return (right.score ?? 0) - (left.score ?? 0);
  });

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
      readQueueHostOrder: readQueue.map((candidate) => canonicalizePortfolioHost(candidate.host)),
      candidateHostDistribution,
      hostCanonicalization: "simple_registered_domain",
      hostDiversityRelaxed,
    },
  };
};
