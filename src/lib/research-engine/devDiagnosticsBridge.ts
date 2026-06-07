import {
  buildDiagnosticsFromOfflineRun,
} from "./diagnosticsExporter";
import { formatDiagnosticsAsMarkdown } from "./diagnosticsFormatter";
import {
  formatResearchEngineSelfCheckReport,
  summarizeResearchEngineSelfCheck,
} from "./selfCheckReporter";
import { runResearchEngineOffline } from "./offlineOrchestrator";
import { runResearchEngineSelfCheck } from "./selfCheck";
import type {
  ResearchEngineDiagnostics,
  ResearchEngineSelfCheckSummary,
} from "./diagnosticsTypes";
import type { EvidenceSummary } from "./evidenceTypes";
import type { ResearchOfflineRunResult } from "./offlineTypes";
import type { ResearchSearchRequest } from "./types";

export type ResearchEngineDeveloperSampleId =
  | "stable"
  | "docs"
  | "oi"
  | "news"
  | "rumor"
  | "explicit_url";

export type ResearchEngineDeveloperSample = {
  id: ResearchEngineDeveloperSampleId;
  label: string;
  labelZh: string;
  question: string;
  displayQuestion: string;
};

export type ResearchEngineDeveloperSelfCheckResult = {
  summary: ResearchEngineSelfCheckSummary;
  markdownReport: string;
};

export type ResearchEngineDeveloperDiagnosticSummary = {
  runId: string;
  sampleId: ResearchEngineDeveloperSampleId;
  sampleLabel: string;
  sampleLabelZh: string;
  questionPreview: string;
  status: ResearchOfflineRunResult["status"];
  statusLabelZh: string;
  answerMode?: string;
  answerModeLabelZh: string;
  policy: {
    vertical: string;
    verticalLabelZh: string;
    risk: string;
    riskLabelZh: string;
    freshness: string;
    freshnessLabelZh: string;
    needSearch: boolean;
  };
  queryCount: number;
  providerStatusSummary: Record<string, string>;
  providerStatusSummaryLabelZh: Record<string, string>;
  selectedCandidateCount: number;
  unreadableReaderCount: number;
  evidenceSummary?: ResearchEngineDiagnostics["summary"]["evidenceSummary"];
  evidenceUiSummary: {
    strongEvidence: number;
    mediumEvidence: number;
    weakEvidence: number;
    invalidEvidence: number;
    supports: number;
    refutes: number;
    conflicts: number;
    citeable: number;
  };
  warnings: string[];
  warningLabelsZh: string[];
  errors: string[];
  errorLabelsZh: string[];
  stageSummaries: ResearchEngineDiagnostics["stageSummaries"];
  stageSummaryRows: Array<{
    stage: string;
    stageLabelZh: string;
    status: string;
    statusLabelZh: string;
    message: string;
    inputCount?: number;
    outputCount?: number;
    warningCount?: number;
  }>;
};

export type ResearchEngineDeveloperSampleResult = {
  summary: ResearchEngineDeveloperDiagnosticSummary;
  diagnostics: ResearchEngineDiagnostics;
  markdownReport: string;
};

const developerSamples: ResearchEngineDeveloperSample[] = [
  { id: "stable", label: "Stable knowledge", labelZh: "稳定知识", question: "欧拉公式是什么", displayQuestion: "欧拉公式是什么" },
  { id: "docs", label: "React docs", labelZh: "React 文档", question: "React useEffect 是什么", displayQuestion: "React useEffect 是什么" },
  { id: "oi", label: "OI / LCA", labelZh: "OI / LCA", question: "P3379 LCA 实现坑", displayQuestion: "P3379 LCA 实现坑" },
  { id: "news", label: "OpenAI news", labelZh: "OpenAI 新闻", question: "最近 OpenAI 有什么新闻", displayQuestion: "最近 OpenAI 有什么新闻" },
  { id: "rumor", label: "High-risk rumor", labelZh: "高风险传闻", question: "张雪峰死了吗", displayQuestion: "张雪峰死了吗" },
  {
    id: "explicit_url",
    label: "Explicit URL",
    labelZh: "指定链接",
    question: "https://react.dev/reference/react/useEffect 帮我总结",
    displayQuestion: "React useEffect 官方文档总结",
  },
];

