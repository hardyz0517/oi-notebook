# P9 Provider Model Adapter Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement P9 as a mock-only `Provider/Model Adapter Contract Preview` with typed request envelopes, adapter interfaces, deterministic fixtures, stream-event normalization, error taxonomy, permission/redaction guards, and read-only Workbench projection.

**Architecture:** P9 builds on P8 session/replay contracts. Runtime owns provider/model contract decisions, mock adapter lifecycle, redaction, permission, cancellation, and normalized events; Workbench consumes read models only. No task connects a real provider, reads API keys, builds real prompts, streams live output, writes files, applies patches, executes code, reads cookies, persists sessions, or writes request logs.

**Tech Stack:** TypeScript, Vitest, React read-only Workbench components, existing `src/lib/agent-runtime/**`, `src/lib/agent-workbench/**`, `src/components/agent-workbench/**`.

---

## 0. Phase Boundary

Phase name: **P9 Provider / Model Adapter Contract Freeze**

Input state: **Agent Session/Replay Contract Preview**

Output state: **Provider/Model Adapter Contract Preview**

Required reading:

- `AGENTS.md`
- `docs/NoteX_Agent_Workbench_PRD.md`
- `docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md`
- `docs/superpowers/specs/2026-07-05-p5-agent-core-contract-freeze-design.md`
- `docs/superpowers/specs/2026-07-05-p6-tool-permission-contract-freeze-design.md`
- `docs/superpowers/specs/2026-07-06-p7-oi-research-solution-skill-contract-freeze-design.md`
- `docs/superpowers/specs/2026-07-06-p8-agent-session-replay-contract-freeze-design.md`
- `docs/superpowers/plans/2026-07-06-p8-agent-session-replay-contract.md`
- `docs/agent-workbench/handoff-p4.md`
- `docs/superpowers/specs/2026-07-07-p9-provider-model-adapter-contract-freeze-design.md`
- `docs/superpowers/plans/2026-07-07-p9-provider-model-adapter-contract.md`

Global forbidden zones:

- Do not modify `notes/**`.
- Do not modify `src/components/ai/**`.
- Do not connect provider/network/SDK calls.
- Do not read API keys or secrets.
- Do not build real prompts.
- Do not implement a real model loop or live streaming.
- Do not implement write, patch apply, execute, code runner, delete, rollback, Cookie-backed reader, session persistence, storage, or request log.
- Do not bypass `src/lib/api.ts`.
- Do not use `git add .`, `git add -A`, or `git commit -a`.

## File Structure

- Create: `src/lib/agent-runtime/providerModelTypes.ts` for request envelope, capability matrix, stream events, error taxonomy, policy metadata, and read-model-safe summaries.
- Create: `src/lib/agent-runtime/providerModelTypes.test.ts` for contract type and literal-status tests.
- Create: `src/lib/agent-runtime/providerModelAdapter.ts` for adapter interface, mock fixture type, deterministic mock adapter factory, cancellation preview, and error mapping helpers.
- Create: `src/lib/agent-runtime/providerModelAdapter.test.ts` for mock adapter, no-network, cancellation, rate-limit/retry metadata, and negative-proof tests.
- Create: `src/lib/agent-runtime/providerModelPolicy.ts` for redaction and permission checks.
- Create: `src/lib/agent-runtime/providerModelPolicy.test.ts` for secret/cookie/local-note/request-payload rejection tests.
- Create: `src/lib/agent-workbench/providerModelViewModel.ts` for read-only Workbench projection.
- Create: `src/lib/agent-workbench/providerModelViewModel.test.ts` for projection tests.
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.ts` only to attach a P9 mock provider/model preview read model.
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.test.ts` only to assert preview projection and unavailable live capabilities.
- Create: `src/components/agent-workbench/ProviderModelPreviewPanel.tsx` for read-only display.
- Modify: `src/components/agent-workbench/AgentWorkbenchShell.tsx` only to render the read-only panel from the view model.
- Optional modify: `docs/agent-workbench/handoff-p4.md` only in Task 5 to record P9 closeout.

## Task 0: Baseline / Scope Audit

**Files:**
- Read-only: `AGENTS.md`
- Read-only: all required docs listed in section 0
- Read-only: `src/lib/agent-runtime/**`
- Read-only: `src/lib/agent-workbench/**`
- Read-only: `src/components/agent-workbench/**`

- [ ] **Step 1: Record startup state**

Run:

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -12 --decorate
```

Expected: filtered status is clean or unrelated existing changes are explicitly named and left untouched; staged paths are empty. If staged paths are not empty, stop and report.

- [ ] **Step 2: Confirm P9 source docs**

Run:

```powershell
rg -n 'P9 Provider / Model Adapter|Provider/Model Adapter Contract Preview|Agent Session/Replay Contract Preview' docs/superpowers/specs/2026-07-07-p9-provider-model-adapter-contract-freeze-design.md docs/superpowers/plans/2026-07-07-p9-provider-model-adapter-contract.md docs/agent-workbench/handoff-p4.md
rg -n 'real provider request|prompt construction|model loop|streaming|Cookie-backed reader|session persistence' docs/superpowers/specs/2026-07-07-p9-provider-model-adapter-contract-freeze-design.md
```

Expected: P9 spec and plan are present; P8 output state is named; P9 forbidden capabilities are explicitly listed.

- [ ] **Step 3: No commit**

Do not stage or commit anything for Task 0.

## Task 1: Provider / Model Contract Types

**Files:**
- Create: `src/lib/agent-runtime/providerModelTypes.ts`
- Create: `src/lib/agent-runtime/providerModelTypes.test.ts`

- [ ] **Step 1: Write failing contract tests**

Create `src/lib/agent-runtime/providerModelTypes.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import type {
  ModelCapabilityMatrix,
  ProviderModelRequestEnvelope,
  ProviderModelStreamEvent,
  ProviderModelError,
} from "./providerModelTypes";

