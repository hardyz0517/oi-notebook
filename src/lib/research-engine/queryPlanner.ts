import type {
  ExpectedSourceType,
  PlannedQuery,
  QueryPlan,
  QueryPurpose,
  ResearchLanguage,
  ResearchSearchRequest,
  SearchPolicyDecision,
} from "./types";

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
    return first;
  }
  return request.userQuestion
    .replace(/最近|最新|今天|昨天|现在|新闻|消息|有什么|是什么|怎么写|实现坑|死了吗|去世了吗|版本/g, " ")
    .replace(/\s+/g, " ")
    .trim() || request.userQuestion.trim();
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

const buildOiQueries = (request: ResearchSearchRequest, entity: string): PlannedQuery[] => {
  const question = request.userQuestion.trim();
  const hasP3379 = /\bP3379\b/i.test(question);
  const hasLca = /LCA|最近公共祖先|倍增/i.test(question);
  const hasCentroid = /点分树|重心分治|centroid/i.test(question);
  const queries: PlannedQuery[] = [
    planned(question, "mixed", "exact_problem", 100, ["community_solution", "problem_statement", "forum"]),
  ];
  if (hasP3379 || hasLca) {
    queries.push(
      planned("P3379 最近公共祖先 题解", "zh", "exact_problem", 96, ["problem_statement", "community_solution"]),
      planned("LCA 倍增 实现坑", "mixed", "recall", 88, ["technical_blog", "community_solution", "forum"]),
    );
  }
  if (hasCentroid) {
    queries.push(
      planned("点分树 常见实现坑", "zh", "recall", 96, ["community_solution", "technical_blog"]),
      planned("centroid decomposition implementation pitfalls", "en", "recall", 82, ["documentation", "technical_blog"]),
    );
  }
  if (!hasP3379 && !hasLca && !hasCentroid && entity) {
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
