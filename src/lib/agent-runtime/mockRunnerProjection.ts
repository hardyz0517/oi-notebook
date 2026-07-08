import type {
  RunnerAccessPolicy,
  RunnerClassification,
  RunnerKind,
  RunnerMockMode,
  RunnerMockResult,
  RunnerMockStatus,
  RunnerResourceLimits,
  RunnerSandboxPlan,
  RunnerTargetRef,
} from "./runnerContractTypes";

export const P14_MOCK_RUNNER_MODES: RunnerMockMode[] = [
  "dry-run",
  "classification-only",
  "fixture-simulation",
  "mock-success",
  "mock-failure",
  "unavailable",
  "blocked",
];

export const P14_MOCK_RUNNER_STATUSES: RunnerMockStatus[] = [
  "not-run",
  "planned",
  "completed",
  "failed",
  "blocked",
  "unavailable",
];

export type ProjectMockRunnerResultInput = {
  executionRequestId: string;
  runnerKind: RunnerKind;
  targetRefs: RunnerTargetRef[];
  requestedInputSummaries?: string[];
  expectedOutputSummaries?: string[];
  classification: RunnerClassification;
  sandboxPlan: RunnerSandboxPlan;
  resourceLimits: RunnerResourceLimits;
  mode?: RunnerMockMode;
  safeErrors?: string[];
  createdAt: string;
};

const SUMMARY_LIMIT = 240;

export function projectMockRunnerResult(input: ProjectMockRunnerResultInput): RunnerMockResult {
  const mode = resolveMode(input);
  const status = statusForMode(mode);

  return {
    mockResultId: `${input.executionRequestId}:mock:${mode}`,
    executionRequestId: input.executionRequestId,
    mode,
    status,
    plannedRunnerKind: input.runnerKind,
    plannedSandboxProfile: input.sandboxPlan.profile,
    safeInputSummary: buildSafeInputSummary(input),
    safeOutputSummary: buildSafeOutputSummary(input, mode, status),
    exitCodePreview: exitCodeForStatus(status),
    durationMsPreview: 0,
    filesTouchedPreview: filesTouchedPreviewFor(input, mode),
    networkAccessPreview: networkAccessPreviewFor(input),
    resourceLimitPreview: buildResourceLimitPreview(input),
    observationId: `${input.executionRequestId}:observation:${mode}`,
    safeErrors: safeErrorsFor(input, mode),
    createdAt: input.createdAt,
  };
}

function resolveMode(input: ProjectMockRunnerResultInput): RunnerMockMode {
  if (input.mode === "blocked" || hasBlockedMetadata(input)) {
    return "blocked";
  }

  if (input.mode === "unavailable") {
    return "unavailable";
  }

  return input.mode ?? "dry-run";
}

function statusForMode(mode: RunnerMockMode): RunnerMockStatus {
  switch (mode) {
    case "classification-only":
      return "not-run";
    case "dry-run":
      return "planned";
    case "fixture-simulation":
    case "mock-success":
      return "completed";
    case "mock-failure":
      return "failed";
    case "blocked":
      return "blocked";
    case "unavailable":
      return "unavailable";
  }
}

function buildSafeInputSummary(input: ProjectMockRunnerResultInput): string {
  const requestedInputs = input.requestedInputSummaries ?? [];
  const summaries =
    requestedInputs.length > 0 ? requestedInputs : Array.from(input.targetRefs, (targetRef) => targetRef.displayPath);
  const text = summaries.length > 0 ? summaries.join("; ") : "No runner input content is available in P14 preview.";

  return redactAndBound(text);
}

