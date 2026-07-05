# OI Notebook Knowledge Base And Training Center Upgrade Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this roadmap task-by-task. Use the phase boundaries below to dispatch focused implementation plans.

**Goal:** Upgrade OI Notebook from a Luogu import and Markdown manager into two first-class workspaces: Training Center and Knowledge Base, with a deterministic graph foundation now and AI-assisted knowledge work later.

**Architecture:** Keep the existing app shell and Luogu source adapters, but split the product into a production workspace for training and a consumption workspace for knowledge. Training writes structured Markdown assets. Knowledge reads those assets plus a rebuildable `.oinb` graph cache. Rust owns scanning and cache rebuild, while frontend stays behind `src/lib/api.ts`.

**Tech Stack:** Tauri 2, React, TypeScript, Rust, Vitest, Cargo tests, existing Markdown/frontmatter helpers, existing task-state helpers, existing Luogu scan/workflow helpers.

---

## 0. Decisions Already Locked

- Two first-class Activity Bar entries: `Training` and `Knowledge`.
- Training Center is a page workspace, not a modal.
- Knowledge Base is a page workspace, not a settings subpage.
- Phase 1 source modes: `Today`, `Range`, `Single Problem`.
- `Problem Set` and `Contest` are reserved future modes only.
- New knowledge assets default to `knowledge/fragments/`, `knowledge/collections/`, and `knowledge/articles/`.
- Each written batch defaults to `1 collection + N fragments`; `article` is optional.
- Rust owns `.oinb` graph cache rebuild and read.
- Phase 1 does not call AI. AI Inspector/patch slots are reserved only.

---

## 1. Program Phases

### Phase 0: Specification And Planning

Purpose:

- Lock product boundaries and implementation sequence.
- Make the upgrade executable in independent workstreams.

Outputs:

- Product spec.
- P1 implementation plan.
- This roadmap.

Exit criteria:

- The team can name the shell, model, graph, and write surfaces without re-litigating the product decision.

### Phase 1: Shell And Deterministic Mainline

Purpose:

- Make the new product shape visible and usable.
- Build the first deterministic write path from training batches into Markdown assets.
- Establish the Rust graph cache API foundation.

Outputs:

- Training workspace shell.
- Knowledge workspace shell.
- Training batch/item draft model.
- Knowledge frontmatter normalization.
- Fragment/collection Markdown generation.
- Rust graph API skeleton.

Exit criteria:

- The app can open Training and Knowledge as separate workspaces.
- A batch can be written as Markdown assets.
- The graph cache API exists.

### Phase 2: Knowledge Views And Rule-Based Relationships

Purpose:

- Turn the graph cache into a browsable knowledge product.
- Add manual review workflows and deterministic relationship suggestions.

Outputs:

- List filtering.
- Global and local graph navigation.
- Review and mistake views.
- Relationship suggestion signals.

Exit criteria:

- Users can browse, focus, review, and inspect relationship signals without AI.

### Phase 3: Source Expansion

Purpose:

- Broaden the training source surface without changing the knowledge model.

Outputs:

- Problem Set source mode.
- Contest source mode.
- Better batch replay/history.
- Legacy Luogu import affordances.

Exit criteria:

- Training can ingest more source shapes while still writing the same asset model.

### Phase 4: AI Reservation Activation

Purpose:

- Make the reserved AI surfaces real without breaking deterministic behavior.

Outputs:

- Inspector becomes an AI entry point.
- NoteX can patch selected fields.
- AI suggestions can populate relationship and review proposals.

Exit criteria:

- AI can act on selected batch/item/asset context through field-level diffs.

### Phase 5: AI-Assisted Knowledge Work

Purpose:

- Use AI to accelerate extraction, relationship building, and review planning.

Outputs:

- AI trick/mistake/summary extraction.
- AI link suggestions.
- AI review plans.

Exit criteria:

- AI improves output quality without making the system depend on AI.

---

