import { describe, expect, it } from "vitest";

import { checkProviderModelPermission, validateProviderModelRedaction } from "./providerModelPolicy";
import type { ProviderModelRequestEnvelope } from "./providerModelTypes";

const baseRequest = {
  requestId: "request:p9:1",
  sessionId: "session:p8",
  turnId: "turn:p9:1",
  workspaceId: "workspace:p3379",
  providerProfileId: "provider:mock",
  modelProfileId: "model:mock-reasoner",
  intent: "general",
  inputParts: [],
  toolExposure: [],
  evidenceRefs: [],
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

describe("P9 provider/model policy guards", () => {
  it("blocks provider requests in P9", () => {
    expect(checkProviderModelPermission(baseRequest)).toEqual({
      status: "unavailable",
      reason: "provider_request_not_enabled_in_p9",
    });
  });

  it("rejects secret and cookie parts before provider exposure", () => {
    const request = {
      ...baseRequest,
      inputParts: [
        {
          partId: "part:secret",
          kind: "user-text",
          text: "synthetic secret",
          redaction: {
            classification: "secret",
            visibility: "forbidden-for-model",
            redactionStrategy: "drop",
            reason: "secret_never_enters_provider",
          },
        },
        {
          partId: "part:cookie",
          kind: "user-text",
          text: "synthetic cookie",
          redaction: {
            classification: "cookie",
            visibility: "forbidden-for-third-party",
            redactionStrategy: "drop",
            reason: "cookie_never_enters_provider",
          },
        },
      ],
    } satisfies ProviderModelRequestEnvelope;

    expect(validateProviderModelRedaction(request)).toEqual({
      blocked: true,
      reasons: ["secret_never_enters_provider", "cookie_never_enters_provider"],
    });
  });

  it("allows synthetic user text with visible redaction metadata", () => {
    const request = {
      ...baseRequest,
      inputParts: [
        {
          partId: "part:user",
          kind: "user-text",
          text: "Synthetic question.",
          redaction: {
            classification: "user-input",
            visibility: "ui-visible",
            redactionStrategy: "none",
            reason: "synthetic_fixture",
          },
        },
      ],
    } satisfies ProviderModelRequestEnvelope;

    expect(validateProviderModelRedaction(request)).toEqual({ blocked: false, reasons: [] });
  });
});
