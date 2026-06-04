import { buildQueryPlan } from "./queryPlanner";
import { buildSearchPolicyDecision } from "./searchPolicy";
import type {
  FreshnessRequirement,
  ResearchEngineSelfCheckCase,
  ResearchEngineSelfCheckResult,
  SearchMode,
  SearchRiskLevel,
} from "./types";

const SELF_CHECK_CASES: ResearchEngineSelfCheckCase[] = [
  { id: "openai-news", question: "最近 OpenAI 有什么新闻", expectedNeedSearch: true, expectedMode: "news_recent", expectedRisk: "medium", expectedFreshness: "recent" },
  { id: "person-rumor", question: "张雪峰死了吗", expectedNeedSearch: true, expectedMode: "rumor_check", expectedRisk: "high", expectedFreshness: "current" },
  { id: "react-docs", question: "React useEffect 是什么", expectedNeedSearch: true, expectedMode: "docs_technical", expectedRisk: "medium", expectedFreshness: "stable" },
  { id: "recent-word-translation", question: "最近这个词英语怎么说", expectedNeedSearch: false, expectedMode: "no_search", expectedRisk: "low", expectedFreshness: "stable" },
  { id: "p3379-lca", question: "P3379 LCA 实现坑", expectedNeedSearch: true, expectedMode: "oi_algorithm", expectedRisk: "medium", expectedFreshness: "stable" },
  { id: "centroid-tree", question: "点分树常见实现坑", expectedNeedSearch: true, expectedMode: "oi_algorithm", expectedRisk: "medium", expectedFreshness: "stable" },
  { id: "polish-text", question: "帮我润色这段文字", expectedNeedSearch: false, expectedMode: "no_search", expectedRisk: "low", expectedFreshness: "stable" },
  { id: "currency-current", question: "今天美元兑人民币汇率", expectedNeedSearch: true, expectedMode: "general_web", expectedRisk: "medium", expectedFreshness: "current" },
  { id: "tauri-command", question: "Tauri command 怎么写", expectedNeedSearch: true, expectedMode: "docs_technical", expectedRisk: "medium", expectedFreshness: "stable" },
  { id: "explicit-url", question: "https://react.dev/reference/react/useEffect 帮我总结", expectedNeedSearch: true, expectedMode: "explicit_url", expectedRisk: "medium", expectedFreshness: "stable" },
  { id: "company-version", question: "某某公司最新版本", expectedNeedSearch: true, expectedMode: "general_web", expectedRisk: "medium", expectedFreshness: "latest" },
  { id: "stable-knowledge", question: "欧拉公式是什么", expectedNeedSearch: false, expectedMode: "no_search", expectedRisk: "low", expectedFreshness: "stable" },
];

const assertEqual = <T extends string | boolean>(
  failures: string[],
  label: string,
  actual: T,
  expected: T,
): void => {
  if (actual !== expected) failures.push(`${label}: expected=${expected}, actual=${actual}`);
};

const assertPlanPresence = (
  failures: string[],
  needSearch: boolean,
  queryCount: number,
): void => {
  if (needSearch && queryCount === 0) failures.push("expected_query_plan_for_search_case");
  if (!needSearch && queryCount > 0) failures.push("no_search_case_generated_queries");
};

const assertGuardCases = (
  failures: string[],
  id: string,
  actualMode: SearchMode,
  actualFreshness: FreshnessRequirement,
  actualRisk: SearchRiskLevel,
): void => {
  if (id === "react-docs" && actualMode === "oi_algorithm") {
    failures.push("react_misclassified_as_oi_re");
  }
  if (id === "recent-word-translation" && actualMode === "news_recent") {
    failures.push("translation_recent_word_misclassified_as_news");
  }
  if (id === "person-rumor" && (actualRisk !== "high" || actualFreshness !== "current")) {
    failures.push("high_risk_rumor_did_not_require_current_strong_search");
  }
};

export const runResearchEngineSelfCheck = (): ResearchEngineSelfCheckResult[] =>
  SELF_CHECK_CASES.map((testCase) => {
    const request = { requestId: testCase.id, userQuestion: testCase.question, locale: "auto" as const };
    const policy = buildSearchPolicyDecision(request);
    const plan = buildQueryPlan(request, policy);
    const failures: string[] = [];

    assertEqual(failures, "needSearch", policy.needSearch, testCase.expectedNeedSearch);
    assertEqual(failures, "mode", policy.mode, testCase.expectedMode);
    assertEqual(failures, "risk", policy.risk, testCase.expectedRisk);
    assertEqual(failures, "freshness", policy.freshness, testCase.expectedFreshness);
    assertPlanPresence(failures, testCase.expectedNeedSearch, plan.queries.length);
    assertGuardCases(failures, testCase.id, policy.mode, policy.freshness, policy.risk);

    return {
      id: testCase.id,
      question: testCase.question,
      passed: failures.length === 0,
      failures,
      policy,
      plan,
    };
  });
