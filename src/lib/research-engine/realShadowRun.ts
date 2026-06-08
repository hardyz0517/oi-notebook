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
import type { AnswerMode, EvidenceItemBuildInput, EvidenceSummary } from "./evidenceTypes";
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

type ShadowProviderName = Extract<RealDiscoveryProviderName, "bing" | "bocha" | "brave">;

export type ResearchEngineRealShadowRunOptions = {
  query: string;
  webSearchConfig: WebSearchConfig | null;
  providerName?: ShadowProviderName;
  maxCandidates?: number;
  readTopN?: number;
  maxReadAttempts?: number;
  providerTimeoutMs?: number;
  readerTimeoutMs?: number;
  abortSignal?: AbortSignal;
};

export type ResearchEngineRealShadowRunStage = {
  stage: "provider" | "normalize" | "candidate_pool" | "reader" | "evidence" | "contract" | "abort";
  status: "completed" | "partial" | "failed" | "skipped" | "aborted";
  message: string;
  elapsedMs?: number;
};

export type ResearchEngineRealShadowRunCandidate = {
  id: string;
  title: string;
  url: string;
  host: string;
  sourceType: ExpectedSourceType | "seo_aggregator" | "unknown";
  score?: number;
};

export type ResearchEngineRealShadowRunReadAttempt = {
  candidate: ResearchEngineRealShadowRunCandidate;
  status: ResearchEngineRealUrlReaderSmokeResult["status"] | "skipped" | "aborted";
  httpStatus?: number;
  contentType?: string;
  readerTransport?: string;
  readerQuality?: ResearchEngineRealUrlReaderSmokeResult["qualitySummary"];
  selectedPassageCount: number;
  excerptPreview?: string;
  warnings: string[];
  errors: string[];
};

export type ResearchEngineRealShadowRunResult = {
  ok: boolean;
  query: string;
  providerName: RealDiscoveryProviderName | "none";
  providerStatus: DiscoveryProviderStatus | "not_configured" | "unsupported_provider" | "unauthorized" | "rate_limited" | "tauri_bridge_unavailable" | "malformed_response" | "parse_failed" | "empty_result" | "invalid_response" | "blocked_or_captcha" | "network_error" | "unsupported_environment" | "no_candidate_url" | "all_reader_failed" | "backend_reader_network_error" | "cors_or_reader_network_error" | "unknown_error" | "aborted";
  rawResultCount: number;
  normalizedResultCount: number;
  candidateCount: number;
  selectedCandidates: ResearchEngineRealShadowRunCandidate[];
  readAttempts: ResearchEngineRealShadowRunReadAttempt[];
  successfulReads: number;
  failedReads: number;
  evidenceSummary?: EvidenceSummary;
  answerContractMode?: AnswerMode;
  stageTimeline: ResearchEngineRealShadowRunStage[];
  warnings: string[];
  errors: string[];
  markdownReport: string;
  diagnosticsSnapshot: Record<string, unknown>;
};

const DEFAULT_QUERY = "OpenAI latest news";
const DEFAULT_PROVIDER_TIMEOUT_MS = 8_000;
const DEFAULT_READER_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_CANDIDATES = 8;
const DEFAULT_READ_TOP_N = 2;
const MAX_READ_TOP_N = 3;
const DEFAULT_NEWS_MAX_READ_ATTEMPTS = 4;
const DEFAULT_BROAD_NEWS_MAX_READ_ATTEMPTS = 6;
const MAX_READ_ATTEMPTS = 6;
const NEWS_PER_HOST_EVIDENCE_LIMIT = 1;
const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const EXCERPT_PREVIEW_MAX_CHARS = 1200;

const elapsedMsSince = (startedAt: number): number => Math.max(0, Math.round(performance.now() - startedAt));

const unique = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));

const previewText = (value: string | undefined, maxChars: number): string | undefined => {
  if (!value) return undefined;
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxChars ? `${compact.slice(0, maxChars)}...` : compact;
};

const isShadowProviderName = (value: string | undefined): value is ShadowProviderName =>
  value === "bing" || value === "bocha" || value === "brave";

