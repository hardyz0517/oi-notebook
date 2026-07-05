import { describe, expect, it } from "vitest";
import { runManualWorkbenchTask, runWorkbenchTask } from "./workbenchTaskFlow";

describe("runManualWorkbenchTask", () => {
  it("runs a manual URL through runtime events, workspace state, evidence, and separated caches", async () => {
    const result = await runManualWorkbenchTask({
      problem: {
        title: "Manual LCA Problem",
        problemId: "manual-lca",
        problemUrl: "https://example.com/lca",
      },
      manualSource: {
        url: "https://example.com/lca",
        title: "Lowest Common Ancestor Notes",
        text: [
          "Lowest common ancestor can be solved with binary lifting after a DFS preprocessing pass.",
          "For each vertex, up[v][k] stores the 2^k-th ancestor of v, and depths are used to lift the deeper node first.",
          "The query then lifts both nodes from high powers down until their parents match.",
        ].join("\n\n"),
      },
    });

    expect(result.workspace.evidenceIds).toEqual([result.evidenceRecords[0]?.packetId]);
    expect(result.workspace.traceEventIds.length).toBe(result.events.length);
    expect(result.events.map((event) => event.type)).toEqual([
      "agent.started",
      "tool.requested",
      "tool.started",
      "tool.output",
      "evidence.added",
      "workspace.updated",
      "agent.completed",
    ]);
    expect(result.evidenceRecords).toHaveLength(1);
    expect(result.evidenceRecords[0]?.packet.evidenceItems[0]).toMatchObject({
      url: "https://example.com/lca",
      title: "Lowest Common Ancestor Notes",
      canCite: true,
    });
    expect(result.cacheSnapshot.namespaces).toMatchObject({
      search: 1,
      read: 1,
      extract: 1,
      evidence: 1,
      workspace: 1,
    });
    expect(result.permissionRequests).toEqual([
      expect.objectContaining({
        id: "tavily:unavailable",
        permission: "network",
        status: "blocked",
      }),
      expect.objectContaining({
        id: "luogu-cookie:missing",
        permission: "network",
        status: "blocked",
      }),
    ]);
    expect(result.permissionRequests.map((request) => request.status)).toEqual(["blocked", "blocked"]);
    expect(result.permissionRequests.map((request) => request.reason).join("\n")).toContain("not configured");
    expect(result.events.map((event) => event.type)).not.toEqual(expect.arrayContaining([
      "model.delta",
      "patch.generated",
      "patch.applied",
    ]));
  });

  it("initializes a Luogu workspace for the Luogu problem mode", async () => {
    const result = await runWorkbenchTask({
      mode: "luogu_problem",
      problem: {
        title: "P3379 LCA",
        problemId: "P3379",
        problemUrl: "https://www.luogu.com.cn/problem/P3379",
      },
    });

    expect(result.workspace.source).toBe("luogu");
    expect(result.workspace.problemUrl).toBe("https://www.luogu.com.cn/problem/P3379");
    expect(result.events[0]?.type).toBe("agent.started");
  });

  it("initializes a current research workspace for the current research mode", async () => {
    const result = await runWorkbenchTask({
      mode: "current_research",
      problem: {
        title: "Current Research Task",
        problemId: "research-1",
      },
      manualSource: {
        url: "https://example.com/research",
        title: "Research Notes",
        text: "Current research task notes.",
      },
    });

    expect(result.workspace.source).toBe("manual");
    expect(result.workspace.title).toBe("Current Research Task");
    expect(result.evidenceRecords).toHaveLength(1);
  });

  it("returns the preview loop contract with unavailable mature capabilities", async () => {
    const result = await runWorkbenchTask({
      mode: "manual_url",
      problem: {
        title: "Two Sum",
        problemId: "two-sum",
        problemUrl: "https://example.test/problem",
      },
      manualSource: {
        url: "https://example.test/editorial",
        title: "Editorial",
        text: "Use hashing.",
      },
    });

    expect(result.loopContract.mode).toBe("preview_one_shot");
    expect(result.loopContract.modelStep.status).toBe("unavailable");
    expect(result.loopContract.patchApply.status).toBe("unavailable");
    expect(result.loopContract.continuation.status).toBe("reserved");
  });

  it("keeps mature capabilities unavailable in UI-facing results", async () => {
    const result = await runWorkbenchTask({
      mode: "current_research",
      problem: {
        title: "Current context",
        problemId: "current-context",
      },
    });

    expect(result.loopContract.modelStep.reason).toBe("model_loop_unavailable");
    expect(result.loopContract.patchGeneration.reason).toBe("patch_generation_unavailable");
    expect(result.loopContract.sessionPersistence.reason).toBe("session_persistence_unavailable");
  });
});
