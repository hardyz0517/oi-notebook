import { summarizeResearchEngineSelfCheck } from "./selfCheckReporter";
import type {
  ResearchEngineDiagnostics,
  ResearchEngineDiagnosticExportOptions,
  ResearchEngineDiagnosticMessage,
  ResearchEngineDiagnosticSection,
  ResearchEngineJsonSafeValue,
  ResearchEngineSelfCheckDiagnosticsInput,
} from "./diagnosticsTypes";
import type { EvidenceStrength } from "./evidenceTypes";
import type { ResearchOfflineRunResult } from "./offlineTypes";
import type {
  CandidatePoolSnapshot,
  DiscoveryExecutionSnapshot,
  ResearchEngineSelfCheckResult,
} from "./types";

const DEFAULT_EXPORTED_AT_LABEL = "offline-diagnostics";
const DEFAULT_PREVIEW_CHARS = 180;
const SENSITIVE_KEY_PATTERN = /key|secret|token|authorization|cookie|body/i;

const preview = (value: unknown, maxChars = DEFAULT_PREVIEW_CHARS): string => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
};

const bump = (counts: Record<string, number>, key: string): void => {
  counts[key] = (counts[key] ?? 0) + 1;
};

const rejectedReasons = (pool?: CandidatePoolSnapshot): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const item of pool?.rejectedCandidates ?? []) bump(counts, item.reason);
  return counts;
};

const providerStatusSummary = (snapshot?: DiscoveryExecutionSnapshot): Record<string, string> =>
  (snapshot?.diagnostics.providerStatusSummary ?? {}) as Record<string, string>;

const errorSummary = (snapshot?: DiscoveryExecutionSnapshot): Record<string, number> =>
  (snapshot?.diagnostics.errorSummary ?? {}) as Record<string, number>;

const qualityCounts = (run: ResearchOfflineRunResult): Record<EvidenceStrength, number> => {
  const counts: Record<EvidenceStrength, number> = { strong: 0, medium: 0, weak: 0, none: 0 };
  for (const quality of run.qualityEvaluations) counts[quality.quality] += 1;
  return counts;
};

const readerStatusCounts = (run: ResearchOfflineRunResult): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const reader of run.readerResults) bump(counts, reader.status);
  return counts;
};

const compactSections = (run: ResearchOfflineRunResult): ResearchEngineDiagnosticSection[] => [
  {
    id: "stages",
    title: "Stages",
    severity: run.status === "ready" || run.status === "no_search" ? "success" : "warning",
    summary: `${run.stageSummaries.length} stage summaries`,
    rows: run.stageSummaries.map((stage) => ({
      stage: stage.stage,
      status: stage.status,
      message: preview(stage.message, 120),
      inputCount: stage.inputCount ?? null,
      outputCount: stage.outputCount ?? null,
      warningCount: stage.warningCount ?? null,
    })),
  },
  {
    id: "providers",
    title: "Providers",
    severity: run.discoverySnapshot?.errors.length ? "warning" : "info",
    summary: `${Object.keys(providerStatusSummary(run.discoverySnapshot)).length} providers`,
    rows: Object.entries(providerStatusSummary(run.discoverySnapshot)).map(([provider, status]) => ({
      provider,
      status,
    })),
  },
  {
    id: "candidates",
    title: "Candidate Pool",
    severity: run.candidatePool && run.candidatePool.selectedCount > 0 ? "success" : "warning",
    summary: `${run.candidatePool?.selectedCount ?? 0} selected candidates`,
    rows: (run.candidatePool?.selectedCandidates ?? []).slice(0, 12).map((candidate) => ({
      id: candidate.id,
      title: preview(candidate.title, 120),
      host: candidate.host,
      sourceType: candidate.sourceType,
      score: candidate.score ?? null,
    })),
  },
  {
    id: "evidence",
    title: "Evidence",
    severity: run.evidenceEvaluation?.sufficient ? "success" : "warning",
    summary: `${run.evidencePacket?.evidenceItems.length ?? 0} evidence items`,
    rows: (run.evidencePacket?.evidenceItems ?? []).slice(0, 12).map((item) => ({
      id: item.evidenceId,
      title: preview(item.title, 120),
      host: item.host,
      strength: item.evidenceStrength,
      relation: item.relation,
      excerptPreview: preview(item.excerptMarkdown, 160),
    })),
  },
];

const messagesFromRun = (run: ResearchOfflineRunResult): ResearchEngineDiagnosticMessage[] => [
  ...run.warnings.map((warning, index) => ({
    id: `warning-${index + 1}`,
    stage: "evidence" as const,
    severity: "warning" as const,
    message: warning,
  })),
  ...(run.discoverySnapshot?.errors.map((error, index) => ({
    id: `provider-error-${index + 1}`,
    stage: "discovery" as const,
    severity: "error" as const,
    message: error.kind,
    detail: preview(error.message, 160),
  })) ?? []),
  ...(run.verifierResult?.violations.map((violation, index) => ({
    id: `verifier-${index + 1}`,
    stage: "verifier" as const,
    severity: "error" as const,
    message: violation.kind,
    detail: preview(violation.message, 160),
  })) ?? []),
];

