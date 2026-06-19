# AI Upgrade Entry Criteria

The full AI assistant upgrade can begin after these foundation checks pass:

- [ ] Theme Engine remains stable through Settings manual smoke.
- [ ] Settings registry and search are in place.
- [ ] Luogu import rules and candidate domain logic are outside `App.tsx`.
- [ ] Search result helpers are outside `App.tsx`.
- [ ] Markdown document helpers are outside `App.tsx`.
- [ ] Long-task status model exists for frontend and Rust.
- [ ] `pnpm.cmd build` passes.
- [ ] Rust tests pass after Rust service changes.
- [ ] `notes/**` remains untouched by routine engineering work.

Initial AI upgrade target:

- Replace ad hoc assistant behavior with a planner/executor architecture inspired by Codex core capabilities.
- Keep Tavily as the primary future web search provider.
- Keep no-key search as auxiliary fallback only.
- Preserve Settings UI behavior while adding or reshaping AI configuration.

This document does not unlock AI work by itself. It defines the checks that should be true before the AI freeze boundary is lifted for a dedicated AI phase.
