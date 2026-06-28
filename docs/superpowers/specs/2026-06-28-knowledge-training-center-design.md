# OI Notebook Knowledge Base And Training Center Design

Date: 2026-06-28
Status: draft for user review
Source PRD: `docs/OI_Notebook_Knowledge_Base_Luogu_Import_PRD.md`

## 1. Goal

Upgrade OI Notebook from "Luogu solution import plus Markdown management" into a training sedimentation system, atomic OI knowledge base, graph view, and review assistant foundation.

This phase does not connect new AI behavior. AI-facing UI slots, data contracts, and patch targets are reserved, but Phase 1 must work without model calls.

## 2. Product Boundary

Add two first-class Activity Bar workspaces:

- Training Center: the high-frequency production workflow. It turns Luogu training material into batch drafts, editable knowledge fragments, collections, and optional articles.
- Knowledge Base: the long-term asset workflow. It browses, filters, graphs, reviews, and maintains Markdown knowledge assets.

The two workspaces share one asset model. Training drafts are temporary UI/domain state. Persisted knowledge is always Markdown plus frontmatter, with `.oinb` as rebuildable machine index/cache.

## 3. Keep, Rework, Add

Keep:

- Existing Luogu scan, page preview, candidate filtering, AC/skipped rules, import rules, and progress/task derivation.
- Frontend API boundary through `src/lib/api.ts` and `src/lib/apiContract.ts`.
- Rust notes write path and existing path-safety rules.
- Existing Markdown/frontmatter compatibility for title, tags, collection, category, summary, draft, difficulty, and source.
- Settings host/shell patterns as architecture inspiration, not as the new workspace location.

Rework:

- Replace the current Luogu Import Center dialog with a page-style Training Center workspace.
- Stop treating prepared Markdown solution notes as the center of the new system.
- Remove Phase 1 dependence on AI status, AI-generated content, or AI wording in the training flow.
- Move long UI surfaces out of `App.tsx` into focused workspace components and domain helpers.

Add:

- Training batch and item draft models.
- Knowledge asset schema for `fragment`, `collection`, and `article`.
- Rust knowledge graph/index commands that read Markdown and write `.oinb` cache files.
- Knowledge Base overview, list, and graph views.
- Inspector context and field-level patch targets for future AI integration.

## 4. Training Center

The Training Center is a main workspace, not a modal.

Phase 1 source modes:

- Today: scan today's Luogu submissions.
- Range: scan a date/count range using the current scan foundation.
- Single Problem: create a batch around one problem/submission when available.

Reserved future source modes:

- Problem Set.
- Contest.

Three-column layout:

- Left: source mode capsules, source configuration, scan action, recent batches.
- Middle: batch status, item list, editable item detail, output selection, write actions.
- Right: Inspector, collapsible.

The left column owns source selection and scanning. The middle column owns user decisions and editing. The Inspector owns raw information, frontmatter preview, graph update preview, and future AI slots.

## 5. Training Draft Model

Use a domain model between Luogu scan results and persisted Markdown.

```ts
type TrainingSourceType = "luogu-today" | "luogu-range" | "luogu-single" | "luogu-problemset-future" | "luogu-contest-future";

interface TrainingBatchDraft {
  id: string;
  title: string;
  sourceType: TrainingSourceType;
  sourceLabel: string;
  createdAt: string;
  status: "draft" | "ready" | "writing" | "written" | "partial" | "failed";
  itemIds: string[];
  collectionDraft: KnowledgeCollectionDraft;
}

interface TrainingItemDraft {
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
  fields: {
    title: string;
    oneLineProblem: string;
    coreIdea: string;
    pitfalls: string;
    reviewHint: string;
    topics: string[];
    relatedProblems: string[];
    reviewPriority: "low" | "medium" | "high";
  };
}
```

The model is intentionally editable before writing. Future AI can patch these fields without editing full Markdown directly.

## 6. Write Strategy

Each written batch creates by default:

