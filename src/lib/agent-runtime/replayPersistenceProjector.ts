import {
  DURABLE_SESSION_SCHEMA_VERSION,
  P12_DURABLE_SESSION_OUTPUT_STATE,
  sortDurableEventsForReplay,
  validateDurableEventLogSequence,
  validateDurableSchemaVersion,
} from "./durableSessionTypes";
import type {
  DurableAgentEventLogEntry,
  DurableAgentEventRedactionClass,
  DurableAgentReplayVisibility,
  DurableAgentSessionMetadata,
  DurableEventLogSequenceValidationResult,
  DurableSessionSchemaVersion,
} from "./durableSessionTypes";
import type { AgentSessionStoreCheckpoint } from "./inMemorySessionStore";
import {
  MODEL_LOOP_OUTPUT_STATE,
  createModelLoopTurnContract,
} from "./modelLoopTypes";
import type {
  ModelLoopEvent,
  ModelLoopEventType,
  ModelLoopTerminalStatus,
  ModelLoopTurnContract,
  ModelLoopTurnStatus,
} from "./modelLoopTypes";

export const P12_REPLAY_PROJECTOR_VERSION = "p12-replay-projector-v1" as const;

type ReplayReadOnlyGuard = () => unknown;

export type ReplayPersistenceReadOnlyGuards = {
  runTool?: ReplayReadOnlyGuard;
  providerRequest?: ReplayReadOnlyGuard;
  applyPatch?: ReplayReadOnlyGuard;
  writeFile?: ReplayReadOnlyGuard;
  removeFile?: ReplayReadOnlyGuard;
  rollback?: ReplayReadOnlyGuard;
  execute?: ReplayReadOnlyGuard;
  cookieReader?: ReplayReadOnlyGuard;
};

export type ReplayPersistenceMigrationPlan = {
  fromSchemaVersion: number;
  toSchemaVersion: DurableSessionSchemaVersion;
  strategy: "append-only" | "copy-on-write" | "none";
  description: string;
  executeMigration?: () => unknown;
};

export type ReplayPersistenceMigrationStrategyReadModel = {
  mode: "read-only-plan";
  executed: false;
  fromSchemaVersion: number;
  toSchemaVersion: DurableSessionSchemaVersion;
  strategy: ReplayPersistenceMigrationPlan["strategy"];
  description: string;
};

export type ReplayPersistenceTimelineEvent = {
  eventId: string;
  type: ModelLoopEventType;
  sequence: number;
  turnId: string;
  stepId?: string;
  createdAt: string;
  summary: string;
  redactionClass: DurableAgentEventRedactionClass;
  replayVisibility: DurableAgentReplayVisibility;
  refs: DurableAgentEventLogEntry["refs"];
};

export type ReplayPersistenceModelLoopReadModel = {
  turn: ModelLoopTurnContract;
  events: ModelLoopEvent[];
};

export type ReplayPersistenceProjectionSuccess = {
  ok: true;
  projectorVersion: typeof P12_REPLAY_PROJECTOR_VERSION;
  sessionId: string;
  outputState: typeof P12_DURABLE_SESSION_OUTPUT_STATE;
  modelLoop: ReplayPersistenceModelLoopReadModel;
  timeline: ReplayPersistenceTimelineEvent[];
  checkpoints: ReplayPersistenceCheckpointReadModel[];
  migrationStrategy: ReplayPersistenceMigrationStrategyReadModel;
};

export type ReplayPersistenceCheckpointReadModel = {
  checkpointId: string;
  turnId: string;
  eventSequenceRange: AgentSessionStoreCheckpoint["eventSequenceRange"];
  summary: string;
  retainedRefs: string[];
  projectorVersion: string;
  createdAt: string;
  privacyClass: AgentSessionStoreCheckpoint["privacyClass"];
};

export type ReplayPersistenceSchemaFailure = {
  ok: false;
  reason: "unsupported-schema-version";
  schemaVersion: number;
  supportedSchemaVersions: DurableSessionSchemaVersion[];
  recordId: string;
};

export type ReplayPersistenceSessionMismatchFailure = {
  ok: false;
  reason: "session-mismatch";
  expectedSessionId: string;
  actualSessionId: string;
  recordId: string;
};

export type ReplayPersistenceStepMismatchFailure = {
  ok: false;
  reason: "step-mismatch";
  expectedStepId: string;
  actualStepId: string;
  eventId: string;
};

export type ReplayPersistenceRedactionViolationFailure = {
  ok: false;
  reason: "redaction-policy-violation";
  eventId: string;
  redactionClass: DurableAgentEventRedactionClass;
  replayVisibility: DurableAgentReplayVisibility;
};

