import {
  normalizeKnowledgeList,
  normalizeKnowledgeText,
  type KnowledgeAssetType,
  type KnowledgeGraphIndex,
  type KnowledgeGraphNode,
  type ReviewPriority,
  type TrainingBatchDraft,
  type TrainingItemDraft,
  type TrainingItemStatus,
} from "./knowledgeTypes";

export type AiReservationReason = "reserved-for-future-ai";

export interface AiReservationState {
  enabled: false;
  modelConnected: false;
  reason: AiReservationReason;
}

export type KnowledgeAiSelection =
  | { kind: "none" }
  | {
      kind: "problem";
      problemId: string;
      title: string;
      trainingItemId?: string;
    }
  | {
      kind: "fragment" | "article" | "collection";
      id: string;
      path: string;
      title?: string;
    };

export interface TrainingAiBatchSummary {
  id: string;
  title: string;
  sourceType: string;
  sourceLabel: string;
  createdAt: string;
  collectionKind?: string;
  sourceInput?: string;
}

export interface TrainingAiItemSummary {
  id: string;
  problemId: string;
  problemTitle: string;
  status: TrainingItemStatus;
  output: TrainingItemDraft["output"];
  sourceType?: string;
  sourceRefs: string[];
  submissionRefs: string[];
  existingAssetRefs: string[];
  fields: {
    title: string;
    oneLineProblem: string;
    coreIdea: string;
    pitfalls: string;
    reviewHint: string;
    topics: string[];
    relatedProblems: string[];
    reviewPriority: ReviewPriority;
  };
}

export interface TrainingAiReviewState {
  draft: number;
  ready: number;
  written: number;
  skipped: number;
  failed: number;
  total: number;
}

export interface KnowledgeGraphNeighborSummary {
  id: string;
  type: KnowledgeGraphNode["type"];
  title: string;
  refs: string[];
  assetType?: KnowledgeAssetType;
  kind?: string;
  topics: string[];
}

export interface KnowledgeAiGraphSummary {
  generatedAt?: string;
  focusNodeIds: string[];
  neighbors: KnowledgeGraphNeighborSummary[];
  truncated: boolean;
}

export interface TrainingAiContext {
  kind: "training-ai-context";
  contextId: string;
  ai: AiReservationState;
  batch: TrainingAiBatchSummary;
  selection: KnowledgeAiSelection;
  selectedTrainingItem: TrainingAiItemSummary | null;
  items: TrainingAiItemSummary[];
  graph: KnowledgeAiGraphSummary;
  reviewState: TrainingAiReviewState;
}

export type AiReservationContext = TrainingAiContext;
export type KnowledgeAiContext = TrainingAiContext;

export interface BuildTrainingAiContextInput {
  batch: TrainingBatchDraft;
  items: TrainingItemDraft[];
  selectedItemId?: string | null;
  selection?: KnowledgeAiSelection;
  graph?: KnowledgeGraphIndex | null;
  maxGraphNeighbors?: number;
}

export type NoteXPatchTarget = {
  kind: "notex-note";
  path: string;
};

export type KnowledgePatchTarget =
  | {
      kind: "knowledge-asset";
      assetType: "fragment" | "article" | "collection";
      path: string;
      assetId?: string;
    }
  | {
      kind: "knowledge-relationship";
      fromId: string;
      toId: string;
      relationshipType: string;
    }
  | {
      kind: "review-state";
      assetId: string;
    }
  | {
      kind: "draft-fragment";
      draftId: string;
      sourceItemId?: string;
    };

export type PatchTarget = KnowledgePatchTarget | NoteXPatchTarget;

export type PatchIntent =
  | {
      kind: "update-frontmatter";
      fields: Record<string, string | string[] | number | boolean | null>;
    }
  | {
      kind: "append-markdown-section";
      heading: string;
      markdown: string;
    }
  | {
      kind: "link-knowledge";
      relationshipType: string;
      sourceId: string;
      targetId: string;
    }
  | {
      kind: "adjust-review-state";
      reviewPriority?: ReviewPriority;
      masteryStatus?: "unknown" | "learning" | "stable" | "needs-review";
      lastReviewedAt?: string | null;
    }
  | {
      kind: "create-fragment-from-draft";
      title: string;
      markdown: string;
      topics: string[];
      relatedProblems: string[];
    };

export interface PatchPreviewSource {
  kind: "mock" | "manual" | "future-ai";
  stage: "p4-a" | "p4-b" | "p5";
  contextId: string;
  createdAt: string;
}

export interface PatchPreviewInput {
  id: string;
  title: string;
  target: PatchTarget;
  intent: PatchIntent;
  source: PatchPreviewSource;
  summary?: string;
}

export interface PatchPreview extends PatchPreviewInput {
  valid: boolean;
  validationReason: string | null;
  executable: false;
}

export interface MockKnowledgeProposalInput {
  id: string;
  title: string;
  contextId: string;
  previews: PatchPreviewInput[];
  summary?: string;
}