- One `collection`.
- One `fragment` for each selected item.
- Optional `article` outputs when explicitly selected.

Default paths:

```txt
knowledge/fragments/
knowledge/collections/
knowledge/articles/
```

Legacy Luogu solution notes continue to work in their existing `luogu/` or user-configured directories. Existing files are not bulk-migrated.

## 7. Knowledge Asset Schema

All persisted user-facing content remains Markdown plus YAML frontmatter.

Base fields:

```yaml
type: fragment | collection | article
kind: string
title: string
date: YYYY-MM-DD
topics: string[]
related_problems: string[]
source: luogu | manual | import | unknown
created_from: training-center | manual | luogu-import-legacy
review_priority: low | medium | high
status: draft | active | archived
```

Fragment fields:

```yaml
kind: trick | problem-note | mistake | template-note | concept-note
problem_id: string
collection_id: string
```

Collection fields:

```yaml
kind: daily-log | range-review | problemset-review | contest-review | topic-review
problems: string[]
fragments: string[]
articles: string[]
```

Article fields:

```yaml
kind: solution | algorithm-note | topic-note | study-note
related_fragments: string[]
```

Files without `type` are treated as legacy notes or articles by the Knowledge Base. They are readable and indexable, but not rewritten unless the user chooses to update them.

## 8. Fragment Template

Phase 1 uses a medium-weight fragment template:

```md
## 一句话题意

...

## 核心考点

...

## 坑点 / 错因

...

## 复习提示

...
```

This is atomic enough for review and graphing, but richer than a bare tag record. It should not become a full solution template by default.

## 9. Knowledge Base

The Knowledge Base is a main workspace with secondary navigation:

- Overview.
- Graph.
- Fragments.
- Collections.
- Articles.
- Review.
- Mistakes.
- Relationship Suggestions.

Overview shows asset counts, graph counts, recent fragments, recent collections, high-frequency topics, high-frequency mistake kinds, and recent training batches.

List views support type, topic, source, status, date, review priority, and relation count filters. Clicking an asset opens the Markdown note through existing note-opening behavior.

Graph view supports global graph and local graph. Local graph starts from a selected asset, problem, or topic.

Review view starts simple: recent fragments, 7/30-day filters, topic filters, manual priority, and manual mastery/status fields.

Relationship Suggestions starts rule-based: isolated content, frontmatter omissions, unlinked problem ids, and unlinked topic mentions.

## 10. Graph Index

Rust owns graph/index generation. Frontend calls API wrappers only.

Suggested cache layout:

```txt
.oinb/
  graph/
    nodes.json
    edges.json
    batches.json
    aliases.json
  index/
    markdown-index.json
```

Node examples:

```json
{
  "id": "problem:P3803",
  "type": "problem",
  "title": "P3803 多项式乘法",
  "source": "luogu",
  "refs": ["knowledge/fragments/P3803-fft.md"],
  "createdAt": "2026-06-28T00:00:00.000Z"
}
```

Edge examples:

```json
{
  "from": "fragment:knowledge/fragments/P3803-fft.md",
  "to": "topic:FFT",
  "type": "related_to",
  "source": "frontmatter",
  "confidence": 1,
  "refs": ["knowledge/fragments/P3803-fft.md"]
}
```

Phase 1 edge sources:

- `frontmatter`
- `wikilink`
- `problem_id_match`
- `term_match`
- `import_rule`
- `manual`

Reserved future sources:

- `ai_extract_future`
- `embedding_future`

## 11. Obsidian Lessons, OI Translation

Use Obsidian-like ideas, not Obsidian-like skin.

Adopt:

- Properties/frontmatter as small readable metadata.
- Internal links through `[[...]]`.
- Backlinks and unlinked mentions.
- Global and local graph views.

Translate for OI:

- Problems, topics, tricks, mistakes, templates, collections, articles, and training batches are graph concepts.
- Graph edges come from frontmatter and deterministic OI rules, not only manual links.
- Review and mistake views are first-class learning workflows.

