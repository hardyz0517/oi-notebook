import { describe, expect, it } from "vitest";

import { createEventStream } from "./eventStream";

describe("event stream", () => {
  it("buffers and flushes events in order", () => {
    const stream = createEventStream();
    stream.push({
      id: "event:1",
      type: "agent.started",
      sessionId: "session:1",
      at: "2026-06-28T00:00:00.000Z",
      payload: {},
    });
    stream.push({
      id: "event:2",
      type: "tool.started",
      sessionId: "session:1",
      at: "2026-06-28T00:00:01.000Z",
      payload: { toolName: "read_current_file" },
    });

    expect(stream.snapshot().map((event) => event.id)).toEqual(["event:1", "event:2"]);
    expect(stream.flush().map((event) => event.id)).toEqual(["event:1", "event:2"]);
    expect(stream.snapshot()).toEqual([]);
  });
});
