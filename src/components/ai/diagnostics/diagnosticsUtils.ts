import type { SearchDecision, WebSearchProvider, WebSource } from "@/lib/aiWebSearch";

export const SEARCH_PLAN_QUERY_LIMIT = 6;
export const SEARCH_SOURCE_PREVIEW_LIMIT = 8;

export const getSearchConfidenceLabel = (confidence: number | undefined): string => {
  if (typeof confidence !== "number") return "按需判断";
  if (confidence >= 0.85) return "高";
  if (confidence >= 0.65) return "较高";
  if (confidence >= 0.45) return "一般";
  return "较低";
};

export const getSearchIntentLabel = (intent: SearchDecision["intent"]): string => {
  switch (intent) {
    case "oi_problem":
      return "题目 / 题解相关";
    case "oi_discussion":
      return "讨论 / 常见坑";
    case "algorithm_reference":
      return "算法资料";
    case "debug_issue":
      return "调试 / 错误排查";
    case "general_web":
      return "普通联网搜索";
    case "no_search":
    default:
      return "无需联网";
  }
};

export const getSearchPlanChips = (decision: SearchDecision): string[] => [
  decision.problemId ? `题号：${decision.problemId}` : "",
  ...(decision.algorithmKeywords ?? []).map((keyword) => `算法：${keyword}`),
  ...(decision.errorKeywords ?? []).map((keyword) => `错误：${keyword}`),
].filter(Boolean);

export const getWebSearchProviderLabel = (provider: WebSearchProvider): string => {
  switch (provider) {
    case "bing":
      return "Bing 公开搜索";
    case "bocha":
      return "博查 Bocha";
    case "brave":
      return "Brave Search";
    default:
      return provider;
  }
};

export const getSearchVerticalLabel = (vertical?: string): string => {
  switch (vertical) {
    case "news":
      return "新闻";
    case "oi":
      return "OI";
    case "algorithm":
      return "算法";
    case "general_web":
      return "普通网页";
    case "product":
      return "产品 / 服务";
    case "docs":
      return "技术文档";
    case "explicit_url":
      return "用户链接";
    case "no_search":
      return "不搜索";
    default:
      return "未识别";
  }
};

export const getSearchDepthLabel = (depth?: string): string => {
  switch (depth) {
    case "quick":
      return "快速";
    case "normal":
      return "常规";
    case "deep":
      return "深入";
    case "news":
      return "新闻";
    case "oi_research":
      return "OI 调研";
    default:
      return "未指定";
  }
};

export const getFreshnessLabel = (freshness?: string): string => {
  switch (freshness) {
    case "news":
      return "新闻";
    case "latest":
      return "最新";
    case "recent":
      return "近期";
    case "none":
      return "不限时效";
    default:
      return "未指定";
  }
};

export const getPlannerTriggerLabel = (trigger?: string): string => {
  switch (trigger) {
    case "initial":
      return "首次规划";
    case "off_topic_retry":
      return "跑偏后重搜";
    case "fallback":
      return "规则兜底";
    case "disabled":
      return "未启用";
    default:
      return trigger ?? "未知";
  }
};

export const getBooleanLabel = (value: boolean | undefined): string =>
  value === true ? "是" : value === false ? "否" : "未记录";

export const splitDebugItem = (item: string): { key: string; value: string } => {
  const separatorIndex = item.search(/[:：]/);
  if (separatorIndex <= 0 || separatorIndex >= item.length - 1) {
    return { key: "", value: item };
  }
  return {
    key: item.slice(0, separatorIndex + 1),
    value: item.slice(separatorIndex + 1).trim(),
  };
};

export const getSourceTypeLabel = (sourceType: WebSource["sourceType"]): string => {
  switch (sourceType) {
    case "problem":
      return "题面";
    case "solution":
      return "题解";
    case "discussion":
      return "讨论";
    case "wiki":
      return "Wiki";
    case "blog":
      return "博客";
    case "official":
      return "官方";
    case "unknown":
    default:
      return "来源";
  }
};

export const getReliabilityLabel = (source: WebSource): string => source.reliabilityLabel || (
  source.reliability === "official" ? "官方" :
  source.reliability === "wiki" ? "知识库" :
  source.reliability === "community_solution" ? "社区题解" :
  source.reliability === "discussion" ? "讨论" :
  source.reliability === "blog" ? "博客" :
  "未知"
);

export const getSourceRelevanceLabel = (source: WebSource): string =>
  source.relevanceLabel || (source.relevance === "candidate" ? "相关资料" : "强相关");

