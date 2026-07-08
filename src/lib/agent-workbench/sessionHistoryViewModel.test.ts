import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createDurableAgentEventLogEntry,
  createDurableAgentSessionMetadata,
  P12_DURABLE_SESSION_OUTPUT_STATE,
} from "@/lib/agent-runtime/durableSessionTypes";
import type { AgentSessionStoreCheckpoint } from "@/lib/agent-runtime/inMemorySessionStore";
import { createRequestAuditLogRecord } from "@/lib/agent-runtime/requestLogPolicy";
import { createSessionHistoryViewModel } from "./sessionHistoryViewModel";

const baseMetadata = createDurableAgentSessionMetadata({
  sessionId: "session:p12:history",
  createdAt: "2026-07-07T00:00:00.000Z",
  updatedAt: "2026-07-07T00:00:07.000Z",
  runtimeVersion: "agent-runtime:p12-preview",
  workspaceRefs: ["workspace:general:session-history"],
  evidenceRefs: ["evidence:derived:lca"],
  modelRefs: ["model:mock-reasoner"],
  providerRefs: ["provider:mock"],
  toolRefs: ["tool:read-current-context.preview"],
  permissionDecisionRefs: ["permission:read:auto"],
  observationRefs: ["observation:safe-summary"],
  requestLogRefs: ["request-log:p12:1"],
  replayCheckpointRefs: ["checkpoint:p12:1"],
  privacyPolicyId: "privacy:p12-preview",
  redactionPolicyId: "p12-safe-request-log-redaction-v1",
  storageAdapterKind: "in-memory-preview",
  capabilityStatuses: {
    durableSessionMetadata: { status: "preview", reason: "typed_metadata_only" },
    requestLogPersistence: { status: "preview", reason: "safe_audit_records_only" },
    replayPersistence: { status: "preview", reason: "fixture_projection_only" },
    storageAdapter: { status: "unavailable", reason: "real_storage_not_enabled" },
  },
});

const baseEvents = [
  createDurableAgentEventLogEntry({
    eventId: "event:p12:1",
    sessionId: baseMetadata.sessionId,
    turnId: "turn:p12:1",
    sequence: 1,
    eventType: "turn.started",
    createdAt: "2026-07-07T00:00:01.000Z",
    redactionClass: "safe-metadata",
    replayVisibility: "timeline-visible",
    summary: "Session history turn started.",
    refs: {
      workspaceRefs: ["workspace:general:session-history"],
    },
  }),
  createDurableAgentEventLogEntry({
    eventId: "event:p12:2",
    sessionId: baseMetadata.sessionId,
    turnId: "turn:p12:1",
    stepId: "step:p12:1",
    sequence: 2,
    eventType: "observation.added",
    createdAt: "2026-07-07T00:00:02.000Z",
    redactionClass: "derived-evidence",
    replayVisibility: "summary-only",
    summary: "Observation summary references evidence without raw note text.",
    refs: {
      evidenceRefs: ["evidence:derived:lca"],
      observationRefs: ["observation:safe-summary"],
      requestLogRefs: ["request-log:p12:1"],
    },
  }),
];

const baseCheckpoint: AgentSessionStoreCheckpoint = {
  checkpointId: "checkpoint:p12:1",
  sessionId: baseMetadata.sessionId,
  turnId: "turn:p12:1",
  eventSequenceRange: {
    from: 1,
    to: 2,
  },
  summary: "Safe checkpoint summary.",
  droppedEventIds: [],
  retainedRefs: ["workspace:general:session-history", "evidence:derived:lca"],
  redactionPolicyId: baseMetadata.redactionPolicyId,
  schemaVersion: baseMetadata.schemaVersion,
  createdAt: "2026-07-07T00:00:03.000Z",
  projectorVersion: "p12-replay-projector-v1",
  privacyClass: "summary-only",
};

const baseAuditRecord = createRequestAuditLogRecord({
  requestLogId: "request-log:p12:1",
  sessionId: baseMetadata.sessionId,
  turnId: "turn:p12:1",
  stepId: "step:p12:1",
  providerId: "provider:mock",
  modelId: "model:mock-reasoner",
  requestKind: "model-request",
  permissionDecisionId: "permission:read:auto",
  redactionDecisionId: "redaction:p12:1",
  secretRefId: "secret-ref:provider-key",
  contextBuildId: "context:p12:1",
  eventIds: ["event:p12:1", "event:p12:2"],
  safeInputSummary: "Safe input summary only.",
  safeOutputSummary: "Safe output summary only.",
  usageSummary: {
    inputTokens: 10,
    outputTokens: 12,
    totalTokens: 22,
    requestCount: 1,
  },
  status: "completed",
  createdAt: "2026-07-07T00:00:04.000Z",
  unsafeInput: {
    ["api" + "Key"]: "sk-" + "test-secret",
    ["Authori" + "zation"]: "Bearer secret",
    ["Co" + "okie"]: "sid=secret",
    ["rawProvider" + "Payload"]: "raw provider " + "payload",
    ["rawTool" + "Output"]: "raw tool " + "output",
    noteContent: "real note content",
  },
});

