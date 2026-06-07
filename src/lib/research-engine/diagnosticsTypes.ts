import type {
  AnswerContract,
  EvidenceSummary,
} from "./evidenceTypes";
import type { ResearchOfflineStageSummary } from "./offlineTypes";
import type {
  FreshnessRequirement,
  ResearchEngineSelfCheckResult,
  SearchMode,
  SearchRiskLevel,
  SearchVertical,
} from "./types";

export type ResearchEngineJsonSafeValue =
  | null
  | string
  | number
  | boolean
  | ResearchEngineJsonSafeValue[]
  | { [key: string]: ResearchEngineJsonSafeValue };

export type ResearchEngineDiagnosticSeverity =
  | "info"
  | "warning"
  | "error"
  | "blocked"
  | "success";

export type ResearchEngineDiagnosticStage =
  | "policy"
  | "query"
  | "discovery"
  | "candidate"
  | "scheduler"
  | "reader"
  | "evidence"
  | "contract"
  | "verifier"
  | "self_check";

export type ResearchEngineDiagnosticMessage = {
  id: string;
  stage: ResearchEngineDiagnosticStage;
  severity: ResearchEngineDiagnosticSeverity;
  message: string;
  detail?: string;
};

export type ResearchEngineDiagnosticSection = {
  id: string;
  title: string;
  severity: ResearchEngineDiagnosticSeverity;
  summary: string;
  rows: Array<Record<string, ResearchEngineJsonSafeValue>>;
};

export type ResearchEngineDiagnosticSummary = {
  status: string;
  stageCount: number;
  warningCount: number;
  errorCount: number;
  providerCount: number;
  selectedCandidateCount: number;
  unreadableReaderCount: number;
  evidenceSummary?: EvidenceSummary;
  answerMode?: AnswerContract["answerMode"];
  verifierPassed?: boolean;
};

export type ResearchEngineDiagnosticSnapshot = {
  policy?: {
    mode: SearchMode;
    risk: SearchRiskLevel;
    freshness: FreshnessRequirement;
    vertical: SearchVertical;
    needSearch: boolean;
    reason: string;
  };
  queryPlan?: {
    queryCount: number;
    queries: Array<{
      queryPreview: string;
      purpose: string;
      priority: number;
    }>;
  };
  discovery?: {
    providerStatusSummary: Record<string, string>;
    errorSummary: Record<string, number>;
    rawResultCount: number;
    providerResponseCount: number;
  };
  candidatePool?: {
    rawCount: number;
    normalizedCount: number;
    dedupedCount: number;
    selectedCount: number;
    rejectedCount: number;
    selectedCandidateIds: string[];
    rejectedReasons: Record<string, number>;
  };
  scheduler?: {
    scheduledCount: number;
    readingCount: number;
    finishedCount: number;
    rejectedCount: number;
    zombieCount: number;
  };
  reader?: {
    resultCount: number;
    statusCounts: Record<string, number>;
    qualityCounts: Record<string, number>;
  };
  evidence?: {
    status?: string;
    itemCount: number;
    conflicts: number;
    missingEvidenceReasons: string[];
    summary?: EvidenceSummary;
  };
  contract?: {
    answerMode: AnswerContract["answerMode"];
    mustCite: boolean;
    allowedEvidenceCount: number;
    forbiddenClaimCount: number;
    fallbackPreview: string;
  };
  verifier?: {
    passed?: boolean;
    violationCount: number;
    violationKinds: string[];
    safeFallbackPreview?: string;
  };
  selfCheck?: ResearchEngineSelfCheckSummary;
};

export type ResearchEngineDiagnostics = {
  schemaVersion: 1;
  runId?: string;
  exportedAtLabel: string;
  requestPreview?: string;
  summary: ResearchEngineDiagnosticSummary;
  snapshot: ResearchEngineDiagnosticSnapshot;
  sections: ResearchEngineDiagnosticSection[];
  messages: ResearchEngineDiagnosticMessage[];
  warnings: string[];
  errors: string[];
  stageSummaries: ResearchOfflineStageSummary[];
  redaction: {
    redacted: boolean;
    redactedFields: string[];
  };
};

export type ResearchEngineDiagnosticExportOptions = {
  exportedAtLabel?: string;
  maxPreviewChars?: number;
  includeSections?: boolean;
};

export type ResearchEngineDiagnosticMarkdownReport = {
  markdown: string;
  diagnostics: ResearchEngineDiagnostics;
};

export type ResearchEngineSelfCheckFailureSummary = {
  id: string;
  phase: string;
  questionPreview: string;
  failures: string[];
};

export type ResearchEngineSelfCheckPhaseSummary = {
  phase: string;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
};

export type ResearchEngineSelfCheckSummary = {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  byPhase: ResearchEngineSelfCheckPhaseSummary[];
  failedCases: ResearchEngineSelfCheckFailureSummary[];
};

export type ResearchEngineSelfCheckDiagnosticsInput = {
  results: ResearchEngineSelfCheckResult[];
  exportedAtLabel?: string;
};
