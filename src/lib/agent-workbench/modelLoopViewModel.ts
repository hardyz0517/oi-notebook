import type {
  MultiStepModelLoopEvent,
  MultiStepModelLoopResult,
} from "@/lib/agent-runtime/multiStepModelLoop";
import type { ModelLoopOutputState, ModelLoopTerminalStatus } from "@/lib/agent-runtime/modelLoopTypes";
import type { ToolObservation } from "@/lib/agent-runtime/toolObservation";

export type ModelLoopTimelineKind =
  | "turn"
  | "step"
  | "model-delta"
  | "tool-call"
  | "permission"
  | "lifecycle"
  | "observation"
  | "terminal";

export type ModelLoopTimelineItem = {
  id: string;
  kind: ModelLoopTimelineKind;
  sequence: number;
  title: string;
  detail: string;
  turnId: string;
  stepId?: string;
  stepNumber?: number;
  toolCallId?: string;
  toolName?: string | null;
  permissionDecisionId?: string;
  observationId?: string;
  terminalStatus?: ModelLoopTerminalStatus;
};

export type ModelLoopObservationPreview = Pick<
  ToolObservation,
  | "observationId"
  | "sourceToolCallId"
  | "toolName"
  | "permissionDecisionId"
  | "rawStatus"
  | "redactionStatus"
  | "summary"
  | "boundedContent"
  | "evidenceRefs"
  | "workspaceRefs"
  | "droppedFields"
  | "continuationVisibility"
  | "createdAt"
>;

export type ModelLoopViewModel = {
  title: ModelLoopOutputState;
  outputState: ModelLoopOutputState;
  turn: {
    turnId: string;
    maxSteps: number;
    currentStep: number;
    attempt: number;
    status: string;
    terminalStatus: ModelLoopTerminalStatus | null;
  };
  terminalStatus: ModelLoopTerminalStatus | null;
  finalContent: string | null;
  failureDetail: string | null;
  timeline: ModelLoopTimelineItem[];
  observations: ModelLoopObservationPreview[];
  limitations: string[];
};

const RAW_PROVIDER_PATTERN = /\braw\s*provider\s*payload\b|rawProviderPayload|vendor payload/i;
const SECRET_PATTERN = /Authorization:|Bearer\s+sk-[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]+|api[_-]?key|secret:|session=/gi;

function sanitizeText(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value
    .split(/\r?\n/)
    .filter((line) => !RAW_PROVIDER_PATTERN.test(line))
    .map((line) => line.replace(SECRET_PATTERN, "[redacted]"))
    .join("\n")
    .trim();
}

function eventKind(event: MultiStepModelLoopEvent): ModelLoopTimelineKind {
  if (event.eventType.startsWith("turn.")) {
    return event.eventType === "turn.started" ? "turn" : "terminal";
  }
  if (event.eventType.startsWith("step.")) {
    return "step";
  }
  if (event.eventType === "model.tool_call.requested" || event.eventType === "tool_call.normalized") {
    return "tool-call";
  }
  if (event.eventType === "permission.resolved") {
    return "permission";
  }
  if (event.eventType.startsWith("tool.lifecycle.")) {
    return "lifecycle";
  }
  if (event.eventType === "observation.added") {
    return "observation";
  }

  return "turn";
}

function titleForEvent(event: MultiStepModelLoopEvent): string {
  switch (event.eventType) {
    case "turn.started":
      return "Turn started";
    case "step.started":
      return "Step started";
    case "model.tool_call.requested":
      return "Tool call requested";
    case "tool_call.normalized":
      return "Tool call normalized";
    case "permission.resolved":
      return "Permission resolved";
    case "tool.lifecycle.started":
      return "Tool lifecycle started";
    case "tool.lifecycle.completed":
      return "Tool lifecycle completed";
    case "tool.lifecycle.failed":
      return "Tool lifecycle failed";
    case "tool.lifecycle.unavailable":
      return "Tool lifecycle unavailable";
    case "observation.added":
      return "Observation redacted";
    case "step.completed":
      return "Step completed";
    case "turn.completed":
      return "Turn completed";
    case "turn.cancelled":
      return "Turn cancelled";
    case "turn.failed":
      return "Turn failed";
  }
}

