export type {
  ExpectedSourceType,
  AbortReason,
  CandidateEvidenceState,
  CandidateCanonicalInfo,
  CandidateCluster,
  CandidateDedupeKey,
  CandidatePoolConfig,
  CandidatePoolInput,
  CandidatePoolSnapshot,
  CandidatePriority,
  CandidateRankBreakdown,
  CandidateRankFeature,
  CandidateRankScore,
  CandidateReadState,
  CandidateRejectReason,
  CandidateSource,
  CandidateStatus,
  DiscoveryProviderName,
  DiscoveryProvider,
  DiscoveryProviderCapability,
  DiscoveryProviderError,
  DiscoveryProviderErrorKind,
  DiscoveryProviderKind,
  DiscoveryProviderRegistryEntry,
  DiscoveryProviderRequest,
  DiscoveryProviderResponse,
  DiscoveryProviderStatus,
  DiscoveryProviderTiming,
  DiscoveryExecutionConfig,
  DiscoveryExecutionSnapshot,
  DiscoveryMergeConfig,
  DiscoveryMergeResult,
  DiscoverySelectionResult,
  DiscoveryRawResult,
  DiversitySelectionConfig,
  DiversitySelectionResult,
  EventBufferConfig,
  EventBufferSnapshot,
  FreshnessRequirement,
  PipelineEvent,
  PipelineEventType,
  PlannedQuery,
  QueryPlan,
  QueryPurpose,
  ReadinessGateDecision,
  ReadinessGateInput,
  ResearchEngineSelfCheckCase,
  ResearchEngineSelfCheckResult,
  ResearchLanguage,
  ResearchSearchRequest,
  ResearchSearchJob,
  MockDiscoveryScenario,
  SchedulerConfig,
  SchedulerSnapshot,
  SearchMode,
  SearchJobPhase,
  SearchJobStatus,
  SearchPolicyDecision,
  SearchRiskLevel,
  SearchVertical,
  SourceReliability,
  SourceType,
  StaleGuardState,
} from "./types";
export { buildSearchPolicyDecision } from "./searchPolicy";
export { buildQueryPlan } from "./queryPlanner";
export {
  buildCandidateDedupeKey,
  canonicalizeUrl,
  normalizeDiscoveryResult,
  normalizeDiscoveryResults,
  toCandidateSource,
} from "./candidateNormalizer";
export {
  scoreCandidate,
  rankCandidates,
} from "./candidateRanker";
export { selectDiverseCandidates } from "./diversitySelector";
export {
  DEFAULT_CANDIDATE_POOL_CONFIG,
  buildCandidatePool,
} from "./candidatePool";
export {
  createDiscoveryProvider,
  executeDiscoveryProvider,
  executeDiscoveryProvidersOffline,
} from "./discoveryProvider";
export {
  createDefaultDiscoveryRegistry,
  getProviderCapabilities,
  selectProvidersForPolicy,
} from "./discoveryRegistry";
export {
  buildDiscoveryExecutionSnapshot,
  mergeDiscoveryResponses,
} from "./discoveryMerge";
export {
  createMockDiscoveryProviders,
  createMockExactUrlProvider,
  createMockNewsProvider,
  createMockOfficialDocsProvider,
  createMockOiProvider,
  createMockWebProvider,
} from "./mockDiscoveryProvider";
export { runDiscoveryPipelineOffline } from "./discoveryPipeline";
export { evaluateReadinessGate } from "./readinessGate";
export {
  DEFAULT_SCHEDULER_CONFIG,
  createSchedulerSnapshot,
  scheduleCandidates,
  simulateSchedulerStep,
} from "./scheduler";
export {
  DEFAULT_EVENT_BUFFER_CONFIG,
  appendPipelineEvents,
  createEventBuffer,
  flushEventBuffer,
} from "./eventBuffer";
export { runResearchEngineSelfCheck } from "./selfCheck";
