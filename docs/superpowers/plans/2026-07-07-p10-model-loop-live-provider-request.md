# P10 Model Loop Live Provider Request Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement P10 as `Live Provider Request / One-Turn Model Step Contract Preview`: a gated live provider request path, runtime-owned one-turn model step, stream event projection, cancel/retry/audit contract, and read-only Workbench projection.

**Architecture:** P10 builds on P9 provider/model contracts. Runtime owns context building, permission, redaction, provider request lifecycle, cancellation, retry, event emission, and redacted audit snapshots; Tauri owns secret lookup and live network transport; Workbench consumes read models only. P10 does not implement multi-step autonomous model loop, tool-call execution, write, patch apply, execute/code runner, Cookie-backed reader, durable request log, session persistence, or legacy AiSidebar migration.

**Tech Stack:** TypeScript, Vitest, React read-only Workbench components, Tauri/Rust command boundary, existing `src/lib/api.ts`, `src/lib/agent-runtime/**`, `src/lib/agent-workbench/**`, `src/components/agent-workbench/**`, `src-tauri/src/**`.

---

## 0. Phase Boundary

Phase name: **P10 Model Loop / Live Provider Request Contract Freeze**

Input state: **Provider/Model Adapter Contract Preview**

Output state: **Live Provider Request / One-Turn Model Step Contract Preview**

Required reading:

- `AGENTS.md`
- `docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md`
- `docs/NoteX_Agent_Workbench_PRD.md`
- `docs/agent-workbench/handoff-p4.md`
- `docs/superpowers/specs/2026-07-07-p9-provider-model-adapter-contract-freeze-design.md`
- `docs/superpowers/plans/2026-07-07-p9-provider-model-adapter-contract.md`
- `docs/superpowers/specs/2026-07-07-p10-model-loop-live-provider-request-freeze-design.md`
- `docs/superpowers/plans/2026-07-07-p10-model-loop-live-provider-request.md`

Global forbidden zones:

- Do not modify `notes/**`.
- Do not modify `src/components/ai/**`.
- Do not implement write, patch apply, execute, code runner, delete, rollback, Cookie-backed reader, session persistence, durable request log, or legacy AiSidebar migration.
- Do not let React components build prompts or call provider APIs.
- Do not expose API keys, Authorization headers, cookies, or raw provider payloads to frontend state, fixtures, logs, read models, or tests.
- Do not bypass `src/lib/api.ts`.
- Do not use `git add .`, `git add -A`, or `git commit -a`.
- Push only if supervisor explicitly asks.

## File Structure

