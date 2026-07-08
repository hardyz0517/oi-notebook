import {
  DURABLE_SESSION_SCHEMA_VERSION,
  type DurableAgentEventLogEntry,
  type DurableAgentStorageAdapterKind,
  type DurableEventLogSequenceValidationResult,
  type DurableSessionSchemaVersion,
  validateDurableEventLogSequence,
  validateDurableSchemaVersion,
  sortDurableEventsForReplay,
} from "./durableSessionTypes";
import type { DurableAgentSessionMetadata } from "./durableSessionTypes";
import {
  createRequestAuditLogRecord,
  type CreateRequestAuditLogRecordInput,
  type RequestAuditLogRecord,
} from "./requestLogPolicy";

export const IN_MEMORY_SESSION_STORE_ADAPTER_KIND = "in-memory-preview" as const;

export type AgentSessionStoreCheckpoint = {
  checkpointId: string;
  sessionId: string;
  turnId: string;
  eventSequenceRange: {
    from: number;
    to: number;
  };
  summary: string;
  droppedEventIds: string[];
  retainedRefs: string[];
  redactionPolicyId: string;
  schemaVersion: DurableSessionSchemaVersion;
  createdAt: string;
  projectorVersion: string;
  privacyClass: "safe-metadata" | "summary-only" | "redacted";
};

export type AgentSessionStoreEventRecord = Omit<DurableAgentEventLogEntry, "schemaVersion"> & {
  schemaVersion: number;
};

export type AgentSessionStoreSchemaVersionFailure = {
  ok: false;
  reason: "unsupported-schema-version";
  schemaVersion: number;
  supportedSchemaVersions: DurableSessionSchemaVersion[];
  recordId: string;
};

export type AgentSessionStoreSessionMismatchFailure = {
  ok: false;
  reason: "session-mismatch";
  expectedSessionId: string;
  actualSessionId: string;
  recordId: string;
};

export type AgentSessionStoreNotFoundFailure = {
  ok: false;
  reason: "session-not-found";
  sessionId: string;
};

export type AgentSessionStoreAppendEventResult =
  | {
      ok: true;
      eventId: string;
    }
  | Exclude<DurableEventLogSequenceValidationResult, { ok: true }>
  | AgentSessionStoreSchemaVersionFailure
  | AgentSessionStoreSessionMismatchFailure
  | AgentSessionStoreNotFoundFailure;

export type AgentSessionStoreReadSessionMetadataResult =
  | {
      ok: true;
      metadata: DurableAgentSessionMetadata;
    }
  | AgentSessionStoreNotFoundFailure
  | AgentSessionStoreSchemaVersionFailure;

export type AgentSessionStoreReadEventsResult =
  | {
      ok: true;
      events: DurableAgentEventLogEntry[];
    }
  | AgentSessionStoreNotFoundFailure
  | {
      ok: false;
      reason: "corrupt-event-log";
      corruption:
        | Exclude<DurableEventLogSequenceValidationResult, { ok: true }>
        | AgentSessionStoreSchemaVersionFailure
        | AgentSessionStoreSessionMismatchFailure;
    };

export type AgentSessionStoreReadCheckpointsResult =
  | {
      ok: true;
      checkpoints: AgentSessionStoreCheckpoint[];
    }
  | AgentSessionStoreNotFoundFailure;

export type AgentSessionStoreAppendRequestAuditRecordResult =
  | {
      ok: true;
      requestLogId: string;
    }
  | AgentSessionStoreSessionMismatchFailure
  | AgentSessionStoreNotFoundFailure;

export type AgentSessionStoreReadRequestAuditRecordsResult =
  | {
      ok: true;
      records: RequestAuditLogRecord[];
    }
  | AgentSessionStoreNotFoundFailure;

export type AgentSessionStore = {
  storageAdapterKind: DurableAgentStorageAdapterKind;
  appendEventLogEntry: (
    sessionId: string,
    entry: AgentSessionStoreEventRecord,
  ) => AgentSessionStoreAppendEventResult;
  readSessionMetadata: (sessionId: string) => AgentSessionStoreReadSessionMetadataResult;
  readOrderedEvents: (sessionId: string) => AgentSessionStoreReadEventsResult;
  readCheckpoints: (sessionId: string) => AgentSessionStoreReadCheckpointsResult;
  appendRequestAuditRecord: (
    input: CreateRequestAuditLogRecordInput,
  ) => AgentSessionStoreAppendRequestAuditRecordResult;
  readRequestAuditRecords: (sessionId: string) => AgentSessionStoreReadRequestAuditRecordsResult;
};

export type CreateInMemoryAgentSessionStoreInput = {
  sessions?: DurableAgentSessionMetadata[];
  checkpoints?: AgentSessionStoreCheckpoint[];
  requestAuditRecords?: RequestAuditLogRecord[];
  unsafeSeedEventsForCorruptionTests?: AgentSessionStoreEventRecord[];
};

