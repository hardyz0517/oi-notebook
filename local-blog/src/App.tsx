import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { extractMarkdownHeadings, MarkdownRenderer, type MarkdownHeading } from "./MarkdownRenderer";
import {
  buildTagTree,
  findTagTreeNode,
  flattenTagTree,
  getArticleTagSearchTerms,
  getTagSuggestionList,
  getTagPathSegments,
  matchArticleByTagPath,
  tagPathSeparator,
  type TagTreeNode,
} from "./tagTaxonomy";

type NoteSummary = {
  title: string;
  relativePath: string;
  summary: string | null;
  excerpt: string | null;
  tags: string[];
  category: string;
  collection: string;
  collections: string[];
  articleClass?: string;
  created: string | null;
  updated: string | null;
  date: string | null;
  sortKey: string | null;
  draft: boolean;
};

type NoteMetadata = {
  title?: string | null;
  summary?: string | null;
  tags?: unknown;
  category?: string | null;
  collection?: unknown;
  created?: string | null;
  updated?: string | null;
  draft?: boolean;
};

type ParsedFrontmatter = {
  title?: string;
  summary?: string;
  tags?: string[];
  collection?: string[];
  category?: string;
  type?: string;
  kind?: string;
  source?: string;
  created?: string;
  updated?: string;
  date?: string;
  draft?: boolean;
};

type NoteDetail = {
  relativePath: string;
  category: string;
  collection: string;
  collections: string[];
  title: string;
  tags: string[];
  created: string | null;
  updated: string | null;
  date: string | null;
  draft: boolean;
  summary: string | null;
  metadata: NoteMetadata;
  body: string;
};

type RawNoteSummary = Omit<NoteSummary, "tags" | "collection" | "collections"> & {
  tags?: unknown;
  collection?: unknown;
  collections?: unknown;
  metadata?: NoteMetadata | null;
};

type RawNoteDetail = Omit<NoteDetail, "tags" | "collection" | "collections" | "metadata"> & {
  tags?: unknown;
  collection?: unknown;
  collections?: unknown;
  metadata?: NoteMetadata | null;
};

type NotesResponse = {
  notes: RawNoteSummary[];
};

type Route =
  | { name: "home"; page: number }
  | { name: "articles"; page: number; year: string | null }
  | { name: "tags"; page: number }
  | { name: "tag"; tag: string; page: number }
  | { name: "collections"; page: number }
  | { name: "collection"; collection: string; page: number }
  | { name: "search"; query: string; page: number }
  | { name: "note"; encodedPath: string; relativePath: string };

type ReturnTarget = {
  href: string;
  label: string;
};

type CountItem = {
  name: string;
  count: number;
};

type CollectionGroup = {
  name: string;
  posts: NoteSummary[];
  count: number;
  latestUpdatedAt?: string;
};

type TagChipItem = {
  label: string;
  fullPath: string;
  count: number;
};

const tagSuggestionSearchByPath = new Map(
  getTagSuggestionList().map((item) => [item.pathText, item.searchText]),
);

const categoryLabels: Record<string, string> = {
  tricks: "\u6280\u5de7",
  problems: "\u9898\u89e3",
  luogu: "\u6d1b\u8c37",
  inbox: "\u6536\u4ef6\u7bb1",
  uncategorized: "\u672a\u5206\u7c7b",
};

const unfiledCollectionName = "\u672a\u5f52\u6863";

const collectionDescriptions: Record<string, string> = {
  "\u9898\u89e3": "\u505a\u9898\u601d\u8def\u3001\u5b9e\u73b0\u5751\u70b9\u4e0e\u4ee3\u7801\u590d\u76d8\u3002",
  "\u6280\u5de7": "\u53ef\u590d\u7528\u7684\u7b97\u6cd5\u6280\u5de7\u3001\u6a21\u578b\u548c\u5957\u8def\u6574\u7406\u3002",
  "\u590d\u76d8": "\u8bad\u7ec3\u3001\u6bd4\u8d5b\u4e0e\u9636\u6bb5\u6027\u603b\u7ed3\u3002",
  "\u6742\u8c08": "\u548c\u5b66\u4e60\u3001\u5de5\u5177\u3001\u751f\u6d3b\u6709\u5173\u7684\u968f\u7b14\u3002",
};

const articleClassWords = ["\u9898\u89e3", "\u590d\u76d8", "\u5fc3\u5f97", "\u6280\u5de7", "\u6a21\u677f", "\u6742\u8c08"] as const;
const summaryFallback = "\u8fd9\u7bc7\u7b14\u8bb0\u8fd8\u6ca1\u6709\u6458\u8981\uff0c\u6253\u5f00\u6587\u7ae0\u9875\u53ef\u4ee5\u7ee7\u7eed\u9605\u8bfb\u5168\u6587\u3002";
const homePageSize = 9;
const archivePageSize = 40;
const resultPageSize = 12;

const frontmatterKeys = new Set([
  "title",
  "summary",
  "tags",
  "collection",
  "category",
  "type",
  "kind",
  "source",
  "created",
  "updated",
  "date",
  "draft",
]);

function getHashPath(hash: string) {
  const queryStart = hash.indexOf("?");
  return queryStart === -1 ? hash : hash.slice(0, queryStart);
}

function getHashParams(hash: string) {
  const queryStart = hash.indexOf("?");
  return new URLSearchParams(queryStart === -1 ? "" : hash.slice(queryStart + 1));
}

