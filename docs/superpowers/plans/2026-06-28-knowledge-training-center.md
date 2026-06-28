# Knowledge Training Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1 Training Center and Knowledge Base foundation: two Activity Bar workspaces, training batch drafts, collection/fragment writing, Rust `.oinb` graph indexing, and basic knowledge views without AI integration.

**Architecture:** Create a new workspace layer for Training and Knowledge Base while keeping `App.tsx` as shell/orchestration. Reuse existing Luogu scan/workflow helpers as source adapters, introduce a new training draft/content model before Markdown writing, and let Rust rebuild/read the `.oinb` graph cache from Markdown. Keep all frontend-to-Rust calls behind `src/lib/api.ts`.

**Tech Stack:** Tauri 2, React, TypeScript, Rust, Vitest, Cargo tests, existing Markdown/frontmatter helpers, existing `src/lib/taskStatus.ts`, existing Luogu scan helpers.

---

## File Structure

Planned files and responsibilities:

- Create `src/lib/knowledge/knowledgeTypes.ts`: shared TypeScript types for assets, graph nodes/edges, batches, and filters.
- Create `src/lib/knowledge/knowledgeFrontmatter.ts`: parse/serialize new knowledge frontmatter fields while preserving legacy compatibility.
- Create `src/lib/knowledge/trainingDrafts.ts`: training batch/item draft creation, deterministic field defaults, output selection updates.
- Create `src/lib/knowledge/knowledgeTemplates.ts`: collection/fragment/article Markdown generation.
- Create `src/lib/knowledge/knowledgeTypes.test.ts`, `knowledgeFrontmatter.test.ts`, `trainingDrafts.test.ts`, `knowledgeTemplates.test.ts`.
- Create `src/components/training/TrainingCenterWorkspace.tsx`: three-column Training Center page.
- Create `src/components/training/TrainingSourcePanel.tsx`: source capsules, source forms, recent batches.
- Create `src/components/training/TrainingWorkbench.tsx`: batch status, item list, item editor, write controls.
- Create `src/components/training/TrainingInspector.tsx`: raw info, frontmatter preview, graph preview, AI placeholder slots.
- Create `src/components/knowledge/KnowledgeBaseWorkspace.tsx`: Knowledge Base shell with secondary navigation.
- Create `src/components/knowledge/KnowledgeOverview.tsx`, `KnowledgeGraphView.tsx`, `KnowledgeAssetList.tsx`, `KnowledgeReviewView.tsx`.
- Modify `src/lib/appShell.ts` and `src/lib/appShell.test.ts`: add `training` and `knowledge` Activity Bar states.
- Modify `src/App.tsx`: wire Activity Bar entries, workspace visibility, API calls, and existing Luogu source adapter into the new workspaces. Keep AI behavior unchanged.
- Modify `src/lib/api.ts` and `src/lib/apiContract.ts`: add knowledge/training wrappers and contract rows.
- Create `src-tauri/src/knowledge.rs`: graph cache models, Markdown scanning, deterministic graph builder, write helpers.
- Modify `src-tauri/src/lib.rs`: register knowledge commands.
- Create Rust tests in `src-tauri/src/knowledge.rs`.

Do not touch:

- `notes/**`
- `src/components/ai/**`
- `src/lib/aiWebSearch.ts`
- `src-tauri/src/ai.rs`
- Existing two-layer path safety checks in `src-tauri/src/notes.rs`

---

### Task 1: Activity Bar And Workspace State

**Files:**
- Modify: `src/lib/appShell.ts`
- Modify: `src/lib/appShell.test.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Extend activity item type and labels**

In `src/lib/appShell.ts`, extend the union:

```ts
export type ActivityBarItem = "notes" | "search" | "training" | "knowledge" | "luogu" | "ai" | "blog" | "settings";
```

Add helper labels:

```ts
export function getTrainingActivityToggleLabel(isOpen: boolean): string {
  return isOpen ? "关闭训练沉淀中心" : "打开训练沉淀中心";
}

