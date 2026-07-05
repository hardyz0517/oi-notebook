import { splitLoadedMarkdown } from "./markdownDocument";
import type { ParsedFrontmatter } from "./frontmatter";

export interface LuoguArticleMetadata {
  lid: string | null;
  title: string;
  category: number;
  status: number;
  top: number;
  solutionFor: string;
}

export interface LuoguArticleSyncState {
  canSync: boolean;
  canPull: boolean;
  hasBinding: boolean;
  hasCookie: boolean;
}

export const DEFAULT_LUOGU_ARTICLE_CATEGORY = 1;
export const DEFAULT_LUOGU_ARTICLE_STATUS = 2;
export const LUOGU_ARTICLE_SOLUTION_CATEGORY = 2;

export const LUOGU_ARTICLE_CATEGORY_OPTIONS = [
  { value: 1, label: "个人记录" },
  { value: 2, label: "题解" },
  { value: 3, label: "科技·工程" },
  { value: 4, label: "算法·理论" },
  { value: 5, label: "生活·游记" },
  { value: 6, label: "学习·文化课" },
  { value: 7, label: "休闲·娱乐" },
  { value: 8, label: "闲话" },
] as const;

export function isLuoguArticleSolutionCategory(category: number): boolean {
  return category === LUOGU_ARTICLE_SOLUTION_CATEGORY;
}

export function normalizeLuoguArticleSolutionFor(category: number, solutionFor: string): string {
  if (!isLuoguArticleSolutionCategory(category)) return "";
  const trimmed = solutionFor.trim();
  if (/^\d+$/.test(trimmed)) return `P${trimmed}`;
  if (/^p\d+$/i.test(trimmed)) return `P${trimmed.slice(1)}`;
  return trimmed;
}

export function normalizeLuoguArticleMetadata(metadata: LuoguArticleMetadata): LuoguArticleMetadata {
  const category = metadata.category || DEFAULT_LUOGU_ARTICLE_CATEGORY;
  return {
    ...metadata,
    category,
    status: metadata.status || DEFAULT_LUOGU_ARTICLE_STATUS,
    solutionFor: normalizeLuoguArticleSolutionFor(category, metadata.solutionFor),
  };
}

export function getLuoguArticleBody(markdown: string): string {
  return splitLoadedMarkdown(markdown).body;
}

export function getLuoguArticleSyncState(
  parsed: ParsedFrontmatter,
  hasCookie: boolean,
): LuoguArticleSyncState {
  const hasBinding = parsed.fields.luogu_article_id.trim().length > 0;
  const canSync = hasCookie && parsed.canMerge;
  return {
    canSync,
    canPull: canSync && hasBinding,
    hasBinding,
    hasCookie,
  };
}

export function readLuoguArticleMetadata(parsed: ParsedFrontmatter): LuoguArticleMetadata {
  return normalizeLuoguArticleMetadata({
    lid: parsed.fields.luogu_article_id.trim() || null,
    title: parsed.fields.luogu_article_title.trim() || parsed.fields.title.trim(),
    category: Number.parseInt(parsed.fields.luogu_article_category, 10) || DEFAULT_LUOGU_ARTICLE_CATEGORY,
    status: Number.parseInt(parsed.fields.luogu_article_status, 10) || DEFAULT_LUOGU_ARTICLE_STATUS,
    top: Number.parseInt(parsed.fields.luogu_article_top, 10) || 2,
    solutionFor: parsed.fields.luogu_article_solution_for.trim(),
  });
}

export function writeLuoguArticleMetadata(
  parsed: ParsedFrontmatter,
  metadata: LuoguArticleMetadata & { syncedAt: string },
): ParsedFrontmatter["fields"] {
  const normalized = normalizeLuoguArticleMetadata(metadata);
  return {
    ...parsed.fields,
    luogu_article_id: normalized.lid ?? "",
    luogu_article_title: normalized.title,
    luogu_article_category: String(normalized.category),
    luogu_article_status: String(normalized.status),
    luogu_article_top: String(normalized.top),
    luogu_article_solution_for: normalized.solutionFor,
    luogu_article_synced_at: metadata.syncedAt,
  };
}
