import { describe, expect, it } from "vitest";

import {
  collectRelatedTagChips,
  collectTagChips,
  getPaginationItems,
  getTagChipLabel,
  matchesTagChipSearch,
  normalizeCompactTagSearchText,
  normalizeTagSearchText,
  type TagChipItem,
} from "./blogViewModel";
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
});
