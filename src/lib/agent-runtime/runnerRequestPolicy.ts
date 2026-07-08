import {
  classifyRunnerRequest,
  collectRunnerRequestBlockedReasons,
  type ClassifyRunnerRequestInput,
} from "./runnerClassificationPolicy";
import {
  createRunnerExecutionRequestEnvelope,
  P14_RUNNER_SCHEMA_VERSION,
  type RunnerAccessPolicy,
  type RunnerApprovalDecisionReadModel,
  type RunnerCapabilityStatus,
  type RunnerExecutionRequestEnvelope,
  type RunnerExpectedOutputRef,
  type RunnerInputRef,
  type RunnerKind,
  type RunnerMockResult,
  type RunnerObservationPolicy,
  type RunnerPermissionKind,
  type RunnerPermissionRequest,
  type RunnerRedactionResult,
  type RunnerRequestedCapability,
  type RunnerRequestSourceKind,
  type RunnerResourceLimits,
  type RunnerRollbackCleanupPlan,
  type RunnerSandboxPlan,
  type RunnerSandboxProfile,
  type RunnerTargetRef,
} from "./runnerContractTypes";

export type NormalizeRunnerRequestInput = {
  executionRequestId: string;
  sessionId: string;
  turnId: string;
  stepId: string;
  sourceKind: RunnerRequestSourceKind;
  sourceEventIds: string[];
  workspaceRefs: string[];
  evidenceRefs: string[];
  targetRefs: RunnerTargetRef[];
  runnerKind: RunnerKind;
  command?: string;
  languageId?: string;
  testIntent?: string;
  requestedInputSummaries?: string[];
  expectedOutputSummaries?: string[];
  workingDirectoryRef: string;
  timeoutMs: number;
  maxOutputBytes?: number;
  maxInputBytes: number;
  requestedCapabilities?: RunnerRequestedCapability[];
  requestedTrueExecution?: boolean;
  rawProviderPayload?: unknown;
  rawToolOutput?: unknown;
  requestSummary?: string;
  createdAt: string;
};

export type RunnerRequestValidationResult = {
  validationId: string;
  executionRequestId: string;
  status: "passed" | "blocked";
  safeErrors: string[];
  createdAt: string;
};

const SUMMARY_LIMIT = 160;
const DEFAULT_BOUNDED_OUTPUT_BYTES = 4096;

export function normalizeRunnerRequest(input: NormalizeRunnerRequestInput): RunnerExecutionRequestEnvelope {
  const classificationInput = toClassificationInput(input);
  const classification = classifyRunnerRequest(classificationInput);
  const blockedReasons = classification.blockedReasons;
  const isBlocked = blockedReasons.length > 0;
  const capabilityStatus: RunnerCapabilityStatus = isBlocked ? "blocked" : "preview";
  const safeSummary = redactAndBoundSummary(input.requestSummary ?? input.command ?? "Runner request preview.");
  const redactedClasses = collectRedactedClasses(input);
  const sandboxPlan = createSandboxPlan(input, blockedReasons);
  const resourceLimits = createResourceLimits(input, isBlocked, classification.requiresNetwork, classification.requiresWritableWorkspace);
  const permissionRequest = createPermissionRequest(input, isBlocked, sandboxPlan.sandboxPlanId, blockedReasons);
  const approvalDecision = createApprovalDecision(input, isBlocked, permissionRequest.permissionRequestId, blockedReasons);
  const mockResult = createMockResult(input, isBlocked, sandboxPlan.profile, safeSummary);
  const observationPolicy = createObservationPolicy(input, isBlocked, mockResult.mockResultId, redactedClasses);
  const rollbackCleanupPlan = createRollbackCleanupPlan(input, isBlocked);
  const redactionResult = {
    redactionStatus: redactedClasses.length > 0 ? "redacted" : "not-needed",
    redactedClasses,
    safeSummary,
  } satisfies RunnerRedactionResult;

  return createRunnerExecutionRequestEnvelope({
    executionRequestId: input.executionRequestId,
    sessionId: input.sessionId,
    turnId: input.turnId,
    stepId: input.stepId,
    sourceKind: input.sourceKind,
    sourceEventIds: [...input.sourceEventIds],
    workspaceRefs: [...input.workspaceRefs],
    evidenceRefs: [...input.evidenceRefs],
    targetRefs: input.targetRefs.map(copyTargetRef),
    runnerKind: input.runnerKind,
    runnerIntent: {
      summary: safeSummary,
      commandClass: classification.commandClass,
      languageClass: classification.languageClass,
      testRunClass: classification.testRunClass,
    },
    classification,
    requestedInputs: createInputRefs(input),
    expectedOutputs: createExpectedOutputRefs(input),
    sandboxPlan,
    resourceLimits,
    permissionRequest,
    approvalDecision,
    mockResult,
    observationPolicy,
    rollbackCleanupPlan,
    redactionResult,
    capabilityStatus,
    createdAt: input.createdAt,
    schemaVersion: P14_RUNNER_SCHEMA_VERSION,
  });
}

