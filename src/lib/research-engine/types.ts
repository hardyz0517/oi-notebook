export type ResearchLanguage = "zh" | "en" | "mixed";

export type SearchMode =
  | "no_search"
  | "explicit_url"
  | "docs_technical"
  | "oi_algorithm"
  | "news_recent"
  | "general_web"
  | "rumor_check";

export type SearchRiskLevel = "low" | "medium" | "high";

export type FreshnessRequirement = "stable" | "recent" | "latest" | "current";

export type SearchVertical =
  | "general_web"
  | "news"
  | "oi_algorithm"
  | "docs_technical"
  | "explicit_url"
  | "no_search";

export type QueryPurpose =
  | "recall"
  | "official"
  | "news"
  | "rebuttal"
  | "docs"
  | "exact_problem";

export type ExpectedSourceType =
  | "official"
  | "documentation"
  | "mainstream_news"
  | "technical_blog"
  | "community_solution"
  | "forum"
  | "problem_statement"
  | "fact_check"
  | "public_activity"
  | "explicit_url";

export type SearchJobStatus = "created" | "running" | "completed" | "aborted" | "failed";

export type SearchJobPhase =
  | "created"
  | "policy"
  | "planning"
  | "discovery"
  | "scheduling"
  | "reading"
  | "evidence"
  | "ready"
  | "done";

export type PipelineEventType =
  | "job_started"
  | "policy_decided"
  | "query_planned"
  | "candidate_discovered"
  | "candidate_scheduled"
  | "candidate_read_started"
  | "candidate_read_finished"
  | "candidate_rejected"
  | "evidence_evaluated"
  | "readiness_changed"
  | "job_completed"
  | "job_aborted"
  | "zombie_discarded";

export type CandidateStatus = "discovered" | "queued" | "scheduled" | "reading" | "finished" | "rejected" | "aborted" | "zombie_discarded";

export type CandidatePriority = "core" | "preferred" | "supplemental" | "background";

export type CandidateReadState = "not_started" | "scheduled" | "reading" | "finished" | "failed" | "timeout" | "aborted" | "zombie_discarded";

export type CandidateEvidenceState = {
  level: "none" | "weak" | "medium" | "strong";
  reliable: boolean;
  fresh: boolean;
  reason?: string;
};

export type AbortReason = "user_abort" | "newer_job_started" | "soft_timeout" | "hard_timeout" | "stale_job" | "unknown";

export type StaleGuardState = {
  activeJobId: string;
  jobEpoch: number;
  abortedJobIds: string[];
};

export type ResearchSearchRequest = {
  requestId?: string;
  userQuestion: string;
  locale?: ResearchLanguage | "auto";
  createdAt?: number;
  currentNoteContext?: {
    title?: string;
    tags?: string[];
    summary?: string;
    path?: string;
  };
  options?: {
    maxQueries?: number;
    allowPublicWeb?: boolean;
    offlineOnly?: boolean;
  };
  extensions?: Record<string, unknown>;
};

export type ResearchSearchJob = {
  jobId: string;
  request: ResearchSearchRequest;
  policy: SearchPolicyDecision;
  queryPlan: QueryPlan;
  createdAt: number;
  status: SearchJobStatus;
  phase: SearchJobPhase;
  epoch: number;
  abortReason?: AbortReason;
  extensions?: Record<string, unknown>;
};

export type SearchPolicyDecision = {
  needSearch: boolean;
  mode: SearchMode;
  risk: SearchRiskLevel;
  freshness: FreshnessRequirement;
  vertical: SearchVertical;
  reason: string;
  guards: string[];
  confidence: number;
  focusEntities: string[];
  locale: ResearchLanguage;
  mixedLanguage: boolean;
  mustUseEvidence: boolean;
  evidenceRequirement: "none" | "medium" | "strong";
  future: {
    job?: unknown;
    events?: unknown[];
    candidates?: unknown[];
    evidencePacket?: unknown;
    answerContract?: unknown;
  };
};

export type PlannedQuery = {
  query: string;
  language: ResearchLanguage;
  purpose: QueryPurpose;
  priority: number;
  expectedSourceTypes: ExpectedSourceType[];
  preferredDomains?: string[];
};