function parseRoutePage(hash: string) {
  const page = Number(getHashParams(hash).get("page") ?? "1");
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function withPageParam(hashPath: string, page = 1, extraParams?: Record<string, string>) {
  const params = new URLSearchParams(extraParams);
  if (page > 1) {
    params.set("page", String(page));
  }
  const query = params.toString();
  return query ? `${hashPath}?${query}` : hashPath;
}

function getRouteFromHash(): Route {
  const hash = window.location.hash || "#/";
  const hashPath = getHashPath(hash);
  const page = parseRoutePage(hash);
  const notePrefix = "#/note/";
  const tagsPrefix = "#/tags/";
  const tagPrefix = "#/tag/";
  const collectionsPrefix = "#/collections/";
  const collectionPrefix = "#/collection/";
  const categoriesPrefix = "#/categories/";
  const categoryPrefix = "#/category/";
  const searchPrefix = "#/search";

  if (hashPath.startsWith(notePrefix)) {
    const encodedPath = hashPath.slice(notePrefix.length);
    if (!encodedPath) {
      return { name: "home", page: 1 };
    }

    try {
      return {
        name: "note",
        encodedPath,
        relativePath: decodeURIComponent(encodedPath),
      };
    } catch {
      return {
        name: "note",
        encodedPath,
        relativePath: "",
      };
    }
  }

  if (hashPath === "#/articles") {
    return { name: "articles", page, year: getHashParams(hash).get("year") };
  }

  if (hashPath === "#/tags") {
    return { name: "tags", page };
  }

  if (hashPath.startsWith(tagsPrefix)) {
    try {
      return { name: "tag", tag: decodeURIComponent(hashPath.slice(tagsPrefix.length)), page };
    } catch {
      return { name: "tags", page: 1 };
    }
  }

  if (hashPath.startsWith(tagPrefix)) {
    try {
      return { name: "tag", tag: decodeURIComponent(hashPath.slice(tagPrefix.length)), page };
    } catch {
      return { name: "tags", page: 1 };
    }
  }

  if (hashPath === "#/collections" || hashPath === "#/categories") {
    return { name: "collections", page };
  }

  if (hashPath.startsWith(collectionsPrefix)) {
    try {
      return { name: "collection", collection: decodeURIComponent(hashPath.slice(collectionsPrefix.length)), page };
    } catch {
      return { name: "collections", page: 1 };
    }
  }

  if (hashPath.startsWith(collectionPrefix)) {
    try {
      return { name: "collection", collection: decodeURIComponent(hashPath.slice(collectionPrefix.length)), page };
    } catch {
      return { name: "collections", page: 1 };
    }
  }

  if (hashPath.startsWith(categoriesPrefix)) {
    try {
      return { name: "collection", collection: decodeURIComponent(hashPath.slice(categoriesPrefix.length)), page };
    } catch {
      return { name: "collections", page: 1 };
    }
  }

  if (hashPath.startsWith(categoryPrefix)) {
    try {
      return {
        name: "collection",
        collection: decodeURIComponent(hashPath.slice(categoryPrefix.length)),
        page,
      };
    } catch {
      return { name: "collections", page: 1 };
    }
  }

  if (hashPath === searchPrefix) {
    const params = getHashParams(hash);
    return { name: "search", query: params.get("q")?.trim() ?? "", page };
  }

  return { name: "home", page };
}

function stripHashPrefix(hashHref: string) {
  return hashHref.startsWith("#") ? hashHref.slice(1) : hashHref;
}

function getNoteHref(relativePath: string, fromHref?: string) {
  const noteHref = `#/note/${encodeURIComponent(relativePath)}`;
  if (!fromHref) {
    return noteHref;
  }

  const params = new URLSearchParams({ from: stripHashPrefix(fromHref) });
  return `${noteHref}?${params.toString()}`;
}

function getHomeHref(page = 1) {
  return withPageParam("#/", page);
}

function getArticlesHref(page = 1, year?: string | null) {
  return withPageParam("#/articles", page, year ? { year } : undefined);
}

function getTagHref(tag: string, page = 1) {
  return withPageParam(`#/tags/${encodeURIComponent(tag)}`, page);
}

function getCollectionHref(collection: string, page = 1) {
  return withPageParam(`#/collections/${encodeURIComponent(collection)}`, page);
}

function getSearchHref(query: string, page = 1) {
  const trimmed = query.trim();
  return withPageParam("#/search", page, trimmed ? { q: trimmed } : undefined);
}

function getRouteReturnHref(route: Exclude<Route, { name: "note"; encodedPath: string; relativePath: string }>) {
  if (route.name === "home") return getHomeHref(route.page);
  if (route.name === "articles") return getArticlesHref(route.page, route.year);
  if (route.name === "tags") return withPageParam("#/tags", route.page);
  if (route.name === "tag") return getTagHref(route.tag, route.page);
  if (route.name === "collections") return withPageParam("#/collections", route.page);
  if (route.name === "collection") return getCollectionHref(route.collection, route.page);
  if (route.name === "search") return getSearchHref(route.query, route.page);
  return "#/articles";
}

function isSafeReturnPath(path: string) {
  if (!path.startsWith("/") || path.startsWith("//") || /[\u0000-\u001f\u007f]/.test(path)) {
    return false;
  }

  const hashPath = getHashPath(`#${path}`);
  return (
    hashPath === "#/" ||
    hashPath === "#/articles" ||
    hashPath === "#/tags" ||
    hashPath.startsWith("#/tags/") ||
    hashPath.startsWith("#/tag/") ||
    hashPath === "#/collections" ||
    hashPath.startsWith("#/collections/") ||
    hashPath.startsWith("#/collection/") ||
    hashPath === "#/categories" ||
    hashPath.startsWith("#/categories/") ||
    hashPath.startsWith("#/category/") ||
    hashPath === "#/search"
  );
}

function getReturnLabel(path: string) {
  const hashPath = getHashPath(`#${path}`);
  if (hashPath === "#/") return "\u8fd4\u56de\u9996\u9875";
  if (hashPath === "#/tags" || hashPath.startsWith("#/tags/") || hashPath.startsWith("#/tag/")) return "\u8fd4\u56de\u6807\u7b7e";
  if (
    hashPath === "#/collections" ||
    hashPath.startsWith("#/collections/") ||
    hashPath.startsWith("#/collection/") ||
    hashPath === "#/categories" ||
    hashPath.startsWith("#/categories/") ||
    hashPath.startsWith("#/category/")
  ) return "\u8fd4\u56de\u6587\u96c6";
  if (hashPath === "#/search") return "\u8fd4\u56de\u641c\u7d22";
  return "\u8fd4\u56de\u6587\u7ae0\u5217\u8868";
}

function getNoteReturnTarget(): ReturnTarget {
  const from = getHashParams(window.location.hash).get("from");
  if (from && isSafeReturnPath(from)) {
    return {
      href: `#${from}`,
      label: getReturnLabel(from),
    };
  }

  return {
    href: "#/articles",
    label: "\u8fd4\u56de\u6587\u7ae0\u5217\u8868",
  };
}

function getCategoryLabel(category: string) {
  return categoryLabels[category] ?? category;
}

function isDebugTagsEnabled() {
  const params = getHashParams(window.location.hash);
  const searchParams = new URLSearchParams(window.location.search);
  const viteEnv = (import.meta as unknown as { env?: { DEV?: boolean } }).env;
  return (
    viteEnv?.DEV === true ||
    params.get("debugTags") === "1" ||
    searchParams.get("debugTags") === "1" ||
    window.localStorage.getItem("local-blog.debugTags") === "1"
  );
}

function getUnknownTags(value: unknown) {
  if (Array.isArray(value)) {
    return value;
  }
  return value ?? null;
}

function getRawNoteTagReason(note: RawNoteSummary) {
  const tags = normalizeTags(note.tags);
  const metadataTags = normalizeTags(note.metadata?.tags);
  if (tags.length > 0 || metadataTags.length > 0) {
    return "has tags";
  }
  if (!("tags" in note)) {
    return "missing top-level tags";
  }
  if (Array.isArray(note.tags) && note.tags.length === 0) {
    return "top-level tags is an empty array";
  }
  if (typeof note.tags === "string" && !note.tags.trim()) {
    return "top-level tags is an empty string";
  }
  if (note.tags == null) {
    return "top-level tags is null or undefined";
  }
  return "top-level tags has no usable string values";
}

function countTagTreeNodes(nodes: TagTreeNode[]) {
  let count = 0;
  for (const node of nodes) {
    count += 1 + countTagTreeNodes(node.children);
  }
  return count;
}

function logTagDiagnostics(rawNotes: RawNoteSummary[], normalizedNotes: NoteSummary[], tagTree: TagTreeNode[]) {
  if (!isDebugTagsEnabled()) {
    return;
  }

  const normalizedTagTotal = normalizedNotes.reduce((count, note) => count + note.tags.length, 0);
  console.groupCollapsed("[local-blog] tag diagnostics");
  console.info("fetch /api/notes succeeded", true);
  console.info("returned notes count", rawNotes.length);
  console.info("raw first note keys", rawNotes[0] ? Object.keys(rawNotes[0]) : []);
  console.table(
    rawNotes.slice(0, 5).map((note) => ({
      title: note.title,
      path: note.relativePath,
      tags: getUnknownTags(note.tags),
      metadataTags: getUnknownTags(note.metadata?.tags),
      frontmatterTags: getUnknownTags((note as { frontmatter?: { tags?: unknown } }).frontmatter?.tags),
      draft: note.draft,
    })),
  );
  console.table(
    normalizedNotes.slice(0, 5).map((note) => ({
      title: note.title,
      path: note.relativePath,
      tags: note.tags,
      draft: note.draft,
    })),
  );
  console.info("buildTagTree input tag total", normalizedTagTotal);
  console.info("buildTagTree root count", tagTree.length);
  console.info("buildTagTree node count", countTagTreeNodes(tagTree));
  if (rawNotes.length > 0 && normalizedTagTotal === 0 && tagTree.length === 0) {
    console.table(
      rawNotes.slice(0, 5).map((note) => ({
        title: note.title,
        path: note.relativePath,
        reason: getRawNoteTagReason(note),
      })),
    );
  }
  console.groupEnd();
}

function logTagFetchFailure(error: unknown) {
  if (!isDebugTagsEnabled()) {
    return;
  }

  console.groupCollapsed("[local-blog] tag diagnostics");
  console.info("fetch /api/notes succeeded", false);
  console.error("fetch /api/notes error", error);
  console.groupEnd();
}

function trimYamlValue(value: string) {
  return value
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .trim();
}

function parseTagsValue(value: string) {
  const trimmed = trimYamlValue(value);
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map(trimYamlValue)
      .filter(Boolean);
  }

  return trimmed
    .split(",")
    .map(trimYamlValue)
    .filter(Boolean);
}

function parseCollectionValue(value: string) {
  const trimmed = trimYamlValue(value);
  if (!trimmed) {
    return [];
  }

  return trimmed.startsWith("[") && trimmed.endsWith("]")
    ? parseTagsValue(trimmed)
    : [trimmed];
}

function parseBooleanValue(value: string) {
  const normalized = trimYamlValue(value).toLocaleLowerCase("en-US");
  if (["true", "yes", "1"].includes(normalized)) {
    return true;
  }

  if (["false", "no", "0"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function parseFrontmatterYaml(yaml: string): ParsedFrontmatter {
  const metadata: ParsedFrontmatter = {};
  const lines = yaml.replace(/\r\n/g, "\n").split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1].toLocaleLowerCase("en-US");
    const value = match[2] ?? "";
    if (!frontmatterKeys.has(key)) {
      continue;
    }

    if (key === "tags" || key === "collection") {
      if (value.trim()) {
        if (key === "tags") metadata.tags = parseTagsValue(value);
        if (key === "collection") metadata.collection = parseCollectionValue(value);
        continue;
      }

      const items: string[] = [];
      for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
        const itemMatch = lines[nextIndex].match(/^\s*-\s*(.+)$/);
        if (!itemMatch) {
          break;
        }

        const item = trimYamlValue(itemMatch[1]);
        if (item) {
          items.push(item);
        }
        index = nextIndex;
      }
      if (key === "tags") metadata.tags = items;
      if (key === "collection") metadata.collection = items;
      continue;
    }

    if (key === "draft") {
      const parsed = parseBooleanValue(value);
      if (parsed !== undefined) {
        metadata.draft = parsed;
      }
      continue;
    }

    const text = trimYamlValue(value);
    if (!text) {
      continue;
    }

    if (key === "title") metadata.title = text;
    if (key === "summary") metadata.summary = text;
    if (key === "category") metadata.category = text;
    if (key === "type") metadata.type = text;
    if (key === "kind") metadata.kind = text;
    if (key === "created") metadata.created = text;
    if (key === "updated") metadata.updated = text;
    if (key === "date") metadata.date = text;
  }

  return metadata;
}