export const getSourceExcerptStatusLabel = (source: WebSource): string => {
  const rawExcerptStatus = source.excerptStatus as string | undefined;
  if (source.excerptStatus === "fetched" && (source.excerptQuality === "partial" || source.excerptQuality === "medium")) return "部分摘要";
  if (source.excerptStatus === "fetched" && source.cacheStatus === "hit") return "已读取缓存摘要";
  if (source.excerptStatus === "fetched" && source.cacheStatus === "stale") return "已读取过期摘要";
  if (source.excerptStatus === "fetched") return "已读取摘要";
  if (rawExcerptStatus === "blocked" || source.excerptQuality === "blocked") return "需要页面渲染";
  if (source.excerptQuality === "snippet_only" || source.excerptQuality === "title_only" || source.excerptQuality === "too_short") return "正文过短";
  if (source.excerptStatus === "unavailable") return "正文不可用";
  if (source.excerptStatus === "failed") return "读取失败";
  if (source.isConstructed) return "未读取正文";
  return "仅搜索摘要";
};

export const getSourceOriginLabel = (source: WebSource): string =>
  source.discoveryMethod === "direct_rss" ? "Direct RSS" :
    source.discoveryMethod === "direct_site" ? "Direct Site" :
      source.discoveryMethod === "constructed_source" || source.isConstructed ? "公开资料入口" :
        source.sourceKind === "explicit_url" ? "用户链接" : "搜索结果";

export const getSourceDebugKindLabel = (source: WebSource): string => {
  if (source.sourceKind === "explicit_url") return "用户提供 URL";
  if (source.sourceKind === "rss_item") return "RSS/Atom 条目";
  if (source.sourceKind === "official_news") return "官方新闻候选";
  if (source.sourceKind === "official_blog") return "官方博客候选";
  if (source.sourceKind === "docs_page") return "技术文档候选";
  if (source.sourceKind === "oi_reference") return "OI 资料候选";
  if (source.sourceKind === "constructed_source" || source.isConstructed) return "公开资料入口";
  return "搜索结果";
};

export const getSourceDebugReadMethodLabel = (source: WebSource): string => {
  if (source.sourceKind === "explicit_url") return "本地公开网页读取";
  if (source.discoveryMethod === "direct_rss") return "Direct RSS 候选 + 本地公开网页读取";
  if (source.discoveryMethod === "direct_site") return "Direct Site 候选 + 本地公开网页读取";
  if (source.sourceKind === "constructed_source" || source.isConstructed) {
    return source.excerptStatus === "fetched" ? "构造入口 + 本地公开网页读取" : "构造入口；尚未读取正文";
  }
  return "搜索结果 + 本地公开网页摘录";
};

export const getSourceDebugCacheLabel = (source: WebSource): string => {
  if (source.excerptStatus === "failed" || source.excerptQuality === "failed") return "读取失败";
  if (source.excerptStatus === "unavailable" || source.excerptQuality === "blocked" || source.excerptQuality === "unavailable" || source.excerptQuality === "snippet_only" || source.excerptQuality === "title_only" || source.excerptQuality === "too_short" || (source.excerptStatus as string | undefined) === "blocked") return "读取失败";
  if (!source.excerptStatus || source.excerptStatus === "not_requested") return "未读取正文";
  if (source.cacheStatus === "hit") return "缓存命中";
  if (source.cacheStatus === "stale") return "缓存过期";
  if (source.cacheStatus === "miss") return "缓存未命中";
  if (source.cacheStatus === "disabled") return "缓存未使用";
  return source.excerptStatus === "fetched" ? "缓存未命中" : "未读取正文";
};

export const getProviderDebugLabel = (source: WebSource, provider: WebSearchProvider): string => {
  if (source.discoveryMethod === "direct_rss" || source.discoveryMethod === "direct_site") {
    return "Provider 未使用：No-Key Direct Discovery";
  }
  if (source.sourceKind === "explicit_url" || source.sourceKind === "constructed_source" || source.isConstructed) {
    return "Provider 未使用";
  }
  const sourceProvider = source.searchProvider ?? provider;
  return `当前搜索源：${getWebSearchProviderLabel(sourceProvider)}`;
};

export const getSourceCardDescription = (source: WebSource): string | undefined => {
  const rawExcerptStatus = source.excerptStatus as string | undefined;
  if (source.excerptStatus === "fetched") {
    const excerptPreview = source.excerpt?.replace(/\s+/g, " ").trim();
    if (excerptPreview) {
      const preview = excerptPreview.length > 120 ? `${excerptPreview.slice(0, 120)}...` : excerptPreview;
      return `${source.excerptQuality === "partial" || source.excerptQuality === "medium" ? "已提取部分相关片段" : "已提取相关片段"}：${preview}`;
    }
    return source.excerptQuality === "partial" || source.excerptQuality === "medium" ? "已从公开页面提取部分网页摘录。" : "已从公开页面提取网页摘录。";
  }
  if (rawExcerptStatus === "blocked" || source.excerptQuality === "blocked" || source.excerptStatus === "unavailable") {
    return "正文不可用或需要页面渲染。";
  }
  if (source.excerptStatus === "failed") {
    return "读取失败。";
  }
  if (source.isConstructed) {
    return "公开资料入口，尚未读取网页正文。";
  }
  return source.snippet;
};

export const isDirectDiscoverySource = (source: WebSource): boolean =>
  source.discoveryMethod === "direct_rss" ||
  source.discoveryMethod === "direct_site" ||
  source.discoveryMethod === "constructed_source";
