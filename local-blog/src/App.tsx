import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { extractMarkdownHeadings, MarkdownRenderer, type MarkdownHeading } from "./MarkdownRenderer";
import {
  getArticlesHref,
  getCollectionHref,
  getHashParams,
  getHomeHref,
  getNoteReturnTargetFromHash,
  getRouteFromHash,
  getRouteReturnHref,
  getSearchHref,
  getTagHref,
  type ReturnTarget,
  type Route,
} from "./blogRoutes";
import {
  buildCollections as buildBlogCollections,
  defaultBlogConfig as blogDefaultConfig,
  formatCompactDate as formatBlogCompactDate,
  getCategoryCounts as getBlogCategoryCounts,
  getCategoryLabel,
  getCollectionDescription as getBlogCollectionDescription,
  getNoteYear,
  getShortNoteExcerpt as getBlogShortNoteExcerpt,
  getTagCounts as getBlogTagCounts,
  groupNotesByYear as groupBlogNotesByYear,
  normalizeBlogConfig as normalizeBlogConfigDraft,
  normalizeNoteDetail as normalizeBlogNoteDetail,
  normalizeNoteSummary as normalizeBlogNoteSummary,
  paginateNotes as paginateBlogNotes,
  searchNotes as searchBlogNotes,
  sortNotesByRecent as sortBlogNotesByRecent,
  type BlogConfig,
  type CollectionGroup,
  type CountItem,
  type NoteDetail,
  type NoteSummary,
  type RawNoteDetail,
  type RawNoteSummary,
} from "./blogContent";
import {
  buildArticleResultListView,
  buildArchiveListView,
  buildCollectionEntryListView,
  buildNoteDetailHeaderView,
  buildNoteNavigationItemView,
  buildPaginationView,
  buildPostCardListView,
  buildRecentUpdateView,
  buildTagDiagnostics,
  buildCollectionOverviewView,
  buildVisibleTagMapGroups,
  collectRelatedTagChips,
  collectTagChips,
  isTagDiagnosticsEnabled,
  type TagChipItem,
} from "./blogViewModel";
import {
  buildTagTree,
  findTagTreeNode,
  getTagPathSegments,
  matchArticleByTagPath,
  tagPathSeparator,
  type TagTreeNode,
} from "./tagTaxonomy";

type NotesResponse = {
  notes: RawNoteSummary[];
};

const homePageSize = 9;
const archivePageSize = 40;
const resultPageSize = 12;
function getNoteReturnTarget(): ReturnTarget {
  return getNoteReturnTargetFromHash(window.location.hash);
}

function isDebugTagsEnabled() {
  const params = getHashParams(window.location.hash);
  const searchParams = new URLSearchParams(window.location.search);
  const viteEnv = (import.meta as unknown as { env?: { DEV?: boolean } }).env;
  return isTagDiagnosticsEnabled({
    isDev: viteEnv?.DEV === true,
    routeDebugTag: params.get("debugTags"),
    searchDebugTag: searchParams.get("debugTags"),
    localStorageDebugTag: window.localStorage.getItem("local-blog.debugTags"),
  });
}

