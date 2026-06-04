import { normalizeDiscoveryResults, toCandidateSource } from "./candidateNormalizer";
import { rankCandidates } from "./candidateRanker";
import { selectDiverseCandidates } from "./diversitySelector";
import type {
  CandidatePoolConfig,
  CandidatePoolInput,
  CandidatePoolSnapshot,
  CandidateRejectReason,
  NormalizedCandidate,
  SourceType,
} from "./types";

export const DEFAULT_CANDIDATE_POOL_CONFIG: CandidatePoolConfig = {
  maxCandidates: 64,
  maxSelected: 10,
  perHostLimit: 2,
  minScore: 12,
  diversity: {
    maxSelected: 10,
    perHostLimit: 2,
    preferredSourceTypes: ["official", "docs", "mainstream_news", "community"],
    minClusterRepresentatives: 2,
  },
};

const fullConfig = (config: Partial<CandidatePoolConfig> = {}): CandidatePoolConfig => ({
  ...DEFAULT_CANDIDATE_POOL_CONFIG,
  ...config,
  diversity: {
    ...DEFAULT_CANDIDATE_POOL_CONFIG.diversity,
    ...config.diversity,
    maxSelected: config.diversity?.maxSelected ?? config.maxSelected ?? DEFAULT_CANDIDATE_POOL_CONFIG.maxSelected,
    perHostLimit: config.diversity?.perHostLimit ?? config.perHostLimit ?? DEFAULT_CANDIDATE_POOL_CONFIG.perHostLimit,
  },
});

const distribution = <T extends string>(values: T[]): Record<T, number> =>
  values.reduce((acc, value) => ({ ...acc, [value]: (acc[value] ?? 0) + 1 }), {} as Record<T, number>);

const reject = (
  candidate: NormalizedCandidate,
  reason: CandidateRejectReason,
): { candidate: NormalizedCandidate; reason: CandidateRejectReason } => ({
  candidate: { ...candidate, rejectedReason: reason },
  reason,
});

const isInternalSearchPage = (candidate: NormalizedCandidate): boolean =>
  /\/search\b|\/tag\/|\/tags\/|\/topics?\b|\/query\b/i.test(candidate.canonical.path) ||
  candidate.canonical.canonicalUrl.includes("search?");

const dedupeCandidates = (
  candidates: NormalizedCandidate[],
): {
  deduped: NormalizedCandidate[];
  rejected: Array<{ candidate: NormalizedCandidate; reason: CandidateRejectReason }>;
} => {
  const seenUrls = new Set<string>();
  const seenTitleHostSnippets = new Set<string>();
  const deduped: NormalizedCandidate[] = [];
  const rejected: Array<{ candidate: NormalizedCandidate; reason: CandidateRejectReason }> = [];
  for (const candidate of candidates) {
    if (candidate.canonical.unsupportedReason) {
      rejected.push(reject(candidate, "unsupported_url"));
      continue;
    }
    if (isInternalSearchPage(candidate)) {
      rejected.push(reject(candidate, "internal_search_page"));
      continue;
    }
    if (seenUrls.has(candidate.dedupeKey.canonicalUrl)) {
      rejected.push(reject(candidate, "duplicate_url"));
      continue;
    }
    if (candidate.dedupeKey.normalizedTitle && candidate.dedupeKey.titleHostSnippet && seenTitleHostSnippets.has(candidate.dedupeKey.titleHostSnippet)) {
      rejected.push(reject(candidate, "duplicate_title_host"));
      continue;
    }
    seenUrls.add(candidate.dedupeKey.canonicalUrl);
    seenTitleHostSnippets.add(candidate.dedupeKey.titleHostSnippet);
    deduped.push(candidate);
  }
  return { deduped, rejected };
};

export const buildCandidatePool = (input: CandidatePoolInput): CandidatePoolSnapshot => {
  const config = fullConfig(input.config);
  const normalized = normalizeDiscoveryResults(input.rawResults).slice(0, config.maxCandidates);
  const dedupe = dedupeCandidates(normalized);
  const ranked = rankCandidates(dedupe.deduped, {
    policy: input.policy,
    queryPlan: input.queryPlan,
  });
  const lowRelevance: Array<{ candidate: NormalizedCandidate; reason: CandidateRejectReason }> = [];
  const rankEligible = ranked.filter((candidate) => {
    if ((candidate.rank?.total ?? 0) >= config.minScore) return true;
    lowRelevance.push(reject(candidate, "low_relevance"));
    return false;
  });
  const diversity = selectDiverseCandidates(rankEligible, config.diversity);
  const rejectedCandidates = [...dedupe.rejected, ...lowRelevance, ...diversity.rejected];
  const selectedNormalizedCandidates = diversity.selected;
  const selectedCandidates = selectedNormalizedCandidates.map((candidate) =>
    toCandidateSource(candidate, input.request.requestId ?? "research-engine-job"),
  );
  const rankBreakdowns = Object.fromEntries(
    ranked
      .filter((candidate) => candidate.rank)
      .map((candidate) => [candidate.id, candidate.rank]),
  ) as CandidatePoolSnapshot["rankBreakdowns"];
  const selectedSourceTypes = selectedNormalizedCandidates.map((candidate) => candidate.sourceType);
  const allSourceTypes: SourceType[] = ["official", "docs", "mainstream_news", "tech_media", "community", "forum", "seo_aggregator", "unknown"];
  const sourceTypeDistribution = {
    ...Object.fromEntries(allSourceTypes.map((sourceType) => [sourceType, 0])),
    ...distribution(selectedSourceTypes),
  } as Record<SourceType, number>;

  return {
    requestId: input.request.requestId,
    rawCount: input.rawResults.length,
    normalizedCount: normalized.length,
    dedupedCount: dedupe.deduped.length,
    selectedCount: selectedCandidates.length,
    rejectedCount: rejectedCandidates.length,
    normalizedCandidates: normalized,
    dedupedCandidates: dedupe.deduped,
    selectedCandidates,
    selectedNormalizedCandidates,
    rejectedCandidates,
    hostDistribution: distribution(selectedNormalizedCandidates.map((candidate) => candidate.canonical.normalizedHost)),
    sourceTypeDistribution,
    rankBreakdowns,
    clusters: diversity.clusters,
    diversity,
  };
};
