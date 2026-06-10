import type { AiSearchFreshness, SearchMode } from "@/lib/aiWebSearch";
import type {
  CoverageFacet,
  ExecutableCoveragePlan,
  LlmResearchPlan,
  LlmResearchPlannerDiagnostics,
  ResearchPlanAnswerContract,
  ResearchPlanFreshness,
  ResearchPlanIntent,
  ResearchPlanReading,
  ResearchPlanSourceRequirements,
} from "./researchPlanTypes";
import {
  expectedSourceTypesForIntent,
  languageForQuery,
  toPlannedQueryPurpose,
} from "./researchPlanTypes";
import { buildFreshnessWindowPolicy } from "./dateSignals";
import type { PlannedQuery, SearchPolicyDecision } from "./types";
import { cleanSearchCommandNoise, normalizeOiSearchQuery } from "./oiDiscovery";

export type CoveragePlannerInput = {
  userQuery: string;
  policy: SearchPolicyDecision;
  searchMode?: SearchMode;
  freshness?: AiSearchFreshness | string;
  rulePlannedQueries: PlannedQuery[];
  llmPlan?: LlmResearchPlan;
  llmDiagnostics?: LlmResearchPlannerDiagnostics;
};

const QUERY_LIMITS: Record<ResearchPlanIntent, { min: number; max: number }> = {
  entity_news: { min: 10, max: 12 },
  broad_topic_news: { min: 12, max: 16 },
  broad_news_digest: { min: 12, max: 16 },
  technical_docs: { min: 3, max: 6 },
  official_reference: { min: 3, max: 6 },
  general_web: { min: 5, max: 8 },
  oi_problem: { min: 4, max: 8 },
};

const compact = (value: string): string => value.replace(/\s+/g, " ").trim();

const topicFrom = (input: CoveragePlannerInput): string => {
  const llmTopic = compact(input.llmPlan?.topic ?? "");
  if (llmTopic) return llmTopic;
  const firstRule = compact(input.rulePlannedQueries[0]?.query ?? "");
  const fallbackTopic = firstRule || cleanSearchCommandNoise(input.userQuery) || "current topic";
  return input.policy.mode === "oi_algorithm" || input.searchMode === "oi_algorithm"
    ? normalizeOiSearchQuery(fallbackTopic)
    : fallbackTopic;
};

const isBroadDigest = (query: string): boolean =>
  /\b(world news|international news|global news|major world events|world events)\b/i.test(query) ||
  /\u56fd\u9645|\u4e16\u754c|\u5168\u7403/.test(query);

const isBroadTopicNewsQuery = (query: string): boolean => {
  const normalized = compact(query).toLocaleLowerCase();
  return /\b(ai|artificial intelligence|machine learning|llm|large language models?|tech|technology|crypto|climate|energy|semiconductor|robotics)\s+(field|sector|industry|area|domain|space)\b/i.test(normalized) ||
    /\b(latest|recent|news|developments?|progress|updates?)\b.*\b(ai|artificial intelligence|machine learning|llm|large language models?|tech|technology|crypto|climate|energy|semiconductor|robotics)\b/i.test(normalized) ||
    /\b(ai|artificial intelligence|machine learning|llm|large language models?|tech|technology|crypto|climate|energy|semiconductor|robotics)\b.*\b(latest|recent|news|developments?|progress|updates?)\b/i.test(normalized) ||
    /(?:AI|\u4eba\u5de5\u667a\u80fd|\u673a\u5668\u5b66\u4e60|\u5927\u6a21\u578b|\u79d1\u6280|\u6280\u672f|\u534a\u5bfc\u4f53|\u673a\u5668\u4eba|\u65b0\u80fd\u6e90|\u6c14\u5019|\u52a0\u5bc6\u8d27\u5e01)(?:\s*\u9886\u57df|\s*\u884c\u4e1a|\s*\u4ea7\u4e1a|\s*\u65b9\u5411|\s*\u8d5b\u9053)/i.test(query) ||
    /(?:\u9886\u57df|\u884c\u4e1a|\u4ea7\u4e1a|\u65b9\u5411|\u8d5b\u9053).*(?:\u6700\u65b0\u8fdb\u5c55|\u65b0\u95fb|\u52a8\u6001|\u6d88\u606f)/.test(query);
};

