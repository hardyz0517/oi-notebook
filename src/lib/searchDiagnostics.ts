import type { SearchDecision, WebSource } from "@/lib/aiWebSearch";

export type SearchPreparationDiagnostics = {
  searchPreparationStarted: boolean;
  searchPreparationTimedOut: boolean;
  timedOutStage?: string;
  ruleIntent: string;
  ruleFreshness: string;
  plannerStarted: boolean;
  plannerTimedOut: boolean;
  plannerFailedReason?: string;
  ruleFallbackUsed: boolean;
  directDiscoveryScheduled: boolean;
  directDiscoveryAttempted: boolean;
  providerSearchScheduled: boolean;
  providerSearchAttempted: boolean;
  downgradedToNormalAnswer: boolean;
  downgradeReason?: string;
};

export type DirectDiscoveryDiagnostics = {
  attempted?: string;
  skippedReason?: string;
  intent?: string;
  freshness?: string;
  query?: string;
  topicKeywords?: string;
  sourcesTried?: string;
  candidatesFound?: string;
  candidatesKept?: string;
  durationMs?: string;
  cacheBehavior?: string;
  newsRegistry?: NewsSourceRegistryDiagnostics;
  sourceLines: string[];
};

export type NewsSourceRegistryDiagnostics = {
  enabled?: string;
  sourceRouterTriggered?: string;
  sourceRouterReason?: string;
  selectedSourceCount?: string;
  selectedSources?: string;
  skippedSources?: string;
  fallbackSources?: string;
  topicTags?: string;
  reliabilityMix?: string;
  officialSourceCount?: string;
  aggregatorSourceCount?: string;
  fallbackUsed?: string;
  registryCandidatesFound?: string;
  registryCandidatesKept?: string;
  registryCandidatesRejected?: string;
};

export type ProviderSearchDiagnostics = {
  finalReason: string;
  cacheStatus?: string;
  cacheRemainingSeconds?: string;
  browserHeaders?: string;
  stageLines: string[];
};

export type UrlReaderDiagnostics = {
  readAttempts?: string;
  readSuccesses?: string;
  excerptChars?: string;
};

export type EvidenceDiagnostics = {
  usableEvidenceCount?: string;
  rejectedCount?: string;
};

export type NewsReadBudgetDiagnostics = UrlReaderDiagnostics & EvidenceDiagnostics & {
  queryDiversification?: string;
  eventClusterCount?: string;
};

export type SearchDiagnostics = {
  preparation?: SearchPreparationDiagnostics;
  directDiscovery?: DirectDiscoveryDiagnostics;
  provider?: ProviderSearchDiagnostics;
  urlReader?: UrlReaderDiagnostics;
  evidence?: EvidenceDiagnostics;
  newsReadBudget?: NewsReadBudgetDiagnostics;
};

export const createSearchPreparationDiagnostics = (decision: SearchDecision): SearchPreparationDiagnostics => ({
  searchPreparationStarted: true,
  searchPreparationTimedOut: false,
  ruleIntent: decision.intent,
  ruleFreshness: decision.newsIntent ? "news" : decision.recencyIntent ? "recent" : "none",
  plannerStarted: false,
  plannerTimedOut: false,
  ruleFallbackUsed: false,
  directDiscoveryScheduled: decision.newsIntent === true ||
    decision.recencyIntent === true ||
    decision.vertical === "news" ||
    decision.vertical === "algorithm" ||
    decision.intent === "algorithm_reference" ||
    decision.intent === "oi_discussion" ||
    decision.intent === "general_web",
  directDiscoveryAttempted: false,
  providerSearchScheduled: decision.shouldSearch,
  providerSearchAttempted: false,
  downgradedToNormalAnswer: false,
});

export const encodeDebugValue = (value: string | number | boolean | undefined): string => {
  if (value === undefined) return "";
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[;|]/g, ",")
    .replace(/\s+/g, " ")
    .trim();
};