function splitFrontmatter(value: string | null | undefined) {
  const text = (value ?? "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!text.trim()) {
    return { metadata: {} as ParsedFrontmatter, body: "" };
  }

  const fenced = text.match(/^---\n([\s\S]*?)\n(?:---|\.\.\.)\s*(?:\n|$)([\s\S]*)$/);
  if (fenced) {
    return {
      metadata: parseFrontmatterYaml(fenced[1]),
      body: fenced[2].trim(),
    };
  }

  const lines = text.split("\n");
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);
  const firstLine = firstContentIndex === -1 ? "" : lines[firstContentIndex];
  if (!/^\s*(title|summary|tags|collection|category|type|kind|source|created|updated|date|draft):\s*/i.test(firstLine)) {
    return { metadata: {} as ParsedFrontmatter, body: text.trim() };
  }

  const yamlLines: string[] = [];
  let bodyStart = firstContentIndex;
  for (let index = firstContentIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (
      line.trim() === "" ||
      /^\s*(title|summary|tags|collection|category|type|kind|source|created|updated|date|draft):\s*/i.test(line) ||
      /^\s*-\s+/.test(line)
    ) {
      yamlLines.push(line);
      bodyStart = index + 1;
      continue;
    }

    break;
  }

  return {
    metadata: parseFrontmatterYaml(yamlLines.join("\n")),
    body: lines.slice(bodyStart).join("\n").trim(),
  };
}

function stripMarkdownForSummary(value: string) {
  const text = splitFrontmatter(value).body;

  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\\\[[\s\S]*?\\\]/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\((?:https?:\/\/|\/)[^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/(?:Problem|URL|Submission)[\:\uff1a]\s*\S+/gi, " ")
    .replace(/`([^`]{1,24})`/g, "$1")
    .replace(/`[^`]*`/g, " ")
    .replace(/\$([^$\n]{1,24})\$/g, "$1")
    .replace(/\$[^$\n]*\$/g, " ")
    .replace(/^\s*\|.*\|\s*$/gm, " ")
    .replace(/^\s*[-:| ]{3,}\s*$/gm, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)\u3001]\s+/gm, "")
    .replace(/^\s*(title|summary|tags|collection|category|type|kind|source|raw|internal|debug|created|updated|date|draft):.*$/gim, " ")
    .replace(/^\s*-\s*['"]?[^'"\n]+['"]?\s*$/gm, " ")
    .replace(/[{}[\]]/g, " ")
    .replace(/[*_~>#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isInvalidSummary(value: string) {
  const text = value.trim();
  if (!text) {
    return true;
  }

  if (/\b(title|tags|summary|draft|source|raw|internal|debug)\s*:/i.test(text)) {
    return true;
  }

  if (/^(---|\.\.\.|```|~~~)/.test(text) || /https?:\/\/\S+/i.test(text)) {
    return true;
  }

  if (/^\|.*\|$/.test(text) || /\$\$|\\\[|\\\]|\\\(|\\\)/.test(text)) {
    return true;
  }

  if (/(^|[\s,\uff0c])(?:title|tags|summary|draft|source|created|updated|date)(?=[\s,\uff0c:\uff1a]|$)/i.test(text)) {
    return true;
  }

  if (/^[-,\s"'[\]{}:]+$/.test(text)) {
    return true;
  }

  const codeMarks = (text.match(/[`|{}[\]\\<>]/g) ?? []).length;
  if (codeMarks / Math.max(text.length, 1) > 0.06) {
    return true;
  }

  if (/[;=<>]{2,}|(?:const|let|var|function|return|include|define)\s+/i.test(text)) {
    return true;
  }

  const metadataMarks = (text.match(/[`|{}[\]:]/g) ?? []).length;
  if (metadataMarks / Math.max(text.length, 1) > 0.08) {
    return true;
  }

  const wordLikeTags = text
    .split(/[,\uff0c\u3001\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (
    wordLikeTags.length >= 2 &&
    wordLikeTags.length <= 8 &&
    wordLikeTags.every((part) => part.length <= 6) &&
    wordLikeTags.join("").length < 28 &&
    wordLikeTags.join("").length === text.replace(/[,\uff0c\u3001\s]+/g, "").length
  ) {
    return true;
  }

  return false;
}

function limitSummary(value: string, maxLength = 112) {
  const normalized = stripMarkdownForSummary(value);
  const limited = normalized.length > maxLength ? `${normalized.slice(0, maxLength).trimEnd()} [...]` : normalized;
  return isInvalidSummary(limited) ? "" : limited;
}

function createCleanSummary(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const summary = limitSummary(value ?? "");
    if (summary) {
      return summary;
    }
  }

  return summaryFallback;
}

function createCleanSummaryWithLimit(maxLength: number, ...values: Array<string | null | undefined>) {
  for (const value of values) {
    const summary = limitSummary(value ?? "", maxLength);
    if (summary) {
      return summary;
    }
  }

  return summaryFallback;
}

function getFilenameTitle(relativePath: string) {
  const filename = relativePath.split(/[\\/]/).pop() ?? relativePath;
  return decodeURIComponent(filename.replace(/\.[^.]+$/, "")) || "\u672a\u547d\u540d\u6587\u7ae0";
}

function normalizeTagInput(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return parseTagsValue(value);
  }

  return [];
}

function getTagCollectionValue(tag: string) {
  const match = tag.match(/^(?:\u6587\u96c6|collection)\s*[:\uff1a]\s*(.+)$/i);
  return match?.[1]?.trim() || null;
}

function isCollectionTag(tag: string) {
  return Boolean(getTagCollectionValue(tag));
}

function getCollectionsFromTags(tags: string[]) {
  return tags.map(getTagCollectionValue).filter((value): value is string => Boolean(value));
}

function getDisplayTags(post: { tags?: unknown }) {
  return normalizeTags(post.tags);
}

function normalizeTags(tags: unknown) {
  return Array.from(
    new Set(
      normalizeTagInput(tags)
        .map((tag) => tag.trim())
        .filter(
          (tag) =>
            tag &&
            !isCollectionTag(tag) &&
            !/^(title|summary|tags|collection|category|type|kind|created|updated|date|draft):/i.test(tag),
        ),
    ),
  );
}

function matchArticleClass(value: string | null | undefined) {
  const text = value?.trim();
  if (!text) {
    return null;
  }

  return articleClassWords.find((word) => text.includes(word)) ?? null;
}

function inferArticleClass({
  relativePath,
  category,
  tags,
  metadata,
}: {
  relativePath: string;
  category: string;
  tags: string[];
  metadata: {
    category?: string | null;
    type?: string | null;
    kind?: string | null;
  };
}) {
  const fromFrontmatter =
    matchArticleClass(metadata.category) ?? matchArticleClass(metadata.type) ?? matchArticleClass(metadata.kind);
  if (fromFrontmatter) {
    return fromFrontmatter;
  }

  const fromTags = tags.map(matchArticleClass).find(Boolean);
  if (fromTags) {
    return fromTags;
  }

  const normalizedPath = relativePath.replace(/\\/g, "/").toLocaleLowerCase("en-US");
  const normalizedCategory = category.trim().toLocaleLowerCase("en-US");
  if (normalizedPath.startsWith("problems/") || normalizedCategory === "problems") {
    return "\u9898\u89e3";
  }
  if (normalizedPath.startsWith("tricks/") || normalizedCategory === "tricks") {
    return "\u6280\u5de7";
  }
  if (normalizedPath.startsWith("luogu/") || normalizedCategory === "luogu") {
    return tags.includes("\u590d\u76d8") ? "\u590d\u76d8" : "\u9898\u89e3";
  }

  return "\u672a\u5206\u7c7b";
}

function normalizeCollectionName(value: string | null | undefined) {
  const text = value?.trim();
  if (!text) {
    return null;
  }

  return getCategoryLabel(text);
}

function normalizeCollectionInput(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(normalizeCollectionInput);
  }

  if (typeof value !== "string") {
    return [];
  }

  return parseCollectionValue(value);
}

function getCollectionDescription(collection: string) {
  return collectionDescriptions[collection] ?? "\u6536\u5f55\u8fd9\u4e00\u4e3b\u9898\u4e0b\u7684\u76f8\u5173\u6587\u7ae0\u3002";
}

function getPostCollections({
  tags,
  sources,
}: {
  tags: string[];
  sources: unknown[];
}) {
  const collections = Array.from(
    new Set(
      [...sources.flatMap(normalizeCollectionInput), ...getCollectionsFromTags(tags)]
        .map(normalizeCollectionName)
        .filter((collection): collection is string => Boolean(collection)),
    ),
  );

  return collections.length > 0 ? collections : [unfiledCollectionName];
}

function normalizeNoteSummary(note: RawNoteSummary): NoteSummary {
  const titleParts = splitFrontmatter(note.title);
  const summaryParts = splitFrontmatter(note.summary);
  const excerptParts = splitFrontmatter(note.excerpt);
  const metadata = { ...(note.metadata ?? {}), ...titleParts.metadata, ...summaryParts.metadata, ...excerptParts.metadata };
  const rawTags = [
    ...normalizeTagInput(metadata.tags),
    ...normalizeTagInput(note.metadata?.tags),
    ...normalizeTagInput(note.tags),
  ];
  const metadataTags = getDisplayTags({ tags: metadata.tags });
  const responseMetadataTags = getDisplayTags({ tags: note.metadata?.tags });
  const noteTags = getDisplayTags(note);
  const tags = metadataTags.length > 0 ? metadataTags : responseMetadataTags.length > 0 ? responseMetadataTags : noteTags;
  const summaryText = createCleanSummary(metadata.summary, summaryParts.body, excerptParts.body);
  const excerptText = createCleanSummary(excerptParts.body, metadata.summary, summaryParts.body);
  const collections = getPostCollections({
    tags: rawTags,
    sources: [metadata.collection, metadata.category, note.collections, note.collection],
  });

  return {
    ...note,
    title: (metadata.title ?? titleParts.body) || getFilenameTitle(note.relativePath),
    summary: summaryText || null,
    excerpt: excerptText || null,
    tags,
    collection: collections[0],
    collections,
    articleClass: inferArticleClass({
      relativePath: note.relativePath,
      category: note.category,
      tags,
      metadata,
    }),
    created: metadata.created ?? note.created,
    updated: metadata.updated ?? note.updated,
    date: metadata.date ?? note.date,
    draft: metadata.draft ?? note.draft,
  };
}

function normalizeNoteDetail(note: RawNoteDetail): NoteDetail {
  const bodyParts = splitFrontmatter(note.body);
  const metadata = { ...(note.metadata ?? {}), ...bodyParts.metadata };
  const rawTags = [
    ...normalizeTagInput(bodyParts.metadata.tags),
    ...normalizeTagInput(note.metadata?.tags),
    ...normalizeTagInput(note.tags),
  ];
  const bodyTags = getDisplayTags({ tags: bodyParts.metadata.tags });
  const metadataTags = getDisplayTags({ tags: note.metadata?.tags });
  const noteTags = getDisplayTags(note);
  const tags = bodyTags.length > 0 ? bodyTags : metadataTags.length > 0 ? metadataTags : noteTags;
  const collections = getPostCollections({
    tags: rawTags,
    sources: [metadata.collection, metadata.category, note.collections, note.collection],
  });

  return {
    ...note,
    title: metadata.title?.trim() || note.title || getFilenameTitle(note.relativePath),
    tags,
    collection: collections[0],
    collections,
    created: bodyParts.metadata.created ?? note.created,
    updated: bodyParts.metadata.updated ?? note.updated,
    date: bodyParts.metadata.date ?? note.date,
    draft: bodyParts.metadata.draft ?? note.draft,
    summary: bodyParts.metadata.summary ?? note.summary,
    metadata,
    body: bodyParts.body,
  };
}

function formatDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${date.getFullYear()} \u5e74 ${date.getMonth() + 1} \u6708 ${date.getDate()} \u65e5`;
}

function formatCompactDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function formatOptionalDate(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const formatted = formatDate(value ?? null);
    if (formatted) {
      return formatted;
    }
  }

  return null;
}

function getNoteDateValue(note: NoteSummary) {
  return note.date ?? note.updated ?? note.created ?? null;
}

function getNoteDate(note: NoteSummary) {
  const value = getNoteDateValue(note);
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getNoteYear(note: NoteSummary) {
  return getNoteDate(note)?.getFullYear().toString() ?? "\u672a\u77e5\u5e74\u4efd";
}

function formatArchiveDay(note: NoteSummary) {
  const date = getNoteDate(note);
  if (!date) {
    return "\u65e5\u671f\u672a\u77e5";
  }

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return month + " \u6708 " + day + " \u65e5";
}

function getNoteExcerpt(note: NoteSummary) {
  return createCleanSummary(note.summary, note.excerpt);
}

function getShortNoteExcerpt(note: NoteSummary) {
  const excerpt = getNoteExcerpt(note);
  return excerpt.length > 64 ? excerpt.slice(0, 64) + " [...]" : excerpt;
}

function getHomeExcerpt(note: NoteSummary, maxLength: number) {
  return createCleanSummaryWithLimit(maxLength, note.summary, note.excerpt);
}

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN");
}

function getTagCounts(notes: NoteSummary[]) {
  return flattenTagTree(buildTagTree(notes));
}

function getCategoryCounts(notes: NoteSummary[]) {
  const counts = new Map<string, number>();

  for (const note of notes) {
    const category = note.articleClass?.trim() || "\u672a\u5206\u7c7b";
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return Array.from(counts, ([name, count]) => ({ name, count })).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"),
  );
}

function buildCollections(posts: NoteSummary[]): CollectionGroup[] {
  const collections = new Map<string, NoteSummary[]>();

  for (const post of posts) {
    for (const collection of post.collections) {
      const collectionPosts = collections.get(collection) ?? [];
      collectionPosts.push(post);
      collections.set(collection, collectionPosts);
    }
  }

  return Array.from(collections, ([name, collectionPosts]) => {
    const latestPost = collectionPosts
      .map((post) => ({ post, date: getNoteDate(post) }))
      .filter((item): item is { post: NoteSummary; date: Date } => Boolean(item.date))
      .sort((a, b) => b.date.getTime() - a.date.getTime())[0];

    return {
      name,
      posts: collectionPosts,
      count: collectionPosts.length,
      latestUpdatedAt: latestPost ? getNoteDateValue(latestPost.post) ?? undefined : undefined,
    };
  }).sort((a, b) => {
    if (a.name === unfiledCollectionName && b.name !== unfiledCollectionName) {
      return 1;
    }

    if (b.name === unfiledCollectionName && a.name !== unfiledCollectionName) {
      return -1;
    }

    const aDate = a.latestUpdatedAt ? new Date(a.latestUpdatedAt).getTime() : 0;
    const bDate = b.latestUpdatedAt ? new Date(b.latestUpdatedAt).getTime() : 0;
    if (aDate !== bDate) {
      return bDate - aDate;
    }

    return b.count - a.count || a.name.localeCompare(b.name, "zh-CN");
  });
}

function searchNotes(notes: NoteSummary[], query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return notes;
  }

  return notes.filter((note) => {
    const fields = [
      note.title,
      note.summary ?? "",
      note.excerpt ?? "",
      ...note.collections,
      note.relativePath,
      ...getArticleTagSearchTerms(note),
    ];

    return fields.some((field) => normalizeSearchText(field).includes(normalizedQuery));
  });
}

function paginateNotes(notes: NoteSummary[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(notes.length / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const start = (currentPage - 1) * pageSize;

  return {
    currentPage,
    totalPages,
    items: notes.slice(start, start + pageSize),
  };
}

function groupNotesByYear(notes: NoteSummary[]) {
  const groups = new Map<string, NoteSummary[]>();

  for (const note of notes) {
    const year = getNoteYear(note);
    const group = groups.get(year) ?? [];
    group.push(note);
    groups.set(year, group);
  }

  return Array.from(groups, ([year, yearNotes]) => ({ year, notes: yearNotes })).sort((a, b) => {
    if (a.year === "\u672a\u77e5\u5e74\u4efd") return 1;
    if (b.year === "\u672a\u77e5\u5e74\u4efd") return -1;
    return Number(b.year) - Number(a.year);
  });
}

function sortNotesByRecent(notes: NoteSummary[]) {
  return notes
    .map((note, index) => ({ note, index, date: getNoteDate(note)?.getTime() ?? 0 }))
    .sort((a, b) => b.date - a.date || a.index - b.index)
    .map((item) => item.note);
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => getRouteFromHash());
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState(true);
  const [notesError, setNotesError] = useState<string | null>(null);

  const loadNotes = async (signal?: AbortSignal) => {
    setIsLoadingNotes(true);
    setNotesError(null);

    try {
      const response = await fetch("/api/notes", {
        headers: { Accept: "application/json" },
        signal,
      });

      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }

      const data = (await response.json()) as NotesResponse;
      if (!Array.isArray(data.notes)) {
        throw new Error("Invalid notes response");
      }

      const normalizedNotes = data.notes.map(normalizeNoteSummary);
      logTagDiagnostics(data.notes, normalizedNotes, buildTagTree(normalizedNotes));
      setNotes(normalizedNotes);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }

      console.error("Failed to load local blog notes", err);
      logTagFetchFailure(err);
      setNotesError("无法读取本地笔记");
      setNotes([]);
    } finally {
      if (!signal?.aborted) {
        setIsLoadingNotes(false);
      }
    }
  };

  useEffect(() => {
    const handleHashChange = () => setRoute(getRouteFromHash());

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadNotes(controller.signal);

    return () => controller.abort();
  }, []);

  const tagTree = useMemo(() => buildTagTree(notes), [notes]);
  const collections = useMemo(() => buildCollections(notes), [notes]);

  return (
    <main className="site-shell">
        <header className="site-header">
          <div className="masthead-title">
            <a className="brand" href="#/" aria-label={"OI Notebook \u9996\u9875"}>
              OI Notebook
            </a>
            <p>{"\u4e00\u4e2a\u672c\u5730\u7b97\u6cd5\u7b14\u8bb0\u4e0e\u9898\u89e3\u535a\u5ba2"}</p>
          </div>
          <SiteNav route={route} />
        </header>

        {route.name === "note" ? (
          <NoteDetailView relativePath={route.relativePath} notes={notes} />
        ) : (
          <IndexView
            route={route}
            notes={notes}
            tagTree={tagTree}
            collections={collections}
            isLoading={isLoadingNotes}
            error={notesError}
            onRetry={() => void loadNotes()}
          />
        )}
      </main>
  );
}

