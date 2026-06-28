import { useEffect, useMemo, useState } from "react";
import { RefreshCcw, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import { Separator } from "@/components/ui/separator";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import { getKnowledgeGraph, rebuildKnowledgeGraph, type KnowledgeGraphIndexResult } from "@/lib/api";
import type { KnowledgeWorkspaceTabId } from "@/lib/knowledge/knowledgeTypes";

const WORKSPACE_TABS: Array<{ value: KnowledgeWorkspaceTabId; label: string }> = [
  { value: "overview", label: "总览" },
  { value: "graph", label: "图谱" },
  { value: "fragments", label: "片段" },
  { value: "collections", label: "集合" },
  { value: "articles", label: "文章" },
  { value: "review", label: "复习" },
  { value: "mistakes", label: "错题" },
  { value: "relationships", label: "关系建议" },
];

function emptyGraph(): KnowledgeGraphIndexResult {
  return { generatedAt: "", nodes: [], edges: [] };
}

function buildCounts(graph: KnowledgeGraphIndexResult) {
  const assetCount = graph.nodes.filter((node) => node.type === "asset").length;
  const problemCount = graph.nodes.filter((node) => node.type === "problem").length;
  const topicCount = graph.nodes.filter((node) => node.type === "topic").length;
  return {
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    assetCount,
    problemCount,
    topicCount,
  };
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

  const counts = useMemo(() => buildCounts(graph), [graph]);

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

  const filteredAssets = useMemo(() => {
    const type =
      workspaceTab === "fragments" ? "fragment" :
      workspaceTab === "collections" ? "collection" :
      workspaceTab === "articles" ? "article" :
      null;
    if (!type) return [];
    return graph.nodes.filter((node) => node.type === "asset" && node.assetType === type);
  }, [graph.nodes, workspaceTab]);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 flex-col gap-3 border-b border-border/70 px-4 py-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-base font-semibold">知识库</h1>
              <Badge variant="secondary">Phase 1</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">浏览、筛选、图谱和复习壳层。</p>
          </div>
          <div className="flex items-center gap-2">
            <IconButton aria-label="重新构建知识图" onClick={() => void handleRebuild()} disabled={loading}>
              <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
            </IconButton>
          </div>
        </div>
        <SegmentedControl
          value={workspaceTab}
          options={WORKSPACE_TABS}
          ariaLabel="知识库二级导航"
          onValueChange={(tab) => {
            setWorkspaceTab(tab);
            onTabChange?.(tab);
          }}
          className="w-fit"
        />
      </header>

      <div className="grid min-h-0 min-w-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <main className="min-h-0 min-w-0 overflow-auto px-4 py-4">
          {workspaceTab === "overview" && (
            <div className="grid gap-3">
              <Card>
                <CardHeader className="px-4 py-3">
                  <div className="text-sm font-medium">图谱概览</div>
                  <IconButton aria-label="刷新图谱" onClick={() => void loadGraph()} disabled={loading}>
                    <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
                  </IconButton>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {error ? <p className="text-sm text-destructive">{error}</p> : null}
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <Stat label="节点" value={counts.nodeCount} />
                    <Stat label="边" value={counts.edgeCount} />
                    <Stat label="资产" value={counts.assetCount} />
                    <Stat label="题目" value={counts.problemCount + counts.topicCount} />
                  </div>
                  <Separator />
                  {graph.nodes.length === 0 ? (
                    <div className="grid gap-2">
                      <p className="text-sm text-muted-foreground">还没有知识图数据，先执行一次重建。</p>
                      <Button className="w-fit" onClick={() => void handleRebuild()}>
                        <Sparkles className="h-4 w-4" />
                        重建知识图
                      </Button>
                    </div>
                  ) : (
                    <div className="grid gap-2 text-sm text-muted-foreground">
                      <p>最近生成：{graph.generatedAt || "未知"}</p>
                      <p>当前数据来自 Markdown 扫描与 frontmatter 解析。</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {workspaceTab === "graph" && (
            <Card className="min-h-[420px]">
              <CardHeader className="px-4 py-3">
                <div className="text-sm font-medium">知识图</div>
                <span className="text-xs text-muted-foreground">基础占位图层</span>
              </CardHeader>
              <CardContent className="flex min-h-[360px] items-center justify-center">
                <div className="grid gap-2 text-center text-sm text-muted-foreground">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-border bg-muted/40">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <p>这里会展示全局图与局部图。</p>
                  <p>当前先依赖 Rust 返回的节点和边数据。</p>
                </div>
              </CardContent>
            </Card>
          )}

          {["fragments", "collections", "articles"].includes(workspaceTab) && (
            <div className="grid gap-3">
              {filteredAssets.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-sm text-muted-foreground">
                    暂无匹配的资产。
                  </CardContent>
                </Card>
              ) : filteredAssets.map((asset) => (
                <Card key={asset.id}>
                  <CardHeader className="px-4 py-3">
                    <button
                      type="button"
                      className="min-w-0 text-left"
                      onClick={() => onOpenAsset?.(asset.refs[0] ?? "")}
                    >
                      <div className="truncate text-sm font-medium">{asset.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{asset.id}</div>
                    </button>
                    <Badge variant="secondary">{asset.assetType ?? "legacy-note"}</Badge>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>{asset.kind || "legacy-note"}</span>
                    <span>{asset.refs.length} refs</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {workspaceTab === "review" && (
            <Card>
              <CardContent className="grid gap-2 py-6 text-sm text-muted-foreground">
                <p>复习视图会从片段资产和关系数据开始。</p>
                <p>当前先显示最近扫描结果和重建入口。</p>
              </CardContent>
            </Card>
          )}

          {workspaceTab === "mistakes" && (
            <Card>
              <CardContent className="grid gap-2 py-6 text-sm text-muted-foreground">
                <p>错题视图暂时依赖图谱数据。</p>
                <p>后续会接入题目与主题聚类。</p>
              </CardContent>
            </Card>
          )}

          {workspaceTab === "relationships" && (
            <Card>
              <CardContent className="grid gap-2 py-6 text-sm text-muted-foreground">
                <p>关系建议先显示规则驱动的基础结果。</p>
                <p>当前版本预留后续 AI 建议位。</p>
              </CardContent>
            </Card>
          )}
        </main>

        <aside className="min-h-0 min-w-0 overflow-auto border-l border-border/70 px-4 py-4">
          <Card>
            <CardHeader className="px-4 py-3">
              <div className="text-sm font-medium">侧栏</div>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <Stat label="资产节点" value={counts.assetCount} />
              <Stat label="问题节点" value={counts.problemCount} />
              <Stat label="主题节点" value={counts.topicCount} />
              <Separator />
              <p className="text-xs text-muted-foreground">右侧区域先作为图谱摘要和后续筛选入口。</p>
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
