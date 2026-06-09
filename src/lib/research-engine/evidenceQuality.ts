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
  | "weak_candidate";

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

const sourceReliabilityHint = (sourceType: EvidenceQualityAssessmentInput["sourceType"]): number => {
  if (sourceType === "official" || sourceType === "documentation") return 18;
  if (sourceType === "mainstream_news") return 16;
  if (sourceType === "technical_blog") return 12;
  if (sourceType === "community_solution" || sourceType === "forum") return 6;
  if (sourceType === "seo_aggregator") return 2;
  return 8;
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

  if (sourceRole === "index_page") {
    score = Math.min(score, 35);
    downgraded.push("index_or_listing_page_not_concrete_news");
  }
  if (sourceRole === "analysis_report") {
    score = Math.min(score + 4, 72);
    downgraded.push("analysis_or_report_not_equal_to_latest_news_event");
  }
  if (sourceRole === "background_context") {
    score = Math.min(score, 52);
    downgraded.push("background_or_marketing_context_not_core_news");
  }
  if (sourceRole === "weak_candidate") score = Math.min(score, 20);
  if (newsIntent && dateSignalResult.freshnessStatus === "stale") score = Math.min(score, 42);
  if (newsIntent && dateSignalResult.freshnessStatus === "unknown") score = Math.min(score, 45);
  if (newsIntent && dateSignalResult.freshnessStatus === "future_date_suspicious") score = Math.min(score, 25);
  if (!hasBodyExcerpt) score = 0;

  let tier: EvidenceQualityTier;
  if (!hasBodyExcerpt) tier = "low";
  else if (sourceRole === "index_page" || sourceRole === "background_context") tier = "background";
  else if (newsIntent && dateSignalResult.freshnessStatus !== "fresh") tier = "background";
  else if (newsIntent && !hasConcreteEvent && sourceRole !== "analysis_report") tier = "background";
  else if (score >= 78) tier = "high";
  else if (score >= 52) tier = "medium";
  else if (sourceRole === "analysis_report") tier = "background";
  else tier = "low";

  return {
    evidenceId: input.evidenceId,
    url: input.url,
    host: canonicalizePortfolioHost(input.host),
    facet: input.facet ?? "primary",
    facetLabel: facetLabelFor(input.facets, input.facet ?? "primary"),
    evidenceQualityScore: clamp(Math.round(score), 0, 100),
    evidenceQualityTier: tier,
    sourceRole,
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
