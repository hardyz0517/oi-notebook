import type { NoteChatContextPayload } from "@/lib/api";

export type WebSearchMode = "off" | "auto";

export type WebSearchProvider = "brave" | "bocha";

export type WebSourceReliability =
  | "official"
  | "wiki"
  | "community_solution"
  | "discussion"
  | "blog"
  | "unknown";

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
  publicSearchConsent: boolean;
};

export type WebSearchRequest = {
  queries: string[];
  intent: ResearchIntent;
  problemId?: string;
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
};

export type SearchDecision = {
  shouldSearch: boolean;
  intent: ResearchIntent;
  problemId?: string;
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
];
const GENERAL_WEB_KEYWORDS = ["最新", "官网", "文档", "版本", "资料", "网页", "链接"];
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
  provider: "brave",
  braveApiKey: "",
  bochaApiKey: "",
  bochaEndpoint: "https://api.bochaai.com/v1/web-search",
  publicSearchConsent: false,
};

const normalizeWebSearchProvider = (config: Partial<WebSearchConfig> | null | undefined): WebSearchProvider => {
  if (config?.provider === "bocha" || config?.provider === "brave") {
    return config.provider;
  }
  if (typeof config?.braveApiKey === "string" && config.braveApiKey.trim()) {
    return "brave";
  }
  return "bocha";
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

const getProblemTitleCandidate = (
  input: string,
  context?: Pick<NoteChatContextPayload, "noteTitle" | "summary">,
): string => {
  const candidates = [context?.noteTitle, input, context?.summary].filter((item): item is string => !!item?.trim());
  for (const candidate of candidates) {
    const cleaned = candidate
      .replace(/\bP\d{3,6}\b/gi, " ")
      .replace(/\bCF\d{3,5}[A-Z]\d?\b/gi, " ")
      .replace(/\b(?:ABC|ARC|AGC)\d{3}[A-H]?\b/gi, " ")
      .replace(/[()[\]【】#*_`"'“”‘’:：|/\\-]+/g, " ")
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
): string[] => unique([
  trimQuery(`${problemId} 题解`),
  trimQuery(`${problemId} 洛谷 讨论`),
  trimQuery(`${problemId} 警示后人`),
  errorKeywords.length > 0 ? trimQuery(`${problemId} ${errorKeywords.join(" ")} 常见坑`) : "",
  title ? trimQuery(`${problemId} ${title} 题解`) : "",
  title && discussionKeywords.length > 0 ? trimQuery(`${problemId} ${title} 讨论`) : "",
]);

const buildAlgorithmQueries = (algorithmKeywords: string[], errorKeywords: string[]): string[] =>
  unique(algorithmKeywords.flatMap((keyword) => [
    trimQuery(`OI Wiki ${keyword}`),
    trimQuery(`${keyword} 题解`),
    trimQuery(`${keyword} 常见错误`),
    errorKeywords.length > 0 ? trimQuery(`${keyword} ${errorKeywords.join(" ")}`) : "",
  ]));

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
  if (algorithmKeywords.length > 0) {
    if (explicitWebSearchRequested || generalWebKeywords.length > 0) {
      confidence += 0.22;
      reasons.push(`识别到算法关键词：${algorithmKeywords[0]}`);
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
      algorithmKeywords: algorithmKeywords.length > 0 ? algorithmKeywords : undefined,
      errorKeywords: errorKeywords.length > 0 ? errorKeywords : undefined,
      queries: shouldSearch ? buildProblemQueries(problemId, problemTitle, discussionKeywords, errorKeywords) : [],
      confidence,
      reason: reasons.join("，") || "识别到题号，并且联网可能有帮助。",
    };
  }

  if (algorithmKeywords.length > 0 && (explicitWebSearchRequested || generalWebKeywords.length > 0)) {
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

  if (generalWebKeywords.length > 0 || explicitWebSearchRequested) {
    return {
      shouldSearch,
      intent: "general_web",
      queries: shouldSearch ? [compactQuery(question)] : [],
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
