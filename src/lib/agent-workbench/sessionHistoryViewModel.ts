import { P12_DURABLE_SESSION_OUTPUT_STATE } from "@/lib/agent-runtime/durableSessionTypes";
import type {
  DurableAgentEventLogEntry,
  DurableAgentSessionMetadata,
} from "@/lib/agent-runtime/durableSessionTypes";
import type { AgentSessionStoreCheckpoint } from "@/lib/agent-runtime/inMemorySessionStore";
import type { RequestAuditLogRecord } from "@/lib/agent-runtime/requestLogPolicy";

export type SessionHistoryProjectionWarning = {
  warningId: string;
  severity: "info" | "warning" | "error";
  message: string;
  eventIds: string[];
};

export type SessionHistoryProjectionInput = {
  metadata: DurableAgentSessionMetadata;
  events: DurableAgentEventLogEntry[];
  checkpoints: AgentSessionStoreCheckpoint[];
  requestAuditRecords: RequestAuditLogRecord[];
  corruptionWarnings?: SessionHistoryProjectionWarning[];
};

export type SessionHistoryViewModel = {
  title: typeof P12_DURABLE_SESSION_OUTPUT_STATE;
  outputState: typeof P12_DURABLE_SESSION_OUTPUT_STATE;
  session: {
    sessionId: string;
    createdAt: string;
    updatedAt: string;
    runtimeVersion: string;
    storageAdapterKind: DurableAgentSessionMetadata["storageAdapterKind"];
    privacyPolicyId: string;
    redactionPolicyId: string;
  };
  summary: {
    eventCount: number;
    checkpointCount: number;
    requestAuditRecordCount: number;
    warningCount: number;
  };
  linkage: {
    workspaceRefs: string[];
    evidenceRefs: string[];
    modelRefs: string[];
    providerRefs: string[];
    toolRefs: string[];
    permissionDecisionRefs: string[];
    observationRefs: string[];
    requestLogRefs: string[];
    replayCheckpointRefs: string[];
  };
  capabilities: DurableAgentSessionMetadata["capabilityStatuses"];
  timeline: SessionHistoryTimelineItem[];
  checkpoints: SessionHistoryCheckpointItem[];
  requestAuditTrail: SessionHistoryRequestAuditItem[];
  corruptionWarnings: SessionHistoryProjectionWarning[];
};

export type SessionHistoryTimelineItem = {
  eventId: string;
  sequence: number;
  eventType: DurableAgentEventLogEntry["eventType"];
  turnId: string;
  stepId?: string;
  createdAt: string;
  redactionClass: DurableAgentEventLogEntry["redactionClass"];
  replayVisibility: DurableAgentEventLogEntry["replayVisibility"];
  summary: string;
  refs: DurableAgentEventLogEntry["refs"];
};

export type SessionHistoryCheckpointItem = {
  checkpointId: string;
  turnId: string;
  eventSequenceRange: AgentSessionStoreCheckpoint["eventSequenceRange"];
  summary: string;
  retainedRefs: string[];
  projectorVersion: string;
  createdAt: string;
  privacyClass: AgentSessionStoreCheckpoint["privacyClass"];
};

export type SessionHistoryRequestAuditItem = {
  requestLogId: string;
  turnId: string;
  stepId?: string;
  providerId: string;
  modelId: string;
  requestKind: RequestAuditLogRecord["requestKind"];
  permissionDecisionId: string;
  redactionDecisionId: string;
  secretRefId?: string;
  contextBuildId: string;
  eventIds: string[];
  safeInputSummary: string;
  safeOutputSummary: string;
  usageSummary?: RequestAuditLogRecord["usageSummary"];
  status: RequestAuditLogRecord["status"];
  safeError?: string;
  createdAt: string;
};

export function createSessionHistoryViewModel(input: SessionHistoryProjectionInput): SessionHistoryViewModel {
  const { metadata } = input;

  return {
    title: P12_DURABLE_SESSION_OUTPUT_STATE,
    outputState: P12_DURABLE_SESSION_OUTPUT_STATE,
    session: {
      sessionId: metadata.sessionId,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      runtimeVersion: metadata.runtimeVersion,
      storageAdapterKind: metadata.storageAdapterKind,
      privacyPolicyId: metadata.privacyPolicyId,
      redactionPolicyId: metadata.redactionPolicyId,
    },
    summary: {
      eventCount: input.events.length,
      checkpointCount: input.checkpoints.length,
      requestAuditRecordCount: input.requestAuditRecords.length,
      warningCount: input.corruptionWarnings?.length ?? 0,
    },
    linkage: {
      workspaceRefs: [...metadata.workspaceRefs],
      evidenceRefs: [...metadata.evidenceRefs],
      modelRefs: [...metadata.modelRefs],
      providerRefs: [...metadata.providerRefs],
      toolRefs: [...metadata.toolRefs],
      permissionDecisionRefs: [...metadata.permissionDecisionRefs],
      observationRefs: [...metadata.observationRefs],
      requestLogRefs: [...metadata.requestLogRefs],
      replayCheckpointRefs: [...metadata.replayCheckpointRefs],
    },
    capabilities: cloneCapabilities(metadata.capabilityStatuses),
    timeline: input.events.map(projectTimelineItem),
    checkpoints: input.checkpoints.map(projectCheckpointItem),
    requestAuditTrail: input.requestAuditRecords.map(projectRequestAuditItem),
    corruptionWarnings: (input.corruptionWarnings ?? []).map((warning) => ({
      ...warning,
      eventIds: [...warning.eventIds],
    })),
  };
}

function projectTimelineItem(event: DurableAgentEventLogEntry): SessionHistoryTimelineItem {
  return {
    eventId: event.eventId,
    sequence: event.sequence,
    eventType: event.eventType,
    turnId: event.turnId,
    stepId: event.stepId,
    createdAt: event.createdAt,
    redactionClass: event.redactionClass,
    replayVisibility: event.replayVisibility,
    summary: event.summary,
    refs: cloneEventRefs(event.refs),
  };
}

function projectCheckpointItem(checkpoint: AgentSessionStoreCheckpoint): SessionHistoryCheckpointItem {
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

function projectRequestAuditItem(record: RequestAuditLogRecord): SessionHistoryRequestAuditItem {
  return {
    requestLogId: record.requestLogId,
    turnId: record.turnId,
    stepId: record.stepId,
    providerId: record.providerId,
    modelId: record.modelId,
    requestKind: record.requestKind,
    permissionDecisionId: record.permissionDecisionId,
    redactionDecisionId: record.redactionDecisionId,
    secretRefId: record.secretRefId,
    contextBuildId: record.contextBuildId,
    eventIds: [...record.eventIds],
    safeInputSummary: record.safeInputSummary,
    safeOutputSummary: record.safeOutputSummary,
    usageSummary: record.usageSummary === undefined ? undefined : { ...record.usageSummary },
    status: record.status,
    safeError: record.safeError,
    createdAt: record.createdAt,
  };
}

function cloneCapabilities(
  capabilities: DurableAgentSessionMetadata["capabilityStatuses"],
): DurableAgentSessionMetadata["capabilityStatuses"] {
  return Object.fromEntries(
    Object.entries(capabilities).map(([name, capability]) => [name, { ...capability }]),
  ) as DurableAgentSessionMetadata["capabilityStatuses"];
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
