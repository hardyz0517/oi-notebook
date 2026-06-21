import { describe, expect, it } from "vitest";

import type { UserTagTaxonomyConfig } from "@/lib/tagTaxonomy";

import { deriveTagManagerWorkspaceViewModel } from "./tagManagerViewModel";

describe("tagManagerViewModel", () => {
  const config: UserTagTaxonomyConfig = {
    entries: [
      {
        id: "user.dp.knapsack",
        path: ["算法", "动态规划", "背包"],
        aliases: ["背包 DP"],
        source: "user",
      },
    ],
    aliases: {
      "旧 KMP": "algorithm.string.kmp",
    },
    hiddenIds: ["algorithm.string.kmp"],
    merges: {
      "algorithm.string.kmp": "algorithm.string.z-function",
    },
    customCollections: ["复盘", "训练记录"],
  };

  it("derives filtered roots, active root, selected suggestion, and alias display state", () => {
    const view = deriveTagManagerWorkspaceViewModel({
      config,
      showHidden: false,
      filterMode: "hidden",
      activeRoot: "算法",
      selectedSuggestionId: "algorithm.string.kmp",
      selectedMergeTargetId: null,
      mergeSearchQuery: "",
      searchQuery: "",
      builtinCollections: [],
      noteCollections: [],
    });

    expect(view.includeHidden).toBe(true);
    expect(view.activeRootGroup?.root).toBe("算法");
    expect(view.selectedSuggestion?.id).toBe("algorithm.string.kmp");
    expect(view.selectedUserAliases).not.toContain("旧 KMP");
    expect(view.canManageAliases).toBe(true);
    expect(view.canEditMergeRule).toBe(true);
    expect(view.mergePreview.targetSuggestion?.id).toBe("algorithm.string.z-function");
  });

  it("assigns user aliases pointing at a merged source to the merge target", () => {
    const view = deriveTagManagerWorkspaceViewModel({
      config,
      showHidden: true,
      filterMode: "all",
      activeRoot: "算法",
      selectedSuggestionId: "algorithm.string.z-function",
      selectedMergeTargetId: null,
      mergeSearchQuery: "",
      searchQuery: "",
      builtinCollections: [],
      noteCollections: [],
    });

    expect(view.selectedUserAliases).toContain("旧 KMP");
  });

  it("derives search results and disables sorting while searching", () => {
    const view = deriveTagManagerWorkspaceViewModel({
      config,
      showHidden: true,
      filterMode: "all",
      activeRoot: null,
      selectedSuggestionId: null,
      selectedMergeTargetId: null,
      mergeSearchQuery: "",
      searchQuery: "背包",
      builtinCollections: [],
      noteCollections: [],
    });

    expect(view.isSortDisabled).toBe(true);
    expect(view.searchResults.some((suggestion) => suggestion.id === "user.dp.knapsack")).toBe(true);
    expect(view.searchResults.length).toBeLessThanOrEqual(100);
  });

  it("derives merge target candidates and preserves selected target outside the filtered list", () => {
    const view = deriveTagManagerWorkspaceViewModel({
      config: {},
      showHidden: true,
      filterMode: "all",
      activeRoot: "算法",
      selectedSuggestionId: "algorithm.string.kmp",
      selectedMergeTargetId: "algorithm.string.z-function",
      mergeSearchQuery: "",
      searchQuery: "",
      builtinCollections: [],
      noteCollections: [],
    });

    expect(view.mergeTargetCandidates).toEqual([]);
    expect(view.selectedMergeTarget?.id).toBe("algorithm.string.z-function");
  });

  it("merges collection rows and existing candidates from builtin, custom, and notes", () => {
    const view = deriveTagManagerWorkspaceViewModel({
      config,
      showHidden: false,
      filterMode: "all",
      activeRoot: null,
      selectedSuggestionId: null,
      selectedMergeTargetId: null,
      mergeSearchQuery: "",
      searchQuery: "",
      builtinCollections: ["题解", "复盘"],
      noteCollections: ["复盘", "周赛"],
    });

    const reviewRow = view.collectionRows.find((row) => row.name === "复盘");
    expect(reviewRow).toMatchObject({
      isBuiltin: true,
      isCustom: true,
      isFromArticle: true,
    });
    expect(view.collectionExistingCandidates).toEqual(["题解", "复盘", "复盘", "周赛", "复盘", "训练记录"]);
  });
});