- Modify: `src/lib/agent-runtime/providerModelTypes.ts` for P10 live request metadata, live stream events, request audit snapshot, and one-turn model step status.
- Modify: `src/lib/agent-runtime/providerModelTypes.test.ts` for contract literals and negative-proof assertions.
- Create: `src/lib/agent-runtime/providerContextBuilder.ts` for structured context build output.
- Create: `src/lib/agent-runtime/providerContextBuilder.test.ts` for context builder RED/GREEN tests.
- Create: `src/lib/agent-runtime/providerPromptAssembler.ts` for runtime-only provider payload assembly from structured parts.
- Create: `src/lib/agent-runtime/providerPromptAssembler.test.ts` for no-secret/no-UI-prompt tests.
- Create: `src/lib/agent-runtime/liveProviderPolicy.ts` for permission/redaction/live gate composition.
- Create: `src/lib/agent-runtime/liveProviderPolicy.test.ts` for blocked and allowed-gate tests.
- Create: `src/lib/agent-runtime/liveModelStep.ts` for one-turn lifecycle orchestration over injected transport.
- Create: `src/lib/agent-runtime/liveModelStep.test.ts` for RED/GREEN stream, cancel, retry, and error mapping tests.
- Modify: `src/lib/agent-runtime/providerModelAdapter.ts` for live adapter interface shape while preserving mock adapter.
- Modify: `src/lib/agent-runtime/providerModelAdapter.test.ts` for mock unchanged and live adapter boundary tests.
- Modify: `src/lib/api.ts` and `src/lib/apiContract.ts` for safe provider request wrapper.
- Create or modify minimal `src-tauri/src/**` provider request command files as approved by the current Rust module layout.
- Modify: `src/lib/agent-workbench/providerModelViewModel.ts` and test for live one-turn projection.
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.ts` and test only to attach P10 projection when runtime reports it.
- Modify: `src/components/agent-workbench/ProviderModelPreviewPanel.tsx` and `AgentWorkbenchShell.tsx` only for read-only status display.
- Modify: `docs/agent-workbench/handoff-p4.md` only in closeout task.

## Task 0: Baseline / Scope Audit

**Files:**
- Read-only: required docs
- Read-only: `src/lib/agent-runtime/**`
- Read-only: `src/lib/agent-workbench/**`
- Read-only: `src/components/agent-workbench/**`
- Read-only: `src/lib/api.ts`
- Read-only: `src/lib/apiContract.ts`
- Read-only: relevant `src-tauri/src/**` files

- [ ] **Step 1: Record startup state**

Run:

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -12 --decorate
```

Expected: filtered status is clean or unrelated existing changes are explicitly named and left untouched; staged paths are empty. If staged paths are not empty, stop and report.

- [ ] **Step 2: Confirm P10 source docs**

Run:

```powershell
rg -n 'P10 Model Loop|Live Provider Request / One-Turn Model Step Contract Preview|Provider/Model Adapter Contract Preview|be33f80bc65159c094ecd06bf155afa3061ce23d' docs/superpowers/specs/2026-07-07-p10-model-loop-live-provider-request-freeze-design.md docs/superpowers/plans/2026-07-07-p10-model-loop-live-provider-request.md docs/agent-workbench/handoff-p4.md
rg -n 'write|patch apply|execute/code runner|Cookie-backed reader|AiSidebar|session persistence|request log persistence' docs/superpowers/specs/2026-07-07-p10-model-loop-live-provider-request-freeze-design.md
```

Expected: P10 docs are present; P9 input state and P10 output state are named; forbidden capabilities are explicitly listed.

- [ ] **Step 3: No commit**

Do not stage or commit anything for Task 0.

## Task 1: P10 Live Contract Types

**Files:**
- Modify: `src/lib/agent-runtime/providerModelTypes.ts`
- Modify: `src/lib/agent-runtime/providerModelTypes.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests to `src/lib/agent-runtime/providerModelTypes.test.ts`:

```typescript
import type {
  ProviderModelLiveRequestMetadata,
  ProviderModelRequestAuditSnapshot,
  ProviderModelStreamEvent,
} from "./providerModelTypes";

it("records P10 live request metadata without a frontend secret", () => {
  const metadata = {
    transport: "tauri-provider-request",
    requestMode: "live-one-turn",
    contextBuildId: "context:p10:1",
    redactionDecisionId: "redaction:p10:1",
    permissionDecisionId: "permission:p10:1",
    secretRef: "secret-ref:provider:mock",
    requestLogPolicyId: "request-log:p10-redacted-memory",
    streamPolicyId: "stream:p10-live",
    abortControllerId: "abort:p10:1",
    retryPolicyId: "retry:p10:bounded",
  } satisfies ProviderModelLiveRequestMetadata;

  expect(JSON.stringify(metadata)).not.toContain("sk-");
  expect(metadata.requestMode).toBe("live-one-turn");
});

it("normalizes live model stream events separately from preview events", () => {
  const event = {
    type: "model.delta.live",
    requestId: "request:p10:1",
    sequence: 1,
    at: "2026-07-07T00:00:00.000Z",
    text: "Live delta routed through the safe provider boundary.",
  } satisfies ProviderModelStreamEvent;

  expect(event.type).toBe("model.delta.live");
});

it("keeps request audit snapshots redacted and in-memory only", () => {
  const snapshot = {
    requestId: "request:p10:1",
    sessionId: "session:p10:1",
    turnId: "turn:p10:1",
    workspaceId: "workspace:p10:1",
    providerProfileId: "provider:openai-compatible",
    modelProfileId: "model:gated",
    permissionStatus: "prompt-required",
    redactionBlocked: false,
    eventCount: 3,
    retryAttempts: 0,
    cancelled: false,
    safePromptSummary: "1 user part, 0 secret parts, 0 cookie parts",
    storage: "memory-only",
  } satisfies ProviderModelRequestAuditSnapshot;

  expect(snapshot.storage).toBe("memory-only");
  expect(JSON.stringify(snapshot)).not.toContain("Authorization");
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/providerModelTypes.test.ts
```

Expected: FAIL because P10 live metadata and live event types do not exist yet.

- [ ] **Step 3: Implement minimal types**

In `src/lib/agent-runtime/providerModelTypes.ts`, add:

```typescript
export type ProviderModelLiveRequestMetadata = {
  transport: "tauri-provider-request";
  requestMode: "live-one-turn";
  contextBuildId: string;
  redactionDecisionId: string;
  permissionDecisionId: string;
  secretRef: string;
  requestLogPolicyId: string;
  streamPolicyId: string;
  abortControllerId: string;
  retryPolicyId: string;
};

export type ProviderModelRequestAuditSnapshot = {
  requestId: string;
  sessionId: string;
  turnId: string;
  workspaceId: string;
  providerProfileId: string;
  modelProfileId: string;
  permissionStatus: ProviderModelPermissionDecision["status"];
  redactionBlocked: boolean;
  eventCount: number;
  retryAttempts: number;
  cancelled: boolean;
  safePromptSummary: string;
  storage: "memory-only";
};
```

Extend `ProviderModelStreamEvent` with:

```typescript
  | { type: "provider.request.started"; requestId: string; sequence: number; at: string }
  | { type: "provider.request.failed"; requestId: string; sequence: number; at: string; error: ProviderModelError }
  | { type: "provider.request.cancelled"; requestId: string; sequence: number; at: string; reason: string }
  | { type: "model.delta.live"; requestId: string; sequence: number; at: string; text: string }
  | { type: "model.usage.live"; requestId: string; sequence: number; at: string; inputTokens: number; outputTokens: number }
  | { type: "model.turn.completed.live"; requestId: string; sequence: number; at: string }
  | { type: "model.turn.failed.live"; requestId: string; sequence: number; at: string; error: ProviderModelError }
  | { type: "model.turn.cancelled.live"; requestId: string; sequence: number; at: string; reason: string }
```

- [ ] **Step 4: Run GREEN**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/providerModelTypes.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: tests and typecheck pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git status --short -- . ":(exclude)notes/**"
git add -- src/lib/agent-runtime/providerModelTypes.ts src/lib/agent-runtime/providerModelTypes.test.ts
git diff --cached --name-only
git commit -m "feat: define p10 live provider contracts"
```

Expected staged paths: only the two listed files.

## Task 2: Context Builder And Prompt Assembler Contract

**Files:**
- Create: `src/lib/agent-runtime/providerContextBuilder.ts`
- Create: `src/lib/agent-runtime/providerContextBuilder.test.ts`
- Create: `src/lib/agent-runtime/providerPromptAssembler.ts`
- Create: `src/lib/agent-runtime/providerPromptAssembler.test.ts`

- [ ] **Step 1: Write failing ContextBuilder tests**

Create `src/lib/agent-runtime/providerContextBuilder.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { buildProviderContext } from "./providerContextBuilder";

describe("buildProviderContext", () => {
  it("builds general-purpose context parts without making the provider layer OI-only", () => {
    const context = buildProviderContext({
      sessionId: "session:p10:1",
      turnId: "turn:p10:1",
      workspaceId: "workspace:p10:1",
      taskIntent: "general",
      userText: "Explain this note.",
      evidenceRefs: [{ evidenceId: "E1", role: "derived-evidence" }],
    });

    expect(context.contextBuildId).toContain("context:");
    expect(context.taskIntent).toBe("general");
    expect(context.inputParts[0]?.kind).toBe("user-text");
    expect(context.evidenceRefs).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run ContextBuilder RED**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/providerContextBuilder.test.ts
```

Expected: FAIL because `providerContextBuilder.ts` does not exist.

- [ ] **Step 3: Implement ContextBuilder**

Create `src/lib/agent-runtime/providerContextBuilder.ts`:

```typescript
import type { ProviderModelEvidenceRef, ProviderModelInputPart } from "./providerModelTypes";

export type ProviderContextBuildInput = {
  sessionId: string;
  turnId: string;
  workspaceId: string;
  taskIntent: "general" | "research" | "explain-code" | "debug-preview" | "write-preview";
  userText: string;
  evidenceRefs: ProviderModelEvidenceRef[];
};

export type ProviderContextBuildResult = {
  contextBuildId: string;
  sessionId: string;
  turnId: string;
  workspaceId: string;
  taskIntent: ProviderContextBuildInput["taskIntent"];
  inputParts: ProviderModelInputPart[];
  evidenceRefs: ProviderModelEvidenceRef[];
  tokenBudget: { maxInputTokens: number; maxOutputTokens: number };
  permissionNeeds: string[];
};

export function buildProviderContext(input: ProviderContextBuildInput): ProviderContextBuildResult {
  return {
    contextBuildId: `context:${input.sessionId}:${input.turnId}`,
    sessionId: input.sessionId,
    turnId: input.turnId,
    workspaceId: input.workspaceId,
    taskIntent: input.taskIntent,
    inputParts: [
      {
        partId: "part:user:1",
        kind: "user-text",
        text: input.userText,
        redaction: { classification: "user-input", visibility: "ui-visible", redactionStrategy: "none", reason: "user_text_allowed" },
      },
    ],
    evidenceRefs: input.evidenceRefs,
    tokenBudget: { maxInputTokens: 8000, maxOutputTokens: 1200 },
    permissionNeeds: ["provider-request"],
  };
}
```

- [ ] **Step 4: Write failing PromptAssembler tests**

Create `src/lib/agent-runtime/providerPromptAssembler.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { assembleProviderPayload } from "./providerPromptAssembler";

describe("assembleProviderPayload", () => {
  it("assembles a safe provider payload summary without secrets", () => {
    const payload = assembleProviderPayload({
      contextBuildId: "context:p10:1",
      modelProfileId: "model:gated",
      inputParts: [
        {
          partId: "part:user:1",
          kind: "user-text",
          text: "Explain this.",
          redaction: { classification: "user-input", visibility: "ui-visible", redactionStrategy: "none", reason: "allowed" },
        },
      ],
      stream: true,
    });

    expect(payload.providerPayloadShape).toBe("openai-compatible-chat");
    expect(payload.safePromptSummary).toBe("1 input parts, 0 blocked parts");
    expect(JSON.stringify(payload)).not.toContain("sk-");
  });

  it("blocks forbidden model parts before transport", () => {
    expect(() =>
      assembleProviderPayload({
        contextBuildId: "context:p10:blocked",
        modelProfileId: "model:gated",
        inputParts: [
          {
            partId: "part:secret",
            kind: "user-text",
            text: "secret text",
            redaction: { classification: "secret", visibility: "forbidden-for-model", redactionStrategy: "drop", reason: "secret_blocked" },
          },
        ],
        stream: true,
      }),
    ).toThrow("provider_payload_redaction_blocked");
  });
});
```

- [ ] **Step 5: Run PromptAssembler RED**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/providerPromptAssembler.test.ts
```

Expected: FAIL because `providerPromptAssembler.ts` does not exist.

- [ ] **Step 6: Implement PromptAssembler**

Create `src/lib/agent-runtime/providerPromptAssembler.ts`:

```typescript
import type { ProviderModelInputPart } from "./providerModelTypes";

export type ProviderPayloadAssemblyInput = {
  contextBuildId: string;
  modelProfileId: string;
  inputParts: ProviderModelInputPart[];
  stream: boolean;
};

export type ProviderPayloadAssembly = {
  contextBuildId: string;
  providerPayloadShape: "openai-compatible-chat";
  messagesOrInput: Array<{ role: "user"; content: string }>;
  modelProfileId: string;
  stream: boolean;
  safePromptSummary: string;
};

export function assembleProviderPayload(input: ProviderPayloadAssemblyInput): ProviderPayloadAssembly {
  const blocked = input.inputParts.filter((part) => part.redaction.visibility === "forbidden-for-model");
  if (blocked.length > 0) {
    throw new Error("provider_payload_redaction_blocked");
  }

  return {
    contextBuildId: input.contextBuildId,
    providerPayloadShape: "openai-compatible-chat",
    messagesOrInput: input.inputParts
      .filter((part) => part.text)
      .map((part) => ({ role: "user", content: part.text ?? "" })),
    modelProfileId: input.modelProfileId,
    stream: input.stream,
    safePromptSummary: `${input.inputParts.length} input parts, ${blocked.length} blocked parts`,
  };
}
```

- [ ] **Step 7: Run GREEN**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/providerContextBuilder.test.ts src/lib/agent-runtime/providerPromptAssembler.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: ContextBuilder, PromptAssembler, and typecheck pass.

- [ ] **Step 8: Commit**

Run:

```powershell
git add -- src/lib/agent-runtime/providerContextBuilder.ts src/lib/agent-runtime/providerContextBuilder.test.ts src/lib/agent-runtime/providerPromptAssembler.ts src/lib/agent-runtime/providerPromptAssembler.test.ts
git diff --cached --name-only
git commit -m "feat: add p10 provider context builder"
```

Expected staged paths: only the four listed files.

## Task 3: Live Permission / Redaction Gate

**Files:**
- Create: `src/lib/agent-runtime/liveProviderPolicy.ts`
- Create: `src/lib/agent-runtime/liveProviderPolicy.test.ts`
- Modify: `src/lib/agent-runtime/providerModelPolicy.ts`
- Modify: `src/lib/agent-runtime/providerModelPolicy.test.ts`

- [ ] **Step 1: Write failing gate tests**

Create `src/lib/agent-runtime/liveProviderPolicy.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { decideLiveProviderGate } from "./liveProviderPolicy";
import type { ProviderModelRequestEnvelope } from "./providerModelTypes";

const baseRequest: ProviderModelRequestEnvelope = {
  requestId: "request:p10:1",
  sessionId: "session:p10:1",
  turnId: "turn:p10:1",
  workspaceId: "workspace:p10:1",
  providerProfileId: "provider:openai-compatible",
  modelProfileId: "model:gated",
  intent: "general",
  inputParts: [],
  toolExposure: [],
  evidenceRefs: [],
  privacyPolicyId: "privacy:p10-live",
  permissionDecision: { status: "prompt-required", reason: "live_provider_requires_user_approval" },
  capabilitySnapshot: {
    providerRequest: { status: "preview", reason: "p10_live_gate" },
    streaming: { status: "preview", reason: "p10_live_gate" },
    toolCalling: { status: "reserved", reason: "future_phase" },
  },
  idempotencyKey: "idem:p10:1",
  createdAt: "2026-07-07T00:00:00.000Z",
};

describe("decideLiveProviderGate", () => {
  it("allows live request only after permission and redaction pass", () => {
    expect(decideLiveProviderGate({ request: baseRequest, userApproved: true }).allowed).toBe(true);
  });

  it("blocks unapproved provider requests", () => {
    const decision = decideLiveProviderGate({ request: baseRequest, userApproved: false });
    expect(decision.allowed).toBe(false);
    expect(decision.error.code).toBe("provider-permission-blocked");
  });

  it("blocks forbidden redaction parts", () => {
    const decision = decideLiveProviderGate({
      request: {
        ...baseRequest,
        inputParts: [
          {
            partId: "part:cookie",
            kind: "user-text",
            text: "cookie text",
            redaction: { classification: "cookie", visibility: "forbidden-for-model", redactionStrategy: "drop", reason: "cookie_blocked" },
          },
        ],
      },
      userApproved: true,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.error.code).toBe("provider-redaction-blocked");
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/liveProviderPolicy.test.ts
```

Expected: FAIL because `liveProviderPolicy.ts` does not exist.

- [ ] **Step 3: Implement live gate**

Create `src/lib/agent-runtime/liveProviderPolicy.ts`:

```typescript
import { validateProviderModelRedaction } from "./providerModelPolicy";
import type { ProviderModelError, ProviderModelRequestEnvelope } from "./providerModelTypes";

export type LiveProviderGateDecision =
  | { allowed: true; reason: string }
  | { allowed: false; error: ProviderModelError };

export function decideLiveProviderGate(input: {
  request: ProviderModelRequestEnvelope;
  userApproved: boolean;
}): LiveProviderGateDecision {
  if (!input.userApproved) {
    return {
      allowed: false,
      error: {
        code: "provider-permission-blocked",
        message: "Live provider request requires approval.",
        retryable: false,
        permissionRelated: true,
        redactionRelated: false,
        safeDetail: "Runtime blocked request before transport.",
      },
    };
  }

  const redaction = validateProviderModelRedaction(input.request);
  if (redaction.blocked) {
    return {
      allowed: false,
      error: {
        code: "provider-redaction-blocked",
        message: "Live provider request contains model-forbidden parts.",
        retryable: false,
        permissionRelated: false,
        redactionRelated: true,
        safeDetail: redaction.reasons.join(", "),
      },
    };
  }

  return { allowed: true, reason: "live_provider_gate_passed" };
}
```

- [ ] **Step 4: Run GREEN**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/liveProviderPolicy.test.ts src/lib/agent-runtime/providerModelPolicy.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: policy tests and typecheck pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add -- src/lib/agent-runtime/liveProviderPolicy.ts src/lib/agent-runtime/liveProviderPolicy.test.ts src/lib/agent-runtime/providerModelPolicy.ts src/lib/agent-runtime/providerModelPolicy.test.ts
git diff --cached --name-only
git commit -m "feat: guard p10 live provider requests"
```

Expected staged paths: only listed policy files; if `providerModelPolicy.*` did not need edits, do not stage them.

## Task 4: API / Tauri Safe Provider Boundary

**Files:**
- Modify: `src/lib/api.ts`
- Modify: `src/lib/apiContract.ts`
- Create or modify minimal `src-tauri/src/**` provider request command files according to existing Tauri command layout
- Test: existing API boundary tests and new Rust/TypeScript tests where local patterns exist

- [ ] **Step 1: Write TypeScript API contract tests**

Add or create a focused test near existing API contract tests:

```typescript
import { describe, expect, it } from "vitest";

import type { LiveProviderRequestInput } from "./apiContract";

describe("live provider API contract", () => {
  it("uses opaque secret refs and never frontend API keys", () => {
    const input = {
      requestId: "request:p10:1",
      providerProfileId: "provider:openai-compatible",
      modelProfileId: "model:gated",
      secretRef: "secret-ref:provider:openai-compatible",
      payload: {
        providerPayloadShape: "openai-compatible-chat",
        messagesOrInput: [{ role: "user", content: "Hello" }],
        stream: true,
        safePromptSummary: "1 input parts, 0 blocked parts",
      },
    } satisfies LiveProviderRequestInput;

    expect(JSON.stringify(input)).not.toContain("sk-");
    expect(input.secretRef).toContain("secret-ref:");
  });
});
```

- [ ] **Step 2: Run RED**

Run the chosen API contract test file:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/apiBoundary.test.ts
```

Expected: FAIL if `LiveProviderRequestInput` is not defined or API wrapper is missing. If the existing file is not the correct place, create a narrow `src/lib/apiContract.test.ts` and run it explicitly.

- [ ] **Step 3: Add `src/lib/api.ts` wrapper**

In `src/lib/apiContract.ts`, define:

```typescript
export type LiveProviderRequestInput = {
  requestId: string;
  providerProfileId: string;
  modelProfileId: string;
  secretRef: string;
  payload: {
    providerPayloadShape: "openai-compatible-chat";
    messagesOrInput: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    stream: boolean;
    safePromptSummary: string;
  };
};

export type LiveProviderRequestOutput = {
  requestId: string;
  events: Array<{ type: string; sequence: number; at: string; text?: string; safeDetail?: string }>;
};
```

In `src/lib/api.ts`, add a wrapper using the existing invoke helper pattern in this file:

```typescript
export async function requestLiveProvider(input: LiveProviderRequestInput): Promise<LiveProviderRequestOutput> {
  return invokeCommand<LiveProviderRequestOutput>("request_live_provider", input);
}
```

Use the actual local invoke helper name from `src/lib/api.ts`; do not introduce a second direct Tauri path.

- [ ] **Step 4: Add Rust command boundary**

In the minimal Rust command module, add `request_live_provider` with these properties:

```text
input: LiveProviderRequestInput equivalent
secret lookup: by opaque secretRef only
network transport: behind one command boundary
output: normalized safe events only
errors: safe provider taxonomy equivalent
```

The first implementation may use an injected or feature-gated transport for tests. Do not store request logs durably. Do not expose raw provider payloads or secret values.

- [ ] **Step 5: Run GREEN**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/apiBoundary.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
cargo check --manifest-path .\src-tauri\Cargo.toml
rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'
rg -n 'Authorization|apiKey|api_key|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-[A-Za-z0-9]' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts
```

Expected: tests/typecheck/Rust check pass; direct Tauri audit no-hit outside allowed files; secret audit no-hit in frontend surfaces.

- [ ] **Step 6: Commit**

Run:

```powershell
git add -- src/lib/api.ts src/lib/apiContract.ts src/lib/apiBoundary.test.ts <exact-src-tauri-provider-files>
git diff --cached --name-only
git commit -m "feat: add p10 live provider api boundary"
```

Expected staged paths: only exact API and provider boundary files. Replace `<exact-src-tauri-provider-files>` with the actual touched Rust paths.

## Task 5: One-Turn Live Model Step

**Files:**
- Create: `src/lib/agent-runtime/liveModelStep.ts`
- Create: `src/lib/agent-runtime/liveModelStep.test.ts`
- Modify: `src/lib/agent-runtime/providerModelAdapter.ts`
- Modify: `src/lib/agent-runtime/providerModelAdapter.test.ts`

- [ ] **Step 1: Write failing one-turn lifecycle tests**

Create `src/lib/agent-runtime/liveModelStep.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

import { runOneTurnLiveModelStep } from "./liveModelStep";

describe("runOneTurnLiveModelStep", () => {
  it("emits a bounded one-turn live model lifecycle", async () => {
    const transport = vi.fn().mockResolvedValue([
      { type: "model.delta.live", requestId: "request:p10:1", sequence: 1, at: "2026-07-07T00:00:01.000Z", text: "Hello" },
      { type: "model.turn.completed.live", requestId: "request:p10:1", sequence: 2, at: "2026-07-07T00:00:02.000Z" },
    ]);

    const result = await runOneTurnLiveModelStep({
      requestId: "request:p10:1",
      transport,
      retry: { maxAttempts: 1, delayMs: 0 },
    });

    expect(result.events.map((event) => event.type)).toEqual([
      "provider.request.started",
      "model.delta.live",
      "model.turn.completed.live",
    ]);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("does not dispatch tools from live model output in P10", async () => {
    const result = await runOneTurnLiveModelStep({
      requestId: "request:p10:tool",
      transport: async () => [
        { type: "model.tool-call.requested.preview", requestId: "request:p10:tool", sequence: 1, at: "2026-07-07T00:00:01.000Z", toolName: "read_current_file" },
      ],
      retry: { maxAttempts: 1, delayMs: 0 },
    });

    expect(result.events.some((event) => event.type === "tool.started")).toBe(false);
    expect(result.events.at(-1)?.type).toBe("model.turn.failed.live");
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/liveModelStep.test.ts
```

Expected: FAIL because `liveModelStep.ts` does not exist.

- [ ] **Step 3: Implement one-turn runtime**

Create `src/lib/agent-runtime/liveModelStep.ts`:

```typescript
import type { ProviderModelStreamEvent } from "./providerModelTypes";

export type OneTurnLiveModelStepInput = {
  requestId: string;
  transport: () => Promise<ProviderModelStreamEvent[]>;
  retry: { maxAttempts: number; delayMs: number };
};

export type OneTurnLiveModelStepResult = {
  events: ProviderModelStreamEvent[];
  attempts: number;
};

export async function runOneTurnLiveModelStep(input: OneTurnLiveModelStepInput): Promise<OneTurnLiveModelStepResult> {
  const events: ProviderModelStreamEvent[] = [
    { type: "provider.request.started", requestId: input.requestId, sequence: 1, at: "2026-07-07T00:00:00.000Z" },
  ];

  let attempts = 0;
  while (attempts < input.retry.maxAttempts) {
    attempts += 1;
    try {
      const transportEvents = await input.transport();
      if (transportEvents.some((event) => event.type === "model.tool-call.requested.preview")) {
        return {
          attempts,
          events: [
            ...events,
            {
              type: "model.turn.failed.live",
              requestId: input.requestId,
              sequence: events.length + 1,
              at: "2026-07-07T00:00:00.000Z",
              error: {
                code: "provider-unsupported-capability",
                message: "P10 does not execute tool calls from live model output.",
                retryable: false,
                permissionRelated: false,
                redactionRelated: false,
                safeDetail: "Tool continuation is reserved for a later phase.",
              },
            },
          ],
        };
      }

      return { attempts, events: [...events, ...transportEvents] };
    } catch {
      if (attempts >= input.retry.maxAttempts) {
        return {
          attempts,
          events: [
            ...events,
            {
              type: "model.turn.failed.live",
              requestId: input.requestId,
              sequence: events.length + 1,
              at: "2026-07-07T00:00:00.000Z",
              error: {
                code: "provider-network-unavailable",
                message: "Live provider request failed after bounded retry.",
                retryable: false,
                permissionRelated: false,
                redactionRelated: false,
                safeDetail: "Raw provider error hidden by P10 mapper.",
              },
            },
          ],
        };
      }
    }
  }

  return { attempts, events };
}
```

- [ ] **Step 4: Add cancellation and retry tests**

Extend `liveModelStep.test.ts` with:

```typescript
it("emits a safe failure after bounded retry", async () => {
  const transport = vi.fn().mockRejectedValue(new Error("raw failure"));
  const result = await runOneTurnLiveModelStep({
    requestId: "request:p10:retry",
    transport,
    retry: { maxAttempts: 2, delayMs: 0 },
  });

  expect(result.attempts).toBe(2);
  expect(result.events.at(-1)?.type).toBe("model.turn.failed.live");
  expect(JSON.stringify(result.events)).not.toContain("raw failure");
});
```

- [ ] **Step 5: Run GREEN**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/liveModelStep.test.ts src/lib/agent-runtime/providerModelAdapter.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: live model step tests, adapter tests, agent-runtime suite, and typecheck pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add -- src/lib/agent-runtime/liveModelStep.ts src/lib/agent-runtime/liveModelStep.test.ts src/lib/agent-runtime/providerModelAdapter.ts src/lib/agent-runtime/providerModelAdapter.test.ts
git diff --cached --name-only
git commit -m "feat: run p10 one turn model step"
```

Expected staged paths: only listed runtime files; if adapter files did not need edits, do not stage them.

## Task 6: Workbench Live Projection

**Files:**
- Modify: `src/lib/agent-workbench/providerModelViewModel.ts`
- Modify: `src/lib/agent-workbench/providerModelViewModel.test.ts`
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.ts`
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.test.ts`
- Modify: `src/components/agent-workbench/ProviderModelPreviewPanel.tsx`
- Modify: `src/components/agent-workbench/AgentWorkbenchShell.tsx`

- [ ] **Step 1: Write failing projection tests**

Extend `src/lib/agent-workbench/providerModelViewModel.test.ts`:

```typescript
it("projects P10 one-turn live provider state without exposing secrets", () => {
  const model = createProviderModelViewModel({
    requestId: "request:p10:1",
    providerProfileId: "provider:openai-compatible",
    modelProfileId: "model:gated",
    outputState: "Live Provider Request / One-Turn Model Step Contract Preview",
    events: [
      { type: "provider.request.started", requestId: "request:p10:1", sequence: 1, at: "2026-07-07T00:00:00.000Z" },
      { type: "model.delta.live", requestId: "request:p10:1", sequence: 2, at: "2026-07-07T00:00:01.000Z", text: "Live text." },
      { type: "model.turn.completed.live", requestId: "request:p10:1", sequence: 3, at: "2026-07-07T00:00:02.000Z" },
    ],
    capabilities: {
      providerRequest: { status: "preview", reason: "p10_live_gate" },
      streaming: { status: "preview", reason: "p10_live_gate" },
      toolCalling: { status: "reserved", reason: "future_phase" },
    },
    limitations: ["one_turn_only", "no_tool_continuation", "no_patch_apply"],
  });

  expect(model.title).toBe("Live Provider Request / One-Turn Model Step Contract Preview");
  expect(model.previewText).toBe("Live text.");
  expect(JSON.stringify(model)).not.toContain("sk-");
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench/providerModelViewModel.test.ts
```

Expected: FAIL until the view model accepts the P10 output state and live events.

- [ ] **Step 3: Implement read-only projection**

Update `ProviderModelProjectionInput` and `ProviderModelViewModel` title type to allow:

```typescript
"Provider/Model Adapter Contract Preview" | "Live Provider Request / One-Turn Model Step Contract Preview"
```

Update `previewText` extraction to include both:

```typescript
event.type === "model.delta.preview" || event.type === "model.delta.live"
```

Update component copy to say `Provider/model` and status values only; do not add controls that choose provider, reveal prompts, or call APIs.

- [ ] **Step 4: Attach projection from task flow**

If P10 runtime returns a provider model result, pass the read model through `workbenchTaskFlow.ts`. Keep existing P9 preview behavior when no live result exists.

Add tests in `workbenchTaskFlow.test.ts` asserting:

```typescript
expect(result.providerModelPreview.title).toMatch(/Provider Request|Provider\/Model Adapter/);
expect(result.providerModelPreview.limitations).toContain("no_patch_apply");
```

- [ ] **Step 5: Run GREEN**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench/providerModelViewModel.test.ts src/lib/agent-workbench/workbenchTaskFlow.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: Workbench projection tests, agent-workbench suite, and typecheck pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add -- src/lib/agent-workbench/providerModelViewModel.ts src/lib/agent-workbench/providerModelViewModel.test.ts src/lib/agent-workbench/workbenchTaskFlow.ts src/lib/agent-workbench/workbenchTaskFlow.test.ts src/components/agent-workbench/ProviderModelPreviewPanel.tsx src/components/agent-workbench/AgentWorkbenchShell.tsx
git diff --cached --name-only
git commit -m "feat: project p10 live provider state"
```

Expected staged paths: only listed Workbench/component files.

## Task 7: Boundary Audit And Handoff

**Files:**
- Modify: `docs/agent-workbench/handoff-p4.md`
- Optional modify: focused tests only when audit-noise cleanup is needed without weakening coverage

- [ ] **Step 1: Run focused verification**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench
node .\node_modules\vitest\vitest.mjs run src/lib/apiBoundary.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
cargo check --manifest-path .\src-tauri\Cargo.toml
```

Expected: all focused suites, typecheck, and Rust check pass. If `cargo check` is blocked by missing `local-blog/dist` or dependency hydration, report exact blocker and do not claim Rust verification passed.

- [ ] **Step 2: Run boundary audits**

Run:

```powershell
rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'
rg -n 'Authorization|apiKey|api_key|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-[A-Za-z0-9]' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts
rg -n 'buildPrompt|prompt construction|PromptAssembler|ContextBuilder' src/components src/lib/agent-workbench src/lib/agent-runtime
rg -n 'patch apply|execute runner|Cookie-backed|session storage|request log persistence|AiSidebar' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts src-tauri/src
rg -n 'AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|production-ready|ready: true|isReady: true' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

Expected:

- Direct Tauri audit no-hit outside allowed files.
- Secret audit no-hit in frontend/runtime/workbench surfaces.
- Prompt audit shows ContextBuilder/PromptAssembler only in runtime, not React components; explain scoped hits.
- Forbidden capability audit has no product capability hits; negative-proof test literals must be scoped.
- Filtered status contains only intended files before handoff commit.
- Staged paths empty before handoff staging.

- [ ] **Step 3: Append P10 handoff**

Append to `docs/agent-workbench/handoff-p4.md`:

```markdown
## P10 Model Loop / Live Provider Request Contract Freeze handoff

P10 输出状态：**Live Provider Request / One-Turn Model Step Contract Preview**。本阶段允许在通过 `src/lib/api.ts` / Tauri 安全边界、runtime permission gate、redaction gate、secret handling、bounded retry、cancellation 和 redacted audit snapshot 后进入真实 provider request / live streaming；它不代表成熟 multi-step model loop、tool continuation、patch workflow、execute/code runner、Cookie-backed reader、session persistence 或 production-ready Agent 可用。

P10 已冻结 / 已合入：

- Live request metadata：记录 contextBuildId、permissionDecisionId、redactionDecisionId、secretRef、streamPolicyId、abortControllerId、retryPolicyId。
- ContextBuilder / PromptAssembler：runtime 层构造 provider payload，Workbench / React component 不拼 prompt。
- API boundary：前端只经 `src/lib/api.ts` 调用 Tauri provider request；Rust 侧读取 secret。
- One-turn model step：支持 live stream projection、usage、completion、safe failure、cancellation、bounded retry。
- Request audit：仅 redacted memory snapshot，不写 durable request log。
- Workbench projection：只读展示 live request / stream 状态，不选择 provider、不读 secret、不触发工具执行。

P10 仍禁止 / 未实现：

- multi-step autonomous model loop、tool-call continuation、observation 回灌模型、compaction。
- write、patch generation、patch apply、execute/code runner、delete、rollback。
- Cookie-backed reader / Cookie-backed Luogu reading。
- session persistence、database storage、durable request log。
- 旧 `src/components/ai/AiSidebar.tsx` 迁移。
- 绕过 `src/lib/api.ts`、前端持有 API key、读取或修改真实 `notes/**`。

最终验证记录：

- 记录 Task 7 Step 1 每条命令的 PASS/FAIL、test file count、test count 或 blocker。
- 记录 API boundary audit 结果。
- 记录 secret/provider audit 结果。
- 记录 prompt construction audit 中 ContextBuilder/PromptAssembler 是否仅限 runtime。
- 记录 forbidden capability audit 结果。
- 记录 filtered status 与 staged paths。

下一阶段必须新写 freeze spec，才能讨论 multi-step model loop/tool continuation、session persistence/request-log storage、patch workflow、execute/code runner、Cookie-backed reader 或旧 AiSidebar retirement/migration。
```

- [ ] **Step 4: Commit handoff**

Run:

```powershell
git add -- docs/agent-workbench/handoff-p4.md
git diff --cached --name-only
git commit -m "docs: record p10 live provider handoff"
```

Expected staged paths: only `docs/agent-workbench/handoff-p4.md`, unless a focused audit-noise cleanup was required and reported.

## Task 8: Supervisor Acceptance

**Files:**
- Read-only in supervisor checkout

- [ ] **Step 1: Verify repository state**

Run:

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -12 --decorate
```

Expected: checkout is clean, staged paths empty, P10 implementation/handoff commits present.

- [ ] **Step 2: Re-run acceptance commands**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench
node .\node_modules\vitest\vitest.mjs run src/lib/apiBoundary.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
cargo check --manifest-path .\src-tauri\Cargo.toml
rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'
rg -n 'Authorization|apiKey|api_key|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-[A-Za-z0-9]' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts
rg -n 'buildPrompt|prompt construction|PromptAssembler|ContextBuilder' src/components src/lib/agent-workbench src/lib/agent-runtime
rg -n 'patch apply|execute runner|Cookie-backed|session storage|request log persistence|AiSidebar' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts src-tauri/src
```

Expected: verification passes or blockers are recorded precisely; audits are no-hit or scoped to contract/test literals with explanation.

- [ ] **Step 3: Report supervisor acceptance**

Supervisor report must include:

```text
Verdict:
P10 output state:
Merged commits:
Changed files by slice:
Verification commands and results:
No-hit audit results:
Scoped audit hits:
Remaining forbidden capabilities:
Final filtered status:
Final staged paths:
Push status:
```

No commit is required for Task 8 unless supervisor explicitly requests a separate closeout doc.

## Docs-Only Worker Acceptance

This current docs-only P10 worker must run:

```powershell
rg -n 'P10 Model Loop|Live Provider Request|Live Provider Request / One-Turn Model Step Contract Preview|be33f80bc65159c094ecd06bf155afa3061ce23d' docs/superpowers/specs/2026-07-07-p10-model-loop-live-provider-request-freeze-design.md docs/superpowers/plans/2026-07-07-p10-model-loop-live-provider-request.md
$placeholderPattern = ('TO' + 'DO|TB' + 'D|待' + '补|以' + '后再补|占' + '位')
rg -n $placeholderPattern docs/superpowers/specs/2026-07-07-p10-model-loop-live-provider-request-freeze-design.md docs/superpowers/plans/2026-07-07-p10-model-loop-live-provider-request.md
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

Expected:

- First `rg` finds the phase name, output state, and upstream commit provenance.
- Placeholder audit is no-hit.
- Filtered status contains only the two P10 docs before staging.
- Staged paths are empty before exact-path staging.

Then stage and commit exactly:

```powershell
git add -- docs/superpowers/specs/2026-07-07-p10-model-loop-live-provider-request-freeze-design.md docs/superpowers/plans/2026-07-07-p10-model-loop-live-provider-request.md
git diff --cached --name-only
git commit -m "docs: define p10 model loop provider request contract"
```

Expected staged paths:

```text
docs/superpowers/specs/2026-07-07-p10-model-loop-live-provider-request-freeze-design.md
docs/superpowers/plans/2026-07-07-p10-model-loop-live-provider-request.md
```

## Handoff Template For Future Workers

```text
Current phase:
P10 Model Loop / Live Provider Request Contract Freeze

Responsible slice:
<Task N name>

Input state:
Provider/Model Adapter Contract Preview

Target output state:
Live Provider Request / One-Turn Model Step Contract Preview

Allowed files:
<exact paths from this plan>

Forbidden files:
notes/**
src/components/ai/**
write/patch/execute/Cookie/session persistence surfaces outside the approved task

Required reading:
AGENTS.md
P10 spec
P10 plan
P9 spec
P9 plan
docs/agent-workbench/handoff-p4.md P9/P10 sections

RED evidence:
<failing test command and failure reason>

GREEN evidence:
<passing test commands>

Boundary audits:
<API boundary, secret, prompt, forbidden capability audits>

Staging:
Use git add -- <exact paths>

Commit:
<task-specific commit message>

Push:
No, unless supervisor explicitly asks.

Remaining forbidden capabilities:
multi-step model loop/tool continuation, write, patch apply, execute/code runner, Cookie-backed reader, durable request log, session persistence, old AiSidebar migration
```

## Plan Self-Review

- Spec coverage: tasks cover live metadata, ContextBuilder, PromptAssembler, permission/redaction gate, API/Tauri safe boundary, one-turn live model step, stream projection, cancellation/retry/error mapping, redacted request audit strategy, Workbench read-only projection, boundary audits, handoff, and supervisor acceptance.
- Scope control: plan does not implement write, patch apply, execute/code runner, Cookie-backed reader, session persistence, durable request log, or legacy AiSidebar migration.
- Generality: context and provider contracts support general tasks; OI remains a workspace/profile specialization.
- Verification: every implementation slice has RED, GREEN, exact-path staging, commit-only, and boundary audit requirements.
- Dependency order: live provider request comes only after API boundary, secret handling, permission, redaction, and context construction are explicit.
