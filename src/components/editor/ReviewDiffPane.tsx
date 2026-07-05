import { Button } from "@/components/ui/button";
import { CodexDiffPreview, getDiffStats } from "@/components/ai/DiffPreview";
import { cn } from "@/lib/utils";

export type ReviewDiffPaneProps = {
  title: string;
  statusLabel: string;
  statusTone?: "neutral" | "warning";
  sourcePath: string;
  oldText: string;
  newText: string;
  startLine?: number;
  applyLabel: string;
  canApply: boolean;
  onApply: () => void;
  onCancel?: () => void;
  onBack?: () => void;
  onClose: () => void;
  warning?: string | null;
};

export function ReviewDiffPane({
  title,
  statusLabel,
  statusTone = "neutral",
  sourcePath,
  oldText,
  newText,
  startLine = 1,
  applyLabel,
  canApply,
  onApply,
  onCancel,
  onBack,
  onClose,
  warning,
}: ReviewDiffPaneProps) {
  const stats = getDiffStats(oldText, newText, startLine);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border/80 bg-muted/15 px-4 py-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <div className="truncate text-base font-semibold text-foreground">{title}</div>
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[11px]",
              statusTone === "warning"
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "bg-muted text-muted-foreground",
            )}>
              {statusLabel}
            </span>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate" title={sourcePath}>{sourcePath}</span>
            <span>1 file changed</span>
            <span className="text-emerald-700 dark:text-emerald-300">+{stats.addedRows}</span>
            <span className="text-red-700 dark:text-red-300">-{stats.deletedRows}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onBack && (
            <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={onBack}>
              回到文件
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={onClose}>
            关闭审核
          </Button>
          {onCancel && (
            <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={onCancel}>
              取消
            </Button>
          )}
          <Button size="sm" className="h-8 px-2.5 text-xs" onClick={onApply} disabled={!canApply}>
            {applyLabel}
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        <CodexDiffPreview
          title={title}
          filePath={sourcePath}
          status={statusLabel}
          statusTone={statusTone}
          oldText={oldText}
          newText={newText}
          startLine={startLine}
          showHeader={false}
          density="review"
          maxHeightClassName="max-h-full"
        />
        {warning && (
          <div className="mt-3 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
            {warning}
          </div>
        )}
      </div>
    </div>
  );
}
