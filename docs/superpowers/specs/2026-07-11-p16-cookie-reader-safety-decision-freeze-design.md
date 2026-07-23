# P16 Cookie Reader Safety Decision Freeze Design

Date: 2026-07-11
Status: decision-ready
Scope: AI Agent Workbench upgrade / P16 Cookie reader safety decision freeze

## 1. Document Purpose

P16 follows HEAD `5d4d6c6 docs: record p15 cookie reader handoff`. Its input state is **Cookie-backed Reader Contract Preview** and its target output state is **Cookie Reader Safety Decision Preview**.

P16 is docs-only and decision-only. It prepares a bounded user decision for possible future authenticated reader work; it neither approves nor implements true Cookie access. P16 adds no real Cookie reader, browser Cookie extraction, Cookie storage or forwarding, provider/search transport, real network reader, durable storage, migration, mutation, execution, API/Tauri command, permission runtime or Workbench capability.

Until the user explicitly selects and approves an option, the effective policy remains: true Cookie-backed reading is blocked. Any implementation after P16 still requires explicit user approval before a worker may touch `src/**` or `src-tauri/**`.

## 2. Phase Identity And Inheritance

Phase name: **P16 Cookie Reader Safety Decision Freeze**

Input state: **Cookie-backed Reader Contract Preview**

Target output state: **Cookie Reader Safety Decision Preview**

P16 inherits these constraints:

- P14 **Execute / Code Runner Contract Preview** did not approve true execution, mutation, Cookie access or durable storage.
- P15 **Cookie-backed Reader Contract Preview** defined preview-only contracts, fixture projection, source-boundary metadata and redaction/audit summaries. It did not approve true authenticated reading.
- P15 defaults remain authoritative during P16: network access is absent, fixtures are the only readable source, sensitive values are excluded from provider/search/request-log/evidence/Workbench/storage projections, and API/Tauri is no-op.
- OI and Luogu are motivating source profiles. The core policy must remain provider-neutral and domain-configurable rather than becoming a Luogu-only protocol.

P16 advances only the safety-decision layer. It produces decision criteria, threat boundaries, audit requirements and exit gates for a later separately approved implementation phase.

## 3. Decision Surface

A future proposal must resolve every item below. An omitted item is a blocking gap, not an implicit permission.

### 3.1 Browser And Session Source

- Identify whether authenticated material may come from a user-pasted fixture, an explicitly imported authenticated document, an application-managed session, or a browser session.
- Name every supported acquisition mechanism and platform. Ambient discovery of browser profiles is forbidden by default.
- Never treat `displayOrigin`, a provider response, model output or search result as an executable fetch target.
- Bind any source reference to one user action, one domain policy and one purpose.

### 3.2 Consent Model And User-visible Controls

- Consent must state the exact domain, requested resource class, source mechanism, purpose, data leaving the device, retention period and revocation effect.
- Consent must be explicit, unbundled from general AI consent, and deny-by-default. A future real reader requires per-domain consent; broad wildcard or silent remembered consent is unacceptable.
- Controls must expose allow, deny, revoke, delete retained material, inspect safe audit history and stop an in-flight operation.
- Revocation must prevent new reads immediately and make the disposition of existing sanitized artifacts visible.

### 3.3 Domain Allowlist, Same-site And Origin Policy

- Use normalized HTTPS origins and an exact-domain allowlist. Wildcards, public suffixes, URL user-info and origin inferred from redirects are no-go by default.
- Redirects must be re-authorized against the allowlist. Cross-origin redirects must fail closed.
- Cookie attachment must follow host/domain, path, secure, expiry and same-site constraints; a reader must not broaden browser delivery rules.
- Subdomains require separate policy unless the approved entry explicitly enumerates them.

### 3.4 Storage And Retention

- The preferred design is no Cookie persistence: acquire only for the approved operation and keep values out of durable storage.
- Any exception must define encryption, OS credential-store ownership, retention TTL, deletion semantics, backup exclusion, crash-dump handling and migration/rollback behavior before implementation.
- Authenticated page bodies are sensitive. Raw bodies, secrets and headers must not be retained merely because a sanitized evidence record is useful.

### 3.5 Redaction And Audit

- Cookie, Authorization, API key, session token, anti-CSRF token, private note content, raw provider payload and raw tool output are secret classes.
- Audit records may retain opaque request/source IDs, normalized domain, policy version, consent decision, capability result, redaction classes, timestamps and safe failure codes. They must not retain secret values or raw authenticated bodies.
- Redaction occurs before request-log, evidence, Workbench, provider, search or storage projection. UI masking after retention is insufficient.
- Audit records must support consent, attempted-domain, redirect, redaction, deletion and rollback reviews without reconstructing credentials.

