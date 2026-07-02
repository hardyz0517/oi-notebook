# NoteX Agent Workbench P4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish P4 as a real Agent Workbench slice: verify the current research-engine split, land the runtime foundation, introduce a first-class Problem Workspace, and complete the web reader/search pipeline with evidence and cache plumbing.

**Architecture:** Keep UI, runtime, and research concerns separated. The runtime layer owns sessions, events, permissions, and tool dispatch; Problem Workspace owns task-local state and persisted context; research-engine owns discovery, reading, extraction, evidence, and caching. The old `AiSidebar` boundary stays intact while new surfaces consume the same underlying services.

**Tech Stack:** Tauri 2, React, TypeScript, Rust, Vitest, Cargo tests, `src/lib/api.ts`, `src/lib/apiContract.ts`, and the existing `src/lib/research-engine/*` module tree.

---

## 0. Current State And Guardrails

What is already known:

- `P4.2 Web Reader / Search` has a split skeleton in place, but the handoff says the old coupled pipeline still exists and Tavily / local reader / manual reader are not fully wired.
- `P4.0 Runtime Foundation` and `P4.1 Problem Workspace` do not yet have final verified reports.
- The old `AiSidebar` boundary must not be turned into the new runtime host.
- `notes/**` stays out of scope.

What this plan assumes:

- P4 is coordinated as three slices: runtime foundation, problem workspace, and web reader/search completion.
- Each slice can be verified on its own before the next slice is treated as real.

---

## 1. File Structure

Planned files and responsibilities:

- Create `src/lib/agent-runtime/agentTypes.ts`: shared runtime event, session, tool, and permission types.
- Create `src/lib/agent-runtime/agentSession.ts`: session state and lifecycle helpers.
- Create `src/lib/agent-runtime/toolRegistry.ts`: tool registration and lookup.
- Create `src/lib/agent-runtime/permissionManager.ts`: read / network / write / execute gating.
- Create `src/lib/agent-runtime/eventStream.ts`: typed event emission and buffering.
- Create `src/lib/agent-runtime/agentRuntime.ts`: minimal loop orchestration and tool dispatch.
- Create `src/lib/agent-runtime/*.test.ts`: runtime contract tests.

- Create `src/lib/problem-workspace/problemWorkspaceTypes.ts`: workspace model and view-state types.
- Create `src/lib/problem-workspace/problemWorkspaceStore.ts`: create / load / update helpers.
- Create `src/lib/problem-workspace/problemWorkspaceDefaults.ts`: deterministic workspace bootstrapping.
- Create `src/lib/problem-workspace/*.test.ts`: workspace model tests.

- Create or modify `src/components/agent-workbench/AgentWorkbenchShell.tsx`: top-level workbench shell.
- Create or modify `src/components/agent-workbench/ProblemWorkspacePanel.tsx`: workspace summary, sources, and task state.
- Create or modify `src/components/agent-workbench/ToolTraceViewer.tsx`: visible event trace.
- Create or modify `src/components/agent-workbench/EvidencePanel.tsx`: evidence list and citation state.
- Create or modify `src/components/agent-workbench/PermissionSurface.tsx`: explicit permission prompts.
- Modify `src/App.tsx`: workspace switching and preserved editor state.

- Modify `src/lib/research-engine/searchProvider.ts`: discovery adapter boundary.
- Modify `src/lib/research-engine/readerProvider.ts`: URL reader boundary.
- Modify `src/lib/research-engine/extractor.ts`: body extraction and normalization.
- Modify `src/lib/research-engine/evidenceStore.ts`: evidence persistence and lookup.
- Modify `src/lib/research-engine/cacheManager.ts`: cache keying and invalidation.
- Modify `src/lib/research-engine/pipelineBoundary.ts`: split orchestration from transport.
- Modify `src/lib/research-engine/index.ts`: public exports.
- Create or update `src/lib/research-engine/*.test.ts`: split and evidence tests.

- Modify `src/lib/api.ts`: runtime, workspace, and research wrappers.
- Modify `src/lib/apiContract.ts`: contract rows for new wrappers.

