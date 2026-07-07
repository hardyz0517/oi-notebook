import { describe, expect, it } from "vitest";

import { createProblemWorkspace } from "./problemWorkspaceDefaults";

describe("problem workspace types", () => {
  it("creates a workspace with empty sample and evidence state", () => {
    const workspace = createProblemWorkspace({
      problemId: "P1000",
      title: "A + B Problem",
    });

    expect(workspace.problemId).toBe("P1000");
    expect(workspace.title).toBe("A + B Problem");
    expect(workspace.source).toBe("manual");
    expect(workspace.sampleInputs).toEqual([]);
    expect(workspace.sampleOutputs).toEqual([]);
    expect(workspace.evidenceIds).toEqual([]);
    expect(workspace.traceEventIds).toEqual([]);
    expect(workspace.sourceRoles).toEqual([]);
  });

  it("creates a Luogu workspace when the entry mode is Luogu", () => {
    const workspace = createProblemWorkspace({
      problemId: "P3379",
      title: "LCA",
      entryMode: "luogu",
      problemUrl: "https://www.luogu.com.cn/problem/P3379",
    });

    expect(workspace.source).toBe("luogu");
    expect(workspace.problemUrl).toBe("https://www.luogu.com.cn/problem/P3379");
  });

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
    expect(workspace.sourceRoles?.[0]?.role).toBe("problem-statement");
    expect(workspace.solutionOutline?.status).toBe("preview");
  });

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
    expect(workspace.traceEventIds).toEqual(["event:1"]);
    expect(workspace.evidenceIds).toEqual(["E1"]);
  });
});