export function validateRunnerRequestEnvelope(envelope: RunnerExecutionRequestEnvelope): RunnerRequestValidationResult {
  const classificationInput: ClassifyRunnerRequestInput = {
    executionRequestId: envelope.executionRequestId,
    runnerKind: envelope.runnerKind,
    command: envelope.runnerIntent.summary,
    languageId: envelope.runnerIntent.languageClass,
    testIntent: envelope.runnerIntent.testRunClass,
    workspaceRefs: envelope.workspaceRefs,
    workingDirectoryRef: envelope.sandboxPlan.workingDirectoryRef,
    targetRefs: envelope.targetRefs,
    maxOutputBytes: envelope.resourceLimits.maxOutputBytes,
    requestedCapabilities: [],
    requestedTrueExecution: envelope.resourceLimits.trueExecution === "blocked",
    createdAt: envelope.createdAt,
  };
  const safeErrors = collectRunnerRequestBlockedReasons(classificationInput);

  return {
    validationId: `${envelope.executionRequestId}:validation`,
    executionRequestId: envelope.executionRequestId,
    status: safeErrors.length > 0 ? "blocked" : "passed",
    safeErrors,
    createdAt: envelope.createdAt,
  };
}

function toClassificationInput(input: NormalizeRunnerRequestInput): ClassifyRunnerRequestInput {
  return {
    executionRequestId: input.executionRequestId,
    runnerKind: input.runnerKind,
    command: input.command,
    languageId: input.languageId,
    testIntent: input.testIntent,
    workspaceRefs: [...input.workspaceRefs],
    workingDirectoryRef: input.workingDirectoryRef,
    targetRefs: input.targetRefs.map(copyTargetRef),
    maxOutputBytes: input.maxOutputBytes,
    requestedCapabilities: [...(input.requestedCapabilities ?? [])],
    requestedTrueExecution: input.requestedTrueExecution,
    createdAt: input.createdAt,
  };
}

function createInputRefs(input: NormalizeRunnerRequestInput): RunnerInputRef[] {
  return (input.requestedInputSummaries ?? []).map((safeSummary, index) => ({
    inputRefId: `${input.executionRequestId}:input:${index + 1}`,
    inputKind: "stdin-fixture",
    safeSummary: redactAndBoundSummary(safeSummary),
  }));
}

function createExpectedOutputRefs(input: NormalizeRunnerRequestInput): RunnerExpectedOutputRef[] {
  return (input.expectedOutputSummaries ?? []).map((safeSummary, index) => ({
    outputRefId: `${input.executionRequestId}:expected-output:${index + 1}`,
    outputKind: "expected-output-fixture",
    safeSummary: redactAndBoundSummary(safeSummary),
  }));
}

function createSandboxPlan(input: NormalizeRunnerRequestInput, blockedReasons: string[]): RunnerSandboxPlan {
  const profile: RunnerSandboxProfile = blockedReasons.length > 0 ? "blocked" : "read-only-classification";

  return {
    sandboxPlanId: `${input.executionRequestId}:sandbox`,
    profile,
    workingDirectoryRef: input.workingDirectoryRef,
    allowedTargetRefs: input.targetRefs.map((targetRef) => targetRef.targetRefId),
    networkAccess: accessFor(input, "network"),
    secretAccess: secretAccessFor(input),
    credentialAccess: secretAccessFor(input),
    writeAccess: writeAccessFor(input),
    maxFilesTouched: 0,
    timeoutMs: input.timeoutMs,
    maxOutputBytes: input.maxOutputBytes ?? DEFAULT_BOUNDED_OUTPUT_BYTES,
    maxInputBytes: input.maxInputBytes,
    environmentPolicy: "preview-only-no-process",
    cleanupPolicy: "no-op",
    blockedReasons: [...blockedReasons],
    createdAt: input.createdAt,
  };
}

