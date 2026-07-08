import type {
  PatchApprovalDecisionReadModel,
  PatchApprovalDecisionStatus,
  PatchPermissionKind,
  PatchPermissionRequest,
  PatchRiskClassification,
  PatchRiskLevel,
  PatchTargetRef,
} from "./patchWorkflowTypes";

export type PatchRiskOperationIntent =
  | "read-only-preview"
  | "generated-artifact-preview"
  | "fixture-only-change"
  | "single-file-patch"
  | "multi-file-patch"
  | "stale-target"
  | "delete"
  | "rollback-execution"
  | "command-execution"
  | "direct-filesystem-mutation"
  | "cookie-backed-content"
  | "raw-secret-exposure";

export type PatchRiskPatchFormat = "unified-diff" | "structured-edit" | "whole-file-preview" | "unsupported";

export type PatchRiskDiffStats = {
  filesChanged: number;
  insertions: number;
  deletions: number;
};

export type ClassifyPatchRiskInput = {
  proposalId: string;
  targetRefs: PatchTargetRef[];
  permissionKinds: PatchPermissionKind[];
  operationIntents: PatchRiskOperationIntent[];
  patchFormat: PatchRiskPatchFormat;
  diffStats: PatchRiskDiffStats;
  contentHashSnapshot?: Record<string, string>;
};

export type CreatePatchPermissionRequestsInput = {
  proposalId: string;
  requestedByEventId: string;
  targetRefs: PatchTargetRef[];
  riskClassification: PatchRiskClassification;
  createdAt: string;
  expiresAt?: string;
};

export type CreatePatchApprovalDecisionReadModelInput = {
  approvalDecisionId: string;
  permissionRequestId: string;
  proposalId: string;
  status: PatchApprovalDecisionStatus;
  decidedBy: string;
  safeReason: string;
  visibleConsequences: string[];
  eventIds: string[];
  createdAt: string;
};

const BLOCKED_OPERATION_INTENTS = new Set<PatchRiskOperationIntent>([
  "delete",
  "rollback-execution",
  "command-execution",
  "direct-filesystem-mutation",
  "cookie-backed-content",
  "raw-secret-exposure",
]);

const FUTURE_MUTATION_CAPABILITIES = [
  "real-patch-apply",
  "write-mutation",
  "delete-mutation",
  "rollback-execution",
  "destructive-execution",
] as const;

export function classifyPatchRisk(input: ClassifyPatchRiskInput): PatchRiskClassification {
  const riskReasons = collectRiskReasons(input);
  const riskLevel = riskLevelForReasons(input, riskReasons);

  return {
    riskLevel,
    riskReasons,
    permissionKinds: dedupePermissionKinds(input.permissionKinds),
    requiresHumanApproval: riskLevel !== "low" || input.permissionKinds.length > 0,
    requiresFreshRead: riskLevel === "high" || riskLevel === "blocked" || riskReasons.some(isFreshReadReason),
    requiresDryRun: input.permissionKinds.length > 0 || riskLevel === "medium" || riskLevel === "high",
    requiresRollbackPlan: input.permissionKinds.length > 0 || riskLevel === "high" || riskLevel === "blocked",
  };
}

export function createPatchPermissionRequests(
  input: CreatePatchPermissionRequestsInput,
): PatchPermissionRequest[] {
  return input.riskClassification.permissionKinds.map((permissionKind) => {
    const isBlocked = input.riskClassification.riskLevel === "blocked";

    return {
      permissionRequestId: `${input.proposalId}:permission:${permissionKind}`,
      proposalId: input.proposalId,
      permissionKind,
      decisionStatus: isBlocked ? "blocked-by-configuration" : "prompt-required",
      riskLevel: input.riskClassification.riskLevel,
      reason: permissionReason(permissionKind, input.riskClassification.riskLevel),
      requestedByEventId: input.requestedByEventId,
      targetRefs: input.targetRefs.map((targetRef) => targetRef.targetRefId),
      approvalSurface: "workbench-read-only",
      expiresAt: input.expiresAt,
      createdAt: input.createdAt,
    };
  });
}

export function createPatchApprovalDecisionReadModel(
  input: CreatePatchApprovalDecisionReadModelInput,
): PatchApprovalDecisionReadModel {
  return {
    approvalDecisionId: input.approvalDecisionId,
    permissionRequestId: input.permissionRequestId,
    proposalId: input.proposalId,
    status: input.status,
    decidedBy: input.decidedBy,
    safeReason: input.safeReason,
    visibleConsequences: [...input.visibleConsequences],
    blockedCapabilities: [...FUTURE_MUTATION_CAPABILITIES],
    eventIds: [...input.eventIds],
    createdAt: input.createdAt,
  };
}