const sampleRequest = (sample: ResearchEngineDeveloperSample): ResearchSearchRequest => ({
  requestId: `developer-${sample.id}`,
  userQuestion: sample.question,
  locale: "auto",
  options: {
    allowPublicWeb: false,
    offlineOnly: true,
  },
});

const preview = (value: string, maxChars: number): string => {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length <= maxChars ? compact : `${compact.slice(0, Math.max(0, maxChars - 3))}...`;
};

const labelFromMap = (map: Record<string, string>, value: string | undefined, fallback = "未知"): string =>
  value ? map[value] ?? value : fallback;

const statusLabels: Record<string, string> = {
  no_search: "无需搜索",
  ready: "可直接回答",
  cautious: "谨慎回答",
  insufficient_evidence: "证据不足",
  refused: "拒绝当前断言",
  failed: "运行失败",
};

const answerModeLabels: Record<string, string> = {
  direct: "直接回答",
  cautious: "谨慎回答",
  insufficient_evidence: "证据不足",
  refuse_current_claim: "拒绝当前断言",
  summarize_sources: "来源汇总",
};

const verticalLabels: Record<string, string> = {
  general: "通用",
  stable_knowledge: "稳定知识",
  docs_technical: "技术文档",
  oi_algorithm: "OI / 算法",
  news: "新闻",
  current_fact: "当前事实",
  rumor_check: "传闻核验",
  explicit_url: "指定链接",
};

const riskLabels: Record<string, string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
};

const freshnessLabels: Record<string, string> = {
  none: "无时效要求",
  stable: "稳定知识",
  recent: "近期",
  latest: "最新",
  current: "当前",
};

const warningLabels: Record<string, string> = {
  no_search_short_circuit: "策略判定无需搜索，已短路离线流程",
  discovery_partial: "发现阶段只有部分结果",
  no_raw_results: "没有原始发现结果",
  candidate_pool_empty: "候选池为空",
  no_selected_candidates: "没有选中的候选",
  reader_unreadable: "存在不可读结果",
  all_reader_results_unreadable: "全部阅读结果不可读",
  evidence_insufficient: "证据不足",
  verification_failed: "生成后校验失败",
};

const stageLabels: Record<string, string> = {
  policy: "策略",
  query: "查询规划",
  discovery: "发现",
  candidate: "候选池",
  scheduler: "调度",
  reader: "阅读",
  quality: "质量评估",
  passage: "段落选择",
  excerpt: "摘录",
  evidence: "证据",
  contract: "回答契约",
  verifier: "生成后校验",
};

const stageStatusLabels: Record<string, string> = {
  skipped: "已跳过",
  completed: "已完成",
  partial: "部分完成",
  failed: "失败",
};

const providerStatusLabels: Record<string, string> = {
  skipped: "已跳过",
  completed: "已完成",
  partial: "部分完成",
  failed: "失败",
  ready: "可用",
  disabled: "已禁用",
  provider_disabled: "Provider 已禁用",
  transport_unavailable: "传输不可用",
  unauthorized: "未授权",
  rate_limited: "触发限流",
  timeout: "超时",
  aborted: "已中止",
  malformed_response: "响应格式错误",
  empty_result: "无结果",
};

const toEvidenceUiSummary = (summary?: EvidenceSummary): ResearchEngineDeveloperDiagnosticSummary["evidenceUiSummary"] => ({
  strongEvidence: summary?.strongCount ?? 0,
  mediumEvidence: summary?.mediumCount ?? 0,
  weakEvidence: summary?.weakCount ?? 0,
  invalidEvidence: summary?.noneCount ?? 0,
  supports: summary?.supportsCount ?? 0,
  refutes: summary?.refutesCount ?? 0,
  conflicts: summary?.conflictCount ?? 0,
  citeable: summary?.citeableCount ?? 0,
});

