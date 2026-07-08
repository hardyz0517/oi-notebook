export const P13_PATCH_WORKFLOW_SCHEMA_VERSION = 1 as const;
export const SUPPORTED_P13_PATCH_WORKFLOW_SCHEMA_VERSIONS = [P13_PATCH_WORKFLOW_SCHEMA_VERSION] as const;

export const P13_PATCH_WORKFLOW_PHASE_NAME = "P13 Patch / Write Workflow Contract Freeze" as const;
export const P13_PATCH_WORKFLOW_INPUT_STATE =
  "Durable Session / Request Log / Replay Persistence Contract Preview" as const;
export const P13_PATCH_WORKFLOW_OUTPUT_STATE = "Patch / Write Workflow Contract Preview" as const;

export type P13PatchWorkflowSchemaVersion = typeof P13_PATCH_WORKFLOW_SCHEMA_VERSION;
export type P13PatchWorkflowPhaseName = typeof P13_PATCH_WORKFLOW_PHASE_NAME;
export type P13PatchWorkflowInputState = typeof P13_PATCH_WORKFLOW_INPUT_STATE;
export type P13PatchWorkflowOutputState = typeof P13_PATCH_WORKFLOW_OUTPUT_STATE;

export type PatchWorkflowCapabilityStatus = "preview" | "reserved" | "unavailable" | "denied" | "blocked";

export type PatchProposalSourceKind =
  | "model-output"
  | "tool-observation"
  | "user-draft"
  | "fixture"
  | "manual-import";

export type PatchFormat = "unified-diff" | "structured-edit" | "whole-file-preview" | "unsupported";

export type PatchAuthoringMode = "agent-drafted" | "user-drafted" | "tool-derived" | "fixture";

export type PatchTargetKind =
  | "workspace-file"
  | "note-ref"
  | "generated-artifact"
  | "scratch-fixture"
  | "unsupported";

export type PatchPathSafetyStatus = "safe-preview" | "requires-review" | "blocked" | "unsupported" | "unknown";

export type PatchNotesPolicy =
  | "not-read"
  | "fixture-only"
  | "ref-only"
  | "blocked"
  | "explicitly-approved-future-phase";

export type PatchTargetRef = {
  targetRefId: string;
  targetKind: PatchTargetKind;
  displayPath: string;
  workspaceId: string;
  contentHashBefore: string;
  lineRange?: {
    startLine: number;
    endLine: number;
  };
  permissionScope: string;
  pathSafetyStatus: PatchPathSafetyStatus;
  notesPolicy: PatchNotesPolicy;
};

export type PatchRiskLevel = "low" | "medium" | "high" | "blocked";
export type PatchPermissionKind = "write" | "patch-apply" | "delete" | "rollback" | "destructive";

export type PatchRiskClassification = {
  riskLevel: PatchRiskLevel;
  riskReasons: string[];
  permissionKinds: PatchPermissionKind[];
  requiresHumanApproval: boolean;
  requiresFreshRead: boolean;
  requiresDryRun: boolean;
  requiresRollbackPlan: boolean;
};

export type PatchPermissionDecisionStatus =
  | "prompt-required"
  | "denied"
  | "blocked-by-configuration"
  | "unavailable"
  | "reserved";

export type PatchPermissionRequest = {
  permissionRequestId: string;
  proposalId: string;
  permissionKind: PatchPermissionKind;
  decisionStatus: PatchPermissionDecisionStatus;
  riskLevel: PatchRiskLevel;
  reason: string;
  requestedByEventId: string;
  targetRefs: string[];
  approvalSurface: string;
  expiresAt?: string;
  createdAt: string;
};

export type PatchValidationStatus = "not-run" | "passed" | "failed" | "blocked" | "unavailable";
export type PatchRedactionStatus = "not-needed" | "redacted" | "blocked" | "unavailable";

export type PatchValidationCheck = {
  checkId: string;
  status: PatchValidationStatus;
  safeSummary: string;
};

export type PatchValidationResult = {
  validationId: string;
  proposalId: string;
  status: PatchValidationStatus;
  checks: PatchValidationCheck[];
  safeErrors: string[];
  warnings: string[];
  redactionStatus: PatchRedactionStatus;
  createdAt: string;
};

export type PatchDryRunStatus = "not-run" | "passed" | "failed" | "blocked" | "unavailable";

export type PatchDryRunResult = {
  dryRunId: string;
  proposalId: string;
  status: PatchDryRunStatus;
  targetCompatibility: string;
  wouldChangeFiles: number;
  wouldCreateFiles: number;
  wouldDeleteFiles: number;
  conflicts: string[];
  staleTargets: string[];
  blockedTargets: string[];
  createdAt: string;
};

export type PatchRollbackKind =
  | "inverse-patch-preview"
  | "content-hash-restore-plan"
  | "manual-recovery"
  | "unavailable";

