import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { createAgentSession, createAgentSessionMetadata, markSessionStatus } from "./agentSession";
import type {
  AgentEventType,
  AgentReplayCapabilityStatus,
  AgentReplayPrivacyClassification,
  AgentSessionMetadata,
  AgentToolDefinition,
  AgentToolPermission,
} from "./agentTypes";

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

describe("P8 agent session contract", () => {
  it("records P8 input and output states without opening future capabilities", () => {
    const metadata = createAgentSessionMetadata({
      sessionId: "session:p8",
      workspaceId: "workspace:p3379",
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
      privacyPolicyId: "privacy:p8-preview",
    });

    expect(metadata.phase).toBe("P8 Agent Session / Replay Contract Freeze");
    expect(metadata.inputState).toBe("OI Research/Solution Skill Contract Preview");
    expect(metadata.outputState).toBe("Agent Session/Replay Contract Preview");
    expect(metadata.status).toBe("replayable");
    expect(metadata.replaySource).toBe("fixture");
    expect(metadata.capabilities.sessionReplay.status).toBe("preview");
    expect(metadata.capabilities.modelLoop.status).toBe("unavailable");
    expect(metadata.capabilities.providerRequest.status).toBe("unavailable");
    expect(metadata.capabilities.patchApply.status).toBe("unavailable");
    expect(metadata.capabilities.execute.status).toBe("unavailable");
    expect(metadata.capabilities.cookieReader.status).toBe("unavailable");
    expect(metadata.capabilities.persistence.status).toBe("unavailable");
  });

  it("keeps replay capability statuses explicit", () => {
    const statuses: AgentReplayCapabilityStatus[] = ["preview", "reserved", "unavailable", "blocked", "degraded"];

    expect(statuses).toContain("preview");
    expect(statuses).toContain("reserved");
    expect(statuses).toContain("unavailable");
    expect(statuses).toContain("blocked");
    expect(statuses).toContain("degraded");
  });

  it("classifies sensitive replay payloads for redaction", () => {
    const classifications: AgentReplayPrivacyClassification[] = [
      "public",
      "local-note",
      "cookie",
      "secret",
      "user-input",
      "derived-evidence",
      "runtime-metadata",
    ];

    expect(classifications).toContain("cookie");
    expect(classifications).toContain("secret");
    expect(classifications).toContain("local-note");
  });

  it("allows metadata to be assembled as a serializable contract", () => {
    const metadata = {
      sessionId: "session:p8",
      workspaceId: "workspace:p3379",
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
      phase: "P8 Agent Session / Replay Contract Freeze",
      inputState: "OI Research/Solution Skill Contract Preview",
      outputState: "Agent Session/Replay Contract Preview",
      status: "replayable",
      privacyPolicyId: "privacy:p8-preview",
      replaySource: "fixture",
      capabilities: {
        sessionReplay: { status: "preview", reason: "p8_contract_preview" },
        modelLoop: { status: "unavailable", reason: "model_loop_not_in_p8" },
        providerRequest: { status: "unavailable", reason: "provider_request_not_in_p8" },
        patchApply: { status: "unavailable", reason: "patch_apply_not_in_p8" },
        execute: { status: "unavailable", reason: "execute_not_in_p8" },
        cookieReader: { status: "unavailable", reason: "cookie_reader_not_in_p8" },
        persistence: { status: "unavailable", reason: "persistence_not_in_p8" },
      },
    } satisfies AgentSessionMetadata;

    expect(JSON.parse(JSON.stringify(metadata)).sessionId).toBe("session:p8");
  });
});
