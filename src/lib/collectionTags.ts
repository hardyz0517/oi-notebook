import type { FrontmatterFields } from "@/lib/frontmatter";

export const COMMON_COLLECTIONS = ["题解", "技巧", "复盘", "杂谈", "集训日志"];
export const COMMON_NOTE_TAGS = ["题解", "技巧", "复盘", "模板", "总结", "调试", "草稿"];

export function normalizeTagValue(tag: string): string {
  return tag.trim().replace(/\s+/g, " ");
}

export function isCollectionTag(tag: string): boolean {
  const normalized = normalizeTagValue(tag).toLocaleLowerCase();
  return normalized.startsWith("文集:") || normalized.startsWith("collection:");
}

export function getCollectionFromTag(tag: string): string | null {
  const normalized = normalizeTagValue(tag);
  const lower = normalized.toLocaleLowerCase();
  if (normalized.startsWith("文集:")) return normalizeTagValue(normalized.slice("文集:".length)) || null;
  if (lower.startsWith("collection:")) return normalizeTagValue(normalized.slice("collection:".length)) || null;
  return null;
}

export function getDisplayTags(tags: string[]): string[] {
  return tags.filter((tag) => !isCollectionTag(tag));
}

export function normalizeCollectionValues(collections: string[]): string[] {
  const normalizedCollections: string[] = [];
  const seen = new Set<string>();

  for (const rawCollection of collections) {
    const collection = normalizeTagValue(rawCollection);
    if (!collection || collection === "未归档") continue;
    const key = collection.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalizedCollections.push(collection);
  }

  return normalizedCollections;
}

export function getEffectiveCollections(fields: FrontmatterFields): string[] {
  const collections = [...fields.collection];

  const legacyCategory = normalizeTagValue(fields.category);
  if (legacyCategory) collections.push(legacyCategory);
  for (const tag of fields.tags) {
    const collection = getCollectionFromTag(tag);
    if (collection) collections.push(collection);
  }

  return normalizeCollectionValues(collections);
}

export function buildCollectionCandidates(
  fields: FrontmatterFields,
  customCandidates: string[] = [],
  extraCandidates: string[] = [],
): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  const addCandidate = (rawCandidate: string | null | undefined) => {
    const candidate = normalizeTagValue(rawCandidate ?? "");
    if (!candidate || candidate === "未归档") return;
    const key = candidate.toLocaleLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  for (const collection of COMMON_COLLECTIONS) addCandidate(collection);
  for (const collection of customCandidates) addCandidate(collection);
  for (const collection of fields.collection) addCandidate(collection);
  addCandidate(fields.category);
  for (const tag of fields.tags) addCandidate(getCollectionFromTag(tag));
  for (const collection of extraCandidates) addCandidate(collection);

  return candidates;
}
