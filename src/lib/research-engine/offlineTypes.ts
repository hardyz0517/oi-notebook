import type {
  AnswerContract,
  EvidenceEvaluationResult,
  EvidencePacket,
  PostGenerationVerificationResult,
} from "./evidenceTypes";
import type {
  ExcerptBuildResult,
  ExcerptBudget,
  MockReaderScenario,
  PassageSelectionResult,
  ReaderQualityEvaluation,
  UrlReaderResult,
} from "./readerTypes";
import type {
  CandidatePoolSnapshot,
  DiscoveryExecutionSnapshot,
  MockDiscoveryScenario,
  QueryPlan,
  ResearchSearchRequest,
  SchedulerSnapshot,
  SearchPolicyDecision,
} from "./types";

export type ResearchOfflineRunStatus =
  | "no_search"
  | "ready"
  | "cautious"
  | "insufficient_evidence"
  | "refused"
  | "failed";

export type ResearchOfflineRunStage =
  | "policy"
  | "query"
  | "discovery"
  | "candidate"
  | "scheduler"
  | "reader"
  | "quality"
  | "passage"
  | "excerpt"
  | "evidence"
  | "contract"
  | "verifier"
  | "done";

export type ResearchOfflineRunWarning =
  | "no_search_short_circuit"
  | "discovery_partial"
  | "no_raw_results"
  | "candidate_pool_empty"
  | "no_selected_candidates"
  | "reader_unreadable"
  | "all_reader_results_unreadable"
  | "evidence_insufficient"
  | "verification_failed";

export type ResearchOfflineStageSummary = {
  stage: ResearchOfflineRunStage;
  status: "skipped" | "completed" | "partial" | "failed";
  message: string;
  inputCount?: number;
  outputCount?: number;
  warningCount?: number;
};

export type ResearchOfflineRunConfig = {
  maxRawResults: number;
  maxCandidates: number;
  maxSelectedCandidates: number;
  maxReadTargets: number;
  maxConcurrentReads: number;
  perHostLimit: number;
  excerptBudget: ExcerptBudget;
  enableVerifier: boolean;
  developerDiagnostics: boolean;
  mockDiscoveryScenario?: MockDiscoveryScenario;
  mockReaderScenario?: MockReaderScenario;
};

export type ResearchOfflineVerificationSample = {
  generatedText: string;
};

export type ResearchOfflineRunInput = {
  runId?: string;
  request: ResearchSearchRequest;
  config?: Partial<ResearchOfflineRunConfig>;
  sampleGeneratedAnswer?: string | ResearchOfflineVerificationSample;
};

export type ResearchOfflineRunDiagnostics = {
  stageSummaries: ResearchOfflineStageSummary[];
  providerStatusSummary: Record<string, string>;
  candidateCounts: {
    raw: number;
    normalized: number;
    deduped: number;
    selected: number;
    rejected: number;
  };
  selectedCandidateIds: string[];
  unreadableCounts: Record<string, number>;
  evidenceSummary?: EvidenceEvaluationResult["evidenceSummary"];
  answerMode?: AnswerContract["answerMode"];
  warnings: ResearchOfflineRunWarning[];
  reasons: string[];
  verifierPassed?: boolean;
};

export type ResearchOfflineRunResult = {
  runId: string;
  request: ResearchSearchRequest;
  policy: SearchPolicyDecision;
  queryPlan: QueryPlan;
  discoverySnapshot?: DiscoveryExecutionSnapshot;
  candidatePool?: CandidatePoolSnapshot;
  schedulerSnapshot?: SchedulerSnapshot;
  readerResults: UrlReaderResult[];
  qualityEvaluations: ReaderQualityEvaluation[];
  passageSelections: PassageSelectionResult[];
  excerpts: ExcerptBuildResult[];
  evidencePacket?: EvidencePacket;
  evidenceEvaluation?: EvidenceEvaluationResult;
  answerContract?: AnswerContract;
  verifierResult?: PostGenerationVerificationResult;
  warnings: ResearchOfflineRunWarning[];
  diagnostics: ResearchOfflineRunDiagnostics;
  stageSummaries: ResearchOfflineStageSummary[];
  status: ResearchOfflineRunStatus;
};
