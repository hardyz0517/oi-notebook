import { describe, expect, it, vi } from "vitest";

import { createMockProviderModelAdapter, mapProviderModelError } from "./providerModelAdapter";
import type { ProviderModelRequestEnvelope } from "./providerModelTypes";

const request: ProviderModelRequestEnvelope = {
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
};

describe("P9 mock provider/model adapter", () => {
  it("returns deterministic fixture events without network calls", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const adapter = createMockProviderModelAdapter({
      adapterId: "adapter:mock",
      events: [
        { type: "model.turn.started", requestId: "request:p9:1", sequence: 1, at: "2026-07-07T00:00:01.000Z" },
        {
          type: "model.delta.preview",
          requestId: "request:p9:1",
          sequence: 2,
          at: "2026-07-07T00:00:02.000Z",
          text: "Synthetic only.",
        },
        { type: "model.turn.completed.preview", requestId: "request:p9:1", sequence: 3, at: "2026-07-07T00:00:03.000Z" },
      ],
    });

    expect(adapter.describeCapabilities().providerRequest.status).toBe("unavailable");
    expect(adapter.createMockTurn(request)).toHaveLength(3);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("maps cancellation as a preview terminal event", () => {
    const adapter = createMockProviderModelAdapter({ adapterId: "adapter:mock", events: [] });
    expect(adapter.cancel("request:p9:1")).toEqual({
      type: "model.turn.cancelled.preview",
      requestId: "request:p9:1",
      sequence: 1,
      at: "2026-07-07T00:00:00.000Z",
      reason: "cancelled_by_runtime_preview",
    });
  });

  it("normalizes unknown provider errors", () => {
    expect(mapProviderModelError(new Error("raw secret-bearing error")).code).toBe("provider-unexpected-event");
    expect(mapProviderModelError("permission").permissionRelated).toBe(false);
  });
});