export function createInMemoryAgentSessionStore(
  input: CreateInMemoryAgentSessionStoreInput = {},
): AgentSessionStore {
  const sessions = new Map<string, DurableAgentSessionMetadata>();
  const eventsBySessionId = new Map<string, AgentSessionStoreEventRecord[]>();
  const checkpointsBySessionId = new Map<string, AgentSessionStoreCheckpoint[]>();
  const requestAuditRecordsBySessionId = new Map<string, RequestAuditLogRecord[]>();

  for (const metadata of input.sessions ?? []) {
    sessions.set(metadata.sessionId, cloneSessionMetadata(metadata));
  }

  for (const event of input.unsafeSeedEventsForCorruptionTests ?? []) {
    const sessionEvents = eventsBySessionId.get(event.sessionId) ?? [];
    eventsBySessionId.set(event.sessionId, [...sessionEvents, cloneEventRecord(event)]);
  }

  for (const checkpoint of input.checkpoints ?? []) {
    const sessionCheckpoints = checkpointsBySessionId.get(checkpoint.sessionId) ?? [];
    checkpointsBySessionId.set(checkpoint.sessionId, [...sessionCheckpoints, cloneCheckpoint(checkpoint)]);
  }

  for (const record of input.requestAuditRecords ?? []) {
    const sessionRecords = requestAuditRecordsBySessionId.get(record.sessionId) ?? [];
    requestAuditRecordsBySessionId.set(record.sessionId, [...sessionRecords, cloneRequestAuditRecord(record)]);
  }

  return {
    storageAdapterKind: IN_MEMORY_SESSION_STORE_ADAPTER_KIND,
    appendEventLogEntry(sessionId, entry) {
      const sessionFailure = validateKnownSession(sessionId, sessions);
      if (sessionFailure !== undefined) {
        return sessionFailure;
      }

      if (entry.sessionId !== sessionId) {
        return {
          ok: false,
          reason: "session-mismatch",
          expectedSessionId: sessionId,
          actualSessionId: entry.sessionId,
          recordId: entry.eventId,
        };
      }

      const schemaFailure = validateStoreSchemaVersion(entry.schemaVersion, entry.eventId);
      if (schemaFailure !== undefined) {
        return schemaFailure;
      }

      const currentEvents = eventsBySessionId.get(sessionId) ?? [];
      const nextEvents = [...currentEvents, cloneEventRecord(entry)];
      const sequenceResult = validateDurableEventLogSequence(nextEvents as DurableAgentEventLogEntry[]);
      if (!sequenceResult.ok) {
        return sequenceResult;
      }

      eventsBySessionId.set(sessionId, nextEvents);
      return {
        ok: true,
        eventId: entry.eventId,
      };
    },
    readSessionMetadata(sessionId) {
      const metadata = sessions.get(sessionId);
      if (metadata === undefined) {
        return {
          ok: false,
          reason: "session-not-found",
          sessionId,
        };
      }

      const schemaFailure = validateStoreSchemaVersion(metadata.schemaVersion, metadata.sessionId);
      if (schemaFailure !== undefined) {
        return schemaFailure;
      }

      return {
        ok: true,
        metadata: cloneSessionMetadata(metadata),
      };
    },
    readOrderedEvents(sessionId) {
      const sessionFailure = validateKnownSession(sessionId, sessions);
      if (sessionFailure !== undefined) {
        return sessionFailure;
      }

      const events = eventsBySessionId.get(sessionId) ?? [];
      for (const event of events) {
        if (event.sessionId !== sessionId) {
          return {
            ok: false,
            reason: "corrupt-event-log",
            corruption: {
              ok: false,
              reason: "session-mismatch",
              expectedSessionId: sessionId,
              actualSessionId: event.sessionId,
              recordId: event.eventId,
            },
          };
        }

        const schemaFailure = validateStoreSchemaVersion(event.schemaVersion, event.eventId);
        if (schemaFailure !== undefined) {
          return {
            ok: false,
            reason: "corrupt-event-log",
            corruption: schemaFailure,
          };
        }
      }

      const sequenceResult = validateDurableEventLogSequence(events as DurableAgentEventLogEntry[]);
      if (!sequenceResult.ok) {
        return {
          ok: false,
          reason: "corrupt-event-log",
          corruption: sequenceResult,
        };
      }

      return {
        ok: true,
        events: sortDurableEventsForReplay(events as DurableAgentEventLogEntry[]).map((event) =>
          cloneEventRecord(event),
        ),
      };
    },
    readCheckpoints(sessionId) {
      const sessionFailure = validateKnownSession(sessionId, sessions);
      if (sessionFailure !== undefined) {
        return sessionFailure;
      }

      return {
        ok: true,
        checkpoints: (checkpointsBySessionId.get(sessionId) ?? []).map((checkpoint) => cloneCheckpoint(checkpoint)),
      };
    },
    appendRequestAuditRecord(input) {
      const sessionFailure = validateKnownSession(input.sessionId, sessions);
      if (sessionFailure !== undefined) {
        return sessionFailure;
      }

      const record = createRequestAuditLogRecord(input);
      if (record.sessionId !== input.sessionId) {
        return {
          ok: false,
          reason: "session-mismatch",
          expectedSessionId: input.sessionId,
          actualSessionId: record.sessionId,
          recordId: record.requestLogId,
        };
      }

      const currentRecords = requestAuditRecordsBySessionId.get(record.sessionId) ?? [];
      requestAuditRecordsBySessionId.set(record.sessionId, [...currentRecords, cloneRequestAuditRecord(record)]);
      return {
        ok: true,
        requestLogId: record.requestLogId,
      };
    },
    readRequestAuditRecords(sessionId) {
      const sessionFailure = validateKnownSession(sessionId, sessions);
      if (sessionFailure !== undefined) {
        return sessionFailure;
      }

      return {
        ok: true,
        records: (requestAuditRecordsBySessionId.get(sessionId) ?? []).map((record) =>
          cloneRequestAuditRecord(record),
        ),
      };
    },
  };
}

