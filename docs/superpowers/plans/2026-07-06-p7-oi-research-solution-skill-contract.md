# P7 OI Research / Solution Skill Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 P7 冻结为 `OI Research/Solution Skill Contract Preview`，让 OI research / solution skills 具备可测试的 task、source、evidence、solution outline、workspace projection 和 Workbench read-model contract。

**Architecture:** P7 在 P5/P6 的 Agent Core、Tool、Permission、Event preview contract 上工作。新增 skill contract 和 deterministic preview adapters，Workbench 只消费 read model，不接真实 provider/model loop/streaming/write/patch/execute/Cookie/persistence。

**Tech Stack:** TypeScript, Vitest, React Workbench view-model glue, existing `src/lib/agent-runtime/**`, `src/lib/agent-workbench/**`, `src/lib/problem-workspace/**`, `src/lib/research-engine/**`, `src/components/agent-workbench/**`.

---

## 0. 阶段边界

阶段名称：**P7 OI Research / Solution Skill Contract Freeze**

对应总 spec 层级：Workspace Contract / Web Reader Evidence / Workbench UI IA / Skill Contract Preview。

本阶段输出状态名：**OI Research/Solution Skill Contract Preview**

必须先读：

- `AGENTS.md`
- `docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md`
- `docs/superpowers/specs/2026-07-05-p5-agent-core-contract-freeze-design.md`
- `docs/superpowers/specs/2026-07-05-p6-tool-permission-contract-freeze-design.md`
- `docs/superpowers/specs/2026-07-06-p7-oi-research-solution-skill-contract-freeze-design.md`
- `docs/agent-workbench/handoff-p4.md`

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
- 不引入 persistence / storage / request log。
- 不绕过 `src/lib/api.ts`。
- 不使用 `git add .`、`git add -A`、`git commit -a`。

## File Structure

- Create: `src/lib/oi-skills/oiSkillTypes.ts`，定义通用 skill contract、OI task/source/evidence/solution outline/read-model 类型。
- Create: `src/lib/oi-skills/oiSkillTypes.test.ts`，覆盖 P7 type shape、preview status、source role、no mature capability claim。
- Create: `src/lib/oi-skills/index.ts`，导出 P7 contract。
- Modify: `src/lib/problem-workspace/problemWorkspaceTypes.ts`，扩展 preview workspace 的题面、约束、样例、evidence、solution outline 挂载字段。
- Modify: `src/lib/problem-workspace/problemWorkspaceDefaults.ts`，默认填充 P7 preview 字段。
- Modify: `src/lib/problem-workspace/problemWorkspaceStore.ts`，update 时保留 P7 preview 字段。
- Modify: `src/lib/problem-workspace/problemWorkspaceTypes.test.ts` and `src/lib/problem-workspace/problemWorkspaceStore.test.ts`，覆盖默认值和 update。
- Create: `src/lib/agent-workbench/oiSkillPreviewAdapter.ts`，将 existing evidence/workspace input 映射为 deterministic P7 read model。
- Create: `src/lib/agent-workbench/oiSkillPreviewAdapter.test.ts`，覆盖 degraded/no evidence、community-source warning、permission request mapping。
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.ts`，把 P7 read model 接进 Workbench result，不改变真实 runtime 能力。
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.test.ts`，覆盖 P7 result shape 和 no mature events。
- Modify: `src/components/agent-workbench/ProblemWorkspacePanel.tsx`，只读显示 P7 workspace projection。
- Create: `src/components/agent-workbench/OiSkillPreviewPanel.tsx`，只读显示 P7 skill read model。
- Modify: `src/components/agent-workbench/AgentWorkbenchShell.tsx`，接入 P7 panel，只消费 read model。
- Modify: `docs/agent-workbench/handoff-p4.md`，P7 closeout 时追加 handoff。

## Task 0: Baseline And Scope Audit

**Files:**
- Read-only: `docs/superpowers/specs/2026-07-06-p7-oi-research-solution-skill-contract-freeze-design.md`
- Read-only: `src/lib/agent-runtime/**`
- Read-only: `src/lib/agent-workbench/**`
- Read-only: `src/lib/problem-workspace/**`
- Read-only: `src/lib/research-engine/**`
- Read-only: `src/components/agent-workbench/**`

- [ ] **Step 1: Record current status**

