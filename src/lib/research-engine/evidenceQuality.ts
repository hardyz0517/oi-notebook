import type { CoverageFacet, ResearchPlanIntent } from "./researchPlanTypes";
import { canonicalizePortfolioHost } from "./sourcePortfolio";
import type { ExpectedSourceType } from "./types";
import { extractDateSignal, type DateConfidence, type DateSignalSource, type FreshnessStatus } from "./dateSignals";

export type EvidenceQualityTier = "high" | "medium" | "low" | "background";

export type EvidenceSourceRole =
  | "breaking_news"
  | "official_announcement"
  | "analysis_report"
  | "background_context"
  | "index_page"
  | "weak_candidate"
  | "problem_statement"
  | "official_editorial"
  | "community_solution"
  | "algorithm_reference"
  | "discussion_warning"
  | "generic_or_offtopic"
  | "low_quality_seo";

export type OiTopicalitySignal =
  | "problem_id"
  | "platform"
  | "algorithm"
  | "editorial"
  | "solution"
  | "statement"
  | "discussion"
  | "official_path"
  | "trusted_reference"
  | "title"
  | "snippet"
  | "body";

export type OiTopicalityAssessment = {
  applicable: boolean;
  accepted: boolean;
  score: number;
  role: Extract<EvidenceSourceRole,
    | "problem_statement"
    | "official_editorial"
    | "community_solution"
    | "algorithm_reference"
    | "discussion_warning"
    | "generic_or_offtopic"
    | "low_quality_seo"
  >;
  matchedSignals: OiTopicalitySignal[];
  matchedTerms: string[];
  rejectedReason?: "oi_offtopic_body" | "missing_problem_id" | "missing_task_specific_signal" | "generic_platform_page" | "low_quality_seo" | "missing_algorithm_term" | "missing_editorial_or_solution_signal";
};

export type EvidenceQualityAssessmentInput = {
  evidenceId: string;
  url: string;
  title: string;
  snippet?: string;
  host: string;
  sourceType: ExpectedSourceType | "seo_aggregator" | "unknown";
  facet?: string;
  topic: string;
  intent: ResearchPlanIntent;
  facets: CoverageFacet[];
  evidenceTextLevel?: "body_excerpt" | "snippet_only" | "title_only" | "none";
  excerpt?: string;
  readerQuality?: string;
  dateHint?: string;
  publishedAt?: string;
  currentDate?: string;
  freshnessWindowDays?: number;
  freshnessRequired?: boolean;
};

export type EvidenceQualityAssessment = {
  evidenceId: string;
  url: string;
  host: string;
  facet: string;
  facetLabel: string;
  evidenceQualityScore: number;
  evidenceQualityTier: EvidenceQualityTier;
  sourceRole: EvidenceSourceRole;
  oiTopicality: OiTopicalityAssessment;
  oiTopicalityScore: number;
  oiTopicalityMatchedSignals: OiTopicalitySignal[];
  oiTopicalityRejectedReason?: OiTopicalityAssessment["rejectedReason"];
  acceptedByOiEvidenceGate: boolean;
  hasConcreteEvent: boolean;
  hasDateSignal: boolean;
  dateSignal?: string;
  publishedDate?: string;
  dateSignalSource: DateSignalSource;
  dateConfidence: DateConfidence;
  ageDays?: number;
  isRecentEnough: boolean;
  freshnessStatus: FreshnessStatus;
  freshnessReason: string;
  rejectedByFreshness: boolean;
  hasBodyExcerpt: boolean;
  excerptSpecificity: number;
  titleMatchesBody: boolean;
  freshnessScore: number;
  sourceReliabilityHint: number;
  facetFitScore: number;
  whyQualityAccepted: string[];
  whyQualityDowngraded: string[];
  eventKey: string;
  summaryHint?: string;
};

export type EvidenceQualityDiagnostics = {
  evidenceQualityDistribution: Record<EvidenceQualityTier, number>;
  downgradedEvidenceCount: number;
  backgroundEvidenceCount: number;
  concreteNewsEvidenceCount: number;
};

const compact = (value: string | undefined): string => (value ?? "").replace(/\s+/g, " ").trim();

const normalizeToken = (value: string): string => value.toLocaleLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, " ").trim();

const tokensFrom = (value: string, minLength = 3): string[] =>
  Array.from(new Set(normalizeToken(value).split(/\s+/).filter((token) => token.length >= minLength))).slice(0, 16);

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const countMatches = (text: string, pattern: RegExp): number => text.match(pattern)?.length ?? 0;

