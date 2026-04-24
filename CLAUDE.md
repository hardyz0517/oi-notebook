# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**oi-notebook** is a desktop-first note-taking tool for competitive programmers (OIers), built with Tauri 2 + React + TypeScript. The full product spec is in `docs/OI-Notebook-PRD-v1.md` (Chinese).

The three core user flows:
1. **Quick-capture** (`Ctrl+Shift+Space`) — popup editor for jotting algorithm tricks mid-session
2. **Local blog** — Astro site at `localhost:4321` that live-previews notes
3. **Auto-ingest** — crawler that reads `/* @oinb-insight ... */` comments from accepted Luogu submissions and auto-generates structured Markdown notes

All notes are plain `.md` files with YAML frontmatter, committed to git automatically on save.

## Development Commands

**Package manager: `pnpm`**

```bash
# Frontend only
pnpm dev          # Vite dev server on port 1420
pnpm build        # tsc + vite build → dist/
pnpm preview      # Preview production build

# Full desktop app (preferred)
pnpm tauri dev    # Starts Vite + Rust with hot reload
pnpm tauri build  # Full production bundle
```

No test framework is configured yet.

## Architecture

```
oi-notebook/
├── src/                    # React + TypeScript frontend
│   ├── main.tsx            # React entry point → mounts <App />
│   └── App.tsx             # Root component
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs          # Tauri commands + builder setup (library crate)
│   │   └── main.rs         # Binary entry point → calls lib::run()
│   ├── capabilities/
│   │   └── default.json    # IPC permissions granted to the main window
│   ├── tauri.conf.json     # App config: name, identifier, window size, bundles
│   └── Cargo.toml          # Rust deps
├── docs/
│   └── OI-Notebook-PRD-v1.md  # Authoritative product spec (Chinese)
├── notes/                  # (planned) Plain .md note files
│   ├── tricks/
│   ├── problems/
│   └── luogu/              # Auto-generated from crawler
├── site/                   # (planned) Astro blog subproject
└── .oinb/                  # (planned, gitignored) Config, SQLite index, AI cache
```

**IPC pattern:** Frontend calls Rust commands via `invoke('command_name', { args })`. Commands are defined with `#[tauri::command]` in `lib.rs` and registered in the builder's `invoke_handler`.

**Planned data flow:**
- User edits in CodeMirror → real-time remark/rehype preview
- Save → writes `.md` file → `git add && git commit` (message: `note: {title}`)
- Astro dev server (spawned by Tauri at startup) hot-reloads `localhost:4321`
- Every 5 min / on close → `git push` → GitHub Actions → GitHub Pages

## Planned Tech Stack

When implementing features, use these libraries (per PRD):
- **Editor:** CodeMirror 6
- **Markdown:** unified + remark + rehype, KaTeX (math), Shiki (code highlighting)
- **UI:** shadcn/ui + Tailwind CSS, Zustand (state)
- **Search:** SQLite via `tauri-plugin-sql` with FTS5
- **Blog:** Astro
- **AI:** `@anthropic-ai/sdk` + OpenAI-compatible SDK

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
- The Rust crate produces `staticlib + cdylib + rlib` — required for Tauri on Windows to avoid lib name collisions
- AI provider config lives in `.oinb/config.json`; prompts are templatable Markdown in `.oinb/prompts/*.md`

## Blog Design Direction (for future Astro site)

The desktop editor uses the Lyra shadcn preset — dark, compact, monospace, developer-focused. **The blog site deliberately uses a completely different aesthetic:**

**Reference aesthetic: literary/essay-style personal blog** (think Sinya Lee's essays, Paul Graham's site, Stratechery)

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
- **Generous whitespace**, low density — opposite of the editor
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
