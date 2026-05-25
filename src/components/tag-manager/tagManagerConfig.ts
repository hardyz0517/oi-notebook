import { BUILTIN_TAG_TAXONOMY, findTagSuggestionsByQuery, getTagSuggestionList, normalizeTagPath, type TagSuggestion, type TagTaxonomyEntry, type UserTagTaxonomyConfig } from "@/lib/tagTaxonomy";
import type { GroupNode, MergePreviewInfo, RootGroup, SaveOperation, TagManagerFilterMode } from "./types";

const builtinTagTaxonomyEntryIds = new Set(BUILTIN_TAG_TAXONOMY.map((entry) => entry.id));

export type TagTaxonomyConfigImportPreview = {
  entriesCount: number;
  aliasesCount: number;
  hiddenIdsCount: number;
  orderOverridesCount: number;
  mergesCount: number;
};

export type TagTaxonomyConfigImportResult = {
  config: UserTagTaxonomyConfig;
  preview: TagTaxonomyConfigImportPreview;
};

export type CustomTagEditDraft = {
  name: string;
  aliasesText: string;
};

export type CustomTagCreateDraft = {
  parentPathText: string;
  parentLocked: boolean;
  name: string;
  aliasesText: string;
};

export type CustomTagEditResult =
  | {
    ok: true;
    config: UserTagTaxonomyConfig;
    nextPathText: string;
  }
  | {
    ok: false;
    error: string;
  };

export type CustomTagCreateResult =
  | {
    ok: true;
    config: UserTagTaxonomyConfig;
    entryId: string;
    pathText: string;
  }
  | {
    ok: false;
    error: string;
  };

export type CustomTagDeleteResult =
  | {
    ok: true;
    config: UserTagTaxonomyConfig;
  }
  | {
    ok: false;
    error: string;
  };

export type MergeRuleUpdateResult =
  | {
    ok: true;
    config: UserTagTaxonomyConfig;
  }
  | {
    ok: false;
    error: string;
  };

export function normalizeConfig(config: UserTagTaxonomyConfig | null | undefined): UserTagTaxonomyConfig {
  return {
    version: config?.version ?? 1,
    entries: [...(config?.entries ?? [])],
    aliases: { ...(config?.aliases ?? {}) },
    hiddenIds: [...(config?.hiddenIds ?? [])],
    orderOverrides: { ...(config?.orderOverrides ?? {}) },
    merges: { ...(config?.merges ?? {}) },
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStringRecord(value: unknown, fieldName: string): Record<string, string> {
  if (value === undefined) return {};
  if (!isPlainRecord(value)) {
    throw new Error(`${fieldName} 必须是对象。`);
  }

  const result: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (typeof rawValue !== "string") {
      throw new Error(`${fieldName}.${key} 必须是字符串。`);
    }
    result[key] = rawValue;
  }
  return result;
}

function parseNumberRecord(value: unknown, fieldName: string): Record<string, number> {
  if (value === undefined) return {};
  if (!isPlainRecord(value)) {
    throw new Error(`${fieldName} 必须是对象。`);
  }

  const result: Record<string, number> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
      throw new Error(`${fieldName}.${key} 必须是有限数字。`);
    }
    result[key] = rawValue;
  }
  return result;
}

