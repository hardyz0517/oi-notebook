import type { ReactNode } from "react";
import { useMemo } from "react";
import { diffLines } from "diff";

import { cn } from "@/lib/utils";

type DiffRowType = "context" | "delete" | "add";
type DiffSegmentType = "context" | "delete" | "add";

type DiffSegment = {
  text: string;
  type: DiffSegmentType;
};

type DiffRow = {
  id: string;
  type: DiffRowType;
  oldLine: number | null;
  newLine: number | null;
  text: string;
  segments: DiffSegment[];
};

type DiffOp = {
  type: DiffRowType;
  oldLine: number | null;
  newLine: number | null;
  text: string;
};

export type DiffStats = {
  addedRows: number;
  deletedRows: number;
  oldLineCount: number;
  newLineCount: number;
};

const splitDiffLines = (value: string): string[] => {
  if (value.length === 0) return [""];
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
};

const splitChangeLines = (value: string): string[] => {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized) return [];
  const lines = normalized.split("\n");
  if (normalized.endsWith("\n")) lines.pop();
  return lines;
};

const tokenizeForInlineDiff = (value: string): string[] => {
  if (!value) return [];
  return value.match(/(\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_])/gu) ?? [value];
};

const pushSegment = (segments: DiffSegment[], next: DiffSegment) => {
  if (!next.text) return;
  const last = segments[segments.length - 1];
  if (last && last.type === next.type) {
    last.text += next.text;
    return;
  }
  segments.push(next);
};

const buildInlineDiffSegments = (
  oldLine: string,
  newLine: string,
): { oldSegments: DiffSegment[]; newSegments: DiffSegment[] } => {
  if (oldLine === newLine) {
    const segment = oldLine ? [{ text: oldLine, type: "context" as const }] : [];
    return { oldSegments: segment, newSegments: segment };
  }

  const oldTokens = tokenizeForInlineDiff(oldLine);
  const newTokens = tokenizeForInlineDiff(newLine);
  const rows = oldTokens.length;
  const columns = newTokens.length;
  if (rows * columns > 12000) {
    return {
      oldSegments: oldLine ? [{ text: oldLine, type: "delete" }] : [],
      newSegments: newLine ? [{ text: newLine, type: "add" }] : [],
    };
  }

  const table: number[][] = Array.from({ length: rows + 1 }, () => Array(columns + 1).fill(0));
  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let column = columns - 1; column >= 0; column -= 1) {
      table[row][column] = oldTokens[row] === newTokens[column]
        ? table[row + 1][column + 1] + 1
        : Math.max(table[row + 1][column], table[row][column + 1]);
    }
  }

  const oldSegments: DiffSegment[] = [];
  const newSegments: DiffSegment[] = [];
  let row = 0;
  let column = 0;
  while (row < rows && column < columns) {
    if (oldTokens[row] === newTokens[column]) {
      pushSegment(oldSegments, { text: oldTokens[row], type: "context" });
      pushSegment(newSegments, { text: newTokens[column], type: "context" });
      row += 1;
      column += 1;
      continue;
    }

    if (table[row + 1][column] >= table[row][column + 1]) {
      pushSegment(oldSegments, { text: oldTokens[row], type: "delete" });
      row += 1;
    } else {
      pushSegment(newSegments, { text: newTokens[column], type: "add" });
      column += 1;
    }
  }

  while (row < rows) {
    pushSegment(oldSegments, { text: oldTokens[row], type: "delete" });
    row += 1;
  }
  while (column < columns) {
    pushSegment(newSegments, { text: newTokens[column], type: "add" });
    column += 1;
  }

  return { oldSegments, newSegments };
};

const makeSegments = (type: DiffRowType, text: string): DiffSegment[] => {
  if (!text) return [];
  if (type === "context") return [{ text, type: "context" }];
  return [{ text, type }];
};