export const formatSearchPreparationDiagnostics = (diagnostics: SearchPreparationDiagnostics): string => [
  "debug=searchPreparation",
  `searchPreparationStarted=${diagnostics.searchPreparationStarted ? "yes" : "no"}`,
  `searchPreparationTimedOut=${diagnostics.searchPreparationTimedOut ? "yes" : "no"}`,
  diagnostics.timedOutStage ? `timedOutStage=${encodeDebugValue(diagnostics.timedOutStage)}` : undefined,
  `ruleIntent=${encodeDebugValue(diagnostics.ruleIntent)}`,
  `ruleFreshness=${encodeDebugValue(diagnostics.ruleFreshness)}`,
  `plannerStarted=${diagnostics.plannerStarted ? "yes" : "no"}`,
  `plannerTimedOut=${diagnostics.plannerTimedOut ? "yes" : "no"}`,
  diagnostics.plannerFailedReason ? `plannerFailedReason=${encodeDebugValue(diagnostics.plannerFailedReason)}` : undefined,
  `ruleFallbackUsed=${diagnostics.ruleFallbackUsed ? "yes" : "no"}`,
  `directDiscoveryScheduled=${diagnostics.directDiscoveryScheduled ? "yes" : "no"}`,
  `directDiscoveryAttempted=${diagnostics.directDiscoveryAttempted ? "yes" : "no"}`,
  `providerSearchScheduled=${diagnostics.providerSearchScheduled ? "yes" : "no"}`,
  `providerSearchAttempted=${diagnostics.providerSearchAttempted ? "yes" : "no"}`,
  `downgradedToNormalAnswer=${diagnostics.downgradedToNormalAnswer ? "yes" : "no"}`,
  diagnostics.downgradeReason ? `downgradeReason=${encodeDebugValue(diagnostics.downgradeReason)}` : undefined,
].filter((part): part is string => Boolean(part)).join("; ");

export const mergeSearchDebug = (...items: Array<string | undefined>): string | undefined => {
  const parts = items.map((item) => item?.trim()).filter((item): item is string => Boolean(item));
  return parts.length > 0 ? parts.join(" || ") : undefined;
};

export const getDebugReasonLabel = (reason: string | undefined): string => {
  if (!reason) return "";
  const translated = reason
    .replace(/topic_mismatch/g, "主题不匹配")
    .replace(/not_news_like/g, "不像新闻")
    .replace(/docs_or_homepage/g, "文档或首页")
    .replace(/wiki_or_reference/g, "百科/资料页")
    .replace(/rss_xml/g, "RSS/XML")
    .replace(/bing_html/g, "Bing HTML")
    .replace(/captcha_or_block_page/g, "验证或限制页")
    .replace(/rss-returned-html-html/g, "RSS 返回 HTML，已转 HTML 解析")
    .replace(/rss-returned-html->html/g, "RSS 返回 HTML，已转 HTML 解析")
    .replace(/body-quality-gate/g, "返回体质量拦截")
    .replace(/parser-panic-caught/g, "解析异常已拦截")
    .replace(/parser_panic_caught/g, "解析异常已拦截")
    .replace(/compressed_or_binary/g, "压缩或二进制内容")
    .replace(/binary_or_control_chars/g, "二进制或控制字符过多")
    .replace(/compressed_magic/g, "压缩数据头")
    .replace(/corrupt_text/g, "文本解码异常")
    .replace(/too_many_replacement_chars/g, "替换字符过多")
    .replace(/body_decode_failed/g, "返回体解码失败")
    .replace(/rss_no_item_or_entry/g, "RSS 中没有 item/entry")
    .replace(/rss_items_missing_usable_title_or_link/g, "RSS 条目缺少可用标题或链接")
    .replace(/rss_returned_html_no_html_candidates/g, "RSS 返回 HTML，但没有解析到候选")
    .replace(/rss_returned_html_html_no_supported_result_selector_matched/g, "RSS 入口返回了 HTML，已使用 HTML 解析器兜底，但没有命中结果结构")
    .replace(/rss_returned_html_html_selectors_matched_but_no_usable_external_links/g, "RSS 入口返回了 HTML，已使用 HTML 解析器兜底，但没有可用外链")
    .replace(/rss_returned_html/g, "RSS 入口返回 HTML，已转 HTML 解析")
    .replace(/html_no_supported_result_selector_matched/g, "没有命中支持的结果选择器")
    .replace(/html_selectors_matched_but_no_usable_external_links/g, "命中选择器但没有可用外链")
    .replace(/html_empty_body/g, "HTML 返回为空")
    .replace(/html_body_not_html/g, "返回体不是 HTML")
    .replace(/rss-xml/g, "RSS 解析")
    .replace(/news-html/g, "HTML 新闻卡解析")
    .replace(/web-html/g, "HTML 网页解析")
    .replace(/all_anchors_fallback/g, "全页面链接扫描")
    .replace(/all anchors fallback/g, "全页面链接扫描")
    .replace(/all anchors news fallback/g, "新闻链接扫描")
    .replace(/news-card anchors/g, "新闻卡片链接")
    .replace(/missing_href/g, "缺少 href")
    .replace(/url_decode_or_internal/g, "URL 解码失败或内部链接")
    .replace(/empty_title/g, "标题为空")
    .replace(/low_news_score/g, "新闻相关性不足")
    .replace(/raw_url_not_news_like/g, "原文 URL 不像新闻")
    .replace(/result_url_rejected/g, "候选 URL 被过滤")
    .replace(/li\.b_algo h2 a/g, "自然结果标题链接")
    .replace(/h2 a fallback/g, "标题链接兜底")
    .replace(/^html$/g, "HTML")
    .replace(/read_failed/g, "读取失败")
    .replace(/query\/topic mismatch/g, "搜索词或主题不匹配")
    .replace(/fallback/g, "兜底")
    .replace(/enabled/g, "已启用")
    .replace(/cache hit/g, "命中缓存")
    .replace(/cache miss/g, "未命中缓存")
    .replace(/cache stale/g, "缓存过期");
  return translated;
};

