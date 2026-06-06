import type {
  CandidateSource,
  QueryPlan,
  ResearchSearchRequest,
  SearchPolicyDecision,
  SourceReliability,
  SourceType,
} from "./types";
import type {
  ExcerptBuildResult,
  ExcerptWarning,
  ReaderQualityEvaluation,
  ReaderQualityLevel,
  UrlReaderResult,
} from "./readerTypes";

export type EvidenceItemStatus = "usable" | "degraded" | "unusable";

export type EvidenceStrength = "strong" | "medium" | "weak" | "none";

export type EvidenceRelation = "supports" | "refutes" | "mentions" | "background" | "unknown";

export type EvidenceClaimType =
  | "current_fact"
  | "technical_doc"
  | "oi_algorithm"
  | "rumor_check"
  | "news_summary"
  | "stable_knowledge";

export type EvidencePacketStatus =
  | "ready"
  | "partial"
  | "insufficient"
  | "conflicted"
  | "no_evidence";

export type EvidenceConflictSeverity = "low" | "medium" | "high";

export type CitationRequirement = {
  mustCite: boolean;
  style: "[[E1]]";
  minCitations: number;
  allowedEvidenceIds: string[];
};

export type AllowedClaim = {
  claimId: string;
  text: string;
  claimType: EvidenceClaimType;
  evidenceIds: string[];
  requiresCitation: boolean;
};

export type ForbiddenClaim = {
  claimId: string;
  text: string;
  claimType: EvidenceClaimType;
  reason: string;
  patterns: string[];
};

export type EvidenceItem = {
  evidenceId: string;
  candidateId: string;
  url: string;
  title: string;
  host: string;
  sourceType: SourceType;
  reliability: SourceReliability;
  publishedAt?: string;
  updatedAt?: string;
  excerptMarkdown: string;
  readerQuality: ReaderQualityLevel;
  evidenceStrength: EvidenceStrength;
  relation: EvidenceRelation;
  claimType: EvidenceClaimType;
  warnings: ExcerptWarning[];
  canCite: boolean;
  canSupportStrongClaim: boolean;
  status: EvidenceItemStatus;
};

export type EvidenceConflict = {
  conflictId: string;
  claimType: EvidenceClaimType;
  severity: EvidenceConflictSeverity;
  supportingEvidenceIds: string[];
  refutingEvidenceIds: string[];
  reason: string;
};

export type EvidenceSummary = {
  strongCount: number;
  mediumCount: number;
  weakCount: number;
  noneCount: number;
  supportsCount: number;
  refutesCount: number;
  conflictCount: number;
  reliableSourceCount: number;
  citeableCount: number;
};

export type EvidencePacket = {
  packetId: string;
  request: ResearchSearchRequest;
  policy: SearchPolicyDecision;
  queryPlan: QueryPlan;
  evidenceItems: EvidenceItem[];
  conflicts: EvidenceConflict[];
  status: EvidencePacketStatus;
  evidenceSummary: EvidenceSummary;
  allowedClaims: AllowedClaim[];
  forbiddenClaims: ForbiddenClaim[];
  missingEvidenceReasons: string[];
  citationMap: Record<string, EvidenceItem>;
};

export type EvidenceRequirement = {
  minStrong: number;
  minMedium: number;
  requireReliableSource: boolean;
  requireFreshness: boolean;
  requireNoHighSeverityConflict: boolean;
};

export type EvidenceEvaluationInput = {
  packet: EvidencePacket;
  requirement?: Partial<EvidenceRequirement>;
};

export type EvidenceEvaluationResult = {
  packet: EvidencePacket;
  status: EvidencePacketStatus;
  requirement: EvidenceRequirement;
  sufficient: boolean;
  confidence: number;
  evidenceSummary: EvidenceSummary;
  conflicts: EvidenceConflict[];
  allowedClaims: AllowedClaim[];
  forbiddenClaims: ForbiddenClaim[];
  missingEvidenceReasons: string[];
};

export type EvidenceItemBuildInput = {
  readerResult: UrlReaderResult;
  readerQuality: ReaderQualityEvaluation;
  excerpt: ExcerptBuildResult;
  candidate?: CandidateSource;
  relation?: EvidenceRelation;
  claimType?: EvidenceClaimType;
};

export type EvidencePacketBuildInput = {
  packetId?: string;
  request: ResearchSearchRequest;
  policy: SearchPolicyDecision;
  queryPlan: QueryPlan;
  items: EvidenceItemBuildInput[];
};

export type AnswerMode =
  | "direct"
  | "cautious"
  | "insufficient_evidence"
  | "refuse_current_claim"
  | "summarize_sources";

export type AnswerConstraint = {
  constraintId: string;
  description: string;
  severity: "must" | "should";
};

export type AnswerContract = {
  answerMode: AnswerMode;
  mustCite: boolean;
  citationStyle: CitationRequirement["style"];
  knownEvidenceIds: string[];
  allowedEvidenceIds: string[];
  allowedClaims: AllowedClaim[];
  forbiddenClaims: ForbiddenClaim[];
  requiredHedges: string[];
  maxUnsupportedClaimRisk: "low" | "medium" | "high";
  fallbackMessage: string;
  constraints: AnswerConstraint[];
  developerDiagnostics: Record<string, unknown>;
};

export type PostGenerationViolationKind =
  | "unknown_citation"
  | "disallowed_citation"
  | "missing_required_citation"
  | "forbidden_claim"
  | "unsupported_strong_claim";

export type PostGenerationViolation = {
  kind: PostGenerationViolationKind;
  message: string;
  evidenceId?: string;
  claimId?: string;
};

export type PostGenerationVerificationInput = {
  generatedText: string;
  contract: AnswerContract;
};

export type PostGenerationVerificationResult = {
  passed: boolean;
  violations: PostGenerationViolation[];
  repairedByTemplate?: boolean;
  safeFallback?: string;
  citedEvidenceIds: string[];
  unknownCitationIds: string[];
  uncitedStrongClaims: string[];
  forbiddenClaimHits: string[];
};
