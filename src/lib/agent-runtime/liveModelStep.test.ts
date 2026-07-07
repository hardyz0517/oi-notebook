import { describe, expect, it, vi } from "vitest";

import { runOneTurnLiveModelStep } from "./liveModelStep";

describe("runOneTurnLiveModelStep", () => {
  it("emits a bounded one-turn live model lifecycle", async () => {
    const transport = vi.fn().mockResolvedValue([
      { type: "model.delta.live", requestId: "request:p10:1", sequence: 1, at: "2026-07-07T00:00:01.000Z", text: "Hello" },
      { type: "model.turn.completed.live", requestId: "request:p10:1", sequence: 2, at: "2026-07-07T00:00:02.000Z" },
    ]);

    const result = await runOneTurnLiveModelStep({
      requestId: "request:p10:1",
      transport,
      retry: { maxAttempts: 1, delayMs: 0 },
    });

    expect(result.events.map((event) => event.type)).toEqual([
      "provider.request.started",
      "model.delta.live",
      "model.turn.completed.live",
    ]);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("does not dispatch tools from live model output in P10", async () => {
    const result = await runOneTurnLiveModelStep({
      requestId: "request:p10:tool",
      transport: async () => [
        {
          type: "model.tool-call.requested.preview",
          requestId: "request:p10:tool",
          sequence: 1,
          at: "2026-07-07T00:00:01.000Z",
          toolName: "read_current_file",
        },
      ],
      retry: { maxAttempts: 1, delayMs: 0 },
    });

    expect(result.events.map((event) => event.type as string)).not.toContain("tool.started");
    expect(result.events[result.events.length - 1]?.type).toBe("model.turn.failed.live");
  });

  it("emits a safe failure after bounded retry", async () => {
    const transport = vi.fn().mockRejectedValue(new Error("raw failure"));

    const result = await runOneTurnLiveModelStep({
      requestId: "request:p10:retry",
      transport,
      retry: { maxAttempts: 2, delayMs: 0 },
    });

    expect(result.attempts).toBe(2);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(result.events[result.events.length - 1]?.type).toBe("model.turn.failed.live");
    expect(JSON.stringify(result.events)).not.toContain("raw failure");
  });
});
