import { describe, expect, it, vi } from "vitest";

import {
  DURABLE_SESSION_SCHEMA_VERSION,
  createDurableAgentEventLogEntry,
  createDurableAgentSessionMetadata,
} from "./durableSessionTypes";
import type {
  DurableAgentEventLogEntry,
  DurableAgentSessionMetadata,
} from "./durableSessionTypes";
import type { AgentSessionStoreCheckpoint } from "./inMemorySessionStore";
import { MODEL_LOOP_OUTPUT_STATE } from "./modelLoopTypes";
import {
  P12_REPLAY_PROJECTOR_VERSION,
  projectDurableReplayLog,
} from "./replayPersistenceProjector";

function createMetadata(sessionId = "session:p12:replay"): DurableAgentSessionMetadata {
  return createDurableAgentSessionMetadata({
    sessionId,
    createdAt: "2026-07-08T00:00:00.000Z",
    updatedAt: "2026-07-08T00:00:12.000Z",
    runtimeVersion: "p12-replay-preview",
    workspaceRefs: ["workspace:general:1"],
    evidenceRefs: ["evidence:summary:1"],
    modelRefs: ["model:preview"],
    providerRefs: ["provider:preview"],
    toolRefs: ["tool:readonly-preview"],
    permissionDecisionRefs: ["permission:p12:1"],
    observationRefs: ["observation:p12:1"],
    requestLogRefs: ["request-log:p12:1"],
    replayCheckpointRefs: ["checkpoint:p12:1"],
    privacyPolicyId: "privacy:p12-safe-metadata",
    redactionPolicyId: "redaction:p12-summary-only",
    storageAdapterKind: "in-memory-preview",
    capabilityStatuses: {
      durableSessionMetadata: { status: "preview", reason: "contract" },
      requestLogPersistence: { status: "preview", reason: "safe_metadata_only" },
      replayPersistence: { status: "preview", reason: "pure_projector" },
      storageAdapter: { status: "preview", reason: "in_memory_only" },
    },
  });
}

function createEvent(
  sequence: number,
  eventType: DurableAgentEventLogEntry["eventType"],
  overrides: Partial<DurableAgentEventLogEntry> = {},
): DurableAgentEventLogEntry {
  const sessionId = overrides.sessionId ?? "session:p12:replay";
  const turnId = overrides.turnId ?? "turn:p12:1";
  const stepId =
    overrides.stepId ??
    (eventType === "turn.started" || eventType === "turn.completed" ? undefined : "step:p12:1");

  return createDurableAgentEventLogEntry({
    eventId: `event:p12:${sequence}`,
    sessionId,
    turnId,
    stepId,
    sequence,
    eventType,
    createdAt: `2026-07-08T00:00:${String(20 - sequence).padStart(2, "0")}.000Z`,
    redactionClass: "safe-metadata",
    replayVisibility: "timeline-visible",
    summary: `Safe replay summary ${sequence}.`,
    refs: {
      toolRefs: ["tool-call:p12:1"],
      permissionDecisionRefs: ["permission:p12:1"],
      observationRefs: ["observation:p12:1"],
      requestLogRefs: ["request-log:p12:1"],
    },
    ...overrides,
  });
}

function createReplayEvents(): DurableAgentEventLogEntry[] {
  return [
    createEvent(1, "turn.started"),
    createEvent(2, "step.started"),
    createEvent(3, "model.tool_call.requested"),
    createEvent(4, "tool_call.normalized"),
    createEvent(5, "permission.required"),
    createEvent(6, "permission.resolved"),
    createEvent(7, "tool.lifecycle.started"),
    createEvent(8, "tool.lifecycle.completed"),
    createEvent(9, "observation.added"),
    createEvent(10, "step.completed"),
    createEvent(11, "turn.completed"),
  ];
}

function createCheckpoint(overrides: Partial<AgentSessionStoreCheckpoint> = {}): AgentSessionStoreCheckpoint {
  return {
    checkpointId: "checkpoint:p12:1",
    sessionId: "session:p12:replay",
    turnId: "turn:p12:1",
    eventSequenceRange: { from: 1, to: 11 },
    summary: "Safe compacted checkpoint summary.",
    droppedEventIds: [],
    retainedRefs: ["workspace:general:1", "request-log:p12:1"],
    redactionPolicyId: "redaction:p12-summary-only",
    schemaVersion: DURABLE_SESSION_SCHEMA_VERSION,
    createdAt: "2026-07-08T00:00:13.000Z",
    projectorVersion: P12_REPLAY_PROJECTOR_VERSION,
    privacyClass: "safe-metadata",
    ...overrides,
  };
}

