import { useMemo, useRef, useState } from "react";
import { CheckCircle2, Clipboard, Loader2, Play, PlugZap, Search, TriangleAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getLocalNoteIndexStatus,
  getPromptCitationContractStatus,
  getWebCacheStatus,
  searchLocalNotes,
  testWebSearchConnection,
  type AiConfig,
  type LocalNoteIndexStatusResult,
  type WebCacheStatusResult,
} from "@/lib/api";
import { buildSearchDecision, normalizeWebSearchConfig, type SearchDecision, type WebSearchConfig } from "@/lib/aiWebSearch";
import { findCitationMarkerMatches, getUsedCitationIdList, stripMarkdownRegionsForCitationScan } from "@/lib/citations";
import { cn } from "@/lib/utils";

type DiagnosticStatus = "pass" | "warn" | "fail" | "skipped" | "running";
type DiagnosticCategoryId = "decision" | "provider-config" | "provider-test" | "web-cache" | "local-index" | "local-search" | "citations" | "prompt-contract";

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
  { id: "decision", title: "搜索决策", items: [] },
  { id: "provider-config", title: "Provider 配置", items: [] },
  {
    id: "provider-test",
    title: "当前 Provider 测试",
    items: [{ id: "provider-test-skipped", title: "在线连通性测试", status: "skipped", summary: "不会自动发起公网请求；点击“测试当前 Provider”后才运行。" }],
  },
  { id: "web-cache", title: "Web Cache", items: [] },
  { id: "local-index", title: "本地索引", items: [] },
  { id: "local-search", title: "本地检索", items: [] },
  { id: "citations", title: "引用渲染", items: [] },
  { id: "prompt-contract", title: "Prompt 合约", items: [] },
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
  if (lower.includes("timeout") || message.includes("超时")) return "搜索 Provider 测试超时。";
  if (message.includes("429") || lower.includes("rate limit") || lower.includes("too many requests")) return "Provider 返回 429 或限流，可以稍后重试。";
  if (message.includes("401") || message.includes("403") || lower.includes("unauthorized") || lower.includes("forbidden")) return "Provider 返回 401/403，API Key 或权限可能有问题。";
  if (lower.includes("json") || message.includes("JSON")) return "Provider 返回格式不符合预期，请检查 Endpoint 是否为 API 地址。";
  if (lower.includes("dns") || lower.includes("connect") || lower.includes("tls") || lower.includes("network") || message.includes("网络")) return "网络、DNS、连接或 TLS 可能不可用。";
  return truncate(message, 220);
};

const summarizeDecision = (decision: SearchDecision): string =>
  `shouldSearch=${decision.shouldSearch}; intent=${decision.intent}; problemId=${decision.problemId ?? "none"}; queryCount=${decision.queries.length}`;

const queryPreview = (decision: SearchDecision): string =>
  decision.queries.slice(0, 3).map((query) => truncate(query, 90)).join(" | ") || "none";

const hasQueryKeyword = (decision: SearchDecision, keywords: string[]): boolean => {
  const haystack = decision.queries.join(" ").toLocaleLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword.toLocaleLowerCase()));
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
      id: "ai-news",
      input: "最近有什么 AI 新闻？",
      expected: "shouldSearch=true, intent=general_web, query 保留最近/AI/新闻/最新语义。",
      check: (decision) => decision.shouldSearch && decision.intent === "general_web" && !decision.problemId && hasQueryKeyword(decision, ["最近", "AI", "新闻", "最新"]),
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
      safeDebugInfo: [`queryPreview=${queryPreview(decision)}`, `confidence=${decision.confidence ?? "n/a"}`],
    });
  });
};

const buildProviderConfigDiagnostics = (config: WebSearchConfig, rawProvider?: string): DiagnosticItem[] => {
  const items: DiagnosticItem[] = [];
  if (rawProvider?.trim().toLocaleLowerCase() === "searxng") {
    items.push({
      id: "provider-legacy-searxng",
      title: "历史 Provider",
      status: "warn",
      summary: "历史 Provider 已移除，请选择 Bocha 或 Brave。",
    });
  }
  items.push({
    id: "provider-selected",
    title: "当前 Provider",
    status: config.provider === "bocha" || config.provider === "brave" ? "pass" : "fail",
    summary: `provider=${config.provider}`,
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
    summary: config.publicSearchConsent ? "publicSearchConsent=enabled" : "publicSearchConsent=disabled；在线 Provider 测试前应明确知道会发起外部请求。",
  });
  items.push({
    id: "provider-keys",
    title: "API Key 状态",
    status: !config.bochaApiKey && !config.braveApiKey ? "warn" : (config.provider === "bocha" && !config.bochaApiKey) || (config.provider === "brave" && !config.braveApiKey) ? "warn" : "pass",
    summary: !config.bochaApiKey && !config.braveApiKey
      ? "未配置联网搜索 Provider；本地笔记检索和普通 AI 对话不受影响。"
      : `Bocha=${config.bochaApiKey ? "present" : "missing"}; Brave=${config.braveApiKey ? "present" : "missing"}`,
  });
  items.push({
    id: "provider-endpoints",
    title: "Endpoint 状态",
    status: "pass",
    summary: `Bocha=${config.bochaEndpoint ? safeDomain(config.bochaEndpoint) : "default"}; Brave=built-in`,
  });
  return items;
};

