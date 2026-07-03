import { useState } from "react";
import { Check, ExternalLink, Save } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { KnowledgeReviewRow } from "@/lib/knowledge/knowledgeUiModel";
import {
  buildKnowledgeReviewStateRequest,
  getKnowledgeReviewOpenPath,
  normalizeReviewMastery,
  normalizeReviewPriority,
  REVIEW_MASTERY_VALUES,
  REVIEW_PRIORITY_VALUES,
  type KnowledgeReviewStateRequest,
} from "@/lib/knowledge/knowledgeReviewState";
import type { ReviewMastery, ReviewPriority } from "@/lib/knowledge/knowledgeTypes";

const PRIORITY_LABELS: Record<ReviewPriority, string> = {
  high: "高",
  medium: "中",
  low: "低",
  none: "不安排",
};

const MASTERY_LABELS: Record<ReviewMastery, string> = {
  new: "新内容",
  learning: "学习中",
  familiar: "熟悉",
  mastered: "已掌握",
};

export function KnowledgeReviewView({
  rows,
  onOpenAsset,
  onSaveReviewState,
}: {
  rows: KnowledgeReviewRow[];
  onOpenAsset?: (path: string) => void;
  onSaveReviewState?: (request: KnowledgeReviewStateRequest) => Promise<void>;
}) {
  const [priorityDrafts, setPriorityDrafts] = useState<Record<string, ReviewPriority>>({});
  const [masteryDrafts, setMasteryDrafts] = useState<Record<string, ReviewMastery>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statusById, setStatusById] = useState<Record<string, { tone: "success" | "error"; text: string }>>({});

  const saveRow = async (row: KnowledgeReviewRow, reviewedAt: string) => {
    if (!onSaveReviewState) return;
    setSavingId(row.id);
    setStatusById((current) => ({ ...current, [row.id]: { tone: "success", text: "正在保存复习状态..." } }));
    try {
      const request = buildKnowledgeReviewStateRequest(row, {
        reviewPriority: priorityDrafts[row.id] ?? normalizeReviewPriority(row.reviewPriority),
        mastery: masteryDrafts[row.id] ?? normalizeReviewMastery(row.mastery),
        lastReviewedAt: reviewedAt,
      });
      await onSaveReviewState(request);
      setStatusById((current) => ({ ...current, [row.id]: { tone: "success", text: "复习状态已保存。" } }));
    } catch (error) {
      setStatusById((current) => ({
        ...current,
        [row.id]: { tone: "error", text: error instanceof Error ? error.message : String(error) },
      }));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="grid gap-3">
      <div className="text-xs text-muted-foreground">复习候选来自确定性规则：最近沉淀、优先级、掌握状态、关联稀疏度。状态写回仍需人工确认。</div>
      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">暂无复习候选。重建图谱后会从 fragment/mistake 资产生成。</CardContent>
        </Card>
      ) : rows.map((row) => {
        const priority = priorityDrafts[row.id] ?? normalizeReviewPriority(row.reviewPriority);
        const mastery = masteryDrafts[row.id] ?? normalizeReviewMastery(row.mastery);
        const status = statusById[row.id];
        const isSaving = savingId === row.id;
        const fallbackReviewedAt = row.lastReviewedAt ? new Date(row.lastReviewedAt).toISOString() : new Date().toISOString();
        return (
          <Card key={row.id}>
            <CardHeader className="px-4 py-3">
              <div>
                <div className="text-sm font-medium">{row.title}</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {row.reasons.map((reason) => <Badge key={reason} variant="info">{reason}</Badge>)}
                </div>
              </div>
              <Button type="button" size="icon-xs" variant="ghost" aria-label="打开复习资产" onClick={() => onOpenAsset?.(getKnowledgeReviewOpenPath(row))}>
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </CardHeader>
            <CardContent className="grid gap-3 text-xs text-muted-foreground">
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="grid gap-1">
                  <span>review_priority</span>
                  <select
                    className="h-8 rounded-[var(--ui-radius-item)] border border-border/70 bg-background px-2 text-xs text-foreground"
                    value={priority}
                    onChange={(event) => setPriorityDrafts((current) => ({
                      ...current,
                      [row.id]: normalizeReviewPriority(event.target.value),
                    }))}
                  >
                    {REVIEW_PRIORITY_VALUES.map((value) => <option key={value} value={value}>{PRIORITY_LABELS[value]}</option>)}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span>mastery</span>
                  <select
                    className="h-8 rounded-[var(--ui-radius-item)] border border-border/70 bg-background px-2 text-xs text-foreground"
                    value={mastery}
                    onChange={(event) => setMasteryDrafts((current) => ({
                      ...current,
                      [row.id]: normalizeReviewMastery(event.target.value),
                    }))}
                  >
                    {REVIEW_MASTERY_VALUES.map((value) => <option key={value} value={value}>{MASTERY_LABELS[value]}</option>)}
                  </select>
                </label>
                <div className="grid gap-1">
                  <span>last_reviewed_at</span>
                  <div className="flex h-8 items-center rounded-[var(--ui-radius-item)] border border-border/70 bg-muted/25 px-2 text-foreground">
                    {row.lastReviewedAt || "未记录"}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={!onSaveReviewState || isSaving}
                  onClick={() => void saveRow(row, fallbackReviewedAt)}
                >
                  <Save className="h-3.5 w-3.5" />
                  {isSaving ? "保存中..." : "保存复习状态"}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="subtle"
                  disabled={!onSaveReviewState || isSaving}
                  onClick={() => void saveRow(row, new Date().toISOString())}
                >
                  <Check className="h-3.5 w-3.5" />
                  标记已复习
                </Button>
                {status ? (
                  <span className={status.tone === "error" ? "text-destructive" : "text-muted-foreground"}>
                    {status.text}
                  </span>
                ) : null}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
