# Archive

This folder keeps historical documents that are useful for context but are not
authoritative for current implementation work.

Use current docs first:

- `../../PROJECT.md`
- `../README.md`
- `../HANDOFF.md`
- `../architecture/**`
- `../release/**`

Archived documents may mention old assumptions, unfinished phase plans, or
implementation paths that have since changed. In particular, older product
docs may describe an Astro dev server as the local blog runtime. The current
runtime local blog is Rust `ProductionBlogServer` plus the bundled
`local-blog` SPA.

Archive categories:

- `product/`: historical product and UI planning documents.
- `ai/`: AI/search/research-engine plans and audits. AI behavior is currently
  frozen unless the user explicitly starts AI work.
- `handoff/`: older handoff/status snapshots.
- `superpowers/`: generated specs and implementation plans from earlier
  agent workflows.
