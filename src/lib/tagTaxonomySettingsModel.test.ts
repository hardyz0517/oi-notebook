import { describe, expect, it } from "vitest";

import type { UserTagTaxonomyConfig } from "./tagTaxonomy";
import {
  buildTagTaxonomyStatItems,
  buildTagTaxonomyStats,
  filterTagTaxonomyUserAliases,
  filterTagTaxonomyUserEntries,
  getDisplayedTagTaxonomyList,
  getTagManagerAvailableCandidateCount,
  getTagTaxonomyUserAliases,
  getTagTaxonomyUserEntries,
} from "./tagTaxonomySettingsModel";

const config: UserTagTaxonomyConfig = {
  version: 1,
  entries: [
    { id: "user.graph.shortest", path: ["算法", "图论", "最短路"], aliases: ["sp"] },
    { id: "user.dp.knapsack", path: ["算法", "动态规划", "背包"], aliases: ["bag"] },
  ],
  aliases: {
    "最短路": "user.graph.shortest",
    "背包 DP": "user.dp.knapsack",
  },
  hiddenIds: ["algorithm.string.kmp"],
  orderOverrides: { "user.dp.knapsack": 2 },
  merges: { old: "user.dp.knapsack" },
  customCollections: ["训练", "模板"],
};

describe("tagTaxonomySettingsModel", () => {
  it("builds settings statistics and stat items", () => {
    const stats = buildTagTaxonomyStats({
      config,
      userConfig: config,
      isLoading: false,
      loadError: null,
    });

    expect(stats.statusLabel).toBe("已加载用户配置");
    expect(stats.entriesCount).toBe(2);
    expect(stats.aliasesCount).toBe(2);
    expect(stats.hiddenIdsCount).toBe(1);
    expect(stats.orderOverridesCount).toBe(1);
    expect(stats.mergesCount).toBe(1);
    expect(stats.customCollectionsCount).toBe(2);
    expect(stats.userConfigItemCount).toBe(9);
    expect(stats.availableCandidateCount).toBeGreaterThan(0);

    expect(buildTagTaxonomyStatItems(stats)).toEqual([
      { label: "自定义标签", value: 2 },
      { label: "自定义别名", value: 2 },
      { label: "隐藏默认标签", value: 1 },
      { label: "排序覆盖", value: 1 },
      { label: "合并规则", value: 1 },
      { label: "自定义文集", value: 2 },
    ]);
  });

  it("chooses loading, error, and builtin status labels", () => {
    expect(buildTagTaxonomyStats({
      config: null,
      userConfig: null,
      isLoading: true,
      loadError: null,
    }).statusLabel).toBe("正在读取");

    expect(buildTagTaxonomyStats({
      config: null,
      userConfig: null,
      isLoading: false,
      loadError: "boom",
    }).statusLabel).toBe("加载失败，已回退内置默认配置");

    expect(buildTagTaxonomyStats({
      config: null,
      userConfig: null,
      isLoading: false,
      loadError: null,
    }).statusLabel).toBe("使用内置默认配置");
  });

  it("sorts, filters, and folds user entries", () => {
    const entries = getTagTaxonomyUserEntries(config);

    expect(entries.map((entry) => entry.id)).toEqual(["user.dp.knapsack", "user.graph.shortest"]);
    expect(filterTagTaxonomyUserEntries(entries, "sp").map((entry) => entry.id)).toEqual(["user.graph.shortest"]);
    expect(getDisplayedTagTaxonomyList(entries, "", false, 1).map((entry) => entry.id)).toEqual(["user.dp.knapsack"]);
    expect(getDisplayedTagTaxonomyList(entries, "sp", false, 1).map((entry) => entry.id)).toEqual(["user.dp.knapsack", "user.graph.shortest"]);
    expect(getDisplayedTagTaxonomyList(entries, "", true, 1).map((entry) => entry.id)).toEqual(["user.dp.knapsack", "user.graph.shortest"]);
  });

  it("sorts, filters, and folds aliases", () => {
    const aliases = getTagTaxonomyUserAliases(config);

    expect(aliases).toEqual([
      ["背包 DP", "user.dp.knapsack"],
      ["最短路", "user.graph.shortest"],
    ]);
    expect(filterTagTaxonomyUserAliases(aliases, "graph")).toEqual([["最短路", "user.graph.shortest"]]);
    expect(getDisplayedTagTaxonomyList(aliases, "", false, 1)).toEqual([["背包 DP", "user.dp.knapsack"]]);
  });

  it("counts tag manager candidates including hidden but not deprecated entries", () => {
    expect(getTagManagerAvailableCandidateCount(config)).toBeGreaterThanOrEqual(
      buildTagTaxonomyStats({
        config,
        userConfig: config,
        isLoading: false,
        loadError: null,
      }).availableCandidateCount,
    );
  });
});
