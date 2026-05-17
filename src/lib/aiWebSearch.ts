import type { NoteChatContextPayload } from "@/lib/api";

export type WebSearchMode = "off" | "auto";

export type WebSearchProvider = "brave" | "bocha" | "searxng";

export type WebSourceReliability =
  | "official"
  | "wiki"
  | "community_solution"
  | "discussion"
  | "blog"
  | "unknown";

export type WebSourceRelevance = "strong" | "candidate" | "unrelated";

export type WebSourceExcerptStatus =
  | "not_requested"
  | "fetched"
  | "unavailable"
  | "failed";

export type WebCacheStatus = "miss" | "hit" | "stale" | "disabled";

export type ResearchIntent =
  | "no_search"
  | "oi_problem"
  | "oi_discussion"
  | "algorithm_reference"
  | "debug_issue"
  | "general_web";

export type WebSource = {
  id: string;
  title: string;
  url: string;
  site?: string;
  snippet?: string;
  sourceType?: "problem" | "solution" | "discussion" | "wiki" | "blog" | "official" | "unknown";
  reliability?: WebSourceReliability;
  reliabilityLabel?: string;
  reliabilityReason?: string;
  relevance?: WebSourceRelevance;
  relevanceLabel?: string;
  relevanceReason?: string;
  excerptStatus?: WebSourceExcerptStatus;
  excerpt?: string;
  excerptError?: string;
  fetchedAt?: number;
  cacheStatus?: WebCacheStatus;
  cachedAt?: string;
  cacheTtlSeconds?: number;
  isConstructed?: boolean;
  constructedReason?: string;
  selected?: boolean;
};

export type PublicWebRequestPolicy = {
  useCookies: false;
  useBrowserHistory: false;
  useLoginState: false;
  useLocalPrivateData: false;
  bypassAntiBot: false;
  sendMinimalQueryOnly: true;
};

export type WebSearchConfig = {
  enabled: boolean;
  provider: WebSearchProvider;
  braveApiKey: string;
  bochaApiKey: string;
  bochaEndpoint: string;
  searxngEndpoint: string;
  publicSearchConsent: boolean;
};

export type WebSearchRequest = {
  queries: string[];
  intent: ResearchIntent;
  problemId?: string;
  algorithmKeywords?: string[];
  maxResults?: number;
};

export type WebSearchResult = {
  id: string;
  title: string;
  url: string;
  site?: string;
  snippet?: string;
  sourceType?: WebSource["sourceType"];
  reliability?: WebSourceReliability;
  reliabilityLabel?: string;
  reliabilityReason?: string;
  relevance?: WebSourceRelevance;
  relevanceLabel?: string;
  relevanceReason?: string;
  excerptStatus?: WebSourceExcerptStatus;
  excerpt?: string;
  excerptError?: string;
  fetchedAt?: number;
  cacheStatus?: WebCacheStatus;
  cachedAt?: string;
  cacheTtlSeconds?: number;
  isConstructed?: boolean;
  constructedReason?: string;
  selected?: boolean;
};

export type WebSourceExcerptRequest = {
  sources: WebSearchResult[];
  maxSources?: number;
  maxCharsPerSource?: number;
};

export type WebSourceExcerptResult = {
  id: string;
  url: string;
  title: string;
  fetched: boolean;
  excerpt?: string;
  error?: string;
  fetchedAt: number;
  cacheStatus?: WebCacheStatus;
  cachedAt?: string;
  cacheTtlSeconds?: number;
};

export type SearchDecision = {
  shouldSearch: boolean;
  intent: ResearchIntent;
  problemId?: string;
  problemTitle?: string;
  algorithmKeywords?: string[];
  errorKeywords?: string[];
  queries: string[];
  confidence?: number;
  reason?: string;
};

const PROBLEM_PATTERNS = [
  /\bP\d{3,6}\b/gi,
  /\bCF\d{3,5}[A-Z]\d?\b/gi,
  /\b(?:ABC|ARC|AGC)\d{3}[A-H]?\b/gi,
];

const OI_DISCUSSION_KEYWORDS = ["讨论", "警示后人", "坑", "常见坑", "hack", "数据"];
const OI_SOLUTION_KEYWORDS = ["题解", "洛谷", "Luogu", "Codeforces", "AtCoder"];
const DEBUG_KEYWORDS = ["WA", "TLE", "RE", "MLE", "CE", "超时", "爆内存", "复杂度", "错误", "调试"];
const ALGORITHM_KEYWORDS = [
  "点分治",
  "点分树",
  "线段树",
  "平衡树",
  "最短路",
  "网络流",
  "二分图",
  "树状数组",
  "动态规划",
  "字符串哈希",
  "后缀数组",
  "倍增",
  "拓扑排序",
  "强连通分量",
  "费用流",
  "LCA",
  "Dijkstra",
  "并查集",
  "DSU",
  "BIT",
  "KMP",
  "SCC",
];
const GENERAL_WEB_KEYWORDS = ["最新", "官网", "文档", "版本", "资料", "网页", "链接", "新闻", "消息", "更新", "近期", "最近", "动态"];
const RECENT_INFO_TIME_KEYWORDS = ["最近", "近期", "最新", "今天", "昨天", "今年", "本周", "本月", "刚刚"];
const RECENT_INFO_CONTENT_KEYWORDS = ["新闻", "消息", "更新", "动态", "进展", "发布"];
const EXPLICIT_WEB_SEARCH_KEYWORDS = [
  "搜一下",
  "查一下",
  "查查",
  "搜搜",
  "联网",
  "网上",
  "公开网页",
  "有没有资料",
  "帮我查",
  "找资料",
  "看资料",
  "看 oi wiki",
  "看oi wiki",
];
const EXPLANATION_ONLY_KEYWORDS = ["是什么", "什么意思", "怎么理解", "解释一下", "原理", "概念"];
const SEARCH_CONFIDENCE_THRESHOLD = 0.65;

