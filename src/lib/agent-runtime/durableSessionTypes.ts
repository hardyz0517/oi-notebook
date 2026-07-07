export const DURABLE_SESSION_SCHEMA_VERSION = 1 as const;
export const SUPPORTED_DURABLE_SESSION_SCHEMA_VERSIONS = [DURABLE_SESSION_SCHEMA_VERSION] as const;

export const P12_DURABLE_SESSION_PHASE_NAME =
  "P12 Durable Session / Request Log / Replay Persistence Contract Freeze" as const;
export const P12_DURABLE_SESSION_INPUT_STATE =
  "Multi-Step Model Loop / Tool-Call Continuation Contract Preview" as const;
export const P12_DURABLE_SESSION_OUTPUT_STATE =
  "Durable Session / Request Log / Replay Persistence Contract Preview" as const;

export type DurableSessionSchemaVersion = typeof DURABLE_SESSION_SCHEMA_VERSION;
export type P12DurableSessionPhaseName = typeof P12_DURABLE_SESSION_PHASE_NAME;
export type P12DurableSessionInputState = typeof P12_DURABLE_SESSION_INPUT_STATE;
export type P12DurableSessionOutputState = typeof P12_DURABLE_SESSION_OUTPUT_STATE;

export type DurableAgentCapabilityStatus = "preview" | "reserved" | "unavailable" | "blocked";

export type DurableAgentCapability = {
  status: DurableAgentCapabilityStatus;
  reason: string;
};

export type DurableAgentCapabilityStatuses = {
  durableSessionMetadata: DurableAgentCapability;
  requestLogPersistence: DurableAgentCapability;
  replayPersistence: DurableAgentCapability;
  storageAdapter: DurableAgentCapability;
  [capabilityName: string]: DurableAgentCapability;
};

export type DurableAgentStorageAdapterKind = "in-memory-preview" | "fixture-preview" | "future-adapter" | "unavailable";

export type DurableAgentSessionMetadata = {
  sessionId: string;
  schemaVersion: DurableSessionSchemaVersion;
  createdAt: string;
  updatedAt: string;
  phaseName: P12DurableSessionPhaseName;
  inputState: P12DurableSessionInputState;
  outputState: P12DurableSessionOutputState;
  runtimeVersion: string;
  workspaceRefs: string[];
  evidenceRefs: string[];
  modelRefs: string[];
  providerRefs: string[];
  toolRefs: string[];
  permissionDecisionRefs: string[];
  observationRefs: string[];
  requestLogRefs: string[];
  replayCheckpointRefs: string[];
  privacyPolicyId: string;
  redactionPolicyId: string;
  storageAdapterKind: DurableAgentStorageAdapterKind;
  capabilityStatuses: DurableAgentCapabilityStatuses;
};

export type CreateDurableAgentSessionMetadataInput = Omit<
  DurableAgentSessionMetadata,
  "schemaVersion" | "phaseName" | "inputState" | "outputState"
> & {
  schemaVersion?: DurableSessionSchemaVersion;
};

export type DurableAgentEventRedactionClass =
  | "secret"
  | "cookie"
  | "local-note"
  | "user-input"
  | "derived-evidence"
  | "provider-payload"
  | "tool-output"
  | "safe-metadata";

export type DurableAgentReplayVisibility =
  | "timeline-visible"
  | "summary-only"
  | "redacted"
  | "runtime-only"
  | "quarantined";

export type DurableAgentEventType =
  | "turn.started"
  | "step.started"
  | "model.tool_call.requested"
  | "tool_call.normalized"
  | "permission.required"
  | "permission.resolved"
  | "tool.lifecycle.started"
  | "tool.lifecycle.completed"
  | "tool.lifecycle.failed"
  | "tool.lifecycle.unavailable"
  | "observation.added"
  | "step.completed"
  | "turn.completed"
  | "schema.unsupported"
  | "redaction.blocked";

export type DurableAgentEventRefs = {
  workspaceRefs?: string[];
  evidenceRefs?: string[];
  modelRefs?: string[];
  providerRefs?: string[];
  toolRefs?: string[];
  permissionDecisionRefs?: string[];
  observationRefs?: string[];
  requestLogRefs?: string[];
  replayCheckpointRefs?: string[];
};

