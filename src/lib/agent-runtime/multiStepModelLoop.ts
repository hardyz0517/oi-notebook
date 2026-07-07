import {
  MODEL_LOOP_OUTPUT_STATE,
  createModelLoopTurnContract,
  type ModelLoopOutputState,
  type ModelLoopTerminalStatus,
  type ModelLoopTurnContract,
} from "./modelLoopTypes";
import { normalizeToolCallIntent, type NormalizedToolCallIntent } from "./toolCallNormalizer";
import { parseProviderToolCallIntent, type RawProviderToolCallIntent } from "./toolCallParser";
import {
  createToolLifecycleCompleted,
  createToolLifecycleFailed,
  createToolLifecycleStarted,
  createToolLifecycleUnavailable,
} from "./toolContinuationLifecycle";
import {
  createDefaultToolContinuationRegistry,
  type ToolContinuationRegistry,
  type ToolContinuationTransport,
} from "./toolContinuationRegistry";
import { routeToolContinuation, type ToolContinuationRouteResult } from "./toolContinuationRouter";
import {
  createContinuationContextFromObservations,
  createToolObservation,
  type ToolObservation,
  type ToolObservationRawOutput,
} from "./toolObservation";
import { createPermissionDecisionEvent, decideToolPermission, type ToolPermissionDecision } from "./toolPermissionGate";

export { MODEL_LOOP_OUTPUT_STATE };

export type MultiStepModelLoopProviderContext = {
  turnId: string;
  stepId: string;
  stepNumber: number;
  maxSteps: number;
  continuationContext: ReturnType<typeof createContinuationContextFromObservations>;
  observations: ToolObservation[];
  outputState: ModelLoopOutputState;
};

export type MultiStepModelLoopProviderOutput =
  | {
      status: "completed";
      content: string;
    }
  | {
      status: "tool-call";
      content?: string;
      toolCall: RawProviderToolCallIntent;
    }
  | {
      status: "failed";
      safeDetail: string;
    };

export type MultiStepModelLoopProvider = (
  context: MultiStepModelLoopProviderContext,
) => Promise<MultiStepModelLoopProviderOutput> | MultiStepModelLoopProviderOutput;

export type MultiStepToolTransportInput = {
  turnId: string;
  stepId: string;
  toolCallId: string;
  toolName: string;
  transport: ToolContinuationTransport;
  arguments: unknown;
  outputState: ModelLoopOutputState;
};

export type MultiStepToolTransportResult =
  | {
      status: "completed";
      rawOutput: ToolObservationRawOutput;
      evidenceRefs?: string[];
      workspaceRefs?: string[];
    }
  | {
      status: "failed";
      safeDetail: string;
      rawOutput?: ToolObservationRawOutput;
      evidenceRefs?: string[];
      workspaceRefs?: string[];
    };

export type MultiStepToolTransport = (
  input: MultiStepToolTransportInput,
) => Promise<MultiStepToolTransportResult> | MultiStepToolTransportResult;

export type MultiStepCancellationCheck = (input: {
  phase: "before-provider" | "after-tool";
  turnId: string;
  stepId: string;
  stepNumber: number;
}) => boolean;

export type MultiStepModelLoopFailureReason =
  | "provider-failed"
  | "invalid-tool-call"
  | "unsupported-tool"
  | "reserved-tool"
  | "permission-not-auto-allowed"
  | "tool-transport-failed"
  | "step-limit-exceeded"
  | "cancelled";

export type MultiStepModelLoopFailure = {
  reason: MultiStepModelLoopFailureReason;
  safeDetail: string;
};

export type MultiStepModelLoopEvent = {
  eventType:
    | "turn.started"
    | "step.started"
    | "model.tool_call.requested"
    | "tool_call.normalized"
    | "permission.resolved"
    | "tool.lifecycle.started"
    | "tool.lifecycle.completed"
    | "tool.lifecycle.failed"
    | "tool.lifecycle.unavailable"
    | "observation.added"
    | "step.completed"
    | "turn.completed"
    | "turn.failed"
    | "turn.cancelled";
  sequence: number;
  turnId: string;
  stepId?: string;
  stepNumber?: number;
  toolCallId?: string;
  toolName?: string | null;
  permissionDecisionId?: string;
  observationId?: string;
  terminalStatus?: ModelLoopTerminalStatus;
  safeDetail?: string;
  outputState: ModelLoopOutputState;
};