Run:

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -8 --decorate
```

Expected: filtered status is empty or any existing changes are explicitly unrelated and left untouched; staged paths are empty.

- [ ] **Step 2: Confirm P7 input state**

Run:

```powershell
rg -n "P7 OI Research|OI Research/Solution Skill Contract Preview|P7 禁止做什么|退出标准" docs/superpowers/specs/2026-07-06-p7-oi-research-solution-skill-contract-freeze-design.md
rg -n "Tool/Permission Contract Preview|permission.resolved|Workbench permissionRequests" docs/agent-workbench/handoff-p4.md
```

Expected: P7 spec and P6 handoff are present.

- [ ] **Step 3: Confirm no implementation commit**

No code commit for Task 0. This is read-only evidence.

## Task 1: P7 Skill Contract Types

**Files:**
- Create: `src/lib/oi-skills/oiSkillTypes.ts`
- Create: `src/lib/oi-skills/oiSkillTypes.test.ts`
- Create: `src/lib/oi-skills/index.ts`

- [ ] **Step 1: Write failing contract tests**

Create `src/lib/oi-skills/oiSkillTypes.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import type {
  OiSkillDefinition,
  OiSkillInvocation,
  OiSkillReadModel,
  OiSolutionOutline,
} from "./oiSkillTypes";

