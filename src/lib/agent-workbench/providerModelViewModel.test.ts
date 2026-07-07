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
});
