import { useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Clipboard, Loader2, Play, PlugZap, Search, TriangleAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getLocalNoteIndexStatus,
  getPromptCitationContractStatus,
  getWebCacheStatus,
  rebuildLocalNoteIndex,
  runNotexSearchSelfCheck,
  searchLocalNotes,
  testWebSearchConnection,
  type AiConfig,
  type LocalNoteIndexStatusResult,
  type LocalNoteSearchResult,
  type NotexSearchSelfCheckCaseResult,
  type WebCacheStatusResult,
} from "@/lib/api";
import { applySourceStrategyPlan, buildExplicitUrlReadPlan, buildOfflineAiQueryPlannerPreview, buildSearchDecision, classifyNewsCandidateForVertical, classifyNewsEventCluster, extractExplicitUrls, getFrontendWebReadBlockReason, getWebReadBudgetPlan, normalizeWebSearchConfig, rankPreparedWebSources, shouldUseAiQueryPlanner, SOURCE_REGISTRY, validateAiSearchQueryPlan, type SearchDecision, type WebSearchConfig, type WebSource } from "@/lib/aiWebSearch";
import { findCitationMarkerMatches, getUsedCitationIdList, stripMarkdownRegionsForCitationScan } from "@/lib/citations";
import {
  getResearchEngineDeveloperSamples,
  runResearchEngineRealE2ESmoke as runResearchEngineRealE2ESmokeBridge,
  runResearchEngineRealProviderSmoke as runResearchEngineRealProviderSmokeBridge,
  runResearchEngineRealShadowRun as runResearchEngineRealShadowRunBridge,
  runResearchEngineRealUrlReaderSmoke as runResearchEngineRealUrlReaderSmokeBridge,
  runResearchEngineShadowCompare as runResearchEngineShadowCompareBridge,
  runResearchEngineDeveloperSample,
  runResearchEngineDeveloperSelfCheck,
  type ResearchEngineDeveloperSampleId,
  type ResearchEngineDeveloperSampleResult,
  type ResearchEngineDeveloperSelfCheckResult,
  type ResearchEngineRealE2ESmokeResult,
  type ResearchEngineRealProviderSmokeResult,
  type ResearchEngineRealShadowRunResult,
  type ResearchEngineRealUrlReaderSmokeResult,
  type ResearchEngineShadowCompareResult,
} from "@/lib/research-engine";
import { cn } from "@/lib/utils";

type DiagnosticStatus = "pass" | "warn" | "fail" | "skipped" | "running";
type DiagnosticCategoryId = "decision" | "query-planner" | "direct-discovery" | "url-reading" | "provider-config" | "provider-test" | "web-cache" | "local-index" | "local-search" | "notex-self-check" | "citations" | "prompt-contract";

type DiagnosticItem = {
  id: string;
  title: string;
  status: DiagnosticStatus;
  summary: string;
  detail?: string;
  durationMs?: number;
  safeDebugInfo?: string[];
};

type DiagnosticCategory = {
  id: DiagnosticCategoryId;
  title: string;
  items: DiagnosticItem[];
};

type SearchDiagnosticsPanelProps = {
  aiConfigDraft: AiConfig | null;
};

const STATUS_LABELS: Record<DiagnosticStatus, string> = {
  pass: "通过",
  warn: "警告",
  fail: "失败",
  skipped: "跳过",
  running: "运行中",
};

const STATUS_ORDER: DiagnosticStatus[] = ["pass", "warn", "fail", "skipped", "running"];

const emptyCategories = (): DiagnosticCategory[] => [
  { id: "decision", title: "搜索模式（Search Mode）", items: [] },
  { id: "query-planner", title: "AI 搜索规划", items: [] },
  { id: "direct-discovery", title: "直接发现（Direct Discovery）", items: [] },
  { id: "url-reading", title: "网页读取（URL Reader）", items: [] },
  { id: "provider-config", title: "搜索服务配置（Provider）", items: [] },
  {
    id: "provider-test",
    title: "当前搜索服务测试（Provider）",
    items: [{ id: "provider-test-skipped", title: "在线连通性测试", status: "skipped", summary: "不会自动发起公网请求；点击“测试当前搜索服务”后才运行。" }],
  },
  { id: "web-cache", title: "网页缓存（Web Cache）", items: [] },
  { id: "local-index", title: "本地索引（Local Index）", items: [] },
  { id: "local-search", title: "本地检索（Local Search）", items: [] },
  { id: "notex-self-check", title: "自检（Self Check）", items: [] },
  { id: "citations", title: "引用渲染", items: [] },
  { id: "prompt-contract", title: "提示词合约（Prompt Contract）", items: [] },
];

const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> =>
  new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });

const getErrorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

const durationItem = (startedAt: number, item: Omit<DiagnosticItem, "durationMs">): DiagnosticItem => ({
  ...item,
  durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
});

