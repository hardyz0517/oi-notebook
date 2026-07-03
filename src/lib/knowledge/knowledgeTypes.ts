export type KnowledgeAssetType =
  | "fragment"
  | "collection"
  | "article"
  | "legacy-note"
  | "legacy-luogu-solution"
  | "legacy-problem-note";

export type KnowledgeAssetStatus = "draft" | "active" | "archived";

export type ReviewPriority = "low" | "medium" | "high";

export interface KnowledgeAssetFrontmatter {
  type: KnowledgeAssetType;
  kind: string;
  title: string;
  date: string;
  topics: string[];
  relatedProblems: string[];
  source: "luogu" | "manual" | "import" | "unknown";
  createdFrom: "training-center" | "manual" | "luogu-import-legacy" | "unknown";
  reviewPriority: ReviewPriority;
  status: KnowledgeAssetStatus;
}

export type TrainingItemStatus = "draft" | "ready" | "written" | "skipped" | "failed";

export type TrainingSourceType =
  | "luogu-today"
  | "luogu-range"
  | "luogu-single"
  | "luogu-problemset-future"
  | "luogu-contest-future";

export interface TrainingItemDraftFields {
  title: string;
  oneLineProblem: string;
  coreIdea: string;
  pitfalls: string;
  reviewHint: string;
  topics: string[];
  relatedProblems: string[];
  reviewPriority: ReviewPriority;
}

export interface TrainingItemDraft {
  id: string;
  batchId: string;
  problemId: string;
  problemTitle: string;
  submissionId?: string;
  submitTime?: string;
  difficulty?: string;
  status: TrainingItemStatus;
  output: {
    fragment: boolean;
    article: boolean;
  };
  fields: TrainingItemDraftFields;
}

export type TrainingItemOutputSelection = TrainingItemDraft["output"];

export interface TrainingBatchDraft {
  id: string;
  title: string;
  sourceType: TrainingSourceType;
  sourceLabel: string;
  createdAt: string;
  status: "draft" | "ready" | "writing" | "written" | "partial" | "failed";
  itemIds: string[];
}

export type KnowledgeGraphNodeType = "asset" | "problem" | "topic" | "training" | "kind" | "type" | "collection" | "batch";

export type KnowledgeGraphEdgeType = "links_to" | "mentions" | "contains" | "related_to" | "derived_from";

export type KnowledgeGraphEdgeSource =
  | "frontmatter"
  | "wikilink"
  | "problem_id_match"
  | "term_match"
  | "import_rule"
  | "manual"
  | "ai_extract_future"
  | "embedding_future";

export interface KnowledgeGraphNode {
  id: string;
  type: KnowledgeGraphNodeType;
  title: string;
  refs: string[];
  assetType?: KnowledgeAssetType;
  kind?: string;
  source?: string;
  classificationReason?: string;
  classificationConfidence?: number;
  topics?: string[];
  status?: KnowledgeAssetStatus;
  reviewPriority?: ReviewPriority;
  masteryStatus?: "unknown" | "learning" | "stable" | "needs-review";
  createdAt?: string;
  updatedAt?: string;
  lastReviewedAt?: string;
}

export interface KnowledgeGraphEdge {
  from: string;
  to: string;
  type: KnowledgeGraphEdgeType;
  source: KnowledgeGraphEdgeSource;
  confidence: number;
  refs: string[];
}

export interface KnowledgeGraphIndex {
  generatedAt: string;
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  assets: KnowledgeAssetRow[];
  suggestions: KnowledgeRelationshipSuggestion[];
  reviewSlices: KnowledgeReviewSlice[];
  batches: KnowledgeBatchHistoryEntry[];
}

export type KnowledgeWorkspaceTabId =
  | "overview"
  | "graph"
  | "fragments"
  | "collections"
  | "articles"
  | "review"
  | "mistakes"
  | "relationships";

export interface KnowledgeGraphSummary {
  nodeCount: number;
  edgeCount: number;
  assetCount: number;
  problemCount: number;
  topicCount: number;
}

