import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { KnowledgeReviewRow } from "@/lib/knowledge/knowledgeUiModel";

function getReviewOpenPath(row: KnowledgeReviewRow): string {
  return row.openPath || row.path || row.refs[0] || "";
}

export function KnowledgeReviewView({
  rows,
  onOpenAsset,
}: {
  rows: KnowledgeReviewRow[];
  onOpenAsset?: (path: string) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="text-xs text-muted-foreground">复习候选来自确定性规则：最近沉淀、优先级、掌握状态、关联稀疏度。状态写回仍需人工确认。</div>
      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">暂无复习候选。重建图谱后会从 fragment/mistake 资产生成。</CardContent>
        </Card>
      ) : rows.map((row) => (
        <Card key={row.id}>
          <CardHeader className="px-4 py-3">
            <div>
              <div className="text-sm font-medium">{row.title}</div>
              <div className="mt-1 flex flex-wrap gap-2">
                {row.reasons.map((reason) => <Badge key={reason} variant="info">{reason}</Badge>)}
              </div>
            </div>
            <Button type="button" size="icon-xs" variant="ghost" aria-label="打开复习资产" onClick={() => onOpenAsset?.(getReviewOpenPath(row))}>
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2 text-xs text-muted-foreground">
            <div>review_priority：{row.reviewPriority}</div>
            <div>mastery：{row.mastery ?? row.masteryStatus ?? "new"}</div>
            <div>last_reviewed_at：{row.lastReviewedAt || "未记录"}</div>
            <Button type="button" size="xs" variant="subtle" disabled className="w-fit">等待安全 API 后写回长期状态</Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
