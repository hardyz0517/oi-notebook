import { buildDiagnosticsFromSelfCheck } from "./diagnosticsExporter";
import { formatResearchEngineSelfCheckReport } from "./selfCheckReporter";
import type {
  ResearchEngineDiagnostics,
  ResearchEngineDiagnosticMarkdownReport,
  ResearchEngineDiagnosticSection,
} from "./diagnosticsTypes";
import type { ResearchEngineSelfCheckResult } from "./types";

const line = (label: string, value: unknown): string => `- ${label}: ${value ?? "n/a"}`;

export const formatDiagnosticSectionAsMarkdown = (
  section: ResearchEngineDiagnosticSection,
): string => {
  const lines = [
    `## ${section.title}`,
    "",
    line("Severity", section.severity),
    line("Summary", section.summary),
  ];
  if (section.rows.length > 0) {
    lines.push("", "```json", JSON.stringify(section.rows.slice(0, 20), null, 2), "```");
  }
  return lines.join("\n");
};

export const formatDiagnosticsAsMarkdown = (
  diagnostics: ResearchEngineDiagnostics,
): ResearchEngineDiagnosticMarkdownReport => {
  const lines = [
    "# Research Engine Diagnostics",
    "",
    "## Overview",
    "",
    line("Run ID", diagnostics.runId ?? "n/a"),
    line("Exported", diagnostics.exportedAtLabel),
    line("Status", diagnostics.summary.status),
    line("Request", diagnostics.requestPreview ?? "n/a"),
    line("Answer mode", diagnostics.summary.answerMode ?? "n/a"),
    line("Warnings", diagnostics.summary.warningCount),
    line("Errors", diagnostics.summary.errorCount),
    line("Redacted", diagnostics.redaction.redacted),
    "",
    "## Stage Status",
    "",
    ...diagnostics.stageSummaries.map((stage) =>
      `- ${stage.stage}: ${stage.status} (${stage.message})`
    ),
    "",
    "## Provider Status",
    "",
    "```json",
    JSON.stringify(diagnostics.snapshot.discovery?.providerStatusSummary ?? {}, null, 2),
    "```",
    "",
    "## Candidate Pool",
    "",
    "```json",
    JSON.stringify(diagnostics.snapshot.candidatePool ?? {}, null, 2),
    "```",
    "",
    "## Reader Quality",
    "",
    "```json",
    JSON.stringify(diagnostics.snapshot.reader ?? {}, null, 2),
    "```",
    "",
    "## Evidence Summary",
    "",
    "```json",
    JSON.stringify(diagnostics.snapshot.evidence ?? {}, null, 2),
    "```",
    "",
    "## Answer Contract",
    "",
    "```json",
    JSON.stringify(diagnostics.snapshot.contract ?? {}, null, 2),
    "```",
    "",
    "## Verifier",
    "",
    "```json",
    JSON.stringify(diagnostics.snapshot.verifier ?? {}, null, 2),
    "```",
  ];
  if (diagnostics.messages.length > 0) {
    lines.push("", "## Warnings / Errors", "");
    for (const message of diagnostics.messages) {
      lines.push(`- [${message.severity}] ${message.stage}: ${message.message}${message.detail ? ` - ${message.detail}` : ""}`);
    }
  }
  if (diagnostics.sections.length > 0) {
    lines.push("", "## Sections", "");
    for (const section of diagnostics.sections) lines.push(formatDiagnosticSectionAsMarkdown(section), "");
  }
  return {
    markdown: lines.join("\n"),
    diagnostics,
  };
};

export const formatSelfCheckSummaryAsMarkdown = (
  results: ResearchEngineSelfCheckResult[],
): string => formatResearchEngineSelfCheckReport(results);

export const formatDiagnosticsFromSelfCheckAsMarkdown = (
  results: ResearchEngineSelfCheckResult[],
): ResearchEngineDiagnosticMarkdownReport =>
  formatDiagnosticsAsMarkdown(buildDiagnosticsFromSelfCheck(results));
