import type { ProblemWorkspace, ProblemWorkspaceCreateInput } from "./problemWorkspaceTypes";

export function createProblemWorkspace(input: ProblemWorkspaceCreateInput): ProblemWorkspace {
  return {
    id: input.id ?? `workspace:${input.problemId}`,
    title: input.title,
    source: input.source ?? (input.entryMode === "luogu" ? "luogu" : "manual"),
    problemId: input.problemId,
    problemUrl: input.problemUrl,
    currentCode: input.currentCode,
    sampleInputs: input.sampleInputs ?? [],
    sampleOutputs: input.sampleOutputs ?? [],
    evidenceIds: input.evidenceIds ?? [],
    traceEventIds: input.traceEventIds ?? [],
  };
}
