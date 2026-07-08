import {
  createPatchProposalEnvelope,
  P13_PATCH_WORKFLOW_SCHEMA_VERSION,
  type PatchAuthoringMode,
  type PatchDryRunResult,
  type PatchFormat,
  type PatchPermissionKind,
  type PatchPermissionRequest,
  type PatchProposalEnvelope,
  type PatchProposalSourceKind,
  type PatchRedactionResult,
  type PatchRiskClassification,
  type PatchTargetRef,
  type PatchValidationCheck,
  type PatchValidationResult,
  type PatchValidationStatus,
} from "./patchWorkflowTypes";

export type PatchProposalOperation =
  | "patch-preview"
  | "write-preview"
  | "delete"
  | "rollback-execution"
  | "command-execution"
  | "direct-filesystem-mutation";

export type NormalizePatchProposalInput = {
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
  proposedOperation: PatchProposalOperation;
  proposalSummary: string;
  contentHashSnapshot?: Record<string, string>;
  rawProviderPayload?: unknown;
  rawToolOutput?: unknown;
  createdAt: string;
};

const SUMMARY_LIMIT = 160;

const BLOCKED_OPERATIONS = new Set<PatchProposalOperation>([
  "delete",
  "rollback-execution",
  "command-execution",
  "direct-filesystem-mutation",
]);

export function normalizePatchProposal(input: NormalizePatchProposalInput): PatchProposalEnvelope {
  const safeSummary = redactAndBoundSummary(input.proposalSummary);
  const redactedClasses = collectRedactedClasses(input);
  const proposalId = input.proposalId;
  const validationResult = validatePatchProposalInput(input, proposalId);
  const isBlocked = validationResult.status === "blocked";

  return createPatchProposalEnvelope({
    proposalId,
    sessionId: input.sessionId,
    turnId: input.turnId,
    stepId: input.stepId,
    sourceKind: input.sourceKind,
    sourceEventIds: [...input.sourceEventIds],
    workspaceRefs: [...input.workspaceRefs],
    evidenceRefs: [...input.evidenceRefs],
    targetRefs: input.targetRefs.map(copyTargetRef),
    patchFormat: input.patchFormat,
    proposalSummary: safeSummary,
    authoringMode: authoringModeForSource(input.sourceKind),
    riskClassification: createRiskClassification(input, validationResult),
    permissionRequest: createPermissionRequest(input, validationResult),
    validationResult,
    dryRunResult: createDryRunResult(input, validationResult),
    rollbackPlan: {
      rollbackPlanId: `${proposalId}:rollback-plan`,
      proposalId,
      rollbackKind: "content-hash-restore-plan",
      requiredBeforeApply: true,
      preApplyContentHashes: input.targetRefs
        .filter((targetRef) => targetRef.contentHashBefore.length > 0)
        .map((targetRef) => ({
          targetRefId: targetRef.targetRefId,
          contentHashBefore: targetRef.contentHashBefore,
        })),
      affectedTargetRefs: input.targetRefs.map((targetRef) => targetRef.targetRefId),
      manualRecoveryNotes: ["Metadata only; rollback execution remains unavailable in P13."],
      unavailableReasons: isBlocked ? ["proposal_validation_blocked"] : [],
      createdAt: input.createdAt,
    },
    redactionResult: {
      redactionStatus: redactedClasses.length > 0 ? "redacted" : "not-needed",
      redactedClasses,
      safeSummary,
    } satisfies PatchRedactionResult,
    capabilityStatus: isBlocked ? "blocked" : "preview",
    createdAt: input.createdAt,
    schemaVersion: P13_PATCH_WORKFLOW_SCHEMA_VERSION,
  });
}

