import { describe, expect, it } from "vitest";
import type { TagTaxonomyEntry, UserTagTaxonomyConfig } from "./tagTaxonomy";
import {
  buildTagTaxonomyConfigExport,
  createUserTagEntryId,
  formatTagSuggestionPath,
  mergeTagsStable,
  normalizeUserTagTaxonomyConfig,
  parseAliasListInput,
  parseTagPathInput,
  resolveTagTaxonomyAliasTarget,
} from "./tagTaxonomyUserConfig";

describe("tagTaxonomyUserConfig", () => {
  it("builds deterministic export payloads", () => {
    const config: UserTagTaxonomyConfig = {
      version: 2,
      entries: [{ id: "user.dp", path: ["算法", "动态规划"], source: "user" }],
      aliases: { dp: "user.dp" },
      hiddenIds: [],
      orderOverrides: {},
      merges: {},
      customCollections: ["  tricks  "],
    };

    expect(buildTagTaxonomyConfigExport(config, new Date("2026-06-20T08:00:00.000Z"))).toEqual({
      json: `${JSON.stringify({
        version: 2,
        entries: [{ id: "user.dp", path: ["算法", "动态规划"], source: "user" }],
        aliases: { dp: "user.dp" },
        hiddenIds: [],
        orderOverrides: {},
        merges: {},
        customCollections: ["tricks"],
      }, null, 2)}\n`,
      fileName: "oi-notebook-tag-taxonomy-2026-06-20.json",
    });
  });

  it("normalizes missing user config to mutable default collections", () => {
    const config = normalizeUserTagTaxonomyConfig(null);

    expect(config).toEqual({
      version: 1,
      entries: [],
      aliases: {},
      hiddenIds: [],
      orderOverrides: {},
      merges: {},
      customCollections: [],
    });
  });

  it("clones user config collections so callers can update drafts safely", () => {
    const source: UserTagTaxonomyConfig = {
      version: 2,
      entries: [{ id: "user.dp", path: ["专题", "动态规划"], aliases: ["dp"] }],
      aliases: { dp: "user.dp" },
      hiddenIds: ["legacy"],
      orderOverrides: { "user.dp": 3 },
      merges: { old: "user.dp" },
      customCollections: ["  做题  ", "做题", "模板"],
    };

    const config = normalizeUserTagTaxonomyConfig(source);

    expect(config.customCollections).toEqual(["做题", "模板"]);
    expect(config.entries).not.toBe(source.entries);
    expect(config.aliases).not.toBe(source.aliases);
    expect(config.hiddenIds).not.toBe(source.hiddenIds);
    expect(config.orderOverrides).not.toBe(source.orderOverrides);
    expect(config.merges).not.toBe(source.merges);
  });

  it("parses slash separated tag paths through taxonomy value normalization", () => {
    expect(parseTagPathInput(" 算法 / 动态规划 // 背包 ")).toEqual(["算法", "动态规划", "背包"]);
  });

  it("parses comma separated aliases with case-insensitive de-duplication", () => {
    expect(parseAliasListInput(" DP, dp，动态规划, , Dp ")).toEqual(["DP", "动态规划"]);
  });

  it("creates stable hashed ids for non-ascii paths and suffixes duplicates", () => {
    const path = ["算法", "动态规划"];
    const id = createUserTagEntryId(path, []);
    const existingEntries: TagTaxonomyEntry[] = [{ id, path }];

    expect(id).toBe("user.tag.nqp68r");
    expect(createUserTagEntryId(path, existingEntries)).toBe("user.tag.nqp68r.2");
  });

  it("resolves alias targets by id, normalized path, and readable path", () => {
    const config: UserTagTaxonomyConfig = {
      entries: [{ id: "user.algorithm.dp", path: ["算法", "动态规划"], aliases: [] }],
      aliases: {},
      hiddenIds: [],
      orderOverrides: {},
      merges: {},
      customCollections: [],
    };

    expect(resolveTagTaxonomyAliasTarget("user.algorithm.dp", config)).toBe("user.algorithm.dp");
    expect(resolveTagTaxonomyAliasTarget("算法/动态规划", config)).toBe("user.algorithm.dp");
    expect(resolveTagTaxonomyAliasTarget("算法 / 动态规划", config)).toBe("user.algorithm.dp");
  });

  it("falls back to id-shaped alias targets and rejects readable unknown targets", () => {
    expect(resolveTagTaxonomyAliasTarget("custom:target-1", null)).toBe("custom:target-1");
    expect(resolveTagTaxonomyAliasTarget("未知 标签", null)).toBeNull();
  });

  it("merges tags stably while de-duplicating canonical aliases", () => {
    expect(mergeTagsStable(["DP", "图论"], ["算法/动态规划 DP/动态规划 DP", " 图论 ", "数学"])).toEqual([
      "DP",
      "图论",
      "数学",
    ]);
  });

  it("formats suggestion paths for display", () => {
    expect(formatTagSuggestionPath("算法/动态规划/背包")).toBe("算法 / 动态规划 / 背包");
  });
});