const unique = (items: string[]): string[] => [...new Set(items.filter(Boolean))];

export const DEFAULT_WEB_SEARCH_CONFIG: WebSearchConfig = {
  enabled: false,
  provider: "searxng",
  braveApiKey: "",
  bochaApiKey: "",
  bochaEndpoint: "https://api.bochaai.com/v1/web-search",
  searxngEndpoint: "",
  publicSearchConsent: false,
};

const normalizeWebSearchProvider = (config: Partial<WebSearchConfig> | null | undefined): WebSearchProvider => {
  if (config?.provider === "bocha" || config?.provider === "brave" || config?.provider === "searxng") {
    return config.provider;
  }
  if (typeof config?.braveApiKey === "string" && config.braveApiKey.trim()) {
    return "brave";
  }
  if (typeof config?.bochaApiKey === "string" && config.bochaApiKey.trim()) {
    return "bocha";
  }
  return "searxng";
};

export const normalizeWebSearchConfig = (config: Partial<WebSearchConfig> | null | undefined): WebSearchConfig => ({
  enabled: config?.enabled === true,
  provider: normalizeWebSearchProvider(config),
  braveApiKey: typeof config?.braveApiKey === "string" ? config.braveApiKey.trim() : "",
  bochaApiKey: typeof config?.bochaApiKey === "string" ? config.bochaApiKey.trim() : "",
  bochaEndpoint: typeof config?.bochaEndpoint === "string"
    ? config.bochaEndpoint.trim()
    : DEFAULT_WEB_SEARCH_CONFIG.bochaEndpoint,
  searxngEndpoint: typeof config?.searxngEndpoint === "string" ? config.searxngEndpoint.trim() : "",
  publicSearchConsent: config?.publicSearchConsent === true,
});

export const PUBLIC_WEB_REQUEST_POLICY: PublicWebRequestPolicy = {
  useCookies: false,
  useBrowserHistory: false,
  useLoginState: false,
  useLocalPrivateData: false,
  bypassAntiBot: false,
  sendMinimalQueryOnly: true,
};

const collectMatches = (text: string, patterns: RegExp[]): string[] =>
  unique(patterns.flatMap((pattern) => text.match(pattern) ?? []).map((item) => item.toUpperCase()));

const collectKeywords = (text: string, keywords: string[]): string[] =>
  keywords.filter((keyword) => text.toLocaleLowerCase().includes(keyword.toLocaleLowerCase()));

const compactQuery = (query: string): string => query.replace(/\s+/g, " ").trim();

const trimQuery = (query: string): string => compactQuery(query).slice(0, 80);

