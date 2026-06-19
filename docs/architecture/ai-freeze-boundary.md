# AI Freeze Boundary

This document defines the foundation-phase boundary around AI behavior. The
foundation phase may prepare surrounding architecture for later AI work, but it
must not change AI product behavior, provider behavior, prompt behavior, model
selection, or web search behavior.

## Purpose

The foundation phase is allowed to reduce coupling around AI-adjacent code so
later AI changes have a stable place to land. It is not an AI feature phase.
Any work that would alter how AI responds, what it sends to providers, which
models it selects, or how web search is performed is outside this phase.

## Allowed Foundation Work

Foundation work may move or reshape non-AI infrastructure when the behavior
remains the same:

- Non-AI helper functions that currently live near broader application code.
- Settings metadata, registries, search indexing, and grouping structures that
  can later host AI settings without changing visible AI behavior.
- Task models, status types, and long-running operation plumbing shared by
  frontend and Rust.
- Service boundaries for non-AI Rust commands and helpers.
- App-level organization that removes unrelated domain helper clusters from
  `App.tsx` without changing AI behavior.

These changes must preserve the existing AI surface. They can create clearer
places for future AI settings and task status, but they cannot make those
future settings active or change what users see from AI today.

## Frozen AI Areas

Foundation work must not change:

- `src/components/ai/AiSidebar.tsx`
- `src/lib/aiWebSearch.ts`
- `src-tauri/src/ai.rs`
- AI prompts
- Model selection
- Provider behavior
- Web search behavior

Do not move, rewrite, simplify, or refactor these areas as part of foundation
work. Do not make behavior-preserving changes there either; keeping the files
untouched is the boundary that makes later AI review possible.

## Boundary Rules

- If a change affects AI request construction, response handling, streaming,
  prompt text, provider configuration, model choice, or web search execution,
  it is AI work and must wait.
- If a change only prepares non-AI settings, task status, helper placement, or
  service layering while preserving current behavior, it is foundation work.
- If a change needs to touch both foundation infrastructure and a frozen AI
  area, split it and do only the non-AI foundation part now.
- If a future AI setting needs a registry slot, add only inert metadata during
  foundation work. Do not connect it to live AI behavior.
- If the safest path requires changing a frozen file, stop and defer the work
  to the later AI phase.

## Entry Conditions For Later AI Work

Later AI work may begin once these foundation conditions are true:

- `App.tsx` no longer owns unrelated domain helper clusters.
- A long-task status model exists on both the frontend and Rust sides.
- The Settings registry and search structure can host AI settings without
  visual churn.
- Non-AI Rust services have clearer command and service boundaries.

These conditions are preparation milestones, not permission to change AI during
foundation work. They mark the point where AI-specific changes can be planned,
reviewed, and tested against a calmer architecture.
