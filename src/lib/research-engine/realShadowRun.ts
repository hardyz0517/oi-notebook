import type { WebSearchConfig } from "@/lib/aiWebSearch";
import { buildAnswerContract } from "./answerContract";
import { buildCandidatePool } from "./candidatePool";
import { runConcurrentReader } from "./concurrentReader";
import { buildEvidencePacket } from "./evidencePacket";
import { evaluateEvidencePacket } from "./evidenceEvaluator";
import { evaluateEvidencePortfolioGate } from "./evidencePortfolioGate";
import { assessEvidenceQuality, summarizeEvidenceQuality, type EvidenceQualityTier, type EvidenceSourceRole, type OiTopicalityAssessment, type OiTopicalitySignal } from "./evidenceQuality";
import { buildFreshnessWindowPolicy, type DateConfidence, type DateSignalSource, type FreshnessStatus } from "./dateSignals";
import { evaluateFreshnessGate } from "./freshnessGate";
import { runKeylessBingProvider } from "./keylessBingProvider";
import { runLlmResearchPlanner } from "./llmResearchPlanner";
import { buildNewsSynthesisPlan, type NewsSynthesisItemConfidence } from "./newsSynthesisPlan";
import { normalizeRealProviderPayload } from "./providerResponseNormalizer";
import { buildQueryPlan } from "./queryPlanner";
import { runBrowserProviderSmokeRequest, type BrowserProviderRedactedRequest } from "./browserProviderTransport";
import type { ResearchEngineRealUrlReaderSmokeResult } from "./realUrlReaderSmoke";
import { buildSearchCoveragePlan } from "./searchCoveragePlanner";
import { buildSearchPolicyDecision } from "./searchPolicy";
import { buildSourcePortfolio, canonicalizePortfolioHost, type SourcePortfolioQueryMode } from "./sourcePortfolio";
import { buildDirectOiDiscoveryResults, normalizeOiSearchQuery } from "./oiDiscovery";
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
  providerId?: string;
  modelId?: string;
  abortSignal?: AbortSignal;
};

export type ResearchEngineRealShadowRunStage = {
  stage: "planner" | "provider" | "normalize" | "candidate_pool" | "source_portfolio" | "reader" | "evidence" | "contract" | "abort";
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
  evidenceId?: string;
  whyRead?: string;
  whySkipped?: string;
  httpStatus?: number;
  contentType?: string;
  readerTransport?: string;
  readerQuality?: ResearchEngineRealUrlReaderSmokeResult["qualitySummary"];
  facet?: string;
  evidenceTextLevel?: "body_excerpt" | "snippet_only" | "title_only" | "none";
  evidenceQualityScore?: number;
  evidenceQualityTier?: EvidenceQualityTier;
  sourceRole?: EvidenceSourceRole;
  oiTopicalityScore?: number;
  oiTopicalityMatchedSignals?: OiTopicalitySignal[];
  oiTopicalityRejectedReason?: OiTopicalityAssessment["rejectedReason"];
  acceptedByOiEvidenceGate?: boolean;
  hasConcreteEvent?: boolean;
  hasDateSignal?: boolean;
  dateSignal?: string;
  publishedDate?: string;
  dateSignalSource?: DateSignalSource;
  dateConfidence?: DateConfidence;
  ageDays?: number;
  freshnessStatus?: FreshnessStatus;
  freshnessReason?: string;
  rejectedByFreshness?: boolean;
  facetFitScore?: number;
  whyQualityAccepted?: string[];
  whyQualityDowngraded?: string[];
  synthesisSelected?: boolean;
  synthesisItemTitle?: string;
  synthesisSummaryHint?: string;
  synthesisConfidence?: NewsSynthesisItemConfidence;
  errorKind?: string;
  excerptLength?: number;
  elapsedMs?: number;
  selectedPassageCount: number;
  excerptPreview?: string;
  warnings: string[];
  errors: string[];
};

export type ResearchEngineRealShadowRunResult = {
  ok: boolean;
  query: string;
  providerName: RealDiscoveryProviderName | "none";
  providerStatus: DiscoveryProviderStatus | "not_configured" | "unsupported_provider" | "unauthorized" | "rate_limited" | "tauri_bridge_unavailable" | "malformed_response" | "parse_failed" | "empty_result" | "invalid_response" | "blocked_or_captcha" | "network_error" | "unsupported_environment" | "no_candidate_url" | "all_reader_failed" | "backend_reader_network_error" | "cors_or_reader_network_error" | "source_diversity_failed" | "insufficient_evidence" | "unknown_error" | "aborted";
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
const DEFAULT_MAX_CANDIDATES = 24;
const DEFAULT_READ_TOP_N = 2;
const MAX_READ_TOP_N = 3;
const MAX_READ_ATTEMPTS = 36;
const NEWS_PER_HOST_EVIDENCE_LIMIT = 1;
const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const EXCERPT_PREVIEW_MAX_CHARS = 1200;

const elapsedMsSince = (startedAt: number): number => Math.max(0, Math.round(performance.now() - startedAt));

const unique = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));

const recordFromUnknown = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

const firstString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
};

const previewText = (value: string | undefined, maxChars: number): string | undefined => {
  if (!value) return undefined;
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxChars ? `${compact.slice(0, maxChars)}...` : compact;
};

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
  const selectedProvider = providerName ?? "bing";
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
  const selectedProvider = providerName ?? "bing";
  if (selectedProvider === "bing") {
    return [
      "Bing public search should use the Research Engine keyless Bing provider; real shadow run was not started because base web search config is unavailable.",
    ];
  }
  if (selectedProvider === "bocha" && !config.bochaApiKey.trim()) return ["Optional API provider is unavailable. Research Engine mainline remains no-key public search."];
  if (selectedProvider === "brave" && !config.braveApiKey.trim()) return ["Optional API provider is unavailable. Research Engine mainline remains no-key public search."];
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

