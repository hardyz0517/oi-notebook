import type {
  KnowledgeAssetRow,
  KnowledgeBatchHistoryEntry,
  KnowledgeGraphIndex,
  KnowledgeRelationshipSuggestion,
} from "./knowledgeTypes";

export type KnowledgeMentionReasonCode = "unlinked_problem_id" | "unlinked_oi_term";

export type P5RelationshipReasonCode =
  | KnowledgeMentionReasonCode
  | "isolated_asset"
  | "shared_topics"
  | "shared_related_problems"
  | "same_source_batch"
  | "explicit_graph_edge";

export interface ReviewTopicGroup {
  topic: string;
  count: number;
  items: KnowledgeAssetRow[];
}

export interface UnlinkedKnowledgeMention {
  id: string;
  assetId: string;
  title: string;
  path: string;
  mention: string;
  targetId: string;
  reasonCode: KnowledgeMentionReasonCode;
  refs: string[];
  preview: string;
  weight: number;
}

export interface P5RelationshipSuggestion extends KnowledgeRelationshipSuggestion {
  kind: "missing_related_problem" | "missing_topic" | "isolated_asset" | "related_asset";
  reasonCode: P5RelationshipReasonCode;
  confidence: number;
  weight: number;
  aiGenerated: false;
}

export interface P5ReviewSignalsInput {
  graph: KnowledgeGraphIndex;
  assets?: KnowledgeAssetRow[];
  contentByAssetId?: Record<string, string>;
  contentByPath?: Record<string, string>;
  recentLimit?: number;
}

export interface P5ReviewSignals {
  recentAssets: KnowledgeAssetRow[];
  topicGroups: ReviewTopicGroup[];
  isolatedAssets: KnowledgeAssetRow[];
  unlinkedMentions: UnlinkedKnowledgeMention[];
}

const PROBLEM_ID_RE = /\bP\d{3,6}\b/gi;

const OI_TERMS: Array<{ term: string; aliases: string[] }> = [
  { term: "倍增", aliases: ["倍增", "binary lifting"] },
  { term: "LCA", aliases: ["LCA", "最近公共祖先", "lowest common ancestor"] },
  { term: "Dijkstra", aliases: ["Dijkstra", "迪杰斯特拉"] },
  { term: "SPFA", aliases: ["SPFA"] },
  { term: "FFT", aliases: ["FFT", "快速傅里叶变换", "fast fourier transform"] },
  { term: "NTT", aliases: ["NTT", "快速数论变换"] },
  { term: "AC 自动机", aliases: ["AC 自动机", "Aho-Corasick", "多模式串匹配"] },
  { term: "线段树", aliases: ["线段树", "segment tree"] },
  { term: "树状数组", aliases: ["树状数组", "Fenwick"] },
  { term: "FHQ Treap", aliases: ["FHQ Treap", "非旋 Treap"] },
];

function assetKey(row: KnowledgeAssetRow): string {
  return row.id || row.path || row.refs[0] || row.title;
}

function assetOpenPath(row: KnowledgeAssetRow): string {
  return row.openPath || row.path || row.refs[0] || "";
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(value.length <= 10 ? `${value}T00:00:00.000Z` : value);
  return Number.isNaN(time) ? null : time;
}

function batchTimesByPath(batches: KnowledgeBatchHistoryEntry[] | undefined): Map<string, number> {
  const byPath = new Map<string, number>();
  for (const batch of batches ?? []) {
    const time = parseTime(batch.createdAt);
    if (time === null) continue;
    for (const asset of batch.writtenAssets) {
      const path = asset.path.trim();
      if (!path) continue;
      byPath.set(path, Math.max(byPath.get(path) ?? Number.NEGATIVE_INFINITY, time));
    }
  }
  return byPath;
}

