import { useEffect, useMemo, useState } from "react";
import { RefreshCcw } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import { Separator } from "@/components/ui/separator";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import { getKnowledgeGraph, rebuildKnowledgeGraph, type KnowledgeGraphIndexResult } from "@/lib/api";
import {
  buildKnowledgeOverviewStats,
  buildReviewRows,
  buildSuggestionRows,
  mapGraphToAssetRows,
} from "@/lib/knowledge/knowledgeUiModel";
import type { KnowledgeWorkspaceTabId } from "@/lib/knowledge/knowledgeTypes";
import { KnowledgeAssetList } from "./KnowledgeAssetList";
import { KnowledgeGraphView } from "./KnowledgeGraphView";
import { KnowledgeOverview } from "./KnowledgeOverview";
import { KnowledgeRelationshipView } from "./KnowledgeRelationshipView";
import { KnowledgeReviewView } from "./KnowledgeReviewView";

const WORKSPACE_TABS: Array<{ value: KnowledgeWorkspaceTabId; label: string }> = [
  { value: "overview", label: "总览" },
  { value: "graph", label: "图谱" },
  { value: "fragments", label: "片段" },
  { value: "collections", label: "集合" },
  { value: "articles", label: "文章" },
  { value: "review", label: "复习" },
  { value: "mistakes", label: "错因" },
  { value: "relationships", label: "关系建议" },
];

function emptyGraph(): KnowledgeGraphIndexResult {
  return { generatedAt: "", nodes: [], edges: [], assets: [], suggestions: [], reviewSlices: [] };
}

export function KnowledgeBaseWorkspace({
  activeTab = "overview",
  onTabChange,
  onOpenAsset,
}: {
  activeTab?: KnowledgeWorkspaceTabId;
  onTabChange?: (tab: KnowledgeWorkspaceTabId) => void;
  onOpenAsset?: (path: string) => void;
}) {
  const [workspaceTab, setWorkspaceTab] = useState<KnowledgeWorkspaceTabId>(activeTab);
  const [graph, setGraph] = useState<KnowledgeGraphIndexResult>(emptyGraph);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setWorkspaceTab(activeTab);
  }, [activeTab]);

  const assetRows = useMemo(() => mapGraphToAssetRows(graph), [graph]);
  const stats = useMemo(() => buildKnowledgeOverviewStats(graph), [graph]);
  const reviewRows = useMemo(() => buildReviewRows(assetRows, "2026-06-30"), [assetRows]);
  const suggestions = useMemo(() => buildSuggestionRows(graph), [graph]);

  const loadGraph = async () => {
    setLoading(true);
    setError(null);
    try {
      setGraph(await getKnowledgeGraph());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleRebuild = async () => {
    setLoading(true);
    setError(null);
    try {
      setGraph(await rebuildKnowledgeGraph());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadGraph();
  }, []);

  const setTab = (tab: KnowledgeWorkspaceTabId) => {
    setWorkspaceTab(tab);
    onTabChange?.(tab);
  };

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 flex-col gap-3 border-b border-border/70 px-4 py-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-base font-semibold">知识库</h1>
              <span className="rounded-full border border-border/70 px-2 py-0.5 text-xs text-muted-foreground">P2 views</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">总览、列表、图谱、复习与确定性关系建议。</p>
          </div>
          <IconButton aria-label="重新构建知识图" onClick={() => void handleRebuild()} disabled={loading}>
            <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
          </IconButton>
        </div>
        <SegmentedControl
          value={workspaceTab}
          options={WORKSPACE_TABS}
          ariaLabel="知识库二级导航"
          onValueChange={setTab}
          className="w-fit"
        />
      </header>

      <div className="grid min-h-0 min-w-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[minmax(0,1.2fr)_300px]">
        <main className="min-h-0 min-w-0 overflow-auto px-4 py-4">
          {workspaceTab === "overview" ? <KnowledgeOverview stats={stats} generatedAt={graph.generatedAt} loading={loading} error={error} onRebuild={() => void handleRebuild()} /> : null}
          {workspaceTab === "graph" ? <KnowledgeGraphView graph={graph} onOpenAsset={onOpenAsset} /> : null}
          {workspaceTab === "fragments" ? <KnowledgeAssetList rows={assetRows} assetType="fragment" onOpenAsset={onOpenAsset} /> : null}
          {workspaceTab === "collections" ? <KnowledgeAssetList rows={assetRows} assetType="collection" onOpenAsset={onOpenAsset} /> : null}
          {workspaceTab === "articles" ? <KnowledgeAssetList rows={assetRows} assetType="article" onOpenAsset={onOpenAsset} /> : null}
          {workspaceTab === "review" ? <KnowledgeReviewView rows={reviewRows} onOpenAsset={onOpenAsset} /> : null}
          {workspaceTab === "mistakes" ? <KnowledgeAssetList rows={assetRows.filter((row) => row.kind === "mistake")} onOpenAsset={onOpenAsset} /> : null}
          {workspaceTab === "relationships" ? <KnowledgeRelationshipView suggestions={suggestions} onOpenAsset={onOpenAsset} /> : null}
        </main>

        <aside className="min-h-0 min-w-0 overflow-auto border-l border-border/70 px-4 py-4">
          <Card>
            <CardHeader className="px-4 py-3">
              <div className="text-sm font-medium">当前范围</div>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <Stat label="资产节点" value={stats.assetCount} />
              <Stat label="问题节点" value={stats.problemCount} />
              <Stat label="主题节点" value={stats.topicCount} />
              <Separator />
              <p className="text-xs text-muted-foreground">图谱默认展示精选子图；列表筛选来自当前 read model，缺失字段等待 P2-A 接口补齐。</p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
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