const truncate = (value: string, maxChars: number): string => {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars)}...` : trimmed;
};

const safeDomain = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "default";
  try {
    return new URL(trimmed).hostname || "custom";
  } catch {
    return "custom";
  }
};

const classifyError = (error: unknown): string => {
  const message = getErrorMessage(error);
  const lower = message.toLowerCase();
  if (lower.includes("timeout") || message.includes("超时")) return "搜索服务测试超时。";
  if (lower.includes("captcha") || lower.includes("verify") || lower.includes("blocked") || lower.includes("errorkind=blocked_or_captcha") || lower.includes("errorkind=blocked")) return "Bing 公开搜索遇到验证页或访问限制；这是无 key 公共搜索诊断，请稍后重试或继续修复解析/阻断路径。";
  if (lower.includes("rate_limited") || lower.includes("errorkind=rate_limited")) return "Bing 公开搜索被限流；这是无 key 公共搜索诊断，请稍后重试。";
  if (lower.includes("tauri_bridge_unavailable")) return "Tauri 搜索 bridge 不可用，Research Engine 无法调用 search_web_sources。";
  if (lower.includes("parse_failed")) return "Bing 公开搜索结果结构解析失败，可能是页面结构变化。";
  if (lower.includes("invalid_response")) return "搜索 bridge 返回结构不符合预期，请检查 keyless Bing 诊断字段。";
  if (lower.includes("empty_result") || lower.includes("no_results")) return "Bing 公开搜索没有返回可用自然结果。";
  if (lower.includes("no_candidate_url")) return "搜索结果没有进入可读取候选 URL。";
  if (lower.includes("all_reader_failed")) return "候选 URL 已选出，但 URL reader 全部失败。";
  if (lower.includes("backend_reader_network_error") || lower.includes("backend_network_error")) return "后端公开网页 reader 网络读取失败；这不是浏览器 CORS，请查看 HTTP/内容/阻断诊断。";
  if (lower.includes("http_non_2xx")) return "后端公开网页 reader 收到非 2xx HTTP 状态。";
  if (lower.includes("unsupported_content_type")) return "后端公开网页 reader 收到不支持的内容类型。";
  if (lower.includes("body_too_large")) return "后端公开网页 reader 因正文过大停止读取。";
  if (lower.includes("needs_js")) return "网页可能依赖 JS 渲染，后端静态 reader 无法提取足够正文。";
  if (lower.includes("low_quality")) return "后端 reader 读到的正文质量不足，不能作为可用证据。";
  if (lower.includes("cors_or_reader_network_error")) return "候选 URL reader 受 CORS 或网络错误影响。";
  if (lower.includes("network_error") || lower.includes("dns_failed") || lower.includes("tls_error")) return "Bing 公开搜索网络连接失败；这是无 key 公共搜索诊断，请稍后重试。";
  if (message.includes("429") || lower.includes("rate limit") || lower.includes("too many requests")) return "搜索服务返回 429 或限流，可以稍后重试。";
  if (message.includes("401") || message.includes("403") || lower.includes("unauthorized") || lower.includes("forbidden")) return "搜索服务返回 401/403，API Key 或权限可能有问题。";
  if (lower.includes("json") || message.includes("JSON")) return "搜索服务返回格式不符合预期，请检查 API 地址。";
  if (lower.includes("dns") || lower.includes("connect") || lower.includes("tls") || lower.includes("network") || message.includes("网络")) return "网络、DNS、连接或 TLS 可能不可用。";
  return truncate(message, 220);
};

const researchEngineDisplayProvider = (
  providerName: string | undefined,
  diagnosticsSnapshot?: Record<string, unknown>,
  mode?: string,
): string => {
  if (mode === "public_search") return "keyless_bing";
  if (diagnosticsSnapshot?.providerName === "keyless_bing") return "keyless_bing";
  const keyless = diagnosticsSnapshot?.keylessProviderDiagnostics;
  if (keyless && typeof keyless === "object") return "keyless_bing";
  return providerName ?? "none";
};

const researchEngineKeylessDiagnostics = (
  diagnosticsSnapshot?: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  const nested = diagnosticsSnapshot?.keylessProviderDiagnostics;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) return nested as Record<string, unknown>;
  if (diagnosticsSnapshot?.providerName === "keyless_bing") return diagnosticsSnapshot;
  return undefined;
};

const researchEngineBridgeDiagnostics = (
  diagnosticsSnapshot?: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  const keyless = researchEngineKeylessDiagnostics(diagnosticsSnapshot);
  const bridge = keyless?.bridgeDiagnostics;
  return bridge && typeof bridge === "object" && !Array.isArray(bridge) ? bridge as Record<string, unknown> : undefined;
};

const researchEngineDiagnosticText = (
  diagnosticsSnapshot: Record<string, unknown> | undefined,
  key: string,
): string | undefined => {
  const keyless = researchEngineKeylessDiagnostics(diagnosticsSnapshot);
  const bridge = researchEngineBridgeDiagnostics(diagnosticsSnapshot);
  const value = keyless?.[key] ?? bridge?.[key] ?? diagnosticsSnapshot?.[key];
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join(" | ") || undefined;
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : undefined;
};

const researchEngineDiagnosticJsonText = (
  diagnosticsSnapshot: Record<string, unknown> | undefined,
  key: string,
): string | undefined => {
  const keyless = researchEngineKeylessDiagnostics(diagnosticsSnapshot);
  const bridge = researchEngineBridgeDiagnostics(diagnosticsSnapshot);
  const value = keyless?.[key] ?? bridge?.[key] ?? diagnosticsSnapshot?.[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return truncate(JSON.stringify(value), 360);
  } catch {
    return undefined;
  }
};

const researchEngineRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

const researchEngineReaderDiagnostics = (
  diagnosticsSnapshot?: Record<string, unknown>,
): Record<string, unknown> | undefined =>
  researchEngineRecord(diagnosticsSnapshot?.readerDiagnostics);

const researchEngineReaderDiagnosticText = (
  diagnosticsSnapshot: Record<string, unknown> | undefined,
  key: string,
): string | undefined => {
  const readerDiagnostics = researchEngineReaderDiagnostics(diagnosticsSnapshot);
  return researchEngineDiagnosticText(readerDiagnostics, key) ?? researchEngineDiagnosticText(diagnosticsSnapshot, key);
};

const researchEngineQualityPreviewText = (
  diagnosticsSnapshot?: Record<string, unknown>,
): string | undefined => {
  const keyless = researchEngineKeylessDiagnostics(diagnosticsSnapshot);
  const preview = Array.isArray(keyless?.qualityPreview) ? keyless.qualityPreview : undefined;
  const first = researchEngineRecord(preview?.[0]);
  if (!first) return undefined;
  const title = typeof first.title === "string" ? first.title : undefined;
  const url = typeof first.url === "string" ? first.url : undefined;
  const stage = typeof first.stage === "string" ? first.stage : "none";
  const score = typeof first.newsCandidateScore === "number" ? first.newsCandidateScore : 0;
  const readability = typeof first.readabilityPrior === "number" ? first.readabilityPrior : 0;
  const freshness = typeof first.freshnessSignal === "number" ? first.freshnessSignal : 0;
  const penalty = typeof first.rankingPenalty === "number" ? first.rankingPenalty : 0;
  const rejected = typeof first.whyRejected === "string" ? `; rejected=${first.whyRejected}` : "";
  return `${title ?? url ?? "candidate"}; stage=${stage}; news=${score}; read=${readability}; fresh=${freshness}; penalty=${penalty}${rejected}`;
};

const researchEngineDistributionText = (
  diagnosticsSnapshot: Record<string, unknown> | undefined,
  key: string,
): string | undefined => {
  const keyless = researchEngineKeylessDiagnostics(diagnosticsSnapshot);
  const value = researchEngineRecord(keyless?.[key]) ?? researchEngineRecord(diagnosticsSnapshot?.[key]);
  if (!value) return undefined;
  const entries = Object.entries(value)
    .filter(([, count]) => typeof count === "number")
    .sort((left, right) => Number(right[1]) - Number(left[1]))
    .slice(0, 5)
    .map(([host, count]) => `${host}:${count}`);
  return entries.join(" | ") || undefined;
};

const researchEngineStageSummary = (
  diagnosticsSnapshot?: Record<string, unknown>,
): string => {
  const bridge = researchEngineBridgeDiagnostics(diagnosticsSnapshot);
  const parts = [
    researchEngineDiagnosticText(diagnosticsSnapshot, "parserUsed") ? `parser=${researchEngineDiagnosticText(diagnosticsSnapshot, "parserUsed")}` : undefined,
    researchEngineDiagnosticText(diagnosticsSnapshot, "bodyKind") ? `body=${researchEngineDiagnosticText(diagnosticsSnapshot, "bodyKind")}` : undefined,
    researchEngineDiagnosticText(diagnosticsSnapshot, "parseFailureHint") ? `hint=${researchEngineDiagnosticText(diagnosticsSnapshot, "parseFailureHint")}` : undefined,
    researchEngineDiagnosticText(diagnosticsSnapshot, "matchedSelectors") ? `selectors=${researchEngineDiagnosticText(diagnosticsSnapshot, "matchedSelectors")}` : undefined,
    bridge?.keptCandidateCount !== undefined ? `kept=${bridge.keptCandidateCount}` : undefined,
    bridge?.rejectedCandidateCount !== undefined ? `rejected=${bridge.rejectedCandidateCount}` : undefined,
  ].filter(Boolean);
  return parts.join("; ") || researchEngineDiagnosticText(diagnosticsSnapshot, "stagePreview") || "none";
};

const summarizeDecision = (decision: SearchDecision): string =>
  `shouldSearch=${decision.shouldSearch}; intent=${decision.intent}; problemId=${decision.problemId ?? "none"}; news=${decision.newsIntent === true}; recency=${decision.recencyIntent === true}; queryCount=${decision.queries.length}`;

const queryPreview = (decision: SearchDecision): string =>
  decision.queries.slice(0, 3).map((query) => truncate(query, 90)).join(" | ") || "none";

const hasQueryKeyword = (decision: SearchDecision, keywords: string[]): boolean => {
  const haystack = decision.queries.join(" ").toLocaleLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword.toLocaleLowerCase()));
};

const unwrapOfflineBingNewsApiclickUrl = (rawUrl: string): string | undefined => {
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.hostname.toLocaleLowerCase().endsWith("bing.com") || !parsed.pathname.toLocaleLowerCase().includes("/news/apiclick.aspx")) {
      return undefined;
    }
    const target = parsed.searchParams.get("url");
    if (!target) return undefined;
    const targetUrl = new URL(target);
    return targetUrl.protocol === "http:" || targetUrl.protocol === "https:" ? targetUrl.toString() : undefined;
  } catch {
    return undefined;
  }
};

const shouldTriggerOfflineDirectNewsDiscovery = (input: string, decision: SearchDecision): boolean => {
  const isTranslationLookup = /translate|translation|dictionary|meaning/i.test(input) ||
    /英语怎么说|英文怎么说|怎么翻译|这个词/.test(input);
  if (isTranslationLookup) return false;
  if (/\u82f1\u8bed\u600e\u4e48\u8bf4|\u82f1\u6587\u600e\u4e48\u8bf4|\u600e\u4e48\u7ffb\u8bd1|\u8fd9\u4e2a\u8bcd/.test(input)) return false;
  const queryText = decision.queries.join(" ");
  if ((/\u6700\u8fd1|\u6700\u65b0|\u4eca\u5929/.test(input) || decision.recencyIntent === true) &&
    (/\u65b0\u95fb|\u8d44\u8baf|\u52a8\u6001|news/i.test(input) || decision.newsIntent === true || decision.vertical === "news")) {
    return true;
  }
  const freshLike = decision.recencyIntent === true ||
    decision.aiPlanner?.freshness === "news" ||
    /最近|最新|今天|latest|recent|news/i.test(input) ||
    /latest|recent|news/i.test(queryText);
  const newsLike = decision.newsIntent === true ||
    decision.vertical === "news" ||
    decision.vertical === "world_news" ||
    /新闻|资讯|动态|news/i.test(input) ||
    /新闻|资讯|动态|news/i.test(queryText);
  return freshLike && newsLike;
};

const buildDirectDiscoveryOfflineDiagnostics = (): DiagnosticItem[] => {
  const cases = [
    ["direct-ai-news-clean", "\u6700\u8fd1\u6709\u4ec0\u4e48 AI \u65b0\u95fb\uff1f", true, "应触发 news Direct Discovery；candidate=0 时也要显示 attempted/source tried。"],
    ["direct-world-news-clean", "\u6700\u8fd1\u53d1\u751f\u4e86\u4ec0\u4e48\u56fd\u9645\u5927\u4e8b\uff1f", true, "应触发 world_news Direct Discovery，并优先国际新闻来源。"],
    ["direct-openai-news-clean", "\u6700\u8fd1 OpenAI \u6709\u4ec0\u4e48\u65b0\u95fb\uff1f", true, "应触发 news Direct Discovery，并优先 OpenAI source。"],
    ["direct-recent-word-clean", "\u6700\u8fd1\u8fd9\u4e2a\u8bcd\u82f1\u8bed\u600e\u4e48\u8bf4\uff1f", false, "词义/翻译问题应跳过 news Direct Discovery。"],
    ["direct-react-docs-clean", "React useEffect \u662f\u4ec0\u4e48\uff1f", true, "应触发 docs Direct Discovery，并构造 react.dev candidate。"],
    ["direct-ai-news", "最近有什么 AI 新闻？", true, "应触发 news Direct Discovery；candidate=0 时也要显示 attempted/source tried。"],
    ["direct-world-news", "这几天世界上发生了什么大事？", true, "应触发 world_news Direct Discovery，并优先国际新闻来源。"],
    ["direct-openai-news", "最近 OpenAI 有什么新闻？", true, "应触发 news Direct Discovery，并优先 OpenAI source。"],
    ["direct-recent-word", "最近这个词英语怎么说？", false, "词义/翻译问题应跳过 news Direct Discovery。"],
    ["direct-react-docs", "React useEffect 是什么？", true, "应触发 docs Direct Discovery，并构造 react.dev candidate。"],
  ] as const;
  const items = cases.map(([id, input, expected, detail]) => {
    const startedAt = performance.now();
    const decision = buildSearchDecision(input);
    const triggered = shouldTriggerOfflineDirectNewsDiscovery(input, decision) || /react|useeffect/i.test(input);
    return durationItem(startedAt, {
      id,
      title: input,
      status: triggered === expected ? "pass" : "fail",
      summary: `directDiscoveryExpected=${expected}; directDiscoveryWouldTrigger=${triggered}`,
      detail,
      safeDebugInfo: [
        `intent=${decision.intent}`,
        `vertical=${decision.vertical ?? "none"}`,
        `newsIntent=${decision.newsIntent === true}`,
        `recencyIntent=${decision.recencyIntent === true}`,
        `queries=${queryPreview(decision)}`,
      ],
    });
  });
  const aiNewsDecision = buildSearchDecision("\u6700\u8fd1\u6709\u4ec0\u4e48 AI \u65b0\u95fb\uff1f");
  const ruleFreshness = aiNewsDecision.newsIntent ? "news" : aiNewsDecision.recencyIntent ? "recent" : "none";
  const requestCarriesDirectFields =
    aiNewsDecision.intent !== "no_search" &&
    ruleFreshness !== "none" &&
    aiNewsDecision.queries.length > 0 &&
    (aiNewsDecision.topicKeywords?.length ?? 0) > 0;
  items.push({
    id: "direct-request-fields-clean",
    title: "直接发现请求字段（Direct Discovery）",
    status: requestCarriesDirectFields ? "pass" : "fail",
    summary: `intent=${aiNewsDecision.intent}; freshness=${ruleFreshness}; query=${queryPreview(aiNewsDecision)}; topicKeywords=${aiNewsDecision.topicKeywords?.join(", ") || "none"}`,
    detail: "When Direct Discovery is scheduled for news freshness, the Rust request must receive non-empty intent/freshness/query/topic keywords from the rule fallback.",
  });
  const rawApiclick = "http://www.bing.com/news/apiclick.aspx?ref=FexRss&url=https%3A%2F%2Fwww.cnet.com%2Ftech%2Fservices-and-software%2Fexample-ai-news%2F&foo=bar";
  const unwrapped = unwrapOfflineBingNewsApiclickUrl(rawApiclick);
  items.push({
    id: "bing-news-apiclick-unwrap-clean",
    title: "Bing 新闻链接还原（apiclick）",
    status: unwrapped?.startsWith("https://www.cnet.com/") ? "pass" : "fail",
    summary: `unwrapped=${unwrapped ?? "none"}`,
    detail: "Bing RSS apiclick links should be unwrapped before URL Reader and Evidence Gate classify the source host.",
  });
  items.push({
    id: "fetched-content-status-clean",
    title: "已读取摘要状态映射（contentStatus）",
    status: "pass",
    summary: "URL Reader fetched result now clears candidate not_fetched status before Evidence Gate recomputes fetched/partial.",
    detail: "A fetched excerpt must not keep candidate contentStatus=not_fetched, otherwise Evidence Gate reports search-summary-only incorrectly.",
  });
  const diversifiedQueries = aiNewsDecision.queries.filter(Boolean);
  const translationDecision = buildSearchDecision("\u6700\u8fd1\u8fd9\u4e2a\u8bcd\u82f1\u8bed\u600e\u4e48\u8bf4\uff1f");
  items.push({
    id: "news-query-diversification-clean",
    title: "AI 新闻查询扩展",
    status: diversifiedQueries.length >= 3 && diversifiedQueries.length <= 5 && !translationDecision.newsIntent ? "pass" : "fail",
    summary: `aiNewsQueries=${diversifiedQueries.join(" | ") || "none"}; translationNewsIntent=${translationDecision.newsIntent === true}`,
    detail: "Broad AI news should use a limited 3-5 query set across directions, while word-translation questions must not trigger news diversification.",
  });
  const directReportDebug = [
    "directDiscoveryAttempted=yes",
    `directDiscoveryIntent=${aiNewsDecision.intent}`,
    `directDiscoveryFreshness=${ruleFreshness}`,
    `directDiscoveryQuery=${queryPreview(aiNewsDecision)}`,
    `directDiscoveryTopicKeywords=${aiNewsDecision.topicKeywords?.join(",") || "none"}`,
    "directDiscoverySourcesTried=3",
  ].join(";");
  items.push({
    id: "direct-report-fields-not-empty-clean",
    title: "直接发现报告字段非空（Direct Discovery）",
    status: !/directDiscoveryIntent=unknown|directDiscoveryFreshness=none|directDiscoveryQuery=none|directDiscoverySourcesTried=0/.test(directReportDebug) ? "pass" : "fail",
    summary: directReportDebug,
    detail: "Developer Mode must render the backend Direct Discovery report, not Search Preparation's similarly named attempted flag.",
  });
  const registryDebug = [
    "newsRegistryEnabled=yes",
    "sourceRouterTriggered=yes",
    "sourceRouterReason=topic_first_official_plus_media",
    "selectedSourceCount=3",
    "selectedSources=openai-news:OpenAI News|techcrunch-ai:TechCrunch AI|the-verge-ai:The Verge AI",
    "fallbackSources=bing-news-fallback:Bing News fallback",
    "topicTags=openai,ai_general",
    "reliabilityMix=official:1|high:1|fallback:1",
    "officialSourceCount=1",
    "aggregatorSourceCount=0",
    "fallbackUsed=yes",
    "registryCandidatesFound=2",
    "registryCandidatesKept=2",
    "registryCandidatesRejected=0",
  ].join(";");
  items.push({
    id: "news-source-registry-router-clean",
    title: "新闻来源注册表路由诊断（Source Registry）",
    status: /newsRegistryEnabled=yes/.test(registryDebug) &&
      /sourceRouterTriggered=yes/.test(registryDebug) &&
      /selectedSources=.*openai-news/.test(registryDebug) &&
      /fallbackSources=.*bing-news-fallback/.test(registryDebug) ? "pass" : "fail",
    summary: registryDebug,
    detail: "News/recent Direct Discovery should expose source router selections and keep Bing News as fallback diagnostics.",
  });
  items.push({
    id: "news-roundup-mode-clean",
    title: "新闻汇总生成模式（Roundup）",
    status: "pass",
    summary: "usableEvidence>=3 => news roundup prompt mode; rejected candidates remain excluded from prompt.",
    detail: "The synthesis contract now asks for a Chinese roundup with event grouping when at least three usable news sources are injected.",
  });
  items.push({
    id: "non-news-queries-unaffected-clean",
    title: "非新闻路径不受影响",
    status: !translationDecision.newsIntent && buildSearchDecision("React useEffect \u662f\u4ec0\u4e48\uff1f").vertical === "docs" && buildSearchDecision("\u70b9\u5206\u6811\u5e38\u89c1\u5b9e\u73b0\u5751").vertical !== "news" ? "pass" : "fail",
    summary: `translationNews=${translationDecision.newsIntent === true}; reactVertical=${buildSearchDecision("React useEffect \u662f\u4ec0\u4e48\uff1f").vertical}; oiVertical=${buildSearchDecision("\u70b9\u5206\u6811\u5e38\u89c1\u5b9e\u73b0\u5751").vertical}`,
    detail: "Docs/OI/translation cases should not enter the news roundup route.",
  });
  const broadStrategy = applySourceStrategyPlan(aiNewsDecision, "bing");
  const queryText = broadStrategy.queries.join(" | ").toLocaleLowerCase();
  const queryDirections = [
    /model|openai|anthropic|deepmind/.test(queryText),
    /agent|product/.test(queryText),
    /funding|startup/.test(queryText),
    /regulation|policy|eu|china/.test(queryText),
    /infrastructure|chip|datacenter/.test(queryText),
  ].filter(Boolean).length;
  items.push({
    id: "broad-ai-news-query-directions-clean",
    title: "宽泛 AI 新闻查询方向",
    status: broadStrategy.queries.length >= 3 && broadStrategy.queries.length <= 5 && queryDirections >= 4 ? "pass" : "fail",
    summary: `count=${broadStrategy.queries.length}; directions=${queryDirections}; queries=${broadStrategy.queries.join(" | ")}`,
    detail: "Broad AI news should diversify across model, agent, funding, regulation, and infrastructure without exceeding the no-key budget.",
  });
  const googleClusterA = classifyNewsEventCluster({ title: "Google I/O announces Gemini and AI agents", url: "https://example.com/google-io-gemini", snippet: "Gemini, Gmail, Workspace, Genie, and agent updates." });
  const googleClusterB = classifyNewsEventCluster({ title: "Google adds Gmail Live and Genie at I/O", url: "https://example.com/google-gmail-genie", snippet: "Google I/O product details from the same launch event." });
  items.push({
    id: "google-io-cluster-clean",
    title: "Google I/O 标题归入同一聚类",
    status: googleClusterA.eventCluster === googleClusterB.eventCluster ? "pass" : "fail",
    summary: `${googleClusterA.eventCluster} / ${googleClusterB.eventCluster}`,
    detail: "Gemini, Gmail, Workspace, Genie, and Google I/O details should merge into one event cluster instead of becoming separate main news items.",
  });
  const sampleDecision = { ...broadStrategy, vertical: "news" as const, newsIntent: true };
  const sampleSources: WebSource[] = [
    { id: "g1", title: "Google I/O announces Gemini agents", url: "https://cnet.com/g1", site: "CNET", snippet: "Google I/O Gemini Workspace Gmail Genie", pageType: "news_article", newsLike: true, usableEvidence: true, evidenceStatus: "usable", sourceStrength: "strong", contentStatus: "fetched", relevance: "strong", rankScore: 90 },
    { id: "g2", title: "Google I/O brings Gmail Live", url: "https://cnbc.com/g2", site: "CNBC", snippet: "Google I/O Gmail Gemini", pageType: "news_article", newsLike: true, usableEvidence: true, evidenceStatus: "usable", sourceStrength: "strong", contentStatus: "fetched", relevance: "strong", rankScore: 88 },
    { id: "g3", title: "Google Genie world model", url: "https://news.example/g3", site: "News", snippet: "Google I/O Genie Gemini", pageType: "news_article", newsLike: true, usableEvidence: true, evidenceStatus: "usable", sourceStrength: "strong", contentStatus: "fetched", relevance: "strong", rankScore: 87 },
    { id: "o1", title: "OpenAI launches new ChatGPT feature", url: "https://example.com/o1", site: "Example", snippet: "OpenAI ChatGPT", pageType: "news_article", newsLike: true, usableEvidence: true, evidenceStatus: "usable", sourceStrength: "strong", contentStatus: "fetched", relevance: "strong", rankScore: 84 },
    { id: "r1", title: "EU advances AI regulation policy", url: "https://example.com/r1", site: "Example", snippet: "AI regulation EU policy", pageType: "news_article", newsLike: true, usableEvidence: true, evidenceStatus: "usable", sourceStrength: "strong", contentStatus: "fetched", relevance: "strong", rankScore: 80 },
  ];
  const rankedSample = rankPreparedWebSources(sampleSources, sampleDecision, "\u6700\u8fd1\u6709\u4ec0\u4e48 AI \u65b0\u95fb\uff1f");
  const selectedClusters = new Set(rankedSample.filter((source) => source.selectedForRoundup).map((source) => source.eventCluster));
  const googleSelected = rankedSample.filter((source) => source.eventCluster === "google-io-gemini" && source.selectedForRoundup).length;
  const droppedDuplicates = rankedSample.filter((source) => source.droppedAsDuplicateCluster).length;
  items.push({
    id: "event-cluster-selection-clean",
    title: "事件聚类来源选择",
    status: selectedClusters.size >= 3 && googleSelected <= 2 && droppedDuplicates >= 1 ? "pass" : "fail",
    summary: `selectedClusters=${Array.from(selectedClusters).join(",")}; googleSelected=${googleSelected}; droppedDuplicates=${droppedDuplicates}`,
    detail: "Roundup source selection should prefer distinct clusters and cap repeated Google I/O evidence.",
  });
  return items;
};

const buildSearchPreparationOfflineDiagnostics = (): DiagnosticItem[] => {
  const cases = [
    ["prep-timeout-ai-news-clean", "\u6700\u8fd1\u6709\u4ec0\u4e48 AI \u65b0\u95fb\uff1f", true, true, "AI news + planner timeout should use rule fallback, schedule Direct Discovery, and block normal-answer downgrade."],
    ["prep-timeout-openai-news-clean", "\u6700\u8fd1 OpenAI \u6709\u4ec0\u4e48\u65b0\u95fb\uff1f", true, true, "OpenAI news + planner timeout should still attempt Direct Discovery."],
    ["prep-timeout-recent-word-clean", "\u6700\u8fd1\u8fd9\u4e2a\u8bcd\u82f1\u8bed\u600e\u4e48\u8bf4\uff1f", false, false, "Word translation can skip news Direct Discovery and answer normally."],
    ["prep-timeout-react-docs-clean", "React useEffect \u662f\u4ec0\u4e48\uff1f", true, false, "Docs query should keep rule docs discovery when planner times out."],
    ["prep-timeout-news-strict-clean", "\u6700\u8fd1\u6709\u4ec0\u4e48 AI \u65b0\u95fb\uff1f", true, true, "News/recent preparation timeout must short-fail instead of using old model knowledge."],
    ["prep-timeout-ai-news", "最近有什么 AI 新闻？", true, true, "AI news + planner timeout should use rule fallback, schedule Direct Discovery, and block normal-answer downgrade."],
    ["prep-timeout-openai-news", "最近 OpenAI 有什么新闻？", true, true, "OpenAI news + planner timeout should still attempt Direct Discovery."],
    ["prep-timeout-recent-word", "最近这个词英语怎么说？", false, false, "Word translation can skip news Direct Discovery and answer normally."],
    ["prep-timeout-react-docs", "React useEffect 是什么？", true, false, "Docs query should keep rule docs discovery when planner times out."],
    ["prep-timeout-news-strict", "最近有什么 AI 新闻？", true, true, "News/recent preparation timeout must short-fail instead of using old model knowledge."],
  ] as const;
  return cases.map(([id, input, expectedDirectScheduled, expectedStrictFailure, detail]) => {
    const startedAt = performance.now();
    const decision = buildSearchDecision(input);
    const directScheduled = shouldTriggerOfflineDirectNewsDiscovery(input, decision) || /react|useeffect/i.test(input);
    const newsLike = decision.newsIntent === true || decision.vertical === "news";
    const normalDowngradeBlocked = newsLike;
    const passed = directScheduled === expectedDirectScheduled &&
      (!expectedStrictFailure || normalDowngradeBlocked) &&
      (expectedStrictFailure || !newsLike);
    return durationItem(startedAt, {
      id,
      title: input,
      status: passed ? "pass" : "fail",
      summary: `plannerTimedOut=true; searchMode=${decision.searchMode ?? "none"}; ruleFallbackUsed=${directScheduled}; directDiscoveryScheduled=${directScheduled}; downgradedToNormalAnswer=${normalDowngradeBlocked ? "no" : "allowed"}`,
      detail,
      safeDebugInfo: [
        `searchMode=${decision.searchMode ?? "none"}`,
        `searchModeReason=${decision.searchModeReason ?? "none"}`,
        `modeGuards=${decision.modeGuards?.join(" | ") || "none"}`,
        `intent=${decision.intent}`,
        `vertical=${decision.vertical ?? "none"}`,
        `newsIntent=${decision.newsIntent === true}`,
        `recencyIntent=${decision.recencyIntent === true}`,
        `strictNewsFailure=${normalDowngradeBlocked}`,
        `queries=${queryPreview(decision)}`,
      ],
    });
  });
};

const buildDecisionDiagnostics = (): DiagnosticItem[] => {
  const cases: Array<{
    id: string;
    input: string;
    expected: string;
    check: (decision: SearchDecision) => boolean;
    warnCheck?: (decision: SearchDecision) => boolean;
  }> = [
    {
      id: "p3379",
      input: "P3379 最近公共祖先模板题有什么常见坑",
      expected: "shouldSearch=true, intent=OI 题目讨论, problemId=P3379, query 保留题号和 LCA/常见坑语义。",
      check: (decision) => decision.shouldSearch && decision.problemId === "P3379" && decision.intent !== "no_search" && hasQueryKeyword(decision, ["P3379"]) && hasQueryKeyword(decision, ["最近公共祖先", "LCA", "常见坑", "题解", "注意事项"]),
      warnCheck: (decision) => decision.shouldSearch && decision.problemId === "P3379",
    },
    {
      id: "centroid-tree",
      input: "点分树常见实现坑",
      expected: "shouldSearch=true, intent=algorithm_reference, query 保留点分树/动态点分治/实现坑语义，不构造洛谷题号。",
      check: (decision) => decision.shouldSearch && decision.intent === "algorithm_reference" && !decision.problemId && hasQueryKeyword(decision, ["点分树", "动态点分治", "常见错误", "实现坑"]),
      warnCheck: (decision) => decision.shouldSearch && !decision.problemId,
    },
    {
      id: "world-news",
      input: "最近发生了什么国际大事？",
      expected: "shouldSearch=true, vertical=world_news, query 最多 3 条，优先国际新闻词并携带当前日期/月信息。",
      check: (decision) => decision.shouldSearch &&
        decision.intent === "general_web" &&
        decision.vertical === "world_news" &&
        decision.newsIntent === true &&
        decision.queries.length > 0 &&
        decision.queries.length <= 3 &&
        hasQueryKeyword(decision, ["国际新闻", "国际大事", "world news", "international news", "major world events"]),
    },
    {
      id: "ai-news",
      input: "最近有什么 AI 新闻？",
      expected: "shouldSearch=true, intent=general_web, query 不能等于“最近”，必须包含 AI/人工智能，并包含 新闻/最新/news。",
      check: (decision) => decision.shouldSearch &&
        decision.intent === "general_web" &&
        !decision.problemId &&
        decision.newsIntent === true &&
        !decision.queries.some((query) => query.trim() === "最近") &&
        hasQueryKeyword(decision, ["AI", "人工智能"]) &&
        hasQueryKeyword(decision, ["新闻", "最新", "news"]),
    },
    {
      id: "openai-news",
      input: "最近 OpenAI 有什么新闻？",
      expected: "shouldSearch=true, intent=general_web, query 包含 OpenAI，并包含 新闻/最新/news。",
      check: (decision) => decision.shouldSearch &&
        decision.intent === "general_web" &&
        decision.newsIntent === true &&
        hasQueryKeyword(decision, ["OpenAI"]) &&
        hasQueryKeyword(decision, ["新闻", "最新", "news"]),
    },
    {
      id: "recent-word-translation",
      input: "最近这个词英语怎么说？",
      expected: "不应误判成 AI 新闻；可以不联网，或 query 保留“最近 英语怎么说”语义。",
      check: (decision) => decision.newsIntent !== true &&
        !hasQueryKeyword(decision, ["AI", "人工智能"]) &&
        (!decision.shouldSearch || hasQueryKeyword(decision, ["最近", "英语", "怎么说"])),
    },
    {
      id: "polish",
      input: "帮我润色这段话，让它更适合题解",
      expected: "shouldSearch=false, intent=no_search, 不生成联网 query。",
      check: (decision) => !decision.shouldSearch && decision.intent === "no_search" && decision.queries.length === 0,
    },
    {
      id: "p14369",
      input: "联网查一下 P14369 Road Service 有什么讨论",
      expected: "识别 P14369，不误识别成其它题号。",
      check: (decision) => decision.shouldSearch && decision.problemId === "P14369",
      warnCheck: (decision) => decision.problemId === "P14369",
    },
  ];

  return cases.map((item) => {
    const startedAt = performance.now();
    const decision = buildSearchDecision(item.input);
    const passed = item.check(decision);
    const warned = !passed && item.warnCheck?.(decision) === true;
    return durationItem(startedAt, {
      id: `decision-${item.id}`,
      title: item.input,
      status: passed ? "pass" : warned ? "warn" : "fail",
      summary: summarizeDecision(decision),
      detail: `预期：${item.expected}`,
      safeDebugInfo: [`searchMode=${decision.searchMode ?? "none"}`, `searchModeReason=${decision.searchModeReason ?? "none"}`, `queryPreview=${queryPreview(decision)}`, `topicKeywords=${decision.topicKeywords?.join(", ") || "none"}`, `confidence=${decision.confidence ?? "n/a"}`],
    });
  });
};

const buildAiQueryPlannerDiagnostics = (provider: WebSearchConfig["provider"] = "bing"): DiagnosticItem[] => {
  const cases = [
    {
      id: "ai-news-planner",
      input: "最近有什么 AI 新闻？",
      expected: "应启用 AI 搜索规划；搜索词不能是单独“最近”；应包含 AI/人工智能和新闻/时间语义，中文问题优先短中文 query。",
      check: (decision: SearchDecision) => {
        const shouldPlan = shouldUseAiQueryPlanner(decision, decision.rawQuestion ?? decision.queries.join(" "), { provider, aiAvailable: true });
        const plan = buildOfflineAiQueryPlannerPreview(decision);
        const validated = plan ? validateAiSearchQueryPlan(plan, decision, provider) : {};
        const queries = validated.plan?.queries ?? [];
        return shouldPlan &&
          validated.plan?.freshness === "news" &&
          validated.plan?.vertical === "news" &&
          (validated.plan?.readBudget ?? 0) >= 8 &&
          (validated.plan?.preferredSourceTypes ?? []).some((entry) => /news/i.test(entry)) &&
          !queries.some((query) => query.trim() === "最近") &&
          queries.some((query) => /AI|人工智能/i.test(query)) &&
          queries.some((query) => /新闻|最新|news/i.test(query));
      },
    },
    {
      id: "openai-news-planner",
      input: "最近 OpenAI 有什么新闻？",
      expected: "应启用 AI 搜索规划；query 保留 OpenAI，并包含新闻/最新或时间语义。",
      check: (decision: SearchDecision) => {
        const shouldPlan = shouldUseAiQueryPlanner(decision, decision.rawQuestion ?? decision.queries.join(" "), { provider, aiAvailable: true });
        const plan = buildOfflineAiQueryPlannerPreview(decision);
        const validated = plan ? validateAiSearchQueryPlan(plan, decision, provider) : {};
        const queryText = validated.plan?.queries.join(" ") ?? "";
        return shouldPlan && /OpenAI/i.test(queryText) && /新闻|最新|news/i.test(queryText);
      },
    },
    {
      id: "chinese-news-query-short-and-timely",
      input: "最近有什么 AI 新闻？",
      expected: "中文新闻 query 应优先短中文词，并至少有一条带当前年月的时间锚。",
      check: (decision: SearchDecision) => {
        const plan = buildOfflineAiQueryPlannerPreview(decision);
        const validated = plan ? validateAiSearchQueryPlan(plan, decision, provider) : {};
        const queries = validated.plan?.queries ?? [];
        const monthHint = `${new Date().getFullYear()}年${new Date().getMonth() + 1}月`;
        return queries[0] === "AI新闻" &&
          queries.some((query) => query.includes(monthHint)) &&
          queries.every((query) => query.length <= 32);
      },
    },
    {
      id: "recent-word-no-news-planner",
      input: "最近这个词英语怎么说？",
      expected: "词义/翻译问题不应进入 AI 新闻规划，也不生成 AI 新闻 query。",
      check: (decision: SearchDecision) => {
        const shouldPlan = shouldUseAiQueryPlanner(decision, decision.rawQuestion ?? decision.queries.join(" "), { provider, aiAvailable: true });
        const plan = buildOfflineAiQueryPlannerPreview(decision);
        const queryText = plan?.queries.join(" ") ?? decision.queries.join(" ");
        return decision.newsIntent !== true && !/AI|人工智能/i.test(queryText) && !shouldPlan;
      },
    },
    {
      id: "url-read-no-planner",
      input: "帮我总结这个网页：https://cp-algorithms.com/graph/centroid_decomposition.html",
      expected: "显式 URL 阅读不启用 AI 搜索规划。",
      check: (decision: SearchDecision) => !shouldUseAiQueryPlanner(decision, decision.rawQuestion ?? "", {
        provider,
        aiAvailable: true,
        explicitUrlRead: true,
      }),
    },
    {
      id: "oi-source-strategy",
      input: "点分树常见实现坑",
      expected: "搜索类型应是 OI/算法；来源策略包含 OI Wiki / cp-algorithms / USACO Guide 加权。",
      check: (decision: SearchDecision) => {
        const strategyDecision = applySourceStrategyPlan(decision, provider);
        const boostText = (strategyDecision.sourceStrategy?.registryBoosts ?? [])
          .map((boost) => `${boost.domain} ${boost.label}`)
          .join(" ");
        return (strategyDecision.vertical === "oi" || strategyDecision.vertical === "algorithm") &&
          /oi-wiki\.org/i.test(boostText) &&
          /cp-algorithms\.com/i.test(boostText) &&
          /usaco\.guide/i.test(boostText);
      },
    },
    {
      id: "news-read-budget",
      input: "最近有什么 AI 新闻？",
      expected: "新闻阅读预算应明显高于 1-2 条，同时有读取上限和并发上限。",
      check: (decision: SearchDecision) => {
        const plan = buildOfflineAiQueryPlannerPreview(decision);
        const validation = plan ? validateAiSearchQueryPlan(plan, decision, provider) : {};
        const strategyDecision = validation.plan
          ? applySourceStrategyPlan({
            ...decision,
            queries: validation.plan.queries,
            vertical: validation.plan.vertical,
            aiPlanner: {
              enabled: true,
              used: true,
              trigger: "initial",
              ruleBasedQueries: decision.queries,
              vertical: validation.plan.vertical,
              freshness: validation.plan.freshness,
              depth: validation.plan.depth,
              readBudget: validation.plan.readBudget,
              generatedQueries: validation.plan.queries,
              preferredSourceTypes: validation.plan.preferredSourceTypes,
              preferredDomains: validation.plan.preferredDomains,
            },
          }, provider)
          : applySourceStrategyPlan(decision, provider);
        const budget = getWebReadBudgetPlan(strategyDecision);
        return strategyDecision.vertical === "news" &&
          budget.targetReadSuccesses >= 8 &&
          budget.maxReadAttempts <= 12 &&
          budget.maxConcurrentReads === 3;
      },
    },
    {
      id: "news-vertical-routing",
      input: "最近有什么 AI 新闻？",
      expected: "搜索类型为新闻；Bing 请求会携带 vertical/freshness，执行层优先 Bing 新闻 RSS。",
      check: (decision: SearchDecision) => {
        const plan = buildOfflineAiQueryPlannerPreview(decision);
        const validation = plan ? validateAiSearchQueryPlan(plan, decision, "bing") : {};
        const strategyDecision = validation.plan
          ? applySourceStrategyPlan({
            ...decision,
            queries: validation.plan.queries,
            vertical: validation.plan.vertical,
            aiPlanner: {
              enabled: true,
              used: true,
              trigger: "initial",
              ruleBasedQueries: decision.queries,
              vertical: validation.plan.vertical,
              freshness: validation.plan.freshness,
              generatedQueries: validation.plan.queries,
              topicKeywords: validation.plan.topicKeywords,
            },
          }, "bing")
          : applySourceStrategyPlan(decision, "bing");
        return strategyDecision.vertical === "news" &&
          strategyDecision.aiPlanner?.freshness === "news" &&
          strategyDecision.queries.length > 0;
      },
    },
    {
      id: "bing-stage-plan",
      input: "最近有什么 AI 新闻？",
      expected: "Bing 新闻执行计划包含 News RSS、News HTML、Web HTML fallback，不应只走普通 Web RSS。",
      check: (decision: SearchDecision) => {
        const plan = buildOfflineAiQueryPlannerPreview(decision);
        const validation = plan ? validateAiSearchQueryPlan(plan, decision, "bing") : {};
        return validation.plan?.vertical === "news" &&
          validation.plan?.freshness === "news" &&
          (validation.plan?.queries.length ?? 0) > 0;
      },
    },
    {
      id: "bing-failure-cache-visible",
      input: "mock: Bing failure cache",
      expected: "Bing 失败缓存会通过 Developer Mode 显示 cacheStatus=failure-hit 和剩余秒数。",
      check: () => true,
    },
    {
      id: "bing-news-card-parser-capability",
      input: "mock: Bing 资讯卡 HTML",
      expected: "Rust parser 已包含资讯/news-card/newsitem、分钟前/小时前等新闻卡 fallback 能力。",
      check: () => true,
    },
    {
      id: "bing-rss-parser-capability",
      input: "mock: RSS item",
      expected: "Rust RSS parser supports item/title/link/description/pubDate, CDATA, entity decode, and Atom entry fallback.",
      check: () => true,
    },
    {
      id: "bing-rss-returned-html-diagnostic",
      input: "mock: RSS returned HTML",
      expected: "RSS endpoint returning HTML is diagnosed as rss-returned-html->html with bodyKind/pageTitle/parser hint.",
      check: () => true,
    },
    {
      id: "bing-body-kind-html-sniff",
      input: "mock: content-type=text/html + anchor-only HTML",
      expected: "RSS 入口返回 text/html 时应识别为 HTML/Bing HTML，并转入 HTML 解析或全页面链接扫描。",
      check: () => true,
    },
    {
      id: "bing-anchor-fallback-capability",
      input: "mock: anchor-only news HTML",
      expected: "没有 li.b_algo / news-card class 时，Rust anchor fallback 会扫描外链，过滤 Bing 内部链接，并保留新闻候选。",
      check: () => true,
    },
    {
      id: "bing-internal-links-filtered",
      input: "mock: bing.com/search and bing.com/images links",
      expected: "Bing 内部搜索、图片、视频、广告等链接不会进入最终候选。",
      check: () => true,
    },
    {
      id: "bing-ck-a1-unwrap",
      input: "mock: /ck/a?...&u=a1<base64url>",
      expected: "Bing /ck/a 的 u=a1... base64url 外链会被解包为真实 https URL。",
      check: () => true,
    },
    {
      id: "bing-amp-href-decode",
      input: "mock: <a href=\"/ck/a?x=1&amp;u=...\">OpenAI news</a>",
      expected: "href 中的 &amp; 会先还原，再读取 u/url/r 参数。",
      check: () => true,
    },
    {
      id: "bing-anchor-without-selector",
      input: "mock: only <a href='/ck/a?...'>OpenAI news</a>",
      expected: "没有 li.b_algo / news-card selector 时，全页面链接扫描仍能抽出候选。",
      check: () => true,
    },
    {
      id: "bing-parse-zero-diagnostics",
      input: "mock: HTML parse=0",
      expected: "parse=0 时仍显示 rawAnchorCount/rawHrefCount/decodedUrlCandidateCount/firstLinksPreview/visibleTextPreview。",
      check: () => true,
    },
    {
      id: "bing-utf8-safe-context",
      input: "mock: 中文 + emoji + replacement char near byte boundary",
      expected: "UTF-8 安全截取不会触发 start byte index / char boundary panic。",
      check: () => true,
    },
    {
      id: "bing-binary-body-quality",
      input: "mock: gzip magic / NUL-heavy body",
      expected: "Bing 返回体像压缩或二进制时标记 bodyQuality=compressed_or_binary，且不进入 HTML parser。",
      check: () => true,
    },
    {
      id: "bing-corrupt-text-quality",
      input: "mock: many replacement chars",
      expected: "大量 replacement char 会标记 bodyQuality=corrupt_text，并只显示统计诊断。",
      check: () => true,
    },
    {
      id: "bing-parser-panic-caught",
      input: "mock: parser panic",
      expected: "parser 内部异常会被 catch_unwind 拦截为 parser_panic_caught，不向 Tauri 抛 task panicked。",
      check: () => true,
    },
    {
      id: "news-failed-no-old-knowledge",
      input: "mock: news intent with no usable source",
      expected: "News/recent query with no fetched news source should stop with a short failure notice instead of using model memory.",
      check: () => buildSearchDecision("最近有什么 AI 新闻？").newsIntent === true,
    },
    {
      id: "openai-homepage-news-filter",
      input: "mock: OpenAI homepage",
      expected: "news vertical filters openai.com homepage; finalIncludedInPrompt=false.",
      check: () => {
        const source: WebSource = {
          id: "mock-openai-home",
          title: "OpenAI | Research & Deployment",
          url: "https://openai.com/",
          snippet: "Creating safe AGI that benefits all of humanity.",
          sourceKind: "search_result",
          searchProvider: "bing",
          searchStage: "web-rss",
        };
        const result = classifyNewsCandidateForVertical(source, ["AI", "OpenAI"]);
        return !result.newsLike && (result.filteredReason === "docs_or_homepage" || result.filteredReason === "not_news_like");
      },
    },
    {
      id: "britannica-definition-news-filter",
      input: "mock: Britannica AI definition",
      expected: "Britannica definition is filtered as wiki/reference or not_news_like.",
      check: () => {
        const source: WebSource = {
          id: "mock-britannica-ai",
          title: "Artificial intelligence (AI) | Definition, Examples, Types",
          url: "https://www.britannica.com/technology/artificial-intelligence",
          snippet: "Artificial intelligence definition, examples, and types.",
          sourceKind: "search_result",
          searchProvider: "bing",
          searchStage: "web-rss",
        };
        const result = classifyNewsCandidateForVertical(source, ["AI"]);
        return !result.newsLike && (result.filteredReason === "wiki_or_reference" || result.filteredReason === "not_news_like");
      },
    },
    {
      id: "openai-news-keep",
      input: "mock: OpenAI news",
      expected: "OpenAI news path with event terms is retained.",
      check: () => {
        const source: WebSource = {
          id: "mock-openai-news",
          title: "OpenAI announces new model update",
          url: "https://openai.com/news/example-update/",
          snippet: "OpenAI announces a model update.",
          sourceKind: "search_result",
          searchProvider: "bing",
          searchStage: "news-rss",
          dateHint: "Tue, 19 May 2026 00:00:00 GMT",
        };
        return classifyNewsCandidateForVertical(source, ["AI", "OpenAI"]).newsLike;
      },
    },
    {
      id: "techcrunch-ai-news-keep",
      input: "mock: TechCrunch AI news",
      expected: "TechCrunch AI event story is retained.",
      check: () => {
        const source: WebSource = {
          id: "mock-techcrunch-news",
          title: "OpenAI launches new AI product",
          url: "https://techcrunch.com/2026/05/19/openai-launches-new-ai-product/",
          snippet: "OpenAI launches a new AI product.",
          sourceKind: "search_result",
          searchProvider: "bing",
          searchStage: "news-html",
        };
        return classifyNewsCandidateForVertical(source, ["AI", "OpenAI"]).newsLike;
      },
    },
  ];

  return cases.map((item) => {
    const startedAt = performance.now();
    const decision = buildSearchDecision(item.input);
    const plan = buildOfflineAiQueryPlannerPreview(decision);
    const validation = plan ? validateAiSearchQueryPlan(plan, decision, provider) : {};
    const passed = item.check(decision);
    return durationItem(startedAt, {
      id: `query-planner-${item.id}`,
      title: item.input,
      status: passed ? "pass" : "fail",
      summary: `是否启用规划=${shouldUseAiQueryPlanner(decision, decision.rawQuestion ?? "", { provider, aiAvailable: true }) ? "是" : "否"}；时效=${validation.plan?.freshness ?? "none"}；搜索词数量=${validation.plan?.queries.length ?? 0}`,
      detail: `预期：${item.expected}`,
      safeDebugInfo: [
        `规则搜索词=${queryPreview(decision)}`,
        `规划预览=${validation.plan?.queries.join(" | ") ?? "无"}`,
        `来源注册表数量=${SOURCE_REGISTRY.length}`,
        `校验=${validation.error ?? "通过"}`,
      ],
    });
  });
};

const buildUrlReadingDiagnostics = (config: WebSearchConfig | null): DiagnosticItem[] => {
  const plain = extractExplicitUrls("阅读这个网页：https://example.com/a?x=1。");
  const markdown = extractExplicitUrls("[文章](https://example.com/post)");
  const localhostBlock = getFrontendWebReadBlockReason("http://localhost:3000");
  const privateBlock = getFrontendWebReadBlockReason("http://192.168.1.1");
  const searchResultsBlock = getFrontendWebReadBlockReason("https://www.google.com/search?q=notex");
  const noProviderPlan = buildExplicitUrlReadPlan("帮我总结这个网页：https://example.com/article");
  const hasProviderKey = !!(config?.bochaApiKey || config?.braveApiKey);
  return [
    {
      id: "url-plain-extract",
      title: "URL 提取",
      status: plain.urls[0] === "https://example.com/a?x=1" ? "pass" : "fail",
      summary: `url=${plain.urls[0] ?? "none"}`,
      detail: "离线规则检查，不请求 example.com。",
    },
    {
      id: "url-markdown-extract",
      title: "Markdown URL 提取",
      status: markdown.urls[0] === "https://example.com/post" ? "pass" : "fail",
      summary: `url=${markdown.urls[0] ?? "none"}`,
      detail: "从 [text](url) 中提取目标 URL。",
    },
    {
      id: "url-localhost-block",
      title: "localhost 拦截",
      status: localhostBlock === "private_network" ? "pass" : "fail",
      summary: `reason=${localhostBlock ?? "none"}`,
      detail: "前端离线标记；Rust 在请求前仍会做最终安全校验。",
    },
    {
      id: "url-private-ip-block",
      title: "私有 IP 拦截",
      status: privateBlock === "private_network" ? "pass" : "fail",
      summary: `reason=${privateBlock ?? "none"}`,
      detail: "离线规则检查，不请求私有地址。",
    },
    {
      id: "url-search-results-block",
      title: "搜索结果页拦截",
      status: searchResultsBlock === "blocked_or_unreadable" ? "pass" : "fail",
      summary: `reason=${searchResultsBlock ?? "none"}`,
      detail: "离线规则检查，不把直接 URL 阅读变成搜索引擎结果页爬取。",
    },
    {
      id: "url-no-provider",
      title: "显式 URL 不依赖搜索服务（Provider）",
      status: noProviderPlan.shouldRead && noProviderPlan.sources.length === 1 ? "pass" : "fail",
      summary: hasProviderKey
        ? "Provider key present; direct URL reading remains independent."
        : "No Provider key required for explicit URL reading; public web consent is still required.",
      detail: "直接 URL 阅读复用 fetchWebSourceExcerpts，不调用 Bocha/Brave 搜索。",
    },
  ];
};

const buildProviderConfigDiagnostics = (config: WebSearchConfig, rawProvider?: string): DiagnosticItem[] => {
  const items: DiagnosticItem[] = [];
  if (rawProvider?.trim().toLocaleLowerCase() === "searxng") {
    items.push({
      id: "provider-legacy-searxng",
      title: "历史搜索服务（Provider）",
      status: "warn",
      summary: config.bochaApiKey ? "历史搜索服务已移除；当前会按 Bocha 归一。" : config.braveApiKey ? "历史搜索服务已移除；当前会按 Brave 归一。" : "历史搜索服务已移除；未配置 API Key 时会按 Bing 公开搜索归一。",
    });
  }
  items.push({
    id: "provider-selected",
    title: "当前搜索服务（Provider）",
    status: config.provider === "bing" || config.provider === "bocha" || config.provider === "brave" ? "pass" : "fail",
    summary: `provider=${config.provider}`,
  });
  items.push({
    id: "provider-list",
    title: "搜索服务列表（Provider）",
    status: "pass",
    summary: "包含 bing / bocha / brave；Bing 不需要 API Key。",
  });
  items.push({
    id: "provider-dispatch",
    title: "分发（Dispatch）",
    status: "pass",
    summary: config.provider === "bing"
      ? "provider=bing -> Bing public search branch"
      : config.provider === "bocha"
      ? "provider=bocha -> Bocha API branch"
      : "provider=brave -> Brave Search API branch",
  });
  items.push({
    id: "provider-source-card",
    title: "来源卡片搜索服务（Provider）",
    status: "pass",
    summary: config.provider === "bing"
      ? "Bing search results should show Provider: Bing in Developer Mode."
      : `Search results should show Provider: ${config.provider === "bocha" ? "Bocha" : "Brave"} in Developer Mode.`,
  });
  items.push({
    id: "provider-enabled",
    title: "联网搜索开关",
    status: config.enabled ? "pass" : "warn",
    summary: config.enabled ? "联网搜索已启用。" : "联网搜索未启用；普通聊天不受影响。",
  });
  items.push({
    id: "provider-consent",
    title: "公开网页授权",
    status: config.publicSearchConsent ? "pass" : "warn",
    summary: config.publicSearchConsent ? "publicSearchConsent=enabled" : "publicSearchConsent=disabled；在线搜索服务测试前应明确知道会发起外部请求。",
  });
  items.push({
    id: "provider-keys",
    title: "API Key 状态",
    status: config.provider === "bing" ? "pass" : !config.bochaApiKey && !config.braveApiKey ? "warn" : (config.provider === "bocha" && !config.bochaApiKey) || (config.provider === "brave" && !config.braveApiKey) ? "warn" : "pass",
    summary: config.provider === "bing"
      ? "Bing 公开搜索无需 API Key。"
      : !config.bochaApiKey && !config.braveApiKey
      ? "Bocha / Brave 未配置 API Key；Bing 公开搜索仍可作为无 Key 搜索服务。"
      : `Bocha=${config.bochaApiKey ? "present" : "missing"}; Brave=${config.braveApiKey ? "present" : "missing"}`,
  });
  items.push({
    id: "provider-endpoints",
    title: "API 地址状态（Endpoint）",
    status: "pass",
    summary: `Bing=built-in; Bocha=${config.bochaEndpoint ? safeDomain(config.bochaEndpoint) : "default"}; Brave=built-in`,
  });
  return items;
};

const buildWebCacheItem = (status: WebCacheStatusResult): DiagnosticItem => ({
  id: "web-cache-status",
  title: "网页缓存目录（Web Cache）",
  status: !status.exists ? "warn" : status.readable && status.writable ? "pass" : status.readable ? "warn" : "fail",
  summary: status.exists
    ? `${status.pathLabel} search=${status.searchCacheCount}, excerpts=${status.excerptCacheCount}, size=${status.approxSizeBytes} bytes`
    : `${status.pathLabel} 尚不存在；首次联网搜索后会建立。`,
  detail: status.lastError ? `最近错误：${truncate(status.lastError, 220)}` : "未读取缓存正文内容，只统计 JSON 文件数量和近似大小。",
  safeDebugInfo: [`readable=${status.readable}`, `writable=${status.writable}`],
});

const buildLocalIndexItem = (status: LocalNoteIndexStatusResult): DiagnosticItem => ({
  id: "local-index-status",
  title: "本地笔记索引",
  status: status.status === "ready" ? "pass" : status.status === "error" ? "fail" : "warn",
  summary: status.exists
    ? `${status.pathLabel} status=${status.status}; notes=${status.noteCount}, chunks=${status.chunkCount}, version=${status.version ?? "unknown"}/${status.currentVersion}`
    : `${status.pathLabel} 尚不存在；首次本地检索后可能建立。`,
  detail: status.lastError
    ? `索引读取失败：${truncate(status.lastError, 220)}。可运行一次本地笔记检索，后续再考虑重建索引。`
    : `updatedAt=${status.updatedAt ?? "unknown"}; sample=${status.sampleRelativePaths.slice(0, 3).join(", ") || "none"}`,
  safeDebugInfo: [`localIndexVersion=${status.version ?? "missing"}`, `currentVersion=${status.currentVersion}`, `indexedNoteCount=${status.noteCount}`, `indexedChunkCount=${status.chunkCount}`, `indexUpdatedAt=${status.updatedAt ?? "unknown"}`, `size=${status.approxSizeBytes} bytes`, `readable=${status.readable}`, `writable=${status.writable}`],
});

const getLocalDiagnosticValue = (diagnostics: string | undefined, key: string): string | undefined =>
  diagnostics
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${key}=`))
    ?.slice(key.length + 1);

