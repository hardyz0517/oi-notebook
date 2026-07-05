# P5 Agent Core Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze the Agent Core contract so P4's one-shot preview runtime becomes a tested protocol boundary without enabling real model loop, patch, execute, Cookie, or persistence behavior.

**Architecture:** Keep `src/lib/agent-runtime/**` as the Agent Core contract layer and keep React Workbench UI as an event/view-model consumer. Add typed loop capability snapshots and reserved/unavailable events before any future real Agent Loop implementation. Preserve `src/lib/api.ts` as the frontend-to-Rust boundary.

**Tech Stack:** Tauri 2, React, TypeScript, Vitest, `tsc`, existing `src/lib/agent-runtime/**`, `src/lib/agent-workbench/**`, `src/components/agent-workbench/**`, `src/lib/apiBoundary.test.ts`.

---

## 0. Required Context

Before editing, every worker must read:

```text
AGENTS.md
docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md
docs/superpowers/specs/2026-07-04-p4-architecture-correction-freeze-design.md
docs/superpowers/specs/2026-07-05-p5-agent-core-contract-freeze-design.md
docs/agent-workbench/handoff-p4.md
docs/superpowers/plans/2026-07-05-p5-agent-core-contract.md
```

Every worker must start with:

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -8 --decorate
```

Forbidden throughout this plan:

```text
notes/**
src/components/ai/**
provider/model selection behavior
prompt construction behavior
real model request / streaming behavior
real write / patch apply / execute / Cookie / persistence implementation
git add .
git add -A
git commit -a
push / tag / release
```

## 1. File Structure

Expected files:

```text
src/lib/agent-runtime/agentTypes.ts
src/lib/agent-runtime/agentTypes.test.ts
src/lib/agent-runtime/agentLoopContract.ts
src/lib/agent-runtime/agentLoopContract.test.ts
src/lib/agent-runtime/agentSession.ts
src/lib/agent-runtime/agentRuntime.ts
src/lib/agent-runtime/agentRuntime.test.ts
src/lib/agent-runtime/eventStream.ts
src/lib/agent-workbench/workbenchTaskFlow.ts
src/lib/agent-workbench/workbenchTaskFlow.test.ts
src/components/agent-workbench/AgentWorkbenchShell.tsx
src/lib/apiBoundary.test.ts
docs/agent-workbench/handoff-p4.md
```

Ownership:

- `agentTypes.ts`: shared protocol types.
- `agentLoopContract.ts`: pure contract snapshot, no runtime side effects.
- `agentSession.ts`: session construction and event append/state helpers.
- `agentRuntime.ts`: one-shot preview primitive that emits contract-aligned events.
- `workbenchTaskFlow.ts`: maps runtime output into Workbench view-model data.
- `AgentWorkbenchShell.tsx`: displays contract truthfully, no loop decisions.

## 2. Task 0: Baseline Audit

**Files:**
- Read: `src/lib/agent-runtime/agentTypes.ts`
- Read: `src/lib/agent-runtime/agentRuntime.ts`
- Read: `src/lib/agent-runtime/agentSession.ts`
- Read: `src/lib/agent-workbench/workbenchTaskFlow.ts`
- Read: `src/components/agent-workbench/AgentWorkbenchShell.tsx`

- [ ] **Step 1: Record current checkout identity**

Run:

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -8 --decorate
```

Expected:

```text
No staged paths. Report any dirty paths before proceeding.
```

- [ ] **Step 2: Confirm P5 forbidden claim audit baseline**

Run:

```powershell
rg -n "AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|production-ready|ready: true|isReady: true" src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench
```

Expected:

```text
No misleading mature-runtime claims. Any hit must be preview/reserved/unavailable context.
```

- [ ] **Step 3: Commit nothing**

This audit task does not commit.

## 3. Task 1: Expand Agent Event Protocol

**Files:**
- Modify: `src/lib/agent-runtime/agentTypes.ts`
- Modify: `src/lib/agent-runtime/agentTypes.test.ts`

- [ ] **Step 1: Write failing event protocol test**

Add this test to `src/lib/agent-runtime/agentTypes.test.ts`:

```typescript
import type { AgentEventType } from "./agentTypes";

describe("AgentEventType", () => {
  it("covers the P5 core protocol events without claiming mature execution", () => {
    const events = [
      "agent.started",
      "agent.plan.created",
      "model.delta",
      "tool.requested",
      "tool.started",
      "tool.output",
      "tool.failed",
      "permission.required",
      "permission.resolved",
      "observation.added",
      "evidence.added",
      "patch.generated",
      "patch.applied",
      "workspace.updated",
      "agent.compacted",
      "agent.completed",
      "agent.failed",
    ] satisfies AgentEventType[];

    expect(events).toContain("tool.requested");
    expect(events).toContain("permission.resolved");
    expect(events).toContain("observation.added");
    expect(events).toContain("agent.compacted");
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/agent-runtime/agentTypes.test.ts
```

Expected:

```text
FAIL because AgentEventType does not yet include tool.requested, permission.resolved, observation.added, or agent.compacted.
```

- [ ] **Step 3: Expand `AgentEventType`**

Update `src/lib/agent-runtime/agentTypes.ts`:

```typescript
export type AgentEventType =
  | "agent.started"
  | "agent.plan.created"
  | "model.delta"
  | "tool.requested"
  | "tool.started"
  | "tool.output"
  | "tool.failed"
  | "permission.required"
  | "permission.resolved"
  | "observation.added"
  | "evidence.added"
  | "patch.generated"
  | "patch.applied"
  | "workspace.updated"
  | "agent.compacted"
  | "agent.completed"
  | "agent.failed";
```

- [ ] **Step 4: Run test and verify pass**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/agent-runtime/agentTypes.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add -- src/lib/agent-runtime/agentTypes.ts src/lib/agent-runtime/agentTypes.test.ts
git diff --cached --name-only
git commit -m "feat: expand agent event protocol"
```

## 4. Task 2: Add Preview Agent Loop Contract

**Files:**
- Create: `src/lib/agent-runtime/agentLoopContract.ts`
- Create: `src/lib/agent-runtime/agentLoopContract.test.ts`
- Modify: `src/lib/agent-runtime/agentTypes.ts`

- [ ] **Step 1: Write failing loop contract test**

Create `src/lib/agent-runtime/agentLoopContract.test.ts`:

```typescript
import { createPreviewAgentLoopContract } from "./agentLoopContract";

describe("createPreviewAgentLoopContract", () => {
  it("marks mature loop capabilities as reserved or unavailable", () => {
    const contract = createPreviewAgentLoopContract();

    expect(contract.mode).toBe("preview_one_shot");
    expect(contract.toolExecution.status).toBe("preview");
    expect(contract.permissionDecision.status).toBe("preview");
    expect(contract.modelStep.status).toBe("unavailable");
    expect(contract.patchApply.status).toBe("unavailable");
    expect(contract.continuation.status).toBe("reserved");
    expect(contract.compaction.status).toBe("reserved");
    expect(contract.sessionPersistence.status).toBe("unavailable");
  });

  it("does not expose production-ready loop claims", () => {
    const contract = createPreviewAgentLoopContract();

    expect(Object.values(contract).some((value) => value === "ready")).toBe(false);
    expect(contract.modelStep.reason).toBe("model_loop_unavailable");
    expect(contract.patchApply.reason).toBe("patch_apply_unavailable");
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/agent-runtime/agentLoopContract.test.ts
```

Expected:

```text
FAIL because src/lib/agent-runtime/agentLoopContract.ts does not exist.
```

- [ ] **Step 3: Add loop contract types**

Add to `src/lib/agent-runtime/agentTypes.ts`:

```typescript
export type AgentLoopCapabilityStatus = "preview" | "reserved" | "unavailable";

export type AgentLoopCapability = {
  status: AgentLoopCapabilityStatus;
  reason: string;
};

export type AgentLoopContract = {
  mode: "preview_one_shot" | "reserved_model_loop";
  modelStep: AgentLoopCapability;
  toolRequest: AgentLoopCapability;
  permissionDecision: AgentLoopCapability;
  toolExecution: AgentLoopCapability;
  observation: AgentLoopCapability;
  continuation: AgentLoopCapability;
  interruption: AgentLoopCapability;
  compaction: AgentLoopCapability;
  patchGeneration: AgentLoopCapability;
  patchApply: AgentLoopCapability;
  sessionPersistence: AgentLoopCapability;
};
```

- [ ] **Step 4: Add preview contract factory**

Create `src/lib/agent-runtime/agentLoopContract.ts`:

```typescript
import type { AgentLoopContract } from "./agentTypes";

const preview = (reason: string) => ({ status: "preview" as const, reason });
const reserved = (reason: string) => ({ status: "reserved" as const, reason });
const unavailable = (reason: string) => ({ status: "unavailable" as const, reason });

export function createPreviewAgentLoopContract(): AgentLoopContract {
  return {
    mode: "preview_one_shot",
    modelStep: unavailable("model_loop_unavailable"),
    toolRequest: preview("one_shot_tool_request_preview"),
    permissionDecision: preview("permission_policy_preview"),
    toolExecution: preview("one_shot_tool_execution_preview"),
    observation: reserved("observation_protocol_reserved"),
    continuation: reserved("continuation_reserved"),
    interruption: reserved("interruption_reserved"),
    compaction: reserved("compaction_reserved"),
    patchGeneration: unavailable("patch_generation_unavailable"),
    patchApply: unavailable("patch_apply_unavailable"),
    sessionPersistence: unavailable("session_persistence_unavailable"),
  };
}
```

- [ ] **Step 5: Run test and verify pass**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/agent-runtime/agentLoopContract.test.ts src/lib/agent-runtime/agentTypes.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add -- src/lib/agent-runtime/agentTypes.ts src/lib/agent-runtime/agentLoopContract.ts src/lib/agent-runtime/agentLoopContract.test.ts
git diff --cached --name-only
git commit -m "feat: add preview agent loop contract"
```

## 5. Task 3: Add Session Status Helpers

**Files:**
- Modify: `src/lib/agent-runtime/agentTypes.ts`
- Modify: `src/lib/agent-runtime/agentSession.ts`
- Modify: `src/lib/agent-runtime/agentTypes.test.ts`

- [ ] **Step 1: Write failing session status test**

Add to `src/lib/agent-runtime/agentTypes.test.ts`:

```typescript
import { createAgentSession, markSessionStatus } from "./agentSession";

describe("AgentSessionState", () => {
  it("supports blocked as an explicit contract state", () => {
    const session = createAgentSession({ workspaceId: "workspace:test" });
    const blocked = markSessionStatus(session, "blocked");

    expect(blocked.status).toBe("blocked");
    expect(blocked.events).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/agent-runtime/agentTypes.test.ts
```

Expected:

```text
FAIL because blocked status or markSessionStatus is missing.
```

- [ ] **Step 3: Extend session status**

Update `src/lib/agent-runtime/agentTypes.ts`:

```typescript
export type AgentSessionStatus = "idle" | "running" | "blocked" | "completed" | "failed";
```

- [ ] **Step 4: Add status helper**

Add to `src/lib/agent-runtime/agentSession.ts`:

```typescript
import type { AgentEvent, AgentSessionState, AgentSessionStatus } from "./agentTypes";

export function markSessionStatus(
  session: AgentSessionState,
  status: AgentSessionStatus,
): AgentSessionState {
  return {
    ...session,
    status,
  };
}
```

If the file already imports `AgentEvent` and `AgentSessionState`, merge the import instead of duplicating it.

- [ ] **Step 5: Run test and verify pass**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/agent-runtime/agentTypes.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add -- src/lib/agent-runtime/agentTypes.ts src/lib/agent-runtime/agentSession.ts src/lib/agent-runtime/agentTypes.test.ts
git diff --cached --name-only
git commit -m "feat: add blocked agent session state"
```

## 6. Task 4: Align Runtime One-Shot Events

**Files:**
- Modify: `src/lib/agent-runtime/agentRuntime.ts`
- Modify: `src/lib/agent-runtime/agentRuntime.test.ts`

- [ ] **Step 1: Write failing runtime event test**

Add to `src/lib/agent-runtime/agentRuntime.test.ts`:

```typescript
it("emits tool.requested before permission and execution events", async () => {
  const registry = createToolRegistry();
  registry.register({
    name: "read_context",
    description: "Read context",
    permission: "read",
    run: async () => ({ ok: true }),
  });

  const runtime = createAgentRuntime({
    session: createAgentSession({ workspaceId: "workspace:test" }),
    toolRegistry: registry,
    permissionManager: createPermissionManager(),
  });

  await runtime.runTool("read_context", { id: "input" });

  expect(runtime.session.events.map((event) => event.type)).toEqual([
    "agent.started",
    "tool.requested",
    "tool.started",
    "tool.output",
    "agent.completed",
  ]);
});

it("marks permission-blocked one-shot runs as blocked, not failed", async () => {
  const registry = createToolRegistry();
  registry.register({
    name: "write_file",
    description: "Write file",
    permission: "write",
    run: async () => ({ ok: true }),
  });

  const runtime = createAgentRuntime({
    session: createAgentSession({ workspaceId: "workspace:test" }),
    toolRegistry: registry,
    permissionManager: createPermissionManager(),
  });

  const result = await runtime.runTool("write_file", { path: "notes/a.md" });

  expect(result).toEqual({ status: "blocked", reason: "permission_required" });
  expect(runtime.session.status).toBe("blocked");
  expect(runtime.session.events.map((event) => event.type)).toContain("permission.required");
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/agent-runtime/agentRuntime.test.ts
```

Expected:

```text
FAIL because tool.requested is not emitted and blocked status is not used.
```

- [ ] **Step 3: Emit `tool.requested` and use blocked status**

In `src/lib/agent-runtime/agentRuntime.ts`, update `runTool`:

```typescript
pushEvent(createEvent(session.id, "tool.requested", { toolName, input: inputValue }));

const tool = input.toolRegistry.get(toolName);
if (!tool) {
  pushEvent(createEvent(session.id, "tool.failed", { toolName, reason: "tool_not_registered" }));
  session = { ...session, status: "failed" };
  return { status: "failed", reason: "tool_not_registered" };
}

if (!input.permissionManager.canAutoRunTool(toolName, tool.permission)) {
  pushEvent(createEvent(session.id, "permission.required", { toolName, permission: tool.permission }));
  session = { ...session, status: "blocked" };
  return { status: "blocked", reason: "permission_required" };
}
```

Do not add real permission approval. This task only records the blocked contract.

- [ ] **Step 4: Run runtime tests**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/agent-runtime/agentRuntime.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add -- src/lib/agent-runtime/agentRuntime.ts src/lib/agent-runtime/agentRuntime.test.ts
git diff --cached --name-only
git commit -m "feat: align one-shot runtime events"
```

## 7. Task 5: Expose Loop Contract To Workbench Flow

**Files:**
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.ts`
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.test.ts`

- [ ] **Step 1: Write failing Workbench contract test**

Add to `src/lib/agent-workbench/workbenchTaskFlow.test.ts`:

```typescript
it("returns the preview loop contract with unavailable mature capabilities", async () => {
  const result = await runWorkbenchTask({
    mode: "manual_url",
    problem: {
      source: "manual",
      title: "Two Sum",
      url: "https://example.test/problem",
    },
    manualSource: {
      url: "https://example.test/editorial",
      title: "Editorial",
      excerpt: "Use hashing.",
    },
  });

  expect(result.loopContract.mode).toBe("preview_one_shot");
  expect(result.loopContract.modelStep.status).toBe("unavailable");
  expect(result.loopContract.patchApply.status).toBe("unavailable");
  expect(result.loopContract.continuation.status).toBe("reserved");
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/agent-workbench/workbenchTaskFlow.test.ts
```

Expected:

```text
FAIL because WorkbenchTaskResult does not expose loopContract.
```

- [ ] **Step 3: Add loop contract to Workbench result**

In `src/lib/agent-workbench/workbenchTaskFlow.ts`, import and use:

```typescript
import { createPreviewAgentLoopContract } from "../agent-runtime/agentLoopContract";
import type { AgentLoopContract } from "../agent-runtime/agentTypes";
```

Update result type:

```typescript
export type ManualWorkbenchTaskResult = {
  workspace: ProblemWorkspace;
  events: AgentEvent[];
  evidenceRecords: EvidenceStoreRecord[];
  permissionRequests: WorkbenchTaskPermissionRequest[];
  cacheSnapshot: ReturnType<ResearchCacheManager["snapshot"]>;
  loopContract: AgentLoopContract;
};
```

When returning the result, include:

```typescript
loopContract: createPreviewAgentLoopContract(),
```

- [ ] **Step 4: Run Workbench tests**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/agent-workbench/workbenchTaskFlow.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add -- src/lib/agent-workbench/workbenchTaskFlow.ts src/lib/agent-workbench/workbenchTaskFlow.test.ts
git diff --cached --name-only
git commit -m "feat: expose agent loop contract to workbench"
```

## 8. Task 6: Keep UI As Contract Consumer

**Files:**
- Modify: `src/components/agent-workbench/AgentWorkbenchShell.tsx`
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.test.ts`

- [ ] **Step 1: Add negative UI contract test**

If `AgentWorkbenchShell` has no DOM test harness, keep this as a flow-level assertion in `workbenchTaskFlow.test.ts`:

```typescript
it("keeps mature capabilities unavailable in UI-facing results", async () => {
  const result = await runWorkbenchTask({
    mode: "current_research",
    problem: {
      source: "manual",
      title: "Current context",
    },
  });

  expect(result.loopContract.modelStep.reason).toBe("model_loop_unavailable");
  expect(result.loopContract.patchGeneration.reason).toBe("patch_generation_unavailable");
  expect(result.loopContract.sessionPersistence.reason).toBe("session_persistence_unavailable");
});
```

- [ ] **Step 2: Run test**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/agent-workbench/workbenchTaskFlow.test.ts
```

Expected:

```text
PASS after Task 5 exists.
```

- [ ] **Step 3: Display contract status without adding loop decisions**

In `src/components/agent-workbench/AgentWorkbenchShell.tsx`, display loop contract fields only as labels. Do not branch into model/tool execution logic. Use existing panel style and conservative labels:

```typescript
const formatCapabilityStatus = (status: "preview" | "reserved" | "unavailable"): string => {
  if (status === "preview") return "available for preview";
  if (status === "reserved") return "reserved";
  return "unavailable";
};
```

Render model loop / patch / persistence as unavailable or reserved. Do not use `ready`.

- [ ] **Step 4: Run related tests**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/agent-workbench/workbenchTaskFlow.test.ts src/lib/apiBoundary.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add -- src/components/agent-workbench/AgentWorkbenchShell.tsx src/lib/agent-workbench/workbenchTaskFlow.test.ts
git diff --cached --name-only
git commit -m "feat: show agent loop contract truthfully"
```

## 9. Task 7: Boundary Audits And Handoff

**Files:**
- Modify: `docs/agent-workbench/handoff-p4.md`

- [ ] **Step 1: Run focused suite**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/agent-runtime
.\node_modules\.bin\vitest.cmd run src/lib/agent-workbench
.\node_modules\.bin\vitest.cmd run src/lib/apiBoundary.test.ts
.\node_modules\.bin\tsc.cmd --noEmit
```

Expected:

```text
PASS
```

- [ ] **Step 2: Run API boundary audit**

Run:

```powershell
rg -n "@tauri-apps/api/core|\binvoke\s*\(" src --glob "!src/lib/api.ts" --glob "!src/components/ai/**" --glob "!src/lib/aiWebSearch.ts"
```

Expected:

```text
No direct IPC calls outside approved boundaries.
```

- [ ] **Step 3: Run capability claim audit**

Run:

```powershell
rg -n "AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|production-ready|ready: true|isReady: true" src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench
```

Expected:

```text
No misleading mature-runtime claims. Any hit must be quoted as forbidden text inside a test or document.
```

- [ ] **Step 4: Update handoff**

Append a P5 section to `docs/agent-workbench/handoff-p4.md`:

```markdown
## P5 Agent Core Contract Freeze

P5 freezes the Agent Core protocol without enabling a real model loop. The current runtime remains a one-shot preview primitive, while `AgentLoopContract` records reserved and unavailable mature capabilities such as model step, continuation, compaction, patch apply, and session persistence.

Verification:

- `vitest src/lib/agent-runtime`
- `vitest src/lib/agent-workbench`
- `vitest src/lib/apiBoundary.test.ts`
- `tsc --noEmit`
- API boundary audit
- capability claim audit

Next allowed phase must cite the P5 freeze spec before changing Tool/Permission, Workspace, Web Reader/Evidence, UI IA, or Provider Adapter behavior.
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add -- docs/agent-workbench/handoff-p4.md
git diff --cached --name-only
git commit -m "docs: record p5 agent core contract handoff"
```

## 10. Closeout

- [ ] **Step 1: Final status**

Run:

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -8 --decorate
```

Expected:

```text
No staged paths. Report any remaining non-notes dirty files explicitly.
```

- [ ] **Step 2: Report verdict**

Report:

```text
Verdict: READY_FOR_REVIEW or BLOCKED
Commits created:
Verification commands and results:
Remaining risks:
No push performed:
```

Do not push unless the user explicitly asks.
