# PROJECT.md

This file is the short, current project overview for agents working in this
repository. For the documentation map, read `docs/README.md`. For current
engineering handoff rules, read `docs/HANDOFF.md`.

## Project Overview

**oi-notebook** is a desktop-first note-taking tool for competitive
programmers (OIers), built with Tauri 2, React, TypeScript, and Rust.

Current core user flows:

1. **Quick capture**: `Ctrl+Alt+Space` opens a small capture window for quick
   algorithm notes.
2. **Notebook workspace**: the main app edits local Markdown notes with YAML
   frontmatter, preview, file-tree actions, local search, settings, tag
   management, and Git-backed persistence.
3. **Local blog**: Tauri/Rust serves a bundled `local-blog` SPA and JSON APIs
   at `http://127.0.0.1:4321/local-blog/`.
4. **Luogu import**: accepted Luogu submissions can be scanned, previewed, and
   written into structured Markdown notes.

AI-facing behavior is currently frozen during the foundation-first engineering
phase. Do not change AI prompts, provider behavior, model selection, web search
behavior, `src/components/ai/**`, `src/lib/aiWebSearch.ts`, or
`src-tauri/src/ai.rs` unless the user explicitly starts AI work.

## Development Commands

Package manager: `pnpm`

```bash
# Frontend app
pnpm dev
pnpm build
pnpm preview

# Tests
pnpm test:run
pnpm.cmd vitest run <test-file>

# Desktop app
pnpm tauri dev
pnpm tauri build

# Rust backend
cd src-tauri
cargo check
cargo test
```

Vite dev server must run on port `1420`; it is configured in
`src-tauri/tauri.conf.json`.

## Current Architecture

```text
oi-notebook/
+- src/                         React + TypeScript desktop frontend
|  +- App.tsx                   App shell and composition root
|  +- components/               UI/domain components
|  +- lib/                      Frontend domain helpers and API wrappers
|  +- theme/                    Theme engine
+- src-tauri/                   Tauri/Rust backend
|  +- src/lib.rs                Tauri commands and app setup
|  +- src/notes.rs              Note filesystem IPC and path safety
|  +- src/blog_server.rs        Local blog HTTP routing/static serving
|  +- src/blog_content.rs       Local blog note content/API shaping
|  +- src/local_search.rs       Local index/search service
|  +- src/luogu*.rs             Luogu import and content-reader services
+- local-blog/                  Bundled local blog SPA
+- site/                        Astro public-site direction, not runtime local blog
+- shared/                      Shared helpers used by app/blog/site
+- docs/                        Current docs plus archive
+- notes/                       Local test/user notes; do not touch routinely
```

Frontend-to-Rust command calls must go through `src/lib/api.ts`. The matching
contract lives in `src/lib/apiContract.ts`, and `src/lib/apiBoundary.test.ts`
guards ordinary non-AI code from calling Tauri commands directly.

## Local Blog Model

The current local blog is not an Astro dev server. Runtime behavior is:

- Rust starts one `ProductionBlogServer` on `127.0.0.1:4321`.
- `open_blog` ensures that server is running and opens
  `http://127.0.0.1:4321/local-blog/`.
- Rust serves the bundled `local-blog/dist` assets and JSON APIs such as
  `/api/notes`, `/api/note`, and `/api/blog-config`.
- `local-blog/` owns the browser UI, routing, Markdown rendering, and
  ready-to-render view models.
- `site/` remains the Astro/GitHub Pages public-site direction. It should not
  be reintroduced as a runtime dependency of the desktop local blog.

## Current Engineering Rules

The current engineering pass is foundation-first, with AI behavior frozen.
Good foundation work is measured by stable ownership and focused tests, not by
line-count reduction.

Use these rules:

- Treat `src/App.tsx` as the app shell. It may own app-level state, API call
  ordering, toasts, confirm dialogs, modal shell behavior, and cross-domain
  orchestration.
- Move stable pure rules into focused owners such as `src/lib/noteWorkspace.ts`,
  `src/lib/blogConfig.ts`, `src/lib/localIndexStatus.ts`,
  `src/components/luogu/*`, `src/components/tag-manager/*`, and
  `local-blog/src/blogViewModel.ts`.
- Non-AI long-running frontend work should use `src/lib/taskStatus.ts` when
  that model fits.
- Do not simplify the two-layer path safety checks in `src-tauri/src/notes.rs`.
- Do not edit `src/components/settings/v2/settingsV2.css` as part of routine
  foundation cleanup.
- Do not touch `notes/**` unless the user explicitly asks.

See `docs/HANDOFF.md` and
`docs/architecture/foundation-engineering-rules.md` for the full current
handoff.

## Notes And Frontmatter

Notes are plain Markdown files with YAML frontmatter. Typical fields:

```yaml
---
title: ""
tags: []
difficulty: ""
source: ""
created: ISO8601
updated: ISO8601
summary: ""
draft: false
---
```

Luogu import can read this comment form from accepted C++ submissions:

```cpp
/* @oinb-insight
---
title: ...
tags: [...]
---
content here
*/
```

## Documentation Policy

Current operational docs live in:

- `docs/README.md`
- `docs/HANDOFF.md`
- `docs/architecture/**`
- `docs/release/**`

Historical PRDs, old execution plans, prior handoffs, and AI future-design
documents live under `docs/archive/**`. Archive documents are useful context,
but they are not authoritative for current implementation behavior.
