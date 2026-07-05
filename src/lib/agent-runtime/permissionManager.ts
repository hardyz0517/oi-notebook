import type { AgentPermissionDecision, AgentToolPermission } from "./agentTypes";

export type PermissionManager = {
  decideToolPermission(toolName: string, permission: AgentToolPermission): AgentPermissionDecision;
  canAutoRunTool(toolName: string, permission: AgentToolPermission): boolean;
  shouldPromptForPermission(toolName: string, permission: AgentToolPermission): boolean;
};

function createDecision(
  toolName: string,
  permission: AgentToolPermission,
  status: AgentPermissionDecision["status"],
  reason: string,
): AgentPermissionDecision {
  return {
    toolName,
    permission,
    status,
    reason,
  };
}

export function createPermissionManager(): PermissionManager {
  const decideToolPermission = (toolName: string, permission: AgentToolPermission): AgentPermissionDecision => {
    switch (permission) {
      case "read":
        return createDecision(toolName, permission, "auto-allowed", "read_tools_are_preview_safe");
      case "local-note-search":
        return createDecision(
          toolName,
          permission,
          "prompt-required",
          "local_note_search_requires_user_permission",
        );
      case "public-network":
        return createDecision(toolName, permission, "prompt-required", "public_network_requires_user_permission");
      case "cookie-network":
        return createDecision(toolName, permission, "unavailable", "cookie_network_unavailable_in_preview");
      case "write":
        return createDecision(toolName, permission, "prompt-required", "write_requires_user_permission");
      case "patch-apply":
        return createDecision(toolName, permission, "unavailable", "patch_apply_unavailable_in_preview");
      case "execute":
        return createDecision(toolName, permission, "unavailable", "execute_unavailable_in_preview");
      case "destructive":
        return createDecision(
          toolName,
          permission,
          "blocked-by-configuration",
          "destructive_tools_blocked_by_configuration",
        );
      case "network":
        return createDecision(
          toolName,
          permission,
          "prompt-required",
          "legacy_network_permission_requires_user_permission",
        );
    }
  };

  return {
    decideToolPermission,
    canAutoRunTool(toolName: string, permission: AgentToolPermission): boolean {
      return decideToolPermission(toolName, permission).status === "auto-allowed";
    },
    shouldPromptForPermission(toolName: string, permission: AgentToolPermission): boolean {
      const decision = decideToolPermission(toolName, permission);
      return decision.status === "prompt-required" || decision.status === "degraded-fallback";
    },
  };
}
