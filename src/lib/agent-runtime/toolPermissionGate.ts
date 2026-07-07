import { MODEL_LOOP_OUTPUT_STATE } from "./modelLoopTypes";
import type { ModelLoopOutputState } from "./modelLoopTypes";
import type { ToolContinuationPermissionKind } from "./toolContinuationRegistry";

export type ToolPermissionKind = ToolContinuationPermissionKind;

export type ToolPermissionDecisionStatus =
  | "auto-allowed"
  | "prompt-required"
  | "denied"
  | "blocked-by-configuration"
  | "unavailable"
  | "reserved"
  | "degraded-fallback";

export type ToolPermissionDecisionScope = "default" | "fixture" | "explicit-context";

export type ToolPermissionDecision = {
  permissionDecisionId: string;
  kind: ToolPermissionKind;
  status: ToolPermissionDecisionStatus;
  reason: string;
  scope: ToolPermissionDecisionScope;
  canExecuteInP11: boolean;
  requiresApprovalUi: boolean;
  outputState: ModelLoopOutputState;
};

export type DecideToolPermissionInput = {
  kind: ToolPermissionKind;
  source?: ToolPermissionDecisionScope;
};

export type PermissionDecisionEvent = {
  eventType: "permission.resolved";
  sequence: number;
  turnId: string;
  stepId: string;
  toolCallId: string;
  toolName: string;
  permissionDecisionId: string;
  decision: ToolPermissionDecision;
  execution: "not-executed";
  sideEffects: [];
  at: string;
  outputState: ModelLoopOutputState;
};

function createDecisionId(kind: ToolPermissionKind, status: ToolPermissionDecisionStatus): string {
  return `p11-permission:${kind}:${status}`;
}

function createDecision(
  kind: ToolPermissionKind,
  status: ToolPermissionDecisionStatus,
  reason: string,
  scope: ToolPermissionDecisionScope,
  canExecuteInP11: boolean,
  requiresApprovalUi = false,
): ToolPermissionDecision {
  return {
    permissionDecisionId: createDecisionId(kind, status),
    kind,
    status,
    reason,
    scope,
    canExecuteInP11,
    requiresApprovalUi,
    outputState: MODEL_LOOP_OUTPUT_STATE,
  };
}

export function decideToolPermission(input: DecideToolPermissionInput): ToolPermissionDecision {
  const scope = input.source ?? "default";

  switch (input.kind) {
    case "read":
      if (scope === "fixture" || scope === "explicit-context") {
        return createDecision(input.kind, "auto-allowed", "read_limited_to_fixture_or_explicit_context", scope, true);
      }

      return createDecision(input.kind, "prompt-required", "read_requires_explicit_context_boundary", scope, false, true);

    case "local-note-search":
      return createDecision(
        input.kind,
        "prompt-required",
        "local_note_search_preview_only_no_real_notes_read",
        scope,
        false,
        true,
      );

    case "public-network":
      return createDecision(input.kind, "prompt-required", "public_network_preview_only_no_real_network", scope, false, true);

    case "cookie-network":
      return createDecision(input.kind, "unavailable", "cookie_network_unavailable_no_cookie_backed_reader", scope, false);

    case "write":
      return createDecision(input.kind, "reserved", "write_reserved_no_file_mutation", scope, false);

    case "patch-apply":
      return createDecision(input.kind, "reserved", "patch_apply_reserved_no_patch_application", scope, false);

    case "execute":
      return createDecision(input.kind, "reserved", "execute_reserved_no_command_runner", scope, false);

    case "delete":
      return createDecision(input.kind, "denied", "delete_denied_for_p11_preview", scope, false);

    case "rollback":
      return createDecision(input.kind, "unavailable", "rollback_unavailable_without_transaction_boundary", scope, false);

    case "destructive":
      return createDecision(input.kind, "denied", "destructive_actions_denied_for_p11_preview", scope, false);
  }
}

export function createPermissionDecisionEvent(input: {
  sequence: number;
  turnId: string;
  stepId: string;
  toolCallId: string;
  toolName: string;
  decision: ToolPermissionDecision;
  at: string;
}): PermissionDecisionEvent {
  return {
    eventType: "permission.resolved",
    sequence: input.sequence,
    turnId: input.turnId,
    stepId: input.stepId,
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    permissionDecisionId: input.decision.permissionDecisionId,
    decision: input.decision,
    execution: "not-executed",
    sideEffects: [],
    at: input.at,
    outputState: MODEL_LOOP_OUTPUT_STATE,
  };
}
