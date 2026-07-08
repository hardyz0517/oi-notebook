import { describe, expect, it } from "vitest";

import {
  P14_RESERVED_TRUE_EXECUTION_EVENT_TYPES,
  P14_RUNNER_CAPABILITY_STATUSES,
  P14_RUNNER_OUTPUT_STATE,
  P14_RUNNER_SCHEMA_VERSION,
  P14_SUCCESSFUL_RUNNER_EVENT_TYPES,
  createRunnerExecutionRequestEnvelope,
  isReservedP14RunnerEventType,
  isSuccessfulP14RunnerEventType,
} from "./runnerContractTypes";
import type {
  RunnerApprovalDecisionReadModel,
  RunnerExecutionRequestEnvelope,
  RunnerMockResult,
  RunnerObservationPolicy,
  RunnerPermissionRequest,
  RunnerRedactionResult,
  RunnerResourceLimits,
  RunnerRollbackCleanupPlan,
  RunnerSandboxPlan,
  RunnerTargetRef,
} from "./runnerContractTypes";

describe("P14 runner contract types", () => {
  const createdAt = "2026-07-08T00:00:00.000Z";

  const targetRef = {
    targetRefId: "target:p14:1",
    targetKind: "workspace-file",
    displayPath: "src/lib/example.ts",
    workspaceId: "workspace:general:1",
    languageId: "typescript",
    contentHashBefore: "sha256:before",
    inputRefs: ["input:fixture:1"],
    expectedOutputRefs: ["expected-output:fixture:1"],
    permissionScope: "execute-preview",
    pathSafetyStatus: "safe-preview",
    notesPolicy: "not-read",
    networkPolicy: "none",
  } satisfies RunnerTargetRef;

  const sandboxPlan = {
    sandboxPlanId: "sandbox:p14:1",
    profile: "preview-no-op",
    workingDirectoryRef: "workspace:general:1",
    allowedTargetRefs: ["target:p14:1"],
    networkAccess: "none",
    secretAccess: "none",
    credentialAccess: "none",
    writeAccess: "none",
    maxFilesTouched: 0,
    timeoutMs: 1000,
    maxOutputBytes: 4096,
    maxInputBytes: 2048,
    environmentPolicy: "preview-only",
    cleanupPolicy: "no-op",
    blockedReasons: [],
    createdAt,
  } satisfies RunnerSandboxPlan;

  const resourceLimits = {
    timeoutMs: 1000,
    maxOutputBytes: 4096,
    maxInputBytes: 2048,
    maxFilesTouched: 0,
    networkAccess: "none",
    secretAccess: "none",
    writeAccess: "none",
    trueExecution: "unavailable",
  } satisfies RunnerResourceLimits;

  const permissionRequest = {
    permissionRequestId: "permission:p14:1",
    executionRequestId: "exec-request:p14:1",
    permissionKind: "execute",
    decisionStatus: "prompt-required",
    riskLevel: "high",
    reason: "Future execute requires explicit approval and remains unavailable in P14.",
    requestedByEventId: "event:p14:model-output",
    targetRefs: ["target:p14:1"],
    sandboxPlanId: "sandbox:p14:1",
    approvalSurface: "workbench-read-only",
    expiresAt: "2026-07-08T01:00:00.000Z",
    createdAt,
  } satisfies RunnerPermissionRequest;

  const approvalDecision = {
    approvalDecisionId: "approval:p14:1",
    permissionRequestId: "permission:p14:1",
    executionRequestId: "exec-request:p14:1",
    status: "approved-for-future-execute",
    decidedBy: "human-reviewer",
    safeReason: "Metadata only; P14 does not run commands.",
    visibleConsequences: ["May be handed to a later approved execute-capable phase."],
    blockedCapabilities: ["real-process-execution", "code-runner"],
    eventIds: ["event:p14:permission-resolved"],
    createdAt,
  } satisfies RunnerApprovalDecisionReadModel;

  const mockResult = {
    mockResultId: "mock:p14:1",
    executionRequestId: "exec-request:p14:1",
    mode: "dry-run",
    status: "completed",
    plannedRunnerKind: "test-run",
    plannedSandboxProfile: "preview-no-op",
    safeInputSummary: "One bounded fixture input is referenced.",
    safeOutputSummary: "No real output exists; mock dry-run metadata completed.",
    exitCodePreview: null,
    durationMsPreview: 0,
    filesTouchedPreview: 0,
    networkAccessPreview: "none",
    resourceLimitPreview: "bounded-preview",
    observationId: "observation:p14:1",
    safeErrors: [],
    createdAt,
  } satisfies RunnerMockResult;

  const observationPolicy = {
    observationId: "observation:p14:1",
    executionRequestId: "exec-request:p14:1",
    mockResultId: "mock:p14:1",
    sourceEventIds: ["event:p14:mock-completed"],
    status: "mock-completed",
    safeSummary: "Only bounded mock metadata is visible.",
    boundedStdout: "",
    boundedStderr: "",
    exitCodePreview: null,
    redactionStatus: "redacted",
    droppedFields: ["raw-provider-payload", "raw-tool-output", "secret-like-token"],
    truncated: false,
    maxOutputBytes: 4096,
    continuationVisibility: "summary-only",
    createdAt,
  } satisfies RunnerObservationPolicy;

  const rollbackCleanupPlan = {
    rollbackCleanupPlanId: "cleanup:p14:1",
    executionRequestId: "exec-request:p14:1",
    requiredBeforeExecute: true,
    preRunContentHashes: [{ targetRefId: "target:p14:1", contentHashBefore: "sha256:before" }],
    affectedTargetRefs: ["target:p14:1"],
    temporaryDirectoryPolicy: "ref-only-no-op",
    artifactRetentionPolicy: "preview-only",
    cleanupStepsPreview: ["No cleanup is executed in P14."],
    recoveryStrategy: "Future execution must prove recovery before running.",
    unavailableReasons: ["true-cleanup-unavailable-in-p14"],
    createdAt,
  } satisfies RunnerRollbackCleanupPlan;

  const redactionResult = {
    redactionStatus: "redacted",
    redactedClasses: ["safe-metadata"],
    safeSummary: "Contract contains only bounded preview metadata.",
  } satisfies RunnerRedactionResult;

  it("creates execution request envelopes with the frozen P14 fields and output state", () => {
    const envelope = createRunnerExecutionRequestEnvelope({
      executionRequestId: "exec-request:p14:1",
      sessionId: "session:p14:1",
      turnId: "turn:p14:1",
      stepId: "step:p14:1",
      sourceKind: "model-output",
      sourceEventIds: ["event:p14:model-output"],
      workspaceRefs: ["workspace:general:1"],
      evidenceRefs: ["evidence:bounded:1"],
      targetRefs: [targetRef],
      runnerKind: "test-run",
      runnerIntent: {
        summary: "Preview a fixture-backed test run without executing it.",
        commandClass: "test",
        languageClass: "typescript",
        testRunClass: "unit-test",
      },
      classification: {
        classificationId: "classification:p14:1",
        executionRequestId: "exec-request:p14:1",
        commandClass: "test",
        languageClass: "typescript",
        testRunClass: "unit-test",
        riskLevel: "high",
        riskReasons: ["real-workspace-target-requires-future-sandbox"],
        requiresHumanApproval: true,
        requiresSandbox: true,
        requiresNetwork: false,
        requiresSecrets: false,
        requiresWritableWorkspace: false,
        blockedReasons: [],
        createdAt,
      },
      requestedInputs: [{ inputRefId: "input:fixture:1", inputKind: "stdin-fixture", safeSummary: "bounded sample" }],
      expectedOutputs: [
        {
          outputRefId: "expected-output:fixture:1",
          outputKind: "expected-output-fixture",
          safeSummary: "bounded expected result",
        },
      ],
      sandboxPlan,
      resourceLimits,
      permissionRequest,
      approvalDecision,
      mockResult,
      observationPolicy,
      rollbackCleanupPlan,
      redactionResult,
      capabilityStatus: "preview",
      createdAt,
    });

    expect(envelope).toEqual({
      executionRequestId: "exec-request:p14:1",
      sessionId: "session:p14:1",
      turnId: "turn:p14:1",
      stepId: "step:p14:1",
      sourceKind: "model-output",
      sourceEventIds: ["event:p14:model-output"],
      workspaceRefs: ["workspace:general:1"],
      evidenceRefs: ["evidence:bounded:1"],
      targetRefs: [targetRef],
      runnerKind: "test-run",
      runnerIntent: {
        summary: "Preview a fixture-backed test run without executing it.",
        commandClass: "test",
        languageClass: "typescript",
        testRunClass: "unit-test",
      },
      classification: {
        classificationId: "classification:p14:1",
        executionRequestId: "exec-request:p14:1",
        commandClass: "test",
        languageClass: "typescript",
        testRunClass: "unit-test",
        riskLevel: "high",
        riskReasons: ["real-workspace-target-requires-future-sandbox"],
        requiresHumanApproval: true,
        requiresSandbox: true,
        requiresNetwork: false,
        requiresSecrets: false,
        requiresWritableWorkspace: false,
        blockedReasons: [],
        createdAt,
      },
      requestedInputs: [{ inputRefId: "input:fixture:1", inputKind: "stdin-fixture", safeSummary: "bounded sample" }],
      expectedOutputs: [
        {
          outputRefId: "expected-output:fixture:1",
          outputKind: "expected-output-fixture",
          safeSummary: "bounded expected result",
        },
      ],
      sandboxPlan,
      resourceLimits,
      permissionRequest,
      approvalDecision,
      mockResult,
      observationPolicy,
      rollbackCleanupPlan,
      redactionResult,
      createdAt,
      schemaVersion: P14_RUNNER_SCHEMA_VERSION,
      outputState: "Execute / Code Runner Contract Preview",
      capabilityStatus: "preview",
    } satisfies RunnerExecutionRequestEnvelope);
    expect(envelope.outputState).toBe(P14_RUNNER_OUTPUT_STATE);
  });

  it("keeps target refs display-only with workspace, language, hash and policy metadata", () => {
    expect(targetRef).toEqual({
      targetRefId: "target:p14:1",
      targetKind: "workspace-file",
      displayPath: "src/lib/example.ts",
      workspaceId: "workspace:general:1",
      languageId: "typescript",
      contentHashBefore: "sha256:before",
      inputRefs: ["input:fixture:1"],
      expectedOutputRefs: ["expected-output:fixture:1"],
      permissionScope: "execute-preview",
      pathSafetyStatus: "safe-preview",
      notesPolicy: "not-read",
      networkPolicy: "none",
    });
  });

  it("defines preview-only sandbox, resource, permission, mock, observation and cleanup metadata", () => {
    expect(sandboxPlan.profile).toBe("preview-no-op");
    expect(sandboxPlan.maxFilesTouched).toBe(0);
    expect(resourceLimits.trueExecution).toBe("unavailable");
    expect(permissionRequest.decisionStatus).toBe("prompt-required");
    expect(approvalDecision.status).toBe("approved-for-future-execute");
    expect(mockResult.status).toBe("completed");
    expect(mockResult.safeOutputSummary).toContain("mock dry-run metadata");
    expect(observationPolicy.status).toBe("mock-completed");
    expect(rollbackCleanupPlan.requiredBeforeExecute).toBe(true);
    expect(rollbackCleanupPlan.cleanupStepsPreview).toEqual(["No cleanup is executed in P14."]);
  });

  it("restricts runner capability status to non-executing P14 statuses", () => {
    expect(P14_RUNNER_CAPABILITY_STATUSES).toEqual(["preview", "reserved", "unavailable", "denied", "blocked"]);
  });

  it("defines the successful P14 runner audit event taxonomy", () => {
    expect(P14_SUCCESSFUL_RUNNER_EVENT_TYPES).toEqual([
      "runner.requested",
      "runner.classified",
      "runner.permission.required",
      "runner.permission.resolved",
      "runner.sandbox.planned",
      "runner.mock.started",
      "runner.mock.completed",
      "runner.mock.failed",
      "runner.observation.added",
      "runner.blocked",
      "runner.unavailable",
    ]);

    for (const eventType of P14_SUCCESSFUL_RUNNER_EVENT_TYPES) {
      expect(isSuccessfulP14RunnerEventType(eventType)).toBe(true);
    }
  });

  it("keeps reserved true execution events out of successful P14 preview events", () => {
    expect(P14_RESERVED_TRUE_EXECUTION_EVENT_TYPES).toEqual([
      "runner.started",
      "runner.completed",
      "runner.failed",
      "runner.cancelled",
      "command.executed",
      "process.started",
      "process.completed",
      "test-run.executed",
      "stress-test.executed",
      "artifact.written",
      "cleanup.executed",
      "rollback.executed",
    ]);

    for (const reservedEventType of P14_RESERVED_TRUE_EXECUTION_EVENT_TYPES) {
      expect(isReservedP14RunnerEventType(reservedEventType)).toBe(true);
      expect(isSuccessfulP14RunnerEventType(reservedEventType)).toBe(false);
    }
  });

  it("keeps the stringified contract free of secrets, raw payloads and mature capability claims", () => {
    const exportedContractSurface = JSON.stringify({
      outputState: P14_RUNNER_OUTPUT_STATE,
      successfulEvents: P14_SUCCESSFUL_RUNNER_EVENT_TYPES,
      reservedEvents: P14_RESERVED_TRUE_EXECUTION_EVENT_TYPES,
      statuses: P14_RUNNER_CAPABILITY_STATUSES,
    });
    const forbiddenContractTerms = [
      "API key",
      "Authori" + "zation",
      "Coo" + "kie",
      "raw provider payload",
      "raw tool output",
      "production-" + "ready",
      "ready claims",
    ];

    for (const term of forbiddenContractTerms) {
      expect(exportedContractSurface).not.toContain(term);
    }
  });
});
