import type {
  DiscoveryExecutionSnapshot,
  DiscoveryMergeConfig,
  DiscoveryMergeResult,
  DiscoveryProviderError,
  DiscoveryProviderErrorKind,
  DiscoveryProviderResponse,
  DiscoveryProviderStatus,
  DiscoveryRawResult,
  QueryPlan,
  ResearchSearchRequest,
  SearchPolicyDecision,
} from "./types";

const DEFAULT_MERGE_CONFIG: DiscoveryMergeConfig = {
  maxRawResults: 40,
};

const providerRank = (response: DiscoveryProviderResponse): number => {
  if (response.providerName === "mock_exact_url") return 100;
  if (response.providerName === "mock_official_docs") return 90;
  if (response.providerName === "mock_oi") return 86;
  if (response.providerName === "mock_news") return 82;
  if (response.providerName === "mock_web") return 50;
  return 10;
};

const resultKey = (result: DiscoveryRawResult): string =>
  `${result.provider}:${result.query}:${result.url}`.toLocaleLowerCase();

const bumpError = (
  summary: Partial<Record<DiscoveryProviderErrorKind, number>>,
  kind: DiscoveryProviderErrorKind,
): void => {
  summary[kind] = (summary[kind] ?? 0) + 1;
};

const statusWeight: Record<DiscoveryProviderStatus, number> = {
  available: 0,
  partial: 1,
  disabled: 2,
  timeout: 3,
  failed: 4,
};

const summarizeProviderStatus = (
  current: DiscoveryProviderStatus | undefined,
  next: DiscoveryProviderStatus,
): DiscoveryProviderStatus => {
  if (!current) return next;
  return statusWeight[next] > statusWeight[current] ? next : current;
};

export const mergeDiscoveryResponses = (
  responses: DiscoveryProviderResponse[],
  config: Partial<DiscoveryMergeConfig> = {},
): DiscoveryMergeResult => {
  const finalConfig = { ...DEFAULT_MERGE_CONFIG, ...config };
  const providerStatusSummary: Record<string, DiscoveryProviderStatus> = {};
  const errorSummary: Partial<Record<DiscoveryProviderErrorKind, number>> = {};
  const errors: DiscoveryProviderError[] = [];
  const seen = new Set<string>();
  let compressedDuplicateCount = 0;
  const mergedRawResults: DiscoveryRawResult[] = [];

  const orderedResponses = [...responses].sort((left, right) =>
    providerRank(right) - providerRank(left) ||
    left.providerName.localeCompare(right.providerName) ||
    left.query.localeCompare(right.query),
  );

  for (const response of orderedResponses) {
    providerStatusSummary[response.providerName] = summarizeProviderStatus(providerStatusSummary[response.providerName], response.status);
    if (response.error) {
      errors.push(response.error);
      bumpError(errorSummary, response.error.kind);
    }
    const providerPriority = providerRank(response);
    for (const result of response.rawResults) {
      const key = resultKey(result);
      if (seen.has(key)) {
        compressedDuplicateCount += 1;
        continue;
      }
      seen.add(key);
      mergedRawResults.push({
        ...result,
        providerPriority: result.providerPriority ?? providerPriority,
        extensions: {
          ...result.extensions,
          phase4Merge: {
            providerStatus: response.status,
            providerPriority,
          },
        },
      });
    }
  }

  const limited = mergedRawResults
    .sort((left, right) =>
      (right.providerPriority ?? 0) - (left.providerPriority ?? 0) ||
      left.resultIndex - right.resultIndex,
    )
    .slice(0, finalConfig.maxRawResults);
  const partial = responses.some((response) => response.status !== "available") || limited.length < mergedRawResults.length;

  return {
    mergedRawResults: limited,
    providerStatusSummary,
    errorSummary,
    errors,
    partial,
    diagnostics: {
      rawResultCount: limited.length,
      responseCount: responses.length,
      compressedDuplicateCount,
    },
  };
};

export const buildDiscoveryExecutionSnapshot = (
  input: {
    request: ResearchSearchRequest;
    policy: SearchPolicyDecision;
    queryPlan: QueryPlan;
    providerResponses: DiscoveryProviderResponse[];
    merge: DiscoveryMergeResult;
    diagnostics?: Record<string, unknown>;
  },
): DiscoveryExecutionSnapshot => ({
  request: input.request,
  policy: input.policy,
  queryPlan: input.queryPlan,
  providerResponses: input.providerResponses,
  mergedRawResults: input.merge.mergedRawResults,
  errors: input.merge.errors,
  partial: input.merge.partial,
  diagnostics: {
    ...input.diagnostics,
    providerStatusSummary: input.merge.providerStatusSummary,
    errorSummary: input.merge.errorSummary,
    mergeDiagnostics: input.merge.diagnostics,
  },
});
