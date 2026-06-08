import { searchWebSources } from "@/lib/api";
import type { AiSearchFreshness, SearchVertical, WebSearchResult } from "@/lib/aiWebSearch";
import type { DiscoveryRawResult, PlannedQuery, QueryPurpose, SourceType } from "./types";

type NewsQueryMode = "entity_news" | "broad_news_digest";

export type KeylessBingProviderStatus =
  | "available"
  | "partial"
  | "tauri_bridge_unavailable"
  | "blocked_or_captcha"
  | "rate_limited"
  | "timeout"
  | "network_error"
  | "parse_failed"
  | "empty_result"
  | "invalid_response"
  | "unsupported_environment"
  | "unknown_error";

export type KeylessBingProviderOptions = {
  query: string;
  rawUserQuery?: string;
  queryPurpose?: QueryPurpose;
  queryLanguage?: "zh" | "en" | "mixed";
  plannedQueries?: PlannedQuery[];
  maxResults?: number;
  timeoutMs?: number;
};

export type KeylessBingProviderResult = {
  ok: boolean;
  providerName: "bing";
  status: KeylessBingProviderStatus;
  rawResults: DiscoveryRawResult[];
  warnings: string[];
  errors: string[];
  elapsedMs: number;
  diagnostics: {
    provider: "keyless_bing";
    providerStatus: KeylessBingProviderStatus;
    apiKeyRequired: false;
    mode: "public_search";
    credentialPolicy: "none";
    credentials: "omit";
    authorizationUsed: false;
    legacyTauriBridgeUsed: true;
    legacyBridgeName: "search_web_sources";
    browserFetchUsed: false;
    cookiesUsed: false;
    query: string;
    bridgeQueries: string[];
    plannedQueryCount: number;
    newsQueryUsed: boolean;
    newsStageUsed: boolean;
    newsQueryMode: NewsQueryMode;
    broadNewsRelaxedEntityFilter: boolean;
    candidateHostDistribution: Record<string, number>;
    diversityHostCount: number;
    hostDiversityApplied: boolean;
    rejectedByEntityFilterCount: number;
    rejectedByReadabilityCount: number;
    rejectedByFreshnessCount: number;
    rawHostDistribution: Record<string, number>;
    normalizedHostDistribution: Record<string, number>;
    distinctHostCount: number;
    targetDistinctHosts: number;
    hostDiversityShortfall: number;
    queryCount: number;
    providerGlobalTimeoutMs: number;
    perQueryTimeoutMs: number;
    completedQueryCount: number;
    failedQueryCount: number;
    timedOutQueryCount: number;
    partialResultsUsed: boolean;
    timedOutQueries: string[];
    failedQueries: string[];
    earlyStop: boolean;
    earlyStopReason?: string;
    distinctHostCountAtStop: number;
    candidateCountAtStop: number;
    perQueryElapsedMs: Record<string, number>;
    perQueryResultCount: Record<string, number>;
    perQueryHostPreview: Record<string, string[]>;
    queryPurpose: QueryPurpose;
    rawBridgeResultCount: number;
    normalizedResultCount: number;
    droppedResultCount: number;
    qualityPreview: Array<{
      title?: string;
      url?: string;
      stage?: string;
      newsCandidateScore: number;
      readabilityPrior: number;
      freshnessSignal: number;
      rankingPenalty: number;
      whySelected: string[];
      whyRejected?: string;
      host?: string;
    }>;
    resultCount: number;
    stageDiagnosticsPreview: string[];
    diagnosticsPreview?: string;
    firstResultPreview?: {
      title?: string;
      url?: string;
      searchStage?: string;
      discoveryMethod?: string;
      sourceKind?: string;
    };
    bridgeDiagnostics?: {
      parserUsed?: string;
      matchedSelectors?: string[];
      parseFailureHint?: string;
      bodyKind?: string;
      titlePreview?: string;
      rawAnchorCount?: number;
      rawHrefCount?: number;
      decodedUrlCandidateCount?: number;
      externalCandidateCount?: number;
      keptCandidateCount?: number;
      rejectedCandidateCount?: number;
      filterReasonPreview?: string;
      blockedHint?: string;
      stagePreview?: string;
    };
    errorKind?: KeylessBingProviderStatus;
  };
};

const MAX_DIAGNOSTICS_PREVIEW_CHARS = 1_200;
const MAX_STAGE_DIAGNOSTICS = 6;
const MAX_STAGE_DIAGNOSTICS_PREVIEW_CHARS = 480;
const MAX_ERROR_PREVIEW_CHARS = 900;
const RAW_HTML_REDACTED_PREVIEW = "[redacted raw html preview]";
const MAX_ENTITY_NEWS_BRIDGE_QUERIES = 4;
const MAX_BROAD_NEWS_BRIDGE_QUERIES = 6;
const MAX_QUALITY_PREVIEW = 8;
const DEFAULT_PROVIDER_TIMEOUT_MS = 8_000;
const ENTITY_NEWS_PROVIDER_TIMEOUT_MS = 20_000;
const BROAD_NEWS_PROVIDER_TIMEOUT_MS = 26_000;
const NEWS_PER_QUERY_TIMEOUT_MS = 7_000;

type KeylessBingQueryExecutionResult = {
  sources: WebSearchResult[];
  warnings: string[];
  errors: string[];
  providerGlobalTimeoutMs: number;
  perQueryTimeoutMs: number;
  completedQueryCount: number;
  failedQueryCount: number;
  timedOutQueryCount: number;
  partialResultsUsed: boolean;
  timedOutQueries: string[];
  failedQueries: string[];
  earlyStop: boolean;
  earlyStopReason?: string;
  distinctHostCountAtStop: number;
  candidateCountAtStop: number;
  perQueryElapsedMs: Record<string, number>;
  perQueryResultCount: Record<string, number>;
  perQueryHostPreview: Record<string, string[]>;
};

const elapsedMsSince = (startedAt: number): number => Math.max(0, Math.round(performance.now() - startedAt));

