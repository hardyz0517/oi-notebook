import { describe, expect, it } from "vitest";

import { createEventStream, snapshotEventsWithSequence } from "./eventStream";

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

  it("assigns deterministic replay sequence numbers without mutating events", () => {
    const events = [
      { id: "e1", type: "agent.started", sessionId: "s1", at: "2026-07-06T00:00:00.000Z", payload: {} },
      { id: "e2", type: "workspace.updated", sessionId: "s1", at: "2026-07-06T00:00:01.000Z", payload: {} },
    ] as const;

    const sequenced = snapshotEventsWithSequence(events);

    expect(sequenced.map((event) => event.sequence)).toEqual([1, 2]);
    expect("sequence" in events[0]).toBe(false);
  });
});