## 2. Workstream Split

### Workstream A: Shell And Navigation

Owns:

- Activity Bar.
- Workspace switching.
- Return-to-editor behavior.
- Basic page shells.

### Workstream B: Knowledge Data Model

Owns:

- Training drafts.
- Frontmatter normalization.
- Markdown templates.
- Model tests.

### Workstream C: Rust Graph Cache

Owns:

- Markdown scanning.
- `.oinb` cache rebuild/read.
- Graph node/edge serialization.
- Backend tests.

### Workstream D: Training Write Flow

Owns:

- Batch orchestration.
- Collection + fragment write.
- Write result tracking.
- Cache refresh after write.

### Workstream E: Knowledge Views

Owns:

- Overview.
- Lists.
- Graph views.
- Review and relationship signals.

### Workstream F: Future AI

Owns:

- Inspector AI slots.
- NoteX patch UX.
- AI-based suggestions and planning.

---

## 3. Phase 1 Roadmap

### 3.1 Shell

Objective:

- Expose `Training` and `Knowledge` as first-class app workspaces.

Implementation focus:

- `src/lib/appShell.ts`
- `src/lib/appShell.test.ts`
- `src/App.tsx`

Acceptance:

- The app can switch between editor, Training, and Knowledge without losing the current note.

### 3.2 Data Model

Objective:

- Introduce a deterministic training/knowledge model that is compatible with legacy Markdown.

Implementation focus:

- `src/lib/knowledge/knowledgeTypes.ts`
- `src/lib/knowledge/knowledgeFrontmatter.ts`
- `src/lib/knowledge/trainingDrafts.ts`
- `src/lib/knowledge/knowledgeTemplates.ts`

Acceptance:

- Training items can be rendered into fragment Markdown.
- A batch can be rendered into a collection Markdown file.
- Old notes without `type` remain readable as legacy assets.

### 3.3 Rust Graph API

Objective:

- Give the frontend a graph cache API that can later be backed by real scanning.

Implementation focus:

- `src-tauri/src/knowledge.rs`
- `src-tauri/src/lib.rs`
- `src/lib/api.ts`
- `src/lib/apiContract.ts`

Acceptance:

- Frontend can request rebuild/read of the knowledge graph through the API boundary.

### 3.4 Training Workspace

Objective:

- Build the three-column training UI shell.

Implementation focus:

- `src/components/training/TrainingCenterWorkspace.tsx`
- `src/components/training/TrainingSourcePanel.tsx`
- `src/components/training/TrainingWorkbench.tsx`
- `src/components/training/TrainingInspector.tsx`

Acceptance:

- Source selection, workbench, and inspector are visible and structurally correct.

### 3.5 Knowledge Workspace

Objective:

- Build the Knowledge Base shell and primary sections.

Implementation focus:

- `src/components/knowledge/KnowledgeBaseWorkspace.tsx`
- `src/components/knowledge/KnowledgeOverview.tsx`
- `src/components/knowledge/KnowledgeGraphView.tsx`
- `src/components/knowledge/KnowledgeAssetList.tsx`
- `src/components/knowledge/KnowledgeReviewView.tsx`

Acceptance:

- The Knowledge workspace can show overview, list, graph, and review shells.

### 3.6 Write Flow

Objective:

- Persist batch outputs as Markdown assets and refresh graph cache.

Implementation focus:

- `src/components/training/TrainingCenterWorkspace.tsx`
- `src/lib/knowledge/knowledgeTemplates.ts`
- `src/lib/api.ts`
- `src/lib/apiContract.ts`
- `src-tauri/src/knowledge.rs`

Acceptance:

- A written batch produces one collection and selected fragments, then refreshes the graph.

### 3.7 Verification

Objective:

- Make Phase 1 trustworthy before expanding scope.

Checks:

