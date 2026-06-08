import type { WebSearchConfig } from "@/lib/aiWebSearch";
import { buildAnswerContract } from "./answerContract";
import { buildCandidatePool } from "./candidatePool";
import { buildEvidencePacket } from "./evidencePacket";
import { evaluateEvidencePacket } from "./evidenceEvaluator";
import { runKeylessBingProvider } from "./keylessBingProvider";
import { normalizeRealProviderPayload } from "./providerResponseNormalizer";
import { buildQueryPlan } from "./queryPlanner";
import { runBrowserProviderSmokeRequest, type BrowserProviderRedactedRequest } from "./browserProviderTransport";
import { runResearchEngineRealUrlReaderSmoke, type ResearchEngineRealUrlReaderSmokeResult } from "./realUrlReaderSmoke";
import { buildSearchPolicyDecision } from "./searchPolicy";
import type { AnswerMode, EvidenceSummary } from "./evidenceTypes";
import type { ExcerptBuildResult, ExcerptWarning, ExtractedDocument, ReaderQualityEvaluation, UrlReaderResult, UrlReaderStatus } from "./readerTypes";
import type { RealDiscoveryProviderName, RealDiscoveryTransportError, RealProviderPayloadKind } from "./realProviderTypes";
import type {
  CandidateSource,
  DiscoveryProviderStatus,
  DiscoveryRawResult,
  ExpectedSourceType,
  QueryPlan,
  ResearchSearchRequest,
  SearchPolicyDecision,
  SourceReliability,
  SourceType,
} from "./types";

type SmokeProviderName = Extract<RealDiscoveryProviderName, "bing" | "bocha" | "brave">;
type ApiSmokeProviderName = Extract<RealDiscoveryProviderName, "bocha" | "brave">;
type E2ESmokeConfig =
  | {
    providerName: "bing";
    mode: "keyless_bing";
    providerPriority: number;
  }
  | {
    providerName: ApiSmokeProviderName;
    mode: "api";
    endpoint: string;
    apiKey: string;
    payloadKind: RealProviderPayloadKind;
    providerPriority: number;
  };

export type ResearchEngineRealE2ESmokeOptions = {
  query: string;
  webSearchConfig: WebSearchConfig | null;
  providerName?: SmokeProviderName;
  maxCandidates?: number;
  readTopN?: number;
  timeoutMs?: number;
};

export type ResearchEngineRealE2ESmokeResult = {
  ok: boolean;
  query: string;
  providerName: RealDiscoveryProviderName | "none";
  providerStatus: DiscoveryProviderStatus | "not_configured" | "unsupported_provider" | "unauthorized" | "rate_limited" | "timeout" | "tauri_bridge_unavailable" | "blocked_or_captcha" | "network_error" | "parse_failed" | "invalid_response" | "unsupported_environment" | "malformed_response" | "empty_result" | "all_reader_failed" | "cors_or_reader_network_error" | "unknown_error";
  rawResultCount: number;
  normalizedResultCount: number;
  candidateCount: number;
  selectedCandidate?: {
    id: string;
    title: string;
    url: string;
    host: string;
    sourceType: ExpectedSourceType | "seo_aggregator" | "unknown";
    score?: number;
  };
  readerStatus: ResearchEngineRealUrlReaderSmokeResult["status"] | "not_started";
  readerQuality?: ResearchEngineRealUrlReaderSmokeResult["qualitySummary"];
  selectedPassageCount: number;
  evidenceSummary?: EvidenceSummary;
  answerContractMode?: AnswerMode;
  warnings: string[];
  errors: string[];
  markdownReport: string;
  diagnosticsSnapshot: Record<string, unknown>;
};

const DEFAULT_QUERY = "OpenAI latest news";
const DEFAULT_PROVIDER_TIMEOUT_MS = 8_000;
const DEFAULT_READER_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_CANDIDATES = 8;
const DEFAULT_READ_TOP_N = 1;
const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const EXCERPT_PREVIEW_MAX_CHARS = 1200;

const isSmokeProviderName = (value: string | undefined): value is SmokeProviderName =>
  value === "bing" || value === "bocha" || value === "brave";

const previewText = (value: string | undefined, maxChars: number): string | undefined => {
  if (!value) return undefined;
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxChars ? `${compact.slice(0, maxChars)}...` : compact;
};

const unique = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));

