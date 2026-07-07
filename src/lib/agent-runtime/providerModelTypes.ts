import type { AgentReplayRedaction } from "./agentTypes";

export type ProviderModelCapabilityStatus = "preview" | "reserved" | "unavailable" | "blocked" | "degraded";

export type ProviderModelCapability = {
  status: ProviderModelCapabilityStatus;
  reason: string;
};

export type ProviderModelPermissionDecision = {
  status: "auto-allowed" | "prompt-required" | "denied" | "blocked-by-configuration" | "unavailable" | "degraded-fallback";
  reason: string;
};

export type ProviderModelInputPart = {
  partId: string;
  kind: "user-text" | "system-instruction-preview" | "evidence-ref" | "workspace-summary";
  text?: string;
  evidenceId?: string;
  redaction: AgentReplayRedaction;
};

export type ProviderModelEvidenceRef = {
  evidenceId: string;
  role: "problem-statement" | "algorithm-reference" | "local-note" | "derived-evidence" | "unknown";
};

export type ProviderModelRequestEnvelope = {
  requestId: string;
  sessionId: string;
  turnId: string;
  workspaceId: string;
  providerProfileId: string;
  modelProfileId: string;
  intent: "explain-code" | "research" | "debug-preview" | "write-preview" | "general";
  inputParts: ProviderModelInputPart[];
  toolExposure: string[];
  evidenceRefs: ProviderModelEvidenceRef[];
  privacyPolicyId: string;
  permissionDecision: ProviderModelPermissionDecision;
  capabilitySnapshot: {
    providerRequest: ProviderModelCapability;
    streaming: ProviderModelCapability;
    toolCalling: ProviderModelCapability;
  };
  idempotencyKey: string;
  createdAt: string;
};

export type ModelCapabilityMatrix = {
  modelProfileId: string;
  providerProfileId: string;
  toolCalling: ProviderModelCapability;
  structuredOutput: ProviderModelCapability;
  streaming: ProviderModelCapability;
  longContext: ProviderModelCapability;
  visionInput: ProviderModelCapability;
  codeReasoning: ProviderModelCapability;
  costTier: "unknown" | "low" | "medium" | "high";
  latencyTier: "unknown" | "low" | "medium" | "high";
  stabilityTier: "unknown" | "low" | "medium" | "high";
  contextWindow: number | null;
  maxOutputTokens: number | null;
  limitations: string[];
};

export type ProviderModelStreamEvent =
  | { type: "provider.request.created"; requestId: string; sequence: number; at: string }
  | { type: "provider.permission.checked"; requestId: string; sequence: number; at: string; decision: ProviderModelPermissionDecision }
  | { type: "provider.redaction.checked"; requestId: string; sequence: number; at: string; blocked: boolean }
  | { type: "model.turn.started"; requestId: string; sequence: number; at: string }
  | { type: "model.delta.preview"; requestId: string; sequence: number; at: string; text: string }
  | { type: "model.tool-call.requested.preview"; requestId: string; sequence: number; at: string; toolName: string }
  | { type: "model.usage.preview"; requestId: string; sequence: number; at: string; inputTokens: number; outputTokens: number }
  | { type: "model.turn.completed.preview"; requestId: string; sequence: number; at: string }
  | { type: "model.turn.failed.preview"; requestId: string; sequence: number; at: string; error: ProviderModelError }
  | { type: "model.turn.cancelled.preview"; requestId: string; sequence: number; at: string; reason: string }
  | { type: "provider.rate-limit.preview"; requestId: string; sequence: number; at: string; retryAfterMs: number }
  | { type: "provider.retry.scheduled.preview"; requestId: string; sequence: number; at: string; attempt: number; delayMs: number };

export type ProviderModelErrorCode =
  | "provider-auth-unavailable"
  | "provider-network-unavailable"
  | "provider-rate-limited"
  | "provider-quota-exhausted"
  | "provider-timeout"
  | "provider-schema-mismatch"
  | "provider-unsupported-capability"
  | "provider-cancelled"
  | "provider-redaction-blocked"
  | "provider-permission-blocked"
  | "provider-fixture-invalid"
  | "provider-unexpected-event";

export type ProviderModelError = {
  code: ProviderModelErrorCode;
  message: string;
  retryable: boolean;
  permissionRelated: boolean;
  redactionRelated: boolean;
  safeDetail: string;
};