export function validatePatchProposalEnvelope(envelope: PatchProposalEnvelope): PatchValidationResult {
  const checks: PatchValidationCheck[] = [];
  const safeErrors: string[] = [];

  if (envelope.targetRefs.length === 0) {
    safeErrors.push("missing_target_refs");
  }

  if (envelope.patchFormat === "unsupported") {
    safeErrors.push("unsupported_patch_format");
  }

  for (const targetRef of envelope.targetRefs) {
    collectTargetRefErrors(targetRef, undefined, safeErrors);
  }

  checks.push(createValidationCheck("check:p13:envelope-targets", safeErrors.length === 0 ? "passed" : "blocked"));

  return {
    validationId: `${envelope.proposalId}:validation`,
    proposalId: envelope.proposalId,
    status: safeErrors.length > 0 ? "blocked" : "passed",
    checks,
    safeErrors,
    warnings: [],
    redactionStatus: envelope.redactionResult.redactionStatus,
    createdAt: envelope.createdAt,
  };
}

function validatePatchProposalInput(
  input: NormalizePatchProposalInput,
  proposalId: string,
): PatchValidationResult {
  const safeErrors: string[] = [];
  const warnings: string[] = [];

  if (input.targetRefs.length === 0) {
    safeErrors.push("missing_target_refs");
  }

  if (input.patchFormat === "unsupported") {
    safeErrors.push("unsupported_patch_format");
  }

  if (BLOCKED_OPERATIONS.has(input.proposedOperation)) {
    safeErrors.push(`blocked_operation:${input.proposedOperation}`);
  }

  for (const targetRef of input.targetRefs) {
    collectTargetRefErrors(targetRef, input.contentHashSnapshot?.[targetRef.targetRefId], safeErrors);
  }

  const status: PatchValidationStatus = safeErrors.length > 0 ? "blocked" : "passed";

  return {
    validationId: `${proposalId}:validation`,
    proposalId,
    status,
    checks: [
      createValidationCheck("check:p13:target-refs", status),
      createValidationCheck("check:p13:operation-boundary", status),
    ],
    safeErrors,
    warnings,
    redactionStatus: collectRedactedClasses(input).length > 0 ? "redacted" : "not-needed",
    createdAt: input.createdAt,
  };
}

function collectTargetRefErrors(
  targetRef: PatchTargetRef,
  expectedHash: string | undefined,
  safeErrors: string[],
): void {
  if (targetRef.contentHashBefore.length === 0) {
    safeErrors.push(`missing_content_hash_before:${targetRef.targetRefId}`);
  }

  if (expectedHash !== undefined && expectedHash !== targetRef.contentHashBefore) {
    safeErrors.push(`stale_content_hash_before:${targetRef.targetRefId}`);
  }

  if (targetRef.pathSafetyStatus === "blocked" || targetRef.pathSafetyStatus === "unsupported") {
    safeErrors.push(`blocked_path_safety:${targetRef.targetRefId}`);
  }

  if (targetRef.targetKind === "unsupported") {
    safeErrors.push(`unsupported_target_kind:${targetRef.targetRefId}`);
  }

  if (isNotesMutationTarget(targetRef)) {
    safeErrors.push(`notes_mutation_requires_explicit_future_approval:${targetRef.targetRefId}`);
  }
}

function isNotesMutationTarget(targetRef: PatchTargetRef): boolean {
  const normalizedDisplayPath = targetRef.displayPath.split("\\").join("/").toLowerCase();

  return (
    (targetRef.targetKind === "note-ref" || normalizedDisplayPath.startsWith("notes/")) &&
    targetRef.notesPolicy !== "explicitly-approved-future-phase" &&
    targetRef.notesPolicy !== "fixture-only"
  );
}

function createRiskClassification(
  input: NormalizePatchProposalInput,
  validationResult: PatchValidationResult,
): PatchRiskClassification {
  const isBlocked = validationResult.status === "blocked";

  return {
    riskLevel: isBlocked ? "blocked" : input.targetRefs.length > 1 ? "high" : "medium",
    riskReasons: isBlocked ? [...validationResult.safeErrors] : ["preview_validation_passed"],
    permissionKinds: [permissionKindForOperation(input.proposedOperation)],
    requiresHumanApproval: true,
    requiresFreshRead: true,
    requiresDryRun: true,
    requiresRollbackPlan: true,
  };
}

