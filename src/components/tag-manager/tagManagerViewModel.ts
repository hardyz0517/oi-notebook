import { getTagSuggestionList, getTagSuggestionRootGroups, type TagSuggestion, type UserTagTaxonomyConfig } from "@/lib/tagTaxonomy";

import { sortGroupsByOrderOverrides } from "./tagManagerOrdering";
import type { GroupNode, MergePreviewInfo, RootGroup, TagManagerFilterMode } from "./types";
import {
  buildCollectionCandidateRows,
  filterTagRootGroups,
  filterTagSuggestions,
  getBuiltinAliasesForSuggestion,
  getMergePreviewInfo,
  getMergeTargetCandidates,
  getUserAliasesForSuggestion,
  isLeafTagSuggestion,
  normalizeConfig,
  type CollectionCandidateRow,
} from "./tagManagerConfig";

export interface TagManagerWorkspaceViewModelInput {
  config: UserTagTaxonomyConfig;
  showHidden: boolean;
  filterMode: TagManagerFilterMode;
  activeRoot: string | null;
  selectedSuggestionId: string | null;
  selectedMergeTargetId: string | null;
  mergeSearchQuery: string;
  searchQuery: string;
  builtinCollections: string[];
  noteCollections: string[];
}

export interface TagManagerWorkspaceViewModel {
  includeHidden: boolean;
  baseSuggestions: TagSuggestion[];
  baseRootGroups: RootGroup[];
  suggestions: TagSuggestion[];
  rootGroups: RootGroup[];
  activeRootGroup: RootGroup | null;
  nextActiveRoot: string | null;
  activeRootSortedGroups: GroupNode[];
  activeRootSortableItems: string[];
  selectedSuggestion: TagSuggestion | null;
  selectedUserAliases: string[];
  selectedBuiltinAliases: string[];
  mergePreview: MergePreviewInfo;
  canEditMergeRule: boolean;
  mergeTargetCandidates: TagSuggestion[];
  selectedMergeTarget: TagSuggestion | null;
  collectionRows: CollectionCandidateRow[];
  collectionExistingCandidates: string[];
  canManageAliases: boolean;
  isSortDisabled: boolean;
  searchResults: TagSuggestion[];
}

export function deriveTagManagerWorkspaceViewModel(
  input: TagManagerWorkspaceViewModelInput,
): TagManagerWorkspaceViewModel {
  const workingConfig = normalizeConfig(input.config);
  const includeHidden = input.showHidden || input.filterMode === "hidden";
  const baseSuggestions = getTagSuggestionList(workingConfig, { includeHidden, includeDeprecated: true });
  const baseRootGroups = getTagSuggestionRootGroups(workingConfig, { includeHidden, includeDeprecated: true });
  const suggestions = filterTagSuggestions(baseSuggestions, input.filterMode);
  const rootGroups = filterTagRootGroups(baseRootGroups, input.filterMode);
  const activeRootGroup = rootGroups.find((group) => group.root === input.activeRoot) ?? rootGroups[0] ?? null;
  const nextActiveRoot = activeRootGroup?.root ?? null;
  const activeRootSortedGroups = activeRootGroup
    ? sortGroupsByOrderOverrides(activeRootGroup.groups, workingConfig.orderOverrides)
    : [];
  const activeRootSortableItems = activeRootSortedGroups.map((group) => group.orderKey);
  const selectedSuggestion =
    suggestions.find((suggestion) => suggestion.id === input.selectedSuggestionId) ?? null;
  const selectedUserAliases = getUserAliasesForSuggestion(workingConfig, selectedSuggestion);
  const selectedBuiltinAliases = getBuiltinAliasesForSuggestion(selectedSuggestion, selectedUserAliases);
  const mergePreview = getMergePreviewInfo(workingConfig, selectedSuggestion, baseSuggestions);
  const canEditMergeRule = isLeafTagSuggestion(selectedSuggestion);
  const mergeTargetCandidates = getMergeTargetCandidates(
    baseSuggestions,
    selectedSuggestion,
    workingConfig,
    input.mergeSearchQuery,
  );
  const selectedMergeTarget =
    mergeTargetCandidates.find((candidate) => candidate.id === input.selectedMergeTargetId)
    ?? baseSuggestions.find((candidate) => candidate.id === input.selectedMergeTargetId)
    ?? null;
  const collectionRows = buildCollectionCandidateRows(
    input.builtinCollections,
    workingConfig.customCollections ?? [],
    input.noteCollections,
  );
  const collectionExistingCandidates = [
    ...input.builtinCollections,
    ...input.noteCollections,
    ...(workingConfig.customCollections ?? []),
  ];
  const canManageAliases = Boolean(selectedSuggestion && selectedSuggestion.path.length >= 3);
  const isSortDisabled = Boolean(input.searchQuery.trim()) || input.filterMode !== "all";
  const normalizedSearchQuery = input.searchQuery.trim().toLowerCase();
  const searchResults = normalizedSearchQuery
    ? suggestions
      .filter((suggestion) => [
        suggestion.id,
        suggestion.name,
        suggestion.pathText,
        suggestion.searchText,
        ...suggestion.aliases,
      ].join("\n").toLowerCase().includes(normalizedSearchQuery))
      .slice(0, 100)
    : [];

  return {
    includeHidden,
    baseSuggestions,
    baseRootGroups,
    suggestions,
    rootGroups,
    activeRootGroup,
    nextActiveRoot,
    activeRootSortedGroups,
    activeRootSortableItems,
    selectedSuggestion,
    selectedUserAliases,
    selectedBuiltinAliases,
    mergePreview,
    canEditMergeRule,
    mergeTargetCandidates,
    selectedMergeTarget,
    collectionRows,
    collectionExistingCandidates,
    canManageAliases,
    isSortDisabled,
    searchResults,
  };
}