---

### Task 1: Re-verify The P4 Baseline

**Files:**
- Read: `docs/agent-workbench/handoff-p4.md`
- Read: `docs/NoteX_Agent_Workbench_PRD.md`
- Read: `src/lib/research-engine/index.ts`
- Read: `src/lib/research-engine/pipelineBoundary.ts`
- Read: `src/lib/research-engine/searchProvider.ts`
- Read: `src/lib/research-engine/readerProvider.ts`

- [ ] **Step 1: Confirm the current split is real, not just named**

Check that search, reader, extractor, evidence, cache, and boundary files exist and export distinct responsibilities.

- [ ] **Step 2: Write a small contract note in the plan context**

Record which parts are already decoupled and which parts still share the old pipeline.

- [ ] **Step 3: Run a targeted structural read**

Use CodeGraph or targeted file reads to confirm the symbols that the next slices must consume.

- [ ] **Step 4: Verify the baseline tests**

Run:

```powershell
pnpm.cmd vitest run src/lib/research-engine/*.test.ts
pnpm.cmd tsc --noEmit
```

Expected: the current split compiles, and any failures are now explicit rather than hidden.

- [ ] **Step 5: Commit the verification-only findings**

```powershell
git add -- src/lib/research-engine/*.test.ts src/lib/research-engine/*.ts
git commit -m "chore(research): verify p4 baseline"
```

---

### Task 2: Land The Agent Runtime Foundation

**Files:**
- Create: `src/lib/agent-runtime/agentTypes.ts`
- Create: `src/lib/agent-runtime/agentSession.ts`
- Create: `src/lib/agent-runtime/toolRegistry.ts`
- Create: `src/lib/agent-runtime/permissionManager.ts`
- Create: `src/lib/agent-runtime/eventStream.ts`
- Create: `src/lib/agent-runtime/agentRuntime.ts`
- Create: `src/lib/agent-runtime/agentTypes.test.ts`
- Create: `src/lib/agent-runtime/agentRuntime.test.ts`
- Modify: `src/lib/api.ts`
- Modify: `src/lib/apiContract.ts`

- [ ] **Step 1: Define the runtime contract**

Create the shared event and session shapes first:

```ts
export type AgentEventType =
  | "agent.started"
  | "agent.plan.created"
  | "model.delta"
  | "tool.started"
  | "tool.output"
  | "tool.failed"
  | "permission.required"
  | "evidence.added"
  | "patch.generated"
  | "patch.applied"
  | "workspace.updated"
  | "agent.completed"
  | "agent.failed";

export interface AgentEvent {
  id: string;
  type: AgentEventType;
  sessionId: string;
  at: string;
  payload: Record<string, unknown>;
}
```

- [ ] **Step 2: Write the failing runtime tests**

Cover:

```ts
expect(canAutoRunTool("read_current_file")).toBe(true);
expect(canAutoRunTool("apply_patch")).toBe(false);
expect(createAgentSession({ workspaceId: "p123" }).workspaceId).toBe("p123");
```

- [ ] **Step 3: Implement the minimal runtime loop**

Build the smallest session / tool / permission flow that can emit structured events without touching the old sidebar flow.

- [ ] **Step 4: Add API wrappers**

Expose the runtime entry points through `src/lib/api.ts` and keep all IPC calls behind the existing API boundary.

- [ ] **Step 5: Run focused verification**

Run:

```powershell
pnpm.cmd vitest run src/lib/agent-runtime/agentTypes.test.ts src/lib/agent-runtime/agentRuntime.test.ts
pnpm.cmd tsc --noEmit
```

- [ ] **Step 6: Commit**

```powershell
git add -- src/lib/agent-runtime src/lib/api.ts src/lib/apiContract.ts
git commit -m "feat(runtime): add agent runtime foundation"
```

---

### Task 3: Introduce Problem Workspace As A First-Class Model

