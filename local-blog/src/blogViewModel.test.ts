import { describe, expect, it } from "vitest";

import {
  buildArticleResultListView,
  buildArchiveIndexView,
  buildArchiveListView,
  buildArticleArchiveRouteView,
  buildHomeRouteView,
  buildCollectionDetailHeaderView,
  buildCollectionDetailRouteView,
  buildCollectionEntryListView,
  buildNoteDetailRouteView,
  buildNoteDetailHeaderView,
  buildNoteNavigationItemView,
  buildSiteNavView,
  buildArticleTocView,
  buildNoteNavigationCardView,
  buildPaginationView,
  buildPostCardListView,
  buildRecentUpdateView,
  buildSearchRouteView,
  buildTagDiagnostics,
  buildTagDetailRouteView,
  buildTagDetailHeaderView,
  buildCollectionOverviewView,
  buildVisibleTagMapGroups,
  collectRelatedTagChips,
  collectTagChips,
  getPaginationItems,
  getTagChipLabel,
  isTagDiagnosticsEnabled,
  matchesTagChipSearch,
  normalizeCompactTagSearchText,
  normalizeTagSearchText,
  type TagChipItem,
} from "./blogViewModel";
import type { NoteSummary, RawNoteSummary } from "./blogContent";
import type { TagTreeNode } from "./tagTaxonomy";

const tagNode = (overrides: Partial<TagTreeNode> = {}): TagTreeNode => ({
  name: "root",
  fullPath: "root",
  depth: 1,
  count: 1,
  children: [],
  ...overrides,
});

