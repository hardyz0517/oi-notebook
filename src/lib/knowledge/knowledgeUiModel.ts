import type {
  KnowledgeAssetRow,
  KnowledgeAssetStatus,
  KnowledgeAssetType,
  KnowledgeGraphIndex,
  ReviewMastery,
  ReviewPriority,
} from "./knowledgeTypes";
import {
  buildP5RelationshipSuggestions,
  selectIsolatedReviewAssets,
} from "./knowledgeReviewSignals";

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
  kind: "isolated-asset" | "missing-topic" | "unlinked-problem" | "legacy-upgrade" | "related-asset";
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

function assetOpenPath(row: KnowledgeAssetRow): string {
  return row.openPath || row.path || row.refs[0] || "";
}

function daysBetween(from: string, to: string): number | null {
  if (!from || !to) return null;
  const start = Date.parse(`${from.slice(0, 10)}T00:00:00.000Z`);
  const end = Date.parse(`${to.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function normalizeMastery(value: string | undefined): ReviewMastery {
  if (value === "new" || value === "learning" || value === "familiar" || value === "mastered") return value;
  if (value === "stable") return "familiar";
  if (value === "needs-review") return "learning";
  return "new";
}

export function mapGraphToAssetRows(graph: KnowledgeGraphIndex): KnowledgeAssetRow[] {
  if (graph.assets.length > 0) {
    return graph.assets
      .map((row) => ({
        ...row,
        openPath: assetOpenPath(row),
        mastery: normalizeMastery(row.mastery ?? row.masteryStatus),
        masteryStatus: row.masteryStatus ?? "unknown",
        createdAt: normalizeDate(row.createdAt ?? row.date),
        updatedAt: normalizeDate(row.updatedAt ?? row.lastModified),
        lastReviewedAt: row.lastReviewedAt ?? null,
      }))
      .sort((left, right) => right.relationCount - left.relationCount || left.title.localeCompare(right.title, "zh-CN"));
  }

  return graph.nodes
    .filter((node) => node.type === "asset")
    .map((node) => {
      const relationCount = countRelations(graph, node.id);
      const openPath = node.refs[0] ?? "";
      return ({
        id: node.id,
        type: "asset",
        title: node.title,
        assetType: node.assetType ?? "legacy-note",
        kind: node.kind ?? "legacy-note",
        date: normalizeDate(node.createdAt),
        topics: node.topics ?? [],
        relatedProblems: [],
        source: node.source ?? "unknown",
        createdFrom: "unknown",
        reviewPriority: node.reviewPriority ?? "medium",
        mastery: normalizeMastery(node.mastery ?? node.masteryStatus),
        status: node.status ?? "active",
        path: openPath,
        refs: node.refs,
        lastModified: normalizeDate(node.updatedAt),
        relationCount,
        missingMetadataFlags: [],
        classificationReason: node.classificationReason ?? "node_fallback",
        classificationConfidence: node.classificationConfidence ?? 0,
        inDegree: graph.edges.filter((edge) => edge.to === node.id).length,
        outDegree: graph.edges.filter((edge) => edge.from === node.id).length,
        degree: relationCount,
        isolated: relationCount === 0,
        componentId: 0,
        openPath,
        masteryStatus: node.masteryStatus ?? "unknown",
        createdAt: normalizeDate(node.createdAt),
        updatedAt: normalizeDate(node.updatedAt),
        lastReviewedAt: node.lastReviewedAt ? normalizeDate(node.lastReviewedAt) : null,
      } satisfies KnowledgeAssetRow);
    })
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
  const isolationGraph: KnowledgeGraphIndex = {
    generatedAt: today,
    nodes: [],
    edges: [],
    assets: rows,
    suggestions: [],
    reviewSlices: [],
    batches: [],
  };
  const isolatedIds = new Set(selectIsolatedReviewAssets(rows, isolationGraph).map((row) => row.id));

  return rows
    .filter((row) => row.assetType === "fragment" || row.kind === "mistake")
    .map((row) => {
      const reasons: string[] = [];
      let reviewScore = row.relationCount;
      if (row.reviewPriority === "high") {
        reasons.push("高优先级");
        reviewScore += 30;
      }
      const staleDays = daysBetween(row.lastReviewedAt || row.createdAt || "", today);
      if (staleDays !== null && staleDays >= 14) {
        reasons.push(`${staleDays} 天未复习`);
        reviewScore += staleDays;
      }
      if (row.relationCount >= 3) {
        reasons.push(`最近训练重复出现 ${row.relationCount} 次`);
        reviewScore += row.relationCount * 2;
      }
      if (row.mastery === "new" || row.masteryStatus === "needs-review") {
        reasons.push("掌握状态待复习");
        reviewScore += 8;
      }
      if (isolatedIds.has(row.id)) {
        reasons.push("规则提示：缺少关联");
        reviewScore += 4;
      }
      if (reasons.length === 0) reasons.push("最近新增");

      return {
        ...row,
        reasons,
        reviewScore,
        canEditLongTermState: false,
      };
    })
    .sort((left, right) => right.reviewScore - left.reviewScore || left.title.localeCompare(right.title, "zh-CN"));
}

export function buildSuggestionRows(graph: KnowledgeGraphIndex): KnowledgeSuggestionRow[] {
  const graphSuggestions: KnowledgeSuggestionRow[] = graph.suggestions.map((suggestion) => {
    const path = suggestion.refs[0] ?? suggestion.target;
    const isLegacyUpgrade = suggestion.kind.includes("upgrade_legacy_luogu_solution");
    return {
      id: suggestion.id,
      kind: isLegacyUpgrade
        ? "legacy-upgrade"
        : suggestion.kind.includes("missing_topic")
          ? "missing-topic"
          : suggestion.kind.includes("missing_related_problem")
            ? "unlinked-problem"
            : "isolated-asset",
      targetTitle: suggestion.target,
      targetPath: path,
      reason: suggestion.reason,
      refs: suggestion.refs,
      preview: suggestion.preview,
      score: suggestion.score,
      action: {
        kind: "open-markdown",
        enabled: Boolean(path),
        path,
        label: isLegacyUpgrade ? "预览升级草稿" : "打开 Markdown 手动编辑",
      },
    };
  });

  const assets = mapGraphToAssetRows(graph);
  const p5Suggestions: KnowledgeSuggestionRow[] = buildP5RelationshipSuggestions({ graph, assets }).map((suggestion) => {
    const source = assets.find((row) => row.id === suggestion.source);
    const target = assets.find((row) => row.id === suggestion.target);
    const path = source ? assetOpenPath(source) : suggestion.refs[0] ?? suggestion.source;
    return {
      id: suggestion.id,
      kind: suggestion.kind === "related_asset"
        ? "related-asset"
        : suggestion.kind === "missing_topic"
          ? "missing-topic"
          : suggestion.kind === "missing_related_problem"
            ? "unlinked-problem"
            : "isolated-asset",
      targetTitle: target?.title ?? source?.title ?? suggestion.target,
      targetPath: path,
      reason: suggestion.reason,
      refs: suggestion.refs,
      preview: `${suggestion.preview}（规则提示，待人工确认）`,
      score: suggestion.score,
      action: {
        kind: "open-markdown",
        enabled: Boolean(path),
        path,
        label: "打开 Markdown 手动确认",
      },
    };
  });

  const byId = new Map<string, KnowledgeSuggestionRow>();
  for (const suggestion of [...graphSuggestions, ...p5Suggestions]) {
    byId.set(suggestion.id, suggestion);
  }

  return Array.from(byId.values())
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
}