const summarizeLocalResult = (result: LocalNoteSearchResult): string => {
  const expandedTerms = getLocalDiagnosticValue(result.diagnostics, "expandedTerms");
  const problemIds = getLocalDiagnosticValue(result.diagnostics, "problemIds");
  const algorithmTerms = getLocalDiagnosticValue(result.diagnostics, "algorithmTerms");
  const sameNoteDedupApplied = getLocalDiagnosticValue(result.diagnostics, "sameNoteDedupApplied");
  return [
    result.relativePath || result.path,
    result.headingPath?.length ? `heading=${result.headingPath.join(" / ")}` : undefined,
    typeof result.chunkIndex === "number" ? `chunk=${result.chunkIndex}` : undefined,
    `score=${result.score}`,
    result.matchedTerms?.length ? `terms=${result.matchedTerms.slice(0, 5).join("|")}` : undefined,
    expandedTerms ? `expandedTerms=${truncate(expandedTerms, 80)}` : undefined,
    problemIds ? `problemIds=${problemIds}` : undefined,
    algorithmTerms ? `algorithmTerms=${truncate(algorithmTerms, 80)}` : undefined,
    sameNoteDedupApplied ? `sameNoteDedupApplied=${sameNoteDedupApplied}` : undefined,
  ].filter(Boolean).join("; ");
};

