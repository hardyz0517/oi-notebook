import {
  P15_COOKIE_READER_SCHEMA_VERSION,
  type CookieReaderAuditSummary,
  type CookieReaderRedactionClass,
  type CookieReaderRedactionPolicy,
  type CookieReaderRedactionStatus,
  type CookieReaderSourceProfile,
} from "./cookieReaderContractTypes";

export const P15_COOKIE_READER_SAFE_AUDIT_FIELDS = [
  "readerRequestId",
  "sourceProfile",
  "displayOrigin",
  "capabilityStatus",
  "permissionStatus",
  "redactionStatus",
  "blockedReasons",
  "fixtureId",
  "schemaVersion",
  "createdAt",
] as const satisfies readonly (keyof CookieReaderAuditSummary)[];

export type CookieReaderSensitiveInput = {
  cookieValue?: string;
  authorizationHeader?: string;
  apiKey?: string;
  api_key?: string;
  sessionToken?: string;
  privateNoteContent?: string;
  rawProviderPayload?: string;
  rawToolOutput?: string;
};

export type BuildCookieReaderRedactionPolicyInput = {
  redactionPolicyId: string;
  readerRequestId: string;
  createdAt: string;
  sensitiveInput?: CookieReaderSensitiveInput;
};

export type BuildCookieReaderAuditSummaryInput = Omit<CookieReaderAuditSummary, "schemaVersion"> & {
  ignoredUnsafeFields?: CookieReaderSensitiveInput;
};

export type CookieReaderSafeProjectionPayload = {
  readerRequestId: string;
  sourceProfile: CookieReaderSourceProfile;
  displayOrigin: string;
  fixtureId: string;
  redactionStatus: CookieReaderRedactionStatus;
  removedSensitiveClasses: CookieReaderRedactionClass[];
  retainsRawProviderPayload: false;
  retainsRawToolOutput: false;
  createdAt: string;
};

export type CookieReaderSanitizedProjectionSet = {
  modelProviderPayload: CookieReaderSafeProjectionPayload;
  thirdPartySearchPayload: CookieReaderSafeProjectionPayload;
  requestLog: CookieReaderSafeProjectionPayload;
  evidencePayload: CookieReaderSafeProjectionPayload;
  workbenchRawView: CookieReaderSafeProjectionPayload;
  durableStorageProjection: CookieReaderSafeProjectionPayload;
};

export type SanitizeCookieReaderPayloadForProjectionInput = {
  readerRequestId: string;
  sourceProfile: CookieReaderSourceProfile;
  displayOrigin: string;
  fixtureId: string;
  createdAt: string;
  sensitiveInput?: CookieReaderSensitiveInput;
};

export function buildCookieReaderRedactionPolicy(
  input: BuildCookieReaderRedactionPolicyInput,
): CookieReaderRedactionPolicy {
  const redactedClasses = redactedClassesFor(input.sensitiveInput);
  const redactionStatus: CookieReaderRedactionStatus = redactedClasses.length > 0 ? "redacted" : "not-needed";

  return {
    redactionPolicyId: input.redactionPolicyId,
    readerRequestId: input.readerRequestId,
    redactionStatus,
    redactedClasses,
    removedBeforeProviderPayload: true,
    removedBeforeSearchPayload: true,
    removedBeforeRequestLog: true,
    removedBeforeEvidencePayload: true,
    removedBeforeWorkbenchRawView: true,
    removedBeforeDurableStorage: true,
    retainsRawProviderPayload: false,
    retainsRawToolOutput: false,
    safeSummary: summaryFor(redactedClasses),
    createdAt: input.createdAt,
  };
}

export function sanitizeCookieReaderPayloadForProjection(
  input: SanitizeCookieReaderPayloadForProjectionInput,
): CookieReaderSanitizedProjectionSet {
  const basePayload = safeProjectionPayloadFor(input, redactedClassesFor(input.sensitiveInput));

  return {
    modelProviderPayload: basePayload,
    thirdPartySearchPayload: basePayload,
    requestLog: basePayload,
    evidencePayload: basePayload,
    workbenchRawView: basePayload,
    durableStorageProjection: basePayload,
  };
}

export function buildCookieReaderAuditSummary(input: BuildCookieReaderAuditSummaryInput): CookieReaderAuditSummary {
  return {
    readerRequestId: input.readerRequestId,
    sourceProfile: input.sourceProfile,
    displayOrigin: input.displayOrigin,
    capabilityStatus: input.capabilityStatus,
    permissionStatus: input.permissionStatus,
    redactionStatus: input.redactionStatus,
    blockedReasons: input.blockedReasons,
    fixtureId: input.fixtureId,
    schemaVersion: P15_COOKIE_READER_SCHEMA_VERSION,
    createdAt: input.createdAt,
  };
}

function safeProjectionPayloadFor(
  input: SanitizeCookieReaderPayloadForProjectionInput,
  removedSensitiveClasses: CookieReaderRedactionClass[],
): CookieReaderSafeProjectionPayload {
  return {
    readerRequestId: input.readerRequestId,
    sourceProfile: input.sourceProfile,
    displayOrigin: input.displayOrigin,
    fixtureId: input.fixtureId,
    redactionStatus: removedSensitiveClasses.length > 0 ? "redacted" : "not-needed",
    removedSensitiveClasses,
    retainsRawProviderPayload: false,
    retainsRawToolOutput: false,
    createdAt: input.createdAt,
  };
}

function redactedClassesFor(sensitiveInput: CookieReaderSensitiveInput = {}): CookieReaderRedactionClass[] {
  const redactedClasses: CookieReaderRedactionClass[] = [];

  appendWhenPresent(redactedClasses, sensitiveInput.cookieValue, "cookie");
  appendWhenPresent(redactedClasses, sensitiveInput.authorizationHeader, "authorization-header");
  appendWhenPresent(redactedClasses, sensitiveInput.apiKey ?? sensitiveInput.api_key, "api-key");
  appendWhenPresent(redactedClasses, sensitiveInput.sessionToken, "session-token");
  appendWhenPresent(redactedClasses, sensitiveInput.privateNoteContent, "private-note-content");
  appendWhenPresent(redactedClasses, sensitiveInput.rawProviderPayload, "provider-payload");
  appendWhenPresent(redactedClasses, sensitiveInput.rawToolOutput, "tool-output");

  return redactedClasses;
}

function appendWhenPresent(
  redactedClasses: CookieReaderRedactionClass[],
  value: string | undefined,
  redactionClass: CookieReaderRedactionClass,
): void {
  if (value !== undefined && value.length > 0 && !redactedClasses.includes(redactionClass)) {
    redactedClasses.push(redactionClass);
  }
}

function summaryFor(redactedClasses: CookieReaderRedactionClass[]): string {
  if (redactedClasses.length === 0) {
    return "No sensitive reader material was present for P15 projection.";
  }

  return `Removed sensitive reader material classes before P15 projection: ${redactedClasses.join(", ")}.`;
}
