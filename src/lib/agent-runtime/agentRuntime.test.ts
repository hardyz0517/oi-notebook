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
      "tool.started",
      "tool.output",
      "agent.completed",
    ]);
  });
});
