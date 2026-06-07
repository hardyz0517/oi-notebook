import type { WebSearchConfig } from "@/lib/aiWebSearch";
import { buildCandidatePool } from "./candidatePool";
import { normalizeRealProviderPayload } from "./providerResponseNormalizer";
import { buildQueryPlan } from "./queryPlanner";
import { buildSearchPolicyDecision } from "./searchPolicy";
import {
  runBrowserProviderSmokeRequest,
  type BrowserProviderRedactedRequest,
} from "./browserProviderTransport";
import type {
  RealDiscoveryProviderName,
  RealDiscoveryTransportError,
  RealProviderPayloadKind,
} from "./realProviderTypes";
import type {
  CandidatePoolSnapshot,
  DiscoveryProviderStatus,
  DiscoveryRawResult,
  PlannedQuery,
  ResearchSearchRequest,
} from "./types";

type SmokeProviderName = Extract<RealDiscoveryProviderName, "bocha" | "brave">;

export type ResearchEngineRealProviderSmokeOptions = {
  query: string;
  webSearchConfig: WebSearchConfig | null;
  providerName?: SmokeProviderName;
  timeoutMs?: number;
};

export type ResearchEngineRealProviderSmokeStatus =
  | "available"
  | "partial"
  | "not_configured"
  | "unsupported_provider"
  | "unauthorized"
  | "rate_limited"
  | "timeout"
  | "malformed_response"
  | "empty_result"
  | "failed";

export type ResearchEngineRealProviderSmokeResult = {
  ok: boolean;
  providerName: RealDiscoveryProviderName | "none";
  status: ResearchEngineRealProviderSmokeStatus;
  query: string;
  rawResultCount: number;
  normalizedResultCount: number;
  candidateCount: number;
  selectedCandidateCount: number;
  providerStatusSummary: Record<string, DiscoveryProviderStatus | ResearchEngineRealProviderSmokeStatus>;
  redactedConfigSummary: {
    providerName: RealDiscoveryProviderName | "none";
    endpointOrigin?: string;
    endpointHost?: string;
    credentialAvailable: boolean;
    redactionFields: string[];
  };
  errors: string[];
  warnings: string[];
  markdownReport: string;
  diagnosticsSnapshot: Record<string, unknown>;
};

const DEFAULT_SMOKE_QUERY = "React useEffect docs";
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_RESULTS = 5;
const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

const isSmokeProviderName = (value: string | undefined): value is SmokeProviderName =>
  value === "bocha" || value === "brave";

const endpointOrigin = (endpoint: string): { origin: string; host: string } => {
  try {
    const parsed = new URL(endpoint);
    return { origin: parsed.origin, host: parsed.hostname };
  } catch {
    return { origin: "invalid", host: "invalid" };
  }
};

const configForSmoke = (
  config: WebSearchConfig | null,
  providerName?: SmokeProviderName,
): {
  providerName: SmokeProviderName;
  endpoint: string;
  apiKey: string;
  payloadKind: RealProviderPayloadKind;
} | undefined => {
  if (!config || !config.enabled || !config.publicSearchConsent) return undefined;
  const selectedProvider = providerName ?? (isSmokeProviderName(config.provider) ? config.provider : undefined);
  if (selectedProvider === "bocha" && config.bochaApiKey.trim()) {
    return {
      providerName: "bocha",
      endpoint: config.bochaEndpoint.trim() || "https://api.bochaai.com/v1/web-search",
      apiKey: config.bochaApiKey.trim(),
      payloadKind: "bocha_like",
    };
  }
  if (selectedProvider === "brave" && config.braveApiKey.trim()) {
    return {
      providerName: "brave",
      endpoint: BRAVE_ENDPOINT,
      apiKey: config.braveApiKey.trim(),
      payloadKind: "brave_like",
    };
  }
  return undefined;
};

const unconfiguredWarningsFor = (
  config: WebSearchConfig | null,
  providerName?: SmokeProviderName,
): string[] => {
  if (!config) {
    return ["Web search config is unavailable; real provider smoke was not started."];
  }
  if (!config.enabled) {
    return ["Public web search is disabled in the current settings; real provider smoke was not started."];
  }
  if (!config.publicSearchConsent) {
    return ["Public search consent is disabled; real provider smoke was not started."];
  }
  const selectedProvider = providerName ?? config.provider;
  if (selectedProvider === "bing") {
    return [
      "Bing public search remains on the legacy NoteX path and is not run by this Research Engine smoke.",
      "Configure Bocha or Brave with a key to run the Phase 12 real provider smoke.",
    ];
  }
  if (selectedProvider === "bocha" && !config.bochaApiKey.trim()) {
    return ["Bocha is selected, but Bocha API key is missing; real provider smoke was not started."];
  }
  if (selectedProvider === "brave" && !config.braveApiKey.trim()) {
    return ["Brave is selected, but Brave API key is missing; real provider smoke was not started."];
  }
  return [
    "Only configured Bocha or Brave providers are supported for the first real smoke.",
    "Bing public search remains on the legacy NoteX path and is not run by this Research Engine smoke.",
  ];
};