function buildSafeOutputSummary(
  input: ProjectMockRunnerResultInput,
  mode: RunnerMockMode,
  status: RunnerMockStatus,
): string {
  const expected = redactAndBound((input.expectedOutputSummaries ?? []).join("; "));
  const expectedSuffix = expected.length > 0 ? ` Expected preview: ${expected}.` : "";

  if (status === "completed") {
    return redactAndBound(
      `P14 ${mode} reached mock completion only. No process was started, no true test run occurred, and filesTouchedPreview is a fixture or planned ref count with no workspace mutation.${expectedSuffix}`,
    );
  }

  if (status === "failed") {
    return redactAndBound(`P14 ${mode} produced a safe mock failure only. No process was started.${expectedSuffix}`);
  }

  if (status === "blocked") {
    return redactAndBound(`P14 blocked this mock projection before any runner activity. ${blockedReasonsFor(input).join("; ")}`);
  }

  if (status === "unavailable") {
    return redactAndBound("P14 marks this runner projection unavailable; true execution remains unavailable.");
  }

  if (status === "not-run") {
    return redactAndBound(`P14 classification-only projection did not run anything.${expectedSuffix}`);
  }

  return redactAndBound(`P14 dry-run projection is planned metadata only. No process was started.${expectedSuffix}`);
}

function exitCodeForStatus(status: RunnerMockStatus): number | null {
  if (status === "completed") {
    return 0;
  }

  if (status === "failed") {
    return 1;
  }

  return null;
}

function filesTouchedPreviewFor(input: ProjectMockRunnerResultInput, mode: RunnerMockMode): number {
  if (mode === "fixture-simulation") {
    return Math.max(0, input.sandboxPlan.maxFilesTouched);
  }

  return Math.max(0, Math.min(input.sandboxPlan.maxFilesTouched, input.resourceLimits.maxFilesTouched));
}

function networkAccessPreviewFor(input: ProjectMockRunnerResultInput): RunnerAccessPolicy {
  if (input.sandboxPlan.networkAccess === "blocked" || input.resourceLimits.networkAccess === "blocked") {
    return "blocked";
  }

  if (
    input.sandboxPlan.networkAccess === "reserved-future-phase" ||
    input.resourceLimits.networkAccess === "reserved-future-phase" ||
    input.resourceLimits.trueExecution === "reserved"
  ) {
    return "reserved-future-phase";
  }

  return "none";
}

function buildResourceLimitPreview(input: ProjectMockRunnerResultInput): string {
  return [
    `timeoutMs=${input.resourceLimits.timeoutMs}`,
    `maxOutputBytes=${input.resourceLimits.maxOutputBytes}`,
    `maxInputBytes=${input.resourceLimits.maxInputBytes}`,
    `maxFilesTouched=${input.resourceLimits.maxFilesTouched}`,
    `networkAccess=${networkAccessPreviewFor(input)}`,
    `trueExecution=${input.resourceLimits.trueExecution}`,
  ].join("; ");
}

function safeErrorsFor(input: ProjectMockRunnerResultInput, mode: RunnerMockMode): string[] {
  const errors = [
    ...blockedReasonsFor(input),
    ...(mode === "mock-failure" ? ["mock_failure_preview_only"] : []),
    ...(input.safeErrors ?? []),
  ];

  return [...new Set(errors.map(redactAndBound).filter((error) => error.length > 0))];
}

function hasBlockedMetadata(input: ProjectMockRunnerResultInput): boolean {
  return (
    input.classification.blockedReasons.length > 0 ||
    input.sandboxPlan.blockedReasons.length > 0 ||
    input.sandboxPlan.profile === "blocked" ||
    input.resourceLimits.trueExecution === "blocked"
  );
}

function blockedReasonsFor(input: ProjectMockRunnerResultInput): string[] {
  return [...new Set([...input.classification.blockedReasons, ...input.sandboxPlan.blockedReasons])];
}

function redactAndBound(value: string): string {
  const redacted = value
    .replace(/authori(?:z|s)ation\s*:\s*[^;.\n\r]+/gi, "[redacted]")
    .replace(/raw\s+provider\s+payload\s*:\s*[^;.\n\r]+/gi, "[redacted]")
    .replace(/raw\s+tool\s+output\s*:\s*[^;.\n\r]+/gi, "[redacted]")
    .replace(/sk-[a-z0-9_-]+/gi, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();

  if (redacted.length <= SUMMARY_LIMIT) {
    return redacted;
  }

  return redacted.slice(0, SUMMARY_LIMIT - 3).trimEnd() + "...";
}
