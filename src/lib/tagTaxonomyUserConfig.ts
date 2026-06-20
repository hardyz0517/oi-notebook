import { normalizeCustomCollections } from "@/components/tag-manager/tagManagerConfig";
import { normalizeTagValue } from "@/lib/collectionTags";
import {
  getTagSuggestionList,
  normalizeTagPath,
  type TagTaxonomyEntry,
  type UserTagTaxonomyConfig,
} from "@/lib/tagTaxonomy";

export function normalizeUserTagTaxonomyConfig(config?: UserTagTaxonomyConfig | null): UserTagTaxonomyConfig {
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

export interface TagTaxonomyConfigExportPayload {
  json: string;
  fileName: string;
}

export function buildTagTaxonomyConfigExport(
  config?: UserTagTaxonomyConfig | null,
  exportedAt = new Date(),
): TagTaxonomyConfigExportPayload {
  const exportConfig = normalizeUserTagTaxonomyConfig(config);
  return {
    json: `${JSON.stringify(exportConfig, null, 2)}\n`,
    fileName: `oi-notebook-tag-taxonomy-${exportedAt.toISOString().slice(0, 10)}.json`,
  };
}

export function parseTagPathInput(value: string): string[] {
  return value
    .split("/")
    .map((segment) => normalizeTagValue(segment))
    .filter(Boolean);
}

export function parseAliasListInput(value: string): string[] {
  const aliases: string[] = [];
  const seen = new Set<string>();
  for (const rawAlias of value.split(/[,，]/)) {
    const alias = normalizeTagValue(rawAlias);
    const key = alias.toLocaleLowerCase();
    if (!alias || seen.has(key)) continue;
    seen.add(key);
    aliases.push(alias);
  }
  return aliases;
}

function getStableTagPathHash(pathText: string): string {
  let hash = 2166136261;
  for (let index = 0; index < pathText.length; index += 1) {
    hash ^= pathText.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function slugifyUserTagIdSegment(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createUserTagEntryId(path: string[], existingEntries: TagTaxonomyEntry[]): string {
  const pathText = path.join("/");
  const pathSlug = path.map(slugifyUserTagIdSegment).filter(Boolean).join(".");
  const baseId = `user.${pathSlug || "tag"}.${getStableTagPathHash(pathText)}`;
  const existingIds = new Set(existingEntries.map((entry) => entry.id));
  if (!existingIds.has(baseId)) return baseId;

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${baseId}.${index}`;
    if (!existingIds.has(candidate)) return candidate;
  }

  return `${baseId}.${existingIds.size + 1}`;
}

export function resolveTagTaxonomyAliasTarget(
  targetInput: string,
  userConfig?: UserTagTaxonomyConfig | null,
): string | null {
  const target = normalizeTagValue(targetInput);
  if (!target) return null;

  const normalizedTargetPath = target.split("/").map(normalizeTagValue).filter(Boolean).join("/");
  const normalizedReadablePath = target.split("/").map(normalizeTagValue).filter(Boolean).join(" / ");
  const suggestion = getTagSuggestionList(userConfig).find((candidate) => (
    candidate.id === target ||
    candidate.pathText === normalizedTargetPath ||
    formatTagSuggestionPath(candidate.pathText) === normalizedReadablePath ||
    candidate.path.join("/") === normalizedTargetPath
  ));
  if (suggestion) return suggestion.id;

  if (/^[a-z0-9._:-]+$/i.test(target)) return target;
  return null;
}

function getTagIdentityKey(tag: string, userConfig?: UserTagTaxonomyConfig | null): string {
  const normalized = normalizeTagPath(tag, userConfig);
  if (normalized?.entryId) {
    return `entry:${normalized.entryId}`;
  }
  if (normalized?.fullPath) {
    return `path:${normalized.fullPath.toLocaleLowerCase()}`;
  }
  return `text:${normalizeTagValue(tag).toLocaleLowerCase()}`;
}

export function mergeTagsStable(
  existingTags: string[],
  suggestedTags: string[],
  userConfig?: UserTagTaxonomyConfig | null,
): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const tag of [...existingTags, ...suggestedTags]) {
    const normalized = normalizeTagValue(tag);
    const identityKey = getTagIdentityKey(normalized, userConfig);
    if (!normalized || seen.has(identityKey)) continue;
    seen.add(identityKey);
    merged.push(normalized);
  }

  return merged;
}

export function formatTagSuggestionPath(pathText: string): string {
  return pathText.split("/").join(" / ");
}