const configForSmoke = (
  config: WebSearchConfig | null,
  providerName?: SmokeProviderName,
): E2ESmokeConfig | undefined => {
  if (!config || !config.enabled || !config.publicSearchConsent) return undefined;
  const selectedProvider = providerName ?? (isSmokeProviderName(config.provider) ? config.provider : undefined);
  if (selectedProvider === "bing") {
    return {
      providerName: "bing",
      mode: "keyless_bing",
      providerPriority: 82,
    };
  }
  if (selectedProvider === "bocha" && config.bochaApiKey.trim()) {
    return {
      providerName: "bocha",
      mode: "api",
      endpoint: config.bochaEndpoint.trim() || "https://api.bochaai.com/v1/web-search",
      apiKey: config.bochaApiKey.trim(),
      payloadKind: "bocha_like",
      providerPriority: 86,
    };
  }
  if (selectedProvider === "brave" && config.braveApiKey.trim()) {
    return {
      providerName: "brave",
      mode: "api",
      endpoint: BRAVE_ENDPOINT,
      apiKey: config.braveApiKey.trim(),
      payloadKind: "brave_like",
      providerPriority: 84,
    };
  }
  return undefined;
};

const unconfiguredWarningsFor = (
  config: WebSearchConfig | null,
  providerName?: SmokeProviderName,
): string[] => {
  if (!config) return ["Web search config is unavailable; real E2E smoke was not started."];
  if (!config.enabled) return ["Public web search is disabled in the current settings; real E2E smoke was not started."];
  if (!config.publicSearchConsent) return ["Public search consent is disabled; real E2E smoke was not started."];
  const selectedProvider = providerName ?? config.provider;
  if (selectedProvider === "bing") {
    return [
      "Bing public search uses the Research Engine keyless public provider. It requires no API key and does not fall back to legacy NoteX search.",
    ];
  }
  if (selectedProvider === "bocha" && !config.bochaApiKey.trim()) return ["Bocha API key is missing; API providers are optional, and the Research Engine mainline should use a no-key public provider such as Bing."];
  if (selectedProvider === "brave" && !config.braveApiKey.trim()) return ["Brave API key is missing; API providers are optional, and the Research Engine mainline should use a no-key public provider such as Bing."];
  return [
    "This real E2E smoke supports configured optional API providers.",
    "Research Engine mainline discovery should prefer no-key public providers such as Bing.",
  ];
};

const statusFromError = (
  error: RealDiscoveryTransportError,
): ResearchEngineRealE2ESmokeResult["providerStatus"] => {
  if (error.kind === "unauthorized") return "unauthorized";
  if (error.kind === "rate_limited") return "rate_limited";
  if (error.kind === "malformed_response") return "malformed_response";
  if (error.kind === "empty_result") return "empty_result";
  if (error.kind === "unsupported_provider") return "unsupported_provider";
  return "failed";
};

const discoveryStatusFromProviderStatus = (
  status: ResearchEngineRealE2ESmokeResult["providerStatus"],
): DiscoveryProviderStatus => {
  if (status === "available") return "available";
  if (status === "partial") return "partial";
  if (status === "timeout") return "timeout";
  if (status === "not_configured" || status === "unsupported_provider") return "disabled";
  return "failed";
};

const providerStatusFromReaderFailure = (
  reader: ResearchEngineRealUrlReaderSmokeResult,
): ResearchEngineRealE2ESmokeResult["providerStatus"] =>
  reader.status === "network_error" ? "cors_or_reader_network_error" : "all_reader_failed";

const makeRequestContext = (
  query: string,
): {
  request: ResearchSearchRequest;
  policy: SearchPolicyDecision;
  queryPlan: QueryPlan;
} => {
  const request: ResearchSearchRequest = {
    requestId: "developer-real-e2e-smoke",
    userQuestion: query,
    locale: "auto",
    options: {
      allowPublicWeb: true,
      offlineOnly: false,
      maxQueries: 1,
    },
    extensions: {
      developerDiagnosticsOnly: true,
      phase14RealE2ESmoke: true,
    },
  };
  const policy = buildSearchPolicyDecision(request);
  const queryPlan = buildQueryPlan(request, policy);
  return { request, policy, queryPlan };
};

const sourceTypeFromExpected = (sourceType: ExpectedSourceType | "seo_aggregator" | "unknown"): SourceType => {
  if (sourceType === "documentation") return "docs";
  if (sourceType === "official") return "official";
  if (sourceType === "mainstream_news") return "mainstream_news";
  if (sourceType === "technical_blog") return "tech_media";
  if (sourceType === "community_solution") return "community";
  if (sourceType === "forum") return "forum";
  if (sourceType === "seo_aggregator") return "seo_aggregator";
  return "unknown";
};

