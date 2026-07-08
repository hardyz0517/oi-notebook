import { describe, expect, it } from "vitest";

import {
  P15_COOKIE_READER_SAFE_AUDIT_FIELDS,
  buildCookieReaderAuditSummary,
  buildCookieReaderRedactionPolicy,
  sanitizeCookieReaderPayloadForProjection,
} from "./cookieReaderRedactionAuditPolicy";

describe("P15 cookie reader redaction and audit policy", () => {
  const createdAt = "2026-07-08T00:00:00.000Z";

  const sensitiveInput = {
    cookieValue: "luogu_session=private-cookie-value",
    authorizationHeader: "Bearer private-authorization-value",
    apiKey: "sk-" + "private-api-key-value",
    api_key: "private_snake_case_api_key_value",
    sessionToken: "private session token value",
    privateNoteContent: "private note content from notes workspace",
    rawProviderPayload: "raw provider payload with private source body",
    rawToolOutput: "raw tool output with authenticated page body",
  };

  const projectionTargets = [
    "modelProviderPayload",
    "thirdPartySearchPayload",
    "requestLog",
    "evidencePayload",
    "workbenchRawView",
    "durableStorageProjection",
  ] as const;

  it("removes Cookie, Authorization, API key, session token and private note content before every projection", () => {
    const sanitized = sanitizeCookieReaderPayloadForProjection({
      readerRequestId: "reader:p15:redaction",
      sourceProfile: "luogu",
      displayOrigin: "https://www.luogu.com.cn/problem/P1000",
      fixtureId: "fixture:p15:luogu:1",
      createdAt,
      sensitiveInput,
    });

    for (const target of projectionTargets) {
      const payload = JSON.stringify(sanitized[target]);

      expect(payload).not.toContain(sensitiveInput.cookieValue);
      expect(payload).not.toContain(sensitiveInput.authorizationHeader);
      expect(payload).not.toContain(sensitiveInput.apiKey);
      expect(payload).not.toContain(sensitiveInput.api_key);
      expect(payload).not.toContain(sensitiveInput.sessionToken);
      expect(payload).not.toContain(sensitiveInput.privateNoteContent);
      expect(payload).toContain("cookie");
      expect(payload).toContain("authorization-header");
      expect(payload).toContain("api-key");
      expect(payload).toContain("session-token");
      expect(payload).toContain("private-note-content");
    }
  });

  it("does not retain raw provider payload or raw tool output", () => {
    const sanitized = sanitizeCookieReaderPayloadForProjection({
      readerRequestId: "reader:p15:raw",
      sourceProfile: "luogu",
      displayOrigin: "https://www.luogu.com.cn/problem/P1000",
      fixtureId: "fixture:p15:luogu:1",
      createdAt,
      sensitiveInput,
    });
    const serialized = JSON.stringify(sanitized);

    expect(serialized).not.toContain(sensitiveInput.rawProviderPayload);
    expect(serialized).not.toContain(sensitiveInput.rawToolOutput);
    expect(serialized).toContain("provider-payload");
    expect(serialized).toContain("tool-output");
  });

  it("builds redaction summaries that report removed classes without keeping original values", () => {
    const redactionPolicy = buildCookieReaderRedactionPolicy({
      redactionPolicyId: "redaction:p15:1",
      readerRequestId: "reader:p15:summary",
      createdAt,
      sensitiveInput,
    });

    expect(redactionPolicy.redactionStatus).toBe("redacted");
    expect(redactionPolicy.redactedClasses).toEqual([
      "cookie",
      "authorization-header",
      "api-key",
      "session-token",
      "private-note-content",
      "provider-payload",
      "tool-output",
    ]);
    expect(redactionPolicy.removedBeforeProviderPayload).toBe(true);
    expect(redactionPolicy.removedBeforeSearchPayload).toBe(true);
    expect(redactionPolicy.removedBeforeRequestLog).toBe(true);
    expect(redactionPolicy.removedBeforeEvidencePayload).toBe(true);
    expect(redactionPolicy.removedBeforeWorkbenchRawView).toBe(true);
    expect(redactionPolicy.removedBeforeDurableStorage).toBe(true);
    expect(redactionPolicy.retainsRawProviderPayload).toBe(false);
    expect(redactionPolicy.retainsRawToolOutput).toBe(false);

    const serialized = JSON.stringify(redactionPolicy);
    for (const value of Object.values(sensitiveInput)) {
      expect(serialized).not.toContain(value);
    }
  });

  it("constructs audit summaries from safe fields only", () => {
    const auditSummary = buildCookieReaderAuditSummary({
      readerRequestId: "reader:p15:audit",
      sourceProfile: "luogu",
      displayOrigin: "https://www.luogu.com.cn/problem/P1000",
      capabilityStatus: "preview",
      permissionStatus: "prompt-required",
      redactionStatus: "redacted",
      blockedReasons: ["real_cookie_access_blocked_in_p15"],
      fixtureId: "fixture:p15:luogu:1",
      createdAt,
      ignoredUnsafeFields: {
        cookieValue: sensitiveInput.cookieValue,
        authorizationHeader: sensitiveInput.authorizationHeader,
        apiKey: sensitiveInput.apiKey,
        rawProviderPayload: sensitiveInput.rawProviderPayload,
        rawToolOutput: sensitiveInput.rawToolOutput,
      },
    });

    expect(Object.keys(auditSummary)).toEqual(P15_COOKIE_READER_SAFE_AUDIT_FIELDS);
    expect(auditSummary).toEqual({
      readerRequestId: "reader:p15:audit",
      sourceProfile: "luogu",
      displayOrigin: "https://www.luogu.com.cn/problem/P1000",
      capabilityStatus: "preview",
      permissionStatus: "prompt-required",
      redactionStatus: "redacted",
      blockedReasons: ["real_cookie_access_blocked_in_p15"],
      fixtureId: "fixture:p15:luogu:1",
      schemaVersion: 1,
      createdAt,
    });

    const serialized = JSON.stringify(auditSummary);
    expect(serialized).not.toContain(sensitiveInput.cookieValue);
    expect(serialized).not.toContain(sensitiveInput.authorizationHeader);
    expect(serialized).not.toContain(sensitiveInput.apiKey);
    expect(serialized).not.toContain(sensitiveInput.rawProviderPayload);
    expect(serialized).not.toContain(sensitiveInput.rawToolOutput);
  });
});