export type ReplayPersistenceCorruptCheckpointFailure = {
  ok: false;
  reason: "corrupt-checkpoint";
  checkpointId: string;
  corruption:
    | {
        reason: "session-mismatch";
        expectedSessionId: string;
        actualSessionId: string;
      }
    | {
        reason: "unsupported-schema-version";
        schemaVersion: number;
      }
    | {
        reason: "redaction-policy-mismatch";
        expectedRedactionPolicyId: string;
        actualRedactionPolicyId: string;
      }
    | {
        reason: "invalid-sequence-range";
        from: number;
        to: number;
      };
};

export type ReplayPersistenceProjectionFailure =
  | Exclude<DurableEventLogSequenceValidationResult, { ok: true }>
  | ReplayPersistenceSchemaFailure
  | ReplayPersistenceSessionMismatchFailure
  | ReplayPersistenceStepMismatchFailure
  | ReplayPersistenceRedactionViolationFailure
  | ReplayPersistenceCorruptCheckpointFailure;

export type ReplayPersistenceProjectionResult =
  | ReplayPersistenceProjectionSuccess
  | ReplayPersistenceProjectionFailure;

export type ProjectDurableReplayLogInput = {
  metadata: DurableAgentSessionMetadata;
  events: DurableAgentEventLogEntry[];
  checkpoints: AgentSessionStoreCheckpoint[];
  migrationPlan?: ReplayPersistenceMigrationPlan;
  readOnlyGuards?: ReplayPersistenceReadOnlyGuards;
};

const MODEL_LOOP_EVENT_TYPES = new Set<ModelLoopEventType>([
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
]);

const REPLAY_SAFE_REDACTION_CLASSES = new Set<DurableAgentEventRedactionClass>([
  "safe-metadata",
  "derived-evidence",
  "user-input",
]);

export function projectDurableReplayLog(input: ProjectDurableReplayLogInput): ReplayPersistenceProjectionResult {
  const metadataSchemaFailure = validateProjectorSchemaVersion(
    input.metadata.schemaVersion,
    input.metadata.sessionId,
  );
  if (metadataSchemaFailure !== undefined) {
    return metadataSchemaFailure;
  }

  for (const event of input.events) {
    const eventFailure = validateEventForReplay(input.metadata, event);
    if (eventFailure !== undefined) {
      return eventFailure;
    }
  }

  const sequenceResult = validateDurableEventLogSequence(input.events);
  if (!sequenceResult.ok) {
    return sequenceResult;
  }

  for (const checkpoint of input.checkpoints) {
    const checkpointFailure = validateCheckpointForReplay(input.metadata, checkpoint);
    if (checkpointFailure !== undefined) {
      return checkpointFailure;
    }
  }

  const orderedEvents = sortDurableEventsForReplay(input.events);
  const stepFailure = validateStepContinuity(orderedEvents);
  if (stepFailure !== undefined) {
    return stepFailure;
  }

  const modelLoopEvents = orderedEvents.map(projectModelLoopEvent);
  const turn = createModelLoopTurnContract({
    turnId: orderedEvents[0]?.turnId ?? "turn:p12:empty",
    maxSteps: countUniqueStepIds(orderedEvents),
    currentStep: countCompletedSteps(orderedEvents),
    attempt: 1,
    status: projectTurnStatus(orderedEvents),
    terminalStatus: projectTerminalStatus(orderedEvents),
  });

  return {
    ok: true,
    projectorVersion: P12_REPLAY_PROJECTOR_VERSION,
    sessionId: input.metadata.sessionId,
    outputState: P12_DURABLE_SESSION_OUTPUT_STATE,
    modelLoop: {
      turn,
      events: modelLoopEvents,
    },
    timeline: orderedEvents.map(projectTimelineEvent),
    checkpoints: input.checkpoints.map(projectCheckpointReadModel),
    migrationStrategy: projectMigrationStrategy(input.migrationPlan),
  };
}