export const getSearchStageDebugLabel = (source: Pick<WebSource, "discoveryMethod" | "sourceKind" | "searchStage">): string | null => {
  if (source.discoveryMethod === "direct_rss") return "发现方式：No-Key Direct RSS";
  if (source.discoveryMethod === "direct_site") return "发现方式：No-Key Direct Site";
  if (source.sourceKind !== "search_result" || !source.searchStage) return null;
  const stageLabel = source.searchStage === "news-rss"
    ? "Bing 新闻 RSS"
    : source.searchStage === "news-html"
      ? "Bing 新闻页面"
      : source.searchStage === "news-html-fallback"
        ? "Bing 新闻页面备用解析"
        : source.searchStage === "web-rss" || source.searchStage === "rss"
          ? "Bing 普通网页 RSS"
          : source.searchStage === "web-html" || source.searchStage === "html"
            ? "Bing 普通网页页面"
            : source.searchStage === "web-html-fallback" || source.searchStage === "html-fallback"
              ? "Bing 普通网页备用解析"
              : source.searchStage === "api"
                ? "搜索 API"
                : source.searchStage;
  return `发现方式：${stageLabel}`;
};

const splitDebugFields = (raw: string): string[] =>
  raw
    .split("||")
    .flatMap((chunk) => chunk.replace(/^.*?debug=/, "").split(";"))
    .map((part) => part.trim())
    .filter(Boolean);

const lookupDebugField = (parts: string[], key: string): string | undefined =>
  parts.find((part) => part.startsWith(`${key}=`))?.slice(key.length + 1);

const parseNewsSourceRegistryDiagnosticsFromParts = (parts: string[]): NewsSourceRegistryDiagnostics | undefined => {
  const enabled = lookupDebugField(parts, "newsRegistryEnabled");
  if (!enabled) return undefined;
  return {
    enabled,
    sourceRouterTriggered: lookupDebugField(parts, "sourceRouterTriggered"),
    sourceRouterReason: lookupDebugField(parts, "sourceRouterReason"),
    selectedSourceCount: lookupDebugField(parts, "selectedSourceCount"),
    selectedSources: lookupDebugField(parts, "selectedSources"),
    skippedSources: lookupDebugField(parts, "skippedSources"),
    fallbackSources: lookupDebugField(parts, "fallbackSources"),
    topicTags: lookupDebugField(parts, "topicTags"),
    reliabilityMix: lookupDebugField(parts, "reliabilityMix"),
    officialSourceCount: lookupDebugField(parts, "officialSourceCount"),
    aggregatorSourceCount: lookupDebugField(parts, "aggregatorSourceCount"),
    fallbackUsed: lookupDebugField(parts, "fallbackUsed"),
    registryCandidatesFound: lookupDebugField(parts, "registryCandidatesFound"),
    registryCandidatesKept: lookupDebugField(parts, "registryCandidatesKept"),
    registryCandidatesRejected: lookupDebugField(parts, "registryCandidatesRejected"),
  };
};

