import { describe, expect, it } from "vitest";

import {
  COMMON_COLLECTIONS,
  COMMON_NOTE_TAGS,
  buildCollectionCandidates,
  getCollectionFromTag,
  getDisplayTags,
} from "./collectionTags";

describe("collectionTags", () => {
  it("keeps common collection and note tag presets stable", () => {
    expect(COMMON_COLLECTIONS).toEqual(["题解", "技巧", "复盘", "杂谈", "集训日志"]);
    expect(COMMON_NOTE_TAGS).toEqual(["题解", "技巧", "复盘", "模板", "总结", "调试", "草稿"]);
  });

  it("separates collection tags from display tags and candidates", () => {
    expect(getCollectionFromTag("文集: 题解")).toBe("题解");
    expect(getCollectionFromTag("collection: Tricks")).toBe("Tricks");
    expect(getDisplayTags(["dp", "文集: 题解", "graph"])).toEqual(["dp", "graph"]);
    expect(buildCollectionCandidates({
      title: "",
      summary: "",
      tags: ["文集: 专题"],
      category: "训练",
      collection: ["复盘"],
      draft: false,
      difficulty: "",
      source: "",
      luogu_article_id: "",
      luogu_article_title: "",
      luogu_article_category: "",
      luogu_article_status: "",
      luogu_article_top: "",
      luogu_article_solution_for: "",
      luogu_article_synced_at: "",
    })).toEqual(["题解", "技巧", "复盘", "杂谈", "集训日志", "训练", "专题"]);
  });
});