Avoid:

- Obsidian visual mimicry.
- Plugin-oriented architecture.
- Block references as required asset format.
- A graph that only reflects file-to-file links.

## 12. API Direction

All frontend-to-Rust calls go through `src/lib/api.ts`, with `src/lib/apiContract.ts` updated.

Likely command groups:

- Training write commands: write collection/fragments/articles from normalized payloads.
- Knowledge graph commands: rebuild graph, read graph summary, read graph nodes/edges, read batches.
- Knowledge asset commands: list assets by type/source/status/topic, resolve asset to note path.

The Rust side must reuse existing notes root/path safety patterns and must not weaken containment checks.

## 13. AI Reservation

Phase 1 does not call AI.

Reserve:

- Inspector context for selected batch/item/asset.
- Field-level draft model for patchable content.
- Diff/patch target shape for future NoteX updates.
- Graph edge source values for AI extraction.
- Relationship suggestion groups for future AI suggestions.
- Knowledge/Training page context provider for future NoteX workbench integration.

Future AI flow:

```txt
selected training item or knowledge asset
-> NoteX reads current page context
-> AI returns field-level patch
-> UI shows diff
-> user accepts or rejects
```

## 14. Phase Plan

Phase 1: Shape and mainline

- Add Activity Bar entries for Training and Knowledge Base.
- Add workspace shells and routing state.
- Build Training Center three-column layout.
- Support Today, Range, and Single Problem source modes.
- Create batch/item draft models and deterministic template generation.
- Write one collection plus selected fragments.
- Build Rust graph index skeleton and rebuild/read commands.
- Show Knowledge overview, basic lists, and basic graph.

Phase 2: Knowledge views

- Improve graph filters and local graph.
- Add relationship suggestion rules.
- Add review status and priority workflows.
- Add better list filtering and asset open/jump flows.

Phase 3: Source expansion

- Implement real problem set and contest source modes.
- Improve batch history.
- Add legacy Luogu import migration affordances.

Future AI phase:

- AI extraction.
- AI association suggestions.
- NoteX field-level patch.
- AI review planning.
- Semantic similarity/embedding.

## 15. Execution Organization

This work should happen in a separate worktree. The current conversation remains the management/design thread.

Recommended parallel execution threads after spec approval:

- UI shell thread: Activity Bar, Training workspace, Knowledge workspace, page states.
- Data/model thread: TypeScript training drafts, asset schema helpers, template generation, focused tests.
- Rust index thread: graph scanner/cache/API commands and Rust tests.

Merge order should be model/API first, then UI consumption, then graph visualization polish.

Management reporting cadence:

- Report current phase and subtask, e.g. `P4 Training shell: left source column`.
- Report remaining items in the current chapter.
- Estimate remaining review rounds.
- Keep notes/status filtered with `git status --short -- . ":(exclude)notes/**"`.

## 16. Non-Goals

Phase 1 does not:

- Connect new AI systems.
- Implement NoteX patch modification.
- Implement embeddings or semantic similarity.
- Implement real problem set/contest scanning.
- Rewrite the Markdown editor.
- Bulk-migrate old notes.
- Touch `notes/**`.
- Change AI provider, prompt, model, or search behavior.

## 17. Acceptance Criteria

- Activity Bar has separate Training and Knowledge Base entries.
- Training Center is a page workspace, not a modal.
- Training Center has the three-column layout and a collapsible Inspector.
- Today, Range, and Single Problem source modes are usable.
- A batch can write one collection and selected fragments.
- New files use the knowledge directory strategy and correct frontmatter.
- Legacy Markdown remains readable without migration.
- Rust can rebuild `.oinb` graph index from Markdown.
- Knowledge Base can show overview counts, lists, and basic graph data.
- No Phase 1 UI path requires AI.
- API wrappers and API contract tests are updated when commands are added.
- Existing notes path safety is preserved.
