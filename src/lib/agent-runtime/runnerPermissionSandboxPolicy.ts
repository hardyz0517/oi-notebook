import type {
  RunnerAccessPolicy,
  RunnerApprovalDecisionReadModel,
  RunnerApprovalDecisionStatus,
  RunnerPermissionDecisionStatus,
  RunnerPermissionKind,
  RunnerPermissionRequest,
  RunnerResourceLimits,
  RunnerRiskLevel,
  RunnerSandboxPlan,
  RunnerSandboxProfile,
  RunnerTargetRef,
} from "./runnerContractTypes";

export const P14_PERMISSION_KINDS: RunnerPermissionKind[] = [
  "execute",
  "public-network",
  "write",
  "patch-apply",
  "delete",
  "rollback",
  "destructive",
];

export const P14_PERMISSION_DECISION_STATUSES: RunnerPermissionDecisionStatus[] = [
  "prompt-required",
  "denied",
  "blocked-by-configuration",
  "unavailable",
  "reserved",
];

export const P14_APPROVAL_DECISION_STATUSES: RunnerApprovalDecisionStatus[] = [
  "pending",
  "approved-for-future-execute",
  "denied",
  "blocked",
  "expired",
  "unavailable",
];

export const P14_SANDBOX_PROFILES: RunnerSandboxProfile[] = [
  "preview-no-op",
  "mock-runner",
  "read-only-classification",
  "fixture-simulation",
  "reserved-future-sandbox",
  "blocked",
];

export type BuildRunnerPermissionSandboxInput = {
  executionRequestId: string;
  permissionKind: RunnerPermissionKind;
  riskLevel: RunnerRiskLevel;
  targetRefs: RunnerTargetRef[];
  requestedByEventId: string;
  workingDirectoryRef: string;
  createdAt: string;
  sandboxProfile?: RunnerSandboxProfile;
  decisionStatus?: RunnerPermissionDecisionStatus;
  approvalStatus?: RunnerApprovalDecisionStatus;
  requestedNetwork?: boolean;
  requestedSecrets?: boolean;
  requestedCookie?: boolean;
  requestedWrite?: boolean;
  requestedPatchApply?: boolean;
  requestedDelete?: boolean;
  requestedRollback?: boolean;
  timeoutMs?: number;
  maxOutputBytes?: number;
  maxInputBytes?: number;
  fixtureSimulationPlannedRefCount?: number;
};

export type RunnerPermissionSandboxReadModel = {
  permissionRequest: RunnerPermissionRequest;
  approvalDecision: RunnerApprovalDecisionReadModel;
  sandboxPlan: RunnerSandboxPlan;
  resourceLimits: RunnerResourceLimits;
  deniedCapabilities: string[];
};

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_OUTPUT_BYTES = 4096;
const DEFAULT_MAX_INPUT_BYTES = 2048;

export function buildRunnerPermissionSandboxReadModel(
  input: BuildRunnerPermissionSandboxInput,
): RunnerPermissionSandboxReadModel {
  const sandboxPlan = buildRunnerSandboxPlan(input);
  const permissionRequest = buildRunnerPermissionRequest(input, sandboxPlan.sandboxPlanId);
  const approvalDecision = buildRunnerApprovalDecisionReadModel(input, permissionRequest);

  return {
    permissionRequest,
    approvalDecision,
    sandboxPlan,
    resourceLimits: buildRunnerResourceLimits(input, sandboxPlan),
    deniedCapabilities: deniedCapabilitiesFor(input),
  };
}

export function buildRunnerPermissionRequest(
  input: BuildRunnerPermissionSandboxInput,
  sandboxPlanId = `${input.executionRequestId}:sandbox`,
): RunnerPermissionRequest {
  const blockedReasons = blockedReasonsFor(input);
  const decisionStatus = input.decisionStatus ?? (blockedReasons.length > 0 ? "blocked-by-configuration" : "prompt-required");

  return {
    permissionRequestId: `${input.executionRequestId}:permission:${input.permissionKind}`,
    executionRequestId: input.executionRequestId,
    permissionKind: input.permissionKind,
    decisionStatus,
    riskLevel: decisionStatus === "blocked-by-configuration" ? "blocked" : input.riskLevel,
    reason: reasonFor(input, decisionStatus, blockedReasons),
    requestedByEventId: input.requestedByEventId,
    targetRefs: input.targetRefs.map((targetRef) => targetRef.targetRefId),
    sandboxPlanId,
    approvalSurface: "workbench-read-only",
    createdAt: input.createdAt,
  };
}

export function buildRunnerApprovalDecisionReadModel(
  input: BuildRunnerPermissionSandboxInput,
  permissionRequest: RunnerPermissionRequest,
): RunnerApprovalDecisionReadModel {
  const blockedReasons = blockedReasonsFor(input);
  const status = input.approvalStatus ?? approvalStatusFor(permissionRequest.decisionStatus, blockedReasons);

  return {
    approvalDecisionId: `${input.executionRequestId}:approval:${permissionRequest.permissionKind}`,
    permissionRequestId: permissionRequest.permissionRequestId,
    executionRequestId: input.executionRequestId,
    status,
    decidedBy: "p14-permission-sandbox-policy",
    safeReason: safeApprovalReasonFor(status),
    visibleConsequences: ["No process is started and no workspace mutation is performed in P14."],
    blockedCapabilities: deniedCapabilitiesFor(input),
    eventIds: [`${input.executionRequestId}:permission:${status}`],
    createdAt: input.createdAt,
  };
}

