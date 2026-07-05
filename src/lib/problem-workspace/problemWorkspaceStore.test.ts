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
});
