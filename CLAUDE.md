# OI Notebook Agent Rules

## Project

This project is usually located at:

`D:\Dev\Projects\oi-notebook`

The user is Hardy. The assistant should make small, scoped changes and avoid broad rewrites.

**oi-notebook** is a desktop note-taking app for competitive programmers (OIers), built with Tauri 2 + React + TypeScript. Notes are plain `.md` files with YAML frontmatter, auto-committed to git on save.

Three core flows: global hotkey quick-capture (`Ctrl+Alt+Space`), local Astro blog preview, and auto-ingest of Luogu submissions via `/* @oinb-insight */` comments in C++ source.

## Hard rules

- Before any code change, run:
  - `git status --short -- . ":(exclude)notes/**"`
  - `git diff --cached --name-only`
- If the staging area is not empty, stop and report.
- Do not modify `notes/**`.
- Do not modify `.oinb/**`.
- Do not use:
  - `git add .`
  - `git add -A`
  - `git commit -a`
- Do not commit or push unless the user explicitly asks.
- If the user asks to commit, stage exact files only with `git add -- <paths>`.
- Do not mix unrelated work in one change.
- Do not perform large refactors unless explicitly requested.
- Do not silently clean up old WIP files.

## Commands

```bash
pnpm.cmd tauri dev           # Full desktop app with Rust + hot reload
pnpm.cmd tauri build         # Production desktop bundle
pnpm.cmd build               # tsc + vite build (also triggers build:local-blog)
cargo test                   # Rust unit tests (in src-tauri/)
```

## Validation

After frontend changes, run:

- `pnpm.cmd tsc --noEmit`
- `pnpm.cmd build`

If Rust/Tauri files in `src-tauri/` changed, also run:

- `cargo check --manifest-path .\src-tauri\Cargo.toml`

Vite chunk-size warnings are acceptable.

If `dist/assets` EPERM appears, it is usually caused by the running app holding files. Do not kill processes without asking; report it.

## Architecture

```
src/                          # React frontend (Vite, entry: main.tsx → App.tsx)
  lib/api.ts                  # ALL frontend→Rust calls go through here; never invoke directly
  components/
    editor/                   # CodeMirror 6 editor + remark/rehype markdown preview
    ai/                       # AI chat sidebar, diff preview
    tag-manager/              # Tag taxonomy management UI
    file-tree/                # Note file tree sidebar
    settings/                 # Settings center with pages for AI, Luogu, taxonomy
src-tauri/src/                # Rust backend (Tauri commands)
  lib.rs                      # Builder setup, command registration, tray icon, global shortcut
  notes.rs                    # File I/O with two-layer path safety check (do NOT simplify)
  ai.rs                       # AI chat, metadata generation, web search, note polishing
  luogu.rs                    # Luogu crawler: submission fetching, insight parsing, import
  git.rs                      # Auto-commit/push of note files
  paths.rs                    # Data directory resolution (dev vs release)
  blog_server.rs              # Astro dev server lifecycle + production static file server
  prompts.rs                  # AI prompt template management (.oinb/prompts/)
  tag_taxonomy.rs             # Tag taxonomy config persistence
  local_search.rs             # Local note search index builder
  web_cache.rs / web_extract.rs  # Web search result caching and content extraction
  frontmatter.rs              # YAML frontmatter parsing/completion
```

**IPC pattern:** Rust `#[tauri::command]` functions are declared in `lib.rs`'s `invoke_handler`, then wrapped as typed async functions in `src/lib/api.ts`. The frontend never calls `invoke` directly.

**Multi-window:** Two webview windows — `main` (editor/notebook) and `quick-note` (popup triggered by `Ctrl+Alt+Space`). Both are built from separate HTML entry points (`index.html`, `quick-note.html`).

**Data directories:**
- `notes/` — repo root in dev, app data dir in release. Subdirs: `inbox/`, `tricks/`, `problems/`, `luogu/`, `assets/`
- `.oinb/` — config (`config.json`), AI prompts (`prompts/*.md`), caches (`ai-cache/`, `web-cache/`, `local-index/`)

## Key constraints

- Vite dev server **must** run on port 1420 (hardcoded in `tauri.conf.json`)
- TypeScript strict mode: `noUnusedLocals`, `noUnusedParameters` enabled
- `@/` alias resolves to `src/`
- The Rust crate has `crate-type = ["staticlib", "cdylib", "rlib"]` — required for Tauri on Windows
- The blog Astro site (`local-blog/`) uses a **different aesthetic** from the editor — literary/essay-style with serif typography, light theme, generous whitespace. The editor uses the Lyra shadcn preset (dark, compact, monospace).

## UI stack

- **Components:** shadcn/ui with Radix Lyra preset (`radix-lyra` style)
- **Editor:** CodeMirror 6
- **Markdown:** unified + remark-parse + remark-gfm + remark-math + remark-rehype + rehype-katex + rehype-stringify, Shiki for code highlighting
- **Styling:** Tailwind CSS v4 with `tw-animate-css`
- **Math:** KaTeX
- **Icons:** Lucide React
- **Drag-and-drop:** `@dnd-kit/core`

## Usually avoid unless explicitly requested

- `local-blog/**`
- `src-tauri/**`, unless the task clearly involves Tauri/Rust/backend logic
- `.rollback-backup/**`
- `docs/notex_ai_sidebar_recovery_plan.md`

## NoteX UI polish scope

For ordinary NoteX UI polish, prefer editing only:

- `src/components/ai/AiSidebar.tsx`
- `src/components/ai/notexWorkbench.css`

Only touch these if truly necessary:

- `src/components/ai/VirtualMessageList.tsx`
- `src/components/ai/useVirtualMessageList.ts`
- `src/components/ai/markdownCache.ts`

Do not mix NoteX UI fixes with Settings Center refactors.

## Settings Center

Settings Center split is only partially complete. Do not continue it unless the user explicitly asks.

Do not mix Settings Center work with NoteX UI polish.

## Reporting format

After each task, report:

1. Files changed.
2. What changed.
3. Validation commands and results.
4. Final `git status --short -- . ":(exclude)notes/**"`.
5. Whether there was no git add, no commit, no push, and no `notes/**` handling.
