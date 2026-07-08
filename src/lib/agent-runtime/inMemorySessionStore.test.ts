import { describe, expect, it } from "vitest";

import {
  createInMemoryAgentSessionStore,
  type AgentSessionStoreCheckpoint,
} from "./inMemorySessionStore";
import {
  DURABLE_SESSION_SCHEMA_VERSION,
  createDurableAgentEventLogEntry,
  createDurableAgentSessionMetadata,
} from "./durableSessionTypes";
import { redactRequestLogValue } from "./requestLogPolicy";

function createMetadata(sessionId = "session:p12:memory") {
  return createDurableAgentSessionMetadata({
    sessionId,
    createdAt: "2026-07-08T00:00:00.000Z",
    updatedAt: "2026-07-08T00:00:00.000Z",
    runtimeVersion: "p12-in-memory-preview",
    workspaceRefs: ["workspace:general:1"],
    evidenceRefs: ["evidence:summary:1"],
    modelRefs: ["model:preview"],
    providerRefs: ["provider:preview"],
    toolRefs: ["tool:readonly"],
    permissionDecisionRefs: ["permission:readonly:1"],
    observationRefs: ["observation:redacted:1"],
    requestLogRefs: ["request-log:p12:1"],
    replayCheckpointRefs: ["checkpoint:p12:1"],
    privacyPolicyId: "privacy:p12-safe-metadata",
    redactionPolicyId: "redaction:p12-summary-only",
    storageAdapterKind: "in-memory-preview",
    capabilityStatuses: {
      durableSessionMetadata: { status: "preview", reason: "in_memory_contract" },
      requestLogPersistence: { status: "preview", reason: "in_memory_contract" },
      replayPersistence: { status: "reserved", reason: "future_projector_task" },
      storageAdapter: { status: "preview", reason: "arrays_and_maps_only" },
    },
  });
}

function createEvent(sessionId: string, sequence: number, eventId = `event:p12:${sequence}`) {
  return createDurableAgentEventLogEntry({
    eventId,
    sessionId,
    turnId: "turn:p12:1",
    stepId: "step:p12:1",
    sequence,
    eventType: sequence === 1 ? "turn.started" : "observation.added",
    createdAt: `2026-07-08T00:00:0${sequence}.000Z`,
    redactionClass: "safe-metadata",
    replayVisibility: "timeline-visible",
    summary: `Safe event ${sequence}.`,
    refs: {
      workspaceRefs: ["workspace:general:1"],
    },
  });
}

function createCheckpoint(sessionId: string): AgentSessionStoreCheckpoint {
  return {
    checkpointId: "checkpoint:p12:1",
    sessionId,
    turnId: "turn:p12:1",
    eventSequenceRange: { from: 1, to: 2 },
    summary: "Safe compacted checkpoint summary.",
    droppedEventIds: [],
    retainedRefs: ["workspace:general:1"],
    redactionPolicyId: "redaction:p12-summary-only",
    schemaVersion: DURABLE_SESSION_SCHEMA_VERSION,
    createdAt: "2026-07-08T00:00:03.000Z",
    projectorVersion: "p12-projector-preview",
    privacyClass: "safe-metadata",
  };
}