const redactedFields = (value: unknown, path = "$", seen = new WeakSet<object>()): string[] => {
  if (!value || typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value)) return value.flatMap((item, index) => redactedFields(item, `${path}[${index}]`, seen));
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const childPath = `${path}.${key}`;
    if (SENSITIVE_KEY_PATTERN.test(key)) return [childPath];
    return redactedFields(child, childPath, seen);
  });
};

export const buildDiagnosticsFromOfflineRun = (
  run: ResearchOfflineRunResult,
  options: ResearchEngineDiagnosticExportOptions = {},
): ResearchEngineDiagnostics => {
  const maxPreviewChars = options.maxPreviewChars ?? DEFAULT_PREVIEW_CHARS;
  const messages = messagesFromRun(run);
  const providerSummary = providerStatusSummary(run.discoverySnapshot);
  const selectedCandidateIds = run.candidatePool?.selectedCandidates.map((candidate) => candidate.id) ?? [];
  const verifierViolations = run.verifierResult?.violations ?? [];
  const redactions = Array.from(new Set([
    ...redactedFields(run.request),
    ...redactedFields(run.discoverySnapshot?.providerResponses),
    "excerptMarkdown",
  ]));
  const diagnostics: ResearchEngineDiagnostics = {
    schemaVersion: 1,
    runId: run.runId,
    exportedAtLabel: options.exportedAtLabel ?? DEFAULT_EXPORTED_AT_LABEL,
    requestPreview: preview(run.request.userQuestion, maxPreviewChars),
    summary: {
      status: run.status,
      stageCount: run.stageSummaries.length,
      warningCount: run.warnings.length,
      errorCount: messages.filter((message) => message.severity === "error" || message.severity === "blocked").length,
      providerCount: Object.keys(providerSummary).length,
      selectedCandidateCount: selectedCandidateIds.length,
      unreadableReaderCount: Object.entries(readerStatusCounts(run))
        .filter(([status]) => !["fetched", "partial", "homepage", "too_short"].includes(status))
        .reduce((sum, [, count]) => sum + count, 0),
      evidenceSummary: run.evidenceEvaluation?.evidenceSummary,
      answerMode: run.answerContract?.answerMode,
      verifierPassed: run.verifierResult?.passed,
    },
    snapshot: {
      policy: {
        mode: run.policy.mode,
        risk: run.policy.risk,
        freshness: run.policy.freshness,
        vertical: run.policy.vertical,
        needSearch: run.policy.needSearch,
        reason: preview(run.policy.reason, maxPreviewChars),
      },
      queryPlan: {
        queryCount: run.queryPlan.queries.length,
        queries: run.queryPlan.queries.map((query) => ({
          queryPreview: preview(query.query, maxPreviewChars),
          purpose: query.purpose,
          priority: query.priority,
        })),
      },
      discovery: {
        providerStatusSummary: providerSummary,
        errorSummary: errorSummary(run.discoverySnapshot),
        rawResultCount: run.discoverySnapshot?.mergedRawResults.length ?? 0,
        providerResponseCount: run.discoverySnapshot?.providerResponses.length ?? 0,
      },
      candidatePool: {
        rawCount: run.candidatePool?.rawCount ?? 0,
        normalizedCount: run.candidatePool?.normalizedCount ?? 0,
        dedupedCount: run.candidatePool?.dedupedCount ?? 0,
        selectedCount: run.candidatePool?.selectedCount ?? 0,
        rejectedCount: run.candidatePool?.rejectedCount ?? 0,
        selectedCandidateIds,
        rejectedReasons: rejectedReasons(run.candidatePool),
      },
      scheduler: {
        scheduledCount: run.schedulerSnapshot?.scheduledCandidateIds.length ?? 0,
        readingCount: run.schedulerSnapshot?.readingCandidateIds.length ?? 0,
        finishedCount: run.schedulerSnapshot?.finishedCandidateIds.length ?? 0,
        rejectedCount: run.schedulerSnapshot?.rejectedCandidateIds.length ?? 0,
        zombieCount: run.schedulerSnapshot?.zombieCandidateIds.length ?? 0,
      },
      reader: {
        resultCount: run.readerResults.length,
        statusCounts: readerStatusCounts(run),
        qualityCounts: qualityCounts(run),
      },
      evidence: {
        status: run.evidencePacket?.status,
        itemCount: run.evidencePacket?.evidenceItems.length ?? 0,
        conflicts: run.evidencePacket?.conflicts.length ?? 0,
        missingEvidenceReasons: run.evidenceEvaluation?.missingEvidenceReasons.map((reason) => preview(reason, maxPreviewChars)) ?? [],
        summary: run.evidenceEvaluation?.evidenceSummary,
      },
      contract: run.answerContract ? {
        answerMode: run.answerContract.answerMode,
        mustCite: run.answerContract.mustCite,
        allowedEvidenceCount: run.answerContract.allowedEvidenceIds.length,
        forbiddenClaimCount: run.answerContract.forbiddenClaims.length,
        fallbackPreview: preview(run.answerContract.fallbackMessage, maxPreviewChars),
      } : undefined,
      verifier: {
        passed: run.verifierResult?.passed,
        violationCount: verifierViolations.length,
        violationKinds: verifierViolations.map((violation) => violation.kind),
        safeFallbackPreview: preview(run.verifierResult?.safeFallback, maxPreviewChars),
      },
    },
    sections: options.includeSections === false ? [] : compactSections(run),
    messages,
    warnings: run.warnings,
    errors: messages.filter((message) => message.severity === "error").map((message) => message.message),
    stageSummaries: run.stageSummaries,
    redaction: {
      redacted: true,
      redactedFields: redactions,
    },
  };
  return toJsonSafeDiagnostics(diagnostics) as ResearchEngineDiagnostics;
};

