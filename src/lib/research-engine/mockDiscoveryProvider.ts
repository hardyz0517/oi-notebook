import { createDiscoveryProvider } from "./discoveryProvider";
import type {
  DiscoveryProvider,
  DiscoveryProviderName,
  DiscoveryProviderRequest,
  DiscoveryProviderResponse,
  DiscoveryRawResult,
  SourceType,
} from "./types";

type MockItem = {
  url: string;
  title: string;
  snippet: string;
  sourceTypeHint?: SourceType;
  publishedAt?: string;
};

const includesAny = (value: string, terms: string[]): boolean => {
  const lower = value.toLocaleLowerCase();
  return terms.some((term) => lower.includes(term.toLocaleLowerCase()));
};

const mkRaw = (
  provider: DiscoveryProviderName,
  providerPriority: number,
  request: DiscoveryProviderRequest,
  items: MockItem[],
): DiscoveryRawResult[] =>
  items.map((item, index) => ({
    id: `${provider}:${request.query.purpose}:${index}:${item.url}`,
    provider,
    providerPriority,
    query: request.query.query,
    queryPurpose: request.query.purpose,
    queryLanguage: request.query.language,
    resultIndex: index,
    url: item.url,
    title: item.title,
    snippet: item.snippet,
    publishedAt: item.publishedAt,
    discoveredAt: index,
    sourceTypeHint: item.sourceTypeHint,
    extensions: {
      phase4: {
        mockProvider: provider,
      },
    },
  }));

const response = (
  provider: DiscoveryProviderName,
  priority: number,
  request: DiscoveryProviderRequest,
  items: MockItem[],
): DiscoveryProviderResponse => ({
  providerName: provider,
  query: request.query.query,
  queryPurpose: request.query.purpose,
  rawResults: mkRaw(provider, priority, request, items),
  status: "available",
  timing: {
    startedAt: request.nowMs ?? 0,
    finishedAt: request.nowMs ?? 0,
    elapsedMs: 0,
    timedOut: false,
  },
  diagnostics: {
    itemCount: items.length,
    deterministic: true,
  },
});

const duplicateItems = (request: DiscoveryProviderRequest, items: MockItem[]): MockItem[] => {
  if (!request.scenario?.duplicateResults || items.length === 0) return items;
  return [...items, { ...items[0], url: `${items[0].url}?utm_source=duplicate` }];
};

const reactDocsItems = (): MockItem[] => [
  {
    url: "https://react.dev/reference/react/useEffect",
    title: "useEffect - React",
    snippet: "Official React reference for synchronizing a component with an external system.",
    sourceTypeHint: "docs",
  },
  {
    url: "https://developer.mozilla.org/en-US/docs/Web/API",
    title: "Web APIs - MDN",
    snippet: "MDN background reference for browser APIs often used inside effects.",
    sourceTypeHint: "docs",
  },
  {
    url: "https://blog.csdn.net/react_useeffect_guide",
    title: "React useEffect complete guide",
    snippet: "Search optimized tutorial with copied examples.",
    sourceTypeHint: "seo_aggregator",
  },
];

const oiItems = (): MockItem[] => [
  {
    url: "https://www.luogu.com.cn/problem/P3379",
    title: "P3379 recent common ancestor",
    snippet: "Luogu problem statement for LCA template practice.",
    sourceTypeHint: "community",
  },
  {
    url: "https://oi-wiki.org/graph/lca/",
    title: "LCA - OI Wiki",
    snippet: "Algorithm notes for binary lifting and common pitfalls.",
    sourceTypeHint: "docs",
  },
  {
    url: "https://cp-algorithms.com/graph/lca_binary_lifting.html",
    title: "Lowest Common Ancestor - cp-algorithms",
    snippet: "Binary lifting implementation details and complexity.",
    sourceTypeHint: "docs",
  },
  {
    url: "https://blog.csdn.net/p3379_lca",
    title: "P3379 LCA solution",
    snippet: "Low quality reposted solution notes.",
    sourceTypeHint: "seo_aggregator",
  },
];

const openAiNewsItems = (): MockItem[] => [
  {
    url: "https://openai.com/news/",
    title: "OpenAI News",
    snippet: "Official OpenAI announcements and product updates.",
    sourceTypeHint: "official",
    publishedAt: "2026-06-04",
  },
  {
    url: "https://www.reuters.com/technology/openai-latest-news/",
    title: "OpenAI latest news - Reuters",
    snippet: "Mainstream coverage of current OpenAI developments.",
    sourceTypeHint: "mainstream_news",
    publishedAt: "2026-06-04",
  },
  {
    url: "https://techcrunch.com/tag/openai/",
    title: "OpenAI - TechCrunch",
    snippet: "Technology media tracking OpenAI announcements.",
    sourceTypeHint: "tech_media",
    publishedAt: "2026-06-03",
  },
];

