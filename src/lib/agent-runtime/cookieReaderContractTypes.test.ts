import { describe, expect, it } from "vitest";

import {
  P15_COOKIE_READER_CAPABILITY_STATUSES,
  P15_COOKIE_READER_OUTPUT_STATE,
  P15_COOKIE_READER_SCHEMA_VERSION,
  P15_COOKIE_READER_SUCCESSFUL_EVENT_TYPES,
  P15_RESERVED_TRUE_READ_EVENT_TYPES,
  createCookieReaderRequestEnvelope,
  isReservedP15CookieReaderEventType,
  isSuccessfulP15CookieReaderEventType,
} from "./cookieReaderContractTypes";
import type {
  CookieReaderApprovalDecisionReadModel,
  CookieReaderAuditSummary,
  CookieReaderMockProjection,
  CookieReaderPermissionRequest,
  CookieReaderRedactionPolicy,
  CookieReaderRequestEnvelope,
  CookieReaderSourceBoundary,
  CookieReaderSourceRef,
} from "./cookieReaderContractTypes";

describe("P15 cookie reader contract types", () => {
  const createdAt = "2026-07-08T00:00:00.000Z";

  const sourceRef = {
    sourceRefId: "source:p15:1",
    sourceProfile: "luogu",
    displayOrigin: "https://www.luogu.com.cn/problem/P1000",
    domainPolicy: "display-only",
    authMaterialPolicy: "redacted-ref-only",
    networkPolicy: "none",
    cookiePolicy: "fixture-only",
    privateContentPolicy: "opaque-ref-only",
    fixturePolicy: "deterministic-fixture",
    consentStatus: "future-review-required",
    blockedReasons: [],
  } satisfies CookieReaderSourceRef;

  const sourceBoundary = {
    boundaryId: "boundary:p15:1",
    sourceProfile: "luogu",
    displayOrigin: "https://www.luogu.com.cn/problem/P1000",
    displayOnly: true,
    allowedSourceRefs: ["source:p15:1"],
    deniedSourceRefs: [],
    requiredConsent: "future-review-required",
    blockedReasons: [],
    createdAt,
  } satisfies CookieReaderSourceBoundary;

  const permissionRequest = {
    permissionRequestId: "permission:p15:1",
    readerRequestId: "reader-request:p15:1",
    requestedSourceProfile: "luogu",
    requestedDisplayOrigin: "https://www.luogu.com.cn/problem/P1000",
    decisionStatus: "prompt-required",
    reviewReason: "Future authenticated source reading requires explicit user approval.",
    requestedSensitiveInput: true,
    sourceRefs: ["source:p15:1"],
    approvalSurface: "workbench-read-only",
    requestedByEventId: "event:p15:model-output",
    createdAt,
  } satisfies CookieReaderPermissionRequest;

  const approvalDecision = {
    approvalDecisionId: "approval:p15:1",
    permissionRequestId: "permission:p15:1",
    readerRequestId: "reader-request:p15:1",
    status: "approved-for-future-read",
    decidedBy: "human-reviewer",
    safeReason: "Metadata only; P15 does not perform authenticated reads.",
    visibleConsequences: ["May be handed to a later approved safety phase."],
    blockedCapabilities: ["true-cookie-backed-read", "browser-cookie-extraction", "network-reader"],
    eventIds: ["event:p15:permission-resolved"],
    createdAt,
  } satisfies CookieReaderApprovalDecisionReadModel;

  const redactionPolicy = {
    redactionPolicyId: "redaction:p15:1",
    readerRequestId: "reader-request:p15:1",
    redactionStatus: "redacted",
    redactedClasses: ["auth-material-ref", "private-content-ref"],
    removedBeforeProviderPayload: true,
    removedBeforeSearchPayload: true,
    removedBeforeRequestLog: true,
    removedBeforeEvidencePayload: true,
    removedBeforeWorkbenchRawView: true,
    removedBeforeDurableStorage: true,
    retainsRawProviderPayload: false,
    retainsRawToolOutput: false,
    safeSummary: "Sensitive source material is represented only by opaque refs.",
    createdAt,
  } satisfies CookieReaderRedactionPolicy;

  const mockProjection = {
    mockProjectionId: "mock:p15:1",
    readerRequestId: "reader-request:p15:1",
    mode: "fixture-only",
    status: "projected",
    fixtureId: "fixture:p15:luogu:1",
    sourceProfile: "luogu",
    displayOrigin: "https://www.luogu.com.cn/problem/P1000",
    safeTitle: "Luogu fixture preview",
    safeExcerpt: "A deterministic fixture summary is available.",
    sanitizedEvidenceRefs: ["evidence:p15:1"],
    redactionMarkers: ["auth-material-ref"],
    blockedReasons: [],
    createdAt,
  } satisfies CookieReaderMockProjection;

  const auditSummary = {
    readerRequestId: "reader-request:p15:1",
    sourceProfile: "luogu",
    displayOrigin: "https://www.luogu.com.cn/problem/P1000",
    capabilityStatus: "preview",
    permissionStatus: "prompt-required",
    redactionStatus: "redacted",
    blockedReasons: [],
    fixtureId: "fixture:p15:luogu:1",
    schemaVersion: P15_COOKIE_READER_SCHEMA_VERSION,
    createdAt,
  } satisfies CookieReaderAuditSummary;

  it("creates reader request envelopes with the frozen P15 fields and output state", () => {
    const envelope = createCookieReaderRequestEnvelope({
      readerRequestId: "reader-request:p15:1",
      sessionId: "session:p15:1",
      turnId: "turn:p15:1",
      stepId: "step:p15:1",
      sourceKind: "model-output",
      sourceEventIds: ["event:p15:model-output"],
      sourceRefs: [sourceRef],
      workspaceRefs: ["workspace:general:1"],
      evidenceRefs: ["evidence:p15:1"],
      requestedUrlRef: "url-ref:p15:display-only",
      sourceBoundary,
      permissionRequest,
      approvalDecision,
      redactionPolicy,
      mockProjection,
      auditSummary,
      capabilityStatus: "preview",
      createdAt,
    });

    expect(envelope).toEqual({
      readerRequestId: "reader-request:p15:1",
      sessionId: "session:p15:1",
      turnId: "turn:p15:1",
      stepId: "step:p15:1",
      sourceKind: "model-output",
      sourceEventIds: ["event:p15:model-output"],
      sourceRefs: [sourceRef],
      workspaceRefs: ["workspace:general:1"],
      evidenceRefs: ["evidence:p15:1"],
      requestedUrlRef: "url-ref:p15:display-only",
      sourceBoundary,
      permissionRequest,
      approvalDecision,
      redactionPolicy,
      mockProjection,
      auditSummary,
      capabilityStatus: "preview",
      createdAt,
      schemaVersion: P15_COOKIE_READER_SCHEMA_VERSION,
      outputState: "Cookie-backed Reader Contract Preview",
    } satisfies CookieReaderRequestEnvelope);
    expect(envelope.outputState).toBe(P15_COOKIE_READER_OUTPUT_STATE);
  });

  it("keeps source refs explicit and display-only", () => {
    expect(sourceRef).toEqual({
      sourceRefId: "source:p15:1",
      sourceProfile: "luogu",
      displayOrigin: "https://www.luogu.com.cn/problem/P1000",
      domainPolicy: "display-only",
      authMaterialPolicy: "redacted-ref-only",
      networkPolicy: "none",
      cookiePolicy: "fixture-only",
      privateContentPolicy: "opaque-ref-only",
      fixturePolicy: "deterministic-fixture",
      consentStatus: "future-review-required",
      blockedReasons: [],
    });
    expect(sourceBoundary.displayOnly).toBe(true);
    expect(sourceBoundary.requiredConsent).toBe("future-review-required");
  });

  it("restricts reader capability status to preview-only P15 statuses", () => {
    expect(P15_COOKIE_READER_CAPABILITY_STATUSES).toEqual([
      "preview",
      "reserved",
      "unavailable",
      "denied",
      "blocked",
    ]);
  });

  it("defines the successful P15 reader event taxonomy", () => {
    expect(P15_COOKIE_READER_SUCCESSFUL_EVENT_TYPES).toEqual([
      "cookieReader.requested",
      "cookieReader.classified",
      "cookieReader.permission.required",
      "cookieReader.permission.resolved",
      "cookieReader.mock.projected",
      "cookieReader.audit.recorded",
      "cookieReader.blocked",
      "cookieReader.unavailable",
    ]);

    for (const eventType of P15_COOKIE_READER_SUCCESSFUL_EVENT_TYPES) {
      expect(isSuccessfulP15CookieReaderEventType(eventType)).toBe(true);
    }
  });

  it("keeps future true-read events out of successful P15 preview events", () => {
    expect(P15_RESERVED_TRUE_READ_EVENT_TYPES).toEqual([
      "cookieReader.cookie.loaded",
      "cookieReader.browser.extracted",
      "cookieReader.network.started",
      "cookieReader.network.completed",
      "cookieReader.storage.persisted",
    ]);

    for (const reservedEventType of P15_RESERVED_TRUE_READ_EVENT_TYPES) {
      expect(isReservedP15CookieReaderEventType(reservedEventType)).toBe(true);
      expect(isSuccessfulP15CookieReaderEventType(reservedEventType)).toBe(false);
    }
  });

  it("keeps the stringified successful contract surface free of true-read events and secret classes", () => {
    const successfulContractSurface = JSON.stringify({
      outputState: P15_COOKIE_READER_OUTPUT_STATE,
      successfulEvents: P15_COOKIE_READER_SUCCESSFUL_EVENT_TYPES,
      statuses: P15_COOKIE_READER_CAPABILITY_STATUSES,
    });
    const blockedTerms = [
      "cookie.loaded",
      "browser.extracted",
      "network.started",
      "network.completed",
      "storage.persisted",
      "Authori" + "zation",
      "api" + "Key",
      "OPENAI_" + "API_KEY",
      "ANTHROPIC_" + "API_KEY",
      "sk-" + "test",
    ];

    for (const term of blockedTerms) {
      expect(successfulContractSurface).not.toContain(term);
    }
  });
});
