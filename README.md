# OI Notebook

OI Notebook is a desktop workspace for OI learning, Markdown notes, and the NoteX AI assistant.

## Core Features

- Markdown note editing and preview
- NoteX AI assistant
- Web search and Research Engine
- OI and algorithm contest search optimization
- Luogu submission scanning and solution import
- Local blog preview
- Settings for themes, zoom, AI configuration, and related preferences

## v1.0

v1.0 is the first formally usable release. It is suitable for small-scope trial use, daily note workflows, and feedback before broader polish.

## Privacy And Network Use

Notes are saved locally by default.

When AI or web search features are used, OI Notebook may send the necessary question, context, or search keywords to the AI service or public search service configured by the user.

Do not include account passwords or private information in content that needs to be sent to AI services.

## Development Commands

```powershell
pnpm.cmd install
pnpm.cmd dev
pnpm.cmd build
pnpm.cmd tauri dev
pnpm.cmd tauri build
```

## Release Checks

```powershell
pnpm.cmd tsc --noEmit
pnpm.cmd build
pnpm.cmd --dir local-blog build
```
