import type { NoteChatContextPayload } from "@/lib/api";

export type WebSearchMode = "off" | "auto";

export type WebSearchProvider = "bing" | "bocha" | "brave";

export type SearchMode = WebSearchMode;

export type WebSourceReliability =
  | "official"
  | "wiki"
  | "community_solution"
  | "discussion"
  | "blog"
  | "unknown";

export const WEB_SOURCE_RELIABILITIES = [
  "official",
  "wiki",
  "community_solution",
  "discussion",
  "blog",
  "unknown",
] as const satisfies readonly WebSourceReliability[];

export type WebSourceRelevance = "strong" | "candidate" | "unrelated";

export type WebSourceExcerptStatus =
  | "not_requested"
  | "fetched"
  | "blocked"
  | "unavailable"
  | "failed";

export const WEB_SOURCE_EXCERPT_STATUSES = [
  "not_requested",
  "fetched",
  "blocked",
  "unavailable",
  "failed",
] as const satisfies readonly WebSourceExcerptStatus[];

export type WebEvidenceStatus = "candidate" | "fetched" | "usable" | "rejected";

export const WEB_EVIDENCE_STATUSES = [
  "candidate",
  "fetched",
  "usable",
  "rejected",
] as const satisfies readonly WebEvidenceStatus[];

export type WebPageType =
  | "article"
  | "news_article"
  | "docs"
  | "homepage"
  | "search_page"
  | "redirect"
  | "login"
  | "download"
  | "api_docs"
  | "encyclopedia"
  | "forum"
  | "unknown";

export const WEB_PAGE_TYPES = [
  "article",
  "news_article",
  "docs",
  "homepage",
  "search_page",
  "redirect",
  "login",
  "download",
  "api_docs",
  "encyclopedia",
  "forum",
  "unknown",
] as const satisfies readonly WebPageType[];

export type WebContentStatus =
  | "not_fetched"
  | "fetched"
  | "partial"
  | "unavailable"
  | "needs_js"
  | "blocked"
  | "failed"
  | "search_summary_only"
  | "too_short"
  | "wrong_page_type";

export const WEB_CONTENT_STATUSES = [
  "not_fetched",
  "fetched",
  "partial",
  "unavailable",
  "needs_js",
  "blocked",
  "failed",
  "search_summary_only",
  "too_short",
  "wrong_page_type",
] as const satisfies readonly WebContentStatus[];

export type WebSourceStrength = "strong" | "medium" | "weak" | "rejected";

export const WEB_SOURCE_STRENGTHS = [
  "strong",
  "medium",
  "weak",
  "rejected",
] as const satisfies readonly WebSourceStrength[];

export type WebCacheStatus = "miss" | "hit" | "stale" | "disabled";

export const WEB_CACHE_STATUSES = [
  "miss",
  "hit",
  "stale",
  "disabled",
] as const satisfies readonly WebCacheStatus[];

export type WebDiscoveryMethod =
  | "local_note"
  | "explicit_url"
  | "direct_rss"
  | "direct_site"
  | "constructed_source"
  | "search_provider"
  | "cached_excerpt";

export const WEB_DISCOVERY_METHODS = [
  "local_note",
  "explicit_url",
  "direct_rss",
  "direct_site",
  "constructed_source",
  "search_provider",
  "cached_excerpt",
] as const satisfies readonly WebDiscoveryMethod[];

export type WebSourceKind =
  | "explicit_url"
  | "search_result"
  | "constructed_source"
  | "rss_item"
  | "official_news"
  | "official_blog"
  | "media_article"
  | "aggregator_item"
  | "docs_page"
  | "oi_reference"
  | "github_page";

export const WEB_SOURCE_KINDS = [
  "explicit_url",
  "search_result",
  "constructed_source",
  "rss_item",
  "official_news",
  "official_blog",
  "media_article",
  "aggregator_item",
  "docs_page",
  "oi_reference",
  "github_page",
] as const satisfies readonly WebSourceKind[];

export type SearchIntent =
  | "explicit_url"
  | "local_note"
  | "news_recent"
  | "docs_technical"
  | "oi_algorithm"
  | "github_project"
  | "general_knowledge"
  | "general_web";

export type WebReadErrorKind =
  | "invalid_url"
  | "unsupported_scheme"
  | "private_network"
  | "redirect_blocked"
  | "dns_failed"
  | "timeout"
  | "tls_error"
  | "http_status"
  | "content_type_unsupported"
  | "too_large"
  | "blocked_or_unreadable"
  | "parse_failed"
  | "unknown";

export type WebReadRequest = {
  url: string;
  title?: string;
  snippet?: string;
  sourceKind: WebSourceKind;
  reason?: string;
  queryHint?: string;
  maxChars?: number;
  cachePolicy?: "default" | "refresh" | "cache_only";
  relevanceHints?: string[];
};

export type WebReadResult = {
  url: string;
  finalUrl?: string;
  title: string;
  siteName?: string;
  status: "fetched" | "partial" | "blocked" | "failed" | "cached" | "stale";
  excerpt?: string;
  excerptQuality?: "high" | "medium" | "low" | "snippet_only" | "title_only" | "unavailable" | "too_short" | "good" | "partial" | "empty" | "blocked" | "failed";
  extractor?: "oi_wiki" | "cp_algorithms" | "luogu" | "generic" | "none";
  excerptReason?: string;
  codeBlocksTruncated?: boolean;
  cacheStatus?: WebCacheStatus;
  errorKind?: WebReadErrorKind;
  errorMessage?: string;
  fetchedAt: number;
};

export type ResearchIntent =
  | "no_search"
  | "oi_problem"
  | "oi_discussion"
  | "algorithm_reference"
  | "debug_issue"
  | "general_web";

export const mapResearchIntentToSearchIntent = (
  intent: ResearchIntent,
  vertical?: SearchVertical,
  freshness?: AiSearchFreshness,
): SearchIntent => {
  if (vertical === "explicit_url") return "explicit_url";
  if (vertical === "docs") return "docs_technical";
  if (vertical === "news" || freshness === "news") return "news_recent";
  if (vertical === "oi" || vertical === "algorithm") return "oi_algorithm";
  if (intent === "oi_problem" || intent === "oi_discussion" || intent === "algorithm_reference" || intent === "debug_issue") {
    return "oi_algorithm";
  }
  return "general_web";
};

export type SearchVertical =
  | "news"
  | "oi"
  | "algorithm"
  | "general_web"
  | "product"
  | "docs"
  | "explicit_url"
  | "no_search";

export type SearchDepth = "quick" | "normal" | "deep" | "news" | "oi_research";

export type DiscoveryCandidate = Pick<
  WebSource,
  | "id"
  | "title"
  | "url"
  | "originalUrl"
  | "resolvedUrl"
  | "finalUrl"
  | "site"
  | "snippet"
  | "sourceKind"
  | "discoveryMethod"
  | "sourceReliability"
  | "discoveredBy"
  | "feedUrl"
  | "sourceHome"
  | "directDiscoveryReason"
>;

export type FetchedSource = WebSource & {
  excerptStatus: "fetched" | "blocked" | "unavailable" | "failed";
};

export type EvidenceSource = WebSource & {
  evidenceStatus: WebEvidenceStatus;
  usableEvidence: boolean;
  injectedIntoAnswer: boolean;
};

export type NewsCluster = Pick<
  WebSource,
  "eventCluster" | "clusterLabel" | "clusterReason" | "clusterSize" | "selectedForRoundup" | "droppedAsDuplicateCluster"
>;

export type WebSource = {
  id: string;
  title: string;
  url: string;
  originalUrl?: string;
  resolvedUrl?: string;
  finalUrl?: string;
  site?: string;
  snippet?: string;
  sourceKind?: WebSourceKind;
  discoveryMethod?: WebDiscoveryMethod;
  sourceReliability?: WebSourceReliability | "media" | "docs";
  discoveredBy?: string;
  feedUrl?: string;
  sourceHome?: string;
  directDiscoveryReason?: string;
  searchProvider?: WebSearchProvider;
  searchStage?: "api" | "rss" | "html" | "html-fallback" | string;
  dateHint?: string;
  freshnessScore?: number;
  searchDiagnostics?: string;
  newsLike?: boolean;
  filteredReason?: string;
  finalIncludedInPrompt?: boolean;
  evidenceStatus?: WebEvidenceStatus;
  usableEvidence?: boolean;
  injectedIntoAnswer?: boolean;
  evidenceReason?: string;
  rejectedReason?: string;
  pageType?: WebPageType;
  contentStatus?: WebContentStatus;
  sourceStrength?: WebSourceStrength;
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
  contentType?: string;
  bodyBytes?: number;
  extractedTextChars?: number;
  excerptChars?: number;
  publishedAt?: string;
  finalUrlHost?: string;
  fetchedAt?: number;
  cacheStatus?: WebCacheStatus;
  readStatus?: WebReadResult["status"];
  errorKind?: WebReadErrorKind;
  cachedAt?: string;
  cacheTtlSeconds?: number;
  excerptQuality?: "high" | "medium" | "low" | "snippet_only" | "title_only" | "unavailable" | "too_short" | "good" | "partial" | "empty" | "blocked" | "failed";
  extractor?: "oi_wiki" | "cp_algorithms" | "luogu" | "generic" | "none";
  excerptReason?: string;
  blockedReason?: string;
  needsJsReason?: string;
  extractionFailureReason?: string;
  codeBlocksTruncated?: boolean;
  rankScore?: number;
  rankReason?: string;
  sourceRegistryBoost?: number;
  sourceRegistryReason?: string;
  sourceRegistryLabel?: string;
  readPriority?: number;
  isConstructed?: boolean;
  constructedReason?: string;
  selected?: boolean;
  citationId?: string;
  eventCluster?: string;
  clusterLabel?: string;
  clusterReason?: string;
  clusterSize?: number;
  selectedForRoundup?: boolean;
  droppedAsDuplicateCluster?: boolean;
  queryFocusEntities?: string[];
  companySpecificNews?: boolean;
  focusEntitySource?: "raw_user_query" | "search_query" | "none";
  candidatePrimaryEntities?: string[];
  entityMatchStrength?: "primary" | "secondary" | "mention" | "none";
  entityFilterApplied?: boolean;
  rejectedWrongEntityReason?: string;
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
  publicSearchConsent: boolean;
};

export type AiSearchFreshness = "none" | "recent" | "latest" | "news";

export type WebSearchRequest = {
  /**
   * The user's original question. Source routing uses this for company-specific
   * news focus; expanded search queries/topic keywords must not broaden it.
   */
  rawUserQuery?: string;
  queries: string[];
  intent: ResearchIntent;
  vertical?: SearchVertical;
  freshness?: AiSearchFreshness;
  problemId?: string;
  algorithmKeywords?: string[];
  topicKeywords?: string[];
  maxResults?: number;
};

export type AiSearchQueryPlan = {
  searchGoal?: string;
  vertical?: SearchVertical;
  rewrittenIntent: string;
  queries: string[];
  topicKeywords: string[];
  requiredKeywords?: string[];
  negativeKeywords?: string[];
  freshness: AiSearchFreshness;
  depth?: SearchDepth;
  readBudget?: number;
  preferredSourceTypes?: string[];
  preferredDomains?: string[];
  avoidSourceTypes?: string[];
  reason: string;
  confidence: number;
};

export type AiSearchPlannerContext = {
  currentDate: string;
  currentDateText: string;
  currentTimeZone: string;
  locale: string;
  recencyWindowHint: string;
};

export type SourceRegistryEntry = {
  domain: string;
  label: string;
  verticals: SearchVertical[];
  sourceTypes: string[];
  reliabilityWeight: number;
  freshnessWeight: number;
  language: "zh" | "en" | "mixed";
  queryBoostKeywords: string[];
  avoidForVerticals?: SearchVertical[];
  notes?: string;
};

export type WebReadBudgetPlan = {
  depth: SearchDepth;
  maxCandidates: number;
  targetReadSuccesses: number;
  maxReadAttempts: number;
  maxPromptSources: number;
  maxConcurrentReads: number;
  reason: string;
};

export type SourceStrategyPlan = {
  vertical: SearchVertical;
  preferredSourceTypes: string[];
  preferredDomains: string[];
  avoidedSourceTypes: string[];
  targetedQueries: string[];
  droppedTargetedQueries: Array<{ query: string; reason: string }>;
  registryBoosts: Array<{ domain: string; label: string; weight: number; reason: string }>;
  readBudget: WebReadBudgetPlan;
  candidateLimit: number;
  reason: string;
};

export type AiSearchPlannerState = {
  enabled: boolean;
  used: boolean;
  trigger: "initial" | "off_topic_retry" | "disabled" | "fallback";
  ruleBasedQueries: string[];
  searchGoal?: string;
  vertical?: SearchVertical;
  generatedQueries?: string[];
  rewrittenIntent?: string;
  topicKeywords?: string[];
  requiredKeywords?: string[];
  negativeKeywords?: string[];
  freshness?: AiSearchFreshness;
  plannerContext?: AiSearchPlannerContext;
  depth?: SearchDepth;
  readBudget?: number;
  preferredSourceTypes?: string[];
  preferredDomains?: string[];
  avoidSourceTypes?: string[];
  reason?: string;
  confidence?: number;
  fallbackReason?: string;
  retried?: boolean;
};

export type WebSearchResult = {
  id: string;
  title: string;
  url: string;
  originalUrl?: string;
  resolvedUrl?: string;
  finalUrl?: string;
  site?: string;
  snippet?: string;
  sourceKind?: WebSourceKind;
  discoveryMethod?: WebDiscoveryMethod;
  sourceReliability?: WebSource["sourceReliability"];
  discoveredBy?: string;
  feedUrl?: string;
  sourceHome?: string;
  directDiscoveryReason?: string;
  searchProvider?: WebSearchProvider;
  searchStage?: "api" | "rss" | "html" | "html-fallback" | string;
  dateHint?: string;
  freshnessScore?: number;
  searchDiagnostics?: string;
  newsLike?: boolean;
  filteredReason?: string;
  finalIncludedInPrompt?: boolean;
  evidenceStatus?: WebEvidenceStatus;
  usableEvidence?: boolean;
  injectedIntoAnswer?: boolean;
  evidenceReason?: string;
  rejectedReason?: string;
  pageType?: WebPageType;
  contentStatus?: WebContentStatus;
  sourceStrength?: WebSourceStrength;
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
  readStatus?: WebReadResult["status"];
  errorKind?: WebReadErrorKind;
  cachedAt?: string;
  cacheTtlSeconds?: number;
  excerptQuality?: WebSource["excerptQuality"];
  extractor?: WebSource["extractor"];
  excerptReason?: string;
  codeBlocksTruncated?: boolean;
  rankScore?: number;
  rankReason?: string;
  isConstructed?: boolean;
  constructedReason?: string;
  selected?: boolean;
  citationId?: string;
  eventCluster?: string;
  clusterLabel?: string;
  clusterReason?: string;
  clusterSize?: number;
  selectedForRoundup?: boolean;
  droppedAsDuplicateCluster?: boolean;
  queryFocusEntities?: string[];
  companySpecificNews?: boolean;
  focusEntitySource?: WebSource["focusEntitySource"];
  candidatePrimaryEntities?: string[];
  entityMatchStrength?: "primary" | "secondary" | "mention" | "none";
  entityFilterApplied?: boolean;
  rejectedWrongEntityReason?: string;
};

export type WebSourceExcerptRequest = {
  sources: WebSearchResult[];
  maxSources?: number;
  maxCharsPerSource?: number;
  userInput?: string;
  intent?: ResearchIntent;
  problemId?: string;
  problemTitle?: string;
  algorithmKeywords?: string[];
  errorKeywords?: string[];
  queries?: string[];
};

export type WebSourceExcerptResult = {
  id: string;
  url: string;
  finalUrl?: string;
  finalUrlHost?: string;
  title: string;
  fetched: boolean;
  status?: WebReadResult["status"];
  excerpt?: string;
  error?: string;
  errorKind?: WebReadErrorKind;
  fetchedAt: number;
  contentType?: string;
  bodyBytes?: number;
  extractedTextChars?: number;
  excerptChars?: number;
  publishedAt?: string;
  cacheStatus?: WebCacheStatus;
  cachedAt?: string;
  cacheTtlSeconds?: number;
  excerptQuality?: WebSource["excerptQuality"];
  extractor?: WebSource["extractor"];
  excerptReason?: string;
  blockedReason?: string;
  needsJsReason?: string;
  extractionFailureReason?: string;
  codeBlocksTruncated?: boolean;
  evidenceStatus?: WebEvidenceStatus;
  usableEvidence?: boolean;
  evidenceReason?: string;
  rejectedReason?: string;
  pageType?: WebPageType;
  contentStatus?: WebContentStatus;
  sourceStrength?: WebSourceStrength;
};

