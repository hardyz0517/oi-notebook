import type { AgentEventType, AgentReplayRedaction, AgentSessionMetadata } from "./agentTypes";

export type AgentReplayFailureReason =
  | "event-order-invalid"
  | "event-session-mismatch"
  | "checkpoint-missing"
  | "checkpoint-session-mismatch"
  | "redaction-policy-violation"
  | "unsupported-event-type"
  | "reserved-capability-event"
  | "unavailable-capability-event"
  | "replay-fixture-invalid";

export type AgentReplayEventLogEntry = {
  id: string;
  type: AgentEventType;
  sessionId: string;
  at: string;
  sequence: number;
  source: "runtime" | "tool" | "permission" | "workspace" | "fixture";
  payload: Record<string, unknown>;
  redaction: AgentReplayRedaction;
  causationId?: string;
  correlationId?: string;
};

export type AgentReplayCheckpoint = {
  checkpointId: string;
  sessionId: string;
  afterSequence: number;
  workspaceSnapshot: Record<string, unknown>;
  evidenceSnapshot: Record<string, unknown>;
  skillSnapshot: Record<string, unknown>;
  capabilitySnapshot: AgentSessionMetadata["capabilities"];
  privacySnapshot: Record<string, unknown>;
};

export type AgentReplayFixture = {
  metadata: AgentSessionMetadata;
  events: AgentReplayEventLogEntry[];
  checkpoints: AgentReplayCheckpoint[];
};

export type AgentReplayReadModel = {
  sessionId: string;
  workspaceId: string;
  status: "completed" | "failed";
  outputState: "Agent Session/Replay Contract Preview";
  eventCount: number;
  evidenceIds: string[];
  workspaceIds: string[];
  checkpointIds: string[];
  capabilityStatuses: AgentSessionMetadata["capabilities"];
  failureReasons: AgentReplayFailureReason[];
};

const knownEventTypes = new Set<AgentEventType>([
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
]);

const reservedCapabilityEventTypes = new Set<AgentEventType>(["model.delta", "patch.generated"]);
const unavailableCapabilityEventTypes = new Set<AgentEventType>(["patch.applied"]);

const addReason = (reasons: AgentReplayFailureReason[], reason: AgentReplayFailureReason): void => {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
};

const hasOrderedSequences = (events: AgentReplayEventLogEntry[]): boolean =>
  events.every((entry, index) => Number.isInteger(entry.sequence) && entry.sequence > 0 && (index === 0 || entry.sequence > events[index - 1].sequence));

const valuesFromPayload = (entry: AgentReplayEventLogEntry, key: string): string[] => {
  const value = entry.payload[key];

  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  return [];
};

const unique = (items: string[]): string[] => Array.from(new Set(items));

const orderedEventsForProjection = (events: AgentReplayEventLogEntry[]): AgentReplayEventLogEntry[] =>
  [...events].sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id));

const exposesSensitivePayload = (redaction: AgentReplayRedaction): boolean =>
  (redaction.classification === "cookie" || redaction.classification === "secret" || redaction.classification === "local-note") &&
  redaction.visibility === "ui-visible";

export function replayAgentSession(fixture: AgentReplayFixture): AgentReplayReadModel {
  const failureReasons: AgentReplayFailureReason[] = [];

  if (!fixture.metadata.sessionId || !fixture.metadata.workspaceId) {
    addReason(failureReasons, "replay-fixture-invalid");
  }

  if (!hasOrderedSequences(fixture.events)) {
    addReason(failureReasons, "event-order-invalid");
  }

  if (fixture.events.some((entry) => entry.sessionId !== fixture.metadata.sessionId)) {
    addReason(failureReasons, "event-session-mismatch");
  }

  if (fixture.events.some((entry) => !knownEventTypes.has(entry.type))) {
    addReason(failureReasons, "unsupported-event-type");
  }

  if (fixture.events.some((entry) => reservedCapabilityEventTypes.has(entry.type))) {
    addReason(failureReasons, "reserved-capability-event");
  }

  if (fixture.events.some((entry) => unavailableCapabilityEventTypes.has(entry.type))) {
    addReason(failureReasons, "unavailable-capability-event");
  }

  if (fixture.events.some((entry) => exposesSensitivePayload(entry.redaction))) {
    addReason(failureReasons, "redaction-policy-violation");
  }

  if (fixture.metadata.replaySource === "checkpoint" && fixture.checkpoints.length === 0) {
    addReason(failureReasons, "checkpoint-missing");
  }

  if (fixture.checkpoints.some((checkpoint) => checkpoint.sessionId !== fixture.metadata.sessionId)) {
    addReason(failureReasons, "checkpoint-session-mismatch");
  }

  const events = orderedEventsForProjection(fixture.events);

  return {
    sessionId: fixture.metadata.sessionId,
    workspaceId: fixture.metadata.workspaceId,
    status: failureReasons.length > 0 ? "failed" : "completed",
    outputState: "Agent Session/Replay Contract Preview",
    eventCount: fixture.events.length,
    evidenceIds: unique(events.flatMap((entry) => valuesFromPayload(entry, "evidenceIds"))),
    workspaceIds: unique([fixture.metadata.workspaceId, ...events.flatMap((entry) => valuesFromPayload(entry, "workspaceId"))]),
    checkpointIds: fixture.checkpoints.map((checkpoint) => checkpoint.checkpointId),
    capabilityStatuses: fixture.metadata.capabilities,
    failureReasons,
  };
}
