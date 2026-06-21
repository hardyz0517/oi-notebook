import {
  countTagTreeNodes,
  formatArchiveDay,
  formatCompactDate,
  formatOptionalDate,
  getCollectionDescription,
  getDisplayTags,
  getHomeExcerpt,
  getLeafTagName,
  getNoteDateValue,
  getNoteExcerpt,
  getRawNoteTagReason,
  getUnknownTags,
  type CollectionGroup,
  type NoteDetail,
  type NoteSummary,
  type RawNoteSummary,
} from "./blogContent";
import { getNoteHref } from "./blogRoutes";
import {
  getTagPathSegments,
  getTagSuggestionList,
  tagPathSeparator,
  type TagTreeNode,
} from "./tagTaxonomy";

export type TagChipItem = {
  label: string;
  fullPath: string;
  count: number;
};

export type PaginationItem = number | "ellipsis";

export type PaginationPageLink = {
  kind: "page";
  page: number;
  href: string;
  isCurrent: boolean;
};

export type PaginationEllipsis = {
  kind: "ellipsis";
  key: string;
};

export type PaginationViewItem = PaginationPageLink | PaginationEllipsis;

export type PaginationView = {
  previousHref: string | null;
  nextHref: string | null;
  items: PaginationViewItem[];
};

export type PaginationViewInput = {
  currentPage: number;
  totalPages: number;
  getPageHref: (page: number) => string;
};

export type TagDiagnosticsEnvironment = {
  isDev?: boolean;
  routeDebugTag?: string | null;
  searchDebugTag?: string | null;
  localStorageDebugTag?: string | null;
};

export type TagDiagnosticRawRow = {
  title: string;
  path: string;
  tags: unknown;
  metadataTags: unknown;
  frontmatterTags: unknown;
  draft: boolean;
};

export type TagDiagnosticNormalizedRow = {
  title: string;
  path: string;
  tags: string[];
  draft: boolean;
};

export type TagDiagnosticFailureRow = {
  title: string;
  path: string;
  reason: string;
};

export type TagDiagnostics = {
  returnedNotesCount: number;
  rawFirstNoteKeys: string[];
  rawRows: TagDiagnosticRawRow[];
  normalizedRows: TagDiagnosticNormalizedRow[];
  normalizedTagTotal: number;
  tagTreeRootCount: number;
  tagTreeNodeCount: number;
  rawTagFailureRows: TagDiagnosticFailureRow[];
};

export type TagMapBranchView = {
  node: TagTreeNode;
  chips: TagChipItem[];
};

export type TagMapGroupView = {
  group: TagTreeNode;
  directChips: TagChipItem[];
  branches: TagMapBranchView[];
};

export type CollectionOverviewState = "loading" | "error" | "empty" | "ready";

export type CollectionOverviewCard = {
  name: string;
  countLabel: string;
  description: string;
  updatedLabel: string;
};

export type CollectionOverviewView = {
  state: CollectionOverviewState;
  cards: CollectionOverviewCard[];
};

export type CollectionOverviewViewInput = {
  collections: CollectionGroup[];
  isLoading: boolean;
  error: string | null;
};

export type CollectionEntryListItem = {
  key: string;
  href: string;
  number: string;
  title: string;
  isDraft: boolean;
  excerpt: string;
  dateLabel: string;
  dateTime: string | null;
  tags: string[];
};

export type CollectionEntryListViewInput = {
  notes: NoteSummary[];
  collection: string;
  sourceHref?: string;
  startIndex: number;
};

export type PostCardListItem = {
  key: string;
  href: string;
  collection: string;
  title: string;
  excerpt: string;
  dateLabel: string | null;
  dateTime: string | null;
  isDraft: boolean;
};

export type ArticleResultListItem = {
  key: string;
  href: string;
  collection: string;
  title: string;
  excerpt: string;
  dateLabel: string | null;
  dateTime: string | null;
};

export type NoteListViewInput = {
  notes: NoteSummary[];
  sourceHref?: string;
};

export type ArchiveNoteGroup = {
  year: string;
  notes: NoteSummary[];
};

export type ArchiveListRow = {
  key: string;
  href: string;
  title: string;
  collection: string;
  dateLabel: string;
  dateTime: string | null;
};

export type ArchiveListSection = {
  id: string;
  year: string;
  count: number;
  rows: ArchiveListRow[];
};

export type ArchiveListViewInput = {
  groups: ArchiveNoteGroup[];
  yearCounts: Map<string, number>;
  sourceHref: string;
};

export type RecentUpdateView = {
  href: string;
  collection: string;
  title: string;
  excerpt: string;
  dateLabel: string | null;
  dateTime: string | null;
};

export type RecentUpdateViewInput = {
  note: NoteSummary | null;
  sourceHref?: string;
};

export type NoteNavigationItemView = {
  href: string;
  title: string;
  collection: string;
  dateLabel: string | null;
  dateTime: string | null;
};