describe("P7 OI skill contract", () => {
  it("defines research-problem as a preview skill with explicit evidence policy", () => {
    const skill = {
      skillId: "research-problem",
      label: "Research problem",
      description: "Build a cited research read model for an OI problem.",
      inputSchema: { type: "object", required: ["problemRef"] },
      outputSchema: { type: "object", required: ["status", "problemRef", "evidence"] },
      requiredPermissions: ["read", "public-network"],
      sourceRoles: ["problem-statement", "official-editorial", "community-solution", "algorithm-reference"],
      evidencePolicy: {
        minCitations: 1,
        requireSourceRoles: ["problem-statement"],
        forbidCopyingSourceText: true,
      },
      resultStatuses: ["preview", "blocked", "degraded", "unavailable", "completed"],
      failureReasons: ["insufficient-evidence", "permission-required", "source-unavailable"],
      traceEvents: ["skill.requested", "skill.evidence.mapped", "skill.completed"],
    } satisfies OiSkillDefinition;

    expect(skill.skillId).toBe("research-problem");
    expect(skill.requiredPermissions).toContain("public-network");
    expect(skill.evidencePolicy.forbidCopyingSourceText).toBe(true);
  });

  it("represents solution outline as cited preview data, not a final answer", () => {
    const outline = {
      status: "preview",
      algorithm: "Binary lifting on a rooted tree.",
      proofSketch: "Each jump halves the remaining distance to the ancestor.",
      complexity: { time: "O((n + q) log n)", memory: "O(n log n)" },
      implementationNotes: ["Precompute up[v][k] during DFS."],
      pitfalls: ["Remember to normalize depths before lifting both nodes."],
      citationIds: ["E1"],
      limitations: ["Generated from deterministic preview data only."],
    } satisfies OiSolutionOutline;

    expect(outline.status).toBe("preview");
    expect(outline.citationIds).toEqual(["E1"]);
  });

  it("requires read models to expose limitations when evidence is missing", () => {
    const invocation = {
      invocationId: "skill:research-problem:P3379",
      skillId: "research-problem",
      problemRef: { platform: "luogu", problemId: "P3379", title: "LCA" },
      mode: "preview",
    } satisfies OiSkillInvocation;

    const readModel = {
      invocation,
      status: "degraded",
      problemRef: invocation.problemRef,
      sources: [],
      evidence: [],
      solutionOutline: null,
      permissionRequests: [],
      traceEvents: [],
      limitations: ["no_evidence"],
    } satisfies OiSkillReadModel;

    expect(readModel.status).toBe("degraded");
    expect(readModel.limitations).toContain("no_evidence");
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/oi-skills/oiSkillTypes.test.ts
```

Expected: FAIL because `src/lib/oi-skills/oiSkillTypes.ts` does not exist.

- [ ] **Step 3: Add type contract**

Create `src/lib/oi-skills/oiSkillTypes.ts`:

```typescript
import type { AgentToolPermission } from "@/lib/agent-runtime/agentTypes";

export type OiSkillId =
  | "research-problem"
  | "find-notes"
  | "write-solution-outline"
  | "debug-code-preview"
  | "stress-test-preview";

export type OiSkillMode = "preview";

export type OiSkillStatus =
  | "preview"
  | "blocked"
  | "degraded"
  | "unavailable"
  | "completed"
  | "failed";

export type OiSourceRole =
  | "problem-statement"
  | "official-editorial"
  | "community-solution"
  | "discussion-warning"
  | "algorithm-reference"
  | "local-note"
  | "unknown";

export type OiSkillTraceEventType =
  | "skill.requested"
  | "skill.permission.resolved"
  | "skill.evidence.mapped"
  | "skill.outline.previewed"
  | "skill.completed"
  | "skill.failed";

export type OiProblemPlatform = "luogu" | "codeforces" | "atcoder" | "cses" | "manual" | "unknown";

export type OiProblemRef = {
  platform: OiProblemPlatform;
  problemId: string;
  title: string;
  url?: string;
};

export type OiSkillSchema = {
  type: "object";
  required: string[];
  properties?: Record<string, unknown>;
};

export type OiEvidencePolicy = {
  minCitations: number;
  requireSourceRoles: OiSourceRole[];
  forbidCopyingSourceText: boolean;
};

export type OiSkillDefinition = {
  skillId: OiSkillId;
  label: string;
  description: string;
  inputSchema: OiSkillSchema;
  outputSchema: OiSkillSchema;
  requiredPermissions: AgentToolPermission[];
  sourceRoles: OiSourceRole[];
  evidencePolicy: OiEvidencePolicy;
  resultStatuses: OiSkillStatus[];
  failureReasons: string[];
  traceEvents: OiSkillTraceEventType[];
};

export type OiSkillInvocation = {
  invocationId: string;
  skillId: OiSkillId;
  problemRef: OiProblemRef;
  mode: OiSkillMode;
};

export type OiSourceSummary = {
  sourceId: string;
  role: OiSourceRole;
  title: string;
  url?: string;
  status: "usable" | "degraded" | "unavailable";
  warning?: string;
};

export type OiEvidenceSummaryItem = {
  evidenceId: string;
  sourceId: string;
  role: OiSourceRole;
  title: string;
  excerpt: string;
  citationId: string;
  limitations: string[];
};

export type OiSolutionOutline = {
  status: "preview" | "degraded" | "unavailable";
  algorithm: string;
  proofSketch: string;
  complexity: {
    time: string;
    memory: string;
  };
  implementationNotes: string[];
  pitfalls: string[];
  citationIds: string[];
  limitations: string[];
};

export type OiSkillTraceEvent = {
  id: string;
  type: OiSkillTraceEventType;
  at: string;
  message: string;
};

export type OiSkillPermissionRequest = {
  id: string;
  toolName: string;
  permission: AgentToolPermission;
  status: "blocked" | "pending" | "granted";
  reason: string;
};

export type OiSkillReadModel = {
  invocation: OiSkillInvocation;
  status: OiSkillStatus;
  problemRef: OiProblemRef;
  sources: OiSourceSummary[];
  evidence: OiEvidenceSummaryItem[];
  solutionOutline: OiSolutionOutline | null;
  permissionRequests: OiSkillPermissionRequest[];
  traceEvents: OiSkillTraceEvent[];
  limitations: string[];
};
```

Create `src/lib/oi-skills/index.ts`:

```typescript
export type {
  OiEvidencePolicy,
  OiEvidenceSummaryItem,
  OiProblemPlatform,
  OiProblemRef,
  OiSkillDefinition,
  OiSkillId,
  OiSkillInvocation,
  OiSkillMode,
  OiSkillReadModel,
  OiSkillSchema,
  OiSkillStatus,
  OiSkillPermissionRequest,
  OiSkillTraceEvent,
  OiSkillTraceEventType,
  OiSolutionOutline,
  OiSourceRole,
  OiSourceSummary,
} from "./oiSkillTypes";
```

- [ ] **Step 4: Run GREEN**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/oi-skills/oiSkillTypes.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: tests pass and typecheck passes.

- [ ] **Step 5: Commit**

Run:

```powershell
git status --short -- . ":(exclude)notes/**"
git add -- src/lib/oi-skills/oiSkillTypes.ts src/lib/oi-skills/oiSkillTypes.test.ts src/lib/oi-skills/index.ts
git diff --cached --name-only
git commit -m "feat: define p7 oi skill contracts"
```

Expected staged paths: only the three `src/lib/oi-skills/**` files.

## Task 2: Problem Workspace Preview Extension

**Files:**
- Modify: `src/lib/problem-workspace/problemWorkspaceTypes.ts`
- Modify: `src/lib/problem-workspace/problemWorkspaceDefaults.ts`
- Modify: `src/lib/problem-workspace/problemWorkspaceStore.ts`
- Modify: `src/lib/problem-workspace/problemWorkspaceTypes.test.ts`
- Modify: `src/lib/problem-workspace/problemWorkspaceStore.test.ts`

- [ ] **Step 1: Write failing workspace tests**

Append to `src/lib/problem-workspace/problemWorkspaceTypes.test.ts`:

```typescript
  it("stores P7 problem statement and solution outline preview fields", () => {
    const workspace = createProblemWorkspace({
      problemId: "P3379",
      title: "LCA",
      statement: {
        summary: "Answer lowest common ancestor queries on a rooted tree.",
        inputFormat: "n, m, root; edges; queries.",
        outputFormat: "One LCA per query.",
        constraints: ["n <= 500000", "m <= 500000"],
      },
      sourceRoles: [
        { sourceId: "S1", role: "problem-statement", title: "Luogu P3379", status: "usable" },
      ],
      solutionOutline: {
        status: "preview",
        algorithm: "Binary lifting.",
        proofSketch: "Lift deeper node first, then lift both nodes together.",
        complexity: { time: "O((n + m) log n)", memory: "O(n log n)" },
        implementationNotes: ["DFS from root to fill depth and up table."],
        pitfalls: ["Use iterative DFS or increase stack in languages that need it."],
        citationIds: ["E1"],
        limitations: ["Preview outline only."],
      },
    });

    expect(workspace.statement?.constraints).toContain("n <= 500000");
    expect(workspace.sourceRoles[0]?.role).toBe("problem-statement");
    expect(workspace.solutionOutline?.status).toBe("preview");
  });
```

Append to `src/lib/problem-workspace/problemWorkspaceStore.test.ts`:

```typescript
  it("preserves P7 preview fields when updating unrelated workspace data", () => {
    const store = createProblemWorkspaceStore();
    const workspace = store.create({
      problemId: "P3379",
      title: "LCA",
      statement: {
        summary: "Initial summary.",
        constraints: ["tree"],
      },
      sourceRoles: [
        { sourceId: "S1", role: "algorithm-reference", title: "Binary lifting", status: "usable" },
      ],
    });

    const updated = store.update(workspace.id, { title: "LCA updated" });

    expect(updated?.title).toBe("LCA updated");
    expect(updated?.statement?.summary).toBe("Initial summary.");
    expect(updated?.sourceRoles).toHaveLength(1);
  });
```

- [ ] **Step 2: Run RED**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/problem-workspace
```

Expected: FAIL because `statement`, `sourceRoles`, and `solutionOutline` are not part of `ProblemWorkspace`.

- [ ] **Step 3: Extend workspace types**

In `src/lib/problem-workspace/problemWorkspaceTypes.ts`, import P7 types and extend the interfaces:

```typescript
import type { OiSolutionOutline, OiSourceRole } from "@/lib/oi-skills";

export type ProblemWorkspaceStatement = {
  summary: string;
  inputFormat?: string;
  outputFormat?: string;
  constraints: string[];
  samples?: Array<{
    input: string;
    output: string;
    explanation?: string;
  }>;
};

export type ProblemWorkspaceSourceRole = {
  sourceId: string;
  role: OiSourceRole;
  title: string;
  url?: string;
  status: "usable" | "degraded" | "unavailable";
};
```

Add these fields to `ProblemWorkspace`:

```typescript
  statement?: ProblemWorkspaceStatement;
  sourceRoles: ProblemWorkspaceSourceRole[];
  solutionOutline?: OiSolutionOutline;
```

Add these fields to `ProblemWorkspaceCreateInput`:

```typescript
    statement?: ProblemWorkspaceStatement;
    sourceRoles?: ProblemWorkspaceSourceRole[];
    solutionOutline?: OiSolutionOutline;
```

Ensure `ProblemWorkspaceUpdateInput` can update `statement`, `sourceRoles`, and `solutionOutline` through its existing partial shape.

- [ ] **Step 4: Fill defaults and preserve updates**

In `src/lib/problem-workspace/problemWorkspaceDefaults.ts`, add:

```typescript
    statement: input.statement,
    sourceRoles: input.sourceRoles ?? [],
    solutionOutline: input.solutionOutline,
```

In `src/lib/problem-workspace/problemWorkspaceStore.ts`, add these preserve lines inside `next`:

```typescript
        statement: patch.statement ?? current.statement,
        sourceRoles: patch.sourceRoles ?? current.sourceRoles,
        solutionOutline: patch.solutionOutline ?? current.solutionOutline,
```

- [ ] **Step 5: Run GREEN**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/problem-workspace
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: problem-workspace tests pass and typecheck passes.

- [ ] **Step 6: Commit**

Run:

```powershell
git add -- src/lib/problem-workspace/problemWorkspaceTypes.ts src/lib/problem-workspace/problemWorkspaceDefaults.ts src/lib/problem-workspace/problemWorkspaceStore.ts src/lib/problem-workspace/problemWorkspaceTypes.test.ts src/lib/problem-workspace/problemWorkspaceStore.test.ts
git diff --cached --name-only
git commit -m "feat: extend problem workspace for p7 previews"
```

Expected staged paths: only the five problem-workspace files.

## Task 3: OI Skill Preview Adapter

**Files:**
- Create: `src/lib/agent-workbench/oiSkillPreviewAdapter.ts`
- Create: `src/lib/agent-workbench/oiSkillPreviewAdapter.test.ts`
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.ts`
- Modify: `src/lib/agent-workbench/workbenchTaskFlow.test.ts`

- [ ] **Step 1: Write failing adapter tests**

Create `src/lib/agent-workbench/oiSkillPreviewAdapter.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import type { EvidenceStoreRecord } from "@/lib/research-engine";
import { createOiSkillPreviewReadModel } from "./oiSkillPreviewAdapter";

const record = {
  packetId: "packet:P3379",
  scope: "workbench",
  createdAt: new Date(0).toISOString(),
  packet: {
    packetId: "packet:P3379",
    evidenceItems: [
      {
        evidenceId: "E1",
        candidateId: "C1",
        url: "https://www.luogu.com.cn/problem/P3379",
        title: "Luogu P3379",
        host: "www.luogu.com.cn",
        sourceType: "official",
        reliability: "high",
        excerptMarkdown: "LCA problem statement excerpt.",
        readerQuality: "strong",
        evidenceStrength: "strong",
        relation: "supports",
        claimType: "oi_algorithm",
        warnings: [],
        canCite: true,
        canSupportStrongClaim: true,
        status: "usable",
      },
    ],
    status: "ready",
    evidenceSummary: {
      strongCount: 1,
      mediumCount: 0,
      weakCount: 0,
      noneCount: 0,
      supportsCount: 1,
      refutesCount: 0,
      conflictCount: 0,
      reliableSourceCount: 1,
      citeableCount: 1,
    },
    missingEvidenceReasons: [],
  },
} as EvidenceStoreRecord;

describe("createOiSkillPreviewReadModel", () => {
  it("maps evidence into a research-problem preview read model", () => {
    const model = createOiSkillPreviewReadModel({
      problem: {
        title: "LCA",
        problemId: "P3379",
        problemUrl: "https://www.luogu.com.cn/problem/P3379",
      },
      evidenceRecords: [record],
      permissionRequests: [],
    });

    expect(model.status).toBe("completed");
    expect(model.problemRef.platform).toBe("luogu");
    expect(model.evidence[0]?.citationId).toBe("E1");
    expect(model.sources[0]?.role).toBe("problem-statement");
    expect(model.solutionOutline?.status).toBe("preview");
    expect(model.solutionOutline?.citationIds).toEqual(["E1"]);
  });

  it("returns degraded read model when evidence is missing", () => {
    const model = createOiSkillPreviewReadModel({
      problem: { title: "Unknown", problemId: "manual" },
      evidenceRecords: [],
      permissionRequests: [],
    });

    expect(model.status).toBe("degraded");
    expect(model.solutionOutline).toBeNull();
    expect(model.limitations).toContain("no_evidence");
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench/oiSkillPreviewAdapter.test.ts
```

Expected: FAIL because `oiSkillPreviewAdapter.ts` does not exist.

- [ ] **Step 3: Implement deterministic adapter**

Create `src/lib/agent-workbench/oiSkillPreviewAdapter.ts`:

```typescript
import type { OiEvidenceSummaryItem, OiSkillPermissionRequest, OiSkillReadModel, OiSourceRole, OiSourceSummary } from "@/lib/oi-skills";
import type { EvidenceStoreRecord } from "@/lib/research-engine";

type CreateOiSkillPreviewReadModelInput = {
  problem: {
    title: string;
    problemId: string;
    problemUrl?: string;
  };
  evidenceRecords: EvidenceStoreRecord[];
  permissionRequests: OiSkillPermissionRequest[];
};

const platformFrom = (problemId: string, url?: string): OiSkillReadModel["problemRef"]["platform"] => {
  if (/luogu/i.test(url ?? "") || /^P\d+$/i.test(problemId)) return "luogu";
  return "manual";
};

const roleFrom = (url: string, title: string): OiSourceRole => {
  const text = `${url} ${title}`.toLowerCase();
  if (text.includes("problem")) return "problem-statement";
  if (text.includes("solution") || text.includes("editorial")) return "community-solution";
  if (text.includes("oi-wiki") || text.includes("cp-algorithms")) return "algorithm-reference";
  return "unknown";
};

export const createOiSkillPreviewReadModel = (input: CreateOiSkillPreviewReadModelInput): OiSkillReadModel => {
  const evidence = input.evidenceRecords.flatMap((record): OiEvidenceSummaryItem[] =>
    record.packet.evidenceItems
      .filter((item) => item.canCite && item.evidenceStrength !== "none")
      .map((item) => ({
        evidenceId: item.evidenceId,
        sourceId: item.candidateId,
        role: roleFrom(item.url, item.title),
        title: item.title,
        excerpt: item.excerptMarkdown,
        citationId: item.evidenceId,
        limitations: item.warnings.map(String),
      })),
  );

  const sources: OiSourceSummary[] = evidence.map((item) => ({
    sourceId: item.sourceId,
    role: item.role,
    title: item.title,
    status: item.limitations.length > 0 ? "degraded" : "usable",
    warning: item.role === "community-solution" ? "Do not copy source text into solution output." : undefined,
  }));

  const invocation = {
    invocationId: `skill:research-problem:${input.problem.problemId}`,
    skillId: "research-problem" as const,
    problemRef: {
      platform: platformFrom(input.problem.problemId, input.problem.problemUrl),
      problemId: input.problem.problemId,
      title: input.problem.title,
      url: input.problem.problemUrl,
    },
    mode: "preview" as const,
  };

  if (evidence.length === 0) {
    return {
      invocation,
      status: "degraded",
      problemRef: invocation.problemRef,
      sources,
      evidence,
      solutionOutline: null,
      permissionRequests: input.permissionRequests,
      traceEvents: [{
        id: `${invocation.invocationId}:no-evidence`,
        type: "skill.evidence.mapped",
        at: new Date(0).toISOString(),
        message: "No citeable evidence was available for the preview skill.",
      }],
      limitations: ["no_evidence"],
    };
  }

  return {
    invocation,
    status: "completed",
    problemRef: invocation.problemRef,
    sources,
    evidence,
    solutionOutline: {
      status: "preview",
      algorithm: "Evidence-backed solution outline preview is available.",
      proofSketch: "The outline is deterministic preview data and must be refined by a future model loop.",
      complexity: { time: "unknown", memory: "unknown" },
      implementationNotes: ["Use cited evidence before making solution claims."],
      pitfalls: ["Do not copy community solution wording."],
      citationIds: evidence.map((item) => item.citationId),
      limitations: ["deterministic_preview_only"],
    },
    permissionRequests: input.permissionRequests,
    traceEvents: [{
      id: `${invocation.invocationId}:evidence-mapped`,
      type: "skill.evidence.mapped",
      at: new Date(0).toISOString(),
      message: "Mapped research evidence into P7 skill preview read model.",
    }],
    limitations: ["deterministic_preview_only"],
  };
};
```

- [ ] **Step 4: Expose read model from Workbench flow**

In `src/lib/agent-workbench/workbenchTaskFlow.ts`, import:

```typescript
import type { OiSkillReadModel } from "@/lib/oi-skills";
import { createOiSkillPreviewReadModel } from "./oiSkillPreviewAdapter";
```

Add to `ManualWorkbenchTaskResult`:

```typescript
  oiSkillPreview: OiSkillReadModel;
```

Before returning result from `runManualWorkbenchTask`, create:

```typescript
  const oiSkillPreview = createOiSkillPreviewReadModel({
    problem: input.problem,
    evidenceRecords,
    permissionRequests,
  });
```

Add `oiSkillPreview` to the returned object.

In `src/lib/agent-workbench/workbenchTaskFlow.test.ts`, add an assertion to the existing successful task test:

```typescript
    expect(result.oiSkillPreview.invocation.skillId).toBe("research-problem");
    expect(result.oiSkillPreview.status).toBe("completed");
    expect(result.oiSkillPreview.solutionOutline?.status).toBe("preview");
```

- [ ] **Step 5: Run GREEN**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench/oiSkillPreviewAdapter.test.ts
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: all listed tests and typecheck pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add -- src/lib/agent-workbench/oiSkillPreviewAdapter.ts src/lib/agent-workbench/oiSkillPreviewAdapter.test.ts src/lib/agent-workbench/workbenchTaskFlow.ts src/lib/agent-workbench/workbenchTaskFlow.test.ts
git diff --cached --name-only
git commit -m "feat: add p7 oi skill preview adapter"
```

Expected staged paths: only the four agent-workbench files.

## Task 4: Workbench UI Projection

**Files:**
- Create: `src/components/agent-workbench/OiSkillPreviewPanel.tsx`
- Modify: `src/components/agent-workbench/ProblemWorkspacePanel.tsx`
- Modify: `src/components/agent-workbench/AgentWorkbenchShell.tsx`

- [ ] **Step 1: Create projection component**

Create `src/components/agent-workbench/OiSkillPreviewPanel.tsx`:

```tsx
import type { OiSkillReadModel } from "@/lib/oi-skills";

export function OiSkillPreviewPanel({ preview }: { preview: OiSkillReadModel | null }) {
  return (
    <section className="grid gap-3 border border-border/70 bg-background p-3">
      <header className="grid gap-1">
        <div className="text-xs font-medium text-foreground">OI skill preview</div>
        <div className="text-[11px] text-muted-foreground">
          {preview ? `${preview.invocation.skillId} · ${preview.status}` : "No skill preview captured."}
        </div>
      </header>
      {preview ? (
        <div className="grid gap-2 text-[11px] text-muted-foreground">
          <div>Problem: {preview.problemRef.title}</div>
          <div>Sources: {preview.sources.length}</div>
          <div>Evidence: {preview.evidence.length}</div>
          <div>Limitations: {preview.limitations.join(", ") || "none"}</div>
          {preview.solutionOutline ? (
            <div className="grid gap-1 border-t border-border/60 pt-2">
              <div className="text-foreground/80">Outline: {preview.solutionOutline.status}</div>
              <div>Algorithm: {preview.solutionOutline.algorithm}</div>
              <div>Complexity: {preview.solutionOutline.complexity.time} / {preview.solutionOutline.complexity.memory}</div>
              <div>Citations: {preview.solutionOutline.citationIds.join(", ") || "none"}</div>
            </div>
          ) : (
            <div>No solution outline preview.</div>
          )}
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 2: Extend ProblemWorkspace panel**

In `src/components/agent-workbench/ProblemWorkspacePanel.tsx`, below current counts, add:

```tsx
        <div>Sources: {workspace.sourceRoles.length}</div>
        <div>Constraints: {workspace.statement?.constraints.length ?? 0}</div>
        <div>Solution outline: {workspace.solutionOutline?.status ?? "unavailable"}</div>
```

- [ ] **Step 3: Wire panel as read-only consumer**

In `src/components/agent-workbench/AgentWorkbenchShell.tsx`, import:

```typescript
import type { OiSkillReadModel } from "@/lib/oi-skills";
import { OiSkillPreviewPanel } from "./OiSkillPreviewPanel";
```

Add a prop and state:

```typescript
  oiSkillPreview?: OiSkillReadModel | null;
```

```typescript
  const [currentOiSkillPreview, setCurrentOiSkillPreview] = useState<OiSkillReadModel | null>(oiSkillPreview ?? null);
```

After `runWorkbenchTask`, add:

```typescript
      setCurrentOiSkillPreview(result.oiSkillPreview);
```

Render the panel in the right column near evidence/permission:

```tsx
        <OiSkillPreviewPanel preview={currentOiSkillPreview} />
```

Do not add prompt construction, provider calls, direct Tauri calls, write, patch, execute, or persistence.

- [ ] **Step 4: Run focused checks**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench
node .\node_modules\typescript\bin\tsc --noEmit
rg -n 'providerId|modelId|chat_with_current_note_stream|model.delta|prompt construction|OpenAI' src/components/agent-workbench src/lib/agent-workbench
rg -n 'AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|production-ready|ready: true|isReady: true' src/components/agent-workbench src/lib/agent-workbench
```

Expected: tests/typecheck pass; the two `rg` commands return no matches.

- [ ] **Step 5: Commit**

Run:

```powershell
git add -- src/components/agent-workbench/OiSkillPreviewPanel.tsx src/components/agent-workbench/ProblemWorkspacePanel.tsx src/components/agent-workbench/AgentWorkbenchShell.tsx
git diff --cached --name-only
git commit -m "feat: project p7 oi skill preview in workbench"
```

Expected staged paths: only the three component files.

## Task 5: Boundary Audit And Handoff

**Files:**
- Modify: `docs/agent-workbench/handoff-p4.md`
- Optional modify: `src/lib/oi-skills/oiSkillTypes.test.ts` only for audit false-positive cleanup without weakening assertions

- [ ] **Step 1: Run final tests**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/oi-skills
node .\node_modules\vitest\vitest.mjs run src/lib/problem-workspace
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\vitest\vitest.mjs run src/lib/research-engine
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: all focused suites and typecheck pass.

- [ ] **Step 2: Run no-hit audits**

Run:

```powershell
rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'
rg -n 'providerId|modelId|chat_with_current_note_stream|model.delta|prompt construction|OpenAI' src/lib/agent-runtime src/lib/agent-workbench src/lib/research-engine src/components/agent-workbench
rg -n 'AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|production-ready|ready: true|isReady: true' src/lib/agent-runtime src/lib/agent-workbench src/lib/research-engine src/components/agent-workbench
rg -n 'createUnavailablePermissionStates|tavily:unavailable|luogu-cookie:missing|permission: "network"' src/lib/agent-workbench src/components/agent-workbench
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

Expected: `rg` commands are no-hit. If a test file contains a literal false positive, rewrite the assertion to build the literal at runtime, preserving the test intent.

- [ ] **Step 3: Append P7 handoff**

Append to `docs/agent-workbench/handoff-p4.md`:

```markdown
## P7 OI Research / Solution Skill Contract Freeze handoff

P7 输出状态：**OI Research/Solution Skill Contract Preview**。本阶段冻结 skill/task/source/evidence/solution read-model 和 Workbench projection，不代表真实 model loop、自动解题、patch/write/execute、Cookie-backed reader 或 persistence 可用。

P7 已冻结：

- 通用 skill contract 与 OI 特化字段。
- `research-problem` / `find-notes` / `write-solution-outline` 的 preview contract。
- ProblemWorkspace 的题面、来源、证据、solution outline preview 挂载形状。
- Workbench 只消费 P7 read model，不拥有 skill decisions。
- Permission requests 继续来自 P6 policy/runtime output。

P7 仍禁止 / 未实现：

- 真实 provider request、prompt construction、model loop、streaming。
- 真实 write、patch apply、execute、code runner、delete、rollback。
- Cookie-backed Luogu reading。
- session persistence、storage、request log。
- 旧 `src/components/ai/AiSidebar.tsx` 迁移。
- 绕过 `src/lib/api.ts` 或修改 `notes/**`。

最终验证记录：

- 逐条记录 Step 1 实际执行的命令、PASS/FAIL 结果、test file count、test count；未执行的命令不得写入本节。
- API boundary audit：no-hit。
- Provider/model/streaming audit：no-hit。
- Capability claim audit：no-hit。
- Workbench hardcoded preview drift audit：no-hit。

下一阶段必须新写 freeze spec，才能讨论真实 model loop、provider adapter、patch workflow、execute、Cookie-backed reader 或 persistence。
```

- [ ] **Step 4: Commit handoff**

Run:

```powershell
git add -- docs/agent-workbench/handoff-p4.md
git diff --cached --name-only
git commit -m "docs: record p7 oi skill contract handoff"
```

Expected staged paths: only `docs/agent-workbench/handoff-p4.md`, unless a test false-positive cleanup was required and reported.

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

Expected: main checkout is clean and includes all P7 commits.

- [ ] **Step 2: Re-run acceptance**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/oi-skills
node .\node_modules\vitest\vitest.mjs run src/lib/problem-workspace
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\typescript\bin\tsc --noEmit
rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'
rg -n 'providerId|modelId|chat_with_current_note_stream|model.delta|prompt construction|OpenAI' src/lib/agent-runtime src/lib/agent-workbench src/lib/research-engine src/components/agent-workbench
rg -n 'AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|production-ready|ready: true|isReady: true' src/lib/agent-runtime src/lib/agent-workbench src/lib/research-engine src/components/agent-workbench
```

Expected: tests/typecheck pass and `rg` audits are no-hit.

- [ ] **Step 3: Report acceptance**

Supervisor report must include:

```text
Verdict:
P7 output state:
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

- Spec coverage: Tasks cover P7 skill/task/source/evidence/read-model, ProblemWorkspace projection, deterministic adapter, Workbench projection, handoff, and final audit.
- Placeholder scan: no unfinished instruction or ambiguous worker ownership remains.
- Type consistency: `OiSkillReadModel`, `OiSolutionOutline`, `OiSourceRole`, and `OiSkillPermissionRequest` names are consistent across tasks.
- Scope control: no task opens provider/model/streaming/write/patch/execute/Cookie/persistence or old AiSidebar migration.
- Verification: each implementation slice has focused tests, typecheck, exact-path staging, and no-hit audits where relevant.