const statusFromError = (error: RealDiscoveryTransportError): ResearchEngineRealProviderSmokeStatus => {
  if (error.kind === "unauthorized") return "unauthorized";
  if (error.kind === "rate_limited") return "rate_limited";
  if (error.kind === "timeout" || error.kind === "aborted") return "timeout";
  if (error.kind === "malformed_response") return "malformed_response";
  if (error.kind === "empty_result") return "empty_result";
  if (error.kind === "unsupported_provider") return "unsupported_provider";
  return "failed";
};

const discoveryStatusFromSmoke = (status: ResearchEngineRealProviderSmokeStatus): DiscoveryProviderStatus => {
  if (status === "available") return "available";
  if (status === "partial") return "partial";
  if (status === "timeout") return "timeout";
  if (status === "not_configured" || status === "unsupported_provider") return "disabled";
  return "failed";
};

const makeRequestContext = (
  query: string,
): {
  request: ResearchSearchRequest;
  query: PlannedQuery;
  policy: ReturnType<typeof buildSearchPolicyDecision>;
  queryPlan: ReturnType<typeof buildQueryPlan>;
} => {
  const request: ResearchSearchRequest = {
    requestId: "developer-real-provider-smoke",
    userQuestion: query,
    locale: "auto",
    options: {
      allowPublicWeb: true,
      offlineOnly: false,
      maxQueries: 1,
    },
    extensions: {
      developerDiagnosticsOnly: true,
      phase12RealProviderSmoke: true,
    },
  };
  const policy = buildSearchPolicyDecision(request);
  const queryPlan = buildQueryPlan(request, policy);
  const planned = queryPlan.queries[0] ?? {
    query,
    language: policy.locale,
    purpose: "recall" as const,
    priority: 100,
    expectedSourceTypes: ["documentation" as const, "official" as const],
  };
  return { request, policy, queryPlan, query: planned };
};

