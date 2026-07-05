export type ProblemWorkspaceSource = "luogu" | "manual" | "import";
export type ProblemWorkspaceEntryMode = "manual" | "luogu" | "current_research";

export interface ProblemWorkspace {
  id: string;
  title: string;
  source: ProblemWorkspaceSource;
  problemId: string;
  problemUrl?: string;
  currentCode?: string;
  sampleInputs: string[];
  sampleOutputs: string[];
  evidenceIds: string[];
  traceEventIds: string[];
}

export type ProblemWorkspaceCreateInput = Partial<Pick<ProblemWorkspace, "id" | "source">> &
  Pick<ProblemWorkspace, "title" | "problemId"> & {
    id?: string;
    source?: ProblemWorkspaceSource;
    problemUrl?: string;
    currentCode?: string;
    sampleInputs?: string[];
    sampleOutputs?: string[];
    evidenceIds?: string[];
    traceEventIds?: string[];
    entryMode?: ProblemWorkspaceEntryMode;
  };

export type ProblemWorkspaceUpdateInput = Partial<
  Omit<ProblemWorkspace, "id" | "problemId" | "source">
> & {
  title?: string;
};
