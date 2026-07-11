import { describe, expect, it } from "vitest";
import {
  createCookieReaderRequestEnvelope,
  P15_COOKIE_READER_OUTPUT_STATE,
  type CookieReaderRequestEnvelope,
} from "@/lib/agent-runtime/cookieReaderContractTypes";
import { buildCookieReaderSourceBoundaryDecision } from "@/lib/agent-runtime/cookieReaderSourceBoundaryPolicy";
import {
  buildCookieReaderAuditSummary,
  buildCookieReaderRedactionPolicy,
  type CookieReaderSensitiveInput,
} from "@/lib/agent-runtime/cookieReaderRedactionAuditPolicy";
import { projectMockCookieReaderFixture } from "@/lib/agent-runtime/mockCookieReaderProjection";
import { createCookieReaderViewModel } from "./cookieReaderViewModel";

const createdAt = "2026-07-08T00:00:00.000Z";

function createPreviewEnvelope(
  overrides: Partial<{
    sensitiveInput: CookieReaderSensitiveInput;
    blockedReasons: string[];
    unavailableReasons: string[];
  }> = {},
): CookieReaderRequestEnvelope {
  const readerRequestId = "reader:p15:view-model";
  const boundary = buildCookieReaderSourceBoundaryDecision({
    readerRequestId,
    sourceRefId: "source:p15:view-model",
    sourceProfile: "luogu",
    displayOrigin: "https://www.luogu.com.cn/problem/P3379?session=hidden",
    createdAt,
  });
  const redactionPolicy = buildCookieReaderRedactionPolicy({
    redactionPolicyId: `${readerRequestId}:redaction`,
    readerRequestId,
    createdAt,
    sensitiveInput: overrides.sensitiveInput,
  });
  const mockProjection = projectMockCookieReaderFixture({
    fixtureId: "fixture:p15:view-model",
    readerRequestId,
    sourceProfile: boundary.sourceRef.sourceProfile,
    displayOrigin: boundary.sourceRef.displayOrigin,
    title: "P3379 LCA fixture",
    excerpt: "Fixture-only observation for binary lifting.",
    evidenceRefs: ["evidence:p15:view-model"],
    redactionMarkers: redactionPolicy.redactedClasses,
    blockedReasons: overrides.blockedReasons,
    unavailableReasons: overrides.unavailableReasons,
    sensitiveInput: overrides.sensitiveInput,
    createdAt,
  });
  const blockedReasons = [
    ...boundary.blockedReasons,
    ...(overrides.blockedReasons ?? []),
    ...(overrides.unavailableReasons ?? []),
  ];

  return createCookieReaderRequestEnvelope({
    readerRequestId,
    sessionId: "session:p15:view-model",
    turnId: "turn:p15:view-model",
    stepId: "step:p15:view-model",
    sourceKind: "fixture",
    sourceEventIds: ["event:p15:view-model"],
    sourceRefs: [boundary.sourceRef],
    workspaceRefs: ["workspace:p15:view-model"],
    evidenceRefs: ["evidence:p15:view-model"],
    requestedUrlRef: "url-ref:p15:view-model",
    sourceBoundary: boundary.sourceBoundary,
    permissionRequest: {
      permissionRequestId: `${readerRequestId}:permission`,
      readerRequestId,
      requestedSourceProfile: boundary.sourceRef.sourceProfile,
      requestedDisplayOrigin: boundary.sourceRef.displayOrigin,
      decisionStatus: boundary.permissionStatus,
      reviewReason: "P15 preview records permission and consent metadata only.",
      requestedSensitiveInput: redactionPolicy.redactedClasses.length > 0,
      sourceRefs: [boundary.sourceRef.sourceRefId],
      approvalSurface: "workbench-read-only",
      requestedByEventId: "event:p15:view-model",
      createdAt,
    },
    approvalDecision: {
      approvalDecisionId: `${readerRequestId}:approval`,
      permissionRequestId: `${readerRequestId}:permission`,
      readerRequestId,
      status: "pending",
      decidedBy: "p15-preview-policy",
      safeReason: "Future true reader requires a separate safety spec.",
      visibleConsequences: ["No authenticated page body is retained."],
      blockedCapabilities: ["true-cookie-reader", "browser-session-reader"],
      eventIds: ["event:p15:view-model:approval"],
      createdAt,
    },
    redactionPolicy,
    mockProjection,
    auditSummary: buildCookieReaderAuditSummary({
      readerRequestId,
      sourceProfile: boundary.sourceRef.sourceProfile,
      displayOrigin: boundary.sourceRef.displayOrigin,
      capabilityStatus: boundary.capabilityStatus,
      permissionStatus: boundary.permissionStatus,
      redactionStatus: redactionPolicy.redactionStatus,
      blockedReasons,
      fixtureId: mockProjection.fixtureId,
      createdAt,
    }),
    capabilityStatus: boundary.capabilityStatus,
    createdAt,
  });
}