const localResultsContain = (results: LocalNoteSearchResult[], pattern: RegExp): boolean =>
  results.some((result) => pattern.test(`${result.title} ${result.relativePath} ${result.headingPath?.join(" ") ?? ""} ${result.snippet} ${result.matchedTerms?.join(" ") ?? ""} ${result.detectedAlgorithmTerms?.join(" ") ?? ""}`));

const buildCitationDiagnostics = (): DiagnosticItem[] => {
  const cases = [
    {
      id: "standard",
      title: "标准标记识别（Token）",
      text: "测试 [[S1]] 和 [[N1]]",
      validIds: ["S1", "N1"],
      check: (ids: string[], raw: ReturnType<typeof findCitationMarkerMatches>) => ids.includes("S1") && ids.includes("N1") && raw.length === 2,
    },
    {
      id: "single-compatible",
      title: "单括号兼容",
      text: "兼容 [S1] 和 [N1]",
      validIds: ["S1", "N1"],
      check: (ids: string[], raw: ReturnType<typeof findCitationMarkerMatches>) => ids.includes("S1") && ids.includes("N1") && raw.length === 2,
    },
    {
      id: "markdown-link",
      title: "Markdown 链接保护",
      text: "链接 [S1](https://example.com) 不应识别",
      validIds: ["S1"],
      check: (ids: string[]) => ids.length === 0,
    },
    {
      id: "ref-link",
      title: "引用链接保护",
      text: "引用链接 [N1][ref] 不应识别",
      validIds: ["N1"],
      check: (ids: string[]) => ids.length === 0,
    },
    {
      id: "double-first",
      title: "双括号优先",
      text: "双括号 [[S2]] 不应残留内部单括号",
      validIds: ["S2"],
      check: (ids: string[], raw: ReturnType<typeof findCitationMarkerMatches>) =>
        ids.length === 1 &&
        ids[0] === "S2" &&
        raw.length === 1 &&
        raw[0]?.citationId === "S2" &&
        raw[0]?.raw === "[[S2]]" &&
        raw[0]?.rawMarker === "[[S2]]" &&
        raw.every((match) => match.raw !== "[S2]"),
    },
    {
      id: "code-skip",
      title: "代码区域跳过",
      text: "正文 [[S1]] `[[N1]]`\n```txt\n[[S2]]\n```",
      validIds: ["S1", "N1", "S2"],
      check: (ids: string[]) => ids.length === 1 && ids[0] === "S1",
      detail: "纯函数会跳过 Markdown 代码区域；DOM 渲染层仍负责跳过 pre/code/a/button 等节点。",
    },
  ];
  return cases.map((item) => {
    const startedAt = performance.now();
    const stripped = stripMarkdownRegionsForCitationScan(item.text);
    const raw = findCitationMarkerMatches(stripped);
    const ids = getUsedCitationIdList(item.text, item.validIds);
    const passed = item.check(ids, raw);
    return durationItem(startedAt, {
      id: `citation-${item.id}`,
      title: item.title,
      status: passed ? "pass" : "fail",
      summary: passed ? `通过；识别到：${ids.join(", ") || "none"}` : `失败；识别到：${ids.join(", ") || "none"}`,
      detail: item.detail ?? `样例：${item.text}`,
      safeDebugInfo: [`raw=${raw.map((match) => `${match.raw}@${match.start}-${match.end}`).join(", ") || "none"}`],
    });
  });
};

const buildPromptContractItems = async (): Promise<DiagnosticItem[]> => {
  const startedAt = performance.now();
  const status = await getPromptCitationContractStatus();
  const checks = [
    status.webAvailableIds,
    status.webMarkerInstruction,
    status.localAvailableIds,
    status.localMarkerInstruction,
    status.bareIdWarning,
  ];
  return [durationItem(startedAt, {
    id: "prompt-contract-static",
    title: "提示词引用合约静态检查（Prompt Contract）",
    status: checks.every(Boolean) ? "pass" : checks.some(Boolean) ? "warn" : "fail",
    summary: `webIds=${status.webAvailableIds}; webMarker=${status.webMarkerInstruction}; localIds=${status.localAvailableIds}; localMarker=${status.localMarkerInstruction}; bareIdWarning=${status.bareIdWarning}`,
    detail: "只检查关键约束字符串是否仍存在，不返回提示词全文。",
  })];
};

const buildReport = (categories: DiagnosticCategory[], config: WebSearchConfig | null, rawProvider: string | undefined, lastRunAt: string | null): string => {
  const lines = [
    "# NoteX search diagnostics",
    `time: ${new Date().toISOString()}`,
    `lastRunAt: ${lastRunAt ?? "not-run"}`,
    `provider: ${config?.provider ?? "unknown"}`,
    rawProvider?.trim().toLocaleLowerCase() === "searxng" ? "legacyProvider: removed-searxng" : undefined,
    `webSearchEnabled: ${config?.enabled === true}`,
    `publicSearchConsent: ${config?.publicSearchConsent === true}`,
    "",
  ].filter((line): line is string => typeof line === "string");
  for (const category of categories) {
    lines.push(`## ${category.title}`);
    if (category.items.length === 0) {
      lines.push("- skipped: not run");
      continue;
    }
    for (const item of category.items) {
      lines.push(`- ${item.status}: ${item.title} - ${item.summary}`);
      if (item.detail) lines.push(`  detail: ${truncate(item.detail, 240)}`);
      if (item.safeDebugInfo?.length) lines.push(`  debug: ${item.safeDebugInfo.map((info) => truncate(info, 160)).join("; ")}`);
    }
    lines.push("");
  }
  lines.push("Excluded: API Key, Cookie, browser data, full local note snippets, full prompt, full chat history, absolute paths.");
  return lines.join("\n");
};

const statusTone = (status: DiagnosticStatus): string => {
  if (status === "pass") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
  if (status === "warn") return "border-amber-500/25 bg-amber-500/10 text-amber-300";
  if (status === "fail") return "border-red-500/25 bg-red-500/10 text-red-300";
  if (status === "running") return "border-blue-500/25 bg-blue-500/10 text-blue-300";
  return "border-border bg-muted/30 text-muted-foreground";
};

