import { describe, expect, it } from "vitest";

import {
  P12_REQUEST_LOG_REDACTION_POLICY_ID,
  REQUEST_AUDIT_LOG_SAFE_FIELDS,
  REQUEST_LOG_REDACTION_CLASSES,
  classifyRequestLogField,
  createRequestAuditLogRecord,
  redactRequestLogValue,
} from "./requestLogPolicy";
import type { RequestAuditLogRecord, RequestLogRedactionClass } from "./requestLogPolicy";

describe("P12 safe request log redaction policy", () => {
  it("creates request audit log records with only the frozen safe fields", () => {
    const record = createRequestAuditLogRecord({
      requestLogId: "request-log:p12:1",
      sessionId: "session:p12:1",
      turnId: "turn:p12:1",
      stepId: "step:p12:1",
      providerId: "provider:openai-compatible",
      modelId: "model:gpt-preview",
      requestKind: "model-request",
      permissionDecisionId: "permission:readonly:1",
      redactionDecisionId: "redaction:p12:1",
      secretRefId: "secret-ref:provider-key:opaque",
      contextBuildId: "context:p12:1",
      eventIds: ["event:p12:1", "event:p12:2"],
      safeInputSummary: "Redacted user task summary.",
      safeOutputSummary: "Redacted model result summary.",
      usageSummary: {
        inputTokens: 12,
        outputTokens: 34,
        totalTokens: 46,
      },
      status: "completed",
      safeError: undefined,
      createdAt: "2026-07-07T00:00:00.000Z",
    });

    expect(Object.keys(record).sort()).toEqual([...REQUEST_AUDIT_LOG_SAFE_FIELDS].sort());
    expect(record).toEqual({
      requestLogId: "request-log:p12:1",
      sessionId: "session:p12:1",
      turnId: "turn:p12:1",
      stepId: "step:p12:1",
      providerId: "provider:openai-compatible",
      modelId: "model:gpt-preview",
      requestKind: "model-request",
      permissionDecisionId: "permission:readonly:1",
      redactionDecisionId: "redaction:p12:1",
      secretRefId: "secret-ref:provider-key:opaque",
      contextBuildId: "context:p12:1",
      eventIds: ["event:p12:1", "event:p12:2"],
      safeInputSummary: "Redacted user task summary.",
      safeOutputSummary: "Redacted model result summary.",
      usageSummary: {
        inputTokens: 12,
        outputTokens: 34,
        totalTokens: 46,
      },
      status: "completed",
      safeError: undefined,
      createdAt: "2026-07-07T00:00:00.000Z",
      schemaVersion: 1,
    } satisfies RequestAuditLogRecord);
  });

  it("drops API key, Authorization header, Cookie, raw provider payloads, raw tool output, and real notes/ content", () => {
    const record = createRequestAuditLogRecord({
      requestLogId: "request-log:p12:redacted",
      sessionId: "session:p12:redacted",
      turnId: "turn:p12:redacted",
      providerId: "provider:redacted",
      modelId: "model:redacted",
      requestKind: "model-request",
      permissionDecisionId: "permission:redacted",
      redactionDecisionId: "redaction:redacted",
      secretRefId: "secret-ref:kept-opaque",
      contextBuildId: "context:redacted",
      eventIds: ["event:redacted"],
      safeInputSummary: redactRequestLogValue({
        redactionClass: "provider-payload",
        value:
          "raw provider payload with apiKey sk-test-1234567890 and Authorization: Bearer secret-token and Cookie: sid=secret",
      }),
      safeOutputSummary: redactRequestLogValue({
        redactionClass: "tool-output",
        value: "raw tool output with private notes/real-note.md content: Fenwick tree proof details",
      }),
      safeError: redactRequestLogValue({
        redactionClass: "local-note",
        value: "real note content from notes/private.md should never persist",
      }),
      usageSummary: {
        requestCount: 1,
      },
      status: "failed",
      createdAt: "2026-07-07T00:00:01.000Z",
      unsafeInput: {
        apiKey: "sk-test-1234567890",
        authorizationHeader: "Authorization: Bearer secret-token",
        cookie: "Cookie: sid=secret",
        rawProviderRequest: { prompt: "raw provider request" },
        rawProviderResponse: { completion: "raw provider response" },
        rawToolOutput: "raw tool output",
        realNoteContent: "Fenwick tree proof details",
      },
    });

    const serialized = JSON.stringify(record);

    expect(record.safeInputSummary).toBe("[redacted:provider-payload]");
    expect(record.safeOutputSummary).toBe("[redacted:tool-output]");
    expect(record.safeError).toBe("[redacted:local-note]");
    expect(serialized).toContain("secret-ref:kept-opaque");
    expect(serialized).not.toContain("sk-test-1234567890");
    expect(serialized).not.toContain("Bearer secret-token");
    expect(serialized).not.toContain("sid=secret");
    expect(serialized).not.toContain("raw provider request");
    expect(serialized).not.toContain("raw provider response");
    expect(serialized).not.toContain("raw tool output");
    expect(serialized).not.toContain("Fenwick tree proof details");
    expect(serialized).not.toContain("notes/private.md");
    expect(serialized).not.toContain("apiKey");
    expect(serialized).not.toContain("authorizationHeader");
    expect(serialized).not.toContain("cookie");
  });

  it("preserves secretRefId only as an opaque id without exposing the secret value", () => {
    const record = createRequestAuditLogRecord({
      requestLogId: "request-log:p12:secret-ref",
      sessionId: "session:p12:secret-ref",
      turnId: "turn:p12:secret-ref",
      providerId: "provider:secret-ref",
      modelId: "model:secret-ref",
      requestKind: "model-request",
      permissionDecisionId: "permission:secret-ref",
      redactionDecisionId: "redaction:secret-ref",
      secretRefId: "secret-ref:provider:openai:primary",
      contextBuildId: "context:secret-ref",
      eventIds: [],
      safeInputSummary: redactRequestLogValue({
        redactionClass: "secret",
        value: "OPENAI_API_KEY=sk-test-secret-value",
      }),
      safeOutputSummary: "No provider payload retained.",
      status: "blocked",
      createdAt: "2026-07-07T00:00:02.000Z",
      unsafeInput: {
        api_key: "sk-test-secret-value",
      },
    });

    const serialized = JSON.stringify(record);

    expect(record.secretRefId).toBe("secret-ref:provider:openai:primary");
    expect(record.safeInputSummary).toBe("[redacted:secret]");
    expect(serialized).not.toContain("OPENAI_API_KEY");
    expect(serialized).not.toContain("sk-test-secret-value");
    expect(serialized).not.toContain("api_key");
  });

  it("freezes request log redaction classes and field classification", () => {
    expect(REQUEST_LOG_REDACTION_CLASSES).toEqual([
      "secret",
      "cookie",
      "local-note",
      "user-input",
      "derived-evidence",
      "provider-payload",
      "tool-output",
      "safe-metadata",
    ] satisfies RequestLogRedactionClass[]);

    expect(classifyRequestLogField("apiKey")).toBe("secret");
    expect(classifyRequestLogField("authorizationHeader")).toBe("secret");
    expect(classifyRequestLogField("cookie")).toBe("cookie");
    expect(classifyRequestLogField("realNoteContent")).toBe("local-note");
    expect(classifyRequestLogField("userInput")).toBe("user-input");
    expect(classifyRequestLogField("derivedEvidence")).toBe("derived-evidence");
    expect(classifyRequestLogField("rawProviderRequest")).toBe("provider-payload");
    expect(classifyRequestLogField("rawProviderResponse")).toBe("provider-payload");
    expect(classifyRequestLogField("rawToolOutput")).toBe("tool-output");
    expect(classifyRequestLogField("providerId")).toBe("safe-metadata");
    expect(P12_REQUEST_LOG_REDACTION_POLICY_ID).toBe("p12-safe-request-log-redaction-v1");
  });

  it("redacts unsafe classes while allowing bounded safe summaries and metadata", () => {
    expect(redactRequestLogValue({ redactionClass: "secret", value: "ANTHROPIC_API_KEY=secret" })).toBe(
      "[redacted:secret]",
    );
    expect(redactRequestLogValue({ redactionClass: "cookie", value: "Cookie: session=secret" })).toBe(
      "[redacted:cookie]",
    );
    expect(redactRequestLogValue({ redactionClass: "local-note", value: "private note" })).toBe(
      "[redacted:local-note]",
    );
    expect(redactRequestLogValue({ redactionClass: "provider-payload", value: { raw: true } })).toBe(
      "[redacted:provider-payload]",
    );
    expect(redactRequestLogValue({ redactionClass: "tool-output", value: "stdout" })).toBe("[redacted:tool-output]");
    expect(
      redactRequestLogValue({
        redactionClass: "user-input",
        value: "raw prompt text",
        safeSummary: "User asked for a proof outline.",
      }),
    ).toBe("User asked for a proof outline.");
    expect(
      redactRequestLogValue({
        redactionClass: "derived-evidence",
        value: "full copied evidence",
        safeSummary: "Evidence ref evidence:1 supports the invariant.",
      }),
    ).toBe("Evidence ref evidence:1 supports the invariant.");
    expect(redactRequestLogValue({ redactionClass: "safe-metadata", value: "provider:openai-compatible" })).toBe(
      "provider:openai-compatible",
    );
  });
});
