import {
  buildTagTree,
  flattenTagTree,
  getArticleTagSearchTerms,
  type TagTreeNode,
} from "./tagTaxonomy";

export type NoteSummary = {
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

export type NoteMetadata = {
  title?: string | null;
  summary?: string | null;
  tags?: unknown;
  category?: string | null;
  collection?: unknown;
  created?: string | null;
  updated?: string | null;
  draft?: boolean;
};

export type ParsedFrontmatter = {
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

export type NoteDetail = {
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

export type RawNoteSummary = Omit<NoteSummary, "tags" | "collection" | "collections"> & {
  tags?: unknown;
  collection?: unknown;
  collections?: unknown;
  metadata?: NoteMetadata | null;
};

export type RawNoteDetail = Omit<NoteDetail, "tags" | "collection" | "collections" | "metadata"> & {
  tags?: unknown;
  collection?: unknown;
  collections?: unknown;
  metadata?: NoteMetadata | null;
};

export type BlogConfig = {
  title: string;
  subtitle: string;
};

export type CountItem = {
  name: string;
  count: number;
};

export type CollectionGroup = {
  name: string;
  posts: NoteSummary[];
  count: number;
  latestUpdatedAt?: string;
};

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

export const defaultBlogConfig: BlogConfig = {
  title: "OI Notebook",
  subtitle: "\u4e00\u672c\u672c\u5730\u7b97\u6cd5\u7b14\u8bb0\u4e0e\u9898\u89e3\u535a\u5ba2",
};

const articleClassWords = ["\u9898\u89e3", "\u590d\u76d8", "\u5fc3\u5f97", "\u6280\u5de7", "\u6a21\u677f", "\u6742\u8c08"] as const;
const summaryFallback = "\u8fd9\u7bc7\u7b14\u8bb0\u8fd8\u6ca1\u6709\u6458\u8981\uff0c\u6253\u5f00\u6587\u7ae0\u9875\u53ef\u4ee5\u7ee7\u7eed\u9605\u8bfb\u5168\u6587\u3002";

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

export function getCategoryLabel(category: string) {
  return categoryLabels[category] ?? category;
}

export function trimYamlValue(value: string) {
  return value
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .trim();
}

export function parseTagsValue(value: string) {
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

export function parseFrontmatterYaml(yaml: string): ParsedFrontmatter {
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

export function splitFrontmatter(value: string | null | undefined) {
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

export function createCleanSummary(...values: Array<string | null | undefined>) {
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

export function normalizeTagInput(value: unknown): string[] {
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

export function getDisplayTags(post: { tags?: unknown }) {
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

export function getUnknownTags(value: unknown) {
  if (Array.isArray(value)) {
    return value;
  }
  return value ?? null;
}

export function getRawNoteTagReason(note: RawNoteSummary) {
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

export function countTagTreeNodes(nodes: TagTreeNode[]) {
  let count = 0;
  for (const node of nodes) {
    count += 1 + countTagTreeNodes(node.children);
  }
  return count;
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

export function getCollectionDescription(collection: string) {
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

export function normalizeNoteSummary(note: RawNoteSummary): NoteSummary {
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

export function normalizeNoteDetail(note: RawNoteDetail): NoteDetail {
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

export function formatDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${date.getFullYear()} \u5e74 ${date.getMonth() + 1} \u6708 ${date.getDate()} \u65e5`;
}

export function formatCompactDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

export function formatOptionalDate(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const formatted = formatDate(value ?? null);
    if (formatted) {
      return formatted;
    }
  }

  return null;
}

export function getNoteDateValue(note: NoteSummary) {
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

export function getNoteYear(note: NoteSummary) {
  return getNoteDate(note)?.getFullYear().toString() ?? "\u672a\u77e5\u5e74\u4efd";
}

export function formatArchiveDay(note: NoteSummary) {
  const date = getNoteDate(note);
  if (!date) {
    return "\u65e5\u671f\u672a\u77e5";
  }

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return month + " \u6708 " + day + " \u65e5";
}

export function getNoteExcerpt(note: NoteSummary) {
  return createCleanSummary(note.summary, note.excerpt);
}

export function getShortNoteExcerpt(note: NoteSummary) {
  const excerpt = getNoteExcerpt(note);
  return excerpt.length > 64 ? excerpt.slice(0, 64) + " [...]" : excerpt;
}

export function getLeafTagName(tagName: string) {
  const parts = tagName
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : tagName;
}

export function getHomeExcerpt(note: NoteSummary, maxLength: number) {
  return createCleanSummaryWithLimit(maxLength, note.summary, note.excerpt);
}

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN");
}

export function getTagCounts(notes: NoteSummary[]) {
  return flattenTagTree(buildTagTree(notes));
}

export function getCategoryCounts(notes: NoteSummary[]) {
  const counts = new Map<string, number>();

  for (const note of notes) {
    const category = note.articleClass?.trim() || "\u672a\u5206\u7c7b";
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return Array.from(counts, ([name, count]) => ({ name, count })).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"),
  );
}

export function buildCollections(posts: NoteSummary[]): CollectionGroup[] {
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

export function searchNotes(notes: NoteSummary[], query: string) {
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

export function paginateNotes(notes: NoteSummary[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(notes.length / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const start = (currentPage - 1) * pageSize;

  return {
    currentPage,
    totalPages,
    items: notes.slice(start, start + pageSize),
  };
}

export function groupNotesByYear(notes: NoteSummary[]) {
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

export function sortNotesByRecent(notes: NoteSummary[]) {
  return notes
    .map((note, index) => ({ note, index, date: getNoteDate(note)?.getTime() ?? 0 }))
    .sort((a, b) => b.date - a.date || a.index - b.index)
    .map((item) => item.note);
}

export function normalizeBlogConfig(value: Partial<BlogConfig> | null | undefined): BlogConfig {
  const title = typeof value?.title === "string" ? value.title.trim() : "";
  const subtitle = typeof value?.subtitle === "string" ? value.subtitle.trim() : "";

  return {
    title: title || defaultBlogConfig.title,
    subtitle: subtitle || defaultBlogConfig.subtitle,
  };
}