const buildRawDiffOps = (oldText: string, newText: string, startLine = 1): DiffOp[] => {
  const lineBase = Number.isFinite(startLine) && startLine > 0 ? Math.floor(startLine) : 1;
  const operations: DiffOp[] = [];
  let oldLine = lineBase;
  let newLine = lineBase;

  for (const change of diffLines(oldText, newText)) {
    const lines = splitChangeLines(change.value);
    for (const line of lines) {
      if (change.added) {
        operations.push({
          type: "add",
          oldLine: null,
          newLine,
          text: line,
        });
        newLine += 1;
        continue;
      }
      if (change.removed) {
        operations.push({
          type: "delete",
          oldLine,
          newLine: null,
          text: line,
        });
        oldLine += 1;
        continue;
      }
      operations.push({
        type: "context",
        oldLine,
        newLine,
        text: line,
      });
      oldLine += 1;
      newLine += 1;
    }
  }

  return operations;
};

const createDiffRow = (
  op: DiffOp,
  sequence: number,
  segments = makeSegments(op.type, op.text),
): DiffRow => ({
  ...op,
  id: `${op.type}-${sequence}`,
  segments,
});

export const buildCodexStyleDiffRows = (oldText: string, newText: string, startLine = 1): DiffRow[] => {
  const operations = buildRawDiffOps(oldText, newText, startLine);
  const rows: DiffRow[] = [];
  let index = 0;
  let sequence = 0;

  const push = (op: DiffOp, segments?: DiffSegment[]) => {
    rows.push(createDiffRow(op, sequence, segments));
    sequence += 1;
  };

  while (index < operations.length) {
    const current = operations[index];
    if (current.type === "context") {
      push(current);
      index += 1;
      continue;
    }

    const deleted: DiffOp[] = [];
    const added: DiffOp[] = [];
    while (index < operations.length && operations[index].type !== "context") {
      const op = operations[index];
      if (op.type === "delete") {
        deleted.push(op);
      } else if (op.type === "add") {
        added.push(op);
      }
      index += 1;
    }

    if (deleted.length > 0 && added.length > 0) {
      const maxLength = Math.max(deleted.length, added.length);
      for (let pairIndex = 0; pairIndex < maxLength; pairIndex += 1) {
        const deleteOp = deleted[pairIndex];
        const addOp = added[pairIndex];
        if (deleteOp && addOp) {
          const { oldSegments, newSegments } = buildInlineDiffSegments(deleteOp.text, addOp.text);
          push(deleteOp, oldSegments);
          push(addOp, newSegments);
          continue;
        }
        if (deleteOp) push(deleteOp);
        if (addOp) push(addOp);
      }
      continue;
    }

    deleted.forEach((op) => push(op));
    added.forEach((op) => push(op));
  }

  return rows;
};

export const getDiffStats = (oldText: string, newText: string, startLine = 1): DiffStats => {
  const rows = buildCodexStyleDiffRows(oldText, newText, startLine);
  return {
    addedRows: rows.filter((row) => row.type === "add").length,
    deletedRows: rows.filter((row) => row.type === "delete").length,
    oldLineCount: splitDiffLines(oldText).length,
    newLineCount: splitDiffLines(newText).length,
  };
};

