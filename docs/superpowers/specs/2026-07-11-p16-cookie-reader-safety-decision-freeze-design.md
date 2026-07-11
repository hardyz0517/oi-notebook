# P16 Cookie Reader Safety Decision Freeze Design

Scope: AI Agent Workbench upgrade / P16 Cookie reader safety decision freeze

P16 follows P15, whose output state is **Cookie-backed Reader Contract Preview**. P16 is a docs-only and decision-only freeze. It does not approve, implement, mock as real, or imply production readiness for true Cookie access, browser Cookie extraction, Cookie storage, third-party Cookie forwarding, real network reading, durable storage, migration execution, mutation, execution, code runner, stress tester behavior, old AiSidebar migration, raw payload retention, production-ready autonomous Agent behavior or AI 大升级完成.

P16 target output state: **Cookie Reader Safety Decision Preview**.

The goal is to make the next user decision explicit before any future worker touches implementation files for true Cookie-backed reading. Until a later user-approved safety decision exists, true Cookie reader behavior remains blocked.

## 1. Phase Boundary

Phase name: **P16 Cookie Reader Safety Decision Freeze**

Input state: **Cookie-backed Reader Contract Preview**

Target output state: **Cookie Reader Safety Decision Preview**

P16 may define:

- decision options for future Cookie reader work
- threat model and no-go criteria
- consent, source, domain and origin policy requirements
- storage, retention, redaction and audit requirements
- provider/search/request-log/evidence/Workbench raw-view isolation requirements
- API/Tauri boundary requirements
- rollback and migration decision requirements
- user-visible controls and failure states

P16 may not define an approved implementation path that bypasses a later user decision. It may not touch `src/**`, `src-tauri/**`, `notes/**`, package, lock or config files.

## 2. Required Inherited Facts

P15 froze a preview-only Cookie-backed reader contract. Its allowed behavior is typed planning, fixture-only projection and Workbench read-only projection. It did not add Tauri commands, browser extraction code, Cookie storage, real network reader behavior, provider/search Cookie forwarding, DB/FS durable storage, migration execution, mutation, process execution, code runner or stress tester behavior.

P15 established these safety defaults:

- `networkPolicy` remains `none` for P15 preview sources.
- Cookie policy is `fixture-only`, `blocked`, `unsupported` or reserved for a later decision.
- Auth material may only appear as safe refs, redacted refs, blocked status, unsupported status or reserved future consent.
- Raw Cookie, Authorization, API key, session token, private note content, raw provider payload and raw tool output must not enter provider payloads, third-party search payloads, request logs, evidence payloads, Workbench raw views or durable storage.
- API/Tauri is no-op for Cookie access.

P16 must preserve those facts unless a later user decision explicitly opens a narrower scope after this safety decision phase is accepted.

## 3. Decision Surface

A future true Cookie-backed reader decision must answer every item below before implementation:

- Browser/session source: which browser/session store or manual source is in scope.
- Consent model: when consent is requested, how long it lasts, and how it is revoked.
- Domain allowlist: which domains are allowed, whether subdomains are included, and how redirects are handled.
- Same-site and origin policy: whether cross-origin, embedded, redirected or third-party contexts are rejected.
- Storage and retention: whether any data can be persisted, for how long, in what form, and how it is deleted.
- Redaction and audit: which classes are removed before every projection and what safe audit metadata remains.
- Provider/search isolation: whether provider and search requests are blocked from receiving Cookie-derived content.
- Request log and evidence boundaries: what safe summaries may be logged and what raw material is forbidden.
- Workbench raw-view boundary: whether a raw view exists; default is no raw Cookie-derived view.
- API/Tauri boundary: which commands are allowed or explicitly absent; default is no Tauri Cookie command.
- Rollback/migration policy: how implementation is disabled, reverted, migrated or cleaned up if consent changes.
- Threat model: token leakage, cross-domain leakage, overbroad provider forwarding, durable retention and UI mislabeling.
- User-visible controls: domain list, consent status, revoke action, blocked reasons and audit summary.
- Failure states: denied, blocked, unsupported, expired consent, domain mismatch, redaction failure and storage disabled.
- No-go criteria: conditions that keep true Cookie reading blocked.

## 4. Decision Matrix

### Option A: Keep True Cookie Reading Blocked

Allowed surfaces:

- P15 contract preview types
- fixture-only mock projection
- manual non-sensitive summaries
- Workbench read-only status showing blocked/unavailable reasons
- docs and audits

Forbidden surfaces:

- browser Cookie access
- Cookie storage or forwarding
- real network reader
- provider/search transport using Cookie-derived content
- raw request log, raw evidence, raw Workbench view or durable raw storage
- Tauri Cookie commands

Risks:

