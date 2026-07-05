export type AgentEventType =
  | "agent.started"
  | "agent.plan.created"
  | "model.delta"
  | "tool.requested"
  | "tool.started"
  | "tool.output"
  | "tool.failed"
  | "permission.required"
  | "permission.resolved"
  | "observation.added"
  | "evidence.added"
  | "patch.generated"
  | "patch.applied"
  | "workspace.updated"
  | "agent.compacted"
  | "agent.completed"
  | "agent.failed";

export interface AgentEvent {
  id: string;
  type: AgentEventType;
  sessionId: string;
  at: string;
  payload: Record<string, unknown>;
}

export type AgentSessionStatus = "idle" | "running" | "blocked" | "completed" | "failed";

export type AgentPlanStep = {
  id: string;
  title: string;
  status: "pending" | "running" | "completed" | "failed";
};

export type AgentToolSchema = {
  type: "object" | "string" | "number" | "boolean" | "array" | "unknown";
  required?: string[];
  properties?: Record<string, AgentToolSchema>;
  items?: AgentToolSchema;
  description?: string;
};

export type AgentToolPermission =
  | "read"
  | "local-note-search"
  | "public-network"
  | "cookie-network"
  | "write"
  | "patch-apply"
  | "execute"
  | "destructive"
  | "network";

export type AgentToolExposure = "runtime-internal" | "workbench-preview" | "future-adapter" | "unavailable-placeholder";

export type AgentToolLifecycle = {
  emits: AgentEventType[];
};

export type AgentToolFailurePolicy = {
  unsupported: "structured-failure";
  timeout: "structured-failure";
  permissionDenied: "blocked-result" | "structured-failure";
};

export type AgentToolDefinition = {
  name: string;
  description: string;
  inputSchema?: AgentToolSchema;
  outputSchema?: AgentToolSchema;
  permission: AgentToolPermission;
  exposure?: AgentToolExposure;
  timeoutMs?: number;
  lifecycle?: AgentToolLifecycle;
  failurePolicy?: AgentToolFailurePolicy;
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

export type AgentLoopCapabilityStatus = "preview" | "reserved" | "unavailable";

export type AgentLoopCapability = {
  status: AgentLoopCapabilityStatus;
  reason: string;
};

export type AgentLoopContract = {
  mode: "preview_one_shot" | "reserved_model_loop";
  modelStep: AgentLoopCapability;
  toolRequest: AgentLoopCapability;
  permissionDecision: AgentLoopCapability;
  toolExecution: AgentLoopCapability;
  observation: AgentLoopCapability;
  continuation: AgentLoopCapability;
  interruption: AgentLoopCapability;
  compaction: AgentLoopCapability;
  patchGeneration: AgentLoopCapability;
  patchApply: AgentLoopCapability;
  sessionPersistence: AgentLoopCapability;
};