function createResourceLimits(
  input: NormalizeRunnerRequestInput,
  isBlocked: boolean,
  requiresNetwork: boolean,
  requiresWritableWorkspace: boolean,
): RunnerResourceLimits {
  return {
    timeoutMs: input.timeoutMs,
    maxOutputBytes: input.maxOutputBytes ?? DEFAULT_BOUNDED_OUTPUT_BYTES,
    maxInputBytes: input.maxInputBytes,
    maxFilesTouched: 0,
    networkAccess: requiresNetwork ? "blocked" : "none",
    secretAccess: secretAccessFor(input),
    writeAccess: requiresWritableWorkspace ? "blocked" : "none",
    trueExecution: isBlocked && input.requestedTrueExecution === true ? "blocked" : "unavailable",
  };
}

function createPermissionRequest(
  input: NormalizeRunnerRequestInput,
  isBlocked: boolean,
  sandboxPlanId: string,
  blockedReasons: string[],
): RunnerPermissionRequest {
  return {
    permissionRequestId: `${input.executionRequestId}:permission`,
    executionRequestId: input.executionRequestId,
    permissionKind: permissionKindFor(input),
    decisionStatus: isBlocked ? "blocked-by-configuration" : "prompt-required",
    riskLevel: isBlocked ? "blocked" : "high",
    reason: isBlocked
      ? `P14 preview blocks this request: ${blockedReasons.join(", ")}.`
      : "P14 preview requires future approval before true execution.",
    requestedByEventId: input.sourceEventIds[0] ?? "event:p14:unknown",
    targetRefs: input.targetRefs.map((targetRef) => targetRef.targetRefId),
    sandboxPlanId,
    approvalSurface: "workbench-read-only",
    createdAt: input.createdAt,
  };
}

function createApprovalDecision(
  input: NormalizeRunnerRequestInput,
  isBlocked: boolean,
  permissionRequestId: string,
  blockedReasons: string[],
): RunnerApprovalDecisionReadModel {
  return {
    approvalDecisionId: `${input.executionRequestId}:approval`,
    permissionRequestId,
    executionRequestId: input.executionRequestId,
    status: isBlocked ? "blocked" : "unavailable",
    decidedBy: "p14-policy-preview",
    safeReason: isBlocked
      ? "Request is blocked by P14 preview policy metadata."
      : "True execution is unavailable in P14; approval is a future-phase read model only.",
    visibleConsequences: ["No command is run and no workspace mutation is performed in P14."],
    blockedCapabilities: isBlocked ? [...blockedReasons] : ["real-process-execution"],
    eventIds: [`${input.executionRequestId}:approval:preview`],
    createdAt: input.createdAt,
  };
}

function createMockResult(
  input: NormalizeRunnerRequestInput,
  isBlocked: boolean,
  sandboxProfile: RunnerSandboxProfile,
  safeSummary: string,
): RunnerMockResult {
  return {
    mockResultId: `${input.executionRequestId}:mock`,
    executionRequestId: input.executionRequestId,
    mode: isBlocked ? "blocked" : "classification-only",
    status: isBlocked ? "blocked" : "planned",
    plannedRunnerKind: input.runnerKind,
    plannedSandboxProfile: sandboxProfile,
    safeInputSummary: safeSummary,
    safeOutputSummary: isBlocked
      ? "P14 policy blocked this request before any runner output exists."
      : "P14 classification preview only; no runner output exists.",
    exitCodePreview: null,
    durationMsPreview: 0,
    filesTouchedPreview: 0,
    networkAccessPreview: accessFor(input, "network"),
    resourceLimitPreview: "bounded-preview",
    observationId: `${input.executionRequestId}:observation`,
    safeErrors: isBlocked ? collectRunnerRequestBlockedReasons(toClassificationInput(input)) : [],
    createdAt: input.createdAt,
  };
}

function createObservationPolicy(
  input: NormalizeRunnerRequestInput,
  isBlocked: boolean,
  mockResultId: string,
  redactedClasses: string[],
): RunnerObservationPolicy {
  return {
    observationId: `${input.executionRequestId}:observation`,
    executionRequestId: input.executionRequestId,
    mockResultId,
    sourceEventIds: [`${input.executionRequestId}:mock:preview`],
    status: isBlocked ? "blocked" : "not-run",
    safeSummary: isBlocked ? "P14 runner request was blocked before execution." : "P14 runner request was classified only.",
    boundedStdout: "",
    boundedStderr: "",
    exitCodePreview: null,
    redactionStatus: redactedClasses.length > 0 ? "redacted" : "not-needed",
    droppedFields: redactedClasses,
    truncated: false,
    maxOutputBytes: input.maxOutputBytes ?? DEFAULT_BOUNDED_OUTPUT_BYTES,
    continuationVisibility: redactedClasses.length > 0 ? "summary-only" : "timeline-visible",
    createdAt: input.createdAt,
  };
}