export type SearchDecision = {
  shouldSearch: boolean;
  intent: ResearchIntent;
  rawQuestion?: string;
  problemId?: string;
  problemTitle?: string;
  algorithmKeywords?: string[];
  errorKeywords?: string[];
  topicKeywords?: string[];
  newsIntent?: boolean;
  recencyIntent?: boolean;
  vertical?: SearchVertical;
  sourceStrategy?: SourceStrategyPlan;
  queries: string[];
  aiPlanner?: AiSearchPlannerState;
  confidence?: number;
  reason?: string;
};

export type SearchPlan = {
  decision: SearchDecision;
  canonicalIntent: SearchIntent;
  sourceStrategy?: SourceStrategyPlan;
  readBudget?: WebReadBudgetPlan;
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
const GENERAL_WEB_KEYWORDS = ["最新", "官网", "文档", "版本", "资料", "网页", "链接", "新闻", "消息", "更新", "近期", "最近", "动态", "latest", "recent", "news", "update", "today"];
const RECENT_INFO_TIME_KEYWORDS = ["最近", "近期", "最新", "今天", "昨天", "今年", "本周", "本月", "刚刚", "recently", "recent", "latest", "today"];
const RECENT_INFO_CONTENT_KEYWORDS = ["新闻", "消息", "更新", "动态", "进展", "发布", "news", "update", "updates"];
const GENERIC_SEARCH_ONLY_KEYWORDS = [
  "最近",
  "最新",
  "近期",
  "新闻",
  "动态",
  "消息",
  "有什么",
  "发生了什么",
  "recently",
  "latest",
  "news",
  "update",
  "today",
];
const NEWS_TOPIC_KEYWORDS = [
  "AI",
  "人工智能",
  "大模型",
  "OpenAI",
  "ChatGPT",
  "DeepSeek",
  "Gemini",
  "Claude",
  "Anthropic",
  "Google",
  "Microsoft",
  "NVIDIA",
  "Meta",
  "模型",
  "芯片",
  "算力",
  "机器人",
  "AIGC",
  "机器学习",
  "artificial intelligence",
  "LLM",
  "model",
];
const AI_NEWS_RELEVANCE_KEYWORDS = [
  "AI",
  "人工智能",
  "大模型",
  "OpenAI",
  "ChatGPT",
  "DeepSeek",
  "Gemini",
  "Claude",
  "Anthropic",
  "模型",
  "算力",
  "芯片",
  "机器人",
  "AIGC",
  "机器学习",
  "artificial intelligence",
  "LLM",
  "model",
];
const NEWS_OFF_TOPIC_PATTERNS = [
  /词典|字典|翻译|英语怎么说|怎么说|什么意思|意思|释义/,
  /\bdictionary\b/i,
  /\btranslate\b/i,
  /\btranslation\b/i,
  /\bmeaning\b/i,
  /歌词|歌曲|音乐|视频/,
  /\blyrics?\b/i,
  /\bsongs?\b/i,
  /\bvideo\b/i,
];
const NEWS_REFERENCE_HOST_PATTERNS = [
  /(^|\.)wikipedia\.org$/i,
  /(^|\.)britannica\.com$/i,
];
const NEWS_BLOCKED_HOST_PATTERNS = [
  /(^|\.)github\.com$/i,
  /(^|\.)github\.io$/i,
  /(^|\.)youtube\.com$/i,
  /(^|\.)youtu\.be$/i,
  /(^|\.)bilibili\.com$/i,
];
const NEWS_AUTHORITY_DOMAINS = [
  "openai.com",
  "anthropic.com",
  "deepmind.google",
  "blog.google",
  "techcrunch.com",
  "theverge.com",
  "wired.com",
  "arstechnica.com",
  "reuters.com",
  "apnews.com",
  "bloomberg.com",
  "technologyreview.com",
  "36kr.com",
  "qbitai.com",
  "jiqizhixin.com",
  "leiphone.com",
  "tech.sina.com.cn",
  "finance.sina.com.cn",
  "new.qq.com",
  "thepaper.cn",
];
const NEWS_EVENT_KEYWORDS = [
  "发布",
  "宣布",
  "推出",
  "上线",
  "融资",
  "合作",
  "收购",
  "监管",
  "诉讼",
  "报告",
  "更新",
  "模型",
  "芯片",
  "算力",
  "开源",
  "announces",
  "launches",
  "releases",
  "unveils",
  "raises",
  "funding",
  "partnership",
  "acquisition",
  "regulation",
  "lawsuit",
  "report",
  "update",
  "model",
  "open-source",
  "chip",
];
const NEWS_REFERENCE_TEXT_PATTERNS = [
  /\bwhat is ai\b/i,
  /\bartificial intelligence\s*\(ai\).*definition/i,
  /\bdefinition,\s*examples/i,
  /\bapi documentation\b/i,
  /\bgithub repository\b/i,
  /\bdictionary\b/i,
  /\btranslate\b/i,
  /\bmeaning\b/i,
  /\btutorial\b/i,
  /\bguide\b/i,
  /\bpricing\b/i,
  /\blogin\b/i,
  /\bdownload\b/i,
];
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

const CRITICAL_RECENT_TIME_KEYWORDS = ["\u6700\u8fd1", "\u8fd1\u671f", "\u6700\u65b0", "\u4eca\u5929", "\u6628\u5929", "\u4eca\u5e74", "\u672c\u5468", "\u672c\u6708"];
const CRITICAL_RECENT_CONTENT_KEYWORDS = ["\u65b0\u95fb", "\u6d88\u606f", "\u66f4\u65b0", "\u52a8\u6001", "\u8fdb\u5c55", "\u53d1\u5e03"];
const CRITICAL_NEWS_TOPIC_KEYWORDS = ["AI", "\u4eba\u5de5\u667a\u80fd", "\u5927\u6a21\u578b", "OpenAI", "ChatGPT", "DeepSeek", "Gemini", "Claude", "Anthropic", "Google", "Microsoft", "LLM"];
const CRITICAL_OI_DISCUSSION_KEYWORDS = ["\u8ba8\u8bba", "\u5e38\u89c1\u5751", "\u5751", "\u5b9e\u73b0\u5751", "\u6ce8\u610f\u4e8b\u9879"];
const CRITICAL_ALGORITHM_KEYWORDS = ["\u70b9\u5206\u6cbb", "\u70b9\u5206\u6811", "\u7ebf\u6bb5\u6811", "\u5e76\u67e5\u96c6", "\u6700\u77ed\u8def", "Dijkstra", "LCA", "DSU", "KMP"];
const CRITICAL_TECH_DOC_KEYWORDS = ["react", "useeffect", "hook", "javascript", "css", "html", "web api", "python", "rust", "tauri", "vite", "tailwind", "typescript", "node.js", "nodejs"];

const unique = (items: string[]): string[] => [...new Set(items.filter(Boolean))];

export const SOURCE_REGISTRY: SourceRegistryEntry[] = [
  {
    domain: "oi-wiki.org",
    label: "OI Wiki",
    verticals: ["oi", "algorithm"],
    sourceTypes: ["oi_wiki", "docs"],
    reliabilityWeight: 28,
    freshnessWeight: 0,
    language: "zh",
    queryBoostKeywords: ["OI Wiki", "algorithm", "pitfalls"],
    notes: "Chinese OI and algorithm reference.",
  },
  {
    domain: "cp-algorithms.com",
    label: "cp-algorithms",
    verticals: ["oi", "algorithm"],
    sourceTypes: ["docs", "algorithm"],
    reliabilityWeight: 26,
    freshnessWeight: 0,
    language: "en",
    queryBoostKeywords: ["cp-algorithms", "algorithm", "implementation"],
    notes: "English algorithm reference.",
  },
  {
    domain: "usaco.guide",
    label: "USACO Guide",
    verticals: ["oi", "algorithm"],
    sourceTypes: ["docs", "algorithm"],
    reliabilityWeight: 22,
    freshnessWeight: 0,
    language: "en",
    queryBoostKeywords: ["USACO Guide", "algorithm"],
  },
  {
    domain: "luogu.com.cn",
    label: "Luogu",
    verticals: ["oi"],
    sourceTypes: ["problem", "solution", "discussion"],
    reliabilityWeight: 24,
    freshnessWeight: 2,
    language: "zh",
    queryBoostKeywords: ["Luogu", "problem", "solution"],
  },
  {
    domain: "codeforces.com",
    label: "Codeforces Blog",
    verticals: ["oi", "algorithm"],
    sourceTypes: ["forum", "blog"],
    reliabilityWeight: 18,
    freshnessWeight: 2,
    language: "en",
    queryBoostKeywords: ["Codeforces blog", "algorithm discussion"],
  },
  {
    domain: "cnblogs.com",
    label: "Cnblogs",
    verticals: ["oi", "algorithm"],
    sourceTypes: ["blog"],
    reliabilityWeight: 10,
    freshnessWeight: 1,
    language: "zh",
    queryBoostKeywords: ["solution", "pitfalls"],
  },
  {
    domain: "blog.csdn.net",
    label: "CSDN Blog",
    verticals: ["oi", "algorithm"],
    sourceTypes: ["blog"],
    reliabilityWeight: 5,
    freshnessWeight: 1,
    language: "zh",
    queryBoostKeywords: ["solution"],
  },
  {
    domain: "github.io",
    label: "GitHub Pages",
    verticals: ["oi", "algorithm", "docs"],
    sourceTypes: ["blog", "docs"],
    reliabilityWeight: 11,
    freshnessWeight: 0,
    language: "mixed",
    queryBoostKeywords: ["implementation", "notes"],
    avoidForVerticals: ["news"],
  },
  ...[
    ["openai.com", "OpenAI News", 30, "official_news", "en"],
    ["anthropic.com", "Anthropic News", 28, "official_news", "en"],
    ["deepmind.google", "Google DeepMind", 28, "official_news", "en"],
    ["blog.google", "Google AI Blog", 24, "official_news", "en"],
    ["microsoft.com", "Microsoft AI", 18, "official_news", "en"],
    ["techcrunch.com", "TechCrunch", 24, "tech_news", "en"],
    ["theverge.com", "The Verge", 22, "tech_news", "en"],
    ["wired.com", "Wired", 20, "tech_news", "en"],
    ["arstechnica.com", "Ars Technica", 18, "tech_news", "en"],
    ["reuters.com", "Reuters", 26, "official_news", "en"],
    ["apnews.com", "AP News", 24, "official_news", "en"],
    ["bloomberg.com", "Bloomberg", 22, "official_news", "en"],
    ["36kr.com", "36Kr", 18, "tech_news", "zh"],
    ["qbitai.com", "QbitAI", 18, "tech_news", "zh"],
    ["jiqizhixin.com", "Synced", 18, "tech_news", "zh"],
    ["leiphone.com", "Leiphone", 15, "tech_news", "zh"],
  ].map(([domain, label, reliabilityWeight, sourceType, language]) => ({
    domain: String(domain),
    label: String(label),
    verticals: ["news" as const],
    sourceTypes: [String(sourceType), "news"],
    reliabilityWeight: Number(reliabilityWeight),
    freshnessWeight: 12,
    language: language as "zh" | "en",
    queryBoostKeywords: ["AI", "news", "latest"],
    avoidForVerticals: ["oi" as const, "algorithm" as const],
  })),
  ...[
    ["docs.python.org", "Python Docs"],
    ["developer.mozilla.org", "MDN"],
    ["rust-lang.org", "Rust"],
    ["react.dev", "React"],
    ["tauri.app", "Tauri"],
    ["vite.dev", "Vite"],
    ["tailwindcss.com", "Tailwind CSS"],
  ].map(([domain, label]) => ({
    domain,
    label,
    verticals: ["docs" as const, "general_web" as const],
    sourceTypes: ["docs", "official"],
    reliabilityWeight: 24,
    freshnessWeight: 2,
    language: "en" as const,
    queryBoostKeywords: ["docs", "documentation", "API"],
    avoidForVerticals: ["news" as const],
  })),
];

const EXPLICIT_URL_READ_LIMIT = 3;
const EXPLICIT_URL_MARKDOWN_PATTERN = /\[[^\]]*]\((https?:\/\/[^\s<>"')]+)\)/gi;
const EXPLICIT_URL_TEXT_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi;
const TRAILING_URL_PUNCTUATION = /[.,;:!?，。！？、；：）)\]}】》>"'`]+$/u;
const EXPLICIT_URL_READ_KEYWORDS = [
  "read",
  "summarize",
  "summary",
  "analyze",
  "article",
  "page",
  "link",
  "url",
  "website",
  "webpage",
  "阅读",
  "总结",
  "概括",
  "分析",
  "看看",
  "看下",
  "网页",
  "链接",
  "文章",
  "题解",
  "结合",
  "讲了什么",
];
const URL_AS_TEXT_KEYWORDS = ["润色", "改写", "翻译", "格式化", "提取链接文本"];

export type ExplicitUrlExtractionResult = {
  urls: string[];
  omittedCount: number;
  invalidUrls: string[];
};

export type ExplicitUrlReadPlan = ExplicitUrlExtractionResult & {
  shouldRead: boolean;
  blockedUrls: Array<{ url: string; reason: string }>;
  sources: WebSource[];
};

const stableSourceHash = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const trimTrailingUrlPunctuation = (value: string): string => {
  let current = value.trim();
  while (TRAILING_URL_PUNCTUATION.test(current)) {
    current = current.replace(TRAILING_URL_PUNCTUATION, "");
  }
  return current;
};

const normalizeExplicitUrl = (value: string): string | null => {
  const trimmed = trimTrailingUrlPunctuation(value);
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.hash = parsed.hash;
    return parsed.toString();
  } catch {
    return null;
  }
};

const isPrivateIpv4 = (host: string): boolean => {
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254);
};

const isSearchEngineResultsUrl = (parsed: URL): boolean => {
  const host = parsed.hostname.toLocaleLowerCase().replace(/\.$/, "");
  const path = parsed.pathname.toLocaleLowerCase();
  const params = parsed.searchParams;
  if ((host === "www.google.com" || host.endsWith(".google.com") || host.startsWith("google.")) && path === "/search") return true;
  if ((host === "www.bing.com" || host.endsWith(".bing.com")) && path === "/search") return true;
  if ((host === "www.baidu.com" || host.endsWith(".baidu.com")) && path === "/s") return true;
  if ((host === "duckduckgo.com" || host.endsWith(".duckduckgo.com")) && path === "/" && params.has("q")) return true;
  return false;
};

export const getFrontendWebReadBlockReason = (url: string): string | null => {
  try {
    const parsed = new URL(trimTrailingUrlPunctuation(url));
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "unsupported_scheme";
    }
    if (isSearchEngineResultsUrl(parsed)) {
      return "blocked_or_unreadable";
    }
    const host = parsed.hostname.toLocaleLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host.endsWith(".lan") ||
      host === "::1" ||
      host.startsWith("fe80:") ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      isPrivateIpv4(host)
    ) {
      return "private_network";
    }
    return null;
  } catch {
    return "invalid_url";
  }
};

export const extractExplicitUrls = (input: string, limit = EXPLICIT_URL_READ_LIMIT): ExplicitUrlExtractionResult => {
  const rawUrls: string[] = [];
  for (const match of input.matchAll(EXPLICIT_URL_MARKDOWN_PATTERN)) {
    if (match[1]) rawUrls.push(match[1]);
  }
  for (const match of input.matchAll(EXPLICIT_URL_TEXT_PATTERN)) {
    if (match[0]) rawUrls.push(match[0]);
  }

  const urls: string[] = [];
  const invalidUrls: string[] = [];
  const seen = new Set<string>();
  for (const rawUrl of rawUrls) {
    const normalized = normalizeExplicitUrl(rawUrl);
    if (!normalized) {
      invalidUrls.push(trimTrailingUrlPunctuation(rawUrl));
      continue;
    }
    const key = normalized.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(normalized);
  }

  return {
    urls: urls.slice(0, limit),
    omittedCount: Math.max(0, urls.length - limit),
    invalidUrls,
  };
};

