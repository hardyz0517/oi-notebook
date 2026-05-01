# AGENTS.md

This file directs all coding agents (Codex, Cursor, etc.) to project entry docs.

Before doing anything in this repo, read in order:

1. AGENTS.md - agent entry rules
2. PROJECT.md - project overview, tech stack, commands
3. docs/HANDOFF.md - current state, conventions, gotchas
4. docs/OI-Notebook-PRD-v1.md - product spec

PROJECT.md and docs/HANDOFF.md are kept in sync. PROJECT.md is the neutral
project overview for all coding agents; HANDOFF.md is the operating manual
updated at the end of each phase.

Hard rules (excerpted from HANDOFF.md):
- Print full real file contents after every edit. No folding, no diff-only, no summary.
- One task at a time. Stop after each task, wait for review.
- Never simplify the two-layer path safety check in src-tauri/src/notes.rs.
- Don't "optimize" the ref-based patterns in MarkdownEditor and MarkdownPreview.
- Frontend -> Rust calls go through src/lib/api.ts, never invoke directly.
