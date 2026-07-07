import { describe, expect, it } from "vitest";

import {
  MODEL_LOOP_OUTPUT_STATE,
  createModelLoopEventSequence,
  createModelLoopTurnContract,
} from "./modelLoopTypes";
import type { ModelLoopEventType, ModelLoopTerminalStatus, ModelLoopTurnContract } from "./modelLoopTypes";

describe("P11 model loop contract types", () => {
  it("creates a P11 turn contract without claiming mature autonomous execution", () => {
    const turn = createModelLoopTurnContract({
      turnId: "turn:p11:1",
      maxSteps: 3,
      currentStep: 1,
      attempt: 1,
      status: "running",
      terminalStatus: null,
    });

    expect(turn).toEqual({
      turnId: "turn:p11:1",
      maxSteps: 3,
      currentStep: 1,
      attempt: 1,
      status: "running",
      terminalStatus: null,
      outputState: "Multi-Step Model Loop / Tool-Call Continuation Contract Preview",
    } satisfies ModelLoopTurnContract);
    expect(turn.outputState).toBe(MODEL_LOOP_OUTPUT_STATE);
  });

  it("defines deterministic event ordering for tool-call continuation preview", () => {
    const events = createModelLoopEventSequence({
      turnId: "turn:p11:1",
      stepId: "step:p11:1",
      toolCallId: "tool-call:p11:1",
      permissionDecisionId: "permission:p11:1",
      observationId: "observation:p11:1",
    });

    const eventTypes = events.map((event) => event.type);
    const expectedOrder = [
      "turn.started",
      "step.started",
      "model.tool_call.requested",
      "tool_call.normalized",
      "permission.required",
      "permission.resolved",
      "tool.lifecycle.started",
      "tool.lifecycle.completed",
      "observation.added",
      "step.completed",
      "turn.completed",
    ] satisfies ModelLoopEventType[];

    expect(eventTypes).toEqual(expectedOrder);
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("covers P11 terminal statuses as explicit taxonomy", () => {
    const statuses = [
      "completed",
      "failed",
      "cancelled",
      "interrupted",
      "blocked-by-permission",
      "step-limit-exceeded",
      "redaction-blocked",
      "unsupported-tool",
    ] satisfies ModelLoopTerminalStatus[];

    expect(statuses).toEqual([
      "completed",
      "failed",
      "cancelled",
      "interrupted",
      "blocked-by-permission",
      "step-limit-exceeded",
      "redaction-blocked",
      "unsupported-tool",
    ]);
  });

  it("keeps the serialized contract preview-safe and non-secret", () => {
    const turn = createModelLoopTurnContract({
      turnId: "turn:p11:safe",
      maxSteps: 2,
      currentStep: 0,
      attempt: 0,
      status: "created",
      terminalStatus: null,
    });
    const events = createModelLoopEventSequence({
      turnId: turn.turnId,
      stepId: "step:p11:safe",
      toolCallId: "tool-call:p11:safe",
      permissionDecisionId: "permission:p11:safe",
      observationId: "observation:p11:safe",
    });

    const serialized = JSON.stringify({ turn, events });
    const forbiddenSensitiveTerms = [
      "API " + "key",
      "Authori" + "zation",
      "coo" + "kie",
      "raw provider " + "payload",
    ];
    const forbiddenMatureClaims = [
      "production" + "-ready",
      "ready" + ": true",
      "is" + "Ready: true",
      "AI 大升级" + "完成",
      "L5 Agent " + "完成",
      "Codex-style runtime " + "完成",
    ];

    for (const term of [...forbiddenSensitiveTerms, ...forbiddenMatureClaims]) {
      expect(serialized).not.toContain(term);
    }
  });
});
