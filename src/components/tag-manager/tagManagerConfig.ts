import { BUILTIN_TAG_TAXONOMY, findTagSuggestionsByQuery, getTagSuggestionList, getTagSuggestionRootGroups, normalizeTagPath, type TagSuggestion, type TagTaxonomyEntry, type UserTagTaxonomyConfig } from "@/lib/tagTaxonomy";
import type { GroupNode, MergePreviewInfo, RootGroup, SaveOperation, TagManagerFilterMode, TagManagerWorkspaceView } from "./types";

const builtinTagTaxonomyEntryIds = new Set(BUILTIN_TAG_TAXONOMY.map((entry) => entry.id));
const CUSTOM_COLLECTIONS_STORAGE_KEY = "oi-notebook.customCollections";

export type TagTaxonomyConfigImportPreview = {
  entriesCount: number;
  aliasesCount: number;
  hiddenIdsCount: number;
  orderOverridesCount: number;
  mergesCount: number;
  customCollectionsCount: number;
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

export type CustomTagCreateSelectionPlan = {
  activeRoot: string | null;
  expandedGroupOrderKey: string | null;
  filterMode: TagManagerFilterMode;
  selectedGroupOrderKey: string | null;
  selectedSuggestionId: string;
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

export type MergeEditorState = {
  isOpen: boolean;
  searchQuery: string;
  selectedTargetId: string | null;
  error: string | null;
};

export type CustomTagEditorState = {
  createDraft: CustomTagCreateDraft | null;
  createError: string | null;
  editDraft: CustomTagEditDraft | null;
  editError: string | null;
};

export type TagManagerNodeSelectionState = {
  activeRoot: string | null;
  selectedGroupOrderKey: string | null;
  selectedSuggestionId: string | null;
  customTagCreateDraft: CustomTagCreateDraft | null;
  customTagCreateError: string | null;
};

export type CustomTagCreateSelectionState = {
  activeRoot: string | null;
  expandedGroups: Record<string, boolean>;
  filterMode: TagManagerFilterMode;
  selectedGroupOrderKey: string | null;
  selectedSuggestionId: string | null;
  customTagCreateDraft: CustomTagCreateDraft | null;
  customTagCreateError: string | null;
};

export type CustomTagEditSelectionState = {
  selectedSuggestionId: string | null;
  customTagEditDraft: CustomTagEditDraft | null;
  customTagEditError: string | null;
};

export type TagManagerSelectionChangeTransientState = {
  aliasInput: string;
  aliasError: string | null;
  customTagCreateError: string | null;
  customTagEditDraft: CustomTagEditDraft | null;
  customTagEditError: string | null;
  mergeEditor: MergeEditorState;
};

export type UserAliasUpdateResult =
  | {
    ok: true;
    config: UserTagTaxonomyConfig;
    alias: string;
  }
  | {
    ok: false;
    error: string;
  };

export type CollectionCandidateSource = "builtin" | "custom" | "article";

export type CollectionCandidateRow = {
  name: string;
  sources: CollectionCandidateSource[];
  isBuiltin: boolean;
  isCustom: boolean;
  isFromArticle: boolean;
};

export type CustomCollectionUpdateResult =
  | {
    ok: true;
    config: UserTagTaxonomyConfig;
  }
  | {
    ok: false;
    error: string;
  };

export type CollectionEditSavePlan =
  | {
    action: "cancel";
  }
  | {
    action: "rename";
    nextName: string;
  };

export type CollectionEditState = {
  editingName: string | null;
  editInput: string;
  editError: string | null;
  createError: string | null;
};

export type CollectionPanelState = {
  activeView: TagManagerWorkspaceView;
  createInput: string;
  createError: string | null;
  editError: string | null;
};

export function getOpenedMergeEditorState(): MergeEditorState {
  return {
    isOpen: true,
    searchQuery: "",
    selectedTargetId: null,
    error: null,
  };
}

export function getClosedMergeEditorState(_state: MergeEditorState): MergeEditorState {
  return {
    isOpen: false,
    searchQuery: "",
    selectedTargetId: null,
    error: null,
  };
}

export function getSearchedMergeEditorState(state: MergeEditorState, searchQuery: string): MergeEditorState {
  return {
    ...state,
    searchQuery,
    selectedTargetId: null,
    error: null,
  };
}

export function getSelectedMergeTargetState(state: MergeEditorState, selectedTargetId: string): MergeEditorState {
  return {
    ...state,
    selectedTargetId,
    error: null,
  };
}

export function getOpenedCustomTagCreateState(
  state: CustomTagEditorState,
  suggestion: TagSuggestion | null,
  selectedGroupOrderKey: string | null,
  activeRootGroups: GroupNode[],
): CustomTagEditorState {
  return {
    ...state,
    createDraft: getCustomTagCreateDraft(suggestion, selectedGroupOrderKey, activeRootGroups),
    createError: null,
    editDraft: null,
    editError: null,
  };
}

export function getOpenedCustomTagEditState(
  state: CustomTagEditorState,
  config: UserTagTaxonomyConfig,
  suggestion: TagSuggestion | null,
): CustomTagEditorState {
  return {
    ...state,
    createDraft: null,
    createError: null,
    editDraft: suggestion?.source === "user" ? getCustomTagEditDraft(config, suggestion) : state.editDraft,
    editError: null,
  };
}

export function normalizeConfig(config: UserTagTaxonomyConfig | null | undefined): UserTagTaxonomyConfig {
  return {
    version: config?.version ?? 1,
    entries: [...(config?.entries ?? [])],
    aliases: { ...(config?.aliases ?? {}) },
    hiddenIds: [...(config?.hiddenIds ?? [])],
    orderOverrides: { ...(config?.orderOverrides ?? {}) },
    merges: { ...(config?.merges ?? {}) },
    customCollections: normalizeCustomCollections(config?.customCollections),
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

export function normalizeCollectionCandidateValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function getCollectionCandidateKey(value: string): string {
  return normalizeCollectionCandidateValue(value).toLocaleLowerCase("zh-CN");
}

export function normalizeCustomCollections(collections: string[] | undefined): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const rawCollection of collections ?? []) {
    const collection = normalizeCollectionCandidateValue(rawCollection);
    if (!collection || collection === "未归档") {
      continue;
    }
    const key = getCollectionCandidateKey(collection);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(collection);
  }

  return normalized;
}

export function readStoredCustomCollections(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(CUSTOM_COLLECTIONS_STORAGE_KEY);
    if (!rawValue) return [];
    const parsed: unknown = JSON.parse(rawValue);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
      ? normalizeCustomCollections(parsed)
      : [];
  } catch {
    return [];
  }
}

export function writeStoredCustomCollections(collections: string[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(CUSTOM_COLLECTIONS_STORAGE_KEY, JSON.stringify(normalizeCustomCollections(collections)));
}

export function mergeConfigWithStoredCustomCollections(config: UserTagTaxonomyConfig | null | undefined): UserTagTaxonomyConfig {
  return normalizeConfig({
    ...(config ?? {}),
    customCollections: normalizeCustomCollections([
      ...readStoredCustomCollections(),
      ...(config?.customCollections ?? []),
    ]),
  });
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
    customCollectionsCount: config.customCollections?.length ?? 0,
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
    customCollections: normalizeCustomCollections(parseStringArray(parsed.customCollections, "customCollections")),
  };

  return {
    config,
    preview: getTagTaxonomyConfigImportPreview(config),
  };
}

export function getAliasCompareKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
}

