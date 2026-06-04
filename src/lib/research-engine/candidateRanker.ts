import type {
  CandidateRankFeature,
  CandidateRankScore,
  NormalizedCandidate,
  QueryPlan,
  SearchPolicyDecision,
  SourceType,
} from "./types";

type RankContext = {
  policy: SearchPolicyDecision;
  queryPlan: QueryPlan;
  duplicateKeys?: Set<string>;
};

const BASE_WEIGHTS: Record<CandidateRankFeature, number> = {
  lexicalRelevance: 18,
  titleMatch: 16,
  snippetMatch: 10,
  sourceReliability: 18,
  freshnessHint: 8,
  queryPurposeMatch: 10,
  sourceTypeMatch: 12,
  officialBoost: 10,
  seoPenalty: -16,
  duplicatePenalty: -25,
};

const tokenize = (value: string): string[] => {
  const lower = value.toLocaleLowerCase();
  const latin = lower.match(/[a-z0-9+#.]{2,}/g) ?? [];
  const cjk = lower.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  return [...latin, ...cjk];
};

const overlap = (left: string[], right: string[]): number => {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  const hits = left.filter((token) => rightSet.has(token)).length;
  return hits / Math.max(1, left.length);
};

const expectedSourceTypes = (context: RankContext): SourceType[] => {
  if (context.policy.mode === "docs_technical") return ["official", "docs", "tech_media", "community"];
  if (context.policy.mode === "oi_algorithm") return ["docs", "community", "forum", "tech_media"];
  if (context.policy.mode === "news_recent") return ["official", "mainstream_news", "tech_media"];
  if (context.policy.mode === "rumor_check") return ["official", "mainstream_news", "tech_media"];
  return ["official", "mainstream_news", "docs", "tech_media", "community"];
};

const feature = (
  name: CandidateRankFeature,
  raw: number,
  weight: number,
  reason: string,
) => ({
  feature: name,
  raw,
  weight,
  weighted: Number((raw * weight).toFixed(3)),
  reason,
});

export const scoreCandidate = (
  candidate: NormalizedCandidate,
  context: RankContext,
): CandidateRankScore => {
  const queryText = `${context.queryPlan.userQuestion} ${context.queryPlan.queries.map((query) => query.query).join(" ")}`;
  const queryTokens = tokenize(queryText);
  const titleTokens = tokenize(candidate.title);
  const snippetTokens = tokenize(candidate.snippet ?? "");
  const titleMatch = overlap(queryTokens, titleTokens);
  const snippetMatch = overlap(queryTokens, snippetTokens);
  const lexicalRelevance = Math.min(1, titleMatch * 0.7 + snippetMatch * 0.3 + (candidate.canonical.path.toLocaleLowerCase().includes("docs") ? 0.08 : 0));
  const sourceReliability = candidate.reliabilityScore;
  const freshnessHint = candidate.canonical.dateHint ? 1 : context.policy.freshness === "stable" ? 0.35 : 0;
  const queryPurposeMatch = context.queryPlan.queries.some((query) => query.purpose === candidate.queryPurpose) ? 1 : 0.35;
  const sourceTypeMatch = expectedSourceTypes(context).includes(candidate.sourceType) ? 1 : 0.2;
  const officialBoost = candidate.sourceType === "official" || candidate.sourceType === "docs" ? 1 : 0;
  const seoPenalty = candidate.sourceType === "seo_aggregator" ? 1 : 0;
  const duplicatePenalty = context.duplicateKeys?.has(candidate.dedupeKey.canonicalUrl) || context.duplicateKeys?.has(candidate.dedupeKey.titleHost) ? 1 : 0;

  const weights = {
    ...BASE_WEIGHTS,
    sourceReliability: context.policy.mode === "rumor_check" ? 24 : BASE_WEIGHTS.sourceReliability,
    freshnessHint: context.policy.mode === "news_recent" || context.policy.mode === "rumor_check" ? 14 : BASE_WEIGHTS.freshnessHint,
    sourceTypeMatch: context.policy.mode === "docs_technical" || context.policy.mode === "oi_algorithm" ? 18 : BASE_WEIGHTS.sourceTypeMatch,
    officialBoost: context.policy.mode === "docs_technical" || context.policy.mode === "rumor_check" ? 16 : BASE_WEIGHTS.officialBoost,
  };

  const breakdown = [
    feature("lexicalRelevance", lexicalRelevance, weights.lexicalRelevance, "query terms overlap title/snippet/path"),
    feature("titleMatch", titleMatch, weights.titleMatch, "query terms in title"),
    feature("snippetMatch", snippetMatch, weights.snippetMatch, "query terms in snippet"),
    feature("sourceReliability", sourceReliability, weights.sourceReliability, `source reliability ${candidate.reliability}`),
    feature("freshnessHint", freshnessHint, weights.freshnessHint, candidate.canonical.dateHint ? "date hint present" : "no date hint"),
    feature("queryPurposeMatch", queryPurposeMatch, weights.queryPurposeMatch, `purpose ${candidate.queryPurpose}`),
    feature("sourceTypeMatch", sourceTypeMatch, weights.sourceTypeMatch, `source type ${candidate.sourceType}`),
    feature("officialBoost", officialBoost, weights.officialBoost, "official/docs boost"),
    feature("seoPenalty", seoPenalty, weights.seoPenalty, "SEO aggregator penalty"),
    feature("duplicatePenalty", duplicatePenalty, weights.duplicatePenalty, "duplicate already observed"),
  ];

  return {
    candidateId: candidate.id,
    total: Number(breakdown.reduce((sum, item) => sum + item.weighted, 0).toFixed(3)),
    breakdown,
  };
};

export const rankCandidates = (
  candidates: NormalizedCandidate[],
  context: RankContext,
): NormalizedCandidate[] =>
  candidates
    .map((candidate) => ({ ...candidate, rank: scoreCandidate(candidate, context) }))
    .sort((left, right) =>
      (right.rank?.total ?? 0) - (left.rank?.total ?? 0) ||
      right.providerPriority - left.providerPriority ||
      left.originalIndex - right.originalIndex,
    );