**Files:**
- Create: `src/lib/problem-workspace/problemWorkspaceTypes.ts`
- Create: `src/lib/problem-workspace/problemWorkspaceStore.ts`
- Create: `src/lib/problem-workspace/problemWorkspaceDefaults.ts`
- Create: `src/lib/problem-workspace/problemWorkspaceTypes.test.ts`
- Create: `src/lib/problem-workspace/problemWorkspaceStore.test.ts`
- Create: `src/components/agent-workbench/ProblemWorkspacePanel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Define the workspace shape**

Model the task-local object explicitly:

```ts
export interface ProblemWorkspace {
  id: string;
  title: string;
  source: "luogu" | "manual" | "import";
  problemId: string;
  problemUrl?: string;
  currentCode?: string;
  sampleInputs: string[];
  sampleOutputs: string[];
  evidenceIds: string[];
  traceEventIds: string[];
}
```

- [ ] **Step 2: Add workspace-store tests**

Cover default creation, update, and round-trip loading.

- [ ] **Step 3: Implement workspace bootstrapping**

Add deterministic helpers so a workspace can be created from a problem id or URL without depending on AI.

- [ ] **Step 4: Build the shell panel**

Show title, source, samples, evidence links, current code pointer, and trace summary in a narrow, work-focused layout.

- [ ] **Step 5: Preserve editor state when switching surfaces**

In `src/App.tsx`, keep the editor and workbench state separate so switching away from the workbench does not wipe the current note.

- [ ] **Step 6: Run verification**

Run:

```powershell
pnpm.cmd vitest run src/lib/problem-workspace/problemWorkspaceTypes.test.ts src/lib/problem-workspace/problemWorkspaceStore.test.ts
pnpm.cmd build
```

- [ ] **Step 7: Commit**

```powershell
git add -- src/lib/problem-workspace src/components/agent-workbench/ProblemWorkspacePanel.tsx src/App.tsx
git commit -m "feat(workspace): add problem workspace model"
```

---

### Task 4: Finish The Web Reader / Search Split

**Files:**
- Modify: `src/lib/research-engine/searchProvider.ts`
- Modify: `src/lib/research-engine/readerProvider.ts`
- Modify: `src/lib/research-engine/extractor.ts`
- Modify: `src/lib/research-engine/evidenceStore.ts`
- Modify: `src/lib/research-engine/cacheManager.ts`
- Modify: `src/lib/research-engine/pipelineBoundary.ts`
- Modify: `src/lib/research-engine/index.ts`
- Create or update: `src/lib/research-engine/searchProvider.test.ts`
- Create or update: `src/lib/research-engine/readerProvider.test.ts`
- Create or update: `src/lib/research-engine/evidenceStore.test.ts`

- [ ] **Step 1: Separate discovery from reading**

Keep `searchProvider` responsible for URL discovery and `readerProvider` responsible for content fetch / normalization.

Minimal boundary:

```ts
export interface DiscoveryResult {
  title: string;
  url: string;
  snippet?: string;
  source: "bing" | "tavily" | "manual";
}