export const parseSearchDiagnostics = (raw: string): SearchDiagnostics => {
  const news = parseNewsReadBudgetDiagnostics(raw);
  return {
    preparation: parseSearchPreparationDiagnostics(raw),
    directDiscovery: parseDirectDiscoveryDiagnostics(raw),
    provider: parseProviderSearchDiagnostics(raw),
    urlReader: news ? {
      readAttempts: news.readAttempts,
      readSuccesses: news.readSuccesses,
      excerptChars: news.excerptChars,
    } : undefined,
    evidence: news ? {
      usableEvidenceCount: news.usableEvidenceCount,
      rejectedCount: news.rejectedCount,
    } : undefined,
    newsReadBudget: news,
  };
};

export const parseSearchPreparationDiagnostics = (raw: string): SearchPreparationDiagnostics | undefined => {
  if (!raw.includes("searchPreparationStarted=")) return undefined;
  const parts = splitDebugFields(raw);
  const started = lookupDebugField(parts, "searchPreparationStarted");
  if (!started) return undefined;
  return {
    searchPreparationStarted: started === "yes",
    searchPreparationTimedOut: lookupDebugField(parts, "searchPreparationTimedOut") === "yes",
    timedOutStage: lookupDebugField(parts, "timedOutStage"),
    ruleIntent: lookupDebugField(parts, "ruleIntent") ?? "unknown",
    ruleFreshness: lookupDebugField(parts, "ruleFreshness") ?? "none",
    plannerStarted: lookupDebugField(parts, "plannerStarted") === "yes",
    plannerTimedOut: lookupDebugField(parts, "plannerTimedOut") === "yes",
    plannerFailedReason: lookupDebugField(parts, "plannerFailedReason"),
    ruleFallbackUsed: lookupDebugField(parts, "ruleFallbackUsed") === "yes",
    directDiscoveryScheduled: lookupDebugField(parts, "directDiscoveryScheduled") === "yes",
    directDiscoveryAttempted: lookupDebugField(parts, "directDiscoveryAttempted") === "yes",
    providerSearchScheduled: lookupDebugField(parts, "providerSearchScheduled") === "yes",
    providerSearchAttempted: lookupDebugField(parts, "providerSearchAttempted") === "yes",
    downgradedToNormalAnswer: lookupDebugField(parts, "downgradedToNormalAnswer") === "yes",
    downgradeReason: lookupDebugField(parts, "downgradeReason"),
  };
};

export const parseDirectDiscoveryDiagnostics = (raw: string): DirectDiscoveryDiagnostics | undefined => {
  const directChunk = raw
    .split("||")
    .map((chunk) => chunk.replace(/^.*?debug=/, "").trim())
    .find((chunk) => chunk.includes("directDiscoveryIntent=") || chunk.includes("directDiscoverySourcesTried=") || chunk.includes("directSource1="));
  if (!directChunk) return undefined;
  const parts = directChunk.split(";").map((part) => part.trim()).filter(Boolean);
  const attempted = lookupDebugField(parts, "directDiscoveryAttempted");
  if (!attempted) return undefined;
  const sourceLines = parts
    .filter((part) => /^directSource\d+=/.test(part))
    .map((part) => {
      const separatorIndex = part.indexOf("=");
      const key = separatorIndex >= 0 ? part.slice(0, separatorIndex) : part;
      const rawValue = separatorIndex >= 0 ? part.slice(separatorIndex + 1) : "";
      const fields = Object.fromEntries(rawValue.split(",").map((field) => {
        const [fieldKey, ...fieldValue] = field.split("=");
        return [fieldKey, fieldValue.join("=")];
      }));
      return [
        `${key}：${fields.sourceName ?? "unknown"}`,
        fields.sourceType ? `type=${fields.sourceType}` : undefined,
        fields.status ? `status=${fields.status}` : undefined,
        fields.httpStatus ? `http=${fields.httpStatus}` : undefined,
        fields.contentType ? `contentType=${fields.contentType}` : undefined,
        fields.itemsParsed ? `itemsParsed=${fields.itemsParsed}` : undefined,
        fields.itemsMatched ? `itemsMatched=${fields.itemsMatched}` : undefined,
        fields.candidatesEmitted ? `candidatesEmitted=${fields.candidatesEmitted}` : undefined,
        fields.reason ? `reason=${fields.reason}` : undefined,
        fields.url ? `url=${fields.url}` : undefined,
      ].filter(Boolean).join("，");
    });
  return {
    attempted,
    skippedReason: lookupDebugField(parts, "directDiscoverySkippedReason"),
    intent: lookupDebugField(parts, "directDiscoveryIntent"),
    freshness: lookupDebugField(parts, "directDiscoveryFreshness"),
    query: lookupDebugField(parts, "directDiscoveryQuery"),
    topicKeywords: lookupDebugField(parts, "directDiscoveryTopicKeywords"),
    sourcesTried: lookupDebugField(parts, "directDiscoverySourcesTried"),
    candidatesFound: lookupDebugField(parts, "directDiscoveryCandidatesFound"),
    candidatesKept: lookupDebugField(parts, "directDiscoveryCandidatesKept"),
    durationMs: lookupDebugField(parts, "directDiscoveryDurationMs"),
    cacheBehavior: lookupDebugField(parts, "directDiscoveryCacheBehavior"),
    newsRegistry: parseNewsSourceRegistryDiagnosticsFromParts(parts),
    sourceLines,
  };
};

