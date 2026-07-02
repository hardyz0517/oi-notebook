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
});