export type NoteNavigationItemViewInput = {
  note: NoteSummary | null;
  sourceHref: string;
};

export type NoteDetailHeaderView = {
  displayDate: string | null;
  summary: string | null;
  previousNote: NoteSummary | null;
  nextNote: NoteSummary | null;
  hasNavigation: boolean;
};

export type NoteDetailHeaderViewInput = {
  note: NoteDetail;
  notes: NoteSummary[];
};

const tagSuggestionSearchByPath = new Map(
  getTagSuggestionList().map((item) => [item.pathText, item.searchText]),
);

export function getTagChipLabel(node: TagTreeNode) {
  if (node.depth <= 3) {
    return node.name;
  }

  const segments = getTagPathSegments(node.fullPath);
  return segments.slice(2).join(` ${tagPathSeparator} `);
}

export function collectTagChips(node: TagTreeNode): TagChipItem[] {
  return [
    {
      label: getTagChipLabel(node),
      fullPath: node.fullPath,
      count: node.count,
    },
    ...node.children.flatMap(collectTagChips),
  ];
}

export function collectRelatedTagChips(node: TagTreeNode): TagChipItem[] {
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

export function normalizeTagSearchText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
}

export function normalizeCompactTagSearchText(value: string) {
  return normalizeTagSearchText(value).replace(/\s+/g, "");
}

export function getTagChipSearchText(item: TagChipItem) {
  return [
    item.label,
    item.fullPath,
    tagSuggestionSearchByPath.get(item.fullPath) ?? "",
  ].join(" ");
}

export function matchesTagChipSearch(item: TagChipItem, query: string) {
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

export function buildVisibleTagMapGroups(tagTree: TagTreeNode[], query: string): TagMapGroupView[] {
  const trimmedQuery = query.trim();

  return tagTree
    .map((group) => {
      const directChips = group.children
        .filter((child) => child.children.length === 0)
        .map((child) => ({
          label: child.name,
          fullPath: child.fullPath,
          count: child.count,
        }))
        .filter((item) => matchesTagChipSearch(item, trimmedQuery));
      const branches = group.children
        .filter((child) => child.children.length > 0)
        .map((child) => ({
          node: child,
          chips: child.children
            .flatMap(collectTagChips)
            .filter((item) => matchesTagChipSearch(item, trimmedQuery)),
        }))
        .filter((branch) => branch.chips.length > 0);

      return { group, directChips, branches };
    })
    .filter((group) => group.directChips.length > 0 || group.branches.length > 0);
}

export function getPaginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const sortedPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  const items: PaginationItem[] = [];

  for (const page of sortedPages) {
    const previous = items[items.length - 1];
    if (typeof previous === "number" && page - previous > 1) {
      items.push("ellipsis");
    }
    items.push(page);
  }

  return items;
}

export function buildPaginationView(input: PaginationViewInput): PaginationView | null {
  if (input.totalPages <= 1) {
    return null;
  }

  return {
    previousHref: input.currentPage > 1 ? input.getPageHref(input.currentPage - 1) : null,
    nextHref: input.currentPage < input.totalPages ? input.getPageHref(input.currentPage + 1) : null,
    items: getPaginationItems(input.currentPage, input.totalPages).map((item, index) => (
      item === "ellipsis"
        ? { kind: "ellipsis", key: "ellipsis-" + index }
        : {
            kind: "page",
            page: item,
            href: input.getPageHref(item),
            isCurrent: item === input.currentPage,
          }
    )),
  };
}

export function buildCollectionOverviewView(input: CollectionOverviewViewInput): CollectionOverviewView {
  if (input.isLoading) {
    return { state: "loading", cards: [] };
  }

  if (input.error) {
    return { state: "error", cards: [] };
  }

  if (input.collections.length === 0) {
    return { state: "empty", cards: [] };
  }

  return {
    state: "ready",
    cards: input.collections.map((collection) => ({
      name: collection.name,
      countLabel: `${collection.count} 篇文章`,
      description: getCollectionDescription(collection.name),
      updatedLabel: `最近更新：${formatCompactDate(collection.latestUpdatedAt) ?? "暂无记录"}`,
    })),
  };
}

export function buildCollectionEntryListView(input: CollectionEntryListViewInput): CollectionEntryListItem[] {
  return input.notes.map((note, index) => {
    const dateLabel = formatOptionalDate(note.date, note.updated, note.created);

    return {
      key: note.relativePath,
      href: getNoteHref(note.relativePath, input.sourceHref),
      number: String(input.startIndex + index + 1).padStart(2, "0"),
      title: note.title,
      isDraft: note.draft,
      excerpt: getNoteExcerpt(note),
      dateLabel: dateLabel ?? "日期未知",
      dateTime: getNoteDateValue(note),
      tags: [
        input.collection,
        ...getDisplayTags(note).slice(0, 2).map(getLeafTagName),
      ],
    };
  });
}

