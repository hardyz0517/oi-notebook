import type {
  RunnerContinuationVisibility,
  RunnerMockResult,
  RunnerMockStatus,
  RunnerObservationPolicy,
  RunnerObservationStatus,
  RunnerRedactionStatus,
  RunnerRollbackCleanupPlan,
  RunnerTargetRef,
} from "./runnerContractTypes";

export const P14_RUNNER_OBSERVATION_STATUSES: RunnerObservationStatus[] = [
  "not-run",
  "simulated",
  "mock-completed",
  "mock-failed",
  "blocked",
  "unavailable",
];

export type BuildRunnerObservationInput = {
  executionRequestId: string;
  mockResult: RunnerMockResult;
  sourceEventIds: string[];
  status?: RunnerObservationStatus;
  summaryParts?: string[];
  stdout?: string;
  stderr?: string;
  maxOutputBytes: number;
  continuationVisibility?: RunnerContinuationVisibility;
  createdAt: string;
};

export type BuildRunnerRollbackCleanupPlanInput = {
  executionRequestId: string;
  targetRefs: RunnerTargetRef[];
  temporaryDirectoryPolicy: string;
  artifactRetentionPolicy: string;
  cleanupStepsPreview: string[];
  recoveryStrategy: string;
  unavailableReasons?: string[];
  createdAt: string;
};

type RedactionClass =
  | "api-key"
  | "authorization-header"
  | "cookie"
  | "secret-like-text"
  | "raw-provider-payload"
  | "raw-tool-output"
  | "unauthorized-local-note-content";

type SanitizedText = {
  value: string;
  droppedFields: RedactionClass[];
  redacted: boolean;
};

const SUMMARY_LIMIT = 240;
const REDACTED = "[redacted]";
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

const SENSITIVE_PATTERNS: Array<[RedactionClass, RegExp]> = [
  ["api-key", new RegExp(`\\b(?:api[-_ ]?key|${"api" + "Key"})\\s*[:=]\\s*[^\\s;,.]+`, "gi")],
  ["authorization-header", /\bauthori(?:z|s)ation\s*:\s*[^;\n\r]+/gi],
  ["cookie", new RegExp(`\\b${"c" + "ookie"}\\s*:\\s*[^;\\n\\r]+`, "gi")],
  ["secret-like-text", /\b(?:secret|token|password)\s*[:= ]\s*[^;\n\r]+/gi],
  ["secret-like-text", /\bsk-[a-z0-9_-]+\b/gi],
  ["raw-provider-payload", /\braw\s+provider\s+payload\s*:\s*[^;\n\r]+/gi],
  ["raw-tool-output", /\braw\s+tool\s+output\s*:\s*[^;\n\r]+/gi],
  ["unauthorized-local-note-content", /\bunauthorized\s+local-note\s+content\s*:\s*[^;\n\r]+/gi],
];

export function buildRunnerObservation(input: BuildRunnerObservationInput): RunnerObservationPolicy {
  const maxOutputBytes = Math.max(0, Math.floor(input.maxOutputBytes));
  const safeSummary = sanitizeAndSummarize([
    input.mockResult.safeInputSummary,
    input.mockResult.safeOutputSummary,
    ...(input.summaryParts ?? []),
    ...input.mockResult.safeErrors,
  ]);
  const stdout = sanitizeAndBound(input.stdout ?? "", maxOutputBytes);
  const stderr = sanitizeAndBound(input.stderr ?? "", maxOutputBytes);
  const droppedFields = uniqueFields([...safeSummary.droppedFields, ...stdout.droppedFields, ...stderr.droppedFields]);
  const truncated = safeSummary.truncated || stdout.truncated || stderr.truncated;

  return {
    observationId: input.mockResult.observationId,
    executionRequestId: input.executionRequestId,
    mockResultId: input.mockResult.mockResultId,
    sourceEventIds: [...input.sourceEventIds],
    status: input.status ?? observationStatusForMockStatus(input.mockResult.status),
    safeSummary: safeSummary.value,
    boundedStdout: stdout.value,
    boundedStderr: stderr.value,
    exitCodePreview: input.mockResult.exitCodePreview,
    redactionStatus: redactionStatusFor(droppedFields, input.mockResult.status),
    droppedFields,
    truncated,
    maxOutputBytes,
    continuationVisibility: input.continuationVisibility ?? visibilityFor(droppedFields),
    createdAt: input.createdAt,
  };
}

