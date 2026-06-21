import { describe, expect, it } from "vitest";

import {
  getArticlesHref,
  getCollectionHref,
  getHomeHref,
  getNoteHref,
  getNoteReturnTargetFromHash,
  getRouteFromHash,
  getRouteReturnHref,
  getSearchHref,
  getTagHref,
  isSafeReturnPath,
} from "./blogRoutes";

describe("blogRoutes", () => {
  it("parses list, detail, search, and legacy category routes from hash strings", () => {
    expect(getRouteFromHash("#/")).toEqual({ name: "home", page: 1 });
    expect(getRouteFromHash("#/?page=3")).toEqual({ name: "home", page: 3 });
    expect(getRouteFromHash("#/articles?page=2&year=2026")).toEqual({ name: "articles", page: 2, year: "2026" });
    expect(getRouteFromHash("#/note/tricks%2Fbinary.md")).toEqual({
      name: "note",
      encodedPath: "tricks%2Fbinary.md",
      relativePath: "tricks/binary.md",
    });
    expect(getRouteFromHash("#/tags/%E5%9B%BE%E8%AE%BA?page=2")).toEqual({ name: "tag", tag: "\u56fe\u8bba", page: 2 });
    expect(getRouteFromHash("#/category/%E9%A2%98%E8%A7%A3")).toEqual({ name: "collection", collection: "\u9898\u89e3", page: 1 });
    expect(getRouteFromHash("#/search?q=dp%20opt&page=4")).toEqual({ name: "search", query: "dp opt", page: 4 });
  });

  it("builds stable hash hrefs for blog routes and note return links", () => {
    expect(getHomeHref()).toBe("#/");
    expect(getHomeHref(2)).toBe("#/?page=2");
    expect(getArticlesHref(3, "2025")).toBe("#/articles?year=2025&page=3");
    expect(getTagHref("\u52a8\u6001\u89c4\u5212", 2)).toBe("#/tags/%E5%8A%A8%E6%80%81%E8%A7%84%E5%88%92?page=2");
    expect(getCollectionHref("\u9898\u89e3")).toBe("#/collections/%E9%A2%98%E8%A7%A3");
    expect(getSearchHref(" dp opt ", 2)).toBe("#/search?q=dp+opt&page=2");
    expect(getNoteHref("tricks/binary.md", "#/search?q=dp&page=2")).toBe(
      "#/note/tricks%2Fbinary.md?from=%2Fsearch%3Fq%3Ddp%26page%3D2",
    );
  });

  it("derives safe note return targets and rejects unsafe return paths", () => {
    expect(isSafeReturnPath("/search?q=dp&page=2")).toBe(true);
    expect(isSafeReturnPath("/collections/\u9898\u89e3")).toBe(true);
    expect(isSafeReturnPath("//evil.example")).toBe(false);
    expect(isSafeReturnPath("https://evil.example")).toBe(false);
    expect(isSafeReturnPath("/note/tricks.md")).toBe(false);
    expect(isSafeReturnPath("/search\u0000?q=dp")).toBe(false);

    expect(getNoteReturnTargetFromHash("#/note/a.md?from=%2Fsearch%3Fq%3Ddp")).toEqual({
      href: "#/search?q=dp",
      label: "\u8fd4\u56de\u641c\u7d22",
    });
    expect(getNoteReturnTargetFromHash("#/note/a.md?from=%2Fnote%2Fsecret.md")).toEqual({
      href: "#/articles",
      label: "\u8fd4\u56de\u6587\u7ae0\u5217\u8868",
    });
  });

  it("creates route return hrefs for non-note routes", () => {
    expect(getRouteReturnHref({ name: "home", page: 2 })).toBe("#/?page=2");
    expect(getRouteReturnHref({ name: "articles", page: 1, year: "2026" })).toBe("#/articles?year=2026");
    expect(getRouteReturnHref({ name: "tags", page: 2 })).toBe("#/tags?page=2");
    expect(getRouteReturnHref({ name: "tag", tag: "\u6700\u77ed\u8def", page: 3 })).toBe("#/tags/%E6%9C%80%E7%9F%AD%E8%B7%AF?page=3");
    expect(getRouteReturnHref({ name: "collections", page: 2 })).toBe("#/collections?page=2");
    expect(getRouteReturnHref({ name: "collection", collection: "\u590d\u76d8", page: 4 })).toBe("#/collections/%E5%A4%8D%E7%9B%98?page=4");
    expect(getRouteReturnHref({ name: "search", query: "graph", page: 2 })).toBe("#/search?q=graph&page=2");
  });
});
