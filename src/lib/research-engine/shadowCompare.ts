import type { WebSearchConfig } from "@/lib/aiWebSearch";
import {
  runResearchEngineRealShadowRun,
  type ResearchEngineRealShadowRunResult,
} from "./realShadowRun";
import type { EvidenceSummary } from "./evidenceTypes";

export type ResearchEngineShadowCompareRecommendation =
  | "shadow_only"
  | "ready_for_dev_gray"
  | "not_ready"
  | "insufficient_data";

export type ResearchEngineShadowCompareOptions = {
  query: string;
  webSearchConfig: WebSearchConfig | null;
  providerName?: "bocha" | "brave";
  readTopN?: number;
  maxCandidates?: number;
  timeoutMs?: number;
  includeLegacy?: boolean;
};

export type ResearchEngineShadowCompareLegacySummary = {
  status: "unavailable" | "skipped";
  reason: string;
  providerName?: string;
  query: string;
  resultCount?: number;
  sourceCount?: number;
  hostnames: string[];
  urls: string[];
  warnings: string[];
  errors: string[];
};

export type ResearchEngineShadowCompareResearchSummary = {
  status: ResearchEngineRealShadowRunResult["providerStatus"];
  ok: boolean;
  providerName: ResearchEngineRealShadowRunResult["providerName"];
  candidateCount: number;
  selectedCandidateCount: number;
  successfulReads: number;
  failedReads: number;
  hostnames: string[];
  urls: string[];
  evidenceMode?: string;
  answerContractMode?: string;
  warnings: string[];
  errors: string[];
};

export type ResearchEngineShadowCompareSummary = {
  legacyResultCount?: number;
  researchCandidateCount: number;
  researchSuccessfulReads: number;
  overlapHosts: string[];
  overlapUrls: string[];
  uniqueLegacyHosts: string[];
  uniqueResearchHosts: string[];
  researchEvidenceMode?: string;
  researchAnswerContractMode?: string;
  recommendation: ResearchEngineShadowCompareRecommendation;
  notes: string[];
};

export type ResearchEngineShadowCompareResult = {
  ok: boolean;
  query: string;
  legacySummary: ResearchEngineShadowCompareLegacySummary;
  researchSummary: ResearchEngineShadowCompareResearchSummary;
  comparisonSummary: ResearchEngineShadowCompareSummary;
  warnings: string[];
  errors: string[];
  markdownReport: string;
  diagnosticsSnapshot: Record<string, unknown>;
};

const DEFAULT_QUERY = "OpenAI latest news";
const DEFAULT_READ_TOP_N = 2;
const DEFAULT_MAX_CANDIDATES = 8;
const MAX_READ_TOP_N = 3;
const MAX_CANDIDATES = 10;

const unique = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));

const clampReadTopN = (value: number | undefined): number =>
  Math.max(1, Math.min(value ?? DEFAULT_READ_TOP_N, MAX_READ_TOP_N));

const clampMaxCandidates = (value: number | undefined): number =>
  Math.max(1, Math.min(value ?? DEFAULT_MAX_CANDIDATES, MAX_CANDIDATES));

const hostnameFromUrl = (url: string): string | undefined => {
  try {
    return new URL(url).hostname.toLocaleLowerCase();
  } catch {
    return undefined;
  }
};

const sortedIntersection = (left: string[], right: string[]): string[] => {
  const rightSet = new Set(right);
  return unique(left.filter((value) => rightSet.has(value))).sort();
};

const sortedDifference = (left: string[], right: string[]): string[] => {
  const rightSet = new Set(right);
  return unique(left.filter((value) => !rightSet.has(value))).sort();
};

const evidenceModeFromSummary = (summary: EvidenceSummary | undefined): string | undefined => {
  if (!summary) return undefined;
  if (summary.strongCount > 0 || summary.mediumCount > 0) return "supported";
  if (summary.weakCount > 0) return "weak";
  return "none";
};

const legacyUnavailableSummary = (
  input: {
    query: string;
    config: WebSearchConfig | null;
    includeLegacy: boolean;
  },
): ResearchEngineShadowCompareLegacySummary => {
  if (!input.includeLegacy) {
    return {
      status: "skipped",
      reason: "Legacy comparison was disabled for this run.",
      providerName: input.config?.provider,
      query: input.query,
      hostnames: [],
      urls: [],
      warnings: ["legacy_compare_skipped"],
      errors: [],
    };
  }
  return {
    status: "unavailable",
    reason: "No safe query-level legacy NoteX search diagnostics runner is currently exposed to Developer Diagnostics without invoking the main chat search path.",
    providerName: input.config?.provider,
    query: input.query,
    hostnames: [],
    urls: [],
    warnings: ["legacy_query_runner_unavailable"],
    errors: [],
  };
};