describe("P12 replay persistence projector", () => {
  it("projects ordered durable events into a P11-style turn, step, tool, permission and observation timeline", () => {
    const metadata = createMetadata();

    const result = projectDurableReplayLog({
      metadata,
      events: createReplayEvents(),
      checkpoints: [createCheckpoint()],
    });

    expect(result).toMatchObject({
      ok: true,
      projectorVersion: P12_REPLAY_PROJECTOR_VERSION,
      sessionId: metadata.sessionId,
      outputState: "Durable Session / Request Log / Replay Persistence Contract Preview",
      migrationStrategy: {
        mode: "read-only-plan",
        executed: false,
      },
    });
    expect(result.ok && result.modelLoop.turn).toEqual({
      turnId: "turn:p12:1",
      maxSteps: 1,
      currentStep: 1,
      attempt: 1,
      status: "completed",
      terminalStatus: "completed",
      outputState: MODEL_LOOP_OUTPUT_STATE,
    });
    expect(result.ok && result.modelLoop.events).toEqual([
      {
        type: "turn.started",
        sequence: 1,
        turnId: "turn:p12:1",
        stepId: undefined,
        toolCallId: undefined,
        permissionDecisionId: undefined,
        observationId: undefined,
        outputState: MODEL_LOOP_OUTPUT_STATE,
      },
      {
        type: "step.started",
        sequence: 2,
        turnId: "turn:p12:1",
        stepId: "step:p12:1",
        toolCallId: undefined,
        permissionDecisionId: undefined,
        observationId: undefined,
        outputState: MODEL_LOOP_OUTPUT_STATE,
      },
      {
        type: "model.tool_call.requested",
        sequence: 3,
        turnId: "turn:p12:1",
        stepId: "step:p12:1",
        toolCallId: "tool-call:p12:1",
        permissionDecisionId: undefined,
        observationId: undefined,
        outputState: MODEL_LOOP_OUTPUT_STATE,
      },
      {
        type: "tool_call.normalized",
        sequence: 4,
        turnId: "turn:p12:1",
        stepId: "step:p12:1",
        toolCallId: "tool-call:p12:1",
        permissionDecisionId: undefined,
        observationId: undefined,
        outputState: MODEL_LOOP_OUTPUT_STATE,
      },
      {
        type: "permission.required",
        sequence: 5,
        turnId: "turn:p12:1",
        stepId: "step:p12:1",
        toolCallId: "tool-call:p12:1",
        permissionDecisionId: "permission:p12:1",
        observationId: undefined,
        outputState: MODEL_LOOP_OUTPUT_STATE,
      },
      {
        type: "permission.resolved",
        sequence: 6,
        turnId: "turn:p12:1",
        stepId: "step:p12:1",
        toolCallId: "tool-call:p12:1",
        permissionDecisionId: "permission:p12:1",
        observationId: undefined,
        outputState: MODEL_LOOP_OUTPUT_STATE,
      },
      {
        type: "tool.lifecycle.started",
        sequence: 7,
        turnId: "turn:p12:1",
        stepId: "step:p12:1",
        toolCallId: "tool-call:p12:1",
        permissionDecisionId: "permission:p12:1",
        observationId: undefined,
        outputState: MODEL_LOOP_OUTPUT_STATE,
      },
      {
        type: "tool.lifecycle.completed",
        sequence: 8,
        turnId: "turn:p12:1",
        stepId: "step:p12:1",
        toolCallId: "tool-call:p12:1",
        permissionDecisionId: "permission:p12:1",
        observationId: undefined,
        outputState: MODEL_LOOP_OUTPUT_STATE,
      },
      {
        type: "observation.added",
        sequence: 9,
        turnId: "turn:p12:1",
        stepId: "step:p12:1",
        toolCallId: "tool-call:p12:1",
        permissionDecisionId: "permission:p12:1",
        observationId: "observation:p12:1",
        outputState: MODEL_LOOP_OUTPUT_STATE,
      },
      {
        type: "step.completed",
        sequence: 10,
        turnId: "turn:p12:1",
        stepId: "step:p12:1",
        toolCallId: undefined,
        permissionDecisionId: undefined,
        observationId: undefined,
        outputState: MODEL_LOOP_OUTPUT_STATE,
      },
      {
        type: "turn.completed",
        sequence: 11,
        turnId: "turn:p12:1",
        stepId: undefined,
        toolCallId: undefined,
        permissionDecisionId: undefined,
        observationId: undefined,
        outputState: MODEL_LOOP_OUTPUT_STATE,
      },
    ]);
    expect(result.ok && result.timeline.map((event) => event.eventId)).toEqual([
      "event:p12:1",
      "event:p12:2",
      "event:p12:3",
      "event:p12:4",
      "event:p12:5",
      "event:p12:6",
      "event:p12:7",
      "event:p12:8",
      "event:p12:9",
      "event:p12:10",
      "event:p12:11",
    ]);
  });

  it("returns structured failures for duplicate sequence, missing sequence, session mismatch, step mismatch, unknown schema, redaction violation and corrupt checkpoint", () => {
    const metadata = createMetadata();
    const validEvents = createReplayEvents();

    expect(
      projectDurableReplayLog({
        metadata,
        events: [validEvents[0], { ...validEvents[1], sequence: 1, eventId: "event:p12:duplicate" }],
        checkpoints: [],
      }),
    ).toEqual({
      ok: false,
      reason: "duplicate-sequence",
      sequence: 1,
      eventIds: ["event:p12:1", "event:p12:duplicate"],
    });
    expect(
      projectDurableReplayLog({
        metadata,
        events: [validEvents[0], { ...validEvents[1], sequence: 3 }],
        checkpoints: [],
      }),
    ).toEqual({
      ok: false,
      reason: "sequence-gap",
      expectedSequence: 2,
      actualSequence: 3,
      eventId: "event:p12:2",
    });
    expect(
      projectDurableReplayLog({
        metadata,
        events: [{ ...validEvents[0], sessionId: "session:p12:other" }],
        checkpoints: [],
      }),
    ).toEqual({
      ok: false,
      reason: "session-mismatch",
      expectedSessionId: metadata.sessionId,
      actualSessionId: "session:p12:other",
      recordId: "event:p12:1",
    });
    expect(
      projectDurableReplayLog({
        metadata,
        events: [
          createEvent(1, "turn.started"),
          createEvent(2, "step.started", { stepId: "step:p12:1" }),
          createEvent(3, "tool.lifecycle.started", { stepId: "step:p12:2" }),
        ],
        checkpoints: [],
      }),
    ).toEqual({
      ok: false,
      reason: "step-mismatch",
      expectedStepId: "step:p12:1",
      actualStepId: "step:p12:2",
      eventId: "event:p12:3",
    });
    expect(
      projectDurableReplayLog({
        metadata,
        events: [{ ...validEvents[0], schemaVersion: 999 }],
        checkpoints: [],
      }),
    ).toEqual({
      ok: false,
      reason: "unsupported-schema-version",
      schemaVersion: 999,
      supportedSchemaVersions: [DURABLE_SESSION_SCHEMA_VERSION],
      recordId: "event:p12:1",
    });
    expect(
      projectDurableReplayLog({
        metadata,
        events: [createEvent(1, "turn.started", { redactionClass: "provider-payload" })],
        checkpoints: [],
      }),
    ).toEqual({
      ok: false,
      reason: "redaction-policy-violation",
      eventId: "event:p12:1",
      redactionClass: "provider-payload",
      replayVisibility: "timeline-visible",
    });
    expect(
      projectDurableReplayLog({
        metadata,
        events: validEvents,
        checkpoints: [{ ...createCheckpoint(), schemaVersion: 999 } as AgentSessionStoreCheckpoint],
      }),
    ).toEqual({
      ok: false,
      reason: "corrupt-checkpoint",
      checkpointId: "checkpoint:p12:1",
      corruption: {
        reason: "unsupported-schema-version",
        schemaVersion: 999,
      },
    });
  });

  it("uses sequence rather than timestamp for replay ordering", () => {
    const metadata = createMetadata();
    const result = projectDurableReplayLog({
      metadata,
      events: [...createReplayEvents()].reverse(),
      checkpoints: [],
    });

    expect(result.ok && result.timeline.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(result.ok && result.timeline[0].createdAt).toBe("2026-07-08T00:00:19.000Z");
  });

  it("does not invoke tool transport, provider request, patch apply, write, delete, rollback, execute or Cookie reader hooks during replay", () => {
    const poisonHook = vi.fn(() => {
      throw new Error("replay must remain read-only");
    });

    const result = projectDurableReplayLog({
      metadata: createMetadata(),
      events: createReplayEvents(),
      checkpoints: [],
      readOnlyGuards: {
        runTool: poisonHook,
        providerRequest: poisonHook,
        applyPatch: poisonHook,
        writeFile: poisonHook,
        removeFile: poisonHook,
        rollback: poisonHook,
        execute: poisonHook,
        cookieReader: poisonHook,
      },
    });

    expect(result.ok).toBe(true);
    expect(poisonHook).not.toHaveBeenCalled();
  });

  it("reports migration strategy as read-only plan metadata without executing migration", () => {
    const migrate = vi.fn(() => {
      throw new Error("migration execution is forbidden in P12 replay");
    });

    const result = projectDurableReplayLog({
      metadata: createMetadata(),
      events: createReplayEvents(),
      checkpoints: [],
      migrationPlan: {
        fromSchemaVersion: 1,
        toSchemaVersion: 1,
        strategy: "append-only",
        description: "No migration required for current schema.",
        executeMigration: migrate,
      },
    });

    expect(result.ok && result.migrationStrategy).toEqual({
      mode: "read-only-plan",
      executed: false,
      fromSchemaVersion: 1,
      toSchemaVersion: 1,
      strategy: "append-only",
      description: "No migration required for current schema.",
    });
    expect(migrate).not.toHaveBeenCalled();
  });
});
