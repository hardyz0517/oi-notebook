import { searchWebSources } from "@/lib/api";
import type { AiSearchFreshness, SearchVertical, WebSearchResult } from "@/lib/aiWebSearch";
import type { DiscoveryRawResult, QueryPurpose, SourceType } from "./types";

export type KeylessBingProviderStatus =
  | "available"
  | "partial"
  | "blocked_or_captcha"
  | "timeout"
  | "network_error"
  | "parse_failed"
  | "empty_result"
  | "unsupported_environment"
  | "failed";

export type KeylessBingProviderOptions = {
  query: string;
  rawUserQuery?: string;
  queryPurpose?: QueryPurpose;
  queryLanguage?: "zh" | "en" | "mixed";
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
    apiKeyRequired: false;
    credentialPolicy: "none";
    credentials: "omit";
    legacyTauriBridgeUsed: true;
    browserFetchUsed: false;
    cookiesUsed: false;
    query: string;
    queryPurpose: QueryPurpose;
    resultCount: number;
    diagnosticsPreview?: string;
    errorKind?: KeylessBingProviderStatus;
  };
};

const MAX_DIAGNOSTICS_PREVIEW_CHARS = 1_200;

const elapsedMsSince = (startedAt: number): number => Math.max(0, Math.round(performance.now() - startedAt));

const compact = (value: string | undefined, maxChars: number): string | undefined => {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}...` : normalized;
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

const errorStatusFromMessage = (message: string): KeylessBingProviderStatus => {
  const lower = message.toLocaleLowerCase();
  if (lower.includes("blocked_or_captcha") || lower.includes("captcha") || lower.includes("rate_limited")) return "blocked_or_captcha";
  if (lower.includes("timeout")) return "timeout";
  if (lower.includes("network_error") || lower.includes("dns_failed") || lower.includes("tls_error")) return "network_error";
  if (lower.includes("parse_failed")) return "parse_failed";
  if (lower.includes("no_results")) return "empty_result";
  if (lower.includes("unsupported")) return "unsupported_environment";
  return "failed";
};

const sanitizeLegacyProviderHint = (message: string): string =>
  message.replace(
    /Bing public search is temporarily unavailable\.[^;]+settings\./,
    "Bing public search is temporarily unavailable in the keyless public provider path.",
  );

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
    sourceTypeHint: sourceTypeHintFor(source),
    extensions: {
      phase17KeylessBingProvider: {
        apiKeyRequired: false,
        sourceId: source.id,
        searchStage: source.searchStage,
        discoveryMethod: source.discoveryMethod,
        sourceKind: source.sourceKind,
        diagnosticsPreview: compact(source.searchDiagnostics, MAX_DIAGNOSTICS_PREVIEW_CHARS),
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
        provider: "keyless_bing",
        apiKeyRequired: false,
        credentialPolicy: "none",
        credentials: "omit",
        legacyTauriBridgeUsed: true,
        browserFetchUsed: false,
        cookiesUsed: false,
        query,
        queryPurpose,
        resultCount: 0,
        errorKind: "empty_result",
      },
    };
  }

  try {
    const sources = await withTimeout(searchWebSources({
      provider: "bing",
      rawUserQuery: options.rawUserQuery ?? query,
      queries: [query],
      intent: "general_web",
      vertical: verticalForPurpose(queryPurpose),
      freshness: freshnessForPurpose(queryPurpose),
      maxResults: Math.max(1, Math.min(options.maxResults ?? 8, 10)),
    }), options.timeoutMs ?? 8_000);
    const rawResults = sources
      .map((source, index) => rawResultFromWebSource(source, index, {
        query,
        queryPurpose,
        queryLanguage: options.queryLanguage,
      }))
      .filter((source): source is DiscoveryRawResult => Boolean(source));
    const diagnosticsPreview = compact(
      sources.find((source) => source.searchDiagnostics)?.searchDiagnostics,
      MAX_DIAGNOSTICS_PREVIEW_CHARS,
    );
    const missingResultCount = sources.length - rawResults.length;
    const warnings = [
      ...(missingResultCount > 0 ? [`missing_required_fields:${missingResultCount}`] : []),
      "keyless_bing_uses_existing_tauri_public_search_bridge",
    ];
    return {
      ok: rawResults.length > 0,
      providerName: "bing",
      status: rawResults.length > 0 ? (warnings.length > 1 ? "partial" : "available") : "empty_result",
      rawResults,
      warnings,
      errors: rawResults.length > 0 ? [] : ["Keyless Bing provider returned no normalized results."],
      elapsedMs: elapsedMsSince(startedAt),
      diagnostics: {
        provider: "keyless_bing",
        apiKeyRequired: false,
        credentialPolicy: "none",
        credentials: "omit",
        legacyTauriBridgeUsed: true,
        browserFetchUsed: false,
        cookiesUsed: false,
        query,
        queryPurpose,
        resultCount: rawResults.length,
        diagnosticsPreview,
        errorKind: rawResults.length > 0 ? undefined : "empty_result",
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const safeMessage = sanitizeLegacyProviderHint(message);
    const status = errorStatusFromMessage(message);
    return {
      ok: false,
      providerName: "bing",
      status,
      rawResults: [],
      warnings: ["keyless_bing_provider_failed"],
      errors: [safeMessage],
      elapsedMs: elapsedMsSince(startedAt),
      diagnostics: {
        provider: "keyless_bing",
        apiKeyRequired: false,
        credentialPolicy: "none",
        credentials: "omit",
        legacyTauriBridgeUsed: true,
        browserFetchUsed: false,
        cookiesUsed: false,
        query,
        queryPurpose,
        resultCount: 0,
        diagnosticsPreview: compact(safeMessage, MAX_DIAGNOSTICS_PREVIEW_CHARS),
        errorKind: status,
      },
    };
  }
};