const escapeQueryPhrase = (value: string): string => value.replace(/"/g, "").trim();

const normalizeSearchText = (value: string): string => value.toLocaleLowerCase();

const tokenizeProblemTitle = (title: string): string[] =>
  unique(
    title
      .split(/[^A-Za-z0-9\u4e00-\u9fff]+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2)
      .slice(0, 6),
  );

const extractEnglishProblemTitle = (text: string): string => {
  const withoutProblemId = text.replace(/\bP\d{3,6}\b/gi, " ");
  const match = withoutProblemId.match(/\b[A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,5}\b/);
  if (!match) return "";
  const title = compactQuery(match[0]);
  const stopWords = new Set(["WA", "TLE", "RE", "MLE", "CE", "AI", "OI", "Luogu", "Codeforces", "AtCoder"]);
  return stopWords.has(title) ? "" : title;
};

const getProblemSynonyms = (text: string): string[] => {
  const normalized = normalizeSearchText(text);
  const pairs: Array<[string, string[]]> = [
    ["最近公共祖先", ["LCA", "倍增 LCA"]],
    ["lca", ["最近公共祖先", "倍增 LCA"]],
    ["单源最短路径", ["Dijkstra"]],
    ["dijkstra", ["单源最短路径"]],
    ["点分树", ["动态点分治"]],
    ["动态点分治", ["点分树"]],
    ["并查集", ["DSU"]],
    ["dsu", ["并查集"]],
    ["树状数组", ["BIT"]],
    ["bit", ["树状数组"]],
  ];
  return unique(pairs.flatMap(([keyword, synonyms]) => normalized.includes(normalizeSearchText(keyword)) ? synonyms : []));
};

type PublicAlgorithmSourceMapping = {
  aliases: string[];
  source: Omit<WebSource, "id" | "snippet" | "relevance" | "relevanceLabel" | "relevanceReason" | "selected" | "isConstructed" | "constructedReason">;
};

const PUBLIC_ALGORITHM_SOURCE_MAPPINGS: PublicAlgorithmSourceMapping[] = [
  {
    aliases: ["最近公共祖先", "lca", "倍增 lca"],
    source: {
      title: "OI Wiki 最近公共祖先",
      url: "https://oi-wiki.org/graph/lca/",
      site: "OI Wiki",
      sourceType: "wiki",
      reliability: "wiki",
      reliabilityLabel: "知识库",
      reliabilityReason: "OI Wiki 公开算法资料入口，未抓取网页正文。",
    },
  },
  {
    aliases: ["最近公共祖先", "lca"],
    source: {
      title: "cp-algorithms Lowest Common Ancestor",
      url: "https://cp-algorithms.com/graph/lca.html",
      site: "cp-algorithms",
      sourceType: "wiki",
      reliability: "wiki",
      reliabilityLabel: "知识库",
      reliabilityReason: "cp-algorithms 公开算法资料入口，未抓取网页正文。",
    },
  },
  {
    aliases: ["单源最短路径", "dijkstra", "最短路"],
    source: {
      title: "OI Wiki 最短路",
      url: "https://oi-wiki.org/graph/shortest-path/",
      site: "OI Wiki",
      sourceType: "wiki",
      reliability: "wiki",
      reliabilityLabel: "知识库",
      reliabilityReason: "OI Wiki 公开算法资料入口，未抓取网页正文。",
    },
  },
  {
    aliases: ["dijkstra", "单源最短路径"],
    source: {
      title: "cp-algorithms Dijkstra",
      url: "https://cp-algorithms.com/graph/dijkstra.html",
      site: "cp-algorithms",
      sourceType: "wiki",
      reliability: "wiki",
      reliabilityLabel: "知识库",
      reliabilityReason: "cp-algorithms 公开算法资料入口，未抓取网页正文。",
    },
  },
  {
    aliases: ["并查集", "dsu"],
    source: {
      title: "OI Wiki 并查集",
      url: "https://oi-wiki.org/ds/dsu/",
      site: "OI Wiki",
      sourceType: "wiki",
      reliability: "wiki",
      reliabilityLabel: "知识库",
      reliabilityReason: "OI Wiki 公开算法资料入口，未抓取网页正文。",
    },
  },
  {
    aliases: ["并查集", "dsu"],
    source: {
      title: "cp-algorithms Disjoint Set Union",
      url: "https://cp-algorithms.com/data_structures/disjoint_set_union.html",
      site: "cp-algorithms",
      sourceType: "wiki",
      reliability: "wiki",
      reliabilityLabel: "知识库",
      reliabilityReason: "cp-algorithms 公开算法资料入口，未抓取网页正文。",
    },
  },
  {
    aliases: ["树状数组", "bit", "fenwick"],
    source: {
      title: "OI Wiki 树状数组",
      url: "https://oi-wiki.org/ds/fenwick/",
      site: "OI Wiki",
      sourceType: "wiki",
      reliability: "wiki",
      reliabilityLabel: "知识库",
      reliabilityReason: "OI Wiki 公开算法资料入口，未抓取网页正文。",
    },
  },
  {
    aliases: ["树状数组", "bit", "fenwick"],
    source: {
      title: "cp-algorithms Fenwick Tree",
      url: "https://cp-algorithms.com/data_structures/fenwick.html",
      site: "cp-algorithms",
      sourceType: "wiki",
      reliability: "wiki",
      reliabilityLabel: "知识库",
      reliabilityReason: "cp-algorithms 公开算法资料入口，未抓取网页正文。",
    },
  },
  {
    aliases: ["线段树", "segment tree"],
    source: {
      title: "OI Wiki 线段树",
      url: "https://oi-wiki.org/ds/seg/",
      site: "OI Wiki",
      sourceType: "wiki",
      reliability: "wiki",
      reliabilityLabel: "知识库",
      reliabilityReason: "OI Wiki 公开算法资料入口，未抓取网页正文。",
    },
  },
  {
    aliases: ["线段树", "segment tree"],
    source: {
      title: "cp-algorithms Segment Tree",
      url: "https://cp-algorithms.com/data_structures/segment_tree.html",
      site: "cp-algorithms",
      sourceType: "wiki",
      reliability: "wiki",
      reliabilityLabel: "知识库",
      reliabilityReason: "cp-algorithms 公开算法资料入口，未抓取网页正文。",
    },
  },
  {
    aliases: ["kmp", "字符串匹配"],
    source: {
      title: "OI Wiki KMP",
      url: "https://oi-wiki.org/string/kmp/",
      site: "OI Wiki",
      sourceType: "wiki",
      reliability: "wiki",
      reliabilityLabel: "知识库",
      reliabilityReason: "OI Wiki 公开算法资料入口，未抓取网页正文。",
    },
  },
  {
    aliases: ["kmp", "prefix function"],
    source: {
      title: "cp-algorithms Prefix Function",
      url: "https://cp-algorithms.com/string/prefix-function.html",
      site: "cp-algorithms",
      sourceType: "wiki",
      reliability: "wiki",
      reliabilityLabel: "知识库",
      reliabilityReason: "cp-algorithms 公开算法资料入口，未抓取网页正文。",
    },
  },
  {
    aliases: ["强连通分量", "scc"],
    source: {
      title: "OI Wiki 强连通分量",
      url: "https://oi-wiki.org/graph/scc/",
      site: "OI Wiki",
      sourceType: "wiki",
      reliability: "wiki",
      reliabilityLabel: "知识库",
      reliabilityReason: "OI Wiki 公开算法资料入口，未抓取网页正文。",
    },
  },
  {
    aliases: ["强连通分量", "scc"],
    source: {
      title: "cp-algorithms Strongly Connected Components",
      url: "https://cp-algorithms.com/graph/strongly-connected-components.html",
      site: "cp-algorithms",
      sourceType: "wiki",
      reliability: "wiki",
      reliabilityLabel: "知识库",
      reliabilityReason: "cp-algorithms 公开算法资料入口，未抓取网页正文。",
    },
  },
  {
    aliases: ["拓扑排序", "topological sort"],
    source: {
      title: "OI Wiki 拓扑排序",
      url: "https://oi-wiki.org/graph/topo/",
      site: "OI Wiki",
      sourceType: "wiki",
      reliability: "wiki",
      reliabilityLabel: "知识库",
      reliabilityReason: "OI Wiki 公开算法资料入口，未抓取网页正文。",
    },
  },
  {
    aliases: ["拓扑排序", "topological sort"],
    source: {
      title: "cp-algorithms Topological Sorting",
      url: "https://cp-algorithms.com/graph/topological-sort.html",
      site: "cp-algorithms",
      sourceType: "wiki",
      reliability: "wiki",
      reliabilityLabel: "知识库",
      reliabilityReason: "cp-algorithms 公开算法资料入口，未抓取网页正文。",
    },
  },
  {
    aliases: ["网络流", "最大流", "dinic"],
    source: {
      title: "cp-algorithms Dinic's Algorithm",
      url: "https://cp-algorithms.com/graph/dinic.html",
      site: "cp-algorithms",
      sourceType: "wiki",
      reliability: "wiki",
      reliabilityLabel: "知识库",
      reliabilityReason: "cp-algorithms 公开算法资料入口，未抓取网页正文。",
    },
  },
  {
    aliases: ["点分治", "点分树", "动态点分治", "centroid decomposition"],
    source: {
      title: "cp-algorithms Centroid Decomposition",
      url: "https://cp-algorithms.com/graph/centroid_decomposition.html",
      site: "cp-algorithms",
      sourceType: "wiki",
      reliability: "wiki",
      reliabilityLabel: "知识库",
      reliabilityReason: "cp-algorithms 公开算法资料入口，未抓取网页正文。",
    },
  },
];

const getExperienceQueryKeywords = (text: string, errorKeywords: string[]): string[] => {
  const normalized = normalizeSearchText(text);
  const keywords = [
    normalized.includes("模板") || normalized.includes("template") ? "模板" : "",
    normalized.includes("坑") || normalized.includes("常见") ? "常见错误" : "",
    normalized.includes("坑") ? "坑" : "",
    normalized.includes("注意") ? "注意事项" : "",
    ...errorKeywords,
  ];
  return unique(keywords);
};

const stripSearchRequestPhrases = (text: string): string => text
  .replace(/(?:联网|网上)?(?:搜一下|查一下|查查|搜搜|帮我查|找资料|看资料)/g, " ")
  .replace(/(?:并)?结合(?:搜索结果)?摘要回答/g, " ")
  .replace(/(?:有什么|有没有)?(?:常见坑|常见错误|注意事项|题解|讨论|新闻|消息|更新)/g, " ");

const getProblemTitleCandidate = (
  input: string,
  context?: Pick<NoteChatContextPayload, "noteTitle" | "summary">,
): string => {
  const candidates = [context?.noteTitle, input, context?.summary].filter((item): item is string => !!item?.trim());
  for (const candidate of candidates) {
    const searchCleanedCandidate = stripSearchRequestPhrases(candidate);
    const englishTitle = extractEnglishProblemTitle(searchCleanedCandidate);
    if (englishTitle) return englishTitle;
    const cleaned = searchCleanedCandidate
      .replace(/\bP\d{3,6}\b/gi, " ")
      .replace(/\bCF\d{3,5}[A-Z]\d?\b/gi, " ")
      .replace(/\b(?:ABC|ARC|AGC)\d{3}[A-H]?\b/gi, " ")
      .replace(/[()[\]【】#*_`"'“”‘’:：|/\\，,。！？?；;-]+/g, " ")
      .replace(/\b(?:题解|洛谷|Luogu|Codeforces|AtCoder|WA|TLE|RE|MLE|CE)\b/gi, " ");
    const words = compactQuery(cleaned);
    if (words.length >= 3 && words.length <= 40) return words;
  }
  return "";
};

const buildProblemQueries = (
  problemId: string,
  title: string,
  discussionKeywords: string[],
  errorKeywords: string[],
  question: string,
): string[] => unique([
  title ? trimQuery(`${problemId} ${title}`) : "",
  title ? trimQuery(`${problemId} ${title} 题解`) : "",
  ...getProblemSynonyms(`${title} ${question}`).flatMap((keyword) => [
    trimQuery(`${problemId} ${keyword} 题解`),
    trimQuery(`${problemId} ${keyword} 常见坑`),
  ]),
  ...getExperienceQueryKeywords(`${title} ${question}`, errorKeywords).map((keyword) => trimQuery(`${problemId} ${keyword}`)),
  title && normalizeSearchText(`${title} ${question}`).includes("最近公共祖先") ? trimQuery(`${problemId} 倍增 LCA 注意事项`) : "",
  title && normalizeSearchText(`${title} ${question}`).includes("最近公共祖先") ? trimQuery(`${problemId} fa数组 开多大`) : "",
  title && normalizeSearchText(`${title} ${question}`).includes("最近公共祖先") ? trimQuery(`${problemId} 递归 爆栈`) : "",
  title ? trimQuery(`"${escapeQueryPhrase(problemId)}" "${escapeQueryPhrase(title)}" 题解`) : "",
  trimQuery(`洛谷 ${problemId} 题解`),
  trimQuery(`洛谷 ${problemId} 讨论`),
  trimQuery(`${problemId} 警示后人`),
  trimQuery(`${problemId} WA TLE 常见坑`),
  errorKeywords.length > 0 ? trimQuery(`${problemId} ${errorKeywords.join(" ")} 常见坑`) : "",
  title && discussionKeywords.length > 0 ? trimQuery(`${problemId} ${title} 讨论`) : "",
]).slice(0, 10);

const buildAlgorithmQueries = (algorithmKeywords: string[], errorKeywords: string[]): string[] =>
  unique(algorithmKeywords.flatMap((keyword) => {
    const relatedKeywords = unique([keyword, ...getProblemSynonyms(keyword)]).slice(0, 3);
    return relatedKeywords.flatMap((item) => [
      trimQuery(`OI Wiki ${item}`),
      trimQuery(`${item} 题解`),
      trimQuery(`${item} 常见错误`),
      errorKeywords.length > 0 ? trimQuery(`${item} ${errorKeywords.join(" ")}`) : "",
    ]);
  })).slice(0, 10);

const isRecentInfoRequest = (text: string): boolean =>
  hasKeyword(text, RECENT_INFO_TIME_KEYWORDS) && hasKeyword(text, RECENT_INFO_CONTENT_KEYWORDS);

const buildGeneralWebQueries = (question: string, recentInfoRequested: boolean): string[] => {
  const cleaned = compactQuery(question
    .replace(/(?:联网|网上)?(?:搜一下|查一下|查查|搜搜|帮我查|找资料|看资料)/g, " ")
    .replace(/(?:有没有|有什么|请问|一下|吗|呢)/g, " ")
    .replace(/[？?。！!,，、:：；;]/g, " "));

  if (!recentInfoRequested) {
    return cleaned ? [trimQuery(cleaned)] : [trimQuery(question)];
  }

  const normalized = normalizeSearchText(cleaned);
  const queries = [
    cleaned,
    /(?:NOIP|CSP)/i.test(cleaned) ? "CSP NOIP 最新消息" : "",
    normalized.includes("信息学竞赛") ? "信息学竞赛 最新消息" : "",
    normalized.includes("ai") ? "最近 AI 新闻" : "",
    normalized.includes("gpt") ? "GPT 最近更新" : "",
  ];
  return unique(queries.map(trimQuery)).slice(0, 4);
};

export type WebSourceRelevanceResult = {
  sources: WebSource[];
  filteredCount: number;
  strongCount: number;
  candidateCount: number;
};

export const buildLuoguDeterministicSources = (problemId: string): WebSource[] => {
  const normalizedProblemId = problemId.trim().toUpperCase();
  if (!/^P\d{3,6}$/.test(normalizedProblemId)) return [];
  return [
    {
      id: `luogu-problem-${normalizedProblemId}`,
      title: `洛谷 ${normalizedProblemId} 题目页`,
      url: `https://www.luogu.com.cn/problem/${normalizedProblemId}`,
      site: "洛谷",
      snippet: "根据题号构造的洛谷官方题目页，当前阶段尚未读取网页正文或题面内容。",
      sourceType: "problem",
      reliability: "official",
      reliabilityLabel: "官方",
      reliabilityReason: "洛谷公开题目页 URL 由题号确定性构造，未抓取网页正文。",
      relevance: "strong",
      relevanceLabel: "强相关",
      relevanceReason: "由目标题号构造的官方题目页入口。",
      isConstructed: true,
      constructedReason: "根据洛谷题号构造的公开资料入口，当前阶段尚未读取网页正文。",
      selected: true,
    },
    {
      id: `luogu-solution-${normalizedProblemId}`,
      title: `洛谷 ${normalizedProblemId} 题解页`,
      url: `https://www.luogu.com.cn/problem/solution/${normalizedProblemId}`,
      site: "洛谷",
      snippet: "根据题号构造的洛谷题解页入口，当前阶段尚未读取网页正文或题解内容。",
      sourceType: "solution",
      reliability: "community_solution",
      reliabilityLabel: "社区题解",
      reliabilityReason: "洛谷题解页入口由题号确定性构造，内容来自社区题解，未抓取网页正文。",
      relevance: "strong",
      relevanceLabel: "强相关",
      relevanceReason: "由目标题号构造的题解页入口。",
      isConstructed: true,
      constructedReason: "根据洛谷题号构造的公开资料入口，当前阶段尚未读取网页正文。",
      selected: true,
    },
  ];
};

const isOiResearchIntent = (decision: SearchDecision): boolean =>
  decision.intent === "oi_problem" ||
  decision.intent === "oi_discussion" ||
  decision.intent === "algorithm_reference" ||
  decision.intent === "debug_issue";

const buildAlgorithmSourceCandidates = (
  decision: SearchDecision,
  userInput = "",
  context?: Pick<NoteChatContextPayload, "noteTitle" | "tags" | "summary" | "selectedText">,
): WebSource[] => {
  const searchText = normalizeSearchText([
    userInput,
    decision.problemTitle,
    decision.algorithmKeywords?.join(" "),
    context?.noteTitle,
    context?.tags?.join(" "),
    context?.summary,
  ].filter(Boolean).join(" "));

  return PUBLIC_ALGORITHM_SOURCE_MAPPINGS
    .filter((mapping) => mapping.aliases.some((alias) => searchText.includes(normalizeSearchText(alias))))
    .map((mapping): WebSource => {
      const id = `public-oi-${mapping.source.site?.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}-${mapping.source.url.split("/").filter(Boolean).pop()?.replace(/[^a-z0-9]+/gi, "-") ?? "source"}`;
      return {
        ...mapping.source,
        id,
        snippet: "公开算法资料入口，当前阶段尚未读取网页正文。",
        relevance: decision.problemId ? "candidate" : "strong",
        relevanceLabel: decision.problemId ? "相关资料" : "强相关",
        relevanceReason: decision.problemId
          ? "由题名或算法关键词匹配的公开算法资料入口，不一定是目标题目的直接讨论。"
          : "由算法关键词匹配的公开算法资料入口。",
        isConstructed: true,
        constructedReason: "根据算法关键词构造的公开资料入口，当前阶段尚未读取网页正文。",
        selected: !decision.problemId,
      };
    });
};

export const buildPublicOiSourceCandidates = (
  decision: SearchDecision,
  userInput = "",
  context?: Pick<NoteChatContextPayload, "noteTitle" | "tags" | "summary" | "selectedText">,
): WebSource[] => {
  if (!decision.shouldSearch || !isOiResearchIntent(decision)) return [];
  return [
    ...(decision.problemId ? buildLuoguDeterministicSources(decision.problemId) : []),
    ...buildAlgorithmSourceCandidates(decision, userInput, context),
  ];
};

const getSourceSearchText = (source: WebSource): string =>
  normalizeSearchText([source.title, source.snippet, source.url, source.site].filter(Boolean).join(" "));

const isKnownOiSource = (source: WebSource): boolean => {
  const text = getSourceSearchText(source);
  return [
    "luogu.com.cn",
    "oi-wiki",
    "codeforces.com",
    "atcoder.jp",
    "cnblogs.com",
    "csdn.net",
    "blog.csdn",
    "acwing.com",
  ].some((site) => text.includes(site));
};

const classifyProblemSourceRelevance = (
  source: WebSource,
  problemId: string,
  problemTitle?: string,
): { relevance: WebSourceRelevance; score: number; reason: string } => {
  const normalizedProblemId = problemId.trim().toUpperCase();
  const searchText = getSourceSearchText(source);
  const exactProblemId = normalizeSearchText(normalizedProblemId);
  const hasExactProblemId = searchText.includes(exactProblemId);
  const otherProblemIds = unique((searchText.match(/\bp\d{3,6}\b/gi) ?? []).map((item) => item.toUpperCase()))
    .filter((item) => item !== normalizedProblemId);
  const synonyms = getProblemSynonyms(problemTitle ?? "");
  const titleTokens = tokenizeProblemTitle([problemTitle, ...synonyms].filter(Boolean).join(" "));
  const matchedTitleTokens = titleTokens.filter((token) => searchText.includes(normalizeSearchText(token)));
  const hasEnoughTitleMatch = titleTokens.length > 0 && matchedTitleTokens.length >= Math.min(titleTokens.length, 2);
  const hasPartialTitleMatch = titleTokens.length > 1 && matchedTitleTokens.length >= 1;
  const hasAlgorithmSynonym = synonyms.some((keyword) => searchText.includes(normalizeSearchText(keyword)));

  if (source.id === `luogu-problem-${normalizedProblemId}` || source.id === `luogu-solution-${normalizedProblemId}`) {
    return { relevance: "strong", score: 100, reason: "由目标题号构造的确定性洛谷入口。" };
  }
  if (source.isConstructed && source.relevance === "candidate") {
    return { relevance: "candidate", score: 52, reason: "由算法关键词构造的公开资料入口，作为相关算法背景，不直接代表目标题目的题解或讨论。" };
  }
  if (hasExactProblemId && (hasEnoughTitleMatch || hasAlgorithmSynonym)) {
    return { relevance: "strong", score: 92, reason: "来源同时命中目标题号和题名 / 算法关键词。" };
  }
  if (hasExactProblemId) {
    return { relevance: "strong", score: 84, reason: "来源命中目标题号。" };
  }
  if (hasEnoughTitleMatch || hasAlgorithmSynonym) {
    return { relevance: "strong", score: 66, reason: "来源命中题名或同义算法关键词。" };
  }
  if (otherProblemIds.length > 0) {
    return { relevance: "unrelated", score: -100, reason: "来源出现其它题号且未命中目标题号或算法关键词。" };
  }
  if (hasPartialTitleMatch && isKnownOiSource(source) && titleTokens.length > 0) {
    return { relevance: "candidate", score: 38, reason: "来源来自常见 OI 站点或命中部分算法关键词，作为相关资料候选。" };
  }
  return { relevance: "unrelated", score: -20, reason: "未命中题号、题名或算法关键词。" };
};

export const prepareWebSourcesForDecision = (
  rawSources: WebSource[],
  decision: SearchDecision,
  userInput = "",
  context?: Pick<NoteChatContextPayload, "noteTitle" | "tags" | "summary" | "selectedText">,
): WebSourceRelevanceResult => {
  const publicOiSources = buildPublicOiSourceCandidates(decision, userInput, context);
  const candidates = [...publicOiSources, ...rawSources];

  if (!decision.problemId) {
    const seen = new Set<string>();
    const sources = candidates.filter((source) => {
      const key = source.url.trim().toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 10).map((source, index) => ({
      ...source,
      relevance: source.relevance ?? "strong",
      relevanceLabel: source.relevanceLabel ?? "强相关",
      relevanceReason: source.relevanceReason ?? "无明确题号时保留搜索 Provider 返回的来源。",
      selected: index < 8,
    }));
    return {
      sources,
      filteredCount: 0,
      strongCount: sources.filter((source) => source.relevance === "strong").length,
      candidateCount: sources.filter((source) => source.relevance === "candidate").length,
    };
  }

  const scored = candidates.map((source, index) => ({
    source,
    index,
    ...classifyProblemSourceRelevance(source, decision.problemId ?? "", decision.problemTitle),
  }));
  const relevant = scored.filter((item) => item.relevance !== "unrelated");
  const filteredCount = scored.length - relevant.length;
  const seen = new Set<string>();
  let selectedCandidateCount = 0;
  const sources = relevant
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .filter(({ source }) => {
      const key = source.url.trim().toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => {
      const selected = item.relevance === "strong" || selectedCandidateCount < 2;
      if (item.relevance === "candidate" && selected) selectedCandidateCount += 1;
      return {
        ...item.source,
        relevance: item.relevance,
        relevanceLabel: item.relevance === "strong" ? "强相关" : "相关资料",
        relevanceReason: item.reason,
        selected,
      };
    })
    .slice(0, 10);

  return {
    sources,
    filteredCount,
    strongCount: sources.filter((source) => source.relevance === "strong").length,
    candidateCount: sources.filter((source) => source.relevance === "candidate").length,
  };
};

const hasKeyword = (text: string, keywords: string[]): boolean =>
  keywords.some((keyword) => text.toLocaleLowerCase().includes(keyword.toLocaleLowerCase()));

const clampConfidence = (value: number): number => Math.max(0, Math.min(1, Number(value.toFixed(2))));

export function buildSearchDecision(
  input: string,
  context?: Pick<NoteChatContextPayload, "noteTitle" | "tags" | "summary" | "selectedText">,
): SearchDecision {
  const question = input.trim();
  const contextText = [
    context?.noteTitle,
    context?.tags?.join(" "),
    context?.summary,
    context?.selectedText,
  ].filter(Boolean).join(" ");
  const haystack = `${question}\n${contextText}`;

  const problemIds = collectMatches(haystack, PROBLEM_PATTERNS);
  const discussionKeywords = collectKeywords(haystack, OI_DISCUSSION_KEYWORDS);
  const solutionKeywords = collectKeywords(haystack, OI_SOLUTION_KEYWORDS);
  const algorithmKeywords = collectKeywords(haystack, ALGORITHM_KEYWORDS);
  const errorKeywords = collectKeywords(haystack, DEBUG_KEYWORDS);
  const generalWebKeywords = collectKeywords(haystack, GENERAL_WEB_KEYWORDS);
  const explicitWebSearchRequested = hasKeyword(haystack, EXPLICIT_WEB_SEARCH_KEYWORDS);
  const recentInfoRequested = isRecentInfoRequest(question);
  const explanationOnlyRequested = hasKeyword(question, EXPLANATION_ONLY_KEYWORDS);
  const problemTitle = getProblemTitleCandidate(question, context);
  const reasons: string[] = [];
  let confidence = 0.08;

  if (explicitWebSearchRequested) {
    confidence += 0.48;
    reasons.push("用户明确要求联网查资料");
  }
  if (problemIds.length > 0) {
    confidence += 0.46;
    reasons.push(`识别到题号 ${problemIds[0]}`);
  }
  if (discussionKeywords.length > 0) {
    confidence += problemIds.length > 0 || explicitWebSearchRequested ? 0.2 : 0.12;
    reasons.push("问题涉及讨论 / 常见坑 / 警示后人");
  }
  if (errorKeywords.length > 0) {
    confidence += problemIds.length > 0 || explicitWebSearchRequested || solutionKeywords.length > 0 ? 0.24 : 0.12;
    reasons.push("问题涉及 WA / TLE / RE 等调试线索");
  }
  if (generalWebKeywords.length > 0) {
    confidence += 0.24;
    reasons.push("问题依赖外部或时效性资料");
  }
  if (recentInfoRequested) {
    confidence += 0.36;
    reasons.push("问题在询问最近新闻 / 消息 / 更新");
  }
  if (algorithmKeywords.length > 0) {
    if (explicitWebSearchRequested || generalWebKeywords.length > 0) {
      confidence += 0.22;
      reasons.push(`识别到算法关键词：${algorithmKeywords[0]}`);
    } else if (discussionKeywords.length > 0 || errorKeywords.length > 0) {
      confidence += 0.48;
      reasons.push(`用户在询问 ${algorithmKeywords[0]} 的实现坑 / 错误经验`);
    } else if (!problemIds.length && !errorKeywords.length && !discussionKeywords.length) {
      confidence += 0.12;
    }
  }
  if (
    explanationOnlyRequested &&
    algorithmKeywords.length > 0 &&
    !explicitWebSearchRequested &&
    !generalWebKeywords.length &&
    !problemIds.length &&
    !errorKeywords.length &&
    !discussionKeywords.length
  ) {
    confidence -= 0.18;
  }
  if (!question) {
    confidence = 0;
  }
  confidence = clampConfidence(confidence);

  const shouldSearch = confidence >= SEARCH_CONFIDENCE_THRESHOLD;

  if (problemIds.length > 0) {
    const problemId = problemIds[0];
    const intent: ResearchIntent =
      errorKeywords.length > 0 ? "debug_issue" :
      discussionKeywords.length > 0 ? "oi_discussion" :
      "oi_problem";
    return {
      shouldSearch,
      intent,
      problemId,
      problemTitle: problemTitle || undefined,
      algorithmKeywords: algorithmKeywords.length > 0 ? algorithmKeywords : undefined,
      errorKeywords: errorKeywords.length > 0 ? errorKeywords : undefined,
      queries: shouldSearch ? buildProblemQueries(problemId, problemTitle, discussionKeywords, errorKeywords, question) : [],
      confidence,
      reason: reasons.join("，") || "识别到题号，并且联网可能有帮助。",
    };
  }

  if (
    algorithmKeywords.length > 0 &&
    (explicitWebSearchRequested || generalWebKeywords.length > 0 || discussionKeywords.length > 0 || errorKeywords.length > 0)
  ) {
    return {
      shouldSearch,
      intent: "algorithm_reference",
      algorithmKeywords,
      errorKeywords: errorKeywords.length > 0 ? errorKeywords : undefined,
      queries: shouldSearch ? buildAlgorithmQueries(algorithmKeywords, errorKeywords) : [],
      confidence,
      reason: reasons.join("，") || "用户在查算法外部资料。",
    };
  }

  if (errorKeywords.length > 0 && (solutionKeywords.length > 0 || discussionKeywords.length > 0)) {
    return {
      shouldSearch,
      intent: "debug_issue",
      errorKeywords,
      queries: shouldSearch ? [compactQuery(`${question} ${errorKeywords.join(" ")}`)] : [],
      confidence,
      reason: reasons.join("，") || "问题偏向调试排查，联网可能补充经验来源。",
    };
  }

  if (generalWebKeywords.length > 0 || explicitWebSearchRequested || recentInfoRequested) {
    return {
      shouldSearch,
      intent: "general_web",
      queries: shouldSearch ? buildGeneralWebQueries(question, recentInfoRequested) : [],
      confidence,
      reason: reasons.join("，") || "用户在请求外部网页资料。",
    };
  }

  return {
    shouldSearch: false,
    intent: "no_search",
    queries: [],
    confidence,
    reason: algorithmKeywords.length > 0 && explanationOnlyRequested
      ? "当前更像算法概念解释，本地回答通常已足够。"
      : "当前问题主要可由笔记上下文和模型自身能力回答，无需联网。",
  };
}
