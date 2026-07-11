import { describe, expect, it } from "vitest";
import {
  runMultiStepModelLoop,
  type MultiStepModelLoopProvider,
  type MultiStepToolTransport,
} from "@/lib/agent-runtime/multiStepModelLoop";
import {
  createDurableAgentEventLogEntry,
  createDurableAgentSessionMetadata,
} from "@/lib/agent-runtime/durableSessionTypes";
import type { AgentSessionStoreCheckpoint } from "@/lib/agent-runtime/inMemorySessionStore";
import { createRequestAuditLogRecord } from "@/lib/agent-runtime/requestLogPolicy";
import { createPatchApprovalDecisionReadModel, createPatchPermissionRequests } from "@/lib/agent-runtime/patchRiskPolicy";
import { createPatchDiffPreview, projectPatchDryRun, projectPatchRollbackPlan } from "@/lib/agent-runtime/patchDiffPreview";
import {
  createPatchProposalEnvelope,
  type PatchRiskClassification,
  type PatchTargetRef,
} from "@/lib/agent-runtime/patchWorkflowTypes";
import { createRunnerExecutionRequestEnvelope, type RunnerExecutionRequestEnvelope } from "@/lib/agent-runtime/runnerContractTypes";
import {
  createCookieReaderRequestEnvelope,
  type CookieReaderRequestEnvelope,
} from "@/lib/agent-runtime/cookieReaderContractTypes";
import { buildCookieReaderSourceBoundaryDecision } from "@/lib/agent-runtime/cookieReaderSourceBoundaryPolicy";
import {
  buildCookieReaderAuditSummary,
  buildCookieReaderRedactionPolicy,
} from "@/lib/agent-runtime/cookieReaderRedactionAuditPolicy";
import { projectMockCookieReaderFixture } from "@/lib/agent-runtime/mockCookieReaderProjection";
import { runManualWorkbenchTask, runWorkbenchTask } from "./workbenchTaskFlow";

const reservedModelEventType = ["model", "delta"].join(".");

async function createP11LoopResult() {
  const provider: MultiStepModelLoopProvider = async ({ stepNumber }) => {
    if (stepNumber === 1) {
      return {
        status: "tool-call",
        content: "Need explicit context.",
        toolCall: {
          toolCallId: "tool-call:p11:flow",
          toolName: "read-current-context.preview",
          argumentsJson: JSON.stringify({ contextRef: "fixture:flow" }),
          stepId: "step:1",
          sequence: 1,
        },
      };
    }

    return {
      status: "completed",
      content: "P11 continuation finished.",
    };
  };
  const transport: MultiStepToolTransport = async () => ({
    status: "completed",
    rawOutput: {
      summary: "Flow observation.",
      content: "Read-only projected content.",
    },
  });

  return runMultiStepModelLoop({
    turnId: "turn:p11:flow",
    maxSteps: 3,
    providerContinue: provider,
    toolTransport: transport,
    now: () => "2026-07-07T00:00:00.000Z",
  });
}

function createP12SessionHistoryPreview() {
  const metadata = createDurableAgentSessionMetadata({
    sessionId: "session:p12:flow",
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:03.000Z",
    runtimeVersion: "agent-runtime:p12-preview",
    workspaceRefs: ["workspace:flow"],
    evidenceRefs: ["evidence:flow"],
    modelRefs: ["model:mock"],
    providerRefs: ["provider:mock"],
    toolRefs: ["tool:read-current-context.preview"],
    permissionDecisionRefs: ["permission:flow"],
    observationRefs: ["observation:flow"],
    requestLogRefs: ["request-log:flow"],
    replayCheckpointRefs: ["checkpoint:flow"],
    privacyPolicyId: "privacy:p12-preview",
    redactionPolicyId: "p12-safe-request-log-redaction-v1",
    storageAdapterKind: "in-memory-preview",
    capabilityStatuses: {
      durableSessionMetadata: { status: "preview", reason: "typed_metadata_only" },
      requestLogPersistence: { status: "preview", reason: "safe_audit_records_only" },
      replayPersistence: { status: "preview", reason: "fixture_projection_only" },
      storageAdapter: { status: "unavailable", reason: "real_storage_not_enabled" },
    },
  });
  const checkpoint: AgentSessionStoreCheckpoint = {
    checkpointId: "checkpoint:flow",
    sessionId: metadata.sessionId,
    turnId: "turn:p12:flow",
    eventSequenceRange: { from: 1, to: 1 },
    summary: "Flow checkpoint summary.",
    droppedEventIds: [],
    retainedRefs: ["workspace:flow"],
    redactionPolicyId: metadata.redactionPolicyId,
    schemaVersion: metadata.schemaVersion,
    createdAt: "2026-07-07T00:00:02.000Z",
    projectorVersion: "p12-replay-projector-v1",
    privacyClass: "summary-only",
  };

  return {
    metadata,
    events: [
      createDurableAgentEventLogEntry({
        eventId: "event:p12:flow:1",
        sessionId: metadata.sessionId,
        turnId: "turn:p12:flow",
        sequence: 1,
        eventType: "turn.started",
        createdAt: "2026-07-07T00:00:01.000Z",
        redactionClass: "safe-metadata",
        replayVisibility: "timeline-visible",
        summary: "Flow session started.",
        refs: { workspaceRefs: ["workspace:flow"] },
      }),
    ],
    checkpoints: [checkpoint],
    requestAuditRecords: [
      createRequestAuditLogRecord({
        requestLogId: "request-log:flow",
        sessionId: metadata.sessionId,
        turnId: "turn:p12:flow",
        providerId: "provider:mock",
        modelId: "model:mock",
        requestKind: "replay-audit",
        permissionDecisionId: "permission:flow",
        redactionDecisionId: "redaction:flow",
        contextBuildId: "context:flow",
        eventIds: ["event:p12:flow:1"],
        safeInputSummary: "Flow safe input.",
        safeOutputSummary: "Flow safe output.",
        status: "completed",
        createdAt: "2026-07-07T00:00:03.000Z",
      }),
    ],
    corruptionWarnings: [],
  };
}