export type QueryPlan = {
  requestId?: string;
  userQuestion: string;
  needSearch: boolean;
  mode: SearchMode;
  risk: SearchRiskLevel;
  freshness: FreshnessRequirement;
  vertical: SearchVertical;
  locale: ResearchLanguage;
  focusEntities: string[];
  maxQueries: number;
  queries: PlannedQuery[];
  reason: string;
  future: {
    discoveryJob?: unknown;
    schedulerConfig?: unknown;
    eventStream?: unknown;
    candidatePool?: unknown;
    evidencePacket?: unknown;
  };
};

export type CandidateSource = {
  id: string;
  jobId: string;
  url: string;
  title: string;
  snippet?: string;
  sourceType: ExpectedSourceType | "seo_aggregator" | "unknown";
  priority: CandidatePriority;
  host: string;
  language: ResearchLanguage;
  queryPurpose: QueryPurpose;
  status: CandidateStatus;
  readState: CandidateReadState;
  evidence: CandidateEvidenceState;
  discoveredAt: number;
  scheduledAt?: number;
  finishedAt?: number;
  score?: number;
  rejectionReason?: string;
  extensions?: Record<string, unknown>;
};

export type PipelineEvent = {
  id: string;
  jobId: string;
  type: PipelineEventType;
  createdAt: number;
  phase?: SearchJobPhase;
  candidateId?: string;
  message?: string;
  data?: Record<string, unknown>;
};

export type SchedulerConfig = {
  maxCandidates: number;
  maxReadTargets: number;
  maxConcurrentReads: number;
  perHostLimit: number;
  softDeadlineMs: number;
  hardDeadlineMs: number;
  priorityTopK: number;
  minStrongEvidence: number;
  minMediumEvidence: number;
};

export type SchedulerSnapshot = {
  jobId: string;
  activeJobId: string;
  nowMs: number;
  candidates: CandidateSource[];
  scheduledCandidateIds: string[];
  readingCandidateIds: string[];
  finishedCandidateIds: string[];
  rejectedCandidateIds: string[];
  zombieCandidateIds: string[];
  events: PipelineEvent[];
  config: SchedulerConfig;
  staleGuard: StaleGuardState;
};

export type ReadinessGateInput = {
  jobId: string;
  risk: SearchRiskLevel;
  nowMs: number;
  startedAtMs: number;
  config: Pick<SchedulerConfig, "softDeadlineMs" | "hardDeadlineMs" | "priorityTopK" | "minStrongEvidence" | "minMediumEvidence">;
  candidates: CandidateSource[];
};

export type ReadinessGateDecision = {
  canAnswerNow: boolean;
  shouldWaitForPriority: boolean;
  shouldContinueReading: boolean;
  outcome: "wait" | "ready" | "failed_insufficient_evidence";
  reason: string;
  blockingCandidateIds: string[];
  evidenceSummary: {
    strong: number;
    medium: number;
    weak: number;
    none: number;
    priorityPending: number;
    priorityFinished: number;
  };
};

export type EventBufferConfig = {
  mode: "normal" | "developer";
  maxEvents: number;
  maxDeveloperEvents: number;
};

export type EventBufferSnapshot = {
  jobId: string;
  mode: "normal" | "developer";
  totalEventsSeen: number;
  retainedEvents: PipelineEvent[];
  normalSummary: {
    status: string;
    discovered: number;
    scheduled: number;
    reading: number;
    finished: number;
    rejected: number;
    zombies: number;
    readiness?: string;
  };
  droppedEventCount: number;
};

export type ResearchEngineSelfCheckCase = {
  id: string;
  question: string;
  expectedNeedSearch: boolean;
  expectedMode: SearchMode;
  expectedRisk: SearchRiskLevel;
  expectedFreshness: FreshnessRequirement;
  notes?: string;
};

export type ResearchEngineSelfCheckResult = {
  id: string;
  question: string;
  passed: boolean;
  failures: string[];
  policy: SearchPolicyDecision;
  plan: QueryPlan;
};
