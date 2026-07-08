import type {
  PatchDiffPreview,
  PatchDiffPreviewFormat,
  PatchDiffPreviewHunk,
  PatchDryRunResult,
  PatchDryRunStatus,
  PatchFormat,
  PatchRollbackKind,
  PatchRollbackPlanMetadata,
  PatchTargetRef,
} from "./patchWorkflowTypes";

export type CreatePatchDiffPreviewInput = {
  diffPreviewId: string;
  proposalId: string;
  targetRefs: PatchTargetRef[];
  patchFormat: PatchFormat;
  unifiedDiffText: string;
  maxHunks?: number;
  maxLinesPerHunk?: number;
  createdAt: string;
};

export type ProjectPatchDryRunInput = {
  dryRunId: string;
  proposalId: string;
  status: PatchDryRunStatus;
  targetRefs: PatchTargetRef[];
  wouldChangeTargetRefIds?: string[];
  wouldCreateTargetRefIds?: string[];
  wouldDeleteTargetRefIds?: string[];
  conflicts?: string[];
  staleTargetRefIds?: string[];
  blockedTargetRefIds?: string[];
  createdAt: string;
};

export type ProjectPatchRollbackPlanInput = {
  rollbackPlanId: string;
  proposalId: string;
  targetRefs: PatchTargetRef[];
  rollbackKind: PatchRollbackKind;
  inversePatchPreviewRef?: string;
  manualRecoveryNotes?: string[];
  unavailableReasons?: string[];
  createdAt: string;
};

type ParsedHunk = Omit<PatchDiffPreviewHunk, "safePreviewLines"> & {
  rawLines: string[];
};

type RedactedLine = {
  line: string;
  redacted: boolean;
};

const DEFAULT_MAX_HUNKS = 6;
const DEFAULT_MAX_LINES_PER_HUNK = 12;

export function createPatchDiffPreview(input: CreatePatchDiffPreviewInput): PatchDiffPreview {
  const targets = input.targetRefs;
  const maxHunks = input.maxHunks ?? DEFAULT_MAX_HUNKS;
  const maxLinesPerHunk = input.maxLinesPerHunk ?? DEFAULT_MAX_LINES_PER_HUNK;
  const parsedHunks = parseUnifiedDiffHunks(input.unifiedDiffText, targets);
  const boundedHunks = parsedHunks.slice(0, maxHunks);
  let redacted = false;
  let truncated = parsedHunks.length > boundedHunks.length;

  const safeHunks = boundedHunks.map((hunk) => {
    const boundedLines = hunk.rawLines.slice(0, maxLinesPerHunk);
    if (hunk.rawLines.length > boundedLines.length) {
      truncated = true;
    }

    const safePreviewLines = boundedLines.map((line) => {
      const redactedLine = redactPreviewLine(line);
      redacted ||= redactedLine.redacted;
      return redactedLine.line;
    });

    return {
      targetRefId: hunk.targetRefId,
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.newStart,
      newLines: hunk.newLines,
      safePreviewLines,
    } satisfies PatchDiffPreviewHunk;
  });

  const stats = countUnifiedDiffStats(input.unifiedDiffText);
  const renderWarnings: string[] = [];

  if (input.patchFormat !== "unified-diff") {
    renderWarnings.push(`unsupported_preview_format:${input.patchFormat}`);
  }

  if (truncated) {
    renderWarnings.push("bounded_diff_preview_truncated");
  }

  return {
    diffPreviewId: input.diffPreviewId,
    proposalId: input.proposalId,
    targetRefs: targets.map((targetRef) => targetRef.targetRefId),
    format: previewFormatForPatchFormat(input.patchFormat),
    filesChanged: stats.filesChanged,
    insertions: stats.insertions,
    deletions: stats.deletions,
    safeHunks,
    truncated,
    redactionStatus: redacted ? "redacted" : "not-needed",
    renderWarnings,
    createdAt: input.createdAt,
  };
}

export function projectPatchDryRun(input: ProjectPatchDryRunInput): PatchDryRunResult {
  return {
    dryRunId: input.dryRunId,
    proposalId: input.proposalId,
    status: input.status,
    targetCompatibility: "supplied-metadata-only",
    wouldChangeFiles: uniqueCount(input.wouldChangeTargetRefIds),
    wouldCreateFiles: uniqueCount(input.wouldCreateTargetRefIds),
    wouldDeleteFiles: uniqueCount(input.wouldDeleteTargetRefIds),
    conflicts: [...(input.conflicts ?? [])],
    staleTargets: [...(input.staleTargetRefIds ?? [])],
    blockedTargets: [...(input.blockedTargetRefIds ?? [])],
    createdAt: input.createdAt,
  };
}