const inferIntent = (input: CoveragePlannerInput): ResearchPlanIntent => {
  if (input.llmPlan?.intent) return input.llmPlan.intent;
  if (input.searchMode === "docs_technical" || input.policy.mode === "docs_technical") return "technical_docs";
  if (input.searchMode === "oi_algorithm" || input.policy.mode === "oi_algorithm") return "oi_problem";
  if (input.searchMode === "news_recent" || input.policy.mode === "news_recent" || input.freshness === "news" || input.freshness === "latest" || input.freshness === "recent") {
    if (isBroadDigest(input.userQuery)) return "broad_news_digest";
    if (isBroadTopicNewsQuery(input.userQuery)) return "broad_topic_news";
    const topic = topicFrom(input);
    const namedEntityLike = /[A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,3}/.test(topic) || input.llmPlan?.entities?.length;
    return namedEntityLike ? "entity_news" : "broad_topic_news";
  }
  if (input.policy.vertical === "docs_technical") return "technical_docs";
  return "general_web";
};

const freshnessFor = (intent: ResearchPlanIntent, input: CoveragePlannerInput): ResearchPlanFreshness => {
  if (intent === "oi_problem") {
    return input.policy.freshness === "recent" || input.policy.freshness === "latest" || input.policy.freshness === "current" ? "recent" : "stable";
  }
  if (input.llmPlan?.freshness) return input.llmPlan.freshness;
  if (intent === "entity_news" || intent === "broad_news_digest" || intent === "broad_topic_news") return "current";
  if (input.policy.freshness === "current" || input.policy.freshness === "latest") return "current";
  if (input.policy.freshness === "recent") return "recent";
  return "stable";
};

const unique = (values: string[]): string[] => {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values.map(compact).filter(Boolean)) {
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
};

const currentMonthHints = (): string[] => {
  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const year = now.getUTCFullYear();
  const monthNumber = String(now.getUTCMonth() + 1).padStart(2, "0");
  return [`${month} ${year}`, `${year}\u5e74${monthNumber}\u6708`, "this week", "today"];
};

const expansionQueries = (intent: ResearchPlanIntent, topic: string): string[] => {
  const [enMonth, zhMonth, thisWeek, today] = currentMonthHints();
  if (intent === "broad_news_digest") {
    return [
      `world news ${enMonth}`,
      `${zhMonth} \u56fd\u9645\u65b0\u95fb`,
      `world news ${thisWeek}`,
      `\u56fd\u9645\u65b0\u95fb ${today}`,
      "\u56fd\u9645\u65b0\u95fb \u6700\u65b0",
      "\u4eca\u65e5\u56fd\u9645\u65b0\u95fb",
      "\u5168\u7403\u8981\u95fb",
      "world news today",
      "latest world news",
      "international news today",
    ];
  }
  if (intent === "broad_topic_news") {
    return [
      `${topic} ${enMonth} latest news`,
      `${topic} ${zhMonth} \u6700\u65b0\u65b0\u95fb`,
      `${topic} ${thisWeek} developments`,
      `${topic} ${today} news`,
      `${topic} latest developments`,
      `${topic} policy regulation news`,
      `${topic} industry applications news`,
      `${topic} research open source news`,
      `${topic} \u6700\u65b0\u8fdb\u5c55`,
      `${topic} \u653f\u7b56 \u76d1\u7ba1 \u65b0\u95fb`,
      `${topic} \u4ea7\u4e1a \u5e94\u7528 \u65b0\u95fb`,
      `${topic} \u7814\u7a76 \u5f00\u6e90 \u65b0\u95fb`,
    ];
  }
  if (intent === "entity_news") {
    return [
      `${topic} ${enMonth} latest news`,
      `${topic} ${zhMonth} \u6700\u65b0\u6d88\u606f`,
      `${topic} ${thisWeek} news`,
      `${topic} ${today} announcement`,
      `${topic} \u6700\u65b0\u6d88\u606f`,
      `${topic} \u65b0\u95fb`,
      `${topic} latest news`,
      `${topic} recent developments`,
      `${topic} official announcement`,
      `${topic} analysis`,
    ];
  }
  if (intent === "technical_docs" || intent === "official_reference") {
    return [
      `${topic} official documentation`,
      `${topic} docs`,
      `${topic} API reference`,
    ];
  }
  if (intent === "oi_problem") {
    return [
      topic,
      `${topic} 题解`,
      `${topic} editorial`,
      `${topic} solution`,
      `${topic} problem statement`,
      `${topic} OI Wiki`,
      `${topic} cp-algorithms`,
      `${topic} implementation pitfalls`,
    ];
  }
  return [
    `${topic} official`,
    `${topic} overview`,
    `${topic} latest`,
    `${topic} analysis`,
  ];
};

