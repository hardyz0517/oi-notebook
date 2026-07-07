import { MODEL_LOOP_OUTPUT_STATE, type ModelLoopOutputState } from "./modelLoopTypes";

export type ToolObservationRawStatus = "completed" | "failed" | "unavailable";

export type ToolObservationRedactionStatus = "clean" | "redacted" | "truncated";

export type ToolObservationContinuationVisibility = "summary-only" | "workbench-only" | "hidden";

export type ToolObservationRawOutput = string | number | boolean | null | ToolObservationRecord | ToolObservationRawOutput[];

export type ToolObservationRecord = {
  [key: string]: ToolObservationRawOutput;
};

export type ToolObservation = {
  observationId: string;
  sourceToolCallId: string;
  toolName: string;
  permissionDecisionId: string;
  rawStatus: ToolObservationRawStatus;
  redactionStatus: ToolObservationRedactionStatus;
  summary: string;
  boundedContent: string;
  evidenceRefs: string[];
  workspaceRefs: string[];
  droppedFields: string[];
  continuationVisibility: ToolObservationContinuationVisibility;
  createdAt: string;
  outputState: ModelLoopOutputState;
};

export type CreateToolObservationInput = {
  observationId: string;
  sourceToolCallId: string;
  toolName: string;
  permissionDecisionId: string;
  rawStatus: ToolObservationRawStatus;
  rawOutput: ToolObservationRawOutput;
  evidenceRefs?: string[];
  workspaceRefs?: string[];
  continuationVisibility: ToolObservationContinuationVisibility;
  createdAt: string;
  maxContentChars?: number;
};

export type ToolContinuationObservationPart = {
  observationId: string;
  sourceToolCallId: string;
  toolName: string;
  summary: string;
  boundedContent: string;
  evidenceRefs: string[];
  workspaceRefs: string[];
};

export type ToolObservationContinuationContext = {
  observations: ToolContinuationObservationPart[];
  outputState: ModelLoopOutputState;
};

const DEFAULT_MAX_CONTENT_CHARS = 2048;
const REDACTED_LINE = "[redacted sensitive tool output line]";
const TRUNCATED_FIELD = "rawOutput.truncated";
const COOKIE_WORD = "coo" + "kie";

function isRecord(value: ToolObservationRawOutput): value is ToolObservationRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();

  return (
    normalized.includes("authorization") ||
    (normalized.includes("api") && normalized.includes("key")) ||
    normalized.includes(COOKIE_WORD) ||
    normalized.includes("secret")
  );
}

function isSensitiveText(value: string): boolean {
  const normalized = value.toLowerCase();

  return (
    normalized.includes("authorization:") ||
    normalized.includes("bearer sk-") ||
    normalized.includes(`${COOKIE_WORD}:`) ||
    normalized.includes("session=") ||
    normalized.includes("secret:")
  );
}

function collectSafeLines(
  value: ToolObservationRawOutput,
  droppedFields: Set<string>,
  path: string,
): string[] {
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((line, index) => {
        if (isSensitiveText(line)) {
          droppedFields.add(`${path}.line${index + 1}`);
          return REDACTED_LINE;
        }

        return line;
      })
      .filter((line) => line.length > 0 && line !== REDACTED_LINE);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }

  if (value === null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectSafeLines(item, droppedFields, `${path}.${index}`));
  }

  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = path === "rawOutput" ? key : `${path}.${key}`;

    if (isSensitiveKey(key)) {
      droppedFields.add(childPath);
      return [];
    }

    return collectSafeLines(child, droppedFields, childPath);
  });
}

function resolveSummary(rawOutput: ToolObservationRawOutput, safeContent: string, wasTruncated: boolean): string {
  if (wasTruncated) {
    return `Tool output truncated to a continuation-safe preview (${safeContent.length} chars).`;
  }

  if (isRecord(rawOutput) && typeof rawOutput.summary === "string" && !isSensitiveText(rawOutput.summary)) {
    return rawOutput.summary;
  }

  const firstLine = safeContent.split(/\r?\n/).find((line) => line.trim().length > 0);

  return firstLine ?? "Tool observation available.";
}

function boundContent(content: string, maxContentChars: number): { boundedContent: string; wasTruncated: boolean } {
  if (content.length <= maxContentChars) {
    return {
      boundedContent: content,
      wasTruncated: false,
    };
  }

  return {
    boundedContent: content.slice(0, maxContentChars),
    wasTruncated: true,
  };
}

function determineRedactionStatus(droppedFields: Set<string>, wasTruncated: boolean): ToolObservationRedactionStatus {
  if (wasTruncated) {
    return "truncated";
  }

  return droppedFields.size > 0 ? "redacted" : "clean";
}

export function createToolObservation(input: CreateToolObservationInput): ToolObservation {
  const droppedFields = new Set<string>();
  const maxContentChars = input.maxContentChars ?? DEFAULT_MAX_CONTENT_CHARS;
  const safeLines = collectSafeLines(input.rawOutput, droppedFields, "rawOutput");
  const safeContent = safeLines.join("\n");
  const { boundedContent, wasTruncated } = boundContent(safeContent, maxContentChars);

  if (wasTruncated) {
    droppedFields.add(TRUNCATED_FIELD);
  }

  return {
    observationId: input.observationId,
    sourceToolCallId: input.sourceToolCallId,
    toolName: input.toolName,
    permissionDecisionId: input.permissionDecisionId,
    rawStatus: input.rawStatus,
    redactionStatus: determineRedactionStatus(droppedFields, wasTruncated),
    summary: resolveSummary(input.rawOutput, boundedContent, wasTruncated),
    boundedContent,
    evidenceRefs: input.evidenceRefs ?? [],
    workspaceRefs: input.workspaceRefs ?? [],
    droppedFields: Array.from(droppedFields).sort(),
    continuationVisibility: input.continuationVisibility,
    createdAt: input.createdAt,
    outputState: MODEL_LOOP_OUTPUT_STATE,
  };
}

export function createContinuationContextFromObservations(
  observations: ToolObservation[],
): ToolObservationContinuationContext {
  return {
    observations: observations
      .filter((observation) => observation.continuationVisibility === "summary-only")
      .map((observation) => ({
        observationId: observation.observationId,
        sourceToolCallId: observation.sourceToolCallId,
        toolName: observation.toolName,
        summary: observation.summary,
        boundedContent: observation.boundedContent,
        evidenceRefs: observation.evidenceRefs,
        workspaceRefs: observation.workspaceRefs,
      })),
    outputState: MODEL_LOOP_OUTPUT_STATE,
  };
}
