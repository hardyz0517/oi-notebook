import type { AgentToolPermission } from "./agentTypes";

export type PermissionManager = {
  canAutoRunTool(toolName: string, permission: AgentToolPermission): boolean;
  shouldPromptForPermission(toolName: string, permission: AgentToolPermission): boolean;
};

export function createPermissionManager(): PermissionManager {
  return {
    canAutoRunTool(_toolName: string, permission: AgentToolPermission): boolean {
      return permission === "read";
    },
    shouldPromptForPermission(_toolName: string, permission: AgentToolPermission): boolean {
      return permission !== "read";
    },
  };
}