export const buildDiagnosticsFromSelfCheck = (
  input: ResearchEngineSelfCheckDiagnosticsInput | ResearchEngineSelfCheckResult[],
  options: ResearchEngineDiagnosticExportOptions = {},
): ResearchEngineDiagnostics => {
  const results = Array.isArray(input) ? input : input.results;
  const exportedAtLabel = Array.isArray(input) ? options.exportedAtLabel : input.exportedAtLabel ?? options.exportedAtLabel;
  const summary = summarizeResearchEngineSelfCheck(results);
  const messages: ResearchEngineDiagnosticMessage[] = summary.failedCases.map((failure, index) => ({
    id: `self-check-failure-${index + 1}`,
    stage: "self_check",
    severity: "error",
    message: failure.id,
    detail: failure.failures.join("; "),
  }));
  const diagnostics: ResearchEngineDiagnostics = {
    schemaVersion: 1,
    exportedAtLabel: exportedAtLabel ?? DEFAULT_EXPORTED_AT_LABEL,
    summary: {
      status: summary.failed === 0 ? "success" : "failed",
      stageCount: summary.byPhase.length,
      warningCount: 0,
      errorCount: summary.failed,
      providerCount: 0,
      selectedCandidateCount: 0,
      unreadableReaderCount: 0,
    },
    snapshot: { selfCheck: summary },
    sections: [{
      id: "self-check",
      title: "SelfCheck",
      severity: summary.failed === 0 ? "success" : "error",
      summary: `${summary.passed}/${summary.total} passed`,
      rows: summary.byPhase.map((phase) => ({
        phase: phase.phase,
        total: phase.total,
        passed: phase.passed,
        failed: phase.failed,
        passRate: phase.passRate,
      })),
    }],
    messages,
    warnings: [],
    errors: messages.map((message) => message.message),
    stageSummaries: [],
    redaction: {
      redacted: true,
      redactedFields: [],
    },
  };
  return toJsonSafeDiagnostics(diagnostics) as ResearchEngineDiagnostics;
};

export const buildResearchEngineDiagnostics = (
  input: ResearchOfflineRunResult | ResearchEngineSelfCheckResult[],
  options: ResearchEngineDiagnosticExportOptions = {},
): ResearchEngineDiagnostics =>
  Array.isArray(input)
    ? buildDiagnosticsFromSelfCheck(input, options)
    : buildDiagnosticsFromOfflineRun(input, options);

export const toJsonSafeDiagnostics = (value: unknown): ResearchEngineJsonSafeValue => {
  const seen = new WeakSet<object>();
  const convert = (input: unknown, path: string): ResearchEngineJsonSafeValue => {
    if (input === undefined || typeof input === "function" || typeof input === "symbol") return null;
    if (input === null || typeof input === "string" || typeof input === "number" || typeof input === "boolean") {
      if (typeof input === "number" && !Number.isFinite(input)) return null;
      if (typeof input === "string" && SENSITIVE_KEY_PATTERN.test(path)) return "<redacted>";
      return input;
    }
    if (input instanceof Error) return { name: input.name, message: preview(input.message, 160) };
    if (Array.isArray(input)) return input.map((item, index) => convert(item, `${path}[${index}]`));
    if (typeof input === "object") {
      if (seen.has(input)) return "[Circular]";
      seen.add(input);
      const out: Record<string, ResearchEngineJsonSafeValue> = {};
      for (const [key, child] of Object.entries(input as Record<string, unknown>)) {
        if (child === undefined || typeof child === "function" || typeof child === "symbol") continue;
        out[key] = SENSITIVE_KEY_PATTERN.test(key) ? "<redacted>" : convert(child, `${path}.${key}`);
      }
      seen.delete(input);
      return out;
    }
    return null;
  };
  return convert(value, "$");
};