export function getKnowledgeActivityToggleLabel(isOpen: boolean): string {
  return isOpen ? "关闭知识库" : "打开知识库";
}
```

- [ ] **Step 2: Add tests**

In `src/lib/appShell.test.ts`, add expectations:

```ts
expect(getTrainingActivityToggleLabel(true)).toBe("关闭训练沉淀中心");
expect(getTrainingActivityToggleLabel(false)).toBe("打开训练沉淀中心");
expect(getKnowledgeActivityToggleLabel(true)).toBe("关闭知识库");
expect(getKnowledgeActivityToggleLabel(false)).toBe("打开知识库");
```

Update active-item tests so `training` and `knowledge` can be selected independently from `luogu`.

- [ ] **Step 3: Run focused test**

Run:

```powershell
pnpm.cmd vitest run src/lib/appShell.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Wire shell buttons**

In `src/App.tsx`, add local state:

```ts
const [activeMainWorkspace, setActiveMainWorkspace] = useState<"editor" | "training" | "knowledge">("editor");
```

Add handlers:

```ts
const handleActivityTraining = () => {
  setActiveMainWorkspace((current) => current === "training" ? "editor" : "training");
};

const handleActivityKnowledge = () => {
  setActiveMainWorkspace((current) => current === "knowledge" ? "editor" : "knowledge");
};
```

Add Activity Bar buttons for Training and Knowledge with lucide icons such as `Dumbbell` and `Network`.

- [ ] **Step 5: Commit**

```powershell
git add -- src/lib/appShell.ts src/lib/appShell.test.ts src/App.tsx
git commit -m "feat(shell): add training and knowledge workspaces"
```

---

### Task 2: Knowledge And Training Domain Types

**Files:**
- Create: `src/lib/knowledge/knowledgeTypes.ts`
- Create: `src/lib/knowledge/knowledgeTypes.test.ts`

- [ ] **Step 1: Define core types**

Create `src/lib/knowledge/knowledgeTypes.ts`:

```ts
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

export interface KnowledgeGraphNode {
  id: string;
  type: "asset" | "problem" | "topic" | "training" | "kind";
  title: string;
  refs: string[];
}

export interface KnowledgeGraphEdge {
  from: string;
  to: string;
  type: "links_to" | "mentions" | "contains" | "related_to" | "derived_from";
  source: "frontmatter" | "wikilink" | "problem_id_match" | "term_match" | "import_rule" | "manual" | "ai_extract_future" | "embedding_future";
  confidence: number;
  refs: string[];
}
```

- [ ] **Step 2: Add type-shape tests**

Create `src/lib/knowledge/knowledgeTypes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { TrainingItemDraft } from "./knowledgeTypes";

describe("knowledgeTypes", () => {
  it("allows a fragment-producing training item draft", () => {
    const draft: TrainingItemDraft = {
      id: "item:P3803",
      batchId: "batch:2026-06-28",
      problemId: "P3803",
      problemTitle: "多项式乘法",
      status: "pending",
      output: { fragment: true, article: false },
      fields: {
        title: "P3803 FFT 复习点",
        oneLineProblem: "给两个多项式，求乘积系数。",
        coreIdea: "FFT 蝴蝶合并。",
        pitfalls: "注意单位根更新。",
        reviewHint: "考前看迭代 FFT 模板。",
        topics: ["FFT"],
        relatedProblems: ["P3803"],
        reviewPriority: "medium",
      },
    };

    expect(draft.output.fragment).toBe(true);
    expect(draft.fields.relatedProblems).toEqual(["P3803"]);
  });
});
```

- [ ] **Step 3: Run focused test**

```powershell
pnpm.cmd vitest run src/lib/knowledge/knowledgeTypes.test.ts
```

Expected: pass.

- [ ] **Step 4: Commit**

```powershell
git add -- src/lib/knowledge/knowledgeTypes.ts src/lib/knowledge/knowledgeTypes.test.ts
git commit -m "feat(knowledge): define training and graph domain types"
```

---

### Task 3: Frontmatter Compatibility Helpers