describe("P9 provider/model contract types", () => {
  it("records a provider/model request envelope without carrying secrets", () => {
    const envelope = {
      requestId: "request:p9:1",
      sessionId: "session:p8",
      turnId: "turn:p9:1",
      workspaceId: "workspace:p3379",
      providerProfileId: "provider:mock",
      modelProfileId: "model:mock-reasoner",
      intent: "explain-code",
      inputParts: [
        {
          partId: "part:1",
          kind: "user-text",
          text: "Explain this function.",
          redaction: { classification: "user-input", visibility: "ui-visible", redactionStrategy: "none", reason: "synthetic_fixture" },
        },
      ],
      toolExposure: [],
      evidenceRefs: [{ evidenceId: "E1", role: "derived-evidence" }],
      privacyPolicyId: "privacy:p9-preview",
      permissionDecision: { status: "unavailable", reason: "provider_request_not_enabled_in_p9" },
      capabilitySnapshot: {
        providerRequest: { status: "unavailable", reason: "provider_request_not_enabled_in_p9" },
        streaming: { status: "unavailable", reason: "streaming_not_enabled_in_p9" },
        toolCalling: { status: "reserved", reason: "tool_calling_contract_only" },
      },
      idempotencyKey: "idem:p9:1",
      createdAt: "2026-07-07T00:00:00.000Z",
    } satisfies ProviderModelRequestEnvelope;

    expect(envelope.permissionDecision.status).toBe("unavailable");
    expect(JSON.stringify(envelope)).not.toContain("sk-");
  });

  it("keeps model capabilities as explicit preview statuses", () => {
    const matrix = {
      modelProfileId: "model:mock-reasoner",
      providerProfileId: "provider:mock",
      toolCalling: { status: "reserved", reason: "tool_calling_contract_only" },
      structuredOutput: { status: "preview", reason: "fixture_schema_only" },
      streaming: { status: "unavailable", reason: "streaming_not_enabled_in_p9" },
      longContext: { status: "reserved", reason: "long_context_contract_only" },
      visionInput: { status: "unavailable", reason: "vision_not_in_p9" },
      codeReasoning: { status: "preview", reason: "synthetic_fixture_label" },
      costTier: "unknown",
      latencyTier: "unknown",
      stabilityTier: "unknown",
      contextWindow: null,
      maxOutputTokens: null,
      limitations: ["mock_adapter_only", "no_live_provider_request"],
    } satisfies ModelCapabilityMatrix;

    expect(matrix.streaming.status).toBe("unavailable");
    expect(matrix.limitations).toContain("mock_adapter_only");
  });

  it("normalizes stream events and errors without exposing raw provider payloads", () => {
    const event = {
      type: "model.delta.preview",
      requestId: "request:p9:1",
      sequence: 1,
      at: "2026-07-07T00:00:01.000Z",
      text: "Synthetic preview delta.",
    } satisfies ProviderModelStreamEvent;

    const error = {
      code: "provider-permission-blocked",
      message: "Provider request is not enabled in P9.",
      retryable: false,
      permissionRelated: true,
      redactionRelated: false,
      safeDetail: "P9 contract preview blocks live provider calls.",
    } satisfies ProviderModelError;

    expect(event.type).toBe("model.delta.preview");
    expect(error.code).toBe("provider-permission-blocked");
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/providerModelTypes.test.ts
```

Expected: FAIL because `providerModelTypes.ts` does not exist.

- [ ] **Step 3: Add contract types**

Create `src/lib/agent-runtime/providerModelTypes.ts`:

```typescript
import type { AgentReplayRedaction } from "./agentTypes";

export type ProviderModelCapabilityStatus = "preview" | "reserved" | "unavailable" | "blocked" | "degraded";

export type ProviderModelCapability = {
  status: ProviderModelCapabilityStatus;
  reason: string;
};

export type ProviderModelPermissionDecision = {
  status: "auto-allowed" | "prompt-required" | "denied" | "blocked-by-configuration" | "unavailable" | "degraded-fallback";
  reason: string;
};

export type ProviderModelInputPart = {
  partId: string;
  kind: "user-text" | "system-instruction-preview" | "evidence-ref" | "workspace-summary";
  text?: string;
  evidenceId?: string;
  redaction: AgentReplayRedaction;
};

export type ProviderModelEvidenceRef = {
  evidenceId: string;
  role: "problem-statement" | "algorithm-reference" | "local-note" | "derived-evidence" | "unknown";
};

export type ProviderModelRequestEnvelope = {
  requestId: string;
  sessionId: string;
  turnId: string;
  workspaceId: string;
  providerProfileId: string;
  modelProfileId: string;
  intent: "explain-code" | "research" | "debug-preview" | "write-preview" | "general";
  inputParts: ProviderModelInputPart[];
  toolExposure: string[];
  evidenceRefs: ProviderModelEvidenceRef[];
  privacyPolicyId: string;
  permissionDecision: ProviderModelPermissionDecision;
  capabilitySnapshot: {
    providerRequest: ProviderModelCapability;
    streaming: ProviderModelCapability;
    toolCalling: ProviderModelCapability;
  };
  idempotencyKey: string;
  createdAt: string;
};

export type ModelCapabilityMatrix = {
  modelProfileId: string;
  providerProfileId: string;
  toolCalling: ProviderModelCapability;
  structuredOutput: ProviderModelCapability;
  streaming: ProviderModelCapability;
  longContext: ProviderModelCapability;
  visionInput: ProviderModelCapability;
  codeReasoning: ProviderModelCapability;
  costTier: "unknown" | "low" | "medium" | "high";
  latencyTier: "unknown" | "low" | "medium" | "high";
  stabilityTier: "unknown" | "low" | "medium" | "high";
  contextWindow: number | null;
  maxOutputTokens: number | null;
  limitations: string[];
};

export type ProviderModelStreamEvent =
  | { type: "provider.request.created"; requestId: string; sequence: number; at: string }
  | { type: "provider.permission.checked"; requestId: string; sequence: number; at: string; decision: ProviderModelPermissionDecision }
  | { type: "provider.redaction.checked"; requestId: string; sequence: number; at: string; blocked: boolean }
  | { type: "model.turn.started"; requestId: string; sequence: number; at: string }
  | { type: "model.delta.preview"; requestId: string; sequence: number; at: string; text: string }
  | { type: "model.tool-call.requested.preview"; requestId: string; sequence: number; at: string; toolName: string }
  | { type: "model.usage.preview"; requestId: string; sequence: number; at: string; inputTokens: number; outputTokens: number }
  | { type: "model.turn.completed.preview"; requestId: string; sequence: number; at: string }
  | { type: "model.turn.failed.preview"; requestId: string; sequence: number; at: string; error: ProviderModelError }
  | { type: "model.turn.cancelled.preview"; requestId: string; sequence: number; at: string; reason: string }
  | { type: "provider.rate-limit.preview"; requestId: string; sequence: number; at: string; retryAfterMs: number }
  | { type: "provider.retry.scheduled.preview"; requestId: string; sequence: number; at: string; attempt: number; delayMs: number };

export type ProviderModelErrorCode =
  | "provider-auth-unavailable"
  | "provider-network-unavailable"
  | "provider-rate-limited"
  | "provider-quota-exhausted"
  | "provider-timeout"
  | "provider-schema-mismatch"
  | "provider-unsupported-capability"
  | "provider-cancelled"
  | "provider-redaction-blocked"
  | "provider-permission-blocked"
  | "provider-fixture-invalid"
  | "provider-unexpected-event";

export type ProviderModelError = {
  code: ProviderModelErrorCode;
  message: string;
  retryable: boolean;
  permissionRelated: boolean;
  redactionRelated: boolean;
  safeDetail: string;
};
```

- [ ] **Step 4: Run GREEN**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/providerModelTypes.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: contract tests and typecheck pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git status --short -- . ":(exclude)notes/**"
git add -- src/lib/agent-runtime/providerModelTypes.ts src/lib/agent-runtime/providerModelTypes.test.ts
git diff --cached --name-only
git commit -m "feat: define p9 provider model contracts"
```

Expected staged paths: only the two listed P9 type files.

## Task 2: Adapter Interface + Mock Fixture

**Files:**
- Create: `src/lib/agent-runtime/providerModelAdapter.ts`
- Create: `src/lib/agent-runtime/providerModelAdapter.test.ts`

- [ ] **Step 1: Write failing mock adapter tests**

Create `src/lib/agent-runtime/providerModelAdapter.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

import { createMockProviderModelAdapter, mapProviderModelError } from "./providerModelAdapter";
import type { ProviderModelRequestEnvelope } from "./providerModelTypes";

const request: ProviderModelRequestEnvelope = {
  requestId: "request:p9:1",
  sessionId: "session:p8",
  turnId: "turn:p9:1",
  workspaceId: "workspace:p3379",
  providerProfileId: "provider:mock",
  modelProfileId: "model:mock-reasoner",
  intent: "general",
  inputParts: [],
  toolExposure: [],
  evidenceRefs: [],
  privacyPolicyId: "privacy:p9-preview",
  permissionDecision: { status: "unavailable", reason: "provider_request_not_enabled_in_p9" },
  capabilitySnapshot: {
    providerRequest: { status: "unavailable", reason: "provider_request_not_enabled_in_p9" },
    streaming: { status: "unavailable", reason: "streaming_not_enabled_in_p9" },
    toolCalling: { status: "reserved", reason: "tool_calling_contract_only" },
  },
  idempotencyKey: "idem:p9:1",
  createdAt: "2026-07-07T00:00:00.000Z",
};

describe("P9 mock provider/model adapter", () => {
  it("returns deterministic fixture events without network calls", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const adapter = createMockProviderModelAdapter({
      adapterId: "adapter:mock",
      events: [
        { type: "model.turn.started", requestId: "request:p9:1", sequence: 1, at: "2026-07-07T00:00:01.000Z" },
        { type: "model.delta.preview", requestId: "request:p9:1", sequence: 2, at: "2026-07-07T00:00:02.000Z", text: "Synthetic only." },
        { type: "model.turn.completed.preview", requestId: "request:p9:1", sequence: 3, at: "2026-07-07T00:00:03.000Z" },
      ],
    });

    expect(adapter.describeCapabilities().providerRequest.status).toBe("unavailable");
    expect(adapter.createMockTurn(request)).toHaveLength(3);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("maps cancellation as a preview terminal event", () => {
    const adapter = createMockProviderModelAdapter({ adapterId: "adapter:mock", events: [] });
    expect(adapter.cancel("request:p9:1")).toEqual({
      type: "model.turn.cancelled.preview",
      requestId: "request:p9:1",
      sequence: 1,
      at: "2026-07-07T00:00:00.000Z",
      reason: "cancelled_by_runtime_preview",
    });
  });

  it("normalizes unknown provider errors", () => {
    expect(mapProviderModelError(new Error("raw secret-bearing error")).code).toBe("provider-unexpected-event");
    expect(mapProviderModelError("permission").permissionRelated).toBe(false);
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/providerModelAdapter.test.ts
```

Expected: FAIL because `providerModelAdapter.ts` does not exist.

- [ ] **Step 3: Implement deterministic mock adapter**

Create `src/lib/agent-runtime/providerModelAdapter.ts`:

```typescript
import type {
  ProviderModelCapability,
  ProviderModelError,
  ProviderModelRequestEnvelope,
  ProviderModelStreamEvent,
} from "./providerModelTypes";

export type ProviderModelAdapterCapabilities = {
  providerRequest: ProviderModelCapability;
  streaming: ProviderModelCapability;
  toolCalling: ProviderModelCapability;
};

export type ProviderModelAdapter = {
  adapterId: string;
  providerKind: "mock";
  supports(request: ProviderModelRequestEnvelope): boolean;
  createMockTurn(request: ProviderModelRequestEnvelope): ProviderModelStreamEvent[];
  mapProviderEvent(event: ProviderModelStreamEvent): ProviderModelStreamEvent;
  mapProviderError(error: unknown): ProviderModelError;
  cancel(requestId: string): ProviderModelStreamEvent;
  describeCapabilities(): ProviderModelAdapterCapabilities;
};

export function mapProviderModelError(error: unknown): ProviderModelError {
  if (typeof error === "object" && error && "code" in error && (error as { code?: unknown }).code === "provider-permission-blocked") {
    return {
      code: "provider-permission-blocked",
      message: "Provider request is blocked by policy.",
      retryable: false,
      permissionRelated: true,
      redactionRelated: false,
      safeDetail: "Policy blocked provider request before any network call.",
    };
  }

  return {
    code: "provider-unexpected-event",
    message: "Provider event could not be normalized.",
    retryable: false,
    permissionRelated: false,
    redactionRelated: false,
    safeDetail: "P9 mock adapter hides raw provider details.",
  };
}

export function createMockProviderModelAdapter(input: {
  adapterId: string;
  events: ProviderModelStreamEvent[];
}): ProviderModelAdapter {
  return {
    adapterId: input.adapterId,
    providerKind: "mock",
    supports: (request) => request.providerProfileId === "provider:mock",
    createMockTurn: () => input.events.map((event) => ({ ...event })),
    mapProviderEvent: (event) => ({ ...event }),
    mapProviderError: mapProviderModelError,
    cancel: (requestId) => ({
      type: "model.turn.cancelled.preview",
      requestId,
      sequence: 1,
      at: "2026-07-07T00:00:00.000Z",
      reason: "cancelled_by_runtime_preview",
    }),
    describeCapabilities: () => ({
      providerRequest: { status: "unavailable", reason: "provider_request_not_enabled_in_p9" },
      streaming: { status: "unavailable", reason: "streaming_not_enabled_in_p9" },
      toolCalling: { status: "reserved", reason: "tool_calling_contract_only" },
    }),
  };
}
```

- [ ] **Step 4: Run GREEN**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/providerModelAdapter.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: adapter tests, agent-runtime suite, and typecheck pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add -- src/lib/agent-runtime/providerModelAdapter.ts src/lib/agent-runtime/providerModelAdapter.test.ts
git diff --cached --name-only
git commit -m "feat: add p9 mock provider adapter"
```

Expected staged paths: only the two listed adapter files.

## Task 3: Runtime Event Projection / Policy Guards

**Files:**
- Create: `src/lib/agent-runtime/providerModelPolicy.ts`
- Create: `src/lib/agent-runtime/providerModelPolicy.test.ts`
- Modify: `src/lib/agent-runtime/providerModelAdapter.ts`
- Modify: `src/lib/agent-runtime/providerModelAdapter.test.ts`

- [ ] **Step 1: Write failing redaction and permission tests**

Create `src/lib/agent-runtime/providerModelPolicy.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { checkProviderModelPermission, validateProviderModelRedaction } from "./providerModelPolicy";
import type { ProviderModelRequestEnvelope } from "./providerModelTypes";

const baseRequest = {
  requestId: "request:p9:1",
  sessionId: "session:p8",
  turnId: "turn:p9:1",
  workspaceId: "workspace:p3379",
  providerProfileId: "provider:mock",
  modelProfileId: "model:mock-reasoner",
  intent: "general",
  inputParts: [],
  toolExposure: [],
  evidenceRefs: [],
  privacyPolicyId: "privacy:p9-preview",
  permissionDecision: { status: "unavailable", reason: "provider_request_not_enabled_in_p9" },
  capabilitySnapshot: {
    providerRequest: { status: "unavailable", reason: "provider_request_not_enabled_in_p9" },
    streaming: { status: "unavailable", reason: "streaming_not_enabled_in_p9" },
    toolCalling: { status: "reserved", reason: "tool_calling_contract_only" },
  },
  idempotencyKey: "idem:p9:1",
  createdAt: "2026-07-07T00:00:00.000Z",
} satisfies ProviderModelRequestEnvelope;

describe("P9 provider/model policy guards", () => {
  it("blocks provider requests in P9", () => {
    expect(checkProviderModelPermission(baseRequest)).toEqual({
      status: "unavailable",
      reason: "provider_request_not_enabled_in_p9",
    });
  });

  it("rejects secret and cookie parts before provider exposure", () => {
    const request = {
      ...baseRequest,
      inputParts: [
        {
          partId: "part:secret",
          kind: "user-text",
          text: "synthetic secret",
          redaction: { classification: "secret", visibility: "forbidden-for-model", redactionStrategy: "drop", reason: "secret_never_enters_provider" },
        },
        {
          partId: "part:cookie",
          kind: "user-text",
          text: "synthetic cookie",
          redaction: { classification: "cookie", visibility: "forbidden-for-third-party", redactionStrategy: "drop", reason: "cookie_never_enters_provider" },
        },
      ],
    } satisfies ProviderModelRequestEnvelope;

    expect(validateProviderModelRedaction(request)).toEqual({
      blocked: true,
      reasons: ["secret_never_enters_provider", "cookie_never_enters_provider"],
    });
  });

  it("allows synthetic user text with visible redaction metadata", () => {
    const request = {
      ...baseRequest,
      inputParts: [
        {
          partId: "part:user",
          kind: "user-text",
          text: "Synthetic question.",
          redaction: { classification: "user-input", visibility: "ui-visible", redactionStrategy: "none", reason: "synthetic_fixture" },
        },
      ],
    } satisfies ProviderModelRequestEnvelope;

    expect(validateProviderModelRedaction(request)).toEqual({ blocked: false, reasons: [] });
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/providerModelPolicy.test.ts
```

Expected: FAIL because `providerModelPolicy.ts` does not exist.

- [ ] **Step 3: Implement policy guards**

Create `src/lib/agent-runtime/providerModelPolicy.ts`:

```typescript
import type { ProviderModelPermissionDecision, ProviderModelRequestEnvelope } from "./providerModelTypes";

export type ProviderModelRedactionResult = {
  blocked: boolean;
  reasons: string[];
};

export function checkProviderModelPermission(_request: ProviderModelRequestEnvelope): ProviderModelPermissionDecision {
  return {
    status: "unavailable",
    reason: "provider_request_not_enabled_in_p9",
  };
}

export function validateProviderModelRedaction(request: ProviderModelRequestEnvelope): ProviderModelRedactionResult {
  const reasons = request.inputParts
    .filter((part) => part.redaction.visibility === "forbidden-for-model" || part.redaction.visibility === "forbidden-for-third-party")
    .map((part) => part.redaction.reason);

  return {
    blocked: reasons.length > 0,
    reasons,
  };
}
```

- [ ] **Step 4: Project policy checks into adapter preview events**

In `src/lib/agent-runtime/providerModelAdapter.ts`, import policy helpers:

```typescript
import { checkProviderModelPermission, validateProviderModelRedaction } from "./providerModelPolicy";
```

Change `createMockTurn` to prepend policy events:

```typescript
    createMockTurn: (request) => {
      const decision = checkProviderModelPermission(request);
      const redaction = validateProviderModelRedaction(request);
      return [
        { type: "provider.permission.checked", requestId: request.requestId, sequence: 1, at: "2026-07-07T00:00:00.000Z", decision },
        { type: "provider.redaction.checked", requestId: request.requestId, sequence: 2, at: "2026-07-07T00:00:00.000Z", blocked: redaction.blocked },
        ...input.events.map((event, index) => ({ ...event, sequence: index + 3 })),
      ];
    },
```

Update `src/lib/agent-runtime/providerModelAdapter.test.ts` expected length from `3` to `5` and assert:

```typescript
expect(adapter.createMockTurn(request)[0]?.type).toBe("provider.permission.checked");
expect(adapter.createMockTurn(request)[1]?.type).toBe("provider.redaction.checked");
```

- [ ] **Step 5: Run GREEN**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/providerModelPolicy.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/providerModelAdapter.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: policy tests, adapter tests, agent-runtime suite, and typecheck pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add -- src/lib/agent-runtime/providerModelPolicy.ts src/lib/agent-runtime/providerModelPolicy.test.ts src/lib/agent-runtime/providerModelAdapter.ts src/lib/agent-runtime/providerModelAdapter.test.ts
git diff --cached --name-only
git commit -m "feat: guard p9 provider model requests"
```

Expected staged paths: only the four listed runtime provider/model files.

## Task 4: Workbench Read-Only Projection

**Files:**
- Create: `src/lib/agent-workbench/providerModelViewModel.ts`
- Create: `src/lib/agent-workbench/providerModelViewModel.test.ts`
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.ts`
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.test.ts`
- Create: `src/components/agent-workbench/ProviderModelPreviewPanel.tsx`
- Modify: `src/components/agent-workbench/AgentWorkbenchShell.tsx`

- [ ] **Step 1: Write failing view-model tests**

Create `src/lib/agent-workbench/providerModelViewModel.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { createProviderModelViewModel } from "./providerModelViewModel";

describe("createProviderModelViewModel", () => {
  it("projects mock provider/model events into a read-only Workbench model", () => {
    const model = createProviderModelViewModel({
      requestId: "request:p9:1",
      providerProfileId: "provider:mock",
      modelProfileId: "model:mock-reasoner",
      outputState: "Provider/Model Adapter Contract Preview",
      events: [
        { type: "provider.permission.checked", requestId: "request:p9:1", sequence: 1, at: "2026-07-07T00:00:00.000Z", decision: { status: "unavailable", reason: "provider_request_not_enabled_in_p9" } },
        { type: "model.delta.preview", requestId: "request:p9:1", sequence: 2, at: "2026-07-07T00:00:01.000Z", text: "Synthetic only." },
      ],
      capabilities: {
        providerRequest: { status: "unavailable", reason: "provider_request_not_enabled_in_p9" },
        streaming: { status: "unavailable", reason: "streaming_not_enabled_in_p9" },
        toolCalling: { status: "reserved", reason: "tool_calling_contract_only" },
      },
      limitations: ["mock_adapter_only", "no_live_provider_request"],
    });

    expect(model.title).toBe("Provider/Model Adapter Contract Preview");
    expect(model.eventCount).toBe(2);
    expect(model.providerRequestStatus.status).toBe("unavailable");
    expect(model.previewText).toBe("Synthetic only.");
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench/providerModelViewModel.test.ts
```

Expected: FAIL because `providerModelViewModel.ts` does not exist.

- [ ] **Step 3: Implement read-only view model**

Create `src/lib/agent-workbench/providerModelViewModel.ts`:

```typescript
import type { ProviderModelAdapterCapabilities } from "@/lib/agent-runtime/providerModelAdapter";
import type { ProviderModelStreamEvent } from "@/lib/agent-runtime/providerModelTypes";

export type ProviderModelProjectionInput = {
  requestId: string;
  providerProfileId: string;
  modelProfileId: string;
  outputState: "Provider/Model Adapter Contract Preview";
  events: ProviderModelStreamEvent[];
  capabilities: ProviderModelAdapterCapabilities;
  limitations: string[];
};

export type ProviderModelViewModel = {
  title: "Provider/Model Adapter Contract Preview";
  requestId: string;
  providerProfileId: string;
  modelProfileId: string;
  eventCount: number;
  providerRequestStatus: ProviderModelAdapterCapabilities["providerRequest"];
  streamingStatus: ProviderModelAdapterCapabilities["streaming"];
  toolCallingStatus: ProviderModelAdapterCapabilities["toolCalling"];
  previewText: string;
  limitations: string[];
};

export function createProviderModelViewModel(input: ProviderModelProjectionInput): ProviderModelViewModel {
  const previewText = input.events
    .filter((event): event is Extract<ProviderModelStreamEvent, { type: "model.delta.preview" }> => event.type === "model.delta.preview")
    .map((event) => event.text)
    .join("");

  return {
    title: input.outputState,
    requestId: input.requestId,
    providerProfileId: input.providerProfileId,
    modelProfileId: input.modelProfileId,
    eventCount: input.events.length,
    providerRequestStatus: input.capabilities.providerRequest,
    streamingStatus: input.capabilities.streaming,
    toolCallingStatus: input.capabilities.toolCalling,
    previewText,
    limitations: input.limitations,
  };
}
```

- [ ] **Step 4: Attach P9 preview to Workbench task flow**

In `src/lib/agent-workbench/workbenchTaskFlow.ts`, import:

```typescript
import { createMockProviderModelAdapter } from "@/lib/agent-runtime/providerModelAdapter";
import type { ProviderModelRequestEnvelope } from "@/lib/agent-runtime/providerModelTypes";
import { createProviderModelViewModel, type ProviderModelViewModel } from "./providerModelViewModel";
```

Add to `ManualWorkbenchTaskResult`:

```typescript
  providerModelPreview: ProviderModelViewModel;
```

After P8 session replay creation, build a synthetic request and projection:

```typescript
  const providerModelRequest: ProviderModelRequestEnvelope = {
    requestId: `request:${workspace.id}:p9`,
    sessionId: sessionMetadata.sessionId,
    turnId: `turn:${workspace.id}:p9`,
    workspaceId: workspace.id,
    providerProfileId: "provider:mock",
    modelProfileId: "model:mock-reasoner",
    intent: "general",
    inputParts: [],
    toolExposure: [],
    evidenceRefs: evidenceItems.map((item) => ({ evidenceId: item.id, role: "derived-evidence" })),
    privacyPolicyId: "privacy:p9-preview",
    permissionDecision: { status: "unavailable", reason: "provider_request_not_enabled_in_p9" },
    capabilitySnapshot: {
      providerRequest: { status: "unavailable", reason: "provider_request_not_enabled_in_p9" },
      streaming: { status: "unavailable", reason: "streaming_not_enabled_in_p9" },
      toolCalling: { status: "reserved", reason: "tool_calling_contract_only" },
    },
    idempotencyKey: `idem:${workspace.id}:p9`,
    createdAt: "2026-07-07T00:00:00.000Z",
  };
  const providerModelAdapter = createMockProviderModelAdapter({
    adapterId: "adapter:p9-mock",
    events: [
      {
        type: "model.delta.preview",
        requestId: providerModelRequest.requestId,
        sequence: 1,
        at: "2026-07-07T00:00:01.000Z",
        text: "Provider/model adapter preview uses deterministic mock events only.",
      },
    ],
  });
  const providerModelEvents = providerModelAdapter.createMockTurn(providerModelRequest);
  const providerModelPreview = createProviderModelViewModel({
    requestId: providerModelRequest.requestId,
    providerProfileId: providerModelRequest.providerProfileId,
    modelProfileId: providerModelRequest.modelProfileId,
    outputState: "Provider/Model Adapter Contract Preview",
    events: providerModelEvents,
    capabilities: providerModelAdapter.describeCapabilities(),
    limitations: ["mock_adapter_only", "no_live_provider_request", "no_prompt_construction"],
  });
```

Return `providerModelPreview`.

In `src/lib/agent-workbench/workbenchTaskFlow.test.ts`, assert:

```typescript
expect(result.providerModelPreview.title).toBe("Provider/Model Adapter Contract Preview");
expect(result.providerModelPreview.providerRequestStatus.status).toBe("unavailable");
expect(result.providerModelPreview.limitations).toContain("no_live_provider_request");
```

- [ ] **Step 5: Add read-only UI panel**

Create `src/components/agent-workbench/ProviderModelPreviewPanel.tsx`:

```tsx
import type { ProviderModelViewModel } from "@/lib/agent-workbench/providerModelViewModel";

const formatCapability = (status: string) => status.replace(/-/g, " ");

export function ProviderModelPreviewPanel({ preview }: { preview: ProviderModelViewModel | null }) {
  return (
    <section className="grid gap-3 border border-border/70 bg-background p-3">
      <header className="grid gap-1">
        <div className="text-xs font-medium text-foreground">Provider/model adapter</div>
        <div className="text-[11px] text-muted-foreground">
          {preview ? `${preview.providerProfileId} / ${preview.modelProfileId}` : "No provider/model preview captured."}
        </div>
      </header>
      {preview ? (
        <div className="grid gap-2 text-[11px] text-muted-foreground">
          <div title={preview.providerRequestStatus.reason}>Provider request: {formatCapability(preview.providerRequestStatus.status)}</div>
          <div title={preview.streamingStatus.reason}>Streaming: {formatCapability(preview.streamingStatus.status)}</div>
          <div title={preview.toolCallingStatus.reason}>Tool calling: {formatCapability(preview.toolCallingStatus.status)}</div>
          <div>Fixture events: {preview.eventCount}</div>
          <div>Preview text: {preview.previewText}</div>
          <div>Limitations: {preview.limitations.join(", ")}</div>
        </div>
      ) : null}
    </section>
  );
}
```

In `src/components/agent-workbench/AgentWorkbenchShell.tsx`, import and render the panel:

```typescript
import type { ProviderModelViewModel } from "@/lib/agent-workbench/providerModelViewModel";
import { ProviderModelPreviewPanel } from "./ProviderModelPreviewPanel";
```

Add state:

```typescript
const [currentProviderModelPreview, setCurrentProviderModelPreview] = useState<ProviderModelViewModel | null>(null);
```

After task result:

```typescript
setCurrentProviderModelPreview(result.providerModelPreview);
```

Render:

```tsx
<ProviderModelPreviewPanel preview={currentProviderModelPreview} />
```

- [ ] **Step 6: Run GREEN**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench/providerModelViewModel.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: Workbench projection tests, agent-workbench suite, agent-runtime suite, and typecheck pass.

- [ ] **Step 7: Commit**

Run:

```powershell
git add -- src/lib/agent-workbench/providerModelViewModel.ts src/lib/agent-workbench/providerModelViewModel.test.ts src/lib/agent-workbench/workbenchTaskFlow.ts src/lib/agent-workbench/workbenchTaskFlow.test.ts src/components/agent-workbench/ProviderModelPreviewPanel.tsx src/components/agent-workbench/AgentWorkbenchShell.tsx
git diff --cached --name-only
git commit -m "feat: project p9 provider model preview"
```

Expected staged paths: only the six listed Workbench/component files.

## Task 5: Boundary Audit + Handoff

**Files:**
- Modify: `docs/agent-workbench/handoff-p4.md`
- Optional modify: focused P9 test files only when an audit literal must be rewritten without weakening coverage

- [ ] **Step 1: Run focused verification**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: all focused suites and typecheck pass.

- [ ] **Step 2: Run no-network / no-secret / no-boundary audits**

Run:

```powershell
rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'
rg -n 'fetch\(|XMLHttpRequest|EventSource|WebSocket|Authorization|apiKey|api_key|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-[A-Za-z0-9]' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench
rg -n 'chat_with_current_note_stream|prompt construction|request log|session storage|Cookie-backed|patch apply|execute runner' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench
rg -n 'providerRequest:\s*\{\s*status:\s*"preview"|streaming:\s*\{\s*status:\s*"preview"' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

Expected: API boundary audit is no-hit. Network/secret audit is no-hit except possible test spy text that must be explained and scoped. Capability audit must not show live provider request or streaming marked preview.

- [ ] **Step 3: Append P9 handoff**

Append to `docs/agent-workbench/handoff-p4.md`:

```markdown
## P9 Provider / Model Adapter Contract Freeze handoff

P9 输出状态：**Provider/Model Adapter Contract Preview**。本阶段冻结 provider/model request envelope、adapter interface、mock fixture、stream event contract、error taxonomy、capability matrix、cancellation/rate-limit/retry metadata、redaction/permission policy 和 Workbench read-only projection，不代表真实 provider request、真实 streaming、prompt construction、model loop、API key handling、request log、write、patch apply、execute、Cookie-backed reader 或 persistence 可用。

P9 已冻结 / 已合入：

- Provider/model request envelope：记录 request/session/turn/workspace/provider/model/evidence/privacy/permission/capability metadata。
- Adapter interface：仅 mock adapter，使用 deterministic fixture events，不使用网络、SDK、Tauri、环境变量或 API key。
- Stream event contract：`*.preview` 事件只表示 fixture projection，不表示 live streaming。
- Error taxonomy：auth/network/rate-limit/quota/timeout/schema/unsupported/cancel/redaction/permission/fixture errors 映射为 safe error。
- Capability matrix：真实 provider request、streaming、tool calling 等能力保持 unavailable/reserved/blocked/degraded，不冒充 live capability。
- Redaction/permission guards：secret、cookie、真实 note content 和未经批准 payload 不进入 provider/model request。
- Workbench projection：UI 只读展示 provider/model preview view model，不选择 provider，不拼 prompt，不触发 provider request。

P9 仍禁止 / 未实现：

- 真实 provider request、真实 streaming、prompt construction、model loop。
- API key handling、secret storage、request log、session storage/persistence。
- write、patch apply、execute、code runner、delete、rollback。
- Cookie-backed reader。
- 旧 `src/components/ai/AiSidebar.tsx` 迁移。
- 绕过 `src/lib/api.ts`、直接 Tauri invoke、修改或读取真实 `notes/**` 参与 routine engineering work。

最终验证记录：

- 逐条记录 Step 1 和 Step 2 实际执行的命令、PASS/FAIL 结果、test file count、test count；未执行的命令不得写入本节。
- API boundary audit：记录 no-hit 或 changed-surface scoped result。
- Network/secret/provider audit：记录 no-hit 或解释测试中的 scoped literal。
- Capability audit：记录没有将 live provider request / live streaming 标为 preview-ready。

下一阶段必须新写 freeze spec，才能讨论 live provider request、live streaming、prompt construction、model loop、provider settings migration、API key handling、request log persistence、patch workflow、tool execution runner、Cookie-backed reader 或 session persistence/storage。
```

- [ ] **Step 4: Commit handoff**

Run:

```powershell
git add -- docs/agent-workbench/handoff-p4.md
git diff --cached --name-only
git commit -m "docs: record p9 provider model handoff"
```

Expected staged paths: only `docs/agent-workbench/handoff-p4.md`, unless a focused audit-literal cleanup was required and reported.

## Task 6: Supervisor Final Acceptance

**Files:**
- Read-only in supervisor checkout

- [ ] **Step 1: Verify repository state**

Run:

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -12 --decorate
```

Expected: main checkout is clean, staged paths are empty, and P9 implementation/handoff commits are present.

- [ ] **Step 2: Re-run acceptance commands**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench
node .\node_modules\typescript\bin\tsc --noEmit
rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'
rg -n 'fetch\(|XMLHttpRequest|EventSource|WebSocket|Authorization|apiKey|api_key|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-[A-Za-z0-9]' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench
rg -n 'chat_with_current_note_stream|prompt construction|request log|session storage|Cookie-backed|patch apply|execute runner' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench
rg -n 'providerRequest:\s*\{\s*status:\s*"preview"|streaming:\s*\{\s*status:\s*"preview"' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench
```

Expected: tests and typecheck pass; audits are no-hit or have scoped negative-proof explanations.

- [ ] **Step 3: Report supervisor acceptance**

Supervisor report must include:

```text
Verdict:
P9 output state:
Merged commits:
Changed files by slice:
Verification commands and results:
No-hit audit results:
Remaining forbidden capabilities:
Final filtered status:
Final staged paths:
Push status:
```

No commit is required for Task 6 unless the supervisor explicitly requests a separate closeout doc.

## Plan Self-Review

- Spec coverage: Tasks cover request envelope, adapter interface, mock fixture, stream event contract, error taxonomy, capability matrix, cancellation, rate-limit/retry metadata, redaction/permission policy, read-only projection, audit, handoff, and supervisor acceptance.
- Placeholder scan: every task has concrete files, commands, expected results, staging paths, and commit messages.
- Type consistency: `ProviderModelRequestEnvelope`, `ModelCapabilityMatrix`, `ProviderModelStreamEvent`, `ProviderModelError`, `ProviderModelAdapter`, `ProviderModelViewModel`, and `Provider/Model Adapter Contract Preview` names are consistent across tasks.
- Scope control: no task opens live provider request, live streaming, prompt construction, real model loop, API key handling, write, patch apply, execute, Cookie reader, storage, request log, old AiSidebar migration, or `notes/**`.
- Verification: each implementation slice starts with RED, ends with focused GREEN, typecheck, exact-path staging, commit-only, and changed-surface audits.
