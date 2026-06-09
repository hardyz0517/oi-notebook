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

const containsTerm = (text: string, term: string): boolean => {
  const normalized = text.toLocaleLowerCase();
  const lowerTerm = term.toLocaleLowerCase();
  if (/^[a-z0-9_+-]+$/i.test(term)) {
    return new RegExp(`(^|[^a-z0-9])${lowerTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(normalized);
  }
  return normalized.includes(lowerTerm);
};

const extractProblemIds = (text: string): string[] =>
  Array.from(new Set([
    ...(text.match(/\bP\d{3,6}\b/gi) ?? []),
    ...(text.match(/\b(?:CF\s*)?\d{3,6}[A-Z]\d?\b/gi) ?? []),
    ...(text.match(/\b(?:abc|arc|agc)\d{3}_[a-h]\b/gi) ?? []),
  ].map((id) => id.replace(/\s+/g, "").toLocaleLowerCase())));

const oiAlgorithmTerms = (text: string): string[] => {
  const terms: Array<[string, RegExp]> = [
    ["fft", /\bFFT\b|快速傅里叶|多项式乘法/i],
    ["kmp", /\bKMP\b|prefix function|前缀函数|字符串匹配/i],
    ["hld", /树链剖分|重链剖分|heavy light decomposition|\bHLD\b/i],
    ["shortest routes", /shortest routes?|shortest path|最短路|dijkstra/i],
    ["lca", /\bLCA\b|lowest common ancestor|最近公共祖先/i],
    ["ntt", /\bNTT\b|数论变换/i],
  ];
  return terms.filter(([, pattern]) => pattern.test(text)).map(([term]) => term);
};

const oiTopicalBoost = (candidate: NormalizedCandidate, context: RankContext): { boost: number; penalty: number; reason: string } => {
  if (context.policy.mode !== "oi_algorithm") return { boost: 0, penalty: 0, reason: "not oi mode" };
  const queryText = `${context.queryPlan.userQuestion} ${context.queryPlan.queries.map((query) => query.query).join(" ")}`;
  const candidateText = `${candidate.title} ${candidate.snippet ?? ""} ${candidate.url}`;
  const host = candidate.canonical.normalizedHost;
  const path = candidate.canonical.path.toLocaleLowerCase();
  const queryProblemIds = extractProblemIds(queryText);
  const candidateProblemIds = extractProblemIds(candidateText);
  const problemHit = queryProblemIds.some((id) => candidateProblemIds.includes(id) || containsTerm(path, id));
  const queryAlgorithms = oiAlgorithmTerms(queryText);
  const candidateAlgorithms = oiAlgorithmTerms(candidateText);
  const algorithmHit = queryAlgorithms.some((term) => candidateAlgorithms.includes(term));
  const roleHit = /editorial|tutorial|solution|题解|statement|problemset|tasks|模板|实现|坑点/i.test(candidateText);
  const trustedReference = host === "oi-wiki.org" || host.endsWith(".oi-wiki.org") || host === "cp-algorithms.com" || host.endsWith(".cp-algorithms.com") || host === "usaco.guide";
  const officialProblemPath =
    (host === "luogu.com.cn" && /\/problem\//.test(path)) ||
    (host === "codeforces.com" && (/\/problemset\/problem\//.test(path) || /\/blog\/entry\//.test(path))) ||
    (host === "atcoder.jp" && /\/contests\/[^/]+\/(?:tasks|editorial)\//.test(path)) ||
    (host === "cses.fi" && /\/problemset\/task\//.test(path));
  const genericPlatformPage = /^(?:\/)?$|\/(?:problemset|contests?|tasks|blog|login|home|about|help)\/?$/i.test(path);
  const offTopicHost = /(?:support\.google\.com|google\.com|wikipedia\.org|baidu\.com|bbc\.co\.uk|mobile01\.com|computertechinfo\.com|techbloat\.com|geekchamp\.com|thecrazyprogrammer\.com|completeera\.com|softonic\.com)$/i.test(host);
  const lowQualityHost = /(?:csdn\.net|geeksforgeeks\.org|programmerall\.com|educba\.com|jianshu\.com|51cto\.com)$/i.test(host);

  let boost = 0;
  let penalty = 0;
  const reasons: string[] = [];
  if (problemHit) { boost += 0.9; reasons.push("problem id match"); }
  if (algorithmHit) { boost += 0.55; reasons.push("algorithm term match"); }
  if (roleHit) { boost += 0.35; reasons.push("solution/editorial/statement term"); }
  if (officialProblemPath) { boost += 0.75; reasons.push("official problem/editorial path"); }
  if (trustedReference && (algorithmHit || queryAlgorithms.length > 0)) { boost += 0.7; reasons.push("trusted algorithm reference topical"); }
  if (offTopicHost) { penalty += 1.1; reasons.push("known off-topic generic host for oi"); }
  if (lowQualityHost && queryProblemIds.length > 0) { penalty += 0.75; reasons.push("low quality source for concrete problem"); }
  if (genericPlatformPage && !problemHit && !algorithmHit) { penalty += 0.85; reasons.push("generic platform page"); }
  if (queryProblemIds.length > 0 && !problemHit && !roleHit && !officialProblemPath) { penalty += 0.7; reasons.push("missing concrete problem signal"); }
  if (queryAlgorithms.length > 0 && !algorithmHit && !trustedReference) { penalty += 0.55; reasons.push("missing algorithm signal"); }

  return { boost, penalty, reason: reasons.join("; ") || "no oi topical adjustment" };
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
  const topicalBoost = oiTopicalBoost(candidate, context);
  const officialBoost = Math.max(candidate.sourceType === "official" || candidate.sourceType === "docs" ? 1 : 0, hostBoost.boost, topicalBoost.boost);
  const seoPenalty = Math.max(candidate.sourceType === "seo_aggregator" ? 1 : 0, hostBoost.boost < 0 ? Math.abs(hostBoost.boost) : 0, topicalBoost.penalty);
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
    feature("officialBoost", officialBoost, weights.officialBoost, topicalBoost.boost > 0 ? topicalBoost.reason : hostBoost.boost !== 0 ? hostBoost.reason : "official/docs boost"),
    feature("seoPenalty", seoPenalty, weights.seoPenalty, topicalBoost.penalty > 0 ? topicalBoost.reason : hostBoost.boost < 0 ? hostBoost.reason : "SEO aggregator penalty"),
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