export const parseProviderSearchDiagnostics = (raw: string): ProviderSearchDiagnostics | undefined => {
  if (!raw.includes("provider=bing") && !raw.includes("attemptedStages=")) return undefined;
  const normalized = raw.replace(/^.*?debug=/, "");
  const parts = normalized.split(";").map((part) => part.trim()).filter(Boolean);
  const attempted = lookupDebugField(parts, "attemptedStages") ?? raw.split("attemptedStages=")[1];
  const stageLines = attempted
    ? attempted.split("|").map((stage) => stage.trim()).filter(Boolean).map((stage) => {
      const [name, status, ...fields] = stage.split(":");
      const fieldText = fields
        .map((field) => {
          const [key, value] = field.split("=");
          const label = key === "http" ? "HTTP"
            : key === "error" ? "错误"
            : key === "parsed" ? "解析"
            : key === "filtered" ? "过滤"
            : key === "final" ? "保留"
            : key === "cache" ? "缓存"
            : key === "ms" ? "耗时"
            : key === "host" ? "最终域名"
            : key === "ct" ? "Content-Type"
            : key === "enc" ? "Content-Encoding"
            : key === "bytes" ? "响应大小"
            : key === "quality" ? "bodyQuality"
            : key === "binary" ? "bodyLooksBinary"
            : key === "replacement" ? "replacementCharCount"
            : key === "controls" ? "controlCharCount"
            : key === "kind" ? "返回体类型"
            : key === "title" ? "页面标题"
            : key === "parser" ? "使用解析器"
            : key === "panic" ? "parserPanicCaught"
            : key === "selectors" ? "命中选择器"
            : key === "rawAnchors" ? "rawAnchorCount"
            : key === "rawHrefs" ? "rawHrefCount"
            : key === "decodedUrls" ? "decodedUrlCandidateCount"
            : key === "anchors" ? "扫描链接"
            : key === "external" ? "外部链接"
            : key === "kept" ? "keptCandidateCount"
            : key === "rejected" ? "拒绝候选"
            : key === "filterReasons" ? "过滤原因统计"
            : key === "hint" ? "解析提示"
            : key === "text" ? "可见文本预览"
            : key === "links" ? "外链预览"
            : key;
          return `${label}=${getDebugReasonLabel(value ?? "")}`;
        })
        .join("，");
      return `${getSearchStageDebugLabel({ sourceKind: "search_result", searchStage: name } as WebSource)?.replace("发现方式：", "") ?? name}：${status === "success" ? "成功" : "失败"}${fieldText ? `（${fieldText}）` : ""}`;
    })
    : [];
  return {
    finalReason: lookupDebugField(parts, "finalFailureReason") ?? lookupDebugField(parts, "errorKind") ?? "unknown",
    cacheStatus: lookupDebugField(parts, "cacheStatus"),
    cacheRemainingSeconds: lookupDebugField(parts, "cacheRemainingSeconds"),
    browserHeaders: lookupDebugField(parts, "browserHeaders"),
    stageLines,
  };
};

