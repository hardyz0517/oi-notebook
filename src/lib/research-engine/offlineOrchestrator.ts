import { buildAnswerContract } from "./answerContract";
import { buildEvidencePacket } from "./evidencePacket";
import { evaluateEvidencePacket } from "./evidenceEvaluator";
import { buildExcerpt } from "./excerptBuilder";
import { runDiscoveryPipelineOffline } from "./discoveryPipeline";
import { buildQueryPlan } from "./queryPlanner";
import { readMockCandidates } from "./mockUrlReader";
import { evaluateReaderQuality } from "./readerQuality";
import { buildSearchPolicyDecision } from "./searchPolicy";
import { selectPassages } from "./passageSelector";
import {
  createSchedulerSnapshot,
  scheduleCandidates,
  simulateSchedulerStep,
} from "./scheduler";
import { verifyGeneratedAnswer } from "./postGenerationVerifier";
import type {
  ResearchOfflineRunConfig,
  ResearchOfflineRunDiagnostics,
  ResearchOfflineRunInput,
  ResearchOfflineRunResult,
  ResearchOfflineRunStage,
  ResearchOfflineRunStatus,
  ResearchOfflineRunWarning,
  ResearchOfflineStageSummary,
} from "./offlineTypes";
import type {
  CandidatePoolSnapshot,
  CandidateSource,
  SchedulerSnapshot,
} from "./types";

export const createDefaultOfflineRunConfig = (): ResearchOfflineRunConfig => ({
  maxRawResults: 24,
  maxCandidates: 24,
  maxSelectedCandidates: 6,
  maxReadTargets: 4,
  maxConcurrentReads: 2,
  perHostLimit: 2,
  excerptBudget: { maxChars: 1400, maxBlocks: 6, reserveForMetadata: 200 },
  enableVerifier: true,
  developerDiagnostics: false,
});

const stage = (
  stageName: ResearchOfflineRunStage,
  status: ResearchOfflineStageSummary["status"],
  message: string,
  counts: Omit<ResearchOfflineStageSummary, "stage" | "status" | "message"> = {},
): ResearchOfflineStageSummary => ({
  stage: stageName,
  status,
  message,
  ...counts,
});

const uniqueWarnings = (warnings: ResearchOfflineRunWarning[]): ResearchOfflineRunWarning[] =>
  Array.from(new Set(warnings));

const emptyCandidateCounts = (): ResearchOfflineRunDiagnostics["candidateCounts"] => ({
  raw: 0,
  normalized: 0,
  deduped: 0,
  selected: 0,
  rejected: 0,
});

const candidateCounts = (pool?: CandidatePoolSnapshot): ResearchOfflineRunDiagnostics["candidateCounts"] =>
  pool
    ? {
        raw: pool.rawCount,
        normalized: pool.normalizedCount,
        deduped: pool.dedupedCount,
        selected: pool.selectedCount,
        rejected: pool.rejectedCount,
      }
    : emptyCandidateCounts();

const summarizeUnreadable = (readerResults: ResearchOfflineRunResult["readerResults"]): Record<string, number> =>
  readerResults.reduce((acc, result) => ({
    ...acc,
    [result.status]: (acc[result.status] ?? 0) + 1,
  }), {} as Record<string, number>);

const resultStatusFromContract = (
  answerMode: ResearchOfflineRunResult["answerContract"] extends infer Contract
    ? Contract extends { answerMode: infer Mode } ? Mode : never
    : never,
): ResearchOfflineRunStatus => {
  if (answerMode === "direct" || answerMode === "summarize_sources") return "ready";
  if (answerMode === "cautious") return "cautious";
  if (answerMode === "refuse_current_claim") return "refused";
  if (answerMode === "insufficient_evidence") return "insufficient_evidence";
  return "failed";
};

