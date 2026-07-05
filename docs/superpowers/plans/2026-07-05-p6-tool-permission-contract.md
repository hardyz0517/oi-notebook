# P6 Tool/Permission Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 P5 的 `preview_one_shot` runtime 推进为 `Tool/Permission Contract Preview`，冻结工具 schema、权限决策、生命周期事件和 unavailable/reserved guard。

**Architecture:** P6 只改 Agent runtime / Workbench preview contract，不接入真实 provider、prompt、model request、streaming、write、patch、execute、Cookie 或 persistence。ToolRegistry 负责注册与路由基础，PermissionManager 负责 policy decision，AgentRuntime 负责 lifecycle events 与 guard，Workbench 只消费 policy/runtime 输出。

**Tech Stack:** TypeScript, Vitest, React Workbench view-model glue, existing `src/lib/agent-runtime/**` and `src/lib/agent-workbench/**`.

---

## 0. 阶段边界

阶段名称：**P6 Tool/Permission Contract Freeze**

对应总 spec 层级：Tool Layer / Permission And Safety Layer / Session Event Protocol。

本阶段输出状态建议名：**Tool/Permission Contract Preview**

必须先读：

- `AGENTS.md`
- `docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md`
- `docs/superpowers/specs/2026-07-05-p5-agent-core-contract-freeze-design.md`
- `docs/superpowers/specs/2026-07-05-p6-tool-permission-contract-freeze-design.md`
- `docs/agent-workbench/handoff-p4.md`
- `src/lib/agent-runtime/agentTypes.ts`
- `src/lib/agent-runtime/toolRegistry.ts`
- `src/lib/agent-runtime/permissionManager.ts`
- `src/lib/agent-runtime/agentRuntime.ts`
- `src/lib/agent-runtime/agentLoopContract.ts`
- `src/lib/agent-workbench/workbenchTaskFlow.ts`

