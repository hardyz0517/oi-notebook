import { describe, expect, it } from "vitest";

import {
  createDefaultToolContinuationRegistry,
  createToolContinuationRegistry,
  definePreviewTool,
} from "./toolContinuationRegistry";

describe("P11 tool continuation registry preview", () => {
  it("registers preview tools with schema, permission, exposure, lifecycle and observation policy", () => {
    const registry = createToolContinuationRegistry();
    const tool = definePreviewTool({
      name: "read-current-context.preview",
      description: "Reads only the explicit in-memory runtime context.",
      inputSchema: {
        type: "object",
        properties: {
          contextRef: { type: "string" },
        },
        required: ["contextRef"],
      },
      outputSchema: {
        type: "object",
        properties: {
          summary: { type: "string" },
        },
        required: ["summary"],
      },
      permission: {
        kind: "read",
        decision: "auto-allowed",
        reason: "explicit_runtime_context_only",
      },
      exposure: "workbench-preview",
      transport: "read-only-preview",
      lifecycle: {
        emits: ["tool.lifecycle.started", "tool.lifecycle.completed", "observation.added"],
      },
      observationPolicy: {
        redaction: "required",
        continuationVisibility: "summary-only",
        maxBytes: 2048,
      },
    });

    expect(registry.register(tool)).toEqual({
      status: "registered",
      toolName: "read-current-context.preview",
    });
    expect(registry.resolve("read-current-context.preview")).toEqual({
      status: "found",
      tool,
    });
  });

  it("returns structured failure for duplicate registration instead of silently overwriting", () => {
    const registry = createToolContinuationRegistry();
    const tool = definePreviewTool({
      name: "search-evidence.preview",
      description: "Searches only synthetic evidence already present in the runtime preview.",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      permission: {
        kind: "local-note-search",
        decision: "prompt-required",
        reason: "preview_evidence_search_requires_visible_policy",
      },
      exposure: "workbench-preview",
      transport: "read-only-preview",
      lifecycle: {
        emits: ["tool.lifecycle.started", "tool.lifecycle.completed", "observation.added"],
      },
      observationPolicy: {
        redaction: "required",
        continuationVisibility: "summary-only",
        maxBytes: 2048,
      },
    });

    expect(registry.register(tool)).toEqual({
      status: "registered",
      toolName: "search-evidence.preview",
    });
    expect(registry.register({ ...tool, description: "Duplicate should not replace the first tool." })).toEqual({
      status: "failed",
      reason: "duplicate-tool",
      toolName: "search-evidence.preview",
    });
    expect(registry.resolve("search-evidence.preview")).toEqual({
      status: "found",
      tool,
    });
  });

  it("returns unsupported-tool terminal reason for unknown tools", () => {
    const registry = createToolContinuationRegistry();

    expect(registry.resolve("future-real-write-tool")).toEqual({
      status: "unsupported",
      toolName: "future-real-write-tool",
      terminalReason: "unsupported-tool",
      safeDetail: "Tool is not registered for P11 preview continuation.",
    });
  });

  it("registers the P11 preview example tools without making the registry OI-only", () => {
    const registry = createDefaultToolContinuationRegistry();

    expect(registry.list().map((tool) => tool.name)).toEqual([
      "read-current-context.preview",
      "search-evidence.preview",
      "oi-problem-context.preview",
      "write-solution-outline.preview",
    ]);
    expect(registry.resolve("oi-problem-context.preview")).toMatchObject({
      status: "found",
      tool: {
        profile: "oi",
        permission: {
          kind: "read",
        },
      },
    });
    expect(registry.resolve("write-solution-outline.preview")).toMatchObject({
      status: "found",
      tool: {
        permission: {
          kind: "read",
          reason: "outline_observation_only_no_file_write",
        },
        observationPolicy: {
          continuationVisibility: "summary-only",
        },
      },
    });
  });
});
