import { chatWithCurrentNote, type NoteChatContextPayload } from "@/lib/api";
import type {
  LlmResearchPlan,
  LlmResearchPlannerDiagnostics,
  LlmResearchPlannerInput,
  LlmResearchPlannerResult,
  ResearchPlanAnswerContract,
  ResearchPlanFacet,
  ResearchPlanFreshness,
  ResearchPlanIntent,
  ResearchPlanReading,
  ResearchPlanSourceRequirements,
} from "./researchPlanTypes";
import { RESEARCH_PLAN_INTENTS } from "./researchPlanTypes";

const MAX_QUERY_COUNT = 18;
const MAX_FACET_COUNT = 6;
const MAX_QUERIES_PER_FACET = 5;
const MAX_READ_COUNT = 36;
const MAX_CONCURRENCY = 6;
const MIN_TIMEOUT_MS = 4_000;
const MAX_TIMEOUT_MS = 12_000;
const MIN_GLOBAL_BUDGET_MS = 15_000;
const MAX_GLOBAL_BUDGET_MS = 75_000;

const dangerousQueryPattern = /(?:authorization:|cookie:|bearer\s+[a-z0-9._~+/=-]+|api[_-]?key=|access_token=|file:\/\/|localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.)/i;

const emptyContext = (): NoteChatContextPayload => ({
  noteTitle: "",
  notePath: "",
  tags: [],
  summary: "",
  selectedText: "",
  markdown: "",
  markdownTruncated: false,
});

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
};

const compact = (value: unknown, maxChars: number): string => {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxChars);
};

