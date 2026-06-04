import { buildCandidatePool } from "./candidatePool";
import { executeDiscoveryProvidersOffline } from "./discoveryProvider";
import { buildDiscoveryExecutionSnapshot, mergeDiscoveryResponses } from "./discoveryMerge";
import { createDefaultDiscoveryRegistry, selectProvidersForPolicy } from "./discoveryRegistry";
import { buildQueryPlan } from "./queryPlanner";
import { buildSearchPolicyDecision } from "./searchPolicy";
import type {
  CandidatePoolConfig,
  CandidatePoolSnapshot,
  DiscoveryExecutionConfig,
  DiscoveryExecutionSnapshot,
  DiscoveryProvider,
  QueryPlan,
  ResearchSearchRequest,
  SearchPolicyDecision,
} from "./types";

const DEFAULT_DISCOVERY_PIPELINE_CONFIG: DiscoveryExecutionConfig = {
  maxRawResults: 40,
  providerTimeoutMs: 1500,
};

const attachPhase4CandidateMetadata = (
  candidatePool: CandidatePoolSnapshot,
): CandidatePoolSnapshot => ({
  ...candidatePool,
  selectedCandidates: candidatePool.selectedCandidates.map((candidate, index) => {
    const normalized = candidatePool.selectedNormalizedCandidates[index];
    if (!normalized) return candidate;
    return {
      ...candidate,
      extensions: {
        ...candidate.extensions,
        phase4Discovery: {
          providerName: normalized.provider,
          providerPriority: normalized.providerPriority,
          query: normalized.query,
          queryPurpose: normalized.queryPurpose,
          sourceType: normalized.sourceType,
          reliability: normalized.reliability,
        },
      },
    };
  }),
});

export const runDiscoveryPipelineOffline = (
  input: {
    request: ResearchSearchRequest;
    policy?: SearchPolicyDecision;
    queryPlan?: QueryPlan;
    providers?: DiscoveryProvider[];
    config?: Partial<DiscoveryExecutionConfig>;
    candidatePoolConfig?: Partial<CandidatePoolConfig>;
  },
): DiscoveryExecutionSnapshot => {
  const config = { ...DEFAULT_DISCOVERY_PIPELINE_CONFIG, ...input.config };
  const policy = input.policy ?? buildSearchPolicyDecision(input.request);
  const queryPlan = input.queryPlan ?? buildQueryPlan(input.request, policy);
  const registry = input.providers ?? createDefaultDiscoveryRegistry();
  const selection = selectProvidersForPolicy(policy, registry);
  const providerResponses = executeDiscoveryProvidersOffline({
    request: input.request,
    policy,
    queryPlan,
    providers: selection.selectedProviders,
    config,
  });
  const merge = mergeDiscoveryResponses(providerResponses, { maxRawResults: config.maxRawResults });
  const snapshot = buildDiscoveryExecutionSnapshot({
    request: input.request,
    policy,
    queryPlan,
    providerResponses,
    merge,
    diagnostics: {
      selection: selection.diagnostics,
      providerTimeoutMs: config.providerTimeoutMs,
    },
  });
  if (!policy.needSearch || merge.mergedRawResults.length === 0) return snapshot;
  const candidatePool = buildCandidatePool({
    request: input.request,
    policy,
    queryPlan,
    rawResults: merge.mergedRawResults,
    config: input.candidatePoolConfig,
  });
  return {
    ...snapshot,
    candidatePool: attachPhase4CandidateMetadata(candidatePool),
  };
};
