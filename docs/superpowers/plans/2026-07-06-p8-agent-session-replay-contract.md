# P8 Agent Session Replay Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 P8 冻结并实现为 `Agent Session/Replay Contract Preview`，让 session identity、event log、replay fixture、privacy/redaction、workspace/evidence linkage 和 Workbench read-only projection 成为可测试 contract。

**Architecture:** P8 在 P5/P6/P7 的 Agent Core、Tool/Permission、OI skill/workspace read-model contract 上工作。新增 session/replay 类型、deterministic replay projector、in-memory fixture 和只读 UI projection，不接真实 provider/model loop/streaming/write/patch/execute/Cookie/persistence。

**Tech Stack:** TypeScript, Vitest, React Workbench view-model glue, existing `src/lib/agent-runtime/**`, `src/lib/agent-workbench/**`, `src/lib/problem-workspace/**`, `src/lib/oi-skills/**`, `src/components/agent-workbench/**`.

---

## 0. 阶段边界

阶段名称：**P8 Agent Session / Replay Contract Freeze**

输入状态：**OI Research/Solution Skill Contract Preview**

输出状态：**Agent Session/Replay Contract Preview**

必须先读：

- `AGENTS.md`
- `docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md`
- `docs/superpowers/specs/2026-07-05-p5-agent-core-contract-freeze-design.md`
- `docs/superpowers/specs/2026-07-05-p6-tool-permission-contract-freeze-design.md`
- `docs/superpowers/specs/2026-07-06-p7-oi-research-solution-skill-contract-freeze-design.md`
- `docs/superpowers/plans/2026-07-06-p7-oi-research-solution-skill-contract.md`
- `docs/agent-workbench/handoff-p4.md`
- `docs/superpowers/specs/2026-07-06-p8-agent-session-replay-contract-freeze-design.md`

