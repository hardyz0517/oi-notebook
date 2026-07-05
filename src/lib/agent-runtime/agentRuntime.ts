import type { AgentEvent, AgentEventType, AgentRuntimeRunResult, AgentSessionState, AgentToolRunOutput } from "./agentTypes";
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

const TOOL_SUPPLIED_EVENT_DENYLIST = new Set<AgentEventType>([
  "model.delta",
  "patch.generated",
  "patch.applied",
  "agent.compacted",
]);

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
      pushEvent(createEvent(session.id, "tool.requested", { toolName, input: inputValue }));

      const toolResult = input.toolRegistry.resolve(toolName);
      if (toolResult.status === "unsupported") {
        pushEvent(createEvent(session.id, "tool.failed", { toolName, reason: toolResult.reason }));
        session = { ...session, status: "failed" };
        return { status: "failed", reason: toolResult.reason };
      }

      const tool = toolResult.tool;
      const permissionDecision = input.permissionManager.decideToolPermission(toolName, tool.permission);

      if (permissionDecision.status === "prompt-required" || permissionDecision.status === "degraded-fallback") {
        pushEvent(createEvent(session.id, "permission.required", { toolName, permission: tool.permission }));
        pushEvent(createEvent(session.id, "permission.resolved", permissionDecision));
        session = { ...session, status: "blocked" };
        return { status: "blocked", reason: "permission_required" };
      }

      pushEvent(createEvent(session.id, "permission.resolved", permissionDecision));

      if (
        permissionDecision.status === "denied" ||
        permissionDecision.status === "unavailable" ||
        permissionDecision.status === "blocked-by-configuration"
      ) {
        session = { ...session, status: "blocked" };
        return { status: "blocked", reason: permissionDecision.reason };
      }

      pushEvent(createEvent(session.id, "tool.started", { toolName, input: inputValue }));

      try {
        const rawOutput = await tool.run(inputValue);
        const output = isToolRunOutput(rawOutput) ? rawOutput.output : rawOutput;
        pushEvent(createEvent(session.id, "tool.output", { toolName, output }));
        if (isToolRunOutput(rawOutput)) {
          for (const event of rawOutput.events ?? []) {
            if (TOOL_SUPPLIED_EVENT_DENYLIST.has(event.type)) {
              const reason = `reserved_agent_event:${event.type}`;
              pushEvent(createEvent(session.id, "tool.failed", { toolName, reason }));
              session = { ...session, status: "failed" };
              return { status: "failed", reason };
            }
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
