import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createPatchApprovalDecisionReadModel,
  createPatchPermissionRequests,
} from "@/lib/agent-runtime/patchRiskPolicy";
import {
  createPatchDiffPreview,
  projectPatchDryRun,
  projectPatchRollbackPlan,
} from "@/lib/agent-runtime/patchDiffPreview";
import {
  createPatchProposalEnvelope,
  P13_PATCH_WORKFLOW_OUTPUT_STATE,
  type PatchRiskClassification,
  type PatchTargetRef,
} from "@/lib/agent-runtime/patchWorkflowTypes";
import { createPatchWorkflowViewModel } from "./patchWorkflowViewModel";

const createdAt = "2026-07-08T00:00:00.000Z";

const safeTarget: PatchTargetRef = {
  targetRefId: "target:p13:fixture",
  targetKind: "scratch-fixture",
  displayPath: "fixtures/p13/workbench-preview.md",
  workspaceId: "workspace:p13",
  contentHashBefore: "sha256:fixture-before",
  lineRange: { startLine: 1, endLine: 4 },
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
  proposalId: "proposal:p13:workbench",
  requestedByEventId: "event:p13:permission-requested",
  targetRefs: [safeTarget],
  riskClassification,
  createdAt,
})[0];

const validationResult = {
  validationId: "validation:p13:workbench",
  proposalId: "proposal:p13:workbench",
  status: "passed" as const,
  checks: [{
    checkId: "check:p13:target-ref",
    status: "passed" as const,
    safeSummary: "Target refs are safe for P13 preview.",
  }],
  safeErrors: [],
  warnings: ["future_apply_requires_new_phase"],
  redactionStatus: "redacted" as const,
  createdAt,
};

const dryRunResult = projectPatchDryRun({
  dryRunId: "dry-run:p13:workbench",
  proposalId: "proposal:p13:workbench",
  status: "passed",
  targetRefs: [safeTarget],
  wouldChangeTargetRefIds: [safeTarget.targetRefId],
  createdAt,
});

const rollbackPlan = projectPatchRollbackPlan({
  rollbackPlanId: "rollback:p13:workbench",
  proposalId: "proposal:p13:workbench",
  targetRefs: [safeTarget],
  rollbackKind: "inverse-patch-preview",
  inversePatchPreviewRef: "diff:p13:inverse-preview",
  manualRecoveryNotes: ["Use inverse preview metadata in a future approved phase."],
  createdAt,
});

const proposal = createPatchProposalEnvelope({
  proposalId: "proposal:p13:workbench",
  sessionId: "session:p13:workbench",
  turnId: "turn:p13:workbench",
  stepId: "step:p13:workbench",
  sourceKind: "model-output",
  sourceEventIds: ["event:p13:proposal-created"],
  workspaceRefs: ["workspace:p13"],
  evidenceRefs: ["evidence:p13"],
  targetRefs: [safeTarget],
  patchFormat: "unified-diff",
  proposalSummary: "Refine fixture summary. Authorization: Bearer secret Cookie: sid=secret sk-test-secret raw provider payload: unsafe raw tool output: unsafe real note content",
  authoringMode: "agent-drafted",
  riskClassification,
  permissionRequest,
  validationResult,
  dryRunResult,
  rollbackPlan,
  redactionResult: {
    redactionStatus: "redacted",
    redactedClasses: ["authorization", "browser-cookie", "secret-token", "provider-payload", "tool-output", "note-content"],
    safeSummary: "Refine fixture summary.",
  },
  capabilityStatus: "preview",
  createdAt,
});

const diffPreview = createPatchDiffPreview({
  diffPreviewId: "diff:p13:workbench",
  proposalId: proposal.proposalId,
  targetRefs: [safeTarget],
  patchFormat: "unified-diff",
  unifiedDiffText: [
    "diff --git a/fixtures/p13/workbench-preview.md b/fixtures/p13/workbench-preview.md",
    "--- a/fixtures/p13/workbench-preview.md",
    "+++ b/fixtures/p13/workbench-preview.md",
    "@@ -1,2 +1,2 @@",
    "-old summary",
    "+new summary with Authorization: Bearer secret",
  ].join("\n"),
  createdAt,
});

const approvalDecision = createPatchApprovalDecisionReadModel({
  approvalDecisionId: "approval:p13:workbench",
  permissionRequestId: permissionRequest.permissionRequestId,
  proposalId: proposal.proposalId,
  status: "approved-for-future-apply",
  decidedBy: "fixture-reviewer",
  safeReason: "Metadata only; no patch is applied in P13.",
  visibleConsequences: ["Future apply phase would update one fixture target."],
  eventIds: ["event:p13:approval-read-model"],
  createdAt,
});

