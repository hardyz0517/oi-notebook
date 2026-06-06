import { appendPipelineEvents, createEventBuffer } from "./eventBuffer";
import { buildAnswerContract } from "./answerContract";
import { buildExcerpt } from "./excerptBuilder";
import { buildEvidencePacket } from "./evidencePacket";
import { buildCandidatePool } from "./candidatePool";
import { canonicalizeUrl, normalizeDiscoveryResult } from "./candidateNormalizer";
import { executeDiscoveryProvider } from "./discoveryProvider";
import { createMockOiProvider } from "./mockDiscoveryProvider";
import { readMockUrl } from "./mockUrlReader";
import { selectPassages } from "./passageSelector";
import { runDiscoveryPipelineOffline } from "./discoveryPipeline";
import { buildQueryPlan } from "./queryPlanner";
import { evaluateEvidencePacket } from "./evidenceEvaluator";
import { evaluateReaderQuality } from "./readerQuality";
import { evaluateReadinessGate } from "./readinessGate";
import { buildSearchPolicyDecision } from "./searchPolicy";
import { verifyGeneratedAnswer } from "./postGenerationVerifier";
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

const phase4Cases = (): ResearchEngineSelfCheckResult[] => [
  phase2Result("discovery-no-search-no-provider", "explain Euler formula offline", (failures) => {
    const snapshot = runDiscoveryPipelineOffline({
      request: { requestId: "phase4-no-search", userQuestion: "explain Euler formula", locale: "auto" },
    });
    assertEqual(failures, "providerResponses", snapshot.providerResponses.length, 0);
    assertEqual(failures, "rawResults", snapshot.mergedRawResults.length, 0);
    assertTrue(failures, "candidate_pool_absent", !snapshot.candidatePool);
  }),
  phase2Result("discovery-docs-selects-official", "React useEffect what is it", (failures) => {
    const snapshot = runDiscoveryPipelineOffline({
      request: { requestId: "phase4-react-docs", userQuestion: "React useEffect what is it", locale: "auto" },
    });
    const providerNames = snapshot.providerResponses.map((response) => response.providerName);
    assertTrue(failures, "official_docs_provider_missing", providerNames.includes("mock_official_docs"));
    assertTrue(failures, "react_dev_raw_missing", snapshot.mergedRawResults.some((result) => result.url.includes("react.dev")));
    assertTrue(failures, "react_dev_candidate_missing", Boolean(snapshot.candidatePool?.selectedNormalizedCandidates.some((candidate) => candidate.canonical.normalizedHost === "react.dev")));
  }),
  phase2Result("discovery-oi-selects-oi-provider", "P3379 LCA implementation pitfalls", (failures) => {
    const snapshot = runDiscoveryPipelineOffline({
      request: { requestId: "phase4-oi", userQuestion: "P3379 LCA implementation pitfalls", locale: "auto" },
    });
    const providerNames = snapshot.providerResponses.map((response) => response.providerName);
    assertTrue(failures, "oi_provider_missing", providerNames.includes("mock_oi"));
    assertTrue(failures, "oi_authority_raw_missing", snapshot.mergedRawResults.some((result) => result.url.includes("luogu.com.cn") || result.url.includes("oi-wiki.org")));
  }),
  phase2Result("discovery-news-selects-news-provider", "recent OpenAI news", (failures) => {
    const snapshot = runDiscoveryPipelineOffline({
      request: { requestId: "phase4-openai-news", userQuestion: "recent OpenAI news", locale: "auto" },
    });
    const providerNames = snapshot.providerResponses.map((response) => response.providerName);
    assertTrue(failures, "news_provider_missing", providerNames.includes("mock_news"));
    assertTrue(failures, "news_or_official_source_missing", snapshot.mergedRawResults.some((result) => result.url.includes("openai.com") || result.url.includes("reuters.com")));
  }),
  phase2Result("discovery-high-risk-rumor-authority-first", "Zhang Xuefeng died rumor", (failures) => {
    const snapshot = runDiscoveryPipelineOffline({
      request: { requestId: "phase4-rumor", userQuestion: "Zhang Xuefeng died rumor", locale: "auto" },
    });
    const providerNames = snapshot.providerResponses.map((response) => response.providerName);
    const first = snapshot.candidatePool?.selectedNormalizedCandidates[0];
    assertTrue(failures, "rumor_provider_mix_missing", providerNames.includes("mock_news") && providerNames.includes("mock_web"));
    assertTrue(failures, "forum_should_not_rank_first", first?.sourceType !== "forum");
    assertTrue(failures, "authority_or_news_should_rank_first", first?.sourceType === "official" || first?.sourceType === "mainstream_news");
  }),
  phase2Result("discovery-provider-timeout-partial", "recent OpenAI news with provider timeout", (failures) => {
    const snapshot = runDiscoveryPipelineOffline({
      request: { requestId: "phase4-timeout", userQuestion: "recent OpenAI news", locale: "auto" },
      config: { scenario: { timeoutProviders: ["mock_news"] } },
    });
    assertEqual(failures, "partial", snapshot.partial, true);
    assertTrue(failures, "timeout_error_missing", snapshot.errors.some((error) => error.kind === "timeout"));
    assertTrue(failures, "web_results_should_survive", snapshot.mergedRawResults.some((result) => result.provider === "mock_web"));
  }),
  phase2Result("discovery-unsupported-provider-is-diagnostic", "React useEffect unsupported provider", (failures) => {
    const request = { requestId: "phase4-unsupported", userQuestion: "React useEffect what is it", locale: "auto" as const };
    const policy = buildSearchPolicyDecision(request);
    const plan = buildQueryPlan(request, policy);
    const provider = createMockOiProvider();
    const response = executeDiscoveryProvider(provider, {
      request,
      policy,
      queryPlan: plan,
      query: plan.queries[0],
      nowMs: 0,
    });
    assertEqual(failures, "status", response.status, "failed");
    assertEqual(failures, "errorKind", response.error?.kind ?? "unknown", "unsupported_vertical");
    assertEqual(failures, "rawResults", response.rawResults.length, 0);
  }),
  phase2Result("discovery-explicit-url-enters-pool", "https://react.dev/reference/react/useEffect summarize", (failures) => {
    const snapshot = runDiscoveryPipelineOffline({
      request: { requestId: "phase4-explicit-url", userQuestion: "https://react.dev/reference/react/useEffect summarize", locale: "auto" },
    });
    assertTrue(failures, "exact_url_provider_missing", snapshot.providerResponses.some((response) => response.providerName === "mock_exact_url"));
    assertTrue(failures, "explicit_raw_missing", snapshot.mergedRawResults.some((result) => result.url === "https://react.dev/reference/react/useEffect"));
    assertTrue(failures, "explicit_candidate_missing", Boolean(snapshot.candidatePool?.selectedCandidates.some((candidate) => candidate.url === "https://react.dev/reference/react/useEffect")));
  }),
  phase2Result("discovery-duplicate-feeds-candidate-dedupe", "React useEffect duplicate provider results", (failures) => {
    const snapshot = runDiscoveryPipelineOffline({
      request: { requestId: "phase4-duplicates", userQuestion: "React useEffect what is it", locale: "auto" },
      config: { scenario: { duplicateResults: true } },
    });
    assertTrue(failures, "raw_results_expected", snapshot.mergedRawResults.length > 1);
    assertTrue(failures, "candidate_dedupe_expected", Boolean(snapshot.candidatePool && snapshot.candidatePool.rejectedCandidates.some((item) => item.reason === "duplicate_url")));
  }),
  phase2Result("discovery-provider-priority-preserved", "React useEffect provider priority", (failures) => {
    const snapshot = runDiscoveryPipelineOffline({
      request: { requestId: "phase4-priority", userQuestion: "React useEffect what is it", locale: "auto" },
    });
    const official = snapshot.mergedRawResults.find((result) => result.provider === "mock_official_docs");
    const web = snapshot.mergedRawResults.find((result) => result.provider === "mock_web");
    assertTrue(failures, "official_priority_missing", Boolean(official?.providerPriority));
    assertTrue(failures, "web_priority_missing", Boolean(web?.providerPriority));
    assertTrue(failures, "official_priority_should_be_higher", (official?.providerPriority ?? 0) > (web?.providerPriority ?? 0));
  }),
];

