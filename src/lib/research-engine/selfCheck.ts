import { appendPipelineEvents, createEventBuffer } from "./eventBuffer";
import { buildQueryPlan } from "./queryPlanner";
import { evaluateReadinessGate } from "./readinessGate";
import { buildSearchPolicyDecision } from "./searchPolicy";
import { createSchedulerSnapshot, scheduleCandidates, simulateSchedulerStep } from "./scheduler";
import type {
  CandidatePriority,
  CandidateSource,
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

export const runResearchEngineSelfCheck = (): ResearchEngineSelfCheckResult[] => [
  ...PHASE_1_CASES.map(phase1Result),
  ...phase2Cases(),
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
