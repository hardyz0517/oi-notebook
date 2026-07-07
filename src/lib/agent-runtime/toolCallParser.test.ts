import { describe, expect, it } from "vitest";

import { parseProviderToolCallIntent, parseProviderToolCallIntents } from "./toolCallParser";

describe("P11 tool call parser contract", () => {
  it("parses provider tool-call intent with ids, JSON arguments, step id and sequence", () => {
    const result = parseProviderToolCallIntent({
      toolCallId: "tool-call:p11:1",
      toolName: "general.lookup-context",
      argumentsJson: JSON.stringify({ query: "explain this note", limit: 3 }),
      stepId: "step:p11:1",
      sequence: 7,
    });

    expect(result).toEqual({
      status: "parsed",
      eventType: "model.tool_call.requested",
      toolCallId: "tool-call:p11:1",
      toolName: "general.lookup-context",
      argumentsJson: '{"query":"explain this note","limit":3}',
      arguments: { query: "explain this note", limit: 3 },
      stepId: "step:p11:1",
      sequence: 7,
    });
  });

  it("returns safe invalid parse detail for malformed JSON without leaking raw provider payload", () => {
    const result = parseProviderToolCallIntent({
      toolCallId: "tool-call:p11:bad-json",
      toolName: "general.lookup-context",
      argumentsJson: '{"token":"sk-should-never-leak",',
      stepId: "step:p11:2",
      sequence: 8,
      rawProviderPayload: "Authorization: Bearer sk-should-never-leak",
    });

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") {
      throw new Error("Expected malformed JSON to produce an invalid tool-call parse result.");
    }
    expect(result.eventType).toBe("tool_call.invalid");
    expect(result.safeDetail).toBe("Tool call arguments JSON could not be parsed.");
    expect(JSON.stringify(result)).not.toContain("sk-should-never-leak");
    expect(JSON.stringify(result)).not.toContain("Authorization");
    expect(JSON.stringify(result)).not.toContain("rawProviderPayload");
  });

  it("parses a batch without provider, registry, UI or filesystem dependencies", () => {
    const result = parseProviderToolCallIntents([
      {
        toolCallId: "tool-call:p11:1",
        toolName: "general.summarize",
        argumentsJson: "{}",
        stepId: "step:p11:1",
        sequence: 1,
      },
      {
        toolCallId: "tool-call:p11:2",
        toolName: "general.inspect",
        argumentsJson: "not json",
        stepId: "step:p11:1",
        sequence: 2,
      },
    ]);

    expect(result.map((intent) => intent.status)).toEqual(["parsed", "invalid"]);
    expect(result.map((intent) => intent.stepId)).toEqual(["step:p11:1", "step:p11:1"]);
  });
});