const buildWebCacheItem = (status: WebCacheStatusResult): DiagnosticItem => ({
  id: "web-cache-status",
  title: "Web cache 目录",
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
  status: !status.exists ? "warn" : status.readable ? "pass" : "fail",
  summary: status.exists
    ? `${status.pathLabel} notes=${status.noteCount}, chunks=${status.chunkCount}, version=${status.version ?? "unknown"}`
    : `${status.pathLabel} 尚不存在；首次本地检索后可能建立。`,
  detail: status.lastError
    ? `索引读取失败：${truncate(status.lastError, 220)}。可运行一次本地笔记检索，后续再考虑重建索引。`
    : `updatedAt=${status.updatedAt ?? "unknown"}; sample=${status.sampleRelativePaths.slice(0, 3).join(", ") || "none"}`,
  safeDebugInfo: [`size=${status.approxSizeBytes} bytes`, `readable=${status.readable}`, `writable=${status.writable}`],
});

const buildCitationDiagnostics = (): DiagnosticItem[] => {
  const cases = [
    {
      id: "standard",
      title: "标准 token 识别",
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
    title: "Prompt citation contract 静态检查",
    status: checks.every(Boolean) ? "pass" : checks.some(Boolean) ? "warn" : "fail",
    summary: `webIds=${status.webAvailableIds}; webMarker=${status.webMarkerInstruction}; localIds=${status.localAvailableIds}; localMarker=${status.localMarkerInstruction}; bareIdWarning=${status.bareIdWarning}`,
    detail: "只检查关键约束字符串是否仍存在，不返回 Prompt 全文。",
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

export default function SearchDiagnosticsPanel({ aiConfigDraft }: SearchDiagnosticsPanelProps) {
  const [categories, setCategories] = useState<DiagnosticCategory[]>(emptyCategories);
  const [isRunningCore, setIsRunningCore] = useState(false);
  const [isTestingProvider, setIsTestingProvider] = useState(false);
  const [isCheckingLocalIndex, setIsCheckingLocalIndex] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const runIdRef = useRef(0);

  const webSearchConfig = useMemo(
    () => aiConfigDraft ? normalizeWebSearchConfig(aiConfigDraft.web_search) : null,
    [aiConfigDraft],
  );
  const rawWebSearchProvider = (aiConfigDraft?.web_search as unknown as { provider?: string } | undefined)?.provider;

  const counts = useMemo(() => {
    const result: Record<DiagnosticStatus, number> = { pass: 0, warn: 0, fail: 0, skipped: 0, running: 0 };
    for (const item of categories.flatMap((category) => category.items)) result[item.status] += 1;
    return result;
  }, [categories]);

  const replaceCategory = (runId: number, categoryId: DiagnosticCategoryId, items: DiagnosticItem[]) => {
    if (runIdRef.current !== runId) return;
    setCategories((current) => current.map((category) => category.id === categoryId ? { ...category, items } : category));
  };

  const runLocalSearch = async (runId: number) => {
    replaceCategory(runId, "local-search", [{ id: "local-search-running", title: "本地检索测试", status: "running", summary: "正在检索本地笔记..." }]);
    const startedAt = performance.now();
    try {
      const results = await withTimeout(searchLocalNotes({
        query: "点分树常见实现坑",
        algorithmKeywords: ["点分树", "动态点分治", "重心分治"],
        maxResults: 3,
        maxCharsPerResult: 500,
      }), 5000, "本地检索测试超时");
      const keywordHit = results.some((result) => /点分树|动态点分治|重心分治/.test(`${result.title} ${result.snippet}`));
      replaceCategory(runId, "local-search", [durationItem(startedAt, {
        id: "local-search-test",
        title: "点分树本地检索",
        status: results.length === 0 ? "warn" : keywordHit ? "pass" : "warn",
        summary: results.length === 0 ? "没有找到相关笔记。如果你没有点分树笔记，这是正常的。" : `命中 ${results.length} 条；keywordHit=${keywordHit}`,
        detail: "只调用本地 search_local_notes，不上传笔记到外部服务。",
        safeDebugInfo: results.slice(0, 3).map((result) => `${result.relativePath || result.path}: ${truncate(result.snippet, 120)}`),
      })]);
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
    replaceCategory(runId, "provider-config", webSearchConfig
      ? buildProviderConfigDiagnostics(webSearchConfig, rawWebSearchProvider)
      : [{ id: "provider-config-missing", title: "Provider 配置", status: "warn", summary: "AI 配置尚未读取完成。" }]);
    replaceCategory(runId, "citations", buildCitationDiagnostics());

    const storageTasks = [
      getWebCacheStatus()
        .then((status) => replaceCategory(runId, "web-cache", [buildWebCacheItem(status)]))
        .catch((error) => replaceCategory(runId, "web-cache", [{ id: "web-cache-error", title: "Web cache 状态", status: "fail", summary: classifyError(error) }])),
      getLocalNoteIndexStatus()
        .then((status) => replaceCategory(runId, "local-index", [buildLocalIndexItem(status)]))
        .catch((error) => replaceCategory(runId, "local-index", [{ id: "local-index-error", title: "本地索引状态", status: "fail", summary: classifyError(error) }])),
      buildPromptContractItems()
        .then((items) => replaceCategory(runId, "prompt-contract", items))
        .catch((error) => replaceCategory(runId, "prompt-contract", [{ id: "prompt-contract-error", title: "Prompt 合约", status: "warn", summary: classifyError(error) }])),
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

  const runProviderTest = async () => {
    if (!webSearchConfig) {
      toast.error("AI 配置尚未读取完成");
      return;
    }
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setIsTestingProvider(true);
    replaceCategory(runId, "provider-test", [{ id: "provider-test-running", title: "在线连通性测试", status: "running", summary: "正在发送一个小测试 query..." }]);
    const startedAt = performance.now();
    try {
      if (webSearchConfig.provider === "bocha" && !webSearchConfig.bochaApiKey) throw new Error("Bocha API Key missing");
      if (webSearchConfig.provider === "brave" && !webSearchConfig.braveApiKey) throw new Error("Brave API Key missing");
      const result = await withTimeout(testWebSearchConnection({
        provider: webSearchConfig.provider,
        apiKey: webSearchConfig.provider === "bocha" ? webSearchConfig.bochaApiKey : webSearchConfig.braveApiKey,
        endpoint: webSearchConfig.provider === "bocha" ? webSearchConfig.bochaEndpoint : undefined,
      }), 5000, "公开搜索测试超时");
      replaceCategory(runId, "provider-test", [durationItem(startedAt, {
        id: "provider-test-online",
        title: "在线连通性测试",
        status: "pass",
        summary: `provider=${result.provider}; endpoint=${result.endpoint ? safeDomain(result.endpoint) : "built-in"}`,
        detail: "只发送一个公开搜索测试 query，不读取 Cookie、历史记录或登录态。",
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

  return (
    <section className="grid min-w-0 gap-5">
      <div className="grid gap-1 border-b border-border/80 pb-4">
        <div className="text-base font-semibold text-foreground">搜索自检</div>
        <div className="max-w-4xl text-sm leading-6 text-muted-foreground">
          检查搜索决策、Provider、本地索引、缓存和引用渲染。默认自检不读取浏览器数据，不修改笔记，也不会上传本地笔记或 API Key。
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void runCoreDiagnostics()} disabled={isRunningCore || isTestingProvider || isCheckingLocalIndex}>
          {isRunningCore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          运行核心自检
        </Button>
        <Button variant="outline" onClick={runProviderTest} disabled={isRunningCore || isTestingProvider || isCheckingLocalIndex || !webSearchConfig}>
          {isTestingProvider ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
          测试当前 Provider
        </Button>
        <Button variant="outline" onClick={() => void checkLocalIndex()} disabled={isRunningCore || isTestingProvider || isCheckingLocalIndex}>
          {isCheckingLocalIndex ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          检查本地索引
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
          上次运行：{lastRunAt ?? "尚未运行"}。在线 Provider 测试只会在手动点击时发起外部请求。
        </div>
      </div>

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
                      {item.safeDebugInfo?.map((info) => (
                        <div key={info} className="mt-1 font-mono">{info}</div>
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
