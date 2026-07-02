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
      expect.objectContaining({
        id: "workspace-write:blocked",
        permission: "write",
        status: "blocked",
      }),
      expect.objectContaining({
        id: "code-execute:blocked",
        permission: "execute",
        status: "blocked",
      }),
    ]);
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

  it("keeps the Luogu cookie reader blocked when no domain-limited cookie is available", async () => {
    const result = await runWorkbenchTask({
      mode: "luogu_problem",
      problem: {
        title: "P3379 LCA",
        problemId: "P3379",
        problemUrl: "https://www.luogu.com.cn/problem/P3379",
      },
    });

    expect(result.permissionRequests).toContainEqual(expect.objectContaining({
      id: "luogu-cookie:missing",
      toolName: "luogu_cookie_reader",
      permission: "network",
      status: "blocked",
    }));
    expect(JSON.stringify(result.events)).not.toContain("cookie");
    expect(JSON.stringify(result.evidenceRecords)).not.toContain("cookie");
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
});