const researchSummaryFromShadowRun = (
  result: ResearchEngineRealShadowRunResult,
): ResearchEngineShadowCompareResearchSummary => {
  const urls = unique(result.selectedCandidates.map((candidate) => candidate.url));
  const hostnames = unique([
    ...result.selectedCandidates.map((candidate) => candidate.host),
    ...urls.map(hostnameFromUrl).filter((value): value is string => Boolean(value)),
  ]).sort();
  return {
    status: result.providerStatus,
    ok: result.ok,
    providerName: result.providerName,
    candidateCount: result.candidateCount,
    selectedCandidateCount: result.selectedCandidates.length,
    successfulReads: result.successfulReads,
    failedReads: result.failedReads,
    hostnames,
    urls: urls.sort(),
    evidenceMode: evidenceModeFromSummary(result.evidenceSummary),
    answerContractMode: result.answerContractMode,
    warnings: result.warnings,
    errors: result.errors,
  };
};

const recommendationFor = (
  input: {
    legacy: ResearchEngineShadowCompareLegacySummary;
    research: ResearchEngineShadowCompareResearchSummary;
    overlapHosts: string[];
  },
): ResearchEngineShadowCompareRecommendation => {
  if (!input.research.ok || input.research.status === "not_configured" || input.research.status === "aborted") {
    return "not_ready";
  }
  if (input.research.successfulReads <= 0) {
    return "insufficient_data";
  }
  if (input.legacy.status === "unavailable" || input.legacy.status === "skipped") {
    return "shadow_only";
  }
  return input.overlapHosts.length > 0 ? "ready_for_dev_gray" : "insufficient_data";
};

const buildComparisonSummary = (
  input: {
    legacy: ResearchEngineShadowCompareLegacySummary;
    research: ResearchEngineShadowCompareResearchSummary;
  },
): ResearchEngineShadowCompareSummary => {
  const overlapHosts = sortedIntersection(input.legacy.hostnames, input.research.hostnames);
  const overlapUrls = sortedIntersection(input.legacy.urls, input.research.urls);
  const recommendation = recommendationFor({ legacy: input.legacy, research: input.research, overlapHosts });
  const notes = unique([
    input.legacy.status === "unavailable" ? "Legacy query-level runner is unavailable; comparison is Research Engine shadow-only." : undefined,
    input.research.successfulReads <= 0 ? "Research Engine did not produce a successful URL reader result." : undefined,
    overlapHosts.length === 0 ? "No legacy host overlap is available for this run." : undefined,
  ].filter((value): value is string => Boolean(value)));
  return {
    legacyResultCount: input.legacy.resultCount,
    researchCandidateCount: input.research.candidateCount,
    researchSuccessfulReads: input.research.successfulReads,
    overlapHosts,
    overlapUrls,
    uniqueLegacyHosts: sortedDifference(input.legacy.hostnames, input.research.hostnames),
    uniqueResearchHosts: sortedDifference(input.research.hostnames, input.legacy.hostnames),
    researchEvidenceMode: input.research.evidenceMode,
    researchAnswerContractMode: input.research.answerContractMode,
    recommendation,
    notes,
  };
};

const buildMarkdownReport = (
  result: Omit<ResearchEngineShadowCompareResult, "markdownReport">,
): string => {
  const lines = [
    "# Research Engine Shadow Compare",
    "",
    "## Query",
    `- ${result.query}`,
    "",
    "## Legacy Search Summary",
    `- status: ${result.legacySummary.status}`,
    `- provider: ${result.legacySummary.providerName ?? "none"}`,
    `- reason: ${result.legacySummary.reason}`,
    `- resultCount: ${result.legacySummary.resultCount ?? "unavailable"}`,
    `- sourceCount: ${result.legacySummary.sourceCount ?? "unavailable"}`,
    "",
    "## Research Engine Shadow Summary",
    `- ok: ${result.researchSummary.ok}`,
    `- provider: ${result.researchSummary.providerName}`,
    `- status: ${result.researchSummary.status}`,
    `- candidateCount: ${result.researchSummary.candidateCount}`,
    `- selectedCandidateCount: ${result.researchSummary.selectedCandidateCount}`,
    `- successfulReads: ${result.researchSummary.successfulReads}`,
    `- failedReads: ${result.researchSummary.failedReads}`,
    `- evidenceMode: ${result.researchSummary.evidenceMode ?? "none"}`,
    `- answerContractMode: ${result.researchSummary.answerContractMode ?? "none"}`,
    "",
    "## Candidate / Source Comparison",
    `- overlapHosts: ${result.comparisonSummary.overlapHosts.join(", ") || "none"}`,
    `- overlapUrls: ${result.comparisonSummary.overlapUrls.join(", ") || "none"}`,
    `- uniqueLegacyHosts: ${result.comparisonSummary.uniqueLegacyHosts.join(", ") || "none"}`,
    `- uniqueResearchHosts: ${result.comparisonSummary.uniqueResearchHosts.join(", ") || "none"}`,
    "",
    "## Evidence Quality",
    `- researchEvidenceMode: ${result.comparisonSummary.researchEvidenceMode ?? "none"}`,
    `- researchAnswerContractMode: ${result.comparisonSummary.researchAnswerContractMode ?? "none"}`,
    "",
    "## Failure / Warning Comparison",
    ...(result.warnings.length > 0 ? result.warnings.map((warning) => `- warning: ${warning}`) : ["- warnings: none"]),
    ...(result.errors.length > 0 ? result.errors.map((error) => `- error: ${error}`) : ["- errors: none"]),
    "",
    "## Recommendation",
    `- ${result.comparisonSummary.recommendation}`,
    ...(result.comparisonSummary.notes.length > 0 ? result.comparisonSummary.notes.map((note) => `- ${note}`) : ["- no additional notes"]),
    "",
    "## Security Notes",
    "- Developer Diagnostics manual compare only.",
    "- Legacy NoteX main chat search path is not modified.",
    "- Research Engine side reuses the Phase 15 shadow run.",
    "- No cookies, Authorization, API keys, full request body, full raw provider response, or full page body are included.",
    "- CORS, login, captcha, and paywall restrictions are not bypassed.",
    "- Recommendation is diagnostic only and does not switch production routing.",
  ];
  return lines.join("\n");
};