export const parseNewsReadBudgetDiagnostics = (raw: string): NewsReadBudgetDiagnostics | undefined => {
  const chunk = raw
    .split("||")
    .map((item) => item.replace(/^.*?debug=/, "").trim())
    .find((item) => item.includes("newsReadAttempts="));
  if (!chunk) return undefined;
  const parts = chunk.split(";").map((part) => part.trim()).filter(Boolean);
  return {
    readAttempts: lookupDebugField(parts, "newsReadAttempts"),
    readSuccesses: lookupDebugField(parts, "newsReadSuccesses"),
    usableEvidenceCount: lookupDebugField(parts, "usableEvidenceCount"),
    rejectedCount: lookupDebugField(parts, "rejectedCount"),
    excerptChars: lookupDebugField(parts, "excerptChars"),
    queryDiversification: lookupDebugField(parts, "queryDiversification"),
    eventClusterCount: lookupDebugField(parts, "eventClusterCount"),
  };
};

export const formatBingDiagnostics = (raw: string): string[] => {
  const diagnostics = parseProviderSearchDiagnostics(raw);
  if (!diagnostics) return [];
  const lines = [
    `最终原因：${getDebugReasonLabel(diagnostics.finalReason)}`,
    diagnostics.browserHeaders ? `使用浏览器兼容请求头：${diagnostics.browserHeaders === "enabled" ? "是" : getDebugReasonLabel(diagnostics.browserHeaders)}` : undefined,
    diagnostics.cacheStatus ? `缓存状态：${getDebugReasonLabel(diagnostics.cacheStatus)}${diagnostics.cacheRemainingSeconds ? `，剩余约 ${diagnostics.cacheRemainingSeconds} 秒` : ""}` : undefined,
    ...diagnostics.stageLines,
  ].filter((line): line is string => Boolean(line));
  return lines.length > 0 ? lines : [raw];
};

export const formatDirectDiscoveryDiagnostics = (raw: string): string[] => {
  const diagnostics = parseDirectDiscoveryDiagnostics(raw);
  if (!diagnostics?.attempted) return [];
  const registryLines = diagnostics.newsRegistry ? [
    diagnostics.newsRegistry.enabled ? `newsRegistryEnabled=${diagnostics.newsRegistry.enabled}` : undefined,
    diagnostics.newsRegistry.sourceRouterTriggered ? `sourceRouterTriggered=${diagnostics.newsRegistry.sourceRouterTriggered}` : undefined,
    diagnostics.newsRegistry.sourceRouterReason ? `sourceRouterReason=${diagnostics.newsRegistry.sourceRouterReason}` : undefined,
    diagnostics.newsRegistry.topicTags ? `topicTags=${diagnostics.newsRegistry.topicTags}` : undefined,
    diagnostics.newsRegistry.selectedSourceCount ? `selectedSourceCount=${diagnostics.newsRegistry.selectedSourceCount}` : undefined,
    diagnostics.newsRegistry.selectedSources ? `selectedSources=${diagnostics.newsRegistry.selectedSources}` : undefined,
    diagnostics.newsRegistry.skippedSources ? `skippedSources=${diagnostics.newsRegistry.skippedSources}` : undefined,
    diagnostics.newsRegistry.fallbackSources ? `fallbackSources=${diagnostics.newsRegistry.fallbackSources}` : undefined,
    diagnostics.newsRegistry.reliabilityMix ? `reliabilityMix=${diagnostics.newsRegistry.reliabilityMix}` : undefined,
    diagnostics.newsRegistry.officialSourceCount ? `officialSourceCount=${diagnostics.newsRegistry.officialSourceCount}` : undefined,
    diagnostics.newsRegistry.aggregatorSourceCount ? `aggregatorSourceCount=${diagnostics.newsRegistry.aggregatorSourceCount}` : undefined,
    diagnostics.newsRegistry.fallbackUsed ? `fallbackUsed=${diagnostics.newsRegistry.fallbackUsed}` : undefined,
    diagnostics.newsRegistry.registryCandidatesFound ? `registryCandidatesFound=${diagnostics.newsRegistry.registryCandidatesFound}` : undefined,
    diagnostics.newsRegistry.registryCandidatesKept ? `registryCandidatesKept=${diagnostics.newsRegistry.registryCandidatesKept}` : undefined,
    diagnostics.newsRegistry.registryCandidatesRejected ? `registryCandidatesRejected=${diagnostics.newsRegistry.registryCandidatesRejected}` : undefined,
  ].filter((line): line is string => Boolean(line)) : [];
  return [
    `directDiscoveryAttempted：${diagnostics.attempted === "yes" ? "yes" : "no"}`,
    diagnostics.skippedReason ? `directDiscoverySkippedReason：${diagnostics.skippedReason}` : undefined,
    `directDiscoveryIntent：${diagnostics.intent ?? "unknown"}`,
    `directDiscoveryFreshness：${diagnostics.freshness || "none"}`,
    `directDiscoveryQuery：${diagnostics.query || "none"}`,
    `directDiscoveryTopicKeywords：${diagnostics.topicKeywords || "none"}`,
    `directDiscoverySourcesTried：${diagnostics.sourcesTried ?? "0"}`,
    `directDiscoveryCandidatesFound：${diagnostics.candidatesFound ?? "0"}`,
    `directDiscoveryCandidatesKept：${diagnostics.candidatesKept ?? "0"}`,
    `directDiscoveryDurationMs：${diagnostics.durationMs ?? "0"}`,
    `directDiscoveryCacheBehavior：${diagnostics.cacheBehavior || "unknown"}`,
    ...registryLines,
    ...diagnostics.sourceLines,
  ].filter((line): line is string => Boolean(line));
};

