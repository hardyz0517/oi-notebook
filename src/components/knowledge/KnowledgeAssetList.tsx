import { useMemo, useState } from "react";
import { ExternalLink, Filter } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  filterKnowledgeAssetRows,
  type KnowledgeAssetFilterState,
} from "@/lib/knowledge/knowledgeUiModel";
import type { KnowledgeAssetRow, KnowledgeAssetType } from "@/lib/knowledge/knowledgeTypes";

function getAssetOpenPath(asset: KnowledgeAssetRow): string {
  return asset.openPath || asset.path || asset.refs[0] || "";
}

export function KnowledgeAssetList({
  rows,
  assetType,
  onOpenAsset,
}: {
  rows: KnowledgeAssetRow[];
  assetType?: KnowledgeAssetType;
  onOpenAsset?: (path: string) => void;
}) {
  const [filters, setFilters] = useState<KnowledgeAssetFilterState>({
    assetType: assetType ?? "all",
    status: "all",
    reviewPriority: "all",
    minRelations: 0,
  });
  const filtered = useMemo(() => filterKnowledgeAssetRows(rows, { ...filters, assetType: assetType ?? filters.assetType }), [assetType, filters, rows]);

  return (
    <div className="grid gap-3">
      <Card>
        <CardContent className="grid gap-2 py-3">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            筛选
          </div>
          <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-6">
            <Input value={filters.topic ?? ""} placeholder="主题" onChange={(event) => setFilters((current) => ({ ...current, topic: event.target.value }))} />
            <Input value={filters.source ?? ""} placeholder="来源" onChange={(event) => setFilters((current) => ({ ...current, source: event.target.value }))} />
            <Select value={filters.status ?? "all"} onValueChange={(value) => setFilters((current) => ({ ...current, status: value as KnowledgeAssetFilterState["status"] }))}>
              <SelectTrigger><SelectValue placeholder="状态" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="draft">draft</SelectItem>
                <SelectItem value="active">active</SelectItem>
                <SelectItem value="archived">archived</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.reviewPriority ?? "all"} onValueChange={(value) => setFilters((current) => ({ ...current, reviewPriority: value as KnowledgeAssetFilterState["reviewPriority"] }))}>
              <SelectTrigger><SelectValue placeholder="复习优先级" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部优先级</SelectItem>
                <SelectItem value="high">high</SelectItem>
                <SelectItem value="medium">medium</SelectItem>
                <SelectItem value="low">low</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={filters.dateFrom ?? ""} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} />
            <Input type="date" value={filters.dateTo ?? ""} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} />
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">暂无匹配资产。</CardContent>
        </Card>
      ) : filtered.map((asset) => (
        <Card key={asset.id}>
          <CardHeader className="px-4 py-3">
            <button type="button" className="min-w-0 cursor-pointer text-left" onClick={() => onOpenAsset?.(getAssetOpenPath(asset))}>
              <div className="truncate text-sm font-medium">{asset.title}</div>
              <div className="truncate text-xs text-muted-foreground">{getAssetOpenPath(asset)}</div>
            </button>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{asset.assetType}</Badge>
              <Button type="button" size="icon-xs" variant="ghost" aria-label="打开资产" onClick={() => onOpenAsset?.(getAssetOpenPath(asset))}>
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-2 text-xs text-muted-foreground">
            <div className="flex flex-wrap gap-2">
              <Badge variant="default">{asset.kind}</Badge>
              <Badge variant="default">{asset.source}</Badge>
              <Badge variant="default">{asset.status}</Badge>
              <Badge variant="default">{asset.reviewPriority}</Badge>
              <Badge variant="info">{asset.relationCount} relations</Badge>
            </div>
            <div className="truncate">{asset.topics.length ? asset.topics.join(" / ") : "暂无 topics"}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
