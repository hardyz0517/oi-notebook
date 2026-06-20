# PROJECT.md

This file provides neutral project guidance for coding agents working in this repository.

## Project Overview

**oi-notebook** is a desktop-first note-taking tool for competitive programmers (OIers), built with Tauri 2 + React + TypeScript. The full product spec is in `docs/OI-Notebook-PRD-v1.md` (Chinese).

The three core user flows:
1. **Quick-capture** (`Ctrl+Alt+Space`) - popup editor for jotting algorithm tricks mid-session
2. **Local blog** - Astro site at `localhost:4321` that live-previews notes
3. **Auto-ingest** - crawler that reads `/* @oinb-insight ... */` comments from accepted Luogu submissions and auto-generates structured Markdown notes

All notes are plain `.md` files with YAML frontmatter, committed to git automatically on save.

## Development Commands

**Package manager: `pnpm`**

```bash
# Frontend only
pnpm dev          # Vite dev server on port 1420
pnpm build        # tsc + vite build -> dist/
pnpm preview      # Preview production build

# Full desktop app (preferred)
pnpm tauri dev    # Starts Vite + Rust with hot reload
pnpm tauri build  # Full production bundle
```

Frontend pure-helper tests run with Vitest via `pnpm test:run`. Rust unit tests exist under `src-tauri/src/`.

## Architecture

```
oi-notebook/
├── src/                    # React + TypeScript frontend
│   ├── main.tsx            # React entry point -> mounts <App />
│   └── App.tsx             # Root component
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs          # Tauri commands + builder setup (library crate)
│   │   ├── notes.rs        # Note filesystem IPC and path safety
│   │   └── main.rs         # Binary entry point -> calls lib::run()
│   ├── capabilities/
│   │   └── default.json    # IPC permissions granted to the main window
│   ├── tauri.conf.json     # App config: name, identifier, window size, bundles
│   └── Cargo.toml          # Rust deps
├── docs/
│   └── OI-Notebook-PRD-v1.md  # Authoritative product spec (Chinese)
├── notes/                  # Plain .md note files
│   ├── inbox/
│   ├── tricks/
│   ├── problems/
│   └── luogu/              # Auto-generated from crawler
├── site/                   # (planned) Astro blog subproject
└── .oinb/                  # (planned, gitignored) Config, SQLite index, AI cache
```

**IPC pattern:** Frontend calls Rust commands through wrappers in `src/lib/api.ts`. Commands are defined with `#[tauri::command]` in Rust and registered in the builder's `invoke_handler`.

**Foundation upgrade status:** The current engineering pass is foundation-first with AI behavior frozen. Theme Engine lives under `src/theme/**`; Settings V2 visual styling is protected; App shell helpers, note workspace rules, long-task state helpers, Blog/Local Index/Tag Taxonomy/Luogu view models, and API boundary guards are being extracted into focused modules with Vitest coverage.

**Foundation engineering rules:** See `docs/architecture/foundation-engineering-rules.md` before continuing non-AI architecture cleanup. It defines the App shell boundary, TaskState/TaskView pattern, domain-module ownership, side-effect placement, and verification checklist.

**Long-task model:** Non-AI long-running work should expose `TaskState` from `src/lib/taskStatus.ts` and, when UI labels/progress are needed, a small domain task-view helper. Local index rebuild/load state, Luogu scan/prepare/write state, and tag normalization scan/apply state are already aligned with this rule. Settings-facing disabled/spinner/label state should prefer domain view models when the rule is shared or non-trivial. New task surfaces should not invent ad hoc `isLoading`/`isBusy`/`error` boolean clusters when the shared model can represent the workflow.

**Planned data flow:**
- User edits in CodeMirror -> real-time remark/rehype preview
- Save -> writes `.md` file -> `git add && git commit` (message: `note: {title}`)
- Astro dev server (spawned by Tauri at startup) hot-reloads `localhost:4321`
- Every 5 min / on close -> `git push` -> GitHub Actions -> GitHub Pages

## Planned Tech Stack

When implementing features, use these libraries (per PRD):
- **Editor:** CodeMirror 6
- **Markdown:** unified + remark + rehype, KaTeX (math), Shiki (code highlighting)
- **UI:** shadcn/ui + Tailwind CSS, Zustand (state)
- **Search:** SQLite via `tauri-plugin-sql` with FTS5
- **Blog:** Astro
- **AI:** OpenAI-compatible SDK/providers, with optional OpenRouter-compatible routing for strong models

## Note Frontmatter Schema

Every note must have:
```yaml
---
title: ""
tags: []
difficulty: ""       # e.g. 提高+, 省选
source: ""           # e.g. luogu-P1234
created: ISO8601
updated: ISO8601
summary: ""
draft: false
---
```

## Luogu Crawler Trigger Comment

Auto-ingest reads this comment from C++ source files on Luogu:
```cpp
/* @oinb-insight
---
title: ...
tags: [...]
---
content here
*/
```

## Key Constraints

- Vite dev server **must** run on port 1420 (hardcoded in `tauri.conf.json` as `devUrl`)
- TypeScript is strict: `noUnusedLocals`, `noUnusedParameters` are enabled
- The Rust crate produces `staticlib + cdylib + rlib` - required for Tauri on Windows to avoid lib name collisions
- AI provider config lives in `.oinb/config.json`; prompts are templatable Markdown in `.oinb/prompts/*.md`
- All frontend -> Rust calls go through `src/lib/api.ts`
- Non-AI long-running frontend work should use `src/lib/taskStatus.ts` as its status/progress/error contract when practical
- Do not simplify the two-layer path safety check in `src-tauri/src/notes.rs`

## Blog Design Direction (for future Astro site)

The desktop editor uses the Lyra shadcn preset - dark, compact, monospace, developer-focused. **The blog site deliberately uses a completely different aesthetic:**

**Reference aesthetic: literary/essay-style personal blog** (think Sinya Lee's essays, Paul Graham, Stratechery)

**Key visual properties:**
- **Light theme**, white background, black text
- **Serif typography for body** (e.g. Source Serif Pro, Lora, or Noto Serif SC for Chinese); sans-serif for navigation only
- **Magazine-style three-column card grid** on the index page: each entry is a card with:
  - Small colored category tag (accent color, restrained)
  - Date (small, muted)
  - Large title
  - Truncated excerpt ending in [...]
  - "Read more" link (thin underline, no button styling)
- **Single narrow column** on article pages for reading comfort
- **Generous whitespace**, low density - opposite of the editor
- **Minimal top nav** (Home / Posts / About / ...), no sidebar
- **One accent color** (purple, blue, or muted red), used sparingly for category tags and links
- **Thin separators**, nothing visually loud
- **No emoji, no decorative icons** in the theme chrome (user markdown content can contain emoji freely)

**Reference candidate templates**:
- Astro Paper
- Astro Cactus
- Tokyo theme for Astro

**Rationale**: editor is a *working tool* (needs density and focus), blog is a *reading surface* (needs calm and typographic quality). The two should not share a theme.

When the time comes to initialize the Astro subproject (`site/`), start from one of the reference templates above and tune toward the literary/essay aesthetic described here.
