import type {
  ProviderModelCapability,
  ProviderModelError,
  ProviderModelRequestEnvelope,
  ProviderModelStreamEvent,
} from "./providerModelTypes";

export type ProviderModelAdapterCapabilities = {
  providerRequest: ProviderModelCapability;
  streaming: ProviderModelCapability;
  toolCalling: ProviderModelCapability;
};

export type ProviderModelAdapter = {
  adapterId: string;
  providerKind: "mock";
  supports(request: ProviderModelRequestEnvelope): boolean;
  createMockTurn(request: ProviderModelRequestEnvelope): ProviderModelStreamEvent[];
  mapProviderEvent(event: ProviderModelStreamEvent): ProviderModelStreamEvent;
  mapProviderError(error: unknown): ProviderModelError;
  cancel(requestId: string): ProviderModelStreamEvent;
  describeCapabilities(): ProviderModelAdapterCapabilities;
};

export function mapProviderModelError(error: unknown): ProviderModelError {
  if (typeof error === "object" && error && "code" in error && (error as { code?: unknown }).code === "provider-permission-blocked") {
    return {
      code: "provider-permission-blocked",
      message: "Provider request is blocked by policy.",
      retryable: false,
      permissionRelated: true,
      redactionRelated: false,
      safeDetail: "Policy blocked provider request before any network call.",
    };
  }

  return {
    code: "provider-unexpected-event",
    message: "Provider event could not be normalized.",
    retryable: false,
    permissionRelated: false,
    redactionRelated: false,
    safeDetail: "P9 mock adapter hides raw provider details.",
  };
}

export function createMockProviderModelAdapter(input: {
  adapterId: string;
  events: ProviderModelStreamEvent[];
}): ProviderModelAdapter {
  return {
    adapterId: input.adapterId,
    providerKind: "mock",
    supports: (request) => request.providerProfileId === "provider:mock",
    createMockTurn: () => input.events.map((event) => ({ ...event })),
    mapProviderEvent: (event) => ({ ...event }),
    mapProviderError: mapProviderModelError,
    cancel: (requestId) => ({
      type: "model.turn.cancelled.preview",
      requestId,
      sequence: 1,
      at: "2026-07-07T00:00:00.000Z",
      reason: "cancelled_by_runtime_preview",
    }),
    describeCapabilities: () => ({
      providerRequest: { status: "unavailable", reason: "provider_request_not_enabled_in_p9" },
      streaming: { status: "unavailable", reason: "streaming_not_enabled_in_p9" },
      toolCalling: { status: "reserved", reason: "tool_calling_contract_only" },
    }),
  };
}
