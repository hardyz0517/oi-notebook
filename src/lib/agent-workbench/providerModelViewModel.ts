import type { ProviderModelAdapterCapabilities } from "@/lib/agent-runtime/providerModelAdapter";
import type { ProviderModelStreamEvent } from "@/lib/agent-runtime/providerModelTypes";

export type ProviderModelProjectionInput = {
  requestId: string;
  providerProfileId: string;
  modelProfileId: string;
  outputState: "Provider/Model Adapter Contract Preview";
  events: ProviderModelStreamEvent[];
  capabilities: ProviderModelAdapterCapabilities;
  limitations: string[];
};

export type ProviderModelViewModel = {
  title: "Provider/Model Adapter Contract Preview";
  requestId: string;
  providerProfileId: string;
  modelProfileId: string;
  eventCount: number;
  providerRequestStatus: ProviderModelAdapterCapabilities["providerRequest"];
  streamingStatus: ProviderModelAdapterCapabilities["streaming"];
  toolCallingStatus: ProviderModelAdapterCapabilities["toolCalling"];
  previewText: string;
  limitations: string[];
};

export function createProviderModelViewModel(input: ProviderModelProjectionInput): ProviderModelViewModel {
  const previewText = input.events
    .filter((event): event is Extract<ProviderModelStreamEvent, { type: "model.delta.preview" }> => event.type === "model.delta.preview")
    .map((event) => event.text)
    .join("");

  return {
    title: input.outputState,
    requestId: input.requestId,
    providerProfileId: input.providerProfileId,
    modelProfileId: input.modelProfileId,
    eventCount: input.events.length,
    providerRequestStatus: input.capabilities.providerRequest,
    streamingStatus: input.capabilities.streaming,
    toolCallingStatus: input.capabilities.toolCalling,
    previewText,
    limitations: input.limitations,
  };
}