const compact = (value: string | undefined, maxChars: number): string | undefined => {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}...` : normalized;
};

const unique = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));

const normalizeQuery = (value: string): string => value.replace(/\s+/g, " ").trim();

const queryContainsNewsSignal = (value: string): boolean =>
  /\b(news|latest|recent|today|announcement|announcements|update|updates|press|release|launch)\b/i.test(value) ||
  /新闻|最新|近期|最近|消息|发布|公告|今天|本周|本月/.test(value);

const queryContainsReadableNewsSignal = (value: string): boolean =>
  queryContainsNewsSignal(value) ||
  /\u65b0\u95fb|\u6700\u65b0|\u8fd1\u671f|\u6700\u8fd1|\u6d88\u606f|\u53d1\u5e03|\u516c\u544a|\u4eca\u5929|\u672c\u5468|\u672c\u6708/.test(value);

const broadNewsDigestSignal = (value: string): boolean =>
  /\b(world news|international news|global news|major world events|world events|what happened in the world)\b/i.test(value) ||
  /\u56fd\u9645(?:\u5927\u4e8b|\u65b0\u95fb|\u8981\u95fb)|\u4e16\u754c(?:\u5927\u4e8b|\u65b0\u95fb|\u8981\u95fb)|\u5168\u7403\u8981\u95fb|\u56fd\u9645\u70ed\u70b9|\u4e16\u754c.*\u53d1\u751f/.test(value);

const entityNewsSignal = (value: string): boolean =>
  /\b(OpenAI|ChatGPT|Anthropic|Claude|Google|Microsoft|Meta|Apple|Nvidia|Tesla|DeepSeek|Gemini|Sam Altman)\b/i.test(value);

const detectNewsQueryMode = (options: KeylessBingProviderOptions): NewsQueryMode => {
  const haystack = [
    options.rawUserQuery,
    options.query,
    ...(options.plannedQueries ?? []).map((item) => item.query),
  ].filter(Boolean).join(" ");
  if (broadNewsDigestSignal(haystack) && !entityNewsSignal(haystack)) return "broad_news_digest";
  return "entity_news";
};

const broadNewsBridgeQueries = (options: KeylessBingProviderOptions): string[] => {
  const haystack = `${options.rawUserQuery ?? ""} ${options.query}`;
  const zhFirst = /[\u3400-\u9fff]/.test(haystack);
  const zhQueries = [
    "\u56fd\u9645\u65b0\u95fb \u6700\u65b0",
    "\u4eca\u65e5\u56fd\u9645\u65b0\u95fb",
    "\u5168\u7403\u8981\u95fb",
  ];
  const enQueries = [
    "world news today",
    "latest world news",
    "international news today",
  ];
  return zhFirst ? [...zhQueries, ...enQueries] : [...enQueries, ...zhQueries];
};

const chooseBridgeQueries = (
  options: KeylessBingProviderOptions,
  queryPurpose: QueryPurpose,
  newsQueryMode: NewsQueryMode,
): string[] => {
  if (newsQueryMode === "broad_news_digest") {
    return unique(broadNewsBridgeQueries(options).map(normalizeQuery)).slice(0, MAX_BROAD_NEWS_BRIDGE_QUERIES);
  }
  const plannedQueries = options.plannedQueries ?? [];
  const newsQueries = plannedQueries
    .filter((item) => item.purpose === "news" || item.expectedSourceTypes.includes("mainstream_news") || queryContainsReadableNewsSignal(item.query))
    .sort((left, right) => right.priority - left.priority)
    .map((item) => item.query);
  const officialNewsQueries = plannedQueries
    .filter((item) => item.purpose === "official" && item.expectedSourceTypes.includes("official") && queryContainsReadableNewsSignal(item.query))
    .sort((left, right) => right.priority - left.priority)
    .map((item) => item.query);
  const allPlannedQueries = plannedQueries
    .sort((left, right) => right.priority - left.priority)
    .map((item) => item.query);
  const preferred = queryPurpose === "news"
    ? [...newsQueries, ...officialNewsQueries, ...allPlannedQueries, options.query]
    : [options.query, ...allPlannedQueries];
  return unique(preferred.map(normalizeQuery)).slice(0, MAX_ENTITY_NEWS_BRIDGE_QUERIES);
};

const diagnosticValue = (value: string | undefined, key: string): string | undefined => {
  if (!value) return undefined;
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = value.match(new RegExp(`(?:^|[;:\\s])${escapedKey}=([\\s\\S]*?)(?=(?:[;:]\\s*\\w+=)|$)`, "i"));
  return compact(match?.[1], 240);
};

const diagnosticNumber = (value: string | undefined, key: string): number | undefined => {
  const raw = diagnosticValue(value, key);
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const diagnosticList = (value: string | undefined, key: string): string[] | undefined => {
  const raw = diagnosticValue(value, key);
  if (!raw || raw === "none") return undefined;
  const items = raw
    .split(/[|,]/)
    .map((item) => compact(item, 80))
    .filter((item): item is string => Boolean(item));
  return items.length > 0 ? items.slice(0, 8) : undefined;
};

const bridgeDiagnosticsFromText = (
  value: string | undefined,
): KeylessBingProviderResult["diagnostics"]["bridgeDiagnostics"] | undefined => {
  const preview = redactSensitivePreview(value, MAX_STAGE_DIAGNOSTICS_PREVIEW_CHARS);
  if (!preview) return undefined;
  const parseFailureHint = diagnosticValue(preview, "hint");
  const bodyKind = diagnosticValue(preview, "kind");
  const blockedHint = [parseFailureHint, bodyKind]
    .filter((item): item is string => Boolean(item))
    .find((item) => /captcha|block|verify/i.test(item));
  const diagnostics = {
    parserUsed: diagnosticValue(preview, "parser"),
    matchedSelectors: diagnosticList(preview, "selectors"),
    parseFailureHint,
    bodyKind,
    titlePreview: diagnosticValue(preview, "title"),
    rawAnchorCount: diagnosticNumber(preview, "rawAnchors"),
    rawHrefCount: diagnosticNumber(preview, "rawHrefs"),
    decodedUrlCandidateCount: diagnosticNumber(preview, "decodedUrls"),
    externalCandidateCount: diagnosticNumber(preview, "external"),
    keptCandidateCount: diagnosticNumber(preview, "kept"),
    rejectedCandidateCount: diagnosticNumber(preview, "rejected"),
    filterReasonPreview: diagnosticValue(preview, "filterReasons"),
    blockedHint,
    stagePreview: preview,
  };
  return Object.values(diagnostics).some((item) => Array.isArray(item) ? item.length > 0 : item !== undefined)
    ? diagnostics
    : undefined;
};

const bridgeDiagnosticsFromSources = (
  sources: WebSearchResult[],
): KeylessBingProviderResult["diagnostics"]["bridgeDiagnostics"] | undefined =>
  bridgeDiagnosticsFromText(sources.find((source) => source.searchDiagnostics)?.searchDiagnostics);

const redactSensitivePreview = (value: string | undefined, maxChars: number): string | undefined => {
  const compacted = compact(value, maxChars);
  if (!compacted) return undefined;
  const lower = compacted.toLocaleLowerCase();
  if (
    lower.includes("<!doctype html") ||
    lower.includes("<html") ||
    lower.includes("<body") ||
    lower.includes("id=\"b_content\"") ||
    lower.includes("class=\"b_algo\"")
  ) {
    return RAW_HTML_REDACTED_PREVIEW;
  }
  return compacted
    .replace(/Authorization:\s*[^\s;]+/gi, "Authorization:[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/Cookie:\s*[^;]+/gi, "Cookie:[redacted]")
    .replace(/([?&](?:api[_-]?key|token|access_token|authorization)=)[^&\s]+/gi, "$1[redacted]");
};

const verticalForPurpose = (purpose: QueryPurpose): SearchVertical | undefined => {
  if (purpose === "news") return "news";
  if (purpose === "docs") return "docs";
  if (purpose === "exact_problem") return "oi";
  return "general_web";
};

const freshnessForPurpose = (purpose: QueryPurpose): AiSearchFreshness | undefined =>
  purpose === "news" ? "news" : undefined;

const verticalForProviderRequest = (purpose: QueryPurpose, newsQueryMode: NewsQueryMode): SearchVertical | undefined =>
  newsQueryMode === "broad_news_digest" ? "news" : verticalForPurpose(purpose);

const freshnessForProviderRequest = (purpose: QueryPurpose, newsQueryMode: NewsQueryMode): AiSearchFreshness | undefined =>
  newsQueryMode === "broad_news_digest" ? "news" : freshnessForPurpose(purpose);

const sourceTypeHintFor = (source: WebSearchResult): SourceType => {
  if (source.sourceType === "official" || source.sourceKind === "official_news" || source.sourceKind === "official_blog") return "official";
  if (source.sourceKind === "docs_page") return "docs";
  if (source.sourceKind === "media_article" || source.newsLike === true || source.pageType === "news_article") return "mainstream_news";
  if (source.sourceType === "blog") return "tech_media";
  if (source.sourceType === "discussion") return "forum";
  return "unknown";
};

type KeylessSourceQuality = {
  newsCandidateScore: number;
  readabilityPrior: number;
  freshnessSignal: number;
  rankingPenalty: number;
  stage?: string;
  whySelected: string[];
  whyRejected?: string;
};

const parseSourceUrl = (source: WebSearchResult): URL | undefined => {
  const url = source.finalUrl?.trim() || source.resolvedUrl?.trim() || source.url?.trim();
  if (!url) return undefined;
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
};

const isNewsStage = (stage: string | undefined): boolean => stage?.startsWith("news") === true;

const hostFromSource = (source: WebSearchResult): string | undefined =>
  parseSourceUrl(source)?.hostname.toLocaleLowerCase().replace(/^www\./, "");

const isReadableNewsPath = (parsed: URL | undefined): boolean => {
  if (!parsed) return false;
  const path = parsed.pathname.toLocaleLowerCase();
  return /\/(?:news|blog|stories|updates|announcements?|press|release|releases)(?:\/|$)/i.test(path) ||
    /\/(?:20\d{2}|index\/20\d{2})\//i.test(path);
};

const isGenericCompanyPage = (source: WebSearchResult, parsed: URL | undefined): boolean => {
  if (!parsed) return false;
  const host = parsed.hostname.toLocaleLowerCase().replace(/^www\./, "");
  const path = parsed.pathname.toLocaleLowerCase();
  const text = `${source.title ?? ""} ${source.snippet ?? ""} ${path}`;
  if (host !== "openai.com" && host !== "anthropic.com") return false;
  if (isReadableNewsPath(parsed)) return false;
  return path === "/" ||
    path === "/index" ||
    /\/(?:index\/)?(?:public-policy|public-policy-agenda|travelers|customer|customers|careers|about|company|policies|safety|research)(?:\/|$)/i.test(path) ||
    /public policy agenda|travelers|customer story|careers|about openai/i.test(text);
};

const hasFreshnessSignal = (source: WebSearchResult): boolean =>
  Boolean(source.sourcePublishedAt?.trim() || source.dateHint?.trim()) ||
  /\b20\d{2}\b|Jan\.?|Feb\.?|Mar\.?|Apr\.?|May|Jun\.?|Jul\.?|Aug\.?|Sep\.?|Oct\.?|Nov\.?|Dec\.?/i.test(`${source.title ?? ""} ${source.snippet ?? ""}`);

const sourceQualityFor = (
  source: WebSearchResult,
  queryPurpose: QueryPurpose,
  newsQueryMode: NewsQueryMode,
): KeylessSourceQuality => {
  const newsLikeMode = queryPurpose === "news" || newsQueryMode === "broad_news_digest";
  const parsed = parseSourceUrl(source);
  const stage = source.searchStage;
  const text = `${source.title ?? ""} ${source.snippet ?? ""} ${parsed?.pathname ?? ""}`;
  const whySelected: string[] = [];
  let newsCandidateScore = 0;
  let readabilityPrior = 0;
  let freshnessSignal = 0;
  let rankingPenalty = 0;

  if (isNewsStage(stage)) {
    newsCandidateScore += 34;
    whySelected.push(`stage:${stage}`);
  }
  if (source.newsLike === true || source.pageType === "news_article") {
    newsCandidateScore += 24;
    whySelected.push("news_like");
  }
  if (source.sourceKind === "media_article") {
    newsCandidateScore += 20;
    readabilityPrior += 8;
    whySelected.push("media_article");
  }
  if (source.sourceKind === "official_news" || source.sourceKind === "official_blog") {
    newsCandidateScore += 22;
    readabilityPrior += 10;
    whySelected.push(String(source.sourceKind));
  }
  if (isReadableNewsPath(parsed)) {
    newsCandidateScore += 18;
    readabilityPrior += 12;
    whySelected.push("readable_news_path");
  }
  if (hasFreshnessSignal(source)) {
    freshnessSignal += 18;
    whySelected.push("freshness_signal");
  }
  if (/\b(news|latest|recent|announces?|launch|update|release|report|says)\b/i.test(text) || /新闻|最新|发布|宣布|消息|报告|更新/.test(text)) {
    newsCandidateScore += 12;
    whySelected.push("news_terms");
  }
  if (source.contentStatus === "fetched" || source.excerptStatus === "fetched" || source.usableEvidence === true) {
    readabilityPrior += 10;
    whySelected.push("previously_readable");
  }

  const genericCompanyPage = isGenericCompanyPage(source, parsed);
  if (genericCompanyPage && newsLikeMode) rankingPenalty += 80;
  if (newsLikeMode && !isNewsStage(stage) && source.newsLike !== true && !isReadableNewsPath(parsed) && !hasFreshnessSignal(source)) {
    rankingPenalty += 34;
  }
  const entityFilterRejected = /wrong_focus_entity|entity/i.test(source.filteredReason ?? source.rejectedReason ?? "");
  if (source.filteredReason && !(newsQueryMode === "broad_news_digest" && entityFilterRejected)) rankingPenalty += 24;
  if (source.rejectedReason) rankingPenalty += 32;

  return {
    newsCandidateScore,
    readabilityPrior,
    freshnessSignal,
    rankingPenalty,
    stage,
    whySelected: whySelected.length > 0 ? whySelected : ["no_news_or_readability_signal"],
    whyRejected: newsQueryMode === "broad_news_digest" && entityFilterRejected
      ? undefined
      : genericCompanyPage
      ? "generic_company_page_for_news_query"
      : source.filteredReason ?? source.rejectedReason,
  };
};

const sourceTypeHintForPurpose = (
  source: WebSearchResult,
  queryPurpose: QueryPurpose,
  quality: KeylessSourceQuality,
  newsQueryMode: NewsQueryMode,
): SourceType => {
  if (queryPurpose !== "news" && newsQueryMode !== "broad_news_digest") return sourceTypeHintFor(source);
  if (quality.whyRejected === "generic_company_page_for_news_query") return "unknown";
  if (source.sourceKind === "official_news" || source.sourceKind === "official_blog") return "official";
  if (source.sourceKind === "media_article" || source.newsLike === true || source.pageType === "news_article" || isNewsStage(source.searchStage)) {
    return source.sourceType === "official" ? "official" : "mainstream_news";
  }
  return sourceTypeHintFor(source);
};

const rankSourcesForPurpose = (
  sources: WebSearchResult[],
  queryPurpose: QueryPurpose,
  newsQueryMode: NewsQueryMode,
): Array<{ source: WebSearchResult; originalIndex: number; quality: KeylessSourceQuality; score: number }> =>
  sources
    .map((source, originalIndex) => {
      const quality = sourceQualityFor(source, queryPurpose, newsQueryMode);
      const score = queryPurpose === "news" || newsQueryMode === "broad_news_digest"
        ? quality.newsCandidateScore + quality.readabilityPrior + quality.freshnessSignal - quality.rankingPenalty - originalIndex * 0.01
        : -originalIndex;
      return { source, originalIndex, quality, score };
    })
    .sort((left, right) => right.score - left.score || left.originalIndex - right.originalIndex);

const qualityPreviewFor = (
  rankedSources: Array<{ source: WebSearchResult; quality: KeylessSourceQuality }>,
): KeylessBingProviderResult["diagnostics"]["qualityPreview"] =>
  rankedSources.slice(0, MAX_QUALITY_PREVIEW).map(({ source, quality }) => ({
    title: compact(source.title, 120),
    url: compact(source.finalUrl ?? source.resolvedUrl ?? source.url, 220),
    host: hostFromSource(source),
    stage: quality.stage,
    newsCandidateScore: quality.newsCandidateScore,
    readabilityPrior: quality.readabilityPrior,
    freshnessSignal: quality.freshnessSignal,
    rankingPenalty: quality.rankingPenalty,
    whySelected: quality.whySelected,
    whyRejected: quality.whyRejected,
  }));

const distribution = (values: Array<string | undefined>): Record<string, number> =>
  values.filter((value): value is string => Boolean(value)).reduce((acc, value) => ({
    ...acc,
    [value]: (acc[value] ?? 0) + 1,
  }), {} as Record<string, number>);

const reasonCountFromPreview = (
  bridgeDiagnostics: KeylessBingProviderResult["diagnostics"]["bridgeDiagnostics"] | undefined,
  pattern: RegExp,
): number => {
  const preview = bridgeDiagnostics?.filterReasonPreview;
  if (!preview || !pattern.test(preview)) return 0;
  const matched = preview.match(new RegExp(`(?:${pattern.source})\\D*(\\d+)`, "i"));
  const parsed = matched?.[1] ? Number.parseInt(matched[1], 10) : undefined;
  if (Number.isFinite(parsed)) return parsed ?? 0;
  return bridgeDiagnostics?.rejectedCandidateCount ?? 0;
};

const qualityRejectionStats = (
  rankedSources: Array<{ quality: KeylessSourceQuality }>,
  bridgeDiagnostics: KeylessBingProviderResult["diagnostics"]["bridgeDiagnostics"] | undefined,
): Pick<KeylessBingProviderResult["diagnostics"], "rejectedByEntityFilterCount" | "rejectedByReadabilityCount" | "rejectedByFreshnessCount"> => {
  const entityFromQuality = rankedSources.filter((item) => /wrong_focus_entity|entity/i.test(item.quality.whyRejected ?? "")).length;
  const readabilityFromQuality = rankedSources.filter((item) => /generic_company_page|not_news_like|docs_or_homepage|wiki_or_reference|low_quality/i.test(item.quality.whyRejected ?? "")).length;
  const freshnessFromQuality = rankedSources.filter((item) => /stale|old|freshness/i.test(item.quality.whyRejected ?? "")).length;
  return {
    rejectedByEntityFilterCount: entityFromQuality + reasonCountFromPreview(bridgeDiagnostics, /wrong_focus_entity|entity/i),
    rejectedByReadabilityCount: readabilityFromQuality + reasonCountFromPreview(bridgeDiagnostics, /not_news_like|docs_or_homepage|wiki_or_reference|low_quality/i),
    rejectedByFreshnessCount: freshnessFromQuality + reasonCountFromPreview(bridgeDiagnostics, /stale|old|freshness/i),
  };
};

const errorStatusFromMessage = (message: string): KeylessBingProviderStatus => {
  const lower = message.toLocaleLowerCase();
  if (
    lower.includes("tauri_bridge_unavailable") ||
    lower.includes("__tauri__") ||
    lower.includes("invoke is not") ||
    lower.includes("invoke function") ||
    lower.includes("search_web_sources not found") ||
    lower.includes("command search_web_sources")
  ) return "tauri_bridge_unavailable";
  if (lower.includes("timeout") || message.includes("超时")) return "timeout";
  if (
    lower.includes("rate_limited") ||
    lower.includes("too many requests") ||
    lower.includes("rate limit") ||
    message.includes("429")
  ) return "rate_limited";
  if (
    lower.includes("blocked_or_captcha") ||
    lower.includes("captcha_or_block_page") ||
    lower.includes("captcha") ||
    lower.includes("verify you are a human") ||
    lower.includes("unusual traffic") ||
    lower.includes("automated queries") ||
    lower.includes("blocked") ||
    message.includes("验证页") ||
    message.includes("访问限制")
  ) return "blocked_or_captcha";
  if (
    lower.includes("network_error") ||
    lower.includes("dns_failed") ||
    lower.includes("tls_error") ||
    lower.includes("connect_error") ||
    lower.includes("failed to fetch") ||
    lower.includes("network") ||
    message.includes("网络")
  ) return "network_error";
  if (
    lower.includes("parse_failed") ||
    lower.includes("parser") ||
    lower.includes("rss_returned_html") ||
    lower.includes("no_html_candidates") ||
    lower.includes("no_candidates")
  ) return "parse_failed";
  if (
    lower.includes("no_results") ||
    lower.includes("empty_result") ||
    lower.includes("resultcount=0") ||
    lower.includes("result count=0") ||
    message.includes("没有返回") ||
    message.includes("没有找到")
  ) return "empty_result";
  if (
    lower.includes("invalid_response") ||
    lower.includes("malformed") ||
    lower.includes("invalid response") ||
    lower.includes("serde") ||
    lower.includes("json")
  ) return "invalid_response";
  if (
    lower.includes("unsupported") ||
    message.includes("不支持") ||
    message.includes("需要先启用公开网页搜索授权") ||
    message.includes("需要先在 AI 设置中启用联网搜索")
  ) return "unsupported_environment";
  return "unknown_error";
};

const sanitizeLegacyProviderHint = (message: string): string =>
  message
    .replace(
      /Bing public search is temporarily unavailable\.[^;]+settings\./,
      "Bing public search is temporarily unavailable in the keyless public provider path.",
    )
    .replace(/需要先配置 Bocha API Key，或切换到 Bing 公开搜索。/g, "可选 Bocha API provider 缺少 key；Research Engine 主线仍优先维护无 key 公共搜索 provider。")
    .replace(/需要先配置 Brave Search API Key，或切换到 Bing 公开搜索。/g, "可选 Brave Search API provider 缺少 key；Research Engine 主线仍优先维护无 key 公共搜索 provider。")
    .replace(/改用 Bocha \/ Brave/g, "稍后重试无 key 公共搜索")
    .replace(/Authorization:\s*[^\s;]+/gi, "Authorization:[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/Cookie:\s*[^;]+/gi, "Cookie:[redacted]");

const diagnosticsPreviewFromSources = (sources: WebSearchResult[]): string | undefined =>
  redactSensitivePreview(
    sources.find((source) => source.searchDiagnostics)?.searchDiagnostics,
    MAX_DIAGNOSTICS_PREVIEW_CHARS,
  );

const stageDiagnosticsPreviewFromSources = (sources: WebSearchResult[]): string[] =>
  unique(
    sources
      .map((source) => redactSensitivePreview(source.searchDiagnostics, MAX_STAGE_DIAGNOSTICS_PREVIEW_CHARS))
      .filter((value): value is string => Boolean(value)),
  ).slice(0, MAX_STAGE_DIAGNOSTICS);

const firstResultPreviewFromSources = (
  sources: WebSearchResult[],
): KeylessBingProviderResult["diagnostics"]["firstResultPreview"] | undefined => {
  const first = sources[0];
  if (!first) return undefined;
  return {
    title: compact(first.title, 160),
    url: compact(first.finalUrl ?? first.resolvedUrl ?? first.url, 240),
    searchStage: first.searchStage,
    discoveryMethod: first.discoveryMethod,
    sourceKind: first.sourceKind,
  };
};

const baseDiagnostics = (
  input: {
    query: string;
    bridgeQueries?: string[];
    plannedQueryCount?: number;
    newsQueryUsed?: boolean;
    newsStageUsed?: boolean;
    newsQueryMode?: NewsQueryMode;
    broadNewsRelaxedEntityFilter?: boolean;
    candidateHostDistribution?: Record<string, number>;
    hostDiversityApplied?: boolean;
    rejectedByEntityFilterCount?: number;
    rejectedByReadabilityCount?: number;
    rejectedByFreshnessCount?: number;
    rawHostDistribution?: Record<string, number>;
    normalizedHostDistribution?: Record<string, number>;
    targetDistinctHosts?: number;
    providerGlobalTimeoutMs?: number;
    perQueryTimeoutMs?: number;
    completedQueryCount?: number;
    failedQueryCount?: number;
    timedOutQueryCount?: number;
    partialResultsUsed?: boolean;
    timedOutQueries?: string[];
    failedQueries?: string[];
    earlyStop?: boolean;
    earlyStopReason?: string;
    distinctHostCountAtStop?: number;
    candidateCountAtStop?: number;
    perQueryElapsedMs?: Record<string, number>;
    perQueryResultCount?: Record<string, number>;
    perQueryHostPreview?: Record<string, string[]>;
    queryPurpose: QueryPurpose;
    providerStatus: KeylessBingProviderStatus;
    rawBridgeResultCount?: number;
    normalizedResultCount?: number;
    droppedResultCount?: number;
    qualityPreview?: KeylessBingProviderResult["diagnostics"]["qualityPreview"];
    stageDiagnosticsPreview?: string[];
    diagnosticsPreview?: string;
    firstResultPreview?: KeylessBingProviderResult["diagnostics"]["firstResultPreview"];
    bridgeDiagnostics?: KeylessBingProviderResult["diagnostics"]["bridgeDiagnostics"];
    errorKind?: KeylessBingProviderStatus;
  },
): KeylessBingProviderResult["diagnostics"] => ({
  provider: "keyless_bing",
  providerStatus: input.providerStatus,
  apiKeyRequired: false,
  mode: "public_search",
  credentialPolicy: "none",
  credentials: "omit",
  authorizationUsed: false,
  legacyTauriBridgeUsed: true,
  legacyBridgeName: "search_web_sources",
  browserFetchUsed: false,
  cookiesUsed: false,
  query: input.query,
  bridgeQueries: input.bridgeQueries ?? (input.query ? [input.query] : []),
  plannedQueryCount: input.plannedQueryCount ?? 0,
  newsQueryUsed: input.newsQueryUsed ?? input.queryPurpose === "news",
  newsStageUsed: input.newsStageUsed ?? false,
  newsQueryMode: input.newsQueryMode ?? "entity_news",
  broadNewsRelaxedEntityFilter: input.broadNewsRelaxedEntityFilter ?? false,
  candidateHostDistribution: input.candidateHostDistribution ?? {},
  diversityHostCount: Object.keys(input.candidateHostDistribution ?? {}).length,
  hostDiversityApplied: input.hostDiversityApplied ?? false,
  rejectedByEntityFilterCount: input.rejectedByEntityFilterCount ?? 0,
  rejectedByReadabilityCount: input.rejectedByReadabilityCount ?? 0,
  rejectedByFreshnessCount: input.rejectedByFreshnessCount ?? 0,
  rawHostDistribution: input.rawHostDistribution ?? {},
  normalizedHostDistribution: input.normalizedHostDistribution ?? input.candidateHostDistribution ?? {},
  distinctHostCount: Object.keys(input.normalizedHostDistribution ?? input.candidateHostDistribution ?? {}).length,
  targetDistinctHosts: input.targetDistinctHosts ?? (input.newsQueryMode === "broad_news_digest" ? 10 : input.newsQueryMode === "entity_news" ? 8 : 0),
  hostDiversityShortfall: Math.max(0, (input.targetDistinctHosts ?? (input.newsQueryMode === "broad_news_digest" ? 10 : input.newsQueryMode === "entity_news" ? 8 : 0)) - Object.keys(input.normalizedHostDistribution ?? input.candidateHostDistribution ?? {}).length),
  queryCount: input.bridgeQueries?.length ?? (input.query ? 1 : 0),
  providerGlobalTimeoutMs: input.providerGlobalTimeoutMs ?? 8_000,
  perQueryTimeoutMs: input.perQueryTimeoutMs ?? input.providerGlobalTimeoutMs ?? 8_000,
  completedQueryCount: input.completedQueryCount ?? 0,
  failedQueryCount: input.failedQueryCount ?? 0,
  timedOutQueryCount: input.timedOutQueryCount ?? 0,
  partialResultsUsed: input.partialResultsUsed ?? false,
  timedOutQueries: input.timedOutQueries ?? [],
  failedQueries: input.failedQueries ?? [],
  earlyStop: input.earlyStop ?? false,
  earlyStopReason: input.earlyStopReason,
  distinctHostCountAtStop: input.distinctHostCountAtStop ?? 0,
  candidateCountAtStop: input.candidateCountAtStop ?? 0,
  perQueryElapsedMs: input.perQueryElapsedMs ?? {},
  perQueryResultCount: input.perQueryResultCount ?? {},
  perQueryHostPreview: input.perQueryHostPreview ?? {},
  queryPurpose: input.queryPurpose,
  rawBridgeResultCount: input.rawBridgeResultCount ?? 0,
  normalizedResultCount: input.normalizedResultCount ?? 0,
  droppedResultCount: input.droppedResultCount ?? 0,
  qualityPreview: input.qualityPreview ?? [],
  resultCount: input.normalizedResultCount ?? 0,
  stageDiagnosticsPreview: input.stageDiagnosticsPreview ?? [],
  diagnosticsPreview: input.diagnosticsPreview,
  firstResultPreview: input.firstResultPreview,
  bridgeDiagnostics: input.bridgeDiagnostics,
  errorKind: input.errorKind,
});

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(`Keyless Bing provider timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
};