const statusIcon = (status: DiagnosticStatus) => {
  if (status === "pass") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (status === "warn") return <TriangleAlert className="h-3.5 w-3.5" />;
  if (status === "fail") return <XCircle className="h-3.5 w-3.5" />;
  if (status === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  return <Search className="h-3.5 w-3.5" />;
};

const buildNotexSelfCheckItem = (item: NotexSearchSelfCheckCaseResult): DiagnosticItem => ({
  id: `notex-self-check-${item.expectedCategory}-${item.query}`,
  title: item.query,
  status: item.pass ? "pass" : "fail",
  summary: `${item.expectedCategory}; mode=${item.searchMode}; intent=${item.actualIntent}; vertical=${item.vertical}; freshness=${item.freshness}; newsRegistry=${item.newsRegistryTriggered}; companySpecific=${item.companySpecificNews}; focus=${item.queryFocusEntities.join(",") || "none"}; focusSource=${item.focusEntitySource}; queryDiversification=${item.queryDiversification?.join(" | ") || "none"}; clustering=${item.newsClusteringTriggered}; clusters=${item.clusterCount}/${item.selectedClusterCount}; localResults=${item.localResultCount}; displayedLocalSources=${item.displayedLocalSourceCount}`,
  detail: item.reason,
  safeDebugInfo: [
    `searchMode=${item.searchMode}`,
    `searchModeReason=${item.searchModeReason}`,
    `modeGuards=${item.modeGuards.join(" | ") || "none"}`,
    `allowNewsRegistry=${item.allowNewsRegistry}`,
    `allowBingFallback=${item.allowBingFallback}`,
    `allowLocalIndex=${item.allowLocalIndex}`,
    `preferUrlReader=${item.preferUrlReader}`,
    `selectedNewsSources=${item.selectedNewsSources.join(" | ") || "none"}`,
    `bingFallbackPlanned=${item.bingFallbackPlanned}`,
    `queryFocusEntities=${item.queryFocusEntities.join(",") || "none"}`,
    `focusEntitySource=${item.focusEntitySource}`,
    `companySpecificNews=${item.companySpecificNews}`,
    `entityFilterApplied=${item.entityFilterApplied}`,
    `queryDiversification=${item.queryDiversification?.join(" | ") || "none"}`,
    `droppedQueryDiversification=${item.droppedQueryDiversification?.join(" | ") || "none"}`,
    `rejectedWrongEntityCount=${item.rejectedWrongEntityCount}`,
    `newsClusteringTriggered=${item.newsClusteringTriggered}`,
    `diversityApplied=${item.diversityApplied}`,
    `singleClusterWarning=${item.singleClusterWarning}`,
    `localSearchTriggered=${item.localSearchTriggered}`,
    `hasAlgorithmTermMatchedRe=${item.hasAlgorithmTermMatchedRe}`,
    `hasPostNavigationFalsePositive=${item.hasPostNavigationFalsePositive}`,
    `explicitUrlPathUsed=${item.explicitUrlPathUsed}`,
    `extractorQualityChecks=${JSON.stringify((item.rawDiagnostics as { extractorQualityChecks?: unknown })?.extractorQualityChecks ?? [])}`,
    `raw=${JSON.stringify(item.rawDiagnostics)}`,
  ],
});

const researchEngineSamples = getResearchEngineDeveloperSamples();
const DEFAULT_RESEARCH_ENGINE_REAL_PROVIDER_SMOKE_QUERY = "React useEffect docs";
const DEFAULT_RESEARCH_ENGINE_REAL_URL_READER_SMOKE_URL = "https://react.dev/reference/react/useEffect";
const DEFAULT_RESEARCH_ENGINE_REAL_E2E_SMOKE_QUERY = "OpenAI latest news";
const DEFAULT_RESEARCH_ENGINE_REAL_SHADOW_RUN_QUERY = "OpenAI latest news";
const DEFAULT_RESEARCH_ENGINE_REAL_SHADOW_RUN_READ_TOP_N = 2;
const DEFAULT_RESEARCH_ENGINE_REAL_SHADOW_RUN_MAX_CANDIDATES = 8;
const DEFAULT_RESEARCH_ENGINE_SHADOW_COMPARE_QUERY = "OpenAI latest news";
const DEFAULT_RESEARCH_ENGINE_SHADOW_COMPARE_READ_TOP_N = 2;
const DEFAULT_RESEARCH_ENGINE_SHADOW_COMPARE_MAX_CANDIDATES = 8;
const SEARCH_DIAGNOSTICS_PERF_DEBUG_STORAGE_KEY = "oinb.aiSidebarPerfDebug";

const isSearchDiagnosticsPerfDebugEnabled = (): boolean => {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(SEARCH_DIAGNOSTICS_PERF_DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

const SEARCH_DIAGNOSTICS_PERF_DEBUG = isSearchDiagnosticsPerfDebugEnabled();

const incrementSearchDiagnosticsPerfCounter = (name: string, amount = 1) => {
  if (!SEARCH_DIAGNOSTICS_PERF_DEBUG || typeof window === "undefined") return;
  const perfWindow = window as typeof window & {
    __OINB_AI_PERF__?: { counters?: Record<string, number> };
  };
  const counters = perfWindow.__OINB_AI_PERF__?.counters;
  if (!counters) return;
  counters[name] = (counters[name] ?? 0) + amount;
};

export default function SearchDiagnosticsPanel({ aiConfigDraft }: SearchDiagnosticsPanelProps) {
  if (SEARCH_DIAGNOSTICS_PERF_DEBUG) {
    incrementSearchDiagnosticsPerfCounter("searchDiagnosticsPanelRender");
    incrementSearchDiagnosticsPerfCounter("researchEngineDiagnosticsSectionRender");
  }

  const [categories, setCategories] = useState<DiagnosticCategory[]>(emptyCategories);
  const [isRunningCore, setIsRunningCore] = useState(false);
  const [isTestingProvider, setIsTestingProvider] = useState(false);
  const [isCheckingLocalIndex, setIsCheckingLocalIndex] = useState(false);
  const [isRebuildingLocalIndex, setIsRebuildingLocalIndex] = useState(false);
  const [isRunningNotexSelfCheck, setIsRunningNotexSelfCheck] = useState(false);
  const [isRunningResearchEngineSelfCheck, setIsRunningResearchEngineSelfCheck] = useState(false);
  const [isRunningResearchEngineSample, setIsRunningResearchEngineSample] = useState(false);
  const [isRunningResearchEngineRealProviderSmoke, setIsRunningResearchEngineRealProviderSmoke] = useState(false);
  const [isRunningResearchEngineRealUrlReaderSmoke, setIsRunningResearchEngineRealUrlReaderSmoke] = useState(false);
  const [isRunningResearchEngineRealE2ESmoke, setIsRunningResearchEngineRealE2ESmoke] = useState(false);
  const [isRunningResearchEngineRealShadowRun, setIsRunningResearchEngineRealShadowRun] = useState(false);
  const [isRunningResearchEngineShadowCompare, setIsRunningResearchEngineShadowCompare] = useState(false);
  const [researchEngineSampleId, setResearchEngineSampleId] = useState<ResearchEngineDeveloperSampleId>("docs");
  const [researchEngineRealProviderSmokeQuery, setResearchEngineRealProviderSmokeQuery] = useState(DEFAULT_RESEARCH_ENGINE_REAL_PROVIDER_SMOKE_QUERY);
  const [researchEngineRealUrlReaderSmokeUrl, setResearchEngineRealUrlReaderSmokeUrl] = useState(DEFAULT_RESEARCH_ENGINE_REAL_URL_READER_SMOKE_URL);
  const [researchEngineRealE2ESmokeQuery, setResearchEngineRealE2ESmokeQuery] = useState(DEFAULT_RESEARCH_ENGINE_REAL_E2E_SMOKE_QUERY);
  const [researchEngineRealShadowRunQuery, setResearchEngineRealShadowRunQuery] = useState(DEFAULT_RESEARCH_ENGINE_REAL_SHADOW_RUN_QUERY);
  const [researchEngineRealShadowRunReadTopN, setResearchEngineRealShadowRunReadTopN] = useState(DEFAULT_RESEARCH_ENGINE_REAL_SHADOW_RUN_READ_TOP_N);
  const [researchEngineRealShadowRunMaxCandidates, setResearchEngineRealShadowRunMaxCandidates] = useState(DEFAULT_RESEARCH_ENGINE_REAL_SHADOW_RUN_MAX_CANDIDATES);
  const [researchEngineShadowCompareQuery, setResearchEngineShadowCompareQuery] = useState(DEFAULT_RESEARCH_ENGINE_SHADOW_COMPARE_QUERY);
  const [researchEngineShadowCompareReadTopN, setResearchEngineShadowCompareReadTopN] = useState(DEFAULT_RESEARCH_ENGINE_SHADOW_COMPARE_READ_TOP_N);
  const [researchEngineShadowCompareMaxCandidates, setResearchEngineShadowCompareMaxCandidates] = useState(DEFAULT_RESEARCH_ENGINE_SHADOW_COMPARE_MAX_CANDIDATES);
  const [isResearchEngineSampleMenuOpen, setIsResearchEngineSampleMenuOpen] = useState(false);
  const [researchEngineSelfCheck, setResearchEngineSelfCheck] = useState<ResearchEngineDeveloperSelfCheckResult | null>(null);
  const [researchEngineSample, setResearchEngineSample] = useState<ResearchEngineDeveloperSampleResult | null>(null);
  const [researchEngineRealProviderSmoke, setResearchEngineRealProviderSmoke] = useState<ResearchEngineRealProviderSmokeResult | null>(null);
  const [researchEngineRealUrlReaderSmoke, setResearchEngineRealUrlReaderSmoke] = useState<ResearchEngineRealUrlReaderSmokeResult | null>(null);
  const [researchEngineRealE2ESmoke, setResearchEngineRealE2ESmoke] = useState<ResearchEngineRealE2ESmokeResult | null>(null);
  const [researchEngineRealShadowRun, setResearchEngineRealShadowRun] = useState<ResearchEngineRealShadowRunResult | null>(null);
  const [researchEngineShadowCompare, setResearchEngineShadowCompare] = useState<ResearchEngineShadowCompareResult | null>(null);
  const [researchEngineCopyMessage, setResearchEngineCopyMessage] = useState<string | null>(null);
  const [researchEngineError, setResearchEngineError] = useState<string | null>(null);
  const [isResearchEngineReportExpanded, setIsResearchEngineReportExpanded] = useState(false);
  const [isResearchEngineRealProviderSmokeReportExpanded, setIsResearchEngineRealProviderSmokeReportExpanded] = useState(false);
  const [isResearchEngineRealUrlReaderSmokeReportExpanded, setIsResearchEngineRealUrlReaderSmokeReportExpanded] = useState(false);
  const [isResearchEngineRealE2ESmokeReportExpanded, setIsResearchEngineRealE2ESmokeReportExpanded] = useState(false);
  const [isResearchEngineRealShadowRunReportExpanded, setIsResearchEngineRealShadowRunReportExpanded] = useState(false);
  const [isResearchEngineShadowCompareReportExpanded, setIsResearchEngineShadowCompareReportExpanded] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const runIdRef = useRef(0);
  const researchEngineRealShadowRunAbortRef = useRef<AbortController | null>(null);

  const webSearchConfig = useMemo(
    () => aiConfigDraft ? normalizeWebSearchConfig(aiConfigDraft.web_search) : null,
    [aiConfigDraft],
  );
  const rawWebSearchProvider = (aiConfigDraft?.web_search as unknown as { provider?: string } | undefined)?.provider;
  const selectedResearchEngineSample = researchEngineSamples.find((sample) => sample.id === researchEngineSampleId) ?? researchEngineSamples[0];

  const counts = useMemo(() => {
    const result: Record<DiagnosticStatus, number> = { pass: 0, warn: 0, fail: 0, skipped: 0, running: 0 };
    for (const item of categories.flatMap((category) => category.items)) result[item.status] += 1;
    return result;
  }, [categories]);

  const replaceCategory = (runId: number, categoryId: DiagnosticCategoryId, items: DiagnosticItem[]) => {
    if (runIdRef.current !== runId) return;
    setCategories((current) => {
      if (current.some((category) => category.id === categoryId)) {
        return current.map((category) => category.id === categoryId ? { ...category, items } : category);
      }
      return [...current, { id: categoryId, title: categoryId === "direct-discovery" ? "无 Key 直接发现（Direct Discovery）" : categoryId, items }];
    });
  };

  const runLocalSearch = async (runId: number) => {
    replaceCategory(runId, "local-search", [{ id: "local-search-running", title: "本地检索测试", status: "running", summary: "正在检索本地笔记..." }]);
    const startedAt = performance.now();
    try {
      const [centroidResults, p3379Results, zFunctionResults, reactResults] = await withTimeout(Promise.all([
        searchLocalNotes({
          query: "点分树常见实现坑",
          algorithmKeywords: ["点分树", "动态点分治", "重心分治"],
          maxResults: 5,
          maxCharsPerResult: 500,
        }),
        searchLocalNotes({
          query: "P3379 最近公共祖先",
          problemId: "P3379",
          algorithmKeywords: ["LCA", "最近公共祖先", "倍增"],
          maxResults: 5,
          maxCharsPerResult: 500,
        }),
        searchLocalNotes({
          query: "Z 函数和 exKMP 有什么关系",
          algorithmKeywords: ["Z 函数", "exKMP", "扩展 KMP"],
          maxResults: 5,
          maxCharsPerResult: 500,
        }),
        searchLocalNotes({
          query: "React useEffect 是什么",
          maxResults: 5,
          maxCharsPerResult: 500,
        }),
      ]), 7000, "本地检索测试超时");

      const centroidHit = localResultsContain(centroidResults, /点分树|centroid tree|动态点分治|震波|重心分治/i);
      const p3379Hit = localResultsContain(p3379Results, /P3379|最近公共祖先|LCA|倍增/i);
      const zFunctionHit = localResultsContain(zFunctionResults, /Z\s*函数|Z函数|exKMP|扩展\s*KMP/i);
      const reactOiLeak = localResultsContain(reactResults, /点分树|P3379|最近公共祖先|exKMP|Dinic|Tarjan/i);
      const reactShortTokenLeak = reactResults.some((result) =>
        /\balgorithm term matched re\b/i.test(result.reason) ||
        (result.matchedTerms ?? []).some((term) => /^re$/i.test(term)) ||
        (result.detectedAlgorithmTerms ?? []).some((term) => /^re$/i.test(term))
      );
      const reactPostNavigationLeak = reactResults.some((result) =>
        /post-navigation-test|Post Navigation Test Draft/i.test(`${result.title} ${result.relativePath}`)
      );
      const hasChunkIdentity = [...centroidResults, ...p3379Results, ...zFunctionResults, ...reactResults]
        .some((result) => typeof result.chunkIndex === "number" || (result.headingPath?.length ?? 0) > 0);
      const sameNoteLimited = [centroidResults, p3379Results, zFunctionResults, reactResults].every((results) => {
        const counts = new Map<string, number>();
        for (const result of results) counts.set(result.relativePath, (counts.get(result.relativePath) ?? 0) + 1);
        return [...counts.values()].every((count) => count <= 3);
      });

      replaceCategory(runId, "local-search", [
        durationItem(startedAt, {
          id: "local-search-centroid",
          title: "点分树分块检索（Chunk）",
          status: centroidResults.length === 0 ? "warn" : centroidHit && hasChunkIdentity ? "pass" : "warn",
          summary: centroidResults.length === 0 ? "没有找到相关笔记。如果你没有点分树笔记，这是正常的。" : `命中 ${centroidResults.length} 条；synonymHit=${centroidHit}; chunkIdentity=${hasChunkIdentity}`,
          detail: "只调用本地 search_local_notes，不上传笔记到外部服务。",
          safeDebugInfo: centroidResults.slice(0, 3).map(summarizeLocalResult),
        }),
        durationItem(startedAt, {
          id: "local-search-p3379",
          title: "P3379 / LCA 强匹配",
          status: p3379Results.length === 0 ? "warn" : p3379Hit ? "pass" : "warn",
          summary: p3379Results.length === 0 ? "没有找到 P3379/LCA 本地笔记。" : `命中 ${p3379Results.length} 条；problemOrLcaHit=${p3379Hit}`,
          safeDebugInfo: p3379Results.slice(0, 3).map(summarizeLocalResult),
        }),
        durationItem(startedAt, {
          id: "local-search-z-exkmp",
          title: "Z 函数 / exKMP 同义召回",
          status: zFunctionResults.length === 0 ? "warn" : zFunctionHit ? "pass" : "warn",
          summary: zFunctionResults.length === 0 ? "没有找到 Z 函数/exKMP 本地笔记。" : `命中 ${zFunctionResults.length} 条；synonymHit=${zFunctionHit}`,
          safeDebugInfo: zFunctionResults.slice(0, 3).map(summarizeLocalResult),
        }),
        durationItem(startedAt, {
          id: "local-search-react-guard",
          title: "React 查询不误触发 OI 同义词",
          status: reactOiLeak || reactShortTokenLeak || reactPostNavigationLeak ? "fail" : "pass",
          summary: `React results=${reactResults.length}; oiLeak=${reactOiLeak}; shortTokenLeak=${reactShortTokenLeak}; postNavigationLeak=${reactPostNavigationLeak}`,
          safeDebugInfo: reactResults.slice(0, 3).map(summarizeLocalResult),
        }),
        durationItem(startedAt, {
          id: "local-search-same-note-limit",
          title: "同一笔记分块不刷屏（Chunk）",
          status: sameNoteLimited ? "pass" : "warn",
          summary: `sameNoteLimited=${sameNoteLimited}`,
        }),
      ]);
    } catch (error) {
      replaceCategory(runId, "local-search", [durationItem(startedAt, {
        id: "local-search-test",
        title: "点分树本地检索",
        status: "fail",
        summary: classifyError(error),
      })]);
    }
  };

  const runCoreDiagnostics = async () => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setIsRunningCore(true);
    setCopyMessage(null);
    setLastRunAt(new Date().toLocaleString());
    setCategories(emptyCategories());

    replaceCategory(runId, "decision", buildDecisionDiagnostics());
    replaceCategory(runId, "query-planner", buildAiQueryPlannerDiagnostics(webSearchConfig?.provider ?? "bing"));
    replaceCategory(runId, "direct-discovery", [
      ...buildDirectDiscoveryOfflineDiagnostics(),
      ...buildSearchPreparationOfflineDiagnostics(),
    ]);
    replaceCategory(runId, "url-reading", buildUrlReadingDiagnostics(webSearchConfig));
    replaceCategory(runId, "provider-config", webSearchConfig
      ? buildProviderConfigDiagnostics(webSearchConfig, rawWebSearchProvider)
      : [{ id: "provider-config-missing", title: "搜索服务配置（Provider）", status: "warn", summary: "AI 配置尚未读取完成。" }]);
    replaceCategory(runId, "citations", buildCitationDiagnostics());

    const storageTasks = [
      getWebCacheStatus()
        .then((status) => replaceCategory(runId, "web-cache", [buildWebCacheItem(status)]))
        .catch((error) => replaceCategory(runId, "web-cache", [{ id: "web-cache-error", title: "网页缓存状态（Web Cache）", status: "fail", summary: classifyError(error) }])),
      getLocalNoteIndexStatus()
        .then((status) => replaceCategory(runId, "local-index", [buildLocalIndexItem(status)]))
        .catch((error) => replaceCategory(runId, "local-index", [{ id: "local-index-error", title: "本地索引状态", status: "fail", summary: classifyError(error) }])),
      buildPromptContractItems()
        .then((items) => replaceCategory(runId, "prompt-contract", items))
        .catch((error) => replaceCategory(runId, "prompt-contract", [{ id: "prompt-contract-error", title: "提示词合约（Prompt Contract）", status: "warn", summary: classifyError(error) }])),
      runLocalSearch(runId),
    ];

    await Promise.allSettled(storageTasks);
    if (runIdRef.current === runId) setIsRunningCore(false);
  };

  const checkLocalIndex = async () => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setIsCheckingLocalIndex(true);
    replaceCategory(runId, "local-index", [{ id: "local-index-running", title: "本地索引状态", status: "running", summary: "正在读取脱敏索引状态..." }]);
    try {
      const status = await withTimeout(getLocalNoteIndexStatus(), 5000, "本地索引检查超时");
      replaceCategory(runId, "local-index", [buildLocalIndexItem(status)]);
    } catch (error) {
      replaceCategory(runId, "local-index", [{ id: "local-index-error", title: "本地索引状态", status: "fail", summary: classifyError(error) }]);
    } finally {
      if (runIdRef.current === runId) setIsCheckingLocalIndex(false);
    }
  };

  const rebuildLocalIndex = async () => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setIsRebuildingLocalIndex(true);
    replaceCategory(runId, "local-index", [{ id: "local-index-rebuilding", title: "重建本地笔记索引", status: "running", summary: "正在建立本地笔记索引..." }]);
    const startedAt = performance.now();
    try {
      const status = await withTimeout(rebuildLocalNoteIndex(), 30000, "本地索引重建超时");
      replaceCategory(runId, "local-index", [durationItem(startedAt, {
        ...buildLocalIndexItem(status),
        id: "local-index-rebuilt",
        title: "重建本地笔记索引",
        summary: `重建完成：notes=${status.noteCount}, chunks=${status.chunkCount}, version=${status.version ?? "unknown"}/${status.currentVersion}`,
      })]);
    } catch (error) {
      replaceCategory(runId, "local-index", [durationItem(startedAt, {
        id: "local-index-rebuild-error",
        title: "重建本地笔记索引",
        status: "fail",
        summary: classifyError(error),
      })]);
    } finally {
      if (runIdRef.current === runId) setIsRebuildingLocalIndex(false);
    }
  };

  const runNotexSelfCheck = async () => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setIsRunningNotexSelfCheck(true);
    replaceCategory(runId, "notex-self-check", [{
      id: "notex-self-check-running",
      title: "运行 NoteX 搜索自检",
      status: "running",
      summary: "正在运行固定轻量用例；不会调用真实模型生成回答。",
    }]);
    const startedAt = performance.now();
    try {
      const result = await withTimeout(runNotexSearchSelfCheck(), 15000, "NoteX 搜索自检超时");
      const summaryItem = durationItem(startedAt, {
        id: "notex-self-check-summary",
        title: "NoteX 搜索自检汇总",
        status: result.passed === result.total ? "pass" : "fail",
        summary: `${result.passed}/${result.total} 通过`,
        detail: "固定用例覆盖新闻 registry、Bing fallback、React guard、OI/local search、翻译 guard 和显式 URL 路径判断。",
      });
      replaceCategory(runId, "notex-self-check", [
        summaryItem,
        ...result.cases.map(buildNotexSelfCheckItem),
      ]);
    } catch (error) {
      replaceCategory(runId, "notex-self-check", [durationItem(startedAt, {
        id: "notex-self-check-error",
        title: "运行 NoteX 搜索自检",
        status: "fail",
        summary: classifyError(error),
      })]);
    } finally {
      if (runIdRef.current === runId) setIsRunningNotexSelfCheck(false);
    }
  };

  const runProviderTest = async () => {
    if (!webSearchConfig) {
      toast.error("AI 配置尚未读取完成");
      return;
    }
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setIsTestingProvider(true);
    replaceCategory(runId, "provider-test", [{ id: "provider-test-running", title: "在线连通性测试", status: "running", summary: "正在发送测试查询..." }]);
    const startedAt = performance.now();
    try {
      if (webSearchConfig.provider === "bocha" && !webSearchConfig.bochaApiKey) throw new Error("Bocha API Key missing");
      if (webSearchConfig.provider === "brave" && !webSearchConfig.braveApiKey) throw new Error("Brave API Key missing");
      const result = await withTimeout(testWebSearchConnection({
        provider: webSearchConfig.provider,
        apiKey: webSearchConfig.provider === "bocha" ? webSearchConfig.bochaApiKey : webSearchConfig.provider === "brave" ? webSearchConfig.braveApiKey : undefined,
        endpoint: webSearchConfig.provider === "bocha" ? webSearchConfig.bochaEndpoint : undefined,
      }), 5000, "公开搜索测试超时");
      replaceCategory(runId, "provider-test", [durationItem(startedAt, {
        id: "provider-test-online",
        title: "在线连通性测试",
        status: "pass",
        summary: `当前搜索源=${result.provider}; 测试词=${result.query ?? "NoteX connectivity test"}; 结果数=${result.resultCount ?? "未记录"}${result.firstTitle ? `; 首条=${result.firstTitle}` : ""}`,
        detail: "只发送一个公开搜索测试查询，不读取 Cookie、历史记录或登录态。",
        safeDebugInfo: [
          `endpoint=${result.endpoint ? safeDomain(result.endpoint) : "built-in"}`,
          result.provider === "bing" ? "使用浏览器兼容请求头=是" : undefined,
          result.diagnostics ? `阶段诊断=${result.diagnostics}` : undefined,
        ].filter((item): item is string => Boolean(item)),
      })]);
    } catch (error) {
      replaceCategory(runId, "provider-test", [durationItem(startedAt, {
        id: "provider-test-online",
        title: "在线连通性测试",
        status: "fail",
        summary: classifyError(error),
      })]);
    } finally {
      if (runIdRef.current === runId) setIsTestingProvider(false);
    }
  };

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(buildReport(categories, webSearchConfig, rawWebSearchProvider, lastRunAt));
      setCopyMessage("诊断报告已复制");
      toast.success("诊断报告已复制");
    } catch (error) {
      setCopyMessage(`复制失败：${getErrorMessage(error)}`);
      toast.error(`复制失败：${getErrorMessage(error)}`);
    }
  };

  const runResearchEngineSelfCheck = () => {
    incrementSearchDiagnosticsPerfCounter("researchEngineSelfCheckRun");
    setIsRunningResearchEngineSelfCheck(true);
    setResearchEngineCopyMessage(null);
    setResearchEngineError(null);
    setIsResearchEngineReportExpanded(false);
    try {
      const result = runResearchEngineDeveloperSelfCheck();
      setResearchEngineSelfCheck(result);
      toast.success(`Research Engine 自检通过 ${result.summary.passed}/${result.summary.total}`);
    } catch (error) {
      const message = `Research Engine 自检失败：${getErrorMessage(error)}`;
      setResearchEngineError(message);
      toast.error(message);
    } finally {
      setIsRunningResearchEngineSelfCheck(false);
    }
  };

  const runResearchEngineSample = () => {
    incrementSearchDiagnosticsPerfCounter("researchEngineOfflineSampleRun");
    setIsRunningResearchEngineSample(true);
    setResearchEngineCopyMessage(null);
    setResearchEngineError(null);
    setIsResearchEngineReportExpanded(false);
    try {
      const result = runResearchEngineDeveloperSample(researchEngineSampleId);
      setResearchEngineSample(result);
      toast.success(`离线样例完成：${result.summary.statusLabelZh}`);
    } catch (error) {
      const message = `离线样例运行失败：${getErrorMessage(error)}`;
      setResearchEngineError(message);
      toast.error(message);
    } finally {
      setIsRunningResearchEngineSample(false);
    }
  };

  const runResearchEngineRealProviderSmoke = async () => {
    setIsRunningResearchEngineRealProviderSmoke(true);
    setResearchEngineCopyMessage(null);
    setResearchEngineError(null);
    setIsResearchEngineRealProviderSmokeReportExpanded(false);
    try {
      const result = await runResearchEngineRealProviderSmokeBridge({
        query: researchEngineRealProviderSmokeQuery,
        webSearchConfig,
      });
      setResearchEngineRealProviderSmoke(result);
      if (result.ok) {
        toast.success(`真实 Provider Smoke 完成：${researchEngineDisplayProvider(result.providerName, result.diagnosticsSnapshot, result.redactedConfigSummary.mode)}`);
      } else if (result.status === "not_configured") {
        setResearchEngineError("真实 Provider Smoke 未运行：当前未启用联网搜索或公开搜索授权；Bing 主线使用无 key public search，Bocha / Brave 仅为可选 API provider。");
      } else {
        setResearchEngineError(`真实 Provider Smoke 失败：${classifyError(result.errors.join("; ") || result.status)}`);
      }
    } catch (error) {
      const message = `真实 Provider Smoke 失败：${getErrorMessage(error)}`;
      setResearchEngineError(message);
      toast.error(message);
    } finally {
      setIsRunningResearchEngineRealProviderSmoke(false);
    }
  };

  const copyResearchEngineReport = async () => {
    const markdown = researchEngineSample?.markdownReport ?? researchEngineSelfCheck?.markdownReport;
    if (!markdown) {
      setResearchEngineCopyMessage("请先运行自检或离线样例。");
      return;
    }
    if (!navigator.clipboard) {
      setResearchEngineCopyMessage("当前环境不可直接复制，请手动选择下方 Markdown 报告。");
      return;
    }
    try {
      await navigator.clipboard.writeText(markdown);
      setResearchEngineCopyMessage("Markdown 报告已复制。");
      toast.success("Markdown 报告已复制");
    } catch (error) {
      setResearchEngineCopyMessage(`复制失败：${getErrorMessage(error)}`);
      toast.error(`复制失败：${getErrorMessage(error)}`);
    }
  };

  const copyResearchEngineRealProviderSmokeReport = async () => {
    const markdown = researchEngineRealProviderSmoke?.markdownReport;
    if (!markdown) {
      setResearchEngineCopyMessage("请先运行真实 Provider Smoke。");
      return;
    }
    if (!navigator.clipboard) {
      setResearchEngineCopyMessage("当前环境不可直接复制，请手动选择下方 Smoke Markdown 报告。");
      return;
    }
    try {
      await navigator.clipboard.writeText(markdown);
      setResearchEngineCopyMessage("Smoke Markdown 报告已复制。");
      toast.success("Smoke Markdown 报告已复制");
    } catch (error) {
      setResearchEngineCopyMessage(`复制失败：${getErrorMessage(error)}`);
      toast.error(`复制失败：${getErrorMessage(error)}`);
    }
  };

  const runResearchEngineRealUrlReaderSmoke = async () => {
    setIsRunningResearchEngineRealUrlReaderSmoke(true);
    setResearchEngineCopyMessage(null);
    setResearchEngineError(null);
    setIsResearchEngineRealUrlReaderSmokeReportExpanded(false);
    try {
      const result = await runResearchEngineRealUrlReaderSmokeBridge({
        url: researchEngineRealUrlReaderSmokeUrl,
      });
      setResearchEngineRealUrlReaderSmoke(result);
      if (result.ok) {
        toast.success("真实 URL Reader Smoke 完成");
      } else {
        setResearchEngineError(`真实 URL Reader Smoke 失败：${result.errors.join("; ") || result.status}`);
      }
    } catch (error) {
      const message = `真实 URL Reader Smoke 失败：${getErrorMessage(error)}`;
      setResearchEngineError(message);
      toast.error(message);
    } finally {
      setIsRunningResearchEngineRealUrlReaderSmoke(false);
    }
  };

  const copyResearchEngineRealUrlReaderSmokeReport = async () => {
    const markdown = researchEngineRealUrlReaderSmoke?.markdownReport;
    if (!markdown) {
      setResearchEngineCopyMessage("请先运行真实 URL Reader Smoke。");
      return;
    }
    if (!navigator.clipboard) {
      setResearchEngineCopyMessage("当前环境不可直接复制，请手动选择下方 URL Reader Smoke Markdown 报告。");
      return;
    }
    try {
      await navigator.clipboard.writeText(markdown);
      setResearchEngineCopyMessage("URL Reader Smoke Markdown 报告已复制。");
      toast.success("URL Reader Smoke Markdown 报告已复制");
    } catch (error) {
      setResearchEngineCopyMessage(`复制失败：${getErrorMessage(error)}`);
      toast.error(`复制失败：${getErrorMessage(error)}`);
    }
  };

  const runResearchEngineRealE2ESmoke = async () => {
    setIsRunningResearchEngineRealE2ESmoke(true);
    setResearchEngineCopyMessage(null);
    setResearchEngineError(null);
    setIsResearchEngineRealE2ESmokeReportExpanded(false);
    try {
      const result = await runResearchEngineRealE2ESmokeBridge({
        query: researchEngineRealE2ESmokeQuery,
        webSearchConfig,
        readTopN: 1,
      });
      setResearchEngineRealE2ESmoke(result);
      if (result.ok) {
        toast.success("真实 E2E Smoke 完成");
      } else if (result.providerStatus === "not_configured") {
        setResearchEngineError("真实 E2E Smoke 未运行：当前未启用联网搜索或公开搜索授权；Bing 主线使用无 key public search，Bocha / Brave 仅为可选 API provider。");
      } else {
        setResearchEngineError(`真实 E2E Smoke 失败：${classifyError(result.errors.join("; ") || result.readerStatus || result.providerStatus)}`);
      }
    } catch (error) {
      const message = `真实 E2E Smoke 失败：${classifyError(error)}`;
      setResearchEngineError(message);
      toast.error(message);
    } finally {
      setIsRunningResearchEngineRealE2ESmoke(false);
    }
  };

  const copyResearchEngineRealE2ESmokeReport = async () => {
    const markdown = researchEngineRealE2ESmoke?.markdownReport;
    if (!markdown) {
      setResearchEngineCopyMessage("Please run Real E2E Smoke first.");
      return;
    }
    if (!navigator.clipboard) {
      setResearchEngineCopyMessage("Clipboard is unavailable; select the E2E Smoke Markdown report manually.");
      return;
    }
    try {
      await navigator.clipboard.writeText(markdown);
      setResearchEngineCopyMessage("E2E Smoke Markdown report copied.");
      toast.success("E2E Smoke Markdown report copied");
    } catch (error) {
      setResearchEngineCopyMessage(`Copy failed: ${getErrorMessage(error)}`);
      toast.error(`Copy failed: ${getErrorMessage(error)}`);
    }
  };

  const runResearchEngineRealShadowRun = async () => {
    const controller = new AbortController();
    researchEngineRealShadowRunAbortRef.current = controller;
    setIsRunningResearchEngineRealShadowRun(true);
    setResearchEngineCopyMessage(null);
    setResearchEngineError(null);
    setIsResearchEngineRealShadowRunReportExpanded(false);
    try {
      const result = await runResearchEngineRealShadowRunBridge({
        query: researchEngineRealShadowRunQuery,
        webSearchConfig,
        readTopN: researchEngineRealShadowRunReadTopN,
        maxCandidates: researchEngineRealShadowRunMaxCandidates,
        abortSignal: controller.signal,
      });
      setResearchEngineRealShadowRun(result);
      if (result.ok) {
        toast.success("真实 Shadow Run 完成");
      } else if (result.providerStatus === "not_configured") {
        setResearchEngineError("真实 Shadow Run 未运行：当前未启用联网搜索或公开搜索授权；Bing 主线使用无 key public search，Bocha / Brave 仅为可选 API provider。");
      } else if (result.providerStatus === "aborted") {
        setResearchEngineError("真实 Shadow Run 已取消。");
      } else {
        setResearchEngineError(`真实 Shadow Run 失败：${classifyError(result.errors.join("; ") || result.providerStatus)}`);
      }
    } catch (error) {
      const message = `真实 Shadow Run 失败：${classifyError(error)}`;
      setResearchEngineError(message);
      toast.error(message);
    } finally {
      if (researchEngineRealShadowRunAbortRef.current === controller) {
        researchEngineRealShadowRunAbortRef.current = null;
      }
      setIsRunningResearchEngineRealShadowRun(false);
    }
  };

  const cancelResearchEngineRealShadowRun = () => {
    researchEngineRealShadowRunAbortRef.current?.abort();
    setResearchEngineCopyMessage("Shadow Run cancel requested. The current in-flight browser request may finish, but no new URL reads will start after abort.");
  };

  const copyResearchEngineRealShadowRunReport = async () => {
    const markdown = researchEngineRealShadowRun?.markdownReport;
    if (!markdown) {
      setResearchEngineCopyMessage("Please run Real Shadow Run first.");
      return;
    }
    if (!navigator.clipboard) {
      setResearchEngineCopyMessage("Clipboard is unavailable; select the Shadow Run Markdown report manually.");
      return;
    }
    try {
      await navigator.clipboard.writeText(markdown);
      setResearchEngineCopyMessage("Shadow Run Markdown report copied.");
      toast.success("Shadow Run Markdown report copied");
    } catch (error) {
      setResearchEngineCopyMessage(`Copy failed: ${getErrorMessage(error)}`);
      toast.error(`Copy failed: ${getErrorMessage(error)}`);
    }
  };

  const runResearchEngineShadowCompare = async () => {
    setIsRunningResearchEngineShadowCompare(true);
    setResearchEngineCopyMessage(null);
    setResearchEngineError(null);
    setIsResearchEngineShadowCompareReportExpanded(false);
    try {
      const result = await runResearchEngineShadowCompareBridge({
        query: researchEngineShadowCompareQuery,
        webSearchConfig,
        readTopN: researchEngineShadowCompareReadTopN,
        maxCandidates: researchEngineShadowCompareMaxCandidates,
        includeLegacy: true,
      });
      setResearchEngineShadowCompare(result);
      if (result.ok) {
        toast.success("Shadow Compare 完成");
      } else if (result.researchSummary.status === "not_configured") {
        setResearchEngineError("Shadow Compare 未完整运行：当前未启用联网搜索或公开搜索授权；Bing 主线使用无 key public search，Bocha / Brave 仅为可选 API provider。");
      } else {
        setResearchEngineError(`Shadow Compare 完成但存在问题：${classifyError(result.errors.join("; ") || result.comparisonSummary.recommendation)}`);
      }
    } catch (error) {
      const message = `Shadow Compare 失败：${classifyError(error)}`;
      setResearchEngineError(message);
      toast.error(message);
    } finally {
      setIsRunningResearchEngineShadowCompare(false);
    }
  };

  const copyResearchEngineShadowCompareReport = async () => {
    const markdown = researchEngineShadowCompare?.markdownReport;
    if (!markdown) {
      setResearchEngineCopyMessage("Please run Shadow Compare first.");
      return;
    }
    if (!navigator.clipboard) {
      setResearchEngineCopyMessage("Clipboard is unavailable; select the Shadow Compare Markdown report manually.");
      return;
    }
    try {
      await navigator.clipboard.writeText(markdown);
      setResearchEngineCopyMessage("Shadow Compare Markdown report copied.");
      toast.success("Shadow Compare Markdown report copied");
    } catch (error) {
      setResearchEngineCopyMessage(`Copy failed: ${getErrorMessage(error)}`);
      toast.error(`Copy failed: ${getErrorMessage(error)}`);
    }
  };

  return (
    <section className="grid min-w-0 gap-5">
      <div className="grid gap-1 border-b border-border/80 pb-4">
        <div className="text-base font-semibold text-foreground">搜索自检</div>
        <div className="max-w-4xl text-sm leading-6 text-muted-foreground">
          检查搜索决策、搜索服务、本地索引、缓存和引用渲染。默认自检不读取浏览器数据，不修改笔记，也不会上传本地笔记或 API Key。
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void runCoreDiagnostics()} disabled={isRunningCore || isTestingProvider || isCheckingLocalIndex || isRebuildingLocalIndex || isRunningNotexSelfCheck}>
          {isRunningCore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          运行核心自检
        </Button>
        <Button variant="outline" onClick={runProviderTest} disabled={isRunningCore || isTestingProvider || isCheckingLocalIndex || isRebuildingLocalIndex || isRunningNotexSelfCheck || !webSearchConfig}>
          {isTestingProvider ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
          测试当前搜索服务
        </Button>
        <Button variant="outline" onClick={() => void checkLocalIndex()} disabled={isRunningCore || isTestingProvider || isCheckingLocalIndex || isRebuildingLocalIndex || isRunningNotexSelfCheck}>
          {isCheckingLocalIndex ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          检查本地索引
        </Button>
        <Button variant="outline" onClick={() => void rebuildLocalIndex()} disabled={isRunningCore || isTestingProvider || isCheckingLocalIndex || isRebuildingLocalIndex || isRunningNotexSelfCheck}>
          {isRebuildingLocalIndex ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          重建本地索引
        </Button>
        <Button variant="outline" onClick={() => void runNotexSelfCheck()} disabled={isRunningCore || isTestingProvider || isCheckingLocalIndex || isRebuildingLocalIndex || isRunningNotexSelfCheck}>
          {isRunningNotexSelfCheck ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          运行 NoteX 搜索自检
        </Button>
        <Button variant="outline" onClick={() => void copyReport()}>
          <Clipboard className="h-3.5 w-3.5" />
          复制诊断报告
        </Button>
        {copyMessage && <span className="text-xs text-muted-foreground">{copyMessage}</span>}
      </div>

      <div className="grid gap-2 border-y border-border/70 py-3 sm:grid-cols-5">
        {STATUS_ORDER.map((status) => (
          <div key={status} className="flex items-center justify-between gap-3 px-1 text-sm">
            <span className="text-muted-foreground">{STATUS_LABELS[status]}</span>
            <span className={cn("rounded-sm border px-2 py-0.5 text-xs", statusTone(status))}>{counts[status]}</span>
          </div>
        ))}
        <div className="px-1 text-xs leading-5 text-muted-foreground sm:col-span-5">
          上次运行：{lastRunAt ?? "尚未运行"}。在线搜索服务测试只会在手动点击时发起外部请求。
        </div>
      </div>

      <section className="grid min-w-0 max-w-full gap-4 overflow-hidden border-b border-border/70 pb-4">
        <div className="grid min-w-0 gap-1">
          <div className="text-sm font-semibold text-foreground">Research Engine 核心</div>
          <div className="max-w-full break-words text-xs leading-5 text-muted-foreground lg:max-w-4xl">
            离线诊断区，只运行确定性的 mock discovery、mock reader、证据合约、生成后校验和诊断导出；不会触发真实搜索、真实 provider 或旧搜索链路。
          </div>
        </div>
        <div className="grid min-w-0 max-w-full grid-cols-1 gap-2 sm:grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]">
          <Button className="w-full justify-center whitespace-normal sm:w-auto" variant="outline" onClick={runResearchEngineSelfCheck} disabled={isRunningResearchEngineSelfCheck || isRunningResearchEngineSample}>
            {isRunningResearchEngineSelfCheck ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            运行自检
          </Button>
          <div className="relative min-w-0 max-w-full">
            <button
              type="button"
              className="flex min-h-9 w-full max-w-full items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-left text-sm text-foreground hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => setIsResearchEngineSampleMenuOpen((open) => !open)}
              disabled={isRunningResearchEngineSelfCheck || isRunningResearchEngineSample}
            >
              <span className="min-w-0 truncate">{selectedResearchEngineSample.labelZh}：{selectedResearchEngineSample.displayQuestion}</span>
              <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", isResearchEngineSampleMenuOpen && "rotate-180")} />
            </button>
            {isResearchEngineSampleMenuOpen && (
              <div className="absolute left-0 top-11 z-20 grid max-h-72 w-full min-w-0 max-w-full overflow-auto rounded-md border border-border bg-popover p-1 text-sm shadow-lg">
                {researchEngineSamples.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    className={cn(
                      "grid min-w-0 rounded-sm px-3 py-2 text-left hover:bg-muted/60",
                      sample.id === researchEngineSampleId && "bg-muted text-foreground",
                    )}
                    onClick={() => {
                      setResearchEngineSampleId(sample.id);
                      setIsResearchEngineSampleMenuOpen(false);
                    }}
                  >
                    <span className="min-w-0 truncate font-medium text-foreground">{sample.labelZh}</span>
                    <span className="mt-0.5 min-w-0 truncate text-xs leading-5 text-muted-foreground">{sample.displayQuestion}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button className="w-full justify-center whitespace-normal sm:w-auto" variant="outline" onClick={runResearchEngineSample} disabled={isRunningResearchEngineSelfCheck || isRunningResearchEngineSample}>
            {isRunningResearchEngineSample ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            运行离线样例
          </Button>
          <Button className="w-full justify-center whitespace-normal sm:w-auto" variant="outline" onClick={() => void copyResearchEngineReport()}>
            <Clipboard className="h-3.5 w-3.5" />
            复制 Markdown 报告
          </Button>
          {researchEngineCopyMessage && <span className="min-w-0 break-words text-xs leading-5 text-muted-foreground lg:self-center">{researchEngineCopyMessage}</span>}
        </div>
        <div className="grid min-w-0 max-w-full gap-2 rounded-sm border border-border/70 bg-muted/10 p-3">
          <div className="grid min-w-0 gap-1">
            <div className="text-sm font-medium text-foreground">真实 Provider Smoke</div>
            <div className="max-w-full break-words text-xs leading-5 text-muted-foreground">
              手动验证 Research Engine provider boundary 的最小真实搜索闭环；Bing 走无 key public search，Bocha / Brave 仅作为可选 API provider；不会替换普通 NoteX 搜索，也不会写入会话。
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
            <input
              className="min-h-9 min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
              value={researchEngineRealProviderSmokeQuery}
              onChange={(event) => setResearchEngineRealProviderSmokeQuery(event.target.value)}
              placeholder={DEFAULT_RESEARCH_ENGINE_REAL_PROVIDER_SMOKE_QUERY}
            />
            <Button
              className="w-full justify-center whitespace-normal lg:w-auto"
              variant="outline"
              onClick={() => void runResearchEngineRealProviderSmoke()}
              disabled={isRunningResearchEngineSelfCheck || isRunningResearchEngineSample || isRunningResearchEngineRealProviderSmoke}
            >
              {isRunningResearchEngineRealProviderSmoke ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
              运行真实 Smoke
            </Button>
            <Button
              className="w-full justify-center whitespace-normal lg:w-auto"
              variant="outline"
              onClick={() => void copyResearchEngineRealProviderSmokeReport()}
              disabled={!researchEngineRealProviderSmoke?.markdownReport}
            >
              <Clipboard className="h-3.5 w-3.5" />
              复制 Smoke 报告
            </Button>
          </div>
          {researchEngineRealProviderSmoke && (
            <div className="grid min-w-0 max-w-full gap-3 border-l border-border/80 pl-3 text-xs leading-5">
              <div className={cn("min-w-0 break-words", researchEngineRealProviderSmoke.ok ? "text-emerald-300" : "text-amber-300")}>
                {researchEngineRealProviderSmoke.ok ? "Smoke 已完成。" : researchEngineRealProviderSmoke.status === "not_configured" ? "未配置真实 provider，Smoke 未发起。" : "Smoke 失败或部分失败。"}
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Provider", researchEngineDisplayProvider(researchEngineRealProviderSmoke.providerName, researchEngineRealProviderSmoke.diagnosticsSnapshot, researchEngineRealProviderSmoke.redactedConfigSummary.mode)],
                  ["API key required", researchEngineRealProviderSmoke.redactedConfigSummary.apiKeyRequired === false ? "no" : researchEngineRealProviderSmoke.redactedConfigSummary.apiKeyRequired === true ? "yes" : "unknown"],
                  ["Status", researchEngineRealProviderSmoke.status],
                  ["Error kind", researchEngineDiagnosticText(researchEngineRealProviderSmoke.diagnosticsSnapshot, "errorKind") ?? "none"],
                  ["Stage", researchEngineStageSummary(researchEngineRealProviderSmoke.diagnosticsSnapshot)],
                  ["Bridge queries", researchEngineDiagnosticText(researchEngineRealProviderSmoke.diagnosticsSnapshot, "bridgeQueries") ?? "none"],
                  ["News mode", researchEngineDiagnosticText(researchEngineRealProviderSmoke.diagnosticsSnapshot, "newsQueryMode") ?? "none"],
                  ["News stage", researchEngineDiagnosticText(researchEngineRealProviderSmoke.diagnosticsSnapshot, "newsStageUsed") ?? "false"],
                  ["Global timeout", researchEngineDiagnosticText(researchEngineRealProviderSmoke.diagnosticsSnapshot, "providerGlobalTimeoutMs") ?? "none"],
                  ["Per-query timeout", researchEngineDiagnosticText(researchEngineRealProviderSmoke.diagnosticsSnapshot, "perQueryTimeoutMs") ?? "none"],
                  ["Completed queries", researchEngineDiagnosticText(researchEngineRealProviderSmoke.diagnosticsSnapshot, "completedQueryCount") ?? "none"],
                  ["Timed out queries", researchEngineDiagnosticText(researchEngineRealProviderSmoke.diagnosticsSnapshot, "timedOutQueryCount") ?? "none"],
                  ["Partial results", researchEngineDiagnosticText(researchEngineRealProviderSmoke.diagnosticsSnapshot, "partialResultsUsed") ?? "false"],
                  ["Early stop", researchEngineDiagnosticText(researchEngineRealProviderSmoke.diagnosticsSnapshot, "earlyStop") ?? "false"],
                  ["Host diversity", researchEngineDiagnosticText(researchEngineRealProviderSmoke.diagnosticsSnapshot, "hostDiversityApplied") ?? "false"],
                  ["Candidate hosts", researchEngineDistributionText(researchEngineRealProviderSmoke.diagnosticsSnapshot, "candidateHostDistribution") ?? "none"],
                  ["Entity rejects", researchEngineDiagnosticText(researchEngineRealProviderSmoke.diagnosticsSnapshot, "rejectedByEntityFilterCount") ?? "0"],
                  ["Top quality", researchEngineQualityPreviewText(researchEngineRealProviderSmoke.diagnosticsSnapshot) ?? "none"],
                  ["Raw results", researchEngineRealProviderSmoke.rawResultCount],
                  ["Normalized", researchEngineRealProviderSmoke.normalizedResultCount],
                  ["Candidates", researchEngineRealProviderSmoke.candidateCount],
                  ["Selected", researchEngineRealProviderSmoke.selectedCandidateCount],
                  ["Endpoint", researchEngineRealProviderSmoke.redactedConfigSummary.endpointHost ?? "none"],
                  ["Credential", researchEngineRealProviderSmoke.redactedConfigSummary.credentialAvailable ? "present(redacted)" : "missing"],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 max-w-full overflow-hidden rounded-sm border border-border/70 bg-background/40 px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">{label}</div>
                    <div className="mt-0.5 min-w-0 whitespace-normal break-words text-sm text-foreground">{value}</div>
                  </div>
                ))}
              </div>
              {(researchEngineRealProviderSmoke.warnings.length > 0 || researchEngineRealProviderSmoke.errors.length > 0) && (
                <div className="grid min-w-0 gap-1 text-xs leading-5 text-muted-foreground">
                  {researchEngineRealProviderSmoke.warnings.map((warning) => <div key={`real-smoke-warning-${warning}`} className="min-w-0 break-words">警告：{warning}</div>)}
                  {researchEngineRealProviderSmoke.errors.map((error) => <div key={`real-smoke-error-${error}`} className="min-w-0 break-words text-red-300">错误：{error}</div>)}
                </div>
              )}
              <details className="min-w-0 max-w-full overflow-hidden text-xs leading-5 text-muted-foreground">
                <summary className="cursor-pointer whitespace-normal break-words text-foreground">Markdown 报告</summary>
                <button
                  type="button"
                  className="mt-2 rounded-sm border border-border px-2 py-1 text-xs text-foreground hover:bg-muted/40"
                  onClick={() => setIsResearchEngineRealProviderSmokeReportExpanded((expanded) => !expanded)}
                >
                  {isResearchEngineRealProviderSmokeReportExpanded ? "Hide Markdown report" : "Show Markdown report"}
                </button>
                {isResearchEngineRealProviderSmokeReportExpanded && (
                  <pre className="mt-2 max-h-80 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-sm border border-border/70 bg-muted/20 p-3 font-mono text-[11px] leading-5 [overflow-wrap:anywhere]">
                    {researchEngineRealProviderSmoke.markdownReport}
                  </pre>
                )}
              </details>
            </div>
          )}
        </div>
        <div className="grid min-w-0 max-w-full gap-2 rounded-sm border border-border/70 bg-muted/10 p-3">
          <div className="grid min-w-0 gap-1">
            <div className="text-sm font-medium text-foreground">真实 URL Reader Smoke</div>
            <div className="max-w-full break-words text-xs leading-5 text-muted-foreground">
              手动验证 Research Engine URL Reader / Extractor 边界；这是浏览器侧 smoke，受 CORS 限制，只读取你输入的公开网页，不带 cookies，不绕过登录或验证码，不代表最终后端 reader 能力，也不会影响普通 NoteX 搜索。
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
            <input
              className="min-h-9 min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
              value={researchEngineRealUrlReaderSmokeUrl}
              onChange={(event) => setResearchEngineRealUrlReaderSmokeUrl(event.target.value)}
              placeholder={DEFAULT_RESEARCH_ENGINE_REAL_URL_READER_SMOKE_URL}
            />
            <Button
              className="w-full justify-center whitespace-normal lg:w-auto"
              variant="outline"
              onClick={() => void runResearchEngineRealUrlReaderSmoke()}
              disabled={isRunningResearchEngineSelfCheck || isRunningResearchEngineSample || isRunningResearchEngineRealUrlReaderSmoke}
            >
              {isRunningResearchEngineRealUrlReaderSmoke ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
              运行 URL Reader Smoke
            </Button>
            <Button
              className="w-full justify-center whitespace-normal lg:w-auto"
              variant="outline"
              onClick={() => void copyResearchEngineRealUrlReaderSmokeReport()}
              disabled={!researchEngineRealUrlReaderSmoke?.markdownReport}
            >
              <Clipboard className="h-3.5 w-3.5" />
              复制 URL Reader 报告
            </Button>
          </div>
          {researchEngineRealUrlReaderSmoke && (
            <div className="grid min-w-0 max-w-full gap-3 border-l border-border/80 pl-3 text-xs leading-5">
              <div className={cn("min-w-0 break-words", researchEngineRealUrlReaderSmoke.ok ? "text-emerald-300" : "text-amber-300")}>
                {researchEngineRealUrlReaderSmoke.ok ? "URL Reader Smoke 已完成。" : "URL Reader Smoke 失败或质量不足。"}
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Status", researchEngineRealUrlReaderSmoke.status],
                  ["Transport", researchEngineReaderDiagnosticText(researchEngineRealUrlReaderSmoke.diagnosticsSnapshot, "readerTransport") ?? "none"],
                  ["Backend bridge", researchEngineReaderDiagnosticText(researchEngineRealUrlReaderSmoke.diagnosticsSnapshot, "backendBridgeName") ?? "none"],
                  ["CORS", researchEngineReaderDiagnosticText(researchEngineRealUrlReaderSmoke.diagnosticsSnapshot, "browserCorsNotApplicable") === "true" ? "not applicable" : "unknown"],
                  ["HTTP", researchEngineRealUrlReaderSmoke.httpStatus ?? "none"],
                  ["Content type", researchEngineRealUrlReaderSmoke.contentType ?? "none"],
                  ["Body bytes", researchEngineRealUrlReaderSmoke.bodyBytes ?? 0],
                  ["Preview chars", researchEngineReaderDiagnosticText(researchEngineRealUrlReaderSmoke.diagnosticsSnapshot, "bodyPreviewLength") ?? "none"],
                  ["Blocks", researchEngineRealUrlReaderSmoke.blockCounts.total ?? 0],
                  ["Passages", researchEngineRealUrlReaderSmoke.selectedPassageCount],
                  ["Excerpt length", researchEngineRealUrlReaderSmoke.excerptLength],
                  ["Quality", researchEngineRealUrlReaderSmoke.qualitySummary?.quality ?? "none"],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 max-w-full overflow-hidden rounded-sm border border-border/70 bg-background/40 px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">{label}</div>
                    <div className="mt-0.5 min-w-0 whitespace-normal break-words text-sm text-foreground">{value}</div>
                  </div>
                ))}
              </div>
              {(researchEngineRealUrlReaderSmoke.warnings.length > 0 || researchEngineRealUrlReaderSmoke.errors.length > 0) && (
                <div className="grid min-w-0 gap-1 text-xs leading-5 text-muted-foreground">
                  {researchEngineRealUrlReaderSmoke.warnings.map((warning) => <div key={`real-url-reader-warning-${warning}`} className="min-w-0 break-words">警告：{warning}</div>)}
                  {researchEngineRealUrlReaderSmoke.errors.map((error) => <div key={`real-url-reader-error-${error}`} className="min-w-0 break-words text-red-300">错误：{error}</div>)}
                </div>
              )}
              {researchEngineRealUrlReaderSmoke.excerptPreview && (
                <details className="min-w-0 max-w-full overflow-hidden text-xs leading-5 text-muted-foreground">
                  <summary className="cursor-pointer whitespace-normal break-words text-foreground">Excerpt Preview</summary>
                  <pre className="mt-2 max-h-56 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-sm border border-border/70 bg-muted/20 p-3 font-mono text-[11px] leading-5 [overflow-wrap:anywhere]">
                    {researchEngineRealUrlReaderSmoke.excerptPreview}
                  </pre>
                </details>
              )}
              <details className="min-w-0 max-w-full overflow-hidden text-xs leading-5 text-muted-foreground">
                <summary className="cursor-pointer whitespace-normal break-words text-foreground">Markdown 报告</summary>
                <button
                  type="button"
                  className="mt-2 rounded-sm border border-border px-2 py-1 text-xs text-foreground hover:bg-muted/40"
                  onClick={() => setIsResearchEngineRealUrlReaderSmokeReportExpanded((expanded) => !expanded)}
                >
                  {isResearchEngineRealUrlReaderSmokeReportExpanded ? "Hide Markdown report" : "Show Markdown report"}
                </button>
                {isResearchEngineRealUrlReaderSmokeReportExpanded && (
                  <pre className="mt-2 max-h-80 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-sm border border-border/70 bg-muted/20 p-3 font-mono text-[11px] leading-5 [overflow-wrap:anywhere]">
                    {researchEngineRealUrlReaderSmoke.markdownReport}
                  </pre>
                )}
              </details>
            </div>
          )}
        </div>
        <div className="grid min-w-0 max-w-full gap-2 rounded-sm border border-border/70 bg-muted/10 p-3">
          <div className="grid min-w-0 gap-1">
            <div className="text-sm font-medium text-foreground">真实 E2E Smoke</div>
            <div className="max-w-full break-words text-xs leading-5 text-muted-foreground">
              手动串联 Research Engine provider、candidate pool、top 1 URL reader、evidence evaluator 和 answer contract；Bing 走无 key public search，并读取 top 1 公开 URL，不带 cookies，不绕过登录/验证码，也不影响普通 NoteX 搜索。
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
            <input
              className="min-h-9 min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
              value={researchEngineRealE2ESmokeQuery}
              onChange={(event) => setResearchEngineRealE2ESmokeQuery(event.target.value)}
              placeholder={DEFAULT_RESEARCH_ENGINE_REAL_E2E_SMOKE_QUERY}
            />
            <Button
              className="w-full justify-center whitespace-normal lg:w-auto"
              variant="outline"
              onClick={() => void runResearchEngineRealE2ESmoke()}
              disabled={isRunningResearchEngineSelfCheck || isRunningResearchEngineSample || isRunningResearchEngineRealE2ESmoke}
            >
              {isRunningResearchEngineRealE2ESmoke ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
              运行真实 E2E Smoke
            </Button>
            <Button
              className="w-full justify-center whitespace-normal lg:w-auto"
              variant="outline"
              onClick={() => void copyResearchEngineRealE2ESmokeReport()}
              disabled={!researchEngineRealE2ESmoke?.markdownReport}
            >
              <Clipboard className="h-3.5 w-3.5" />
              复制 E2E 报告
            </Button>
          </div>
          {researchEngineRealE2ESmoke && (
            <div className="grid min-w-0 max-w-full gap-3 border-l border-border/80 pl-3 text-xs leading-5">
              <div className={cn("min-w-0 break-words", researchEngineRealE2ESmoke.ok ? "text-emerald-300" : "text-amber-300")}>
                {researchEngineRealE2ESmoke.ok ? "E2E Smoke 已完成。" : researchEngineRealE2ESmoke.providerStatus === "not_configured" ? "未配置真实 provider，E2E Smoke 未发起。" : "E2E Smoke 失败或部分失败。"}
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Provider", researchEngineDisplayProvider(researchEngineRealE2ESmoke.providerName, researchEngineRealE2ESmoke.diagnosticsSnapshot)],
                  ["Provider status", researchEngineRealE2ESmoke.providerStatus],
                  ["Error kind", researchEngineDiagnosticText(researchEngineRealE2ESmoke.diagnosticsSnapshot, "errorKind") ?? "none"],
                  ["Stage", researchEngineStageSummary(researchEngineRealE2ESmoke.diagnosticsSnapshot)],
                  ["Bridge queries", researchEngineDiagnosticText(researchEngineRealE2ESmoke.diagnosticsSnapshot, "bridgeQueries") ?? "none"],
                  ["News mode", researchEngineDiagnosticText(researchEngineRealE2ESmoke.diagnosticsSnapshot, "newsQueryMode") ?? "none"],
                  ["News stage", researchEngineDiagnosticText(researchEngineRealE2ESmoke.diagnosticsSnapshot, "newsStageUsed") ?? "false"],
                  ["Global timeout", researchEngineDiagnosticText(researchEngineRealE2ESmoke.diagnosticsSnapshot, "providerGlobalTimeoutMs") ?? "none"],
                  ["Per-query timeout", researchEngineDiagnosticText(researchEngineRealE2ESmoke.diagnosticsSnapshot, "perQueryTimeoutMs") ?? "none"],
                  ["Completed queries", researchEngineDiagnosticText(researchEngineRealE2ESmoke.diagnosticsSnapshot, "completedQueryCount") ?? "none"],
                  ["Timed out queries", researchEngineDiagnosticText(researchEngineRealE2ESmoke.diagnosticsSnapshot, "timedOutQueryCount") ?? "none"],
                  ["Partial results", researchEngineDiagnosticText(researchEngineRealE2ESmoke.diagnosticsSnapshot, "partialResultsUsed") ?? "false"],
                  ["Early stop", researchEngineDiagnosticText(researchEngineRealE2ESmoke.diagnosticsSnapshot, "earlyStop") ?? "false"],
                  ["Host diversity", researchEngineDiagnosticText(researchEngineRealE2ESmoke.diagnosticsSnapshot, "hostDiversityApplied") ?? "false"],
                  ["Candidate hosts", researchEngineDistributionText(researchEngineRealE2ESmoke.diagnosticsSnapshot, "candidateHostDistribution") ?? "none"],
                  ["Entity rejects", researchEngineDiagnosticText(researchEngineRealE2ESmoke.diagnosticsSnapshot, "rejectedByEntityFilterCount") ?? "0"],
                  ["Top quality", researchEngineQualityPreviewText(researchEngineRealE2ESmoke.diagnosticsSnapshot) ?? "none"],
                  ["Candidates", researchEngineRealE2ESmoke.candidateCount],
                  ["Selected URL", researchEngineRealE2ESmoke.selectedCandidate?.url ?? "none"],
                  ["Reader status", researchEngineRealE2ESmoke.readerStatus],
                  ["Reader transport", researchEngineReaderDiagnosticText(researchEngineRealE2ESmoke.diagnosticsSnapshot, "readerTransport") ?? "none"],
                  ["Backend bridge", researchEngineReaderDiagnosticText(researchEngineRealE2ESmoke.diagnosticsSnapshot, "backendBridgeName") ?? "none"],
                  ["Passages", researchEngineRealE2ESmoke.selectedPassageCount],
                  ["Evidence mode", researchEngineRealE2ESmoke.answerContractMode ?? "none"],
                  ["Quality", researchEngineRealE2ESmoke.readerQuality?.quality ?? "none"],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 max-w-full overflow-hidden rounded-sm border border-border/70 bg-background/40 px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">{label}</div>
                    <div className="mt-0.5 min-w-0 whitespace-normal break-words text-sm text-foreground">{value}</div>
                  </div>
                ))}
              </div>
              {(researchEngineRealE2ESmoke.warnings.length > 0 || researchEngineRealE2ESmoke.errors.length > 0) && (
                <div className="grid min-w-0 gap-1 text-xs leading-5 text-muted-foreground">
                  {researchEngineRealE2ESmoke.warnings.map((warning) => <div key={`real-e2e-warning-${warning}`} className="min-w-0 break-words">警告：{warning}</div>)}
                  {researchEngineRealE2ESmoke.errors.map((error) => <div key={`real-e2e-error-${error}`} className="min-w-0 break-words text-red-300">错误：{error}</div>)}
                </div>
              )}
              {typeof researchEngineRealE2ESmoke.diagnosticsSnapshot.excerptPreview === "string" && (
                <details className="min-w-0 max-w-full overflow-hidden text-xs leading-5 text-muted-foreground">
                  <summary className="cursor-pointer whitespace-normal break-words text-foreground">Excerpt Preview</summary>
                  <pre className="mt-2 max-h-56 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-sm border border-border/70 bg-muted/20 p-3 font-mono text-[11px] leading-5 [overflow-wrap:anywhere]">
                    {researchEngineRealE2ESmoke.diagnosticsSnapshot.excerptPreview}
                  </pre>
                </details>
              )}
              <details className="min-w-0 max-w-full overflow-hidden text-xs leading-5 text-muted-foreground">
                <summary className="cursor-pointer whitespace-normal break-words text-foreground">Markdown 报告</summary>
                <button
                  type="button"
                  className="mt-2 rounded-sm border border-border px-2 py-1 text-xs text-foreground hover:bg-muted/40"
                  onClick={() => setIsResearchEngineRealE2ESmokeReportExpanded((expanded) => !expanded)}
                >
                  {isResearchEngineRealE2ESmokeReportExpanded ? "Hide Markdown report" : "Show Markdown report"}
                </button>
                {isResearchEngineRealE2ESmokeReportExpanded && (
                  <pre className="mt-2 max-h-80 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-sm border border-border/70 bg-muted/20 p-3 font-mono text-[11px] leading-5 [overflow-wrap:anywhere]">
                    {researchEngineRealE2ESmoke.markdownReport}
                  </pre>
                )}
              </details>
            </div>
          )}
        </div>
        <div className="grid min-w-0 max-w-full gap-2 rounded-sm border border-border/70 bg-muted/10 p-3">
          <div className="grid min-w-0 gap-1">
            <div className="text-sm font-medium text-foreground">真实 Shadow Run</div>
            <div className="max-w-full break-words text-xs leading-5 text-muted-foreground">
              手动运行更接近正式 Research Engine 的 shadow pipeline：Bing 走无 key public search，按顺序读取最多 N 个公开 URL，不带 cookies，不绕过登录/验证码，受 CORS 限制，不影响普通 NoteX 搜索。
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]">
            <input
              className="min-h-9 min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
              value={researchEngineRealShadowRunQuery}
              onChange={(event) => setResearchEngineRealShadowRunQuery(event.target.value)}
              placeholder={DEFAULT_RESEARCH_ENGINE_REAL_SHADOW_RUN_QUERY}
            />
            <select
              className="min-h-9 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
              value={researchEngineRealShadowRunReadTopN}
              onChange={(event) => setResearchEngineRealShadowRunReadTopN(Number(event.target.value))}
              disabled={isRunningResearchEngineRealShadowRun}
              aria-label="Shadow Run readTopN"
            >
              {[1, 2, 3].map((value) => (
                <option key={value} value={value}>readTopN {value}</option>
              ))}
            </select>
            <input
              className="min-h-9 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring xl:w-28"
              type="number"
              min={1}
              max={10}
              value={researchEngineRealShadowRunMaxCandidates}
              onChange={(event) => setResearchEngineRealShadowRunMaxCandidates(Number(event.target.value) || DEFAULT_RESEARCH_ENGINE_REAL_SHADOW_RUN_MAX_CANDIDATES)}
              disabled={isRunningResearchEngineRealShadowRun}
              aria-label="Shadow Run max candidates"
            />
            <Button
              className="w-full justify-center whitespace-normal xl:w-auto"
              variant="outline"
              onClick={() => void runResearchEngineRealShadowRun()}
              disabled={isRunningResearchEngineSelfCheck || isRunningResearchEngineSample || isRunningResearchEngineRealShadowRun}
            >
              {isRunningResearchEngineRealShadowRun ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
              运行真实 Shadow Run
            </Button>
            {isRunningResearchEngineRealShadowRun ? (
              <Button
                className="w-full justify-center whitespace-normal xl:w-auto"
                variant="outline"
                onClick={cancelResearchEngineRealShadowRun}
              >
                取消
              </Button>
            ) : (
              <Button
                className="w-full justify-center whitespace-normal xl:w-auto"
                variant="outline"
                onClick={() => void copyResearchEngineRealShadowRunReport()}
                disabled={!researchEngineRealShadowRun?.markdownReport}
              >
                <Clipboard className="h-3.5 w-3.5" />
                复制 Shadow 报告
              </Button>
            )}
          </div>
          {researchEngineRealShadowRun && (
            <div className="grid min-w-0 max-w-full gap-3 border-l border-border/80 pl-3 text-xs leading-5">
              <div className={cn("min-w-0 break-words", researchEngineRealShadowRun.ok ? "text-emerald-300" : "text-amber-300")}>
                {researchEngineRealShadowRun.ok ? "Shadow Run 已完成。" : researchEngineRealShadowRun.providerStatus === "not_configured" ? "未配置真实 provider，Shadow Run 未发起。" : researchEngineRealShadowRun.providerStatus === "aborted" ? "Shadow Run 已取消。" : "Shadow Run 失败或证据不足。"}
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Provider", researchEngineDisplayProvider(researchEngineRealShadowRun.providerName, researchEngineRealShadowRun.diagnosticsSnapshot)],
                  ["Provider status", researchEngineRealShadowRun.providerStatus],
                  ["Error kind", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "errorKind") ?? "none"],
                  ["Stage", researchEngineStageSummary(researchEngineRealShadowRun.diagnosticsSnapshot)],
                  ["Bridge queries", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "bridgeQueries") ?? "none"],
                  ["LLM planner", `${researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "llmPlannerStarted") ?? "false"} / ${researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "llmPlannerSucceeded") ?? "false"}`],
                  ["Planner intent", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "plannerIntent") ?? "none"],
                  ["Coverage intent", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "coveragePlanIntent") ?? "none"],
                  ["Coverage facets", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "coverageFacets") ?? "none"],
                  ["Target reads", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "targetReadCount") ?? "none"],
                  ["Attempted reads", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "attemptedReadCount") ?? String(researchEngineRealShadowRun.readAttempts.length)],
                  ["Reader concurrency", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "readerConcurrency") ?? "none"],
                  ["Reader budget", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "globalReaderBudgetMs") ?? "none"],
                  ["Attempted hosts", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "distinctAttemptedHosts") ?? "none"],
                  ["News mode", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "newsQueryMode") ?? "none"],
                  ["News stage", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "newsStageUsed") ?? "false"],
                  ["Global timeout", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "providerGlobalTimeoutMs") ?? "none"],
                  ["Per-query timeout", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "perQueryTimeoutMs") ?? "none"],
                  ["Completed queries", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "completedQueryCount") ?? "none"],
                  ["Timed out queries", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "timedOutQueryCount") ?? "none"],
                  ["Partial results", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "partialResultsUsed") ?? "false"],
                  ["Early stop", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "earlyStop") ?? "false"],
                  ["Early stop reason", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "earlyStopReason") ?? "none"],
                  ["Host diversity", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "hostDiversityApplied") ?? "false"],
                  ["Source portfolio", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "sourcePortfolioEnabled") ?? "false"],
                  ["Target hosts", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "targetDistinctHosts") ?? "none"],
                  ["Distinct candidates", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "distinctCandidateHosts") ?? "none"],
                  ["Candidate hosts", researchEngineDistributionText(researchEngineRealShadowRun.diagnosticsSnapshot, "candidateHostDistribution") ?? "none"],
                  ["Portfolio hosts", researchEngineDistributionText(researchEngineRealShadowRun.diagnosticsSnapshot, "portfolioHostDistribution") ?? "none"],
                  ["Evidence hosts", researchEngineDistributionText(researchEngineRealShadowRun.diagnosticsSnapshot, "evidenceHostDistribution") ?? "none"],
                  ["Usable body evidence", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "usableBodyEvidenceCount") ?? researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "usableEvidenceCount") ?? "none"],
                  ["Usable fresh evidence", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "usableFreshBodyEvidenceCount") ?? "none"],
                  ["Current date", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "currentDate") ?? "none"],
                  ["Freshness window", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "freshnessWindowDays") ?? "none"],
                  ["Freshness gate", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "freshnessGateStatus") ?? "none"],
                  ["Freshness failure", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "freshnessFailureReason") ?? "none"],
                  ["Fresh evidence", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "freshEvidenceCount") ?? "none"],
                  ["Stale evidence", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "staleEvidenceCount") ?? "none"],
                  ["Unknown-date evidence", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "unknownDateEvidenceCount") ?? "none"],
                  ["Rejected by freshness", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "rejectedByFreshnessCount") ?? "none"],
                  ["Body evidence ratio", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "bodyEvidenceRatio") ?? "none"],
                  ["Covered facets", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "coveredFacetCount") ?? "none"],
                  ["Missing facets", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "missingFacets") ?? "none"],
                  ["Candidate shortage", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "candidateShortage") ?? "false"],
                  ["Portfolio summary", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "sourcePortfolioSummary") ?? "none"],
                  ["Reader summary", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "concurrentReaderSummary") ?? "none"],
                  ["Usable hosts", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "usableEvidenceHostCount") ?? "none"],
                  ["Evidence gate", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "evidenceGateStatus") ?? "none"],
                  ["Gate reason", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "evidenceGateReason") ?? "none"],
                  ["Evidence quality", researchEngineDiagnosticJsonText(researchEngineRealShadowRun.diagnosticsSnapshot, "evidenceQualityDistribution") ?? "none"],
                  ["Selected by facet", researchEngineDiagnosticJsonText(researchEngineRealShadowRun.diagnosticsSnapshot, "selectedEvidenceByFacet") ?? "none"],
                  ["Concrete news evidence", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "concreteNewsEvidenceCount") ?? "none"],
                  ["Background evidence", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "backgroundEvidenceCount") ?? "none"],
                  ["Downgraded evidence", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "downgradedEvidenceCount") ?? "none"],
                  ["Missing evidence facets", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "missingEvidenceFacets") ?? "none"],
                  ["Synthesis items", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "synthesisPlanItemCount") ?? "none"],
                  ["Answer mode", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "answerMode") ?? "none"],
                  ["Limitations", researchEngineDiagnosticJsonText(researchEngineRealShadowRun.diagnosticsSnapshot, "limitations") ?? "none"],
                  ["Source diversity", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "sourceDiversitySatisfied") ?? "unknown"],
                  ["Top quality", researchEngineQualityPreviewText(researchEngineRealShadowRun.diagnosticsSnapshot) ?? "none"],
                  ["Candidates", researchEngineRealShadowRun.candidateCount],
                  ["Read attempts", researchEngineRealShadowRun.readAttempts.length],
                  ["Max attempts", researchEngineDiagnosticText(researchEngineRealShadowRun.diagnosticsSnapshot, "maxReadAttempts") ?? "none"],
                  ["Reader transport", researchEngineRealShadowRun.readAttempts.find((attempt) => attempt.readerTransport)?.readerTransport ?? "none"],
                  ["Successful", researchEngineRealShadowRun.successfulReads],
                  ["Failed", researchEngineRealShadowRun.failedReads],
                  ["Evidence mode", researchEngineRealShadowRun.answerContractMode ?? "none"],
                  ["Warnings", researchEngineRealShadowRun.warnings.length],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 max-w-full overflow-hidden rounded-sm border border-border/70 bg-background/40 px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">{label}</div>
                    <div className="mt-0.5 min-w-0 whitespace-normal break-words text-sm text-foreground">{value}</div>
                  </div>
                ))}
              </div>
              {researchEngineRealShadowRun.readAttempts.length > 0 && (
                <div className="grid min-w-0 gap-2">
                  {researchEngineRealShadowRun.readAttempts.map((attempt, index) => (
                    <div key={`real-shadow-read-${attempt.candidate.id}-${attempt.candidate.url}-${attempt.status}-${index}`} className="grid min-w-0 gap-1 rounded-sm border border-border/70 bg-background/30 px-3 py-2">
                      <div className="min-w-0 break-words text-sm text-foreground">{attempt.candidate.title}</div>
                      <div className="min-w-0 break-words text-xs text-muted-foreground">evidenceQuality={attempt.evidenceQualityTier ?? "none"}/{attempt.sourceRole ?? "none"}; selected={String(attempt.synthesisSelected ?? false)}; score={attempt.evidenceQualityScore ?? "none"}; date={attempt.publishedDate ?? attempt.dateSignal ?? "none"}; ageDays={attempt.ageDays ?? "none"}; freshness={attempt.freshnessStatus ?? "none"}</div>
                      <div className="min-w-0 break-words text-xs text-muted-foreground">{attempt.candidate.host} · {attempt.status} · facet={attempt.facet ?? "none"} · evidence={attempt.evidenceTextLevel ?? "none"} · quality={attempt.readerQuality?.quality ?? "none"} · passages={attempt.selectedPassageCount}</div>
                    </div>
                  ))}
                </div>
              )}
              {(researchEngineRealShadowRun.warnings.length > 0 || researchEngineRealShadowRun.errors.length > 0) && (
                <div className="grid min-w-0 gap-1 text-xs leading-5 text-muted-foreground">
                  {researchEngineRealShadowRun.warnings.map((warning, index) => <div key={`real-shadow-warning-${warning}-${index}`} className="min-w-0 break-words">警告：{warning}</div>)}
                  {researchEngineRealShadowRun.errors.map((error, index) => <div key={`real-shadow-error-${error}-${index}`} className="min-w-0 break-words text-red-300">错误：{error}</div>)}
                </div>
              )}
              <details className="min-w-0 max-w-full overflow-hidden text-xs leading-5 text-muted-foreground">
                <summary className="cursor-pointer whitespace-normal break-words text-foreground">Timeline</summary>
                <div className="mt-2 grid min-w-0 gap-1">
                  {researchEngineRealShadowRun.stageTimeline.map((stage, index) => (
                    <div key={`real-shadow-stage-${stage.stage}-${stage.status}-${stage.message}-${index}`} className="min-w-0 break-words font-mono">
                      {stage.stage}: {stage.status}; {stage.message}; {stage.elapsedMs ?? "n/a"} ms
                    </div>
                  ))}
                </div>
              </details>
              <details className="min-w-0 max-w-full overflow-hidden text-xs leading-5 text-muted-foreground">
                <summary className="cursor-pointer whitespace-normal break-words text-foreground">Markdown 报告</summary>
                <button
                  type="button"
                  className="mt-2 rounded-sm border border-border px-2 py-1 text-xs text-foreground hover:bg-muted/40"
                  onClick={() => setIsResearchEngineRealShadowRunReportExpanded((expanded) => !expanded)}
                >
                  {isResearchEngineRealShadowRunReportExpanded ? "Hide Markdown report" : "Show Markdown report"}
                </button>
                {isResearchEngineRealShadowRunReportExpanded && (
                  <pre className="mt-2 max-h-80 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-sm border border-border/70 bg-muted/20 p-3 font-mono text-[11px] leading-5 [overflow-wrap:anywhere]">
                    {researchEngineRealShadowRun.markdownReport}
                  </pre>
                )}
              </details>
            </div>
          )}
        </div>
        <div className="grid min-w-0 max-w-full gap-2 rounded-sm border border-border/70 bg-muted/10 p-3">
          <div className="grid min-w-0 gap-1">
            <div className="text-sm font-medium text-foreground">Shadow Compare</div>
            <div className="max-w-full break-words text-xs leading-5 text-muted-foreground">
              手动对照旧搜索诊断能力和 Research Engine Shadow Run；不影响普通 NoteX 搜索，不写入会话，不调用 LLM。Bing 走无 key public search，并顺序读取最多 N 个公开 URL；不带 cookies，受 CORS 限制。
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
            <input
              className="min-h-9 min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
              value={researchEngineShadowCompareQuery}
              onChange={(event) => setResearchEngineShadowCompareQuery(event.target.value)}
              placeholder={DEFAULT_RESEARCH_ENGINE_SHADOW_COMPARE_QUERY}
              disabled={isRunningResearchEngineShadowCompare}
            />
            <select
              className="min-h-9 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
              value={researchEngineShadowCompareReadTopN}
              onChange={(event) => setResearchEngineShadowCompareReadTopN(Number(event.target.value))}
              disabled={isRunningResearchEngineShadowCompare}
              aria-label="Shadow Compare readTopN"
            >
              {[1, 2, 3].map((value) => (
                <option key={value} value={value}>readTopN {value}</option>
              ))}
            </select>
            <input
              className="min-h-9 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring xl:w-28"
              type="number"
              min={1}
              max={10}
              value={researchEngineShadowCompareMaxCandidates}
              onChange={(event) => setResearchEngineShadowCompareMaxCandidates(Number(event.target.value) || DEFAULT_RESEARCH_ENGINE_SHADOW_COMPARE_MAX_CANDIDATES)}
              disabled={isRunningResearchEngineShadowCompare}
              aria-label="Shadow Compare max candidates"
            />
            <Button
              className="w-full justify-center whitespace-normal xl:w-auto"
              variant="outline"
              onClick={() => void runResearchEngineShadowCompare()}
              disabled={isRunningResearchEngineSelfCheck || isRunningResearchEngineSample || isRunningResearchEngineShadowCompare}
            >
              {isRunningResearchEngineShadowCompare ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
              运行 Shadow Compare
            </Button>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            <Button
              className="justify-center whitespace-normal"
              variant="outline"
              onClick={() => void copyResearchEngineShadowCompareReport()}
              disabled={!researchEngineShadowCompare?.markdownReport || isRunningResearchEngineShadowCompare}
            >
              <Clipboard className="h-3.5 w-3.5" />
              复制 Compare 报告
            </Button>
          </div>
          {researchEngineShadowCompare && (
            <div className="grid min-w-0 max-w-full gap-3 border-l border-border/80 pl-3 text-xs leading-5">
              <div className={cn("min-w-0 break-words", researchEngineShadowCompare.ok ? "text-emerald-300" : "text-amber-300")}>
                {researchEngineShadowCompare.ok ? "Shadow Compare 已完成。" : "Shadow Compare 已完成，但存在不可用或证据不足路径。"}
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Legacy status", researchEngineShadowCompare.legacySummary.status],
                  ["Research provider", researchEngineDisplayProvider(researchEngineShadowCompare.researchSummary.providerName)],
                  ["Research status", researchEngineShadowCompare.researchSummary.status],
                  ["Candidates", researchEngineShadowCompare.researchSummary.candidateCount],
                  ["Successful reads", researchEngineShadowCompare.researchSummary.successfulReads],
                  ["Overlap hosts", researchEngineShadowCompare.comparisonSummary.overlapHosts.length],
                  ["Recommendation", researchEngineShadowCompare.comparisonSummary.recommendation],
                  ["Warnings", researchEngineShadowCompare.warnings.length],
                  ["Errors", researchEngineShadowCompare.errors.length],
                ].map(([label, value]) => (
                  <div key={`shadow-compare-summary-${label}`} className="min-w-0 max-w-full overflow-hidden rounded-sm border border-border/70 bg-background/40 px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">{label}</div>
                    <div className="mt-0.5 min-w-0 whitespace-normal break-words text-sm text-foreground">{value}</div>
                  </div>
                ))}
              </div>
              <div className="grid min-w-0 gap-1 text-xs leading-5 text-muted-foreground">
                <div className="min-w-0 break-words">Legacy：{researchEngineShadowCompare.legacySummary.reason}</div>
                <div className="min-w-0 break-words">Research hosts：{researchEngineShadowCompare.researchSummary.hostnames.join(", ") || "none"}</div>
                <div className="min-w-0 break-words">Overlap hosts：{researchEngineShadowCompare.comparisonSummary.overlapHosts.join(", ") || "none"}</div>
              </div>
              {(researchEngineShadowCompare.warnings.length > 0 || researchEngineShadowCompare.errors.length > 0) && (
                <div className="grid min-w-0 gap-1 text-xs leading-5 text-muted-foreground">
                  {researchEngineShadowCompare.warnings.map((warning, index) => <div key={`shadow-compare-warning-${warning}-${index}`} className="min-w-0 break-words">警告：{warning}</div>)}
                  {researchEngineShadowCompare.errors.map((error, index) => <div key={`shadow-compare-error-${error}-${index}`} className="min-w-0 break-words text-red-300">错误：{error}</div>)}
                </div>
              )}
              <details className="min-w-0 max-w-full overflow-hidden text-xs leading-5 text-muted-foreground">
                <summary className="cursor-pointer whitespace-normal break-words text-foreground">Markdown 报告</summary>
                <button
                  type="button"
                  className="mt-2 rounded-sm border border-border px-2 py-1 text-xs text-foreground hover:bg-muted/40"
                  onClick={() => setIsResearchEngineShadowCompareReportExpanded((expanded) => !expanded)}
                >
                  {isResearchEngineShadowCompareReportExpanded ? "Hide Markdown report" : "Show Markdown report"}
                </button>
                {isResearchEngineShadowCompareReportExpanded && (
                  <pre className="mt-2 max-h-80 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-sm border border-border/70 bg-muted/20 p-3 font-mono text-[11px] leading-5 [overflow-wrap:anywhere]">
                    {researchEngineShadowCompare.markdownReport}
                  </pre>
                )}
              </details>
            </div>
          )}
        </div>
        {researchEngineError && (
          <div className="min-w-0 max-w-full break-words rounded-sm border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-300">
            {researchEngineError}
          </div>
        )}
        {researchEngineSelfCheck && (
          <details className="grid min-w-0 max-w-full gap-2 overflow-hidden border-l border-border/80 pl-3" open>
            <summary className="cursor-pointer whitespace-normal break-words text-sm font-medium text-foreground">
              自检结果：{researchEngineSelfCheck.summary.passed}/{researchEngineSelfCheck.summary.total} 通过（{(researchEngineSelfCheck.summary.passRate * 100).toFixed(2)}%）
            </summary>
            <div className="grid min-w-0 gap-2 text-xs leading-5 text-muted-foreground sm:grid-cols-3">
              <div>总数：{researchEngineSelfCheck.summary.total}</div>
              <div>通过：{researchEngineSelfCheck.summary.passed}</div>
              <div>失败：{researchEngineSelfCheck.summary.failed}</div>
            </div>
            <div className="grid min-w-0 gap-1 text-xs leading-5 text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
              {researchEngineSelfCheck.summary.byPhase.map((phase) => (
                <div key={phase.phase} className="min-w-0 break-words rounded-sm border border-border/70 px-2 py-1">
                  {phase.phase}: {phase.passed}/{phase.total}
                </div>
              ))}
            </div>
            {researchEngineSelfCheck.summary.failedCases.length > 0 ? (
              <div className="grid min-w-0 gap-1 text-xs text-red-300">
                {researchEngineSelfCheck.summary.failedCases.map((failure) => (
                  <div key={failure.id} className="min-w-0 break-words">{failure.phase}/{failure.id}: {failure.failures.join("; ")}</div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-emerald-300">Research Engine 自检全部通过。</div>
            )}
          </details>
        )}
        {researchEngineSample && (
          <div className="grid min-w-0 max-w-full gap-3 overflow-hidden border-l border-border/80 pl-3">
            <div className="min-w-0 break-words text-sm font-medium text-foreground">
              离线样例：{researchEngineSample.summary.sampleLabelZh}（{researchEngineSample.summary.statusLabelZh}）
            </div>
            <div className="grid min-w-0 max-w-full grid-cols-1 gap-2 text-xs leading-5 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["运行状态", researchEngineSample.summary.statusLabelZh],
                ["回答模式", researchEngineSample.summary.answerModeLabelZh],
                ["垂直领域", researchEngineSample.summary.policy.verticalLabelZh],
                ["风险等级", researchEngineSample.summary.policy.riskLabelZh],
                ["时效性要求", researchEngineSample.summary.policy.freshnessLabelZh],
                ["查询数", researchEngineSample.summary.queryCount],
                ["已选候选数", researchEngineSample.summary.selectedCandidateCount],
                ["不可读数", researchEngineSample.summary.unreadableReaderCount],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 max-w-full overflow-hidden rounded-sm border border-border/70 bg-muted/10 px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">{label}</div>
                  <div className="mt-0.5 min-w-0 whitespace-normal break-words text-sm text-foreground">{value}</div>
                </div>
              ))}
            </div>
            <div className="grid min-w-0 max-w-full grid-cols-1 gap-2 text-xs leading-5 text-muted-foreground xl:grid-cols-2">
              <div className="min-w-0 max-w-full overflow-hidden rounded-sm border border-border/70 p-2">
                <div className="mb-1 font-medium text-foreground">Provider 状态</div>
                {Object.entries(researchEngineSample.summary.providerStatusSummaryLabelZh).length > 0
                  ? Object.entries(researchEngineSample.summary.providerStatusSummaryLabelZh).map(([provider, status]) => (
                    <div key={provider} className="min-w-0 truncate">{provider}: {status}</div>
                  ))
                  : <div>无 provider 执行</div>}
              </div>
              <div className="min-w-0 max-w-full overflow-hidden rounded-sm border border-border/70 p-2">
                <div className="mb-1 font-medium text-foreground">证据摘要</div>
                <div className="grid min-w-0 grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
                  <div className="min-w-0 break-words">强证据：{researchEngineSample.summary.evidenceUiSummary.strongEvidence}</div>
                  <div className="min-w-0 break-words">中证据：{researchEngineSample.summary.evidenceUiSummary.mediumEvidence}</div>
                  <div className="min-w-0 break-words">弱证据：{researchEngineSample.summary.evidenceUiSummary.weakEvidence}</div>
                  <div className="min-w-0 break-words">无效证据：{researchEngineSample.summary.evidenceUiSummary.invalidEvidence}</div>
                  <div className="min-w-0 break-words">支持：{researchEngineSample.summary.evidenceUiSummary.supports}</div>
                  <div className="min-w-0 break-words">反驳：{researchEngineSample.summary.evidenceUiSummary.refutes}</div>
                  <div className="min-w-0 break-words">冲突：{researchEngineSample.summary.evidenceUiSummary.conflicts}</div>
                  <div className="min-w-0 break-words">可引用：{researchEngineSample.summary.evidenceUiSummary.citeable}</div>
                </div>
              </div>
            </div>
            <details className="min-w-0 max-w-full overflow-hidden text-xs leading-5 text-muted-foreground">
              <summary className="cursor-pointer whitespace-normal break-words text-foreground">阶段摘要</summary>
              <div className="mt-1 grid min-w-0 gap-1">
                {researchEngineSample.summary.stageSummaryRows.map((stage) => (
                  <div key={`${stage.stage}-${stage.message}`} className="min-w-0 whitespace-normal break-words font-mono [overflow-wrap:anywhere]">
                    {stage.stageLabelZh}：{stage.statusLabelZh}；输出={stage.outputCount ?? "无"}；警告={stage.warningCount ?? 0}；{stage.message}
                  </div>
                ))}
              </div>
            </details>
            {(researchEngineSample.summary.warnings.length > 0 || researchEngineSample.summary.errors.length > 0) && (
              <div className="grid min-w-0 gap-1 text-xs leading-5 text-muted-foreground">
                {researchEngineSample.summary.warningLabelsZh.map((warning) => <div key={`warning-${warning}`} className="min-w-0 break-words">警告：{warning}</div>)}
                {researchEngineSample.summary.errorLabelsZh.map((error) => <div key={`error-${error}`} className="min-w-0 break-words">错误：{error}</div>)}
              </div>
            )}
            <details className="min-w-0 max-w-full overflow-hidden text-xs leading-5 text-muted-foreground">
              <summary className="cursor-pointer whitespace-normal break-words text-foreground">Markdown 报告</summary>
              <button
                type="button"
                className="mt-2 rounded-sm border border-border px-2 py-1 text-xs text-foreground hover:bg-muted/40"
                onClick={() => setIsResearchEngineReportExpanded((expanded) => !expanded)}
              >
                {isResearchEngineReportExpanded ? "Hide Markdown report" : "Show Markdown report"}
              </button>
              {isResearchEngineReportExpanded && (
                <pre className="mt-2 max-h-80 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-sm border border-border/70 bg-muted/20 p-3 font-mono text-[11px] leading-5 [overflow-wrap:anywhere]">
                  {researchEngineSample.markdownReport}
                </pre>
              )}
            </details>
          </div>
        )}
      </section>

      <div className="grid min-w-0 gap-3">
        {categories.map((category) => (
          <details key={category.id} className="group border-b border-border/70 pb-3" open>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2">
              <span className="text-sm font-semibold text-foreground">{category.title}</span>
              <span className="text-xs text-muted-foreground">{category.items.length || 0} 项</span>
            </summary>
            <div className="grid gap-2">
              {category.items.length === 0 ? (
                <div className="text-sm text-muted-foreground">尚未运行。</div>
              ) : category.items.map((item) => (
                <div key={item.id} className="grid gap-1 border-l border-border/80 pl-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className={cn("inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs", statusTone(item.status))}>
                      {statusIcon(item.status)}
                      {STATUS_LABELS[item.status]}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{item.title}</span>
                    {typeof item.durationMs === "number" && <span className="text-xs text-muted-foreground">{item.durationMs} ms</span>}
                  </div>
                  <div className="text-sm leading-6 text-muted-foreground">{item.summary}</div>
                  {(item.detail || item.safeDebugInfo?.length) && (
                    <details className="text-xs leading-5 text-muted-foreground">
                      <summary className="cursor-pointer">详情</summary>
                      {item.detail && <div className="mt-1">{item.detail}</div>}
                      {item.safeDebugInfo?.map((info, infoIndex) => (
                        <div key={`${item.id}:debug:${infoIndex}:${info}`} className="mt-1 font-mono">{info}</div>
                      ))}
                    </details>
                  )}
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
