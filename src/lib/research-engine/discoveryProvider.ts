import type {
  DiscoveryProvider,
  DiscoveryProviderCapability,
  DiscoveryProviderError,
  DiscoveryProviderErrorKind,
  DiscoveryProviderName,
  DiscoveryProviderRequest,
  DiscoveryProviderResponse,
  DiscoveryProviderStatus,
  DiscoveryExecutionConfig,
  PlannedQuery,
  QueryPlan,
  ResearchSearchRequest,
  SearchPolicyDecision,
} from "./types";

type ProviderConfig = {
  name: DiscoveryProviderName;
  kind?: DiscoveryProvider["kind"];
  capabilities: DiscoveryProviderCapability[];
  priority: number;
  enabled?: boolean;
  execute: DiscoveryProvider["execute"];
};

const DEFAULT_EXECUTION_CONFIG: DiscoveryExecutionConfig = {
  maxRawResults: 40,
  providerTimeoutMs: 1500,
};

const providerError = (
  kind: DiscoveryProviderErrorKind,
  providerName: DiscoveryProviderName,
  query: string,
  message: string,
): DiscoveryProviderError => ({
  kind,
  providerName,
  query,
  message,
  recoverable: kind !== "unauthorized",
});

const responseForStatus = (
  provider: DiscoveryProvider,
  query: PlannedQuery,
  status: DiscoveryProviderStatus,
  kind: DiscoveryProviderErrorKind,
  message: string,
  nowMs: number,
): DiscoveryProviderResponse => ({
  providerName: provider.name,
  query: query.query,
  queryPurpose: query.purpose,
  rawResults: [],
  status,
  error: providerError(kind, provider.name, query.query, message),
  timing: {
    startedAt: nowMs,
    finishedAt: nowMs,
    elapsedMs: 0,
    timedOut: status === "timeout",
  },
  diagnostics: { phase: "discovery_provider_guard" },
});

const capabilityMatches = (
  capability: DiscoveryProviderCapability,
  policy: SearchPolicyDecision,
): boolean => {
  if (policy.mode === "explicit_url") return capability === "exact_url";
  if (policy.mode === "docs_technical") return capability === "official_docs" || capability === "web_search";
  if (policy.mode === "oi_algorithm") return capability === "oi_sources" || capability === "web_search";
  if (policy.mode === "news_recent") return capability === "news_search" || capability === "web_search";
  if (policy.mode === "rumor_check") return capability === "news_search" || capability === "web_search" || capability === "official_docs";
  if (policy.mode === "general_web") return capability === "web_search" || capability === "news_search" || capability === "official_docs";
  return false;
};

export const createDiscoveryProvider = (config: ProviderConfig): DiscoveryProvider => ({
  name: config.name,
  kind: config.kind ?? "mock",
  capabilities: config.capabilities,
  priority: config.priority,
  enabled: config.enabled ?? true,
  execute: config.execute,
});

export const executeDiscoveryProvider = (
  provider: DiscoveryProvider,
  request: DiscoveryProviderRequest,
): DiscoveryProviderResponse => {
  const nowMs = request.nowMs ?? 0;
  const scenario = request.scenario;
  const disabled = !provider.enabled || scenario?.disabledProviders?.includes(provider.name);
  if (disabled) {
    return responseForStatus(provider, request.query, "disabled", "provider_disabled", "provider is disabled", nowMs);
  }
  if (scenario?.timeoutProviders?.includes(provider.name)) {
    return responseForStatus(provider, request.query, "timeout", "timeout", "provider timed out in offline scenario", nowMs);
  }
  const supported = provider.capabilities.some((capability) => capabilityMatches(capability, request.policy));
  if (!supported || scenario?.unsupportedProviders?.includes(provider.name)) {
    return responseForStatus(provider, request.query, "failed", "unsupported_vertical", "provider does not support this policy", nowMs);
  }
  if (scenario?.emptyProviders?.includes(provider.name)) {
    return responseForStatus(provider, request.query, "failed", "empty_result", "provider returned no result in offline scenario", nowMs);
  }

  let response: DiscoveryProviderResponse;
  try {
    response = provider.execute(request);
  } catch (error) {
    return responseForStatus(
      provider,
      request.query,
      "failed",
      "unknown",
      error instanceof Error ? error.message : "provider execution failed",
      nowMs,
    );
  }
  const rawResults = scenario?.partialProviders?.includes(provider.name)
    ? response.rawResults.slice(0, 1)
    : response.rawResults;
  const status = scenario?.partialProviders?.includes(provider.name) ? "partial" : response.status;
  const error = status === "partial"
    ? providerError("unknown", provider.name, request.query.query, "provider returned partial offline results")
    : response.error;
  return {
    ...response,
    status,
    error,
    rawResults,
    timing: response.timing ?? {
      startedAt: nowMs,
      finishedAt: nowMs,
      elapsedMs: 0,
      timedOut: false,
    },
  };
};

export const executeDiscoveryProvidersOffline = (
  input: {
    request: ResearchSearchRequest;
    policy: SearchPolicyDecision;
    queryPlan: QueryPlan;
    providers: DiscoveryProvider[];
    config?: Partial<DiscoveryExecutionConfig>;
  },
): DiscoveryProviderResponse[] => {
  const config = { ...DEFAULT_EXECUTION_CONFIG, ...input.config };
  if (!input.policy.needSearch || input.queryPlan.queries.length === 0) return [];
  const responses: DiscoveryProviderResponse[] = [];
  for (const provider of input.providers) {
    for (const query of input.queryPlan.queries) {
      responses.push(executeDiscoveryProvider(provider, {
        request: input.request,
        policy: input.policy,
        queryPlan: input.queryPlan,
        query,
        scenario: config.scenario,
        nowMs: input.request.createdAt ?? 0,
      }));
    }
  }
  return responses;
};
