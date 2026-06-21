import { describe, expect, it } from "vitest";

import {
  buildCollections,
  createCleanSummary,
  getCollectionDescription,
  getDisplayTags,
  getHomeExcerpt,
  getNoteExcerpt,
  normalizeBlogConfig,
  normalizeNoteDetail,
  normalizeNoteSummary,
  paginateNotes,
  searchNotes,
  sortNotesByRecent,
  splitFrontmatter,
  type NoteSummary,
  type RawNoteSummary,
} from "./blogContent";

const baseNote = (overrides: Partial<RawNoteSummary> = {}): RawNoteSummary => ({
  title: "Base title",
  relativePath: "inbox/base.md",
  summary: "Base summary",
  excerpt: "Base excerpt",
  tags: [],
  category: "inbox",
  articleClass: undefined,
  created: "2026-01-01T00:00:00.000Z",
  updated: null,
  date: null,
  sortKey: null,
  draft: false,
  ...overrides,
});

describe("blogContent", () => {
  it("parses fenced and loose frontmatter without leaking metadata into the body", () => {
    expect(splitFrontmatter("---\ntitle: Demo\ntags:\n  - dp\n  - graph\ndraft: yes\n---\n# Body")).toEqual({
      metadata: { title: "Demo", tags: ["dp", "graph"], draft: true },
      body: "# Body",
    });

    expect(splitFrontmatter("title: Loose\ncollection: [题解, 技巧]\nsummary: Keep this\n\nBody text")).toEqual({
      metadata: { title: "Loose", collection: ["题解", "技巧"], summary: "Keep this" },
      body: "Body text",
    });
  });

  it("cleans summaries by dropping metadata, code, links, and tag-like fragments", () => {
    expect(createCleanSummary("tags: dp, graph", "```cpp\nint main() {}\n```\nUseful idea with `code`.")).toBe("这篇笔记还没有摘要，打开文章页可以继续阅读全文。");
    expect(createCleanSummary("dp, graph")).toBe("这篇笔记还没有摘要，打开文章页可以继续阅读全文。");
  });

  it("normalizes summary notes from embedded frontmatter and collection tags", () => {
    const note = normalizeNoteSummary(baseNote({
      title: "---\ntitle: P1000 A+B\ntags: [动态规划, 文集: 题解]\ncategory: problems\ndate: 2026-02-03\n---\nFallback title",
      summary: "summary: bad metadata\n\nUse prefix sums to remove a transition.",
      excerpt: "Problem: https://example.test\nActual excerpt.",
      collection: "tricks",
    }));

    expect(note).toMatchObject({
      title: "P1000 A+B",
      tags: ["动态规划"],
      collection: "题解",
      collections: ["题解", "技巧"],
      articleClass: "未分类",
      summary: "bad metadata",
      excerpt: "excerpt.",
      date: "2026-02-03",
    });
  });

  it("normalizes note detail body metadata without exposing collection tags as display tags", () => {
    const detail = normalizeNoteDetail({
      ...baseNote({
        relativePath: "luogu/P1000.md",
        title: "",
        tags: ["fallback"],
        summary: null,
        excerpt: null,
        category: "luogu",
      }),
      body: "---\ntitle: Detail title\ntags: [复盘, 文集: 复盘]\nsummary: Detail summary\nupdated: 2026-04-05\ndraft: true\n---\n# Real body",
      metadata: { tags: ["metadata tag"] },
    });

    expect(detail.title).toBe("Detail title");
    expect(detail.tags).toEqual(["复盘"]);
    expect(detail.collection).toBe("复盘");
    expect(detail.summary).toBe("Detail summary");
    expect(detail.updated).toBe("2026-04-05");
    expect(detail.draft).toBe(true);
    expect(detail.body).toBe("# Real body");
  });

  it("derives collections, search results, pagination, and excerpts from normalized notes", () => {
    const notes: NoteSummary[] = [
      normalizeNoteSummary(baseNote({
        title: "Graph shortest path",
        relativePath: "problems/graph.md",
        summary: "Dijkstra with heap optimization",
        collection: "题解",
        tags: ["图论"],
        updated: "2026-03-01",
      })),
      normalizeNoteSummary(baseNote({
        title: "Training review",
        relativePath: "inbox/review.md",
        summary: "Contest mistakes",
        collection: "复盘",
        tags: ["复盘"],
        updated: "2026-04-01",
      })),
    ];

    expect(getDisplayTags({ tags: ["图论", "文集: 题解", "tags: bad"] })).toEqual(["图论"]);
    expect(getCollectionDescription("题解")).toContain("做题思路");
    expect(getNoteExcerpt(notes[0])).toBe("Dijkstra with heap optimization");
    expect(getHomeExcerpt(notes[0], 12)).toBe("Base excerpt");
    expect(searchNotes(notes, "heap")).toHaveLength(1);
    expect(sortNotesByRecent(notes).map((note) => note.title)).toEqual(["Training review", "Graph shortest path"]);
    expect(paginateNotes(notes, 3, 1)).toMatchObject({ currentPage: 2, totalPages: 2, items: [notes[1]] });
    expect(buildCollections(notes).map((collection) => collection.name)).toEqual(["复盘", "题解"]);
  });

  it("normalizes blog config with project defaults", () => {
    expect(normalizeBlogConfig({ title: "  My Blog ", subtitle: "" })).toEqual({
      title: "My Blog",
      subtitle: "一本本地算法笔记与题解博客",
    });
    expect(normalizeBlogConfig(null).title).toBe("OI Notebook");
  });
});