describe("createCookieReaderViewModel", () => {
  it("uses the frozen P15 title and output state exactly", () => {
    const viewModel = createCookieReaderViewModel(createPreviewEnvelope());

    expect(viewModel.title).toBe(P15_COOKIE_READER_OUTPUT_STATE);
    expect(viewModel.outputState).toBe(P15_COOKIE_READER_OUTPUT_STATE);
  });

  it("projects source, permission, redaction, fixture observation, and reason summaries", () => {
    const viewModel = createCookieReaderViewModel(createPreviewEnvelope({
      blockedReasons: ["manual_fixture_only"],
      unavailableReasons: ["real_reader_unavailable_in_p15"],
    }));

    expect(viewModel.source).toMatchObject({
      sourceProfile: "luogu",
      displayOrigin: "https://www.luogu.com.cn/problem/P3379",
      consentStatus: "future-review-required",
      cookiePolicy: "fixture-only",
      networkPolicy: "none",
    });
    expect(viewModel.capabilityStatus).toBe("preview");
    expect(viewModel.permission).toMatchObject({
      decisionStatus: "prompt-required",
      approvalStatus: "pending",
      consentStatus: "future-review-required",
      requestedSensitiveInput: false,
    });
    expect(viewModel.redaction).toMatchObject({
      redactionStatus: "not-needed",
      retainsRawProviderPayload: false,
      retainsRawToolOutput: false,
    });
    expect(viewModel.fixtureObservation).toMatchObject({
      mode: "blocked",
      status: "blocked",
      fixtureId: "fixture:p15:view-model",
      safeTitle: "P3379 LCA fixture",
      safeExcerpt: "Fixture-only observation for binary lifting.",
    });
    expect(viewModel.blockedReasons).toEqual(["manual_fixture_only", "real_reader_unavailable_in_p15"]);
    expect(viewModel.unavailableReasons).toEqual(["real_reader_unavailable_in_p15"]);
  });

  it("does not expose raw Cookie, Authorization, API key, session token, private note content, provider payload, or tool output", () => {
    const sensitiveInput = {
      cookieValue: "secret-cookie-value",
      authorizationHeader: "Bearer private-auth-value",
      apiKey: "sk-testprivatekey",
      sessionToken: "private-session-token",
      privateNoteContent: "private note content: hidden proof",
      rawProviderPayload: "raw provider payload: hidden provider body",
      rawToolOutput: "raw tool output: hidden tool body",
    };
    const viewModel = createCookieReaderViewModel(createPreviewEnvelope({ sensitiveInput }));
    const serialized = JSON.stringify(viewModel);

    expect(serialized).not.toContain("secret-cookie-value");
    expect(serialized).not.toContain("Bearer private-auth-value");
    expect(serialized).not.toContain("sk-testprivatekey");
    expect(serialized).not.toContain("private-session-token");
    expect(serialized).not.toContain("private note content: hidden proof");
    expect(serialized).not.toContain("raw provider payload: hidden provider body");
    expect(serialized).not.toContain("raw tool output: hidden tool body");
    expect(viewModel.redaction.redactedClasses).toEqual([
      "cookie",
      "authorization-header",
      "api-key",
      "session-token",
      "private-note-content",
      "provider-payload",
      "tool-output",
    ]);
  });
});