export type RunMultiStepModelLoopInput = {
  turnId: string;
  maxSteps: number;
  providerContinue: MultiStepModelLoopProvider;
  toolTransport: MultiStepToolTransport;
  registry?: ToolContinuationRegistry;
  now?: () => string;
  shouldCancel?: MultiStepCancellationCheck;
  toolFailurePolicy?: "terminal" | "observe";
};

export type MultiStepModelLoopResult = {
  turn: ModelLoopTurnContract;
  events: MultiStepModelLoopEvent[];
  observations: ToolObservation[];
  continuationContext: ReturnType<typeof createContinuationContextFromObservations>;
  finalContent: string | null;
  failure: MultiStepModelLoopFailure | null;
  outputState: ModelLoopOutputState;
};

type MutableLoopState = {
  sequence: number;
  events: MultiStepModelLoopEvent[];
  observations: ToolObservation[];
  finalContent: string | null;
  failure: MultiStepModelLoopFailure | null;
  turn: ModelLoopTurnContract;
};

const RESERVED_TOOL_NAMES = new Set(["execute", "patch-apply", "apply-patch", "code-runner"]);

function createStepId(stepNumber: number): string {
  return `step:${stepNumber}`;
}

function nextEvent(
  state: MutableLoopState,
  event: Omit<MultiStepModelLoopEvent, "sequence" | "outputState">,
): MultiStepModelLoopEvent {
  const record: MultiStepModelLoopEvent = {
    ...event,
    sequence: ++state.sequence,
    outputState: MODEL_LOOP_OUTPUT_STATE,
  };
  state.events.push(record);
  return record;
}

function createInitialState(input: RunMultiStepModelLoopInput): MutableLoopState {
  return {
    sequence: 0,
    events: [],
    observations: [],
    finalContent: null,
    failure: null,
    turn: createModelLoopTurnContract({
      turnId: input.turnId,
      maxSteps: input.maxSteps,
      currentStep: 0,
      attempt: 0,
      status: "running",
      terminalStatus: null,
    }),
  };
}

function finish(
  state: MutableLoopState,
  status: Extract<ModelLoopTerminalStatus, "completed">,
  eventType: Extract<MultiStepModelLoopEvent["eventType"], "turn.completed">,
): MultiStepModelLoopResult;
function finish(
  state: MutableLoopState,
  status: Exclude<ModelLoopTerminalStatus, "completed">,
  eventType: Extract<MultiStepModelLoopEvent["eventType"], "turn.failed" | "turn.cancelled">,
  failure: MultiStepModelLoopFailure,
): MultiStepModelLoopResult;
function finish(
  state: MutableLoopState,
  terminalStatus: ModelLoopTerminalStatus,
  eventType: "turn.completed" | "turn.failed" | "turn.cancelled",
  failure: MultiStepModelLoopFailure | null = null,
): MultiStepModelLoopResult {
  state.turn = {
    ...state.turn,
    status: terminalStatus === "completed" ? "completed" : terminalStatus === "cancelled" ? "cancelled" : "failed",
    terminalStatus,
  };
  state.failure = failure;
  nextEvent(state, {
    eventType,
    turnId: state.turn.turnId,
    terminalStatus,
    safeDetail: failure?.safeDetail,
  });

  return {
    turn: state.turn,
    events: state.events,
    observations: state.observations,
    continuationContext: createContinuationContextFromObservations(state.observations),
    finalContent: state.finalContent,
    failure: state.failure,
    outputState: MODEL_LOOP_OUTPUT_STATE,
  };
}

function isReservedToolName(toolName: string | null): boolean {
  if (!toolName) {
    return false;
  }

  const normalized = toolName.toLowerCase();
  return RESERVED_TOOL_NAMES.has(normalized) || normalized.includes("patch") || normalized.includes("execute");
}

function createReservedToolFailure(toolName: string | null): MultiStepModelLoopFailure {
  const name = toolName ?? "requested tool";
  return {
    reason: "reserved-tool",
    safeDetail: `${name} is reserved in P11 preview and has no transport.`,
  };
}

function permissionSourceFor(decision: ToolContinuationRouteResult & { status: "routed" }) {
  return decision.permission.kind === "read" ? "explicit-context" : "default";
}

function observationIdFor(toolCallId: string): string {
  return `observation:${toolCallId}`;
}

function rawOutputFromFailedTransport(result: MultiStepToolTransportResult): ToolObservationRawOutput {
  if (result.status === "failed") {
    return result.rawOutput ?? {
      summary: result.safeDetail,
    };
  }

  return result.rawOutput;
}

