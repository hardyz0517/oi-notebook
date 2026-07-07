import { describe, expect, it } from "vitest";

import { decideLiveProviderGate } from "./liveProviderPolicy";
import type { ProviderModelRequestEnvelope } from "./providerModelTypes";

const baseRequest: ProviderModelRequestEnvelope = {
  requestId: "request:p10:1",
  sessionId: "session:p10:1",
  turnId: "turn:p10:1",
  workspaceId: "workspace:p10:1",
  providerProfileId: "provider:openai-compatible",
  modelProfileId: "model:gated",
  intent: "general",
  inputParts: [],
  toolExposure: [],
  evidenceRefs: [],
  privacyPolicyId: "privacy:p10-live",
  permissionDecision: { status: "prompt-required", reason: "live_provider_requires_user_approval" },
  capabilitySnapshot: {
    providerRequest: { status: "preview", reason: "p10_live_gate" },
    streaming: { status: "preview", reason: "p10_live_gate" },
    toolCalling: { status: "reserved", reason: "future_phase" },
  },
  idempotencyKey: "idem:p10:1",
  createdAt: "2026-07-07T00:00:00.000Z",
};

describe("decideLiveProviderGate", () => {
  it("allows live request only after permission and redaction pass", () => {
    expect(decideLiveProviderGate({ request: baseRequest, userApproved: true }).allowed).toBe(true);
  });

  it("blocks unapproved provider requests", () => {
    const decision = decideLiveProviderGate({ request: baseRequest, userApproved: false });

    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.error.code).toBe("provider-permission-blocked");
    }
  });

  it("blocks forbidden redaction parts", () => {
    const decision = decideLiveProviderGate({
      request: {
        ...baseRequest,
        inputParts: [
          {
            partId: "part:cookie",
            kind: "user-text",
            text: "cookie text",
            redaction: {
              classification: "cookie",
              visibility: "forbidden-for-model",
              redactionStrategy: "drop",
              reason: "cookie_blocked",
            },
          },
        ],
      },
      userApproved: true,
    });

    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.error.code).toBe("provider-redaction-blocked");
    }
  });
});
