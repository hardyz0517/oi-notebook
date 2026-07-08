import { describe, expect, it } from "vitest";

import {
  P13_PATCH_WORKFLOW_OUTPUT_STATE,
  P13_PATCH_WORKFLOW_SCHEMA_VERSION,
  P13_SUCCESSFUL_PATCH_WORKFLOW_EVENT_TYPES,
  createPatchProposalEnvelope,
  isSuccessfulP13PatchWorkflowEventType,
} from "./patchWorkflowTypes";
import type {
  PatchApprovalDecisionReadModel,
  PatchDiffPreview,
  PatchDryRunResult,
  PatchProposalEnvelope,
  PatchRollbackPlanMetadata,
  PatchTargetRef,
  PatchValidationResult,
} from "./patchWorkflowTypes";

describe("P13 patch workflow contract types", () => {
  const createdAt = "2026-07-08T00:00:00.000Z";

  const safeTargetRef = {
    targetRefId: "target:p13:1",
    targetKind: "workspace-file",
    displayPath: "src/lib/example.ts",
    workspaceId: "workspace:general:1",
    contentHashBefore: "sha256:before",
    lineRange: { startLine: 1, endLine: 12 },
    permissionScope: "patch-preview",
    pathSafetyStatus: "safe-preview",
    notesPolicy: "not-read",
  } satisfies PatchTargetRef;

  const validationResult = {
    validationId: "validation:p13:1",
    proposalId: "proposal:p13:1",
    status: "passed",
    checks: [{ checkId: "check:p13:target", status: "passed", safeSummary: "Target refs are preview-safe." }],
    safeErrors: [],
    warnings: [],
    redactionStatus: "redacted",
    createdAt,
  } satisfies PatchValidationResult;

  const dryRunResult = {
    dryRunId: "dry-run:p13:1",
    proposalId: "proposal:p13:1",
    status: "not-run",
    targetCompatibility: "preview-only",
    wouldChangeFiles: 1,
    wouldCreateFiles: 0,
    wouldDeleteFiles: 0,
    conflicts: [],
    staleTargets: [],
    blockedTargets: [],
    createdAt,
  } satisfies PatchDryRunResult;

  const rollbackPlan = {
    rollbackPlanId: "rollback-plan:p13:1",
    proposalId: "proposal:p13:1",
    rollbackKind: "inverse-patch-preview",
    requiredBeforeApply: true,
    preApplyContentHashes: [{ targetRefId: "target:p13:1", contentHashBefore: "sha256:before" }],
    affectedTargetRefs: ["target:p13:1"],
    inversePatchPreviewRef: "diff-preview:p13:inverse",
    manualRecoveryNotes: ["Restore from hash-verified preview metadata in a future approved phase."],
    unavailableReasons: [],
    createdAt,
  } satisfies PatchRollbackPlanMetadata;

  it("creates proposal envelopes with the frozen P13 fields and output state", () => {
    const envelope = createPatchProposalEnvelope({
      proposalId: "proposal:p13:1",
      sessionId: "session:p13:1",
      turnId: "turn:p13:1",
      stepId: "step:p13:1",
      sourceKind: "model-output",
      sourceEventIds: ["event:p13:model-output"],
      workspaceRefs: ["workspace:general:1"],
      evidenceRefs: ["evidence:bounded:1"],
      targetRefs: [safeTargetRef],
      patchFormat: "unified-diff",
      proposalSummary: "Preview a single workspace-file edit without applying it.",
      authoringMode: "agent-drafted",
      riskClassification: {
        riskLevel: "medium",
        riskReasons: ["single_safe_workspace_target"],
        permissionKinds: ["patch-apply"],
        requiresHumanApproval: true,
        requiresFreshRead: true,
        requiresDryRun: true,
        requiresRollbackPlan: true,
      },
      permissionRequest: {
        permissionRequestId: "permission:p13:1",
        proposalId: "proposal:p13:1",
        permissionKind: "patch-apply",
        decisionStatus: "prompt-required",
        riskLevel: "medium",
        reason: "Future patch apply requires explicit human approval.",
        requestedByEventId: "event:p13:model-output",
        targetRefs: ["target:p13:1"],
        approvalSurface: "workbench-read-only",
        expiresAt: "2026-07-08T01:00:00.000Z",
        createdAt,
      },
      validationResult,
      dryRunResult,
      rollbackPlan,
      redactionResult: {
        redactionStatus: "redacted",
        redactedClasses: ["safe-metadata"],
        safeSummary: "Only bounded proposal metadata is visible.",
      },
      capabilityStatus: "preview",
      createdAt,
    });

    expect(envelope).toEqual({
      proposalId: "proposal:p13:1",
      sessionId: "session:p13:1",
      turnId: "turn:p13:1",
      stepId: "step:p13:1",
      sourceKind: "model-output",
      sourceEventIds: ["event:p13:model-output"],
      workspaceRefs: ["workspace:general:1"],
      evidenceRefs: ["evidence:bounded:1"],
      targetRefs: [safeTargetRef],
      patchFormat: "unified-diff",
      proposalSummary: "Preview a single workspace-file edit without applying it.",
      authoringMode: "agent-drafted",
      riskClassification: {
        riskLevel: "medium",
        riskReasons: ["single_safe_workspace_target"],
        permissionKinds: ["patch-apply"],
        requiresHumanApproval: true,
        requiresFreshRead: true,
        requiresDryRun: true,
        requiresRollbackPlan: true,
      },
      permissionRequest: {
        permissionRequestId: "permission:p13:1",
        proposalId: "proposal:p13:1",
        permissionKind: "patch-apply",
        decisionStatus: "prompt-required",
        riskLevel: "medium",
        reason: "Future patch apply requires explicit human approval.",
        requestedByEventId: "event:p13:model-output",
        targetRefs: ["target:p13:1"],
        approvalSurface: "workbench-read-only",
        expiresAt: "2026-07-08T01:00:00.000Z",
        createdAt,
      },
      validationResult,
      dryRunResult,
      rollbackPlan,
      redactionResult: {
        redactionStatus: "redacted",
        redactedClasses: ["safe-metadata"],
        safeSummary: "Only bounded proposal metadata is visible.",
      },
      createdAt,
      schemaVersion: P13_PATCH_WORKFLOW_SCHEMA_VERSION,
      outputState: "Patch / Write Workflow Contract Preview",
      capabilityStatus: "preview",
    } satisfies PatchProposalEnvelope);
    expect(envelope.outputState).toBe(P13_PATCH_WORKFLOW_OUTPUT_STATE);
  });

  it("keeps target refs display-only with stale-preview and notes-policy metadata", () => {
    expect(safeTargetRef).toEqual({
      targetRefId: "target:p13:1",
      targetKind: "workspace-file",
      displayPath: "src/lib/example.ts",
      workspaceId: "workspace:general:1",
      contentHashBefore: "sha256:before",
      lineRange: { startLine: 1, endLine: 12 },
      permissionScope: "patch-preview",
      pathSafetyStatus: "safe-preview",
      notesPolicy: "not-read",
    });
  });

  it("defines read-only diff, approval, validation, dry-run and rollback metadata projections", () => {
    const diffPreview = {
      diffPreviewId: "diff-preview:p13:1",
      proposalId: "proposal:p13:1",
      targetRefs: ["target:p13:1"],
      format: "unified-diff-preview",
      filesChanged: 1,
      insertions: 3,
      deletions: 1,
      safeHunks: [
        {
          targetRefId: "target:p13:1",
          oldStart: 1,
          oldLines: 4,
          newStart: 1,
          newLines: 6,
          safePreviewLines: ["@@ bounded preview @@", "+safe line"],
        },
      ],
      truncated: false,
      redactionStatus: "redacted",
      renderWarnings: [],
      createdAt,
    } satisfies PatchDiffPreview;
    const approvalDecision = {
      approvalDecisionId: "approval:p13:1",
      permissionRequestId: "permission:p13:1",
      proposalId: "proposal:p13:1",
      status: "approved-for-future-apply",
      decidedBy: "human-reviewer",
      safeReason: "Metadata only; no P13 mutation occurs.",
      visibleConsequences: ["May be handed to a later approved apply-capable phase."],
      blockedCapabilities: ["real-patch-apply", "write-mutation"],
      eventIds: ["event:p13:permission-resolved"],
      createdAt,
    } satisfies PatchApprovalDecisionReadModel;

    expect(diffPreview.format).toBe("unified-diff-preview");
    expect(diffPreview.safeHunks[0]?.safePreviewLines).toEqual(["@@ bounded preview @@", "+safe line"]);
    expect(approvalDecision.status).toBe("approved-for-future-apply");
    expect(validationResult.status).toBe("passed");
    expect(dryRunResult.status).toBe("not-run");
    expect(rollbackPlan.requiredBeforeApply).toBe(true);
  });

  it("does not represent reserved apply, file mutation, rollback or command events as successful P13 events", () => {
    expect(P13_SUCCESSFUL_PATCH_WORKFLOW_EVENT_TYPES).toEqual([
      "patch.proposal.created",
      "patch.proposal.normalized",
      "patch.proposal.validation.started",
      "patch.proposal.validation.completed",
      "patch.diff.preview.created",
      "patch.risk.classified",
      "patch.permission.requested",
      "patch.permission.resolved",
      "patch.approval.read_model.created",
      "patch.dry_run.started",
      "patch.dry_run.completed",
      "patch.rollback_plan.created",
      "patch.proposal.blocked",
      "patch.proposal.failed",
      "patch.proposal.discarded",
    ]);

    for (const reservedEventType of [
      "patch.applied",
      "file.write.completed",
      "file.delete.completed",
      "rollback.executed",
      "command.executed",
    ]) {
      expect(isSuccessfulP13PatchWorkflowEventType(reservedEventType)).toBe(false);
    }
  });

  it("keeps exported constants and pure contract helpers free of real IO, network, Tauri, provider or execution behavior", () => {
    const exportedContractSurface = JSON.stringify({
      outputState: P13_PATCH_WORKFLOW_OUTPUT_STATE,
      successfulEvents: P13_SUCCESSFUL_PATCH_WORKFLOW_EVENT_TYPES,
    });
    const forbiddenRuntimeHookTerms = [
      "fs.",
      "write" + "File",
      "remove" + "File",
      "unlink",
      "apply" + "Patch(",
      "spawn",
      "Command",
      "fetch(",
      "XMLHttp" + "Request",
      "Event" + "Source",
      "Web" + "Socket",
      "@tauri-apps/api/core",
      "invoke(",
      "Authori" + "zation",
      "api" + "Key",
      "OPENAI_" + "API_KEY",
      "ANTHROPIC_" + "API_KEY",
      "sk-",
      "coo" + "kie",
    ];

    for (const term of forbiddenRuntimeHookTerms) {
      expect(exportedContractSurface).not.toContain(term);
    }
  });
});