const defaultFacets = (intent: ResearchPlanIntent, topic: string): CoverageFacet[] => {
  if (intent === "broad_topic_news") {
    return [
      { id: "developments", label: "Latest developments", reason: "current topic updates", queries: [`${topic} latest developments`, `${topic} \u6700\u65b0\u8fdb\u5c55`], preferredSourceTypes: ["mainstream_news"], source: "expansion" },
      { id: "policy", label: "Policy and regulation", reason: "policy or regulatory angle", queries: [`${topic} policy regulation news`, `${topic} \u653f\u7b56 \u76d1\u7ba1 \u65b0\u95fb`], preferredSourceTypes: ["mainstream_news", "official"], source: "expansion" },
      { id: "industry", label: "Industry applications", reason: "industry adoption and applications", queries: [`${topic} industry applications news`, `${topic} \u4ea7\u4e1a \u5e94\u7528 \u65b0\u95fb`], preferredSourceTypes: ["mainstream_news", "technical_blog"], source: "expansion" },
      { id: "research", label: "Research and open source", reason: "research or open-source movement", queries: [`${topic} research open source news`, `${topic} \u7814\u7a76 \u5f00\u6e90 \u65b0\u95fb`], preferredSourceTypes: ["technical_blog", "official"], source: "expansion" },
    ];
  }
  if (intent === "broad_news_digest") {
    return [
      { id: "world", label: "World news", reason: "global major news coverage", queries: ["world news today", "\u5168\u7403\u8981\u95fb"], preferredSourceTypes: ["mainstream_news"], source: "expansion" },
      { id: "international", label: "International news", reason: "international event coverage", queries: ["international news today", "\u4eca\u65e5\u56fd\u9645\u65b0\u95fb"], preferredSourceTypes: ["mainstream_news"], source: "expansion" },
      { id: "latest", label: "Latest updates", reason: "recent developments", queries: ["latest world news", "\u56fd\u9645\u65b0\u95fb \u6700\u65b0"], preferredSourceTypes: ["mainstream_news"], source: "expansion" },
    ];
  }
  if (intent === "technical_docs" || intent === "official_reference") {
    return [
      { id: "official", label: "Official reference", reason: "official source preferred", queries: [`${topic} official documentation`, `${topic} docs`], preferredSourceTypes: ["official", "documentation"], source: "expansion" },
      { id: "api", label: "API reference", reason: "reference details", queries: [`${topic} API reference`], preferredSourceTypes: ["documentation"], source: "expansion" },
    ];
  }
  return [
    { id: "primary", label: "Primary coverage", reason: "main answer coverage", queries: expansionQueries(intent, topic).slice(0, 4), preferredSourceTypes: ["official", "mainstream_news"], source: "expansion" },
  ];
};

const requirementsFor = (
  intent: ResearchPlanIntent,
  llm?: ResearchPlanSourceRequirements,
): ResearchPlanSourceRequirements => {
  const base: ResearchPlanSourceRequirements = intent === "broad_topic_news"
    ? { targetReadCount: 30, minDistinctHosts: 5, targetDistinctHosts: 10, minUsableBodyEvidence: 5, minCoveredFacets: 3 }
    : intent === "broad_news_digest"
      ? { targetReadCount: 30, minDistinctHosts: 4, targetDistinctHosts: 10, minUsableBodyEvidence: 5, minCoveredFacets: 2 }
      : intent === "entity_news"
        ? { targetReadCount: 30, minDistinctHosts: 3, targetDistinctHosts: 8, minUsableBodyEvidence: 3, minCoveredFacets: 1 }
        : intent === "technical_docs" || intent === "official_reference"
          ? { targetReadCount: 6, minDistinctHosts: 1, targetDistinctHosts: 3, minUsableBodyEvidence: 1, minCoveredFacets: 1 }
          : { targetReadCount: 8, minDistinctHosts: 1, targetDistinctHosts: 3, minUsableBodyEvidence: 1, minCoveredFacets: 1 };
  return {
    targetReadCount: Math.max(base.targetReadCount, llm?.targetReadCount ?? 0),
    minDistinctHosts: Math.max(base.minDistinctHosts, llm?.minDistinctHosts ?? 0),
    targetDistinctHosts: Math.max(base.targetDistinctHosts, llm?.targetDistinctHosts ?? 0),
    minUsableBodyEvidence: Math.max(base.minUsableBodyEvidence, llm?.minUsableBodyEvidence ?? 0),
    minCoveredFacets: Math.max(base.minCoveredFacets, llm?.minCoveredFacets ?? 0),
  };
};