const redactPlannerPromptText = (value: string, maxChars: number): string =>
  value
    .replace(/Authorization:\s*[^\s;]+/gi, "Authorization:[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/Cookie:\s*[^;]+/gi, "Cookie:[redacted]")
    .replace(/([?&](?:api[_-]?key|token|access_token|authorization)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/\b(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2})\b/gi, "[private-host-redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);

const uniqueStrings = (values: unknown[], maxCount: number, notes: string[], label: string): string[] => {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = compact(value, 160);
    if (!normalized) continue;
    if (dangerousQueryPattern.test(normalized)) {
      notes.push(`${label}_dangerous_value_removed`);
      continue;
    }
    const key = normalized.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
    if (output.length >= maxCount) break;
  }
  return output;
};

const clampNumber = (value: unknown, fallback: number, min: number, max: number, notes: string[], label: string): number => {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const clamped = Math.max(min, Math.min(Math.round(numeric), max));
  if (clamped !== numeric) notes.push(`${label}_clamped_to_${clamped}`);
  return clamped;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

const parsePlannerJson = (raw: string): unknown => {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("empty_planner_response");
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (fenced) return JSON.parse(fenced);
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("planner_response_not_json");
  }
};

const normalizeIntent = (value: unknown, fallback: ResearchPlanIntent, notes: string[]): ResearchPlanIntent => {
  const intent = compact(value, 80) as ResearchPlanIntent;
  if ((RESEARCH_PLAN_INTENTS as readonly string[]).includes(intent)) return intent;
  notes.push("invalid_intent_replaced");
  return fallback;
};

const normalizeFreshness = (value: unknown, fallback: ResearchPlanFreshness): ResearchPlanFreshness => {
  if (value === "recent" || value === "current" || value === "stable") return value;
  return fallback;
};

const normalizeRequirements = (
  value: unknown,
  notes: string[],
): ResearchPlanSourceRequirements => {
  const item = asRecord(value) ?? {};
  return {
    targetReadCount: clampNumber(item.targetReadCount, 30, 1, MAX_READ_COUNT, notes, "targetReadCount"),
    minDistinctHosts: clampNumber(item.minDistinctHosts, 3, 1, 12, notes, "minDistinctHosts"),
    targetDistinctHosts: clampNumber(item.targetDistinctHosts, 8, 1, 16, notes, "targetDistinctHosts"),
    minUsableBodyEvidence: clampNumber(item.minUsableBodyEvidence, 3, 1, 10, notes, "minUsableBodyEvidence"),
    minCoveredFacets: clampNumber(item.minCoveredFacets, 2, 1, MAX_FACET_COUNT, notes, "minCoveredFacets"),
  };
};

const normalizeReading = (value: unknown, notes: string[]): ResearchPlanReading => {
  const item = asRecord(value) ?? {};
  return {
    maxReadAttempts: clampNumber(item.maxReadAttempts, 30, 1, MAX_READ_COUNT, notes, "maxReadAttempts"),
    concurrency: clampNumber(item.concurrency, 5, 1, MAX_CONCURRENCY, notes, "concurrency"),
    perUrlTimeoutMs: clampNumber(item.perUrlTimeoutMs, 9_000, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS, notes, "perUrlTimeoutMs"),
    globalBudgetMs: clampNumber(item.globalBudgetMs, 60_000, MIN_GLOBAL_BUDGET_MS, MAX_GLOBAL_BUDGET_MS, notes, "globalBudgetMs"),
  };
};

const normalizeAnswerContract = (value: unknown): ResearchPlanAnswerContract => {
  const item = asRecord(value) ?? {};
  return {
    allowCautiousAnswer: item.allowCautiousAnswer !== false,
    mustDiscloseLimitations: item.mustDiscloseLimitations !== false,
  };
};

export const sanitizeLlmResearchPlan = (
  rawPlan: unknown,
  fallbackIntent: ResearchPlanIntent,
): { plan: LlmResearchPlan; notes: string[] } => {
  const notes: string[] = [];
  const item = asRecord(rawPlan);
  if (!item) throw new Error("planner_json_not_object");
  const intent = normalizeIntent(item.intent, fallbackIntent, notes);
  const topic = compact(item.topic, 140) || "current topic";
  const freshness = normalizeFreshness(item.freshness, intent.includes("news") ? "current" : "stable");
  const entities = uniqueStrings(Array.isArray(item.entities) ? item.entities : [], 8, notes, "entity");
  const rawFacets = Array.isArray(item.facets) ? item.facets : [];
  const facets: ResearchPlanFacet[] = rawFacets.slice(0, MAX_FACET_COUNT).map((facet, index) => {
    const record = asRecord(facet) ?? {};
    const id = compact(record.id, 48).replace(/[^a-z0-9_-]/gi, "_").toLocaleLowerCase() || `facet_${index + 1}`;
    return {
      id,
      label: compact(record.label, 80) || id,
      reason: compact(record.reason, 180) || "planner_facet",
      queries: uniqueStrings(Array.isArray(record.queries) ? record.queries : [], MAX_QUERIES_PER_FACET, notes, `facet_${id}_query`),
      preferredSourceTypes: uniqueStrings(Array.isArray(record.preferredSourceTypes) ? record.preferredSourceTypes : [], 6, notes, `facet_${id}_source`),
    };
  }).filter((facet) => facet.queries.length > 0 || facet.label);
  if (rawFacets.length > MAX_FACET_COUNT) notes.push(`facets_clamped_to_${MAX_FACET_COUNT}`);
  const queries = uniqueStrings(Array.isArray(item.queries) ? item.queries : [], MAX_QUERY_COUNT, notes, "query");
  return {
    plan: {
      intent,
      topic,
      entities,
      freshness,
      facets,
      queries,
      sourceRequirements: normalizeRequirements(item.sourceRequirements, notes),
      reading: normalizeReading(item.reading, notes),
      answerContract: normalizeAnswerContract(item.answerContract),
    },
    notes,
  };
};

const fallbackIntentFromRule = (input: LlmResearchPlannerInput): ResearchPlanIntent => {
  if (input.searchMode === "docs_technical") return "technical_docs";
  if (input.searchMode === "oi_algorithm") return "oi_problem";
  if (input.searchMode === "news_recent" || input.freshness === "news" || input.freshness === "latest" || input.freshness === "recent") {
    return /world news|international news|global news|\u56fd\u9645|\u4e16\u754c|\u5168\u7403/i.test(input.userQuery)
      ? "broad_news_digest"
      : "broad_topic_news";
  }
  return "general_web";
};

const buildPlannerPrompt = (input: LlmResearchPlannerInput): string => [
  "You are a research planner. Output JSON only. Do not answer the user question.",
  "Plan public web search for a no-key Research Engine. The engine will validate, trim, search, read URLs, and gate evidence.",
  "Do not include secrets, API keys, cookies, Authorization headers, private URLs, localhost, paywall bypass, CAPTCHA bypass, or login-only sources.",
  "Evidence must come from readable page body excerpts, not titles, URLs, or snippets.",
  "For recent/latest/current news, use the current date below and plan queries that prioritize newly published sources. Do not treat old news as latest news.",
  "For latest-news plans, include date-aware query variants such as the current month/year, today, or this week when appropriate.",
  "The planner only plans search coverage; it must not decide final facts or answer the question.",
  "Return exactly this JSON shape:",
  '{"intent":"entity_news|broad_news_digest|broad_topic_news|technical_docs|official_reference|general_web|oi_problem","topic":"string","entities":["string"],"freshness":"recent|current|stable","facets":[{"id":"string","label":"string","reason":"string","queries":["string"],"preferredSourceTypes":["string"]}],"queries":["string"],"sourceRequirements":{"targetReadCount":30,"minDistinctHosts":3,"targetDistinctHosts":8,"minUsableBodyEvidence":3,"minCoveredFacets":2},"reading":{"maxReadAttempts":30,"concurrency":5,"perUrlTimeoutMs":9000,"globalBudgetMs":60000},"answerContract":{"allowCautiousAnswer":true,"mustDiscloseLimitations":true}}',
  "",
  `User question: ${redactPlannerPromptText(input.userQuery, 500)}`,
  `Locale: ${redactPlannerPromptText(input.locale, 80)}`,
  `Rule search mode: ${redactPlannerPromptText(input.searchMode ?? "unknown", 80)}`,
  `Rule intent: ${redactPlannerPromptText(input.ruleIntent ?? "unknown", 80)}`,
  `Freshness: ${redactPlannerPromptText(input.freshness ?? "unknown", 80)}`,
  `Current date: ${redactPlannerPromptText(input.currentDateText ?? input.currentDate ?? "unknown", 120)}`,
  `Existing rule queries: ${input.rulePlannedQueries.map((item) => redactPlannerPromptText(item.query, 160)).filter(Boolean).join(" | ") || "none"}`,
  `Public search constraints: ${input.publicSearchConstraints.map((item) => redactPlannerPromptText(item, 120)).filter(Boolean).join(" | ")}`,
  `No-key provider constraints: ${input.noKeyProviderConstraints.map((item) => redactPlannerPromptText(item, 120)).filter(Boolean).join(" | ")}`,
].join("\n");

export const runLlmResearchPlanner = async (
  input: LlmResearchPlannerInput,
): Promise<LlmResearchPlannerResult> => {
  const diagnostics: LlmResearchPlannerDiagnostics = {
    llmPlannerStarted: true,
    llmPlannerSucceeded: false,
    plannerSanitizationNotes: [],
  };
  try {
    const response = await withTimeout(
      chatWithCurrentNote(buildPlannerPrompt(input), emptyContext(), input.providerId, input.modelId),
      input.timeoutMs ?? 8_000,
      "llm_research_planner_timeout",
    );
    const content = response.answer ?? "";
    diagnostics.llmPlannerRawLength = content.length;
    const parsed = parsePlannerJson(content);
    const sanitized = sanitizeLlmResearchPlan(parsed, fallbackIntentFromRule(input));
    diagnostics.llmPlannerSucceeded = true;
    diagnostics.plannerSanitizationNotes = sanitized.notes;
    return { plan: sanitized.plan, diagnostics };
  } catch (error) {
    diagnostics.llmPlannerFailedReason = error instanceof Error ? error.message : String(error);
    return { diagnostics };
  }
};
