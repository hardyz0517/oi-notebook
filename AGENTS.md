# AGENTS.md

This file directs all coding agents (Codex, Cursor, etc.) to project entry docs.

Always read first:

1. AGENTS.md - agent entry rules

Read these longer docs only when the task actually needs them:

2. PROJECT.md - project overview, tech stack, commands
3. docs/HANDOFF.md - current state, conventions, gotchas
4. docs/README.md - documentation map and archive policy

PROJECT.md and docs/HANDOFF.md are kept in sync. PROJECT.md is the neutral
project overview for all coding agents; HANDOFF.md is the operating manual
updated at the end of each phase.

## Context and token discipline

For small scoped tasks, do not read PROJECT.md, docs/HANDOFF.md,
docs/archive/**, or other long docs by default.

Read long docs only when the task explicitly needs planning, architecture,
handoff, release, product-requirements context, or when the relevant source
files are not enough to determine intent safely.

For ordinary small tasks, read only:
- AGENTS.md
- `git status --short -- . ":(exclude)notes/**"`
- directly relevant source files

Prefer `rg` or other targeted search over full-file reads. If more context is
needed, explain why before reading large docs.

Hard rules (excerpted from HANDOFF.md):
- Print full real file contents after every edit. No folding, no diff-only, no summary.
- One task at a time. Stop after each task, wait for review.
- Never simplify the two-layer path safety check in src-tauri/src/notes.rs.
- Don't "optimize" the ref-based patterns in MarkdownEditor and MarkdownPreview.
- Frontend -> Rust calls go through src/lib/api.ts, never invoke directly.
- Do not handle `notes/**` unless the user explicitly asks.
- Treat `notes/**` as a local test-notes area: do not modify, restore, stage, or commit it.
- For ordinary work, prefer `git status --short -- . ":(exclude)notes/**"` and keep `notes/**` out of routine status output.
- If notes state must be mentioned, summarize it briefly instead of printing the full list. Only print full `notes/**` status when the user explicitly asks for it.
- Do not use `git add .`.
- Before commit, use exact `git add -- <paths>`.
- Before commit, check `git diff --cached --name-only`.