function validateKnownSession(
  sessionId: string,
  sessions: Map<string, DurableAgentSessionMetadata>,
): AgentSessionStoreNotFoundFailure | undefined {
  if (sessions.has(sessionId)) {
    return undefined;
  }

  return {
    ok: false,
    reason: "session-not-found",
    sessionId,
  };
}

function validateStoreSchemaVersion(
  schemaVersion: number,
  recordId: string,
): AgentSessionStoreSchemaVersionFailure | undefined {
  const schemaResult = validateDurableSchemaVersion(schemaVersion);
  if (schemaResult.ok) {
    return undefined;
  }

  return {
    ok: false,
    reason: "unsupported-schema-version",
    schemaVersion: schemaResult.schemaVersion,
    supportedSchemaVersions: schemaResult.supportedSchemaVersions,
    recordId,
  };
}

function cloneSessionMetadata(metadata: DurableAgentSessionMetadata): DurableAgentSessionMetadata {
  return {
    ...metadata,
    workspaceRefs: [...metadata.workspaceRefs],
    evidenceRefs: [...metadata.evidenceRefs],
    modelRefs: [...metadata.modelRefs],
    providerRefs: [...metadata.providerRefs],
    toolRefs: [...metadata.toolRefs],
    permissionDecisionRefs: [...metadata.permissionDecisionRefs],
    observationRefs: [...metadata.observationRefs],
    requestLogRefs: [...metadata.requestLogRefs],
    replayCheckpointRefs: [...metadata.replayCheckpointRefs],
    capabilityStatuses: Object.fromEntries(
      Object.entries(metadata.capabilityStatuses).map(([name, capability]) => [name, { ...capability }]),
    ) as DurableAgentSessionMetadata["capabilityStatuses"],
  };
}

function cloneEventRecord<T extends AgentSessionStoreEventRecord>(event: T): T {
  const { refs: eventReferences } = event;
  const {
    workspaceRefs: workspaceReferences,
    evidenceRefs: evidenceReferences,
    modelRefs: modelReferences,
    providerRefs: providerReferences,
    toolRefs: toolReferences,
    permissionDecisionRefs: permissionDecisionReferences,
    observationRefs: observationReferences,
    requestLogRefs: requestLogReferences,
    replayCheckpointRefs: replayCheckpointReferences,
  } = eventReferences;

  return {
    ...event,
    refs: {
      workspaceRefs: workspaceReferences === undefined ? undefined : [...workspaceReferences],
      evidenceRefs: evidenceReferences === undefined ? undefined : [...evidenceReferences],
      modelRefs: modelReferences === undefined ? undefined : [...modelReferences],
      providerRefs: providerReferences === undefined ? undefined : [...providerReferences],
      toolRefs: toolReferences === undefined ? undefined : [...toolReferences],
      permissionDecisionRefs:
        permissionDecisionReferences === undefined ? undefined : [...permissionDecisionReferences],
      observationRefs: observationReferences === undefined ? undefined : [...observationReferences],
      requestLogRefs: requestLogReferences === undefined ? undefined : [...requestLogReferences],
      replayCheckpointRefs:
        replayCheckpointReferences === undefined ? undefined : [...replayCheckpointReferences],
    },
  };
}

function cloneCheckpoint(checkpoint: AgentSessionStoreCheckpoint): AgentSessionStoreCheckpoint {
  return {
    ...checkpoint,
    eventSequenceRange: { ...checkpoint.eventSequenceRange },
    droppedEventIds: [...checkpoint.droppedEventIds],
    retainedRefs: [...checkpoint.retainedRefs],
  };
}

function cloneRequestAuditRecord(record: RequestAuditLogRecord): RequestAuditLogRecord {
  return createRequestAuditLogRecord({
    ...record,
    eventIds: [...record.eventIds],
    usageSummary: record.usageSummary === undefined ? undefined : { ...record.usageSummary },
    schemaVersion: DURABLE_SESSION_SCHEMA_VERSION,
  });
}
