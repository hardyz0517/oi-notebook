import {
  P13_PATCH_WORKFLOW_OUTPUT_STATE,
  type PatchApprovalDecisionReadModel,
  type PatchDiffPreview,
  type PatchDryRunResult,
  type PatchPermissionRequest,
  type PatchProposalEnvelope,
  type PatchRollbackPlanMetadata,
  type PatchTargetRef,
  type PatchValidationResult,
  type PatchWorkflowCapabilityStatus,
  type SuccessfulP13PatchWorkflowEventType,
} from "@/lib/agent-runtime/patchWorkflowTypes";

export type PatchWorkflowAuditEvent = {
  eventId: string;
  eventType: SuccessfulP13PatchWorkflowEventType;
  proposalId: string;
  summary: string;
  createdAt: string;
  status: PatchWorkflowCapabilityStatus;
};

export type PatchWorkflowProjectionInput = {
  proposals: PatchProposalEnvelope[];
  diffPreviews: PatchDiffPreview[];
  approvalDecisions: PatchApprovalDecisionReadModel[];
  auditEvents: PatchWorkflowAuditEvent[];
};

export type PatchWorkflowProposalViewModel = {
  proposalId: string;
  sessionId: string;
  turnId: string;
  stepId: string;
  sourceKind: PatchProposalEnvelope["sourceKind"];
  sourceEventIds: string[];
  workspaceRefs: string[];
  evidenceRefs: string[];
  targetRefs: PatchTargetRef[];
  patchFormat: PatchProposalEnvelope["patchFormat"];
  proposalSummary: string;
  authoringMode: PatchProposalEnvelope["authoringMode"];
  risk: PatchProposalEnvelope["riskClassification"];
  permissionRequest: PatchPermissionRequest;
  approvalDecision: PatchApprovalDecisionReadModel | null;
  validationResult: PatchValidationResult;
  dryRunResult: PatchDryRunResult;
  rollbackPlan: PatchRollbackPlanMetadata;
  diffPreview: PatchDiffPreview | null;
  redaction: PatchProposalEnvelope["redactionResult"];
  capabilityStatus: PatchProposalEnvelope["capabilityStatus"];
  createdAt: string;
};

export type PatchWorkflowViewModel = {
  title: typeof P13_PATCH_WORKFLOW_OUTPUT_STATE;
  outputState: typeof P13_PATCH_WORKFLOW_OUTPUT_STATE;
  summary: {
    proposalCount: number;
    targetCount: number;
    diffPreviewCount: number;
    approvalDecisionCount: number;
    auditEventCount: number;
  };
  proposals: PatchWorkflowProposalViewModel[];
  auditEvents: PatchWorkflowAuditEvent[];
  limitations: string[];
};

export function createPatchWorkflowViewModel(
  input: PatchWorkflowProjectionInput,
): PatchWorkflowViewModel {
  const diffPreviewByProposalId = new Map(input.diffPreviews.map((diffPreview) => [
    diffPreview.proposalId,
    cloneDiffPreview(diffPreview),
  ]));
  const approvalDecisionByProposalId = new Map(input.approvalDecisions.map((approvalDecision) => [
    approvalDecision.proposalId,
    cloneApprovalDecision(approvalDecision),
  ]));
  const proposals = input.proposals.map((proposal) => projectProposal(
    proposal,
    diffPreviewByProposalId.get(proposal.proposalId) ?? null,
    approvalDecisionByProposalId.get(proposal.proposalId) ?? null,
  ));

  return {
    title: P13_PATCH_WORKFLOW_OUTPUT_STATE,
    outputState: P13_PATCH_WORKFLOW_OUTPUT_STATE,
    summary: {
      proposalCount: proposals.length,
      targetCount: proposals.reduce((count, proposal) => count + proposal.targetRefs.length, 0),
      diffPreviewCount: input.diffPreviews.length,
      approvalDecisionCount: input.approvalDecisions.length,
      auditEventCount: input.auditEvents.length,
    },
    proposals,
    auditEvents: input.auditEvents.map((event) => ({
      ...event,
      summary: sanitizeText(event.summary),
    })),
    limitations: [
      "read_only_projection",
      "preview_contract_only",
      "no_patch_apply",
      "no_file_write",
      "no_delete",
      "no_rollback_execution",
      "no_code_runner",
      "no_cookie_reader",
      "no_provider_or_tauri_call",
    ],
  };
}