function validateCollectionNameInput(value: string): string | null {
  if (!normalizeCollectionCandidateValue(value)) {
    return "文集名称不能为空。";
  }
  if (/[\r\n]/.test(value)) {
    return "文集名称不能包含换行。";
  }
  return null;
}

function collectCollectionCandidateKeys(collections: string[], ignoredName?: string): Set<string> {
  const ignoredKey = ignoredName ? getCollectionCandidateKey(ignoredName) : null;
  const keys = new Set<string>();
  for (const collection of collections) {
    const key = getCollectionCandidateKey(collection);
    if (!key || key === ignoredKey) continue;
    keys.add(key);
  }
  return keys;
}

export function buildCollectionCandidateRows(
  builtinCollections: string[],
  customCollections: string[],
  articleCollections: string[],
): CollectionCandidateRow[] {
  const rows: CollectionCandidateRow[] = [];
  const rowMap = new Map<string, CollectionCandidateRow>();

  const addCollection = (rawCollection: string, source: CollectionCandidateSource) => {
    const collection = normalizeCollectionCandidateValue(rawCollection);
    if (!collection || collection === "未归档") {
      return;
    }

    const key = getCollectionCandidateKey(collection);
    let row = rowMap.get(key);
    if (!row) {
      row = {
        name: collection,
        sources: [],
        isBuiltin: false,
        isCustom: false,
        isFromArticle: false,
      };
      rowMap.set(key, row);
      rows.push(row);
    }

    if (!row.sources.includes(source)) {
      row.sources.push(source);
    }
    if (source === "builtin") row.isBuiltin = true;
    if (source === "custom") row.isCustom = true;
    if (source === "article") row.isFromArticle = true;
  };

  for (const collection of builtinCollections) addCollection(collection, "builtin");
  for (const collection of customCollections) addCollection(collection, "custom");
  for (const collection of articleCollections) addCollection(collection, "article");

  return rows;
}