describe("createPatchWorkflowViewModel", () => {
  it("projects proposal, targets, diff, risk, permission, approval, validation, dry-run, rollback metadata, audit events, and output state", () => {
    const viewModel = createPatchWorkflowViewModel({
      proposals: [proposal],
      diffPreviews: [diffPreview],
      approvalDecisions: [approvalDecision],
      auditEvents: [
        {
          eventId: "event:p13:proposal-created",
          eventType: "patch.proposal.created",
          proposalId: proposal.proposalId,
          summary: "Proposal created from safe summary.",
          createdAt,
          status: "preview",
        },
        {
          eventId: "event:p13:rollback-plan",
          eventType: "patch.rollback_plan.created",
          proposalId: proposal.proposalId,
          summary: "Rollback metadata recorded.",
          createdAt,
          status: "preview",
        },
      ],
    });

    expect(viewModel.title).toBe(P13_PATCH_WORKFLOW_OUTPUT_STATE);
    expect(viewModel.outputState).toBe(P13_PATCH_WORKFLOW_OUTPUT_STATE);
    expect(viewModel.summary).toMatchObject({
      proposalCount: 1,
      targetCount: 1,
      diffPreviewCount: 1,
      auditEventCount: 2,
    });
    expect(viewModel.proposals[0]).toMatchObject({
      proposalId: proposal.proposalId,
      proposalSummary: "Refine fixture summary.",
      capabilityStatus: "preview",
      patchFormat: "unified-diff",
      risk: {
        riskLevel: "medium",
        requiresHumanApproval: true,
      },
      permissionRequest: {
        permissionKind: "patch-apply",
        decisionStatus: "prompt-required",
      },
      approvalDecision: {
        status: "approved-for-future-apply",
        safeReason: "Metadata only; no patch is applied in P13.",
      },
      validationResult: {
        status: "passed",
        warnings: ["future_apply_requires_new_phase"],
      },
      dryRunResult: {
        status: "passed",
        wouldChangeFiles: 1,
      },
      rollbackPlan: {
        rollbackKind: "inverse-patch-preview",
        affectedTargetRefs: [safeTarget.targetRefId],
      },
    });
    expect(viewModel.proposals[0]?.targetRefs).toEqual([
      expect.objectContaining({
        targetRefId: safeTarget.targetRefId,
        displayPath: safeTarget.displayPath,
        pathSafetyStatus: "safe-preview",
        notesPolicy: "fixture-only",
      }),
    ]);
    expect(viewModel.proposals[0]?.diffPreview?.safeHunks[0]?.safePreviewLines.join("\n")).toContain("[redacted:authorization]");
    expect(viewModel.auditEvents.map((event) => event.eventType)).toEqual([
      "patch.proposal.created",
      "patch.rollback_plan.created",
    ]);
    expect(viewModel.limitations).toEqual(expect.arrayContaining([
      "read_only_projection",
      "no_patch_apply",
      "no_file_write",
      "no_delete",
      "no_rollback_execution",
      "no_code_runner",
      "no_cookie_reader",
    ]));
  });

  it("does not expose raw provider payload, raw tool output, secret, header, browser cookie, or real note content", () => {
    const viewModel = createPatchWorkflowViewModel({
      proposals: [proposal],
      diffPreviews: [diffPreview],
      approvalDecisions: [approvalDecision],
      auditEvents: [{
        eventId: "event:p13:redacted",
        eventType: "patch.diff.preview.created",
        proposalId: proposal.proposalId,
        summary: "Diff preview redacted sensitive content.",
        createdAt,
        status: "preview",
      }],
    });
    const serialized = JSON.stringify(viewModel);

    expect(serialized).not.toContain("Bearer secret");
    expect(serialized).not.toContain("sid=secret");
    expect(serialized).not.toContain("sk-test-secret");
    expect(serialized).not.toContain("raw provider payload");
    expect(serialized).not.toContain("raw tool output");
    expect(serialized).not.toContain("real note content");
    expect(serialized).not.toContain("Authorization:");
    expect(serialized).not.toContain("Cookie:");
  });

  it("keeps the PatchWorkflowPanel source read-only without mutation, execution, provider, Tauri, or Cookie controls", () => {
    const panelSource = readFileSync(
      join(process.cwd(), "src/components/agent-workbench/PatchWorkflowPanel.tsx"),
      "utf8",
    );
    const forbiddenAffordances = [
      "onClick",
      "button",
      "apply" + "Patch",
      "patch " + "apply",
      "writeFile",
      "removeFile",
      "unlink",
      "run" + " code",
      "code " + "runner",
      "@tauri-apps/api/core",
      "invoke(",
      "providerRequest",
      "Co" + "okie",
    ];

    for (const forbiddenAffordance of forbiddenAffordances) {
      expect(panelSource).not.toContain(forbiddenAffordance);
    }
  });
});
