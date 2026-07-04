import {
  createProblemTrainingItemDraft,
  createTrainingBatchDraft,
} from "./trainingDrafts";
import {
  normalizeKnowledgePathSegment,
  normalizeKnowledgeText,
  type KnowledgeAssetRow,
  type KnowledgeBatchHistoryEntry,
  type KnowledgeBatchHistoryRow,
  type LegacyMigrationDraft,
  type LegacyMigrationTarget,
  type TrainingBatchDuplicateDraft,
  type TrainingItemDraft,
  type TrainingSourceType,
} from "./knowledgeTypes";

function replayBatchId(createdAt: string): string {
  return `batch:${createdAt.trim().replace(/[:./]/g, "-")}-replay`;
}

function assetProblemTitle(pathTitle: string | null | undefined, problemId: string): string {
  const title = normalizeKnowledgeText(pathTitle ?? "", problemId);
  if (!problemId) return title;
  const withoutPrefix = title.startsWith(problemId) ? title.slice(problemId.length).trim() : title;
  return withoutPrefix || title;
}

function inferProblemId(path: string, explicit?: string | null): string {
  const trimmed = explicit?.trim();
  if (trimmed) return trimmed;
  const fileName = path.split(/[\\/]/).pop()?.replace(/\.md$/i, "") ?? "";
  return fileName || "legacy";
}

export function mapBatchHistoryRows(entries: KnowledgeBatchHistoryEntry[]): KnowledgeBatchHistoryRow[] {
  return entries.map((entry) => ({
    batchId: entry.batchId,
    title: entry.sourceLabel || entry.batchId,
    sourceLabel: entry.sourceLabel,
    sourceType: entry.sourceType,
    createdAt: entry.createdAt,
    collectionPath: entry.collectionPath,
    writtenCount: entry.writtenAssets.length,
    skippedCount: entry.skippedItems.length,
    failedCount: entry.failedItems.length,
    graphSummary: `${entry.graphRefresh.nodeCount} nodes / ${entry.graphRefresh.edgeCount} edges`,
  }));
}

export function duplicateBatchHistoryAsDraft(
  entry: KnowledgeBatchHistoryEntry,
  createdAt: string,
): TrainingBatchDuplicateDraft {
  const batch = createTrainingBatchDraft({
    id: replayBatchId(createdAt),
    title: `${entry.sourceLabel || entry.batchId} replay`,
    sourceType: entry.sourceType as TrainingSourceType,
    sourceLabel: `${entry.sourceLabel || entry.sourceType} replay`,
    createdAt,
    itemIds: [],
  });
  const items: TrainingItemDraft[] = entry.writtenAssets
    .filter((asset) => asset.kind === "fragment")
    .map((asset) => {
      const problemId = inferProblemId(asset.path, asset.problemId);
      return createProblemTrainingItemDraft({
        id: `item:${problemId}`,
        batchId: batch.id,
        problemId,
        problemTitle: assetProblemTitle(asset.title, problemId),
      });
    });

  return {
    sourceBatchId: entry.batchId,
    sourceCollectionPath: entry.collectionPath,
    batch: {
      ...batch,
      itemIds: items.map((item) => item.id),
    },
    items,
  };
}

function yamlList(values: string[]): string {
  const clean = values.map((value) => value.trim()).filter(Boolean);
  return clean.length ? `[${clean.map((value) => JSON.stringify(value)).join(", ")}]` : "[]";
}

function firstHeading(markdown: string): string {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("# "))
    ?.slice(2)
    .trim() ?? "";
}

function extractProblemIds(markdown: string, asset: KnowledgeAssetRow): string[] {
  if (asset.relatedProblems.length > 0) return asset.relatedProblems;
  const matches = Array.from(markdown.matchAll(/\bP\d+\b/g), (match) => match[0]);
  return Array.from(new Set(matches));
}

function legacyTargetPath(asset: KnowledgeAssetRow, markdown: string, targetType: LegacyMigrationTarget): string {
  const problemId = extractProblemIds(markdown, asset)[0];
  const fallback = asset.path.split(/[\\/]/).pop()?.replace(/\.md$/i, "") ?? "legacy-note";
  const slug = normalizeKnowledgePathSegment(problemId || fallback, "legacy-note");
  return targetType === "fragment"
    ? `knowledge/fragments/legacy/${slug}.md`
    : `knowledge/collections/legacy/${slug}.md`;
}

export function buildLegacyMigrationDraft(input: {
  asset: KnowledgeAssetRow;
  markdown: string;
  targetType: LegacyMigrationTarget;
}): LegacyMigrationDraft {
  const sourceTitle = normalizeKnowledgeText(input.asset.title, firstHeading(input.markdown) || input.asset.path);
  const relatedProblems = extractProblemIds(input.markdown, input.asset);
  const originalLink = `[[${input.asset.path}]]`;
  const targetPath = legacyTargetPath(input.asset, input.markdown, input.targetType);
  const commonFrontmatter = [
    `title: ${JSON.stringify(sourceTitle)}`,
    `topics: ${yamlList(input.asset.topics)}`,
    `related_problems: ${yamlList(relatedProblems)}`,
    "source: luogu",
    "created_from: luogu-import-legacy",
    "review_priority: medium",
    "status: draft",
    `original_note: ${JSON.stringify(input.asset.path)}`,
  ];
  const markdown = input.targetType === "fragment"
    ? `---\ntype: fragment\nkind: problem-note\n${commonFrontmatter.join("\n")}\n---\n\n## 摘要草稿\n\n从旧洛谷题解生成的摘要 fragment 草稿。复杂旧文第一版只做摘要，不自动结构化全文。\n\n## 原文链接\n\n- ${originalLink}\n`
    : `---\ntype: collection\nkind: topic-review\n${commonFrontmatter.join("\n")}\nfragments: []\narticles: [${JSON.stringify(originalLink)}]\n---\n\n## 旧文升级集合草稿\n\n该集合保留原洛谷题解入口，不拆毁原题解。\n\n## 原文链接\n\n- ${originalLink}\n`;

  return {
    sourcePath: input.asset.path,
    sourceTitle,
    targetType: input.targetType,
    targetPath,
    markdown,
    originalLink,
    requiresConfirmation: true,
    writesOriginal: false,
    complexity: "summary-only",
  };
}
