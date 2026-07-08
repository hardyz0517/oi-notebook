import { describe, expect, it } from "vitest";
import { createRunnerExecutionRequestEnvelope, type RunnerExecutionRequestEnvelope } from "@/lib/agent-runtime/runnerContractTypes";
import { createRunnerWorkflowViewModel } from "./runnerWorkflowViewModel";

const createdAt = "2026-07-08T00:00:00.000Z";

function createRunnerPreview(): RunnerExecutionRequestEnvelope {
  const executionRequestId = "runner-request:p14:workbench";
  const targetRef = {
    targetRefId: "target:p14:fixture",
    targetKind: "scratch-fixture" as const,
    displayPath: "fixtures/p14/sample.cpp",
    workspaceId: "workspace:p14",
    languageId: "cpp" as const,
    contentHashBefore: "sha256:before",
    inputRefs: ["input:p14:sample"],
    expectedOutputRefs: ["output:p14:sample"],
    permissionScope: "workspace-preview",
    pathSafetyStatus: "safe-preview" as const,
    notesPolicy: "fixture-only" as const,
    networkPolicy: "none" as const,
  };
  const sandboxPlan = {
    sandboxPlanId: `${executionRequestId}:sandbox`,
    profile: "fixture-simulation" as const,
    workingDirectoryRef: "workspace-ref:p14",
    allowedTargetRefs: [targetRef.targetRefId],
    networkAccess: "none" as const,
    secretAccess: "none" as const,
    credentialAccess: "none" as const,
    writeAccess: "none" as const,
    maxFilesTouched: 1,
    timeoutMs: 5000,
    maxOutputBytes: 4096,
    maxInputBytes: 2048,
    environmentPolicy: "p14-metadata-only-no-runtime",
    cleanupPolicy: "p14-no-op-cleanup-preview",
    blockedReasons: [],
    createdAt,
  };
  const resourceLimits = {
    timeoutMs: 5000,
    maxOutputBytes: 4096,
    maxInputBytes: 2048,
    maxFilesTouched: 1,
    networkAccess: "none" as const,
    secretAccess: "none" as const,
    writeAccess: "none" as const,
    trueExecution: "unavailable" as const,
  };
  const classification = {
    classificationId: `${executionRequestId}:classification`,
    executionRequestId,
    commandClass: "test" as const,
    languageClass: "cpp" as const,
    testRunClass: "sample-test" as const,
    riskLevel: "medium" as const,
    riskReasons: ["fixture_simulation_preview_only"],
    requiresHumanApproval: true,
    requiresSandbox: true,
    requiresNetwork: false,
    requiresSecrets: false,
    requiresWritableWorkspace: false,
    blockedReasons: [],
    createdAt,
  };
  const permissionRequest = {
    permissionRequestId: `${executionRequestId}:permission:execute`,
    executionRequestId,
    permissionKind: "execute" as const,
    decisionStatus: "prompt-required" as const,
    riskLevel: "medium" as const,
    reason: "P14 requires explicit future-phase approval for execute; no capability is granted now.",
    requestedByEventId: "event:p14:permission",
    targetRefs: [targetRef.targetRefId],
    sandboxPlanId: sandboxPlan.sandboxPlanId,
    approvalSurface: "workbench-read-only",
    createdAt,
  };
  const approvalDecision = {
    approvalDecisionId: `${executionRequestId}:approval:execute`,
    permissionRequestId: permissionRequest.permissionRequestId,
    executionRequestId,
    status: "pending" as const,
    decidedBy: "p14-permission-sandbox-policy",
    safeReason: "P14 approval read model status is pending; it does not start a process.",
    visibleConsequences: ["No process is started and no workspace mutation is performed in P14."],
    blockedCapabilities: ["execute", "true-execution", "workspace-mutation"],
    eventIds: ["event:p14:approval"],
    createdAt,
  };
  const mockResult = {
    mockResultId: `${executionRequestId}:mock:fixture-simulation`,
    executionRequestId,
    mode: "fixture-simulation" as const,
    status: "completed" as const,
    plannedRunnerKind: "test-run" as const,
    plannedSandboxProfile: "fixture-simulation" as const,
    safeInputSummary: "Sample input fixture only.",
    safeOutputSummary: "P14 fixture-simulation reached mock completion only.",
    exitCodePreview: 0,
    durationMsPreview: 0,
    filesTouchedPreview: 1,
    networkAccessPreview: "none" as const,
    resourceLimitPreview: "timeoutMs=5000; maxOutputBytes=4096; maxInputBytes=2048; maxFilesTouched=1; networkAccess=none; trueExecution=unavailable",
    observationId: `${executionRequestId}:observation:fixture-simulation`,
    safeErrors: [],
    createdAt,
  };
  const observationPolicy = {
    observationId: mockResult.observationId,
    executionRequestId,
    mockResultId: mockResult.mockResultId,
    sourceEventIds: ["event:p14:mock"],
    status: "mock-completed" as const,
    safeSummary: "Mock result summary only.",
    boundedStdout: "answer accepted preview",
    boundedStderr: "",
    exitCodePreview: 0,
    redactionStatus: "not-needed" as const,
    droppedFields: [],
    truncated: false,
    maxOutputBytes: 4096,
    continuationVisibility: "timeline-visible" as const,
    createdAt,
  };

  return createRunnerExecutionRequestEnvelope({
    executionRequestId,
    sessionId: "session:p14",
    turnId: "turn:p14",
    stepId: "step:p14",
    sourceKind: "fixture",
    sourceEventIds: ["event:p14:request"],
    workspaceRefs: ["workspace:p14"],
    evidenceRefs: ["evidence:p14"],
    targetRefs: [targetRef],
    runnerKind: "test-run",
    runnerIntent: {
      summary: "Preview sample-test request only.",
      commandClass: "test",
      languageClass: "cpp",
      testRunClass: "sample-test",
    },
    classification,
    requestedInputs: [{
      inputRefId: "input:p14:sample",
      inputKind: "stdin-fixture",
      safeSummary: "stdin fixture summary",
    }],
    expectedOutputs: [{
      outputRefId: "output:p14:sample",
      outputKind: "expected-output-fixture",
      safeSummary: "expected output summary",
    }],
    sandboxPlan,
    resourceLimits,
    permissionRequest,
    approvalDecision,
    mockResult,
    observationPolicy,
    rollbackCleanupPlan: {
      rollbackCleanupPlanId: `${executionRequestId}:rollback-cleanup`,
      executionRequestId,
      requiredBeforeExecute: true,
      preRunContentHashes: [{
        targetRefId: targetRef.targetRefId,
        contentHashBefore: targetRef.contentHashBefore,
      }],
      affectedTargetRefs: [targetRef.targetRefId],
      temporaryDirectoryPolicy: "refs only; no temporary directory is created",
      artifactRetentionPolicy: "no artifacts retained in P14",
      cleanupStepsPreview: ["future phase must clean temporary artifacts before execute"],
      recoveryStrategy: "content hash restore metadata only",
      unavailableReasons: ["true_execution_unavailable_in_p14"],
      createdAt,
    },
    redactionResult: {
      redactionStatus: "not-needed",
      redactedClasses: [],
      safeSummary: "Safe runner request metadata only.",
    },
    createdAt,
    capabilityStatus: "preview",
  });
}