const clampMaxCandidates = (value: number | undefined, newsMode = false, broadNewsDigest = false): number => {
  const defaultValue = broadNewsDigest ? 30 : newsMode ? 30 : DEFAULT_MAX_CANDIDATES;
  const requested = value ?? defaultValue;
  const minimum = broadNewsDigest ? 30 : newsMode ? 30 : 1;
  return Math.max(minimum, Math.min(requested, broadNewsDigest || newsMode ? 36 : DEFAULT_MAX_CANDIDATES));
};

const isBroadNewsDigestQuery = (query: string): boolean =>
  /\b(world news|international news|global news|major world events|world events|what happened in the world)\b/i.test(query) ||
  /\u56fd\u9645(?:\u5927\u4e8b|\u65b0\u95fb|\u8981\u95fb)|\u4e16\u754c(?:\u5927\u4e8b|\u65b0\u95fb|\u8981\u95fb)|\u5168\u7403\u8981\u95fb|\u56fd\u9645\u70ed\u70b9|\u4e16\u754c.*\u53d1\u751f/.test(query);

const hostCount = (items: EvidenceItemBuildInput[]): Record<string, number> =>
  items.reduce((acc, item) => {
    const host = canonicalizePortfolioHost(item.candidate?.host);
    if (!host) return acc;
    return { ...acc, [host]: (acc[host] ?? 0) + 1 };
  }, {} as Record<string, number>);

const directDiscoveryRoleForCandidate = (candidate: CandidateSource | undefined): string | undefined => {
  const direct = candidate?.extensions?.directDiscovery;
  if (!direct || typeof direct !== "object" || Array.isArray(direct)) return undefined;
  const role = (direct as Record<string, unknown>).sourceRole;
  return typeof role === "string" && role.trim() ? role.trim() : undefined;
};

const evidenceDiversityKeyForCandidate = (candidate: CandidateSource | undefined, intent: string): string => {
  const host = canonicalizePortfolioHost(candidate?.host);
  if (intent === "oi_problem" && host === "luogu.com.cn") {
    const role = directDiscoveryRoleForCandidate(candidate);
    if (role) return `${host}:${role}`;
  }
  return host;
};

const candidateFromDirectLuoguResult = (
  raw: DiscoveryRawResult,
  jobId: string,
): CandidateSource | undefined => {
  const direct = raw.extensions?.directDiscovery;
  if (!direct || typeof direct !== "object" || Array.isArray(direct)) return undefined;
  const role = (direct as Record<string, unknown>).sourceRole;
  if (role !== "problem_statement" && role !== "community_solution" && role !== "discussion_warning") return undefined;
  let parsed: URL;
  try {
    parsed = new URL(raw.url);
  } catch {
    return undefined;
  }
  const sourceType: CandidateSource["sourceType"] = role === "problem_statement"
    ? "problem_statement"
    : role === "community_solution"
      ? "community_solution"
      : "forum";
  return {
    id: raw.id ?? `direct:luogu:${parsed.toString()}`,
    jobId,
    url: parsed.toString().replace(/^https:\/\/www\./i, "https://"),
    title: raw.title,
    snippet: raw.snippet,
    sourceType,
    priority: role === "problem_statement" ? "core" : "preferred",
    host: parsed.hostname.toLocaleLowerCase().replace(/^www\./, ""),
    language: raw.queryLanguage ?? "mixed",
    queryPurpose: raw.queryPurpose,
    status: "discovered",
    readState: "not_started",
    evidence: { level: "none", reliable: true, fresh: false },
    discoveredAt: raw.discoveredAt ?? Date.now(),
    score: raw.providerPriority,
    extensions: raw.extensions,
  };
};

const mergeDirectLuoguReadQueue = (
  queue: CandidateSource[],
  directResults: DiscoveryRawResult[],
  jobId: string,
): CandidateSource[] => {
  const directCandidates = directResults
    .map((raw) => candidateFromDirectLuoguResult(raw, jobId))
    .filter((candidate): candidate is CandidateSource => Boolean(candidate));
  const seen = new Set<string>();
  const output: CandidateSource[] = [];
  for (const candidate of [...directCandidates, ...queue]) {
    const key = candidate.url.trim().toLocaleLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(candidate);
  }
  return output;
};

const candidateSummary = (candidate: CandidateSource): ResearchEngineRealShadowRunCandidate => ({
  id: candidate.id,
  title: candidate.title,
  url: candidate.url,
  host: candidate.host,
  sourceType: candidate.sourceType,
  score: candidate.score,
});

const candidateDateHint = (candidate: CandidateSource | undefined): string | undefined => {
  const extensions = recordFromUnknown(candidate?.extensions);
  const phase3 = recordFromUnknown(extensions?.phase3);
  const canonical = recordFromUnknown(phase3?.canonical);
  const phase17 = recordFromUnknown(extensions?.phase17KeylessBingProvider);
  return firstString(
    canonical?.dateHint,
    phase17?.publishedAt,
    phase17?.sourcePublishedAt,
    phase17?.dateHint,
    phase17?.freshnessSignal,
  );
};

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

