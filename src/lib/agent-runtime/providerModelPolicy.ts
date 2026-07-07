import type { ProviderModelPermissionDecision, ProviderModelRequestEnvelope } from "./providerModelTypes";

export type ProviderModelRedactionResult = {
  blocked: boolean;
  reasons: string[];
};

export function checkProviderModelPermission(_request: ProviderModelRequestEnvelope): ProviderModelPermissionDecision {
  return {
    status: "unavailable",
    reason: "provider_request_not_enabled_in_p9",
  };
}

export function validateProviderModelRedaction(request: ProviderModelRequestEnvelope): ProviderModelRedactionResult {
  const reasons = request.inputParts
    .filter((part) => part.redaction.visibility === "forbidden-for-model" || part.redaction.visibility === "forbidden-for-third-party")
    .map((part) => part.redaction.reason);

  return {
    blocked: reasons.length > 0,
    reasons,
  };
}
