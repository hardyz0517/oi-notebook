import {
  P15_COOKIE_READER_OUTPUT_STATE,
  type CookieReaderAuditSummary,
  type CookieReaderCapabilityStatus,
  type CookieReaderMockProjection,
  type CookieReaderPermissionRequest,
  type CookieReaderRedactionPolicy,
  type CookieReaderRequestEnvelope,
  type CookieReaderSourceRef,
} from "@/lib/agent-runtime/cookieReaderContractTypes";

type CookieReaderFixtureObservationInput = CookieReaderMockProjection & {
  unavailableReasons?: string[];
};

export type CookieReaderProjectionInput = CookieReaderRequestEnvelope | {
  request: CookieReaderRequestEnvelope;
};

export type CookieReaderSourceViewModel = Pick<
  CookieReaderSourceRef,
  | "sourceProfile"
  | "displayOrigin"
  | "domainPolicy"
  | "authMaterialPolicy"
  | "networkPolicy"
  | "cookiePolicy"
  | "privateContentPolicy"
  | "fixturePolicy"
  | "consentStatus"
> & {
  sourceRefId: string;
  displayOnly: boolean;
};

export type CookieReaderPermissionViewModel = {
  permissionRequestId: string;
  decisionStatus: CookieReaderPermissionRequest["decisionStatus"];
  approvalStatus: CookieReaderRequestEnvelope["approvalDecision"]["status"];
  consentStatus: CookieReaderSourceRef["consentStatus"];
  reviewReason: string;
  requestedSensitiveInput: boolean;
  approvalSurface: string;
};

export type CookieReaderRedactionViewModel = Pick<
  CookieReaderRedactionPolicy,
  | "redactionStatus"
  | "removedBeforeProviderPayload"
  | "removedBeforeSearchPayload"
  | "removedBeforeRequestLog"
  | "removedBeforeEvidencePayload"
  | "removedBeforeWorkbenchRawView"
  | "removedBeforeDurableStorage"
  | "retainsRawProviderPayload"
  | "retainsRawToolOutput"
> & {
  redactionPolicyId: string;
  redactedClasses: CookieReaderRedactionPolicy["redactedClasses"];
  safeSummary: string;
};

export type CookieReaderFixtureObservationViewModel = {
  mode: CookieReaderMockProjection["mode"];
  status: CookieReaderMockProjection["status"];
  fixtureId: string;
  safeTitle: string;
  safeExcerpt: string;
  sanitizedEvidenceRefs: string[];
  redactionMarkers: CookieReaderMockProjection["redactionMarkers"];
};

export type CookieReaderViewModel = {
  title: typeof P15_COOKIE_READER_OUTPUT_STATE;
  outputState: typeof P15_COOKIE_READER_OUTPUT_STATE;
  readerRequestId: string;
  capabilityStatus: CookieReaderCapabilityStatus;
  source: CookieReaderSourceViewModel;
  permission: CookieReaderPermissionViewModel;
  redaction: CookieReaderRedactionViewModel;
  fixtureObservation: CookieReaderFixtureObservationViewModel;
  auditSummary: CookieReaderAuditSummary;
  blockedReasons: string[];
  unavailableReasons: string[];
  limitations: string[];
};

