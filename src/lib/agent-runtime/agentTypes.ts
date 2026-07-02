export type AgentEventType =
  | "agent.started"
  | "agent.plan.created"
  | "model.delta"
  | "tool.started"
  | "tool.output"
  | "tool.failed"
  | "permission.required"
  | "evidence.added"
  | "patch.generated"
  | "patch.applied"
  | "workspace.updated"
  | "agent.completed"
  | "agent.failed";

export interface AgentEvent {
  id: string;
  type: AgentEventType;
  sessionId: string;
  at: string;
  payload: Record<string, unknown>;
}

export type AgentSessionStatus = "idle" | "running" | "completed" | "failed";

export type AgentPlanStep = {
  id: string;
  title: string;
  status: "pending" | "running" | "completed" | "failed";
};

export type AgentToolPermission = "read" | "network" | "write" | "execute";

export type AgentToolDefinition = {
  name: string;
  description: string;
  permission: AgentToolPermission;
  run: (input: unknown) => Promise<unknown | AgentToolRunOutput>;
};

export type AgentToolRunOutput = {
  output: unknown;
  events?: Array<{
    type: AgentEventType;
    payload: Record<string, unknown>;
  }>;
};

export type AgentSessionState = {
  id: string;
  workspaceId: string;
  status: AgentSessionStatus;
  plan: AgentPlanStep[];
  context: Record<string, unknown>;
  events: AgentEvent[];
};

export type AgentRuntimeRunResult =
  | {
      status: "completed";
      output: unknown;
    }
  | {
      status: "blocked";
      reason: string;
    }
  | {
      status: "failed";
      reason: string;
    };
