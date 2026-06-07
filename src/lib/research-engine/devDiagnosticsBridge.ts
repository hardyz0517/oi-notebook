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
  question: string;
};

export type ResearchEngineDeveloperSelfCheckResult = {
  summary: ResearchEngineSelfCheckSummary;
  markdownReport: string;
};

export type ResearchEngineDeveloperDiagnosticSummary = {
  runId: string;
  sampleId: ResearchEngineDeveloperSampleId;
  sampleLabel: string;
  questionPreview: string;
  status: ResearchOfflineRunResult["status"];
  answerMode?: string;
  policy: {
    vertical: string;
    risk: string;
    freshness: string;
    needSearch: boolean;
  };
  queryCount: number;
  providerStatusSummary: Record<string, string>;
  selectedCandidateCount: number;
  unreadableReaderCount: number;
  evidenceSummary?: ResearchEngineDiagnostics["summary"]["evidenceSummary"];
  warnings: string[];
  errors: string[];
  stageSummaries: ResearchEngineDiagnostics["stageSummaries"];
};

export type ResearchEngineDeveloperSampleResult = {
  summary: ResearchEngineDeveloperDiagnosticSummary;
  diagnostics: ResearchEngineDiagnostics;
  markdownReport: string;
};

const developerSamples: ResearchEngineDeveloperSample[] = [
  { id: "stable", label: "Stable knowledge", question: "欧拉公式是什么" },
  { id: "docs", label: "React docs", question: "React useEffect 是什么" },
  { id: "oi", label: "OI / LCA", question: "P3379 LCA 实现坑" },
  { id: "news", label: "OpenAI news", question: "最近 OpenAI 有什么新闻" },
  { id: "rumor", label: "High-risk rumor", question: "张雪峰死了吗" },
  {
    id: "explicit_url",
    label: "Explicit URL",
    question: "https://react.dev/reference/react/useEffect 帮我总结",
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
      questionPreview: preview(sample.question, 180),
      status: run.status,
      answerMode: diagnostics.summary.answerMode,
      policy: {
        vertical: diagnostics.snapshot.policy?.vertical ?? "unknown",
        risk: diagnostics.snapshot.policy?.risk ?? "unknown",
        freshness: diagnostics.snapshot.policy?.freshness ?? "none",
        needSearch: diagnostics.snapshot.policy?.needSearch ?? false,
      },
      queryCount: diagnostics.snapshot.queryPlan?.queryCount ?? 0,
      providerStatusSummary: diagnostics.snapshot.discovery?.providerStatusSummary ?? {},
      selectedCandidateCount: diagnostics.summary.selectedCandidateCount,
      unreadableReaderCount: diagnostics.summary.unreadableReaderCount,
      evidenceSummary: diagnostics.summary.evidenceSummary,
      warnings: diagnostics.warnings,
      errors: diagnostics.errors,
      stageSummaries: diagnostics.stageSummaries,
    },
    diagnostics,
    markdownReport: report.markdown,
  };
};
