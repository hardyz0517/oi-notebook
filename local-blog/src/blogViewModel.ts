import {
  countTagTreeNodes,
  formatArchiveDay,
  formatCompactDate,
  formatOptionalDate,
  getCategoryLabel,
  getCollectionDescription,
  getDisplayTags,
  getHomeExcerpt,
  getLeafTagName,
  getNoteYear,
  getNoteDateValue,
  getNoteExcerpt,
  getRawNoteTagReason,
  getUnknownTags,
  groupNotesByYear,
  paginateNotes,
  searchNotes,
  sortNotesByRecent,
  type CollectionGroup,
  type NoteDetail,
  type NoteSummary,
  type RawNoteSummary,
} from "./blogContent";
import { getCollectionHref, getNoteHref, getTagHref } from "./blogRoutes";
import {
  findTagTreeNode,
  getTagPathSegments,
  getTagSuggestionList,
  matchArticleByTagPath,
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

export type TagMapState = "loading" | "error" | "empty" | "no-results" | "ready";

export type TagMapView = {
  state: TagMapState;
  groups: TagMapGroupView[];
};

export type TagMapViewInput = {
  tagTree: TagTreeNode[];
  query: string;
  isLoading: boolean;
  error: string | null;
};

export type TagDetailHeaderSegmentView = {
  key: string;
  label: string;
  href: string;
  showSeparator: boolean;
};

export type TagDetailHeaderView = {
  segments: TagDetailHeaderSegmentView[];
  countLabel: string;
};

export type TagDetailHeaderViewInput = {
  tag: string;
  count: number;
};

export type TagDetailRouteView = {
  filteredNotes: NoteSummary[];
  paged: {
    items: NoteSummary[];
    currentPage: number;
    totalPages: number;
  };
  relatedTags: TagChipItem[];
  count: number;
};

export type TagDetailRouteViewInput = {
  notes: NoteSummary[];
  tagTree: TagTreeNode[];
  tag: string;
  page: number;
  pageSize: number;
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

export type CollectionDetailHeaderView = {
  collection: string;
  countLabel: string;
  updatedLabel: string;
  description: string;
};

export type CollectionDetailHeaderViewInput = {
  collection: string;
  count: number;
  latestUpdatedAt?: string;
};

export type CollectionDetailRouteView = {
  collection: string;
  collectionGroup: CollectionGroup | undefined;
  filteredNotes: NoteSummary[];
  paged: {
    items: NoteSummary[];
    currentPage: number;
    totalPages: number;
  };
  count: number;
  latestUpdatedAt?: string;
  entriesState: "loading" | "error" | "empty" | "ready";
};

export type CollectionDetailRouteViewInput = {
  notes: NoteSummary[];
  collections: CollectionGroup[];
  collection: string;
  page: number;
  pageSize: number;
  isLoading?: boolean;
  error?: string | null;
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

export type PostResultsState = "loading" | "error" | "empty" | "ready";

export type PostResultsView = {
  state: PostResultsState;
  notes: NoteSummary[];
};

export type PostResultsViewInput = {
  notes: NoteSummary[];
  isLoading: boolean;
  error: string | null;
};

export type NoteListViewInput = {
  notes: NoteSummary[];
  sourceHref?: string;
};

export type SearchRouteView = {
  results: NoteSummary[];
  paged: {
    items: NoteSummary[];
    currentPage: number;
    totalPages: number;
  };
  sourceHref: string;
  resultCountLabel: string;
  emptyTitle: string;
  emptyDescription: string;
};

export type SearchRouteViewInput = {
  notes: NoteSummary[];
  query: string;
  page: number;
  pageSize: number;
  getSearchHref: (query: string, page: number) => string;
};

export type ArchiveNoteGroup = {
  year: string;
  notes: NoteSummary[];
};

export type ArticleArchiveRouteView = {
  paged: {
    items: NoteSummary[];
    currentPage: number;
    totalPages: number;
  };
  yearGroups: ArchiveNoteGroup[];
  archiveIndex: ArchiveIndexView;
  isEmpty: boolean;
  entriesState: "loading" | "error" | "empty" | "ready";
};

export type ArticleArchiveRouteViewInput = {
  notes: NoteSummary[];
  page: number;
  pageSize: number;
  getYearHref: (page: number, year: string) => string;
  isLoading?: boolean;
  error?: string | null;
};

export type HomeRouteView = {
  latestNote: RecentUpdateView | null;
  paged: {
    items: NoteSummary[];
    currentPage: number;
    totalPages: number;
  };
};

export type HomeRouteViewInput = {
  notes: NoteSummary[];
  page: number;
  pageSize: number;
  sourceHref?: string;
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

export type ArchiveIndexYearLink = {
  year: string;
  href: string;
};

export type ArchiveIndexView = {
  years: ArchiveIndexYearLink[];
  yearCounts: Map<string, number>;
};

export type ArchiveIndexViewInput = {
  notes: NoteSummary[];
  pageSize: number;
  getYearHref: (page: number, year: string) => string;
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

export type NoteNavigationCardView = {
  className: string;
  isDisabled: boolean;
  label: string;
  emptyLabel: string;
  item: NoteNavigationItemView | null;
};

export type NoteNavigationCardViewInput = {
  label: string;
  note: NoteSummary | null;
  emptyLabel: string;
  sourceHref: string;
  align?: "previous" | "next";
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

export type NoteDetailRouteView = {
  collectionHref: string;
  displayDate: string | null;
  summary: string | null;
  tags: TagChipItem[];
  isDraft: boolean;
  previousNote: NoteSummary | null;
  nextNote: NoteSummary | null;
  hasNavigation: boolean;
};

export type NoteDetailRouteViewInput = {
  note: NoteDetail;
  notes: NoteSummary[];
  sourceHref: string;
};

export type SiteNavView = {
  activeName: "home" | "articles" | "tags" | "collections" | "search";
};

export type SiteNavViewInput = Route;

export type ArticleTocViewItem = {
  id: string;
  text: string;
  levelClassName: string;
  isActive: boolean;
};

export type ArticleTocViewInput = {
  items: MarkdownHeading[];
  activeId: string | null;
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

export function buildTagMapView(input: TagMapViewInput): TagMapView {
  if (input.isLoading) {
    return { state: "loading", groups: [] };
  }

  if (input.error) {
    return { state: "error", groups: [] };
  }

  if (input.tagTree.length === 0) {
    return { state: "empty", groups: [] };
  }

  const groups = buildVisibleTagMapGroups(input.tagTree, input.query);

  return {
    state: groups.length > 0 ? "ready" : "no-results",
    groups,
  };
}

export function buildTagDetailHeaderView(input: TagDetailHeaderViewInput): TagDetailHeaderView {
  const segments = getTagPathSegments(input.tag);

  return {
    segments: segments.map((segment, index) => {
      const key = segments.slice(0, index + 1).join(tagPathSeparator);

      return {
        key,
        label: segment,
        href: getTagHref(key),
        showSeparator: index > 0,
      };
    }),
    countLabel: "共 " + input.count + " 篇文章",
  };
}

export function buildTagDetailRouteView(input: TagDetailRouteViewInput): TagDetailRouteView {
  const tagNode = findTagTreeNode(input.tagTree, input.tag);
  const includeDescendants = Boolean(tagNode?.children.length);
  const filteredNotes = input.notes.filter((note) => matchArticleByTagPath(note, input.tag, includeDescendants));

  return {
    filteredNotes,
    paged: paginateNotes(filteredNotes, input.page, input.pageSize),
    relatedTags: tagNode ? collectRelatedTagChips(tagNode) : [],
    count: filteredNotes.length,
  };
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

export function buildCollectionDetailHeaderView(input: CollectionDetailHeaderViewInput): CollectionDetailHeaderView {
  return {
    collection: input.collection,
    countLabel: input.count + " 篇文章",
    updatedLabel: "最近更新 " + (formatCompactDate(input.latestUpdatedAt) ?? "暂无记录"),
    description: getCollectionDescription(input.collection),
  };
}

export function buildCollectionDetailRouteView(input: CollectionDetailRouteViewInput): CollectionDetailRouteView {
  const collection = getCategoryLabel(input.collection);
  const collectionGroup = input.collections.find((item) => item.name === collection);
  const filteredNotes = sortNotesByRecent(input.notes.filter((note) => note.collections.includes(collection)));
  const paged = paginateNotes(filteredNotes, input.page, input.pageSize);
  const entriesState = input.isLoading
    ? "loading"
    : input.error
      ? "error"
      : paged.items.length === 0
        ? "empty"
        : "ready";

  return {
    collection,
    collectionGroup,
    filteredNotes,
    paged,
    count: filteredNotes.length,
    latestUpdatedAt: collectionGroup?.latestUpdatedAt,
    entriesState,
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

export function buildPostResultsView(input: PostResultsViewInput): PostResultsView {
  if (input.isLoading) {
    return { state: "loading", notes: [] };
  }

  if (input.error) {
    return { state: "error", notes: [] };
  }

  if (input.notes.length === 0) {
    return { state: "empty", notes: [] };
  }

  return {
    state: "ready",
    notes: input.notes,
  };
}

export function buildSearchRouteView(input: SearchRouteViewInput): SearchRouteView {
  const results = input.query ? searchNotes(input.notes, input.query) : [];
  const paged = paginateNotes(results, input.page, input.pageSize);

  return {
    results,
    paged,
    sourceHref: input.getSearchHref(input.query, paged.currentPage),
    resultCountLabel: input.query ? "找到 " + results.length + " 篇相关文章" : "输入关键词开始搜索",
    emptyTitle: input.query ? "没有找到相关文章" : "还没有输入搜索词",
    emptyDescription: input.query
      ? "换一个标题、标签、文集或摘要里的关键词再试试。"
      : "可以搜索中文标题、标签、摘要、文集名或相对路径。",
  };
}

export function buildArticleArchiveRouteView(input: ArticleArchiveRouteViewInput): ArticleArchiveRouteView {
  const paged = paginateNotes(input.notes, input.page, input.pageSize);
  const isEmpty = input.notes.length === 0;
  const entriesState = input.isLoading
    ? "loading"
    : input.error
      ? "error"
      : isEmpty
        ? "empty"
        : "ready";

  return {
    paged,
    yearGroups: groupNotesByYear(paged.items),
    archiveIndex: buildArchiveIndexView({
      notes: input.notes,
      pageSize: input.pageSize,
      getYearHref: input.getYearHref,
    }),
    isEmpty,
    entriesState,
  };
}

export function buildHomeRouteView(input: HomeRouteViewInput): HomeRouteView {
  const latestNote = buildRecentUpdateView({
    note: input.notes[0] ?? null,
    sourceHref: input.sourceHref,
  });
  const paged = paginateNotes(input.notes.slice(1), input.page, input.pageSize);

  return {
    latestNote,
    paged,
  };
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

export function buildArchiveIndexView(input: ArchiveIndexViewInput): ArchiveIndexView {
  const yearCounts = new Map<string, number>();
  const yearPageLookup = new Map<string, number>();

  input.notes.forEach((note, index) => {
    const year = getNoteYear(note);
    yearCounts.set(year, (yearCounts.get(year) ?? 0) + 1);
    if (!yearPageLookup.has(year)) {
      yearPageLookup.set(year, Math.floor(index / input.pageSize) + 1);
    }
  });

  return {
    years: Array.from(yearCounts.keys()).map((year) => ({
      year,
      href: input.getYearHref(yearPageLookup.get(year) ?? 1, year),
    })),
    yearCounts,
  };
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

export function buildNoteNavigationCardView(input: NoteNavigationCardViewInput): NoteNavigationCardView {
  const className = "note-nav-card note-nav-" + (input.align ?? "previous") + (input.note ? "" : " note-nav-card-disabled");
  return {
    className,
    isDisabled: !input.note,
    label: input.label,
    emptyLabel: input.emptyLabel,
    item: buildNoteNavigationItemView({ note: input.note, sourceHref: input.sourceHref }),
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

export function buildNoteDetailRouteView(input: NoteDetailRouteViewInput): NoteDetailRouteView {
  const header = buildNoteDetailHeaderView({
    note: input.note,
    notes: input.notes,
  });

  return {
    collectionHref: getCollectionHref(input.note.collection),
    displayDate: header.displayDate,
    summary: header.summary,
    tags: input.note.tags.map((tag) => ({
      label: tag,
      fullPath: tag,
      count: 0,
    })),
    isDraft: input.note.draft,
    previousNote: header.previousNote,
    nextNote: header.nextNote,
    hasNavigation: header.hasNavigation,
  };
}

export function buildSiteNavView(route: SiteNavViewInput): SiteNavView {
  const activeName =
    route.name === "note" || route.name === "articles"
      ? "articles"
      : route.name === "tag"
        ? "tags"
        : route.name === "collection"
          ? "collections"
          : route.name;

  return { activeName };
}

export function buildArticleTocView(input: ArticleTocViewInput): ArticleTocViewItem[] {
  return input.items.map((item) => ({
    id: item.id,
    text: item.text,
    levelClassName:
      "article-toc-link article-toc-level-" + item.level + (input.activeId === item.id ? " article-toc-link-active" : ""),
    isActive: input.activeId === item.id,
  }));
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