### 3.6 Provider And Search Isolation

- Cookie and authentication material must never be forwarded to a model provider or third-party search service.
- Under the narrow real-reader option, authenticated fetch and provider/search paths are separate trust zones. Provider/search receives only an explicitly sanitized, bounded derivative after policy checks.
- Search results cannot trigger authenticated requests. Model/tool output is intent only and cannot override consent, origin or redaction policy.

### 3.7 Request Log, Evidence And Workbench Boundaries

- Request logs retain safe metadata only, never request headers, Cookie values, authenticated raw bodies or replayable secrets.
- Evidence may contain bounded, sanitized facts with provenance and redaction markers. It may not be a covert raw-page archive.
- Workbench may show consent scope, normalized origin, policy status, redaction summary, safe excerpt, audit timeline and failure state. No raw-secret/raw-body view is approved.
- Copy, export and debug views must use the same sanitized projection rather than hidden raw payloads.

### 3.8 API / Tauri Boundary

- Any later frontend-to-Rust call must go through `src/lib/api.ts`; React and Workbench must not call Tauri directly.
- A future API must accept opaque references and policy decisions, not expose browser Cookie jars or secret values to the frontend.
- Tauri command allowlisting, platform permissions, browser integration, network client configuration, TLS, redirect handling and audit emission require separate implementation review.
- P16 adds no wrapper, command, permission manifest or platform integration.

### 3.9 Rollback And Migration Policy

- Rollback must disable the reader, revoke active grants, stop new reads and preserve only non-secret audit proof needed to explain the action.
- Schema migration must never copy raw Cookie values or authenticated payloads into a new store by default.
- Any migration requires dry-run inventory, versioned policy, failure recovery, deletion verification and user-visible consequences.
- A future implementation must prove downgrade behavior before enabling retention or background operation.

### 3.10 Failure States

Required safe states include `consent-required`, `denied`, `revoked`, `domain-blocked`, `origin-mismatch`, `redirect-blocked`, `source-unavailable`, `session-expired`, `redaction-failed`, `audit-failed`, `network-failed`, `rate-limited`, `unsupported` and `disabled-by-rollback`.

Failures must be bounded, non-retrying by default for consent/origin/redaction/audit failures, and must not fall back to provider/search forwarding, a broader domain, raw retention or an alternate browser profile.

## 4. Decision Matrix

No option is selected by this document. Option 1 remains the effective default until the user records an explicit decision. Options 2 and 3 describe maximum future envelopes, not current implementation approval.

| Option | Allowed surfaces | Forbidden surfaces | Primary risks | Required tests / audits | Exit criteria |
|---|---|---|---|---|---|
| **1. Keep true Cookie reading blocked** | Existing P15 fixture/manual/replay preview metadata; safe read-only UI summaries; no authenticated acquisition | Real Cookie access, browser extraction, authenticated network, secret storage/forwarding, raw views, API/Tauri capability | Product limitation; users manually supply sanitized context; fixtures may drift from real sites | Negative capability tests; source-boundary audit; no-network/no-browser/no-storage scan; truthful UI-copy review | User accepts blocked posture; P15 preview remains authoritative; no runtime work is scheduled |
| **2. Allow fixture/manual authenticated-source import only** | User deliberately imports a bounded document or fixture already separated from browser credentials; local pre-projection sanitization; per-import confirmation; safe evidence excerpt | Browser/session Cookie extraction, ambient profile discovery, automated authenticated fetch, Cookie storage, provider/search forwarding, raw body retention, background refresh | User may import secrets; spoofed provenance; oversized/private document; redaction gaps; stale authentication context | Malicious fixture corpus; size/type limits; provenance labeling; secret/redaction tests; import cancellation/deletion audit; provider/search/request-log/evidence/Workbench leak audit | User approves exact import formats and retention; threat review passes; safe deletion and sanitized-only projection are demonstrated in a later implementation plan |
| **3. Allow narrowly scoped real Cookie-backed reader behind explicit per-domain consent and no provider/search forwarding** | One enumerated HTTPS domain at a time; explicit per-domain/purpose consent; constrained authenticated fetch; exact origin/redirect enforcement; ephemeral auth material; sanitized bounded result and safe audit metadata | Wildcards, ambient extraction, cross-origin redirect, background browsing, provider/search Cookie or auth forwarding, raw secret/body views, durable Cookie storage by default, silent retry or consent reuse | Credential theft; confused deputy; CSRF/session abuse; malicious redirects; XSS/content injection; local compromise; privacy leakage; site ToS/account risk | Platform/browser integration review; origin/redirect/same-site tests; consent/revocation tests; secret-taint and egress tests; TLS/network tests; malicious content corpus; crash/log/storage forensics; rollback/migration drill; independent security audit | User explicitly selects option and domains; legal/product review is recorded where needed; no-go checks are clear; security audit passes; separate implementation spec/plan is approved before `src/**` or `src-tauri/**` changes |