const datePatterns = [
  /\b20\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])\b/,
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+20\d{2}\b/i,
  /\b20\d{2}\s*(?:年|\/|-)\s*(?:0?[1-9]|1[0-2])\s*(?:月|\/|-)?/u,
  /\b(?:today|yesterday|this week|last week|recently|latest)\b/i,
  /(?:今日|昨天|本周|上周|近日|近期|最新)/u,
];

const concreteEventPattern =
  /\b(announced|announces|launched|launches|released|releases|introduced|introduces|unveiled|unveils|published|publishes|filed|approved|rejected|signed|invested|raised|acquired|partnered|expanded|opened|closed|reported|said)\b/i;

const concreteCjkPattern = /发布|宣布|推出|上线|披露|批准|通过|签署|投资|融资|收购|合作|扩展|报告|表示|起诉|裁定/u;

const analysisPattern = /\b(analysis|report|survey|study|forecast|outlook|trend|trends|insight|insights|whitepaper|briefing)\b/i;

const marketingPattern = /\b(customer story|case study|webinar|solution brief|product page|pricing|demo|contact sales)\b/i;

const indexTitlePattern = /\b(news|press|press releases|blog|announcements|media center|newsroom)\b\s*(?:[|:-]|$)/i;

const indexPathPattern = /(?:^|\/)(?:news|press|press-release|press-releases|blog|blogs|announcements|newsroom|media|updates)\/?$/i;

const listSignalsPattern = /\b(latest stories|latest news|all news|press releases|view all|subscribe|archive|filter by|browse by)\b/i;

const OI_EMPTY_TOPICALITY: OiTopicalityAssessment = {
  applicable: false,
  accepted: true,
  score: 0,
  role: "generic_or_offtopic",
  matchedSignals: [],
  matchedTerms: [],
};

const OI_PLATFORM_TERMS = [
  "luogu",
  "洛谷",
  "codeforces",
  "cf",
  "atcoder",
  "cses",
  "oi wiki",
  "oi-wiki",
  "cp-algorithms",
  "usaco guide",
  "nowcoder",
  "牛客",
  "hydro",
];

const OI_ROLE_TERMS = {
  editorial: ["editorial", "tutorial", "题解", "讲解", "solution editorial"],
  solution: ["solution", "solutions", "题解", "代码", "实现", "模板"],
  statement: ["problem statement", "statement", "题目描述", "题面", "problemset", "tasks"],
  discussion: ["discussion", "comments", "hack", "wa", "tle", "re", "mle", "坑点", "讨论", "警示后人", "corner case", "corner cases"],
};

const OI_ALGORITHM_TERMS: Array<{ canonical: string; terms: string[] }> = [
  { canonical: "fft", terms: ["fft", "fast fourier transform", "快速傅里叶", "多项式乘法"] },
  { canonical: "ntt", terms: ["ntt", "number theoretic transform", "数论变换"] },
  { canonical: "kmp", terms: ["kmp", "prefix function", "前缀函数", "字符串匹配"] },
  { canonical: "ac 自动机", terms: ["ac 自动机", "aho-corasick", "aho corasick"] },
  { canonical: "树链剖分", terms: ["树链剖分", "重链剖分", "heavy light decomposition", "hld"] },
  { canonical: "点分治", terms: ["点分治", "centroid decomposition"] },
  { canonical: "lca", terms: ["lca", "lowest common ancestor", "最近公共祖先", "倍增"] },
  { canonical: "segment tree", terms: ["线段树", "segment tree"] },
  { canonical: "fenwick", terms: ["树状数组", "fenwick", "binary indexed tree", "bit"] },
  { canonical: "shortest routes", terms: ["shortest routes", "shortest path", "最短路", "dijkstra"] },
  { canonical: "flow", terms: ["网络流", "最大流", "dinic", "flow"] },
  { canonical: "dsu", terms: ["并查集", "dsu", "disjoint set", "union find"] },
  { canonical: "dp", terms: ["动态规划", "dp", "dynamic programming"] },
];

const OI_LOW_QUALITY_HOST_PATTERN = /(?:csdn\.net|geeksforgeeks\.org|programmerall\.com|educba\.com|jianshu\.com|51cto\.com|topic\.algo\.monster|softonic\.com|baidu\.com|wikipedia\.org|support\.google\.com|google\.com|mobile01\.com|bbc\.co\.uk|computertechinfo\.com|techbloat\.com|geekchamp\.com|thecrazyprogrammer\.com|completeera\.com)$/i;
const OI_GENERIC_PLATFORM_PATH_PATTERN = /^\/?$|\/(?:problemset|contest|contests|tasks|blog|blogs|login|enter|home|about|help|wiki)?\/?$/i;