function emitPermissionEvent(input: {
  state: MutableLoopState;
  stepId: string;
  stepNumber: number;
  intent: NormalizedToolCallIntent;
  decision: ToolPermissionDecision;
  at: string;
}) {
  const permissionEvent = createPermissionDecisionEvent({
    sequence: input.state.sequence + 1,
    turnId: input.state.turn.turnId,
    stepId: input.stepId,
    toolCallId: input.intent.toolCallId,
    toolName: input.intent.toolName ?? "unknown",
    decision: input.decision,
    at: input.at,
  });
  nextEvent(input.state, {
    eventType: permissionEvent.eventType,
    turnId: permissionEvent.turnId,
    stepId: permissionEvent.stepId,
    stepNumber: input.stepNumber,
    toolCallId: permissionEvent.toolCallId,
    toolName: permissionEvent.toolName,
    permissionDecisionId: permissionEvent.permissionDecisionId,
  });
}

export async function runMultiStepModelLoop(input: RunMultiStepModelLoopInput): Promise<MultiStepModelLoopResult> {
  const registry = input.registry ?? createDefaultToolContinuationRegistry();
  const now = input.now ?? (() => new Date().toISOString());
  const toolFailurePolicy = input.toolFailurePolicy ?? "terminal";
  const state = createInitialState(input);

  nextEvent(state, {
    eventType: "turn.started",
    turnId: input.turnId,
  });

  for (let stepNumber = 1; stepNumber <= input.maxSteps; stepNumber += 1) {
    const stepId = createStepId(stepNumber);
    state.turn = {
      ...state.turn,
      currentStep: stepNumber,
      attempt: 1,
    };

    if (input.shouldCancel?.({ phase: "before-provider", turnId: input.turnId, stepId, stepNumber })) {
      return finish(state, "cancelled", "turn.cancelled", {
        reason: "cancelled",
        safeDetail: "P11 preview turn was cancelled before provider continuation.",
      });
    }

    nextEvent(state, {
      eventType: "step.started",
      turnId: input.turnId,
      stepId,
      stepNumber,
    });

    const providerOutput = await input.providerContinue({
      turnId: input.turnId,
      stepId,
      stepNumber,
      maxSteps: input.maxSteps,
      continuationContext: createContinuationContextFromObservations(state.observations),
      observations: [...state.observations],
      outputState: MODEL_LOOP_OUTPUT_STATE,
    });

    if (providerOutput.status === "failed") {
      return finish(state, "failed", "turn.failed", {
        reason: "provider-failed",
        safeDetail: providerOutput.safeDetail,
      });
    }

    if (providerOutput.status === "completed") {
      state.finalContent = providerOutput.content;
      nextEvent(state, {
        eventType: "step.completed",
        turnId: input.turnId,
        stepId,
        stepNumber,
      });
      return finish(state, "completed", "turn.completed");
    }

    const parsed = parseProviderToolCallIntent(providerOutput.toolCall);
    nextEvent(state, {
      eventType: "model.tool_call.requested",
      turnId: input.turnId,
      stepId,
      stepNumber,
      toolCallId: parsed.toolCallId ?? undefined,
      toolName: parsed.status === "parsed" ? parsed.toolName : null,
    });

    const normalized = normalizeToolCallIntent(parsed);
    if (normalized.status === "invalid") {
      return finish(state, "failed", "turn.failed", {
        reason: "invalid-tool-call",
        safeDetail: normalized.safeDetail,
      });
    }

    nextEvent(state, {
      eventType: "tool_call.normalized",
      turnId: input.turnId,
      stepId,
      stepNumber,
      toolCallId: normalized.toolCallId,
      toolName: normalized.toolName,
    });

    if (isReservedToolName(normalized.toolName)) {
      const failure = createReservedToolFailure(normalized.toolName);
      createToolLifecycleUnavailable({
        sequence: state.sequence + 1,
        turnId: input.turnId,
        stepId,
        toolCallId: normalized.toolCallId,
        toolName: normalized.toolName ?? "unknown",
        terminalReason: "unsupported-tool",
        safeDetail: failure.safeDetail,
        at: now(),
      });
      nextEvent(state, {
        eventType: "tool.lifecycle.unavailable",
        turnId: input.turnId,
        stepId,
        stepNumber,
        toolCallId: normalized.toolCallId,
        toolName: normalized.toolName,
        terminalStatus: "unsupported-tool",
        safeDetail: failure.safeDetail,
      });
      return finish(state, "unsupported-tool", "turn.failed", failure);
    }

    const route = routeToolContinuation(normalized, registry);
    if (route.status === "terminal") {
      return finish(state, "unsupported-tool", "turn.failed", {
        reason: "unsupported-tool",
        safeDetail: route.safeDetail,
      });
    }

    const permission = decideToolPermission({
      kind: route.permission.kind,
      source: permissionSourceFor(route),
    });
    emitPermissionEvent({
      state,
      stepId,
      stepNumber,
      intent: normalized,
      decision: permission,
      at: now(),
    });

    if (!permission.canExecuteInP11) {
      return finish(state, "blocked-by-permission", "turn.failed", {
        reason: "permission-not-auto-allowed",
        safeDetail: permission.reason,
      });
    }

    const started = createToolLifecycleStarted({
      sequence: state.sequence + 1,
      turnId: input.turnId,
      stepId,
      toolCallId: normalized.toolCallId,
      toolName: route.toolName,
      transport: route.transport,
      at: now(),
    });
    nextEvent(state, {
      eventType: started.eventType,
      turnId: started.turnId,
      stepId: started.stepId,
      stepNumber,
      toolCallId: started.toolCallId,
      toolName: started.toolName,
    });

    const transportResult = await input.toolTransport({
      turnId: input.turnId,
      stepId,
      toolCallId: normalized.toolCallId,
      toolName: route.toolName,
      transport: route.transport,
      arguments: normalized.arguments,
      outputState: MODEL_LOOP_OUTPUT_STATE,
    });

    if (transportResult.status === "failed" && toolFailurePolicy === "terminal") {
      const failed = createToolLifecycleFailed({
        sequence: state.sequence + 1,
        turnId: input.turnId,
        stepId,
        toolCallId: normalized.toolCallId,
        toolName: route.toolName,
        transport: route.transport,
        reason: route.transport === "read-only-preview" ? "read-only-preview-failure" : "mock-transport-failure",
        safeDetail: transportResult.safeDetail,
        at: now(),
      });
      nextEvent(state, {
        eventType: failed.eventType,
        turnId: failed.turnId,
        stepId: failed.stepId,
        stepNumber,
        toolCallId: failed.toolCallId,
        toolName: failed.toolName,
        terminalStatus: failed.terminalReason,
        safeDetail: failed.safeDetail,
      });
      return finish(state, "failed", "turn.failed", {
        reason: "tool-transport-failed",
        safeDetail: transportResult.safeDetail,
      });
    }

    const observation = createToolObservation({
      observationId: observationIdFor(normalized.toolCallId),
      sourceToolCallId: normalized.toolCallId,
      toolName: route.toolName,
      permissionDecisionId: permission.permissionDecisionId,
      rawStatus: transportResult.status,
      rawOutput: rawOutputFromFailedTransport(transportResult),
      evidenceRefs: transportResult.evidenceRefs,
      workspaceRefs: transportResult.workspaceRefs,
      continuationVisibility: route.observationPolicy.continuationVisibility,
      maxContentChars: route.observationPolicy.maxBytes,
      createdAt: now(),
    });
    state.observations.push(observation);

    const completed = createToolLifecycleCompleted({
      sequence: state.sequence + 1,
      turnId: input.turnId,
      stepId,
      toolCallId: normalized.toolCallId,
      toolName: route.toolName,
      transport: route.transport,
      observationId: observation.observationId,
      summary: observation.summary,
      at: now(),
    });
    nextEvent(state, {
      eventType: completed.eventType,
      turnId: completed.turnId,
      stepId: completed.stepId,
      stepNumber,
      toolCallId: completed.toolCallId,
      toolName: completed.toolName,
      observationId: observation.observationId,
    });
    nextEvent(state, {
      eventType: "observation.added",
      turnId: input.turnId,
      stepId,
      stepNumber,
      toolCallId: normalized.toolCallId,
      toolName: route.toolName,
      permissionDecisionId: permission.permissionDecisionId,
      observationId: observation.observationId,
    });
    nextEvent(state, {
      eventType: "step.completed",
      turnId: input.turnId,
      stepId,
      stepNumber,
    });

    if (input.shouldCancel?.({ phase: "after-tool", turnId: input.turnId, stepId, stepNumber })) {
      return finish(state, "cancelled", "turn.cancelled", {
        reason: "cancelled",
        safeDetail: "P11 preview turn was cancelled after tool observation.",
      });
    }

    if (stepNumber >= input.maxSteps) {
      return finish(state, "step-limit-exceeded", "turn.failed", {
        reason: "step-limit-exceeded",
        safeDetail: "P11 preview step limit was reached before provider completion.",
      });
    }
  }

  return finish(state, "step-limit-exceeded", "turn.failed", {
    reason: "step-limit-exceeded",
    safeDetail: "P11 preview step limit was reached.",
  });
}
