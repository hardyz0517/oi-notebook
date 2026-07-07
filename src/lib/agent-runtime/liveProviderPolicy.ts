import { validateProviderModelRedaction } from "./providerModelPolicy";
import type { ProviderModelError, ProviderModelRequestEnvelope } from "./providerModelTypes";

export type LiveProviderGateDecision =
  | { allowed: true; reason: string }
  | { allowed: false; error: ProviderModelError };

export function decideLiveProviderGate(input: {
  request: ProviderModelRequestEnvelope;
  userApproved: boolean;
}): LiveProviderGateDecision {
  if (!input.userApproved) {
    return {
      allowed: false,
      error: {
        code: "provider-permission-blocked",
        message: "Live provider request requires approval.",
        retryable: false,
        permissionRelated: true,
        redactionRelated: false,
        safeDetail: "Runtime blocked request before transport.",
      },
    };
  }

  const redaction = validateProviderModelRedaction(input.request);
  if (redaction.blocked) {
    return {
      allowed: false,
      error: {
        code: "provider-redaction-blocked",
        message: "Live provider request contains model-forbidden parts.",
        retryable: false,
        permissionRelated: false,
        redactionRelated: true,
        safeDetail: redaction.reasons.join(", "),
      },
    };
  }

  return { allowed: true, reason: "live_provider_gate_passed" };
}