export const formatNewsReadDiagnostics = (raw: string): string[] => {
  const diagnostics = parseNewsReadBudgetDiagnostics(raw);
  if (!diagnostics) return [];
  return [
    `newsReadAttempts：${diagnostics.readAttempts ?? "0"}`,
    `newsReadSuccesses：${diagnostics.readSuccesses ?? "0"}`,
    `usableEvidenceCount：${diagnostics.usableEvidenceCount ?? "0"}`,
    `rejectedCount：${diagnostics.rejectedCount ?? "0"}`,
    `excerptChars：${diagnostics.excerptChars ?? "0"}`,
    `queryDiversification：${diagnostics.queryDiversification || "single"}`,
    `eventClusterCount：${diagnostics.eventClusterCount ?? "0"}`,
  ];
};

export const formatSearchPreparationDiagnosticsForDisplay = (raw: string): string[] => {
  const diagnostics = parseSearchPreparationDiagnostics(raw);
  if (!diagnostics) return [];
  return [
    `searchPreparationStarted：${diagnostics.searchPreparationStarted ? "yes" : "no"}`,
    `searchPreparationTimedOut：${diagnostics.searchPreparationTimedOut ? "yes" : "no"}`,
    diagnostics.timedOutStage ? `timedOutStage：${diagnostics.timedOutStage}` : undefined,
    `ruleIntent：${diagnostics.ruleIntent}`,
    `ruleFreshness：${diagnostics.ruleFreshness}`,
    `plannerStarted：${diagnostics.plannerStarted ? "yes" : "no"}`,
    `plannerTimedOut：${diagnostics.plannerTimedOut ? "yes" : "no"}`,
    diagnostics.plannerFailedReason ? `plannerFailedReason：${diagnostics.plannerFailedReason}` : undefined,
    `ruleFallbackUsed：${diagnostics.ruleFallbackUsed ? "yes" : "no"}`,
    `directDiscoveryScheduled：${diagnostics.directDiscoveryScheduled ? "yes" : "no"}`,
    `directDiscoveryAttempted：${diagnostics.directDiscoveryAttempted ? "yes" : "no"}`,
    `providerSearchScheduled：${diagnostics.providerSearchScheduled ? "yes" : "no"}`,
    `providerSearchAttempted：${diagnostics.providerSearchAttempted ? "yes" : "no"}`,
    `downgradedToNormalAnswer：${diagnostics.downgradedToNormalAnswer ? "yes" : "no"}`,
    diagnostics.downgradeReason ? `downgradeReason：${diagnostics.downgradeReason}` : undefined,
  ].filter((line): line is string => Boolean(line));
};
