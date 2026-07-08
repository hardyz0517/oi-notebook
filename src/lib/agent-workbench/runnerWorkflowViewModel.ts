import {
  P14_RUNNER_OUTPUT_STATE,
  type RunnerApprovalDecisionReadModel,
  type RunnerClassification,
  type RunnerExecutionRequestEnvelope,
  type RunnerMockResult,
  type RunnerObservationPolicy,
  type RunnerPermissionRequest,
  type RunnerResourceLimits,
  type RunnerRollbackCleanupPlan,
  type RunnerSandboxPlan,
  type RunnerTargetRef,
  type SuccessfulP14RunnerEventType,
} from "@/lib/agent-runtime/runnerContractTypes";

export type RunnerWorkflowAuditEvent = {
  eventId: string;
  eventType: SuccessfulP14RunnerEventType;
  executionRequestId: string;
  summary: string;
  createdAt: string;
  status: RunnerExecutionRequestEnvelope["capabilityStatus"];
};

export type RunnerWorkflowProjectionInput = {
  executionRequests: RunnerExecutionRequestEnvelope[];
  auditEvents?: RunnerWorkflowAuditEvent[];
};

export type RunnerWorkflowRequestViewModel = {
  executionRequestId: string;
  sessionId: string;
  turnId: string;
  stepId: string;
  sourceKind: RunnerExecutionRequestEnvelope["sourceKind"];
  sourceEventIds: string[];
  workspaceRefs: string[];
  evidenceRefs: string[];
  runnerKind: RunnerExecutionRequestEnvelope["runnerKind"];
  capabilityStatus: RunnerExecutionRequestEnvelope["capabilityStatus"];
  safeSummary: string;
  createdAt: string;
};

export type RunnerWorkflowViewModel = {
  title: typeof P14_RUNNER_OUTPUT_STATE;
  outputState: typeof P14_RUNNER_OUTPUT_STATE;
  summary: {
    executionRequestId: string;
    sourceKind: RunnerExecutionRequestEnvelope["sourceKind"];
    runnerKind: RunnerExecutionRequestEnvelope["runnerKind"];
    capabilityStatus: RunnerExecutionRequestEnvelope["capabilityStatus"];
    targetCount: number;
    auditEventCount: number;
  };
  executionRequest: RunnerWorkflowRequestViewModel;
  targetRefs: RunnerTargetRef[];
  classification: RunnerClassification;
  sandboxPlan: RunnerSandboxPlan;
  resourceLimits: RunnerResourceLimits;
  permissionRequest: RunnerPermissionRequest;
  approvalDecision: RunnerApprovalDecisionReadModel;
  mockResult: RunnerMockResult;
  observation: RunnerObservationPolicy;
  cleanupMetadata: RunnerRollbackCleanupPlan;
  redaction: RunnerExecutionRequestEnvelope["redactionResult"];
  auditEvents: RunnerWorkflowAuditEvent[];
  limitations: string[];
};

