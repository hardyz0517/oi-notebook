import { describe, expect, it } from "vitest";

import type { AgentToolDefinition, AgentToolPermission } from "./agentTypes";
import { createToolRegistry } from "./toolRegistry";

const makeTool = (
  name: string,
  overrides: Partial<AgentToolDefinition> = {},
): AgentToolDefinition => ({
  name,
  description: `Tool ${name}`,
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
  permission: "read",
  exposure: "workbench-preview",
  timeoutMs: 1_000,
  lifecycle: { emits: ["tool.requested", "tool.started", "tool.output"] },
  failurePolicy: {
    unsupported: "structured-failure",
    timeout: "structured-failure",
    permissionDenied: "blocked-result",
  },
  run: async () => "ok",
  ...overrides,
});

describe("tool registry", () => {
  it("registers and resolves a tool by name", () => {
    const registry = createToolRegistry();
    registry.register(makeTool("read_current_file", { description: "Read the current file" }));

    expect(registry.has("read_current_file")).toBe(true);
    expect(registry.get("read_current_file")?.permission).toBe("read");
    expect(registry.list().map((tool) => tool.name)).toEqual(["read_current_file"]);
  });

  it("rejects duplicate tool names instead of silently overwriting", () => {
    const registry = createToolRegistry();
    registry.register(makeTool("read_manual_url"));

    expect(() => registry.register(makeTool("read_manual_url"))).toThrow("duplicate_tool:read_manual_url");
  });

  it("returns a structured unsupported result for missing tools", () => {
    const registry = createToolRegistry();

    expect(registry.resolve("missing_tool")).toEqual({
      status: "unsupported",
      reason: "tool_not_registered",
      toolName: "missing_tool",
    });
  });

  it("does not expose unavailable placeholders as executable tools", () => {
    const registry = createToolRegistry();
    registry.register(makeTool("patch_apply", { exposure: "unavailable-placeholder", permission: "patch-apply" }));

    expect(registry.resolve("patch_apply")).toEqual({
      status: "unsupported",
      reason: "tool_unavailable_placeholder",
      toolName: "patch_apply",
    });
    expect(registry.get("patch_apply")).toBeUndefined();
    expect(registry.list().map((tool) => tool.name)).toEqual(["patch_apply"]);
  });

  it("still accepts legacy network permission tools for Task 1 compatibility", () => {
    const registry = createToolRegistry();
    const permission: AgentToolPermission = "network";
    registry.register(makeTool("legacy_network_reader", { permission }));

    expect(registry.resolve("legacy_network_reader")).toEqual({
      status: "found",
      tool: expect.objectContaining({
        name: "legacy_network_reader",
        permission: "network",
      }),
    });
  });
});