function validateProjectorSchemaVersion(
  schemaVersion: number,
  recordId: string,
): ReplayPersistenceSchemaFailure | undefined {
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

function validateEventForReplay(
  metadata: DurableAgentSessionMetadata,
  event: DurableAgentEventLogEntry,
): ReplayPersistenceProjectionFailure | undefined {
  if (event.sessionId !== metadata.sessionId) {
    return {
      ok: false,
      reason: "session-mismatch",
      expectedSessionId: metadata.sessionId,
      actualSessionId: event.sessionId,
      recordId: event.eventId,
    };
  }

  const schemaFailure = validateProjectorSchemaVersion(event.schemaVersion, event.eventId);
  if (schemaFailure !== undefined) {
    return schemaFailure;
  }

  if (!REPLAY_SAFE_REDACTION_CLASSES.has(event.redactionClass) || event.replayVisibility === "runtime-only") {
    return {
      ok: false,
      reason: "redaction-policy-violation",
      eventId: event.eventId,
      redactionClass: event.redactionClass,
      replayVisibility: event.replayVisibility,
    };
  }

  return undefined;
}

function validateCheckpointForReplay(
  metadata: DurableAgentSessionMetadata,
  checkpoint: AgentSessionStoreCheckpoint,
): ReplayPersistenceCorruptCheckpointFailure | undefined {
  if (checkpoint.sessionId !== metadata.sessionId) {
    return {
      ok: false,
      reason: "corrupt-checkpoint",
      checkpointId: checkpoint.checkpointId,
      corruption: {
        reason: "session-mismatch",
        expectedSessionId: metadata.sessionId,
        actualSessionId: checkpoint.sessionId,
      },
    };
  }

  if (checkpoint.schemaVersion !== DURABLE_SESSION_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: "corrupt-checkpoint",
      checkpointId: checkpoint.checkpointId,
      corruption: {
        reason: "unsupported-schema-version",
        schemaVersion: checkpoint.schemaVersion,
      },
    };
  }

  if (checkpoint.redactionPolicyId !== metadata.redactionPolicyId) {
    return {
      ok: false,
      reason: "corrupt-checkpoint",
      checkpointId: checkpoint.checkpointId,
      corruption: {
        reason: "redaction-policy-mismatch",
        expectedRedactionPolicyId: metadata.redactionPolicyId,
        actualRedactionPolicyId: checkpoint.redactionPolicyId,
      },
    };
  }

  if (
    !Number.isInteger(checkpoint.eventSequenceRange.from) ||
    !Number.isInteger(checkpoint.eventSequenceRange.to) ||
    checkpoint.eventSequenceRange.from < 1 ||
    checkpoint.eventSequenceRange.to < checkpoint.eventSequenceRange.from
  ) {
    return {
      ok: false,
      reason: "corrupt-checkpoint",
      checkpointId: checkpoint.checkpointId,
      corruption: {
        reason: "invalid-sequence-range",
        from: checkpoint.eventSequenceRange.from,
        to: checkpoint.eventSequenceRange.to,
      },
    };
  }

  return undefined;
}

function validateStepContinuity(
  orderedEvents: DurableAgentEventLogEntry[],
): ReplayPersistenceStepMismatchFailure | undefined {
  let activeStepId: string | undefined;

  for (const event of orderedEvents) {
    if (event.eventType === "step.started") {
      activeStepId = event.stepId;
      continue;
    }

    if (event.stepId !== undefined && activeStepId !== undefined && event.stepId !== activeStepId) {
      return {
        ok: false,
        reason: "step-mismatch",
        expectedStepId: activeStepId,
        actualStepId: event.stepId,
        eventId: event.eventId,
      };
    }

    if (event.eventType === "step.completed") {
      activeStepId = undefined;
    }
  }

  return undefined;
}

function projectModelLoopEvent(event: DurableAgentEventLogEntry): ModelLoopEvent {
  const type = projectModelLoopEventType(event.eventType);

  return {
    type,
    sequence: event.sequence,
    turnId: event.turnId,
    stepId: projectStepId(type, event.stepId),
    toolCallId: projectToolCallId(type, event),
    permissionDecisionId: projectPermissionDecisionId(type, event),
    observationId: type === "observation.added" ? event.refs.observationRefs?.[0] : undefined,
    outputState: MODEL_LOOP_OUTPUT_STATE,
  };
}

function projectTimelineEvent(event: DurableAgentEventLogEntry): ReplayPersistenceTimelineEvent {
  const type = projectModelLoopEventType(event.eventType);

  return {
    eventId: event.eventId,
    type,
    sequence: event.sequence,
    turnId: event.turnId,
    stepId: event.stepId,
    createdAt: event.createdAt,
    summary: event.summary,
    redactionClass: event.redactionClass,
    replayVisibility: event.replayVisibility,
    refs: cloneEventRefs(event.refs),
  };
}

function projectModelLoopEventType(eventType: DurableAgentEventLogEntry["eventType"]): ModelLoopEventType {
  if (isModelLoopEventType(eventType)) {
    return eventType;
  }

  return "observation.added";
}

function isModelLoopEventType(eventType: DurableAgentEventLogEntry["eventType"]): eventType is ModelLoopEventType {
  return MODEL_LOOP_EVENT_TYPES.has(eventType as ModelLoopEventType);
}

function projectCheckpointReadModel(
  checkpoint: AgentSessionStoreCheckpoint,
): ReplayPersistenceCheckpointReadModel {
  return {
    checkpointId: checkpoint.checkpointId,
    turnId: checkpoint.turnId,
    eventSequenceRange: { ...checkpoint.eventSequenceRange },
    summary: checkpoint.summary,
    retainedRefs: [...checkpoint.retainedRefs],
    projectorVersion: checkpoint.projectorVersion,
    createdAt: checkpoint.createdAt,
    privacyClass: checkpoint.privacyClass,
  };
}

