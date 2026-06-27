import { getTagSuggestionList, type TagTaxonomyEntry, type UserTagTaxonomyConfig } from "./tagTaxonomy";

export interface TagTaxonomySettingsStats {
  statusLabel: string;
  entriesCount: number;
  aliasesCount: number;
  hiddenIdsCount: number;
  orderOverridesCount: number;
  mergesCount: number;
  customCollectionsCount: number;
  availableCandidateCount: number;
  userConfigItemCount: number;
}

export interface TagTaxonomySettingsStatItem {
  label: string;
  value: number;
}

export type TagTaxonomySettingsStatusTone = "warning" | "success" | "muted";

export interface TagTaxonomySettingsViewInput {
  isLoading: boolean;
  isSaving: boolean;
  hasLoadError: boolean;
  userConfigItemCount: number;
}

export interface TagTaxonomySettingsView {
  statusTone: TagTaxonomySettingsStatusTone;
  isReloadDisabled: boolean;
  showReloadSpinner: boolean;
  areConfigActionsDisabled: boolean;
  isConfirmImportDisabled: boolean;
  showConfirmImportSpinner: boolean;
  areEditActionsDisabled: boolean;
}

export interface BuildTagTaxonomyStatsInput {
  config: UserTagTaxonomyConfig | null | undefined;
  userConfig: UserTagTaxonomyConfig | null | undefined;
  isLoading: boolean;
  loadError: string | null | undefined;
}

export function buildTagTaxonomyStats(input: BuildTagTaxonomyStatsInput): TagTaxonomySettingsStats {
  const entriesCount = input.config?.entries?.length ?? 0;
  const aliasesCount = Object.keys(input.config?.aliases ?? {}).length;
  const hiddenIdsCount = input.config?.hiddenIds?.length ?? 0;
  const orderOverridesCount = Object.keys(input.config?.orderOverrides ?? {}).length;
  const mergesCount = Object.keys(input.config?.merges ?? {}).length;
  const customCollectionsCount = input.config?.customCollections?.length ?? 0;
  const userConfigItemCount = entriesCount + aliasesCount + hiddenIdsCount + orderOverridesCount + mergesCount + customCollectionsCount;
  const availableCandidateCount = getTagSuggestionList(input.userConfig)
    .filter((suggestion) => !suggestion.hidden && !suggestion.deprecated)
    .length;
  const statusLabel = input.isLoading
    ? "正在读取"
    : input.loadError
      ? "加载失败，已回退内置默认配置"
      : userConfigItemCount > 0
        ? "已加载用户配置"
        : "使用内置默认配置";

  return {
    statusLabel,
    entriesCount,
    aliasesCount,
    hiddenIdsCount,
    orderOverridesCount,
    mergesCount,
    customCollectionsCount,
    availableCandidateCount,
    userConfigItemCount,
  };
}

export function deriveTagTaxonomySettingsView(input: TagTaxonomySettingsViewInput): TagTaxonomySettingsView {
  const statusTone: TagTaxonomySettingsStatusTone = input.hasLoadError
    ? "warning"
    : input.userConfigItemCount > 0
      ? "success"
      : "muted";

  return {
    statusTone,
    isReloadDisabled: input.isLoading,
    showReloadSpinner: input.isLoading,
    areConfigActionsDisabled: input.isSaving,
    isConfirmImportDisabled: input.isSaving,
    showConfirmImportSpinner: input.isSaving,
    areEditActionsDisabled: input.isSaving,
  };
}

export function buildTagTaxonomyStatItems(stats: TagTaxonomySettingsStats): TagTaxonomySettingsStatItem[] {
  return [
    { label: "自定义标签", value: stats.entriesCount },
    { label: "自定义别名", value: stats.aliasesCount },
    { label: "隐藏默认标签", value: stats.hiddenIdsCount },
    { label: "排序覆盖", value: stats.orderOverridesCount },
    { label: "合并规则", value: stats.mergesCount },
    { label: "自定义文集", value: stats.customCollectionsCount },
  ];
}

export function getTagTaxonomyUserEntries(config: UserTagTaxonomyConfig | null | undefined): TagTaxonomyEntry[] {
  return [...(config?.entries ?? [])].sort((left, right) =>
    left.path.join("/").localeCompare(right.path.join("/"), "zh-Hans-CN"),
  );
}

export function getTagTaxonomyUserAliases(config: UserTagTaxonomyConfig | null | undefined): Array<[string, string]> {
  return Object.entries(config?.aliases ?? {}).sort(([left], [right]) => left.localeCompare(right, "zh-Hans-CN"));
}

export function filterTagTaxonomyUserEntries(entries: TagTaxonomyEntry[], query: string): TagTaxonomyEntry[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return entries;

  return entries.filter((entry) => {
    const searchText = [
      entry.id,
      entry.path.join("/"),
      entry.path.join(" / "),
      ...(entry.aliases ?? []),
    ].join("\n").toLowerCase();
    return searchText.includes(normalizedQuery);
  });
}

export function filterTagTaxonomyUserAliases(aliases: Array<[string, string]>, query: string): Array<[string, string]> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return aliases;
  return aliases.filter(([aliasName, target]) => `${aliasName}\n${target}`.toLowerCase().includes(normalizedQuery));
}

export function getDisplayedTagTaxonomyList<T>(items: T[], query: string, isExpanded: boolean, collapsedLimit = 5): T[] {
  if (query.trim() || isExpanded) return items;
  return items.slice(0, collapsedLimit);
}

export function getTagManagerAvailableCandidateCount(userConfig: UserTagTaxonomyConfig | null | undefined): number {
  return getTagSuggestionList(userConfig).filter((suggestion) => !suggestion.hidden).length;
}
