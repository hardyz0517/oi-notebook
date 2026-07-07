import { describe, expect, it } from "vitest";

import * as providerModelTypes from "./providerModelTypes";
import type {
  ModelCapabilityMatrix,
  ProviderModelError,
  ProviderModelLiveRequestMetadata,
  ProviderModelRequestAuditSnapshot,
  ProviderModelRequestEnvelope,
  ProviderModelStreamEvent,
} from "./providerModelTypes";

describe("P9 provider/model contract types", () => {
  it("loads the provider/model contract module without runtime provider behavior", () => {
    expect(Object.keys(providerModelTypes)).toEqual([]);
  });

  it("records a provider/model request envelope without carrying secrets", () => {
    const envelope = {
      requestId: "request:p9:1",
      sessionId: "session:p8",
      turnId: "turn:p9:1",
      workspaceId: "workspace:p3379",
      providerProfileId: "provider:mock",
      modelProfileId: "model:mock-reasoner",
      intent: "explain-code",
      inputParts: [
        {
          partId: "part:1",
          kind: "user-text",
          text: "Explain this function.",
          redaction: {
            classification: "user-input",
            visibility: "ui-visible",
            redactionStrategy: "none",
            reason: "synthetic_fixture",
          },
        },
      ],
      toolExposure: [],
      evidenceRefs: [{ evidenceId: "E1", role: "derived-evidence" }],
      privacyPolicyId: "privacy:p9-preview",
      permissionDecision: { status: "unavailable", reason: "provider_request_not_enabled_in_p9" },
      capabilitySnapshot: {
        providerRequest: { status: "unavailable", reason: "provider_request_not_enabled_in_p9" },
        streaming: { status: "unavailable", reason: "streaming_not_enabled_in_p9" },
        toolCalling: { status: "reserved", reason: "tool_calling_contract_only" },
      },
      idempotencyKey: "idem:p9:1",
      createdAt: "2026-07-07T00:00:00.000Z",
    } satisfies ProviderModelRequestEnvelope;

    expect(envelope.permissionDecision.status).toBe("unavailable");
    expect(JSON.stringify(envelope)).not.toContain("sk-");
  });

  it("keeps model capabilities as explicit preview statuses", () => {
    const matrix = {
      modelProfileId: "model:mock-reasoner",
      providerProfileId: "provider:mock",
      toolCalling: { status: "reserved", reason: "tool_calling_contract_only" },
      structuredOutput: { status: "preview", reason: "fixture_schema_only" },
      streaming: { status: "unavailable", reason: "streaming_not_enabled_in_p9" },
      longContext: { status: "reserved", reason: "long_context_contract_only" },
      visionInput: { status: "unavailable", reason: "vision_not_in_p9" },
      codeReasoning: { status: "preview", reason: "synthetic_fixture_label" },
      costTier: "unknown",
      latencyTier: "unknown",
      stabilityTier: "unknown",
      contextWindow: null,
      maxOutputTokens: null,
      limitations: ["mock_adapter_only", "no_live_provider_request"],
    } satisfies ModelCapabilityMatrix;

    expect(matrix.streaming.status).toBe("unavailable");
    expect(matrix.limitations).toContain("mock_adapter_only");
  });

  it("normalizes stream events and errors without exposing raw provider payloads", () => {
    const event = {
      type: "model.delta.preview",
      requestId: "request:p9:1",
      sequence: 1,
      at: "2026-07-07T00:00:01.000Z",
      text: "Synthetic preview delta.",
    } satisfies ProviderModelStreamEvent;

    const error = {
      code: "provider-permission-blocked",
      message: "Provider request is not enabled in P9.",
      retryable: false,
      permissionRelated: true,
      redactionRelated: false,
      safeDetail: "P9 contract preview blocks live provider calls.",
    } satisfies ProviderModelError;

    expect(event.type).toBe("model.delta.preview");
    expect(error.code).toBe("provider-permission-blocked");
  });
});

describe("P10 live provider contract types", () => {
  it("records P10 live request metadata without a frontend secret", () => {
    const metadata = {
      transport: "tauri-provider-request",
      requestMode: "live-one-turn",
      contextBuildId: "context:p10:1",
      redactionDecisionId: "redaction:p10:1",
      permissionDecisionId: "permission:p10:1",
      secretRef: "secret-ref:provider:mock",
      requestLogPolicyId: "request-log:p10-redacted-memory",
      streamPolicyId: "stream:p10-live",
      abortControllerId: "abort:p10:1",
      retryPolicyId: "retry:p10:bounded",
    } satisfies ProviderModelLiveRequestMetadata;

    expect(JSON.stringify(metadata)).not.toContain("sk-");
    expect(metadata.requestMode).toBe("live-one-turn");
  });

  it("normalizes live model stream events separately from preview events", () => {
    const event = {
      type: "model.delta.live",
      requestId: "request:p10:1",
      sequence: 1,
      at: "2026-07-07T00:00:00.000Z",
      text: "Live delta routed through the safe provider boundary.",
    } satisfies ProviderModelStreamEvent;

    expect(event.type).toBe("model.delta.live");
  });

  it("keeps request audit snapshots redacted and in-memory only", () => {
    const snapshot = {
      requestId: "request:p10:1",
      sessionId: "session:p10:1",
      turnId: "turn:p10:1",
      workspaceId: "workspace:p10:1",
      providerProfileId: "provider:openai-compatible",
      modelProfileId: "model:gated",
      permissionStatus: "prompt-required",
      redactionBlocked: false,
      eventCount: 3,
      retryAttempts: 0,
      cancelled: false,
      safePromptSummary: "1 user part, 0 secret parts, 0 cookie parts",
      storage: "memory-only",
    } satisfies ProviderModelRequestAuditSnapshot;

    expect(snapshot.storage).toBe("memory-only");
    expect(JSON.stringify(snapshot)).not.toContain("Authorization");
  });
});