function IndexView({
  route,
  notes,
  tagTree,
  collections,
  isLoading,
  error,
  onRetry,
}: {
  route: Exclude<Route, { name: "note"; encodedPath: string; relativePath: string }>;
  notes: NoteSummary[];
  tagTree: TagTreeNode[];
  collections: CollectionGroup[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (route.name === "articles") {
    return (
      <ArticleArchiveView
        notes={notes}
        isLoading={isLoading}
        error={error}
        onRetry={onRetry}
        page={route.page}
        targetYear={route.year}
        sourceHref={getRouteReturnHref(route)}
      />
    );
  }

  if (route.name === "tags") {
    return (
      <ListingPage breadcrumb={"\u9996\u9875 \u2192 \u6807\u7b7e"}>
        <TagMap
          tagTree={tagTree}
          isLoading={isLoading}
          error={error}
          onRetry={onRetry}
        />
      </ListingPage>
    );
  }

  if (route.name === "tag") {
    const tagNode = findTagTreeNode(tagTree, route.tag);
    const includeDescendants = Boolean(tagNode?.children.length);
    const filteredNotes = notes.filter((note) => matchArticleByTagPath(note, route.tag, includeDescendants));
    const paged = paginateNotes(filteredNotes, route.page, resultPageSize);
    const relatedTags = tagNode ? collectRelatedTagChips(tagNode) : [];

    return (
      <ListingPage
        breadcrumb={
          <>
            <a href="#/">{"\u9996\u9875"}</a>
            <span>{" \u2192 "}</span>
            <a href="#/tags">{"\u6807\u7b7e"}</a>
          </>
        }
      >
        <TagDetailHeader tag={route.tag} count={filteredNotes.length} />
        <RelatedTagList tags={relatedTags} />
        <section className="tag-detail-results">
          <PostResults
            notes={paged.items}
            isLoading={isLoading}
            error={error}
            onRetry={onRetry}
            sourceHref={getRouteReturnHref(route)}
            variant="list"
            emptyTitle={"\u8fd9\u4e2a\u6807\u7b7e\u4e0b\u8fd8\u6ca1\u6709\u6587\u7ae0"}
            emptyDescription={"\u540e\u7eed\u7ed9\u7b14\u8bb0\u6dfb\u52a0\u8fd9\u4e2a\u6807\u7b7e\u540e\uff0c\u8fd9\u91cc\u4f1a\u663e\u793a\u5bf9\u5e94\u6587\u7ae0\u3002"}
          />
          <Pagination currentPage={paged.currentPage} totalPages={paged.totalPages} getPageHref={(page) => getTagHref(route.tag, page)} />
        </section>
      </ListingPage>
    );
  }

  if (route.name === "collections") {
    return (
      <ListingPage breadcrumb={"\u9996\u9875 \u2192 \u6587\u96c6"}>
        <CollectionList
          collections={collections}
          isLoading={isLoading}
          error={error}
          onRetry={onRetry}
        />
      </ListingPage>
    );
  }

  if (route.name === "collection") {
    const collection = getCategoryLabel(route.collection);
    const collectionGroup = collections.find((item) => item.name === collection);
    const filteredNotes = sortNotesByRecent(notes.filter((note) => note.collections.includes(collection)));
    const paged = paginateNotes(filteredNotes, route.page, resultPageSize);

    return (
      <ListingPage breadcrumb={"\u9996\u9875 \u2192 \u6587\u96c6 \u2192 " + collection}>
        <section className="collection-detail">
          <a className="collection-detail-back" href="#/collections">{"\u2190 \u8fd4\u56de\u6587\u96c6"}</a>
          <CollectionDetailHeader
            collection={collection}
            count={filteredNotes.length}
            latestUpdatedAt={collectionGroup?.latestUpdatedAt}
          />
          <div className="collection-detail-results">
            <PostResults
              notes={paged.items}
              isLoading={isLoading}
              error={error}
              onRetry={onRetry}
              sourceHref={getRouteReturnHref(route)}
              variant="list"
              emptyTitle={"\u6ca1\u6709\u627e\u5230\u8fd9\u4e2a\u6587\u96c6"}
              emptyDescription={"\u7ed9\u7b14\u8bb0\u6dfb\u52a0\u5bf9\u5e94 collection\u3001category \u6216\u6587\u96c6\u6807\u7b7e\u540e\uff0c\u8fd9\u91cc\u4f1a\u663e\u793a\u5bf9\u5e94\u6587\u7ae0\u3002"}
            />
            <Pagination currentPage={paged.currentPage} totalPages={paged.totalPages} getPageHref={(page) => getCollectionHref(collection, page)} />
          </div>
        </section>
      </ListingPage>
    );
  }

  if (route.name === "search") {
    return (
      <SearchView
        query={route.query}
        notes={notes}
        isLoading={isLoading}
        error={error}
        onRetry={onRetry}
        page={route.page}
      />
    );
  }

  const latestNote = notes[0] ?? null;
  const articleNotes = notes.slice(1);
  const paged = paginateNotes(articleNotes, route.page, homePageSize);

  return (
    <>
      <RecentUpdates note={latestNote} sourceHref={getRouteReturnHref(route)} />

      <section className="home-posts" id="articles" aria-label={"\u6587\u7ae0\u6458\u8981\u6d41"}>
        <PostResults
          notes={paged.items}
          isLoading={isLoading}
          error={error}
          onRetry={onRetry}
          sourceHref={getRouteReturnHref(route)}
        />
        <Pagination currentPage={paged.currentPage} totalPages={paged.totalPages} getPageHref={getHomeHref} />
      </section>
    </>
  );
}

function SiteNav({ route }: { route: Route }) {
  const activeName =
    route.name === "note" || route.name === "articles"
      ? "articles"
      : route.name === "tag"
        ? "tags"
        : route.name === "collection"
          ? "collections"
          : route.name;

  return (
    <div className="primary-nav-row">
      <nav className="nav-links" aria-label={"\u535a\u5ba2\u5bfc\u822a"}>
        <a className={activeName === "home" ? "active" : undefined} href="#/">
          {"\u4e3b\u9875"}
        </a>
        <a className={activeName === "articles" ? "active" : undefined} href="#/articles">
          {"\u6587\u7ae0\u5217\u8868"}
        </a>
        <a className={activeName === "tags" ? "active" : undefined} href="#/tags">
          {"\u6807\u7b7e"}
        </a>
        <a className={activeName === "collections" ? "active" : undefined} href="#/collections">
          {"\u6587\u96c6"}
        </a>
      </nav>
      <a className={activeName === "search" ? "search-link active" : "search-link"} href="#/search" aria-label={"\u641c\u7d22"} title={"\u641c\u7d22"} />
    </div>
  );
}

function ListingPage({ breadcrumb, children }: { breadcrumb: ReactNode; children: ReactNode }) {
  return (
    <>
      <nav className="breadcrumb" aria-label={"\u9762\u5305\u5c51"}>
        {breadcrumb}
      </nav>
      <section className="listing-content">{children}</section>
    </>
  );
}

function TagDetailHeader({ tag, count }: { tag: string; count: number }) {
  const segments = getTagPathSegments(tag);

  return (
    <header className="tag-detail-header">
      <h1>
        {segments.map((segment, index) => (
          <span key={segments.slice(0, index + 1).join(tagPathSeparator)}>
            {index > 0 ? <em>{tagPathSeparator}</em> : null}
            <a href={getTagHref(segments.slice(0, index + 1).join(tagPathSeparator))}>{segment}</a>
          </span>
        ))}
      </h1>
      <p className="tag-detail-count">{"\u5171 " + count + " \u7bc7\u6587\u7ae0"}</p>
    </header>
  );
}

function getTagChipLabel(node: TagTreeNode) {
  if (node.depth <= 3) {
    return node.name;
  }

  const segments = getTagPathSegments(node.fullPath);
  return segments.slice(2).join(` ${tagPathSeparator} `);
}

function collectTagChips(node: TagTreeNode): TagChipItem[] {
  return [
    {
      label: getTagChipLabel(node),
      fullPath: node.fullPath,
      count: node.count,
    },
    ...node.children.flatMap(collectTagChips),
  ];
}

function collectRelatedTagChips(node: TagTreeNode): TagChipItem[] {
  return node.children.flatMap((child) => {
    if (child.children.length === 0) {
      const segments = getTagPathSegments(child.fullPath);
      const parentDepth = node.depth;

      return [{
        label: segments.slice(parentDepth).join(` ${tagPathSeparator} `),
        fullPath: child.fullPath,
        count: child.count,
      }];
    }

    return collectRelatedTagChips(child);
  });
}

function normalizeTagSearchText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
}

function normalizeCompactTagSearchText(value: string) {
  return normalizeTagSearchText(value).replace(/\s+/g, "");
}

function getTagChipSearchText(item: TagChipItem) {
  return [
    item.label,
    item.fullPath,
    tagSuggestionSearchByPath.get(item.fullPath) ?? "",
  ].join(" ");
}

function matchesTagChipSearch(item: TagChipItem, query: string) {
  const normalizedQuery = normalizeTagSearchText(query);
  if (!normalizedQuery) {
    return true;
  }

  const searchText = getTagChipSearchText(item);
  return (
    normalizeTagSearchText(searchText).includes(normalizedQuery) ||
    normalizeCompactTagSearchText(searchText).includes(normalizeCompactTagSearchText(query))
  );
}

function TagChip({ item }: { item: TagChipItem }) {
  return (
    <a className="tag-map-chip" href={getTagHref(item.fullPath)}>
      <span>{item.label}</span>
      <small>{item.count}</small>
    </a>
  );
}

function RelatedTagList({ tags }: { tags: TagChipItem[] }) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <section className="tag-detail-related" aria-label={"\u76f8\u5173\u5b50\u6807\u7b7e"}>
      <h2>{"\u76f8\u5173\u6807\u7b7e"}</h2>
      <div className="tag-map-chip-row">
        {tags.map((item) => (
          <TagChip item={item} key={item.fullPath} />
        ))}
      </div>
    </section>
  );
}

