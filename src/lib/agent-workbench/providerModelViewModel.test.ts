import { describe, expect, it } from "vitest";

import { createProviderModelViewModel } from "./providerModelViewModel";

describe("createProviderModelViewModel", () => {
  it("projects mock provider/model events into a read-only Workbench model", () => {
    const model = createProviderModelViewModel({
      requestId: "request:p9:1",
      providerProfileId: "provider:mock",
      modelProfileId: "model:mock-reasoner",
      outputState: "Provider/Model Adapter Contract Preview",
      events: [
        {
          type: "provider.permission.checked",
          requestId: "request:p9:1",
          sequence: 1,
          at: "2026-07-07T00:00:00.000Z",
          decision: { status: "unavailable", reason: "provider_request_not_enabled_in_p9" },
        },
        {
          type: "model.delta.preview",
          requestId: "request:p9:1",
          sequence: 2,
          at: "2026-07-07T00:00:01.000Z",
          text: "Synthetic only.",
        },
      ],
      capabilities: {
        providerRequest: { status: "unavailable", reason: "provider_request_not_enabled_in_p9" },
        streaming: { status: "unavailable", reason: "streaming_not_enabled_in_p9" },
        toolCalling: { status: "reserved", reason: "tool_calling_contract_only" },
      },
      limitations: ["mock_adapter_only", "no_live_provider_request"],
    });

    expect(model.title).toBe("Provider/Model Adapter Contract Preview");
    expect(model.eventCount).toBe(2);
    expect(model.providerRequestStatus.status).toBe("unavailable");
    expect(model.previewText).toBe("Synthetic only.");
  });

  it("projects P10 one-turn live provider state without exposing secrets", () => {
    const model = createProviderModelViewModel({
      requestId: "request:p10:1",
      providerProfileId: "provider:openai-compatible",
      modelProfileId: "model:gated",
      outputState: "Live Provider Request / One-Turn Model Step Contract Preview",
      events: [
        {
          type: "provider.request.started",
          requestId: "request:p10:1",
          sequence: 1,
          at: "2026-07-07T00:00:00.000Z",
        },
        {
          type: "model.delta.live",
          requestId: "request:p10:1",
          sequence: 2,
          at: "2026-07-07T00:00:01.000Z",
          text: "Live text.",
        },
        {
          type: "model.turn.completed.live",
          requestId: "request:p10:1",
          sequence: 3,
          at: "2026-07-07T00:00:02.000Z",
        },
      ],
      capabilities: {
        providerRequest: { status: "preview", reason: "p10_live_gate" },
        streaming: { status: "preview", reason: "p10_live_gate" },
        toolCalling: { status: "reserved", reason: "future_phase" },
      },
      limitations: ["one_turn_only", "no_tool_continuation", "no_patch_apply"],
    });

    expect(model.title).toBe("Live Provider Request / One-Turn Model Step Contract Preview");
    expect(model.previewText).toBe("Live text.");
    expect(model.limitations).toContain("no_patch_apply");
    expect(JSON.stringify(model)).not.toContain("sk-");
  });
});
