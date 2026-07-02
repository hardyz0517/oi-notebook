import type { AgentEvent, AgentRuntimeRunResult, AgentSessionState, AgentToolRunOutput } from "./agentTypes";
import { appendSessionEvent } from "./agentSession";
import { createEventStream, type EventStream } from "./eventStream";
import type { PermissionManager } from "./permissionManager";
import type { ToolRegistry } from "./toolRegistry";

export type AgentRuntime = {
  readonly session: AgentSessionState;
  readonly events: EventStream;
  runTool(toolName: string, input: unknown): Promise<AgentRuntimeRunResult & { output?: unknown }>;
};

const createEvent = (
  sessionId: string,
  type: AgentEvent["type"],
  payload: Record<string, unknown>,
): AgentEvent => ({
  id: `${sessionId}:${type}:${Date.now()}`,
  type,
  sessionId,
  at: new Date().toISOString(),
  payload,
});

const isToolRunOutput = (value: unknown): value is AgentToolRunOutput =>
  value !== null &&
  typeof value === "object" &&
  "output" in value;

export function createAgentRuntime(input: {
  session: AgentSessionState;
  toolRegistry: ToolRegistry;
  permissionManager: PermissionManager;
}): AgentRuntime {
  const events = createEventStream();
  let session = input.session;

  const pushEvent = (event: AgentEvent): void => {
    events.push(event);
    session = appendSessionEvent(session, event);
  };

  pushEvent(createEvent(session.id, "agent.started", { workspaceId: session.workspaceId }));

  return {
    get session(): AgentSessionState {
      return session;
    },
    events,
    async runTool(toolName: string, inputValue: unknown): Promise<AgentRuntimeRunResult & { output?: unknown }> {
      const tool = input.toolRegistry.get(toolName);
      if (!tool) {
        pushEvent(createEvent(session.id, "tool.failed", { toolName, reason: "tool_not_registered" }));
        session = { ...session, status: "failed" };
        return { status: "failed", reason: "tool_not_registered" };
      }

      if (!input.permissionManager.canAutoRunTool(toolName, tool.permission)) {
        pushEvent(createEvent(session.id, "permission.required", { toolName, permission: tool.permission }));
        return { status: "blocked", reason: "permission_required" };
      }

      pushEvent(createEvent(session.id, "tool.started", { toolName, input: inputValue }));

      try {
        const rawOutput = await tool.run(inputValue);
        const output = isToolRunOutput(rawOutput) ? rawOutput.output : rawOutput;
        pushEvent(createEvent(session.id, "tool.output", { toolName, output }));
        if (isToolRunOutput(rawOutput)) {
          for (const event of rawOutput.events ?? []) {
            pushEvent(createEvent(session.id, event.type, event.payload));
          }
        }
        pushEvent(createEvent(session.id, "agent.completed", { toolName }));
        session = { ...session, status: "completed" };
        return { status: "completed", output };
      } catch (error) {
        const reason = error instanceof Error ? error.message : "tool_execution_failed";
        pushEvent(createEvent(session.id, "tool.failed", { toolName, reason }));
        session = { ...session, status: "failed" };
        return { status: "failed", reason };
      }
    },
  };
}
