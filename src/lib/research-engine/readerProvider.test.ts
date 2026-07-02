import { describe, expect, it } from "vitest";

import { createManualReaderProvider, createLuoguCookieSafetyState, createStrictCookieBoundary, createTauriUrlReaderProvider } from "./readerProvider";

describe("reader provider boundary", () => {
  it("normalizes allowed domains and blocks cookie forwarding", () => {
    expect(createStrictCookieBoundary([" Luogu.com ", "luogu.com", "oi-wiki.org "])).toEqual({
      mode: "blocked",
      allowedDomains: ["luogu.com", "oi-wiki.org"],
      sendCookiesToModel: false,
    });
  });

  it("allows Luogu cookies only for Luogu-owned domains and never for model or third-party payloads", () => {
    expect(createLuoguCookieSafetyState({
      url: "https://www.luogu.com.cn/problem/P3379",
      hasCookie: true,
    })).toEqual({
      status: "available",
      domainAllowed: true,
      mayAttachCookieToReader: true,
      sendCookiesToModel: false,
      sendCookiesToThirdParty: false,
      reason: "luogu_cookie_domain_allowed",
    });

    expect(createLuoguCookieSafetyState({
      url: "https://example.com/problem/P3379",
      hasCookie: true,
    })).toMatchObject({
      status: "blocked",
      domainAllowed: false,
      mayAttachCookieToReader: false,
      reason: "domain_not_allowed",
    });

    expect(createLuoguCookieSafetyState({
      url: "https://www.luogu.com.cn/problem/P3379",
      hasCookie: false,
    })).toMatchObject({
      status: "missing_cookie",
      domainAllowed: true,
      mayAttachCookieToReader: false,
      reason: "luogu_cookie_missing",
    });
  });

  it("reads manual content through the reader provider without cookies", async () => {
    const provider = createManualReaderProvider({
      fixtures: {
        "https://example.com/lca": {
          title: "LCA Notes",
          text: "Binary lifting stores ancestors for each power of two.\n\nQueries lift the deeper node first.",
        },
      },
    });

    const candidate = {
      id: "candidate:manual",
      jobId: "job:manual",
      url: "https://example.com/lca",
      title: "LCA Notes",
      sourceType: "explicit_url" as const,
      priority: "core" as const,
      host: "example.com",
      language: "mixed" as const,
      queryPurpose: "official" as const,
      status: "finished" as const,
      readState: "finished" as const,
      evidence: { level: "none" as const, reliable: false, fresh: false },
      discoveredAt: 1,
    };

    const result = await provider.read({
      request: { userQuestion: "lca" },
      policy: {
        needSearch: true,
        mode: "explicit_url",
        risk: "low",
        freshness: "stable",
        vertical: "explicit_url",
        reason: "test",
        guards: [],
        confidence: 1,
        focusEntities: [],
        locale: "mixed",
        mixedLanguage: true,
        mustUseEvidence: true,
        evidenceRequirement: "medium",
        future: {},
      },
      queryPlan: {
        userQuestion: "lca",
        needSearch: true,
        mode: "explicit_url",
        risk: "low",
        freshness: "stable",
        vertical: "explicit_url",
        locale: "mixed",
        focusEntities: [],
        maxQueries: 1,
        queries: [],
        reason: "test",
        future: {},
      },
      candidate,
    });

    expect(result.status).toBe("fetched");
    expect(result.document?.metadata).toMatchObject({
      title: "LCA Notes",
      canonicalUrl: "https://example.com/lca",
      host: "example.com",
      reliability: "high",
    });
    expect(result.document?.blocks.map((block) => block.type)).toEqual(["heading", "paragraph", "paragraph"]);
  });

  it("adapts the Tauri URL reader transport into a public reader provider result", async () => {
    const provider = createTauriUrlReaderProvider({
      transport: async (input) => ({
        ok: true,
        url: input.url,
        finalUrl: "https://example.com/lca",
        contentType: "text/plain; source=tauri_backend_excerpt",
        sourceContentType: "text/html",
        bodyText: "LCA can be solved with binary lifting.\n\nPreprocess ancestors by powers of two.",
        bodyBytes: 78,
        bodyPreview: "LCA can be solved with binary lifting.",
        bodyPreviewLength: 39,
        truncated: false,
        elapsedMs: 7,
        redactedRequest: {
          method: "GET",
          urlOrigin: "https://example.com",
          urlHost: "example.com",
          headers: { Accept: "text/html, text/plain, application/xhtml+xml" },
          credentials: "omit",
          redactionFields: ["authorization", "cookie"],
          transport: "tauri_backend",
          backendBridgeName: "fetch_web_source_excerpts",
          authorizationUsed: false,
          cookiesUsed: false,
          browserFetchUsed: false,
          browserCorsNotApplicable: true,
          maxBytes: input.maxBodyBytes,
        },
        warnings: ["cache_disabled"],
        backendResult: {} as never,
      }),
    });

    const candidate = {
      id: "candidate:tauri",
      jobId: "job:tauri",
      url: "https://example.com/lca",
      title: "LCA Notes",
      sourceType: "documentation" as const,
      priority: "core" as const,
      host: "example.com",
      language: "en" as const,
      queryPurpose: "official" as const,
      status: "finished" as const,
      readState: "finished" as const,
      evidence: { level: "none" as const, reliable: false, fresh: false },
      discoveredAt: 1,
    };

    const result = await provider.read({
      request: { userQuestion: "lca" },
      policy: {
        needSearch: true,
        mode: "explicit_url",
        risk: "low",
        freshness: "stable",
        vertical: "explicit_url",
        reason: "test",
        guards: [],
        confidence: 1,
        focusEntities: [],
        locale: "mixed",
        mixedLanguage: true,
        mustUseEvidence: true,
        evidenceRequirement: "medium",
        future: {},
      },
      queryPlan: {
        userQuestion: "lca",
        needSearch: true,
        mode: "explicit_url",
        risk: "low",
        freshness: "stable",
        vertical: "explicit_url",
        locale: "mixed",
        focusEntities: [],
        maxQueries: 1,
        queries: [],
        reason: "test",
        future: {},
      },
      candidate,
    });

    expect(result.status).toBe("fetched");
    expect(result.document?.metadata).toMatchObject({
      title: "LCA Notes",
      canonicalUrl: "https://example.com/lca",
      host: "example.com",
      reliability: "medium",
    });
    expect(result.document?.blocks.map((block) => block.type)).toEqual(["heading", "paragraph", "paragraph"]);
    expect(result.diagnostics).toMatchObject({
      transport: "tauri_backend",
      cookiesUsed: false,
      authorizationUsed: false,
      redactedRequest: {
        credentials: "omit",
        cookiesUsed: false,
        authorizationUsed: false,
      },
    });
  });
});