## 5. Threat Model

### 5.1 Protected Assets

- Browser/session Cookie and other replayable credentials.
- Authenticated private page content and account metadata.
- User consent records, allowlists, request history and sanitized evidence.
- Local notes, provider credentials and application storage that must remain isolated from the reader.

### 5.2 Adversaries And Abuse Paths

- Malicious or compromised websites causing redirect, subdomain, same-site or content-injection confusion.
- Prompt/model/tool output attempting to turn display metadata into a fetch target or broaden consent.
- A compromised provider/search endpoint soliciting Cookie or authenticated content.
- Local malware, another OS user, logs, crash reports, backups or debug tools recovering secrets.
- Accidental user import of credentials, private content or an unbounded page archive.
- Stale grants, expired sessions, race conditions during revocation, or migrations resurrecting deleted material.

### 5.3 Required Controls

- Deny-by-default capability and exact-origin checks before secret acquisition.
- Per-domain consent, purpose binding, revocation and visible failure states.
- Taint tracking or equivalent proof that secret classes cannot cross provider/search/log/evidence/Workbench/storage egress boundaries.
- Bounded parsing, content-type/size limits, timeout and redirect limits, and no active-content execution.
- Sanitization before projection, safe audit metadata, deletion verification and rollback drills.

## 6. No-go Criteria

A future proposal must remain blocked if any of these is true:

- It cannot identify the exact credential source, origin, purpose and user consent at read time.
- It requires wildcard domains, ambient browser-profile discovery, silent consent reuse or cross-origin redirects.
- It sends Cookie, Authorization, session tokens or authenticated raw content to provider/search transport.
- It depends on raw secret/body retention in request logs, evidence, Workbench debug views, DB/FS storage, backups or crash logs.
- Redaction or audit failure permits the read to continue.
- Revocation, deletion, rollback or migration behavior is undefined or untestable.
- The reader can execute active page content, write files, apply patches, delete, rollback, execute runner, code runner or stress tester behavior.
- The design bypasses `src/lib/api.ts`, exposes secrets to React, or grants a broad Tauri/browser permission surface.
- Site policy, legal constraints or account-safety review rejects the proposed source profile.

## 7. Decision Packet And Recording Rule

The user decision must record:

- selected option number and rationale
- approved source mechanisms and enumerated domains
- consent lifetime and revocation model
- storage/retention ruling, including an explicit `none` where applicable
- provider/search isolation ruling
- request-log/evidence/Workbench projection ruling
- API/Tauri and platform permission ruling
- required audits, accountable reviewer and rollback trigger
- rejected alternatives and unresolved risks

Silence, a preview status or acceptance of this document is not selection of Option 2 or Option 3. If the decision is incomplete, Option 1 remains effective.

## 8. Explicit P16 No-op Boundary

P16 implements none of the following: real Cookie reader, browser Cookie extraction, Cookie storage, third-party Cookie forwarding, provider/search transport, real network reader, DB/FS durable storage, migration execution, patch/write/delete/rollback/execute/code runner/stress tester behavior, old AiSidebar migration, or raw payload retention.

P16 does not claim `production-ready`, `AI 大升级完成`, `L5 Agent 完成`, `Codex-style runtime 完成`, `ready: true` or `isReady: true`. Any matching phrase in this document is a forbidden claim, no-go criterion or negative-proof statement.

## 9. Acceptance Criteria

P16 is accepted only when:

- this design and its paired docs-only plan exist at the requested paths
- the phase, input and target output states are exact
- all decision-surface categories and the three-option matrix are present
- OI/Luogu is a motivating profile rather than a hard-coded core protocol
- threat, audit, failure, rollback, migration and no-go criteria are explicit
- the plan contains only documentation and acceptance tasks
- forbidden-capability search hits are decision, future-approval, no-go or negative-proof language only
- only the two P16 docs are staged and committed with the required commit message
- no push occurs

