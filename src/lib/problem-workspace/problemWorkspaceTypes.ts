import type { OiSolutionOutline, OiSourceRole } from "@/lib/oi-skills";

export type ProblemWorkspaceSource = "luogu" | "manual" | "import";
export type ProblemWorkspaceEntryMode = "manual" | "luogu" | "current_research";

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
  statement?: ProblemWorkspaceStatement;
  sourceRoles?: ProblemWorkspaceSourceRole[];
  solutionOutline?: OiSolutionOutline;
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
    statement?: ProblemWorkspaceStatement;
    sourceRoles?: ProblemWorkspaceSourceRole[];
    solutionOutline?: OiSolutionOutline;
    entryMode?: ProblemWorkspaceEntryMode;
  };

export type ProblemWorkspaceUpdateInput = Partial<
  Omit<ProblemWorkspace, "id" | "problemId" | "source">
> & {
  title?: string;
};