function assetRecentTime(row: KnowledgeAssetRow, batchTimes: Map<string, number>): number {
  const candidates = [
    parseTime(row.updatedAt),
    parseTime(row.lastModified),
    parseTime(row.createdAt),
    parseTime(row.date),
    batchTimes.get(row.path) ?? null,
    ...row.refs.map((ref) => batchTimes.get(ref) ?? null),
  ].filter((time): time is number => time !== null);
  return candidates.length > 0 ? Math.max(...candidates) : Number.NEGATIVE_INFINITY;
}

function compareStableAsset(left: KnowledgeAssetRow, right: KnowledgeAssetRow): number {
  return left.title.localeCompare(right.title, "zh-CN") || assetKey(left).localeCompare(assetKey(right));
}

export function selectRecentReviewAssets(
  assets: KnowledgeAssetRow[],
  options: { batches?: KnowledgeBatchHistoryEntry[]; limit?: number } = {},
): KnowledgeAssetRow[] {
  const batchTimes = batchTimesByPath(options.batches);
  const limit = options.limit ?? assets.length;
  return [...assets]
    .sort((left, right) => {
      const timeDelta = assetRecentTime(right, batchTimes) - assetRecentTime(left, batchTimes);
      return timeDelta || compareStableAsset(left, right);
    })
    .slice(0, Math.max(0, limit));
}

export function groupReviewAssetsByTopic(assets: KnowledgeAssetRow[]): ReviewTopicGroup[] {
  const byTopic = new Map<string, KnowledgeAssetRow[]>();
  for (const asset of assets) {
    for (const rawTopic of asset.topics) {
      const topic = rawTopic.trim();
      if (!topic) continue;
      byTopic.set(topic, [...(byTopic.get(topic) ?? []), asset]);
    }
  }

  return Array.from(byTopic.entries())
    .map(([topic, items]) => ({
      topic,
      count: items.length,
      items: selectRecentReviewAssets(items),
    }))
    .sort((left, right) => right.count - left.count || left.topic.localeCompare(right.topic, "zh-CN"));
}

function hasGraphEdge(graph: KnowledgeGraphIndex, assetId: string, targetId?: string): boolean {
  return graph.edges.some((edge) => {
    const touchesAsset = edge.from === assetId || edge.to === assetId;
    if (!touchesAsset) return false;
    if (!targetId) return true;
    return edge.from === targetId || edge.to === targetId;
  });
}

export function selectIsolatedReviewAssets(assets: KnowledgeAssetRow[], graph: KnowledgeGraphIndex): KnowledgeAssetRow[] {
  return assets
    .filter((asset) => {
      const hasMetadataRelation = asset.topics.length > 0 || asset.relatedProblems.length > 0;
      const hasEdgeRelation = hasGraphEdge(graph, asset.id) || asset.relationCount > 0 || asset.degree > 0;
      return !hasMetadataRelation && !hasEdgeRelation;
    })
    .sort(compareStableAsset);
}

function recordText(asset: KnowledgeAssetRow, content: string | undefined): string {
  return [asset.title, content ?? ""].filter(Boolean).join("\n");
}

function hasRelatedProblem(asset: KnowledgeAssetRow, problemId: string): boolean {
  const wanted = normalizeToken(problemId);
  return asset.relatedProblems.some((problem) => normalizeToken(problem) === wanted);
}

function hasTopic(asset: KnowledgeAssetRow, topic: string): boolean {
  const wanted = normalizeToken(topic);
  return asset.topics.some((candidate) => normalizeToken(candidate) === wanted);
}

function includesTerm(text: string, aliases: string[]): boolean {
  const lower = text.toLowerCase();
  return aliases.some((alias) => lower.includes(alias.toLowerCase()));
}

function mentionId(asset: KnowledgeAssetRow, reasonCode: KnowledgeMentionReasonCode, mention: string): string {
  return `p5-mention:${reasonCode}:${assetKey(asset)}:${mention}`;
}

