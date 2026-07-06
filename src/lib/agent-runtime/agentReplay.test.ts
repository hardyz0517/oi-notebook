import { describe, expect, it } from "vitest";

import { createAgentSessionMetadata } from "./agentSession";
import type { AgentReplayEventLogEntry, AgentReplayFixture } from "./agentReplay";
import { replayAgentSession } from "./agentReplay";

const metadata = createAgentSessionMetadata({
  sessionId: "session:p8",
  workspaceId: "workspace:p3379",
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:03.000Z",
  privacyPolicyId: "privacy:p8-preview",
});

const event = (
  sequence: number,
  type: AgentReplayEventLogEntry["type"],
  payload: Record<string, unknown> = {},
  override: Partial<AgentReplayEventLogEntry> = {},
): AgentReplayEventLogEntry => ({
  id: `event:${sequence}`,
  type,
  sessionId: "session:p8",
  at: `2026-07-06T00:00:0${sequence}.000Z`,
  sequence,
  source: "runtime",
  payload,
  redaction: {
    classification: "runtime-metadata",
    visibility: "ui-visible",
    redactionStrategy: "none",
    reason: "fixture",
  },
  ...override,
});

const fixture = (events: AgentReplayEventLogEntry[], checkpoints: AgentReplayFixture["checkpoints"] = []): AgentReplayFixture => ({
  metadata,
  events,
  checkpoints,
});

describe("replayAgentSession", () => {
  it("replays ordered events into a deterministic read model", () => {
    const replayFixture = fixture([
      event(1, "agent.started"),
      event(2, "evidence.added", { evidenceIds: ["E1"] }),
      event(3, "workspace.updated", { workspaceId: "workspace:p3379" }),
    ]);

    const first = replayAgentSession(replayFixture);
    const second = replayAgentSession(replayFixture);

    expect(first.status).toBe("completed");
    expect(first.eventCount).toBe(3);
    expect(first.evidenceIds).toEqual(["E1"]);
    expect(first.workspaceIds).toEqual(["workspace:p3379"]);
    expect(first.capabilityStatuses.providerRequest.status).toBe("unavailable");
    expect(second).toEqual(first);
  });

  it("fails replay when event ordering is invalid", () => {
    const replayFixture = fixture([event(2, "agent.started"), event(1, "workspace.updated")]);

    expect(replayAgentSession(replayFixture).failureReasons).toContain("event-order-invalid");
  });

  it("fails replay when event session ids do not match metadata", () => {
    const replayFixture = fixture([
      event(1, "agent.started"),
      event(2, "workspace.updated", {}, { sessionId: "session:other" }),
    ]);

    expect(replayAgentSession(replayFixture).failureReasons).toContain("event-session-mismatch");
  });

  it("fails replay when cookie payloads are marked ui-visible", () => {
    const replayFixture = fixture([
      event(1, "observation.added", {}, {
        redaction: {
          classification: "cookie",
          visibility: "ui-visible",
          redactionStrategy: "none",
          reason: "fixture_violation",
        },
      }),
    ]);

    expect(replayAgentSession(replayFixture).failureReasons).toContain("redaction-policy-violation");
  });

  it("fails replay when checkpoint session ids do not match metadata", () => {
    const replayFixture = fixture([event(1, "agent.started")], [
      {
        checkpointId: "checkpoint:p8:1",
        sessionId: "session:other",
        afterSequence: 1,
        workspaceSnapshot: {},
        evidenceSnapshot: {},
        skillSnapshot: {},
        capabilitySnapshot: metadata.capabilities,
        privacySnapshot: {},
      },
    ]);

    expect(replayAgentSession(replayFixture).failureReasons).toContain("checkpoint-session-mismatch");
  });
});