const labelProviderStatuses = (statuses: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(statuses).map(([provider, status]) => [provider, labelFromMap(providerStatusLabels, status)]),
  );

export const getResearchEngineDeveloperSamples = (): ResearchEngineDeveloperSample[] =>
  developerSamples.map((sample) => ({ ...sample }));

export const runResearchEngineDeveloperSelfCheck = (): ResearchEngineDeveloperSelfCheckResult => {
  const results = runResearchEngineSelfCheck();
  return {
    summary: summarizeResearchEngineSelfCheck(results),
    markdownReport: formatResearchEngineSelfCheckReport(results),
  };
};

export const runResearchEngineDeveloperSample = (
  sampleId: ResearchEngineDeveloperSampleId,
): ResearchEngineDeveloperSampleResult => {
  const sample = developerSamples.find((item) => item.id === sampleId) ?? developerSamples[0];
  const run = runResearchEngineOffline({
    runId: `developer-sample-${sample.id}`,
    request: sampleRequest(sample),
    config: {
      developerDiagnostics: true,
      enableVerifier: true,
    },
  });
  const diagnostics = buildDiagnosticsFromOfflineRun(run, {
    exportedAtLabel: `developer-sample-${sample.id}`,
    maxPreviewChars: 180,
  });
  const report = formatDiagnosticsAsMarkdown(diagnostics);
  return {
    summary: {
      runId: run.runId,
      sampleId: sample.id,
      sampleLabel: sample.label,
      sampleLabelZh: sample.labelZh,
      questionPreview: preview(sample.question, 180),
      status: run.status,
      statusLabelZh: labelFromMap(statusLabels, run.status),
      answerMode: diagnostics.summary.answerMode,
      answerModeLabelZh: labelFromMap(answerModeLabels, diagnostics.summary.answerMode, "无"),
      policy: {
        vertical: diagnostics.snapshot.policy?.vertical ?? "unknown",
        verticalLabelZh: labelFromMap(verticalLabels, diagnostics.snapshot.policy?.vertical),
        risk: diagnostics.snapshot.policy?.risk ?? "unknown",
        riskLabelZh: labelFromMap(riskLabels, diagnostics.snapshot.policy?.risk),
        freshness: diagnostics.snapshot.policy?.freshness ?? "none",
        freshnessLabelZh: labelFromMap(freshnessLabels, diagnostics.snapshot.policy?.freshness),
        needSearch: diagnostics.snapshot.policy?.needSearch ?? false,
      },
      queryCount: diagnostics.snapshot.queryPlan?.queryCount ?? 0,
      providerStatusSummary: diagnostics.snapshot.discovery?.providerStatusSummary ?? {},
      providerStatusSummaryLabelZh: labelProviderStatuses(diagnostics.snapshot.discovery?.providerStatusSummary ?? {}),
      selectedCandidateCount: diagnostics.summary.selectedCandidateCount,
      unreadableReaderCount: diagnostics.summary.unreadableReaderCount,
      evidenceSummary: diagnostics.summary.evidenceSummary,
      evidenceUiSummary: toEvidenceUiSummary(diagnostics.summary.evidenceSummary),
      warnings: diagnostics.warnings,
      warningLabelsZh: diagnostics.warnings.map((warning) => warningLabels[warning] ?? warning),
      errors: diagnostics.errors,
      errorLabelsZh: diagnostics.errors,
      stageSummaries: diagnostics.stageSummaries,
      stageSummaryRows: diagnostics.stageSummaries.map((stage) => ({
        stage: stage.stage,
        stageLabelZh: labelFromMap(stageLabels, stage.stage),
        status: stage.status,
        statusLabelZh: labelFromMap(stageStatusLabels, stage.status),
        message: stage.message,
        inputCount: stage.inputCount,
        outputCount: stage.outputCount,
        warningCount: stage.warningCount,
      })),
    },
    diagnostics,
    markdownReport: report.markdown,
  };
};