export function detectUnlinkedKnowledgeMentions(
  records: Array<{ asset: KnowledgeAssetRow; content?: string }>,
  graph: KnowledgeGraphIndex,
): UnlinkedKnowledgeMention[] {
  const mentions: UnlinkedKnowledgeMention[] = [];

  for (const record of records) {
    const text = recordText(record.asset, record.content);
    const refs = record.asset.refs.length > 0 ? record.asset.refs : [assetOpenPath(record.asset)].filter(Boolean);
    const seenProblems = new Set<string>();
    for (const match of text.matchAll(PROBLEM_ID_RE)) {
      const problemId = match[0].toUpperCase();
      if (seenProblems.has(problemId)) continue;
      seenProblems.add(problemId);
      const targetId = `problem:${problemId}`;
      if (hasRelatedProblem(record.asset, problemId) || hasGraphEdge(graph, record.asset.id, targetId)) continue;
      mentions.push({
        id: mentionId(record.asset, "unlinked_problem_id", problemId),
        assetId: record.asset.id,
        title: record.asset.title,
        path: assetOpenPath(record.asset),
        mention: problemId,
        targetId,
        reasonCode: "unlinked_problem_id",
        refs,
        preview: `正文或标题提到 ${problemId}，但 frontmatter related_problems / 图谱关系未声明。`,
        weight: 0.84,
      });
    }

    for (const term of OI_TERMS) {
      if (!includesTerm(text, term.aliases)) continue;
      const targetId = `topic:${term.term}`;
      if (hasTopic(record.asset, term.term) || hasGraphEdge(graph, record.asset.id, targetId)) continue;
      mentions.push({
        id: mentionId(record.asset, "unlinked_oi_term", term.term),
        assetId: record.asset.id,
        title: record.asset.title,
        path: assetOpenPath(record.asset),
        mention: term.term,
        targetId,
        reasonCode: "unlinked_oi_term",
        refs,
        preview: `正文或标题提到 ${term.term}，但 topics / 图谱关系未声明。`,
        weight: 0.68,
      });
    }
  }

  return mentions;
}

function contentForAsset(
  asset: KnowledgeAssetRow,
  contentByAssetId: Record<string, string> | undefined,
  contentByPath: Record<string, string> | undefined,
): string | undefined {
  return contentByAssetId?.[asset.id] ?? contentByPath?.[assetOpenPath(asset)] ?? contentByPath?.[asset.path];
}

export function buildP5ReviewSignals(input: P5ReviewSignalsInput): P5ReviewSignals {
  const assets = input.assets ?? input.graph.assets;
  const mentionRecords = assets.map((asset) => ({
    asset,
    content: contentForAsset(asset, input.contentByAssetId, input.contentByPath),
  }));

  return {
    recentAssets: selectRecentReviewAssets(assets, {
      batches: input.graph.batches,
      limit: input.recentLimit,
    }),
    topicGroups: groupReviewAssetsByTopic(assets),
    isolatedAssets: selectIsolatedReviewAssets(assets, input.graph),
    unlinkedMentions: detectUnlinkedKnowledgeMentions(mentionRecords, input.graph),
  };
}

function suggestionRefs(asset: KnowledgeAssetRow): string[] {
  const path = assetOpenPath(asset);
  return asset.refs.length > 0 ? asset.refs : path ? [path] : [];
}

function relationshipSuggestion(input: {
  kind: P5RelationshipSuggestion["kind"];
  source: string;
  target: string;
  reasonCode: P5RelationshipReasonCode;
  reason: string;
  refs: string[];
  preview: string;
  confidence: number;
  weight: number;
}): P5RelationshipSuggestion {
  const id = `p5:${input.reasonCode}:${input.source}:${input.target}`;
  return {
    id,
    kind: input.kind,
    source: input.source,
    target: input.target,
    reason: input.reason,
    refs: input.refs,
    preview: input.preview,
    score: Number((input.confidence * input.weight).toFixed(3)),
    reasonCode: input.reasonCode,
    confidence: input.confidence,
    weight: input.weight,
    aiGenerated: false,
  };
}

