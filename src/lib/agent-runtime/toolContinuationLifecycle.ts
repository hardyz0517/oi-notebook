import { MODEL_LOOP_OUTPUT_STATE } from "./modelLoopTypes";
import type { ModelLoopOutputState, ModelLoopTerminalStatus } from "./modelLoopTypes";
import type { ToolContinuationTransport } from "./toolContinuationRegistry";

type ToolLifecycleBaseInput = {
  sequence: number;
  turnId: string;
  stepId: string;
  toolCallId: string;
  toolName: string;
  at: string;
};

type ToolLifecycleRouteInput = ToolLifecycleBaseInput & {
  transport: ToolContinuationTransport;
};

type ToolLifecycleRecordBase = ToolLifecycleBaseInput & {
  execution: "not-executed";
  sideEffects: [];
  outputState: ModelLoopOutputState;
};

export type ToolLifecycleStartedRecord = ToolLifecycleRecordBase & {
  status: "started";
  eventType: "tool.lifecycle.started";
  transport: ToolContinuationTransport;
};

export type ToolLifecycleCompletedRecord = ToolLifecycleRecordBase & {
  status: "completed";
  eventType: "tool.lifecycle.completed";
  transport: ToolContinuationTransport;
  observation: {
    observationId: string;
    summary: string;
    rawOutputStored: false;
    writePerformed: false;
  };
};

export type ToolLifecycleFailedRecord = ToolLifecycleRecordBase & {
  status: "failed";
  eventType: "tool.lifecycle.failed";
  transport: ToolContinuationTransport;
  terminalReason: Extract<ModelLoopTerminalStatus, "failed">;
  reason: "mock-transport-failure" | "read-only-preview-failure";
  safeDetail: string;
};

export type ToolLifecycleUnavailableRecord = ToolLifecycleRecordBase & {
  status: "unavailable";
  eventType: "tool.lifecycle.unavailable";
  terminalReason: Extract<ModelLoopTerminalStatus, "unsupported-tool">;
  safeDetail: string;
};

function createBaseRecord(input: ToolLifecycleBaseInput): ToolLifecycleRecordBase {
  return {
    sequence: input.sequence,
    turnId: input.turnId,
    stepId: input.stepId,
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    execution: "not-executed",
    sideEffects: [],
    at: input.at,
    outputState: MODEL_LOOP_OUTPUT_STATE,
  };
}

export function createToolLifecycleStarted(input: ToolLifecycleRouteInput): ToolLifecycleStartedRecord {
  return {
    ...createBaseRecord(input),
    status: "started",
    eventType: "tool.lifecycle.started",
    transport: input.transport,
  };
}

export function createToolLifecycleCompleted(
  input: ToolLifecycleRouteInput & {
    observationId: string;
    summary: string;
  },
): ToolLifecycleCompletedRecord {
  return {
    ...createBaseRecord(input),
    status: "completed",
    eventType: "tool.lifecycle.completed",
    transport: input.transport,
    observation: {
      observationId: input.observationId,
      summary: input.summary,
      rawOutputStored: false,
      writePerformed: false,
    },
  };
}

export function createToolLifecycleFailed(
  input: ToolLifecycleRouteInput & {
    reason: ToolLifecycleFailedRecord["reason"];
    safeDetail: string;
  },
): ToolLifecycleFailedRecord {
  return {
    ...createBaseRecord(input),
    status: "failed",
    eventType: "tool.lifecycle.failed",
    transport: input.transport,
    terminalReason: "failed",
    reason: input.reason,
    safeDetail: input.safeDetail,
  };
}

export function createToolLifecycleUnavailable(
  input: ToolLifecycleBaseInput & {
    terminalReason: ToolLifecycleUnavailableRecord["terminalReason"];
    safeDetail: string;
  },
): ToolLifecycleUnavailableRecord {
  return {
    ...createBaseRecord(input),
    status: "unavailable",
    eventType: "tool.lifecycle.unavailable",
    terminalReason: input.terminalReason,
    safeDetail: input.safeDetail,
  };
}