const isTimeoutMessage = (message: string): boolean =>
  /timeout|timed out|超时/i.test(message);

const isNewsDiscoveryMode = (
  queryPurpose: QueryPurpose,
  newsQueryMode: NewsQueryMode,
  bridgeQueries: string[],
): boolean =>
  queryPurpose === "news" ||
  newsQueryMode === "broad_news_digest" ||
  bridgeQueries.some(queryContainsReadableNewsSignal);

const providerGlobalTimeoutFor = (
  timeoutMs: number | undefined,
  queryPurpose: QueryPurpose,
  newsQueryMode: NewsQueryMode,
  bridgeQueries: string[],
): number => {
  if (!isNewsDiscoveryMode(queryPurpose, newsQueryMode, bridgeQueries)) return timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  const newsDefault = newsQueryMode === "broad_news_digest"
    ? BROAD_NEWS_PROVIDER_TIMEOUT_MS
    : ENTITY_NEWS_PROVIDER_TIMEOUT_MS;
  return Math.max(timeoutMs ?? 0, newsDefault);
};

const perQueryTimeoutFor = (
  queryPurpose: QueryPurpose,
  newsQueryMode: NewsQueryMode,
  bridgeQueries: string[],
): number =>
  isNewsDiscoveryMode(queryPurpose, newsQueryMode, bridgeQueries)
    ? NEWS_PER_QUERY_TIMEOUT_MS
    : DEFAULT_PROVIDER_TIMEOUT_MS;

