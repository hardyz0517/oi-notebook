import { describe, expect, it } from "vitest";

import { mergeFrontmatterFields, parseFrontmatterFields } from "./frontmatter";

describe("frontmatter luogu article fields", () => {
  it("parses luogu article fields", () => {
    const markdown = [
      "---",
      "title: Local title",
      "luogu_article_id: s58xwevf",
      "luogu_article_title: Remote title",
      "luogu_article_category: 1",
      "luogu_article_status: 0",
      "luogu_article_top: 2",
      "luogu_article_solution_for: P1234",
      "luogu_article_synced_at: 2026-06-29T12:00:00.000Z",
      "---",
      "Body",
    ].join("\n");

    const parsed = parseFrontmatterFields(markdown);

    expect(parsed.fields.luogu_article_id).toBe("s58xwevf");
    expect(parsed.fields.luogu_article_title).toBe("Remote title");
    expect(parsed.fields.luogu_article_category).toBe("1");
    expect(parsed.fields.luogu_article_status).toBe("0");
    expect(parsed.fields.luogu_article_top).toBe("2");
    expect(parsed.fields.luogu_article_solution_for).toBe("P1234");
    expect(parsed.fields.luogu_article_synced_at).toBe("2026-06-29T12:00:00.000Z");
  });

  it("merges luogu article fields", () => {
    const markdown = "---\ntitle: Local title\n---\nBody";
    const next = mergeFrontmatterFields(markdown, {
      title: "Local title",
      tags: [],
      collection: [],
      category: "",
      summary: "",
      draft: false,
      difficulty: "",
      source: "",
      luogu_article_id: "s58xwevf",
      luogu_article_title: "Remote title",
      luogu_article_category: "1",
      luogu_article_status: "0",
      luogu_article_top: "2",
      luogu_article_solution_for: "P1234",
      luogu_article_synced_at: "2026-06-29T12:00:00.000Z",
    });

    expect(next).toContain("luogu_article_id: s58xwevf");
    expect(next).toContain("luogu_article_title: Remote title");
    expect(next).toContain('luogu_article_synced_at: "2026-06-29T12:00:00.000Z"');
  });
});