function sharedValues(left: string[], right: string[]): string[] {
  const rightSet = new Set(right.map(normalizeToken));
  return left.filter((value) => rightSet.has(normalizeToken(value))).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function hasDirectAssetEdge(graph: KnowledgeGraphIndex, leftId: string, rightId: string): boolean {
  return graph.edges.some((edge) => (edge.from === leftId && edge.to === rightId) || (edge.from === rightId && edge.to === leftId));
}

export function buildP5RelationshipSuggestions(input: P5ReviewSignalsInput): P5RelationshipSuggestion[] {
  const assets = [...(input.assets ?? input.graph.assets)].sort((left, right) => assetKey(left).localeCompare(assetKey(right)));
  const signals = buildP5ReviewSignals({ ...input, assets });
  const suggestions: P5RelationshipSuggestion[] = [];

  for (const isolated of signals.isolatedAssets) {
    suggestions.push(relationshipSuggestion({
      kind: "isolated_asset",
      source: isolated.id,
      target: isolated.id,
      reasonCode: "isolated_asset",
      reason: "规则提示：该资产暂无 topic、related_problems 或图谱边，建议人工确认是否补充关联。",
      refs: suggestionRefs(isolated),
      preview: "待人工确认：补充 frontmatter topics / related_problems，或加入明确 wikilink。",
      confidence: 0.72,
      weight: 1,
    }));
  }

  for (const mention of signals.unlinkedMentions) {
    suggestions.push(relationshipSuggestion({
      kind: mention.reasonCode === "unlinked_problem_id" ? "missing_related_problem" : "missing_topic",
      source: mention.assetId,
      target: mention.targetId,
      reasonCode: mention.reasonCode,
      reason: mention.preview,
      refs: mention.refs,
      preview: "待人工确认：如果提及成立，请补充 frontmatter 或建立显式链接。",
      confidence: mention.weight,
      weight: 1,
    }));
  }

  for (let index = 0; index < assets.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < assets.length; otherIndex += 1) {
      const left = assets[index];
      const right = assets[otherIndex];
      if (left.id === right.id || hasDirectAssetEdge(input.graph, left.id, right.id)) continue;

      const problems = sharedValues(left.relatedProblems, right.relatedProblems);
      if (problems.length > 0) {
        suggestions.push(relationshipSuggestion({
          kind: "related_asset",
          source: left.id,
          target: right.id,
          reasonCode: "shared_related_problems",
          reason: `规则提示：两个资产关联同一题号 ${problems.join("、")}，可人工确认是否互链。`,
          refs: [...suggestionRefs(left), ...suggestionRefs(right)],
          preview: `${left.title} <-> ${right.title}`,
          confidence: 0.82,
          weight: Math.min(2, 1 + problems.length * 0.25),
        }));
        continue;
      }

      const topics = sharedValues(left.topics, right.topics);
      if (topics.length > 0) {
        suggestions.push(relationshipSuggestion({
          kind: "related_asset",
          source: left.id,
          target: right.id,
          reasonCode: "shared_topics",
          reason: `规则提示：两个资产共享 topic ${topics.join("、")}，可人工确认是否加入互链或集合。`,
          refs: [...suggestionRefs(left), ...suggestionRefs(right)],
          preview: `${left.title} <-> ${right.title}`,
          confidence: 0.74,
          weight: Math.min(2, 1 + topics.length * 0.2),
        }));
      }
    }
  }

  const byId = new Map<string, P5RelationshipSuggestion>();
  for (const suggestion of suggestions) {
    const existing = byId.get(suggestion.id);
    if (!existing || suggestion.score > existing.score) byId.set(suggestion.id, suggestion);
  }
  return Array.from(byId.values()).sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}