const sourceKey = (source: WebSearchResult): string =>
  `${source.finalUrl ?? source.resolvedUrl ?? source.url ?? ""}::${source.title ?? ""}`.toLocaleLowerCase();

const hostsFromSources = (sources: WebSearchResult[]): string[] =>
  sources.map((source) => hostFromSource(source)).filter((host): host is string => Boolean(host));

const uniqueSources = (sources: WebSearchResult[]): WebSearchResult[] => {
  const seen = new Set<string>();
  const output: WebSearchResult[] = [];
  for (const source of sources) {
    const key = sourceKey(source);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(source);
  }
  return output;
};

const earlyStopCheck = (
  sources: WebSearchResult[],
  queryPurpose: QueryPurpose,
  newsQueryMode: NewsQueryMode,
): { stop: boolean; reason?: string; candidateCount: number; distinctHostCount: number } => {
  const rankedSources = rankSourcesForPurpose(sources, queryPurpose, newsQueryMode);
  const candidateCount = rankedSources.length;
  const distinctHostCount = Object.keys(distribution(rankedSources.map(({ source }) => hostFromSource(source)))).length;
  if (newsQueryMode === "broad_news_digest") {
    if (distinctHostCount >= 10) return { stop: true, reason: "target_distinct_hosts_reached", candidateCount, distinctHostCount };
    if (candidateCount >= 24 && distinctHostCount >= 8) return { stop: true, reason: "candidate_and_host_floor_reached", candidateCount, distinctHostCount };
    return { stop: false, candidateCount, distinctHostCount };
  }
  if (queryPurpose === "news" || newsQueryMode === "entity_news") {
    if (distinctHostCount >= 8) return { stop: true, reason: "target_distinct_hosts_reached", candidateCount, distinctHostCount };
    if (candidateCount >= 16 && distinctHostCount >= 6) return { stop: true, reason: "candidate_and_host_floor_reached", candidateCount, distinctHostCount };
  }
  return { stop: false, candidateCount, distinctHostCount };
};