启动命令：

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -8 --decorate
```

全局禁止：

- 不改 `notes/**`。
- 不改 `src/components/ai/**`。
- 不接 provider / prompt / model request / streaming。
- 不实现真实 write / patch apply / execute / code runner / delete / rollback。
- 不实现 Cookie-backed Luogu reading。
- 不引入 persistence / storage。
- 不绕过 `src/lib/api.ts`。
- 不使用 `git add .`、`git add -A`、`git commit -a`。

## File Structure

- Modify: `src/lib/agent-runtime/agentTypes.ts`，定义 tool schema、permission kind、permission decision、failure policy、lifecycle metadata。
- Modify: `src/lib/agent-runtime/toolRegistry.ts`，增加 duplicate guard、unsupported lookup helper、metadata list。
- Modify: `src/lib/agent-runtime/permissionManager.ts`，从 boolean API 升级为 decision result，同时保留兼容 wrapper 或同步更新调用点。
- Modify: `src/lib/agent-runtime/agentRuntime.ts`，增加 `permission.resolved` path、structured unsupported failure、tool-supplied event guard。
- Modify or create tests under: `src/lib/agent-runtime/*.test.ts`。
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.ts`，让 unavailable permission cards 来自 policy output。
- Modify or create tests under: `src/lib/agent-workbench/*.test.ts`。
- Optional modify: `docs/agent-workbench/handoff-p4.md`，只追加 P6 closeout/handoff，不改历史事实。

## Task 0: Audit Baseline

**Files:**
- Read-only: `src/lib/agent-runtime/agentTypes.ts`
- Read-only: `src/lib/agent-runtime/toolRegistry.ts`
- Read-only: `src/lib/agent-runtime/permissionManager.ts`
- Read-only: `src/lib/agent-runtime/agentRuntime.ts`
- Read-only: `src/lib/agent-workbench/workbenchTaskFlow.ts`

- [ ] **Step 1: Record current status**

Run:

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -8 --decorate
```

Expected: filtered status understood, staged paths intentionally empty unless prior approved work exists, HEAD includes P5 handoff.

- [ ] **Step 2: Confirm current contract gaps**

Check and record these facts in the worker report:

```text
AgentToolPermission = read | network | write | execute
AgentToolDefinition = name / description / permission / run
ToolRegistry.register silently overwrites duplicates
PermissionManager returns booleans only
AgentRuntime emits permission.required but not permission.resolved
Workbench manually constructs unavailable permission cards
Tool-supplied events are not guarded by reserved/unavailable policy
```

- [ ] **Step 3: Commit**

No code commit for Task 0. This is read-only evidence.

## Task 1: Types And Schema Contract

**Files:**
- Modify: `src/lib/agent-runtime/agentTypes.ts`
- Test: `src/lib/agent-runtime/agentTypes.test.ts` or nearest existing runtime contract test

- [ ] **Step 1: Write failing tests for contract shape**

Test should assert a preview tool can declare:

```typescript
const tool = {
  name: "read_manual_url",
  description: "Read a Workbench source.",
  inputSchema: { type: "object", required: ["url"] },
  outputSchema: { type: "object", required: ["sourceUrl"] },
  permission: "read",
  exposure: "workbench-preview",
  timeoutMs: 5_000,
  lifecycle: {
    emits: ["tool.requested", "tool.started", "tool.output"],
  },
  failurePolicy: {
    unsupported: "structured-failure",
    timeout: "structured-failure",
    permissionDenied: "blocked-result",
  },
  run: async () => ({ sourceUrl: "https://example.com" }),
} satisfies AgentToolDefinition;
```

Also assert these permission kinds type-check:

```typescript
const permissions: AgentToolPermission[] = [
  "read",
  "local-note-search",
  "public-network",
  "cookie-network",
  "write",
  "patch-apply",
  "execute",
  "destructive",
];
```

- [ ] **Step 2: Run test to verify failure**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/agent-runtime
```

Expected before implementation: TypeScript/Vitest fails because fields and permission kinds do not exist.

- [ ] **Step 3: Implement minimal types**

Add lightweight metadata types in `agentTypes.ts`:

```typescript
export type AgentToolSchema = {
  type: "object" | "string" | "number" | "boolean" | "array" | "unknown";
  required?: string[];
  properties?: Record<string, AgentToolSchema>;
  items?: AgentToolSchema;
  description?: string;
};

export type AgentToolPermission =
  | "read"
  | "local-note-search"
  | "public-network"
  | "cookie-network"
  | "write"
  | "patch-apply"
  | "execute"
  | "destructive";

export type AgentToolExposure = "runtime-internal" | "workbench-preview" | "future-adapter" | "unavailable-placeholder";

export type AgentToolLifecycle = {
  emits: AgentEventType[];
};

export type AgentToolFailurePolicy = {
  unsupported: "structured-failure";
  timeout: "structured-failure";
  permissionDenied: "blocked-result" | "structured-failure";
};
```

Update `AgentToolDefinition` to include:

```typescript
inputSchema: AgentToolSchema;
outputSchema: AgentToolSchema;
exposure: AgentToolExposure;
timeoutMs: number;
lifecycle: AgentToolLifecycle;
failurePolicy: AgentToolFailurePolicy;
```

- [ ] **Step 4: Run focused tests**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/agent-runtime
```

Expected: runtime tests pass or expose call sites that still need metadata.

- [ ] **Step 5: Commit**

```powershell
git add -- src/lib/agent-runtime/agentTypes.ts src/lib/agent-runtime/agentTypes.test.ts
git commit -m "feat: define p6 tool contract types"
```

Commit can be folded with Task 2 if the worker is instructed to keep fewer commits.

## Task 2: Registry Duplicate And Unsupported Tool Guard

**Files:**
- Modify: `src/lib/agent-runtime/toolRegistry.ts`
- Test: `src/lib/agent-runtime/toolRegistry.test.ts`

- [ ] **Step 1: Write duplicate guard test**

Test intent:

```typescript
const registry = createToolRegistry();
registry.register(makeTool("read_manual_url"));
expect(() => registry.register(makeTool("read_manual_url"))).toThrow("duplicate_tool:read_manual_url");
```

- [ ] **Step 2: Write unsupported lookup test**

Test intent:

```typescript
const registry = createToolRegistry();
const result = registry.resolve("missing_tool");
expect(result).toEqual({
  status: "unsupported",
  reason: "tool_not_registered",
  toolName: "missing_tool",
});
```

- [ ] **Step 3: Implement registry result**

Add:

```typescript
export type ToolRegistryResolveResult =
  | { status: "found"; tool: AgentToolDefinition }
  | { status: "unsupported"; toolName: string; reason: "tool_not_registered" };
```

Update registry:

```typescript
register(tool) {
  if (tools.has(tool.name)) {
    throw new Error(`duplicate_tool:${tool.name}`);
  }
  tools.set(tool.name, tool);
}
resolve(name) {
  const tool = tools.get(name);
  return tool ? { status: "found", tool } : { status: "unsupported", toolName: name, reason: "tool_not_registered" };
}
```

- [ ] **Step 4: Run focused tests**

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/agent-runtime
```

Expected: duplicate and unsupported registry tests pass.

- [ ] **Step 5: Commit**

```powershell
git add -- src/lib/agent-runtime/toolRegistry.ts src/lib/agent-runtime/toolRegistry.test.ts
git commit -m "feat: guard agent tool registry"
```

## Task 3: Permission Policy Decisions

**Files:**
- Modify: `src/lib/agent-runtime/agentTypes.ts`
- Modify: `src/lib/agent-runtime/permissionManager.ts`
- Test: `src/lib/agent-runtime/permissionManager.test.ts`

- [ ] **Step 1: Write decision state tests**

Assert:

```text
read -> auto-allowed
local-note-search -> prompt-required or degraded-fallback with reason
public-network -> prompt-required
cookie-network -> unavailable
write -> prompt-required
patch-apply -> unavailable
execute -> unavailable
destructive -> blocked-by-configuration
```

- [ ] **Step 2: Add decision type**

In `agentTypes.ts` add:

```typescript
export type AgentPermissionDecisionStatus =
  | "auto-allowed"
  | "prompt-required"
  | "denied"
  | "blocked-by-configuration"
  | "unavailable"
  | "degraded-fallback";

export type AgentPermissionDecision = {
  toolName: string;
  permission: AgentToolPermission;
  status: AgentPermissionDecisionStatus;
  reason: string;
  fallbackToolName?: string;
  fallbackReason?: string;
};
```

- [ ] **Step 3: Implement policy API**

Replace or wrap boolean methods with:

```typescript
decideToolPermission(toolName: string, permission: AgentToolPermission): AgentPermissionDecision
```

Keep `canAutoRunTool()` only if needed for temporary compatibility, implemented from `decideToolPermission().status === "auto-allowed"`.

- [ ] **Step 4: Run focused tests**

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/agent-runtime
```

Expected: permission decision tests pass and existing runtime behavior remains preview-only.

- [ ] **Step 5: Commit**

```powershell
git add -- src/lib/agent-runtime/agentTypes.ts src/lib/agent-runtime/permissionManager.ts src/lib/agent-runtime/permissionManager.test.ts
git commit -m "feat: add agent permission decisions"
```

## Task 4: Runtime Lifecycle And Event Guard

**Files:**
- Modify: `src/lib/agent-runtime/agentRuntime.ts`
- Modify if needed: `src/lib/agent-runtime/eventStream.ts`
- Test: `src/lib/agent-runtime/agentRuntime.test.ts`

- [ ] **Step 1: Write permission.resolved tests**

Assert non-auto tools emit:

```text
tool.requested
permission.required
permission.resolved
```

Assert result is structured:

```typescript
expect(result).toEqual({
  status: "blocked",
  reason: "permission_required",
});
```

Payload must include decision status and reason.

- [ ] **Step 2: Write reserved/unavailable event guard tests**

Create a read tool whose `run()` returns:

```typescript
{
  output: "ok",
  events: [{ type: "patch.applied", payload: { path: "x" } }]
}
```

Expected: runtime rejects the tool-supplied event and returns failed or records `tool.failed` with reason `reserved_agent_event:patch.applied`.

- [ ] **Step 3: Implement lifecycle path**

Runtime order:

```text
tool.requested
unsupported -> tool.failed
permission decision
prompt-required -> permission.required -> permission.resolved -> blocked
denied/unavailable/blocked-by-configuration -> permission.resolved -> blocked/failed
auto-allowed -> permission.resolved -> tool.started -> tool.output -> guarded tool events -> agent.completed
```

- [ ] **Step 4: Implement event guard**

Guard tool-supplied events against reserved/unavailable mature events:

```typescript
const TOOL_SUPPLIED_EVENT_DENYLIST: AgentEventType[] = [
  "model.delta",
  "patch.generated",
  "patch.applied",
  "agent.compacted",
];
```

If denied, emit `tool.failed` with `reserved_agent_event:<type>` and do not append that event.

- [ ] **Step 5: Run focused tests**

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/agent-runtime
```

Expected: lifecycle and guard tests pass.

- [ ] **Step 6: Commit**

```powershell
git add -- src/lib/agent-runtime/agentRuntime.ts src/lib/agent-runtime/eventStream.ts src/lib/agent-runtime/agentRuntime.test.ts
git commit -m "feat: guard agent tool lifecycle"
```

## Task 5: Workbench Glue Consumption

**Files:**
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.ts`
- Test: `src/lib/agent-workbench/workbenchTaskFlow.test.ts`

- [ ] **Step 1: Write Workbench policy-output test**

Assert `permissionRequests` for Tavily / Luogu are derived from permission decisions, not hard-coded cards:

```typescript
expect(result.permissionRequests).toEqual(
  expect.arrayContaining([
    expect.objectContaining({
      toolName: "tavily_search",
      status: "blocked",
      reason: expect.any(String),
    }),
    expect.objectContaining({
      toolName: "luogu_cookie_reader",
      status: "blocked",
      reason: expect.any(String),
    }),
  ]),
);
```

Also assert the main preview read tool defines P6 metadata fields.

- [ ] **Step 2: Implement policy consumption helper**

Replace hand-written unavailable cards with a helper that converts `AgentPermissionDecision` to `WorkbenchTaskPermissionRequest`:

```typescript
const permissionRequestFromDecision = (decision: AgentPermissionDecision): WorkbenchTaskPermissionRequest => ({
  id: `${decision.toolName}:${decision.status}`,
  toolName: decision.toolName,
  permission: decision.permission,
  status: decision.status === "auto-allowed" ? "granted" : decision.status === "prompt-required" ? "pending" : "blocked",
  reason: decision.reason,
});
```

- [ ] **Step 3: Add metadata to registered Workbench read tool**

The registered tool must include:

```typescript
inputSchema: { type: "object", required: ["url"] }
outputSchema: { type: "object", required: ["evidencePacketId", "sourceUrl"] }
exposure: "workbench-preview"
timeoutMs: 5000
lifecycle: { emits: ["tool.requested", "permission.resolved", "tool.started", "tool.output"] }
failurePolicy: { unsupported: "structured-failure", timeout: "structured-failure", permissionDenied: "blocked-result" }
```

- [ ] **Step 4: Run focused tests**

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/agent-workbench
```

Expected: Workbench tests pass and permission UI data still reflects unavailable Tavily / Luogu capability truthfully.

- [ ] **Step 5: Commit**

```powershell
git add -- src/lib/agent-workbench/workbenchTaskFlow.ts src/lib/agent-workbench/workbenchTaskFlow.test.ts
git commit -m "feat: consume permission policy in workbench"
```

## Task 6: Verification And Handoff

**Files:**
- Optional Modify: `docs/agent-workbench/handoff-p4.md`

- [ ] **Step 1: Run full P6 verification**

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/agent-runtime
.\node_modules\.bin\vitest.cmd run src/lib/agent-workbench
.\node_modules\.bin\vitest.cmd run src/lib/apiBoundary.test.ts
.\node_modules\.bin\tsc.cmd --noEmit
rg -n "@tauri-apps/api/core|\binvoke\s*\(" src --glob "!src/lib/api.ts" --glob "!src/components/ai/**" --glob "!src/lib/aiWebSearch.ts"
rg -n "AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|production-ready|ready: true|isReady: true" src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

Expected:

- Runtime and Workbench tests pass.
- API boundary audit has no hits.
- Capability claim audit has no hits.
- Filtered status includes only intended P6 files.
- Staged paths are exact and intentional.

- [ ] **Step 2: Optional handoff update**

Only if implementation is complete, append a short P6 handoff section to `docs/agent-workbench/handoff-p4.md`:

```markdown
## P6 Tool/Permission Contract Freeze handoff

P6 has frozen the Tool/Permission Contract Preview boundary. Tool definitions now carry schema, exposure, timeout, lifecycle, and failure policy metadata; registry duplicates are rejected; permission decisions are structured; runtime emits `permission.resolved`; and tool-supplied reserved/unavailable events are guarded. No real model loop, provider request, patch apply, execute, Cookie-backed reading, persistence, old AiSidebar migration, or `notes/**` change was introduced.
```

- [ ] **Step 3: Stage exact paths**

Use exact paths only:

```powershell
git add -- src/lib/agent-runtime/agentTypes.ts src/lib/agent-runtime/toolRegistry.ts src/lib/agent-runtime/permissionManager.ts src/lib/agent-runtime/agentRuntime.ts src/lib/agent-runtime/agentTypes.test.ts src/lib/agent-runtime/toolRegistry.test.ts src/lib/agent-runtime/permissionManager.test.ts src/lib/agent-runtime/agentRuntime.test.ts src/lib/agent-workbench/workbenchTaskFlow.ts src/lib/agent-workbench/workbenchTaskFlow.test.ts
```

If `docs/agent-workbench/handoff-p4.md` was updated:

```powershell
git add -- docs/agent-workbench/handoff-p4.md
```

- [ ] **Step 4: Commit**

Suggested commit:

```powershell
git commit -m "feat: freeze p6 tool permission contract"
```

For this documentation-only planning thread, use:

```powershell
git add -- docs/superpowers/specs/2026-07-05-p6-tool-permission-contract-freeze-design.md docs/superpowers/plans/2026-07-05-p6-tool-permission-contract.md
git commit -m "docs: plan p6 tool permission contract"
```

- [ ] **Step 5: Final report**

Final report must include:

```text
Verdict
commit hash
changed files
verification commands and results
filtered status
staged paths
whether pushed
```

Do not push unless explicitly requested.