export interface MockKnowledgeProposal {
  id: string;
  title: string;
  contextId: string;
  summary: string;
  status: "mock-disabled";
  aiGenerated: false;
  previews: PatchPreview[];
}

type PatchTargetValidation =
  | { ok: true; reason: null }
  | { ok: false; reason: string };

const AI_RESERVED: AiReservationState = {
  enabled: false,
  modelConnected: false,
  reason: "reserved-for-future-ai",
};

function contextIdFor(batch: TrainingBatchDraft, selection: KnowledgeAiSelection): string {
  const suffix =
    selection.kind === "none"
      ? "none"
      : selection.kind === "problem"
        ? selection.problemId
        : selection.id || selection.path;
  return `training-ai-context:${batch.id}:${suffix}`;
}

function summarizeBatch(batch: TrainingBatchDraft): TrainingAiBatchSummary {
  return {
    id: batch.id,
    title: batch.title,
    sourceType: batch.sourceType,
    sourceLabel: batch.sourceLabel,
    createdAt: batch.createdAt,
    collectionKind: batch.collectionKind,
    sourceInput: batch.sourceInput,
  };
}

function summarizeItem(item: TrainingItemDraft): TrainingAiItemSummary {
  return {
    id: item.id,
    problemId: item.problemId,
    problemTitle: item.problemTitle,
    status: item.status,
    output: { ...item.output },
    sourceType: item.sourceType,
    sourceRefs: normalizeKnowledgeList(item.sourceRefs ?? []),
    submissionRefs: normalizeKnowledgeList(item.submissionRefs ?? []),
    existingAssetRefs: normalizeKnowledgeList(item.existingAssetRefs ?? []),
    fields: {
      title: item.fields.title,
      oneLineProblem: item.fields.oneLineProblem,
      coreIdea: item.fields.coreIdea,
      pitfalls: item.fields.pitfalls,
      reviewHint: item.fields.reviewHint,
      topics: normalizeKnowledgeList(item.fields.topics),
      relatedProblems: normalizeKnowledgeList(item.fields.relatedProblems),
      reviewPriority: item.fields.reviewPriority,
    },
  };
}

function buildReviewState(items: TrainingItemDraft[]): TrainingAiReviewState {
  const state: TrainingAiReviewState = {
    draft: 0,
    ready: 0,
    written: 0,
    skipped: 0,
    failed: 0,
    total: items.length,
  };
  for (const item of items) {
    state[item.status] += 1;
  }
  return state;
}

function selectionFromItem(item: TrainingItemDraft | null | undefined): KnowledgeAiSelection {
  if (!item) return { kind: "none" };
  const problemId = normalizeKnowledgeText(item.problemId);
  if (!problemId) return { kind: "none" };
  return {
    kind: "problem",
    problemId,
    title: normalizeKnowledgeText(item.fields.title, item.problemTitle || problemId),
    trainingItemId: item.id,
  };
}

function graphNodeSummary(node: KnowledgeGraphNode): KnowledgeGraphNeighborSummary {
  return {
    id: node.id,
    type: node.type,
    title: node.title,
    refs: [...node.refs],
    assetType: node.assetType,
    kind: node.kind,
    topics: normalizeKnowledgeList(node.topics ?? []),
  };
}

function nodeIdsForSelection(selection: KnowledgeAiSelection, selectedItem: TrainingItemDraft | null): string[] {
  const ids: string[] = [];
  if (selection.kind === "problem") {
    ids.push(`problem:${selection.problemId}`);
  }
  if (selection.kind !== "none" && selection.kind !== "problem") {
    ids.push(selection.id);
    if (selection.path) ids.push(`asset:${selection.path}`);
  }
  for (const problemId of selectedItem?.fields.relatedProblems ?? []) {
    ids.push(`problem:${problemId}`);
  }
  return normalizeKnowledgeList(ids);
}

function topicNodeIdsForItem(item: TrainingItemDraft | null): string[] {
  return normalizeKnowledgeList([
    ...(item?.fields.topics ?? []),
    ...(item?.suggestedTopics ?? []),
  ]).map((topic) => `topic:${topic}`);
}