const phase5Fixture = (
  id: string,
  question: string,
  source: Partial<CandidateSource>,
  options: {
    scenario?: Parameters<typeof readMockUrl>[0]["scenario"];
    budget?: { maxChars: number; maxBlocks?: number; reserveForMetadata?: number };
  } = {},
) => {
  const context = phase3Context(id, question);
  const sourceCandidate = candidate(`${id}-source`, {
    url: "https://example.com/article",
    title: id,
    host: "example.com",
    sourceType: "official",
    queryPurpose: "official",
    language: "en",
    ...source,
  });
  const readerResult = readMockUrl({
    request: context.request,
    policy: context.policy,
    queryPlan: context.queryPlan,
    candidate: sourceCandidate,
    scenario: options.scenario,
  });
  const quality = evaluateReaderQuality(readerResult);
  const selection = selectPassages({
    request: context.request,
    policy: context.policy,
    queryPlan: context.queryPlan,
    readerResult,
    quality,
    budget: options.budget,
  });
  const excerpt = buildExcerpt({
    readerResult,
    quality,
    selection,
    budget: options.budget,
  });
  return { ...context, readerResult, quality, selection, excerpt };
};

const phase5Cases = (): ResearchEngineSelfCheckResult[] => [
  phase2Result("reader-react-docs-excerpt", "React useEffect what is it", (failures) => {
    const fixture = phase5Fixture("reader-react-docs-excerpt", "React useEffect what is it", {
      url: "https://react.dev/reference/react/useEffect",
      host: "react.dev",
      title: "useEffect - React",
      sourceType: "documentation",
    });
    assertEqual(failures, "status", fixture.readerResult.status, "fetched");
    assertTrue(failures, "quality_not_none", fixture.quality.quality !== "none");
    assertTrue(failures, "heading_missing", fixture.excerpt.excerptMarkdown.includes("useEffect"));
    assertTrue(failures, "code_fence_missing", fixture.excerpt.excerptMarkdown.includes("```tsx"));
  }),
  phase2Result("reader-oi-wiki-math-intact", "P3379 LCA implementation pitfalls", (failures) => {
    const fixture = phase5Fixture("reader-oi-wiki-math-intact", "P3379 LCA implementation pitfalls", {
      url: "https://oi-wiki.org/graph/lca/",
      host: "oi-wiki.org",
      title: "Lowest Common Ancestor - OI Wiki",
      sourceType: "documentation",
    });
    assertTrue(failures, "math_missing", fixture.excerpt.excerptMarkdown.includes("$$up[v][k]"));
    assertEqual(failures, "math_not_truncated", fixture.excerpt.hasTruncatedMathBlock, false);
  }),
  phase2Result("reader-luogu-p3379-excerpt", "P3379 LCA implementation pitfalls", (failures) => {
    const fixture = phase5Fixture("reader-luogu-p3379-excerpt", "P3379 LCA implementation pitfalls", {
      url: "https://www.luogu.com.cn/problem/P3379",
      host: "luogu.com.cn",
      title: "P3379 LCA",
      sourceType: "problem_statement",
      language: "zh",
      queryPurpose: "exact_problem",
    });
    assertTrue(failures, "problem_id_missing", fixture.excerpt.excerptMarkdown.includes("P3379"));
    assertTrue(failures, "formula_missing", fixture.excerpt.excerptMarkdown.includes("dist(u,v)"));
    assertTrue(failures, "code_missing", fixture.excerpt.excerptMarkdown.includes("int lca"));
  }),
  phase2Result("reader-code-block-over-budget", "React useEffect code example", (failures) => {
    const url = "https://react.dev/reference/react/useEffect";
    const fixture = phase5Fixture("reader-code-block-over-budget", "React useEffect code example", {
      url,
      host: "react.dev",
      title: "useEffect - React",
      sourceType: "documentation",
    }, {
      scenario: { oversizedCodeUrls: [url] },
      budget: { maxChars: 360, maxBlocks: 4, reserveForMetadata: 120 },
    });
    assertTrue(failures, "large_code_warning_missing", fixture.excerpt.warnings.includes("omitted_large_code_block"));
    assertEqual(failures, "code_not_truncated", fixture.excerpt.hasTruncatedCodeBlock, false);
  }),
  phase2Result("reader-math-block-over-budget", "LCA formula implementation", (failures) => {
    const url = "https://oi-wiki.org/graph/lca/";
    const fixture = phase5Fixture("reader-math-block-over-budget", "LCA formula implementation", {
      url,
      host: "oi-wiki.org",
      title: "Lowest Common Ancestor - OI Wiki",
      sourceType: "documentation",
    }, {
      scenario: { oversizedMathUrls: [url] },
      budget: { maxChars: 360, maxBlocks: 4, reserveForMetadata: 120 },
    });
    assertTrue(failures, "large_math_warning_missing", fixture.excerpt.warnings.includes("omitted_large_math_block"));
    assertEqual(failures, "math_not_truncated", fixture.excerpt.hasTruncatedMathBlock, false);
  }),
  phase2Result("reader-homepage-weak", "company latest version", (failures) => {
    const fixture = phase5Fixture("reader-homepage-weak", "company latest version", {
      url: "https://example.com/",
      host: "example.com",
      title: "Example home",
    });
    assertEqual(failures, "status", fixture.readerResult.status, "homepage");
    assertTrue(failures, "homepage_not_strong", fixture.quality.quality !== "strong");
    assertEqual(failures, "homepage_strong_claim", fixture.quality.canSupportStrongClaim, false);
  }),
  phase2Result("reader-needs-js-warning", "React useEffect interactive docs", (failures) => {
    const fixture = phase5Fixture("reader-needs-js-warning", "React useEffect interactive docs", {
      url: "https://example.com/needs-js",
      host: "example.com",
      title: "Needs JS",
    });
    assertTrue(failures, "quality_none_or_weak", fixture.quality.quality === "none" || fixture.quality.quality === "weak");
    assertTrue(failures, "needs_js_warning_missing", fixture.excerpt.warnings.includes("needs_js"));
  }),
  phase2Result("reader-blocked-warning", "blocked source", (failures) => {
    const fixture = phase5Fixture("reader-blocked-warning", "blocked source", {
      url: "https://example.com/blocked",
      host: "example.com",
      title: "Blocked source",
    });
    assertTrue(failures, "quality_none_or_weak", fixture.quality.quality === "none" || fixture.quality.quality === "weak");
    assertTrue(failures, "blocked_warning_missing", fixture.excerpt.warnings.includes("blocked_or_unreadable"));
  }),
  phase2Result("reader-news-published-context", "recent OpenAI news", (failures) => {
    const fixture = phase5Fixture("reader-news-published-context", "recent OpenAI news", {
      url: "https://www.reuters.com/news/openai-research-product-updates",
      host: "www.reuters.com",
      title: "OpenAI announces research and product updates",
      sourceType: "mainstream_news",
      queryPurpose: "news",
    });
    assertEqual(failures, "publishedAt", fixture.readerResult.document?.metadata.publishedAt ?? "", "2026-06-04");
    assertTrue(failures, "published_line_missing", fixture.excerpt.excerptMarkdown.includes("Published: 2026-06-04"));
    assertTrue(failures, "key_paragraph_missing", fixture.excerpt.excerptMarkdown.includes("confirmed announcements"));
  }),
  phase2Result("reader-too-short-and-parse-failed", "short or broken article", (failures) => {
    const tooShort = phase5Fixture("reader-too-short-case", "short article", {
      url: "https://example.com/too-short",
      host: "example.com",
      title: "Short page",
    });
    const parseFailed = phase5Fixture("reader-parse-failed-case", "broken article", {
      url: "https://example.com/parse-failed",
      host: "example.com",
      title: "Broken page",
    });
    assertEqual(failures, "tooShortCanSupportAnswer", tooShort.quality.canSupportAnswer, false);
    assertEqual(failures, "parseFailedCanSupportAnswer", parseFailed.quality.canSupportAnswer, false);
  }),
  phase2Result("reader-high-risk-weak-not-strong", "Zhang Xuefeng died rumor", (failures) => {
    const fixture = phase5Fixture("reader-high-risk-weak-not-strong", "Zhang Xuefeng died rumor", {
      url: "https://forum.example.com/rumor",
      host: "forum.example.com",
      title: "Rumor forum thread",
      sourceType: "forum",
      queryPurpose: "rebuttal",
    });
    assertEqual(failures, "highRisk", fixture.policy.risk, "high");
    assertEqual(failures, "canSupportStrongClaim", fixture.quality.canSupportStrongClaim, false);
  }),
  phase2Result("reader-markdown-code-fence-closed", "React useEffect code example", (failures) => {
    const fixture = phase5Fixture("reader-markdown-code-fence-closed", "React useEffect code example", {
      url: "https://react.dev/reference/react/useEffect",
      host: "react.dev",
      title: "useEffect - React",
      sourceType: "documentation",
    });
    const fenceCount = (fixture.excerpt.excerptMarkdown.match(/```/g) ?? []).length;
    assertEqual(failures, "codeFenceParity", fenceCount % 2, 0);
  }),
];

const phase6Fixture = (
  id: string,
  question: string,
  sources: Array<Parameters<typeof phase5Fixture>[2] & {
    relation?: "supports" | "refutes" | "mentions" | "background" | "unknown";
    claimType?: "current_fact" | "technical_doc" | "oi_algorithm" | "rumor_check" | "news_summary" | "stable_knowledge";
    scenario?: Parameters<typeof readMockUrl>[0]["scenario"];
    budget?: { maxChars: number; maxBlocks?: number; reserveForMetadata?: number };
  }>,
) => {
  const context = phase3Context(id, question);
  const items = sources.map((source, index) => {
    const fixture = phase5Fixture(`${id}-${index + 1}`, question, source, {
      scenario: source.scenario,
      budget: source.budget,
    });
    return {
      readerResult: fixture.readerResult,
      readerQuality: fixture.quality,
      excerpt: fixture.excerpt,
      relation: source.relation,
      claimType: source.claimType,
    };
  });
  const packet = buildEvidencePacket({
    request: context.request,
    policy: context.policy,
    queryPlan: context.queryPlan,
    items,
  });
  const evaluation = evaluateEvidencePacket({ packet });
  const contract = buildAnswerContract(evaluation);
  return { ...context, packet, evaluation, contract };
};

const phase6Cases = (): ResearchEngineSelfCheckResult[] => [
  phase2Result("evidence-react-docs-direct-contract", "React useEffect what is it", (failures) => {
    const fixture = phase6Fixture("evidence-react-docs-direct-contract", "React useEffect what is it", [{
      url: "https://react.dev/reference/react/useEffect",
      host: "react.dev",
      title: "useEffect - React",
      sourceType: "documentation",
      relation: "supports",
      claimType: "technical_doc",
    }]);
    assertTrue(failures, "expected_medium_or_strong", fixture.packet.evidenceItems[0]?.evidenceStrength === "strong" || fixture.packet.evidenceItems[0]?.evidenceStrength === "medium");
    assertEqual(failures, "answerMode", fixture.contract.answerMode, "direct");
    assertEqual(failures, "mustCite", fixture.contract.mustCite, true);
  }),
  phase2Result("evidence-oi-lca-technical-support", "P3379 LCA implementation pitfalls", (failures) => {
    const fixture = phase6Fixture("evidence-oi-lca-technical-support", "P3379 LCA implementation pitfalls", [
      {
        url: "https://oi-wiki.org/graph/lca/",
        host: "oi-wiki.org",
        title: "Lowest Common Ancestor - OI Wiki",
        sourceType: "documentation",
        relation: "supports",
        claimType: "oi_algorithm",
      },
      {
        url: "https://www.luogu.com.cn/problem/P3379",
        host: "luogu.com.cn",
        title: "P3379 LCA",
        sourceType: "problem_statement",
        language: "zh",
        queryPurpose: "exact_problem",
        relation: "supports",
        claimType: "oi_algorithm",
      },
    ]);
    assertTrue(failures, "oi_answer_not_supported", fixture.evaluation.sufficient);
    assertTrue(failures, "formula_or_code_missing", fixture.packet.evidenceItems.some((item) => item.excerptMarkdown.includes("dist(u,v)") || item.excerptMarkdown.includes("up[v][k]")));
  }),
  phase2Result("evidence-homepage-not-strong", "company latest version", (failures) => {
    const fixture = phase6Fixture("evidence-homepage-not-strong", "company latest version", [{
      url: "https://example.com/",
      host: "example.com",
      title: "Example home",
      relation: "mentions",
      claimType: "current_fact",
    }]);
    assertTrue(failures, "homepage_strong_evidence", fixture.packet.evidenceItems[0]?.evidenceStrength !== "strong");
  }),
  phase2Result("evidence-needs-js-blocked-none", "React useEffect interactive docs", (failures) => {
    const fixture = phase6Fixture("evidence-needs-js-blocked-none", "React useEffect interactive docs", [
      { url: "https://example.com/needs-js", host: "example.com", title: "Needs JS", relation: "mentions" },
      { url: "https://example.com/blocked", host: "example.com", title: "Blocked", relation: "mentions" },
    ]);
    assertTrue(failures, "unreadable_should_not_support_strong", fixture.packet.evidenceItems.every((item) => item.evidenceStrength === "none"));
    assertEqual(failures, "citeableCount", fixture.packet.evidenceSummary.citeableCount, 0);
  }),
  phase2Result("evidence-high-risk-weak-refuse", "Zhang Xuefeng died rumor", (failures) => {
    const fixture = phase6Fixture("evidence-high-risk-weak-refuse", "Zhang Xuefeng died rumor", [{
      url: "https://forum.example.com/rumor",
      host: "forum.example.com",
      title: "Rumor forum thread",
      sourceType: "forum",
      queryPurpose: "rebuttal",
      relation: "mentions",
      claimType: "rumor_check",
    }]);
    assertEqual(failures, "answerMode", fixture.contract.answerMode, "refuse_current_claim");
    assertTrue(failures, "forbidden_missing", fixture.contract.forbiddenClaims.length > 0);
  }),
  phase2Result("evidence-high-risk-reliable-refute", "Zhang Xuefeng died rumor", (failures) => {
    const fixture = phase6Fixture("evidence-high-risk-reliable-refute", "Zhang Xuefeng died rumor", [{
      url: "https://openai.com/news/refute-rumor",
      host: "openai.com",
      title: "Fact check no reliable support",
      sourceType: "official",
      queryPurpose: "rebuttal",
      relation: "refutes",
      claimType: "rumor_check",
    }]);
    assertTrue(failures, "refute_not_citeable", fixture.packet.evidenceItems[0]?.canCite ?? false);
    assertTrue(failures, "should_allow_cautious_refute", fixture.contract.answerMode === "cautious" || fixture.contract.answerMode === "direct");
    assertTrue(failures, "should_not_allow_overclaim", fixture.contract.forbiddenClaims.length > 0);
  }),
  phase2Result("evidence-conflict-detection", "Zhang Xuefeng died rumor", (failures) => {
    const fixture = phase6Fixture("evidence-conflict-detection", "Zhang Xuefeng died rumor", [
      {
        url: "https://www.reuters.com/news/openai-research-product-updates",
        host: "www.reuters.com",
        title: "Claim support article",
        sourceType: "mainstream_news",
        queryPurpose: "news",
        relation: "supports",
        claimType: "rumor_check",
      },
      {
        url: "https://openai.com/news/refute-rumor",
        host: "openai.com",
        title: "Official refute article",
        sourceType: "official",
        queryPurpose: "rebuttal",
        relation: "refutes",
        claimType: "rumor_check",
      },
    ]);
    assertTrue(failures, "conflict_missing", fixture.packet.conflicts.length > 0);
    assertTrue(failures, "should_not_direct_conflict", fixture.contract.answerMode !== "direct");
  }),
  phase2Result("evidence-news-freshness-missing", "recent OpenAI news", (failures) => {
    const fixture = phase6Fixture("evidence-news-freshness-missing", "recent OpenAI news", [{
      url: "https://example.com/article",
      host: "example.com",
      title: "OpenAI news without date",
      sourceType: "mainstream_news",
      queryPurpose: "news",
      relation: "supports",
      claimType: "news_summary",
    }]);
    assertTrue(failures, "freshness_missing_reason", fixture.evaluation.missingEvidenceReasons.includes("current_or_news_answer_requires_date_hint") || fixture.evaluation.missingEvidenceReasons.includes("freshness_required_but_no_timestamp"));
    assertTrue(failures, "news_should_not_direct_without_date", fixture.contract.answerMode !== "direct");
  }),
  phase2Result("verifier-unknown-citation", "React useEffect what is it", (failures) => {
    const fixture = phase6Fixture("verifier-unknown-citation", "React useEffect what is it", [{
      url: "https://react.dev/reference/react/useEffect",
      host: "react.dev",
      title: "useEffect - React",
      sourceType: "documentation",
      relation: "supports",
      claimType: "technical_doc",
    }]);
    const verified = verifyGeneratedAnswer({ contract: fixture.contract, generatedText: "useEffect synchronizes with external systems. [[E99]]" });
    assertEqual(failures, "passed", verified.passed, false);
    assertTrue(failures, "unknown_missing", verified.unknownCitationIds.includes("E99"));
  }),
  phase2Result("verifier-must-cite", "React useEffect what is it", (failures) => {
    const fixture = phase6Fixture("verifier-must-cite", "React useEffect what is it", [{
      url: "https://react.dev/reference/react/useEffect",
      host: "react.dev",
      title: "useEffect - React",
      sourceType: "documentation",
      relation: "supports",
      claimType: "technical_doc",
    }]);
    const verified = verifyGeneratedAnswer({ contract: fixture.contract, generatedText: "useEffect synchronizes with external systems." });
    assertEqual(failures, "passed", verified.passed, false);
    assertTrue(failures, "missing_citation", verified.violations.some((item) => item.kind === "missing_required_citation"));
  }),
  phase2Result("verifier-forbidden-high-risk-claim", "Zhang Xuefeng died rumor", (failures) => {
    const fixture = phase6Fixture("verifier-forbidden-high-risk-claim", "Zhang Xuefeng died rumor", [{
      url: "https://forum.example.com/rumor",
      host: "forum.example.com",
      title: "Rumor forum thread",
      sourceType: "forum",
      relation: "mentions",
      claimType: "rumor_check",
    }]);
    const verified = verifyGeneratedAnswer({ contract: fixture.contract, generatedText: "It is confirmed dead." });
    assertEqual(failures, "passed", verified.passed, false);
    assertTrue(failures, "fallback_missing", Boolean(verified.safeFallback));
    assertTrue(failures, "forbidden_missing", verified.violations.some((item) => item.kind === "forbidden_claim"));
  }),
  phase2Result("verifier-valid-citation", "React useEffect what is it", (failures) => {
    const fixture = phase6Fixture("verifier-valid-citation", "React useEffect what is it", [{
      url: "https://react.dev/reference/react/useEffect",
      host: "react.dev",
      title: "useEffect - React",
      sourceType: "documentation",
      relation: "supports",
      claimType: "technical_doc",
    }]);
    const verified = verifyGeneratedAnswer({ contract: fixture.contract, generatedText: "useEffect synchronizes with external systems. [[E1]]" });
    assertEqual(failures, "passed", verified.passed, true);
    assertTrue(failures, "citation_missing", verified.citedEvidenceIds.includes("E1"));
  }),
  phase2Result("evidence-truncated-technical-not-strong", "React useEffect code example", (failures) => {
    const url = "https://react.dev/reference/react/useEffect";
    const fixture = phase6Fixture("evidence-truncated-technical-not-strong", "React useEffect code example", [{
      url,
      host: "react.dev",
      title: "useEffect - React",
      sourceType: "documentation",
      relation: "supports",
      claimType: "technical_doc",
      scenario: { oversizedCodeUrls: [url] },
      budget: { maxChars: 360, maxBlocks: 4, reserveForMetadata: 120 },
    }]);
    assertTrue(failures, "warning_missing", fixture.packet.evidenceItems[0]?.warnings.includes("omitted_large_code_block") ?? false);
    assertTrue(failures, "should_not_be_strong", fixture.packet.evidenceItems[0]?.evidenceStrength !== "strong");
  }),
  phase2Result("evidence-no-evidence-insufficient", "recent OpenAI news", (failures) => {
    const context = phase3Context("evidence-no-evidence-insufficient", "recent OpenAI news");
    const packet = buildEvidencePacket({ request: context.request, policy: context.policy, queryPlan: context.queryPlan, items: [] });
    const evaluation = evaluateEvidencePacket({ packet });
    const contract = buildAnswerContract(evaluation);
    assertEqual(failures, "packetStatus", packet.status, "no_evidence");
    assertEqual(failures, "answerMode", contract.answerMode, "insufficient_evidence");
  }),
];

export const runResearchEngineSelfCheck = (): ResearchEngineSelfCheckResult[] => [
  ...PHASE_1_CASES.map(phase1Result),
  ...phase2Cases(),
  ...phase3Cases(),
  ...phase4Cases(),
  ...phase5Cases(),
  ...phase6Cases(),
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
