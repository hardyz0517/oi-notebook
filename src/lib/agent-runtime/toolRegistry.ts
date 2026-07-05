import type { AgentToolDefinition } from "./agentTypes";

export type ToolRegistry = {
  register(tool: AgentToolDefinition): void;
  get(name: string): AgentToolDefinition | undefined;
  has(name: string): boolean;
  list(): AgentToolDefinition[];
};

export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, AgentToolDefinition>();

  return {
    register(tool: AgentToolDefinition): void {
      tools.set(tool.name, tool);
    },
    get(name: string): AgentToolDefinition | undefined {
      return tools.get(name);
    },
    has(name: string): boolean {
      return tools.has(name);
    },
    list(): AgentToolDefinition[] {
      return Array.from(tools.values());
    },
  };
}