function detailForEvent(event: MultiStepModelLoopEvent, observations: ToolObservation[]): string {
  if (event.eventType === "observation.added" && event.observationId) {
    const observation = observations.find((item) => item.observationId === event.observationId);
    return sanitizeText(observation?.summary) || "Redacted observation is available to the read-only timeline.";
  }
  if (event.safeDetail) {
    return sanitizeText(event.safeDetail);
  }
  if (event.toolName) {
    return `${event.toolName}${event.toolCallId ? ` · ${event.toolCallId}` : ""}`;
  }
  if (event.terminalStatus) {
    return event.terminalStatus;
  }
  return event.stepId ?? event.turnId;
}

function timelineItemForEvent(
  event: MultiStepModelLoopEvent,
  observations: ToolObservation[],
): ModelLoopTimelineItem {
  return {
    id: `event:${event.sequence}:${event.eventType}`,
    kind: eventKind(event),
    sequence: event.sequence,
    title: titleForEvent(event),
    detail: detailForEvent(event, observations),
    turnId: event.turnId,
    stepId: event.stepId,
    stepNumber: event.stepNumber,
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    permissionDecisionId: event.permissionDecisionId,
    observationId: event.observationId,
    terminalStatus: event.terminalStatus,
  };
}

function createModelDeltaItem(result: MultiStepModelLoopResult): ModelLoopTimelineItem | null {
  const detail = sanitizeText(result.finalContent);
  if (!detail) {
    return null;
  }

  const completedStep = [...result.events].reverse().find((event) => event.eventType === "step.completed");

  return {
    id: "model-delta:final",
    kind: "model-delta",
    sequence: completedStep ? completedStep.sequence + 0.1 : result.events.length + 0.1,
    title: "Model delta",
    detail,
    turnId: result.turn.turnId,
    stepId: completedStep?.stepId,
    stepNumber: completedStep?.stepNumber,
  };
}

function observationPreview(observation: ToolObservation): ModelLoopObservationPreview {
  return {
    observationId: observation.observationId,
    sourceToolCallId: observation.sourceToolCallId,
    toolName: observation.toolName,
    permissionDecisionId: observation.permissionDecisionId,
    rawStatus: observation.rawStatus,
    redactionStatus: observation.redactionStatus,
    summary: sanitizeText(observation.summary),
    boundedContent: sanitizeText(observation.boundedContent),
    evidenceRefs: [...observation.evidenceRefs],
    workspaceRefs: [...observation.workspaceRefs],
    droppedFields: [...observation.droppedFields],
    continuationVisibility: observation.continuationVisibility,
    createdAt: observation.createdAt,
  };
}

export function createModelLoopViewModel(result: MultiStepModelLoopResult): ModelLoopViewModel {
  const eventItems = result.events.map((event) => timelineItemForEvent(event, result.observations));
  const modelDelta = createModelDeltaItem(result);
  const timeline = modelDelta ? [...eventItems, modelDelta].sort((a, b) => a.sequence - b.sequence) : eventItems;

  return {
    title: result.outputState,
    outputState: result.outputState,
    turn: {
      turnId: result.turn.turnId,
      maxSteps: result.turn.maxSteps,
      currentStep: result.turn.currentStep,
      attempt: result.turn.attempt,
      status: result.turn.status,
      terminalStatus: result.turn.terminalStatus,
    },
    terminalStatus: result.turn.terminalStatus,
    finalContent: sanitizeText(result.finalContent) || null,
    failureDetail: sanitizeText(result.failure?.safeDetail) || null,
    timeline,
    observations: result.observations.map(observationPreview),
    limitations: [
      "read_only_projection",
      "no_ui_loop_decision",
      "no_prompt_construction",
      "no_tool_execution_controls",
      "no_patch_apply_or_code_runner",
      "no_authenticated_reader",
      "no_durable_persistence",
    ],
  };
}
