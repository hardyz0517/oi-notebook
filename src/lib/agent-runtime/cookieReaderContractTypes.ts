export const P15_COOKIE_READER_SCHEMA_VERSION = 1 as const;
export const SUPPORTED_P15_COOKIE_READER_SCHEMA_VERSIONS = [P15_COOKIE_READER_SCHEMA_VERSION] as const;

export const P15_COOKIE_READER_PHASE_NAME = "P15 Cookie-backed Reader Contract Freeze" as const;
export const P15_COOKIE_READER_INPUT_STATE = "Execute / Code Runner Contract Preview" as const;
export const P15_COOKIE_READER_OUTPUT_STATE = "Cookie-backed Reader Contract Preview" as const;

export type P15CookieReaderSchemaVersion = typeof P15_COOKIE_READER_SCHEMA_VERSION;
export type P15CookieReaderPhaseName = typeof P15_COOKIE_READER_PHASE_NAME;
export type P15CookieReaderInputState = typeof P15_COOKIE_READER_INPUT_STATE;
export type P15CookieReaderOutputState = typeof P15_COOKIE_READER_OUTPUT_STATE;

export type CookieReaderCapabilityStatus = "preview" | "reserved" | "unavailable" | "denied" | "blocked";

export const P15_COOKIE_READER_CAPABILITY_STATUSES: CookieReaderCapabilityStatus[] = [
  "preview",
  "reserved",
  "unavailable",
  "denied",
  "blocked",
];

export type CookieReaderRequestSourceKind =
  | "user-request"
  | "model-output"
  | "tool-observation"
  | "fixture"
  | "manual-import"
  | "replay-preview";

export type CookieReaderSourceProfile =
  | "luogu"
  | "workspace-fixture"
  | "manual-fixture"
  | "replay-fixture"
  | "unsupported"
  | "reserved-future-source";

export type CookieReaderDomainPolicy =
  | "display-only"
  | "workspace-fixture-only"
  | "manual-fixture-only"
  | "unsupported"
  | "reserved-future-allowlist";

export type CookieReaderAuthMaterialPolicy =
  | "not-present"
  | "redacted-ref-only"
  | "blocked"
  | "unsupported"
  | "reserved-future-user-consent";

export type CookieReaderNetworkPolicy = "none" | "blocked" | "unsupported" | "reserved-future-safe-reader";

export type CookieReaderCookiePolicy =
  | "not-read"
  | "fixture-only"
  | "blocked"
  | "unsupported"
  | "reserved-future-safe-reader";

export type CookieReaderPrivateContentPolicy =
  | "not-present"
  | "opaque-ref-only"
  | "fixture-only"
  | "blocked"
  | "unsupported"
  | "reserved-future-user-consent";

export type CookieReaderFixturePolicy =
  | "not-fixture"
  | "deterministic-fixture"
  | "manual-fixture"
  | "replay-fixture"
  | "blocked"
  | "unsupported";

export type CookieReaderConsentStatus =
  | "not-required"
  | "fixture-consent-recorded"
  | "future-review-required"
  | "denied"
  | "blocked"
  | "unavailable";

export type CookieReaderSourceRef = {
  sourceRefId: string;
  sourceProfile: CookieReaderSourceProfile;
  displayOrigin: string;
  domainPolicy: CookieReaderDomainPolicy;
  authMaterialPolicy: CookieReaderAuthMaterialPolicy;
  networkPolicy: CookieReaderNetworkPolicy;
  cookiePolicy: CookieReaderCookiePolicy;
  privateContentPolicy: CookieReaderPrivateContentPolicy;
  fixturePolicy: CookieReaderFixturePolicy;
  consentStatus: CookieReaderConsentStatus;
  blockedReasons: string[];
};

export type CookieReaderSourceBoundary = {
  boundaryId: string;
  sourceProfile: CookieReaderSourceProfile;
  displayOrigin: string;
  displayOnly: boolean;
  allowedSourceRefs: string[];
  deniedSourceRefs: string[];
  requiredConsent: CookieReaderConsentStatus;
  blockedReasons: string[];
  createdAt: string;
};

export type CookieReaderPermissionDecisionStatus =
  | "prompt-required"
  | "denied"
  | "blocked-by-configuration"
  | "unavailable"
  | "reserved";

export type CookieReaderPermissionRequest = {
  permissionRequestId: string;
  readerRequestId: string;
  requestedSourceProfile: CookieReaderSourceProfile;
  requestedDisplayOrigin: string;
  decisionStatus: CookieReaderPermissionDecisionStatus;
  reviewReason: string;
  requestedSensitiveInput: boolean;
  sourceRefs: string[];
  approvalSurface: string;
  requestedByEventId: string;
  expiresAt?: string;
  createdAt: string;
};

export type CookieReaderApprovalDecisionStatus =
  | "pending"
  | "approved-for-future-read"
  | "denied"
  | "blocked"
  | "expired"
  | "unavailable";

export type CookieReaderApprovalDecisionReadModel = {
  approvalDecisionId: string;
  permissionRequestId: string;
  readerRequestId: string;
  status: CookieReaderApprovalDecisionStatus;
  decidedBy: string;
  safeReason: string;
  visibleConsequences: string[];
  blockedCapabilities: string[];
  eventIds: string[];
  createdAt: string;
};

export type CookieReaderRedactionStatus = "not-needed" | "redacted" | "blocked" | "unavailable";

export type CookieReaderRedactionClass =
  | "auth-material-ref"
  | "private-content-ref"
  | "provider-payload"
  | "tool-output"
  | "search-payload"
  | "request-log"
  | "evidence-payload"
  | "workbench-raw-view"
  | "durable-storage";

