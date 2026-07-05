import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { createAgentSession, markSessionStatus } from "./agentSession";
import type { AgentEventType } from "./agentTypes";

describe("agent session", () => {
  it("creates a session with stable defaults", () => {
    const session = createAgentSession({ workspaceId: "workspace:p4" });

    expect(session.workspaceId).toBe("workspace:p4");
    expect(session.status).toBe("idle");
    expect(session.plan).toEqual([]);
    expect(session.events).toEqual([]);
    expect(session.context).toEqual({});
    expect(session.id).toContain("session:");
  });
});

describe("AgentSessionState", () => {
  it("supports blocked as an explicit contract state", () => {
    const session = createAgentSession({ workspaceId: "workspace:test" });
    const blocked = markSessionStatus(session, "blocked");

    expect(blocked.status).toBe("blocked");
    expect(blocked.events).toEqual([]);
  });
});

describe("AgentEventType", () => {
  it("covers the P5 core protocol events without claiming mature execution", () => {
    const events = [
      "agent.started",
      "agent.plan.created",
      "model.delta",
      "tool.requested",
      "tool.started",
      "tool.output",
      "tool.failed",
      "permission.required",
      "permission.resolved",
      "observation.added",
      "evidence.added",
      "patch.generated",
      "patch.applied",
      "workspace.updated",
      "agent.compacted",
      "agent.completed",
      "agent.failed",
    ] satisfies AgentEventType[];

    expect(events).toContain("tool.requested");
    expect(events).toContain("permission.resolved");
    expect(events).toContain("observation.added");
    expect(events).toContain("agent.compacted");

    const source = readFileSync(new URL("./agentTypes.ts", import.meta.url), "utf8");

    for (const event of events) {
      expect(source).toContain(`| "${event}"`);
    }
  });
});
