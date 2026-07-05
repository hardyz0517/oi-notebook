# AGENTS.md

This is the entry point for coding agents in `oi-notebook`.

## Priority

1. User instructions.
2. This file.
3. `PROJECT.md`, `docs/HANDOFF.md`, and `docs/README.md` for longer repo context.

If instructions conflict, stop and ask instead of guessing.

## Read Path

- Start with `AGENTS.md`.
- For ordinary tasks, read only this file, `git status --short -- . ":(exclude)notes/**"`, and the directly relevant source files.
- Read `PROJECT.md`, `docs/HANDOFF.md`, or `docs/README.md` only when the task needs planning, architecture, release context, or repo-wide conventions that source files do not answer.
- Do not open `docs/archive/**` by default.
- Prefer `rg` and other targeted searches over broad reads.
- If you need a long doc, say why before opening it.

## Working Boundaries

- Stay within the requested scope. Do not expand into unrelated files or subsystems unless it is required to finish the task safely.
- Treat `notes/**` as scratch space. Do not modify, restore, stage, or commit it unless the user explicitly asks.
- Keep `notes/**` out of routine status output.
- Frontend to Rust calls go through `src/lib/api.ts`.
- Do not simplify the two-layer path safety check in `src-tauri/src/notes.rs`.
- Do not "optimize" the ref-based patterns in `MarkdownEditor` or `MarkdownPreview`.
- Prefer existing patterns and helpers over new abstractions unless the new shape clearly removes real complexity.

## Git Hygiene

- Use `git status --short -- . ":(exclude)notes/**"` for the main workspace snapshot.
- Mention `notes/**` separately only when it is relevant or the user asks for it.
- Never use `git add .`, `git add -A`, or `git commit -a`.
- Stage exact paths with `git add -- <paths>`.
- Check `git diff --cached --name-only` before committing.
- Commit-only is the default. Push or tag only when the user explicitly asks.

## Reporting

- Keep active-work updates short and operational.
- State the current phase and subsection, what is running now, what remains in the current slice, what remains overall, and any risks or blockers.
- If work is delegated or parallelized, name the thread or worktree role.
- Closeout updates should include verification results and whether anything was staged, committed, or pushed.
