import { searchWebSources } from "@/lib/api";
import type { AiSearchFreshness, SearchVertical, WebSearchResult } from "@/lib/aiWebSearch";
import type { DiscoveryRawResult, PlannedQuery, QueryPurpose, SourceType } from "./types";

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
const MAX_BRIDGE_QUERIES = 4;
const MAX_QUALITY_PREVIEW = 8;

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

const chooseBridgeQueries = (
  options: KeylessBingProviderOptions,
  queryPurpose: QueryPurpose,
): string[] => {
  const plannedQueries = options.plannedQueries ?? [];
  const newsQueries = plannedQueries
    .filter((item) => item.purpose === "news" || item.expectedSourceTypes.includes("mainstream_news") || queryContainsNewsSignal(item.query))
    .sort((left, right) => right.priority - left.priority)
    .map((item) => item.query);
  const officialNewsQueries = plannedQueries
    .filter((item) => item.purpose === "official" && item.expectedSourceTypes.includes("official") && queryContainsNewsSignal(item.query))
    .sort((left, right) => right.priority - left.priority)
    .map((item) => item.query);
  const allPlannedQueries = plannedQueries
    .sort((left, right) => right.priority - left.priority)
    .map((item) => item.query);
  const preferred = queryPurpose === "news"
    ? [...newsQueries, ...officialNewsQueries, ...allPlannedQueries, options.query]
    : [options.query, ...allPlannedQueries];
  return unique(preferred.map(normalizeQuery)).slice(0, MAX_BRIDGE_QUERIES);
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
): KeylessSourceQuality => {
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
  if (genericCompanyPage && queryPurpose === "news") rankingPenalty += 80;
  if (queryPurpose === "news" && !isNewsStage(stage) && source.newsLike !== true && !isReadableNewsPath(parsed) && !hasFreshnessSignal(source)) {
    rankingPenalty += 34;
  }
  if (source.filteredReason) rankingPenalty += 24;
  if (source.rejectedReason) rankingPenalty += 32;

  return {
    newsCandidateScore,
    readabilityPrior,
    freshnessSignal,
    rankingPenalty,
    stage,
    whySelected: whySelected.length > 0 ? whySelected : ["no_news_or_readability_signal"],
    whyRejected: genericCompanyPage
      ? "generic_company_page_for_news_query"
      : source.filteredReason ?? source.rejectedReason,
  };
};

const sourceTypeHintForPurpose = (
  source: WebSearchResult,
  queryPurpose: QueryPurpose,
  quality: KeylessSourceQuality,
): SourceType => {
  if (queryPurpose !== "news") return sourceTypeHintFor(source);
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
): Array<{ source: WebSearchResult; originalIndex: number; quality: KeylessSourceQuality; score: number }> =>
  sources
    .map((source, originalIndex) => {
      const quality = sourceQualityFor(source, queryPurpose);
      const score = queryPurpose === "news"
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
    stage: quality.stage,
    newsCandidateScore: quality.newsCandidateScore,
    readabilityPrior: quality.readabilityPrior,
    freshnessSignal: quality.freshnessSignal,
    rankingPenalty: quality.rankingPenalty,
    whySelected: quality.whySelected,
    whyRejected: quality.whyRejected,
  }));

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

const rawResultFromWebSource = (
  source: WebSearchResult,
  index: number,
  input: {
    query: string;
    queryPurpose: QueryPurpose;
    queryLanguage?: "zh" | "en" | "mixed";
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
    sourceTypeHint: sourceTypeHintForPurpose(source, input.queryPurpose, input.quality),
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
  const bridgeQueries = chooseBridgeQueries(options, queryPurpose);
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
    const sourceResult = await withTimeout(searchWebSources({
      provider: "bing",
      rawUserQuery: options.rawUserQuery ?? query,
      queries: bridgeQueries,
      intent: "general_web",
      vertical: verticalForPurpose(queryPurpose),
      freshness: freshnessForPurpose(queryPurpose),
      maxResults: Math.max(1, Math.min(options.maxResults ?? 8, 10)),
    }), options.timeoutMs ?? 8_000);
    if (!Array.isArray(sourceResult)) {
      throw new Error("invalid_response: search_web_sources did not return an array of WebSearchResult.");
    }
    const sources = sourceResult;
    const rankedSources = rankSourcesForPurpose(sources, queryPurpose);
    const rawResults = rankedSources
      .map(({ source, quality }, index) => rawResultFromWebSource(source, index, {
        query,
        queryPurpose,
        queryLanguage: options.queryLanguage,
        quality,
      }))
      .filter((source): source is DiscoveryRawResult => Boolean(source));
    const diagnosticsPreview = diagnosticsPreviewFromSources(sources);
    const stageDiagnosticsPreview = stageDiagnosticsPreviewFromSources(sources);
    const firstResultPreview = firstResultPreviewFromSources(sources);
    const bridgeDiagnostics = bridgeDiagnosticsFromSources(sources);
    const qualityPreview = qualityPreviewFor(rankedSources);
    const newsStageUsed = sources.some((source) => isNewsStage(source.searchStage));
    const newsQueryUsed = bridgeQueries.some(queryContainsNewsSignal) || queryPurpose === "news";
    const missingResultCount = sources.length - rawResults.length;
    const warnings = [
      ...(missingResultCount > 0 ? [`missing_required_fields:${missingResultCount}`] : []),
      "keyless_bing_uses_existing_tauri_public_search_bridge",
    ];
    const status = rawResults.length > 0
      ? (warnings.length > 1 ? "partial" : "available")
      : sources.length > 0
        ? "parse_failed"
        : "empty_result";
    return {
      ok: rawResults.length > 0,
      providerName: "bing",
      status,
      rawResults,
      warnings,
      errors: rawResults.length > 0 ? [] : [
        sources.length > 0
          ? `Keyless Bing provider returned ${sources.length} raw bridge results, but none had the required title/url fields after normalization.`
          : "Keyless Bing provider returned no raw bridge results.",
      ],
      elapsedMs: elapsedMsSince(startedAt),
      diagnostics: baseDiagnostics({
        query,
        bridgeQueries,
        plannedQueryCount: options.plannedQueries?.length ?? 0,
        newsQueryUsed,
        newsStageUsed,
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
        newsQueryUsed: bridgeQueries.some(queryContainsNewsSignal) || queryPurpose === "news",
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