describe("P12 in-memory session store contract", () => {
  it("appends event log entries and reads session metadata, ordered events, checkpoints, and request audit records", () => {
    const metadata = createMetadata();
    const checkpoint = createCheckpoint(metadata.sessionId);
    const store = createInMemoryAgentSessionStore({
      sessions: [metadata],
      checkpoints: [checkpoint],
    });

    expect(store.storageAdapterKind).toBe("in-memory-preview");
    expect(store.readSessionMetadata(metadata.sessionId)).toEqual({ ok: true, metadata });

    expect(store.appendEventLogEntry(metadata.sessionId, createEvent(metadata.sessionId, 1))).toEqual({
      ok: true,
      eventId: "event:p12:1",
    });
    expect(store.appendEventLogEntry(metadata.sessionId, createEvent(metadata.sessionId, 2))).toEqual({
      ok: true,
      eventId: "event:p12:2",
    });

    expect(store.readOrderedEvents(metadata.sessionId)).toEqual({
      ok: true,
      events: [createEvent(metadata.sessionId, 1), createEvent(metadata.sessionId, 2)],
    });
    expect(store.readCheckpoints(metadata.sessionId)).toEqual({ ok: true, checkpoints: [checkpoint] });

    expect(
      store.appendRequestAuditRecord({
        requestLogId: "request-log:p12:1",
        sessionId: metadata.sessionId,
        turnId: "turn:p12:1",
        stepId: "step:p12:1",
        providerId: "provider:preview",
        modelId: "model:preview",
        requestKind: "model-request",
        permissionDecisionId: "permission:readonly:1",
        redactionDecisionId: "redaction:p12:1",
        secretRefId: "secret-ref:opaque-provider-key",
        contextBuildId: "context:p12:1",
        eventIds: ["event:p12:1", "event:p12:2"],
        safeInputSummary: "Redacted user request summary.",
        safeOutputSummary: "Redacted model response summary.",
        usageSummary: { inputTokens: 4, outputTokens: 8, totalTokens: 12 },
        status: "completed",
        createdAt: "2026-07-08T00:00:04.000Z",
      }),
    ).toEqual({ ok: true, requestLogId: "request-log:p12:1" });

    const records = store.readRequestAuditRecords(metadata.sessionId);
    expect(records).toEqual({
      ok: true,
      records: [
        {
          requestLogId: "request-log:p12:1",
          sessionId: metadata.sessionId,
          turnId: "turn:p12:1",
          stepId: "step:p12:1",
          providerId: "provider:preview",
          modelId: "model:preview",
          requestKind: "model-request",
          permissionDecisionId: "permission:readonly:1",
          redactionDecisionId: "redaction:p12:1",
          secretRefId: "secret-ref:opaque-provider-key",
          contextBuildId: "context:p12:1",
          eventIds: ["event:p12:1", "event:p12:2"],
          safeInputSummary: "Redacted user request summary.",
          safeOutputSummary: "Redacted model response summary.",
          usageSummary: { inputTokens: 4, outputTokens: 8, totalTokens: 12 },
          status: "completed",
          safeError: undefined,
          createdAt: "2026-07-08T00:00:04.000Z",
          schemaVersion: DURABLE_SESSION_SCHEMA_VERSION,
        },
      ],
    });
  });

  it("rejects duplicate sequence, sequence gaps, session mismatch, and unsupported schema version on append", () => {
    const metadata = createMetadata();
    const store = createInMemoryAgentSessionStore({ sessions: [metadata] });

    expect(store.appendEventLogEntry(metadata.sessionId, createEvent(metadata.sessionId, 1))).toEqual({
      ok: true,
      eventId: "event:p12:1",
    });
    expect(store.appendEventLogEntry(metadata.sessionId, createEvent(metadata.sessionId, 1, "event:p12:duplicate"))).toEqual({
      ok: false,
      reason: "duplicate-sequence",
      sequence: 1,
      eventIds: ["event:p12:1", "event:p12:duplicate"],
    });
    expect(store.appendEventLogEntry(metadata.sessionId, createEvent(metadata.sessionId, 3, "event:p12:gapped"))).toEqual({
      ok: false,
      reason: "sequence-gap",
      expectedSequence: 2,
      actualSequence: 3,
      eventId: "event:p12:gapped",
    });
    expect(store.appendEventLogEntry(metadata.sessionId, createEvent("session:p12:other", 2))).toEqual({
      ok: false,
      reason: "session-mismatch",
      expectedSessionId: metadata.sessionId,
      actualSessionId: "session:p12:other",
      recordId: "event:p12:2",
    });
    expect(
      store.appendEventLogEntry(metadata.sessionId, {
        ...createEvent(metadata.sessionId, 2),
        schemaVersion: 999,
      }),
    ).toEqual({
      ok: false,
      reason: "unsupported-schema-version",
      schemaVersion: 999,
      supportedSchemaVersions: [DURABLE_SESSION_SCHEMA_VERSION],
      recordId: "event:p12:2",
    });
  });

  it("keeps data in memory only and returns defensive copies", () => {
    const metadata = createMetadata();
    const store = createInMemoryAgentSessionStore({ sessions: [metadata] });
    const event = createEvent(metadata.sessionId, 1);
    const request = {
      requestLogId: "request-log:p12:copy",
      sessionId: metadata.sessionId,
      turnId: "turn:p12:1",
      providerId: "provider:preview",
      modelId: "model:preview",
      requestKind: "model-request" as const,
      permissionDecisionId: "permission:readonly:1",
      redactionDecisionId: "redaction:p12:copy",
      contextBuildId: "context:p12:copy",
      eventIds: ["event:p12:1"],
      safeInputSummary: "Safe request summary.",
      safeOutputSummary: "Safe response summary.",
      status: "completed" as const,
      createdAt: "2026-07-08T00:00:05.000Z",
    };

    expect(store.appendEventLogEntry(metadata.sessionId, event)).toEqual({ ok: true, eventId: event.eventId });
    expect(store.appendRequestAuditRecord(request)).toEqual({ ok: true, requestLogId: request.requestLogId });

    const { refs: eventReferences } = event;
    const { workspaceRefs: eventWorkspaceReferences } = eventReferences;
    eventWorkspaceReferences?.push("workspace:mutated-after-append");
    request.eventIds.push("event:p12:mutated-after-append");

    const firstRead = store.readOrderedEvents(metadata.sessionId);
    const firstRecords = store.readRequestAuditRecords(metadata.sessionId);
    let firstReadWorkspaceReferences: string[] = [];
    if (firstRead.ok) {
      const [firstEvent] = firstRead.events;
      const { refs: firstEventReferences } = firstEvent;
      firstReadWorkspaceReferences = firstEventReferences.workspaceRefs ?? [];
    }
    expect(firstReadWorkspaceReferences).toEqual(["workspace:general:1"]);
    expect(firstRecords.ok && firstRecords.records[0].eventIds).toEqual(["event:p12:1"]);

    if (firstRead.ok) {
      firstRead.events[0].summary = "mutated read event";
    }
    if (firstRecords.ok) {
      firstRecords.records[0].eventIds.push("mutated-read-record");
    }

    expect(store.readOrderedEvents(metadata.sessionId)).toEqual({
      ok: true,
      events: [createEvent(metadata.sessionId, 1)],
    });
    const secondRecords = store.readRequestAuditRecords(metadata.sessionId);
    expect(secondRecords.ok ? secondRecords.records[0].eventIds : []).toEqual(["event:p12:1"]);
  });

  it("passes request audit records through requestLogPolicy before storage", () => {
    const metadata = createMetadata();
    const store = createInMemoryAgentSessionStore({ sessions: [metadata] });

    expect(
      store.appendRequestAuditRecord({
        requestLogId: "request-log:p12:redacted",
        sessionId: metadata.sessionId,
        turnId: "turn:p12:1",
        providerId: "provider:preview",
        modelId: "model:preview",
        requestKind: "model-request",
        permissionDecisionId: "permission:readonly:1",
        redactionDecisionId: "redaction:p12:redacted",
        secretRefId: "secret-ref:opaque-provider-key",
        contextBuildId: "context:p12:redacted",
        eventIds: [],
        safeInputSummary: redactRequestLogValue({
          redactionClass: "provider-payload",
          value: "raw provider payload with Authorization: Bearer secret and Cookie: sid=secret",
        }),
        safeOutputSummary: redactRequestLogValue({
          redactionClass: "tool-output",
          value: "raw tool output with private notes content",
        }),
        safeError: redactRequestLogValue({
          redactionClass: "secret",
          value: "sk-test-secret-value",
        }),
        status: "failed",
        createdAt: "2026-07-08T00:00:06.000Z",
        unsafeInput: {
          authorizationHeader: "Authorization: Bearer secret",
          cookie: "Cookie: sid=secret",
          rawProviderRequest: "raw provider request",
          rawToolOutput: "raw tool output",
          noteContent: "private notes content",
        },
      }),
    ).toEqual({ ok: true, requestLogId: "request-log:p12:redacted" });

    const records = store.readRequestAuditRecords(metadata.sessionId);
    expect(records.ok && records.records[0].safeInputSummary).toBe("[redacted:provider-payload]");
    expect(records.ok && records.records[0].safeOutputSummary).toBe("[redacted:tool-output]");
    expect(records.ok && records.records[0].safeError).toBe("[redacted:secret]");
    expect(JSON.stringify(records)).toContain("secret-ref:opaque-provider-key");
    expect(JSON.stringify(records)).not.toContain("Bearer secret");
    expect(JSON.stringify(records)).not.toContain("sid=secret");
    expect(JSON.stringify(records)).not.toContain("raw provider request");
    expect(JSON.stringify(records)).not.toContain("raw tool output");
    expect(JSON.stringify(records)).not.toContain("private notes content");
  });

  it("returns structured corruption results instead of repairing or mutating records silently", () => {
    const metadata = createMetadata();
    const duplicate = createEvent(metadata.sessionId, 1, "event:p12:duplicate");
    const store = createInMemoryAgentSessionStore({
      sessions: [metadata],
      unsafeSeedEventsForCorruptionTests: [createEvent(metadata.sessionId, 1), duplicate],
    });

    expect(store.readOrderedEvents(metadata.sessionId)).toEqual({
      ok: false,
      reason: "corrupt-event-log",
      corruption: {
        ok: false,
        reason: "duplicate-sequence",
        sequence: 1,
        eventIds: ["event:p12:1", "event:p12:duplicate"],
      },
    });
    expect(store.readOrderedEvents(metadata.sessionId)).toEqual({
      ok: false,
      reason: "corrupt-event-log",
      corruption: {
        ok: false,
        reason: "duplicate-sequence",
        sequence: 1,
        eventIds: ["event:p12:1", "event:p12:duplicate"],
      },
    });
  });
});
