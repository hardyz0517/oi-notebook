import { useMemo, useState } from "react";
import { ExternalLink, ZoomIn } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { KnowledgeGraphIndexResult } from "@/lib/api";

export function KnowledgeGraphView({
  graph,
  onOpenAsset,
}: {
  graph: KnowledgeGraphIndexResult;
  onOpenAsset?: (path: string) => void;
}) {
  const [scope, setScope] = useState("");
  const visibleNodes = useMemo(() => {
    const query = scope.trim().toLowerCase();
    const nodes = query
      ? graph.nodes.filter((node) => node.id.toLowerCase().includes(query) || node.title.toLowerCase().includes(query))
      : graph.nodes.slice(0, 18);
    return nodes.slice(0, 40);
  }, [graph.nodes, scope]);
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = graph.edges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to)).slice(0, 60);
  const selected = visibleNodes[0] ?? null;

  return (
    <div className="grid gap-3">
      <Card>
        <CardHeader className="px-4 py-3">
          <div>
            <div className="text-sm font-medium">知识图谱</div>
            <div className="mt-1 text-xs text-muted-foreground">默认展示精选子图，可输入 asset/problem/topic 局部范围。</div>
          </div>
          <Badge variant="secondary">{visibleNodes.length}/{graph.nodes.length} nodes</Badge>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input className="max-w-sm" value={scope} placeholder="局部图入口：P3803 / FFT / fragment" onChange={(event) => setScope(event.target.value)} />
            <Button type="button" size="compact" variant="outline">
              <ZoomIn className="h-3.5 w-3.5" />
              加载更多
            </Button>
            <span className="text-xs text-muted-foreground">当前上限 40 节点 / 60 边。</span>
          </div>
          <div className="grid min-h-[360px] gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="relative min-h-[360px] overflow-hidden rounded-[var(--ui-radius-panel)] border border-border/70 bg-muted/20">
              {visibleNodes.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">暂无可展示节点。</div>
              ) : (
                <svg viewBox="0 0 720 360" role="img" aria-label="知识图谱精选子图" className="h-full w-full">
                  {visibleEdges.map((edge, index) => {
                    const fromIndex = Math.max(0, visibleNodes.findIndex((node) => node.id === edge.from));
                    const toIndex = Math.max(0, visibleNodes.findIndex((node) => node.id === edge.to));
                    const x1 = 80 + (fromIndex % 6) * 112;
                    const y1 = 70 + Math.floor(fromIndex / 6) * 80;
                    const x2 = 80 + (toIndex % 6) * 112;
                    const y2 = 70 + Math.floor(toIndex / 6) * 80;
                    return <line key={`${edge.from}-${edge.to}-${index}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeOpacity="0.22" />;
                  })}
                  {visibleNodes.map((node, index) => {
                    const x = 80 + (index % 6) * 112;
                    const y = 70 + Math.floor(index / 6) * 80;
                    return (
                      <g key={node.id}>
                        <circle cx={x} cy={y} r={node.type === "asset" ? 18 : 13} fill="hsl(var(--primary))" fillOpacity={node.type === "asset" ? 0.2 : 0.12} stroke="currentColor" strokeOpacity="0.45" />
                        <text x={x} y={y + 32} textAnchor="middle" fontSize="10" fill="currentColor">{node.title.slice(0, 14)}</text>
                      </g>
                    );
                  })}
                </svg>
              )}
            </div>
            <Card>
              <CardHeader className="px-3 py-2">
                <div className="text-xs font-medium">节点详情</div>
              </CardHeader>
              <CardContent className="grid gap-2 px-3 pb-3 text-xs text-muted-foreground">
                {selected ? (
                  <>
                    <div className="text-sm text-foreground">{selected.title}</div>
                    <Badge variant="default" className="w-fit">{selected.type}</Badge>
                    <div className="break-all">{selected.id}</div>
                    {selected.refs[0] ? (
                      <Button type="button" size="xs" variant="outline" className="w-fit" onClick={() => onOpenAsset?.(selected.refs[0])}>
                        <ExternalLink className="h-3.5 w-3.5" />
                        打开资产
                      </Button>
                    ) : null}
                  </>
                ) : "未选择节点"}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