function logTagDiagnostics(rawNotes: RawNoteSummary[], normalizedNotes: NoteSummary[], tagTree: TagTreeNode[]) {
  if (!isDebugTagsEnabled()) {
    return;
  }

  const diagnostics = buildTagDiagnostics(rawNotes, normalizedNotes, tagTree);
  console.groupCollapsed("[local-blog] tag diagnostics");
  console.info("fetch /api/notes succeeded", true);
  console.info("returned notes count", diagnostics.returnedNotesCount);
  console.info("raw first note keys", diagnostics.rawFirstNoteKeys);
  console.table(diagnostics.rawRows);
  console.table(diagnostics.normalizedRows);
  console.info("buildTagTree input tag total", diagnostics.normalizedTagTotal);
  console.info("buildTagTree root count", diagnostics.tagTreeRootCount);
  console.info("buildTagTree node count", diagnostics.tagTreeNodeCount);
  if (diagnostics.rawTagFailureRows.length > 0) {
    console.table(diagnostics.rawTagFailureRows);
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

export default function App() {
  const [route, setRoute] = useState<Route>(() => getRouteFromHash(window.location.hash));
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [blogConfig, setBlogConfig] = useState<BlogConfig>(blogDefaultConfig);
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

      const normalizedNotes = data.notes.map(normalizeBlogNoteSummary);
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
    const handleHashChange = () => setRoute(getRouteFromHash(window.location.hash));

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadNotes(controller.signal);

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const loadBlogConfig = async () => {
      try {
        const response = await fetch("/api/blog-config", {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }

        const data = (await response.json()) as Partial<BlogConfig>;
        setBlogConfig(normalizeBlogConfigDraft(data));
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        console.warn("Failed to load local blog config; using defaults.", err);
        setBlogConfig(blogDefaultConfig);
      }
    };

    void loadBlogConfig();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (route.name !== "note") {
      document.title = blogConfig.title;
    }
  }, [blogConfig.title, route.name]);

  const tagTree = useMemo(() => buildTagTree(notes), [notes]);
  const collections = useMemo(() => buildBlogCollections(notes), [notes]);

  return (
    <main className="site-shell">
        <header className="site-header">
          <div className="masthead-title">
            <a className="brand" href="#/" aria-label={blogConfig.title + " \u9996\u9875"}>
              {blogConfig.title}
            </a>
            <p>{blogConfig.subtitle}</p>
          </div>
          <SiteNav route={route} />
        </header>

        {route.name === "note" ? (
          <NoteDetailView relativePath={route.relativePath} notes={notes} siteTitle={blogConfig.title} />
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
    const paged = paginateBlogNotes(filteredNotes, route.page, resultPageSize);
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
    const filteredNotes = sortBlogNotesByRecent(notes.filter((note) => note.collections.includes(collection)));
    const paged = paginateBlogNotes(filteredNotes, route.page, resultPageSize);

    return (
      <ListingPage breadcrumb={"\u9996\u9875 \u2192 \u6587\u96c6 \u2192 " + collection}>
        <section className="collection-detail">
          <a className="collection-detail-back" href="#/collections">{"\u2190 \u8fd4\u56de\u6587\u96c6"}</a>
          <CollectionDetailHeader
            collection={collection}
            count={filteredNotes.length}
            latestUpdatedAt={collectionGroup?.latestUpdatedAt}
          />
          <section className="collection-detail-entries" aria-labelledby="collection-entries-title">
            <header className="collection-entries-header">
              <h2 id="collection-entries-title">{"\u6587\u7ae0\u76ee\u5f55"}</h2>
            </header>
            {isLoading ? (
              <LoadingState />
            ) : error ? (
              <ErrorState onRetry={onRetry} />
            ) : paged.items.length === 0 ? (
              <EmptyState
                title={"\u6ca1\u6709\u627e\u5230\u8fd9\u4e2a\u6587\u96c6"}
                description={"\u7ed9\u7b14\u8bb0\u6dfb\u52a0\u5bf9\u5e94 collection\u3001category \u6216\u6587\u96c6\u6807\u7b7e\u540e\uff0c\u8fd9\u91cc\u4f1a\u663e\u793a\u5bf9\u5e94\u6587\u7ae0\u3002"}
              />
            ) : (
              <CollectionEntryList
                notes={paged.items}
                collection={collection}
                sourceHref={getRouteReturnHref(route)}
                startIndex={(paged.currentPage - 1) * resultPageSize}
              />
            )}
            <Pagination currentPage={paged.currentPage} totalPages={paged.totalPages} getPageHref={(page) => getCollectionHref(collection, page)} />
          </section>
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
  const paged = paginateBlogNotes(articleNotes, route.page, homePageSize);

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

  const visibleGroups = buildVisibleTagMapGroups(tagTree, tagQuery);

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
    <header className="collection-detail-hero">
      <div className="collection-detail-hero-main">
        <p className="collection-detail-kicker">{"\u6587\u96c6"}</p>
        <h1>{collection}</h1>
        <p className="collection-detail-meta">
          <span>{count + " \u7bc7\u6587\u7ae0"}</span>
          <span>{"\u6700\u8fd1\u66f4\u65b0 " + (formatBlogCompactDate(latestUpdatedAt) ?? "\u6682\u65e0\u8bb0\u5f55")}</span>
        </p>
        <p className="collection-detail-description">{getBlogCollectionDescription(collection)}</p>
      </div>
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
  const view = buildCollectionOverviewView({ collections, isLoading, error });
  const content = (() => {
    if (view.state === "loading") {
      return <LoadingState title={"\u6b63\u5728\u52a0\u8f7d\u6587\u96c6"} description={"\u6b63\u5728\u6309\u680f\u76ee\u3001\u7cfb\u5217\u548c\u9636\u6bb5\u6574\u7406\u672c\u5730\u6587\u7ae0\u3002"} />;
    }

    if (view.state === "error") {
      return <ErrorState title={"\u65e0\u6cd5\u8bfb\u53d6\u6587\u96c6"} description={"\u672c\u5730\u535a\u5ba2\u670d\u52a1\u6682\u65f6\u65e0\u6cd5\u6c47\u603b\u6587\u96c6\u3002"} onRetry={onRetry} />;
    }

    if (view.state === "empty") {
      return (
        <EmptyState
          title={"\u8fd8\u6ca1\u6709\u6587\u96c6"}
          description={"\u7ed9\u7b14\u8bb0\u6dfb\u52a0 collection\u3001category \u6216\u6587\u96c6\u6807\u7b7e\u540e\uff0c\u8fd9\u91cc\u4f1a\u81ea\u52a8\u6c47\u603b\u6587\u96c6\u3002"}
        />
      );
    }

    return (
      <div className="collection-card-grid" aria-label={"\u6587\u96c6\u5217\u8868"}>
        {view.cards.map((collection) => (
          <a className="collection-card" href={getCollectionHref(collection.name)} key={collection.name}>
            <span className="collection-card-spine" aria-hidden="true" />
            <span className="collection-card-body">
              <span className="collection-card-kicker">{collection.countLabel}</span>
              <span className="collection-card-title">{collection.name}</span>
              <span className="collection-card-description">{collection.description}</span>
              <span className="collection-card-updated">{collection.updatedLabel}</span>
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
  const paged = paginateBlogNotes(notes, page, archivePageSize);
  const yearGroups = groupBlogNotesByYear(paged.items);
  const allYearGroups = groupBlogNotesByYear(notes);
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
  const sections = buildArchiveListView({ groups, yearCounts, sourceHref });

  return (
    <div className="archive-list">
      {sections.map((section) => (
        <section className="archive-year" id={section.id} key={section.year}>
          <h2>
            {section.year} <span>({section.count})</span>
          </h2>
          <ol>
            {section.rows.map((row) => (
              <li key={row.key}>
                <time dateTime={row.dateTime ?? undefined}>{row.dateLabel}</time>
                <a href={row.href}>{row.title}</a>
                <span>{row.collection}</span>
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
  const results = useMemo(() => searchBlogNotes(notes, query), [notes, query]);
  const paged = paginateBlogNotes(query ? results : [], page, resultPageSize);
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
  const recentUpdate = buildRecentUpdateView({ note, sourceHref });

  if (!recentUpdate) {
    return (
      <section className="recent-updates" aria-label={"\u6700\u65b0\u6587\u7ae0"}>
        <section className="status-panel compact-status">
          <h2>{"\u6682\u65e0\u6587\u7ae0"}</h2>
          <p>{"\u5199\u4e0b\u7b2c\u4e00\u7bc7 Markdown \u7b14\u8bb0\u540e\uff0c\u8fd9\u91cc\u4f1a\u663e\u793a\u6587\u7ae0\u6458\u8981\u3002"}</p>
        </section>
      </section>
    );
  }

  return (
    <section className="recent-updates" aria-label={"\u6700\u65b0\u6587\u7ae0"}>
      <article className="recent-card">
        <a href={recentUpdate.href}>
          <div className="post-meta">
            <span>{recentUpdate.collection}</span>
            {recentUpdate.dateLabel ? (
              <time dateTime={recentUpdate.dateTime ?? undefined}>{recentUpdate.dateLabel}</time>
            ) : null}
          </div>
          <div className="recent-card-main">
            <h3>{recentUpdate.title}</h3>
            <p>{recentUpdate.excerpt}</p>
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
  const cards = buildPostCardListView({ notes, sourceHref });

  return (
    <div className="post-grid">
      {cards.map((card) => (
        <article className="post-card" key={card.key}>
          <a className="post-card-link" href={card.href}>
            <div className="post-meta">
              <span>{card.collection}</span>
              {card.dateLabel ? (
                <time dateTime={card.dateTime ?? undefined}>{card.dateLabel}</time>
              ) : null}
              {card.isDraft ? <span className="draft-badge">{"\u8349\u7a3f"}</span> : null}
            </div>
            <h2>{card.title}</h2>
            <p>{card.excerpt}</p>
            <span className="read-more">{"\u9605\u8bfb\u66f4\u591a"}</span>
          </a>
        </article>
      ))}
    </div>
  );
}

function ArticleResultList({ notes, sourceHref }: { notes: NoteSummary[]; sourceHref?: string }) {
  const results = buildArticleResultListView({ notes, sourceHref });

  return (
    <div className="result-list">
      {results.map((result) => (
        <article className="result-item" key={result.key}>
          <a href={result.href}>
            <div className="post-meta">
              <span>{result.collection}</span>
              {result.dateLabel ? <time dateTime={result.dateTime ?? undefined}>{result.dateLabel}</time> : null}
            </div>
            <h2>{result.title}</h2>
            <p>{result.excerpt}</p>
            <span className="result-read-more">{"\u9605\u8bfb\u66f4\u591a"}</span>
          </a>
        </article>
      ))}
    </div>
  );
}

function CollectionEntryList({
  notes,
  collection,
  sourceHref,
  startIndex,
}: {
  notes: NoteSummary[];
  collection: string;
  sourceHref?: string;
  startIndex: number;
}) {
  const entries = buildCollectionEntryListView({ notes, collection, sourceHref, startIndex });

  return (
    <ol className="collection-entry-list">
      {entries.map((entry) => (
        <li className="collection-entry-item" key={entry.key}>
          <a className="collection-entry-link" href={entry.href}>
            <span className="collection-entry-number">{entry.number}</span>
            <span className="collection-entry-main">
              <span className="collection-entry-title-row">
                <span className="collection-entry-title">{entry.title}</span>
                {entry.isDraft ? <span className="draft-badge">{"\u8349\u7a3f"}</span> : null}
              </span>
              <span className="collection-entry-excerpt">{entry.excerpt}</span>
            </span>
            <span className="collection-entry-meta">
              {entry.dateTime ? <time dateTime={entry.dateTime}>{entry.dateLabel}</time> : <span>{entry.dateLabel}</span>}
              <span className="collection-entry-tags">
                {entry.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </span>
            </span>
            <span className="collection-entry-arrow" aria-hidden="true">{"\u203a"}</span>
          </a>
        </li>
      ))}
    </ol>
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
  const view = buildPaginationView({ currentPage, totalPages, getPageHref });

  if (!view) {
    return null;
  }

  return (
    <nav className="pagination" aria-label={"\u5206\u9875"}>
      {view.previousHref ? (
        <a className="pagination-prev" href={view.previousHref}>
          {"\u2190 \u4e0a\u4e00\u9875"}
        </a>
      ) : null}
      {view.items.map((item) =>
        item.kind === "ellipsis" ? (
          <span className="pagination-ellipsis" key={item.key}>
            ...
          </span>
        ) : (
          <a
            className={item.isCurrent ? "active" : undefined}
            aria-current={item.isCurrent ? "page" : undefined}
            href={item.href}
            key={item.page}
          >
            {item.page}
          </a>
        ),
      )}
      {view.nextHref ? (
        <a className="pagination-next" href={view.nextHref}>
          {"\u4e0b\u4e00\u9875 \u2192"}
        </a>
      ) : null}
    </nav>
  );
}

function NoteDetailView({ relativePath, notes, siteTitle }: { relativePath: string; notes: NoteSummary[]; siteTitle: string }) {
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

      setNote(normalizeBlogNoteDetail(data));
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

  useEffect(() => {
    document.title = note ? `${note.title} - ${siteTitle}` : siteTitle;
  }, [note, siteTitle]);

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

  const noteHeader = buildNoteDetailHeaderView({ note, notes });

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
              {noteHeader.displayDate ? <time>{noteHeader.displayDate}</time> : null}
              {note.draft ? <span className="draft-badge">{"\u8349\u7a3f"}</span> : null}
            </div>
            <h1>{note.title}</h1>
            {noteHeader.summary ? <p className="note-summary">{noteHeader.summary}</p> : null}
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

          {noteHeader.hasNavigation ? (
            <NoteNavigation previousNote={noteHeader.previousNote} nextNote={noteHeader.nextNote} sourceHref={returnTarget.href} />
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
  const item = buildNoteNavigationItemView({ note, sourceHref });

  if (!item) {
    return (
      <div className={className} aria-disabled="true">
        <span className="note-nav-label">{label}</span>
        <p>{emptyLabel}</p>
      </div>
    );
  }

  return (
    <a className={className} href={item.href}>
      <span className="note-nav-label">{label}</span>
      <h2>{item.title}</h2>
      <div className="note-nav-meta">
        <span>{item.collection}</span>
        {item.dateLabel ? <time dateTime={item.dateTime ?? undefined}>{item.dateLabel}</time> : null}
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