- Frontend tests.
- `pnpm.cmd tsc --noEmit`.
- `pnpm.cmd build`.
- `cargo check --manifest-path .\src-tauri\Cargo.toml`.
- `cargo test --manifest-path .\src-tauri\Cargo.toml knowledge`.
- API boundary audit.

Acceptance:

- The app runs with the new shell and write path without AI.

---

## 4. Phase 2 Roadmap

### 4.1 Browsing Depth

- Add stronger filters by type, topic, source, review priority, and relation count.
- Add asset open/jump behavior from lists.
- Add graph focus from list selection.

### 4.2 Graph Depth

- Add local graph around a selected asset/problem/topic.
- Surface linked vs unlinked mentions.
- Add reverse navigation from graph nodes.

### 4.3 Review Depth

- Add manual mastery/status tracking.
- Add recent fragment and 7/30-day review slices.
- Add isolated-content and frontmatter-omission signals.

### 4.4 Rule-Based Suggestions

- Add deterministic relationship suggestion groups.
- Add source/target previews for suggested links.
- Keep AI slots visible but inactive.

Exit criteria:

- Knowledge Base is useful for browsing and manual review even without AI.

---

## 5. Phase 3 Roadmap

### 5.1 Source Expansion

- Add real Problem Set source mode.
- Add real Contest source mode.
- Reuse the same draft/write pipeline.

### 5.2 Batch Replay

- Persist batch summaries.
- Reopen old batches for review or re-write.
- Compare current batches with previous batches.

### 5.3 Legacy Migration

- Recognize old Luogu notes and legacy solution files.
- Offer optional upgrade into `fragment` or `article`.
- Keep old files readable without migration.

Exit criteria:

- New source shapes can feed the same knowledge model.

---

## 6. Phase 4 Roadmap

### 6.1 Inspector AI Hooks

- Add AI placeholder state to Inspector.
- Define selected-item context payloads.
- Define field-level patch target shapes.

### 6.2 NoteX Patch Bridge

- Read current Training/Knowledge context from the page.
- Send patchable field diffs to NoteX.
- Render accept/reject diff flow.

### 6.3 AI Reservation Wiring

- Add reserved graph edge source values.
- Add reserved suggestion groups.
- Keep deterministic behavior unchanged until AI is explicitly activated.

Exit criteria:

- AI can operate on a selected item without taking over the whole workspace.

---

## 7. Phase 5 Roadmap

### 7.1 AI Extraction

- Extract trick, mistake, and summary candidates.
- Auto-fill fragment fields with reviewable proposals.
- Keep all changes patchable and reversible.

### 7.2 AI Relationship Help

- Suggest links among problems, topics, and fragments.
- Detect merge/split candidates.
- Recommend collection membership.

### 7.3 AI Review Planning

- Generate batch review priorities.
- Surface weak topics and repetition patterns.
- Suggest next training/review targets.

Exit criteria:

- AI improves throughput and review quality without changing the base data model.

---

## 8. Cross-Cutting Rules

- Keep `App.tsx` as a shell, not a rules warehouse.
- Keep Markdown/frontmatter as the durable user asset.
- Keep `.oinb` rebuildable.
- Keep API wrappers centralized.
- Keep tests close to rule owners.
- Keep AI and non-AI flows separate until the AI phase starts.
- Keep existing Luogu helpers as source adapters, not as the center of the new product.
- Keep legacy Markdown and old Luogu output readable.

---

## 9. Acceptance Ladder

Phase 1:

- Training and Knowledge appear in Activity Bar.
- Training and Knowledge open as page workspaces.
- A batch can write one collection plus fragments.
- Rust can rebuild `.oinb` from Markdown.
- The app remains usable without AI.

Phase 2:

- Lists, local graph, review, and relationship suggestions are meaningful.

Phase 3:

- Problem Set and Contest sources work.
- Legacy content still works.

Phase 4:

- AI slots can patch fields and surface diffs.

Phase 5:

- AI materially improves training sedimentation and knowledge maintenance without breaking the deterministic base.