describe("blogViewModel", () => {
  it("builds tag chip labels from tree depth", () => {
    expect(getTagChipLabel(tagNode({ name: "\u56fe\u8bba", fullPath: "\u7b97\u6cd5/\u56fe\u8bba", depth: 2 }))).toBe("\u56fe\u8bba");
    expect(getTagChipLabel(tagNode({
      name: "\u5355\u6e90\u6700\u77ed\u8def",
      fullPath: "\u7b97\u6cd5/\u56fe\u8bba/\u6700\u77ed\u8def/\u5355\u6e90\u6700\u77ed\u8def",
      depth: 4,
    }))).toBe("\u6700\u77ed\u8def / \u5355\u6e90\u6700\u77ed\u8def");
  });

  it("builds tag detail header segments and count label", () => {
    expect(buildTagDetailHeaderView({
      tag: "算法/图论/最短路",
      count: 3,
    })).toEqual({
      countLabel: "共 3 篇文章",
      segments: [
        { key: "算法", label: "算法", href: "#/tags/%E7%AE%97%E6%B3%95", showSeparator: false },
        { key: "算法/图论", label: "图论", href: "#/tags/%E7%AE%97%E6%B3%95%2F%E5%9B%BE%E8%AE%BA", showSeparator: true },
        {
          key: "算法/图论/最短路",
          label: "最短路",
          href: "#/tags/%E7%AE%97%E6%B3%95%2F%E5%9B%BE%E8%AE%BA%2F%E6%9C%80%E7%9F%AD%E8%B7%AF",
          showSeparator: true,
        },
      ],
    });
  });

  it("builds tag detail route data with descendant matches", () => {
    const tree = [
      tagNode({
        name: "算法",
        fullPath: "算法",
        depth: 1,
        count: 3,
        children: [
          tagNode({
            name: "图论",
            fullPath: "算法/图论",
            depth: 2,
            count: 3,
            children: [
              tagNode({
                name: "最短路",
                fullPath: "算法/图论/最短路",
                depth: 3,
                count: 1,
              }),
            ],
          }),
        ],
      }),
    ];
    const note = (title: string, tags: string[]): NoteSummary => ({
      title,
      relativePath: title + ".md",
      summary: null,
      excerpt: null,
      tags,
      category: "inbox",
      collection: "杂谈",
      collections: ["杂谈"],
      created: null,
      updated: null,
      date: null,
      sortKey: null,
      draft: false,
    });

    expect(buildTagDetailRouteView({
      notes: [
        note("a", ["算法/图论"]),
        note("b", ["算法/图论/最短路"]),
        note("c", ["算法/字符串"]),
      ],
      tagTree: tree,
      tag: "算法/图论",
      page: 2,
      pageSize: 1,
    })).toEqual({
      filteredNotes: [
        note("a", ["算法/图论"]),
        note("b", ["算法/图论/最短路"]),
      ],
      paged: {
        items: [note("b", ["算法/图论/最短路"])],
        currentPage: 2,
        totalPages: 2,
      },
      relatedTags: [
        { label: "最短路", fullPath: "算法/图论/最短路", count: 1 },
      ],
      count: 2,
    });
  });

  it("collects all tag chips and related leaf chips", () => {
    const tree = tagNode({
      name: "\u56fe\u8bba",
      fullPath: "\u7b97\u6cd5/\u56fe\u8bba",
      depth: 2,
      count: 5,
      children: [
        tagNode({
          name: "\u6700\u77ed\u8def",
          fullPath: "\u7b97\u6cd5/\u56fe\u8bba/\u6700\u77ed\u8def",
          depth: 3,
          count: 3,
          children: [
            tagNode({
              name: "Dijkstra",
              fullPath: "\u7b97\u6cd5/\u56fe\u8bba/\u6700\u77ed\u8def/Dijkstra",
              depth: 4,
              count: 2,
            }),
          ],
        }),
      ],
    });

    expect(collectTagChips(tree).map((chip) => chip.fullPath)).toEqual([
      "\u7b97\u6cd5/\u56fe\u8bba",
      "\u7b97\u6cd5/\u56fe\u8bba/\u6700\u77ed\u8def",
      "\u7b97\u6cd5/\u56fe\u8bba/\u6700\u77ed\u8def/Dijkstra",
    ]);
    expect(collectRelatedTagChips(tree)).toEqual([
      {
        label: "Dijkstra",
        fullPath: "\u7b97\u6cd5/\u56fe\u8bba/\u6700\u77ed\u8def/Dijkstra",
        count: 2,
      },
    ]);
  });

  it("normalizes and matches tag chip search text", () => {
    const item: TagChipItem = {
      label: "Dijkstra",
      fullPath: "\u7b97\u6cd5/\u56fe\u8bba/\u6700\u77ed\u8def/Dijkstra",
      count: 2,
    };

    expect(normalizeTagSearchText("  A   B  ")).toBe("a b");
    expect(normalizeCompactTagSearchText("  A   B  ")).toBe("ab");
    expect(matchesTagChipSearch(item, "\u6700\u77ed\u8def")).toBe(true);
    expect(matchesTagChipSearch(item, "\u6700 \u77ed \u8def")).toBe(true);
    expect(matchesTagChipSearch(item, "network flow")).toBe(false);
  });

  it("builds visible tag map groups with direct chips and branch chips", () => {
    const tree = [
      tagNode({
        name: "算法",
        fullPath: "算法",
        depth: 1,
        count: 5,
        children: [
          tagNode({
            name: "数学",
            fullPath: "算法/数学",
            depth: 2,
            count: 1,
          }),
          tagNode({
            name: "图论",
            fullPath: "算法/图论",
            depth: 2,
            count: 4,
            children: [
              tagNode({
                name: "最短路",
                fullPath: "算法/图论/最短路",
                depth: 3,
                count: 3,
              }),
              tagNode({
                name: "网络流",
                fullPath: "算法/图论/网络流",
                depth: 3,
                count: 1,
              }),
            ],
          }),
        ],
      }),
    ];

    expect(buildVisibleTagMapGroups(tree, "")).toEqual([
      {
        group: tree[0],
        directChips: [{ label: "数学", fullPath: "算法/数学", count: 1 }],
        branches: [{
          node: tree[0].children[1],
          chips: [
            { label: "最短路", fullPath: "算法/图论/最短路", count: 3 },
            { label: "网络流", fullPath: "算法/图论/网络流", count: 1 },
          ],
        }],
      },
    ]);
    expect(buildVisibleTagMapGroups(tree, "网络")).toEqual([
      {
        group: tree[0],
        directChips: [],
        branches: [{
          node: tree[0].children[1],
          chips: [{ label: "网络流", fullPath: "算法/图论/网络流", count: 1 }],
        }],
      },
    ]);
    expect(buildVisibleTagMapGroups(tree, "不存在")).toEqual([]);
  });

  it("creates compact pagination items with ellipses", () => {
    expect(getPaginationItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getPaginationItems(6, 12)).toEqual([1, "ellipsis", 5, 6, 7, "ellipsis", 12]);
    expect(getPaginationItems(1, 12)).toEqual([1, 2, "ellipsis", 12]);
    expect(getPaginationItems(12, 12)).toEqual([1, "ellipsis", 11, 12]);
  });

  it("builds ready-to-render pagination links", () => {
    expect(buildPaginationView({
      currentPage: 1,
      totalPages: 1,
      getPageHref: (page) => "#/?page=" + page,
    })).toBeNull();

    expect(buildPaginationView({
      currentPage: 6,
      totalPages: 12,
      getPageHref: (page) => "#/?page=" + page,
    })).toEqual({
      previousHref: "#/?page=5",
      nextHref: "#/?page=7",
      items: [
        { kind: "page", page: 1, href: "#/?page=1", isCurrent: false },
        { kind: "ellipsis", key: "ellipsis-1" },
        { kind: "page", page: 5, href: "#/?page=5", isCurrent: false },
        { kind: "page", page: 6, href: "#/?page=6", isCurrent: true },
        { kind: "page", page: 7, href: "#/?page=7", isCurrent: false },
        { kind: "ellipsis", key: "ellipsis-5" },
        { kind: "page", page: 12, href: "#/?page=12", isCurrent: false },
      ],
    });
  });

  it("builds collection overview state and card rows", () => {
    expect(buildCollectionOverviewView({ collections: [], isLoading: true, error: null })).toEqual({
      state: "loading",
      cards: [],
    });
    expect(buildCollectionOverviewView({ collections: [], isLoading: false, error: "failed" })).toEqual({
      state: "error",
      cards: [],
    });
    expect(buildCollectionOverviewView({ collections: [], isLoading: false, error: null })).toEqual({
      state: "empty",
      cards: [],
    });
    expect(buildCollectionOverviewView({
      collections: [
        { name: "题解", count: 2, posts: [], latestUpdatedAt: "2026-06-21T10:20:30Z" },
        { name: "未知合集", count: 1, posts: [] },
      ],
      isLoading: false,
      error: null,
    })).toEqual({
      state: "ready",
      cards: [
        {
          name: "题解",
          countLabel: "2 篇文章",
          description: "做题思路、实现坑点与代码复盘。",
          updatedLabel: "最近更新：2026/6/21",
        },
        {
          name: "未知合集",
          countLabel: "1 篇文章",
          description: "收录这一主题下的相关文章。",
          updatedLabel: "最近更新：暂无记录",
        },
      ],
    });
  });

  it("builds collection entry rows", () => {
    expect(buildCollectionEntryListView({
      notes: [
        {
          title: "线段树复盘",
          relativePath: "problems/segment-tree.md",
          summary: "复盘线段树的实现细节。",
          excerpt: null,
          tags: ["算法/数据结构/线段树", "阶段/复盘", "语言/C++"],
          category: "problems",
          collection: "题解",
          collections: ["题解"],
          created: null,
          updated: "2026-06-20T00:00:00Z",
          date: null,
          sortKey: null,
          draft: true,
        },
        {
          title: "无日期笔记",
          relativePath: "inbox/no-date.md",
          summary: null,
          excerpt: null,
          tags: [],
          category: "inbox",
          collection: "题解",
          collections: ["题解"],
          created: null,
          updated: null,
          date: null,
          sortKey: null,
          draft: false,
        },
      ],
      collection: "题解",
      sourceHref: "#/collections/%E9%A2%98%E8%A7%A3?page=2",
      startIndex: 12,
    })).toEqual([
      {
        key: "problems/segment-tree.md",
        href: "#/note/problems%2Fsegment-tree.md?from=%2Fcollections%2F%25E9%25A2%2598%25E8%25A7%25A3%3Fpage%3D2",
        number: "13",
        title: "线段树复盘",
        isDraft: true,
        excerpt: "复盘线段树的实现细节。",
        dateLabel: "2026 年 6 月 20 日",
        dateTime: "2026-06-20T00:00:00Z",
        tags: ["题解", "线段树", "复盘"],
      },
      {
        key: "inbox/no-date.md",
        href: "#/note/inbox%2Fno-date.md?from=%2Fcollections%2F%25E9%25A2%2598%25E8%25A7%25A3%3Fpage%3D2",
        number: "14",
        title: "无日期笔记",
        isDraft: false,
        excerpt: "这篇笔记还没有摘要，打开文章页可以继续阅读全文。",
        dateLabel: "日期未知",
        dateTime: null,
        tags: ["题解"],
      },
    ]);
  });

  it("builds collection detail header data", () => {
    expect(buildCollectionDetailHeaderView({
      collection: "题解",
      count: 12,
      latestUpdatedAt: "2026-06-21T10:20:30Z",
    })).toEqual({
      collection: "题解",
      countLabel: "12 篇文章",
      updatedLabel: "最近更新 2026/6/21",
      description: "做题思路、实现坑点与代码复盘。",
    });

    expect(buildCollectionDetailHeaderView({
      collection: "未知合集",
      count: 0,
    })).toEqual({
      collection: "未知合集",
      countLabel: "0 篇文章",
      updatedLabel: "最近更新 暂无记录",
      description: "收录这一主题下的相关文章。",
    });
  });

  it("builds collection detail route data", () => {
    const note = (title: string, collections: string[], updated: string | null): NoteSummary => ({
      title,
      relativePath: title + ".md",
      summary: null,
      excerpt: null,
      tags: [],
      category: "inbox",
      collection: collections[0] ?? "unknown",
      collections,
      created: null,
      updated,
      date: null,
      sortKey: updated,
      draft: false,
    });
    const notes = [
      note("older graph", ["algorithm"], "2026-06-18T00:00:00Z"),
      note("newer graph", ["algorithm"], "2026-06-20T00:00:00Z"),
      note("essay", ["essay"], "2026-06-19T00:00:00Z"),
    ];
    const collections = [
      {
        name: "algorithm",
        count: 2,
        posts: [],
        latestUpdatedAt: "2026-06-20T00:00:00Z",
      },
    ];

    expect(buildCollectionDetailRouteView({
      notes,
      collections,
      collection: "algorithm",
      page: 2,
      pageSize: 1,
    })).toEqual({
      collection: "algorithm",
      collectionGroup: collections[0],
      filteredNotes: [notes[1], notes[0]],
      paged: {
        items: [notes[0]],
        currentPage: 2,
        totalPages: 2,
      },
      count: 2,
      latestUpdatedAt: "2026-06-20T00:00:00Z",
    });
  });

  it("builds post card and result rows", () => {
    const longSummary = "一二三四五六七八九十".repeat(10);
    const notes: NoteSummary[] = [
      {
        title: "首页卡片",
        relativePath: "posts/home-card.md",
        summary: longSummary,
        excerpt: null,
        tags: [],
        category: "inbox",
        collection: "杂谈",
        collections: ["杂谈"],
        created: "2026-06-19T00:00:00Z",
        updated: null,
        date: null,
        sortKey: null,
        draft: true,
      },
      {
        title: "无日期结果",
        relativePath: "posts/no-date.md",
        summary: null,
        excerpt: "来自正文的摘录。",
        tags: [],
        category: "inbox",
        collection: "技巧",
        collections: ["技巧"],
        created: null,
        updated: null,
        date: null,
        sortKey: null,
        draft: false,
      },
    ];

    expect(buildPostCardListView({ notes, sourceHref: "#/?page=2" })).toEqual([
      {
        key: "posts/home-card.md",
        href: "#/note/posts%2Fhome-card.md?from=%2F%3Fpage%3D2",
        collection: "杂谈",
        title: "首页卡片",
        excerpt: longSummary.slice(0, 78) + " [...]",
        dateLabel: "2026 年 6 月 19 日",
        dateTime: "2026-06-19T00:00:00Z",
        isDraft: true,
      },
      {
        key: "posts/no-date.md",
        href: "#/note/posts%2Fno-date.md?from=%2F%3Fpage%3D2",
        collection: "技巧",
        title: "无日期结果",
        excerpt: "来自正文的摘录。",
        dateLabel: null,
        dateTime: null,
        isDraft: false,
      },
    ]);

    expect(buildArticleResultListView({ notes, sourceHref: "#/search?q=%E6%91%98%E8%A6%81" })).toEqual([
      {
        key: "posts/home-card.md",
        href: "#/note/posts%2Fhome-card.md?from=%2Fsearch%3Fq%3D%25E6%2591%2598%25E8%25A6%2581",
        collection: "杂谈",
        title: "首页卡片",
        excerpt: longSummary.length > 112 ? longSummary.slice(0, 112) + " [...]" : longSummary,
        dateLabel: "2026 年 6 月 19 日",
        dateTime: "2026-06-19T00:00:00Z",
      },
      {
        key: "posts/no-date.md",
        href: "#/note/posts%2Fno-date.md?from=%2Fsearch%3Fq%3D%25E6%2591%2598%25E8%25A6%2581",
        collection: "技巧",
        title: "无日期结果",
        excerpt: "来自正文的摘录。",
        dateLabel: null,
        dateTime: null,
      },
    ]);
  });

  it("builds search route result data", () => {
    const note = (title: string, summary: string | null): NoteSummary => ({
      title,
      relativePath: title + ".md",
      summary,
      excerpt: null,
      tags: [],
      category: "inbox",
      collection: "杂谈",
      collections: ["杂谈"],
      created: null,
      updated: null,
      date: null,
      sortKey: null,
      draft: false,
    });
    const notes = [
      note("graph shortest path", "Dijkstra"),
      note("graph matching", "Hungarian"),
      note("number theory", "sieve"),
    ];

    expect(buildSearchRouteView({
      notes,
      query: "graph",
      page: 2,
      pageSize: 1,
      getSearchHref: (query, page) => "#/search?q=" + query + "&page=" + page,
    })).toEqual({
      results: [notes[0], notes[1]],
      paged: {
        items: [notes[1]],
        currentPage: 2,
        totalPages: 2,
      },
      sourceHref: "#/search?q=graph&page=2",
      resultCountLabel: "找到 2 篇相关文章",
      emptyTitle: "没有找到相关文章",
      emptyDescription: "换一个标题、标签、文集或摘要里的关键词再试试。",
    });

    expect(buildSearchRouteView({
      notes,
      query: "",
      page: 1,
      pageSize: 1,
      getSearchHref: (query, page) => "#/search?q=" + query + "&page=" + page,
    })).toMatchObject({
      results: [],
      paged: {
        items: [],
        currentPage: 1,
        totalPages: 1,
      },
      sourceHref: "#/search?q=&page=1",
      resultCountLabel: "输入关键词开始搜索",
      emptyTitle: "还没有输入搜索词",
      emptyDescription: "可以搜索中文标题、标签、摘要、文集名或相对路径。",
    });
  });

  it("builds the recent update card view", () => {
    expect(buildRecentUpdateView({ note: null, sourceHref: "#/" })).toBeNull();

    expect(buildRecentUpdateView({
      note: {
        title: "最新文章",
        relativePath: "posts/latest.md",
        summary: "这是一篇会显示在首页最近更新区域的文章摘要。",
        excerpt: null,
        tags: [],
        category: "inbox",
        collection: "杂谈",
        collections: ["杂谈"],
        created: null,
        updated: "2026-06-21T00:00:00Z",
        date: null,
        sortKey: null,
        draft: false,
      },
      sourceHref: "#/?page=1",
    })).toEqual({
      href: "#/note/posts%2Flatest.md?from=%2F%3Fpage%3D1",
      collection: "杂谈",
      title: "最新文章",
      excerpt: "这是一篇会显示在首页最近更新区域的文章摘要。",
      dateLabel: "2026 年 6 月 21 日",
      dateTime: "2026-06-21T00:00:00Z",
    });
  });

  it("builds note navigation item card data", () => {
    expect(buildNoteNavigationItemView({ note: null, sourceHref: "#/note/current.md" })).toBeNull();

    expect(buildNoteNavigationItemView({
      note: {
        title: "上一篇文章",
        relativePath: "posts/previous.md",
        summary: null,
        excerpt: null,
        tags: [],
        category: "inbox",
        collection: "技巧",
        collections: ["技巧"],
        created: "2026-06-19T00:00:00Z",
        updated: null,
        date: null,
        sortKey: null,
        draft: false,
      },
      sourceHref: "#/note/current.md",
    })).toEqual({
      href: "#/note/posts%2Fprevious.md?from=%2Fnote%2Fcurrent.md",
      title: "上一篇文章",
      collection: "技巧",
      dateLabel: "2026 年 6 月 19 日",
      dateTime: "2026-06-19T00:00:00Z",
    });
  });

  it("builds note detail header and navigation context", () => {
    const notes: NoteSummary[] = [
      {
        title: "上一篇",
        relativePath: "posts/previous.md",
        summary: null,
        excerpt: null,
        tags: [],
        category: "inbox",
        collection: "技巧",
        collections: ["技巧"],
        created: null,
        updated: "2026-06-21T00:00:00Z",
        date: null,
        sortKey: null,
        draft: false,
      },
      {
        title: "当前",
        relativePath: "posts/current.md",
        summary: null,
        excerpt: null,
        tags: [],
        category: "inbox",
        collection: "技巧",
        collections: ["技巧"],
        created: null,
        updated: null,
        date: "2026-06-20T00:00:00Z",
        sortKey: null,
        draft: false,
      },
      {
        title: "下一篇",
        relativePath: "posts/next.md",
        summary: null,
        excerpt: null,
        tags: [],
        category: "inbox",
        collection: "技巧",
        collections: ["技巧"],
        created: null,
        updated: "2026-06-19T00:00:00Z",
        date: null,
        sortKey: null,
        draft: false,
      },
    ];

    expect(buildNoteDetailHeaderView({
      note: {
        relativePath: "posts/current.md",
        category: "inbox",
        collection: "技巧",
        collections: ["技巧"],
        title: "当前",
        tags: ["算法/图论"],
        created: "2026-06-18T00:00:00Z",
        updated: null,
        date: "2026-06-20T00:00:00Z",
        draft: true,
        summary: " ",
        metadata: { summary: "来自元数据的摘要" },
        body: "# 当前",
      },
      notes,
    })).toEqual({
      displayDate: "2026 年 6 月 18 日",
      summary: "来自元数据的摘要",
      previousNote: notes[0],
      nextNote: notes[2],
      hasNavigation: true,
    });

    expect(buildNoteDetailHeaderView({
      note: {
        relativePath: "posts/missing.md",
        category: "inbox",
        collection: "技巧",
        collections: ["技巧"],
        title: "未收录",
        tags: [],
        created: null,
        updated: null,
        date: null,
        draft: false,
        summary: null,
        metadata: {},
        body: "# 未收录",
      },
      notes,
    })).toMatchObject({
      displayDate: null,
      summary: null,
      previousNote: null,
      nextNote: null,
      hasNavigation: false,
    });
  });

  it("builds note detail route data", () => {
    const notes: NoteSummary[] = [
      {
        title: "上一篇",
        relativePath: "posts/previous.md",
        summary: null,
        excerpt: null,
        tags: [],
        category: "inbox",
        collection: "技术",
        collections: ["技术"],
        created: null,
        updated: "2026-06-21T00:00:00Z",
        date: null,
        sortKey: null,
        draft: false,
      },
      {
        title: "当前",
        relativePath: "posts/current.md",
        summary: null,
        excerpt: null,
        tags: [],
        category: "inbox",
        collection: "技术",
        collections: ["技术"],
        created: null,
        updated: null,
        date: "2026-06-20T00:00:00Z",
        sortKey: null,
        draft: false,
      },
      {
        title: "下一篇",
        relativePath: "posts/next.md",
        summary: null,
        excerpt: null,
        tags: [],
        category: "inbox",
        collection: "技术",
        collections: ["技术"],
        created: null,
        updated: "2026-06-19T00:00:00Z",
        date: null,
        sortKey: null,
        draft: false,
      },
    ];

    expect(buildNoteDetailRouteView({
      note: {
        relativePath: "posts/current.md",
        category: "inbox",
        collection: "技术",
        collections: ["技术"],
        title: "当前",
        tags: ["算法/图论", "数据结构"],
        created: "2026-06-18T00:00:00Z",
        updated: null,
        date: "2026-06-20T00:00:00Z",
        draft: true,
        summary: " ",
        metadata: { summary: "来自元数据的摘要" },
        body: "# 当前",
      },
      notes,
      sourceHref: "#/note/posts%2Fcurrent.md",
    })).toEqual({
      collectionHref: "#/collections/%E6%8A%80%E6%9C%AF",
      displayDate: "2026 年 6 月 18 日",
      summary: "来自元数据的摘要",
      tags: [
        { label: "算法/图论", fullPath: "算法/图论", count: 0 },
        { label: "数据结构", fullPath: "数据结构", count: 0 },
      ],
      isDraft: true,
      previousNote: notes[0],
      nextNote: notes[2],
      hasNavigation: true,
    });
  });

  it("builds site nav active state", () => {
    expect(buildSiteNavView({ name: "home", page: 1 })).toEqual({ activeName: "home" });
    expect(buildSiteNavView({ name: "note", encodedPath: "posts/current.md", relativePath: "posts/current.md" })).toEqual({
      activeName: "articles",
    });
    expect(buildSiteNavView({ name: "tag", tag: "算法", page: 1 })).toEqual({ activeName: "tags" });
    expect(buildSiteNavView({ name: "collection", collection: "技术", page: 1 })).toEqual({ activeName: "collections" });
    expect(buildSiteNavView({ name: "search", query: "图论", page: 1 })).toEqual({ activeName: "search" });
  });

  it("builds article toc item classes", () => {
    expect(buildArticleTocView({
      items: [
        { id: "h1", level: 1, text: "Heading 1" },
        { id: "h2", level: 2, text: "Heading 2" },
      ],
      activeId: "h2",
    })).toEqual([
      {
        id: "h1",
        levelClassName: "article-toc-link article-toc-level-1",
        isActive: false,
        text: "Heading 1",
      },
      {
        id: "h2",
        levelClassName: "article-toc-link article-toc-level-2 article-toc-link-active",
        isActive: true,
        text: "Heading 2",
      },
    ]);
  });

  it("builds archive year sections and rows", () => {
    const groups = [
      {
        year: "2026",
        notes: [
          {
            title: "归档文章",
            relativePath: "archive/item.md",
            summary: null,
            excerpt: null,
            tags: [],
            category: "inbox",
            collection: "杂谈",
            collections: ["杂谈"],
            created: null,
            updated: "2026-06-18T00:00:00Z",
            date: null,
            sortKey: null,
            draft: false,
          },
          {
            title: "未知日期",
            relativePath: "archive/no-date.md",
            summary: null,
            excerpt: null,
            tags: [],
            category: "inbox",
            collection: "技巧",
            collections: ["技巧"],
            created: null,
            updated: null,
            date: null,
            sortKey: null,
            draft: false,
          },
        ],
      },
    ];

    expect(buildArchiveListView({
      groups,
      yearCounts: new Map([["2026", 4]]),
      sourceHref: "#/articles?page=2",
    })).toEqual([
      {
        id: "year-2026",
        year: "2026",
        count: 4,
        rows: [
          {
            key: "archive/item.md",
            href: "#/note/archive%2Fitem.md?from=%2Farticles%3Fpage%3D2",
            title: "归档文章",
            collection: "杂谈",
            dateLabel: "06 月 18 日",
            dateTime: "2026-06-18T00:00:00Z",
          },
          {
            key: "archive/no-date.md",
            href: "#/note/archive%2Fno-date.md?from=%2Farticles%3Fpage%3D2",
            title: "未知日期",
            collection: "技巧",
            dateLabel: "日期未知",
            dateTime: null,
          },
        ],
      },
    ]);
  });

  it("builds archive year index data", () => {
    const note = (title: string, date: string | null): NoteSummary => ({
      title,
      relativePath: title + ".md",
      summary: null,
      excerpt: null,
      tags: [],
      category: "inbox",
      collection: "杂谈",
      collections: ["杂谈"],
      created: null,
      updated: null,
      date,
      sortKey: null,
      draft: false,
    });
    const notes = [
      note("a", "2026-06-21T00:00:00Z"),
      note("b", "2026-06-20T00:00:00Z"),
      note("c", "2025-05-01T00:00:00Z"),
      note("d", null),
    ];

    expect(buildArchiveIndexView({
      notes,
      pageSize: 2,
      getYearHref: (page, year) => "#/articles?page=" + page + "&year=" + year,
    })).toEqual({
      years: [
        { year: "2026", href: "#/articles?page=1&year=2026" },
        { year: "2025", href: "#/articles?page=2&year=2025" },
        { year: "未知年份", href: "#/articles?page=2&year=未知年份" },
      ],
      yearCounts: new Map([
        ["2026", 2],
        ["2025", 1],
        ["未知年份", 1],
      ]),
    });
  });

  it("builds article archive route data", () => {
    const note = (title: string, date: string | null): NoteSummary => ({
      title,
      relativePath: title + ".md",
      summary: null,
      excerpt: null,
      tags: [],
      category: "inbox",
      collection: "essay",
      collections: ["essay"],
      created: null,
      updated: null,
      date,
      sortKey: null,
      draft: false,
    });
    const notes = [
      note("a", "2026-06-21T00:00:00Z"),
      note("b", "2026-06-20T00:00:00Z"),
      note("c", "2025-05-01T00:00:00Z"),
    ];

    expect(buildArticleArchiveRouteView({
      notes,
      page: 2,
      pageSize: 1,
      getYearHref: (page, year) => "#/articles?page=" + page + "&year=" + year,
    })).toEqual({
      paged: {
        items: [notes[1]],
        currentPage: 2,
        totalPages: 3,
      },
      yearGroups: [
        {
          year: "2026",
          notes: [notes[1]],
        },
      ],
      archiveIndex: {
        years: [
          { year: "2026", href: "#/articles?page=1&year=2026" },
          { year: "2025", href: "#/articles?page=3&year=2025" },
        ],
        yearCounts: new Map([
          ["2026", 2],
          ["2025", 1],
        ]),
      },
      isEmpty: false,
    });
  });

  it("builds home route data", () => {
    const note = (title: string): NoteSummary => ({
      title,
      relativePath: title + ".md",
      summary: null,
      excerpt: null,
      tags: [],
      category: "inbox",
      collection: "essay",
      collections: ["essay"],
      created: null,
      updated: null,
      date: null,
      sortKey: null,
      draft: false,
    });
    const notes = [note("latest"), note("one"), note("two")];

    expect(buildHomeRouteView({
      notes,
      page: 1,
      pageSize: 2,
      sourceHref: "#/",
    })).toEqual({
      latestNote: {
        href: "#/note/latest.md?from=%2F",
        collection: "essay",
        title: "latest",
        excerpt: "这篇笔记还没有摘要，打开文章页可以继续阅读全文。",
        dateLabel: null,
        dateTime: null,
      },
      paged: {
        items: [notes[1], notes[2]],
        currentPage: 1,
        totalPages: 1,
      },
    });
  });

  it("derives tag diagnostic enablement from dev and debug flags", () => {
    expect(isTagDiagnosticsEnabled({ isDev: true })).toBe(true);
    expect(isTagDiagnosticsEnabled({ routeDebugTag: "1" })).toBe(true);
    expect(isTagDiagnosticsEnabled({ searchDebugTag: "1" })).toBe(true);
    expect(isTagDiagnosticsEnabled({ localStorageDebugTag: "1" })).toBe(true);
    expect(isTagDiagnosticsEnabled({
      isDev: false,
      routeDebugTag: "0",
      searchDebugTag: null,
      localStorageDebugTag: null,
    })).toBe(false);
  });

  it("builds note navigation card state", () => {
    expect(buildNoteNavigationCardView({
      label: "上一页",
      note: null,
      emptyLabel: "已经是最新文章",
      sourceHref: "#/note/current.md",
      align: "previous",
    })).toEqual({
      className: "note-nav-card note-nav-previous note-nav-card-disabled",
      isDisabled: true,
      label: "上一页",
      emptyLabel: "已经是最新文章",
      item: null,
    });

    expect(buildNoteNavigationCardView({
      label: "下一页",
      note: {
        title: "下一篇",
        relativePath: "posts/next.md",
        summary: null,
        excerpt: null,
        tags: [],
        category: "inbox",
        collection: "技术",
        collections: ["技术"],
        created: null,
        updated: null,
        date: null,
        sortKey: null,
        draft: false,
      },
      emptyLabel: "没有更早文章",
      sourceHref: "#/note/current.md",
      align: "next",
    })).toMatchObject({
      className: "note-nav-card note-nav-next",
      isDisabled: false,
      label: "下一页",
      emptyLabel: "没有更早文章",
      item: {
        href: "#/note/posts%2Fnext.md?from=%2Fnote%2Fcurrent.md",
        title: "下一篇",
        collection: "技术",
      },
    });
  });

  it("builds ready-to-log tag diagnostics from raw notes, normalized notes, and the tag tree", () => {
    const rawNotes: RawNoteSummary[] = [
      {
        title: "P1000",
        relativePath: "luogu/P1000.md",
        summary: null,
        excerpt: null,
        category: "luogu",
        collection: "题解",
        created: null,
        updated: null,
        date: null,
        sortKey: null,
        draft: false,
        tags: ["图论"],
        metadata: { tags: ["最短路"] },
      },
      {
        title: "No Tags",
        relativePath: "inbox/no-tags.md",
        summary: null,
        excerpt: null,
        category: "inbox",
        collection: "未归档",
        created: null,
        updated: null,
        date: null,
        sortKey: null,
        draft: true,
        tags: [],
      },
    ];
    const normalizedNotes: NoteSummary[] = [
      {
        title: "P1000",
        relativePath: "luogu/P1000.md",
        summary: null,
        excerpt: null,
        tags: ["图论", "最短路"],
        category: "luogu",
        collection: "题解",
        collections: ["题解"],
        created: null,
        updated: null,
        date: null,
        sortKey: null,
        draft: false,
      },
    ];
    const tree = [
      tagNode({
        name: "图论",
        fullPath: "算法/图论",
        depth: 2,
        count: 1,
        children: [
          tagNode({
            name: "最短路",
            fullPath: "算法/图论/最短路",
            depth: 3,
            count: 1,
          }),
        ],
      }),
    ];

    const diagnostics = buildTagDiagnostics(rawNotes, normalizedNotes, tree);

    expect(diagnostics.returnedNotesCount).toBe(2);
    expect(diagnostics.rawFirstNoteKeys).toContain("metadata");
    expect(diagnostics.rawRows[0]).toMatchObject({
      title: "P1000",
      path: "luogu/P1000.md",
      tags: ["图论"],
      metadataTags: ["最短路"],
      draft: false,
    });
    expect(diagnostics.normalizedRows[0]).toMatchObject({
      title: "P1000",
      path: "luogu/P1000.md",
      tags: ["图论", "最短路"],
    });
    expect(diagnostics.normalizedTagTotal).toBe(2);
    expect(diagnostics.tagTreeRootCount).toBe(1);
    expect(diagnostics.tagTreeNodeCount).toBe(2);
    expect(diagnostics.rawTagFailureRows).toEqual([]);
  });

  it("includes raw tag failure rows when fetched notes produce no normalized tags", () => {
    const rawNotes: RawNoteSummary[] = [{
      title: "Broken Tags",
      relativePath: "inbox/broken.md",
      summary: null,
      excerpt: null,
      category: "inbox",
      collection: "未归档",
      created: null,
      updated: null,
      date: null,
      sortKey: null,
      draft: false,
      tags: { value: "bad-shape" },
    }];

    expect(buildTagDiagnostics(rawNotes, [], [])).toMatchObject({
      normalizedTagTotal: 0,
      tagTreeRootCount: 0,
      rawTagFailureRows: [{
        title: "Broken Tags",
        path: "inbox/broken.md",
        reason: "top-level tags has no usable string values",
      }],
    });
  });
});
