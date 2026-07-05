import { describe, expect, it } from "vitest";

import { parseFrontmatterFields } from "./frontmatter";
import {
  getLuoguArticleBody,
  getLuoguArticleSyncState,
  readLuoguArticleMetadata,
  writeLuoguArticleMetadata,
} from "./luoguArticleSync";

describe("luoguArticleSync", () => {
  it("extracts the markdown body for upload", () => {
    expect(getLuoguArticleBody("---\na: b\n---\nBody")).toBe("Body");
  });

  it("derives sync state from frontmatter and cookie state", () => {
    const parsed = parseFrontmatterFields([
      "---",
      "luogu_article_id: s58xwevf",
      "luogu_article_title: Remote title",
      "---",
      "Body",
    ].join("\n"));

    expect(getLuoguArticleSyncState(parsed, true)).toEqual({
      canSync: true,
      canPull: true,
      hasBinding: true,
      hasCookie: true,
    });
    expect(getLuoguArticleSyncState(parsed, false)).toEqual({
      canSync: false,
      canPull: false,
      hasBinding: true,
      hasCookie: false,
    });
  });

  it("reads and writes luogu article metadata", () => {
    const parsed = parseFrontmatterFields([
      "---",
      "title: Local title",
      "luogu_article_id: s58xwevf",
      "luogu_article_title: Remote title",
      "luogu_article_category: 2",
      "luogu_article_status: 2",
      "luogu_article_top: 2",
      "luogu_article_solution_for: P1234",
      "---",
      "Body",
    ].join("\n"));

    expect(readLuoguArticleMetadata(parsed)).toEqual({
      lid: "s58xwevf",
      title: "Remote title",
      category: 2,
      status: 2,
      top: 2,
      solutionFor: "P1234",
    });

    const updated = writeLuoguArticleMetadata(parsed, {
      lid: "abc123",
      title: "Updated title",
      category: 2,
      status: 1,
      top: 3,
      solutionFor: "P9999",
      syncedAt: "2026-06-29T12:00:00.000Z",
    });

    expect(updated.luogu_article_id).toBe("abc123");
    expect(updated.luogu_article_title).toBe("Updated title");
    expect(updated.luogu_article_category).toBe("2");
    expect(updated.luogu_article_status).toBe("1");
    expect(updated.luogu_article_top).toBe("3");
    expect(updated.luogu_article_solution_for).toBe("P9999");
    expect(updated.luogu_article_synced_at).toBe("2026-06-29T12:00:00.000Z");
  });

  it("prefers the luogu title but falls back to the local title", () => {
    const parsed = parseFrontmatterFields([
      "---",
      "title: Local title",
      "luogu_article_id: s58xwevf",
      "---",
      "Body",
    ].join("\n"));

    expect(readLuoguArticleMetadata(parsed).title).toBe("Local title");
  });

  it("defaults new articles to a valid Luogu category", () => {
    const parsed = parseFrontmatterFields([
      "---",
      "title: Local title",
      "---",
      "Body",
    ].join("\n"));

    expect(readLuoguArticleMetadata(parsed).category).toBe(1);
  });

  it("normalizes invalid new-article status to a valid Luogu status", () => {
    const parsed = parseFrontmatterFields([
      "---",
      "title: Local title",
      "luogu_article_status: 0",
      "---",
      "Body",
    ].join("\n"));

    expect(readLuoguArticleMetadata(parsed).status).toBe(2);
  });

  it("keeps solution problem id only for solution articles", () => {
    const nonSolution = parseFrontmatterFields([
      "---",
      "title: Local title",
      "luogu_article_category: 1",
      "luogu_article_solution_for: P1001",
      "---",
      "Body",
    ].join("\n"));
    const solution = parseFrontmatterFields([
      "---",
      "title: Local title",
      "luogu_article_category: 2",
      "luogu_article_solution_for: P1001",
      "---",
      "Body",
    ].join("\n"));

    expect(readLuoguArticleMetadata(nonSolution).solutionFor).toBe("");
    expect(readLuoguArticleMetadata(solution).solutionFor).toBe("P1001");
  });

  it("normalizes numeric solution problem ids to Luogu pid format", () => {
    const parsed = parseFrontmatterFields([
      "---",
      "title: Local title",
      "luogu_article_category: 2",
      "luogu_article_solution_for: 1114",
      "---",
      "Body",
    ].join("\n"));

    expect(readLuoguArticleMetadata(parsed).solutionFor).toBe("P1114");
  });
});