function summarizeGraph(
  graph: KnowledgeGraphIndex | null | undefined,
  selection: KnowledgeAiSelection,
  selectedItem: TrainingItemDraft | null,
  maxGraphNeighbors: number,
): KnowledgeAiGraphSummary {
  if (!graph) {
    return {
      focusNodeIds: [],
      neighbors: [],
      truncated: false,
    };
  }

  const focusIds = nodeIdsForSelection(selection, selectedItem);
  const topicIds = topicNodeIdsForItem(selectedItem);
  const directNeighborIds = new Set<string>();
  const neighborIds = new Set<string>();
  const topicIdSet = new Set(topicIds);

  for (const edge of graph.edges) {
    const touchesFocus = focusIds.includes(edge.from) || focusIds.includes(edge.to);
    const touchesTopic = topicIdSet.has(edge.from) || topicIdSet.has(edge.to);
    if (touchesFocus) {
      directNeighborIds.add(edge.from);
      directNeighborIds.add(edge.to);
    }
    if (touchesFocus || touchesTopic) {
      neighborIds.add(edge.from);
      neighborIds.add(edge.to);
    }
  }
  for (const topicId of topicIds) {
    neighborIds.add(topicId);
  }
  for (const focusId of focusIds) {
    neighborIds.delete(focusId);
  }

  const neighbors = graph.nodes
    .filter((node) => neighborIds.has(node.id))
    .map(graphNodeSummary)
    .sort((left, right) => {
      const leftPriority = directNeighborIds.has(left.id) ? 0 : 1;
      const rightPriority = directNeighborIds.has(right.id) ? 0 : 1;
      return leftPriority - rightPriority || left.id.localeCompare(right.id);
    });
  const limit = Math.max(0, maxGraphNeighbors);

  return {
    generatedAt: graph.generatedAt,
    focusNodeIds: focusIds,
    neighbors: neighbors.slice(0, limit),
    truncated: neighbors.length > limit,
  };
}

export function buildTrainingAiContext(input: BuildTrainingAiContextInput): TrainingAiContext {
  const selectedItem = input.items.find((item) => item.id === input.selectedItemId) ?? null;
  const selection = input.selection ?? selectionFromItem(selectedItem);
  const maxGraphNeighbors = input.maxGraphNeighbors ?? 8;

  return {
    kind: "training-ai-context",
    contextId: contextIdFor(input.batch, selection),
    ai: AI_RESERVED,
    batch: summarizeBatch(input.batch),
    selection,
    selectedTrainingItem: selectedItem ? summarizeItem(selectedItem) : null,
    items: input.items.map(summarizeItem),
    graph: summarizeGraph(input.graph, selection, selectedItem, maxGraphNeighbors),
    reviewState: buildReviewState(input.items),
  };
}

function isUnsafeRelativePath(path: string): boolean {
  const trimmed = path.trim();
  return !trimmed || /^[A-Za-z]:/.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("\\") || trimmed.split(/[\\/]+/).includes("..");
}

function isNotesPath(path: string): boolean {
  return /^notes[\\/]/i.test(path.trim());
}

export function validateKnowledgePatchTarget(target: PatchTarget): PatchTargetValidation {
  if (target.kind === "notex-note") {
    return { ok: false, reason: "notes-targets-disabled-in-p4a" };
  }

  if (target.kind === "knowledge-asset") {
    if (isUnsafeRelativePath(target.path)) return { ok: false, reason: "unsafe-relative-path" };
    if (isNotesPath(target.path)) return { ok: false, reason: "notes-targets-disabled-in-p4a" };
    return { ok: true, reason: null };
  }

  if (target.kind === "knowledge-relationship") {
    if (!target.fromId.trim() || !target.toId.trim()) return { ok: false, reason: "missing-relationship-endpoint" };
    if (!target.relationshipType.trim()) return { ok: false, reason: "missing-relationship-type" };
    return { ok: true, reason: null };
  }

  if (target.kind === "review-state") {
    if (!target.assetId.trim()) return { ok: false, reason: "missing-asset-id" };
    return { ok: true, reason: null };
  }

  if (!target.draftId.trim()) return { ok: false, reason: "missing-draft-id" };
  return { ok: true, reason: null };
}

function normalizePatchIntent(intent: PatchIntent): PatchIntent {
  if (intent.kind === "append-markdown-section") {
    return {
      ...intent,
      heading: normalizeKnowledgeText(intent.heading, "Suggested section"),
      markdown: intent.markdown.trim(),
    };
  }
  if (intent.kind === "create-fragment-from-draft") {
    return {
      ...intent,
      title: normalizeKnowledgeText(intent.title, "Untitled fragment"),
      markdown: intent.markdown.trim(),
      topics: normalizeKnowledgeList(intent.topics),
      relatedProblems: normalizeKnowledgeList(intent.relatedProblems),
    };
  }
  return { ...intent };
}

export function normalizePatchPreview(input: PatchPreviewInput): PatchPreview {
  const validation = validateKnowledgePatchTarget(input.target);
  return {
    ...input,
    id: normalizeKnowledgeText(input.id, "patch-preview"),
    title: normalizeKnowledgeText(input.title, "Patch preview"),
    summary: input.summary?.trim(),
    intent: normalizePatchIntent(input.intent),
    source: { ...input.source },
    valid: validation.ok,
    validationReason: validation.reason,
    executable: false,
  };
}

export function normalizeMockKnowledgeProposal(input: MockKnowledgeProposalInput): MockKnowledgeProposal {
  return {
    id: normalizeKnowledgeText(input.id, "mock-proposal"),
    title: normalizeKnowledgeText(input.title, "Mock proposal"),
    contextId: normalizeKnowledgeText(input.contextId, "unknown-context"),
    summary: normalizeKnowledgeText(input.summary ?? "", "Reserved proposal; no model has generated this."),
    status: "mock-disabled",
    aiGenerated: false,
    previews: input.previews.map(normalizePatchPreview),
  };
}
