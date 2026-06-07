import { buildCandidatePool } from "./candidatePool";
import { normalizeRealProviderPayload } from "./providerResponseNormalizer";
import type {
  RealDiscoveryProviderAdapter,
  RealDiscoveryProviderConfig,
  RealDiscoveryProviderName,
  RealDiscoveryTransport,
  RealDiscoveryTransportError,
  RealDiscoveryTransportErrorKind,
  RealDiscoveryTransportRequest,
  RealProviderAdapterSmokeCase,
  RealProviderAdapterSmokeResult,
} from "./realProviderTypes";
import type {
  DiscoveryProviderError,
  DiscoveryProviderErrorKind,
  DiscoveryProviderName,
  DiscoveryProviderRequest,
  DiscoveryProviderResponse,
  DiscoveryProviderStatus,
} from "./types";

const PROVIDERS: RealDiscoveryProviderName[] = ["bing", "bocha", "brave", "searxng", "custom"];

const providerPriority = (config: RealDiscoveryProviderConfig): number => {
  if (typeof config.providerPriority === "number") return config.providerPriority;
  if (config.providerName === "bing") return 88;
  if (config.providerName === "bocha") return 86;
  if (config.providerName === "brave") return 84;
  if (config.providerName === "searxng") return 72;
  return 50;
};

const toDiscoveryProviderName = (name: RealDiscoveryProviderName): DiscoveryProviderName => name;

const errorKind = (kind: RealDiscoveryTransportErrorKind): DiscoveryProviderErrorKind => kind;

const statusForError = (kind: DiscoveryProviderErrorKind): DiscoveryProviderStatus => {
  if (kind === "provider_disabled") return "disabled";
  if (kind === "timeout") return "timeout";
  return "failed";
};

