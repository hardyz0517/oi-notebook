import { describe, expect, it } from "vitest";

import { createKeylessBingSearchProvider, createManualSearchProvider, createTavilyReadySearchProvider, createEmptySearchProviderResult } from "./searchProvider";

describe("search provider boundary", () => {
  it("creates a normalized empty result shell", () => {
    expect(createEmptySearchProviderResult("manual")).toEqual({
      providerName: "manual",
      providerMode: "search",
      rawResults: [],
      warnings: [],
      errors: [],
    });
  });

  it("keeps Tavily unavailable without configuration instead of calling a transport", async () => {
    let called = false;
    const provider = createTavilyReadySearchProvider({
      apiKey: "",
      transport: async () => {
        called = true;
        return [];
      },
    });

    const result = await provider.search({
      request: { userQuestion: "lca" },
      policy: {
        needSearch: true,
        mode: "general_web",
        risk: "low",
        freshness: "stable",
        vertical: "general_web",
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
        mode: "general_web",
        risk: "low",
        freshness: "stable",
        vertical: "general_web",
        locale: "mixed",
        focusEntities: [],
        maxQueries: 1,
        queries: [],
        reason: "test",
        future: {},
      },
      queryText: "lca",
      allowPublicWeb: true,
    });

    expect(called).toBe(false);
    expect(result).toMatchObject({
      providerName: "tavily",
      rawResults: [],
      warnings: ["tavily_not_configured"],
      diagnostics: { status: "unavailable" },
    });
  });

  it("uses the Tavily transport only when configuration is present", async () => {
    const provider = createTavilyReadySearchProvider({
      apiKey: "tvly-test-key",
      transport: async (input) => [{
        provider: "custom",
        query: input.queryText,
        queryPurpose: "recall",
        resultIndex: 0,
        url: "https://example.com/tavily",
        title: "Tavily Result",
      }],
    });

    const result = await provider.search({
      request: { userQuestion: "lca" },
      policy: {
        needSearch: true,
        mode: "general_web",
        risk: "low",
        freshness: "stable",
        vertical: "general_web",
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
        mode: "general_web",
        risk: "low",
        freshness: "stable",
        vertical: "general_web",
        locale: "mixed",
        focusEntities: [],
        maxQueries: 1,
        queries: [],
        reason: "test",
        future: {},
      },
      queryText: "lca",
      allowPublicWeb: true,
    });

    expect(result).toMatchObject({
      providerName: "tavily",
      rawResults: [{ url: "https://example.com/tavily" }],
      diagnostics: { status: "available" },
    });
  });

  it("adapts keyless Bing into the public search provider boundary without credentials", async () => {
    const provider = createKeylessBingSearchProvider({
      executor: async (options) => ({
        ok: true,
        providerName: "bing",
        status: "available",
        rawResults: [{
          provider: "bing",
          query: options.query,
          queryPurpose: options.queryPurpose ?? "recall",
          resultIndex: 0,
          url: "https://example.com/lca",
          title: "LCA Notes",
        }],
        warnings: [],
        errors: [],
        elapsedMs: 5,
        diagnostics: {
          apiKeyRequired: false,
          credentials: "omit",
        },
      }),
    });

    const result = await provider.search({
      request: { userQuestion: "lca" },
      policy: {
        needSearch: true,
        mode: "general_web",
        risk: "low",
        freshness: "stable",
        vertical: "general_web",
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
        mode: "general_web",
        risk: "low",
        freshness: "stable",
        vertical: "general_web",
        locale: "mixed",
        focusEntities: [],
        maxQueries: 1,
        queries: [{
          query: "lca",
          language: "mixed",
          purpose: "recall",
          priority: 1,
          expectedSourceTypes: ["technical_blog"],
        }],
        reason: "test",
        future: {},
      },
      queryText: "lca",
      allowPublicWeb: true,
    });

    expect(result.providerName).toBe("bing");
    expect(result.rawResults[0]?.url).toBe("https://example.com/lca");
    expect(result.diagnostics).toMatchObject({
      publicProvider: "keyless_bing",
      apiKeyRequired: false,
      credentials: "omit",
    });
  });

  it("discovers manually supplied URLs without public network", async () => {
    const provider = createManualSearchProvider({
      sources: [{
        url: "https://example.com/lca",
        title: "LCA Notes",
        snippet: "binary lifting",
      }],
    });

    const result = await provider.search({
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
      queryText: "https://example.com/lca",
      allowPublicWeb: false,
    });

    expect(result).toMatchObject({
      providerName: "manual",
      rawResults: [{
        provider: "manual",
        url: "https://example.com/lca",
        title: "LCA Notes",
        snippet: "binary lifting",
      }],
      diagnostics: {
        credentialPolicy: "none",
        networkUsed: false,
      },
    });
  });
});
