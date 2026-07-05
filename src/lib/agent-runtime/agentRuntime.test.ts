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
      "permission.resolved",
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
      "permission.resolved",
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
    expect(runtime.session.events.map((event) => event.type)).toEqual([
      "agent.started",
      "tool.requested",
      "permission.required",
      "permission.resolved",
    ]);
    expect(runtime.session.events.find((event) => event.type === "permission.resolved")?.payload).toEqual({
      toolName: "write_file",
      permission: "write",
      status: "prompt-required",
      reason: "write_requires_user_permission",
    });
  });

  it("records permission.resolved from the permission decision before starting auto-allowed read tools", async () => {
    const registry = createToolRegistry();
    registry.register({
      name: "read_note",
      description: "Read note",
      permission: "read",
      run: async () => ({ text: "hello" }),
    });

    const runtime = createAgentRuntime({
      session: createAgentSession({ workspaceId: "workspace:test" }),
      toolRegistry: registry,
      permissionManager: createPermissionManager(),
    });

    await runtime.runTool("read_note", { path: "notes/a.md" });

    const events = runtime.session.events;
    expect(events.map((event) => event.type)).toEqual([
      "agent.started",
      "tool.requested",
      "permission.resolved",
      "tool.started",
      "tool.output",
      "agent.completed",
    ]);
    expect(events.find((event) => event.type === "permission.resolved")?.payload).toEqual({
      toolName: "read_note",
      permission: "read",
      status: "auto-allowed",
      reason: "read_tools_are_preview_safe",
    });
  });

  it("resolves unavailable permissions without emitting permission.required or starting the tool", async () => {
    const registry = createToolRegistry();
    registry.register({
      name: "read_cookie_page",
      description: "Read cookie gated page",
      permission: "cookie-network",
      run: async () => ({ ok: true }),
    });

    const runtime = createAgentRuntime({
      session: createAgentSession({ workspaceId: "workspace:test" }),
      toolRegistry: registry,
      permissionManager: createPermissionManager(),
    });

    const result = await runtime.runTool("read_cookie_page", { url: "https://example.test" });

    expect(result).toEqual({ status: "blocked", reason: "cookie_network_unavailable_in_preview" });
    expect(runtime.session.status).toBe("blocked");
    expect(runtime.session.events.map((event) => event.type)).toEqual([
      "agent.started",
      "tool.requested",
      "permission.resolved",
    ]);
    expect(runtime.session.events.find((event) => event.type === "permission.resolved")?.payload).toEqual({
      toolName: "read_cookie_page",
      permission: "cookie-network",
      status: "unavailable",
      reason: "cookie_network_unavailable_in_preview",
    });
  });

  it("resolves blocked-by-configuration permissions without emitting permission.required or starting the tool", async () => {
    const registry = createToolRegistry();
    registry.register({
      name: "delete_note",
      description: "Delete note",
      permission: "destructive",
      run: async () => ({ ok: true }),
    });

    const runtime = createAgentRuntime({
      session: createAgentSession({ workspaceId: "workspace:test" }),
      toolRegistry: registry,
      permissionManager: createPermissionManager(),
    });

    const result = await runtime.runTool("delete_note", { path: "notes/a.md" });

    expect(result).toEqual({ status: "blocked", reason: "destructive_tools_blocked_by_configuration" });
    expect(runtime.session.status).toBe("blocked");
    expect(runtime.session.events.map((event) => event.type)).toEqual([
      "agent.started",
      "tool.requested",
      "permission.resolved",
    ]);
    expect(runtime.session.events.find((event) => event.type === "permission.resolved")?.payload).toEqual({
      toolName: "delete_note",
      permission: "destructive",
      status: "blocked-by-configuration",
      reason: "destructive_tools_blocked_by_configuration",
    });
  });

  it("rejects reserved tool-supplied events and does not complete the run", async () => {
    const registry = createToolRegistry();
    registry.register({
      name: "read_with_reserved_event",
      description: "Read with a reserved event",
      permission: "read",
      run: async () => ({
        output: "ok",
        events: [{ type: "patch.applied" as const, payload: { path: "x" } }],
      }),
    });

    const runtime = createAgentRuntime({
      session: createAgentSession({ workspaceId: "workspace:test" }),
      toolRegistry: registry,
      permissionManager: createPermissionManager(),
    });

    const result = await runtime.runTool("read_with_reserved_event", {});

    expect(result).toEqual({ status: "failed", reason: "reserved_agent_event:patch.applied" });
    expect(runtime.session.status).toBe("failed");
    expect(runtime.session.events.map((event) => event.type)).toEqual([
      "agent.started",
      "tool.requested",
      "permission.resolved",
      "tool.started",
      "tool.output",
      "tool.failed",
    ]);
    expect(runtime.session.events.find((event) => event.type === "tool.failed")?.payload).toEqual({
      toolName: "read_with_reserved_event",
      reason: "reserved_agent_event:patch.applied",
    });
    expect(runtime.session.events.some((event) => event.type === "patch.applied")).toBe(false);
    expect(runtime.session.events.some((event) => event.type === "agent.completed")).toBe(false);
  });
});
