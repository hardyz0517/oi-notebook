import type {
  RealDiscoveryProviderConfig,
  RealDiscoveryTransport,
  RealDiscoveryTransportError,
  RealDiscoveryTransportResponse,
  RealProviderFixture,
  RealProviderFixtureKind,
} from "./realProviderTypes";

const response = (body: unknown, statusCode = 200): RealDiscoveryTransportResponse => ({
  statusCode,
  headers: { "content-type": "application/json" },
  bodyText: typeof body === "string" ? body : JSON.stringify(body),
  elapsedMs: 12,
  fromFixture: true,
});

const error = (
  kind: RealDiscoveryTransportError["kind"],
  message: string,
  statusCode?: number,
): RealDiscoveryTransportError => ({
  kind,
  message,
  statusCode,
  elapsedMs: 12,
});

export const realProviderConfigs = {
  bing: (): RealDiscoveryProviderConfig => ({
    providerName: "bing",
    enabled: true,
    endpoint: "https://api.bing.example/search",
    apiKeyRedacted: "sk-...redacted",
    credentialAvailable: true,
    credentialPolicy: "required",
    timeoutMs: 1200,
    maxResults: 5,
    locale: "en-US",
    safeSearch: "moderate",
    capabilities: ["web_search"],
    payloadKind: "bing_like",
    providerPriority: 88,
  }),
  brave: (): RealDiscoveryProviderConfig => ({
    providerName: "brave",
    enabled: true,
    endpoint: "https://api.brave.example/search",
    apiKeyRedacted: "brave-...redacted",
    credentialAvailable: true,
    credentialPolicy: "required",
    timeoutMs: 1200,
    maxResults: 5,
    locale: "en-US",
    safeSearch: "moderate",
    capabilities: ["web_search", "news_search"],
    payloadKind: "brave_like",
    providerPriority: 84,
  }),
  bocha: (): RealDiscoveryProviderConfig => ({
    providerName: "bocha",
    enabled: true,
    endpoint: "https://api.bocha.example/search",
    apiKeyRedacted: "bocha-...redacted",
    credentialAvailable: true,
    credentialPolicy: "required",
    timeoutMs: 1200,
    maxResults: 5,
    locale: "zh-CN",
    safeSearch: "moderate",
    capabilities: ["web_search", "news_search"],
    payloadKind: "bocha_like",
    providerPriority: 86,
  }),
};

const fixtures: Record<RealProviderFixtureKind, RealProviderFixture> = {
  bing_react_docs: {
    kind: "bing_react_docs",
    providerName: "bing",
    payloadKind: "bing_like",
    response: response({
      webPages: {
        value: [
          {
            name: "useEffect - React",
            url: "https://react.dev/reference/react/useEffect",
            snippet: "Official React reference for synchronizing a component with an external system.",
            datePublished: "2026-01-10",
          },
          {
            name: "React docs",
            url: "https://react.dev/learn",
            snippet: "Official learning material for React.",
          },
        ],
      },
    }),
  },
  brave_openai_news: {
    kind: "brave_openai_news",
    providerName: "brave",
    payloadKind: "brave_like",
    response: response({
      web: {
        results: [
          {
            title: "OpenAI News",
            url: "https://openai.com/news/",
            description: "Official OpenAI announcements and product updates.",
            age: "2026-06-04",
            profile: { name: "OpenAI" },
          },
          {
            title: "OpenAI latest news - Reuters",
            url: "https://www.reuters.com/technology/openai-latest-news/",
            description: "Mainstream coverage of current OpenAI developments.",
            age: "2026-06-04",
            profile: { name: "Reuters" },
          },
        ],
      },
    }),
  },
  bocha_zh_rumor: {
    kind: "bocha_zh_rumor",
    providerName: "bocha",
    payloadKind: "bocha_like",
    response: response({
      data: {
        webPages: [
          {
            title: "\u5f20\u96ea\u5cf0\u8fd1\u671f\u516c\u5f00\u6d3b\u52a8\u4e0e\u8f9f\u8c23",
            url: "https://www.thepaper.cn/newsDetail_forward_zhangxuefeng",
            summary: "\u4e3b\u6d41\u5a92\u4f53\u63d0\u5230\u8fd1\u671f\u516c\u5f00\u6d3b\u52a8\uff0c\u5e76\u8f9f\u8c23\u6b7b\u4ea1\u4f20\u8a00\u3002",
            publishedTime: "2026-06-04",
            siteName: "\u6f8e\u6e43\u65b0\u95fb",
          },
          {
            title: "\u5f20\u96ea\u5cf0\u6b7b\u4ea1\u4f20\u8a00\u8ba8\u8bba",
            url: "https://forum.example.com/thread/rumor-zhangxuefeng",
            summary: "\u8bba\u575b\u4f20\u8a00\uff0c\u7f3a\u5c11\u4e00\u624b\u8bc1\u636e\u3002",
            publishedTime: "2026-06-04",
            siteName: "\u8bba\u575b",
          },
        ],
      },
    }),
  },
  malformed: {
    kind: "malformed",
    providerName: "bing",
    payloadKind: "bing_like",
    response: response("{not-json"),
  },
  empty: {
    kind: "empty",
    providerName: "bing",
    payloadKind: "bing_like",
    response: response({ webPages: { value: [] } }),
  },
  rate_limited: {
    kind: "rate_limited",
    providerName: "brave",
    payloadKind: "brave_like",
    response: response({ message: "rate limited" }, 429),
  },
  unauthorized: {
    kind: "unauthorized",
    providerName: "bing",
    payloadKind: "bing_like",
    response: response({ message: "unauthorized" }, 401),
  },
  timeout: {
    kind: "timeout",
    providerName: "bing",
    payloadKind: "bing_like",
    error: error("timeout", "fixture timeout"),
  },
  aborted: {
    kind: "aborted",
    providerName: "bing",
    payloadKind: "bing_like",
    error: error("aborted", "fixture aborted"),
  },
};

export const getRealProviderFixture = (kind: RealProviderFixtureKind): RealProviderFixture => fixtures[kind];

export const createFixtureTransport = (kind: RealProviderFixtureKind): RealDiscoveryTransport => {
  const fixture = getRealProviderFixture(kind);
  return () => fixture.error ? { ok: false, error: fixture.error } : { ok: true, response: fixture.response ?? response({}) };
};