const configForShadowRun = (
  config: WebSearchConfig | null,
  providerName?: ShadowProviderName,
): {
  providerName: ShadowProviderName;
  endpoint?: string;
  apiKey?: string;
  payloadKind?: RealProviderPayloadKind;
  providerPriority: number;
  mode: "keyless_bing" | "api";
} | undefined => {
  if (!config || !config.enabled || !config.publicSearchConsent) return undefined;
  const selectedProvider = providerName ?? (isShadowProviderName(config.provider) ? config.provider : undefined);
  if (selectedProvider === "bing") {
    return {
      providerName: "bing",
      providerPriority: 82,
      mode: "keyless_bing",
    };
  }
  if (selectedProvider === "bocha" && config.bochaApiKey.trim()) {
    return {
      providerName: "bocha",
      endpoint: config.bochaEndpoint.trim() || "https://api.bochaai.com/v1/web-search",
      apiKey: config.bochaApiKey.trim(),
      payloadKind: "bocha_like",
      providerPriority: 86,
      mode: "api",
    };
  }
  if (selectedProvider === "brave" && config.braveApiKey.trim()) {
    return {
      providerName: "brave",
      endpoint: BRAVE_ENDPOINT,
      apiKey: config.braveApiKey.trim(),
      payloadKind: "brave_like",
      providerPriority: 84,
      mode: "api",
    };
  }
  return undefined;
};

const unconfiguredWarningsFor = (
  config: WebSearchConfig | null,
  providerName?: ShadowProviderName,
): string[] => {
  if (!config) return ["Web search config is unavailable; real shadow run was not started."];
  if (!config.enabled) return ["Public web search is disabled; real shadow run was not started."];
  if (!config.publicSearchConsent) return ["Public search consent is disabled; real shadow run was not started."];
  const selectedProvider = providerName ?? config.provider;
  if (selectedProvider === "bing") {
    return [
      "Bing public search should use the Research Engine keyless Bing provider; real shadow run was not started because base web search config is unavailable.",
    ];
  }
  if (selectedProvider === "bocha" && !config.bochaApiKey.trim()) return ["Bocha API key is missing; API providers are optional. Research Engine mainline should use a no-key public provider such as Bing."];
  if (selectedProvider === "brave" && !config.braveApiKey.trim()) return ["Brave Search API key is missing; API providers are optional. Research Engine mainline should use a no-key public provider such as Bing."];
  return [
    "Only Bing keyless public search or configured optional API providers are supported for the real shadow run.",
  ];
};

const providerStatusFromError = (
  error: RealDiscoveryTransportError,
): ResearchEngineRealShadowRunResult["providerStatus"] => {
  if (error.kind === "unauthorized") return "unauthorized";
  if (error.kind === "rate_limited") return "rate_limited";
  if (error.kind === "malformed_response") return "malformed_response";
  if (error.kind === "empty_result") return "empty_result";
  if (error.kind === "unsupported_provider") return "unsupported_provider";
  if (error.kind === "timeout") return "timeout";
  return "failed";
};

const discoveryStatusFromProviderStatus = (
  status: ResearchEngineRealShadowRunResult["providerStatus"],
): DiscoveryProviderStatus => {
  if (status === "available") return "available";
  if (status === "partial") return "partial";
  if (status === "timeout") return "timeout";
  if (status === "not_configured" || status === "unsupported_provider") return "disabled";
  return "failed";
};

const providerStatusFromKeylessBingStatus = (
  status: Awaited<ReturnType<typeof runKeylessBingProvider>>["status"],
): ResearchEngineRealShadowRunResult["providerStatus"] => {
  if (status === "available") return "available";
  if (status === "partial") return "partial";
  if (status === "blocked_or_captcha") return "blocked_or_captcha";
  if (status === "timeout") return "timeout";
  if (status === "network_error") return "network_error";
  if (status === "tauri_bridge_unavailable") return "tauri_bridge_unavailable";
  if (status === "rate_limited") return "rate_limited";
  if (status === "parse_failed") return "parse_failed";
  if (status === "invalid_response") return "invalid_response";
  if (status === "unsupported_environment") return "unsupported_environment";
  if (status === "empty_result") return "empty_result";
  if (status === "unknown_error") return "unknown_error";
  return status;
};

const providerStatusFromReaderFailures = (
  readAttempts: ResearchEngineRealShadowRunReadAttempt[],
): ResearchEngineRealShadowRunResult["providerStatus"] =>
  readAttempts.some((attempt) => attempt.status === "backend_network_error")
    ? "backend_reader_network_error"
    : readAttempts.some((attempt) => attempt.status === "network_error")
      ? "cors_or_reader_network_error"
      : "all_reader_failed";

const clampReadTopN = (value: number | undefined): number =>
  Math.max(1, Math.min(value ?? DEFAULT_READ_TOP_N, MAX_READ_TOP_N));

const clampMaxCandidates = (value: number | undefined): number =>
  Math.max(1, Math.min(value ?? DEFAULT_MAX_CANDIDATES, 10));

