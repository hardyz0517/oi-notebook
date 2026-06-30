import type {
  KnowledgeAssetRow,
  KnowledgeAssetStatus,
  KnowledgeAssetType,
  KnowledgeGraphIndex,
  ReviewPriority,
} from "./knowledgeTypes";

export interface KnowledgeAssetFilterState {
  assetType?: KnowledgeAssetType | "all";
  topic?: string;
  source?: string;
  status?: KnowledgeAssetStatus | "all";
  reviewPriority?: ReviewPriority | "all";
  minRelations?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface KnowledgeOverviewStats {
  nodeCount: number;
  edgeCount: number;
  assetCount: number;
  fragmentCount: number;
  collectionCount: number;
  articleCount: number;
  problemCount: number;
  topicCount: number;
  topTopics: Array<{ topic: string; count: number }>;
}

export interface KnowledgeReviewRow extends KnowledgeAssetRow {
  reasons: string[];
  reviewScore: number;
  canEditLongTermState: boolean;
}

export interface KnowledgeSuggestionRow {
  id: string;
  kind: "isolated-asset" | "missing-topic" | "unlinked-problem";
  targetTitle: string;
  targetPath: string;
  reason: string;
  refs: string[];
  preview: string;
  score: number;
  action: {
    kind: "open-markdown";
    enabled: boolean;
    path: string;
    label: string;
  };
}

function countRelations(graph: KnowledgeGraphIndex, nodeId: string): number {
  return graph.edges.filter((edge) => edge.from === nodeId || edge.to === nodeId).length;
}

function normalizeDate(value: string | undefined): string {
  return value?.slice(0, 10) ?? "";
}

function daysBetween(from: string, to: string): number | null {
  if (!from || !to) return null;
  const start = Date.parse(`${from.slice(0, 10)}T00:00:00.000Z`);
  const end = Date.parse(`${to.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

export function mapGraphToAssetRows(graph: KnowledgeGraphIndex): KnowledgeAssetRow[] {
  return graph.nodes
    .filter((node) => node.type === "asset")
    .map((node) => ({
      id: node.id,
      title: node.title,
      assetType: node.assetType ?? "legacy-note",
      kind: node.kind ?? "legacy-note",
      refs: node.refs,
      relationCount: countRelations(graph, node.id),
      openPath: node.refs[0] ?? "",
      topics: node.topics ?? [],
      source: node.source ?? "unknown",
      status: node.status ?? "active",
      reviewPriority: node.reviewPriority ?? "medium",
      masteryStatus: node.masteryStatus ?? "unknown",
      createdAt: normalizeDate(node.createdAt),
      updatedAt: normalizeDate(node.updatedAt),
      lastReviewedAt: normalizeDate(node.lastReviewedAt),
    }))
    .sort((left, right) => right.relationCount - left.relationCount || left.title.localeCompare(right.title, "zh-CN"));
}

export function filterKnowledgeAssetRows(
  rows: KnowledgeAssetRow[],
  filters: KnowledgeAssetFilterState,
): KnowledgeAssetRow[] {
  const topic = filters.topic?.trim().toLowerCase() ?? "";
  const source = filters.source?.trim().toLowerCase() ?? "";
  return rows.filter((row) => {
    if (filters.assetType && filters.assetType !== "all" && row.assetType !== filters.assetType) return false;
    if (filters.status && filters.status !== "all" && row.status !== filters.status) return false;
    if (filters.reviewPriority && filters.reviewPriority !== "all" && row.reviewPriority !== filters.reviewPriority) return false;
    if (topic && !row.topics.some((value) => value.toLowerCase().includes(topic))) return false;
    if (source && row.source.toLowerCase() !== source) return false;
    if (filters.minRelations !== undefined && row.relationCount < filters.minRelations) return false;
    if (filters.dateFrom && row.createdAt && row.createdAt < filters.dateFrom) return false;
    if (filters.dateTo && row.createdAt && row.createdAt > filters.dateTo) return false;
    return true;
  });
}

export function buildKnowledgeOverviewStats(graph: KnowledgeGraphIndex): KnowledgeOverviewStats {
  const assets = mapGraphToAssetRows(graph);
  const topicCounts = new Map<string, number>();
  for (const row of assets) {
    for (const topic of row.topics) {
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }
  }

  return {
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    assetCount: assets.length,
    fragmentCount: assets.filter((row) => row.assetType === "fragment").length,
    collectionCount: assets.filter((row) => row.assetType === "collection").length,
    articleCount: assets.filter((row) => row.assetType === "article").length,
    problemCount: graph.nodes.filter((node) => node.type === "problem").length,
    topicCount: graph.nodes.filter((node) => node.type === "topic").length,
    topTopics: Array.from(topicCounts.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((left, right) => right.count - left.count || left.topic.localeCompare(right.topic, "zh-CN"))
      .slice(0, 8),
  };
}

export function buildReviewRows(rows: KnowledgeAssetRow[], today: string): KnowledgeReviewRow[] {
  return rows
    .filter((row) => row.assetType === "fragment" || row.kind === "mistake")
    .map((row) => {
      const reasons: string[] = [];
      let reviewScore = row.relationCount;
      if (row.reviewPriority === "high") {
        reasons.push("高优先级");
        reviewScore += 30;
      }
      const staleDays = daysBetween(row.lastReviewedAt || row.createdAt, today);
      if (staleDays !== null && staleDays >= 14) {
        reasons.push(`${staleDays} 天未复习`);
        reviewScore += staleDays;
      }
      if (row.relationCount >= 3) {
        reasons.push(`最近训练重复出现 ${row.relationCount} 次`);
        reviewScore += row.relationCount * 2;
      }
      if (reasons.length === 0) reasons.push("最近新增");

      return {
        ...row,
        reasons,
        reviewScore,
        canEditLongTermState: false,
      };
    })
    .sort((left, right) => right.reviewScore - left.reviewScore);
}

export function buildSuggestionRows(graph: KnowledgeGraphIndex): KnowledgeSuggestionRow[] {
  return mapGraphToAssetRows(graph)
    .filter((row) => row.openPath && row.relationCount === 0)
    .map((row) => ({
      id: `suggestion:${row.id}:isolated`,
      kind: "isolated-asset",
      targetTitle: row.title,
      targetPath: row.openPath,
      reason: "没有检测到 topic、题号或显式链接关系",
      refs: row.refs,
      preview: "建议手动补充 frontmatter topics / related_problems，或在正文加入显式链接。",
      score: 0.72,
      action: {
        kind: "open-markdown",
        enabled: true,
        path: row.openPath,
        label: "打开 Markdown 手动编辑",
      },
    }));
}