const runSingleBridgeQuery = async (
  input: {
    rawUserQuery: string;
    bridgeQuery: string;
    queryPurpose: QueryPurpose;
    newsQueryMode: NewsQueryMode;
    maxResults: number;
    timeoutMs: number;
  },
): Promise<WebSearchResult[]> => {
  const result = await withTimeout(searchWebSources({
    provider: "bing",
    rawUserQuery: input.rawUserQuery,
    queries: [input.bridgeQuery],
    intent: "general_web",
    vertical: verticalForProviderRequest(input.queryPurpose, input.newsQueryMode),
    freshness: freshnessForProviderRequest(input.queryPurpose, input.newsQueryMode),
    maxResults: input.maxResults,
  }), input.timeoutMs);
  if (!Array.isArray(result)) {
    throw new Error("invalid_response: search_web_sources did not return an array of WebSearchResult.");
  }
  return result;
};

const runBridgeQueries = async (
  input: {
    query: string;
    rawUserQuery: string;
    bridgeQueries: string[];
    queryPurpose: QueryPurpose;
    newsQueryMode: NewsQueryMode;
    maxResults: number;
    providerGlobalTimeoutMs: number;
    perQueryTimeoutMs: number;
  },
): Promise<KeylessBingQueryExecutionResult> => {
  const startedAt = performance.now();
  const newsMode = isNewsDiscoveryMode(input.queryPurpose, input.newsQueryMode, input.bridgeQueries);
  if (!newsMode) {
    const sources = await withTimeout(searchWebSources({
      provider: "bing",
      rawUserQuery: input.rawUserQuery,
      queries: input.bridgeQueries,
      intent: "general_web",
      vertical: verticalForProviderRequest(input.queryPurpose, input.newsQueryMode),
      freshness: freshnessForProviderRequest(input.queryPurpose, input.newsQueryMode),
      maxResults: input.maxResults,
    }), input.providerGlobalTimeoutMs);
    if (!Array.isArray(sources)) {
      throw new Error("invalid_response: search_web_sources did not return an array of WebSearchResult.");
    }
    return {
      sources,
      warnings: [],
      errors: [],
      providerGlobalTimeoutMs: input.providerGlobalTimeoutMs,
      perQueryTimeoutMs: input.providerGlobalTimeoutMs,
      completedQueryCount: 1,
      failedQueryCount: 0,
      timedOutQueryCount: 0,
      partialResultsUsed: false,
      timedOutQueries: [],
      failedQueries: [],
      earlyStop: false,
      distinctHostCountAtStop: Object.keys(distribution(hostsFromSources(sources))).length,
      candidateCountAtStop: sources.length,
      perQueryElapsedMs: { [input.query]: elapsedMsSince(startedAt) },
      perQueryResultCount: { [input.query]: sources.length },
      perQueryHostPreview: { [input.query]: unique(hostsFromSources(sources)).slice(0, 6) },
    };
  }

  const sources: WebSearchResult[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const timedOutQueries: string[] = [];
  const failedQueries: string[] = [];
  const perQueryElapsedMs: Record<string, number> = {};
  const perQueryResultCount: Record<string, number> = {};
  const perQueryHostPreview: Record<string, string[]> = {};
  let completedQueryCount = 0;
  let earlyStop = false;
  let earlyStopReason: string | undefined;
  let distinctHostCountAtStop = 0;
  let candidateCountAtStop = 0;

  for (const bridgeQuery of input.bridgeQueries) {
    const elapsed = elapsedMsSince(startedAt);
    const remainingMs = input.providerGlobalTimeoutMs - elapsed;
    if (remainingMs <= 0) {
      timedOutQueries.push(bridgeQuery);
      warnings.push(`provider_global_timeout_before_query:${bridgeQuery}`);
      continue;
    }
    const queryStartedAt = performance.now();
    try {
      const querySources = await runSingleBridgeQuery({
        rawUserQuery: input.rawUserQuery,
        bridgeQuery,
        queryPurpose: input.queryPurpose,
        newsQueryMode: input.newsQueryMode,
        maxResults: input.maxResults,
        timeoutMs: Math.max(1, Math.min(input.perQueryTimeoutMs, remainingMs)),
      });
      completedQueryCount += 1;
      sources.push(...querySources);
      perQueryElapsedMs[bridgeQuery] = elapsedMsSince(queryStartedAt);
      perQueryResultCount[bridgeQuery] = querySources.length;
      perQueryHostPreview[bridgeQuery] = unique(hostsFromSources(querySources)).slice(0, 6);
      const stopCheck = earlyStopCheck(uniqueSources(sources), input.queryPurpose, input.newsQueryMode);
      distinctHostCountAtStop = stopCheck.distinctHostCount;
      candidateCountAtStop = stopCheck.candidateCount;
      if (stopCheck.stop) {
        earlyStop = true;
        earlyStopReason = stopCheck.reason;
        break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      perQueryElapsedMs[bridgeQuery] = elapsedMsSince(queryStartedAt);
      perQueryResultCount[bridgeQuery] = 0;
      perQueryHostPreview[bridgeQuery] = [];
      if (isTimeoutMessage(message)) {
        timedOutQueries.push(bridgeQuery);
        warnings.push(`timed_out_query:${bridgeQuery}`);
      } else {
        failedQueries.push(bridgeQuery);
        warnings.push(`failed_query:${bridgeQuery}`);
        errors.push(redactSensitivePreview(message, MAX_ERROR_PREVIEW_CHARS) ?? "failed_query");
      }
    }
  }

  const dedupedSources = uniqueSources(sources);
  const finalStopCheck = earlyStopCheck(dedupedSources, input.queryPurpose, input.newsQueryMode);
  return {
    sources: dedupedSources,
    warnings,
    errors: dedupedSources.length > 0 ? [] : errors,
    providerGlobalTimeoutMs: input.providerGlobalTimeoutMs,
    perQueryTimeoutMs: input.perQueryTimeoutMs,
    completedQueryCount,
    failedQueryCount: failedQueries.length,
    timedOutQueryCount: timedOutQueries.length,
    partialResultsUsed: dedupedSources.length > 0 && (timedOutQueries.length > 0 || failedQueries.length > 0),
    timedOutQueries,
    failedQueries,
    earlyStop,
    earlyStopReason,
    distinctHostCountAtStop: earlyStop ? distinctHostCountAtStop : finalStopCheck.distinctHostCount,
    candidateCountAtStop: earlyStop ? candidateCountAtStop : finalStopCheck.candidateCount,
    perQueryElapsedMs,
    perQueryResultCount,
    perQueryHostPreview,
  };
};

const rawResultFromWebSource = (
  source: WebSearchResult,
  index: number,
  input: {
    query: string;
    queryPurpose: QueryPurpose;
    queryLanguage?: "zh" | "en" | "mixed";
    newsQueryMode: NewsQueryMode;
    quality: KeylessSourceQuality;
  },
): DiscoveryRawResult | undefined => {
  const title = source.title?.trim();
  const url = source.finalUrl?.trim() || source.resolvedUrl?.trim() || source.url?.trim();
  if (!title || !url) return undefined;
  return {
    id: `keyless_bing:${input.queryPurpose}:${index}:${url}`,
    provider: "bing",
    providerPriority: 82,
    query: input.query,
    queryPurpose: input.queryPurpose,
    queryLanguage: input.queryLanguage,
    resultIndex: index,
    url,
    title,
    snippet: source.snippet,
    publishedAt: source.sourcePublishedAt ?? source.dateHint,
    discoveredAt: Date.now(),
    sourceTypeHint: sourceTypeHintForPurpose(source, input.queryPurpose, input.quality, input.newsQueryMode),
    extensions: {
      phase17KeylessBingProvider: {
        apiKeyRequired: false,
        sourceId: source.id,
        searchStage: source.searchStage,
        discoveryMethod: source.discoveryMethod,
        sourceKind: source.sourceKind,
        newsCandidateScore: input.quality.newsCandidateScore,
        readabilityPrior: input.quality.readabilityPrior,
        freshnessSignal: input.quality.freshnessSignal,
        rankingPenalty: input.quality.rankingPenalty,
        whySelected: input.quality.whySelected,
        whyRejected: input.quality.whyRejected,
        diagnosticsPreview: redactSensitivePreview(source.searchDiagnostics, MAX_DIAGNOSTICS_PREVIEW_CHARS),
      },
    },
  };
};

export const runKeylessBingProvider = async (
  options: KeylessBingProviderOptions,
): Promise<KeylessBingProviderResult> => {
  const startedAt = performance.now();
  const query = options.query.trim();
  const queryPurpose = options.queryPurpose ?? "recall";
  const newsQueryMode = detectNewsQueryMode(options);
  const bridgeQueries = chooseBridgeQueries(options, queryPurpose, newsQueryMode);
  const providerGlobalTimeoutMs = providerGlobalTimeoutFor(options.timeoutMs, queryPurpose, newsQueryMode, bridgeQueries);
  const perQueryTimeoutMs = perQueryTimeoutFor(queryPurpose, newsQueryMode, bridgeQueries);
  if (!query) {
    return {
      ok: false,
      providerName: "bing",
      status: "empty_result",
      rawResults: [],
      warnings: ["empty_query"],
      errors: ["Keyless Bing provider query is empty."],
      elapsedMs: elapsedMsSince(startedAt),
      diagnostics: {
        ...baseDiagnostics({
          query,
          bridgeQueries,
          plannedQueryCount: options.plannedQueries?.length ?? 0,
          newsQueryUsed: false,
          newsQueryMode,
          broadNewsRelaxedEntityFilter: newsQueryMode === "broad_news_digest",
          providerGlobalTimeoutMs,
          perQueryTimeoutMs,
          queryPurpose,
          providerStatus: "empty_result",
          errorKind: "empty_result",
        }),
        query,
        queryPurpose,
      },
    };
  }

  try {
    if (typeof window === "undefined") {
      throw new Error("tauri_bridge_unavailable: Keyless Bing provider requires the Tauri webview runtime.");
    }
    const execution = await runBridgeQueries({
      query,
      rawUserQuery: options.rawUserQuery ?? query,
      bridgeQueries,
      queryPurpose,
      newsQueryMode,
      maxResults: Math.max(1, Math.min(options.maxResults ?? 8, newsQueryMode === "broad_news_digest" ? 24 : queryPurpose === "news" ? 16 : 10)),
      providerGlobalTimeoutMs,
      perQueryTimeoutMs,
    });
    const sources = execution.sources;
    const rankedSources = rankSourcesForPurpose(sources, queryPurpose, newsQueryMode);
    const rawResults = rankedSources
      .map(({ source, quality }, index) => rawResultFromWebSource(source, index, {
        query,
        queryPurpose,
        queryLanguage: options.queryLanguage,
        newsQueryMode,
        quality,
      }))
      .filter((source): source is DiscoveryRawResult => Boolean(source));
    const diagnosticsPreview = diagnosticsPreviewFromSources(sources);
    const stageDiagnosticsPreview = stageDiagnosticsPreviewFromSources(sources);
    const firstResultPreview = firstResultPreviewFromSources(sources);
    const bridgeDiagnostics = bridgeDiagnosticsFromSources(sources);
    const qualityPreview = qualityPreviewFor(rankedSources);
    const rawHostDistribution = distribution(sources.map((source) => hostFromSource(source)));
    const candidateHostDistribution = distribution(rankedSources.map(({ source }) => hostFromSource(source)));
    const targetDistinctHosts = newsQueryMode === "broad_news_digest" ? 10 : queryPurpose === "news" ? 8 : 0;
    const rejectionStats = qualityRejectionStats(rankedSources, bridgeDiagnostics);
    const newsStageUsed = sources.some((source) => isNewsStage(source.searchStage));
    const newsQueryUsed = bridgeQueries.some(queryContainsReadableNewsSignal) || queryPurpose === "news";
    const missingResultCount = sources.length - rawResults.length;
    const warnings = [
      ...execution.warnings,
      ...(missingResultCount > 0 ? [`missing_required_fields:${missingResultCount}`] : []),
      ...(execution.partialResultsUsed ? ["partial_results_used"] : []),
      ...(execution.earlyStop ? [`early_stop:${execution.earlyStopReason ?? "target_reached"}`] : []),
      "keyless_bing_uses_existing_tauri_public_search_bridge",
    ];
    const status = rawResults.length > 0
      ? (warnings.length > 1 ? "partial" : "available")
      : sources.length > 0
        ? "parse_failed"
        : execution.timedOutQueryCount > 0 && execution.completedQueryCount === 0
          ? "timeout"
          : "empty_result";
    return {
      ok: rawResults.length > 0,
      providerName: "bing",
      status,
      rawResults,
      warnings,
      errors: rawResults.length > 0 ? [] : [
        execution.timedOutQueryCount > 0 && execution.completedQueryCount === 0
          ? `Keyless Bing provider timed out before any query returned usable candidates. timedOutQueries=${execution.timedOutQueries.join(" | ")}`
          : sources.length > 0
          ? `Keyless Bing provider returned ${sources.length} raw bridge results, but none had the required title/url fields after normalization.`
          : execution.errors[0] ?? "Keyless Bing provider returned no raw bridge results.",
      ],
      elapsedMs: elapsedMsSince(startedAt),
      diagnostics: baseDiagnostics({
        query,
        bridgeQueries,
        plannedQueryCount: options.plannedQueries?.length ?? 0,
        newsQueryUsed,
        newsStageUsed,
        newsQueryMode,
        broadNewsRelaxedEntityFilter: newsQueryMode === "broad_news_digest",
        candidateHostDistribution,
        rawHostDistribution,
        normalizedHostDistribution: candidateHostDistribution,
        targetDistinctHosts,
        providerGlobalTimeoutMs: execution.providerGlobalTimeoutMs,
        perQueryTimeoutMs: execution.perQueryTimeoutMs,
        completedQueryCount: execution.completedQueryCount,
        failedQueryCount: execution.failedQueryCount,
        timedOutQueryCount: execution.timedOutQueryCount,
        partialResultsUsed: execution.partialResultsUsed,
        timedOutQueries: execution.timedOutQueries,
        failedQueries: execution.failedQueries,
        earlyStop: execution.earlyStop,
        earlyStopReason: execution.earlyStopReason,
        distinctHostCountAtStop: execution.distinctHostCountAtStop,
        candidateCountAtStop: execution.candidateCountAtStop,
        perQueryElapsedMs: execution.perQueryElapsedMs,
        perQueryResultCount: execution.perQueryResultCount,
        perQueryHostPreview: execution.perQueryHostPreview,
        hostDiversityApplied: queryPurpose === "news" || newsQueryMode === "broad_news_digest",
        ...rejectionStats,
        queryPurpose,
        providerStatus: status,
        rawBridgeResultCount: sources.length,
        normalizedResultCount: rawResults.length,
        droppedResultCount: missingResultCount,
        stageDiagnosticsPreview,
        diagnosticsPreview,
        firstResultPreview,
        bridgeDiagnostics,
        qualityPreview,
        errorKind: rawResults.length > 0 ? undefined : status,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const safeMessage = sanitizeLegacyProviderHint(message);
    const status = errorStatusFromMessage(message);
    const diagnosticsPreview = redactSensitivePreview(safeMessage, MAX_DIAGNOSTICS_PREVIEW_CHARS);
    const bridgeDiagnostics = bridgeDiagnosticsFromText(safeMessage);
    return {
      ok: false,
      providerName: "bing",
      status,
      rawResults: [],
      warnings: ["keyless_bing_provider_failed"],
      errors: [redactSensitivePreview(safeMessage, MAX_ERROR_PREVIEW_CHARS) ?? status],
      elapsedMs: elapsedMsSince(startedAt),
      diagnostics: baseDiagnostics({
        query,
        bridgeQueries,
        plannedQueryCount: options.plannedQueries?.length ?? 0,
        newsQueryUsed: bridgeQueries.some(queryContainsReadableNewsSignal) || queryPurpose === "news",
        newsQueryMode,
        broadNewsRelaxedEntityFilter: newsQueryMode === "broad_news_digest",
        providerGlobalTimeoutMs,
        perQueryTimeoutMs,
        queryPurpose,
        providerStatus: status,
        stageDiagnosticsPreview: diagnosticsPreview ? [diagnosticsPreview] : [],
        diagnosticsPreview,
        bridgeDiagnostics,
        errorKind: status,
      }),
    };
  }
};
