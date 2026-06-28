import type { TrainingBatchDraft, TrainingItemDraft } from "./knowledgeTypes";

function yamlList(values: string[]): string {
  return values.length === 0 ? "[]" : `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}

function yamlValue(value: string): string {
  return JSON.stringify(value);
}

function dateOnly(value: string): string {
  return value.length >= 10 ? value.slice(0, 10) : value;
}

export function buildFragmentMarkdown(item: TrainingItemDraft): string {
  const date = dateOnly(item.submitTime ?? "");

  return `---
type: fragment
kind: problem-note
title: ${yamlValue(item.fields.title)}
date: ${yamlValue(date)}
topics: ${yamlList(item.fields.topics)}
related_problems: ${yamlList(item.fields.relatedProblems)}
source: luogu
created_from: training-center
review_priority: ${item.fields.reviewPriority}
status: active
problem_id: ${yamlValue(item.problemId)}
collection_id: ${yamlValue(item.batchId)}
---

## 一句话题意

${item.fields.oneLineProblem}

## 核心考点

${item.fields.coreIdea}

## 坑点 / 错因

${item.fields.pitfalls}

## 复习提示

${item.fields.reviewHint}
`;
}

export function buildCollectionMarkdown(batch: TrainingBatchDraft, items: TrainingItemDraft[]): string {
  const date = dateOnly(batch.createdAt);
  const problems = items.map((item) => item.problemId).filter(Boolean);
  const fragmentRefs = items.map((item) => `[[${item.fields.title}]]`);

  return `---
type: collection
kind: daily-log
title: ${yamlValue(batch.title)}
date: ${yamlValue(date)}
topics: []
related_problems: ${yamlList(problems)}
source: luogu
created_from: training-center
review_priority: medium
status: active
problems: ${yamlList(problems)}
fragments: ${yamlList(fragmentRefs)}
articles: []
---

## 训练概览

来源：${batch.sourceLabel}

## 新增片段

${fragmentRefs.map((ref) => `- ${ref}`).join("\n")}
`;
}
