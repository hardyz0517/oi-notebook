import { appendPipelineEvents, createEventBuffer } from "./eventBuffer";
import { buildCandidatePool } from "./candidatePool";
import { canonicalizeUrl, normalizeDiscoveryResult } from "./candidateNormalizer";
import { buildQueryPlan } from "./queryPlanner";
import { evaluateReadinessGate } from "./readinessGate";
import { buildSearchPolicyDecision } from "./searchPolicy";
import { createSchedulerSnapshot, scheduleCandidates, simulateSchedulerStep } from "./scheduler";
import type {
  CandidatePriority,
  CandidateSource,
  DiscoveryRawResult,
  ExpectedSourceType,
  FreshnessRequirement,
  PipelineEvent,
  QueryPurpose,
  ResearchEngineSelfCheckCase,
  ResearchEngineSelfCheckResult,
  ResearchLanguage,
  SearchMode,
  SearchRiskLevel,
} from "./types";

const PHASE_1_CASES: ResearchEngineSelfCheckCase[] = [
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

const assertEqual = <T extends string | boolean | number>(
  failures: string[],
  label: string,
  actual: T,
  expected: T,
): void => {
  if (actual !== expected) failures.push(`${label}: expected=${expected}, actual=${actual}`);
};

const assertTrue = (failures: string[], label: string, value: boolean): void => {
  if (!value) failures.push(label);
};

const phase1Result = (testCase: ResearchEngineSelfCheckCase): ResearchEngineSelfCheckResult => {
  const request = { requestId: testCase.id, userQuestion: testCase.question, locale: "auto" as const };
  const policy = buildSearchPolicyDecision(request);
  const plan = buildQueryPlan(request, policy);
  const failures: string[] = [];

  assertEqual(failures, "needSearch", policy.needSearch, testCase.expectedNeedSearch);
  assertEqual(failures, "mode", policy.mode, testCase.expectedMode);
  assertEqual(failures, "risk", policy.risk, testCase.expectedRisk);
  assertEqual(failures, "freshness", policy.freshness, testCase.expectedFreshness);
  if (testCase.expectedNeedSearch && plan.queries.length === 0) failures.push("expected_query_plan_for_search_case");
  if (!testCase.expectedNeedSearch && plan.queries.length > 0) failures.push("no_search_case_generated_queries");
  if (testCase.id === "react-docs" && policy.mode === "oi_algorithm") failures.push("react_misclassified_as_oi_re");
  if (testCase.id === "recent-word-translation" && policy.mode === "news_recent") failures.push("translation_recent_word_misclassified_as_news");

  return {
    id: testCase.id,
    question: testCase.question,
    passed: failures.length === 0,
    failures,
    policy,
    plan,
  };
};

const candidate = (
  id: string,
  overrides: Partial<CandidateSource> = {},
): CandidateSource => ({
  id,
  jobId: "job-self-check",
  url: `https://${id}.example.com/page`,
  title: id,
  sourceType: "official",
  priority: "preferred",
  host: `${id}.example.com`,
  language: "en",
  queryPurpose: "official",
  status: "discovered",
  readState: "not_started",
  evidence: { level: "none", reliable: false, fresh: false },
  discoveredAt: 0,
  ...overrides,
});

const phase2Result = (
  id: string,
  question: string,
  run: (failures: string[]) => void,
): ResearchEngineSelfCheckResult => {
  const request = { requestId: id, userQuestion: question, locale: "auto" as const };
  const policy = buildSearchPolicyDecision(request);
  const plan = buildQueryPlan(request, policy);
  const failures: string[] = [];
  run(failures);
  return {
    id,
    question,
    passed: failures.length === 0,
    failures,
    policy,
    plan,
  };
};

const phase2Cases = (): ResearchEngineSelfCheckResult[] => [
  phase2Result("scheduler-priority-barrier-waits", "official slow low quality fast", (failures) => {
    const candidates = [
      candidate("official-doc", { priority: "core", sourceType: "documentation", readState: "reading", status: "reading", score: 20 }),
      candidate("fast-forum", { priority: "background", sourceType: "forum", readState: "finished", status: "finished", evidence: { level: "medium", reliable: false, fresh: true }, score: 50 }),
      candidate("fast-blog", { priority: "supplemental", sourceType: "technical_blog", readState: "finished", status: "finished", evidence: { level: "medium", reliable: true, fresh: true }, score: 40 }),
    ];
    const gate = evaluateReadinessGate({
      jobId: "job-self-check",
      risk: "medium",
      nowMs: 500,
      startedAtMs: 0,
      config: { softDeadlineMs: 2500, hardDeadlineMs: 8000, priorityTopK: 1, minStrongEvidence: 1, minMediumEvidence: 2 },
      candidates,
    });
    assertEqual(failures, "canAnswerNow", gate.canAnswerNow, false);
    assertEqual(failures, "shouldWaitForPriority", gate.shouldWaitForPriority, true);
    assertEqual(failures, "outcome", gate.outcome, "wait");
  }),
  phase2Result("scheduler-priority-complete-strong-evidence", "priority complete strong evidence", (failures) => {
    const gate = evaluateReadinessGate({
      jobId: "job-self-check",
      risk: "medium",
      nowMs: 900,
      startedAtMs: 0,
      config: { softDeadlineMs: 2500, hardDeadlineMs: 8000, priorityTopK: 1, minStrongEvidence: 1, minMediumEvidence: 2 },
      candidates: [
        candidate("official-doc", { priority: "core", readState: "finished", status: "finished", evidence: { level: "strong", reliable: true, fresh: true }, score: 100 }),
      ],
    });
    assertEqual(failures, "canAnswerNow", gate.canAnswerNow, true);
    assertEqual(failures, "outcome", gate.outcome, "ready");
    assertEqual(failures, "reason", gate.reason, "evidence_threshold_and_priority_barrier_satisfied");
  }),
  phase2Result("scheduler-high-risk-weak-medium-blocked", "high risk rumor weak evidence", (failures) => {
    const gate = evaluateReadinessGate({
      jobId: "job-self-check",
      risk: "high",
      nowMs: 1000,
      startedAtMs: 0,
      config: { softDeadlineMs: 2500, hardDeadlineMs: 8000, priorityTopK: 1, minStrongEvidence: 1, minMediumEvidence: 2 },
      candidates: [
        candidate("news-a", { readState: "finished", status: "finished", evidence: { level: "medium", reliable: true, fresh: true } }),
        candidate("forum-b", { readState: "finished", status: "finished", evidence: { level: "weak", reliable: false, fresh: true } }),
      ],
    });
    assertEqual(failures, "canAnswerNow", gate.canAnswerNow, false);
    assertEqual(failures, "outcome", gate.outcome, "wait");
    assertTrue(failures, "expected_high_risk_reason", gate.reason.includes("high_risk"));
    const hardDeadlineGate = evaluateReadinessGate({
      jobId: "job-self-check",
      risk: "medium",
      nowMs: 9000,
      startedAtMs: 0,
      config: { softDeadlineMs: 2500, hardDeadlineMs: 8000, priorityTopK: 1, minStrongEvidence: 1, minMediumEvidence: 2 },
      candidates: [
        candidate("weak-blog", { readState: "finished", status: "finished", evidence: { level: "weak", reliable: false, fresh: true } }),
      ],
    });
    assertEqual(failures, "hardDeadlineCanAnswerNow", hardDeadlineGate.canAnswerNow, false);
    assertEqual(failures, "hardDeadlineShouldContinueReading", hardDeadlineGate.shouldContinueReading, false);
    assertEqual(failures, "hardDeadlineOutcome", hardDeadlineGate.outcome, "failed_insufficient_evidence");
  }),
  phase2Result("scheduler-per-host-limit", "per host limit", (failures) => {
    const candidates = [
      candidate("a1", { host: "same.example.com", priority: "core" }),
      candidate("a2", { host: "same.example.com", priority: "core" }),
      candidate("a3", { host: "same.example.com", priority: "core" }),
      candidate("b1", { host: "other.example.com", priority: "preferred" }),
    ];
    const scheduled = scheduleCandidates(createSchedulerSnapshot("job-self-check", candidates, { maxReadTargets: 4, perHostLimit: 2 }));
    const sameHostScheduled = scheduled.candidates.filter((item) => item.host === "same.example.com" && item.status === "scheduled").length;
    assertEqual(failures, "sameHostScheduled", sameHostScheduled, 2);
    assertTrue(failures, "other_host_should_get_slot", scheduled.scheduledCandidateIds.includes("b1"));
  }),
  phase2Result("scheduler-abort-late-result-zombie", "abort late result", (failures) => {
    const base = scheduleCandidates(createSchedulerSnapshot("job-self-check", [candidate("official-doc")]));
    const reading = simulateSchedulerStep(base, { nowMs: 10 });
    const aborted = simulateSchedulerStep(reading, { activeJobId: "new-job", aborted: true, finishCandidateIds: ["official-doc"], nowMs: 20 });
    assertTrue(failures, "zombie_id_missing", aborted.zombieCandidateIds.includes("official-doc"));
    assertTrue(failures, "zombie_event_missing", aborted.events.some((item) => item.type === "zombie_discarded"));
    assertEqual(failures, "zombieCandidateReadState", aborted.candidates[0]?.readState ?? "not_started", "zombie_discarded");
    assertEqual(failures, "readingListAfterAbort", aborted.readingCandidateIds.length, 0);
  }),
  phase2Result("event-buffer-coalesces-events", "event buffer coalesces many events", (failures) => {
    const events: PipelineEvent[] = Array.from({ length: 120 }, (_, index) => ({
      id: `event-${index}`,
      jobId: "job-self-check",
      type: index % 3 === 0 ? "candidate_discovered" : index % 3 === 1 ? "candidate_scheduled" : "candidate_rejected",
      createdAt: index,
      candidateId: `candidate-${index % 12}`,
    }));
    const normal = appendPipelineEvents(createEventBuffer("job-self-check", { mode: "normal", maxEvents: 10 }), events, { maxEvents: 10 });
    const developer = appendPipelineEvents(createEventBuffer("job-self-check", { mode: "developer", maxDeveloperEvents: 30 }), events, { maxDeveloperEvents: 30 });
    assertTrue(failures, "normal_not_compressed", normal.retainedEvents.length <= 10);
    assertTrue(failures, "developer_limit_not_enforced", developer.retainedEvents.length <= 30);
    assertEqual(failures, "normalSeen", normal.totalEventsSeen, 120);
  }),
];

const rawResult = (
  id: string,
  overrides: Partial<DiscoveryRawResult>,
): DiscoveryRawResult => ({
  id,
  provider: "mock",
  providerPriority: 1,
  query: "self-check",
  queryPurpose: "recall",
  queryLanguage: "mixed",
  resultIndex: 0,
  url: `https://${id}.example.com/page`,
  title: id,
  snippet: id,
  ...overrides,
});

const phase3Context = (id: string, question: string) => {
  const request = { requestId: id, userQuestion: question, locale: "auto" as const };
  const policy = buildSearchPolicyDecision(request);
  const plan = buildQueryPlan(request, policy);
  return { request, policy, queryPlan: plan, plan };
};

const phase3Cases = (): ResearchEngineSelfCheckResult[] => [
  phase2Result("candidate-url-canonicalize-tracking", "canonicalize url tracking params", (failures) => {
    const canonical = canonicalizeUrl("https://example.com/a?utm_source=x&id=1&utm_medium=y", { title: "Example" });
    assertEqual(failures, "canonicalUrl", canonical.canonicalUrl, "https://example.com/a?id=1");
    assertTrue(failures, "tracking_param_removed", !canonical.canonicalUrl.includes("utm_source"));
    const withBusinessParams = canonicalizeUrl("https://example.com/a?p=2&q=target&id=1", { title: "Example" });
    assertTrue(failures, "business_params_preserved", withBusinessParams.canonicalUrl.includes("id=1") && withBusinessParams.canonicalUrl.includes("p=2") && withBusinessParams.canonicalUrl.includes("q=target"));
  }),
  phase2Result("candidate-redirect-unwrap", "unwrap search redirect url", (failures) => {
    const canonical = canonicalizeUrl("https://www.bing.com/ck/a?url=https%3A%2F%2Freact.dev%2Freference%2Freact%2FuseEffect&utm_source=x", { title: "useEffect" });
    assertEqual(failures, "canonicalUrl", canonical.canonicalUrl, "https://react.dev/reference/react/useEffect");
    assertEqual(failures, "redirectUnwrapped", canonical.redirectUnwrapped, true);
    const normalSearch = canonicalizeUrl("https://www.bing.com/search?q=react+useeffect", { title: "Bing search" });
    assertEqual(failures, "normalSearchNotUnwrapped", normalSearch.redirectUnwrapped, false);
  }),
  phase2Result("candidate-dedupe-canonical-url", "dedupe same canonical url", (failures) => {
    const context = phase3Context("phase3-dedupe-url", "React useEffect 是什么");
    const pool = buildCandidatePool({
      ...context,
      rawResults: [
        rawResult("react-a", { url: "https://react.dev/reference/react/useEffect?utm_source=a", title: "useEffect - React", resultIndex: 0 }),
        rawResult("react-b", { url: "https://react.dev/reference/react/useEffect?utm_medium=b", title: "useEffect | React", resultIndex: 1 }),
      ],
    });
    assertEqual(failures, "dedupedCount", pool.dedupedCount, 1);
    assertTrue(failures, "duplicate_url_rejected", pool.rejectedCandidates.some((item) => item.reason === "duplicate_url"));
  }),
  phase2Result("candidate-dedupe-host-title", "dedupe same host normalized title", (failures) => {
    const first = normalizeDiscoveryResult(rawResult("title-a", { url: "https://example.com/a", title: "React useEffect - 知乎", snippet: "same copied summary", resultIndex: 0 }));
    const second = normalizeDiscoveryResult(rawResult("title-b", { url: "https://example.com/b", title: "react   useeffect", snippet: "same copied summary", resultIndex: 1 }));
    const context = phase3Context("phase3-dedupe-title", "React useEffect 是什么");
    const pool = buildCandidatePool({ ...context, rawResults: [first.raw, second.raw] });
    assertEqual(failures, "dedupedCount", pool.dedupedCount, 1);
    assertTrue(failures, "duplicate_title_host_rejected", pool.rejectedCandidates.some((item) => item.reason === "duplicate_title_host"));
    const distinctPool = buildCandidatePool({
      ...context,
      rawResults: [
        rawResult("title-c", { url: "https://example.com/c", title: "react useeffect", snippet: "first page", resultIndex: 0 }),
        rawResult("title-d", { url: "https://example.com/d", title: "react useeffect", snippet: "different page", resultIndex: 1 }),
      ],
    });
    assertEqual(failures, "distinctSameTitleKept", distinctPool.dedupedCount, 2);
  }),
  phase2Result("candidate-docs-ranking", "React useEffect docs ranking", (failures) => {
    const context = phase3Context("phase3-docs-ranking", "React useEffect 是什么");
    const pool = buildCandidatePool({
      ...context,
      rawResults: [
        rawResult("seo-react", { url: "https://blog.csdn.net/react_useeffect", title: "React useEffect 完全指南", snippet: "SEO tutorial", resultIndex: 0 }),
        rawResult("official-react", { url: "https://react.dev/reference/react/useEffect", title: "useEffect - React", snippet: "React reference docs", resultIndex: 1 }),
      ],
    });
    assertEqual(failures, "topHost", pool.selectedNormalizedCandidates[0]?.canonical.normalizedHost ?? "", "react.dev");
    assertEqual(failures, "topSourceType", pool.selectedNormalizedCandidates[0]?.sourceType ?? "unknown", "docs");
  }),
  phase2Result("candidate-oi-ranking", "P3379 LCA OI ranking", (failures) => {
    const context = phase3Context("phase3-oi-ranking", "P3379 LCA 实现坑");
    const pool = buildCandidatePool({
      ...context,
      rawResults: [
        rawResult("seo-lca", { url: "https://blog.csdn.net/lca_p3379", title: "P3379 LCA 题解", snippet: "转载题解", resultIndex: 0 }),
        rawResult("oiwiki-lca", { url: "https://oi-wiki.org/graph/lca/", title: "最近公共祖先 - OI Wiki", snippet: "LCA algorithm", resultIndex: 1 }),
        rawResult("luogu-p3379", { url: "https://www.luogu.com.cn/problem/P3379", title: "P3379 最近公共祖先", snippet: "problem statement", resultIndex: 2 }),
      ],
    });
    const topHosts = pool.selectedNormalizedCandidates.slice(0, 2).map((item) => item.canonical.normalizedHost);
    assertTrue(failures, "oi_sources_should_rank_first", topHosts.includes("oi-wiki.org") || topHosts.includes("luogu.com.cn"));
    assertTrue(failures, "seo_should_not_be_first", pool.selectedNormalizedCandidates[0]?.canonical.normalizedHost !== "blog.csdn.net");
  }),
  phase2Result("candidate-diversity-per-host-limit", "diversity per host limit", (failures) => {
    const context = phase3Context("phase3-diversity", "最近 OpenAI 有什么新闻");
    const rawResults = [
      rawResult("same-1", { url: "https://news.example.com/a", title: "OpenAI news A", sourceTypeHint: "mainstream_news", resultIndex: 0 }),
      rawResult("same-2", { url: "https://news.example.com/b", title: "OpenAI news B", sourceTypeHint: "mainstream_news", resultIndex: 1 }),
      rawResult("same-3", { url: "https://news.example.com/c", title: "OpenAI news C", sourceTypeHint: "mainstream_news", resultIndex: 2 }),
      rawResult("other-1", { url: "https://openai.com/news/a", title: "OpenAI announcements", resultIndex: 3 }),
    ];
    const pool = buildCandidatePool({ ...context, rawResults, config: { maxSelected: 4, perHostLimit: 2 } });
    assertTrue(failures, "same_host_limited", (pool.hostDistribution["news.example.com"] ?? 0) <= 2);
    assertTrue(failures, "other_host_selected", Boolean(pool.hostDistribution["openai.com"]));
  }),
  phase2Result("candidate-high-risk-rumor-ranking", "high risk rumor source priority", (failures) => {
    const context = phase3Context("phase3-rumor", "张雪峰死了吗");
    const pool = buildCandidatePool({
      ...context,
      rawResults: [
        rawResult("forum-rumor", { url: "https://tieba.example.com/post/1", title: "张雪峰死亡传言", snippet: "论坛传言", sourceTypeHint: "forum", resultIndex: 0 }),
        rawResult("news-rebuttal", { url: "https://www.thepaper.cn/newsDetail_forward_1", title: "张雪峰 最新消息 辟谣", snippet: "权威媒体消息", resultIndex: 1, publishedAt: "2026-06-04" }),
        rawResult("official-activity", { url: "https://open.example.com/zhangxuefeng/activity", title: "张雪峰 近期公开活动", snippet: "公开活动", sourceTypeHint: "official", resultIndex: 2, publishedAt: "2026-06-04" }),
      ],
    });
    const first = pool.selectedNormalizedCandidates[0];
    assertTrue(failures, "authoritative_source_first", first?.sourceType === "official" || first?.sourceType === "mainstream_news");
    assertTrue(failures, "forum_not_first", first?.sourceType !== "forum");
  }),
];

export const runResearchEngineSelfCheck = (): ResearchEngineSelfCheckResult[] => [
  ...PHASE_1_CASES.map(phase1Result),
  ...phase2Cases(),
  ...phase3Cases(),
];

export type {
  CandidatePriority,
  ExpectedSourceType,
  FreshnessRequirement,
  QueryPurpose,
  ResearchLanguage,
  SearchMode,
  SearchRiskLevel,
};