export function buildPostCardListView(input: NoteListViewInput): PostCardListItem[] {
  return input.notes.map((note) => ({
    key: note.relativePath,
    href: getNoteHref(note.relativePath, input.sourceHref),
    collection: note.collection,
    title: note.title,
    excerpt: getHomeExcerpt(note, 78),
    dateLabel: formatOptionalDate(note.date, note.updated, note.created),
    dateTime: getNoteDateValue(note),
    isDraft: note.draft,
  }));
}

export function buildArticleResultListView(input: NoteListViewInput): ArticleResultListItem[] {
  return input.notes.map((note) => ({
    key: note.relativePath,
    href: getNoteHref(note.relativePath, input.sourceHref),
    collection: note.collection,
    title: note.title,
    excerpt: getNoteExcerpt(note),
    dateLabel: formatOptionalDate(note.date, note.updated, note.created),
    dateTime: getNoteDateValue(note),
  }));
}

export function buildArchiveListView(input: ArchiveListViewInput): ArchiveListSection[] {
  return input.groups.map((group) => ({
    id: "year-" + group.year,
    year: group.year,
    count: input.yearCounts.get(group.year) ?? group.notes.length,
    rows: group.notes.map((note) => ({
      key: note.relativePath,
      href: getNoteHref(note.relativePath, input.sourceHref),
      title: note.title,
      collection: note.collection,
      dateLabel: formatArchiveDay(note),
      dateTime: getNoteDateValue(note),
    })),
  }));
}

export function buildRecentUpdateView(input: RecentUpdateViewInput): RecentUpdateView | null {
  if (!input.note) {
    return null;
  }

  return {
    href: getNoteHref(input.note.relativePath, input.sourceHref),
    collection: input.note.collection,
    title: input.note.title,
    excerpt: getHomeExcerpt(input.note, 132),
    dateLabel: formatOptionalDate(input.note.date, input.note.updated, input.note.created),
    dateTime: getNoteDateValue(input.note),
  };
}

export function buildNoteNavigationItemView(input: NoteNavigationItemViewInput): NoteNavigationItemView | null {
  if (!input.note) {
    return null;
  }

  return {
    href: getNoteHref(input.note.relativePath, input.sourceHref),
    title: input.note.title,
    collection: input.note.collection,
    dateLabel: formatOptionalDate(input.note.date, input.note.updated, input.note.created),
    dateTime: getNoteDateValue(input.note),
  };
}

export function buildNoteDetailHeaderView(input: NoteDetailHeaderViewInput): NoteDetailHeaderView {
  const currentIndex = input.notes.findIndex((summaryNote) => summaryNote.relativePath === input.note.relativePath);

  return {
    displayDate: formatOptionalDate(input.note.updated, input.note.created, input.note.date),
    summary: input.note.summary?.trim() || input.note.metadata.summary?.trim() || null,
    previousNote: currentIndex > 0 ? input.notes[currentIndex - 1] : null,
    nextNote: currentIndex !== -1 && currentIndex < input.notes.length - 1 ? input.notes[currentIndex + 1] : null,
    hasNavigation: currentIndex !== -1,
  };
}

export function isTagDiagnosticsEnabled(environment: TagDiagnosticsEnvironment) {
  return (
    environment.isDev === true ||
    environment.routeDebugTag === "1" ||
    environment.searchDebugTag === "1" ||
    environment.localStorageDebugTag === "1"
  );
}

export function buildTagDiagnostics(
  rawNotes: RawNoteSummary[],
  normalizedNotes: NoteSummary[],
  tagTree: TagTreeNode[],
): TagDiagnostics {
  const normalizedTagTotal = normalizedNotes.reduce((count, note) => count + note.tags.length, 0);
  const shouldIncludeFailureRows = rawNotes.length > 0 && normalizedTagTotal === 0 && tagTree.length === 0;

  return {
    returnedNotesCount: rawNotes.length,
    rawFirstNoteKeys: rawNotes[0] ? Object.keys(rawNotes[0]) : [],
    rawRows: rawNotes.slice(0, 5).map((note) => ({
      title: note.title,
      path: note.relativePath,
      tags: getUnknownTags(note.tags),
      metadataTags: getUnknownTags(note.metadata?.tags),
      frontmatterTags: getUnknownTags((note as { frontmatter?: { tags?: unknown } }).frontmatter?.tags),
      draft: note.draft,
    })),
    normalizedRows: normalizedNotes.slice(0, 5).map((note) => ({
      title: note.title,
      path: note.relativePath,
      tags: note.tags,
      draft: note.draft,
    })),
    normalizedTagTotal,
    tagTreeRootCount: tagTree.length,
    tagTreeNodeCount: countTagTreeNodes(tagTree),
    rawTagFailureRows: shouldIncludeFailureRows
      ? rawNotes.slice(0, 5).map((note) => ({
          title: note.title,
          path: note.relativePath,
          reason: getRawNoteTagReason(note),
        }))
      : [],
  };
}
