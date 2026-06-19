import type { NoteSearchResult } from "@/lib/api";
import type { NoteFileInfo } from "@/types/note";

export interface SearchResultItem {
  path: string;
  title: string;
  category: string;
  modified: string;
  tags: string[];
  summary: string;
  excerpt: string;
  score: number;
  source: "backend" | "local";
}

export function formatSearchDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}

function normalizeSearchText(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, "");
}

function splitSearchTokens(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .map(normalizeSearchText)
    .filter(Boolean);
}

function scoreSubsequence(needle: string, haystack: string): number {
  if (!needle || !haystack) return 0;

  let needleIndex = 0;
  let firstMatch = -1;
  let lastMatch = -1;

  for (let haystackIndex = 0; haystackIndex < haystack.length && needleIndex < needle.length; haystackIndex += 1) {
    if (haystack[haystackIndex] !== needle[needleIndex]) continue;

    if (firstMatch === -1) firstMatch = haystackIndex;
    lastMatch = haystackIndex;
    needleIndex += 1;
  }

  if (needleIndex !== needle.length) return 0;

  const span = Math.max(lastMatch - firstMatch + 1, needle.length);
  const compactness = needle.length / span;
  const earlyBonus = firstMatch === 0 ? 0.18 : 0;
  return 0.45 + compactness * 0.35 + earlyBonus;
}

function scoreSearchField(token: string, value: string, weight: number): number {
  const normalizedValue = normalizeSearchText(value);
  if (!token || !normalizedValue) return 0;

  const index = normalizedValue.indexOf(token);
  if (index >= 0) {
    const earlyBonus = index === 0 ? 0.25 : 0;
    const coverageBonus = Math.min(token.length / normalizedValue.length, 0.35);
    return weight * (1.15 + earlyBonus + coverageBonus);
  }

  return weight * scoreSubsequence(token, normalizedValue);
}

export function toSearchResultItem(result: NoteSearchResult): SearchResultItem {
  return {
    path: result.path,
    title: result.title || result.path.split("/").pop()?.replace(/\.md$/i, "") || result.path,
    category: getDashboardNoteCategory(result.path),
    modified: result.date,
    tags: result.tags,
    summary: result.summary,
    excerpt: result.excerpt,
    score: 0,
    source: "backend",
  };
}

export function buildLocalSearchResults(files: NoteFileInfo[], query: string): SearchResultItem[] {
  const tokens = splitSearchTokens(query);
  const sortedByModified = [...files].sort(
    (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime(),
  );

  if (tokens.length === 0) {
    return sortedByModified.slice(0, 30).map((file) => ({
      path: file.path,
      title: file.name.replace(/\.md$/i, ""),
      category: getDashboardNoteCategory(file.path),
      modified: file.modified,
      tags: [],
      summary: "",
      excerpt: "",
      score: 0,
      source: "local",
    }));
  }

  return sortedByModified
    .map((file): SearchResultItem | null => {
      const title = file.name.replace(/\.md$/i, "");
      const category = getDashboardNoteCategory(file.path);
      const fields = [
        { value: title, weight: 120 },
        { value: file.name, weight: 95 },
        { value: category, weight: 70 },
        { value: file.path, weight: 55 },
      ];

      let score = 0;
      for (const token of tokens) {
        const tokenScore = Math.max(...fields.map((field) => scoreSearchField(token, field.value, field.weight)));
        if (tokenScore <= 0) return null;
        score += tokenScore;
      }

      return {
        path: file.path,
        title,
        category,
        modified: file.modified,
        tags: [],
        summary: "",
        excerpt: "",
        score,
        source: "local",
      } satisfies SearchResultItem;
    })
    .filter((result): result is SearchResultItem => result !== null)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.modified).getTime() - new Date(a.modified).getTime();
    })
    .slice(0, 50);
}

function getDashboardNoteCategory(path: string): string {
  const [topLevel] = path.split("/");
  if (!topLevel || topLevel === path) return "notes";

  switch (topLevel) {
    case "tricks":
      return "tricks";
    case "problems":
      return "problems";
    case "luogu":
      return "luogu";
    case "inbox":
      return "inbox";
    default:
      return topLevel;
  }
}
