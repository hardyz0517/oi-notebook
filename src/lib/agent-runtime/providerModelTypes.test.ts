import { describe, expect, it } from "vitest";

import * as providerModelTypes from "./providerModelTypes";
import type {
  ModelCapabilityMatrix,
  ProviderModelError,
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
