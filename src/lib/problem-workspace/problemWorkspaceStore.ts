import { createProblemWorkspace } from "./problemWorkspaceDefaults";
import type { ProblemWorkspace, ProblemWorkspaceCreateInput, ProblemWorkspaceUpdateInput } from "./problemWorkspaceTypes";

export type ProblemWorkspaceStore = {
  create(input: ProblemWorkspaceCreateInput): ProblemWorkspace;
  get(id: string): ProblemWorkspace | undefined;
  update(id: string, patch: ProblemWorkspaceUpdateInput): ProblemWorkspace | undefined;
  list(): ProblemWorkspace[];
};

export function createProblemWorkspaceStore(): ProblemWorkspaceStore {
  const workspaces = new Map<string, ProblemWorkspace>();

  return {
    create(input: ProblemWorkspaceCreateInput): ProblemWorkspace {
      const workspace = createProblemWorkspace(input);
      workspaces.set(workspace.id, workspace);
      return workspace;
    },
    get(id: string): ProblemWorkspace | undefined {
      return workspaces.get(id);
    },
    update(id: string, patch: ProblemWorkspaceUpdateInput): ProblemWorkspace | undefined {
      const current = workspaces.get(id);
      if (!current) return undefined;
      const next: ProblemWorkspace = {
        ...current,
        ...patch,
        sampleInputs: patch.sampleInputs ?? current.sampleInputs,
        sampleOutputs: patch.sampleOutputs ?? current.sampleOutputs,
        evidenceIds: patch.evidenceIds ?? current.evidenceIds,
        traceEventIds: patch.traceEventIds ?? current.traceEventIds,
      };
      workspaces.set(id, next);
      return next;
    },
    list(): ProblemWorkspace[] {
      return Array.from(workspaces.values());
    },
  };
}