export interface ReaderResult {
  url: string;
  title: string;
  text: string;
  extractedAt: string;
}
```

- [ ] **Step 2: Make extractor and evidence storage deterministic**

Extraction should return normalized text plus stable metadata, and evidence storage should persist the exact source URL, timestamp, and trust label.

- [ ] **Step 3: Add cache keys and invalidation**

Cache search and reader results separately so repeated lookups do not re-read the same content.

- [ ] **Step 4: Add focused tests**

Cover:

```ts
expect(splitSearchAndRead("https://example.com")).toBeDefined();
expect(storeEvidence(result).sourceUrl).toBe("https://example.com");
expect(cacheKeyForUrl("https://example.com")).toContain("example.com");
```

- [ ] **Step 5: Wire public exports**

Only export the split public surface from `index.ts`; keep internal helpers unexported unless a consumer truly needs them.

- [ ] **Step 6: Run verification**

Run:

```powershell
pnpm.cmd vitest run src/lib/research-engine/searchProvider.test.ts src/lib/research-engine/readerProvider.test.ts src/lib/research-engine/evidenceStore.test.ts
pnpm.cmd vitest run src/lib/research-engine/*.test.ts
pnpm.cmd tsc --noEmit
```

- [ ] **Step 7: Commit**

```powershell
git add -- src/lib/research-engine
git commit -m "feat(research): finish reader and search split"
```

---

### Task 5: Connect Runtime, Workspace, And Research Into The Shell

**Files:**
- Create or modify: `src/components/agent-workbench/AgentWorkbenchShell.tsx`
- Create or modify: `src/components/agent-workbench/ToolTraceViewer.tsx`
- Create or modify: `src/components/agent-workbench/EvidencePanel.tsx`
- Create or modify: `src/components/agent-workbench/PermissionSurface.tsx`
- Modify: `src/App.tsx`
- Modify: `src/lib/api.ts`
- Modify: `src/lib/apiContract.ts`

- [ ] **Step 1: Assemble the shell**

Compose the workbench from the runtime event stream, workspace panel, evidence panel, and permission surface.

- [ ] **Step 2: Show tool traces as events, not logs**

The viewer should render the typed runtime events directly so the user can see what happened without reading internal debug strings.

- [ ] **Step 3: Add permission prompts**

Keep permission requests explicit and task-scoped:

```ts
export type PermissionKind = "read" | "network" | "write" | "execute";
```

- [ ] **Step 4: Preserve old AI behavior**

Do not reroute the old sidebar into this new shell. The new workbench should consume the same backend services, not replace the old surface prematurely.

- [ ] **Step 5: Run end-to-end checks**

Run:

```powershell
pnpm.cmd vitest run src/lib/agent-runtime/*.test.ts src/lib/problem-workspace/*.test.ts src/lib/research-engine/*.test.ts
pnpm.cmd tsc --noEmit
pnpm.cmd build
```

- [ ] **Step 6: Commit**

```powershell
git add -- src/components/agent-workbench src/lib/agent-runtime src/lib/problem-workspace src/lib/research-engine src/lib/api.ts src/lib/apiContract.ts src/App.tsx
git commit -m "feat(workbench): connect runtime workspace and research"
```

---

### Task 6: Smoke, Audit, And Closeout

**Files:**
- Modify docs only if the implementation diverges from this plan.

- [ ] **Step 1: Run the repo checks**

```powershell
pnpm.cmd vitest run src/lib/agent-runtime/*.test.ts src/lib/problem-workspace/*.test.ts src/lib/research-engine/*.test.ts
pnpm.cmd tsc --noEmit
pnpm.cmd build
cargo test --manifest-path .\src-tauri\Cargo.toml
```

- [ ] **Step 2: Run an API-boundary audit**

```powershell
rg -n "@tauri-apps/api/core|\binvoke\s*\(" src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'
```

Expected: no direct Rust-command calls outside the approved boundary files.

- [ ] **Step 3: Smoke the workbench flow**

Verify:

- the new workbench opens,
- a workspace can be created,
- the trace viewer shows structured events,
- evidence appears in the panel,
- switching away and back preserves state,
- no AI request is forced through the old sidebar path.

- [ ] **Step 4: Final status check**

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

- [ ] **Step 5: Close the slice**

Report the verified finish state, plus any remaining unknowns left for the next phase.

---

## Self-Review Notes

Spec coverage:

- Runtime foundation: Tasks 1, 2, 5, 6.
- Problem Workspace: Task 3 and shell wiring in Task 5.
- Reader/search split: Task 4.
- Evidence and cache plumbing: Task 4 and shell wiring in Task 5.
- Old sidebar boundary preserved: Tasks 0, 5, 6.

Sequencing notes:

- Task 1 must happen before any claim that the skeleton is "real".
- Task 2 and Task 3 can be developed in parallel once the runtime contract is fixed.
- Task 4 should not be treated as finished until search, reader, extractor, evidence, and cache each have direct tests.
- Task 5 is the first point where the slice becomes user-visible.