const reliabilityForSourceType = (sourceType: SourceType): SourceReliability => {
  if (sourceType === "official" || sourceType === "docs") return "very_high";
  if (sourceType === "mainstream_news") return "high";
  if (sourceType === "community" || sourceType === "tech_media") return "medium";
  if (sourceType === "forum" || sourceType === "seo_aggregator") return "low";
  return "unknown";
};

const readerStatusToUrlReaderStatus = (status: ResearchEngineRealUrlReaderSmokeResult["status"]): UrlReaderStatus => {
  if (status === "fetched") return "fetched";
  if (status === "partial" || status === "body_too_large") return "partial";
  if (status === "needs_js") return "needs_js";
  if (status === "parse_failed") return "parse_failed";
  if (status === "empty_body") return "too_short";
  if (status === "unsupported_content_type" || status === "unsupported_environment") return "unsupported";
  if (status === "timeout") return "timeout";
  return "blocked";
};

const warningForReaderStatus = (status: ResearchEngineRealUrlReaderSmokeResult["status"]): ExcerptWarning[] => {
  if (status === "needs_js") return ["needs_js"];
  if (status === "partial" || status === "body_too_large") return ["partial_reader_result"];
  if (status === "parse_failed") return ["parse_failed"];
  if (status === "empty_body") return ["too_short"];
  if (status === "fetched") return [];
  return ["blocked_or_unreadable"];
};

const blockStatsFromReader = (
  reader: ResearchEngineRealUrlReaderSmokeResult,
): ReaderQualityEvaluation["blockStats"] => ({
  heading: reader.blockCounts.heading ?? 0,
  paragraph: reader.blockCounts.paragraph ?? 0,
  code: reader.blockCounts.code ?? 0,
  math: reader.blockCounts.math ?? 0,
  table: reader.blockCounts.table ?? 0,
  list: reader.blockCounts.list ?? 0,
  quote: reader.blockCounts.quote ?? 0,
  metadata: reader.blockCounts.metadata ?? 0,
  unknown: reader.blockCounts.unknown ?? 0,
  total: reader.blockCounts.total ?? 0,
  complete: reader.blockCounts.complete ?? reader.blockCounts.total ?? 0,
  incomplete: reader.blockCounts.incomplete ?? 0,
  textChars: reader.excerptLength,
});

const buildEvidenceInputs = (
  input: {
    request: ResearchSearchRequest;
    policy: SearchPolicyDecision;
    queryPlan: QueryPlan;
    candidate: CandidateSource;
    reader: ResearchEngineRealUrlReaderSmokeResult;
  },
) => {
  const sourceType = sourceTypeFromExpected(input.candidate.sourceType);
  const excerptMarkdown = input.reader.excerptPreview ?? "";
  const document: ExtractedDocument | undefined = excerptMarkdown
    ? {
      candidate: input.candidate,
      metadata: {
        title: input.candidate.title,
        canonicalUrl: input.candidate.url,
        host: input.candidate.host,
        sourceType,
        reliability: reliabilityForSourceType(sourceType),
        detectedLanguage: input.candidate.language,
      },
      blocks: [{
        id: "real-e2e-excerpt-preview",
        type: "paragraph",
        text: excerptMarkdown,
        charLength: excerptMarkdown.length,
        tokenEstimate: Math.ceil(excerptMarkdown.length / 4),
        isComplete: true,
        language: input.candidate.language,
      }],
      textCharLength: excerptMarkdown.length,
      diagnostics: {
        phase14RealE2ESmoke: true,
        excerptPreviewOnly: true,
      },
    }
    : undefined;
  const readerResult: UrlReaderResult = {
    request: {
      request: input.request,
      policy: input.policy,
      queryPlan: input.queryPlan,
      candidate: input.candidate,
    },
    candidate: input.candidate,
    status: readerStatusToUrlReaderStatus(input.reader.status),
    document,
    error: input.reader.ok
      ? undefined
      : {
        kind: input.reader.status === "needs_js" ? "js_required" : input.reader.status === "unsupported_content_type" ? "unsupported_content_type" : "unknown",
        message: input.reader.errors.join("; ") || input.reader.status,
        recoverable: true,
      },
    diagnostics: {
      phase14RealE2ESmoke: true,
      httpStatus: input.reader.httpStatus,
      contentType: input.reader.contentType,
      bodyBytes: input.reader.bodyBytes,
    },
  };
  const excerptWarnings = warningForReaderStatus(input.reader.status);
  const quality: ReaderQualityEvaluation = {
    quality: input.reader.qualitySummary?.quality ?? "none",
    canSupportAnswer: input.reader.qualitySummary?.canSupportAnswer ?? false,
    canSupportStrongClaim: input.reader.qualitySummary?.canSupportStrongClaim ?? false,
    reasons: input.reader.qualitySummary?.reasons ?? input.reader.errors,
    warnings: excerptWarnings,
    blockStats: blockStatsFromReader(input.reader),
    signals: [],
  };
  const excerpt: ExcerptBuildResult = {
    excerptMarkdown,
    selectedPassages: [],
    omittedBlockCount: Math.max(0, (input.reader.blockCounts.total ?? 0) - input.reader.selectedPassageCount),
    warnings: excerptWarnings,
    budgetUsed: excerptMarkdown.length,
    hasTruncatedCodeBlock: false,
    hasTruncatedMathBlock: false,
  };
  return { readerResult, readerQuality: quality, excerpt };
};

