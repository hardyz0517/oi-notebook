import type {
  RealDiscoveryTransportError,
  RealProviderNormalizeInput,
  RealProviderNormalizeResult,
} from "./realProviderTypes";
import type { DiscoveryRawResult, SourceType } from "./types";

type RawItem = {
  title?: unknown;
  name?: unknown;
  url?: unknown;
  snippet?: unknown;
  description?: unknown;
  summary?: unknown;
  datePublished?: unknown;
  publishedTime?: unknown;
  age?: unknown;
  siteName?: unknown;
  source?: unknown;
  profile?: { name?: unknown };
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const sourceTypeFromHost = (url: string, siteName?: string): SourceType => {
  const lower = `${url} ${siteName ?? ""}`.toLocaleLowerCase();
  if (lower.includes("react.dev") || lower.includes("openai.com")) return "official";
  if (lower.includes("reuters") || lower.includes("thepaper") || lower.includes("\u6f8e\u6e43")) return "mainstream_news";
  if (lower.includes("forum")) return "forum";
  return "unknown";
};

const itemsForPayload = (input: RealProviderNormalizeInput): { items: unknown[]; warnings: string[] } => {
  const root = asRecord(input.payload);
  if (!root) return { items: [], warnings: ["payload_not_object"] };
  if (input.payloadKind === "bing_like") {
    const webPages = asRecord(root.webPages);
    return { items: asArray(webPages?.value), warnings: webPages ? [] : ["bing_web_pages_missing"] };
  }
  if (input.payloadKind === "brave_like") {
    const web = asRecord(root.web);
    return { items: asArray(web?.results), warnings: web ? [] : ["brave_web_results_missing"] };
  }
  if (input.payloadKind === "bocha_like") {
    const data = asRecord(root.data);
    return { items: asArray(data?.webPages ?? data?.pages ?? root.webPages), warnings: data || root.webPages ? [] : ["bocha_pages_missing"] };
  }
  return { items: [], warnings: ["unsupported_payload_kind"] };
};

const malformed = (message: string): RealDiscoveryTransportError => ({
  kind: "malformed_response",
  message,
});

const rawResult = (
  input: RealProviderNormalizeInput,
  item: RawItem,
  index: number,
): DiscoveryRawResult | undefined => {
  const title = asString(item.title) ?? asString(item.name);
  const url = asString(item.url);
  if (!title || !url) return undefined;
  const snippet = asString(item.snippet) ?? asString(item.description) ?? asString(item.summary);
  const publishedAt = asString(item.datePublished) ?? asString(item.publishedTime) ?? asString(item.age);
  const siteName = asString(item.siteName) ?? asString(item.source) ?? asString(item.profile?.name);
  return {
    id: `${input.providerName}:${input.request.query.purpose}:${index}:${url}`,
    provider: input.providerName,
    providerPriority: input.providerPriority,
    query: input.request.query.query,
    queryPurpose: input.request.query.purpose,
    queryLanguage: input.request.query.language,
    resultIndex: index,
    url,
    title,
    snippet,
    publishedAt,
    discoveredAt: index,
    sourceTypeHint: sourceTypeFromHost(url, siteName),
    extensions: {
      phase8RealProvider: {
        providerName: input.providerName,
        payloadKind: input.payloadKind,
        siteName,
      },
    },
  };
};

export const normalizeRealProviderPayload = (input: RealProviderNormalizeInput): RealProviderNormalizeResult => {
  const { items, warnings } = itemsForPayload(input);
  const rawResults = items
    .slice(0, input.maxResults)
    .map((item, index) => rawResult(input, asRecord(item) ?? {}, index))
    .filter((item): item is DiscoveryRawResult => Boolean(item));
  const missingRequiredFieldCount = Math.min(items.length, input.maxResults) - rawResults.length;
  const finalWarnings = [
    ...warnings,
    ...(missingRequiredFieldCount > 0 ? [`missing_required_fields:${missingRequiredFieldCount}`] : []),
  ];
  const error = rawResults.length === 0
    ? warnings.includes("unsupported_payload_kind") || warnings.some((warning) => warning.endsWith("_missing")) || warnings.includes("payload_not_object")
      ? malformed("provider payload shape is unsupported")
      : { kind: "empty_result" as const, message: "provider payload contained no results" }
    : undefined;
  return {
    rawResults,
    warnings: finalWarnings,
    diagnostics: {
      providerName: input.providerName,
      payloadKind: input.payloadKind,
      resultCount: rawResults.length,
      warningCount: finalWarnings.length,
    },
    partial: finalWarnings.length > 0 && rawResults.length > 0,
    error,
  };
};