function createP13PatchWorkflowPreview() {
  const createdAt = "2026-07-08T00:00:00.000Z";
  const targetRef: PatchTargetRef = {
    targetRefId: "target:p13:flow",
    targetKind: "scratch-fixture",
    displayPath: "fixtures/p13/flow.md",
    workspaceId: "workspace:flow",
    contentHashBefore: "sha256:flow-before",
    permissionScope: "workspace-preview",
    pathSafetyStatus: "safe-preview",
    notesPolicy: "fixture-only",
  };
  const riskClassification: PatchRiskClassification = {
    riskLevel: "medium",
    riskReasons: ["medium_single_safe_target_patch"],
    permissionKinds: ["patch-apply"],
    requiresHumanApproval: true,
    requiresFreshRead: true,
    requiresDryRun: true,
    requiresRollbackPlan: true,
  };
  const permissionRequest = createPatchPermissionRequests({
    proposalId: "proposal:p13:flow",
    requestedByEventId: "event:p13:flow:permission",
    targetRefs: [targetRef],
    riskClassification,
    createdAt,
  })[0];
  const dryRunResult = projectPatchDryRun({
    dryRunId: "dry-run:p13:flow",
    proposalId: "proposal:p13:flow",
    status: "passed",
    targetRefs: [targetRef],
    wouldChangeTargetRefIds: [targetRef.targetRefId],
    createdAt,
  });
  const rollbackPlan = projectPatchRollbackPlan({
    rollbackPlanId: "rollback:p13:flow",
    proposalId: "proposal:p13:flow",
    targetRefs: [targetRef],
    rollbackKind: "content-hash-restore-plan",
    createdAt,
  });
  const validationResult = {
    validationId: "validation:p13:flow",
    proposalId: "proposal:p13:flow",
    status: "passed" as const,
    checks: [{
      checkId: "check:p13:flow",
      status: "passed" as const,
      safeSummary: "Flow target is safe for preview.",
    }],
    safeErrors: [],
    warnings: [],
    redactionStatus: "not-needed" as const,
    createdAt,
  };
  const proposal = createPatchProposalEnvelope({
    proposalId: "proposal:p13:flow",
    sessionId: "session:p13:flow",
    turnId: "turn:p13:flow",
    stepId: "step:p13:flow",
    sourceKind: "fixture",
    sourceEventIds: ["event:p13:flow:proposal"],
    workspaceRefs: ["workspace:flow"],
    evidenceRefs: ["evidence:flow"],
    targetRefs: [targetRef],
    patchFormat: "unified-diff",
    proposalSummary: "Flow patch preview summary.",
    authoringMode: "fixture",
    riskClassification,
    permissionRequest,
    validationResult,
    dryRunResult,
    rollbackPlan,
    redactionResult: {
      redactionStatus: "not-needed",
      redactedClasses: [],
      safeSummary: "Flow patch preview summary.",
    },
    createdAt,
    capabilityStatus: "preview",
  });

  return {
    proposals: [proposal],
    diffPreviews: [
      createPatchDiffPreview({
        diffPreviewId: "diff:p13:flow",
        proposalId: proposal.proposalId,
        targetRefs: [targetRef],
        patchFormat: "unified-diff",
        unifiedDiffText: [
          "diff --git a/fixtures/p13/flow.md b/fixtures/p13/flow.md",
          "--- a/fixtures/p13/flow.md",
          "+++ b/fixtures/p13/flow.md",
          "@@ -1 +1 @@",
          "-old",
          "+new",
        ].join("\n"),
        createdAt,
      }),
    ],
    approvalDecisions: [
      createPatchApprovalDecisionReadModel({
        approvalDecisionId: "approval:p13:flow",
        permissionRequestId: permissionRequest.permissionRequestId,
        proposalId: proposal.proposalId,
        status: "pending",
        decidedBy: "workbench-preview",
        safeReason: "P13 records approval metadata only.",
        visibleConsequences: ["Future approved phase may consume this metadata."],
        eventIds: ["event:p13:flow:approval"],
        createdAt,
      }),
    ],
    auditEvents: [{
      eventId: "event:p13:flow:proposal",
      eventType: "patch.proposal.created" as const,
      proposalId: proposal.proposalId,
      summary: "Flow proposal created.",
      createdAt,
      status: "preview" as const,
    }],
  };
}

