import { type ProblemWorkspace } from "@/lib/problem-workspace/problemWorkspaceTypes";

export function ProblemWorkspacePanel({ workspace }: { workspace: ProblemWorkspace }) {
  return (
    <section className="grid gap-3 border border-border/70 bg-background p-3">
      <header className="grid gap-1">
        <div className="text-xs font-medium text-foreground">{workspace.title}</div>
        <div className="text-[11px] text-muted-foreground">
          {workspace.problemId} · {workspace.source}
        </div>
      </header>
      <div className="grid gap-2 text-[11px] text-muted-foreground">
        <div>Samples: {workspace.sampleInputs.length}</div>
        <div>Evidence: {workspace.evidenceIds.length}</div>
        <div>Trace events: {workspace.traceEventIds.length}</div>
      </div>
    </section>
  );
}