const clampMaxReadAttempts = (
  value: number | undefined,
  readTopN: number,
  newsMode: boolean,
  broadNewsDigest: boolean,
): number => {
  const defaultValue = broadNewsDigest ? DEFAULT_BROAD_NEWS_MAX_READ_ATTEMPTS : newsMode ? DEFAULT_NEWS_MAX_READ_ATTEMPTS : readTopN;
  return Math.max(readTopN, Math.min(value ?? defaultValue, MAX_READ_ATTEMPTS));
};

const isBroadNewsDigestQuery = (query: string): boolean =>
  /\b(world news|international news|global news|major world events|world events|what happened in the world)\b/i.test(query) ||
  /\u56fd\u9645(?:\u5927\u4e8b|\u65b0\u95fb|\u8981\u95fb)|\u4e16\u754c(?:\u5927\u4e8b|\u65b0\u95fb|\u8981\u95fb)|\u5168\u7403\u8981\u95fb|\u56fd\u9645\u70ed\u70b9|\u4e16\u754c.*\u53d1\u751f/.test(query);

const hostCount = (items: EvidenceItemBuildInput[]): Record<string, number> =>
  items.reduce((acc, item) => {
    const host = item.candidate?.host;
    if (!host) return acc;
    return { ...acc, [host]: (acc[host] ?? 0) + 1 };
  }, {} as Record<string, number>);

const candidateSummary = (candidate: CandidateSource): ResearchEngineRealShadowRunCandidate => ({
  id: candidate.id,
  title: candidate.title,
  url: candidate.url,
  host: candidate.host,
  sourceType: candidate.sourceType,
  score: candidate.score,
});