export function CodexDiffPreview({
  title,
  filePath,
  status,
  statusTone = "neutral",
  oldText,
  newText,
  startLine,
  maxHeightClassName,
  density = "compact",
  actions,
  showHeader = true,
}: {
  title: string;
  filePath: string;
  status?: string;
  statusTone?: "neutral" | "warning";
  oldText: string;
  newText: string;
  startLine?: number | null;
  maxHeightClassName?: string;
  density?: "compact" | "review";
  actions?: ReactNode;
  showHeader?: boolean;
}) {
  const effectiveStartLine = typeof startLine === "number" && Number.isFinite(startLine) && startLine > 0
    ? Math.floor(startLine)
    : 1;
  const rows = useMemo(
    () => buildCodexStyleDiffRows(oldText, newText, effectiveStartLine),
    [effectiveStartLine, oldText, newText],
  );
  const addedRows = rows.filter((row) => row.type === "add").length;
  const deletedRows = rows.filter((row) => row.type === "delete").length;
  const oldLineCount = splitDiffLines(oldText).length;
  const newLineCount = splitDiffLines(newText).length;
  const fileName = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
  const hunkHeader = `@@ -${effectiveStartLine},${oldLineCount} +${effectiveStartLine},${newLineCount} @@`;
  const heightClass = maxHeightClassName ?? (density === "review" ? "max-h-[calc(100vh-18rem)]" : "max-h-72");

  const renderSegments = (row: DiffRow) => {
    if (row.segments.length === 0) return <span>&nbsp;</span>;
    return row.segments.map((segment, index) => (
      <span
        key={`${row.id}-segment-${index}`}
        className={cn(
          segment.type === "delete" && "rounded-sm bg-red-500/20 text-red-950 dark:bg-red-400/25 dark:text-red-50",
          segment.type === "add" && "rounded-sm bg-emerald-500/20 text-emerald-950 dark:bg-emerald-400/25 dark:text-emerald-50",
        )}
      >
        {segment.text}
      </span>
    ));
  };

  return (
    <div className={cn(
      "overflow-hidden rounded-md border border-border/70 bg-background shadow-sm dark:border-white/10 dark:bg-zinc-950/80",
      !showHeader && "rounded-none border-0 shadow-none",
      density === "review" && "flex h-full min-h-0 flex-col",
    )}>
      {showHeader && (
        <div className={cn(
          "flex min-w-0 shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-muted/45 dark:border-white/10 dark:bg-white/[0.04]",
          density === "review" ? "px-4 py-3" : "px-3 py-2",
        )}>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <div className={cn(
                "truncate font-medium text-foreground",
                density === "review" ? "text-base leading-6" : "text-sm leading-5",
              )}>{title}</div>
              {status && (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] leading-4",
                    statusTone === "warning"
                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      : "bg-background/80 text-muted-foreground dark:bg-white/[0.08]",
                  )}
                >
                  {status}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] leading-4 text-muted-foreground">
              <span className="truncate" title={filePath}>{fileName}</span>
              <span className="shrink-0 text-emerald-700 dark:text-emerald-300">+{addedRows}</span>
              <span className="shrink-0 text-red-700 dark:text-red-300">-{deletedRows}</span>
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}

      <div className={cn(
        "bg-background font-mono text-[11px] leading-5 dark:bg-zinc-950",
        density === "review" ? "min-h-0 flex-1 overflow-auto" : "overflow-auto",
        heightClass,
      )}>
        <div className="min-w-0 border-b border-border/40 bg-muted/35 px-3 py-1 text-muted-foreground dark:border-white/[0.06] dark:bg-white/[0.03]">
          {hunkHeader}
        </div>
        {rows.map((row) => (
          <div
            key={row.id}
            className={cn(
              "grid min-w-0 grid-cols-[3rem_3rem_1.5rem_minmax(0,1fr)] border-b border-border/35 last:border-b-0 dark:border-white/[0.06]",
              row.type === "delete" && "bg-red-500/[0.08] dark:bg-red-400/[0.10]",
              row.type === "add" && "bg-emerald-500/[0.08] dark:bg-emerald-400/[0.10]",
              row.type === "context" && "bg-background dark:bg-zinc-950",
            )}
          >
            <div className="select-none border-r border-border/40 px-2 text-right text-muted-foreground/65 dark:border-white/[0.06]">
              {row.oldLine ?? ""}
            </div>
            <div className="select-none border-r border-border/40 px-2 text-right text-muted-foreground/65 dark:border-white/[0.06]">
              {row.newLine ?? ""}
            </div>
            <div
              className={cn(
                "select-none px-1 text-center font-semibold",
                row.type === "delete" && "text-red-700 dark:text-red-300",
                row.type === "add" && "text-emerald-700 dark:text-emerald-300",
                row.type === "context" && "text-muted-foreground/60",
              )}
            >
              {row.type === "delete" ? "-" : row.type === "add" ? "+" : " "}
            </div>
            <pre className="m-0 whitespace-pre-wrap break-words px-2 py-0.5 text-foreground">
              {renderSegments(row)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