const buildMarkdownReport = (result: Omit<ResearchEngineRealE2ESmokeResult, "markdownReport">): string => {
  const providerLabel = result.diagnosticsSnapshot.providerName === "keyless_bing" ? "keyless_bing" : result.providerName;
  const apiKeyRequired = result.diagnosticsSnapshot.apiKeyRequired === false
    ? "no"
    : result.diagnosticsSnapshot.apiKeyRequired === true
      ? "yes"
      : "unknown";
  const mode = typeof result.diagnosticsSnapshot.mode === "string" ? result.diagnosticsSnapshot.mode : "api";
  const legacyBridge = typeof result.diagnosticsSnapshot.legacyBridgeName === "string"
    ? result.diagnosticsSnapshot.legacyBridgeName
    : "none";
  const excerptPreview = typeof result.diagnosticsSnapshot.excerptPreview === "string"
    ? result.diagnosticsSnapshot.excerptPreview
    : "none";
  const chineseDiagnostics = [
    "## \u4e2d\u6587\u8bca\u65ad\u8bf4\u660e",
    "- \u5f53\u524d\u4e3a Research Engine \u5f00\u53d1\u8bca\u65ad\u3002",
    "- Bing \u8def\u5f84\u4f7f\u7528\u65e0 key \u516c\u5171\u641c\u7d22\uff0c\u4e0d\u8bfb\u53d6 API key\u3001Cookie \u6216 Authorization\u3002",
    "- \u65e7 NoteX \u641c\u7d22\u4e0d\u4f1a\u81ea\u52a8\u56de\u9000\u3002",
  ];
  return [
    "# Research Engine Real E2E Smoke",
    "",
    `- ok: ${result.ok}`,
    `- query: ${result.query}`,
    `- provider: ${providerLabel}`,
    `- providerStatus: ${result.providerStatus}`,
    `- apiKeyRequired: ${apiKeyRequired}`,
    `- mode: ${mode}`,
    `- legacyBridge: ${legacyBridge}`,
    `- rawResultCount: ${result.rawResultCount}`,
    `- normalizedResultCount: ${result.normalizedResultCount}`,
    `- candidateCount: ${result.candidateCount}`,
    `- selectedUrl: ${result.selectedCandidate?.url ?? "none"}`,
    `- readerStatus: ${result.readerStatus}`,
    `- readerQuality: ${result.readerQuality?.quality ?? "none"}`,
    `- selectedPassageCount: ${result.selectedPassageCount}`,
    `- answerContractMode: ${result.answerContractMode ?? "none"}`,
    "",
    "## Selected Candidate",
    result.selectedCandidate
      ? `- ${result.selectedCandidate.title} (${result.selectedCandidate.host})\n- ${result.selectedCandidate.url}`
      : "- none",
    "",
    "## Evidence Summary",
    result.evidenceSummary
      ? [
        `- strong: ${result.evidenceSummary.strongCount}`,
        `- medium: ${result.evidenceSummary.mediumCount}`,
        `- weak: ${result.evidenceSummary.weakCount}`,
        `- none: ${result.evidenceSummary.noneCount}`,
        `- citeable: ${result.evidenceSummary.citeableCount}`,
      ].join("\n")
      : "- none",
    "",
    "## Excerpt Preview",
    excerptPreview,
    "",
    "## Warnings",
    ...(result.warnings.length > 0 ? result.warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
    "## Errors",
    ...(result.errors.length > 0 ? result.errors.map((error) => `- ${error}`) : ["- none"]),
    "",
    "## 中文诊断说明",
    "- 当前为 Research Engine 开发诊断。",
    "- Bing 路径使用无 key 公共搜索，不读取 API key、Cookie 或 Authorization。",
    "- 旧 NoteX 搜索不会自动回退。",
  ]
    .filter((line) => !line.includes("\u6d93") && !line.includes("\u8930") && !line.includes("\u749a") && !line.includes("\u93c3"))
    .concat(chineseDiagnostics)
    .join("\n");

  /*
  const lines = [
    "# Research Engine Real E2E Smoke",
    "",
    `- ok: ${result.ok}`,
    `- query: ${result.query}`,
    `- provider: ${result.diagnosticsSnapshot.providerName === "keyless_bing" ? "keyless_bing" : result.providerName}`,
    `- providerStatus: ${result.providerStatus}`,
    `- apiKeyRequired: ${result.diagnosticsSnapshot.apiKeyRequired === false ? "no" : result.diagnosticsSnapshot.apiKeyRequired === true ? "yes" : "unknown"}`,
    `- mode: ${typeof result.diagnosticsSnapshot.mode === "string" ? result.diagnosticsSnapshot.mode : "api"}`,
    `- legacyBridge: ${typeof result.diagnosticsSnapshot.legacyBridgeName === "string" ? result.diagnosticsSnapshot.legacyBridgeName : "none"}`,
    `- rawResultCount: ${result.rawResultCount}`,
    `- normalizedResultCount: ${result.normalizedResultCount}`,
    `- candidateCount: ${result.candidateCount}`,
    `- selectedUrl: ${result.selectedCandidate?.url ?? "none"}`,
    `- readerStatus: ${result.readerStatus}`,
    `- readerQuality: ${result.readerQuality?.quality ?? "none"}`,
    `- selectedPassageCount: ${result.selectedPassageCount}`,
    `- answerContractMode: ${result.answerContractMode ?? "none"}`,
    "",
    "## Selected Candidate",
    result.selectedCandidate
      ? `- ${result.selectedCandidate.title} (${result.selectedCandidate.host})\n- ${result.selectedCandidate.url}`
      : "- none",
    "",
    "## Evidence Summary",
    result.evidenceSummary
      ? [
        `- strong: ${result.evidenceSummary.strongCount}`,
        `- medium: ${result.evidenceSummary.mediumCount}`,
        `- weak: ${result.evidenceSummary.weakCount}`,
        `- none: ${result.evidenceSummary.noneCount}`,
        `- citeable: ${result.evidenceSummary.citeableCount}`,
      ].join("\n")
      : "- none",
    "",
    "## Excerpt Preview",
    typeof result.diagnosticsSnapshot.excerptPreview === "string" ? result.diagnosticsSnapshot.excerptPreview : "none",
    "",
    "## Warnings",
    ...(result.warnings.length > 0 ? result.warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
    "## Errors",
    ...(result.errors.length > 0 ? result.errors.map((error) => `- ${error}`) : ["- none"]),
    "",
    "## 中文诊断说明",
    "- 当前为 Research Engine 开发诊断。",
    "- Bing 路径使用无 key 公共搜索，不读取 API key、Cookie 或 Authorization。",
    "- 旧 NoteX 搜索不会自动回退。",
  ];
  return lines.join("\n");
  */
};

const finalize = (
  result: Omit<ResearchEngineRealE2ESmokeResult, "markdownReport">,
): ResearchEngineRealE2ESmokeResult => ({
  ...result,
  markdownReport: buildMarkdownReport(result),
});

export const runResearchEngineRealE2ESmoke = async (
  options: ResearchEngineRealE2ESmokeOptions,
): Promise<ResearchEngineRealE2ESmokeResult> => {
  const query = options.query.trim() || DEFAULT_QUERY;
  const requestedProvider = options.providerName ?? (options.webSearchConfig?.provider as RealDiscoveryProviderName | undefined) ?? "none";
  const smokeConfig = configForSmoke(options.webSearchConfig, options.providerName);
  if (!smokeConfig) {
    return finalize({
      ok: false,
      query,
      providerName: requestedProvider,
      providerStatus: "not_configured",
      rawResultCount: 0,
      normalizedResultCount: 0,
      candidateCount: 0,
      readerStatus: "not_started",
      selectedPassageCount: 0,
      warnings: unconfiguredWarningsFor(options.webSearchConfig, options.providerName),
      errors: ["real E2E smoke is not configured for the current web search settings"],
      diagnosticsSnapshot: {
        developerDiagnosticsOnly: true,
        oldSearchPathTouched: false,
        noteConversationTouched: false,
        realProviderConfigured: false,
      },
    });
  }

  const maxCandidates = Math.max(1, Math.min(options.maxCandidates ?? DEFAULT_MAX_CANDIDATES, 10));
  const readTopN = Math.max(1, Math.min(options.readTopN ?? DEFAULT_READ_TOP_N, 1));
  const { request, policy, queryPlan } = makeRequestContext(query);
  const plannedQuery = queryPlan.queries[0] ?? {
    query,
    language: policy.locale,
    purpose: "recall" as const,
    priority: 100,
    expectedSourceTypes: ["official" as const, "mainstream_news" as const],
  };
  let providerStatus: ResearchEngineRealE2ESmokeResult["providerStatus"] = "failed";
  let rawResults: DiscoveryRawResult[] = [];
  let rawResultCount = 0;
  const warnings: string[] = [];
  const errors: string[] = [];
  let redactedProviderRequest: BrowserProviderRedactedRequest | undefined;
  let providerBodyPreview: string | undefined;
  let keylessProviderDiagnostics: Record<string, unknown> | undefined;

  if (smokeConfig.mode === "keyless_bing") {
    const keyless = await runKeylessBingProvider({
      query: plannedQuery.query,
      rawUserQuery: query,
      queryPurpose: plannedQuery.purpose,
      queryLanguage: plannedQuery.language,
      maxResults: maxCandidates,
      timeoutMs: options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS,
    });
    providerStatus = keyless.status;
    rawResults = keyless.rawResults;
    rawResultCount = keyless.diagnostics.rawBridgeResultCount;
    warnings.push(...keyless.warnings);
    errors.push(...keyless.errors);
    keylessProviderDiagnostics = keyless.diagnostics;
  } else {
    const providerTransport = await runBrowserProviderSmokeRequest({
      providerName: smokeConfig.providerName,
      endpoint: smokeConfig.endpoint ?? "",
      apiKey: smokeConfig.apiKey ?? "",
      query: plannedQuery.query,
      maxResults: maxCandidates,
      timeoutMs: options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS,
    });
    providerBodyPreview = providerTransport.bodyPreview;

    if (!providerTransport.ok) {
      providerStatus = statusFromError(providerTransport.error);
      errors.push(providerTransport.error.message);
      redactedProviderRequest = providerTransport.redactedRequest;
      return finalize({
        ok: false,
        query,
        providerName: smokeConfig.providerName,
        providerStatus,
        rawResultCount: 0,
        normalizedResultCount: 0,
        candidateCount: 0,
        readerStatus: "not_started",
        selectedPassageCount: 0,
        warnings,
        errors,
        diagnosticsSnapshot: {
          developerDiagnosticsOnly: true,
          oldSearchPathTouched: false,
          noteConversationTouched: false,
          providerName: smokeConfig.providerName,
          mode: "api",
          apiKeyRequired: true,
          providerStatus,
          redactedProviderRequest,
          providerBodyPreview,
          readerStarted: false,
        },
      });
    }

    redactedProviderRequest = providerTransport.redactedRequest;
    if (!providerTransport.bodyText.trim()) {
      providerStatus = "empty_result";
      errors.push("provider response body is empty");
    } else {
      try {
        const payload = JSON.parse(providerTransport.bodyText) as unknown;
        const normalized = normalizeRealProviderPayload({
          providerName: smokeConfig.providerName,
          payloadKind: smokeConfig.payloadKind ?? "unknown",
          payload,
          request: { request, policy, queryPlan, query: plannedQuery },
          providerPriority: smokeConfig.providerPriority,
          maxResults: maxCandidates,
        });
        rawResults = normalized.rawResults;
        rawResultCount = normalized.rawResults.length;
        warnings.push(...normalized.warnings);
        if (normalized.error) {
          providerStatus = normalized.rawResults.length > 0 ? "partial" : statusFromError(normalized.error);
          errors.push(normalized.error.message);
        } else {
          providerStatus = normalized.partial ? "partial" : "available";
        }
      } catch {
        providerStatus = "malformed_response";
        errors.push("provider response body is not valid JSON");
      }
    }
  }

  if (rawResults.length === 0 || providerStatus === "malformed_response" || providerStatus === "empty_result") {
    return finalize({
      ok: false,
      query,
      providerName: smokeConfig.providerName,
      providerStatus,
      rawResultCount,
      normalizedResultCount: 0,
      candidateCount: 0,
      readerStatus: "not_started",
      selectedPassageCount: 0,
      warnings: unique(warnings),
      errors,
      diagnosticsSnapshot: {
        developerDiagnosticsOnly: true,
        oldSearchPathTouched: false,
        noteConversationTouched: false,
        providerName: smokeConfig.mode === "keyless_bing" ? "keyless_bing" : smokeConfig.providerName,
        configuredProvider: smokeConfig.providerName,
        mode: smokeConfig.mode === "keyless_bing" ? "public_search" : "api",
        apiKeyRequired: smokeConfig.mode !== "keyless_bing",
        legacyBridgeName: smokeConfig.mode === "keyless_bing" ? "search_web_sources" : undefined,
        providerStatus,
        redactedProviderRequest,
        providerBodyPreview,
        keylessProviderDiagnostics,
        readerStarted: false,
      },
    });
  }

  const candidatePool = buildCandidatePool({
    request,
    policy,
    queryPlan,
    rawResults,
    config: { maxSelected: Math.max(readTopN, 1), perHostLimit: 1 },
  });
  const selectedCandidate = candidatePool.selectedCandidates[0];
  if (!selectedCandidate?.url) {
    return finalize({
      ok: false,
      query,
      providerName: smokeConfig.providerName,
      providerStatus: discoveryStatusFromProviderStatus(providerStatus),
      rawResultCount,
      normalizedResultCount: candidatePool.normalizedCount,
      candidateCount: candidatePool.dedupedCount,
      readerStatus: "not_started",
      selectedPassageCount: 0,
      warnings: unique([...warnings, "no_candidate_url"]),
      errors: ["No selected candidate URL was available; URL reader smoke was not started."],
      diagnosticsSnapshot: {
        developerDiagnosticsOnly: true,
        oldSearchPathTouched: false,
        noteConversationTouched: false,
        providerName: smokeConfig.mode === "keyless_bing" ? "keyless_bing" : smokeConfig.providerName,
        configuredProvider: smokeConfig.providerName,
        mode: smokeConfig.mode === "keyless_bing" ? "public_search" : "api",
        apiKeyRequired: smokeConfig.mode !== "keyless_bing",
        legacyBridgeName: smokeConfig.mode === "keyless_bing" ? "search_web_sources" : undefined,
        providerStatus,
        redactedProviderRequest,
        providerBodyPreview,
        keylessProviderDiagnostics,
        candidatePool: {
          rawCount: candidatePool.rawCount,
          normalizedCount: candidatePool.normalizedCount,
          dedupedCount: candidatePool.dedupedCount,
          selectedCount: candidatePool.selectedCount,
          rejectedCount: candidatePool.rejectedCount,
          hostDistribution: candidatePool.hostDistribution,
          sourceTypeDistribution: candidatePool.sourceTypeDistribution,
        },
        readerStarted: false,
      },
    });
  }

  const reader = await runResearchEngineRealUrlReaderSmoke({
    url: selectedCandidate.url,
    timeoutMs: DEFAULT_READER_TIMEOUT_MS,
  });
  const selectedCandidateSummary = {
    id: selectedCandidate.id,
    title: selectedCandidate.title,
    url: selectedCandidate.url,
    host: selectedCandidate.host,
    sourceType: selectedCandidate.sourceType,
    score: selectedCandidate.score,
  };

  if (!reader.ok) {
    return finalize({
      ok: false,
      query,
      providerName: smokeConfig.providerName,
      providerStatus: providerStatusFromReaderFailure(reader),
      rawResultCount,
      normalizedResultCount: candidatePool.normalizedCount,
      candidateCount: candidatePool.dedupedCount,
      selectedCandidate: selectedCandidateSummary,
      readerStatus: reader.status,
      readerQuality: reader.qualitySummary,
      selectedPassageCount: reader.selectedPassageCount,
      warnings: unique([...warnings, ...reader.warnings]),
      errors: reader.errors.length > 0 ? reader.errors : ["URL reader smoke did not produce readable evidence."],
      diagnosticsSnapshot: {
        developerDiagnosticsOnly: true,
        oldSearchPathTouched: false,
        noteConversationTouched: false,
        providerName: smokeConfig.mode === "keyless_bing" ? "keyless_bing" : smokeConfig.providerName,
        configuredProvider: smokeConfig.providerName,
        mode: smokeConfig.mode === "keyless_bing" ? "public_search" : "api",
        apiKeyRequired: smokeConfig.mode !== "keyless_bing",
        legacyBridgeName: smokeConfig.mode === "keyless_bing" ? "search_web_sources" : undefined,
        providerStatus: providerStatusFromReaderFailure(reader),
        redactedProviderRequest,
        providerBodyPreview,
        keylessProviderDiagnostics,
        candidatePool: {
          rawCount: candidatePool.rawCount,
          normalizedCount: candidatePool.normalizedCount,
          dedupedCount: candidatePool.dedupedCount,
          selectedCount: candidatePool.selectedCount,
          rejectedCount: candidatePool.rejectedCount,
          hostDistribution: candidatePool.hostDistribution,
          sourceTypeDistribution: candidatePool.sourceTypeDistribution,
        },
        selectedCandidate: selectedCandidateSummary,
        readerStatus: reader.status,
        readerDiagnostics: reader.diagnosticsSnapshot,
        excerptPreview: previewText(reader.excerptPreview, EXCERPT_PREVIEW_MAX_CHARS),
      },
    });
  }

  const evidenceInput = buildEvidenceInputs({ request, policy, queryPlan, candidate: selectedCandidate, reader });
  const packet = buildEvidencePacket({
    packetId: "developer-real-e2e-smoke-evidence-packet",
    request,
    policy,
    queryPlan,
    items: [evidenceInput],
  });
  const evidenceEvaluation = evaluateEvidencePacket({ packet });
  const answerContract = buildAnswerContract(evidenceEvaluation);
  const allWarnings = unique([
    ...warnings,
    ...reader.warnings,
    ...packet.missingEvidenceReasons,
    ...evidenceEvaluation.missingEvidenceReasons,
  ]);

  return finalize({
    ok: true,
    query,
    providerName: smokeConfig.providerName,
    providerStatus: discoveryStatusFromProviderStatus(providerStatus),
    rawResultCount,
    normalizedResultCount: candidatePool.normalizedCount,
    candidateCount: candidatePool.dedupedCount,
    selectedCandidate: selectedCandidateSummary,
    readerStatus: reader.status,
    readerQuality: reader.qualitySummary,
    selectedPassageCount: reader.selectedPassageCount,
    evidenceSummary: packet.evidenceSummary,
    answerContractMode: answerContract.answerMode,
    warnings: allWarnings,
    errors,
    diagnosticsSnapshot: {
      developerDiagnosticsOnly: true,
      oldSearchPathTouched: false,
      noteConversationTouched: false,
      readTopN,
      providerName: smokeConfig.mode === "keyless_bing" ? "keyless_bing" : smokeConfig.providerName,
      configuredProvider: smokeConfig.providerName,
      mode: smokeConfig.mode === "keyless_bing" ? "public_search" : "api",
      apiKeyRequired: smokeConfig.mode !== "keyless_bing",
      legacyBridgeName: smokeConfig.mode === "keyless_bing" ? "search_web_sources" : undefined,
      providerStatus,
      redactedProviderRequest,
      providerBodyPreview,
      keylessProviderDiagnostics,
      candidatePool: {
        rawCount: candidatePool.rawCount,
        normalizedCount: candidatePool.normalizedCount,
        dedupedCount: candidatePool.dedupedCount,
        selectedCount: candidatePool.selectedCount,
        rejectedCount: candidatePool.rejectedCount,
        hostDistribution: candidatePool.hostDistribution,
        sourceTypeDistribution: candidatePool.sourceTypeDistribution,
      },
      selectedCandidate: selectedCandidateSummary,
      readerStatus: reader.status,
      readerDiagnostics: reader.diagnosticsSnapshot,
      excerptPreview: previewText(reader.excerptPreview, EXCERPT_PREVIEW_MAX_CHARS),
      evidence: {
        status: packet.status,
        summary: packet.evidenceSummary,
        missingEvidenceReasons: packet.missingEvidenceReasons,
        citationIds: Object.keys(packet.citationMap),
      },
      contract: {
        answerMode: answerContract.answerMode,
        mustCite: answerContract.mustCite,
        allowedEvidenceCount: answerContract.allowedEvidenceIds.length,
        forbiddenClaimCount: answerContract.forbiddenClaims.length,
      },
    },
  });
};