function createP14RunnerWorkflowPreview(): { executionRequests: RunnerExecutionRequestEnvelope[] } {
  const createdAt = "2026-07-08T00:00:00.000Z";
  const executionRequestId = "runner-request:p14:flow";
  const targetRef = {
    targetRefId: "target:p14:flow",
    targetKind: "scratch-fixture" as const,
    displayPath: "fixtures/p14/flow.cpp",
    workspaceId: "workspace:flow",
    languageId: "cpp" as const,
    contentHashBefore: "sha256:p14-flow-before",
    inputRefs: ["input:p14:flow"],
    expectedOutputRefs: ["output:p14:flow"],
    permissionScope: "workspace-preview",
    pathSafetyStatus: "safe-preview" as const,
    notesPolicy: "fixture-only" as const,
    networkPolicy: "none" as const,
  };
  const sandboxPlan = {
    sandboxPlanId: `${executionRequestId}:sandbox`,
    profile: "read-only-classification" as const,
    workingDirectoryRef: "workspace-ref:p14-flow",
    allowedTargetRefs: [targetRef.targetRefId],
    networkAccess: "none" as const,
    secretAccess: "none" as const,
    credentialAccess: "none" as const,
    writeAccess: "none" as const,
    maxFilesTouched: 0,
    timeoutMs: 5000,
    maxOutputBytes: 4096,
    maxInputBytes: 2048,
    environmentPolicy: "p14-metadata-only-no-runtime",
    cleanupPolicy: "p14-no-op-cleanup-preview",
    blockedReasons: [],
    createdAt,
  };
  const classification = {
    classificationId: `${executionRequestId}:classification`,
    executionRequestId,
    commandClass: "test" as const,
    languageClass: "cpp" as const,
    testRunClass: "sample-test" as const,
    riskLevel: "medium" as const,
    riskReasons: ["sample_test_contract_preview_only"],
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
    reason: "P14 requires future-phase approval only.",
    requestedByEventId: "event:p14:flow:permission",
    targetRefs: [targetRef.targetRefId],
    sandboxPlanId: sandboxPlan.sandboxPlanId,
    approvalSurface: "workbench-read-only",
    createdAt,
  };
  const mockResult = {
    mockResultId: `${executionRequestId}:mock:dry-run`,
    executionRequestId,
    mode: "dry-run" as const,
    status: "planned" as const,
    plannedRunnerKind: "test-run" as const,
    plannedSandboxProfile: "read-only-classification" as const,
    safeInputSummary: "Flow input fixture summary.",
    safeOutputSummary: "Flow output fixture summary.",
    exitCodePreview: null,
    durationMsPreview: 0,
    filesTouchedPreview: 0,
    networkAccessPreview: "none" as const,
    resourceLimitPreview: "timeoutMs=5000; maxOutputBytes=4096; maxInputBytes=2048; maxFilesTouched=0; networkAccess=none; trueExecution=unavailable",
    observationId: `${executionRequestId}:observation:dry-run`,
    safeErrors: [],
    createdAt,
  };

  return {
    executionRequests: [
      createRunnerExecutionRequestEnvelope({
        executionRequestId,
        sessionId: "session:p14:flow",
        turnId: "turn:p14:flow",
        stepId: "step:p14:flow",
        sourceKind: "fixture",
        sourceEventIds: ["event:p14:flow:request"],
        workspaceRefs: ["workspace:flow"],
        evidenceRefs: ["evidence:flow"],
        targetRefs: [targetRef],
        runnerKind: "test-run",
        runnerIntent: {
          summary: "Flow runner request preview.",
          commandClass: "test",
          languageClass: "cpp",
          testRunClass: "sample-test",
        },
        classification,
        requestedInputs: [{
          inputRefId: "input:p14:flow",
          inputKind: "stdin-fixture",
          safeSummary: "Flow stdin fixture.",
        }],
        expectedOutputs: [{
          outputRefId: "output:p14:flow",
          outputKind: "expected-output-fixture",
          safeSummary: "Flow expected output fixture.",
        }],
        sandboxPlan,
        resourceLimits: {
          timeoutMs: 5000,
          maxOutputBytes: 4096,
          maxInputBytes: 2048,
          maxFilesTouched: 0,
          networkAccess: "none",
          secretAccess: "none",
          writeAccess: "none",
          trueExecution: "unavailable",
        },
        permissionRequest,
        approvalDecision: {
          approvalDecisionId: `${executionRequestId}:approval:execute`,
          permissionRequestId: permissionRequest.permissionRequestId,
          executionRequestId,
          status: "pending",
          decidedBy: "p14-permission-sandbox-policy",
          safeReason: "P14 approval read model status is pending; it does not start a process.",
          visibleConsequences: ["No process is started and no workspace mutation is performed in P14."],
          blockedCapabilities: ["execute", "true-execution", "workspace-mutation"],
          eventIds: ["event:p14:flow:approval"],
          createdAt,
        },
        mockResult,
        observationPolicy: {
          observationId: mockResult.observationId,
          executionRequestId,
          mockResultId: mockResult.mockResultId,
          sourceEventIds: ["event:p14:flow:mock"],
          status: "simulated",
          safeSummary: "Flow observation summary.",
          boundedStdout: "",
          boundedStderr: "",
          exitCodePreview: null,
          redactionStatus: "not-needed",
          droppedFields: [],
          truncated: false,
          maxOutputBytes: 4096,
          continuationVisibility: "timeline-visible",
          createdAt,
        },
        rollbackCleanupPlan: {
          rollbackCleanupPlanId: `${executionRequestId}:rollback-cleanup`,
          executionRequestId,
          requiredBeforeExecute: true,
          preRunContentHashes: [{
            targetRefId: targetRef.targetRefId,
            contentHashBefore: targetRef.contentHashBefore,
          }],
          affectedTargetRefs: [targetRef.targetRefId],
          temporaryDirectoryPolicy: "refs only",
          artifactRetentionPolicy: "no artifacts retained",
          cleanupStepsPreview: ["future phase cleanup required"],
          recoveryStrategy: "content hash restore metadata only",
          unavailableReasons: ["true_execution_unavailable_in_p14"],
          createdAt,
        },
        redactionResult: {
          redactionStatus: "not-needed",
          redactedClasses: [],
          safeSummary: "Flow runner request preview.",
        },
        createdAt,
        capabilityStatus: "preview",
      }),
    ],
  };
}