function createPermissionRequest(
  input: NormalizePatchProposalInput,
  validationResult: PatchValidationResult,
): PatchPermissionRequest {
  const isBlocked = validationResult.status === "blocked";

  return {
    permissionRequestId: `${input.proposalId}:permission`,
    proposalId: input.proposalId,
    permissionKind: permissionKindForOperation(input.proposedOperation),
    decisionStatus: isBlocked ? "blocked-by-configuration" : "prompt-required",
    riskLevel: isBlocked ? "blocked" : input.targetRefs.length > 1 ? "high" : "medium",
    reason: isBlocked
      ? "P13 preview blocks this proposal before any future apply-capable phase."
      : "P13 preview requires explicit future approval before mutation.",
    requestedByEventId: input.sourceEventIds[0] ?? "event:p13:unknown",
    targetRefs: input.targetRefs.map((targetRef) => targetRef.targetRefId),
    approvalSurface: "workbench-read-only",
    createdAt: input.createdAt,
  };
}

function createDryRunResult(
  input: NormalizePatchProposalInput,
  validationResult: PatchValidationResult,
): PatchDryRunResult {
  const blockedTargets = validationResult.safeErrors
    .filter((safeError) => safeError.includes(":"))
    .map((safeError) => {
      const parts = safeError.split(":");
      return parts[parts.length - 1] ?? "";
    })
    .filter((targetRefId) => targetRefId.startsWith("target:"));

  return {
    dryRunId: `${input.proposalId}:dry-run`,
    proposalId: input.proposalId,
    status: validationResult.status === "blocked" ? "blocked" : "not-run",
    targetCompatibility: "pure-preview-projection",
    wouldChangeFiles: input.proposedOperation === "patch-preview" || input.proposedOperation === "write-preview" ? 1 : 0,
    wouldCreateFiles: 0,
    wouldDeleteFiles: input.proposedOperation === "delete" ? input.targetRefs.length : 0,
    conflicts: [],
    staleTargets: validationResult.safeErrors
      .filter((safeError) => safeError.startsWith("stale_content_hash_before:"))
      .map((safeError) => safeError.replace("stale_content_hash_before:", "")),
    blockedTargets: [...new Set(blockedTargets)],
    createdAt: input.createdAt,
  };
}

function permissionKindForOperation(operation: PatchProposalOperation): PatchPermissionKind {
  if (operation === "delete") {
    return "delete";
  }

  if (operation === "rollback-execution") {
    return "rollback";
  }

  if (operation === "command-execution" || operation === "direct-filesystem-mutation") {
    return "destructive";
  }

  if (operation === "write-preview") {
    return "write";
  }

  return "patch-apply";
}

function authoringModeForSource(sourceKind: PatchProposalSourceKind): PatchAuthoringMode {
  if (sourceKind === "tool-observation") {
    return "tool-derived";
  }

  if (sourceKind === "user-draft" || sourceKind === "manual-import") {
    return "user-drafted";
  }

  if (sourceKind === "fixture") {
    return "fixture";
  }

  return "agent-drafted";
}

function copyTargetRef(targetRef: PatchTargetRef): PatchTargetRef {
  return {
    ...targetRef,
    lineRange: targetRef.lineRange === undefined ? undefined : { ...targetRef.lineRange },
  };
}

function createValidationCheck(checkId: string, status: PatchValidationStatus): PatchValidationCheck {
  return {
    checkId,
    status,
    safeSummary: status === "passed" ? "P13 preview validation passed." : "P13 preview validation blocked.",
  };
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

function collectRedactedClasses(input: NormalizePatchProposalInput): string[] {
  const redactedClasses = new Set<string>();
  const summary = input.proposalSummary;

  if (/authorization\s*:/i.test(summary)) {
    redactedClasses.add("authorization");
  }

  if (/cookie\s*:/i.test(summary)) {
    redactedClasses.add("browser-cookie");
  }

  if (/sk-[a-z0-9_-]+/i.test(summary)) {
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