function parseStringArray(value: unknown, fieldName: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} 必须是数组。`);
  }
  if (!value.every((item) => typeof item === "string")) {
    throw new Error(`${fieldName} 只能包含字符串。`);
  }
  return [...value];
}

function parseTaxonomyEntries(value: unknown): TagTaxonomyEntry[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error("entries 必须是数组。");
  }

  return value.map((rawEntry, index) => {
    if (!isPlainRecord(rawEntry)) {
      throw new Error(`entries[${index}] 必须是对象。`);
    }
    if (typeof rawEntry.id !== "string" || rawEntry.id.trim().length === 0) {
      throw new Error(`entries[${index}].id 必须是非空字符串。`);
    }
    if (!Array.isArray(rawEntry.path) || rawEntry.path.length === 0 || !rawEntry.path.every((segment) => typeof segment === "string" && segment.trim().length > 0)) {
      throw new Error(`entries[${index}].path 必须是非空字符串数组。`);
    }
    if (rawEntry.source === "builtin") {
      throw new Error("导入配置的 entries 不能包含内置标签。");
    }
    if (builtinTagTaxonomyEntryIds.has(rawEntry.id)) {
      throw new Error(`导入配置的 entries 不能包含内置标签：${rawEntry.id}`);
    }
    if (rawEntry.aliases !== undefined && (!Array.isArray(rawEntry.aliases) || !rawEntry.aliases.every((alias) => typeof alias === "string"))) {
      throw new Error(`entries[${index}].aliases 必须是字符串数组。`);
    }
    if (rawEntry.order !== undefined && (typeof rawEntry.order !== "number" || !Number.isFinite(rawEntry.order))) {
      throw new Error(`entries[${index}].order 必须是有限数字。`);
    }
    if (rawEntry.hidden !== undefined && typeof rawEntry.hidden !== "boolean") {
      throw new Error(`entries[${index}].hidden 必须是布尔值。`);
    }
    if (rawEntry.deprecated !== undefined && typeof rawEntry.deprecated !== "boolean") {
      throw new Error(`entries[${index}].deprecated 必须是布尔值。`);
    }
    if (rawEntry.mergeTo !== undefined && typeof rawEntry.mergeTo !== "string") {
      throw new Error(`entries[${index}].mergeTo 必须是字符串。`);
    }

    return {
      id: rawEntry.id,
      path: [...rawEntry.path],
      aliases: rawEntry.aliases === undefined ? undefined : [...rawEntry.aliases],
      order: rawEntry.order,
      source: rawEntry.source === "user" ? "user" : undefined,
      hidden: rawEntry.hidden,
      deprecated: rawEntry.deprecated,
      mergeTo: rawEntry.mergeTo,
    };
  });
}

export function getTagTaxonomyConfigImportPreview(config: UserTagTaxonomyConfig): TagTaxonomyConfigImportPreview {
  return {
    entriesCount: config.entries?.length ?? 0,
    aliasesCount: Object.keys(config.aliases ?? {}).length,
    hiddenIdsCount: config.hiddenIds?.length ?? 0,
    orderOverridesCount: Object.keys(config.orderOverrides ?? {}).length,
    mergesCount: Object.keys(config.merges ?? {}).length,
  };
}

export function parseUserTagTaxonomyConfigJson(jsonText: string): TagTaxonomyConfigImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("JSON 解析失败，请检查格式。");
  }

  if (!isPlainRecord(parsed)) {
    throw new Error("导入内容必须是 JSON 对象。");
  }

  if (parsed.version !== undefined && (typeof parsed.version !== "number" || !Number.isFinite(parsed.version) || parsed.version < 1)) {
    throw new Error("version 必须大于等于 1。");
  }

  const config: UserTagTaxonomyConfig = {
    version: parsed.version === undefined ? 1 : parsed.version,
    entries: parseTaxonomyEntries(parsed.entries),
    aliases: parseStringRecord(parsed.aliases, "aliases"),
    hiddenIds: parseStringArray(parsed.hiddenIds, "hiddenIds"),
    orderOverrides: parseNumberRecord(parsed.orderOverrides, "orderOverrides"),
    merges: parseStringRecord(parsed.merges, "merges"),
  };

  return {
    config,
    preview: getTagTaxonomyConfigImportPreview(config),
  };
}

export function getAliasCompareKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
}

export function parseTagManagerAliasText(value: string): string[] {
  const aliases: string[] = [];
  const seen = new Set<string>();

  for (const rawAlias of value.split(/[,，]/)) {
    const alias = rawAlias.trim().replace(/\s+/g, " ");
    const key = getAliasCompareKey(alias);
    if (!alias || seen.has(key)) {
      continue;
    }
    seen.add(key);
    aliases.push(alias);
  }

  return aliases;
}

function normalizeTagManagerPathSegment(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function parseTagManagerParentPath(value: string): string[] {
  return value
    .split(/[\/／]/)
    .map(normalizeTagManagerPathSegment)
    .filter(Boolean);
}

function slugifyUserTagIdSegment(value: string): string {
  const ascii = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (ascii) return ascii;

  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `u${(hash >>> 0).toString(36)}`;
}

function createUserTagEntryId(path: string[], existingEntries: TagTaxonomyEntry[]): string {
  const baseId = `user.${path.map(slugifyUserTagIdSegment).join(".")}`;
  const existingIds = new Set([
    ...BUILTIN_TAG_TAXONOMY.map((entry) => entry.id),
    ...existingEntries.map((entry) => entry.id),
  ]);
  if (!existingIds.has(baseId)) return baseId;

  let index = 2;
  while (existingIds.has(`${baseId}.${index}`)) {
    index += 1;
  }
  return `${baseId}.${index}`;
}

function collectOtherAliasOwners(suggestions: TagSuggestion[], config: UserTagTaxonomyConfig, ignoredId?: string): Map<string, string> {
  const otherAliasOwner = new Map<string, string>();
  for (const candidate of suggestions) {
    if (candidate.id === ignoredId) {
      continue;
    }
    for (const alias of candidate.aliases) {
      otherAliasOwner.set(getAliasCompareKey(alias), candidate.id);
    }
  }
  for (const [alias, targetId] of Object.entries(config.aliases ?? {})) {
    if (targetId !== ignoredId) {
      otherAliasOwner.set(getAliasCompareKey(alias), targetId);
    }
  }
  return otherAliasOwner;
}

export function getUserAliasesForSuggestion(config: UserTagTaxonomyConfig, suggestion: TagSuggestion | null): string[] {
  if (!suggestion) return [];
  return Object.entries(config.aliases ?? {})
    .filter(([, targetId]) => targetId === suggestion.id)
    .map(([alias]) => alias.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function getBuiltinAliasesForSuggestion(suggestion: TagSuggestion | null, userAliases: string[]): string[] {
  if (!suggestion) return [];
  const userAliasKeys = new Set(userAliases.map(getAliasCompareKey));
  return suggestion.aliases.filter((alias) => !userAliasKeys.has(getAliasCompareKey(alias)));
}

export function getCustomTagCreateDraft(
  suggestion: TagSuggestion | null,
  selectedGroupOrderKey: string | null,
  activeRootGroups: GroupNode[],
): CustomTagCreateDraft {
  const selectedGroup = selectedGroupOrderKey
    ? activeRootGroups.find((group) => group.orderKey === selectedGroupOrderKey) ?? null
    : null;
  const parentPath = selectedGroup?.path
    ?? (suggestion && suggestion.path.length >= 3 ? suggestion.path.slice(0, -1) : []);

  return {
    parentPathText: parentPath.join(" / "),
    parentLocked: parentPath.length >= 2,
    name: "",
    aliasesText: "",
  };
}

export function createCustomTagEntry(config: UserTagTaxonomyConfig, draft: CustomTagCreateDraft): CustomTagCreateResult {
  const currentConfig = normalizeConfig(config);
  const parentPath = parseTagManagerParentPath(draft.parentPathText);
  const nextName = normalizeTagManagerPathSegment(draft.name);

  if (parentPath.length < 2) {
    return { ok: false, error: "请选择一个二级标签后创建。" };
  }
  if (!nextName) {
    return { ok: false, error: "标签名不能为空。" };
  }
  if (nextName.includes("/") || nextName.includes("／")) {
    return { ok: false, error: "标签名不能包含 /。" };
  }

  const nextPath = [...parentPath, nextName];
  const nextPathText = nextPath.join("/");
  const suggestions = getTagSuggestionList(currentConfig, { includeHidden: true, includeDeprecated: true });
  const conflictingPath = suggestions.find((candidate) => candidate.path.join("/") === nextPathText);
  if (conflictingPath) {
    return { ok: false, error: "这个标签路径已经存在。" };
  }

  const nextEntryAliases = parseTagManagerAliasText(draft.aliasesText);
  const otherAliasOwner = collectOtherAliasOwners(suggestions, currentConfig);
  for (const alias of nextEntryAliases) {
    if (otherAliasOwner.has(getAliasCompareKey(alias))) {
      return { ok: false, error: `别名已被其它标签使用：${alias}` };
    }
  }

  const entryId = createUserTagEntryId(nextPath, currentConfig.entries ?? []);
  const nextEntry: TagTaxonomyEntry = {
    id: entryId,
    path: nextPath,
    aliases: nextEntryAliases,
    source: "user",
  };

  return {
    ok: true,
    config: normalizeConfig({
      ...currentConfig,
      entries: [...(currentConfig.entries ?? []), nextEntry],
    }),
    entryId,
    pathText: nextPathText,
  };
}

export function getCustomTagEditDraft(config: UserTagTaxonomyConfig, suggestion: TagSuggestion | null): CustomTagEditDraft {
  if (!suggestion || suggestion.source !== "user") {
    return { name: "", aliasesText: "" };
  }

  const entry = config.entries?.find((item) => item.id === suggestion.id);
  if (!entry) {
    return { name: suggestion.name, aliasesText: "" };
  }

  const aliases = [
    ...(entry.aliases ?? []),
    ...Object.entries(config.aliases ?? {})
      .filter(([, targetId]) => targetId === entry.id)
      .map(([alias]) => alias),
  ];

  return {
    name: entry.path[entry.path.length - 1] ?? suggestion.name,
    aliasesText: parseTagManagerAliasText(aliases.join(", ")).join(", "),
  };
}

export function deleteCustomTagEntry(config: UserTagTaxonomyConfig, suggestion: TagSuggestion | null): CustomTagDeleteResult {
  if (!suggestion || suggestion.source !== "user") {
    return { ok: false, error: "只能删除用户自定义标签。" };
  }

  const currentConfig = normalizeConfig(config);
  const nextEntries = (currentConfig.entries ?? []).filter((entry) => entry.id !== suggestion.id);
  if (nextEntries.length === (currentConfig.entries ?? []).length) {
    return { ok: false, error: "找不到对应的自定义标签。" };
  }

  const nextAliases = { ...(currentConfig.aliases ?? {}) };
  for (const [alias, targetId] of Object.entries(nextAliases)) {
    if (targetId === suggestion.id) {
      delete nextAliases[alias];
    }
  }

  const nextMerges = { ...(currentConfig.merges ?? {}) };
  delete nextMerges[suggestion.id];
  for (const [sourceId, targetId] of Object.entries(nextMerges)) {
    if (targetId === suggestion.id) {
      delete nextMerges[sourceId];
    }
  }

  return {
    ok: true,
    config: normalizeConfig({
      ...currentConfig,
      entries: nextEntries,
      aliases: nextAliases,
      merges: nextMerges,
    }),
  };
}

export function updateCustomTagEntry(
  config: UserTagTaxonomyConfig,
  suggestion: TagSuggestion,
  draft: CustomTagEditDraft,
): CustomTagEditResult {
  if (suggestion.source !== "user") {
    return { ok: false, error: "内置标签不能编辑。" };
  }

  const currentConfig = normalizeConfig(config);
  const entryIndex = currentConfig.entries?.findIndex((entry) => entry.id === suggestion.id) ?? -1;
  if (entryIndex < 0 || !currentConfig.entries) {
    return { ok: false, error: "找不到对应的自定义标签。" };
  }

  const currentEntry = currentConfig.entries[entryIndex];
  const nextName = draft.name.trim().replace(/\s+/g, " ");
  if (!nextName) {
    return { ok: false, error: "标签名不能为空。" };
  }
  if (nextName.includes("/")) {
    return { ok: false, error: "标签名不能包含 /。" };
  }

  const parentPath = currentEntry.path.slice(0, -1);
  const nextPath = [...parentPath, nextName];
  const nextPathText = nextPath.join("/");
  const currentPathText = currentEntry.path.join("/");
  const suggestions = getTagSuggestionList(currentConfig, { includeHidden: true, includeDeprecated: true });
  const conflictingPath = suggestions.find((candidate) => candidate.id !== currentEntry.id && candidate.path.join("/") === nextPathText);
  if (conflictingPath) {
    return { ok: false, error: "这个标签路径已经存在。" };
  }

  const nextEntryAliases = parseTagManagerAliasText(draft.aliasesText);
  const nextAliasKeys = new Set(nextEntryAliases.map(getAliasCompareKey));
  const otherAliasOwner = new Map<string, string>();
  for (const candidate of suggestions) {
    if (candidate.id === currentEntry.id) {
      continue;
    }
    for (const alias of candidate.aliases) {
      otherAliasOwner.set(getAliasCompareKey(alias), candidate.id);
    }
  }
  for (const [alias, targetId] of Object.entries(currentConfig.aliases ?? {})) {
    if (targetId !== currentEntry.id) {
      otherAliasOwner.set(getAliasCompareKey(alias), targetId);
    }
  }
  for (const alias of nextEntryAliases) {
    if (otherAliasOwner.has(getAliasCompareKey(alias))) {
      return { ok: false, error: `别名已被其它标签使用：${alias}` };
    }
  }

  const existingAliases = parseTagManagerAliasText([
    ...(currentEntry.aliases ?? []),
    ...Object.entries(currentConfig.aliases ?? {})
      .filter(([, targetId]) => targetId === currentEntry.id)
      .map(([alias]) => alias),
  ].join(", "));
  const existingAliasKeys = existingAliases.map(getAliasCompareKey).sort();
  const nextSortedAliasKeys = Array.from(nextAliasKeys).sort();
  const unchanged =
    currentPathText === nextPathText &&
    existingAliasKeys.length === nextSortedAliasKeys.length &&
    existingAliasKeys.every((key, index) => key === nextSortedAliasKeys[index]);
  if (unchanged) {
    return { ok: false, error: "标签名和 aliases 没有变化。" };
  }

  const nextAliases = { ...(currentConfig.aliases ?? {}) };
  for (const [alias, targetId] of Object.entries(nextAliases)) {
    if (targetId === currentEntry.id) {
      delete nextAliases[alias];
    }
  }

  const nextEntries = [...currentConfig.entries];
  nextEntries[entryIndex] = {
    ...currentEntry,
    path: nextPath,
    aliases: nextEntryAliases,
    source: "user",
  };

  return {
    ok: true,
    config: normalizeConfig({
      ...currentConfig,
      entries: nextEntries,
      aliases: nextAliases,
    }),
    nextPathText,
  };
}

export function isLeafTagSuggestion(suggestion: TagSuggestion | null): suggestion is TagSuggestion {
  return Boolean(suggestion && suggestion.path.length >= 3);
}

function createsMergeCycle(sourceId: string, targetId: string, merges: Record<string, string>): boolean {
  const visited = new Set<string>([sourceId]);
  let current: string | undefined = targetId;

  while (current) {
    if (visited.has(current)) {
      return true;
    }
    visited.add(current);
    current = merges[current];
  }

  return false;
}

export function getMergeTargetCandidates(
  suggestions: TagSuggestion[],
  source: TagSuggestion | null,
  config: UserTagTaxonomyConfig,
  query: string,
): TagSuggestion[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!isLeafTagSuggestion(source) || !normalizedQuery) return [];

  return suggestions
    .filter((candidate) => {
      if (!isLeafTagSuggestion(candidate)) return false;
      if (candidate.id === source.id) return false;
      if (candidate.deprecated) return false;
      if (createsMergeCycle(source.id, candidate.id, config.merges ?? {})) return false;

      const searchText = [
        candidate.id,
        candidate.name,
        candidate.pathText,
        candidate.searchText,
        ...candidate.aliases,
      ].join("\n").toLowerCase();
      return searchText.includes(normalizedQuery);
    })
    .slice(0, 8);
}

export function setMergeRule(
  config: UserTagTaxonomyConfig,
  source: TagSuggestion | null,
  target: TagSuggestion | null,
): MergeRuleUpdateResult {
  if (!isLeafTagSuggestion(source)) {
    return { ok: false, error: "只有具体标签可以设置合并规则。" };
  }
  if (!isLeafTagSuggestion(target)) {
    return { ok: false, error: "只能选择具体标签作为合并目标。" };
  }
  if (source.id === target.id) {
    return { ok: false, error: "不能把标签合并到自己。" };
  }
  if (target.deprecated) {
    return { ok: false, error: "不能选择已合并或已停用标签作为目标。" };
  }

  const currentConfig = normalizeConfig(config);
  const nextMerges = { ...(currentConfig.merges ?? {}) };
  nextMerges[source.id] = target.id;

  if (createsMergeCycle(source.id, target.id, nextMerges)) {
    return { ok: false, error: "这条合并规则会形成循环。" };
  }

  return {
    ok: true,
    config: normalizeConfig({
      ...currentConfig,
      merges: nextMerges,
    }),
  };
}

export function deleteMergeRule(config: UserTagTaxonomyConfig, source: TagSuggestion | null): MergeRuleUpdateResult {
  if (!source) {
    return { ok: false, error: "请先选择标签。" };
  }

  const currentConfig = normalizeConfig(config);
  if (!currentConfig.merges?.[source.id]) {
    return { ok: false, error: "当前标签没有合并规则。" };
  }

  const nextMerges = { ...(currentConfig.merges ?? {}) };
  delete nextMerges[source.id];

  return {
    ok: true,
    config: normalizeConfig({
      ...currentConfig,
      merges: nextMerges,
    }),
  };
}

export function matchesTagManagerFilter(suggestion: TagSuggestion, filterMode: TagManagerFilterMode): boolean {
  if (filterMode === "user") return suggestion.source === "user";
  if (filterMode === "hidden") return suggestion.hidden;
  if (filterMode === "builtin") return suggestion.source === "builtin";
  if (filterMode === "deprecated") return suggestion.deprecated;
  return true;
}

export function filterTagSuggestions(suggestions: TagSuggestion[], filterMode: TagManagerFilterMode): TagSuggestion[] {
  if (filterMode === "all") return suggestions;
  return suggestions.filter((suggestion) => matchesTagManagerFilter(suggestion, filterMode));
}

export function filterTagRootGroups(rootGroups: RootGroup[], filterMode: TagManagerFilterMode): RootGroup[] {
  if (filterMode === "all") return rootGroups;

  return rootGroups
    .map((rootGroup) => ({
      ...rootGroup,
      groups: rootGroup.groups
        .map((group) => ({
          ...group,
          candidates: group.candidates.filter((suggestion) => matchesTagManagerFilter(suggestion, filterMode)),
        }))
        .filter((group) => group.candidates.length > 0),
    }))
    .filter((rootGroup) => rootGroup.groups.length > 0);
}

export function resolveSuggestionReference(reference: string, suggestions: TagSuggestion[]): TagSuggestion | null {
  const text = reference.trim();
  if (!text) return null;

  const byId = suggestions.find((suggestion) => suggestion.id === text);
  if (byId) return byId;

  const key = getAliasCompareKey(text);
  return suggestions.find((suggestion) => {
    if (getAliasCompareKey(suggestion.id) === key) return true;
    if (getAliasCompareKey(suggestion.pathText) === key) return true;
    if (getAliasCompareKey(suggestion.name) === key) return true;
    return suggestion.aliases.some((alias) => getAliasCompareKey(alias) === key);
  }) ?? null;
}

export function getMergePreviewInfo(
  config: UserTagTaxonomyConfig,
  suggestion: TagSuggestion | null,
  suggestions: TagSuggestion[],
): MergePreviewInfo {
  const merges = config.merges ?? {};
  const targetReference = suggestion ? merges[suggestion.id]?.trim() || null : null;
  const targetSuggestion = targetReference ? resolveSuggestionReference(targetReference, suggestions) : null;
  const incomingSuggestions = suggestion
    ? Object.entries(merges)
      .filter(([sourceId, target]) => sourceId !== suggestion.id && resolveSuggestionReference(target, suggestions)?.id === suggestion.id)
      .map(([sourceId]) => suggestions.find((item) => item.id === sourceId))
      .filter((item): item is TagSuggestion => Boolean(item))
      .sort((a, b) => a.pathText.localeCompare(b.pathText, "zh-CN"))
    : [];

  return {
    targetReference,
    targetSuggestion,
    incomingSuggestions,
  };
}

export function getSaveEventBase(operation: SaveOperation): string {
  if (operation === "visibility") return "manager.visibilitySave";
  if (operation === "alias") return "manager.aliasSave";
  if (operation === "merge") return "manager.mergeSave";
  return "manager.sortSave";
}

export function runTagManagerCustomTagEditSelfCheck() {
  const baseConfig: UserTagTaxonomyConfig = {
    entries: [{
      id: "user.manager-edit.selfcheck",
      path: ["算法", "字符串", "旧标签"],
      aliases: ["旧入口"],
      source: "user",
    }],
  };
  const userSuggestion = getTagSuggestionList(baseConfig).find((suggestion) => suggestion.id === "user.manager-edit.selfcheck");
  const builtinSuggestion = getTagSuggestionList().find((suggestion) => suggestion.id === "algorithm.string.z-function");
  const edited = userSuggestion
    ? updateCustomTagEntry(baseConfig, userSuggestion, { name: "新标签", aliasesText: "新入口" })
    : null;
  const conflict = userSuggestion
    ? updateCustomTagEntry(baseConfig, userSuggestion, { name: "Z 函数", aliasesText: "新入口" })
    : null;
  const builtinEdit = builtinSuggestion
    ? updateCustomTagEntry(baseConfig, builtinSuggestion, { name: "不允许", aliasesText: "" })
    : null;

  return {
    editedUserEntryLabelVisible: edited?.ok
      ? getTagSuggestionList(edited.config).find((suggestion) => suggestion.id === "user.manager-edit.selfcheck")?.pathText === "算法/字符串/新标签"
      : false,
    newAliasSearchable: edited?.ok
      ? findTagSuggestionsByQuery("新入口", { limit: 1, userConfig: edited.config })[0]?.id === "user.manager-edit.selfcheck"
      : false,
    removedAliasStopsMatching: edited?.ok
      ? findTagSuggestionsByQuery("旧入口", { limit: 1, userConfig: edited.config }).length === 0
      : false,
    builtinEntryRejected: builtinEdit?.ok === false,
    pathConflictRejected: conflict?.ok === false,
  };
}

export function runTagManagerMergeRuleSelfCheck() {
  const baseConfig: UserTagTaxonomyConfig = {};
  const baseSuggestions = getTagSuggestionList(baseConfig, { includeHidden: true, includeDeprecated: true });
  const source = baseSuggestions.find((suggestion) => suggestion.id === "algorithm.string.kmp") ?? null;
  const target = baseSuggestions.find((suggestion) => suggestion.id === "algorithm.string.z-function") ?? null;
  const added = setMergeRule(baseConfig, source, target);
  const addedSuggestions = added.ok
    ? getTagSuggestionList(added.config, { includeHidden: true, includeDeprecated: true })
    : [];
  const addedSource = addedSuggestions.find((suggestion) => suggestion.id === "algorithm.string.kmp") ?? null;
  const addedTarget = addedSuggestions.find((suggestion) => suggestion.id === "algorithm.string.z-function") ?? null;
  const preview = added.ok ? getMergePreviewInfo(added.config, addedSource, addedSuggestions) : null;
  const selfMerge = setMergeRule(baseConfig, source, source);
  const staleCycle = setMergeRule(
    { merges: { "algorithm.string.z-function": "algorithm.string.kmp" } },
    source,
    target,
  );
  const deleted = added.ok ? deleteMergeRule(added.config, addedSource) : null;
  const hiddenMergeConfig: UserTagTaxonomyConfig = {
    hiddenIds: ["algorithm.string.kmp"],
    merges: {
      "algorithm.string.kmp": "algorithm.string.z-function",
    },
  };
  const hiddenMergedSource = getTagSuggestionList(hiddenMergeConfig, { includeHidden: true, includeDeprecated: true })
    .find((suggestion) => suggestion.id === "algorithm.string.kmp") ?? null;

  return {
    addedMergePreviewShowsTarget: preview?.targetSuggestion?.id === "algorithm.string.z-function",
    mergedSourceMarkedDeprecated: addedSource?.deprecated === true,
    targetRemainsConcreteLeaf: addedTarget?.path.length === 3,
    selfMergeRejected: selfMerge.ok === false,
    cycleRejected: staleCycle.ok === false,
    deletedMergeRestoresPreview: deleted?.ok
      ? getMergePreviewInfo(deleted.config, source, getTagSuggestionList(deleted.config, { includeHidden: true, includeDeprecated: true })).targetReference === null
      : false,
    aliasNormalizeUsesMergeTarget: added.ok
      ? normalizeTagPath("KMP", added.config)?.entryId === "algorithm.string.z-function"
      : false,
    builtinAliasStillWorks: added.ok
      ? normalizeTagPath("exKMP", added.config)?.entryId === "algorithm.string.z-function"
      : false,
    hiddenMergedSourceDoesNotCrash: hiddenMergedSource?.hidden === true && hiddenMergedSource.deprecated === true,
    visibleTargetCandidateSearch: getMergeTargetCandidates(baseSuggestions, source, baseConfig, "Z 函数")[0]?.id === "algorithm.string.z-function",
  };
}