function createRollbackCleanupPlan(input: NormalizeRunnerRequestInput, isBlocked: boolean): RunnerRollbackCleanupPlan {
  return {
    rollbackCleanupPlanId: `${input.executionRequestId}:cleanup`,
    executionRequestId: input.executionRequestId,
    requiredBeforeExecute: true,
    preRunContentHashes: input.targetRefs
      .filter((targetRef) => targetRef.contentHashBefore.length > 0)
      .map((targetRef) => ({
        targetRefId: targetRef.targetRefId,
        contentHashBefore: targetRef.contentHashBefore,
      })),
    affectedTargetRefs: input.targetRefs.map((targetRef) => targetRef.targetRefId),
    temporaryDirectoryPolicy: "ref-only-no-op",
    artifactRetentionPolicy: "preview-only",
    cleanupStepsPreview: ["No cleanup is executed in P14."],
    recoveryStrategy: "Future execution must prove recovery before running.",
    unavailableReasons: isBlocked ? ["runner_request_blocked"] : ["true_cleanup_unavailable_in_p14"],
    createdAt: input.createdAt,
  };
}

function permissionKindFor(input: NormalizeRunnerRequestInput): RunnerPermissionKind {
  const capabilities = new Set(input.requestedCapabilities ?? []);

  if (input.requestedTrueExecution === true || capabilities.has("true-execution")) {
    return "execute";
  }

  if (capabilities.has("network")) {
    return "public-network";
  }

  if (capabilities.has("patch-apply")) {
    return "patch-apply";
  }

  if (capabilities.has("delete")) {
    return "delete";
  }

  if (capabilities.has("rollback-execution")) {
    return "rollback";
  }

  if (capabilities.has("filesystem-mutation")) {
    return "write";
  }

  return "execute";
}

function accessFor(input: NormalizeRunnerRequestInput, capability: RunnerRequestedCapability): RunnerAccessPolicy {
  return (input.requestedCapabilities ?? []).includes(capability) ? "blocked" : "none";
}

function secretAccessFor(input: NormalizeRunnerRequestInput): RunnerAccessPolicy {
  const capabilities = new Set(input.requestedCapabilities ?? []);

  return capabilities.has("cookie") || capabilities.has("secret") ? "blocked" : "none";
}

function writeAccessFor(input: NormalizeRunnerRequestInput): RunnerAccessPolicy {
  const capabilities = new Set(input.requestedCapabilities ?? []);

  return capabilities.has("filesystem-mutation") ||
    capabilities.has("delete") ||
    capabilities.has("rollback-execution") ||
    capabilities.has("patch-apply")
    ? "blocked"
    : "none";
}

function redactAndBoundSummary(summary: string): string {
  const redacted = summary
    .replace(/authorization\s*:\s*[^\n\r]+/gi, "[redacted]")
    .replace(/cookie\s*:\s*[^\n\r]+/gi, "[redacted]")
    .replace(/sk-[a-z0-9_-]+/gi, "[redacted]")
    .replace(/raw\s+provider\s+payload\s*:\s*[^\n\r]+/gi, "[redacted]")
    .replace(/raw\s+tool\s+output\s*:\s*[^\n\r]+/gi, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();

  if (redacted.length <= SUMMARY_LIMIT) {
    return redacted;
  }

  return redacted.slice(0, SUMMARY_LIMIT - 3).trimEnd() + "...";
}

function collectRedactedClasses(input: NormalizeRunnerRequestInput): string[] {
  const redactedClasses = new Set<string>();
  const summary = input.requestSummary ?? "";

  if (/authorization\s*:/i.test(summary)) {
    redactedClasses.add("authorization");
  }

  if (/cookie\s*:/i.test(summary) || (input.requestedCapabilities ?? []).includes("cookie")) {
    redactedClasses.add("browser-cookie");
  }

  if (/sk-[a-z0-9_-]+/i.test(summary) || (input.requestedCapabilities ?? []).includes("secret")) {
    redactedClasses.add("secret-token");
  }

  if (/raw\s+provider\s+payload/i.test(summary) || input.rawProviderPayload !== undefined) {
    redactedClasses.add("provider-payload");
  }

  if (/raw\s+tool\s+output/i.test(summary) || input.rawToolOutput !== undefined) {
    redactedClasses.add("tool-output");
  }

  return [...redactedClasses];
}

function copyTargetRef(targetRef: RunnerTargetRef): RunnerTargetRef {
  return {
    ...targetRef,
    inputRefs: [...targetRef.inputRefs],
    expectedOutputRefs: [...targetRef.expectedOutputRefs],
  };
}