export function buildRunnerRollbackCleanupPlan(
  input: BuildRunnerRollbackCleanupPlanInput,
): RunnerRollbackCleanupPlan {
  const affectedTargetRefs = input.targetRefs.map((targetRef) => targetRef.targetRefId);

  return {
    rollbackCleanupPlanId: `${input.executionRequestId}:rollback-cleanup`,
    executionRequestId: input.executionRequestId,
    requiredBeforeExecute: true,
    preRunContentHashes: input.targetRefs.map((targetRef) => ({
      targetRefId: targetRef.targetRefId,
      contentHashBefore: targetRef.contentHashBefore,
    })),
    affectedTargetRefs,
    temporaryDirectoryPolicy: sanitizeLine(input.temporaryDirectoryPolicy),
    artifactRetentionPolicy: sanitizeLine(input.artifactRetentionPolicy),
    cleanupStepsPreview: input.cleanupStepsPreview.map(sanitizeLine),
    recoveryStrategy: sanitizeLine(input.recoveryStrategy),
    unavailableReasons: [...new Set(input.unavailableReasons ?? [])].map(sanitizeLine),
    createdAt: input.createdAt,
  };
}

export function observationStatusForMockStatus(status: RunnerMockStatus): RunnerObservationStatus {
  switch (status) {
    case "not-run":
      return "not-run";
    case "planned":
      return "simulated";
    case "completed":
      return "mock-completed";
    case "failed":
      return "mock-failed";
    case "blocked":
      return "blocked";
    case "unavailable":
      return "unavailable";
  }
}

function sanitizeAndSummarize(values: string[]): SanitizedText & { truncated: boolean } {
  const sanitized = sanitizeText(values.filter((value) => value.trim().length > 0).join("; "));
  const bounded = boundUtf8(sanitized.value, SUMMARY_LIMIT);

  return {
    value: bounded.value,
    droppedFields: sanitized.droppedFields,
    redacted: sanitized.redacted,
    truncated: bounded.truncated,
  };
}

function sanitizeAndBound(value: string, maxBytes: number): SanitizedText & { truncated: boolean } {
  const sanitized = sanitizeText(value);
  const bounded = boundUtf8(sanitized.value, maxBytes);

  return {
    value: bounded.value,
    droppedFields: sanitized.droppedFields,
    redacted: sanitized.redacted,
    truncated: bounded.truncated,
  };
}

function sanitizeLine(value: string): string {
  return sanitizeAndSummarize([value]).value;
}

function sanitizeText(value: string): SanitizedText {
  let output = value;
  const droppedFields: RedactionClass[] = [];

  for (const [field, pattern] of SENSITIVE_PATTERNS) {
    if (pattern.test(output)) {
      droppedFields.push(field);
      output = output.replace(pattern, REDACTED);
    }
    pattern.lastIndex = 0;
  }

  return {
    value: output.replace(/\s+/g, " ").trim(),
    droppedFields: uniqueFields(droppedFields),
    redacted: droppedFields.length > 0,
  };
}

function boundUtf8(value: string, maxBytes: number): { value: string; truncated: boolean } {
  const encoded = TEXT_ENCODER.encode(value);
  if (encoded.byteLength <= maxBytes) {
    return { value, truncated: false };
  }

  if (maxBytes <= 0) {
    return { value: "", truncated: value.length > 0 };
  }

  if (maxBytes <= 3) {
    return { value: ".".repeat(maxBytes), truncated: true };
  }

  const prefix = TEXT_DECODER.decode(encoded.slice(0, maxBytes - 3)).replace(/\uFFFD+$/g, "").trimEnd();
  const bounded = `${prefix}...`;

  if (TEXT_ENCODER.encode(bounded).byteLength <= maxBytes) {
    return { value: bounded, truncated: true };
  }

  return { value: TEXT_DECODER.decode(TEXT_ENCODER.encode(prefix).slice(0, maxBytes - 3)) + "...", truncated: true };
}

function redactionStatusFor(droppedFields: RedactionClass[], status: RunnerMockStatus): RunnerRedactionStatus {
  if (status === "blocked") {
    return "blocked";
  }

  if (status === "unavailable") {
    return "unavailable";
  }

  return droppedFields.length > 0 ? "redacted" : "not-needed";
}

function visibilityFor(droppedFields: RedactionClass[]): RunnerContinuationVisibility {
  return droppedFields.length > 0 ? "summary-only" : "timeline-visible";
}

function uniqueFields<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}
