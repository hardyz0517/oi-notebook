import type { AiSearchFreshness, SearchMode } from "@/lib/aiWebSearch";
import type { ExpectedSourceType, PlannedQuery, QueryPurpose, ResearchLanguage } from "./types";

export type ResearchPlanIntent =
  | "entity_news"
  | "broad_news_digest"
  | "broad_topic_news"
  | "technical_docs"
  | "official_reference"
  | "general_web"
  | "oi_problem";

export type ResearchPlanFreshness = "recent" | "current" | "stable";

export type ResearchPlanFacet = {
  id: string;
  label: string;
  reason: string;
  queries: string[];
  preferredSourceTypes: string[];
};

export type ResearchPlanSourceRequirements = {
  targetReadCount: number;
  minDistinctHosts: number;
  targetDistinctHosts: number;
  minUsableBodyEvidence: number;
  minCoveredFacets: number;
};

export type ResearchPlanReading = {
  maxReadAttempts: number;
  concurrency: number;
  perUrlTimeoutMs: number;
  globalBudgetMs: number;
};

export type ResearchPlanAnswerContract = {
  allowCautiousAnswer: boolean;
  mustDiscloseLimitations: boolean;
};

export type LlmResearchPlan = {
  intent: ResearchPlanIntent;
  topic: string;
  entities: string[];
  freshness: ResearchPlanFreshness;
  facets: ResearchPlanFacet[];
  queries: string[];
  sourceRequirements: ResearchPlanSourceRequirements;
  reading: ResearchPlanReading;
  answerContract: ResearchPlanAnswerContract;
};

export type LlmResearchPlannerInput = {
  userQuery: string;
  locale: string;
  searchMode?: SearchMode;
  freshness?: AiSearchFreshness | ResearchPlanFreshness | string;
  ruleIntent?: string;
  rulePlannedQueries: PlannedQuery[];
  currentDate?: string;
  currentDateText?: string;
  publicSearchConstraints: string[];
  noKeyProviderConstraints: string[];
  providerId?: string;
  modelId?: string;
  timeoutMs?: number;
};

export type LlmResearchPlannerDiagnostics = {
  llmPlannerStarted: boolean;
  llmPlannerSucceeded: boolean;
  llmPlannerFailedReason?: string;
  llmPlannerRawLength?: number;
  plannerSanitizationNotes: string[];
};

export type LlmResearchPlannerResult = {
  plan?: LlmResearchPlan;
  diagnostics: LlmResearchPlannerDiagnostics;
};

export type CoverageFacet = ResearchPlanFacet & {
  source: "llm" | "rule" | "expansion";
};

export type ExecutableCoveragePlan = {
  intent: ResearchPlanIntent;
  topic: string;
  entities: string[];
  freshness: ResearchPlanFreshness;
  facets: CoverageFacet[];
  queries: string[];
  queryFacets: Record<string, string>;
  plannedQueries: PlannedQuery[];
  sourceRequirements: ResearchPlanSourceRequirements;
  reading: ResearchPlanReading;
  answerContract: ResearchPlanAnswerContract;
  diagnostics: {
    llmPlannerStarted: boolean;
    llmPlannerSucceeded: boolean;
    llmPlannerFailedReason?: string;
    ruleFallbackUsed: boolean;
    plannerIntent?: ResearchPlanIntent;
    coveragePlanIntent: ResearchPlanIntent;
    coverageFacets: string[];
    facetQueries: Record<string, string[]>;
    generatedQueryCount: number;
    targetReadCount: number;
    maxReadAttempts: number;
    readerConcurrency: number;
    currentDate?: string;
    freshnessWindowDays?: number;
    queryFreshnessHints?: string[];
    plannerSanitizationNotes: string[];
  };
};

export const RESEARCH_PLAN_INTENTS = [
  "entity_news",
  "broad_news_digest",
  "broad_topic_news",
  "technical_docs",
  "official_reference",
  "general_web",
  "oi_problem",
] as const satisfies readonly ResearchPlanIntent[];

export const toPlannedQueryPurpose = (intent: ResearchPlanIntent): QueryPurpose => {
  if (intent === "technical_docs" || intent === "official_reference") return "docs";
  if (intent === "entity_news" || intent === "broad_news_digest" || intent === "broad_topic_news") return "news";
  if (intent === "oi_problem") return "exact_problem";
  return "recall";
};

export const languageForQuery = (query: string): ResearchLanguage => {
  const hasCjk = /[\u3400-\u9fff\uf900-\ufaff]/.test(query);
  const hasLatin = /[a-z]/i.test(query);
  if (hasCjk && hasLatin) return "mixed";
  if (hasCjk) return "zh";
  return "en";
};

export const expectedSourceTypesForIntent = (intent: ResearchPlanIntent): ExpectedSourceType[] => {
  if (intent === "technical_docs") return ["documentation", "official", "technical_blog"];
  if (intent === "official_reference") return ["official", "documentation"];
  if (intent === "oi_problem") return ["problem_statement", "community_solution", "forum"];
  if (intent === "entity_news" || intent === "broad_news_digest" || intent === "broad_topic_news") {
    return ["mainstream_news", "official", "technical_blog"];
  }
  return ["official", "mainstream_news", "technical_blog"];
};