const discoveryError = (
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

const responseForError = (
  config: RealDiscoveryProviderConfig,
  request: DiscoveryProviderRequest,
  kind: DiscoveryProviderErrorKind,
  message: string,
  elapsedMs = 0,
): DiscoveryProviderResponse => ({
  providerName: toDiscoveryProviderName(config.providerName),
  query: request.query.query,
  queryPurpose: request.query.purpose,
  rawResults: [],
  status: statusForError(kind),
  error: discoveryError(kind, toDiscoveryProviderName(config.providerName), request.query.query, message),
  timing: {
    startedAt: request.nowMs ?? 0,
    finishedAt: (request.nowMs ?? 0) + elapsedMs,
    elapsedMs,
    timedOut: kind === "timeout",
  },
  diagnostics: diagnostics(config, {
    status: statusForError(kind),
    errorKind: kind,
    elapsedMs,
    resultCount: 0,
    warningCount: 1,
  }),
});

const diagnostics = (
  config: RealDiscoveryProviderConfig,
  values: {
    status: DiscoveryProviderStatus;
    errorKind?: DiscoveryProviderErrorKind;
    elapsedMs?: number;
    resultCount: number;
    warningCount: number;
    partial?: boolean;
    fromFixture?: boolean;
  },
): Record<string, unknown> => ({
  providerName: config.providerName,
  status: values.status,
  errorKind: values.errorKind,
  elapsedMs: values.elapsedMs,
  resultCount: values.resultCount,
  warningCount: values.warningCount,
  partial: values.partial ?? false,
  credentialRedacted: true,
  fromFixture: values.fromFixture ?? false,
});

export const validateRealProviderConfig = (config: RealDiscoveryProviderConfig): string[] => {
  const failures: string[] = [];
  if (!PROVIDERS.includes(config.providerName)) failures.push("unsupported_provider");
  if (!config.enabled) failures.push("provider_disabled");
  if (!config.endpoint && config.providerName !== "custom") failures.push("missing_endpoint");
  if (config.providerName === "custom" && !config.endpoint) failures.push("custom_endpoint_required");
  if (config.timeoutMs <= 0) failures.push("invalid_timeout");
  if (config.maxResults <= 0) failures.push("invalid_max_results");
  if ((config.credentialPolicy === "required" || config.credentialPolicy === "redacted") && !config.credentialAvailable && !config.apiKeyRedacted) {
    failures.push("missing_credential");
  }
  return failures;
};

export const redactRealProviderConfig = (
  config: RealDiscoveryProviderConfig,
): RealDiscoveryProviderConfig => ({
  ...config,
  apiKeyRedacted: config.apiKeyRedacted ? "<redacted>" : undefined,
  credentialAvailable: Boolean(config.credentialAvailable || config.apiKeyRedacted),
});

export const createRealDiscoveryProviderAdapter = (
  config: RealDiscoveryProviderConfig,
  transport?: RealDiscoveryTransport,
): RealDiscoveryProviderAdapter => ({
  providerName: config.providerName,
  config: redactRealProviderConfig(config),
  transport,
});

const transportRequest = (
  adapter: RealDiscoveryProviderAdapter,
  request: DiscoveryProviderRequest,
): RealDiscoveryTransportRequest => ({
  method: "GET",
  url: adapter.config.endpoint ?? `https://provider-boundary.invalid/${adapter.providerName}`,
  headers: {
    "x-provider": adapter.providerName,
    ...(adapter.config.credentialAvailable ? { authorization: "<redacted>" } : {}),
  },
  query: {
    q: request.query.query,
    count: adapter.config.maxResults,
    locale: adapter.config.locale,
    safeSearch: adapter.config.safeSearch ?? "moderate",
  },
  timeoutMs: adapter.config.timeoutMs,
  abortState: request.extensions?.abortState as RealDiscoveryTransportRequest["abortState"] ?? { aborted: false },
});

const errorFromStatus = (statusCode: number): RealDiscoveryTransportError | undefined => {
  if (statusCode >= 200 && statusCode < 300) return undefined;
  if (statusCode === 401 || statusCode === 403) return { kind: "unauthorized", message: "provider returned unauthorized", statusCode };
  if (statusCode === 429) return { kind: "rate_limited", message: "provider returned rate limit", statusCode };
  return { kind: "unknown", message: `provider returned HTTP ${statusCode}`, statusCode };
};

export const executeRealDiscoveryProviderAdapter = (
  adapter: RealDiscoveryProviderAdapter,
  request: DiscoveryProviderRequest,
): DiscoveryProviderResponse => {
  const configErrors = validateRealProviderConfig(adapter.config);
  if (configErrors.includes("provider_disabled")) {
    return responseForError(adapter.config, request, "provider_disabled", "provider is disabled");
  }
  if (configErrors.includes("unsupported_provider")) {
    return responseForError(adapter.config, request, "unsupported_provider", "provider is unsupported");
  }
  if (configErrors.includes("missing_credential")) {
    return responseForError(adapter.config, request, "unauthorized", "provider credential is unavailable");
  }
  if (!adapter.transport) {
    return responseForError(adapter.config, request, "transport_unavailable", "real provider transport is unavailable");
  }

  let transportResult: ReturnType<RealDiscoveryTransport>;
  try {
    transportResult = adapter.transport(transportRequest(adapter, request));
  } catch (error) {
    return responseForError(
      adapter.config,
      request,
      "unknown",
      error instanceof Error ? error.message : "real provider transport threw",
    );
  }
  if (!transportResult.ok) {
    return responseForError(
      adapter.config,
      request,
      errorKind(transportResult.error.kind),
      transportResult.error.message,
      transportResult.error.elapsedMs,
    );
  }

  const statusError = errorFromStatus(transportResult.response.statusCode);
  if (statusError) {
    return responseForError(adapter.config, request, errorKind(statusError.kind), statusError.message, transportResult.response.elapsedMs);
  }
  if (!transportResult.response.bodyText.trim()) {
    return responseForError(adapter.config, request, "empty_result", "provider response body is empty", transportResult.response.elapsedMs);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(transportResult.response.bodyText);
  } catch {
    return responseForError(adapter.config, request, "malformed_response", "provider response body is not valid JSON", transportResult.response.elapsedMs);
  }

  const normalized = normalizeRealProviderPayload({
    providerName: adapter.config.providerName,
    payloadKind: adapter.config.payloadKind,
    payload,
    request,
    providerPriority: providerPriority(adapter.config),
    maxResults: adapter.config.maxResults,
  });
  const status: DiscoveryProviderStatus = normalized.error
    ? normalized.rawResults.length > 0 ? "partial" : "failed"
    : normalized.partial ? "partial" : "available";
  return {
    providerName: toDiscoveryProviderName(adapter.config.providerName),
    query: request.query.query,
    queryPurpose: request.query.purpose,
    rawResults: normalized.rawResults,
    status,
    error: normalized.error
      ? discoveryError(errorKind(normalized.error.kind), toDiscoveryProviderName(adapter.config.providerName), request.query.query, normalized.error.message)
      : undefined,
    timing: {
      startedAt: request.nowMs ?? 0,
      finishedAt: (request.nowMs ?? 0) + (transportResult.response.elapsedMs ?? 0),
      elapsedMs: transportResult.response.elapsedMs ?? 0,
      timedOut: false,
    },
    diagnostics: {
      ...normalized.diagnostics,
      ...diagnostics(adapter.config, {
        status,
        errorKind: normalized.error ? errorKind(normalized.error.kind) : undefined,
        elapsedMs: transportResult.response.elapsedMs,
        resultCount: normalized.rawResults.length,
        warningCount: normalized.warnings.length,
        partial: normalized.partial,
        fromFixture: transportResult.response.fromFixture,
      }),
      warnings: normalized.warnings,
    },
  };
};

export const runRealProviderAdapterSmokeCheck = (
  smokeCase: RealProviderAdapterSmokeCase,
): RealProviderAdapterSmokeResult => {
  const adapter = createRealDiscoveryProviderAdapter(smokeCase.config, smokeCase.transport);
  const response = executeRealDiscoveryProviderAdapter(adapter, smokeCase.request);
  const candidatePool = smokeCase.buildCandidatePool && response.rawResults.length > 0
    ? buildCandidatePool({
      request: smokeCase.request.request,
      policy: smokeCase.request.policy,
      queryPlan: smokeCase.request.queryPlan,
      rawResults: response.rawResults,
      config: { maxSelected: 4, perHostLimit: 2 },
    })
    : undefined;
  const failures = [
    ...(response.error ? [] : response.rawResults.length > 0 || response.status === "available" ? [] : ["expected_response_or_error"]),
    ...(smokeCase.buildCandidatePool && (!candidatePool || candidatePool.selectedCount === 0) ? ["candidate_pool_empty"] : []),
  ];
  return {
    id: smokeCase.id,
    response,
    candidatePool,
    passed: failures.length === 0,
    failures,
  };
};
