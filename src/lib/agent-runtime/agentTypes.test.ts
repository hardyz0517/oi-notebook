import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { createAgentSession, markSessionStatus } from "./agentSession";
import type { AgentEventType, AgentToolDefinition, AgentToolPermission } from "./agentTypes";

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

describe("AgentToolDefinition", () => {
  it("supports the P6 schema, exposure, lifecycle, timeout, and failure metadata", () => {
    const tool = {
      name: "read_manual_url",
      description: "Read a Workbench source.",
      inputSchema: { type: "object", required: ["url"] },
      outputSchema: { type: "object", required: ["sourceUrl"] },
      permission: "read",
      exposure: "workbench-preview",
      timeoutMs: 5_000,
      lifecycle: {
        emits: ["tool.requested", "tool.started", "tool.output"],
      },
      failurePolicy: {
        unsupported: "structured-failure",
        timeout: "structured-failure",
        permissionDenied: "blocked-result",
      },
      run: async () => ({ sourceUrl: "https://example.com" }),
    } satisfies AgentToolDefinition;

    expect(tool.inputSchema).toEqual({ type: "object", required: ["url"] });
    expect(tool.outputSchema).toEqual({ type: "object", required: ["sourceUrl"] });
    expect(tool.exposure).toBe("workbench-preview");
    expect(tool.timeoutMs).toBe(5_000);
    expect(tool.lifecycle.emits).toEqual(["tool.requested", "tool.started", "tool.output"]);
    expect(tool.failurePolicy).toEqual({
      unsupported: "structured-failure",
      timeout: "structured-failure",
      permissionDenied: "blocked-result",
    });

    const source = readFileSync(new URL("./agentTypes.ts", import.meta.url), "utf8");

    for (const field of ["inputSchema", "outputSchema", "exposure", "timeoutMs", "lifecycle", "failurePolicy"]) {
      expect(source).toContain(field);
    }
  });
});

describe("AgentToolPermission", () => {
  it("covers the P6 permission kinds without promoting reserved capabilities", () => {
    const permissions = [
      "read",
      "local-note-search",
      "public-network",
      "cookie-network",
      "write",
      "patch-apply",
      "execute",
      "destructive",
    ] satisfies AgentToolPermission[];

    expect(permissions).toEqual([
      "read",
      "local-note-search",
      "public-network",
      "cookie-network",
      "write",
      "patch-apply",
      "execute",
      "destructive",
    ]);

    const source = readFileSync(new URL("./agentTypes.ts", import.meta.url), "utf8");

    for (const permission of permissions) {
      expect(source).toContain(`| "${permission}"`);
    }

    expect(source).not.toMatch(/\bready\b/i);
    expect(source).not.toMatch(new RegExp(["production", "ready"].join("-"), "i"));
  });
});
