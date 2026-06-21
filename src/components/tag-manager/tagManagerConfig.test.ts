import { describe, expect, it } from "vitest";

import { getTagSuggestionList, type UserTagTaxonomyConfig } from "@/lib/tagTaxonomy";

import { addUserAliasToConfig, createCustomTagCreateSelectionPlan, createCustomTagEntry, deleteUserAliasFromConfig, getClearedCustomTagCreateDraftSelection, getCollectionEditSavePlan, getGroupedCustomTagCreateDraftSelection, getSuggestionCustomTagCreateDraftSelection, getUserAliasesForSuggestion, setTagSuggestionHiddenInConfig, type CustomTagCreateDraft } from "./tagManagerConfig";

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

  it("deletes a user alias from the selected tag", () => {
    const suggestion = getTagSuggestionList(config, { includeHidden: true, includeDeprecated: true })
      .find((item) => item.id === "user.dp.knapsack") ?? null;

    const result = deleteUserAliasFromConfig(config, suggestion, "旧背包入口");

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;

    expect(result.alias).toBe("旧背包入口");
    expect(getUserAliasesForSuggestion(result.config, suggestion)).not.toContain("旧背包入口");
  });

  it("rejects deleting an alias that belongs to another tag", () => {
    const suggestion = getTagSuggestionList(config, { includeHidden: true, includeDeprecated: true })
      .find((item) => item.id === "user.dp.knapsack") ?? null;
    const otherConfig: UserTagTaxonomyConfig = {
      ...config,
      entries: [
        ...(config.entries ?? []),
        {
          id: "user.graph.shortest-path",
          path: ["算法", "图论", "最短路复盘"],
          source: "user",
        },
      ],
      aliases: {
        ...(config.aliases ?? {}),
        "图论入口": "user.graph.shortest-path",
      },
    };

    const result = deleteUserAliasFromConfig(otherConfig, suggestion, "图论入口");

    expect(result).toEqual({ ok: false, error: "只能删除当前标签的自定义别名" });
  });
});

describe("tagManagerConfig visibility rules", () => {
  const config: UserTagTaxonomyConfig = {
    hiddenIds: ["builtin.old"],
  };

  it("adds the selected suggestion id when hiding a tag", () => {
    const suggestion = {
      id: "user.dp.knapsack",
      path: ["算法", "动态规划 DP", "背包复盘"],
      pathText: "算法/动态规划 DP/背包复盘",
      name: "背包复盘",
      aliases: [],
      searchText: "背包复盘",
      source: "user" as const,
      deprecated: false,
      hidden: false,
    };

    const result = setTagSuggestionHiddenInConfig(config, suggestion, true);

    expect(result.hiddenIds).toEqual(["builtin.old", "user.dp.knapsack"]);
  });

  it("removes the selected suggestion id when showing a tag", () => {
    const suggestion = {
      id: "builtin.old",
      path: ["算法", "动态规划 DP", "旧标签"],
      pathText: "算法/动态规划 DP/旧标签",
      name: "旧标签",
      aliases: [],
      searchText: "旧标签",
      source: "builtin" as const,
      deprecated: false,
      hidden: true,
    };

    const result = setTagSuggestionHiddenInConfig(config, suggestion, false);

    expect(result.hiddenIds).toEqual([]);
  });
});

describe("tagManagerConfig custom tag create selection plan", () => {
  it("selects and expands the newly created custom tag location", () => {
    const created = createCustomTagEntry({}, {
      parentPathText: "算法 / 动态规划 DP",
      parentLocked: true,
      name: "背包复盘",
      aliasesText: "",
    });
    expect(created).toMatchObject({ ok: true });
    if (!created.ok) return;

    const plan = createCustomTagCreateSelectionPlan(created.config, created.entryId);

    expect(plan).toEqual({
      activeRoot: "算法",
      expandedGroupOrderKey: "algorithm.group.dp",
      filterMode: "all",
      selectedGroupOrderKey: null,
      selectedSuggestionId: created.entryId,
    });
  });
});

describe("tagManagerConfig custom tag create draft selection rules", () => {
  const draft: CustomTagCreateDraft = {
    parentPathText: "算法 / 动态规划",
    parentLocked: true,
    name: "背包复盘",
    aliasesText: "背包入口",
  };

  it("clears parent path when the selected node is cleared", () => {
    expect(getClearedCustomTagCreateDraftSelection(draft)).toEqual({
      ...draft,
      parentPathText: "",
      parentLocked: false,
    });
    expect(getClearedCustomTagCreateDraftSelection(null)).toBeNull();
  });

  it("locks parent path to the selected group when a group is selected", () => {
    const result = getGroupedCustomTagCreateDraftSelection(draft, {
      orderKey: "algorithm.group.graph",
      name: "图论",
      path: ["算法", "图论"],
      pathText: "算法/图论",
      candidates: [],
    });

    expect(result).toEqual({
      ...draft,
      parentPathText: "算法 / 图论",
      parentLocked: true,
    });
  });

  it("locks parent path to the selected concrete suggestion parent", () => {
    const suggestion = getTagSuggestionList({
      entries: [{
        id: "user.dp.knapsack",
        path: ["算法", "动态规划", "背包复盘"],
        source: "user",
      }],
    }, { includeHidden: true, includeDeprecated: true })
      .find((item) => item.id === "user.dp.knapsack") ?? null;

    const result = getSuggestionCustomTagCreateDraftSelection(draft, suggestion);

    expect(result).toEqual({
      ...draft,
      parentPathText: "算法 / 动态规划",
      parentLocked: true,
    });
  });
});

describe("tagManagerConfig collection edit save plan", () => {
  it("cancels editing when the normalized collection name is unchanged", () => {
    expect(getCollectionEditSavePlan("训练 记录", "  训练   记录  ")).toEqual({
      action: "cancel",
    });
  });

  it("returns the normalized collection name when editing changes the value", () => {
    expect(getCollectionEditSavePlan("训练记录", "  周赛   复盘  ")).toEqual({
      action: "rename",
      nextName: "周赛 复盘",
    });
  });
});