function collectRiskReasons(input: ClassifyPatchRiskInput): string[] {
  const reasons = new Set<string>();

  if (input.patchFormat === "unsupported") {
    reasons.add("blocked_patch_format:unsupported");
  }

  if (input.targetRefs.length === 0) {
    reasons.add("high_missing_target_refs");
  }

  if (input.targetRefs.length > 1 || input.diffStats.filesChanged > 1) {
    reasons.add("high_multi_file_patch");
  }

  for (const operationIntent of input.operationIntents) {
    if (operationIntent === "multi-file-patch") {
      reasons.add("high_multi_file_patch");
    }

    if (operationIntent === "stale-target") {
      reasons.add("high_stale_target");
    }

    if (BLOCKED_OPERATION_INTENTS.has(operationIntent)) {
      reasons.add(`blocked_operation:${operationIntent}`);
    }
  }

  for (const targetRef of input.targetRefs) {
    collectTargetRefRiskReasons(input, targetRef, reasons);
  }

  if (reasons.size === 0 && isLowRiskPreview(input)) {
    reasons.add("low_preview_only_fixture_or_generated_artifact");
  }

  if (reasons.size === 0) {
    reasons.add("medium_single_safe_target_patch");
  }

  return [...reasons];
}

function collectTargetRefRiskReasons(
  input: ClassifyPatchRiskInput,
  targetRef: PatchTargetRef,
  reasons: Set<string>,
): void {
  if (targetRef.contentHashBefore.length === 0) {
    reasons.add(`high_missing_content_hash_before:${targetRef.targetRefId}`);
  }

  const expectedHash = input.contentHashSnapshot?.[targetRef.targetRefId];
  if (expectedHash !== undefined && expectedHash !== targetRef.contentHashBefore) {
    reasons.add(`high_stale_content_hash_before:${targetRef.targetRefId}`);
  }

  if (targetRef.pathSafetyStatus === "blocked" || targetRef.pathSafetyStatus === "unsupported") {
    reasons.add(`blocked_path_safety:${targetRef.targetRefId}`);
  } else if (targetRef.pathSafetyStatus === "requires-review" || targetRef.pathSafetyStatus === "unknown") {
    reasons.add(`high_path_requires_review:${targetRef.targetRefId}`);
  }

  if (targetRef.targetKind === "unsupported") {
    reasons.add(`blocked_target_kind:${targetRef.targetRefId}`);
  }

  if (targetRef.targetKind === "note-ref") {
    reasons.add(`high_note_target:${targetRef.targetRefId}`);
  }

  if (targetRef.targetKind === "generated-artifact" && !input.operationIntents.includes("generated-artifact-preview")) {
    reasons.add(`high_generated_artifact_rewrite:${targetRef.targetRefId}`);
  }

  if (isNotesMutationTarget(targetRef)) {
    reasons.add(`blocked_notes_mutation_requires_future_approval:${targetRef.targetRefId}`);
  }
}

function riskLevelForReasons(input: ClassifyPatchRiskInput, reasons: string[]): PatchRiskLevel {
  if (reasons.some((reason) => reason.startsWith("blocked_") || reason.startsWith("blocked:"))) {
    return "blocked";
  }

  if (reasons.some((reason) => reason.startsWith("high_"))) {
    return "high";
  }

  if (isLowRiskPreview(input)) {
    return "low";
  }

  return "medium";
}

function isLowRiskPreview(input: ClassifyPatchRiskInput): boolean {
  const lowIntent = input.operationIntents.every((operationIntent) =>
    ["read-only-preview", "generated-artifact-preview", "fixture-only-change"].includes(operationIntent),
  );
  const lowTargets = input.targetRefs.every(
    (targetRef) => targetRef.targetKind === "scratch-fixture" || targetRef.targetKind === "generated-artifact",
  );

  return lowIntent && lowTargets && input.diffStats.filesChanged <= 1 && input.permissionKinds.length === 0;
}

function isNotesMutationTarget(targetRef: PatchTargetRef): boolean {
  const normalizedDisplayPath = targetRef.displayPath.split("\\").join("/").toLowerCase();

  return (
    (targetRef.targetKind === "note-ref" || normalizedDisplayPath.startsWith("notes/")) &&
    targetRef.notesPolicy !== "explicitly-approved-future-phase" &&
    targetRef.notesPolicy !== "fixture-only"
  );
}

function isFreshReadReason(reason: string): boolean {
  return reason.includes("stale") || reason.includes("missing_content_hash") || reason.includes("requires_review");
}

function dedupePermissionKinds(permissionKinds: PatchPermissionKind[]): PatchPermissionKind[] {
  return [...new Set(permissionKinds)];
}

function permissionReason(permissionKind: PatchPermissionKind, riskLevel: PatchRiskLevel): string {
  if (riskLevel === "blocked") {
    return `P13 preview blocks ${permissionKind}; no mutation or execution is available.`;
  }

  return `P13 preview records a ${permissionKind} permission request for future approval only.`;
}
