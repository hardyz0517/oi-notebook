import { describe, expect, it } from "vitest";

import { getTagSuggestionList, type UserTagTaxonomyConfig } from "@/lib/tagTaxonomy";

import { addUserAliasToConfig, getUserAliasesForSuggestion } from "./tagManagerConfig";

describe("tagManagerConfig alias rules", () => {
  const config: UserTagTaxonomyConfig = {
    entries: [
      {
        id: "user.dp.knapsack",
        path: ["算法", "动态规划 DP", "背包复盘"],
        aliases: ["背包复盘旧称"],
        source: "user",
      },
    ],
    aliases: {
      "旧背包入口": "user.dp.knapsack",
    },
  };

  it("adds a trimmed alias to the selected concrete tag", () => {
    const suggestion = getTagSuggestionList(config, { includeHidden: true, includeDeprecated: true })
      .find((item) => item.id === "user.dp.knapsack") ?? null;

    const result = addUserAliasToConfig(config, suggestion, "  背包复盘入口  ", []);

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;

    expect(result.alias).toBe("背包复盘入口");
    expect(getUserAliasesForSuggestion(result.config, suggestion)).toContain("背包复盘入口");
  });

  it("rejects aliases that duplicate the selected tag name or path", () => {
    const suggestion = getTagSuggestionList(config, { includeHidden: true, includeDeprecated: true })
      .find((item) => item.id === "user.dp.knapsack") ?? null;

    const nameResult = addUserAliasToConfig(config, suggestion, "背包复盘", []);
    const pathResult = addUserAliasToConfig(config, suggestion, "算法/动态规划 DP/背包复盘", []);

    expect(nameResult).toEqual({ ok: false, error: "该名称已是当前标签，无需添加" });
    expect(pathResult).toEqual({ ok: false, error: "该名称已是当前标签，无需添加" });
  });

  it("rejects aliases already owned by user or builtin aliases", () => {
    const suggestion = getTagSuggestionList(config, { includeHidden: true, includeDeprecated: true })
      .find((item) => item.id === "user.dp.knapsack") ?? null;

    const userAliasResult = addUserAliasToConfig(config, suggestion, "旧背包入口", []);
    const builtinAliasResult = addUserAliasToConfig(config, suggestion, "背包复盘旧称", ["背包复盘旧称"]);

    expect(userAliasResult).toEqual({ ok: false, error: "别名已存在" });
    expect(builtinAliasResult).toEqual({ ok: false, error: "别名已存在" });
  });
});
