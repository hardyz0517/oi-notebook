import {
  normalizeKnowledgeList,
  normalizeKnowledgeText,
  type TrainingBatchDraft,
  type TrainingItemDraft,
} from "./knowledgeTypes";

function yamlList(values: string[]): string {
  const normalized = normalizeKnowledgeList(values);
  if (normalized.length === 0) return "[]";
  return `[\n${normalized.map((value) => `  ${JSON.stringify(value)}`).join(",\n")}\n]`;
}

function yamlScalar(value: string): string {
  return JSON.stringify(normalizeKnowledgeText(value));
}

function dateOnly(value: string): string {
  return value.length >= 10 ? value.slice(0, 10) : new Date().toISOString().slice(0, 10);
}

function renderFragmentFrontmatter(item: TrainingItemDraft, collectionRelativePath: string): string {
  const lines = [
    "---",
    "type: fragment",
    "kind: problem-note",
    `title: ${yamlScalar(item.fields.title)}`,
    `date: ${JSON.stringify(dateOnly(item.submitTime ?? ""))}`,
    `topics: ${yamlList(item.fields.topics)}`,
    `related_problems: ${yamlList(item.fields.relatedProblems)}`,
    "source: luogu",
    "created_from: training-center",
    `review_priority: ${item.fields.reviewPriority}`,
    "mastery: new",
    "status: active",
    `problem_id: ${yamlScalar(item.problemId)}`,
    `collection_id: ${yamlScalar(collectionRelativePath)}`,
    item.submissionId ? `submission_id: ${yamlScalar(item.submissionId)}` : null,
    item.submitTime ? `submit_time: ${yamlScalar(item.submitTime)}` : null,
    item.difficulty ? `difficulty: ${yamlScalar(item.difficulty)}` : null,
    "---",
  ].filter((line): line is string => line !== null);

  return `${lines.join("\n")}\n`;
}

export function buildFragmentMarkdown(item: TrainingItemDraft, collectionRelativePath = item.batchId): string {
  const frontmatter = renderFragmentFrontmatter(item, collectionRelativePath);

  return `${frontmatter}
## 一句话题意

${item.fields.oneLineProblem.trim()}

## 核心考点

${item.fields.coreIdea.trim()}

## 坑点 / 错因

${item.fields.pitfalls.trim()}

## 复习提示

${item.fields.reviewHint.trim()}
`;
}

function renderCollectionFrontmatter(
  batch: TrainingBatchDraft,
  items: TrainingItemDraft[],
  fragmentPaths: string[],
): string {
  const problems = items.map((item) => item.problemId).filter(Boolean);
  const lines = [
    "---",
    "type: collection",
    "kind: daily-log",
    `title: ${yamlScalar(batch.title)}`,
    `date: ${JSON.stringify(dateOnly(batch.createdAt))}`,
    "topics: []",
    `related_problems: ${yamlList(problems)}`,
    "source: luogu",
    "created_from: training-center",
    "review_priority: medium",
    "mastery: new",
    "status: active",
    `batch_id: ${yamlScalar(batch.id)}`,
    `source_type: ${yamlScalar(batch.sourceType)}`,
    `source_label: ${yamlScalar(batch.sourceLabel)}`,
    `problems: ${yamlList(problems)}`,
    `fragments: ${yamlList(fragmentPaths)}`,
    "articles: []",
    "---",
  ];

  return `${lines.join("\n")}\n`;
}

export function buildCollectionMarkdown(
  batch: TrainingBatchDraft,
  items: TrainingItemDraft[],
  fragmentPaths = items.map((item) => `[[${item.fields.title}]]`),
): string {
  const frontmatter = renderCollectionFrontmatter(batch, items, fragmentPaths);
  const fragmentList = fragmentPaths.length === 0
    ? "暂无可写入片段。"
    : fragmentPaths.map((path) => `- ${path}`).join("\n");

  return `${frontmatter}
## 训练概览

来源：${batch.sourceLabel}

## 新增片段

${fragmentList}
`;
}
