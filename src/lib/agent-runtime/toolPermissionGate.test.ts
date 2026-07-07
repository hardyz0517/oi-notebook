import { describe, expect, it } from "vitest";

import { createToolLifecycleStarted } from "./toolContinuationLifecycle";
import { createDefaultToolContinuationRegistry } from "./toolContinuationRegistry";
import {
  createPermissionDecisionEvent,
  decideToolPermission,
  type ToolPermissionDecisionStatus,
  type ToolPermissionKind,
} from "./toolPermissionGate";

const P11_PERMISSION_KINDS: ToolPermissionKind[] = [
  "read",
  "local-note-search",
  "public-network",
  "cookie-network",
  "write",
  "patch-apply",
  "execute",
  "delete",
  "rollback",
  "destructive",
];

describe("P11 tool permission gate", () => {
  it("covers every P11 permission kind with an explicit preview decision", () => {
    const decisions = P11_PERMISSION_KINDS.map((kind) => decideToolPermission({ kind }));

    expect(decisions.map((decision) => decision.kind)).toEqual(P11_PERMISSION_KINDS);
    expect(decisions.every((decision) => decision.outputState)).toBe(true);
    expect(decisions.every((decision) => decision.reason.length > 0)).toBe(true);
  });

  it("auto-allows fixture and explicit-context reads only inside the P11 preview boundary", () => {
    expect(decideToolPermission({ kind: "read", source: "fixture" })).toMatchObject({
      kind: "read",
      status: "auto-allowed",
      canExecuteInP11: true,
      scope: "fixture",
    });
    expect(decideToolPermission({ kind: "read", source: "explicit-context" })).toMatchObject({
      kind: "read",
      status: "auto-allowed",
      canExecuteInP11: true,
      scope: "explicit-context",
    });
  });

  it("keeps public network at prompt-required or unavailable and never executes network requests in P11", () => {
    const decision = decideToolPermission({ kind: "public-network" });
    const allowedStatuses: ToolPermissionDecisionStatus[] = ["prompt-required", "unavailable"];

    expect(allowedStatuses).toContain(decision.status);
    expect(decision.canExecuteInP11).toBe(false);
    expect(decision.reason).toContain("no_real_network");
  });

  it("keeps cookie-backed, mutation, patch, execution, delete, rollback and destructive capabilities unavailable", () => {
    const forbiddenKinds: ToolPermissionKind[] = [
      "cookie-network",
      "write",
      "patch-apply",
      "execute",
      "delete",
      "rollback",
      "destructive",
    ];
    const forbiddenStatuses: ToolPermissionDecisionStatus[] = ["unavailable", "reserved", "denied"];

    for (const kind of forbiddenKinds) {
      const decision = decideToolPermission({ kind });

      expect(forbiddenStatuses).toContain(decision.status);
      expect(decision.canExecuteInP11).toBe(false);
      expect(decision.requiresApprovalUi).toBe(false);
    }
  });

  it("emits permission decisions before lifecycle events", () => {
    const permissionEvent = createPermissionDecisionEvent({
      sequence: 30,
      turnId: "turn-1",
      stepId: "step-1",
      toolCallId: "tool-call-1",
      toolName: "read-current-context.preview",
      decision: decideToolPermission({ kind: "read", source: "explicit-context" }),
      at: "2026-07-07T00:00:00.000Z",
    });
    const lifecycleEvent = createToolLifecycleStarted({
      sequence: 31,
      turnId: "turn-1",
      stepId: "step-1",
      toolCallId: "tool-call-1",
      toolName: "read-current-context.preview",
      transport: "read-only-preview",
      at: "2026-07-07T00:00:01.000Z",
    });

    expect(permissionEvent.eventType).toBe("permission.resolved");
    expect(permissionEvent.sequence).toBeLessThan(lifecycleEvent.sequence);
    expect(lifecycleEvent.eventType).toBe("tool.lifecycle.started");
  });

  it("lets registry metadata expose permission kind without implying execution", () => {
    const registry = createDefaultToolContinuationRegistry();
    const tools = registry.list();

    expect(tools.map((tool) => tool.permission.kind)).toEqual(["read", "local-note-search", "read", "read"]);
    expect(tools.every((tool) => tool.transport === "mock-preview" || tool.transport === "read-only-preview")).toBe(true);
    expect(
      tools.every((tool) => {
        const decision = decideToolPermission({
          kind: tool.permission.kind,
          source: tool.permission.kind === "read" ? "explicit-context" : "default",
        });

        return tool.permission.kind === decision.kind && decision.canExecuteInP11 === (tool.permission.kind === "read");
      }),
    ).toBe(true);
  });
});
