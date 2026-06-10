import type {
  ExpectedSourceType,
  PlannedQuery,
  QueryPlan,
  QueryPurpose,
  ResearchLanguage,
  ResearchSearchRequest,
  SearchPolicyDecision,
} from "./types";
import { cleanSearchCommandNoise, normalizeOiSearchQuery } from "./oiDiscovery";

const DEFAULT_MAX_QUERIES = 6;

const uniqueQueries = (queries: PlannedQuery[]): PlannedQuery[] => {
  const seen = new Set<string>();
  const result: PlannedQuery[] = [];
  for (const query of queries) {
    const normalized = query.query.replace(/\s+/g, " ").trim();
    const key = normalized.toLocaleLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push({ ...query, query: normalized });
  }
  return result;
};

const planned = (
  query: string,
  language: ResearchLanguage,
  purpose: QueryPurpose,
  priority: number,
  expectedSourceTypes: ExpectedSourceType[],
  preferredDomains?: string[],
): PlannedQuery => ({
  query,
  language,
  purpose,
  priority,
  expectedSourceTypes,
  preferredDomains,
});

const primaryEntity = (request: ResearchSearchRequest, policy: SearchPolicyDecision): string => {
  if (policy.focusEntities.length > 0) {
    const first = policy.focusEntities[0];
    if (/^https?:\/\//i.test(first)) return first;
    return cleanSearchCommandNoise(first);
  }
  const cleanedQuestion = cleanSearchCommandNoise(request.userQuestion);
  return cleanedQuestion
    .replace(/最近|最新|今天|昨天|现在|新闻|消息|有什么|是什么|怎么写|实现坑|死了吗|去世了吗|版本/g, " ")
    .replace(/\s+/g, " ")
    .trim() || cleanedQuestion;
};

const officialDomainsFor = (entity: string): string[] | undefined => {
  const lower = entity.toLocaleLowerCase();
  if (lower.includes("openai")) return ["openai.com"];
  if (lower.includes("react") || lower.includes("useeffect")) return ["react.dev"];
  if (lower.includes("vite")) return ["vite.dev"];
  if (lower.includes("tauri")) return ["tauri.app"];
  if (lower.includes("rust")) return ["doc.rust-lang.org", "docs.rs"];
  return undefined;
};

const buildRumorQueries = (entity: string): PlannedQuery[] => [
  planned(`${entity} 去世`, "zh", "recall", 100, ["mainstream_news", "official"]),
  planned(`${entity} 死亡 辟谣`, "zh", "rebuttal", 95, ["fact_check", "mainstream_news"]),
  planned(`${entity} 最新消息`, "zh", "news", 90, ["mainstream_news", "official"]),
  planned(`${entity} 近期 公开活动`, "zh", "official", 85, ["public_activity", "official", "mainstream_news"]),
];

const buildNewsQueries = (entity: string): PlannedQuery[] => {
  const domains = officialDomainsFor(entity);
  return [
    planned(`${entity} news recent`, "en", "news", 100, ["mainstream_news", "official"]),
    planned(`${entity} announcements`, "en", "official", 94, ["official"], domains),
    ...(domains?.[0] ? [planned(`site:${domains[0]} ${entity} news`, "en", "official", 92, ["official"], domains)] : []),
    planned(`${entity} 最新 新闻`, "zh", "news", 88, ["mainstream_news", "official"]),
  ];
};

const buildDocsQueries = (request: ResearchSearchRequest, entity: string): PlannedQuery[] => {
  const domains = officialDomainsFor(`${request.userQuestion} ${entity}`);
  const question = request.userQuestion.trim();
  return [
    planned(`${entity} docs`, "en", "docs", 100, ["documentation", "official"], domains),
    ...(domains?.[0] ? [planned(`site:${domains[0]} ${entity}`, "en", "official", 96, ["official", "documentation"], domains)] : []),
    planned(question, request.userQuestion.match(/[\u3400-\u9fff]/) ? "mixed" : "en", "recall", 72, ["documentation", "technical_blog"]),
  ];
};

const compact = (value: string): string => value.replace(/\s+/g, " ").trim();

const extractFirst = (text: string, pattern: RegExp): string | undefined => text.match(pattern)?.[0]?.trim();

const extractLuoguProblemId = (text: string): string | undefined =>
  extractFirst(text, /\bP\d{3,6}\b/i)?.toUpperCase();

const extractCodeforcesId = (text: string): string | undefined => {
  const explicit = text.match(/\b(?:CF|Codeforces)\s*(?:Round\s*)?(\d{3,6}[A-Z]\d?)\b/i)?.[1];
  if (explicit) return explicit.toUpperCase();
  return text.match(/\b(\d{3,6}[A-Z]\d?)\b(?=.*\b(?:Codeforces|CF|editorial|solution|tutorial)\b)/i)?.[1]?.toUpperCase();
};

const extractAtCoderTask = (text: string): string | undefined => {
  const task = text.match(/\b((?:abc|arc|agc)\d{3}_[a-h])\b/i)?.[1];
  if (task) return task.toLowerCase();
  const contestTask = text.match(/\b((?:ABC|ARC|AGC)\s*\d{3}[A-H]?)\b/i)?.[1];
  return contestTask ? compact(contestTask).toUpperCase() : undefined;
};

const algorithmPatterns: Array<{ canonical: string; patterns: RegExp[] }> = [
  { canonical: "FFT", patterns: [/\bFFT\b/i, /快速傅里叶|多项式乘法/] },
  { canonical: "NTT", patterns: [/\bNTT\b/i, /快速数论变换/] },
  { canonical: "KMP", patterns: [/\bKMP\b/i, /字符串匹配|前缀函数/] },
  { canonical: "AC 自动机", patterns: [/AC\s*自动机/i, /Aho[- ]?Corasick/i] },
  { canonical: "树链剖分", patterns: [/树链剖分|重链剖分|\bHLD\b/i] },
  { canonical: "点分治", patterns: [/点分治|点分树|centroid decomposition/i] },
  { canonical: "LCA", patterns: [/\bLCA\b/i, /最近公共祖先|倍增/] },
  { canonical: "线段树", patterns: [/线段树|segment tree/i] },
  { canonical: "树状数组", patterns: [/树状数组|Fenwick|\bBIT\b/i] },
  { canonical: "最短路", patterns: [/最短路|shortest routes?|Dijkstra/i] },
  { canonical: "网络流", patterns: [/网络流|最大流|Dinic|flow/i] },
  { canonical: "并查集", patterns: [/并查集|\bDSU\b|disjoint set/i] },
  { canonical: "动态规划", patterns: [/动态规划|\bDP\b/i] },
];

const extractAlgorithmKeywords = (text: string): string[] => {
  const keywords: string[] = [];
  for (const item of algorithmPatterns) {
    if (item.patterns.some((pattern) => pattern.test(text))) keywords.push(item.canonical);
  }
  return uniqueQueries(keywords.map((keyword) => planned(keyword, "mixed", "recall", 1, ["documentation"]))).map((item) => item.query);
};

const hasDebugSignal = (text: string): boolean =>
  /\b(?:WA|TLE|RE|MLE|Hack)\b|坑点|实现坑|常见坑|讨论|警示后人|corner cases?/i.test(text);

const pushOiAlgorithmQueries = (queries: PlannedQuery[], algorithms: string[], basePriority: number): void => {
  for (const keyword of algorithms.slice(0, 2)) {
    queries.push(
      planned(`${keyword} OI Wiki`, "mixed", "docs", basePriority, ["documentation", "official"], ["oi-wiki.org"]),
      planned(`${keyword} cp-algorithms`, "mixed", "docs", basePriority - 2, ["documentation", "official"], ["cp-algorithms.com"]),
      planned(`${keyword} 模板 题解`, "zh", "recall", basePriority - 6, ["community_solution", "technical_blog"]),
      planned(`${keyword} implementation pitfalls`, "en", "recall", basePriority - 10, ["documentation", "technical_blog"]),
    );
  }
};

const buildOiQueries = (request: ResearchSearchRequest, entity: string): PlannedQuery[] => {
  const question = normalizeOiSearchQuery(request.userQuestion.trim());
  const haystack = `${question} ${entity}`;
  const luoguProblemId = extractLuoguProblemId(haystack);
  const codeforcesId = extractCodeforcesId(haystack);
  const atcoderTask = extractAtCoderTask(haystack);
  const isAtCoderDp = /\bAtCoder\s+DP\s+contest\b|\bEducational DP\b/i.test(haystack);
  const csesTopic = /\bCSES\b/i.test(haystack)
    ? compact(question.replace(/\bCSES\b/ig, "").replace(/\b(?:problem|solution|editorial)\b/ig, "")) || entity
    : "";
  const algorithms = extractAlgorithmKeywords(haystack);
  const debugLike = hasDebugSignal(haystack);
  const queries: PlannedQuery[] = [
    planned(question, "mixed", "exact_problem", 100, ["problem_statement", "community_solution", "forum"]),
  ];

  if (luoguProblemId) {
    queries.push(
      planned(`洛谷 ${luoguProblemId} 题解`, "zh", "exact_problem", 98, ["problem_statement", "community_solution"], ["luogu.com.cn"]),
      planned(`Luogu ${luoguProblemId} solution`, "en", "exact_problem", 94, ["problem_statement", "community_solution"], ["luogu.com.cn"]),
      planned(`${luoguProblemId} 题解`, "zh", "exact_problem", 90, ["community_solution", "forum"]),
      planned(`${luoguProblemId} 实现 坑点`, "zh", "recall", 84, ["community_solution", "forum"]),
    );
  }

  if (codeforcesId) {
    queries.push(
      planned(`Codeforces ${codeforcesId} editorial`, "en", "exact_problem", 98, ["official", "community_solution"], ["codeforces.com"]),
      planned(`CF ${codeforcesId} solution`, "en", "exact_problem", 94, ["community_solution", "forum"], ["codeforces.com"]),
      planned(`${codeforcesId} Codeforces tutorial`, "en", "recall", 90, ["official", "community_solution"], ["codeforces.com"]),
      planned(`${codeforcesId} Codeforces blog`, "en", "recall", 86, ["forum", "community_solution"], ["codeforces.com"]),
    );
  }

  if (atcoderTask || isAtCoderDp) {
    const task = atcoderTask ?? "AtCoder DP contest";
    const contest = atcoderTask?.match(/^(abc|arc|agc)\d{3}/i)?.[0] ?? task;
    queries.push(
      planned(`AtCoder ${task} editorial`, "en", "exact_problem", 98, ["official", "community_solution"], ["atcoder.jp"]),
      planned(`${task} solution`, "en", "exact_problem", 92, ["community_solution", "forum"], ["atcoder.jp"]),
      planned(`${contest} editorial`, "en", "recall", 88, ["official", "community_solution"], ["atcoder.jp"]),
    );
  }

  if (csesTopic) {
    queries.push(
      planned(`CSES ${csesTopic} solution`, "en", "exact_problem", 96, ["problem_statement", "community_solution"], ["cses.fi"]),
      planned(`CSES ${csesTopic} editorial`, "en", "recall", 90, ["community_solution", "technical_blog"]),
      planned(`CSES ${csesTopic} cp-algorithms`, "en", "docs", 84, ["documentation", "technical_blog"], ["cp-algorithms.com"]),
    );
  }

  pushOiAlgorithmQueries(queries, algorithms, luoguProblemId || codeforcesId || atcoderTask || csesTopic ? 82 : 98);

  const debugTarget = luoguProblemId ?? codeforcesId ?? atcoderTask ?? (csesTopic || undefined) ?? algorithms[0] ?? entity;
  if (debugTarget && debugLike) {
    queries.push(
      planned(`${debugTarget} WA TLE 坑点`, "mixed", "recall", 78, ["community_solution", "forum"]),
      planned(`${debugTarget} 讨论`, "zh", "recall", 74, ["forum", "community_solution"]),
      planned(`${debugTarget} 警示后人`, "zh", "recall", 70, ["forum", "community_solution"]),
      planned(`${debugTarget} corner cases`, "en", "recall", 66, ["technical_blog", "community_solution"]),
    );
  }

  if (!luoguProblemId && !codeforcesId && !atcoderTask && !isAtCoderDp && !csesTopic && algorithms.length === 0 && entity) {
    queries.push(planned(`${entity} 题解 实现坑`, "zh", "recall", 88, ["community_solution", "forum"]));
  }

  return queries;
};

const buildGeneralQueries = (request: ResearchSearchRequest, entity: string): PlannedQuery[] => {
  const question = request.userQuestion.trim();
  const domains = officialDomainsFor(entity);
  const currentQuery = /汇率|价格|exchange rate|price/i.test(question)
    ? `${question} official current`
    : `${entity} latest`;
  return [
    planned(currentQuery, "mixed", "official", 100, ["official", "mainstream_news"], domains),
    planned(question, request.userQuestion.match(/[\u3400-\u9fff]/) ? "zh" : "en", "recall", 82, ["official", "mainstream_news"]),
    ...(domains?.[0] ? [planned(`site:${domains[0]} ${entity} latest`, "en", "official", 88, ["official"], domains)] : []),
  ];
};

export const buildQueryPlan = (request: ResearchSearchRequest, policy: SearchPolicyDecision): QueryPlan => {
  const maxQueries = Math.max(0, Math.min(request.options?.maxQueries ?? DEFAULT_MAX_QUERIES, 8));
  const entity = primaryEntity(request, policy);
  let queries: PlannedQuery[] = [];

  if (!policy.needSearch || policy.mode === "no_search") {
    queries = [];
  } else if (policy.mode === "explicit_url") {
    queries = [planned(entity, policy.locale, "official", 100, ["explicit_url"])];
  } else if (policy.mode === "rumor_check") {
    queries = buildRumorQueries(entity);
  } else if (policy.mode === "news_recent") {
    queries = buildNewsQueries(entity);
  } else if (policy.mode === "docs_technical") {
    queries = buildDocsQueries(request, entity);
  } else if (policy.mode === "oi_algorithm") {
    queries = buildOiQueries(request, entity);
  } else {
    queries = buildGeneralQueries(request, entity);
  }

  const finalQueries = uniqueQueries(queries)
    .sort((left, right) => right.priority - left.priority)
    .slice(0, maxQueries);

  return {
    requestId: request.requestId,
    userQuestion: request.userQuestion,
    needSearch: policy.needSearch,
    mode: policy.mode,
    risk: policy.risk,
    freshness: policy.freshness,
    vertical: policy.vertical,
    locale: policy.locale,
    focusEntities: policy.focusEntities,
    maxQueries,
    queries: finalQueries,
    reason: policy.needSearch ? `planned_${finalQueries.length}_queries_for_${policy.mode}` : "no_search_policy_has_no_queries",
    future: {},
  };
};
