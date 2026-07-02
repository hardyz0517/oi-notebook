import { describe, expect, it } from "vitest";

import { createAgentSession } from "./agentSession";

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
