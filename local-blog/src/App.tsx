type PostPreview = {
  title: string;
  category: string;
  date: string;
  excerpt: string;
  tags: string[];
};

const navItems = ["首页", "文章", "标签", "分类", "搜索"];

const posts: PostPreview[] = [
  {
    title: "线段树维护区间信息",
    category: "数据结构",
    date: "2026.05.06",
    excerpt:
      "从合并信息的角度整理线段树模板，记录区间查询、单点修改与常见边界处理。",
    tags: ["线段树", "模板", "复杂度"],
  },
  {
    title: "最短路建模笔记",
    category: "图论",
    date: "2026.05.05",
    excerpt:
      "把题面条件转成点、边与权值，比较 Dijkstra、0-1 BFS 与分层图的适用场景。",
    tags: ["最短路", "建模", "Dijkstra"],
  },
  {
    title: "训练复盘：从 trick 到题解",
    category: "复盘",
    date: "2026.05.04",
    excerpt:
      "记录一次训练中卡住的关键观察，以及如何把零散 trick 整理成可复用的解法。",
    tags: ["训练", "题解", "总结"],
  },
];

export default function App() {
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
          {posts.map((post) => (
            <article className="post-card" key={post.title}>
              <div className="post-meta">
                <span>{post.category}</span>
                <time>{post.date}</time>
              </div>
              <h2>{post.title}</h2>
              <p>{post.excerpt}</p>
              <div className="tag-row" aria-label={`${post.title} 标签`}>
                {post.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </article>
          ))}
        </div>

        <aside className="side-panel" aria-label="博客入口">
          <section>
            <h2>标签</h2>
            <div className="compact-links">
              <a href="#top">动态规划</a>
              <a href="#top">图论</a>
              <a href="#top">数据结构</a>
            </div>
          </section>

          <section>
            <h2>分类</h2>
            <div className="compact-links">
              <a href="#top">题解</a>
              <a href="#top">模板</a>
              <a href="#top">复盘</a>
            </div>
          </section>

          <section className="empty-state">
            <h2>搜索</h2>
            <p>输入标题、标签或关键词后，文章会在这里保持清爽可读。</p>
          </section>
        </aside>
      </section>
    </main>
  );
}
