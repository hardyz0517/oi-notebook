import { describe, expect, it } from "vitest";

import { getTagSuggestionList, type UserTagTaxonomyConfig } from "@/lib/tagTaxonomy";

import { ALIAS_SAVE_FAILURE_MESSAGE, CUSTOM_TAG_SAVE_FAILURE_MESSAGE, MERGE_SAVE_FAILURE_MESSAGE, VISIBILITY_SAVE_FAILURE_MESSAGE, addUserAliasToConfig, createCustomTagCreateSelectionPlan, createCustomTagEntry, deleteUserAliasFromConfig, getAliasDeleteSaveResolution, getAliasSaveResolution, getAppliedCollectionCreateSaveState, getAppliedCollectionDeleteSaveState, getAppliedCollectionEditSaveState, getAppliedCollectionViewState, getAppliedCustomTagCreateSelectionState, getAppliedCustomTagEditSelectionState, getCancelledCollectionEditState, getChangedCollectionCreateInputState, getChangedCollectionEditInputState, getClearedCustomTagCreateDraftSelection, getClearedNodeSelectionState, getClosedMergeEditorState, getCollectionCreateSaveResolution, getCollectionDeleteConfirmOptions, getCollectionDeleteSaveResolution, getCollectionEditSavePlan, getCollectionEditSaveResolution, getCustomTagCreateSaveResolution, getCustomTagDeleteConfirmOptions, getCustomTagEditSaveResolution, getDeletedCollectionEditState, getFailedAliasSaveState, getFailedCollectionCreateSaveState, getFailedCollectionDeleteSaveState, getFailedCollectionEditSaveState, getFailedMergeSaveState, getGroupedCustomTagCreateDraftSelection, getMergeDeleteConfirmOptions, getMergeDeleteResolution, getMergeSaveConfirmOptions, getMergeSaveResolution, getOpenedCollectionEditState, getOpenedCustomTagCreateState, getOpenedCustomTagEditState, getOpenedMergeEditorState, getSelectedGroupState, getSelectedMergeTargetState, getSelectedRootState, getSelectedSuggestionState, getSelectionChangeTransientState, getSearchedMergeEditorState, getSuggestionCustomTagCreateDraftSelection, getTagVisibilitySavePlan, getUserAliasesForSuggestion, setTagSuggestionHiddenInConfig, type AliasEditorState, type CollectionEditState, type CollectionPanelState, type CollectionSaveState, type CustomTagCreateDraft, type CustomTagCreateSelectionState, type CustomTagEditSelectionState, type CustomTagEditorState, type MergeEditorState, type TagManagerNodeSelectionState, type TagManagerSelectionChangeTransientState } from "./tagManagerConfig";

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

  it("builds a visibility save plan with normalized configs and save metadata", () => {
    const suggestion = {
      id: "user.dp.knapsack",
      path: ["algorithm", "dp", "knapsack"],
      pathText: "algorithm/dp/knapsack",
      name: "knapsack",
      aliases: [],
      searchText: "knapsack",
      source: "user" as const,
      deprecated: false,
      hidden: false,
    };

    const result = getTagVisibilitySavePlan({
      hiddenIds: ["builtin.old"],
      aliases: undefined,
    }, suggestion, true);

    expect(result).toEqual({
      previousConfig: {
        version: 1,
        hiddenIds: ["builtin.old"],
        aliases: {},
        merges: {},
        orderOverrides: {},
        entries: [],
        customCollections: [],
      },
      nextConfig: {
        version: 1,
        hiddenIds: ["builtin.old", "user.dp.knapsack"],
        aliases: {},
        merges: {},
        orderOverrides: {},
        entries: [],
        customCollections: [],
      },
      failureMessage: VISIBILITY_SAVE_FAILURE_MESSAGE,
      operation: "visibility",
    });
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

describe("tagManagerConfig custom tag save resolutions", () => {
  const createState: CustomTagCreateSelectionState = {
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
  const createPlan = {
    activeRoot: "算法",
    expandedGroupOrderKey: "algorithm.group.dp",
    filterMode: "all" as const,
    selectedGroupOrderKey: null,
    selectedSuggestionId: "user.dp.knapsack",
  };
  const editState: CustomTagEditSelectionState = {
    selectedSuggestionId: "user.string.old-tag",
    customTagEditDraft: {
      name: "旧标签",
      aliasesText: "旧别名",
    },
    customTagEditError: "old edit error",
  };

  it("resolves custom tag create save success by applying the create selection plan", () => {
    expect(getCustomTagCreateSaveResolution(
      createState,
      true,
      CUSTOM_TAG_SAVE_FAILURE_MESSAGE,
      createPlan,
    )).toEqual({
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

  it("resolves custom tag create save failure by preserving the draft and updating the error", () => {
    expect(getCustomTagCreateSaveResolution(
      createState,
      false,
      CUSTOM_TAG_SAVE_FAILURE_MESSAGE,
      createPlan,
    )).toEqual({
      ...createState,
      customTagCreateError: CUSTOM_TAG_SAVE_FAILURE_MESSAGE,
    });
  });

  it("resolves custom tag edit save success by clearing edit state and selecting the saved tag", () => {
    expect(getCustomTagEditSaveResolution(
      editState,
      true,
      CUSTOM_TAG_SAVE_FAILURE_MESSAGE,
      "user.dp.knapsack",
    )).toEqual({
      selectedSuggestionId: "user.dp.knapsack",
      customTagEditDraft: null,
      customTagEditError: null,
    });
  });

  it("resolves custom tag delete save success by clearing edit state and selection", () => {
    expect(getCustomTagEditSaveResolution(
      editState,
      true,
      CUSTOM_TAG_SAVE_FAILURE_MESSAGE,
      null,
    )).toEqual({
      selectedSuggestionId: null,
      customTagEditDraft: null,
      customTagEditError: null,
    });
  });

  it("resolves custom tag edit/delete save failure by preserving the draft and updating the error", () => {
    expect(getCustomTagEditSaveResolution(
      editState,
      false,
      CUSTOM_TAG_SAVE_FAILURE_MESSAGE,
      "user.dp.knapsack",
    )).toEqual({
      ...editState,
      customTagEditError: CUSTOM_TAG_SAVE_FAILURE_MESSAGE,
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
    expect(getFailedCollectionCreateSaveState(state, "save failed")).toEqual({
      activeView: "tags",
      createInput: "draft collection",
      createError: "save failed",
      editError: "old edit error",
    });
  });

  it("stores edit failures in collection panel state", () => {
    expect(getFailedCollectionEditSaveState(state, "rename failed")).toEqual({
      activeView: "tags",
      createInput: "draft collection",
      createError: "old create error",
      editError: "rename failed",
    });
  });

  it("stores delete save failures in collection panel state", () => {
    expect(getFailedCollectionDeleteSaveState(state, "delete failed")).toEqual({
      activeView: "tags",
      createInput: "draft collection",
      createError: "old create error",
      editError: "delete failed",
    });
  });
});

describe("tagManagerConfig collection save resolutions", () => {
  const state: CollectionSaveState = {
    panelState: {
      activeView: "collections",
      createInput: "draft collection",
      createError: "old create error",
      editError: "old edit error",
    },
    editState: {
      editingName: "old collection",
      editInput: "edited collection",
      editError: "old edit error",
      createError: "old create error",
    },
  };

  it("resolves create save success by clearing create input while preserving edit state", () => {
    expect(getCollectionCreateSaveResolution(state, true, "save failed")).toEqual({
      panelState: {
        activeView: "collections",
        createInput: "",
        createError: null,
        editError: "old edit error",
      },
      editState: state.editState,
    });
  });

  it("resolves create save failure by storing the failure on panel state", () => {
    expect(getCollectionCreateSaveResolution(state, false, "save failed")).toEqual({
      panelState: {
        activeView: "collections",
        createInput: "draft collection",
        createError: "save failed",
        editError: "old edit error",
      },
      editState: state.editState,
    });
  });

  it("resolves edit save success by clearing edit mode while preserving panel state", () => {
    expect(getCollectionEditSaveResolution(state, true, "save failed")).toEqual({
      panelState: state.panelState,
      editState: {
        editingName: null,
        editInput: "",
        editError: null,
        createError: "old create error",
      },
    });
  });

  it("resolves edit save failure by storing the failure on panel state", () => {
    expect(getCollectionEditSaveResolution(state, false, "save failed")).toEqual({
      panelState: {
        activeView: "collections",
        createInput: "draft collection",
        createError: "old create error",
        editError: "save failed",
      },
      editState: state.editState,
    });
  });

  it("resolves delete save success by clearing edit mode when deleting the active collection", () => {
    expect(getCollectionDeleteSaveResolution(state, "old collection", true, "save failed")).toEqual({
      panelState: state.panelState,
      editState: {
        editingName: null,
        editInput: "",
        editError: null,
        createError: "old create error",
      },
    });
  });

  it("resolves delete save failure by storing the failure on panel state", () => {
    expect(getCollectionDeleteSaveResolution(state, "old collection", false, "save failed")).toEqual({
      panelState: {
        activeView: "collections",
        createInput: "draft collection",
        createError: "old create error",
        editError: "save failed",
      },
      editState: state.editState,
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

  it("stores merge save failures while preserving editor progress", () => {
    expect(getFailedMergeSaveState(openState, MERGE_SAVE_FAILURE_MESSAGE)).toEqual({
      isOpen: true,
      searchQuery: "z function",
      selectedTargetId: "algorithm.string.z-function",
      error: MERGE_SAVE_FAILURE_MESSAGE,
    });
  });
});

describe("tagManagerConfig merge save resolutions", () => {
  const state: MergeEditorState = {
    isOpen: true,
    searchQuery: "kmp",
    selectedTargetId: "algorithm.string.z-function",
    error: "old merge error",
  };

  it("resolves merge save success by closing the editor", () => {
    expect(getMergeSaveResolution(state, true, MERGE_SAVE_FAILURE_MESSAGE)).toEqual({
      isOpen: false,
      searchQuery: "",
      selectedTargetId: null,
      error: null,
    });
  });

  it("resolves merge save failure by keeping editor state and updating the error", () => {
    expect(getMergeSaveResolution(state, false, MERGE_SAVE_FAILURE_MESSAGE)).toEqual({
      isOpen: true,
      searchQuery: "kmp",
      selectedTargetId: "algorithm.string.z-function",
      error: MERGE_SAVE_FAILURE_MESSAGE,
    });
  });

  it("resolves merge delete success by closing the editor", () => {
    expect(getMergeDeleteResolution(state, true, MERGE_SAVE_FAILURE_MESSAGE)).toEqual({
      isOpen: false,
      searchQuery: "",
      selectedTargetId: null,
      error: null,
    });
  });

  it("resolves merge delete failure by keeping editor state and updating the error", () => {
    expect(getMergeDeleteResolution(state, false, MERGE_SAVE_FAILURE_MESSAGE)).toEqual({
      isOpen: true,
      searchQuery: "kmp",
      selectedTargetId: "algorithm.string.z-function",
      error: MERGE_SAVE_FAILURE_MESSAGE,
    });
  });
});

describe("tagManagerConfig alias editor state rules", () => {
  const state: AliasEditorState = {
    input: "new alias",
    error: "old alias error",
  };

  it("stores alias save failures while preserving the current input", () => {
    expect(getFailedAliasSaveState(state, ALIAS_SAVE_FAILURE_MESSAGE)).toEqual({
      input: "new alias",
      error: ALIAS_SAVE_FAILURE_MESSAGE,
    });
  });
});

describe("tagManagerConfig alias save resolutions", () => {
  const state: AliasEditorState = {
    input: "new alias",
    error: "old alias error",
  };

  it("resolves alias save success by clearing input and error", () => {
    expect(getAliasSaveResolution(state, true, ALIAS_SAVE_FAILURE_MESSAGE)).toEqual({
      input: "",
      error: null,
    });
  });

  it("resolves alias save failure by preserving input and updating error", () => {
    expect(getAliasSaveResolution(state, false, ALIAS_SAVE_FAILURE_MESSAGE)).toEqual({
      input: "new alias",
      error: ALIAS_SAVE_FAILURE_MESSAGE,
    });
  });

  it("resolves alias delete success by preserving cleared error and current input", () => {
    expect(getAliasDeleteSaveResolution(state, true, ALIAS_SAVE_FAILURE_MESSAGE)).toEqual({
      input: "new alias",
      error: null,
    });
  });

  it("resolves alias delete failure by preserving input and updating error", () => {
    expect(getAliasDeleteSaveResolution(state, false, ALIAS_SAVE_FAILURE_MESSAGE)).toEqual({
      input: "new alias",
      error: ALIAS_SAVE_FAILURE_MESSAGE,
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

describe("tagManagerConfig confirm options", () => {
  it("builds custom tag delete confirmation copy from the selected path", () => {
    expect(getCustomTagDeleteConfirmOptions("算法/字符串/KMP")).toEqual({
      title: "删除自定义标签“算法/字符串/KMP”？",
      description: "不会自动修改 notes。",
      confirmText: "删除",
      danger: true,
    });
  });

  it("builds merge save confirmation copy from selected paths", () => {
    expect(getMergeSaveConfirmOptions("算法/字符串/KMP", "算法/字符串")).toEqual({
      title: "确认合并标签？",
      description: "确认把“算法/字符串/KMP”合并到“算法/字符串”？\n\n以后规范化和建议会优先指向目标标签；不会自动修改 notes。",
      confirmText: "合并",
      danger: true,
    });
  });

  it("builds merge delete confirmation copy from the selected path", () => {
    expect(getMergeDeleteConfirmOptions("算法/字符串/KMP")).toEqual({
      title: "取消合并规则？",
      description: "确认取消“算法/字符串/KMP”的合并规则？\n\n不会自动修改 notes。",
      confirmText: "取消合并",
      danger: true,
    });
  });

  it("builds collection delete confirmation copy from the collection name", () => {
    expect(getCollectionDeleteConfirmOptions("训练清单")).toEqual({
      title: "删除自定义文集“训练清单”？",
      description: "只会删除候选，不会修改已有文章。",
      confirmText: "删除",
      danger: true,
    });
  });
});