**Files:**
- Create: `src/lib/knowledge/knowledgeFrontmatter.ts`
- Create: `src/lib/knowledge/knowledgeFrontmatter.test.ts`

- [ ] **Step 1: Implement normalization**

Create `knowledgeFrontmatter.ts` with helpers that accept partial/legacy values and normalize to knowledge metadata:

```ts
import type { KnowledgeAssetFrontmatter, KnowledgeAssetType, ReviewPriority } from "./knowledgeTypes";

const ASSET_TYPES = new Set(["fragment", "collection", "article"]);
const PRIORITIES = new Set(["low", "medium", "high"]);

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function assetType(value: unknown): KnowledgeAssetType {
  return typeof value === "string" && ASSET_TYPES.has(value) ? value as KnowledgeAssetType : "legacy-note";
}

function priority(value: unknown): ReviewPriority {
  return typeof value === "string" && PRIORITIES.has(value) ? value as ReviewPriority : "medium";
}

export function normalizeKnowledgeFrontmatter(input: Record<string, unknown>): KnowledgeAssetFrontmatter {
  return {
    type: assetType(input.type),
    kind: typeof input.kind === "string" && input.kind.trim() ? input.kind.trim() : "legacy-note",
    title: typeof input.title === "string" ? input.title.trim() : "",
    date: typeof input.date === "string" ? input.date.trim() : "",
    topics: stringList(input.topics),
    relatedProblems: stringList(input.related_problems),
    source: input.source === "luogu" || input.source === "manual" || input.source === "import" ? input.source : "unknown",
    createdFrom:
      input.created_from === "training-center" || input.created_from === "manual" || input.created_from === "luogu-import-legacy"
        ? input.created_from
        : "unknown",
    reviewPriority: priority(input.review_priority),
    status: input.status === "draft" || input.status === "archived" ? input.status : "active",
  };
}
```

- [ ] **Step 2: Add tests**

Create tests for legacy fallback and new fragment:

```ts
import { describe, expect, it } from "vitest";
import { normalizeKnowledgeFrontmatter } from "./knowledgeFrontmatter";

describe("normalizeKnowledgeFrontmatter", () => {
  it("treats notes without type as legacy notes", () => {
    expect(normalizeKnowledgeFrontmatter({ title: "Old note" })).toMatchObject({
      type: "legacy-note",
      kind: "legacy-note",
      title: "Old note",
      status: "active",
    });
  });

  it("normalizes fragment metadata", () => {
    expect(normalizeKnowledgeFrontmatter({
      type: "fragment",
      kind: "problem-note",
      topics: [" FFT ", ""],
      related_problems: ["P3803"],
      source: "luogu",
      created_from: "training-center",
      review_priority: "high",
    })).toMatchObject({
      type: "fragment",
      kind: "problem-note",
      topics: ["FFT"],
      relatedProblems: ["P3803"],
      source: "luogu",
      createdFrom: "training-center",
      reviewPriority: "high",
    });
  });
});
```

- [ ] **Step 3: Run focused test**

```powershell
pnpm.cmd vitest run src/lib/knowledge/knowledgeFrontmatter.test.ts
```

- [ ] **Step 4: Commit**

```powershell
git add -- src/lib/knowledge/knowledgeFrontmatter.ts src/lib/knowledge/knowledgeFrontmatter.test.ts
git commit -m "feat(knowledge): normalize knowledge frontmatter"
```

---

### Task 4: Training Draft And Template Generation

**Files:**
- Create: `src/lib/knowledge/trainingDrafts.ts`
- Create: `src/lib/knowledge/trainingDrafts.test.ts`
- Create: `src/lib/knowledge/knowledgeTemplates.ts`
- Create: `src/lib/knowledge/knowledgeTemplates.test.ts`

- [ ] **Step 1: Create deterministic draft helpers**

`trainingDrafts.ts` should export:

```ts
import type { TrainingBatchDraft, TrainingItemDraft, TrainingSourceType } from "./knowledgeTypes";

export function createTrainingBatchDraft(input: {
  id: string;
  title: string;
  sourceType: TrainingSourceType;
  sourceLabel: string;
  createdAt: string;
  itemIds: string[];
}): TrainingBatchDraft {
  return { ...input, status: "draft" };
}

export function createProblemTrainingItemDraft(input: {
  id: string;
  batchId: string;
  problemId: string;
  problemTitle: string;
  submissionId?: string;
  submitTime?: string;
  difficulty?: string;
}): TrainingItemDraft {
  return {
    ...input,
    status: "pending",
    output: { fragment: true, article: false },
    fields: {
      title: `${input.problemId} ${input.problemTitle}`.trim(),
      oneLineProblem: "",
      coreIdea: "",
      pitfalls: "",
      reviewHint: "",
      topics: [],
      relatedProblems: input.problemId ? [input.problemId] : [],
      reviewPriority: "medium",
    },
  };
}
```

- [ ] **Step 2: Create Markdown templates**

`knowledgeTemplates.ts` should export `buildFragmentMarkdown` and `buildCollectionMarkdown` that produce Markdown with frontmatter:

```ts
import type { TrainingBatchDraft, TrainingItemDraft } from "./knowledgeTypes";

function yamlList(values: string[]): string {
  return values.length === 0 ? "[]" : `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}

