export type KnowledgeAssetType = "fragment" | "collection" | "article" | "legacy-note";

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
  status: "pending" | "confirmed" | "skipped" | "written" | "failed";
  output: {
    fragment: boolean;
    article: boolean;
  };
  fields: TrainingItemDraftFields;
}

export interface TrainingBatchDraft {
  id: string;
  title: string;
  sourceType: TrainingSourceType;
  sourceLabel: string;
  createdAt: string;
  status: "draft" | "ready" | "writing" | "written" | "partial" | "failed";
  itemIds: string[];
}

export type KnowledgeGraphNodeType = "asset" | "problem" | "topic" | "training" | "kind" | "type" | "collection";

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
  title: string;
  assetType: KnowledgeAssetType;
  kind: string;
  refs: string[];
  relationCount: number;
}
