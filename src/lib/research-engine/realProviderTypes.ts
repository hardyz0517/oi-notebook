import type {
  CandidatePoolSnapshot,
  DiscoveryProviderCapability,
  DiscoveryProviderRequest,
  DiscoveryProviderResponse,
  DiscoveryRawResult,
} from "./types";

export type RealDiscoveryProviderName = "bing" | "bocha" | "brave" | "searxng" | "custom";

export type RealDiscoveryCredentialPolicy = "none" | "required" | "optional" | "redacted";

export type RealDiscoveryTimeoutPolicy = {
  timeoutMs: number;
  allowPartial: boolean;
};

export type RealDiscoveryAbortState = {
  aborted: boolean;
  reason?: string;
};

export type RealProviderPayloadKind = "bing_like" | "brave_like" | "bocha_like" | "unknown";

export type RealDiscoveryTransportErrorKind =
  | "timeout"
  | "aborted"
  | "unauthorized"
  | "rate_limited"
  | "malformed_response"
  | "empty_result"
  | "unsupported_provider"
  | "provider_disabled"
  | "transport_unavailable"
  | "unknown";

export type RealDiscoveryProviderConfig = {
  providerName: RealDiscoveryProviderName;
  enabled: boolean;
  endpoint?: string;
  apiKeyRedacted?: string;
  credentialAvailable?: boolean;
  credentialPolicy: RealDiscoveryCredentialPolicy;
  timeoutMs: number;
  maxResults: number;
  locale: string;
  safeSearch?: "off" | "moderate" | "strict";
  capabilities: DiscoveryProviderCapability[];
  payloadKind: RealProviderPayloadKind;
  providerPriority?: number;
};

export type RealDiscoveryTransportRequest = {
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  query: Record<string, string | number | boolean>;
  body?: string;
  timeoutMs: number;
  abortState: RealDiscoveryAbortState;
};

export type RealDiscoveryTransportResponse = {
  statusCode: number;
  headers: Record<string, string>;
  bodyText: string;
  elapsedMs?: number;
  fromFixture?: boolean;
};

export type RealDiscoveryTransportError = {
  kind: RealDiscoveryTransportErrorKind;
  message: string;
  statusCode?: number;
  elapsedMs?: number;
};

export type RealDiscoveryTransportResult =
  | { ok: true; response: RealDiscoveryTransportResponse }
  | { ok: false; error: RealDiscoveryTransportError };

export type RealDiscoveryTransport = (request: RealDiscoveryTransportRequest) => RealDiscoveryTransportResult;

export type RealDiscoveryProviderAdapter = {
  providerName: RealDiscoveryProviderName;
  config: RealDiscoveryProviderConfig;
  transport?: RealDiscoveryTransport;
};

export type RealProviderNormalizeInput = {
  providerName: RealDiscoveryProviderName;
  payloadKind: RealProviderPayloadKind;
  payload: unknown;
  request: DiscoveryProviderRequest;
  providerPriority: number;
  maxResults: number;
};

export type RealProviderNormalizeResult = {
  rawResults: DiscoveryRawResult[];
  warnings: string[];
  diagnostics: Record<string, unknown>;
  partial: boolean;
  error?: RealDiscoveryTransportError;
};

export type RealProviderAdapterSmokeCase = {
  id: string;
  config: RealDiscoveryProviderConfig;
  request: DiscoveryProviderRequest;
  transport?: RealDiscoveryTransport;
  buildCandidatePool?: boolean;
};

export type RealProviderAdapterSmokeResult = {
  id: string;
  response: DiscoveryProviderResponse;
  candidatePool?: CandidatePoolSnapshot;
  passed: boolean;
  failures: string[];
};

export type RealProviderFixtureKind =
  | "bing_react_docs"
  | "brave_openai_news"
  | "bocha_zh_rumor"
  | "malformed"
  | "empty"
  | "rate_limited"
  | "unauthorized"
  | "timeout"
  | "aborted";

export type RealProviderFixture = {
  kind: RealProviderFixtureKind;
  providerName: RealDiscoveryProviderName;
  payloadKind: RealProviderPayloadKind;
  response?: RealDiscoveryTransportResponse;
  error?: RealDiscoveryTransportError;
};