const shouldRunLlmResearchPlanner = (policy: SearchPolicyDecision): boolean =>
  policy.mode === "news_recent" ||
  policy.freshness === "current" ||
  policy.freshness === "latest" ||
  policy.freshness === "recent" ||
  policy.vertical === "general_web";

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
    `- sourcePortfolioEnabled: ${result.diagnosticsSnapshot.sourcePortfolioEnabled ?? "false"}`,
    `- targetDistinctHosts: ${result.diagnosticsSnapshot.targetDistinctHosts ?? "none"}`,
    `- usableEvidenceHostCount: ${result.diagnosticsSnapshot.usableEvidenceHostCount ?? "none"}`,
    `- evidenceGateStatus: ${result.diagnosticsSnapshot.evidenceGateStatus ?? "none"}`,
    `- evidenceGateReason: ${result.diagnosticsSnapshot.evidenceGateReason ?? "none"}`,
    `- evidenceQualityDistribution: ${JSON.stringify(result.diagnosticsSnapshot.evidenceQualityDistribution ?? {})}`,
    `- synthesisPlanItemCount: ${result.diagnosticsSnapshot.synthesisPlanItemCount ?? "none"}`,
    `- answerMode: ${result.diagnosticsSnapshot.answerMode ?? "none"}`,
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
        `- evidenceQualityTier: ${attempt.evidenceQualityTier ?? "none"}`,
        `- sourceRole: ${attempt.sourceRole ?? "none"}`,
        `- oiTopicalityScore: ${attempt.oiTopicalityScore ?? "none"}`,
        `- oiTopicalityMatchedSignals: ${attempt.oiTopicalityMatchedSignals?.join(",") || "none"}`,
        `- acceptedByOiEvidenceGate: ${attempt.acceptedByOiEvidenceGate ?? "none"}`,
        `- oiTopicalityRejectedReason: ${attempt.oiTopicalityRejectedReason ?? "none"}`,
        `- synthesisSelected: ${attempt.synthesisSelected ?? false}`,
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
  const currentDate = new Date().toISOString().slice(0, 10);
  const readTopN = clampReadTopN(options.readTopN);
  const requestedProvider = options.providerName ?? "bing";
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
        maxCandidates: clampMaxCandidates(options.maxCandidates),
      },
    });
  }

  const { request, policy, queryPlan } = makeRequestContext(query);
  const plannerStartedAt = performance.now();
  const plannerEligible = shouldRunLlmResearchPlanner(policy);
  const llmPlanner = plannerEligible
    ? await runLlmResearchPlanner({
      userQuery: query,
      locale: policy.locale,
      searchMode: policy.mode === "news_recent" ? "news_recent" : policy.mode === "docs_technical" ? "docs_technical" : policy.mode === "oi_algorithm" ? "oi_algorithm" : "general_web",
      freshness: policy.freshness,
      ruleIntent: policy.mode,
      rulePlannedQueries: queryPlan.queries,
      currentDate,
      currentDateText: new Date().toLocaleDateString(),
      publicSearchConstraints: [
        "public web only",
        "credentials omitted",
        "no cookies",
        "no Authorization header",
        "no CAPTCHA, login, or paywall bypass",
      ],
      noKeyProviderConstraints: [
        "Bing public search bridge",
        "no search API key",
        "queries must be concise",
        "candidate pages must be publicly readable",
      ],
      providerId: options.providerId,
      modelId: options.modelId,
    })
    : {
      plan: undefined,
      diagnostics: {
        llmPlannerStarted: false,
        llmPlannerSucceeded: false,
        llmPlannerFailedReason: "planner_not_required_for_stable_reference_intent",
        plannerSanitizationNotes: [],
      },
    };
  const coveragePlan = buildSearchCoveragePlan({
    userQuery: query,
    policy,
    searchMode: policy.mode === "news_recent" ? "news_recent" : policy.mode === "docs_technical" ? "docs_technical" : policy.mode === "oi_algorithm" ? "oi_algorithm" : "general_web",
    freshness: policy.freshness,
    rulePlannedQueries: queryPlan.queries,
    llmPlan: llmPlanner.plan,
    llmDiagnostics: llmPlanner.diagnostics,
  });
  mark(
    "planner",
    coveragePlan.diagnostics.llmPlannerSucceeded ? "completed" : coveragePlan.diagnostics.llmPlannerStarted ? "partial" : "skipped",
    `intent=${coveragePlan.intent}; queries=${coveragePlan.queries.length}; targetReadCount=${coveragePlan.sourceRequirements.targetReadCount}`,
    plannerStartedAt,
  );
  const freshnessPolicy = buildFreshnessWindowPolicy({
    intent: coveragePlan.intent,
    freshness: coveragePlan.freshness,
    userQuery: query,
    currentDate,
  });
  const executableQueryPlan = {
    ...queryPlan,
    maxQueries: coveragePlan.plannedQueries.length,
    queries: coveragePlan.plannedQueries,
    reason: `coverage_plan_${coveragePlan.intent}_${coveragePlan.plannedQueries.length}_queries`,
  };
  const broadNewsDigest = coveragePlan.intent === "broad_news_digest" || isBroadNewsDigestQuery(query);
  const newsMode = coveragePlan.intent === "entity_news" || coveragePlan.intent === "broad_topic_news" || coveragePlan.intent === "broad_news_digest" || policy.mode === "news_recent";
  const maxCandidates = Math.max(clampMaxCandidates(options.maxCandidates, newsMode, broadNewsDigest), coveragePlan.sourceRequirements.targetReadCount);
  const portfolioMode = newsMode || coveragePlan.intent === "oi_problem";
  const hostDiversityApplied = portfolioMode;
  const maxReadAttempts = Math.min(MAX_READ_ATTEMPTS, Math.max(options.maxReadAttempts ?? 0, coveragePlan.reading.maxReadAttempts));
  const evidenceTarget = coveragePlan.sourceRequirements.minUsableBodyEvidence;
  const sourcePortfolioQueryMode: SourcePortfolioQueryMode = portfolioMode ? coveragePlan.intent : "normal";
  const plannedQuery = executableQueryPlan.queries[0] ?? {
    query: coveragePlan.intent === "oi_problem" ? normalizeOiSearchQuery(query) : query,
    language: policy.locale,
    purpose: "recall" as const,
    priority: 100,
    expectedSourceTypes: ["official" as const, "mainstream_news" as const],
  };
  const directDiscoveryResults = coveragePlan.intent === "oi_problem"
    ? buildDirectOiDiscoveryResults({
      rawUserQuery: query,
      plannedQueries: executableQueryPlan.queries,
    })
    : [];
  const directDiscoveryDiagnostics = {
    directDiscoveryAttempted: coveragePlan.intent === "oi_problem",
    directDiscoveryCandidateCount: directDiscoveryResults.length,
    directDiscoveryReasons: directDiscoveryResults
      .map((result) => {
        const direct = result.extensions?.directDiscovery;
        return direct && typeof direct === "object" && !Array.isArray(direct)
          ? String((direct as Record<string, unknown>).reason ?? "direct_discovery")
          : "direct_discovery";
      }),
    directDiscoveryUrls: directDiscoveryResults.map((result) => result.url),
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
  let providerSearchAttempted = false;
  let providerSearchSkippedReason: string | undefined;

  if (shadowConfig.mode === "keyless_bing") {
    providerSearchAttempted = true;
    const keyless = await runKeylessBingProvider({
      query: plannedQuery.query,
      rawUserQuery: query,
      queryPurpose: plannedQuery.purpose,
      queryLanguage: plannedQuery.language,
      plannedQueries: executableQueryPlan.queries,
      coveragePlan,
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
    providerSearchAttempted = true;
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
      if (directDiscoveryResults.length === 0) return finalize({
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
          providerSearchScheduled: true,
          providerSearchAttempted,
          providerSearchSkippedReason,
          cleanedQuery: coveragePlan.intent === "oi_problem" ? normalizeOiSearchQuery(query) : query,
          actualProviderQuery: plannedQuery.query,
          actualProviderQueries: keylessProviderDiagnostics?.bridgeQueries ?? [plannedQuery.query],
          ...directDiscoveryDiagnostics,
          providerStatus,
          redactedProviderRequest,
          providerBodyPreview,
          readTopN,
          maxCandidates,
        },
      });
      warnings.push("provider_failed_direct_discovery_candidates_available");
    }
    if (providerTransport.ok) mark("provider", "completed", `Provider HTTP ${providerTransport.statusCode}`, providerStartedAt);

    const normalizeStartedAt = performance.now();
    if (!providerTransport.ok) {
      mark("normalize", "skipped", "Provider transport failed; direct discovery candidates will be used.", normalizeStartedAt);
    } else if (!providerTransport.bodyText.trim()) {
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
          request: { request, policy, queryPlan: executableQueryPlan, query: plannedQuery },
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

  rawResults = [...directDiscoveryResults, ...rawResults];

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
        providerSearchScheduled: true,
        providerSearchAttempted,
        providerSearchSkippedReason,
        cleanedQuery: coveragePlan.intent === "oi_problem" ? normalizeOiSearchQuery(query) : query,
        actualProviderQuery: plannedQuery.query,
        actualProviderQueries: keylessProviderDiagnostics?.bridgeQueries ?? [plannedQuery.query],
        ...directDiscoveryDiagnostics,
        redactedProviderRequest,
        providerBodyPreview,
        keylessProviderDiagnostics,
        readTopN,
        maxCandidates,
      },
    });
  }

  if (
    (rawResults.length === 0 && directDiscoveryResults.length === 0) ||
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
    if (directDiscoveryResults.length === 0) return finalize({
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
        ...coveragePlan.diagnostics,
        providerSearchScheduled: true,
        providerSearchAttempted,
        providerSearchSkippedReason,
        cleanedQuery: coveragePlan.intent === "oi_problem" ? normalizeOiSearchQuery(query) : query,
        actualProviderQuery: plannedQuery.query,
        actualProviderQueries: keylessProviderDiagnostics?.bridgeQueries ?? [plannedQuery.query],
        ...directDiscoveryDiagnostics,
        plannerIntent: coveragePlan.diagnostics.plannerIntent ?? coveragePlan.intent,
        coveragePlanIntent: coveragePlan.intent,
        coverageFacets: coveragePlan.facets.map((facet) => facet.id),
        facetQueries: coveragePlan.diagnostics.facetQueries,
        targetReadCount: coveragePlan.sourceRequirements.targetReadCount,
        maxReadAttempts,
        readerConcurrency: coveragePlan.reading.concurrency,
        globalReaderBudgetMs: coveragePlan.reading.globalBudgetMs,
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
    queryPlan: executableQueryPlan,
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
  const candidateFacetByUrl = rawResults.reduce<Record<string, string>>((acc, raw) => {
    const phase = raw.extensions?.phase17KeylessBingProvider;
    const facet = phase && typeof phase === "object" && !Array.isArray(phase) && typeof (phase as Record<string, unknown>).facet === "string"
      ? (phase as Record<string, unknown>).facet as string
      : coveragePlan.queryFacets[raw.query.toLocaleLowerCase()] ?? "primary";
    acc[raw.url] = facet;
    acc[raw.url.toLocaleLowerCase()] = facet;
    try {
      const parsed = new URL(raw.url);
      parsed.hash = "";
      acc[parsed.toString().replace(/\/$/, "")] = facet;
    } catch {
      // keep exact raw URL only
    }
    return acc;
  }, {});
  const portfolioStartedAt = performance.now();
  const sourcePortfolio = buildSourcePortfolio(candidatePool.selectedCandidates, {
    queryMode: sourcePortfolioQueryMode,
    plannedQueries: executableQueryPlan.queries.map((item) => item.query),
    maxCandidateCount: maxCandidates,
    maxCandidatesInPortfolio: coveragePlan.sourceRequirements.targetReadCount,
    coveragePlan,
    candidateFacetByUrl,
  });
  const directLuoguReadQueue = coveragePlan.intent === "oi_problem"
    ? mergeDirectLuoguReadQueue(
      hostDiversityApplied ? sourcePortfolio.readQueue : candidatePool.selectedCandidates,
      directDiscoveryResults,
      request.requestId ?? "developer-real-shadow-run",
    )
    : hostDiversityApplied ? sourcePortfolio.readQueue : candidatePool.selectedCandidates;
  const selectedCandidates = mergeDirectLuoguReadQueue(
    hostDiversityApplied ? sourcePortfolio.portfolioCandidates : candidatePool.selectedCandidates,
    coveragePlan.intent === "oi_problem" ? directDiscoveryResults : [],
    request.requestId ?? "developer-real-shadow-run",
  ).map(candidateSummary);
  mark("candidate_pool", candidatePool.selectedCount > 0 ? "completed" : "failed", `${candidatePool.selectedCount} selected candidates`, candidateStartedAt);
  mark(
    "source_portfolio",
    hostDiversityApplied ? sourcePortfolio.readQueue.length > 0 ? "completed" : "failed" : "skipped",
    hostDiversityApplied
      ? `${sourcePortfolio.selectedHostCount} hosts in source portfolio; readQueue=${sourcePortfolio.readQueue.length}`
      : "Source portfolio is not required for non-news query.",
    portfolioStartedAt,
  );

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
        ...coveragePlan.diagnostics,
        providerSearchScheduled: true,
        providerSearchAttempted,
        providerSearchSkippedReason,
        cleanedQuery: coveragePlan.intent === "oi_problem" ? normalizeOiSearchQuery(query) : query,
        actualProviderQuery: plannedQuery.query,
        actualProviderQueries: keylessProviderDiagnostics?.bridgeQueries ?? [plannedQuery.query],
        ...directDiscoveryDiagnostics,
        plannerIntent: coveragePlan.diagnostics.plannerIntent ?? coveragePlan.intent,
        coveragePlanIntent: coveragePlan.intent,
        coverageFacets: coveragePlan.facets.map((facet) => facet.id),
        facetQueries: coveragePlan.diagnostics.facetQueries,
        globalReaderBudgetMs: coveragePlan.reading.globalBudgetMs,
        providerStatus: "no_candidate_url",
        redactedProviderRequest,
        providerBodyPreview,
        keylessProviderDiagnostics,
        providerRawResultCount: providerRawResultCount || rawResults.length,
        providerNormalizedResultCount: providerNormalizedResultCount || candidatePool.normalizedCount,
        providerDroppedResultCount,
        readTopN,
        evidenceTarget,
        maxReadAttempts,
        maxCandidates,
        ...sourcePortfolio.diagnostics,
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
    warnings.push(`provider_${providerStatus}_direct_discovery_candidates_available`);
  }

  const readQueue = directLuoguReadQueue.slice(0, maxReadAttempts);
  const readerStartedAt = performance.now();
  const concurrentReader = await runConcurrentReader({
    readQueue,
    maxReadAttempts,
    concurrency: coveragePlan.reading.concurrency,
    perUrlTimeoutMs: options.readerTimeoutMs ?? coveragePlan.reading.perUrlTimeoutMs,
    globalBudgetMs: coveragePlan.reading.globalBudgetMs,
    abortSignal: options.abortSignal,
    whyRead: (candidate) => hostDiversityApplied
      ? `source_portfolio:${canonicalizePortfolioHost(candidate.host)};facet=${candidateFacetByUrl[candidate.url] ?? "primary"}`
      : "ranked_candidate_pool",
  });
  mark(
    "reader",
    concurrentReader.diagnostics.successfulReadCount > 0 ? "completed" : concurrentReader.diagnostics.abortedReadCount > 0 ? "aborted" : "failed",
    concurrentReader.diagnostics.concurrentReaderSummary,
    readerStartedAt,
  );
  const candidateByUrl = new Map(concurrentReader.attempts.map((attempt) => [attempt.candidate.url, attempt.candidate]));
  const readAttempts: ResearchEngineRealShadowRunReadAttempt[] = concurrentReader.attempts.map((attempt, index) => ({
    candidate: candidateSummary(attempt.candidate),
    status: attempt.status,
    evidenceId: `E${index + 1}`,
    whyRead: attempt.whyRead,
    whySkipped: attempt.whySkipped,
    httpStatus: attempt.httpStatus,
    contentType: attempt.contentType,
    readerTransport: attempt.reader && typeof attempt.reader.diagnosticsSnapshot.readerTransport === "string" ? attempt.reader.diagnosticsSnapshot.readerTransport : undefined,
    readerQuality: attempt.reader?.qualitySummary,
    facet: candidateFacetByUrl[attempt.candidate.url] ?? "primary",
    evidenceTextLevel: attempt.evidenceTextLevel,
    errorKind: attempt.errorKind,
    excerptLength: attempt.excerptLength,
    elapsedMs: attempt.elapsedMs,
    selectedPassageCount: attempt.reader?.selectedPassageCount ?? 0,
    excerptPreview: previewText(attempt.reader?.excerptPreview, EXCERPT_PREVIEW_MAX_CHARS),
    warnings: attempt.warnings,
    errors: attempt.errors,
  }));
  const evidenceQualityAssessments = readAttempts.map((attempt) => {
    const candidate = candidateByUrl.get(attempt.candidate.url);
    return assessEvidenceQuality({
      evidenceId: attempt.evidenceId ?? attempt.candidate.id,
      url: attempt.candidate.url,
      title: attempt.candidate.title,
      snippet: candidate?.snippet,
      host: attempt.candidate.host,
      sourceType: attempt.candidate.sourceType,
      facet: attempt.facet,
      topic: coveragePlan.topic,
      intent: coveragePlan.intent,
      facets: coveragePlan.facets,
      evidenceTextLevel: attempt.evidenceTextLevel,
      excerpt: attempt.excerptPreview,
      readerQuality: attempt.readerQuality?.quality,
      dateHint: candidateDateHint(candidate),
      currentDate: freshnessPolicy.currentDate,
      freshnessWindowDays: freshnessPolicy.freshnessWindowDays,
      freshnessRequired: freshnessPolicy.freshnessRequired,
    });
  });
  const evidenceQualityById = Object.fromEntries(evidenceQualityAssessments.map((assessment) => [assessment.evidenceId, assessment]));
  const evidenceQualityDiagnostics = summarizeEvidenceQuality(evidenceQualityAssessments);
  for (const attempt of readAttempts) {
    const assessment = attempt.evidenceId ? evidenceQualityById[attempt.evidenceId] : undefined;
    if (!assessment) continue;
    attempt.evidenceQualityScore = assessment.evidenceQualityScore;
    attempt.evidenceQualityTier = assessment.evidenceQualityTier;
    attempt.sourceRole = assessment.sourceRole;
    attempt.oiTopicalityScore = assessment.oiTopicalityScore;
    attempt.oiTopicalityMatchedSignals = assessment.oiTopicalityMatchedSignals;
    attempt.oiTopicalityRejectedReason = assessment.oiTopicalityRejectedReason;
    attempt.acceptedByOiEvidenceGate = assessment.acceptedByOiEvidenceGate;
    attempt.hasConcreteEvent = assessment.hasConcreteEvent;
    attempt.hasDateSignal = assessment.hasDateSignal;
    attempt.dateSignal = assessment.dateSignal;
    attempt.publishedDate = assessment.publishedDate;
    attempt.dateSignalSource = assessment.dateSignalSource;
    attempt.dateConfidence = assessment.dateConfidence;
    attempt.ageDays = assessment.ageDays;
    attempt.freshnessStatus = assessment.freshnessStatus;
    attempt.freshnessReason = assessment.freshnessReason;
    attempt.rejectedByFreshness = assessment.rejectedByFreshness;
    attempt.facetFitScore = assessment.facetFitScore;
    attempt.whyQualityAccepted = assessment.whyQualityAccepted;
    attempt.whyQualityDowngraded = assessment.whyQualityDowngraded;
  }
  const evidenceItems: EvidenceItemBuildInput[] = [];
  const skippedSameHostEvidence: string[] = [];
  const packetCandidateIds = new Set<string>();
  for (const attempt of concurrentReader.attempts) {
    const reader = attempt.reader;
    if (!reader?.ok || attempt.evidenceTextLevel !== "body_excerpt") continue;
    const mapped = readAttempts.find((item) => item.candidate.url === attempt.candidate.url);
    if (coveragePlan.intent === "oi_problem" && mapped?.acceptedByOiEvidenceGate === false) {
      mapped.warnings = unique([...mapped.warnings, mapped.oiTopicalityRejectedReason ?? "oi_offtopic_body"]);
      continue;
    }
    const candidateHost = evidenceDiversityKeyForCandidate(attempt.candidate, coveragePlan.intent);
    const existingHostCount = evidenceItems.reduce((count, item) =>
      count + (evidenceDiversityKeyForCandidate(item.candidate, coveragePlan.intent) === candidateHost ? 1 : 0), 0);
    if (hostDiversityApplied && existingHostCount >= NEWS_PER_HOST_EVIDENCE_LIMIT) {
      skippedSameHostEvidence.push(candidateHost);
      if (mapped) mapped.warnings = unique([...mapped.warnings, "source_diversity_same_host_evidence_skipped"]);
    } else {
      evidenceItems.push(evidenceInputFromRead({ request, policy, queryPlan: executableQueryPlan, candidate: attempt.candidate, reader }));
      packetCandidateIds.add(attempt.candidate.id);
    }
  }

  const evidenceStartedAt = performance.now();
  const packet = buildEvidencePacket({
    packetId: "developer-real-shadow-run-evidence-packet",
    request,
    policy,
    queryPlan: executableQueryPlan,
    items: evidenceItems,
  });
  const evaluation = evaluateEvidencePacket({ packet });
  const readAttemptByUrl = new Map(readAttempts.map((attempt) => [attempt.candidate.url, attempt]));
  const evidencePortfolioGate = evaluateEvidencePortfolioGate({
    intent: coveragePlan.intent,
    evidenceItems: packet.evidenceItems,
    readSignals: concurrentReader.attempts.map((attempt) => ({
      url: attempt.candidate.url,
      host: attempt.candidate.host,
      facet: candidateFacetByUrl[attempt.candidate.url] ?? "primary",
      status: attempt.status,
      evidenceTextLevel: attempt.evidenceTextLevel,
      excerptLength: attempt.excerptLength,
      freshnessStatus: readAttemptByUrl.get(attempt.candidate.url)?.freshnessStatus,
      publishedDate: readAttemptByUrl.get(attempt.candidate.url)?.publishedDate,
      ageDays: readAttemptByUrl.get(attempt.candidate.url)?.ageDays,
      dateConfidence: readAttemptByUrl.get(attempt.candidate.url)?.dateConfidence,
      isRecentEnough: readAttemptByUrl.get(attempt.candidate.url)?.freshnessStatus === "fresh",
      sourceRole: readAttemptByUrl.get(attempt.candidate.url)?.sourceRole,
      oiTopicalityScore: readAttemptByUrl.get(attempt.candidate.url)?.oiTopicalityScore,
      oiTopicalityMatchedSignals: readAttemptByUrl.get(attempt.candidate.url)?.oiTopicalityMatchedSignals,
      oiTopicalityRejectedReason: readAttemptByUrl.get(attempt.candidate.url)?.oiTopicalityRejectedReason,
      acceptedByOiEvidenceGate: readAttemptByUrl.get(attempt.candidate.url)?.acceptedByOiEvidenceGate,
    })),
    targetReadCount: coveragePlan.sourceRequirements.targetReadCount,
    minDistinctHosts: coveragePlan.sourceRequirements.minDistinctHosts,
    minCoveredFacets: coveragePlan.sourceRequirements.minCoveredFacets,
    candidateShortage: sourcePortfolio.diagnostics.candidateShortage,
    allowCautiousAnswer: coveragePlan.answerContract.allowCautiousAnswer,
    freshnessRequired: freshnessPolicy.freshnessRequired,
    freshnessWindowDays: freshnessPolicy.freshnessWindowDays,
    currentDate: freshnessPolicy.currentDate,
  });
  const citeablePacketCandidateIds = new Set(packet.evidenceItems
    .filter((item) => item.status === "usable" && item.canCite && item.excerptMarkdown.replace(/\s+/g, " ").trim().length >= 80)
    .map((item) => item.candidateId));
  const synthesisEligibleAssessments = evidenceQualityAssessments.filter((assessment) => {
    const attempt = readAttempts.find((item) => item.evidenceId === assessment.evidenceId);
    return Boolean(attempt && packetCandidateIds.has(attempt.candidate.id) && citeablePacketCandidateIds.has(attempt.candidate.id));
  });
  const freshnessGate = evaluateFreshnessGate({
    intent: coveragePlan.intent,
    assessments: synthesisEligibleAssessments,
    currentDate: freshnessPolicy.currentDate,
    freshnessWindowDays: freshnessPolicy.freshnessWindowDays,
    freshnessRequired: freshnessPolicy.freshnessRequired,
    allowCautiousAnswer: coveragePlan.answerContract.allowCautiousAnswer,
  });
  const synthesisPlan = buildNewsSynthesisPlan({
    intent: coveragePlan.intent,
    topic: coveragePlan.topic,
    facets: coveragePlan.facets,
    gateStatus: evidencePortfolioGate.evidenceGateStatus,
    gateReason: evidencePortfolioGate.evidenceGateReason,
    assessments: synthesisEligibleAssessments,
    ...evidenceQualityDiagnostics,
    freshEvidenceCount: freshnessGate.freshEvidenceCount,
    staleEvidenceCount: freshnessGate.staleEvidenceCount,
    unknownDateEvidenceCount: freshnessGate.unknownDateEvidenceCount,
    backgroundOnlyCount: freshnessGate.backgroundOnlyCount,
    freshnessLimitations: freshnessGate.freshnessLimitations,
    candidateShortage: sourcePortfolio.diagnostics.candidateShortage,
  });
  const synthesisSelectedIds = new Set(synthesisPlan.selectedEvidenceIds);
  for (const attempt of readAttempts) {
    const evidenceId = attempt.evidenceId;
    const synthesisItem = evidenceId
      ? synthesisPlan.newsItems.find((item) => item.sources.includes(evidenceId))
      : undefined;
    attempt.synthesisSelected = evidenceId ? synthesisSelectedIds.has(evidenceId) : false;
    attempt.synthesisItemTitle = synthesisItem?.eventTitle;
    attempt.synthesisSummaryHint = synthesisItem?.summaryHint;
    attempt.synthesisConfidence = synthesisItem?.confidence;
  }
  mark(
    "evidence",
    evidencePortfolioGate.evidenceGateStatus === "failed" || synthesisPlan.answerMode === "failed" ? "failed" : evidenceItems.length > 0 ? "completed" : "failed",
    `${evidenceItems.length} body evidence items; fresh=${freshnessGate.freshEvidenceCount}; gate=${evidencePortfolioGate.evidenceGateStatus}`,
    evidenceStartedAt,
  );

  const contractStartedAt = performance.now();
  const answerContract = buildAnswerContract(evaluation);
  const synthesisFailed = synthesisPlan.answerMode === "failed";
  const gatedAnswerMode: AnswerMode = evidencePortfolioGate.evidenceGateStatus === "failed" || synthesisFailed
    ? "insufficient_evidence"
    : evidencePortfolioGate.evidenceGateStatus === "cautious"
      ? "cautious"
      : answerContract.answerMode;
  mark("contract", "completed", `answerMode=${gatedAnswerMode}; evidenceGate=${evidencePortfolioGate.evidenceGateStatus}`, contractStartedAt);

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
    ...(hostDiversityApplied ? ["source_portfolio_enabled"] : []),
    ...(evidencePortfolioGate.evidenceGateStatus === "cautious" ? ["evidence_portfolio_gate_cautious"] : []),
    ...(evidencePortfolioGate.evidenceGateStatus === "failed" ? [`evidence_portfolio_gate_failed:${evidencePortfolioGate.evidenceGateReason}`] : []),
    ...(freshnessGate.freshnessGateStatus === "failed" ? [`freshness_gate_failed:${freshnessGate.freshnessFailureReason ?? "freshness_failed"}`] : []),
    ...(synthesisFailed ? ["news_synthesis_failed:no_core_fresh_news_items"] : []),
    ...(broadNewsDigest ? ["news_query_mode:broad_news_digest"] : []),
    ...(skippedSameHostEvidence.length > 0 ? [`source_diversity_same_host_skipped:${unique(skippedSameHostEvidence).join(",")}`] : []),
  ]);
  const allErrors = unique([
    ...errors,
    ...readAttempts.flatMap((attempt) => attempt.errors),
    ...(evidencePortfolioGate.evidenceGateStatus === "failed" ? [`Research Engine evidence portfolio gate failed: ${evidencePortfolioGate.evidenceGateReason}; usableBodyEvidence=${evidencePortfolioGate.usableBodyEvidenceCount}; usableHosts=${evidencePortfolioGate.usableEvidenceHostCount}.`] : []),
    ...(freshnessGate.freshnessGateStatus === "failed" ? [`Research Engine freshness gate failed: ${freshnessGate.freshnessFailureReason ?? "freshness_failed"}; freshEvidence=${freshnessGate.freshEvidenceCount}; staleEvidence=${freshnessGate.staleEvidenceCount}; unknownDateEvidence=${freshnessGate.unknownDateEvidenceCount}.`] : []),
    ...(synthesisFailed ? ["Research Engine news synthesis failed: no fresh concrete body-excerpt news item survived quality and freshness selection."] : []),
    ...(abortedRun ? ["real shadow run aborted"] : []),
  ]);

  const finalProviderStatus: ResearchEngineRealShadowRunResult["providerStatus"] = abortedRun
    ? "aborted"
    : (evidencePortfolioGate.evidenceGateStatus === "failed" || synthesisFailed) && successfulReads > 0
      ? evidencePortfolioGate.evidenceGateReason === "insufficient_distinct_body_evidence_hosts" ? "source_diversity_failed" : "insufficient_evidence"
    : successfulReads > 0 && directDiscoveryResults.length > 0 && providerStatus !== "available" && providerStatus !== "partial"
      ? "partial"
    : successfulReads > 0
      ? discoveryStatusFromProviderStatus(providerStatus)
      : providerStatusFromReaderFailures(readAttempts);

  return finalize({
    ok: successfulReads > 0 && !abortedRun && evidencePortfolioGate.evidenceGateStatus !== "failed" && !synthesisFailed,
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
    answerContractMode: gatedAnswerMode,
    stageTimeline: timeline,
    warnings: allWarnings,
    errors: allErrors,
    diagnosticsSnapshot: {
      developerDiagnosticsOnly: true,
      oldSearchPathTouched: false,
      noteConversationTouched: false,
      ...coveragePlan.diagnostics,
      providerSearchScheduled: true,
      providerSearchAttempted,
      providerSearchSkippedReason,
      cleanedQuery: coveragePlan.intent === "oi_problem" ? normalizeOiSearchQuery(query) : query,
      actualProviderQuery: plannedQuery.query,
      actualProviderQueries: keylessProviderDiagnostics?.bridgeQueries ?? [plannedQuery.query],
      ...directDiscoveryDiagnostics,
      plannerIntent: coveragePlan.diagnostics.plannerIntent ?? coveragePlan.intent,
      coveragePlanIntent: coveragePlan.intent,
      coverageFacets: coveragePlan.facets.map((facet) => facet.id),
      facetQueries: coveragePlan.diagnostics.facetQueries,
      readTopN,
      evidenceTarget,
      maxReadAttempts,
      queryFreshnessHints: freshnessPolicy.queryFreshnessHints,
      ...concurrentReader.diagnostics,
      newsQueryMode: newsMode ? coveragePlan.intent : "not_news",
      hostDiversityApplied,
      perHostEvidenceLimit: hostDiversityApplied ? NEWS_PER_HOST_EVIDENCE_LIMIT : "none",
      evidenceHostDistribution: hostCount(evidenceItems),
      ...sourcePortfolio.diagnostics,
      ...evidencePortfolioGate,
      ...evidenceQualityDiagnostics,
      ...freshnessGate,
      selectedEvidenceByFacet: synthesisPlan.selectedEvidenceByFacet,
      missingEvidenceFacets: synthesisPlan.missingEvidenceFacets,
      duplicateEventMergedCount: synthesisPlan.duplicateEventMergedCount,
      synthesisPlanItemCount: synthesisPlan.synthesisPlanItemCount,
      answerMode: synthesisPlan.answerMode,
      limitations: synthesisPlan.limitations,
      synthesisPlan,
      evidenceQualityById,
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
        gate: evidencePortfolioGate,
      },
      contract: {
        answerMode: gatedAnswerMode,
        mustCite: answerContract.mustCite,
        allowedEvidenceCount: answerContract.allowedEvidenceIds.length,
        forbiddenClaimCount: answerContract.forbiddenClaims.length,
      },
      stageTimeline: timeline,
    },
  });
};
