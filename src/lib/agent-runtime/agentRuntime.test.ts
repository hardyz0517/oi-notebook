import { describe, expect, it } from "vitest";

import { createAgentRuntime } from "./agentRuntime";
import { createAgentSession } from "./agentSession";
import { createPermissionManager } from "./permissionManager";
import { createToolRegistry } from "./toolRegistry";

describe("agent runtime", () => {
  it("runs an allowed tool and records structured events", async () => {
    const registry = createToolRegistry();
    registry.register({
      name: "read_current_file",
      description: "Read the current file",
      permission: "read",
      run: async () => ({ content: "hello" }),
    });

    const runtime = createAgentRuntime({
      session: createAgentSession({ workspaceId: "workspace:p4" }),
      toolRegistry: registry,
      permissionManager: createPermissionManager(),
    });

    const result = await runtime.runTool("read_current_file", { path: "notes/a.md" });

    expect(result.status).toBe("completed");
    expect(result.output).toEqual({ content: "hello" });
    expect(runtime.events.snapshot().map((event) => event.type)).toEqual([
      "agent.started",
      "tool.requested",
      "tool.started",
      "tool.output",
      "agent.completed",
    ]);
  });

  it("emits tool.requested before permission and execution events", async () => {
    const registry = createToolRegistry();
    registry.register({
      name: "read_context",
      description: "Read context",
      permission: "read",
      run: async () => ({ ok: true }),
    });

    const runtime = createAgentRuntime({
      session: createAgentSession({ workspaceId: "workspace:test" }),
      toolRegistry: registry,
      permissionManager: createPermissionManager(),
    });

    await runtime.runTool("read_context", { id: "input" });

    expect(runtime.session.events.map((event) => event.type)).toEqual([
      "agent.started",
      "tool.requested",
      "tool.started",
      "tool.output",
      "agent.completed",
    ]);
  });

  it("marks permission-blocked one-shot runs as blocked, not failed", async () => {
    const registry = createToolRegistry();
    registry.register({
      name: "write_file",
      description: "Write file",
      permission: "write",
      run: async () => ({ ok: true }),
    });

    const runtime = createAgentRuntime({
      session: createAgentSession({ workspaceId: "workspace:test" }),
      toolRegistry: registry,
      permissionManager: createPermissionManager(),
    });

    const result = await runtime.runTool("write_file", { path: "notes/a.md" });

    expect(result).toEqual({ status: "blocked", reason: "permission_required" });
    expect(runtime.session.status).toBe("blocked");
    expect(runtime.session.events.map((event) => event.type)).toContain("permission.required");
  });
});