const rumorItems = (): MockItem[] => [
  {
    url: "https://www.thepaper.cn/newsDetail_forward_zhangxuefeng",
    title: "Zhang Xuefeng latest public activity and rebuttal",
    snippet: "Mainstream media notes recent public activity and rebuts the death rumor.",
    sourceTypeHint: "mainstream_news",
    publishedAt: "2026-06-04",
  },
  {
    url: "https://open.example.com/zhangxuefeng/activity",
    title: "Zhang Xuefeng recent public activity",
    snippet: "Authority style activity page with current public appearance information.",
    sourceTypeHint: "official",
    publishedAt: "2026-06-04",
  },
  {
    url: "https://forum.example.com/thread/rumor-zhangxuefeng",
    title: "Zhang Xuefeng death rumor discussion",
    snippet: "Forum rumor without primary evidence.",
    sourceTypeHint: "forum",
    publishedAt: "2026-06-04",
  },
];

const generalWebItems = (): MockItem[] => [
  {
    url: "https://www.example-official.com/current",
    title: "Official current information",
    snippet: "Official page for current facts and versions.",
    sourceTypeHint: "official",
    publishedAt: "2026-06-04",
  },
  {
    url: "https://www.reuters.com/world/current-fact/",
    title: "Current fact report",
    snippet: "Mainstream current report.",
    sourceTypeHint: "mainstream_news",
    publishedAt: "2026-06-04",
  },
];

const itemsForWeb = (request: DiscoveryProviderRequest): MockItem[] => {
  const text = `${request.request.userQuestion} ${request.query.query}`;
  if (includesAny(text, ["react", "useeffect", "vite", "tauri", "command"])) return reactDocsItems().slice(1);
  if (includesAny(text, ["p3379", "lca", "centroid", "oi wiki"])) return oiItems().slice(1);
  if (includesAny(text, ["openai", "news"])) return openAiNewsItems();
  if (includesAny(text, [
    "zhang",
    "xuefeng",
    "died",
    "death",
    "rumor",
    "\u5f20\u96ea\u5cf0",
    "\u6b7b\u4e86",
    "\u6b7b\u4ea1",
    "\u53bb\u4e16",
    "\u8c23\u8a00",
  ])) return rumorItems();
  return generalWebItems();
};

const itemsForOfficialDocs = (request: DiscoveryProviderRequest): MockItem[] => {
  const text = `${request.request.userQuestion} ${request.query.query}`;
  if (includesAny(text, ["tauri", "command"])) {
    return [
      {
        url: "https://tauri.app/develop/calling-rust/",
        title: "Calling Rust from the frontend - Tauri",
        snippet: "Official Tauri command documentation.",
        sourceTypeHint: "docs",
      },
      {
        url: "https://tauri.app/reference/javascript/api/",
        title: "Tauri JavaScript API",
        snippet: "Official API reference.",
        sourceTypeHint: "docs",
      },
    ];
  }
  return reactDocsItems();
};

const itemsForExactUrl = (request: DiscoveryProviderRequest): MockItem[] => {
  const url = request.policy.focusEntities.find((entity) => /^https?:\/\//i.test(entity)) ?? request.query.query;
  return [
    {
      url,
      title: `Explicit URL: ${url}`,
      snippet: "User supplied URL captured as an exact discovery target.",
      sourceTypeHint: "official",
    },
  ];
};

export const createMockWebProvider = (): DiscoveryProvider =>
  createDiscoveryProvider({
    name: "mock_web",
    capabilities: ["web_search"],
    priority: 40,
    execute: (request) => response("mock_web", 40, request, duplicateItems(request, itemsForWeb(request))),
  });

export const createMockNewsProvider = (): DiscoveryProvider =>
  createDiscoveryProvider({
    name: "mock_news",
    capabilities: ["news_search"],
    priority: 70,
    execute: (request) => {
      const text = `${request.request.userQuestion} ${request.query.query}`;
      const items = includesAny(text, [
        "zhang",
        "xuefeng",
        "died",
        "death",
        "rumor",
        "\u5f20\u96ea\u5cf0",
        "\u6b7b\u4e86",
        "\u6b7b\u4ea1",
        "\u53bb\u4e16",
        "\u8c23\u8a00",
      ])
        ? rumorItems()
        : openAiNewsItems();
      return response("mock_news", 70, request, duplicateItems(request, items));
    },
  });

export const createMockOfficialDocsProvider = (): DiscoveryProvider =>
  createDiscoveryProvider({
    name: "mock_official_docs",
    capabilities: ["official_docs"],
    priority: 80,
    execute: (request) => response("mock_official_docs", 80, request, duplicateItems(request, itemsForOfficialDocs(request))),
  });

export const createMockOiProvider = (): DiscoveryProvider =>
  createDiscoveryProvider({
    name: "mock_oi",
    capabilities: ["oi_sources"],
    priority: 75,
    execute: (request) => response("mock_oi", 75, request, duplicateItems(request, oiItems())),
  });

export const createMockExactUrlProvider = (): DiscoveryProvider =>
  createDiscoveryProvider({
    name: "mock_exact_url",
    capabilities: ["exact_url"],
    priority: 90,
    execute: (request) => response("mock_exact_url", 90, request, itemsForExactUrl(request)),
  });

export const createMockDiscoveryProviders = (): DiscoveryProvider[] => [
  createMockExactUrlProvider(),
  createMockOfficialDocsProvider(),
  createMockOiProvider(),
  createMockNewsProvider(),
  createMockWebProvider(),
];
