import { describe, expect, it } from "vitest";

import {
  P15_COOKIE_READER_MOCK_FIXTURE_PROJECTION_SCHEMA_VERSION,
  projectMockCookieReaderFixture,
  type MockCookieReaderFixtureInput,
} from "./mockCookieReaderProjection";

describe("P15 mock cookie reader fixture projection", () => {
  const createdAt = "2026-07-08T00:00:00.000Z";

  const unsafeFixture = {
    fixtureId: "fixture:p15:luogu:deterministic-1",
    readerRequestId: "reader:p15:mock-fixture",
    sourceProfile: "luogu",
    displayOrigin: "https://www.luogu.com.cn/problem/P1000?session=private",
    title: "P1000 A+B Problem Cookie=luogu_session=private",
    excerpt:
      "Visible fixture body plus Authorization: Bearer private-auth-value, sk-private-key, session token private-token, and private note content.",
    evidenceRefs: [
      "evidence:p15:safe-a",
      "notes/private.md",
      "Cookie: luogu_session=private-cookie",
      "Authorization: Bearer private-auth-value",
      "sk-private-key",
      "raw provider payload: full authenticated page",
      "raw tool output: private browser dump",
    ],
    redactionMarkers: ["cookie", "authorization-header", "api-key", "session-token", "private-note-content"],
    blockedReasons: [],
    unavailableReasons: [],
    sensitiveInput: {
      cookieValue: "luogu_session=private-cookie",
      authorizationHeader: "Bearer private-auth-value",
      apiKey: "sk-private-key",
      sessionToken: "private-token",
      privateNoteContent: "private note content",
      rawProviderPayload: "full authenticated page",
      rawToolOutput: "private browser dump",
    },
    createdAt,
  } satisfies MockCookieReaderFixtureInput;

  it("projects a deterministic safe fixture metadata envelope", () => {
    const firstProjection = projectMockCookieReaderFixture(unsafeFixture);
    const secondProjection = projectMockCookieReaderFixture(unsafeFixture);

    expect(firstProjection).toEqual(secondProjection);
    expect(firstProjection).toEqual({
      mockProjectionId: "reader:p15:mock-fixture:mock-fixture-projection:fixture-only",
      readerRequestId: "reader:p15:mock-fixture",
      mode: "fixture-only",
      status: "projected",
      fixtureId: "fixture:p15:luogu:deterministic-1",
      sourceProfile: "luogu",
      displayOrigin: "https://www.luogu.com.cn/problem/P1000",
      safeTitle: "P1000 A+B Problem [redacted]",
      safeExcerpt:
        "Visible fixture body plus [redacted], [redacted], session token [redacted], and [redacted].",
      sanitizedEvidenceRefs: ["evidence:p15:safe-a"],
      redactionMarkers: ["cookie", "authorization-header", "api-key", "session-token", "private-note-content"],
      blockedReasons: [],
      unavailableReasons: [],
      schemaVersion: P15_COOKIE_READER_MOCK_FIXTURE_PROJECTION_SCHEMA_VERSION,
      createdAt,
    });
  });

  it("marks blocked and unavailable fixture projections without true reader behavior", () => {
    const blockedProjection = projectMockCookieReaderFixture({
      ...unsafeFixture,
      blockedReasons: ["source_profile_blocked"],
      unavailableReasons: [],
    });
    const unavailableProjection = projectMockCookieReaderFixture({
      ...unsafeFixture,
      blockedReasons: [],
      unavailableReasons: ["cookie_reader_unavailable_in_p15"],
    });

    expect(blockedProjection.status).toBe("blocked");
    expect(blockedProjection.mode).toBe("blocked");
    expect(blockedProjection.blockedReasons).toEqual(["source_profile_blocked"]);
    expect(unavailableProjection.status).toBe("unavailable");
    expect(unavailableProjection.mode).toBe("unavailable");
    expect(unavailableProjection.unavailableReasons).toEqual(["cookie_reader_unavailable_in_p15"]);
  });

  it("does not call network, browser cookie, browser storage, Tauri, provider or persistence APIs", () => {
    const calls: string[] = [];
    const trap = (name: string) => () => {
      calls.push(name);
      throw new Error(`${name} must not be called by a mock fixture projector`);
    };
    const previousFetch = globalThis.fetch;
    const previousDocument = (globalThis as { document?: unknown }).document;
    const previousChrome = (globalThis as { chrome?: unknown }).chrome;
    const previousBrowser = (globalThis as { browser?: unknown }).browser;
    const previousStorage = (globalThis as { [key: string]: unknown })["local" + "Storage"];
    const previousIndexedDb = (globalThis as { [key: string]: unknown })["indexed" + "DB"];
    const previousInvoke = (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

    try {
      Object.defineProperty(globalThis, "fetch", { configurable: true, value: trap("network") });
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: { get cookie() { return trap("document-cookie")(); } },
      });
      Object.defineProperty(globalThis, "chrome", {
        configurable: true,
        value: { cookies: { get: trap("chrome-cookie") } },
      });
      Object.defineProperty(globalThis, "browser", {
        configurable: true,
        value: { cookies: { get: trap("browser-cookie") } },
      });
      Object.defineProperty(globalThis, "local" + "Storage", {
        configurable: true,
        value: { getItem: trap("browser-storage") },
      });
      Object.defineProperty(globalThis, "indexed" + "DB", { configurable: true, value: { open: trap("db") } });
      Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
        configurable: true,
        value: { invoke: trap("tauri") },
      });

      expect(projectMockCookieReaderFixture(unsafeFixture).status).toBe("projected");
      expect(calls).toEqual([]);
    } finally {
      restoreGlobal("fetch", previousFetch);
      restoreGlobal("document", previousDocument);
      restoreGlobal("chrome", previousChrome);
      restoreGlobal("browser", previousBrowser);
      restoreGlobal("local" + "Storage", previousStorage);
      restoreGlobal("indexed" + "DB", previousIndexedDb);
      restoreGlobal("__TAURI_INTERNALS__", previousInvoke);
    }
  });

  it("does not expose cookie, authorization, api key, session token, note content or raw payloads", () => {
    const projection = projectMockCookieReaderFixture(unsafeFixture);
    const serialized = JSON.stringify(projection);

    for (const unsafeValue of Object.values(unsafeFixture.sensitiveInput)) {
      expect(serialized).not.toContain(unsafeValue);
    }

    expect(serialized).not.toContain("notes/private.md");
    expect(serialized).not.toContain("Cookie: luogu_session");
    expect(serialized).not.toContain("Authorization: Bearer");
    expect(serialized).not.toContain("sk-private-key");
    expect(serialized).not.toContain("full authenticated page");
    expect(serialized).not.toContain("private browser dump");
  });
});

function restoreGlobal(name: string, value: unknown): void {
  if (value === undefined) {
    Reflect.deleteProperty(globalThis, name);
    return;
  }

  Object.defineProperty(globalThis, name, { configurable: true, value });
}
