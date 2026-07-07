import { describe, expect, it } from "vitest";

import { createDefaultToolContinuationRegistry } from "./toolContinuationRegistry";
import { routeToolContinuation } from "./toolContinuationRouter";
import type { NormalizedToolCallIntent } from "./toolCallNormalizer";

function makeIntent(toolName: string | null): NormalizedToolCallIntent {
  return {
    status: "normalized",
    eventType: "tool_call.normalized",
    toolCallId: `tool-call:${toolName ?? "missing"}`,
    toolName,
    arguments: { query: "preview only" },
    stepId: "step:p11:router",
    sequence: 1,
    registryStatus: "not-checked",
    toolNameStatus: toolName ? "provided" : "missing",
  };
}

describe("P11 tool continuation router preview", () => {
  it("routes every default P11 preview tool to mock-preview or read-only-preview transport", () => {
    const registry = createDefaultToolContinuationRegistry();
    const routes = registry.list().map((tool) => routeToolContinuation(makeIntent(tool.name), registry));

    expect(routes).toEqual([
      expect.objectContaining({
        status: "routed",
        transport: "read-only-preview",
        toolName: "read-current-context.preview",
      }),
      expect.objectContaining({
        status: "routed",
        transport: "read-only-preview",
        toolName: "search-evidence.preview",
      }),
      expect.objectContaining({
        status: "routed",
        transport: "read-only-preview",
        toolName: "oi-problem-context.preview",
      }),
      expect.objectContaining({
        status: "routed",
        transport: "mock-preview",
        toolName: "write-solution-outline.preview",
      }),
    ]);
    expect(
      routes.every((route) => route.status === "routed" && ["mock-preview", "read-only-preview"].includes(route.transport)),
    ).toBe(true);
  });

  it("returns unsupported-tool terminal route for unsupported tools", () => {
    const registry = createDefaultToolContinuationRegistry();

    expect(routeToolContinuation(makeIntent("real-file-writer"), registry)).toEqual({
      status: "terminal",
      terminalReason: "unsupported-tool",
      toolCallId: "tool-call:real-file-writer",
      toolName: "real-file-writer",
      safeDetail: "Tool is not registered for P11 preview continuation.",
    });
  });

  it("keeps missing tool names terminal instead of guessing a transport", () => {
    const registry = createDefaultToolContinuationRegistry();

    expect(routeToolContinuation(makeIntent(null), registry)).toEqual({
      status: "terminal",
      terminalReason: "unsupported-tool",
      toolCallId: "tool-call:missing",
      toolName: null,
      safeDetail: "Tool call did not include a tool name.",
    });
  });
});