const buildMarkdownReport = (input: {
  result: Omit<ResearchEngineRealProviderSmokeResult, "markdownReport">;
  bodyPreview?: string;
  redactedRequest?: BrowserProviderRedactedRequest;
}): string => {
  const { result, bodyPreview, redactedRequest } = input;
  const lines = [
    "# Research Engine Real Provider Smoke",
    "",
    `- ok: ${result.ok}`,
    `- provider: ${result.providerName}`,
    `- status: ${result.status}`,
    `- query: ${result.query}`,
    `- rawResultCount: ${result.rawResultCount}`,
    `- normalizedResultCount: ${result.normalizedResultCount}`,
    `- candidateCount: ${result.candidateCount}`,
    `- selectedCandidateCount: ${result.selectedCandidateCount}`,
    `- credentialAvailable: ${result.redactedConfigSummary.credentialAvailable}`,
    `- endpointHost: ${result.redactedConfigSummary.endpointHost ?? "none"}`,
    `- redactionFields: ${result.redactedConfigSummary.redactionFields.join(", ") || "none"}`,
    "",
    "## Provider Status",
    ...Object.entries(result.providerStatusSummary).map(([provider, status]) => `- ${provider}: ${status}`),
    "",
    "## Warnings",
    ...(result.warnings.length > 0 ? result.warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
    "## Errors",
    ...(result.errors.length > 0 ? result.errors.map((error) => `- ${error}`) : ["- none"]),
    "",
    "## Redacted Request",
    `- method: ${redactedRequest?.method ?? "none"}`,
    `- endpointOrigin: ${redactedRequest?.endpointOrigin ?? result.redactedConfigSummary.endpointOrigin ?? "none"}`,
    `- headerKeys: ${redactedRequest ? Object.keys(redactedRequest.headers).join(", ") : "none"}`,
    `- queryKeys: ${redactedRequest?.queryKeys.join(", ") || "none"}`,
    `- bodyKeys: ${redactedRequest?.bodyKeys.join(", ") || "none"}`,
    `- credentials: ${redactedRequest?.credentials ?? "omit"}`,
    "",
    "## Raw Body Preview",
    bodyPreview ? bodyPreview : "none",
  ];
  return lines.join("\n");
};

const unconfiguredResult = (
  query: string,
  requestedProvider: RealDiscoveryProviderName | "none",
  warnings: string[],
): ResearchEngineRealProviderSmokeResult => {
  const summary = {
    ok: false,
    providerName: requestedProvider,
    status: "not_configured" as const,
    query,
    rawResultCount: 0,
    normalizedResultCount: 0,
    candidateCount: 0,
    selectedCandidateCount: 0,
    providerStatusSummary: requestedProvider === "none" ? {} : { [requestedProvider]: "not_configured" as const },
    redactedConfigSummary: {
      providerName: requestedProvider,
      credentialAvailable: false,
      redactionFields: ["apiKey", "authorization", "cookie", "requestBody"],
    },
    errors: ["real provider smoke is not configured for the current web search settings"],
    warnings,
    diagnosticsSnapshot: {
      developerDiagnosticsOnly: true,
      oldSearchPathTouched: false,
      noteConversationTouched: false,
    },
  };
  return {
    ...summary,
    markdownReport: buildMarkdownReport({ result: summary }),
  };
};

export const runResearchEngineRealProviderSmoke = async (
  options: ResearchEngineRealProviderSmokeOptions,
): Promise<ResearchEngineRealProviderSmokeResult> => {
  const query = options.query.trim() || DEFAULT_SMOKE_QUERY;
  const requestedProvider = options.providerName ?? (options.webSearchConfig?.provider as RealDiscoveryProviderName | undefined) ?? "none";
  const smokeConfig = configForSmoke(options.webSearchConfig, options.providerName);
  if (!smokeConfig) {
    return unconfiguredResult(query, requestedProvider, unconfiguredWarningsFor(options.webSearchConfig, options.providerName));
  }

  const { request, policy, queryPlan, query: plannedQuery } = makeRequestContext(query);
  const redactedEndpoint = endpointOrigin(smokeConfig.endpoint);
  const transport = await runBrowserProviderSmokeRequest({
    providerName: smokeConfig.providerName,
    endpoint: smokeConfig.endpoint,
    apiKey: smokeConfig.apiKey,
    query: plannedQuery.query,
    maxResults: DEFAULT_MAX_RESULTS,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });

  let rawResults: DiscoveryRawResult[] = [];
  let candidatePool: CandidatePoolSnapshot | undefined;
  let status: ResearchEngineRealProviderSmokeStatus = "failed";
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!transport.ok) {
    status = statusFromError(transport.error);
    errors.push(transport.error.message);
  } else if (!transport.bodyText.trim()) {
    status = "empty_result";
    errors.push("provider response body is empty");
  } else {
    try {
      const payload = JSON.parse(transport.bodyText) as unknown;
      const normalized = normalizeRealProviderPayload({
        providerName: smokeConfig.providerName,
        payloadKind: smokeConfig.payloadKind,
        payload,
        request: { request, policy, queryPlan, query: plannedQuery },
        providerPriority: smokeConfig.providerName === "bocha" ? 86 : 84,
        maxResults: DEFAULT_MAX_RESULTS,
      });
      rawResults = normalized.rawResults;
      warnings.push(...normalized.warnings);
      if (normalized.error) {
        status = normalized.rawResults.length > 0 ? "partial" : statusFromError(normalized.error);
        errors.push(normalized.error.message);
      } else {
        status = normalized.partial ? "partial" : "available";
      }
      if (rawResults.length > 0) {
        candidatePool = buildCandidatePool({
          request,
          policy,
          queryPlan,
          rawResults,
          config: { maxSelected: 4, perHostLimit: 2 },
        });
      }
    } catch {
      status = "malformed_response";
      errors.push("provider response body is not valid JSON");
    }
  }

  const ok = status === "available" || status === "partial";
  const providerStatus = discoveryStatusFromSmoke(status);
  const summary = {
    ok,
    providerName: smokeConfig.providerName,
    status,
    query,
    rawResultCount: rawResults.length,
    normalizedResultCount: candidatePool?.normalizedCount ?? 0,
    candidateCount: candidatePool?.dedupedCount ?? 0,
    selectedCandidateCount: candidatePool?.selectedCount ?? 0,
    providerStatusSummary: { [smokeConfig.providerName]: providerStatus },
    redactedConfigSummary: {
      providerName: smokeConfig.providerName,
      endpointOrigin: redactedEndpoint.origin,
      endpointHost: redactedEndpoint.host,
      credentialAvailable: true,
      redactionFields: transport.redactedRequest.redactionFields,
    },
    errors,
    warnings,
    diagnosticsSnapshot: {
      developerDiagnosticsOnly: true,
      oldSearchPathTouched: false,
      noteConversationTouched: false,
      requestId: request.requestId,
      providerName: smokeConfig.providerName,
      payloadKind: smokeConfig.payloadKind,
      plannedQuery: plannedQuery.query,
      queryPurpose: plannedQuery.purpose,
      providerStatus,
      elapsedMs: transport.ok ? transport.elapsedMs : transport.error.elapsedMs,
      redactedRequest: transport.redactedRequest,
      bodyPreview: transport.bodyPreview,
      candidatePool: candidatePool
        ? {
          rawCount: candidatePool.rawCount,
          normalizedCount: candidatePool.normalizedCount,
          dedupedCount: candidatePool.dedupedCount,
          selectedCount: candidatePool.selectedCount,
          rejectedCount: candidatePool.rejectedCount,
          hostDistribution: candidatePool.hostDistribution,
          sourceTypeDistribution: candidatePool.sourceTypeDistribution,
        }
        : undefined,
    },
  };

  return {
    ...summary,
    markdownReport: buildMarkdownReport({
      result: summary,
      bodyPreview: transport.bodyPreview,
      redactedRequest: transport.redactedRequest,
    }),
  };
};