export function createCustomCollectionCandidate(
  config: UserTagTaxonomyConfig,
  name: string,
  existingCandidates: string[],
): CustomCollectionUpdateResult {
  const validationError = validateCollectionNameInput(name);
  if (validationError) return { ok: false, error: validationError };

  const currentConfig = normalizeConfig(config);
  const nextName = normalizeCollectionCandidateValue(name);
  const existingKeys = collectCollectionCandidateKeys([
    ...(currentConfig.customCollections ?? []),
    ...existingCandidates,
  ]);
  if (existingKeys.has(getCollectionCandidateKey(nextName))) {
    return { ok: false, error: "这个文集已经存在。" };
  }

  return {
    ok: true,
    config: normalizeConfig({
      ...currentConfig,
      customCollections: [...(currentConfig.customCollections ?? []), nextName],
    }),
  };
}

export function renameCustomCollectionCandidate(
  config: UserTagTaxonomyConfig,
  oldName: string,
  nextNameInput: string,
  existingCandidates: string[],
): CustomCollectionUpdateResult {
  const validationError = validateCollectionNameInput(nextNameInput);
  if (validationError) return { ok: false, error: validationError };

  const currentConfig = normalizeConfig(config);
  const oldKey = getCollectionCandidateKey(oldName);
  const customCollections = currentConfig.customCollections ?? [];
  const currentIndex = customCollections.findIndex((collection) => getCollectionCandidateKey(collection) === oldKey);
  if (currentIndex < 0) {
    return { ok: false, error: "只能重命名自定义文集。" };
  }

  const nextName = normalizeCollectionCandidateValue(nextNameInput);
  if (getCollectionCandidateKey(nextName) === oldKey) {
    return { ok: false, error: "文集名称没有变化。" };
  }

  const existingKeys = collectCollectionCandidateKeys([
    ...customCollections,
    ...existingCandidates,
  ], oldName);
  if (existingKeys.has(getCollectionCandidateKey(nextName))) {
    return { ok: false, error: "这个文集已经存在。" };
  }

  const nextCollections = [...customCollections];
  nextCollections[currentIndex] = nextName;

  return {
    ok: true,
    config: normalizeConfig({
      ...currentConfig,
      customCollections: nextCollections,
    }),
  };
}

export function getCollectionEditSavePlan(
  editingCollectionName: string,
  collectionEditInput: string,
): CollectionEditSavePlan {
  const nextName = normalizeCollectionCandidateValue(collectionEditInput);
  if (nextName === editingCollectionName) {
    return { action: "cancel" };
  }
  return {
    action: "rename",
    nextName,
  };
}

export function getOpenedCollectionEditState(
  state: CollectionEditState,
  name: string,
): CollectionEditState {
  return {
    ...state,
    editingName: name,
    editInput: name,
    editError: null,
    createError: null,
  };
}

