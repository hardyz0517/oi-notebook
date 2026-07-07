import { describe, expect, it } from "vitest";

import {
  createContinuationContextFromObservations,
  createToolObservation,
  type ToolObservation,
} from "./toolObservation";

describe("P11 tool observation redaction and continuation context", () => {
  it("drops secret-bearing raw fields before producing continuation-safe output", () => {
    const observation = createToolObservation({
      observationId: "observation:p11:secret",
      sourceToolCallId: "tool-call:p11:secret",
      toolName: "read-current-context.preview",
      permissionDecisionId: "permission:p11:read",
      rawStatus: "completed",
      createdAt: "2026-07-07T00:00:00.000Z",
      rawOutput: {
        summary: "Loaded explicit context for continuation.",
        usefulContent: "The recurrence can be solved with prefix sums.",
        apiKey: "sk-test-observation-secret",
        headers: {
          Authorization: "Bearer sk-test-authorization-secret",
        },
        cookieJar: "session=preview-cookie-secret",
        secretLabel: "secret: keep this out",
      },
      continuationVisibility: "summary-only",
    });

    expect(observation).toMatchObject({
      observationId: "observation:p11:secret",
      sourceToolCallId: "tool-call:p11:secret",
      toolName: "read-current-context.preview",
      permissionDecisionId: "permission:p11:read",
      summary: "Loaded explicit context for continuation.",
      continuationVisibility: "summary-only",
    } satisfies Partial<ToolObservation>);
    expect(observation.droppedFields).toEqual(["apiKey", "cookieJar", "headers.Authorization", "secretLabel"]);

    const serialized = JSON.stringify(observation);
    expect(serialized).toContain("prefix sums");
    expect(serialized).not.toContain("sk-test-observation-secret");
    expect(serialized).not.toContain("sk-test-authorization-secret");
    expect(serialized).not.toContain("preview-cookie-secret");
    expect(serialized).not.toContain("keep this out");
  });

  it("redacts cookie-like text, authorization lines and secret labels from raw string output", () => {
    const observation = createToolObservation({
      observationId: "observation:p11:text-secret",
      sourceToolCallId: "tool-call:p11:text-secret",
      toolName: "search-evidence.preview",
      permissionDecisionId: "permission:p11:evidence",
      rawStatus: "completed",
      createdAt: "2026-07-07T00:00:01.000Z",
      rawOutput: [
        "Found two public editorials in fixture evidence.",
        "Authorization: Bearer sk-test-text-authorization",
        "cookie: session=preview-cookie-value",
        "secret: internal fixture note",
        "Use the monotonic queue transition.",
      ].join("\n"),
      continuationVisibility: "summary-only",
    });

    expect(observation.boundedContent).toContain("Found two public editorials");
    expect(observation.boundedContent).toContain("monotonic queue");
    expect(observation.droppedFields).toEqual(["rawOutput.line2", "rawOutput.line3", "rawOutput.line4"]);

    const context = createContinuationContextFromObservations([observation]);
    const serialized = JSON.stringify(context);

    expect(serialized).toContain("monotonic queue");
    expect(serialized).not.toContain("sk-test-text-authorization");
    expect(serialized).not.toContain("preview-cookie-value");
    expect(serialized).not.toContain("internal fixture note");
  });

  it("summarizes and bounds large output before continuation", () => {
    const largeOutput = Array.from({ length: 80 }, (_, index) => `line-${index + 1}: deterministic preview output`).join("\n");

    const observation = createToolObservation({
      observationId: "observation:p11:large",
      sourceToolCallId: "tool-call:p11:large",
      toolName: "write-solution-outline.preview",
      permissionDecisionId: "permission:p11:outline",
      rawStatus: "completed",
      createdAt: "2026-07-07T00:00:02.000Z",
      rawOutput: largeOutput,
      continuationVisibility: "summary-only",
      maxContentChars: 180,
    });

    expect(observation.summary).toContain("Tool output truncated");
    expect(observation.boundedContent.length).toBeLessThanOrEqual(180);
    expect(observation.boundedContent).toContain("line-1");
    expect(observation.droppedFields).toContain("rawOutput.truncated");
  });

  it("keeps OI evidence as generic refs without making observations OI-only", () => {
    const observation = createToolObservation({
      observationId: "observation:p11:oi-refs",
      sourceToolCallId: "tool-call:p11:oi-refs",
      toolName: "oi-problem-context.preview",
      permissionDecisionId: "permission:p11:oi-read",
      rawStatus: "completed",
      createdAt: "2026-07-07T00:00:03.000Z",
      rawOutput: {
        summary: "Problem workspace projection attached.",
        content: "DP state and sample explanation are available.",
      },
      evidenceRefs: ["evidence:luogu:p1000:editorial"],
      workspaceRefs: ["workspace:problem:p1000"],
      continuationVisibility: "summary-only",
    });

    expect(observation.evidenceRefs).toEqual(["evidence:luogu:p1000:editorial"]);
    expect(observation.workspaceRefs).toEqual(["workspace:problem:p1000"]);
    expect(Object.keys(observation)).not.toContain("oiProblem");

    const context = createContinuationContextFromObservations([observation]);
    expect(context.observations).toEqual([
      {
        observationId: "observation:p11:oi-refs",
        sourceToolCallId: "tool-call:p11:oi-refs",
        toolName: "oi-problem-context.preview",
        summary: "Problem workspace projection attached.",
        boundedContent: "Problem workspace projection attached.\nDP state and sample explanation are available.",
        evidenceRefs: ["evidence:luogu:p1000:editorial"],
        workspaceRefs: ["workspace:problem:p1000"],
      },
    ]);
  });
});