export function buildFragmentMarkdown(item: TrainingItemDraft): string {
  return `---
type: fragment
kind: problem-note
title: ${JSON.stringify(item.fields.title)}
topics: ${yamlList(item.fields.topics)}
related_problems: ${yamlList(item.fields.relatedProblems)}
source: luogu
created_from: training-center
review_priority: ${item.fields.reviewPriority}
status: active
problem_id: ${JSON.stringify(item.problemId)}
collection_id: ${JSON.stringify(item.batchId)}
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
  const problems = items.map((item) => item.problemId).filter(Boolean);
  const fragmentRefs = items.map((item) => `[[${item.fields.title}]]`);
  return `---
type: collection
kind: daily-log
title: ${JSON.stringify(batch.title)}
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
```

- [ ] **Step 3: Add tests**

Tests must verify:

- a problem item defaults to fragment output,
- related problem defaults to the problem id,
- fragment Markdown contains `type: fragment`,
- collection Markdown contains `type: collection` and problem ids.

- [ ] **Step 4: Run tests**

```powershell
pnpm.cmd vitest run src/lib/knowledge/trainingDrafts.test.ts src/lib/knowledge/knowledgeTemplates.test.ts
```

- [ ] **Step 5: Commit**

```powershell
git add -- src/lib/knowledge/trainingDrafts.ts src/lib/knowledge/trainingDrafts.test.ts src/lib/knowledge/knowledgeTemplates.ts src/lib/knowledge/knowledgeTemplates.test.ts
git commit -m "feat(training): generate knowledge drafts and templates"
```

---

### Task 5: Rust Knowledge Graph Skeleton

**Files:**
- Create: `src-tauri/src/knowledge.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/api.ts`
- Modify: `src/lib/apiContract.ts`
- Test: `src/lib/apiBoundary.test.ts`

- [ ] **Step 1: Add Rust graph models and scanner**

Create `knowledge.rs` with:

```rust
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct KnowledgeGraphNode {
    pub id: String,
    pub r#type: String,
    pub title: String,
    pub refs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct KnowledgeGraphEdge {
    pub from: String,
    pub to: String,
    pub r#type: String,
    pub source: String,
    pub confidence: f64,
    pub refs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct KnowledgeGraphIndex {
    pub nodes: Vec<KnowledgeGraphNode>,
    pub edges: Vec<KnowledgeGraphEdge>,
}

pub fn extract_problem_ids(markdown: &str) -> Vec<String> {
    let mut ids = Vec::new();
    for token in markdown.split(|c: char| !c.is_ascii_alphanumeric()) {
        if token.len() >= 2 && token.starts_with('P') && token[1..].chars().all(|c| c.is_ascii_digit()) {
            let id = token.to_string();
            if !ids.contains(&id) {
                ids.push(id);
            }
        }
    }
    ids
}

pub fn build_graph_for_markdown(relative_path: &str, markdown: &str) -> KnowledgeGraphIndex {
    let asset_id = format!("asset:{relative_path}");
    let mut index = KnowledgeGraphIndex {
        nodes: vec![KnowledgeGraphNode {
            id: asset_id.clone(),
            r#type: "asset".to_string(),
            title: relative_path.to_string(),
            refs: vec![relative_path.to_string()],
        }],
        edges: Vec::new(),
    };

    for problem_id in extract_problem_ids(markdown) {
        let problem_node_id = format!("problem:{problem_id}");
        index.nodes.push(KnowledgeGraphNode {
            id: problem_node_id.clone(),
            r#type: "problem".to_string(),
            title: problem_id,
            refs: vec![relative_path.to_string()],
        });
        index.edges.push(KnowledgeGraphEdge {
            from: asset_id.clone(),
            to: problem_node_id,
            r#type: "mentions".to_string(),
            source: "problem_id_match".to_string(),
            confidence: 1.0,
            refs: vec![relative_path.to_string()],
        });
    }

    index
}
```

Add tests in the same file for `extract_problem_ids` and `build_graph_for_markdown`.

- [ ] **Step 2: Add Tauri commands**

Add command functions for a minimal first pass:

```rust
#[tauri::command]
pub fn rebuild_knowledge_graph() -> Result<KnowledgeGraphIndex, String> {
    Ok(KnowledgeGraphIndex::default())
}

#[tauri::command]
pub fn get_knowledge_graph() -> Result<KnowledgeGraphIndex, String> {
    Ok(KnowledgeGraphIndex::default())
}
```

Later tasks replace these with real notes-root scanning and `.oinb` writes.

- [ ] **Step 3: Register commands**

In `src-tauri/src/lib.rs`, add `mod knowledge;` and register:

```rust
knowledge::rebuild_knowledge_graph,
knowledge::get_knowledge_graph,
```

- [ ] **Step 4: Add frontend API wrappers**

In `src/lib/api.ts`, add matching types and wrappers:

```ts
export interface KnowledgeGraphIndexResult {
  nodes: Array<{ id: string; type: string; title: string; refs: string[] }>;
  edges: Array<{ from: string; to: string; type: string; source: string; confidence: number; refs: string[] }>;
}

export async function rebuildKnowledgeGraph(): Promise<KnowledgeGraphIndexResult> {
  try {
    return await invoke<KnowledgeGraphIndexResult>("rebuild_knowledge_graph");
  } catch (e) {
    throw toApiError(e);
  }
}

export async function getKnowledgeGraph(): Promise<KnowledgeGraphIndexResult> {
  try {
    return await invoke<KnowledgeGraphIndexResult>("get_knowledge_graph");
  } catch (e) {
    throw toApiError(e);
  }
}
```

Update `src/lib/apiContract.ts` rows for both wrappers.

- [ ] **Step 5: Run tests**

```powershell
pnpm.cmd vitest run src/lib/apiBoundary.test.ts
cargo test --manifest-path .\src-tauri\Cargo.toml knowledge
```

- [ ] **Step 6: Commit**

```powershell
git add -- src-tauri/src/knowledge.rs src-tauri/src/lib.rs src/lib/api.ts src/lib/apiContract.ts
git commit -m "feat(knowledge): add graph api skeleton"
```

---

### Task 6: Training Center UI Skeleton

**Files:**
- Create: `src/components/training/TrainingCenterWorkspace.tsx`
- Create: `src/components/training/TrainingSourcePanel.tsx`
- Create: `src/components/training/TrainingWorkbench.tsx`
- Create: `src/components/training/TrainingInspector.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Build source panel**

Create source mode buttons for Today, Range, Single Problem, Problem Set, Contest. Problem Set and Contest are disabled and labelled as reserved future modes. The scan button lives in the left source card.

- [ ] **Step 2: Build workbench skeleton**

Show batch title, counts, empty state, item card list, and an item editor with fields from `TrainingItemDraftFields`.

- [ ] **Step 3: Build inspector skeleton**

Show current item raw info, frontmatter preview, graph preview, and a clearly disabled future AI section. Do not call AI.

- [ ] **Step 4: Mount workspace**

In `src/App.tsx`, render `TrainingCenterWorkspace` when `activeMainWorkspace === "training"`. Ensure returning to editor preserves the current open note.

- [ ] **Step 5: Run build**

```powershell
pnpm.cmd tsc --noEmit
pnpm.cmd build
```

- [ ] **Step 6: Commit**

```powershell
git add -- src/components/training src/App.tsx
git commit -m "feat(training): add training center workspace shell"
```

---

### Task 7: Knowledge Base UI Skeleton

**Files:**
- Create: `src/components/knowledge/KnowledgeBaseWorkspace.tsx`
- Create: `src/components/knowledge/KnowledgeOverview.tsx`
- Create: `src/components/knowledge/KnowledgeGraphView.tsx`
- Create: `src/components/knowledge/KnowledgeAssetList.tsx`
- Create: `src/components/knowledge/KnowledgeReviewView.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Build shell and navigation**

Add secondary nav: Overview, Graph, Fragments, Collections, Articles, Review, Mistakes, Relationship Suggestions.

- [ ] **Step 2: Build overview**

Consume `getKnowledgeGraph()` and show node/edge counts. If the API returns empty data, show a professional empty state and a rebuild button wired to `rebuildKnowledgeGraph()`.

- [ ] **Step 3: Build basic graph view**

Use a simple SVG or div-based first graph view with stable dimensions. Do not add a third-party graph library in Phase 1 unless the repo already has one.

- [ ] **Step 4: Build list/review placeholders from real graph data**

Fragments/Collections/Articles can start by filtering graph asset nodes when full asset listing is not ready. Review shows recent/rebuild prompt until asset metadata is available.

- [ ] **Step 5: Run build**

```powershell
pnpm.cmd tsc --noEmit
pnpm.cmd build
```

- [ ] **Step 6: Commit**

```powershell
git add -- src/components/knowledge src/App.tsx
git commit -m "feat(knowledge): add knowledge base workspace shell"
```

---

### Task 8: Write Collection And Fragment Assets

**Files:**
- Modify: `src/lib/api.ts`
- Modify: `src/lib/apiContract.ts`
- Modify: `src-tauri/src/knowledge.rs`
- Modify: `src/components/training/TrainingCenterWorkspace.tsx`
- Modify: `src/lib/knowledge/knowledgeTemplates.ts`

- [ ] **Step 1: Add Rust write command**

Add a command that accepts relative path and markdown for knowledge assets, then writes through the same notes-root safety pattern used by note writes. Do not bypass existing containment validation.

Command shape:

```rust
#[derive(Debug, Clone, Deserialize)]
pub struct WriteKnowledgeAssetRequest {
    pub relative_path: String,
    pub markdown: String,
    pub overwrite: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct WriteKnowledgeAssetResult {
    pub relative_path: String,
    pub written: bool,
    pub skipped: bool,
    pub error: Option<String>,
}
```

- [ ] **Step 2: Add API wrapper and contract row**

Add `writeKnowledgeAsset(request)` in `src/lib/api.ts` and matching `apiContract.ts`.

- [ ] **Step 3: Wire Training Center write flow**

When user clicks write:

- generate one collection markdown with `buildCollectionMarkdown`,
- generate one fragment markdown per selected item with `buildFragmentMarkdown`,
- write each to `knowledge/collections/` or `knowledge/fragments/`,
- call `rebuildKnowledgeGraph`,
- show counts for written/skipped/failed.

- [ ] **Step 4: Run tests and build**

```powershell
pnpm.cmd vitest run src/lib/knowledge/knowledgeTemplates.test.ts src/lib/apiBoundary.test.ts
pnpm.cmd tsc --noEmit
cargo test --manifest-path .\src-tauri\Cargo.toml knowledge
```

- [ ] **Step 5: Commit**

```powershell
git add -- src/lib/api.ts src/lib/apiContract.ts src-tauri/src/knowledge.rs src/components/training src/lib/knowledge/knowledgeTemplates.ts
git commit -m "feat(training): write knowledge assets from batches"
```

---

### Task 9: Real Graph Rebuild Cache

**Files:**
- Modify: `src-tauri/src/knowledge.rs`

- [ ] **Step 1: Scan Markdown under notes root**

Implement recursive scan that skips `.oinb` and hidden/cache directories, reads `.md` files, and feeds each file to the graph builder.

- [ ] **Step 2: Parse deterministic edges**

Add extraction for:

- `type`, `kind`, `topics`, `related_problems`, `problem_id`, `collection_id`;
- `[[wikilink]]`;
- problem id mentions.

- [ ] **Step 3: Write cache**

Write:

```txt
.oinb/graph/nodes.json
.oinb/graph/edges.json
.oinb/graph/batches.json
```

Treat cache writes as rebuildable machine output. Do not stage `.oinb`.

- [ ] **Step 4: Read cache**

`get_knowledge_graph` reads cache if present, otherwise returns empty index with no error. `rebuild_knowledge_graph` always rescans and writes cache.

- [ ] **Step 5: Rust tests**

Add tests with temp directories for:

- fragment frontmatter creates asset/problem/topic nodes;
- wikilink creates `links_to`;
- repeated problem ids deduplicate;
- `.oinb` directory is skipped.

- [ ] **Step 6: Run tests**

```powershell
cargo test --manifest-path .\src-tauri\Cargo.toml knowledge
pnpm.cmd vitest run src/lib/apiBoundary.test.ts
```

- [ ] **Step 7: Commit**

```powershell
git add -- src-tauri/src/knowledge.rs
git commit -m "feat(knowledge): rebuild graph cache from markdown"
```

---

### Task 10: Verification And Closeout

**Files:**
- Modify docs only if implementation differs from spec.

- [ ] **Step 1: Run frontend checks**

```powershell
pnpm.cmd vitest run src/lib/knowledge/knowledgeTypes.test.ts src/lib/knowledge/knowledgeFrontmatter.test.ts src/lib/knowledge/trainingDrafts.test.ts src/lib/knowledge/knowledgeTemplates.test.ts src/lib/appShell.test.ts src/lib/apiBoundary.test.ts
pnpm.cmd tsc --noEmit
pnpm.cmd build
```

- [ ] **Step 2: Run Rust checks**

```powershell
cargo check --manifest-path .\src-tauri\Cargo.toml
cargo test --manifest-path .\src-tauri\Cargo.toml knowledge
```

- [ ] **Step 3: Run API boundary audit**

```powershell
rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'
```

Expected: no direct Rust command calls outside allowed files.

- [ ] **Step 4: Manual smoke**

Run the app, verify:

- Activity Bar shows Training and Knowledge.
- Training workspace opens and returns to the editor without losing current note.
- Knowledge workspace opens.
- Rebuild graph button completes.
- No AI request occurs.

- [ ] **Step 5: Final status**

```powershell
git status --short -- . ':(exclude)notes/**'
git diff --cached --name-only
```

Report unrelated pre-existing changes separately from implementation changes.

---

## Self-Review Notes

Spec coverage:

- Two Activity Bar workspaces: Tasks 1, 6, 7.
- Training three-column UI: Task 6.
- Draft model and templates: Tasks 2, 4.
- collection + fragments write path: Task 8.
- Rust graph index and `.oinb` cache: Tasks 5, 9.
- Knowledge overview/list/graph basics: Task 7.
- No AI integration: Tasks 6, 10 non-goals and smoke.
- API boundary: Tasks 5, 8, 10.

Known sequencing:

- Task 5 starts with a graph API skeleton before Task 9 fills real cache behavior.
- Task 7 can consume empty graph data before Task 9 lands.
- Task 8 should land before manual smoke of write-to-graph loop.