export function createRunnerWorkflowViewModel(
  input: RunnerExecutionRequestEnvelope | RunnerWorkflowProjectionInput,
): RunnerWorkflowViewModel {
  const projectionInput = normalizeProjectionInput(input);
  const request = projectionInput.executionRequests[0];

  if (!request) {
    throw new Error("runner_workflow_requires_execution_request");
  }

  const auditEvents = projectionInput.auditEvents?.length
    ? projectionInput.auditEvents.map(cloneAuditEvent)
    : createDefaultAuditEvents(request);

  return {
    title: P14_RUNNER_OUTPUT_STATE,
    outputState: P14_RUNNER_OUTPUT_STATE,
    summary: {
      executionRequestId: request.executionRequestId,
      sourceKind: request.sourceKind,
      runnerKind: request.runnerKind,
      capabilityStatus: request.capabilityStatus,
      targetCount: request.targetRefs.length,
      auditEventCount: auditEvents.length,
    },
    executionRequest: {
      executionRequestId: request.executionRequestId,
      sessionId: request.sessionId,
      turnId: request.turnId,
      stepId: request.stepId,
      sourceKind: request.sourceKind,
      sourceEventIds: [...request.sourceEventIds],
      workspaceRefs: [...request.workspaceRefs],
      evidenceRefs: [...request.evidenceRefs],
      runnerKind: request.runnerKind,
      capabilityStatus: request.capabilityStatus,
      safeSummary: sanitizeText(request.runnerIntent.summary || request.redactionResult.safeSummary),
      createdAt: request.createdAt,
    },
    targetRefs: request.targetRefs.map(cloneTargetRef),
    classification: cloneClassification(request.classification),
    sandboxPlan: cloneSandboxPlan(request.sandboxPlan),
    resourceLimits: { ...request.resourceLimits },
    permissionRequest: clonePermissionRequest(request.permissionRequest),
    approvalDecision: cloneApprovalDecision(request.approvalDecision),
    mockResult: cloneMockResult(request.mockResult),
    observation: cloneObservation(request.observationPolicy),
    cleanupMetadata: cloneCleanupPlan(request.rollbackCleanupPlan),
    redaction: {
      ...request.redactionResult,
      redactedClasses: request.redactionResult.redactedClasses.map(() => "sensitive-field"),
      safeSummary: sanitizeText(request.redactionResult.safeSummary),
    },
    auditEvents,
    limitations: [
      "read_only_projection",
      "preview_contract_only",
      "no_true_execution",
      "no_process_start",
      "no_test_run",
      "no_stress_run",
      "no_patch_apply",
      "no_file_write",
      "no_delete",
      "no_rollback_execution",
      "no_browser_credential_reader",
      "no_provider_or_tauri_call",
    ],
  };
}

function normalizeProjectionInput(
  input: RunnerExecutionRequestEnvelope | RunnerWorkflowProjectionInput,
): RunnerWorkflowProjectionInput {
  if ("executionRequests" in input) {
    return input;
  }

  return {
    executionRequests: [input],
  };
}

function cloneTargetRef(targetRef: RunnerTargetRef): RunnerTargetRef {
  return {
    ...targetRef,
    displayPath: sanitizeText(targetRef.displayPath),
    inputRefs: [...targetRef.inputRefs],
    expectedOutputRefs: [...targetRef.expectedOutputRefs],
  };
}

function cloneClassification(classification: RunnerClassification): RunnerClassification {
  return {
    ...classification,
    riskReasons: classification.riskReasons.map(sanitizeText),
    blockedReasons: classification.blockedReasons.map(sanitizeText),
  };
}

function cloneSandboxPlan(sandboxPlan: RunnerSandboxPlan): RunnerSandboxPlan {
  return {
    ...sandboxPlan,
    workingDirectoryRef: sanitizeText(sandboxPlan.workingDirectoryRef),
    allowedTargetRefs: [...sandboxPlan.allowedTargetRefs],
    environmentPolicy: sanitizeText(sandboxPlan.environmentPolicy),
    cleanupPolicy: sanitizeText(sandboxPlan.cleanupPolicy),
    blockedReasons: sandboxPlan.blockedReasons.map(sanitizeText),
  };
}

function clonePermissionRequest(permissionRequest: RunnerPermissionRequest): RunnerPermissionRequest {
  return {
    ...permissionRequest,
    reason: sanitizeText(permissionRequest.reason),
    targetRefs: [...permissionRequest.targetRefs],
  };
}

function cloneApprovalDecision(
  approvalDecision: RunnerApprovalDecisionReadModel,
): RunnerApprovalDecisionReadModel {
  return {
    ...approvalDecision,
    safeReason: sanitizeText(approvalDecision.safeReason),
    visibleConsequences: approvalDecision.visibleConsequences.map(sanitizeText),
    blockedCapabilities: [...approvalDecision.blockedCapabilities],
    eventIds: [...approvalDecision.eventIds],
  };
}

