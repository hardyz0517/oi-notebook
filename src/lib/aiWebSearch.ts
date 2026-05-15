import type { NoteChatContextPayload } from "@/lib/api";

export type WebSearchMode = "off" | "auto";

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
  selected?: boolean;
};

export type SearchDecision = {
  shouldSearch: boolean;
  intent: ResearchIntent;
  problemId?: string;
  algorithmKeywords?: string[];
  errorKeywords?: string[];
  queries: string[];
  reason?: string;
};

const PROBLEM_PATTERNS = [
  /\bP\d{3,6}\b/gi,
  /\bCF\d{3,5}[A-Z]\d?\b/gi,
  /\b(?:ABC|ARC|AGC)\d{3}[A-H]?\b/gi,
];

const OI_DISCUSSION_KEYWORDS = ["讨论", "警示后人", "hack", "数据"];
const OI_SOLUTION_KEYWORDS = ["题解", "洛谷", "Luogu", "Codeforces", "AtCoder"];
const DEBUG_KEYWORDS = ["WA", "TLE", "RE", "MLE", "CE", "复杂度", "错误", "调试"];
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

const unique = (items: string[]): string[] => [...new Set(items.filter(Boolean))];

const collectMatches = (text: string, patterns: RegExp[]): string[] =>
  unique(patterns.flatMap((pattern) => text.match(pattern) ?? []).map((item) => item.toUpperCase()));

const collectKeywords = (text: string, keywords: string[]): string[] =>
  keywords.filter((keyword) => text.toLocaleLowerCase().includes(keyword.toLocaleLowerCase()));

const compactQuery = (query: string): string => query.replace(/\s+/g, " ").trim();

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

  if (problemIds.length > 0) {
    const problemId = problemIds[0];
    const intent: ResearchIntent = discussionKeywords.length > 0 ? "oi_discussion" : "oi_problem";
    return {
      shouldSearch: true,
      intent,
      problemId,
      algorithmKeywords: algorithmKeywords.length > 0 ? algorithmKeywords : undefined,
      errorKeywords: errorKeywords.length > 0 ? errorKeywords : undefined,
      queries: unique([
        compactQuery(`${problemId} ${solutionKeywords.includes("题解") ? "题解" : ""}`),
        discussionKeywords.length > 0 ? compactQuery(`${problemId} 讨论 警示后人`) : "",
        errorKeywords.length > 0 ? compactQuery(`${problemId} ${errorKeywords.join(" ")}`) : "",
      ]),
      reason: "Detected an OI problem id in the question or current lightweight context.",
    };
  }

  if (algorithmKeywords.length > 0) {
    return {
      shouldSearch: true,
      intent: "algorithm_reference",
      algorithmKeywords,
      errorKeywords: errorKeywords.length > 0 ? errorKeywords : undefined,
      queries: unique([
        compactQuery(`${algorithmKeywords.join(" ")} OI`),
        errorKeywords.length > 0 ? compactQuery(`${algorithmKeywords.join(" ")} ${errorKeywords.join(" ")}`) : "",
      ]),
      reason: "Detected algorithm keywords that may benefit from reference material.",
    };
  }

  if (errorKeywords.length > 0 && (solutionKeywords.length > 0 || discussionKeywords.length > 0)) {
    return {
      shouldSearch: true,
      intent: "debug_issue",
      errorKeywords,
      queries: [compactQuery(`${question} ${errorKeywords.join(" ")}`)],
      reason: "Detected OI debugging terms and source-seeking wording.",
    };
  }

  if (generalWebKeywords.length > 0) {
    return {
      shouldSearch: true,
      intent: "general_web",
      queries: [compactQuery(question)],
      reason: "Detected wording that asks for current or external web information.",
    };
  }

  return {
    shouldSearch: false,
    intent: "no_search",
    queries: [],
    reason: "No local rule indicated that web research is needed.",
  };
}