function projectProposal(
  proposal: PatchProposalEnvelope,
  diffPreview: PatchDiffPreview | null,
  approvalDecision: PatchApprovalDecisionReadModel | null,
): PatchWorkflowProposalViewModel {
  return {
    proposalId: proposal.proposalId,
    sessionId: proposal.sessionId,
    turnId: proposal.turnId,
    stepId: proposal.stepId,
    sourceKind: proposal.sourceKind,
    sourceEventIds: [...proposal.sourceEventIds],
    workspaceRefs: [...proposal.workspaceRefs],
    evidenceRefs: [...proposal.evidenceRefs],
    targetRefs: proposal.targetRefs.map(cloneTargetRef),
    patchFormat: proposal.patchFormat,
    proposalSummary: sanitizeText(proposal.redactionResult.safeSummary || proposal.proposalSummary),
    authoringMode: proposal.authoringMode,
    risk: {
      ...proposal.riskClassification,
      riskReasons: proposal.riskClassification.riskReasons.map(sanitizeText),
      permissionKinds: [...proposal.riskClassification.permissionKinds],
    },
    permissionRequest: clonePermissionRequest(proposal.permissionRequest),
    approvalDecision,
    validationResult: cloneValidationResult(proposal.validationResult),
    dryRunResult: cloneDryRunResult(proposal.dryRunResult),
    rollbackPlan: cloneRollbackPlan(proposal.rollbackPlan),
    diffPreview,
    redaction: {
      ...proposal.redactionResult,
      redactedClasses: [...proposal.redactionResult.redactedClasses],
      safeSummary: sanitizeText(proposal.redactionResult.safeSummary),
    },
    capabilityStatus: proposal.capabilityStatus,
    createdAt: proposal.createdAt,
  };
}

function cloneTargetRef(targetRef: PatchTargetRef): PatchTargetRef {
  return {
    ...targetRef,
    lineRange: targetRef.lineRange === undefined ? undefined : { ...targetRef.lineRange },
  };
}

function clonePermissionRequest(permissionRequest: PatchPermissionRequest): PatchPermissionRequest {
  return {
    ...permissionRequest,
    reason: sanitizeText(permissionRequest.reason),
    targetRefs: [...permissionRequest.targetRefs],
  };
}

function cloneApprovalDecision(
  approvalDecision: PatchApprovalDecisionReadModel,
): PatchApprovalDecisionReadModel {
  return {
    ...approvalDecision,
    safeReason: sanitizeText(approvalDecision.safeReason),
    visibleConsequences: approvalDecision.visibleConsequences.map(sanitizeText),
    blockedCapabilities: [...approvalDecision.blockedCapabilities],
    eventIds: [...approvalDecision.eventIds],
  };
}

function cloneValidationResult(validationResult: PatchValidationResult): PatchValidationResult {
  return {
    ...validationResult,
    checks: validationResult.checks.map((check) => ({
      ...check,
      safeSummary: sanitizeText(check.safeSummary),
    })),
    safeErrors: validationResult.safeErrors.map(sanitizeText),
    warnings: validationResult.warnings.map(sanitizeText),
  };
}

function cloneDryRunResult(dryRunResult: PatchDryRunResult): PatchDryRunResult {
  return {
    ...dryRunResult,
    conflicts: dryRunResult.conflicts.map(sanitizeText),
    staleTargets: [...dryRunResult.staleTargets],
    blockedTargets: [...dryRunResult.blockedTargets],
  };
}

function cloneRollbackPlan(rollbackPlan: PatchRollbackPlanMetadata): PatchRollbackPlanMetadata {
  return {
    ...rollbackPlan,
    preApplyContentHashes: rollbackPlan.preApplyContentHashes.map((hash) => ({ ...hash })),
    affectedTargetRefs: [...rollbackPlan.affectedTargetRefs],
    manualRecoveryNotes: rollbackPlan.manualRecoveryNotes.map(sanitizeText),
    unavailableReasons: rollbackPlan.unavailableReasons.map(sanitizeText),
  };
}

function cloneDiffPreview(diffPreview: PatchDiffPreview): PatchDiffPreview {
  return {
    ...diffPreview,
    targetRefs: [...diffPreview.targetRefs],
    safeHunks: diffPreview.safeHunks.map((hunk) => ({
      ...hunk,
      safePreviewLines: hunk.safePreviewLines.map(sanitizeText),
    })),
    renderWarnings: diffPreview.renderWarnings.map(sanitizeText),
  };
}

function sanitizeText(value: string): string {
  return value
    .replace(/authorization\s*:\s*[^\n\r]+/gi, "[redacted:authorization]")
    .replace(/cookie\s*:\s*[^\n\r]+/gi, "[redacted:browser-cookie]")
    .replace(/sk-[a-z0-9_-]+/gi, "[redacted:secret-token]")
    .replace(/raw\s+provider\s+payload\s*:\s*[^\n\r]+/gi, "[redacted:provider-payload]")
    .replace(/raw\s+tool\s+output\s*:\s*[^\n\r]+/gi, "[redacted:tool-output]")
    .replace(/real\s+note\s+content/gi, "[redacted:note-content]")
    .trim();
}