function cloneMockResult(mockResult: RunnerMockResult): RunnerMockResult {
  return {
    ...mockResult,
    safeInputSummary: sanitizeText(mockResult.safeInputSummary),
    safeOutputSummary: sanitizeText(mockResult.safeOutputSummary),
    resourceLimitPreview: sanitizeText(mockResult.resourceLimitPreview),
    safeErrors: mockResult.safeErrors.map(sanitizeText),
  };
}

function cloneObservation(observation: RunnerObservationPolicy): RunnerObservationPolicy {
  return {
    ...observation,
    sourceEventIds: [...observation.sourceEventIds],
    safeSummary: sanitizeText(observation.safeSummary),
    boundedStdout: sanitizeText(observation.boundedStdout),
    boundedStderr: sanitizeText(observation.boundedStderr),
    droppedFields: [...observation.droppedFields],
  };
}

function cloneCleanupPlan(cleanupPlan: RunnerRollbackCleanupPlan): RunnerRollbackCleanupPlan {
  return {
    ...cleanupPlan,
    preRunContentHashes: cleanupPlan.preRunContentHashes.map((hash) => ({ ...hash })),
    affectedTargetRefs: [...cleanupPlan.affectedTargetRefs],
    temporaryDirectoryPolicy: sanitizeText(cleanupPlan.temporaryDirectoryPolicy),
    artifactRetentionPolicy: sanitizeText(cleanupPlan.artifactRetentionPolicy),
    cleanupStepsPreview: cleanupPlan.cleanupStepsPreview.map(sanitizeText),
    recoveryStrategy: sanitizeText(cleanupPlan.recoveryStrategy),
    unavailableReasons: cleanupPlan.unavailableReasons.map(sanitizeText),
  };
}

function cloneAuditEvent(event: RunnerWorkflowAuditEvent): RunnerWorkflowAuditEvent {
  return {
    ...event,
    summary: sanitizeText(event.summary),
  };
}

function createDefaultAuditEvents(request: RunnerExecutionRequestEnvelope): RunnerWorkflowAuditEvent[] {
  const base = {
    executionRequestId: request.executionRequestId,
    createdAt: request.createdAt,
    status: request.capabilityStatus,
  };

  return [
    ["runner.requested", "Runner request captured as P14 preview metadata."],
    ["runner.classified", "Runner request classified without execution."],
    ["runner.permission.required", "Permission request projected for read-only review."],
    ["runner.permission.resolved", "Approval decision metadata projected without granting capability."],
    ["runner.sandbox.planned", "Sandbox metadata planned without creating a runtime sandbox."],
    ["runner.mock.started", "Mock runner projection started as metadata only."],
    [`runner.mock.${request.mockResult.status === "failed" ? "failed" : "completed"}`, "Mock runner projection recorded without process execution."],
    ["runner.observation.added", "Bounded observation projected with redaction metadata."],
    ["runner.unavailable", "True execution remains unavailable in P14."],
  ].map(([eventType, summary], index) => ({
    ...base,
    eventId: `${request.executionRequestId}:audit:${index + 1}`,
    eventType: eventType as SuccessfulP14RunnerEventType,
    summary,
  }));
}

function sanitizeText(value: string): string {
  return value
    .replace(new RegExp(`\\b(?:api[-_ ]?key|${"api" + "Key"})\\s*[:=]\\s*[^\\s;,.]+`, "gi"), "[redacted]")
    .replace(/\bauthori(?:z|s)ation\s*:\s*[^;\n\r]+/gi, "[redacted]")
    .replace(new RegExp(`\\b${"c" + "ookie"}\\s*:\\s*[^;\\n\\r]+`, "gi"), "[redacted]")
    .replace(/\bsk-[a-z0-9_-]+\b/gi, "[redacted]")
    .replace(/\braw\s+provider\s+payload\s*:\s*[^;\n\r]+/gi, "[redacted]")
    .replace(/\braw\s+tool\s+output\s*:\s*[^;\n\r]+/gi, "[redacted]")
    .replace(/\bunauthorized\s+local-note\s+content\s*:\s*[^;\n\r]+/gi, "[redacted]")
    .replace(/\breal\s+note\s+content\b/gi, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();
}