- authenticated pages still require manual user-provided safe summaries
- less automation for Luogu or other authenticated sources

Required tests and audits:

- no API/Tauri Cookie command audit
- no provider/search Cookie forwarding audit
- no storage or raw payload retention audit
- Workbench copy must say blocked or preview, not available

Exit criteria:

- user confirms true Cookie reading should remain blocked for this phase
- handoff records that implementation remains unavailable

### Option B: Allow Fixture Or Manual Authenticated-Source Import Only

Allowed surfaces:

- user-provided fixture or manual imported text after explicit local confirmation
- no browser Cookie extraction
- no Cookie storage
- safe source refs and redacted summaries
- Workbench read-only projection of sanitized fixture/manual content

Forbidden surfaces:

- automatic browser/session Cookie reading
- third-party Cookie forwarding
- real network reader using cookies
- durable raw content storage
- provider/search payload containing Cookie, Authorization, session token or private note content
- Tauri Cookie commands

Risks:

- user may paste sensitive material accidentally
- manual import can be mislabeled as real reader output
- fixture data may be retained if not explicitly redacted

Required tests and audits:

- manual import redaction tests for Cookie, Authorization, API key, session token, private note content, raw provider payload and raw tool output
- request-log and evidence audit proving raw input is not retained
- Workbench label audit proving this is manual/fixture import only
- API/Tauri no-op audit

Exit criteria:

- user approves manual/fixture-only import as the next implementation target
- implementation plan still forbids browser Cookie extraction and storage

### Option C: Narrow Real Cookie-Backed Reader With Per-Domain Consent

Allowed surfaces:

- one explicitly approved browser/session source
- per-domain consent with visible scope and expiry
- domain allowlist with redirect and subdomain policy
- local redaction gate before any projection
- safe metadata logs only
- Workbench read-only status and revoke controls
- API/Tauri commands only after a separate implementation spec and user approval

Forbidden surfaces:

- wildcard domain access
- third-party Cookie forwarding to provider/search
- raw Cookie or Authorization persistence
- raw Workbench view of Cookie-derived content
- cross-domain redirects unless explicitly allowed
- background reading without visible consent
- migration/storage changes without separate approval

Risks:

- credential leakage through logs, provider payloads, search payloads or UI
- overbroad domain matching
- stale consent or unclear revocation
- raw page content retained beyond user expectation
- platform-specific browser store behavior

Required tests and audits:

- domain allowlist and redirect tests
- consent grant, expiry and revoke tests
- redaction tests before provider/search/request-log/evidence/Workbench/storage
- API/Tauri boundary tests proving commands reject unapproved domains and redact outputs
- storage-retention audit; default is no durable raw storage
- failure-state tests for denied, blocked, unsupported, expired consent and redaction failure

Exit criteria:

- user explicitly selects this option
- a new implementation plan lists exact `src/**` and `src-tauri/**` files
- threat model and rollback plan are accepted before implementation

## 5. Threat Model

P16 treats these as primary threats:

- leaking Cookie, Authorization, API keys or session tokens into model provider payloads
- forwarding authenticated content into third-party search
- storing raw authenticated page content in request logs, evidence records, Workbench raw views or durable storage
- overbroad domain or origin matching
- automatic background reading without visible consent
- confusing fixture/manual import with true Cookie reading
- retaining stale consent after user revocation
- adding Tauri or browser APIs without a typed permission and audit boundary

Any future implementation must block the phase if these threats do not have tests and visible failure states.

## 6. No-Go Criteria

True Cookie reader implementation must remain blocked if any of these are true:

- no explicit user decision selecting an option
- no domain allowlist and redirect policy
- no consent revoke story
- no redaction proof before provider/search/log/evidence/Workbench/storage
- any raw Cookie, Authorization, API key, session token or private note content can be serialized into durable or third-party surfaces
- any UI claims production-ready, AI 大升级完成, L5 Agent 完成, Codex-style runtime 完成, `ready: true` or `isReady: true`
- implementation requires touching `src/**` or `src-tauri/**` before a separate approved implementation plan exists

## 7. OI And Luogu Scope

Luogu and OI workflows are motivating source profiles. They do not make the core reader contract Luogu-only. Any future authenticated-source work must keep the reader source model general enough for multiple domains while allowing OI-specific read models to consume safe evidence.

## 8. P16 Exit Criteria

P16 is accepted when:

- this safety decision spec exists
- the paired implementation plan exists
- the docs state the target output state **Cookie Reader Safety Decision Preview**
- the decision matrix covers blocked, fixture/manual-only and narrow real-reader options
- audits show no production-readiness or implementation approval language outside forbidden/future-decision wording
- no `src/**`, `src-tauri/**`, `notes/**`, package, lock or config files are changed