启动命令：

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -10 --decorate
```

全局禁止：

- 不改 `notes/**`。
- 不改 `src/components/ai/**`。
- 不接 provider / prompt / model request / streaming。
- 不实现真实 write / patch apply / execute / code runner / delete / rollback。
- 不实现 Cookie-backed reader。
- 不引入 persistence / storage / request log。
- 不绕过 `src/lib/api.ts`。
- 不使用 `git add .`、`git add -A`、`git commit -a`。

## File Structure

- Modify: `src/lib/agent-runtime/agentTypes.ts`，增加 P8 session metadata、event log、replay、checkpoint、privacy/redaction、failure reason 类型。
- Modify: `src/lib/agent-runtime/agentSession.ts`，增加纯 helper：create preview metadata、append ordered event、build in-memory checkpoint。
- Modify: `src/lib/agent-runtime/eventStream.ts`，增加 snapshot with sequence helper 或 replay-safe event list helper。
- Create: `src/lib/agent-runtime/agentReplay.ts`，实现 deterministic replay projector，输入 fixture/event log，输出 read model。
- Create: `src/lib/agent-runtime/agentReplay.test.ts`，覆盖 ordering、failure、redaction、determinism、negative proof。
- Modify: `src/lib/agent-runtime/agentTypes.test.ts` and `src/lib/agent-runtime/eventStream.test.ts`，覆盖新增类型/helper。
- Create: `src/lib/agent-workbench/sessionReplayViewModel.ts`，把 runtime replay read model 投影为 Workbench 可消费 view model。
- Create: `src/lib/agent-workbench/sessionReplayViewModel.test.ts`，覆盖 workspace/evidence/session linkage 和 capability statuses。
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.ts`，把 P8 preview session/replay read model 附到 task result。
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.test.ts`，覆盖 P8 result shape 和无副作用。
- Modify: `src/lib/problem-workspace/problemWorkspaceTypes.ts`，补充 session linkage 字段。
- Modify: `src/lib/problem-workspace/problemWorkspaceDefaults.ts` and `src/lib/problem-workspace/problemWorkspaceStore.ts`，默认保留 session linkage。
- Modify: `src/lib/problem-workspace/problemWorkspaceTypes.test.ts` and `src/lib/problem-workspace/problemWorkspaceStore.test.ts`，覆盖 linkage 默认值和 update。
- Modify: `src/lib/oi-skills/oiSkillTypes.ts`，允许 skill read model 引用 session/replay ids。
- Modify: `src/lib/oi-skills/oiSkillTypes.test.ts`，覆盖 P8 linkage 不改变 P7 skill 能力。
- Create: `src/components/agent-workbench/SessionReplayPanel.tsx`，只读展示 replay projection。
- Modify: `src/components/agent-workbench/AgentWorkbenchShell.tsx`，接入 P8 panel，只消费 view model。
- Modify: `docs/agent-workbench/handoff-p4.md`，记录 P8 closeout。

## Task 0: Baseline And Scope Audit

**Files:**
- Read-only: `AGENTS.md`
- Read-only: `docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md`
- Read-only: `docs/superpowers/specs/2026-07-05-p5-agent-core-contract-freeze-design.md`
- Read-only: `docs/superpowers/specs/2026-07-05-p6-tool-permission-contract-freeze-design.md`
- Read-only: `docs/superpowers/specs/2026-07-06-p7-oi-research-solution-skill-contract-freeze-design.md`
- Read-only: `docs/superpowers/plans/2026-07-06-p7-oi-research-solution-skill-contract.md`
- Read-only: `docs/superpowers/specs/2026-07-06-p8-agent-session-replay-contract-freeze-design.md`
- Read-only: `docs/agent-workbench/handoff-p4.md`
- Read-only: `src/lib/agent-runtime/**`
- Read-only: `src/lib/agent-workbench/**`
- Read-only: `src/lib/problem-workspace/**`
- Read-only: `src/lib/oi-skills/**`
- Read-only: `src/components/agent-workbench/**`

- [ ] **Step 1: Record current status**

Run:

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -10 --decorate
```

Expected: filtered status is empty or unrelated existing changes are explicitly named and left untouched; staged paths are empty.

- [ ] **Step 2: Confirm P8 input state**

Run:

```powershell
rg -n 'OI Research/Solution Skill Contract Preview|Agent Session/Replay Contract Preview|P8 Agent Session' docs/superpowers/specs/2026-07-06-p8-agent-session-replay-contract-freeze-design.md docs/agent-workbench/handoff-p4.md
rg -n '真实 provider request|prompt construction|model loop|patch apply|Cookie-backed reader|session persistence' docs/superpowers/specs/2026-07-06-p8-agent-session-replay-contract-freeze-design.md
```

Expected: P8 spec is present, P7 handoff is present, and P8 forbidden capabilities are explicitly listed.

- [ ] **Step 3: Confirm no implementation commit**

No files are staged. No commit is created for Task 0.

## Task 1: Agent Session Contract Types

**Files:**
- Modify: `src/lib/agent-runtime/agentTypes.ts`
- Modify: `src/lib/agent-runtime/agentTypes.test.ts`
- Modify: `src/lib/agent-runtime/agentSession.ts`
- Test: `src/lib/agent-runtime/agentTypes.test.ts`

- [ ] **Step 1: Write failing contract tests**

Append tests to `src/lib/agent-runtime/agentTypes.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import type {
  AgentReplayCapabilityStatus,
  AgentReplayPrivacyClassification,
  AgentSessionMetadata,
} from "./agentTypes";
import { createAgentSessionMetadata } from "./agentSession";

describe("P8 agent session contract", () => {
  it("records P8 input and output states without opening future capabilities", () => {
    const metadata = createAgentSessionMetadata({
      sessionId: "session:p8",
      workspaceId: "workspace:p3379",
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
      privacyPolicyId: "privacy:p8-preview",
    });

    expect(metadata.phase).toBe("P8 Agent Session / Replay Contract Freeze");
    expect(metadata.inputState).toBe("OI Research/Solution Skill Contract Preview");
    expect(metadata.outputState).toBe("Agent Session/Replay Contract Preview");
    expect(metadata.capabilities.modelLoop.status).toBe("unavailable");
    expect(metadata.capabilities.patchApply.status).toBe("unavailable");
    expect(metadata.capabilities.sessionReplay.status).toBe("preview");
  });

  it("keeps replay capability statuses explicit", () => {
    const statuses: AgentReplayCapabilityStatus[] = ["preview", "reserved", "unavailable", "blocked", "degraded"];
    expect(statuses).toContain("preview");
    expect(statuses).toContain("unavailable");
  });

  it("classifies sensitive replay payloads for redaction", () => {
    const classifications: AgentReplayPrivacyClassification[] = [
      "public",
      "local-note",
      "cookie",
      "secret",
      "user-input",
      "derived-evidence",
      "runtime-metadata",
    ];

    expect(classifications).toContain("cookie");
    expect(classifications).toContain("secret");
  });

  it("allows metadata to be assembled as a serializable contract", () => {
    const metadata = {
      sessionId: "session:p8",
      workspaceId: "workspace:p3379",
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
      phase: "P8 Agent Session / Replay Contract Freeze",
      inputState: "OI Research/Solution Skill Contract Preview",
      outputState: "Agent Session/Replay Contract Preview",
      status: "replayable",
      privacyPolicyId: "privacy:p8-preview",
      replaySource: "fixture",
      capabilities: {
        sessionReplay: { status: "preview", reason: "p8_contract_preview" },
        modelLoop: { status: "unavailable", reason: "model_loop_not_in_p8" },
        providerRequest: { status: "unavailable", reason: "provider_request_not_in_p8" },
        patchApply: { status: "unavailable", reason: "patch_apply_not_in_p8" },
        execute: { status: "unavailable", reason: "execute_not_in_p8" },
        cookieReader: { status: "unavailable", reason: "cookie_reader_not_in_p8" },
        persistence: { status: "unavailable", reason: "persistence_not_in_p8" },
      },
    } satisfies AgentSessionMetadata;

    expect(JSON.parse(JSON.stringify(metadata)).sessionId).toBe("session:p8");
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/agentTypes.test.ts
```

Expected: FAIL because P8 metadata types and `createAgentSessionMetadata` do not exist.

- [ ] **Step 3: Add P8 types**

In `src/lib/agent-runtime/agentTypes.ts`, add:

```typescript
export type AgentSessionReplayState =
  | "idle"
  | "running"
  | "blocked"
  | "interrupted"
  | "completed"
  | "failed"
  | "replayable"
  | "replay-mismatch";

export type AgentReplayCapabilityStatus =
  | "preview"
  | "reserved"
  | "unavailable"
  | "blocked"
  | "degraded";

export type AgentReplayCapability = {
  status: AgentReplayCapabilityStatus;
  reason: string;
};

export type AgentReplayCapabilityMatrix = {
  sessionReplay: AgentReplayCapability;
  modelLoop: AgentReplayCapability;
  providerRequest: AgentReplayCapability;
  patchApply: AgentReplayCapability;
  execute: AgentReplayCapability;
  cookieReader: AgentReplayCapability;
  persistence: AgentReplayCapability;
};

export type AgentReplaySource = "fixture" | "event-log" | "checkpoint";

export type AgentSessionMetadata = {
  sessionId: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  phase: "P8 Agent Session / Replay Contract Freeze";
  inputState: "OI Research/Solution Skill Contract Preview";
  outputState: "Agent Session/Replay Contract Preview";
  status: AgentSessionReplayState;
  privacyPolicyId: string;
  replaySource: AgentReplaySource;
  capabilities: AgentReplayCapabilityMatrix;
};

export type AgentReplayPrivacyClassification =
  | "public"
  | "local-note"
  | "cookie"
  | "secret"
  | "user-input"
  | "derived-evidence"
  | "runtime-metadata";

export type AgentReplayPrivacyVisibility =
  | "ui-visible"
  | "runtime-only"
  | "redacted"
  | "forbidden-for-model"
  | "forbidden-for-third-party";

export type AgentReplayRedaction = {
  classification: AgentReplayPrivacyClassification;
  visibility: AgentReplayPrivacyVisibility;
  redactionStrategy: "none" | "mask" | "drop" | "hash";
  reason: string;
  sourceRef?: string;
};
```

- [ ] **Step 4: Add metadata helper**

In `src/lib/agent-runtime/agentSession.ts`, add:

```typescript
import type { AgentSessionMetadata } from "./agentTypes";

export function createAgentSessionMetadata(input: {
  sessionId: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  privacyPolicyId: string;
}): AgentSessionMetadata {
  return {
    sessionId: input.sessionId,
    workspaceId: input.workspaceId,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    phase: "P8 Agent Session / Replay Contract Freeze",
    inputState: "OI Research/Solution Skill Contract Preview",
    outputState: "Agent Session/Replay Contract Preview",
    status: "replayable",
    privacyPolicyId: input.privacyPolicyId,
    replaySource: "fixture",
    capabilities: {
      sessionReplay: { status: "preview", reason: "p8_contract_preview" },
      modelLoop: { status: "unavailable", reason: "model_loop_not_in_p8" },
      providerRequest: { status: "unavailable", reason: "provider_request_not_in_p8" },
      patchApply: { status: "unavailable", reason: "patch_apply_not_in_p8" },
      execute: { status: "unavailable", reason: "execute_not_in_p8" },
      cookieReader: { status: "unavailable", reason: "cookie_reader_not_in_p8" },
      persistence: { status: "unavailable", reason: "persistence_not_in_p8" },
    },
  };
}
```

If the file already imports from `agentTypes`, merge imports into a single type import.

- [ ] **Step 5: Run GREEN**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/agentTypes.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: tests pass and typecheck passes.

- [ ] **Step 6: Commit**

Run:

```powershell
git status --short -- . ":(exclude)notes/**"
git add -- src/lib/agent-runtime/agentTypes.ts src/lib/agent-runtime/agentTypes.test.ts src/lib/agent-runtime/agentSession.ts
git diff --cached --name-only
git commit -m "feat: define p8 agent session contracts"
```

Expected staged paths: only the three listed `src/lib/agent-runtime/**` files.

## Task 2: Event Log / Replay Fixture

**Files:**
- Create: `src/lib/agent-runtime/agentReplay.ts`
- Create: `src/lib/agent-runtime/agentReplay.test.ts`
- Modify: `src/lib/agent-runtime/eventStream.ts`
- Modify: `src/lib/agent-runtime/eventStream.test.ts`

- [ ] **Step 1: Write failing replay tests**

Create `src/lib/agent-runtime/agentReplay.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import type { AgentReplayEventLogEntry, AgentReplayFixture } from "./agentReplay";
import { replayAgentSession } from "./agentReplay";

const event = (sequence: number, type: AgentReplayEventLogEntry["type"], payload: Record<string, unknown> = {}): AgentReplayEventLogEntry => ({
  id: `event:${sequence}`,
  type,
  sessionId: "session:p8",
  at: `2026-07-06T00:00:0${sequence}.000Z`,
  sequence,
  source: "runtime",
  payload,
  redaction: { classification: "runtime-metadata", visibility: "ui-visible", redactionStrategy: "none", reason: "fixture" },
});

describe("replayAgentSession", () => {
  it("replays ordered events into a deterministic read model", () => {
    const fixture: AgentReplayFixture = {
      metadata: {
        sessionId: "session:p8",
        workspaceId: "workspace:p3379",
        createdAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:03.000Z",
        phase: "P8 Agent Session / Replay Contract Freeze",
        inputState: "OI Research/Solution Skill Contract Preview",
        outputState: "Agent Session/Replay Contract Preview",
        status: "replayable",
        privacyPolicyId: "privacy:p8-preview",
        replaySource: "fixture",
        capabilities: {
          sessionReplay: { status: "preview", reason: "p8_contract_preview" },
          modelLoop: { status: "unavailable", reason: "model_loop_not_in_p8" },
          providerRequest: { status: "unavailable", reason: "provider_request_not_in_p8" },
          patchApply: { status: "unavailable", reason: "patch_apply_not_in_p8" },
          execute: { status: "unavailable", reason: "execute_not_in_p8" },
          cookieReader: { status: "unavailable", reason: "cookie_reader_not_in_p8" },
          persistence: { status: "unavailable", reason: "persistence_not_in_p8" },
        },
      },
      events: [
        event(1, "agent.started"),
        event(2, "evidence.added", { evidenceIds: ["E1"] }),
        event(3, "workspace.updated", { workspaceId: "workspace:p3379" }),
      ],
      checkpoints: [],
    };

    const first = replayAgentSession(fixture);
    const second = replayAgentSession(fixture);

    expect(first.status).toBe("completed");
    expect(first.eventCount).toBe(3);
    expect(first.evidenceIds).toEqual(["E1"]);
    expect(second).toEqual(first);
  });

  it("fails replay when event ordering is invalid", () => {
    const fixture = {
      metadata: {
        sessionId: "session:p8",
        workspaceId: "workspace:p3379",
        createdAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:02.000Z",
        phase: "P8 Agent Session / Replay Contract Freeze",
        inputState: "OI Research/Solution Skill Contract Preview",
        outputState: "Agent Session/Replay Contract Preview",
        status: "replayable",
        privacyPolicyId: "privacy:p8-preview",
        replaySource: "fixture",
        capabilities: {
          sessionReplay: { status: "preview", reason: "p8_contract_preview" },
          modelLoop: { status: "unavailable", reason: "model_loop_not_in_p8" },
          providerRequest: { status: "unavailable", reason: "provider_request_not_in_p8" },
          patchApply: { status: "unavailable", reason: "patch_apply_not_in_p8" },
          execute: { status: "unavailable", reason: "execute_not_in_p8" },
          cookieReader: { status: "unavailable", reason: "cookie_reader_not_in_p8" },
          persistence: { status: "unavailable", reason: "persistence_not_in_p8" },
        },
      },
      events: [event(2, "agent.started"), event(1, "workspace.updated")],
      checkpoints: [],
    } satisfies AgentReplayFixture;

    expect(replayAgentSession(fixture).failureReasons).toContain("event-order-invalid");
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/agentReplay.test.ts
```

Expected: FAIL because `agentReplay.ts` does not exist.

- [ ] **Step 3: Implement in-memory replay projector**

Create `src/lib/agent-runtime/agentReplay.ts`:

```typescript
import type { AgentEventType, AgentReplayRedaction, AgentSessionMetadata } from "./agentTypes";

export type AgentReplayFailureReason =
  | "event-order-invalid"
  | "event-session-mismatch"
  | "checkpoint-missing"
  | "checkpoint-session-mismatch"
  | "redaction-policy-violation"
  | "unsupported-event-type"
  | "reserved-capability-event"
  | "unavailable-capability-event"
  | "replay-fixture-invalid";

export type AgentReplayEventLogEntry = {
  id: string;
  type: AgentEventType;
  sessionId: string;
  at: string;
  sequence: number;
  source: "runtime" | "tool" | "permission" | "workspace" | "fixture";
  payload: Record<string, unknown>;
  redaction: AgentReplayRedaction;
  causationId?: string;
  correlationId?: string;
};

export type AgentReplayCheckpoint = {
  checkpointId: string;
  sessionId: string;
  afterSequence: number;
  workspaceSnapshot: Record<string, unknown>;
  evidenceSnapshot: Record<string, unknown>;
  skillSnapshot: Record<string, unknown>;
  capabilitySnapshot: AgentSessionMetadata["capabilities"];
  privacySnapshot: Record<string, unknown>;
};

export type AgentReplayFixture = {
  metadata: AgentSessionMetadata;
  events: AgentReplayEventLogEntry[];
  checkpoints: AgentReplayCheckpoint[];
};

export type AgentReplayReadModel = {
  sessionId: string;
  workspaceId: string;
  status: "completed" | "failed";
  outputState: "Agent Session/Replay Contract Preview";
  eventCount: number;
  evidenceIds: string[];
  workspaceIds: string[];
  checkpointIds: string[];
  capabilityStatuses: AgentSessionMetadata["capabilities"];
  failureReasons: AgentReplayFailureReason[];
};

const ordered = (events: AgentReplayEventLogEntry[]): boolean =>
  events.every((entry, index) => index === 0 || entry.sequence > events[index - 1].sequence);

const evidenceIdsFrom = (events: AgentReplayEventLogEntry[]): string[] =>
  events.flatMap((entry) => Array.isArray(entry.payload.evidenceIds) ? entry.payload.evidenceIds.filter((id): id is string => typeof id === "string") : []);

const workspaceIdsFrom = (events: AgentReplayEventLogEntry[]): string[] =>
  events.flatMap((entry) => typeof entry.payload.workspaceId === "string" ? [entry.payload.workspaceId] : []);

export function replayAgentSession(fixture: AgentReplayFixture): AgentReplayReadModel {
  const failureReasons: AgentReplayFailureReason[] = [];

  if (!ordered(fixture.events)) {
    failureReasons.push("event-order-invalid");
  }

  if (fixture.events.some((entry) => entry.sessionId !== fixture.metadata.sessionId)) {
    failureReasons.push("event-session-mismatch");
  }

  if (fixture.events.some((entry) => entry.redaction.classification === "cookie" && entry.redaction.visibility === "ui-visible")) {
    failureReasons.push("redaction-policy-violation");
  }

  if (fixture.checkpoints.some((checkpoint) => checkpoint.sessionId !== fixture.metadata.sessionId)) {
    failureReasons.push("checkpoint-session-mismatch");
  }

  return {
    sessionId: fixture.metadata.sessionId,
    workspaceId: fixture.metadata.workspaceId,
    status: failureReasons.length > 0 ? "failed" : "completed",
    outputState: "Agent Session/Replay Contract Preview",
    eventCount: fixture.events.length,
    evidenceIds: evidenceIdsFrom(fixture.events),
    workspaceIds: workspaceIdsFrom(fixture.events),
    checkpointIds: fixture.checkpoints.map((checkpoint) => checkpoint.checkpointId),
    capabilityStatuses: fixture.metadata.capabilities,
    failureReasons,
  };
}
```

- [ ] **Step 4: Add replay-safe event stream helper**

In `src/lib/agent-runtime/eventStream.ts`, add a helper that does not mutate the stream:

```typescript
export function snapshotEventsWithSequence(events: AgentEvent[]): Array<AgentEvent & { sequence: number }> {
  return events.map((event, index) => ({
    ...event,
    sequence: index + 1,
  }));
}
```

In `src/lib/agent-runtime/eventStream.test.ts`, add:

```typescript
import { snapshotEventsWithSequence } from "./eventStream";

it("assigns deterministic replay sequence numbers", () => {
  const sequenced = snapshotEventsWithSequence([
    { id: "e1", type: "agent.started", sessionId: "s1", at: "2026-07-06T00:00:00.000Z", payload: {} },
    { id: "e2", type: "workspace.updated", sessionId: "s1", at: "2026-07-06T00:00:01.000Z", payload: {} },
  ]);

  expect(sequenced.map((event) => event.sequence)).toEqual([1, 2]);
});
```

- [ ] **Step 5: Run GREEN**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/agentReplay.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime/eventStream.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: listed tests and typecheck pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add -- src/lib/agent-runtime/agentReplay.ts src/lib/agent-runtime/agentReplay.test.ts src/lib/agent-runtime/eventStream.ts src/lib/agent-runtime/eventStream.test.ts
git diff --cached --name-only
git commit -m "feat: add p8 session replay fixture"
```

Expected staged paths: only the four listed `src/lib/agent-runtime/**` files.

## Task 3: Workspace/Evidence Session Linkage

**Files:**
- Modify: `src/lib/problem-workspace/problemWorkspaceTypes.ts`
- Modify: `src/lib/problem-workspace/problemWorkspaceDefaults.ts`
- Modify: `src/lib/problem-workspace/problemWorkspaceStore.ts`
- Modify: `src/lib/problem-workspace/problemWorkspaceTypes.test.ts`
- Modify: `src/lib/problem-workspace/problemWorkspaceStore.test.ts`
- Modify: `src/lib/oi-skills/oiSkillTypes.ts`
- Modify: `src/lib/oi-skills/oiSkillTypes.test.ts`

- [ ] **Step 1: Write failing linkage tests**

Append to `src/lib/problem-workspace/problemWorkspaceTypes.test.ts`:

```typescript
it("stores P8 session replay linkage without reading notes", () => {
  const workspace = createProblemWorkspace({
    problemId: "P3379",
    title: "LCA",
    sessionIds: ["session:p8"],
    replayCheckpointIds: ["checkpoint:p8:1"],
    traceEventIds: ["event:1"],
    evidenceIds: ["E1"],
  });

  expect(workspace.sessionIds).toEqual(["session:p8"]);
  expect(workspace.replayCheckpointIds).toEqual(["checkpoint:p8:1"]);
});
```

Append to `src/lib/oi-skills/oiSkillTypes.test.ts`:

```typescript
it("lets P7 skill read models reference P8 sessions without changing skill capability", () => {
  const readModel = {
    invocation: {
      invocationId: "skill:research-problem:P3379",
      skillId: "research-problem",
      problemRef: { platform: "luogu", problemId: "P3379", title: "LCA" },
      mode: "preview",
    },
    status: "completed",
    problemRef: { platform: "luogu", problemId: "P3379", title: "LCA" },
    sources: [],
    evidence: [],
    solutionOutline: null,
    permissionRequests: [],
    traceEvents: [],
    limitations: ["deterministic_preview_only"],
    sessionLinkage: {
      sessionId: "session:p8",
      replayCheckpointIds: ["checkpoint:p8:1"],
      traceEventIds: ["event:1"],
    },
  } satisfies OiSkillReadModel;

  expect(readModel.sessionLinkage?.sessionId).toBe("session:p8");
  expect(readModel.limitations).toContain("deterministic_preview_only");
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/problem-workspace src/lib/oi-skills
```

Expected: FAIL because P8 linkage fields do not exist.

- [ ] **Step 3: Extend ProblemWorkspace linkage**

In `src/lib/problem-workspace/problemWorkspaceTypes.ts`, add fields to `ProblemWorkspace`:

```typescript
  sessionIds: string[];
  replayCheckpointIds: string[];
```

Add optional create input fields:

```typescript
    sessionIds?: string[];
    replayCheckpointIds?: string[];
```

In `src/lib/problem-workspace/problemWorkspaceDefaults.ts`, add defaults:

```typescript
    sessionIds: input.sessionIds ?? [],
    replayCheckpointIds: input.replayCheckpointIds ?? [],
```

In `src/lib/problem-workspace/problemWorkspaceStore.ts`, preserve updates:

```typescript
        sessionIds: patch.sessionIds ?? current.sessionIds,
        replayCheckpointIds: patch.replayCheckpointIds ?? current.replayCheckpointIds,
```

- [ ] **Step 4: Extend OI skill read model linkage**

In `src/lib/oi-skills/oiSkillTypes.ts`, add:

```typescript
export type OiSkillSessionLinkage = {
  sessionId: string;
  replayCheckpointIds: string[];
  traceEventIds: string[];
};
```

Add to `OiSkillReadModel`:

```typescript
  sessionLinkage?: OiSkillSessionLinkage;
```

In `src/lib/oi-skills/index.ts`, export `OiSkillSessionLinkage`.

- [ ] **Step 5: Run GREEN**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/problem-workspace
node .\node_modules\vitest\vitest.mjs run src/lib/oi-skills
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: problem-workspace tests, oi-skills tests, and typecheck pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add -- src/lib/problem-workspace/problemWorkspaceTypes.ts src/lib/problem-workspace/problemWorkspaceDefaults.ts src/lib/problem-workspace/problemWorkspaceStore.ts src/lib/problem-workspace/problemWorkspaceTypes.test.ts src/lib/problem-workspace/problemWorkspaceStore.test.ts src/lib/oi-skills/oiSkillTypes.ts src/lib/oi-skills/oiSkillTypes.test.ts src/lib/oi-skills/index.ts
git diff --cached --name-only
git commit -m "feat: link p8 sessions to workbench evidence"
```

Expected staged paths: only the listed problem-workspace and oi-skills files.

## Task 4: Workbench Replay Projection

**Files:**
- Create: `src/lib/agent-workbench/sessionReplayViewModel.ts`
- Create: `src/lib/agent-workbench/sessionReplayViewModel.test.ts`
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.ts`
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.test.ts`
- Create: `src/components/agent-workbench/SessionReplayPanel.tsx`
- Modify: `src/components/agent-workbench/AgentWorkbenchShell.tsx`

- [ ] **Step 1: Write failing view-model tests**

Create `src/lib/agent-workbench/sessionReplayViewModel.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { createSessionReplayViewModel } from "./sessionReplayViewModel";

describe("createSessionReplayViewModel", () => {
  it("projects replay read model for read-only Workbench display", () => {
    const model = createSessionReplayViewModel({
      sessionId: "session:p8",
      workspaceId: "workspace:p3379",
      status: "completed",
      outputState: "Agent Session/Replay Contract Preview",
      eventCount: 3,
      evidenceIds: ["E1"],
      workspaceIds: ["workspace:p3379"],
      checkpointIds: ["checkpoint:p8:1"],
      capabilityStatuses: {
        sessionReplay: { status: "preview", reason: "p8_contract_preview" },
        modelLoop: { status: "unavailable", reason: "model_loop_not_in_p8" },
        providerRequest: { status: "unavailable", reason: "provider_request_not_in_p8" },
        patchApply: { status: "unavailable", reason: "patch_apply_not_in_p8" },
        execute: { status: "unavailable", reason: "execute_not_in_p8" },
        cookieReader: { status: "unavailable", reason: "cookie_reader_not_in_p8" },
        persistence: { status: "unavailable", reason: "persistence_not_in_p8" },
      },
      failureReasons: [],
    });

    expect(model.title).toBe("Agent Session/Replay Contract Preview");
    expect(model.timeline.eventCount).toBe(3);
    expect(model.linkage.evidenceIds).toEqual(["E1"]);
    expect(model.capabilities.modelLoop.status).toBe("unavailable");
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench/sessionReplayViewModel.test.ts
```

Expected: FAIL because `sessionReplayViewModel.ts` does not exist.

- [ ] **Step 3: Implement view model**

Create `src/lib/agent-workbench/sessionReplayViewModel.ts`:

```typescript
import type { AgentReplayReadModel } from "@/lib/agent-runtime/agentReplay";

export type SessionReplayViewModel = {
  title: "Agent Session/Replay Contract Preview";
  sessionId: string;
  status: AgentReplayReadModel["status"];
  timeline: {
    eventCount: number;
    checkpointCount: number;
  };
  linkage: {
    workspaceId: string;
    workspaceIds: string[];
    evidenceIds: string[];
    checkpointIds: string[];
  };
  capabilities: AgentReplayReadModel["capabilityStatuses"];
  failureReasons: AgentReplayReadModel["failureReasons"];
};

export function createSessionReplayViewModel(readModel: AgentReplayReadModel): SessionReplayViewModel {
  return {
    title: "Agent Session/Replay Contract Preview",
    sessionId: readModel.sessionId,
    status: readModel.status,
    timeline: {
      eventCount: readModel.eventCount,
      checkpointCount: readModel.checkpointIds.length,
    },
    linkage: {
      workspaceId: readModel.workspaceId,
      workspaceIds: readModel.workspaceIds,
      evidenceIds: readModel.evidenceIds,
      checkpointIds: readModel.checkpointIds,
    },
    capabilities: readModel.capabilityStatuses,
    failureReasons: readModel.failureReasons,
  };
}
```

- [ ] **Step 4: Attach replay read model to Workbench task flow**

In `src/lib/agent-workbench/workbenchTaskFlow.ts`, import:

```typescript
import { replayAgentSession, type AgentReplayReadModel } from "@/lib/agent-runtime/agentReplay";
import { createAgentSessionMetadata } from "@/lib/agent-runtime/agentSession";
import { snapshotEventsWithSequence } from "@/lib/agent-runtime/eventStream";
import { createSessionReplayViewModel, type SessionReplayViewModel } from "./sessionReplayViewModel";
```

Add to `ManualWorkbenchTaskResult`:

```typescript
  sessionReplay: AgentReplayReadModel;
  sessionReplayViewModel: SessionReplayViewModel;
```

After `events` are available, create:

```typescript
  const metadata = createAgentSessionMetadata({
    sessionId: events[0]?.sessionId ?? `session:${workspace.id}:p8`,
    workspaceId: workspace.id,
    createdAt: "2026-07-06T00:00:00.000Z",
    updatedAt: "2026-07-06T00:00:00.000Z",
    privacyPolicyId: "privacy:p8-preview",
  });
  const sessionReplay = replayAgentSession({
    metadata,
    events: snapshotEventsWithSequence(events).map((event) => ({
      id: event.id,
      type: event.type,
      sessionId: event.sessionId,
      at: event.at,
      sequence: event.sequence,
      source: "runtime",
      payload: event.payload,
      redaction: {
        classification: "runtime-metadata",
        visibility: "ui-visible",
        redactionStrategy: "none",
        reason: "workbench_preview_event",
      },
    })),
    checkpoints: [],
  });
  const sessionReplayViewModel = createSessionReplayViewModel(sessionReplay);
```

Add both `sessionReplay` and `sessionReplayViewModel` to the returned object.

In `src/lib/agent-workbench/workbenchTaskFlow.test.ts`, add assertions:

```typescript
expect(result.sessionReplay.outputState).toBe("Agent Session/Replay Contract Preview");
expect(result.sessionReplayViewModel.title).toBe("Agent Session/Replay Contract Preview");
expect(result.sessionReplay.capabilityStatuses.providerRequest.status).toBe("unavailable");
```

- [ ] **Step 5: Add read-only UI panel**

Create `src/components/agent-workbench/SessionReplayPanel.tsx`:

```tsx
import type { SessionReplayViewModel } from "@/lib/agent-workbench/sessionReplayViewModel";

export function SessionReplayPanel({ replay }: { replay: SessionReplayViewModel | null }) {
  return (
    <section className="grid gap-3 border border-border/70 bg-background p-3">
      <header className="grid gap-1">
        <div className="text-xs font-medium text-foreground">Session replay</div>
        <div className="text-[11px] text-muted-foreground">
          {replay ? `${replay.sessionId} · ${replay.status}` : "No replay captured."}
        </div>
      </header>
      {replay ? (
        <div className="grid gap-2 text-[11px] text-muted-foreground">
          <div>Events: {replay.timeline.eventCount}</div>
          <div>Checkpoints: {replay.timeline.checkpointCount}</div>
          <div>Evidence: {replay.linkage.evidenceIds.length}</div>
          <div>Session replay: {replay.capabilities.sessionReplay.status}</div>
          <div>Model loop: {replay.capabilities.modelLoop.status}</div>
          <div>Patch apply: {replay.capabilities.patchApply.status}</div>
          <div>Execute: {replay.capabilities.execute.status}</div>
          <div>Cookie reader: {replay.capabilities.cookieReader.status}</div>
        </div>
      ) : null}
    </section>
  );
}
```

In `src/components/agent-workbench/AgentWorkbenchShell.tsx`, import the type and component:

```typescript
import type { SessionReplayViewModel } from "@/lib/agent-workbench/sessionReplayViewModel";
import { SessionReplayPanel } from "./SessionReplayPanel";
```

Add state:

```typescript
const [currentSessionReplay, setCurrentSessionReplay] = useState<SessionReplayViewModel | null>(null);
```

After `runWorkbenchTask` result:

```typescript
setCurrentSessionReplay(result.sessionReplayViewModel);
```

Render:

```tsx
<SessionReplayPanel replay={currentSessionReplay} />
```

- [ ] **Step 6: Run GREEN**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench/sessionReplayViewModel.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: listed tests and typecheck pass.

- [ ] **Step 7: Commit**

Run:

```powershell
git add -- src/lib/agent-workbench/sessionReplayViewModel.ts src/lib/agent-workbench/sessionReplayViewModel.test.ts src/lib/agent-workbench/workbenchTaskFlow.ts src/lib/agent-workbench/workbenchTaskFlow.test.ts src/components/agent-workbench/SessionReplayPanel.tsx src/components/agent-workbench/AgentWorkbenchShell.tsx
git diff --cached --name-only
git commit -m "feat: project p8 session replay in workbench"
```

Expected staged paths: only the six listed agent-workbench/component files.

## Task 5: Boundary Audit And Handoff

**Files:**
- Modify: `docs/agent-workbench/handoff-p4.md`
- Optional modify: focused test files only when a literal audit false positive appears in new tests and can be rewritten without weakening coverage

- [ ] **Step 1: Run final tests**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench
node .\node_modules\vitest\vitest.mjs run src/lib/problem-workspace
node .\node_modules\vitest\vitest.mjs run src/lib/oi-skills
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: all focused suites and typecheck pass.

- [ ] **Step 2: Run no-hit audits**

Run:

```powershell
rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'
rg -n 'providerId|modelId|chat_with_current_note_stream|model\.delta|prompt construction|OpenAI' src/lib/agent-workbench src/components/agent-workbench src/lib/problem-workspace src/lib/oi-skills
rg -n 'write|patch apply|execute|Cookie-backed|request log|session storage' src/lib/agent-workbench src/components/agent-workbench src/lib/problem-workspace src/lib/oi-skills
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

Expected: `rg` audits are no-hit for the changed surface. If a test intentionally contains a forbidden literal to prove a guard, rewrite the string with runtime concatenation and keep the assertion.

- [ ] **Step 3: Append P8 handoff**

Append to `docs/agent-workbench/handoff-p4.md`:

```markdown
## P8 Agent Session / Replay Contract Freeze handoff

P8 输出状态：**Agent Session/Replay Contract Preview**。本阶段冻结 session metadata、event log、replay fixture、checkpoint、privacy/redaction、workspace/evidence linkage 和 Workbench read-only replay projection，不代表真实 model loop、provider adapter、patch workflow、execute runner、Cookie-backed reader 或 persistence 可用。

P8 已冻结 / 已合入：

- Agent session metadata：记录 P8 input/output state、workspace id、privacy policy id、capability statuses。
- Event log / replay fixture：按 sequence deterministic replay，ordering/session/redaction failure 有结构化 reason。
- Checkpoint contract：fixture / in-memory checkpoint 作为恢复边界，不是 storage 实现。
- Privacy/redaction contract：Cookie、secret、local-note 等分类进入 policy type，不进入 fixture 明文或第三方 payload。
- Workspace/evidence/session linkage：ProblemWorkspace、OI skill read model 和 replay read model 可以互相定位。
- Workbench replay projection：UI 只读展示 replay view model，不拥有 replay decision。

P8 仍禁止 / 未实现：

- 真实 provider request、prompt construction、model loop、streaming。
- 真实 write、patch apply、execute、code runner、delete、rollback。
- Cookie-backed reader。
- session persistence、storage、request log。
- 旧 `src/components/ai/AiSidebar.tsx` 迁移。
- 绕过 `src/lib/api.ts` 或修改 `notes/**`。

最终验证记录：

- 逐条记录 Step 1 实际执行的命令、PASS/FAIL 结果、test file count、test count；未执行的命令不得写入本节。
- API boundary audit：记录 no-hit 或 changed-surface scoped result。
- Provider/model audit：记录 no-hit 或解释既有 protocol literal。
- Write/patch/execute/Cookie/storage audit：记录 no-hit。

下一阶段必须新写 freeze spec，才能讨论 provider/model adapter contract、patch workflow contract、tool execution runner contract、Cookie-backed reader contract、session persistence/storage contract 或 Workbench IA replay/detail contract。
```

- [ ] **Step 4: Commit handoff**

Run:

```powershell
git add -- docs/agent-workbench/handoff-p4.md
git diff --cached --name-only
git commit -m "docs: record p8 session replay handoff"
```

Expected staged paths: only `docs/agent-workbench/handoff-p4.md`, unless a focused test false-positive cleanup was required and reported.

## Task 6: Supervisor Final Acceptance

**Files:**
- Read-only in supervisor checkout

- [ ] **Step 1: Verify main checkout**

Run:

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -10 --decorate
```

Expected: main checkout is clean and includes all P8 commits.

- [ ] **Step 2: Re-run acceptance**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench
node .\node_modules\vitest\vitest.mjs run src/lib/problem-workspace
node .\node_modules\vitest\vitest.mjs run src/lib/oi-skills
node .\node_modules\typescript\bin\tsc --noEmit
rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'
rg -n 'providerId|modelId|chat_with_current_note_stream|model\.delta|prompt construction|OpenAI' src/lib/agent-workbench src/components/agent-workbench src/lib/problem-workspace src/lib/oi-skills
rg -n 'write|patch apply|execute|Cookie-backed|request log|session storage' src/lib/agent-workbench src/components/agent-workbench src/lib/problem-workspace src/lib/oi-skills
```

Expected: tests/typecheck pass and changed-surface audits are no-hit.

- [ ] **Step 3: Report acceptance**

Supervisor report must include:

```text
Verdict:
P8 output state:
Merged commits:
Changed files by slice:
Verification commands and results:
No-hit audit results:
Remaining forbidden capabilities:
Final filtered status:
Final staged paths:
Push status:
```

No commit is required for Task 6 unless the supervisor creates a separate closeout doc by explicit user request.

## Plan Self-Review

- Spec coverage: Tasks cover P8 session metadata/types, event log/replay fixture, snapshot/checkpoint, privacy/redaction, workspace/evidence/session linkage, Workbench replay projection, boundary audit, handoff, and supervisor acceptance.
- Placeholder scan: the plan uses concrete files, commands, expected results, staging paths, and commit messages.
- Type consistency: `AgentSessionMetadata`, `AgentReplayFixture`, `AgentReplayReadModel`, `SessionReplayViewModel`, `OiSkillSessionLinkage`, and `ProblemWorkspace` linkage names are consistent across tasks.
- Scope control: no task opens provider/model/streaming/write/patch/execute/Cookie/persistence or old AiSidebar migration.
- Verification: each implementation slice has focused tests, typecheck, exact-path staging, and changed-surface no-hit audits where relevant.