const finalize = (
  result: Omit<ResearchEngineShadowCompareResult, "markdownReport">,
): ResearchEngineShadowCompareResult => ({
  ...result,
  markdownReport: buildMarkdownReport(result),
});

export const runResearchEngineShadowCompare = async (
  options: ResearchEngineShadowCompareOptions,
): Promise<ResearchEngineShadowCompareResult> => {
  const query = options.query.trim() || DEFAULT_QUERY;
  const readTopN = clampReadTopN(options.readTopN);
  const maxCandidates = clampMaxCandidates(options.maxCandidates);
  const legacySummary = legacyUnavailableSummary({
    query,
    config: options.webSearchConfig,
    includeLegacy: options.includeLegacy ?? true,
  });
  try {
    const research = await runResearchEngineRealShadowRun({
      query,
      webSearchConfig: options.webSearchConfig,
      providerName: options.providerName,
      readTopN,
      maxCandidates,
      providerTimeoutMs: options.timeoutMs,
      readerTimeoutMs: options.timeoutMs,
    });
    const researchSummary = researchSummaryFromShadowRun(research);
    const comparisonSummary = buildComparisonSummary({ legacy: legacySummary, research: researchSummary });
    const warnings = unique([
      ...legacySummary.warnings,
      ...researchSummary.warnings,
      ...comparisonSummary.notes,
      ...(readTopN !== (options.readTopN ?? DEFAULT_READ_TOP_N) ? [`readTopN_clamped_to_${readTopN}`] : []),
      ...(maxCandidates !== (options.maxCandidates ?? DEFAULT_MAX_CANDIDATES) ? [`maxCandidates_clamped_to_${maxCandidates}`] : []),
    ]);
    const errors = unique([
      ...legacySummary.errors,
      ...researchSummary.errors,
    ]);
    return finalize({
      ok: research.ok,
      query,
      legacySummary,
      researchSummary,
      comparisonSummary,
      warnings,
      errors,
      diagnosticsSnapshot: {
        developerDiagnosticsOnly: true,
        oldSearchPathModified: false,
        noteConversationTouched: false,
        legacyStatus: legacySummary.status,
        researchStatus: researchSummary.status,
        readTopN,
        maxReadTopN: MAX_READ_TOP_N,
        maxCandidates,
        maxCandidateLimit: MAX_CANDIDATES,
        recommendation: comparisonSummary.recommendation,
        comparisonSummary,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const researchSummary: ResearchEngineShadowCompareResearchSummary = {
      status: "aborted",
      ok: false,
      providerName: "none",
      candidateCount: 0,
      selectedCandidateCount: 0,
      successfulReads: 0,
      failedReads: 0,
      hostnames: [],
      urls: [],
      warnings: [],
      errors: [message],
    };
    const comparisonSummary = buildComparisonSummary({ legacy: legacySummary, research: researchSummary });
    return finalize({
      ok: false,
      query,
      legacySummary,
      researchSummary,
      comparisonSummary: { ...comparisonSummary, recommendation: "not_ready" },
      warnings: unique([...legacySummary.warnings, "research_shadow_compare_exception"]),
      errors: unique([...legacySummary.errors, message]),
      diagnosticsSnapshot: {
        developerDiagnosticsOnly: true,
        oldSearchPathModified: false,
        noteConversationTouched: false,
        legacyStatus: legacySummary.status,
        researchStatus: researchSummary.status,
        readTopN,
        maxReadTopN: MAX_READ_TOP_N,
        maxCandidates,
        maxCandidateLimit: MAX_CANDIDATES,
        recommendation: "not_ready",
      },
    });
  }
};