export function projectPatchRollbackPlan(input: ProjectPatchRollbackPlanInput): PatchRollbackPlanMetadata {
  const targets = input.targetRefs;
  const unavailableReasons =
    input.rollbackKind === "unavailable" && (input.unavailableReasons ?? []).length === 0
      ? ["missing_rollback_plan"]
      : [...(input.unavailableReasons ?? [])];
  const manualRecoveryNotes = [
    ...(input.manualRecoveryNotes ?? []),
    ...(unavailableReasons.includes("missing_rollback_plan")
      ? ["Missing rollback metadata raises risk before future apply."]
      : []),
  ];

  return {
    rollbackPlanId: input.rollbackPlanId,
    proposalId: input.proposalId,
    rollbackKind: input.rollbackKind,
    requiredBeforeApply: true,
    preApplyContentHashes: targets
      .filter((targetRef) => targetRef.contentHashBefore.length > 0)
      .map((targetRef) => ({
        targetRefId: targetRef.targetRefId,
        contentHashBefore: targetRef.contentHashBefore,
      })),
    affectedTargetRefs: targets.map((targetRef) => targetRef.targetRefId),
    inversePatchPreviewRef: input.inversePatchPreviewRef,
    manualRecoveryNotes,
    unavailableReasons,
    createdAt: input.createdAt,
  };
}

function parseUnifiedDiffHunks(diffText: string, targetRefs: PatchTargetRef[]): ParsedHunk[] {
  const hunks: ParsedHunk[] = [];
  let currentTargetRefId = targetRefs[0]?.targetRefId ?? "target:p13:unknown";
  let currentHunk: ParsedHunk | undefined;

  for (const line of diffText.split(/\r?\n/)) {
    if (line.startsWith("+++ ")) {
      currentTargetRefId = targetRefIdForDiffPath(line.slice(4), targetRefs);
      continue;
    }

    const hunkHeader = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunkHeader) {
      currentHunk = {
        targetRefId: currentTargetRefId,
        oldStart: Number(hunkHeader[1]),
        oldLines: Number(hunkHeader[2] ?? "1"),
        newStart: Number(hunkHeader[3]),
        newLines: Number(hunkHeader[4] ?? "1"),
        rawLines: [line],
      };
      hunks.push(currentHunk);
      continue;
    }

    if (currentHunk !== undefined && isPreviewLine(line)) {
      currentHunk.rawLines.push(line);
    }
  }

  return hunks;
}

function countUnifiedDiffStats(diffText: string): { filesChanged: number; insertions: number; deletions: number } {
  const changedFiles = new Set<string>();
  let insertions = 0;
  let deletions = 0;

  for (const line of diffText.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      changedFiles.add(line);
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      insertions += 1;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      deletions += 1;
    }
  }

  return {
    filesChanged: changedFiles.size,
    insertions,
    deletions,
  };
}

function targetRefIdForDiffPath(diffPath: string, targets: PatchTargetRef[]): string {
  const normalizedDiffPath = normalizeDiffPath(diffPath);
  const matchingTarget = targets.find(({ displayPath }) => normalizeDiffPath(displayPath) === normalizedDiffPath);

  return matchingTarget?.targetRefId ?? targets[0]?.targetRefId ?? "target:p13:unknown";
}

function normalizeDiffPath(path: string): string {
  return path
    .replace(/^"[ab]\//, "")
    .replace(/^[ab]\//, "")
    .replace(/"$/, "")
    .split("\\")
    .join("/")
    .toLowerCase();
}

function isPreviewLine(line: string): boolean {
  return (
    line.startsWith("@@") ||
    line.startsWith("+") ||
    line.startsWith("-") ||
    line.startsWith(" ") ||
    line.length === 0
  );
}

function redactPreviewLine(line: string): RedactedLine {
  const redactions: Array<[RegExp, string]> = [
    [/sk-[a-z0-9_-]+/gi, "[redacted:secret-token]"],
    [/authorization\s*:\s*[^\n\r"']+/gi, "[redacted:authorization]"],
    [/cookie\s*:\s*[^\n\r"']+/gi, "[redacted:browser-cookie]"],
    [/raw\s+provider\s+payload\s*:\s*[^\n\r"']+/gi, "[redacted:provider-payload]"],
    [/raw\s+tool\s+output\s*:\s*[^\n\r"']+/gi, "[redacted:tool-output]"],
    [/unauthorized\s+local-note\s+content\s*:\s*[^\n\r"']+/gi, "[redacted:unauthorized-note-content]"],
  ];
  let safeLine = line;
  let redacted = false;

  for (const [pattern, replacement] of redactions) {
    if (pattern.test(safeLine)) {
      redacted = true;
      safeLine = safeLine.replace(pattern, replacement);
    }
  }

  return { line: safeLine, redacted };
}

function previewFormatForPatchFormat(patchFormat: PatchFormat): PatchDiffPreviewFormat {
  if (patchFormat === "structured-edit") {
    return "structured-edit-preview";
  }

  if (patchFormat === "whole-file-preview") {
    return "whole-file-preview";
  }

  return "unified-diff-preview";
}

function uniqueCount(values: string[] | undefined): number {
  return new Set(values ?? []).size;
}
