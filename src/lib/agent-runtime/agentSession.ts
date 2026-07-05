import type { AgentEvent, AgentSessionState, AgentSessionStatus } from "./agentTypes";

let sessionCounter = 0;

const createSessionId = (): string => {
  sessionCounter += 1;
  return `session:${sessionCounter}`;
};

export function createAgentSession(input: { workspaceId: string; context?: Record<string, unknown> }): AgentSessionState {
  return {
    id: createSessionId(),
    workspaceId: input.workspaceId,
    status: "idle",
    plan: [],
    context: input.context ?? {},
    events: [],
  };
}

export function appendSessionEvent(session: AgentSessionState, event: AgentEvent): AgentSessionState {
  return {
    ...session,
    events: [...session.events, event],
  };
}

export function markSessionStatus(session: AgentSessionState, status: AgentSessionStatus): AgentSessionState {
  return {
    ...session,
    status,
  };
}