const makeRequestContext = (
  query: string,
): {
  request: ResearchSearchRequest;
  policy: SearchPolicyDecision;
  queryPlan: QueryPlan;
} => {
  const request: ResearchSearchRequest = {
    requestId: "developer-real-shadow-run",
    userQuestion: query,
    locale: "auto",
    options: {
      allowPublicWeb: true,
      offlineOnly: false,
      maxQueries: 4,
    },
    extensions: {
      developerDiagnosticsOnly: true,
      phase15RealShadowRun: true,
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

const evidenceInputFromRead = (
  input: {
    request: ResearchSearchRequest;
    policy: SearchPolicyDecision;
    queryPlan: QueryPlan;
    candidate: CandidateSource;
    reader: ResearchEngineRealUrlReaderSmokeResult;
  },
): EvidenceItemBuildInput => {
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
        id: `real-shadow-excerpt-preview:${input.candidate.id}`,
        type: "paragraph",
        text: excerptMarkdown,
        charLength: excerptMarkdown.length,
        tokenEstimate: Math.ceil(excerptMarkdown.length / 4),
        isComplete: true,
        language: input.candidate.language,
      }],
      textCharLength: excerptMarkdown.length,
      diagnostics: {
        phase15RealShadowRun: true,
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
      phase15RealShadowRun: true,
      httpStatus: input.reader.httpStatus,
      contentType: input.reader.contentType,
      bodyBytes: input.reader.bodyBytes,
    },
  };
  const excerptWarnings = warningForReaderStatus(input.reader.status);
  const readerQuality: ReaderQualityEvaluation = {
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
  return { readerResult, readerQuality, excerpt, candidate: input.candidate };
};

const buildMarkdownReport = (result: Omit<ResearchEngineRealShadowRunResult, "markdownReport">): string => {
  const lines = [
    "# Research Engine Real Shadow Run",
    "",
    "## Summary",
    `- ok: ${result.ok}`,
    `- query: ${result.query}`,
    `- provider: ${result.diagnosticsSnapshot.keylessProviderDiagnostics ? "keyless_bing" : result.providerName}`,
    `- providerStatus: ${result.providerStatus}`,
    `- apiKeyRequired: ${result.diagnosticsSnapshot.keylessProviderDiagnostics ? "no" : result.providerName === "bocha" || result.providerName === "brave" ? "yes" : "unknown"}`,
    `- mode: ${result.diagnosticsSnapshot.keylessProviderDiagnostics ? "public_search" : "api"}`,
    `- legacyBridge: ${result.diagnosticsSnapshot.keylessProviderDiagnostics ? "search_web_sources" : "none"}`,
    `- rawResultCount: ${result.rawResultCount}`,
    `- normalizedResultCount: ${result.normalizedResultCount}`,
    `- candidateCount: ${result.candidateCount}`,
    `- selectedCandidates: ${result.selectedCandidates.length}`,
    `- readAttempts: ${result.readAttempts.length}`,
    `- successfulReads: ${result.successfulReads}`,
    `- failedReads: ${result.failedReads}`,
    `- answerContractMode: ${result.answerContractMode ?? "none"}`,
    "",
    "## Selected Candidates",
    ...(result.selectedCandidates.length > 0
      ? result.selectedCandidates.map((candidate, index) => `- ${index + 1}. ${candidate.title} (${candidate.host}) ${candidate.url}`)
      : ["- none"]),
    "",
    "## Read Attempts",
    ...(result.readAttempts.length > 0
      ? result.readAttempts.map((attempt, index) => [
        `### ${index + 1}. ${attempt.candidate.title}`,
        `- url: ${attempt.candidate.url}`,
        `- status: ${attempt.status}`,
        `- readerTransport: ${attempt.readerTransport ?? "none"}`,
        `- httpStatus: ${attempt.httpStatus ?? "none"}`,
        `- contentType: ${attempt.contentType ?? "none"}`,
        `- quality: ${attempt.readerQuality?.quality ?? "none"}`,
        `- selectedPassageCount: ${attempt.selectedPassageCount}`,
        `- excerptPreview: ${attempt.excerptPreview ?? "none"}`,
      ].join("\n"))
      : ["- none"]),
    "",
    "## Evidence Summary",
    result.evidenceSummary
      ? [
        `- strong: ${result.evidenceSummary.strongCount}`,
        `- medium: ${result.evidenceSummary.mediumCount}`,
        `- weak: ${result.evidenceSummary.weakCount}`,
        `- none: ${result.evidenceSummary.noneCount}`,
        `- citeable: ${result.evidenceSummary.citeableCount}`,
        `- conflicts: ${result.evidenceSummary.conflictCount}`,
      ].join("\n")
      : "- none",
    "",
    "## Timeline",
    ...(result.stageTimeline.length > 0
      ? result.stageTimeline.map((stage) => `- ${stage.stage}: ${stage.status}; ${stage.message}; elapsedMs=${stage.elapsedMs ?? "n/a"}`)
      : ["- none"]),
    "",
    "## Warnings",
    ...(result.warnings.length > 0 ? result.warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
    "## Errors",
    ...(result.errors.length > 0 ? result.errors.map((error) => `- ${error}`) : ["- none"]),
    "",
    "## Security Notes",
    "- Developer Diagnostics manual shadow run only.",
    "- 当前使用无 key Bing 公共搜索时，只通过 search_web_sources 旧 bridge 做诊断传输。",
    "- 失败不会回退旧 NoteX 搜索；请根据 providerStatus、timeline 和 reader status 继续修复 Research Engine。",
    "- Provider request secrets are redacted.",
    "- URL reader uses the Tauri backend public URL reader with credentials omitted.",
    "- No cookies, Authorization, full request body, full raw provider response, or full page body are included.",
    "- CORS, login, captcha, and paywall restrictions are not bypassed.",
  ];
  return lines.join("\n");
};

const finalize = (
  result: Omit<ResearchEngineRealShadowRunResult, "markdownReport">,
): ResearchEngineRealShadowRunResult => ({
  ...result,
  markdownReport: buildMarkdownReport(result),
});

export const runResearchEngineRealShadowRun = async (
  options: ResearchEngineRealShadowRunOptions,
): Promise<ResearchEngineRealShadowRunResult> => {
  const query = options.query.trim() || DEFAULT_QUERY;
  const readTopN = clampReadTopN(options.readTopN);
  const maxCandidates = clampMaxCandidates(options.maxCandidates);
  const requestedProvider = options.providerName ?? (options.webSearchConfig?.provider as RealDiscoveryProviderName | undefined) ?? "none";
  const timeline: ResearchEngineRealShadowRunStage[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  const aborted = (): boolean => Boolean(options.abortSignal?.aborted);
  const mark = (
    stage: ResearchEngineRealShadowRunStage["stage"],
    status: ResearchEngineRealShadowRunStage["status"],
    message: string,
    startedAt?: number,
  ) => {
    timeline.push({ stage, status, message, elapsedMs: typeof startedAt === "number" ? elapsedMsSince(startedAt) : undefined });
  };

  if (aborted()) {
    mark("abort", "aborted", "Shadow run aborted before provider request.");
    return finalize({
      ok: false,
      query,
      providerName: requestedProvider,
      providerStatus: "aborted",
      rawResultCount: 0,
      normalizedResultCount: 0,
      candidateCount: 0,
      selectedCandidates: [],
      readAttempts: [],
      successfulReads: 0,
      failedReads: 0,
      stageTimeline: timeline,
      warnings,
      errors: ["real shadow run aborted before provider request"],
      diagnosticsSnapshot: {
        developerDiagnosticsOnly: true,
        oldSearchPathTouched: false,
        noteConversationTouched: false,
        aborted: true,
      },
    });
  }

  const shadowConfig = configForShadowRun(options.webSearchConfig, options.providerName);
  if (!shadowConfig) {
    return finalize({
      ok: false,
      query,
      providerName: requestedProvider,
      providerStatus: "not_configured",
      rawResultCount: 0,
      normalizedResultCount: 0,
      candidateCount: 0,
      selectedCandidates: [],
      readAttempts: [],
      successfulReads: 0,
      failedReads: 0,
      stageTimeline: timeline,
      warnings: unconfiguredWarningsFor(options.webSearchConfig, options.providerName),
      errors: ["real shadow run is not configured for the current web search settings"],
      diagnosticsSnapshot: {
        developerDiagnosticsOnly: true,
        oldSearchPathTouched: false,
        noteConversationTouched: false,
        realProviderConfigured: false,
        readTopN,
        maxCandidates,
      },
    });
  }

  const { request, policy, queryPlan } = makeRequestContext(query);
  const broadNewsDigest = isBroadNewsDigestQuery(query);
  const newsMode = policy.mode === "news_recent";
  const hostDiversityApplied = newsMode;
  const maxReadAttempts = clampMaxReadAttempts(options.maxReadAttempts, readTopN, newsMode, broadNewsDigest);
  const plannedQuery = queryPlan.queries[0] ?? {
    query,
    language: policy.locale,
    purpose: "recall" as const,
    priority: 100,
    expectedSourceTypes: ["official" as const, "mainstream_news" as const],
  };
  const providerStartedAt = performance.now();
  let providerStatus: ResearchEngineRealShadowRunResult["providerStatus"] = "failed";
  let rawResults: DiscoveryRawResult[] = [];
  let providerRawResultCount = 0;
  let providerNormalizedResultCount = 0;
  let providerDroppedResultCount = 0;
  let redactedProviderRequest: BrowserProviderRedactedRequest | undefined;
  let providerBodyPreview: string | undefined;
  let keylessProviderDiagnostics: Record<string, unknown> | undefined;

  if (shadowConfig.mode === "keyless_bing") {
    const keyless = await runKeylessBingProvider({
      query: plannedQuery.query,
      rawUserQuery: query,
      queryPurpose: plannedQuery.purpose,
      queryLanguage: plannedQuery.language,
      plannedQueries: queryPlan.queries,
      maxResults: maxCandidates,
      timeoutMs: options.providerTimeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS,
    });
    rawResults = keyless.rawResults;
    providerRawResultCount = keyless.diagnostics.rawBridgeResultCount;
    providerNormalizedResultCount = keyless.diagnostics.normalizedResultCount;
    providerDroppedResultCount = keyless.diagnostics.droppedResultCount;
    warnings.push(...keyless.warnings);
    errors.push(...keyless.errors);
    keylessProviderDiagnostics = keyless.diagnostics;
    providerStatus = providerStatusFromKeylessBingStatus(keyless.status);
    mark("provider", keyless.ok ? "completed" : "failed", `Keyless Bing public search: ${keyless.status}; results=${rawResults.length}`, providerStartedAt);
  } else {
    const providerTransport = await runBrowserProviderSmokeRequest({
      providerName: shadowConfig.providerName as Extract<ShadowProviderName, "bocha" | "brave">,
      endpoint: shadowConfig.endpoint ?? "",
      apiKey: shadowConfig.apiKey ?? "",
      query: plannedQuery.query,
      maxResults: maxCandidates,
      timeoutMs: options.providerTimeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS,
    });
    redactedProviderRequest = providerTransport.redactedRequest;
    providerBodyPreview = providerTransport.bodyPreview;

    if (!providerTransport.ok) {
      providerStatus = providerStatusFromError(providerTransport.error);
      errors.push(providerTransport.error.message);
      mark("provider", "failed", providerTransport.error.message, providerStartedAt);
      return finalize({
        ok: false,
        query,
        providerName: shadowConfig.providerName,
        providerStatus,
        rawResultCount: 0,
        normalizedResultCount: 0,
        candidateCount: 0,
        selectedCandidates: [],
        readAttempts: [],
        successfulReads: 0,
        failedReads: 0,
        stageTimeline: timeline,
        warnings,
        errors,
        diagnosticsSnapshot: {
          developerDiagnosticsOnly: true,
          oldSearchPathTouched: false,
          noteConversationTouched: false,
          providerStatus,
          redactedProviderRequest,
          providerBodyPreview,
          readTopN,
          maxCandidates,
        },
      });
    }
    mark("provider", "completed", `Provider HTTP ${providerTransport.statusCode}`, providerStartedAt);

    const normalizeStartedAt = performance.now();
    if (!providerTransport.bodyText.trim()) {
      providerStatus = "empty_result";
      errors.push("provider response body is empty");
      mark("normalize", "failed", "Provider response body is empty.", normalizeStartedAt);
    } else {
      try {
        const payload = JSON.parse(providerTransport.bodyText) as unknown;
        const normalized = normalizeRealProviderPayload({
          providerName: shadowConfig.providerName,
          payloadKind: shadowConfig.payloadKind ?? "unknown",
          payload,
          request: { request, policy, queryPlan, query: plannedQuery },
          providerPriority: shadowConfig.providerPriority,
          maxResults: maxCandidates,
        });
        rawResults = normalized.rawResults;
        providerRawResultCount = normalized.rawResults.length;
        providerNormalizedResultCount = normalized.rawResults.length;
        providerDroppedResultCount = 0;
        warnings.push(...normalized.warnings);
        if (normalized.error) {
          providerStatus = normalized.rawResults.length > 0 ? "partial" : providerStatusFromError(normalized.error);
          errors.push(normalized.error.message);
        } else {
          providerStatus = normalized.partial ? "partial" : "available";
        }
        mark("normalize", normalized.rawResults.length > 0 ? "completed" : "failed", `${normalized.rawResults.length} normalized results`, normalizeStartedAt);
      } catch {
        providerStatus = "malformed_response";
        errors.push("provider response body is not valid JSON");
        mark("normalize", "failed", "Provider response body is not valid JSON.", normalizeStartedAt);
      }
    }
  }

  if (aborted()) {
    mark("abort", "aborted", "Shadow run aborted after provider response; no URL reader requests were started.");
    return finalize({
      ok: false,
      query,
      providerName: shadowConfig.providerName,
      providerStatus: "aborted",
      rawResultCount: 0,
      normalizedResultCount: providerNormalizedResultCount,
      candidateCount: 0,
      selectedCandidates: [],
      readAttempts: [],
      successfulReads: 0,
      failedReads: 0,
      stageTimeline: timeline,
      warnings,
      errors: ["real shadow run aborted after provider response"],
      diagnosticsSnapshot: {
        developerDiagnosticsOnly: true,
        oldSearchPathTouched: false,
        noteConversationTouched: false,
        aborted: true,
        redactedProviderRequest,
        providerBodyPreview,
        keylessProviderDiagnostics,
        readTopN,
        maxCandidates,
      },
    });
  }

  if (
    rawResults.length === 0 ||
    providerStatus === "malformed_response" ||
    providerStatus === "empty_result" ||
    providerStatus === "parse_failed" ||
    providerStatus === "invalid_response" ||
    providerStatus === "tauri_bridge_unavailable" ||
    providerStatus === "blocked_or_captcha" ||
    providerStatus === "rate_limited" ||
    providerStatus === "network_error" ||
    providerStatus === "timeout" ||
    providerStatus === "unsupported_environment" ||
    providerStatus === "unknown_error"
  ) {
    return finalize({
      ok: false,
      query,
      providerName: shadowConfig.providerName,
      providerStatus,
      rawResultCount: providerRawResultCount || rawResults.length,
      normalizedResultCount: providerNormalizedResultCount,
      candidateCount: 0,
      selectedCandidates: [],
      readAttempts: [],
      successfulReads: 0,
      failedReads: 0,
      stageTimeline: timeline,
      warnings: unique(warnings),
      errors,
      diagnosticsSnapshot: {
        developerDiagnosticsOnly: true,
        oldSearchPathTouched: false,
        noteConversationTouched: false,
        providerStatus,
        redactedProviderRequest,
        providerBodyPreview,
        keylessProviderDiagnostics,
        providerRawResultCount: providerRawResultCount || rawResults.length,
        providerNormalizedResultCount,
        providerDroppedResultCount,
        readTopN,
        maxCandidates,
      },
    });
  }

  const candidateStartedAt = performance.now();
  const candidatePool = buildCandidatePool({
    request,
    policy,
    queryPlan,
    rawResults,
    config: {
      maxSelected: maxCandidates,
      perHostLimit: hostDiversityApplied ? 1 : 2,
      diversity: {
        maxSelected: maxCandidates,
        perHostLimit: hostDiversityApplied ? 1 : 2,
        preferredSourceTypes: ["mainstream_news", "official", "tech_media", "docs", "community"],
        minClusterRepresentatives: broadNewsDigest ? 4 : 2,
      },
    },
  });
  const selectedCandidates = candidatePool.selectedCandidates.map(candidateSummary);
  mark("candidate_pool", candidatePool.selectedCount > 0 ? "completed" : "failed", `${candidatePool.selectedCount} selected candidates`, candidateStartedAt);

  if (selectedCandidates.length === 0) {
    return finalize({
      ok: false,
      query,
      providerName: shadowConfig.providerName,
      providerStatus: "no_candidate_url",
      rawResultCount: providerRawResultCount || rawResults.length,
      normalizedResultCount: candidatePool.normalizedCount,
      candidateCount: candidatePool.dedupedCount,
      selectedCandidates,
      readAttempts: [],
      successfulReads: 0,
      failedReads: 0,
      stageTimeline: timeline,
      warnings: unique([...warnings, "no_candidate_url"]),
      errors: ["No selected candidate URL was available; URL reader shadow run was not started."],
      diagnosticsSnapshot: {
        developerDiagnosticsOnly: true,
        oldSearchPathTouched: false,
        noteConversationTouched: false,
        providerStatus: "no_candidate_url",
        redactedProviderRequest,
        providerBodyPreview,
        keylessProviderDiagnostics,
        providerRawResultCount: providerRawResultCount || rawResults.length,
        providerNormalizedResultCount: providerNormalizedResultCount || candidatePool.normalizedCount,
        providerDroppedResultCount,
        readTopN,
        maxCandidates,
        candidatePool: {
          rawCount: candidatePool.rawCount,
          normalizedCount: candidatePool.normalizedCount,
          dedupedCount: candidatePool.dedupedCount,
          selectedCount: candidatePool.selectedCount,
          rejectedCount: candidatePool.rejectedCount,
          hostDistribution: candidatePool.hostDistribution,
          sourceTypeDistribution: candidatePool.sourceTypeDistribution,
        },
      },
    });
  }

  const readAttempts: ResearchEngineRealShadowRunReadAttempt[] = [];
  const evidenceItems: EvidenceItemBuildInput[] = [];
  const skippedSameHostEvidence: string[] = [];
  const candidatesToRead = candidatePool.selectedCandidates.slice(0, maxReadAttempts);
  for (const candidate of candidatesToRead) {
    const summary = candidateSummary(candidate);
    if (aborted()) {
      readAttempts.push({
        candidate: summary,
        status: "aborted",
        selectedPassageCount: 0,
        warnings: [],
        errors: ["real shadow run aborted before this URL reader request"],
      });
      mark("abort", "aborted", "Shadow run aborted before starting the next URL reader request.");
      break;
    }
    if (!candidate.url) {
      readAttempts.push({
        candidate: summary,
        status: "skipped",
        selectedPassageCount: 0,
        warnings: ["no_candidate_url"],
        errors: ["Candidate URL is empty."],
      });
      mark("reader", "skipped", `Skipped candidate without URL: ${candidate.id}`);
      continue;
    }
    const readerStartedAt = performance.now();
    const reader = await runResearchEngineRealUrlReaderSmoke({
      url: candidate.url,
      timeoutMs: options.readerTimeoutMs ?? DEFAULT_READER_TIMEOUT_MS,
    });
    const attempt: ResearchEngineRealShadowRunReadAttempt = {
      candidate: summary,
      status: reader.status,
      httpStatus: reader.httpStatus,
      contentType: reader.contentType,
      readerTransport: typeof reader.diagnosticsSnapshot.readerTransport === "string" ? reader.diagnosticsSnapshot.readerTransport : undefined,
      readerQuality: reader.qualitySummary,
      selectedPassageCount: reader.selectedPassageCount,
      excerptPreview: previewText(reader.excerptPreview, EXCERPT_PREVIEW_MAX_CHARS),
      warnings: reader.warnings,
      errors: reader.errors,
    };
    readAttempts.push(attempt);
    mark("reader", reader.ok ? "completed" : reader.status === "validation_failed" ? "skipped" : "failed", `${candidate.host}: ${reader.status}`, readerStartedAt);
    if (reader.ok) {
      const existingHostCount = hostCount(evidenceItems)[candidate.host] ?? 0;
      if (hostDiversityApplied && existingHostCount >= NEWS_PER_HOST_EVIDENCE_LIMIT) {
        skippedSameHostEvidence.push(candidate.host);
        attempt.warnings = unique([...attempt.warnings, "source_diversity_same_host_evidence_skipped"]);
      } else {
        evidenceItems.push(evidenceInputFromRead({ request, policy, queryPlan, candidate, reader }));
      }
      if (evidenceItems.length >= readTopN) break;
    }
  }

  const evidenceStartedAt = performance.now();
  const packet = buildEvidencePacket({
    packetId: "developer-real-shadow-run-evidence-packet",
    request,
    policy,
    queryPlan,
    items: evidenceItems,
  });
  const evaluation = evaluateEvidencePacket({ packet });
  mark("evidence", evidenceItems.length > 0 ? "completed" : "failed", `${evidenceItems.length} evidence items`, evidenceStartedAt);

  const contractStartedAt = performance.now();
  const answerContract = buildAnswerContract(evaluation);
  mark("contract", "completed", `answerMode=${answerContract.answerMode}`, contractStartedAt);

  const successfulReads = readAttempts.filter((attempt) => attempt.status === "fetched" || attempt.status === "partial" || attempt.status === "body_too_large").length;
  const failedReads = readAttempts.filter((attempt) => attempt.status !== "fetched" && attempt.status !== "partial" && attempt.status !== "body_too_large").length;
  const abortedRun = readAttempts.some((attempt) => attempt.status === "aborted") || aborted();
  const allWarnings = unique([
    ...warnings,
    ...readAttempts.flatMap((attempt) => attempt.warnings),
    ...packet.missingEvidenceReasons,
    ...evaluation.missingEvidenceReasons,
    ...(readTopN !== (options.readTopN ?? DEFAULT_READ_TOP_N) ? [`readTopN_clamped_to_${readTopN}`] : []),
    ...(maxReadAttempts > readTopN ? [`reader_continue_after_failure_enabled:maxReadAttempts=${maxReadAttempts}`] : []),
    ...(hostDiversityApplied ? ["host_diversity_applied:perHostEvidenceLimit=1"] : []),
    ...(broadNewsDigest ? ["news_query_mode:broad_news_digest"] : []),
    ...(skippedSameHostEvidence.length > 0 ? [`source_diversity_same_host_skipped:${unique(skippedSameHostEvidence).join(",")}`] : []),
  ]);
  const allErrors = unique([
    ...errors,
    ...readAttempts.flatMap((attempt) => attempt.errors),
    ...(abortedRun ? ["real shadow run aborted"] : []),
  ]);

  const finalProviderStatus: ResearchEngineRealShadowRunResult["providerStatus"] = abortedRun
    ? "aborted"
    : successfulReads > 0
      ? discoveryStatusFromProviderStatus(providerStatus)
      : providerStatusFromReaderFailures(readAttempts);

  return finalize({
    ok: successfulReads > 0 && !abortedRun,
    query,
    providerName: shadowConfig.providerName,
    providerStatus: finalProviderStatus,
    rawResultCount: providerRawResultCount || rawResults.length,
    normalizedResultCount: candidatePool.normalizedCount,
    candidateCount: candidatePool.dedupedCount,
    selectedCandidates,
    readAttempts,
    successfulReads,
    failedReads,
    evidenceSummary: packet.evidenceSummary,
    answerContractMode: answerContract.answerMode,
    stageTimeline: timeline,
    warnings: allWarnings,
    errors: allErrors,
    diagnosticsSnapshot: {
      developerDiagnosticsOnly: true,
      oldSearchPathTouched: false,
      noteConversationTouched: false,
      readTopN,
      maxReadAttempts,
      newsQueryMode: broadNewsDigest ? "broad_news_digest" : newsMode ? "entity_news" : "not_news",
      hostDiversityApplied,
      perHostEvidenceLimit: hostDiversityApplied ? NEWS_PER_HOST_EVIDENCE_LIMIT : "none",
      sourceDiversityLow: hostDiversityApplied && Object.keys(hostCount(evidenceItems)).length < Math.min(readTopN, evidenceItems.length || readTopN),
      evidenceHostDistribution: hostCount(evidenceItems),
      skippedSameHostEvidenceHosts: unique(skippedSameHostEvidence),
      maxCandidates,
      maxReadTopN: MAX_READ_TOP_N,
      providerStatus: finalProviderStatus,
      redactedProviderRequest,
      providerBodyPreview,
      keylessProviderDiagnostics,
      providerRawResultCount: providerRawResultCount || rawResults.length,
      providerNormalizedResultCount: providerNormalizedResultCount || candidatePool.normalizedCount,
      providerDroppedResultCount,
      candidatePool: {
        rawCount: candidatePool.rawCount,
        normalizedCount: candidatePool.normalizedCount,
        dedupedCount: candidatePool.dedupedCount,
        selectedCount: candidatePool.selectedCount,
        rejectedCount: candidatePool.rejectedCount,
        hostDistribution: candidatePool.hostDistribution,
        sourceTypeDistribution: candidatePool.sourceTypeDistribution,
      },
      selectedCandidates,
      readAttempts,
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
      stageTimeline: timeline,
    },
  });
};