const OI_TEMPLATE_REFERENCE_PATTERN = /\b(template|implementation)\b|模板|实现/i;

const sourceReliabilityHint = (sourceType: EvidenceQualityAssessmentInput["sourceType"]): number => {
  if (sourceType === "official" || sourceType === "documentation") return 18;
  if (sourceType === "mainstream_news") return 16;
  if (sourceType === "technical_blog") return 12;
  if (sourceType === "community_solution" || sourceType === "forum") return 6;
  if (sourceType === "seo_aggregator") return 2;
  return 8;
};

const containsTerm = (text: string, term: string): boolean => {
  const normalized = text.toLocaleLowerCase();
  const lowerTerm = term.toLocaleLowerCase();
  if (/^[a-z0-9_+-]+$/i.test(term)) {
    return new RegExp(`(^|[^a-z0-9])${lowerTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(normalized);
  }
  return normalized.includes(lowerTerm);
};

const pushUnique = <T extends string>(values: T[], value: T): void => {
  if (!values.includes(value)) values.push(value);
};

const extractProblemIds = (text: string): string[] => {
  const ids = [
    ...(text.match(/\bP\d{3,6}\b/gi) ?? []),
    ...(text.match(/\b(?:CF\s*)?\d{3,6}[A-Z]\d?\b/gi) ?? []),
    ...(text.match(/\b(?:abc|arc|agc)\d{3}_[a-h]\b/gi) ?? []),
    ...(text.match(/\b(?:ABC|ARC|AGC)\s*\d{3}[A-H]?\b/g) ?? []),
  ];
  return Array.from(new Set(ids.map((id) => id.replace(/\s+/g, "").toLocaleLowerCase())));
};

const extractAtCoderTaskQueries = (text: string): Array<{ contest: string; task?: string; letter?: string }> => {
  const matches = text.matchAll(/\b(abc|arc|agc)\s*(\d{3})(?:[_\s-]*([a-h]))?\b/gi);
  const tasks: Array<{ contest: string; task?: string; letter?: string }> = [];
  for (const match of matches) {
    const contest = `${match[1].toLocaleLowerCase()}${match[2]}`;
    const letter = match[3]?.toLocaleLowerCase();
    const task = letter ? `${contest}_${letter}` : undefined;
    if (!tasks.some((item) => item.contest === contest && item.task === task)) {
      tasks.push({ contest, task, letter });
    }
  }
  return tasks;
};

const platformTermsFrom = (text: string): string[] =>
  OI_PLATFORM_TERMS.filter((term) => containsTerm(text, term));

const algorithmTermsFrom = (text: string): string[] => {
  const result: string[] = [];
  for (const entry of OI_ALGORITHM_TERMS) {
    if (entry.terms.some((term) => containsTerm(text, term))) result.push(entry.canonical);
  }
  return Array.from(new Set(result));
};

const roleTermsFrom = (text: string, terms: string[]): string[] =>
  terms.filter((term) => containsTerm(text, term));

const hostMatches = (host: string, pattern: RegExp): boolean => pattern.test(host.toLocaleLowerCase());

const trustedOiReference = (host: string): boolean =>
  host === "oi-wiki.org" || host.endsWith(".oi-wiki.org") || host === "cp-algorithms.com" || host.endsWith(".cp-algorithms.com") || host === "usaco.guide";

const officialOiPlatform = (host: string): boolean =>
  host === "luogu.com.cn" || host.endsWith(".luogu.com.cn") ||
  host === "codeforces.com" || host.endsWith(".codeforces.com") ||
  host === "atcoder.jp" || host.endsWith(".atcoder.jp") ||
  host === "cses.fi" || host.endsWith(".cses.fi");

const atCoderTaskSignalHit = (queryTasks: Array<{ contest: string; task?: string; letter?: string }>, visibleText: string, path: string): boolean => {
  if (queryTasks.length === 0) return false;
  const normalizedVisible = visibleText.toLocaleLowerCase();
  const normalizedPath = path.toLocaleLowerCase();
  return queryTasks.some((item) => {
    const contest = item.contest;
    const task = item.task;
    const letter = item.letter;
    if (task && (containsTerm(normalizedVisible, task) || containsTerm(normalizedPath, task))) return true;
    if (task && new RegExp(`\\b${contest}[_\\s-]*${letter}\\b`, "i").test(normalizedVisible)) return true;
    if (containsTerm(normalizedVisible, contest) || containsTerm(normalizedPath, contest)) return true;
    return Boolean(letter && /\/contests\/(?:abc|arc|agc)\d{3}\/(?:tasks|editorial)\//i.test(normalizedPath));
  });
};

const isTrustedAlgorithmReferenceSupport = (
  role: OiTopicalityAssessment["role"],
  host: string,
  topicText: string,
  algorithmMatches: string[],
): boolean =>
  role === "algorithm_reference" &&
  trustedOiReference(host) &&
  algorithmMatches.length > 0 &&
  OI_TEMPLATE_REFERENCE_PATTERN.test(topicText);

const isCsesProblemSourceSignal = (
  host: string,
  path: string,
  topicText: string,
  visibleText: string,
  role: OiTopicalityAssessment["role"],
  platformMatches: string[],
  solutionHits: string[],
  statementHits: string[],
): boolean => {
  if (!/\bcses\b/i.test(topicText)) return false;
  if (platformMatches.length === 0 && !containsTerm(visibleText, "cses") && host !== "cses.fi") return false;
  if (hostMatches(host, OI_LOW_QUALITY_HOST_PATTERN)) return false;
  const lowerVisible = visibleText.toLocaleLowerCase();
  const taskPath = host === "cses.fi" && /\/problemset\/task\//i.test(path);
  const titleOrBodyProblemSignal =
    /shortest routes?(?:\s+(?:i|ii|1|2))?/i.test(lowerVisible) ||
    /\bproblemset\b|\bproblem set\b|\btask\b|\bcses\.fi\/problemset\/task\b/i.test(lowerVisible) ||
    solutionHits.length > 0 ||
    statementHits.length > 0;
  return taskPath || (titleOrBodyProblemSignal && (role === "problem_statement" || role === "community_solution" || role === "official_editorial" || role === "generic_or_offtopic"));
};

const urlPath = (url: string): string => {
  try {
    return new URL(url).pathname.toLocaleLowerCase();
  } catch {
    return "";
  }
};

const inferOiSourceRole = (input: EvidenceQualityAssessmentInput, text: string, host: string): OiTopicalityAssessment["role"] => {
  const path = urlPath(input.url);
  if (hostMatches(host, OI_LOW_QUALITY_HOST_PATTERN) || input.sourceType === "seo_aggregator") return "low_quality_seo";
  if (trustedOiReference(host)) return "algorithm_reference";
  if (/\/blog\/entry\/|\/contest\/\d+\/submission|\/contests\/[^/]+\/editorial|editorial|tutorial|题解/i.test(`${path} ${text}`)) {
    return officialOiPlatform(host) ? "official_editorial" : "community_solution";
  }
  if (/\/problem\/|\/problemset\/problem\/|\/contests\/[^/]+\/tasks\/|\/problemset\/task\//i.test(path) || roleTermsFrom(text, OI_ROLE_TERMS.statement).length > 0) {
    return "problem_statement";
  }
  if (roleTermsFrom(text, OI_ROLE_TERMS.discussion).length > 0) return "discussion_warning";
  if (roleTermsFrom(text, [...OI_ROLE_TERMS.solution, ...OI_ROLE_TERMS.editorial]).length > 0) return "community_solution";
  return "generic_or_offtopic";
};

const assessOiTopicality = (input: EvidenceQualityAssessmentInput, excerpt: string): OiTopicalityAssessment => {
  if (input.intent !== "oi_problem") return OI_EMPTY_TOPICALITY;

  const host = canonicalizePortfolioHost(input.host);
  const titleSnippetUrl = `${input.title} ${input.snippet ?? ""} ${input.url}`;
  const topicText = `${input.topic} ${input.facets.map((facet) => `${facet.label} ${facet.reason} ${facet.queries.join(" ")}`).join(" ")}`;
  const visibleText = `${titleSnippetUrl} ${excerpt}`;
  const lowerPath = urlPath(input.url);
  const role = inferOiSourceRole(input, visibleText, host);
  const signals: OiTopicalitySignal[] = [];
  const matchedTerms: string[] = [];

  const queryProblemIds = extractProblemIds(topicText);
  const visibleProblemIds = extractProblemIds(visibleText);
  const queryPlatforms = platformTermsFrom(topicText);
  const visiblePlatforms = platformTermsFrom(visibleText);
  const queryAlgorithms = algorithmTermsFrom(topicText);
  const visibleAlgorithms = algorithmTermsFrom(visibleText);
  const atCoderTaskQueries = extractAtCoderTaskQueries(topicText);
  const editorialHits = roleTermsFrom(visibleText, OI_ROLE_TERMS.editorial);
  const solutionHits = roleTermsFrom(visibleText, OI_ROLE_TERMS.solution);
  const statementHits = roleTermsFrom(visibleText, OI_ROLE_TERMS.statement);
  const discussionHits = roleTermsFrom(visibleText, OI_ROLE_TERMS.discussion);

  const addTerms = (signal: OiTopicalitySignal, terms: string[]) => {
    if (terms.length === 0) return;
    pushUnique(signals, signal);
    for (const term of terms) if (!matchedTerms.includes(term)) matchedTerms.push(term);
  };

  const problemMatches = queryProblemIds.filter((id) => visibleProblemIds.includes(id) || containsTerm(lowerPath, id));
  addTerms("problem_id", problemMatches);

  const platformMatches = queryPlatforms.filter((term) => visiblePlatforms.some((visible) => visible.toLocaleLowerCase() === term.toLocaleLowerCase()) || containsTerm(host, term));
  addTerms("platform", platformMatches);

  const algorithmMatches = queryAlgorithms.filter((term) => visibleAlgorithms.includes(term));
  addTerms("algorithm", algorithmMatches);

  addTerms("editorial", editorialHits);
  addTerms("solution", solutionHits);
  addTerms("statement", statementHits);
  addTerms("discussion", discussionHits);
  if (officialOiPlatform(host) && !OI_GENERIC_PLATFORM_PATH_PATTERN.test(lowerPath)) pushUnique(signals, "official_path");
  if (trustedOiReference(host)) pushUnique(signals, "trusted_reference");
  if (problemMatches.length > 0 || platformMatches.length > 0 || algorithmMatches.length > 0) pushUnique(signals, "title");
  if (excerpt && (problemMatches.length > 0 || algorithmMatches.length > 0 || editorialHits.length > 0 || solutionHits.length > 0 || statementHits.length > 0)) pushUnique(signals, "body");

  const hasProblemQuery = queryProblemIds.length > 0;
  const hasAlgorithmQuery = queryAlgorithms.length > 0 || /oi wiki|cp-algorithms/i.test(topicText);
  const hasRoleQuery = /editorial|solution|题解|模板|statement|problem/i.test(topicText);
  const trustedAlgorithmReferenceSupport = isTrustedAlgorithmReferenceSupport(role, host, topicText, algorithmMatches);
  const atCoderTaskSpecificRequired = atCoderTaskQueries.some((item) => item.task) && /atcoder|\babc|\barc|\bagc/i.test(topicText);
  const atCoderTaskSpecificHit = atCoderTaskSignalHit(atCoderTaskQueries, visibleText, lowerPath);
  const csesProblemSourceSignal = isCsesProblemSourceSignal(host, lowerPath, topicText, visibleText, role, platformMatches, solutionHits, statementHits);
  let score = 0;
  score += problemMatches.length > 0 ? 42 : 0;
  score += platformMatches.length > 0 ? 18 : 0;
  score += algorithmMatches.length > 0 ? 28 : 0;
  score += editorialHits.length > 0 ? 18 : 0;
  score += solutionHits.length > 0 ? 16 : 0;
  score += statementHits.length > 0 ? 16 : 0;
  score += discussionHits.length > 0 ? 10 : 0;
  score += signals.includes("official_path") ? 12 : 0;
  score += signals.includes("trusted_reference") ? 18 : 0;
  if (trustedAlgorithmReferenceSupport) score += 12;
  if (csesProblemSourceSignal) score += 18;
  if (role === "low_quality_seo") score -= 35;
  if (role === "generic_or_offtopic") score -= 24;
  if (hostMatches(host, OI_LOW_QUALITY_HOST_PATTERN)) score -= 28;
  if (officialOiPlatform(host) && OI_GENERIC_PLATFORM_PATH_PATTERN.test(lowerPath)) score -= 30;

  let rejectedReason: OiTopicalityAssessment["rejectedReason"];
  const genericPlatformPage = officialOiPlatform(host) && OI_GENERIC_PLATFORM_PATH_PATTERN.test(lowerPath);
  if (role === "low_quality_seo" && score < 45) rejectedReason = "low_quality_seo";
  if (!rejectedReason && genericPlatformPage) rejectedReason = "generic_platform_page";
  if (!rejectedReason && atCoderTaskSpecificRequired && !atCoderTaskSpecificHit) rejectedReason = "missing_task_specific_signal";
  if (!rejectedReason && hasProblemQuery && problemMatches.length === 0 && platformMatches.length === 0 && !trustedAlgorithmReferenceSupport && !csesProblemSourceSignal) rejectedReason = "missing_problem_id";
  if (!rejectedReason && hasAlgorithmQuery && algorithmMatches.length === 0 && !signals.includes("trusted_reference") && !csesProblemSourceSignal) rejectedReason = "missing_algorithm_term";
  if (!rejectedReason && hasRoleQuery && [...editorialHits, ...solutionHits, ...statementHits].length === 0 && !signals.includes("official_path") && !trustedAlgorithmReferenceSupport) rejectedReason = "missing_editorial_or_solution_signal";
  if (!rejectedReason && score < 35) rejectedReason = "oi_offtopic_body";

  const accepted = !rejectedReason && score >= (hasProblemQuery ? 45 : hasAlgorithmQuery ? 38 : 35);
  return {
    applicable: true,
    accepted,
    score: clamp(Math.round(score), 0, 100),
    role: accepted ? role : role === "low_quality_seo" ? "low_quality_seo" : "generic_or_offtopic",
    matchedSignals: signals,
    matchedTerms: matchedTerms.slice(0, 12),
    rejectedReason,
  };
};

const isLikelyIndexPage = (input: EvidenceQualityAssessmentInput, excerpt: string): boolean => {
  try {
    const parsed = new URL(input.url);
    const path = parsed.pathname.replace(/\/+$/, "");
    const shallow = path.split("/").filter(Boolean).length <= 1;
    if (indexPathPattern.test(path || "/") && (shallow || indexTitlePattern.test(input.title))) return true;
  } catch {
    // URL validation happened before reading; do not classify invalid URLs here.
  }
  const text = `${input.title} ${excerpt}`;
  const listSignals = countMatches(text, listSignalsPattern);
  const dateCount = datePatterns.reduce((count, pattern) => count + countMatches(text, pattern), 0);
  return indexTitlePattern.test(input.title) && listSignals >= 1 && dateCount >= 3;
};

const excerptSpecificityScore = (excerpt: string): number => {
  if (!excerpt) return 0;
  let score = 0;
  const length = excerpt.length;
  score += length >= 900 ? 20 : length >= 500 ? 16 : length >= 250 ? 10 : length >= 120 ? 5 : 0;
  score += Math.min(10, countMatches(excerpt, /\b[A-Z][A-Za-z0-9&.-]{2,}\b/g));
  score += Math.min(10, datePatterns.reduce((count, pattern) => count + countMatches(excerpt, pattern), 0) * 4);
  score += Math.min(8, countMatches(excerpt, /\b\d+(?:\.\d+)?%?\b/g));
  score += concreteEventPattern.test(excerpt) || concreteCjkPattern.test(excerpt) ? 12 : 0;
  return clamp(score, 0, 60);
};

const titleBodyFit = (title: string, excerpt: string): boolean => {
  const body = normalizeToken(excerpt);
  const titleTokens = tokensFrom(title, 4).filter((token) => !["news", "latest", "report", "analysis", "official"].includes(token));
  if (titleTokens.length === 0) return false;
  const hits = titleTokens.filter((token) => body.includes(token)).length;
  return hits / titleTokens.length >= 0.35;
};

const facetLabelFor = (facets: CoverageFacet[], facet: string): string =>
  facets.find((item) => item.id === facet)?.label ?? facet;

const facetFit = (input: EvidenceQualityAssessmentInput, text: string): number => {
  const facet = input.facets.find((item) => item.id === input.facet);
  const terms = tokensFrom(`${facet?.label ?? input.facet ?? ""} ${facet?.reason ?? ""} ${input.topic}`, 4);
  if (terms.length === 0) return 8;
  const normalized = normalizeToken(text);
  const hits = terms.filter((term) => normalized.includes(term)).length;
  return clamp(Math.round((hits / Math.max(1, terms.length)) * 16), 0, 16);
};

const eventKeyFor = (input: EvidenceQualityAssessmentInput, excerpt: string): string => {
  const host = canonicalizePortfolioHost(input.host);
  const titleTokens = tokensFrom(input.title, 4).slice(0, 5);
  const bodyTokens = tokensFrom(excerpt, 5).slice(0, 4);
  const core = titleTokens.length > 0 ? titleTokens : bodyTokens;
  return `${input.facet ?? "primary"}:${core.join("-") || host || input.evidenceId}`;
};

const roleFor = (
  input: EvidenceQualityAssessmentInput,
  excerpt: string,
  hasConcreteEvent: boolean,
  freshEnoughForNews: boolean,
  isIndexPage: boolean,
): EvidenceSourceRole => {
  const text = `${input.title} ${excerpt} ${input.url}`;
  if (!excerpt || input.evidenceTextLevel !== "body_excerpt") return "weak_candidate";
  if (isIndexPage) return "index_page";
  if (marketingPattern.test(text)) return "background_context";
  if (analysisPattern.test(text)) return "analysis_report";
  if (input.sourceType === "official" && hasConcreteEvent) return "official_announcement";
  if (hasConcreteEvent && freshEnoughForNews) return "breaking_news";
  return "background_context";
};

const summaryHintFromExcerpt = (excerpt: string): string | undefined => {
  const clean = compact(excerpt);
  if (!clean) return undefined;
  const sentences = clean.split(/(?<=[.!?。！？])\s+/u).filter((sentence) => sentence.length >= 60);
  const candidate = sentences[0] ?? clean;
  return candidate.length > 320 ? `${candidate.slice(0, 320).trim()}...` : candidate;
};

export const assessEvidenceQuality = (
  input: EvidenceQualityAssessmentInput,
): EvidenceQualityAssessment => {
  const excerpt = compact(input.excerpt);
  const fullText = compact(`${input.title} ${excerpt}`);
  const hasBodyExcerpt = input.evidenceTextLevel === "body_excerpt" && excerpt.length >= 80;
  const newsIntent = input.intent === "entity_news" || input.intent === "broad_topic_news" || input.intent === "broad_news_digest";
  const dateSignalResult = extractDateSignal({
    title: input.title,
    snippet: input.snippet,
    url: input.url,
    bodyExcerpt: excerpt,
    providerDate: input.dateHint,
    readerPublishedAt: input.publishedAt,
    currentDate: input.currentDate ?? new Date().toISOString().slice(0, 10),
    freshnessWindowDays: input.freshnessWindowDays ?? (newsIntent ? 45 : 0),
    freshnessRequired: input.freshnessRequired ?? newsIntent,
  });
  const dateSignal = dateSignalResult.dateSignalText ?? dateSignalResult.publishedDate;
  const hasDateSignal = dateSignalResult.dateConfidence !== "none";
  const hasConcreteEvent = concreteEventPattern.test(fullText) || concreteCjkPattern.test(fullText);
  const isIndexPage = isLikelyIndexPage(input, excerpt);
  const specificity = excerptSpecificityScore(excerpt);
  const titleMatchesBody = titleBodyFit(input.title, excerpt);
  const freshnessScore = newsIntent
    ? dateSignalResult.freshnessStatus === "fresh" ? 20 : dateSignalResult.freshnessStatus === "stale" ? -28 : -18
    : hasDateSignal ? 10 : input.intent === "technical_docs" || input.intent === "official_reference" ? 8 : 0;
  const reliability = sourceReliabilityHint(input.sourceType);
  const facetScore = facetFit(input, fullText);
  const sourceRole = roleFor(input, excerpt, hasConcreteEvent, dateSignalResult.isRecentEnough, isIndexPage);
  const oiTopicality = assessOiTopicality(input, excerpt);
  const effectiveSourceRole: EvidenceSourceRole = oiTopicality.applicable ? oiTopicality.role : sourceRole;
  const accepted: string[] = [];
  const downgraded: string[] = [];

  let score = specificity + freshnessScore + reliability + facetScore;
  if (hasBodyExcerpt) accepted.push("body_excerpt_present");
  else downgraded.push("missing_usable_body_excerpt");
  if (hasConcreteEvent) accepted.push("concrete_event_signal");
  else downgraded.push("no_concrete_event_signal");
  if (hasDateSignal) accepted.push(`date_signal_present:${dateSignalResult.dateSignalSource}`);
  else if (newsIntent) downgraded.push("missing_date_signal_for_recent_query");
  if (newsIntent && dateSignalResult.freshnessStatus === "fresh") accepted.push("within_freshness_window");
  if (newsIntent && dateSignalResult.freshnessStatus === "stale") downgraded.push("stale_for_recent_news_query");
  if (newsIntent && dateSignalResult.freshnessStatus === "unknown") downgraded.push("unknown_date_not_core_latest_news");
  if (newsIntent && dateSignalResult.freshnessStatus === "future_date_suspicious") downgraded.push("future_date_suspicious");
  if (titleMatchesBody) accepted.push("title_terms_present_in_body");
  else downgraded.push("title_body_match_weak");
  if (oiTopicality.applicable) {
    score += oiTopicality.accepted ? Math.min(24, Math.round(oiTopicality.score / 4)) : -42;
    if (oiTopicality.accepted) {
      accepted.push(`oi_topicality:${oiTopicality.role}`);
      if (oiTopicality.matchedSignals.length > 0) accepted.push(`oi_signals:${oiTopicality.matchedSignals.join(",")}`);
    } else {
      downgraded.push(`oi_topicality_rejected:${oiTopicality.rejectedReason ?? "oi_offtopic_body"}`);
    }
  }

  if (effectiveSourceRole === "index_page") {
    score = Math.min(score, 35);
    downgraded.push("index_or_listing_page_not_concrete_news");
  }
  if (effectiveSourceRole === "analysis_report") {
    score = Math.min(score + 4, 72);
    downgraded.push("analysis_or_report_not_equal_to_latest_news_event");
  }
  if (effectiveSourceRole === "background_context") {
    score = Math.min(score, 52);
    downgraded.push("background_or_marketing_context_not_core_news");
  }
  if (effectiveSourceRole === "weak_candidate") score = Math.min(score, 20);
  if (oiTopicality.applicable && !oiTopicality.accepted) score = Math.min(score, 18);
  if (oiTopicality.applicable && effectiveSourceRole === "low_quality_seo") score = Math.min(score, 28);
  if (newsIntent && dateSignalResult.freshnessStatus === "stale") score = Math.min(score, 42);
  if (newsIntent && dateSignalResult.freshnessStatus === "unknown") score = Math.min(score, 45);
  if (newsIntent && dateSignalResult.freshnessStatus === "future_date_suspicious") score = Math.min(score, 25);
  if (!hasBodyExcerpt) score = 0;

  let tier: EvidenceQualityTier;
  if (!hasBodyExcerpt) tier = "low";
  else if (oiTopicality.applicable && !oiTopicality.accepted) tier = "low";
  else if (effectiveSourceRole === "index_page" || effectiveSourceRole === "background_context") tier = "background";
  else if (newsIntent && dateSignalResult.freshnessStatus !== "fresh") tier = "background";
  else if (newsIntent && !hasConcreteEvent && effectiveSourceRole !== "analysis_report") tier = "background";
  else if (score >= 78) tier = "high";
  else if (score >= 52) tier = "medium";
  else if (effectiveSourceRole === "analysis_report") tier = "background";
  else if (oiTopicality.applicable && oiTopicality.accepted) tier = "medium";
  else tier = "low";

  return {
    evidenceId: input.evidenceId,
    url: input.url,
    host: canonicalizePortfolioHost(input.host),
    facet: input.facet ?? "primary",
    facetLabel: facetLabelFor(input.facets, input.facet ?? "primary"),
    evidenceQualityScore: clamp(Math.round(score), 0, 100),
    evidenceQualityTier: tier,
    sourceRole: effectiveSourceRole,
    oiTopicality,
    oiTopicalityScore: oiTopicality.score,
    oiTopicalityMatchedSignals: oiTopicality.matchedSignals,
    oiTopicalityRejectedReason: oiTopicality.rejectedReason,
    acceptedByOiEvidenceGate: !oiTopicality.applicable || oiTopicality.accepted,
    hasConcreteEvent,
    hasDateSignal,
    dateSignal,
    publishedDate: dateSignalResult.publishedDate,
    dateSignalSource: dateSignalResult.dateSignalSource,
    dateConfidence: dateSignalResult.dateConfidence,
    ageDays: dateSignalResult.ageDays,
    isRecentEnough: dateSignalResult.isRecentEnough,
    freshnessStatus: dateSignalResult.freshnessStatus,
    freshnessReason: dateSignalResult.freshnessReason,
    rejectedByFreshness: newsIntent && dateSignalResult.freshnessStatus !== "fresh",
    hasBodyExcerpt,
    excerptSpecificity: specificity,
    titleMatchesBody,
    freshnessScore,
    sourceReliabilityHint: reliability,
    facetFitScore: facetScore,
    whyQualityAccepted: accepted,
    whyQualityDowngraded: downgraded,
    eventKey: eventKeyFor(input, excerpt),
    summaryHint: hasBodyExcerpt ? summaryHintFromExcerpt(excerpt) : undefined,
  };
};

export const summarizeEvidenceQuality = (
  assessments: EvidenceQualityAssessment[],
): EvidenceQualityDiagnostics => {
  const evidenceQualityDistribution: Record<EvidenceQualityTier, number> = {
    high: 0,
    medium: 0,
    low: 0,
    background: 0,
  };
  for (const assessment of assessments) {
    evidenceQualityDistribution[assessment.evidenceQualityTier] += 1;
  }
  return {
    evidenceQualityDistribution,
    downgradedEvidenceCount: assessments.filter((item) => item.whyQualityDowngraded.length > 0).length,
    backgroundEvidenceCount: assessments.filter((item) => item.evidenceQualityTier === "background" || item.sourceRole === "analysis_report" || item.sourceRole === "index_page").length,
    concreteNewsEvidenceCount: assessments.filter((item) =>
      item.hasBodyExcerpt &&
      item.hasConcreteEvent &&
      (item.sourceRole === "breaking_news" || item.sourceRole === "official_announcement") &&
      (item.evidenceQualityTier === "high" || item.evidenceQualityTier === "medium"),
    ).length,
  };
};
