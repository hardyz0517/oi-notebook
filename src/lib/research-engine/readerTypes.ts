import type {
  CandidateSource,
  QueryPlan,
  ResearchLanguage,
  ResearchSearchRequest,
  SearchPolicyDecision,
  SourceReliability,
  SourceType,
} from "./types";

export type UrlReaderStatus =
  | "fetched"
  | "partial"
  | "blocked"
  | "timeout"
  | "needs_js"
  | "too_short"
  | "homepage"
  | "wrong_page_type"
  | "parse_failed"
  | "unsupported";

export type UrlReaderErrorKind =
  | "network_timeout"
  | "blocked_by_site"
  | "captcha_or_bot_check"
  | "js_required"
  | "empty_body"
  | "extraction_failed"
  | "unsupported_content_type"
  | "unknown";

export type ExtractedContentBlockType =
  | "heading"
  | "paragraph"
  | "code"
  | "math"
  | "table"
  | "list"
  | "quote"
  | "metadata"
  | "unknown";

export type ReaderQualityLevel = "strong" | "medium" | "weak" | "none";

export type ExcerptWarning =
  | "omitted_large_code_block"
  | "omitted_large_math_block"
  | "truncated_paragraph"
  | "low_quality_source"
  | "blocked_or_unreadable"
  | "needs_js"
  | "partial_reader_result"
  | "homepage_weak_source"
  | "parse_failed"
  | "too_short"
  | "incomplete_structural_block";

export type MockReaderScenario = {
  statusByUrl?: Record<string, UrlReaderStatus>;
  oversizedCodeUrls?: string[];
  oversizedMathUrls?: string[];
  partialUrls?: string[];
};

export type ExtractedContentBlock = {
  id: string;
  type: ExtractedContentBlockType;
  text: string;
  charLength: number;
  tokenEstimate?: number;
  sourceLineStart?: number;
  sourceLineEnd?: number;
  language?: ResearchLanguage | string;
  headingPath?: string[];
  isComplete: boolean;
  relevanceHint?: string;
};

export type ExtractedDocumentMetadata = {
  title: string;
  canonicalUrl: string;
  host: string;
  sourceType: SourceType;
  reliability: SourceReliability;
  publishedAt?: string;
  updatedAt?: string;
  detectedLanguage: ResearchLanguage;
};

export type ExtractedDocument = {
  candidate: CandidateSource;
  metadata: ExtractedDocumentMetadata;
  blocks: ExtractedContentBlock[];
  textCharLength: number;
  diagnostics?: Record<string, unknown>;
};

export type UrlReaderRequest = {
  request: ResearchSearchRequest;
  policy: SearchPolicyDecision;
  queryPlan: QueryPlan;
  candidate: CandidateSource;
  scenario?: MockReaderScenario;
  extensions?: Record<string, unknown>;
};

export type UrlReaderResult = {
  request: UrlReaderRequest;
  candidate: CandidateSource;
  status: UrlReaderStatus;
  document?: ExtractedDocument;
  error?: {
    kind: UrlReaderErrorKind;
    message: string;
    recoverable: boolean;
  };
  diagnostics?: Record<string, unknown>;
};

export type ReaderQualitySignal = {
  name: string;
  passed: boolean;
  weight: number;
  reason: string;
};

export type ReaderQualityEvaluation = {
  quality: ReaderQualityLevel;
  canSupportAnswer: boolean;
  canSupportStrongClaim: boolean;
  reasons: string[];
  warnings: ExcerptWarning[];
  blockStats: Record<ExtractedContentBlockType, number> & {
    total: number;
    complete: number;
    incomplete: number;
    textChars: number;
  };
  signals: ReaderQualitySignal[];
};

export type ExcerptBudget = {
  maxChars: number;
  maxBlocks?: number;
  reserveForMetadata?: number;
};

export type PassageSelectionInput = {
  request: ResearchSearchRequest;
  policy: SearchPolicyDecision;
  queryPlan: QueryPlan;
  readerResult: UrlReaderResult;
  quality: ReaderQualityEvaluation;
  budget?: ExcerptBudget;
};

export type SelectedPassage = {
  block: ExtractedContentBlock;
  score: number;
  reason: string;
  includedText: string;
  truncated: boolean;
  headingPath?: string[];
};

export type PassageSelectionResult = {
  selectedPassages: SelectedPassage[];
  omitted: Array<{
    blockId: string;
    blockType: ExtractedContentBlockType;
    reason: ExcerptWarning | "low_relevance" | "budget_exceeded";
  }>;
  warnings: ExcerptWarning[];
  coverage: {
    selectedBlockCount: number;
    selectedCharCount: number;
    omittedBlockCount: number;
    totalBlockCount: number;
  };
};

export type ExcerptBuildInput = {
  selection: PassageSelectionResult;
  quality: ReaderQualityEvaluation;
  readerResult: UrlReaderResult;
  budget?: ExcerptBudget;
};

export type ExcerptBuildResult = {
  excerptMarkdown: string;
  selectedPassages: SelectedPassage[];
  omittedBlockCount: number;
  warnings: ExcerptWarning[];
  budgetUsed: number;
  hasTruncatedCodeBlock: boolean;
  hasTruncatedMathBlock: boolean;
};
