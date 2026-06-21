import { describe, expect, it } from "vitest";

import {
  buildTagDiagnostics,
  collectRelatedTagChips,
  collectTagChips,
  getPaginationItems,
  getTagChipLabel,
  isTagDiagnosticsEnabled,
  matchesTagChipSearch,
  normalizeCompactTagSearchText,
  normalizeTagSearchText,
  type TagChipItem,
} from "./blogViewModel";
import type { NoteSummary, RawNoteSummary } from "./blogContent";
import type { TagTreeNode } from "./tagTaxonomy";

const tagNode = (overrides: Partial<TagTreeNode> = {}): TagTreeNode => ({
  name: "root",
  fullPath: "root",
  depth: 1,
  count: 1,
  children: [],
  ...overrides,
});

describe("blogViewModel", () => {
  it("builds tag chip labels from tree depth", () => {
    expect(getTagChipLabel(tagNode({ name: "\u56fe\u8bba", fullPath: "\u7b97\u6cd5/\u56fe\u8bba", depth: 2 }))).toBe("\u56fe\u8bba");
    expect(getTagChipLabel(tagNode({
      name: "\u5355\u6e90\u6700\u77ed\u8def",
      fullPath: "\u7b97\u6cd5/\u56fe\u8bba/\u6700\u77ed\u8def/\u5355\u6e90\u6700\u77ed\u8def",
      depth: 4,
    }))).toBe("\u6700\u77ed\u8def / \u5355\u6e90\u6700\u77ed\u8def");
  });

  it("collects all tag chips and related leaf chips", () => {
    const tree = tagNode({
      name: "\u56fe\u8bba",
      fullPath: "\u7b97\u6cd5/\u56fe\u8bba",
      depth: 2,
      count: 5,
      children: [
        tagNode({
          name: "\u6700\u77ed\u8def",
          fullPath: "\u7b97\u6cd5/\u56fe\u8bba/\u6700\u77ed\u8def",
          depth: 3,
          count: 3,
          children: [
            tagNode({
              name: "Dijkstra",
              fullPath: "\u7b97\u6cd5/\u56fe\u8bba/\u6700\u77ed\u8def/Dijkstra",
              depth: 4,
              count: 2,
            }),
          ],
        }),
      ],
    });

    expect(collectTagChips(tree).map((chip) => chip.fullPath)).toEqual([
      "\u7b97\u6cd5/\u56fe\u8bba",
      "\u7b97\u6cd5/\u56fe\u8bba/\u6700\u77ed\u8def",
      "\u7b97\u6cd5/\u56fe\u8bba/\u6700\u77ed\u8def/Dijkstra",
    ]);
    expect(collectRelatedTagChips(tree)).toEqual([
      {
        label: "Dijkstra",
        fullPath: "\u7b97\u6cd5/\u56fe\u8bba/\u6700\u77ed\u8def/Dijkstra",
        count: 2,
      },
    ]);
  });

  it("normalizes and matches tag chip search text", () => {
    const item: TagChipItem = {
      label: "Dijkstra",
      fullPath: "\u7b97\u6cd5/\u56fe\u8bba/\u6700\u77ed\u8def/Dijkstra",
      count: 2,
    };

    expect(normalizeTagSearchText("  A   B  ")).toBe("a b");
    expect(normalizeCompactTagSearchText("  A   B  ")).toBe("ab");
    expect(matchesTagChipSearch(item, "\u6700\u77ed\u8def")).toBe(true);
    expect(matchesTagChipSearch(item, "\u6700 \u77ed \u8def")).toBe(true);
    expect(matchesTagChipSearch(item, "network flow")).toBe(false);
  });

  it("creates compact pagination items with ellipses", () => {
    expect(getPaginationItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getPaginationItems(6, 12)).toEqual([1, "ellipsis", 5, 6, 7, "ellipsis", 12]);
    expect(getPaginationItems(1, 12)).toEqual([1, 2, "ellipsis", 12]);
    expect(getPaginationItems(12, 12)).toEqual([1, "ellipsis", 11, 12]);
  });

  it("derives tag diagnostic enablement from dev and debug flags", () => {
    expect(isTagDiagnosticsEnabled({ isDev: true })).toBe(true);
    expect(isTagDiagnosticsEnabled({ routeDebugTag: "1" })).toBe(true);
    expect(isTagDiagnosticsEnabled({ searchDebugTag: "1" })).toBe(true);
    expect(isTagDiagnosticsEnabled({ localStorageDebugTag: "1" })).toBe(true);
    expect(isTagDiagnosticsEnabled({
      isDev: false,
      routeDebugTag: "0",
      searchDebugTag: null,
      localStorageDebugTag: null,
    })).toBe(false);
  });

  it("builds ready-to-log tag diagnostics from raw notes, normalized notes, and the tag tree", () => {
    const rawNotes: RawNoteSummary[] = [
      {
        title: "P1000",
        relativePath: "luogu/P1000.md",
        summary: null,
        excerpt: null,
        category: "luogu",
        collection: "题解",
        created: null,
        updated: null,
        date: null,
        sortKey: null,
        draft: false,
        tags: ["图论"],
        metadata: { tags: ["最短路"] },
      },
      {
        title: "No Tags",
        relativePath: "inbox/no-tags.md",
        summary: null,
        excerpt: null,
        category: "inbox",
        collection: "未归档",
        created: null,
        updated: null,
        date: null,
        sortKey: null,
        draft: true,
        tags: [],
      },
    ];
    const normalizedNotes: NoteSummary[] = [
      {
        title: "P1000",
        relativePath: "luogu/P1000.md",
        summary: null,
        excerpt: null,
        tags: ["图论", "最短路"],
        category: "luogu",
        collection: "题解",
        collections: ["题解"],
        created: null,
        updated: null,
        date: null,
        sortKey: null,
        draft: false,
      },
    ];
    const tree = [
      tagNode({
        name: "图论",
        fullPath: "算法/图论",
        depth: 2,
        count: 1,
        children: [
          tagNode({
            name: "最短路",
            fullPath: "算法/图论/最短路",
            depth: 3,
            count: 1,
          }),
        ],
      }),
    ];

    const diagnostics = buildTagDiagnostics(rawNotes, normalizedNotes, tree);

    expect(diagnostics.returnedNotesCount).toBe(2);
    expect(diagnostics.rawFirstNoteKeys).toContain("metadata");
    expect(diagnostics.rawRows[0]).toMatchObject({
      title: "P1000",
      path: "luogu/P1000.md",
      tags: ["图论"],
      metadataTags: ["最短路"],
      draft: false,
    });
    expect(diagnostics.normalizedRows[0]).toMatchObject({
      title: "P1000",
      path: "luogu/P1000.md",
      tags: ["图论", "最短路"],
    });
    expect(diagnostics.normalizedTagTotal).toBe(2);
    expect(diagnostics.tagTreeRootCount).toBe(1);
    expect(diagnostics.tagTreeNodeCount).toBe(2);
    expect(diagnostics.rawTagFailureRows).toEqual([]);
  });

  it("includes raw tag failure rows when fetched notes produce no normalized tags", () => {
    const rawNotes: RawNoteSummary[] = [{
      title: "Broken Tags",
      relativePath: "inbox/broken.md",
      summary: null,
      excerpt: null,
      category: "inbox",
      collection: "未归档",
      created: null,
      updated: null,
      date: null,
      sortKey: null,
      draft: false,
      tags: { value: "bad-shape" },
    }];

    expect(buildTagDiagnostics(rawNotes, [], [])).toMatchObject({
      normalizedTagTotal: 0,
      tagTreeRootCount: 0,
      rawTagFailureRows: [{
        title: "Broken Tags",
        path: "inbox/broken.md",
        reason: "top-level tags has no usable string values",
      }],
    });
  });
});
