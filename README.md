# OI Notebook

OI Notebook is a desktop workspace for OI learning, Markdown notes, and the NoteX AI assistant.

## Core Features

- Markdown note editing and preview
- NoteX AI assistant
- Web search and Research Engine
- OI and algorithm contest search optimization
- Luogu problem statements, solutions, and discussion reading
- Luogu submission scanning and solution import
- Local blog preview
- Theme, zoom, and AI provider configuration

## Download And Installation

For v1.0.0, the recommended Windows installer is available from GitHub Releases:

- `oi-notebook_1.0.0_x64-setup.exe`

The MSI installer and standalone executable are also provided as fallback artifacts.

## First Use

1. Open OI Notebook.
2. Create or select a notes directory.
3. Configure an AI Provider and API Key if you want to use NoteX or AI features.
4. Configure Luogu Cookie / login information only if you want to use Luogu-related features.
5. Start writing Markdown notes or use NoteX from the workspace.

## Privacy And Network Use

Notes are saved locally by default.

When AI or web search features are used, OI Notebook may send the necessary question, context, or search keywords to the AI service or public search service configured by the user.

Luogu Cookie values are used only for user-configured Luogu features. OI Notebook does not read browser cookies or system login state.

Do not put account passwords, private keys, cookies, or private notes into content that you do not want sent to AI or external services.

## Development Commands

```powershell
pnpm.cmd install
pnpm.cmd dev
pnpm.cmd build
pnpm.cmd --dir local-blog build
pnpm.cmd tauri dev
pnpm.cmd tauri build
```

## Release Checks

```powershell
pnpm.cmd tsc --noEmit
pnpm.cmd build
pnpm.cmd --dir local-blog build
cargo check --manifest-path .\src-tauri\Cargo.toml
```

## License

MIT