export function createCookieReaderViewModel(input: CookieReaderProjectionInput): CookieReaderViewModel {
  const request = normalizeProjectionInput(input);
  const sourceRef = request.sourceRefs[0];

  if (!sourceRef) {
    throw new Error("cookie_reader_view_model_requires_source_ref");
  }

  const mockProjection = request.mockProjection as CookieReaderFixtureObservationInput;
  const blockedReasons = uniqueSafeValues([
    ...request.sourceBoundary.blockedReasons,
    ...sourceRef.blockedReasons,
    ...request.auditSummary.blockedReasons,
    ...mockProjection.blockedReasons,
  ]);
  const unavailableReasons = uniqueSafeValues(mockProjection.unavailableReasons ?? []);

  return {
    title: P15_COOKIE_READER_OUTPUT_STATE,
    outputState: P15_COOKIE_READER_OUTPUT_STATE,
    readerRequestId: request.readerRequestId,
    capabilityStatus: request.capabilityStatus,
    source: {
      sourceRefId: sourceRef.sourceRefId,
      sourceProfile: sourceRef.sourceProfile,
      displayOrigin: safeDisplayOrigin(sourceRef.displayOrigin),
      displayOnly: request.sourceBoundary.displayOnly,
      domainPolicy: sourceRef.domainPolicy,
      authMaterialPolicy: sourceRef.authMaterialPolicy,
      networkPolicy: sourceRef.networkPolicy,
      cookiePolicy: sourceRef.cookiePolicy,
      privateContentPolicy: sourceRef.privateContentPolicy,
      fixturePolicy: sourceRef.fixturePolicy,
      consentStatus: sourceRef.consentStatus,
    },
    permission: {
      permissionRequestId: request.permissionRequest.permissionRequestId,
      decisionStatus: request.permissionRequest.decisionStatus,
      approvalStatus: request.approvalDecision.status,
      consentStatus: sourceRef.consentStatus,
      reviewReason: sanitizeText(request.permissionRequest.reviewReason),
      requestedSensitiveInput: request.permissionRequest.requestedSensitiveInput,
      approvalSurface: sanitizeText(request.permissionRequest.approvalSurface),
    },
    redaction: {
      redactionPolicyId: request.redactionPolicy.redactionPolicyId,
      redactionStatus: request.redactionPolicy.redactionStatus,
      redactedClasses: [...request.redactionPolicy.redactedClasses],
      removedBeforeProviderPayload: request.redactionPolicy.removedBeforeProviderPayload,
      removedBeforeSearchPayload: request.redactionPolicy.removedBeforeSearchPayload,
      removedBeforeRequestLog: request.redactionPolicy.removedBeforeRequestLog,
      removedBeforeEvidencePayload: request.redactionPolicy.removedBeforeEvidencePayload,
      removedBeforeWorkbenchRawView: request.redactionPolicy.removedBeforeWorkbenchRawView,
      removedBeforeDurableStorage: request.redactionPolicy.removedBeforeDurableStorage,
      retainsRawProviderPayload: request.redactionPolicy.retainsRawProviderPayload,
      retainsRawToolOutput: request.redactionPolicy.retainsRawToolOutput,
      safeSummary: sanitizeText(request.redactionPolicy.safeSummary),
    },
    fixtureObservation: {
      mode: mockProjection.mode,
      status: mockProjection.status,
      fixtureId: sanitizeText(mockProjection.fixtureId),
      safeTitle: sanitizeText(mockProjection.safeTitle),
      safeExcerpt: sanitizeText(mockProjection.safeExcerpt),
      sanitizedEvidenceRefs: mockProjection.sanitizedEvidenceRefs.map(sanitizeText),
      redactionMarkers: [...mockProjection.redactionMarkers],
    },
    auditSummary: {
      ...request.auditSummary,
      displayOrigin: safeDisplayOrigin(request.auditSummary.displayOrigin),
      blockedReasons,
    },
    blockedReasons,
    unavailableReasons,
    limitations: [
      "read_only_projection",
      "preview_contract_only",
      "fixture_only_observation",
      "no_true_reader",
      "no_browser_session_access",
      "no_provider_forwarding",
      "no_storage_or_mutation",
    ],
  };
}

function normalizeProjectionInput(input: CookieReaderProjectionInput): CookieReaderRequestEnvelope {
  if ("request" in input) {
    return input.request;
  }

  return input;
}

function safeDisplayOrigin(displayOrigin: string): string {
  try {
    const url = new URL(displayOrigin);
    return `${url.origin}${url.pathname}`;
  } catch {
    return sanitizeText(displayOrigin);
  }
}

function uniqueSafeValues(values: string[]): string[] {
  return [...new Set(values.map(sanitizeText).filter((value) => value.length > 0))];
}

function sanitizeText(value: string): string {
  return value
    .replace(/\bcookie\s*[:=]\s*[^,;.\n\r]+/gi, "[redacted]")
    .replace(/\bauthori(?:z|s)ation\s*:\s*[^,;.\n\r]+/gi, "[redacted]")
    .replace(/\bapi[-_ ]?key\s*[:=]\s*[^,;.\n\r]+/gi, "[redacted]")
    .replace(/\bsession[-_ ]?token\s*[:=]\s*[^,;.\n\r]+/gi, "[redacted]")
    .replace(/\bsk-[a-z0-9_-]+\b/gi, "[redacted]")
    .replace(/\bprivate\s+note\s+content\s*:\s*[^,;.\n\r]+/gi, "[redacted]")
    .replace(/\braw\s+provider\s+payload\s*:\s*[^,;.\n\r]+/gi, "[redacted]")
    .replace(/\braw\s+tool\s+output\s*:\s*[^,;.\n\r]+/gi, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();
}