const readingFor = (intent: ResearchPlanIntent, llm?: ResearchPlanReading): ResearchPlanReading => {
  const isNews = intent === "entity_news" || intent === "broad_topic_news" || intent === "broad_news_digest";
  const base: ResearchPlanReading = isNews
    ? { maxReadAttempts: 30, concurrency: 5, perUrlTimeoutMs: 9_000, globalBudgetMs: 60_000 }
    : { maxReadAttempts: intent === "technical_docs" || intent === "official_reference" ? 6 : 8, concurrency: 4, perUrlTimeoutMs: 9_000, globalBudgetMs: 35_000 };
  return {
    maxReadAttempts: Math.min(36, Math.max(base.maxReadAttempts, llm?.maxReadAttempts ?? 0)),
    concurrency: Math.min(6, Math.max(base.concurrency, llm?.concurrency ?? 0)),
    perUrlTimeoutMs: Math.min(12_000, Math.max(4_000, llm?.perUrlTimeoutMs ?? base.perUrlTimeoutMs)),
    globalBudgetMs: Math.min(75_000, Math.max(base.globalBudgetMs, llm?.globalBudgetMs ?? 0)),
  };
};

const answerContractFor = (llm?: ResearchPlanAnswerContract): ResearchPlanAnswerContract => ({
  allowCautiousAnswer: llm?.allowCautiousAnswer !== false,
  mustDiscloseLimitations: llm?.mustDiscloseLimitations !== false,
});

export const buildSearchCoveragePlan = (input: CoveragePlannerInput): ExecutableCoveragePlan => {
  const intent = inferIntent(input);
  const topic = topicFrom(input);
  const effectiveFreshness = intent === "oi_problem" && input.policy.freshness === "stable" ? "stable" : input.freshness;
  const freshnessPolicy = buildFreshnessWindowPolicy({
    intent,
    freshness: effectiveFreshness,
    userQuery: input.userQuery,
  });
  const llmFacets: CoverageFacet[] = (input.llmPlan?.facets ?? []).map((facet) => ({ ...facet, source: "llm" }));
  const facets = llmFacets.length > 0 ? llmFacets : defaultFacets(intent, topic);
  const facetQueries: Record<string, string[]> = {};
  for (const facet of facets) {
    facetQueries[facet.id] = unique(facet.queries);
  }
  const ruleQueries = input.rulePlannedQueries.map((item) => item.query);
  const allQueries = unique([
    ...facets.flatMap((facet) => facet.queries),
    ...(input.llmPlan?.queries ?? []),
    ...ruleQueries,
    ...expansionQueries(intent, topic),
  ]);
  const limit = QUERY_LIMITS[intent];
  const queries = allQueries.slice(0, limit.max);
  const sourceRequirements = requirementsFor(intent, input.llmPlan?.sourceRequirements);
  const reading = readingFor(intent, input.llmPlan?.reading);
  const queryFacets: Record<string, string> = {};
  for (const facet of facets) {
    for (const query of facet.queries) queryFacets[compact(query).toLocaleLowerCase()] = facet.id;
  }
  for (const query of queries) {
    const key = query.toLocaleLowerCase();
    if (!queryFacets[key]) queryFacets[key] = facets[0]?.id ?? "primary";
  }
  const purpose = toPlannedQueryPurpose(intent);
  const expectedSourceTypes = expectedSourceTypesForIntent(intent);
  const plannedQueries = queries.map((query, index): PlannedQuery => ({
    query,
    language: languageForQuery(query),
    purpose,
    priority: Math.max(1, 100 - index * 3),
    expectedSourceTypes,
  }));
  const diagnostics = input.llmDiagnostics ?? {
    llmPlannerStarted: false,
    llmPlannerSucceeded: false,
    plannerSanitizationNotes: [],
  };
  return {
    intent,
    topic,
    entities: input.llmPlan?.entities ?? input.policy.focusEntities,
    freshness: freshnessFor(intent, input),
    facets,
    queries,
    queryFacets,
    plannedQueries,
    sourceRequirements,
    reading,
    answerContract: answerContractFor(input.llmPlan?.answerContract),
    diagnostics: {
      llmPlannerStarted: diagnostics.llmPlannerStarted,
      llmPlannerSucceeded: diagnostics.llmPlannerSucceeded,
      llmPlannerFailedReason: diagnostics.llmPlannerFailedReason,
      ruleFallbackUsed: diagnostics.llmPlannerStarted && !diagnostics.llmPlannerSucceeded,
      plannerIntent: input.llmPlan?.intent,
      coveragePlanIntent: intent,
      coverageFacets: facets.map((facet) => facet.id),
      facetQueries,
      generatedQueryCount: queries.length,
      targetReadCount: sourceRequirements.targetReadCount,
      maxReadAttempts: reading.maxReadAttempts,
      readerConcurrency: reading.concurrency,
      currentDate: freshnessPolicy.currentDate,
      freshnessWindowDays: freshnessPolicy.freshnessWindowDays,
      queryFreshnessHints: freshnessPolicy.queryFreshnessHints,
      plannerSanitizationNotes: diagnostics.plannerSanitizationNotes,
    },
  };
};