function TagMap({
  tagTree,
  isLoading,
  error,
  onRetry,
}: {
  tagTree: TagTreeNode[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const [tagQuery, setTagQuery] = useState("");

  if (isLoading) {
    return <LoadingState title={"\u6b63\u5728\u52a0\u8f7d\u6807\u7b7e"} description={"\u6b63\u5728\u6c47\u603b\u672c\u5730\u7b14\u8bb0\u7684\u6807\u7b7e\u4f53\u7cfb\u3002"} />;
  }

  if (error) {
    return <ErrorState title={"\u65e0\u6cd5\u8bfb\u53d6\u6807\u7b7e"} description={"\u672c\u5730\u535a\u5ba2\u670d\u52a1\u6682\u65f6\u65e0\u6cd5\u6c47\u603b\u6807\u7b7e\u4f53\u7cfb\u3002"} onRetry={onRetry} />;
  }

  if (tagTree.length === 0) {
    return (
      <EmptyState
        title={"\u8fd8\u6ca1\u6709\u6807\u7b7e"}
        description={"\u7ed9\u7b14\u8bb0\u6dfb\u52a0\u6807\u7b7e\u540e\uff0c\u8fd9\u91cc\u4f1a\u751f\u6210\u4e00\u5f20\u8f7b\u91cf\u7684\u77e5\u8bc6\u5730\u56fe\u3002"}
      />
    );
  }

  const trimmedTagQuery = tagQuery.trim();
  const visibleGroups = tagTree
    .map((group) => {
      const directChips = group.children
        .filter((child) => child.children.length === 0)
        .map((child) => ({
          label: child.name,
          fullPath: child.fullPath,
          count: child.count,
        }))
        .filter((item) => matchesTagChipSearch(item, trimmedTagQuery));
      const branches = group.children
        .filter((child) => child.children.length > 0)
        .map((child) => ({
          node: child,
          chips: child.children
            .flatMap(collectTagChips)
            .filter((item) => matchesTagChipSearch(item, trimmedTagQuery)),
        }))
        .filter((branch) => branch.chips.length > 0);

      return { group, directChips, branches };
    })
    .filter((group) => group.directChips.length > 0 || group.branches.length > 0);

  return (
    <section className="tag-map" aria-label={"\u6807\u7b7e\u4f53\u7cfb"}>
      <div className="tag-map-heading">
        <h1>{"\u6807\u7b7e"}</h1>
        <div className="tag-map-search">
          <span className="tag-map-search-icon" aria-hidden="true" />
          <input
            aria-label={"\u641c\u7d22\u6807\u7b7e\u6216\u522b\u540d"}
            placeholder={"\u641c\u7d22\u6807\u7b7e\u6216\u522b\u540d"}
            type="search"
            value={tagQuery}
            onChange={(event) => setTagQuery(event.target.value)}
          />
          {tagQuery ? (
            <button type="button" onClick={() => setTagQuery("")}>
              {"\u6e05\u9664"}
            </button>
          ) : null}
        </div>
      </div>
      {visibleGroups.length > 0 ? (
        <div className="tag-map-groups">
          {visibleGroups.map(({ group, directChips, branches }) => (
              <section className="tag-map-group" key={group.fullPath}>
                <a className="tag-map-group-title" href={getTagHref(group.fullPath)}>
                  <span>{group.name}</span>
                  <small>{group.count}</small>
                </a>
                {directChips.length > 0 ? (
                  <div className="tag-map-chip-row">
                    {directChips.map((item) => (
                      <TagChip item={item} key={item.fullPath} />
                    ))}
                  </div>
                ) : null}
                {branches.length > 0 ? (
                  <div className="tag-map-branches">
                    {branches.map(({ node, chips }) => (
                      <TagMapBranch chips={chips} node={node} key={node.fullPath} />
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
        </div>
      ) : (
        <p className="tag-map-empty">{"\u6ca1\u6709\u627e\u5230\u5339\u914d\u7684\u6807\u7b7e\u3002"}</p>
      )}
    </section>
  );
}

function TagMapBranch({ node, chips = node.children.flatMap(collectTagChips) }: { node: TagTreeNode; chips?: TagChipItem[] }) {
  return (
    <section className="tag-map-branch">
      <a className="tag-map-branch-title" href={getTagHref(node.fullPath)}>
        <span>{node.name}</span>
        <small>{node.count}</small>
      </a>
      {chips.length > 0 ? (
        <div className="tag-map-chip-row">
          {chips.map((item) => (
            <TagChip item={item} key={item.fullPath} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function TagCloud({ tags }: { tags: CountItem[] }) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <div className="term-list" aria-label={"\u6807\u7b7e\u5217\u8868"}>
      {tags.map((tag) => (
        <a className="term-pill" href={getTagHref(tag.name)} key={tag.name}>
          <span>{tag.name}</span>
          <small>{tag.count}</small>
        </a>
      ))}
    </div>
  );
}

function CollectionDetailHeader({
  collection,
  count,
  latestUpdatedAt,
}: {
  collection: string;
  count: number;
  latestUpdatedAt?: string;
}) {
  return (
    <header className="collection-detail-header">
      <h1>{collection}</h1>
      <p className="collection-detail-meta">
        {"\u5171 " + count + " \u7bc7"}
        <span aria-hidden="true">{" \u00b7 "}</span>
        {"\u6700\u8fd1\u66f4\u65b0 " + (formatCompactDate(latestUpdatedAt) ?? "\u6682\u65e0\u8bb0\u5f55")}
      </p>
      <p className="collection-detail-description">{getCollectionDescription(collection)}</p>
    </header>
  );
}

function CollectionList({
  collections,
  isLoading,
  error,
  onRetry,
}: {
  collections: CollectionGroup[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const content = (() => {
  if (isLoading) {
    return <LoadingState title={"\u6b63\u5728\u52a0\u8f7d\u6587\u96c6"} description={"\u6b63\u5728\u6309\u680f\u76ee\u3001\u7cfb\u5217\u548c\u9636\u6bb5\u6574\u7406\u672c\u5730\u6587\u7ae0\u3002"} />;
  }

  if (error) {
    return <ErrorState title={"\u65e0\u6cd5\u8bfb\u53d6\u6587\u96c6"} description={"\u672c\u5730\u535a\u5ba2\u670d\u52a1\u6682\u65f6\u65e0\u6cd5\u6c47\u603b\u6587\u96c6\u3002"} onRetry={onRetry} />;
  }

  if (collections.length === 0) {
    return (
      <EmptyState
        title={"\u8fd8\u6ca1\u6709\u6587\u96c6"}
        description={"\u7ed9\u7b14\u8bb0\u6dfb\u52a0 collection\u3001category \u6216\u6587\u96c6\u6807\u7b7e\u540e\uff0c\u8fd9\u91cc\u4f1a\u81ea\u52a8\u6c47\u603b\u6587\u96c6\u3002"}
      />
    );
  }

  return (
    <div className="collection-card-grid" aria-label={"\u6587\u96c6\u5217\u8868"}>
      {collections.map((collection) => (
        <a className="collection-card" href={getCollectionHref(collection.name)} key={collection.name}>
          <span className="collection-card-spine" aria-hidden="true" />
          <span className="collection-card-body">
            <span className="collection-card-kicker">{collection.count + " \u7bc7\u6587\u7ae0"}</span>
            <span className="collection-card-title">{collection.name}</span>
            <span className="collection-card-description">{getCollectionDescription(collection.name)}</span>
            <span className="collection-card-updated">
              {"\u6700\u8fd1\u66f4\u65b0\uff1a" + (formatCompactDate(collection.latestUpdatedAt) ?? "\u6682\u65e0\u8bb0\u5f55")}
            </span>
          </span>
        </a>
      ))}
    </div>
  );
  })();

  return (
    <section className="collection-overview">
      <header className="collection-overview-header">
        <h1>{"\u6587\u96c6"}</h1>
        <p>{"\u6309\u680f\u76ee\u3001\u7cfb\u5217\u548c\u9636\u6bb5\u6574\u7406\u6587\u7ae0\u3002"}</p>
      </header>
      {content}
    </section>
  );
}

function ArticleArchiveView({
  notes,
  isLoading,
  error,
  onRetry,
  page,
  targetYear,
  sourceHref,
}: {
  notes: NoteSummary[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  page: number;
  targetYear: string | null;
  sourceHref: string;
}) {
  const paged = paginateNotes(notes, page, archivePageSize);
  const yearGroups = groupNotesByYear(paged.items);
  const allYearGroups = groupNotesByYear(notes);
  const years = allYearGroups.map((group) => group.year);
  const yearCounts = new Map(allYearGroups.map((group) => [group.year, group.notes.length]));
  const yearPageLookup = new Map<string, number>();

  notes.forEach((note, index) => {
    const year = getNoteYear(note);
    if (!yearPageLookup.has(year)) {
      yearPageLookup.set(year, Math.floor(index / archivePageSize) + 1);
    }
  });

  useEffect(() => {
    if (!targetYear || isLoading || error) {
      return;
    }

    window.requestAnimationFrame(() => {
      document.getElementById("year-" + targetYear)?.scrollIntoView({ block: "start" });
    });
  }, [error, isLoading, targetYear, paged.currentPage]);

  return (
    <ListingPage breadcrumb={"\u9996\u9875 \u2192 \u6587\u7ae0\u5217\u8868"}>
      {years.length > 0 ? (
        <nav className="year-index" aria-label={"\u5e74\u4efd\u7d22\u5f15"}>
          {years.map((year) => (
            <a href={getArticlesHref(yearPageLookup.get(year) ?? 1, year)} key={year}>
              {year}
            </a>
          ))}
        </nav>
      ) : null}
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState onRetry={onRetry} />
      ) : notes.length === 0 ? (
        <EmptyState title="\u6682\u65e0\u6587\u7ae0" description="\u4fdd\u5b58\u7b2c\u4e00\u7bc7 Markdown \u7b14\u8bb0\u540e\uff0c\u8fd9\u91cc\u4f1a\u663e\u793a\u5e74\u4efd\u5f52\u6863\u3002" />
      ) : (
        <ArchiveList groups={yearGroups} yearCounts={yearCounts} sourceHref={sourceHref} />
      )}
      <Pagination currentPage={paged.currentPage} totalPages={paged.totalPages} getPageHref={getArticlesHref} />
    </ListingPage>
  );
}

function ArchiveList({
  groups,
  yearCounts,
  sourceHref,
}: {
  groups: Array<{ year: string; notes: NoteSummary[] }>;
  yearCounts: Map<string, number>;
  sourceHref: string;
}) {
  return (
    <div className="archive-list">
      {groups.map((group) => (
        <section className="archive-year" id={"year-" + group.year} key={group.year}>
          <h2>
            {group.year} <span>({yearCounts.get(group.year) ?? group.notes.length})</span>
          </h2>
          <ol>
            {group.notes.map((note) => (
              <li key={note.relativePath}>
                <time dateTime={getNoteDateValue(note) ?? undefined}>{formatArchiveDay(note)}</time>
                <a href={getNoteHref(note.relativePath, sourceHref)}>{note.title}</a>
                <span>{note.collection}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function SearchView({
  query,
  notes,
  isLoading,
  error,
  onRetry,
  page,
}: {
  query: string;
  notes: NoteSummary[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  page: number;
}) {
  const [draftQuery, setDraftQuery] = useState(query);
  const results = useMemo(() => searchNotes(notes, query), [notes, query]);
  const paged = paginateNotes(query ? results : [], page, resultPageSize);
  const sourceHref = getSearchHref(query, paged.currentPage);

  useEffect(() => {
    setDraftQuery(query);
  }, [query]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    window.location.hash = getSearchHref(draftQuery, 1);
  };

  return (
    <ListingPage breadcrumb={"\u9996\u9875 \u2192 \u641c\u7d22"}>
      <form className="search-form" onSubmit={handleSubmit}>
        <label className="search-label" htmlFor="local-blog-search">
          {"\u641c\u7d22\u6587\u7ae0"}
        </label>
        <div className="search-field">
          <input
            id="local-blog-search"
            aria-label={"\u641c\u7d22\u6587\u7ae0"}
            placeholder={"\u641c\u7d22\u6807\u9898\u3001\u6458\u8981\u6216\u6b63\u6587"}
            type="search"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
          />
          <button type="submit">{"\u641c\u7d22"}</button>
        </div>
        {query ? (
          <a className="clear-search" href="#/search">
            {"\u6e05\u9664"}
          </a>
        ) : null}
      </form>

      <p className="result-count">
        {query ? "\u627e\u5230 " + results.length + " \u7bc7\u76f8\u5173\u6587\u7ae0" : "\u8f93\u5165\u5173\u952e\u8bcd\u5f00\u59cb\u641c\u7d22"}
      </p>

      <PostResults
        notes={paged.items}
        isLoading={isLoading}
        error={error}
        onRetry={onRetry}
        sourceHref={sourceHref}
        variant="list"
        emptyTitle={query ? "\u6ca1\u6709\u627e\u5230\u76f8\u5173\u6587\u7ae0" : "\u8fd8\u6ca1\u6709\u8f93\u5165\u641c\u7d22\u8bcd"}
        emptyDescription={
          query
            ? "\u6362\u4e00\u4e2a\u6807\u9898\u3001\u6807\u7b7e\u3001\u6587\u96c6\u6216\u6458\u8981\u91cc\u7684\u5173\u952e\u8bcd\u518d\u8bd5\u8bd5\u3002"
            : "\u53ef\u4ee5\u641c\u7d22\u4e2d\u6587\u6807\u9898\u3001\u6807\u7b7e\u3001\u6458\u8981\u3001\u6587\u96c6\u540d\u6216\u76f8\u5bf9\u8def\u5f84\u3002"
        }
      />
      <Pagination currentPage={paged.currentPage} totalPages={paged.totalPages} getPageHref={(nextPage) => getSearchHref(query, nextPage)} />
    </ListingPage>
  );
}

function PostResults({
  notes,
  isLoading,
  error,
  onRetry,
  sourceHref,
  emptyTitle,
  emptyDescription,
  variant = "grid",
}: {
  notes: NoteSummary[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  sourceHref?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  variant?: "grid" | "list";
}) {
  if (isLoading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState onRetry={onRetry} />;
  }

  if (notes.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return variant === "list" ? (
    <ArticleResultList notes={notes} sourceHref={sourceHref} />
  ) : (
    <PostGrid notes={notes} sourceHref={sourceHref} />
  );
}

function RecentUpdates({ note, sourceHref }: { note: NoteSummary | null; sourceHref?: string }) {
  if (!note) {
    return (
      <section className="recent-updates" aria-label={"\u6700\u65b0\u6587\u7ae0"}>
        <section className="status-panel compact-status">
          <h2>{"\u6682\u65e0\u6587\u7ae0"}</h2>
          <p>{"\u5199\u4e0b\u7b2c\u4e00\u7bc7 Markdown \u7b14\u8bb0\u540e\uff0c\u8fd9\u91cc\u4f1a\u663e\u793a\u6587\u7ae0\u6458\u8981\u3002"}</p>
        </section>
      </section>
    );
  }

  const displayDate = formatOptionalDate(note.date, note.updated, note.created);

  return (
    <section className="recent-updates" aria-label={"\u6700\u65b0\u6587\u7ae0"}>
      <article className="recent-card">
        <a href={getNoteHref(note.relativePath, sourceHref)}>
          <div className="post-meta">
            <span>{note.collection}</span>
            {displayDate ? (
              <time dateTime={note.date ?? note.updated ?? note.created ?? undefined}>{displayDate}</time>
            ) : null}
          </div>
          <div className="recent-card-main">
            <h3>{note.title}</h3>
            <p>{getHomeExcerpt(note, 132)}</p>
          </div>
          <div className="recent-card-action">
            <span>{"\u9605\u8bfb\u66f4\u591a"}</span>
          </div>
        </a>
      </article>
    </section>
  );
}

function PostGrid({ notes, sourceHref }: { notes: NoteSummary[]; sourceHref?: string }) {
  return (
    <div className="post-grid">
      {notes.map((note) => (
        <article className="post-card" key={note.relativePath}>
          <a className="post-card-link" href={getNoteHref(note.relativePath, sourceHref)}>
            <div className="post-meta">
              <span>{note.collection}</span>
              {formatOptionalDate(note.date, note.updated, note.created) ? (
                <time dateTime={note.date ?? note.updated ?? note.created ?? undefined}>
                  {formatOptionalDate(note.date, note.updated, note.created)}
                </time>
              ) : null}
              {note.draft ? <span className="draft-badge">{"\u8349\u7a3f"}</span> : null}
            </div>
            <h2>{note.title}</h2>
            <p>{getHomeExcerpt(note, 78)}</p>
            <span className="read-more">{"\u9605\u8bfb\u66f4\u591a"}</span>
          </a>
        </article>
      ))}
    </div>
  );
}

function ArticleResultList({ notes, sourceHref }: { notes: NoteSummary[]; sourceHref?: string }) {
  return (
    <div className="result-list">
      {notes.map((note) => {
        const displayDate = formatOptionalDate(note.date, note.updated, note.created);

        return (
          <article className="result-item" key={note.relativePath}>
            <a href={getNoteHref(note.relativePath, sourceHref)}>
              <div className="post-meta">
                <span>{note.collection}</span>
                {displayDate ? <time dateTime={getNoteDateValue(note) ?? undefined}>{displayDate}</time> : null}
              </div>
              <h2>{note.title}</h2>
              <p>{getNoteExcerpt(note)}</p>
              <span className="result-read-more">{"\u9605\u8bfb\u66f4\u591a"}</span>
            </a>
          </article>
        );
      })}
    </div>
  );
}

function Pagination({
  currentPage,
  totalPages,
  getPageHref,
}: {
  currentPage: number;
  totalPages: number;
  getPageHref: (page: number) => string;
}) {
  if (totalPages <= 1) {
    return null;
  }

  const pages = getPaginationItems(currentPage, totalPages);

  return (
    <nav className="pagination" aria-label={"\u5206\u9875"}>
      {currentPage > 1 ? (
        <a className="pagination-prev" href={getPageHref(currentPage - 1)}>
          {"\u2190 \u4e0a\u4e00\u9875"}
        </a>
      ) : null}
      {pages.map((item, index) =>
        item === "ellipsis" ? (
          <span className="pagination-ellipsis" key={"ellipsis-" + index}>
            ...
          </span>
        ) : (
          <a
            className={item === currentPage ? "active" : undefined}
            aria-current={item === currentPage ? "page" : undefined}
            href={getPageHref(item)}
            key={item}
          >
            {item}
          </a>
        ),
      )}
      {currentPage < totalPages ? (
        <a className="pagination-next" href={getPageHref(currentPage + 1)}>
          {"\u4e0b\u4e00\u9875 \u2192"}
        </a>
      ) : null}
    </nav>
  );
}

function getPaginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const sortedPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  const items: Array<number | "ellipsis"> = [];

  for (const page of sortedPages) {
    const previous = items[items.length - 1];
    if (typeof previous === "number" && page - previous > 1) {
      items.push("ellipsis");
    }
    items.push(page);
  }

  return items;
}

function NoteDetailView({ relativePath, notes }: { relativePath: string; notes: NoteSummary[] }) {
  const [note, setNote] = useState<NoteDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const returnTarget = getNoteReturnTarget();

  const loadNote = async (signal?: AbortSignal) => {
    if (!relativePath) {
      setError("\u65e0\u6cd5\u8bfb\u53d6\u8fd9\u7bc7\u7b14\u8bb0");
      setNote(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ path: relativePath });
      const response = await fetch("/api/note?" + params.toString(), {
        headers: { Accept: "application/json" },
        signal,
      });

      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }

      const data = (await response.json()) as RawNoteDetail;
      if (!data || typeof data.body !== "string") {
        throw new Error("Invalid note response");
      }

      setNote(normalizeNoteDetail(data));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }

      console.error("Failed to load local blog note", err);
      setError("\u65e0\u6cd5\u8bfb\u53d6\u8fd9\u7bc7\u7b14\u8bb0");
      setNote(null);
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void loadNote(controller.signal);

    return () => controller.abort();
  }, [relativePath]);

  const tocItems = useMemo(
    () => (note ? extractMarkdownHeadings(note.body, note.title) : []),
    [note],
  );

  useEffect(() => {
    if (tocItems.length === 0) {
      setActiveHeadingId(null);
      return;
    }

    setActiveHeadingId(tocItems[0].id);

    const headings = tocItems
      .map((item) => document.getElementById(item.id))
      .filter((element): element is HTMLElement => Boolean(element));

    if (headings.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visibleEntries[0]?.target.id) {
          setActiveHeadingId(visibleEntries[0].target.id);
        }
      },
      {
        rootMargin: "-96px 0px -62% 0px",
        threshold: [0, 1],
      },
    );

    headings.forEach((heading) => observer.observe(heading));

    return () => observer.disconnect();
  }, [tocItems]);

  const scrollToHeading = (id: string) => {
    const heading = document.getElementById(id);
    if (!heading) {
      return;
    }

    heading.scrollIntoView({ block: "start", behavior: "smooth" });
    setActiveHeadingId(id);
  };

  if (isLoading) {
    return (
      <article className="note-page">
        <a className="back-link" href={returnTarget.href}>
          {returnTarget.label}
        </a>
        <LoadingState title="\u6b63\u5728\u52a0\u8f7d" description="\u6b63\u5728\u8bfb\u53d6\u8fd9\u7bc7 Markdown \u6587\u7ae0\u3002" />
      </article>
    );
  }

  if (error || !note) {
    return (
      <article className="note-page">
        <a className="back-link" href={returnTarget.href}>
          {returnTarget.label}
        </a>
        <ErrorState
          title={"\u65e0\u6cd5\u8bfb\u53d6\u8fd9\u7bc7\u7b14\u8bb0"}
          description="\u8fd9\u7bc7\u7b14\u8bb0\u53ef\u80fd\u4e0d\u5b58\u5728\u3001\u8def\u5f84\u65e0\u6548\uff0c\u6216\u672c\u5730\u535a\u5ba2\u670d\u52a1\u6682\u65f6\u65e0\u6cd5\u8bfb\u53d6\u5b83\u3002"
          onRetry={() => void loadNote()}
        />
      </article>
    );
  }

  const displayDate = formatOptionalDate(note.updated, note.created, note.date);
  const summary = note.summary?.trim() || note.metadata.summary?.trim();
  const currentIndex = notes.findIndex((summaryNote) => summaryNote.relativePath === note.relativePath);
  const previousNote = currentIndex > 0 ? notes[currentIndex - 1] : null;
  const nextNote = currentIndex !== -1 && currentIndex < notes.length - 1 ? notes[currentIndex + 1] : null;

  return (
    <div className="note-reader-shell">
      <main className="note-reader-main">
        <a className="back-link" href={returnTarget.href}>
          {returnTarget.label}
        </a>

        <article className="note-page">
          <header className="note-header">
            <div className="post-meta">
              <a href={getCollectionHref(note.collection)}>{note.collection}</a>
              {displayDate ? <time>{displayDate}</time> : null}
              {note.draft ? <span className="draft-badge">{"\u8349\u7a3f"}</span> : null}
            </div>
            <h1>{note.title}</h1>
            {summary ? <p className="note-summary">{summary}</p> : null}
            {note.tags.length > 0 ? (
              <div className="tag-row" aria-label={note.title + " \u6807\u7b7e"}>
                {note.tags.map((tag) => (
                  <a href={getTagHref(tag)} key={tag}>
                    {tag}
                  </a>
                ))}
              </div>
            ) : null}
          </header>

          <MarkdownRenderer markdown={note.body} />

          {currentIndex !== -1 ? (
            <NoteNavigation previousNote={previousNote} nextNote={nextNote} sourceHref={returnTarget.href} />
          ) : null}
        </article>
      </main>

      <ArticleToc items={tocItems} activeId={activeHeadingId} onSelect={scrollToHeading} />
    </div>
  );
}

function NoteNavigation({
  previousNote,
  nextNote,
  sourceHref,
}: {
  previousNote: NoteSummary | null;
  nextNote: NoteSummary | null;
  sourceHref: string;
}) {
  return (
    <nav className="note-navigation" aria-label={"\u6587\u7ae0\u5bfc\u822a"}>
      <NoteNavigationItem
        label={"\u4e0a\u4e00\u7bc7"}
        note={previousNote}
        emptyLabel={"\u5df2\u7ecf\u662f\u6700\u65b0\u6587\u7ae0"}
        sourceHref={sourceHref}
      />
      <NoteNavigationItem
        label={"\u4e0b\u4e00\u7bc7"}
        note={nextNote}
        emptyLabel={"\u6ca1\u6709\u66f4\u65e9\u6587\u7ae0"}
        align="next"
        sourceHref={sourceHref}
      />
    </nav>
  );
}

function ArticleToc({
  items,
  activeId,
  onSelect,
}: {
  items: MarkdownHeading[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="article-toc" aria-label={"\u6587\u7ae0\u76ee\u5f55"}>
      <div className="article-toc-inner">
        <p className="article-toc-title">{"\u76ee\u5f55"}</p>
        {items.length > 0 ? (
          <nav>
            {items.map((item) => (
              <button
                type="button"
                className={"article-toc-link article-toc-level-" + item.level + (activeId === item.id ? " article-toc-link-active" : "")}
                key={item.id}
                onClick={() => onSelect(item.id)}
              >
                {item.text}
              </button>
            ))}
          </nav>
        ) : (
          <p className="article-toc-empty">{"\u6682\u65e0\u76ee\u5f55"}</p>
        )}
      </div>
    </aside>
  );
}

function NoteNavigationItem({
  label,
  note,
  emptyLabel,
  sourceHref,
  align = "previous",
}: {
  label: string;
  note: NoteSummary | null;
  emptyLabel: string;
  sourceHref: string;
  align?: "previous" | "next";
}) {
  const className = "note-nav-card note-nav-" + align + (note ? "" : " note-nav-card-disabled");

  if (!note) {
    return (
      <div className={className} aria-disabled="true">
        <span className="note-nav-label">{label}</span>
        <p>{emptyLabel}</p>
      </div>
    );
  }

  const displayDate = formatOptionalDate(note.date, note.updated, note.created);

  return (
    <a className={className} href={getNoteHref(note.relativePath, sourceHref)}>
      <span className="note-nav-label">{label}</span>
      <h2>{note.title}</h2>
      <div className="note-nav-meta">
        <span>{note.collection}</span>
        {displayDate ? <time dateTime={note.date ?? note.updated ?? note.created ?? undefined}>{displayDate}</time> : null}
      </div>
    </a>
  );
}

function LoadingState({
  title = "\u6b63\u5728\u52a0\u8f7d",
  description = "\u6b63\u5728\u4ece\u672c\u5730\u535a\u5ba2\u670d\u52a1\u8bfb\u53d6\u6587\u7ae0\u5217\u8868\u3002",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <section className="status-panel" aria-live="polite">
      <p className="eyebrow">{"\u6b63\u5728\u52a0\u8f7d"}</p>
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  );
}

function ErrorState({
  title = "\u65e0\u6cd5\u8bfb\u53d6\u672c\u5730\u7b14\u8bb0",
  description = "\u8bf7\u786e\u8ba4\u672c\u5730\u535a\u5ba2\u670d\u52a1\u6b63\u5728\u8fd0\u884c\uff0c\u7136\u540e\u91cd\u65b0\u5c1d\u8bd5\u8bfb\u53d6\u6587\u7ae0\u5217\u8868\u3002",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry: () => void;
}) {
  return (
    <section className="status-panel status-panel-error" role="alert">
      <p className="eyebrow">{"\u52a0\u8f7d\u5931\u8d25"}</p>
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="status-actions">
        <a href="#/">{"\u8fd4\u56de\u9996\u9875"}</a>
        <button type="button" onClick={onRetry}>
          {"\u91cd\u8bd5"}
        </button>
      </div>
    </section>
  );
}

function EmptyState({
  title = "\u8fd8\u6ca1\u6709\u53ef\u5c55\u793a\u7684\u7b14\u8bb0",
  description = "\u56de\u5230\u684c\u9762\u7aef\u5199\u4e0b\u7b2c\u4e00\u7bc7 Markdown \u7b14\u8bb0\uff0c\u4fdd\u5b58\u540e\u5237\u65b0\u8fd9\u91cc\u5c31\u80fd\u770b\u5230\u6587\u7ae0\u6458\u8981\u6d41\u3002",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <section className="status-panel">
      <p className="eyebrow">{"\u6682\u65e0\u6587\u7ae0"}</p>
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  );
}
