import { describe, expect, it } from "vitest";

import { createProblemWorkspaceStore } from "./problemWorkspaceStore";

describe("problem workspace store", () => {
  it("creates, updates, and loads a workspace", () => {
    const store = createProblemWorkspaceStore();
    const created = store.create({
      problemId: "P1000",
      title: "A + B Problem",
    });

    const updated = store.update(created.id, {
      sampleInputs: ["1 2"],
      sampleOutputs: ["3"],
    });

    expect(updated?.sampleInputs).toEqual(["1 2"]);
    expect(updated?.sampleOutputs).toEqual(["3"]);
    expect(store.get(created.id)?.problemId).toBe("P1000");
    expect(store.list().map((workspace) => workspace.id)).toEqual(["workspace:P1000"]);
  });

  it("preserves workspace source and trace state across updates", () => {
    const store = createProblemWorkspaceStore();
    const created = store.create({
      problemId: "P3379",
      title: "LCA",
      source: "luogu",
      traceEventIds: ["event-1"],
    });

    const updated = store.update(created.id, {
      title: "LCA Notes",
      evidenceIds: ["packet-1"],
    });

    expect(updated?.source).toBe("luogu");
    expect(updated?.traceEventIds).toEqual(["event-1"]);
    expect(updated?.evidenceIds).toEqual(["packet-1"]);
  });

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

  it("updates P7 preview fields when they are explicitly patched", () => {
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

    const updated = store.update(workspace.id, {
      statement: {
        summary: "Updated summary.",
        inputFormat: "edges and queries",
        constraints: ["tree", "queries"],
      },
      sourceRoles: [
        { sourceId: "S2", role: "problem-statement", title: "Luogu P3379", status: "usable" },
      ],
      solutionOutline: {
        status: "preview",
        algorithm: "Binary lifting.",
        proofSketch: "Normalize depth and lift both nodes.",
        complexity: { time: "O((n + m) log n)", memory: "O(n log n)" },
        implementationNotes: ["Precompute ancestors."],
        pitfalls: ["Keep root depth stable."],
        citationIds: ["E1"],
        limitations: ["Preview outline only."],
      },
    });

    expect(updated?.statement?.summary).toBe("Updated summary.");
    expect(updated?.sourceRoles?.[0]?.role).toBe("problem-statement");
    expect(updated?.solutionOutline?.citationIds).toEqual(["E1"]);
  });

  it("preserves and updates P8 session replay linkage explicitly", () => {
    const store = createProblemWorkspaceStore();
    const workspace = store.create({
      problemId: "P3379",
      title: "LCA",
      sessionIds: ["session:p8"],
      replayCheckpointIds: ["checkpoint:p8:1"],
    });

    const preserved = store.update(workspace.id, { title: "LCA updated" });

    expect(preserved?.sessionIds).toEqual(["session:p8"]);
    expect(preserved?.replayCheckpointIds).toEqual(["checkpoint:p8:1"]);

    const updated = store.update(workspace.id, {
      sessionIds: ["session:p8:next"],
      replayCheckpointIds: ["checkpoint:p8:2"],
    });

    expect(updated?.sessionIds).toEqual(["session:p8:next"]);
    expect(updated?.replayCheckpointIds).toEqual(["checkpoint:p8:2"]);
  });
});