function createP15CookieReaderPreview(): CookieReaderRequestEnvelope {
  const createdAt = "2026-07-08T00:00:00.000Z";
  const readerRequestId = "reader:p15:flow";
  const boundary = buildCookieReaderSourceBoundaryDecision({
    readerRequestId,
    sourceRefId: "source:p15:flow",
    sourceProfile: "workspace-fixture",
    displayOrigin: "fixture://workspace/p15-flow",
    createdAt,
  });
  const redactionPolicy = buildCookieReaderRedactionPolicy({
    redactionPolicyId: `${readerRequestId}:redaction`,
    readerRequestId,
    createdAt,
  });
  const mockProjection = projectMockCookieReaderFixture({
    fixtureId: "fixture:p15:flow",
    readerRequestId,
    sourceProfile: boundary.sourceRef.sourceProfile,
    displayOrigin: boundary.sourceRef.displayOrigin,
    title: "P15 flow fixture",
    excerpt: "Fixture-only flow observation.",
    evidenceRefs: ["evidence:p15:flow"],
    createdAt,
  });

  return createCookieReaderRequestEnvelope({
    readerRequestId,
    sessionId: "session:p15:flow",
    turnId: "turn:p15:flow",
    stepId: "step:p15:flow",
    sourceKind: "fixture",
    sourceEventIds: ["event:p15:flow"],
    sourceRefs: [boundary.sourceRef],
    workspaceRefs: ["workspace:p15:flow"],
    evidenceRefs: ["evidence:p15:flow"],
    requestedUrlRef: "url-ref:p15:flow",
    sourceBoundary: boundary.sourceBoundary,
    permissionRequest: {
      permissionRequestId: `${readerRequestId}:permission`,
      readerRequestId,
      requestedSourceProfile: boundary.sourceRef.sourceProfile,
      requestedDisplayOrigin: boundary.sourceRef.displayOrigin,
      decisionStatus: boundary.permissionStatus,
      reviewReason: "P15 flow preview metadata only.",
      requestedSensitiveInput: false,
      sourceRefs: [boundary.sourceRef.sourceRefId],
      approvalSurface: "workbench-read-only",
      requestedByEventId: "event:p15:flow",
      createdAt,
    },
    approvalDecision: {
      approvalDecisionId: `${readerRequestId}:approval`,
      permissionRequestId: `${readerRequestId}:permission`,
      readerRequestId,
      status: "pending",
      decidedBy: "p15-preview-policy",
      safeReason: "No true reader is available in P15.",
      visibleConsequences: ["Workbench receives fixture projection only."],
      blockedCapabilities: ["true-cookie-reader"],
      eventIds: ["event:p15:flow:approval"],
      createdAt,
    },
    redactionPolicy,
    mockProjection,
    auditSummary: buildCookieReaderAuditSummary({
      readerRequestId,
      sourceProfile: boundary.sourceRef.sourceProfile,
      displayOrigin: boundary.sourceRef.displayOrigin,
      capabilityStatus: boundary.capabilityStatus,
      permissionStatus: boundary.permissionStatus,
      redactionStatus: redactionPolicy.redactionStatus,
      blockedReasons: boundary.blockedReasons,
      fixtureId: mockProjection.fixtureId,
      createdAt,
    }),
    capabilityStatus: boundary.capabilityStatus,
    createdAt,
  });
}

