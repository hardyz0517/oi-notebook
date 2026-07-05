import { describe, expect, it } from "vitest";

import { createInMemoryResearchCacheManager, deriveResearchCacheKey } from "./cacheManager";

describe("research cache manager", () => {
  it("creates stable namespaced cache keys", () => {
    expect(deriveResearchCacheKey("search", ["  example.com  ", "query"])).toBe("search:example.com:query");
  });

  it("stores and clears namespaced entries", () => {
    const cache = createInMemoryResearchCacheManager();
    cache.set({ key: "search:a", namespace: "search", value: { ok: true } });
    cache.set({ key: "read:a", namespace: "read", value: { ok: true } });

    expect(cache.snapshot()).toEqual({
      entryCount: 2,
      namespaces: { search: 1, read: 1, extract: 0, evidence: 0, workspace: 0 },
    });

    cache.clear("search");
    expect(cache.snapshot()).toEqual({
      entryCount: 1,
      namespaces: { search: 0, read: 1, extract: 0, evidence: 0, workspace: 0 },
    });
  });
});
