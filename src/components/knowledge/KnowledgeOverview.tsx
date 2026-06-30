import { RefreshCcw, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { KnowledgeOverviewStats } from "@/lib/knowledge/knowledgeUiModel";

export function KnowledgeOverview({
  stats,
  generatedAt,
  loading,
  error,
  onRebuild,
}: {
  stats: KnowledgeOverviewStats;
  generatedAt: string;
  loading: boolean;
  error: string | null;
  onRebuild: () => void;
}) {
  return (
    <div className="grid gap-3">
      <Card>
        <CardHeader className="px-4 py-3">
          <div>
            <div className="text-sm font-medium">成果总览</div>
            <div className="mt-1 text-xs text-muted-foreground">来自当前 Markdown 图谱缓存。</div>
          </div>
          <Button type="button" size="compact" variant="outline" onClick={onRebuild} loading={loading}>
            <RefreshCcw className="h-3.5 w-3.5" />
            重建
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="知识节点" value={stats.nodeCount} />
            <Stat label="关联边" value={stats.edgeCount} />
            <Stat label="知识片段" value={stats.fragmentCount} />
            <Stat label="集合/文章" value={stats.collectionCount + stats.articleCount} />
          </div>
          <Separator />
          {stats.nodeCount === 0 ? (
            <div className="grid gap-2">
              <p className="text-sm text-muted-foreground">还没有知识图数据，先执行一次重建。</p>
              <Button type="button" className="w-fit" onClick={onRebuild} loading={loading}>
                <Sparkles className="h-4 w-4" />
                重建知识图
              </Button>
            </div>
          ) : (
            <div className="grid gap-2 text-sm text-muted-foreground">
              <p>最近生成：{generatedAt || "未知"}</p>
              <div className="flex flex-wrap gap-2">
                {stats.topTopics.length === 0 ? <Badge variant="default">暂无高频主题</Badge> : null}
                {stats.topTopics.map((item) => (
                  <Badge key={item.topic} variant="secondary">{item.topic} · {item.count}</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--ui-radius-item)] border border-border/70 bg-muted/25 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}