export function getCancelledCollectionEditState(
  state: CollectionEditState,
): CollectionEditState {
  return {
    ...state,
    editingName: null,
    editInput: "",
    editError: null,
  };
}

export function getChangedCollectionEditInputState(
  state: CollectionEditState,
  editInput: string,
): CollectionEditState {
  return {
    ...state,
    editInput,
    editError: null,
  };
}

export function getAppliedCollectionEditState(
  state: CollectionEditState,
): CollectionEditState {
  return getCancelledCollectionEditState(state);
}

export function getAppliedCollectionDeleteState(
  state: CollectionEditState,
  deletedName: string,
): CollectionEditState {
  return getDeletedCollectionEditState(state, deletedName);
}

export function getDeletedCollectionEditState(
  state: CollectionEditState,
  deletedName: string,
): CollectionEditState {
  if (state.editingName !== deletedName) {
    return state;
  }
  return getCancelledCollectionEditState(state);
}

export function getAppliedCollectionViewState(
  state: CollectionPanelState,
  activeView: TagManagerWorkspaceView,
): CollectionPanelState {
  return {
    ...state,
    activeView,
    createError: null,
    editError: null,
  };
}

export function getAppliedCollectionCreateState(
  state: CollectionPanelState,
): CollectionPanelState {
  return {
    ...state,
    createInput: "",
    createError: null,
  };
}

export function getChangedCollectionCreateInputState(
  state: CollectionPanelState,
  createInput: string,
): CollectionPanelState {
  return {
    ...state,
    createInput,
    createError: null,
  };
}

export function getFailedCollectionCreateState(
  state: CollectionPanelState,
  createError: string,
): CollectionPanelState {
  return {
    ...state,
    createError,
  };
}

export function getFailedCollectionEditState(
  state: CollectionPanelState,
  editError: string,
): CollectionPanelState {
  return {
    ...state,
    editError,
  };
}