export function buildRunnerSandboxPlan(input: BuildRunnerPermissionSandboxInput): RunnerSandboxPlan {
  const blockedReasons = blockedReasonsFor(input);
  const profile = input.sandboxProfile ?? (blockedReasons.length > 0 ? "blocked" : "read-only-classification");
  const networkAccess = accessFor(input.requestedNetwork, profile === "reserved-future-sandbox");
  const secretAccess = accessFor(input.requestedSecrets, false);
  const credentialAccess = accessFor(input.requestedCookie || input.requestedSecrets, false);
  const writeAccess = accessFor(
    input.requestedWrite || input.requestedPatchApply || input.requestedDelete || input.requestedRollback,
    false,
  );

  return {
    sandboxPlanId: `${input.executionRequestId}:sandbox`,
    profile,
    workingDirectoryRef: input.workingDirectoryRef,
    allowedTargetRefs: input.targetRefs.map((targetRef) => targetRef.targetRefId),
    networkAccess,
    secretAccess,
    credentialAccess,
    writeAccess,
    maxFilesTouched: maxFilesTouchedFor(input, profile),
    timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxOutputBytes: input.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
    maxInputBytes: input.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES,
    environmentPolicy: "p14-metadata-only-no-runtime",
    cleanupPolicy: "p14-no-op-cleanup-preview",
    blockedReasons,
    createdAt: input.createdAt,
  };
}

function buildRunnerResourceLimits(
  input: BuildRunnerPermissionSandboxInput,
  sandboxPlan: RunnerSandboxPlan,
): RunnerResourceLimits {
  return {
    timeoutMs: sandboxPlan.timeoutMs,
    maxOutputBytes: sandboxPlan.maxOutputBytes,
    maxInputBytes: sandboxPlan.maxInputBytes,
    maxFilesTouched: sandboxPlan.maxFilesTouched,
    networkAccess: sandboxPlan.networkAccess,
    secretAccess: sandboxPlan.secretAccess === "blocked" || sandboxPlan.credentialAccess === "blocked" ? "blocked" : "none",
    writeAccess: sandboxPlan.writeAccess,
    trueExecution: blockedReasonsFor(input).length > 0 ? "blocked" : "unavailable",
  };
}

function approvalStatusFor(
  decisionStatus: RunnerPermissionDecisionStatus,
  blockedReasons: string[],
): RunnerApprovalDecisionStatus {
  if (blockedReasons.length > 0 || decisionStatus === "blocked-by-configuration") {
    return "blocked";
  }

  if (decisionStatus === "denied") {
    return "denied";
  }

  if (decisionStatus === "prompt-required") {
    return "pending";
  }

  return "unavailable";
}

function accessFor(requested: boolean | undefined, reserved: boolean): RunnerAccessPolicy {
  if (requested) {
    return "blocked";
  }

  return reserved ? "reserved-future-phase" : "none";
}

function maxFilesTouchedFor(input: BuildRunnerPermissionSandboxInput, profile: RunnerSandboxProfile): number {
  if (profile !== "fixture-simulation") {
    return 0;
  }

  return Math.max(0, input.fixtureSimulationPlannedRefCount ?? 0);
}

function reasonFor(
  input: BuildRunnerPermissionSandboxInput,
  decisionStatus: RunnerPermissionDecisionStatus,
  blockedReasons: string[],
): string {
  if (blockedReasons.length > 0) {
    return `P14 blocks ${input.permissionKind} as read-model metadata only: ${blockedReasons.join(", ")}.`;
  }

  if (decisionStatus === "prompt-required") {
    return `P14 requires explicit future-phase approval for ${input.permissionKind}; no capability is granted now.`;
  }

  return `P14 marks ${input.permissionKind} as ${decisionStatus}; no capability is granted now.`;
}

function safeApprovalReasonFor(status: RunnerApprovalDecisionStatus): string {
  if (status === "approved-for-future-execute") {
    return "P14 records future approval metadata only; it does not start a process.";
  }

  return `P14 approval read model status is ${status}; it does not start a process.`;
}

function deniedCapabilitiesFor(input: BuildRunnerPermissionSandboxInput): string[] {
  return [
    input.permissionKind,
    "true-execution",
    "workspace-mutation",
    "network",
    "browser-credential",
    "secret",
    "write",
    "patch-apply",
    "delete",
    "rollback",
  ];
}

function blockedReasonsFor(input: BuildRunnerPermissionSandboxInput): string[] {
  const reasons: string[] = [];

  if (input.requestedNetwork) {
    reasons.push("network_access_blocked_in_p14");
  }

  if (input.requestedCookie) {
    reasons.push("cookie_access_blocked_in_p14");
  }

  if (input.requestedSecrets) {
    reasons.push("secret_access_blocked_in_p14");
  }

  if (input.requestedWrite) {
    reasons.push("write_access_blocked_in_p14");
  }

  if (input.requestedPatchApply) {
    reasons.push("patch_apply_blocked_in_p14");
  }

  if (input.requestedDelete) {
    reasons.push("delete_blocked_in_p14");
  }

  if (input.requestedRollback) {
    reasons.push("rollback_blocked_in_p14");
  }

  return reasons;
}
