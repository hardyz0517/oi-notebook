import type { ProviderModelError, ProviderModelStreamEvent } from "./providerModelTypes";

export type OneTurnLiveModelTransport = () => Promise<ProviderModelStreamEvent[]>;

export type OneTurnLiveModelStepInput = {
  requestId: string;
  transport: OneTurnLiveModelTransport;
  retry: { maxAttempts: number; delayMs: number };
};

export type OneTurnLiveModelStepResult = {
  events: ProviderModelStreamEvent[];
  attempts: number;
};

const REQUEST_STARTED_AT = "2026-07-07T00:00:00.000Z";

const toolContinuationBlockedError: ProviderModelError = {
  code: "provider-unsupported-capability",
  message: "P10 does not execute tool calls from live model output.",
  retryable: false,
  permissionRelated: false,
  redactionRelated: false,
  safeDetail: "Tool continuation is reserved for a later phase.",
};

const boundedRetryFailedError: ProviderModelError = {
  code: "provider-network-unavailable",
  message: "Live provider request failed after bounded retry.",
  retryable: false,
  permissionRelated: false,
  redactionRelated: false,
  safeDetail: "Raw provider error hidden by P10 mapper.",
};

function createFailedLiveTurnEvent(input: {
  requestId: string;
  sequence: number;
  error: ProviderModelError;
}): ProviderModelStreamEvent {
  return {
    type: "model.turn.failed.live",
    requestId: input.requestId,
    sequence: input.sequence,
    at: REQUEST_STARTED_AT,
    error: input.error,
  };
}

function sleep(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export async function runOneTurnLiveModelStep(input: OneTurnLiveModelStepInput): Promise<OneTurnLiveModelStepResult> {
  const events: ProviderModelStreamEvent[] = [
    { type: "provider.request.started", requestId: input.requestId, sequence: 1, at: REQUEST_STARTED_AT },
  ];
  const maxAttempts = Math.max(1, Math.floor(input.retry.maxAttempts));
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts += 1;

    try {
      const transportEvents = await input.transport();
      const combinedEvents = [...events, ...transportEvents];
      if (transportEvents.some((event) => event.type === "model.tool-call.requested.preview")) {
        return {
          attempts,
          events: [
            ...combinedEvents,
            createFailedLiveTurnEvent({
              requestId: input.requestId,
              sequence: combinedEvents.length + 1,
              error: toolContinuationBlockedError,
            }),
          ],
        };
      }

      return { attempts, events: combinedEvents };
    } catch {
      if (attempts >= maxAttempts) {
        return {
          attempts,
          events: [
            ...events,
            createFailedLiveTurnEvent({
              requestId: input.requestId,
              sequence: events.length + 1,
              error: boundedRetryFailedError,
            }),
          ],
        };
      }

      await sleep(input.retry.delayMs);
    }
  }

  return { attempts, events };
}
