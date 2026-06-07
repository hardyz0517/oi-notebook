import type {
  ResearchEngineSelfCheckFailureSummary,
  ResearchEngineSelfCheckPhaseSummary,
  ResearchEngineSelfCheckSummary,
} from "./diagnosticsTypes";
import type { ResearchEngineSelfCheckResult } from "./types";

const phasePatterns: Array<[string, RegExp]> = [
  ["phase_1", /^(openai-news|person-rumor|react-docs|recent-word-translation|p3379-lca|centroid-tree|polish-text|currency-current|tauri-command|explicit-url|company-version|stable-knowledge)$/],
  ["phase_2", /^(scheduler-|event-buffer-)/],
  ["phase_3", /^candidate-/],
  ["phase_4", /^discovery-/],
  ["phase_5", /^(reader-|passage-|excerpt-)/],
  ["phase_6", /^(evidence-|verifier-)/],
  ["phase_7", /^offline-/],
  ["phase_8", /^real-provider-/],
  ["phase_9", /^(diagnostics-|selfcheck-)/],
];

const preview = (value: string, max = 120): string => {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length <= max ? compact : `${compact.slice(0, Math.max(0, max - 3))}...`;
};

const phaseForId = (id: string): string =>
  phasePatterns.find(([, pattern]) => pattern.test(id))?.[0] ?? "unknown";

export const groupSelfCheckResultsByPhase = (
  results: ResearchEngineSelfCheckResult[],
): ResearchEngineSelfCheckPhaseSummary[] => {
  const groups = new Map<string, { total: number; passed: number; failed: number }>();
  for (const result of results) {
    const phase = phaseForId(result.id);
    const current = groups.get(phase) ?? { total: 0, passed: 0, failed: 0 };
    current.total += 1;
    if (result.passed) current.passed += 1;
    else current.failed += 1;
    groups.set(phase, current);
  }
  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([phase, summary]) => ({
      phase,
      ...summary,
      passRate: summary.total === 0 ? 1 : Number((summary.passed / summary.total).toFixed(4)),
    }));
};

export const summarizeResearchEngineSelfCheck = (
  results: ResearchEngineSelfCheckResult[],
): ResearchEngineSelfCheckSummary => {
  const passed = results.filter((result) => result.passed).length;
  const failedCases: ResearchEngineSelfCheckFailureSummary[] = results
    .filter((result) => !result.passed)
    .map((result) => ({
      id: result.id,
      phase: phaseForId(result.id),
      questionPreview: preview(result.question),
      failures: result.failures.slice(0, 8),
    }));
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: results.length === 0 ? 1 : Number((passed / results.length).toFixed(4)),
    byPhase: groupSelfCheckResultsByPhase(results),
    failedCases,
  };
};

export const formatResearchEngineSelfCheckReport = (
  results: ResearchEngineSelfCheckResult[],
): string => {
  const summary = summarizeResearchEngineSelfCheck(results);
  const lines = [
    "# Research Engine SelfCheck",
    "",
    `Total: ${summary.total}`,
    `Passed: ${summary.passed}`,
    `Failed: ${summary.failed}`,
    `Pass rate: ${(summary.passRate * 100).toFixed(2)}%`,
    "",
    "## By Phase",
    ...summary.byPhase.map((phase) =>
      `- ${phase.phase}: ${phase.passed}/${phase.total} passed (${(phase.passRate * 100).toFixed(2)}%)`
    ),
  ];
  if (summary.failedCases.length > 0) {
    lines.push("", "## Failures");
    for (const failure of summary.failedCases) {
      lines.push(`- ${failure.phase}/${failure.id}: ${failure.failures.join("; ")}`);
    }
  }
  return lines.join("\n");
};
