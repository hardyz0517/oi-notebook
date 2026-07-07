import { describe, expect, it } from "vitest";

import {
  createToolLifecycleCompleted,
  createToolLifecycleFailed,
  createToolLifecycleStarted,
  createToolLifecycleUnavailable,
} from "./toolContinuationLifecycle";

describe("P11 tool continuation lifecycle preview", () => {
  it("creates started records without true execution side effects", () => {
    expect(
      createToolLifecycleStarted({
        sequence: 7,
        turnId: "turn:p11:lifecycle",
        stepId: "step:p11:lifecycle",
        toolCallId: "tool-call:p11:lifecycle",
        toolName: "read-current-context.preview",
        transport: "read-only-preview",
        at: "2026-07-07T00:00:00.000Z",
      }),
    ).toEqual({
      status: "started",
      eventType: "tool.lifecycle.started",
      sequence: 7,
      turnId: "turn:p11:lifecycle",
      stepId: "step:p11:lifecycle",
      toolCallId: "tool-call:p11:lifecycle",
      toolName: "read-current-context.preview",
      transport: "read-only-preview",
      execution: "not-executed",
      sideEffects: [],
      at: "2026-07-07T00:00:00.000Z",
      outputState: "Multi-Step Model Loop / Tool-Call Continuation Contract Preview",
    });
  });

  it("creates completed records with preview observation metadata only", () => {
    expect(
      createToolLifecycleCompleted({
        sequence: 8,
        turnId: "turn:p11:lifecycle",
        stepId: "step:p11:lifecycle",
        toolCallId: "tool-call:p11:lifecycle",
        toolName: "write-solution-outline.preview",
        transport: "mock-preview",
        observationId: "observation:p11:outline",
        summary: "Outline preview generated as an observation only.",
        at: "2026-07-07T00:00:01.000Z",
      }),
    ).toMatchObject({
      status: "completed",
      eventType: "tool.lifecycle.completed",
      transport: "mock-preview",
      execution: "not-executed",
      sideEffects: [],
      observation: {
        observationId: "observation:p11:outline",
        summary: "Outline preview generated as an observation only.",
        rawOutputStored: false,
        writePerformed: false,
      },
    });
  });

  it("creates failed and unavailable records as structured terminal preview records", () => {
    expect(
      createToolLifecycleFailed({
        sequence: 9,
        turnId: "turn:p11:lifecycle",
        stepId: "step:p11:lifecycle",
        toolCallId: "tool-call:p11:failed",
        toolName: "search-evidence.preview",
        transport: "read-only-preview",
        reason: "mock-transport-failure",
        safeDetail: "Preview fixture was unavailable.",
        at: "2026-07-07T00:00:02.000Z",
      }),
    ).toMatchObject({
      status: "failed",
      eventType: "tool.lifecycle.failed",
      terminalReason: "failed",
      execution: "not-executed",
      sideEffects: [],
    });

    expect(
      createToolLifecycleUnavailable({
        sequence: 10,
        turnId: "turn:p11:lifecycle",
        stepId: "step:p11:lifecycle",
        toolCallId: "tool-call:p11:unavailable",
        toolName: "real-code-runner",
        terminalReason: "unsupported-tool",
        safeDetail: "Tool is not registered for P11 preview continuation.",
        at: "2026-07-07T00:00:03.000Z",
      }),
    ).toMatchObject({
      status: "unavailable",
      eventType: "tool.lifecycle.unavailable",
      terminalReason: "unsupported-tool",
      execution: "not-executed",
      sideEffects: [],
    });
  });
});