const diagnostics = (
  input: {
    stageSummaries: ResearchOfflineStageSummary[];
    warnings: ResearchOfflineRunWarning[];
    discoverySnapshot?: ResearchOfflineRunResult["discoverySnapshot"];
    candidatePool?: CandidatePoolSnapshot;
    schedulerSnapshot?: SchedulerSnapshot;
    readerResults: ResearchOfflineRunResult["readerResults"];
    evidenceEvaluation?: ResearchOfflineRunResult["evidenceEvaluation"];
    answerContract?: ResearchOfflineRunResult["answerContract"];
    verifierResult?: ResearchOfflineRunResult["verifierResult"];
  },
): ResearchOfflineRunDiagnostics => ({
  stageSummaries: input.stageSummaries,
  providerStatusSummary: (input.discoverySnapshot?.diagnostics.providerStatusSummary ?? {}) as Record<string, string>,
  candidateCounts: candidateCounts(input.candidatePool),
  selectedCandidateIds: input.candidatePool?.selectedCandidates.map((candidate) => candidate.id) ?? [],
  unreadableCounts: summarizeUnreadable(input.readerResults),
  evidenceSummary: input.evidenceEvaluation?.evidenceSummary,
  answerMode: input.answerContract?.answerMode,
  warnings: uniqueWarnings(input.warnings),
  reasons: [
    ...(input.discoverySnapshot?.errors.map((error) => error.kind) ?? []),
    ...(input.evidenceEvaluation?.missingEvidenceReasons ?? []),
    ...(input.verifierResult?.violations.map((violation) => violation.kind) ?? []),
  ],
  verifierPassed: input.verifierResult?.passed,
});

const scheduledCandidates = (snapshot: SchedulerSnapshot): CandidateSource[] => {
  const scheduledIds = new Set(snapshot.scheduledCandidateIds);
  return snapshot.candidates.filter((candidate) => scheduledIds.has(candidate.id));
};

const finishScheduledReads = (snapshot: SchedulerSnapshot): SchedulerSnapshot => {
  let next = snapshot;
  for (let stepIndex = 0; stepIndex < snapshot.config.maxReadTargets; stepIndex += 1) {
    next = simulateSchedulerStep(next, { nowMs: (stepIndex * 2) + 1 });
    if (next.readingCandidateIds.length === 0) break;
    next = simulateSchedulerStep(next, {
      finishCandidateIds: next.readingCandidateIds,
      nowMs: (stepIndex * 2) + 2,
    });
    if (next.finishedCandidateIds.length >= next.scheduledCandidateIds.length) break;
  }
  return next;
};