describe("runManualWorkbenchTask", () => {
  it("runs a manual URL through runtime events, workspace state, evidence, and separated caches", async () => {
    const result = await runManualWorkbenchTask({
      problem: {
        title: "Manual LCA Problem",
        problemId: "manual-lca",
        problemUrl: "https://example.com/lca",
      },
      manualSource: {
        url: "https://example.com/lca",
        title: "Lowest Common Ancestor Notes",
        text: [
          "Lowest common ancestor can be solved with binary lifting after a DFS preprocessing pass.",
          "For each vertex, up[v][k] stores the 2^k-th ancestor of v, and depths are used to lift the deeper node first.",
          "The query then lifts both nodes from high powers down until their parents match.",
        ].join("\n\n"),
      },
    });

    expect(result.workspace.evidenceIds).toEqual([result.evidenceRecords[0]?.packetId]);
    expect(result.workspace.traceEventIds.length).toBe(result.events.length);
    expect(result.events.map((event) => event.type)).toEqual([
      "agent.started",
      "tool.requested",
      "permission.resolved",
      "tool.started",
      "tool.output",
      "evidence.added",
      "workspace.updated",
      "agent.completed",
    ]);
    expect(result.evidenceRecords).toHaveLength(1);
    expect(result.evidenceRecords[0]?.packet.evidenceItems[0]).toMatchObject({
      url: "https://example.com/lca",
      title: "Lowest Common Ancestor Notes",
      canCite: true,
    });
    expect(result.cacheSnapshot.namespaces).toMatchObject({
      search: 1,
      read: 1,
      extract: 1,
      evidence: 1,
      workspace: 1,
    });
    expect(result.permissionRequests).toEqual([
      expect.objectContaining({
        id: "tavily_search:prompt-required",
        toolName: "tavily_search",
        permission: "public-network",
        status: "pending",
        reason: "public_network_requires_user_permission",
      }),
      expect.objectContaining({
        id: "luogu_cookie_reader:unavailable",
        toolName: "luogu_cookie_reader",
        permission: "cookie-network",
        status: "blocked",
        reason: "cookie_network_unavailable_in_preview",
      }),
    ]);
    expect(result.permissionRequests.map((request) => request.permission)).not.toContain("network");
    expect(result.permissionRequests.map((request) => request.status)).toEqual(["pending", "blocked"]);
    expect(result.oiSkillPreview.invocation.skillId).toBe("research-problem");
    expect(result.oiSkillPreview.status).toBe("completed");
    expect(result.oiSkillPreview.solutionOutline?.status).toBe("preview");
    expect(result.oiSkillPreview.permissionRequests).toEqual(result.permissionRequests);
    expect(result.oiSkillPreview.limitations).toContain("deterministic_preview_only");
    expect(result.sessionReplay.outputState).toBe("Agent Session/Replay Contract Preview");
    expect(result.sessionReplayViewModel.title).toBe("Agent Session/Replay Contract Preview");
    expect(result.sessionReplay.capabilityStatuses.providerRequest.status).toBe("unavailable");
    expect(result.modelLoopPreview).toBeNull();
    expect(result.providerModelPreview.title).toBe("Provider/Model Adapter Contract Preview");
    expect(result.providerModelPreview.providerRequestStatus.status).toBe("unavailable");
    expect(result.providerModelPreview.limitations).toContain("no_live_provider_request");
    expect(result.patchWorkflowPreview).toBeNull();
    expect(result.events.map((event) => event.type)).not.toEqual(expect.arrayContaining([
      reservedModelEventType,
      "patch.generated",
      "patch.applied",
    ]));
  });

  it("passes through a P10 provider model preview when live read model exists", async () => {
    const result = await runWorkbenchTask({
      mode: "manual_url",
      problem: {
        title: "Live Provider Projection",
        problemId: "live-provider-projection",
        problemUrl: "https://example.test/live-provider",
      },
      manualSource: {
        url: "https://example.test/live-provider",
        title: "Live Provider Projection",
        text: "Projection fixture.",
      },
      providerModelPreview: {
        requestId: "request:p10:workbench",
        providerProfileId: "provider:openai-compatible",
        modelProfileId: "model:gated",
        outputState: "Live Provider Request / One-Turn Model Step Contract Preview",
        events: [
          {
            type: "model.delta.live",
            requestId: "request:p10:workbench",
            sequence: 1,
            at: "2026-07-07T00:00:01.000Z",
            text: "Live projection.",
          },
        ],
        capabilities: {
          providerRequest: { status: "preview", reason: "p10_live_gate" },
          streaming: { status: "preview", reason: "p10_live_gate" },
          toolCalling: { status: "reserved", reason: "future_phase" },
        },
        limitations: ["one_turn_only", "no_patch_apply"],
      },
    });

    expect(result.providerModelPreview.title).toMatch(/Provider Request|Provider\/Model Adapter/);
    expect(result.providerModelPreview.previewText).toBe("Live projection.");
    expect(result.providerModelPreview.limitations).toContain("no_patch_apply");
    expect(result.modelLoopPreview).toBeNull();
  });

  it("attaches a P11 model loop projection only when a runtime loop result exists", async () => {
    const result = await runWorkbenchTask({
      mode: "manual_url",
      problem: {
        title: "P11 Loop Projection",
        problemId: "p11-loop-projection",
        problemUrl: "https://example.test/p11-loop",
      },
      manualSource: {
        url: "https://example.test/p11-loop",
        title: "P11 Loop Projection",
        text: "Projection fixture.",
      },
      modelLoopPreview: await createP11LoopResult(),
      providerModelPreview: {
        requestId: "request:p10:still-present",
        providerProfileId: "provider:mock",
        modelProfileId: "model:mock",
        outputState: "Live Provider Request / One-Turn Model Step Contract Preview",
        events: [],
        capabilities: {
          providerRequest: { status: "preview", reason: "p10_passthrough" },
          streaming: { status: "reserved", reason: "p10_passthrough" },
          toolCalling: { status: "reserved", reason: "future_phase" },
        },
        limitations: ["one_turn_only"],
      },
    });

    expect(result.modelLoopPreview?.title).toBe("Multi-Step Model Loop / Tool-Call Continuation Contract Preview");
    expect(result.modelLoopPreview?.timeline.map((item) => item.kind)).toEqual(expect.arrayContaining([
      "tool-call",
      "permission",
      "observation",
      "terminal",
    ]));
    expect(result.providerModelPreview.title).toMatch(/Provider Request|Provider\/Model Adapter/);
    expect(result.providerModelPreview.limitations).toContain("one_turn_only");
  });

  it("attaches a P12 session history projection only when runtime preview data exists", async () => {
    const withoutP12 = await runWorkbenchTask({
      mode: "manual_url",
      problem: {
        title: "No P12 Projection",
        problemId: "no-p12-projection",
        problemUrl: "https://example.test/no-p12",
      },
      manualSource: {
        url: "https://example.test/no-p12",
        title: "No P12 Projection",
        text: "Projection fixture.",
      },
    });
    const withP12 = await runWorkbenchTask({
      mode: "manual_url",
      problem: {
        title: "P12 Session History Projection",
        problemId: "p12-session-history-projection",
        problemUrl: "https://example.test/p12-session-history",
      },
      manualSource: {
        url: "https://example.test/p12-session-history",
        title: "P12 Session History Projection",
        text: "Projection fixture.",
      },
      sessionHistoryPreview: createP12SessionHistoryPreview(),
      modelLoopPreview: await createP11LoopResult(),
    });

    expect(withoutP12.sessionHistoryPreview).toBeNull();
    expect(withP12.sessionHistoryPreview?.title).toBe(
      "Durable Session / Request Log / Replay Persistence Contract Preview",
    );
    expect(withP12.sessionHistoryPreview?.summary).toMatchObject({
      eventCount: 1,
      checkpointCount: 1,
      requestAuditRecordCount: 1,
      warningCount: 0,
    });
    expect(withP12.sessionReplayViewModel.title).toBe("Agent Session/Replay Contract Preview");
    expect(withP12.modelLoopPreview?.title).toBe("Multi-Step Model Loop / Tool-Call Continuation Contract Preview");
  });

  it("attaches a P13 patch workflow projection only when runtime preview data exists while preserving P12 projection", async () => {
    const withoutP13 = await runWorkbenchTask({
      mode: "manual_url",
      problem: {
        title: "No P13 Projection",
        problemId: "no-p13-projection",
        problemUrl: "https://example.test/no-p13",
      },
      manualSource: {
        url: "https://example.test/no-p13",
        title: "No P13 Projection",
        text: "Projection fixture.",
      },
      sessionHistoryPreview: createP12SessionHistoryPreview(),
    });
    const withP13 = await runWorkbenchTask({
      mode: "manual_url",
      problem: {
        title: "P13 Patch Workflow Projection",
        problemId: "p13-patch-workflow-projection",
        problemUrl: "https://example.test/p13-patch",
      },
      manualSource: {
        url: "https://example.test/p13-patch",
        title: "P13 Patch Workflow Projection",
        text: "Projection fixture.",
      },
      sessionHistoryPreview: createP12SessionHistoryPreview(),
      patchWorkflowPreview: createP13PatchWorkflowPreview(),
    });

    expect(withoutP13.patchWorkflowPreview).toBeNull();
    expect(withoutP13.sessionHistoryPreview?.title).toBe(
      "Durable Session / Request Log / Replay Persistence Contract Preview",
    );
    expect(withP13.patchWorkflowPreview?.title).toBe("Patch / Write Workflow Contract Preview");
    expect(withP13.patchWorkflowPreview?.summary).toMatchObject({
      proposalCount: 1,
      targetCount: 1,
      diffPreviewCount: 1,
      auditEventCount: 1,
    });
    expect(withP13.patchWorkflowPreview?.proposals[0]?.permissionRequest.decisionStatus).toBe("prompt-required");
    expect(withP13.sessionHistoryPreview?.title).toBe(
      "Durable Session / Request Log / Replay Persistence Contract Preview",
    );
  });

  it("attaches a P14 runner workflow projection only when runtime preview data exists while preserving P13 projection", async () => {
    const withoutP14 = await runWorkbenchTask({
      mode: "manual_url",
      problem: {
        title: "No P14 Projection",
        problemId: "no-p14-projection",
        problemUrl: "https://example.test/no-p14",
      },
      manualSource: {
        url: "https://example.test/no-p14",
        title: "No P14 Projection",
        text: "Projection fixture.",
      },
      patchWorkflowPreview: createP13PatchWorkflowPreview(),
    });
    const withP14 = await runWorkbenchTask({
      mode: "manual_url",
      problem: {
        title: "P14 Runner Workflow Projection",
        problemId: "p14-runner-workflow-projection",
        problemUrl: "https://example.test/p14-runner",
      },
      manualSource: {
        url: "https://example.test/p14-runner",
        title: "P14 Runner Workflow Projection",
        text: "Projection fixture.",
      },
      patchWorkflowPreview: createP13PatchWorkflowPreview(),
      runnerWorkflowPreview: createP14RunnerWorkflowPreview(),
    });

    expect(withoutP14.runnerWorkflowPreview).toBeNull();
    expect(withoutP14.patchWorkflowPreview?.title).toBe("Patch / Write Workflow Contract Preview");
    expect(withP14.runnerWorkflowPreview?.title).toBe("Execute / Code Runner Contract Preview");
    expect(withP14.runnerWorkflowPreview?.summary).toMatchObject({
      executionRequestId: "runner-request:p14:flow",
      targetCount: 1,
      auditEventCount: 9,
    });
    expect(withP14.runnerWorkflowPreview?.permissionRequest.decisionStatus).toBe("prompt-required");
    expect(withP14.runnerWorkflowPreview?.mockResult.status).toBe("planned");
    expect(withP14.patchWorkflowPreview?.title).toBe("Patch / Write Workflow Contract Preview");
  });

  it("attaches a P15 cookie reader projection only when runtime preview data exists while preserving P14 projection", async () => {
    const withoutP15 = await runWorkbenchTask({
      mode: "manual_url",
      problem: {
        title: "No P15 Projection",
        problemId: "no-p15-projection",
        problemUrl: "https://example.test/no-p15",
      },
      manualSource: {
        url: "https://example.test/no-p15",
        title: "No P15 Projection",
        text: "Projection fixture.",
      },
      runnerWorkflowPreview: createP14RunnerWorkflowPreview(),
    });
    const withP15 = await runWorkbenchTask({
      mode: "manual_url",
      problem: {
        title: "P15 Cookie Reader Projection",
        problemId: "p15-cookie-reader-projection",
        problemUrl: "https://example.test/p15-cookie-reader",
      },
      manualSource: {
        url: "https://example.test/p15-cookie-reader",
        title: "P15 Cookie Reader Projection",
        text: "Projection fixture.",
      },
      runnerWorkflowPreview: createP14RunnerWorkflowPreview(),
      cookieReaderPreview: createP15CookieReaderPreview(),
    });

    expect(withoutP15.cookieReaderPreview).toBeNull();
    expect(withoutP15.runnerWorkflowPreview?.title).toBe("Execute / Code Runner Contract Preview");
    expect(withP15.cookieReaderPreview?.title).toBe("Cookie-backed Reader Contract Preview");
    expect(withP15.cookieReaderPreview?.source.sourceProfile).toBe("workspace-fixture");
    expect(withP15.cookieReaderPreview?.fixtureObservation.mode).toBe("fixture-only");
    expect(withP15.runnerWorkflowPreview?.title).toBe("Execute / Code Runner Contract Preview");
  });

  it("initializes a Luogu workspace for the Luogu problem mode", async () => {
    const result = await runWorkbenchTask({
      mode: "luogu_problem",
      problem: {
        title: "P3379 LCA",
        problemId: "P3379",
        problemUrl: "https://www.luogu.com.cn/problem/P3379",
      },
    });

    expect(result.workspace.source).toBe("luogu");
    expect(result.workspace.problemUrl).toBe("https://www.luogu.com.cn/problem/P3379");
    expect(result.events[0]?.type).toBe("agent.started");
  });

  it("initializes a current research workspace for the current research mode", async () => {
    const result = await runWorkbenchTask({
      mode: "current_research",
      problem: {
        title: "Current Research Task",
        problemId: "research-1",
      },
      manualSource: {
        url: "https://example.com/research",
        title: "Research Notes",
        text: "Current research task notes.",
      },
    });

    expect(result.workspace.source).toBe("manual");
    expect(result.workspace.title).toBe("Current Research Task");
    expect(result.evidenceRecords).toHaveLength(1);
  });

  it("returns the preview loop contract with unavailable mature capabilities", async () => {
    const result = await runWorkbenchTask({
      mode: "manual_url",
      problem: {
        title: "Two Sum",
        problemId: "two-sum",
        problemUrl: "https://example.test/problem",
      },
      manualSource: {
        url: "https://example.test/editorial",
        title: "Editorial",
        text: "Use hashing.",
      },
    });

    expect(result.loopContract.mode).toBe("preview_one_shot");
    expect(result.loopContract.modelStep.status).toBe("unavailable");
    expect(result.loopContract.patchApply.status).toBe("unavailable");
    expect(result.loopContract.continuation.status).toBe("reserved");
  });

  it("exposes the registered preview read tool with P6 contract metadata", async () => {
    const result = await runWorkbenchTask({
      mode: "manual_url",
      problem: {
        title: "Segment Tree",
        problemId: "segment-tree",
        problemUrl: "https://example.test/segment-tree",
      },
      manualSource: {
        url: "https://example.test/segment-tree/editorial",
        title: "Segment Tree Editorial",
        text: "Maintain intervals in a tree.",
      },
    });

    expect(result.toolDefinitions).toEqual([
      expect.objectContaining({
        name: "read_manual_url",
        permission: "read",
        inputSchema: { type: "object", required: ["url"] },
        outputSchema: { type: "object", required: ["evidencePacketId", "sourceUrl"] },
        exposure: "workbench-preview",
        timeoutMs: 5000,
        lifecycle: {
          emits: ["tool.requested", "permission.resolved", "tool.started", "tool.output"],
        },
        failurePolicy: {
          unsupported: "structured-failure",
          timeout: "structured-failure",
          permissionDenied: "blocked-result",
        },
      }),
    ]);
  });

  it("keeps mature capabilities unavailable in UI-facing results", async () => {
    const result = await runWorkbenchTask({
      mode: "current_research",
      problem: {
        title: "Current context",
        problemId: "current-context",
      },
    });

    expect(result.loopContract.modelStep.reason).toBe("model_loop_unavailable");
    expect(result.loopContract.patchGeneration.reason).toBe("patch_generation_unavailable");
    expect(result.loopContract.sessionPersistence.reason).toBe("session_persistence_unavailable");
  });
});