export function deleteCustomCollectionCandidate(
  config: UserTagTaxonomyConfig,
  name: string,
): CustomCollectionUpdateResult {
  const currentConfig = normalizeConfig(config);
  const key = getCollectionCandidateKey(name);
  const nextCollections = (currentConfig.customCollections ?? []).filter((collection) => getCollectionCandidateKey(collection) !== key);
  if (nextCollections.length === (currentConfig.customCollections ?? []).length) {
    return { ok: false, error: "只能删除自定义文集。" };
  }

  return {
    ok: true,
    config: normalizeConfig({
      ...currentConfig,
      customCollections: nextCollections,
    }),
  };
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
    .filter(([alias]) => normalizeTagPath(alias, config)?.entryId === suggestion.id)
    .map(([alias]) => alias.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function getBuiltinAliasesForSuggestion(suggestion: TagSuggestion | null, userAliases: string[]): string[] {
  if (!suggestion) return [];
  const userAliasKeys = new Set(userAliases.map(getAliasCompareKey));
  return suggestion.aliases.filter((alias) => !userAliasKeys.has(getAliasCompareKey(alias)));
}

export function addUserAliasToConfig(
  config: UserTagTaxonomyConfig,
  suggestion: TagSuggestion | null,
  aliasInput: string,
  selectedBuiltinAliases: string[],
): UserAliasUpdateResult {
  if (!suggestion || suggestion.path.length < 3) {
    return { ok: false, error: "只有具体标签支持别名管理" };
  }

  const alias = aliasInput.trim();
  const aliasKey = getAliasCompareKey(alias);
  if (!alias) {
    return { ok: false, error: "请输入别名" };
  }
  if (aliasKey === getAliasCompareKey(suggestion.name) || aliasKey === getAliasCompareKey(suggestion.pathText)) {
    return { ok: false, error: "该名称已是当前标签，无需添加" };
  }
  const builtinAliasOwnerId = normalizeTagPath(alias)?.entryId;
  if (builtinAliasOwnerId && builtinAliasOwnerId !== suggestion.id) {
    return { ok: false, error: "该别名已被内置标签使用" };
  }

  const currentConfig = normalizeConfig(config);
  const existingUserAlias = Object.keys(currentConfig.aliases ?? {}).some((existingAlias) => getAliasCompareKey(existingAlias) === aliasKey);
  const existingBuiltinAlias = selectedBuiltinAliases.some((existingAlias) => getAliasCompareKey(existingAlias) === aliasKey);

  if (existingUserAlias || existingBuiltinAlias) {
    return { ok: false, error: "别名已存在" };
  }

  return {
    ok: true,
    alias,
    config: normalizeConfig({
      ...currentConfig,
      aliases: {
        ...(currentConfig.aliases ?? {}),
        [alias]: suggestion.id,
      },
    }),
  };
}

export function deleteUserAliasFromConfig(
  config: UserTagTaxonomyConfig,
  suggestion: TagSuggestion | null,
  alias: string,
): UserAliasUpdateResult {
  if (!suggestion) {
    return { ok: false, error: "请先选择标签" };
  }

  const currentConfig = normalizeConfig(config);
  const nextAliases = { ...(currentConfig.aliases ?? {}) };
  const targetId = nextAliases[alias];

  if (targetId !== suggestion.id && normalizeTagPath(alias, currentConfig)?.entryId !== suggestion.id) {
    return { ok: false, error: "只能删除当前标签的自定义别名" };
  }

  delete nextAliases[alias];
  return {
    ok: true,
    alias,
    config: normalizeConfig({
      ...currentConfig,
      aliases: nextAliases,
    }),
  };
}

export function setTagSuggestionHiddenInConfig(
  config: UserTagTaxonomyConfig,
  suggestion: TagSuggestion,
  hidden: boolean,
): UserTagTaxonomyConfig {
  const currentConfig = normalizeConfig(config);
  const hiddenIds = new Set(currentConfig.hiddenIds ?? []);
  if (hidden) {
    hiddenIds.add(suggestion.id);
  } else {
    hiddenIds.delete(suggestion.id);
  }

  return normalizeConfig({
    ...currentConfig,
    hiddenIds: Array.from(hiddenIds),
  });
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

export function getClearedCustomTagCreateDraftSelection(
  draft: CustomTagCreateDraft | null,
): CustomTagCreateDraft | null {
  return draft
    ? {
      ...draft,
      parentPathText: "",
      parentLocked: false,
    }
    : draft;
}

export function getGroupedCustomTagCreateDraftSelection(
  draft: CustomTagCreateDraft | null,
  group: GroupNode | null,
): CustomTagCreateDraft | null {
  return draft && group
    ? {
      ...draft,
      parentPathText: group.path.join(" / "),
      parentLocked: true,
    }
    : draft;
}

export function getSuggestionCustomTagCreateDraftSelection(
  draft: CustomTagCreateDraft | null,
  suggestion: TagSuggestion | null,
): CustomTagCreateDraft | null {
  return draft && suggestion && suggestion.path.length >= 3
    ? {
      ...draft,
      parentPathText: suggestion.path.slice(0, -1).join(" / "),
      parentLocked: true,
    }
    : draft;
}

export function getSelectedRootState(
  state: TagManagerNodeSelectionState,
  root: string,
): TagManagerNodeSelectionState {
  return {
    ...getClearedNodeSelectionState(state),
    activeRoot: root,
  };
}

export function getClearedNodeSelectionState(
  state: TagManagerNodeSelectionState,
): TagManagerNodeSelectionState {
  return {
    ...state,
    selectedGroupOrderKey: null,
    selectedSuggestionId: null,
    customTagCreateDraft: getClearedCustomTagCreateDraftSelection(state.customTagCreateDraft),
    customTagCreateError: null,
  };
}

export function getSelectedGroupState(
  state: TagManagerNodeSelectionState,
  groupKey: string,
  activeRootGroups: GroupNode[],
): TagManagerNodeSelectionState {
  const group = activeRootGroups.find((item) => item.orderKey === groupKey) ?? null;
  return {
    ...state,
    selectedGroupOrderKey: groupKey,
    selectedSuggestionId: null,
    customTagCreateDraft: getGroupedCustomTagCreateDraftSelection(state.customTagCreateDraft, group),
    customTagCreateError: null,
  };
}

export function getSelectedSuggestionState(
  state: TagManagerNodeSelectionState,
  suggestionId: string,
  suggestions: TagSuggestion[],
): TagManagerNodeSelectionState {
  const suggestion = suggestions.find((item) => item.id === suggestionId) ?? null;
  return {
    ...state,
    selectedGroupOrderKey: null,
    selectedSuggestionId: suggestionId,
    customTagCreateDraft: getSuggestionCustomTagCreateDraftSelection(state.customTagCreateDraft, suggestion),
    customTagCreateError: null,
  };
}

export function getAppliedCustomTagCreateSelectionState(
  state: CustomTagCreateSelectionState,
  plan: CustomTagCreateSelectionPlan,
): CustomTagCreateSelectionState {
  return {
    ...state,
    activeRoot: plan.activeRoot,
    expandedGroups: plan.expandedGroupOrderKey
      ? { ...state.expandedGroups, [plan.expandedGroupOrderKey]: true }
      : state.expandedGroups,
    filterMode: plan.filterMode,
    selectedGroupOrderKey: plan.selectedGroupOrderKey,
    selectedSuggestionId: plan.selectedSuggestionId,
    customTagCreateDraft: null,
    customTagCreateError: null,
  };
}

export function getAppliedCustomTagEditSelectionState(
  state: CustomTagEditSelectionState,
  selectedSuggestionId: string | null,
): CustomTagEditSelectionState {
  return {
    ...state,
    selectedSuggestionId,
    customTagEditDraft: null,
    customTagEditError: null,
  };
}

export function getSelectionChangeTransientState(
  state: TagManagerSelectionChangeTransientState,
): TagManagerSelectionChangeTransientState {
  return {
    ...state,
    aliasInput: "",
    aliasError: null,
    customTagCreateError: null,
    customTagEditDraft: null,
    customTagEditError: null,
    mergeEditor: getClosedMergeEditorState(state.mergeEditor),
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

export function createCustomTagCreateSelectionPlan(
  config: UserTagTaxonomyConfig,
  entryId: string,
): CustomTagCreateSelectionPlan {
  const rootGroups = getTagSuggestionRootGroups(config, { includeHidden: true, includeDeprecated: true });
  const rootGroup = rootGroups.find((candidateRootGroup) => (
    candidateRootGroup.groups.some((group) => group.candidates.some((candidate) => candidate.id === entryId))
  )) ?? null;
  const group = rootGroup?.groups.find((candidateGroup) => (
    candidateGroup.candidates.some((candidate) => candidate.id === entryId)
  )) ?? null;

  return {
    activeRoot: rootGroup?.root ?? null,
    expandedGroupOrderKey: group?.orderKey ?? null,
    filterMode: "all",
    selectedGroupOrderKey: null,
    selectedSuggestionId: entryId,
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
  if (operation === "collection") return "manager.collectionSave";
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
  const userAliasToMergedSourceConfig: UserTagTaxonomyConfig = {
    aliases: {
      "旧 KMP 入口": "algorithm.string.kmp",
    },
    merges: {
      "algorithm.string.kmp": "algorithm.string.z-function",
    },
  };
  const userAliasMergedSuggestions = getTagSuggestionList(userAliasToMergedSourceConfig, { includeHidden: true, includeDeprecated: true });
  const userAliasMergedSource = userAliasMergedSuggestions.find((suggestion) => suggestion.id === "algorithm.string.kmp") ?? null;
  const userAliasMergedTarget = userAliasMergedSuggestions.find((suggestion) => suggestion.id === "algorithm.string.z-function") ?? null;

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
    userAliasToMergedSourceBelongsToTarget:
      getUserAliasesForSuggestion(userAliasToMergedSourceConfig, userAliasMergedTarget).includes("旧 KMP 入口")
      && !getUserAliasesForSuggestion(userAliasToMergedSourceConfig, userAliasMergedSource).includes("旧 KMP 入口"),
    hiddenMergedSourceDoesNotCrash: hiddenMergedSource?.hidden === true && hiddenMergedSource.deprecated === true,
    visibleTargetCandidateSearch: getMergeTargetCandidates(baseSuggestions, source, baseConfig, "Z 函数")[0]?.id === "algorithm.string.z-function",
  };
}