export interface KnowledgeAssetRow {
  id: string;
  type: "asset";
  assetType: KnowledgeAssetType;
  title: string;
  kind: string;
  date: string;
  topics: string[];
  relatedProblems: string[];
  source: string;
  createdFrom: string;
  reviewPriority: ReviewPriority | string;
  status: KnowledgeAssetStatus | string;
  path: string;
  refs: string[];
  lastModified: string;
  relationCount: number;
  missingMetadataFlags: string[];
  classificationReason: string;
  classificationConfidence: number;
  inDegree: number;
  outDegree: number;
  degree: number;
  isolated: boolean;
  componentId: number;
  openPath?: string;
  masteryStatus?: "unknown" | "learning" | "stable" | "needs-review";
  createdAt?: string;
  updatedAt?: string;
  lastReviewedAt?: string | null;
}

export interface KnowledgeRelationshipSuggestion {
  id: string;
  kind:
    | "missing_related_problem"
    | "missing_topic"
    | "missing_backlink"
    | "isolated_asset"
    | "upgrade_legacy_luogu_solution"
    | string;
  source: string;
  target: string;
  reason: string;
  refs: string[];
  preview: string;
  score: number;
}

export interface KnowledgeReviewSlice {
  assetId: string;
  title: string;
  path: string;
  reviewPriority: ReviewPriority | string;
  status: KnowledgeAssetStatus | string;
  kind: string;
  topics: string[];
  relatedProblems: string[];
  lastReviewedAt: string | null;
  score: number;
  reasons: string[];
}

export interface KnowledgeBatchAssetRef {
  kind: "collection" | "fragment" | "article" | "unknown" | string;
  path: string;
  title?: string | null;
  problemId?: string | null;
}

export interface KnowledgeBatchHistoryEntry {
  batchId: string;
  sourceType: TrainingSourceType | string;
  sourceLabel: string;
  createdAt: string;
  collectionPath: string;
  writtenAssets: KnowledgeBatchAssetRef[];
  skippedItems: string[];
  failedItems: string[];
  graphRefresh: {
    nodeCount: number;
    edgeCount: number;
    refreshedAt: string;
  };
}

export interface TrainingBatchDuplicateDraft {
  batch: TrainingBatchDraft;
  items: TrainingItemDraft[];
  sourceBatchId: string;
  sourceCollectionPath: string;
}

export type LegacyMigrationTarget = "fragment" | "collection";

export interface LegacyMigrationDraft {
  sourcePath: string;
  sourceTitle: string;
  targetType: LegacyMigrationTarget;
  targetPath: string;
  markdown: string;
  originalLink: string;
  requiresConfirmation: boolean;
  writesOriginal: boolean;
  complexity: "summary-only" | "simple";
}

export interface KnowledgeBatchHistoryRow {
  batchId: string;
  title: string;
  sourceLabel: string;
  sourceType: TrainingSourceType | string;
  createdAt: string;
  collectionPath: string;
  writtenCount: number;
  skippedCount: number;
  failedCount: number;
  graphSummary: string;
}

export interface TrainingBatchWriteCollectionPlan {
  relativePath: string;
  markdown: string;
}

export interface TrainingBatchWriteFragmentPlan {
  itemId: string;
  relativePath: string;
  markdown: string;
}

export interface TrainingBatchWriteSkippedItem {
  itemId: string;
  reason: string;
}

export interface TrainingBatchWritePlan {
  collection: TrainingBatchWriteCollectionPlan;
  fragments: TrainingBatchWriteFragmentPlan[];
  skippedItems: TrainingBatchWriteSkippedItem[];
}

export function normalizeKnowledgeText(value: string, fallback = ""): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed || fallback;
}

export function normalizeKnowledgeList(values: string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const rawValue of values) {
    const value = normalizeKnowledgeText(rawValue);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(value);
  }

  return normalized;
}

export function normalizeKnowledgePathSegment(value: string, fallback: string): string {
  const trimmed = normalizeKnowledgeText(value, fallback);
  const sanitized = trimmed
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .replace(/^-+|-+$/g, "");

  return sanitized || fallback;
}

export function createTrainingBatchSlug(batch: TrainingBatchDraft): string {
  return normalizeKnowledgePathSegment(batch.id, "batch");
}

export function createTrainingItemSlug(item: TrainingItemDraft): string {
  return normalizeKnowledgePathSegment(item.problemId || item.id, item.id);
}