function projectMigrationStrategy(
  migrationPlan: ReplayPersistenceMigrationPlan | undefined,
): ReplayPersistenceMigrationStrategyReadModel {
  return {
    mode: "read-only-plan",
    executed: false,
    fromSchemaVersion: migrationPlan?.fromSchemaVersion ?? DURABLE_SESSION_SCHEMA_VERSION,
    toSchemaVersion: migrationPlan?.toSchemaVersion ?? DURABLE_SESSION_SCHEMA_VERSION,
    strategy: migrationPlan?.strategy ?? "none",
    description: migrationPlan?.description ?? "No migration required for supported P12 replay schema.",
  };
}

function projectStepId(type: ModelLoopEventType, stepId: string | undefined): string | undefined {
  return type === "turn.started" || type === "turn.completed" ? undefined : stepId;
}

function projectToolCallId(
  type: ModelLoopEventType,
  event: DurableAgentEventLogEntry,
): string | undefined {
  if (
    type === "model.tool_call.requested" ||
    type === "tool_call.normalized" ||
    type === "permission.required" ||
    type === "permission.resolved" ||
    type === "tool.lifecycle.started" ||
    type === "tool.lifecycle.completed" ||
    type === "observation.added"
  ) {
    return event.refs.toolRefs?.[0];
  }

  return undefined;
}

function projectPermissionDecisionId(
  type: ModelLoopEventType,
  event: DurableAgentEventLogEntry,
): string | undefined {
  if (
    type === "permission.required" ||
    type === "permission.resolved" ||
    type === "tool.lifecycle.started" ||
    type === "tool.lifecycle.completed" ||
    type === "observation.added"
  ) {
    return event.refs.permissionDecisionRefs?.[0];
  }

  return undefined;
}

function projectTurnStatus(orderedEvents: DurableAgentEventLogEntry[]): ModelLoopTurnStatus {
  const lastEvent = orderedEvents[orderedEvents.length - 1];

  if (lastEvent?.eventType === "turn.completed") {
    return "completed";
  }

  if (orderedEvents.some((event) => event.eventType === "redaction.blocked")) {
    return "blocked";
  }

  if (orderedEvents.some((event) => event.eventType === "tool.lifecycle.failed")) {
    return "failed";
  }

  return orderedEvents.length === 0 ? "created" : "running";
}

function projectTerminalStatus(orderedEvents: DurableAgentEventLogEntry[]): ModelLoopTerminalStatus | null {
  const lastEvent = orderedEvents[orderedEvents.length - 1];

  if (lastEvent?.eventType === "turn.completed") {
    return "completed";
  }

  if (orderedEvents.some((event) => event.eventType === "redaction.blocked")) {
    return "redaction-blocked";
  }

  if (orderedEvents.some((event) => event.eventType === "schema.unsupported")) {
    return "failed";
  }

  if (orderedEvents.some((event) => event.eventType === "tool.lifecycle.unavailable")) {
    return "unsupported-tool";
  }

  if (orderedEvents.some((event) => event.eventType === "tool.lifecycle.failed")) {
    return "failed";
  }

  return null;
}

function countUniqueStepIds(events: DurableAgentEventLogEntry[]): number {
  return new Set(events.flatMap((event) => (event.stepId === undefined ? [] : [event.stepId]))).size;
}

function countCompletedSteps(events: DurableAgentEventLogEntry[]): number {
  return events.filter((event) => event.eventType === "step.completed").length;
}

function cloneEventRefs(refs: DurableAgentEventLogEntry["refs"]): DurableAgentEventLogEntry["refs"] {
  return {
    workspaceRefs: refs.workspaceRefs === undefined ? undefined : [...refs.workspaceRefs],
    evidenceRefs: refs.evidenceRefs === undefined ? undefined : [...refs.evidenceRefs],
    modelRefs: refs.modelRefs === undefined ? undefined : [...refs.modelRefs],
    providerRefs: refs.providerRefs === undefined ? undefined : [...refs.providerRefs],
    toolRefs: refs.toolRefs === undefined ? undefined : [...refs.toolRefs],
    permissionDecisionRefs:
      refs.permissionDecisionRefs === undefined ? undefined : [...refs.permissionDecisionRefs],
    observationRefs: refs.observationRefs === undefined ? undefined : [...refs.observationRefs],
    requestLogRefs: refs.requestLogRefs === undefined ? undefined : [...refs.requestLogRefs],
    replayCheckpointRefs:
      refs.replayCheckpointRefs === undefined ? undefined : [...refs.replayCheckpointRefs],
  };
}