export type CookieReaderRedactionPolicy = {
  redactionPolicyId: string;
  readerRequestId: string;
  redactionStatus: CookieReaderRedactionStatus;
  redactedClasses: CookieReaderRedactionClass[];
  removedBeforeProviderPayload: boolean;
  removedBeforeSearchPayload: boolean;
  removedBeforeRequestLog: boolean;
  removedBeforeEvidencePayload: boolean;
  removedBeforeWorkbenchRawView: boolean;
  removedBeforeDurableStorage: boolean;
  retainsRawProviderPayload: boolean;
  retainsRawToolOutput: boolean;
  safeSummary: string;
  createdAt: string;
};

export type CookieReaderMockProjectionMode = "fixture-only" | "classification-only" | "unavailable" | "blocked";
export type CookieReaderMockProjectionStatus = "not-projected" | "planned" | "projected" | "blocked" | "unavailable";

export type CookieReaderMockProjection = {
  mockProjectionId: string;
  readerRequestId: string;
  mode: CookieReaderMockProjectionMode;
  status: CookieReaderMockProjectionStatus;
  fixtureId: string;
  sourceProfile: CookieReaderSourceProfile;
  displayOrigin: string;
  safeTitle: string;
  safeExcerpt: string;
  sanitizedEvidenceRefs: string[];
  redactionMarkers: string[];
  blockedReasons: string[];
  createdAt: string;
};

export type CookieReaderAuditSummary = {
  readerRequestId: string;
  sourceProfile: CookieReaderSourceProfile;
  displayOrigin: string;
  capabilityStatus: CookieReaderCapabilityStatus;
  permissionStatus: CookieReaderPermissionDecisionStatus;
  redactionStatus: CookieReaderRedactionStatus;
  blockedReasons: string[];
  fixtureId: string;
  schemaVersion: P15CookieReaderSchemaVersion;
  createdAt: string;
};

export type CookieReaderRequestEnvelope = {
  readerRequestId: string;
  sessionId: string;
  turnId: string;
  stepId: string;
  sourceKind: CookieReaderRequestSourceKind;
  sourceEventIds: string[];
  sourceRefs: CookieReaderSourceRef[];
  workspaceRefs: string[];
  evidenceRefs: string[];
  requestedUrlRef: string;
  sourceBoundary: CookieReaderSourceBoundary;
  permissionRequest: CookieReaderPermissionRequest;
  approvalDecision: CookieReaderApprovalDecisionReadModel;
  redactionPolicy: CookieReaderRedactionPolicy;
  mockProjection: CookieReaderMockProjection;
  auditSummary: CookieReaderAuditSummary;
  capabilityStatus: CookieReaderCapabilityStatus;
  createdAt: string;
  schemaVersion: P15CookieReaderSchemaVersion;
  outputState: P15CookieReaderOutputState;
};

export type CreateCookieReaderRequestEnvelopeInput = Omit<
  CookieReaderRequestEnvelope,
  "schemaVersion" | "outputState"
> & {
  schemaVersion?: P15CookieReaderSchemaVersion;
};

export type SuccessfulP15CookieReaderEventType =
  | "cookieReader.requested"
  | "cookieReader.classified"
  | "cookieReader.permission.required"
  | "cookieReader.permission.resolved"
  | "cookieReader.mock.projected"
  | "cookieReader.audit.recorded"
  | "cookieReader.blocked"
  | "cookieReader.unavailable";

export type ReservedP15CookieReaderEventType =
  | "cookieReader.cookie.loaded"
  | "cookieReader.browser.extracted"
  | "cookieReader.network.started"
  | "cookieReader.network.completed"
  | "cookieReader.storage.persisted";

export type P15CookieReaderEventType = SuccessfulP15CookieReaderEventType | ReservedP15CookieReaderEventType;

export const P15_COOKIE_READER_SUCCESSFUL_EVENT_TYPES: SuccessfulP15CookieReaderEventType[] = [
  "cookieReader.requested",
  "cookieReader.classified",
  "cookieReader.permission.required",
  "cookieReader.permission.resolved",
  "cookieReader.mock.projected",
  "cookieReader.audit.recorded",
  "cookieReader.blocked",
  "cookieReader.unavailable",
];

export const P15_RESERVED_TRUE_READ_EVENT_TYPES: ReservedP15CookieReaderEventType[] = [
  "cookieReader.cookie.loaded",
  "cookieReader.browser.extracted",
  "cookieReader.network.started",
  "cookieReader.network.completed",
  "cookieReader.storage.persisted",
];

export function createCookieReaderRequestEnvelope(
  input: CreateCookieReaderRequestEnvelopeInput,
): CookieReaderRequestEnvelope {
  return {
    ...input,
    schemaVersion: input.schemaVersion ?? P15_COOKIE_READER_SCHEMA_VERSION,
    outputState: P15_COOKIE_READER_OUTPUT_STATE,
  };
}

export function isSuccessfulP15CookieReaderEventType(
  eventType: string,
): eventType is SuccessfulP15CookieReaderEventType {
  return P15_COOKIE_READER_SUCCESSFUL_EVENT_TYPES.includes(eventType as SuccessfulP15CookieReaderEventType);
}

export function isReservedP15CookieReaderEventType(
  eventType: string,
): eventType is ReservedP15CookieReaderEventType {
  return P15_RESERVED_TRUE_READ_EVENT_TYPES.includes(eventType as ReservedP15CookieReaderEventType);
}
