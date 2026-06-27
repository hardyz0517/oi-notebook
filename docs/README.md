# Documentation Map

This directory separates current project guidance from historical planning
material. Prefer the current docs first; use archive documents only when you
need design history.

## Current Docs

Read these for active work:

- `../PROJECT.md`: short current project overview, commands, architecture, and
  local-blog model.
- `HANDOFF.md`: current engineering state, guardrails, domain owners, and
  verification baseline.
- `architecture/foundation-engineering-rules.md`: foundation-first engineering
  rules for non-AI cleanup.
- `architecture/ai-freeze-boundary.md`: what is frozen during foundation work.
- `architecture/ai-upgrade-entry-criteria.md`: conditions before starting AI
  upgrade work.
- `architecture/non-ai-foundation-audit.md`: latest non-AI architecture audit.
- `release/foundation-checklist.md`: smoke checklist for foundation releases.

## Archive

`archive/**` contains historical material:

- `archive/product/**`: old product PRDs, local-blog design plans, UI plans,
  and preview guides.
- `archive/ai/**`: AI/search/research-engine plans and audits that are not
  active while AI is frozen.
- `archive/handoff/**`: older handoff/status snapshots.
- `archive/superpowers/**`: generated implementation plans and specs from
  earlier work.

Archive documents may describe old implementation details such as an Astro dev
server for local preview, old phase plans, or future AI designs. When archive
content conflicts with `PROJECT.md`, `HANDOFF.md`, or `architecture/**`, the
current docs win.

## Maintenance Rules

- Keep `PROJECT.md` short and factual.
- Keep `HANDOFF.md` focused on current engineering rules and active owners.
- Move long completed plans and obsolete PRDs to `archive/**` instead of
  deleting them.
- Add a short note or link from current docs when an archived document remains
  useful for historical context.
