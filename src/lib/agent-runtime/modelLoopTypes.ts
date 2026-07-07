export const MODEL_LOOP_OUTPUT_STATE = "Multi-Step Model Loop / Tool-Call Continuation Contract Preview" as const;

export type ModelLoopOutputState = typeof MODEL_LOOP_OUTPUT_STATE;

export type ModelLoopTurnStatus = "created" | "running" | "blocked" | "completed" | "failed" | "cancelled";

export type ModelLoopTerminalStatus =
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "blocked-by-permission"
  | "step-limit-exceeded"
  | "redaction-blocked"
  | "unsupported-tool";

export type ModelLoopEventType =
  | "turn.started"
  | "step.started"
  | "model.tool_call.requested"
  | "tool_call.normalized"
  | "permission.required"
  | "permission.resolved"
  | "tool.lifecycle.started"
  | "tool.lifecycle.completed"
  | "observation.added"
  | "step.completed"
  | "turn.completed";

export type ModelLoopEvent = {
  type: ModelLoopEventType;
  sequence: number;
  turnId: string;
  stepId?: string;
  toolCallId?: string;
  permissionDecisionId?: string;
  observationId?: string;
  outputState: ModelLoopOutputState;
};

export type ModelLoopTurnContract = {
  turnId: string;
  maxSteps: number;
  currentStep: number;
  attempt: number;
  status: ModelLoopTurnStatus;
  terminalStatus: ModelLoopTerminalStatus | null;
  outputState: ModelLoopOutputState;
};

export type CreateModelLoopTurnContractInput = Omit<ModelLoopTurnContract, "outputState">;

export function createModelLoopTurnContract(input: CreateModelLoopTurnContractInput): ModelLoopTurnContract {
  return {
    ...input,
    outputState: MODEL_LOOP_OUTPUT_STATE,
  };
}

export type CreateModelLoopEventSequenceInput = {
  turnId: string;
  stepId: string;
  toolCallId: string;
  permissionDecisionId: string;
  observationId: string;
};

export function createModelLoopEventSequence(input: CreateModelLoopEventSequenceInput): ModelLoopEvent[] {
  const eventTypes: ModelLoopEventType[] = [
    "turn.started",
    "step.started",
    "model.tool_call.requested",
    "tool_call.normalized",
    "permission.required",
    "permission.resolved",
    "tool.lifecycle.started",
    "tool.lifecycle.completed",
    "observation.added",
    "step.completed",
    "turn.completed",
  ];

  return eventTypes.map((type, index) => ({
    type,
    sequence: index + 1,
    turnId: input.turnId,
    stepId: type === "turn.started" || type === "turn.completed" ? undefined : input.stepId,
    toolCallId:
      type === "model.tool_call.requested" ||
      type === "tool_call.normalized" ||
      type === "permission.required" ||
      type === "permission.resolved" ||
      type === "tool.lifecycle.started" ||
      type === "tool.lifecycle.completed" ||
      type === "observation.added"
        ? input.toolCallId
        : undefined,
    permissionDecisionId:
      type === "permission.required" ||
      type === "permission.resolved" ||
      type === "tool.lifecycle.started" ||
      type === "tool.lifecycle.completed" ||
      type === "observation.added"
        ? input.permissionDecisionId
        : undefined,
    observationId: type === "observation.added" ? input.observationId : undefined,
    outputState: MODEL_LOOP_OUTPUT_STATE,
  }));
}
