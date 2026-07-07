import { describe, expect, it } from "vitest";

import {
  DURABLE_SESSION_SCHEMA_VERSION,
  P12_DURABLE_SESSION_INPUT_STATE,
  P12_DURABLE_SESSION_OUTPUT_STATE,
  P12_DURABLE_SESSION_PHASE_NAME,
  createDurableAgentEventLogEntry,
  createDurableAgentSessionMetadata,
  sortDurableEventsForReplay,
  validateDurableEventLogSequence,
  validateDurableSchemaVersion,
} from "./durableSessionTypes";
import type {
  DurableAgentEventLogEntry,
  DurableAgentEventRedactionClass,
  DurableAgentReplayVisibility,
  DurableAgentSessionMetadata,
} from "./durableSessionTypes";

describe("P12 durable session contract types", () => {
  it("creates durable session metadata with all frozen P12 fields", () => {
    const metadata = createDurableAgentSessionMetadata({
      sessionId: "session:p12:1",
      createdAt: "2026-07-07T00:00:00.000Z",
      updatedAt: "2026-07-07T00:00:00.000Z",
      runtimeVersion: "p12-preview",
      workspaceRefs: ["workspace:general:1"],
      evidenceRefs: ["evidence:source:1"],
      modelRefs: ["model:gpt-preview"],
      providerRefs: ["provider:openai-compatible"],
      toolRefs: ["tool:read-only-preview"],
      permissionDecisionRefs: ["permission:read-only:1"],
      observationRefs: ["observation:redacted:1"],
      requestLogRefs: ["request-log:safe:1"],
      replayCheckpointRefs: ["checkpoint:p12:1"],
      privacyPolicyId: "privacy:p12-safe-metadata",
      redactionPolicyId: "redaction:p12-summary-only",
      storageAdapterKind: "in-memory-preview",
      capabilityStatuses: {
        durableSessionMetadata: { status: "preview", reason: "p12_contract_only" },
        requestLogPersistence: { status: "reserved", reason: "future_task" },
        replayPersistence: { status: "reserved", reason: "future_task" },
        storageAdapter: { status: "unavailable", reason: "no_real_storage_adapter_in_task_1" },
      },
    });

    expect(metadata).toEqual({
      sessionId: "session:p12:1",
      schemaVersion: DURABLE_SESSION_SCHEMA_VERSION,
      createdAt: "2026-07-07T00:00:00.000Z",
      updatedAt: "2026-07-07T00:00:00.000Z",
      phaseName: "P12 Durable Session / Request Log / Replay Persistence Contract Freeze",
      inputState: "Multi-Step Model Loop / Tool-Call Continuation Contract Preview",
      outputState: "Durable Session / Request Log / Replay Persistence Contract Preview",
      runtimeVersion: "p12-preview",
      workspaceRefs: ["workspace:general:1"],
      evidenceRefs: ["evidence:source:1"],
      modelRefs: ["model:gpt-preview"],
      providerRefs: ["provider:openai-compatible"],
      toolRefs: ["tool:read-only-preview"],
      permissionDecisionRefs: ["permission:read-only:1"],
      observationRefs: ["observation:redacted:1"],
      requestLogRefs: ["request-log:safe:1"],
      replayCheckpointRefs: ["checkpoint:p12:1"],
      privacyPolicyId: "privacy:p12-safe-metadata",
      redactionPolicyId: "redaction:p12-summary-only",
      storageAdapterKind: "in-memory-preview",
      capabilityStatuses: {
        durableSessionMetadata: { status: "preview", reason: "p12_contract_only" },
        requestLogPersistence: { status: "reserved", reason: "future_task" },
        replayPersistence: { status: "reserved", reason: "future_task" },
        storageAdapter: { status: "unavailable", reason: "no_real_storage_adapter_in_task_1" },
      },
    } satisfies DurableAgentSessionMetadata);
    expect(metadata.phaseName).toBe(P12_DURABLE_SESSION_PHASE_NAME);
    expect(metadata.inputState).toBe(P12_DURABLE_SESSION_INPUT_STATE);
    expect(metadata.outputState).toBe(P12_DURABLE_SESSION_OUTPUT_STATE);
  });

  it("creates durable event log entries with sequence, ids, redaction, replay visibility, summary and refs", () => {
    const redactionClass = "derived-evidence" satisfies DurableAgentEventRedactionClass;
    const replayVisibility = "timeline-visible" satisfies DurableAgentReplayVisibility;
    const event = createDurableAgentEventLogEntry({
      eventId: "event:p12:2",
      sessionId: "session:p12:1",
      turnId: "turn:p12:1",
      stepId: "step:p12:1",
      sequence: 2,
      eventType: "observation.added",
      createdAt: "2026-07-07T00:00:02.000Z",
      redactionClass,
      replayVisibility,
      summary: "Bounded redacted evidence summary.",
      refs: {
        workspaceRefs: ["workspace:general:1"],
        evidenceRefs: ["evidence:source:1"],
        modelRefs: ["model:gpt-preview"],
        providerRefs: ["provider:openai-compatible"],
        toolRefs: ["tool:read-only-preview"],
        permissionDecisionRefs: ["permission:read-only:1"],
        observationRefs: ["observation:redacted:1"],
        requestLogRefs: ["request-log:safe:1"],
        replayCheckpointRefs: ["checkpoint:p12:1"],
      },
    });

    expect(event).toEqual({
      eventId: "event:p12:2",
      sessionId: "session:p12:1",
      turnId: "turn:p12:1",
      stepId: "step:p12:1",
      sequence: 2,
      eventType: "observation.added",
      createdAt: "2026-07-07T00:00:02.000Z",
      schemaVersion: DURABLE_SESSION_SCHEMA_VERSION,
      redactionClass: "derived-evidence",
      replayVisibility: "timeline-visible",
      summary: "Bounded redacted evidence summary.",
      refs: {
        workspaceRefs: ["workspace:general:1"],
        evidenceRefs: ["evidence:source:1"],
        modelRefs: ["model:gpt-preview"],
        providerRefs: ["provider:openai-compatible"],
        toolRefs: ["tool:read-only-preview"],
        permissionDecisionRefs: ["permission:read-only:1"],
        observationRefs: ["observation:redacted:1"],
        requestLogRefs: ["request-log:safe:1"],
        replayCheckpointRefs: ["checkpoint:p12:1"],
      },
    } satisfies DurableAgentEventLogEntry);
  });

  it("orders replay by monotonic sequence instead of timestamps", () => {
    const laterTimestampFirstSequence = createDurableAgentEventLogEntry({
      eventId: "event:p12:1",
      sessionId: "session:p12:ordered",
      turnId: "turn:p12:ordered",
      sequence: 1,
      eventType: "turn.started",
      createdAt: "2026-07-07T00:00:30.000Z",
      redactionClass: "safe-metadata",
      replayVisibility: "timeline-visible",
      summary: "Turn started.",
      refs: {},
    });
    const earlierTimestampSecondSequence = createDurableAgentEventLogEntry({
      eventId: "event:p12:2",
      sessionId: "session:p12:ordered",
      turnId: "turn:p12:ordered",
      sequence: 2,
      eventType: "step.started",
      createdAt: "2026-07-07T00:00:01.000Z",
      redactionClass: "safe-metadata",
      replayVisibility: "timeline-visible",
      summary: "Step started.",
      refs: {},
    });

    expect(sortDurableEventsForReplay([earlierTimestampSecondSequence, laterTimestampFirstSequence])).toEqual([
      laterTimestampFirstSequence,
      earlierTimestampSecondSequence,
    ]);
    expect(validateDurableEventLogSequence([laterTimestampFirstSequence, earlierTimestampSecondSequence])).toEqual({
      ok: true,
      orderedEventIds: ["event:p12:1", "event:p12:2"],
    });
  });

  it("returns structured schema support results", () => {
    expect(validateDurableSchemaVersion(DURABLE_SESSION_SCHEMA_VERSION)).toEqual({
      ok: true,
      schemaVersion: DURABLE_SESSION_SCHEMA_VERSION,
    });
    expect(validateDurableSchemaVersion(999)).toEqual({
      ok: false,
      reason: "unsupported-schema-version",
      schemaVersion: 999,
      supportedSchemaVersions: [DURABLE_SESSION_SCHEMA_VERSION],
    });
  });

  it("reports duplicate and gapped event sequences as read-only structured failures", () => {
    const base = createDurableAgentEventLogEntry({
      eventId: "event:p12:1",
      sessionId: "session:p12:sequence",
      turnId: "turn:p12:sequence",
      sequence: 1,
      eventType: "turn.started",
      createdAt: "2026-07-07T00:00:01.000Z",
      redactionClass: "safe-metadata",
      replayVisibility: "timeline-visible",
      summary: "Turn started.",
      refs: {},
    });

    expect(
      validateDurableEventLogSequence([
        base,
        {
          ...base,
          eventId: "event:p12:duplicate",
          sequence: 1,
        },
      ]),
    ).toEqual({
      ok: false,
      reason: "duplicate-sequence",
      sequence: 1,
      eventIds: ["event:p12:1", "event:p12:duplicate"],
    });

    expect(
      validateDurableEventLogSequence([
        base,
        {
          ...base,
          eventId: "event:p12:gapped",
          sequence: 3,
        },
      ]),
    ).toEqual({
      ok: false,
      reason: "sequence-gap",
      expectedSequence: 2,
      actualSequence: 3,
      eventId: "event:p12:gapped",
    });
  });

  it("freezes the exact P12 output state", () => {
    expect(P12_DURABLE_SESSION_OUTPUT_STATE).toBe(
      "Durable Session / Request Log / Replay Persistence Contract Preview",
    );
  });
});
