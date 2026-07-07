import { DURABLE_SESSION_SCHEMA_VERSION } from "./durableSessionTypes";
import type { DurableSessionSchemaVersion } from "./durableSessionTypes";

export const P12_REQUEST_LOG_REDACTION_POLICY_ID = "p12-safe-request-log-redaction-v1" as const;

export const REQUEST_LOG_REDACTION_CLASSES = [
  "secret",
  "cookie",
  "local-note",
  "user-input",
  "derived-evidence",
  "provider-payload",
  "tool-output",
  "safe-metadata",
] as const;

export type RequestLogRedactionClass = (typeof REQUEST_LOG_REDACTION_CLASSES)[number];

export const REQUEST_AUDIT_LOG_SAFE_FIELDS = [
  "requestLogId",
  "sessionId",
  "turnId",
  "stepId",
  "providerId",
  "modelId",
  "requestKind",
  "permissionDecisionId",
  "redactionDecisionId",
  "secretRefId",
  "contextBuildId",
  "eventIds",
  "safeInputSummary",
  "safeOutputSummary",
  "usageSummary",
  "status",
  "safeError",
  "createdAt",
  "schemaVersion",
] as const;

export type RequestAuditLogSafeField = (typeof REQUEST_AUDIT_LOG_SAFE_FIELDS)[number];

export type RequestAuditLogStatus = "completed" | "failed" | "blocked" | "redacted";

export type RequestAuditLogRequestKind =
  | "model-request"
  | "tool-request"
  | "context-build"
  | "permission-check"
  | "replay-audit";

export type RequestAuditLogUsageSummary = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  requestCount?: number;
};

export type RequestAuditLogRecord = {
  requestLogId: string;
  sessionId: string;
  turnId: string;
  stepId?: string;
  providerId: string;
  modelId: string;
  requestKind: RequestAuditLogRequestKind;
  permissionDecisionId: string;
  redactionDecisionId: string;
  secretRefId?: string;
  contextBuildId: string;
  eventIds: string[];
  safeInputSummary: string;
  safeOutputSummary: string;
  usageSummary?: RequestAuditLogUsageSummary;
  status: RequestAuditLogStatus;
  safeError?: string;
  createdAt: string;
  schemaVersion: DurableSessionSchemaVersion;
};

export type CreateRequestAuditLogRecordInput = Omit<RequestAuditLogRecord, "schemaVersion"> & {
  schemaVersion?: DurableSessionSchemaVersion;
  unsafeInput?: unknown;
};

export type RedactRequestLogValueInput = {
  redactionClass: RequestLogRedactionClass;
  value: unknown;
  safeSummary?: string;
};

const SUMMARY_ALLOWED_CLASSES = new Set<RequestLogRedactionClass>([
  "user-input",
  "derived-evidence",
  "safe-metadata",
]);

const FORCED_MARKER_CLASSES = new Set<RequestLogRedactionClass>([
  "secret",
  "cookie",
  "local-note",
  "provider-payload",
  "tool-output",
]);

export function createRequestAuditLogRecord(input: CreateRequestAuditLogRecordInput): RequestAuditLogRecord {
  return {
    requestLogId: input.requestLogId,
    sessionId: input.sessionId,
    turnId: input.turnId,
    stepId: input.stepId,
    providerId: input.providerId,
    modelId: input.modelId,
    requestKind: input.requestKind,
    permissionDecisionId: input.permissionDecisionId,
    redactionDecisionId: input.redactionDecisionId,
    secretRefId: input.secretRefId,
    contextBuildId: input.contextBuildId,
    eventIds: [...input.eventIds],
    safeInputSummary: input.safeInputSummary,
    safeOutputSummary: input.safeOutputSummary,
    usageSummary: input.usageSummary === undefined ? undefined : { ...input.usageSummary },
    status: input.status,
    safeError: input.safeError,
    createdAt: input.createdAt,
    schemaVersion: input.schemaVersion ?? DURABLE_SESSION_SCHEMA_VERSION,
  };
}

export function redactRequestLogValue(input: RedactRequestLogValueInput): string {
  if (FORCED_MARKER_CLASSES.has(input.redactionClass)) {
    return redactionMarker(input.redactionClass);
  }

  if (input.safeSummary !== undefined) {
    return input.safeSummary;
  }

  if (SUMMARY_ALLOWED_CLASSES.has(input.redactionClass) && typeof input.value === "string") {
    return input.value;
  }

  return redactionMarker(input.redactionClass);
}

export function classifyRequestLogField(fieldName: string): RequestLogRedactionClass {
  const normalized = fieldName.toLowerCase();

  if (normalized.includes("cookie") || normalized.includes("csrf")) {
    return "cookie";
  }

  if (
    normalized.includes("secret") ||
    normalized.includes("token") ||
    normalized.includes("password") ||
    normalized.includes("authorization") ||
    (normalized.includes("api") && normalized.includes("key"))
  ) {
    return "secret";
  }

  if (normalized.includes("note") || normalized.includes("localnote")) {
    return "local-note";
  }

  if (normalized.includes("rawprovider") || (normalized.includes("provider") && normalized.includes("payload"))) {
    return "provider-payload";
  }

  if (normalized.includes("rawtool") || (normalized.includes("tool") && normalized.includes("output"))) {
    return "tool-output";
  }

  if (normalized.includes("evidence")) {
    return "derived-evidence";
  }

  if (normalized.includes("user") || normalized.includes("input") || normalized.includes("prompt")) {
    return "user-input";
  }

  return "safe-metadata";
}

function redactionMarker(redactionClass: RequestLogRedactionClass): string {
  return `[redacted:${redactionClass}]`;
}
