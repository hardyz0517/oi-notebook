import { describe, expect, it } from "vitest";

import { normalizeToolCallIntent, normalizeToolCallIntents } from "./toolCallNormalizer";
import type { ParsedProviderToolCallIntent } from "./toolCallParser";

describe("P11 tool call normalizer contract", () => {
  it("normalizes parsed intent while preserving general tool names and arguments", () => {
    const parsed = {
      status: "parsed",
      eventType: "model.tool_call.requested",
      toolCallId: "tool-call:p11:general",
      toolName: "general.research-context",
      argumentsJson: '{"topic":"agent runtime","depth":"short"}',
      arguments: { topic: "agent runtime", depth: "short" },
      stepId: "step:p11:1",
      sequence: 3,
    } satisfies ParsedProviderToolCallIntent;

    expect(normalizeToolCallIntent(parsed)).toEqual({
      status: "normalized",
      eventType: "tool_call.normalized",
      toolCallId: "tool-call:p11:general",
      toolName: "general.research-context",
      arguments: { topic: "agent runtime", depth: "short" },
      stepId: "step:p11:1",
      sequence: 3,
      registryStatus: "not-checked",
      toolNameStatus: "provided",
    });
  });

  it("does not assume OI-only task shapes", () => {
    const normalized = normalizeToolCallIntent({
      status: "parsed",
      eventType: "model.tool_call.requested",
      toolCallId: "tool-call:p11:writing",
      toolName: "writing.outline-draft",
      argumentsJson: '{"audience":"general","format":"bullets"}',
      arguments: { audience: "general", format: "bullets" },
      stepId: "step:p11:2",
      sequence: 4,
    });

    expect(normalized.toolName).toBe("writing.outline-draft");
    expect(JSON.stringify(normalized)).not.toContain("problemId");
    expect(JSON.stringify(normalized)).not.toContain("luogu");
  });

  it("keeps unknown tool names normalized and leaves registry lookup to Task 3", () => {
    const normalized = normalizeToolCallIntent({
      status: "parsed",
      eventType: "model.tool_call.requested",
      toolCallId: "tool-call:p11:future",
      toolName: "future.custom-tool",
      argumentsJson: '{"x":1}',
      arguments: { x: 1 },
      stepId: "step:p11:3",
      sequence: 5,
    });

    expect(normalized.status).toBe("normalized");
    expect(normalized.toolName).toBe("future.custom-tool");
    expect(normalized.registryStatus).toBe("not-checked");
  });

  it("keeps missing tool names as normalized intents instead of execution errors", () => {
    const normalized = normalizeToolCallIntent({
      status: "parsed",
      eventType: "model.tool_call.requested",
      toolCallId: "tool-call:p11:missing-name",
      toolName: "",
      argumentsJson: '{"x":1}',
      arguments: { x: 1 },
      stepId: "step:p11:4",
      sequence: 6,
    });

    expect(normalized).toMatchObject({
      status: "normalized",
      eventType: "tool_call.normalized",
      toolName: null,
      registryStatus: "not-checked",
      toolNameStatus: "missing",
    });
  });

  it("preserves invalid parser results without escalating to tool execution", () => {
    const normalized = normalizeToolCallIntents([
      {
        status: "invalid",
        eventType: "tool_call.invalid",
        toolCallId: "tool-call:p11:bad",
        stepId: "step:p11:5",
        sequence: 7,
        reason: "malformed-json",
        safeDetail: "Tool call arguments JSON could not be parsed.",
      },
    ]);

    expect(normalized).toEqual([
      {
        status: "invalid",
        eventType: "tool_call.invalid",
        toolCallId: "tool-call:p11:bad",
        stepId: "step:p11:5",
        sequence: 7,
        reason: "malformed-json",
        safeDetail: "Tool call arguments JSON could not be parsed.",
      },
    ]);
  });
});
