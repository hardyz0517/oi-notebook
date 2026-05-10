import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { MarkdownRenderer } from "./MarkdownRenderer";

type NoteSummary = {
  title: string;
  relativePath: string;
  summary: string | null;
  excerpt: string | null;
  tags: string[];
  category: string;
  created: string | null;
  updated: string | null;
  date: string | null;
  sortKey: string | null;
  draft: boolean;
};

type NoteMetadata = {
  title?: string | null;
  summary?: string | null;
  tags?: string[];
  created?: string | null;
  updated?: string | null;
  draft?: boolean;
};

type NoteDetail = {
  relativePath: string;
  category: string;
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

type NotesResponse = {
  notes: NoteSummary[];
};

type Route =
  | { name: "home" }
  | { name: "tags" }
  | { name: "tag"; tag: string }
  | { name: "categories" }
  | { name: "category"; category: string }
  | { name: "search"; query: string }
  | { name: "note"; encodedPath: string; relativePath: string };

type CountItem = {
  name: string;
  count: number;
};

const categoryLabels: Record<string, string> = {
  tricks: "技巧",
  problems: "题解",
  luogu: "洛谷",
  inbox: "收件箱",
};

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

function getRouteFromHash(): Route {
  const hash = window.location.hash || "#/";
  const notePrefix = "#/note/";
  const tagPrefix = "#/tag/";
  const categoryPrefix = "#/category/";
  const searchPrefix = "#/search";

  if (hash.startsWith(notePrefix)) {
    const encodedPath = hash.slice(notePrefix.length);
    if (!encodedPath) {
      return { name: "home" };
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

  if (hash === "#/tags") {
    return { name: "tags" };
  }

  if (hash.startsWith(tagPrefix)) {
    try {
      return { name: "tag", tag: decodeURIComponent(hash.slice(tagPrefix.length)) };
    } catch {
      return { name: "tags" };
    }
  }

  if (hash === "#/categories") {
    return { name: "categories" };
  }

  if (hash.startsWith(categoryPrefix)) {
    try {
      return {
        name: "category",
        category: decodeURIComponent(hash.slice(categoryPrefix.length)),
      };
    } catch {
      return { name: "categories" };
    }
  }

  if (hash.startsWith(searchPrefix)) {
    const queryStart = hash.indexOf("?");
    if (queryStart === -1) {
      return { name: "search", query: "" };
    }

    const params = new URLSearchParams(hash.slice(queryStart + 1));
    return { name: "search", query: params.get("q")?.trim() ?? "" };
  }

  return { name: "home" };
}

function getNoteHref(relativePath: string) {
  return `#/note/${encodeURIComponent(relativePath)}`;
}

function getTagHref(tag: string) {
  return `#/tag/${encodeURIComponent(tag)}`;
}

function getCategoryHref(category: string) {
  return `#/category/${encodeURIComponent(category)}`;
}

function getSearchHref(query: string) {
  const trimmed = query.trim();
  return trimmed ? `#/search?q=${encodeURIComponent(trimmed)}` : "#/search";
}

function getCategoryLabel(category: string) {
  return categoryLabels[category] ?? category;
}

function formatDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return dateFormatter.format(date);
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

function getNoteExcerpt(note: NoteSummary) {
  return (
    note.summary?.trim() ||
    note.excerpt?.trim() ||
    "这篇笔记还没有摘要，打开文章页后可以继续阅读正文。"
  );
}

function getShortNoteExcerpt(note: NoteSummary) {
  const excerpt = getNoteExcerpt(note);
  return excerpt.length > 64 ? `${excerpt.slice(0, 64)}...` : excerpt;
}

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN");
}

function getTagCounts(notes: NoteSummary[]) {
  const counts = new Map<string, number>();

  for (const note of notes) {
    for (const tag of note.tags) {
      const trimmed = tag.trim();
      if (trimmed) {
        counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
      }
    }
  }

  return Array.from(counts, ([name, count]) => ({ name, count })).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"),
  );
}

function getCategoryCounts(notes: NoteSummary[]) {
  const counts = new Map<string, number>();

  for (const note of notes) {
    const category = note.category.trim() || "uncategorized";
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return Array.from(counts, ([name, count]) => ({ name, count })).sort(
    (a, b) => b.count - a.count || getCategoryLabel(a.name).localeCompare(getCategoryLabel(b.name), "zh-CN"),
  );
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
      note.category,
      getCategoryLabel(note.category),
      note.relativePath,
      ...note.tags,
    ];

    return fields.some((field) => normalizeSearchText(field).includes(normalizedQuery));
  });
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
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as NotesResponse;
      if (!Array.isArray(data.notes)) {
        throw new Error("Invalid notes response");
      }

      setNotes(data.notes);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }

      console.error("Failed to load local blog notes", err);
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

  const tagCounts = useMemo(() => getTagCounts(notes), [notes]);
  const categoryCounts = useMemo(() => getCategoryCounts(notes), [notes]);

  return (
    <main className="site-shell">
      <header className="site-header">
        <a className="brand" href="#/" aria-label="OI Notebook 首页">
          OI Notebook
        </a>
        <nav className="nav-links" aria-label="博客导航">
          <a href="#/">首页</a>
          <a href="#/">文章</a>
          <a href="#/tags">标签</a>
          <a href="#/categories">分类</a>
          <a href="#/search">搜索</a>
        </nav>
      </header>

      {route.name === "note" ? (
        <NoteDetailView relativePath={route.relativePath} notes={notes} />
      ) : (
        <IndexView
          route={route}
          notes={notes}
          tagCounts={tagCounts}
          categoryCounts={categoryCounts}
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
  tagCounts,
  categoryCounts,
  isLoading,
  error,
  onRetry,
}: {
  route: Exclude<Route, { name: "note"; encodedPath: string; relativePath: string }>;
  notes: NoteSummary[];
  tagCounts: CountItem[];
  categoryCounts: CountItem[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (route.name === "tags") {
    return (
      <ListingPage eyebrow="Tags" title="标签" description="按算法主题和训练关键词浏览笔记。">
        <TagCloud tags={tagCounts} />
        <PostResults
          notes={notes}
          isLoading={isLoading}
          error={error}
          onRetry={onRetry}
          emptyTitle="还没有可展示的标签"
          emptyDescription="给笔记添加 tags 后，这里会自动汇总标签入口。"
        />
      </ListingPage>
    );
  }

  if (route.name === "tag") {
    const filteredNotes = notes.filter((note) => note.tags.includes(route.tag));

    return (
      <ListingPage eyebrow="Tag" title={`标签：${route.tag}`} description="这个标签下的全部文章。">
        <PostResults notes={filteredNotes} isLoading={isLoading} error={error} onRetry={onRetry} />
      </ListingPage>
    );
  }

  if (route.name === "categories") {
    return (
      <ListingPage eyebrow="Categories" title="分类" description="按笔记所在目录浏览文章。">
        <CategoryList categories={categoryCounts} />
        <PostResults
          notes={notes}
          isLoading={isLoading}
          error={error}
          onRetry={onRetry}
          emptyTitle="还没有可展示的分类"
          emptyDescription="保存第一篇笔记后，这里会自动按目录汇总分类。"
        />
      </ListingPage>
    );
  }

  if (route.name === "category") {
    const filteredNotes = notes.filter((note) => note.category === route.category);

    return (
      <ListingPage
        eyebrow="Category"
        title={`分类：${getCategoryLabel(route.category)}`}
        description="这个分类下的全部文章。"
      >
        <PostResults notes={filteredNotes} isLoading={isLoading} error={error} onRetry={onRetry} />
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
      />
    );
  }

  const recentNotes = notes.slice(0, 4);

  return (
    <>
      <section className="page-header hero" id="top">
        <p className="eyebrow">LOCAL BLOG</p>
        <h1>OI Notebook</h1>
        <p className="subtitle">本地算法笔记与题解博客</p>
      </section>

      <RecentUpdates notes={recentNotes} />

      <section className="home-posts" aria-label="文章摘要流">
        <PostResults notes={notes} isLoading={isLoading} error={error} onRetry={onRetry} />
      </section>
    </>
  );
}

function ListingPage({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <>
      <section className="page-header listing-header">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </section>
      <section className="listing-content">{children}</section>
    </>
  );
}

function TagCloud({ tags }: { tags: CountItem[] }) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <div className="term-list" aria-label="标签列表">
      {tags.map((tag) => (
        <a className="term-pill" href={getTagHref(tag.name)} key={tag.name}>
          <span>{tag.name}</span>
          <small>{tag.count}</small>
        </a>
      ))}
    </div>
  );
}

function CategoryList({ categories }: { categories: CountItem[] }) {
  if (categories.length === 0) {
    return null;
  }

  return (
    <div className="category-list" aria-label="分类列表">
      {categories.map((category) => (
        <a className="category-item" href={getCategoryHref(category.name)} key={category.name}>
          <span>{getCategoryLabel(category.name)}</span>
          <small>{category.count} 篇文章</small>
        </a>
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
}: {
  query: string;
  notes: NoteSummary[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const [draftQuery, setDraftQuery] = useState(query);
  const results = useMemo(() => searchNotes(notes, query), [notes, query]);

  useEffect(() => {
    setDraftQuery(query);
  }, [query]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    window.location.hash = getSearchHref(draftQuery);
  };

  return (
    <ListingPage eyebrow="Search" title="搜索" description="在标题、摘要、标签、分类和路径中查找文章。">
      <form className="search-form" onSubmit={handleSubmit}>
        <input
          aria-label="搜索文章"
          placeholder="搜索 title、tag、summary..."
          type="search"
          value={draftQuery}
          onChange={(event) => setDraftQuery(event.target.value)}
        />
        <button type="submit">搜索</button>
        {query ? (
          <a className="clear-search" href="#/search">
            清除
          </a>
        ) : null}
      </form>

      <p className="result-count">
        {query ? `找到 ${results.length} 篇相关文章` : "输入关键词开始搜索"}
      </p>

      <PostResults
        notes={query ? results : []}
        isLoading={isLoading}
        error={error}
        onRetry={onRetry}
        emptyTitle={query ? "没有找到相关文章" : "还没有输入搜索词"}
        emptyDescription={
          query
            ? "换一个标题、标签、分类或摘要里的关键词再试试。"
            : "可以搜索中文标题、tag、summary、excerpt、分类名或相对路径。"
        }
      />
    </ListingPage>
  );
}

function PostResults({
  notes,
  isLoading,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
}: {
  notes: NoteSummary[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
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

  return <PostGrid notes={notes} />;
}

function RecentUpdates({ notes }: { notes: NoteSummary[] }) {
  if (notes.length === 0) {
    return null;
  }

  return (
    <section className="recent-updates" aria-label="最近更新">
      <div className="recent-heading">
        <p className="eyebrow">Recent Updates</p>
        <h2>最近更新</h2>
      </div>
      <div className="recent-strip">
        {notes.map((note) => {
          const displayDate = formatOptionalDate(note.date, note.updated, note.created);

          return (
            <article className="recent-card" key={note.relativePath}>
              <a href={getNoteHref(note.relativePath)}>
                <div className="post-meta">
                  <span>{getCategoryLabel(note.category)}</span>
                  {displayDate ? (
                    <time dateTime={note.date ?? note.updated ?? note.created ?? undefined}>{displayDate}</time>
                  ) : null}
                </div>
                <h3>{note.title}</h3>
                <p>{getShortNoteExcerpt(note)}</p>
              </a>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PostGrid({ notes }: { notes: NoteSummary[] }) {
  return (
    <div className="post-grid">
      {notes.map((note) => (
        <article className="post-card" key={note.relativePath}>
          <a className="post-card-link" href={getNoteHref(note.relativePath)}>
            <div className="post-meta">
              <span>{getCategoryLabel(note.category)}</span>
              {formatOptionalDate(note.date, note.updated, note.created) ? (
                <time dateTime={note.date ?? note.updated ?? note.created ?? undefined}>
                  {formatOptionalDate(note.date, note.updated, note.created)}
                </time>
              ) : null}
              {note.draft ? <span className="draft-badge">草稿</span> : null}
            </div>
            <h2>{note.title}</h2>
            <p>{getNoteExcerpt(note)}</p>
            <span className="read-more">阅读全文</span>
          </a>
        </article>
      ))}
    </div>
  );
}

function NoteDetailView({ relativePath, notes }: { relativePath: string; notes: NoteSummary[] }) {
  const [note, setNote] = useState<NoteDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNote = async (signal?: AbortSignal) => {
    if (!relativePath) {
      setError("无法读取这篇笔记");
      setNote(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ path: relativePath });
      const response = await fetch(`/api/note?${params.toString()}`, {
        headers: { Accept: "application/json" },
        signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as NoteDetail;
      if (!data || typeof data.body !== "string") {
        throw new Error("Invalid note response");
      }

      setNote(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }

      console.error("Failed to load local blog note", err);
      setError("无法读取这篇笔记");
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

  if (isLoading) {
    return (
      <article className="note-page">
        <a className="back-link" href="#/">
          返回文章
        </a>
        <LoadingState title="??????" description="Local Blog ?????? Markdown ???" />
      </article>
    );
  }

  if (error || !note) {
    return (
      <article className="note-page">
        <a className="back-link" href="#/">
          返回文章
        </a>
        <ErrorState
          title="无法读取这篇笔记"
          description="这篇笔记可能不存在、路径无效，或本地博客服务暂时无法读取它。"
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
    <article className="note-page">
      <a className="back-link" href="#/">
        返回文章
      </a>

      <header className="note-header">
        <div className="post-meta">
          <a href={getCategoryHref(note.category)}>{getCategoryLabel(note.category)}</a>
          {displayDate ? <time>{displayDate}</time> : null}
          {note.draft ? <span className="draft-badge">草稿</span> : null}
        </div>
        <h1>{note.title}</h1>
        {summary ? <p className="note-summary">{summary}</p> : null}
        {note.tags.length > 0 ? (
          <div className="tag-row" aria-label={`${note.title} 标签`}>
            {note.tags.map((tag) => (
              <a href={getTagHref(tag)} key={tag}>
                {tag}
              </a>
            ))}
          </div>
        ) : null}
      </header>

      <MarkdownRenderer markdown={note.body} />

      {currentIndex !== -1 ? <NoteNavigation previousNote={previousNote} nextNote={nextNote} /> : null}
    </article>
  );
}

function NoteNavigation({
  previousNote,
  nextNote,
}: {
  previousNote: NoteSummary | null;
  nextNote: NoteSummary | null;
}) {
  return (
    <nav className="note-navigation" aria-label={"\u6587\u7ae0\u5bfc\u822a"}>
      <NoteNavigationItem
        label={"\u4e0a\u4e00\u7bc7"}
        note={previousNote}
        emptyLabel={"\u5df2\u7ecf\u662f\u6700\u65b0\u6587\u7ae0"}
      />
      <NoteNavigationItem
        label={"\u4e0b\u4e00\u7bc7"}
        note={nextNote}
        emptyLabel={"\u6ca1\u6709\u66f4\u65e9\u6587\u7ae0"}
        align="next"
      />
    </nav>
  );
}

function NoteNavigationItem({
  label,
  note,
  emptyLabel,
  align = "previous",
}: {
  label: string;
  note: NoteSummary | null;
  emptyLabel: string;
  align?: "previous" | "next";
}) {
  const className = `note-nav-card note-nav-${align}${note ? "" : " note-nav-card-disabled"}`;

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
    <a className={className} href={getNoteHref(note.relativePath)}>
      <span className="note-nav-label">{label}</span>
      <h2>{note.title}</h2>
      <div className="note-nav-meta">
        <span>{getCategoryLabel(note.category)}</span>
        {displayDate ? <time dateTime={note.date ?? note.updated ?? note.created ?? undefined}>{displayDate}</time> : null}
      </div>
    </a>
  );
}

function LoadingState({
  title = "????????",
  description = "Local Blog ?????? notes??????????????",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <section className="status-panel" aria-live="polite">
      <p className="eyebrow">Loading</p>
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  );
}

function ErrorState({
  title = "无法读取本地笔记",
  description = "请确认本地博客服务正在运行，然后重新尝试读取文章列表。",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry: () => void;
}) {
  return (
    <section className="status-panel status-panel-error" role="alert">
      <p className="eyebrow">Error</p>
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="status-actions">
        <a href="#/">返回首页</a>
        <button type="button" onClick={onRetry}>
          重试
        </button>
      </div>
    </section>
  );
}

function EmptyState({
  title = "还没有可展示的笔记",
  description = "回到桌面端写下第一篇 Markdown 笔记，保存后刷新这里就能看到文章摘要流。",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <section className="status-panel">
      <p className="eyebrow">Empty</p>
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  );
}
