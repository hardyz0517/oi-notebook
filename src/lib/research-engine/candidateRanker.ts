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
  if (context.policy.mode === "oi_algorithm") return ["official", "docs", "community", "forum", "tech_media"];
  if (context.policy.mode === "news_recent") return ["official", "mainstream_news", "tech_media"];
  if (context.policy.mode === "rumor_check") return ["official", "mainstream_news", "tech_media"];
  return ["official", "mainstream_news", "docs", "tech_media", "community"];
};

const oiHostBoost = (candidate: NormalizedCandidate, context: RankContext): { boost: number; reason: string } => {
  if (context.policy.mode !== "oi_algorithm") return { boost: 0, reason: "not oi mode" };
  const host = candidate.canonical.normalizedHost;
  const path = candidate.canonical.path.toLocaleLowerCase();
  const queryText = `${context.queryPlan.userQuestion} ${context.queryPlan.queries.map((query) => query.query).join(" ")}`.toLocaleLowerCase();
  const algorithmReference = /oi wiki|oi-wiki|cp-algorithms|算法|模板|fft|ntt|kmp|lca|树链剖分|点分治|线段树|树状数组|最短路/.test(queryText);
  const editorialOrProblem = /题解|editorial|solution|problem|statement|cf|codeforces|atcoder|cses|洛谷|luogu|\bp\d{3,6}\b/.test(queryText);

  if (host === "atcoder.jp" && (/\/contests\//.test(path) || editorialOrProblem)) return { boost: 1, reason: "atcoder official contest/editorial source" };
  if (host === "cses.fi" && (/\/problemset\//.test(path) || editorialOrProblem)) return { boost: 1, reason: "cses official problem source" };
  if (host === "codeforces.com" && (/\/blog\/entry\//.test(path) || /\/problemset\/problem\//.test(path) || editorialOrProblem)) return { boost: 0.92, reason: "codeforces official/blog source" };
  if (host === "luogu.com.cn" && (/\/problem\//.test(path) || /\/problem\/solution\//.test(path) || editorialOrProblem)) return { boost: 0.88, reason: "luogu problem or solution source" };
  if ((host === "oi-wiki.org" || host === "cp-algorithms.com") && algorithmReference) return { boost: 0.95, reason: "trusted algorithm reference" };
  if (host === "usaco.guide") return { boost: 0.72, reason: "trusted competitive programming guide" };
  if (host === "nowcoder.com") return { boost: 0.55, reason: "competitive programming community source" };
  if (host.endsWith(".edu") || host.includes("acm") || host.includes("icpc")) return { boost: 0.35, reason: "school or team programming resource" };
  if (host.includes("csdn.net") || host.includes("geeksforgeeks.org")) return { boost: -0.45, reason: "oi seo/blog source demotion" };
  if (/programmerall|educba|jianshu|51cto|topic\.algo\.monster/.test(host)) return { boost: -0.65, reason: "low quality aggregator demotion" };
  return { boost: 0, reason: "no oi host adjustment" };
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
  const hostBoost = oiHostBoost(candidate, context);
  const officialBoost = Math.max(candidate.sourceType === "official" || candidate.sourceType === "docs" ? 1 : 0, hostBoost.boost);
  const seoPenalty = Math.max(candidate.sourceType === "seo_aggregator" ? 1 : 0, hostBoost.boost < 0 ? Math.abs(hostBoost.boost) : 0);
  const duplicatePenalty = context.duplicateKeys?.has(candidate.dedupeKey.canonicalUrl) || context.duplicateKeys?.has(candidate.dedupeKey.titleHost) ? 1 : 0;

  const weights = {
    ...BASE_WEIGHTS,
    sourceReliability: context.policy.mode === "rumor_check" ? 24 : BASE_WEIGHTS.sourceReliability,
    freshnessHint: context.policy.mode === "news_recent" || context.policy.mode === "rumor_check" ? 14 : BASE_WEIGHTS.freshnessHint,
    sourceTypeMatch: context.policy.mode === "docs_technical" || context.policy.mode === "oi_algorithm" ? 18 : BASE_WEIGHTS.sourceTypeMatch,
    officialBoost: context.policy.mode === "docs_technical" || context.policy.mode === "rumor_check" || context.policy.mode === "oi_algorithm" ? 16 : BASE_WEIGHTS.officialBoost,
  };

  const breakdown = [
    feature("lexicalRelevance", lexicalRelevance, weights.lexicalRelevance, "query terms overlap title/snippet/path"),
    feature("titleMatch", titleMatch, weights.titleMatch, "query terms in title"),
    feature("snippetMatch", snippetMatch, weights.snippetMatch, "query terms in snippet"),
    feature("sourceReliability", sourceReliability, weights.sourceReliability, `source reliability ${candidate.reliability}`),
    feature("freshnessHint", freshnessHint, weights.freshnessHint, candidate.canonical.dateHint ? "date hint present" : "no date hint"),
    feature("queryPurposeMatch", queryPurposeMatch, weights.queryPurposeMatch, `purpose ${candidate.queryPurpose}`),
    feature("sourceTypeMatch", sourceTypeMatch, weights.sourceTypeMatch, `source type ${candidate.sourceType}`),
    feature("officialBoost", officialBoost, weights.officialBoost, hostBoost.boost !== 0 ? hostBoost.reason : "official/docs boost"),
    feature("seoPenalty", seoPenalty, weights.seoPenalty, hostBoost.boost < 0 ? hostBoost.reason : "SEO aggregator penalty"),
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
