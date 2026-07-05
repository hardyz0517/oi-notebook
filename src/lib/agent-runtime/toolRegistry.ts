import type { AgentToolDefinition } from "./agentTypes";

export type ToolRegistryUnsupportedReason = "tool_not_registered" | "tool_unavailable_placeholder";

export type ToolRegistryResolveResult =
  | {
      status: "found";
      tool: AgentToolDefinition;
    }
  | {
      status: "unsupported";
      toolName: string;
      reason: ToolRegistryUnsupportedReason;
    };

export type ToolRegistry = {
  register(tool: AgentToolDefinition): void;
  resolve(name: string): ToolRegistryResolveResult;
  get(name: string): AgentToolDefinition | undefined;
  has(name: string): boolean;
  list(): AgentToolDefinition[];
};

export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, AgentToolDefinition>();

  const resolveTool = (name: string): ToolRegistryResolveResult => {
    const tool = tools.get(name);
    if (!tool) {
      return {
        status: "unsupported",
        toolName: name,
        reason: "tool_not_registered",
      };
    }
    if (tool.exposure === "unavailable-placeholder") {
      return {
        status: "unsupported",
        toolName: name,
        reason: "tool_unavailable_placeholder",
      };
    }
    return {
      status: "found",
      tool,
    };
  };

  return {
    register(tool: AgentToolDefinition): void {
      if (tools.has(tool.name)) {
        throw new Error(`duplicate_tool:${tool.name}`);
      }
      tools.set(tool.name, tool);
    },
    resolve(name: string): ToolRegistryResolveResult {
      return resolveTool(name);
    },
    get(name: string): AgentToolDefinition | undefined {
      const result = resolveTool(name);
      return result.status === "found" ? result.tool : undefined;
    },
    has(name: string): boolean {
      return resolveTool(name).status === "found";
    },
    list(): AgentToolDefinition[] {
      return Array.from(tools.values());
    },
  };
}