export const runResearchEngineOffline = (input: ResearchOfflineRunInput): ResearchOfflineRunResult => {
  const config = { ...createDefaultOfflineRunConfig(), ...input.config };
  const runId = input.runId ?? "offline-run-1";
  const policy = buildSearchPolicyDecision(input.request);
  const queryPlan = buildQueryPlan(input.request, policy);
  const stageSummaries: ResearchOfflineStageSummary[] = [
    stage("policy", "completed", policy.reason, { outputCount: policy.needSearch ? 1 : 0 }),
    stage("query", "completed", queryPlan.reason, { outputCount: queryPlan.queries.length }),
  ];
  const warnings: ResearchOfflineRunWarning[] = [];

  if (!policy.needSearch) {
    warnings.push("no_search_short_circuit");
    stageSummaries.push(stage("discovery", "skipped", "policy.needSearch=false"));
    stageSummaries.push(stage("reader", "skipped", "no_search_short_circuit"));
    stageSummaries.push(stage("done", "completed", "no_search"));
    const run: ResearchOfflineRunResult = {
      runId,
      request: input.request,
      policy,
      queryPlan,
      readerResults: [],
      qualityEvaluations: [],
      passageSelections: [],
      excerpts: [],
      warnings: uniqueWarnings(warnings),
      diagnostics: diagnostics({
        stageSummaries,
        warnings,
        readerResults: [],
      }),
      stageSummaries,
      status: "no_search",
    };
    return run;
  }

  const discoverySnapshot = runDiscoveryPipelineOffline({
    request: input.request,
    policy,
    queryPlan,
    config: {
      maxRawResults: config.maxRawResults,
      scenario: config.mockDiscoveryScenario,
    },
    candidatePoolConfig: {
      maxCandidates: config.maxCandidates,
      maxSelected: config.maxSelectedCandidates,
      perHostLimit: config.perHostLimit,
    },
  });
  if (discoverySnapshot.partial) warnings.push("discovery_partial");
  if (discoverySnapshot.mergedRawResults.length === 0) warnings.push("no_raw_results");
  stageSummaries.push(stage("discovery", discoverySnapshot.partial ? "partial" : "completed", "mock_discovery_completed", {
    inputCount: queryPlan.queries.length,
    outputCount: discoverySnapshot.mergedRawResults.length,
    warningCount: discoverySnapshot.errors.length,
  }));

  const candidatePool = discoverySnapshot.candidatePool;
  if (!candidatePool || candidatePool.selectedCandidates.length === 0) {
    warnings.push(candidatePool ? "no_selected_candidates" : "candidate_pool_empty");
    stageSummaries.push(stage("candidate", "failed", "no_selected_candidates", {
      inputCount: discoverySnapshot.mergedRawResults.length,
      outputCount: candidatePool?.selectedCount ?? 0,
    }));
    stageSummaries.push(stage("done", "failed", "insufficient_candidates"));
    const run: ResearchOfflineRunResult = {
      runId,
      request: input.request,
      policy,
      queryPlan,
      discoverySnapshot,
      candidatePool,
      readerResults: [],
      qualityEvaluations: [],
      passageSelections: [],
      excerpts: [],
      warnings: uniqueWarnings(warnings),
      diagnostics: diagnostics({
        stageSummaries,
        warnings,
        discoverySnapshot,
        candidatePool,
        readerResults: [],
      }),
      stageSummaries,
      status: "insufficient_evidence",
    };
    return run;
  }

  stageSummaries.push(stage("candidate", "completed", "candidate_pool_built", {
    inputCount: discoverySnapshot.mergedRawResults.length,
    outputCount: candidatePool.selectedCount,
    warningCount: candidatePool.rejectedCount,
  }));

  const schedulerSnapshot = finishScheduledReads(scheduleCandidates(createSchedulerSnapshot(runId, candidatePool.selectedCandidates, {
    maxCandidates: config.maxCandidates,
    maxReadTargets: config.maxReadTargets,
    maxConcurrentReads: config.maxConcurrentReads,
    perHostLimit: config.perHostLimit,
  })));
  const readTargets = scheduledCandidates(schedulerSnapshot);
  stageSummaries.push(stage("scheduler", "completed", "candidate_scheduler_snapshot_ready", {
    inputCount: candidatePool.selectedCandidates.length,
    outputCount: readTargets.length,
  }));

  const readerResults = readMockCandidates({
    request: input.request,
    policy,
    queryPlan,
    candidates: readTargets,
    scenario: config.mockReaderScenario,
  });
  const unreadableCount = readerResults.filter((result) => !["fetched", "partial", "homepage", "too_short"].includes(result.status)).length;
  if (unreadableCount > 0) warnings.push("reader_unreadable");
  if (readerResults.length > 0 && unreadableCount === readerResults.length) warnings.push("all_reader_results_unreadable");
  stageSummaries.push(stage("reader", unreadableCount === readerResults.length && readerResults.length > 0 ? "failed" : "completed", "mock_reader_completed", {
    inputCount: readTargets.length,
    outputCount: readerResults.length,
    warningCount: unreadableCount,
  }));

  const qualityEvaluations = readerResults.map(evaluateReaderQuality);
  stageSummaries.push(stage("quality", "completed", "reader_quality_evaluated", {
    inputCount: readerResults.length,
    outputCount: qualityEvaluations.length,
    warningCount: qualityEvaluations.reduce((sum, item) => sum + item.warnings.length, 0),
  }));

  const passageSelections = readerResults.map((readerResult, index) =>
    selectPassages({
      request: input.request,
      policy,
      queryPlan,
      readerResult,
      quality: qualityEvaluations[index],
      budget: config.excerptBudget,
    }),
  );
  stageSummaries.push(stage("passage", "completed", "passages_selected", {
    inputCount: readerResults.length,
    outputCount: passageSelections.reduce((sum, selection) => sum + selection.selectedPassages.length, 0),
  }));

  const excerpts = readerResults.map((readerResult, index) =>
    buildExcerpt({
      readerResult,
      quality: qualityEvaluations[index],
      selection: passageSelections[index],
      budget: config.excerptBudget,
    }),
  );
  stageSummaries.push(stage("excerpt", "completed", "excerpts_built", {
    inputCount: passageSelections.length,
    outputCount: excerpts.length,
    warningCount: excerpts.reduce((sum, excerpt) => sum + excerpt.warnings.length, 0),
  }));

  const evidencePacket = buildEvidencePacket({
    request: input.request,
    policy,
    queryPlan,
    items: readerResults.map((readerResult, index) => ({
      readerResult,
      readerQuality: qualityEvaluations[index],
      excerpt: excerpts[index],
    })),
  });
  const evidenceEvaluation = evaluateEvidencePacket({ packet: evidencePacket });
  if (!evidenceEvaluation.sufficient) warnings.push("evidence_insufficient");
  stageSummaries.push(stage("evidence", evidenceEvaluation.sufficient ? "completed" : "partial", "evidence_packet_evaluated", {
    inputCount: excerpts.length,
    outputCount: evidencePacket.evidenceItems.length,
    warningCount: evidenceEvaluation.missingEvidenceReasons.length,
  }));

  const answerContract = buildAnswerContract(evidenceEvaluation);
  stageSummaries.push(stage("contract", "completed", "answer_contract_built", {
    inputCount: evidencePacket.evidenceItems.length,
    outputCount: answerContract.allowedEvidenceIds.length,
    warningCount: answerContract.forbiddenClaims.length,
  }));

  const sample = typeof input.sampleGeneratedAnswer === "string"
    ? input.sampleGeneratedAnswer
    : input.sampleGeneratedAnswer?.generatedText;
  const verifierResult = config.enableVerifier && sample
    ? verifyGeneratedAnswer({ generatedText: sample, contract: answerContract })
    : undefined;
  if (verifierResult && !verifierResult.passed) warnings.push("verification_failed");
  if (verifierResult) {
    stageSummaries.push(stage("verifier", verifierResult.passed ? "completed" : "failed", "sample_answer_verified", {
      inputCount: 1,
      outputCount: verifierResult.passed ? 1 : 0,
      warningCount: verifierResult.violations.length,
    }));
  } else {
    stageSummaries.push(stage("verifier", "skipped", "no_sample_generated_answer"));
  }

  const status = resultStatusFromContract(answerContract.answerMode);
  stageSummaries.push(stage("done", status === "ready" || status === "cautious" ? "completed" : status === "failed" ? "failed" : "partial", status));
  const finalWarnings = uniqueWarnings(warnings);

  return {
    runId,
    request: input.request,
    policy,
    queryPlan,
    discoverySnapshot,
    candidatePool,
    schedulerSnapshot,
    readerResults,
    qualityEvaluations,
    passageSelections,
    excerpts,
    evidencePacket,
    evidenceEvaluation,
    answerContract,
    verifierResult,
    warnings: finalWarnings,
    diagnostics: diagnostics({
      stageSummaries,
      warnings: finalWarnings,
      discoverySnapshot,
      candidatePool,
      schedulerSnapshot,
      readerResults,
      evidenceEvaluation,
      answerContract,
      verifierResult,
    }),
    stageSummaries,
    status,
  };
};
