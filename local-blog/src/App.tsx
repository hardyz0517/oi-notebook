import { useEffect, useMemo, useState } from "react";

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

type NotesResponse = {
  notes: NoteSummary[];
};

type CountItem = {
  name: string;
  label: string;
  count: number;
};

const navItems = ["首页", "文章", "标签", "分类", "搜索"];

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

function getCategoryLabel(category: string) {
  return categoryLabels[category] ?? category;
}

function formatDate(value: string | null) {
  if (!value) {
    return "日期待整理";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "日期待整理";
  }

  return dateFormatter.format(date);
}

function getNoteExcerpt(note: NoteSummary) {
  return (
    note.summary?.trim() ||
    note.excerpt?.trim() ||
    "这篇笔记还没有摘要，打开文章页后可以继续补全正文与 frontmatter。"
  );
}

function countBy<T>(
  items: T[],
  getKeys: (item: T) => string[],
  getLabel: (key: string) => string = (key) => key,
) {
  const counts = new Map<string, number>();

  for (const item of items) {
    for (const key of getKeys(item)) {
      const normalized = key.trim();
      if (!normalized) {
        continue;
      }

      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map<CountItem>(([name, count]) => ({
      name,
      label: getLabel(name),
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-CN"));
}

export default function App() {
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNotes = async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);

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
      setError("无法读取本地笔记");
      setNotes([]);
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void loadNotes(controller.signal);

    return () => controller.abort();
  }, []);

  const tagStats = useMemo(
    () => countBy(notes, (note) => note.tags).slice(0, 12),
    [notes],
  );
  const categoryStats = useMemo(
    () =>
      countBy(notes, (note) => [note.category], getCategoryLabel).slice(0, 8),
    [notes],
  );

  return (
    <main className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="OI Notebook 首页">
          OI Notebook
        </a>
        <nav className="nav-links" aria-label="博客导航">
          {navItems.map((item) => (
            <a href="#top" key={item}>
              {item}
            </a>
          ))}
        </nav>
      </header>

      <section className="hero" id="top">
        <p className="eyebrow">Local Blog</p>
        <h1>OI Notebook</h1>
        <p className="subtitle">本地算法笔记与题解博客</p>
      </section>

      <section className="content-grid" aria-label="文章摘要流">
        <div className="article-flow">
          {isLoading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState onRetry={() => void loadNotes()} />
          ) : notes.length === 0 ? (
            <EmptyState />
          ) : (
            notes.map((note) => (
              <article className="post-card" key={note.relativePath}>
                <div className="post-meta">
                  <span>{getCategoryLabel(note.category)}</span>
                  <time dateTime={note.date ?? note.updated ?? note.created ?? undefined}>
                    {formatDate(note.date ?? note.updated ?? note.created)}
                  </time>
                  {note.draft ? <span className="draft-badge">草稿</span> : null}
                </div>
                <h2>{note.title}</h2>
                <p>{getNoteExcerpt(note)}</p>
                {note.tags.length > 0 ? (
                  <div className="tag-row" aria-label={`${note.title} 标签`}>
                    {note.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                ) : null}
                <p className="post-path">{note.relativePath}</p>
              </article>
            ))
          )}
        </div>

        <aside className="side-panel" aria-label="博客入口">
          <section>
            <h2>标签</h2>
            {tagStats.length > 0 ? (
              <div className="compact-links">
                {tagStats.map((tag) => (
                  <a href="#top" key={tag.name}>
                    {tag.label}
                    <span>{tag.count}</span>
                  </a>
                ))}
              </div>
            ) : (
              <p>保存带有 tags 的笔记后，这里会汇总标签入口。</p>
            )}
          </section>

          <section>
            <h2>分类</h2>
            {categoryStats.length > 0 ? (
              <div className="compact-links">
                {categoryStats.map((category) => (
                  <a href="#top" key={category.name}>
                    {category.label}
                    <span>{category.count}</span>
                  </a>
                ))}
              </div>
            ) : (
              <p>题解、技巧、洛谷和收件箱会在这里形成文章入口。</p>
            )}
          </section>

          <section className="empty-state">
            <h2>搜索</h2>
            <p>搜索页会在后续阶段接入；现在先展示真实文章流与标签分类摘要。</p>
          </section>
        </aside>
      </section>
    </main>
  );
}

function LoadingState() {
  return (
    <section className="status-panel" aria-live="polite">
      <p className="eyebrow">Loading</p>
      <h2>正在整理本地笔记</h2>
      <p>Local Blog 正在读取 app data notes，稍等一下就会出现最新文章。</p>
    </section>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="status-panel status-panel-error" role="alert">
      <p className="eyebrow">Error</p>
      <h2>无法读取本地笔记</h2>
      <p>请确认本地博客服务正在运行，然后重新尝试读取文章列表。</p>
      <button type="button" onClick={onRetry}>
        重试
      </button>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="status-panel">
      <p className="eyebrow">Empty</p>
      <h2>还没有可展示的笔记</h2>
      <p>回到桌面端写下第一篇 Markdown 笔记，保存后刷新这里就能看到文章摘要流。</p>
    </section>
  );
}