describe("createSessionHistoryViewModel", () => {
  it("projects session metadata, counts, checkpoint refs, request audit records, warnings, and output state", () => {
    const viewModel = createSessionHistoryViewModel({
      metadata: baseMetadata,
      events: baseEvents,
      checkpoints: [baseCheckpoint],
      requestAuditRecords: [baseAuditRecord],
      corruptionWarnings: [{
        warningId: "warning:p12:gap",
        severity: "warning",
        message: "Event log gap quarantined for read-only projection.",
        eventIds: ["event:p12:missing"],
      }],
    });

    expect(viewModel.title).toBe(P12_DURABLE_SESSION_OUTPUT_STATE);
    expect(viewModel.outputState).toBe(P12_DURABLE_SESSION_OUTPUT_STATE);
    expect(viewModel.session.sessionId).toBe("session:p12:history");
    expect(viewModel.session.storageAdapterKind).toBe("in-memory-preview");
    expect(viewModel.summary).toMatchObject({
      eventCount: 2,
      checkpointCount: 1,
      requestAuditRecordCount: 1,
      warningCount: 1,
    });
    expect(viewModel.linkage.workspaceRefs).toEqual(["workspace:general:session-history"]);
    expect(viewModel.linkage.evidenceRefs).toEqual(["evidence:derived:lca"]);
    expect(viewModel.linkage.replayCheckpointRefs).toEqual(["checkpoint:p12:1"]);
    expect(viewModel.checkpoints).toEqual([
      expect.objectContaining({
        checkpointId: "checkpoint:p12:1",
        eventSequenceRange: { from: 1, to: 2 },
        retainedRefs: ["workspace:general:session-history", "evidence:derived:lca"],
      }),
    ]);
    expect(viewModel.requestAuditTrail).toEqual([
      expect.objectContaining({
        requestLogId: "request-log:p12:1",
        providerId: "provider:mock",
        modelId: "model:mock-reasoner",
        secretRefId: "secret-ref:provider-key",
        safeInputSummary: "Safe input summary only.",
        safeOutputSummary: "Safe output summary only.",
      }),
    ]);
    expect(viewModel.corruptionWarnings).toEqual([
      expect.objectContaining({
        warningId: "warning:p12:gap",
        eventIds: ["event:p12:missing"],
      }),
    ]);
  });

  it("does not expose unsafe provider, tool, secret, session, header, or note content", () => {
    const viewModel = createSessionHistoryViewModel({
      metadata: baseMetadata,
      events: [
        ...baseEvents,
        createDurableAgentEventLogEntry({
          eventId: "event:p12:3",
          sessionId: baseMetadata.sessionId,
          turnId: "turn:p12:1",
          stepId: "step:p12:1",
          sequence: 3,
          eventType: "step.completed",
          createdAt: "2026-07-07T00:00:05.000Z",
          redactionClass: "safe-metadata",
          replayVisibility: "timeline-visible",
          summary: "Redacted projection: [redacted:provider-payload] [redacted:tool-output].",
          refs: {},
        }),
      ],
      checkpoints: [baseCheckpoint],
      requestAuditRecords: [baseAuditRecord],
      corruptionWarnings: [],
    });

    const serialized = JSON.stringify(viewModel);
    const unsafeSecret = "sk-" + "test-secret";
    const unsafeProviderPayload = "raw provider " + "payload";
    const unsafeToolOutput = "raw tool " + "output";

    expect(serialized).not.toContain(unsafeSecret);
    expect(serialized).not.toContain("Bearer secret");
    expect(serialized).not.toContain("sid=secret");
    expect(serialized).not.toContain(unsafeProviderPayload);
    expect(serialized).not.toContain(unsafeToolOutput);
    expect(serialized).not.toContain("real note content");
    expect(serialized).not.toContain("api" + "Key");
    expect(serialized).not.toContain("Authori" + "zation");
    expect(serialized).not.toContain("Co" + "okie");
  });

  it("keeps the SessionHistoryPanel source free of execution and mutation affordances", () => {
    const panelSource = readFileSync(
      join(process.cwd(), "src/components/agent-workbench/SessionHistoryPanel.tsx"),
      "utf8",
    );
    const forbiddenAffordances = [
      "onClick",
      "button",
      "providerRequest",
      "apply" + "Patch",
      "patch " + "apply",
      "writeFile",
      "de" + "lete",
      "roll" + "back",
      "run" + " code",
      "code " + "runner",
      "Co" + "okie",
    ];

    for (const forbiddenAffordance of forbiddenAffordances) {
      expect(panelSource).not.toContain(forbiddenAffordance);
    }
  });
});
