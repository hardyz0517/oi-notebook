import { describe, expect, it, vi } from "vitest";

import {
  MODEL_LOOP_OUTPUT_STATE,
  runMultiStepModelLoop,
  type MultiStepModelLoopProvider,
  type MultiStepToolTransport,
} from "./multiStepModelLoop";

function toolCall(toolName: string, stepId: string, sequence: number, args: unknown = { contextRef: "fixture:context" }) {
  return {
    toolCallId: `tool-call:${sequence}`,
    toolName,
    argumentsJson: JSON.stringify(args),
    stepId,
    sequence,
  };
}

describe("P11 bounded multi-step model loop preview", () => {
  it("runs a two-step loop through normalized preview tool call, permission, observation and completion", async () => {
    const provider: MultiStepModelLoopProvider = vi
      .fn()
      .mockResolvedValueOnce({
        status: "tool-call",
        content: "I need the explicit context.",
        toolCall: toolCall("read-current-context.preview", "step:1", 1),
      })
      .mockResolvedValueOnce({
        status: "completed",
        content: "Final answer after reading the preview observation.",
      });
    const transport: MultiStepToolTransport = vi.fn().mockResolvedValue({
      status: "completed",
      rawOutput: {
        summary: "Explicit context preview loaded.",
        content: "Use prefix sums for the recurrence.",
      },
    });

    const result = await runMultiStepModelLoop({
      turnId: "turn:two-step",
      maxSteps: 3,
      providerContinue: provider,
      toolTransport: transport,
      now: () => "2026-07-07T00:00:00.000Z",
    });

    expect(result.turn.terminalStatus).toBe("completed");
    expect(result.finalContent).toBe("Final answer after reading the preview observation.");
    expect(provider).toHaveBeenCalledTimes(2);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(provider).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        stepId: "step:2",
        continuationContext: expect.objectContaining({
          observations: [
            expect.objectContaining({
              toolName: "read-current-context.preview",
              summary: "Explicit context preview loaded.",
              boundedContent: expect.stringContaining("prefix sums"),
            }),
          ],
        }),
      }),
    );
    expect(result.events.map((event) => event.eventType)).toEqual([
      "turn.started",
      "step.started",
      "model.tool_call.requested",
      "tool_call.normalized",
      "permission.resolved",
      "tool.lifecycle.started",
      "tool.lifecycle.completed",
      "observation.added",
      "step.completed",
      "step.started",
      "step.completed",
      "turn.completed",
    ]);
    expect(result.observations).toHaveLength(1);
    expect(result.outputState).toBe(MODEL_LOOP_OUTPUT_STATE);
  });

  it("stops with step-limit-exceeded before an unbounded continuation", async () => {
    const provider: MultiStepModelLoopProvider = vi.fn().mockResolvedValue({
      status: "tool-call",
      content: "Need a preview tool.",
      toolCall: toolCall("read-current-context.preview", "step:1", 1),
    });
    const transport: MultiStepToolTransport = vi.fn().mockResolvedValue({
      status: "completed",
      rawOutput: { summary: "Observation ready." },
    });

    const result = await runMultiStepModelLoop({
      turnId: "turn:limit",
      maxSteps: 1,
      providerContinue: provider,
      toolTransport: transport,
    });

    expect(result.turn.terminalStatus).toBe("step-limit-exceeded");
    expect(result.events[result.events.length - 1]).toMatchObject({
      eventType: "turn.failed",
      terminalStatus: "step-limit-exceeded",
    });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("emits turn.cancelled and prevents further continuation when cancellation is requested", async () => {
    const provider: MultiStepModelLoopProvider = vi.fn().mockResolvedValue({
      status: "tool-call",
      content: "Need a preview tool.",
      toolCall: toolCall("read-current-context.preview", "step:1", 1),
    });
    const transport: MultiStepToolTransport = vi.fn().mockResolvedValue({
      status: "completed",
      rawOutput: { summary: "Observation ready." },
    });

    const result = await runMultiStepModelLoop({
      turnId: "turn:cancel",
      maxSteps: 3,
      providerContinue: provider,
      toolTransport: transport,
      shouldCancel: ({ phase, stepNumber }) => phase === "before-provider" && stepNumber === 2,
    });

    expect(result.turn.terminalStatus).toBe("cancelled");
    expect(result.events[result.events.length - 1]).toMatchObject({
      eventType: "turn.cancelled",
      terminalStatus: "cancelled",
    });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("blocks prompt-required permission decisions without calling preview transport", async () => {
    const provider: MultiStepModelLoopProvider = vi.fn().mockResolvedValue({
      status: "tool-call",
      content: "Search attached evidence.",
      toolCall: toolCall("search-evidence.preview", "step:1", 1, { query: "dp evidence" }),
    });
    const transport: MultiStepToolTransport = vi.fn();

    const result = await runMultiStepModelLoop({
      turnId: "turn:permission",
      maxSteps: 2,
      providerContinue: provider,
      toolTransport: transport,
    });

    expect(result.turn.terminalStatus).toBe("blocked-by-permission");
    expect(result.failure).toMatchObject({
      reason: "permission-not-auto-allowed",
      safeDetail: "local_note_search_preview_only_no_real_notes_read",
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it("can convert preview transport failure into a redacted observation before continuation", async () => {
    const provider: MultiStepModelLoopProvider = vi
      .fn()
      .mockResolvedValueOnce({
        status: "tool-call",
        content: "Try the preview tool.",
        toolCall: toolCall("read-current-context.preview", "step:1", 1),
      })
      .mockResolvedValueOnce({
        status: "completed",
        content: "Completed with failure observation.",
      });
    const transport: MultiStepToolTransport = vi.fn().mockResolvedValue({
      status: "failed",
      safeDetail: "Preview fixture failed without exposing raw content.",
      rawOutput: {
        summary: "Preview fixture failed.",
        Authorization: "Bearer sk-test-transport-secret",
        useful: "Fallback summary is safe.",
      },
    });

    const result = await runMultiStepModelLoop({
      turnId: "turn:tool-failure-observed",
      maxSteps: 3,
      providerContinue: provider,
      toolTransport: transport,
      toolFailurePolicy: "observe",
    });

    expect(result.turn.terminalStatus).toBe("completed");
    expect(result.observations[0]).toMatchObject({
      rawStatus: "failed",
      summary: "Preview fixture failed.",
      droppedFields: ["Authorization"],
    });
    expect(JSON.stringify(result)).not.toContain("sk-test-transport-secret");
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("returns unsupported reserved failure for patch or execute requests and never calls transport", async () => {
    const provider: MultiStepModelLoopProvider = vi.fn().mockResolvedValue({
      status: "tool-call",
      content: "Try reserved execution.",
      toolCall: toolCall("execute", "step:1", 1, { command: "node solution.js" }),
    });
    const transport: MultiStepToolTransport = vi.fn();

    const result = await runMultiStepModelLoop({
      turnId: "turn:reserved-tool",
      maxSteps: 2,
      providerContinue: provider,
      toolTransport: transport,
    });

    expect(result.turn.terminalStatus).toBe("unsupported-tool");
    expect(result.failure).toMatchObject({
      reason: "reserved-tool",
      safeDetail: "execute is reserved in P11 preview and has no transport.",
    });
    expect(transport).not.toHaveBeenCalled();
  });
});
