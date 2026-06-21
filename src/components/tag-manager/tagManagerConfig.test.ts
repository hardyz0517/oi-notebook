import { describe, expect, it } from "vitest";

import { getTagSuggestionList, type UserTagTaxonomyConfig } from "@/lib/tagTaxonomy";

import { addUserAliasToConfig, createCustomTagCreateSelectionPlan, createCustomTagEntry, deleteUserAliasFromConfig, getAppliedCollectionCreateSaveState, getAppliedCollectionDeleteSaveState, getAppliedCollectionEditSaveState, getAppliedCollectionViewState, getAppliedCustomTagCreateSelectionState, getAppliedCustomTagEditSelectionState, getCancelledCollectionEditState, getChangedCollectionCreateInputState, getChangedCollectionEditInputState, getClearedCustomTagCreateDraftSelection, getClearedNodeSelectionState, getClosedMergeEditorState, getCollectionEditSavePlan, getDeletedCollectionEditState, getFailedCollectionCreateState, getFailedCollectionEditState, getGroupedCustomTagCreateDraftSelection, getOpenedCollectionEditState, getOpenedCustomTagCreateState, getOpenedCustomTagEditState, getOpenedMergeEditorState, getSelectedGroupState, getSelectedMergeTargetState, getSelectedRootState, getSelectedSuggestionState, getSelectionChangeTransientState, getSearchedMergeEditorState, getSuggestionCustomTagCreateDraftSelection, getUserAliasesForSuggestion, setTagSuggestionHiddenInConfig, type CollectionEditState, type CollectionPanelState, type CustomTagCreateDraft, type CustomTagCreateSelectionState, type CustomTagEditSelectionState, type CustomTagEditorState, type MergeEditorState, type TagManagerNodeSelectionState, type TagManagerSelectionChangeTransientState } from "./tagManagerConfig";

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

describe("tagManagerConfig custom tag create selection state", () => {
  const state: CustomTagCreateSelectionState = {
    activeRoot: "字符串",
    expandedGroups: {
      "algorithm.group.string": true,
    },
    filterMode: "user",
    selectedGroupOrderKey: "algorithm.group.string",
    selectedSuggestionId: null,
    customTagCreateDraft: {
      parentPathText: "算法 / 字符串",
      parentLocked: true,
      name: "新标签",
      aliasesText: "新别名",
    },
    customTagCreateError: "old create error",
  };

  it("applies the create selection plan and clears create draft state", () => {
    expect(getAppliedCustomTagCreateSelectionState(state, {
      activeRoot: "算法",
      expandedGroupOrderKey: "algorithm.group.dp",
      filterMode: "all",
      selectedGroupOrderKey: null,
      selectedSuggestionId: "user.dp.knapsack",
    })).toEqual({
      activeRoot: "算法",
      expandedGroups: {
        "algorithm.group.string": true,
        "algorithm.group.dp": true,
      },
      filterMode: "all",
      selectedGroupOrderKey: null,
      selectedSuggestionId: "user.dp.knapsack",
      customTagCreateDraft: null,
      customTagCreateError: null,
    });
  });
});

describe("tagManagerConfig custom tag edit selection state", () => {
  const state: CustomTagEditSelectionState = {
    selectedSuggestionId: "user.string.old-tag",
    customTagEditDraft: {
      name: "旧标签",
      aliasesText: "旧别名",
    },
    customTagEditError: "old edit error",
  };

  it("applies the saved selection and clears edit draft state", () => {
    expect(getAppliedCustomTagEditSelectionState(state, "user.dp.knapsack")).toEqual({
      selectedSuggestionId: "user.dp.knapsack",
      customTagEditDraft: null,
      customTagEditError: null,
    });
  });

  it("clears the selection after deleting the custom tag", () => {
    expect(getAppliedCustomTagEditSelectionState(state, null)).toEqual({
      selectedSuggestionId: null,
      customTagEditDraft: null,
      customTagEditError: null,
    });
  });
});