export type DurableAgentEventLogEntry = {
  eventId: string;
  sessionId: string;
  turnId: string;
  stepId?: string;
  sequence: number;
  eventType: DurableAgentEventType;
  createdAt: string;
  schemaVersion: DurableSessionSchemaVersion;
  redactionClass: DurableAgentEventRedactionClass;
  replayVisibility: DurableAgentReplayVisibility;
  summary: string;
  refs: DurableAgentEventRefs;
};

export type CreateDurableAgentEventLogEntryInput = Omit<DurableAgentEventLogEntry, "schemaVersion"> & {
  schemaVersion?: DurableSessionSchemaVersion;
};

export type DurableSchemaVersionValidationResult =
  | {
      ok: true;
      schemaVersion: DurableSessionSchemaVersion;
    }
  | {
      ok: false;
      reason: "unsupported-schema-version";
      schemaVersion: number;
      supportedSchemaVersions: DurableSessionSchemaVersion[];
    };

export type DurableEventLogSequenceValidationResult =
  | {
      ok: true;
      orderedEventIds: string[];
    }
  | {
      ok: false;
      reason: "invalid-sequence";
      eventId: string;
      sequence: number;
    }
  | {
      ok: false;
      reason: "duplicate-sequence";
      sequence: number;
      eventIds: string[];
    }
  | {
      ok: false;
      reason: "sequence-gap";
      expectedSequence: number;
      actualSequence: number;
      eventId: string;
    };

export function createDurableAgentSessionMetadata(
  input: CreateDurableAgentSessionMetadataInput,
): DurableAgentSessionMetadata {
  return {
    ...input,
    schemaVersion: input.schemaVersion ?? DURABLE_SESSION_SCHEMA_VERSION,
    phaseName: P12_DURABLE_SESSION_PHASE_NAME,
    inputState: P12_DURABLE_SESSION_INPUT_STATE,
    outputState: P12_DURABLE_SESSION_OUTPUT_STATE,
  };
}

export function createDurableAgentEventLogEntry(
  input: CreateDurableAgentEventLogEntryInput,
): DurableAgentEventLogEntry {
  return {
    ...input,
    schemaVersion: input.schemaVersion ?? DURABLE_SESSION_SCHEMA_VERSION,
  };
}

export function validateDurableSchemaVersion(schemaVersion: number): DurableSchemaVersionValidationResult {
  if (schemaVersion === DURABLE_SESSION_SCHEMA_VERSION) {
    return {
      ok: true,
      schemaVersion: DURABLE_SESSION_SCHEMA_VERSION,
    };
  }

  return {
    ok: false,
    reason: "unsupported-schema-version",
    schemaVersion,
    supportedSchemaVersions: [...SUPPORTED_DURABLE_SESSION_SCHEMA_VERSIONS],
  };
}

export function sortDurableEventsForReplay(events: DurableAgentEventLogEntry[]): DurableAgentEventLogEntry[] {
  return [...events].sort((left, right) => left.sequence - right.sequence);
}

export function validateDurableEventLogSequence(
  events: DurableAgentEventLogEntry[],
): DurableEventLogSequenceValidationResult {
  const orderedEvents = sortDurableEventsForReplay(events);
  const eventsBySequence = new Map<number, DurableAgentEventLogEntry[]>();

  for (const event of orderedEvents) {
    if (!Number.isInteger(event.sequence) || event.sequence < 1) {
      return {
        ok: false,
        reason: "invalid-sequence",
        eventId: event.eventId,
        sequence: event.sequence,
      };
    }

    const existingEvents = eventsBySequence.get(event.sequence) ?? [];
    eventsBySequence.set(event.sequence, [...existingEvents, event]);
  }

  for (const [sequence, eventsWithSequence] of eventsBySequence) {
    if (eventsWithSequence.length > 1) {
      return {
        ok: false,
        reason: "duplicate-sequence",
        sequence,
        eventIds: eventsWithSequence.map((event) => event.eventId),
      };
    }
  }

  for (const [index, event] of orderedEvents.entries()) {
    const expectedSequence = index + 1;

    if (event.sequence !== expectedSequence) {
      return {
        ok: false,
        reason: "sequence-gap",
        expectedSequence,
        actualSequence: event.sequence,
        eventId: event.eventId,
      };
    }
  }

  return {
    ok: true,
    orderedEventIds: orderedEvents.map((event) => event.eventId),
  };
}