export type PatchRollbackPlanMetadata = {
  rollbackPlanId: string;
  proposalId: string;
  rollbackKind: PatchRollbackKind;
  requiredBeforeApply: boolean;
  preApplyContentHashes: Array<{
    targetRefId: string;
    contentHashBefore: string;
  }>;
  affectedTargetRefs: string[];
  inversePatchPreviewRef?: string;
  manualRecoveryNotes: string[];
  unavailableReasons: string[];
  createdAt: string;
};

export type PatchRedactionResult = {
  redactionStatus: PatchRedactionStatus;
  redactedClasses: string[];
  safeSummary: string;
};

export type PatchProposalEnvelope = {
  proposalId: string;
  sessionId: string;
  turnId: string;
  stepId: string;
  sourceKind: PatchProposalSourceKind;
  sourceEventIds: string[];
  workspaceRefs: string[];
  evidenceRefs: string[];
  targetRefs: PatchTargetRef[];
  patchFormat: PatchFormat;
  proposalSummary: string;
  authoringMode: PatchAuthoringMode;
  riskClassification: PatchRiskClassification;
  permissionRequest: PatchPermissionRequest;
  validationResult: PatchValidationResult;
  dryRunResult: PatchDryRunResult;
  rollbackPlan: PatchRollbackPlanMetadata;
  redactionResult: PatchRedactionResult;
  createdAt: string;
  schemaVersion: P13PatchWorkflowSchemaVersion;
  outputState: P13PatchWorkflowOutputState;
  capabilityStatus: PatchWorkflowCapabilityStatus;
};

export type CreatePatchProposalEnvelopeInput = Omit<
  PatchProposalEnvelope,
  "schemaVersion" | "outputState"
> & {
  schemaVersion?: P13PatchWorkflowSchemaVersion;
};

export type PatchDiffPreviewFormat = "unified-diff-preview" | "structured-edit-preview" | "whole-file-preview";

export type PatchDiffPreviewHunk = {
  targetRefId: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  safePreviewLines: string[];
};

export type PatchDiffPreview = {
  diffPreviewId: string;
  proposalId: string;
  targetRefs: string[];
  format: PatchDiffPreviewFormat;
  filesChanged: number;
  insertions: number;
  deletions: number;
  safeHunks: PatchDiffPreviewHunk[];
  truncated: boolean;
  redactionStatus: PatchRedactionStatus;
  renderWarnings: string[];
  createdAt: string;
};

export type PatchApprovalDecisionStatus =
  | "pending"
  | "approved-for-future-apply"
  | "denied"
  | "blocked"
  | "expired"
  | "unavailable";

export type PatchApprovalDecisionReadModel = {
  approvalDecisionId: string;
  permissionRequestId: string;
  proposalId: string;
  status: PatchApprovalDecisionStatus;
  decidedBy: string;
  safeReason: string;
  visibleConsequences: string[];
  blockedCapabilities: string[];
  eventIds: string[];
  createdAt: string;
};

export type SuccessfulP13PatchWorkflowEventType =
  | "patch.proposal.created"
  | "patch.proposal.normalized"
  | "patch.proposal.validation.started"
  | "patch.proposal.validation.completed"
  | "patch.diff.preview.created"
  | "patch.risk.classified"
  | "patch.permission.requested"
  | "patch.permission.resolved"
  | "patch.approval.read_model.created"
  | "patch.dry_run.started"
  | "patch.dry_run.completed"
  | "patch.rollback_plan.created"
  | "patch.proposal.blocked"
  | "patch.proposal.failed"
  | "patch.proposal.discarded";

export type ReservedP13PatchWorkflowEventType =
  | "patch.applied"
  | "file.write.completed"
  | "file.delete.completed"
  | "rollback.executed"
  | "command.executed";

export type PatchWorkflowEventType = SuccessfulP13PatchWorkflowEventType | ReservedP13PatchWorkflowEventType;

export const P13_SUCCESSFUL_PATCH_WORKFLOW_EVENT_TYPES: SuccessfulP13PatchWorkflowEventType[] = [
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
];

export const P13_RESERVED_PATCH_WORKFLOW_EVENT_TYPES: ReservedP13PatchWorkflowEventType[] = [
  "patch.applied",
  "file.write.completed",
  "file.delete.completed",
  "rollback.executed",
  "command.executed",
];

export function createPatchProposalEnvelope(input: CreatePatchProposalEnvelopeInput): PatchProposalEnvelope {
  return {
    ...input,
    schemaVersion: input.schemaVersion ?? P13_PATCH_WORKFLOW_SCHEMA_VERSION,
    outputState: P13_PATCH_WORKFLOW_OUTPUT_STATE,
  };
}

export function isSuccessfulP13PatchWorkflowEventType(
  eventType: string,
): eventType is SuccessfulP13PatchWorkflowEventType {
  return P13_SUCCESSFUL_PATCH_WORKFLOW_EVENT_TYPES.includes(eventType as SuccessfulP13PatchWorkflowEventType);
}

export function isReservedP13PatchWorkflowEventType(
  eventType: string,
): eventType is ReservedP13PatchWorkflowEventType {
  return P13_RESERVED_PATCH_WORKFLOW_EVENT_TYPES.includes(eventType as ReservedP13PatchWorkflowEventType);
}