export const shouldReadExplicitUrls = (input: string): boolean => {
  const extraction = extractExplicitUrls(input, Number.MAX_SAFE_INTEGER);
  if (extraction.urls.length === 0) return false;
  const withoutUrls = input
    .replace(EXPLICIT_URL_MARKDOWN_PATTERN, " ")
    .replace(EXPLICIT_URL_TEXT_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (withoutUrls.length <= 18) return true;
  const normalized = input.toLocaleLowerCase();
  if (URL_AS_TEXT_KEYWORDS.some((keyword) => normalized.includes(keyword.toLocaleLowerCase())) &&
    !EXPLICIT_URL_READ_KEYWORDS.some((keyword) => normalized.includes(keyword.toLocaleLowerCase()))) {
    return false;
  }
  return EXPLICIT_URL_READ_KEYWORDS.some((keyword) => normalized.includes(keyword.toLocaleLowerCase()));
};

export const buildExplicitUrlSources = (urls: string[], reason = "User explicitly provided this public URL for reading."): WebSource[] =>
  urls.map((url, index) => {
    const parsed = new URL(url);
    const site = parsed.hostname.replace(/^www\./i, "");
    return {
      id: `explicit-url-${stableSourceHash(url)}`,
      title: site ? `${site}${parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : ""}` : `Explicit URL ${index + 1}`,
      url,
      site,
      snippet: "User-provided public URL; NoteX will try to read a cleaned excerpt before answering.",
      sourceKind: "explicit_url",
      sourceType: "unknown",
      reliability: "unknown",
      reliabilityLabel: "用户链接",
      reliabilityReason: "This source was provided explicitly by the user, not discovered by a search provider.",
      relevance: "strong",
      relevanceLabel: "用户指定",
      relevanceReason: reason,
      selected: true,
    };
  });

export const buildExplicitUrlReadPlan = (input: string): ExplicitUrlReadPlan => {
  const extraction = extractExplicitUrls(input);
  const blockedUrls = extraction.urls.flatMap((url) => {
    const reason = getFrontendWebReadBlockReason(url);
    return reason ? [{ url, reason }] : [];
  });
  const readableUrls = extraction.urls.filter((url) => !blockedUrls.some((blocked) => blocked.url === url));
  const shouldRead = shouldReadExplicitUrls(input) && readableUrls.length > 0;
  return {
    ...extraction,
    blockedUrls,
    shouldRead,
    sources: shouldRead ? buildExplicitUrlSources(readableUrls) : [],
  };
};

export const DEFAULT_WEB_SEARCH_CONFIG: WebSearchConfig = {
  enabled: false,
  provider: "bing",
  braveApiKey: "",
  bochaApiKey: "",
  bochaEndpoint: "https://api.bochaai.com/v1/web-search",
  publicSearchConsent: false,
};

const normalizeWebSearchProvider = (config: Partial<WebSearchConfig> | null | undefined): WebSearchProvider => {
  const rawProvider = (config as { provider?: string } | null | undefined)?.provider;
  if (rawProvider === "bing" || rawProvider === "bocha" || rawProvider === "brave") {
    return rawProvider;
  }
  if (rawProvider === "searxng") {
    if (typeof config?.bochaApiKey === "string" && config.bochaApiKey.trim()) {
      return "bocha";
    }
    if (typeof config?.braveApiKey === "string" && config.braveApiKey.trim()) {
      return "brave";
    }
    return "bing";
  }
  return "bing";
};

export const normalizeWebSearchConfig = (config: Partial<WebSearchConfig> | null | undefined): WebSearchConfig => ({
  enabled: config?.enabled === true,
  provider: normalizeWebSearchProvider(config),
  braveApiKey: typeof config?.braveApiKey === "string" ? config.braveApiKey.trim() : "",
  bochaApiKey: typeof config?.bochaApiKey === "string" ? config.bochaApiKey.trim() : "",
  bochaEndpoint: typeof config?.bochaEndpoint === "string"
    ? config.bochaEndpoint.trim()
    : DEFAULT_WEB_SEARCH_CONFIG.bochaEndpoint,
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

const stripCommonQueryNoise = (query: string): string => trimQuery(query
  .replace(/\b(?:please|search|find|look up|tell me about)\b/gi, " ")
  .replace(/(?:请帮我|帮我|搜索|搜一下|查一下|查查|联网|公开网页|网上|找资料|看资料)/g, " ")
  .replace(/[？?。！!,，、:：；;]/g, " "));

const tokenizeQuery = (query: string): string[] =>
  query
    .split(/[^A-Za-z0-9\u4e00-\u9fff]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const isGenericOnlySearchQuery = (query: string): boolean => {
  const normalized = stripCommonQueryNoise(query).toLocaleLowerCase();
  if (!normalized) return true;
  const collapsed = normalized.replace(/\s+/g, "");
  if (GENERIC_SEARCH_ONLY_KEYWORDS.some((keyword) => collapsed === keyword.toLocaleLowerCase().replace(/\s+/g, ""))) {
    return true;
  }
  const genericRemainder = GENERIC_SEARCH_ONLY_KEYWORDS
    .map((keyword) => keyword.toLocaleLowerCase().replace(/\s+/g, ""))
    .sort((left, right) => right.length - left.length)
    .reduce((remaining, keyword) => remaining.replace(new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), ""), collapsed);
  if (!genericRemainder) return true;
  const genericSet = new Set(GENERIC_SEARCH_ONLY_KEYWORDS.map((keyword) => keyword.toLocaleLowerCase()));
  const tokens = tokenizeQuery(normalized);
  return tokens.length > 0 && tokens.every((token) => genericSet.has(token.toLocaleLowerCase()));
};

const containsSearchKeyword = (text: string, keyword: string): boolean => {
  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword) return false;
  if (/^[A-Za-z0-9][A-Za-z0-9 .+-]*$/.test(normalizedKeyword)) {
    const escaped = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`, "i").test(text);
  }
  return normalizeSearchText(text).includes(normalizeSearchText(normalizedKeyword));
};

const getKeywordMatches = (text: string, keywords: string[]): string[] =>
  unique(keywords.filter((keyword) => containsSearchKeyword(text, keyword)));

const extractNewsTopicKeywords = (text: string): string[] =>
  unique(NEWS_TOPIC_KEYWORDS.filter((keyword) => containsSearchKeyword(text, keyword))).slice(0, 6);

const isNewsIntentRequest = (text: string, topicKeywords: string[]): boolean =>
  topicKeywords.length > 0 &&
  (hasKeyword(text, RECENT_INFO_TIME_KEYWORDS) || hasKeyword(text, RECENT_INFO_CONTENT_KEYWORDS));

export const limitWebSearchQueriesForProvider = (
  queries: string[],
  provider: WebSearchProvider,
  intent?: ResearchIntent,
): string[] => {
  const cleaned = unique(
    queries
      .map(stripCommonQueryNoise)
      .filter((query) => query && !isGenericOnlySearchQuery(query)),
  );
  if (provider !== "bing") return cleaned;
  return cleaned.slice(0, intent === "general_web" ? 3 : 3);
};

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
  (hasKeyword(text, RECENT_INFO_TIME_KEYWORDS) || hasKeyword(text, CRITICAL_RECENT_TIME_KEYWORDS)) &&
  (hasKeyword(text, RECENT_INFO_CONTENT_KEYWORDS) || hasKeyword(text, CRITICAL_RECENT_CONTENT_KEYWORDS));

const getPrimaryNewsTopic = (topicKeywords: string[]): string => {
  if (topicKeywords.some((keyword) => keyword.toLocaleLowerCase() === "ai")) return "AI";
  if (topicKeywords.includes("人工智能")) return "人工智能";
  if (topicKeywords.includes("OpenAI")) return "OpenAI";
  return topicKeywords[0] ?? "";
};

const getCurrentChineseMonthHint = (): string => {
  const now = new Date();
  return `${now.getFullYear()}年${now.getMonth() + 1}月`;
};

const buildNewsQueries = (question: string, topicKeywords: string[]): string[] => {
  const primaryTopic = getPrimaryNewsTopic(topicKeywords);
  if (!primaryTopic) return [];
  const topicSet = new Set(topicKeywords.map((keyword) => keyword.toLocaleLowerCase()));
  const isChineseQuestion = /[\u4e00-\u9fff]/.test(question);
  const monthHint = getCurrentChineseMonthHint();
  if (topicSet.has("openai") || /\bopenai\b/i.test(question)) {
    const queries = isChineseQuestion
      ? [
        "OpenAI新闻",
        `OpenAI 最新消息 ${monthHint}`,
        `OpenAI latest news ${new Date().toLocaleString("en-US", { month: "long", year: "numeric" })}`,
      ]
      : [
        `OpenAI latest news ${new Date().toLocaleString("en-US", { month: "long", year: "numeric" })}`,
        "OpenAI news",
        "OpenAI announces launches model latest",
      ];
    return unique(queries.map(trimQuery).filter((query) => query && !isGenericOnlySearchQuery(query))).slice(0, 3);
  }
  if (topicSet.has("ai") || /\bai\b/i.test(question)) {
    const broadAiNewsQueries = [
      "AI model launch OpenAI Anthropic Google DeepMind",
      "AI agent product launch Google OpenAI Anthropic",
      "AI funding startup",
      "AI regulation EU US China",
      "AI infrastructure chip datacenter",
    ];
    return unique(broadAiNewsQueries.map(trimQuery).filter((query) => query && !isGenericOnlySearchQuery(query))).slice(0, 5);
  }
  if (topicSet.has("ai") || /\bai\b/i.test(question)) {
    const queries = isChineseQuestion
      ? [
        "AI新闻",
        `人工智能新闻 ${monthHint}`,
        "AI 大模型 最新消息",
      ]
      : [
        "latest AI news",
        `AI news ${new Date().toLocaleString("en-US", { month: "long", year: "numeric" })}`,
        "OpenAI Anthropic Google DeepMind AI news",
        "AI regulation funding model release news",
      ];
    return unique(queries.map(trimQuery).filter((query) => query && !isGenericOnlySearchQuery(query))).slice(0, 3);
  }
  const queries = [
    primaryTopic === "AI" ? "AI新闻" : `${primaryTopic}新闻`,
    `${primaryTopic} 最新消息 ${monthHint}`,
    topicSet.has("openai") ? "OpenAI 新闻 最新" : "",
    /\bai\b/i.test(question) ? "latest AI news" : "",
  ];
  return unique(queries.map(trimQuery).filter((query) => query && !isGenericOnlySearchQuery(query))).slice(0, 3);
};

const buildGeneralWebQueries = (
  question: string,
  recentInfoRequested: boolean,
  topicKeywords: string[] = extractNewsTopicKeywords(question),
): string[] => {
  if (recentInfoRequested) {
    const monthHint = getCurrentChineseMonthHint();
    if (/\bopenai\b/i.test(question) || topicKeywords.some((keyword) => keyword.toLocaleLowerCase() === "openai")) {
      return [`OpenAI \u65b0\u95fb`, `OpenAI \u6700\u65b0\u6d88\u606f ${monthHint}`, `OpenAI latest news ${new Date().toLocaleString("en-US", { month: "long", year: "numeric" })}`].map(trimQuery).slice(0, 3);
    }
    if (/\bai\b/i.test(question) || topicKeywords.some((keyword) => keyword.toLocaleLowerCase() === "ai")) {
      return [
        "AI model launch OpenAI Anthropic Google DeepMind",
        "AI agent product launch Google OpenAI Anthropic",
        "AI funding startup",
        "AI regulation EU US China",
        "AI infrastructure chip datacenter",
      ].map(trimQuery).slice(0, 5);
    }
  }
  const cleaned = compactQuery(question
    .replace(/(?:联网|网上)?(?:搜一下|查一下|查查|搜搜|帮我查|找资料|看资料)/g, " ")
    .replace(/(?:有没有|有什么|请问|一下|吗|呢)/g, " ")
    .replace(/[？?。！!,，、:：；;]/g, " "));

  if (!recentInfoRequested) {
    const fallback = cleaned ? trimQuery(cleaned) : trimQuery(question);
    return fallback && !isGenericOnlySearchQuery(fallback) ? [fallback] : [];
  }

  const newsQueries = buildNewsQueries(question, topicKeywords);
  if (newsQueries.length > 0) return newsQueries;

  const normalized = normalizeSearchText(cleaned);
  const recentQueryHints = [
    normalized.includes("ai") ? "最近 AI 新闻" : "",
    normalized.includes("ai") ? "AI 最新进展" : "",
    normalized.includes("信息学竞赛") ? "信息学竞赛 最新消息" : "",
  ];
  const queries = [
    cleaned,
    ...recentQueryHints,
    /(?:NOIP|CSP)/i.test(cleaned) ? "CSP NOIP 最新消息" : "",
    normalized.includes("信息学竞赛") ? "信息学竞赛 最新消息" : "",
    normalized.includes("ai") ? "最近 AI 新闻" : "",
    normalized.includes("gpt") ? "GPT 最近更新" : "",
  ];
  const safeQueries = unique(queries.map(trimQuery).filter((query) => query && !isGenericOnlySearchQuery(query)));
  return safeQueries.length > 0 ? safeQueries.slice(0, 2) : [];
};

const hasUrlLikeText = (value: string): boolean =>
  /\bhttps?:\/\//i.test(value) || /\bwww\.[^\s]+/i.test(value);

const SEARCH_VERTICALS = new Set<SearchVertical>(["news", "oi", "algorithm", "general_web", "product", "docs", "explicit_url", "no_search"]);
const SEARCH_DEPTHS = new Set<SearchDepth>(["quick", "normal", "deep", "news", "oi_research"]);

const isSearchVertical = (value: unknown): value is SearchVertical =>
  typeof value === "string" && SEARCH_VERTICALS.has(value as SearchVertical);

const isSearchDepth = (value: unknown): value is SearchDepth =>
  typeof value === "string" && SEARCH_DEPTHS.has(value as SearchDepth);

const inferSearchVertical = (decision: SearchDecision, plan?: Partial<AiSearchQueryPlan>): SearchVertical => {
  if (plan?.vertical && isSearchVertical(plan.vertical)) return plan.vertical;
  if (decision.problemId || decision.intent === "oi_problem" || decision.intent === "oi_discussion") return "oi";
  if (decision.intent === "algorithm_reference" || decision.intent === "debug_issue") return "algorithm";
  if (decision.intent === "no_search") return "no_search";
  if (decision.newsIntent || plan?.freshness === "news") return "news";
  return "general_web";
};

const clampReadBudget = (value: unknown, min: number, max: number, fallback: number): number => {
  const numeric = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.max(min, Math.min(max, numeric));
};

const sanitizePlannerStringList = (
  value: unknown,
  maxItems: number,
  maxChars: number,
): string[] => {
  if (!Array.isArray(value)) return [];
  return unique(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => compactQuery(item).slice(0, maxChars))
    .filter(Boolean))
    .slice(0, maxItems);
};

export const shouldUseAiQueryPlanner = (
  decision: SearchDecision,
  userInput: string,
  options?: {
    provider?: WebSearchProvider;
    explicitUrlRead?: boolean;
    localNoteStrong?: boolean;
    aiAvailable?: boolean;
    offTopicRetry?: boolean;
  },
): boolean => {
  if (options?.aiAvailable === false) return false;
  if (options?.explicitUrlRead) return false;
  if (!decision.shouldSearch || decision.intent === "no_search") return false;
  if (decision.problemId) return false;
  if (options?.localNoteStrong) return false;
  if (options?.offTopicRetry) return decision.intent === "general_web";
  if (decision.intent === "oi_problem" || decision.intent === "oi_discussion" || decision.intent === "algorithm_reference" || decision.intent === "debug_issue") {
    return true;
  }
  if (decision.newsIntent || decision.recencyIntent || isRecentInfoRequest(userInput)) return true;
  if (decision.queries.length === 0) return false;
  const queryText = decision.queries.join(" ");
  return decision.queries.length <= 1 && (
    isGenericOnlySearchQuery(queryText) ||
    queryText.length < 12 ||
    hasKeyword(userInput, GENERAL_WEB_KEYWORDS)
  );
};

export const validateAiSearchQueryPlan = (
  rawPlan: unknown,
  decision: SearchDecision,
  provider: WebSearchProvider,
): { plan?: AiSearchQueryPlan; error?: string } => {
  if (!rawPlan || typeof rawPlan !== "object") return { error: "planner returned no JSON object" };
  const item = rawPlan as Partial<AiSearchQueryPlan>;
  const freshnessValues = new Set<AiSearchFreshness>(["none", "recent", "latest", "news"]);
  const freshness = item.freshness && freshnessValues.has(item.freshness) ? item.freshness : "none";
  const queries = sanitizePlannerStringList(item.queries, 3, 90)
    .map(stripCommonQueryNoise)
    .filter((query) => query && !isGenericOnlySearchQuery(query) && !hasUrlLikeText(query));
  if (queries.length === 0) return { error: "planner produced no usable query" };

  const topicKeywords = unique([
    ...sanitizePlannerStringList(item.topicKeywords, 10, 40),
    ...(decision.topicKeywords ?? []),
  ]).slice(0, 10);
  const requiredKeywords = sanitizePlannerStringList(item.requiredKeywords, 10, 40);
  const negativeKeywords = sanitizePlannerStringList(item.negativeKeywords, 12, 40);
  const preferredSourceTypes = sanitizePlannerStringList(item.preferredSourceTypes, 8, 40);
  const preferredDomains = sanitizePlannerStringList(item.preferredDomains, 8, 80)
    .filter((domain) => !hasUrlLikeText(domain))
    .map((domain) => domain.toLocaleLowerCase().replace(/^site:/, "").replace(/^www\./, ""));
  const avoidSourceTypes = sanitizePlannerStringList(item.avoidSourceTypes, 8, 40);
  const vertical = inferSearchVertical(decision, item);
  const depth = isSearchDepth(item.depth)
    ? item.depth
    : vertical === "news"
      ? "news"
      : vertical === "oi" || vertical === "algorithm"
        ? "oi_research"
        : "normal";
  const newsLike = decision.newsIntent === true || freshness === "news" || freshness === "latest" || decision.recencyIntent === true;
  if (newsLike) {
    const topicHaystack = `${queries.join(" ")} ${topicKeywords.join(" ")} ${requiredKeywords.join(" ")}`;
    const hasTopic = topicKeywords.some((keyword) => containsSearchKeyword(topicHaystack, keyword)) ||
      extractNewsTopicKeywords(topicHaystack).length > 0;
    const hasNewsWord = hasKeyword(topicHaystack, [...RECENT_INFO_CONTENT_KEYWORDS, ...RECENT_INFO_TIME_KEYWORDS, "news", "latest"]);
    if (!hasTopic) return { error: "planner news query missed topic keywords" };
    if (!hasNewsWord) return { error: "planner news query missed news/freshness keyword" };
  }

  const maxQueries = provider === "bing" ? 2 : 3;
  return {
    plan: {
      searchGoal: typeof item.searchGoal === "string" ? compactQuery(item.searchGoal).slice(0, 180) : undefined,
      vertical,
      rewrittenIntent: typeof item.rewrittenIntent === "string" ? compactQuery(item.rewrittenIntent).slice(0, 160) : "",
      queries: unique(queries).slice(0, maxQueries),
      topicKeywords,
      requiredKeywords,
      negativeKeywords,
      freshness,
      depth,
      readBudget: clampReadBudget(item.readBudget, 1, vertical === "news" ? 12 : 10, vertical === "news" ? 8 : depth === "quick" ? 3 : 6),
      preferredSourceTypes,
      preferredDomains,
      avoidSourceTypes,
      reason: typeof item.reason === "string" ? compactQuery(item.reason).slice(0, 260) : "AI query planner generated search queries.",
      confidence: typeof item.confidence === "number" && Number.isFinite(item.confidence)
        ? Math.max(0, Math.min(1, Number(item.confidence.toFixed(2))))
        : 0.5,
    },
  };
};

export const applyAiSearchQueryPlan = (
  decision: SearchDecision,
  plan: AiSearchQueryPlan,
  trigger: AiSearchPlannerState["trigger"] = "initial",
): SearchDecision => {
  const topicKeywords = unique([...(plan.topicKeywords ?? []), ...(decision.topicKeywords ?? [])]).slice(0, 10);
  return {
    ...decision,
    vertical: plan.vertical ?? decision.vertical ?? inferSearchVertical(decision, plan),
    topicKeywords: topicKeywords.length > 0 ? topicKeywords : decision.topicKeywords,
    newsIntent: decision.newsIntent === true || plan.freshness === "news",
    recencyIntent: decision.recencyIntent === true || plan.freshness === "recent" || plan.freshness === "latest" || plan.freshness === "news",
    queries: plan.queries,
    reason: [decision.reason, plan.reason ? `AI planner: ${plan.reason}` : undefined].filter(Boolean).join("；"),
    aiPlanner: {
      enabled: true,
      used: true,
      trigger,
      ruleBasedQueries: decision.aiPlanner?.ruleBasedQueries ?? decision.queries,
      searchGoal: plan.searchGoal,
      vertical: plan.vertical ?? inferSearchVertical(decision, plan),
      generatedQueries: plan.queries,
      rewrittenIntent: plan.rewrittenIntent,
      topicKeywords,
      requiredKeywords: plan.requiredKeywords,
      negativeKeywords: plan.negativeKeywords,
      freshness: plan.freshness,
      depth: plan.depth,
      readBudget: plan.readBudget,
      preferredSourceTypes: plan.preferredSourceTypes,
      preferredDomains: plan.preferredDomains,
      avoidSourceTypes: plan.avoidSourceTypes,
      reason: plan.reason,
      confidence: plan.confidence,
      retried: trigger === "off_topic_retry" || decision.aiPlanner?.retried === true,
    },
  };
};

export const markAiQueryPlannerFallback = (
  decision: SearchDecision,
  fallbackReason: string,
  trigger: AiSearchPlannerState["trigger"] = "fallback",
): SearchDecision => ({
  ...decision,
  aiPlanner: {
    enabled: true,
    used: false,
    trigger,
    ruleBasedQueries: decision.aiPlanner?.ruleBasedQueries ?? decision.queries,
    generatedQueries: decision.aiPlanner?.generatedQueries,
    vertical: decision.aiPlanner?.vertical ?? decision.vertical ?? inferSearchVertical(decision),
    topicKeywords: decision.aiPlanner?.topicKeywords ?? decision.topicKeywords,
    freshness: decision.aiPlanner?.freshness,
    depth: decision.aiPlanner?.depth,
    readBudget: decision.aiPlanner?.readBudget,
    preferredSourceTypes: decision.aiPlanner?.preferredSourceTypes,
    preferredDomains: decision.aiPlanner?.preferredDomains,
    fallbackReason,
    retried: decision.aiPlanner?.retried,
  },
});

export const buildOfflineAiQueryPlannerPreview = (decision: SearchDecision): AiSearchQueryPlan | null => {
  if (!shouldUseAiQueryPlanner(decision, decision.rawQuestion ?? "")) return null;
  const topicKeywords = unique([...(decision.topicKeywords ?? []), ...extractNewsTopicKeywords(decision.rawQuestion ?? "")]).slice(0, 10);
  const queries = buildGeneralWebQueries(decision.rawQuestion ?? decision.queries.join(" "), decision.recencyIntent === true || decision.newsIntent === true, topicKeywords).slice(0, 3);
  if (queries.length === 0) return null;
  const vertical = inferSearchVertical(decision, { freshness: decision.newsIntent ? "news" : decision.recencyIntent ? "recent" : "none" });
  return {
    searchGoal: decision.newsIntent ? "查找该主题的近期公开新闻。" : "查找该主题的公开网页来源。",
    vertical,
    rewrittenIntent: decision.newsIntent ? "查找该主题的近期新闻和最新动态。" : "将用户问题改写成聚焦的公开网页搜索词。",
    queries,
    topicKeywords,
    requiredKeywords: topicKeywords.slice(0, 6),
    negativeKeywords: ["dictionary", "translate", "meaning", "Wikipedia", "百科", "英语怎么说"],
    freshness: decision.newsIntent ? "news" : decision.recencyIntent ? "recent" : "none",
    depth: vertical === "news" ? "news" : "normal",
    readBudget: vertical === "news" ? 8 : 6,
    preferredSourceTypes: decision.newsIntent ? ["news", "official blog", "company announcement"] : [],
    preferredDomains: vertical === "news" ? ["openai.com", "techcrunch.com", "qbitai.com"] : [],
    avoidSourceTypes: decision.newsIntent ? ["dictionary", "translation", "definition", "lyrics", "video"] : [],
    reason: "离线诊断只验证搜索规划触发和 query 质量，不会发起 AI 或公网请求。",
    confidence: 0.72,
  };
};

const getSourceHostname = (url: string | undefined): string => {
  if (!url) return "";
  try {
    return new URL(url).hostname.toLocaleLowerCase().replace(/^www\./, "");
  } catch {
    return url.toLocaleLowerCase().replace(/^https?:\/\//, "").split(/[/?#]/)[0].replace(/^www\./, "");
  }
};

const registryMatchesDomain = (entry: SourceRegistryEntry, hostname: string): boolean =>
  hostname === entry.domain || hostname.endsWith(`.${entry.domain}`) || hostname.endsWith(entry.domain);

const getRegistryEntriesForVertical = (vertical: SearchVertical): SourceRegistryEntry[] =>
  SOURCE_REGISTRY.filter((entry) =>
    entry.verticals.includes(vertical) && !entry.avoidForVerticals?.includes(vertical),
  );

export const getSourceRegistryMatch = (source: WebSource, vertical: SearchVertical): SourceRegistryEntry | null => {
  const hostname = getSourceHostname(source.finalUrl ?? source.url);
  return SOURCE_REGISTRY.find((entry) => registryMatchesDomain(entry, hostname) && !entry.avoidForVerticals?.includes(vertical)) ?? null;
};

export const getWebReadBudgetPlan = (decision: SearchDecision): WebReadBudgetPlan => {
  const vertical = decision.vertical ?? decision.aiPlanner?.vertical ?? inferSearchVertical(decision);
  const plannedBudget = decision.aiPlanner?.readBudget;
  const plannedDepth = decision.aiPlanner?.depth;
  const depth: SearchDepth = plannedDepth && SEARCH_DEPTHS.has(plannedDepth)
    ? plannedDepth
    : vertical === "news"
      ? "news"
      : vertical === "oi" || vertical === "algorithm"
        ? "oi_research"
        : "normal";
  const defaults: Record<SearchDepth, { target: number; attempts: number; candidates: number; prompt: number }> = {
    quick: { target: 3, attempts: 4, candidates: 10, prompt: 4 },
    normal: { target: 6, attempts: 8, candidates: 16, prompt: 8 },
    deep: { target: 10, attempts: 10, candidates: 24, prompt: 8 },
    news: { target: 8, attempts: 12, candidates: 24, prompt: 8 },
    oi_research: { target: 6, attempts: 10, candidates: 18, prompt: 8 },
  };
  const preset = defaults[depth];
  const targetReadSuccesses = clampReadBudget(plannedBudget, 1, depth === "news" ? 12 : 10, preset.target);
  return {
    depth,
    maxCandidates: Math.max(preset.candidates, targetReadSuccesses * 2),
    targetReadSuccesses,
    maxReadAttempts: Math.max(preset.attempts, targetReadSuccesses),
    maxPromptSources: Math.min(preset.prompt, Math.max(4, targetReadSuccesses)),
    maxConcurrentReads: 3,
    reason: `depth=${depth}; vertical=${vertical}; target=${targetReadSuccesses}`,
  };
};

const buildTargetedQueries = (
  decision: SearchDecision,
  vertical: SearchVertical,
  preferredDomains: string[],
  provider: WebSearchProvider,
): { queries: string[]; dropped: Array<{ query: string; reason: string }> } => {
  if (provider !== "bing") return { queries: [], dropped: [] };
  const baseQueries = decision.queries.filter((query) => query && !query.includes("site:"));
  const topicQuery = baseQueries[0] ?? decision.topicKeywords?.slice(0, 4).join(" ") ?? "";
  if (!topicQuery) return { queries: [], dropped: [] };
  const focus = getQueryFocusEntities(decision.rawQuestion, decision.queries);
  const companySpecificNews = vertical === "news" && focus.entities.length === 1;
  const focusEntity = focus.entities[0];
  const maxDomains = vertical === "news" ? 3 : 2;
  const keptDomains: string[] = [];
  const dropped: Array<{ query: string; reason: string }> = [];
  for (const domain of preferredDomains) {
    const query = trimQuery(`${topicQuery} site:${domain}`);
    const domainEntity = normalizeNewsFocusEntity(domain);
    if (companySpecificNews && domainEntity && domainEntity !== focusEntity) {
      dropped.push({ query, reason: "entity_mismatch_for_company_query" });
      continue;
    }
    keptDomains.push(domain);
    if (keptDomains.length >= maxDomains) break;
  }
  return {
    queries: unique(keptDomains.map((domain) => trimQuery(`${topicQuery} site:${domain}`))).slice(0, maxDomains),
    dropped,
  };
};

const filterCompanySpecificSiteQueries = (
  decision: SearchDecision,
  vertical: SearchVertical,
  queries: string[],
): { queries: string[]; dropped: Array<{ query: string; reason: string }> } => {
  const focus = getQueryFocusEntities(decision.rawQuestion, decision.queries);
  const companySpecificNews = vertical === "news" && focus.entities.length === 1;
  if (!companySpecificNews) return { queries, dropped: [] };
  const focusEntity = focus.entities[0];
  const kept: string[] = [];
  const dropped: Array<{ query: string; reason: string }> = [];
  for (const query of queries) {
    const siteMatch = query.match(/\bsite:([^\s]+)/i);
    const siteEntity = siteMatch ? normalizeNewsFocusEntity(siteMatch[1]) : undefined;
    if (siteEntity && siteEntity !== focusEntity) {
      dropped.push({ query, reason: "entity_mismatch_for_company_query" });
      continue;
    }
    kept.push(query);
  }
  return { queries: kept, dropped };
};

export const buildSourceStrategyPlan = (
  decision: SearchDecision,
  provider: WebSearchProvider,
): SourceStrategyPlan => {
  const vertical = decision.vertical ?? decision.aiPlanner?.vertical ?? inferSearchVertical(decision);
  const registryEntries = getRegistryEntriesForVertical(vertical);
  const plannerDomains = decision.aiPlanner?.preferredDomains ?? [];
  const preferredDomains = unique([
    ...plannerDomains,
    ...registryEntries
      .sort((left, right) => (right.reliabilityWeight + right.freshnessWeight) - (left.reliabilityWeight + left.freshnessWeight))
      .map((entry) => entry.domain),
  ]).slice(0, vertical === "news" ? 8 : 6);
  const preferredSourceTypes = unique([
    ...(decision.aiPlanner?.preferredSourceTypes ?? []),
    ...registryEntries.flatMap((entry) => entry.sourceTypes),
  ]).slice(0, 10);
  const avoidedSourceTypes = unique([
    ...(decision.aiPlanner?.avoidSourceTypes ?? []),
    ...(vertical === "news" ? ["docs", "wiki", "github", "homepage", "dictionary", "translation"] : []),
  ]).slice(0, 10);
  const readBudget = getWebReadBudgetPlan({ ...decision, vertical });
  const targetedQueryPlan = buildTargetedQueries(decision, vertical, preferredDomains, provider);
  const targetedQueries = targetedQueryPlan.queries;
  return {
    vertical,
    preferredSourceTypes,
    preferredDomains,
    avoidedSourceTypes,
    targetedQueries,
    droppedTargetedQueries: targetedQueryPlan.dropped,
    registryBoosts: registryEntries
      .slice()
      .sort((left, right) => (right.reliabilityWeight + right.freshnessWeight) - (left.reliabilityWeight + left.freshnessWeight))
      .slice(0, 8)
      .map((entry) => ({
        domain: entry.domain,
        label: entry.label,
        weight: entry.reliabilityWeight + (vertical === "news" ? entry.freshnessWeight : 0),
        reason: `${entry.label} matches ${vertical}`,
      })),
    readBudget,
    candidateLimit: readBudget.maxCandidates,
    reason: `vertical=${vertical}; provider=${provider}; registry=${registryEntries.length}; targetedQueries=${targetedQueries.length}`,
  };
};

export const applySourceStrategyPlan = (
  decision: SearchDecision,
  provider: WebSearchProvider,
): SearchDecision => {
  const strategy = buildSourceStrategyPlan(decision, provider);
  const maxBaseQueries = provider === "bing" ? (strategy.vertical === "news" ? 5 : 1) : 5;
  const filteredBaseQueries = filterCompanySpecificSiteQueries(
    decision,
    strategy.vertical,
    decision.queries.slice(0, maxBaseQueries),
  );
  const queries = unique([
    ...filteredBaseQueries.queries,
    ...strategy.targetedQueries,
  ]).slice(0, provider === "bing" ? (strategy.vertical === "news" ? 5 : 3) : 6);
  return {
    ...decision,
    vertical: strategy.vertical,
    queries,
    sourceStrategy: {
      ...strategy,
      droppedTargetedQueries: [
        ...filteredBaseQueries.dropped,
        ...strategy.droppedTargetedQueries,
      ],
    },
  };
};

export type WebSourceRelevanceResult = {
  sources: WebSource[];
  filteredCount: number;
  filterReason?: string;
  strongCount: number;
  candidateCount: number;
};

const NEWS_TIME_KEYWORDS = ["最近", "最新", "新闻", "消息", "更新", "今年", "今天", "这周", "近期"];
const NEWS_AUTHORITY_HINTS = [
  "openai.com",
  "anthropic.com",
  "deepmind.google",
  "blog.google",
  "microsoft.com",
  "nvidia.com",
  "meta.com",
  "reuters.com",
  "apnews.com",
  "theverge.com",
  "technologyreview.com",
  "wired.com",
  "36kr.com",
  "jiqizhixin.com",
  "qbitai.com",
];
const SEO_TITLE_PATTERNS = [
  /\b\d{4}\s*(?:latest|new|complete|guide)\b/i,
  /(?:最新|最全|一文看懂|保姆级|全网最|值得收藏|吐血整理|万字长文)/,
];
const CORE_INTENT_KEYWORDS = [
  "WA",
  "TLE",
  "RE",
  "MLE",
  "CE",
  "hack",
  "坑",
  "常见坑",
  "常见错误",
  "注意事项",
  "新闻",
  "消息",
  "更新",
  "最新",
  "最近",
  "近期",
];

const getReliabilityRankScore = (source: WebSource): number => {
  switch (source.reliability) {
    case "official":
      return 24;
    case "wiki":
      return 20;
    case "community_solution":
      return 14;
    case "discussion":
      return 12;
    case "blog":
      return 4;
    default:
      return 0;
  }
};

const getSourceTypeRankScore = (source: WebSource, decision: SearchDecision, recentInfoRequested: boolean): number => {
  const text = getSourceSearchText(source);
  if (recentInfoRequested) {
    if (NEWS_AUTHORITY_HINTS.some((hint) => text.includes(hint))) return 18;
    if (source.sourceType === "official") return 14;
    if (source.sourceType === "blog" || source.reliability === "blog") return -8;
    if (isKnownOiSource(source)) return -16;
    return 0;
  }
  if (decision.intent === "algorithm_reference") {
    if (text.includes("oi-wiki") || text.includes("cp-algorithms")) return 22;
    if (source.reliability === "wiki") return 16;
    if (source.reliability === "blog") return -3;
  }
  if (decision.problemId || decision.intent === "oi_problem" || decision.intent === "oi_discussion" || decision.intent === "debug_issue") {
    if (text.includes("luogu.com.cn/problem/")) return source.isConstructed && source.excerptStatus !== "fetched" ? 8 : 24;
    if (text.includes("luogu.com.cn/problem/solution/")) return source.isConstructed && source.excerptStatus !== "fetched" ? 8 : 20;
    if (text.includes("oi-wiki") || text.includes("cp-algorithms")) return 12;
    if (source.reliability === "blog") return -4;
  }
  return 0;
};

const getCoreKeywordMatches = (source: WebSource, decision: SearchDecision, userInput: string): string[] => {
  const searchText = getSourceSearchText(source);
  const intentKeywords = unique([
    ...CORE_INTENT_KEYWORDS.filter((keyword) => normalizeSearchText(userInput).includes(normalizeSearchText(keyword))),
    ...(decision.algorithmKeywords ?? []),
    ...(decision.errorKeywords ?? []),
  ]);
  return intentKeywords.filter((keyword) => searchText.includes(normalizeSearchText(keyword)));
};

const parseSourceDateHint = (source: WebSource): Date | null => {
  const dateHint = source.dateHint?.trim();
  const candidates = [
    dateHint,
    source.title,
    source.snippet,
    source.url,
  ].filter((item): item is string => Boolean(item?.trim()));
  for (const candidate of candidates) {
    const parsed = Date.parse(candidate);
    if (Number.isFinite(parsed)) return new Date(parsed);
    const zhDate = candidate.match(/\b(20\d{2})年(1[0-2]|0?[1-9])月([12]\d|3[01]|0?[1-9])日?\b/);
    if (zhDate) {
      const [, year, month, day] = zhDate;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
    const slashDate = candidate.match(/\b(20\d{2})[-/.](1[0-2]|0?[1-9])[-/.]([12]\d|3[01]|0?[1-9])\b/);
    if (slashDate) {
      const [, year, month, day] = slashDate;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
  }
  return null;
};

export const getWebSourceFreshnessScore = (source: WebSource): number => {
  const date = parseSourceDateHint(source);
  if (!date) {
    return isNewsAuthorityDomain(getWebSourceUrlParts(source).host) ? 4 : -3;
  }
  const ageMs = Date.now() - date.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (ageMs < 0 && Math.abs(ageMs) <= 2 * dayMs) return 24;
  if (ageMs <= dayMs) return 34;
  if (ageMs <= 7 * dayMs) return 24;
  if (ageMs <= 30 * dayMs) return 8;
  if (ageMs <= 180 * dayMs) return -10;
  return -24;
};

const getDateRankScore = (source: WebSource, recentInfoRequested: boolean): number => {
  if (!recentInfoRequested) return 0;
  if (source.dateHint?.trim()) return getWebSourceFreshnessScore(source);
  const text = [source.title, source.snippet, source.url].filter(Boolean).join(" ");
  const currentYear = new Date().getFullYear();
  const years = unique((text.match(/\b20\d{2}\b/g) ?? [])).map((item) => Number(item)).filter(Number.isFinite);
  if (years.length > 0) {
    const newestYear = Math.max(...years);
    if (newestYear >= currentYear) return 18;
    if (newestYear === currentYear - 1) return 8;
    if (newestYear < currentYear - 2) return -12;
  }
  if (/\b(?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])\b/.test(text) || /(?:\d{1,2})月(?:\d{1,2})日/.test(text)) {
    return 5;
  }
  return -2;
};

const getLowQualityPenalty = (source: WebSource, decision: SearchDecision, userInput: string, recentInfoRequested: boolean): number => {
  const title = source.title.trim();
  const snippet = source.snippet?.trim() ?? "";
  const text = getSourceSearchText(source);
  let penalty = 0;
  if (SEO_TITLE_PATTERNS.some((pattern) => pattern.test(title))) penalty -= 10;
  if ((source.reliability ?? "unknown") === "unknown" && snippet.length > 0 && snippet.length < 36) penalty -= 8;
  if ((source.reliability ?? "unknown") === "unknown" && snippet.length === 0) penalty -= 10;
  if (recentInfoRequested && (text.includes("csdn.net") || text.includes("blog.csdn") || text.includes("cnblogs.com"))) penalty -= 12;
  if (recentInfoRequested && isKnownOiSource(source)) penalty -= 10;
  if (!recentInfoRequested && text.includes("csdn.net")) penalty -= 4;
  const coreMatches = getCoreKeywordMatches(source, decision, userInput);
  if (coreMatches.length === 0 && (decision.algorithmKeywords?.length || decision.errorKeywords?.length || recentInfoRequested)) {
    penalty -= 8;
  }
  const tokens = snippet.split(/\s+/).filter((item) => item.length >= 2);
  const uniqueTokenCount = new Set(tokens.map((item) => normalizeSearchText(item))).size;
  if (tokens.length >= 16 && uniqueTokenCount <= Math.ceil(tokens.length * 0.45)) penalty -= 8;
  return penalty;
};

const getSourceRegistryRank = (
  source: WebSource,
  decision: SearchDecision,
  recentInfoRequested: boolean,
): { score: number; label?: string; reason?: string } => {
  const vertical = decision.vertical ?? decision.aiPlanner?.vertical ?? inferSearchVertical(decision);
  const match = getSourceRegistryMatch(source, vertical);
  let score = 0;
  const reasons: string[] = [];
  if (match && match.verticals.includes(vertical)) {
    const boost = match.reliabilityWeight + (recentInfoRequested ? match.freshnessWeight : 0);
    score += boost;
    reasons.push(`${match.label} registry +${boost}`);
  }
  if (vertical === "news") {
    const text = getSourceSearchText(source);
    if (/(?:github\.com|github\.io|wikipedia\.org|docs\.|developer\.mozilla\.org|react\.dev|rust-lang\.org|tailwindcss\.com|vite\.dev|tauri\.app)/i.test(text)) {
      score -= 22;
      reasons.push("news vertical downranks docs/wiki/github");
    }
    if (NEWS_AUTHORITY_HINTS.some((hint) => text.includes(hint))) {
      score += 10;
      reasons.push("news-like domain");
    }
  }
  if ((vertical === "oi" || vertical === "algorithm") && match && match.verticals.some((item) => item === "oi" || item === "algorithm")) {
    score += 6;
    reasons.push("algorithm vertical match");
  }
  return {
    score,
    label: match?.label,
    reason: reasons.join("; ") || undefined,
  };
};

const isRecentGeneralWebDecision = (decision: SearchDecision, userInput: string): boolean =>
  decision.intent === "general_web" && (
    decision.newsIntent === true ||
    decision.recencyIntent === true ||
    isRecentInfoRequest(userInput) ||
    hasKeyword(userInput, NEWS_TIME_KEYWORDS) ||
    decision.queries.some((query) => hasKeyword(query, NEWS_TIME_KEYWORDS))
  );

const getGeneralWebTopicKeywords = (decision: SearchDecision, userInput: string): string[] =>
  unique([...(decision.topicKeywords ?? []), ...extractNewsTopicKeywords(userInput)]).slice(0, 8);

const isAiNewsTopic = (topicKeywords: string[]): boolean =>
  topicKeywords.some((keyword) => ["ai", "人工智能", "大模型", "openai", "chatgpt", "deepseek", "gemini", "claude", "anthropic"].includes(keyword.toLocaleLowerCase()));

const isObviousOffTopicNewsResult = (source: WebSource): boolean => {
  const text = [source.title, source.snippet, source.site, source.url].filter(Boolean).join(" ");
  return NEWS_OFF_TOPIC_PATTERNS.some((pattern) => pattern.test(text));
};

const getWebSourceUrlParts = (source: WebSource): { host: string; path: string } => {
  try {
    const parsed = new URL(source.finalUrl ?? source.url);
    return {
      host: parsed.hostname.toLocaleLowerCase().replace(/^www\./, ""),
      path: parsed.pathname.toLocaleLowerCase(),
    };
  } catch {
    const host = getSourceHostname(source.finalUrl ?? source.url);
    return { host, path: "" };
  }
};

const hostMatchesDomain = (host: string, domain: string): boolean =>
  host === domain || host.endsWith(`.${domain}`);

const isNewsAuthorityDomain = (host: string): boolean =>
  NEWS_AUTHORITY_DOMAINS.some((domain) => hostMatchesDomain(host, domain));

const getEvidenceUrlParts = (source: WebSource): { host: string; path: string; search: string } => {
  try {
    const parsed = new URL(source.finalUrl ?? source.url);
    return {
      host: parsed.hostname.toLocaleLowerCase().replace(/^www\./, ""),
      path: parsed.pathname.toLocaleLowerCase(),
      search: parsed.search.toLocaleLowerCase(),
    };
  } catch {
    const parts = getWebSourceUrlParts(source);
    return { ...parts, search: "" };
  }
};

const classifyEvidencePageType = (source: WebSource): WebPageType => {
  const { host, path, search } = getEvidenceUrlParts(source);
  const text = [source.title, source.snippet, source.site, source.url, source.finalUrl].filter(Boolean).join(" ").toLocaleLowerCase();
  if (host === "go.microsoft.com" && path.startsWith("/fwlink")) return "redirect";
  if (host.includes("bing.com") || host.includes("google.com") || host.includes("baidu.com") || host.includes("duckduckgo.com")) return "search_page";
  if (path === "" || path === "/" || /^\/(?:en|zh|zh-cn|zh-tw|cn|us|global)\/?$/.test(path)) return "homepage";
  if (/\/(?:search|s|results?)(?:\/|$)/.test(path) || search.includes("q=") && /search|query/.test(path)) return "search_page";
  if (/\/(?:login|signin|sign-in|auth|account)(?:\/|$)/.test(path) || /\blog\s*in\b|\bsign\s*in\b/.test(text)) return "login";
  if (/\/(?:download|downloads)(?:\/|$)/.test(path) || /\.(?:zip|gz|tar|exe|dmg|pkg|msi|pdf)(?:$|[?#])/.test(source.finalUrl ?? source.url)) return "download";
  if (/\/(?:pricing|privacy|terms|legal|map|maps|shopping|cart|help|support)(?:\/|$)/.test(path)) return "search_page";
  if (/\/(?:api|reference|sdk)(?:\/|$)/.test(path) || host.startsWith("docs.")) return "api_docs";
  if (/\/(?:docs|documentation|learn|guide|guides|tutorial|readme)(?:\/|$)/.test(path)) return "docs";
  if (/\/(?:wiki|百科|baike)(?:\/|$)/i.test(path) || host.includes("wikipedia.org") || host.includes("baike.baidu.com") || host.includes("britannica.com")) return "encyclopedia";
  if (/\/(?:forum|forums|discuss|discussion|issues|pull|pulls|blog)(?:\/|$)/.test(path) || host.includes("zhihu.com") || host.includes("cnblogs.com") || host.includes("csdn.net")) return "forum";
  if (/\/(?:news|blog|posts?|articles?|press|releases?|announcements?|stories)(?:\/|$)/.test(path)) return "news_article";
  if (path.split("/").filter(Boolean).length >= 2) return "article";
  return "unknown";
};

const getEvidenceContentStatus = (source: WebSource): WebContentStatus => {
  const readStatus = source.readStatus;
  if (source.excerptStatus === "fetched" && source.excerpt?.trim()) {
    return readStatus === "partial" || source.excerptQuality === "partial" || source.excerptQuality === "medium" ? "partial" : "fetched";
  }
  if (!source.excerptStatus || source.excerptStatus === "not_requested") return "not_fetched";
  if (source.excerptStatus === "blocked" || source.excerptQuality === "blocked") {
    return source.errorKind === "blocked_or_unreadable" ? "needs_js" : "blocked";
  }
  if (source.excerptQuality === "snippet_only" || source.excerptQuality === "title_only") return "search_summary_only";
  if (source.excerptQuality === "too_short" || source.excerptQuality === "empty") return "too_short";
  if (source.excerptStatus === "unavailable" || source.excerptQuality === "unavailable") return "unavailable";
  return "failed";
};

const rejectEvidence = (
  source: WebSource,
  pageType: WebPageType,
  contentStatus: WebContentStatus,
  reason: string,
): WebSource => ({
  ...source,
  pageType,
  contentStatus,
  evidenceStatus: "rejected",
  usableEvidence: false,
  injectedIntoAnswer: false,
  finalIncludedInPrompt: false,
  selected: false,
  sourceStrength: "rejected",
  rejectedReason: reason,
  evidenceReason: undefined,
});

const isRecentOrNewsDecision = (decision: SearchDecision, userInput = ""): boolean =>
  decision.vertical === "news" ||
  decision.newsIntent === true ||
  decision.aiPlanner?.freshness === "news" ||
  isRecentGeneralWebDecision(decision, userInput);

const isSearchOrUtilityPage = (pageType: WebPageType): boolean =>
  pageType === "homepage" ||
  pageType === "search_page" ||
  pageType === "redirect" ||
  pageType === "login" ||
  pageType === "download";

const isWeakNewsCommunitySource = (source: WebSource): boolean => {
  const { host } = getEvidenceUrlParts(source);
  return host.includes("zhihu.com") || host.includes("csdn.net") || host.includes("cnblogs.com");
};

export const evaluateWebSourceEvidence = (
  source: WebSource,
  decision: SearchDecision,
  fetchedExcerpt?: string,
  userInput = "",
): WebSource => {
  const pageType = source.pageType ?? classifyEvidencePageType(source);
  const contentStatus = source.contentStatus ?? getEvidenceContentStatus({ ...source, excerpt: fetchedExcerpt ?? source.excerpt });
  const { host, path } = getEvidenceUrlParts(source);
  const hasExcerpt = Boolean((fetchedExcerpt ?? source.excerpt)?.trim());
  const vertical = decision.vertical ?? decision.aiPlanner?.vertical ?? inferSearchVertical(decision);
  const isNews = vertical === "news" || decision.newsIntent === true || decision.aiPlanner?.freshness === "news";
  const recent = isRecentOrNewsDecision(decision, userInput);

  if (host === "go.microsoft.com" && path.startsWith("/fwlink")) {
    return rejectEvidence(source, "redirect", contentStatus, "redirect URL is not citable evidence");
  }
  if (host.includes("bing.com")) {
    return rejectEvidence(source, "search_page", contentStatus, "search engine page is not citable evidence");
  }
  if (isSearchOrUtilityPage(pageType)) {
    return rejectEvidence(source, pageType, contentStatus, `${pageType} pages are not citable evidence`);
  }
  if (["unavailable", "needs_js", "blocked", "failed", "search_summary_only", "too_short", "wrong_page_type"].includes(contentStatus)) {
    return rejectEvidence(source, pageType, contentStatus, `content status ${contentStatus} is not usable evidence`);
  }
  if (!hasExcerpt || contentStatus === "not_fetched") {
    return {
      ...source,
      pageType,
      contentStatus,
      evidenceStatus: source.sourceKind === "search_result" ? "candidate" : "fetched",
      usableEvidence: false,
      injectedIntoAnswer: false,
      finalIncludedInPrompt: false,
      selected: false,
      sourceStrength: "rejected",
      rejectedReason: "search summary without fetched page body is not citable evidence",
    };
  }

  if (isNews) {
    const newsAllowed = pageType === "news_article" || pageType === "article";
    if (!newsAllowed) {
      return rejectEvidence(source, pageType, contentStatus, `${pageType} is not valid news evidence`);
    }
    const hasDate = Boolean(source.dateHint?.trim()) || /\b20\d{2}[-/.年]\d{1,2}|\b20\d{2}\b/.test([source.title, source.snippet, source.excerpt].filter(Boolean).join(" "));
    const weakCommunity = isWeakNewsCommunitySource(source);
    const sourceStrength: WebSourceStrength = weakCommunity || !hasDate ? "weak" : isNewsAuthorityDomain(host) || source.reliability === "official" ? "strong" : "medium";
    return {
      ...source,
      pageType: pageType === "article" && (source.newsLike === true || source.searchStage?.startsWith("news-")) ? "news_article" : pageType,
      contentStatus,
      evidenceStatus: "usable",
      usableEvidence: true,
      evidenceReason: [
        "fetched page body passed news evidence gate",
        hasDate ? "has date signal" : "no clear publication date",
        weakCommunity ? "community source; weak for news" : undefined,
      ].filter(Boolean).join("; "),
      rejectedReason: undefined,
      sourceStrength,
    };
  }

  if (vertical === "docs") {
    if (pageType === "encyclopedia" && recent) {
      return rejectEvidence(source, pageType, contentStatus, "encyclopedia page cannot answer a recent/latest request");
    }
    const docsLike = pageType === "docs" || pageType === "api_docs" || pageType === "article" || source.reliability === "official";
    return {
      ...source,
      pageType,
      contentStatus,
      evidenceStatus: docsLike ? "usable" : "fetched",
      usableEvidence: docsLike,
      evidenceReason: docsLike ? "fetched documentation or tutorial page passed evidence gate" : undefined,
      rejectedReason: docsLike ? undefined : "fetched page is not a documentation-like source",
      sourceStrength: docsLike ? source.reliability === "official" ? "strong" : "medium" : "rejected",
    };
  }

  if (vertical === "algorithm" || vertical === "oi" || isOiResearchIntent(decision)) {
    const oiStrong = host.includes("oi-wiki.org") || host.includes("cp-algorithms.com") || host.includes("usaco.guide") || host.includes("luogu.com.cn") || host.includes("codeforces.com");
    const sourceStrength: WebSourceStrength = oiStrong ? "strong" : source.reliability === "blog" ? "weak" : "medium";
    return {
      ...source,
      pageType,
      contentStatus,
      evidenceStatus: "usable",
      usableEvidence: true,
      evidenceReason: oiStrong ? "fetched trusted OI/algorithm source passed evidence gate" : "fetched algorithm-related page passed evidence gate",
      rejectedReason: undefined,
      sourceStrength,
    };
  }

  if (host.includes("github.com")) {
    const githubAllowed = /\/(?:releases?|issues?|pull|pulls|blob|tree|wiki)(?:\/|$)/.test(path) || /\/README(?:\.md)?$/i.test(path);
    if (!githubAllowed) {
      return rejectEvidence(source, pageType, contentStatus, "GitHub search/topic/login-like pages are not citable evidence");
    }
  }

  if (recent && pageType === "encyclopedia") {
    return rejectEvidence(source, pageType, contentStatus, "encyclopedia page cannot answer a recent/latest request");
  }

  return {
    ...source,
    pageType,
    contentStatus,
    evidenceStatus: "usable",
    usableEvidence: true,
    evidenceReason: "fetched page body passed general evidence gate",
    rejectedReason: undefined,
    sourceStrength: source.reliability === "official" || pageType === "docs" || pageType === "api_docs" ? "strong" : pageType === "forum" || source.reliability === "blog" ? "weak" : "medium",
  };
};

const NEWS_ENTITY_ALIASES: Record<string, string[]> = {
  openai: ["openai", "chatgpt", "gpt", "codex", "sora"],
  anthropic: ["anthropic", "claude"],
  google_ai: ["google", "gemini", "deepmind"],
  microsoft_ai: ["microsoft", "copilot"],
  nvidia: ["nvidia"],
};

const normalizeNewsFocusEntity = (value: string): string | undefined => {
  if (/\bopenai\b|\bchatgpt\b|\bgpt\b|\bcodex\b|\bsora\b/i.test(value)) return "openai";
  if (/\banthropic\b|\bclaude\b/i.test(value)) return "anthropic";
  if (/\bgoogle\b|\bgemini\b|\bdeepmind\b/i.test(value)) return "google_ai";
  if (/\bmicrosoft\b|\bcopilot\b/i.test(value)) return "microsoft_ai";
  if (/\bnvidia\b/i.test(value)) return "nvidia";
  return undefined;
};

const getQueryFocusEntities = (
  rawUserQuery?: string,
  searchQueries: string[] = [],
): { entities: string[]; source: WebSource["focusEntitySource"] } => {
  const rawEntities = rawUserQuery?.trim()
    ? unique([normalizeNewsFocusEntity(rawUserQuery)].filter((entity): entity is string => Boolean(entity)))
    : [];
  if (rawUserQuery?.trim()) {
    return { entities: rawEntities, source: rawEntities.length > 0 ? "raw_user_query" : "none" };
  }
  const queryEntities = unique(searchQueries.map(normalizeNewsFocusEntity).filter((entity): entity is string => Boolean(entity)));
  return { entities: queryEntities, source: queryEntities.length > 0 ? "search_query" : "none" };
};

const sourceOfficialEntity = (source: WebSource, host: string): string | undefined => {
  const text = `${source.discoveredBy ?? ""} ${source.sourceHome ?? ""} ${source.feedUrl ?? ""} ${source.url ?? ""}`.toLocaleLowerCase();
  if (host === "openai.com" || text.includes("openai.com") || text.includes("openai-news")) return "openai";
  if (host === "anthropic.com" || host.endsWith(".anthropic.com") || text.includes("anthropic.com") || text.includes("anthropic-news")) return "anthropic";
  if (host === "blog.google" || host === "deepmind.google" || text.includes("blog.google") || text.includes("deepmind.google") || text.includes("google-ai")) return "google_ai";
  if (host.endsWith("microsoft.com") || text.includes("microsoft-ai")) return "microsoft_ai";
  if (host.endsWith("nvidia.com")) return "nvidia";
  return undefined;
};

const titleHasPrimaryNewsEntity = (title: string, entity: string): boolean => {
  const lower = title.toLocaleLowerCase().trim();
  const aliases = NEWS_ENTITY_ALIASES[entity] ?? [];
  if (aliases.some((alias) => new RegExp(`\\b${alias}\\b`, "i").test(lower) && lower.startsWith(alias))) return true;
  return aliases.some((alias) => new RegExp(`\\b${alias}\\b\\s+(?:launches|announces|releases|unveils|says|adds|introduces|updates|model|agent|tool|news)`, "i").test(lower));
};

const classifyFocusEntityMatch = (
  source: WebSource,
  focusEntities: string[],
  host: string,
): { strength: "primary" | "secondary" | "mention" | "none"; entities: string[]; reason?: string } => {
  if (focusEntities.length === 0) return { strength: "none", entities: [] };
  const officialEntity = sourceOfficialEntity(source, host);
  if (officialEntity && focusEntities.includes(officialEntity)) {
    return { strength: "primary", entities: [officialEntity], reason: "official focus entity source" };
  }
  if (officialEntity && !focusEntities.includes(officialEntity)) {
    return { strength: "none", entities: [officialEntity], reason: `official source belongs to ${officialEntity}` };
  }
  const title = source.title ?? "";
  const text = [source.title, source.snippet, source.site, source.url].filter(Boolean).join(" ");
  const primaryEntities = focusEntities.filter((entity) => titleHasPrimaryNewsEntity(title, entity));
  if (primaryEntities.length > 0) return { strength: "secondary", entities: primaryEntities, reason: "focus entity is primary title subject" };
  const mentionedEntities = focusEntities.filter((entity) => (NEWS_ENTITY_ALIASES[entity] ?? []).some((alias) => new RegExp(`\\b${alias}\\b`, "i").test(text)));
  if (mentionedEntities.length > 0) return { strength: "mention", entities: mentionedEntities, reason: "focus entity appears only as a mention" };
  return { strength: "none", entities: [], reason: "focus entity not found" };
};

export const classifyNewsCandidateForVertical = (
  source: WebSource,
  topicKeywords: string[] = [],
  rawUserQuery?: string,
  searchQueries: string[] = [],
): { newsLike: boolean; filteredReason?: string; score: number; reason: string; queryFocusEntities?: string[]; companySpecificNews?: boolean; focusEntitySource?: WebSource["focusEntitySource"]; candidatePrimaryEntities?: string[]; entityMatchStrength?: "primary" | "secondary" | "mention" | "none"; entityFilterApplied?: boolean; rejectedWrongEntityReason?: string } => {
  const { host, path } = getWebSourceUrlParts(source);
  const text = [source.title, source.snippet, source.site, source.url].filter(Boolean).join(" ");
  const focus = getQueryFocusEntities(rawUserQuery, searchQueries);
  const queryFocusEntities = focus.entities;
  const companySpecificNews = queryFocusEntities.length === 1;
  const entityMatch = classifyFocusEntityMatch(source, queryFocusEntities, host);
  const entityFields = {
    queryFocusEntities,
    companySpecificNews,
    focusEntitySource: focus.source,
    candidatePrimaryEntities: entityMatch.entities,
    entityMatchStrength: entityMatch.strength,
    entityFilterApplied: companySpecificNews,
  };
  if (companySpecificNews && entityMatch.strength !== "primary" && entityMatch.strength !== "secondary") {
    return {
      newsLike: false,
      filteredReason: entityMatch.strength === "mention" ? "wrong_focus_entity_mention" : "wrong_focus_entity",
      score: entityMatch.strength === "mention" ? -45 : -90,
      reason: entityMatch.reason ?? "candidate does not make the query focus entity the main subject",
      rejectedWrongEntityReason: entityMatch.reason,
      ...entityFields,
    };
  }
  const topicPool = isAiNewsTopic(topicKeywords)
    ? unique([...topicKeywords, ...AI_NEWS_RELEVANCE_KEYWORDS])
    : unique(topicKeywords);
  const topicMatches = topicPool.length > 0 ? getKeywordMatches(text, topicPool) : [];
  const eventMatches = getKeywordMatches(text, NEWS_EVENT_KEYWORDS);
  const hasDateHint = Boolean(source.dateHint?.trim()) || /\b20\d{2}\b/.test(text);
  const isCompanyHomepage = (host === "openai.com" || host === "anthropic.com") && (path === "/" || path === "");
  const isCompanyNewsPath = (host === "openai.com" || host === "anthropic.com") && /\/(?:news|blog|announcements?)(?:\/|$)/i.test(path);
  const isCompanyReferencePath = (host === "openai.com" || host === "anthropic.com") && !isCompanyNewsPath;
  const isReferenceHost = NEWS_REFERENCE_HOST_PATTERNS.some((pattern) => pattern.test(host));
  const isBlockedHost = NEWS_BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(host));
  const docsOrHomepage =
    isCompanyHomepage ||
    isCompanyReferencePath ||
    path.includes("/docs") ||
    path.includes("/documentation") ||
    path.includes("/learn/what-is") ||
    /(^|\.)docs\./i.test(host) ||
    /\/(?:docs|documentation|developers?|api)(?:\/|$)/i.test(path);
  const referenceText = NEWS_REFERENCE_TEXT_PATTERNS.some((pattern) => pattern.test(text));

  if (isReferenceHost) {
    return { newsLike: false, filteredReason: "wiki_or_reference", score: -100, reason: "wiki/reference source is not news evidence" };
  }
  if (isBlockedHost) {
    return { newsLike: false, filteredReason: "not_news_like", score: -90, reason: "video/code hosting source is not news evidence" };
  }
  if (docsOrHomepage || referenceText) {
    return { newsLike: false, filteredReason: "docs_or_homepage", score: -85, reason: "docs/homepage/definition source is not news evidence" };
  }
  if (isObviousOffTopicNewsResult(source)) {
    return { newsLike: false, filteredReason: "not_news_like", score: -80, reason: "dictionary/translation/lyrics/video-like result" };
  }
  if (topicPool.length > 0 && topicMatches.length === 0) {
    return { newsLike: false, filteredReason: "topic_mismatch", score: -70, reason: "result does not match news topic keywords" };
  }

  const authority = isNewsAuthorityDomain(host);
  const sourceStage = source.searchStage ?? "";
  const discoveryNews = sourceStage.startsWith("news-");
  const freshnessScore = getWebSourceFreshnessScore(source);
  const newsLike = isCompanyNewsPath || authority || discoveryNews || eventMatches.length > 0 || hasDateHint;
  if (!newsLike) {
    return { newsLike: false, filteredReason: "not_news_like", score: -50, reason: "result lacks news domain, date, or event signals" };
  }

  const score = 58 +
    Math.min(20, topicMatches.length * 5) +
    Math.min(18, eventMatches.length * 6) +
    (authority ? 18 : 0) +
    (isCompanyNewsPath ? 16 : 0) +
    (hasDateHint ? 8 : 0) +
    (discoveryNews ? 8 : 0) +
    freshnessScore;
  return {
    newsLike: true,
    score,
    ...entityFields,
    reason: [
      authority ? "news authority domain" : undefined,
      isCompanyNewsPath ? "official news path" : undefined,
      discoveryNews ? "Bing News discovery" : undefined,
      hasDateHint ? "date hint" : undefined,
      `freshness +${freshnessScore}`,
      eventMatches.length > 0 ? `event terms: ${eventMatches.slice(0, 3).join("/")}` : undefined,
      topicMatches.length > 0 ? `topic: ${topicMatches.slice(0, 3).join("/")}` : undefined,
    ].filter(Boolean).join("; ") || "news-like result",
  };
};

const classifyGeneralWebSourceRelevance = (
  source: WebSource,
  decision: SearchDecision,
  userInput: string,
): { relevance: WebSourceRelevance; score: number; reason: string; queryFocusEntities?: string[]; companySpecificNews?: boolean; focusEntitySource?: WebSource["focusEntitySource"]; candidatePrimaryEntities?: string[]; entityMatchStrength?: "primary" | "secondary" | "mention" | "none"; entityFilterApplied?: boolean; rejectedWrongEntityReason?: string } => {
  const topicKeywords = getGeneralWebTopicKeywords(decision, userInput);
  if (!isRecentGeneralWebDecision(decision, userInput) || topicKeywords.length === 0) {
    return { relevance: source.relevance ?? "strong", score: 40, reason: source.relevanceReason ?? "无明确新闻主题过滤要求。" };
  }

  const text = [source.title, source.snippet, source.site, source.url].filter(Boolean).join(" ");
  const relevanceKeywords = isAiNewsTopic(topicKeywords)
    ? unique([...topicKeywords, ...AI_NEWS_RELEVANCE_KEYWORDS])
    : topicKeywords;
  const topicMatches = getKeywordMatches(text, relevanceKeywords);
  const newsMatches = getKeywordMatches(text, [...RECENT_INFO_CONTENT_KEYWORDS, ...RECENT_INFO_TIME_KEYWORDS]);
  const offTopic = isObviousOffTopicNewsResult(source);
  const vertical = decision.vertical ?? decision.aiPlanner?.vertical ?? inferSearchVertical(decision);

  if (vertical === "news") {
    const newsClassification = classifyNewsCandidateForVertical(source, topicKeywords, userInput || decision.rawQuestion, decision.queries);
    if (!newsClassification.newsLike) {
      return {
        relevance: "unrelated",
        score: newsClassification.score,
        reason: newsClassification.filteredReason ?? newsClassification.reason,
        queryFocusEntities: newsClassification.queryFocusEntities,
        companySpecificNews: newsClassification.companySpecificNews,
        focusEntitySource: newsClassification.focusEntitySource,
        candidatePrimaryEntities: newsClassification.candidatePrimaryEntities,
        entityMatchStrength: newsClassification.entityMatchStrength,
        entityFilterApplied: newsClassification.entityFilterApplied,
        rejectedWrongEntityReason: newsClassification.rejectedWrongEntityReason,
      };
    }
    return {
      relevance: newsClassification.score >= 64 ? "strong" : "candidate",
      score: newsClassification.score,
      reason: newsClassification.reason,
      queryFocusEntities: newsClassification.queryFocusEntities,
      companySpecificNews: newsClassification.companySpecificNews,
      focusEntitySource: newsClassification.focusEntitySource,
      candidatePrimaryEntities: newsClassification.candidatePrimaryEntities,
      entityMatchStrength: newsClassification.entityMatchStrength,
      entityFilterApplied: newsClassification.entityFilterApplied,
      rejectedWrongEntityReason: newsClassification.rejectedWrongEntityReason,
    };
  }

  if (offTopic && topicMatches.length === 0) {
    return { relevance: "unrelated", score: -80, reason: "query/topic mismatch：词典、翻译、歌曲或视频类结果未命中新闻主题。" };
  }
  if (topicMatches.length === 0) {
    return { relevance: "unrelated", score: -60, reason: "query/topic mismatch：结果未命中新闻主题关键词。" };
  }
  if (offTopic) {
    return { relevance: "unrelated", score: -50, reason: "query/topic mismatch：结果像词义、翻译、歌词、歌曲或视频内容，不作为新闻来源。" };
  }

  const score = 46 + Math.min(24, topicMatches.length * 8) + Math.min(12, newsMatches.length * 4);
  return {
    relevance: score >= 58 ? "strong" : "candidate",
    score,
    reason: `命中新闻主题：${topicMatches.slice(0, 4).join(" / ")}。`,
  };
};

const scoreWebSourceRank = (
  source: WebSource,
  decision: SearchDecision,
  userInput = "",
  context?: Pick<NoteChatContextPayload, "noteTitle" | "tags" | "summary" | "selectedText">,
  relevanceScore = 0,
): Pick<WebSource, "rankScore" | "rankReason" | "sourceRegistryBoost" | "sourceRegistryLabel" | "sourceRegistryReason"> => {
  if (source.usableEvidence === false || source.evidenceStatus === "rejected") {
    return {
      rankScore: -200,
      rankReason: source.rejectedReason ?? "rejected by evidence gate",
      sourceRegistryBoost: undefined,
      sourceRegistryLabel: undefined,
      sourceRegistryReason: undefined,
    };
  }
  const recentInfoRequested = isRecentGeneralWebDecision(decision, userInput);
  const text = getSourceSearchText(source);
  const problemId = decision.problemId?.trim().toUpperCase();
  let score = relevanceScore;
  const reasons: string[] = [];

  if (problemId && text.includes(normalizeSearchText(problemId))) {
    score += 34;
    reasons.push("matches target problem id");
  }
  const titleTokens = tokenizeProblemTitle([decision.problemTitle, context?.noteTitle].filter(Boolean).join(" "));
  const titleMatches = titleTokens.filter((token) => text.includes(normalizeSearchText(token)));
  if (titleMatches.length > 0) {
    score += Math.min(18, titleMatches.length * 6);
    reasons.push("matches problem title");
  }
  const algorithmMatches = (decision.algorithmKeywords ?? []).filter((keyword) => text.includes(normalizeSearchText(keyword)));
  if (algorithmMatches.length > 0) {
    score += Math.min(24, algorithmMatches.length * 8);
    reasons.push("matches algorithm keyword");
  }
  const coreMatches = getCoreKeywordMatches(source, decision, userInput);
  if (coreMatches.length > 0) {
    score += Math.min(18, coreMatches.length * 6);
    reasons.push("matches question focus");
  }

  const reliabilityScore = getReliabilityRankScore(source);
  if (reliabilityScore > 0) reasons.push(`reliability +${reliabilityScore}`);
  score += reliabilityScore;

  const typeScore = getSourceTypeRankScore(source, decision, recentInfoRequested);
  if (typeScore !== 0) reasons.push(typeScore > 0 ? "preferred source type" : "less suitable source type");
  score += typeScore;

  const registryRank = getSourceRegistryRank(source, decision, recentInfoRequested);
  if (registryRank.score !== 0) reasons.push(registryRank.reason ?? "source registry weighting");
  score += registryRank.score;

  const dateScore = getDateRankScore(source, recentInfoRequested);
  if (dateScore !== 0) reasons.push(dateScore > 0 ? "has recent date hint" : "weak or old date hint");
  score += dateScore;

  if (source.excerptStatus === "fetched") {
    score += source.cacheStatus === "stale" ? 4 : 12;
    reasons.push(source.cacheStatus === "stale" ? "has stale excerpt" : "has fetched excerpt");
  } else if (source.excerptStatus === "failed" || source.excerptStatus === "unavailable") {
    score -= 4;
    reasons.push("excerpt unavailable");
  }

  if (source.usableEvidence === true) {
    score += source.sourceStrength === "strong" ? 18 : source.sourceStrength === "medium" ? 10 : 2;
    reasons.push(`evidence ${source.sourceStrength ?? "usable"}`);
  } else if (source.evidenceStatus === "candidate" || source.evidenceStatus === "fetched") {
    score -= 60;
    reasons.push("not citable evidence");
  }

  if (source.sourceKind === "explicit_url") {
    score += 30;
    reasons.push("user-provided URL");
  }

  if (source.isConstructed) {
    score += source.excerptStatus === "fetched" ? 6 : -18;
    reasons.push(source.excerptStatus === "fetched" ? "constructed source verified by excerpt" : "constructed source not yet read");
  }

  const lowQualityPenalty = getLowQualityPenalty(source, decision, userInput, recentInfoRequested);
  if (lowQualityPenalty < 0) reasons.push("low-quality signals");
  score += lowQualityPenalty;

  return {
    rankScore: Math.round(score),
    rankReason: reasons.slice(0, 4).join("; ") || "kept by provider order",
    sourceRegistryBoost: registryRank.score || undefined,
    sourceRegistryLabel: registryRank.label,
    sourceRegistryReason: registryRank.reason,
  };
};

export const rankPreparedWebSources = (
  sources: WebSource[],
  decision: SearchDecision,
  userInput = "",
  context?: Pick<NoteChatContextPayload, "noteTitle" | "tags" | "summary" | "selectedText">,
): WebSource[] => {
  const recentInfoRequested = isRecentGeneralWebDecision(decision, userInput);
  const focus = getQueryFocusEntities(userInput || decision.rawQuestion, decision.queries);
  const focusEntities = focus.entities;
  const companySpecificNews = recentInfoRequested && focusEntities.length === 1;
  const readBudget = decision.sourceStrategy?.readBudget ?? getWebReadBudgetPlan(decision);
  const clusterForRoundup = isBroadAiNewsRoundupDecision(decision, userInput);
  const clusterNewsSources = clusterForRoundup || recentInfoRequested;
  let selectedCandidateCount = 0;
  let selectedStrongCount = 0;
  const ranked = sources
    .map((source, index) => {
      const rank = scoreWebSourceRank(source, decision, userInput, context, 0);
      const relevance: WebSourceRelevance = source.relevance ?? (
        (rank.rankScore ?? 0) >= (recentInfoRequested ? 34 : 28) ? "strong" : "candidate"
      );
      return { ...source, ...rank, relevance, index };
    })
    .sort((left, right) => (right.rankScore ?? 0) - (left.rankScore ?? 0) || left.index - right.index)
    .map(({ index: _index, ...source }) => source);

  const clustered = withNewsEventClusters(ranked, clusterNewsSources);

  if (clusterForRoundup) {
    const selectedKeys = new Set<string>();
    const selectedClusterCounts = new Map<string, number>();
    const sourceKey = (source: WebSource): string => `${source.id || source.url}`;
    const usableNewsSources = clustered.filter((source) => source.usableEvidence === true && isNewsSourceForClustering(source));
    const clusterCount = new Set(usableNewsSources.map((source) => source.eventCluster ?? "other-ai-news")).size;
    const maxPerCluster = clusterCount <= 1 ? Math.min(3, readBudget.maxPromptSources) : 2;
    const trySelect = (source: WebSource, requireEmptyCluster: boolean) => {
      if (selectedKeys.size >= readBudget.maxPromptSources) return;
      if (source.usableEvidence !== true) return;
      const relevance = source.relevance ?? "strong";
      if (relevance !== "strong" && (source.rankScore ?? 0) < 36) return;
      const cluster = source.eventCluster ?? "other-ai-news";
      const currentCount = selectedClusterCounts.get(cluster) ?? 0;
      if (requireEmptyCluster && currentCount > 0) return;
      if (currentCount >= maxPerCluster) return;
      selectedKeys.add(sourceKey(source));
      selectedClusterCounts.set(cluster, currentCount + 1);
    };

    usableNewsSources.forEach((source) => trySelect(source, true));
    usableNewsSources.forEach((source) => trySelect(source, false));

    return clustered.map((source) => {
      const key = sourceKey(source);
      const selected = selectedKeys.has(key);
      const cluster = source.eventCluster ?? "other-ai-news";
      const duplicateCluster = source.usableEvidence === true &&
        isNewsSourceForClustering(source) &&
        !selected &&
        (selectedClusterCounts.get(cluster) ?? 0) >= maxPerCluster;
      return {
        ...source,
        selected,
        finalIncludedInPrompt: selected,
        injectedIntoAnswer: selected,
        selectedForRoundup: selected,
        droppedAsDuplicateCluster: duplicateCluster,
      };
    });
  }

  const selectedClusterCounts = new Map<string, number>();
  return clustered
    .map((source) => {
      const relevance = source.relevance ?? "strong";
      const usableEvidence = source.usableEvidence === true;
      const candidateThreshold = recentInfoRequested ? 36 : 30;
      const entityMatch = companySpecificNews
        ? source.entityMatchStrength ?? classifyFocusEntityMatch(source, focusEntities, getWebSourceUrlParts(source).host).strength
        : undefined;
      const entityAllowed = !companySpecificNews || entityMatch === "primary" || entityMatch === "secondary";
      const cluster = source.eventCluster ?? "other-ai-news";
      const maxPerCluster = recentInfoRequested && isNewsSourceForClustering(source) ? 2 : Number.POSITIVE_INFINITY;
      const currentClusterCount = selectedClusterCounts.get(cluster) ?? 0;
      const baseSelect = usableEvidence && (
        relevance === "strong"
          ? selectedStrongCount < readBudget.maxPromptSources
          : selectedCandidateCount < 2 && (source.rankScore ?? 0) >= candidateThreshold
      );
      const duplicateCluster = baseSelect && currentClusterCount >= maxPerCluster;
      const shouldSelect = baseSelect && entityAllowed && !duplicateCluster;
      if (shouldSelect && relevance === "strong") selectedStrongCount += 1;
      if (shouldSelect && relevance === "candidate") selectedCandidateCount += 1;
      if (shouldSelect) selectedClusterCounts.set(cluster, currentClusterCount + 1);
      return {
        ...source,
        selected: shouldSelect,
        finalIncludedInPrompt: shouldSelect,
        injectedIntoAnswer: shouldSelect,
        selectedForRoundup: false,
        droppedAsDuplicateCluster: duplicateCluster,
        queryFocusEntities: companySpecificNews ? focusEntities : source.queryFocusEntities,
        companySpecificNews: companySpecificNews || source.companySpecificNews,
        focusEntitySource: companySpecificNews ? focus.source : source.focusEntitySource,
        entityMatchStrength: entityMatch ?? source.entityMatchStrength,
        entityFilterApplied: companySpecificNews || source.entityFilterApplied,
        rejectedWrongEntityReason: entityAllowed ? source.rejectedWrongEntityReason : "company-specific news requires primary or secondary focus entity match",
      };
    });
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
      sourceKind: "constructed_source",
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
      sourceKind: "constructed_source",
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
        sourceKind: "constructed_source",
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

const getNewsClusterText = (source: WebSource): string =>
  normalizeSearchText([
    source.title,
    source.snippet,
    source.excerpt,
    source.url,
    source.site,
  ].filter(Boolean).join(" "));

const NEWS_CLUSTER_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "into", "is", "it", "its",
  "new", "news", "of", "on", "or", "over", "report", "says", "the", "to", "with",
  "ai", "artificial", "intelligence", "latest", "update", "updates", "launches", "announces", "unveils",
  "发布", "宣布", "最新", "新闻", "报道", "的", "了", "和", "与",
]);

const NEWS_ENTITY_RULES: Array<{ tag: string; label: string; patterns: RegExp[] }> = [
  { tag: "openai", label: "OpenAI", patterns: [/\bopenai\b/i, /\bchatgpt\b/i, /\bgpt[-\s]?\d*/i] },
  { tag: "anthropic", label: "Anthropic", patterns: [/\banthropic\b/i, /\bclaude\b/i] },
  { tag: "google", label: "Google", patterns: [/\bgoogle\b/i, /\bgemini\b/i, /\bdeepmind\b/i] },
  { tag: "microsoft", label: "Microsoft", patterns: [/\bmicrosoft\b/i, /\bcopilot\b/i] },
  { tag: "nvidia", label: "NVIDIA", patterns: [/\bnvidia\b/i] },
  { tag: "meta", label: "Meta", patterns: [/\bmeta\b/i, /\bllama\b/i] },
  { tag: "apple", label: "Apple", patterns: [/\bapple\b/i] },
  { tag: "xai", label: "xAI", patterns: [/\bxai\b/i, /\bgrok\b/i] },
  { tag: "deepseek", label: "DeepSeek", patterns: [/\bdeepseek\b/i] },
];

const NEWS_EVENT_TOKEN_RULES: Array<{ token: string; label: string; patterns: RegExp[] }> = [
  { token: "model", label: "model release", patterns: [/\bmodel\b/i, /\brelease\b/i, /\bgpt[-\s]?\d*/i, /\bgemini\b/i, /\bclaude\b/i, /模型|发布|推出/] },
  { token: "agent", label: "agent / tool", patterns: [/\bagent\b/i, /\btool\b/i, /\bcopilot\b/i, /\bworkspace\b/i, /\bgmail\b/i, /智能体|工具/] },
  { token: "funding", label: "funding", patterns: [/\bfunding\b/i, /\bfundraise/i, /\bstartup\b/i, /\bvaluation\b/i, /\binvestment\b/i, /融资|投资|初创/] },
  { token: "regulation", label: "regulation", patterns: [/\bregulation\b/i, /\bpolicy\b/i, /\blaw\b/i, /\bai\s+act\b/i, /\beu\b/i, /监管|政策|法规|法案/] },
  { token: "security", label: "security / safety", patterns: [/\bsafety\b/i, /\bsecurity\b/i, /\brisk\b/i, /\bvulnerab/i, /安全|风险|漏洞/] },
  { token: "research", label: "research", patterns: [/\bresearch\b/i, /\bbenchmark\b/i, /\bpaper\b/i, /研究|论文|基准/] },
  { token: "infrastructure", label: "infrastructure", patterns: [/\binfrastructure\b/i, /\bdatacenter\b/i, /\bdata\s+center\b/i, /\bchip\b/i, /\bgpu\b/i, /\bnvidia\b/i, /\bcompute\b/i, /算力|芯片|数据中心/] },
  { token: "partnership", label: "partnership", patterns: [/\bpartnership\b/i, /\bpartner\b/i, /\bcollaborat/i, /合作/] },
  { token: "lawsuit", label: "lawsuit", patterns: [/\blawsuit\b/i, /\bsues?\b/i, /\bcourt\b/i, /诉讼|起诉|法院/] },
  { token: "acquisition", label: "acquisition", patterns: [/\bacquisition\b/i, /\bacquires?\b/i, /\bmerger\b/i, /收购|并购/] },
];

const extractNewsClusterTokens = (text: string): string[] =>
  text
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !NEWS_CLUSTER_STOP_WORDS.has(token))
    .slice(0, 16);

const extractNewsEntityTags = (text: string): Array<{ tag: string; label: string }> =>
  NEWS_ENTITY_RULES
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(text)))
    .map(({ tag, label }) => ({ tag, label }));

const extractNewsEventTokens = (text: string): Array<{ token: string; label: string }> =>
  NEWS_EVENT_TOKEN_RULES
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(text)))
    .map(({ token, label }) => ({ token, label }));

const NEWS_EVENT_CLUSTER_RULES: Array<{ id: string; label: string; reason: string; patterns: RegExp[] }> = [
  {
    id: "google-io-gemini",
    label: "Google I/O / Gemini",
    reason: "matched Google I/O, Gemini, Workspace, Gmail, Genie, Antigravity, or Google agent signals",
    patterns: [/\bgoogle\s+i\/?o\b/i, /\bgemini\b/i, /\bworkspace\b/i, /\bgmail\b/i, /\bgenie\b/i, /\bantigravity\b/i, /\bgoogle\s+agent/i],
  },
  {
    id: "openai-chatgpt",
    label: "OpenAI / ChatGPT",
    reason: "matched OpenAI, ChatGPT, or GPT signals",
    patterns: [/\bopenai\b/i, /\bchatgpt\b/i, /\bgpt[-\s]?\d*/i],
  },
  {
    id: "anthropic-claude",
    label: "Anthropic / Claude",
    reason: "matched Anthropic or Claude signals",
    patterns: [/\banthropic\b/i, /\bclaude\b/i],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    reason: "matched DeepSeek signals",
    patterns: [/\bdeepseek\b/i],
  },
  {
    id: "ai-regulation",
    label: "AI regulation",
    reason: "matched regulation, law, policy, or AI Act signals",
    patterns: [/\bregulation\b/i, /\bpolicy\b/i, /\blaw\b/i, /\bai\s+act\b/i, /\beu\b/i, /监管|政策|法案|法规/],
  },
  {
    id: "ai-funding-startup",
    label: "AI funding / startups",
    reason: "matched funding, startup, valuation, or investment signals",
    patterns: [/\bfunding\b/i, /\bfundraise/i, /\bstartup\b/i, /\bvaluation\b/i, /\binvestment\b/i, /融资|初创|估值|投资/],
  },
  {
    id: "ai-infrastructure",
    label: "AI infrastructure",
    reason: "matched infrastructure, chip, Nvidia, compute, or datacenter signals",
    patterns: [/\binfrastructure\b/i, /\bdatacenter\b/i, /\bdata\s+center\b/i, /\bchip\b/i, /\bnvidia\b/i, /\bcompute\b/i, /基础设施|算力|芯片|数据中心/],
  },
  {
    id: "ai-safety-security",
    label: "AI safety / security",
    reason: "matched safety, security, risk, or vulnerability signals",
    patterns: [/\bsafety\b/i, /\bsecurity\b/i, /\brisk\b/i, /\bvulnerab/i, /安全|风险|漏洞/],
  },
];

export const classifyNewsEventCluster = (source: Pick<WebSource, "title" | "snippet" | "excerpt" | "url" | "site">): { eventCluster: string; clusterLabel: string; clusterReason: string } => {
  const text = getNewsClusterText(source as WebSource);
  const matched = NEWS_EVENT_CLUSTER_RULES.find((rule) => rule.patterns.some((pattern) => pattern.test(text)));
  if (matched) return { eventCluster: matched.id, clusterLabel: matched.label, clusterReason: matched.reason };
  const entities = extractNewsEntityTags(text);
  const events = extractNewsEventTokens(text);
  const titleTokens = extractNewsClusterTokens(source.title || text);
  if (entities.length > 0 || events.length > 0) {
    const entity = entities[0] ?? { tag: "ai", label: "AI" };
    const event = events[0] ?? { token: titleTokens[0] ?? "news", label: "news" };
    const supportingTokens = titleTokens
      .filter((token) => token !== entity.tag && token !== event.token)
      .slice(0, 2);
    return {
      eventCluster: [entity.tag, event.token, ...supportingTokens].join("-"),
      clusterLabel: `${entity.label} ${event.label}`,
      clusterReason: `matched entity=${entity.tag}; event=${event.token}; tokens=${supportingTokens.join("|") || "none"}`,
    };
  }
  const host = getSourceHostname(source.url ?? "");
  return {
    eventCluster: host ? `host:${host}` : "other-ai-news",
    clusterLabel: host ? `News from ${host}` : "Other AI news",
    clusterReason: host ? `fallback host cluster for ${host}` : "fallback miscellaneous AI news cluster",
  };
};

const isNewsSourceForClustering = (source: WebSource): boolean =>
  source.newsLike === true ||
  source.pageType === "news_article" ||
  source.pageType === "article" ||
  source.searchStage?.startsWith("news") === true;

const hasSpecificNewsSubject = (text: string): boolean =>
  /\bopenai\b|\banthropic\b|\bclaude\b|\bdeepseek\b|\bnvidia\b|\bgoogle\b|\bdeepmind\b|\bgemini\b|\bchatgpt\b|\bgpt[-\s]?\d*/i.test(text);

const isBroadAiNewsRoundupDecision = (decision: SearchDecision, userInput = ""): boolean => {
  const rawText = `${decision.rawQuestion} ${userInput}`.trim();
  const queryText = `${rawText} ${decision.queries.join(" ")}`;
  const newsLike = decision.newsIntent === true || decision.vertical === "news" || decision.aiPlanner?.freshness === "news";
  const mentionsAi = /\bai\b|人工智能|大模型/i.test(queryText);
  return newsLike && mentionsAi && !hasSpecificNewsSubject(rawText);
};

const withNewsEventClusters = (sources: WebSource[], enabled: boolean): WebSource[] => {
  if (!enabled) return sources;
  const clustered = sources.map((source) => {
    if (!isNewsSourceForClustering(source)) return source;
    const cluster = classifyNewsEventCluster(source);
    return {
      ...source,
      eventCluster: source.eventCluster ?? cluster.eventCluster,
      clusterLabel: source.clusterLabel ?? cluster.clusterLabel,
      clusterReason: source.clusterReason ?? cluster.clusterReason,
    };
  });
  const clusterSizes = clustered.reduce<Record<string, number>>((acc, source) => {
    if (source.usableEvidence === true && source.eventCluster) {
      acc[source.eventCluster] = (acc[source.eventCluster] ?? 0) + 1;
    }
    return acc;
  }, {});
  return clustered.map((source) => ({
    ...source,
    clusterSize: source.eventCluster ? clusterSizes[source.eventCluster] ?? 0 : source.clusterSize,
  }));
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

  if (source.sourceKind === "explicit_url") {
    return { relevance: "strong", score: 110, reason: "User explicitly provided this URL as reading context." };
  }

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

const prepareWebSourcesForDecisionBase = (
  rawSources: WebSource[],
  decision: SearchDecision,
  userInput = "",
  context?: Pick<NoteChatContextPayload, "noteTitle" | "tags" | "summary" | "selectedText">,
): WebSourceRelevanceResult => {
  const publicOiSources = buildPublicOiSourceCandidates(decision, userInput, context);
  const candidates = [...publicOiSources, ...rawSources];
  const candidateLimit = decision.sourceStrategy?.candidateLimit ?? getWebReadBudgetPlan(decision).maxCandidates;

  if (!decision.problemId) {
    const applyGeneralWebTopicFilter =
      decision.intent === "general_web" &&
      isRecentGeneralWebDecision(decision, userInput) &&
      getGeneralWebTopicKeywords(decision, userInput).length > 0;
    const vertical = decision.vertical ?? decision.aiPlanner?.vertical ?? inferSearchVertical(decision);
    const topicKeywords = getGeneralWebTopicKeywords(decision, userInput);
    const scored = candidates.map((source, index) => ({
      source,
      index,
      ...(applyGeneralWebTopicFilter
        ? classifyGeneralWebSourceRelevance(source, decision, userInput)
        : { relevance: source.relevance ?? "strong" as WebSourceRelevance, score: 40, reason: source.relevanceReason ?? "无明确题号时保留搜索 Provider 返回的来源。" }),
    }));
    const relevant = applyGeneralWebTopicFilter
      ? scored.filter((item) => item.relevance !== "unrelated")
      : scored;
    const filteredCount = scored.length - relevant.length;
    const filteredReasonCounts = scored
      .filter((item) => item.relevance === "unrelated")
      .reduce<Record<string, number>>((acc, item) => {
        const classification = vertical === "news" ? classifyNewsCandidateForVertical(item.source, topicKeywords, userInput || decision.rawQuestion, decision.queries) : undefined;
        const reason = classification?.filteredReason ?? item.reason ?? "query/topic mismatch";
        acc[reason] = (acc[reason] ?? 0) + 1;
        return acc;
      }, {});
    const filterReason = Object.entries(filteredReasonCounts)
      .sort((left, right) => right[1] - left[1])
      .map(([reason, count]) => `${reason} x${count}`)
      .join("; ");
    const seen = new Set<string>();
    const sources = relevant
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .filter(({ source }) => {
        const key = source.url.trim().toLocaleLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, candidateLimit)
      .map((item, index) => ({
        ...item.source,
        relevance: item.relevance,
        relevanceLabel: item.relevance === "strong" ? "强相关" : "相关资料",
        relevanceReason: item.reason,
        queryFocusEntities: item.queryFocusEntities,
        companySpecificNews: item.companySpecificNews,
        focusEntitySource: item.focusEntitySource,
        candidatePrimaryEntities: item.candidatePrimaryEntities,
        entityMatchStrength: item.entityMatchStrength,
        entityFilterApplied: item.entityFilterApplied,
        rejectedWrongEntityReason: item.rejectedWrongEntityReason,
        newsLike: vertical === "news" ? true : item.source.newsLike,
        freshnessScore: vertical === "news" ? getWebSourceFreshnessScore(item.source) : item.source.freshnessScore,
        filteredReason: undefined,
        finalIncludedInPrompt: index < 8,
        selected: index < 8,
      }));
    return {
      sources,
      filteredCount,
      filterReason,
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
    .slice(0, candidateLimit);

  return {
    sources,
    filteredCount,
    filterReason: filteredCount > 0 ? "problem/topic mismatch" : undefined,
    strongCount: sources.filter((source) => source.relevance === "strong").length,
    candidateCount: sources.filter((source) => source.relevance === "candidate").length,
  };
};

export const prepareWebSourcesForDecision = (
  rawSources: WebSource[],
  decision: SearchDecision,
  userInput = "",
  context?: Pick<NoteChatContextPayload, "noteTitle" | "tags" | "summary" | "selectedText">,
): WebSourceRelevanceResult => {
  const base = prepareWebSourcesForDecisionBase(rawSources, decision, userInput, context);
  const sources = rankPreparedWebSources(base.sources, decision, userInput, context).slice(0, decision.sourceStrategy?.candidateLimit ?? getWebReadBudgetPlan(decision).maxCandidates);
  return {
    ...base,
    sources,
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
  const discussionKeywords = unique([
    ...collectKeywords(haystack, OI_DISCUSSION_KEYWORDS),
    ...collectKeywords(haystack, CRITICAL_OI_DISCUSSION_KEYWORDS),
  ]);
  const solutionKeywords = collectKeywords(haystack, OI_SOLUTION_KEYWORDS);
  const algorithmKeywords = unique([
    ...collectKeywords(haystack, ALGORITHM_KEYWORDS),
    ...collectKeywords(haystack, CRITICAL_ALGORITHM_KEYWORDS),
  ]);
  const errorKeywords = collectKeywords(haystack, DEBUG_KEYWORDS);
  const generalWebKeywords = unique([
    ...collectKeywords(haystack, GENERAL_WEB_KEYWORDS),
    ...collectKeywords(haystack, [...CRITICAL_RECENT_TIME_KEYWORDS, ...CRITICAL_RECENT_CONTENT_KEYWORDS]),
  ]);
  const explicitWebSearchRequested = hasKeyword(haystack, EXPLICIT_WEB_SEARCH_KEYWORDS);
  const recentInfoRequested = isRecentInfoRequest(question);
  const topicKeywords = unique([
    ...extractNewsTopicKeywords(question),
    ...collectKeywords(question, CRITICAL_NEWS_TOPIC_KEYWORDS),
  ]).slice(0, 6);
  const newsIntent = isNewsIntentRequest(question, topicKeywords) ||
    (topicKeywords.length > 0 &&
      (hasKeyword(question, CRITICAL_RECENT_TIME_KEYWORDS) || hasKeyword(question, CRITICAL_RECENT_CONTENT_KEYWORDS)));
  const technicalDocsKeywords = collectKeywords(haystack, CRITICAL_TECH_DOC_KEYWORDS);
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
  if (newsIntent) {
    confidence += 0.18;
    reasons.push(`识别到新闻主题：${topicKeywords.slice(0, 3).join(" / ")}`);
  }
  if (technicalDocsKeywords.length > 0) {
    confidence += 0.62;
    reasons.push(`识别到技术文档关键词：${technicalDocsKeywords[0]}`);
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
      rawQuestion: question,
      problemId,
      problemTitle: problemTitle || undefined,
      algorithmKeywords: algorithmKeywords.length > 0 ? algorithmKeywords : undefined,
      errorKeywords: errorKeywords.length > 0 ? errorKeywords : undefined,
      topicKeywords: topicKeywords.length > 0 ? topicKeywords : undefined,
      newsIntent,
      recencyIntent: recentInfoRequested,
      vertical: "oi",
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
      rawQuestion: question,
      algorithmKeywords,
      errorKeywords: errorKeywords.length > 0 ? errorKeywords : undefined,
      topicKeywords: topicKeywords.length > 0 ? topicKeywords : undefined,
      newsIntent,
      recencyIntent: recentInfoRequested,
      vertical: "algorithm",
      queries: shouldSearch ? buildAlgorithmQueries(algorithmKeywords, errorKeywords) : [],
      confidence,
      reason: reasons.join("，") || "用户在查算法外部资料。",
    };
  }

  if (errorKeywords.length > 0 && (solutionKeywords.length > 0 || discussionKeywords.length > 0)) {
    return {
      shouldSearch,
      intent: "debug_issue",
      rawQuestion: question,
      errorKeywords,
      topicKeywords: topicKeywords.length > 0 ? topicKeywords : undefined,
      newsIntent,
      recencyIntent: recentInfoRequested,
      vertical: "algorithm",
      queries: shouldSearch ? [compactQuery(`${question} ${errorKeywords.join(" ")}`)] : [],
      confidence,
      reason: reasons.join("，") || "问题偏向调试排查，联网可能补充经验来源。",
    };
  }

  if (technicalDocsKeywords.length > 0) {
    return {
      shouldSearch,
      intent: "general_web",
      rawQuestion: question,
      topicKeywords: topicKeywords.length > 0 ? topicKeywords : undefined,
      newsIntent,
      recencyIntent: recentInfoRequested,
      vertical: "docs",
      queries: shouldSearch ? [compactQuery(question)] : [],
      confidence,
      reason: reasons.join("；") || "识别到技术文档查询，优先尝试官方文档来源。",
    };
  }

  if (generalWebKeywords.length > 0 || explicitWebSearchRequested || recentInfoRequested) {
    return {
      shouldSearch,
      intent: "general_web",
      rawQuestion: question,
      topicKeywords: topicKeywords.length > 0 ? topicKeywords : undefined,
      newsIntent,
      recencyIntent: recentInfoRequested,
      vertical: newsIntent ? "news" : "general_web",
      queries: shouldSearch ? buildGeneralWebQueries(question, recentInfoRequested || newsIntent, topicKeywords) : [],
      confidence,
      reason: reasons.join("，") || "用户在请求外部网页资料。",
    };
  }

  return {
    shouldSearch: false,
    intent: "no_search",
    rawQuestion: question,
    topicKeywords: topicKeywords.length > 0 ? topicKeywords : undefined,
    newsIntent,
    recencyIntent: recentInfoRequested,
    vertical: "no_search",
    queries: [],
    confidence,
    reason: algorithmKeywords.length > 0 && explanationOnlyRequested
      ? "当前更像算法概念解释，本地回答通常已足够。"
      : "当前问题主要可由笔记上下文和模型自身能力回答，无需联网。",
  };
}