describe("createRunnerWorkflowViewModel", () => {
  it("projects every P14 runner workflow section for Workbench display", () => {
    const preview = createRunnerPreview();
    const viewModel = createRunnerWorkflowViewModel(preview);

    expect(viewModel.title).toBe("Execute / Code Runner Contract Preview");
    expect(viewModel.outputState).toBe("Execute / Code Runner Contract Preview");
    expect(viewModel.summary).toMatchObject({
      executionRequestId: preview.executionRequestId,
      sourceKind: "fixture",
      runnerKind: "test-run",
      capabilityStatus: "preview",
      targetCount: 1,
      auditEventCount: 9,
    });
    expect(viewModel.executionRequest.safeSummary).toContain("Preview sample-test request only.");
    expect(viewModel.targetRefs[0]).toMatchObject({
      targetRefId: "target:p14:fixture",
      displayPath: "fixtures/p14/sample.cpp",
      notesPolicy: "fixture-only",
      networkPolicy: "none",
    });
    expect(viewModel.classification).toMatchObject({
      commandClass: "test",
      languageClass: "cpp",
      testRunClass: "sample-test",
      riskLevel: "medium",
    });
    expect(viewModel.sandboxPlan).toMatchObject({
      profile: "fixture-simulation",
      networkAccess: "none",
      writeAccess: "none",
      timeoutMs: 5000,
    });
    expect(viewModel.resourceLimits).toMatchObject({
      maxOutputBytes: 4096,
      trueExecution: "unavailable",
    });
    expect(viewModel.permissionRequest).toMatchObject({
      permissionKind: "execute",
      decisionStatus: "prompt-required",
      approvalSurface: "workbench-read-only",
    });
    expect(viewModel.approvalDecision).toMatchObject({
      status: "pending",
      blockedCapabilities: ["execute", "true-execution", "workspace-mutation"],
    });
    expect(viewModel.mockResult).toMatchObject({
      mode: "fixture-simulation",
      status: "completed",
      exitCodePreview: 0,
    });
    expect(viewModel.observation).toMatchObject({
      status: "mock-completed",
      safeSummary: "Mock result summary only.",
      boundedStdout: "answer accepted preview",
    });
    expect(viewModel.cleanupMetadata).toMatchObject({
      requiredBeforeExecute: true,
      affectedTargetRefs: ["target:p14:fixture"],
    });
    expect(viewModel.auditEvents.map((event) => event.eventType)).toEqual([
      "runner.requested",
      "runner.classified",
      "runner.permission.required",
      "runner.permission.resolved",
      "runner.sandbox.planned",
      "runner.mock.started",
      "runner.mock.completed",
      "runner.observation.added",
      "runner.unavailable",
    ]);
  });

  it("keeps raw provider payloads, tool output, secrets, cookies, and real note content out of the projection", () => {
    const preview = createRunnerPreview();
    const viewModel = createRunnerWorkflowViewModel({
      ...preview,
      runnerIntent: {
        ...preview.runnerIntent,
        summary: "raw provider payload: secret-model-json; raw tool output: secret-stdout; apiKey=sk-test; Authorization: Bearer abc; Cookie: sid=abc; unauthorized local-note content: private note",
      },
      requestedInputs: [{
        inputRefId: "input:p14:unsafe",
        inputKind: "manual-entry",
        safeSummary: "apiKey=sk-test Authorization: Bearer abc Cookie: sid=abc",
      }],
      mockResult: {
        ...preview.mockResult,
        safeInputSummary: "raw provider payload: hidden; sk-test",
        safeOutputSummary: "raw tool output: hidden; unauthorized local-note content: note body",
      },
      observationPolicy: {
        ...preview.observationPolicy,
        safeSummary: "Cookie: sid=abc Authorization: Bearer abc",
        boundedStdout: "raw tool output: hidden",
      },
      redactionResult: {
        redactionStatus: "redacted",
        redactedClasses: ["api-key", "authorization-header", "cookie", "raw-provider-payload", "raw-tool-output"],
        safeSummary: "Cookie: sid=abc",
      },
    });
    const serialized = JSON.stringify(viewModel);

    expect(serialized).not.toMatch(/secret-model-json|secret-stdout|sk-test|Bearer abc|sid=abc|private note|note body|hidden/);
    expect(serialized).not.toMatch(/raw provider payload|raw tool output|apiKey|Authorization|Cookie|unauthorized local-note content/i);
    expect(serialized).toContain("[redacted]");
  });
});
