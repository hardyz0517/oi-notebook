import { describe, expect, it } from "vitest";

import {
  buildCookieReaderSourceBoundaryDecision,
  P15_COOKIE_READER_SOURCE_PROFILES,
} from "./cookieReaderSourceBoundaryPolicy";

describe("P15 cookie reader source boundary policy", () => {
  const createdAt = "2026-07-08T00:00:00.000Z";

  it("maps every source profile to an explicit P15 boundary decision", () => {
    expect(P15_COOKIE_READER_SOURCE_PROFILES).toEqual([
      "luogu",
      "workspace-fixture",
      "manual-fixture",
      "replay-fixture",
      "unsupported",
      "reserved-future-source",
    ]);

    const decisions = P15_COOKIE_READER_SOURCE_PROFILES.map((sourceProfile) =>
      buildCookieReaderSourceBoundaryDecision({
        readerRequestId: `reader:p15:${sourceProfile}`,
        sourceRefId: `source:p15:${sourceProfile}`,
        sourceProfile,
        displayOrigin: `display:${sourceProfile}`,
        createdAt,
      }),
    );

    expect(decisions.map((decision) => decision.sourceRef.sourceProfile)).toEqual(P15_COOKIE_READER_SOURCE_PROFILES);
    expect(decisions.map((decision) => decision.capabilityStatus)).toEqual([
      "preview",
      "preview",
      "preview",
      "preview",
      "unavailable",
      "reserved",
    ]);
    expect(decisions.map((decision) => decision.permissionStatus)).toEqual([
      "prompt-required",
      "prompt-required",
      "prompt-required",
      "prompt-required",
      "unavailable",
      "reserved",
    ]);
  });

  it("keeps P15 defaults fixture-only or blocked with no network access", () => {
    const fixtureDecision = buildCookieReaderSourceBoundaryDecision({
      readerRequestId: "reader:p15:fixture",
      sourceRefId: "source:p15:fixture",
      sourceProfile: "workspace-fixture",
      displayOrigin: "workspace://fixture/luogu/P1000",
      createdAt,
    });

    expect(fixtureDecision.sourceRef.networkPolicy).toBe("none");
    expect(fixtureDecision.sourceRef.cookiePolicy).toBe("fixture-only");
    expect(fixtureDecision.sourceRef.authMaterialPolicy).toBe("not-present");
    expect(fixtureDecision.sourceRef.privateContentPolicy).toBe("fixture-only");
    expect(fixtureDecision.sourceRef.fixturePolicy).toBe("deterministic-fixture");
    expect(fixtureDecision.blockedReasons).toEqual([]);

    const blockedDecision = buildCookieReaderSourceBoundaryDecision({
      readerRequestId: "reader:p15:blocked",
      sourceRefId: "source:p15:blocked",
      sourceProfile: "unsupported",
      displayOrigin: "https://unsupported.example/private",
      createdAt,
    });

    expect(blockedDecision.sourceRef.networkPolicy).toBe("none");
    expect(blockedDecision.sourceRef.cookiePolicy).toBe("blocked");
    expect(blockedDecision.sourceRef.authMaterialPolicy).toBe("unsupported");
    expect(blockedDecision.sourceRef.privateContentPolicy).toBe("unsupported");
    expect(blockedDecision.sourceRef.blockedReasons).toContain("unsupported_source_profile");
  });

  it("blocks requests for real Cookie, browser Cookie, storage, forwarding or private note content", () => {
    const decision = buildCookieReaderSourceBoundaryDecision({
      readerRequestId: "reader:p15:sensitive",
      sourceRefId: "source:p15:sensitive",
      sourceProfile: "luogu",
      displayOrigin: "https://www.luogu.com.cn/problem/P1000",
      requestedRealCookie: true,
      requestedBrowserCookie: true,
      requestedCookieStorage: true,
      requestedThirdPartyCookieForwarding: true,
      requestedPrivateNoteContent: true,
      createdAt,
    });

    expect(decision.capabilityStatus).toBe("blocked");
    expect(decision.permissionStatus).toBe("blocked-by-configuration");
    expect(decision.sourceRef.authMaterialPolicy).toBe("blocked");
    expect(decision.sourceRef.cookiePolicy).toBe("blocked");
    expect(decision.sourceRef.privateContentPolicy).toBe("blocked");
    expect(decision.blockedReasons).toEqual([
      "real_cookie_access_blocked_in_p15",
      "browser_cookie_access_blocked_in_p15",
      "cookie_storage_blocked_in_p15",
      "third_party_cookie_forwarding_blocked_in_p15",
      "private_note_content_blocked_in_p15",
    ]);
  });

  it("treats display origins as display-only metadata and never fetch targets", () => {
    const decision = buildCookieReaderSourceBoundaryDecision({
      readerRequestId: "reader:p15:display",
      sourceRefId: "source:p15:display",
      sourceProfile: "luogu",
      displayOrigin: "https://www.luogu.com.cn/problem/P1000",
      createdAt,
    });

    expect(decision.sourceBoundary.displayOrigin).toBe("https://www.luogu.com.cn/problem/P1000");
    expect(decision.sourceBoundary.displayOnly).toBe(true);
    expect(decision.fetchTarget).toBeUndefined();
    expect(Object.keys(decision)).not.toContain("fetchUrl");
    expect(Object.keys(decision.sourceBoundary)).not.toContain("fetchTarget");
  });
});