describe("tagManagerConfig selection change transient state", () => {
  const state: TagManagerSelectionChangeTransientState = {
    aliasInput: "old alias",
    aliasError: "old alias error",
    customTagCreateError: "old create error",
    customTagEditDraft: {
      name: "old tag",
      aliasesText: "old alias text",
    },
    customTagEditError: "old edit error",
    mergeEditor: {
      isOpen: true,
      searchQuery: "kmp",
      selectedTargetId: "algorithm.string.kmp",
      error: "old merge error",
    },
  };

  it("clears transient selection state when switching suggestions", () => {
    expect(getSelectionChangeTransientState(state)).toEqual({
      aliasInput: "",
      aliasError: null,
      customTagCreateError: null,
      customTagEditDraft: null,
      customTagEditError: null,
      mergeEditor: {
        isOpen: false,
        searchQuery: "",
        selectedTargetId: null,
        error: null,
      },
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

describe("tagManagerConfig collection edit state", () => {
  const state: CollectionEditState = {
    editingName: "old collection",
    editInput: "old collection draft",
    editError: "old edit error",
    createError: "old create error",
  };

  it("starts collection edit mode with the selected name and clears stale errors", () => {
    expect(getOpenedCollectionEditState(state, "training notes")).toEqual({
      editingName: "training notes",
      editInput: "training notes",
      editError: null,
      createError: null,
    });
  });

  it("cancels collection edit mode and clears transient edit state", () => {
    expect(getCancelledCollectionEditState(state)).toEqual({
      editingName: null,
      editInput: "",
      editError: null,
      createError: "old create error",
    });
  });

  it("updates edit input while clearing stale edit errors", () => {
    expect(getChangedCollectionEditInputState(state, "updated edit value")).toEqual({
      editingName: "old collection",
      editInput: "updated edit value",
      editError: null,
      createError: "old create error",
    });
  });

  it("clears edit mode after saving collection edits", () => {
    expect(getAppliedCollectionEditSaveState(state)).toEqual({
      editingName: null,
      editInput: "",
      editError: null,
      createError: "old create error",
    });
  });

  it("cancels edit mode when deleting the collection currently being edited", () => {
    expect(getDeletedCollectionEditState(state, "old collection")).toEqual({
      editingName: null,
      editInput: "",
      editError: null,
      createError: "old create error",
    });
  });

  it("preserves edit state when deleting a different collection", () => {
    expect(getDeletedCollectionEditState(state, "another collection")).toEqual(state);
  });

  it("applies collection delete success cleanup when the deleted collection is being edited", () => {
    expect(getAppliedCollectionDeleteSaveState(state, "old collection")).toEqual({
      editingName: null,
      editInput: "",
      editError: null,
      createError: "old create error",
    });
  });

  it("keeps collection edit state unchanged when delete success targets another collection", () => {
    expect(getAppliedCollectionDeleteSaveState(state, "another collection")).toEqual(state);
  });
});

describe("tagManagerConfig collection panel state", () => {
  const state: CollectionPanelState = {
    activeView: "tags",
    createInput: "draft collection",
    createError: "old create error",
    editError: "old edit error",
  };

  it("switches active view while clearing collection errors", () => {
    expect(getAppliedCollectionViewState(state, "collections")).toEqual({
      activeView: "collections",
      createInput: "draft collection",
      createError: null,
      editError: null,
    });
  });

  it("clears create input and error after saving a collection candidate", () => {
    expect(getAppliedCollectionCreateSaveState(state)).toEqual({
      activeView: "tags",
      createInput: "",
      createError: null,
      editError: "old edit error",
    });
  });

  it("updates create input while clearing stale create errors", () => {
    expect(getChangedCollectionCreateInputState(state, "updated create value")).toEqual({
      activeView: "tags",
      createInput: "updated create value",
      createError: null,
      editError: "old edit error",
    });
  });

  it("stores create save failures in collection panel state", () => {
    expect(getFailedCollectionCreateState(state, "save failed")).toEqual({
      activeView: "tags",
      createInput: "draft collection",
      createError: "save failed",
      editError: "old edit error",
    });
  });

  it("stores edit failures in collection panel state", () => {
    expect(getFailedCollectionEditState(state, "rename failed")).toEqual({
      activeView: "tags",
      createInput: "draft collection",
      createError: "old create error",
      editError: "rename failed",
    });
  });
});

describe("tagManagerConfig merge editor state rules", () => {
  const openState: MergeEditorState = {
    isOpen: true,
    searchQuery: "z function",
    selectedTargetId: "algorithm.string.z-function",
    error: "previous error",
  };

  it("opens the editor with empty search, target, and error state", () => {
    expect(getOpenedMergeEditorState()).toEqual({
      isOpen: true,
      searchQuery: "",
      selectedTargetId: null,
      error: null,
    });
  });

  it("closes the editor and clears transient merge state", () => {
    expect(getClosedMergeEditorState(openState)).toEqual({
      isOpen: false,
      searchQuery: "",
      selectedTargetId: null,
      error: null,
    });
  });

  it("updates search text while clearing target and error state", () => {
    expect(getSearchedMergeEditorState(openState, "kmp")).toEqual({
      isOpen: true,
      searchQuery: "kmp",
      selectedTargetId: null,
      error: null,
    });
  });

  it("selects a merge target while clearing stale error state", () => {
    expect(getSelectedMergeTargetState(openState, "algorithm.string.kmp")).toEqual({
      isOpen: true,
      searchQuery: "z function",
      selectedTargetId: "algorithm.string.kmp",
      error: null,
    });
  });
});

describe("tagManagerConfig custom tag editor state rules", () => {
  const state: CustomTagEditorState = {
    createDraft: null,
    createError: "old create error",
    editDraft: { name: "old name", aliasesText: "old alias" },
    editError: "old edit error",
  };

  it("starts custom tag create mode from the current selection and clears edit state", () => {
    expect(getOpenedCustomTagCreateState(
      state,
      {
        id: "user.dp.knapsack",
        path: ["算法", "动态规划", "背包"],
        pathText: "算法/动态规划/背包",
        name: "背包",
        aliases: [],
        searchText: "背包",
        source: "user",
        deprecated: false,
        hidden: false,
      },
      null,
      [{
        orderKey: "algorithm.group.dp",
        name: "动态规划",
        path: ["算法", "动态规划"],
        pathText: "算法/动态规划",
        candidates: [],
      }],
    )).toEqual({
      createDraft: {
        parentPathText: "算法 / 动态规划",
        parentLocked: true,
        name: "",
        aliasesText: "",
      },
      createError: null,
      editDraft: null,
      editError: null,
    });
  });

  it("starts custom tag edit mode and clears create state", () => {
    const config: UserTagTaxonomyConfig = {
      entries: [{
        id: "user.dp.knapsack",
        path: ["算法", "动态规划", "背包"],
        aliases: ["01 背包"],
        source: "user",
      }],
    };
    const suggestion = getTagSuggestionList(config, { includeHidden: true, includeDeprecated: true })
      .find((item) => item.id === "user.dp.knapsack") ?? null;

    expect(getOpenedCustomTagEditState(
      {
        createDraft: {
          parentPathText: "算法 / 动态规划",
          parentLocked: true,
          name: "新标签",
          aliasesText: "新别名",
        },
        createError: "create error",
        editDraft: null,
        editError: "edit error",
      },
      config,
      suggestion,
    )).toEqual({
      createDraft: null,
      createError: null,
      editDraft: {
        name: "背包",
        aliasesText: "01 背包",
      },
      editError: null,
    });
  });
});

describe("tagManagerConfig node selection state rules", () => {
  const state: TagManagerNodeSelectionState = {
    activeRoot: "字符串",
    selectedGroupOrderKey: "algorithm.group.string",
    selectedSuggestionId: "algorithm.string.kmp",
    customTagCreateDraft: {
      parentPathText: "算法 / 字符串",
      parentLocked: true,
      name: "待建标签",
      aliasesText: "别名",
    },
    customTagCreateError: "old create error",
  };

  it("clears node selection while preserving the current root", () => {
    expect(getClearedNodeSelectionState({
      ...state,
      activeRoot: "算法",
    })).toEqual({
      activeRoot: "算法",
      selectedGroupOrderKey: null,
      selectedSuggestionId: null,
      customTagCreateDraft: {
        parentPathText: "",
        parentLocked: false,
        name: "待建标签",
        aliasesText: "别名",
      },
      customTagCreateError: null,
    });
  });

  it("selects a root and clears node selection state", () => {
    expect(getSelectedRootState(state, "算法")).toEqual({
      activeRoot: "算法",
      selectedGroupOrderKey: null,
      selectedSuggestionId: null,
      customTagCreateDraft: {
        parentPathText: "",
        parentLocked: false,
        name: "待建标签",
        aliasesText: "别名",
      },
      customTagCreateError: null,
    });
  });

  it("selects a group and retargets the create draft to that group", () => {
    expect(getSelectedGroupState(state, "algorithm.group.dp", [{
      orderKey: "algorithm.group.dp",
      name: "动态规划",
      path: ["算法", "动态规划"],
      pathText: "算法/动态规划",
      candidates: [],
    }])).toEqual({
      activeRoot: "字符串",
      selectedGroupOrderKey: "algorithm.group.dp",
      selectedSuggestionId: null,
      customTagCreateDraft: {
        parentPathText: "算法 / 动态规划",
        parentLocked: true,
        name: "待建标签",
        aliasesText: "别名",
      },
      customTagCreateError: null,
    });
  });

  it("selects a concrete suggestion and retargets the create draft to its parent path", () => {
    expect(getSelectedSuggestionState(state, "user.dp.knapsack", [{
      id: "user.dp.knapsack",
      path: ["算法", "动态规划", "背包"],
      pathText: "算法/动态规划/背包",
      name: "背包",
      aliases: [],
      searchText: "背包",
      source: "user",
      deprecated: false,
      hidden: false,
    }])).toEqual({
      activeRoot: "字符串",
      selectedGroupOrderKey: null,
      selectedSuggestionId: "user.dp.knapsack",
      customTagCreateDraft: {
        parentPathText: "算法 / 动态规划",
        parentLocked: true,
        name: "待建标签",
        aliasesText: "别名",
      },
      customTagCreateError: null,
    });
  });
});
